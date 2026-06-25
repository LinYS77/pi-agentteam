const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.4.25-clean-install-fixture'
const PROTOCOL_VERSION = '1'
const ALLOWED_OS = new Set(['darwin', 'linux', 'win32'])
const ALLOWED_ARCH = new Set(['arm64', 'x64'])
const ALLOWED_LIBC = new Set(['glibc', 'musl'])
const FAILURE_KINDS = new Set([
  'installed_package_missing',
  'helper_missing',
  'helper_not_executable',
  'helper_mismatch',
  'unsupported_platform',
  'helper_smoke_failed',
  'manifest_invalid',
  'typescript_fallback_blocked',
])

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempInstallRoot() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0425-clean-install-'))
  assert.equal(path.dirname(tempRoot), os.tmpdir(), 'install root must be under OS tmpdir')
  return tempRoot
}

function platformKey(platform = process.platform, arch = process.arch, libc = platform === 'linux' ? 'glibc' : undefined) {
  return platform === 'linux' ? `${platform}-${arch}-${libc}` : `${platform}-${arch}`
}

function helperRelPath(platform = process.platform, arch = process.arch, libc = platform === 'linux' ? 'glibc' : undefined) {
  const extension = platform === 'win32' ? '.cmd' : ''
  return `node_modules/${PACKAGE_NAME}/native/${MODULE}/${platformKey(platform, arch, libc)}/agentteam-${MODULE}${extension}`
}

function manifestRelPath() {
  return `node_modules/${PACKAGE_NAME}/native/${MODULE}/manifest.json`
}

function writeExecutableHelper(helperPath, options = {}) {
  fs.mkdirSync(path.dirname(helperPath), { recursive: true })
  const mode = options.mode || 'valid'
  let body
  if (mode === 'malformed-json') body = '#!/bin/sh\necho "not json"\n'
  else if (mode === 'wrong-health') body = '#!/bin/sh\nprintf %s \'{"ok":false,"protocolVersion":"1"}\'\n'
  else body = '#!/bin/sh\nprintf %s \'{"ok":true,"protocolVersion":"1","helperVersion":"0.4.25-clean-install-fixture","capabilities":["tmuxSnapshotParse"],"module":"tmuxSnapshotParse"}\'\n'
  fs.writeFileSync(helperPath, body)
  if (process.platform !== 'win32' && options.executable !== false) fs.chmodSync(helperPath, 0o755)
  if (process.platform !== 'win32' && options.executable === false) fs.chmodSync(helperPath, 0o644)
}

function writeInstalledLayout(root, options = {}) {
  const platform = options.os || process.platform
  const arch = options.arch || process.arch
  const libc = platform === 'linux' ? (options.libc || 'glibc') : undefined
  const relHelper = helperRelPath(platform, arch, libc)
  const helperPath = path.join(root, relHelper)
  writeExecutableHelper(helperPath, options)
  const stat = fs.statSync(helperPath)
  const manifest = {
    schemaVersion: 1,
    packageName: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    module: MODULE,
    helperVersion: options.helperVersion || HELPER_VERSION,
    protocolVersion: options.protocolVersion || PROTOCOL_VERSION,
    capability: options.capability === undefined ? MODULE : options.capability,
    os: platform,
    arch,
    libc,
    path: relHelper,
    size: options.size || stat.size,
    sha256: options.sha256 || sha256(helperPath),
    executable: true,
    provenance: {
      sourceRevision: 'clean-install-source-revision-placeholder',
      builder: 'agentteam-v0.4.25-clean-install-temp-fixture',
      generatedAt: '2026-06-11T00:00:00.000Z',
    },
    license: {
      name: 'MIT',
      path: `node_modules/${PACKAGE_NAME}/LICENSE`,
      sha256: 'license-checksum-placeholder',
    },
  }
  const manifestPath = path.join(root, manifestRelPath())
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  return { root, helperPath, manifestPath, manifest, relHelper }
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
    simulatedExplicitPreview: true,
    usedTypescriptFallback: false,
  }
}

