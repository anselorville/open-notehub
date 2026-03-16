import { NextRequest, NextResponse } from 'next/server'
import { getSessionToken, verifySession } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes
  if (pathname.startsWith('/login') || pathname.startsWith('/api/v1') || pathname.startsWith('/api/health')) {
    return NextResponse.next()
  }

  // Allow internal API with session (documents read API)
  if (pathname.startsWith('/api/')) {
    const token = getSessionToken(request)
    if (!token || !(await verifySession(token))) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Authentication required' },
        { status: 401 }
      )
    }
    return NextResponse.next()
  }

  // Protected reader routes
  const token = getSessionToken(request)
  if (!token || !(await verifySession(token))) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
