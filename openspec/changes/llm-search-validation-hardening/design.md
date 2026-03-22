## Context

`lib/llm` currently provides a thin OpenAI-compatible client and several smart-reading processors. `lib/search` contains a thin Anspire wrapper. Neither layer has a first-class validation harness, so failures in configuration, permissions, provider access, streaming behavior, tool calls, or search availability only become visible when app features break. Recent runtime checks already showed that the configured model (`glm-5`) can return a provider-side permission error, which prevents translate from succeeding even though the polling refactor and task lifecycle are functioning.

## Goals / Non-Goals

**Goals:**
- Add a reusable validation entrypoint for `lib/llm` and `lib/search`.
- Split validation into layers so failures are classified as config, provider access, search access, capability regression, or app-path regression.
- Make the real provider path robust enough to complete at least one actual translation with current project credentials.
- Keep the validation tooling runnable from the local workspace and suitable for future CI use.

**Non-Goals:**
- Replacing the current provider ecosystem entirely.
- Building a full generic test framework for every application module.
- Solving unrelated UI or document ingestion issues outside of LLM/search readiness.

## Decisions

### 1. Add script-driven infrastructure validation instead of test-only coverage

The project currently has no test runner or validation scripts. The most pragmatic path is to add `tsx`-based validation scripts with structured JSON/text output and npm script entrypoints. This keeps adoption low-friction and works both locally and in CI later.

Alternative considered:
- Introduce a full unit-test framework first. Rejected because the immediate need is provider and integration readiness, not broad unit-test coverage.

### 2. Validate in four layers

The validation mechanism will check:
- Environment/config readiness
- Direct provider connectivity (`chatOnce`, `streamChat`, search query)
- Capability-level checks (translate, summarize, brainstorm/tool-call smoke)
- Application smoke checks (smart-reading task creation, polling, and successful terminal result)

This layering makes provider failures obvious before feature code is blamed.

Alternative considered:
- Only run end-to-end smart-reading tests. Rejected because it obscures the real source of failure and gives poor diagnostics.

### 3. Separate provider probing from normal feature execution

The runtime should gain a small, explicit model/provider readiness helper rather than relying on the first user request to discover access problems. Validation scripts can probe candidate models or direct health calls, and the app runtime can use the chosen/validated model configuration.

Alternative considered:
- Leave runtime untouched and only document the right env vars. Rejected because the current failure mode proves documentation alone is not enough.

### 4. Keep real-provider success as an acceptance criterion

Mock or dry-run validation is useful but insufficient here. The change is not complete unless at least one live translate request succeeds with the configured provider path and the result is visible through the smart-reading APIs.

Alternative considered:
- Stop after stable mock validation. Rejected because it would leave the main operational problem unresolved.

## Risks / Trade-offs

- [Provider quotas/permissions can still change outside the codebase] → Validation must classify provider-side failures clearly and fail fast before app work continues.
- [Validation scripts may require secrets locally and in CI] → Keep secret usage env-driven and report missing configuration explicitly without leaking values.
- [Smoke tests can mutate local DB state] → Use isolated validation records or predictable cleanup where practical.
- [Model fallback can hide configuration drift if done silently] → Surface the selected model and provider diagnostics in validation output.

## Migration Plan

1. Create a dedicated OpenSpec-backed validation change and task plan.
2. Add validation utilities/scripts for config, LLM, search, and smart-reading smoke flows.
3. Harden model/provider selection or fallback so the runtime can use an accessible model.
4. Run the validation suite and confirm one real translation succeeds end-to-end.
5. Document the validation entrypoints in project scripts/output for future development use.

## Open Questions

- Whether model fallback should be automatic in app runtime or only selected by validation tooling and env configuration.
- Whether search validation should remain single-provider specific or be abstracted now for future multi-provider support.
