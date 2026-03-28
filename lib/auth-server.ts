import { timingSafeEqual } from 'crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { count, eq } from 'drizzle-orm'
import {
  getSessionToken,
  hasRequiredRole,
  LEGACY_SESSION_COOKIE_NAMES,
  normalizeUserRole,
  SESSION_COOKIE_NAME,
  type SessionClaims,
  type UserRole,
  verifySession,
} from '@/lib/auth'
import { db, schema } from '@/lib/db/client'
import { generateId } from '@/lib/utils'

export const USER_STATUSES = ['active', 'disabled'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export interface AuthenticatedUser {
  id: string
  email: string
  displayName: string | null
  role: UserRole
  status: UserStatus
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function normalizeUserStatus(status: string | null | undefined): UserStatus {
  return status === 'disabled' ? 'disabled' : 'active'
}

function mapAuthenticatedUser(
  user: typeof schema.users.$inferSelect
): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? null,
    role: normalizeUserRole(user.role),
    status: normalizeUserStatus(user.status),
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

function getServerSessionToken() {
  const cookieStore = cookies()
  const currentToken = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (currentToken) {
    return currentToken
  }

  for (const cookieName of LEGACY_SESSION_COOKIE_NAMES) {
    const legacyToken = cookieStore.get(cookieName)?.value
    if (legacyToken) {
      return legacyToken
    }
  }

  return undefined
}

async function hydrateSessionUser(
  claims: SessionClaims | null
): Promise<AuthenticatedUser | null> {
  if (!claims) {
    return null
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, claims.sub),
  })
  if (!user) {
    return null
  }

  const mapped = mapAuthenticatedUser(user)
  if (mapped.status !== 'active') {
    return null
  }

  return mapped
}

export async function getCurrentUser() {
  return hydrateSessionUser(await verifySession(getServerSessionToken()))
}

export async function getRequestUser(request: NextRequest) {
  return hydrateSessionUser(await verifySession(getSessionToken(request)))
}

export async function requirePageUser(options: {
  from: string
  roles?: readonly UserRole[]
  fallbackTo?: string
}) {
  const user = await getCurrentUser()
  if (!user) {
    redirect(`/login?from=${encodeURIComponent(options.from)}`)
  }

  if (options.roles && !hasRequiredRole(user.role, options.roles)) {
    redirect(options.fallbackTo ?? '/admin')
  }

  return user
}

export async function requireRequestUser(
  request: NextRequest,
  options?: { roles?: readonly UserRole[] }
) {
  const user = await getRequestUser(request)
  if (!user) {
    return {
      response: NextResponse.json(
        { error: 'unauthorized', message: 'Authentication required' },
        { status: 401 }
      ),
    }
  }

  if (options?.roles && !hasRequiredRole(user.role, options.roles)) {
    return {
      response: NextResponse.json(
        { error: 'forbidden', message: 'Insufficient permissions' },
        { status: 403 }
      ),
    }
  }

  return { user }
}

export async function hasOwnerAccount() {
  const [result] = await db
    .select({ value: count() })
    .from(schema.users)
    .where(eq(schema.users.role, 'owner'))

  return (result?.value ?? 0) > 0
}

export function requiresBootstrapSetupCode() {
  return Boolean(process.env.AUTH_PASSWORD?.trim())
}

export function validateBootstrapSetupCode(setupCode?: string | null) {
  const expected = process.env.AUTH_PASSWORD?.trim()
  if (!expected) {
    return true
  }

  const actual = setupCode?.trim() ?? ''
  if (actual.length !== expected.length) {
    return false
  }

  return timingSafeEqual(
    Buffer.from(actual, 'utf8'),
    Buffer.from(expected, 'utf8')
  )
}

export async function findUserRecordByEmail(email: string) {
  return db.query.users.findFirst({
    where: eq(schema.users.email, email.trim().toLowerCase()),
  })
}

export async function createUserAccount(input: {
  email: string
  displayName?: string | null
  password: string
  role: UserRole
}) {
  const now = new Date()
  const passwordHash = await bcrypt.hash(input.password, 12)
  const email = input.email.trim().toLowerCase()
  const id = generateId()

  await db.insert(schema.users).values({
    id,
    email,
    displayName: input.displayName?.trim() || null,
    passwordHash,
    role: input.role,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })

  const created = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  })
  if (!created) {
    throw new Error('Failed to load newly created user')
  }

  return mapAuthenticatedUser(created)
}

export async function updateUserPassword(userId: string, password: string) {
  await db
    .update(schema.users)
    .set({
      passwordHash: await bcrypt.hash(password, 12),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId))
}

export async function touchUserLogin(userId: string) {
  await db
    .update(schema.users)
    .set({
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId))
}

export async function countActiveOwners(excludingUserId?: string) {
  const users = await db.query.users.findMany({
    where: eq(schema.users.role, 'owner'),
  })

  return users.filter((user) => {
    const status = normalizeUserStatus(user.status)
    return status === 'active' && user.id !== excludingUserId
  }).length
}
