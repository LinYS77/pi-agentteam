const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.4.25-fixture'
const PROTOCOL_VERSION = '1'
const ALLOWED_OS = new Set(['darwin', 'linux', 'win32'])
const ALLOWED_ARCH = new Set(['arm64', 'x64'])
const ALLOWED_LIBC = new Set(['glibc', 'musl'])
const AVAILABILITY_STATUSES = new Set(['available', 'unavailable'])
const FAILURE_KINDS = new Set([
  'manifest_invalid',
  'artifact_missing',
  'artifact_not_executable',
  'artifact_mismatch',
  'unsupported_platform',
])

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempRoot() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0425-artifact-'))
  assert.equal(path.dirname(tempRoot), os.tmpdir(), 'fixture root must be under OS tmpdir')
  return tempRoot
}

function artifactRelPath(platform = process.platform) {
  const extension = platform === 'win32' ? '.cmd' : ''
  return `artifacts/${PACKAGE_NAME}/${PACKAGE_VERSION}/${MODULE}/${platform}-${process.arch}/agentteam-${MODULE}${extension}`
}

function writeFixture(root, options = {}) {
  const platform = options.os || process.platform
  const relPath = options.path || artifactRelPath(platform)
  assert.ok(!path.isAbsolute(relPath), 'fixture path must be relative')
  assert.equal(relPath.includes('..'), false, 'fixture path must not traverse')
  const helperPath = path.join(root, relPath)
  assert.ok(helperPath.startsWith(`${root}${path.sep}`), 'fixture helper must stay under temp root')
  fs.mkdirSync(path.dirname(helperPath), { recursive: true })
  fs.writeFileSync(helperPath, options.content || '#!/bin/sh\necho fixture tmuxSnapshotParse\n')
  if (platform !== 'win32' && options.executable !== false) fs.chmodSync(helperPath, 0o755)
  if (platform !== 'win32' && options.executable === false) fs.chmodSync(helperPath, 0o644)
  const stat = fs.statSync(helperPath)
  const licenseRelPath = `licenses/${MODULE}.license.sha256.placeholder`
  return {
    helperPath,
    manifest: {
      schemaVersion: 1,
      packageName: PACKAGE_NAME,
      packageVersion: PACKAGE_VERSION,
      module: MODULE,
      helperVersion: HELPER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      capability: MODULE,
      os: platform,
      arch: options.arch || process.arch,
      libc: platform === 'linux' ? 'glibc' : undefined,
      path: relPath,
      size: stat.size,
      sha256: sha256(helperPath),
      executable: true,
      provenance: {
        sourceRevision: 'fixture-source-revision-placeholder',
        builder: 'agentteam-v0.4.25-temp-fixture',
        generatedAt: '2026-06-11T00:00:00.000Z',
      },
      license: {
        name: 'MIT',
        path: licenseRelPath,
        sha256: 'license-checksum-placeholder',
      },
    },
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
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
    releaseDecision: 'stop-default-native-fallback-deletion',
  }
}

function compactAvailable() {
  return {
    status: 'available',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'validated-temp-fixture-only',
    releaseDecision: 'prototype-only-not-normal-user-availability',
  }
}

function isSafeArtifactPath(relPath) {
  return typeof relPath === 'string'
    && relPath.startsWith(`artifacts/${PACKAGE_NAME}/${PACKAGE_VERSION}/${MODULE}/`)
    && !relPath.includes('..')
    && !path.isAbsolute(relPath)
    && !/[\\]/.test(relPath)
    && /^artifacts\/pi-agentteam\/0\.6\.8\/tmuxSnapshotParse\/[a-z0-9_-]+-[a-z0-9_-]+\/agentteam-tmuxSnapshotParse(?:\.cmd)?$/.test(relPath)
}

