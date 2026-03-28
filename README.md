# Open NoteHub

Open NoteHub is an open knowledge library and AI reading workspace. Agents can push Markdown documents via HTTP API, and you can search, read, and continue understanding them in a mobile-first web UI.

## Features

- **Agent API** — POST Markdown documents from any script or agent with a Bearer token
- **Instapaper-style reading** — Clean typography, reading progress bar, dark mode
- **Mermaid diagrams** — Rendered client-side with DOMPurify sanitization
- **Full-text search** — SQLite FTS5 for fast search across all documents
- **Tag filtering** — Organize and filter by topic tags
- **Mobile-first** — Responsive design with mobile bottom navigation
- **Single password auth** — Simple password protection, JWT sessions
- **Docker ready** — One command VPS deployment

## Quick Start (Docker)

```bash
cp .env.example .env
# Edit .env with your passwords
docker compose up -d
```

Then open http://localhost:3000

## Agent API

Push a document from any agent:

```bash
curl -X POST https://your-domain.com/api/v1/documents \
  -H "Authorization: Bearer YOUR_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Article Title",
    "content": "# Markdown content here...",
    "source_url": "https://example.com/article",
    "source_type": "blog",
    "tags": ["ai", "learning"],
    "summary": "Brief summary"
  }'
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite: `file:./open-notehub.db` or Turso: `libsql://...` |
| `AUTH_PASSWORD` | Password for the reading interface |
| `AUTH_SECRET` | JWT signing secret (32+ chars) |
| `AGENT_API_KEY` | API key for agent document ingestion |
| `NEXT_PUBLIC_SITE_TITLE` | Site title (optional, default: Open NoteHub) |

## Development

```bash
npm install
cp .env.example .env.local
# Edit .env.local
npm run db:migrate
npm run dev
```

## Browser Validation

Use the repo-local virtual environment for `browser-use` instead of a global install.

```powershell
.\.venv\Scripts\Activate.ps1
.\.venv\Scripts\browser-use.exe doctor
```

```cmd
.\.venv\Scripts\activate.bat
.\.venv\Scripts\browser-use.exe doctor
```

## Vercel Deployment

1. Create a [Turso](https://turso.tech) database
2. Set environment variables in Vercel dashboard (use `libsql://...` URL)
3. Deploy: `vercel --prod`
