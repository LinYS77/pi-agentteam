#!/usr/bin/env node
const path = require('node:path')
const {
  GoHelperArtifactBuilderError,
  buildGoHelperArtifact,
  compactFailure,
} = require('./lib/go-helper-artifact-builder.cjs')

function usage() {
  return [
    'Usage: node scripts/build-go-helper-artifact.cjs [--output-root <path>] [--artifact-index|--ci-review] [--json]',
    '',
    'Builds the local host Go helper artifact into OS temp by default.',
    '--artifact-index writes review/transport artifact-index.json metadata.',
    '--ci-review is shorthand for --artifact-index for GitHub Actions review artifacts.',
    'The only repo-local output root allowed is ignored .agentteam-artifacts/.',
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
    if (arg === '--artifact-index') {
      args.artifactIndex = true
      continue
    }
    if (arg === '--ci-review') {
      args.ciReview = true
      args.artifactIndex = true
      continue
    }
    if (arg === '--output-root') {
      const value = argv[i + 1]
      if (!value) throw new Error('--output-root requires a path')
      args.outputRoot = path.resolve(value)
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

function printSummary(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`)
    return
  }
  process.stdout.write(`built ${result.summary.artifact}\n`)
  process.stdout.write(`target ${result.summary.target}\n`)
  process.stdout.write(`helperVersion ${result.summary.helperVersion}\n`)
  process.stdout.write(`metadata ${result.summary.files.manifest}\n`)
  process.stdout.write(`checksums ${result.summary.files.checksums}\n`)
  if (result.summary.files.artifactIndex) process.stdout.write(`artifactIndex ${result.summary.files.artifactIndex}\n`)
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
    const result = buildGoHelperArtifact({
      extRoot: path.resolve(__dirname, '..'),
      outputRoot: args.outputRoot,
      artifactIndex: args.artifactIndex,
      ciReview: args.ciReview,
    })
    printSummary(result, args.json)
  } catch (error) {
    if (error instanceof GoHelperArtifactBuilderError) {
      process.stderr.write(`${JSON.stringify(error.toDiagnostic())}\n`)
      process.exitCode = 1
      return
    }
    process.stderr.write(`${JSON.stringify(compactFailure('metadata-invalid', 'inspect explicit builder inputs and rerun', 'unexpected'))}\n`)
    process.exitCode = 1
  }
}

main()
