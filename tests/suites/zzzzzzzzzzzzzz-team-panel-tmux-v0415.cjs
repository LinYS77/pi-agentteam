const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const EXPECTED_VERSION = '0.6.8'
const MAILBOX_SENTINEL_V0415 = 'V0415_MAILBOX_FULL_TEXT_SENTINEL_MUST_STAY_BEHIND_RECEIVE_BOUNDARY'
const REPORT_SENTINEL_V0415 = 'V0415_TASK_REPORT_FULL_TEXT_SENTINEL_MUST_STAY_BEHIND_REPORT_BOUNDARY'
const CONFIG_SENTINEL_V0415 = 'V0415_CONFIG_FULL_DUMP_SENTINEL_MUST_NOT_LEAK_IN_TEAM_PANEL'

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-panel-tmux-v0415-${name}-`))
  try {
    process.env.PI_AGENTTEAM_HOME = home
    modules.state.invalidateSessionContextCache()
    modules.runtimePanes.invalidatePaneReconcileCache()
    return await fn(home)
  } finally {
    modules.runtimePanes.invalidatePaneReconcileCache()
    modules.state.invalidateSessionContextCache()
    process.env.PI_AGENTTEAM_HOME = previousHome
    fs.rmSync(home, { recursive: true, force: true })
  }
}

async function withTmuxClient(tmuxClientModule, fakeClient, fn) {
  assert.equal(typeof tmuxClientModule.withTmuxClientForTests, 'function', 'tmux/client.js should expose withTmuxClientForTests(fakeClient, fn)')
  return await tmuxClientModule.withTmuxClientForTests(fakeClient, fn)
}

function createCountingTmuxClient(livePaneIds, options = {}) {
  const calls = []
  const listPaneFailures = Math.max(0, options.listPaneFailures ?? 0)
  const missingPaneIds = new Set(options.missingPaneIds ?? [])
  const orphanPaneIds = options.orphanPaneIds ?? []
  let listPaneCalls = 0

  function record(args) {
    calls.push([...args])
  }

  function paneIsLive(paneId) {
    return livePaneIds.has(paneId) && !missingPaneIds.has(paneId)
  }

  function respondDisplayMessage(args) {
    const targetIndex = args.indexOf('-t')
    const paneId = targetIndex >= 0 ? args[targetIndex + 1] : '%current'
    if (!paneIsLive(paneId)) return { ok: false, stdout: '', stderr: `missing ${paneId}` }
    const format = args[args.length - 1] || ''
    if (format.includes('#{session_name}:#{window_id}')) return { ok: true, stdout: 'panel-tmux-v0415:@1' }
    if (format.includes('#{pane_id}')) return { ok: true, stdout: paneId }
    return { ok: true, stdout: paneId }
  }

  function respondListPanes() {
    listPaneCalls += 1
    if (listPaneCalls <= listPaneFailures) return { ok: false, stdout: '', stderr: 'synthetic list-panes failure' }
    const rows = [
      ...Array.from(livePaneIds)
        .filter(paneId => !missingPaneIds.has(paneId))
        .map(paneId => `${paneId}\tpanel-tmux-v0415:@1\tagentteam ${paneId}\tpi`),
      ...orphanPaneIds.map(paneId => `${paneId}\tpanel-tmux-v0415:@9\tagentteam orphan ${paneId}\tpi`),
    ]
    return { ok: true, stdout: rows.join('\n') }
  }

  return {
    calls,
    exec(args) {
      record(args)
      if (args[0] === 'display-message') return respondDisplayMessage(args).stdout
      if (args[0] === 'list-panes') return respondListPanes().stdout
      return ''
    },
    execNoThrow(args) {
      record(args)
      if (args[0] === 'display-message') return respondDisplayMessage(args)
      if (args[0] === 'list-panes') return respondListPanes()
      return { ok: true, stdout: '' }
    },
    async execAsync(args) {
      record(args)
      if (args[0] === 'display-message') return respondDisplayMessage(args).stdout
      if (args[0] === 'list-panes') return respondListPanes().stdout
      return ''
    },
    async execNoThrowAsync(args) {
      record(args)
      if (args[0] === 'display-message') return respondDisplayMessage(args)
      if (args[0] === 'list-panes') return respondListPanes()
      return { ok: true, stdout: '' }
    },
  }
}

function commandCalls(fakeClient, command) {
  return fakeClient.calls.filter(args => args[0] === command)
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeConfig(home) {
  writeJson(path.join(home, 'config.json'), {
    version: 1,
    agents: { implementer: { model: 'v0415-implementer-model' } },
    unknownFullDump: CONFIG_SENTINEL_V0415,
  })
}

function addWorker(modules, team, index, options = {}) {
  const name = options.name ?? `worker-${index}`
  const paneId = `%${team.name}-${index}`
  modules.state.upsertMember(team, {
    name,
    role: index % 2 === 0 ? 'planner' : 'implementer',
    cwd: team.leaderCwd,
    sessionFile: `/tmp/${team.name}-${name}.jsonl`,
    paneId,
    windowTarget: 'panel-tmux-v0415:@1',
    status: options.status ?? 'idle',
  })
  return paneId
}

function addPlanRun(team, taskId) {
  team.planRuns = {
    PR0415: {
      id: 'PR0415',
      status: 'active',
      sourceReportId: 'TR0415-SOURCE',
      sourceReportSummary: 'Compact v0.4.15 source report summary only',
      sourceReportHash: 'compact-source-hash-v0415',
      createdAt: 1700001500500,
      updatedAt: 1700001500600,
      currentStepIndex: 0,
      activeTaskId: taskId,
      steps: [
        {
          id: 'PRS0415-1',
          index: 0,
          title: 'Compact v0.4.15 PlanRun step',
          description: 'PlanRun compact projection must remain visible in /team',
          owner: 'worker-1',
          taskId,
          status: 'assigned',
          createdAt: 1700001500500,
          updatedAt: 1700001500600,
          sourceSummary: 'Compact v0.4.15 step source summary',
        },
      ],
    },
  }
  team.planRunEvents = {
    PRE0415: {
      id: 'PRE0415',
      planRunId: 'PR0415',
      type: 'advanced',
      by: 'team-lead',
      at: 1700001500600,
      summary: 'Compact v0.4.15 PlanRun event summary',
      stepIndex: 0,
      taskId,
      reportId: 'TR0415-SOURCE',
    },
  }
  team.activePlanRunId = 'PR0415'
  team.nextPlanRunSeq = 2
  team.nextPlanRunEventSeq = 2
}

function makePanelTmuxTeam(modules, name, options = {}) {
  modules.state.deleteTeamState(name)
  const team = modules.state.createInitialTeamState({
    teamName: options.rawName ?? name,
    storageName: name,
    leaderSessionFile: `/tmp/${name}-leader.jsonl`,
    leaderCwd: options.leaderCwd ?? `/tmp/panel-tmux-v0415/${name}`,
    description: 'v0.4.15 tmux/panel refresh stability characterization fixture',
  })
  const paneIds = []
  const workerCount = options.workerCount ?? 3
  for (let index = 1; index <= workerCount; index += 1) {
    paneIds.push(addWorker(modules, team, index, options.workerOptions?.[index] ?? {}))
  }
  const task = modules.state.createTask(team, {
    title: 'v0.4.15 panel/tmux characterization task',
    description: 'Task summary must remain compact in /team panel',
    owner: 'worker-1',
  })
  task.updatedAt = 1700001500001
  const report = modules.state.appendTaskReport(team, {
    taskId: task.id,
    type: 'report_done',
    author: 'worker-1',
    text: `${REPORT_SENTINEL_V0415} durable TaskReport full body must require agentteam_task action=report`,
    summary: 'Compact v0.4.15 TaskReport summary',
    createdAt: 1700001500100,
    threadId: `task:${task.id}`,
    reporterIsOwner: true,
    statusAtReport: 'open',
    ownerAtReport: 'worker-1',
    metadata: { fixture: 'v0415' },
  })
  modules.state.appendTaskEvent(team, {
    taskId: task.id,
    type: 'report_submitted',
    by: 'worker-1',
    at: 1700001500101,
    summary: 'Compact v0.4.15 report submitted activity',
    reportId: report.id,
  })
  modules.state.appendTaskMessageRef(team, {
    taskId: task.id,
    mailboxMessageId: `${name}-message-ref-v0415`,
    from: 'team-lead',
    to: 'worker-1',
    type: 'assignment',
    createdAt: 1700001500102,
    threadId: `task:${task.id}`,
    summary: 'Compact v0.4.15 task-bound message ref',
    reportId: report.id,
  })
  addPlanRun(team, task.id)
  modules.state.writeTeamState(team)
  const mailboxMessage = modules.state.pushMailboxMessage(team.name, 'team-lead', {
    id: `${name}-mailbox-v0415`,
    from: 'worker-1',
    to: 'team-lead',
    type: 'report_done',
    priority: 'high',
    taskId: task.id,
    threadId: `task:${task.id}`,
    summary: 'Compact v0.4.15 mailbox summary',
    text: `${MAILBOX_SENTINEL_V0415} full MailboxMessage body must require agentteam_receive`,
    metadata: { reportId: report.id },
    createdAt: 1700001500103,
  })
  modules.runtimePanes.invalidatePaneReconcileCache(team.name)
  return {
    team: modules.state.readTeamState(team.name),
    task,
    report,
    mailboxMessage,
    paneIds,
  }
}

function assertNoFullTextSentinels(label, value, failures) {
  const serialized = JSON.stringify(value)
  if (serialized.includes(MAILBOX_SENTINEL_V0415)) failures.push(`${label} must not expose MailboxMessage.text full-body sentinel`)
  if (serialized.includes(REPORT_SENTINEL_V0415)) failures.push(`${label} must not expose TaskReport.text full-body sentinel`)
}

function assertMailboxUnreadBoundary(modules, teamName, messageId, label, failures) {
  const stored = modules.state.readMailbox(teamName, 'team-lead').find(item => item.id === messageId)
  if (!stored) {
    failures.push(`${label}: mailbox fixture should remain present after /team access`)
    return
  }
  if (stored.readAt !== undefined) failures.push(`${label}: /team should not mark mailbox readAt`)
  if (stored.deliveredAt !== undefined) failures.push(`${label}: /team should not mark mailbox deliveredAt`)
  if (!String(stored.text || '').includes(MAILBOX_SENTINEL_V0415)) failures.push(`${label}: backing mailbox store should retain full text behind receive boundary`)
}

function assertCompactPanelProjection(label, teamModel, failures) {
  const rawKeys = ['taskReports', 'taskEvents', 'taskMessageRefs', 'events', 'mailbox', 'mailboxes', 'teamMailboxes']
    .filter(key => Object.prototype.hasOwnProperty.call(teamModel ?? {}, key))
  if (rawKeys.length > 0) failures.push(`${label} should not include raw full-state collections: ${rawKeys.join(', ')}`)
  if (!teamModel?.config) failures.push(`${label} should preserve compact config projection`)
  if (teamModel?.config && teamModel.config.exists !== true) failures.push(`${label} config projection should include exists=true`)
  if (!Array.isArray(teamModel?.config?.roleModels)) failures.push(`${label} config projection should include roleModels`)
  if (!teamModel?.identity?.teamId) failures.push(`${label} should preserve v0.4.14 identity.teamId projection`)
  if (!teamModel?.identity?.projectKey) failures.push(`${label} should preserve v0.4.14 identity.projectKey projection`)
  if (!Array.isArray(teamModel?.planRuns)) failures.push(`${label} should preserve compact PlanRun projection`)
  if (Array.isArray(teamModel?.planRuns) && !teamModel.planRuns.some(run => run.planRunId === 'PR0415' && run.taskId === 'T001')) {
    failures.push(`${label} should include compact PlanRun PR0415 task hint`)
  }
  const taskHistory = teamModel?.tasks?.T001?.history
  if (!taskHistory || taskHistory.reports < 1 || taskHistory.events < 1 || taskHistory.messageRefs < 1) {
    failures.push(`${label} should preserve compact task history counts/summaries`)
  }
}

function renderPanelLines(modules, helpers, data, stateOverrides = {}) {
  const state = modules.viewModel.createInitialPanelState()
  Object.assign(state, stateOverrides)
  modules.viewModel.clampPanelStateToData(state, data)
  const selection = modules.viewModel.buildPanelSelectionView(data, state)
  return modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), {
    width: 160,
    height: 44,
    data,
    state,
    selection,
  })
}

function createPanelHarness(modules, helpers, teamName) {
  const panelModule = helpers.requireDist('teamPanel.js')
  const requestedRenders = []
  const panels = []
  const doneCalls = []
  const ctx = helpers.createCtx(`/tmp/${teamName}`, `/tmp/${teamName}-leader.jsonl`, [])
  let customCalls = 0
  ctx.ui.custom = async callback => {
    customCalls += 1
    const tui = {
      terminal: { rows: 44, columns: 160 },
      requestRender() {
        requestedRenders.push({ at: requestedRenders.length })
      },
    }
    const done = value => { doneCalls.push(value) }
    const panel = await callback(tui, helpers.createFakeTheme(), {}, done)
    panels.push(panel)
    return doneCalls[doneCalls.length - 1]
  }
  return {
    requestedRenders,
    panels,
    doneCalls,
    get customCalls() { return customCalls },
    async open() {
      await panelModule.openTeamPanel(ctx, teamName)
      assert.ok(panels[0], 'openTeamPanel should create one panel instance through ctx.ui.custom')
      return panels[0]
    },
  }
}

async function flushPanel(panel) {
  if (panel && typeof panel.flushRender === 'function') await panel.flushRender()
}

function runInPlaceRefresh(panel, keys) {
  panel.handleInput('a')
  panel.handleInput(keys.enter)
}

function json(value) {
  return JSON.stringify(value)
}

async function exerciseAttachedWarmRefreshTmuxGate(env, failures) {
  const { modules, helpers } = env
  const tmuxClient = helpers.requireDist('tmux/client.js')
  await withTempHome(modules, 'attached-warm', async () => {
    const fixture = makePanelTmuxTeam(modules, 'panel-tmux-v0415-attached-warm', { workerCount: 5 })
    const fakeClient = createCountingTmuxClient(new Set(fixture.paneIds))
    await withTmuxClient(tmuxClient, fakeClient, async () => {
      const initial = modules.panelDataSource.loadPanelData(fixture.team.name)
      assert.equal(initial.mode, 'attached', 'attached warm fixture should load attached panel data')
      fakeClient.calls.length = 0
      const warm = modules.panelDataSource.loadPanelData(fixture.team.name)
      assert.equal(warm.mode, 'attached', 'attached warm refresh should stay attached')
    })
    const displayCalls = commandCalls(fakeClient, 'display-message')
    const listCalls = commandCalls(fakeClient, 'list-panes')
    if (displayCalls.length > 0) {
      failures.push(`attached warm refresh should not fall back to force/per-member display-message checks; got ${displayCalls.length}: ${json(displayCalls)}`)
    }
    if (listCalls.length > 1) {
      failures.push(`attached warm refresh should use at most one list-panes snapshot; got ${listCalls.length}: ${json(listCalls)}`)
    }
  })
}

async function exerciseGlobalWarmRefreshTmuxGate(env, failures) {
  const { modules, helpers } = env
  const tmuxClient = helpers.requireDist('tmux/client.js')
  await withTempHome(modules, 'global-warm', async () => {
    const fixtures = [
      makePanelTmuxTeam(modules, 'panel-tmux-v0415-global-a', { workerCount: 3 }),
      makePanelTmuxTeam(modules, 'panel-tmux-v0415-global-b', { workerCount: 4 }),
      makePanelTmuxTeam(modules, 'panel-tmux-v0415-global-c', { workerCount: 2 }),
    ]
    const livePaneIds = new Set(fixtures.flatMap(fixture => fixture.paneIds))
    const fakeClient = createCountingTmuxClient(livePaneIds, { orphanPaneIds: ['%panel-tmux-v0415-global-orphan'] })
    await withTmuxClient(tmuxClient, fakeClient, async () => {
      const initial = modules.panelDataSource.loadPanelData(null)
      assert.equal(initial.mode, 'global', 'global warm fixture should load global panel data')
      fakeClient.calls.length = 0
      const warm = modules.panelDataSource.loadPanelData(null)
      assert.equal(warm.mode, 'global', 'global warm refresh should stay global')
      assert.ok(warm.orphanPanes.some(pane => pane.paneId === '%panel-tmux-v0415-global-orphan'), 'global refresh should retain orphan pane discovery from the bounded snapshot')
    })
    const displayCalls = commandCalls(fakeClient, 'display-message')
    const listCalls = commandCalls(fakeClient, 'list-panes')
    if (displayCalls.length > 0) {
      failures.push(`global warm refresh should not perform per-member display-message subprocess checks; got ${displayCalls.length}: ${json(displayCalls)}`)
    }
    if (listCalls.length > 1) {
      failures.push(`global warm refresh should use at most one list-panes snapshot; got ${listCalls.length}: ${json(listCalls)}`)
    }
  })
}

async function exerciseLightVsForceReconcile(env, failures) {
  const { modules, helpers } = env
  const tmuxClient = helpers.requireDist('tmux/client.js')
  const runtimeRepositoryModule = helpers.requireDist('runtime/repository.js')
  const runtimePanesModule = helpers.requireDist('adapters/tmux/teamPanes.js')

  await withTempHome(modules, 'light-intent', async () => {
    const fixture = makePanelTmuxTeam(modules, 'panel-tmux-v0415-light-intent', { workerCount: 2 })
    const calls = []
    const runtimeRepository = {
      ...runtimeRepositoryModule.createRuntimeRepository(),
      prepareTeamForPanel(team, options) {
        calls.push({ teamName: team.name, options })
        return false
      },
      withRuntimeSnapshot(handler) {
        return handler({ capturedAt: 1700001501000, panes: [], byPaneId: {}, ok: true })
      },
      listAgentTeamPanes() { return [] },
    }
    const data = modules.panelDataSource.loadPanelData(fixture.team.name, {
      stateRepository: helpers.requireDist('state/repository.js').createStateRepository(),
      runtimeRepository,
    })
    assert.equal(data.mode, 'attached', 'ordinary attached panel refresh should load attached data')
    if (calls.length !== 1) failures.push(`ordinary attached panel refresh should call prepareTeamForPanel once, got ${calls.length}`)
    const options = calls[0]?.options
    if (!options || options.mode !== 'light' || options.force) {
      failures.push(`ordinary attached panel refresh should pass light reconcile intent, got ${json(options)}`)
    }
  })

  await withTempHome(modules, 'force-intent', async () => {
    const fixture = makePanelTmuxTeam(modules, 'panel-tmux-v0415-force-intent', { workerCount: 2 })
    const originalResolvePaneBinding = modules.tmux.resolvePaneBinding
    const resolveCalls = []
    modules.tmux.resolvePaneBinding = paneId => {
      resolveCalls.push(paneId)
      return paneId ? { paneId, target: 'panel-tmux-v0415:@1' } : null
    }
    try {
      const team = modules.state.readTeamState(fixture.team.name)
      assert.ok(team, 'force-intent fixture should exist')
      runtimePanesModule.reconcileTeamPanes(team, { mode: 'force' })
    } finally {
      modules.tmux.resolvePaneBinding = originalResolvePaneBinding
    }
    if (resolveCalls.length < fixture.paneIds.length) {
      failures.push(`explicit force reconcile should remain the path that allows expensive per-pane checks; expected >=${fixture.paneIds.length} got ${resolveCalls.length}`)
    }
  })

  await withTempHome(modules, 'snapshot-failure', async () => {
    const fixture = makePanelTmuxTeam(modules, 'panel-tmux-v0415-snapshot-failure', { workerCount: 1 })
    const fakeClient = createCountingTmuxClient(new Set(fixture.paneIds), { listPaneFailures: 1 })
    await withTmuxClient(tmuxClient, fakeClient, async () => {
      const data = modules.panelDataSource.loadPanelData(fixture.team.name)
      assert.equal(data.mode, 'attached', 'snapshot failure fixture should still load attached data')
    })
    const stored = modules.state.readTeamState(fixture.team.name)
    const worker = stored?.members['worker-1']
    if (!worker?.paneId || worker.status === 'error' || String(worker.lastError || '').includes('pane disappeared')) {
      failures.push(`light snapshot failure should not automatically mark active panes lost; worker after load: ${json(worker)}`)
    }
  })
}

async function exerciseRenderCoalescing(env, failures) {
  const { modules, helpers } = env
  const keys = helpers.tuiKeys
  await withTempHome(modules, 'render-coalescing', async () => {
    const fixture = makePanelTmuxTeam(modules, 'panel-tmux-v0415-render-coalescing', { workerCount: 2 })
    const harness = createPanelHarness(modules, helpers, fixture.team.name)
    const panel = await harness.open()
    panel.render(160)

    for (let index = 0; index < 20; index += 1) {
      panel.invalidate({ source: 'worker-output', memberName: 'worker-1', sequence: index })
    }
    await flushPanel(panel)
    if (harness.requestedRenders.length > 1) {
      failures.push(`worker-output-like/no-semantic invalidations should coalesce to <=1 requestRender, got ${harness.requestedRenders.length}`)
    }

    panel.handleInput('a')
    await flushPanel(panel)
    const beforeNoDiffRefresh = harness.requestedRenders.length
    panel.handleInput(keys.enter)
    await flushPanel(panel)
    const noDiffRefreshRenders = harness.requestedRenders.length - beforeNoDiffRefresh
    if (noDiffRefreshRenders !== 0) {
      failures.push(`no-diff in-place refresh should not requestRender repeatedly, got ${noDiffRefreshRenders}`)
    }

    panel.handleInput('a')
    await flushPanel(panel)
    const beforeSemanticChange = harness.requestedRenders.length
    modules.state.updateTeamState(fixture.team.name, team => {
      team.tasks[fixture.task.id].title = 'v0.4.15 semantic render change'
    })
    panel.handleInput(keys.enter)
    await flushPanel(panel)
    const semanticRenders = harness.requestedRenders.length - beforeSemanticChange
    if (semanticRenders < 1) {
      failures.push('semantic panel data changes should still requestRender')
    }
  })
}

async function exercisePanelActionNoCloseReopen(env, failures) {
  const { modules, helpers } = env
  const keys = helpers.tuiKeys
  await withTempHome(modules, 'panel-action', async () => {
    const fixture = makePanelTmuxTeam(modules, 'panel-tmux-v0415-panel-action', { workerCount: 2 })
    const refreshHarness = createPanelHarness(modules, helpers, fixture.team.name)
    const refreshPanel = await refreshHarness.open()
    runInPlaceRefresh(refreshPanel, keys)
    await flushPanel(refreshPanel)
    if (refreshHarness.customCalls !== 1) failures.push(`in-place refresh should not close/reopen custom panel; ctx.ui.custom calls ${refreshHarness.customCalls}`)
    if (refreshHarness.doneCalls.length !== 0) failures.push(`in-place refresh should not call done; done calls: ${json(refreshHarness.doneCalls)}`)

    const syncHarness = createPanelHarness(modules, helpers, fixture.team.name)
    const syncPanel = await syncHarness.open()
    syncPanel.handleInput('a')
    syncPanel.handleInput(keys.down)
    syncPanel.handleInput(keys.enter)
    await flushPanel(syncPanel)
    if (syncHarness.customCalls !== 1) failures.push(`in-place sync should not close/reopen custom panel; ctx.ui.custom calls ${syncHarness.customCalls}`)
    if (syncHarness.doneCalls.length !== 0) failures.push(`in-place sync should not call done; done calls: ${json(syncHarness.doneCalls)}`)

    const closeHarness = createPanelHarness(modules, helpers, fixture.team.name)
    const closePanel = await closeHarness.open()
    closePanel.handleInput('q')
    if (!closeHarness.doneCalls.some(call => call?.type === 'close')) failures.push('q should still close the panel through done({ type: close })')
  })
}

async function exerciseBoundaryPreservation(env, failures) {
  const { modules, helpers } = env
  const fingerprint = helpers.requireDist('teamPanel/fingerprint.js')
  const stateRepositoryModule = helpers.requireDist('state/repository.js')
  const runtimeRepositoryModule = helpers.requireDist('runtime/repository.js')

  await withTempHome(modules, 'boundary', async home => {
    writeConfig(home)
    const attachedFixture = makePanelTmuxTeam(modules, 'panel-tmux-v0415-boundary-attached', { workerCount: 2 })
    makePanelTmuxTeam(modules, 'panel-tmux-v0415-boundary-global', { workerCount: 1 })
    const stateRepository = stateRepositoryModule.createStateRepository()
    const markDeliveredCalls = []
    const markReadCalls = []
    const spyRepository = {
      ...stateRepository,
      markMailboxMessagesDelivered(teamName, memberName, ids) {
        markDeliveredCalls.push({ teamName, memberName, ids: [...ids] })
        return stateRepository.markMailboxMessagesDelivered(teamName, memberName, ids)
      },
      markMailboxMessagesRead(teamName, memberName, ids) {
        markReadCalls.push({ teamName, memberName, ids: [...ids] })
        return stateRepository.markMailboxMessagesRead(teamName, memberName, ids)
      },
    }
    const runtimeRepository = {
      ...runtimeRepositoryModule.createRuntimeRepository(),
      withRuntimeSnapshot(handler) {
        return handler({ capturedAt: 1700001502000, panes: [], byPaneId: {}, ok: true })
      },
      listAgentTeamPanes() { return [] },
      prepareTeamForPanel(team, options) {
        return runtimeRepositoryModule.reconcileTeamPanes(team, { ...(options || {}), snapshot: { capturedAt: 1700001502000, panes: [], byPaneId: {}, ok: true } })
      },
    }

    const attachedData = modules.panelDataSource.loadPanelData(attachedFixture.team.name, { stateRepository: spyRepository, runtimeRepository })
    assert.equal(attachedData.mode, 'attached', 'boundary fixture should load attached panel data')
    const attachedRender = renderPanelLines(modules, helpers, attachedData, { focus: 'mailbox', selectedIndex: 0, mailboxSelectedIndex: 0 }).join('\n')
    const attachedFingerprint = fingerprint.panelDataFingerprint(attachedData)
    assertNoFullTextSentinels('attached /team loadPanelData JSON', attachedData, failures)
    assertNoFullTextSentinels('attached /team render output', attachedRender, failures)
    assertNoFullTextSentinels('attached /team panelDataFingerprint', attachedFingerprint, failures)
    if (json(attachedData).includes(CONFIG_SENTINEL_V0415) || attachedRender.includes(CONFIG_SENTINEL_V0415) || attachedFingerprint.includes(CONFIG_SENTINEL_V0415)) {
      failures.push('/team should preserve compact config projection without leaking arbitrary config full-dump sentinel')
    }
    if (attachedData.mailbox.some(item => Object.prototype.hasOwnProperty.call(item, 'text'))) {
      failures.push('attached /team mailbox projection should not include MailboxMessage.text')
    }
    assertCompactPanelProjection('attached /team panel model', attachedData.team, failures)
    assertMailboxUnreadBoundary(modules, attachedFixture.team.name, attachedFixture.mailboxMessage.id, 'attached /team boundary', failures)

    const globalData = modules.panelDataSource.loadPanelData(null, { stateRepository: spyRepository, runtimeRepository })
    assert.equal(globalData.mode, 'global', 'boundary fixture should load global panel data')
    const globalRender = renderPanelLines(modules, helpers, globalData, { focus: 'teams', selectedIndex: 0, teamsSelectedIndex: 0 }).join('\n')
    const globalFingerprint = fingerprint.panelDataFingerprint(globalData)
    assertNoFullTextSentinels('global /team loadPanelData JSON', globalData, failures)
    assertNoFullTextSentinels('global /team render output', globalRender, failures)
    assertNoFullTextSentinels('global /team panelDataFingerprint', globalFingerprint, failures)
    if (json(globalData).includes(CONFIG_SENTINEL_V0415) || globalRender.includes(CONFIG_SENTINEL_V0415) || globalFingerprint.includes(CONFIG_SENTINEL_V0415)) {
      failures.push('global /team should preserve compact config projection without leaking arbitrary config full-dump sentinel')
    }
    for (const team of globalData.teams) assertCompactPanelProjection(`global /team panel model ${team.name}`, team, failures)
    for (const [teamName, mailbox] of Object.entries(globalData.teamMailboxes ?? {})) {
      if (mailbox.latestAttention && Object.prototype.hasOwnProperty.call(mailbox.latestAttention, 'text')) {
        failures.push(`global teamMailboxes.${teamName}.latestAttention should not include MailboxMessage.text`)
      }
    }

    if (markReadCalls.length > 0) failures.push(`/team should not call markMailboxMessagesRead; calls: ${json(markReadCalls)}`)
    if (markDeliveredCalls.length > 0) failures.push(`/team should not call markMailboxMessagesDelivered; calls: ${json(markDeliveredCalls)}`)
    assertMailboxUnreadBoundary(modules, attachedFixture.team.name, attachedFixture.mailboxMessage.id, 'global /team boundary', failures)
  })
}

function exercisePackageVersionGuard(env, failures) {
  const pkg = JSON.parse(fs.readFileSync(path.join(env.helpers.extRoot, 'package.json'), 'utf8'))
  if (pkg.version !== EXPECTED_VERSION) failures.push(`package version should remain ${EXPECTED_VERSION}, got ${pkg.version}`)
}

module.exports = {
  name: 'team panel tmux v0.4.15 RED characterization',
  async run(env) {
    const failures = []
    await exerciseAttachedWarmRefreshTmuxGate(env, failures)
    await exerciseGlobalWarmRefreshTmuxGate(env, failures)
    await exerciseLightVsForceReconcile(env, failures)
    await exerciseRenderCoalescing(env, failures)
    await exercisePanelActionNoCloseReopen(env, failures)
    await exerciseBoundaryPreservation(env, failures)
    exercisePackageVersionGuard(env, failures)

    assert.equal(failures.length, 0, `v0.4.15 tmux/panel RED expectations not met:\n${failures.join('\n\n')}`)
  },
}
