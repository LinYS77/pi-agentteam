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
    assert.deepEqual(kernel.AGENTTEAM_KERNEL_CAPABILITIES, ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
    assert.equal(kernel.AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED, false)

    assert.equal(kernel.normalizeAgentTeamKernelMode(undefined), 'default')
    assert.equal(kernel.normalizeAgentTeamKernelMode(''), 'default')
    assert.equal(kernel.normalizeAgentTeamKernelMode('ts'), 'typescript')
    assert.equal(kernel.normalizeAgentTeamKernelMode('typescript'), 'typescript')
    assert.equal(kernel.normalizeAgentTeamKernelMode('go'), 'go')
    assert.equal(kernel.normalizeAgentTeamKernelMode('auto'), 'auto')
    assert.equal(kernel.normalizeAgentTeamKernelMode('weird value!'), 'weirdvalue')

    const request = kernel.createKernelJsonRpcRequest('health', undefined, 'health-1')
    assert.deepEqual(request, { jsonrpc: '2.0', id: 'health-1', method: 'health' })
    const profileRequest = kernel.createKernelJsonRpcRequest('profile', { fixture: 'tiny' }, 'profile-1')
    assert.deepEqual(profileRequest, { jsonrpc: '2.0', id: 'profile-1', method: 'profile', params: { fixture: 'tiny' } })

    const defaultAdapter = kernel.createAgentTeamKernelAdapter({ env: {} })
    const defaultMetadata = defaultAdapter.metadata()
    assert.equal(defaultMetadata.implementation, 'go')
    assert.equal(defaultMetadata.kernel.requestedMode, 'default')
    assert.equal(defaultMetadata.kernel.mode, 'go')
    assert.equal(defaultMetadata.kernel.enabled, true)
    assert.equal(defaultMetadata.kernel.calls, 0)
    assert.equal(defaultMetadata.kernel.fallbacks, 0)
    assert.equal(defaultMetadata.kernel.protocolVersion, 1)
    assert.equal(defaultMetadata.kernel.adapterVersion, '0.3.0-read-model-shadow')
    assert.deepEqual(defaultMetadata.kernel.capabilities, ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
    assert.equal(defaultMetadata.kernel.businessPathsConnected, false)
    assert.equal(defaultMetadata.kernel.cutoverModule, 'tmuxSnapshotParse')
    assert.equal(defaultMetadata.kernel.cutoverStatus, 'active')

    const defaultHealth = defaultAdapter.health()
    assert.equal(defaultHealth.ok, true)
    assert.equal(defaultHealth.implementation, 'go')
    assert.equal(defaultHealth.businessPathsConnected, false)
    assert.deepEqual(defaultHealth.capabilities, ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])

    const defaultProfile = defaultAdapter.profile({ bench: 'state' })
    assert.equal(defaultProfile.profile.scope, 'skeleton-only')
    assert.deepEqual(defaultProfile.profile.params, { bench: 'state' })
    assert.equal(defaultProfile.profile.stateConnected, false)
    assert.equal(defaultProfile.profile.tmuxConnected, false)
    assert.equal(defaultProfile.profile.tmuxSnapshotParseConnected, true)
    assert.equal(defaultProfile.profile.tmuxSnapshotCaptureConnected, true)
    assert.equal(defaultProfile.profile.compactReadModelFingerprintConnected, true)
    assert.equal(defaultProfile.profile.workerLifecycleInspectPaneConnected, true)
    assert.equal(defaultProfile.profile.workerLifecycleListAgentTeamPanesConnected, true)
    assert.equal(defaultProfile.profile.workerLifecycleCaptureCurrentPaneBindingConnected, true)
    assert.equal(defaultProfile.profile.workerLifecycleListPanesInWindowConnected, true)
    assert.equal(defaultProfile.profile.workerLifecycleFindAgentTeamWindowTargetConnected, true)
    assert.equal(defaultProfile.profile.workerLifecycleFindWindowTargetByNameConnected, true)
    assert.equal(defaultProfile.profile.workerLifecycleSessionExistsConnected, true)
    assert.equal(defaultProfile.profile.workerLifecycleMarkWindowAsAgentTeamConnected, true)
    assert.equal(defaultProfile.profile.workerLifecycleRefreshWindowPaneLabelsConnected, true)
    assert.equal(defaultProfile.profile.workerLifecycleSetPaneLabelConnected, true)
    assert.equal(defaultProfile.profile.workerLifecycleClearPaneLabelConnected, true)
    assert.equal(defaultProfile.profile.workerLifecycleCreateTeammatePaneConnected, true)
    assert.equal(defaultProfile.profile.workerLifecycleCreateDetachedSwarmSessionConnected, true)
    assert.equal(defaultProfile.profile.tmuxAvailabilityConnected, true)
    assert.equal(defaultProfile.profile.panelConnected, false)
    assert.equal(defaultProfile.profile.taskReportPlanRunConnected, false)

    const disabled = kernel.createAgentTeamKernelAdapter({ mode: 'disabled', env: {} })
    const disabledMetadata = disabled.metadata()
    assert.equal(disabledMetadata.implementation, 'typescript')
    assert.equal(disabledMetadata.kernel.requestedMode, 'disabled')
    assert.equal(disabledMetadata.kernel.mode, 'typescript')
    assert.equal(disabledMetadata.kernel.enabled, false)
    assert.equal(disabledMetadata.kernel.calls, 0)
    assert.equal(disabledMetadata.kernel.fallbacks, 0)
    assert.equal(Object.prototype.hasOwnProperty.call(disabledMetadata.kernel, 'cutoverStatus'), false)

    const requestedGo = kernel.createAgentTeamKernelAdapter({ env: { PI_AGENTTEAM_KERNEL: 'go' }, helperPath: path.join(os.tmpdir(), 'missing-agentteam-kernel') })
    const goMetadata = requestedGo.metadata()
    assert.equal(goMetadata.implementation, 'typescript')
    assert.equal(goMetadata.kernel.requestedMode, 'go')
    assert.equal(goMetadata.kernel.mode, 'typescript')
    assert.equal(goMetadata.kernel.enabled, false)
    assert.equal(goMetadata.kernel.calls, 0)
    assert.equal(goMetadata.kernel.fallbacks, 0)
    assert.equal(goMetadata.kernel.requestedKnownKernel, true)
    assert.equal(goMetadata.kernel.cutoverStatus, 'unavailable')
    assert.equal(goMetadata.kernel.cutoverFailureKind, 'missing-helper')
    assert.equal(Object.prototype.hasOwnProperty.call(goMetadata.kernel, 'fallbackKind'), false)
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
          if (rel === 'tmux/core.ts') {
            assert.equal(text.includes("import { createAgentTeamKernelAdapter } from '../core/kernel.js'"), true, `${rel} must keep only approved worker lifecycle facade seams`)
            assert.equal(text.includes('createAgentTeamKernelAdapter().inspectWorkerPane(paneId)'), true, `${rel} must keep the approved inspectPane facade seam`)
            assert.equal(text.includes('return Boolean(paneId && inspectPane(paneId).exists)'), true, `${rel} must keep the approved paneExists facade seam`)
            assert.equal(text.includes('createAgentTeamKernelAdapter().listAgentTeamPanes()'), true, `${rel} must keep the approved listAgentTeamPanes facade seam`)
            assert.equal(text.includes('createAgentTeamKernelAdapter().captureCurrentPaneBinding()'), true, `${rel} must keep the approved captureCurrentPaneBinding facade seam`)
            assert.equal((text.match(/core\/kernel\.js/g) || []).length, 1, `${rel} must not add more Go kernel imports`)
            continue
          }
          if (rel === 'tmux/process.ts') {
            assert.equal(text.includes("import { createAgentTeamKernelAdapter } from '../core/kernel.js'"), true, `${rel} must keep only the approved app-start wait inspect seam`)
            assert.equal(text.includes('kernel.inspectWorkerPaneAsync(paneId, signal)'), true, `${rel} must use the approved async inspect seam`)
            assert.equal(text.includes('runTmuxNoThrowAsync'), false, `${rel} must not retain direct tmux polling`)
            assert.equal((text.match(/core\/kernel\.js/g) || []).length, 1, `${rel} must not add more Go kernel imports`)
            continue
          }
          if (rel === 'tmux/windows.ts') {
            assert.equal(text.includes("import { createAgentTeamKernelAdapter } from '../core/kernel.js'"), true, `${rel} must keep only approved window/session workerLifecycle seams`)
            assert.equal(text.includes('createAgentTeamKernelAdapter().findAgentTeamWindowTargetAsync(sessionName, signal)'), true, `${rel} must use the approved agentteam-window discovery seam`)
            assert.equal(text.includes('createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)'), true, `${rel} must use the approved session existence seam`)
            assert.equal(text.includes('createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)'), true, `${rel} must use the approved detached new-session creation seam`)
            assert.equal(text.includes("runTmuxAsync(['new-session'"), false, `${rel} must not retain direct detached new-session fallback`)
            assert.equal(text.includes('createAgentTeamKernelAdapter().findWindowTargetByNameAsync(sessionName, windowName, signal)'), true, `${rel} must use the approved post-creation window-name lookup seam`)
            assert.equal((text.match(/core\/kernel\.js/g) || []).length, 1, `${rel} must not add more Go kernel imports`)
            continue
          }
          if (rel === 'tmux/labels.ts') {
            assert.equal(text.includes("import { createAgentTeamKernelAdapter } from '../core/kernel.js'"), true, `${rel} must keep only the approved labels seams`)
            assert.equal(text.includes('createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)'), true, `${rel} must use the approved markWindowAsAgentTeam seam`)
            assert.equal(text.includes('createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)'), true, `${rel} must use the approved refreshWindowPaneLabels seam`)
            assert.equal(text.includes('createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)'), true, `${rel} must use the approved setPaneLabel seam`)
            assert.equal(text.includes('createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)'), true, `${rel} must use the approved clearPaneLabel seam`)
            assert.equal((text.match(/core\/kernel\.js/g) || []).length, 1, `${rel} must not add more Go kernel imports`)
            continue
          }
          if (rel === 'tmux/panes.ts') {
            assert.equal(text.includes("import { createAgentTeamKernelAdapter } from '../core/kernel.js'"), true, `${rel} must keep only the approved createTeammatePane seam`)
            assert.equal(text.includes('createAgentTeamKernelAdapter().createTeammatePaneAsync({'), true, `${rel} must use the approved createTeammatePane seam`)
            assert.equal(text.includes('await ensureSwarmWindow(input.preferred, signal)'), true, `${rel} must keep ensureSwarmWindow TS-owned`)
            assert.equal(text.includes('runTmuxAsync'), false, `${rel} must not retain direct createTeammatePane tmux fallback`)
            assert.equal((text.match(/core\/kernel\.js/g) || []).length, 1, `${rel} must not add more Go kernel imports`)
            continue
          }
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
    assert.match(goSource, /case "tmuxSnapshotCapture"/)
    assert.match(goSource, /case "compactReadModelFingerprint"/)
    assert.match(goSource, /case "workerLifecycle"/)
    assert.match(goSource, /case "inspectPane"/)
    assert.match(goSource, /case "listAgentTeamPanes"/)
    assert.match(goSource, /case "captureCurrentPaneBinding"/)
    assert.match(goSource, /case "listPanesInWindow"/)
    assert.match(goSource, /case "findAgentTeamWindowTarget"/)
    assert.match(goSource, /case "findWindowTargetByName"/)
    assert.match(goSource, /case "sessionExists"/)
    assert.match(goSource, /case "markWindowAsAgentTeam"/)
    assert.match(goSource, /case "refreshWindowPaneLabels"/)
    assert.match(goSource, /case "setPaneLabel"/)
    assert.match(goSource, /case "clearPaneLabel"/)
    assert.match(goSource, /case "createTeammatePane"/)
    assert.match(goSource, /case "createDetachedSwarmSession"/)
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
      assert.deepEqual(health.result.capabilities, ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
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
      assert.equal(profile.result.profile.tmuxSnapshotCaptureConnected, true)
      assert.equal(profile.result.profile.compactReadModelFingerprintConnected, true)
      assert.equal(profile.result.profile.workerLifecycleInspectPaneConnected, true)
      assert.equal(profile.result.profile.workerLifecycleListAgentTeamPanesConnected, true)
      assert.equal(profile.result.profile.workerLifecycleCaptureCurrentPaneBindingConnected, true)
      assert.equal(profile.result.profile.workerLifecycleListPanesInWindowConnected, true)
      assert.equal(profile.result.profile.workerLifecycleFindAgentTeamWindowTargetConnected, true)
      assert.equal(profile.result.profile.workerLifecycleFindWindowTargetByNameConnected, true)
      assert.equal(profile.result.profile.workerLifecycleSessionExistsConnected, true)
      assert.equal(profile.result.profile.workerLifecycleMarkWindowAsAgentTeamConnected, true)
      assert.equal(profile.result.profile.workerLifecycleRefreshWindowPaneLabelsConnected, true)
      assert.equal(profile.result.profile.workerLifecycleSetPaneLabelConnected, true)
      assert.equal(profile.result.profile.workerLifecycleClearPaneLabelConnected, true)
      assert.equal(profile.result.profile.workerLifecycleCreateTeammatePaneConnected, true)
      assert.equal(profile.result.profile.workerLifecycleCreateDetachedSwarmSessionConnected, true)
      assert.equal(profile.result.profile.tmuxAvailabilityConnected, true)
      assert.equal(profile.result.profile.panelConnected, false)
      assert.equal(profile.result.profile.taskReportPlanRunConnected, false)

      const unknownRun = runGoHelper(env.helpers.extRoot, jsonRpcRequest('unknown', undefined, 'go-unknown'))
      assert.equal(unknownRun.status, 0, unknownRun.stderr)
      const unknown = JSON.parse(unknownRun.stdout.trim())
      assert.equal(unknown.error.code, -32601)
    }
  },
}
