import { timingSafeEqual } from 'crypto'

export function verifyAgentKey(authHeader: string | null): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const expected = process.env.AGENT_API_KEY!

  if (token.length !== expected.length) return false

  return timingSafeEqual(
    Buffer.from(token, 'utf8'),
    Buffer.from(expected, 'utf8')
  )
}
