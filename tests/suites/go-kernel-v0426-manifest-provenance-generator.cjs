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
const HELPER_VERSION = '0.4.26-generator-fixture'
const PROTOCOL_VERSION = '1'
const TARGETS = [
  { target: 'linux-x64-glibc', os: 'linux', arch: 'x64', libc: 'glibc', file: 'agentteam-tmuxSnapshotParse', mode: 0o755 },
  { target: 'darwin-arm64', os: 'darwin', arch: 'arm64', libc: undefined, file: 'agentteam-tmuxSnapshotParse', mode: 0o755 },
  { target: 'win32-x64', os: 'win32', arch: 'x64', libc: undefined, file: 'agentteam-tmuxSnapshotParse.exe', mode: 0o644 },
]
const FAILURE_KINDS = new Set([
  'manifest_invalid',
  'integrity_mismatch',
  'artifact_not_executable',
  'unsupported_attestation',
])
const REQUIRED_DOC_FIELDS = [
  'schemaVersion',
  'packageName',
  'packageVersion',
  'module',
  'helperVersion',
  'protocolVersion',
  'capabilities',
  'OS/arch/libc',
  'artifact filename/path safe package-relative concept',
  'file size',
  'SHA-256',
  'executable flag / POSIX mode or Windows executable extension policy',
  'sourceRevision placeholder',
  'workflow/run identity placeholder',
  'toolchain identity placeholder',
  'generatedAt policy',
  'license metadata/copy checksum',
  'attestation/signing placeholders that are explicitly not real signing',
]
const FORBIDDEN_DOC = [
  'artifacts are release-ready',
  'signing is real',
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0426-manifest-generator-'))
  assert.equal(path.dirname(tempRoot), os.tmpdir(), 'generator root must be under OS tmpdir')
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
    releaseDecision: 'stop-release-metadata-and-default-native-fallback-deletion',
  }
}

function compactAvailable() {
  return {
    status: 'available',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'generated-temp-fixture-only',
    releaseDecision: 'prototype-only-not-release-metadata',
  }
}

function safeRelPath(target, filename) {
  assert.equal(path.isAbsolute(filename), false, 'filename must be relative')
  assert.equal(filename.includes('..'), false, 'filename must not traverse')
  assert.equal(/[\\/]/.test(filename), false, 'filename must be a simple file name')
  return `artifact-output/${target}/${filename}`
}

function writeFakeHelper(root, targetSpec) {
  const relPath = safeRelPath(targetSpec.target, targetSpec.file)
  const helperPath = path.join(root, relPath)
  assert.ok(helperPath.startsWith(`${root}${path.sep}`), 'helper must stay under temp root')
  fs.mkdirSync(path.dirname(helperPath), { recursive: true })
  fs.writeFileSync(helperPath, `fake helper for ${targetSpec.target}\n`)
  if (targetSpec.os !== 'win32') fs.chmodSync(helperPath, targetSpec.mode)
  return { helperPath, relPath }
}

