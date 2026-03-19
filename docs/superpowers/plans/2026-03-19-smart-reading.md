# 智读 (Smart Reading) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/[id]/smart` route that lets users translate, summarize, or brainstorm on any article using LLM streaming — with DB-backed versioning, task lifecycle decoupled from HTTP connections, and mobile-first UI matching the existing reader aesthetic.

**Architecture:** HTTP POST creates a background LLM task (process-level registry + per-chunk DB flush); SSE GET streams results back. All three modes (translate/summarize/brainstorm) share the same task/stream infrastructure but use different processing chains. Frontend is a single Client Component at `/[id]/smart/page.tsx` that handles all state transitions.

**Tech Stack:** Next.js 14 App Router, TypeScript, drizzle-orm + @libsql/client (SQLite), fetch-based OpenAI-compatible streaming, SSE via ReadableStream, Anspire search API, existing MarkdownRenderer + Tailwind + lucide-react.

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `lib/db/migrations/0002_smart_results.sql` | DDL for smart_results table |
| `lib/search/anspire.ts` | Anspire search API wrapper |
| `lib/llm/client.ts` | OpenAI-compatible streaming fetch |
| `lib/llm/chunker.ts` | Split markdown by paragraph boundaries |
| `lib/llm/prompts.ts` | Prompt templates for all three modes |
| `lib/llm/task-registry.ts` | In-process Map: taskId → accumulated + subscriber Set |
| `lib/llm/subagent.ts` | Generic tool-calling loop (business-logic-free) |
| `lib/llm/processors/translate.ts` | Chunked parallel translation chain |
| `lib/llm/processors/summarize.ts` | Map-reduce summarization chain |
| `lib/llm/processors/brainstorm.ts` | Sub-agent brainstorm chain with search |
| `app/api/smart/[docId]/[mode]/route.ts` | POST (start task) + GET (version list) |
| `app/api/smart/stream/[taskId]/route.ts` | GET SSE stream |
| `app/(reader)/[id]/smart/page.tsx` | Smart reading page (Client Component) |

### Modified files
| File | Change |
|------|--------|
| `lib/db/schema.ts` | Add `smartResults` table definition |
| `lib/db/client.ts` | Re-export `smartResults` from schema |
| `app/(reader)/[id]/page.tsx` | Add 「智读」button in article header |
| `app/(reader)/layout.tsx` | Add 「智读」item to mobile bottom nav |
| `Dockerfile` | Apply migration 0002 in CMD |

---

## Chunk 1: DB + Infrastructure

### Task 1: DB Migration — smart_results table

**Files:**
- Create: `lib/db/migrations/0002_smart_results.sql`
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/client.ts`

- [ ] **Step 1.1: Create migration SQL file**

Create `lib/db/migrations/0002_smart_results.sql`:

```sql
CREATE TABLE IF NOT EXISTS smart_results (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL,
  version      INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'running',
  result       TEXT,
  meta         TEXT,
  error        TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  UNIQUE(document_id, mode, version)
);
CREATE INDEX IF NOT EXISTS smart_results_doc_mode_version_idx
  ON smart_results(document_id, mode, version);
CREATE INDEX IF NOT EXISTS smart_results_status_idx
  ON smart_results(status);
-- Note: SQLite doesn't support DESC in CREATE INDEX; query uses ORDER BY version DESC which SQLite handles efficiently
```

- [ ] **Step 1.2: Add smartResults to Drizzle schema**

In `lib/db/schema.ts`, append after the documents table:

```typescript
export const smartResults = sqliteTable('smart_results', {
  id:          text('id').primaryKey(),
  documentId:  text('document_id').notNull().references(() => documents.id),
  mode:        text('mode').notNull(),       // 'translate' | 'summarize' | 'brainstorm'
  version:     integer('version').notNull(),
  status:      text('status').notNull().default('running'), // 'running'|'done'|'error'|'interrupted'
  result:      text('result'),
  meta:        text('meta'),                 // JSON string
  error:       text('error'),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull()
                 .default(sql`(unixepoch())`),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
}, (t) => ({
  docModeIdx:  index('smart_results_doc_mode_version_idx').on(t.documentId, t.mode, t.version),
  statusIdx:   index('smart_results_status_idx').on(t.status),
}))

export type SmartResult = typeof smartResults.$inferSelect
export type NewSmartResult = typeof smartResults.$inferInsert
```

- [ ] **Step 1.3: Re-export from db/client.ts**

In `lib/db/client.ts`, confirm `schema` export includes `smartResults`. Open the file and check how schema is assembled — if it does `export * from './schema'` or re-exports, nothing to change. If it manually lists tables, add `smartResults`. Typical pattern in this codebase:

```typescript
// lib/db/client.ts — add to schema object if needed:
import { users, agents, documents, smartResults } from './schema'
export const schema = { users, agents, documents, smartResults }
```

- [ ] **Step 1.4: Update Dockerfile CMD to apply migration 0002**

In `Dockerfile`, the CMD already loops over `lib/db/migrations/*.sql` — since the new file is named `0002_smart_results.sql` it will be picked up automatically by the glob. No change needed, but verify the glob covers it:

```dockerfile
# Verify CMD looks like:
CMD ["sh", "-c", "DB=${DATABASE_URL#file:} && for f in lib/db/migrations/*.sql; do sqlite3 \"$DB\" < \"$f\" 2>/dev/null || true; done && node server.js"]
```

- [ ] **Step 1.5: Commit**

```bash
cd /path/to/learnhub
git add lib/db/migrations/0002_smart_results.sql lib/db/schema.ts lib/db/client.ts
git commit -m "feat: add smart_results table migration and schema"
```

---

### Task 2: Anspire Search Wrapper

**Files:**
- Create: `lib/search/anspire.ts`

- [ ] **Step 2.1: Create `lib/search/anspire.ts`**

```typescript
// lib/search/anspire.ts
// Thin wrapper around Anspire search API. No business logic.

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

interface AnspireItem {
  title?: string
  url?: string
  snippet?: string
  [key: string]: unknown
}

/**
 * Search the web via Anspire API.
 * Returns up to topK results. Throws on network/API failure.
 */
