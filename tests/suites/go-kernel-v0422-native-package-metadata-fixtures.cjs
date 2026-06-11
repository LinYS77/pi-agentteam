const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.22-native-helper-package-metadata.md'
const PLAN = 'docs/agentteam方案书.md'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const MODULE = 'tmuxSnapshotParse'
const PACKAGE_SCOPE = '@earendil-works'
const PACKAGE_PREFIX = 'pi-agentteam-go-helper'
const FIXTURE_FILES = Object.freeze([
  'README.md',
  'LICENSE',
  'manifest/agentteam-go-helper-manifest.json',
  'bin/agentteam-tmux-snapshot-helper',
])
const PLATFORM_ROWS = Object.freeze([
  { os: 'linux', cpu: 'x64', libc: 'glibc', packageName: '@earendil-works/pi-agentteam-go-helper-linux-x64' },
  { os: 'linux', cpu: 'arm64', libc: 'musl', packageName: '@earendil-works/pi-agentteam-go-helper-linux-arm64' },
  { os: 'darwin', cpu: 'arm64', libc: 'not-applicable', packageName: '@earendil-works/pi-agentteam-go-helper-darwin-arm64' },
  { os: 'win32', cpu: 'x64', libc: 'not-applicable', packageName: '@earendil-works/pi-agentteam-go-helper-win32-x64' },
])

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

function packageNameFor(row) {
  return `${PACKAGE_SCOPE}/${PACKAGE_PREFIX}-${row.os}-${row.cpu}`
}

function createCompanionPackageJson(row) {
  return {
    name: row.packageName,
    version: PACKAGE_VERSION,
    description: `Generated AgentTeam Go helper artifact metadata fixture for ${row.os}/${row.cpu}`,
    license: 'MIT',
    os: [row.os],
    cpu: [row.cpu],
    files: [...FIXTURE_FILES],
    agentteamGoHelper: {
      schemaVersion: 1,
      module: MODULE,
      helperVersion: HELPER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      platform: {
        os: row.os,
        cpu: row.cpu,
        libc: row.libc,
      },
      manifest: 'manifest/agentteam-go-helper-manifest.json',
      binary: 'bin/agentteam-tmux-snapshot-helper',
      provenance: 'PROVENANCE_ATTESTATION_PLACEHOLDER',
    },
  }
}

function createHelperManifest(row) {
  return {
    schemaVersion: 1,
    package: {
      name: row.packageName,
      version: PACKAGE_VERSION,
    },
    helper: {
      version: HELPER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      module: MODULE,
      os: row.os,
      arch: row.cpu,
      libc: row.libc,
      filename: 'bin/agentteam-tmux-snapshot-helper',
      size: 0,
      sha256: '0'.repeat(64),
      executable: true,
    },
    provenance: {
      sourceRevision: 'SOURCE_REVISION_PLACEHOLDER',
      generatedBy: 'metadata-fixture-test',
      attestation: 'PROVENANCE_ATTESTATION_PLACEHOLDER',
    },
    licenses: [{ name: 'agentteam-go-helper', license: 'MIT', path: 'LICENSE' }],
  }
}

function writePackageFixture(root, row) {
  const packageRoot = path.join(root, row.packageName.replace('@', '').replace('/', '__'))
  fs.mkdirSync(path.join(packageRoot, 'manifest'), { recursive: true })
  fs.mkdirSync(path.join(packageRoot, 'bin'), { recursive: true })
  const packageJson = createCompanionPackageJson(row)
  const manifest = createHelperManifest(row)
  fs.writeFileSync(path.join(packageRoot, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'README.md'), `# ${row.packageName}\n\nMetadata fixture only.\n`, 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'LICENSE'), 'MIT\n', 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'manifest/agentteam-go-helper-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'bin/agentteam-tmux-snapshot-helper'), '# metadata fixture placeholder only\n', 'utf8')
  return { packageRoot, packageJson, manifest }
}

function assertNoDisallowedPackageMetadata(packageJson, label) {
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'scripts'), false, `${label} must not define scripts`)
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, `${label} must not define optionalDependencies`)
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'dependencies'), false, `${label} must not define dependencies`)
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'devDependencies'), false, `${label} must not define devDependencies`)
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, lifecycle), false, `${label} must not define ${lifecycle}`)
  }
  const serialized = JSON.stringify(packageJson)
  assert.equal(/curl|wget|node-gyp|prebuild|go build|go install|download|postinstall|preinstall|prepare/i.test(serialized), false, `${label} must not contain build/download/install metadata`)
  assert.equal(packageJson.files.some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, `${label} must not include raw kernel paths`)
}

