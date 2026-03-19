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
}

function getConfig() {
  const baseUrl = process.env.LLM_BASE_URL
  const apiKey  = process.env.LLM_API_KEY
  const model   = process.env.LLM_MODEL
  if (!baseUrl || !apiKey || !model) {
    throw new Error('LLM_BASE_URL, LLM_API_KEY, LLM_MODEL must be set')
  }
  return { baseUrl, apiKey, model }
}

/**
 * Stream a chat completion. Calls onDelta for each text chunk.
 * Calls onToolCalls if the model returns tool calls (non-streaming fallback).
 */
export async function streamChat(opts: StreamOptions): Promise<void> {
  const { baseUrl, apiKey, model } = getConfig()
  const { messages, tools, onDelta, onToolCalls, maxTokens = 4000, signal } = opts

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    max_tokens: maxTokens,
  }
  if (tools?.length) body.tools = tools

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`LLM API error: ${res.status} ${text.slice(0, 200)}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  const collectedToolCalls: Map<number, ToolCall> = new Map()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return

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
  }

  if (collectedToolCalls.size > 0 && onToolCalls) {
    onToolCalls([...collectedToolCalls.values()])
  }
}

/**
 * One-shot (non-streaming) chat. Returns full content and optional tool calls.
 */
export async function chatOnce(opts: ChatOnceOptions): Promise<ChatOnceResult> {
  const { baseUrl, apiKey, model } = getConfig()
  const { messages, tools, maxTokens = 2000, signal } = opts

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    max_tokens: maxTokens,
  }
  if (tools?.length) body.tools = tools

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`LLM API error: ${res.status} ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  const choice = data.choices?.[0]
  return {
    content:   choice?.message?.content ?? '',
    toolCalls: choice?.message?.tool_calls,
  }
}