export async function search(query: string, topK = 5): Promise<SearchResult[]> {
  const apiKey = process.env.ANSPIRE_API_KEY
  if (!apiKey) throw new Error('ANSPIRE_API_KEY not configured')

  const url = new URL('https://plugin.anspire.cn/api/ntsearch/search')
  url.searchParams.set('query', query)
  url.searchParams.set('top_k', String(topK))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    throw new Error(`Anspire search failed: ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as { results?: AnspireItem[] } | AnspireItem[]
  const items: AnspireItem[] = Array.isArray(data) ? data : (data.results ?? [])

  return items.slice(0, topK).map(item => ({
    title:   String(item.title ?? ''),
    url:     String(item.url ?? ''),
    snippet: String(item.snippet ?? ''),
  }))
}
```

- [ ] **Step 2.2: Commit**

```bash
git add lib/search/anspire.ts
git commit -m "feat: add Anspire search wrapper"
```

---

### Task 3: LLM Client (streaming fetch)

**Files:**
- Create: `lib/llm/client.ts`

- [ ] **Step 3.1: Create `lib/llm/client.ts`**

This module wraps the OpenAI-compatible streaming API. It exposes two functions:
- `streamChat`: streams delta text via an `onDelta` callback
- `chatOnce`: one-shot (no streaming), returns full text

```typescript
// lib/llm/client.ts
// OpenAI-compatible LLM client. Uses fetch (no openai SDK needed).
// Supports streaming (SSE) and one-shot completion.

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface Tool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface StreamOptions {
  messages: Message[]
  tools?: Tool[]
  onDelta: (chunk: string) => void
  onToolCalls?: (calls: ToolCall[]) => void
  maxTokens?: number
  signal?: AbortSignal
}

interface ChatOnceOptions {
  messages: Message[]
  tools?: Tool[]
  maxTokens?: number
  signal?: AbortSignal
}

interface ChatOnceResult {
  content: string
  toolCalls?: ToolCall[]
}

function getConfig() {
  const baseUrl = process.env.LLM_BASE_URL
  const apiKey  = process.env.LLM_API_KEY
  const model   = process.env.LLM_MODEL
  if (!baseUrl || !apiKey || !model) {
    throw new Error('LLM_BASE_URL, LLM_API_KEY, LLM_MODEL must be set')
  }
  return { baseUrl, apiKey, model }
}

/**
 * Stream a chat completion. Calls onDelta for each text chunk.
 * Calls onToolCalls if the model returns tool calls (non-streaming fallback).
 */
export async function streamChat(opts: StreamOptions): Promise<void> {
  const { baseUrl, apiKey, model } = getConfig()
  const { messages, tools, onDelta, onToolCalls, maxTokens = 4000, signal } = opts

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    max_tokens: maxTokens,
  }
  if (tools?.length) body.tools = tools

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`LLM API error: ${res.status} ${text.slice(0, 200)}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  const collectedToolCalls: Map<number, ToolCall> = new Map()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta
        if (!delta) continue

        if (delta.content) {
          onDelta(delta.content)
        }

        // Collect streaming tool calls (fragmented across chunks)
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!collectedToolCalls.has(idx)) {
              collectedToolCalls.set(idx, { id: '', type: 'function', function: { name: '', arguments: '' } })
            }
            const existing = collectedToolCalls.get(idx)!
            // id only appears in the first chunk — set if not already set (never overwrite)
            if (tc.id && !existing.id) existing.id = tc.id
            // name and arguments are concatenated across chunks
            if (tc.function?.name) existing.function.name += tc.function.name
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
          }
        }
      } catch {
        // Ignore parse errors on individual SSE lines
      }
    }
  }

  if (collectedToolCalls.size > 0 && onToolCalls) {
    onToolCalls([...collectedToolCalls.values()])
  }
}

/**
 * One-shot (non-streaming) chat. Returns full content and optional tool calls.
 */
export async function chatOnce(opts: ChatOnceOptions): Promise<ChatOnceResult> {
  const { baseUrl, apiKey, model } = getConfig()
  const { messages, tools, maxTokens = 2000, signal } = opts

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    max_tokens: maxTokens,
  }
  if (tools?.length) body.tools = tools

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`LLM API error: ${res.status} ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  const choice = data.choices?.[0]
  return {
    content:   choice?.message?.content ?? '',
    toolCalls: choice?.message?.tool_calls,
  }
}
```

- [ ] **Step 3.2: Commit**

```bash
git add lib/llm/client.ts
git commit -m "feat: add OpenAI-compatible LLM streaming client"
```

---

### Task 4: Chunker

**Files:**
- Create: `lib/llm/chunker.ts`

- [ ] **Step 4.1: Create `lib/llm/chunker.ts`**

```typescript
// lib/llm/chunker.ts
// Splits markdown text into chunks at paragraph boundaries.
// Never splits mid-paragraph. Chunks stay ≤ maxChars.

/**
 * Split content into chunks of at most maxChars characters.
 * Splits at blank-line boundaries (paragraph separators).
 * If a single paragraph exceeds maxChars, it becomes its own chunk.
 */
export function splitIntoChunks(content: string, maxChars = 1500): string[] {
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Split on double newlines (paragraph boundaries)
  const paragraphs = normalized.split(/\n\n+/)

  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    const candidate = current ? current + '\n\n' + trimmed : trimmed

    if (candidate.length <= maxChars) {
      current = candidate
    } else {
      // Flush current chunk
      if (current) chunks.push(current)
      // If this single paragraph is oversized, push as its own chunk
      current = trimmed
    }
  }

  if (current) chunks.push(current)
  return chunks
}

/**
 * Run async tasks with a concurrency limit.
 */
export async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let index = 0

  async function worker() {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  await Promise.all(workers)
  return results
}
```

- [ ] **Step 4.2: Commit**

```bash
git add lib/llm/chunker.ts
git commit -m "feat: add paragraph-boundary chunker with concurrency helper"
```

---

### Task 5: Prompts

**Files:**
- Create: `lib/llm/prompts.ts`

- [ ] **Step 5.1: Create `lib/llm/prompts.ts`**

```typescript
// lib/llm/prompts.ts
// All prompt templates for the three smart reading modes.

export const TRANSLATE_CHUNK_SYSTEM = (targetLang: string) => `\
你是专业翻译。将以下内容准确翻译成${targetLang}，保持原文结构、Markdown 格式和技术术语准确性，不省略任何内容，不添加解释。`

export const SUMMARIZE_MAP_SYSTEM = `\
请对以下文章片段提取核心信息，200字以内，保持关键数据和论点。`

export const SUMMARIZE_REDUCE_SYSTEM = `\
以下是一篇文章各部分的摘要。请综合生成结构化最终摘要，使用以下格式：

## 核心主题
（1-2句话概括）

## 主要论点
（3-5条，每条50字以内）

## 关键结论

## 值得关注的细节`

export const BRAINSTORM_SYSTEM = `\
你是一位深度思考者和跨领域分析师。你有能力搜索互联网获取最新资料。

请基于提供的文章内容进行深度思考，输出以下结构：

## 核心洞见
（2-3个基于文章的深刻见解）

## 延伸预测
（基于当前趋势的3-5个预测，需说明推理链）

## 反向思考
（对文章主要观点的挑战、补充或盲点）

## 相关领域联想
（与其他领域的类比、启发）

## 搜索参考
（列出你使用的搜索查询及关键发现）

在分析时，你可以主动使用 search 工具查询相关资料，每次查询应针对具体问题。`