function validateCompanionPackageFixture(packageRoot, packageJson, manifest, row) {
  assert.equal(packageJson.name, row.packageName, 'package name should match platform row')
  assert.equal(packageJson.name, packageNameFor(row), 'package name should follow platform tuple naming')
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version should match main package version')
  assert.equal(packageJson.license, 'MIT', 'package license should be MIT')
  assert.deepEqual(packageJson.os, [row.os], 'package os should match row')
  assert.deepEqual(packageJson.cpu, [row.cpu], 'package cpu should match row')
  assert.deepEqual(packageJson.files, [...FIXTURE_FILES], 'package files should be exact allowlist')
  assertNoDisallowedPackageMetadata(packageJson, packageJson.name)
  assert.equal(packageJson.agentteamGoHelper.schemaVersion, 1, 'metadata schema version')
  assert.equal(packageJson.agentteamGoHelper.module, MODULE, 'metadata module')
  assert.equal(packageJson.agentteamGoHelper.helperVersion, HELPER_VERSION, 'metadata helper version')
  assert.equal(packageJson.agentteamGoHelper.protocolVersion, PROTOCOL_VERSION, 'metadata protocol version')
  assert.deepEqual(packageJson.agentteamGoHelper.platform, { os: row.os, cpu: row.cpu, libc: row.libc }, 'metadata platform tuple')
  assert.equal(packageJson.agentteamGoHelper.manifest, 'manifest/agentteam-go-helper-manifest.json', 'metadata manifest path')
  assert.equal(packageJson.agentteamGoHelper.binary, 'bin/agentteam-tmux-snapshot-helper', 'metadata binary path')
  assert.equal(manifest.package.name, packageJson.name, 'manifest package name should match package')
  assert.equal(manifest.package.version, packageJson.version, 'manifest package version should match package')
  assert.equal(manifest.helper.module, MODULE, 'manifest module should be tmuxSnapshotParse')
  assert.equal(manifest.helper.os, row.os, 'manifest os should match row')
  assert.equal(manifest.helper.arch, row.cpu, 'manifest arch should match row')
  assert.equal(manifest.helper.libc, row.libc, 'manifest libc should match row')
  const dryRunFiles = walkFiles(packageRoot).map(file => path.relative(packageRoot, file).replace(/\\/g, '/')).sort()
  assert.deepEqual(dryRunFiles, ['LICENSE', 'README.md', 'bin/agentteam-tmux-snapshot-helper', 'manifest/agentteam-go-helper-manifest.json', 'package.json'].sort(), 'fixture package contents should be exact')
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
  name: 'Go kernel v0.4.22 native package metadata fixtures',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    assert.ok(doc.includes('## Slice 2 Companion Package Metadata Fixture'), 'metadata doc should include Slice 2 fixture section')
    assert.ok(doc.includes('@earendil-works/pi-agentteam-go-helper-linux-x64'), 'metadata doc should name linux x64 companion fixture')
    assert.ok(doc.includes('exact `files` allowlist'), 'metadata doc should specify exact files allowlist')
    assert.ok(doc.includes('no `scripts`, no lifecycle hooks, no `optionalDependencies`'), 'metadata doc should preserve forbidden metadata')
    assert.ok(plan.includes('tests/suites/go-kernel-v0422-native-package-metadata-fixtures.cjs'), 'roadmap should reference Slice 2 fixture suite')

    const tempRoots = []
    let primaryRoot
    try {
      primaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0422-metadata-fixtures-'))
      tempRoots.push(primaryRoot)
      assert.equal(primaryRoot.startsWith(os.tmpdir()), true, 'fixtures should live under os tmpdir')
      assert.equal(primaryRoot.includes(root), false, 'fixtures must not live under repo')
      for (const row of PLATFORM_ROWS) {
        const { packageRoot, packageJson, manifest } = writePackageFixture(primaryRoot, row)
        validateCompanionPackageFixture(packageRoot, packageJson, manifest, row)
      }

      const invalidNameRow = { ...PLATFORM_ROWS[0], packageName: '@earendil-works/pi-agentteam-go-helper-linux-arm64' }
      assert.throws(() => validateCompanionPackageFixture(primaryRoot, createCompanionPackageJson(invalidNameRow), createHelperManifest(invalidNameRow), { ...invalidNameRow, cpu: 'x64' }), /package name should follow platform tuple naming/, 'package name/platform mismatch should fail')
      const invalidFilesPackage = createCompanionPackageJson(PLATFORM_ROWS[0])
      invalidFilesPackage.files = [...FIXTURE_FILES, 'kernel/go/agentteam-kernel/main.go']
      assert.throws(() => assertNoDisallowedPackageMetadata(invalidFilesPackage, 'invalid files'), /raw kernel paths/, 'raw kernel paths should fail fixture validation')
      const invalidScriptsPackage = createCompanionPackageJson(PLATFORM_ROWS[0])
      invalidScriptsPackage.scripts = { postinstall: 'node download-helper.js' }
      assert.throws(() => assertNoDisallowedPackageMetadata(invalidScriptsPackage, 'invalid scripts'), /must not define scripts/, 'scripts should fail fixture validation')
      const invalidOptionalDepsPackage = createCompanionPackageJson(PLATFORM_ROWS[0])
      invalidOptionalDepsPackage.optionalDependencies = { '@earendil-works/pi-agentteam-go-helper-linux-x64': PACKAGE_VERSION }
      assert.throws(() => assertNoDisallowedPackageMetadata(invalidOptionalDepsPackage, 'invalid optional deps'), /optionalDependencies/, 'optionalDependencies should fail fixture validation')
    } finally {
      for (const tempRoot of tempRoots) fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    if (primaryRoot) assert.equal(fs.existsSync(primaryRoot), false, 'temp metadata fixture root should be cleaned up')
    assertPackageNativeSanity(root)
  },
}
