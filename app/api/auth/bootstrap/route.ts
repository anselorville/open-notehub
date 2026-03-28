import { NextRequest, NextResponse } from 'next/server'
import { BootstrapOwnerSchema } from '@/lib/schemas/auth'
import { createSession, setSessionCookie } from '@/lib/auth'
import {
  createUserAccount,
  hasOwnerAccount,
  validateBootstrapSetupCode,
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

  const result = BootstrapOwnerSchema.safeParse(body)
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

  if (await hasOwnerAccount()) {
    return NextResponse.json(
      { error: 'bootstrap_unavailable', message: 'Owner already exists' },
      { status: 409 }
    )
  }

  if (!validateBootstrapSetupCode(result.data.setupCode)) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid bootstrap code' },
      { status: 401 }
    )
  }

  const user = await createUserAccount({
    email: result.data.email,
    displayName: result.data.displayName ?? null,
    password: result.data.password,
    role: 'owner',
  })

  const token = await createSession({
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
  })

  const response = NextResponse.json({
    ok: true,
    user,
  })
  await setSessionCookie(response, token)
  return response
}
