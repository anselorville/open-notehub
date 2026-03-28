'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Search, SearchX } from 'lucide-react'
import { DocumentCard } from '@/components/DocumentCard'
import { TagFilter } from '@/components/TagFilter'
import { Input } from '@/components/ui/input'
import { useLibraryTheme } from '@/components/library/LibraryThemeContext'
import { type LibraryTheme } from '@/lib/library-theme'
import { cn } from '@/lib/utils'

interface SearchParams {
  q?: string
  tag?: string
  page?: string
  focus?: string
}

interface LibraryDocumentListItem {
  id: string
  title: string
  summary?: string | null
  tags: string[]
  source_url?: string | null
  source_type: string
  word_count: number
  created_at: string
}

interface LibraryHomeData {
  items: LibraryDocumentListItem[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

interface Props {
  data: LibraryHomeData
  tags: string[]
  searchParams: SearchParams
}

const PRODUCT_COPY = {
  eyebrow: 'Open NoteHub · 开放式知识文库',
  title: '收藏、搜索、理解每一篇值得留下的文章',
  description:
    'Open NoteHub 把保存下来的文章集中到一个地方，方便持续搜索、筛选与回看，并用 AI 继续翻译、总结和延展思考。',
}

const PRODUCT_CAPABILITIES = ['搜索文库', 'AI 智读', '持续回看']

const MODE_COPY: Record<
  LibraryTheme,
  {
    label: string
    placeholder: string
    note: string
  }
> = {
  focus: {
    label: '专注浏览',
    placeholder: '搜索文章标题、主题或关键词…',
    note: '当前强调连续浏览、标签筛选与稳定回看。',
  },
  editorial: {
    label: '导读编排',
    placeholder: '搜索专题、来源、关键词或想回看的文章…',
    note: '当前强调标题、摘要与快速挑选，适合先扫视再进入智读。',
  },
}

function getPaginationHref(nextPage: number, searchParams: SearchParams) {
  const params = new URLSearchParams()
  params.set('page', String(nextPage))

  if (searchParams.q) params.set('q', searchParams.q)
  if (searchParams.tag) params.set('tag', searchParams.tag)

  return `?${params.toString()}`
}

function getSearchShellClass(theme: LibraryTheme) {
  return theme === 'editorial'
    ? 'border-[#d8c2a9] bg-[#fff7ed] shadow-[0_18px_36px_rgba(97,70,32,0.08)]'
    : 'border-[#e2d6c7] bg-[#fffdf9] shadow-[0_14px_30px_rgba(100,77,49,0.08)]'
}

function getHeroClass(theme: LibraryTheme) {
  return theme === 'editorial'
    ? 'border-[#d8c3ab] bg-gradient-to-b from-[#f8efe1] to-[#f0e3d2] shadow-[0_24px_48px_rgba(94,66,28,0.1)]'
    : 'border-[#e5dbce] bg-[#fbf8f2] shadow-[0_20px_48px_rgba(96,74,46,0.08)]'
}

function getMetaCardClass(theme: LibraryTheme) {
  return theme === 'editorial'
    ? 'border-[#d7c1a8] bg-[#fff8ef] text-[#5e432a]'
    : 'border-[#e6dccf] bg-[#fffdf9] text-[#5a4735]'
}

function getResultsText(theme: LibraryTheme) {
  return theme === 'editorial'
    ? '更适合快速扫视与挑选文章。'
    : '更适合连续浏览与标签筛选。'
}

export function LibraryHomeClient({ data, tags, searchParams }: Props) {
  const { theme } = useLibraryTheme()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const modeCopy = MODE_COPY[theme]
  const page = Math.max(1, parseInt(searchParams.page ?? '1'))

  useEffect(() => {
    if (searchParams.focus !== 'search') return

    const input = searchInputRef.current
    if (!input) return

    input.focus()
    input.select()
    input.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [searchParams.focus])

  return (
    <div data-library-theme={theme} className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:pb-8">
      <section className={cn('overflow-hidden rounded-[30px] border px-5 py-6 sm:px-7 sm:py-7', getHeroClass(theme))}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#907a63] dark:text-zinc-500">
              {PRODUCT_COPY.eyebrow}
            </p>
            <h1 className="mt-3 text-[2rem] font-semibold leading-tight tracking-tight text-[#241a12] dark:text-zinc-50 sm:text-[2.4rem]">
              {PRODUCT_COPY.title}
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#675746] dark:text-zinc-400 sm:text-base">
              {PRODUCT_COPY.description}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {PRODUCT_CAPABILITIES.map(capability => (
                <span
                  key={capability}
                  className="rounded-full border border-[#dccfbe] bg-[#fffaf2] px-3 py-1 text-[12px] text-[#5f4d3a] dark:border-zinc-800 dark:bg-[#171310] dark:text-zinc-300"
                >
                  {capability}
                </span>
              ))}
            </div>
          </div>

          <div
            className={cn(
              'shrink-0 rounded-[24px] border px-4 py-4 sm:min-w-[170px]',
              getMetaCardClass(theme)
            )}
          >
            <div className="text-[11px] uppercase tracking-[0.18em] text-current/70">文库收录</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{data.total}</div>
            <div className="mt-1 text-sm text-current/75">
              {modeCopy.label} · {getResultsText(theme)}
            </div>
          </div>
        </div>

        <form method="GET" className="mt-6">
          {searchParams.tag && <input type="hidden" name="tag" value={searchParams.tag} />}
          <div className={cn('relative overflow-hidden rounded-[22px] border', getSearchShellClass(theme))}>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8f7a62] dark:text-zinc-500" aria-hidden="true" />
            <Input
              ref={searchInputRef}
              name="q"
              defaultValue={searchParams.q}
              placeholder={modeCopy.placeholder}
              className="h-14 border-0 bg-transparent pl-12 pr-4 text-[15px] leading-none text-[#2a2018] placeholder:text-[#907a63] focus-visible:ring-0 focus-visible:ring-offset-0 dark:text-zinc-50 dark:placeholder:text-zinc-500"
            />
          </div>
        </form>

        {tags.length > 0 && (
          <div className="mt-5">
            <TagFilter tags={tags} selected={searchParams.tag} theme={theme} />
          </div>
        )}
      </section>

      <div className="mb-5 mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#6f5c49] dark:text-zinc-400">
          共 {data.total} 篇文章
          {searchParams.q && <span>，搜索“{searchParams.q}”</span>}
        </p>
        <p className="text-sm text-[#87715a] dark:text-zinc-500">
          当前为 {modeCopy.label}，{modeCopy.note}
        </p>
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-[#dacdbd] bg-[#fbf6ef] px-6 py-14 text-center dark:border-zinc-800 dark:bg-[#171310]">
          <SearchX className="mx-auto h-9 w-9 text-[#8d785f] dark:text-zinc-500" aria-hidden="true" />
          <p className="mt-4 text-lg font-semibold text-[#2b2119] dark:text-zinc-50">没有找到匹配的文档</p>
          <p className="mt-2 text-sm leading-6 text-[#7b6753] dark:text-zinc-400">
            换个关键词，或先清掉标签筛选再试一次。
          </p>
        </div>
      ) : (
        <div className={cn(theme === 'editorial' ? 'space-y-4' : 'space-y-5')}>
          {data.items.map(doc => (
            <DocumentCard
              key={doc.id}
              id={doc.id}
              title={doc.title}
              summary={doc.summary}
              tags={doc.tags}
              sourceUrl={doc.source_url}
              sourceType={doc.source_type}
              wordCount={doc.word_count}
              createdAt={doc.created_at}
              theme={theme}
            />
          ))}
        </div>
      )}

      {(data.hasMore || page > 1) && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {page > 1 && (
            <Link
              href={getPaginationHref(page - 1, searchParams)}
              className="inline-flex h-10 items-center rounded-full border border-[#d8cab8] bg-[#fffaf2] px-4 text-sm text-[#4d3b2c] transition-colors hover:bg-[#f4ebde] hover:text-[#241a12] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              上一页
            </Link>
          )}
          {data.hasMore && (
            <Link
              href={getPaginationHref(page + 1, searchParams)}
              className="inline-flex h-10 items-center rounded-full border border-[#d8cab8] bg-[#fffaf2] px-4 text-sm text-[#4d3b2c] transition-colors hover:bg-[#f4ebde] hover:text-[#241a12] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              下一页
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
