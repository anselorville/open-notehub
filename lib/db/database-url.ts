import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_DB_BASENAME = 'open-notehub.db'
const LEGACY_DB_BASENAME = 'learnhub.db'

export const DEFAULT_DATABASE_URL = `file:./${DEFAULT_DB_BASENAME}`

function resolveLocalFilePath(databaseUrl: string) {
  if (!databaseUrl.startsWith('file:')) {
    return null
  }

  const rawPath = databaseUrl.slice('file:'.length)
  if (!rawPath) {
    return null
  }

  return path.isAbsolute(rawPath) ? path.normalize(rawPath) : path.resolve(process.cwd(), rawPath)
}

export function resolveDatabaseUrl(configuredUrl = process.env.DATABASE_URL) {
  const databaseUrl = configuredUrl ?? DEFAULT_DATABASE_URL
  const resolvedPath = resolveLocalFilePath(databaseUrl)

  if (!resolvedPath || path.basename(resolvedPath) !== DEFAULT_DB_BASENAME) {
    return databaseUrl
  }

  if (fs.existsSync(resolvedPath)) {
    return databaseUrl
  }

  const legacyPath = path.join(path.dirname(resolvedPath), LEGACY_DB_BASENAME)
  if (!fs.existsSync(legacyPath)) {
    return databaseUrl
  }

  return databaseUrl.replace(DEFAULT_DB_BASENAME, LEGACY_DB_BASENAME)
}
