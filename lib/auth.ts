import { SignJWT, jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'open_notehub_session'
const LEGACY_COOKIE_NAMES = ['learnhub_session']
const MAX_AGE = 60 * 60 * 24 * 7  // 7 days

function getSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET!)
}

export async function createSession(): Promise<string> {
  return new SignJWT({ role: 'user' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(getSecret())
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret())
    return true
  } catch {
    return false
  }
}

export async function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
}

export async function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  for (const legacyCookieName of LEGACY_COOKIE_NAMES) {
    response.cookies.set(legacyCookieName, '', { maxAge: 0, path: '/' })
  }
}

export function getSessionToken(request: NextRequest): string | undefined {
  const currentToken = request.cookies.get(COOKIE_NAME)?.value
  if (currentToken) return currentToken

  for (const legacyCookieName of LEGACY_COOKIE_NAMES) {
    const legacyToken = request.cookies.get(legacyCookieName)?.value
    if (legacyToken) return legacyToken
  }

  return undefined
}
