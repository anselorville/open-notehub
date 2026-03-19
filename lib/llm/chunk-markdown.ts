// lib/llm/chunk-markdown.ts
// 用 remark 结构化分块 markdown，输出带 meta-info 的块数组
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import { Root, Heading, Paragraph, Code, List, Table, ListItem, TableRow, TableCell } from 'mdast'
import { Node } from 'unist'

export interface MarkdownChunk {
  type: string
  meta: Record<string, unknown>
  content: string
}

/**
 * 将 markdown 文本分块，保留结构元信息
 */
export function chunkMarkdown(md: string): MarkdownChunk[] {
  const tree = unified().use(remarkParse).parse(md) as Root
  const chunks: MarkdownChunk[] = []

  visit(tree, (node: Node) => {
    if (node.type === 'heading') {
      const h = node as Heading
      chunks.push({
        type: 'heading',
        meta: { level: h.depth },
        content: h.children.map(c => 'value' in c && typeof c.value === 'string' ? c.value : '').join(' ')
      })
    } else if (node.type === 'paragraph') {
      const p = node as Paragraph
      chunks.push({
        type: 'paragraph',
        meta: {},
        content: p.children.map(c => 'value' in c && typeof c.value === 'string' ? c.value : '').join(' ')
      })
    } else if (node.type === 'code') {
      const c = node as Code
      chunks.push({
        type: 'code',
        meta: { lang: c.lang || '' },
        content: c.value
      })
    } else if (node.type === 'list') {
      const l = node as List
      chunks.push({
        type: 'list',
        meta: { ordered: l.ordered },
        content: l.children.map(li => {
          const liNode = li as ListItem
          return liNode.children.map(c => 'value' in c && typeof c.value === 'string' ? c.value : '').join(' ')
        }).join('\n')
      })
    } else if (node.type === 'table') {
      const t = node as Table
      chunks.push({
        type: 'table',
        meta: {},
        content: t.children.map(row => {
          const r = row as TableRow
          return r.children.map(cell => {
            const cellNode = cell as TableCell
            return cellNode.children.map(c => 'value' in c && typeof c.value === 'string' ? c.value : '').join(' ')
          }).join(' | ')
        }).join('\n')
      })
    }
    // 可扩展更多类型
  })
  return chunks
}