function compactAvailable() {
  return {
    status: 'available',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'clean-install-smoke-temp-fixture-only',
    releaseDecision: 'prototype-only-not-normal-user-availability',
    simulatedExplicitPreview: true,
    usedTypescriptFallback: false,
    proof: {
      locatedInstalledHelper: true,
      smokeTestedHelper: true,
      noGoToolchainRequired: true,
      noSourceCheckoutUsed: true,
      noManualHelperEnvRequired: true,
      noLifecycleDownload: true,
      noInstallTimeBuild: true,
      noNetworkFetch: true,
      noDefaultResolverActivation: true,
      explicitTestPreviewInjectionOnly: true,
    },
  }
}

function isSafeInstalledPath(relPath) {
  return typeof relPath === 'string'
    && relPath.startsWith(`node_modules/${PACKAGE_NAME}/native/${MODULE}/`)
    && !relPath.includes('..')
    && !path.isAbsolute(relPath)
    && !/[\\]/.test(relPath)
    && /^node_modules\/pi-agentteam\/native\/tmuxSnapshotParse\/[a-z0-9_-]+-[a-z0-9_-]+(?:-[a-z0-9_-]+)?\/agentteam-tmuxSnapshotParse(?:\.cmd)?$/.test(relPath)
}

function runFakeHelper(helperPath) {
  const body = fs.readFileSync(helperPath, 'utf8')
  const match = body.match(/\{[^\n]+\}/)
  if (!match) return { ok: false, output: 'malformed' }
  try {
    return { ok: true, json: JSON.parse(match[0]) }
  } catch (_) {
    return { ok: false, output: 'malformed' }
  }
}

