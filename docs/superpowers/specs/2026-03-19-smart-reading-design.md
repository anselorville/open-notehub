# 智读功能设计文档

**日期**: 2026-03-19
**状态**: 已批准
**范围**: Open NoteHub 智读（Smart Reading）功能模块

---

## 一、背景与目标

Open NoteHub 是一个以阅读体验为核心的个人知识阅读工具。用户通过 Agent 将文章推送进系统后，需要一种方式对文章进行深度理解，而不仅仅是阅读原文。

「智读」功能通过 LLM 提供三种能力：
- **智能翻译**：将原文翻译为目标语言（默认中文）
- **总结摘要**：结构化提炼文章核心内容
- **头脑风暴**：基于文章内容进行发散思维，结合互联网搜索丰富观点

---

## 二、架构决策

### 2.1 UI 方案：独立智读页 `/[id]/smart`

文章页放置「智读」入口，点击后导航至独立路由。AI 输出在全屏阅读画布中渲染，排版与原文完全对齐（相同 MarkdownRenderer、字体、间距）。理由：AI 输出本身是一篇「新文章」，需要完整的阅读空间。

### 2.2 任务生命周期与 HTTP 连接解耦

**核心原则**：LLM 调用不依赖 HTTP 连接。

**背景说明**：本系统为单用户单容器部署，无水平扩展需求。采用进程内 registry（快路径）+ 每 chunk 写 DB（持久化）的混合策略。

```
POST /api/smart/[docId]/[mode]
  → 创建 smart_results 记录（status: 'running'）
  → 在进程内 task-registry 注册任务
  → 启动后台 LLM 任务（不 await，立即返回 {task_id}）

后台任务:
  → 每个 chunk: 追加 registry.accumulated + 写入 DB result 字段（每 chunk 都 flush）
  → 推送给当前所有 SSE subscribers（callback Set）
  → 完成后: DB status='done'，registry 清除

GET /api/smart/stream/[taskId]  (SSE)
  → 若 registry 存在（任务运行中）:
      发送 registry.accumulated（已有内容）
      注册 subscriber callback
      利用 request.signal 检测客户端断开，自动 unsubscribe
  → 若 registry 不存在（任务已完成或未启动）:
      从 DB 读取 result，作为单次 SSE chunk 发送，立即 done
  → SSE event 格式:
      event: chunk  data: "<markdown片段>"
      event: done   data: {}
      event: error  data: {"error":"...", "message":"..."}
```

**subscriber 清理策略**：利用 `request.signal.addEventListener('abort', cleanup)` 在连接断开时立即从 Set 中移除；Set 中 callback 数量即为当前活跃订阅数，不泄漏。

**容器重启恢复**：启动时扫描 `status='running'` 且 `created_at < now-1h` 的记录，标记为 `status='interrupted'`。前端遇到 interrupted 状态展示「上次生成中断，点击重新生成」。

**断连/重连行为**：

| 场景 | 行为 |
|------|------|
| 生成中离开 | LLM 继续，结果持续写入 DB |
| 离开后回来，任务运行中 | SSE 重连，先发已积累全部内容，再接续实时流 |
| 离开后回来，任务已完成 | 直接从 DB 读取，瞬时展示 |
| 服务器重启 | DB 有已积累内容但 status='running'，页面展示「生成中断，点击重新生成」 |

### 2.3 版本管理

每次「刷新重新生成」创建新版本记录，`version = MAX(version)+1`。历史版本永久保留，UI 以时间 chip 展示，点击直接读取 DB 内容。

---

## 三、数据模型

### 新增表 `smart_results`

```sql
CREATE TABLE smart_results (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL,    -- 'translate' | 'summarize' | 'brainstorm'
  version      INT  NOT NULL,    -- 同 doc+mode 下递增
  status       TEXT NOT NULL DEFAULT 'running', -- 'running'|'done'|'error'|'interrupted'
  result       TEXT,             -- 流式积累的 Markdown 内容（每 chunk 写入）
  meta         TEXT,             -- JSON: {target_lang?, chunks_total?, chunks_completed?, failed_chunks?: number[], search_queries?: string[], word_count?: number}
  error        TEXT,
  created_at   INT  NOT NULL DEFAULT (unixepoch()),
  completed_at INT,
  UNIQUE(document_id, mode, version)
);
CREATE INDEX smart_results_doc_mode_version_idx ON smart_results(document_id, mode, version DESC);
CREATE INDEX smart_results_status_idx ON smart_results(status);  -- 用于重启时清理 stale 任务
```