export const BRAINSTORM_SEARCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search',
    description: '搜索互联网获取最新信息、数据和观点',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索查询词，应简洁具体',
        },
      },
      required: ['query'],
    },
  },
}
```

- [ ] **Step 5.2: Commit**

```bash
git add lib/llm/prompts.ts
git commit -m "feat: add LLM prompt templates for translate/summarize/brainstorm"
```

---

## Chunk 2: Task Registry + Processors

### Task 6: Task Registry

**Files:**
- Create: `lib/llm/task-registry.ts`

The registry is a module-level singleton `Map`. It holds running task state: accumulated text, subscriber callbacks, and abort signal. It does NOT touch the DB — DB writes happen in each processor.

- [ ] **Step 6.1: Create `lib/llm/task-registry.ts`**

```typescript
// lib/llm/task-registry.ts
// In-process task registry. Single source of truth for running tasks.
// DB is written by processors (every chunk). Registry is for live subscribers.

export type SubscriberCallback = (chunk: string) => void
export type DoneCallback = () => void
export type ErrorCallback = (err: string) => void

export interface TaskContext {
  taskId:      string
  docId:       string
  mode:        string
  accumulated: string          // all emitted text so far
  subscribers: Set<{ onChunk: SubscriberCallback; onDone: DoneCallback; onError: ErrorCallback }>
  abortController: AbortController
}

// Module-level singleton — survives across requests in the same Node.js process
const registry = new Map<string, TaskContext>()

export function registerTask(taskId: string, docId: string, mode: string): TaskContext {
  const ctx: TaskContext = {
    taskId,
    docId,
    mode,
    accumulated: '',
    subscribers: new Set(),
    abortController: new AbortController(),
  }
  registry.set(taskId, ctx)
  return ctx
}

export function getTask(taskId: string): TaskContext | undefined {
  return registry.get(taskId)
}

export function removeTask(taskId: string): void {
  registry.delete(taskId)
}

/**
 * Emit a text chunk to all subscribers and append to accumulated.
 */
export function emitChunk(ctx: TaskContext, chunk: string): void {
  ctx.accumulated += chunk
  for (const sub of ctx.subscribers) {
    sub.onChunk(chunk)
  }
}

/**
 * Signal task completion to all subscribers, then remove from registry.
 */
export function emitDone(ctx: TaskContext): void {
  for (const sub of ctx.subscribers) {
    sub.onDone()
  }
  registry.delete(ctx.taskId)
}

/**
 * Signal task error to all subscribers, then remove from registry.
 */
export function emitError(ctx: TaskContext, message: string): void {
  for (const sub of ctx.subscribers) {
    sub.onError(message)
  }
  registry.delete(ctx.taskId)
}

/**
 * Subscribe to a running task. Returns an unsubscribe function.
 */
export function subscribe(
  ctx: TaskContext,
  callbacks: { onChunk: SubscriberCallback; onDone: DoneCallback; onError: ErrorCallback }
): () => void {
  ctx.subscribers.add(callbacks)
  return () => ctx.subscribers.delete(callbacks)
}
```

- [ ] **Step 6.2: Commit**

```bash
git add lib/llm/task-registry.ts
git commit -m "feat: add in-process task registry for LLM streaming tasks"
```

---

### Task 7: Sub-agent

**Files:**
- Create: `lib/llm/subagent.ts`

- [ ] **Step 7.1: Create `lib/llm/subagent.ts`**

```typescript
// lib/llm/subagent.ts
// Generic tool-calling loop. No business logic — purely orchestrates
// multi-round LLM ↔ tool conversations.

import { chatOnce, Message, Tool, ToolCall } from './client'

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>

export interface SubagentOptions {
  systemPrompt:         string
  userMessage:          string
  tools:                Tool[]
  toolHandlers:         Record<string, ToolHandler>
  onDelta:              (chunk: string) => void
  onToolCall?:          (name: string, args: Record<string, unknown>) => void  // args are pre-parsed JSON
  maxRounds?:           number   // default 5
  maxToolCallsPerRound?: number  // default 3
  maxOutputTokens?:     number   // default 4000
  signal?:              AbortSignal
}

/**
 * Run a tool-calling agent loop.
 * Calls onDelta for every text chunk from the final (non-tool-calling) response.
 * Throws if LLM errors or maxRounds exceeded.
 */
