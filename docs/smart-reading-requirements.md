# 智读功能需求文档

> 版本：v2，2026-03-21
> 核心调整：以「异步任务 + 轮询」替代「SSE 流式推送」，以稳健性为首要设计目标。

---

## 一、设计原则

### 1.1 为什么放弃实时 SSE

智读的三种模式都需要大量 LLM 调用，单次任务耗时通常在 30–180 秒之间。这个时间窗口里，实时流式推送面临一系列结构性风险：

- 移动网络、NAT、反向代理均可能在数十秒内静默断开长连接
- 一旦连接中断，客户端需要重连并「追赶」（catch-up）已生成的内容，服务端需维护每个订阅者的游标位置，实现复杂且易出错
- 服务端进程内的订阅者注册表（in-memory subscriber Map）是脆弱的状态，无法跨进程或重启恢复
- 前端 `EventSource` 的错误处理和重连状态机增加了大量与业务无关的复杂度

### 1.2 选择轮询的理由

「提交任务 → 轮询状态/结果」模型在稳健性上有本质优势：

- **无连接状态**：HTTP 请求天然是无状态的，任意一次轮询失败不影响任务本身
- **自然幂等**：客户端可随时重新进入页面，只需查询 DB 当前状态即可恢复显示
- **后端极度简化**：去掉订阅者注册表、catch-up 逻辑、SSE 格式化
- **感知体验可接受**：每 2–3 秒轮询一次，配合后端分阶段写 DB，用户可见到内容逐步出现，与流式体验差距在可接受范围内
- **运维友好**：任何一层重启（进程、容器、代理）都不影响已在进行的任务，也不影响客户端显示

### 1.3 核心约束

在所有设计决策中，优先级排序为：**稳健性 > 用户体验 > 性能**。

---

## 二、三种处理模式

### 2.1 翻译（Translate）

将文章正文翻译为目标语言（默认中文）。

**处理流程：**

1. 将原文按段落边界（`\n\n`）切分为若干 chunk，单块上限 1500 字符；超大段落单独成块
2. 所有 chunk 并发送入 LLM，并发上限 3
3. **保序写 DB**：各 chunk 可乱序完成，但必须按原文顺序追加写入 `result` 字段。chunk i 写入 DB 的时机是：i 本身完成，且所有 i 之前的 chunk 也已完成
4. 段与段之间保留空行（`\n\n`）

**分阶段写 DB 时机：**
- 每个 chunk 完成并保序就绪后立即写入
- 最后一个 chunk 写入后更新 `status = 'done'`, `completed_at`

**失败处理：**
- 单个 chunk 翻译失败：重试 2 次，仍失败则在该 chunk 位置插入原文，其余 chunk 继续翻译
- 所有 chunk 均失败：任务整体标记为 `error`

### 2.2 摘要（Summarize）

对文章生成结构化中文摘要，采用 Map-Reduce 策略。

**处理流程：**

- **短文（≤ 1 chunk）**：直接调用 reduce prompt 一次生成完整摘要
- **长文（> 1 chunk）**：
  1. **Map 阶段**：各 chunk 并发生成局部摘要，并发上限 5；每完成一个局部摘要，立即追加写入 `result`（用于轮询时展示进度）
  2. **Reduce 阶段**：将全部局部摘要合并，调用 LLM 生成最终综合摘要，覆盖写入 `result`

**分阶段写 DB 时机：**
- Map 阶段每完成一个局部摘要，追加写入（进度可见）
- Reduce 完成后全量覆盖写入最终结果，更新 `status = 'done'`

**失败处理：**
- Reduce 失败（含 LLM 超时）：将各局部摘要直接拼接作为兜底摘要，末尾附降级说明，任务以 `done` 态完成
- Map 阶段某 chunk 失败：重试 2 次，仍失败则跳过该 chunk（在 reduce 输入中不含该段）；若超过半数 chunk 失败，任务标记为 `error`

### 2.3 头脑风暴（Brainstorm）

基于文章内容，通过 LLM 工具调用循环结合网络搜索，输出延伸思考与关联洞察。

**处理流程：**

1. 内容预处理（防止超出 context window）：
   - 优先使用文章已有 `summary` 字段
   - 无 summary 则调用 LLM 生成 200 字以内摘要
   - 若压缩后仍超 `MAX_CONTENT_CHARS`，截断至上限
2. 进入工具调用循环：LLM 决定何时搜索、搜索什么；循环上限 5 轮，每轮最多 3 次工具调用
3. LLM 输出最终文本

**分阶段写 DB 时机：**
- 每轮工具调用结束后，将当前 LLM 思考片段（若有）写入 `result`（进度可见）
- 最终文本生成完毕后全量覆盖，更新 `status = 'done'`

**失败处理：**
- 搜索 API 调用失败：静默降级，在对应位置插入「搜索结果不可用」占位文本，不中断主流程
- LLM 调用超时（单次上限 60 秒）：结束当前轮次，尝试用已有内容生成最终输出；若 LLM 完全无响应，任务标记为 `error`

