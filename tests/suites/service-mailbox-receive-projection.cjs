const assert = require('node:assert/strict')

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = {
  name: 'service mailbox receive projection',
  async run(env) {
    const mailboxSessionFile = '/tmp/mailbox-projection-leader.jsonl'
    const mailboxNotifications = []
    const mailboxCtx = env.helpers.createCtx('/tmp/mailbox-projection-project', mailboxSessionFile, mailboxNotifications)
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

    assert.equal(env.modules.leaderAttention.shouldRequestLeaderAttention({ teamName: 'attention-unit-suite', type: 'inform', wakeHint: 'none' }).shouldRequest, false, 'inform should not request bounded leader attention')
    const attentionQuestionDecision = env.modules.leaderAttention.shouldRequestLeaderAttention({ teamName: 'attention-unit-suite', type: 'question', wakeHint: 'soft', now: 1000 })
    assert.equal(attentionQuestionDecision.shouldRequest, true, 'question-to-leader should request bounded leader attention')
    assert.equal(attentionQuestionDecision.triggerTurn, true)
    const syntheticAttentionBody = 'synthetic attention full body UNIQUE-SYNTHETIC-ATTENTION-BODY'
    const syntheticAttention = env.modules.leaderAttention.sendLeaderAttentionMessage(env.pi, {
      teamName: 'attention-unit-suite',
      id: 'attention-unit-message',
      from: 'worker',
      text: syntheticAttentionBody,
      summary: 'synthetic attention summary',
      type: 'question',
      wakeHint: 'soft',
    })
    const syntheticAttentionProjection = env.pi.__messages.find(message => message.customType === 'agentteam-leader-attention' && message.details.id === 'attention-unit-message')
    assert.equal(syntheticAttention.ok, true, 'successful attention send should commit throttle')
    assert.ok(String(syntheticAttentionProjection?.content).includes('synthetic attention summary'), 'attention wake should include compact summary')
    assert.equal(String(syntheticAttentionProjection?.content).includes(syntheticAttentionBody), false, 'attention wake should not include full message body')
    assert.equal(syntheticAttentionProjection?.details.text, undefined, 'attention details should not carry full message body')
    assert.equal(env.modules.leaderAttention.shouldRequestLeaderAttention({ teamName: 'attention-unit-suite', type: 'report_blocked', wakeHint: 'hard', now: Date.now() }).shouldRequest, false, 'leader attention requests should be throttled only after successful send')
    assert.equal(env.modules.leaderAttention.shouldRequestLeaderAttention({ teamName: 'attention-other-suite', type: 'report_done', wakeHint: 'hard', now: 1002 }).shouldRequest, true, 'report_done should request bounded leader attention')
    env.modules.leaderAttention.resetLeaderAttentionThrottle()

    const mailboxRuntime = env.modules.runtimeService.createRuntimeService(env.pi)
    let storedMailbox
    const messagesBeforeProjection = env.pi.__messages.length
    const firstUnreadFullBody = 'first unread full body UNIQUE-FIRST-PROJECTION-BODY should only be visible through receive'
    const firstUnread = env.modules.state.pushMailboxMessage(mailboxTeam.name, 'team-lead', {
      from: 'planner',
      to: 'team-lead',
      text: firstUnreadFullBody,
      summary: 'first unread compact summary',
      type: 'question',
      taskId: 'T777',
      threadId: 'task:T777',
      priority: 'high',
      wakeHint: 'soft',
    })

    mailboxRuntime.runMailboxSync(mailboxCtx)
    let projected = env.pi.__messages.slice(messagesBeforeProjection).filter(message => message.customType === 'agentteam-mailbox')
    let attentionProjected = env.pi.__messages.slice(messagesBeforeProjection).filter(message => message.customType === 'agentteam-leader-attention')
    assert.deepEqual(projected.map(message => message.details.id), [firstUnread.id], 'first sync should project first unread')
    assert.deepEqual(attentionProjected.map(message => message.details.id), [firstUnread.id], 'question-to-leader should request bounded leader attention')
    assert.equal(projected[0].content.includes(firstUnreadFullBody), false, 'mailbox projection should not include full message body')
    assert.equal(projected[0].content.includes('first unread compact summary'), true, 'mailbox projection should include compact summary')
    assert.equal(projected[0].content.includes(firstUnread.id), true, 'mailbox projection should include message id')
    assert.equal(projected[0].content.includes('task=T777'), true, 'mailbox projection should include task id')
    assert.equal(projected[0].content.includes('thread=task:T777'), true, 'mailbox projection should include thread id')
    assert.equal(projected[0].content.toLowerCase().includes('call agentteam_receive'), true, 'mailbox projection should direct leader to receive for full details')
    assert.equal(projected[0].content.includes('agentteam_task show/history/reports/report'), true, 'mailbox projection should point to task report/history queries for referenced artifacts')
    assert.equal(projected[0].details.text, undefined, 'mailbox projection details should not carry full message body')
    assert.equal(projected[0].details.summary, 'first unread compact summary', 'mailbox projection details may carry compact summary')
    assert.equal(attentionProjected[0].content.includes(firstUnreadFullBody), false, 'attention prompt should not include full message body')
    assert.equal(attentionProjected[0].content.includes('first unread compact summary'), true, 'attention prompt should include compact summary')
    assert.equal(attentionProjected[0].content.includes(firstUnread.id), true, 'attention prompt should include message id')
    assert.equal(attentionProjected[0].details.text, undefined, 'attention details should not carry full message body')
    assert.equal(attentionProjected[0].options.triggerTurn, true, 'bounded leader attention should trigger a leader turn')
    assert.equal(attentionProjected[0].options.deliverAs, 'followUp', 'bounded leader attention should queue as follow-up, not steer an active turn')
    assert.ok(String(attentionProjected[0].content).includes('Call agentteam_receive({ markRead: true })'), 'attention prompt should preserve receive/read boundary')
    assert.ok(String(attentionProjected[0].content).includes('agentteam_task show/history/reports/report'), 'attention prompt should point to task report/history queries for referenced artifacts')
    assert.ok(String(attentionProjected[0].content).includes('Do not auto-spawn, auto-create downstream tasks, broadcast, or start worker-to-worker chains'), 'attention prompt should prohibit autopilot')
    storedMailbox = env.modules.state.readMailbox(mailboxTeam.name, 'team-lead')
    const firstUnreadAfterProjection = storedMailbox.find(message => message.id === firstUnread.id)
    assert.equal(firstUnreadAfterProjection?.readAt, undefined, 'projection/attention should not mark first message read')
    assert.equal(firstUnreadAfterProjection?.deliveredAt, undefined, 'projection/attention should not mark first message delivered')
    const receiveTool = env.pi.__tools.get('agentteam_receive')
    let receiveResult = await receiveTool.execute('compact-projection-receive-no-read', { markRead: false, limit: 1 }, null, () => {}, mailboxCtx)
    assert.ok(receiveResult.content[0].text.includes(firstUnreadFullBody), 'agentteam_receive output should keep full message body')
    assert.equal(receiveResult.details.messages[0].text, firstUnreadFullBody, 'agentteam_receive details should keep full message body')
    storedMailbox = env.modules.state.readMailbox(mailboxTeam.name, 'team-lead')
    const firstUnreadAfterReceiveNoRead = storedMailbox.find(message => message.id === firstUnread.id)
    assert.ok(firstUnreadAfterReceiveNoRead?.deliveredAt, 'receive should mark returned messages delivered')
    assert.equal(firstUnreadAfterReceiveNoRead?.readAt, undefined, 'receive markRead=false should not mark message read')
    receiveResult = await receiveTool.execute('compact-projection-receive-read', { markRead: true, limit: 1 }, null, () => {}, mailboxCtx)
    assert.ok(receiveResult.content[0].text.includes(firstUnreadFullBody), 'agentteam_receive markRead=true output should keep full message body')
    assert.equal(receiveResult.details.messages[0].text, firstUnreadFullBody, 'agentteam_receive markRead=true details should keep full message body')
    storedMailbox = env.modules.state.readMailbox(mailboxTeam.name, 'team-lead')
    const firstUnreadAfterReceiveRead = storedMailbox.find(message => message.id === firstUnread.id)
    assert.ok(firstUnreadAfterReceiveRead?.readAt, 'receive markRead=true should mark message read')

    mailboxRuntime.runMailboxSync(mailboxCtx)
    projected = env.pi.__messages.slice(messagesBeforeProjection).filter(message => message.customType === 'agentteam-mailbox')
    attentionProjected = env.pi.__messages.slice(messagesBeforeProjection).filter(message => message.customType === 'agentteam-leader-attention')
    assert.deepEqual(projected.map(message => message.details.id), [firstUnread.id], 'repeated automatic sync should not reproject old unread')
    assert.deepEqual(attentionProjected.map(message => message.details.id), [firstUnread.id], 'repeated automatic sync should not duplicate attention wake')

    const secondUnread = env.modules.state.pushMailboxMessage(mailboxTeam.name, 'team-lead', {
      from: 'researcher',
      to: 'team-lead',
      text: 'second unread should project without repeating first',
      type: 'report_done',
    })
    mailboxRuntime.runMailboxSync(mailboxCtx)
    projected = env.pi.__messages.slice(messagesBeforeProjection).filter(message => message.customType === 'agentteam-mailbox')
    attentionProjected = env.pi.__messages.slice(messagesBeforeProjection).filter(message => message.customType === 'agentteam-leader-attention')
    assert.deepEqual(
      projected.map(message => message.details.id),
      [firstUnread.id, secondUnread.id],
      'new unread should project without repeating prior unread',
    )
    assert.deepEqual(
      attentionProjected.map(message => message.details.id),
      [firstUnread.id],
      'leader attention should throttle additional report wake requests within a short window',
    )

    storedMailbox = env.modules.state.readMailbox(mailboxTeam.name, 'team-lead')
    assert.ok(storedMailbox.filter(message => message.id !== firstUnread.id).every(message => !message.readAt), 'projection should not mark mailbox messages read')

    mailboxRuntime.resetMailboxSyncKey()
    mailboxRuntime.runMailboxSync(mailboxCtx)
    projected = env.pi.__messages.slice(messagesBeforeProjection).filter(message => message.customType === 'agentteam-mailbox')
    attentionProjected = env.pi.__messages.slice(messagesBeforeProjection).filter(message => message.customType === 'agentteam-leader-attention')
    assert.deepEqual(
      projected.map(message => message.details.id),
      [firstUnread.id, secondUnread.id],
      'durable projection state should prevent duplicate re-projection after runtime reset',
    )
    assert.deepEqual(
      attentionProjected.map(message => message.details.id),
      [firstUnread.id],
      'durable projection state should also prevent duplicate attention after runtime reset',
    )
    storedMailbox = env.modules.state.readMailbox(mailboxTeam.name, 'team-lead')
    assert.ok(storedMailbox.filter(message => message.id !== firstUnread.id).every(message => !message.readAt), 'projection reset should still not mark mailbox messages read')

    const watcherRuntime = env.modules.runtimeService.createRuntimeService(env.pi)
    const watcherStart = env.pi.__messages.length
    const watcher = watcherRuntime.startLeaderMailboxProjectionWatcher(mailboxCtx)
    assert.ok(watcher, 'leader mailbox projection watcher should start for attached leader session')
    const duplicateWatcher = watcherRuntime.startLeaderMailboxProjectionWatcher(mailboxCtx)
    assert.strictEqual(duplicateWatcher, watcher, 'leader mailbox projection watcher start should be idempotent per session/team')
    const watchedUnread = env.modules.state.pushMailboxMessage(mailboxTeam.name, 'team-lead', {
      from: 'researcher',
      to: 'team-lead',
      text: 'watched mailbox done report should auto-project',
      type: 'report_done',
    })
    await wait(450)
    const watcherProjected = env.pi.__messages.slice(watcherStart).filter(message => message.customType === 'agentteam-mailbox')
    const watcherAttention = env.pi.__messages.slice(watcherStart).filter(message => message.customType === 'agentteam-leader-attention')
    assert.equal(watcherProjected.filter(message => message.details.id === watchedUnread.id).length, 1, 'leader mailbox file watcher should project new worker messages without leader input')
    assert.equal(watcherProjected.find(message => message.details.id === watchedUnread.id)?.options.triggerTurn, false, 'watcher projection should not trigger hidden leader turn')
    assert.equal(watcherAttention.filter(message => message.details.id === watchedUnread.id).length, 1, 'watcher should request bounded leader attention for report_done')
    assert.equal(watcherAttention.find(message => message.details.id === watchedUnread.id)?.options.triggerTurn, true, 'bounded attention wake should trigger a leader turn')
    storedMailbox = env.modules.state.readMailbox(mailboxTeam.name, 'team-lead')
    assert.equal(storedMailbox.find(message => message.id === watchedUnread.id)?.readAt, undefined, 'watcher projection must not mark mailbox read')
    const notifyCountAfterWatchedProjection = mailboxNotifications.length
    watcherRuntime.stopLeaderMailboxProjectionWatcher(mailboxCtx)
    watcherRuntime.stopLeaderMailboxProjectionWatcher(mailboxCtx)
    const stoppedUnread = env.modules.state.pushMailboxMessage(mailboxTeam.name, 'team-lead', {
      from: 'planner',
      to: 'team-lead',
      text: 'stopped watcher should not auto-project',
      type: 'inform',
    })
    await wait(350)
    let watcherAfterStop = env.pi.__messages.slice(watcherStart).filter(message => message.customType === 'agentteam-mailbox')
    assert.equal(watcherAfterStop.filter(message => message.details.id === stoppedUnread.id).length, 0, 'stopped watcher should not auto-project new mailbox writes')
    const restartedWatcher = watcherRuntime.startLeaderMailboxProjectionWatcher(mailboxCtx)
    assert.ok(restartedWatcher, 'leader mailbox projection watcher should restart after stop')
    await wait(450)
    watcherAfterStop = env.pi.__messages.slice(watcherStart).filter(message => message.customType === 'agentteam-mailbox')
    const watcherAttentionAfterStop = env.pi.__messages.slice(watcherStart).filter(message => message.customType === 'agentteam-leader-attention')
    assert.equal(watcherAfterStop.filter(message => message.details.id === stoppedUnread.id).length, 1, 'restarted watcher should project open mailbox writes')
    assert.equal(watcherAttentionAfterStop.filter(message => message.details.id === stoppedUnread.id).length, 0, 'inform-to-leader should not request bounded attention')
    assert.equal(mailboxNotifications.length, notifyCountAfterWatchedProjection + 1, 'restarted watcher projection should notify once for new generation of work')
    watcherRuntime.stopLeaderMailboxProjectionWatcher(mailboxCtx)

    const bridgeOnlyProjectionTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-only-projection-suite',
      leaderSessionFile: '/tmp/bridge-only-projection-leader.jsonl',
      leaderCwd: '/tmp/bridge-only-projection-project',
      description: 'bridge projection test',
    })
    bridgeOnlyProjectionTeam.members['team-lead'].paneId = '%leader'
    bridgeOnlyProjectionTeam.members['team-lead'].windowTarget = 'test:@1'
    env.modules.state.writeTeamState(bridgeOnlyProjectionTeam)
    env.modules.state.writeSessionContext('/tmp/bridge-only-projection-leader.jsonl', {
      teamName: bridgeOnlyProjectionTeam.name,
      memberName: 'team-lead',
    })
    const bridgeOnlyProjectionCtx = env.helpers.createCtx('/tmp/bridge-only-projection-project', '/tmp/bridge-only-projection-leader.jsonl', [])
    const bridgeOnlyProjectionMessage = env.modules.state.pushMailboxMessage(bridgeOnlyProjectionTeam.name, 'team-lead', {
      from: 'worker-a',
      to: 'team-lead',
      text: 'bridge-only native leader attention once',
      type: 'report_done',
      requestId: 'leader-projection-generation-1',
    })
    const bridgeProjectionRuntime = env.modules.runtimeService.createRuntimeService(env.pi)
    const bridgeProjectionStart = env.pi.__messages.length
    bridgeProjectionRuntime.runMailboxSync(bridgeOnlyProjectionCtx)
      let bridgeProjected = env.pi.__messages.slice(bridgeProjectionStart).filter(message => message.customType === 'agentteam-mailbox')
      assert.equal(bridgeProjected.filter(message => message.details.id === bridgeOnlyProjectionMessage.id).length, 1, 'bridge-only projection should project unread once')
      assert.equal(bridgeProjected[0].options.triggerTurn, false, 'bridge-only projection should not trigger hidden turn')
      assert.equal(bridgeProjected[0].options.deliverAs, undefined, 'bridge-only projection should not stack followUp')
      const bridgeAttention = env.pi.__messages.slice(bridgeProjectionStart).filter(message => message.customType === 'agentteam-leader-attention')
      assert.equal(bridgeAttention.filter(message => message.details.id === bridgeOnlyProjectionMessage.id).length, 1, 'report_done should request bounded leader attention in bridge-only mode')
      assert.equal(bridgeAttention[0].options.triggerTurn, true)
      assert.equal(bridgeProjected[0].details.generation, 'leader-projection-generation-1')
      bridgeProjectionRuntime.runMailboxSync(bridgeOnlyProjectionCtx)
      bridgeProjected = env.pi.__messages.slice(bridgeProjectionStart).filter(message => message.customType === 'agentteam-mailbox')
      assert.equal(bridgeProjected.filter(message => message.details.id === bridgeOnlyProjectionMessage.id).length, 1, 'same runtime should not duplicate bridge-only projection')
      assert.equal(env.pi.__messages.slice(bridgeProjectionStart).filter(message => message.customType === 'agentteam-leader-attention' && message.details.id === bridgeOnlyProjectionMessage.id).length, 1, 'same runtime should not duplicate bounded attention')
      const reloadedBridgeProjectionRuntime = env.modules.runtimeService.createRuntimeService(env.pi)
      reloadedBridgeProjectionRuntime.runMailboxSync(bridgeOnlyProjectionCtx)
      bridgeProjected = env.pi.__messages.slice(bridgeProjectionStart).filter(message => message.customType === 'agentteam-mailbox')
      assert.equal(bridgeProjected.filter(message => message.details.id === bridgeOnlyProjectionMessage.id).length, 1, 'runtime reload should not duplicate projected unread')
      assert.equal(env.pi.__messages.slice(bridgeProjectionStart).filter(message => message.customType === 'agentteam-leader-attention' && message.details.id === bridgeOnlyProjectionMessage.id).length, 1, 'runtime reload should not duplicate bounded attention')
      const regeneratedBridgeProjectionMessage = env.modules.state.pushMailboxMessage(bridgeOnlyProjectionTeam.name, 'team-lead', {
        from: 'worker-a',
        to: 'team-lead',
        text: 'bridge-only native leader attention new generation',
        type: 'report_done',
        requestId: 'leader-projection-generation-2',
      })
      bridgeProjectionRuntime.runMailboxSync(bridgeOnlyProjectionCtx)
      bridgeProjected = env.pi.__messages.slice(bridgeProjectionStart).filter(message => message.customType === 'agentteam-mailbox')
      assert.equal(bridgeProjected.filter(message => message.details.id === bridgeOnlyProjectionMessage.id).length, 1, 'same generation should remain projected once after new generation sync')
      assert.equal(bridgeProjected.filter(message => message.details.id === regeneratedBridgeProjectionMessage.id).length, 1, 'new generation/new mailbox message should project once')
      assert.equal(env.pi.__messages.slice(bridgeProjectionStart).filter(message => message.customType === 'agentteam-leader-attention' && message.details.id === regeneratedBridgeProjectionMessage.id).length, 0, 'short-window report regeneration should be projected but attention-throttled')
      assert.equal(bridgeProjected.find(message => message.details.id === regeneratedBridgeProjectionMessage.id)?.details.generation, 'leader-projection-generation-2')
      const projectionState = env.modules.state.getLeaderProjection(bridgeOnlyProjectionTeam.name, bridgeOnlyProjectionMessage.id, 'leader-projection-generation-1')
      assert.equal(projectionState.status, 'projected')
      const attentionState = env.modules.state.getLeaderAttention(bridgeOnlyProjectionTeam.name, bridgeOnlyProjectionMessage.id, 'leader-projection-generation-1')
      assert.equal(attentionState.status, 'sent')
      const regeneratedProjectionState = env.modules.state.getLeaderProjection(bridgeOnlyProjectionTeam.name, regeneratedBridgeProjectionMessage.id, 'leader-projection-generation-2')
      assert.equal(regeneratedProjectionState.status, 'projected')
      const regeneratedAttentionState = env.modules.state.getLeaderAttention(bridgeOnlyProjectionTeam.name, regeneratedBridgeProjectionMessage.id, 'leader-projection-generation-2')
      assert.equal(regeneratedAttentionState.status, 'skipped', 'throttled attention should be recorded separately from projection')
      assert.ok(regeneratedAttentionState.lastError.includes('leader attention already requested recently'), 'throttled attention should record reason without failing projection')
      const bridgeOnlyStoredMailbox = env.modules.state.readMailbox(bridgeOnlyProjectionTeam.name, 'team-lead')
    assert.equal(bridgeOnlyStoredMailbox[0].readAt, undefined, 'bridge projection must not mark read')

    const bridgeOnlyFailureTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-only-projection-failure-suite',
      leaderSessionFile: '/tmp/bridge-only-projection-failure-leader.jsonl',
      leaderCwd: '/tmp/bridge-only-projection-failure-project',
    })
    env.modules.state.writeTeamState(bridgeOnlyFailureTeam)
    env.modules.state.writeSessionContext('/tmp/bridge-only-projection-failure-leader.jsonl', {
      teamName: bridgeOnlyFailureTeam.name,
      memberName: 'team-lead',
    })
    const bridgeOnlyFailureCtx = env.helpers.createCtx('/tmp/bridge-only-projection-failure-project', '/tmp/bridge-only-projection-failure-leader.jsonl', [])
    const bridgeOnlyFailureMessage = env.modules.state.pushMailboxMessage(bridgeOnlyFailureTeam.name, 'team-lead', {
      from: 'worker-b',
      to: 'team-lead',
      text: 'bridge-only projection retry after failure',
      type: 'report_blocked',
    })

    env.modules.leaderAttention.resetLeaderAttentionThrottle()
    const originalPiSendMessage = env.pi.sendMessage
    const bridgeOnlyFailureRuntime = env.modules.runtimeService.createRuntimeService(env.pi)
    const bridgeFailureStart = env.pi.__messages.length
    let bridgeProjectionThrowOnce = true
    env.pi.sendMessage = (message, options) => {
      if (message.customType === 'agentteam-mailbox' && message.details.id === bridgeOnlyFailureMessage.id && bridgeProjectionThrowOnce) {
        bridgeProjectionThrowOnce = false
        throw new Error('bridge projection failed once')
      }
      return originalPiSendMessage.call(env.pi, message, options)
    }
    try {
      bridgeOnlyFailureRuntime.runMailboxSync(bridgeOnlyFailureCtx)
      let bridgeFailedProjection = env.pi.__messages.slice(bridgeFailureStart).filter(message => message.customType === 'agentteam-mailbox')
      let bridgeFailureAttention = env.pi.__messages.slice(bridgeFailureStart).filter(message => message.customType === 'agentteam-leader-attention')
      assert.equal(bridgeFailedProjection.filter(message => message.details.id === bridgeOnlyFailureMessage.id).length, 0, 'failed bridge projection should not emit visible message')
      assert.equal(bridgeFailureAttention.filter(message => message.details.id === bridgeOnlyFailureMessage.id).length, 0, 'failed bridge projection should not request bounded attention')
      assert.equal(env.modules.state.getLeaderProjection(bridgeOnlyFailureTeam.name, bridgeOnlyFailureMessage.id, bridgeOnlyFailureMessage.createdAt).status, 'failed')
      bridgeOnlyFailureRuntime.runMailboxSync(bridgeOnlyFailureCtx)
      bridgeFailedProjection = env.pi.__messages.slice(bridgeFailureStart).filter(message => message.customType === 'agentteam-mailbox')
      bridgeFailureAttention = env.pi.__messages.slice(bridgeFailureStart).filter(message => message.customType === 'agentteam-leader-attention')
      assert.equal(bridgeFailedProjection.filter(message => message.details.id === bridgeOnlyFailureMessage.id).length, 1, 'failed bridge projection should retry once')
      assert.equal(bridgeFailureAttention.filter(message => message.details.id === bridgeOnlyFailureMessage.id).length, 1, 'successful bridge retry should request bounded attention once')
      bridgeOnlyFailureRuntime.runMailboxSync(bridgeOnlyFailureCtx)
      bridgeFailedProjection = env.pi.__messages.slice(bridgeFailureStart).filter(message => message.customType === 'agentteam-mailbox')
      bridgeFailureAttention = env.pi.__messages.slice(bridgeFailureStart).filter(message => message.customType === 'agentteam-leader-attention')
      assert.equal(bridgeFailedProjection.filter(message => message.details.id === bridgeOnlyFailureMessage.id).length, 1, 'successful retry should not duplicate')
      assert.equal(bridgeFailureAttention.filter(message => message.details.id === bridgeOnlyFailureMessage.id).length, 1, 'successful retry should not duplicate bounded attention')

      const attentionFailureTeam = env.modules.state.createInitialTeamState({
        teamName: 'leader-attention-failure-suite',
        leaderSessionFile: '/tmp/leader-attention-failure-leader.jsonl',
        leaderCwd: '/tmp/leader-attention-failure-project',
      })
      env.modules.state.writeTeamState(attentionFailureTeam)
      env.modules.state.writeSessionContext('/tmp/leader-attention-failure-leader.jsonl', {
        teamName: attentionFailureTeam.name,
        memberName: 'team-lead',
      })
      const attentionFailureCtx = env.helpers.createCtx('/tmp/leader-attention-failure-project', '/tmp/leader-attention-failure-leader.jsonl', [])
      const attentionFailureMessage = env.modules.state.pushMailboxMessage(attentionFailureTeam.name, 'team-lead', {
        from: 'worker-c',
        to: 'team-lead',
        text: 'attention send should fail once then retry',
        type: 'report_done',
      })
      env.modules.leaderAttention.resetLeaderAttentionThrottle()
      const attentionFailureRuntime = env.modules.runtimeService.createRuntimeService(env.pi)
      const attentionFailureStart = env.pi.__messages.length
      let attentionThrowOnce = true
      env.pi.sendMessage = (message, options) => {
        if (message.customType === 'agentteam-leader-attention' && message.details.id === attentionFailureMessage.id && attentionThrowOnce) {
          attentionThrowOnce = false
          throw new Error('attention send failed once')
        }
        return originalPiSendMessage.call(env.pi, message, options)
      }
      attentionFailureRuntime.runMailboxSync(attentionFailureCtx)
      let attentionFailureMailboxProjection = env.pi.__messages.slice(attentionFailureStart).filter(message => message.customType === 'agentteam-mailbox' && message.details.id === attentionFailureMessage.id)
      let attentionFailureAttention = env.pi.__messages.slice(attentionFailureStart).filter(message => message.customType === 'agentteam-leader-attention' && message.details.id === attentionFailureMessage.id)
      assert.equal(attentionFailureMailboxProjection.length, 1, 'mailbox projection may emit before attention send failure')
      assert.equal(attentionFailureAttention.length, 0, 'failed bounded attention send should not emit attention message')
      let attentionProjectionState = env.modules.state.getLeaderProjection(attentionFailureTeam.name, attentionFailureMessage.id, attentionFailureMessage.createdAt)
      assert.equal(attentionProjectionState.status, 'projected', 'attention send failure must not make successful mailbox projection retryable')
      assert.equal(attentionProjectionState.lastError, undefined, 'attention failure should not be stored on projection state')
      let attentionRetryState = env.modules.state.getLeaderAttention(attentionFailureTeam.name, attentionFailureMessage.id, attentionFailureMessage.createdAt)
      assert.equal(attentionRetryState.status, 'failed', 'attention send failure should leave only attention retryable')
      assert.equal(attentionRetryState.lastError, 'attention send failed once')
      let attentionFailureStoredMailbox = env.modules.state.readMailbox(attentionFailureTeam.name, 'team-lead')
      assert.equal(attentionFailureStoredMailbox.find(message => message.id === attentionFailureMessage.id)?.readAt, undefined, 'attention send failure must not mark mailbox read')
      assert.equal(attentionFailureStoredMailbox.find(message => message.id === attentionFailureMessage.id)?.deliveredAt, undefined, 'attention send failure must not mark mailbox delivered')
      env.pi.sendMessage = originalPiSendMessage
      attentionFailureRuntime.runMailboxSync(attentionFailureCtx)
      attentionFailureMailboxProjection = env.pi.__messages.slice(attentionFailureStart).filter(message => message.customType === 'agentteam-mailbox' && message.details.id === attentionFailureMessage.id)
      attentionFailureAttention = env.pi.__messages.slice(attentionFailureStart).filter(message => message.customType === 'agentteam-leader-attention' && message.details.id === attentionFailureMessage.id)
      assert.equal(attentionFailureMailboxProjection.length, 1, 'attention retry should not reproject an already visible mailbox notification')
      assert.equal(attentionFailureAttention.length, 1, 'next sync should retry and successfully send bounded attention')
      assert.equal(attentionFailureAttention[0].options.triggerTurn, true)
      assert.equal(attentionFailureAttention[0].options.deliverAs, 'followUp')
      attentionProjectionState = env.modules.state.getLeaderProjection(attentionFailureTeam.name, attentionFailureMessage.id, attentionFailureMessage.createdAt)
      assert.equal(attentionProjectionState.status, 'projected')
      attentionRetryState = env.modules.state.getLeaderAttention(attentionFailureTeam.name, attentionFailureMessage.id, attentionFailureMessage.createdAt)
      assert.equal(attentionRetryState.status, 'sent')
      attentionFailureRuntime.runMailboxSync(attentionFailureCtx)
      attentionFailureMailboxProjection = env.pi.__messages.slice(attentionFailureStart).filter(message => message.customType === 'agentteam-mailbox' && message.details.id === attentionFailureMessage.id)
      attentionFailureAttention = env.pi.__messages.slice(attentionFailureStart).filter(message => message.customType === 'agentteam-leader-attention' && message.details.id === attentionFailureMessage.id)
      assert.equal(attentionFailureMailboxProjection.length, 1, 'sent attention state should not duplicate mailbox projection')
      assert.equal(attentionFailureAttention.length, 1, 'sent attention state should not duplicate bounded attention')
      attentionFailureStoredMailbox = env.modules.state.readMailbox(attentionFailureTeam.name, 'team-lead')
      assert.equal(attentionFailureStoredMailbox.find(message => message.id === attentionFailureMessage.id)?.readAt, undefined, 'successful retry must still preserve read boundary')
      assert.equal(attentionFailureStoredMailbox.find(message => message.id === attentionFailureMessage.id)?.deliveredAt, undefined, 'successful retry must not mark delivered')
    } finally {
      env.pi.sendMessage = originalPiSendMessage
    }

    env.modules.leaderAttention.resetLeaderAttentionThrottle()
    const retryRuntime = env.modules.runtimeService.createRuntimeService(env.pi)
    const retryMessagesStart = env.pi.__messages.length
    const retryUnread = env.modules.state.pushMailboxMessage(mailboxTeam.name, 'team-lead', {
      from: 'implementer',
      to: 'team-lead',
      text: 'retry projection after send failure',
      type: 'question',
    })
    let throwOnce = true
    env.pi.sendMessage = (message, options) => {
      if (message.details.id === retryUnread.id && throwOnce) {
        throwOnce = false
        throw new Error('projection failed once')
      }
      return originalPiSendMessage.call(env.pi, message, options)
    }
    retryRuntime.runMailboxSync(mailboxCtx)
    projected = env.pi.__messages.slice(retryMessagesStart).filter(message => message.customType === 'agentteam-mailbox')
    let retryAttention = env.pi.__messages.slice(retryMessagesStart).filter(message => message.customType === 'agentteam-leader-attention')
    assert.equal(projected.some(message => message.details.id === retryUnread.id), false, 'failed projection should not be recorded as delivered/projected')
    assert.equal(retryAttention.some(message => message.details.id === retryUnread.id), false, 'failed projection should not request attention')
    retryRuntime.runMailboxSync(mailboxCtx)
    projected = env.pi.__messages.slice(retryMessagesStart).filter(message => message.customType === 'agentteam-mailbox')
    retryAttention = env.pi.__messages.slice(retryMessagesStart).filter(message => message.customType === 'agentteam-leader-attention')
    assert.equal(projected.filter(message => message.details.id === retryUnread.id).length, 1, 'second sync should retry failed projection once')
    assert.equal(retryAttention.filter(message => message.details.id === retryUnread.id).length, 1, 'successful retry should request bounded attention once')
    retryRuntime.runMailboxSync(mailboxCtx)
    projected = env.pi.__messages.slice(retryMessagesStart).filter(message => message.customType === 'agentteam-mailbox')
    retryAttention = env.pi.__messages.slice(retryMessagesStart).filter(message => message.customType === 'agentteam-leader-attention')
    assert.equal(projected.filter(message => message.details.id === retryUnread.id).length, 1, 'successful retry should not duplicate on later sync')
    assert.equal(retryAttention.filter(message => message.details.id === retryUnread.id).length, 1, 'successful retry should not duplicate bounded attention on later sync')

    const mixedRuntime = env.modules.runtimeService.createRuntimeService(env.pi)
    const mixedMessagesStart = env.pi.__messages.length
    const mixedSuccess = env.modules.state.pushMailboxMessage(mailboxTeam.name, 'team-lead', {
      from: 'planner',
      to: 'team-lead',
      text: 'mixed projection succeeds before failure',
      type: 'inform',
    })
    const mixedFailure = env.modules.state.pushMailboxMessage(mailboxTeam.name, 'team-lead', {
      from: 'researcher',
      to: 'team-lead',
      text: 'mixed projection fails first time',
      type: 'question',
    })
    let failedMixedOnce = false
    env.pi.sendMessage = (message, options) => {
      if (message.details.id === mixedFailure.id && !failedMixedOnce) {
        failedMixedOnce = true
        throw new Error('mixed projection failed')
      }
      return originalPiSendMessage.call(env.pi, message, options)
    }
    mixedRuntime.runMailboxSync(mailboxCtx)
    projected = env.pi.__messages.slice(mixedMessagesStart).filter(message => message.customType === 'agentteam-mailbox')
    let mixedAttention = env.pi.__messages.slice(mixedMessagesStart).filter(message => message.customType === 'agentteam-leader-attention')
    assert.equal(projected.filter(message => message.details.id === mixedSuccess.id).length, 1, 'mixed sync should record successful projection')
    assert.equal(projected.filter(message => message.details.id === mixedFailure.id).length, 0, 'mixed sync should leave failed projection eligible')
    assert.equal(mixedAttention.filter(message => message.details.id === mixedSuccess.id).length, 0, 'inform success should not request bounded attention')
    assert.equal(mixedAttention.filter(message => message.details.id === mixedFailure.id).length, 0, 'failed question projection should not request bounded attention')
    mixedRuntime.resetMailboxSyncKey()
    mixedRuntime.runMailboxSync(mailboxCtx)
    projected = env.pi.__messages.slice(mixedMessagesStart).filter(message => message.customType === 'agentteam-mailbox')
    mixedAttention = env.pi.__messages.slice(mixedMessagesStart).filter(message => message.customType === 'agentteam-leader-attention')
    assert.equal(projected.filter(message => message.details.id === mixedSuccess.id).length, 1, 'mixed retry should not duplicate previously successful projection')
    assert.equal(projected.filter(message => message.details.id === mixedFailure.id).length, 1, 'mixed retry should retry only failed projection')
    assert.equal(mixedAttention.filter(message => message.details.id === mixedFailure.id).length, 1, 'mixed retry should request bounded attention for question')
    env.pi.sendMessage = originalPiSendMessage

    const receiveFoldingTeam = env.modules.state.createInitialTeamState({
      teamName: 'receive-output-folding-suite',
      leaderSessionFile: '/tmp/receive-output-folding-leader.jsonl',
      leaderCwd: '/tmp/receive-output-folding-project',
    })
    env.modules.state.writeTeamState(receiveFoldingTeam)
    env.modules.state.writeSessionContext('/tmp/receive-output-folding-leader.jsonl', {
      teamName: receiveFoldingTeam.name,
      memberName: 'team-lead',
    })
    const receiveFoldingCtx = env.helpers.createCtx('/tmp/receive-output-folding-project', '/tmp/receive-output-folding-leader.jsonl', [])
    const receiveFoldingTool = env.pi.__tools.get('agentteam_receive')
    const firstGroupedFullText = 'UNIQUE-RECEIVE-FOLD-FULL-BODY-ONE '.repeat(8).trim()
    const secondGroupedFullText = 'UNIQUE-RECEIVE-FOLD-FULL-BODY-TWO '.repeat(8).trim()
    const unscopedFullText = 'UNIQUE-RECEIVE-FOLD-UNSCOPED-FULL-BODY '.repeat(8).trim()
    const otherTaskFullText = 'UNIQUE-RECEIVE-FOLD-OTHER-TASK-FULL-BODY '.repeat(8).trim()
    const limitedOutFullText = 'UNIQUE-RECEIVE-FOLD-LIMITED-OUT-FULL-BODY '.repeat(8).trim()
    const firstGroupedReceive = env.modules.state.pushMailboxMessage(receiveFoldingTeam.name, 'team-lead', {
      from: 'planner',
      to: 'team-lead',
      text: firstGroupedFullText,
      summary: 'first grouped receive summary',
      type: 'question',
      taskId: 'T100',
      threadId: 'task:T100',
      priority: 'high',
      wakeHint: 'soft',
      createdAt: 1001,
    })
    const secondGroupedReceive = env.modules.state.pushMailboxMessage(receiveFoldingTeam.name, 'team-lead', {
      from: 'implementer',
      to: 'team-lead',
      text: secondGroupedFullText,
      summary: 'second grouped receive summary',
      type: 'report_done',
      taskId: 'T100',
      threadId: 'task:T100',
      priority: 'normal',
      wakeHint: 'hard',
      createdAt: 1002,
    })
    const unscopedReceive = env.modules.state.pushMailboxMessage(receiveFoldingTeam.name, 'team-lead', {
      from: 'researcher',
      to: 'team-lead',
      text: unscopedFullText,
      summary: 'unscoped receive summary',
      type: 'inform',
      createdAt: 1003,
    })
    const otherTaskReceive = env.modules.state.pushMailboxMessage(receiveFoldingTeam.name, 'team-lead', {
      from: 'implementer',
      to: 'team-lead',
      text: otherTaskFullText,
      summary: 'other task receive summary',
      type: 'report_blocked',
      taskId: 'T200',
      threadId: 'task:T200',
      priority: 'high',
      wakeHint: 'hard',
      createdAt: 1004,
    })
    const limitedOutReceive = env.modules.state.pushMailboxMessage(receiveFoldingTeam.name, 'team-lead', {
      from: 'planner',
      to: 'team-lead',
      text: limitedOutFullText,
      summary: 'limited out receive summary',
      type: 'question',
      taskId: 'T300',
      threadId: 'task:T300',
      priority: 'normal',
      wakeHint: 'soft',
      createdAt: 1005,
    })
    let foldedReceiveResult = await receiveFoldingTool.execute('receive-folding-limit', { markRead: false, limit: 4 }, null, () => {}, receiveFoldingCtx)
    const foldedReceiveText = foldedReceiveResult.content[0].text
    assert.ok(foldedReceiveText.includes('Received 4 messages from planner, implementer, researcher'), 'multi receive should keep receipt identity')
    assert.ok(foldedReceiveText.includes('Grouped by task/thread'), 'multi receive should describe grouped compact output')
    assert.ok(foldedReceiveText.includes('task=T100 thread=task:T100 (2 messages'), 'same task/thread messages should fold under one group header')
    assert.ok(foldedReceiveText.includes('unscoped (1 message'), 'unscoped messages should have a separate group')
    assert.ok(foldedReceiveText.includes('task=T200 thread=task:T200 (1 message'), 'different task/thread messages should have a separate group')
    assert.ok(foldedReceiveText.includes(`id=${firstGroupedReceive.id}`) && foldedReceiveText.includes('from=planner') && foldedReceiveText.includes('[question]'), 'compact items should keep id/type/from identity')
    assert.ok(foldedReceiveText.includes('summary=first grouped receive summary'), 'compact items should include summary when present')
    assert.ok(foldedReceiveText.includes('preview=first grouped receive summary'), 'compact items should include a preview without full body repetition')
    assert.equal(foldedReceiveText.includes(firstGroupedFullText), false, 'multi receive human output should not print first full body')
    assert.equal(foldedReceiveText.includes(secondGroupedFullText), false, 'multi receive human output should not print second full body')
    assert.equal(foldedReceiveText.includes(unscopedFullText), false, 'multi receive human output should not print unscoped full body')
    assert.equal(foldedReceiveText.includes(otherTaskFullText), false, 'multi receive human output should not print other-task full body')
    assert.equal(foldedReceiveText.includes(limitedOutFullText), false, 'limit should exclude later unread from human output')
    assert.deepEqual(foldedReceiveResult.details.messages.map(message => message.id), [
      firstGroupedReceive.id,
      secondGroupedReceive.id,
      unscopedReceive.id,
      otherTaskReceive.id,
    ], 'receive limit should return only first N unread messages in created order')
    assert.deepEqual(foldedReceiveResult.details.messages.map(message => message.text), [
      firstGroupedFullText,
      secondGroupedFullText,
      unscopedFullText,
      otherTaskFullText,
    ], 'details.messages should preserve full text for returned folded messages')
    let receiveFoldingMailbox = env.modules.state.readMailbox(receiveFoldingTeam.name, 'team-lead')
    for (const returnedId of [firstGroupedReceive.id, secondGroupedReceive.id, unscopedReceive.id, otherTaskReceive.id]) {
      const stored = receiveFoldingMailbox.find(message => message.id === returnedId)
      assert.ok(stored?.deliveredAt, 'markRead=false should stamp deliveredAt on returned ids')
      assert.equal(stored?.readAt, undefined, 'markRead=false should not stamp readAt on returned ids')
    }
    const limitedOutStored = receiveFoldingMailbox.find(message => message.id === limitedOutReceive.id)
    assert.equal(limitedOutStored?.deliveredAt, undefined, 'receive limit should not stamp deliveredAt on excluded ids')
    assert.equal(limitedOutStored?.readAt, undefined, 'receive limit should not stamp readAt on excluded ids')

    foldedReceiveResult = await receiveFoldingTool.execute('receive-folding-read-first-delivered-unread', { markRead: true, limit: 1 }, null, () => {}, receiveFoldingCtx)
    assert.equal(foldedReceiveResult.details.messages[0].id, firstGroupedReceive.id, 'markRead=false delivery should not remove a message from the unread receive order')
    assert.ok(foldedReceiveResult.content[0].text.includes(firstGroupedFullText), 'single receive should remain clear/full')
    receiveFoldingMailbox = env.modules.state.readMailbox(receiveFoldingTeam.name, 'team-lead')
    const firstGroupedAfterRead = receiveFoldingMailbox.find(message => message.id === firstGroupedReceive.id)
    assert.ok(firstGroupedAfterRead?.deliveredAt, 'markRead=true should preserve/stamp deliveredAt on returned id')
    assert.ok(firstGroupedAfterRead?.readAt, 'markRead=true should stamp readAt on returned id')
    for (const notReturnedId of [secondGroupedReceive.id, unscopedReceive.id, otherTaskReceive.id]) {
      const stored = receiveFoldingMailbox.find(message => message.id === notReturnedId)
      assert.equal(stored?.readAt, undefined, 'markRead=true limit should not read delivered unread ids outside returned set')
    }
    const limitedOutAfterFirstRead = receiveFoldingMailbox.find(message => message.id === limitedOutReceive.id)
    assert.equal(limitedOutAfterFirstRead?.deliveredAt, undefined, 'markRead=true limit should not deliver ids outside returned set')
    assert.equal(limitedOutAfterFirstRead?.readAt, undefined, 'markRead=true limit should not read ids outside returned set')

    foldedReceiveResult = await receiveFoldingTool.execute('receive-folding-read-rest', { markRead: true, limit: 50 }, null, () => {}, receiveFoldingCtx)
    assert.deepEqual(foldedReceiveResult.details.messages.map(message => message.id), [
      secondGroupedReceive.id,
      unscopedReceive.id,
      otherTaskReceive.id,
      limitedOutReceive.id,
    ], 'after one read, receive should return remaining unread in created order, including the previously limit-excluded id')
    assert.equal(foldedReceiveResult.details.messages.find(message => message.id === limitedOutReceive.id)?.text, limitedOutFullText, 'details.messages should preserve full text for previously excluded message')
    receiveFoldingMailbox = env.modules.state.readMailbox(receiveFoldingTeam.name, 'team-lead')
    for (const returnedId of [secondGroupedReceive.id, unscopedReceive.id, otherTaskReceive.id, limitedOutReceive.id]) {
      const stored = receiveFoldingMailbox.find(message => message.id === returnedId)
      assert.ok(stored?.deliveredAt, 'markRead=true should stamp deliveredAt on returned remaining ids')
      assert.ok(stored?.readAt, 'markRead=true should stamp readAt on returned remaining ids')
    }

  },
}
