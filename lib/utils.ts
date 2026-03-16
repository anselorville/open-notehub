import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { v4 as uuidv4 } from 'uuid'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateId(): string {
  return uuidv4()
}

export function formatDate(ts: Date | number | string): string {
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function countWords(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[.*?\]\(.*?\)/g, ' ')
    .replace(/\[.*?\]\(.*?\)/g, ' ')
    .replace(/#{1,6}\s/g, ' ')
    .replace(/[*_~]{1,3}/g, ' ')
    .replace(/>\s/g, ' ')
    .replace(/-\s/g, ' ')
    .trim()

  const cjkMatches = text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g)
  const cjkCount = cjkMatches?.length ?? 0
  const withoutCjk = text.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ')
  const wordCount = withoutCjk.split(/\s+/).filter(Boolean).length
  return cjkCount + wordCount
}
