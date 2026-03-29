import { chatOnce } from '@/lib/llm/client'
import { getLibraryCandidates, type LibraryDocumentListItem } from '@/lib/library/data'
import { search as searchWeb } from '@/lib/search/anspire'
import type {
  ResearchLibraryHit,
  ResearchResultPayload,
  ResearchWebHit,
} from '@/lib/research/types'

function unique(items: string[]) {
  return Array.from(
    new Set(items.map((item) => item.trim()).filter(Boolean))
  )
}

function tokenize(input: string) {
  return unique(
    Array.from(input.matchAll(/[A-Za-z0-9\u4E00-\u9FFF#+._-]{2,}/g)).map((match) => match[0])
  )
}

function stripMarkdown(input: string | null | undefined) {
  if (!input) {
    return ''
  }

  return input
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`{1,3}[^`\n]*`{1,3}/g, '')
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_\n]+)_{1,3}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function toExcerpt(input: string, maxLength = 180) {
  if (input.length <= maxLength) {
    return input
  }

  return `${input.slice(0, maxLength).trimEnd()}…`
}

function extractJsonObject<T>(content: string): T | null {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] ?? content
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

async function planQueries(question: string) {
  const fallbackQueries = unique([question, ...tokenize(question)]).slice(0, 4)

  try {
    const response = await chatOnce({
      messages: [
        {
          role: 'system',
          content:
            '你是 Open NoteHub 的研究查询规划器。把用户问题改写成简洁的知识库搜索词和一个外部网页搜索词。只输出 JSON：{"libraryQueries":["..."],"webQuery":"..."}。',
        },
        {
          role: 'user',
          content: `用户问题：${question}`,
        },
      ],
      maxTokens: 280,
    })

    const parsed = extractJsonObject<{
      libraryQueries?: string[]
      webQuery?: string
    }>(response.content)

    const libraryQueries = unique(parsed?.libraryQueries ?? fallbackQueries).slice(0, 4)
    return {
      libraryQueries: libraryQueries.length ? libraryQueries : fallbackQueries,
      webQuery: parsed?.webQuery?.trim() || question,
    }
  } catch {
    return {
      libraryQueries: fallbackQueries.length ? fallbackQueries : [question],
      webQuery: question,
    }
  }
}

function scoreDocument(
  document: LibraryDocumentListItem,
  question: string,
  queries: string[]
): ResearchLibraryHit | null {
  const title = document.title.toLowerCase()
  const summary = stripMarkdown(document.summary).toLowerCase()
  const tags = document.tags.map((tag) => tag.toLowerCase())
  const fullQuery = question.trim().toLowerCase()
  const matchedTerms: string[] = []
  let score = 0

  for (const query of queries) {
    const normalizedQuery = query.toLowerCase()
    const terms = unique([normalizedQuery, ...tokenize(query.toLowerCase())])

    if ((title.includes(normalizedQuery) || summary.includes(normalizedQuery)) && normalizedQuery.length >= 2) {
      score += 10
      matchedTerms.push(normalizedQuery)
    }

    for (const term of terms) {
      if (term.length < 2) {
        continue
      }

      let matched = false
      if (title.includes(term)) {
        score += 6
        matched = true
      }
      if (summary.includes(term)) {
        score += 3
        matched = true
      }
      if (tags.some((tag) => tag.includes(term))) {
        score += 4
        matched = true
      }

      if (matched) {
        matchedTerms.push(term)
      }
    }
  }

  if (fullQuery.length >= 2 && (title.includes(fullQuery) || summary.includes(fullQuery))) {
    score += 12
    matchedTerms.push(fullQuery)
  }

  if (score <= 0) {
    return null
  }

  return {
    id: document.id,
    title: document.title,
    summary: document.summary ?? null,
    tags: document.tags,
    sourceUrl: document.source_url ?? null,
    sourceType: document.source_type,
    createdAt: document.created_at,
    wordCount: document.word_count,
    score,
    matchedTerms: unique(matchedTerms).slice(0, 6),
  }
}

async function searchLibrary(question: string, queries: string[]) {
  const candidates = await getLibraryCandidates()
  return candidates
    .map((document) => scoreDocument(document, question, queries))
    .filter((document): document is ResearchLibraryHit => Boolean(document))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return right.createdAt.localeCompare(left.createdAt)
    })
    .slice(0, 6)
}

function fallbackAnswer(input: {
  question: string
  internalResults: ResearchLibraryHit[]
  externalResults: ResearchWebHit[]
  externalStatus: ResearchResultPayload['externalStatus']
}) {
  const internalSection = input.internalResults.length
    ? input.internalResults
        .slice(0, 4)
        .map(
          (item) =>
            `- **${item.title}**：${toExcerpt(stripMarkdown(item.summary) || '文库中已有相关内容，可继续打开原文查看。')}`
        )
        .join('\n')
    : '- 当前文库里还没有足够直接匹配的文章。'

  const externalSection =
    input.externalStatus === 'used' && input.externalResults.length
      ? input.externalResults
          .slice(0, 3)
          .map(
            (item) =>
              `- **${item.title}**：${toExcerpt(item.snippet || '已从外部网页补充到相关线索。')}`
          )
          .join('\n')
      : input.externalStatus === 'unavailable'
        ? '- 本次本应补充外部网页，但外部搜索当前不可用。'
        : '- 本次结论主要基于文库内容，不需要额外补充网页。'

  return `## 研究结论\n先根据文库内容回答你的问题：**${input.question}**。当前系统已经整理出最相关的文库依据，并在必要时尝试补充外部网页线索。\n\n## 文库依据\n${internalSection}\n\n## 外部补充\n${externalSection}\n\n## 下一步\n- 继续追问这些文章之间的共同点和分歧\n- 打开最相关的原文核对细节\n- 如果外部结果值得保留，可以直接送去入藏`
}

async function synthesizeAnswer(input: {
  question: string
  internalResults: ResearchLibraryHit[]
  externalResults: ResearchWebHit[]
  externalStatus: ResearchResultPayload['externalStatus']
}) {
  const internalContext = input.internalResults
    .map(
      (item, index) =>
        `${index + 1}. ${item.title}\n标签: ${item.tags.join(', ') || '无'}\n摘要: ${toExcerpt(stripMarkdown(item.summary) || '无摘要', 280)}`
    )
    .join('\n\n')

  const externalContext = input.externalResults
    .map(
      (item, index) =>
        `${index + 1}. ${item.title}\n摘要: ${toExcerpt(item.snippet || '无摘要', 220)}\n链接: ${item.url}`
    )
    .join('\n\n')

  try {
    const response = await chatOnce({
      messages: [
        {
          role: 'system',
          content:
            '你是 Open NoteHub 的研究助手。请只根据给定来源回答问题，不要编造未提供的事实。输出 JSON：{"answerMarkdown":"...","followUps":["...","...","..."]}。answerMarkdown 用中文 Markdown，包含“## 研究结论”“## 文库依据”“## 外部补充”“## 下一步”四段。',
        },
        {
          role: 'user',
          content: `问题：${input.question}\n\n文库结果：\n${internalContext || '无'}\n\n外部补充状态：${input.externalStatus}\n\n外部结果：\n${externalContext || '无'}`,
        },
      ],
      maxTokens: 1400,
    })

    const parsed = extractJsonObject<{
      answerMarkdown?: string
      followUps?: string[]
    }>(response.content)

    const answerMarkdown = parsed?.answerMarkdown?.trim()
    const followUps = unique(parsed?.followUps ?? []).slice(0, 3)

    if (answerMarkdown) {
      return {
        answerMarkdown,
        followUps:
          followUps.length > 0
            ? followUps
            : [
                '这些结论在文库里有哪些直接证据？',
                '哪些观点还需要继续补充外部来源？',
                '哪些外部结果值得送去入藏？',
              ],
      }
    }
  } catch {
    // Fall back to deterministic copy below.
  }

  return {
    answerMarkdown: fallbackAnswer(input),
    followUps: [
      '这些结论在文库里有哪些直接证据？',
      '哪些观点还需要继续补充外部来源？',
      '哪些外部结果值得送去入藏？',
    ],
  }
}

export async function runResearchQuery(input: {
  question: string
  allowExternal: boolean
}): Promise<ResearchResultPayload> {
  const queryPlan = await planQueries(input.question)
  const internalResults = await searchLibrary(input.question, queryPlan.libraryQueries)

  let externalResults: ResearchWebHit[] = []
  let externalStatus: ResearchResultPayload['externalStatus'] = 'not_requested'

  if (!input.allowExternal) {
    externalStatus = 'not_requested'
  } else if (internalResults.length >= 3) {
    externalStatus = 'not_needed'
  } else {
    try {
      externalResults = await searchWeb(queryPlan.webQuery, 4)
      externalStatus = externalResults.length ? 'used' : 'unavailable'
    } catch {
      externalStatus = 'unavailable'
    }
  }

  const synthesized = await synthesizeAnswer({
    question: input.question,
    internalResults,
    externalResults,
    externalStatus,
  })

  return {
    question: input.question,
    answerMarkdown: synthesized.answerMarkdown,
    followUps: synthesized.followUps,
    strategy:
      externalStatus === 'used' ? 'library_plus_web' : 'library_only',
    externalStatus,
    queryPlan,
    internalResults,
    externalResults,
  }
}
