'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Library, Search, Shield } from 'lucide-react'
import { LibraryThemeProvider } from '@/components/library/LibraryThemeContext'
import { LibraryThemeDrawer } from '@/components/library/LibraryThemeDrawer'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'

export function ReaderShell({
  children,
  showAdminEntry = false,
}: {
  children: React.ReactNode
  showAdminEntry?: boolean
}) {
  return (
    <LibraryThemeProvider>
      <ReaderChrome showAdminEntry={showAdminEntry}>{children}</ReaderChrome>
    </LibraryThemeProvider>
  )
}

function ReaderChrome({
  children,
  showAdminEntry,
}: {
  children: React.ReactNode
  showAdminEntry: boolean
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isLibraryHome = pathname === '/'
  const isSmartPage = pathname.endsWith('/smart')
  const isSearchActive =
    isLibraryHome && (Boolean(searchParams.get('q')) || searchParams.get('focus') === 'search')

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[#e0d4c6] bg-[#f7f1e7]/90 backdrop-blur-sm dark:border-zinc-800 dark:bg-[#14110f]/90">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link
            href="/"
            className="text-[15px] font-semibold tracking-[0.01em] text-[#201710] transition-opacity hover:opacity-70 dark:text-zinc-100"
          >
            Open NoteHub
          </Link>

          <div className="flex items-center gap-2">
            {showAdminEntry && (
              <Link
                href="/admin"
                className="hidden items-center gap-1 rounded-full border border-[#d9c7b1] px-3 py-1.5 text-xs font-medium text-[#5e4732] transition-colors hover:border-[#b6946c] hover:text-[#201710] dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500 sm:flex"
              >
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                <span>后台</span>
              </Link>
            )}
            {isLibraryHome && <LibraryThemeDrawer />}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main>{children}</main>

      {!isSmartPage && (
        <nav className="fixed bottom-0 left-0 right-0 border-t border-[#e0d4c6] bg-[#f7f1e7]/92 backdrop-blur-sm dark:border-zinc-800 dark:bg-[#14110f]/92 sm:hidden">
          <div className="flex h-14 items-center justify-around">
            <Link
              href="/"
              className={cn(
                'flex flex-col items-center gap-0.5 text-xs transition-colors',
                isLibraryHome && !isSearchActive
                  ? 'text-[#201710] dark:text-zinc-50'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Library className="h-5 w-5" aria-hidden="true" />
              <span>文库</span>
            </Link>

            <Link
              href="/?focus=search"
              className={cn(
                'flex flex-col items-center gap-0.5 text-xs transition-colors',
                isSearchActive
                  ? 'text-[#201710] dark:text-zinc-50'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Search className="h-5 w-5" aria-hidden="true" />
              <span>搜索</span>
            </Link>
          </div>
        </nav>
      )}
    </div>
  )
}
