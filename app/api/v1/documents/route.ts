import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { CreateDocumentSchema } from '@/lib/schemas/document'
import { verifyAgentKey } from '@/lib/agent-auth'
import { generateId, countWords } from '@/lib/utils'

export async function POST(request: NextRequest) {
  // 1. Verify Agent API key
  const agent = await verifyAgentKey(request.headers.get('authorization'))
  if (!agent) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid or missing API key' },
      { status: 401 }
    )
  }

  // 2. Parse body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  // 3. Check content size before full parse
  const raw = JSON.stringify(body)
  if (raw.length > 2_000_000) {
    return NextResponse.json(
      { error: 'content_too_large', message: 'Request body exceeds limit' },
      { status: 413 }
    )
  }

  // 4. Validate with Zod
  const result = CreateDocumentSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      {
        error: 'validation_error',
        message: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      },
      { status: 422 }
    )
  }

  const data = result.data

  // 5. Insert document
  try {
    const id = generateId()
    const now = new Date()
    const wordCount = countWords(data.content)

    await db.insert(schema.documents).values({
      id,
      title: data.title,
      content: data.content,
      summary: data.summary ?? null,
      sourceUrl: data.source_url ?? null,
      sourceType: data.source_type,
      tags: JSON.stringify(data.tags),
      agentId: agent.id,
      wordCount,
      createdAt: now,
      updatedAt: now,
    })

    return NextResponse.json(
      { id, created_at: now.toISOString() },
      { status: 201 }
    )
  } catch (err) {
    console.error('[POST /api/v1/documents]', err)
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to save document' },
      { status: 500 }
    )
  }
}
