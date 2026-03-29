import { NextRequest, NextResponse } from 'next/server'
import { requireRequestUser } from '@/lib/auth-server'
import { getImportJob } from '@/lib/imports/data'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireRequestUser(request, { roles: ['owner', 'editor'] })
  if ('response' in auth) {
    return auth.response
  }

  const job = await getImportJob(params.id)
  if (!job) {
    return NextResponse.json(
      { error: 'not_found', message: 'Import job not found' },
      { status: 404 }
    )
  }

  return NextResponse.json({ job })
}