export async function runSubagent(opts: SubagentOptions): Promise<void> {
  const {
    systemPrompt,
    userMessage,
    tools,
    toolHandlers,
    onDelta,
    onToolCall,
    maxRounds = 5,
    maxToolCallsPerRound = 3,
    maxOutputTokens = 4000,
    signal,
  } = opts

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage },
  ]

  for (let round = 0; round < maxRounds; round++) {
    const result = await chatOnce({ messages, tools, maxTokens: maxOutputTokens, signal })

    if (!result.toolCalls?.length) {
      // No more tool calls — stream final text via onDelta
      if (result.content) {
        // Emit in chunks to simulate streaming (paragraph by paragraph)
        const paragraphs = result.content.split('\n\n')
        for (const para of paragraphs) {
          onDelta(para + (paragraphs[paragraphs.length - 1] === para ? '' : '\n\n'))
        }
      }
      return
    }

    // Add assistant turn with tool calls
    messages.push({
      role: 'assistant',
      content: result.content ?? null,
      tool_calls: result.toolCalls,
    })

    // Execute tool calls (up to maxToolCallsPerRound per round)
    const callsToRun = result.toolCalls.slice(0, maxToolCallsPerRound)
    for (const tc of callsToRun) {
      let toolResult: string
      try {
        const handler = toolHandlers[tc.function.name]
        if (!handler) throw new Error(`No handler for tool: ${tc.function.name}`)
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
        // Pass parsed args to onToolCall callback (not raw JSON string)
        onToolCall?.(tc.function.name, args)
        toolResult = await handler(args)
      } catch (err) {
        toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`
      }

      messages.push({
        role: 'tool',
        content: toolResult,
        tool_call_id: tc.id,
      })
    }
  }

  throw new Error(`Sub-agent exceeded maxRounds (${maxRounds}) without finishing`)
}
```

- [ ] **Step 7.2: Commit**

```bash
git add lib/llm/subagent.ts
git commit -m "feat: add generic tool-calling sub-agent"
```

---

### Task 8: Translate Processor

**Files:**
- Create: `lib/llm/processors/translate.ts`

- [ ] **Step 8.1: Create `lib/llm/processors/translate.ts`**

```typescript
// lib/llm/processors/translate.ts
// Chunked parallel translation. Processes up to 3 chunks concurrently.
// Writes each completed chunk to DB and emits via task registry.

import { db, schema } from '@/lib/db/client'
import { eq, sql } from 'drizzle-orm'
import { splitIntoChunks, pLimit } from '../chunker'
import { chatOnce } from '../client'
import { TRANSLATE_CHUNK_SYSTEM } from '../prompts'
import { TaskContext, emitChunk } from '../task-registry'

const CHUNK_SIZE = 1500
const CONCURRENCY = 3

interface TranslateOptions {
  ctx:        TaskContext
  content:    string
  targetLang: string
  resultId:   string
}

async function translateChunk(chunk: string, targetLang: string, retries = 1): Promise<string> {
  const messages = [
    { role: 'system' as const, content: TRANSLATE_CHUNK_SYSTEM(targetLang) },
    { role: 'user'   as const, content: chunk },
  ]
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await chatOnce({ messages, maxTokens: 3000 })
      return result.content
    } catch (err) {
      if (attempt === retries) throw err
    }
  }
  return '' // unreachable
}

async function flushResult(resultId: string, text: string): Promise<void> {
  await db.run(sql`
    UPDATE smart_results SET result = ${text} WHERE id = ${resultId}
  `)
}

export async function runTranslate(opts: TranslateOptions): Promise<void> {
  const { ctx, content, targetLang, resultId } = opts

  const chunks = splitIntoChunks(content, CHUNK_SIZE)
  const results: string[] = new Array(chunks.length).fill('')
  const failedChunks: number[] = []

  // Emit chunks strictly in document order.
  // After pLimit finishes, results[] is fully populated in index order.
  const done: boolean[] = new Array(chunks.length).fill(false)
  let emittedUpTo = 0  // index of next chunk to emit

  const tasks = chunks.map((chunk, i) => async () => {
    try {
      results[i] = await translateChunk(chunk, targetLang, 1)
    } catch {
      failedChunks.push(i)
      results[i] = `\n\n> ⚠️ 此段翻译失败\n\n`
    }
    done[i] = true

    // Flush all contiguous done chunks from emittedUpTo onward
    while (emittedUpTo < chunks.length && done[emittedUpTo]) {
      const toEmit = results[emittedUpTo] + (emittedUpTo < chunks.length - 1 ? '\n\n' : '')
      emitChunk(ctx, toEmit)
      await flushResult(resultId, ctx.accumulated)
      emittedUpTo++
    }
  })

  await pLimit(tasks, CONCURRENCY)

  // Update meta
  const meta = JSON.stringify({
    target_lang: targetLang,
    chunks_total: chunks.length,
    chunks_completed: chunks.length - failedChunks.length,
    failed_chunks: failedChunks,
  })
  await db.run(sql`
    UPDATE smart_results
    SET status = 'done', completed_at = unixepoch(), meta = ${meta}
    WHERE id = ${resultId}
  `)
}
```

- [ ] **Step 8.2: Commit**

```bash
git add lib/llm/processors/translate.ts
git commit -m "feat: add translate processor with chunked parallel translation"
```

---

### Task 9: Summarize Processor

**Files:**
- Create: `lib/llm/processors/summarize.ts`

- [ ] **Step 9.1: Create `lib/llm/processors/summarize.ts`**

```typescript
// lib/llm/processors/summarize.ts
// Map-reduce summarization. Short articles (<1500 chars): single pass.
// Long articles: map (chunk summaries) → reduce (final structured summary).

import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { splitIntoChunks, pLimit } from '../chunker'
import { chatOnce, streamChat } from '../client'
import { SUMMARIZE_MAP_SYSTEM, SUMMARIZE_REDUCE_SYSTEM } from '../prompts'
import { TaskContext, emitChunk } from '../task-registry'

const CHUNK_SIZE = 1500
const MAP_CONCURRENCY = 5

async function flushResult(resultId: string, text: string): Promise<void> {
  await db.run(sql`UPDATE smart_results SET result = ${text} WHERE id = ${resultId}`)
}

/**
 * Summarize a single chunk (map phase). Returns plain text summary.
 */
async function mapChunk(chunk: string, retries = 1): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await chatOnce({
        messages: [
          { role: 'system', content: SUMMARIZE_MAP_SYSTEM },
          { role: 'user',   content: chunk },
        ],
        maxTokens: 400,
      })
      return result.content
    } catch (err) {
      if (attempt === retries) throw err
    }
  }
  return ''
}

interface SummarizeOptions {
  ctx:      TaskContext
  content:  string
  resultId: string
}

export async function runSummarize(opts: SummarizeOptions): Promise<void> {
  const { ctx, content, resultId } = opts
  const chunks = splitIntoChunks(content, CHUNK_SIZE)

  let reduceInput: string

  if (chunks.length <= 1) {
    // Short article: use content directly as reduce input
    reduceInput = content
  } else {
    // Map phase: summarize each chunk
    const chunkSummaries: string[] = new Array(chunks.length).fill('')
    const failedChunks: number[] = []

    const mapTasks = chunks.map((chunk, i) => async () => {
      try {
        chunkSummaries[i] = await mapChunk(chunk)
      } catch {
        failedChunks.push(i)
        chunkSummaries[i] = '[此段摘要提取失败]'
      }
    })

    await pLimit(mapTasks, MAP_CONCURRENCY)
    reduceInput = chunkSummaries.join('\n\n---\n\n')
  }

  // Reduce phase: stream the final structured summary
  let reduceSucceeded = false
  try {
    await streamChat({
      messages: [
        { role: 'system', content: SUMMARIZE_REDUCE_SYSTEM },
        { role: 'user',   content: `各部分摘要：\n\n${reduceInput}` },
      ],
      maxTokens: 2000,
      onDelta: (chunk) => {
        // Synchronous callback — fire-and-forget the DB flush to avoid type mismatch
        emitChunk(ctx, chunk)
        flushResult(resultId, ctx.accumulated).catch(e => console.error('[summarize/flush]', e))
      },
      signal: ctx.abortController.signal,
    })
    reduceSucceeded = true
  } catch (err) {
    // Graceful degradation: ALWAYS emit fallback on reduce failure
    // (regardless of how much was already accumulated)
    const fallback = `\n\n---\n\n> ⚠️ 综合摘要生成失败，以下为自动降级摘要：\n\n${reduceInput}`
    emitChunk(ctx, fallback)
    await flushResult(resultId, ctx.accumulated)
    // Don't re-throw — task should complete with degraded output, not fail
  }

  await db.run(sql`
    UPDATE smart_results SET status = 'done', completed_at = unixepoch() WHERE id = ${resultId}
  `)
}
```

- [ ] **Step 9.2: Commit**

```bash
git add lib/llm/processors/summarize.ts
git commit -m "feat: add map-reduce summarize processor"
```

---

### Task 10: Brainstorm Processor

**Files:**
- Create: `lib/llm/processors/brainstorm.ts`

- [ ] **Step 10.1: Create `lib/llm/processors/brainstorm.ts`**

```typescript
// lib/llm/processors/brainstorm.ts
// Tool-calling brainstorm agent with web search.
// Feeds compressed content to sub-agent; sub-agent may call search N times.

import { db, schema } from '@/lib/db/client'
import { eq, sql } from 'drizzle-orm'
import { chatOnce } from '../client'
import { BRAINSTORM_SYSTEM, BRAINSTORM_SEARCH_TOOL } from '../prompts'
import { runSubagent } from '../subagent'
import { TaskContext, emitChunk } from '../task-registry'
import { search as anspireSearch } from '@/lib/search/anspire'

const MAX_CONTENT_CHARS = 2000

async function flushResult(resultId: string, text: string): Promise<void> {
  await db.run(sql`UPDATE smart_results SET result = ${text} WHERE id = ${resultId}`)
}

/**
 * Compress content for brainstorm context (priority: existing summary → quick summarize → truncate).
 */
async function getCompressedContent(docId: string, content: string, title: string): Promise<string> {
  // 1. Try existing document summary
  const doc = await db.query.documents.findFirst({
    where: eq(schema.documents.id, docId),
    columns: { summary: true },
  })
  if (doc?.summary) return doc.summary

  // 2. Quick internal summarize (not saved as a version)
  if (content.length > MAX_CONTENT_CHARS) {
    try {
      const result = await chatOnce({
        messages: [
          { role: 'system', content: '请对以下文章进行500字以内的摘要，保留核心论点和关键数据：' },
          { role: 'user',   content: content.slice(0, 6000) },
        ],
        maxTokens: 800,
      })
      if (result.content) return result.content
    } catch {
      // Fall through to truncation
    }
  }

  // 3. Truncate fallback
  return `标题: ${title}\n\n${content.slice(0, MAX_CONTENT_CHARS)}\n...(内容已截断)`
}

interface BrainstormOptions {
  ctx:      TaskContext
  content:  string
  title:    string
  docId:    string
  resultId: string
}

export async function runBrainstorm(opts: BrainstormOptions): Promise<void> {
  const { ctx, content, title, docId, resultId } = opts

  const compressed = await getCompressedContent(docId, content, title)
  const searchQueries: string[] = []

  await runSubagent({
    systemPrompt: BRAINSTORM_SYSTEM,
    userMessage:  `文章标题: ${title}\n\n文章内容:\n${compressed}`,
    tools:        [BRAINSTORM_SEARCH_TOOL],
    toolHandlers: {
      search: async (args) => {
        const query = String(args.query ?? '')
        searchQueries.push(query)
        try {
          const results = await anspireSearch(query, 5)
          return results.map(r => `**${r.title}**\n${r.snippet}\n来源: ${r.url}`).join('\n\n')
        } catch {
          return '搜索暂时不可用，请继续基于已有信息分析。'
        }
      },
    },
    onDelta: (chunk) => {
      emitChunk(ctx, chunk)
      flushResult(resultId, ctx.accumulated).catch(e => console.error('[brainstorm/flush]', e))
    },
    signal: ctx.abortController.signal,
  })

  const meta = JSON.stringify({ search_queries: searchQueries })
  await db.run(sql`
    UPDATE smart_results
    SET status = 'done', completed_at = unixepoch(), meta = ${meta}
    WHERE id = ${resultId}
  `)
}
```

- [ ] **Step 10.2: Commit**

```bash
git add lib/llm/processors/brainstorm.ts
git commit -m "feat: add brainstorm processor with sub-agent + Anspire search"
```

---

## Chunk 3: API Routes

### Task 11: POST task creation + GET version list

**Files:**
- Create: `app/api/smart/[docId]/[mode]/route.ts`

The route needs a helper to dispatch the right processor and handle task lifecycle.
Create a shared dispatcher module first.

- [ ] **Step 11.1: Create `lib/llm/dispatcher.ts`** (shared task launch logic)

```typescript
// lib/llm/dispatcher.ts
// Launches a smart task in the background. Called from POST API route.
// Handles: create DB record, register task, dispatch processor, finalize DB.

import { db, schema } from '@/lib/db/client'
import { eq, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { registerTask, emitDone, emitError, removeTask } from './task-registry'
import { runTranslate } from './processors/translate'
import { runSummarize } from './processors/summarize'
import { runBrainstorm } from './processors/brainstorm'

export type SmartMode = 'translate' | 'summarize' | 'brainstorm'

export interface LaunchResult {
  taskId: string
  resultId: string
}

/**
 * Create a smart_results record with version = max+1, register the task,
 * and start the processor in the background (fire-and-forget).
 * Returns immediately with {taskId, resultId}.
 */
export async function launchTask(
  docId: string,
  mode: SmartMode,
  options: { targetLang?: string } = {}
): Promise<LaunchResult> {
  // Get document content
  const doc = await db.query.documents.findFirst({
    where: eq(schema.documents.id, docId),
  })
  if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 })

  // Determine next version
  const versionRow = await db.run(sql`
    SELECT COALESCE(MAX(version), 0) + 1 AS next_version
    FROM smart_results
    WHERE document_id = ${docId} AND mode = ${mode}
  `)
  const nextVersion = Number((versionRow.rows[0] as { next_version: number }).next_version)

  // Create DB record
  const resultId = uuidv4()
  const taskId   = uuidv4()
  await db.run(sql`
    INSERT INTO smart_results (id, document_id, mode, version, status)
    VALUES (${resultId}, ${docId}, ${mode}, ${nextVersion}, 'running')
  `)

  // Register in-process task
  const ctx = registerTask(taskId, docId, mode)

  // Fire and forget — processor updates DB every chunk
  const targetLang = options.targetLang ?? '中文'

  Promise.resolve().then(async () => {
    try {
      if (mode === 'translate') {
        await runTranslate({ ctx, content: doc.content, targetLang, resultId })
      } else if (mode === 'summarize') {
        await runSummarize({ ctx, content: doc.content, resultId })
      } else if (mode === 'brainstorm') {
        await runBrainstorm({ ctx, content: doc.content, title: doc.title, docId, resultId })
      }
      emitDone(ctx)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[smart/${mode}] task ${taskId} failed:`, msg)
      await db.run(sql`
        UPDATE smart_results
        SET status = 'error', error = ${msg}, completed_at = unixepoch()
        WHERE id = ${resultId}
      `).catch(() => {})
      emitError(ctx, msg)
    }
  })

  return { taskId, resultId }
}