### 新增迁移文件 `0002_smart_results.sql`

---

## 四、文件结构

```
app/
  (reader)/[id]/smart/page.tsx          ← 智读页（Client Component）
  api/smart/
    [taskId]/stream/route.ts            ← SSE 流
    [docId]/[mode]/route.ts             ← POST 创建任务 / GET 版本列表

lib/
  llm/
    client.ts                           ← OpenAI-compatible fetch 封装
    chunker.ts                          ← 文章分片策略
    prompts.ts                          ← 三模式 prompt 模板
    task-registry.ts                    ← 进程内任务注册表
    subagent.ts                         ← 独立 web search sub-agent（无业务耦合）
    processors/
      translate.ts                      ← 翻译处理链
      summarize.ts                      ← 摘要处理链
      brainstorm.ts                     ← 头脑风暴处理链
  search/
    anspire.ts                          ← Anspire search API 封装
```

---

## 五、长文处理策略

| 文章字数 | 翻译 | 摘要 | 头脑风暴 |
|---------|------|------|---------|
| < 1500 字 | 单次 pass | 单次 pass | 直接输入全文 |
| 1500–6000 字 | 分 2–4 片并发翻译 | map-reduce（2层） | 先快速摘要，基于摘要 |
| > 6000 字 | 分片翻译后顺序合并 | 层级 map-reduce | 仅基于压缩摘要+标题结构 |

**分片规则**（`chunker.ts`）：
- 优先在段落边界切分，不在句子中间断开
- 每片上限 1500 汉字（约 2000 tokens）
- 并发上限：翻译 3 个并发，摘要 5 个并发

---

## 六、处理链详细设计与错误处理

### 通用错误处理原则

| 错误类型 | 处理策略 |
|---------|---------|
| 单片 LLM 调用失败 | 重试 1 次；仍失败则记录到 `meta.failed_chunks`，以 `[⚠️ 此段处理失败]` 占位继续 |
| 全局 LLM 不可用 | 立即终止，DB status='error'，error 字段记录原因 |
| search 调用失败 | 记录到 `meta.skipped_searches`，LLM 以"搜索不可用"为上下文继续 |
| reduce 阶段失败 | 降级：将各片段摘要直接拼接输出，加「(自动降级摘要)」提示 |
| 内容超限 | 超过 1,000,000 字符直接拒绝，返回 413 |

### 6.1 翻译（translate）

```
输入: 原文 Markdown
→ chunker.split(content, 1500)
→ Promise.all（限并发3）: translateChunk(chunk, targetLang)
→ 按序合并，添加片段分隔
→ 流式输出（模拟流：按段落推送合并结果）
```

**Prompt（单片）**：
```
你是专业翻译。将以下内容准确翻译成{targetLang}，保持原文结构、Markdown 格式和技术术语准确性，不省略任何内容，不添加解释。

{chunk}
```

### 6.2 摘要（summarize）

**短文**（< 1500字）：
```
→ 直接一次 LLM 调用
→ 输出结构化摘要
```

**长文**：
```
→ chunker.split(content, 1500)
→ 并发摘要各片（map phase）: summarizeChunk(chunk)
→ 合并所有片段摘要
→ 二次 LLM 综合（reduce phase）
→ 流式输出最终摘要
```

**Prompt（map phase）**：
```
请对以下文章片段提取核心信息，200字以内：

{chunk}
```

**Prompt（reduce phase）**：
```
以下是一篇文章各部分的摘要，请综合生成结构化最终摘要：

## 核心主题
（1-2句）

## 主要论点
（3-5条，每条50字以内）

## 关键结论

## 值得关注的细节

各部分摘要：
{chunkSummaries}
```

### 6.3 头脑风暴（brainstorm）

```
→ 获取文章压缩内容（降级链）:
    1. 优先使用 documents.summary
    2. 若无: 内部调用 summarize（不创建版本）
    3. 若 summarize 失败: 取 content 前 2000 字 + title + tags
→ 进入 sub-agent 循环（最多 5 轮 / 每轮最多 3 次 search）:
    LLM（带 search tool）→ 若调用 search → anspire.search(query)
    → 返回结构化结果 → 继续对话
    → 直到 LLM 停止调用工具
→ 流式输出最终分析结果
```

**Prompt（system）**：
```
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

在分析时，你可以主动使用 search 工具查询相关资料，每次查询应针对具体问题。
```

---

## 七、Sub-agent 模块（`lib/llm/subagent.ts`）

完全解耦的公共模块，不含任何业务逻辑：

