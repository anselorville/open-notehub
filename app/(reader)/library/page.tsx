import { LibraryHomePage } from '@/components/library/LibraryHomePage'
import type { LibrarySearchParams } from '@/lib/library/data'

export default async function LibraryAliasPage({
  searchParams,
}: {
  searchParams: LibrarySearchParams
}) {
  return <LibraryHomePage searchParams={searchParams} />
}
