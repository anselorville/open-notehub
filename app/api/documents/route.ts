import { NextRequest, NextResponse } from 'next/server'
import { getLibraryDocuments } from '@/lib/library/data'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q')?.trim()
  const tag = searchParams.get('tag')?.trim()
  const page = searchParams.get('page') ?? '1'
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

  try {
    const data = await getLibraryDocuments({
      q,
      tag,
      page,
      limit,
    })

    return NextResponse.json(data)
  } catch (err) {
    console.error('[GET /api/documents]', err)
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch documents' },
      { status: 500 }
    )
  }
}
