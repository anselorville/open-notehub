import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { LoginSchema } from '@/lib/schemas/document'
import { createSession, setSessionCookie } from '@/lib/auth'

// Hash is computed once at startup for performance
let passwordHash: string | null = null
async function getPasswordHash(): Promise<string> {
  if (!passwordHash) {
    passwordHash = await bcrypt.hash(process.env.AUTH_PASSWORD!, 12)
  }
  return passwordHash
}

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

  const hash = await getPasswordHash()
  const valid = await bcrypt.compare(result.data.password, hash)

  if (!valid) {
    await new Promise(r => setTimeout(r, 200 + Math.random() * 100))
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid password' },
      { status: 401 }
    )
  }

  const token = await createSession()
  const response = NextResponse.json({ ok: true })
  await setSessionCookie(response, token)
  return response
}
