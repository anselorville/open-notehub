import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_DB_DIRECTORY = 'data'
const DEFAULT_DB_BASENAME = 'open-notehub.db'
const LEGACY_DB_BASENAME = 'learnhub.db'
const DEFAULT_DB_RELATIVE_PATH = `./${DEFAULT_DB_DIRECTORY}/${DEFAULT_DB_BASENAME}`

export const DEFAULT_DATABASE_URL = `file:${DEFAULT_DB_RELATIVE_PATH}`

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

function ensureParentDirectory(localFilePath: string) {
  fs.mkdirSync(path.dirname(localFilePath), { recursive: true })
}

function hasUsableDatabaseFile(localFilePath: string) {
  if (!fs.existsSync(localFilePath)) {
    return false
  }

  const stats = fs.statSync(localFilePath)
  return stats.isFile() && stats.size > 0
}

function isDefaultLocalDatabasePath(localFilePath: string) {
  return path.normalize(localFilePath) === path.resolve(process.cwd(), DEFAULT_DB_RELATIVE_PATH)
}

function findLegacyDatabaseUrl() {
  const candidates = [
    `file:./${DEFAULT_DB_BASENAME}`,
    `file:./${LEGACY_DB_BASENAME}`,
  ]

  for (const candidate of candidates) {
    const candidatePath = resolveLocalFilePath(candidate)

    if (candidatePath && hasUsableDatabaseFile(candidatePath)) {
      return candidate
    }
  }

  return null
}

export function resolveDatabaseUrl(configuredUrl = process.env.DATABASE_URL) {
  const databaseUrl = configuredUrl ?? DEFAULT_DATABASE_URL
  const resolvedPath = resolveLocalFilePath(databaseUrl)

  if (!resolvedPath) {
    return databaseUrl
  }

  ensureParentDirectory(resolvedPath)

  if (configuredUrl || !isDefaultLocalDatabasePath(resolvedPath) || hasUsableDatabaseFile(resolvedPath)) {
    return databaseUrl
  }

  return findLegacyDatabaseUrl() ?? databaseUrl
}
