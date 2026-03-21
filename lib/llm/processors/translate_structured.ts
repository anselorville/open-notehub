/* eslint-disable @typescript-eslint/no-unused-vars */
// lib/llm/processors/translate_structured.ts
// 串行结构化分块翻译，meta-info+content，进度可追踪
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { chunkMarkdown, MarkdownChunk } from '../chunk-markdown'
import { chatOnce } from '../client'
import { TaskContext, emitChunk } from '../task-registry'
import { SmartChunk, smartChunks } from '@/lib/db/schema'

interface TranslateStructuredOptions {
  ctx:        TaskContext
  content:    string
  targetLang: string
  resultId:   string
}

const SYSTEM_PROMPT = (type: string, meta: Record<string, unknown>, targetLang: string) => `\
你是专业翻译引擎，负责将 Markdown 内容片段翻译成${targetLang}。

## 严格输出规则
- 只输出一个 JSON 对象，不得有任何其他内容
- 禁止使用 markdown 代码围栏（\`\`\`）或任何包裹格式
- 禁止添加解释、注释或额外字段
- 字符串内的换行用 \\n 转义

## 输出格式
{"type":"<原样复制>","meta":<原样复制>,"content":"<翻译后内容>"}

## 本次任务
- 块类型: ${type}
- meta（原样复制，不翻译）: ${JSON.stringify(meta)}
- 翻译目标语言: ${targetLang}

## 示例
输入: A quick brown fox.
输出: {"type":"paragraph","meta":{},"content":"一只敏捷的棕色狐狸。"}

现在请翻译用户提供的内容，直接输出 JSON，不要有任何其他文字。`

/** Strip markdown code fences that some LLMs wrap around JSON output */
function extractJson(raw: string): string {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  return match ? match[1].trim() : raw.trim()
}

async function flushChunk(chunkId: string, translated: string, status: string, error?: string) {
  await db.run(sql`
    UPDATE smart_chunks SET translated = ${translated}, status = ${status}, error = ${error ?? null} WHERE id = ${chunkId}
  `)
}

export async function runTranslateStructured(opts: TranslateStructuredOptions): Promise<void> {
  const { ctx, content, targetLang, resultId } = opts
  // 1. 分块
  const blocks: MarkdownChunk[] = chunkMarkdown(content)
  // 2. 写入 smart_chunks
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    await db.run(sql`
      INSERT INTO smart_chunks (id, result_id, idx, type, meta, content, status)
      VALUES (${uuidv4()}, ${resultId}, ${i}, ${block.type}, ${JSON.stringify(block.meta)}, ${block.content}, 'pending')
    `)
  }
  // 3. 串行翻译
  for (let i = 0; i < blocks.length; i++) {
    // 查询 chunk id
    const row = await db.run(sql`SELECT id, type, meta, content FROM smart_chunks WHERE result_id = ${resultId} AND idx = ${i} LIMIT 1`)
    if (!row.rows.length) continue
    const { id: chunkId, type, meta, content: chunkContent } = row.rows[0] as any
    let translated = ''
    let status = 'done'
    let error = ''
    try {
      const systemPrompt = SYSTEM_PROMPT(type, JSON.parse(meta), targetLang)
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: chunkContent },
      ]
      const result = await chatOnce({ messages, maxTokens: 3000 })
      // Strip potential markdown code fences before parsing JSON
      const parsed = JSON.parse(extractJson(result.content))
      translated = parsed.content ?? parsed.translated ?? ''
    } catch (e: any) {
      status = 'error'
      error = e?.message || '翻译失败'
      translated = ''
    }
    await flushChunk(chunkId, translated, status, error)
    emitChunk(ctx, `[${i + 1}/${blocks.length}] ${status === 'done' ? '✔️' : '❌'}\n`)
  }
  // 4. 拼装所有块
  const allRows = await db.run(sql`SELECT type, meta, translated FROM smart_chunks WHERE result_id = ${resultId} ORDER BY idx ASC`)
  let finalMd = ''
  for (const row of allRows.rows as any[]) {
    if (!row.translated) continue
    if (row.type === 'heading') {
      const level = JSON.parse(row.meta).level || 1
      finalMd += `${'#'.repeat(level)} ${row.translated}\n\n`
    } else if (row.type === 'paragraph') {
      finalMd += `${row.translated}\n\n`
    } else if (row.type === 'code') {
      const lang = JSON.parse(row.meta).lang || ''
      finalMd += `\


`
    } else if (row.type === 'list') {
      finalMd += row.translated.split('\n').map((li: string) => `- ${li}`).join('\n') + '\n\n'
    } else if (row.type === 'table') {
      finalMd += row.translated + '\n\n'
    }
  }
  await db.run(sql`
    UPDATE smart_results SET result = ${finalMd}, status = 'done', completed_at = unixepoch() WHERE id = ${resultId}
  `)
}
