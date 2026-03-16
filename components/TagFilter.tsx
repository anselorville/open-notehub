'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'

interface Props {
  tags: string[]
  selected?: string
}

export function TagFilter({ tags, selected }: Props) {
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
      <Badge
        variant={!selected ? 'default' : 'outline'}
        className="cursor-pointer"
        onClick={() => setTag(null)}
      >
        全部
      </Badge>
      {tags.map(tag => (
        <Badge
          key={tag}
          variant={selected === tag ? 'default' : 'outline'}
          className="cursor-pointer"
          onClick={() => setTag(tag)}
        >
          {tag}
        </Badge>
      ))}
    </div>
  )
}
