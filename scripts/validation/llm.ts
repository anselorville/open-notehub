import {
  addCheck,
  candidateModels,
  createReport,
  finishReport,
  isMain,
  loadLocalEnv,
  maskSecret,
  pickEnv,
  printReport,
  requiredKeys,
  runCheck,
  skip,
  wantsJson,
} from './_shared'
import * as llmClient from '../../lib/llm/client'
import {
  BRAINSTORM_SEARCH_TOOL,
  SUMMARIZE_REDUCE_SYSTEM,
  TRANSLATE_CHUNK_SYSTEM,
} from '../../lib/llm/prompts'

type ChatOnce = typeof llmClient.chatOnce
type StreamChat = typeof llmClient.streamChat

const { chatOnce, streamChat } = llmClient as {
  chatOnce: ChatOnce
  streamChat: StreamChat
}

function parseProviderCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string } }
    return parsed.error?.code
  } catch {
    return undefined
  }
}

async function probeModel(model: string): Promise<{
  ok: boolean
  status: number
  detail: string
  providerCode?: string
  bodyPreview?: string
}> {
  const baseUrl = process.env.LLM_BASE_URL
  const apiKey = process.env.LLM_API_KEY
  if (!baseUrl || !apiKey) {
    throw new Error('LLM_BASE_URL and LLM_API_KEY must be set')
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      max_tokens: 64,
      messages: [
        { role: 'system', content: 'You are a validator.' },
        { role: 'user', content: 'Reply with OK.' },
      ],
    }),
  })

  const text = await response.text()
  return {
    ok: response.ok,
    status: response.status,
    detail: response.ok ? text.slice(0, 120) : `HTTP ${response.status}: ${text.slice(0, 200)}`,
    providerCode: response.ok ? undefined : parseProviderCode(text),
    bodyPreview: text.slice(0, 200),
  }
}

