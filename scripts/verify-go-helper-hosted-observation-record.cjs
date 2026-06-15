#!/usr/bin/env node
const path = require('node:path')
const {
  HostedObservationRecordError,
  compactFailure,
  verifyHostedObservationRecordFile,
} = require('./lib/go-helper-hosted-observation-record.cjs')

function usage() {
  return [
    'Usage: node scripts/verify-go-helper-hosted-observation-record.cjs --record <path> [--json] [--allow-not-observed]',
    '',
    'Verifies a local minimal hosted workflow observation record.',
    'This command does not query GitHub, use gh, download artifacts, or validate release/package/default availability.',
  ].join('\n')
}

function parseArgs(argv) {
  const args = { json: false, allowNotObserved: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') {
      args.json = true
      continue
    }
    if (arg === '--allow-not-observed') {
      args.allowNotObserved = true
      continue
    }
    if (arg === '--record') {
      const value = argv[i + 1]
      if (!value) throw new Error('--record requires a path')
      args.recordPath = path.resolve(value)
      i += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true
      continue
    }
    throw new Error(`unknown argument ${arg}`)
  }
  if (!args.help && !args.recordPath) throw new Error('--record is required')
  return args
}

function printSummary(summary, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    return
  }
  process.stdout.write(`${summary.observation}\n`)
  process.stdout.write(`commit ${summary.commitSha}\n`)
  process.stdout.write(`target ${summary.target}\n`)
  process.stdout.write(`retentionDays ${summary.retentionDays}\n`)
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}\n`)
    process.exitCode = 2
    return
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }

  try {
    const result = verifyHostedObservationRecordFile({ recordPath: args.recordPath })
    if (!result.summary.observed && !args.allowNotObserved) {
      throw new HostedObservationRecordError(
        'record-observation-invalid',
        'pass --allow-not-observed only when preserving explicit local non-observation evidence',
        'not-observed-requires-flag',
      )
    }
    printSummary(result.summary, args.json)
  } catch (error) {
    if (error instanceof HostedObservationRecordError) {
      process.stderr.write(`${JSON.stringify(error.toDiagnostic())}\n`)
      process.exitCode = 1
      return
    }
    process.stderr.write(`${JSON.stringify(compactFailure('record-schema-invalid', 'inspect explicit record inputs and rerun', 'unexpected'))}\n`)
    process.exitCode = 1
  }
}

main()
