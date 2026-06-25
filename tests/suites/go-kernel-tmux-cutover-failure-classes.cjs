const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const REQUIRED_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint']
const HELPER_VERSION = '0.3.0-read-model-shadow'
const SENTINELS = {
  stdout: 'CUTOVER_FAILURE_STDOUT_BODY_SHOULD_NOT_LEAK',
  stderr: 'CUTOVER_FAILURE_STDERR_BODY_SHOULD_NOT_LEAK',
  fullPath: 'cutover-failure-secret-helper-path',
  repoPath: '/tmp/cutover-failure-repo-path-SHOULD_NOT_LEAK',
  cwdPath: '/tmp/cutover-failure-cwd-path-SHOULD_NOT_LEAK',
  mailbox: 'CUTOVER_FAILURE_MAILBOX_TEXT_SHOULD_NOT_LEAK',
  report: 'CUTOVER_FAILURE_REPORT_TEXT_SHOULD_NOT_LEAK',
  sidecar: 'CUTOVER_FAILURE_SIDECAR_SHOULD_NOT_LEAK',
  cache: 'CUTOVER_FAILURE_CACHE_SHOULD_NOT_LEAK',
  index: 'CUTOVER_FAILURE_INDEX_SHOULD_NOT_LEAK',
  rawState: 'CUTOVER_FAILURE_RAW_STATE_SHOULD_NOT_LEAK',
  hiddenRuntime: 'CUTOVER_FAILURE_HIDDEN_RUNTIME_STATE_SHOULD_NOT_LEAK',
}

