import { redirect } from 'next/navigation'
import { LibraryHomeClient } from '@/components/library/LibraryHomeClient'
import { getAllLibraryTags, getLibraryDocuments, type LibrarySearchParams } from '@/lib/library/data'

function buildSearchRedirect(searchParams: LibrarySearchParams) {
  const params = new URLSearchParams()

  if (searchParams.q?.trim()) {
    params.set('q', searchParams.q.trim())
  }

  return params.toString() ? `/search?${params.toString()}` : '/search'
}

export async function LibraryHomePage({
  searchParams,
}: {
  searchParams: LibrarySearchParams & { focus?: string }
}) {
  if (searchParams.q?.trim() || searchParams.focus === 'search') {
    redirect(buildSearchRedirect(searchParams))
  }

  const [data, tags] = await Promise.all([
    getLibraryDocuments(searchParams),
    getAllLibraryTags(),
  ])

  return <LibraryHomeClient data={data} tags={tags} searchParams={searchParams} />
}