---

## 三、任务生命周期

### 3.1 状态机

```
           ┌──────────────────────────────────┐
           │                                  │
  [POST 发起任务]                          [进程重启]
           │                                  │
           ▼                                  │
        running ──── 正常完成 ────► done     │
           │                                  │
           ├──── LLM/系统错误 ──► error       │
           │                                  │
           └──── 超时未完成 ─────► interrupted ◄─┘
                 (> 1 小时)
```

- `running`：任务已创建并在后台执行中
- `done`：任务完成，`result` 字段包含完整结果
- `error`：任务失败，`error` 字段包含错误信息
- `interrupted`：进程重启后检测到的僵死任务，不会自动重试（需用户手动重新发起）

### 3.2 后台执行模型

任务通过 `Promise.resolve().then(processor)` 异步启动，与 HTTP 请求生命周期完全解耦。任务唯一标识符 `taskId` 与数据库 `result_id` 统一，作为轮询的 key。

无需进程内订阅者注册表，任务的「活跃状态」仅由数据库 `status` 字段表示。

### 3.3 冷启动恢复

服务启动后首次收到任意 API 请求时，执行一次性清理：将数据库中 `status = 'running'` 且 `created_at < now - 3600s` 的记录标记为 `interrupted`。

---

## 四、轮询交互模型

### 4.1 设计

客户端提交任务后，按固定间隔（2 秒）轮询状态接口，直到 `status` 变为终态（`done` / `error` / `interrupted`）。

轮询返回的 `result` 字段包含当前已写入 DB 的全部内容。后端在处理过程中分阶段写入（见各模式的「分阶段写 DB 时机」），客户端每次轮询将页面内容替换为最新的 `result`，造成逐步出现的视觉效果。

### 4.2 客户端轮询状态机

```
提交任务 (POST)
    │
    ▼
status = running
    │
    ├── 每 2s 轮询 GET /status
    │       │
    │       ├── result 有新内容 → 更新页面显示
    │       │
    │       └── status 未变 → 继续轮询
    │
    ├── status = done → 显示完整结果，停止轮询
    │
    └── status = error / interrupted → 显示错误提示，停止轮询
```

**轮询终止条件：**

- `status` 为 `done`、`error`、`interrupted` 三者之一
- 用户离开页面（页面卸载时停止）
- 连续 5 次轮询失败（网络错误）→ 显示提示，用户手动刷新可恢复

### 4.3 轮询频率

| 场景 | 间隔 |
|------|------|
| 任务运行中 | 2 秒 |
| 网络错误重试 | 指数退避（2s → 4s → 8s，上限 30s） |
| 任务达到终态 | 停止轮询 |

---

## 五、API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/smart/[docId]/[mode]` | 发起新任务 |
| `GET`  | `/api/smart/[docId]/[mode]` | 查询历史版本列表 |
| `GET`  | `/api/smart/[docId]/[mode]/[taskId]` | 轮询单个任务状态与当前结果 |

### POST `/api/smart/[docId]/[mode]`

**响应码：**

| 状态码 | 含义 |
|--------|------|
| 201 | 任务创建成功，返回 `{taskId, version}` |
| 400 | 参数错误（mode 不合法等） |
| 404 | 文章不存在 |
| 409 | 该模式已有任务运行中，返回 `{error: 'task_already_running', taskId}` |
| 413 | 文章内容超出处理上限 |

### GET `/api/smart/[docId]/[mode]/[taskId]`

**响应体：**

```json
{
  "taskId": "...",
  "status": "running | done | error | interrupted",
  "result": "当前已生成的文本（Markdown）",
  "version": 2,
  "createdAt": "2026-03-21T10:00:00.000Z",
  "completedAt": "2026-03-21T10:02:35.000Z",
  "error": "错误信息（仅 status=error 时存在）"
}
```

**响应码：**

| 状态码 | 含义 |
|--------|------|
| 200 | 正常返回 |
| 404 | taskId 不存在 |

### GET `/api/smart/[docId]/[mode]`

返回该文章该模式的历史版本列表，最多 10 条，按 version 倒序。

```json
{
  "versions": [
    { "taskId": "...", "version": 3, "status": "done", "createdAt": "..." },
    { "taskId": "...", "version": 2, "status": "done", "createdAt": "..." }
  ]
}
```

---

## 六、并发控制

- 同一文章同一模式，同一时刻只允许一个 `running` 任务
- 检测依据：查询 DB 中 `status = 'running'` 的记录，不依赖进程内状态
- 重复发起返回 `409`，响应体包含正在运行的 `taskId`（供前端直接接管轮询）
- 不同模式之间互不干扰，可并发运行

---

## 七、版本管理

