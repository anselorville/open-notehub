import {
  WEB_ACCESS_PROVIDER_IDS,
  type WebAccessProviderId,
  type WebAccessRequest,
  type WebAccessTraceEntry,
} from '@/lib/web-access/types'

const SOCIAL_HOSTS = new Set(['x.com', 'twitter.com'])
const JS_HEAVY_HOSTS = [
  'zhihu.com',
  'xiaohongshu.com',
  'reddit.com',
  'youtube.com',
  'bilibili.com',
]
const AUTH_BOUND_HOSTS = [
  'notion.so',
  'notion.site',
  'linear.app',
  'app.slack.com',
  'mail.google.com',
  'docs.google.com',
]

function routeTrace(
  message: string,
  details?: Record<string, unknown>
): WebAccessTraceEntry {
  return {
    at: new Date().toISOString(),
    stage: 'route',
    message,
    details,
  }
}

function looksAuthBound(url: URL) {
  if (AUTH_BOUND_HOSTS.some((host) => url.hostname.includes(host))) {
    return true
  }

  return /(login|signin|account|settings|dashboard|workspace)/i.test(url.pathname)
}

function looksJsHeavy(url: URL) {
  if (JS_HEAVY_HOSTS.some((host) => url.hostname.includes(host))) {
    return true
  }

  return /(watch|video|thread|status|post|article|feed|explore)/i.test(url.pathname)
}

function isProviderId(value: string | null | undefined): value is WebAccessProviderId {
  return WEB_ACCESS_PROVIDER_IDS.includes(value as WebAccessProviderId)
}

function withFailureAwareOrder(
  order: WebAccessProviderId[],
  previousFailedProviders: WebAccessProviderId[] | undefined,
  trace: WebAccessTraceEntry[]
) {
  if (!previousFailedProviders?.length) {
    return { order, trace }
  }

  const previous = new Set(previousFailedProviders)
  const reordered = [
    ...order.filter((provider) => !previous.has(provider)),
    ...order.filter((provider) => previous.has(provider)),
  ]

  return {
    order: reordered,
    trace: [
      ...trace,
      routeTrace('Deprioritized providers that already failed on previous attempts', {
        previousFailedProviders,
      }),
    ],
  }
}

export function resolveProviderOrder(request: WebAccessRequest): {
  order: WebAccessProviderId[]
  trace: WebAccessTraceEntry[]
} {
  const url = new URL(request.url)
  const forcedProvider = request.forceProvider ?? undefined

  if (isProviderId(forcedProvider)) {
    return {
      order: [forcedProvider],
      trace: [
        routeTrace('Provider override requested', {
          provider: forcedProvider,
        }),
      ],
    }
  }

  if (SOCIAL_HOSTS.has(url.hostname.toLowerCase())) {
    return withFailureAwareOrder(
      ['social-x', 'public-reader', 'html-fallback'],
      request.previousFailedProviders,
      [
        routeTrace('Social URL detected, using social-first provider chain', {
          hostname: url.hostname,
        }),
      ]
    )
  }

  if (looksAuthBound(url)) {
    return withFailureAwareOrder(
      ['browser-session', 'rendered-page', 'html-fallback', 'public-reader'],
      request.previousFailedProviders,
      [
        routeTrace('Auth-bound URL heuristics matched', {
          hostname: url.hostname,
          pathname: url.pathname,
        }),
      ]
    )
  }

  if (request.preferredMode === 'browser' || looksJsHeavy(url)) {
    return withFailureAwareOrder(
      ['rendered-page', 'html-fallback', 'public-reader'],
      request.previousFailedProviders,
      [
        routeTrace('Browser-first routing selected for a JS-heavy or browser-preferred URL', {
          hostname: url.hostname,
          pathname: url.pathname,
          preferredMode: request.preferredMode ?? 'auto',
        }),
      ]
    )
  }

  return withFailureAwareOrder(
    ['public-reader', 'html-fallback'],
    request.previousFailedProviders,
    [
      routeTrace('Defaulting to public-page retrieval strategy', {
        hostname: url.hostname,
      }),
    ]
  )
}
