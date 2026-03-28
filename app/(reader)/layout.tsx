import { ReaderShell } from '@/components/reader/ReaderShell'

export default function ReaderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ReaderShell>{children}</ReaderShell>
}
