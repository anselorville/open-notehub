'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Globe,
  Loader2,
  RotateCcw,
  Sparkles,
  Waypoints,
} from 'lucide-react'
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

const INTAKE_STEPS = ['链接解析', '选择抓取方式', '正文提取', '生成预览', '确认入库'] as const

function getStatusLabel(status: SerializedImportJob['status']) {
  switch (status) {
    case 'queued':
      return '排队中'
    case 'running':
      return '处理中'
    case 'needs_review':
      return '待确认'
    case 'done':
      return '已入库'
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

function getStepProgress(job: SerializedImportJob | null) {
  if (!job) {
    return 0
  }

  switch (job.status) {
    case 'queued':
      return 1
    case 'running':
      return job.preview ? 4 : 3
    case 'needs_review':
      return 4
    case 'done':
      return 5
    case 'failed':
      return job.preview ? 4 : 2
  }
}

export function IntakeWorkspaceClient({
  initialJobs,
  initialUrl = '',
}: {
  initialJobs: SerializedImportJob[]
  initialUrl?: string
}) {
  const [jobs, setJobs] = useState(initialJobs)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialJobs[0]?.id ?? null)
  const [form, setForm] = useState({
    url: initialUrl,
    preferredMode: 'auto' as 'auto' | 'static' | 'browser',
    forceProvider: '',
    autoCreate: false,
  })
  const [busyJobId, setBusyJobId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [retryDrafts, setRetryDrafts] = useState<Record<string, RetryDraft>>({})

  const activeJob = jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null

  useEffect(() => {
    if (!selectedJobId && jobs[0]) {
      setSelectedJobId(jobs[0].id)
    }
  }, [jobs, selectedJobId])

  useEffect(() => {
    if (!initialUrl) {
      return
    }

    setForm((current) => (current.url ? current : { ...current, url: initialUrl }))
  }, [initialUrl])

  useEffect(() => {
    const hasPendingJobs = jobs.some((job) => ['queued', 'running'].includes(job.status))
    if (!hasPendingJobs) {
      return
    }

    const interval = window.setInterval(async () => {
      const res = await fetch('/api/imports?limit=12', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (data?.items) {
        setJobs(data.items)
      }
    }, 3000)

    return () => {
      window.clearInterval(interval)
    }
  }, [jobs])

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
        entryPoint: 'frontstage',
        preferredMode: form.preferredMode,
        forceProvider: form.forceProvider || undefined,
        autoCreate: form.autoCreate,
      }),
    })

    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.message ?? '创建入藏任务失败')
      return
    }

    const data = await res.json()
    const job = data.job as SerializedImportJob
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 12))
    setSelectedJobId(job.id)
    setForm((current) => ({ ...current, url: '' }))
    setMessage(job.status === 'needs_review' ? '预览已生成，确认后即可入库' : '入藏任务已创建')
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
    setMessage('内容已收入文库')
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
      setError(data?.message ?? '重新抓取失败')
      return
    }

    const data = await res.json()
    setJobs((current) =>
      current.map((item) => (item.id === data.job.id ? data.job : item))
    )
    setSelectedJobId(job.id)
    setMessage('任务已重新入队')
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:pb-8">
      <section className="rounded-[32px] border border-[#ddcfbf] bg-gradient-to-br from-[#faf1e4] via-[#f7efe2] to-[#efe2d2] px-5 py-6 shadow-[0_24px_52px_rgba(95,69,34,0.1)] dark:border-zinc-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(120,86,45,0.18),_rgba(20,17,15,0.96)_60%)] sm:px-7 sm:py-7">
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#907a63] dark:text-zinc-500">
              Open NoteHub · 入藏
            </p>
            <h1 className="mt-3 text-[2rem] font-semibold leading-tight tracking-tight text-[#241a12] dark:text-zinc-50 sm:text-[2.5rem]">
              把网页链接收入你的文库
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#675746] dark:text-zinc-400">
              从外部网页开始，经过抓取、提取、预览和确认，再把值得留下的内容正式收入 Open NoteHub。
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {INTAKE_STEPS.map((step, index) => (
                <div
                  key={step}
                  className="rounded-[22px] border border-[#e6d7c6] bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/70"
                >
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#8d765d] dark:text-zinc-500">
                    Step {index + 1}
                  </div>
                  <div className="mt-1 text-sm font-medium text-[#241a12] dark:text-zinc-50">
                    {step}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={submitJob}
            className="rounded-[28px] border border-[#ddcfbf] bg-white/80 p-5 shadow-[0_16px_32px_rgba(89,63,27,0.08)] dark:border-zinc-800 dark:bg-zinc-950/70"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-[#f3e8d8] p-2 text-[#6d4c28] dark:bg-[#21180f] dark:text-[#ddb78a]">
                <Waypoints className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-[#241a12] dark:text-zinc-50">
                  新建入藏任务
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#675746] dark:text-zinc-400">
                  默认先生成预览，你确认后再正式入库。
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <Input
                type="url"
                value={form.url}
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                placeholder="https://example.com/article"
                className="h-11"
                required
              />

              <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                <select
                  value={form.preferredMode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      preferredMode: event.target.value as 'auto' | 'static' | 'browser',
                    }))
                  }
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="auto">自动判断</option>
                  <option value="static">静态抓取</option>
                  <option value="browser">浏览器抓取</option>
                </select>

                <select
                  value={form.forceProvider}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, forceProvider: event.target.value }))
                  }
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">自动选择抓取方式</option>
                  {WEB_ACCESS_PROVIDER_OPTIONS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-[#eadac8] bg-[#fff9f0] px-4 py-3 text-sm text-[#5f4a36] dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.autoCreate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, autoCreate: event.target.checked }))
                  }
                  className="h-4 w-4"
                />
                <span>抓取成功后直接入库，跳过人工确认</span>
              </label>
            </div>

            {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
            {message && <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}

            <Button type="submit" disabled={submitting} className="mt-5 h-11 w-full">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  创建中
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                  开始入藏
                </>
              )}
            </Button>
          </form>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
        <div className="rounded-[28px] border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[#241a12] dark:text-zinc-50">
                当前任务
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                这里展示当前链接的状态、预览和确认动作。
              </p>
            </div>
            {activeJob && (
              <span
                className={cn(
                  'inline-flex rounded-full px-3 py-1 text-xs font-medium',
                  getStatusClass(activeJob.status)
                )}
              >
                {getStatusLabel(activeJob.status)}
              </span>
            )}
          </div>

          {activeJob ? (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-5">
                {INTAKE_STEPS.map((step, index) => {
                  const progress = getStepProgress(activeJob)
                  const complete = progress > index + 1
                  const active =
                    progress === index + 1 && ['queued', 'running', 'needs_review'].includes(activeJob.status)

                  return (
                    <div
                      key={step}
                      className={cn(
                        'rounded-[22px] border px-3 py-3 text-sm transition-colors',
                        complete
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : active
                            ? 'border-[#d8c3ab] bg-[#fff7ee] text-[#6d4c28] dark:border-[#4f3f30] dark:bg-[#1d1711] dark:text-[#ddb78a]'
                            : 'border-[#eadacc] bg-[#fffdf8] text-[#796552] dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400'
                      )}
                    >
                      <div className="text-[11px] uppercase tracking-[0.18em]">Step {index + 1}</div>
                      <div className="mt-1 font-medium">{step}</div>
                    </div>
                  )
                })}
              </div>

              <div className="rounded-[24px] border border-[#eadacc] bg-[#fffaf3] p-5 dark:border-zinc-800 dark:bg-zinc-950/60">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                      getStatusClass(activeJob.status)
                    )}
                  >
                    {getStatusLabel(activeJob.status)}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(activeJob.createdAt)}</span>
                  {activeJob.selectedProvider && (
                    <span className="text-xs text-muted-foreground">
                      provider: {activeJob.selectedProvider}
                    </span>
                  )}
                </div>

                <h3 className="mt-3 text-xl font-semibold tracking-tight text-[#241a12] dark:text-zinc-50">
                  {activeJob.preview?.title || activeJob.submittedUrl}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#665645] dark:text-zinc-400">
                  {activeJob.preview?.excerpt || activeJob.errorMessage || '正在生成预览，请稍候。'}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[20px] border border-[#ead9c8] bg-white/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/70">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#8d765d] dark:text-zinc-500">
                      来源
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-[#241a12] dark:text-zinc-50">
                      <Globe className="h-4 w-4 text-[#8d765d] dark:text-zinc-500" aria-hidden="true" />
                      <span className="truncate">
                        {activeJob.preview?.siteName || activeJob.preview?.finalUrl || activeJob.submittedUrl}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-[#ead9c8] bg-white/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/70">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#8d765d] dark:text-zinc-500">
                      预览
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-[#241a12] dark:text-zinc-50">
                      <Clock3 className="h-4 w-4 text-[#8d765d] dark:text-zinc-500" aria-hidden="true" />
                      <span>{activeJob.preview?.wordCount.toLocaleString() ?? 0} 字</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {activeJob.status === 'needs_review' && (
                    <Button
                      onClick={() => finalizeJob(activeJob.id)}
                      disabled={busyJobId === activeJob.id}
                    >
                      {busyJobId === activeJob.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                          入库中
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                          确认收入文库
                        </>
                      )}
                    </Button>
                  )}

                  {activeJob.status === 'done' && activeJob.resultDocumentId && (
                    <Button asChild variant="outline">
                      <Link href={`/${activeJob.resultDocumentId}`}>
                        打开文档
                        <ArrowUpRight className="ml-2 h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  )}

                  {['failed', 'needs_review'].includes(activeJob.status) && (
                    <Button
                      variant="outline"
                      onClick={() => retryJob(activeJob)}
                      disabled={busyJobId === activeJob.id}
                    >
                      {busyJobId === activeJob.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                          处理中
                        </>
                      ) : (
                        <>
                          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                          重新抓取
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {['failed', 'needs_review'].includes(activeJob.status) && (
                  <div className="mt-5 grid gap-3 rounded-[22px] border border-[#ead9c8] bg-white/75 p-4 dark:border-zinc-800 dark:bg-zinc-900/60 sm:grid-cols-[140px_1fr]">
                    <select
                      value={getRetryDraft(activeJob).preferredMode}
                      onChange={(event) =>
                        updateRetryDraft(activeJob, {
                          preferredMode: event.target.value as 'auto' | 'static' | 'browser',
                        })
                      }
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="auto">自动判断</option>
                      <option value="static">静态抓取</option>
                      <option value="browser">浏览器抓取</option>
                    </select>

                    <select
                      value={getRetryDraft(activeJob).forceProvider}
                      onChange={(event) =>
                        updateRetryDraft(activeJob, { forceProvider: event.target.value })
                      }
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">自动选择抓取方式</option>
                      {WEB_ACCESS_PROVIDER_OPTIONS.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {!!activeJob.attempts.length && (
                  <details className="mt-5 rounded-[20px] border border-[#ead9c8] bg-white/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/70">
                    <summary className="cursor-pointer text-sm font-medium text-[#241a12] dark:text-zinc-50">
                      查看抓取记录
                    </summary>
                    <div className="mt-3 space-y-3">
                      {activeJob.attempts.map((attempt) => (
                        <div
                          key={attempt.id}
                          className="rounded-2xl border border-[#f0e5d7] px-4 py-3 text-sm dark:border-zinc-800"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-[#241a12] dark:text-zinc-50">
                              第 {attempt.attemptNumber} 次
                            </span>
                            <span className="text-muted-foreground">{attempt.provider}</span>
                            <span className="text-muted-foreground">{attempt.status}</span>
                          </div>
                          {attempt.errorMessage && (
                            <p className="mt-2 text-sm text-red-500">{attempt.errorMessage}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-[24px] border border-dashed border-[#dcccc0] bg-[#fbf6ef] px-6 py-12 text-center dark:border-zinc-800 dark:bg-[#171310]">
              <AlertCircle className="mx-auto h-9 w-9 text-[#8d785f] dark:text-zinc-500" aria-hidden="true" />
              <p className="mt-4 text-lg font-semibold text-[#241a12] dark:text-zinc-50">还没有入藏任务</p>
              <p className="mt-2 text-sm leading-6 text-[#7b6753] dark:text-zinc-400">
                粘贴一个链接，从这里开始把外部网页收入文库。
              </p>
            </div>
          )}
        </div>

        <aside className="rounded-[28px] border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[#241a12] dark:text-zinc-50">
                任务队列
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                最近的入藏记录和处理状态。
              </p>
            </div>
            <span className="text-sm text-[#7b6753] dark:text-zinc-400">{jobs.length} 条</span>
          </div>

          <div className="mt-5 space-y-3">
            {jobs.map((job) => {
              const selected = activeJob?.id === job.id

              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedJobId(job.id)}
                  className={cn(
                    'block w-full rounded-[22px] border px-4 py-4 text-left transition-colors',
                    selected
                      ? 'border-[#b99670] bg-[#fff7ed] shadow-[0_12px_28px_rgba(93,67,30,0.1)] dark:border-[#5b4934] dark:bg-[#1d1711]'
                      : 'border-[#eadacc] bg-[#fffdf9] hover:border-[#d8c3ab] dark:border-zinc-800 dark:bg-zinc-950/50 dark:hover:border-zinc-700'
                  )}
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
                    <span className="text-xs text-muted-foreground">{formatDate(job.createdAt)}</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm font-medium text-[#241a12] dark:text-zinc-50">
                    {job.preview?.title || job.submittedUrl}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#665645] dark:text-zinc-400">
                    {job.preview?.excerpt || job.errorMessage || '等待预览…'}
                  </p>
                  {job.resultDocumentId && (
                    <span className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#6d4c28] dark:text-[#ddb78a]">
                      查看文档
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                </button>
              )
            })}

            {!jobs.length && (
              <p className="rounded-[22px] border border-dashed border-[#dcccc0] px-4 py-8 text-sm text-muted-foreground dark:border-zinc-800">
                暂无记录。
              </p>
            )}
          </div>
        </aside>
      </section>
    </div>
  )
}
