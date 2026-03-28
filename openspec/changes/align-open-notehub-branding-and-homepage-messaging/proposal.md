## Why

The repository, runtime defaults, and UI currently describe the same product with conflicting identities. The repo is `open-notehub`, some env defaults already say `Open Note Hub`, but the application chrome, login screen, metadata, docker defaults, scripts, docs, package metadata, cookie name, and database defaults still use `LearnHub` or `learnhub`.

The library homepage also frames itself like a visual theme demo instead of a product. Copy such as "留一点白，文章自己会发光" reads like an internal design slogan, not the welcome surface of a knowledge product. As a result, the first screen under-explains what the product is for, what users can do, and why the smart-reading capability matters.

## What Changes

- Align all user-facing and project-level branding to `Open NoteHub` / `open-notehub`.
- Rewrite the library homepage hero and supporting copy so the page presents Open NoteHub as an open knowledge library and AI reading workspace.
- Keep search/browse as the homepage's primary interaction while clearly surfacing AI-assisted understanding as a core value.
- Replace theme drawer labels and descriptions with product-oriented browsing experience language.
- Rename project defaults such as package metadata, compose metadata, cookie name, and default local database path, with a compatibility path for existing local data.
- Update repository documentation and active design/plan documents so they refer to the product consistently.

## Capabilities

### New Capabilities
- `product-identity`: Canonical Open NoteHub naming across UI, metadata, docs, scripts, and runtime-facing defaults.

### Modified Capabilities
- `library-homepage`: Product-oriented homepage messaging and product-oriented library theme vocabulary.

## Impact

- Affected UI: app metadata, login screen, reader chrome, article metadata, library homepage hero, theme drawer copy.
- Affected runtime/config: package name, env examples, docker compose service/image/container/volume names, session cookie name, database defaults, migration/default-db compatibility.
- Affected docs/scripts: README, ingest script comments/temp names, and existing planning/spec documents that still describe the product as LearnHub.
