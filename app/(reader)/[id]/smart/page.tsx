'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Languages,
  Library,
  Lightbulb,
  Loader2,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

type Mode = 'translate' | 'summarize' | 'brainstorm'
type TaskStatus = 'running' | 'done' | 'error' | 'interrupted'
type ViewStatus = 'empty' | 'loading' | TaskStatus

interface Version {
  taskId: string
  version: number
  status: TaskStatus
  createdAt: string
  completedAt: string | null
}

interface TaskSnapshot {
  taskId: string
  status: TaskStatus
  result: string
  version: number
  createdAt: string
  completedAt: string | null
  error: string | null
  meta?: Record<string, unknown> | null
}

interface ModeState {
  loaded: boolean
  versions: Version[]
  selectedTaskId: string | null
  status: ViewStatus
  content: string
  error: string
  meta: Record<string, unknown> | null
  pollBlocked: boolean
}

const MODES: Array<{ key: Mode; label: string; icon: LucideIcon }> = [
  { key: 'translate', label: '翻译', icon: Languages },
  { key: 'summarize', label: '摘要', icon: FileText },
  { key: 'brainstorm', label: '头脑风暴', icon: Lightbulb },
]

const MODE_LABELS: Record<Mode, string> = {
  translate: '翻译',
  summarize: '摘要',
  brainstorm: '头脑风暴',
}

function createModeState(): ModeState {
  return {
    loaded: false,
    versions: [],
    selectedTaskId: null,
    status: 'empty',
    content: '',
    error: '',
    meta: null,
    pollBlocked: false,
  }
}

function createInitialModeStates(): Record<Mode, ModeState> {
  return {
    translate: createModeState(),
    summarize: createModeState(),
    brainstorm: createModeState(),
  }
}

function formatVersionTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const monthDayFormatter = new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  })

  if (date.toDateString() === now.toDateString()) return `今天 ${timeFormatter.format(date)}`

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${timeFormatter.format(date)}`
  }

  return `${monthDayFormatter.format(date)} ${timeFormatter.format(date)}`
}

function getProgressText(meta: Record<string, unknown> | null, status: ViewStatus): string {
  if (!meta) {
    if (status === 'running' || status === 'loading') return '处理中…'
    return ''
  }

  const totalChunks = typeof meta.totalChunks === 'number' ? meta.totalChunks : null
  const completedChunks = typeof meta.completedChunks === 'number' ? meta.completedChunks : null
  const phase = typeof meta.phase === 'string' ? meta.phase : null
  const round = typeof meta.round === 'number' ? meta.round : null
  const totalRounds = typeof meta.totalRounds === 'number' ? meta.totalRounds : null

  if (phase === 'reduce') return '正在整理最终结果…'
  if (phase === 'final') return '正在生成最终结果…'

  if (totalChunks && completedChunks !== null) {
    if (phase === 'map') return `已完成 ${completedChunks} / ${totalChunks} 个分块摘要`
    return `已完成 ${completedChunks} / ${totalChunks} 个分块`
  }

  if (round && totalRounds) {
    return `头脑风暴进行中，第 ${round} / ${totalRounds} 轮`
  }

  if (status === 'running' || status === 'loading') return '处理中…'

  return ''
}

function toViewStatus(snapshot: TaskSnapshot): ViewStatus {
  if (snapshot.status === 'running') {
    return snapshot.result ? 'running' : 'loading'
  }

  return snapshot.status
}

function getStatusLabel(status: TaskStatus): string {
  switch (status) {
    case 'running':
      return '进行中'
    case 'done':
      return '已完成'
    case 'error':
      return '失败'
    case 'interrupted':
      return '已中断'
  }
}

function getStatusBadgeClass(status: TaskStatus): string {
  switch (status) {
    case 'running':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
    case 'done':
      return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
    case 'error':
      return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
    case 'interrupted':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
  }
}

function getTaskErrorMessage(
  mode: Mode,
  error: string | null,
  meta: Record<string, unknown> | null
): string {
  const upstreamCode =
    typeof meta?.errorCode === 'string' && meta.errorCode.length > 0
      ? meta.errorCode
      : error

  switch (upstreamCode) {
    case 'summarize_map_failed':
      return '摘要生成失败，分段摘要阶段没有得到足够结果，请稍后重试。'
    case 'llm_rate_limited':
      return `${MODE_LABELS[mode]}请求过于频繁，请稍后再试。`
    case 'llm_timeout':
      return `${MODE_LABELS[mode]}生成超时，请稍后重试。`
    case 'llm_quota_exhausted':
      return '模型额度不足，当前无法继续生成。'
    case 'llm_model_access_denied':
      return '当前模型不可用，请检查模型配置或切换可用模型。'
    case 'llm_auth_failed':
      return '模型鉴权失败，请检查 LLM 配置。'
    case 'processing_failed':
    case 'llm_api_error':
      return `${MODE_LABELS[mode]}生成失败，请稍后重试。`
    default:
      return error ?? `${MODE_LABELS[mode]}生成失败`
  }
}

function getVersionHint(version: Version): string {
  switch (version.status) {
    case 'error':
      return '本次生成失败，可以重新生成，或删除这个版本。'
    case 'running':
      return '结果完成后会自动刷新到这里。'
    case 'interrupted':
      return '本次任务已中断，你可以切换查看，或重新生成。'
    case 'done':
      return '点击卡片可切换查看这个版本。'
  }
}

export default function SmartPage() {
  const { id } = useParams<{ id: string }>()

  const [mode, setMode] = useState<Mode>('translate')
  const [docTitle, setDocTitle] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [modeStates, setModeStates] = useState<Record<Mode, ModeState>>(
    createInitialModeStates()
  )

  const modeRef = useRef(mode)
  const statesRef = useRef(modeStates)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollInFlightRef = useRef(false)
  const pollFailureCountRef = useRef(0)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    statesRef.current = modeStates
  }, [modeStates])

  const updateModeState = (targetMode: Mode, updater: (state: ModeState) => ModeState) => {
    setModeStates((current) => ({
      ...current,
      [targetMode]: updater(current[targetMode]),
    }))
  }

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  const mergeVersion = (versions: Version[], snapshot: TaskSnapshot): Version[] => {
    const next = versions.some((version) => version.taskId === snapshot.taskId)
      ? versions.map((version) =>
          version.taskId === snapshot.taskId
            ? {
                ...version,
                status: snapshot.status,
                version: snapshot.version,
                createdAt: snapshot.createdAt,
                completedAt: snapshot.completedAt,
              }
            : version
        )
      : [
          {
            taskId: snapshot.taskId,
            version: snapshot.version,
            status: snapshot.status,
            createdAt: snapshot.createdAt,
            completedAt: snapshot.completedAt,
          },
          ...versions,
        ]

    return next
      .slice()
      .sort((left, right) => right.version - left.version)
      .slice(0, 10)
  }

  const schedulePoll = (delayMs: number) => {
    stopPolling()
    pollTimerRef.current = setTimeout(() => {
      void pollActiveMode()
    }, delayMs)
  }

  const fetchTaskStatus = async (
    targetMode: Mode,
    taskId: string,
    options: { scheduleNext?: boolean } = {}
  ): Promise<void> => {
    if (options.scheduleNext && pollInFlightRef.current) return

    if (options.scheduleNext) {
      pollInFlightRef.current = true
    }

    try {
      const response = await fetch(`/api/smart/${id}/${targetMode}/${taskId}`, {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`status_${response.status}`)
      }

      const snapshot = (await response.json()) as TaskSnapshot
      pollFailureCountRef.current = 0

      updateModeState(targetMode, (state) => ({
        ...state,
        loaded: true,
        selectedTaskId: snapshot.taskId,
        status: toViewStatus(snapshot),
        content: snapshot.result ?? '',
        error:
          snapshot.status === 'error'
            ? getTaskErrorMessage(targetMode, snapshot.error, snapshot.meta ?? null)
            : snapshot.status === 'interrupted'
              ? '任务已中断，请重新发起。'
              : '',
        meta: snapshot.meta ?? null,
        pollBlocked: false,
        versions: mergeVersion(state.versions, snapshot),
      }))

      if (
        options.scheduleNext &&
        targetMode === modeRef.current &&
        snapshot.status === 'running' &&
        !document.hidden
      ) {
        schedulePoll(2000)
      } else {
        stopPolling()
      }
    } catch {
      if (!options.scheduleNext || targetMode !== modeRef.current) {
        return
      }

      pollFailureCountRef.current += 1
      const delayMs = Math.min(30_000, 2_000 * 2 ** (pollFailureCountRef.current - 1))

      if (pollFailureCountRef.current >= 5) {
        updateModeState(targetMode, (state) => ({
          ...state,
          pollBlocked: true,
          error: '轮询连续失败，请手动刷新页面后恢复。',
        }))
        stopPolling()
        return
      }

      schedulePoll(delayMs)
    } finally {
      if (options.scheduleNext) {
        pollInFlightRef.current = false
      }
    }
  }

  const pollActiveMode = async () => {
    const currentMode = modeRef.current
    const state = statesRef.current[currentMode]

    if (
      document.hidden ||
      state.pollBlocked ||
      !state.selectedTaskId ||
      (state.status !== 'running' && state.status !== 'loading')
    ) {
      stopPolling()
      return
    }

    await fetchTaskStatus(currentMode, state.selectedTaskId, { scheduleNext: true })
  }

  const loadVersions = async (targetMode: Mode) => {
    try {
      const response = await fetch(`/api/smart/${id}/${targetMode}`, {
        cache: 'no-store',
      })
      if (!response.ok) return

      const data = (await response.json()) as { versions: Version[] }
      const versions = data.versions ?? []
      const previousState = statesRef.current[targetMode]
      const selectedTaskId =
        previousState.selectedTaskId &&
        versions.some((version) => version.taskId === previousState.selectedTaskId)
          ? previousState.selectedTaskId
          : versions[0]?.taskId ?? null
      const selectionChanged = selectedTaskId !== previousState.selectedTaskId
      const selectedVersion =
        versions.find((version) => version.taskId === selectedTaskId) ?? null

      updateModeState(targetMode, (state) => ({
        ...state,
        loaded: true,
        versions,
        selectedTaskId,
        status: versions.length === 0 ? 'empty' : selectionChanged ? 'loading' : state.status,
        content: versions.length === 0 || selectionChanged ? '' : state.content,
        error: versions.length === 0 || selectionChanged ? '' : state.error,
        meta: versions.length === 0 || selectionChanged ? null : state.meta,
        pollBlocked: versions.length === 0 ? false : selectionChanged ? false : state.pollBlocked,
      }))

      if (selectedTaskId) {
        await fetchTaskStatus(targetMode, selectedTaskId, {
          scheduleNext:
            targetMode === modeRef.current &&
            selectedVersion?.status === 'running' &&
            !document.hidden,
        })
      }
    } catch {
      // Ignore list errors here; the page can retry via the action button.
    }
  }

  const startNewTask = async () => {
    stopPolling()
    pollFailureCountRef.current = 0
    setHistoryOpen(false)

    updateModeState(mode, (state) => ({
      ...state,
      status: 'loading',
      content: '',
      error: '',
      meta: null,
      pollBlocked: false,
    }))

    try {
      const response = await fetch(`/api/smart/${id}/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (response.status === 409) {
        const data = (await response.json()) as { taskId: string }
        await fetchTaskStatus(mode, data.taskId, { scheduleNext: !document.hidden })
        return
      }

      if (!response.ok) {
        const data = (await response.json()) as { message?: string }
        updateModeState(mode, (state) => ({
          ...state,
          status: 'error',
          error: data.message ?? '启动失败',
          pollBlocked: false,
        }))
        return
      }

      const data = (await response.json()) as { taskId: string; version: number }

      updateModeState(mode, (state) => ({
        ...state,
        selectedTaskId: data.taskId,
        versions: mergeVersion(state.versions, {
          taskId: data.taskId,
          status: 'running',
          result: '',
          version: data.version,
          createdAt: new Date().toISOString(),
          completedAt: null,
          error: null,
          meta: null,
        }),
      }))

      await fetchTaskStatus(mode, data.taskId, { scheduleNext: !document.hidden })
    } catch {
      updateModeState(mode, (state) => ({
        ...state,
        status: 'error',
        error: '请求失败，请稍后重试。',
      }))
    }
  }

  const selectVersion = async (version: Version) => {
    stopPolling()
    pollFailureCountRef.current = 0
    setHistoryOpen(false)

    updateModeState(mode, (state) => ({
      ...state,
      selectedTaskId: version.taskId,
      status: 'loading',
      content: '',
      error: '',
      meta: null,
      pollBlocked: false,
    }))

    await fetchTaskStatus(mode, version.taskId, {
      scheduleNext: version.status === 'running' && !document.hidden,
    })
  }

  const deleteVersion = async (version: Version) => {
    if (version.status === 'running') return
    if (!window.confirm(`删除 v${version.version} 后不可恢复，继续吗？`)) {
      return
    }

    setDeletingTaskId(version.taskId)

    const wasSelected = statesRef.current[mode].selectedTaskId === version.taskId
    if (wasSelected) {
      updateModeState(mode, (state) => ({
        ...state,
        status: state.versions.length > 1 ? 'loading' : 'empty',
        content: '',
        error: '',
        meta: null,
        pollBlocked: false,
      }))
    }

    try {
      const response = await fetch(`/api/smart/${id}/${mode}/${version.taskId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string }
        updateModeState(mode, (state) => ({
          ...state,
          error: data.message ?? '删除版本失败',
        }))
        return
      }

      await loadVersions(mode)
    } catch {
      updateModeState(mode, (state) => ({
        ...state,
        error: '删除版本失败，请稍后重试。',
      }))
    } finally {
      setDeletingTaskId(null)
    }
  }

  useEffect(() => {
    setModeStates(createInitialModeStates())
    setHistoryOpen(false)
  }, [id])

  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then((response) => response.json())
      .then((data: { title?: string }) => setDocTitle(data.title ?? ''))
      .catch(() => {})
  }, [id])

  useEffect(() => {
    stopPolling()
    pollFailureCountRef.current = 0
    void loadVersions(mode)

    return () => {
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, id])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopPolling()
        return
      }

      const activeState = statesRef.current[modeRef.current]
      if (
        activeState.selectedTaskId &&
        !activeState.pollBlocked &&
        (activeState.status === 'running' || activeState.status === 'loading')
      ) {
        void fetchTaskStatus(modeRef.current, activeState.selectedTaskId, { scheduleNext: true })
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const activeState = modeStates[mode]
  const activeMode = MODES.find((entry) => entry.key === mode) ?? MODES[0]
  const ActiveModeIcon = activeMode.icon
  const activePhase =
    typeof activeState.meta?.phase === 'string' ? activeState.meta.phase : null
  const progressText = getProgressText(activeState.meta, activeState.status)
  const isRunning = activeState.status === 'loading' || activeState.status === 'running'
  const isFinalizingPhase = activePhase === 'reduce' || activePhase === 'final'
  const isFinalizingWithContent = Boolean(activeState.content) && isFinalizingPhase
  const visibleProgressText = isFinalizingWithContent ? '' : progressText
  const showPollingFooter = isRunning && !isFinalizingWithContent
  const historyCount = activeState.versions.length

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-[#fafaf8]/80 backdrop-blur-sm dark:bg-[#1a1a1a]/80">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-3 px-4">
          <Link
            href={`/${id}`}
            className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="max-w-[160px] truncate sm:max-w-xs">{docTitle || '原文'}</span>
          </Link>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            智读
          </span>
        </div>
      </header>

      <div className="sticky top-12 z-30 border-b bg-[#fafaf8]/90 backdrop-blur-sm dark:bg-[#1a1a1a]/90">
        <div className="mx-auto max-w-2xl px-4">
          <div className="grid grid-cols-3 gap-2 py-2">
            {MODES.map((entry) => {
              const Icon = entry.icon

              return (
                <button
                  key={entry.key}
                  onClick={() => setMode(entry.key)}
                  className={`flex touch-manipulation items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    mode === entry.key
                      ? 'bg-zinc-950 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-950'
                      : 'text-muted-foreground hover:bg-zinc-100/80 hover:text-foreground dark:hover:bg-zinc-900'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="truncate">{entry.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {isRunning && (
        <div className="fixed left-0 right-0 top-0 z-50 h-0.5 bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full w-3/5 animate-pulse bg-blue-500" />
        </div>
      )}

      <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2 px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={startNewTask}
          disabled={isRunning}
          className="h-8 gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-white"
        >
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {historyCount === 0 ? '开始生成' : '重新生成'}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setHistoryOpen(true)}
          className="h-8 gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-white"
        >
          <History className="h-3.5 w-3.5" />
          历史版本
          {historyCount > 0 && (
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {historyCount}
            </span>
          )}
        </Button>

        {!activeState.content && visibleProgressText && (
          <span className="ml-auto text-xs text-muted-foreground">{visibleProgressText}</span>
        )}
      </div>

      <article className="mx-auto max-w-2xl px-5 pb-24 sm:pb-12">
        {activeState.status === 'empty' && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <ActiveModeIcon className="h-7 w-7" aria-hidden="true" />
            </div>
            <p className="mb-2 text-sm">点击“开始生成”创建新的{MODE_LABELS[mode]}任务</p>
            <p className="text-xs text-muted-foreground/80">
              生成完成后，你可以在“历史版本”里切换、回看和删除结果。
            </p>
          </div>
        )}

        {activeState.error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
            {activeState.error}
          </div>
        )}

        {(activeState.status === 'loading' || activeState.status === 'running') && !activeState.content && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
            {visibleProgressText && (
              <p className="pt-2 text-sm text-muted-foreground">{visibleProgressText}</p>
            )}
          </div>
        )}

        {activeState.content && (
          <div className="py-4">
            {visibleProgressText && (
              <div className="mb-3 flex justify-end text-xs text-muted-foreground">
                <span>{visibleProgressText}</span>
              </div>
            )}

            <div className="reading-body">
              <MarkdownRenderer content={activeState.content} />
            </div>

            {showPollingFooter && (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                <span>轮询更新中…</span>
              </div>
            )}
          </div>
        )}
      </article>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent
          variant="sheet"
          showClose={false}
          overlayClassName="bg-zinc-950/18 backdrop-blur-[1.5px] motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none"
          className="w-full max-w-[20rem] rounded-none border-b-0 border-l border-r-0 border-t-0 border-zinc-200 bg-[#f7f3ea] p-0 shadow-[0_20px_70px_rgba(15,23,42,0.24)] sm:max-w-[21rem] lg:max-w-[22rem] dark:border-zinc-800 dark:bg-[#161616]"
        >
          <DialogHeader className="sticky top-0 z-10 border-b border-zinc-200 bg-[#f7f3ea] px-4 pb-4 pt-[calc(env(safe-area-inset-top)+14px)] text-left dark:border-zinc-800 dark:bg-[#161616]">
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setHistoryOpen(false)}
                className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                <ChevronRight className="mr-1.5 h-4 w-4" />
                返回阅读
              </Button>
              <div className="shrink-0 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium tabular-nums text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {historyCount} 个版本
              </div>
            </div>

            <div className="mt-4 min-w-0">
              <DialogTitle className="flex items-center gap-2 text-left text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                <ActiveModeIcon className="h-4.5 w-4.5" aria-hidden="true" />
                {MODE_LABELS[mode]}历史版本
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                这里只显示当前子功能的历史结果。切换到其他标签后，会看到各自独立的版本列表。
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4">
            {historyCount === 0 ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-[28px] border border-dashed border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1ece2] dark:bg-zinc-900">
                  <ActiveModeIcon className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="mb-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  当前还没有{MODE_LABELS[mode]}历史
                </span>
                <span className="text-xs leading-5">
                  先生成一个结果，之后就可以在这里切换、回看和删除这个子功能的历史版本。
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {activeState.versions.map((version) => {
                  const isSelected = activeState.selectedTaskId === version.taskId
                  const isDeleting = deletingTaskId === version.taskId
                  const canDelete = version.status !== 'running'

                  return (
                    <div
                      key={version.taskId}
                      className={`overflow-hidden rounded-[24px] border transition-[transform,box-shadow,background-color,border-color] duration-200 motion-reduce:transition-none ${
                        isSelected
                          ? 'border-zinc-950 bg-zinc-950 text-white shadow-[0_18px_45px_-18px_rgba(15,23,42,0.5)] dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                          : 'border-zinc-200 bg-white text-zinc-950 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.45)] hover:-translate-y-px motion-reduce:hover:translate-y-0 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void selectVersion(version)}
                        className="w-full px-4 pb-2.5 pt-3.5 text-left"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold tabular-nums ${
                              isSelected
                                ? 'bg-white/12 text-white dark:bg-zinc-900/10 dark:text-zinc-900'
                                : 'bg-[#f1ece2] text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200'
                            }`}
                          >
                            v{version.version}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p
                                className={`text-sm font-semibold tabular-nums ${
                                  isSelected
                                    ? 'text-white dark:text-zinc-950'
                                    : 'text-zinc-950 dark:text-zinc-50'
                                }`}
                              >
                                {formatVersionTime(version.createdAt)}
                              </p>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusBadgeClass(version.status)}`}
                              >
                                {getStatusLabel(version.status)}
                              </span>
                              {isSelected && (
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                    isSelected
                                      ? 'bg-white/15 text-white dark:bg-zinc-900/10 dark:text-zinc-900'
                                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                                  }`}
                                >
                                  当前查看
                                </span>
                              )}
                            </div>

                            <p
                              className={`mt-2 text-xs leading-5 ${
                                isSelected
                                  ? 'text-white/72 dark:text-zinc-600'
                                  : 'text-zinc-600 dark:text-zinc-400'
                              }`}
                            >
                              {getVersionHint(version)}
                            </p>
                          </div>
                        </div>
                      </button>

                      <div
                        className={`flex items-center justify-end border-t px-4 pb-4 pt-3 ${
                          isSelected
                            ? 'border-white/12 dark:border-zinc-900/10'
                            : 'border-zinc-200 dark:border-zinc-800'
                        }`}
                      >
                        {canDelete ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={isDeleting}
                            onClick={() => void deleteVersion(version)}
                            className={`h-9 rounded-full px-3 text-xs font-medium ${
                              isSelected
                                ? 'text-white/90 hover:bg-white/12 hover:text-white dark:text-zinc-700 dark:hover:bg-zinc-900/10 dark:hover:text-zinc-950'
                                : 'text-zinc-600 hover:bg-zinc-100 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-red-400'
                            }`}
                          >
                            {isDeleting ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            删除
                          </Button>
                        ) : (
                          <span
                            className={`inline-flex h-9 items-center rounded-full px-3 text-[11px] font-medium ${
                              isSelected
                                ? 'bg-white/12 text-white/80 dark:bg-zinc-900/10 dark:text-zinc-700'
                                : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400'
                            }`}
                          >
                            生成中
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-[#fafaf8] dark:bg-[#1a1a1a] sm:hidden">
        <div className="flex h-14 items-center justify-around">
          <Link
            href="/"
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Library className="h-5 w-5" aria-hidden="true" />
            <span>文库</span>
          </Link>
          <Link
            href={`/${id}`}
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            <span>原文</span>
          </Link>
          <Link href={`/${id}/smart`} className="flex flex-col items-center gap-0.5 text-xs text-foreground transition-colors">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            <span>智读</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
