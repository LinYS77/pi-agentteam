const assert = require('node:assert/strict')
const cp = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  REQUIRED_INSTALLED_FILES,
  runCleanInstallProof,
} = require('../../scripts/lib/go-helper-clean-install-proof.cjs')

const CLI = 'scripts/verify-go-helper-clean-install-proof.cjs'
const DOC = 'docs/perf/v0.6.33-clean-install-native-helper-consumption.md'
const FORBIDDEN_SUMMARY_PHRASES = [
  'normal-user native availability is proven',
  'real package-manager native delivery is complete',
  'package-manager clean-install proof is complete',
  'default Go is enabled',
  'default resolver is enabled',
  'fallback deletion is approved',
  'release asset is approved',
  'install source is approved',
  'package artifact is approved',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel))
}

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function assertNoTextLeaks(value, roots) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'summary must not leak absolute temp/repo roots')
  }
  assert.equal(text.includes(process.cwd()), false, 'summary must not leak process cwd')
  assert.equal(/npm notice|npm ERR!|added \d+ packages|audited \d+ packages|\.tgz|agentteam-v0633-pack-|agentteam-v0633-install-|node_modules\/pi-agentteam|package\/index\.ts|stack|Error:|AssertionError|\bat\s+/i.test(text), false, 'summary must not leak raw npm output, tarball paths, package listings, or stack traces')
}

function assertNonAvailabilitySummary(summary) {
  assert.equal(summary.ok, true)
  assert.equal(summary.reviewOnly, true)
  assert.equal(summary.prototype, true)
  assert.equal(summary.nonAvailability, true)
  assert.equal(summary.normalUserAvailability, false)
  assert.equal(summary.nativePackageDelivery, false)
  assert.equal(summary.releaseAsset, false)
  assert.equal(summary.installSource, false)
  assert.equal(summary.packageArtifact, false)
  assert.equal(summary.defaultResolverChanged, false)
  assert.equal(summary.defaultGoChanged, false)
  assert.equal(summary.fallbackDeletionApproved, false)
  assert.equal(summary.package.name, PACKAGE_NAME)
  assert.equal(summary.package.version, PACKAGE_VERSION)
  assert.equal(summary.package.tsPiFacade, true)
  assert.equal(summary.package.nativeMetadata, false)
  assert.equal(summary.package.lifecycleHooks, false)
  assert.equal(summary.package.unsafeScripts, false)
  for (const forbidden of FORBIDDEN_SUMMARY_PHRASES) assert.equal(JSON.stringify(summary).includes(forbidden), false, `summary must not overclaim: ${forbidden}`)
}

function assertInstalledSummary(summary) {
  assert.equal(summary.status, 'verified')
  assert.equal(summary.resultMarker, 'clean-ts-package-install-baseline')
  assert.equal(summary.proofKind, 'temp-npm-pack-install-baseline')
  assert.equal(summary.npm.pack.ran, true)
  assert.equal(summary.npm.pack.localTempTarball, true)
  assert.equal(summary.npm.pack.scriptsIgnored, true)
  assert.equal(summary.npm.install.ran, true)
  assert.equal(summary.npm.install.localTempTarball, true)
  assert.equal(summary.npm.install.scriptsIgnored, true)
  assert.equal(summary.npm.install.packageLockDisabled, true)
  assert.equal(summary.npm.install.legacyPeerDeps, true)
  assert.equal(summary.npm.install.auditDisabled, true)
  assert.equal(summary.npm.install.fundDisabled, true)
  assert.equal(summary.installedPackage.name, PACKAGE_NAME)
  assert.equal(summary.installedPackage.version, PACKAGE_VERSION)
  assert.equal(summary.installedPackage.rootKind, 'os-temp-project-node_modules-package')
  assert.equal(summary.installedPackage.requiredFilesPresent, true)
  assert.deepEqual(summary.installedPackage.requiredFiles, REQUIRED_INSTALLED_FILES)
  assert.equal(summary.installedPackage.nativeHelperLayoutPresent, true)
  assert.equal(summary.installedPackage.generatedArtifactsPresent, false)
  assert.equal(summary.installedPackage.lockfilesPresent, false)
  assert.equal(summary.installedPackage.nativeArchivesOrBinariesPresent, false)
  assert.equal(summary.installedPackage.packageJsonNativeMetadata, false)
  assert.equal(summary.installedPackage.packageJsonLifecycleHooks, false)
  assert.equal(summary.installedPackage.packageJsonUnsafeScripts, false)
  assert.equal(summary.cleanup.defaultCleanup, true)
  assert.equal(summary.cleanup.cleaned, true)
  assert.equal(summary.cleanup.kept, false)
  assert.equal(summary.cleanup.pathsRedacted, true)
}

