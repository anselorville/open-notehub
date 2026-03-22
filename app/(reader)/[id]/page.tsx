import { Suspense, cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { DeferredServerMarkdownRenderer } from '@/components/DeferredServerMarkdownRenderer'
import { ReadingProgress } from '@/components/ReadingProgress'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'

interface Params {
  id: string
}

const getDocumentRecord = cache(async (id: string) => {
  return db.query.documents.findFirst({
    where: eq(schema.documents.id, id),
  })
})

async function getDocument(id: string) {
  const doc = await getDocumentRecord(id)
  if (!doc) return null

  return {
    ...doc,
    tags: JSON.parse(doc.tags) as string[],
    created_at: doc.createdAt instanceof Date
      ? doc.createdAt.toISOString()
      : new Date(Number(doc.createdAt) * 1000).toISOString(),
  }
}

function incrementReadCount(id: string) {
  void db.run(sql`UPDATE documents SET read_count = read_count + 1 WHERE id = ${id}`)
    .catch(err => console.error('[read_count]', err))
}

function ArticleBodyFallback() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-3/4 rounded bg-zinc-200/80 dark:bg-zinc-800/80" />
      <div className="h-4 w-full rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
      <div className="h-4 w-11/12 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
      <div className="h-4 w-5/6 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
      <div className="h-40 rounded-xl bg-zinc-200/60 dark:bg-zinc-800/60" />
    </div>
  )
}

export default async function ReadingPage({ params }: { params: Params }) {
  const doc = await getDocument(params.id)
  if (!doc) notFound()

  incrementReadCount(params.id)

  return (
    <>
      <ReadingProgress />

      <article className="max-w-2xl mx-auto px-5 py-8 pb-24 sm:pb-12 reading-body">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8 no-underline transition-colors"
        >
          ← 返回文库
        </Link>

        <header className="mb-8">
          <h1 className="text-2xl font-bold leading-tight mb-4 text-zinc-900 dark:text-zinc-100 font-sans">
            {doc.title}
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{formatDate(doc.created_at)}</span>
            <span>·</span>
            <span>{doc.wordCount?.toLocaleString()} 字</span>
            {doc.sourceUrl && (
              <>
                <span>·</span>
                <a
                  href={doc.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  原文链接
                </a>
              </>
            )}
          </div>

          {doc.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {doc.tags.map((tag: string) => (
                <Link key={tag} href={`/?tag=${encodeURIComponent(tag)}`}>
                  <Badge variant="secondary" className="text-xs cursor-pointer">
                    {tag}
                  </Badge>
                </Link>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <Link
              href={`/${doc.id}/smart`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm
                         bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900
                         hover:opacity-80 transition-opacity font-medium"
            >
              <Sparkles className="w-3.5 h-3.5" />
              智读
            </Link>
          </div>
        </header>

        <hr className="border-zinc-200 dark:border-zinc-700 mb-8" />

        <Suspense fallback={<ArticleBodyFallback />}>
          <DeferredServerMarkdownRenderer content={doc.content} />
        </Suspense>

        <footer className="mt-12 pt-6 border-t border-zinc-200 dark:border-zinc-700">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← 返回文库
          </Link>
        </footer>
      </article>
    </>
  )
}

export async function generateMetadata({ params }: { params: Params }) {
  const doc = await getDocumentRecord(params.id)
  return {
    title: doc ? `${doc.title} · LearnHub` : 'Not Found',
  }
}
