const assert = require('node:assert/strict')
const cp = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const builder = require('../../scripts/lib/go-helper-artifact-builder.cjs')

const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const FIXED_GENERATED_AT = '2026-06-12T00:00:00.000Z'
const FIXED_REVISION = '0123456789abcdef0123456789abcdef01234567'
const RUN_IDENTITY = 'v0629-packaged-preview-manifest-integration'
const SENTINELS = {
  tempPath: 'V0629_PREVIEW_TEMP_PATH_SHOULD_NOT_LEAK',
  stdout: 'V0629_PREVIEW_STDOUT_SHOULD_NOT_LEAK',
  stderr: 'V0629_PREVIEW_STDERR_SHOULD_NOT_LEAK',
  manifest: 'V0629_PREVIEW_MANIFEST_BODY_SHOULD_NOT_LEAK',
  provenance: 'V0629_PREVIEW_PROVENANCE_BODY_SHOULD_NOT_LEAK',
  license: 'V0629_PREVIEW_LICENSE_BODY_SHOULD_NOT_LEAK',
  attestation: 'V0629_PREVIEW_ATTESTATION_BODY_SHOULD_NOT_LEAK',
  mailbox: 'V0629_PREVIEW_MAILBOX_REPORT_SHOULD_NOT_LEAK',
}

function requireTypeScript() {
  try {
    return require('typescript')
  } catch (_) {
    return require('/home/linyusheng/.nvm/versions/node/v24.9.0/lib/node_modules/typescript')
  }
}

function transpileCoreForDirect(root) {
  const ts = requireTypeScript()
  const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0629-preview-direct-dist-'))
  const coreRoot = path.join(distRoot, 'core')
  fs.mkdirSync(coreRoot, { recursive: true })
  for (const rel of ['core/readModelFingerprint.ts', 'core/kernelContract.ts', 'core/kernelPackagedResolver.ts', 'core/kernel.ts']) {
    const sourcePath = path.join(root, rel)
    const sourceText = fs.readFileSync(sourcePath, 'utf8')
    const out = ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: sourcePath,
      reportDiagnostics: false,
    }).outputText
    fs.writeFileSync(path.join(distRoot, rel.replace(/\.ts$/, '.js')), out, 'utf8')
  }
  return {
    kernel: require(path.join(coreRoot, 'kernel.js')),
    cleanup() {
      fs.rmSync(distRoot, { recursive: true, force: true })
    },
  }
}

function loadKernel(env) {
  if (env.helpers.requireDist) return { kernel: env.helpers.requireDist('core/kernel.js'), cleanup() {} }
  return transpileCoreForDirect(env.helpers.extRoot)
}

