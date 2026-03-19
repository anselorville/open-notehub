// lib/llm/dispatcher.ts
// Launches a smart task in the background. Called from POST API route.
// Handles: create DB record, register task, dispatch processor, finalize DB.

import { db, schema } from '@/lib/db/client'
import { eq, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { registerTask, emitDone, emitError } from './task-registry'
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
 *
 * IMPORTANT: taskId === resultId — we use the DB record's id as the stream key.
 * This means the SSE URL /api/smart/stream/{taskId} doubles as the DB lookup key.
 *
 * Returns immediately with {taskId, resultId} (both have the same value).
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

  // Guard: reject overly large documents
  if (doc.content.length > 1_000_000) {
    throw Object.assign(new Error('Document content exceeds 1,000,000 characters'), { status: 413 })
  }

  // Determine next version
  const versionRow = await db.run(sql`
    SELECT COALESCE(MAX(version), 0) + 1 AS next_version
    FROM smart_results
    WHERE document_id = ${docId} AND mode = ${mode}
  `)
  const nextVersion = Number((versionRow.rows[0] as unknown as { next_version: number }).next_version)

  // Create DB record — resultId IS the taskId (unified)
  const resultId = uuidv4()
  await db.run(sql`
    INSERT INTO smart_results (id, document_id, mode, version, status)
    VALUES (${resultId}, ${docId}, ${mode}, ${nextVersion}, 'running')
  `)

  // Register in-process task using resultId as the key
  const ctx = registerTask(resultId, docId, mode)

  const targetLang = options.targetLang ?? '中文'
  const content = doc.content
  const title = doc.title

  // Fire and forget — processor updates DB every chunk
  Promise.resolve().then(async () => {
    try {
      if (mode === 'translate') {
        await runTranslate({ ctx, content, targetLang, resultId })
      } else if (mode === 'summarize') {
        await runSummarize({ ctx, content, resultId })
      } else if (mode === 'brainstorm') {
        await runBrainstorm({ ctx, content, title, docId, resultId })
      }
      emitDone(ctx)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[smart/${mode}] task ${resultId} failed:`, msg)
      await db.run(sql`
        UPDATE smart_results
        SET status = 'error', error = ${msg}, completed_at = unixepoch()
        WHERE id = ${resultId}
      `).catch(() => {})
      emitError(ctx, msg)
    }
  })

  return { taskId: resultId, resultId }
}

/**
 * On startup: mark stale 'running' tasks (>1h old) as 'interrupted'.
 * Call once on first request.
 */
export async function recoverStaleTasks(): Promise<void> {
  await db.run(sql`
    UPDATE smart_results
    SET status = 'interrupted'
    WHERE status = 'running' AND created_at < unixepoch() - 3600
  `).catch(() => {})
}
