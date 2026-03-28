import { UsersAdminClient } from '@/components/admin/UsersAdminClient'
import { requirePageUser } from '@/lib/auth-server'
import { listAdminUsers } from '@/lib/admin/data'

export default async function AdminUsersPage() {
  await requirePageUser({
    from: '/admin/users',
    roles: ['owner'],
  })

  const users = await listAdminUsers()

  return <UsersAdminClient initialUsers={users} />
}
