const assert = require('node:assert/strict')

module.exports = {
  name: 'service runtime cleanup helpers',
  async run(env) {
    assert.equal(typeof env.modules.state.readTeamState, 'function', 'test-only focused state bundle should expose store helpers for suites')
    assert.equal(typeof env.modules.tmux.createTeammatePane, 'function', 'explicit tmux adapter should expose patchable helper exports')
    assert.equal(typeof env.modules.tmux.listAgentTeamPanes, 'function', 'explicit tmux adapter should expose visible/list helper')

    const runtimePanes = env.modules.runtimePanes
    const cleanupTeam = env.modules.state.createInitialTeamState({
      teamName: 'cleanup-helper-suite',
      leaderSessionFile: '/tmp/cleanup-helper-leader.jsonl',
      leaderCwd: '/tmp/cleanup-helper-project',
      description: 'cleanup helper test',
    })
    env.modules.state.upsertMember(cleanupTeam, {
      name: 'cleanup-worker',
      role: 'researcher',
      cwd: '/tmp/cleanup-helper-project',
      sessionFile: '/tmp/cleanup-helper-worker.jsonl',
      paneId: '%cleanup-worker',
      windowTarget: 'test:@1',
      status: 'idle',
    })
    cleanupTeam.members['team-lead'].paneId = '%cleanup-leader'
    cleanupTeam.members['team-lead'].windowTarget = 'test:@1'
    env.patches.livePanes.add('%cleanup-worker')
    env.patches.livePanes.add('%cleanup-leader')
    env.modules.state.writeTeamState(cleanupTeam)

    runtimePanes.clearAndKillTeamPanes(cleanupTeam, {
      includeLeaderPane: true,
      preservePaneId: '%cleanup-worker',
    })
    assert.equal(env.patches.livePanes.has('%cleanup-worker'), true, 'preservePaneId should keep selected current pane alive')
    assert.equal(env.patches.livePanes.has('%cleanup-leader'), false, 'clearAndKillTeamPanes should still remove non-preserved leader pane')
    assert.ok(env.patches.clearedPaneLabels.includes('%cleanup-worker'), 'preservePaneId should clear label even when pane survives')
    env.modules.state.deleteTeamState('cleanup-helper-suite')

    const deleteRuntimeTeam = env.modules.state.createInitialTeamState({
      teamName: 'delete-runtime-helper-suite',
      leaderSessionFile: '/tmp/delete-runtime-helper-leader.jsonl',
      leaderCwd: '/tmp/delete-runtime-helper-project',
      description: 'delete runtime helper test',
    })
    env.modules.state.upsertMember(deleteRuntimeTeam, {
      name: 'delete-runtime-worker',
      role: 'researcher',
      cwd: '/tmp/delete-runtime-helper-project',
      sessionFile: '/tmp/delete-runtime-helper-worker.jsonl',
      paneId: '%delete-runtime-worker',
      windowTarget: 'test:@1',
      status: 'idle',
    })
    deleteRuntimeTeam.members['team-lead'].paneId = '%delete-runtime-leader'
    deleteRuntimeTeam.members['team-lead'].windowTarget = 'test:@1'
    env.patches.livePanes.add('%delete-runtime-worker')
    env.patches.livePanes.add('%delete-runtime-leader')
    env.modules.state.writeTeamState(deleteRuntimeTeam)
    env.modules.runtime.deleteTeamRuntime(deleteRuntimeTeam, {
      includeLeaderPane: true,
      preservePaneId: '%delete-runtime-worker',
    })
    assert.equal(env.modules.state.readTeamState('delete-runtime-helper-suite'), null, 'deleteTeamRuntime should delete team state')
    assert.equal(env.patches.livePanes.has('%delete-runtime-worker'), true, 'deleteTeamRuntime should preserve current pane')
    assert.equal(env.patches.livePanes.has('%delete-runtime-leader'), false, 'deleteTeamRuntime should still remove non-preserved leader pane')
    assert.ok(env.patches.clearedPaneLabels.includes('%delete-runtime-worker'), 'deleteTeamRuntime should clear preserved pane label')

    const originalResolvePaneBinding = env.modules.tmux.resolvePaneBinding
    let resolveCalls = 0
    try {
      env.modules.tmux.resolvePaneBinding = paneId => {
        resolveCalls += 1
        return { paneId, target: 'test:@1' }
      }
      const reconcileTeam = env.modules.state.createInitialTeamState({
        teamName: 'reconcile-cache-suite',
        leaderSessionFile: '/tmp/reconcile-cache-leader.jsonl',
        leaderCwd: '/tmp/reconcile-cache-project',
        description: 'reconcile cache test',
      })
      env.modules.state.upsertMember(reconcileTeam, {
        name: 'impl-cache',
        role: 'implementer',
        cwd: '/tmp/reconcile-cache-project',
        sessionFile: '/tmp/reconcile-cache-impl.jsonl',
        paneId: '%cache-worker',
        windowTarget: 'test:@1',
        status: 'idle',
      })
      env.modules.runtime.invalidatePaneReconcileCache(reconcileTeam.name)

      assert.equal(env.modules.runtime.reconcileTeamPanes(reconcileTeam), false)
      assert.equal(resolveCalls, 1, 'first reconcile should resolve member pane')

      assert.equal(env.modules.runtime.reconcileTeamPanes(reconcileTeam), false)
      assert.equal(resolveCalls, 1, 'second reconcile within same revision/TTL should use cache')

      reconcileTeam.revision = (reconcileTeam.revision ?? 0) + 1
      assert.equal(env.modules.runtime.reconcileTeamPanes(reconcileTeam), false)
      assert.equal(resolveCalls, 2, 'revision change should allow reconcile again')

      assert.equal(env.modules.runtime.reconcileTeamPanes(reconcileTeam, { force: true }), false)
      assert.equal(resolveCalls, 3, 'force reconcile should bypass cache')
    } finally {
      env.modules.tmux.resolvePaneBinding = originalResolvePaneBinding
    }
  },
}
