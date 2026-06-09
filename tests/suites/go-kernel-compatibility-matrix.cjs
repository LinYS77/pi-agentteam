const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BAD_STDOUT_SENTINEL = 'COMPAT_MATRIX_BAD_STDOUT_SHOULD_NOT_LEAK'
const BAD_STDERR_SENTINEL = 'COMPAT_MATRIX_BAD_STDERR_SHOULD_NOT_LEAK'
const FULL_PATH_SENTINEL = 'compat-secret-helper-path'
const REQUIRED_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint']
const HELPER_VERSION = '0.3.0-read-model-shadow'

function writeHelper(name, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-kernel-compat-${name}-`))
  const file = path.join(dir, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return { dir, file }
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

function runWithHelper(name, source, action) {
  const helper = writeHelper(name, source)
  try {
    return action(helper.file)
  } finally {
    fs.rmSync(helper.dir, { recursive: true, force: true })
  }
}

function compactInput() {
  return {
    mode: 'attached',
    team: {
      name: 'compat-team',
      leaderCwd: '/tmp/compat-team',
      identity: {
        teamId: 'team-compat',
        projectKey: 'project-compat',
        displayName: 'Compat Team',
        slug: 'compat-team',
      },
      revision: 3,
      tasks: {
        T001: { history: { reports: 1, events: 2, messageRefs: 3 } },
      },
    },
    members: [
      {
        name: 'worker-a',
        role: 'implementer',
        status: 'idle',
        paneId: '%compat-a',
        windowTarget: 'compat:@1',
        bridgeAvailable: true,
        bridgeVersion: 'test',
        bridgeLastSeenAt: 1700000100000,
      },
    ],
    tasks: [
      {
        id: 'T001',
        title: 'Compatibility task',
        status: 'open',
        owner: 'worker-a',
        updatedAt: 1700000101000,
        blockedBy: [],
      },
    ],
    mailbox: [],
    outboxDiagnostics: { pending: 0, failed: 0, latest: [] },
  }
}

function tmuxFallback(stdout, capturedAt) {
  const panes = stdout ? [{ paneId: '%ts', target: 'ts:@1', label: 'ts fallback', currentCommand: 'pi' }] : []
  return { capturedAt, panes, byPaneId: Object.fromEntries(panes.map(item => [item.paneId, item])), ok: true }
}

function assertNoFallbackKind(metadata) {
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false, 'metadata should not include fallbackKind')
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackReason'), false, 'metadata should not include fallbackReason')
}

function assertMetadata(metadata, expected) {
  assert.equal(metadata.implementation, expected.implementation ?? expected.mode)
  assert.equal(metadata.kernel.requestedMode, expected.requestedMode)
  assert.equal(metadata.kernel.mode, expected.mode)
  assert.equal(metadata.kernel.enabled, expected.enabled)
  assert.equal(metadata.kernel.calls, expected.calls)
  assert.equal(metadata.kernel.fallbacks, expected.fallbacks)
  assert.equal(metadata.kernel.requestedKnownKernel, expected.requestedKnownKernel ?? true)
  assert.equal(metadata.kernel.protocolVersion, 1)
  assert.equal(metadata.kernel.adapterVersion, HELPER_VERSION)
  assert.equal(metadata.kernel.helperVersion, HELPER_VERSION)
  assert.deepEqual(metadata.kernel.capabilities, REQUIRED_CAPABILITIES)
  assert.equal(metadata.kernel.businessPathsConnected, false)
  if (expected.fallbackKind) {
    assert.equal(metadata.kernel.fallbackKind, expected.fallbackKind)
    assert.match(metadata.kernel.fallbackReason, new RegExp(`Go kernel fallback \\(${expected.fallbackKind}\\)`))
    assert.ok(String(metadata.kernel.fallbackReason).length <= 220, 'fallbackReason should remain compact')
    const json = JSON.stringify(metadata)
    assert.equal(json.includes(BAD_STDOUT_SENTINEL), false, 'metadata must not leak stdout sentinel')
    assert.equal(json.includes(BAD_STDERR_SENTINEL), false, 'metadata must not leak stderr sentinel')
    assert.equal(json.includes(FULL_PATH_SENTINEL), false, 'metadata must not leak full helper path')
  } else {
    assertNoFallbackKind(metadata)
  }
}

function assertFallbackResult(result) {
  assert.equal(result.ok, true)
  assert.equal(result.readOnly, true)
  assert.equal(result.fullTextIncluded, false)
  assert.equal(result.stateFilesRead, false)
  assert.equal(result.stateFilesWritten, false)
}

function compatibilityHelper(overrides = {}) {
  const healthOverrides = JSON.stringify(overrides.health ?? {})
  return helperSource(`
const health = { ...baseHealth, ...${healthOverrides} }
if (request.method === 'health') respond(health)
else if (request.method === 'profile') respond({ ...health, profile: { scope: 'skeleton-only', params: request.params || {}, stateConnected: false, tmuxConnected: false, tmuxSnapshotParseConnected: true, compactReadModelFingerprintConnected: true, panelConnected: false, taskReportPlanRunConnected: false } })
else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params ? request.params.input : null, fingerprint: JSON.stringify(request.params ? request.params.input : null), inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })
else if (request.method === 'tmuxSnapshotParse') respond({ capturedAt: request.params ? request.params.capturedAt : 0, panes: [{ paneId: '%go', target: 'go:@1', label: 'go parser', currentCommand: 'pi' }], byPaneId: { '%go': { paneId: '%go', target: 'go:@1', label: 'go parser', currentCommand: 'pi' } }, ok: true })
else error(-32601, 'unexpected')
`)
}

module.exports = {
  name: 'Go kernel compatibility matrix',
  async run(env) {
    const kernel = env.helpers.requireDist('core/kernel.js')
    const source = env.helpers.readSource('core/kernel.ts')
    assert.match(source, /health\.capabilities\.some\(capability => !isCapability\(capability\)\)/, 'extra capability policy should remain strict unless deliberately changed')

    const tsBaseline = kernel.createAgentTeamKernelAdapter({ mode: 'typescript', env: {} }).compactReadModelFingerprint(compactInput())

    for (const mode of ['disabled', undefined, '', 'none', 'off']) {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode, env: {} })
      assertFallbackResult(adapter.compactReadModelFingerprint(compactInput()))
      assertMetadata(adapter.metadata(), {
        requestedMode: 'disabled',
        mode: 'typescript',
        enabled: false,
        calls: 0,
        fallbacks: 0,
      })
    }

    for (const mode of ['typescript', 'ts']) {
      runWithHelper(`ignored-${mode}`, compatibilityHelper(), helperPath => {
        const adapter = kernel.createAgentTeamKernelAdapter({ mode, helperPath })
        assert.deepEqual(adapter.compactReadModelFingerprint(compactInput()), tsBaseline)
        assertMetadata(adapter.metadata(), {
          requestedMode: 'typescript',
          mode: 'typescript',
          enabled: false,
          calls: 0,
          fallbacks: 0,
        })
      })
    }

    const autoMissing = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath: path.join(os.tmpdir(), 'missing-auto-helper') })
    assert.deepEqual(autoMissing.compactReadModelFingerprint(compactInput()), tsBaseline)
    assertMetadata(autoMissing.metadata(), {
      requestedMode: 'auto',
      mode: 'typescript',
      enabled: false,
      calls: 0,
      fallbacks: 0,
    })

    const goMissing = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(os.tmpdir(), FULL_PATH_SENTINEL, 'missing-go-helper') })
    assert.deepEqual(goMissing.compactReadModelFingerprint(compactInput()), tsBaseline)
    assertMetadata(goMissing.metadata(), {
      requestedMode: 'go',
      mode: 'typescript',
      enabled: false,
      calls: 0,
      fallbacks: 1,
      fallbackKind: 'missing-helper',
    })

    const incompatibilityRows = [
      {
        name: 'protocol-version-mismatch',
        health: { protocolVersion: 2 },
        fallbackKind: 'helper-unsupported-version',
      },
      {
        name: 'helper-version-mismatch',
        health: { helperVersion: '0.4.17-contract' },
        fallbackKind: 'helper-unsupported-version',
      },
      {
        name: 'missing-required-capability',
        health: { capabilities: ['health', 'profile', 'tmuxSnapshotParse'] },
        fallbackKind: 'helper-unsupported-capability',
      },
      {
        name: 'unknown-extra-capability-strict',
        health: { capabilities: [...REQUIRED_CAPABILITIES, 'futureWriteAuthority'] },
        fallbackKind: 'helper-unsupported-capability',
      },
      {
        name: 'business-paths-connected',
        health: { businessPathsConnected: true },
        fallbackKind: 'helper-incompatible-response',
      },
    ]

    for (const row of incompatibilityRows) {
      runWithHelper(row.name, compatibilityHelper({ health: row.health }), helperPath => {
        const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
        assert.deepEqual(adapter.compactReadModelFingerprint(compactInput()), tsBaseline)
        assertMetadata(adapter.metadata(), {
          requestedMode: 'go',
          mode: 'typescript',
          enabled: false,
          calls: 1,
          fallbacks: 1,
          fallbackKind: row.fallbackKind,
        })
        assert.deepEqual(adapter.compactReadModelFingerprint(compactInput()), tsBaseline, `${row.name} should stay TS-only after first failure`)
        assert.equal(adapter.metadata().kernel.calls, 1, `${row.name} should not spawn again after failure`)
        assert.equal(adapter.metadata().kernel.fallbacks, 1, `${row.name} should not increment fallback repeatedly`)
      })
    }

    runWithHelper('compatible-health', compatibilityHelper(), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      const health = adapter.health()
      assert.equal(health.implementation, 'go')
      assertMetadata(adapter.metadata(), {
        requestedMode: 'go',
        mode: 'go',
        enabled: true,
        calls: 1,
        fallbacks: 0,
      })
      assert.equal(adapter.metadata().kernel.helperPath, path.basename(helperPath))
      assert.equal(JSON.stringify(adapter.metadata()).includes(path.dirname(helperPath)), false, 'metadata should not leak helper directory')
    })

    runWithHelper('compatible-read-model', compatibilityHelper(), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      const result = adapter.compactReadModelFingerprint(compactInput())
      assert.equal(result.ok, true)
      assert.equal(result.readOnly, true)
      assert.equal(result.fullTextIncluded, false)
      assert.equal(result.stateFilesRead, false)
      assert.equal(result.stateFilesWritten, false)
      assertMetadata(adapter.metadata(), {
        requestedMode: 'go',
        mode: 'go',
        enabled: true,
        calls: 2,
        fallbacks: 0,
      })
    })

    runWithHelper('compatible-profile-and-tmux', compatibilityHelper(), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath })
      const profile = adapter.profile({ fixture: 'compat' })
      assert.equal(profile.implementation, 'go')
      assert.equal(profile.profile.stateConnected, false)
      assert.equal(profile.profile.taskReportPlanRunConnected, false)
      assertMetadata(adapter.metadata(), {
        requestedMode: 'auto',
        mode: 'go',
        enabled: true,
        calls: 2,
        fallbacks: 0,
      })
      const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tts fallback\tpi', 123, tmuxFallback)
      assert.equal(snapshot.panes[0].paneId, '%go')
      assertMetadata(adapter.metadata(), {
        requestedMode: 'auto',
        mode: 'go',
        enabled: true,
        calls: 3,
        fallbacks: 0,
      })
    })

    const goSource = fs.readFileSync(path.join(env.helpers.extRoot, 'kernel/go/agentteam-kernel/main.go'), 'utf8')
    for (const forbidden of ['os.Open', 'os.ReadFile', 'os.WriteFile', 'os.Create', 'PI_AGENTTEAM_HOME', 'team.json', 'inboxes', 'sidecar']) {
      assert.equal(goSource.includes(forbidden), false, `Go helper must remain source-only/read-only and not contain ${forbidden}`)
    }
    for (const rel of ['teamPanel/dataSource.ts', 'state/repository.ts', 'app/taskApplication.ts', 'app/taskReportWorkflow.ts', 'app/planRunApplication.ts']) {
      const fileSource = env.helpers.readSource(rel)
      assert.equal(fileSource.includes('fallbackKind'), false, `${rel} must not expose fallbackKind in runtime/governance paths`)
      assert.equal(fileSource.includes('PI_AGENTTEAM_KERNEL'), false, `${rel} must not read kernel env`)
    }
  },
}