function validateManifest(root, manifest) {
  try {
    if (!manifest || typeof manifest !== 'object') {
      return compactFailure('manifest_invalid', 'regenerate manifest with required fields', 'manifest-shape')
    }
    if (manifest.schemaVersion !== 1) return compactFailure('manifest_invalid', 'use schemaVersion 1', 'schema-version')
    if (manifest.packageName !== PACKAGE_NAME) return compactFailure('manifest_invalid', 'use expected package name', 'package-name')
    if (manifest.packageVersion !== PACKAGE_VERSION) return compactFailure('manifest_invalid', 'use expected package version', 'package-version')
    if (manifest.module !== MODULE) return compactFailure('manifest_invalid', 'use parser module manifest', 'module')
    if (manifest.helperVersion !== HELPER_VERSION) return compactFailure('manifest_invalid', 'use expected helper version', 'helper-version')
    if (manifest.protocolVersion !== PROTOCOL_VERSION) return compactFailure('manifest_invalid', 'use protocol version 1', 'protocol-version')
    if (manifest.capability !== MODULE) return compactFailure('manifest_invalid', 'declare parser capability', 'capability')
    if (!ALLOWED_OS.has(manifest.os) || !ALLOWED_ARCH.has(manifest.arch)) return compactFailure('unsupported_platform', 'add supported platform artifact or keep TypeScript fallback', 'platform')
    if (manifest.os === 'linux' && !ALLOWED_LIBC.has(manifest.libc)) return compactFailure('unsupported_platform', 'declare linux libc target', 'linux-libc')
    if (!isSafeArtifactPath(manifest.path)) return compactFailure('manifest_invalid', 'use package artifact allowlist path', 'artifact-path')
    const helperPath = path.resolve(root, manifest.path)
    const rootPath = path.resolve(root)
    if (!helperPath.startsWith(`${rootPath}${path.sep}`)) return compactFailure('manifest_invalid', 'use package artifact allowlist path', 'artifact-path')
    if (!manifest.provenance || !manifest.provenance.sourceRevision || !manifest.provenance.builder || !manifest.provenance.generatedAt) {
      return compactFailure('manifest_invalid', 'include provenance placeholders', 'provenance')
    }
    if (!manifest.license || !manifest.license.name || !manifest.license.path || !manifest.license.sha256) {
      return compactFailure('manifest_invalid', 'include license metadata placeholders', 'license')
    }
    if (!fs.existsSync(helperPath)) return compactFailure('artifact_missing', 'keep TypeScript fallback and regenerate artifact', 'missing-helper')
    const stat = fs.statSync(helperPath)
    if (manifest.executable === true && manifest.os !== 'win32' && (stat.mode & 0o111) === 0) {
      return compactFailure('artifact_not_executable', 'fix executable mode before package release', 'executable-bit')
    }
    if (stat.size !== manifest.size) return compactFailure('artifact_mismatch', 'regenerate manifest size', 'size')
    if (sha256(helperPath) !== manifest.sha256) return compactFailure('artifact_mismatch', 'regenerate manifest checksum', 'checksum')
    return compactAvailable()
  } catch (_) {
    return compactFailure('manifest_invalid', 'regenerate manifest and keep TypeScript fallback', 'validator-exception')
  }
}

function assertNoLeaks(result, root) {
  const text = JSON.stringify(result)
  assert.equal(text.includes(root), false, 'failure must not leak helper path')
  assert.equal(text.includes(process.cwd()), false, 'failure must not leak repo/cwd')
  assert.equal(/stdout|stderr/i.test(text), false, 'failure must not mention stdout/stderr')
  assert.equal(/Error:|AssertionError|at validateManifest|stack/i.test(text), false, 'failure must not leak stack traces')
  assert.equal(text.includes('fixture-source-revision-placeholder'), false, 'failure must not leak raw provenance body')
  assert.equal(text.includes('license-checksum-placeholder'), false, 'failure must not leak raw license body')
  assert.equal(text.includes('sha256'), false, 'failure must not leak raw manifest checksum field')
  assert.ok(AVAILABILITY_STATUSES.has(result.status), 'result status should use compact availability vocabulary')
  if (result.status === 'unavailable') {
    assert.equal(result.resultMarker, 'fail-closed', 'failures should be fail-closed')
    assert.ok(FAILURE_KINDS.has(result.failureKind), 'failureKind should be compact')
  }
}

function mutateCase(name, fixture) {
  const manifest = clone(fixture.manifest)
  switch (name) {
    case 'missing helper file':
      fs.unlinkSync(fixture.helperPath)
      break
    case 'wrong module':
      manifest.module = 'compactReadModelFingerprint'
      break
    case 'wrong package version':
      manifest.packageVersion = '0.0.0'
      break
    case 'wrong helper version':
      manifest.helperVersion = 'unexpected-helper'
      break
    case 'wrong protocol version':
      manifest.protocolVersion = '2'
      break
    case 'missing capability':
      delete manifest.capability
      break
    case 'unsupported platform':
      manifest.os = 'sunos'
      manifest.path = artifactRelPath('sunos')
      break
    case 'missing linux libc for linux':
      manifest.os = 'linux'
      delete manifest.libc
      break
    case 'non-executable POSIX helper when executable=true':
      if (process.platform === 'win32') return null
      fs.chmodSync(fixture.helperPath, 0o644)
      break
    case 'size mismatch':
      manifest.size += 1
      break
    case 'checksum mismatch':
      manifest.sha256 = '0'.repeat(64)
      break
    case 'missing provenance':
      delete manifest.provenance
      break
    case 'missing license metadata':
      delete manifest.license
      break
    case 'filename outside allowlist':
      manifest.path = `tmp/${MODULE}`
      break
    case 'path traversal':
      manifest.path = `artifacts/${PACKAGE_NAME}/${PACKAGE_VERSION}/${MODULE}/../../escape-helper`
      break
    default:
      throw new Error(`unknown case ${name}`)
  }
  return manifest
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
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest)\.(?:json|jsonc|yaml|yml)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated manifest artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package files must not include native/helper/generated artifacts')
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

