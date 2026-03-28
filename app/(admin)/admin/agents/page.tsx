import { AgentsAdminClient } from '@/components/admin/AgentsAdminClient'
import { requirePageUser } from '@/lib/auth-server'
import { listAdminAgents } from '@/lib/admin/data'

export default async function AdminAgentsPage() {
  await requirePageUser({
    from: '/admin/agents',
    roles: ['owner'],
  })

  const agents = await listAdminAgents()

  return <AgentsAdminClient initialAgents={agents} />
}
