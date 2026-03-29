'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SerializedImportJob } from '@/lib/imports/types'
import { WEB_ACCESS_PROVIDER_OPTIONS } from '@/lib/web-access/catalog'
import { cn, formatDate } from '@/lib/utils'

type RetryDraft = {
  preferredMode: 'auto' | 'static' | 'browser'
  forceProvider: string
  autoCreate: boolean
}

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

export function AdminImportCenterClient({
  initialJobs,
}: {
  initialJobs: SerializedImportJob[]
}) {
  const [jobs, setJobs] = useState(initialJobs)
  const [form, setForm] = useState({
    url: '',
    preferredMode: 'auto',
    forceProvider: '',
    autoCreate: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [busyJobId, setBusyJobId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [retryDrafts, setRetryDrafts] = useState<Record<string, RetryDraft>>({})

  useEffect(() => {
    const hasPendingJobs = jobs.some((job) => ['queued', 'running'].includes(job.status))
    if (!hasPendingJobs) {
      return
    }

    const interval = window.setInterval(async () => {
      const res = await fetch('/api/imports?scope=all&limit=20', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (data?.items) {
        setJobs(data.items)
      }
    }, 3000)

    return () => {
      window.clearInterval(interval)
    }
  }, [jobs])

  async function submitJob(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')

    const res = await fetch('/api/imports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: form.url,
        entryPoint: 'admin',
        preferredMode: form.preferredMode,
        forceProvider: form.forceProvider || undefined,
        autoCreate: form.autoCreate,
      }),
    })

    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.message ?? '创建导入任务失败')
      return
    }

    const data = await res.json()
    const job = data.job as SerializedImportJob
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 20))
    setForm({ url: '', preferredMode: 'auto', forceProvider: '', autoCreate: false })
    setMessage('导入任务已创建')
  }

  async function refreshJob(jobId: string) {
    const res = await fetch(`/api/imports/${jobId}`, { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (!data?.job) {
      return
    }

    setJobs((current) =>
      current.map((job) => (job.id === data.job.id ? data.job : job))
    )
  }

  function getRetryDraft(job: SerializedImportJob): RetryDraft {
    return (
      retryDrafts[job.id] ?? {
        preferredMode:
          job.preferredMode === 'static' || job.preferredMode === 'browser'
            ? job.preferredMode
            : 'auto',
        forceProvider: job.forcedProvider ?? '',
        autoCreate: job.autoCreate,
      }
    )
  }

  function updateRetryDraft(job: SerializedImportJob, patch: Partial<RetryDraft>) {
    setRetryDrafts((current) => ({
      ...current,
      [job.id]: {
        ...getRetryDraft(job),
        ...patch,
      },
    }))
  }

  async function retryJob(job: SerializedImportJob) {
    const draft = getRetryDraft(job)
    setBusyJobId(job.id)
    setError('')
    setMessage('')

    const res = await fetch(`/api/imports/${job.id}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferredMode: draft.preferredMode,
        forceProvider: draft.forceProvider || undefined,
        autoCreate: draft.autoCreate,
      }),
    })

    setBusyJobId(null)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.message ?? '重试失败')
      return
    }

    const data = await res.json()
    setJobs((current) =>
      current.map((job) => (job.id === data.job.id ? data.job : job))
    )
    setMessage('任务已重新入队')
  }

  async function finalizeJob(jobId: string) {
    setBusyJobId(jobId)
    setError('')
    setMessage('')

    const res = await fetch(`/api/imports/${jobId}/finalize`, {
      method: 'POST',
    })

    setBusyJobId(null)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.message ?? '确认入库失败')
      return
    }

    const data = await res.json()
    setJobs((current) =>
      current.map((job) => (job.id === data.job.id ? data.job : job))
    )
    setMessage('预览内容已转成文档')
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">导入中心</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          后台提交、重试、预览并追踪每一条 URL 导入任务。
        </p>
      </div>

      <form
        onSubmit={submitJob}
        className="grid gap-3 rounded-3xl border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70 lg:grid-cols-[2fr_140px_160px_140px]"
      >
        <Input
          type="url"
          value={form.url}
          onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
          placeholder="https://example.com/article"
          required
        />
        <select
          value={form.preferredMode}
          onChange={(event) =>
            setForm((current) => ({ ...current, preferredMode: event.target.value }))
          }
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="auto">Auto</option>
          <option value="static">Static</option>
          <option value="browser">Browser</option>
        </select>
        <select
          value={form.forceProvider}
          onChange={(event) =>
            setForm((current) => ({ ...current, forceProvider: event.target.value }))
          }
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Auto provider</option>
          {WEB_ACCESS_PROVIDER_OPTIONS.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              创建中
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              新建任务
            </>
          )}
        </Button>

        <label className="flex items-center gap-2 text-sm text-muted-foreground lg:col-span-4">
          <input
            type="checkbox"
            checked={form.autoCreate}
            onChange={(event) =>
              setForm((current) => ({ ...current, autoCreate: event.target.checked }))
            }
          />
          <span>抓取完成后自动入库；关闭时会停在预览态等待确认</span>
        </label>
      </form>

      {(message || error) && (
        <p className={error ? 'text-sm text-red-500' : 'text-sm text-emerald-600'}>
          {error || message}
        </p>
      )}

      <div className="space-y-4">
        {jobs.map((job) => {
          const busy = busyJobId === job.id
          const retryDraft = getRetryDraft(job)

          return (
            <article
              key={job.id}
              className="rounded-3xl border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
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
                    <span className="text-xs text-muted-foreground">
                      {job.entryPoint === 'admin' ? '后台任务' : '前台任务'}
                    </span>
                  </div>

                  <p className="mt-3 truncate text-sm font-medium text-[#201710] dark:text-zinc-50">
                    {job.preview?.title || job.submittedUrl}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {job.preview?.excerpt || job.errorMessage || '等待抓取结果…'}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{job.submittedUrl}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {job.resultDocumentId && (
                    <Link
                      href={`/${job.resultDocumentId}`}
                      className="inline-flex h-9 items-center rounded-full border border-[#d8cab8] bg-[#fffaf2] px-4 text-sm text-[#4d3b2c] transition-colors hover:bg-[#f4ebde] hover:text-[#241a12] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                    >
                      查看文档
                    </Link>
                  )}
                  {job.status === 'needs_review' && (
                    <Button type="button" onClick={() => finalizeJob(job.id)} disabled={busy}>
                      确认入库
                    </Button>
                  )}
                  {['queued', 'running'].includes(job.status) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => refreshJob(job.id)}
                      disabled={busy}
                    >
                      刷新状态
                    </Button>
                  )}
                </div>
              </div>

              {job.preview && (
                <div className="mt-4 rounded-2xl border border-[#efe2d4] bg-[#fffaf3] p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#8c755a] dark:text-zinc-500">
                    Preview
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {job.preview.wordCount} 词 · {job.preview.sourceType} · {job.preview.siteName || 'unknown site'}
                  </p>
                </div>
              )}

              {['failed', 'needs_review'].includes(job.status) && (
                <div className="mt-4 grid gap-3 rounded-2xl border border-[#efe2d4] bg-[#fffaf3] p-4 dark:border-zinc-800 dark:bg-zinc-950/40 lg:grid-cols-[140px_180px_1fr_auto]">
                  <select
                    value={retryDraft.preferredMode}
                    onChange={(event) =>
                      updateRetryDraft(job, {
                        preferredMode: event.target.value as RetryDraft['preferredMode'],
                      })
                    }
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="auto">Auto mode</option>
                    <option value="static">Static mode</option>
                    <option value="browser">Browser mode</option>
                  </select>
                  <select
                    value={retryDraft.forceProvider}
                    onChange={(event) =>
                      updateRetryDraft(job, { forceProvider: event.target.value })
                    }
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Auto provider</option>
                    {WEB_ACCESS_PROVIDER_OPTIONS.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={retryDraft.autoCreate}
                      onChange={(event) =>
                        updateRetryDraft(job, { autoCreate: event.target.checked })
                      }
                    />
                    <span>重试成功后自动入库</span>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => retryJob(job)}
                    disabled={busy}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                    按当前设置重试
                  </Button>
                </div>
              )}

              {job.attempts.length > 0 && (
                <details className="mt-4 rounded-2xl border border-[#efe2d4] px-4 py-3 dark:border-zinc-800">
                  <summary className="cursor-pointer text-sm font-medium text-[#201710] dark:text-zinc-50">
                    查看 trace 与尝试记录
                  </summary>
                  <div className="mt-3 space-y-4">
                    {job.attempts.map((attempt) => (
                      <div key={attempt.id} className="rounded-2xl bg-black/5 p-3 text-sm dark:bg-white/5">
                        <p className="font-medium">
                          Attempt #{attempt.attemptNumber} · {attempt.provider} · {attempt.status}
                        </p>
                        {attempt.errorMessage && (
                          <p className="mt-1 text-red-500">{attempt.errorMessage}</p>
                        )}
                        {attempt.trace.length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {attempt.trace.map((entry, index) => (
                              <li key={`${attempt.id}-${index}`}>
                                {entry.stage}
                                {entry.provider ? `/${entry.provider}` : ''}: {entry.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </article>
          )
        })}

        {!jobs.length && (
          <div className="rounded-3xl border border-dashed border-[#dfcfbe] bg-white/70 px-6 py-12 text-center text-sm text-muted-foreground dark:border-zinc-800 dark:bg-zinc-900/50">
            还没有导入任务。先提交一条 URL，工作台就会开始积累状态、预览和 trace。
          </div>
        )}
      </div>
    </section>
  )
}
