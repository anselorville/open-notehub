export type LibraryTheme = 'focus' | 'editorial'
type LegacyLibraryTheme = 'airy' | 'magazine'

export const DEFAULT_LIBRARY_THEME: LibraryTheme = 'focus'
export const LIBRARY_THEME_STORAGE_KEY = 'open-notehub.library-theme'

export const LIBRARY_THEME_ORDER: LibraryTheme[] = ['focus', 'editorial']

export const LIBRARY_THEME_META: Record<
  LibraryTheme,
  {
    label: string
    description: string
    accent: string
  }
> = {
  focus: {
    label: '专注浏览',
    description: '更适合连续浏览、按标签筛选，以及稳定回看收录内容。',
    accent: '默认模式',
  },
  editorial: {
    label: '导读编排',
    description: '更强调标题、摘要与信息层级，适合快速扫视和挑选文章。',
    accent: '导读模式',
  },
}

export function isLibraryTheme(value: string | null | undefined): value is LibraryTheme {
  return value === 'focus' || value === 'editorial'
}

export function normalizeLibraryTheme(
  value: string | null | undefined
): LibraryTheme | null {
  if (isLibraryTheme(value)) {
    return value
  }

  const legacyThemeMap: Record<LegacyLibraryTheme, LibraryTheme> = {
    airy: 'focus',
    magazine: 'editorial',
  }

  return value && value in legacyThemeMap
    ? legacyThemeMap[value as LegacyLibraryTheme]
    : null
}
