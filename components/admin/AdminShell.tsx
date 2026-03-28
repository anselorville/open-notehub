'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpenText,
  ChartNoAxesCombined,
  KeyRound,
  UploadCloud,
  Users,
} from 'lucide-react'
import { AdminSignOutButton } from '@/components/admin/AdminSignOutButton'
import { cn } from '@/lib/utils'

interface AdminShellProps {
  currentUser: {
    email: string
    displayName: string | null
    role: 'owner' | 'editor'
  }
  children: React.ReactNode
}

const baseItems = [
  {
    href: '/admin',
    label: '总览',
    icon: ChartNoAxesCombined,
  },
  {
    href: '/admin/documents',
    label: '文档',
    icon: BookOpenText,
  },
  {
    href: '/admin/imports',
    label: '导入中心',
    icon: UploadCloud,
  },
] as const

const ownerItems = [
  {
    href: '/admin/agents',
    label: 'Agent / Key',
    icon: KeyRound,
  },
  {
    href: '/admin/users',
    label: '用户',
    icon: Users,
  },
] as const

export function AdminShell({ currentUser, children }: AdminShellProps) {
  const pathname = usePathname()
  const items = currentUser.role === 'owner'
    ? [...baseItems, ...ownerItems]
    : baseItems

  return (
    <div className="min-h-screen bg-[#f5ede2] text-zinc-900 dark:bg-[#12100f] dark:text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <aside className="border-b border-[#dfcfbe] px-5 py-5 dark:border-zinc-800 lg:w-72 lg:border-b-0 lg:border-r lg:px-6 lg:py-8">
          <div className="space-y-5">
            <div>
              <Link
                href="/"
                className="text-lg font-semibold tracking-tight text-[#201710] dark:text-zinc-50"
              >
                Open NoteHub
              </Link>
              <p className="mt-1 text-sm text-[#6b5a48] dark:text-zinc-400">
                后台管理与运行面板
              </p>
            </div>

            <div className="rounded-2xl border border-[#dfcfbe] bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <p className="text-sm font-medium text-[#201710] dark:text-zinc-50">
                {currentUser.displayName || currentUser.email}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#8c755a] dark:text-zinc-500">
                {currentUser.role === 'owner' ? 'Owner' : 'Editor'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{currentUser.email}</p>
            </div>

            <nav className="space-y-1.5">
              {items.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-[#201710] text-[#f7f1e7] dark:bg-zinc-100 dark:text-zinc-950'
                        : 'text-[#5e4732] hover:bg-white/80 dark:text-zinc-300 dark:hover:bg-zinc-900'
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>

            <div className="pt-3">
              <AdminSignOutButton />
            </div>
          </div>
        </aside>

        <main className="flex-1 px-5 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
