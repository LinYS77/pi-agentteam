#!/usr/bin/env node
const path = require('node:path')
const {
  createFailClosedV0647DefaultGoDryRunSummary,
  formatV0647DefaultGoDryRunText,
  verifyV0647DefaultGoDryRun,
} = require('./lib/v0647-default-go-dry-run-harness.cjs')

function usage() {
  return [
    'Usage: node scripts/verify-v0647-default-go-dry-run.cjs [--repo-root <path>] [--json]',
    '',
    'Runs the v0.6.47 non-mutating default-Go dry-run verifier for tmuxSnapshotParse.',
    'The verifier builds temp-only reviewer helper/package-preview fixtures and does not change product defaults.',
  ].join('\n')
}

function parseArgs(argv) {
  const args = { json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') {
      args.json = true
      continue
    }
    if (arg === '--repo-root') {
      const value = argv[i + 1]
      if (!value) throw new Error('--repo-root requires a path')
      args.repoRoot = path.resolve(value)
      i += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true
      continue
    }
    throw new Error(`unknown argument ${arg}`)
  }
  return args
}

function printSummary(summary, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    return
  }
  process.stdout.write(formatV0647DefaultGoDryRunText(summary))
}

function main() {
  const wantsJson = process.argv.slice(2).includes('--json')
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    const summary = createFailClosedV0647DefaultGoDryRunSummary('unexpected-error', error.message)
    if (wantsJson) printSummary(summary, true)
    else process.stderr.write(`${error.message}\n\n${usage()}\n`)
    process.exitCode = 2
    return
  }

  if (args.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }

  const summary = verifyV0647DefaultGoDryRun({ repoRoot: args.repoRoot })
  printSummary(summary, args.json)
  if (!summary.ok) process.exitCode = 1
}

main()
