import { z } from 'zod'

const EmailSchema = z.string().trim().toLowerCase().email('请输入有效邮箱')
const DisplayNameSchema = z
  .string()
  .trim()
  .min(1, '请输入名称')
  .max(80, '名称不能超过 80 个字符')
const PasswordSchema = z
  .string()
  .min(8, '密码至少需要 8 位')
  .max(128, '密码不能超过 128 位')

export const CreateUserSchema = z.object({
  email: EmailSchema,
  displayName: DisplayNameSchema.optional(),
  password: PasswordSchema,
  role: z.enum(['owner', 'editor']).default('editor'),
})

export const UpdateUserSchema = z.object({
  displayName: DisplayNameSchema.optional(),
  role: z.enum(['owner', 'editor']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  password: PasswordSchema.optional(),
})

export const CreateAgentSchema = z.object({
  name: z.string().trim().min(1, '请输入 agent 名称').max(80, '名称不能超过 80 个字符'),
  description: z.string().trim().max(240, '描述不能超过 240 个字符').optional(),
})

export const UpdateAgentSchema = z.object({
  name: z.string().trim().min(1, '请输入 agent 名称').max(80, '名称不能超过 80 个字符').optional(),
  description: z.string().trim().max(240, '描述不能超过 240 个字符').optional(),
  isActive: z.boolean().optional(),
  rotateKey: z.boolean().optional(),
})
