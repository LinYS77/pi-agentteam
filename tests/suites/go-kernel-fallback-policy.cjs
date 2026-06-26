const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BAD_STDOUT_SENTINEL = 'FALLBACK_POLICY_BAD_STDOUT_SHOULD_NOT_LEAK'
const BAD_STDERR_SENTINEL = 'FALLBACK_POLICY_BAD_STDERR_SHOULD_NOT_LEAK'
const FULL_PATH_SENTINEL = 'fallback-policy-secret-helper-path'
const FULL_TEXT_SENTINEL = 'FALLBACK_POLICY_FULL_TEXT_SHOULD_NOT_LEAK'
const REQUIRED_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle']
const HELPER_VERSION = '0.3.0-read-model-shadow'

function writeHelper(name, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-kernel-policy-${name}-`))
  const file = path.join(dir, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return { dir, file }
}

function runWithHelper(name, source, action) {
  const helper = writeHelper(name, source)
  try {
    return action(helper.file, helper.dir)
  } finally {
    fs.rmSync(helper.dir, { recursive: true, force: true })
  }
}

function helperSource(handlerSource) {
  return `#!/usr/bin/env node
const fs = require('node:fs')
const request = JSON.parse(fs.readFileSync(0, 'utf8').trim() || '{}')
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
function error(code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code, message } }) + '\\n') }
${handlerSource}
`
}

function compactInput() {
  return {
    mode: 'attached',
    team: {
      name: 'fallback-policy-team',
      leaderCwd: '/tmp/fallback-policy-team',
      tasks: {},
    },
    members: [],
    tasks: [],
    mailbox: [
      {
        id: 'M001',
        from: 'worker-a',
        to: 'team-lead',
        type: 'inform',
        summary: 'compact summary survives',
        text: FULL_TEXT_SENTINEL,
      },
    ],
    outboxDiagnostics: { pending: 0, failed: 0, text: FULL_TEXT_SENTINEL },
  }
}

function tmuxFallback(stdout, capturedAt) {
  const panes = stdout
    ? [{ paneId: '%ts', target: 'fallback:@1', label: 'TypeScript fallback', currentCommand: 'pi' }]
    : []
  return {
    capturedAt,
    panes,
    byPaneId: Object.fromEntries(panes.map(item => [item.paneId, item])),
    ok: true,
  }
}

function assertNoFallbackDiagnostic(metadata) {
  assert.equal(metadata.kernel.fallbacks, 0)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackReason'), false)
}

function assertCompactDiagnostics(metadata, kind, calls, fallbacks = 1) {
  assert.equal(metadata.kernel.mode, 'typescript')
  assert.equal(metadata.kernel.enabled, false)
  assert.equal(metadata.kernel.calls, calls)
  assert.equal(metadata.kernel.fallbacks, fallbacks)
  assert.equal(metadata.kernel.fallbackKind, kind)
  assert.match(metadata.kernel.fallbackReason, new RegExp(`Go kernel fallback \\(${kind}\\)`))
  const serialized = JSON.stringify(metadata)
  assert.equal(serialized.includes(BAD_STDOUT_SENTINEL), false, `${kind} must not leak stdout`)
  assert.equal(serialized.includes(BAD_STDERR_SENTINEL), false, `${kind} must not leak stderr`)
  assert.equal(serialized.includes(FULL_PATH_SENTINEL), false, `${kind} must not leak full helper path`)
  assert.equal(serialized.includes(FULL_TEXT_SENTINEL), false, `${kind} must not leak full text`)
  assert.ok(String(metadata.kernel.fallbackReason).length <= 220, `${kind} fallbackReason should stay compact`)
}

function assertReadOnlyFallback(result, expected) {
  assert.deepEqual(result, expected)
  assert.equal(result.ok, true)
  assert.equal(result.inputKind, 'compact-panel-data')
  assert.equal(result.readOnly, true)
  assert.equal(result.fullTextIncluded, false)
  assert.equal(result.stateFilesRead, false)
  assert.equal(result.stateFilesWritten, false)
  assert.equal(JSON.stringify(result).includes(FULL_TEXT_SENTINEL), false)
}

function assertTmuxFallback(result, capturedAt) {
  assert.equal(result.capturedAt, capturedAt)
  assert.equal(result.ok, true)
  assert.deepEqual(result.panes, [{ paneId: '%ts', target: 'fallback:@1', label: 'TypeScript fallback', currentCommand: 'pi' }])
  assert.deepEqual(result.byPaneId, { '%ts': { paneId: '%ts', target: 'fallback:@1', label: 'TypeScript fallback', currentCommand: 'pi' } })
}

function assertCutoverUnavailable(result, capturedAt, kind) {
  assert.equal(result.capturedAt, capturedAt)
  assert.equal(result.ok, false)
  assert.equal(result.status, 'unknown')
  assert.equal(result.resultMarker, 'stale')
  assert.equal(result.module, 'tmuxSnapshotParse')
  assert.equal(result.capability, 'tmuxSnapshotParse')
  assert.equal(result.cutoverFailureKind, kind)
  assert.deepEqual(result.panes, [])
  assert.deepEqual(result.byPaneId, {})
}

module.exports = {
  name: 'Go kernel fallback policy',
  async run(env) {
    const kernel = env.helpers.requireDist('core/kernel.js')
    const baseline = kernel.createAgentTeamKernelAdapter({ mode: 'typescript', env: {} }).compactReadModelFingerprint(compactInput())

    runWithHelper('must-not-run', helperSource(`
