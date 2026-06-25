const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const REQUIRED_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint']
const HELPER_VERSION = '0.3.0-read-model-shadow'
const BAD_STDOUT_SENTINEL = 'CUTOVER_MODE_BAD_STDOUT_SHOULD_NOT_LEAK'
const BAD_STDERR_SENTINEL = 'CUTOVER_MODE_BAD_STDERR_SHOULD_NOT_LEAK'
const FULL_PATH_SENTINEL = 'cutover-secret-helper-path'

function writeHelper(name, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-kernel-cutover-${name}-`))
  const file = path.join(dir, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return { dir, file }
}

function runWithHelper(name, source, action) {
  const helper = writeHelper(name, source)
  try {
    return action(helper.file)
  } finally {
    fs.rmSync(helper.dir, { recursive: true, force: true })
  }
}

function helperSource(handlerSource) {
  return `#!/usr/bin/env node
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input) : {}
const baseHealth = {
  ok: true,
  implementation: 'go',
  protocolVersion: 1,
  helperVersion: '${HELPER_VERSION}',
  capabilities: ${JSON.stringify(REQUIRED_CAPABILITIES)},
  businessPathsConnected: false,
}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
function error(code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code, message } }) + '\\n') }
${handlerSource}
`
}

function compatibleHelper() {
  return helperSource(`
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'profile') respond({ ...baseHealth, profile: { scope: 'skeleton-only', params: request.params || {}, stateConnected: false, tmuxConnected: false, tmuxSnapshotParseConnected: true, compactReadModelFingerprintConnected: true, panelConnected: false, taskReportPlanRunConnected: false } })
else if (request.method === 'tmuxSnapshotParse') respond({ capturedAt: request.params.capturedAt, panes: [{ paneId: '%go-cutover', target: 'cutover:@1', label: 'go cutover', currentCommand: 'pi' }], byPaneId: { '%go-cutover': { paneId: '%go-cutover', target: 'cutover:@1', label: 'go cutover', currentCommand: 'pi' } }, ok: true })
else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params.input, fingerprint: JSON.stringify(request.params.input), inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })
else error(-32601, 'unexpected')
`)
}

function compactInput() {
  return {
    mode: 'attached',
    team: { name: 'cutover-team', leaderCwd: '/tmp/cutover-team' },
    members: [],
    tasks: [],
    mailbox: [],
  }
}

function tmuxFallback(stdout, capturedAt) {
  const panes = stdout ? [{ paneId: '%ts', target: 'ts:@1', label: 'TypeScript fallback', currentCommand: 'pi' }] : []
  return { capturedAt, panes, byPaneId: Object.fromEntries(panes.map(item => [item.paneId, item])), ok: true }
}

function throwingTmuxFallback() {
  throw new Error('TypeScript tmux fallback must not be invoked in go-cutover mode')
}

function assertCutoverUnavailableSnapshot(snapshot, expectedKind, label) {
  assert.equal(snapshot.ok, false, `${label} must fail closed`)
  assert.equal(snapshot.status, 'unknown', `${label} should mark status unknown`)
  assert.equal(snapshot.resultMarker, 'stale', `${label} should mark stale result`)
  assert.equal(snapshot.module, 'tmuxSnapshotParse', `${label} should identify module`)
  assert.equal(snapshot.capability, 'tmuxSnapshotParse', `${label} should identify capability`)
  assert.equal(snapshot.cutoverFailureKind, expectedKind, `${label} should expose cutover failure kind`)
  assert.equal(Array.isArray(snapshot.panes), true, `${label} should include panes array`)
  assert.deepEqual(snapshot.panes, [], `${label} should not pretend panes were parsed`)
  assert.deepEqual(snapshot.byPaneId, {}, `${label} should not pretend panes were parsed`)
  assert.match(snapshot.reason, new RegExp(`Go kernel cutover unavailable \\(${expectedKind}\\)`), `${label} should include compact reason`)
  assert.match(snapshot.error, new RegExp(`Go kernel cutover unavailable \\(${expectedKind}\\)`), `${label} should include compact error`)
  assert.equal(JSON.stringify(snapshot).includes(BAD_STDOUT_SENTINEL), false, `${label} must not leak helper stdout`)
  assert.equal(JSON.stringify(snapshot).includes(BAD_STDERR_SENTINEL), false, `${label} must not leak helper stderr`)
  assert.equal(JSON.stringify(snapshot).includes(FULL_PATH_SENTINEL), false, `${label} must not leak full helper path`)
}

function assertNoMigrationFallback(metadata, label) {
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false, `${label} must not expose migration fallbackKind`)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackReason'), false, `${label} must not expose migration fallbackReason`)
}

function assertNoCutoverDiagnostic(metadata, label) {
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'cutoverFailureKind'), false, `${label} must not expose cutoverFailureKind`)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'cutoverReason'), false, `${label} must not expose cutoverReason`)
}

function assertNoSecretLeaks(metadata, label) {
  const serialized = JSON.stringify(metadata)
  assert.equal(serialized.includes(BAD_STDOUT_SENTINEL), false, `${label} must not leak helper stdout`)
  assert.equal(serialized.includes(BAD_STDERR_SENTINEL), false, `${label} must not leak helper stderr`)
  assert.equal(serialized.includes(FULL_PATH_SENTINEL), false, `${label} must not leak full helper path`)
}

function assertCommonKernelMetadata(kernel) {
  assert.equal(kernel.protocolVersion, 1)
  assert.equal(kernel.adapterVersion, HELPER_VERSION)
  assert.equal(kernel.helperVersion, HELPER_VERSION)
  assert.deepEqual(kernel.capabilities, REQUIRED_CAPABILITIES)
  assert.equal(kernel.businessPathsConnected, false)
}

module.exports = {
  name: 'Go kernel go-cutover mode contract plumbing',
  async run(env) {
    const kernel = env.helpers.requireDist('core/kernel.js')
    const source = env.helpers.readSource('core/kernel.ts')

    assert.equal(kernel.normalizeAgentTeamKernelMode('go-cutover'), 'go-cutover')
    assert.equal(kernel.normalizeAgentTeamKernelMode('GO-CUTOVER'), 'go-cutover')
    assert.equal(kernel.isKnownAgentTeamKernelMode('go-cutover'), true)
    assert.equal(kernel.isKnownAgentTeamKernelMode('go_cutover'), false)
    assert.equal(kernel.AGENTTEAM_KERNEL_CUTOVER_MODULE, 'tmuxSnapshotParse')
    assert.deepEqual(kernel.AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS, [
      'missing-helper',
      'disabled-helper',
      'helper-unsupported-protocol',
      'helper-unsupported-version',
      'helper-unsupported-capability',
      'helper-timeout',
      'helper-spawn-error',
      'helper-crash',
      'helper-nonzero-exit',
      'helper-empty-response',
      'helper-malformed-json',
      'helper-jsonrpc-error',
      'helper-incompatible-response',
      'helper-unsafe-response-shape',
      'previous-helper-failure',
    ])
    assert.match(source, /cutoverFailureKind\?: AgentTeamKernelCutoverFailureKind/, 'metadata type should include cutoverFailureKind distinct from fallbackKind')
    assert.match(source, /fallbackKind\?: AgentTeamKernelFallbackKind/, 'metadata should keep migration fallbackKind')

    const defaultAdapter = kernel.createAgentTeamKernelAdapter({ env: {} })
    const defaultMetadata = defaultAdapter.metadata()
    assert.equal(defaultMetadata.kernel.requestedMode, 'default')
    assert.equal(defaultMetadata.kernel.requestedKnownKernel, true)
    assert.equal(defaultMetadata.kernel.mode, 'go')
    assert.equal(defaultMetadata.kernel.enabled, true)
    assert.equal(defaultMetadata.kernel.calls, 0)
    assert.equal(defaultMetadata.kernel.fallbacks, 0)
    assertCommonKernelMetadata(defaultMetadata.kernel)
    assert.equal(defaultMetadata.kernel.cutoverModule, 'tmuxSnapshotParse')
    assert.equal(defaultMetadata.kernel.cutoverStatus, 'active')
    assertNoMigrationFallback(defaultMetadata, 'default mode')
    assertNoCutoverDiagnostic(defaultMetadata, 'default mode')

    for (const mode of ['disabled', 'typescript']) {
      runWithHelper(`not-called-${mode}`, helperSource(`
