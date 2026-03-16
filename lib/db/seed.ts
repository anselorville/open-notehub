import { db } from './client'
import { agents } from './schema'
import bcrypt from 'bcryptjs'

async function seed() {
  const apiKey = process.env.AGENT_API_KEY ?? 'dev-agent-key-12345'
  const hash = await bcrypt.hash(apiKey, 12)

  await db.insert(agents).values({
    id: 'default',
    name: 'Default Agent',
    apiKeyHash: hash,
    description: 'Auto-created default agent',
  }).onConflictDoNothing()

  console.log('✓ Default agent seeded')
  process.exit(0)
}

seed().catch(console.error)
