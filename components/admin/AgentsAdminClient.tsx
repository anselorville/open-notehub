'use client'

import { useState } from 'react'
import type { AdminAgentListItem } from '@/lib/admin/data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'

interface AgentDraft {
  name: string
  description: string
  isActive: boolean
}

function toDraft(agent: AdminAgentListItem): AgentDraft {
  return {
    name: agent.name,
    description: agent.description ?? '',
    isActive: agent.isActive,
  }
}

export function AgentsAdminClient({
  initialAgents,
}: {
  initialAgents: AdminAgentListItem[]
}) {
  const [agents, setAgents] = useState(initialAgents)
  const [drafts, setDrafts] = useState<Record<string, AgentDraft>>(
    Object.fromEntries(initialAgents.map((agent) => [agent.id, toDraft(agent)]))
  )
  const [form, setForm] = useState({ name: '', description: '' })
  const [creating, setCreating] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [latestApiKey, setLatestApiKey] = useState<string | null>(null)

  function updateDraft(agentId: string, patch: Partial<AgentDraft>) {
    setDrafts((current) => ({
      ...current,
      [agentId]: {
        ...current[agentId],
        ...patch,
      },
    }))
  }

  async function handleCreateAgent(event: React.FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError('')
    setMessage('')
    setLatestApiKey(null)

    const res = await fetch('/api/admin/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    setCreating(false)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.message ?? '创建 agent 失败')
      return
    }

    const data = await res.json()
    const created = data.agent as AdminAgentListItem
    setAgents((current) => [created, ...current])
    setDrafts((current) => ({
      ...current,
      [created.id]: toDraft(created),
    }))
    setLatestApiKey(data.apiKey ?? null)
    setForm({ name: '', description: '' })
    setMessage('Agent 已创建，下面是新的 API Key')
  }

  async function handleSaveAgent(agentId: string) {
    const draft = drafts[agentId]
    if (!draft) {
      return
    }

    setSavingId(agentId)
    setError('')
    setMessage('')

    const res = await fetch(`/api/admin/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })

    setSavingId(null)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.message ?? '更新 agent 失败')
      return
    }

    const data = await res.json()
    const updated = data.agent as AdminAgentListItem
    setAgents((current) => current.map((agent) => (agent.id === updated.id ? updated : agent)))
    setDrafts((current) => ({
      ...current,
      [updated.id]: toDraft(updated),
    }))
    setMessage('Agent 已更新')
  }

  async function handleRotateKey(agentId: string) {
    if (!window.confirm('确认轮换这个 agent 的 API Key 吗？旧 key 会立即失效。')) {
      return
    }

    setSavingId(agentId)
    setError('')
    setMessage('')
    setLatestApiKey(null)

    const res = await fetch(`/api/admin/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotateKey: true }),
    })

    setSavingId(agentId)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.message ?? '轮换 key 失败')
      setSavingId(null)
      return
    }

    const data = await res.json()
    const updated = data.agent as AdminAgentListItem
    setAgents((current) => current.map((agent) => (agent.id === updated.id ? updated : agent)))
    setDrafts((current) => ({
      ...current,
      [updated.id]: toDraft(updated),
    }))
    setLatestApiKey(data.apiKey ?? null)
    setMessage('API Key 已轮换，请立即保存')
    setSavingId(null)
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent / Key 管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          维护文档导入用的 agent 与 API Key。
        </p>
      </div>

      <form
        onSubmit={handleCreateAgent}
        className="grid gap-3 rounded-3xl border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70 lg:grid-cols-[1.2fr_2fr_140px]"
      >
        <Input
          placeholder="Agent 名称"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          required
        />
        <Input
          placeholder="用途描述"
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({ ...current, description: event.target.value }))
          }
        />
        <Button type="submit" disabled={creating}>
          {creating ? '创建中' : '新建 Agent'}
        </Button>
      </form>

      {(message || error) && (
        <p className={error ? 'text-sm text-red-500' : 'text-sm text-emerald-600'}>
          {error || message}
        </p>
      )}

      {latestApiKey && (
        <div className="rounded-3xl border border-[#d4c1aa] bg-[#fff6eb] p-5 dark:border-[#4e402f] dark:bg-[#1d1711]">
          <p className="text-sm font-medium text-[#6d4c28] dark:text-[#ddb78a]">
            新的 API Key 只会显示一次
          </p>
          <code className="mt-2 block overflow-x-auto rounded-2xl bg-black/5 px-4 py-3 text-sm dark:bg-white/5">
            {latestApiKey}
          </code>
        </div>
      )}

      <div className="space-y-3">
        {agents.map((agent) => {
          const draft = drafts[agent.id] ?? toDraft(agent)
          const pending = savingId === agent.id

          return (
            <div
              key={agent.id}
              className="grid gap-3 rounded-3xl border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70 lg:grid-cols-[1.2fr_2fr_140px_220px]"
            >
              <div>
                <p className="text-sm font-medium text-[#201710] dark:text-zinc-50">
                  创建于 {formatDate(agent.createdAt)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">ID: {agent.id}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={draft.name}
                  onChange={(event) => updateDraft(agent.id, { name: event.target.value })}
                  placeholder="Agent 名称"
                />
                <Input
                  value={draft.description}
                  onChange={(event) =>
                    updateDraft(agent.id, { description: event.target.value })
                  }
                  placeholder="用途描述"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) =>
                    updateDraft(agent.id, { isActive: event.target.checked })
                  }
                />
                <span>启用</span>
              </label>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleRotateKey(agent.id)}
                  disabled={pending}
                >
                  轮换 Key
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSaveAgent(agent.id)}
                  disabled={pending}
                >
                  {pending ? '保存中' : '保存'}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
