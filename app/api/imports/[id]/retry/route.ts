import { NextRequest, NextResponse } from 'next/server'
import { requireRequestUser } from '@/lib/auth-server'
import { retryImportJob } from '@/lib/imports/service'
import { RetryImportJobSchema } from '@/lib/schemas/imports'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireRequestUser(request, { roles: ['owner', 'editor'] })
  if ('response' in auth) {
    return auth.response
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const result = RetryImportJobSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      {
        error: 'validation_error',
        message: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      },
      { status: 422 }
    )
  }

  const job = await retryImportJob({
    jobId: params.id,
    preferredMode: result.data.preferredMode,
    forceProvider: result.data.forceProvider ?? null,
    autoCreate: result.data.autoCreate,
  })

  if (!job) {
    return NextResponse.json(
      { error: 'not_found', message: 'Import job not found' },
      { status: 404 }
    )
  }

  return NextResponse.json({ job }, { status: 202 })
}
