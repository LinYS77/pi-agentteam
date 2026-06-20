#!/usr/bin/env node
const path = require('node:path')
const {
  CleanInstallProofError,
  compactFailure,
  runCleanInstallProof,
  runInstalledLayoutConsumptionProof,
} = require('./lib/go-helper-clean-install-proof.cjs')

function usage() {
  return [
    'Usage: node scripts/verify-go-helper-clean-install-proof.cjs [--repo-root <path>] [--dry-run] [--keep-temp] [--json]',
    '       node scripts/verify-go-helper-clean-install-proof.cjs (--build-review-artifact|--artifact-root <path>) [--repo-root <path>] [--keep-temp] [--json]',
    '',
    'Runs the v0.6.33 temp npm clean-install baseline proof.',
    'With --build-review-artifact or --artifact-root, verifies a review artifact and proves explicit installed-layout go-packaged-preview consumption.',
    'All modes report review-only/non-availability evidence.',
  ].join('\n')
}

function parseArgs(argv) {
  const args = { json: false, dryRun: false, keepTemp: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') {
      args.json = true
      continue
    }
    if (arg === '--dry-run') {
      args.dryRun = true
      continue
    }
    if (arg === '--keep-temp') {
      args.keepTemp = true
      continue
    }
    if (arg === '--build-review-artifact') {
      args.buildReviewArtifact = true
      continue
    }
    if (arg === '--artifact-root') {
      const value = argv[i + 1]
      if (!value) throw new Error('--artifact-root requires a path')
      args.artifactRoot = path.resolve(value)
      i += 1
      continue
    }
    if (arg === '--repo-root' || arg === '--root') {
      const value = argv[i + 1]
      if (!value) throw new Error(`${arg} requires a path`)
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
  if (args.dryRun && (args.buildReviewArtifact || args.artifactRoot)) throw new Error('--dry-run cannot be combined with installed-layout artifact proof')
  if (args.buildReviewArtifact && args.artifactRoot) throw new Error('--build-review-artifact and --artifact-root are mutually exclusive')
  return args
}

function printSummary(summary, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    return
  }
  process.stdout.write(`${summary.resultMarker}: ${summary.status}\n`)
  process.stdout.write(`package ${summary.package.name}@${summary.package.version}\n`)
  process.stdout.write(`reviewOnly=${summary.reviewOnly} prototype=${summary.prototype} nonAvailability=${summary.nonAvailability}\n`)
  process.stdout.write(`cleanup cleaned=${summary.cleanup.cleaned} kept=${summary.cleanup.kept}\n`)
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
    const repoRoot = args.repoRoot || path.resolve(__dirname, '..')
    const summary = (args.buildReviewArtifact || args.artifactRoot)
      ? runInstalledLayoutConsumptionProof({
        repoRoot,
        buildReviewArtifact: args.buildReviewArtifact,
        artifactRoot: args.artifactRoot,
        keepTemp: args.keepTemp,
      })
      : runCleanInstallProof({
        repoRoot,
        dryRun: args.dryRun,
        keepTemp: args.keepTemp,
      })
    printSummary(summary, args.json)
  } catch (error) {
    if (error instanceof CleanInstallProofError) {
      process.stderr.write(`${JSON.stringify(error.toDiagnostic())}\n`)
      process.exitCode = 1
      return
    }
    process.stderr.write(`${JSON.stringify(compactFailure('installed-package-invalid', 'rerun clean-install proof with explicit repo root and npm available', 'unexpected'))}\n`)
    process.exitCode = 1
  }
}

main()