fs.writeFileSync(process.env.SHOULD_NOT_RUN_FILE, 'called')
respond(baseHealth)
`), (helperPath, helperDir) => {
      const marker = path.join(helperDir, 'called')
      for (const mode of ['disabled', 'typescript']) {
        const adapter = kernel.createAgentTeamKernelAdapter({ mode, helperPath, env: { SHOULD_NOT_RUN_FILE: marker, PATH: process.env.PATH } })
        assertReadOnlyFallback(adapter.compactReadModelFingerprint(compactInput()), baseline)
        assertTmuxFallback(adapter.parseTmuxPaneSnapshot('%x\tx:@1\tlabel\tpi', 456, tmuxFallback), 456)
        assert.equal(adapter.health().implementation, 'typescript')
        assert.equal(adapter.profile({ check: mode }).implementation, 'typescript')
        assert.equal(adapter.metadata().kernel.requestedMode, mode)
        assert.equal(adapter.metadata().kernel.calls, 0)
        assert.equal(adapter.metadata().kernel.enabled, false)
        assertNoFallbackDiagnostic(adapter.metadata())
      }
      assert.equal(fs.existsSync(marker), false, 'disabled/typescript modes must not spawn helper')
    })

    const autoMissing = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath: path.join(os.tmpdir(), FULL_PATH_SENTINEL, 'missing-auto-helper') })
    assertReadOnlyFallback(autoMissing.compactReadModelFingerprint(compactInput()), baseline)
    assertTmuxFallback(autoMissing.parseTmuxPaneSnapshot('%x\tx:@1\tlabel\tpi', 457, tmuxFallback), 457)
    assert.equal(autoMissing.metadata().kernel.requestedMode, 'auto')
    assert.equal(autoMissing.metadata().kernel.calls, 0)
    assertNoFallbackDiagnostic(autoMissing.metadata())

    const goMissing = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(os.tmpdir(), FULL_PATH_SENTINEL, 'missing-go-helper') })
    assertReadOnlyFallback(goMissing.compactReadModelFingerprint(compactInput()), baseline)
    assertCutoverUnavailable(goMissing.parseTmuxPaneSnapshot('%x\tx:@1\tlabel\tpi', 458, () => {
      throw new Error('go missing helper must not call TypeScript parser fallback')
    }), 458, 'missing-helper')
    assert.equal(goMissing.metadata().kernel.fallbacks, 0)
    assert.equal(Object.prototype.hasOwnProperty.call(goMissing.metadata().kernel, 'fallbackKind'), false)
    assert.equal(goMissing.metadata().kernel.cutoverStatus, 'unavailable')
    assert.equal(goMissing.metadata().kernel.cutoverFailureKind, 'missing-helper')
    assert.equal(JSON.stringify(goMissing.metadata()).includes(FULL_PATH_SENTINEL), false, 'go missing diagnostic must not leak full helper path')

    runWithHelper('auto-incompatible', helperSource(`
