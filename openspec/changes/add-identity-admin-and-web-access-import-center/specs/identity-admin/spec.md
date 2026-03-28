## ADDED Requirements

### Requirement: The system SHALL use real user-backed authentication for operator access
Open NoteHub SHALL replace the shared environment-password login model for operator access with authentication backed by the `users` table and role-aware sessions.

#### Scenario: Login with a real user account
- **WHEN** a valid backstage user submits correct credentials
- **THEN** the system creates a valid authenticated session
- **THEN** the session carries the user's role for subsequent access checks

#### Scenario: Invalid credentials are rejected
- **WHEN** a user submits invalid credentials
- **THEN** the system returns an authentication failure
- **THEN** no session is created

### Requirement: Existing deployments SHALL have a bootstrap-owner path
The system SHALL provide a safe way to initialize the first owner account on deployments that previously used only the shared password shell.

#### Scenario: No owner exists yet
- **WHEN** the system is deployed and no `owner` user exists
- **THEN** the deployment can initialize the first owner through the bootstrap flow
- **THEN** subsequent operator login uses the normal user-backed auth path

### Requirement: Admin access SHALL be role-gated
The admin console and related APIs SHALL enforce role-based access boundaries.

#### Scenario: Owner accesses system-management features
- **WHEN** an authenticated `owner` requests user management, system settings, or agent/key management routes
- **THEN** access is allowed

#### Scenario: Editor is blocked from owner-only features
- **WHEN** an authenticated `editor` requests owner-only admin features
- **THEN** the system denies access

#### Scenario: Unauthenticated access to admin routes
- **WHEN** an unauthenticated request targets an admin page or admin API
- **THEN** the request is redirected to login or rejected with `401`, depending on route type
