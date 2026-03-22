## Context

The repository already contains a complete smart-reading feature, but it was designed around SSE, `EventSource`, and an in-process task registry. The latest requirements in `docs/smart-reading-requirements.md` explicitly replace that model with fire-and-forget background tasks whose progress is persisted to `smart_results` and read back via polling. The change spans API routes, processor behavior, frontend task state, and cold-start recovery, so it benefits from a written design before and during implementation.

## Goals / Non-Goals

**Goals:**
- Make `smart_results` the source of truth for task state and user-visible progress.
- Expose a polling-friendly status endpoint for a single task.
- Ensure all three modes produce partial persisted output when practical and degrade gracefully instead of failing eagerly.
- Let the frontend resume running work, stop polling on terminal states, and switch among history versions without creating new tasks.
- Remove SSE-only infrastructure once the polling path is complete.

**Non-Goals:**
- Adding manual cancellation, export, or configurable target language beyond the current request contract.
- Reworking unrelated article reading UI or auth flows.
- Introducing new external services beyond existing LLM/search integrations.

## Decisions

### 1. Persisted polling replaces live streaming

`smart_results.status`, `result`, `meta`, and `error` become the canonical task state. The server still launches work asynchronously with `Promise.resolve().then(processor)`, but clients no longer subscribe to an in-memory channel. This removes long-lived connection handling, catch-up semantics, and subscriber lifecycle bugs.

Alternative considered:
- Keep SSE and add stronger replay logic. Rejected because the requirements explicitly prioritize robustness over the lower perceived latency of live streaming.

### 2. A dedicated task-status endpoint serves polling

The new `GET /api/smart/[docId]/[mode]/[taskId]` endpoint returns one task's current persisted state in a polling-friendly shape. The existing list endpoint remains focused on version history and the POST endpoint remains responsible for task creation and duplicate-running detection.

Alternative considered:
- Reuse the versions endpoint and always fetch the latest list entry. Rejected because single-task polling is simpler, lighter, and avoids mixing version list semantics with incremental task state reads.

### 3. Processors write progress directly to the database

Each processor writes staged progress to `smart_results` as work advances:
- Translate writes ordered partial output and completion metadata, with per-chunk fallback when translation fails.
- Summarize appends map-phase summaries for visible progress, then overwrites with reduce output or a degraded summary.
- Brainstorm writes per-round progress and final output while treating search failures as non-fatal.

This keeps UI progress aligned with persisted state and removes dependence on process memory.

Alternative considered:
- Keep `smart_chunks` as the only translation progress source. Rejected as the primary contract because the requirements say polling clients read the staged `result`; `smart_chunks` can remain auxiliary if still useful.

### 4. Frontend polling is mode-local and overlap-safe

The smart-reading page maintains independent mode/version state, starts polling only for running tasks, waits for the previous request to finish before scheduling the next, uses exponential backoff on network failures, and stops when the selected mode becomes inactive or the page unloads. History selection loads persisted data without starting a new task.

Alternative considered:
- A page-wide global polling loop. Rejected because it complicates tab switching and makes concurrent mode state harder to reason about.

## Risks / Trade-offs

- [Long-running jobs still die on process restart] -> Mark stale `running` tasks as `interrupted` on first API access so users can explicitly restart them.
- [Frequent DB writes can increase write volume] -> Only flush meaningful staged progress, and serialize writes where ordering matters.
- [Removing SSE may feel slightly less live] -> Poll every 2 seconds and persist partial results so users still see progressive output.
- [Processor changes may introduce behavior drift] -> Keep the requirements doc as the source of truth and verify each mode through targeted API/UI testing.

## Migration Plan

1. Introduce the task-status polling endpoint and adapt POST/list responses to the new contract.
2. Refactor processors and dispatcher so progress/state are fully DB-backed.
3. Rewrite the smart-reading page to poll instead of using `EventSource`.
4. Remove or retire SSE-only runtime pieces once no code depends on them.
5. Validate through build checks and browser-based smart-reading smoke tests.

Rollback strategy:
- Revert the polling refactor commit set and restore the previous SSE route/page behavior if the new flow proves unstable before release.

## Open Questions

- Whether `smart_chunks` should remain as a secondary translation progress/debug aid or be simplified away after the polling refactor.
- Whether translation target language and cancellation should be folded into a follow-up change, since the requirements list both as known gaps rather than core acceptance criteria.