async function assertKernelDefaults(kernel) {
  const unset = kernel.createAgentTeamKernelAdapter({ env: {} }).metadata().kernel
  assert.equal(unset.requestedMode, 'disabled', 'unset kernel should remain disabled')
  assert.equal(unset.mode, 'typescript', 'unset kernel should remain TypeScript')
  assert.equal(unset.enabled, false, 'unset kernel should not enable Go')
  const preview = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview' }).metadata().kernel
  assert.equal(preview.requestedMode, 'go-packaged-preview', 'preview should be explicit-only')
  assert.equal(preview.requestedKnownKernel, true, 'packaged preview should remain known')
  assert.equal(preview.enabled, false, 'packaged preview must remain non-default/unavailable without artifact')
  assert.equal(preview.mode, 'typescript', 'packaged preview must not become Go by default')
  assert.equal(preview.fallbacks, 0, 'packaged preview must not use migration fallback count')
}

module.exports = {
  name: 'Go kernel v0.4.25 artifact manifest prototype',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = fs.readFileSync(path.join(root, 'docs/perf/v0.4.25-native-helper-availability-proof.md'), 'utf8')
    const suiteSource = fs.readFileSync(__filename, 'utf8')

    const docLower = doc.toLowerCase()
    for (const expected of [
      'Slice 2 — Generated Artifact Shape and Manifest Validator Prototype',
      'temp-fixture prototype only',
      'not real normal-user availability',
      'no generated artifacts/manifests/helpers are checked in',
      'no package/native/default/fallback behavior is approved',
      'tests/suites/go-kernel-v0425-artifact-manifest-prototype.cjs',
      'TS/pi control plane remains mandatory',
      'Go helper must be invoked behind TS adapter/ports via subprocess/RPC/stdin-stdout',
      'STOP for production runtime resolver behavior',
      'STOP for package metadata changes',
      'STOP for default Go enablement',
      'STOP for TypeScript fallback deletion',
      'STOP for `/team readiness` expansion',
      'STOP for Slice 3 work',
    ]) {
      assert.ok(docLower.includes(expected.toLowerCase()), `doc should include ${expected}`)
    }

    for (const expected of [
      'fs.mkdtempSync(path.join(os.tmpdir()',
      'assert.equal(path.dirname(tempRoot), os.tmpdir()',
      'fs.rmSync(tempRoot, { recursive: true, force: true })',
      'writeFixture(tempRoot',
      'validateManifest(tempRoot',
    ]) {
      assert.ok(suiteSource.includes(expected), `suite should prove temp-only fixture behavior: ${expected}`)
    }

    let tempRoot
    try {
      tempRoot = mkTempRoot()
      const fixture = writeFixture(tempRoot)
      const valid = validateManifest(tempRoot, fixture.manifest)
      assert.equal(valid.status, 'available', 'valid temp manifest should pass')
      assert.equal(valid.releaseDecision, 'prototype-only-not-normal-user-availability')
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    const invalidCases = [
      'missing helper file',
      'wrong module',
      'wrong package version',
      'wrong helper version',
      'wrong protocol version',
      'missing capability',
      'unsupported platform',
      'missing linux libc for linux',
      'non-executable POSIX helper when executable=true',
      'size mismatch',
      'checksum mismatch',
      'missing provenance',
      'missing license metadata',
      'filename outside allowlist',
      'path traversal',
    ]

    for (const name of invalidCases) {
      let caseRoot
      try {
        caseRoot = mkTempRoot()
        const fixture = writeFixture(caseRoot)
        const manifest = mutateCase(name, fixture)
        if (manifest === null) continue
        const result = validateManifest(caseRoot, manifest)
        assert.equal(result.status, 'unavailable', `${name} should fail`) 
        assertNoLeaks(result, caseRoot)
      } finally {
        if (caseRoot) fs.rmSync(caseRoot, { recursive: true, force: true })
      }
    }

    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
    await assertKernelDefaults(env.helpers.requireDist('core/kernel.js'))
  },
}
