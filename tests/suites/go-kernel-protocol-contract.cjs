const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const fixtures = require('../fixtures/kernel/jsonrpc/protocolCases.cjs')

const BAD_STDOUT_SENTINEL = 'JSONRPC_PROTOCOL_BAD_STDOUT_SHOULD_NOT_LEAK'
const BAD_STDERR_SENTINEL = 'JSONRPC_PROTOCOL_BAD_STDERR_SHOULD_NOT_LEAK'
const FULL_PATH_SENTINEL = 'jsonrpc-secret-helper-path'

function hasGoToolchain() {
  return spawnSync('go', ['version'], { encoding: 'utf8' }).status === 0
}

function buildGoHelper(extRoot) {
  const helperDir = path.join(extRoot, 'kernel', 'go', 'agentteam-kernel')
  const out = path.join(os.tmpdir(), `agentteam-jsonrpc-kernel-${process.pid}-${Date.now()}`)
  const result = spawnSync('go', ['build', '-o', out, '.'], {
    cwd: helperDir,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, GO111MODULE: 'off' },
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'go build failed')
  return out
}

function runHelper(helperPath, input) {
  return spawnSync(helperPath, [], {
    input,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH || '' },
  })
}

function requestInput(request) {
  return `${JSON.stringify(request)}\n`
}

function parseJsonLines(stdout) {
  return String(stdout || '').split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
}

function assertJsonRpcEnvelope(response, request) {
  assert.equal(response.jsonrpc, '2.0')
  if (Object.prototype.hasOwnProperty.call(request, 'id') && request.id !== null) {
    assert.equal(Object.prototype.hasOwnProperty.call(response, 'id'), true, 'non-null request id should be echoed')
    assert.equal(response.id, request.id)
  }
}

function assertHealthResult(result) {
  assert.equal(result.ok, true)
  assert.equal(result.implementation, 'go')
  assert.equal(result.protocolVersion, fixtures.PROTOCOL_VERSION)
  assert.equal(result.helperVersion, fixtures.HELPER_VERSION)
  assert.deepEqual(result.capabilities, fixtures.CAPABILITIES)
  assert.equal(result.businessPathsConnected, false)
}

function assertProfileResult(result, expectedParams = {}) {
  assertHealthResult(result)
  assert.equal(result.profile.scope, 'skeleton-only')
  assert.deepEqual(result.profile.params, expectedParams)
  assert.equal(result.profile.stateConnected, false)
  assert.equal(result.profile.tmuxConnected, false)
  assert.equal(result.profile.tmuxSnapshotParseConnected, true)
  assert.equal(result.profile.tmuxSnapshotCaptureConnected, true)
  assert.equal(result.profile.compactReadModelFingerprintConnected, true)
  assert.equal(result.profile.workerLifecycleInspectPaneConnected, true)
  assert.equal(result.profile.workerLifecycleListAgentTeamPanesConnected, true)
  assert.equal(result.profile.panelConnected, false)
  assert.equal(result.profile.taskReportPlanRunConnected, false)
}

function assertTmuxResult(result, capturedAt) {
  assert.equal(result.capturedAt, capturedAt)
  assert.equal(result.ok, true)
  assert.ok(Array.isArray(result.panes))
  assert.ok(result.byPaneId && typeof result.byPaneId === 'object')
}

function assertReadModelResult(result, fingerprint, expectedProjection = undefined) {
  assert.equal(result.ok, true)
  assert.equal(result.fingerprint, fingerprint)
  assert.equal(result.inputKind, 'compact-panel-data')
  assert.equal(result.readOnly, true)
  assert.equal(result.fullTextIncluded, false)
  assert.equal(result.stateFilesRead, false)
  assert.equal(result.stateFilesWritten, false)
  if (expectedProjection !== undefined) assert.deepEqual(result.projection, expectedProjection)
  assert.equal(JSON.stringify(result).includes('JSON_RPC_FULL_TEXT_SHOULD_BE_STRIPPED'), false)
}

