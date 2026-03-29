import { NextRequest, NextResponse } from 'next/server'
import { requireRequestUser } from '@/lib/auth-server'
import { finalizeImportJob } from '@/lib/imports/service'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireRequestUser(request, { roles: ['owner', 'editor'] })
  if ('response' in auth) {
    return auth.response
  }

  const job = await finalizeImportJob(params.id)
  if (!job) {
    return NextResponse.json(
      { error: 'not_found', message: 'Import job not found or not ready to finalize' },
      { status: 404 }
    )
  }

  return NextResponse.json({ job })
}