fs.writeFileSync(process.env.SHOULD_NOT_RUN_FILE, 'called')
respond(baseHealth)
`), helperPath => {
        const marker = path.join(path.dirname(helperPath), 'called')
        const adapter = kernel.createAgentTeamKernelAdapter({ mode, helperPath, env: { SHOULD_NOT_RUN_FILE: marker, PATH: process.env.PATH } })
        adapter.parseTmuxPaneSnapshot('%x\tx:@1\tlabel\tpi', 1700002000000, tmuxFallback)
        const metadata = adapter.metadata()
        assert.equal(metadata.kernel.requestedMode, mode)
        assert.equal(metadata.kernel.mode, 'typescript')
        assert.equal(metadata.kernel.enabled, false)
        assert.equal(metadata.kernel.calls, 0)
        assert.equal(metadata.kernel.fallbacks, 0)
        assertNoMigrationFallback(metadata, mode)
        assertNoCutoverDiagnostic(metadata, mode)
        assert.equal(fs.existsSync(marker), false, `${mode} must not spawn helper`)
      })
    }

    const autoMissing = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath: path.join(os.tmpdir(), FULL_PATH_SENTINEL, 'missing-auto-helper') })
    autoMissing.parseTmuxPaneSnapshot('%x\tx:@1\tlabel\tpi', 1700002000001, tmuxFallback)
    assert.equal(autoMissing.metadata().kernel.requestedMode, 'auto')
    assert.equal(autoMissing.metadata().kernel.mode, 'typescript')
    assert.equal(autoMissing.metadata().kernel.enabled, false)
    assert.equal(autoMissing.metadata().kernel.calls, 0)
    assert.equal(autoMissing.metadata().kernel.fallbacks, 0)
    assertNoMigrationFallback(autoMissing.metadata(), 'auto missing helper')
    assertNoCutoverDiagnostic(autoMissing.metadata(), 'auto missing helper')

    let goFallbackCalls = 0
    const goMissing = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(os.tmpdir(), FULL_PATH_SENTINEL, 'missing-go-helper') })
    const goMissingSnapshot = goMissing.parseTmuxPaneSnapshot('%x\tx:@1\tlabel\tpi', 1700002000002, (stdout, capturedAt) => {
      goFallbackCalls += 1
      return tmuxFallback(stdout, capturedAt)
    })
    assert.equal(goFallbackCalls, 0, 'go missing helper must not call deleted TypeScript parser fallback')
    assertCutoverUnavailableSnapshot(goMissingSnapshot, 'missing-helper', 'go missing helper')
    assert.equal(goMissing.metadata().kernel.requestedMode, 'go')
    assert.equal(goMissing.metadata().kernel.mode, 'typescript')
    assert.equal(goMissing.metadata().kernel.enabled, false)
    assert.equal(goMissing.metadata().kernel.calls, 0)
    assert.equal(goMissing.metadata().kernel.fallbacks, 0)
    assert.equal(goMissing.metadata().kernel.cutoverModule, 'tmuxSnapshotParse')
    assert.equal(goMissing.metadata().kernel.cutoverStatus, 'unavailable')
    assert.equal(goMissing.metadata().kernel.cutoverFailureKind, 'missing-helper')
    assertNoMigrationFallback(goMissing.metadata(), 'go missing helper')
    assertNoSecretLeaks(goMissing.metadata(), 'go missing helper')

    const cutoverMissing = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath: path.join(os.tmpdir(), FULL_PATH_SENTINEL, 'missing-cutover-helper') })
    const cutoverMissingSnapshot = cutoverMissing.parseTmuxPaneSnapshot('%x\tx:@1\tlabel\tpi', 1700002000003, throwingTmuxFallback)
    assertCutoverUnavailableSnapshot(cutoverMissingSnapshot, 'missing-helper', 'go-cutover missing helper')
    const cutoverMissingMetadata = cutoverMissing.metadata()
    assert.equal(cutoverMissingMetadata.kernel.requestedMode, 'go-cutover')
    assert.equal(cutoverMissingMetadata.kernel.requestedKnownKernel, true)
    assert.equal(cutoverMissingMetadata.kernel.mode, 'typescript')
    assert.equal(cutoverMissingMetadata.kernel.enabled, false)
    assert.equal(cutoverMissingMetadata.kernel.calls, 0)
    assert.equal(cutoverMissingMetadata.kernel.fallbacks, 0, 'go-cutover must not reuse migration fallback count for startup missing helper')
    assert.equal(cutoverMissingMetadata.kernel.cutoverModule, 'tmuxSnapshotParse')
    assert.equal(cutoverMissingMetadata.kernel.cutoverStatus, 'unavailable')
    assert.equal(cutoverMissingMetadata.kernel.cutoverFailureKind, 'missing-helper')
    assert.match(cutoverMissingMetadata.kernel.cutoverReason, /Go kernel cutover unavailable \(missing-helper\)/)
    assertNoMigrationFallback(cutoverMissingMetadata, 'go-cutover missing helper')
    assertNoSecretLeaks(cutoverMissingMetadata, 'go-cutover missing helper')

    runWithHelper('cutover-compatible-helper', compatibleHelper(), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath })
      const readModel = adapter.compactReadModelFingerprint(compactInput())
      assert.equal(readModel.readOnly, true, 'go-cutover should keep read-model on TypeScript fallback')
      assert.equal(adapter.metadata().kernel.calls, 0, 'go-cutover read-model should not call helper')
      const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700002000004, throwingTmuxFallback)
      assert.equal(snapshot.ok, true)
      assert.equal(snapshot.panes[0].paneId, '%go-cutover', 'go-cutover should return helper snapshot for tmuxSnapshotParse')
      const metadata = adapter.metadata()
      assert.equal(metadata.kernel.requestedMode, 'go-cutover')
      assert.equal(metadata.kernel.requestedKnownKernel, true)
      assert.equal(metadata.kernel.mode, 'go')
      assert.equal(metadata.kernel.enabled, true)
      assert.equal(metadata.kernel.calls, 2, 'health preflight plus tmuxSnapshotParse call')
      assert.equal(metadata.kernel.fallbacks, 0)
      assert.equal(metadata.kernel.cutoverModule, 'tmuxSnapshotParse')
      assert.equal(metadata.kernel.cutoverStatus, 'active')
      assert.equal(metadata.kernel.helperPath, path.basename(helperPath))
      assertNoMigrationFallback(metadata, 'go-cutover helper success')
      assertNoCutoverDiagnostic(metadata, 'go-cutover helper success')
      assertNoSecretLeaks(metadata, 'go-cutover helper success')
    })

    runWithHelper('cutover-malformed-helper', helperSource(`
