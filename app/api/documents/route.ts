import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q     = searchParams.get('q')?.trim()
  const tag   = searchParams.get('tag')?.trim()
  const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20')))
  const offset = (page - 1) * limit

  try {
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

    const items = (rows).map(row => ({
      id: String(row.id),
      title: String(row.title),
      summary: row.summary ? String(row.summary) : null,
      tags: JSON.parse(String(row.tags ?? '[]')),
      source_url: row.source_url ? String(row.source_url) : null,
      source_type: String(row.source_type ?? 'blog'),
      word_count: Number(row.word_count ?? 0),
      read_count: Number(row.read_count ?? 0),
      created_at: new Date(Number(row.created_at) * 1000).toISOString(),
    }))

    return NextResponse.json({ items, total, page, limit, hasMore: offset + items.length < total })
  } catch (err) {
    console.error('[GET /api/documents]', err)
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch documents' },
      { status: 500 }
    )
  }
}
