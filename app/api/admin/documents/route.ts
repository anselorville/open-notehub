import { NextRequest, NextResponse } from 'next/server'
import { listAdminDocuments } from '@/lib/admin/data'
import { requireRequestUser } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  const auth = await requireRequestUser(request, { roles: ['owner', 'editor'] })
  if ('response' in auth) {
    return auth.response
  }

  return NextResponse.json({
    items: await listAdminDocuments(),
  })
}