- 每次成功发起任务，版本号在当前最大版本基础上 +1
- 数据库唯一约束：`(document_id, mode, version)`
- 每种模式保留最近 10 个版本，查询时按 version 倒序返回
- 前端以版本 chip 形式展示历史版本，点击可切换查看任意历史版本

---

## 八、内容与性能限制

| 限制项 | 阈值 | 说明 |
|--------|------|------|
| 文章最大字符数 | 1,000,000 字符 | 超出返回 413，不启动任务 |
| 头脑风暴内容压缩上限 | MAX_CONTENT_CHARS（建议 8000） | 超出后截断 |
| 翻译 chunk 大小 | ≤ 1500 字符 | 段落边界切分 |
| 翻译并发上限 | 3 | 防止 LLM API 限流 |
| Map 阶段并发上限 | 5 | 同上 |
| 工具调用轮次上限 | 5 轮 × 3 次/轮 | 防止 brainstorm 无限循环 |
| 单次 LLM 调用超时 | 60 秒 | 超时视为失败，触发重试或降级 |
| 版本历史保留数 | 10 条 | 超出后删除最旧版本 |

---

## 九、数据模型

```sql
CREATE TABLE smart_results (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL,          -- 'translate' | 'summarize' | 'brainstorm'
  version      INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'running',  -- running | done | error | interrupted
  result       TEXT,                   -- 当前已生成的文本，分阶段写入，轮询时直接读取
  meta         TEXT,                   -- JSON，存储扩展信息（如 chunk 总数、已完成数）
  error        TEXT,                   -- 错误信息，仅 status=error 时有值
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  UNIQUE(document_id, mode, version)
);

CREATE INDEX smart_results_doc_mode_version_idx ON smart_results(document_id, mode, version);
CREATE INDEX smart_results_status_idx ON smart_results(status);
```

`meta` 字段 JSON 结构（参考）：

```json
{
  "totalChunks": 12,
  "completedChunks": 7,
  "phase": "map"
}
```

供前端展示更细粒度的进度提示（如「7 / 12 段落已翻译」）。

---

## 十、前端交互

### 10.1 页面路由

- 路由：`/[docId]/smart`，独立页面，不强制登录（与阅读页一致）
- 文章页（`/[docId]`）提供「✦ 智读」入口按钮

### 10.2 整体布局

- 三个模式 tab（翻译 / 摘要 / 头脑风暴）横向排布
- 每个 tab 独立维护自己的任务状态和结果展示

### 10.3 任务状态与 UI 对应

| 状态 | UI 表现 |
|------|---------|
| 无历史记录 | 显示模式说明，提供「生成」按钮 |
| running（无内容） | 展示加载动画 + 进度提示（若 meta 有 chunk 信息） |
| running（有部分内容） | 展示已有内容 + 底部加载指示条 |
| done | 展示完整结果，提供「重新生成 ↺」按钮 |
| error | 展示错误提示，提供「重试」按钮 |
| interrupted | 展示中断提示，提供「重新发起」按钮 |

### 10.4 版本切换

- 历史版本以版本号 chip 展示（如 `v3` `v2` `v1`）
- 当前显示版本高亮
- 点击历史版本 chip：查询该 taskId 的结果，展示；不会启动新任务

### 10.5 轮询生命周期

- 进入页面：先查询历史版本列表，若最新版本 `status = 'running'` 则自动接管轮询
- 离开页面（组件卸载）：停止轮询定时器
- 切换到其他模式 tab：当前 tab 的轮询暂停，切回时恢复

---

## 十一、错误处理总则

所有模式遵循统一的错误处理原则：

1. **尽量完成，不要失败**：部分内容成功时，优先以降级结果完成任务，而非整体报错
2. **错误可见**：降级或跳过时，在结果文本中插入明确提示（如 `> ⚠️ 该段翻译失败，显示原文`），而非静默
3. **任务状态与 LLM 调用失败解耦**：单个 LLM 调用失败不应导致任务整体进入 `error` 状态，只有整体无法产出任何有用内容时才标记 `error`
4. **错误信息持久化**：`error` 字段存储机器可读的错误类型（如 `llm_timeout`、`content_too_large`），供运维排查

---

## 十二、待解决问题 / 已知局限

| 问题 | 当前状态 | 建议方向 |
|------|----------|---------|
| 翻译目标语言硬编码为中文 | 未支持配置 | POST 请求增加 `targetLang` 参数 |
| 头脑风暴搜索仅支持 Anspire | 单一依赖 | 抽象搜索接口，支持多源降级 |
| 版本保留数（10）和 chunk 大小（1500）硬编码 | 未暴露 | 移入环境变量或配置文件 |
| 无结果导出功能 | 未实现 | 支持导出为 Markdown / 复制全文 |
| 无手动中止运行中任务的接口 | 未实现 | 增加 `DELETE /api/smart/[docId]/[mode]/[taskId]` |
| 轮询在弱网下可能产生积压请求 | 未处理 | 轮询时检测上一次请求是否完成，避免并发轮询 |