function writeHelper(name, source, executable = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-kernel-cutover-failures-${name}-`))
  const file = path.join(dir, SENTINELS.fullPath, `${name}.cjs`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, executable ? 0o755 : 0o644)
  return { dir, file }
}

function runWithHelper(name, source, action, options = {}) {
  const helper = writeHelper(name, source, options.executable !== false)
  try {
    return action(helper.file, helper.dir)
  } finally {
    fs.rmSync(helper.dir, { recursive: true, force: true })
  }
}

function helperSource(handlerSource) {
  return `#!/usr/bin/env node
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input) : {}
const leak = ${JSON.stringify(SENTINELS)}
const baseHealth = {
  ok: true,
  implementation: 'go',
  protocolVersion: 1,
  adapterVersion: '${HELPER_VERSION}',
  helperVersion: '${HELPER_VERSION}',
  capabilities: ${JSON.stringify(REQUIRED_CAPABILITIES)},
  businessPathsConnected: false,
}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
function raw(value) { process.stdout.write(value) }
function stderr(value) { process.stderr.write(value) }
function error(code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code, message } }) + '\\n') }
function validSnapshot() {
  return {
    capturedAt: request.params.capturedAt,
    panes: [{ paneId: '%go', target: 'go:@1', label: 'go', currentCommand: 'pi' }],
    byPaneId: { '%go': { paneId: '%go', target: 'go:@1', label: 'go', currentCommand: 'pi' } },
    ok: true,
  }
}
${handlerSource}
`
}

function validSnapshot(request, extra = {}) {
  return {
    capturedAt: request.params.capturedAt,
    panes: [{ paneId: '%go', target: 'go:@1', label: 'go', currentCommand: 'pi' }],
    byPaneId: { '%go': { paneId: '%go', target: 'go:@1', label: 'go', currentCommand: 'pi' } },
    ok: true,
    ...extra,
  }
}

function throwingTmuxFallback() {
  throw new Error('TypeScript fallback must not be called in go-cutover failure coverage')
}

function tmuxFallback(stdout, capturedAt) {
  const panes = stdout ? [{ paneId: '%ts', target: 'ts:@1', label: 'TypeScript fallback', currentCommand: 'pi' }] : []
  return { capturedAt, panes, byPaneId: Object.fromEntries(panes.map(item => [item.paneId, item])), ok: true }
}

function assertNoSentinelLeaks(value, label) {
  const serialized = JSON.stringify(value)
  for (const [name, sentinel] of Object.entries(SENTINELS)) {
    assert.equal(serialized.includes(sentinel), false, `${label} must not leak ${name}`)
  }
  assert.equal(serialized.includes('/tmp/cutover-failure-repo-path'), false, `${label} must not leak repo path prefix`)
  assert.equal(serialized.includes('/tmp/cutover-failure-cwd-path'), false, `${label} must not leak cwd path prefix`)
}

function assertNoMigrationFallback(metadata, label) {
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false, `${label} must not expose migration fallbackKind`)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackReason'), false, `${label} must not expose migration fallbackReason`)
}

function assertCutoverFailure(adapter, snapshot, expectedKind, label, expectedCalls) {
  assert.equal(snapshot.ok, false, `${label} must return ok:false`)
  assert.equal(snapshot.status, 'unknown', `${label} must return unknown status`)
  assert.equal(snapshot.resultMarker, 'stale', `${label} must return stale marker`)
  assert.equal(snapshot.module, 'tmuxSnapshotParse', `${label} must name module`)
  assert.equal(snapshot.capability, 'tmuxSnapshotParse', `${label} must name capability`)
  assert.equal(snapshot.cutoverFailureKind, expectedKind, `${label} must set stable cutoverFailureKind`)
  assert.deepEqual(snapshot.panes, [], `${label} must not return parsed panes`)
  assert.deepEqual(snapshot.byPaneId, {}, `${label} must not return parsed pane index`)
  assert.notEqual(snapshot.ok, true, `${label} must not be false ok:true empty snapshot`)
  assert.match(snapshot.reason, new RegExp(`Go kernel cutover unavailable \\(${expectedKind}\\)`), `${label} must include compact reason`)
  assert.match(snapshot.error, new RegExp(`Go kernel cutover unavailable \\(${expectedKind}\\)`), `${label} must include compact error`)
  assert.ok(String(snapshot.reason).length <= 220, `${label} reason should stay compact`)
  assert.ok(String(snapshot.error).length <= 220, `${label} error should stay compact`)
  assertNoSentinelLeaks(snapshot, `${label} snapshot`)

  const metadata = adapter.metadata()
  assert.equal(metadata.kernel.requestedMode, 'go-cutover', `${label} metadata should preserve requested mode`)
  assert.equal(metadata.kernel.mode, 'typescript', `${label} metadata should disable helper after failure`)
  assert.equal(metadata.kernel.enabled, false, `${label} metadata should not report active Go after failure`)
  assert.equal(metadata.kernel.calls, expectedCalls, `${label} helper call count`)
  assert.equal(metadata.kernel.fallbacks, 0, `${label} must not increment migration fallback count`)
  assert.equal(metadata.kernel.cutoverModule, 'tmuxSnapshotParse', `${label} metadata should name cutover module`)
  assert.equal(metadata.kernel.cutoverStatus, 'unavailable', `${label} metadata should mark unavailable`)
  assert.equal(metadata.kernel.cutoverFailureKind, expectedKind, `${label} metadata should set cutover failure kind`)
  assert.match(metadata.kernel.cutoverReason, new RegExp(`Go kernel cutover unavailable \\(${expectedKind}\\)`), `${label} metadata should include compact cutover reason`)
  assert.ok(String(metadata.kernel.cutoverReason).length <= 220, `${label} metadata reason should stay compact`)
  assertNoMigrationFallback(metadata, `${label} metadata`)
  assertNoSentinelLeaks(metadata, `${label} metadata`)
}

function invokeFailureCase(kernel, row) {
  if (row.missing) {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath: path.join(os.tmpdir(), SENTINELS.fullPath, 'missing-helper') })
    const snapshot = adapter.parseTmuxPaneSnapshot(row.stdout, row.capturedAt, throwingTmuxFallback)
    assertCutoverFailure(adapter, snapshot, row.kind, row.name, 0)
    return
  }
  runWithHelper(row.name, row.source, helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath, timeoutMs: row.timeoutMs ?? 500 })
    const snapshot = adapter.parseTmuxPaneSnapshot(row.stdout, row.capturedAt, throwingTmuxFallback)
    assertCutoverFailure(adapter, snapshot, row.kind, row.name, row.expectedCalls)
    if (row.secondCallKind) {
      const secondSnapshot = adapter.parseTmuxPaneSnapshot(row.stdout, row.capturedAt + 1000, throwingTmuxFallback)
      assertCutoverFailure(adapter, secondSnapshot, row.secondCallKind, `${row.name} second call`, row.expectedCalls)
    }
  }, { executable: row.executable })
}

module.exports = {
  name: 'Go kernel tmux go-cutover failure classes and no-leak coverage',
  async run(env) {
    const kernel = env.helpers.requireDist('core/kernel.js')
    const source = env.helpers.readSource('core/kernel.ts')
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
      'tmux-command-timeout',
      'tmux-command-failed',
      'tmux-unavailable',
    ])
    assert.match(source, /function toMigrationFallbackKind/, 'cutover-only helper classes should map back to migration fallback vocabulary outside go-cutover')

    const failureRows = [
      {
        name: 'missing-helper',
        kind: 'missing-helper',
        missing: true,
        stdout: `%p\t${SENTINELS.repoPath}\t${SENTINELS.mailbox}\tpi`,
        capturedAt: 1700003000001,
      },
      {
        name: 'helper-unsupported-protocol',
        kind: 'helper-unsupported-protocol',
        expectedCalls: 1,
        capturedAt: 1700003000002,
        stdout: '%p\tgo:@1\tlabel\tpi',
        source: helperSource(`
