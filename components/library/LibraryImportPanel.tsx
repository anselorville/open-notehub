'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Sparkles, Waypoints } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SerializedImportJob } from '@/lib/imports/types'
import { type LibraryTheme } from '@/lib/library-theme'
import { cn, formatDate } from '@/lib/utils'

function getStatusLabel(status: SerializedImportJob['status']) {
  switch (status) {
    case 'queued':
      return '排队中'
    case 'running':
      return '处理中'
    case 'needs_review':
      return '需要确认'
    case 'done':
      return '已完成'
    case 'failed':
      return '失败'
  }
}

function getShellClass(theme: LibraryTheme) {
  return theme === 'editorial'
    ? 'border-[#d8c3ab] bg-[#fff8ef]'
    : 'border-[#e5dbce] bg-[#fffdf9]'
}

function getStatusClass(status: SerializedImportJob['status']) {
  switch (status) {
    case 'done':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
    case 'failed':
      return 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
    case 'needs_review':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
    default:
      return 'bg-[#ede2d2] text-[#6d563a] dark:bg-zinc-800 dark:text-zinc-300'
  }
}

export function LibraryImportPanel({ theme }: { theme: LibraryTheme }) {
  const [url, setUrl] = useState('')
  const [jobs, setJobs] = useState<SerializedImportJob[]>([])
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadJobs() {
      const res = await fetch('/api/imports?limit=4', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!cancelled && data?.items) {
        setJobs(data.items)
      }
    }

    loadJobs().catch(() => {
      if (!cancelled) {
        setJobs([])
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!activeJobId) {
      return
    }

    const interval = window.setInterval(async () => {
      const res = await fetch(`/api/imports/${activeJobId}`, { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!data?.job) {
        return
      }

      setJobs((current) => {
        const next = [data.job, ...current.filter((job) => job.id !== data.job.id)]
        return next.slice(0, 4)
      })

      if (!['queued', 'running'].includes(data.job.status)) {
        setActiveJobId(null)
      }
    }, 2500)

    return () => {
      window.clearInterval(interval)
    }
  }, [activeJobId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/imports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        entryPoint: 'frontstage',
        autoCreate: true,
        preferredMode: 'auto',
      }),
    })

    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.message ?? '提交导入失败，请稍后再试')
      return
    }

    const data = await res.json()
    const job = data.job as SerializedImportJob
    setUrl('')
    setActiveJobId(job.id)
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 4))
  }

  return (
    <div className={cn('mt-5 rounded-[24px] border p-4 sm:p-5', getShellClass(theme))}>
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-[#f3e8d8] p-2 text-[#6d4c28] dark:bg-[#21180f] dark:text-[#ddb78a]">
          <Waypoints className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#241a12] dark:text-zinc-50">快速入藏</p>
          <p className="mt-1 text-sm leading-6 text-[#675746] dark:text-zinc-400">
            粘贴外部网页链接，Open NoteHub 会尝试抓取正文并入库；完整流程和历史记录现在统一在入藏页。
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/article"
          className="h-11"
          required
        />
        <Button type="submit" disabled={submitting} className="h-11 shrink-0">
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              提交中
            </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                  立即入藏
                </>
              )}
            </Button>
      </form>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {jobs.length > 0 && (
        <div className="mt-4 space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-[18px] border border-[#e7d9c8] bg-white/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/70"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                    getStatusClass(job.status)
                  )}
                >
                  {getStatusLabel(job.status)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(job.createdAt)}
                </span>
                {job.selectedProvider && (
                  <span className="text-xs text-muted-foreground">
                    provider: {job.selectedProvider}
                  </span>
                )}
              </div>
              <p className="mt-2 truncate text-sm font-medium text-[#201710] dark:text-zinc-50">
                {job.preview?.title || job.submittedUrl}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {job.preview?.excerpt || job.errorMessage || '等待抓取结果…'}
              </p>
              {job.resultDocumentId && (
                <Link
                  href={`/${job.resultDocumentId}`}
                  className="mt-3 inline-flex text-sm font-medium text-[#6d4c28] hover:text-[#201710] dark:text-[#ddb78a] dark:hover:text-zinc-50"
                >
                  查看文档
                </Link>
              )}
              {job.status === 'needs_review' && (
                <Link
                  href="/intake"
                  className="mt-3 inline-flex text-sm font-medium text-[#6d4c28] hover:text-[#201710] dark:text-[#ddb78a] dark:hover:text-zinc-50"
                >
                  去入藏页确认
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