export async function runLlmValidation(): Promise<ReturnType<typeof finishReport>> {
  loadLocalEnv()
  const report = createReport('llm')
  const missing = requiredKeys('LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL')

  if (missing.length > 0) {
    addCheck(report, {
      id: 'llm.config',
      layer: 'config',
      status: 'fail',
      summary: 'LLM env is incomplete',
      detail: `Missing: ${missing.join(', ')}`,
    })
    return finishReport(report)
  }

  addCheck(report, {
    id: 'llm.config',
    layer: 'config',
    status: 'pass',
    summary: 'LLM env is present',
    data: {
      ...pickEnv(['LLM_BASE_URL', 'LLM_MODEL']),
      LLM_API_KEY: maskSecret(process.env.LLM_API_KEY),
    },
  })

  await runCheck(report, {
    id: 'llm.chat.once',
    layer: 'provider_access',
    summary: 'Basic chatOnce request returns a non-empty response',
    check: async () => {
      const result = await chatOnce({
        messages: [
          { role: 'system', content: 'You are a validator.' },
          { role: 'user', content: 'Reply with exactly: OK' },
        ],
        maxTokens: 96,
      })

      if (!result.content.trim()) {
        throw new Error('chatOnce returned empty content')
      }

      return {
        model: result.model ?? process.env.LLM_MODEL,
        sample: result.content.trim().slice(0, 60),
      }
    },
  })

  await runCheck(report, {
    id: 'llm.chat.stream',
    layer: 'provider_access',
    summary: 'Basic streamChat request yields at least one delta',
    check: async () => {
      let deltas = ''
      await streamChat({
        messages: [
          { role: 'system', content: 'You are a validator.' },
          { role: 'user', content: 'Reply with exactly: streamed ok' },
        ],
        maxTokens: 128,
        onDelta: (chunk) => {
          deltas += chunk
        },
      })

      if (!deltas.trim()) {
        throw new Error('streamChat returned no deltas')
      }

      return {
        configuredModel: process.env.LLM_MODEL,
        sample: deltas.trim().slice(0, 60),
      }
    },
  })

  await runCheck(report, {
    id: 'llm.capability.translate',
    layer: 'capability',
    summary: 'Translate prompt produces non-empty translated output',
    check: async () => {
      const result = await chatOnce({
        messages: [
          { role: 'system', content: TRANSLATE_CHUNK_SYSTEM('中文') },
          { role: 'user', content: 'The validation harness is working.' },
        ],
        maxTokens: 256,
      })

      const content = result.content.trim()
      if (!content) throw new Error('translate capability returned empty content')
      return {
        model: result.model ?? process.env.LLM_MODEL,
        sample: content.slice(0, 80),
      }
    },
  })

  await runCheck(report, {
    id: 'llm.capability.summarize',
    layer: 'capability',
    summary: 'Summarize prompt produces non-empty structured output',
    check: async () => {
      const result = await chatOnce({
        messages: [
          { role: 'system', content: SUMMARIZE_REDUCE_SYSTEM },
          {
            role: 'user',
            content:
              'Section summaries:\n\nThe validation harness creates direct provider checks, capability checks, and app smoke checks.',
          },
        ],
        maxTokens: 512,
      })

      const content = result.content.trim()
      if (!content) throw new Error('summarize capability returned empty content')
      return {
        model: result.model ?? process.env.LLM_MODEL,
        sample: content.slice(0, 120),
      }
    },
  })

  await runCheck(report, {
    id: 'llm.capability.brainstorm-tool',
    layer: 'capability',
    summary: 'Brainstorm prompt can emit a search tool call',
    check: async () => {
      const result = await chatOnce({
        messages: [
          { role: 'system', content: 'You are a validator. Use the search tool exactly once before answering.' },
          { role: 'user', content: 'Find one recent fact about AI regulation and then answer briefly.' },
        ],
        tools: [BRAINSTORM_SEARCH_TOOL],
        maxTokens: 300,
      })

      if (!result.toolCalls?.length) {
        throw new Error('no tool call was emitted by the brainstorm capability probe')
      }

      return {
        model: result.model ?? process.env.LLM_MODEL,
        tool: result.toolCalls[0].function.name,
        toolCalls: result.toolCalls.length,
      }
    },
  })

  const models = candidateModels()
  let firstAccessible: string | null = null
  const details: Record<string, Record<string, unknown>> = {}

  for (const model of models) {
    const outcome = await probeModel(model)
    details[model] = {
      ok: outcome.ok,
      status: outcome.status,
      detail: outcome.detail,
      providerCode: outcome.providerCode,
    }
    if (outcome.ok && !firstAccessible) {
      firstAccessible = model
    }
  }

  if (firstAccessible) {
    addCheck(report, {
      id: 'llm.model.probe',
      layer: 'provider_access',
      status: 'pass',
      summary: 'At least one candidate model is accessible',
      data: {
        configuredModel: process.env.LLM_MODEL,
        accessibleModel: firstAccessible,
        probes: details,
      },
    })
    if (firstAccessible !== process.env.LLM_MODEL) {
      addCheck(report, {
        id: 'llm.model.mismatch',
        layer: 'provider_access',
        status: 'warn',
        summary: 'Configured model is not the first accessible model candidate',
        detail: `Configured=${process.env.LLM_MODEL}, accessible=${firstAccessible}`,
        data: {
          configuredModel: process.env.LLM_MODEL,
          accessibleModel: firstAccessible,
        },
      })
    }
  } else {
    addCheck(report, {
      id: 'llm.model.probe',
      layer: 'provider_access',
      status: 'fail',
      summary: 'No candidate model probe succeeded',
      detail: JSON.stringify(details),
      errorCode: 'no_accessible_model',
      data: {
        configuredModel: process.env.LLM_MODEL,
        probes: details,
      },
    })
  }

  if (models.length === 0) {
    skip(
      report,
      'llm.model.probe',
      'provider_access',
      'No candidate models to probe',
      'Set LLM_MODEL or LLM_MODEL_FALLBACKS'
    )
  }

  return finishReport(report)
}

async function main(): Promise<void> {
  const report = await runLlmValidation()
  printReport(report, wantsJson())
  process.exitCode = report.checks.some((check) => check.status === 'fail') ? 1 : 0
}

if (isMain(import.meta.url)) {
  void main()
}
