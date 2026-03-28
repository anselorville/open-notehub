import { timingSafeEqual } from 'crypto'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

function matchesLegacyAgentKey(token: string) {
  const expected = process.env.AGENT_API_KEY?.trim()
  if (!expected || token.length !== expected.length) {
    return false
  }

  return timingSafeEqual(
    Buffer.from(token, 'utf8'),
    Buffer.from(expected, 'utf8')
  )
}

export async function verifyAgentKey(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7)
  if (matchesLegacyAgentKey(token)) {
    return { id: 'default', name: 'Default Agent' }
  }

  const agents = await db.query.agents.findMany({
    where: eq(schema.agents.isActive, true),
  })

  for (const agent of agents) {
    if (await bcrypt.compare(token, agent.apiKeyHash)) {
      return { id: agent.id, name: agent.name }
    }
  }

  return null
}