if (request.method === 'health') respond({ ...baseHealth, capabilities: ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'futureWriteAuthority'] })
else respond({ ok: true })
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath })
      assertReadOnlyFallback(adapter.compactReadModelFingerprint(compactInput()), baseline)
      assertCompactDiagnostics(adapter.metadata(), 'helper-unsupported-capability', 1)
      assertReadOnlyFallback(adapter.compactReadModelFingerprint(compactInput()), baseline)
      assertTmuxFallback(adapter.parseTmuxPaneSnapshot('%x\tx:@1\tlabel\tpi', 459, tmuxFallback), 459)
      assertCompactDiagnostics(adapter.metadata(), 'helper-unsupported-capability', 1)
    })

    runWithHelper('go-incompatible', helperSource(`
if (request.method === 'health') respond({ ...baseHealth, protocolVersion: 2 })
else respond({ ok: true })
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath })
      assertTmuxFallback(adapter.parseTmuxPaneSnapshot('%x\tx:@1\tlabel\tpi', 460, tmuxFallback), 460)
      assertCompactDiagnostics(adapter.metadata(), 'helper-unsupported-version', 1)
      assertReadOnlyFallback(adapter.compactReadModelFingerprint(compactInput()), baseline)
      assertCompactDiagnostics(adapter.metadata(), 'helper-unsupported-version', 1)
    })

    runWithHelper('read-model-failure', helperSource(`
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'compactReadModelFingerprint') {
  process.stdout.write('${BAD_STDOUT_SENTINEL} '.repeat(100))
  process.stderr.write('${BAD_STDERR_SENTINEL} '.repeat(100))
  process.exit(17)
} else if (request.method === 'tmuxSnapshotParse') respond({ capturedAt: request.params.capturedAt, panes: [{ paneId: '%go', target: 'go:@1', label: 'go', currentCommand: 'pi' }], byPaneId: { '%go': { paneId: '%go', target: 'go:@1', label: 'go', currentCommand: 'pi' } }, ok: true })
else error(-32601, 'unexpected')
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath })
      assertReadOnlyFallback(adapter.compactReadModelFingerprint(compactInput()), baseline)
      assertCompactDiagnostics(adapter.metadata(), 'helper-nonzero-exit', 2)
      assertReadOnlyFallback(adapter.compactReadModelFingerprint(compactInput()), baseline)
      assertTmuxFallback(adapter.parseTmuxPaneSnapshot('%x\tx:@1\tlabel\tpi', 461, tmuxFallback), 461)
      assertCompactDiagnostics(adapter.metadata(), 'helper-nonzero-exit', 2)
    })

    runWithHelper('tmux-failure', helperSource(`
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'tmuxSnapshotParse') respond({ capturedAt: request.params.capturedAt, panes: [{ paneId: '', target: 'bad', label: '${BAD_STDOUT_SENTINEL}', currentCommand: 'pi' }], byPaneId: {}, ok: true })
else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params.input, fingerprint: JSON.stringify(request.params.input), inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })
else error(-32601, 'unexpected')
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath })
      assertTmuxFallback(adapter.parseTmuxPaneSnapshot('%x\tx:@1\tlabel\tpi', 462, tmuxFallback), 462)
      assertCompactDiagnostics(adapter.metadata(), 'helper-incompatible-response', 2)
      assertReadOnlyFallback(adapter.compactReadModelFingerprint(compactInput()), baseline)
      assertCompactDiagnostics(adapter.metadata(), 'helper-incompatible-response', 2)
    })

    runWithHelper('spawn-stability', helperSource(`
if (request.method === 'health') respond(baseHealth)
else {
  process.stdout.write('{ malformed ${BAD_STDOUT_SENTINEL}\\n')
  process.stderr.write('${BAD_STDERR_SENTINEL}\\n')
}
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath })
      assertReadOnlyFallback(adapter.compactReadModelFingerprint(compactInput()), baseline)
      assertCompactDiagnostics(adapter.metadata(), 'helper-malformed-json', 2)
      assertReadOnlyFallback(adapter.compactReadModelFingerprint(compactInput()), baseline)
      assertTmuxFallback(adapter.parseTmuxPaneSnapshot('%x\tx:@1\tlabel\tpi', 463, tmuxFallback), 463)
      assertCompactDiagnostics(adapter.metadata(), 'helper-malformed-json', 2)
    })

    const doc = fs.readFileSync(path.join(env.helpers.extRoot, 'docs/perf/v0.4.17-kernel-contract-hardening.md'), 'utf8')
    for (const expected of [
      'Slice 5 Fallback Policy',
      'Read-only shadow/fingerprint operations fail open to TypeScript',
      'Tmux parser helper failures fail open to the TypeScript parser',
      'Future write-side candidates fail closed by default',
      'no TS retry unless the operation is proven idempotent/retry-safe under the TypeScript lock',
    ]) {
      assert.ok(doc.includes(expected), `Slice 5 docs should state: ${expected}`)
    }

    const kernelSource = env.helpers.readSource('core/kernel.ts')
    for (const forbidden of ['writeJsonFile', 'state/repository', 'taskApplication', 'taskReportWorkflow', 'planRunApplication', 'runTmuxNoThrow', 'list-panes']) {
      assert.equal(kernelSource.includes(forbidden), false, `kernel adapter must not own ${forbidden}`)
    }
    for (const forbiddenCapability of ['taskWrite', 'reportWrite', 'planRunWrite', 'repositoryWrite', 'sidecarWrite', 'cacheWrite', 'indexWrite']) {
      assert.equal(kernel.AGENTTEAM_KERNEL_CAPABILITIES.includes(forbiddenCapability), false, `kernel capabilities must not include ${forbiddenCapability}`)
    }
  },
}
