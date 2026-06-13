const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.6.29-real-go-helper-artifact-entry-checkpoint.md'
const PLAN = 'docs/agentteam方案书.md'
const PACKAGE_VERSION = '0.6.8'
const APPROVED_GO_BUILD_FILES = new Set([
  'scripts/build-go-helper-artifact.cjs',
  'scripts/lib/go-helper-artifact-builder.cjs',
  'tests/suites/go-kernel-v0629-helper-artifact-builder.cjs',
  'tests/suites/go-kernel-v0629-real-helper-artifact-build.cjs',
  'tests/suites/go-kernel-v0629-real-artifact-clean-install-preview.cjs',
])
const REQUIRED_V0629_FILES = [
  'scripts/lib/go-helper-artifact-builder.cjs',
  'scripts/build-go-helper-artifact.cjs',
  'tests/suites/go-kernel-v0629-helper-artifact-builder.cjs',
  'tests/suites/go-kernel-v0629-real-helper-artifact-build.cjs',
  'core/kernelPackagedResolver.ts',
  'tests/suites/go-kernel-v0629-packaged-manifest-resolver.cjs',
  'core/kernel.ts',
  'tests/suites/go-kernel-v0629-packaged-preview-manifest-integration.cjs',
  'tests/suites/go-kernel-v0629-real-artifact-clean-install-preview.cjs',
  'tests/suites/go-kernel-v0629-real-implementation-checkpoint-docs.cjs',
]
const REQUIRED_DOC_ITEMS = [
  'v0.6.29 Real Go Helper Artifact Entry Checkpoint',
  'checkpoint docs/tests/guard consolidation only',
  'Real local/reviewer-controlled helper artifact builder exists',
  '`scripts/lib/go-helper-artifact-builder.cjs`',
  '`scripts/build-go-helper-artifact.cjs`',
  'Real host-platform `GO111MODULE=off go build` evidence',
  'OS temp roots or ignored `.agentteam-artifacts/`',
  '`manifest.json`',
  '`SHA256SUMS`',
  '`provenance.json`',
  '`LICENSE`',
  '`license.json`',
  'placeholder-only `attestation.intoto.jsonl`',
  'Real JSON-RPC smoke covers `health` and `tmuxSnapshotParse`',
  'Pure explicit packaged manifest resolver exists in `core/kernelPackagedResolver.ts`',
  'Explicit `go-packaged-preview` manifest/root integration exists in `core/kernel.ts` only when explicit',
  '`PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT`',
  '`PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST`',
  'real artifact → temp installed layout → explicit manifest resolver → adapter `go-packaged-preview` parse',
  '`package.json` remains `0.6.8`',
  'No package metadata, package files, `optionalDependencies`, scripts, lifecycle hooks, postinstall, download, or install-time build path is added',
  'No `go.mod`, `go.sum`, npm lockfile, or shrinkwrap is added',
  'No checked-in native binaries, generated manifests, checksums, provenance, attestations, tarballs, or artifact bundles are added',
  'No CI workflow, upload, release asset, npm companion package, or main package native inclusion is added',
  'No default Go and no default resolver are enabled',
  'Default/unset, `disabled`, `typescript`, `go`, `auto`, and current `go-cutover` behavior remains unchanged',
  'TypeScript fallback is not deleted',
  '`compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
  'Go authority remains bounded to parser-only `tmuxSnapshotParse` preview path behind the TypeScript adapter/ports',
  'Go does not own tmux execution/capture',
  'Go does not own state writes',
  'Go does not own worker lifecycle',
  'Go does not own task/report governance',
  'Go does not own PlanRun',
  'Go does not own full-text boundaries',
  'Go does not own package/release authority',
  'Go does not own UI rendering',
  'Go does not own command control plane',
  '`/team readiness` is not expanded',
  'v0.6.29 does not prove normal-user native availability',
  'v0.6.29 does not prove real package-manager install availability',
  'cross-platform matrix evidence beyond the current host-platform build',
  'real package-manager install proof beyond temp installed layout preview',
  'normal-user native availability proof',
  'CI artifact storage and retention approval',
  'package metadata, release ownership, and npm/package inclusion approval',
  'default resolver/default Go proof and explicit approval',
  'fallback deletion approval and rollback/default-disable execution plan',
]
const REQUIRED_SUITE_NAMES = [
  'Go kernel v0.6.29 helper artifact builder',
  'Go kernel v0.6.29 real helper artifact build validation',
  'Go kernel v0.6.29 packaged manifest resolver',
  'Go kernel v0.6.29 packaged preview manifest integration',
  'Go kernel v0.6.29 real artifact clean-install preview smoke',
]
const FORBIDDEN_DOC_PHRASES = [
  'normal-user native availability is proven',
  'normal user native availability is proven',
  'real package-manager install is proven',
  'package metadata is approved',
  'package.json metadata is approved',
  'default Go is enabled',
  'default resolver is enabled',
  'TypeScript fallback is deleted',
  'fallback deletion is approved',
  'compactReadModelFingerprint is cut over',
  'npm publish is approved',
  'npm version is approved',
  'CI artifact upload is implemented',
  'release assets are implemented',
  'main package native inclusion is approved',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel))
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
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

function listGoBuildSourceFiles(root) {
  return walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('.git/'))
    .filter(rel => !rel.startsWith('node_modules/'))
    .filter(rel => /\.(?:ts|js|cjs|mjs|json|md|yml|yaml)$/.test(rel))
    .filter(rel => read(root, rel).includes('go build'))
}

