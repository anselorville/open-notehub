import { NextRequest, NextResponse } from 'next/server'
import { requireRequestUser, createUserAccount, findUserRecordByEmail } from '@/lib/auth-server'
import { listAdminUsers } from '@/lib/admin/data'
import { CreateUserSchema } from '@/lib/schemas/admin'

export async function GET(request: NextRequest) {
  const auth = await requireRequestUser(request, { roles: ['owner'] })
  if ('response' in auth) {
    return auth.response
  }

  return NextResponse.json({
    items: await listAdminUsers(),
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

  const result = CreateUserSchema.safeParse(body)
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

  if (await findUserRecordByEmail(result.data.email)) {
    return NextResponse.json(
      { error: 'conflict', message: 'Email already exists' },
      { status: 409 }
    )
  }

  const user = await createUserAccount({
    email: result.data.email,
    displayName: result.data.displayName ?? null,
    password: result.data.password,
    role: result.data.role,
  })

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      lastLoginAt: null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
  })
}