/**
 * On startup: mark stale 'running' tasks (>1h old) as 'interrupted'.
 * Call once from a startup hook or lazily on first request.
 */
export async function recoverStaleTasks(): Promise<void> {
  await db.run(sql`
    UPDATE smart_results
    SET status = 'interrupted'
    WHERE status = 'running' AND created_at < unixepoch() - 3600
  `).catch(() => {})
}
```

- [ ] **Step 11.2: Create `app/api/smart/[docId]/[mode]/route.ts`**

```typescript
// app/api/smart/[docId]/[mode]/route.ts
// POST: start a new smart task
// GET: list versions for this doc+mode

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { launchTask, SmartMode, recoverStaleTasks } from '@/lib/llm/dispatcher'
import { getTask } from '@/lib/llm/task-registry'

const VALID_MODES: SmartMode[] = ['translate', 'summarize', 'brainstorm']
const MAX_CONTENT_LENGTH = 1_000_000

// Run once on cold start
let recovered = false
async function ensureRecovered() {
  if (!recovered) {
    recovered = true
    await recoverStaleTasks()
  }
}

interface Params { docId: string; mode: string }

export async function POST(req: NextRequest, { params }: { params: Params }) {
  await ensureRecovered()

  const { docId, mode } = params

  if (!VALID_MODES.includes(mode as SmartMode)) {
    return NextResponse.json({ error: 'invalid_mode', message: `Mode must be one of: ${VALID_MODES.join(', ')}` }, { status: 400 })
  }

  // Check if a task is already running
  const runningRow = await db.run(sql`
    SELECT id FROM smart_results
    WHERE document_id = ${docId} AND mode = ${mode} AND status = 'running'
    LIMIT 1
  `)
  if (runningRow.rows.length > 0) {
    // The result id IS the taskId (we unified these — see dispatcher)
    const existingTaskId = String((runningRow.rows[0] as { id: string }).id)
    return NextResponse.json(
      { error: 'task_already_running', message: 'A task is already running for this document and mode', taskId: existingTaskId },
      { status: 409 }
    )
  }

  // Parse body for options (e.g. targetLang)
  let options: { targetLang?: string } = {}
  try {
    const body = await req.json().catch(() => ({}))
    if (body.target_lang) options.targetLang = String(body.target_lang)
  } catch { /* no body */ }

  try {
    const { taskId } = await launchTask(docId, mode as SmartMode, options)
    return NextResponse.json({ taskId }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      if ((err as { status: number }).status === 404) {
        return NextResponse.json({ error: 'document_not_found', message: err.message }, { status: 404 })
      }
    }
    console.error('[POST /api/smart]', err)
    return NextResponse.json({ error: 'internal_error', message: 'Failed to start task' }, { status: 500 })
  }
}

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { docId, mode } = params

  if (!VALID_MODES.includes(mode as SmartMode)) {
    return NextResponse.json({ error: 'invalid_mode', message: 'Invalid mode' }, { status: 400 })
  }

  try {
    const rows = await db.run(sql`
      SELECT id, version, status, created_at, completed_at
      FROM smart_results
      WHERE document_id = ${docId} AND mode = ${mode}
      ORDER BY version DESC
      LIMIT 10
    `)

    const versions = (rows.rows as Array<{
      id: string; version: number; status: string
      created_at: number; completed_at: number | null
    }>).map(r => ({
      id:           r.id,
      version:      r.version,
      status:       r.status,
      created_at:   new Date(r.created_at * 1000).toISOString(),
      completed_at: r.completed_at ? new Date(r.completed_at * 1000).toISOString() : null,
    }))

    return NextResponse.json({ versions })
  } catch (err) {
    console.error('[GET /api/smart/versions]', err)
    return NextResponse.json({ error: 'internal_error', message: 'Failed to fetch versions' }, { status: 500 })
  }
}
```

- [ ] **Step 11.3: Commit**

```bash
git add lib/llm/dispatcher.ts app/api/smart/[docId]/[mode]/route.ts
git commit -m "feat: add smart task creation API (POST) and version list (GET)"
```

---

### Task 12: SSE Stream Route

**Files:**
- Create: `app/api/smart/stream/[taskId]/route.ts`

- [ ] **Step 12.1: Create `app/api/smart/stream/[taskId]/route.ts`**

```typescript
// app/api/smart/stream/[taskId]/route.ts
// SSE endpoint. Streams live chunks if task is running (via registry),
// or replays from DB if task is already done.

