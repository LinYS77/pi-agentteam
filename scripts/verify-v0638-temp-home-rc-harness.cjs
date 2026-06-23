#!/usr/bin/env node
const fs = require('node:fs')
const { DEFAULT_PREFIX, runHarness } = require('./lib/v0638-temp-home-rc-harness.cjs')

function parseArgs(argv) {
  const args = {
    cleanup: true,
    prefix: DEFAULT_PREFIX,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--home') {
      args.home = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--prefix') {
      args.prefix = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--keep-home') {
      args.cleanup = false
      continue
    }
    if (arg === '--allow-non-empty-home') {
      args.allowNonEmptyHome = true
      continue
    }
    if (arg === '--out') {
      args.out = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function usage() {
  return [
    'Usage: node scripts/verify-v0638-temp-home-rc-harness.cjs [--home /tmp/pi-agentteam-v0638-rc-harness.XXXXXX] [--keep-home] [--out /tmp/summary.json]',
    '',
    'Runs a non-interactive temp-home-bound AgentTeam RC harness with stubbed pi/tmux and real registered /team config + agentteam_* tool seams.',
    'The home must be under /tmp/pi-agentteam-v0638-rc-harness.* unless --prefix is provided by a test.',
    'Output is sanitized JSON only; no full mailbox/report bodies, worker transcripts, or state archives are emitted.',
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  const summary = await runHarness(args)
  const json = `${JSON.stringify(summary, null, 2)}\n`
  if (args.out) fs.writeFileSync(args.out, json, 'utf8')
  process.stdout.write(json)
  if (!summary.ok) process.exitCode = 1
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
