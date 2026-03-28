'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [bootstrapState, setBootstrapState] = useState<{
    loading: boolean
    needsBootstrap: boolean
  }>({ loading: true, needsBootstrap: false })
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    let cancelled = false

    async function loadBootstrapState() {
      try {
        const res = await fetch('/api/auth/bootstrap/state', { cache: 'no-store' })
        const data = await res.json()

        if (!cancelled) {
          setBootstrapState({
            loading: false,
            needsBootstrap: Boolean(data.needsBootstrap),
          })
        }
      } catch {
        if (!cancelled) {
          setBootstrapState({ loading: false, needsBootstrap: false })
        }
      }
    }

    loadBootstrapState()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    setLoading(false)

    if (res.ok) {
      const from = searchParams.get('from') ?? '/admin'
      router.push(from)
      router.refresh()
    } else {
      const data = await res.json().catch(() => null)

      if (data?.error === 'bootstrap_required') {
        router.push(`/bootstrap?from=${encodeURIComponent(searchParams.get('from') ?? '/admin')}`)
        return
      }

      setError(data?.message ?? '登录失败，请重试')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Input
          type="email"
          placeholder="管理员邮箱"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoFocus
          required
          className="h-11 text-base"
        />
      </div>

      <div>
        <Input
          type="password"
          placeholder="登录密码"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="h-11 text-base"
        />
      </div>

      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      <Button
        type="submit"
        className="w-full h-11"
        disabled={loading}
      >
        {loading ? '验证中…' : '进入'}
      </Button>

      {!bootstrapState.loading && bootstrapState.needsBootstrap && (
        <button
          type="button"
          onClick={() => {
            const from = searchParams.get('from') ?? '/admin'
            router.push(`/bootstrap?from=${encodeURIComponent(from)}`)
          }}
          className="w-full text-sm text-[#7b5c34] underline-offset-4 hover:underline dark:text-[#d5b78a]"
        >
          当前实例还没有管理员，去初始化 owner 账户
        </button>
      )}
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafaf8] dark:bg-[#1a1a1a]">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Open NoteHub</h1>
          <p className="text-sm text-muted-foreground mt-1">后台登录</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
