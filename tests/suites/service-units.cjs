const assert = require('node:assert/strict')
module.exports = {
  name: 'service unit helpers',
  async run(env) {
    const workerRole = env.helpers.requireDist('tools/workerRole.js')
    const workerPrompt = env.helpers.requireDist('tools/workerPrompt.js')
    const messagePolicy = env.helpers.requireDist('tools/messagePolicy.js')
    const taskPolicy = env.helpers.requireDist('tools/taskPolicy.js')
    const contextService = env.helpers.requireDist('hooks/contextService.js')

    assert.equal(workerRole.normalizeSpawnRole('plan'), 'planner')
    assert.equal(workerRole.normalizeSpawnRole('研究员'), 'researcher')
    assert.equal(workerRole.normalizeSpawnRole('dev'), 'implementer')
    assert.equal(workerRole.normalizeSpawnRole('worker', 'planning-helper'), 'planner')
    assert.equal(workerRole.normalizeSpawnRole('agent', 'research-buddy'), 'researcher')
    assert.equal(workerRole.normalizeSpawnRole('teammate', 'code-buddy'), 'implementer')
    assert.equal(workerRole.normalizeSpawnRole('custom-role'), 'custom-role')

    const roleAgent = {
      name: 'implementer',
      description: 'Implementer',
      model: 'model with space',
      tools: ['read', ' ', 'bash', 'agentteam_task'],
      systemPrompt: 'implementer role prompt',
    }
    const systemPrompt = workerPrompt.buildWorkerSystemPrompt({
      teamName: 'demo',
      workerName: 'impl-1',
      role: 'implementer',
      roleAgent,
    })
    assert.ok(systemPrompt.includes('Team: demo'))
    assert.ok(systemPrompt.includes('Worker name: impl-1'))
    assert.ok(systemPrompt.includes('Role: implementer'))
    assert.ok(systemPrompt.includes('agentteam_send and agentteam_task'))
    assert.ok(systemPrompt.includes('call agentteam_receive before acting'), 'worker prompt should keep mailbox read state clean')
    assert.ok(systemPrompt.includes('task-id based'), 'worker prompt should prefer task-linked handoffs')
    assert.ok(systemPrompt.includes('If blocked'), 'worker prompt should include blocked reporting discipline')
    assert.ok(systemPrompt.includes('implementer role prompt'))

    const launch = workerPrompt.buildWorkerLaunchCommand({
      sessionFile: "/tmp/session with ' quote.jsonl",
      basePrompt: systemPrompt,
      roleAgent,
    })
    assert.ok(launch.startsWith('PI_AGENTTEAM_HOME='), launch)
    assert.ok(launch.includes("'pi' '--session'"), launch)
    assert.ok(launch.includes("'--append-system-prompt'"), launch)
    assert.ok(launch.includes("'--model' 'model with space'"), launch)
    assert.ok(launch.includes("'--tools' 'read,bash,agentteam_task'"), launch)
    assert.ok(launch.includes("\"'\"'"), 'single quotes in args should be shell escaped')

    assert.equal(messagePolicy.canSendMessageType('team-lead', 'assignment'), true)
    assert.equal(messagePolicy.canSendMessageType('worker-a', 'assignment'), false)
    assert.equal(messagePolicy.canSendMessageType('worker-a', 'question'), true)
    assert.equal(
      messagePolicy.enforcePlannerSendPolicy({ senderRole: 'planner', messageType: 'completion_report' }),
      'Planner completion_report requires taskId so leader can audit the planning artifact in agentteam_task.',
    )
    assert.equal(
      messagePolicy.enforcePlannerSendPolicy({ senderRole: 'planner', messageType: 'completion_report', taskId: 'task-1' }),
      null,
    )
    assert.equal(
      messagePolicy.shouldMirrorMessageToLeader({
        sender: 'worker-a',
        sentRecipients: ['worker-b'],
        messageType: 'blocked',
        leaderExists: true,
      }),
      true,
    )
    assert.equal(
      messagePolicy.shouldMirrorMessageToLeader({
        sender: 'worker-a',
        sentRecipients: ['team-lead'],
        messageType: 'blocked',
        leaderExists: true,
      }),
      false,
    )
    assert.equal(
      messagePolicy.shouldMirrorMessageToLeader({
        sender: 'worker-a',
        sentRecipients: ['worker-b'],
        messageType: 'fyi',
        leaderExists: true,
      }),
      false,
    )

    const team = {
      members: {
        'team-lead': { role: 'leader' },
        plan: { role: 'planner' },
        impl: { role: 'implementer' },
      },
    }
    assert.equal(taskPolicy.actorRole(team, 'team-lead'), 'leader')
    assert.equal(taskPolicy.actorRole(team, 'plan'), 'planner')
    assert.equal(taskPolicy.actorRole(team, 'impl'), 'implementer')
    assert.equal(taskPolicy.ensureTaskPrivilege(team, 'plan', 'create'), null)
    assert.equal(taskPolicy.ensureTaskPrivilege(team, 'impl', 'note'), null)
    assert.equal(taskPolicy.ensureTaskPrivilege(team, 'impl', 'complete'), null)
    assert.ok(taskPolicy.ensureTaskPrivilege(team, 'impl', 'claim').includes("Task action 'claim' is not allowed"))
    assert.equal(taskPolicy.canCompleteTask({ actor: 'impl', owner: 'impl' }), true)
    assert.equal(taskPolicy.canCompleteTask({ actor: 'team-lead', owner: 'impl' }), true)
    assert.equal(taskPolicy.canCompleteTask({ actor: 'other', owner: 'impl' }), false)

    const emptyCompletion = taskPolicy.buildImplementationCompletionNote()
    assert.ok(emptyCompletion.includes('Files changed:'))
    const briefCompletion = taskPolicy.buildImplementationCompletionNote('Implemented feature')
    assert.ok(briefCompletion.startsWith('Implemented feature'))
    assert.ok(briefCompletion.includes('Checks run:'))
    const structuredCompletion = taskPolicy.buildImplementationCompletionNote('Files changed: a.ts\nChecks run: npm test')
    assert.equal(structuredCompletion, 'Files changed: a.ts\nChecks run: npm test')

    assert.equal(contextService.shouldSyncMailboxOnInput({ source: 'interactive', text: 'ask agentteam for updates' }), true)
    assert.equal(contextService.shouldSyncMailboxOnInput({ source: 'interactive', text: '/team' }), true)
    assert.equal(contextService.shouldSyncMailboxOnInput({ source: 'interactive', text: '/help' }), false)
    assert.equal(contextService.shouldSyncMailboxOnInput({ source: 'api', text: 'agentteam' }), false)

    const mailboxSessionFile = '/tmp/mailbox-projection-leader.jsonl'
    const mailboxCtx = env.helpers.createCtx('/tmp/mailbox-projection-project', mailboxSessionFile, [])
    const mailboxTeam = env.modules.state.createInitialTeamState({
      teamName: 'mailbox-projection-suite',
      leaderSessionFile: mailboxSessionFile,
      leaderCwd: '/tmp/mailbox-projection-project',
      description: 'projection test',
    })
    mailboxTeam.members['team-lead'].paneId = '%leader'
    mailboxTeam.members['team-lead'].windowTarget = 'test:@1'
    env.modules.state.writeTeamState(mailboxTeam)
    env.modules.state.writeSessionContext(mailboxSessionFile, {
      teamName: mailboxTeam.name,
      memberName: 'team-lead',
    })

    const mailboxRuntime = env.modules.runtimeService.createRuntimeService(env.pi)
    const messagesBeforeProjection = env.pi.__messages.length
    const firstUnread = env.modules.state.pushMailboxMessage(mailboxTeam.name, 'team-lead', {
      from: 'planner',
      to: 'team-lead',
      text: 'first unread should project once',
      type: 'question',
    })

    mailboxRuntime.runMailboxSync(mailboxCtx)
    let projected = env.pi.__messages.slice(messagesBeforeProjection).filter(message => message.customType === 'agentteam-mailbox')
    assert.deepEqual(projected.map(message => message.details.id), [firstUnread.id], 'first sync should project first unread')

    mailboxRuntime.runMailboxSync(mailboxCtx)
    projected = env.pi.__messages.slice(messagesBeforeProjection).filter(message => message.customType === 'agentteam-mailbox')
    assert.deepEqual(projected.map(message => message.details.id), [firstUnread.id], 'repeated automatic sync should not reproject old unread')

    const secondUnread = env.modules.state.pushMailboxMessage(mailboxTeam.name, 'team-lead', {
      from: 'researcher',
      to: 'team-lead',
      text: 'second unread should project without repeating first',
      type: 'completion_report',
    })
    mailboxRuntime.runMailboxSync(mailboxCtx)
    projected = env.pi.__messages.slice(messagesBeforeProjection).filter(message => message.customType === 'agentteam-mailbox')
    assert.deepEqual(
      projected.map(message => message.details.id),
      [firstUnread.id, secondUnread.id],
      'new unread should project without repeating prior unread',
    )

    let storedMailbox = env.modules.state.readMailbox(mailboxTeam.name, 'team-lead')
    assert.ok(storedMailbox.every(message => !message.readAt), 'projection should not mark mailbox messages read')

    mailboxRuntime.resetMailboxSyncKey()
    mailboxRuntime.runMailboxSync(mailboxCtx)
    projected = env.pi.__messages.slice(messagesBeforeProjection).filter(message => message.customType === 'agentteam-mailbox')
    assert.deepEqual(
      projected.map(message => message.details.id),
      [firstUnread.id, secondUnread.id, firstUnread.id, secondUnread.id],
      'manual reset should allow explicit re-projection of unread messages',
    )
    storedMailbox = env.modules.state.readMailbox(mailboxTeam.name, 'team-lead')
    assert.ok(storedMailbox.every(message => !message.readAt), 'manual re-projection should still not mark mailbox messages read')

    const statusRuntime = env.modules.runtimeService.createRuntimeService(env.pi)
    let statusCalls = 0
    let widgetCalls = 0
    mailboxCtx.ui.setStatus = () => { statusCalls += 1 }
    mailboxCtx.ui.setWidget = () => { widgetCalls += 1 }

    statusRuntime.refreshStatus(mailboxCtx)
    assert.equal(statusCalls, 1, 'first non-forcing refresh should update status UI')
    assert.equal(widgetCalls, 1, 'first non-forcing refresh should update widget UI')

    statusRuntime.refreshStatus(mailboxCtx)
    assert.equal(statusCalls, 1, 'repeated non-forcing refresh should be skipped when status key is unchanged')
    assert.equal(widgetCalls, 1, 'repeated non-forcing refresh should not update widget UI when status key is unchanged')

    statusRuntime.invalidateStatus(mailboxCtx)
    assert.equal(statusCalls, 2, 'invalidateStatus should still force one status refresh')
    assert.equal(widgetCalls, 2, 'invalidateStatus should still force one widget refresh')

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
