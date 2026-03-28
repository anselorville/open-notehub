import { z } from 'zod'

export const CreateDocumentSchema = z.object({
  title:       z.string().min(1, 'Title is required').max(500),
  content:     z.string().min(1, 'Content is required').max(1_000_000),
  source_url:  z.string().url('Must be a valid URL').optional().or(z.literal('')),
  source_type: z.enum(['blog', 'paper', 'social', 'video', 'other']).default('blog'),
  tags:        z.array(z.string().max(50)).max(20).default([]),
  summary:     z.string().max(500).optional(),
  agent_id:    z.string().max(64).default('default'),
})

export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>
