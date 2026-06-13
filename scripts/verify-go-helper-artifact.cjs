#!/usr/bin/env node
const path = require('node:path')
const {
  GoHelperArtifactVerifierError,
  compactFailure,
  verifyGoHelperArtifact,
} = require('./lib/go-helper-artifact-verifier.cjs')

function usage() {
  return [
    'Usage: node scripts/verify-go-helper-artifact.cjs --artifact-root <path> [--artifact-index <relpath>] [--manifest <relpath>] [--expected-target <target>] [--expected-source-revision <sha>] [--expected-github-sha <sha>] [--expected-github-run-id <id>] [--json]',
    '',
    'Verifies a downloaded review-only Go helper artifact bundle.',
    'This is reviewer/CI transport validation, not runtime download or install-source behavior.',
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
    if (arg === '--artifact-root' || arg === '--root') {
      const value = argv[i + 1]
      if (!value) throw new Error(`${arg} requires a path`)
      args.artifactRoot = path.resolve(value)
      i += 1
      continue
    }
    if (arg === '--artifact-index') {
      const value = argv[i + 1]
      if (!value) throw new Error('--artifact-index requires a package-relative path')
      args.artifactIndexPath = value
      i += 1
      continue
    }
    if (arg === '--manifest') {
      const value = argv[i + 1]
      if (!value) throw new Error('--manifest requires a package-relative path')
      args.manifestPath = value
      i += 1
      continue
    }
    if (arg === '--expected-target') {
      const value = argv[i + 1]
      if (!value) throw new Error('--expected-target requires a target')
      args.expectedTarget = value
      i += 1
      continue
    }
    if (arg === '--expected-source-revision') {
      const value = argv[i + 1]
      if (!value) throw new Error('--expected-source-revision requires a sha')
      args.expectedSourceRevision = value
      i += 1
      continue
    }
    if (arg === '--expected-github-sha') {
      const value = argv[i + 1]
      if (!value) throw new Error('--expected-github-sha requires a sha')
      args.expectedGithubSha = value
      i += 1
      continue
    }
    if (arg === '--expected-github-run-id') {
      const value = argv[i + 1]
      if (!value) throw new Error('--expected-github-run-id requires an id')
      args.expectedGithubRunId = value
      i += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true
      continue
    }
    throw new Error(`unknown argument ${arg}`)
  }
  if (!args.help && !args.artifactRoot) throw new Error('--artifact-root is required')
  return args
}

function printSummary(summary, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    return
  }
  process.stdout.write(`verified ${summary.target}\n`)
  process.stdout.write(`artifactIndex ${summary.files.artifactIndex}\n`)
  process.stdout.write(`manifest ${summary.files.manifest}\n`)
  process.stdout.write(`helper ${summary.files.helper}\n`)
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
    const result = verifyGoHelperArtifact({ ...args, extRoot: path.resolve(__dirname, '..') })
    printSummary(result.summary, args.json)
  } catch (error) {
    if (error instanceof GoHelperArtifactVerifierError) {
      process.stderr.write(`${JSON.stringify(error.toDiagnostic())}\n`)
      process.exitCode = 1
      return
    }
    process.stderr.write(`${JSON.stringify(compactFailure('artifact-index-invalid', 'inspect explicit verifier inputs and rerun', 'unexpected'))}\n`)
    process.exitCode = 1
  }
}

main()