```typescript
export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>

export interface SubagentOptions {
  systemPrompt: string
  userMessage: string
  tools: ToolDef[]
  toolHandlers: Record<string, ToolHandler>
  onDelta: (chunk: string) => void         // 流式输出回调
  onToolCall?: (name: string, args: unknown) => void  // 可选：记录工具调用
  maxRounds?: number                       // 默认 5，防无限 tool-call 循环
  maxToolCallsPerRound?: number            // 默认 3，防单轮爆炸式搜索
  maxOutputTokens?: number                 // 默认 4000
}

export async function runSubagent(opts: SubagentOptions): Promise<void>
```

调用方（brainstorm processor）注入 `search` tool 及其 handler，sub-agent 不感知 Anspire。

---

## 八、Anspire Search 封装（`lib/search/anspire.ts`）

```typescript
export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export async function search(query: string, topK = 5): Promise<SearchResult[]>
// GET https://plugin.anspire.cn/api/ntsearch/search?query=...&top_k=5
// Authorization: Bearer {ANSPIRE_API_KEY}
// 返回结构化结果列表
```

---

## 九、UI 设计

### 页面结构

```
┌─────────────────────────────────────┐
│ ← [文章标题截断]            [主题↺] │  ← sticky header（同原文 header 风格）
├─────────────────────────────────────┤
│  [翻译]    [摘要]    [头脑风暴]     │  ← mode tabs，下划线激活态
├─────────────────────────────────────┤
│  版本: ● 今天 15:30  ○ 昨天 09:12  │  ← 版本 chips + ↺ 刷新按钮
├─────────────────────────────────────┤
│                                     │
│   [骨架屏 / 流式 MarkdownRenderer]  │  ← 主阅读区，max-w-2xl，同原文排版
│   生成中: 顶部细进度条 + 光标闪烁   │
│   空状态: "点击 ↺ 开始生成"         │
│   错误状态: 错误卡片 + 重试按钮     │
│                                     │
└─────────────────────────────────────┘
```

### 状态机

```
EMPTY → [用户点击↺] → LOADING
LOADING → [stream 开始] → STREAMING
STREAMING → [done] → DONE
STREAMING → [error] → ERROR
DONE → [用户点击↺] → LOADING（新版本）
ERROR → [用户点击重试] → LOADING
```

### 关键 UX 细节
- 生成中顶部进度条持续动画（非真实进度，仅氛围）
- 内容流入时光标在末尾闪烁
- 版本 chip 仅展示最近 5 个版本，超出隐藏
- 翻译模式额外显示目标语言选择器（默认中文，支持英/日/韩）
- 移动端底部导航栏在智读页增加「原文」快速返回项

---

## 十、中间件与路由权限

`/[id]/smart` 受现有 session 中间件保护，无需额外配置。
`/api/smart/*` 同样受保护（非 `/api/v1` 公开路由）。

---

## 十一、环境变量

| 变量 | 用途 |
|------|------|
| `LLM_BASE_URL` | OpenAI-compatible 接口基础 URL |
| `LLM_API_KEY` | LLM API 密钥 |
| `LLM_MODEL` | 使用的模型名称 |
| `ANSPIRE_API_KEY` | Anspire 搜索 API 密钥 |

---

## 十二、API 响应格式规范

遵循现有 Open NoteHub API 约定：

```typescript
// POST /api/smart/[docId]/[mode]
201: { taskId: string }
400: { error: 'invalid_mode' | 'content_too_large', message: string }
404: { error: 'document_not_found', message: string }
409: { error: 'task_already_running', message: string, taskId: string }

// GET /api/smart/[docId]/[mode]  (版本列表)
200: { versions: Array<{ id: string, version: number, status: string, created_at: string, completed_at: string | null }> }

// GET /api/smart/stream/[taskId]  (SSE)
// Content-Type: text/event-stream
event: chunk\ndata: "<markdown delta>\n\n"
event: done\ndata: {}\n\n
event: error\ndata: {"error":"llm_failed","message":"..."}\n\n
```

## 十三、实现顺序建议

1. DB 迁移（`0002_smart_results.sql`）
2. `lib/search/anspire.ts`
3. `lib/llm/client.ts` + `chunker.ts` + `prompts.ts`
4. `lib/llm/task-registry.ts`
5. `lib/llm/subagent.ts`
6. 三个 processors（translate / summarize / brainstorm）
7. API routes（POST 创建任务、GET 版本列表、SSE 流）
8. 前端页面 `app/(reader)/[id]/smart/page.tsx`
9. 原文页添加「智读」入口按钮
10. Docker 重构建验证
