const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md'
const PLAN = 'docs/agentteam方案书.md'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const REQUIRED_DOC_ITEMS = [
  'Slice 3 — Future Package / Install Layout Decision Matrix',
  'Slice 3 is docs/tests-only install layout decision matrix work',
  'Focused suite: `tests/suites/go-kernel-v0427-install-layout-matrix-docs.cjs`',
  'Candidate install layouts',
  'future platform companion package preferred path',
  'main package bundled fallback path',
  'unsupported os/arch/libc rows',
  'Package-relative installed metadata paths for future contract discussion only',
  'Resolver input expectations for future clean-install consumption',
  'Cleanup, upgrade, and stale-helper expectations',
  'Unsupported platform policy',
  'Package ownership decision boundary',
  'Slice 3 Validation Plan',
  'Proceed only with v0.4.27 Slice 3 docs/tests-only future package/install layout matrix review after leader/user approval',
]
const LAYOUT_ITEMS = [
  'node_modules/<future-companion>/native/tmuxSnapshotParse/<helperVersion>/<platform>/agentteam-tmuxSnapshotParse',
  'native/tmuxSnapshotParse/<helperVersion>/<platform>/agentteam-tmuxSnapshotParse',
  'no companion package metadata, optionalDependencies, package files, install, or publish approval',
  'no main package inclusion, no package files change, no generated artifacts checked in',
  'no installed path claim',
]
const PATH_ITEMS = [
  'helper path: `native/tmuxSnapshotParse/<helperVersion>/<platform>/agentteam-tmuxSnapshotParse` or `.exe` on Windows',
  'manifest path: `native/tmuxSnapshotParse/<helperVersion>/<platform>/manifest.json`',
  'checksum path: `native/tmuxSnapshotParse/<helperVersion>/<platform>/SHA256SUMS`',
  'provenance path: `native/tmuxSnapshotParse/<helperVersion>/<platform>/provenance.json`',
  'license path: `native/tmuxSnapshotParse/<helperVersion>/<platform>/LICENSE` or `license.json`',
  'package-relative paths are future contract examples only, not package files, not package metadata, not checked-in generated manifests, and not an install simulation',
]
const RESOLVER_ITEMS = [
  'manifest path and helper path are package-relative and traversal-safe',
  'checksum, provenance, and license paths are package-relative and traversal-safe',
  'platform tuple includes `os`, `arch`, and linux `libc` where applicable',
  '`module` and `capability` must match `tmuxSnapshotParse`',
  '`protocolVersion` must match the TS adapter protocol',
  '`helperVersion` must match the installed helper layout version',
  '`packageVersion` must match the consuming package version',
  'checksum, provenance, license, platform tuple, module, capability, protocol, helper version, and package version skew fail closed',
  'resolver input contract does not activate production default discovery in this slice',
]
const CLEANUP_ITEMS = [
  'new helper layout replaces old layout only after future package-owner approval',
  'stale helper layout fails closed and does not silently fall back to another helper',
  'stale manifest/checksum/provenance/license metadata fails closed',
  'helper/package version skew fails closed',
  'protocol skew fails closed',
  'platform skew fails closed',
  'cleanup and upgrade behavior remains future package-manager/package-owner work and is not simulated in Slice 3',
]
const UNSUPPORTED_ITEMS = [
  'unsupported os/arch/libc rows remain fail-closed',
  'unsupported rows do not prove normal-user availability',
  'unsupported rows do not permit default resolver activation, native/default cutover, package/native approval, or TypeScript fallback deletion',
  'support claims require future generated artifacts, package ownership, clean-install proof, diagnostics, and explicit approval',
]
const STOP_ITEMS = [
  'STOP for package.json metadata/files/optionalDependencies/scripts/version changes',
  'STOP for package manager install simulation',
  'STOP for npm tarball behavior',
  'STOP for npm pack/version/publish',
  'STOP for lifecycle hooks',
  'STOP for postinstall/download/install-time build',
  'STOP for native binaries',
  'STOP for tarballs',
  'STOP for generated manifests',
  'STOP for generated package artifacts',
  'STOP for go.mod/go.sum',
  'STOP for lockfiles',
  'STOP for production resolver implementation',
  'STOP for default discovery',
  'STOP for default modes changes',
  'STOP for current `go-cutover` behavior changes',
  'STOP for `go-packaged-preview` availability semantics changes',
  'STOP for TypeScript fallback deletion',
  'STOP for `/team readiness` expansion',
  'STOP for broadening Go authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
  'Slice 4 — Clean-Install Consumption Simulation',
  'Focused suite: `tests/suites/go-kernel-v0427-clean-install-consumption.cjs`',
  'Slice 5 — Resolver Discovery Contract Without Behavior Change',
  'Focused suite: `tests/suites/go-kernel-v0427-resolver-discovery-contract.cjs`',
  'Slice 6 — Failure Rollback No-Leak Hardening',
  'Focused suite: `tests/suites/go-kernel-v0427-consumption-failure-rollback-no-leak.cjs`',
  'Slice 7 — Package Native Guardrails and Readiness Containment',
  'Focused suite: `tests/suites/go-kernel-v0427-package-native-guardrails.cjs`',
  'Slice 8 — Final Checkpoint',
  'Final checkpoint doc: `docs/perf/v0.4.27-generated-artifact-clean-install-consumption-checkpoint.md`',
  'Focused suite: `tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs`',
]
const FORBIDDEN_DOC = [
  'companion package is approved',
  'main package inclusion is approved',
  'optionalDependencies are approved',
  'package files are changed',
  'package metadata is approved',
  'package manager install simulation is added',
  'npm tarball behavior is implemented',
  'normal-user availability is proven',
  'normal-user native availability is proven',
  'native/default cutover is approved',
  'fallback deletion is approved',
  'Go is default',
  'native Go pi extension is assumed',
  'broader Go authority is approved',
]
const PLATFORM_ROWS = [
  { target: 'linux-x64-glibc', os: 'linux', arch: 'x64', libc: 'glibc', supported: true },
  { target: 'linux-arm64-glibc', os: 'linux', arch: 'arm64', libc: 'glibc', supported: true },
  { target: 'darwin-arm64', os: 'darwin', arch: 'arm64', libc: undefined, supported: true },
  { target: 'darwin-x64', os: 'darwin', arch: 'x64', libc: undefined, supported: true },
  { target: 'win32-x64', os: 'win32', arch: 'x64', libc: undefined, supported: true },
  { target: 'linux-x64-musl', os: 'linux', arch: 'x64', libc: 'musl', supported: false },
  { target: 'win32-arm64', os: 'win32', arch: 'arm64', libc: undefined, supported: false },
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} should match ${pattern}`)
}

function packageRelativeLayoutPath(kind, helperVersion, target, win32 = false) {
  const fileByKind = {
    helper: `agentteam-tmuxSnapshotParse${win32 ? '.exe' : ''}`,
    manifest: 'manifest.json',
    checksum: 'SHA256SUMS',
    provenance: 'provenance.json',
    license: 'LICENSE',
  }
  return `native/${MODULE}/${helperVersion}/${target}/${fileByKind[kind]}`
}

function isSafePackageRelativePath(value) {
  return typeof value === 'string'
    && value.startsWith(`native/${MODULE}/`)
    && !path.isAbsolute(value)
    && !value.includes('..')
    && !/[\\]/.test(value)
}

function validateResolverInputs(input) {
  if (!input.supported) return fail('unsupported_platform')
  const paths = [input.manifestPath, input.helperPath, input.checksumPath, input.provenancePath, input.licensePath]
  if (!paths.every(isSafePackageRelativePath)) return fail('unsafe_path')
  if (!input.os || !input.arch || (input.os === 'linux' && !input.libc)) return fail('unsupported_platform')
  if (input.module !== MODULE || input.capability !== MODULE) return fail('module_capability_skew')
  if (input.protocolVersion !== '1') return fail('protocol_skew')
  if (input.helperVersion !== '0.4.27-layout-fixture') return fail('version_skew')
  if (input.packageVersion !== PACKAGE_VERSION) return fail('version_skew')
  if (input.staleHelper || input.staleMetadata) return fail('stale_helper')
  return { status: 'available', resultMarker: 'layout-contract-only', releaseDecision: 'future-contract-only-not-install-proof' }
}

function fail(reason) {
  return {
    status: 'unavailable',
    resultMarker: 'fail-closed',
    reason,
    releaseDecision: 'stop-clean-install-consumption-default-native-fallback-approval',
  }
}

function buildResolverInput(row, overrides = {}) {
  const helperVersion = overrides.helperVersion || '0.4.27-layout-fixture'
  const win32 = row.os === 'win32'
  return {
    supported: row.supported,
    os: row.os,
    arch: row.arch,
    libc: row.libc,
    platform: row.target,
    module: MODULE,
    capability: MODULE,
    protocolVersion: '1',
    helperVersion,
    packageVersion: PACKAGE_VERSION,
    helperPath: packageRelativeLayoutPath('helper', helperVersion, row.target, win32),
    manifestPath: packageRelativeLayoutPath('manifest', helperVersion, row.target, win32),
    checksumPath: packageRelativeLayoutPath('checksum', helperVersion, row.target, win32),
    provenancePath: packageRelativeLayoutPath('provenance', helperVersion, row.target, win32),
    licensePath: packageRelativeLayoutPath('license', helperVersion, row.target, win32),
    ...overrides,
  }
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

function assertRepoArtifactSanity(root) {
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|clean-install-consumption-manifest|artifact-bundle-manifest|install-layout-manifest|generated-package-manifest)\.(?:json|jsonc|yaml|yml|jsonl)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated manifest/package artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include unapproved native/helper/generated outputs')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    assert.equal(/go\s+(?:build|install)\b/.test(command), false, `${name} must not build/install helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not download/build native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
}

