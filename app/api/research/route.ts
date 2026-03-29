import { NextRequest, NextResponse } from 'next/server'
import { requireRequestUser } from '@/lib/auth-server'
import { runResearchQuery } from '@/lib/research/service'
import { ResearchRequestSchema } from '@/lib/schemas/research'

export async function GET(request: NextRequest) {
  const auth = await requireRequestUser(request, { roles: ['owner', 'editor'] })
  if ('response' in auth) {
    return auth.response
  }

  const parsed = ResearchRequestSchema.safeParse({
    q: request.nextUrl.searchParams.get('q'),
    scope: request.nextUrl.searchParams.get('scope') ?? 'hybrid',
  })

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'validation_error',
        message: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    )
  }

  try {
    const result = await runResearchQuery({
      question: parsed.data.q,
      allowExternal: parsed.data.scope !== 'library',
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[GET /api/research]', error)
    return NextResponse.json(
      {
        error: 'internal_error',
        message: 'Failed to run research query',
      },
      { status: 500 }
    )
  }
}