function assertMethodResult(response, request, fingerprintModule) {
  assertJsonRpcEnvelope(response, request)
  assert.equal(Object.prototype.hasOwnProperty.call(response, 'error'), false, `${request.method} should not return JSON-RPC error`)
  assert.equal(Object.prototype.hasOwnProperty.call(response, 'result'), true, `${request.method} should include result`)
  if (request.method === 'health') {
    assertHealthResult(response.result)
    return
  }
  if (request.method === 'profile') {
    assertProfileResult(response.result, request.params || {})
    return
  }
  if (request.method === 'tmuxSnapshotParse') {
    const params = request.params || {}
    assertTmuxResult(response.result, params.capturedAt || 0)
    return
  }
  if (request.method === 'tmuxSnapshotCapture') {
    const params = request.params || {}
    assert.equal(Number.isFinite(response.result.capturedAt), true)
    if (params.capturedAt !== undefined) assert.equal(response.result.capturedAt, params.capturedAt)
    assert.ok(Array.isArray(response.result.panes))
    assert.ok(response.result.byPaneId && typeof response.result.byPaneId === 'object')
    assert.equal(response.result.ok === true || response.result.ok === false, true)
    if (response.result.ok === false) {
      assert.equal(response.result.status, 'unknown')
      assert.equal(response.result.resultMarker, 'stale')
      assert.equal(response.result.module, 'tmuxSnapshotCapture')
      assert.equal(response.result.capability, 'tmuxSnapshotCapture')
      assert.ok(['tmux-command-timeout', 'tmux-command-failed', 'tmux-unavailable'].includes(response.result.cutoverFailureKind))
      assert.equal(/stdout|stderr|stack|MAILBOX_BODY|REPORT_BODY|worker transcript/i.test(JSON.stringify(response.result)), false)
    }
    return
  }
  if (request.method === 'compactReadModelFingerprint') {
    const input = request.params ? request.params.input : null
    const expectedProjection = input === undefined ? null : JSON.parse(JSON.stringify(input))
    const expectedFingerprint = fingerprintModule.stableCompactStringify(expectedProjection)
    assertReadModelResult(response.result, expectedFingerprint, expectedProjection)
    return
  }
  if (request.method === 'workerLifecycle') {
    const requestedOperation = request.params?.operation || 'inspectPane'
    const expectedOperation = requestedOperation === 'listAgentTeamPanes' ? 'listAgentTeamPanes' : 'inspectPane'
    assert.equal(response.result.operation, expectedOperation)
    assert.equal(response.result.capability, 'workerLifecycle')
    assert.equal(response.result.readOnly, true)
    assert.equal(response.result.stateFilesRead, false)
    assert.equal(response.result.stateFilesWritten, false)
    assert.equal(response.result.tmuxMutation, false)
    if (expectedOperation === 'listAgentTeamPanes') {
      assert.equal(Array.isArray(response.result.panes), true)
      assert.equal(response.result.byPaneId && typeof response.result.byPaneId === 'object', true)
    }
    if (response.result.ok === false) {
      if (expectedOperation === 'inspectPane') assert.equal(response.result.exists, false)
      assert.equal(response.result.status, 'unknown')
      assert.equal(response.result.resultMarker, 'stale')
      assert.ok(['pane-not-found', 'unsupported-operation', 'tmux-command-timeout', 'tmux-command-failed', 'tmux-unavailable'].includes(response.result.failureKind))
      assert.equal(/stdout|stderr|stack|MAILBOX_BODY|REPORT_BODY|worker transcript|rawState/i.test(JSON.stringify(response.result)), false)
    }
    return
  }
  throw new Error(`unexpected method ${request.method}`)
}

function writeHelper(name, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-jsonrpc-adapter-${name}-`))
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
  capabilities: ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle'],
  businessPathsConnected: false,
}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
function error(code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code, message } }) + '\\n') }
${handlerSource}
`
}

function runAdapterCase(kernel, name, source, action) {
  const helper = writeHelper(name, source)
  try {
    action(helper.file)
  } finally {
    fs.rmSync(helper.dir, { recursive: true, force: true })
  }
}

function compactInput() {
  return fixtures.compactReadModelInput()
}

function assertAdapterFallback(metadata, kind, expectedCalls) {
  assert.equal(metadata.kernel.mode, 'typescript')
  assert.equal(metadata.kernel.enabled, false)
  assert.equal(metadata.kernel.calls, expectedCalls)
  assert.equal(metadata.kernel.fallbacks, 1)
  assert.equal(metadata.kernel.fallbackKind, kind)
  assert.match(metadata.kernel.fallbackReason, new RegExp(`Go kernel fallback \\(${kind}\\)`))
  const json = JSON.stringify(metadata)
  assert.equal(json.includes(BAD_STDOUT_SENTINEL), false, `${kind} must not leak stdout sentinel`)
  assert.equal(json.includes(BAD_STDERR_SENTINEL), false, `${kind} must not leak stderr sentinel`)
  assert.equal(json.includes(FULL_PATH_SENTINEL), false, `${kind} must not leak full helper path`)
  assert.ok(String(metadata.kernel.fallbackReason).length <= 220, `${kind} fallback reason should stay compact`)
}

