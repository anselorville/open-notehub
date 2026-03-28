import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { requireRequestUser } from '@/lib/auth-server'
import { db, schema } from '@/lib/db/client'
import { UpdateAgentSchema } from '@/lib/schemas/admin'
import { generateAgentApiKey } from '@/lib/utils'

function serializeAgent(agent: typeof schema.agents.$inferSelect) {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description ?? null,
    isActive: agent.isActive,
    createdAt: agent.createdAt.toISOString(),
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireRequestUser(request, { roles: ['owner'] })
  if ('response' in auth) {
    return auth.response
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const result = UpdateAgentSchema.safeParse(body)
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

  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, params.id),
  })
  if (!agent) {
    return NextResponse.json(
      { error: 'not_found', message: 'Agent not found' },
      { status: 404 }
    )
  }

  const updates: Partial<typeof schema.agents.$inferInsert> = {}
  if (result.data.name !== undefined) {
    updates.name = result.data.name
  }
  if (result.data.description !== undefined) {
    updates.description = result.data.description
  }
  if (result.data.isActive !== undefined) {
    updates.isActive = result.data.isActive
  }

  let apiKey: string | null = null
  if (result.data.rotateKey) {
    apiKey = generateAgentApiKey()
    updates.apiKeyHash = await bcrypt.hash(apiKey, 12)
  }

  if (Object.keys(updates).length > 0) {
    await db.update(schema.agents).set(updates).where(eq(schema.agents.id, params.id))
  }

  const updated = await db.query.agents.findFirst({
    where: eq(schema.agents.id, params.id),
  })
  if (!updated) {
    return NextResponse.json(
      { error: 'not_found', message: 'Agent not found after update' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    agent: serializeAgent(updated),
    apiKey,
  })
}
