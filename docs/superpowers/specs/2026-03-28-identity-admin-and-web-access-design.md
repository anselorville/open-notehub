# Open NoteHub 用户体系、后台管理与 Web Access 设计

**日期**: 2026-03-28  
**状态**: 已批准  
**范围**: 用户体系、后台管理、链接导入产品化入口、后端 `web-access` 抓取模块

---

## 一、背景与目标

Open NoteHub 当前已经具备较完整的阅读、搜索、文库浏览与智读能力，但还存在两个明显缺口：

1. **用户体系仍停留在单密码入口**
   当前登录逻辑仍是环境变量密码 + JWT cookie，无法支撑后台用户、角色权限、后台管理与未来多用户演进。
2. **数据入口仍停留在 Agent API**
   目前文档主要通过 `POST /api/v1/documents` 导入，属于技术入口，而不是用户可见的产品功能。

用户已经明确指出：项目现在“趋于完整，就差数据入口和用户体系”。同时要求把“根据外部网页链接导入文章”的能力做成产品可见功能，并将抓取能力沉淀为尽量解耦的后端 `web-access` 模块。

本次设计目标是：

- 先交付**单租户可用**的用户体系与后台管理；
- 底层数据与权限模型按未来**多用户演进兼容**来设计；
- 将“根据 URL 获取内容”的能力抽成独立 `web-access` 模块；
- 让“链接导入”同时具备：
  - 前台简化产品入口
  - 后台完整导入工作台
  - 可观测、可调试、可重试的后端任务链路

---

## 二、历史线索与当前现状

### 2.1 代码中已经存在的线索

当前仓库里已经有一些“未来要做用户体系/后台”的预埋，但尚未真正接通：

- `lib/db/schema.ts` 已存在 `users`、`agents`、`documents.user_id`
- `middleware.ts` 目前仍是“全站单密码登录壳”
- `app/api/auth/login/route.ts` 并未读取 `users` 表，而是用 `AUTH_PASSWORD` 做一次性校验
- `app/api/v1/documents/route.ts` 仍是“Agent Key -> 直接写 documents”

这说明：

- 数据层并非从零开始；
- 但认证层、权限层、后台界面层、导入任务层都还未建立。

### 2.2 外部需求线索

用户给出的 X 帖子（2026-03-27，`https://x.com/runes_leo/status/2037479240837579242`）给出了一条非常关键的方法论：

- 问题不是“缺一个抓网页工具”，而是“拿到一个链接，应该用哪种方式抓”
- 帖子中列出的优先级实质上是一套**按场景路由 provider 的策略**

帖子里的示例优先级可归纳为：

- 读 X / 推文 -> 专用 social extractor
- 公开网页 -> 轻量静态提取器（如 Jina）
- 需要登录态的页面 -> 复用本地浏览器上下文的 CDP / browser session
- 浏览器交互 -> 自动化浏览器
- 反爬 / 强对抗站点 -> 更强的 fallback provider

这和 Open NoteHub 的目标完全一致：不应该把“导入链接”写死成单一抓取器，而应该做成一个可扩展的后端 `web-access` 模块。

---

## 三、用户已确认的产品决策

用户已经明确确认以下决策：

- 用户体系采取：**先做单租户后台，但底层按未来多用户兼容设计**
- 后台第一批能力采取：
  - 用户与权限
  - 文档管理
  - Agent / API Key 管理
  - 导入任务队列
  - 失败重试
  - 抓取调试面板
- 链接导入的交付形态采取本次设计中的合理假设：
  - **前台有简化入口**
  - **后台有完整工作台**
- 外部网页链接导入能力要做成**独立模块**，尽量不与现有文库阅读逻辑强耦合

---

## 四、范围与非目标

### 4.1 本次范围

- 用户登录从环境变量密码升级到真正的 `users` 体系
- 角色权限、后台访问控制、后台页面壳与后台 API
- 文档后台管理能力
- Agent / API Key 管理
- 链接导入任务系统
- 后端 `web-access` provider/router/service 设计
- 前台简化导入入口
- 后台导入工作台、失败重试、调试追踪

### 4.2 非目标

