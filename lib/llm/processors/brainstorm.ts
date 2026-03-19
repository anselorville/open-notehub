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
 * Compress content for brainstorm context.
 * Priority: existing doc summary → quick internal summarize → truncation.
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