function readSource(env, rel) {
  return env.helpers.readSource ? env.helpers.readSource(rel) : fs.readFileSync(path.join(env.helpers.extRoot, rel), 'utf8')
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  assert.equal(path.dirname(root), os.tmpdir(), 'fixture root must be under OS tmpdir')
  return root
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function hasGoToolchain() {
  return cp.spawnSync('go', ['version'], { encoding: 'utf8', timeout: 10_000 }).status === 0
}

function buildSourceArtifact(root, tempRoot) {
  if (!hasGoToolchain()) {
    throw new Error(JSON.stringify(builder.compactFailure('go-unavailable', 'install Go before running packaged-preview manifest integration fixture build', 'go-version')))
  }
  return builder.buildGoHelperArtifact({
    extRoot: root,
    outputRoot: path.join(tempRoot, 'builder-output'),
    generatedAt: FIXED_GENERATED_AT,
    runIdentity: RUN_IDENTITY,
    sourceRevision: FIXED_REVISION,
  })
}

function copyArtifactToInstalledRoot(tempRoot, source, label = 'installed-root') {
  const installedRoot = path.join(tempRoot, label)
  const files = [source.helperPath, source.manifestPath, source.checksumPath, source.provenancePath, source.licensePath, source.licenseMetadataPath, source.attestationPath]
  const relMap = new Map()
  for (const file of files) {
    const oldRel = toPosix(path.relative(source.outputRoot, file))
    const newRel = `node_modules/${PACKAGE_NAME}/${oldRel}`
    const target = path.join(installedRoot, ...newRel.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(file, target)
    if (process.platform !== 'win32' && file === source.helperPath) fs.chmodSync(target, fs.statSync(file).mode & 0o777)
    relMap.set(oldRel, newRel)
  }

  const manifestRel = relMap.get(toPosix(path.relative(source.outputRoot, source.manifestPath)))
  const manifestPath = path.join(installedRoot, ...manifestRel.split('/'))
  const manifest = readJson(manifestPath)
  const remapRel = value => relMap.get(value) || value
  manifest.artifact.path = remapRel(manifest.artifact.path)
  for (const key of Object.keys(manifest.files)) manifest.files[key] = remapRel(manifest.files[key])
  manifest.license.path = remapRel(manifest.license.path)
  manifest.license.metadataPath = remapRel(manifest.license.metadataPath)
  manifest.attestation.path = remapRel(manifest.attestation.path)
  manifest.build.command = ['go', 'build', '-trimpath', '-o', manifest.artifact.path, '.']
  writeJson(manifestPath, manifest)

  const provenancePath = path.join(installedRoot, ...manifest.files.provenance.split('/'))
  const provenance = readJson(provenancePath)
  provenance.build.command = ['go', 'build', '-trimpath', '-o', manifest.artifact.path, '.']
  writeJson(provenancePath, provenance)

  const licenseMetadataPath = path.join(installedRoot, ...manifest.files.licenseMetadata.split('/'))
  const licenseMetadata = readJson(licenseMetadataPath)
  licenseMetadata.path = manifest.files.license
  writeJson(licenseMetadataPath, licenseMetadata)

  const attestationPath = path.join(installedRoot, ...manifest.files.attestation.split('/'))
  const attestation = JSON.parse(fs.readFileSync(attestationPath, 'utf8').trim())
  attestation.subject[0].name = manifest.artifact.path
  fs.writeFileSync(attestationPath, `${JSON.stringify(attestation)}\n`, 'utf8')

  manifest.license.sha256 = sha256(path.join(installedRoot, ...manifest.files.license.split('/')))
  manifest.license.metadataSha256 = sha256(licenseMetadataPath)
  manifest.attestation.sha256 = sha256(attestationPath)
  writeJson(manifestPath, manifest)

  const checksumPath = path.join(installedRoot, ...manifest.files.checksums.split('/'))
  const checksumRows = [
    [sha256(path.join(installedRoot, ...manifest.files.helper.split('/'))), manifest.files.helper],
    [sha256(manifestPath), manifest.files.manifest],
    [sha256(provenancePath), manifest.files.provenance],
    [manifest.license.sha256, manifest.files.license],
    [manifest.license.metadataSha256, manifest.files.licenseMetadata],
    [manifest.attestation.sha256, manifest.files.attestation],
  ]
  fs.writeFileSync(checksumPath, checksumRows.map(([hash, rel]) => `${hash}  ${rel}`).join('\n') + '\n', 'utf8')

  return {
    installedRoot,
    manifestRel,
    manifestPath,
    helperPath: path.join(installedRoot, ...manifest.files.helper.split('/')),
  }
}

function helperSource(paneId, options = {}) {
  const health = {
    ok: true,
    implementation: 'go',
    protocolVersion: 1,
    adapterVersion: HELPER_VERSION,
    helperVersion: HELPER_VERSION,
    capabilities: ['health', 'profile', MODULE, 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle'],
    businessPathsConnected: false,
  }
  return `#!/usr/bin/env node
const fs = require('node:fs')
if (process.env.SHOULD_NOT_RUN_FILE) fs.writeFileSync(process.env.SHOULD_NOT_RUN_FILE, 'called')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input) : {}
const health = ${JSON.stringify(health)}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
if (request.method === 'health') respond(health)
else if (request.method === 'profile') respond({ ...health, profile: { scope: 'skeleton-only', params: request.params || {}, stateConnected: false, tmuxConnected: false, tmuxSnapshotParseConnected: true, tmuxSnapshotCaptureConnected: true, compactReadModelFingerprintConnected: true, workerLifecycleInspectPaneConnected: true, workerLifecycleListAgentTeamPanesConnected: true, panelConnected: false, taskReportPlanRunConnected: false } })
else if (request.method === 'tmuxSnapshotParse') respond({ ok: true, capturedAt: request.params.capturedAt, panes: [{ paneId: '${paneId}', target: 'preview:@1', label: '${options.label || 'preview'}', currentCommand: 'pi' }], byPaneId: { '${paneId}': { paneId: '${paneId}', target: 'preview:@1', label: '${options.label || 'preview'}', currentCommand: 'pi' } } })
else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params.input, fingerprint: 'helper-should-not-run-for-read-model', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })
else if (request.method === 'workerLifecycle') { const params = request.params || {}; if (params.operation === 'listAgentTeamPanes') respond({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'captureCurrentPaneBinding') respond({ ok: true, operation: 'captureCurrentPaneBinding', capability: 'workerLifecycle', paneId: '%fake-current', target: 'test:@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'listPanesInWindow') respond({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: params.target || 'test:@1', exists: true, paneIds: ['%fake-current'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else respond({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId: request.params.paneId || '', requestedPaneId: request.params.paneId || '', exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', error: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) }
else respond({ ok: true })
`
}

function writeHelper(tempRoot, name, paneId) {
  const helperDir = path.join(tempRoot, `helper-${name}`)
  const helperPath = path.join(helperDir, `${name}.cjs`)
  fs.mkdirSync(helperDir, { recursive: true })
  fs.writeFileSync(helperPath, helperSource(paneId), 'utf8')
  fs.chmodSync(helperPath, 0o755)
  return helperPath
}

function tmuxFallback(stdout, capturedAt) {
  const panes = stdout ? [{ paneId: '%ts', target: 'ts:@1', label: 'TypeScript fallback', currentCommand: 'pi' }] : []
  return { ok: true, capturedAt, panes, byPaneId: Object.fromEntries(panes.map(item => [item.paneId, item])) }
}

function throwingTmuxFallback() {
  throw new Error('TypeScript parser fallback must not be called in packaged preview cutover path')
}

function assertNoLeaks(value, roots = []) {
  const text = JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'diagnostic must not leak absolute root')
  }
  assert.equal(text.includes(process.cwd()), false, 'diagnostic must not leak cwd')
  assert.equal(/stdout|stderr|Error:|AssertionError|\bat\s+|stack/i.test(text), false, 'diagnostic must not leak raw process details')
  assert.equal(/native\/tmuxSnapshotParse|manifest\.json|provenance\.json|license\.json|attestation\.intoto|SHA256SUMS|node_modules\/pi-agentteam/i.test(text), false, 'diagnostic must not leak package internals')
  for (const sentinel of Object.values(SENTINELS)) assert.equal(text.includes(sentinel), false, `diagnostic must not leak ${sentinel}`)
}

function assertCutoverFailure(adapter, snapshot, expectedKind, roots, expectedCalls = 0) {
  assert.equal(snapshot.ok, false)
  assert.equal(snapshot.status, 'unknown')
  assert.equal(snapshot.resultMarker, 'stale')
  assert.equal(snapshot.module, MODULE)
  assert.equal(snapshot.capability, MODULE)
  assert.equal(snapshot.cutoverFailureKind, expectedKind)
  assert.deepEqual(snapshot.panes, [])
  assert.deepEqual(snapshot.byPaneId, {})
  assertNoLeaks(snapshot, roots)
  const metadata = adapter.metadata()
  assert.equal(metadata.kernel.requestedMode, 'go-packaged-preview')
  assert.equal(metadata.kernel.enabled, false)
  assert.equal(metadata.kernel.calls, expectedCalls)
  assert.equal(metadata.kernel.fallbacks, 0)
  assert.equal(metadata.kernel.cutoverStatus, 'unavailable')
  assert.equal(metadata.kernel.cutoverFailureKind, expectedKind)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackReason'), false)
  assertNoLeaks(metadata, roots)
}

function compactInput() {
  return { mode: 'attached', team: { name: 'preview-team' }, members: [], tasks: [], mailbox: [] }
}

function assertPackageRuntimeGuardrails(root, kernelSource) {
  const packageJson = readJson(path.join(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false)
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false)
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
  assert.ok(kernelSource.includes("const packagedPreviewRequested = requestedMode === 'go-packaged-preview'"))
  assert.ok(kernelSource.includes('const packagedResolverRequested = packagedPreviewRequested || defaultCutoverRequested'))
  assert.ok(kernelSource.includes('const packagedManifestRequested = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath'))
  assert.ok(kernelSource.includes('const helperPath = explicitHelperPath || packagedHelperPath || packagedManifestHelperPath'))
  assert.ok(kernelSource.includes('defaultAgentTeamKernelEmbeddedHelperManifestPath()'))
  assert.ok(kernelSource.includes('compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)'))
}

function assertNoRepoGeneratedOutputs(root) {
  const generatedNames = /(?:^|\/)(?:SHA256SUMS|manifest|provenance|license|attestation\.intoto|package-artifact)\.(?:json|jsonl|txt|sha256|sig)$/i
  const forbidden = []
  function walk(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      const rel = toPosix(path.relative(root, full))
      if (entry.isDirectory()) {
        if (rel === '.agentteam-artifacts' || rel.startsWith('.agentteam-artifacts/')) forbidden.push(rel)
        walk(full)
      } else if (!rel.startsWith('tests/suites/') && !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam') && !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/') && (/\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))) {
        forbidden.push(rel)
      }
    }
  }
  walk(root)
  assert.deepEqual(forbidden, [], 'repo must not contain generated native/helper artifacts')
}