function runDirectHelperContract(env, fingerprintModule) {
  if (!hasGoToolchain()) return false
  const helperPath = buildGoHelper(env.helpers.extRoot)
  try {
    for (const testCase of fixtures.validMethodCases()) {
      const run = runHelper(helperPath, requestInput(testCase.request))
      assert.equal(run.status, 0, `${testCase.name} helper run should succeed: ${run.stderr}`)
      const [response] = parseJsonLines(run.stdout)
      assertMethodResult(response, testCase.request, fingerprintModule)
    }

    for (const testCase of fixtures.errorCases()) {
      const run = runHelper(helperPath, testCase.raw || requestInput(testCase.request))
      assert.equal(run.status, 0, `${testCase.name} helper run should succeed: ${run.stderr}`)
      const [response] = parseJsonLines(run.stdout)
      assert.equal(response.jsonrpc, '2.0')
      assert.equal(Object.prototype.hasOwnProperty.call(response, 'result'), false)
      assert.equal(response.error.code, testCase.expectedCode)
      if (testCase.expectedMessageIncludes) assert.ok(response.error.message.includes(testCase.expectedMessageIncludes))
      assert.equal(Object.prototype.hasOwnProperty.call(response, 'id'), testCase.expectedOwnId)
      if (testCase.expectedOwnId) assert.equal(response.id, testCase.expectedId)
    }

    for (const testCase of fixtures.idCases()) {
      const run = runHelper(helperPath, requestInput(testCase.request))
      assert.equal(run.status, 0, `${testCase.name} helper run should succeed: ${run.stderr}`)
      const [response] = parseJsonLines(run.stdout)
      assert.equal(response.jsonrpc, '2.0')
      assert.equal(Object.prototype.hasOwnProperty.call(response, 'id'), testCase.expectedOwnId, testCase.name)
      if (testCase.expectedOwnId) assert.equal(response.id, testCase.expectedId)
      assertHealthResult(response.result)
    }

    for (const testCase of fixtures.paramsCases()) {
      const run = runHelper(helperPath, requestInput(testCase.request))
      assert.equal(run.status, 0, `${testCase.name} helper run should succeed: ${run.stderr}`)
      const [response] = parseJsonLines(run.stdout)
      assertMethodResult(response, testCase.request, fingerprintModule)
    }

    const batch = fixtures.multipleRequestBatch()
    const batchRun = runHelper(helperPath, `${batch.map(item => JSON.stringify(item)).join('\n')}\n`)
    assert.equal(batchRun.status, 0, batchRun.stderr)
    const batchResponses = parseJsonLines(batchRun.stdout)
    assert.equal(batchResponses.length, batch.length, 'helper should answer every non-empty newline-delimited request')
    for (let index = 0; index < batch.length; index += 1) {
      const request = batch[index]
      const response = batchResponses[index]
      assert.equal(response.jsonrpc, '2.0')
      assert.equal(response.id, request.id)
      if (request.method === 'unknownMethod') {
        assert.equal(response.error.code, -32601)
      } else {
        assertMethodResult(response, request, fingerprintModule)
      }
    }

    const largeRequest = fixtures.largePayloadRequest(1024 * 1024)
    const largeRun = runHelper(helperPath, requestInput(largeRequest))
    assert.equal(largeRun.status, 0, largeRun.stderr)
    const [largeResponse] = parseJsonLines(largeRun.stdout)
    assert.equal(largeResponse.id, 'large-within-scanner-bound')
    assert.equal(largeResponse.result.panes.length, 1)
    assert.equal(largeResponse.result.byPaneId['%large'].currentCommand, 'pi')
    assert.equal(largeResponse.result.byPaneId['%large'].label.length, 1024 * 1024)
    return true
  } finally {
    fs.rmSync(helperPath, { force: true })
  }
}