if (request.method === 'health') raw(JSON.stringify({ jsonrpc: '1.0', id: request.id, result: baseHealth }) + '\\n')
else respond(validSnapshot(request))
`),
      },
      {
        name: 'helper-unsupported-version',
        kind: 'helper-unsupported-version',
        expectedCalls: 1,
        capturedAt: 1700003000003,
        stdout: '%p\tgo:@1\tlabel\tpi',
        source: helperSource(`
if (request.method === 'health') respond({ ...baseHealth, protocolVersion: 2, helperVersion: '${SENTINELS.stdout}' })
else respond(validSnapshot(request))
`),
      },
      {
        name: 'helper-unsupported-capability',
        kind: 'helper-unsupported-capability',
        expectedCalls: 1,
        capturedAt: 1700003000004,
        stdout: '%p\tgo:@1\tlabel\tpi',
        source: helperSource(`
if (request.method === 'health') respond({ ...baseHealth, capabilities: ['health', 'profile', 'compactReadModelFingerprint', '${SENTINELS.stdout}'] })
else respond(validSnapshot(request))
`),
      },
      {
        name: 'helper-timeout',
        kind: 'helper-timeout',
        expectedCalls: 1,
        timeoutMs: 100,
        capturedAt: 1700003000005,
        stdout: '%p\tgo:@1\tlabel\tpi',
        source: helperSource(`
while (true) {}
`),
      },
      {
        name: 'helper-spawn-error',
        kind: 'helper-spawn-error',
        expectedCalls: 1,
        executable: false,
        capturedAt: 1700003000006,
        stdout: '%p\tgo:@1\tlabel\tpi',
        source: helperSource(`
if (request.method === 'health') respond(baseHealth)
else respond(validSnapshot(request))
`),
      },
      {
        name: 'helper-crash',
        kind: 'helper-crash',
        expectedCalls: 1,
        capturedAt: 1700003000007,
        stdout: '%p\tgo:@1\tlabel\tpi',
        source: helperSource(`
process.kill(process.pid, 'SIGTERM')
`),
      },
      {
        name: 'helper-nonzero-exit',
        kind: 'helper-nonzero-exit',
        expectedCalls: 1,
        capturedAt: 1700003000008,
        stdout: '%p\tgo:@1\tlabel\tpi',
        source: helperSource(`
stderr(leak.stderr + ' ' + leak.repoPath + ' ' + leak.mailbox + ' ' + leak.report + '\\n')
process.exit(17)
`),
      },
      {
        name: 'helper-empty-response',
        kind: 'helper-empty-response',
        expectedCalls: 1,
        capturedAt: 1700003000009,
        stdout: '%p\tgo:@1\tlabel\tpi',
        source: helperSource(`
stderr(leak.stderr + ' ' + leak.rawState + '\\n')
process.exit(0)
`),
      },
      {
        name: 'helper-malformed-json',
        kind: 'helper-malformed-json',
        expectedCalls: 1,
        capturedAt: 1700003000010,
        stdout: '%p\tgo:@1\tlabel\tpi',
        source: helperSource(`
raw('{ malformed ' + leak.stdout + ' ' + leak.repoPath + '\\n')
stderr(leak.stderr + ' ' + leak.hiddenRuntime + '\\n')
`),
      },
      {
        name: 'helper-jsonrpc-error',
        kind: 'helper-jsonrpc-error',
        expectedCalls: 1,
        capturedAt: 1700003000011,
        stdout: '%p\tgo:@1\tlabel\tpi',
        source: helperSource(`
error(-32042, leak.stdout + ' ' + leak.mailbox + ' ' + leak.report)
stderr(leak.stderr + ' ' + leak.cwdPath + '\\n')
`),
      },
      {
        name: 'helper-incompatible-response',
        kind: 'helper-incompatible-response',
        expectedCalls: 2,
        capturedAt: 1700003000012,
        stdout: '%p\tgo:@1\tlabel\tpi',
        source: helperSource(`
if (request.method === 'health') respond(baseHealth)
else respond({ capturedAt: request.params.capturedAt, panes: [{ paneId: '', target: 'bad', label: leak.stdout, currentCommand: 'pi' }], byPaneId: {}, ok: true })
`),
      },
      {
        name: 'helper-unsafe-response-shape',
        kind: 'helper-unsafe-response-shape',
        expectedCalls: 2,
        capturedAt: 1700003000013,
        stdout: '%p\tgo:@1\tlabel\tpi',
        source: helperSource(`
