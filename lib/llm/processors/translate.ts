// lib/llm/processors/translate.ts
// Chunked parallel translation. Processes up to 3 chunks concurrently.
// Emits chunks in strict document order using emittedUpTo tracking.

import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
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
  const done: boolean[] = new Array(chunks.length).fill(false)
  const failedChunks: number[] = []
  let emittedUpTo = 0  // index of next chunk to emit

  const tasks = chunks.map((chunk, i) => async () => {
    try {
      results[i] = await translateChunk(chunk, targetLang, 1)
    } catch {
      failedChunks.push(i)
      results[i] = `\n\n> ⚠️ 此段翻译失败\n\n`
    }
    done[i] = true

    // Flush all contiguous done chunks from emittedUpTo onward (in order)
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
