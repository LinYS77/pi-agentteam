const assert = require('node:assert/strict')

function makePanelStabilityTeam(modules, name) {
  modules.state.deleteTeamState(name)
  const team = modules.state.createInitialTeamState({
    teamName: name,
    leaderSessionFile: `/tmp/${name}-leader.jsonl`,
    leaderCwd: `/tmp/${name}`,
    description: 'v0.4.4 panel cache characterization fixture',
  })
  for (let index = 0; index < 3; index += 1) {
    modules.state.upsertMember(team, {
      name: `worker-${index + 1}`,
      role: 'implementer',
      cwd: `/tmp/${name}`,
      sessionFile: `/tmp/${name}-worker-${index + 1}.jsonl`,
      paneId: `%${name}-${index + 1}`,
      windowTarget: 'panel-cache:@1',
      status: 'idle',
    })
  }
  const task = modules.state.createTask(team, {
    title: 'Panel cache stability task',
    description: 'Panel cache fixture task description',
  })
  modules.state.createTask(team, {
    title: 'Panel cache second task',
    description: 'Second task keeps list navigation state-changing for render-gating tests',
  })
  modules.state.writeTeamState(team)
  modules.runtimePanes.invalidatePaneReconcileCache(name)
  return { team, task }
}

function createPanelHarness(modules, helpers, teamName) {
  const panel = helpers.requireDist('teamPanel.js')
  const requestedRenders = []
  const panels = []
  const ctx = helpers.createCtx(`/tmp/${teamName}`, `/tmp/${teamName}-leader.jsonl`, [])
  ctx.ui.custom = async callback => {
    let doneValue
    const tui = {
      terminal: { rows: 40, columns: 140 },
      requestRender() {
        requestedRenders.push({ at: requestedRenders.length })
      },
    }
    const done = value => { doneValue = value }
    const panelInstance = await callback(tui, helpers.createFakeTheme(), {}, done)
    panels.push(panelInstance)
    return doneValue
  }
  return {
    ctx,
    panels,
    requestedRenders,
    async open() {
      await panel.openTeamPanel(ctx, teamName)
      assert.ok(panels[0], 'openTeamPanel should create a panel instance through ctx.ui.custom')
      return panels[0]
    },
  }
}

function buildSelection(modules, data, state) {
  modules.viewModel.clampPanelStateToData(state, data)
  return modules.viewModel.buildPanelSelectionView(data, state)
}

function sendInput(modules, data, state, input, deps) {
  const selection = buildSelection(modules, data, state)
  modules.input.handleTeamPanelInput(input, data, state, selection, deps)
}

function panelDataFingerprint(data) {
  if (data.mode === 'attached') {
    return JSON.stringify({
      mode: data.mode,
      team: data.team.name,
      revision: data.team.revision,
      members: data.members.map(member => [member.name, member.status, member.paneId, member.windowTarget]),
      tasks: data.tasks.map(task => [task.id, task.status, task.owner, task.updatedAt]),
      mailbox: data.mailbox.map(item => [item.id, item.type, item.readAt, item.deliveredAt, item.summary]),
    })
  }
  return JSON.stringify({
    mode: data.mode,
    teams: data.teams.map(team => [team.name, team.revision, team.identity?.teamId]),
    orphanPanes: data.orphanPanes.map(pane => [pane.paneId, pane.target, pane.label, pane.currentCommand]),
  })
}

async function assertTmuxSnapshotRegressionStillGreen(env) {
  const { modules, helpers } = env
  const tmuxClient = helpers.requireDist('tmux/client.js')
  const livePaneIds = new Set(['%panel-cache-snapshot-1', '%panel-cache-snapshot-2'])
  const fakeClient = {
    calls: [],
    exec() { return '' },
    execNoThrow(args) {
      this.calls.push([...args])
      if (args[0] === 'list-panes') {
        return { ok: true, stdout: Array.from(livePaneIds).map(paneId => `${paneId}\tpanel-cache:@1\tagentteam ${paneId}\tpi`).join('\n') }
      }
      if (args[0] === 'display-message') return { ok: true, stdout: args.includes('#{session_name}:#{window_id}') ? 'panel-cache:@1' : args[args.indexOf('-t') + 1] }
      return { ok: true, stdout: '' }
    },
    async execAsync() { return '' },
    async execNoThrowAsync(args) { return this.execNoThrow(args) },
  }
  assert.equal(typeof tmuxClient.withTmuxClientForTests, 'function', 'tmux fake-client seam should remain available')

  modules.state.deleteTeamState('panel-cache-snapshot-suite')
  const team = modules.state.createInitialTeamState({
    teamName: 'panel-cache-snapshot-suite',
    leaderSessionFile: '/tmp/panel-cache-snapshot-suite-leader.jsonl',
    leaderCwd: '/tmp/panel-cache-snapshot-suite',
  })
  let index = 0
  for (const paneId of livePaneIds) {
    index += 1
    modules.state.upsertMember(team, {
      name: `snapshot-worker-${index}`,
      role: 'implementer',
      cwd: '/tmp/panel-cache-snapshot-suite',
      sessionFile: `/tmp/panel-cache-snapshot-suite-worker-${index}.jsonl`,
      paneId,
      windowTarget: 'panel-cache:@1',
      status: 'idle',
    })
  }
  modules.state.writeTeamState(team)
  modules.runtimePanes.invalidatePaneReconcileCache(team.name)

  await tmuxClient.withTmuxClientForTests(fakeClient, async () => {
    const data = modules.panelDataSource.loadPanelData(team.name)
    assert.equal(data.mode, 'attached', 'snapshot regression fixture should load attached data')
  })

  assert.equal(fakeClient.calls.filter(args => args[0] === 'display-message').length, 0, 'v0.4.3 regression: attached panel load should not use per-member display-message')
  assert.ok(fakeClient.calls.filter(args => args[0] === 'list-panes').length <= 1, 'v0.4.3 regression: attached panel load should use at most one list-panes snapshot')
}

