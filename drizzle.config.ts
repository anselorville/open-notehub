import type { Config } from 'drizzle-kit'

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  driver: 'libsql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./data/open-notehub.db',
  },
} satisfies Config
