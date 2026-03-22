'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, ArrowLeft, BookOpen } from 'lucide-react'

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

const MODES: Array<{ key: Mode; label: string; emoji: string }> = [
  { key: 'translate', label: '翻译', emoji: '🌐' },
  { key: 'summarize', label: '摘要', emoji: '📋' },
  { key: 'brainstorm', label: '头脑风暴', emoji: '💡' },
]

const MODE_LABELS: Record<Mode, string> = {
  translate: '翻译',
  summarize: '摘要',
  brainstorm: '头脑风暴',
}

const INITIAL_MODE_STATE: Record<Mode, ModeState> = {
  translate: {
    loaded: false,
    versions: [],
    selectedTaskId: null,
    status: 'empty',
    content: '',
    error: '',
    meta: null,
    pollBlocked: false,
  },
  summarize: {
    loaded: false,
    versions: [],
    selectedTaskId: null,
    status: 'empty',
    content: '',
    error: '',
    meta: null,
    pollBlocked: false,
  },
  brainstorm: {
    loaded: false,
    versions: [],
    selectedTaskId: null,
    status: 'empty',
    content: '',
    error: '',
    meta: null,
    pollBlocked: false,
  },
}

function formatVersionTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const pad = (value: number) => String(value).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  if (isToday) return `今天 ${time}`

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`

  return `${date.getMonth() + 1}/${date.getDate()} ${time}`
}

function getProgressText(meta: Record<string, unknown> | null, status: ViewStatus): string {
  if (!meta) {
    if (status === 'running' || status === 'loading') return '处理中...'
    return ''
  }

  const totalChunks = typeof meta.totalChunks === 'number' ? meta.totalChunks : null
  const completedChunks = typeof meta.completedChunks === 'number' ? meta.completedChunks : null
  const phase = typeof meta.phase === 'string' ? meta.phase : null
  const round = typeof meta.round === 'number' ? meta.round : null
  const totalRounds = typeof meta.totalRounds === 'number' ? meta.totalRounds : null

  if (totalChunks && completedChunks !== null) {
    if (phase === 'map') return `已完成 ${completedChunks} / ${totalChunks} 个分块摘要`
    return `已完成 ${completedChunks} / ${totalChunks} 个分块`
  }

  if (round && totalRounds) {
    return `头脑风暴进行中，第 ${round} / ${totalRounds} 轮`
  }

  if (phase === 'reduce') return '正在整理最终结果...'
  if (phase === 'final') return '正在生成最终结果...'
  if (status === 'running' || status === 'loading') return '处理中...'

  return ''
}

function toViewStatus(snapshot: TaskSnapshot): ViewStatus {
  if (snapshot.status === 'running') {
    return snapshot.result ? 'running' : 'loading'
  }

  return snapshot.status
}

export default function SmartPage() {
  const { id } = useParams<{ id: string }>()

  const [mode, setMode] = useState<Mode>('translate')
  const [docTitle, setDocTitle] = useState('')
  const [modeStates, setModeStates] = useState<Record<Mode, ModeState>>(INITIAL_MODE_STATE)

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
            ? snapshot.error ?? '生成失败'
            : snapshot.status === 'interrupted'
              ? '任务已中断，请重新发起'
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
        previousState.selectedTaskId && versions.some((version) => version.taskId === previousState.selectedTaskId)
          ? previousState.selectedTaskId
          : versions[0]?.taskId ?? null

      updateModeState(targetMode, (state) => ({
        ...state,
        loaded: true,
        versions,
        selectedTaskId,
        status: versions.length === 0 ? 'empty' : state.status,
        content: versions.length === 0 ? '' : state.content,
        error: versions.length === 0 ? '' : state.error,
        meta: versions.length === 0 ? null : state.meta,
        pollBlocked: versions.length === 0 ? false : state.pollBlocked,
      }))

      if (selectedTaskId) {
        await fetchTaskStatus(targetMode, selectedTaskId, {
          scheduleNext: targetMode === modeRef.current && !document.hidden,
        })
      }
    } catch {
      // Ignore list errors here; the page can retry via the action button.
    }
  }

  const startNewTask = async () => {
    stopPolling()
    pollFailureCountRef.current = 0

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

    updateModeState(mode, (state) => ({
      ...state,
      selectedTaskId: version.taskId,
      status: version.status === 'running' ? 'loading' : state.status,
      error: '',
      pollBlocked: false,
    }))

    await fetchTaskStatus(mode, version.taskId, {
      scheduleNext: version.status === 'running' && !document.hidden,
    })
  }

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
  const progressText = getProgressText(activeState.meta, activeState.status)
  const isRunning = activeState.status === 'loading' || activeState.status === 'running'

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-[#fafaf8]/80 backdrop-blur-sm dark:bg-[#1a1a1a]/80">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-3 px-4">
          <Link
            href={`/${id}`}
            className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="max-w-[160px] truncate sm:max-w-xs">{docTitle || '原文'}</span>
          </Link>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">智读</span>
        </div>
      </header>

      <div className="sticky top-12 z-30 border-b bg-[#fafaf8]/90 backdrop-blur-sm dark:bg-[#1a1a1a]/90">
        <div className="mx-auto max-w-2xl px-4">
          <div className="flex">
            {MODES.map((entry) => (
              <button
                key={entry.key}
                onClick={() => setMode(entry.key)}
                className={`flex-1 border-b-2 py-3 text-sm font-medium transition-colors ${
                  mode === entry.key
                    ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {entry.emoji} {entry.label}
              </button>
            ))}
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
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
          {activeState.versions.length === 0 ? '开始生成' : '重新生成'}
        </Button>

        {activeState.versions.map((version) => (
          <button
            key={version.taskId}
            onClick={() => void selectVersion(version)}
            title={formatVersionTime(version.createdAt)}
            className={`h-7 rounded-full px-2.5 text-xs transition-colors ${
              activeState.selectedTaskId === version.taskId
                ? 'bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-muted-foreground hover:text-foreground dark:bg-zinc-800'
            }`}
          >
            {`v${version.version}`}
          </button>
        ))}
      </div>

      <article className="mx-auto max-w-2xl px-5 pb-24 sm:pb-12">
        {activeState.status === 'empty' && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <span className="mb-4 text-4xl">{MODES.find((entry) => entry.key === mode)?.emoji}</span>
            <p className="mb-2 text-sm">点击“开始生成”创建新的{MODE_LABELS[mode]}任务</p>
            <p className="text-xs text-muted-foreground/80">结果会保存在历史版本里，可随时切换查看</p>
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
            {progressText && <p className="pt-2 text-sm text-muted-foreground">{progressText}</p>}
          </div>
        )}

        {activeState.content && (
          <div className="py-4">
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {activeState.selectedTaskId
                  ? `当前版本 ${
                      activeState.versions.find((version) => version.taskId === activeState.selectedTaskId)?.version ?? '-'
                    }`
                  : ''}
              </span>
              {progressText && <span>{progressText}</span>}
            </div>

            <div className="reading-body">
              <MarkdownRenderer content={activeState.content} />
            </div>

            {isRunning && (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                <span>轮询更新中...</span>
              </div>
            )}
          </div>
        )}
      </article>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-[#fafaf8] dark:bg-[#1a1a1a] sm:hidden">
        <div className="flex h-14 items-center justify-around">
          <Link
            href="/"
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="text-lg">📚</span>
            <span>文库</span>
          </Link>
          <Link
            href={`/${id}`}
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <BookOpen className="h-5 w-5" />
            <span>原文</span>
          </Link>
          <Link href={`/${id}/smart`} className="flex flex-col items-center gap-0.5 text-xs text-foreground transition-colors">
            <span className="text-lg">✨</span>
            <span>智读</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
