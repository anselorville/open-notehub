'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, ArrowLeft, BookOpen } from 'lucide-react'

type Mode = 'translate' | 'summarize' | 'brainstorm'
type Status = 'empty' | 'loading' | 'streaming' | 'done' | 'error'

interface Version {
  id:           string
  version:      number
  status:       string
  created_at:   string
  completed_at: string | null
}

const MODES: { key: Mode; label: string; emoji: string }[] = [
  { key: 'translate',  label: '翻译',    emoji: '🌐' },
  { key: 'summarize',  label: '摘要',    emoji: '📋' },
  { key: 'brainstorm', label: '头脑风暴', emoji: '💡' },
]

const MODE_LABELS: Record<Mode, string> = {
  translate:  '翻译',
  summarize:  '摘要',
  brainstorm: '头脑风暴',
}

function formatVersionTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (isToday) return `今天 ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${time}`
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

export default function SmartPage() {
  const { id } = useParams<{ id: string }>()

  const [mode, setMode]               = useState<Mode>('translate')
  const [status, setStatus]           = useState<Status>('empty')
  const [content, setContent]         = useState('')
  const [error, setError]             = useState('')
  const [versions, setVersions]       = useState<Version[]>([])
  const [selectedVer, setSelectedVer] = useState<string | null>(null)
  const [docTitle, setDocTitle]       = useState('')

  const eventSourceRef = useRef<EventSource | null>(null)
  const statusRef = useRef<Status>('empty')

  const setStatusWithRef = (s: Status) => {
    statusRef.current = s
    setStatus(s)
  }

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => { eventSourceRef.current?.close() }
  }, [])

  // Fetch doc title on mount
  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then(r => r.json())
      .then((d: { title?: string }) => setDocTitle(d.title ?? ''))
      .catch(() => {})
  }, [id])

  function streamVersion(resultId: string) {
    eventSourceRef.current?.close()
    setContent('')
    setError('')
    setStatusWithRef('loading')

    const es = new EventSource(`/api/smart/stream/${resultId}`)
    eventSourceRef.current = es

    es.addEventListener('chunk', (e: MessageEvent) => {
      setStatusWithRef('streaming')
      setContent(prev => prev + e.data)
    })

    es.addEventListener('done', () => {
      setStatusWithRef('done')
      es.close()
      // Refresh versions to update timestamps
      loadVersions()
    })

    es.addEventListener('error', (e: Event) => {
      const msgEvent = e as MessageEvent
      try {
        const parsed = JSON.parse(msgEvent.data) as { message?: string }
        setError(parsed.message ?? '生成失败')
      } catch {
        if (statusRef.current !== 'done') setError('连接中断')
      }
      setStatusWithRef('error')
      es.close()
    })
  }

  const loadVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/smart/${id}/${mode}`)
      if (!res.ok) return
      const data = await res.json() as { versions: Version[] }
      // Replace state fully from DB (clears any optimistic entries)
      setVersions(data.versions ?? [])

      const latest = data.versions?.[0]
      if (latest) {
        setSelectedVer(latest.id)
        if (latest.status === 'done' || latest.status === 'running') {
          streamVersion(latest.id)
        } else if (latest.status === 'interrupted') {
          setStatusWithRef('error')
          setError('上次生成中断，请点击重新生成')
        }
      } else {
        setStatusWithRef('empty')
        setContent('')
      }
    } catch {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mode])

  useEffect(() => {
    setStatusWithRef('empty')
    setContent('')
    setError('')
    setVersions([])
    setSelectedVer(null)
    eventSourceRef.current?.close()
    loadVersions()
  }, [mode, loadVersions])

  async function startNewTask() {
    try {
      setStatusWithRef('loading')
      setContent('')
      setError('')

      const res = await fetch(`/api/smart/${id}/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (res.status === 409) {
        const data = await res.json() as { taskId: string }
        streamVersion(data.taskId)
        return
      }

      if (!res.ok) {
        const data = await res.json() as { message?: string }
        setError(data.message ?? '启动失败')
        setStatusWithRef('error')
        return
      }

      const data = await res.json() as { taskId: string }
      setSelectedVer(data.taskId)
      streamVersion(data.taskId)

      // Add optimistic version entry (replaced on 'done' when loadVersions fires)
      setVersions(prev => {
        if (prev.some(v => v.id === data.taskId)) return prev
        return [{
          id:           data.taskId,
          version:      (prev[0]?.version ?? 0) + 1,
          status:       'running',
          created_at:   new Date().toISOString(),
          completed_at: null,
        }, ...prev]
      })
    } catch {
      setError('请求失败，请重试')
      setStatusWithRef('error')
    }
  }

  function switchToVersion(ver: Version) {
    if (ver.id === selectedVer) return
    setSelectedVer(ver.id)
    streamVersion(ver.id)
  }

  const isGenerating = status === 'loading' || status === 'streaming'

  return (
    <div className="min-h-screen">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b bg-[#fafaf8]/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between gap-3">
          <Link
            href={`/${id}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="truncate max-w-[160px] sm:max-w-xs">{docTitle || '原文'}</span>
          </Link>
          <span className="text-xs font-medium text-muted-foreground shrink-0">智读</span>
        </div>
      </header>

      {/* Mode tabs */}
      <div className="sticky top-12 z-30 border-b bg-[#fafaf8]/90 dark:bg-[#1a1a1a]/90 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex">
            {MODES.map(m => (
              <button
                key={m.key}
                onClick={() => !isGenerating && setMode(m.key)}
                disabled={isGenerating}
                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                  mode === m.key
                    ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.emoji} {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top progress bar */}
      {isGenerating && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full bg-blue-500 animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      {/* Version chips + refresh button */}
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={startNewTask}
          disabled={isGenerating}
          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
          {versions.length === 0 ? '开始生成' : '重新生成'}
        </Button>

        {versions.slice(0, 5).map(ver => (
          <button
            key={ver.id}
            onClick={() => switchToVersion(ver)}
            className={`h-7 px-2.5 rounded-full text-xs transition-colors ${
              selectedVer === ver.id
                ? 'bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-800 text-muted-foreground hover:text-foreground'
            }`}
          >
            {formatVersionTime(ver.created_at)}
          </button>
        ))}
      </div>

      {/* Main content area */}
      <article className="max-w-2xl mx-auto px-5 pb-24 sm:pb-12">
        {status === 'empty' && !isGenerating && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <span className="text-4xl mb-4">
              {MODES.find(m => m.key === mode)?.emoji}
            </span>
            <p className="text-sm mb-4">点击 ↺ 开始{MODE_LABELS[mode]}</p>
          </div>
        )}

        {status === 'loading' && !content && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        )}

        {(status === 'streaming' || status === 'done') && content && (
          <div className="py-4 reading-body">
            <MarkdownRenderer content={content} />
            {status === 'streaming' && (
              <span className="inline-block w-0.5 h-4 bg-zinc-600 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="py-8 flex flex-col items-center gap-4">
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-6 py-4 text-sm text-red-700 dark:text-red-400 max-w-sm text-center">
              {error || '生成失败，请重试'}
            </div>
            <Button variant="outline" size="sm" onClick={startNewTask}>
              重新生成
            </Button>
          </div>
        )}
      </article>

      {/* Mobile bottom nav — z-50 to cover layout's nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-[#fafaf8] dark:bg-[#1a1a1a]">
        <div className="flex items-center justify-around h-14">
          <Link href="/" className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <span className="text-lg">📚</span>
            <span>文库</span>
          </Link>
          <Link href={`/${id}`} className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <BookOpen className="w-5 h-5" />
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
