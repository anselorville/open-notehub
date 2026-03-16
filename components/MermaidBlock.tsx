'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  code: string
}

export function MermaidBlock({ code }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      import('mermaid'),
      import('dompurify'),
    ]).then(([mermaidModule, DOMPurifyModule]) => {
      if (cancelled) return
      const mermaid = mermaidModule.default
      const DOMPurify = DOMPurifyModule.default

      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'strict',
        themeVariables: {
          primaryColor: '#e8f4fd',
          primaryTextColor: '#1a1a2e',
          lineColor: '#6c757d',
        },
      })

      const id = 'mermaid-' + Math.random().toString(36).slice(2)
      mermaid.render(id, code)
        .then(({ svg }) => {
          if (cancelled || !ref.current) return
          const clean = DOMPurify.sanitize(svg, {
            USE_PROFILES: { svg: true, svgFilters: true },
          })
          if (clean.length > 500_000) {
            setError('Diagram is too large to render (> 500KB)')
            setLoading(false)
            return
          }
          ref.current.innerHTML = clean
          setLoading(false)
        })
        .catch((e: unknown) => {
          if (cancelled) return
          setError(e instanceof Error ? e.message : 'Render failed')
          setLoading(false)
        })
    })

    return () => { cancelled = true }
  }, [code])

  if (error) {
    return (
      <div className="my-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
        <strong>Mermaid error:</strong> {error}
        <pre className="mt-2 text-xs opacity-70 overflow-x-auto">{code}</pre>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="my-6 flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Rendering diagram…
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="my-6 overflow-x-auto rounded-lg border bg-white p-4 dark:bg-zinc-900"
    />
  )
}
