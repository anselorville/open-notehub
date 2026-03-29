'use client'

import Link from 'next/link'
import { Archive, ArrowUpRight, SearchX, Sparkles } from 'lucide-react'
import { DocumentCard } from '@/components/DocumentCard'
import { TagFilter } from '@/components/TagFilter'
import { useLibraryTheme } from '@/components/library/LibraryThemeContext'
import { type LibraryTheme } from '@/lib/library-theme'
import { cn } from '@/lib/utils'

interface SearchParams {
  tag?: string
  page?: string
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
  eyebrow: 'Open NoteHub · 文库',
  title: '把已经留下的内容整理成可浏览、可回看的知识文库',
  description:
    '这里负责浏览、分类和持续回看。把外部网页收入文库请去入藏，围绕问题整理答案请去搜索。',
}

const PRODUCT_CAPABILITIES = ['标签筛选', '最近入库', '持续回看']

const WORKSPACE_LINKS = [
  {
    href: '/intake',
    title: '入藏',
    description: '把外部网页链接解析成预览，再确认收入文库。',
    cta: '去入藏',
    icon: Archive,
  },
  {
    href: '/search',
    title: '搜索',
    description: '围绕问题做研究，先查文库，不够再补外部网页。',
    cta: '去搜索',
    icon: Sparkles,
  },
] as const

const MODE_COPY: Record<
  LibraryTheme,
  {
    label: string
    note: string
  }
> = {
  focus: {
    label: '专注浏览',
    note: '当前强调连续浏览、标签筛选与稳定回看。',
  },
  editorial: {
    label: '导读编排',
    note: '当前强调标题、摘要与快速挑选，适合先扫视再进入智读。',
  },
}

function getPaginationHref(nextPage: number, searchParams: SearchParams) {
  const params = new URLSearchParams()
  params.set('page', String(nextPage))

  if (searchParams.tag) {
    params.set('tag', searchParams.tag)
  }

  return `?${params.toString()}`
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
  const modeCopy = MODE_COPY[theme]
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))

  return (
    <div data-library-theme={theme} className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:pb-8">
      <section
        className={cn(
          'overflow-hidden rounded-[30px] border px-5 py-6 sm:px-7 sm:py-7',
          getHeroClass(theme)
        )}
      >
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
              {PRODUCT_CAPABILITIES.map((capability) => (
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

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {WORKSPACE_LINKS.map((link) => {
            const Icon = link.icon

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'group rounded-[24px] border px-4 py-4 transition-all duration-300 hover:-translate-y-0.5',
                  theme === 'editorial'
                    ? 'border-[#d8c3ab] bg-[#fff8ef] hover:border-[#c8a988] hover:shadow-[0_20px_40px_rgba(90,63,25,0.12)]'
                    : 'border-[#e2d6c7] bg-[#fffdf9] hover:border-[#d0c1af] hover:shadow-[0_18px_40px_rgba(100,77,49,0.1)]'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-[#2a1f16] dark:text-zinc-50">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span>{link.title}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#675746] dark:text-zinc-400">
                      {link.description}
                    </p>
                  </div>
                  <ArrowUpRight
                    className="h-4 w-4 shrink-0 text-[#8f7a62] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 dark:text-zinc-500"
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#6d4c28] dark:text-[#ddb78a]">
                  {link.cta}
                </div>
              </Link>
            )
          })}
        </div>

        {tags.length > 0 && (
          <div className="mt-5">
            <TagFilter tags={tags} selected={searchParams.tag} theme={theme} />
          </div>
        )}
      </section>

      <div className="mb-5 mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#6f5c49] dark:text-zinc-400">
          共 {data.total} 篇文章，按时间倒序浏览当前文库。
        </p>
        <p className="text-sm text-[#87715a] dark:text-zinc-500">
          当前为 {modeCopy.label}，{modeCopy.note}
        </p>
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-[#dacdbd] bg-[#fbf6ef] px-6 py-14 text-center dark:border-zinc-800 dark:bg-[#171310]">
          <SearchX className="mx-auto h-9 w-9 text-[#8d785f] dark:text-zinc-500" aria-hidden="true" />
          <p className="mt-4 text-lg font-semibold text-[#2b2119] dark:text-zinc-50">当前筛选下还没有文档</p>
          <p className="mt-2 text-sm leading-6 text-[#7b6753] dark:text-zinc-400">
            可以先清掉标签筛选，或者去入藏把新的网页内容收入文库。
          </p>
        </div>
      ) : (
        <div className={cn(theme === 'editorial' ? 'space-y-4' : 'space-y-5')}>
          {data.items.map((doc) => (
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
