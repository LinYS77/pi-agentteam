const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { assertNoUnapprovedWorkflowReleaseOrPackageBehavior } = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.4.26-go-helper-artifact-pipeline.md'
const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.4.26-smoke-fixture'
const PROTOCOL_VERSION = '1'
const FAILURE_KINDS = new Set([
  'helper_smoke_failed',
  'capability_skew',
  'protocol_skew',
  'version_skew',
  'integrity_mismatch',
  'installed_layout_missing',
  'default_resolver_blocked',
  'typescript_fallback_blocked',
])
const FORBIDDEN_DOC = [
  'artifacts are release-ready',
  'normal-user availability is proven',
  'native/default cutover is approved',
  'fallback deletion is approved',
  'native packaging is approved',
  'npm publish is approved',
  'npm version is approved',
  'Go is default',
  'native Go pi extension is assumed',
  'broader Go authority is approved',
]

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempRoot() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0426-smoke-handoff-'))
  assert.equal(path.dirname(tempRoot), os.tmpdir(), 'smoke root must be under OS tmpdir')
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
    releaseDecision: 'stop-release-default-native-fallback-deletion',
    usedTypescriptFallback: false,
    usedDefaultResolver: false,
  }
}

function compactAvailable() {
  return {
    status: 'available',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'smoke-handoff-temp-fixture-only',
    releaseDecision: 'prototype-only-not-normal-user-availability',
    usedTypescriptFallback: false,
    usedDefaultResolver: false,
    proof: {
      explicitLocalTestPathOnly: true,
      noSourceCheckoutDependency: true,
      noGoToolchain: true,
      noNetwork: true,
      noLifecycleDownload: true,
      noInstallTimeBuild: true,
      noManualHelperEnv: true,
      packageInstallSimulated: true,
      companionPackageMetadataFuture: true,
      optionalDependencyFuture: true,
      npmTarballFuture: true,
      userInstallPathFuture: true,
      defaultResolverDiscoveryFuture: true,
    },
  }
}

function writeGeneratedArtifact(root, options = {}) {
  const target = 'linux-x64-glibc'
  const dir = path.join(root, 'generated-output', target)
  fs.mkdirSync(dir, { recursive: true })
  const helperPath = path.join(dir, 'agentteam-tmuxSnapshotParse')
  const helper = {
    health: options.health === 'corrupt' ? 'not-json' : {
      ok: true,
      protocolVersion: options.protocolVersion || PROTOCOL_VERSION,
      helperVersion: options.helperVersion || HELPER_VERSION,
      capabilities: options.capabilities || [MODULE],
    },
    tmuxSnapshotParse: {
      ok: true,
      panes: [],
      capturedAt: 123,
    },
  }
  fs.writeFileSync(helperPath, JSON.stringify(helper))
  fs.chmodSync(helperPath, 0o755)
  const licensePath = path.join(dir, 'LICENSE')
  fs.writeFileSync(licensePath, 'fixture license metadata only\n')
  const manifest = {
    schemaVersion: 1,
    packageName: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    module: MODULE,
    helperVersion: options.manifestHelperVersion || HELPER_VERSION,
    protocolVersion: options.manifestProtocolVersion || PROTOCOL_VERSION,
    capabilities: options.manifestCapabilities || [MODULE],
    os: 'linux',
    arch: 'x64',
    libc: 'glibc',
    path: 'generated-output/linux-x64-glibc/agentteam-tmuxSnapshotParse',
    filename: 'agentteam-tmuxSnapshotParse',
    size: fs.statSync(helperPath).size,
    sha256: sha256(helperPath),
    executable: true,
    provenance: {
      sourceRevision: 'source-revision-placeholder',
      workflowRun: 'workflow-run-placeholder',
      toolchain: 'toolchain-identity-placeholder',
      generatedAt: '2026-06-11T00:00:00.000Z',
    },
    license: {
      name: 'MIT',
      path: 'LICENSE',
      sha256: sha256(licensePath),
    },
  }
  if (options.checksumMismatch) manifest.sha256 = '0'.repeat(64)
  const manifestPath = path.join(dir, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  const checksumPath = path.join(dir, 'SHA256SUMS')
  fs.writeFileSync(checksumPath, `${manifest.sha256}  agentteam-tmuxSnapshotParse\n`)
  return { root, dir, helperPath, licensePath, manifestPath, checksumPath, manifest }
}

function parseHelper(helperPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(helperPath, 'utf8'))
    if (parsed.health === 'not-json') return null
    return parsed
  } catch (_) {
    return null
  }
}

