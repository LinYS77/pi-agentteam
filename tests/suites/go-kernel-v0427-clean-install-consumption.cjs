const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md'
const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.4.27-clean-install-fixture'
const PROTOCOL_VERSION = '1'
const TARGET = {
  target: 'linux-x64-glibc',
  os: 'linux',
  arch: 'x64',
  libc: 'glibc',
  helperFile: 'agentteam-tmuxSnapshotParse',
}
const FAILURE_KINDS = new Set([
  'helper_missing',
  'unsupported_platform',
  'artifact_not_executable',
  'integrity_mismatch',
  'stale_helper',
  'version_skew',
  'protocol_skew',
  'capability_skew',
  'metadata_missing',
  'helper_smoke_failed',
  'default_resolver_blocked',
  'typescript_fallback_blocked',
])
const REQUIRED_DOC_ITEMS = [
  'Slice 4 — Clean-Install Consumption Simulation',
  'Slice 4 is tests/docs/temp-fixture only',
  'Focused suite: `tests/suites/go-kernel-v0427-clean-install-consumption.cjs`',
  'create a fake artifact bundle under an OS temp root using Slice 2 bundle shape',
  'copy/map the fake bundle into a separate temp installed layout using package-relative paths only',
  'validate the installed manifest, checksum file, executable policy, license metadata/copy/checksum, provenance placeholder, attestation/signing placeholder, module, capability, protocolVersion, helperVersion, packageVersion, and os/arch/libc tuple',
  'run direct explicit test-path smoke only; do not use production default resolver or runtime discovery',
  'deterministic health response and minimal `tmuxSnapshotParse` capability response',
  'assert no source checkout dependency',
  'assert no Go toolchain',
  'assert no network',
  'assert no lifecycle download',
  'assert no install-time build',
  'assert no manual helper env',
  'clean up OS temp roots',
  'Positive supported-row smoke',
  'Negative fail-closed cases',
  'No-leak behavior',
  'Slice 4 Validation Plan',
  'Proceed only with v0.4.27 Slice 4 tests/docs/temp-fixture clean-install consumption simulation review after leader/user approval',
]
const NEGATIVE_DOC_ITEMS = [
  'missing helper',
  'wrong platform/libc',
  'non-executable POSIX helper',
  'checksum mismatch',
  'stale helper',
  'wrong package version',
  'wrong helper version',
  'wrong protocol version',
  'wrong capability',
  'missing license metadata/copy/checksum',
  'missing provenance placeholder',
  'missing attestation placeholder or real signing claim without proof',
  'corrupt smoke output',
  'attempted default resolver use',
  'attempted hidden TS parser fallback',
]
const STOP_ITEMS = [
  'STOP for running `go build`',
  'STOP for helper build commands',
  'STOP for CI workflow',
  'STOP for artifact upload',
  'STOP for release assets',
  'STOP for real package manager install',
  'STOP for npm tarball behavior',
  'STOP for npm pack/version/publish',
  'STOP for package metadata/files/optionalDependencies/scripts changes',
  'STOP for lifecycle hooks',
  'STOP for postinstall/download/install-time build',
  'STOP for native binaries',
  'STOP for tarballs',
  'STOP for generated manifests checked into the repo',
  'STOP for generated package artifacts',
  'STOP for go.mod/go.sum',
  'STOP for lockfiles',
  'STOP for production resolver implementation',
  'STOP for runtime discovery',
  'STOP for default discovery',
  'STOP for default Go',
  'STOP for current `go-cutover` behavior changes',
  'STOP for `go-packaged-preview` availability semantics changes',
  'STOP for TypeScript fallback deletion',
  'STOP for `/team readiness` expansion',
  'STOP for broadening Go authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
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
  'real package-manager install is implemented',
  'npm tarball behavior is implemented',
  'runtime discovery is implemented',
  'default discovery is implemented',
  'normal-user availability is proven',
  'normal-user native availability is proven',
  'native/default cutover is approved',
  'fallback deletion is approved',
  'package metadata is approved',
  'npm publish is approved',
  'Go is default',
  'native Go pi extension is assumed',
  'broader Go authority is approved',
]

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempRoot() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0427-clean-install-'))
  assert.equal(path.dirname(tempRoot), os.tmpdir(), 'clean-install root must be under OS tmpdir')
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
    releaseDecision: 'stop-clean-install-consumption-default-native-fallback-approval',
    usedDefaultResolver: false,
    usedTypescriptFallback: false,
  }
}

