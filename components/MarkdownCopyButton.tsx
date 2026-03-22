'use client'

import { useState } from 'react'

interface Props {
  code: string
}

export function MarkdownCopyButton({ code }: Props) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      className="absolute right-3 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-zinc-400 hover:text-zinc-200 font-mono"
      onClick={() => {
        navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? 'copied!' : 'copy'}
    </button>
  )
}
