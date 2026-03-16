import { ThemeToggle } from '@/components/ThemeToggle'
import Link from 'next/link'

export default function ReaderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b bg-[#fafaf8]/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link href="/" className="font-semibold text-sm hover:opacity-70 transition-opacity">
            LearnHub
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main>
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 border-t bg-[#fafaf8]/90 dark:bg-[#1a1a1a]/90 backdrop-blur-sm">
        <div className="flex items-center justify-around h-14">
          <Link href="/" className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <span className="text-lg">📚</span>
            <span>文库</span>
          </Link>
          <Link href="/?focus=search" className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <span className="text-lg">🔍</span>
            <span>搜索</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
