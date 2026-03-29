export function normalizeWebUrl(input: string) {
  const url = new URL(input)
  const trackingParams = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'ref',
    'source',
  ]

  url.hash = ''
  for (const param of trackingParams) {
    url.searchParams.delete(param)
  }

  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = ''
  }

  url.hostname = url.hostname.toLowerCase()
  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1)
  }

  return url.toString()
}

export function buildJinaReaderUrl(input: string) {
  return `https://r.jina.ai/http://${input.replace(/^https?:\/\//, '')}`
}

export function inferSourceType(input: string) {
  const hostname = new URL(input).hostname.toLowerCase()
  if (hostname === 'x.com' || hostname === 'twitter.com') {
    return 'social'
  }
  if (hostname.includes('arxiv.org') || hostname.includes('doi.org')) {
    return 'paper'
  }
  return 'blog'
}

export function inferSiteName(input: string) {
  return new URL(input).hostname.replace(/^www\./, '')
}

export function toExcerpt(content: string, maxLength = 240) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`
}
