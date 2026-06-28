const assert = require('node:assert/strict')
const cp = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const builder = require('../../scripts/lib/go-helper-artifact-builder.cjs')

const DOC = 'docs/perf/v0.6.30-ci-review-artifact-prototype.md'
const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const FIXED_GENERATED_AT = '2026-06-12T00:00:00.000Z'
const FIXED_REVISION = 'fedcba9876543210fedcba9876543210fedcba98'
const RUN_IDENTITY = 'v0630-packaged-preview-reviewer-usability'
const SENTINELS = {
  stdout: 'V0630_PREVIEW_USABILITY_STDOUT_SHOULD_NOT_LEAK',
  stderr: 'V0630_PREVIEW_USABILITY_STDERR_SHOULD_NOT_LEAK',
  manifest: 'V0630_PREVIEW_USABILITY_MANIFEST_BODY_SHOULD_NOT_LEAK',
  provenance: 'V0630_PREVIEW_USABILITY_PROVENANCE_BODY_SHOULD_NOT_LEAK',
  license: 'V0630_PREVIEW_USABILITY_LICENSE_BODY_SHOULD_NOT_LEAK',
  attestation: 'V0630_PREVIEW_USABILITY_ATTESTATION_BODY_SHOULD_NOT_LEAK',
  artifactIndex: 'V0630_PREVIEW_USABILITY_ARTIFACT_INDEX_SHOULD_NOT_LEAK',
  mailbox: 'V0630_PREVIEW_USABILITY_MAILBOX_REPORT_SHOULD_NOT_LEAK',
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
  const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0630-reviewer-usability-core-'))
  fs.mkdirSync(path.join(distRoot, 'core'), { recursive: true })
  for (const rel of ['core/readModelFingerprint.ts', 'core/kernelPackagedResolver.ts', 'core/kernel.ts']) {
    const sourcePath = path.join(root, rel)
    const out = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
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
    kernel: require(path.join(distRoot, 'core', 'kernel.js')),
    resolver: require(path.join(distRoot, 'core', 'kernelPackagedResolver.js')),
    cleanup() {
      fs.rmSync(distRoot, { recursive: true, force: true })
    },
  }
}

function loadCore(env) {
  if (env.helpers.requireDist) {
    return {
      kernel: env.helpers.requireDist('core/kernel.js'),
      resolver: env.helpers.requireDist('core/kernelPackagedResolver.js'),
      cleanup() {},
    }
  }
  return transpileCoreForDirect(env.helpers.extRoot)
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0630-reviewer-usability-'))
  assert.equal(path.dirname(root), os.tmpdir(), 'reviewer usability temp root must be under OS tmpdir')
  return root
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
}

