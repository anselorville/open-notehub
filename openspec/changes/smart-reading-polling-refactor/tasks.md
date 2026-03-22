## 1. Backend contract

- [x] 1.1 Update smart-reading task creation and version list endpoints to match the polling-based response contract
- [x] 1.2 Add the single-task polling endpoint for `GET /api/smart/[docId]/[mode]/[taskId]`
- [x] 1.3 Keep stale-task recovery aligned with the new interrupted-task behavior

## 2. Processing pipeline

- [x] 2.1 Refactor dispatcher and task context so processors no longer depend on SSE subscribers
- [x] 2.2 Make translate mode persist ordered partial results with visible fallback on chunk failure
- [x] 2.3 Make summarize mode persist map progress and degrade gracefully on reduce failure
- [x] 2.4 Make brainstorm mode persist round progress and degrade gracefully on search or model failure

## 3. Frontend polling UX

- [x] 3.1 Replace EventSource-based smart-reading page logic with polling-driven task state
- [x] 3.2 Resume running tasks, stop on terminal states, and avoid overlapping poll requests
- [x] 3.3 Preserve history switching and mode-local state under the polling model

## 4. Cleanup and verification

- [x] 4.1 Remove or retire SSE-only runtime infrastructure that is no longer used
- [x] 4.2 Run targeted validation and browser-based smart-reading smoke checks
