import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { type LibraryTheme } from '@/lib/library-theme'
import { cn, formatDate } from '@/lib/utils'

/** Strip common markdown syntax to produce plain readable text for previews. */
function toPlainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-=*_]{3,}\s*$/gm, '')
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_\n]+)_{1,3}/g, '$1')
    .replace(/`{1,3}[^`\n]*`{1,3}/g, '')
    .replace(/^>\s*/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Props {
  id: string
  title: string
  summary?: string | null
  tags: string[]
  sourceUrl?: string | null
  sourceType: string
  wordCount: number
  createdAt: string
  theme?: LibraryTheme
}

export function DocumentCard({
  id,
  title,
  summary,
  tags,
  sourceUrl,
  sourceType,
  wordCount,
  createdAt,
  theme = 'focus',
}: Props) {
  const hostname = (() => {
    try {
      return sourceUrl ? new URL(sourceUrl).hostname : null
    } catch {
      return null
    }
  })()

  const isEditorial = theme === 'editorial'
  const plainSummary = summary ? toPlainText(summary) : ''

  return (
    <Link href={`/${id}`} className="block">
      <article
        className={cn(
          'group relative overflow-hidden border transition-all duration-300 hover:-translate-y-0.5',
          isEditorial
            ? 'rounded-[26px] border-[#dbc5ac] bg-[#fcf4e8] px-5 py-5 shadow-[0_20px_42px_rgba(96,68,31,0.08)] hover:border-[#c9aa88] hover:shadow-[0_26px_52px_rgba(96,68,31,0.12)] dark:border-zinc-800 dark:bg-[#181411] dark:hover:border-zinc-700'
            : 'rounded-[28px] border-[#e4d8ca] bg-[#fffdf9] px-6 py-5 shadow-[0_18px_38px_rgba(100,77,49,0.08)] hover:border-[#d3c3b0] hover:shadow-[0_24px_48px_rgba(100,77,49,0.12)] dark:border-zinc-800 dark:bg-[#14110f] dark:hover:border-zinc-700'
        )}
      >
        <div
          className={cn(
            'absolute inset-x-6 top-0 h-px opacity-80',
            isEditorial
              ? 'bg-gradient-to-r from-[#9a6f44] to-transparent dark:from-zinc-500'
              : 'bg-[#eadfce] dark:bg-zinc-800'
          )}
        />

        {isEditorial && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#8a6d4e] dark:text-zinc-500">
            <span>{sourceType}</span>
            {hostname && (
              <>
                <span>•</span>
                <span className="truncate">{hostname}</span>
              </>
            )}
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <h2
            className={cn(
              'line-clamp-2 font-semibold tracking-tight transition-colors',
              isEditorial
                ? 'text-[1.45rem] leading-[1.12] text-[#24170e] group-hover:text-[#7e5630] dark:text-zinc-50 dark:group-hover:text-zinc-200'
                : 'text-[1.3rem] leading-[1.18] text-[#231911] group-hover:text-[#6e4b2d] dark:text-zinc-50 dark:group-hover:text-zinc-200'
            )}
          >
            {title}
          </h2>

          {!isEditorial && (
            <span className="shrink-0 rounded-full bg-[#f4ede3] px-2.5 py-1 text-[11px] capitalize text-[#6f5e4d] dark:bg-zinc-800 dark:text-zinc-300">
              {sourceType}
            </span>
          )}
        </div>

        {plainSummary ? (
          <p
            className={cn(
              'text-[15px] leading-7',
              isEditorial
                ? 'mt-4 line-clamp-3 text-[#5b4735] dark:text-zinc-400'
                : 'mt-3 line-clamp-2 text-[#6b5a49] dark:text-zinc-400'
            )}
          >
            {plainSummary}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {tags.slice(0, 5).map(tag => (
            <Badge
              key={tag}
              variant="secondary"
              className={cn(
                'text-[11px]',
                isEditorial
                  ? 'bg-[#eadbc8] text-[#644c37] hover:bg-[#e3d1ba] dark:bg-zinc-800 dark:text-zinc-300'
                  : 'bg-[#f3ece2] text-[#62503f] hover:bg-[#ebe0d1] dark:bg-zinc-800 dark:text-zinc-300'
              )}
            >
              {tag}
            </Badge>
          ))}
        </div>

        <div
          className={cn(
            'mt-5 flex flex-wrap items-center gap-2 text-xs',
            isEditorial
              ? 'text-[#8b735a] dark:text-zinc-500'
              : 'text-[#81705d] dark:text-zinc-500'
          )}
        >
          <span>{formatDate(createdAt)}</span>
          <span>•</span>
          <span>{wordCount.toLocaleString()} 字</span>
          {!isEditorial && hostname && (
            <>
              <span>•</span>
              <span className="truncate max-w-[120px]">{hostname}</span>
            </>
          )}
        </div>
      </article>
    </Link>
  )
}
