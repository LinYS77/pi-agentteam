const assert = require('node:assert/strict')

module.exports = {
  name: 'leader wake + permission guards',
  async run(env) {
    const { pi, modules, helpers, sentPrompts, notifications } = env
    const tool = name => pi.__tools.get(name)
    const legacyNotes = task => Array.isArray(task?.notes) ? task.notes : []

    const leaderCtx = helpers.createCtx('/tmp/guard-suite-project', '/tmp/guard-suite-leader.jsonl', notifications)

    let res = await tool('agentteam_create').execute('guard-create', {
      team_name: 'guard-suite-team',
      description: 'Guard and delivery regression suite',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created team guard-suite-team')

    res = await tool('agentteam_spawn').execute('guard-spawn-r', {
      name: 'researcher-guard',
      role: 'researcher',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created idle teammate researcher-guard (researcher)')

    res = await tool('agentteam_spawn').execute('guard-spawn-p', {
      name: 'planner-guard',
      role: 'planner',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created idle teammate planner-guard (planner)')

    res = await tool('agentteam_spawn').execute('guard-spawn-i', {
      name: 'implementer-guard',
      role: 'implementer',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created idle teammate implementer-guard (implementer)')

    const team = modules.state.readTeamState('guard-suite-team')
    assert.ok(team, 'guard-suite-team should exist')

    const plannerCtx = helpers.createCtx('/tmp/guard-suite-project', team.members['planner-guard'].sessionFile, notifications)
    const researcherCtx = helpers.createCtx('/tmp/guard-suite-project', team.members['researcher-guard'].sessionFile, notifications)
    const implementerCtx = helpers.createCtx('/tmp/guard-suite-project', team.members['implementer-guard'].sessionFile, notifications)

    pi.__messages.length = 0
    sentPrompts.length = 0
    res = await tool('agentteam_send').execute('guard-bridge-request-single-path', {
      to: 'planner-guard',
      message: 'single bridge delivery smoke',
      type: 'question',
    }, null, () => {}, leaderCtx)
    assert.deepEqual(res.details.recipients, ['planner-guard'])
    assert.equal(res.details.wakeByRecipient[0].method, 'bridge_requested')
    assert.equal(res.details.wakeByRecipient[0].attempted, false)
    assert.equal(res.details.wakeByRecipient[0].ok, true)
    assert.ok(res.details.wakeByRecipient[0].requestId, 'bridge delivery should expose a durable request id')
    assert.equal(sentPrompts.length, 0, 'delivery should not inject text into visible panes')
    assert.equal(pi.__messages.filter(message => message.customType === 'user-message').length, 0, 'send side effect should not native-submit from leader process')
    let plannerMailbox = modules.state.readMailbox('guard-suite-team', 'planner-guard')
    let bridgeMessage = plannerMailbox.find(item => item.text.includes('single bridge delivery smoke'))
    assert.equal(bridgeMessage?.deliveredAt, undefined, 'bridge request should not mark mailbox delivered')
    assert.equal(bridgeMessage?.readAt, undefined, 'bridge request should not mark mailbox read')
    const bridgeRequests = Object.values(modules.state.readDeliveryRequestStore('guard-suite-team').requests)
      .filter(request => request.memberName === 'planner-guard' && request.messageIds.includes(bridgeMessage.id))
    assert.equal(bridgeRequests.length, 1, 'bridge delivery should persist one request')

    modules.runtimeBridge.markBridgeStopped('guard-suite-team', 'planner-guard', Date.now(), 'test unavailable')
    sentPrompts.length = 0
    res = await tool('agentteam_send').execute('guard-bridge-unavailable-pending', {
      to: 'planner-guard',
      message: 'bridge unavailable smoke',
      type: 'question',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.wakeByRecipient[0].method, 'bridge_requested')
    assert.equal(res.details.wakeByRecipient[0].ok, false)
    assert.equal(res.details.wakeByRecipient[0].attempted, false)
    assert.equal(res.details.wakeByRecipient[0].reason, 'bridge unavailable in bridge-only delivery mode')
    assert.ok(res.details.wakeByRecipient[0].requestId, 'unavailable bridge should still create durable request')
    assert.equal(sentPrompts.length, 0, 'unavailable bridge should remain pending without pane injection')
    plannerMailbox = modules.state.readMailbox('guard-suite-team', 'planner-guard')
    const unavailableMessage = plannerMailbox.find(item => item.text.includes('bridge unavailable smoke'))
    assert.equal(unavailableMessage?.deliveredAt, undefined, 'unavailable bridge should leave mailbox undelivered')
    assert.equal(unavailableMessage?.readAt, undefined, 'unavailable bridge should leave mailbox unread')
    const plannerAfterUnavailable = modules.state.readTeamState('guard-suite-team').members['planner-guard']
    assert.equal(plannerAfterUnavailable.bridgeLastError, 'bridge unavailable in bridge-only delivery mode')
    assert.equal(plannerAfterUnavailable.lastWakeReason, 'bridge unavailable in bridge-only delivery mode')
    assert.ok(plannerAfterUnavailable.bridgeWorkRequestedAt, 'unavailable bridge should keep pending request visible')
    assert.ok(plannerAfterUnavailable.bridgeWorkRequestMessageIds.includes(unavailableMessage.id))

    modules.runtimeBridge.publishBridgeLease({
      teamName: 'guard-suite-team',
      memberName: 'planner-guard',
      sessionFile: team.members['planner-guard'].sessionFile,
    })

    res = await tool('agentteam_task').execute('guard-task-create', {
      action: 'create',
      title: 'Guard smoke task',
      description: 'Used to validate leader delivery and permissions',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created T001')

    res = await tool('agentteam_task').execute('guard-assign-leader', {
      action: 'assign',
      taskId: 'T001',
      owner: 'researcher-guard',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Assigned T001')

    const messageService = helpers.requireDist('tools/messageService.js')
    res = await messageService.executeSendMessage({
      to: 'researcher-guard',
      message: 'You were assigned shared task T001: Guard smoke task\n\nUsed to validate leader delivery and permissions',
      summary: 'Assigned T001',
      type: 'assignment',
      taskId: 'T001',
    }, leaderCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      requestWorkerDelivery: async () => {
        throw new Error('simulated worker delivery failure')
      },
    }))
    assert.deepEqual(res.details.recipients, ['researcher-guard'])
    helpers.assertContains(res.content[0].text, 'warning side effects failed')
    assert.equal(res.details.warning, 'side_effect_failed')
    assert.ok(res.details.sideEffectWarnings.some(item => item.kind === 'requestWorkerDelivery' && item.error.includes('simulated worker delivery failure')))
    assert.equal(res.details.wakeByRecipient[0].ok, false)

    res = await tool('agentteam_send').execute('guard-assign-leader', {
      to: 'researcher-guard',
      message: 'You were assigned shared task T001: Guard smoke task\n\nUsed to validate leader delivery and permissions',
      summary: 'Assigned T001',
      type: 'assignment',
      taskId: 'T001',
    }, null, () => {}, leaderCtx)
    assert.deepEqual(res.details.recipients, ['researcher-guard'])
    assert.equal(res.details.wakeByRecipient[0].method, 'bridge_requested')
    assert.ok(res.details.wakeByRecipient[0].requestId)

    res = await tool('agentteam_spawn').execute('guard-spawn-denied', {
      name: 'illegal-worker',
      role: 'researcher',
    }, null, () => {}, plannerCtx)
    helpers.assertContains(res.content[0].text, 'Only team-lead can perform this operation')

    res = await tool('agentteam_task').execute('guard-task-create-planner-denied', {
      action: 'create',
      title: 'planner-created-task',
      description: 'planner should be advisory by default',
    }, null, () => {}, plannerCtx)
    assert.equal(res.details.denied, true)
    helpers.assertContains(res.content[0].text, "Task action 'create' is leader-only")

    res = await tool('agentteam_task').execute('guard-task-create-implementer-denied', {
      action: 'create',
      title: 'illegal',
      description: 'illegal',
    }, null, () => {}, implementerCtx)
    helpers.assertContains(res.content[0].text, "Task action 'create' is leader-only")

    res = await tool('agentteam_task').execute('guard-task-create-leader-for-planner-report', {
      action: 'create',
      title: 'planner-report-task',
      description: 'leader-created task used to validate planner report-only done report',
      owner: 'planner-guard',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created T002')

    res = await tool('agentteam_task').execute('guard-task-assign-planner-denied', {
      action: 'assign',
      taskId: 'T002',
      owner: 'planner-guard',
    }, null, () => {}, plannerCtx)
    assert.equal(res.details.denied, true)
    helpers.assertContains(res.content[0].text, "Task action 'assign' is leader-only")

    res = await tool('agentteam_task').execute('guard-task-close-planner-report-only', {
      action: 'report_done',
      taskId: 'T002',
      note: 'planner done planning breakdown',
    }, null, () => {}, plannerCtx)
    helpers.assertContains(res.content[0].text, 'Reported done for T002 to team-lead')
    assert.equal(res.details.reportOnly, true)

    const plannerCompleteTeam = modules.state.readTeamState('guard-suite-team')
    const plannerCompleteTask = plannerCompleteTeam.tasks['T002']
    assert.equal(plannerCompleteTask.status, 'open', 'planner close should not mutate task status')
    assert.equal(legacyNotes(plannerCompleteTask).length, 0, 'planner done report should not append legacy task notes')
    const plannerCompletionReport = Object.values(plannerCompleteTeam.taskReports).find(report =>
      report.taskId === 'T002' &&
      report.author === 'planner-guard' &&
      report.text.includes('planner done planning breakdown') &&
      report.reportOnly === true,
    )
    assert.ok(plannerCompletionReport, 'planner done report should preserve planner content as TaskReport')
    assert.equal(legacyNotes(plannerCompleteTask).filter(note => note.text.startsWith('Linked message:') && note.text.includes('done report by planner-guard')).length, 0, 'planner done report should not append linked mailbox task note')

    res = await tool('agentteam_send').execute('guard-planner-long-send-allowed', {
      to: 'team-lead',
      type: 'inform',
      message: `LONG-${'x'.repeat(700)}`,
    }, null, () => {}, plannerCtx)
    assert.deepEqual(res.details.recipients, ['team-lead'])
    assert.equal(Boolean(res.details.denied), false)

    const unsupportedSendLeaderMailboxBefore = modules.state.readMailbox('guard-suite-team', 'team-lead').length
    const unsupportedSendResearcherMailboxBefore = modules.state.readMailbox('guard-suite-team', 'researcher-guard').length
    const unsupportedSendEventsBefore = modules.state.readTeamState('guard-suite-team').events?.length ?? 0
    const unsupportedSendRequestsBefore = Object.keys(modules.state.readDeliveryRequestStore('guard-suite-team').requests).length
    for (const unsupportedType of ['fyi', 'blocked', 'report_done']) {
      res = await tool('agentteam_send').execute(`guard-${unsupportedType}-unsupported`, {
        to: 'team-lead',
        type: unsupportedType,
        message: `${unsupportedType} no longer belongs to agentteam_send`,
        taskId: 'T002',
      }, null, () => {}, plannerCtx)
      assert.equal(res.details.denied, true)
      assert.equal(res.details.reason, 'unsupported_message_type')
      assert.equal(res.details.type, unsupportedType)
      helpers.assertContains(res.content[0].text, 'Allowed types: assignment, question, inform')
    }
    assert.equal(modules.state.readMailbox('guard-suite-team', 'team-lead').length, unsupportedSendLeaderMailboxBefore, 'unsupported send types should not write leader mailbox')
    assert.equal(modules.state.readMailbox('guard-suite-team', 'researcher-guard').length, unsupportedSendResearcherMailboxBefore, 'unsupported send types should not write peer mailbox')
    assert.equal(modules.state.readTeamState('guard-suite-team').events?.length ?? 0, unsupportedSendEventsBefore, 'unsupported send types should not append event')
    assert.equal(Object.keys(modules.state.readDeliveryRequestStore('guard-suite-team').requests).length, unsupportedSendRequestsBefore, 'unsupported send types should not request delivery')

    res = await tool('agentteam_task').execute('guard-task-create-impl-owned', {
      action: 'create',
      title: 'implementer-done report-template-task',
      description: 'validate done report template for implementer',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created T003')

    res = await tool('agentteam_task').execute('guard-assign-impl-owned', {
      action: 'assign',
      taskId: 'T003',
      owner: 'implementer-guard',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Assigned T003')

    res = await tool('agentteam_send').execute('guard-assign-impl-owned', {
      to: 'implementer-guard',
      message: 'You were assigned shared task T003: implementer-done report-template-task\n\nvalidate done report template for implementer',
      summary: 'Assigned T003',
      type: 'assignment',
      taskId: 'T003',
    }, null, () => {}, leaderCtx)
    assert.deepEqual(res.details.recipients, ['implementer-guard'])

    res = await tool('agentteam_task').execute('guard-task-close-impl-template', {
      action: 'report_done',
      taskId: 'T003',
      note: 'Implemented targeted patch',
    }, null, () => {}, implementerCtx)
    helpers.assertContains(res.content[0].text, 'Reported done for T003 to team-lead')
    assert.equal(res.details.reportOnly, true)

    res = await tool('agentteam_task').execute('guard-task-close-impl-second-report', {
      action: 'report_done',
      taskId: 'T003',
      note: 'Second done report report should not mutate task',
    }, null, () => {}, implementerCtx)
    helpers.assertContains(res.content[0].text, 'Reported done for T003 to team-lead')
    assert.equal(res.details.reportOnly, true)

    const guardTeamAfterComplete = modules.state.readTeamState('guard-suite-team')
    const t003 = guardTeamAfterComplete.tasks['T003']
    assert.equal(t003.status, 'open', 'implementer done report reports should not mutate task status')
    assert.equal(legacyNotes(t003).length, 0, 'implementer done reports should not append legacy task notes')
    const doneReportTemplateReports = Object.values(guardTeamAfterComplete.taskReports).filter(report =>
      report.taskId === 'T003' &&
      report.author === 'implementer-guard' &&
      report.text.includes('Files changed:') &&
      report.text.includes('Checks run:') &&
      report.reportOnly === true,
    )
    assert.equal(doneReportTemplateReports.length, 2, 'each implementer report-only done report should append a TaskReport')
    assert.equal(legacyNotes(t003).filter(note => note.text.startsWith('Linked message:') && note.text.includes('done report by implementer-guard')).length, 0, 'implementer done reports should not append linked mailbox task notes')

    res = await tool('agentteam_task').execute('guard-task-close-impl-leader-accept', {
      action: 'close',
      taskId: 'T003',
      note: 'Leader accepted implementer done report',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Closed T003')

    res = await tool('agentteam_task').execute('guard-task-close-impl-idempotent', {
      action: 'close',
      taskId: 'T003',
      note: 'Duplicate close should not add another done report note',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Cannot close T003: expected open or blocked, got done')
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'invalid_task_status')

    res = await tool('agentteam_send').execute('guard-peer-inform-allowed', {
      to: 'researcher-guard',
      message: 'peer informational block',
      type: 'inform',
    }, null, () => {}, plannerCtx)
    assert.deepEqual(res.details.recipients, ['researcher-guard'])

    res = await tool('agentteam_send').execute('guard-peer-question-allowed', {
      to: 'researcher-guard',
      message: 'Can you confirm the blocker details?',
      type: 'question',
      taskId: 'T001',
    }, null, () => {}, plannerCtx)
    assert.deepEqual(res.details.recipients, ['researcher-guard'])
    assert.equal(res.details.wakeByRecipient[0].policyIntent, 'recipient_attention')
    assert.equal(res.details.wakeByRecipient[0].policyReason, 'question routes to recipient attention')
    assert.equal(res.details.wakeByRecipient[0].wakeHint, 'soft')
    assert.equal(res.details.wakeByRecipient[0].method, 'bridge_requested')

    const nativeBeforeInformLeader = pi.__messages.length
    res = await tool('agentteam_send').execute('guard-inform-to-leader-allowed', {
      to: 'team-lead',
      message: 'informational block',
      type: 'inform',
    }, null, () => {}, plannerCtx)
    assert.deepEqual(res.details.recipients, ['team-lead'])
    assert.equal(res.details.wakeByRecipient[0].wakeHint, 'none')
    assert.equal(res.details.wakeByRecipient[0].policyIntent, 'none')
    assert.equal(res.details.wakeByRecipient[0].policyReason, 'inform is context-only and does not wake')
    assert.equal(res.details.wakeByRecipient[0].ok, undefined, 'inform-to-leader should not request leader attention directly')
    assert.equal(pi.__messages.length, nativeBeforeInformLeader, 'inform-to-leader should not trigger native leader turn')

    res = await tool('agentteam_send').execute('guard-question-to-leader-attention', {
      to: 'team-lead',
      message: 'Need leader decision on T002',
      type: 'question',
      taskId: 'T002',
    }, null, () => {}, plannerCtx)
    assert.deepEqual(res.details.recipients, ['team-lead'])
    assert.equal(res.details.wakeByRecipient[0].wakeHint, 'soft')
    assert.equal(res.details.wakeByRecipient[0].policyIntent, 'leader_attention')
    assert.equal(res.details.wakeByRecipient[0].policyReason, 'question to leader routes to leader attention')
    assert.equal(res.details.wakeByRecipient[0].method, 'leader_attention_requested')
    assert.equal(res.details.wakeByRecipient[0].ok, true)
    assert.equal(Object.keys(modules.state.readDeliveryRequestStore('guard-suite-team').requests).filter(id => modules.state.readDeliveryRequestStore('guard-suite-team').requests[id].memberName === 'team-lead').length, 0, 'leader attention should not create worker delivery requests')
    const questionToLeader = modules.state.readMailbox('guard-suite-team', 'team-lead').find(item => item.text.includes('Need leader decision on T002'))
    assert.equal(questionToLeader?.readAt, undefined, 'question-to-leader attention request should not mark mailbox read')
    assert.equal(questionToLeader?.deliveredAt, undefined, 'question-to-leader attention request should not mark mailbox delivered')

    res = await tool('agentteam_send').execute('guard-assignment-send-denied', {
      to: 'team-lead',
      message: 'unauthorized assignment',
      type: 'assignment',
    }, null, () => {}, plannerCtx)
    assert.equal(res.details.denied, true)

    res = await tool('agentteam_send').execute('guard-assignment-no-to-denied-before-routing', {
      message: 'unauthorized assignment should be denied before implicit routing',
      type: 'assignment',
      taskId: 'T002',
    }, null, () => {}, plannerCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.type, 'assignment')

    const teamBeforeLeaderAttention = modules.state.readTeamState('guard-suite-team')
    modules.state.updateMemberStatus(teamBeforeLeaderAttention, 'team-lead', {
      status: 'idle',
      lastWakeReason: 'test reset before projection assertion',
    })
    modules.state.writeTeamState(teamBeforeLeaderAttention)

    const existingAttentionMessageCount = pi.__messages.filter(message => message.customType === 'agentteam-leader-attention').length
    modules.leaderAttention.resetLeaderAttentionThrottle()
    sentPrompts.length = 0
    const nativeBefore = pi.__messages.length
    res = await tool('agentteam_task').execute('guard-leader-projection', {
      action: 'report_done',
      taskId: 'T001',
      note: 'T001 done by researcher',
    }, null, () => {}, researcherCtx)
    assert.equal(res.details.reportOnly, true)
    assert.equal(res.details.leaderMailboxDelivered, true)
    assert.equal(sentPrompts.length, 0, 'leader attention request should not inject text into pane')
    assert.equal(pi.__messages.length, nativeBefore, 'task report side effect should only enqueue attention/projection status; visible projection comes from mailbox sync')
    const leaderMailbox = modules.state.readMailbox('guard-suite-team', 'team-lead')
    const leaderAttentionMessage = leaderMailbox.find(item => item.type === 'report_done' && item.taskId === 'T001' && item.metadata?.reportId)
    assert.ok(leaderAttentionMessage, 'leader attention message should be present in mailbox with TaskReport reference')
    assert.equal(leaderAttentionMessage?.text.includes('T001 done by researcher'), false, 'leader report mailbox notification should omit full report body')
    assert.equal(leaderAttentionMessage?.summary?.includes('T001 done by researcher'), true, 'leader report mailbox summary may keep compact report summary')
    assert.equal(modules.state.readTeamState('guard-suite-team').taskReports[leaderAttentionMessage.metadata.reportId].mailboxMessageId, leaderAttentionMessage.id, 'TaskReport should back-reference delivered leader mailbox id')
    assert.equal(leaderAttentionMessage?.deliveredAt, undefined, 'projection request should not mark message delivered')
    assert.equal(leaderAttentionMessage?.readAt, undefined, 'projection request should not mark message read')
    assert.equal(legacyNotes(modules.state.readTeamState('guard-suite-team').tasks['T001']).filter(note => note.text.startsWith('Linked message:') && note.text.includes('done report by researcher-guard')).length, 0, 'task report side effect should not append linked mailbox task note')
    const teamAfterLeaderAttention = modules.state.readTeamState('guard-suite-team')
    assert.equal(teamAfterLeaderAttention.members['team-lead'].lastWakeReason, 'leader attention requested report_done')
    assert.equal(pi.__messages.filter(message => message.customType === 'agentteam-leader-attention').length, existingAttentionMessageCount, 'task report side effect should not send native turn before mailbox sync in worker context')

    const inputHooks = pi.__hooks.get('input') || []
    async function runInputHooks(event, ctx) {
      for (const hook of inputHooks) await hook(event, ctx)
    }

    const probeMessage = modules.state.pushMailboxMessage('guard-suite-team', 'team-lead', {
      from: 'planner-guard',
      to: 'team-lead',
      text: 'probe unrelated input should not sync',
      type: 'question',
      taskId: 'T001',
      threadId: 'task:T001',
      priority: 'normal',
      wakeHint: 'none',
    })

    await runInputHooks({ type: 'input', source: 'interactive', text: 'hello world' }, leaderCtx)

    let currentLeaderMailbox = modules.state.readMailbox('guard-suite-team', 'team-lead')
    const unrelatedProbe = currentLeaderMailbox.find(item => item.id === probeMessage.id)
    assert.equal(
      unrelatedProbe?.readAt,
      undefined,
      'non-agentteam interactive input should not trigger mailbox sync consumption',
    )

    await runInputHooks({ type: 'input', source: 'interactive', text: '/team' }, leaderCtx)

    currentLeaderMailbox = modules.state.readMailbox('guard-suite-team', 'team-lead')
    const syncedProbe = currentLeaderMailbox.find(item => item.id === probeMessage.id)
    assert.equal(
      syncedProbe?.readAt,
      undefined,
      'team command input should not auto-consume leader mailbox (manual receive should own read-at transitions)',
    )

    res = await tool('agentteam_receive').execute('guard-receive-after-projection-request', {
      markRead: true,
      limit: 50,
    }, null, () => {}, leaderCtx)
    assert.ok(res.details.returnedCount > 0, 'receive should return unread projected/requested messages')
    helpers.assertContains(res.content[0].text, `Hydrated report ${leaderAttentionMessage.metadata.reportId}`)
    helpers.assertContains(res.content[0].text, 'T001 done by researcher')
    assert.equal(res.details.hydratedReports[leaderAttentionMessage.metadata.reportId].text, 'T001 done by researcher')
    const leaderMailboxAfterReceive = modules.state.readMailbox('guard-suite-team', 'team-lead')
    const receivedLeaderAttentionMessage = leaderMailboxAfterReceive.find(item => item.id === leaderAttentionMessage?.id)
    assert.ok(receivedLeaderAttentionMessage?.deliveredAt, 'receive markRead should stamp deliveredAt')
    assert.ok(receivedLeaderAttentionMessage?.readAt, 'receive markRead should stamp readAt')

    const toolCallHooks = pi.__hooks.get('tool_call') || []
    async function runToolCallHooks(event, ctx) {
      for (const hook of toolCallHooks) {
        const result = await hook(event, ctx)
        if (result && result.block) return result
      }
      return undefined
    }

    let blocked = await runToolCallHooks(
      { type: 'tool_call', toolCallId: 'guard-hook-1', toolName: 'edit', input: {} },
      plannerCtx,
    )
    assert.equal(blocked?.block, true)

    blocked = await runToolCallHooks(
      { type: 'tool_call', toolCallId: 'guard-hook-2', toolName: 'agentteam_send', input: { to: 'researcher-guard', type: 'question' } },
      plannerCtx,
    )
    assert.equal(blocked, undefined)

    blocked = await runToolCallHooks(
      { type: 'tool_call', toolCallId: 'guard-hook-3', toolName: 'bash', input: { command: 'echo hi' } },
      plannerCtx,
    )
    assert.equal(blocked?.block, true)

    const allowed = await runToolCallHooks(
      { type: 'tool_call', toolCallId: 'guard-hook-4', toolName: 'find', input: { pattern: '*.md' } },
      plannerCtx,
    )
    assert.equal(allowed, undefined)
  },
}