- 本轮不做完整公开注册 SaaS 化流程
- 本轮不把首页文库改成按用户完全隔离
- 本轮不做多租户计费、组织、邀请协作
- 本轮不重做智读核心流程
- 本轮不要求 `web-access` 一开始就覆盖所有站点，只需具备可扩展结构和一批高价值 provider

---

## 五、方案对比与选择

### 方案 A：继续在现有单密码上叠后台

直接在当前 session 壳上增加 `/admin`，并把链接导入塞进后台。

优点：

- 实现最快
- 短期可见成果快

缺点：

- `users` 表继续闲置
- 权限模型未来必然返工
- 链接导入与后台页面强耦合，难以复用到前台入口和 API

### 方案 B：分层建立 Identity / Admin / Web Access / Import Center

先把用户体系、后台、抓取模块和导入工作流明确拆层，再通过前台入口和后台工作台接入同一套任务服务。

优点：

- 架构边界清晰
- 能同时支持前台入口、后台工作台、未来 API 扩展
- `web-access` 能独立演进，不会绑死业务页面
- 最符合用户“可视化产品功能 + 后端解耦模块”的要求

缺点：

- 初期设计成本略高
- 需要同时设计数据表、后台壳、抓取路由与任务流

### 方案 C：直接做完整多用户 SaaS

一次性上注册、用户隔离文库、后台、导入和运维面板。

优点：

- 最完整

缺点：

- 明显超出当前阶段
- 会拖慢交付

**最终选择：方案 B**

---

## 六、总体架构设计

本次设计将系统拆为 4 层：

### 6.1 Identity 层

职责：

- 用户登录
- 会话签发与校验
- 角色权限
- 后台访问控制
- 首个管理员引导初始化

不负责：

- 文档导入逻辑
- 抓取策略

### 6.2 Admin 层

职责：

- 后台页面与后台 API
- 用户管理
- 文档管理
- Agent / API Key 管理
- 导入中心
- 调试面板

不负责：

- 直接抓网页
- 文本抽取算法

### 6.3 Web Access 层

职责：

- 给定 URL，根据规则选择 provider
- 获取结构化网页内容
- 返回统一结果与 trace

不负责：

- 决定是否入库
- 业务页面展示

### 6.4 Import Center 层

职责：

- 创建导入任务
- 调用 `web-access`
- 执行清洗、预览、去重、入库
- 回写任务状态、调试信息与结果

不负责：

- 决定用户是否有权限访问后台

---

## 七、用户体系设计

### 7.1 目标

先交付**单租户可用**的后台系统，但保留未来多用户演进的路径。

### 7.2 用户模型

建议真正启用 `users` 表，并补充以下语义字段：

- `id`
- `email`
- `password_hash`
- `display_name`
- `role`
- `status`
- `created_at`
- `last_login_at`
- `updated_at`

建议角色先只交付两级：

- `owner`
  - 系统最高权限
  - 可管理用户、agent、系统设置、导入调试
- `editor`
  - 可导入、管理文档、查看导入任务
  - 不可修改系统级配置与高级调试策略

### 7.3 会话与迁移

当前系统的单密码模式不应直接硬删，而应转换为“首个管理员 bootstrap”机制：

- 若数据库中不存在 `owner` 用户
- 则允许使用环境变量初始化首个管理员
- 初始化完成后，正常登录全部走 `users` 表

这样既满足现有部署平滑升级，也避免以后继续依赖单密码壳。

### 7.4 多用户兼容策略

虽然第一版仍是共享文库，但所有未来新写入数据都应预留创建人与归属字段，例如：

- `created_by_user_id`
- `updated_by_user_id`
- `owner_user_id`

这能保证未来若要将文库按用户隔离，不需要再推翻整个后台和导入链路。

---

## 八、后台管理设计

### 8.1 后台信息架构

建议后台第一版包含 5 个主模块：

1. `概览`
2. `文档`
3. `导入中心`
4. `Agent 与密钥`
5. `用户与权限`
6. `系统与调试`

### 8.2 模块职责

#### 概览

- 最近导入任务
- 失败任务数
- 最近新增文档
- 待处理异常