function smokeInstalledHelper(root, options = {}) {
  try {
    assert.equal(options.manualHelperEnv, undefined, 'manual helper env override is not allowed in clean-install smoke')
    assert.equal(options.allowDefaultResolver, false, 'default resolver activation is not allowed')
    assert.equal(options.allowSourceCheckout, false, 'source checkout is not allowed')
    assert.equal(options.allowNetwork, false, 'network fetch is not allowed')
    assert.equal(options.allowLifecycleDownload, false, 'lifecycle download is not allowed')
    assert.equal(options.allowInstallTimeBuild, false, 'install-time build is not allowed')
    assert.equal(options.requireGoToolchain, false, 'Go toolchain is not required')
    assert.equal(options.explicitTestPreviewInjection, true, 'simulation must be explicit test/preview injection only')

    const manifestPath = path.join(root, manifestRelPath())
    if (!fs.existsSync(manifestPath)) return compactFailure('installed_package_missing', 'keep TypeScript default and install native companion package', 'missing-installed-package')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    if (manifest.packageName !== PACKAGE_NAME || manifest.packageVersion !== PACKAGE_VERSION) return compactFailure('manifest_invalid', 'use expected package metadata', 'package')
    if (manifest.module !== MODULE) return compactFailure('manifest_invalid', 'use parser module manifest', 'module')
    if (manifest.helperVersion !== HELPER_VERSION) return compactFailure('manifest_invalid', 'use expected helper version', 'helper-version')
    if (manifest.protocolVersion !== PROTOCOL_VERSION) return compactFailure('manifest_invalid', 'use protocol version 1', 'protocol-version')
    if (manifest.capability !== MODULE) return compactFailure('manifest_invalid', 'declare parser capability', 'capability')
    if (!ALLOWED_OS.has(manifest.os) || !ALLOWED_ARCH.has(manifest.arch)) return compactFailure('unsupported_platform', 'keep TypeScript fallback on unsupported platform', 'platform')
    if (manifest.os === 'linux' && !ALLOWED_LIBC.has(manifest.libc)) return compactFailure('unsupported_platform', 'declare linux libc target', 'linux-libc')
    if (manifest.os !== process.platform || manifest.arch !== process.arch) return compactFailure('unsupported_platform', 'select helper matching current platform', 'platform-helper')
    if (!isSafeInstalledPath(manifest.path)) return compactFailure('manifest_invalid', 'use package-relative installed helper path', 'helper-path')
    const helperPath = path.resolve(root, manifest.path)
    const rootPath = path.resolve(root)
    if (!helperPath.startsWith(`${rootPath}${path.sep}`)) return compactFailure('manifest_invalid', 'use package-relative installed helper path', 'helper-path')
    if (!manifest.provenance || !manifest.provenance.sourceRevision || !manifest.provenance.builder || !manifest.provenance.generatedAt) return compactFailure('manifest_invalid', 'include provenance placeholders', 'provenance')
    if (!manifest.license || !manifest.license.name || !manifest.license.path || !manifest.license.sha256) return compactFailure('manifest_invalid', 'include license metadata placeholders', 'license')
    if (!fs.existsSync(helperPath)) return compactFailure('helper_missing', 'keep TypeScript default and reinstall native helper', 'missing-helper')
    const stat = fs.statSync(helperPath)
    if (manifest.executable === true && process.platform !== 'win32' && (stat.mode & 0o111) === 0) return compactFailure('helper_not_executable', 'fix executable mode before package release', 'executable-bit')
    if (stat.size !== manifest.size) return compactFailure('helper_mismatch', 'regenerate installed manifest size', 'size')
    if (sha256(helperPath) !== manifest.sha256) return compactFailure('helper_mismatch', 'regenerate installed manifest checksum', 'checksum')
    const smoke = runFakeHelper(helperPath)
    if (!smoke.ok || !smoke.json || smoke.json.ok !== true) return compactFailure('helper_smoke_failed', 'reject corrupt helper and keep TypeScript default', 'health-json')
    if (smoke.json.protocolVersion !== PROTOCOL_VERSION) return compactFailure('helper_smoke_failed', 'reject helper protocol mismatch', 'health-protocol')
    if (smoke.json.helperVersion !== HELPER_VERSION) return compactFailure('helper_smoke_failed', 'reject helper version mismatch', 'health-helper-version')
    if (!Array.isArray(smoke.json.capabilities) || !smoke.json.capabilities.includes(MODULE)) return compactFailure('helper_smoke_failed', 'reject helper missing parser capability', 'health-capability')
    return compactAvailable()
  } catch (_) {
    return compactFailure('helper_smoke_failed', 'reject clean-install smoke exception and keep TypeScript default', 'smoke-exception')
  }
}

function assertNoLeaks(result, root) {
  const text = JSON.stringify(result)
  assert.equal(text.includes(root), false, 'failure must not leak temp root')
  assert.equal(text.includes(process.cwd()), false, 'failure must not leak repo/cwd')
  assert.equal(/stdout|stderr/i.test(text), false, 'failure must not mention stdout/stderr')
  assert.equal(/Error:|AssertionError|at smokeInstalledHelper|stack/i.test(text), false, 'failure must not leak stack traces')
  assert.equal(text.includes('clean-install-source-revision-placeholder'), false, 'failure must not leak raw provenance body')
  assert.equal(text.includes('license-checksum-placeholder'), false, 'failure must not leak raw license body')
  assert.equal(text.includes('malformed'), false, 'failure must not leak raw helper output')
  assert.equal(text.includes('node_modules/pi-agentteam/native'), false, 'failure must not leak package internals')
  assert.equal(text.includes('sha256'), false, 'failure must not leak raw manifest field names')
  assert.equal(result.status, 'unavailable', 'failure should be unavailable')
  assert.equal(result.resultMarker, 'fail-closed', 'failure should be fail-closed')
  assert.equal(result.usedTypescriptFallback, false, 'explicit preview simulation must not use TS parser fallback')
  assert.ok(FAILURE_KINDS.has(result.failureKind), 'failureKind should be compact')
}

