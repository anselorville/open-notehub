import { z } from 'zod'

const EmailSchema = z.string().trim().toLowerCase().email('请输入有效邮箱')
const PasswordSchema = z
  .string()
  .min(8, '密码至少需要 8 位')
  .max(128, '密码不能超过 128 位')

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, '请输入密码'),
})

export const BootstrapOwnerSchema = z
  .object({
    email: EmailSchema,
    displayName: z.string().trim().max(80, '名称不能超过 80 个字符').optional(),
    password: PasswordSchema,
    confirmPassword: PasswordSchema,
    setupCode: z.string().trim().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  })
