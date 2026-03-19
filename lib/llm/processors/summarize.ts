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