module.exports = {
  name: 'team panel cache v0.4.4 characterization',
  async run(env) {
    const { modules, helpers } = env
    modules.input = helpers.requireDist('teamPanel/input.js')
    const keys = helpers.tuiKeys
    const { team, task } = makePanelStabilityTeam(modules, 'panel-cache-v044-suite')
    const mailboxMessage = modules.state.pushMailboxMessage(team.name, 'team-lead', {
      from: 'worker-1',
      to: 'team-lead',
      type: 'report_done',
      summary: 'Panel cache mailbox boundary fixture',
      text: 'v0.4.4 full mailbox body sentinel must not be rendered or marked read by panel cache/diff tests',
      taskId: task.id,
    })

    const data = modules.panelDataSource.loadPanelData(team.name)
    const state = modules.viewModel.createInitialPanelState()
    state.focus = 'tasks'
    state.selectedIndex = 0
    state.tasksSelectedIndex = 0
    buildSelection(modules, data, state)

    const theme = helpers.createFakeTheme()
    const selection = modules.viewModel.buildPanelSelectionView(data, state)
    const firstLines = modules.layout.renderTeamPanelLines(theme, { width: 140, height: 36, data, state, selection })
    const secondLines = modules.layout.renderTeamPanelLines(theme, { width: 140, height: 36, data, state, selection })
    assert.deepEqual(secondLines, firstLines, 'GREEN: render output should be stable for identical data/state/width')
    assert.equal(firstLines.some(line => line.includes('full mailbox body sentinel')), false, 'GREEN: panel render should not show full mailbox body')
    const beforeMailbox = modules.state.readMailbox(team.name, 'team-lead').find(item => item.id === mailboxMessage.id)
    assert.ok(beforeMailbox, 'mailbox fixture should exist')
    assert.equal(beforeMailbox.readAt, undefined, 'GREEN: panel data load should not mark mailbox read')
    assert.equal(beforeMailbox.deliveredAt, undefined, 'GREEN: panel data load should not mark mailbox delivered')
    const warmFingerprint = panelDataFingerprint(modules.panelDataSource.loadPanelData(team.name))
    assert.equal(warmFingerprint, panelDataFingerprint(modules.panelDataSource.loadPanelData(team.name)), 'GREEN: unchanged panel data fingerprint should remain stable after warm load')

    await assertTmuxSnapshotRegressionStillGreen(env)

    const failures = []
    const noOpDeps = {
      done: () => {},
      refresh: () => {},
      requestRender: () => { noOpDeps.renderCount += 1 },
      renderCount: 0,
    }
    sendInput(modules, data, state, keys.up, noOpDeps)
    if (noOpDeps.renderCount !== 0) {
      failures.push(`input no-op gating expected 0 requestRender calls for Up at first row, got ${noOpDeps.renderCount}`)
    }
    state.scrollFocus = 'list'
    sendInput(modules, data, state, keys.left, noOpDeps)
    if (noOpDeps.renderCount !== 0) {
      failures.push(`input no-op gating expected 0 requestRender calls for Left while list already focused, got ${noOpDeps.renderCount}`)
    }
    state.scrollFocus = 'detail'
    sendInput(modules, data, state, keys.right, noOpDeps)
    if (noOpDeps.renderCount !== 0) {
      failures.push(`input no-op gating expected 0 requestRender calls for Right while detail already focused, got ${noOpDeps.renderCount}`)
    }

    const changeDeps = {
      done: () => {},
      refresh: () => {},
      requestRender: () => { changeDeps.renderCount += 1 },
      renderCount: 0,
    }
    state.interactionMode = 'browse'
    state.actionMenu = undefined
    state.focus = 'tasks'
    state.selectedIndex = 0
    state.tasksSelectedIndex = 0
    state.scrollFocus = 'list'
    sendInput(modules, data, state, keys.down, changeDeps)
    sendInput(modules, data, state, keys.right, changeDeps)
    sendInput(modules, data, state, 'a', changeDeps)
    if (changeDeps.renderCount < 3) {
      failures.push(`actual state changes should still request render, expected >=3 got ${changeDeps.renderCount}`)
    }

    const harness = createPanelHarness(modules, helpers, team.name)
    const panel = await harness.open()
    panel.render(140)
    panel.handleInput('a')
    await panel.flushRender()
    panel.handleInput(keys.down)
    await panel.flushRender()
    const renderBeforeRefresh = harness.requestedRenders.length
    panel.handleInput(keys.enter)
    await panel.flushRender()
    const renderAfterRefresh = harness.requestedRenders.length
    if (renderAfterRefresh !== renderBeforeRefresh) {
      failures.push(`unchanged refresh gating expected 0 requestRender calls for identical data refresh, got ${renderAfterRefresh - renderBeforeRefresh}`)
    }

    const burstHarness = createPanelHarness(modules, helpers, team.name)
    const burstPanel = await burstHarness.open()
    burstPanel.render(140)
    for (let index = 0; index < 10; index += 1) {
      burstPanel.handleInput('a')
      burstPanel.handleInput(keys.down)
      burstPanel.handleInput(keys.enter)
    }
    await burstPanel.flushRender()
    if (burstHarness.requestedRenders.length > 1) {
      failures.push(`burst refresh debounce expected <=1 requestRender for 10 immediate refreshes, got ${burstHarness.requestedRenders.length}`)
    }

    assert.equal(failures.length, 0, failures.join('\n'))
  },
}
