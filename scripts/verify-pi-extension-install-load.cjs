#!/usr/bin/env node
const path = require('node:path')
const {
  PiExtensionInstallLoadProofError,
  runPiExtensionInstallLoadProof,
} = require('./lib/pi-extension-install-load-proof.cjs')

function parseArgs(argv) {
  const options = {
    json: false,
    keepTemp: false,
    repoRoot: path.resolve(__dirname, '..'),
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') {
      options.json = true
      continue
    }
    if (arg === '--keep-temp') {
      options.keepTemp = true
      continue
    }
    if (arg === '--repo-root') {
      const value = argv[index + 1]
      if (!value) throw new Error('--repo-root requires a value')
      options.repoRoot = path.resolve(value)
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${arg}`)
  }
  return options
}

function printHuman(summary) {
  if (summary.ok) {
    console.log(`${summary.resultMarker}: ${summary.status}`)
    console.log(`piExtensionFacadeLoad=${summary.piExtensionFacadeLoad}`)
    console.log(`commands=${summary.registeredSurface.commands.join(',')}`)
    console.log(`tools=${summary.registeredSurface.tools.join(',')}`)
    console.log(`cleanup.cleaned=${summary.cleanup.cleaned}`)
    return
  }
  console.error(`${summary.resultMarker}: ${summary.failureKind}`)
  console.error(`${summary.remediation} (${summary.hint})`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  try {
    const summary = await runPiExtensionInstallLoadProof(options)
    if (options.json) console.log(JSON.stringify(summary, null, 2))
    else printHuman(summary)
  } catch (error) {
    const diagnostic = error instanceof PiExtensionInstallLoadProofError
      ? error.toDiagnostic()
      : {
          ok: false,
          status: 'unavailable',
          resultMarker: 'fail-closed',
          failureKind: 'installed-code-load-failed',
          remediation: 'rerun pi extension facade load proof and inspect compact failure kind',
          hint: 'unexpected',
          reviewOnly: true,
          prototype: true,
          piExtensionFacadeLoad: false,
          nativePackageDelivery: false,
          normalUserNativeAvailability: false,
          defaultGo: false,
          fallbackDeletion: false,
          pathsRedacted: true,
          rawNpmOutputIncluded: false,
          stackIncluded: false,
        }
    if (options.json) console.log(JSON.stringify(diagnostic, null, 2))
    else printHuman(diagnostic)
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
