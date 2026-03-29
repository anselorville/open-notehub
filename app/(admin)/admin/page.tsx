import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getAdminOverviewData } from '@/lib/admin/data'
import { formatDate } from '@/lib/utils'

export default async function AdminOverviewPage() {
  const overview = await getAdminOverviewData()

  const cards = [
    {
      label: '总用户数',
      value: overview.counts.totalUsers,
      hint: `${overview.counts.activeUsers} 个活跃账号`,
    },
    {
      label: '文档总量',
      value: overview.counts.totalDocuments,
      hint: `近 7 天新增 ${overview.counts.recentDocuments} 篇`,
    },
    {
      label: '启用中的 Agent',
      value: overview.counts.activeAgents,
      hint: '供导入 API 使用',
    },
  ]

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#8c755a] dark:text-zinc-500">
          Admin Overview
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Open NoteHub 后台
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          这里负责用户、文档和 Agent 的后台运营。前台的文库、入藏和搜索已经是完整产品页，后台不再单独承担导入入口。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-3xl border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70"
          >
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-[#201710] dark:text-zinc-50">
              {card.value}
            </p>
            <p className="mt-2 text-sm text-[#6b5a48] dark:text-zinc-400">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-3xl border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">最近文档</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                最新入库的文章与来源状态。
              </p>
            </div>
            <Link
              href="/admin/documents"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#6d4c28] hover:text-[#201710] dark:text-[#ddb78a] dark:hover:text-zinc-50"
            >
              文档管理
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {overview.latestDocuments.map((document) => (
              <div
                key={document.id}
                className="rounded-2xl border border-[#efe2d4] px-4 py-3 dark:border-zinc-800"
              >
                <p className="text-sm font-medium text-[#201710] dark:text-zinc-50">
                  {document.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {document.ownerEmail ?? '未记录 owner'} · {document.sourceType} ·{' '}
                  {formatDate(document.createdAt)}
                </p>
              </div>
            ))}

            {!overview.latestDocuments.length && (
              <p className="text-sm text-muted-foreground">当前还没有文档。</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-[#dfcfbe] bg-[#fff6eb] p-5 dark:border-[#4e402f] dark:bg-[#1d1711]">
          <h2 className="text-lg font-semibold tracking-tight text-[#6d4c28] dark:text-[#ddb78a]">
            当前后台职责
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#6b5a48] dark:text-zinc-300">
            这里聚焦用户体系、角色边界、文档运营和 Agent / Key 管理。产品侧的入藏流程已经迁到前台一级页面，由统一的作业流水线支撑。
          </p>
        </div>
      </div>
    </section>
  )
}