function assertPackageJsonGuardrails(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package files must not include native/helper/generated outputs')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not run npm pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b/.test(command), false, `${name} must not build/install/module-manage helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild|postinstall/i.test(command), false, `${name} must not download/build native helper`)
  }
}

function assertNoLockfilesOrGoModules(root) {
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }
}

function assertNoGeneratedOrNativeOutputs(root) {
  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|clean-install-consumption-manifest|artifact-bundle-manifest|install-layout-manifest|consumption-failure-manifest|rollback-manifest|no-leak-manifest|generated-package-manifest|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|manifest|license)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated artifacts/manifests from v0.6.29 work')
}

function assertGitignoreAllowlist(root) {
  const gitignore = read(root, '.gitignore')
  assertIncludes(gitignore, '!docs/perf/v0.6.29-real-go-helper-artifact-entry-checkpoint.md', '.gitignore')
  assertIncludes(gitignore, '.agentteam-artifacts/', '.gitignore')
}

function assertGoBuildScope(root, doc) {
  const files = listGoBuildSourceFiles(root)
  const v0629Files = files.filter(rel => rel.includes('v0629') || rel.includes('v0.6.29') || rel.includes('go-helper-artifact-builder'))
  const unexpected = v0629Files.filter(rel => {
    if (APPROVED_GO_BUILD_FILES.has(rel)) return false
    if (rel === DOC) return false
    if (rel === 'docs/perf/v0.6.28-final-prep-and-v0.6.29-entry.md') return false
    if (rel === PLAN) return false
    if (rel === 'tests/suites/go-kernel-v0629-real-implementation-checkpoint-docs.cjs') return false
    return true
  })
  assert.deepEqual(unexpected, [], 'new v0.6.29 go build allowance must be scoped to approved utility/tests only')

  for (const rel of APPROVED_GO_BUILD_FILES) assert.equal(exists(root, rel), true, `${rel} should exist as an approved build/evidence surface`)
  const builderSource = read(root, 'scripts/lib/go-helper-artifact-builder.cjs')
  assert.ok(/spawnSync\('go', \['build', '-trimpath', '-o', helperPath, '\.'\]/.test(builderSource), 'builder library should contain the approved go build command')
  assertIncludes(builderSource, "GO111MODULE: 'off'", 'builder library')
  assert.equal(/go\s+build|\['go',\s*\['build'|GO111MODULE/.test(read(root, 'core/kernel.ts')), false, 'runtime kernel must not execute go build')
  assert.equal(/go\s+build/.test(read(root, 'package.json')), false, 'package scripts must not execute go build')
  assert.ok(doc.includes('`go build` remains forbidden in npm lifecycle hooks, package install, runtime resolver/default paths, package scripts, default user paths'), 'doc should keep go build forbidden outside approved scope')
}

function assertRuntimeBoundarySources(root) {
  const kernel = read(root, 'core/kernel.ts')
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel preview gate')
  assertIncludes(kernel, 'const packagedManifestPath = packagedPreviewRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure', 'kernel manifest path gate')
  assertIncludes(kernel, 'const packagedManifestInstallRoot = packagedPreviewRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure', 'kernel manifest root gate')
  assertIncludes(kernel, 'const packagedManifestRequested = packagedPreviewRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure', 'kernel manifest resolver gate')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'kernel read-model fallback')
  assert.equal(/child_process|spawnSync|execFileSync|execSync/.test(resolver), false, 'resolver must not spawn helper or shell')
  const importLines = resolver.split('\n').filter(line => /^\s*(?:import\b|const\s+\w+\s*=\s*require\()/.test(line)).join('\n')
  assert.equal(/tmux\/|state\/|mailbox|report|PlanRun|render|commands\//.test(importLines), false, 'resolver must not import business/runtime ownership')
}

module.exports = {
  name: 'Go kernel v0.6.29 real implementation checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    assert.equal(exists(root, DOC), true, `${DOC} should exist`)
    const doc = read(root, DOC)

    for (const rel of REQUIRED_V0629_FILES) assert.equal(exists(root, rel), true, `${rel} should exist`)
    for (const expected of REQUIRED_V0629_FILES) assertIncludes(doc, expected, 'v0.6.29 checkpoint doc')
    for (const expected of REQUIRED_DOC_ITEMS) assertIncludes(doc, expected, 'v0.6.29 checkpoint doc')
    for (const forbidden of FORBIDDEN_DOC_PHRASES) assert.equal(doc.includes(forbidden), false, `doc must not overclaim: ${forbidden}`)
    for (const suiteFile of REQUIRED_V0629_FILES.filter(rel => rel.startsWith('tests/suites/go-kernel-v0629-'))) {
      const suite = require(path.join(root, suiteFile))
      assert.ok(REQUIRED_SUITE_NAMES.includes(suite.name) || suite.name === 'Go kernel v0.6.29 real implementation checkpoint docs', `${suiteFile} should have expected suite name`)
      assertIncludes(doc, suiteFile, 'v0.6.29 checkpoint doc')
    }

    assertGitignoreAllowlist(root)
    assertPackageJsonGuardrails(root)
    assertNoLockfilesOrGoModules(root)
    assertNoGeneratedOrNativeOutputs(root)
    assertGoBuildScope(root, doc)
    assertRuntimeBoundarySources(root)
  },
}
