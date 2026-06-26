const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const DOC = 'docs/perf/v0.4.21-go-artifact-prototype.md'
const PLAN = 'docs/agentteam方案书.md'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const MODULE = 'tmuxSnapshotParse'
const FUTURE_PACKAGE_NAME = '@earendil-works/pi-agentteam-go-helper-linux-x64'
const HELPER_FILENAME = 'bin/agentteam-tmux-snapshot-helper.cjs'
const MANIFEST_FILENAME = 'manifest/agentteam-go-helper-manifest.json'
const SOURCE_REVISION_PLACEHOLDER = 'SOURCE_REVISION_PLACEHOLDER'
const REQUIRED_PACKAGE_FILES = [
  'package.json',
  'README.md',
  'LICENSE',
  MANIFEST_FILENAME,
  HELPER_FILENAME,
]
const REQUIRED_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle']
const SENTINELS = {
  stdout: 'ARTIFACT_PROTOTYPE_STDOUT_SHOULD_NOT_LEAK',
  stderr: 'ARTIFACT_PROTOTYPE_STDERR_SHOULD_NOT_LEAK',
  helperPath: 'artifact-prototype-secret-helper-path-SHOULD_NOT_LEAK',
  repoPath: '/tmp/artifact-prototype-repo-path-SHOULD_NOT_LEAK',
  cwdPath: '/tmp/artifact-prototype-cwd-path-SHOULD_NOT_LEAK',
  mailbox: 'ARTIFACT_PROTOTYPE_MAILBOX_SHOULD_NOT_LEAK',
  report: 'ARTIFACT_PROTOTYPE_REPORT_SHOULD_NOT_LEAK',
  rawState: 'ARTIFACT_PROTOTYPE_RAW_STATE_SHOULD_NOT_LEAK',
  sidecar: 'ARTIFACT_PROTOTYPE_SIDECAR_SHOULD_NOT_LEAK',
  cache: 'ARTIFACT_PROTOTYPE_CACHE_SHOULD_NOT_LEAK',
  index: 'ARTIFACT_PROTOTYPE_INDEX_SHOULD_NOT_LEAK',
  workerPrompt: 'ARTIFACT_PROTOTYPE_WORKER_PROMPT_SHOULD_NOT_LEAK',
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function isExecutable(file) {
  return Boolean(fs.statSync(file).mode & 0o111)
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

function helperSource(overrides = {}) {
  const version = overrides.version || HELPER_VERSION
  const protocolVersion = overrides.protocolVersion || PROTOCOL_VERSION
  const capabilities = overrides.capabilities || REQUIRED_CAPABILITIES
  return `#!/usr/bin/env node
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input) : {}
const baseHealth = {
  ok: true,
  implementation: 'go',
  protocolVersion: ${JSON.stringify(protocolVersion)},
  adapterVersion: ${JSON.stringify(HELPER_VERSION)},
  helperVersion: ${JSON.stringify(version)},
  capabilities: ${JSON.stringify(capabilities)},
  businessPathsConnected: false,
}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'profile') respond({ ...baseHealth, profile: { scope: 'skeleton-only', params: request.params || {}, stateConnected: false, tmuxConnected: false, tmuxSnapshotParseConnected: true, tmuxSnapshotCaptureConnected: true, compactReadModelFingerprintConnected: true, panelConnected: false, taskReportPlanRunConnected: false } })
else if (request.method === 'tmuxSnapshotParse') respond({ capturedAt: request.params.capturedAt, panes: [{ paneId: '%artifact', target: 'artifact:@1', label: 'artifact helper', currentCommand: 'pi' }], byPaneId: { '%artifact': { paneId: '%artifact', target: 'artifact:@1', label: 'artifact helper', currentCommand: 'pi' } }, ok: true })
else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params.input, fingerprint: 'artifact-helper-should-not-be-used', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })
else respond({ ok: true })
`
}

function createTempArtifactRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-artifact-prototype-'))
}

function writeTempHelper(root, source = helperSource(), mode = 0o755) {
  const helperPath = path.join(root, HELPER_FILENAME)
  fs.mkdirSync(path.dirname(helperPath), { recursive: true })
  fs.writeFileSync(helperPath, source, 'utf8')
  fs.chmodSync(helperPath, mode)
  return helperPath
}

function createManifest(root, helperPath, overrides = {}) {
  const stat = fs.statSync(helperPath)
  const manifest = {
    schemaVersion: 1,
    package: {
      name: overrides.packageName || FUTURE_PACKAGE_NAME,
      version: overrides.packageVersion || PACKAGE_VERSION,
    },
    helper: {
      version: overrides.helperVersion || HELPER_VERSION,
      protocolVersion: overrides.protocolVersion || PROTOCOL_VERSION,
      module: overrides.module || MODULE,
      os: overrides.os || process.platform,
      arch: overrides.arch || process.arch,
      libc: overrides.libc || (process.platform === 'linux' ? 'glibc-or-musl' : 'not-applicable'),
      filename: overrides.filename || HELPER_FILENAME,
      size: overrides.size ?? stat.size,
      sha256: overrides.sha256 || sha256(helperPath),
      executable: overrides.executable ?? isExecutable(helperPath),
    },
    provenance: {
      sourceRevision: overrides.sourceRevision || SOURCE_REVISION_PLACEHOLDER,
      generatedBy: overrides.generatedBy || 'ci-artifact-prototype',
      attestation: overrides.attestation || 'PROVENANCE_ATTESTATION_PLACEHOLDER',
    },
    licenses: overrides.licenses || [
      { name: 'pi-agentteam', license: 'MIT', path: 'LICENSE' },
      { name: 'agentteam-go-helper', license: 'MIT', path: 'LICENSE' },
    ],
  }
  const manifestPath = path.join(root, MANIFEST_FILENAME)
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return { manifest, manifestPath }
}

function validateManifest(root, manifest, platform = process) {
  if (manifest.schemaVersion !== 1) return { ok: false, reason: 'schema-version' }
  if (manifest.package?.name !== FUTURE_PACKAGE_NAME) return { ok: false, reason: 'package-name' }
  if (manifest.package?.version !== PACKAGE_VERSION) return { ok: false, reason: 'package-version' }
  if (manifest.helper?.version !== HELPER_VERSION) return { ok: false, reason: 'helper-version' }
  if (manifest.helper?.protocolVersion !== PROTOCOL_VERSION) return { ok: false, reason: 'protocol-version' }
  if (manifest.helper?.module !== MODULE) return { ok: false, reason: 'module' }
  if (manifest.helper?.os !== platform.platform || manifest.helper?.arch !== platform.arch) return { ok: false, reason: 'unsupported-platform' }
  if (typeof manifest.helper?.libc !== 'string' || !manifest.helper.libc) return { ok: false, reason: 'platform-libc' }
  if (manifest.provenance?.sourceRevision !== SOURCE_REVISION_PLACEHOLDER) return { ok: false, reason: 'source-revision' }
  if (!Array.isArray(manifest.licenses) || !manifest.licenses.some(item => item.license === 'MIT' && item.path === 'LICENSE')) return { ok: false, reason: 'license' }
  const helperPath = path.join(root, manifest.helper.filename)
  if (!fs.existsSync(helperPath)) return { ok: false, reason: 'missing-helper' }
  const stat = fs.statSync(helperPath)
  if (stat.size !== manifest.helper.size) return { ok: false, reason: 'size' }
  if (sha256(helperPath) !== manifest.helper.sha256) return { ok: false, reason: 'integrity-failed' }
  if (!isExecutable(helperPath) || manifest.helper.executable !== true) return { ok: false, reason: 'permission-denied' }
  return { ok: true, helperPath }
}

function mapManifestFailureToPreviewStatus(reason) {
  if (reason === 'unsupported-platform') return 'unsupported-platform'
  if (reason === 'integrity-failed') return 'integrity-failed'
  return 'integrity-failed'
}

function createPackageLayout(root, manifest) {
  const packageRoot = path.join(root, 'package-dry-run')
  fs.mkdirSync(path.join(packageRoot, 'manifest'), { recursive: true })
  fs.mkdirSync(path.join(packageRoot, 'bin'), { recursive: true })
  const packageJson = {
    name: manifest.package.name,
    version: manifest.package.version,
    license: 'MIT',
    os: [manifest.helper.os],
    cpu: [manifest.helper.arch],
    files: ['README.md', 'LICENSE', 'manifest/', 'bin/'],
  }
  fs.writeFileSync(path.join(packageRoot, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'README.md'), 'Temporary artifact package fixture for tests only.\n', 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'LICENSE'), 'MIT\n', 'utf8')
  fs.writeFileSync(path.join(packageRoot, MANIFEST_FILENAME), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(packageRoot, HELPER_FILENAME), '#!/usr/bin/env node\n', 'utf8')
  fs.chmodSync(path.join(packageRoot, HELPER_FILENAME), 0o755)
  return packageRoot
}

