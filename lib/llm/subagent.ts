// lib/llm/subagent.ts
// Generic tool-calling loop. No business logic — purely orchestrates
// multi-round LLM ↔ tool conversations.

import { chatOnce, Message, Tool } from './client'

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>

export interface SubagentOptions {
  systemPrompt:          string
  userMessage:           string
  tools:                 Tool[]
  toolHandlers:          Record<string, ToolHandler>
  onDelta:               (chunk: string) => void
  onToolCall?:           (name: string, args: Record<string, unknown>) => void  // args are pre-parsed JSON
  maxRounds?:            number   // default 5
  maxToolCallsPerRound?: number   // default 3
  maxOutputTokens?:      number   // default 4000
  signal?:               AbortSignal
}

/**
 * Run a tool-calling agent loop.
 * Calls onDelta for every text chunk from the final (non-tool-calling) response.
 * Throws if LLM errors or maxRounds exceeded.
 */
export async function runSubagent(opts: SubagentOptions): Promise<void> {
  const {
    systemPrompt,
    userMessage,
    tools,
    toolHandlers,
    onDelta,
    onToolCall,
    maxRounds = 5,
    maxToolCallsPerRound = 3,
    maxOutputTokens = 4000,
    signal,
  } = opts

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage },
  ]

  for (let round = 0; round < maxRounds; round++) {
    const result = await chatOnce({ messages, tools, maxTokens: maxOutputTokens, signal })

    if (!result.toolCalls?.length) {
      // No more tool calls — stream final text via onDelta
      if (result.content) {
        // Emit in chunks to simulate streaming (paragraph by paragraph)
        const paragraphs = result.content.split('\n\n')
        for (let i = 0; i < paragraphs.length; i++) {
          const para = paragraphs[i]
          onDelta(para + (i < paragraphs.length - 1 ? '\n\n' : ''))
        }
      } else {
        console.warn('[subagent] LLM returned empty content with no tool calls on round', round)
      }
      return
    }

    // Add assistant turn with tool calls
    messages.push({
      role: 'assistant',
      content: result.content ?? null,
      tool_calls: result.toolCalls,
    })

    // Execute tool calls (up to maxToolCallsPerRound per round)
    const callsToRun = result.toolCalls.slice(0, maxToolCallsPerRound)
    for (const tc of callsToRun) {
      let toolResult: string
      try {
        const handler = toolHandlers[tc.function.name]
        if (!handler) throw new Error(`No handler for tool: ${tc.function.name}`)
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
        // Pass parsed args to onToolCall callback (not raw JSON string)
        onToolCall?.(tc.function.name, args)
        toolResult = await handler(args)
      } catch (err) {
        toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`
      }

      messages.push({
        role: 'tool',
        content: toolResult,
        tool_call_id: tc.id,
      })
    }
  }

  throw new Error(`Sub-agent exceeded maxRounds (${maxRounds}) without finishing`)
}
