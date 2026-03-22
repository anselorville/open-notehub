// lib/llm/client.ts
// OpenAI-compatible LLM client. Uses fetch (no openai SDK needed).
// Supports streaming (SSE) and one-shot completion.

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface Tool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface StreamOptions {
  messages: Message[]
  tools?: Tool[]
  onDelta: (chunk: string) => void
  onToolCalls?: (calls: ToolCall[]) => void
  maxTokens?: number
  signal?: AbortSignal
}

interface ChatOnceOptions {
  messages: Message[]
  tools?: Tool[]
  maxTokens?: number
  signal?: AbortSignal
}

interface ChatOnceResult {
  content: string
  toolCalls?: ToolCall[]
  model?: string
}

interface ChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string | null
    message?: {
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: ToolCall[]
    }
  }>
}

export class LlmApiError extends Error {
  status: number
  body: string
  model: string
  providerCode?: string

  constructor(message: string, options: { status: number; body: string; model: string; providerCode?: string }) {
    super(message)
    this.name = 'LlmApiError'
    this.status = options.status
    this.body = options.body
    this.model = options.model
    this.providerCode = options.providerCode
  }
}

let cachedAccessibleModel: string | null = null

function getConfig() {
  const baseUrl = process.env.LLM_BASE_URL
  const apiKey  = process.env.LLM_API_KEY
  const model   = process.env.LLM_MODEL
  if (!baseUrl || !apiKey || !model) {
    throw new Error('LLM_BASE_URL, LLM_API_KEY, LLM_MODEL must be set')
  }

  const fallbacks = (process.env.LLM_MODEL_FALLBACKS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  return { baseUrl, apiKey, model, fallbacks }
}

function parseProviderCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string } }
    return parsed.error?.code
  } catch {
    return undefined
  }
}

function getCandidateModels(primary: string, fallbacks: string[], baseUrl: string): string[] {
  const defaults =
    baseUrl.includes('open.bigmodel.cn')
      ? ['glm-4.5-air', 'glm-4.6', 'glm-4.7']
      : []

  return Array.from(
    new Set([
      ...(cachedAccessibleModel ? [cachedAccessibleModel] : []),
      primary,
      ...fallbacks,
      ...defaults,
    ].filter(Boolean))
  )
}

async function openChatCompletion(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<{ response: Response; model: string }> {
  const { baseUrl, apiKey, model, fallbacks } = getConfig()
  const candidates = getCandidateModels(model, fallbacks, baseUrl)
  const failures: LlmApiError[] = []

  for (const candidate of candidates) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...body, model: candidate }),
      signal,
    })

    if (res.ok) {
      cachedAccessibleModel = candidate
      return { response: res, model: candidate }
    }

    const text = await res.text().catch(() => '')
    failures.push(new LlmApiError(
      `LLM API error for model ${candidate}: ${res.status} ${text.slice(0, 200)}`,
      {
        status: res.status,
        body: text,
        model: candidate,
        providerCode: parseProviderCode(text),
      }
    ))
  }

  const last = failures[failures.length - 1]
  if (last) throw last
  throw new Error('LLM request failed before receiving a response')
}

function hasUsableChatOncePayload(data: ChatCompletionResponse): boolean {
  const choice = data.choices?.[0]
  const content = choice?.message?.content
  const toolCalls = choice?.message?.tool_calls

  return Boolean(
    (typeof content === 'string' && content.trim().length > 0) ||
    (Array.isArray(toolCalls) && toolCalls.length > 0)
  )
}

/**
 * Stream a chat completion. Calls onDelta for each text chunk.
 * Calls onToolCalls if the model returns tool calls (non-streaming fallback).
 */
export async function streamChat(opts: StreamOptions): Promise<void> {
  const { messages, tools, onDelta, onToolCalls, maxTokens = 4000, signal } = opts

  const body: Record<string, unknown> = {
    messages,
    stream: true,
    max_tokens: maxTokens,
  }
  if (tools?.length) body.tools = tools

  const { response } = await openChatCompletion(body, signal)

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  const collectedToolCalls: Map<number, ToolCall> = new Map()
  let sawDone = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') {
        sawDone = true
        break
      }

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta
        if (!delta) continue

        if (delta.content) {
          onDelta(delta.content)
        }

        // Collect streaming tool calls (fragmented across chunks)
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!collectedToolCalls.has(idx)) {
              collectedToolCalls.set(idx, { id: '', type: 'function', function: { name: '', arguments: '' } })
            }
            const existing = collectedToolCalls.get(idx)!
            // id only appears in the first chunk — set if not already set (never overwrite)
            if (tc.id && !existing.id) existing.id = tc.id
            // name and arguments are concatenated across chunks
            if (tc.function?.name) existing.function.name += tc.function.name
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
          }
        }
      } catch {
        // Ignore parse errors on individual SSE lines
      }
    }

    if (sawDone) break
  }

  if (collectedToolCalls.size > 0 && onToolCalls) {
    onToolCalls(Array.from(collectedToolCalls.values()))
  }
}

/**
 * One-shot (non-streaming) chat. Returns full content and optional tool calls.
 */
export async function chatOnce(opts: ChatOnceOptions): Promise<ChatOnceResult> {
  const { messages, tools, maxTokens = 2000, signal } = opts

  const body: Record<string, unknown> = {
    messages,
    stream: false,
    max_tokens: maxTokens,
  }
  if (tools?.length) body.tools = tools

  const { baseUrl, apiKey, model, fallbacks } = getConfig()
  const candidates = getCandidateModels(model, fallbacks, baseUrl)
  const failures: LlmApiError[] = []

  for (const candidate of candidates) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...body, model: candidate }),
      signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      failures.push(new LlmApiError(
        `LLM API error for model ${candidate}: ${res.status} ${text.slice(0, 200)}`,
        {
          status: res.status,
          body: text,
          model: candidate,
          providerCode: parseProviderCode(text),
        }
      ))
      continue
    }

    const data = await res.json() as ChatCompletionResponse
    if (!hasUsableChatOncePayload(data)) {
      const choice = data.choices?.[0]
      const bodyText = JSON.stringify({
        finish_reason: choice?.finish_reason,
        content: choice?.message?.content ?? null,
        reasoning_content: choice?.message?.reasoning_content?.slice(0, 200) ?? null,
      })
      failures.push(new LlmApiError(
        `LLM completion was empty for model ${candidate}`,
        {
          status: 502,
          body: bodyText,
          model: candidate,
        }
      ))
      continue
    }

    cachedAccessibleModel = candidate
    const choice = data.choices?.[0]
    return {
      content: choice?.message?.content ?? '',
      toolCalls: choice?.message?.tool_calls,
      model: candidate,
    }
  }

  const last = failures[failures.length - 1]
  if (last) throw last
  throw new Error('LLM request failed before receiving a usable response')
}
