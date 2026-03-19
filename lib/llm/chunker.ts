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
 * Results array preserves original task order.
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
