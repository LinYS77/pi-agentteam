const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BAD_STDOUT_SENTINEL = 'GO_KERNEL_BAD_STDOUT_SENTINEL_SHOULD_NOT_LEAK'
const BAD_STDERR_SENTINEL = 'GO_KERNEL_BAD_STDERR_SENTINEL_SHOULD_NOT_LEAK'
const FULL_PATH_SENTINEL = 'agentteam-secret-path-segment'

function writeHelper(name, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-kernel-hardening-${name}-`))
  const file = path.join(dir, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return { dir, file }
}

function nodeHelperSource(handlerSource) {
  return `#!/usr/bin/env node
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input) : {}
const baseHealth = {
  ok: true,
  implementation: 'go',
  protocolVersion: 1,
  helperVersion: '0.3.0-read-model-shadow',
  capabilities: ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint'],
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
    team: { name: 'kernel-hardening', leaderCwd: '/tmp/kernel-hardening', tasks: {} },
    members: [],
    tasks: [],
    mailbox: [{ id: 'M001', from: 'worker', type: 'inform', summary: 'compact only', text: 'FULL_TEXT_SHOULD_BE_REMOVED' }],
  }
}

function tmuxFallback(stdout, capturedAt) {
  const panes = stdout ? [{ paneId: '%ts', target: 'ts:@1', label: 'ts fallback', currentCommand: 'pi' }] : []
  return { capturedAt, panes, byPaneId: Object.fromEntries(panes.map(item => [item.paneId, item])), ok: true }
}

function assertCompactDiagnostic(metadata, kind, expectedCalls) {
  assert.equal(metadata.kernel.mode, 'typescript')
  assert.equal(metadata.kernel.enabled, false)
  assert.equal(metadata.kernel.calls, expectedCalls)
  assert.equal(metadata.kernel.fallbacks, 1)
  assert.equal(metadata.kernel.fallbackKind, kind)
  assert.match(metadata.kernel.fallbackReason, new RegExp(`Go kernel fallback \\(${kind}\\)`))
  assert.equal(JSON.stringify(metadata).includes(BAD_STDOUT_SENTINEL), false, `${kind} diagnostic must not leak stdout`)
  assert.equal(JSON.stringify(metadata).includes(BAD_STDERR_SENTINEL), false, `${kind} diagnostic must not leak stderr`)
  assert.equal(JSON.stringify(metadata).includes(FULL_PATH_SENTINEL), false, `${kind} diagnostic must not leak full helper path`)
  assert.ok(String(metadata.kernel.fallbackReason).length <= 220, `${kind} fallback reason should stay compact`)
}

function assertReadModelFallback(adapter, expectedResult, expectedKind, expectedCalls) {
  const result = adapter.compactReadModelFingerprint(compactInput())
  assert.deepEqual(result, expectedResult)
  assert.equal(result.readOnly, true)
  assert.equal(result.fullTextIncluded, false)
  assert.equal(result.stateFilesRead, false)
  assert.equal(result.stateFilesWritten, false)
  assertCompactDiagnostic(adapter.metadata(), expectedKind, expectedCalls)
}

function runCase(kernel, name, source, action, cleanup = true) {
  const helper = writeHelper(name, source)
  try {
    return action(helper.file)
  } finally {
    if (cleanup) fs.rmSync(helper.dir, { recursive: true, force: true })
  }
}

