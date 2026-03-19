import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  index,
} from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id:           text('id').primaryKey(),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role:         text('role').notNull().default('user'),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull()
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

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert

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
  docModeIdx:  index('smart_results_doc_mode_version_idx').on(t.documentId, t.mode, t.version),
  statusIdx:   index('smart_results_status_idx').on(t.status),
}))

export type SmartResult = typeof smartResults.$inferSelect
export type NewSmartResult = typeof smartResults.$inferInsert