function generateMetadata(root, targetSpec) {
  const { helperPath, relPath } = writeFakeHelper(root, targetSpec)
  const licensePath = path.join(root, 'artifact-output', targetSpec.target, 'LICENSE')
  fs.writeFileSync(licensePath, 'fixture license metadata only\n')
  const stat = fs.statSync(helperPath)
  const manifest = {
    schemaVersion: 1,
    packageName: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    module: MODULE,
    helperVersion: HELPER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    capabilities: [MODULE],
    os: targetSpec.os,
    arch: targetSpec.arch,
    libc: targetSpec.libc,
    path: relPath,
    filename: targetSpec.file,
    size: stat.size,
    sha256: sha256(helperPath),
    executable: targetSpec.os === 'win32' ? targetSpec.file.endsWith('.exe') : (stat.mode & 0o111) !== 0,
    mode: targetSpec.os === 'win32' ? 'extension-policy' : `0${(stat.mode & 0o777).toString(8)}`,
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
    attestation: {
      kind: 'placeholder-only',
      signed: false,
      signing: 'not-real-signing',
    },
  }
  const manifestPath = path.join(root, 'artifact-output', targetSpec.target, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  const checksumPath = path.join(root, 'artifact-output', targetSpec.target, 'SHA256SUMS')
  fs.writeFileSync(checksumPath, `${manifest.sha256}  ${targetSpec.file}\n`)
  const provenancePath = path.join(root, 'artifact-output', targetSpec.target, 'provenance.json')
  fs.writeFileSync(provenancePath, JSON.stringify(manifest.provenance, null, 2))
  return { root, helperPath, licensePath, manifestPath, checksumPath, provenancePath, manifest }
}

function validateMetadata(fixture) {
  try {
    const manifest = fixture.manifest
    if (!manifest || manifest.schemaVersion !== 1) return compactFailure('manifest_invalid', 'regenerate manifest schema', 'schema')
    if (manifest.packageName !== PACKAGE_NAME || manifest.packageVersion !== PACKAGE_VERSION) return compactFailure('manifest_invalid', 'regenerate package metadata', 'package')
    if (manifest.module !== MODULE) return compactFailure('manifest_invalid', 'regenerate module metadata', 'module')
    if (manifest.helperVersion !== HELPER_VERSION) return compactFailure('manifest_invalid', 'regenerate helper version metadata', 'helper-version')
    if (manifest.protocolVersion !== PROTOCOL_VERSION) return compactFailure('manifest_invalid', 'regenerate protocol metadata', 'protocol')
    if (!Array.isArray(manifest.capabilities) || !manifest.capabilities.includes(MODULE)) return compactFailure('manifest_invalid', 'regenerate capability metadata', 'capability')
    if (!manifest.os || !manifest.arch || (manifest.os === 'linux' && !manifest.libc)) return compactFailure('manifest_invalid', 'regenerate platform metadata', 'platform')
    if (typeof manifest.path !== 'string' || path.isAbsolute(manifest.path) || manifest.path.includes('..') || /\\/.test(manifest.path)) return compactFailure('manifest_invalid', 'regenerate safe artifact path', 'path')
    const helperPath = path.resolve(fixture.root, manifest.path)
    if (!helperPath.startsWith(`${path.resolve(fixture.root)}${path.sep}`)) return compactFailure('manifest_invalid', 'regenerate safe artifact path', 'path')
    if (!fs.existsSync(helperPath)) return compactFailure('manifest_invalid', 'regenerate artifact output', 'helper')
    const stat = fs.statSync(helperPath)
    if (stat.size !== manifest.size) return compactFailure('integrity_mismatch', 'regenerate size metadata', 'size')
    if (sha256(helperPath) !== manifest.sha256) return compactFailure('integrity_mismatch', 'regenerate checksum metadata', 'checksum')
    if (manifest.os === 'win32') {
      if (!manifest.filename.endsWith('.exe') || manifest.executable !== true) return compactFailure('artifact_not_executable', 'regenerate Windows executable metadata', 'executable')
    } else if (manifest.executable !== true || (stat.mode & 0o111) === 0) {
      return compactFailure('artifact_not_executable', 'regenerate POSIX executable metadata', 'executable')
    }
    if (!manifest.provenance || !manifest.provenance.sourceRevision || !manifest.provenance.workflowRun || !manifest.provenance.toolchain || !manifest.provenance.generatedAt) return compactFailure('manifest_invalid', 'regenerate provenance metadata', 'provenance')
    if (!manifest.license || !manifest.license.name || !manifest.license.path || !manifest.license.sha256) return compactFailure('manifest_invalid', 'regenerate license metadata', 'license')
    if (!manifest.attestation || manifest.attestation.kind !== 'placeholder-only' || manifest.attestation.signed !== false || manifest.attestation.signing !== 'not-real-signing') return compactFailure('unsupported_attestation', 'do not claim real signing without proof', 'attestation')
    return compactAvailable()
  } catch (_) {
    return compactFailure('manifest_invalid', 'regenerate metadata and keep release blocked', 'exception')
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mutateFixture(fixture, name) {
  const next = { ...fixture, manifest: clone(fixture.manifest) }
  switch (name) {
    case 'missing provenance':
      delete next.manifest.provenance
      break
    case 'missing license':
      delete next.manifest.license
      break
    case 'checksum mismatch':
      next.manifest.sha256 = '0'.repeat(64)
      break
    case 'size mismatch':
      next.manifest.size += 1
      break
    case 'unsafe artifact path':
      next.manifest.path = '../escape/agentteam-tmuxSnapshotParse'
      break
    case 'wrong module':
      next.manifest.module = 'compactReadModelFingerprint'
      break
    case 'wrong protocol':
      next.manifest.protocolVersion = '2'
      break
    case 'wrong capability':
      next.manifest.capabilities = ['compactReadModelFingerprint']
      break
    case 'real signing claim without proof':
      next.manifest.attestation = { kind: 'signed-provenance', signed: true, signing: 'real-signing-claim' }
      break
    default:
      throw new Error(`unknown case ${name}`)
  }
  return next
}

function assertNoLeaks(result, root) {
  const text = JSON.stringify(result)
  assert.equal(text.includes(root), false, 'failure must not leak temp root')
  assert.equal(text.includes(process.cwd()), false, 'failure must not leak repo/cwd')
  assert.equal(/stdout|stderr/i.test(text), false, 'failure must not mention stdout/stderr')
  assert.equal(/Error:|AssertionError|at validateMetadata|stack/i.test(text), false, 'failure must not leak stack traces')
  assert.equal(/source-revision-placeholder|workflow-run-placeholder|toolchain-identity-placeholder/i.test(text), false, 'failure must not leak raw provenance body')
  assert.equal(/fixture license metadata|license metadata only/i.test(text), false, 'failure must not leak raw license body')
  assert.equal(/artifact-output\//i.test(text), false, 'failure must not leak package internals')
  assert.equal(result.status, 'unavailable', 'negative case should be unavailable')
  assert.equal(result.resultMarker, 'fail-closed', 'negative case should fail closed')
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
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|provenance|attestation\.intoto)\.(?:json|jsonc|yaml|yml|jsonl)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated manifest/package artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|generated|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package files must not include native/helper/generated outputs')
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
  name: 'Go kernel v0.4.26 manifest provenance generator',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = fs.readFileSync(path.join(root, DOC), 'utf8')
    const lower = doc.toLowerCase()

    for (const expected of [
      'Slice 4 — Manifest / Checksum / Provenance / License / Executable Generator Prototype',
      'Slice 4 is test-local generator prototype only',
      'Focused suite: `tests/suites/go-kernel-v0426-manifest-provenance-generator.cjs`',
      'Generated metadata is not committed and not release metadata',
      'Attestation/signing fields are placeholders only and must not be represented as real signing',
      'No package/native/default/fallback behavior is approved',
      'Slice 4 preserves Slice 1-3 boundaries',
      'STOP for later work without separate approval',
      'Proceed only with GitHub-only v0.4.26 Go helper artifact generation pipeline prototype checkpoint review after leader/user approval',
    ]) {
      assert.ok(lower.includes(expected.toLowerCase()), `doc should include ${expected}`)
    }
    for (const expected of REQUIRED_DOC_FIELDS) assertIncludes(doc, expected, 'generator field doc')
    for (const forbidden of FORBIDDEN_DOC) assert.equal(doc.includes(forbidden), false, `doc must not imply forbidden policy: ${forbidden}`)

    let tempRoot
    try {
      tempRoot = mkTempRoot()
      const fixture = generateMetadata(tempRoot, TARGETS[0])
      for (const generatedPath of [fixture.helperPath, fixture.licensePath, fixture.manifestPath, fixture.checksumPath, fixture.provenancePath]) {
        assert.ok(generatedPath.startsWith(`${tempRoot}${path.sep}`), 'generated metadata must stay under OS temp root')
        assert.equal(generatedPath.startsWith(root), false, 'generated metadata must not be under repo root')
      }
      const positive = validateMetadata(fixture)
      assert.equal(positive.status, 'available', 'positive generated metadata should pass')
      assert.equal(positive.releaseDecision, 'prototype-only-not-release-metadata')

      for (const name of [
        'missing provenance',
        'missing license',
        'checksum mismatch',
        'size mismatch',
        'unsafe artifact path',
        'wrong module',
        'wrong protocol',
        'wrong capability',
        'real signing claim without proof',
      ]) {
        const result = validateMetadata(mutateFixture(fixture, name))
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

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}