function smokeGeneratedArtifact(fixture, options = {}) {
  try {
    if (options.useDefaultResolver) return compactFailure('default_resolver_blocked', 'use explicit local/test path only', 'default-resolver')
    if (options.useTypescriptFallback) return compactFailure('typescript_fallback_blocked', 'do not hide explicit smoke failure with TS fallback', 'ts-fallback')
    const helperPath = path.resolve(fixture.root, fixture.manifest.path)
    if (!helperPath.startsWith(`${path.resolve(fixture.root)}${path.sep}`)) return compactFailure('helper_smoke_failed', 'regenerate safe helper path', 'path')
    if (sha256(helperPath) !== fixture.manifest.sha256) return compactFailure('integrity_mismatch', 'regenerate checksum metadata', 'checksum')
    const helper = parseHelper(helperPath)
    if (!helper || !helper.health || helper.health.ok !== true) return compactFailure('helper_smoke_failed', 'reject corrupt health response', 'health')
    if (helper.health.protocolVersion !== PROTOCOL_VERSION || fixture.manifest.protocolVersion !== PROTOCOL_VERSION) return compactFailure('protocol_skew', 'reject protocol skew', 'protocol')
    if (helper.health.helperVersion !== HELPER_VERSION || fixture.manifest.helperVersion !== HELPER_VERSION) return compactFailure('version_skew', 'reject helper version skew', 'helper-version')
    if (!Array.isArray(helper.health.capabilities) || !helper.health.capabilities.includes(MODULE) || !fixture.manifest.capabilities.includes(MODULE)) return compactFailure('capability_skew', 'reject missing parser capability', 'capability')
    if (!helper.tmuxSnapshotParse || helper.tmuxSnapshotParse.ok !== true) return compactFailure('helper_smoke_failed', 'reject parser smoke failure', 'tmuxSnapshotParse')
    return compactAvailable()
  } catch (_) {
    return compactFailure('helper_smoke_failed', 'reject smoke exception', 'exception')
  }
}

function mapToInstalledLayout(fixture, options = {}) {
  const installRoot = path.join(fixture.root, 'installed-layout')
  if (options.missingMapping) return { installRoot, manifestPath: path.join(installRoot, 'manifest.json'), helperPath: path.join(installRoot, 'agentteam-tmuxSnapshotParse') }
  const helperRel = `node_modules/${PACKAGE_NAME}/native/${MODULE}/linux-x64-glibc/agentteam-tmuxSnapshotParse`
  const manifestRel = `node_modules/${PACKAGE_NAME}/native/${MODULE}/manifest.json`
  const helperPath = path.join(installRoot, helperRel)
  const manifestPath = path.join(installRoot, manifestRel)
  fs.mkdirSync(path.dirname(helperPath), { recursive: true })
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  fs.copyFileSync(fixture.helperPath, helperPath)
  fs.chmodSync(helperPath, 0o755)
  const manifest = { ...fixture.manifest, path: helperRel, packageInstallSimulated: true }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  return { installRoot, helperPath, manifestPath, manifest }
}

function validateHandoff(fixture, options = {}) {
  try {
    const smoke = smokeGeneratedArtifact(fixture, options)
    if (smoke.status !== 'available') return smoke
    const installed = mapToInstalledLayout(fixture, options)
    if (!fs.existsSync(installed.helperPath) || !fs.existsSync(installed.manifestPath)) return compactFailure('installed_layout_missing', 'create temp installed layout mapping', 'installed-layout')
    const manifest = JSON.parse(fs.readFileSync(installed.manifestPath, 'utf8'))
    if (manifest.packageInstallSimulated !== true) return compactFailure('installed_layout_missing', 'mark package install as simulated', 'simulated-install')
    return compactAvailable()
  } catch (_) {
    return compactFailure('installed_layout_missing', 'reject handoff exception', 'handoff-exception')
  }
}

