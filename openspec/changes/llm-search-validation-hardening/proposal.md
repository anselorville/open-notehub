## Why

The project currently lacks a dedicated validation layer for `lib/llm` and `lib/search`, so provider misconfiguration and access issues only surface after application features fail. This is already blocking smart-reading translation, where the runtime path is implemented but the configured LLM provider/model pair cannot complete a successful request.

## What Changes

- Add a layered validation mechanism for `lib/llm` and `lib/search` that can be run independently of UI and feature flows.
- Add structured functional checks for provider configuration, direct client connectivity, prompt-level capability checks, and smart-reading end-to-end smoke tests.
- Harden LLM provider configuration so the runtime can detect or avoid inaccessible models and successfully complete at least one real translation.
- Expose validation scripts and reporting so future feature development can fail fast on infrastructure issues instead of discovering them inside application flows.

## Capabilities

### New Capabilities
- `llm-search-validation`: Layered validation and readiness checks for `lib/llm`, `lib/search`, and smart-reading infrastructure, including direct provider verification and application-level smoke tests.

### Modified Capabilities
- None.

## Impact

- Affected code: `lib/llm`, `lib/search`, smart-reading processors/dispatcher, validation scripts, and package scripts.
- Affected runtime: LLM model selection/configuration, provider connectivity, search health, and translate smoke execution.
- Affected developer workflow: application work should be preceded by infrastructure validation runs that clearly classify provider/config/code failures.
