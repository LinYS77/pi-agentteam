const assert = require('node:assert/strict')
const fs = require('node:fs')

module.exports = {
  name: 'tools/state repository transactions',
  async run(env) {
    const { pi, modules, helpers } = env
    const tool = name => pi.__tools.get(name)
    const legacyNotes = task => Array.isArray(task?.notes) ? task.notes : []
    const originalResolvePaneBinding = modules.tmux.resolvePaneBinding
    const cleanupRepositoryTransactionTeams = () => {
      for (const teamName of [
        'merge-freshness-suite',
        'status-key-suite',
        'storage-cache-suite',
        'reconcile-invalidate-suite',
        'transaction-suite',
        'concurrent-progress-suite',
      ]) {
        modules.state.deleteTeamState(teamName)
      }
    }

    try {
      cleanupRepositoryTransactionTeams()
    const mergeTeam = modules.state.createInitialTeamState({
      teamName: 'merge-freshness-suite',
      leaderSessionFile: '/tmp/merge-freshness-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.upsertMember(mergeTeam, {
      name: 'worker-one',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/merge-freshness-worker.jsonl',
      status: 'idle',
    })
    const mergeTask = modules.state.createTask(mergeTeam, {
      title: 'Freshness merge task',
      description: 'ensure stale writer does not clobber newer task/member state',
    })
    modules.state.writeTeamState(mergeTeam)

    const staleSnapshot = modules.state.readTeamState('merge-freshness-suite')
    const newerSnapshot = modules.state.readTeamState('merge-freshness-suite')

    // Newer writer blocks existing member + existing task.
    modules.state.updateMemberStatus(newerSnapshot, 'worker-one', {
      status: 'running',
      lastWakeReason: 'newer writer block',
    })
    newerSnapshot.tasks[mergeTask.id].status = 'blocked'
    newerSnapshot.tasks[mergeTask.id].updatedAt = Date.now() + 10
    modules.state.appendTaskEvent(newerSnapshot, {
      taskId: mergeTask.id,
      type: 'blocked',
      by: 'worker-one',
      at: Date.now() + 10,
      summary: 'newer task block',
    })
    modules.state.writeTeamState(newerSnapshot)

    // Stale writer blocks unrelated top-level field and writes older entity copies back.
    staleSnapshot.description = 'stale writer changed description only'
    modules.state.writeTeamState(staleSnapshot)

    const mergedFreshness = modules.state.readTeamState('merge-freshness-suite')
    assert.equal(mergedFreshness.members['worker-one'].status, 'running')
    assert.equal(mergedFreshness.members['worker-one'].lastWakeReason, 'newer writer block')
    assert.equal(mergedFreshness.tasks[mergeTask.id].status, 'blocked')
    assert.ok(
      Object.values(mergedFreshness.taskEvents).some(event => event.taskId === mergeTask.id && event.summary === 'newer task block'),
      'newer task event should survive stale writer merge',
    )
    assert.equal(mergedFreshness.description, 'stale writer changed description only')

    const statusKeyTeam = modules.state.createInitialTeamState({
      teamName: 'status-key-suite',
      leaderSessionFile: '/tmp/status-key-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.upsertMember(statusKeyTeam, {
      name: 'status-worker',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/status-key-worker.jsonl',
      status: 'idle',
    })
    modules.state.writeTeamState(statusKeyTeam)

    const statusCtx = helpers.createCtx('/tmp', '/tmp/status-key-leader.jsonl', env.notifications)
    const attachedStatus = {
      context: { teamName: 'status-key-suite', memberName: 'team-lead' },
      source: 'cached',
    }
    const statusKey1 = modules.runtime.buildSessionStatusKey(statusCtx, attachedStatus)

    const statusTeamV2 = modules.state.readTeamState('status-key-suite')
    modules.state.updateMemberStatus(statusTeamV2, 'status-worker', {
      status: 'running',
      lastWakeReason: 'status-key-block',
    })
    modules.state.writeTeamState(statusTeamV2)

    const statusKey2 = modules.runtime.buildSessionStatusKey(statusCtx, attachedStatus)
    assert.notEqual(statusKey1, statusKey2, 'status key should change when team revision changes')

    const storageTeam = modules.state.createInitialTeamState({
      teamName: 'storage-cache-suite',
      leaderSessionFile: '/tmp/storage-cache-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.upsertMember(storageTeam, {
      name: 'storage-worker',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/storage-cache-worker.jsonl',
      status: 'idle',
      paneId: '%storage-worker',
      windowTarget: 'test:@1',
    })

    modules.runtime.invalidateMailboxEnsureCache(storageTeam.name)
    modules.runtime.ensureTeamStorageReady(storageTeam)
    const leaderMailboxPath = modules.state.getMailboxPath(storageTeam.name, 'team-lead')
    const workerMailboxPath = modules.state.getMailboxPath(storageTeam.name, 'storage-worker')
    const leaderMtime = fs.statSync(leaderMailboxPath).mtimeMs
    const workerMtime = fs.statSync(workerMailboxPath).mtimeMs
    await new Promise(resolve => setTimeout(resolve, 5))
    modules.runtime.ensureTeamStorageReady(storageTeam)
    assert.equal(fs.statSync(leaderMailboxPath).mtimeMs, leaderMtime, 'ensureTeamStorageReady should avoid repeated leader mailbox writes')
    assert.equal(fs.statSync(workerMailboxPath).mtimeMs, workerMtime, 'ensureTeamStorageReady should avoid repeated worker mailbox writes')

    let resolveCalls = 0
    modules.tmux.resolvePaneBinding = paneId => {
      resolveCalls += 1
      if (paneId === '%lost-pane') return null
      if (paneId === '%live-pane') return { paneId, target: 'test:@1' }
      return originalResolvePaneBinding(paneId)
    }

    const reconcileTeam = modules.state.createInitialTeamState({
      teamName: 'reconcile-invalidate-suite',
      leaderSessionFile: '/tmp/reconcile-invalidate-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.upsertMember(reconcileTeam, {
      name: 'lost-worker',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/reconcile-lost-worker.jsonl',
      status: 'running',
      paneId: '%lost-pane',
      windowTarget: 'test:@1',
    })
    modules.state.upsertMember(reconcileTeam, {
      name: 'live-worker',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/reconcile-live-worker.jsonl',
      status: 'idle',
      paneId: '%live-pane',
      windowTarget: 'test:@1',
    })

    modules.runtime.invalidatePaneReconcileCache()
    const firstReconcileChanged = modules.runtime.reconcileTeamPanes(reconcileTeam)
    const secondReconcileChanged = modules.runtime.reconcileTeamPanes(reconcileTeam)
    modules.tmux.resolvePaneBinding = originalResolvePaneBinding

    assert.equal(firstReconcileChanged, true, 'first reconcile should detect lost pane changes')
    assert.equal(secondReconcileChanged, false, 'second reconcile should be stable after healing')
    assert.equal(
      resolveCalls,
      3,
      'pane reconcile cache should be invalidated after pane-loss healing so immediate second reconcile still checks live panes',
    )

    const txTeam = modules.state.createInitialTeamState({
      teamName: 'transaction-suite',
      leaderSessionFile: '/tmp/transaction-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.upsertMember(txTeam, {
      name: 'transaction-worker',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/transaction-worker.jsonl',
      status: 'idle',
    })
    modules.state.writeTeamState(txTeam)

    const txUpdated = modules.state.updateTeamState('transaction-suite', team => {
      team.description = 'updated through transaction api'
      modules.state.updateMemberStatus(team, 'transaction-worker', {
        status: 'running',
        lastWakeReason: 'transaction block',
      })
      modules.state.createTask(team, {
        title: 'transaction task',
        description: 'created inside updateTeamState',
      })
    })

    assert.ok(txUpdated, 'updateTeamState should return updated team state')
    assert.equal(txUpdated.description, 'updated through transaction api')
    assert.equal(txUpdated.members['transaction-worker'].status, 'running')
    assert.equal(txUpdated.members['transaction-worker'].lastWakeReason, 'transaction block')
    assert.ok(txUpdated.tasks.T001, 'updateTeamState should persist task creation')

    const txMissing = modules.state.updateTeamState('missing-transaction-suite', team => team)
    assert.equal(txMissing, null, 'updateTeamState should return null for missing team')

    const txBeforeNoop = modules.state.readTeamState('transaction-suite')
    const txNoop = modules.state.updateTeamState('transaction-suite', () => undefined)
    assert.equal(txNoop.revision, txBeforeNoop.revision, 'no-op updateTeamState should not bump revision')

    const txBeforeSameStatus = modules.state.readTeamState('transaction-suite')
    const sameStatusUpdatedAt = txBeforeSameStatus.members['transaction-worker'].updatedAt
    const txSameStatus = modules.state.updateTeamState('transaction-suite', team => {
      modules.state.updateMemberStatus(team, 'transaction-worker', {
        status: 'running',
        lastWakeReason: 'transaction block',
      })
    })
    assert.equal(txSameStatus.revision, txBeforeSameStatus.revision, 'same member status patch should not bump revision')
    assert.equal(
      txSameStatus.members['transaction-worker'].updatedAt,
      sameStatusUpdatedAt,
      'same member status patch should not block member timestamp',
    )

    const txStatusChanged = modules.state.updateTeamState('transaction-suite', team => {
      modules.state.updateMemberStatus(team, 'transaction-worker', {
        status: 'idle',
        lastWakeReason: 'transaction finished',
      })
    })
    assert.equal(
      txStatusChanged.revision,
      txBeforeSameStatus.revision + 1,
      'actual member status change should bump revision',
    )
    assert.equal(txStatusChanged.members['transaction-worker'].status, 'idle')
    assert.equal(txStatusChanged.members['transaction-worker'].lastWakeReason, 'transaction finished')

    const concurrentTeam = modules.state.createInitialTeamState({
      teamName: 'concurrent-progress-suite',
      leaderSessionFile: '/tmp/concurrent-progress-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.upsertMember(concurrentTeam, {
      name: 'progress-worker-a',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/concurrent-progress-worker-a.jsonl',
      status: 'idle',
    })
    modules.state.upsertMember(concurrentTeam, {
      name: 'progress-worker-b',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/concurrent-progress-worker-b.jsonl',
      status: 'idle',
    })
    const concurrentTask = modules.state.createTask(concurrentTeam, {
      title: 'Concurrent progress',
      description: 'ensure transaction blocks preserve both progress events',
    })
    modules.state.writeTeamState(concurrentTeam)

    const progressWorkerACtx = helpers.createCtx('/tmp', '/tmp/concurrent-progress-worker-a.jsonl', env.notifications)
    const progressWorkerBCtx = helpers.createCtx('/tmp', '/tmp/concurrent-progress-worker-b.jsonl', env.notifications)
    await Promise.all([
      tool('agentteam_task').execute('concurrent-progress-a', {
        action: 'progress',
        taskId: concurrentTask.id,
        note: 'progress-from-a',
      }, null, () => {}, progressWorkerACtx),
      tool('agentteam_task').execute('concurrent-progress-b', {
        action: 'progress',
        taskId: concurrentTask.id,
        note: 'progress-from-b',
      }, null, () => {}, progressWorkerBCtx),
    ])
    const concurrentAfter = modules.state.readTeamState('concurrent-progress-suite')
    assert.equal(legacyNotes(concurrentAfter.tasks[concurrentTask.id]).length, 0, 'concurrent progress should not append TeamTask.notes')
    const concurrentProgress = Object.values(concurrentAfter.taskEvents).filter(event => event.taskId === concurrentTask.id && event.type === 'progress').map(event => event.summary)
    assert.ok(concurrentProgress.includes('progress-from-a'), 'transaction progress event block should preserve progress from worker A')
    assert.ok(concurrentProgress.includes('progress-from-b'), 'transaction progress event block should preserve progress from worker B')
    } finally {
      modules.tmux.resolvePaneBinding = originalResolvePaneBinding
      cleanupRepositoryTransactionTeams()
    }
  },
}