function assertNoLeaks(result, root) {
  const text = JSON.stringify(result)
  assert.equal(text.includes(root), false, 'failure must not leak temp root')
  assert.equal(text.includes(process.cwd()), false, 'failure must not leak repo/cwd')
  assert.equal(/stdout|stderr/i.test(text), false, 'failure must not mention stdout/stderr')
  assert.equal(/Error:|AssertionError|at smokeGeneratedArtifact|at validateHandoff|stack/i.test(text), false, 'failure must not leak stack traces')
  assert.equal(/source-revision-placeholder|workflow-run-placeholder|toolchain-identity-placeholder/i.test(text), false, 'failure must not leak raw provenance body')
  assert.equal(/fixture license metadata/i.test(text), false, 'failure must not leak raw license body')
  assert.equal(/generated-output|node_modules\/pi-agentteam|native\/tmuxSnapshotParse/i.test(text), false, 'failure must not leak package internals')
  assert.equal(result.status, 'unavailable', 'negative case should be unavailable')
  assert.equal(result.resultMarker, 'fail-closed', 'negative case should fail closed')
  assert.equal(result.usedTypescriptFallback, false, 'negative case must not use hidden TS fallback')
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
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|smoke-handoff-manifest)\.(?:json|jsonc|yaml|yml|jsonl)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated manifest/package artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|generated|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated outputs')
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

function assertNoCiReleaseOrPackageScripts(root) {
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
}

module.exports = {
  name: 'Go kernel v0.4.26 artifact smoke handoff',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = fs.readFileSync(path.join(root, DOC), 'utf8')
    const lower = doc.toLowerCase()

    for (const expected of [
      'Slice 5 — Artifact Smoke and Clean-Install Handoff',
      'Slice 5 is test-local artifact smoke / clean-install handoff only',
      'Focused suite: `tests/suites/go-kernel-v0426-artifact-smoke-handoff.cjs`',
      'Direct smoke uses generated-temp artifact under explicit local/test path only',
      'Generated artifact metadata can feed future clean-install proof',
      'Package install remains simulated',
      'Companion package metadata remains future work',
      'Optional dependency installation remains future work',
      'npm tarball behavior remains future work',
      'User install path remains future work',
      'Default resolver discovery remains simulated/future',
      'No package/native/default/fallback behavior is approved',
      'Simulated-vs-real distinction',
      'STOP for later work without separate approval',
      'Proceed only with GitHub-only v0.4.26 Go helper artifact generation pipeline prototype checkpoint review after leader/user approval',
    ]) {
      assert.ok(lower.includes(expected.toLowerCase()), `doc should include ${expected}`)
    }
    for (const forbidden of FORBIDDEN_DOC) assert.equal(doc.includes(forbidden), false, `doc must not imply forbidden policy: ${forbidden}`)

    let tempRoot
    try {
      tempRoot = mkTempRoot()
      const fixture = writeGeneratedArtifact(tempRoot)
      for (const file of [fixture.helperPath, fixture.manifestPath, fixture.checksumPath, fixture.licensePath]) {
        assert.ok(file.startsWith(`${tempRoot}${path.sep}`), 'generated/smoked file must stay under OS temp root')
        assert.equal(file.startsWith(root), false, 'generated/smoked file must not be under repo root')
      }
      const smoke = smokeGeneratedArtifact(fixture)
      assert.equal(smoke.status, 'available', 'positive explicit smoke should pass')
      const handoff = validateHandoff(fixture)
      assert.equal(handoff.status, 'available', 'positive handoff should pass')
      assert.deepEqual(handoff.proof, compactAvailable().proof)

      const cases = [
        ['corrupt health JSON', () => writeGeneratedArtifact(tempRoot, { health: 'corrupt' }), smokeGeneratedArtifact],
        ['missing tmuxSnapshotParse capability', () => writeGeneratedArtifact(tempRoot, { capabilities: [], manifestCapabilities: [] }), smokeGeneratedArtifact],
        ['wrong protocol version', () => writeGeneratedArtifact(tempRoot, { protocolVersion: '2', manifestProtocolVersion: '2' }), smokeGeneratedArtifact],
        ['wrong helper version', () => writeGeneratedArtifact(tempRoot, { helperVersion: 'bad-helper', manifestHelperVersion: 'bad-helper' }), smokeGeneratedArtifact],
        ['checksum mismatch', () => writeGeneratedArtifact(tempRoot, { checksumMismatch: true }), smokeGeneratedArtifact],
        ['missing installed layout mapping', () => writeGeneratedArtifact(tempRoot), fixture => validateHandoff(fixture, { missingMapping: true })],
        ['attempted default resolver use', () => writeGeneratedArtifact(tempRoot), fixture => smokeGeneratedArtifact(fixture, { useDefaultResolver: true })],
        ['attempted hidden TS parser fallback', () => writeGeneratedArtifact(tempRoot), fixture => smokeGeneratedArtifact(fixture, { useTypescriptFallback: true })],
      ]
      for (const [, makeFixture, run] of cases) {
        const result = run(makeFixture())
        assertNoLeaks(result, tempRoot)
      }
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
    assertNoCiReleaseOrPackageScripts(root)
  },
}