function buildInstalledFixture(root, tempRoot) {
  const source = buildSourceArtifact(root, tempRoot)
  return copyArtifactToInstalledRoot(tempRoot, source)
}

module.exports = {
  name: 'Go kernel v0.6.29 packaged preview manifest integration',
  async run(env) {
    const root = env.helpers.extRoot
    const loaded = loadKernel(env)
    const kernel = loaded.kernel
    const kernelSource = readSource(env, 'core/kernel.ts')
    assertPackageRuntimeGuardrails(root, kernelSource)
    assertNoRepoGeneratedOutputs(root)

    let tempRoot
    try {
      tempRoot = mkTempRoot('agentteam-v0629-packaged-preview-integration-')
      const fixture = buildInstalledFixture(root, tempRoot)
      const envManifest = {
        PATH: process.env.PATH,
        PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT: fixture.installedRoot,
        PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST: fixture.manifestRel,
      }

      const explicitHelper = writeHelper(tempRoot, 'explicit', '%explicit')
      const explicitAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', helperPath: explicitHelper, packagedHelperInstallRoot: fixture.installedRoot, packagedHelperManifestPath: fixture.manifestRel, env: { PATH: process.env.PATH } })
      const explicitSnapshot = explicitAdapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700006000001, throwingTmuxFallback)
      assert.equal(explicitSnapshot.panes[0].paneId, '%explicit', 'explicit helper should beat manifest resolver')
      assert.equal(explicitAdapter.metadata().kernel.helperPath, path.basename(explicitHelper))

      const directHelper = writeHelper(tempRoot, 'direct-packaged', '%direct')
      const directAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: directHelper, packagedHelperInstallRoot: fixture.installedRoot, packagedHelperManifestPath: fixture.manifestRel, env: { PATH: process.env.PATH } })
      const directSnapshot = directAdapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700006000002, throwingTmuxFallback)
      assert.equal(directSnapshot.panes[0].paneId, '%direct', 'direct packaged helper should beat manifest resolver')
      assert.equal(directAdapter.metadata().kernel.helperPath, path.basename(directHelper))

      const manifestAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperInstallRoot: fixture.installedRoot, packagedHelperManifestPath: fixture.manifestRel, env: { PATH: process.env.PATH } })
      const readModel = manifestAdapter.compactReadModelFingerprint(compactInput())
      assert.equal(readModel.readOnly, true)
      assert.equal(manifestAdapter.metadata().kernel.calls, 0, 'read-model should remain TypeScript fallback')
      const manifestSnapshot = manifestAdapter.parseTmuxPaneSnapshot('%1\ttest:@1\tleader\tpi', 1700006000003, throwingTmuxFallback)
      assert.equal(manifestSnapshot.ok, true)
      assert.equal(manifestSnapshot.panes[0].paneId, '%1')
      const manifestMetadata = manifestAdapter.metadata()
      assert.equal(manifestMetadata.kernel.mode, 'go')
      assert.equal(manifestMetadata.kernel.enabled, true)
      assert.equal(manifestMetadata.kernel.calls, 2, 'health preflight plus tmuxSnapshotParse')
      assert.equal(manifestMetadata.kernel.cutoverStatus, 'active')
      assert.equal(manifestMetadata.kernel.helperPath, path.basename(fixture.helperPath))
      assertNoLeaks(manifestMetadata, [root, tempRoot, fixture.installedRoot])

      const envAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: envManifest })
      const envSnapshot = envAdapter.parseTmuxPaneSnapshot('%2\ttest:@1\tworker\tpi', 1700006000004, throwingTmuxFallback)
      assert.equal(envSnapshot.ok, true)
      assert.equal(envSnapshot.panes[0].paneId, '%2')

      const badManifestPath = path.join(fixture.installedRoot, fixture.manifestRel)
      const invalidAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperInstallRoot: fixture.installedRoot, packagedHelperManifestPath: badManifestPath, env: { PATH: process.env.PATH } })
      let fallbackCalled = false
      const invalidSnapshot = invalidAdapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700006000005, () => {
        fallbackCalled = true
        return tmuxFallback('', 1700006000005)
      })
      assert.equal(fallbackCalled, false, 'invalid manifest cutover path must not call TS parser fallback')
      assertCutoverFailure(invalidAdapter, invalidSnapshot, 'helper-unsafe-response-shape', [root, tempRoot, fixture.installedRoot], 0)

      const incompleteAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperInstallRoot: fixture.installedRoot, env: { PATH: process.env.PATH } })
      const incompleteSnapshot = incompleteAdapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700006000006, throwingTmuxFallback)
      assertCutoverFailure(incompleteAdapter, incompleteSnapshot, 'missing-helper', [root, tempRoot, fixture.installedRoot], 0)

      const nonPreviewEnv = { ...envManifest, SHOULD_NOT_RUN_FILE: path.join(tempRoot, 'resolver-should-not-spawn') }
      for (const mode of [undefined, 'go']) {
        const adapter = kernel.createAgentTeamKernelAdapter({ mode, env: nonPreviewEnv })
        const before = adapter.metadata().kernel.calls
        const snapshot = adapter.parseTmuxPaneSnapshot('%go\tgo:@1\tGo default\tpi', 1700006000007, throwingTmuxFallback)
        assert.equal(snapshot.ok, true, `${mode || 'default'} should use embedded helper`)
        assert.equal(snapshot.panes[0].paneId, '%go')
        assert.equal(adapter.metadata().kernel.calls, before + 2, `${mode || 'default'} should call health and parser helper methods`)
        assert.equal(fs.existsSync(nonPreviewEnv.SHOULD_NOT_RUN_FILE), false, `${mode || 'default'} should not use test-only packaged preview helper marker`)
      }
      for (const mode of ['disabled', 'typescript', 'auto', 'go-cutover']) {
        const adapter = kernel.createAgentTeamKernelAdapter({ mode, env: nonPreviewEnv })
        const before = adapter.metadata().kernel.calls
        const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700006000008, mode === 'go-cutover' ? throwingTmuxFallback : tmuxFallback)
        if (mode === 'go-cutover') {
          assert.equal(snapshot.ok, false, 'go-cutover must not discover packaged manifest')
          assert.equal(snapshot.cutoverFailureKind, 'missing-helper')
        } else {
          assert.equal(snapshot.ok, true, `${mode} should keep explicit fallback behavior`)
          assert.equal(snapshot.panes[0].paneId, '%ts')
        }
        assert.equal(adapter.metadata().kernel.calls, before, `${mode} should not call helper`)
        assert.equal(fs.existsSync(nonPreviewEnv.SHOULD_NOT_RUN_FILE), false, `${mode} must not spawn helper`)
      }
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
      loaded.cleanup()
    }

    assertNoRepoGeneratedOutputs(root)
  },
}
