## ADDED Requirements

### Requirement: Smart-reading tasks SHALL be asynchronous and database-backed
The system SHALL create smart-reading jobs as asynchronous background tasks whose persisted database row is the source of truth for state, result text, metadata, and errors.

#### Scenario: A task is created successfully
- **WHEN** a client submits `POST /api/smart/[docId]/[mode]` for a valid document and mode with no existing running task for the same document and mode
- **THEN** the system returns `201`
- **THEN** the response includes `taskId` and `version`
- **THEN** the created `smart_results` row starts in `running` status

#### Scenario: A duplicate running task is rejected
- **WHEN** a client submits `POST /api/smart/[docId]/[mode]` while another task for the same document and mode is still `running`
- **THEN** the system returns `409`
- **THEN** the response body includes `error = 'task_already_running'`
- **THEN** the response body includes the existing `taskId`

#### Scenario: Stale running work is recovered
- **WHEN** the service handles its first smart-reading API request after restart and finds `smart_results` rows still marked `running` for more than one hour
- **THEN** the system marks those rows as `interrupted`
- **THEN** later polling for those tasks reports `interrupted` instead of `running`

### Requirement: Clients SHALL poll persisted task state
The system SHALL expose a polling endpoint for a single smart-reading task and SHALL return the task's persisted status and current result payload without relying on SSE or other live connection state.

#### Scenario: Polling a running task
- **WHEN** a client requests `GET /api/smart/[docId]/[mode]/[taskId]` for an existing running task
- **THEN** the system returns `200`
- **THEN** the response includes `taskId`, `status`, `result`, `version`, `createdAt`, `completedAt`, and `error`
- **THEN** `status` is `running`
- **THEN** `result` contains the latest persisted partial output, if any

#### Scenario: Polling a completed task
- **WHEN** a client requests `GET /api/smart/[docId]/[mode]/[taskId]` for an existing completed task
- **THEN** the system returns `200`
- **THEN** `status` is `done`, `error`, or `interrupted`
- **THEN** the response includes the final persisted `result` or machine-readable `error`

#### Scenario: Polling an unknown task
- **WHEN** a client requests `GET /api/smart/[docId]/[mode]/[taskId]` for a task that does not exist for that document and mode
- **THEN** the system returns `404`

### Requirement: Smart-reading history SHALL be versioned
The system SHALL retain smart-reading results as versioned history per document and mode and SHALL let clients list recent versions without starting new tasks.

#### Scenario: Listing history
- **WHEN** a client requests `GET /api/smart/[docId]/[mode]`
- **THEN** the system returns the most recent 10 versions in descending version order
- **THEN** each item includes `taskId`, `version`, `status`, and `createdAt`

#### Scenario: A new task increments version
- **WHEN** a new smart-reading task is created for a document and mode that already has history
- **THEN** the new task uses the previous maximum version plus 1

### Requirement: Translate mode SHALL persist ordered partial results
Translate mode SHALL split content by paragraph boundaries, translate chunks with bounded concurrency, persist user-visible progress in source order, and degrade to source text for chunks that still fail after retries.

#### Scenario: Ordered partial translation is visible while running
- **WHEN** multiple translation chunks complete out of order
- **THEN** the system only appends chunk output into `smart_results.result` once all prior chunks are ready
- **THEN** polling clients observe translation progress in original document order

#### Scenario: A chunk translation fails repeatedly
- **WHEN** a translation chunk still fails after its configured retries
- **THEN** the system inserts a visible warning plus the original source content for that chunk
- **THEN** the task continues processing remaining chunks

#### Scenario: All translation chunks fail
- **WHEN** no translation chunk yields usable output
- **THEN** the task ends in `error`

### Requirement: Summarize mode SHALL provide progressive and degraded output
Summarize mode SHALL use direct reduce for short content and a map-reduce pipeline for longer content, persisting map progress and degrading to combined local summaries if reduce fails.

#### Scenario: Long-form summarize shows map progress
- **WHEN** summarize mode processes content that spans more than one chunk
- **THEN** each completed local summary is appended to the persisted `result`
- **THEN** polling clients can observe progress before reduce completes

#### Scenario: Reduce fails after map succeeds
- **WHEN** the final reduce call fails or times out after at least one local summary exists
- **THEN** the task still completes with `done`
- **THEN** the persisted `result` contains a visible degradation note and the combined local summaries

#### Scenario: More than half of map chunks fail
- **WHEN** summarize mode cannot produce local summaries for more than half of its chunks
- **THEN** the task ends in `error`

### Requirement: Brainstorm mode SHALL tolerate search and model failures where possible
Brainstorm mode SHALL compress source content, run a bounded tool-calling/search loop, persist round-by-round progress, and degrade gracefully when search is unavailable or a single round times out.

#### Scenario: Search is unavailable during brainstorm
- **WHEN** the brainstorm tool handler cannot reach the search backend
- **THEN** the task continues
- **THEN** the corresponding output includes a visible placeholder indicating search results were unavailable

#### Scenario: A brainstorm round produces incremental output
- **WHEN** a brainstorm round completes with intermediate reasoning or draft output
- **THEN** the system writes that partial content into `smart_results.result`
- **THEN** polling clients can observe progress before the final answer is ready

#### Scenario: Brainstorm produces no usable output
- **WHEN** brainstorm mode cannot produce any useful content after its bounded attempts
- **THEN** the task ends in `error`

### Requirement: The smart-reading page SHALL use polling to drive UI state
The smart-reading page SHALL use the persisted task endpoints to render empty, running, done, error, and interrupted states for each mode, resume active work, and support history switching without creating new tasks.

#### Scenario: Entering the page with a running latest version
- **WHEN** a client opens `/[docId]/smart` and the latest version for the selected mode is still `running`
- **THEN** the page automatically starts polling that task
- **THEN** the page updates the displayed content as `result` changes

#### Scenario: Switching to a historical version
- **WHEN** a client selects a non-latest version chip
- **THEN** the page fetches and displays that task's persisted result
- **THEN** the page does not create a new task

#### Scenario: Polling encounters transient network failures
- **WHEN** polling requests fail due to network errors
- **THEN** the page retries with exponential backoff starting at 2 seconds and capping at 30 seconds
- **THEN** the page avoids issuing overlapping polling requests for the same task

#### Scenario: Polling reaches a terminal task state
- **WHEN** the polled task transitions to `done`, `error`, or `interrupted`
- **THEN** the page stops polling automatically
- **THEN** the page renders the corresponding terminal UI
