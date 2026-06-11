const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.22-native-helper-package-metadata.md'
const PLAN = 'docs/agentteam方案书.md'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const MODULE = 'tmuxSnapshotParse'
const PACKAGE_NAME = '@earendil-works/pi-agentteam-go-helper-linux-x64'
const HELPER_FILE = 'bin/agentteam-tmux-snapshot-helper'
const MANIFEST_FILE = 'manifest/agentteam-go-helper-manifest.json'
const PACKAGE_FILES = ['README.md', 'LICENSE', MANIFEST_FILE, HELPER_FILE]
const SUPPORTED_PLATFORM = Object.freeze({ os: 'linux', arch: 'x64', libc: 'glibc' })

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
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

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function writeFixture(root, options = {}) {
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true })
  fs.mkdirSync(path.join(root, 'manifest'), { recursive: true })
  const helperPath = path.join(root, options.helperFilename || HELPER_FILE)
  fs.mkdirSync(path.dirname(helperPath), { recursive: true })
  fs.writeFileSync(helperPath, options.helperContent || '#!/usr/bin/env node\n', 'utf8')
  fs.chmodSync(helperPath, options.executable === false ? 0o644 : 0o755)
  const packageFiles = options.packageFiles || PACKAGE_FILES
  const packageJson = {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    license: 'MIT',
    os: ['linux'],
    cpu: ['x64'],
    files: [...packageFiles],
  }
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(root, 'README.md'), '# manifest compatibility fixture\n', 'utf8')
  fs.writeFileSync(path.join(root, 'LICENSE'), 'MIT\n', 'utf8')
  const stat = fs.statSync(helperPath)
  const manifest = {
    schemaVersion: 1,
    package: { name: PACKAGE_NAME, version: PACKAGE_VERSION },
    helper: {
      version: HELPER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      module: MODULE,
      os: SUPPORTED_PLATFORM.os,
      arch: SUPPORTED_PLATFORM.arch,
      libc: SUPPORTED_PLATFORM.libc,
      filename: options.helperFilename || HELPER_FILE,
      size: stat.size,
      sha256: sha256(helperPath),
      executable: options.executable === false ? false : true,
    },
    provenance: {
      sourceRevision: 'SOURCE_REVISION_PLACEHOLDER',
      generatedBy: 'manifest-compatibility-test',
      attestation: 'PROVENANCE_ATTESTATION_PLACEHOLDER',
    },
    licenses: [{ name: 'agentteam-go-helper', license: 'MIT', path: 'LICENSE' }],
  }
  if (options.manifestMutator) options.manifestMutator(manifest)
  fs.writeFileSync(path.join(root, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return { helperPath, manifest, packageJson }
}

function validateManifest(root, manifest, packageJson) {
  if (manifest.schemaVersion !== 1) return { ok: false, reason: 'helper-incompatible-response', detail: 'schemaVersion' }
  if (manifest.package?.name !== packageJson.name || manifest.package?.name !== PACKAGE_NAME) return { ok: false, reason: 'helper-incompatible-response', detail: 'package.name' }
  if (manifest.package?.version !== PACKAGE_VERSION || packageJson.version !== PACKAGE_VERSION) return { ok: false, reason: 'helper-unsupported-version', detail: 'package.version' }
  if (manifest.helper?.version !== HELPER_VERSION) return { ok: false, reason: 'helper-unsupported-version', detail: 'helper.version' }
  if (manifest.helper?.protocolVersion !== PROTOCOL_VERSION) return { ok: false, reason: 'helper-unsupported-protocol', detail: 'helper.protocolVersion' }
  if (manifest.helper?.module !== MODULE) return { ok: false, reason: 'helper-unsupported-capability', detail: 'helper.module' }
  if (manifest.helper?.os !== SUPPORTED_PLATFORM.os || manifest.helper?.arch !== SUPPORTED_PLATFORM.arch) return { ok: false, reason: 'missing-helper', detail: 'unsupported-platform' }
  if (manifest.helper?.os === 'linux' && !manifest.helper?.libc) return { ok: false, reason: 'missing-helper', detail: 'linux-libc' }
  if (manifest.helper?.libc !== SUPPORTED_PLATFORM.libc) return { ok: false, reason: 'missing-helper', detail: 'platform-libc' }
  if (typeof manifest.helper?.filename !== 'string' || !packageJson.files.includes(manifest.helper.filename)) return { ok: false, reason: 'helper-incompatible-response', detail: 'helper.filename' }
  const helperPath = path.join(root, manifest.helper.filename || '')
  if (!fs.existsSync(helperPath)) return { ok: false, reason: 'missing-helper', detail: 'helper missing' }
  const stat = fs.statSync(helperPath)
  if (manifest.helper.executable !== true || !(stat.mode & 0o111)) return { ok: false, reason: 'helper-spawn-error', detail: 'permission-denied' }
  if (manifest.helper.size !== stat.size) return { ok: false, reason: 'helper-incompatible-response', detail: 'helper.size' }
  if (manifest.helper.sha256 !== sha256(helperPath)) return { ok: false, reason: 'helper-incompatible-response', detail: 'helper.sha256' }
  if (!manifest.provenance?.sourceRevision || !manifest.provenance?.generatedBy || !manifest.provenance?.attestation) return { ok: false, reason: 'helper-incompatible-response', detail: 'provenance' }
  if (!Array.isArray(manifest.licenses) || !manifest.licenses.some(item => item.license === 'MIT' && item.path === 'LICENSE')) return { ok: false, reason: 'helper-incompatible-response', detail: 'licenses' }
  return { ok: true, helperPath }
}

function assertFailure(root, mutate, expectedDetail, label) {
  const { manifest, packageJson } = writeFixture(root, { manifestMutator: mutate.manifest, packageFiles: mutate.packageFiles, helperFilename: mutate.helperFilename, executable: mutate.executable, helperContent: mutate.helperContent })
  if (mutate.afterWrite) mutate.afterWrite(root, manifest, packageJson)
  const result = validateManifest(root, manifest, packageJson)
  assert.equal(result.ok, false, `${label} should fail validation`)
  assert.equal(result.detail, expectedDetail, `${label} detail`)
  assert.ok(['missing-helper', 'helper-spawn-error', 'helper-incompatible-response', 'helper-unsupported-version', 'helper-unsupported-protocol', 'helper-unsupported-capability'].includes(result.reason), `${label} should map to compact fail-closed kind`)
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'main package version must remain unchanged')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'main package must not define optionalDependencies')
  assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'main package files must exclude kernel/')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `main package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    assert.equal(/go\s+(?:build|install)\b/.test(command), false, `${name} must not build/install helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not download/build native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
  const nativeArtifacts = walkFiles(root)
    .filter(file => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}.git${path.sep}`))
    .filter(file => /\.(?:exe|dll|so|dylib)$/i.test(file))
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
  assert.deepEqual(nativeArtifacts, [], 'native artifacts must not be checked in')
}

module.exports = {
  name: 'Go kernel v0.4.22 manifest compatibility guard',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    assert.ok(doc.includes('## Slice 4 Manifest Compatibility and Provenance Guard'), 'metadata doc should include Slice 4 manifest section')
    assert.ok(doc.includes('version/protocol/package/platform/checksum skew must fail closed'), 'metadata doc should record fail-closed skew policy')
    assert.ok(doc.includes('provenance.sourceRevision'), 'metadata doc should mention provenance.sourceRevision')
    assert.ok(doc.includes('licenses'), 'metadata doc should mention licenses')
    assert.ok(plan.includes('tests/suites/go-kernel-v0422-manifest-compatibility-guard.cjs'), 'roadmap should reference Slice 4 manifest guard suite')

    const tempRoots = []
    let primaryRoot
    try {
      primaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0422-manifest-compat-'))
      tempRoots.push(primaryRoot)
      const { manifest, packageJson, helperPath } = writeFixture(primaryRoot)
      assert.equal(primaryRoot.startsWith(os.tmpdir()), true, 'manifest fixtures should live under os tmpdir')
      assert.equal(primaryRoot.includes(root), false, 'manifest fixtures must not live under repo')
      assert.deepEqual(Object.keys(manifest).sort(), ['helper', 'licenses', 'package', 'provenance', 'schemaVersion'].sort(), 'manifest top-level fields')
      for (const field of ['version', 'protocolVersion', 'module', 'os', 'arch', 'libc', 'filename', 'size', 'sha256', 'executable']) {
        assert.ok(Object.prototype.hasOwnProperty.call(manifest.helper, field), `manifest.helper.${field} should exist`)
      }
      assert.equal(validateManifest(primaryRoot, manifest, packageJson).ok, true, 'valid manifest should pass')
      assert.equal(validateManifest(primaryRoot, manifest, packageJson).helperPath, helperPath, 'valid manifest should return helper path')

      const cases = [
        ['mismatched package version', { manifest: m => { m.package.version = '9.9.9' } }, 'package.version'],
        ['wrong helper version', { manifest: m => { m.helper.version = '9.9.9' } }, 'helper.version'],
        ['wrong protocol', { manifest: m => { m.helper.protocolVersion = 99 } }, 'helper.protocolVersion'],
        ['wrong module', { manifest: m => { m.helper.module = 'compactReadModelFingerprint' } }, 'helper.module'],
        ['unsupported platform', { manifest: m => { m.helper.os = 'freebsd' } }, 'unsupported-platform'],
        ['missing Linux libc', { manifest: m => { m.helper.libc = '' } }, 'linux-libc'],
        ['missing license metadata', { manifest: m => { m.licenses = [] } }, 'licenses'],
        ['missing provenance', { manifest: m => { delete m.provenance.attestation } }, 'provenance'],
        ['missing helper', { afterWrite: (fixtureRoot, m) => fs.rmSync(path.join(fixtureRoot, m.helper.filename), { force: true }) }, 'helper missing'],
        ['non-executable helper', { executable: false }, 'permission-denied'],
        ['size mismatch', { manifest: m => { m.helper.size += 1 } }, 'helper.size'],
        ['checksum mismatch', { manifest: m => { m.helper.sha256 = 'f'.repeat(64) } }, 'helper.sha256'],
        ['filename/package files mismatch', { manifest: m => { m.helper.filename = 'bin/renamed-helper' } }, 'helper.filename'],
      ]
      for (const [label, mutate, detail] of cases) {
        const caseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0422-manifest-case-'))
        tempRoots.push(caseRoot)
        assertFailure(caseRoot, mutate, detail, label)
      }
    } finally {
      for (const tempRoot of tempRoots) fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    if (primaryRoot) assert.equal(fs.existsSync(primaryRoot), false, 'temp manifest fixture root should be cleaned up')
    assertPackageNativeSanity(root)
  },
}
