import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_SITE_TITLE ?? 'LearnHub',
  description: 'Your personal knowledge reading hub',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans bg-[#fafaf8] dark:bg-[#1a1a1a] text-zinc-900 dark:text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  )
}
