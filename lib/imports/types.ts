import type { WebAccessTraceEntry } from '@/lib/web-access/types'

export type ImportJobStatus =
  | 'queued'
  | 'running'
  | 'needs_review'
  | 'done'
  | 'failed'

export interface ImportPreviewPayload {
  title: string
  excerpt: string
  contentMarkdown: string
  wordCount: number
  siteName?: string
  provider: string
  finalUrl: string
  normalizedUrl: string
  sourceType: string
}

export interface SerializedImportAttempt {
  id: string
  jobId: string
  attemptNumber: number
  provider: string
  status: string
  requestPayload: Record<string, unknown> | null
  responseSummary: Record<string, unknown> | null
  trace: WebAccessTraceEntry[]
  errorCode: string | null
  errorMessage: string | null
  startedAt: string
  finishedAt: string | null
}

export interface SerializedImportJob {
  id: string
  submittedUrl: string
  normalizedUrl: string | null
  status: ImportJobStatus
  entryPoint: string
  sourceType: string
  preferredMode: string
  forcedProvider: string | null
  selectedProvider: string | null
  submittedByUserId: string | null
  autoCreate: boolean
  preview: ImportPreviewPayload | null
  trace: WebAccessTraceEntry[]
  resultDocumentId: string | null
  dedupeDocumentId: string | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  attempts: SerializedImportAttempt[]
}
