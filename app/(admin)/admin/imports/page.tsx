export default function AdminImportsPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">导入中心</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          这一页已经预留为完整的链接导入工作台。
        </p>
      </div>

      <div className="rounded-3xl border border-[#dfcfbe] bg-white/80 p-6 dark:border-zinc-800 dark:bg-zinc-900/70">
        <p className="text-sm leading-7 text-[#6b5a48] dark:text-zinc-300">
          下一阶段会在这里接入 `web-access` provider 路由、任务队列、失败重试、
          结果预览和 trace 调试。前台的“导入链接”入口也会复用同一条 import
          pipeline，而不是重新写一套逻辑。
        </p>
      </div>
    </section>
  )
}
