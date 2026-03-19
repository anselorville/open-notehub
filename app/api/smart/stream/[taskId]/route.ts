// app/api/smart/stream/[taskId]/route.ts
// SSE endpoint. Streams live chunks if task is running (via registry),
// or replays from DB if task is already done.
//
// taskId in URL === smart_results.id (unified key, see dispatcher.ts)

import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { getTask, subscribe } from '@/lib/llm/task-registry'

interface Params { taskId: string }

function sseEvent(event: string, data: string | object): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  return `event: ${event}\ndata: ${payload}\n\n`
}

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { taskId } = params

  const headers = {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache, no-transform',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  }

  // Case 1: Task is running in registry
  const ctx = getTask(taskId)
  if (ctx) {
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()

        // Race condition guard: re-check task still exists before subscribing
        const freshCtx = getTask(taskId)
        if (!freshCtx) {
          // Task completed between outer check and here
          controller.enqueue(enc.encode(sseEvent('error', { error: 'not_ready', message: 'Task finished, please reload' })))
          controller.close()
          return
        }

        // Send accumulated content so far (catch-up for late subscribers)
        if (freshCtx.accumulated) {
          controller.enqueue(enc.encode(sseEvent('chunk', freshCtx.accumulated)))
        }

        const callbacks = {
          onChunk: (chunk: string) => {
            controller.enqueue(enc.encode(sseEvent('chunk', chunk)))
          },
          onDone: () => {
            controller.enqueue(enc.encode(sseEvent('done', {})))
            controller.close()
          },
          onError: (msg: string) => {
            controller.enqueue(enc.encode(sseEvent('error', { error: 'llm_failed', message: msg })))
            controller.close()
          },
        }

        const unsubscribe = subscribe(freshCtx, callbacks)

        // Client disconnected — unsubscribe but DON'T abort the background task
        req.signal.addEventListener('abort', () => {
          unsubscribe()
        })
      },
    })

    return new Response(stream, { headers })
  }

  // Case 2: Not in registry — look up in DB (task done, error, or interrupted)
  const row = await db.run(sql`
    SELECT status, result, error FROM smart_results WHERE id = ${taskId} LIMIT 1
  `).catch(() => null)

  if (!row || row.rows.length === 0) {
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()
        controller.enqueue(enc.encode(sseEvent('error', { error: 'not_found', message: 'Task not found' })))
        controller.close()
      }
    })
    return new Response(stream, { headers })
  }

  const result = row.rows[0] as unknown as { status: string; result: string | null; error: string | null }
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()
      if (result.status === 'done' && result.result) {
        controller.enqueue(enc.encode(sseEvent('chunk', result.result)))
        controller.enqueue(enc.encode(sseEvent('done', {})))
      } else if (result.status === 'error') {
        controller.enqueue(enc.encode(sseEvent('error', { error: 'llm_failed', message: result.error ?? 'Unknown error' })))
      } else if (result.status === 'interrupted') {
        controller.enqueue(enc.encode(sseEvent('error', { error: 'interrupted', message: '生成中断，请点击重新生成' })))
      } else {
        // still running but not in registry (edge case: process just started)
        controller.enqueue(enc.encode(sseEvent('error', { error: 'not_ready', message: '任务启动中，请稍后重试' })))
      }
      controller.close()
    }
  })

  return new Response(stream, { headers })
}
