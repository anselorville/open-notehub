'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    setLoading(false)

    if (res.ok) {
      const from = searchParams.get('from') ?? '/'
      router.push(from)
      router.refresh()
    } else {
      setError('密码错误，请重试')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Input
          type="password"
          placeholder="访问密码"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
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
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafaf8] dark:bg-[#1a1a1a]">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">LearnHub</h1>
          <p className="text-sm text-muted-foreground mt-1">知识阅读中心</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