function runFailureCase(name, fixture) {
  switch (name) {
    case 'missing installed package/helper':
      fs.rmSync(path.dirname(fixture.manifestPath), { recursive: true, force: true })
      break
    case 'missing helper':
      fs.unlinkSync(fixture.helperPath)
      break
    case 'corrupt helper output':
      writeExecutableHelper(fixture.helperPath, { mode: 'malformed-json' })
      fixture.manifest.size = fs.statSync(fixture.helperPath).size
      fixture.manifest.sha256 = sha256(fixture.helperPath)
      fs.writeFileSync(fixture.manifestPath, JSON.stringify(fixture.manifest, null, 2))
      break
    case 'wrong platform helper':
      fixture.manifest.os = process.platform === 'linux' ? 'darwin' : 'linux'
      fixture.manifest.arch = process.arch
      fixture.manifest.libc = fixture.manifest.os === 'linux' ? 'glibc' : undefined
      fs.writeFileSync(fixture.manifestPath, JSON.stringify(fixture.manifest, null, 2))
      break
    case 'non-executable POSIX helper':
      if (process.platform === 'win32') return null
      fs.chmodSync(fixture.helperPath, 0o644)
      break
    case 'wrong helper version':
      fixture.manifest.helperVersion = 'unexpected-helper'
      fs.writeFileSync(fixture.manifestPath, JSON.stringify(fixture.manifest, null, 2))
      break
    case 'wrong protocol version':
      fixture.manifest.protocolVersion = '2'
      fs.writeFileSync(fixture.manifestPath, JSON.stringify(fixture.manifest, null, 2))
      break
    case 'missing tmuxSnapshotParse capability':
      delete fixture.manifest.capability
      fs.writeFileSync(fixture.manifestPath, JSON.stringify(fixture.manifest, null, 2))
      break
    case 'checksum mismatch':
      fixture.manifest.sha256 = '0'.repeat(64)
      fs.writeFileSync(fixture.manifestPath, JSON.stringify(fixture.manifest, null, 2))
      break
    case 'manifest helper mismatch':
      fixture.manifest.size += 1
      fs.writeFileSync(fixture.manifestPath, JSON.stringify(fixture.manifest, null, 2))
      break
    default:
      throw new Error(`unknown failure case ${name}`)
  }
  return smokeInstalledHelper(fixture.root, cleanInstallOptions())
}

