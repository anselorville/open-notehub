'use client'

import { Suspense, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function BootstrapForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [setupCode, setSetupCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [requiresSetupCode, setRequiresSetupCode] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadState() {
      const res = await fetch('/api/auth/bootstrap/state', { cache: 'no-store' })
      const data = await res.json().catch(() => null)

      if (cancelled) {
        return
      }

      if (!data?.needsBootstrap) {
        router.replace('/login')
        return
      }

      setRequiresSetupCode(Boolean(data.requiresSetupCode))
    }

    loadState().catch(() => {
      if (!cancelled) {
        setError('Unable to load bootstrap state. Please retry.')
      }
    })

    return () => {
      cancelled = true
    }
  }, [router])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        displayName,
        password,
        confirmPassword,
        setupCode,
      }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.message ?? 'Bootstrap failed. Please retry.')
      return
    }

    const from = searchParams.get('from') ?? '/admin'
    router.push(from)
    router.refresh()
  }

  function handleChange(
    setter: (value: string) => void
  ) {
    return (event: ChangeEvent<HTMLInputElement>) => setter(event.target.value)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        type="email"
        placeholder="Owner email"
        value={email}
        onChange={handleChange(setEmail)}
        autoFocus
        required
        className="h-11 text-base"
      />

      <Input
        type="text"
        placeholder="Display name (optional)"
        value={displayName}
        onChange={handleChange(setDisplayName)}
        className="h-11 text-base"
      />

      <Input
        type="password"
        placeholder="Set a login password"
        value={password}
        onChange={handleChange(setPassword)}
        required
        className="h-11 text-base"
      />

      <Input
        type="password"
        placeholder="Confirm the password"
        value={confirmPassword}
        onChange={handleChange(setConfirmPassword)}
        required
        className="h-11 text-base"
      />

      {requiresSetupCode && (
        <Input
          type="password"
          placeholder="Current shared admin password"
          value={setupCode}
          onChange={handleChange(setSetupCode)}
          required
          className="h-11 text-base"
        />
      )}

      {error && (
        <p className="text-center text-sm text-red-500">{error}</p>
      )}

      <Button type="submit" className="h-11 w-full" disabled={loading}>
        {loading ? 'Creating owner...' : 'Create owner and enter admin'}
      </Button>
    </form>
  )
}

export default function BootstrapPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafaf8] dark:bg-[#1a1a1a]">
      <div className="w-full max-w-sm px-6">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Initialize Open NoteHub</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create the first owner account and unlock the admin console.
          </p>
        </div>
        <Suspense>
          <BootstrapForm />
        </Suspense>
      </div>
    </div>
  )
}
