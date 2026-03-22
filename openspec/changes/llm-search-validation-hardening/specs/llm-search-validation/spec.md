## ADDED Requirements

### Requirement: Infrastructure validation SHALL classify LLM and search readiness by layer
The system SHALL provide a validation mechanism that can be run independently of application development and SHALL report failures by infrastructure layer rather than only by feature failure.

#### Scenario: Configuration is missing
- **WHEN** a validation run starts without one or more required LLM or search environment variables
- **THEN** the validation output MUST mark the configuration layer as failed
- **THEN** the output MUST identify which required settings are missing
- **THEN** no dependent capability checks are reported as passed

#### Scenario: Provider access fails
- **WHEN** the configured LLM provider or search provider rejects authentication, permissions, or quota for a direct validation request
- **THEN** the validation output MUST mark the provider-access layer as failed
- **THEN** the output MUST preserve the provider status/message in a machine-readable form

### Requirement: LLM validation SHALL verify direct client capabilities
The system SHALL validate `lib/llm` directly, without relying on UI flows, for one-shot chat, streaming chat, and prompt-level capability checks used by smart reading.

#### Scenario: Basic direct LLM request succeeds
- **WHEN** the validation mechanism runs a minimal direct `chatOnce` request using the active runtime configuration
- **THEN** the run MUST report the selected provider/model
- **THEN** the run MUST mark the direct one-shot capability as passed only if a valid non-empty response is returned

#### Scenario: Streaming capability is exercised
- **WHEN** the validation mechanism runs a minimal `streamChat` request
- **THEN** the run MUST verify that at least one content delta is received or clearly report why streaming could not be validated

#### Scenario: Translation capability is probed directly
- **WHEN** the validation mechanism runs a minimal translate prompt through the LLM layer
- **THEN** the run MUST mark translate capability as failed if no usable translated text is produced

### Requirement: Search validation SHALL verify direct provider usability
The system SHALL validate `lib/search` directly with a live query and SHALL classify missing credentials, upstream rejection, timeout, and empty-result cases.

#### Scenario: Search credentials are missing
- **WHEN** `ANSPIRE_API_KEY` is not configured
- **THEN** the search validation layer MUST fail with a configuration classification

#### Scenario: Search query succeeds
- **WHEN** a live search validation query returns one or more results
- **THEN** the validation output MUST report the query as passed
- **THEN** the output MUST include result-count metadata

#### Scenario: Search provider rejects the request
- **WHEN** the search provider returns a non-success response
- **THEN** the validation output MUST mark the provider-access layer as failed
- **THEN** the failure payload MUST include the upstream status and message

### Requirement: Smart-reading smoke validation SHALL verify end-to-end translation success
The system SHALL provide an application-level smoke validation that creates a smart-reading translate task, polls it through completion, and verifies at least one successful end-to-end translation using the live provider path.

#### Scenario: End-to-end translate succeeds
- **WHEN** the smoke validation creates a translate task against a test document
- **THEN** the validation run MUST poll the smart-reading status endpoint until a terminal state is reached
- **THEN** the run MUST pass only if the task completes with `done` and non-empty translated output

#### Scenario: End-to-end translate fails because of provider configuration
- **WHEN** the smoke validation reaches an `error` state caused by an upstream provider/model access issue
- **THEN** the validation output MUST classify the run as provider/config failure rather than generic application failure

### Requirement: Provider hardening SHALL prevent inaccessible model configuration from remaining silent
The system SHALL provide a deterministic way to detect or avoid inaccessible configured models before normal feature development relies on them.

#### Scenario: Configured model is inaccessible
- **WHEN** the active model returns a provider-side permission or access error during validation
- **THEN** the system MUST report that the configured model is not usable
- **THEN** the validation output MUST indicate the model that failed

#### Scenario: Accessible runtime model is selected
- **WHEN** validation or runtime hardening identifies an accessible model configuration
- **THEN** subsequent smart-reading translation requests MUST use that validated configuration
- **THEN** at least one live translate smoke run MUST complete successfully
