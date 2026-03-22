import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { LlmApiError } from '../client'

export const LLM_TIMEOUT_MS = 60_000

export function withTimeoutSignal(timeoutMs = LLM_TIMEOUT_MS, signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
}

export function toErrorCode(error: unknown): string {
  if (error instanceof LlmApiError) {
    if (error.providerCode === '1311') return 'llm_model_access_denied'
    if (error.providerCode === '1113') return 'llm_quota_exhausted'
    if (error.status === 401) return 'llm_auth_failed'
    if (error.status === 429) return 'llm_rate_limited'
    return 'llm_api_error'
  }

  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || /aborted|timeout/i.test(error.message)) {
      return 'llm_timeout'
    }
  }
  return 'processing_failed'
}

export async function setSmartProgress(
  resultId: string,
  result: string,
  meta?: Record<string, unknown>
): Promise<void> {
  await db.run(sql`
    UPDATE smart_results
    SET result = ${result}, meta = ${meta ? JSON.stringify(meta) : null}
    WHERE id = ${resultId}
  `)
}

export async function completeSmartResult(
  resultId: string,
  result: string,
  meta?: Record<string, unknown>
): Promise<void> {
  await db.run(sql`
    UPDATE smart_results
    SET
      result = ${result},
      meta = ${meta ? JSON.stringify(meta) : null},
      status = 'done',
      error = null,
      completed_at = unixepoch()
    WHERE id = ${resultId}
  `)
}

export async function failSmartResult(
  resultId: string,
  error: string,
  result?: string,
  meta?: Record<string, unknown>
): Promise<void> {
  await db.run(sql`
    UPDATE smart_results
    SET
      result = ${result ?? null},
      meta = ${meta ? JSON.stringify(meta) : null},
      status = 'error',
      error = ${error},
      completed_at = unixepoch()
    WHERE id = ${resultId}
  `)
}
