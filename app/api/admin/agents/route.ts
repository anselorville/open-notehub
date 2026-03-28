import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { listAdminAgents } from '@/lib/admin/data'
import { requireRequestUser } from '@/lib/auth-server'
import { db, schema } from '@/lib/db/client'
import { CreateAgentSchema } from '@/lib/schemas/admin'
import { generateAgentApiKey, generateId } from '@/lib/utils'

function serializeAgent(agent: typeof schema.agents.$inferSelect) {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description ?? null,
    isActive: agent.isActive,
    createdAt: agent.createdAt.toISOString(),
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireRequestUser(request, { roles: ['owner'] })
  if ('response' in auth) {
    return auth.response
  }

  return NextResponse.json({
    items: await listAdminAgents(),
  })
}

export async function POST(request: NextRequest) {
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

  const result = CreateAgentSchema.safeParse(body)
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

  const apiKey = generateAgentApiKey()
  const now = new Date()
  const id = generateId()

  await db.insert(schema.agents).values({
    id,
    name: result.data.name,
    description: result.data.description ?? null,
    apiKeyHash: await bcrypt.hash(apiKey, 12),
    isActive: true,
    createdAt: now,
  })

  const created = await db.query.agents.findFirst({
    where: eq(schema.agents.id, id),
  })
  if (!created) {
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to load newly created agent' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    agent: serializeAgent(created),
    apiKey,
  })
}