function simulatePackageDryRun(packageRoot) {
  return walkFiles(packageRoot)
    .map(file => path.relative(packageRoot, file).replace(/\\/g, '/'))
    .sort()
}

function assertPackageDryRunShape(packageRoot, files) {
  assert.deepEqual(files, [...REQUIRED_PACKAGE_FILES].sort(), 'dry-run package contents should be exact')
  assert.equal(files.some(file => file === 'kernel' || file.startsWith('kernel/')), false, 'dry-run package must not include raw kernel source')
  assert.equal(files.some(file => file.endsWith('.tgz')), false, 'dry-run package must not create tarballs')
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'scripts'), false, 'artifact package fixture must not define scripts')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'artifact package fixture must not define optionalDependencies')
}

function invokeHelper(helperPath, method, params = {}) {
  const result = spawnSync(helperPath, [], {
    input: `${JSON.stringify({ jsonrpc: '2.0', id: `artifact-${method}`, method, params })}\n`,
    encoding: 'utf8',
    timeout: 2_000,
    env: { PATH: process.env.PATH || '' },
  })
  assert.equal(result.status, 0, `${method} direct smoke should exit zero`)
  const response = JSON.parse(String(result.stdout).trim())
  assert.equal(response.jsonrpc, '2.0', `${method} direct smoke should return JSON-RPC`)
  return response.result
}

