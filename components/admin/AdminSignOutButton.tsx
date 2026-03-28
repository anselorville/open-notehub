'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

export function AdminSignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="inline-flex items-center gap-2 rounded-full border border-[#d9c7b1] px-3 py-2 text-sm font-medium text-[#5e4732] transition-colors hover:border-[#b6946c] hover:text-[#201710] dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      <span>退出</span>
    </button>
  )
}
