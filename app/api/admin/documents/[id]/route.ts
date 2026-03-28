import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { requireRequestUser } from '@/lib/auth-server'
import { db, schema } from '@/lib/db/client'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireRequestUser(request, { roles: ['owner', 'editor'] })
  if ('response' in auth) {
    return auth.response
  }

  const document = await db.query.documents.findFirst({
    where: eq(schema.documents.id, params.id),
  })
  if (!document) {
    return NextResponse.json(
      { error: 'not_found', message: 'Document not found' },
      { status: 404 }
    )
  }

  await db.delete(schema.smartResults).where(eq(schema.smartResults.documentId, params.id))
  await db.delete(schema.documents).where(eq(schema.documents.id, params.id))

  return NextResponse.json({ ok: true })
}
