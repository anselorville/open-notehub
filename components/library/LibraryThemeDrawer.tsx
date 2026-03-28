'use client'

import { Check, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { LIBRARY_THEME_META, LIBRARY_THEME_ORDER, type LibraryTheme } from '@/lib/library-theme'
import { useLibraryTheme } from '@/components/library/LibraryThemeContext'

function getCardClass(theme: LibraryTheme, selected: boolean) {
  if (theme === 'editorial') {
    return selected
      ? 'border-[#8f6640] bg-[#f4e7d5] shadow-[0_20px_40px_rgba(95,66,28,0.12)]'
      : 'border-[#dbc6ae] bg-[#fbf2e6] hover:border-[#c8aa89] hover:bg-[#f6eadc]'
  }

  return selected
    ? 'border-[#2c2017] bg-[#fffaf4] shadow-[0_20px_40px_rgba(84,61,36,0.1)]'
    : 'border-[#e3d7c8] bg-[#fffdf9] hover:border-[#d3c4b2] hover:bg-[#fbf6ef]'
}

export function LibraryThemeDrawer() {
  const { ready, theme, setTheme } = useLibraryTheme()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-full border-[#ddd0bf] bg-[#fffaf2] px-4 text-[#5f4b37] hover:border-[#ccb79d] hover:bg-[#f4ebde] hover:text-[#2d2218] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
        >
          <Palette className="mr-2 h-4 w-4" aria-hidden="true" />
          视图
        </Button>
      </DialogTrigger>

      <DialogContent
        variant="sheet"
        className="max-w-[420px] border-l border-[#dfd2c3] bg-[#fcf7ef] p-0 text-[#251c14] dark:border-zinc-800 dark:bg-[#14110f] dark:text-zinc-50"
      >
        <div className="flex h-full flex-col px-6 pb-6 pt-12">
          <DialogHeader className="text-left">
            <DialogTitle className="text-2xl font-semibold tracking-tight">切换文库浏览模式</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-[#6f5e4d] dark:text-zinc-400">
              只影响文库首页和列表页的浏览方式，不改变文章页与智读页。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-3">
            {LIBRARY_THEME_ORDER.map(themeKey => {
              const selected = themeKey === theme
              const meta = LIBRARY_THEME_META[themeKey]

              return (
                <DialogClose asChild key={themeKey}>
                  <button
                    type="button"
                    onClick={() => setTheme(themeKey)}
                    className={cn(
                      'w-full rounded-[26px] border p-4 text-left transition-all duration-200',
                      getCardClass(themeKey, selected)
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.22em] text-[#8c7760] dark:text-zinc-500">
                          {meta.accent}
                        </div>
                        <div className="mt-2 text-2xl font-semibold tracking-tight">{meta.label}</div>
                        <p className="mt-2 text-sm leading-6 text-[#6e5c4a] dark:text-zinc-400">
                          {meta.description}
                        </p>
                      </div>
                      <div
                        className={cn(
                          'mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                          selected
                            ? 'border-[#2c2017] bg-[#2c2017] text-[#f9f2e8] dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                            : 'border-[#d7c7b6] bg-white text-transparent dark:border-zinc-700 dark:bg-zinc-900'
                        )}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </div>
                    </div>

                    <div
                      className={cn(
                        'mt-4 rounded-full px-3 py-1 text-xs font-medium',
                        themeKey === 'editorial'
                          ? 'bg-[#ead7c0] text-[#6a4d31] dark:bg-zinc-800 dark:text-zinc-300'
                          : 'bg-[#f3ece2] text-[#5d4a38] dark:bg-zinc-800 dark:text-zinc-300'
                      )}
                    >
                      {selected ? '当前使用中' : ready ? '点按立即切换' : '读取设置中'}
                    </div>
                  </button>
                </DialogClose>
              )
            })}
          </div>

          <div className="mt-auto rounded-[24px] border border-dashed border-[#dcccb9] bg-[#fffaf3] p-4 text-sm leading-6 text-[#746250] dark:border-zinc-800 dark:bg-[#191512] dark:text-zinc-400">
            后续可以继续加入新的浏览模式，例如时间轴、专题精选或导入工作区，而不必重做这套抽屉结构。
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