function assertPackageMetadata(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, PACKAGE_NAME)
  assert.equal(packageJson.version, PACKAGE_VERSION)
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define ${key}`)
  }
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|hosted-observation|record|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include unapproved native/helper/generated artifacts')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+(?:publish|version)\b/.test(command), false, `${name} must not publish/version package`)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild|postinstall/i.test(command), false, `${name} must not build/download native helper`)
  }
}

function assertRepoNoForbiddenFiles(root) {
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain npm pack tarballs')

  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|manifest|license|workflow-summary|verifier-output|hosted-observation-record|workflow-run|raw-payload|api-payload)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|md)$/i
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => !rel.startsWith('scripts/lib/go-helper-hosted-observation-record.cjs'))
    .filter(rel => !rel.startsWith('scripts/verify-go-helper-hosted-observation-record.cjs'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated/hosted/native artifacts or raw records')
}

function assertDocSlice2(root) {
  const doc = read(root, DOC)
  for (const expected of [
    'Slice 2 — Temp NPM Clean-Install Baseline Evidence',
    '`scripts/lib/go-helper-clean-install-proof.cjs`',
    '`scripts/verify-go-helper-clean-install-proof.cjs`',
    '`tests/suites/go-kernel-v0633-package-manager-clean-install-baseline.cjs`',
    '`npm pack <repo-root> --ignore-scripts --pack-destination <temp>`',
    '`npm install <local temp tarball> --ignore-scripts --package-lock=false --legacy-peer-deps --no-audit --no-fund`',
    'The JSON summary is redacted and carries `reviewOnly: true`, `prototype: true`, `nonAvailability: true`, `normalUserAvailability: false`, and `nativePackageDelivery: false`.',
    'Slice 2 remains a clean TypeScript/pi facade package install baseline only.',
    'It does not consume a verified helper, inject an installed native layout, prove real package-manager native delivery, approve install source behavior, or change default resolver/runtime behavior.',
  ]) {
    assert.ok(doc.includes(expected), `${DOC} should include ${expected}`)
  }
}

function assertCli(root) {
  const result = cp.spawnSync(process.execPath, [CLI, '--repo-root', root, '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  })
  assert.equal(result.status, 0, `CLI clean-install proof should pass\nstdout=${result.stdout}\nstderr=${result.stderr}`)
  assert.equal(result.stderr, '', 'CLI should not emit stderr on success')
  const summary = JSON.parse(result.stdout)
  assertNonAvailabilitySummary(summary)
  assertInstalledSummary(summary)
  assertNoTextLeaks(summary, [root])
  assertNoTextLeaks(result.stdout, [root])
  return summary
}

module.exports = {
  name: 'Go kernel v0.6.33 package-manager clean-install baseline',
  async run(env) {
    const root = env.helpers.extRoot
    assertPackageMetadata(root)
    assertRepoNoForbiddenFiles(root)
    assertDocSlice2(root)

    const dry = runCleanInstallProof({ repoRoot: root, dryRun: true })
    assert.equal(dry.status, 'dry-run-contract-only')
    assert.equal(dry.npm.pack.ran, false)
    assert.equal(dry.npm.install.ran, false)
    assertNonAvailabilitySummary(dry)
    assertNoTextLeaks(dry, [root])

    const tempRoots = []
    const real = runCleanInstallProof({
      repoRoot: root,
      onTempRoots(roots) {
        tempRoots.push(roots.packRoot, roots.installProjectRoot)
      },
    })
    assertNonAvailabilitySummary(real)
    assertInstalledSummary(real)
    assertNoTextLeaks(real, [root, ...tempRoots])
    for (const tempRoot of tempRoots) assert.equal(fs.existsSync(tempRoot), false, `temp root should be cleaned: ${tempRoot}`)

    const cliSummary = assertCli(root)
    assert.equal(cliSummary.installedPackage.fileCount, real.installedPackage.fileCount)

    assertPackageMetadata(root)
    assertRepoNoForbiddenFiles(root)
  },
}
