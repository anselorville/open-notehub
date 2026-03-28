// lib/llm/dispatcher.ts
// Launches DB-backed smart tasks in the background.

import { db, schema } from '@/lib/db/client'
import { eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { runTranslate } from './processors/translate'
import { runSummarize } from './processors/summarize'
import { runBrainstorm } from './processors/brainstorm'
import { failSmartResult, toErrorCode } from './processors/shared'

export type SmartMode = 'translate' | 'summarize' | 'brainstorm'

export interface LaunchResult {
  taskId: string
  version: number
}

const MAX_VERSIONS = 10

let recovered = false

async function pruneVersions(docId: string, mode: SmartMode): Promise<void> {
  await db.run(sql`
    DELETE FROM smart_results
    WHERE id IN (
      SELECT id
      FROM smart_results
      WHERE document_id = ${docId} AND mode = ${mode}
      ORDER BY version DESC
      LIMIT -1 OFFSET ${MAX_VERSIONS}
    )
  `)
}

export async function launchTask(
  docId: string,
  mode: SmartMode,
  options: { targetLang?: string } = {}
): Promise<LaunchResult> {
  const doc = await db.query.documents.findFirst({
    where: eq(schema.documents.id, docId),
  })
  if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 })

  if (doc.content.length > 1_000_000) {
    throw Object.assign(new Error('Document content exceeds 1,000,000 characters'), {
      status: 413,
    })
  }

  const versionRow = await db.run(sql`
    SELECT COALESCE(MAX(version), 0) + 1 AS next_version
    FROM smart_results
    WHERE document_id = ${docId} AND mode = ${mode}
  `)
  const nextVersion = Number(
    (versionRow.rows[0] as unknown as { next_version: number }).next_version
  )

  const resultId = randomUUID()
  await db.run(sql`
    INSERT INTO smart_results (id, document_id, mode, version, status)
    VALUES (${resultId}, ${docId}, ${mode}, ${nextVersion}, 'running')
  `)
  await pruneVersions(docId, mode)

  const targetLang = options.targetLang ?? '中文'
  const content = doc.content
  const title = doc.title

  Promise.resolve().then(async () => {
    try {
      if (mode === 'translate') {
        await runTranslate({ content, targetLang, resultId })
      } else if (mode === 'summarize') {
        await runSummarize({ content, resultId })
      } else if (mode === 'brainstorm') {
        await runBrainstorm({ content, title, docId, resultId })
      }
    } catch (err) {
      const code = toErrorCode(err)
      console.error(`[smart/${mode}] task ${resultId} failed:`, err)
      await failSmartResult(resultId, code).catch(() => {})
    }
  })

  return { taskId: resultId, version: nextVersion }
}

export async function recoverStaleTasks(): Promise<void> {
  await db
    .run(sql`
      UPDATE smart_results
      SET status = 'interrupted', completed_at = unixepoch()
      WHERE status = 'running' AND created_at < unixepoch() - 3600
    `)
    .catch(() => {})
}

export async function recoverStaleTasksOnce(): Promise<void> {
  if (recovered) return
  recovered = true
  await recoverStaleTasks()
}
