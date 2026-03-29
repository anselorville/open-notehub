import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import type {
  ImportPreviewPayload,
  SerializedImportAttempt,
  SerializedImportJob,
} from '@/lib/imports/types'
import type { WebAccessTraceEntry } from '@/lib/web-access/types'

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function serializeImportAttempt(
  attempt: typeof schema.importAttempts.$inferSelect
): SerializedImportAttempt {
  return {
    id: attempt.id,
    jobId: attempt.jobId,
    attemptNumber: attempt.attemptNumber,
    provider: attempt.provider,
    status: attempt.status,
    requestPayload: parseJson<Record<string, unknown> | null>(attempt.requestPayload, null),
    responseSummary: parseJson<Record<string, unknown> | null>(attempt.responseSummary, null),
    trace: parseJson<WebAccessTraceEntry[]>(attempt.trace, []),
    errorCode: attempt.errorCode ?? null,
    errorMessage: attempt.errorMessage ?? null,
    startedAt: attempt.startedAt.toISOString(),
    finishedAt: attempt.finishedAt?.toISOString() ?? null,
  }
}

export function serializeImportJob(
  job: typeof schema.importJobs.$inferSelect,
  attempts: Array<typeof schema.importAttempts.$inferSelect> = []
): SerializedImportJob {
  return {
    id: job.id,
    submittedUrl: job.submittedUrl,
    normalizedUrl: job.normalizedUrl ?? null,
    status: job.status as SerializedImportJob['status'],
    entryPoint: job.entryPoint,
    sourceType: job.sourceType,
    preferredMode: job.preferredMode,
    forcedProvider: job.forcedProvider ?? null,
    selectedProvider: job.selectedProvider ?? null,
    submittedByUserId: job.submittedByUserId ?? null,
    autoCreate: job.autoCreate,
    preview: parseJson<ImportPreviewPayload | null>(job.previewPayload, null),
    trace: parseJson<WebAccessTraceEntry[]>(job.trace, []),
    resultDocumentId: job.resultDocumentId ?? null,
    dedupeDocumentId: job.dedupeDocumentId ?? null,
    errorCode: job.errorCode ?? null,
    errorMessage: job.errorMessage ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    attempts: attempts.map(serializeImportAttempt),
  }
}

export async function listImportJobs(options?: {
  limit?: number
  submittedByUserId?: string | null
}) {
  const jobs = await db.query.importJobs.findMany({
    where: options?.submittedByUserId
      ? eq(schema.importJobs.submittedByUserId, options.submittedByUserId)
      : undefined,
    orderBy: desc(schema.importJobs.createdAt),
    limit: options?.limit ?? 20,
  })

  const items: SerializedImportJob[] = []
  for (const job of jobs) {
    const attempts = await db.query.importAttempts.findMany({
      where: eq(schema.importAttempts.jobId, job.id),
      orderBy: desc(schema.importAttempts.attemptNumber),
    })
    items.push(serializeImportJob(job, attempts.reverse()))
  }

  return items
}

export async function getImportJob(jobId: string) {
  const job = await db.query.importJobs.findFirst({
    where: eq(schema.importJobs.id, jobId),
  })
  if (!job) {
    return null
  }

  const attempts = await db.query.importAttempts.findMany({
    where: eq(schema.importAttempts.jobId, jobId),
    orderBy: desc(schema.importAttempts.attemptNumber),
  })

  return serializeImportJob(job, attempts.reverse())
}
