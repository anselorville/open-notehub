'use client'

import { useMemo, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import type { AdminDocumentListItem } from '@/lib/admin/data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'

export function DocumentsAdminClient({
  initialDocuments,
}: {
  initialDocuments: AdminDocumentListItem[]
}) {
  const [documents, setDocuments] = useState(initialDocuments)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const filteredDocuments = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) {
      return documents
    }

    return documents.filter((document) =>
      [
        document.title,
        document.summary ?? '',
        document.ownerEmail ?? '',
        document.agentName ?? '',
        document.sourceType,
      ].some((field) => field.toLowerCase().includes(keyword))
    )
  }, [documents, query])

  async function handleDelete(documentId: string) {
    if (!window.confirm('确认删除这篇文档及其相关 smart 结果吗？')) {
      return
    }

    setBusyId(documentId)
    setError('')

    const res = await fetch(`/api/admin/documents/${documentId}`, {
      method: 'DELETE',
    })

    setBusyId(null)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.message ?? '删除失败，请稍后重试')
      return
    }

    setDocuments((current) => current.filter((document) => document.id !== documentId))
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">文档管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            浏览、检索并清理当前文库中的内容。
          </p>
        </div>

        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、来源或 owner"
            className="pl-9"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="overflow-hidden rounded-3xl border border-[#dfcfbe] bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="grid grid-cols-[minmax(0,2fr)_100px_120px_120px] gap-4 border-b border-[#efe2d4] px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-[#8c755a] dark:border-zinc-800 dark:text-zinc-500">
          <span>文档</span>
          <span className="hidden sm:block">来源</span>
          <span className="hidden md:block">创建时间</span>
          <span className="text-right">操作</span>
        </div>

        <div className="divide-y divide-[#efe2d4] dark:divide-zinc-800">
          {filteredDocuments.map((document) => (
            <div
              key={document.id}
              className="grid grid-cols-[minmax(0,2fr)_100px_120px_120px] gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#201710] dark:text-zinc-50">
                  {document.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {document.ownerEmail ?? document.agentName ?? '未记录 owner'}
                </p>
              </div>
              <p className="hidden text-sm text-muted-foreground sm:block">
                {document.sourceType}
              </p>
              <p className="hidden text-sm text-muted-foreground md:block">
                {formatDate(document.createdAt)}
              </p>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(document.id)}
                  disabled={busyId === document.id}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {busyId === document.id ? '删除中' : '删除'}
                </Button>
              </div>
            </div>
          ))}

          {!filteredDocuments.length && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              没有匹配的文档。
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
