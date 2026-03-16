import { Suspense } from 'react'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { DocumentCard } from '@/components/DocumentCard'
import { TagFilter } from '@/components/TagFilter'
import { Input } from '@/components/ui/input'
import Link from 'next/link'

interface SearchParams {
  q?: string
  tag?: string
  page?: string
}

async function getDocuments(params: SearchParams) {
  const page  = Math.max(1, parseInt(params.page ?? '1'))
  const limit = 20
  const offset = (page - 1) * limit
  const { q, tag } = params

  let rows: Record<string, unknown>[]
  let total: number

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
    rows = result.rows as Record<string, unknown>[]
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
    rows = result.rows as Record<string, unknown>[]
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
    rows = result.rows as Record<string, unknown>[]
    total = Number((countResult.rows[0] as unknown as { count: number }).count)
  } else {
    const result = await db.run(sql`
      SELECT id, title, summary, tags, source_url,
             source_type, word_count, read_count, created_at
      FROM documents ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `)
    const countResult = await db.run(sql`SELECT COUNT(*) as count FROM documents`)
    rows = result.rows as Record<string, unknown>[]
    total = Number((countResult.rows[0] as unknown as { count: number }).count)
  }

  const items = rows.map(row => ({
    id: String(row.id),
    title: String(row.title),
    summary: row.summary ? String(row.summary) : null,
    tags: JSON.parse(String(row.tags ?? '[]')) as string[],
    source_url: row.source_url ? String(row.source_url) : null,
    source_type: String(row.source_type ?? 'blog'),
    word_count: Number(row.word_count ?? 0),
    read_count: Number(row.read_count ?? 0),
    created_at: new Date(Number(row.created_at) * 1000).toISOString(),
  }))

  return { items, total, page, limit, hasMore: offset + items.length < total }
}

async function getAllTags(): Promise<string[]> {
  try {
    const result = await db.run(sql`
      SELECT DISTINCT json_each.value as tag
      FROM documents, json_each(documents.tags)
      ORDER BY tag
    `)
    return (result.rows as unknown as { tag: string }[]).map(r => r.tag)
  } catch {
    return []
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const [data, tags] = await Promise.all([
    getDocuments(searchParams),
    getAllTags(),
  ])

  const page = parseInt(searchParams.page ?? '1')

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-20 sm:pb-6">
      {/* Search */}
      <form method="GET" className="mb-4">
        <Input
          name="q"
          defaultValue={searchParams.q}
          placeholder="搜索文档…"
          className="h-10"
        />
      </form>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mb-6">
          <Suspense>
            <TagFilter tags={tags} selected={searchParams.tag} />
          </Suspense>
        </div>
      )}

      {/* Results count */}
      <p className="text-sm text-muted-foreground mb-4">
        共 {data.total} 篇文档
        {searchParams.q && <span>，搜索&ldquo;{searchParams.q}&rdquo;</span>}
      </p>

      {/* Document cards */}
      {data.items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm">暂无文档</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map(doc => (
            <DocumentCard
              key={doc.id}
              id={doc.id}
              title={doc.title}
              summary={doc.summary}
              tags={doc.tags}
              sourceUrl={doc.source_url}
              sourceType={doc.source_type}
              wordCount={doc.word_count}
              createdAt={doc.created_at}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(data.hasMore || page > 1) && (
        <div className="mt-8 flex justify-center gap-4">
          {page > 1 && (
            <Link
              href={`?page=${page - 1}${searchParams.q ? `&q=${searchParams.q}` : ''}${searchParams.tag ? `&tag=${searchParams.tag}` : ''}`}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              ← 上一页
            </Link>
          )}
          {data.hasMore && (
            <Link
              href={`?page=${page + 1}${searchParams.q ? `&q=${searchParams.q}` : ''}${searchParams.tag ? `&tag=${searchParams.tag}` : ''}`}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              下一页 →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
