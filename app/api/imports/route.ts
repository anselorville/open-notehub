import { NextRequest, NextResponse } from 'next/server'
import { requireRequestUser } from '@/lib/auth-server'
import { listImportJobs } from '@/lib/imports/data'
import { createImportJob } from '@/lib/imports/service'
import { CreateImportJobSchema } from '@/lib/schemas/imports'

export async function GET(request: NextRequest) {
  const auth = await requireRequestUser(request, { roles: ['owner', 'editor'] })
  if ('response' in auth) {
    return auth.response
  }

  const scope = request.nextUrl.searchParams.get('scope')
  const limit = Math.min(
    50,
    Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10))
  )

  const items = await listImportJobs({
    limit,
    submittedByUserId: scope === 'all' ? null : auth.user.id,
  })

  return NextResponse.json({ items })
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestUser(request, { roles: ['owner', 'editor'] })
  if ('response' in auth) {
    return auth.response
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const result = CreateImportJobSchema.safeParse(body)
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

  const job = await createImportJob({
    url: result.data.url,
    entryPoint: result.data.entryPoint,
    preferredMode: result.data.preferredMode,
    forceProvider: result.data.forceProvider ?? null,
    autoCreate: result.data.autoCreate,
    user: auth.user,
  })

  return NextResponse.json({ job }, { status: 202 })
}