module.exports = {
  name: 'Go kernel JSON-RPC protocol contract',
  async run(env) {
    const kernel = env.helpers.requireDist('core/kernel.js')
    const fingerprint = env.helpers.requireDist('core/readModelFingerprint.js')

    assert.equal(kernel.AGENTTEAM_KERNEL_PROTOCOL_VERSION, fixtures.PROTOCOL_VERSION)
    assert.equal(kernel.AGENTTEAM_KERNEL_ADAPTER_VERSION, fixtures.HELPER_VERSION)
    assert.equal(kernel.AGENTTEAM_KERNEL_HELPER_VERSION, fixtures.HELPER_VERSION)
    assert.deepEqual(kernel.AGENTTEAM_KERNEL_CAPABILITIES, fixtures.CAPABILITIES)
    assert.equal(kernel.AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED, false)

    assert.deepEqual(kernel.createKernelJsonRpcRequest('health', undefined, 'health-ts'), fixtures.request('health', undefined, 'health-ts'))
    assert.deepEqual(kernel.createKernelJsonRpcRequest('profile', { fixture: 'jsonrpc' }, 77), fixtures.request('profile', { fixture: 'jsonrpc' }, 77))
    assert.deepEqual(kernel.createKernelJsonRpcRequest('tmuxSnapshotParse', { stdout: 'x', capturedAt: 1 }, 'tmux-ts'), fixtures.request('tmuxSnapshotParse', { stdout: 'x', capturedAt: 1 }, 'tmux-ts'))
    assert.deepEqual(kernel.createKernelJsonRpcRequest('tmuxSnapshotCapture', { capturedAt: 2 }, 'tmux-capture-ts'), fixtures.request('tmuxSnapshotCapture', { capturedAt: 2 }, 'tmux-capture-ts'))
    assert.deepEqual(kernel.createKernelJsonRpcRequest('compactReadModelFingerprint', { input: { mode: 'attached' } }, 'read-ts'), fixtures.request('compactReadModelFingerprint', { input: { mode: 'attached' } }, 'read-ts'))
    assert.deepEqual(kernel.createKernelJsonRpcRequest('workerLifecycle', { operation: 'inspectPane', paneId: '%x' }, 'worker-ts'), fixtures.request('workerLifecycle', { operation: 'inspectPane', paneId: '%x' }, 'worker-ts'))

    const directHelperRan = runDirectHelperContract(env, fingerprint)
    assert.equal(typeof directHelperRan, 'boolean')

    const tsResult = kernel.createAgentTeamKernelAdapter({ mode: 'typescript', env: {} }).compactReadModelFingerprint(compactInput())

    runAdapterCase(kernel, 'malformed-json', `#!/usr/bin/env node
process.stdout.write('{not json ${BAD_STDOUT_SENTINEL}\\n')
`, helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath })
      assert.deepEqual(adapter.compactReadModelFingerprint(compactInput()), tsResult)
      assertAdapterFallback(adapter.metadata(), 'helper-malformed-json', 1)
    })

    runAdapterCase(kernel, 'jsonrpc-error', nodeHelperSource(`
error(-32001, '${BAD_STDOUT_SENTINEL} long protocol error')
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath })
      assert.deepEqual(adapter.compactReadModelFingerprint(compactInput()), tsResult)
      assertAdapterFallback(adapter.metadata(), 'helper-jsonrpc-error', 1)
    })

    runAdapterCase(kernel, 'unsupported-protocol', `#!/usr/bin/env node
const fs = require('node:fs')
const request = JSON.parse(fs.readFileSync(0, 'utf8'))
process.stdout.write(JSON.stringify({ jsonrpc: '1.0', id: request.id, result: { ok: true, sentinel: '${BAD_STDOUT_SENTINEL}' } }) + '\\n')
`, helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath })
      assert.deepEqual(adapter.compactReadModelFingerprint(compactInput()), tsResult)
      assertAdapterFallback(adapter.metadata(), 'helper-unsupported-protocol', 1)
    })

    runAdapterCase(kernel, 'incompatible-result', nodeHelperSource(`
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: { text: '${BAD_STDOUT_SENTINEL}' }, fingerprint: 'bad', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })
else error(-32601, 'unexpected')
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath })
      assert.deepEqual(adapter.compactReadModelFingerprint(compactInput()), tsResult)
      assertAdapterFallback(adapter.metadata(), 'helper-incompatible-response', 2)
    })

    const secretHelperPath = path.join(os.tmpdir(), FULL_PATH_SENTINEL, 'missing-helper')
    const missing = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath: secretHelperPath })
    assert.deepEqual(missing.compactReadModelFingerprint(compactInput()), tsResult)
    assert.equal(missing.metadata().kernel.calls, 0)
    assert.equal(missing.metadata().kernel.fallbacks, 0)

    const goMissing = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: secretHelperPath })
    assert.deepEqual(goMissing.compactReadModelFingerprint(compactInput()), tsResult)
    const snapshot = goMissing.parseTmuxPaneSnapshot('%x\tx:@1\tlabel\tpi', 1700004000000, () => {
      throw new Error('go missing helper must not call TypeScript parser fallback')
    })
    assert.equal(snapshot.ok, false)
    assert.equal(snapshot.status, 'unknown')
    assert.equal(snapshot.resultMarker, 'stale')
    assert.equal(snapshot.module, 'tmuxSnapshotParse')
    assert.equal(snapshot.capability, 'tmuxSnapshotParse')
    assert.equal(snapshot.cutoverFailureKind, 'missing-helper')
    assert.equal(goMissing.metadata().kernel.fallbacks, 0)
    assert.equal(Object.prototype.hasOwnProperty.call(goMissing.metadata().kernel, 'fallbackKind'), false)
    assert.equal(goMissing.metadata().kernel.cutoverStatus, 'unavailable')
    assert.equal(JSON.stringify(goMissing.metadata()).includes(FULL_PATH_SENTINEL), false, 'go missing diagnostic must not leak full helper path')
  },
}
