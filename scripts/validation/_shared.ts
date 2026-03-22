import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export type ValidationLayer =
  | 'config'
  | 'provider_access'
  | 'capability'
  | 'app_smoke'

export type ValidationStatus = 'pass' | 'fail' | 'warn' | 'skip'

export interface ValidationCheck {
  id: string
  layer: ValidationLayer
  status: ValidationStatus
  summary: string
  detail?: string
  errorCode?: string
  data?: Record<string, unknown>
}

export interface ValidationReport {
  suite: string
  startedAt: string
  finishedAt?: string
  checks: ValidationCheck[]
}

const ENV_KEYS = [
  'AUTH_PASSWORD',
  'AGENT_API_KEY',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'LLM_MODEL_FALLBACKS',
  'LLM_MODEL_CANDIDATES',
  'ANSPIRE_API_KEY',
  'VALIDATION_BASE_URL',
] as const

let envLoaded = false

export function loadLocalEnv(): void {
  if (envLoaded) return
  envLoaded = true

  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1)
    if (!(key in process.env)) process.env[key] = value
  }
}

export function pickEnv(keys: readonly string[]): Record<string, string | undefined> {
  loadLocalEnv()
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]))
}

export function maskSecret(value: string | undefined): string | undefined {
  if (!value) return value
  if (value.length <= 8) return '********'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

export function candidateModels(): string[] {
  loadLocalEnv()
  const raw = process.env.LLM_MODEL_FALLBACKS ?? process.env.LLM_MODEL_CANDIDATES
  const current = process.env.LLM_MODEL
  const defaults = ['glm-4.5-air', 'glm-4.6', 'glm-4.7', 'glm-4.5']
  const combined = [
    ...(current ? [current] : []),
    ...(raw ? raw.split(',').map((v) => v.trim()).filter(Boolean) : []),
    ...defaults,
  ]
  return Array.from(new Set(combined))
}

export function createReport(suite: string): ValidationReport {
  return {
    suite,
    startedAt: new Date().toISOString(),
    checks: [],
  }
}

export function addCheck(report: ValidationReport, check: ValidationCheck): void {
  report.checks.push(check)
}

export function finishReport(report: ValidationReport): ValidationReport {
  return {
    ...report,
    finishedAt: new Date().toISOString(),
  }
}

export function hasFailures(report: ValidationReport): boolean {
  return report.checks.some((check) => check.status === 'fail')
}

export function mergeReports(suite: string, reports: ValidationReport[]): ValidationReport {
  return finishReport({
    suite,
    startedAt: reports[0]?.startedAt ?? new Date().toISOString(),
    checks: reports.flatMap((report) => report.checks),
  })
}

export function printReport(report: ValidationReport, json = false): void {
  const finalized = finishReport(report)
  if (json) {
    console.log(JSON.stringify(finalized, null, 2))
    return
  }

  console.log(`Validation suite: ${finalized.suite}`)
  for (const check of finalized.checks) {
    console.log(
      `[${check.status.toUpperCase()}] ${check.layer} :: ${check.id} :: ${check.summary}`
    )
    if (check.detail) console.log(`  detail: ${check.detail}`)
    if (check.errorCode) console.log(`  error: ${check.errorCode}`)
    if (check.data && Object.keys(check.data).length > 0) {
      console.log(`  data: ${JSON.stringify(check.data)}`)
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined
  return value as Record<string, unknown>
}

function parseProviderCode(detail: string): string | undefined {
  const match = detail.match(/\b(?:code|providerCode)["'=:\s]+("?)(\d{3,6})\1/i)
  return match?.[2]
}

function compactData(
  data: Record<string, unknown | undefined>
): Record<string, unknown> | undefined {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function classifyError(error: unknown): {
  layer: ValidationLayer
  errorCode: string
  detail: string
  data?: Record<string, unknown>
} {
  const detail = error instanceof Error ? error.message : String(error)
  const lower = detail.toLowerCase()
  const record = asRecord(error)
  const explicitErrorCode =
    typeof record?.errorCode === 'string' ? record.errorCode : undefined
  const status = typeof record?.status === 'number' ? record.status : undefined
  const providerCode =
    (typeof record?.providerCode === 'string' ? record.providerCode : undefined) ??
    parseProviderCode(detail)
  const model = typeof record?.model === 'string' ? record.model : undefined
  const body = typeof record?.body === 'string' ? record.body : undefined
  const data = compactData({
    status,
    providerCode,
    model,
    bodyPreview: body?.slice(0, 200),
  })

  if (lower.includes('must be set') || lower.includes('not configured')) {
    return { layer: 'config', errorCode: 'missing_config', detail, data }
  }
  if (explicitErrorCode === 'llm_model_access_denied' || providerCode === '1311') {
    return { layer: 'provider_access', errorCode: 'llm_model_access_denied', detail, data }
  }
  if (explicitErrorCode === 'llm_quota_exhausted' || providerCode === '1113') {
    return { layer: 'provider_access', errorCode: 'llm_quota_exhausted', detail, data }
  }
  if (
    explicitErrorCode === 'llm_auth_failed' ||
    status === 401 ||
    lower.includes('invalid api key')
  ) {
    return { layer: 'provider_access', errorCode: 'provider_auth_failed', detail, data }
  }
  if (
    explicitErrorCode === 'llm_rate_limited' ||
    status === 429 ||
    lower.includes('rate limit')
  ) {
    return { layer: 'provider_access', errorCode: 'provider_rate_limited', detail, data }
  }
  if (
    lower.includes('permission') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('llm_model_access_denied')
  ) {
    return { layer: 'provider_access', errorCode: 'provider_access_denied', detail, data }
  }
  if (
    lower.includes('timeout') ||
    lower.includes('aborted') ||
    lower.includes('econnreset')
  ) {
    return { layer: 'provider_access', errorCode: 'provider_timeout', detail, data }
  }
  if (
    lower.includes('econnrefused') ||
    lower.includes('fetch failed') ||
    lower.includes('network')
  ) {
    return { layer: 'provider_access', errorCode: 'provider_unreachable', detail, data }
  }
  return { layer: 'capability', errorCode: explicitErrorCode ?? 'runtime_error', detail, data }
}

export async function runCheck(
  report: ValidationReport,
  input: {
    id: string
    layer: ValidationLayer
    summary: string
    check: () => Promise<unknown>
  }
): Promise<void> {
  try {
    const data = await input.check()
    addCheck(report, {
      id: input.id,
      layer: input.layer,
      status: 'pass',
      summary: input.summary,
      data:
        data && typeof data === 'object' && Object.keys(data as Record<string, unknown>).length > 0
          ? (data as Record<string, unknown>)
          : undefined,
    })
  } catch (error) {
    const classified = classifyError(error)
    addCheck(report, {
      id: input.id,
      layer:
        classified.layer === 'config' || classified.layer === 'provider_access'
          ? classified.layer
          : input.layer,
      status: 'fail',
      summary: input.summary,
      detail: classified.detail,
      errorCode: classified.errorCode,
      data: classified.data,
    })
  }
}

export function warn(
  report: ValidationReport,
  id: string,
  layer: ValidationLayer,
  summary: string,
  detail: string,
  data?: Record<string, unknown>
): void {
  addCheck(report, { id, layer, status: 'warn', summary, detail, data })
}

export function skip(
  report: ValidationReport,
  id: string,
  layer: ValidationLayer,
  summary: string,
  detail: string
): void {
  addCheck(report, { id, layer, status: 'skip', summary, detail })
}

export function requiredKeys(...keys: string[]): string[] {
  loadLocalEnv()
  return keys.filter((key) => !process.env[key])
}

export function wantsJson(): boolean {
  return process.argv.includes('--json')
}

export function cliBaseUrl(): string {
  loadLocalEnv()
  const explicit = readArgValue('--base-url')
  return explicit ?? process.env.VALIDATION_BASE_URL ?? 'http://localhost:3000'
}

export function readArgValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  if (idx === -1) return undefined
  return process.argv[idx + 1]
}

export function isMain(metaUrl: string): boolean {
  const argv = process.argv[1]
  if (!argv) return false
  return pathToFileURL(path.resolve(argv)).href === metaUrl
}

export function cookieFromResponse(response: Response): string | undefined {
  const anyHeaders = response.headers as Headers & {
    getSetCookie?: () => string[]
  }
  const setCookies = anyHeaders.getSetCookie?.()
  if (setCookies && setCookies.length > 0) {
    return setCookies.map((entry) => entry.split(';', 1)[0]).join('; ')
  }
  const single = response.headers.get('set-cookie')
  return single ? single.split(';', 1)[0] : undefined
}

export function ensureBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<{ response: Response; data: T }> {
  const response = await fetch(url, init)
  const text = await response.text()
  let data: T
  try {
    data = JSON.parse(text) as T
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`)
  }
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} from ${url}: ${JSON.stringify(data).slice(0, 300)}`
    )
  }
  return { response, data }
}

export function summarizeEnv(): Record<string, unknown> {
  loadLocalEnv()
  return Object.fromEntries(
    ENV_KEYS.map((key) => {
      const value = process.env[key]
      return [
        key,
        key.endsWith('KEY') || key.includes('PASSWORD') ? maskSecret(value) : value ?? null,
      ]
    })
  )
}
