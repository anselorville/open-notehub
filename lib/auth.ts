import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest, NextResponse } from 'next/server'

export const SESSION_COOKIE_NAME = 'open_notehub_session'
export const LEGACY_SESSION_COOKIE_NAMES = ['learnhub_session']
const MAX_AGE = 60 * 60 * 24 * 7

export const USER_ROLES = ['owner', 'editor'] as const
export type UserRole = (typeof USER_ROLES)[number]

export interface SessionClaims {
  sub: string
  email: string
  role: UserRole
  name: string | null
}

function getSecret() {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET is required')
  }

  return new TextEncoder().encode(secret)
}

export function normalizeUserRole(role: string | null | undefined): UserRole {
  return role === 'owner' ? 'owner' : 'editor'
}

export function hasRequiredRole(role: UserRole, allowedRoles: readonly UserRole[]) {
  return allowedRoles.includes(role)
}

export async function createSession(user: {
  id: string
  email: string
  role: string
  displayName?: string | null
}): Promise<string> {
  return new SignJWT({
    email: user.email,
    role: normalizeUserRole(user.role),
    name: user.displayName ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(getSecret())
}

export async function verifySession(token?: string): Promise<SessionClaims | null> {
  if (!token) {
    return null
  }

  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      return null
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: normalizeUserRole(
        typeof payload.role === 'string' ? payload.role : undefined
      ),
      name: typeof payload.name === 'string' ? payload.name : null,
    }
  } catch {
    return null
  }
}

export async function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
}

export async function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, '', { maxAge: 0, path: '/' })
  for (const legacyCookieName of LEGACY_SESSION_COOKIE_NAMES) {
    response.cookies.set(legacyCookieName, '', { maxAge: 0, path: '/' })
  }
}

export function getSessionToken(
  request: Pick<NextRequest, 'cookies'>
): string | undefined {
  const currentToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (currentToken) return currentToken

  for (const legacyCookieName of LEGACY_SESSION_COOKIE_NAMES) {
    const legacyToken = request.cookies.get(legacyCookieName)?.value
    if (legacyToken) return legacyToken
  }

  return undefined
}
