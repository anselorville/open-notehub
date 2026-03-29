import {
  type WebAccessProvider,
  type WebAccessRequest,
} from '@/lib/web-access/types'
import {
  extractTitleFromHtml,
  htmlToText,
  pickPrimaryHtml,
  stripHtml,
} from '@/lib/web-access/html'
import { inferSiteName, normalizeWebUrl, toExcerpt } from '@/lib/web-access/url'

export const htmlFallbackProvider: WebAccessProvider = {
  id: 'html-fallback',
  async execute(request: WebAccessRequest) {
    const trace = [
      {
        at: new Date().toISOString(),
        stage: 'provider' as const,
        provider: 'html-fallback' as const,
        message: 'Fetching original page HTML as a fallback strategy',
      },
    ]

    try {
      const response = await fetch(request.url, {
        headers: {
          'User-Agent': 'Open NoteHub Web Access/1.0',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      })

      if (!response.ok) {
        return {
          status: 'failed',
          provider: 'html-fallback',
          finalUrl: request.url,
          normalizedUrl: normalizeWebUrl(request.url),
          siteName: inferSiteName(request.url),
          errorCode: 'fetch_failed',
          errorMessage: `HTML fallback returned ${response.status}`,
          trace: [
            ...trace,
            {
              at: new Date().toISOString(),
              stage: 'result',
              provider: 'html-fallback',
              message: 'HTML fallback returned a non-success status',
              details: { status: response.status },
            },
          ],
        }
      }

      const html = await response.text()
      const primaryHtml = pickPrimaryHtml(stripHtml(html))
      const contentMarkdown = htmlToText(primaryHtml)
      const title = extractTitleFromHtml(html, request.url)

      if (contentMarkdown.length < 120) {
        return {
          status: 'partial',
          provider: 'html-fallback',
          finalUrl: response.url || request.url,
          normalizedUrl: normalizeWebUrl(request.url),
          title,
          contentMarkdown,
          excerpt: toExcerpt(contentMarkdown),
          siteName: inferSiteName(request.url),
          trace: [
            ...trace,
            {
              at: new Date().toISOString(),
              stage: 'result',
              provider: 'html-fallback',
              message: 'HTML fallback returned limited text',
              details: { length: contentMarkdown.length },
            },
          ],
        }
      }

      return {
        status: 'success',
        provider: 'html-fallback',
        finalUrl: response.url || request.url,
        normalizedUrl: normalizeWebUrl(request.url),
        title,
        contentMarkdown,
        excerpt: toExcerpt(contentMarkdown),
        siteName: inferSiteName(request.url),
        trace: [
          ...trace,
          {
            at: new Date().toISOString(),
            stage: 'result',
            provider: 'html-fallback',
            message: 'HTML fallback extracted text content',
            details: { length: contentMarkdown.length },
          },
        ],
      }
    } catch (error) {
      return {
        status: 'failed',
        provider: 'html-fallback',
        finalUrl: request.url,
        normalizedUrl: normalizeWebUrl(request.url),
        siteName: inferSiteName(request.url),
        errorCode: 'fetch_timeout',
        errorMessage: error instanceof Error ? error.message : 'Unknown HTML fallback error',
        trace: [
          ...trace,
          {
            at: new Date().toISOString(),
            stage: 'result',
            provider: 'html-fallback',
            message: 'HTML fallback threw an exception',
            details: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
        ],
      }
    }
  },
}