function compactAvailable() {
  return {
    status: 'available',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'clean-install-consumption-temp-fixture-only',
    releaseDecision: 'simulation-only-not-normal-user-availability',
    usedDefaultResolver: false,
    usedTypescriptFallback: false,
    proof: {
      explicitTestPathOnly: true,
      noSourceCheckoutDependency: true,
      noGoToolchain: true,
      noNetwork: true,
      noLifecycleDownload: true,
      noInstallTimeBuild: true,
      noManualHelperEnv: true,
      packageManagerInstallSimulated: false,
      npmTarballSimulated: false,
      runtimeDiscoveryUsed: false,
    },
  }
}

function bundleRel(filename) {
  return `bundle/${PACKAGE_NAME}/${PACKAGE_VERSION}/${MODULE}/${HELPER_VERSION}/${PROTOCOL_VERSION}/${TARGET.target}/${filename}`
}

function installedRel(filename) {
  return `native/${MODULE}/${HELPER_VERSION}/${TARGET.target}/${filename}`
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function writeFakeBundle(root, options = {}) {
  const bundleRoot = path.join(root, 'artifact-bundle')
  const helperRel = bundleRel(TARGET.helperFile)
  const helperPath = path.join(bundleRoot, helperRel)
  fs.mkdirSync(path.dirname(helperPath), { recursive: true })
  const helperResponse = options.corruptSmokeOutput
    ? 'not-json'
    : JSON.stringify({
      health: {
        ok: true,
        module: MODULE,
        capabilities: [MODULE],
        protocolVersion: PROTOCOL_VERSION,
        helperVersion: HELPER_VERSION,
        packageVersion: PACKAGE_VERSION,
      },
      tmuxSnapshotParse: {
        ok: true,
        capability: MODULE,
      },
    })
  fs.writeFileSync(helperPath, helperResponse)
  fs.chmodSync(helperPath, options.nonExecutable ? 0o644 : 0o755)

  const licenseRel = bundleRel('LICENSE')
  const licensePath = path.join(bundleRoot, licenseRel)
  fs.mkdirSync(path.dirname(licensePath), { recursive: true })
  fs.writeFileSync(licensePath, 'fixture license copy only\n')
  const provenance = {
    sourceRevision: 'source-revision-placeholder',
    workflowRun: 'workflow-run-placeholder',
    toolchain: 'toolchain-identity-placeholder',
    generatedAt: '2026-06-12T00:00:00.000Z',
  }
  const attestation = {
    kind: 'placeholder-only',
    signed: false,
    signing: 'not-real-signing',
  }
  const manifest = {
    schemaVersion: 1,
    packageName: PACKAGE_NAME,
    packageVersion: options.wrongPackageVersion ? '0.0.0' : PACKAGE_VERSION,
    module: MODULE,
    helperVersion: options.wrongHelperVersion ? 'stale-helper' : HELPER_VERSION,
    protocolVersion: options.wrongProtocol ? '2' : PROTOCOL_VERSION,
    capabilities: options.wrongCapability ? ['compactReadModelFingerprint'] : [MODULE],
    os: options.wrongPlatform ? 'linux' : TARGET.os,
    arch: TARGET.arch,
    libc: options.wrongPlatform ? 'musl' : TARGET.libc,
    target: options.wrongPlatform ? 'linux-x64-musl' : TARGET.target,
    path: helperRel,
    filename: TARGET.helperFile,
    size: fs.statSync(helperPath).size,
    sha256: options.checksumMismatch ? '0'.repeat(64) : sha256(helperPath),
    executable: true,
    provenance: options.missingProvenance ? undefined : provenance,
    license: options.missingLicense ? undefined : {
      name: 'MIT',
      path: licenseRel,
      sha256: sha256(licensePath),
    },
    attestation: options.missingAttestation ? undefined : (options.realSigningClaim ? { kind: 'signed-provenance', signed: true, signing: 'real-signing-claim' } : attestation),
    stale: options.staleHelper === true,
  }
  const manifestRel = bundleRel('manifest.json')
  const checksumRel = bundleRel('SHA256SUMS')
  const provenanceRel = bundleRel('provenance.json')
  const attestationRel = bundleRel('attestation.intoto.jsonl')
  writeJson(path.join(bundleRoot, manifestRel), manifest)
  fs.writeFileSync(path.join(bundleRoot, checksumRel), `${manifest.sha256}  ${TARGET.helperFile}\n`)
  if (!options.missingProvenance) writeJson(path.join(bundleRoot, provenanceRel), provenance)
  if (!options.missingAttestation) writeJson(path.join(bundleRoot, attestationRel), manifest.attestation)
  return { bundleRoot, manifest, helperPath, manifestRel, checksumRel, provenanceRel, licenseRel, attestationRel }
}

function isSafeRelPath(relPath) {
  return typeof relPath === 'string'
    && !path.isAbsolute(relPath)
    && !relPath.includes('..')
    && !/[\\]/.test(relPath)
}

function mapBundleToInstalledLayout(root, bundle, options = {}) {
  const installRoot = path.join(root, 'installed-layout')
  const rels = {
    helper: installedRel(TARGET.helperFile),
    manifest: installedRel('manifest.json'),
    checksum: installedRel('SHA256SUMS'),
    provenance: installedRel('provenance.json'),
    license: installedRel('LICENSE'),
    attestation: installedRel('attestation.intoto.jsonl'),
  }
  for (const rel of Object.values(rels)) assert.ok(isSafeRelPath(rel), 'installed layout path must be package-relative')
  const helperPath = path.join(installRoot, rels.helper)
  fs.mkdirSync(path.dirname(helperPath), { recursive: true })
  if (!options.missingHelper) {
    fs.copyFileSync(bundle.helperPath, helperPath)
    fs.chmodSync(helperPath, options.nonExecutable ? 0o644 : 0o755)
  }
  const licenseSource = path.join(bundle.bundleRoot, bundle.licenseRel)
  const licensePath = path.join(installRoot, rels.license)
  if (!options.missingLicense) {
    fs.mkdirSync(path.dirname(licensePath), { recursive: true })
    fs.copyFileSync(licenseSource, licensePath)
  }
  const manifest = {
    ...bundle.manifest,
    path: rels.helper,
    installed: {
      helperPath: rels.helper,
      manifestPath: rels.manifest,
      checksumPath: rels.checksum,
      provenancePath: rels.provenance,
      licensePath: rels.license,
      attestationPath: rels.attestation,
    },
  }
  if (!options.missingLicense && manifest.license) manifest.license = { ...manifest.license, path: rels.license, sha256: sha256(licensePath) }
  if (options.wrongPlatform) {
    manifest.libc = 'musl'
    manifest.target = 'linux-x64-musl'
  }
  if (options.staleHelper) manifest.stale = true
  if (options.checksumMismatch) manifest.sha256 = '0'.repeat(64)
  writeJson(path.join(installRoot, rels.manifest), manifest)
  fs.writeFileSync(path.join(installRoot, rels.checksum), `${manifest.sha256}  ${TARGET.helperFile}\n`)
  if (!options.missingProvenance && manifest.provenance) writeJson(path.join(installRoot, rels.provenance), manifest.provenance)
  if (!options.missingAttestation && manifest.attestation) writeJson(path.join(installRoot, rels.attestation), manifest.attestation)
  return { installRoot, rels, helperPath, manifestPath: path.join(installRoot, rels.manifest), manifest }
}

function resolveInstalled(installRoot, relPath) {
  if (!isSafeRelPath(relPath)) return null
  const resolved = path.resolve(installRoot, relPath)
  const root = path.resolve(installRoot)
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null
}

function validateInstalledLayout(installed, options = {}) {
  try {
    if (options.useDefaultResolver) return compactFailure('default_resolver_blocked', 'use explicit test path only', 'default-resolver')
    if (options.useTypescriptFallback) return compactFailure('typescript_fallback_blocked', 'do not hide smoke failure with TS fallback', 'ts-fallback')
    const manifest = installed.manifest
    if (!manifest || !manifest.installed) return compactFailure('metadata_missing', 'regenerate installed manifest', 'manifest')
    if (manifest.packageName !== PACKAGE_NAME || manifest.packageVersion !== PACKAGE_VERSION) return compactFailure('version_skew', 'reject package version skew', 'package')
    if (manifest.module !== MODULE) return compactFailure('capability_skew', 'reject wrong module', 'module')
    if (!Array.isArray(manifest.capabilities) || !manifest.capabilities.includes(MODULE)) return compactFailure('capability_skew', 'reject missing capability', 'capability')
    if (manifest.protocolVersion !== PROTOCOL_VERSION) return compactFailure('protocol_skew', 'reject protocol skew', 'protocol')
    if (manifest.helperVersion !== HELPER_VERSION) return compactFailure('version_skew', 'reject helper version skew', 'helper-version')
    if (manifest.os !== TARGET.os || manifest.arch !== TARGET.arch || manifest.libc !== TARGET.libc) return compactFailure('unsupported_platform', 'reject unsupported platform tuple', 'platform')
    if (manifest.stale) return compactFailure('stale_helper', 'reject stale helper layout', 'stale')
    for (const rel of Object.values(manifest.installed)) {
      const resolved = resolveInstalled(installed.installRoot, rel)
      if (!resolved || !fs.existsSync(resolved)) return compactFailure('metadata_missing', 'regenerate complete installed layout', 'installed-file')
    }
    const helperPath = resolveInstalled(installed.installRoot, manifest.path)
    if (!helperPath || !fs.existsSync(helperPath)) return compactFailure('helper_missing', 'regenerate installed helper', 'helper')
    const stat = fs.statSync(helperPath)
    if ((stat.mode & 0o111) === 0) return compactFailure('artifact_not_executable', 'restore executable bit', 'executable')
    if (sha256(helperPath) !== manifest.sha256) return compactFailure('integrity_mismatch', 'reject checksum mismatch', 'checksum')
    const checksumPath = resolveInstalled(installed.installRoot, manifest.installed.checksumPath)
    const checksumText = fs.readFileSync(checksumPath, 'utf8')
    if (!checksumText.includes(manifest.sha256)) return compactFailure('integrity_mismatch', 'reject checksum file mismatch', 'checksum-file')
    if (!manifest.provenance || !fs.existsSync(resolveInstalled(installed.installRoot, manifest.installed.provenancePath))) return compactFailure('metadata_missing', 'regenerate provenance placeholder', 'provenance')
    if (!manifest.license || !fs.existsSync(resolveInstalled(installed.installRoot, manifest.installed.licensePath))) return compactFailure('metadata_missing', 'regenerate license metadata', 'license')
    if (!manifest.attestation || manifest.attestation.kind !== 'placeholder-only' || manifest.attestation.signed !== false) return compactFailure('metadata_missing', 'regenerate attestation placeholder', 'attestation')
    return compactAvailable()
  } catch (_) {
    return compactFailure('metadata_missing', 'reject installed layout exception', 'exception')
  }
}

function smokeInstalledHelper(installed, options = {}) {
  const validation = validateInstalledLayout(installed, options)
  if (validation.status !== 'available') return validation
  try {
    const helperPath = resolveInstalled(installed.installRoot, installed.manifest.path)
    const parsed = JSON.parse(fs.readFileSync(helperPath, 'utf8'))
    if (!parsed.health || parsed.health.ok !== true) return compactFailure('helper_smoke_failed', 'reject corrupt health response', 'health')
    if (parsed.health.module !== MODULE) return compactFailure('capability_skew', 'reject wrong health module', 'health-module')
    if (!Array.isArray(parsed.health.capabilities) || !parsed.health.capabilities.includes(MODULE)) return compactFailure('capability_skew', 'reject missing health capability', 'health-capability')
    if (parsed.health.protocolVersion !== PROTOCOL_VERSION) return compactFailure('protocol_skew', 'reject health protocol skew', 'health-protocol')
    if (parsed.health.helperVersion !== HELPER_VERSION || parsed.health.packageVersion !== PACKAGE_VERSION) return compactFailure('version_skew', 'reject health version skew', 'health-version')
    if (!parsed.tmuxSnapshotParse || parsed.tmuxSnapshotParse.capability !== MODULE) return compactFailure('helper_smoke_failed', 'reject parser capability smoke failure', 'tmuxSnapshotParse')
    return validation
  } catch (_) {
    return compactFailure('helper_smoke_failed', 'reject corrupt smoke output', 'smoke-json')
  }
}

function assertNoLeaks(result, root) {
  const text = JSON.stringify(result)
  assert.equal(text.includes(path.resolve(root)), false, 'failure must not leak temp root')
  assert.equal(text.includes(process.cwd()), false, 'failure must not leak repo/cwd')
  assert.equal(/stdout|stderr/i.test(text), false, 'failure must not mention stdout/stderr')
  assert.equal(/source-revision-placeholder|workflow-run-placeholder|toolchain-identity-placeholder/i.test(text), false, 'failure must not leak provenance body')
  assert.equal(/fixture license copy only|SHA256SUMS|provenance\.json|manifest\.json|attestation\.intoto|native\/tmuxSnapshotParse|bundle\//i.test(text), false, 'failure must not leak raw metadata/package internals')
  assert.equal(/Error:|AssertionError|at validateInstalledLayout|at smokeInstalledHelper|stack/i.test(text), false, 'failure must not leak stack traces')
  assert.equal(/mailbox|TaskReport|report text/i.test(text), false, 'failure must not leak mailbox/report text')
  assert.equal(result.status, 'unavailable', 'negative case should be unavailable')
  assert.equal(result.resultMarker, 'fail-closed', 'negative case should fail closed')
  assert.equal(result.usedDefaultResolver, false, 'failure must not use default resolver')
  assert.equal(result.usedTypescriptFallback, false, 'failure must not use TS fallback')
  assert.ok(FAILURE_KINDS.has(result.failureKind), 'failureKind should be compact')
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
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|clean-install-consumption-manifest|artifact-bundle-manifest|install-layout-manifest|generated-package-manifest|clean-install-simulation-manifest)\.(?:json|jsonc|yaml|yml|jsonl)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated bundle/manifest/package artifacts')
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
  name: 'Go kernel v0.4.27 clean-install consumption simulation',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = fs.readFileSync(path.join(root, DOC), 'utf8')
    for (const expected of REQUIRED_DOC_ITEMS) assert.ok(doc.includes(expected), `doc should include ${expected}`)
    for (const expected of NEGATIVE_DOC_ITEMS) assert.ok(doc.includes(expected), `doc should include ${expected}`)
    for (const expected of STOP_ITEMS) assert.ok(doc.includes(expected), `doc should include ${expected}`)
    for (const forbidden of FORBIDDEN_DOC) assert.equal(doc.includes(forbidden), false, `doc must not imply forbidden policy: ${forbidden}`)
    assert.equal(/^## v0\.4\.28\b/im.test(doc), false, 'Slice 4 guard must not allow v0.4.28 implementation')

    let tempRoot
    try {
      tempRoot = mkTempRoot()
      const bundle = writeFakeBundle(tempRoot)
      const installed = mapBundleToInstalledLayout(tempRoot, bundle)
      for (const file of [bundle.helperPath, installed.helperPath, installed.manifestPath]) {
        assert.ok(file.startsWith(`${tempRoot}${path.sep}`), 'fixture files must stay under OS temp root')
        assert.equal(file.startsWith(root), false, 'fixture files must not be under repo root')
      }
      const positive = smokeInstalledHelper(installed)
      assert.equal(positive.status, 'available', 'supported temp clean-install simulation should pass')
      assert.deepEqual(positive.proof, compactAvailable().proof)
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    const cases = [
      ['missing helper', { missingHelper: true }],
      ['wrong platform/libc', { wrongPlatform: true }],
      ['non-executable POSIX helper', { nonExecutable: true }],
      ['checksum mismatch', { checksumMismatch: true }],
      ['stale helper', { staleHelper: true }],
      ['wrong package version', { wrongPackageVersion: true }],
      ['wrong helper version', { wrongHelperVersion: true }],
      ['wrong protocol version', { wrongProtocol: true }],
      ['wrong capability', { wrongCapability: true }],
      ['missing license metadata/copy/checksum', { missingLicense: true }],
      ['missing provenance placeholder', { missingProvenance: true }],
      ['missing attestation placeholder', { missingAttestation: true }],
      ['real signing claim without proof', { realSigningClaim: true }],
      ['corrupt smoke output', { corruptSmokeOutput: true }],
      ['attempted default resolver use', { useDefaultResolver: true }],
      ['attempted hidden TS parser fallback', { useTypescriptFallback: true }],
    ]
    for (const [, options] of cases) {
      let caseRoot
      try {
        caseRoot = mkTempRoot()
        const bundle = writeFakeBundle(caseRoot, options)
        const installed = mapBundleToInstalledLayout(caseRoot, bundle, options)
        const result = smokeInstalledHelper(installed, options)
        assertNoLeaks(result, caseRoot)
      } finally {
        if (caseRoot) fs.rmSync(caseRoot, { recursive: true, force: true })
      }
    }

    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
  },
}
