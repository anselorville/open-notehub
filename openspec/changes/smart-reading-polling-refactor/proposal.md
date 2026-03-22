## Why

The current smart-reading implementation depends on SSE and an in-memory task registry, which makes long-running LLM jobs fragile across mobile networks, proxy timeouts, and process restarts. The new requirements in `docs/smart-reading-requirements.md` replace streaming delivery with async tasks plus polling so progress and recovery are driven by the database instead of live connections.

## What Changes

- Replace SSE-based smart-reading delivery with async background tasks plus polling.
- Add a task status API for polling a single task's persisted state and partial result.
- Update translate, summarize, and brainstorm processors to write staged progress into `smart_results`.
- Update the smart-reading page to poll status, resume running tasks, and switch between historical versions without opening a stream.
- Remove SSE-only infrastructure that is no longer needed.

## Capabilities

### New Capabilities
- `smart-reading`: Async smart-reading task lifecycle, polling APIs, staged result persistence, and version-aware frontend behavior for translate, summarize, and brainstorm modes.

### Modified Capabilities
- None.

## Impact

- Affected APIs: `POST /api/smart/[docId]/[mode]`, `GET /api/smart/[docId]/[mode]`, and new `GET /api/smart/[docId]/[mode]/[taskId]`.
- Affected runtime code: smart-reading dispatcher, processors, and the smart-reading page.
- Affected infrastructure: stale-task recovery and removal of SSE/task-registry plumbing.
