// lib/search/anspire.ts
// Thin wrapper around Anspire search API. No business logic.

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

interface AnspireItem {
  title?: string
  url?: string
  snippet?: string
  [key: string]: unknown
}

/**
 * Search the web via Anspire API.
 * Returns up to topK results. Throws on network/API failure.
 */
export async function search(query: string, topK = 5): Promise<SearchResult[]> {
  const apiKey = process.env.ANSPIRE_API_KEY
  if (!apiKey) throw new Error('ANSPIRE_API_KEY not configured')

  const url = new URL('https://plugin.anspire.cn/api/ntsearch/search')
  url.searchParams.set('query', query)
  url.searchParams.set('top_k', String(topK))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    throw new Error(`Anspire search failed: ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as { results?: AnspireItem[] } | AnspireItem[]
  const items: AnspireItem[] = Array.isArray(data) ? data : (data.results ?? [])

  return items.slice(0, topK).map(item => ({
    title:   String(item.title ?? ''),
    url:     String(item.url ?? ''),
    snippet: String(item.snippet ?? ''),
  }))
}