module.exports = {
  name: 'Go kernel v0.4.27 install layout matrix docs',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = read(root, DOC)
    const plan = read(root, PLAN)

    for (const expected of REQUIRED_DOC_ITEMS) assertIncludes(doc, expected, 'install layout doc')
    for (const expected of LAYOUT_ITEMS) assertIncludes(doc, expected, 'candidate layout')
    for (const expected of PATH_ITEMS) assertIncludes(doc, expected, 'package-relative path')
    for (const expected of RESOLVER_ITEMS) assertIncludes(doc, expected, 'resolver expectation')
    for (const expected of CLEANUP_ITEMS) assertIncludes(doc, expected, 'cleanup/upgrade expectation')
    for (const expected of UNSUPPORTED_ITEMS) assertIncludes(doc, expected, 'unsupported platform policy')
    for (const expected of STOP_ITEMS) assertIncludes(doc, expected, 'STOP gate')
    for (const forbidden of FORBIDDEN_DOC) assert.equal(doc.includes(forbidden), false, `doc must not imply forbidden policy: ${forbidden}`)

    assertIncludes(plan, DOC, 'roadmap should reference v0.4.27 doc')
    assertIncludes(plan, 'tests/suites/go-kernel-v0427-install-layout-matrix-docs.cjs', 'roadmap should reference Slice 3 guard')
    assertMatches(doc, /^## Slice 3 — Future Package \/ Install Layout Decision Matrix$/m, 'approved Slice 3 section should be present')
    assertMatches(doc, /^## Slice 4 — Clean-Install Consumption Simulation$/m, 'approved Slice 4 section should be present')
    assertMatches(doc, /^## Slice 5 — Resolver Discovery Contract Without Behavior Change$/m, 'approved Slice 5 section should be present')
    assertMatches(doc, /^## Slice 6 — Failure Rollback No-Leak Hardening$/m, 'approved Slice 6 section should be present')
    assertMatches(doc, /^## Slice 7 — Package Native Guardrails and Readiness Containment$/m, 'approved Slice 7 section should be present')
    assertMatches(doc, /^## Slice 8 — Final Checkpoint$/m, 'approved Slice 8 final checkpoint section should be present')
    assert.equal(/^## v0\.4\.28\b/im.test(doc), false, 'Slice 3 guard must not allow v0.4.28 implementation')
    assert.equal(/^### v0\.4\.28\b/im.test(plan), false, 'roadmap must not start v0.4.28 implementation')

    for (const row of PLATFORM_ROWS) {
      const result = validateResolverInputs(buildResolverInput(row))
      if (row.supported) assert.equal(result.status, 'available', `${row.target} candidate contract should be available`)
      else {
        assert.equal(result.status, 'unavailable', `${row.target} unsupported row should fail closed`)
        assert.equal(result.reason, 'unsupported_platform')
      }
    }

    for (const [label, overrides, reason] of [
      ['absolute helper path', { helperPath: path.resolve(root, 'native/tmuxSnapshotParse/helper') }, 'unsafe_path'],
      ['path traversal', { manifestPath: '../native/tmuxSnapshotParse/manifest.json' }, 'unsafe_path'],
      ['missing linux libc', { libc: undefined }, 'unsupported_platform'],
      ['wrong module', { module: 'compactReadModelFingerprint' }, 'module_capability_skew'],
      ['wrong capability', { capability: 'compactReadModelFingerprint' }, 'module_capability_skew'],
      ['wrong protocol', { protocolVersion: '2' }, 'protocol_skew'],
      ['wrong helper version', { helperVersion: 'stale-helper' }, 'version_skew'],
      ['wrong package version', { packageVersion: '0.0.0' }, 'version_skew'],
      ['stale helper', { staleHelper: true }, 'stale_helper'],
      ['stale metadata', { staleMetadata: true }, 'stale_helper'],
    ]) {
      const result = validateResolverInputs(buildResolverInput(PLATFORM_ROWS[0], overrides))
      assert.equal(result.status, 'unavailable', `${label} should fail closed`)
      assert.equal(result.reason, reason, `${label} should use compact reason`)
    }

    assertPackageNativeSanity(root)
    assertRepoArtifactSanity(root)
  },
}
