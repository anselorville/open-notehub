import { redirect } from 'next/navigation'
import { IntakeWorkspaceClient } from '@/components/intake/IntakeWorkspaceClient'
import { getCurrentUser } from '@/lib/auth-server'
import { listImportJobs } from '@/lib/imports/data'

export default async function IntakePage({
  searchParams,
}: {
  searchParams: { url?: string }
}) {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }

  const jobs = await listImportJobs({
    limit: 12,
    submittedByUserId: user.id,
  })

  return <IntakeWorkspaceClient initialJobs={jobs} initialUrl={searchParams.url ?? ''} />
}
