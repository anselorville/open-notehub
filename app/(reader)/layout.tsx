import { redirect } from 'next/navigation'
import { ReaderShell } from '@/components/reader/ReaderShell'
import { getCurrentUser } from '@/lib/auth-server'

export default async function ReaderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }

  return <ReaderShell showAdminEntry>{children}</ReaderShell>
}