import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { getTask, subscribe } from '@/lib/llm/task-registry'

interface Params { taskId: string }

function sseChunk(event: string, data: string | object): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  return `event: ${event}\ndata: ${payload}\n\n`
}

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { taskId } = params

  const headers = {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  }

  // Case 1: Task is running in registry
  const ctx = getTask(taskId)
  if (ctx) {
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()

        // Race condition guard: re-check task still exists before subscribing
        const freshCtx = getTask(taskId)
        if (!freshCtx) {
          // Task completed between outer check and here — fall through to DB lookup below
          // Signal the stream to close cleanly; client will retry via DB path
          controller.enqueue(enc.encode(sseChunk('error', { error: 'not_ready', message: 'Task finished, reload to view result' })))
          controller.close()
          return
        }

        // Send accumulated content so far (catch-up)
        if (freshCtx.accumulated) {
          controller.enqueue(enc.encode(sseChunk('chunk', freshCtx.accumulated)))
        }

        const callbacks = {
          onChunk: (chunk: string) => {
            controller.enqueue(enc.encode(sseChunk('chunk', chunk)))
          },
          onDone: () => {
            controller.enqueue(enc.encode(sseChunk('done', {})))
            controller.close()
          },
          onError: (msg: string) => {
            controller.enqueue(enc.encode(sseChunk('error', { error: 'llm_failed', message: msg })))
            controller.close()
          },
        }

        const unsubscribe = subscribe(freshCtx, callbacks)

        req.signal.addEventListener('abort', () => {
          unsubscribe()
          // Do NOT close controller here — task continues in background
        })
      },
    })

    return new Response(stream, { headers })
  }

  // Case 2: Task not in registry — look up in DB by result_id
  // Note: taskId in the URL is actually the task's UUID from POST response.
  // We need to find the result. The POST response returns {taskId} which maps
  // to an in-memory context. When the task completes, the context is removed.
  // So we need to store a mapping. Simplest approach: treat the "taskId" in the
  // URL as the result_id (we'll align POST response to return resultId, not taskId).
  // See note in dispatcher: POST returns {taskId} but stream uses it as resultId.
  // For simplicity, we change POST to return {taskId} = resultId.
  // (See dispatcher note: taskId returned = resultId for SSE lookups)

  const row = await db.run(sql`
    SELECT status, result, error FROM smart_results WHERE id = ${taskId} LIMIT 1
  `).catch(() => null)

  if (!row || row.rows.length === 0) {
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()
        controller.enqueue(enc.encode(sseChunk('error', { error: 'not_found', message: 'Task not found' })))
        controller.close()
      }
    })
    return new Response(stream, { headers })
  }

  const result = row.rows[0] as { status: string; result: string | null; error: string | null }
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()
      if (result.status === 'done' && result.result) {
        controller.enqueue(enc.encode(sseChunk('chunk', result.result)))
        controller.enqueue(enc.encode(sseChunk('done', {})))
      } else if (result.status === 'error') {
        controller.enqueue(enc.encode(sseChunk('error', { error: 'llm_failed', message: result.error ?? 'Unknown error' })))
      } else if (result.status === 'interrupted') {
        controller.enqueue(enc.encode(sseChunk('error', { error: 'interrupted', message: '生成中断，请点击重新生成' })))
      } else {
        // Running but not in registry (edge case: just started)
        controller.enqueue(enc.encode(sseChunk('error', { error: 'not_ready', message: '任务启动中，请稍后重试' })))
      }
      controller.close()
    }
  })

  return new Response(stream, { headers })
}
```

**Important note:** The SSE route uses the `resultId` as the stream identifier. Update the dispatcher and POST route to return `{ taskId: resultId }` (the result's DB id) so the frontend can use it directly for SSE and for version lookups.

- [ ] **Step 12.2: Align dispatcher to return resultId as taskId**

In `lib/llm/dispatcher.ts`, change:
```typescript
// Before:
return { taskId, resultId }

