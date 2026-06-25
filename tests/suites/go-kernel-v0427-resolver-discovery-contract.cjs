const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md'
const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.4.27-discovery-fixture'
const PROTOCOL_VERSION = '1'
const TARGET = { target: 'linux-x64-glibc', os: 'linux', arch: 'x64', libc: 'glibc' }
const FAILURE_KINDS = new Set([
  'manifest_missing',
  'helper_missing',
  'invalid_path',
  'unsupported_platform',
  'integrity_mismatch',
  'provenance_mismatch',
  'license_mismatch',
  'version_skew',
  'protocol_skew',
  'capability_skew',
  'artifact_not_executable',
  'helper_smoke_failed',
])
const REQUIRED_DOC_ITEMS = [
  'Slice 5 — Resolver Discovery Contract Without Behavior Change',
  'Slice 5 is docs/tests-only resolver discovery contract work',
  'Focused suite: `tests/suites/go-kernel-v0427-resolver-discovery-contract.cjs`',
  'Future resolver inputs',
  'installed root',
  'package-relative manifest path',
  'package-relative helper path',
  'package-relative checksum path',
  'package-relative provenance path',
  'package-relative license path',
  'platform tuple: `os`, `arch`, and linux `libc` where applicable',
  '`module` = `tmuxSnapshotParse`',
  '`capability` includes `tmuxSnapshotParse`',
  '`protocolVersion` matches the TS adapter protocol',
  '`helperVersion` matches the installed layout metadata',
  '`packageVersion` matches the consuming package version',
  'Path rules',
  'Platform matching',
  'Precedence and behavior boundaries',
  'explicit helper path remains highest precedence',
  'simulated discovery is future-approved only',
  'current default/unset mode must not read packaged layout',
  'current disabled mode must not read packaged layout',
  'current typescript mode must not read packaged layout',
  'current go mode must not read packaged layout',
  'current auto mode must not read packaged layout',
  'current `go-cutover` must not read packaged layout',
  'current `go-packaged-preview` semantics remain unchanged',
  'Failure mapping for simulated future discovery',
  '`compactReadModelFingerprint` remains non-cutover / TypeScript fallback',
  '`tmuxSnapshotParse` remains the only cutover-owned candidate under discussion',
  'Go authority stays parser-only behind TS adapter/ports via subprocess/RPC/stdin-stdout',
  'Slice 5 Validation Plan',
  'Proceed only with v0.4.27 Slice 5 docs/tests-only resolver discovery contract review after leader/user approval',
]
const FAILURE_DOC_ITEMS = [
  'missing manifest',
  'missing helper',
  'invalid path',
  'unsupported platform',
  'checksum mismatch',
  'provenance mismatch or missing',
  'license mismatch or missing',
  'package/helper version skew',
  'protocol skew',
  'capability skew',
  'non-executable helper',
  'corrupt smoke output',
]
const STOP_ITEMS = [
  'STOP for production resolver implementation',
  'STOP for runtime discovery implementation',
  'STOP for default discovery',
  'STOP for packaged discovery activation in default/unset/disabled/typescript/go/auto/current `go-cutover`',
  'STOP for `go-packaged-preview` semantic changes',
  'STOP for helper path precedence changes',
  'STOP for default Go',
  'STOP for TypeScript fallback deletion',
  'STOP for hidden fallback rollback',
  'STOP for `/team readiness` expansion',
  'STOP for package metadata changes',
  'STOP for package files changes',
  'STOP for optionalDependencies',
  'STOP for package scripts',
  'STOP for lifecycle hooks',
  'STOP for build commands',
  'STOP for running `go build`',
  'STOP for CI workflow',
  'STOP for artifact upload',
  'STOP for release assets',
  'STOP for npm pack/version/publish',
  'STOP for native binaries',
  'STOP for tarballs',
  'STOP for generated artifacts checked into the repo',
  'STOP for generated manifests checked into the repo',
  'STOP for generated package artifacts',
  'STOP for broadening Go authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
  'Slice 6 — Failure Rollback No-Leak Hardening',
  'Focused suite: `tests/suites/go-kernel-v0427-consumption-failure-rollback-no-leak.cjs`',
  'Slice 7 — Package Native Guardrails and Readiness Containment',
  'Focused suite: `tests/suites/go-kernel-v0427-package-native-guardrails.cjs`',
  'Slice 8 — Final Checkpoint',
  'Final checkpoint doc: `docs/perf/v0.4.27-generated-artifact-clean-install-consumption-checkpoint.md`',
  'Focused suite: `tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs`',
]
const FORBIDDEN_DOC = [
  'production resolver is implemented',
  'runtime discovery is implemented',
  'default discovery is implemented',
  'packaged discovery is activated',
  'go-packaged-preview semantics changed',
  'explicit helper path precedence changed',
  'normal-user availability is proven',
  'native/default cutover is approved',
  'fallback deletion is approved',
  'Go is default',
  'package metadata is approved',
  'broader Go authority is approved',
]

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempRoot() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0427-discovery-'))
  assert.equal(path.dirname(tempRoot), os.tmpdir(), 'discovery root must be under OS tmpdir')
  return tempRoot
}

