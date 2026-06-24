#!/usr/bin/env node
const { runHarness } = require('./lib/v0642-data-change-render-debounce-harness.cjs')

function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      index += 1
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`)
      return argv[index]
    }
    if (arg === '--home') options.home = next()
    else if (arg === '--out') options.out = next()
    else if (arg === '--warmup') options.warmup = next()
    else if (arg === '--measured') options.measured = next()
    else if (arg === '--burst-changes') options.burstChanges = next()
    else if (arg === '--debounce-ms') options.debounceMs = next()
    else if (arg === '--settle-ms') options.settleMs = next()
    else if (arg === '--keep-home') options.cleanup = false
    else if (arg === '--allow-non-empty-home') options.allowNonEmptyHome = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function printHelp() {
  console.log(`Usage: node scripts/verify-v0642-data-change-render-debounce.cjs [options]

Options:
  --home <path>             Clean temp PI_AGENTTEAM_HOME. Defaults to /tmp/pi-agentteam-v0642-data-change-render-debounce.*
  --out <path>              Sanitized timing JSON output path under /tmp.
  --warmup <n>              Warmup semantic data-change bursts. Default: 1.
  --measured <n>            Measured semantic data-change bursts. Default: 5.
  --burst-changes <n>       Semantic changes per measured burst. Default: 8.
  --debounce-ms <n>         Configured ui.teamPanel.minRefreshMs. Default: 250.
  --settle-ms <n>           Wait after each burst. Default: max(320, debounce+70).
  --keep-home               Keep the temporary home for local inspection.
  --allow-non-empty-home    Allow a non-empty --home. Unsafe for gate evidence.
  --help                    Show this help.
`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }
  const summary = await runHarness(options)
  console.log(JSON.stringify(summary, null, 2))
  if (!summary.ok) process.exitCode = 1
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
