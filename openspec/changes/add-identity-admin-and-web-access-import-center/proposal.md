## Why

Open NoteHub is close to a complete reading product, but it still lacks two foundational pieces:

- the current authentication model is still a single shared password instead of a real user/admin system
- the main data entry path is still a technical Agent API rather than a user-facing product feature

The codebase already hints at a larger future: `users`, `agents`, and `documents.userId` already exist in the schema, but login, permissions, admin workflows, and import orchestration have not been connected. At the same time, link ingestion needs to become both a visible product feature and a reusable backend capability.

The user also explicitly wants URL fetching to become an independent `web-access` backend module. The referenced X post describes the real problem well: given a URL, the system should choose the right acquisition strategy instead of being hardwired to a single crawler.

## What Changes

- Replace the shared-password shell with a real user/admin system that is single-tenant ready but future multi-user compatible.
- Add an admin console for users, documents, agent/API key management, import jobs, retries, and debugging.
- Introduce a decoupled `web-access` module that routes URL fetches across providers based on page type and failure mode.
- Add a productized import center:
  - a simplified frontstage URL import entry
  - a full backstage import workbench with retries, previews, and trace visibility
- Introduce import-job persistence and source tracking so ingestion becomes observable and debuggable.

## Capabilities

### New Capabilities
- `identity-admin`: Real users, roles, bootstrap owner flow, admin access control, and admin management surfaces.
- `web-access`: Provider-routed URL acquisition with traceable strategy selection and normalized content output.
- `import-center`: URL import jobs, previews, retries, dedupe, and document creation workflows across frontstage and backstage entrypoints.

### Modified Capabilities
- `document-ingestion`: Agent API ingestion continues to exist but should converge on the shared ingestion path over time.

## Impact

- Affected runtime: auth/session handling, middleware, admin APIs, ingestion orchestration, background task handling.
- Affected data model: users, sessions, import jobs, import attempts, source tracking, and document ownership metadata.
- Affected UI: login flow, new admin routes, frontstage import entry, and backstage import workbench.