function compactFailure(failureKind, remediation, hint) {
  assert.ok(FAILURE_KINDS.has(failureKind), `unexpected failureKind ${failureKind}`)
  return {
    status: 'unavailable',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'fail-closed',
    failureKind,
    remediation,
    hint,
    releaseDecision: 'stop-resolver-discovery-default-native-fallback-approval',
  }
}

function compactAvailable(helperPath) {
  return {
    status: 'available',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'resolver-discovery-contract-temp-fixture-only',
    releaseDecision: 'future-contract-only-not-production-discovery',
    helperPath,
  }
}

function rel(filename) {
  return `native/${MODULE}/${HELPER_VERSION}/${TARGET.target}/${filename}`
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function writeInstalledLayout(root, options = {}) {
  const installedRoot = path.join(root, 'installed-layout')
  const helperRel = rel('agentteam-tmuxSnapshotParse')
  const manifestRel = rel('manifest.json')
  const checksumRel = rel('SHA256SUMS')
  const provenanceRel = rel('provenance.json')
  const licenseRel = rel('LICENSE')
  const helperPath = path.join(installedRoot, helperRel)
  fs.mkdirSync(path.dirname(helperPath), { recursive: true })
  const helperBody = options.corruptSmokeOutput ? 'not-json' : JSON.stringify({ ok: true, module: MODULE, capability: MODULE })
  fs.writeFileSync(helperPath, helperBody)
  fs.chmodSync(helperPath, options.nonExecutable ? 0o644 : 0o755)
  const licensePath = path.join(installedRoot, licenseRel)
  fs.writeFileSync(licensePath, 'fixture license copy only\n')
  const provenance = {
    sourceRevision: 'source-revision-placeholder',
    workflowRun: 'workflow-run-placeholder',
    toolchain: 'toolchain-identity-placeholder',
    generatedAt: '2026-06-12T00:00:00.000Z',
  }
  const manifest = {
    schemaVersion: 1,
    packageName: PACKAGE_NAME,
    packageVersion: options.wrongPackageVersion ? '0.0.0' : PACKAGE_VERSION,
    module: MODULE,
    capability: options.wrongCapability ? 'compactReadModelFingerprint' : MODULE,
    capabilities: options.wrongCapability ? ['compactReadModelFingerprint'] : [MODULE],
    protocolVersion: options.wrongProtocol ? '2' : PROTOCOL_VERSION,
    helperVersion: options.wrongHelperVersion ? 'stale-helper' : HELPER_VERSION,
    os: options.unsupportedPlatform ? 'linux' : TARGET.os,
    arch: TARGET.arch,
    libc: options.unsupportedPlatform ? 'musl' : TARGET.libc,
    helperPath: options.invalidPath ? '../escape/helper' : helperRel,
    checksumPath: checksumRel,
    provenancePath: provenanceRel,
    licensePath: licenseRel,
    sha256: options.checksumMismatch ? '0'.repeat(64) : sha256(helperPath),
    provenanceSha256: options.provenanceMismatch ? '0'.repeat(64) : undefined,
    licenseSha256: options.licenseMismatch ? '0'.repeat(64) : sha256(licensePath),
  }
  const provenancePath = path.join(installedRoot, provenanceRel)
  writeJson(provenancePath, provenance)
  manifest.provenanceSha256 = manifest.provenanceSha256 || sha256(provenancePath)
  writeJson(path.join(installedRoot, manifestRel), manifest)
  fs.writeFileSync(path.join(installedRoot, checksumRel), `${manifest.sha256}  agentteam-tmuxSnapshotParse\n`)
  if (options.missingManifest) fs.rmSync(path.join(installedRoot, manifestRel), { force: true })
  if (options.missingHelper) fs.rmSync(helperPath, { force: true })
  if (options.missingProvenance) fs.rmSync(provenancePath, { force: true })
  if (options.missingLicense) fs.rmSync(licensePath, { force: true })
  return { installedRoot, manifestRel, helperPath, manifestPath: path.join(installedRoot, manifestRel) }
}

function isSafePackageRelativePath(value) {
  return typeof value === 'string'
    && value.startsWith(`native/${MODULE}/`)
    && !path.isAbsolute(value)
    && !value.includes('..')
    && !/[\\]/.test(value)
}

function resolveInstalled(installedRoot, relPath) {
  if (!isSafePackageRelativePath(relPath)) return null
  const resolved = path.resolve(installedRoot, relPath)
  const root = path.resolve(installedRoot)
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null
}

function discoverHelper(input, options = {}) {
  try {
    if (options.explicitHelperPath) return { status: 'explicit', helperPath: options.explicitHelperPath, precedence: 'explicit-helper-path' }
    if (!options.futureApproved) return compactFailure('manifest_missing', 'resolver discovery is future-approved only', 'not-approved')
    if (!isSafePackageRelativePath(input.manifestPath)) return compactFailure('invalid_path', 'reject unsafe manifest path', 'manifest-path')
    const manifestPath = resolveInstalled(input.installedRoot, input.manifestPath)
    if (!manifestPath || !fs.existsSync(manifestPath)) return compactFailure('manifest_missing', 'regenerate installed manifest', 'manifest')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    if (!isSafePackageRelativePath(manifest.helperPath) || !isSafePackageRelativePath(manifest.checksumPath) || !isSafePackageRelativePath(manifest.provenancePath) || !isSafePackageRelativePath(manifest.licensePath)) return compactFailure('invalid_path', 'reject unsafe installed metadata path', 'path')
    if (manifest.os !== input.platform.os || manifest.arch !== input.platform.arch || manifest.libc !== input.platform.libc) return compactFailure('unsupported_platform', 'reject unsupported platform tuple', 'platform')
    if (manifest.module !== MODULE || manifest.capability !== MODULE || !Array.isArray(manifest.capabilities) || !manifest.capabilities.includes(MODULE)) return compactFailure('capability_skew', 'reject capability skew', 'capability')
    if (manifest.protocolVersion !== PROTOCOL_VERSION) return compactFailure('protocol_skew', 'reject protocol skew', 'protocol')
    if (manifest.helperVersion !== HELPER_VERSION || manifest.packageVersion !== PACKAGE_VERSION) return compactFailure('version_skew', 'reject version skew', 'version')
    const helperPath = resolveInstalled(input.installedRoot, manifest.helperPath)
    const checksumPath = resolveInstalled(input.installedRoot, manifest.checksumPath)
    const provenancePath = resolveInstalled(input.installedRoot, manifest.provenancePath)
    const licensePath = resolveInstalled(input.installedRoot, manifest.licensePath)
    if (!helperPath || !fs.existsSync(helperPath)) return compactFailure('helper_missing', 'regenerate installed helper', 'helper')
    if (!checksumPath || !fs.existsSync(checksumPath)) return compactFailure('integrity_mismatch', 'regenerate checksum file', 'checksum-file')
    if (!provenancePath || !fs.existsSync(provenancePath)) return compactFailure('provenance_mismatch', 'regenerate provenance metadata', 'provenance')
    if (!licensePath || !fs.existsSync(licensePath)) return compactFailure('license_mismatch', 'regenerate license metadata', 'license')
    const stat = fs.statSync(helperPath)
    if ((stat.mode & 0o111) === 0) return compactFailure('artifact_not_executable', 'restore executable bit', 'executable')
    if (sha256(helperPath) !== manifest.sha256) return compactFailure('integrity_mismatch', 'reject helper checksum mismatch', 'checksum')
    if (sha256(provenancePath) !== manifest.provenanceSha256) return compactFailure('provenance_mismatch', 'reject provenance checksum mismatch', 'provenance')
    if (sha256(licensePath) !== manifest.licenseSha256) return compactFailure('license_mismatch', 'reject license checksum mismatch', 'license')
    const parsed = JSON.parse(fs.readFileSync(helperPath, 'utf8'))
    if (!parsed.ok || parsed.module !== MODULE || parsed.capability !== MODULE) return compactFailure('helper_smoke_failed', 'reject corrupt helper smoke output', 'smoke')
    return compactAvailable(manifest.helperPath)
  } catch (_) {
    return compactFailure('helper_smoke_failed', 'reject corrupt smoke output', 'exception')
  }
}

function assertNoLeaks(result, root) {
  const text = JSON.stringify(result)
  assert.equal(text.includes(path.resolve(root)), false, 'failure must not leak installed root')
  assert.equal(text.includes(process.cwd()), false, 'failure must not leak repo/cwd')
  assert.equal(/stdout|stderr/i.test(text), false, 'failure must not mention stdout/stderr')
  assert.equal(/source-revision-placeholder|workflow-run-placeholder|toolchain-identity-placeholder/i.test(text), false, 'failure must not leak provenance body')
  assert.equal(/fixture license copy only|SHA256SUMS|provenance\.json|manifest\.json|native\/tmuxSnapshotParse/i.test(text), false, 'failure must not leak package internals')
  assert.equal(/Error:|AssertionError|at discoverHelper|stack/i.test(text), false, 'failure must not leak stack traces')
  assert.equal(/mailbox|TaskReport|report text/i.test(text), false, 'failure must not leak mailbox/report text')
  assert.equal(result.status, 'unavailable', 'negative discovery should be unavailable')
  assert.equal(result.resultMarker, 'fail-closed', 'negative discovery should fail closed')
  assert.ok(FAILURE_KINDS.has(result.failureKind), 'failureKind should be compact')
}

function assertCurrentKernelSourceInvariants(root) {
  const source = fs.readFileSync(path.join(root, 'core/kernel.ts'), 'utf8')
  assert.ok(source.includes("const packagedPreviewRequested = requestedMode === 'go-packaged-preview'"), 'packaged preview must remain explicit-only')
  assert.ok(source.includes('const packagedResolverFailure = packagedResolverRequested && !explicitHelperPath'), 'packaged resolver failure should apply to preview/default resolver without explicit helper')
  assert.ok(source.includes('const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure'), 'packaged helper path must only be considered for packaged preview')
  assert.ok(source.includes('const helperPath = explicitHelperPath || packagedHelperPath'), 'explicit helper path must remain highest precedence')
  assert.ok(source.includes("const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested"), 'cutover includes default/go plus explicit go-cutover or packaged preview')
  assert.ok(source.includes('const startupFallback = cutoverRequested ? undefined'), 'cutover path must not use migration fallback startup')
  assert.ok(source.includes("export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse'"), 'tmuxSnapshotParse remains cutover module')
  assert.ok(source.includes('compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)'), 'compactReadModelFingerprint remains TS fallback path')
  assert.ok(source.includes('if (cutoverRequested) return fallback(compactInput)'), 'compactReadModelFingerprint remains non-cutover')
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
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|resolver-discovery-manifest|clean-install-consumption-manifest|artifact-bundle-manifest|install-layout-manifest|generated-package-manifest)\.(?:json|jsonc|yaml|yml|jsonl)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated resolver artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
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
  name: 'Go kernel v0.4.27 resolver discovery contract',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = fs.readFileSync(path.join(root, DOC), 'utf8')
    for (const expected of REQUIRED_DOC_ITEMS) assert.ok(doc.includes(expected), `doc should include ${expected}`)
    for (const expected of FAILURE_DOC_ITEMS) assert.ok(doc.includes(expected), `doc should include ${expected}`)
    for (const expected of STOP_ITEMS) assert.ok(doc.includes(expected), `doc should include ${expected}`)
    for (const forbidden of FORBIDDEN_DOC) assert.equal(doc.includes(forbidden), false, `doc must not imply forbidden policy: ${forbidden}`)
    assert.equal(/^## v0\.4\.28\b/im.test(doc), false, 'Slice 5 guard must not allow v0.4.28 implementation')

    let tempRoot
    try {
      tempRoot = mkTempRoot()
      const layout = writeInstalledLayout(tempRoot)
      const result = discoverHelper({ installedRoot: layout.installedRoot, manifestPath: layout.manifestRel, platform: TARGET }, { futureApproved: true })
      assert.equal(result.status, 'available', 'valid simulated discovery should pass')
      assert.equal(result.helperPath, rel('agentteam-tmuxSnapshotParse'), 'accepted helper path should remain package-relative')
      assert.equal(JSON.stringify(result).includes(tempRoot), false, 'accepted result must not leak temp root')
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    const cases = [
      ['missing manifest', { missingManifest: true }, 'manifest_missing'],
      ['missing helper', { missingHelper: true }, 'helper_missing'],
      ['invalid path', { invalidPath: true }, 'invalid_path'],
      ['unsupported platform', { unsupportedPlatform: true }, 'unsupported_platform'],
      ['checksum mismatch', { checksumMismatch: true }, 'integrity_mismatch'],
      ['provenance mismatch', { provenanceMismatch: true }, 'provenance_mismatch'],
      ['missing provenance', { missingProvenance: true }, 'provenance_mismatch'],
      ['license mismatch', { licenseMismatch: true }, 'license_mismatch'],
      ['missing license', { missingLicense: true }, 'license_mismatch'],
      ['wrong package version', { wrongPackageVersion: true }, 'version_skew'],
      ['wrong helper version', { wrongHelperVersion: true }, 'version_skew'],
      ['wrong protocol', { wrongProtocol: true }, 'protocol_skew'],
      ['wrong capability', { wrongCapability: true }, 'capability_skew'],
      ['non-executable helper', { nonExecutable: true }, 'artifact_not_executable'],
      ['corrupt smoke output', { corruptSmokeOutput: true }, 'helper_smoke_failed'],
    ]
    for (const [, options, failureKind] of cases) {
      let caseRoot
      try {
        caseRoot = mkTempRoot()
        const layout = writeInstalledLayout(caseRoot, options)
        const result = discoverHelper({ installedRoot: layout.installedRoot, manifestPath: layout.manifestRel, platform: TARGET }, { futureApproved: true })
        assert.equal(result.failureKind, failureKind)
        assertNoLeaks(result, caseRoot)
      } finally {
        if (caseRoot) fs.rmSync(caseRoot, { recursive: true, force: true })
      }
    }

    let notApprovedRoot
    try {
      notApprovedRoot = mkTempRoot()
      const layout = writeInstalledLayout(notApprovedRoot)
      const result = discoverHelper({ installedRoot: layout.installedRoot, manifestPath: layout.manifestRel, platform: TARGET }, { futureApproved: false })
      assert.equal(result.status, 'unavailable', 'simulated discovery without future approval should stay unavailable')
      assertNoLeaks(result, notApprovedRoot)
    } finally {
      if (notApprovedRoot) fs.rmSync(notApprovedRoot, { recursive: true, force: true })
    }

    const explicit = discoverHelper({ installedRoot: '/tmp/not-read', manifestPath: '../unsafe', platform: TARGET }, { explicitHelperPath: '/tmp/explicit-helper' })
    assert.equal(explicit.status, 'explicit', 'explicit helper path should stay highest precedence')
    assert.equal(explicit.precedence, 'explicit-helper-path')

    assertCurrentKernelSourceInvariants(root)
    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
  },
}
