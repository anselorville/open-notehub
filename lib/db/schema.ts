import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id:           text('id').primaryKey(),
  email:        text('email').notNull().unique(),
  displayName:  text('display_name'),
  passwordHash: text('password_hash').notNull(),
  role:         text('role').notNull().default('editor'),
  status:       text('status').notNull().default('active'),
  lastLoginAt:  integer('last_login_at', { mode: 'timestamp' }),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull()
                  .default(sql`(unixepoch())`),
  updatedAt:    integer('updated_at', { mode: 'timestamp' }).notNull()
                  .default(sql`(unixepoch())`),
})

export const agents = sqliteTable('agents', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  apiKeyHash:  text('api_key_hash').notNull(),
  description: text('description'),
  isActive:    integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull()
                 .default(sql`(unixepoch())`),
})

export const documents = sqliteTable('documents', {
  id:          text('id').primaryKey(),
  title:       text('title').notNull(),
  content:     text('content').notNull(),
  summary:     text('summary'),
  sourceUrl:   text('source_url'),
  sourceType:  text('source_type').notNull().default('blog'),
  tags:        text('tags').notNull().default('[]'),
  agentId:     text('agent_id').references(() => agents.id),
  userId:      text('user_id').references(() => users.id),
  wordCount:   integer('word_count').notNull().default(0),
  readCount:   integer('read_count').notNull().default(0),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull()
                 .default(sql`(unixepoch())`),
  updatedAt:   integer('updated_at', { mode: 'timestamp' }).notNull()
                 .default(sql`(unixepoch())`),
}, (t) => ({
  createdAtIdx: index('documents_created_at_idx').on(t.createdAt),
}))

export const documentSources = sqliteTable('document_sources', {
  id:            text('id').primaryKey(),
  documentId:    text('document_id').notNull().references(() => documents.id),
  sourceUrl:     text('source_url').notNull(),
  normalizedUrl: text('normalized_url'),
  provider:      text('provider'),
  sourceType:    text('source_type').notNull().default('web'),
  metaJson:      text('meta_json'),
  fetchedAt:     integer('fetched_at', { mode: 'timestamp' }),
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull()
                   .default(sql`(unixepoch())`),
}, (t) => ({
  documentIdx: index('document_sources_document_idx').on(t.documentId),
  normalizedIdx: index('document_sources_normalized_url_idx').on(t.normalizedUrl),
}))

export const importJobs = sqliteTable('import_jobs', {
  id:               text('id').primaryKey(),
  submittedUrl:     text('submitted_url').notNull(),
  normalizedUrl:    text('normalized_url'),
  status:           text('status').notNull().default('queued'),
  entryPoint:       text('entry_point').notNull().default('frontstage'),
  sourceType:       text('source_type').notNull().default('web'),
  preferredMode:    text('preferred_mode').notNull().default('auto'),
  forcedProvider:   text('forced_provider'),
  selectedProvider: text('selected_provider'),
  submittedByUserId:text('submitted_by_user_id').references(() => users.id),
  autoCreate:       integer('auto_create', { mode: 'boolean' }).notNull().default(true),
  previewPayload:   text('preview_payload'),
  trace:            text('trace'),
  resultDocumentId: text('result_document_id').references(() => documents.id),
  dedupeDocumentId: text('dedupe_document_id').references(() => documents.id),
  errorCode:        text('error_code'),
  errorMessage:     text('error_message'),
  createdAt:        integer('created_at', { mode: 'timestamp' }).notNull()
                      .default(sql`(unixepoch())`),
  updatedAt:        integer('updated_at', { mode: 'timestamp' }).notNull()
                      .default(sql`(unixepoch())`),
  completedAt:      integer('completed_at', { mode: 'timestamp' }),
}, (t) => ({
  createdAtIdx: index('import_jobs_created_at_idx').on(t.createdAt),
  statusIdx: index('import_jobs_status_idx').on(t.status),
  submittedByIdx: index('import_jobs_submitted_by_idx').on(t.submittedByUserId),
}))

export const importAttempts = sqliteTable('import_attempts', {
  id:              text('id').primaryKey(),
  jobId:           text('job_id').notNull().references(() => importJobs.id),
  attemptNumber:   integer('attempt_number').notNull().default(1),
  provider:        text('provider').notNull(),
  status:          text('status').notNull().default('running'),
  requestPayload:  text('request_payload'),
  responseSummary: text('response_summary'),
  trace:           text('trace'),
  errorCode:       text('error_code'),
  errorMessage:    text('error_message'),
  startedAt:       integer('started_at', { mode: 'timestamp' }).notNull()
                     .default(sql`(unixepoch())`),
  finishedAt:      integer('finished_at', { mode: 'timestamp' }),
}, (t) => ({
  jobIdx: index('import_attempts_job_idx').on(t.jobId),
  jobAttemptUnique: uniqueIndex('import_attempts_job_attempt_unique').on(t.jobId, t.attemptNumber),
}))

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Agent = typeof agents.$inferSelect
export type NewAgent = typeof agents.$inferInsert
export type ImportJob = typeof importJobs.$inferSelect
export type NewImportJob = typeof importJobs.$inferInsert
export type ImportAttempt = typeof importAttempts.$inferSelect
export type NewImportAttempt = typeof importAttempts.$inferInsert
export type DocumentSource = typeof documentSources.$inferSelect
export type NewDocumentSource = typeof documentSources.$inferInsert

export const smartResults = sqliteTable('smart_results', {
  id:          text('id').primaryKey(),
  documentId:  text('document_id').notNull().references(() => documents.id),
  mode:        text('mode').notNull(),       // 'translate' | 'summarize' | 'brainstorm'
  version:     integer('version').notNull(),
  status:      text('status').notNull().default('running'), // 'running'|'done'|'error'|'interrupted'
  result:      text('result'),
  meta:        text('meta'),                 // JSON string
  error:       text('error'),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull()
                 .default(sql`(unixepoch())`),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
}, (t) => ({
  uniqueDocModeVersion: uniqueIndex('smart_results_doc_mode_version_unique').on(t.documentId, t.mode, t.version),
  docModeIdx:  index('smart_results_doc_mode_version_idx').on(t.documentId, t.mode, t.version),
  statusIdx:   index('smart_results_status_idx').on(t.status),
}))

export type SmartResult = typeof smartResults.$inferSelect
export type NewSmartResult = typeof smartResults.$inferInsert
