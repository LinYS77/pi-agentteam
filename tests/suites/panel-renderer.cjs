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
    const selection = modules.viewModel.buildPanelSelectionView(data, state)

    const theme = helpers.createFakeTheme()
    for (const width of [56, 72, 96, 128, 160, 220]) {
      const lines = modules.layout.renderTeamPanelLines(theme, { width, data, state, selection })
      assert.ok(Array.isArray(lines), `lines should be array for width=${width}`)
      for (const line of lines) {
        const visible = helpers.visibleWidth(line)
        assert.ok(
          visible <= width,
          `Rendered line exceeds width ${visible} > ${width}: ${line}`,
        )
      }
    }
  },
}