function artifactPath(root, relPath) {
  return path.join(root, ...relPath.split('/'))
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeFakeGo(binDir) {
  fs.mkdirSync(binDir, { recursive: true })
  const fakeGoPath = path.join(binDir, 'go')
  fs.writeFileSync(fakeGoPath, `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
if (args[0] === 'version') {
  process.stdout.write('go version go1.99.0 agentteam-fake/host\\n')
  process.exit(0)
}
if (args[0] !== 'build') process.exit(2)
const output = args[args.indexOf('-o') + 1]
const health = ${JSON.stringify({ ok: true, implementation: 'go', protocolVersion: 1, helperVersion: HELPER_VERSION, capabilities: ['health', 'profile', MODULE, 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'], businessPathsConnected: false })}
const helperSource = [
  '#!/usr/bin/env node',
  "const fs = require('node:fs')",
  "if (process.env.SHOULD_NOT_RUN_FILE) fs.writeFileSync(process.env.SHOULD_NOT_RUN_FILE, 'called')",
  "const input = fs.readFileSync(0, 'utf8').trim()",
  "const request = input ? JSON.parse(input.split('\\\\n')[0]) : {}",
  'const health = ' + JSON.stringify(health),
  "function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\\\n') }",
  "if (request.method === 'health') respond(health)",
  "else if (request.method === 'profile') respond({ ...health, profile: { scope: 'skeleton-only', params: request.params || {}, stateConnected: false, tmuxConnected: false, tmuxSnapshotParseConnected: true, tmuxSnapshotCaptureConnected: true, compactReadModelFingerprintConnected: true, workerLifecycleInspectPaneConnected: true, workerLifecycleListAgentTeamPanesConnected: true, panelConnected: false, taskReportPlanRunConnected: false } })",
  "else if (request.method === 'tmuxSnapshotParse') respond({ ok: true, capturedAt: Number((request.params || {}).capturedAt || 0), panes: [{ paneId: '%1', target: 'review:@1', label: 'reviewer', currentCommand: 'pi' }], byPaneId: { '%1': { paneId: '%1', target: 'review:@1', label: 'reviewer', currentCommand: 'pi' } } })",
  "else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params && request.params.input, fingerprint: 'helper-should-not-run', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })",
  "else if (request.method === 'workerLifecycle') { const params = request.params || {}; if (params.operation === 'listAgentTeamPanes') respond({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'captureCurrentPaneBinding') respond({ ok: true, operation: 'captureCurrentPaneBinding', capability: 'workerLifecycle', paneId: '%fake-current', target: 'test:@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'listPanesInWindow') respond({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: params.target || 'test:@1', exists: true, paneIds: ['%fake-current'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findAgentTeamWindowTarget') respond({ ok: true, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findWindowTargetByName') respond({ ok: true, operation: 'findWindowTargetByName', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', windowName: params.windowName || 'agentteam', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'sessionExists') respond({ ok: true, operation: 'sessionExists', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'markWindowAsAgentTeam') respond({ ok: false, operation: 'markWindowAsAgentTeam', capability: 'workerLifecycle', target: '', marked: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', error: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else respond({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId: params.paneId || '', requestedPaneId: params.paneId || '', exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', error: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) }",
  "else if (request.method === 'tmuxAvailability') respond({ ok: true, capability: 'tmuxAvailability', available: true, version: 'tmux 3.4', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })",
  "else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'method not found' } }) + '\\\\n')",
].join('\\n') + '\\n'
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, helperSource, 'utf8')
if (process.platform !== 'win32') fs.chmodSync(output, 0o755)
`, 'utf8')
  fs.chmodSync(fakeGoPath, 0o755)
}

function buildReviewArtifact(root, tempRoot) {
  const fakeBin = path.join(tempRoot, 'fake-bin')
  writeFakeGo(fakeBin)
  const outputRoot = path.join(tempRoot, 'downloaded-review-artifact')
  const result = builder.buildGoHelperArtifact({
    extRoot: root,
    outputRoot,
    env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}` },
    ciReview: true,
    generatedAt: FIXED_GENERATED_AT,
    runIdentity: RUN_IDENTITY,
    sourceRevision: FIXED_REVISION,
  })
  return { outputRoot, result }
}

function cloneArtifact(tempRoot, sourceRoot, name) {
  const cloneRoot = path.join(tempRoot, `case-${name.replace(/[^a-z0-9-]+/gi, '-')}`)
  fs.cpSync(sourceRoot, cloneRoot, { recursive: true })
  return cloneRoot
}

function indexPath(root) {
  return path.join(root, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'artifact-index.json')
}

function rewriteIndex(root, mutator) {
  const filePath = indexPath(root)
  const index = readJson(filePath)
  mutator(index)
  writeJson(filePath, index)
}

function refreshIndexRow(root, kind) {
  rewriteIndex(root, index => {
    const row = index.files.find(item => item.kind === kind)
    const filePath = artifactPath(root, row.path)
    row.sha256 = sha256(filePath)
    row.size = fs.statSync(filePath).size
  })
}

function rewriteChecksum(root, relPath, hash) {
  const checksumPath = path.join(root, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'SHA256SUMS')
  const rows = fs.readFileSync(checksumPath, 'utf8').trim().split('\n').filter(Boolean).map(line => {
    const [, existingHash, existingRel] = line.match(/^([a-f0-9]{64})  (.+)$/i)
    return existingRel === relPath ? `${hash}  ${existingRel}` : `${existingHash}  ${existingRel}`
  })
  fs.writeFileSync(checksumPath, `${rows.join('\n')}\n`, 'utf8')
  refreshIndexRow(root, 'checksums')
}

function rewriteManifest(root, mutator) {
  const manifestPath = path.join(root, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'manifest.json')
  const manifest = readJson(manifestPath)
  mutator(manifest)
  writeJson(manifestPath, manifest)
  refreshIndexRow(root, 'manifest')
  rewriteChecksum(root, manifest.files.manifest, sha256(manifestPath))
}

function writeHelper(root, source) {
  const manifest = readJson(path.join(root, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'manifest.json'))
  const helperPath = artifactPath(root, manifest.files.helper)
  fs.writeFileSync(helperPath, source, 'utf8')
  if (process.platform !== 'win32') fs.chmodSync(helperPath, 0o755)
  const helperHash = sha256(helperPath)
  rewriteManifest(root, updated => {
    updated.artifact.sha256 = helperHash
    updated.artifact.size = fs.statSync(helperPath).size
  })
  rewriteChecksum(root, manifest.files.helper, helperHash)
  refreshIndexRow(root, 'helper')
  return helperPath
}

function helperSource(paneId) {
  const health = { ok: true, implementation: 'go', protocolVersion: 1, helperVersion: HELPER_VERSION, capabilities: ['health', 'profile', MODULE, 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'], businessPathsConnected: false }
  return `#!/usr/bin/env node
const fs = require('node:fs')
if (process.env.SHOULD_NOT_RUN_FILE) fs.writeFileSync(process.env.SHOULD_NOT_RUN_FILE, 'called')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input.split('\\n')[0]) : {}
const health = ${JSON.stringify(health)}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
if (request.method === 'health') respond(health)
else if (request.method === 'tmuxSnapshotParse') respond({ ok: true, capturedAt: request.params.capturedAt, panes: [{ paneId: '${paneId}', target: 'review:@1', label: 'reviewer', currentCommand: 'pi' }], byPaneId: { '${paneId}': { paneId: '${paneId}', target: 'review:@1', label: 'reviewer', currentCommand: 'pi' } } })
else respond({ ok: true })
`
}

function tmuxFallback(stdout, capturedAt) {
  const panes = stdout ? [{ paneId: '%ts', target: 'ts:@1', label: 'TypeScript fallback', currentCommand: 'pi' }] : []
  return { ok: true, capturedAt, panes, byPaneId: Object.fromEntries(panes.map(item => [item.paneId, item])) }
}

function throwingTmuxFallback() {
  throw new Error('TypeScript fallback must not be called for reviewer preview failures')
}

function compactInput() {
  return {
    mode: 'attached',
    team: { name: 'reviewer-usability', leaderCwd: '/tmp/reviewer-usability' },
    members: [{ name: 'team-lead', role: 'leader', status: 'idle', text: 'SHOULD_BE_STRIPPED' }],
    tasks: [],
    mailbox: [],
  }
}

function assertNoLeaks(value, roots = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'diagnostic must not leak absolute root')
  }
  assert.equal(text.includes(process.cwd()), false, 'diagnostic must not leak repo cwd')
  assert.equal(/stdout|stderr|Error:|AssertionError|\bat\s+|stack/i.test(text), false, 'diagnostic must not leak process or stack details')
  assert.equal(/native\/tmuxSnapshotParse|node_modules\/pi-agentteam|manifest\.json|provenance\.json|license\.json|attestation\.intoto|artifact-index\.json|SHA256SUMS/i.test(text), false, 'diagnostic must not leak package internals')
  for (const sentinel of Object.values(SENTINELS)) assert.equal(text.includes(sentinel), false, `diagnostic must not leak ${sentinel}`)
}

function assertPreviewFailure(adapter, snapshot, expectedKind, roots, options = {}) {
  assert.equal(snapshot.ok, false, `${options.label || expectedKind} should fail closed`)
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
  assert.equal(metadata.kernel.mode, 'typescript')
  assert.equal(metadata.kernel.enabled, false)
  assert.equal(metadata.kernel.calls, options.expectedCalls || 0)
  assert.equal(metadata.kernel.fallbacks, 0)
  assert.equal(metadata.kernel.cutoverStatus, 'unavailable')
  assert.equal(metadata.kernel.cutoverFailureKind, expectedKind)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackReason'), false)
  if (options.reasonIncludes) assert.ok(String(metadata.kernel.cutoverReason || '').includes(options.reasonIncludes), `cutover reason should include ${options.reasonIncludes}`)
  assertNoLeaks(metadata, roots)
}

function runPositivePrecedence(kernel, tempRoot, outputRoot, manifestRel) {
  const explicitRoot = cloneArtifact(tempRoot, outputRoot, 'explicit-helper-wins')
  const explicitHelper = writeHelper(explicitRoot, helperSource('%explicit'))
  const explicitAdapter = kernel.createAgentTeamKernelAdapter({
    mode: 'go-packaged-preview',
    helperPath: explicitHelper,
    packagedHelperInstallRoot: explicitRoot,
    packagedHelperManifestPath: manifestRel,
    env: { PATH: process.env.PATH || '' },
  })
  const explicitSnapshot = explicitAdapter.parseTmuxPaneSnapshot('%input\treview:@1\tlabel\tpi', 1700010000001, throwingTmuxFallback)
  assert.equal(explicitSnapshot.panes[0].paneId, '%explicit')
  assert.equal(explicitAdapter.metadata().kernel.helperPath, path.basename(explicitHelper))
  assertNoLeaks(explicitAdapter.metadata(), [tempRoot, explicitRoot])

  const directRoot = cloneArtifact(tempRoot, outputRoot, 'direct-packaged-helper')
  const directHelper = writeHelper(directRoot, helperSource('%direct'))
  const directAdapter = kernel.createAgentTeamKernelAdapter({
    mode: 'go-packaged-preview',
    packagedHelperPath: directHelper,
    packagedHelperInstallRoot: directRoot,
    packagedHelperManifestPath: manifestRel,
    env: { PATH: process.env.PATH || '' },
  })
  const directSnapshot = directAdapter.parseTmuxPaneSnapshot('%input\treview:@1\tlabel\tpi', 1700010000002, throwingTmuxFallback)
  assert.equal(directSnapshot.panes[0].paneId, '%direct')
  assert.equal(directAdapter.metadata().kernel.helperPath, path.basename(directHelper))
  assertNoLeaks(directAdapter.metadata(), [tempRoot, directRoot])
}

function runIncompletePairs(kernel, tempRoot, outputRoot, manifestRel) {
  const roots = [tempRoot, outputRoot]
  const cases = [
    ['manifest without root', { packagedHelperManifestPath: manifestRel }, 'packaged manifest root missing'],
    ['root without manifest', { packagedHelperInstallRoot: outputRoot }, 'packaged manifest path missing'],
  ]
  for (const [label, options, reasonIncludes] of cases) {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', ...options, env: { PATH: process.env.PATH || '' } })
    let fallbackCalled = false
    const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tfallback\tpi', 1700010000003, () => {
      fallbackCalled = true
      return tmuxFallback('', 1700010000003)
    })
    assert.equal(fallbackCalled, false, `${label} must not call TS tmux fallback`)
    assertPreviewFailure(adapter, snapshot, 'missing-helper', roots, { label, reasonIncludes })
  }
}

function runManifestFailureCases(kernel, tempRoot, outputRoot, manifestRel) {
  const cases = [
    ['unsupported libc', 'disabled-helper', clone => rewriteManifest(clone, manifest => { manifest.platform.libc = 'reviewer-unsupported-libc'; manifest.__secret = SENTINELS.manifest })],
    ['missing executable', 'missing-helper', clone => fs.rmSync(artifactPath(clone, readJson(path.join(clone, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'manifest.json')).files.helper), { force: true })],
    ['version skew', 'helper-unsupported-version', clone => rewriteManifest(clone, manifest => { manifest.helperVersion = '0.0.0-reviewer-skew'; manifest.__secret = SENTINELS.manifest })],
    ['protocol skew', 'helper-unsupported-version', clone => rewriteManifest(clone, manifest => { manifest.protocolVersion = 999; manifest.__secret = SENTINELS.manifest })],
    ['checksum mismatch', 'helper-unsafe-response-shape', clone => fs.appendFileSync(artifactPath(clone, readJson(path.join(clone, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'manifest.json')).files.helper), 'tamper')],
    ['bad executable mode', 'helper-unsafe-response-shape', clone => process.platform !== 'win32'
      ? fs.chmodSync(artifactPath(clone, readJson(path.join(clone, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'manifest.json')).files.helper), 0o644)
      : rewriteManifest(clone, manifest => { manifest.artifact.filename = manifest.artifact.filename.replace(/\.exe$/i, ''); manifest.artifact.mode = 'missing-extension'; manifest.__secret = SENTINELS.manifest })],
  ]

  for (const [name, expectedKind, mutate] of cases) {
    const clone = cloneArtifact(tempRoot, outputRoot, name)
    mutate(clone)
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperInstallRoot: clone, packagedHelperManifestPath: manifestRel, env: { PATH: process.env.PATH || '' } })
    let fallbackCalled = false
    const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tfallback\tpi', 1700010000004, () => {
      fallbackCalled = true
      return tmuxFallback('', 1700010000004)
    })
    assert.equal(fallbackCalled, false, `${name} must not call TS tmux fallback`)
    assertPreviewFailure(adapter, snapshot, expectedKind, [tempRoot, clone, process.cwd()], { label: name })
  }
}

function runNonPreviewModes(kernel, tempRoot, outputRoot, manifestRel) {
  const env = {
    PATH: process.env.PATH || '',
    PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT: outputRoot,
    PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST: manifestRel,
    SHOULD_NOT_RUN_FILE: path.join(tempRoot, 'non-preview-helper-called'),
  }
  for (const mode of [undefined, 'go']) {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode, env })
    const before = adapter.metadata().kernel.calls
    const snapshot = adapter.parseTmuxPaneSnapshot('%go\tgo:@1\tGo default\tpi', 1700010000005, throwingTmuxFallback)
    assert.equal(snapshot.ok, true, `${mode || 'default'} should use embedded helper`)
    assert.equal(snapshot.panes[0].paneId, '%go')
    assert.equal(adapter.metadata().kernel.calls, before + 2, `${mode || 'default'} must call health and parser helper methods`)
    assert.equal(fs.existsSync(env.SHOULD_NOT_RUN_FILE), false, `${mode || 'default'} must not spawn preview fixture helper`)
    assertNoLeaks(adapter.metadata(), [tempRoot, outputRoot])
  }
  for (const mode of ['disabled', 'typescript', 'auto', 'go-cutover']) {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode, env })
    const before = adapter.metadata().kernel.calls
    const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700010000006, mode === 'go-cutover' ? throwingTmuxFallback : tmuxFallback)
    if (mode === 'go-cutover') {
      assert.equal(snapshot.ok, false, 'current go-cutover must ignore packaged manifest env')
      assert.equal(snapshot.cutoverFailureKind, 'missing-helper')
    } else {
      assert.equal(snapshot.ok, true, `${mode} should keep explicit fallback behavior`)
      assert.equal(snapshot.panes[0].paneId, '%ts')
    }
    assert.equal(adapter.metadata().kernel.calls, before, `${mode} must not call helper`)
    assert.equal(fs.existsSync(env.SHOULD_NOT_RUN_FILE), false, `${mode} must not spawn helper`)
    assertNoLeaks(adapter.metadata(), [tempRoot, outputRoot])
  }
}

function assertResolverDiagnostics(resolver, tempRoot, outputRoot, manifestRel) {
  const checks = [
    ['unsupported platform', 'unsupported-platform', clone => rewriteManifest(clone, manifest => { manifest.platform.libc = 'reviewer-unsupported-libc'; manifest.__secret = SENTINELS.manifest })],
    ['missing helper', 'helper-missing', clone => fs.rmSync(artifactPath(clone, readJson(path.join(clone, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'manifest.json')).files.helper), { force: true })],
    ['version skew', 'version-skew', clone => rewriteManifest(clone, manifest => { manifest.helperVersion = '0.0.0-reviewer-skew'; manifest.__secret = SENTINELS.manifest })],
    ['protocol skew', 'version-skew', clone => rewriteManifest(clone, manifest => { manifest.protocolVersion = 999; manifest.__secret = SENTINELS.manifest })],
    ['bad checksum', 'integrity-mismatch', clone => fs.appendFileSync(artifactPath(clone, readJson(path.join(clone, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'manifest.json')).files.helper), 'tamper')],
  ]
  for (const [name, expectedKind, mutate] of checks) {
    const clone = cloneArtifact(tempRoot, outputRoot, `resolver-${name}`)
    mutate(clone)
    const result = resolver.resolveAgentTeamPackagedHelperManifest({ installedRoot: clone, manifestPath: manifestRel })
    assert.equal(result.status, 'unavailable', `${name} should be unavailable`)
    assert.equal(result.resultMarker, 'fail-closed')
    assert.equal(result.failureKind, expectedKind)
    assert.equal(typeof result.remediation, 'string')
    assert.equal(typeof result.hint, 'string')
    assertNoLeaks(result, [tempRoot, clone, process.cwd()])
  }
}

function assertDocs(root) {
  const doc = fs.readFileSync(path.join(root, DOC), 'utf8')
  for (const expected of [
    'Slice 5 — Explicit Preview Reviewer Usability Hardening',
    'manifest without root and root without manifest fail closed',
    'unsupported platform/libc, missing helper executable, version/protocol skew, checksum mismatch, and executable-mode mistakes stay compact',
    'Explicit helper path still wins over direct packaged helper path and manifest resolver',
    'disabled/typescript/auto/current `go-cutover` ignore packaged manifest env',
    'default/unset/go use only the approved embedded helper manifest and ignore preview fixture helper markers',
    'No `/team readiness`, ambient UI diagnostics, model-callable tools, package install, release, or broadened normal-user availability behavior is added',
  ]) assert.ok(doc.includes(expected), `doc should include ${expected}`)
}

function assertRuntimeSource(root) {
  const kernel = fs.readFileSync(path.join(root, 'core/kernel.ts'), 'utf8')
  assert.ok(kernel.includes("if (input.manifestPath && !input.installRoot) return { kind: 'missing-helper', detail: 'packaged manifest root missing' }"), 'kernel should distinguish missing root')
  assert.ok(kernel.includes("if (input.installRoot && !input.manifestPath) return { kind: 'missing-helper', detail: 'packaged manifest path missing' }"), 'kernel should distinguish missing manifest path')
  assert.ok(kernel.includes('const packagedResolverRequested = packagedPreviewRequested || defaultCutoverRequested'), 'manifest resolver must be limited to preview/default cutover')
  assert.ok(kernel.includes('defaultAgentTeamKernelEmbeddedHelperManifestPath()'), 'default/go must use approved embedded manifest fallback')
  assert.ok(kernel.includes('const helperPath = explicitHelperPath || packagedHelperPath || packagedManifestHelperPath'), 'helper precedence must remain explicit > direct packaged > manifest')
  assert.ok(kernel.includes('if (cutoverRequested) return fallback(compactInput)'), 'compactReadModelFingerprint remains TS fallback for cutover modes')
}

function assertPackageGuardrails(root) {
  const packageJson = readJson(path.join(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false)
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild|postinstall/i.test(command), false, `${name} must not download/build native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
}

function assertNoGeneratedCommitted(root) {
  const forbidden = []
  function walk(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      const rel = toPosix(path.relative(root, full))
      if (entry.isDirectory()) walk(full)
      else if (!rel.startsWith('tests/suites/') && !rel.startsWith('tests/helpers/') && !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam') && (/artifact-index\.json$/i.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|zip)$/i.test(rel))) forbidden.push(rel)
    }
  }
  walk(root)
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.30 packaged preview reviewer usability',
  async run(env) {
    const root = env.helpers.extRoot
    const loaded = loadCore(env)
    let tempRoot
    try {
      tempRoot = mkTempRoot()
      const { outputRoot, result } = buildReviewArtifact(root, tempRoot)
      const manifestRel = result.summary.files.manifest
      runPositivePrecedence(loaded.kernel, tempRoot, outputRoot, manifestRel)
      runIncompletePairs(loaded.kernel, tempRoot, outputRoot, manifestRel)
      runManifestFailureCases(loaded.kernel, tempRoot, outputRoot, manifestRel)
      runNonPreviewModes(loaded.kernel, tempRoot, outputRoot, manifestRel)
      assertResolverDiagnostics(loaded.resolver, tempRoot, outputRoot, manifestRel)
      assertDocs(root)
      assertRuntimeSource(root)
      assertPackageGuardrails(root)
      assertNoGeneratedCommitted(root)
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
      loaded.cleanup()
    }
  },
}