#### 文档

- 搜索、过滤、分页
- 编辑标题 / 摘要 / 标签
- 删除文档
- 跳转阅读页 / 智读页 / 原始链接

#### 导入中心

- 手动提交 URL
- 查看导入任务状态
- 查看预览结果
- 重试失败任务
- 指定 provider 重跑

#### Agent 与密钥

- 管理 agent
- 启用 / 禁用
- 轮换 key
- 查看调用痕迹

#### 用户与权限

- 创建后台用户
- 修改角色
- 重置密码
- 停用账号

#### 系统与调试

- 查看 `web-access` 路由决策
- 查看 provider trace
- 查看失败样本
- 调整 provider 优先级策略

### 8.3 前台与后台分工

前台仅暴露简化导入入口：

- 输入 URL
- 提交
- 显示任务状态
- 成功后跳转文档

后台承担完整工作台职责：

- 批量查看任务
- 重试
- 调试
- trace
- provider override

---

## 九、Web Access 模块设计

### 9.1 设计原则

`web-access` 必须是**独立业务模块**，不依赖后台页面结构，也不直接写 `documents`。

建议目录结构：

```ts
lib/web-access/
  types.ts
  policies.ts
  router.ts
  service.ts
  providers/
    social-x.ts
    jina.ts
    browser-session.ts
    playwright.ts
    fallback.ts
```

### 9.2 统一输入

建议统一输入类型：

```ts
interface WebAccessRequest {
  url: string
  purpose: 'preview' | 'import'
  preferredMode?: 'auto' | 'static' | 'browser'
  forceProvider?: string
  trace?: boolean
}
```

### 9.3 统一输出

建议统一输出类型：

```ts
interface WebAccessResult {
  status: 'success' | 'partial' | 'failed'
  finalUrl: string
  provider: string
  title?: string
  contentMarkdown?: string
  excerpt?: string
  siteName?: string
  author?: string
  publishedAt?: string
  coverImage?: string
  language?: string
  trace: WebAccessTrace[]
  errorCode?: string
  errorMessage?: string
}
```

### 9.4 Router 策略

`web-access` 的核心不是 provider 本身，而是**provider 路由决策**。

建议将帖子里的经验抽象成路由策略：

- `social-x`
  - 用于 X / Tweet 这类结构化 social 页面
- `public-static`
  - 用于公开网页、博客、静态内容页
- `auth-bound`
  - 用于需要复用登录态的页面，优先走浏览器上下文
- `interactive`
  - 用于必须点击、展开、滚动后才能取到正文的页面
- `js-heavy`
  - 用于纯前端渲染站点
- `anti-bot-fallback`
  - 用于前几种都失败的兜底 provider

重要的是：

- provider 可替换
- 规则可调整
- 每次任务都记录“为什么选了这个 provider”

### 9.5 解耦要求

业务层不应知道：

- Jina 的 HTTP 细节
- Playwright 的页面操作细节
- browser session 如何管理

业务层只依赖：

- `fetchWebResource(req): Promise<WebAccessResult>`

---

## 十、导入中心设计

### 10.1 核心目标

把“链接导入”从隐藏 API 提升为产品功能。

### 10.2 任务流

建议任务流如下：

1. 用户提交 URL
2. 创建 `import_job = queued`
3. worker 启动
4. 调用 `web-access.router`
5. 获取结构化内容
6. 执行规范化与清洗
7. 做去重判断
8. 生成预览
9. 自动入库或人工确认
10. 写入 `documents` 与来源关系
11. 更新任务状态

### 10.3 前台入口

前台只做轻入口：

- URL 输入框
- 提交
- 轮询任务状态
- 成功进入文档

它不承担复杂调试职责。

### 10.4 后台工作台

后台导入中心提供：

- 任务列表
- 状态筛选
- 失败重试
- 强制 provider 重跑
- 结果预览
- 错误详情
- trace 查看

### 10.5 入库策略

建议第一版支持两种模式：

- 前台：结果足够可靠时默认自动入库
- 后台：允许“先预览，再确认入库”

这样前台适合日常使用，后台适合运营处理复杂链接。

---

## 十一、数据模型设计

