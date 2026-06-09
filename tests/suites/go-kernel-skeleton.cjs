const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const BUSINESS_PATHS = [
  'state',
  'tmux',
  'teamPanel',
  'app',
  'adapters/runtime',
  'adapters/tmux',
  'runtime',
  'tools',
  'commands',
]

function hasGoToolchain() {
  const result = spawnSync('go', ['version'], { encoding: 'utf8' })
  return result.status === 0
}

function runGoHelper(extRoot, request) {
  const helperDir = path.join(extRoot, 'kernel', 'go', 'agentteam-kernel')
  return spawnSync('go', ['run', '.'], {
    cwd: helperDir,
    input: `${JSON.stringify(request)}\n`,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, GO111MODULE: 'off' },
  })
}

function jsonRpcRequest(method, params = undefined, id = `test-${method}`) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    ...(params ? { params } : {}),
  }
}

module.exports = {
  name: 'Go kernel skeleton contract',
  async run(env) {
    const kernel = env.helpers.requireDist('core/kernel.js')
    assert.equal(kernel.AGENTTEAM_KERNEL_PROTOCOL_VERSION, 1)
    assert.equal(kernel.AGENTTEAM_KERNEL_ADAPTER_VERSION, '0.3.0-read-model-shadow')
    assert.equal(kernel.AGENTTEAM_KERNEL_HELPER_VERSION, '0.3.0-read-model-shadow')
    assert.deepEqual(kernel.AGENTTEAM_KERNEL_CAPABILITIES, ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint'])
    assert.equal(kernel.AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED, false)

    assert.equal(kernel.normalizeAgentTeamKernelMode(undefined), 'disabled')
    assert.equal(kernel.normalizeAgentTeamKernelMode(''), 'disabled')
    assert.equal(kernel.normalizeAgentTeamKernelMode('ts'), 'typescript')
    assert.equal(kernel.normalizeAgentTeamKernelMode('typescript'), 'typescript')
    assert.equal(kernel.normalizeAgentTeamKernelMode('go'), 'go')
    assert.equal(kernel.normalizeAgentTeamKernelMode('auto'), 'auto')
    assert.equal(kernel.normalizeAgentTeamKernelMode('weird value!'), 'weirdvalue')

    const request = kernel.createKernelJsonRpcRequest('health', undefined, 'health-1')
    assert.deepEqual(request, { jsonrpc: '2.0', id: 'health-1', method: 'health' })
    const profileRequest = kernel.createKernelJsonRpcRequest('profile', { fixture: 'tiny' }, 'profile-1')
    assert.deepEqual(profileRequest, { jsonrpc: '2.0', id: 'profile-1', method: 'profile', params: { fixture: 'tiny' } })

    const disabled = kernel.createAgentTeamKernelAdapter({ env: {} })
    const disabledMetadata = disabled.metadata()
    assert.equal(disabledMetadata.implementation, 'typescript')
    assert.equal(disabledMetadata.kernel.requestedMode, 'disabled')
    assert.equal(disabledMetadata.kernel.mode, 'typescript')
    assert.equal(disabledMetadata.kernel.enabled, false)
    assert.equal(disabledMetadata.kernel.calls, 0)
    assert.equal(disabledMetadata.kernel.fallbacks, 0)
    assert.equal(disabledMetadata.kernel.protocolVersion, 1)
    assert.equal(disabledMetadata.kernel.adapterVersion, '0.3.0-read-model-shadow')
    assert.deepEqual(disabledMetadata.kernel.capabilities, ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint'])
    assert.equal(disabledMetadata.kernel.businessPathsConnected, false)

    const disabledHealth = disabled.health()
    assert.equal(disabledHealth.ok, true)
    assert.equal(disabledHealth.implementation, 'typescript')
    assert.equal(disabledHealth.businessPathsConnected, false)
    assert.deepEqual(disabledHealth.capabilities, ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint'])

    const disabledProfile = disabled.profile({ bench: 'state' })
    assert.equal(disabledProfile.profile.scope, 'skeleton-only')
    assert.deepEqual(disabledProfile.profile.params, { bench: 'state' })
    assert.equal(disabledProfile.profile.stateConnected, false)
    assert.equal(disabledProfile.profile.tmuxConnected, false)
    assert.equal(disabledProfile.profile.tmuxSnapshotParseConnected, false)
    assert.equal(disabledProfile.profile.compactReadModelFingerprintConnected, false)
    assert.equal(disabledProfile.profile.panelConnected, false)
    assert.equal(disabledProfile.profile.taskReportPlanRunConnected, false)

    const requestedGo = kernel.createAgentTeamKernelAdapter({ env: { PI_AGENTTEAM_KERNEL: 'go' }, helperPath: path.join(os.tmpdir(), 'missing-agentteam-kernel') })
    const goMetadata = requestedGo.metadata()
    assert.equal(goMetadata.implementation, 'typescript')
    assert.equal(goMetadata.kernel.requestedMode, 'go')
    assert.equal(goMetadata.kernel.mode, 'typescript')
    assert.equal(goMetadata.kernel.enabled, false)
    assert.equal(goMetadata.kernel.calls, 0)
    assert.equal(goMetadata.kernel.fallbacks, 1)
    assert.equal(goMetadata.kernel.requestedKnownKernel, true)
    assert.equal(goMetadata.kernel.fallbackKind, 'missing-helper')
    assert.match(goMetadata.kernel.fallbackReason, /using TypeScript fallback/)
    assert.equal(requestedGo.health().implementation, 'typescript')

    const unsupported = kernel.createAgentTeamKernelAdapter({ env: { PI_AGENTTEAM_KERNEL: 'rust' } })
    const unsupportedMetadata = unsupported.metadata()
    assert.equal(unsupportedMetadata.kernel.requestedMode, 'rust')
    assert.equal(unsupportedMetadata.kernel.requestedKnownKernel, false)
    assert.equal(unsupportedMetadata.kernel.fallbacks, 1)
    assert.equal(unsupportedMetadata.kernel.fallbackKind, 'unsupported-mode')
    assert.match(unsupportedMetadata.kernel.fallbackReason, /PI_AGENTTEAM_KERNEL=rust/)

    const source = env.helpers.readSource('core/kernel.ts')
    for (const forbidden of ['../state/', '../tmux/', '../teamPanel/', '../app/', '../adapters/', '../runtime/', '../tools/', '../commands/']) {
      assert.equal(source.includes(forbidden), false, `core/kernel.ts must not import ${forbidden}`)
    }

    for (const dir of BUSINESS_PATHS) {
      const root = path.join(env.helpers.extRoot, dir)
      if (!fs.existsSync(root)) continue
      const stack = [root]
      while (stack.length > 0) {
        const current = stack.pop()
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name)
          if (entry.isDirectory()) {
            stack.push(full)
            continue
          }
          if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
          const rel = path.relative(env.helpers.extRoot, full).replace(/\\/g, '/')
          const text = fs.readFileSync(full, 'utf8')
          if (rel === 'tmux/snapshot.ts') continue
          assert.equal(text.includes('core/kernel.js'), false, `${rel} must not import Go kernel skeleton`)
          assert.equal(text.includes('../core/kernel.js'), false, `${rel} must not import Go kernel skeleton`)
          assert.equal(text.includes('../../core/kernel.js'), false, `${rel} must not import Go kernel skeleton`)
        }
      }
    }

    const goSource = fs.readFileSync(path.join(env.helpers.extRoot, 'kernel/go/agentteam-kernel/main.go'), 'utf8')
    assert.match(goSource, /case "health"/)
    assert.match(goSource, /case "profile"/)
    assert.match(goSource, /case "tmuxSnapshotParse"/)
    assert.match(goSource, /case "compactReadModelFingerprint"/)
    assert.match(goSource, /BusinessPathsConnected: false/)

    if (hasGoToolchain()) {
      const healthRun = runGoHelper(env.helpers.extRoot, jsonRpcRequest('health', undefined, 'go-health'))
      assert.equal(healthRun.status, 0, healthRun.stderr)
      const health = JSON.parse(healthRun.stdout.trim())
      assert.equal(health.jsonrpc, '2.0')
      assert.equal(health.id, 'go-health')
      assert.equal(health.result.ok, true)
      assert.equal(health.result.implementation, 'go')
      assert.equal(health.result.protocolVersion, 1)
      assert.equal(health.result.helperVersion, '0.3.0-read-model-shadow')
      assert.deepEqual(health.result.capabilities, ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint'])
      assert.equal(health.result.businessPathsConnected, false)

      const profileRun = runGoHelper(env.helpers.extRoot, jsonRpcRequest('profile', { fixture: 'tiny' }, 'go-profile'))
      assert.equal(profileRun.status, 0, profileRun.stderr)
      const profile = JSON.parse(profileRun.stdout.trim())
      assert.equal(profile.jsonrpc, '2.0')
      assert.equal(profile.id, 'go-profile')
      assert.equal(profile.result.ok, true)
      assert.equal(profile.result.implementation, 'go')
      assert.equal(profile.result.profile.scope, 'skeleton-only')
      assert.deepEqual(profile.result.profile.params, { fixture: 'tiny' })
      assert.equal(profile.result.profile.stateConnected, false)
      assert.equal(profile.result.profile.tmuxConnected, false)
      assert.equal(profile.result.profile.tmuxSnapshotParseConnected, true)
      assert.equal(profile.result.profile.compactReadModelFingerprintConnected, true)
      assert.equal(profile.result.profile.panelConnected, false)
      assert.equal(profile.result.profile.taskReportPlanRunConnected, false)

      const unknownRun = runGoHelper(env.helpers.extRoot, jsonRpcRequest('unknown', undefined, 'go-unknown'))
      assert.equal(unknownRun.status, 0, unknownRun.stderr)
      const unknown = JSON.parse(unknownRun.stdout.trim())
      assert.equal(unknown.error.code, -32601)
    }
  },
}