function throwingTmuxFallback() {
  throw new Error('TypeScript parser fallback must not be called for packaged artifact preview')
}

function assertCutoverFailure(adapter, snapshot, expectedKind, label) {
  assert.equal(snapshot.ok, false, `${label} should fail closed`)
  assert.equal(snapshot.status, 'unknown', `${label} should mark unknown`)
  assert.equal(snapshot.resultMarker, 'stale', `${label} should mark stale`)
  assert.equal(snapshot.module, MODULE, `${label} should name module`)
  assert.equal(snapshot.capability, MODULE, `${label} should name capability`)
  assert.equal(snapshot.cutoverFailureKind, expectedKind, `${label} failure kind`)
  assert.deepEqual(snapshot.panes, [], `${label} panes should be empty`)
  assert.deepEqual(snapshot.byPaneId, {}, `${label} byPaneId should be empty`)
  const serialized = JSON.stringify({ snapshot, metadata: adapter.metadata() })
  for (const [name, sentinel] of Object.entries(SENTINELS)) {
    assert.equal(serialized.includes(sentinel), false, `${label} must not leak ${name}`)
  }
  assert.equal(adapter.metadata().kernel.fallbacks, 0, `${label} should not use migration fallback count`)
  assert.equal(Object.prototype.hasOwnProperty.call(adapter.metadata().kernel, 'fallbackKind'), false, `${label} should not expose fallbackKind`)
  assert.equal(Object.prototype.hasOwnProperty.call(adapter.metadata().kernel, 'fallbackReason'), false, `${label} should not expose fallbackReason`)
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain unchanged')
  assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'package.json#files must exclude kernel/')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
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
  const nativeArtifacts = walkFiles(root)
    .filter(file => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}.git${path.sep}`))
    .filter(file => /\.(?:exe|dll|so|dylib)$/i.test(file))
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
  assert.deepEqual(nativeArtifacts, [], 'native artifacts must not be checked in')
}

module.exports = {
  name: 'Go kernel v0.4.21 artifact prototype',
  async run(env) {
    const root = env.helpers.extRoot
    const kernel = env.helpers.requireDist('core/kernel.js')
    const doc = read(root, DOC)
    const plan = read(root, PLAN)

    for (const expected of [
      'v0.4.21 Go CI Package Artifact Prototype',
      'Slice 6 docs/tests prototype only',
      'does not change `package.json`',
      'add `optionalDependencies`',
      'add lifecycle hooks',
      'add package scripts',
      'add checked-in native binaries',
      'run `npm version`',
      'run `npm publish`',
      'make Go default',
      'delete the TypeScript parser fallback',
      'docs/perf/v0.4.21-go-runtime-availability.md',
      'docs/perf/v0.4.21-go-native-artifact-contract.md',
      'docs/perf/v0.4.21-go-package-policy-guardrails.md',
      'docs/perf/v0.4.21-go-resolver-diagnostics-design.md',
      'docs/perf/v0.4.21-go-packaged-preview-resolver.md',
      'schemaVersion: 1',
      'helper.module: "tmuxSnapshotParse"',
      'helper.sha256',
      'provenance.sourceRevision',
      'license metadata',
      'simulate `npm pack --dry-run --ignore-scripts` contents with test helper code',
      'helper path is returned only for supported, integrity-valid temp artifacts',
      'checksum mismatch maps to integrity failure',
      'unsupported platform shape maps to unsupported platform',
      'wrong helper version fails closed',
      'wrong JSON-RPC protocol fails closed',
      'missing `tmuxSnapshotParse` capability fails closed',
      'preview packaged path does not silently invoke the TypeScript parser fallback',
      'temp root is removed after the suite',
      'package/native sanity scan',
    ]) {
      assertIncludes(doc, expected, 'artifact prototype doc')
    }
    assertIncludes(plan, DOC, 'roadmap should reference artifact prototype doc')

    const tempRoots = []
    let removedRoot
    try {
      const artifactRoot = createTempArtifactRoot()
      tempRoots.push(artifactRoot)
      const helperPath = writeTempHelper(artifactRoot)
      const { manifest, manifestPath } = createManifest(artifactRoot, helperPath)

      assert.equal(fs.existsSync(helperPath), true, 'temp helper should exist')
      assert.equal(helperPath.startsWith(os.tmpdir()), true, 'temp helper should be under os tmpdir')
      assert.equal(helperPath.includes(root), false, 'temp helper must not be inside repo')
      assert.equal(isExecutable(helperPath), true, 'temp helper should be executable')
      assert.equal(manifest.helper.size, fs.statSync(helperPath).size, 'manifest size should match helper')
      assert.equal(manifest.helper.sha256, sha256(helperPath), 'manifest sha256 should match helper')
      assert.equal(manifest.helper.executable, true, 'manifest should record executable bit')
      assert.equal(manifest.helper.module, MODULE, 'manifest should remain tmuxSnapshotParse scoped')
      assert.equal(manifest.helper.protocolVersion, PROTOCOL_VERSION, 'manifest protocol version')
      assert.equal(manifest.helper.version, HELPER_VERSION, 'manifest helper version')
      assert.equal(manifest.provenance.sourceRevision, SOURCE_REVISION_PLACEHOLDER, 'manifest source revision placeholder')
      assert.equal(manifest.licenses.some(item => item.license === 'MIT' && item.path === 'LICENSE'), true, 'manifest should include MIT license metadata')
      assert.equal(fs.existsSync(manifestPath), true, 'manifest file should exist under temp root')

      const validation = validateManifest(artifactRoot, manifest)
      assert.deepEqual(validation, { ok: true, helperPath }, 'manifest validator should locate valid helper')

      const packageRoot = createPackageLayout(artifactRoot, manifest)
      const dryRunFiles = simulatePackageDryRun(packageRoot)
      assertPackageDryRunShape(packageRoot, dryRunFiles)

      const installedRoot = path.join(artifactRoot, 'installed-layout')
      fs.mkdirSync(path.dirname(path.join(installedRoot, HELPER_FILENAME)), { recursive: true })
      fs.copyFileSync(helperPath, path.join(installedRoot, HELPER_FILENAME))
      fs.chmodSync(path.join(installedRoot, HELPER_FILENAME), 0o755)
      fs.mkdirSync(path.dirname(path.join(installedRoot, MANIFEST_FILENAME)), { recursive: true })
      fs.writeFileSync(path.join(installedRoot, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2), 'utf8')
      const installedManifest = JSON.parse(fs.readFileSync(path.join(installedRoot, MANIFEST_FILENAME), 'utf8'))
      const installedValidation = validateManifest(installedRoot, installedManifest)
      assert.equal(installedValidation.ok, true, 'installed layout manifest should validate')

      const health = invokeHelper(installedValidation.helperPath, 'health')
      assert.equal(health.ok, true, 'direct health smoke should be ok')
      assert.equal(health.helperVersion, HELPER_VERSION, 'direct health helper version')
      assert.equal(health.protocolVersion, PROTOCOL_VERSION, 'direct health protocol version')
      assert.equal(health.capabilities.includes(MODULE), true, 'direct health should include tmuxSnapshotParse')
      const directSnapshot = invokeHelper(installedValidation.helperPath, MODULE, { stdout: '%p\tartifact:@1\tlabel\tpi', capturedAt: 1700006000001 })
      assert.equal(directSnapshot.ok, true, 'direct tmuxSnapshotParse smoke should be ok')
      assert.equal(directSnapshot.panes[0].paneId, '%artifact', 'direct tmuxSnapshotParse should come from helper')

      const defaultAdapter = kernel.createAgentTeamKernelAdapter({ env: {} })
      assert.equal(defaultAdapter.metadata().kernel.requestedMode, 'default', 'default normalizes to default')
      assert.equal(defaultAdapter.metadata().kernel.mode, 'go', 'default uses embedded Go helper')
      assert.equal(defaultAdapter.metadata().kernel.enabled, true, 'default tmuxSnapshotParse enables Go')
      assert.equal(defaultAdapter.metadata().kernel.cutoverStatus, 'active', 'default embedded helper is active')
      for (const mode of ['disabled', 'typescript', 'auto']) {
        const adapter = kernel.createAgentTeamKernelAdapter({ mode, packagedHelperPath: installedValidation.helperPath, env: { PATH: process.env.PATH } })
        const beforeCalls = adapter.metadata().kernel.calls
        const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700006000002, (stdout, capturedAt) => ({ capturedAt, panes: [{ paneId: '%ts', target: 'ts:@1', label: 'TypeScript fallback', currentCommand: 'pi' }], byPaneId: { '%ts': { paneId: '%ts', target: 'ts:@1', label: 'TypeScript fallback', currentCommand: 'pi' } }, ok: true }))
        assert.equal(snapshot.panes[0].paneId, '%ts', `${mode} should not discover packaged helper`)
        assert.equal(adapter.metadata().kernel.calls, beforeCalls, `${mode} should not call packaged helper`)
      }
      {
        const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', packagedHelperPath: installedValidation.helperPath, env: { PATH: process.env.PATH } })
        const beforeCalls = adapter.metadata().kernel.calls
        const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700006000002, throwingTmuxFallback)
        assert.equal(snapshot.ok, true, 'go should use approved embedded helper while ignoring raw packaged helper path')
        assert.equal(snapshot.panes[0].paneId, '%ts')
        assert.equal(adapter.metadata().kernel.calls, beforeCalls + 2, 'go should call embedded helper')
      }
      {
        const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', packagedHelperPath: installedValidation.helperPath, env: { PATH: process.env.PATH } })
        const beforeCalls = adapter.metadata().kernel.calls
        const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700006000002, throwingTmuxFallback)
        assert.equal(snapshot.ok, false, 'go-cutover must not trust raw packaged helper path without manifest resolution')
        assert.equal(snapshot.cutoverFailureKind, 'missing-helper', 'go-cutover missing helper failure kind')
        assert.equal(adapter.metadata().kernel.calls, beforeCalls, 'go-cutover packaged helper calls')
      }

      const previewAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: installedValidation.helperPath, env: { PATH: process.env.PATH } })
      const readModel = previewAdapter.compactReadModelFingerprint({ team: { name: 'artifact-team' }, mailbox: [{ text: SENTINELS.mailbox }] })
      assert.equal(readModel.readOnly, true, 'read-model remains TS fallback')
      assert.equal(previewAdapter.metadata().kernel.calls, 0, 'read-model should not call helper')
      const previewSnapshot = previewAdapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700006000003, throwingTmuxFallback)
      assert.equal(previewSnapshot.ok, true, 'preview packaged helper should parse tmux snapshot')
      assert.equal(previewSnapshot.panes[0].paneId, '%artifact', 'preview packaged helper should be used only by explicit preview mode')
      assert.equal(previewAdapter.metadata().kernel.requestedMode, 'go-packaged-preview')
      assert.equal(previewAdapter.metadata().kernel.fallbacks, 0)
      assert.equal(previewAdapter.metadata().kernel.cutoverStatus, 'active')

      const mismatchManifest = structuredClone(manifest)
      mismatchManifest.helper.sha256 = '0'.repeat(64)
      const mismatchValidation = validateManifest(artifactRoot, mismatchManifest)
      assert.deepEqual(mismatchValidation, { ok: false, reason: 'integrity-failed' }, 'checksum mismatch should fail manifest validation')
      const integrityAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: helperPath, packagedHelperStatus: mapManifestFailureToPreviewStatus(mismatchValidation.reason), env: { PATH: process.env.PATH } })
      const integritySnapshot = integrityAdapter.parseTmuxPaneSnapshot('%p\tartifact:@1\tlabel\tpi', 1700006000004, throwingTmuxFallback)
      assertCutoverFailure(integrityAdapter, integritySnapshot, 'helper-incompatible-response', 'checksum mismatch')

      const unsupportedManifest = structuredClone(manifest)
      unsupportedManifest.helper.os = 'unsupported-os-for-artifact-prototype'
      const unsupportedValidation = validateManifest(artifactRoot, unsupportedManifest)
      assert.deepEqual(unsupportedValidation, { ok: false, reason: 'unsupported-platform' }, 'unsupported platform should fail manifest validation')
      const unsupportedAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: helperPath, packagedHelperStatus: mapManifestFailureToPreviewStatus(unsupportedValidation.reason), env: { PATH: process.env.PATH } })
      const unsupportedSnapshot = unsupportedAdapter.parseTmuxPaneSnapshot('%p\tartifact:@1\tlabel\tpi', 1700006000005, throwingTmuxFallback)
      assertCutoverFailure(unsupportedAdapter, unsupportedSnapshot, 'missing-helper', 'unsupported platform')

      const nonExecutableRoot = createTempArtifactRoot()
      tempRoots.push(nonExecutableRoot)
      const nonExecutableHelper = writeTempHelper(nonExecutableRoot, helperSource(), 0o644)
      const { manifest: nonExecutableManifest } = createManifest(nonExecutableRoot, nonExecutableHelper, { executable: false })
      const permissionValidation = validateManifest(nonExecutableRoot, nonExecutableManifest)
      assert.deepEqual(permissionValidation, { ok: false, reason: 'permission-denied' }, 'non-executable helper should fail manifest validation')

      const wrongVersionRoot = createTempArtifactRoot()
      tempRoots.push(wrongVersionRoot)
      const wrongVersionHelper = writeTempHelper(wrongVersionRoot, helperSource({ version: '9.9.9-artifact' }))
      const wrongVersionAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: wrongVersionHelper, env: { PATH: process.env.PATH } })
      const wrongVersionSnapshot = wrongVersionAdapter.parseTmuxPaneSnapshot('%p\tartifact:@1\tlabel\tpi', 1700006000006, throwingTmuxFallback)
      assertCutoverFailure(wrongVersionAdapter, wrongVersionSnapshot, 'helper-unsupported-version', 'wrong helper version')

      const wrongProtocolRoot = createTempArtifactRoot()
      tempRoots.push(wrongProtocolRoot)
      const wrongProtocolHelper = writeTempHelper(wrongProtocolRoot, helperSource({ protocolVersion: 99 }))
      const wrongProtocolAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: wrongProtocolHelper, env: { PATH: process.env.PATH } })
      const wrongProtocolSnapshot = wrongProtocolAdapter.parseTmuxPaneSnapshot('%p\tartifact:@1\tlabel\tpi', 1700006000007, throwingTmuxFallback)
      assertCutoverFailure(wrongProtocolAdapter, wrongProtocolSnapshot, 'helper-unsupported-version', 'wrong protocol version')

      const missingCapabilityRoot = createTempArtifactRoot()
      tempRoots.push(missingCapabilityRoot)
      const missingCapabilityHelper = writeTempHelper(missingCapabilityRoot, helperSource({ capabilities: REQUIRED_CAPABILITIES.filter(capability => capability !== MODULE) }))
      const missingCapabilityAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: missingCapabilityHelper, env: { PATH: process.env.PATH } })
      const missingCapabilitySnapshot = missingCapabilityAdapter.parseTmuxPaneSnapshot('%p\tartifact:@1\tlabel\tpi', 1700006000008, throwingTmuxFallback)
      assertCutoverFailure(missingCapabilityAdapter, missingCapabilitySnapshot, 'helper-unsupported-capability', 'missing tmuxSnapshotParse capability')

      removedRoot = artifactRoot
    } finally {
      for (const tempRoot of tempRoots) {
        fs.rmSync(tempRoot, { recursive: true, force: true })
      }
    }

    if (removedRoot) {
      assert.equal(fs.existsSync(removedRoot), false, 'primary temp artifact root should be removed')
    }
    assertPackageNativeSanity(root)
  },
}
