import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { LoginSchema } from '@/lib/schemas/auth'
import { createSession, setSessionCookie } from '@/lib/auth'
import {
  findUserRecordByEmail,
  hasOwnerAccount,
  touchUserLogin,
} from '@/lib/auth-server'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const result = LoginSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'validation_error', message: 'Validation failed',
        details: result.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  if (!(await hasOwnerAccount())) {
    return NextResponse.json(
      {
        error: 'bootstrap_required',
        message: 'No owner account exists yet',
      },
      { status: 409 }
    )
  }

  const user = await findUserRecordByEmail(result.data.email)
  const valid = user
    ? await bcrypt.compare(result.data.password, user.passwordHash)
    : false

  if (!valid) {
    await new Promise(r => setTimeout(r, 200 + Math.random() * 100))
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid password' },
      { status: 401 }
    )
  }

  if (!user || user.status === 'disabled') {
    return NextResponse.json(
      { error: 'forbidden', message: 'Account is disabled' },
      { status: 403 }
    )
  }

  await touchUserLogin(user.id)
  const token = await createSession({
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
  })

  const response = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role === 'owner' ? 'owner' : 'editor',
      displayName: user.displayName ?? null,
    },
  })
  await setSessionCookie(response, token)
  return response
}
