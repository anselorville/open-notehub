// lib/llm/processors/summarize.ts
// Polling-friendly summarize pipeline with visible map progress.

import { splitIntoChunks, pLimit } from '../chunker'
import { chatOnce } from '../client'
import { SUMMARIZE_MAP_SYSTEM, SUMMARIZE_REDUCE_SYSTEM } from '../prompts'
import { completeSmartResult, failSmartResult, setSmartProgress, toErrorCode, withTimeoutSignal } from './shared'

const CHUNK_SIZE = 1500
const MAP_CONCURRENCY = 3

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Summarize a single chunk (map phase). Returns plain text summary.
 */
async function mapChunk(chunk: string, retries = 2): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await chatOnce({
        messages: [
          { role: 'system', content: SUMMARIZE_MAP_SYSTEM },
          { role: 'user',   content: chunk },
        ],
        maxTokens: 400,
        signal: withTimeoutSignal(),
      })
      return result.content
    } catch (err) {
      if (attempt === retries) throw err
      await wait(600 * (attempt + 1))
    }
  }
  return ''
}

interface SummarizeOptions {
  content:  string
  resultId: string
}

export async function runSummarize(opts: SummarizeOptions): Promise<void> {
  const { content, resultId } = opts
  const chunks = splitIntoChunks(content, CHUNK_SIZE)

  if (chunks.length <= 1) {
    try {
      const result = await chatOnce({
        messages: [
          { role: 'system', content: SUMMARIZE_REDUCE_SYSTEM },
          { role: 'user', content },
        ],
        maxTokens: 2000,
        signal: withTimeoutSignal(),
      })

      if (!result.content.trim()) {
        throw new Error('empty_summary')
      }

      await completeSmartResult(resultId, result.content.trim(), {
        totalChunks: chunks.length,
        completedChunks: chunks.length,
        phase: 'reduce',
      })
      return
    } catch (error) {
      const fallback = `> ⚠️ 摘要生成失败（${toErrorCode(error)}），已回退为原文。\n\n${content}`
      await completeSmartResult(resultId, fallback, {
        totalChunks: chunks.length,
        completedChunks: chunks.length,
        phase: 'reduce',
        degraded: true,
      })
      return
    }
  }

  const chunkSummaries: string[] = new Array(chunks.length).fill('')
  const progressEntries: string[] = []
  let settledChunks = 0
  let failedChunks = 0
  let latestProgress = ''
  let firstMapErrorCode: string | null = null
  let flushQueue: Promise<void> = Promise.resolve()

  const mapTasks = chunks.map((chunk, i) => async () => {
    try {
      const summary = await mapChunk(chunk)
      if (!summary.trim()) throw new Error('empty_map_summary')
      chunkSummaries[i] = summary.trim()
      progressEntries.push(`### Chunk ${i + 1}\n${summary.trim()}`)
    } catch (error) {
      failedChunks += 1
      if (!firstMapErrorCode) {
        firstMapErrorCode = toErrorCode(error)
      }
      chunkSummaries[i] = ''
    } finally {
      settledChunks += 1
      latestProgress = progressEntries.join('\n\n')
      flushQueue = flushQueue.then(() =>
        setSmartProgress(resultId, latestProgress, {
          totalChunks: chunks.length,
          completedChunks: settledChunks,
          phase: 'map',
        })
      )
    }
  })

  await pLimit(mapTasks, MAP_CONCURRENCY)
  await flushQueue

  if (failedChunks > Math.floor(chunks.length / 2) || progressEntries.length === 0) {
    await failSmartResult(resultId, 'summarize_map_failed', latestProgress, {
      totalChunks: chunks.length,
      completedChunks: settledChunks,
      failedChunks,
      errorCode: firstMapErrorCode,
      phase: 'map',
    })
    return
  }

  const reduceInput = chunkSummaries.filter(Boolean).join('\n\n---\n\n')

  try {
    const result = await chatOnce({
      messages: [
        { role: 'system', content: SUMMARIZE_REDUCE_SYSTEM },
        { role: 'user', content: `各部分摘要：\n\n${reduceInput}` },
      ],
      maxTokens: 2000,
      signal: withTimeoutSignal(),
    })

    if (!result.content.trim()) {
      throw new Error('empty_reduce_summary')
    }

    await completeSmartResult(resultId, result.content.trim(), {
      totalChunks: chunks.length,
      completedChunks: settledChunks,
      phase: 'reduce',
    })
  } catch (error) {
    const fallback = [
      `> ⚠️ 综合摘要生成失败（${toErrorCode(error)}），以下为自动降级摘要。`,
      '',
      reduceInput,
    ].join('\n')

    await completeSmartResult(resultId, fallback, {
      totalChunks: chunks.length,
      completedChunks: settledChunks,
      phase: 'reduce',
      degraded: true,
      errorCode: toErrorCode(error),
    })
  }
}
