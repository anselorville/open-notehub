import { count, eq, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { type AuthenticatedUser } from '@/lib/auth-server'
import type { ImportPreviewPayload, SerializedImportJob } from '@/lib/imports/types'
import { getImportJob } from '@/lib/imports/data'
import { countWords, generateId } from '@/lib/utils'
import { fetchWebAccess } from '@/lib/web-access/service'
import { type WebAccessProviderId, WEB_ACCESS_PROVIDER_IDS } from '@/lib/web-access/types'
import { inferSourceType, normalizeWebUrl, toExcerpt } from '@/lib/web-access/url'

function shouldRequireReview(preview: ImportPreviewPayload, autoCreate: boolean) {
  if (!autoCreate) {
    return true
  }

  return preview.contentMarkdown.length < 400 || preview.wordCount < 120
}

async function findDuplicateDocumentId(normalizedUrl: string, submittedUrl: string) {
  const sourceMatch = await db.query.documentSources.findFirst({
    where: eq(schema.documentSources.normalizedUrl, normalizedUrl),
  })
  if (sourceMatch) {
    return sourceMatch.documentId
  }

  const documentMatch = await db.query.documents.findFirst({
    where: or(
      eq(schema.documents.sourceUrl, normalizedUrl),
      eq(schema.documents.sourceUrl, submittedUrl)
    ),
  })

  return documentMatch?.id ?? null
}

async function createDocumentFromPreview(input: {
  job: typeof schema.importJobs.$inferSelect
  preview: ImportPreviewPayload
}) {
  const duplicateDocumentId = await findDuplicateDocumentId(
    input.preview.normalizedUrl,
    input.job.submittedUrl
  )
  if (duplicateDocumentId) {
    return { documentId: duplicateDocumentId, deduped: true }
  }

  const now = new Date()
  const documentId = generateId()

  await db.insert(schema.documents).values({
    id: documentId,
    title: input.preview.title,
    content: input.preview.contentMarkdown,
    summary: input.preview.excerpt || toExcerpt(input.preview.contentMarkdown),
    sourceUrl: input.preview.finalUrl,
    sourceType: input.preview.sourceType,
    tags: JSON.stringify([]),
    userId: input.job.submittedByUserId ?? null,
    agentId: null,
    wordCount: input.preview.wordCount,
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(schema.documentSources).values({
    id: generateId(),
    documentId,
    sourceUrl: input.preview.finalUrl,
    normalizedUrl: input.preview.normalizedUrl,
    provider: input.preview.provider,
    sourceType: input.preview.sourceType,
    metaJson: JSON.stringify({
      importedFromJobId: input.job.id,
      siteName: input.preview.siteName ?? null,
    }),
    fetchedAt: now,
    createdAt: now,
  })

  return { documentId, deduped: false }
}

function buildPreviewPayload(result: Awaited<ReturnType<typeof fetchWebAccess>>): ImportPreviewPayload {
  const contentMarkdown = result.contentMarkdown?.trim() ?? ''
  const title = pickPreviewTitle(result.finalUrl, result.siteName, result.title, contentMarkdown)
  return {
    title,
    excerpt: result.excerpt?.trim() || toExcerpt(contentMarkdown),
    contentMarkdown,
    wordCount: countWords(contentMarkdown),
    siteName: result.siteName,
    provider: result.provider,
    finalUrl: result.finalUrl,
    normalizedUrl: result.normalizedUrl,
    sourceType: inferSourceType(result.finalUrl),
  }
}

function isWeakTitle(
  title: string | undefined,
  finalUrl: string,
  siteName?: string
) {
  if (!title) {
    return true
  }

  const normalized = title.trim().toLowerCase()
  if (!normalized) {
    return true
  }

  const hostname = new URL(finalUrl).hostname.replace(/^www\./, '').toLowerCase()
  const normalizedSiteName = siteName?.trim().toLowerCase()
  return (
    normalized.length < 3 ||
    normalized === hostname ||
    normalized === normalizedSiteName ||
    ['x', 'x.com', 'twitter', 'twitter.com'].includes(normalized)
  )
}

function pickTitleFromContent(contentMarkdown: string) {
  const lines = contentMarkdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const rawLine of lines) {
    const line = rawLine.replace(/^[#>*\-\s]+/, '').trim()
    if (!line) {
      continue
    }

    if (/^(url source|published time|warning):/i.test(line)) {
      continue
    }

    if (/^(don['’]t miss what['’]s happening|people on x are the first to know|log in|sign up|post|conversation)$/i.test(line)) {
      continue
    }

    if (/^title:\s*/i.test(line)) {
      const title = line.replace(/^title:\s*/i, '').trim()
      if (title && !['x', 'x.com'].includes(title.toLowerCase())) {
        return title
      }
      continue
    }

    if (line.length >= 12) {
      return line
    }
  }

  return null
}

function pickPreviewTitle(
  finalUrl: string,
  siteName: string | undefined,
  resultTitle: string | undefined,
  contentMarkdown: string
) {
  if (!isWeakTitle(resultTitle, finalUrl, siteName)) {
    return resultTitle!.trim()
  }

  const derivedTitle = pickTitleFromContent(contentMarkdown)
  if (derivedTitle && !isWeakTitle(derivedTitle, finalUrl, siteName)) {
    return derivedTitle
  }

  return new URL(finalUrl).hostname
}

async function getPreviousFailedProviders(jobId: string) {
  const attempts = await db.query.importAttempts.findMany({
    where: eq(schema.importAttempts.jobId, jobId),
  })

  const seen = new Set<WebAccessProviderId>()
  for (const attempt of attempts) {
    const provider = attempt.provider
    if (
      attempt.status === 'failed' &&
      WEB_ACCESS_PROVIDER_IDS.includes(provider as WebAccessProviderId)
    ) {
      seen.add(provider as WebAccessProviderId)
    }
  }

  return Array.from(seen)
}

async function updateJobStatus(
  jobId: string,
  updates: Partial<typeof schema.importJobs.$inferInsert>
) {
  await db
    .update(schema.importJobs)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(schema.importJobs.id, jobId))
}

export async function processImportJob(jobId: string) {
  const job = await db.query.importJobs.findFirst({
    where: eq(schema.importJobs.id, jobId),
  })
  if (!job) {
    return null
  }

  await updateJobStatus(jobId, {
    status: 'running',
    errorCode: null,
    errorMessage: null,
    completedAt: null,
  })

  const [attemptCountResult] = await db
    .select({ value: count() })
    .from(schema.importAttempts)
    .where(eq(schema.importAttempts.jobId, jobId))
  const attemptNumber = (attemptCountResult?.value ?? 0) + 1
  const attemptId = generateId()

  await db.insert(schema.importAttempts).values({
    id: attemptId,
    jobId,
    attemptNumber,
    provider: job.forcedProvider ?? 'pending',
    status: 'running',
    requestPayload: JSON.stringify({
      url: job.submittedUrl,
      preferredMode: job.preferredMode,
      forceProvider: job.forcedProvider,
      entryPoint: job.entryPoint,
      autoCreate: job.autoCreate,
    }),
    startedAt: new Date(),
  })

  const result = await fetchWebAccess({
    url: job.submittedUrl,
    purpose: job.autoCreate ? 'import' : 'preview',
    preferredMode: job.preferredMode as 'auto' | 'static' | 'browser',
    forceProvider: job.forcedProvider,
    previousFailedProviders: await getPreviousFailedProviders(jobId),
    trace: true,
  })

  const attemptBase = {
    provider: result.provider,
    responseSummary: JSON.stringify({
      status: result.status,
      title: result.title ?? null,
      siteName: result.siteName ?? null,
      finalUrl: result.finalUrl,
      normalizedUrl: result.normalizedUrl,
      contentLength: result.contentMarkdown?.length ?? 0,
    }),
    trace: JSON.stringify(result.trace),
    errorCode: result.errorCode ?? null,
    errorMessage: result.errorMessage ?? null,
    finishedAt: new Date(),
  } satisfies Partial<typeof schema.importAttempts.$inferInsert>

  if (result.status === 'failed' || !result.contentMarkdown) {
    await db
      .update(schema.importAttempts)
      .set({
        ...attemptBase,
        status: 'failed',
      })
      .where(eq(schema.importAttempts.id, attemptId))

    await updateJobStatus(jobId, {
      status: 'failed',
      normalizedUrl: result.normalizedUrl,
      selectedProvider: result.provider,
      trace: JSON.stringify(result.trace),
      errorCode: result.errorCode ?? 'fetch_failed',
      errorMessage: result.errorMessage ?? 'Unable to import this URL',
      completedAt: new Date(),
    })

    return getImportJob(jobId)
  }

  const preview = buildPreviewPayload(result)
  const duplicateDocumentId = await findDuplicateDocumentId(
    preview.normalizedUrl,
    job.submittedUrl
  )

  await db
    .update(schema.importAttempts)
    .set({
      ...attemptBase,
      status: result.status === 'partial' ? 'partial' : 'done',
    })
    .where(eq(schema.importAttempts.id, attemptId))

  if (duplicateDocumentId) {
    await updateJobStatus(jobId, {
      status: 'done',
      normalizedUrl: preview.normalizedUrl,
      selectedProvider: result.provider,
      previewPayload: JSON.stringify(preview),
      trace: JSON.stringify(result.trace),
      resultDocumentId: duplicateDocumentId,
      dedupeDocumentId: duplicateDocumentId,
      completedAt: new Date(),
    })

    return getImportJob(jobId)
  }

  if (shouldRequireReview(preview, job.autoCreate)) {
    await updateJobStatus(jobId, {
      status: 'needs_review',
      normalizedUrl: preview.normalizedUrl,
      selectedProvider: result.provider,
      previewPayload: JSON.stringify(preview),
      trace: JSON.stringify(result.trace),
      completedAt: new Date(),
    })

    return getImportJob(jobId)
  }

  const created = await createDocumentFromPreview({ job, preview })
  await updateJobStatus(jobId, {
    status: 'done',
    normalizedUrl: preview.normalizedUrl,
    selectedProvider: result.provider,
    previewPayload: JSON.stringify(preview),
    trace: JSON.stringify(result.trace),
    resultDocumentId: created.documentId,
    dedupeDocumentId: created.deduped ? created.documentId : null,
    completedAt: new Date(),
  })

  return getImportJob(jobId)
}

function triggerProcessing(jobId: string) {
  void processImportJob(jobId).catch((error) => {
    console.error('[processImportJob]', jobId, error)
  })
}

export async function createImportJob(input: {
  url: string
  entryPoint: 'frontstage' | 'admin'
  preferredMode?: 'auto' | 'static' | 'browser'
  forceProvider?: string | null
  autoCreate?: boolean
  user: AuthenticatedUser
}) {
  const now = new Date()
  const normalizedUrl = normalizeWebUrl(input.url)
  const jobId = generateId()

  await db.insert(schema.importJobs).values({
    id: jobId,
    submittedUrl: input.url,
    normalizedUrl,
    status: 'queued',
    entryPoint: input.entryPoint,
    sourceType: inferSourceType(input.url),
    preferredMode: input.preferredMode ?? 'auto',
    forcedProvider: input.forceProvider ?? null,
    submittedByUserId: input.user.id,
    autoCreate:
      input.autoCreate ?? (input.entryPoint === 'frontstage'),
    createdAt: now,
    updatedAt: now,
  })

  triggerProcessing(jobId)

  const created = await getImportJob(jobId)
  if (!created) {
    throw new Error('Failed to load import job after creation')
  }

  return created
}

export async function retryImportJob(input: {
  jobId: string
  forceProvider?: string | null
  autoCreate?: boolean
  preferredMode?: 'auto' | 'static' | 'browser'
}) {
  const job = await db.query.importJobs.findFirst({
    where: eq(schema.importJobs.id, input.jobId),
  })
  if (!job) {
    return null
  }

  await updateJobStatus(input.jobId, {
    status: 'queued',
    forcedProvider:
      input.forceProvider === undefined ? job.forcedProvider : input.forceProvider,
    preferredMode: input.preferredMode ?? job.preferredMode,
    autoCreate: input.autoCreate ?? job.autoCreate,
    selectedProvider: null,
    errorCode: null,
    errorMessage: null,
    trace: null,
    resultDocumentId: null,
    dedupeDocumentId: null,
    completedAt: null,
  })

  triggerProcessing(input.jobId)
  return getImportJob(input.jobId)
}

export async function finalizeImportJob(jobId: string): Promise<SerializedImportJob | null> {
  const job = await db.query.importJobs.findFirst({
    where: eq(schema.importJobs.id, jobId),
  })
  if (!job) {
    return null
  }

  if (job.resultDocumentId) {
    return getImportJob(jobId)
  }

  const preview = job.previewPayload
    ? (JSON.parse(job.previewPayload) as ImportPreviewPayload)
    : null
  if (!preview) {
    return null
  }

  const created = await createDocumentFromPreview({ job, preview })
  await updateJobStatus(jobId, {
    status: 'done',
    resultDocumentId: created.documentId,
    dedupeDocumentId: created.deduped ? created.documentId : null,
    completedAt: new Date(),
  })

  return getImportJob(jobId)
}
