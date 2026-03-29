import {
  type WebAccessProvider,
  type WebAccessProviderId,
  type WebAccessRequest,
  type WebAccessResult,
} from '@/lib/web-access/types'
import {
  buildJinaReaderUrl,
  inferSiteName,
  normalizeWebUrl,
  toExcerpt,
} from '@/lib/web-access/url'

function trace(
  provider: WebAccessProviderId,
  stage: 'provider' | 'result',
  message: string,
  details?: Record<string, unknown>
) {
  return {
    at: new Date().toISOString(),
    stage,
    provider,
    message,
    details,
  } as const
}

function extractTitle(rawText: string, fallbackUrl: string) {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    if (/^title:\s*/i.test(line)) {
      return line.replace(/^title:\s*/i, '').trim()
    }

    if (line.startsWith('# ')) {
      return line.slice(2).trim()
    }

    if (line.length > 12 && !line.startsWith('URL Source:')) {
      return line.replace(/^[#>*\-\s]+/, '').trim()
    }
  }

  return new URL(fallbackUrl).hostname
}

function normalizeReaderContent(rawText: string) {
  return rawText
    .replace(/^Markdown Content:\s*/im, '')
    .replace(/^URL Source:.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function fetchViaJinaReader(
  request: WebAccessRequest,
  provider: WebAccessProviderId
): Promise<WebAccessResult> {
  const traceEntries = [
    trace(provider, 'provider', 'Fetching normalized content through Jina reader'),
  ]

  try {
    const response = await fetch(buildJinaReaderUrl(request.url), {
      headers: {
        'User-Agent': 'Open NoteHub Web Access/1.0',
        Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.1',
      },
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    })

    if (!response.ok) {
      return {
        status: 'failed',
        provider,
        finalUrl: request.url,
        normalizedUrl: normalizeWebUrl(request.url),
        errorCode: 'fetch_failed',
        errorMessage: `Reader returned ${response.status}`,
        trace: [
          ...traceEntries,
          trace(provider, 'result', 'Reader request failed', {
            status: response.status,
          }),
        ],
      }
    }

    const rawText = await response.text()
    const contentMarkdown = normalizeReaderContent(rawText)
    const title = extractTitle(contentMarkdown, request.url)

    if (contentMarkdown.length < 80) {
      return {
        status: 'partial',
        provider,
        finalUrl: request.url,
        normalizedUrl: normalizeWebUrl(request.url),
        title,
        contentMarkdown,
        excerpt: toExcerpt(contentMarkdown),
        siteName: inferSiteName(request.url),
        trace: [
          ...traceEntries,
          trace(provider, 'result', 'Reader returned short content', {
            length: contentMarkdown.length,
          }),
        ],
      }
    }

    return {
      status: 'success',
      provider,
      finalUrl: request.url,
      normalizedUrl: normalizeWebUrl(request.url),
      title,
      contentMarkdown,
      excerpt: toExcerpt(contentMarkdown),
      siteName: inferSiteName(request.url),
      trace: [
        ...traceEntries,
        trace(provider, 'result', 'Reader returned content', {
          length: contentMarkdown.length,
        }),
      ],
    }
  } catch (error) {
    return {
      status: 'failed',
      provider,
      finalUrl: request.url,
      normalizedUrl: normalizeWebUrl(request.url),
      errorCode: 'fetch_timeout',
      errorMessage: error instanceof Error ? error.message : 'Unknown reader failure',
      trace: [
        ...traceEntries,
        trace(provider, 'result', 'Reader request threw an exception', {
          error: error instanceof Error ? error.message : String(error),
        }),
      ],
    }
  }
}

export const jinaReaderProvider: WebAccessProvider = {
  id: 'public-reader',
  execute(request) {
    return fetchViaJinaReader(request, 'public-reader')
  },
}
