import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_SITE_TITLE ?? 'Open NoteHub',
  description: 'Collect, search, and understand every article worth keeping.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="bg-[#f7f1e7] text-zinc-900 antialiased dark:bg-[#151311] dark:text-zinc-100">
        {children}
      </body>
    </html>
  )
}
