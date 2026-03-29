import { type WebAccessProvider } from '@/lib/web-access/types'
import { fetchViaBrowserUse } from '@/lib/web-access/providers/browser-use'
import { fetchViaRemoteEndpoint } from '@/lib/web-access/providers/remote-endpoint'

export const renderedPageProvider: WebAccessProvider = {
  id: 'rendered-page',
  async execute(request) {
    const localResult = await fetchViaBrowserUse({
      provider: 'rendered-page',
      request,
      browser: 'chromium',
      sessionName:
        process.env.WEB_ACCESS_RENDERER_SESSION?.trim() || 'web-access-rendered',
      timeoutMs: Number(process.env.WEB_ACCESS_RENDERER_TIMEOUT_MS ?? '30000'),
      selectionMessage:
        'Rendered-page provider selected for a JS-heavy or browser-preferred URL',
      unavailableCode: 'renderer_unavailable',
      unavailableMessage:
        'No local browser-backed renderer is available and no rendered-page backend is configured.',
    })

    if (
      localResult.status !== 'failed' ||
      !process.env.WEB_ACCESS_RENDERER_ENDPOINT?.trim()
    ) {
      return localResult
    }

    return fetchViaRemoteEndpoint({
      provider: 'rendered-page',
      request,
      endpointEnv: 'WEB_ACCESS_RENDERER_ENDPOINT',
      tokenEnv: 'WEB_ACCESS_RENDERER_TOKEN',
      unavailableCode: 'renderer_unavailable',
      unavailableMessage:
        'This URL likely needs rendered retrieval, but no rendered-page backend is configured yet.',
      selectionMessage: 'Rendered-page provider fell back to a remote renderer backend',
    })
  },
}
