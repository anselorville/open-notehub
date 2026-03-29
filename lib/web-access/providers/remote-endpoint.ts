import {
  type WebAccessProviderId,
  type WebAccessRequest,
  type WebAccessResult,
  type WebAccessTraceEntry,
} from '@/lib/web-access/types'
import { inferSiteName, normalizeWebUrl, toExcerpt } from '@/lib/web-access/url'

interface RemoteProviderOptions {
  provider: WebAccessProviderId
  request: WebAccessRequest
  endpointEnv: string
  tokenEnv?: string
  unavailableCode: string
  unavailableMessage: string
  selectionMessage: string
}

interface RemoteProviderPayload {
  status?: 'success' | 'partial' | 'failed'
  finalUrl?: string
  normalizedUrl?: string
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
  meta?: Record<string, unknown>
  trace?: Array<Partial<WebAccessTraceEntry>>
}

function providerTrace(
  provider: WebAccessProviderId,
  stage: 'provider' | 'result',
  message: string,
  details?: Record<string, unknown>
): WebAccessTraceEntry {
  return {
    at: new Date().toISOString(),
    stage,
    provider,
    message,
    details,
  }
}

function normalizeRemoteTrace(
  provider: WebAccessProviderId,
  entries: Array<Partial<WebAccessTraceEntry>> | undefined
) {
  if (!entries?.length) {
    return []
  }

  return entries.map((entry) => ({
    at: entry.at ?? new Date().toISOString(),
    stage:
      entry.stage === 'route' || entry.stage === 'provider' || entry.stage === 'result'
        ? entry.stage
        : 'provider',
    provider,
    message: entry.message ?? 'Remote provider trace',
    details: entry.details,
  }))
}

export async function fetchViaRemoteEndpoint(
  options: RemoteProviderOptions
): Promise<WebAccessResult> {
  const endpoint = process.env[options.endpointEnv]?.trim()
  const token = options.tokenEnv ? process.env[options.tokenEnv]?.trim() : ''
  const trace = [
    providerTrace(options.provider, 'provider', options.selectionMessage),
  ]

  if (!endpoint) {
    return {
      status: 'failed',
      provider: options.provider,
      finalUrl: options.request.url,
      normalizedUrl: normalizeWebUrl(options.request.url),
      siteName: inferSiteName(options.request.url),
      errorCode: options.unavailableCode,
      errorMessage: options.unavailableMessage,
      trace: [
        ...trace,
        providerTrace(options.provider, 'result', 'No remote provider endpoint is configured', {
          endpointEnv: options.endpointEnv,
        }),
      ],
    }
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        url: options.request.url,
        purpose: options.request.purpose,
        preferredMode: options.request.preferredMode ?? 'auto',
      }),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    })

    if (!response.ok) {
      return {
        status: 'failed',
        provider: options.provider,
        finalUrl: options.request.url,
        normalizedUrl: normalizeWebUrl(options.request.url),
        siteName: inferSiteName(options.request.url),
        errorCode: 'provider_request_failed',
        errorMessage: `${options.provider} endpoint returned ${response.status}`,
        trace: [
          ...trace,
          providerTrace(options.provider, 'result', 'Remote provider endpoint returned an error', {
            endpoint,
            status: response.status,
          }),
        ],
      }
    }

    const payload = (await response.json()) as RemoteProviderPayload
    const finalUrl = payload.finalUrl?.trim() || options.request.url
    const contentMarkdown = payload.contentMarkdown?.trim()

    return {
      status: payload.status ?? (contentMarkdown ? 'success' : 'failed'),
      provider: options.provider,
      finalUrl,
      normalizedUrl: payload.normalizedUrl?.trim() || normalizeWebUrl(finalUrl),
      title: payload.title?.trim(),
      contentMarkdown,
      excerpt: payload.excerpt?.trim() || (contentMarkdown ? toExcerpt(contentMarkdown) : undefined),
      siteName: payload.siteName?.trim() || inferSiteName(finalUrl),
      author: payload.author?.trim(),
      publishedAt: payload.publishedAt?.trim(),
      language: payload.language?.trim(),
      coverImage: payload.coverImage?.trim(),
      errorCode: payload.errorCode?.trim(),
      errorMessage: payload.errorMessage?.trim(),
      meta: payload.meta,
      trace: [
        ...trace,
        providerTrace(options.provider, 'result', 'Remote provider endpoint returned a result', {
          endpoint,
          status: payload.status ?? null,
          contentLength: contentMarkdown?.length ?? 0,
        }),
        ...normalizeRemoteTrace(options.provider, payload.trace),
      ],
    }
  } catch (error) {
    return {
      status: 'failed',
      provider: options.provider,
      finalUrl: options.request.url,
      normalizedUrl: normalizeWebUrl(options.request.url),
      siteName: inferSiteName(options.request.url),
      errorCode: 'provider_request_exception',
      errorMessage: error instanceof Error ? error.message : 'Unknown provider bridge error',
      trace: [
        ...trace,
        providerTrace(options.provider, 'result', 'Remote provider endpoint threw an exception', {
          endpoint,
          error: error instanceof Error ? error.message : String(error),
        }),
      ],
    }
  }
}
