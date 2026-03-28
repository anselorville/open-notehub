import { count, desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

export interface AdminOverviewData {
  counts: {
    totalUsers: number
    activeUsers: number
    totalDocuments: number
    activeAgents: number
    recentDocuments: number
  }
  latestDocuments: Array<{
    id: string
    title: string
    sourceType: string
    ownerEmail: string | null
    createdAt: string
  }>
}

export interface AdminUserListItem {
  id: string
  email: string
  displayName: string | null
  role: string
  status: string
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminDocumentListItem {
  id: string
  title: string
  summary: string | null
  sourceUrl: string | null
  sourceType: string
  wordCount: number
  readCount: number
  ownerEmail: string | null
  agentName: string | null
  createdAt: string
}

export interface AdminAgentListItem {
  id: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: string
}

export async function getAdminOverviewData(): Promise<AdminOverviewData> {
  const [
    totalUsersResult,
    activeUsersResult,
    totalDocumentsResult,
    activeAgentsResult,
    recentDocumentsResult,
    latestDocumentsResult,
  ] = await Promise.all([
    db.select({ value: count() }).from(schema.users),
    db
      .select({ value: count() })
      .from(schema.users)
      .where(eq(schema.users.status, 'active')),
    db.select({ value: count() }).from(schema.documents),
    db
      .select({ value: count() })
      .from(schema.agents)
      .where(eq(schema.agents.isActive, true)),
    db.run(sql`
      SELECT COUNT(*) AS value
      FROM documents
      WHERE created_at >= unixepoch('now', '-7 day')
    `),
    db.run(sql`
      SELECT
        d.id,
        d.title,
        d.source_type,
        u.email AS owner_email,
        d.created_at
      FROM documents d
      LEFT JOIN users u ON u.id = d.user_id
      ORDER BY d.created_at DESC
      LIMIT 6
    `),
  ])

  const totalUsers = totalUsersResult[0]?.value ?? 0
  const activeUsers = activeUsersResult[0]?.value ?? 0
  const totalDocuments = totalDocumentsResult[0]?.value ?? 0
  const activeAgents = activeAgentsResult[0]?.value ?? 0
  const recentDocumentsValue = Number(
    (recentDocumentsResult.rows as Array<{ value?: number | string }>)[0]?.value ?? 0
  )

  return {
    counts: {
      totalUsers: totalUsers ?? 0,
      activeUsers: activeUsers ?? 0,
      totalDocuments: totalDocuments ?? 0,
      activeAgents: activeAgents ?? 0,
      recentDocuments: recentDocumentsValue,
    },
    latestDocuments: (latestDocumentsResult.rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      sourceType: String(row.source_type ?? 'blog'),
      ownerEmail: row.owner_email ? String(row.owner_email) : null,
      createdAt: new Date(Number(row.created_at) * 1000).toISOString(),
    })),
  }
}

export async function listAdminUsers(): Promise<AdminUserListItem[]> {
  const users = await db.query.users.findMany({
    orderBy: desc(schema.users.createdAt),
  })

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? null,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }))
}

export async function listAdminAgents(): Promise<AdminAgentListItem[]> {
  const agents = await db.query.agents.findMany({
    orderBy: desc(schema.agents.createdAt),
  })

  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description ?? null,
    isActive: agent.isActive,
    createdAt: agent.createdAt.toISOString(),
  }))
}

export async function listAdminDocuments(limit = 100): Promise<AdminDocumentListItem[]> {
  const result = await db.run(sql`
    SELECT
      d.id,
      d.title,
      d.summary,
      d.source_url,
      d.source_type,
      d.word_count,
      d.read_count,
      d.created_at,
      u.email AS owner_email,
      a.name AS agent_name
    FROM documents d
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN agents a ON a.id = d.agent_id
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `)

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    summary: row.summary ? String(row.summary) : null,
    sourceUrl: row.source_url ? String(row.source_url) : null,
    sourceType: String(row.source_type ?? 'blog'),
    wordCount: Number(row.word_count ?? 0),
    readCount: Number(row.read_count ?? 0),
    ownerEmail: row.owner_email ? String(row.owner_email) : null,
    agentName: row.agent_name ? String(row.agent_name) : null,
    createdAt: new Date(Number(row.created_at) * 1000).toISOString(),
  }))
}
