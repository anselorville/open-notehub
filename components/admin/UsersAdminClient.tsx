'use client'

import { useState } from 'react'
import type { AdminUserListItem } from '@/lib/admin/data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'

interface UserDraft {
  displayName: string
  role: 'owner' | 'editor'
  status: 'active' | 'disabled'
}

function toDraft(user: AdminUserListItem): UserDraft {
  return {
    displayName: user.displayName ?? '',
    role: user.role === 'owner' ? 'owner' : 'editor',
    status: user.status === 'disabled' ? 'disabled' : 'active',
  }
}

export function UsersAdminClient({
  initialUsers,
}: {
  initialUsers: AdminUserListItem[]
}) {
  const [users, setUsers] = useState(initialUsers)
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>(
    Object.fromEntries(initialUsers.map((user) => [user.id, toDraft(user)]))
  )
  const [form, setForm] = useState({
    email: '',
    displayName: '',
    password: '',
    role: 'editor' as 'owner' | 'editor',
  })
  const [creating, setCreating] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function updateDraft(userId: string, patch: Partial<UserDraft>) {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        ...patch,
      },
    }))
  }

  async function handleCreateUser(event: React.FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError('')
    setMessage('')

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    setCreating(false)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.message ?? '创建用户失败')
      return
    }

    const data = await res.json()
    const created = data.user as AdminUserListItem

    setUsers((current) => [created, ...current])
    setDrafts((current) => ({
      ...current,
      [created.id]: toDraft(created),
    }))
    setForm({ email: '', displayName: '', password: '', role: 'editor' })
    setMessage('用户已创建')
  }

  async function handleSaveUser(userId: string) {
    const draft = drafts[userId]
    if (!draft) {
      return
    }

    setSavingId(userId)
    setError('')
    setMessage('')

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })

    setSavingId(null)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.message ?? '更新用户失败')
      return
    }

    const data = await res.json()
    const updated = data.user as AdminUserListItem
    setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)))
    setDrafts((current) => ({
      ...current,
      [updated.id]: toDraft(updated),
    }))
    setMessage('用户信息已更新')
  }

  async function handleResetPassword(userId: string) {
    const password = window.prompt('输入新的登录密码（至少 8 位）')
    if (!password) {
      return
    }

    setSavingId(userId)
    setError('')
    setMessage('')

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    setSavingId(null)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.message ?? '重置密码失败')
      return
    }

    setMessage('密码已重置')
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">用户管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          创建后台操作者、调整权限并处理账号状态。
        </p>
      </div>

      <form
        onSubmit={handleCreateUser}
        className="grid gap-3 rounded-3xl border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70 lg:grid-cols-[1.2fr_1fr_1fr_140px_120px]"
      >
        <Input
          type="email"
          placeholder="邮箱"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          required
        />
        <Input
          placeholder="显示名称"
          value={form.displayName}
          onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
        />
        <Input
          type="password"
          placeholder="初始密码"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          required
        />
        <select
          value={form.role}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              role: event.target.value as 'owner' | 'editor',
            }))
          }
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="editor">Editor</option>
          <option value="owner">Owner</option>
        </select>
        <Button type="submit" disabled={creating}>
          {creating ? '创建中' : '创建用户'}
        </Button>
      </form>

      {(message || error) && (
        <p className={error ? 'text-sm text-red-500' : 'text-sm text-emerald-600'}>
          {error || message}
        </p>
      )}

      <div className="space-y-3">
        {users.map((user) => {
          const draft = drafts[user.id] ?? toDraft(user)
          const pending = savingId === user.id

          return (
            <div
              key={user.id}
              className="grid gap-3 rounded-3xl border border-[#dfcfbe] bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70 lg:grid-cols-[1.2fr_1fr_140px_140px_1fr_220px]"
            >
              <div>
                <p className="text-sm font-medium text-[#201710] dark:text-zinc-50">
                  {user.email}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  创建于 {formatDate(user.createdAt)}
                  {user.lastLoginAt ? ` · 最近登录 ${formatDate(user.lastLoginAt)}` : ' · 尚未登录'}
                </p>
              </div>

              <Input
                value={draft.displayName}
                onChange={(event) => updateDraft(user.id, { displayName: event.target.value })}
                placeholder="显示名称"
              />

              <select
                value={draft.role}
                onChange={(event) =>
                  updateDraft(user.id, { role: event.target.value as 'owner' | 'editor' })
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="editor">Editor</option>
                <option value="owner">Owner</option>
              </select>

              <select
                value={draft.status}
                onChange={(event) =>
                  updateDraft(user.id, {
                    status: event.target.value as 'active' | 'disabled',
                  })
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>

              <div className="flex items-center text-sm text-muted-foreground">
                当前角色：{user.role === 'owner' ? 'Owner' : 'Editor'}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleResetPassword(user.id)}
                  disabled={pending}
                >
                  重置密码
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSaveUser(user.id)}
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
