import { NextRequest, NextResponse } from 'next/server'
import { getSessionToken, verifySession } from '@/lib/auth'

function isPublicRoute(pathname: string) {
  return (
    pathname === '/login' ||
    pathname === '/bootstrap' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/auth/bootstrap' ||
    pathname === '/api/auth/bootstrap/state' ||
    pathname.startsWith('/api/v1') ||
    pathname.startsWith('/api/health')
  )
}

function isOwnerOnlyRoute(pathname: string) {
  return (
    pathname === '/admin/users' ||
    pathname.startsWith('/admin/users/') ||
    pathname === '/admin/agents' ||
    pathname.startsWith('/admin/agents/') ||
    pathname === '/api/admin/users' ||
    pathname.startsWith('/api/admin/users/') ||
    pathname === '/api/admin/agents' ||
    pathname.startsWith('/api/admin/agents/')
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicRoute(pathname)) {
    return NextResponse.next()
  }

  const session = await verifySession(getSessionToken(request))

  if (pathname.startsWith('/admin')) {
    if (!session) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }

    if (isOwnerOnlyRoute(pathname) && session.role !== 'owner') {
      return NextResponse.redirect(new URL('/admin', request.url))
    }

    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    if (!session) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Authentication required' },
        { status: 401 }
      )
    }

    if (isOwnerOnlyRoute(pathname) && session.role !== 'owner') {
      return NextResponse.json(
        { error: 'forbidden', message: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    return NextResponse.next()
  }

  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
