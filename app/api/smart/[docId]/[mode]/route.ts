// app/api/smart/[docId]/[mode]/route.ts
// POST: start a new smart task
// GET: list versions for this doc+mode

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { launchTask, SmartMode, recoverStaleTasks } from '@/lib/llm/dispatcher'

const VALID_MODES: SmartMode[] = ['translate', 'summarize', 'brainstorm']

// Run once on cold start (module-level flag)
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
    return NextResponse.json(
      { error: 'invalid_mode', message: `Mode must be one of: ${VALID_MODES.join(', ')}` },
      { status: 400 }
    )
  }

  // Check if a task is already running
  const runningRow = await db.run(sql`
    SELECT id FROM smart_results
    WHERE document_id = ${docId} AND mode = ${mode} AND status = 'running'
    LIMIT 1
  `)
  if (runningRow.rows.length > 0) {
    const existingTaskId = String((runningRow.rows[0] as unknown as { id: string }).id)
    return NextResponse.json(
      { error: 'task_already_running', message: 'A task is already running for this document and mode', taskId: existingTaskId },
      { status: 409 }
    )
  }

  // Parse body for options (e.g. targetLang)
  let options: { targetLang?: string } = {}
  try {
    const body = await req.json().catch(() => ({})) as { target_lang?: string }
    if (body.target_lang) options = { targetLang: String(body.target_lang) }
  } catch { /* no body */ }

  try {
    const { taskId } = await launchTask(docId, mode as SmartMode, options)
    return NextResponse.json({ taskId }, { status: 201 })
  } catch (err) {
    if (err instanceof Error) {
      const status = (err as Error & { status?: number }).status
      if (status === 404) {
        return NextResponse.json({ error: 'document_not_found', message: err.message }, { status: 404 })
      }
      if (status === 413) {
        return NextResponse.json({ error: 'content_too_large', message: err.message }, { status: 413 })
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

    const versions = (rows.rows as unknown as Array<{
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
