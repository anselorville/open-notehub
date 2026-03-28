## 1. Identity and access foundation

- [x] 1.1 Replace the shared-password login path with real user-backed authentication and role-aware sessions
- [x] 1.2 Add a bootstrap-owner path so existing deployments can initialize the first admin safely
- [x] 1.3 Update middleware and server-side auth helpers to enforce owner/editor/admin access boundaries

## 2. Admin shell and management surfaces

- [x] 2.1 Add an admin app shell and route structure for overview, documents, import center, agent/key management, and users
- [x] 2.2 Add user management and password reset flows for backstage operators
- [x] 2.3 Add document management, agent/key management, and overview metrics APIs/pages

## 3. Web-access module

- [ ] 3.1 Create a decoupled `web-access` service with shared request/result types and provider interfaces
- [ ] 3.2 Add provider routing policies and trace logging for URL acquisition decisions
- [ ] 3.3 Implement an initial provider set for social URLs, public pages, browser-session/auth-bound pages, JS-heavy pages, and fallback handling

## 4. Import center and ingestion pipeline

- [ ] 4.1 Add persistent import jobs, attempts, and source-tracking tables plus the orchestration service
- [ ] 4.2 Add the backstage import workbench with retries, previews, provider override, and trace visibility
- [ ] 4.3 Add a simplified frontstage URL import entry that reuses the same ingestion pipeline
- [ ] 4.4 Add dedupe, preview, and document-creation rules so imports become observable and reviewable

## 5. Validation and rollout

- [x] 5.1 Validate owner bootstrap, user roles, and admin route protection
- [ ] 5.2 Validate representative web-access URL samples and provider routing behavior
- [ ] 5.3 Validate frontstage and backstage import flows, including retries and failed-job diagnostics