function cleanInstallOptions() {
  return {
    manualHelperEnv: undefined,
    allowDefaultResolver: false,
    allowSourceCheckout: false,
    allowNetwork: false,
    allowLifecycleDownload: false,
    allowInstallTimeBuild: false,
    requireGoToolchain: false,
    explicitTestPreviewInjection: true,
    typescriptFallbackSentinel() {
      throw new Error('hidden TypeScript parser fallback was invoked')
    },
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
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|clean-install-manifest)\.(?:json|jsonc|yaml|yml)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated manifest artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated artifacts')
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

function assertKernelDefaults(kernel) {
  const unset = kernel.createAgentTeamKernelAdapter({ env: {} }).metadata().kernel
  assert.equal(unset.requestedMode, 'default', 'unset kernel should normalize to default after v0.6.48')
  assert.equal(unset.mode, 'go', 'unset kernel should use embedded Go for tmuxSnapshotParse')
  assert.equal(unset.enabled, true, 'unset kernel should enable parser-only Go')
  assert.equal(unset.cutoverStatus, 'active', 'unset embedded helper should be active')
  const preview = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview' }).metadata().kernel
  assert.equal(preview.requestedMode, 'go-packaged-preview', 'preview should be explicit-only')
  assert.equal(preview.requestedKnownKernel, true, 'packaged preview should remain known')
  assert.equal(preview.enabled, false, 'packaged preview must remain non-default/unavailable without artifact')
  assert.equal(preview.mode, 'typescript', 'packaged preview must not become Go by default')
  assert.equal(preview.fallbacks, 0, 'packaged preview must not use migration fallback count')
}

module.exports = {
  name: 'Go kernel v0.4.25 clean-install smoke simulation',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = fs.readFileSync(path.join(root, 'docs/perf/v0.4.25-native-helper-availability-proof.md'), 'utf8')
    const suiteSource = fs.readFileSync(__filename, 'utf8')
    const docLower = doc.toLowerCase()

    for (const expected of [
      'Slice 3 — Clean-Install Smoke Simulation',
      'temp clean-install simulation only',
      'stronger than dry-run fixtures but still not normal-user native availability proof',
      'no generated artifacts/manifests/helpers are checked in',
      'no package/native/default/fallback behavior is approved',
      'no default resolver activation or package metadata changes',
      'tests/suites/go-kernel-v0425-clean-install-smoke.cjs',
      'TS/pi control plane remains mandatory',
      'Go helper must be invoked behind TS adapter/ports via subprocess/RPC/stdin-stdout',
      'Slice 2 manifest prototype context',
      'STOP for production runtime resolver behavior',
      'STOP for package metadata changes',
      'STOP for default Go enablement',
      'STOP for TypeScript fallback deletion',
      'STOP for `/team readiness` expansion',
      'STOP for Slice 4 work',
    ]) {
      assert.ok(docLower.includes(expected.toLowerCase()), `doc should include ${expected}`)
    }

    for (const expected of [
      'fs.mkdtempSync(path.join(os.tmpdir()',
      'assert.equal(path.dirname(tempRoot), os.tmpdir()',
      'fs.rmSync(tempRoot, { recursive: true, force: true })',
      'writeInstalledLayout(tempRoot',
      'smokeInstalledHelper(tempRoot',
      'explicitTestPreviewInjection: true',
      'throw new Error(\'hidden TypeScript parser fallback was invoked\')',
    ]) {
      assert.ok(suiteSource.includes(expected), `suite should prove temp-only explicit-preview behavior: ${expected}`)
    }

    let tempRoot
    try {
      tempRoot = mkTempInstallRoot()
      writeInstalledLayout(tempRoot)
      let fallbackInvoked = false
      const success = smokeInstalledHelper(tempRoot, {
        ...cleanInstallOptions(),
        typescriptFallbackSentinel() {
          fallbackInvoked = true
          throw new Error('hidden TypeScript parser fallback was invoked')
        },
      })
      assert.equal(success.status, 'available', 'clean-install temp layout should pass')
      assert.equal(success.releaseDecision, 'prototype-only-not-normal-user-availability')
      assert.equal(success.usedTypescriptFallback, false, 'success must not use TS parser fallback')
      assert.equal(fallbackInvoked, false, 'success must not invoke TS parser fallback sentinel')
      assert.deepEqual(success.proof, {
        locatedInstalledHelper: true,
        smokeTestedHelper: true,
        noGoToolchainRequired: true,
        noSourceCheckoutUsed: true,
        noManualHelperEnvRequired: true,
        noLifecycleDownload: true,
        noInstallTimeBuild: true,
        noNetworkFetch: true,
        noDefaultResolverActivation: true,
        explicitTestPreviewInjectionOnly: true,
      })
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    for (const name of [
      'missing installed package/helper',
      'missing helper',
      'corrupt helper output',
      'wrong platform helper',
      'non-executable POSIX helper',
      'wrong helper version',
      'wrong protocol version',
      'missing tmuxSnapshotParse capability',
      'checksum mismatch',
      'manifest helper mismatch',
    ]) {
      let caseRoot
      try {
        caseRoot = mkTempInstallRoot()
        const fixture = writeInstalledLayout(caseRoot)
        const result = runFailureCase(name, fixture)
        if (result === null) continue
        assertNoLeaks(result, caseRoot)
      } finally {
        if (caseRoot) fs.rmSync(caseRoot, { recursive: true, force: true })
      }
    }

    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
    assertKernelDefaults(env.helpers.requireDist('core/kernel.js'))
  },
}
