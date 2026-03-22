import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { recoverStaleTasksOnce, SmartMode } from '@/lib/llm/dispatcher'

const VALID_MODES: SmartMode[] = ['translate', 'summarize', 'brainstorm']

interface Params {
  docId: string
  mode: string
  taskId: string
}

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  await recoverStaleTasksOnce()

  const { docId, mode, taskId } = params

  if (!VALID_MODES.includes(mode as SmartMode)) {
    return NextResponse.json({ error: 'invalid_mode', message: 'Invalid mode' }, { status: 400 })
  }

  try {
    const row = await db.run(sql`
      SELECT id, status, result, version, created_at, completed_at, error, meta
      FROM smart_results
      WHERE id = ${taskId} AND document_id = ${docId} AND mode = ${mode}
      LIMIT 1
    `)

    if (!row.rows.length) {
      return NextResponse.json({ error: 'task_not_found', message: 'Task not found' }, { status: 404 })
    }

    const task = row.rows[0] as unknown as {
      id: string
      status: string
      result: string | null
      version: number
      created_at: number
      completed_at: number | null
      error: string | null
      meta: string | null
    }

    return NextResponse.json({
      taskId: task.id,
      status: task.status,
      result: task.result ?? '',
      version: task.version,
      createdAt: new Date(task.created_at * 1000).toISOString(),
      completedAt: task.completed_at ? new Date(task.completed_at * 1000).toISOString() : null,
      error: task.error,
      meta: task.meta ? JSON.parse(task.meta) : null,
    })
  } catch (error) {
    console.error('[GET /api/smart/task]', error)
    return NextResponse.json({ error: 'internal_error', message: 'Failed to fetch task status' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  await recoverStaleTasksOnce()

  const { docId, mode, taskId } = params

  if (!VALID_MODES.includes(mode as SmartMode)) {
    return NextResponse.json({ error: 'invalid_mode', message: 'Invalid mode' }, { status: 400 })
  }

  try {
    const row = await db.run(sql`
      SELECT status
      FROM smart_results
      WHERE id = ${taskId} AND document_id = ${docId} AND mode = ${mode}
      LIMIT 1
    `)

    if (!row.rows.length) {
      return NextResponse.json({ error: 'task_not_found', message: 'Task not found' }, { status: 404 })
    }

    const status = String((row.rows[0] as unknown as { status: string }).status)
    if (status === 'running') {
      return NextResponse.json(
        { error: 'task_running', message: 'Running versions cannot be deleted' },
        { status: 409 }
      )
    }

    await db.run(sql`
      DELETE FROM smart_results
      WHERE id = ${taskId} AND document_id = ${docId} AND mode = ${mode}
    `)

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[DELETE /api/smart/task]', error)
    return NextResponse.json({ error: 'internal_error', message: 'Failed to delete task' }, { status: 500 })
  }
}
