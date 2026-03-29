import { browserSessionProvider } from '@/lib/web-access/providers/browser-session'
import { htmlFallbackProvider } from '@/lib/web-access/providers/html-fallback'
import { jinaReaderProvider } from '@/lib/web-access/providers/jina-reader'
import { renderedPageProvider } from '@/lib/web-access/providers/rendered-page'
import { socialXProvider } from '@/lib/web-access/providers/social-x'
import { resolveProviderOrder } from '@/lib/web-access/policies'
import {
  type WebAccessProviderId,
  type WebAccessRequest,
  type WebAccessResult,
} from '@/lib/web-access/types'
import { normalizeWebUrl } from '@/lib/web-access/url'

const providers: Record<WebAccessProviderId, typeof socialXProvider> = {
  'social-x': socialXProvider,
  'public-reader': jinaReaderProvider,
  'browser-session': browserSessionProvider,
  'rendered-page': renderedPageProvider,
  'html-fallback': htmlFallbackProvider,
}

export async function fetchWebAccess(
  request: WebAccessRequest
): Promise<WebAccessResult> {
  const routing = resolveProviderOrder(request)
  const trace = [...routing.trace]
  let lastFailure: WebAccessResult | null = null

  for (const providerId of routing.order) {
    trace.push({
      at: new Date().toISOString(),
      stage: 'route',
      provider: providerId,
      message: `Trying provider ${providerId}`,
    })

    const result = await providers[providerId].execute(request)
    trace.push(...result.trace)

    if (result.status !== 'failed') {
      return {
        ...result,
        trace,
      }
    }

    lastFailure = result
  }

  return {
    status: 'failed',
    provider: lastFailure?.provider ?? routing.order[0] ?? 'public-reader',
    finalUrl: request.url,
    normalizedUrl: normalizeWebUrl(request.url),
    errorCode: lastFailure?.errorCode ?? 'all_providers_failed',
    errorMessage: lastFailure?.errorMessage ?? 'All web-access providers failed',
    trace,
  }
}
