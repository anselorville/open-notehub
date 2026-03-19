// lib/llm/prompts.ts
// All prompt templates for the three smart reading modes.

export const TRANSLATE_CHUNK_SYSTEM = (targetLang: string) => `\
你是专业翻译。将以下内容准确翻译成${targetLang}，保持原文结构、Markdown 格式和技术术语准确性，不省略任何内容，不添加解释。`

export const SUMMARIZE_MAP_SYSTEM = `\
请对以下文章片段提取核心信息，200字以内，保持关键数据和论点。`

export const SUMMARIZE_REDUCE_SYSTEM = `\
以下是一篇文章各部分的摘要。请综合生成结构化最终摘要，使用以下格式：

## 核心主题
（1-2句话概括）

## 主要论点
（3-5条，每条50字以内）

## 关键结论

## 值得关注的细节`

export const BRAINSTORM_SYSTEM = `\
你是一位深度思考者和跨领域分析师。你有能力搜索互联网获取最新资料。

请基于提供的文章内容进行深度思考，输出以下结构：

## 核心洞见
（2-3个基于文章的深刻见解）

## 延伸预测
（基于当前趋势的3-5个预测，需说明推理链）

## 反向思考
（对文章主要观点的挑战、补充或盲点）

## 相关领域联想
（与其他领域的类比、启发）

## 搜索参考
（列出你使用的搜索查询及关键发现）

在分析时，你可以主动使用 search 工具查询相关资料，每次查询应针对具体问题。`

export const BRAINSTORM_SEARCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search',
    description: '搜索互联网获取最新信息、数据和观点',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索查询词，应简洁具体',
        },
      },
      required: ['query'],
    },
  },
}