### 11.1 新增或扩展表

建议新增：

- `import_jobs`
- `import_attempts`
- `document_sources`
- `user_sessions`（可选）
- `agent_keys`（可选，或扩展现有 `agents`）

### 11.2 建议字段方向

#### import_jobs

- `id`
- `submitted_url`
- `normalized_url`
- `status`
- `submitted_by_user_id`
- `selected_provider`
- `result_document_id`
- `preview_payload`
- `error_code`
- `error_message`
- `created_at`
- `updated_at`
- `completed_at`

#### import_attempts

- `id`
- `job_id`
- `provider`
- `status`
- `request_payload`
- `response_summary`
- `trace`
- `error_code`
- `error_message`
- `started_at`
- `finished_at`

#### document_sources

- `id`
- `document_id`
- `source_url`
- `normalized_url`
- `provider`
- `fetched_at`
- `source_type`
- `meta_json`

### 11.3 与现有 documents 的关系

`documents` 表不需要被 `web-access` 直接写入。

入库必须通过 Import Center 服务统一处理，原因是它还要负责：

- 去重
- preview
- owner / created_by 归属
- 来源信息记录

---

## 十二、错误处理设计

### 12.1 用户可见状态

前台和后台 UI 只暴露有限状态：

- `queued`
- `running`
- `needs_review`
- `done`
- `failed`

### 12.2 内部错误码

内部则保留更细粒度错误：

- `unsupported_url`
- `fetch_timeout`
- `auth_required`
- `anti_bot_blocked`
- `render_failed`
- `content_empty`
- `duplicate_document`
- `normalization_failed`

### 12.3 分层原则

前台：

- 给产品化、可行动的错误提示
- 不暴露 provider 技术细节

后台：

- 可以看到完整 trace
- 可以定位 provider 失败原因
- 可以执行重试与切换 provider

---

## 十三、验证策略

建议按 4 层验证：

### 13.1 Identity Validation

- owner bootstrap
- 登录 / 登出
- 角色访问控制
- 停用用户不可登录

### 13.2 Admin Validation

- 后台路由权限
- 用户管理
- 文档管理
- Agent / key 管理

### 13.3 Web Access Validation

建立 URL 样本集，至少覆盖：

- X 帖子
- 公开博客
- 登录态页面
- JS 重页面
- 明显失败页面

### 13.4 Import Flow Validation

- 提交 URL
- 任务入队
- 轮询状态
- 结果预览
- 自动入库
- 失败重试
- provider override

---

## 十四、风险与缓解

### 风险 1：用户体系改造影响现有登录

缓解：

- 用 owner bootstrap 平滑过渡
- 保持迁移期可初始化管理员

### 风险 2：Web Access 模块过早绑定具体工具

缓解：

- 抽象 provider 接口
- 业务只依赖统一 service

### 风险 3：导入中心与现有文库逻辑耦合过深

缓解：

- 导入任务与文档写入分层
- 通过 `import_jobs -> documents` 明确边界

### 风险 4：前台入口暴露过多复杂状态

缓解：

- 前台只保留简化流程
- 复杂追踪全部进入后台

---

## 十五、实施顺序建议

建议分两阶段实施：

### 阶段 1：Identity + Admin 骨架

1. 真正启用 `users` 体系
2. owner bootstrap
3. 角色权限与 middleware
4. 后台骨架
5. 文档管理 / 用户管理 / Agent 管理

### 阶段 2：Web Access + Import Center

1. `web-access` provider 接口与 router
2. `import_jobs` / `import_attempts` / `document_sources`
3. 后台导入工作台
4. 前台简化导入入口
5. 失败重试 / trace / provider override

这样能先把后台承载层做稳，再把高变化的抓取与导入模块接上。

---

## 十六、结论

本次设计的核心不是“多加一个抓取接口”，而是把 Open NoteHub 补齐成一个真正可运营的产品：

- 有用户体系
- 有后台管理
- 有产品化的数据入口
- 有独立、可扩展、可调试的 `web-access` 后端模块

这套方案能在当前阶段先交付单租户可用版本，同时为未来多用户产品演进保留完整路径。
