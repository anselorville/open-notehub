// lib/llm/processors/translate.ts
// Chunked translation with ordered DB flushes for polling-based progress.

import { splitIntoChunks, pLimit } from '../chunker'
import { chatOnce } from '../client'
import { TRANSLATE_CHUNK_SYSTEM } from '../prompts'
import {
  completeSmartResult,
  failSmartResult,
  setSmartProgress,
  toErrorCode,
  withTimeoutSignal,
} from './shared'

const CHUNK_SIZE = 1500
const CONCURRENCY = 3

interface TranslateOptions {
  content: string
  targetLang: string
  resultId: string
}

interface ChunkOutcome {
  text: string
  failed: boolean
}

async function translateChunk(
  chunk: string,
  targetLang: string,
  retries = 2
): Promise<ChunkOutcome> {
  const messages = [
    { role: 'system' as const, content: TRANSLATE_CHUNK_SYSTEM(targetLang) },
    { role: 'user' as const, content: chunk },
  ]

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await chatOnce({
        messages,
        maxTokens: 3000,
        signal: withTimeoutSignal(),
      })
      return { text: result.content.trim(), failed: false }
    } catch (err) {
      if (attempt === retries) throw err
    }
  }

  return { text: '', failed: true }
}

export async function runTranslate(opts: TranslateOptions): Promise<void> {
  const { content, targetLang, resultId } = opts

  const chunks = splitIntoChunks(content, CHUNK_SIZE)
  const results: string[] = new Array(chunks.length).fill('')
  const done: boolean[] = new Array(chunks.length).fill(false)
  let emittedUpTo = 0
  let successfulChunks = 0
  let currentResult = ''
  let flushQueue: Promise<void> = Promise.resolve()

  if (chunks.length === 0) {
    await failSmartResult(resultId, 'no_content')
    return
  }

  const flushReadyChunks = async () => {
    while (emittedUpTo < chunks.length && done[emittedUpTo]) {
      currentResult = currentResult
        ? `${currentResult}\n\n${results[emittedUpTo]}`
        : results[emittedUpTo]

      emittedUpTo += 1

      await setSmartProgress(resultId, currentResult, {
        totalChunks: chunks.length,
        completedChunks: emittedUpTo,
        phase: 'translate',
      })
    }
  }

  const tasks = chunks.map((chunk, i) => async () => {
    try {
      const translated = await translateChunk(chunk, targetLang)
      if (translated.failed || !translated.text) {
        throw new Error('empty_translation')
      }
      results[i] = translated.text
      successfulChunks += 1
    } catch (error) {
      const code = toErrorCode(error)
      results[i] = `> Translation failed for this chunk (${code}); falling back to source text.\n\n${chunk}`
    }

    done[i] = true
    flushQueue = flushQueue.then(flushReadyChunks)
  })

  await pLimit(tasks, CONCURRENCY)
  await flushQueue

  const meta = {
    totalChunks: chunks.length,
    completedChunks: chunks.length,
    successfulChunks,
    phase: 'translate',
    targetLang,
  }

  if (successfulChunks === 0) {
    await failSmartResult(resultId, 'translate_all_chunks_failed', currentResult, meta)
    return
  }

  await completeSmartResult(resultId, currentResult, meta)
}
