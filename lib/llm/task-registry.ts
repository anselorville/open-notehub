// lib/llm/task-registry.ts
// In-process task registry. Single source of truth for running tasks.
// DB is written by processors (every chunk). Registry is for live subscribers.

export type SubscriberCallback = (chunk: string) => void
export type DoneCallback = () => void
export type ErrorCallback = (err: string) => void

export interface TaskContext {
  taskId:      string
  docId:       string
  mode:        string
  accumulated: string          // all emitted text so far
  subscribers: Array<{ onChunk: SubscriberCallback; onDone: DoneCallback; onError: ErrorCallback }>
  abortController: AbortController
}

// Module-level singleton — survives across requests in the same Node.js process
const registry = new Map<string, TaskContext>()

export function registerTask(taskId: string, docId: string, mode: string): TaskContext {
  const ctx: TaskContext = {
    taskId,
    docId,
    mode,
    accumulated: '',
    subscribers: [],
    abortController: new AbortController(),
  }
  registry.set(taskId, ctx)
  return ctx
}

export function getTask(taskId: string): TaskContext | undefined {
  return registry.get(taskId)
}

export function removeTask(taskId: string): void {
  registry.delete(taskId)
}

/**
 * Emit a text chunk to all subscribers and append to accumulated.
 */
export function emitChunk(ctx: TaskContext, chunk: string): void {
  ctx.accumulated += chunk
  for (let i = 0; i < ctx.subscribers.length; i++) {
    ctx.subscribers[i].onChunk(chunk)
  }
}

/**
 * Signal task completion to all subscribers, then remove from registry.
 */
export function emitDone(ctx: TaskContext): void {
  for (let i = 0; i < ctx.subscribers.length; i++) {
    ctx.subscribers[i].onDone()
  }
  registry.delete(ctx.taskId)
}

/**
 * Signal task error to all subscribers, then remove from registry.
 */
export function emitError(ctx: TaskContext, message: string): void {
  for (let i = 0; i < ctx.subscribers.length; i++) {
    ctx.subscribers[i].onError(message)
  }
  registry.delete(ctx.taskId)
}

/**
 * Subscribe to a running task. Returns an unsubscribe function.
 */
export function subscribe(
  ctx: TaskContext,
  callbacks: { onChunk: SubscriberCallback; onDone: DoneCallback; onError: ErrorCallback }
): () => void {
  ctx.subscribers.push(callbacks)
  return () => {
    const idx = ctx.subscribers.indexOf(callbacks)
    if (idx !== -1) ctx.subscribers.splice(idx, 1)
  }
}
