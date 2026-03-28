## Context

The current application has solid reading and smart-reading surfaces, but its operational model is still minimal. Authentication is implemented as a single environment password, even though the database already contains a `users` table. Documents are mostly ingested through a Bearer-token agent endpoint, even though the product is now mature enough to expose import as a user-facing feature.

The requested next step is therefore not a small feature. It is a product-layer completion pass across three tightly related areas:

1. identity and admin
2. link import as a product flow
3. a decoupled backend `web-access` module that selects the right retrieval strategy for each URL

## Goals / Non-Goals

**Goals:**
- Ship a usable single-tenant admin system with real users and roles.
- Keep the data and permission model compatible with future multi-user expansion.
- Make URL import visible in the product, not hidden behind an agent-only API.
- Decouple URL acquisition into a reusable `web-access` backend module.
- Give admins tooling for retries, provider overrides, diagnostics, and failure visibility.

**Non-Goals:**
- Full public-signup SaaS onboarding in this change.
- Full per-user content isolation on the library homepage.
- Billing, organizations, invitation flows, or collaborative workspaces.
- Reworking the smart-reading engine beyond the integration points needed for auth/admin alignment.

## Decisions

### 1. Build single-tenant admin now, but keep the model future multi-user compatible

The first shipped experience remains effectively single-tenant from a product perspective, but users, roles, ownership metadata, and admin boundaries will be modeled as if broader multi-user support will come later.

This means:
- real `users` records
- at least `owner` and `editor` roles
- ownership/audit fields on newly written data
- a bootstrap owner flow for existing deployments

Alternative considered:
- Keep the shared password and add admin pages on top. Rejected because it preserves the very limitation this change is supposed to remove.

### 2. Frontstage import and backstage import workbench should share one ingestion pipeline

The app will expose:
- a simplified frontstage URL import entry for normal usage
- a full backstage import center for review, retries, diagnostics, and provider selection

Both entrypoints should create the same kind of import job and flow through the same ingestion service.

Alternative considered:
- Build the import UI only in admin. Rejected because the user explicitly wants ingestion to become part of the product, not remain a hidden operator-only tool.

### 3. `web-access` must be business-decoupled and provider-routed

The requested backend module is not a single scraper wrapper. It is a strategy layer that accepts a URL and returns normalized content while recording which provider/strategy it used and why.

The provider routing policy should map URL/page traits into categories such as:
- social extractor
- static/public extractor
- authenticated browser-session fetch
- interactive automation
- JS-heavy renderer
- anti-bot fallback

Alternative considered:
- Hardwire ingestion to one provider at a time. Rejected because the requirement is explicitly about choosing the right method for the URL.

### 4. Import jobs need first-class persistence

Import must not be a fire-and-forget controller call. It needs persisted job state, attempts, source metadata, preview payloads, and operator-visible traces.

Suggested persistent concepts:
- `import_jobs`
- `import_attempts`
- `document_sources`
- optional `user_sessions`

Alternative considered:
- Only log failures to stdout and directly create documents on success. Rejected because it makes retries, diagnostics, admin visibility, and provider routing evolution unnecessarily fragile.

### 5. User-facing and operator-facing errors should be separated

Frontstage import should show product-friendly statuses like `queued`, `running`, `done`, `failed`, or `needs_review`.
Backstage import should expose machine-readable error codes, trace entries, and provider details.

Alternative considered:
- Show raw provider failures everywhere. Rejected because it harms usability and leaks implementation details into the product surface.

## Risks / Trade-offs

- [Auth migration breaks current deployments] -> Add owner bootstrap and migration-aware session handling.
- [Import becomes overcomplicated too early] -> Keep the frontstage flow minimal and push complexity into backstage tools.
- [Provider routing becomes opaque] -> Persist route decisions and trace data for every attempt.
- [Future multi-user expansion still requires work] -> Accept that full isolation is out of scope, but preserve ownership metadata now to avoid architectural rewrites later.

## Migration Plan

1. Introduce the identity/admin capability and bootstrap flow.
2. Add admin routes, permissions, and core management APIs.
3. Introduce `web-access` interfaces, providers, and routing policies.
4. Add persistent import jobs/attempts/source tracking.
5. Wire a frontstage import entry and a backstage import workbench to the same import pipeline.
6. Validate via role checks, admin smoke tests, provider sample tests, and end-to-end import runs.

## Open Questions

- Whether frontstage import should auto-ingest by default for all providers or only for trusted/clean results.
- Whether agent ingestion should be moved onto the new import pipeline immediately or in a follow-up change once the pipeline stabilizes.
