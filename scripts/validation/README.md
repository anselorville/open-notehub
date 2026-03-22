# Validation Harness

These scripts validate the infrastructure beneath smart reading before feature work relies on it.

Available entrypoints:

- `npm run validate:llm`
- `npm run validate:search`
- `npm run validate:smart-translate -- --base-url http://localhost:3000`
- `npm run validate:infra -- --json`

Expected env:

- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `ANSPIRE_API_KEY`
- `AUTH_PASSWORD`
- Optional: `LLM_MODEL_FALLBACKS`, `VALIDATION_BASE_URL`, `AGENT_API_KEY`

Notes:

- `validate:smart-translate` assumes the app server is already running.
- The smoke script will reuse a `validation`-tagged document if one exists, otherwise it tries to create one through `/api/v1/documents`.
- Reports classify failures so provider/config issues are distinguishable from application regressions.