// After: expose resultId as the "taskId" for the client
return { taskId: resultId, resultId }
```

And in the task registry, use `resultId` as the key:
```typescript
// In dispatcher.ts, change:
const ctx = registerTask(taskId, docId, mode)
// to:
const ctx = registerTask(resultId, docId, mode)
```

This way the SSE stream URL is `/api/smart/stream/{resultId}` which also doubles as the DB lookup key. Clean.

- [ ] **Step 12.3: Commit**

```bash
git add app/api/smart/stream/[taskId]/route.ts lib/llm/dispatcher.ts
git commit -m "feat: add SSE stream route for smart task output"
```

---

## Chunk 4: Frontend + Entry Points

### Task 13: Smart Reading Page

**Files:**
- Create: `app/(reader)/[id]/smart/page.tsx`

This is the most complex piece. It's a Client Component managing state for: mode tabs, version chips, SSE streaming, and the MarkdownRenderer.

- [ ] **Step 13.1: Create `app/(reader)/[id]/smart/page.tsx`**

```typescript
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, ArrowLeft, BookOpen } from 'lucide-react'

type Mode = 'translate' | 'summarize' | 'brainstorm'
type Status = 'empty' | 'loading' | 'streaming' | 'done' | 'error'

interface Version {
  id:           string
  version:      number
  status:       string
  created_at:   string
  completed_at: string | null
}

const MODES: { key: Mode; label: string; emoji: string }[] = [
  { key: 'translate',  label: '翻译',    emoji: '🌐' },
  { key: 'summarize',  label: '摘要',    emoji: '📋' },
  { key: 'brainstorm', label: '头脑风暴', emoji: '💡' },
]

const MODE_LABELS: Record<Mode, string> = {
  translate:  '翻译',
  summarize:  '摘要',
  brainstorm: '头脑风暴',
}

function formatVersionTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (isToday) return `今天 ${time}`
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${time}`
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

export default function SmartPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [mode, setMode]           = useState<Mode>('translate')
  const [status, setStatus]       = useState<Status>('empty')
  const [content, setContent]     = useState('')
  const [error, setError]         = useState('')
  const [versions, setVersions]   = useState<Version[]>([])
  const [selectedVer, setSelectedVer] = useState<string | null>(null)
  const [docTitle, setDocTitle]   = useState('')

  const eventSourceRef = useRef<EventSource | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => { eventSourceRef.current?.close() }
  }, [])

  // Fetch doc title on mount
  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then(r => r.json())
      .then(d => setDocTitle(d.title ?? ''))
      .catch(() => {})
  }, [id])

  // Load versions when mode changes
  const loadVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/smart/${id}/${mode}`)
      if (!res.ok) return
      const data = await res.json() as { versions: Version[] }
      // Replace state fully from DB (clears any optimistic entries)
      setVersions(data.versions ?? [])

      const latest = data.versions?.[0]
      if (latest) {
        setSelectedVer(latest.id)
        if (latest.status === 'done') {
          // Replay from DB via SSE
          streamVersion(latest.id)
        } else if (latest.status === 'running') {
          // Task is running — connect to SSE
          streamVersion(latest.id)
        } else if (latest.status === 'interrupted') {
          setStatus('error')
          setError('上次生成中断，请点击重新生成')
        }
      } else {
        setStatus('empty')
        setContent('')
      }
    } catch {
      // ignore
    }
  }, [id, mode])

  useEffect(() => {
    setStatus('empty')
    setContent('')
    setError('')
    setVersions([])
    setSelectedVer(null)
    eventSourceRef.current?.close()
    loadVersions()
  }, [mode, loadVersions])

  function streamVersion(resultId: string) {
    eventSourceRef.current?.close()
    setContent('')
    setError('')
    setStatus('loading')

    const es = new EventSource(`/api/smart/stream/${resultId}`)
    eventSourceRef.current = es

    es.addEventListener('chunk', (e) => {
      setStatus('streaming')
      setContent(prev => prev + e.data)
    })

    es.addEventListener('done', () => {
      setStatus('done')
      es.close()
      // Refresh versions list to show the new version with correct timestamps
      loadVersions()
    })

    es.addEventListener('error', (e) => {
      const msgEvent = e as MessageEvent
      try {
        const parsed = JSON.parse(msgEvent.data) as { message?: string }
        setError(parsed.message ?? '生成失败')
      } catch {
        // Connection error (not a data error event)
        if (status !== 'done') setError('连接中断')
      }
      setStatus('error')
      es.close()
    })
  }

  async function startNewTask() {
    try {
      setStatus('loading')
      setContent('')
      setError('')

      const res = await fetch(`/api/smart/${id}/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (res.status === 409) {
        // Task already running — connect to its stream using the existing taskId
        const data = await res.json() as { taskId: string }
        streamVersion(data.taskId)
        return
      }

      if (!res.ok) {
        const data = await res.json() as { message?: string }
        setError(data.message ?? '启动失败')
        setStatus('error')
        return
      }

      const data = await res.json() as { taskId: string }
      setSelectedVer(data.taskId)
      streamVersion(data.taskId)

      // Add optimistic version entry. This is replaced on 'done' when loadVersions() fires.
      // Use a dedup check: don't add if taskId already exists (e.g. from 409 path).
      setVersions(prev => {
        if (prev.some(v => v.id === data.taskId)) return prev
        return [{
          id:           data.taskId,
          version:      (prev[0]?.version ?? 0) + 1,
          status:       'running',
          created_at:   new Date().toISOString(),
          completed_at: null,
        }, ...prev]
      })
    } catch {
      setError('请求失败，请重试')
      setStatus('error')
    }
  }

  async function switchToVersion(ver: Version) {
    if (ver.id === selectedVer) return
    setSelectedVer(ver.id)
    streamVersion(ver.id)
  }

  const isGenerating = status === 'loading' || status === 'streaming'

  return (
    <div className="min-h-screen">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b bg-[#fafaf8]/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between gap-3">
          <Link
            href={`/${id}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="truncate max-w-[160px] sm:max-w-xs">{docTitle || '原文'}</span>
          </Link>
          <span className="text-xs font-medium text-muted-foreground shrink-0">智读</span>
        </div>
      </header>

      {/* Mode tabs */}
      <div className="sticky top-12 z-30 border-b bg-[#fafaf8]/90 dark:bg-[#1a1a1a]/90 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex">
            {MODES.map(m => (
              <button
                key={m.key}
                onClick={() => !isGenerating && setMode(m.key)}
                disabled={isGenerating}
                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                  mode === m.key
                    ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.emoji} {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {isGenerating && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full bg-blue-500 animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      {/* Version chips + refresh */}
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={startNewTask}
          disabled={isGenerating}
          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
          {versions.length === 0 ? '开始生成' : '重新生成'}
        </Button>

        {versions.slice(0, 5).map(ver => (
          <button
            key={ver.id}
            onClick={() => switchToVersion(ver)}
            className={`h-7 px-2.5 rounded-full text-xs transition-colors ${
              selectedVer === ver.id
                ? 'bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-800 text-muted-foreground hover:text-foreground'
            }`}
          >
            {formatVersionTime(ver.created_at)}
          </button>
        ))}
      </div>

      {/* Main content area */}
      <article className="max-w-2xl mx-auto px-5 pb-24 sm:pb-12">
        {status === 'empty' && !isGenerating && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <span className="text-4xl mb-4">
              {MODES.find(m => m.key === mode)?.emoji}
            </span>
            <p className="text-sm mb-4">点击 ↺ 开始{MODE_LABELS[mode]}</p>
          </div>
        )}

        {status === 'loading' && !content && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        )}

        {(status === 'streaming' || status === 'done') && content && (
          <div className="py-4 reading-body">
            <MarkdownRenderer content={content} />
            {status === 'streaming' && (
              <span className="inline-block w-0.5 h-4 bg-zinc-600 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="py-8 flex flex-col items-center gap-4">
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-6 py-4 text-sm text-red-700 dark:text-red-400 max-w-sm text-center">
              {error || '生成失败，请重试'}
            </div>
            <Button variant="outline" size="sm" onClick={startNewTask}>
              重新生成
            </Button>
          </div>
        )}
      </article>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 border-t bg-[#fafaf8]/90 dark:bg-[#1a1a1a]/90 backdrop-blur-sm">
        <div className="flex items-center justify-around h-14">
          <Link href="/" className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <span className="text-lg">📚</span>
            <span>文库</span>
          </Link>
          <Link href={`/${id}`} className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <BookOpen className="w-5 h-5" />
            <span>原文</span>
          </Link>
          <Link href={`/${id}/smart`} className="flex flex-col items-center gap-0.5 text-xs text-foreground transition-colors">
            <span className="text-lg">✨</span>
            <span>智读</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
```

- [ ] **Step 13.2: Commit**

```bash
git add app/(reader)/[id]/smart/page.tsx
git commit -m "feat: add smart reading page with SSE streaming and version management"
```

---

### Task 14: Add 「智读」entry point on article page

**Files:**
- Modify: `app/(reader)/[id]/page.tsx`
- Modify: `app/(reader)/layout.tsx`

- [ ] **Step 14.1: Add 「智读」button in article page header**

In `app/(reader)/[id]/page.tsx`, add after the article header section (after the tags div):

```typescript
// Add import at top:
import { Sparkles } from 'lucide-react'

// Add after the tags block, before the <hr>:
<div className="flex gap-2 mt-4">
  <Link
    href={`/${doc.id}/smart`}
    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm
               bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900
               hover:opacity-80 transition-opacity font-medium"
  >
    <Sparkles className="w-3.5 h-3.5" />
    智读
  </Link>
</div>
```

- [ ] **Step 14.2: Add 「智读」to mobile bottom nav in layout**

In `app/(reader)/layout.tsx`, the layout serves both `/[id]` and `/[id]/smart`. The smart page has its own bottom nav (inline), so we only need the article page's nav to have the 智读 link. Since layout doesn't know the doc ID, the simplest approach is to keep the layout nav as-is (文库 + 搜索) and let the smart page override with its own nav (文库 + 原文 + 智读).

No change needed to layout. The smart page already has its own bottom nav that replaces the layout's.

**Note:** The layout nav will still be visible on the article page (showing 文库 + 搜索). On the smart page, we render our own `<nav>` that will visually overlap the layout's nav — but both are `fixed bottom-0`, so whichever renders last wins. Since the smart page is a child rendering inside `<main>`, the layout nav renders. We should conditionally hide the layout nav on smart pages.

Simplest fix: the smart page renders its nav outside the main content area, giving it higher z-index. Update smart page nav to have `z-50` and add a white/dark background so it covers the layout nav:

```typescript
// In smart/page.tsx, the nav already has backdrop-blur-sm which covers the layout nav.
// Add z-50 to ensure it's above:
<nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-[#fafaf8] dark:bg-[#1a1a1a]">
```

- [ ] **Step 14.3: Add `/api/documents/[id]` GET for doc title lookup**

The smart page does `fetch('/api/documents/${id}')` to get the title. Check if this route exists:

Looking at the file list: `app/api/documents/[id]/route.ts` exists. Verify it returns `{ title }`:

```typescript
// Open and check app/api/documents/[id]/route.ts
// If it returns the full document, title will be there.
```

- [ ] **Step 14.4: Commit**

```bash
git add app/(reader)/[id]/page.tsx app/(reader)/[id]/smart/page.tsx
git commit -m "feat: add 智读 entry button on article page and fix smart page nav z-index"
```

---

### Task 15: Docker rebuild verification

- [ ] **Step 15.1: Verify Dockerfile covers migration 0002**

The existing CMD glob `lib/db/migrations/*.sql` will pick up `0002_smart_results.sql` automatically. No change needed.

- [ ] **Step 15.2: Rebuild and test**

```bash
cd /path/to/learnhub
docker compose build
docker compose up -d
docker logs -f --tail 50 learnhub
```

Expected logs:
```
applying lib/db/migrations/0000_damp_sunspot.sql
applying lib/db/migrations/0001_fts.sql
applying lib/db/migrations/0002_smart_results.sql
Starting server on http://0.0.0.0:3000
```

- [ ] **Step 15.3: Smoke test**

1. Navigate to any article → verify 「智读」button appears in header
2. Click 「智读」→ verify route `/[id]/smart` loads
3. Click ↺ on 「翻译」tab → verify POST to `/api/smart/[id]/translate` returns 201
4. Verify SSE stream starts and content appears
5. Navigate away and back → verify content is replayed from DB
6. Click ↺ again → verify new version is created and shown as a chip

- [ ] **Step 15.4: Final commit**

```bash
git add .
git commit -m "feat: 智读功能完整实现 — translate/summarize/brainstorm with SSE streaming"
```

---

## Implementation Notes

### Key Design Decisions

**taskId = resultId**: The POST response returns `{ taskId }` which is actually the DB `smart_results.id`. This unifies the SSE stream URL and the DB lookup — no separate mapping table needed.

**No openai SDK**: Uses native `fetch` for SSE parsing. The `streamChat` function handles fragmented SSE lines via a buffer.

**pLimit**: Built-in to `chunker.ts` — no external dependency (p-limit npm package not needed).

**EventSource vs fetch SSE**: Uses native `EventSource` on the frontend. EventSource reconnects automatically, but we close it on `done`/`error` events to prevent spurious reconnects.

### Environment Variables Required

```
LLM_BASE_URL=https://open.bigmodel.cn/api/coding/paas/v4
LLM_API_KEY=<your-key>
LLM_MODEL=glm-5
ANSPIRE_API_KEY=<your-key>
```

### Known Limitations

- **Translate mode streaming**: Chunks are emitted as each concurrent chunk completes, not in strict document order. Content may appear in non-sequential order briefly before all chunks land. This is acceptable UX for the translation mode.
- **EventSource auth**: EventSource doesn't support custom headers. Since the smart API routes are protected by session cookie (not Bearer token), and the browser sends cookies automatically, this is fine.
- **Sub-agent streaming**: The brainstorm mode uses `chatOnce` (not streaming) for tool-calling rounds, then emits the final answer paragraph-by-paragraph. True streaming of tool-call responses would require more complex SSE handling.
