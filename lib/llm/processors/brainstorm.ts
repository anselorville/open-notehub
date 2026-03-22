// lib/llm/processors/brainstorm.ts
// Polling-friendly brainstorm pipeline with persisted round progress.

import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { chatOnce, Message } from '../client'
import { BRAINSTORM_SYSTEM, BRAINSTORM_SEARCH_TOOL } from '../prompts'
import { search as anspireSearch } from '@/lib/search/anspire'
import { completeSmartResult, failSmartResult, setSmartProgress, toErrorCode, withTimeoutSignal } from './shared'

const MAX_CONTENT_CHARS = 8000
const MAX_ROUNDS = 5
const MAX_TOOL_CALLS_PER_ROUND = 3

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
  if (doc?.summary) {
    const s = doc.summary.trim()
    return s.length <= MAX_CONTENT_CHARS ? s : s.slice(0, MAX_CONTENT_CHARS) + '\n...(摘要已截断)'
  }

  // 2. Quick internal summarize (not saved as a version)
  if (content.length > MAX_CONTENT_CHARS) {
    try {
      const result = await chatOnce({
        messages: [
          { role: 'system', content: '请将以下文章压缩成200字以内的中文摘要，保留核心论点和关键事实。' },
          { role: 'user',   content: content.slice(0, 6000) },
        ],
        maxTokens: 300,
        signal: withTimeoutSignal(),
      })
      if (result.content) {
        const s = result.content.trim()
        return s.length <= MAX_CONTENT_CHARS ? s : s.slice(0, MAX_CONTENT_CHARS) + '\n...(摘要已截断)'
      }
    } catch {
      // Fall through to truncation
    }
  }

  // 3. Truncate fallback
  return `标题: ${title}\n\n${content.slice(0, MAX_CONTENT_CHARS)}\n...(内容已截断)`
}

interface BrainstormOptions {
  content:  string
  title:    string
  docId:    string
  resultId: string
}

export async function runBrainstorm(opts: BrainstormOptions): Promise<void> {
  const { content, title, docId, resultId } = opts

  const compressed = await getCompressedContent(docId, content, title)
  const searchQueries: string[] = []
  let searchUnavailable = false
  const progressSections: string[] = []
  let persistedProgress = ''

  const messages: Message[] = [
    { role: 'system', content: BRAINSTORM_SYSTEM },
    { role: 'user', content: `文章标题: ${title}\n\n文章内容:\n${compressed}` },
  ]

  const persistRound = async (round: number, contentChunk: string) => {
    if (!contentChunk.trim()) return
    progressSections.push(`### Round ${round}\n${contentChunk.trim()}`)
    persistedProgress = progressSections.join('\n\n')
    await setSmartProgress(resultId, persistedProgress, {
      phase: 'tool_loop',
      round,
      totalRounds: MAX_ROUNDS,
      searchQueries,
    })
  }

  const runSearch = async (query: string): Promise<string> => {
    searchQueries.push(query)
    try {
      const results = await anspireSearch(query, 5)
      if (!results.length) {
        searchUnavailable = true
        return '搜索结果不可用'
      }
      return results
        .map((result) => `**${result.title}**\n${result.snippet}\n来源: ${result.url}`)
        .join('\n\n')
    } catch {
      searchUnavailable = true
      return '搜索结果不可用'
    }
  }

  let finalOutput = ''

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    let response
    try {
      response = await chatOnce({
        messages,
        tools: [BRAINSTORM_SEARCH_TOOL],
        maxTokens: 2000,
        signal: withTimeoutSignal(),
      })
    } catch (error) {
      if (persistedProgress) break
      await failSmartResult(resultId, toErrorCode(error))
      return
    }

    const assistantContent = response.content?.trim() ?? ''
    if (!response.toolCalls?.length) {
      finalOutput = assistantContent
      break
    }

    await persistRound(round, assistantContent)

    messages.push({
      role: 'assistant',
      content: assistantContent || null,
      tool_calls: response.toolCalls,
    })

    for (const toolCall of response.toolCalls.slice(0, MAX_TOOL_CALLS_PER_ROUND)) {
      let toolResult = '搜索结果不可用'

      try {
        const args = JSON.parse(toolCall.function.arguments) as { query?: string }
        if (toolCall.function.name === 'search') {
          toolResult = await runSearch(String(args.query ?? ''))
        } else {
          toolResult = '搜索结果不可用'
        }
      } catch {
        toolResult = '搜索结果不可用'
      }

      messages.push({
        role: 'tool',
        content: toolResult,
        tool_call_id: toolCall.id,
      })
    }
  }

  if (!finalOutput) {
    try {
      const fallbackResult = await chatOnce({
        messages,
        maxTokens: 2000,
        signal: withTimeoutSignal(),
      })
      finalOutput = fallbackResult.content.trim()
    } catch {
      finalOutput = persistedProgress
    }
  }

  if (!finalOutput.trim()) {
    await failSmartResult(resultId, 'brainstorm_no_output', persistedProgress, {
      phase: 'tool_loop',
      searchQueries,
    })
    return
  }

  if (searchUnavailable && !finalOutput.includes('搜索结果不可用')) {
    finalOutput = `${finalOutput.trim()}\n\n> 搜索结果不可用`
  }

  await completeSmartResult(resultId, finalOutput.trim(), {
    phase: 'final',
    searchQueries,
    degraded: finalOutput.trim() === persistedProgress.trim(),
  })
}
