import { execFile } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { promisify } from 'util'
import {
  extractTitleFromHtml,
  htmlToText,
  pickPrimaryHtml,
  stripHtml,
} from '@/lib/web-access/html'
import {
  type WebAccessProviderId,
  type WebAccessRequest,
  type WebAccessResult,
} from '@/lib/web-access/types'
import { inferSiteName, normalizeWebUrl, toExcerpt } from '@/lib/web-access/url'

const execFileAsync = promisify(execFile)
const LOADING_TITLE_PATTERN = /^Starting agent /i

type BrowserUseMode = 'chromium' | 'real'

interface BrowserUseFetchOptions {
  provider: WebAccessProviderId
  request: WebAccessRequest
  browser: BrowserUseMode
  sessionName: string
  profile?: string
  timeoutMs: number
  selectionMessage: string
  unavailableCode: string
  unavailableMessage: string
}

function getBrowserUseExecutable() {
  const configured = process.env.WEB_ACCESS_BROWSER_USE_PATH?.trim()
  if (configured) {
    return configured
  }

  const localExecutable = path.join(
    process.cwd(),
    '.venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'browser-use.exe' : 'browser-use'
  )

  if (existsSync(localExecutable)) {
    return localExecutable
  }

  return 'browser-use'
}

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

function extractPrefixedValue(stdout: string, prefix: string) {
  const normalized = stdout.replace(/\r\n/g, '\n').trim()
  if (normalized.startsWith(`${prefix}:`)) {
    return normalized.slice(prefix.length + 1).trim()
  }

  return normalized
}

function getTimeoutCode(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'killed' in error &&
    error.killed
  ) {
    return 'browser_use_timeout'
  }

  return 'browser_use_command_failed'
}

async function runBrowserUseCommand(
  options: BrowserUseFetchOptions,
  command: string[],
  timeoutMs: number
) {
  const executable = getBrowserUseExecutable()
  const args = [
    '--session',
    options.sessionName,
    '--browser',
    options.browser,
    ...(options.profile ? ['--profile', options.profile] : []),
    ...command,
  ]

  const result = await execFileAsync(executable, args, {
    cwd: process.cwd(),
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
  })

  return result.stdout.trim()
}

async function waitForStablePage(options: BrowserUseFetchOptions) {
  const deadline = Date.now() + options.timeoutMs
  let lastInfo: { href: string; title: string; ready: string } | null = null

  while (Date.now() < deadline) {
    try {
      await runBrowserUseCommand(
        options,
        ['wait', 'selector', 'body', '--timeout', '5000'],
        10_000
      )
    } catch {
      // Some pages render the body late; keep polling the page state below.
    }

    const raw = await runBrowserUseCommand(
      options,
      ['eval', 'JSON.stringify({href: location.href, title: document.title, ready: document.readyState})'],
      10_000
    )
    const payload = extractPrefixedValue(raw, 'result')

    try {
      const parsed = JSON.parse(payload) as {
        href?: string
        title?: string
        ready?: string
      }
      lastInfo = {
        href: parsed.href?.trim() || '',
        title: parsed.title?.trim() || '',
        ready: parsed.ready?.trim() || '',
      }
    } catch {
      lastInfo = null
    }

    if (
      lastInfo &&
      lastInfo.href &&
      lastInfo.href !== 'about:blank' &&
      lastInfo.ready === 'complete' &&
      !LOADING_TITLE_PATTERN.test(lastInfo.title)
    ) {
      return lastInfo
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return lastInfo
}

export async function fetchViaBrowserUse(
  options: BrowserUseFetchOptions
): Promise<WebAccessResult> {
  const traceEntries = [
    trace(options.provider, 'provider', options.selectionMessage, {
      browser: options.browser,
      profile: options.profile ?? null,
      sessionName: options.sessionName,
    }),
  ]

  try {
    await runBrowserUseCommand(
      options,
      ['open', options.request.url],
      Math.min(options.timeoutMs, 30_000)
    )

    const pageInfo = await waitForStablePage(options)
    if (!pageInfo?.href || pageInfo.href === 'about:blank') {
      return {
        status: 'failed',
        provider: options.provider,
        finalUrl: options.request.url,
        normalizedUrl: normalizeWebUrl(options.request.url),
        siteName: inferSiteName(options.request.url),
        errorCode: 'page_not_ready',
        errorMessage: 'Browser page did not reach a stable loaded state in time.',
        trace: [
          ...traceEntries,
          trace(options.provider, 'result', 'Browser-backed page never became ready', {
            browser: options.browser,
            profile: options.profile ?? null,
          }),
        ],
      }
    }

    const htmlOutput = await runBrowserUseCommand(
      options,
      ['get', 'html'],
      Math.min(options.timeoutMs, 20_000)
    )
    const html = extractPrefixedValue(htmlOutput, 'html')
    const finalUrl = pageInfo.href || options.request.url
    const title =
      pageInfo.title && !LOADING_TITLE_PATTERN.test(pageInfo.title)
        ? pageInfo.title
        : extractTitleFromHtml(html, finalUrl)
    const contentMarkdown = htmlToText(pickPrimaryHtml(stripHtml(html)))

    if (contentMarkdown.length < 120) {
      return {
        status: 'partial',
        provider: options.provider,
        finalUrl,
        normalizedUrl: normalizeWebUrl(finalUrl),
        title,
        contentMarkdown,
        excerpt: toExcerpt(contentMarkdown),
        siteName: inferSiteName(finalUrl),
        trace: [
          ...traceEntries,
          trace(options.provider, 'result', 'Browser-backed provider returned limited text', {
            finalUrl,
            length: contentMarkdown.length,
          }),
        ],
      }
    }

    return {
      status: 'success',
      provider: options.provider,
      finalUrl,
      normalizedUrl: normalizeWebUrl(finalUrl),
      title,
      contentMarkdown,
      excerpt: toExcerpt(contentMarkdown),
      siteName: inferSiteName(finalUrl),
      trace: [
        ...traceEntries,
        trace(options.provider, 'result', 'Browser-backed provider extracted rendered HTML', {
          finalUrl,
          length: contentMarkdown.length,
        }),
      ],
    }
  } catch (error) {
    const errorCode =
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
        ? options.unavailableCode
        : getTimeoutCode(error)

    return {
      status: 'failed',
      provider: options.provider,
      finalUrl: options.request.url,
      normalizedUrl: normalizeWebUrl(options.request.url),
      siteName: inferSiteName(options.request.url),
      errorCode,
      errorMessage:
        errorCode === options.unavailableCode
          ? options.unavailableMessage
          : error instanceof Error
            ? error.message
            : 'Unknown browser-use failure',
      trace: [
        ...traceEntries,
        trace(options.provider, 'result', 'Browser-backed provider threw an exception', {
          error: error instanceof Error ? error.message : String(error),
          browser: options.browser,
          profile: options.profile ?? null,
        }),
      ],
    }
  }
}
