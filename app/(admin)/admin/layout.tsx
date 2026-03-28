import { AdminShell } from '@/components/admin/AdminShell'
import { requirePageUser } from '@/lib/auth-server'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requirePageUser({
    from: '/admin',
    roles: ['owner', 'editor'],
  })

  return (
    <AdminShell
      currentUser={{
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      }}
    >
      {children}
    </AdminShell>
  )
}
