import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'

/** Strip common markdown syntax to produce plain readable text for previews. */
function toPlainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')          // remove images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')        // links → label text
    .replace(/^#{1,6}\s+/gm, '')                    // headings
    .replace(/^[-=*_]{3,}\s*$/gm, '')               // horizontal rules / setext underlines
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')     // bold/italic
    .replace(/_{1,3}([^_\n]+)_{1,3}/g, '$1')        // underscore bold/italic
    .replace(/`{1,3}[^`\n]*`{1,3}/g, '')            // inline & fenced code
    .replace(/^>\s*/gm, '')                          // blockquotes
    .replace(/^[-*+]\s+/gm, '')                      // unordered lists
    .replace(/^\d+\.\s+/gm, '')                      // ordered lists
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
}

export function DocumentCard({
  id, title, summary, tags, sourceUrl, sourceType, wordCount, createdAt
}: Props) {
  const hostname = (() => {
    try {
      return sourceUrl ? new URL(sourceUrl).hostname : null
    } catch {
      return null
    }
  })()

  return (
    <Link href={`/${id}`}>
      <article className="group rounded-xl border bg-card p-5 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-base leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2">
            {title}
          </h2>
          <span className="shrink-0 text-xs text-muted-foreground capitalize px-2 py-0.5 rounded bg-muted">
            {sourceType}
          </span>
        </div>

        {summary && (() => {
          const plain = toPlainText(summary)
          return plain ? (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {plain}
            </p>
          ) : null
        })()}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.slice(0, 5).map(tag => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{formatDate(createdAt)}</span>
          <span>·</span>
          <span>{wordCount.toLocaleString()} 字</span>
          {hostname && (
            <>
              <span>·</span>
              <span className="truncate max-w-[120px]">{hostname}</span>
            </>
          )}
        </div>
      </article>
    </Link>
  )
}
