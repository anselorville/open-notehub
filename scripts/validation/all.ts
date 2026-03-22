import { hasFailures, isMain, mergeReports, printReport, wantsJson } from './_shared'
import { runLlmValidation } from './llm'
import { runSearchValidation } from './search'
import { runSmartTranslateValidation } from './smart-translate'

export async function runInfrastructureValidation() {
  const reports = await Promise.all([
    runLlmValidation(),
    runSearchValidation(),
    runSmartTranslateValidation(),
  ])

  return mergeReports('infra', reports)
}

async function main(): Promise<void> {
  const report = await runInfrastructureValidation()
  printReport(report, wantsJson())
  process.exitCode = hasFailures(report) ? 1 : 0
}

if (isMain(import.meta.url)) {
  void main()
}
