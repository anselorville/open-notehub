import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import {
  countActiveOwners,
  requireRequestUser,
  updateUserPassword,
} from '@/lib/auth-server'
import { db, schema } from '@/lib/db/client'
import { UpdateUserSchema } from '@/lib/schemas/admin'

function serializeUser(user: typeof schema.users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? null,
    role: user.role === 'owner' ? 'owner' : 'editor',
    status: user.status === 'disabled' ? 'disabled' : 'active',
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
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

  const result = UpdateUserSchema.safeParse(body)
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

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, params.id),
  })
  if (!user) {
    return NextResponse.json(
      { error: 'not_found', message: 'User not found' },
      { status: 404 }
    )
  }

  const nextRole = result.data.role ?? (user.role === 'owner' ? 'owner' : 'editor')
  const nextStatus =
    result.data.status ?? (user.status === 'disabled' ? 'disabled' : 'active')

  const wouldDeactivateOwner =
    user.role === 'owner' && (nextRole !== 'owner' || nextStatus !== 'active')
  if (wouldDeactivateOwner && (await countActiveOwners(user.id)) === 0) {
    return NextResponse.json(
      {
        error: 'invalid_operation',
        message: 'At least one active owner must remain',
      },
      { status: 400 }
    )
  }

  const updates: Partial<typeof schema.users.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (result.data.displayName !== undefined) {
    updates.displayName = result.data.displayName
  }
  if (result.data.role) {
    updates.role = result.data.role
  }
  if (result.data.status) {
    updates.status = result.data.status
  }

  if (Object.keys(updates).length > 1) {
    await db.update(schema.users).set(updates).where(eq(schema.users.id, params.id))
  }

  if (result.data.password) {
    await updateUserPassword(params.id, result.data.password)
  }

  const updated = await db.query.users.findFirst({
    where: eq(schema.users.id, params.id),
  })
  if (!updated) {
    return NextResponse.json(
      { error: 'not_found', message: 'User not found after update' },
      { status: 404 }
    )
  }

  return NextResponse.json({ user: serializeUser(updated) })
}
