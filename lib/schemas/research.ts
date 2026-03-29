import { z } from 'zod'

export const ResearchRequestSchema = z.object({
  q: z.string().trim().min(2, '请输入至少两个字符的问题'),
  scope: z.enum(['library', 'hybrid']).default('hybrid'),
})
