import { z } from 'zod'

const ProviderSchema = z
  .enum([
    'social-x',
    'public-reader',
    'browser-session',
    'rendered-page',
    'html-fallback',
  ])
  .optional()

export const CreateImportJobSchema = z.object({
  url: z.string().url('请输入有效链接'),
  entryPoint: z.enum(['frontstage', 'admin']).default('frontstage'),
  preferredMode: z.enum(['auto', 'static', 'browser']).default('auto'),
  forceProvider: ProviderSchema,
  autoCreate: z.boolean().optional(),
})

export const RetryImportJobSchema = z.object({
  preferredMode: z.enum(['auto', 'static', 'browser']).optional(),
  forceProvider: ProviderSchema,
  autoCreate: z.boolean().optional(),
})
