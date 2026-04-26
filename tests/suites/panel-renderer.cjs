const assert = require('node:assert/strict')

module.exports = {
  name: 'panel + renderer',
  async run(env) {
    const { modules, helpers } = env

    const team = modules.state.createInitialTeamState({
      teamName: 'render-suite',
      leaderSessionFile: '/tmp/leader-render.jsonl',
      leaderCwd: '/tmp',
      description: 'render test',
    })
    modules.state.upsertMember(team, {
      name: 'researcher-very-long-member-name-alpha',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/r1.jsonl',
      status: 'running',
      paneId: '%1',
      windowTarget: 'test:@1',
      lastWakeReason: 'mailbox/task update',
    })
    modules.state.upsertMember(team, {
      name: 'planner-very-long-member-name-beta',
      role: 'planner',
      cwd: '/tmp',
      sessionFile: '/tmp/p1.jsonl',
      status: 'idle',
      paneId: '%2',
      windowTarget: 'test:@1',
    })
    const task = modules.state.createTask(team, {
      title: 'A very long task title that should be truncated safely in narrow layout',
      description: 'Long description for rendering',
    })
    task.owner = 'researcher-very-long-member-name-alpha'
    task.status = 'in_progress'
    task.updatedAt = Date.now()
    modules.state.writeTeamState(team)

    const data = modules.viewModel.loadPanelData('render-suite')
    assert.ok(data, 'panel data should load')
    const state = modules.viewModel.createInitialPanelState()
    modules.viewModel.clampPanelStateToData(state, data)
    let selection = modules.viewModel.buildPanelSelectionView(data, state)
    assert.ok(selection.selectedMember, 'member details should be available when members section is focused')
    assert.ok(selection.selectedTask, 'task details should be available even when tasks section is not focused')
    assert.ok(selection.selectedMailbox === undefined, 'mailbox details may be empty when mailbox has no messages')

    state.focus = 'tasks'
    state.selectedIndex = 0
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    assert.equal(selection.selectedTask?.id, task.id, 'task details should follow task selection')

    const actions = helpers.requireDist('teamPanel/actions.js')
    const input = helpers.requireDist('teamPanel/input.js')
    const keys = helpers.tuiKeys
    const actionMenu = actions.buildPanelActions(data, state, selection)
    assert.ok(actionMenu.actions.some(action => action.id === 'sync'), 'attached panel should expose sync as an Enter action')
    assert.ok(actionMenu.actions.some(action => action.id === 'delete-team'), 'attached panel should expose delete as an Enter action')
    assert.ok(!actionMenu.actions.some(action => action.id === 'back'), 'action menu should rely on Esc, not a Back item')
    assert.ok(!actionMenu.actions.some(action => String(action.id).includes('focus')), 'panel action menu should not expose pane focus')

    state.isDetailExpanded = true
    let closed = false
    input.handleTeamPanelInput(keys.escape, data, state, selection, {
      done: () => { closed = true },
      refresh: () => {},
      requestRender: () => {},
    })
    assert.equal(closed, false, 'Esc should collapse expanded details before closing panel')
    assert.equal(state.isDetailExpanded, false, 'Esc should collapse details')
    input.handleTeamPanelInput(keys.escape, data, state, selection, {
      done: result => { closed = result.type === 'close' },
      refresh: () => {},
      requestRender: () => {},
    })
    assert.equal(closed, true, 'Esc should close panel after details are collapsed')

    const globalData = modules.viewModel.loadPanelData(null)
    const globalState = modules.viewModel.createInitialPanelState()
    modules.viewModel.clampPanelStateToData(globalState, globalData)
    assert.equal(globalData.mode, 'global', 'missing current team should open global console data')
    assert.equal(globalState.focus, 'teams', 'global console should start on teams')
    const globalSelection = modules.viewModel.buildPanelSelectionView(globalData, globalState)
    const globalActions = actions.buildPanelActions(globalData, globalState, globalSelection)
    assert.ok(globalActions.actions.some(action => action.id === 'recover-team'), 'global console should expose recover action for selected team')
    assert.ok(globalActions.actions.some(action => action.id === 'cleanup-all'), 'global console should expose cleanup action')
    assert.ok(!globalActions.actions.some(action => action.id === 'back'), 'global action menu should not include Back')

    const theme = helpers.createFakeTheme()
    const expandedState = modules.viewModel.createInitialPanelState()
    expandedState.focus = 'tasks'
    expandedState.selectedIndex = 0
    expandedState.isDetailExpanded = true
    const expandedSelection = modules.viewModel.buildPanelSelectionView(data, expandedState)
    const expandedLines = modules.layout.renderTeamPanelLines(theme, { width: 96, data, state: expandedState, selection: expandedSelection })
    assert.ok(expandedLines.some(line => line.includes('Long description for rendering')), 'expanded details should show full task description')
    assert.ok(expandedLines.some(line => line.includes('Esc') && line.includes('collapse details')), 'expanded details should hint Esc collapse')

    for (const width of [56, 72, 96, 128, 160, 220]) {
      for (const renderCase of [
        { data, state, selection },
        { data: globalData, state: globalState, selection: globalSelection },
      ]) {
        const lines = modules.layout.renderTeamPanelLines(theme, { width, ...renderCase })
        assert.ok(Array.isArray(lines), `lines should be array for width=${width}`)
        for (const line of lines) {
          const visible = helpers.visibleWidth(line)
          assert.ok(
            visible <= width,
            `Rendered line exceeds width ${visible} > ${width}: ${line}`,
          )
        }
      }
    }
  },
}
