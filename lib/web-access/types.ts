export const WEB_ACCESS_PROVIDER_IDS = [
  'social-x',
  'public-reader',
  'browser-session',
  'rendered-page',
  'html-fallback',
] as const

export type WebAccessProviderId = (typeof WEB_ACCESS_PROVIDER_IDS)[number]

export interface WebAccessTraceEntry {
  at: string
  stage: 'route' | 'provider' | 'result'
  provider?: WebAccessProviderId
  message: string
  details?: Record<string, unknown>
}

export interface WebAccessRequest {
  url: string
  purpose: 'preview' | 'import'
  preferredMode?: 'auto' | 'static' | 'browser'
  forceProvider?: string | null
  previousFailedProviders?: WebAccessProviderId[]
  trace?: boolean
}

export interface WebAccessResult {
  status: 'success' | 'partial' | 'failed'
  provider: WebAccessProviderId
  finalUrl: string
  normalizedUrl: string
  title?: string
  contentMarkdown?: string
  excerpt?: string
  siteName?: string
  author?: string
  publishedAt?: string
  language?: string
  coverImage?: string
  errorCode?: string
  errorMessage?: string
  trace: WebAccessTraceEntry[]
  meta?: Record<string, unknown>
}

export interface WebAccessProvider {
  id: WebAccessProviderId
  execute(request: WebAccessRequest): Promise<WebAccessResult>
}
