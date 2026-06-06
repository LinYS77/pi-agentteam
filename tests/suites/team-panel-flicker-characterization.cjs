const assert = require('node:assert/strict')

function makePanelFixtureTeam(modules, name, workerCount) {
  modules.state.deleteTeamState(name)
  const team = modules.state.createInitialTeamState({
    teamName: name,
    leaderSessionFile: `/tmp/${name}-leader.jsonl`,
    leaderCwd: `/tmp/${name}`,
    description: 'panel flicker measurement fixture',
  })
  const paneIds = []
  for (let index = 0; index < workerCount; index += 1) {
    const paneId = `%${name}-${index + 1}`
    paneIds.push(paneId)
    modules.state.upsertMember(team, {
      name: `worker-${index + 1}`,
      role: 'implementer',
      cwd: `/tmp/${name}`,
      sessionFile: `/tmp/${name}-worker-${index + 1}.jsonl`,
      paneId,
      windowTarget: 'test:@1',
      status: 'idle',
    })
  }
  modules.state.writeTeamState(team)
  modules.runtimePanes.invalidatePaneReconcileCache(name)
  return { team, paneIds }
}

function resetMetrics(metrics) {
  metrics.resolveBindingCalls.length = 0
  metrics.listAgentTeamPanesCalls = 0
}

function withPanelTmuxMetrics(modules, countedPaneIds, fn) {
  const originalResolvePaneBinding = modules.tmux.resolvePaneBinding
  const originalListAgentTeamPanes = modules.tmux.listAgentTeamPanes
  const metrics = {
    resolveBindingCalls: [],
    listAgentTeamPanesCalls: 0,
  }

  modules.tmux.resolvePaneBinding = paneId => {
    if (countedPaneIds.has(paneId)) {
      metrics.resolveBindingCalls.push(paneId)
    }
    return paneId ? { paneId, target: 'test:@1' } : null
  }
  modules.tmux.listAgentTeamPanes = () => {
    metrics.listAgentTeamPanesCalls += 1
    return []
  }

  try {
    return fn(metrics)
  } finally {
    modules.tmux.resolvePaneBinding = originalResolvePaneBinding
    modules.tmux.listAgentTeamPanes = originalListAgentTeamPanes
  }
}

function assertPanelLoadDoesNotMutateMailbox(modules, teamName, messageId) {
  const stored = modules.state.readMailbox(teamName, 'team-lead').find(item => item.id === messageId)
  assert.ok(stored, 'mailbox fixture should remain present after panel data load')
  assert.equal(stored.readAt, undefined, 'panel data load should not mark mailbox items read')
  assert.equal(stored.deliveredAt, undefined, 'panel data load should not mark mailbox items delivered')
}

module.exports = {
  name: 'team panel flicker characterization',
  async run(env) {
    const { modules } = env
    const attached = makePanelFixtureTeam(modules, 'flicker-attached-suite', 4)
    const globalA = makePanelFixtureTeam(modules, 'flicker-global-a-suite', 3)
    const globalB = makePanelFixtureTeam(modules, 'flicker-global-b-suite', 3)
    const countedPaneIds = new Set([
      ...attached.paneIds,
      ...globalA.paneIds,
      ...globalB.paneIds,
    ])

    const message = modules.state.pushMailboxMessage(attached.team.name, 'team-lead', {
      from: 'worker-1',
      to: 'team-lead',
      type: 'inform',
      summary: 'Panel flicker read-boundary fixture',
      text: 'Panel load must not mark this full mailbox body read or delivered.',
    })

    const failures = []
    withPanelTmuxMetrics(modules, countedPaneIds, metrics => {
      modules.panelDataSource.loadPanelData(attached.team.name)
      resetMetrics(metrics)
      const attachedRefresh = modules.panelDataSource.loadPanelData(attached.team.name)
      assert.equal(attachedRefresh.mode, 'attached', 'attached fixture should load attached panel data')
      assertPanelLoadDoesNotMutateMailbox(modules, attached.team.name, message.id)
      const attachedCalls = [...metrics.resolveBindingCalls]
      if (attachedCalls.length !== 0) {
        failures.push(`attached refresh expected 0 fixture resolvePaneBinding calls after warm load, got ${attachedCalls.length}: ${attachedCalls.join(', ')}. Ordinary /team refresh appears to force per-member pane reconcile.`)
      }

      modules.panelDataSource.loadPanelData(null)
      resetMetrics(metrics)
      const globalRefresh = modules.panelDataSource.loadPanelData(null)
      assert.equal(globalRefresh.mode, 'global', 'global fixture should load global panel data')
      const globalCalls = [...metrics.resolveBindingCalls]
      if (globalCalls.length !== 0) {
        failures.push(`global refresh expected 0 fixture resolvePaneBinding calls after warm load, got ${globalCalls.length}: ${globalCalls.join(', ')}. Global /team refresh appears to amplify pane checks per team/member.`)
      }
      if (metrics.listAgentTeamPanesCalls > 1) {
        failures.push(`global refresh expected at most 1 listAgentTeamPanes snapshot call, got ${metrics.listAgentTeamPanesCalls}. Global stale-pane scan should stay bounded.`)
      }
    })

    assert.equal(failures.length, 0, failures.join('\n'))
  },
}