module.exports = {
  name: 'Go kernel failure hardening',
  async run(env) {
    const kernel = env.helpers.requireDist('core/kernel.js')
    const tsAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'typescript', env: {} })
    const tsResult = tsAdapter.compactReadModelFingerprint(compactInput())

    assert.equal(tsResult.readOnly, true)
    assert.equal(tsResult.fullTextIncluded, false)
    assert.equal(tsResult.stateFilesRead, false)
    assert.equal(tsResult.stateFilesWritten, false)
    assert.equal(JSON.stringify(tsResult).includes('FULL_TEXT_SHOULD_BE_REMOVED'), false)

    const disabled = kernel.createAgentTeamKernelAdapter({ mode: 'disabled', env: {} })
    assert.deepEqual(disabled.compactReadModelFingerprint(compactInput()), tsResult)
    assert.equal(disabled.metadata().kernel.calls, 0)
    assert.equal(disabled.metadata().kernel.fallbacks, 0)
    assert.equal(Object.prototype.hasOwnProperty.call(disabled.metadata().kernel, 'fallbackKind'), false)

    const typescript = kernel.createAgentTeamKernelAdapter({ mode: 'typescript', env: {} })
    assert.deepEqual(typescript.compactReadModelFingerprint(compactInput()), tsResult)
    assert.equal(typescript.metadata().kernel.calls, 0)
    assert.equal(typescript.metadata().kernel.fallbacks, 0)

    const missingSecretPath = path.join(os.tmpdir(), FULL_PATH_SENTINEL, 'missing-helper')
    const missing = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: missingSecretPath })
    assert.deepEqual(missing.compactReadModelFingerprint(compactInput()), tsResult)
    assertCompactDiagnostic(missing.metadata(), 'missing-helper', 0)
    assert.match(missing.metadata().kernel.fallbackReason, /missing-helper/)

    const autoMissing = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath: path.join(os.tmpdir(), 'missing-agentteam-auto-helper') })
    assert.deepEqual(autoMissing.compactReadModelFingerprint(compactInput()), tsResult)
    assert.equal(autoMissing.metadata().kernel.calls, 0)
    assert.equal(autoMissing.metadata().kernel.fallbacks, 0)

    const unsupported = kernel.createAgentTeamKernelAdapter({ mode: 'rust', env: {} })
    assert.deepEqual(unsupported.compactReadModelFingerprint(compactInput()), tsResult)
    assertCompactDiagnostic(unsupported.metadata(), 'unsupported-mode', 0)

    const spawnErrorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-kernel-spawn-error-'))
    try {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: spawnErrorDir })
      assertReadModelFallback(adapter, tsResult, 'helper-spawn-error', 1)
    } finally {
      fs.rmSync(spawnErrorDir, { recursive: true, force: true })
    }

    runCase(kernel, 'empty-response', `#!/usr/bin/env node
process.exit(0)
`, helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      assertReadModelFallback(adapter, tsResult, 'helper-empty-response', 1)
    })

    runCase(kernel, 'timeout', `#!/usr/bin/env node
setTimeout(() => {}, 10000)
`, helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, timeoutMs: 100 })
      assertReadModelFallback(adapter, tsResult, 'helper-timeout', 1)
      assert.deepEqual(adapter.compactReadModelFingerprint(compactInput()), tsResult, 'repeated timeout fallback should stay TS-only')
      assert.equal(adapter.metadata().kernel.calls, 1, 'second call should not spawn helper after failure')
      assert.equal(adapter.metadata().kernel.fallbacks, 1, 'repeated failure should not increment fallback repeatedly')
    })

    runCase(kernel, 'crash', `#!/usr/bin/env node
process.stdout.write('${BAD_STDOUT_SENTINEL} '.repeat(200))
process.stderr.write('${BAD_STDERR_SENTINEL} '.repeat(200))
process.exit(9)
`, helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      assertReadModelFallback(adapter, tsResult, 'helper-nonzero-exit', 1)
    })

    runCase(kernel, 'malformed', `#!/usr/bin/env node
process.stdout.write('{not json ${BAD_STDOUT_SENTINEL}\\n')
`, helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      assertReadModelFallback(adapter, tsResult, 'helper-malformed-json', 1)
    })

    runCase(kernel, 'jsonrpc-error', nodeHelperSource(`
error(-32001, '${BAD_STDOUT_SENTINEL} long json rpc error body')
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      assertReadModelFallback(adapter, tsResult, 'helper-jsonrpc-error', 1)
    })

    runCase(kernel, 'wrong-protocol', `#!/usr/bin/env node
const fs = require('node:fs')
const request = JSON.parse(fs.readFileSync(0, 'utf8'))
process.stdout.write(JSON.stringify({ jsonrpc: '1.0', id: request.id, result: { ok: true } }) + '\\n')
`, helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      assertReadModelFallback(adapter, tsResult, 'helper-unsupported-protocol', 1)
    })

    runCase(kernel, 'bad-health-shape', nodeHelperSource(`
respond({ ok: true, implementation: 'go', protocolVersion: 1, helperVersion: '0.3.0-read-model-shadow', capabilities: ['health'], businessPathsConnected: false })
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      assertReadModelFallback(adapter, tsResult, 'helper-unsupported-capability', 1)
    })

    runCase(kernel, 'bad-version', nodeHelperSource(`
respond({ ...baseHealth, protocolVersion: 999 })
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      assertReadModelFallback(adapter, tsResult, 'helper-unsupported-version', 1)
    })

    runCase(kernel, 'bad-capability', nodeHelperSource(`
respond({ ...baseHealth, capabilities: ['health', 'profile', 'tmuxSnapshotParse'] })
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      assertReadModelFallback(adapter, tsResult, 'helper-unsupported-capability', 1)
    })

    runCase(kernel, 'bad-result-shape', nodeHelperSource(`
if (request.method === 'health') respond(baseHealth)
else respond({ ok: true, projection: { text: '${BAD_STDOUT_SENTINEL}' }, fingerprint: 'bad', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      assertReadModelFallback(adapter, tsResult, 'helper-incompatible-response', 2)
    })

    runCase(kernel, 'valid-read-model', nodeHelperSource(`
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params.input, fingerprint: JSON.stringify(request.params.input), inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })
else error(-32601, 'unexpected')
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      const result = adapter.compactReadModelFingerprint(compactInput())
      assert.equal(result.readOnly, true)
      assert.equal(result.fullTextIncluded, false)
      assert.equal(result.stateFilesRead, false)
      assert.equal(result.stateFilesWritten, false)
      assert.equal(adapter.metadata().kernel.mode, 'go')
      assert.equal(adapter.metadata().kernel.calls, 2)
      assert.equal(adapter.metadata().kernel.fallbacks, 0)
      assert.equal(adapter.metadata().kernel.helperPath, path.basename(helperPath))
      assert.equal(JSON.stringify(adapter.metadata()).includes(path.dirname(helperPath)), false, 'metadata should not leak full helper path')
    })

    runCase(kernel, 'valid-tmux', nodeHelperSource(`
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'tmuxSnapshotParse') respond({ capturedAt: request.params.capturedAt, panes: [{ paneId: '%go', target: 'go:@1', label: 'go parser', currentCommand: 'pi' }], byPaneId: { '%go': { paneId: '%go', target: 'go:@1', label: 'go parser', currentCommand: 'pi' } }, ok: true })
else error(-32601, 'unexpected')
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath })
      const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tts fallback\tpi', 123, tmuxFallback)
      assert.equal(snapshot.panes[0].paneId, '%go')
      assert.equal(adapter.metadata().kernel.mode, 'go')
      assert.equal(adapter.metadata().kernel.calls, 2)
      assert.equal(adapter.metadata().kernel.fallbacks, 0)
    })

    const kernelSource = env.helpers.readSource('core/kernel.ts')
    assert.equal(kernelSource.includes('writeJsonFile'), false, 'kernel adapter must not write repository state')
    assert.equal(kernelSource.includes('sidecar'), false, 'kernel adapter must not write sidecars')
    for (const forbidden of ['state/repository', 'taskApplication', 'taskReportWorkflow', 'planRunApplication']) {
      assert.equal(kernelSource.includes(forbidden), false, `kernel adapter must not import/control ${forbidden}`)
    }
    assert.match(kernelSource, /env: \{ PATH:/, 'helper subprocess env should stay narrow')
  },
}