if (request.method === 'health') respond(baseHealth)
else respond({
  ...validSnapshot(request),
  text: leak.stdout,
  mailbox: [{ text: leak.mailbox }],
  reports: [{ body: leak.report }],
  sidecar: { raw: leak.sidecar },
  cache: { raw: leak.cache },
  index: { raw: leak.index },
  rawState: leak.rawState,
  hiddenRuntimeState: leak.hiddenRuntime,
})
`),
      },
      {
        name: 'previous-helper-failure',
        kind: 'helper-malformed-json',
        secondCallKind: 'previous-helper-failure',
        expectedCalls: 2,
        capturedAt: 1700003000014,
        stdout: '%p\tgo:@1\tlabel\tpi',
        source: helperSource(`
if (request.method === 'health') respond(baseHealth)
else raw('{ malformed ' + leak.stdout + '\\n')
`),
      },
    ]

    for (const row of failureRows) invokeFailureCase(kernel, row)

    const disabledAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'disabled', helperPath: path.join(os.tmpdir(), SENTINELS.fullPath, 'disabled-helper') })
    const disabledSnapshot = disabledAdapter.parseTmuxPaneSnapshot('%p\tgo:@1\tlabel\tpi', 1700003000015, tmuxFallback)
    assert.equal(disabledSnapshot.ok, true, 'disabled mode is not go-cutover and should keep TypeScript parser behavior')
    assert.equal(disabledSnapshot.panes[0].paneId, '%ts')
    assert.equal(disabledAdapter.metadata().kernel.calls, 0)
    assert.equal(disabledAdapter.metadata().kernel.fallbacks, 0)
    assert.equal(Object.prototype.hasOwnProperty.call(disabledAdapter.metadata().kernel, 'cutoverFailureKind'), false)

    const unsupportedMode = kernel.createAgentTeamKernelAdapter({ mode: 'rust', helperPath: path.join(os.tmpdir(), SENTINELS.fullPath, 'unsupported-helper') })
    unsupportedMode.parseTmuxPaneSnapshot('%p\tgo:@1\tlabel\tpi', 1700003000016, tmuxFallback)
    assert.equal(unsupportedMode.metadata().kernel.fallbackKind, 'unsupported-mode', 'unsupported mode remains migration unsupported-mode outside go-cutover')
    assert.equal(kernel.AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS.includes('disabled-helper'), true, 'disabled-helper remains reserved for future disabled cutover setup')
    assert.equal(source.includes("if (kind === 'unsupported-mode') return 'disabled-helper'"), true, 'disabled-helper mapping is reserved for unsupported cutover setup, not directly triggerable by disabled mode')

    runWithHelper('success-and-migration-preservation', helperSource(`
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'tmuxSnapshotParse') respond(validSnapshot(request))
else respond({ ok: true })
`), helperPath => {
      const cutover = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath })
      const snapshot = cutover.parseTmuxPaneSnapshot('%p\tgo:@1\tlabel\tpi', 1700003000017, throwingTmuxFallback)
      assert.equal(snapshot.ok, true)
      assert.equal(snapshot.panes[0].paneId, '%go')
      assert.equal(cutover.metadata().kernel.fallbacks, 0)
      assert.equal(cutover.metadata().kernel.cutoverStatus, 'active')
      assertNoMigrationFallback(cutover.metadata(), 'successful go-cutover')

      const go = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(os.tmpdir(), SENTINELS.fullPath, 'missing-go-helper') })
      let fallbackCalls = 0
      const goSnapshot = go.parseTmuxPaneSnapshot('%p\tgo:@1\tlabel\tpi', 1700003000018, (stdout, capturedAt) => {
        fallbackCalls += 1
        return tmuxFallback(stdout, capturedAt)
      })
      assert.equal(fallbackCalls, 0, 'go mode must not call deleted TypeScript parser fallback')
      assert.equal(goSnapshot.ok, false)
      assert.equal(goSnapshot.status, 'unknown')
      assert.equal(goSnapshot.resultMarker, 'stale')
      assert.equal(goSnapshot.module, 'tmuxSnapshotParse')
      assert.equal(goSnapshot.capability, 'tmuxSnapshotParse')
      assert.equal(goSnapshot.cutoverFailureKind, 'missing-helper')
      assert.equal(go.metadata().kernel.cutoverStatus, 'unavailable')
      assert.equal(go.metadata().kernel.cutoverFailureKind, 'missing-helper')
      assert.equal(go.metadata().kernel.fallbacks, 0)
      assert.equal(Object.prototype.hasOwnProperty.call(go.metadata().kernel, 'fallbackKind'), false)
    })

    const packageJson = JSON.parse(fs.readFileSync(path.join(env.helpers.extRoot, 'package.json'), 'utf8'))
    assert.equal(packageJson.version, '0.6.8', 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
      assert.equal(fs.existsSync(path.join(env.helpers.extRoot, rel)), false, `${rel} must not exist for cutover failure coverage`)
    }
  },
}
