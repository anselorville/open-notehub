import {
  addCheck,
  classifyError,
  cliBaseUrl,
  cookieFromResponse,
  createReport,
  ensureBaseUrl,
  fetchJson,
  finishReport,
  isMain,
  loadLocalEnv,
  printReport,
  requiredKeys,
  runCheck,
  skip,
  wantsJson,
} from './_shared'
import { chatOnce } from '../../lib/llm/client'
import { TRANSLATE_CHUNK_SYSTEM } from '../../lib/llm/prompts'

interface DocumentListResponse {
  items: Array<{ id: string; title: string; tags: string[] }>
}

interface DocumentDetailResponse {
  id: string
  title: string
  content: string
}

interface LoginResponse {
  ok: boolean
}

interface CreateDocResponse {
  id: string
}

interface StartTaskResponse {
  taskId: string
  version: number
}

interface TaskResponse {
  taskId: string
  status: 'running' | 'done' | 'error' | 'interrupted'
  result: string
  version: number
  error: string | null
  meta?: Record<string, unknown> | null
}

async function login(baseUrl: string): Promise<string> {
  const password = process.env.AUTH_PASSWORD
  if (!password) throw new Error('AUTH_PASSWORD must be set')

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from login: ${(await response.text()).slice(0, 200)}`)
  }

  const cookie = cookieFromResponse(response)
  if (!cookie) throw new Error('login did not return a session cookie')
  return cookie
}

async function getOrCreateFixture(
  baseUrl: string,
  cookie: string
): Promise<{ id: string; title: string; content: string }> {
  const existing = await fetchJson<DocumentListResponse>(`${baseUrl}/api/documents?tag=validation&limit=1`, {
    headers: { Cookie: cookie },
  })

  if (existing.data.items.length > 0) {
    const doc = existing.data.items[0]
    const detail = await fetchJson<DocumentDetailResponse>(`${baseUrl}/api/documents/${doc.id}`, {
      headers: { Cookie: cookie },
    })
    return {
      id: detail.data.id,
      title: detail.data.title,
      content: detail.data.content,
    }
  }

  const agentKey = process.env.AGENT_API_KEY
  if (!agentKey) {
    throw new Error('No validation fixture found and AGENT_API_KEY is not configured')
  }

  const now = new Date().toISOString()
  const content =
    'Validation smoke content. This document exists so the infrastructure harness can verify a complete smart-reading translation path.'
  const create = await fetchJson<CreateDocResponse>(`${baseUrl}/api/v1/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${agentKey}`,
    },
    body: JSON.stringify({
      title: `Validation Smoke Fixture ${now}`,
      content,
      source_url: '',
      source_type: 'other',
      tags: ['validation'],
      summary: 'Validation smoke fixture',
      agent_id: 'default',
    }),
  })

  return {
    id: create.data.id,
    title: `Validation Smoke Fixture ${now}`,
    content,
  }
}

async function probeDirectLlm(): Promise<{
  ok: boolean
  layer: string
  errorCode?: string
  detail?: string
  status?: number
  providerCode?: string
  model?: string
  body?: string
}> {
  try {
    const result = await chatOnce({
      messages: [
        { role: 'system', content: TRANSLATE_CHUNK_SYSTEM('中文') },
        { role: 'user', content: 'This is a validation probe.' },
      ],
      maxTokens: 128,
    })

    if (!result.content.trim()) {
      throw new Error('Direct translate probe returned empty content')
    }

    return {
      ok: true,
      layer: 'provider_access',
      model: result.model ?? process.env.LLM_MODEL,
      detail: result.content.trim().slice(0, 120),
    }
  } catch (error) {
    const classified = classifyError(error)
    const errorRecord =
      error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined

    return {
      ok: false,
      layer: classified.layer,
      errorCode: classified.errorCode,
      detail: classified.detail,
      status: typeof errorRecord?.status === 'number' ? errorRecord.status : undefined,
      providerCode:
        typeof errorRecord?.providerCode === 'string' ? errorRecord.providerCode : undefined,
      model: typeof errorRecord?.model === 'string' ? errorRecord.model : undefined,
      body: typeof errorRecord?.body === 'string' ? errorRecord.body : undefined,
    }
  }
}

export async function runSmartTranslateValidation(baseUrlInput?: string): Promise<ReturnType<typeof finishReport>> {
  loadLocalEnv()
  const report = createReport('smart-translate')
  const baseUrl = ensureBaseUrl(baseUrlInput ?? cliBaseUrl())
  const missing = requiredKeys('AUTH_PASSWORD')

  if (missing.length > 0) {
    addCheck(report, {
      id: 'smart.config',
      layer: 'config',
      status: 'fail',
      summary: 'Smart smoke env is incomplete',
      detail: `Missing: ${missing.join(', ')}`,
    })
    return finishReport(report)
  }

  let cookie = ''
  await runCheck(report, {
    id: 'smart.login',
    layer: 'app_smoke',
    summary: 'Can log into the app and obtain a session cookie',
    check: async () => {
      cookie = await login(baseUrl)
      return { baseUrl }
    },
  })

  if (!cookie) {
    skip(report, 'smart.translate', 'app_smoke', 'Translate smoke could not run', 'Login failed')
    return finishReport(report)
  }

  let fixtureId = ''
  let fixtureContent = ''
  await runCheck(report, {
    id: 'smart.fixture',
    layer: 'app_smoke',
    summary: 'Can resolve or create a validation fixture document',
    check: async () => {
      const fixture = await getOrCreateFixture(baseUrl, cookie)
      fixtureId = fixture.id
      fixtureContent = fixture.content
      return fixture
    },
  })

  if (!fixtureId) {
    skip(report, 'smart.translate', 'app_smoke', 'Translate smoke could not run', 'No fixture document available')
    return finishReport(report)
  }

  let taskId = ''
  await runCheck(report, {
    id: 'smart.translate.start',
    layer: 'app_smoke',
    summary: 'Can create a smart-reading translate task',
    check: async () => {
      const started = await fetchJson<StartTaskResponse>(`${baseUrl}/api/smart/${fixtureId}/translate`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
      taskId = started.data.taskId
      return started.data
    },
  })

  if (!taskId) {
    skip(report, 'smart.translate.poll', 'app_smoke', 'Translate smoke could not poll', 'Task creation failed')
    return finishReport(report)
  }

  let finalTask: TaskResponse | null = null
  await runCheck(report, {
    id: 'smart.translate.poll',
    layer: 'app_smoke',
    summary: 'Translate task reaches a successful terminal state',
    check: async () => {
      const deadline = Date.now() + 90_000

      while (Date.now() < deadline) {
        const polled = await fetchJson<TaskResponse>(`${baseUrl}/api/smart/${fixtureId}/translate/${taskId}`, {
          headers: { Cookie: cookie },
        })
        finalTask = polled.data
        if (polled.data.status === 'running') {
          await new Promise((resolve) => setTimeout(resolve, 2_000))
          continue
        }
        break
      }

      if (!finalTask) {
        throw new Error('translate smoke timed out without a terminal task result')
      }

      if (finalTask.status !== 'done') {
        const probe = await probeDirectLlm()
        const detail = [
          `status=${finalTask.status}`,
          `taskError=${finalTask.error ?? 'none'}`,
          probe.ok ? `directProbeModel=${probe.model ?? 'unknown'}` : null,
          probe.errorCode ? `llmProbe=${probe.errorCode}` : null,
          probe.detail ? `llmDetail=${probe.detail.slice(0, 200)}` : null,
        ]
          .filter(Boolean)
          .join('; ')
        const failure = new Error(detail)
        Object.assign(failure, {
          errorCode: finalTask.error ?? probe.errorCode,
          status: probe.status,
          providerCode: probe.providerCode,
          model: probe.model,
          body: probe.body,
        })
        throw failure
      }

      if (!finalTask.result.trim()) {
        throw new Error('translate smoke completed but result was empty')
      }
      if (fixtureContent && finalTask.result.trim() === fixtureContent.trim()) {
        throw new Error('translate smoke completed but returned the source content unchanged')
      }

      return {
        taskId: finalTask.taskId,
        version: finalTask.version,
        resultLength: finalTask.result.length,
      }
    },
  })

  return finishReport(report)
}

async function main(): Promise<void> {
  const report = await runSmartTranslateValidation()
  printReport(report, wantsJson())
  process.exitCode = report.checks.some((check) => check.status === 'fail') ? 1 : 0
}

if (isMain(import.meta.url)) {
  void main()
}