if (request.method === 'health') respond(baseHealth)
else {
  process.stdout.write('{ malformed ${BAD_STDOUT_SENTINEL}\\n')
  process.stderr.write('${BAD_STDERR_SENTINEL}\\n')
}
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath })
      const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700002000005, throwingTmuxFallback)
      assertCutoverUnavailableSnapshot(snapshot, 'helper-malformed-json', 'go-cutover malformed helper')
      const metadata = adapter.metadata()
      assert.equal(metadata.kernel.requestedMode, 'go-cutover')
      assert.equal(metadata.kernel.mode, 'typescript')
      assert.equal(metadata.kernel.enabled, false)
      assert.equal(metadata.kernel.calls, 2)
      assert.equal(metadata.kernel.fallbacks, 0, 'go-cutover runtime failure must not increment migration fallback count')
      assert.equal(metadata.kernel.cutoverModule, 'tmuxSnapshotParse')
      assert.equal(metadata.kernel.cutoverStatus, 'unavailable')
      assert.equal(metadata.kernel.cutoverFailureKind, 'helper-malformed-json')
      assert.match(metadata.kernel.cutoverReason, /Go kernel cutover unavailable \(helper-malformed-json\)/)
      assertNoMigrationFallback(metadata, 'go-cutover malformed helper')
      assertNoSecretLeaks(metadata, 'go-cutover malformed helper')
    })

    runWithHelper('cutover-jsonrpc-error-helper', helperSource(`
if (request.method === 'health') respond(baseHealth)
else {
  process.stderr.write('${BAD_STDERR_SENTINEL}\\n')
  error(-32042, '${BAD_STDOUT_SENTINEL}')
}
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath })
      const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700002000006, throwingTmuxFallback)
      assertCutoverUnavailableSnapshot(snapshot, 'helper-jsonrpc-error', 'go-cutover JSON-RPC error helper')
      const metadata = adapter.metadata()
      assert.equal(metadata.kernel.calls, 2)
      assert.equal(metadata.kernel.fallbacks, 0)
      assert.equal(metadata.kernel.cutoverStatus, 'unavailable')
      assert.equal(metadata.kernel.cutoverFailureKind, 'helper-jsonrpc-error')
      assertNoMigrationFallback(metadata, 'go-cutover JSON-RPC error helper')
      assertNoSecretLeaks(metadata, 'go-cutover JSON-RPC error helper')
    })

    runWithHelper('cutover-incompatible-helper', helperSource(`
if (request.method === 'health') respond(baseHealth)
else respond({ capturedAt: request.params.capturedAt, panes: [{ paneId: '', target: 'bad', label: 'bad', currentCommand: 'bad' }], byPaneId: {}, ok: true })
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath })
      const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700002000007, throwingTmuxFallback)
      assertCutoverUnavailableSnapshot(snapshot, 'helper-incompatible-response', 'go-cutover incompatible helper')
      const metadata = adapter.metadata()
      assert.equal(metadata.kernel.calls, 2)
      assert.equal(metadata.kernel.fallbacks, 0)
      assert.equal(metadata.kernel.cutoverStatus, 'unavailable')
      assert.equal(metadata.kernel.cutoverFailureKind, 'helper-incompatible-response')
      assertNoMigrationFallback(metadata, 'go-cutover incompatible helper')
      assertNoSecretLeaks(metadata, 'go-cutover incompatible helper')
    })

    const unsupported = kernel.createAgentTeamKernelAdapter({ mode: 'rust:///tmp/repo-secret', env: {} })
    unsupported.compactReadModelFingerprint(compactInput())
    const unsupportedMetadata = unsupported.metadata()
    assert.equal(unsupportedMetadata.kernel.requestedKnownKernel, false)
    assert.equal(unsupportedMetadata.kernel.fallbackKind, 'unsupported-mode')
    assert.match(unsupportedMetadata.kernel.fallbackReason, /Go kernel fallback \(unsupported-mode\)/)
    assert.equal(JSON.stringify(unsupportedMetadata).includes('/tmp/repo-secret'), false, 'unsupported mode diagnostic must remain compact')
    assertNoCutoverDiagnostic(unsupportedMetadata, 'unsupported mode')

    const packageJson = JSON.parse(fs.readFileSync(path.join(env.helpers.extRoot, 'package.json'), 'utf8'))
    assert.equal(packageJson.version, '0.6.8', 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
      assert.equal(fs.existsSync(path.join(env.helpers.extRoot, rel)), false, `${rel} must not exist for go-cutover mode plumbing`)
    }
  },
}
