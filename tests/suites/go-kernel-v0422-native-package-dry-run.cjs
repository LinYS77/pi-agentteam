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
const LINUX_ROW = Object.freeze({ os: 'linux', cpu: 'x64', libc: 'glibc', packageName: '@earendil-works/pi-agentteam-go-helper-linux-x64', helperFile: 'bin/agentteam-tmux-snapshot-helper' })
const WIN_ROW = Object.freeze({ os: 'win32', cpu: 'x64', libc: 'not-applicable', packageName: '@earendil-works/pi-agentteam-go-helper-win32-x64', helperFile: 'bin/agentteam-tmux-snapshot-helper.exe' })
const EXPECTED_LINUX_DRY_RUN = Object.freeze([
  'package.json',
  'README.md',
  'LICENSE',
  'manifest/agentteam-go-helper-manifest.json',
  'bin/agentteam-tmux-snapshot-helper',
])
const EXPECTED_WIN_DRY_RUN = Object.freeze([
  'package.json',
  'README.md',
  'LICENSE',
  'manifest/agentteam-go-helper-manifest.json',
  'bin/agentteam-tmux-snapshot-helper.exe',
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

function createPackageJson(row) {
  return {
    name: row.packageName,
    version: PACKAGE_VERSION,
    description: `Dry-run fixture for ${row.packageName}`,
    license: 'MIT',
    os: [row.os],
    cpu: [row.cpu],
    files: ['README.md', 'LICENSE', 'manifest/agentteam-go-helper-manifest.json', row.helperFile],
    agentteamGoHelper: {
      schemaVersion: 1,
      module: MODULE,
      helperVersion: HELPER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      platform: { os: row.os, cpu: row.cpu, libc: row.libc },
      manifest: 'manifest/agentteam-go-helper-manifest.json',
      binary: row.helperFile,
    },
  }
}

function createManifest(row) {
  return {
    schemaVersion: 1,
    package: { name: row.packageName, version: PACKAGE_VERSION },
    helper: {
      version: HELPER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      module: MODULE,
      os: row.os,
      arch: row.cpu,
      libc: row.libc,
      filename: row.helperFile,
      size: 0,
      sha256: '0'.repeat(64),
      executable: true,
    },
    provenance: { sourceRevision: 'SOURCE_REVISION_PLACEHOLDER', generatedBy: 'dry-run-fixture', attestation: 'PROVENANCE_ATTESTATION_PLACEHOLDER' },
    licenses: [{ name: 'agentteam-go-helper', license: 'MIT', path: 'LICENSE' }],
  }
}

function writeDryRunPackage(root, row, options = {}) {
  const packageRoot = path.join(root, row.packageName.replace('@', '').replace('/', '__'))
  fs.mkdirSync(path.join(packageRoot, 'manifest'), { recursive: true })
  fs.mkdirSync(path.dirname(path.join(packageRoot, row.helperFile)), { recursive: true })
  const packageJson = createPackageJson(row)
  if (options.packageJsonMutator) options.packageJsonMutator(packageJson)
  fs.writeFileSync(path.join(packageRoot, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'README.md'), `# ${row.packageName}\n\nDry-run fixture only.\n`, 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'LICENSE'), 'MIT\n', 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'manifest/agentteam-go-helper-manifest.json'), `${JSON.stringify(createManifest(row), null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(packageRoot, row.helperFile), '# placeholder helper artifact for dry-run fixture only\n', 'utf8')
  if (options.extraFiles) {
    for (const [rel, content] of Object.entries(options.extraFiles)) {
      fs.mkdirSync(path.dirname(path.join(packageRoot, rel)), { recursive: true })
      fs.writeFileSync(path.join(packageRoot, rel), content, 'utf8')
    }
  }
  return { packageRoot, packageJson }
}

function simulateNpmPackDryRun(packageRoot) {
  const packageJson = JSON.parse(read(packageRoot, 'package.json'))
  if (Object.prototype.hasOwnProperty.call(packageJson, 'scripts')) throw new Error('package scripts are forbidden')
  if (Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies')) throw new Error('optionalDependencies are forbidden')
  const serialized = JSON.stringify(packageJson)
  if (/postinstall|preinstall|prepare|curl|wget|node-gyp|prebuild|go build|go install|download/i.test(serialized)) {
    throw new Error('build/download/install metadata is forbidden')
  }
  const files = walkFiles(packageRoot).map(file => path.relative(packageRoot, file).replace(/\\/g, '/')).sort()
  if (files.some(file => file.endsWith('.tgz'))) throw new Error('tarballs are forbidden in dry-run fixture')
  if (files.some(file => file === 'kernel' || file.startsWith('kernel/') || file.includes('/kernel/'))) throw new Error('raw kernel source is forbidden')
  if (files.some(file => file === 'package-lock.json' || file === 'npm-shrinkwrap.json' || file === 'go.mod' || file === 'go.sum')) throw new Error('lockfiles/go modules are forbidden')
  return files
}

function expectedDryRunFor(row) {
  return row.os === 'win32' ? [...EXPECTED_WIN_DRY_RUN].sort() : [...EXPECTED_LINUX_DRY_RUN].sort()
}

function assertExactDryRun(packageRoot, row) {
  const files = simulateNpmPackDryRun(packageRoot)
  assert.deepEqual(files, expectedDryRunFor(row), `${row.packageName} dry-run files should be exact`)
  for (const rel of expectedDryRunFor(row)) {
    assert.equal(fs.existsSync(path.join(packageRoot, rel)), true, `${rel} should exist in temp package`)
  }
  const packageJson = JSON.parse(read(packageRoot, 'package.json'))
  assert.deepEqual([...packageJson.files].sort(), expectedDryRunFor(row).filter(file => file !== 'package.json').sort(), `${row.packageName} package.json files allowlist should match packed files except package.json`)
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
  name: 'Go kernel v0.4.22 native package dry-run',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    assert.ok(doc.includes('## Slice 3 Package Dry-Run Owner Simulation'), 'metadata doc should include Slice 3 dry-run section')
    assert.ok(doc.includes('simulate `npm pack --dry-run --ignore-scripts`'), 'metadata doc should mention dry-run simulation')
    assert.ok(doc.includes('exact dry-run file list'), 'metadata doc should require exact dry-run file list')
    assert.ok(plan.includes('tests/suites/go-kernel-v0422-native-package-dry-run.cjs'), 'roadmap should reference Slice 3 dry-run suite')

    const tempRoots = []
    let primaryRoot
    try {
      primaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0422-package-dry-run-'))
      tempRoots.push(primaryRoot)
      assert.equal(primaryRoot.startsWith(os.tmpdir()), true, 'dry-run fixtures should live under os tmpdir')
      assert.equal(primaryRoot.includes(root), false, 'dry-run fixtures must not live under repo')
      for (const row of [LINUX_ROW, WIN_ROW]) {
        const { packageRoot } = writeDryRunPackage(primaryRoot, row)
        assertExactDryRun(packageRoot, row)
      }

      const extraRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0422-package-dry-run-extra-'))
      tempRoots.push(extraRoot)
      const { packageRoot: extraPackageRoot } = writeDryRunPackage(extraRoot, LINUX_ROW, { extraFiles: { 'CHANGELOG.md': 'extra file\n' } })
      assert.throws(() => assertExactDryRun(extraPackageRoot, LINUX_ROW), /dry-run files should be exact/, 'extra package files should fail exact dry-run validation')

      const kernelRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0422-package-dry-run-kernel-'))
      tempRoots.push(kernelRoot)
      const { packageRoot: kernelPackageRoot } = writeDryRunPackage(kernelRoot, LINUX_ROW, { extraFiles: { 'kernel/go/agentteam-kernel/main.go': 'raw source\n' } })
      assert.throws(() => simulateNpmPackDryRun(kernelPackageRoot), /raw kernel source is forbidden/, 'raw kernel source should fail dry-run validation')

      const scriptsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0422-package-dry-run-scripts-'))
      tempRoots.push(scriptsRoot)
      const { packageRoot: scriptsPackageRoot } = writeDryRunPackage(scriptsRoot, LINUX_ROW, { packageJsonMutator: packageJson => { packageJson.scripts = { postinstall: 'node download-helper.js' } } })
      assert.throws(() => simulateNpmPackDryRun(scriptsPackageRoot), /package scripts are forbidden/, 'package scripts should fail dry-run validation')

      const optionalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0422-package-dry-run-optional-'))
      tempRoots.push(optionalRoot)
      const { packageRoot: optionalPackageRoot } = writeDryRunPackage(optionalRoot, LINUX_ROW, { packageJsonMutator: packageJson => { packageJson.optionalDependencies = { '@earendil-works/pi-agentteam-go-helper-linux-x64': PACKAGE_VERSION } } })
      assert.throws(() => simulateNpmPackDryRun(optionalPackageRoot), /optionalDependencies are forbidden/, 'optionalDependencies should fail dry-run validation')

      const tarballRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0422-package-dry-run-tarball-'))
      tempRoots.push(tarballRoot)
      const { packageRoot: tarballPackageRoot } = writeDryRunPackage(tarballRoot, LINUX_ROW, { extraFiles: { 'pi-agentteam-go-helper-linux-x64-0.6.8.tgz': 'tarball should not exist\n' } })
      assert.throws(() => simulateNpmPackDryRun(tarballPackageRoot), /tarballs are forbidden/, 'tarballs should fail dry-run validation')

      const lockRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0422-package-dry-run-lock-'))
      tempRoots.push(lockRoot)
      const { packageRoot: lockPackageRoot } = writeDryRunPackage(lockRoot, LINUX_ROW, { extraFiles: { 'package-lock.json': '{}\n' } })
      assert.throws(() => simulateNpmPackDryRun(lockPackageRoot), /lockfiles\/go modules are forbidden/, 'lockfiles should fail dry-run validation')
    } finally {
      for (const tempRoot of tempRoots) fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    if (primaryRoot) assert.equal(fs.existsSync(primaryRoot), false, 'temp dry-run fixture root should be cleaned up')
    assertPackageNativeSanity(root)
  },
}
