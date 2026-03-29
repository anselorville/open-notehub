import { type WebAccessProvider } from '@/lib/web-access/types'
import { fetchViaBrowserUse } from '@/lib/web-access/providers/browser-use'
import { fetchViaRemoteEndpoint } from '@/lib/web-access/providers/remote-endpoint'
import { inferSiteName, normalizeWebUrl } from '@/lib/web-access/url'

export const browserSessionProvider: WebAccessProvider = {
  id: 'browser-session',
  async execute(request) {
    const profile = process.env.WEB_ACCESS_BROWSER_PROFILE?.trim()
    if (profile) {
      const localResult = await fetchViaBrowserUse({
        provider: 'browser-session',
        request,
        browser: 'real',
        profile,
        sessionName:
          process.env.WEB_ACCESS_BROWSER_SESSION?.trim() || 'web-access-browser-session',
        timeoutMs: Number(process.env.WEB_ACCESS_BROWSER_SESSION_TIMEOUT_MS ?? '45000'),
        selectionMessage: 'Browser-session provider selected for an auth-bound URL',
        unavailableCode: 'auth_required',
        unavailableMessage:
          'A browser-session profile was requested, but local profile-backed browsing is not available.',
      })

      if (
        localResult.status !== 'failed' ||
        !process.env.WEB_ACCESS_BROWSER_SESSION_ENDPOINT?.trim()
      ) {
        return localResult
      }
    }

    if (process.env.WEB_ACCESS_BROWSER_SESSION_ENDPOINT?.trim()) {
      return fetchViaRemoteEndpoint({
        provider: 'browser-session',
        request,
        endpointEnv: 'WEB_ACCESS_BROWSER_SESSION_ENDPOINT',
        tokenEnv: 'WEB_ACCESS_BROWSER_SESSION_TOKEN',
        unavailableCode: 'auth_required',
        unavailableMessage:
          'This URL likely needs a logged-in browser session, but no shared browser context is configured yet.',
        selectionMessage: 'Browser-session provider selected for an auth-bound URL',
      })
    }

    return {
      status: 'failed',
      provider: 'browser-session',
      finalUrl: request.url,
      normalizedUrl: normalizeWebUrl(request.url),
      siteName: inferSiteName(request.url),
      errorCode: 'auth_required',
      errorMessage:
        'This URL likely needs a logged-in browser session. Configure WEB_ACCESS_BROWSER_PROFILE or WEB_ACCESS_BROWSER_SESSION_ENDPOINT to enable it.',
      trace: [
        {
          at: new Date().toISOString(),
          stage: 'provider',
          provider: 'browser-session',
          message: 'Browser-session provider selected for an auth-bound URL',
        },
        {
          at: new Date().toISOString(),
          stage: 'result',
          provider: 'browser-session',
          message:
            'No local browser profile or remote browser-session backend is configured',
        },
      ],
    }
  },
}
