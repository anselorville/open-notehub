## ADDED Requirements

### Requirement: Web access SHALL be exposed as a decoupled backend module
The system SHALL provide a backend `web-access` module that accepts a URL request and returns normalized content and trace data without depending on the document-ingestion UI or admin pages.

#### Scenario: Business code requests normalized content
- **WHEN** a caller submits a URL to the `web-access` service
- **THEN** the service returns a normalized result contract
- **THEN** the caller does not need provider-specific fetch logic

### Requirement: Web access SHALL route by URL and retrieval context
The `web-access` module SHALL choose an acquisition strategy based on URL class, likely access mode, and previous failures instead of binding all requests to a single provider.

#### Scenario: Public article page
- **WHEN** the service receives a publicly accessible article URL
- **THEN** it may choose a lightweight public-page provider first

#### Scenario: Auth-bound page
- **WHEN** the service receives a URL that requires an existing logged-in browser session
- **THEN** it may choose a browser-session or CDP-backed provider

#### Scenario: Heavy-JS or interactive page
- **WHEN** the service receives a page that cannot be resolved through lightweight extraction
- **THEN** it may escalate to a rendered or interactive provider

### Requirement: Web access SHALL record route decisions and attempt traces
Every `web-access` execution SHALL preserve enough routing and provider trace information for backstage diagnostics and retry decisions.

#### Scenario: Provider succeeds
- **WHEN** a provider successfully returns content
- **THEN** the result includes the selected provider
- **THEN** trace information records the route that was taken

#### Scenario: Provider fails and fallback is attempted
- **WHEN** an initial provider fails
- **THEN** the system records the failure in trace data
- **THEN** subsequent fallback selection is also recorded
