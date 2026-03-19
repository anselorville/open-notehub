# Open-NoteHub — Copilot Instructions

## Project Overview

**Open-NoteHub** (LearnHub) is a mobile-first knowledge reading hub built with Next.js 14 (App Router). Learning agents push Markdown documents via an HTTP API; users read them in an Instapaper-style web UI with AI-powered "Smart Reading" features (translation, summarization, brainstorming).

---

## Build & Dev Commands

```bash
npm run dev          # Start dev server on :3000
npm run build        # Production build
npm run lint         # ESLint (next lint)
npm run db:migrate   # Apply Drizzle ORM migrations
npm run db:seed      # Seed database (lib/db/seed.ts)
npm run db:studio    # Open Drizzle Studio (interactive DB explorer)
```

> **No test suite** exists yet. TypeScript strict mode is enabled.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 App Router, React 18, TypeScript 5 |
| Database | SQLite / Turso (libsql), Drizzle ORM 0.29.4 |
| Auth | jose 5 (JWT HS256), bcryptjs (12 rounds), HttpOnly cookies |
| UI | Tailwind CSS 3.4, Radix UI, lucide-react |
| Markdown | react-markdown, remark-gfm, rehype-highlight, rehype-raw |
| Diagrams | mermaid 10 (client-side, DOMPurify sanitized) |
| LLM | Custom fetch-based OpenAI-compatible client (no SDK) |
| Search | Anspire API (Chinese web search) |
| Validation | Zod 3.22 |

---

## Architecture

```
app/
  (auth)/login/          # Login page (public)
  (reader)/              # Main reading UI (auth-gated)
    page.tsx             # Document list + search + tag filter
    [id]/page.tsx        # Document reader
    [id]/smart/page.tsx  # Smart Reading (translate/summarize/brainstorm)
  api/
    auth/                # Login / logout
    documents/           # CRUD, list, search (user session auth)
    smart/[docId]/[mode] # Launch + list smart tasks
    smart/stream/[taskId]# SSE stream for live task output
    v1/documents/        # Agent ingestion API (Bearer token auth)
    health/              # Public health check
lib/
  auth.ts                # JWT session helpers
  agent-auth.ts          # Timing-safe Bearer token verification
  db/schema.ts           # Drizzle schema (tables + migrations)
  db/client.ts           # LibSQL client singleton
  llm/
    client.ts            # streamChat + chatOnce (OpenAI-compatible)
    dispatcher.ts        # launchTask + recoverStaleTasks
    task-registry.ts     # In-process SSE pub/sub registry
    chunker.ts           # splitIntoChunks + pLimit
    subagent.ts          # Multi-round tool-calling loop
    prompts.ts           # All LLM system prompts (Chinese)
    processors/
      translate.ts       # Parallel chunk translation (concurrency=3)
      summarize.ts       # Map-reduce summarization (map concurrency=5)
      brainstorm.ts      # Web-search-augmented brainstorm
  search/anspire.ts      # Anspire search API client
  schemas/document.ts    # Zod schema for v1 document ingestion
components/
  DocumentCard.tsx       # List item card
  ImageViewer.tsx        # Full-screen image viewer
  MarkdownRenderer.tsx   # Markdown + Mermaid renderer
  MermaidBlock.tsx       # Client-side Mermaid renderer
  ReadingProgress.tsx    # Top reading progress bar
  TagFilter.tsx          # Tag filter sidebar/drawer
  ThemeToggle.tsx        # Dark/light mode toggle
  ui/                    # Radix-based shadcn/ui components
```

---

## Database Schema

Four tables in SQLite (with FTS5 virtual table):

- **`users`** — `id`, `email`, `passwordHash`, `role`, `createdAt`
- **`agents`** — `id`, `name`, `apiKeyHash`, `description`, `isActive`, `createdAt`
- **`documents`** — `id` (UUID), `title`, `content` (Markdown ≤1MB), `summary`, `sourceUrl`, `sourceType` ('blog'|'paper'|'social'|'video'|'other'), `tags` (JSON array), `agentId`, `userId`, `wordCount` (CJK-aware), `readCount`, `createdAt`, `updatedAt`
  - FTS: `documents_fts` virtual table, prefix wildcard queries
- **`smartResults`** — `id` (UUID = taskId), `documentId`, `mode` ('translate'|'summarize'|'brainstorm'), `version` (auto-increment per doc+mode), `status` ('running'|'done'|'error'|'interrupted'), `result` (accumulated streaming output), `meta` (JSON), `error`, `createdAt`, `completedAt`

Migrations live in `lib/db/migrations/`. Always create a new migration file via `npm run db:migrate` — never hand-edit the DB directly.

---

## Authentication

### User Auth
- Password is set via `AUTH_PASSWORD` env var; bcrypt hash cached in module scope.
- JWT signed with `AUTH_SECRET` (HS256), stored in `learnhub_session` HttpOnly cookie (7-day expiry).
- Random 200-300ms delay on auth failure to prevent timing attacks.

