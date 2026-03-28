'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { badgeVariants } from '@/components/ui/badge'
import { type LibraryTheme } from '@/lib/library-theme'
import { cn } from '@/lib/utils'

interface Props {
  tags: string[]
  selected?: string
  theme?: LibraryTheme
}

function getTagClass(theme: LibraryTheme, active: boolean) {
  if (theme === 'editorial') {
    return active
      ? 'border-[#7d5230] bg-[#7d5230] text-[#fff9f1] hover:bg-[#714729]'
      : 'border-[#dbc6ae] bg-[#f2e5d4] text-[#634934] hover:bg-[#ead9c4]'
  }

  return active
    ? 'border-[#2c2017] bg-[#2c2017] text-[#f8f2e9] hover:bg-[#241a12]'
    : 'border-[#e0d3c3] bg-[#fffaf2] text-[#5d4b3b] hover:bg-[#f2e8db]'
}

export function TagFilter({ tags, selected, theme = 'focus' }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setTag(tag: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (tag) {
      params.set('tag', tag)
    } else {
      params.delete('tag')
    }
    params.delete('page')
    router.push('?' + params.toString())
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        aria-pressed={!selected}
        className={cn(
          badgeVariants({ variant: 'outline' }),
          'min-h-9 cursor-pointer px-3 py-1.5 text-[12px] font-medium',
          getTagClass(theme, !selected)
        )}
        onClick={() => setTag(null)}
      >
        全部
      </button>

      {tags.map(tag => (
        <button
          key={tag}
          type="button"
          aria-pressed={selected === tag}
          className={cn(
            badgeVariants({ variant: 'outline' }),
            'min-h-9 cursor-pointer px-3 py-1.5 text-[12px] font-medium',
            getTagClass(theme, selected === tag)
          )}
          onClick={() => setTag(tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  )
}
