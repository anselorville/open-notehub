'use client'

import { startTransition, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Archive, Library, Search, Shield } from 'lucide-react'
import { LibraryThemeProvider } from '@/components/library/LibraryThemeContext'
import { LibraryThemeDrawer } from '@/components/library/LibraryThemeDrawer'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'

const SHELL_ITEMS = [
  { href: '/intake', label: '入藏', icon: Archive, section: 'intake' },
  { href: '/', label: '文库', icon: Library, section: 'library' },
  { href: '/search', label: '搜索', icon: Search, section: 'search' },
] as const

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
  const router = useRouter()
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const isLibraryHome = pathname === '/' || pathname === '/library'
  const isSmartPage = pathname.endsWith('/smart')
  const activeSection =
    pathname === '/intake'
      ? 'intake'
      : pathname === '/search'
        ? 'search'
        : 'library'
  const canSwipeBetweenSections = ['/', '/library', '/intake', '/search'].includes(pathname)

  function navigateToSection(targetSection: 'intake' | 'library' | 'search') {
    const target = SHELL_ITEMS.find((item) => item.section === targetSection)
    if (!target || target.section === activeSection) {
      return
    }

    startTransition(() => {
      router.push(target.href)
    })
  }

  function handleTouchEnd(clientX: number, clientY: number) {
    if (!touchStart || !canSwipeBetweenSections) {
      return
    }

    const deltaX = clientX - touchStart.x
    const deltaY = clientY - touchStart.y
    setTouchStart(null)

    if (Math.abs(deltaX) < 72 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      return
    }

    const currentIndex = SHELL_ITEMS.findIndex((item) => item.section === activeSection)
    if (currentIndex === -1) {
      return
    }

    const targetIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1
    const target = SHELL_ITEMS[targetIndex]
    if (!target) {
      return
    }

    navigateToSection(target.section)
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[#e0d4c6] bg-[#f7f1e7]/90 backdrop-blur-sm dark:border-zinc-800 dark:bg-[#14110f]/90">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link
            href="/"
            className="text-[15px] font-semibold tracking-[0.01em] text-[#201710] transition-opacity hover:opacity-70 dark:text-zinc-100"
          >
            Open NoteHub
          </Link>

          <nav className="hidden flex-1 justify-center sm:flex">
            <div className="flex items-center gap-1 rounded-full border border-[#ddcfbf] bg-white/70 p-1 dark:border-zinc-800 dark:bg-zinc-900/70">
              {SHELL_ITEMS.map((item) => {
                const Icon = item.icon
                const active = item.section === activeSection

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-[#201710] text-[#f7f1e7] dark:bg-zinc-100 dark:text-zinc-950'
                        : 'text-[#6a563f] hover:bg-[#efe4d6] dark:text-zinc-300 dark:hover:bg-zinc-800'
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-2">
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

      <main
        onTouchStart={(event) => {
          const touch = event.changedTouches[0]
          if (!touch) {
            return
          }

          setTouchStart({ x: touch.clientX, y: touch.clientY })
        }}
        onTouchEnd={(event) => {
          const touch = event.changedTouches[0]
          if (!touch) {
            return
          }

          handleTouchEnd(touch.clientX, touch.clientY)
        }}
      >
        {children}
      </main>

      {!isSmartPage && (
        <nav className="fixed bottom-0 left-0 right-0 border-t border-[#e0d4c6] bg-[#f7f1e7]/92 backdrop-blur-sm dark:border-zinc-800 dark:bg-[#14110f]/92 sm:hidden">
          <div className="flex h-14 items-center justify-around">
            {SHELL_ITEMS.map((item) => {
              const Icon = item.icon
              const active = item.section === activeSection

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex flex-col items-center gap-0.5 text-xs transition-colors',
                    active
                      ? 'text-[#201710] dark:text-zinc-50'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}
