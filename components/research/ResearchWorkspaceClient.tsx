'use client'

import { startTransition, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowUpRight,
  ExternalLink,
  Library,
  Loader2,
  Search,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { Button } from '@/components/ui/button'
import type { ResearchResultPayload } from '@/lib/research/types'
import { cn, formatDate } from '@/lib/utils'

const SUGGESTED_QUESTIONS = [
  '这些关于 MCP 的文章共有哪几个核心判断？',
  '文库里最近关于 AI Agents 的讨论集中在什么方向？',
  '这些文章对网页抓取和导入链路有哪些不同做法？',
] as const

function getExternalStatusLabel(status: ResearchResultPayload['externalStatus']) {
  switch (status) {
    case 'not_requested':
      return '只查文库'
    case 'not_needed':
      return '文库已足够'
    case 'used':
      return '已补充网页'
    case 'unavailable':
      return '网页补充不可用'
  }
}

export function ResearchWorkspaceClient() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const query = searchParams.get('q')?.trim() ?? ''
  const scope = searchParams.get('scope') === 'library' ? 'library' : 'hybrid'

  const [draftQuestion, setDraftQuestion] = useState(query)
  const [draftScope, setDraftScope] = useState<'library' | 'hybrid'>(scope)
  const [result, setResult] = useState<ResearchResultPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraftQuestion(query)
    setDraftScope(scope)
  }, [query, scope])

  useEffect(() => {
    if (query.length < 2) {
      setResult(null)
      setError('')
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError('')

    const params = new URLSearchParams({ q: query, scope })
    fetch(`/api/research?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(data?.message ?? '研究请求失败')
        }

        setResult(data as ResearchResultPayload)
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setResult(null)
        setError(fetchError instanceof Error ? fetchError.message : '研究请求失败')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [query, scope])

  function submitQuestion(nextQuestion = draftQuestion, nextScope = draftScope) {
    const normalizedQuestion = nextQuestion.trim()
    if (normalizedQuestion.length < 2) {
      setError('请输入至少两个字符的问题')
      return
    }

    const params = new URLSearchParams()
    params.set('q', normalizedQuestion)
    if (nextScope !== 'hybrid') {
      params.set('scope', nextScope)
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`)
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:pb-8">
      <section className="rounded-[32px] border border-[#ddcfbf] bg-gradient-to-br from-[#faf1e4] via-[#f7efe2] to-[#efe2d2] px-5 py-6 shadow-[0_24px_52px_rgba(95,69,34,0.1)] dark:border-zinc-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(120,86,45,0.18),_rgba(20,17,15,0.96)_60%)] sm:px-7 sm:py-7">
        <div className="max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#907a63] dark:text-zinc-500">
            Open NoteHub · 搜索
          </p>
          <h1 className="mt-3 text-[2rem] font-semibold leading-tight tracking-tight text-[#241a12] dark:text-zinc-50 sm:text-[2.5rem]">
            围绕问题整理答案，而不只是搜一串结果
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-[#675746] dark:text-zinc-400">
            默认先查文库，文库不够时再补外部网页。你得到的是结构化结论、依据来源和后续追问，而不是只有命中列表。
          </p>
        </div>

        <div className="mt-6 rounded-[28px] border border-[#ddcfbf] bg-white/80 p-5 shadow-[0_16px_32px_rgba(89,63,27,0.08)] dark:border-zinc-800 dark:bg-zinc-950/70">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setDraftScope('hybrid')}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                draftScope === 'hybrid'
                  ? 'border-[#201710] bg-[#201710] text-[#f7f1e7] dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                  : 'border-[#ddcfbf] bg-[#fffaf2] text-[#6a563f] hover:bg-[#efe4d6] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
              )}
            >
              <WandSparkles className="h-4 w-4" aria-hidden="true" />
              先查文库，必要时补网页
            </button>
            <button
              type="button"
              onClick={() => setDraftScope('library')}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                draftScope === 'library'
                  ? 'border-[#201710] bg-[#201710] text-[#f7f1e7] dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                  : 'border-[#ddcfbf] bg-[#fffaf2] text-[#6a563f] hover:bg-[#efe4d6] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
              )}
            >
              <Library className="h-4 w-4" aria-hidden="true" />
              只查文库
            </button>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              submitQuestion()
            }}
            className="mt-4"
          >
            <textarea
              value={draftQuestion}
              onChange={(event) => setDraftQuestion(event.target.value)}
              placeholder="直接输入问题，例如：这几篇文章对网页抓取链路的共同判断是什么？"
              className="min-h-[120px] w-full rounded-[24px] border border-[#ddcfbf] bg-[#fffdf8] px-4 py-4 text-[15px] leading-7 text-[#241a12] placeholder:text-[#917a62] focus:outline-none focus:ring-2 focus:ring-[#8f6d48]/30 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="submit" className="h-11">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    研究中
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                    开始研究
                  </>
                )}
              </Button>
              <p className="text-sm text-[#6c5a49] dark:text-zinc-400">
                问题越具体，返回的研究结论越可用。
              </p>
            </div>
          </form>

          {!query && (
            <div className="mt-5 flex flex-wrap gap-3">
              {SUGGESTED_QUESTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setDraftQuestion(item)
                    submitQuestion(item)
                  }}
                  className="rounded-full border border-[#ddcfbf] bg-[#fffaf2] px-4 py-2 text-sm text-[#6a563f] transition-colors hover:bg-[#efe4d6] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {error && (
        <div className="mt-6 rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && !result && (
        <div className="mt-6 rounded-[24px] border border-[#dfcfbe] bg-white/80 px-5 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900/70">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#8d765d] dark:text-zinc-500" aria-hidden="true" />
          <p className="mt-4 text-sm text-muted-foreground">正在整理研究结论和来源依据…</p>
        </div>
      )}

      {result && (
        <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="space-y-6">
            <div className="rounded-[28px] border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full bg-[#f1e5d6] px-3 py-1 text-xs font-medium text-[#6d4c28] dark:bg-[#21180f] dark:text-[#ddb78a]">
                  {result.strategy === 'library_plus_web' ? '文库 + 网页' : '文库优先'}
                </span>
                <span className="inline-flex rounded-full bg-[#f5efe5] px-3 py-1 text-xs font-medium text-[#725d48] dark:bg-zinc-800 dark:text-zinc-300">
                  {getExternalStatusLabel(result.externalStatus)}
                </span>
              </div>
              <div className="mt-4">
                <h2 className="text-xl font-semibold tracking-tight text-[#241a12] dark:text-zinc-50">
                  {result.question}
                </h2>
              </div>
              <div className="mt-5">
                <MarkdownRenderer content={result.answerMarkdown} />
              </div>
            </div>

            <div className="rounded-[28px] border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#8d765d] dark:text-zinc-500" aria-hidden="true" />
                <h2 className="text-lg font-semibold tracking-tight text-[#241a12] dark:text-zinc-50">
                  继续追问
                </h2>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {result.followUps.map((followUp) => (
                  <button
                    key={followUp}
                    type="button"
                    onClick={() => {
                      setDraftQuestion(followUp)
                      submitQuestion(followUp)
                    }}
                    className="rounded-full border border-[#ddcfbf] bg-[#fffaf2] px-4 py-2 text-sm text-[#6a563f] transition-colors hover:bg-[#efe4d6] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {followUp}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[28px] border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div className="flex items-center gap-2">
                <Library className="h-5 w-5 text-[#8d765d] dark:text-zinc-500" aria-hidden="true" />
                <h2 className="text-lg font-semibold tracking-tight text-[#241a12] dark:text-zinc-50">
                  文库依据
                </h2>
              </div>
              <div className="mt-4 space-y-3">
                {result.internalResults.map((item) => (
                  <Link
                    key={item.id}
                    href={`/${item.id}`}
                    className="block rounded-[22px] border border-[#eadacc] bg-[#fffdf9] px-4 py-4 transition-colors hover:border-[#d8c3ab] dark:border-zinc-800 dark:bg-zinc-950/50 dark:hover:border-zinc-700"
                  >
                    <p className="text-sm font-medium text-[#241a12] dark:text-zinc-50">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[#665645] dark:text-zinc-400">
                      {item.summary || '文库中已有相关原文，可继续打开核对细节。'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.matchedTerms.map((term) => (
                        <span
                          key={term}
                          className="rounded-full bg-[#f3e8d8] px-2.5 py-1 text-xs text-[#6d4c28] dark:bg-[#21180f] dark:text-[#ddb78a]"
                        >
                          {term}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(item.createdAt)}</span>
                      <span>•</span>
                      <span>{item.wordCount.toLocaleString()} 字</span>
                    </div>
                  </Link>
                ))}

                {!result.internalResults.length && (
                  <p className="rounded-[22px] border border-dashed border-[#dcccc0] px-4 py-8 text-sm text-muted-foreground dark:border-zinc-800">
                    当前文库里还没有足够直接相关的文章。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div className="flex items-center gap-2">
                <ExternalLink className="h-5 w-5 text-[#8d765d] dark:text-zinc-500" aria-hidden="true" />
                <h2 className="text-lg font-semibold tracking-tight text-[#241a12] dark:text-zinc-50">
                  外部补充
                </h2>
              </div>
              <div className="mt-4 space-y-3">
                {result.externalResults.map((item) => (
                  <div
                    key={item.url}
                    className="rounded-[22px] border border-[#eadacc] bg-[#fffdf9] px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/50"
                  >
                    <p className="text-sm font-medium text-[#241a12] dark:text-zinc-50">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[#665645] dark:text-zinc-400">
                      {item.snippet || '已找到相关外部网页，可继续核对原文。'}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-[#6d4c28] hover:text-[#201710] dark:text-[#ddb78a] dark:hover:text-zinc-50"
                      >
                        打开原文
                        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                      <Link
                        href={`/intake?url=${encodeURIComponent(item.url)}`}
                        className="inline-flex items-center gap-2 text-sm font-medium text-[#6d4c28] hover:text-[#201710] dark:text-[#ddb78a] dark:hover:text-zinc-50"
                      >
                        送去入藏
                        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                ))}

                {!result.externalResults.length && (
                  <p className="rounded-[22px] border border-dashed border-[#dcccc0] px-4 py-8 text-sm text-muted-foreground dark:border-zinc-800">
                    {result.externalStatus === 'unavailable'
                      ? '本次外部网页补充暂时不可用。'
                      : '这次研究主要依赖文库内容，没有额外补充网页。'}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <h2 className="text-lg font-semibold tracking-tight text-[#241a12] dark:text-zinc-50">
                查询策略
              </h2>
              <div className="mt-4 space-y-3 text-sm text-[#665645] dark:text-zinc-400">
                <div>
                  <p className="font-medium text-[#241a12] dark:text-zinc-50">文库检索词</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.queryPlan.libraryQueries.map((term) => (
                      <span
                        key={term}
                        className="rounded-full bg-[#f3e8d8] px-2.5 py-1 text-xs text-[#6d4c28] dark:bg-[#21180f] dark:text-[#ddb78a]"
                      >
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="font-medium text-[#241a12] dark:text-zinc-50">外部补充查询</p>
                  <p className="mt-1">{result.queryPlan.webQuery}</p>
                </div>
              </div>
            </div>
          </aside>
        </section>
      )}
    </div>
  )
}
