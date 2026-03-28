## ADDED Requirements

### Requirement: URL import SHALL be a productized workflow
The system SHALL expose URL import as a visible product workflow instead of leaving document ingestion only as an agent-facing API.

#### Scenario: Frontstage import entry
- **WHEN** a user submits a valid URL from the product-facing import entry
- **THEN** the system creates an import job
- **THEN** the user can observe product-friendly job status until completion

#### Scenario: Backstage import workbench
- **WHEN** an admin opens the backstage import center
- **THEN** they can inspect import jobs, failures, previews, retries, and diagnostic traces

### Requirement: Import execution SHALL be persisted and observable
The system SHALL persist import jobs and attempts so operators can inspect, retry, and audit ingestion behavior.

#### Scenario: A new import is created
- **WHEN** an import starts
- **THEN** the system stores an `import_job` with submitted URL, status, submitter, and timestamps

#### Scenario: An import is retried
- **WHEN** an operator retries a failed job
- **THEN** the system creates a new import attempt linked to the same job
- **THEN** the retry path remains auditable

### Requirement: Import results SHALL support preview, dedupe, and source tracking
The import pipeline SHALL normalize fetched content, check for likely duplicates, and persist source metadata when a document is created.

#### Scenario: Import produces usable content
- **WHEN** the pipeline extracts usable article content
- **THEN** it produces a preview payload
- **THEN** it may auto-create or confirm-create a document
- **THEN** the original and normalized source metadata are persisted

#### Scenario: Import needs manual review
- **WHEN** the import result is incomplete, ambiguous, or low-confidence
- **THEN** the job may transition to `needs_review`
- **THEN** the backstage workbench can inspect and decide the next action

### Requirement: Frontstage and backstage import SHALL share one ingestion pipeline
The product-facing URL import entry and the backstage import center SHALL reuse the same orchestration path for job creation, web access, preview generation, and document creation.

#### Scenario: Same URL submitted from different entrypoints
- **WHEN** a URL is submitted from the frontstage entry or the backstage workbench
- **THEN** both flows create the same kind of persisted import job
- **THEN** both flows use the shared ingestion service rather than separate business logic
