const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const EXPECTED_VERSION = '0.6.8'

async function withTempHomeAndCutover(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const previousKernel = process.env.PI_AGENTTEAM_KERNEL
  const previousHelper = process.env.PI_AGENTTEAM_KERNEL_HELPER
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-v0420-cutover-refresh-${name}-`))
  try {
    process.env.PI_AGENTTEAM_HOME = home
    process.env.PI_AGENTTEAM_KERNEL = 'go-cutover'
    process.env.PI_AGENTTEAM_KERNEL_HELPER = path.join(home, 'missing-go-cutover-helper')
    modules.state.invalidateSessionContextCache()
    modules.runtimePanes.invalidatePaneReconcileCache()
    return await fn(home)
  } finally {
    modules.runtimePanes.invalidatePaneReconcileCache()
    modules.state.invalidateSessionContextCache()
    process.env.PI_AGENTTEAM_HOME = previousHome
    if (previousKernel === undefined) delete process.env.PI_AGENTTEAM_KERNEL
    else process.env.PI_AGENTTEAM_KERNEL = previousKernel
    if (previousHelper === undefined) delete process.env.PI_AGENTTEAM_KERNEL_HELPER
    else process.env.PI_AGENTTEAM_KERNEL_HELPER = previousHelper
    fs.rmSync(home, { recursive: true, force: true })
  }
}

async function withTmuxClient(tmuxClientModule, fakeClient, fn) {
  assert.equal(typeof tmuxClientModule.withTmuxClientForTests, 'function', 'tmux/client.js should expose withTmuxClientForTests')
  return await tmuxClientModule.withTmuxClientForTests(fakeClient, fn)
}

async function withCoreListAgentTeamPanes(modules, coreTmux, fn) {
  const previous = modules.tmux.listAgentTeamPanes
  modules.tmux.listAgentTeamPanes = coreTmux.listAgentTeamPanes
  try {
    return await fn()
  } finally {
    modules.tmux.listAgentTeamPanes = previous
  }
}

function createSequencedTmuxClient(listPaneResponses) {
  const calls = []
  let listPaneIndex = 0
  function record(args) {
    calls.push([...args])
  }
  function nextListPanes() {
    const response = listPaneResponses[Math.min(listPaneIndex, listPaneResponses.length - 1)] ?? { ok: true, stdout: '' }
    listPaneIndex += 1
    return { ...response }
  }
  function displayMessage(args) {
    const targetIndex = args.indexOf('-t')
    const paneId = targetIndex >= 0 ? args[targetIndex + 1] : '%current'
    return { ok: true, stdout: String(paneId || '%current') }
  }
  return {
    calls,
    exec(args) {
      record(args)
      if (args[0] === 'list-panes') return nextListPanes().stdout
      if (args[0] === 'display-message') return displayMessage(args).stdout
      return ''
    },
    execNoThrow(args) {
      record(args)
      if (args[0] === 'list-panes') return nextListPanes()
      if (args[0] === 'display-message') return displayMessage(args)
      return { ok: true, stdout: '' }
    },
    async execAsync(args) {
      record(args)
      if (args[0] === 'list-panes') return nextListPanes().stdout
      if (args[0] === 'display-message') return displayMessage(args).stdout
      return ''
    },
    async execNoThrowAsync(args) {
      record(args)
      if (args[0] === 'list-panes') return nextListPanes()
      if (args[0] === 'display-message') return displayMessage(args)
      return { ok: true, stdout: '' }
    },
  }
}

function commandCalls(fakeClient, command) {
  return fakeClient.calls.filter(args => args[0] === command)
}

function paneRows(rows) {
  return rows.map(row => `${row.paneId}\t${row.target}\t${row.label}\t${row.currentCommand ?? 'pi'}`).join('\n')
}

function createTeamWithWorker(modules, name, workerName = 'worker-1') {
  modules.state.deleteTeamState(name)
  const team = modules.state.createInitialTeamState({
    teamName: name,
    storageName: name,
    leaderCwd: `/tmp/${name}`,
    leaderSessionFile: `/tmp/${name}-leader.jsonl`,
    description: 'v0.4.20 go-cutover refresh safety fixture',
  })
  modules.state.upsertMember(team, {
    name: workerName,
    role: 'implementer',
    cwd: team.leaderCwd,
    sessionFile: `/tmp/${name}-${workerName}.jsonl`,
    paneId: `%${name}-${workerName}`,
    windowTarget: 'cutover-refresh:@1',
    status: 'running',
    lastWakeReason: 'working normally',
    lastError: 'preexisting non-pane warning',
  })
  modules.state.writeTeamState(team)
  modules.runtimePanes.invalidatePaneReconcileCache(team.name)
  return modules.state.readTeamState(team.name)
}

function memberSnapshot(team, workerName = 'worker-1') {
  const member = team?.members?.[workerName]
  assert.ok(member, `fixture member ${workerName} should exist`)
  return {
    paneId: member.paneId,
    windowTarget: member.windowTarget,
    status: member.status,
    lastWakeReason: member.lastWakeReason,
    lastError: member.lastError,
    updatedAt: member.updatedAt,
  }
}

function assertSameMemberSafety(before, after, label) {
  assert.deepEqual(after, before, `${label} must not destructively mutate member state`)
  assert.equal(String(after.lastWakeReason || '').includes('pane lost'), false, `${label} must not write pane lost wake reason`)
  assert.equal(String(after.lastError || '').includes('pane disappeared'), false, `${label} must not write tmux pane disappeared error`)
}

function assertUnavailableSnapshot(snapshot, label) {
  assert.equal(snapshot.ok, false, `${label} must be ok:false`)
  assert.equal(snapshot.status, 'unknown', `${label} must be unknown`)
  assert.equal(snapshot.resultMarker, 'stale', `${label} must be stale`)
  assert.deepEqual(snapshot.panes, [], `${label} must not expose false parsed panes`)
  assert.deepEqual(snapshot.byPaneId, {}, `${label} must not expose false parsed pane index`)
  assert.notEqual(snapshot.ok, true, `${label} must not be ok:true empty snapshot`)
}

function createRuntimeRepository(runtimeRepositoryModule, snapshot, fallbackPanes = []) {
  const prepareCalls = []
  const listCalls = []
  return {
    ...runtimeRepositoryModule.createRuntimeRepository(),
    prepareCalls,
    listCalls,
    withRuntimeSnapshot(handler) {
      return handler(snapshot)
    },
    prepareTeamForPanel(team, options) {
      prepareCalls.push({ teamName: team.name, options })
      return runtimeRepositoryModule.reconcileTeamPanes(team, { ...(options || {}), snapshot })
    },
    listAgentTeamPanes(listSnapshot) {
      listCalls.push({ snapshot: listSnapshot })
      return listSnapshot ? [] : fallbackPanes
    },
  }
}

async function assertOrphanDiscoverySnapshotSelection(env) {
  const { modules, helpers } = env
  const runtimeRepositoryModule = helpers.requireDist('runtime/repository.js')
  const stateRepository = helpers.requireDist('state/repository.js').createStateRepository()
  const fallbackPane = {
    paneId: '%v0420-generic-fallback-orphan',
    target: 'cutover-refresh:@9',
    label: 'agentteam generic fallback orphan',
    currentCommand: 'pi',
  }

  await withTempHomeAndCutover(modules, 'generic-unknown-stale-orphan-fallback', async () => {
    const team = createTeamWithWorker(modules, 'v0420-generic-unknown-stale')
    const before = memberSnapshot(team)
    const genericUnknownStale = {
      capturedAt: 1700004000100,
      panes: [],
      byPaneId: {},
      ok: false,
      status: 'unknown',
      resultMarker: 'stale',
      error: 'generic capture failure',
    }
    const runtimeRepository = createRuntimeRepository(runtimeRepositoryModule, genericUnknownStale, [fallbackPane])
    const data = modules.panelDataSource.loadPanelData(null, { stateRepository, runtimeRepository })
    assert.equal(runtimeRepository.listCalls.length, 1, 'generic unknown/stale should still run explicit live orphan discovery')
    assert.equal(runtimeRepository.listCalls[0].snapshot, undefined, 'generic unknown/stale without cutover markers should pass undefined')
    assert.deepEqual(data.orphanPanes, [fallbackPane], 'generic unknown/stale should preserve prior explicit orphan fallback behavior')
    assertSameMemberSafety(before, memberSnapshot(modules.state.readTeamState(team.name)), 'generic unknown/stale refresh')
  })

  await withTempHomeAndCutover(modules, 'cutover-marked-orphan-no-fallback', async () => {
    const team = createTeamWithWorker(modules, 'v0420-cutover-marked')
    const before = memberSnapshot(team)
    const cutoverUnavailable = {
      capturedAt: 1700004000200,
      panes: [],
      byPaneId: {},
      ok: false,
      status: 'unknown',
      resultMarker: 'stale',
      module: 'tmuxSnapshotParse',
      capability: 'tmuxSnapshotParse',
      cutoverFailureKind: 'missing-helper',
      reason: 'Go kernel cutover unavailable (missing-helper)',
      error: 'Go kernel cutover unavailable (missing-helper)',
    }
    const runtimeRepository = createRuntimeRepository(runtimeRepositoryModule, cutoverUnavailable, [fallbackPane])
    const data = modules.panelDataSource.loadPanelData(null, { stateRepository, runtimeRepository })
    assert.equal(runtimeRepository.listCalls.length, 1, 'cutover parser-unavailable should still make bounded orphan discovery call')
    assert.equal(runtimeRepository.listCalls[0].snapshot, cutoverUnavailable, 'cutover parser-unavailable should pass snapshot, not undefined')
    assert.deepEqual(data.orphanPanes, [], 'cutover parser-unavailable should not surface hidden TypeScript fallback orphan panes')
    assertSameMemberSafety(before, memberSnapshot(modules.state.readTeamState(team.name)), 'cutover marked unavailable refresh')
  })
}

async function assertAttachedLightRefreshSafety(env) {
  const { modules, helpers } = env
  const tmuxClientModule = helpers.requireDist('tmux/client.js')
  const knownPane = {
    paneId: '%v0420-cutover-attached-worker-1',
    target: 'cutover-refresh:@1',
    label: 'agentteam worker attached',
    currentCommand: 'pi',
  }
  const fakeClient = createSequencedTmuxClient([
    { ok: true, stdout: paneRows([knownPane]) },
  ])

  await withTempHomeAndCutover(modules, 'attached', async () => {
    await withTmuxClient(tmuxClientModule, fakeClient, async () => {
      const team = createTeamWithWorker(modules, 'v0420-cutover-attached')
      const before = memberSnapshot(team)
      const data = modules.panelDataSource.loadPanelData(team.name)
      assert.equal(data.mode, 'attached', 'attached panel should still load')
      const after = memberSnapshot(modules.state.readTeamState(team.name))
      assertSameMemberSafety(before, after, 'attached go-cutover parser-unavailable refresh')
      assert.equal(data.team.members['worker-1'].paneId, before.paneId, 'attached panel model should preserve paneId')
      assert.equal(data.team.members['worker-1'].windowTarget, before.windowTarget, 'attached panel model should preserve windowTarget')
      assert.equal(data.team.members['worker-1'].status, before.status, 'attached panel model should preserve worker status')
      assert.equal(commandCalls(fakeClient, 'list-panes').length, 0, 'post-v0.6.49 Go capture should not call the TypeScript tmux fake client')
      assert.equal(commandCalls(fakeClient, 'display-message').length, 0, 'attached parser-unavailable refresh must not heal pane bindings via live display-message')
      assert.equal(commandCalls(fakeClient, 'kill-pane').length, 0, 'attached parser-unavailable refresh must not kill panes')
    })
  })
}

async function assertGlobalParserFailureSafety(env) {
  const { modules, helpers } = env
  const tmuxClientModule = helpers.requireDist('tmux/client.js')
  const coreTmux = helpers.requireDist('tmux/core.js')
  const knownPane = {
    paneId: '%v0420-cutover-global-a-worker-1',
    target: 'cutover-refresh:@1',
    label: 'agentteam known worker',
    currentCommand: 'pi',
  }
  const orphanPane = {
    paneId: '%v0420-cutover-hidden-orphan',
    target: 'cutover-refresh:@9',
    label: 'agentteam hidden orphan should not surface',
    currentCommand: 'pi',
  }
  const fakeClient = createSequencedTmuxClient([
    { ok: true, stdout: paneRows([knownPane, orphanPane]) },
    { ok: true, stdout: paneRows([knownPane, orphanPane]) },
  ])

  await withTempHomeAndCutover(modules, 'global-parser-failure', async () => {
    await withCoreListAgentTeamPanes(modules, coreTmux, async () => {
      await withTmuxClient(tmuxClientModule, fakeClient, async () => {
        const team = createTeamWithWorker(modules, 'v0420-cutover-global-a')
        const before = memberSnapshot(team)
        const data = modules.panelDataSource.loadPanelData(null)
        assert.equal(data.mode, 'global', 'global panel should load')
        assert.deepEqual(data.orphanPanes, [], 'global orphan discovery must not surface panes through hidden TypeScript parser fallback after go-cutover parser failure')
        const after = memberSnapshot(modules.state.readTeamState(team.name))
        assertSameMemberSafety(before, after, 'global go-cutover parser-unavailable refresh')
        const panelTeam = data.teams.find(item => item.name === team.name)
        assert.ok(panelTeam, 'global panel should include team')
        assert.equal(panelTeam.members['worker-1'].paneId, before.paneId, 'global panel model should preserve known paneId')
        assert.equal(panelTeam.members['worker-1'].windowTarget, before.windowTarget, 'global panel model should preserve known windowTarget')
        assert.equal(panelTeam.members['worker-1'].status, before.status, 'global panel model should preserve status')
        assert.equal(commandCalls(fakeClient, 'list-panes').length, 0, 'global parser failure must not re-enter TypeScript fake-client pane parsing after Go capture cutover')
        assert.equal(commandCalls(fakeClient, 'display-message').length, 0, 'global parser-unavailable refresh must not heal pane bindings via live display-message')
        assert.equal(commandCalls(fakeClient, 'kill-pane').length, 0, 'global parser-unavailable refresh must not kill panes')
      })
    })
  })
}

async function assertCaptureFailureSafety(env) {
  const { modules, helpers } = env
  const tmuxClientModule = helpers.requireDist('tmux/client.js')
  const snapshotModule = helpers.requireDist('tmux/snapshot.js')
  const coreTmux = helpers.requireDist('tmux/core.js')
  const knownPane = {
    paneId: '%v0420-cutover-capture-worker-1',
    target: 'cutover-refresh:@1',
    label: 'agentteam known worker',
    currentCommand: 'pi',
  }
  const fakeClient = createSequencedTmuxClient([
    { ok: false, stdout: '', stderr: 'synthetic capture failure' },
    { ok: false, stdout: '', stderr: 'synthetic capture failure again' },
    { ok: false, stdout: '', stderr: 'synthetic capture failure for global' },
    { ok: true, stdout: paneRows([knownPane]) },
  ])

  await withTempHomeAndCutover(modules, 'capture-failure', async () => {
    await withCoreListAgentTeamPanes(modules, coreTmux, async () => {
      await withTmuxClient(tmuxClientModule, fakeClient, async () => {
        const direct = snapshotModule.captureTmuxSnapshot(1700004000001)
        assert.equal(direct.capturedAt, 1700004000001, 'direct Go capture should preserve capturedAt')
        assert.equal(direct.ok === true || direct.ok === false, true, 'direct Go capture should return a shaped snapshot')
        if (direct.ok === false) assertUnavailableSnapshot(direct, 'direct Go capture failure')
        assert.equal(JSON.stringify(direct).includes('synthetic capture failure'), false, 'Go capture failure must not read or leak TypeScript fake-client stderr')

        const team = createTeamWithWorker(modules, 'v0420-cutover-capture')
        const before = memberSnapshot(team)
        const data = modules.panelDataSource.loadPanelData(null)
        assert.equal(data.mode, 'global', 'global panel should still load after capture failure')
        assert.deepEqual(data.orphanPanes, [], 'capture failure must not become false successful empty universe or hidden parser success')
        const after = memberSnapshot(modules.state.readTeamState(team.name))
        assertSameMemberSafety(before, after, 'global capture-unavailable refresh')
        assert.equal(commandCalls(fakeClient, 'display-message').length, 0, 'capture failure refresh must not heal pane bindings via live display-message')
        assert.equal(commandCalls(fakeClient, 'kill-pane').length, 0, 'capture failure refresh must not kill panes')
      })
    })
  })
}

module.exports = {
  name: 'Go kernel v0.4.20 refresh safety under go-cutover',
  async run(env) {
    await assertOrphanDiscoverySnapshotSelection(env)
    await assertAttachedLightRefreshSafety(env)
    await assertGlobalParserFailureSafety(env)
    await assertCaptureFailureSafety(env)

    const root = env.helpers.extRoot
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    assert.equal(packageJson.version, EXPECTED_VERSION, 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist for v0.4.20 refresh safety`)
    }
  },
}
