import {
  addCheck,
  createReport,
  finishReport,
  isMain,
  loadLocalEnv,
  maskSecret,
  printReport,
  requiredKeys,
  runCheck,
  wantsJson,
} from './_shared'
import { search } from '../../lib/search/anspire'

export async function runSearchValidation(): Promise<ReturnType<typeof finishReport>> {
  loadLocalEnv()
  const report = createReport('search')
  const missing = requiredKeys('ANSPIRE_API_KEY')

  if (missing.length > 0) {
    addCheck(report, {
      id: 'search.config',
      layer: 'config',
      status: 'fail',
      summary: 'Search env is incomplete',
      detail: `Missing: ${missing.join(', ')}`,
    })
    return finishReport(report)
  }

  addCheck(report, {
    id: 'search.config',
    layer: 'config',
    status: 'pass',
    summary: 'Search env is present',
    data: {
      ANSPIRE_API_KEY: maskSecret(process.env.ANSPIRE_API_KEY),
    },
  })

  await runCheck(report, {
    id: 'search.provider.health',
    layer: 'provider_access',
    summary: 'Live Anspire query returns at least one result',
    check: async () => {
      const results = await search('OpenAI latest model', 3)
      if (results.length === 0) {
        throw new Error('search returned zero results')
      }
      return {
        count: results.length,
        firstTitle: results[0]?.title ?? null,
      }
    },
  })

  return finishReport(report)
}

async function main(): Promise<void> {
  const report = await runSearchValidation()
  printReport(report, wantsJson())
  process.exitCode = report.checks.some((check) => check.status === 'fail') ? 1 : 0
}

if (isMain(import.meta.url)) {
  void main()
}
