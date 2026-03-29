import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'

export interface LibrarySearchParams {
  q?: string
  tag?: string
  page?: string
  limit?: number
}

export interface LibraryDocumentListItem {
  id: string
  title: string
  summary?: string | null
  tags: string[]
  source_url?: string | null
  source_type: string
  word_count: number
  read_count: number
  created_at: string
}

export interface LibraryHomeData {
  items: LibraryDocumentListItem[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

interface RawDocumentRow {
  id: unknown
  title: unknown
  summary: unknown
  tags: unknown
  source_url: unknown
  source_type: unknown
  word_count: unknown
  read_count: unknown
  created_at: unknown
}

function mapDocumentRow(row: RawDocumentRow): LibraryDocumentListItem {
  return {
    id: String(row.id),
    title: String(row.title),
    summary: row.summary ? String(row.summary) : null,
    tags: JSON.parse(String(row.tags ?? '[]')) as string[],
    source_url: row.source_url ? String(row.source_url) : null,
    source_type: String(row.source_type ?? 'blog'),
    word_count: Number(row.word_count ?? 0),
    read_count: Number(row.read_count ?? 0),
    created_at: new Date(Number(row.created_at) * 1000).toISOString(),
  }
}

export async function getLibraryDocuments(params: LibrarySearchParams): Promise<LibraryHomeData> {
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const limit = Math.min(100, Math.max(1, params.limit ?? 20))
  const offset = (page - 1) * limit
  const q = params.q?.trim()
  const tag = params.tag?.trim()

  let rows: RawDocumentRow[]
  let total = 0

  if (q && tag) {
    const result = await db.run(sql`
      SELECT DISTINCT d.id, d.title, d.summary, d.tags, d.source_url,
             d.source_type, d.word_count, d.read_count, d.created_at
      FROM documents d, json_each(d.tags)
      WHERE json_each.value = ${tag}
      AND d.rowid IN (SELECT rowid FROM documents_fts WHERE documents_fts MATCH ${q + '*'})
      ORDER BY d.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `)
    const countResult = await db.run(sql`
      SELECT COUNT(DISTINCT d.id) as count
      FROM documents d, json_each(d.tags)
      WHERE json_each.value = ${tag}
      AND d.rowid IN (SELECT rowid FROM documents_fts WHERE documents_fts MATCH ${q + '*'})
    `)
    rows = result.rows as unknown as RawDocumentRow[]
    total = Number((countResult.rows[0] as unknown as { count: number }).count)
  } else if (q) {
    const result = await db.run(sql`
      SELECT d.id, d.title, d.summary, d.tags, d.source_url,
             d.source_type, d.word_count, d.read_count, d.created_at
      FROM documents d
      WHERE d.rowid IN (SELECT rowid FROM documents_fts WHERE documents_fts MATCH ${q + '*'})
      ORDER BY d.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `)
    const countResult = await db.run(sql`
      SELECT COUNT(*) as count FROM documents
      WHERE rowid IN (SELECT rowid FROM documents_fts WHERE documents_fts MATCH ${q + '*'})
    `)
    rows = result.rows as unknown as RawDocumentRow[]
    total = Number((countResult.rows[0] as unknown as { count: number }).count)
  } else if (tag) {
    const result = await db.run(sql`
      SELECT DISTINCT d.id, d.title, d.summary, d.tags, d.source_url,
             d.source_type, d.word_count, d.read_count, d.created_at
      FROM documents d, json_each(d.tags)
      WHERE json_each.value = ${tag}
      ORDER BY d.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `)
    const countResult = await db.run(sql`
      SELECT COUNT(DISTINCT d.id) as count
      FROM documents d, json_each(d.tags)
      WHERE json_each.value = ${tag}
    `)
    rows = result.rows as unknown as RawDocumentRow[]
    total = Number((countResult.rows[0] as unknown as { count: number }).count)
  } else {
    const result = await db.run(sql`
      SELECT id, title, summary, tags, source_url,
             source_type, word_count, read_count, created_at
      FROM documents
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `)
    const countResult = await db.run(sql`SELECT COUNT(*) as count FROM documents`)
    rows = result.rows as unknown as RawDocumentRow[]
    total = Number((countResult.rows[0] as unknown as { count: number }).count)
  }

  const items = rows.map(mapDocumentRow)
  return {
    items,
    total,
    page,
    limit,
    hasMore: offset + items.length < total,
  }
}

export async function getAllLibraryTags(): Promise<string[]> {
  try {
    const result = await db.run(sql`
      SELECT DISTINCT json_each.value as tag
      FROM documents, json_each(documents.tags)
      ORDER BY tag
    `)
    return (result.rows as unknown as Array<{ tag: string }>).map((row) => row.tag)
  } catch {
    return []
  }
}

export async function getLibraryCandidates(limit = 250): Promise<LibraryDocumentListItem[]> {
  const result = await db.run(sql`
    SELECT id, title, summary, tags, source_url,
           source_type, word_count, read_count, created_at
    FROM documents
    ORDER BY created_at DESC
    LIMIT ${limit}
  `)

  return (result.rows as unknown as RawDocumentRow[]).map(mapDocumentRow)
}