### Agent Auth
- `Authorization: Bearer {AGENT_API_KEY}` — compare using `crypto.timingSafeEqual` (never `===`).
- Only used by `/api/v1/*`.

### Middleware — Route Classification
- **Public:** `/login`, `/api/auth/*`, `/api/v1/*`, `/api/health`
- **Protected API:** `/api/*` → 401 JSON on invalid session
- **Protected UI:** everything else → redirect to `/login?from=...`

---

## LLM / Smart Reading System

### Task Lifecycle
```
POST /api/smart/[docId]/[mode]
  → dispatcher.launchTask()
    → creates smartResults record (status='running')
    → registerTask() in in-process registry
    → fire-and-forget processor run
  → returns { taskId }

GET /api/smart/stream/[taskId]  (SSE)
  → if live in registry → subscribe to real-time chunks
  → if done/error in DB  → replay accumulated result
```

### Key Design Constraints
- **taskId === smartResults.id** — the same UUID is used as both DB primary key and SSE URL parameter.
- Background processors must call `emitDone(ctx)` or `emitError(ctx)` to finalize the task in both the registry and DB.
- Tasks running >1h are marked 'interrupted' by `recoverStaleTasks()` (called on first POST to /api/smart).
- Do not `await` the processor — always fire-and-forget with `Promise.resolve().then(() => processor(...))`.

### Adding a New Processor Mode
1. Create `lib/llm/processors/<mode>.ts` exporting `run<Mode>(ctx, doc, options)`.
2. Add mode to `mode` enum in `lib/db/schema.ts` and create a migration.
3. Register in `dispatcher.ts` switch/case.
4. Add prompts to `lib/llm/prompts.ts` (use Chinese for system prompts).

### LLM Client Usage
```typescript
// Streaming
await streamChat({ messages, onDelta: (chunk) => ..., signal })

// One-shot (returns full text + optional tool calls)
const { content, toolCalls } = await chatOnce({ messages, tools, signal })
```
Configure via env: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.

### Chunker
```typescript
const chunks = splitIntoChunks(content, 1500) // splits at paragraph boundaries
const results = await pLimit(tasks, concurrency) // order-preserving concurrent executor
```

---

## API Conventions

- All responses use `Response` from Next.js Route Handlers (not `NextResponse`).
- Error format: `{ error: string, details?: unknown }` with appropriate HTTP status.
- Validation with Zod; return 422 on validation errors, 400 on malformed JSON.
- Guard payload size before full parsing (`request.headers.get('content-length')`).
- Async side-effects (read count increment) use fire-and-forget — wrap in `void db.update(...)`.
- Do not throw from route handlers — catch all errors and return structured JSON.

---

## Frontend Conventions

- Use `'use client'` only when needed (interactivity, hooks). Prefer server components.
- Tailwind classes only — no inline styles, no CSS modules.
- `cn()` from `lib/utils.ts` for conditional class merging (`clsx` + `tailwind-merge`).
- Dark mode via `dark:` Tailwind variants (class-based, controlled by ThemeToggle).
- `ReadingProgress` uses a ref + scroll event listener — remember to clean up in `useEffect`.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | `file:./learnhub.db` (local) or `libsql://...` (Turso) |
| `DATABASE_AUTH_TOKEN` | Turso only | Turso auth token |
| `AUTH_PASSWORD` | Yes | Password for the reading UI |
| `AUTH_SECRET` | Yes | JWT signing secret (32+ chars) |
| `AGENT_API_KEY` | Yes | Bearer token for agent document ingestion |
| `LLM_BASE_URL` | Smart features | OpenAI-compatible base URL |
| `LLM_API_KEY` | Smart features | LLM API key |
| `LLM_MODEL` | Smart features | Model name (e.g. `gpt-4o`) |
| `ANSPIRE_API_KEY` | Brainstorm | Anspire Chinese web search API key |
| `NEXT_PUBLIC_SITE_TITLE` | No | Site title override (default: LearnHub) |

Copy `.env.example` → `.env.local` for local dev, `.env` for Docker.

---

## Common Pitfalls

- **FTS queries** use prefix wildcards: append `*` to the search term when querying `documents_fts`. Plain `MATCH 'term'` won't match partial words.
- **Tags** are stored as a JSON string in SQLite. Use `json_each(tags)` for tag filtering; parse with `JSON.parse()` when reading.
- **Word count** uses a CJK-aware algorithm (lib/db/schema.ts area) — do not use `.split(' ').length`.
- **SSE headers** must include `X-Accel-Buffering: no` to prevent nginx from buffering the stream.
- **Stale tasks** after server restart: the in-process registry is lost on restart. `recoverStaleTasks()` must be called to clean up DB records.
- **bcrypt hash** of `AUTH_PASSWORD` is cached in module scope in `lib/auth.ts` — changing the env var requires a process restart.
- **timingSafeEqual** requires both buffers to be the same byte length; pad or hash before comparing if lengths differ.
