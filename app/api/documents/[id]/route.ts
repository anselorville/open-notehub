import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { eq, sql } from 'drizzle-orm'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const doc = await db.query.documents.findFirst({
      where: eq(schema.documents.id, params.id),
    })

    if (!doc) {
      return NextResponse.json(
        { error: 'not_found', message: 'Document not found' },
        { status: 404 }
      )
    }

    // Async read_count increment (fire and forget)
    db.run(sql`UPDATE documents SET read_count = read_count + 1 WHERE id = ${params.id}`)
      .catch(err => console.error('[read_count increment]', err))

    return NextResponse.json({
      ...doc,
      tags: JSON.parse(doc.tags),
      created_at: doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : new Date(Number(doc.createdAt) * 1000).toISOString(),
      updated_at: doc.updatedAt instanceof Date
        ? doc.updatedAt.toISOString()
        : new Date(Number(doc.updatedAt) * 1000).toISOString(),
    })
  } catch (err) {
    console.error('[GET /api/documents/:id]', err)
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch document' },
      { status: 500 }
    )
  }
}
