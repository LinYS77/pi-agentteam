const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

module.exports = {
  name: 'tools/state task-message progress',
  async run(env) {
    const { pi, modules, helpers } = env
    const teamName = 'task-message-progress-suite'
    const leaderCtx = helpers.createCtx(
      '/tmp/task-message-progress-project',
      '/tmp/task-message-progress-leader.jsonl',
      env.notifications,
    )
    const tool = name => pi.__tools.get(name)
    const deliveryRequestsForMember = memberName => Object.values(modules.state.readDeliveryRequestStore(teamName).requests)
      .filter(request => request.memberName === memberName)
      .map(request => ({
        requestId: request.requestId,
        status: request.status,
        messageIds: [...request.messageIds].sort(),
        bootPrompt: request.bootPrompt,
        reason: request.reason,
        updatedAt: request.updatedAt,
        expiresAt: request.expiresAt,
      }))
      .sort((a, b) => a.requestId.localeCompare(b.requestId))
    const assertDeliveryRequestsUnchanged = (memberName, before, message) => {
      assert.deepEqual(deliveryRequestsForMember(memberName), before, message)
    }
    const legacyNotes = task => Array.isArray(task?.notes) ? task.notes : []
    const cleanupTaskMessageProgressTeam = () => {
      modules.state.deleteTeamState(teamName)
      modules.state.clearSessionContext(leaderCtx.sessionManager.getSessionFile())
    }
    const originalCaptureTmuxSnapshot = modules.tmux.captureTmuxSnapshot
    modules.tmux.captureTmuxSnapshot = (capturedAt = Date.now()) => ({
      capturedAt,
      panes: [],
      byPaneId: {},
      ok: false,
      error: 'test tmux snapshot unavailable',
    })

    let res
    let team
    try {
      cleanupTaskMessageProgressTeam()
      const configPath = modules.state.getConfigPath()
      modules.state.ensureDir(path.dirname(configPath))
      fs.writeFileSync(configPath, JSON.stringify({
        agentModels: {
          planner: '077-gpt-5.4',
          researcher: '077-glm-5.1',
          implementer: '077-gpt-5.3-codex',
        },
      }), 'utf8')

      res = await tool('agentteam_create').execute('task-message-fixture-create', {
        team_name: teamName,
        description: 'Task message progress test team',
      }, null, () => {}, leaderCtx)
      helpers.assertContains(res.content[0].text, `Created team ${teamName}`, 'task-message fixture create should attach team')
      res = await tool('agentteam_spawn').execute('task-message-fixture-research-one', {
        name: 'Research One',
        role: 'worker',
      }, null, () => {}, leaderCtx)
      assert.equal(res.details.ok, true, 'task-message fixture research-one spawn should succeed')
      res = await tool('agentteam_spawn').execute('task-message-fixture-plan-one', {
        name: 'Plan One',
        role: 'plan',
      }, null, () => {}, leaderCtx)
      assert.equal(res.details.ok, true, 'task-message fixture plan-one spawn should succeed')

      res = await tool('agentteam_task').execute('task-message-fixture-task-create', {
        action: 'create',
        title: 'Inspect project',
        description: 'Explore project and report findings',
      }, null, () => {}, leaderCtx)
      helpers.assertContains(res.content[0].text, 'Created T001')
      res = await tool('agentteam_task').execute('task-message-fixture-assign', {
        action: 'assign',
        taskId: 'T001',
        owner: 'research-one',
      }, null, () => {}, leaderCtx)
      helpers.assertContains(res.content[0].text, 'Assigned T001')
      team = modules.state.readTeamState(teamName)
      assert.ok(team.members['research-one'], 'task-message fixture should include research-one')
      assert.ok(team.members['plan-one'], 'task-message fixture should include plan-one')
      assert.equal(team.tasks['T001'].owner, 'research-one', 'task-message fixture should assign T001 to research-one')
      const t001RecencyAfterSubstantiveAssign = team.tasks['T001'].updatedAt

    res = await tool('agentteam_send').execute('assign-1', {
      message: 'You were assigned shared task T001: Inspect project\n\nExplore project and report findings',
      summary: 'Assigned T001',
      type: 'assignment',
      taskId: 'T001',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'via task T001 owner research-one')
    assert.deepEqual(res.details.recipients, ['research-one'])
    assert.equal(res.details.routing.mode, 'task_owner')
    assert.equal(res.details.routing.taskOwner, 'research-one')
    assert.equal(res.details.wakeByRecipient[0].attempted, false)
    assert.equal(res.details.wakeByRecipient[0].ok, true)
    assert.equal(res.details.wakeByRecipient[0].method, 'bridge_requested')
    assert.ok(res.details.wakeByRecipient[0].requestId, 'worker assignment should create a durable bridge request')

    const researchMailboxAfterWake = modules.state.readMailbox(teamName, 'research-one')
    const assignmentForResearch = researchMailboxAfterWake.find(item => item.text.includes('Inspect project'))
    assert.equal(assignmentForResearch?.deliveredAt, undefined, 'worker bridge request should not mark assignment delivered')
    assert.equal(assignmentForResearch?.readAt, undefined, 'worker bridge request should not mark assignment read')
    const assignmentRequests = Object.values(modules.state.readDeliveryRequestStore(teamName).requests)
      .filter(request => request.memberName === 'research-one' && request.messageIds.includes(assignmentForResearch.id))
    assert.equal(assignmentRequests.length, 1, 'worker assignment should be backed by one durable request')

    team = modules.state.readTeamState(teamName)
    assert.equal(team.tasks['T001'].owner, 'research-one')
    assert.equal(team.tasks['T001'].status, 'open')
    const taskT001UpdatedAtAfterAssignmentRef = team.tasks['T001'].updatedAt
    assert.equal(taskT001UpdatedAtAfterAssignmentRef, t001RecencyAfterSubstantiveAssign, 'task message ref should not bump task recency')
    assert.equal(legacyNotes(team.tasks['T001']).filter(note => note.text.startsWith('Linked message:')).length, 0, 'task-bound assignment should not create visible full-body linked note')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'new task-bound assignment should not create legacy task notes')
    let t001MessageRefs = Object.values(team.taskMessageRefs).filter(ref => ref.taskId === 'T001')
    assert.equal(t001MessageRefs.length, 1, 'task-bound assignment should create one TaskMessageRef')
    const assignmentMessageRef = t001MessageRefs.find(ref => ref.mailboxMessageId === assignmentForResearch.id)
    assert.ok(assignmentMessageRef, 'task-bound assignment TaskMessageRef should point at recipient mailbox message')
    assert.equal(assignmentMessageRef.from, 'team-lead')
    assert.equal(assignmentMessageRef.to, 'research-one')
    assert.equal(assignmentMessageRef.type, 'assignment')
    assert.equal(assignmentMessageRef.taskId, 'T001')
    assert.equal(assignmentMessageRef.threadId, 'task:T001')
    assert.equal(assignmentMessageRef.summary, 'Assigned T001')
    assert.equal(assignmentMessageRef.priority, 'normal')
    assert.equal(assignmentMessageRef.wakeHint, 'hard')
    assert.equal(assignmentMessageRef.metadata?.source, 'agentteam_send')
    assert.equal(assignmentMessageRef.metadata?.compact, true)
    assert.equal(JSON.stringify(assignmentMessageRef).includes('You were assigned shared task'), false, 'TaskMessageRef must not copy full assignment body')
    assert.ok(assignmentForResearch.text.includes('You were assigned shared task T001'), 'recipient mailbox should retain full assignment body')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'TaskMessageRef should not create latest substantive note')

    res = await tool('agentteam_send').execute('send-1', {
      to: 'plan-one',
      message: 'Research done, please draft plan',
      type: 'inform',
      taskId: 'T001',
    }, null, () => {}, leaderCtx)
    assert.deepEqual(res.details.recipients, ['plan-one'])
    assert.equal(res.details.wakeByRecipient[0].wakeHint, 'none')
    assert.equal(res.details.wakeByRecipient[0].policyIntent, 'none')
    assert.equal(res.details.wakeByRecipient[0].policyReason, 'inform is context-only and does not wake')
    team = modules.state.readTeamState(teamName)
    assert.equal(team.tasks['T001'].updatedAt, taskT001UpdatedAtAfterAssignmentRef, 'leader inform TaskMessageRef should not bump task recency')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'leader inform should not add legacy task notes')
    const leaderInformMailbox = modules.state.readMailbox(teamName, 'plan-one').find(item => item.text.includes('Research done'))
    t001MessageRefs = Object.values(team.taskMessageRefs).filter(ref => ref.taskId === 'T001')
    assert.equal(t001MessageRefs.length, 2, 'leader inform should add a TaskMessageRef alongside assignment ref')
    const leaderInformRef = t001MessageRefs.find(ref => ref.mailboxMessageId === leaderInformMailbox?.id)
    assert.ok(leaderInformRef, 'leader inform TaskMessageRef should point at recipient mailbox message')
    assert.equal(leaderInformRef.from, 'team-lead')
    assert.equal(leaderInformRef.to, 'plan-one')
    assert.equal(leaderInformRef.type, 'inform')
    assert.equal(leaderInformRef.threadId, 'task:T001')
    assert.equal(leaderInformRef.summary, undefined)
    assert.equal(JSON.stringify(leaderInformRef).includes('Research done'), false, 'leader inform TaskMessageRef must not copy full message body')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'leader inform TaskMessageRef should not create latest substantive note')

    const planSession = team.members['plan-one'].sessionFile
    const planCtx = helpers.createCtx(leaderCtx.cwd, planSession, env.notifications)
    const researchSession = team.members['research-one'].sessionFile
    const researchCtx = helpers.createCtx(leaderCtx.cwd, researchSession, env.notifications)

    res = await tool('agentteam_receive').execute('recv-1', {
      markRead: true,
      limit: 10,
    }, null, () => {}, planCtx)
    helpers.assertContains(res.content[0].text, 'Received 1 message from team-lead')

    const planMailboxAfterRead = modules.state.readMailbox(teamName, 'plan-one')
    assert.ok(planMailboxAfterRead[0].deliveredAt, 'receive should stamp deliveredAt')
    assert.ok(planMailboxAfterRead[0].readAt, 'receive markRead should stamp readAt')

    const peerInformTaskUpdatedAtBefore = modules.state.readTeamState(teamName).tasks['T001'].updatedAt
    const peerInformRequestsBefore = deliveryRequestsForMember('plan-one')
    res = await tool('agentteam_send').execute('send-peer-inform-mailbox-only', {
      to: 'plan-one',
      message: 'peer handoff with report summary',
      type: 'inform',
      taskId: 'T001',
    }, null, () => {}, researchCtx)
    assert.deepEqual(res.details.recipients, ['plan-one'])
    assert.equal(res.details.wakeByRecipient[0].wakeHint, 'none')
    assert.equal(res.details.wakeByRecipient[0].ok, undefined, 'worker->worker inform should not attempt worker delivery')

    const planMailbox = modules.state.readMailbox(teamName, 'plan-one')
    assert.equal(planMailbox.length, 2)
    assert.ok(planMailbox.every(item => item.type === 'inform'))
    const peerInform = planMailbox.find(item => item.text.includes('peer handoff'))
    assert.equal(peerInform?.wakeHint, 'none')
    assert.equal(peerInform?.deliveredAt, undefined, 'mailbox-only peer inform should not mark mailbox messages delivered')
    assert.equal(peerInform?.readAt, undefined, 'mailbox-only peer inform should not mark mailbox messages read')
    const peerInformRequests = Object.values(modules.state.readDeliveryRequestStore(teamName).requests)
      .filter(request => request.memberName === 'plan-one' && request.messageIds.includes(peerInform.id))
    assert.equal(peerInformRequests.length, 0, 'peer inform should not create a durable bridge request by default')
    assertDeliveryRequestsUnchanged('plan-one', peerInformRequestsBefore, 'peer inform should not create or refresh any delivery request for recipient')
    team = modules.state.readTeamState(teamName)
    assert.equal(team.tasks['T001'].updatedAt, peerInformTaskUpdatedAtBefore, 'peer inform TaskMessageRef should not bump task recency')
    assert.equal(legacyNotes(team.tasks['T001']).filter(note => note.text === 'Linked message: peer handoff with report summary').length, 0, 'peer inform should not copy full body into visible task note')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'peer inform should not add legacy task notes')
    t001MessageRefs = Object.values(team.taskMessageRefs).filter(ref => ref.taskId === 'T001')
    assert.equal(t001MessageRefs.length, 3, 'peer inform should add a TaskMessageRef alongside assignment and leader inform refs')
    const peerInformRef = t001MessageRefs.find(ref => ref.mailboxMessageId === peerInform.id)
    assert.ok(peerInformRef, 'peer inform TaskMessageRef should point at recipient mailbox message')
    assert.equal(peerInformRef.from, 'research-one')
    assert.equal(peerInformRef.to, 'plan-one')
    assert.equal(peerInformRef.type, 'inform')
    assert.equal(peerInformRef.threadId, 'task:T001')
    assert.equal(peerInformRef.summary, undefined)
    assert.equal(peerInformRef.wakeHint, 'none')
    assert.equal(peerInformRef.metadata?.source, 'agentteam_send')
    assert.equal(JSON.stringify(peerInformRef).includes('peer handoff with report summary'), false, 'peer inform TaskMessageRef must not copy full message body')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'peer inform TaskMessageRef should not create latest substantive note')
    const peerInformEvents = (team.events ?? []).filter(event => event.by === 'research-one' && event.metadata?.sourceKind === 'worker_peer_message_ref')
    assert.equal(peerInformEvents.length, 1, 'peer inform should keep one compact diagnostic event ref')
    const peerInformEvent = peerInformEvents[0]
    assert.equal(peerInformEvent.type, 'diagnostic_peer_message_ref')
    assert.equal(peerInformEvent.metadata?.diagnostic, true)
    assert.equal(peerInformEvent.metadata?.hidden, true)
    assert.equal(peerInformEvent.metadata?.displayMode, 'hidden')
    assert.equal(peerInformEvent.metadata?.compact, true)
    assert.equal(peerInformEvent.metadata?.from, 'research-one')
    assert.deepEqual(peerInformEvent.metadata?.to, ['plan-one'])
    assert.equal(peerInformEvent.metadata?.type, 'inform')
    assert.equal(peerInformEvent.metadata?.taskId, 'T001')
    assert.equal(peerInformEvent.metadata?.threadId, 'task:T001')
    assert.equal(peerInformEvent.metadata?.linkedIds?.mailboxMessageIds?.['plan-one'], peerInform.id)
    assert.equal(peerInformEvent.text.includes('peer handoff with report summary'), false, 'diagnostic peer event should not copy full message body')
    assert.ok(peerInformEvent.text.includes('diagnostic peer message ref'), 'diagnostic peer event should be clearly diagnostic')
    assert.ok(peerInformEvent.text.includes('type=inform'), 'diagnostic peer event should keep type identity')
    assert.ok(peerInformEvent.text.includes('to=plan-one'), 'diagnostic peer event should keep recipient identity')
    const peerInformRefForQuery = team.taskMessageRefs[peerInformRef.id]
    peerInformRefForQuery.summary = 'compact peer handoff summary'
    peerInformRefForQuery.diagnostic = true
    peerInformRefForQuery.metadata = { ...(peerInformRefForQuery.metadata ?? {}), source: 'agentteam_send', diagnosticFixture: true }
    modules.state.writeTeamState(team)
    const peerInformOutboxEffects = modules.state.listOutboxEffects(teamName)
      .filter(effect => effect.kind === 'append_event_requested' && effect.payload?.event?.type === 'diagnostic_peer_message_ref' && effect.payload?.event?.by === 'research-one')
    assert.equal(peerInformOutboxEffects.length, 1, 'peer diagnostic event should keep one append_event_requested outbox effect')
    assert.equal(peerInformOutboxEffects[0].status, 'done', 'peer diagnostic append_event_requested should complete through outbox')
    assert.equal(peerInformOutboxEffects[0].idempotencyKey.includes('peer handoff with report summary'), false, 'peer diagnostic event idempotency key should not copy full body')
    assert.ok(peerInformOutboxEffects[0].idempotencyKey.includes(peerInform.id), 'peer diagnostic event idempotency key should include linked mailbox message id')
    assert.equal(peerInformOutboxEffects[0].payload.event.text.includes('peer handoff with report summary'), false, 'outbox diagnostic event payload text should not copy full body')
    assert.equal(JSON.stringify(peerInformOutboxEffects[0].payload.event.metadata ?? {}).includes('peer handoff with report summary'), false, 'outbox diagnostic event payload metadata should not copy full body')
    assert.equal(peerInform.text, 'peer handoff with report summary', 'recipient mailbox should retain full peer body as source of truth')
    const peerInformPrompt = modules.workerTurnPrompt.buildWorkerTurnPrompt(team, 'plan-one', {
      unreadMessages: modules.state.peekUnreadMailbox(teamName, 'plan-one'),
      allowAssignedTaskTrigger: true,
    })
    assert.equal(String(peerInformPrompt).includes('diagnostic_peer_message_ref'), false, 'worker prompt should not expose diagnostic event type')
    assert.equal(String(peerInformPrompt).includes('diagnostic peer message ref'), false, 'worker prompt should not surface diagnostic event text as ordinary context')
    const peerInformPanelData = modules.panelDataSource.loadPanelData(teamName)
    const peerInformPanelState = modules.viewModel.createInitialPanelState()
    peerInformPanelState.focus = 'tasks'
    peerInformPanelState.selectedIndex = 0
    const peerInformPanelSelection = modules.viewModel.buildPanelSelectionView(peerInformPanelData, peerInformPanelState)
    const peerInformPanelLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), {
      width: 180,
      height: 40,
      data: peerInformPanelData,
      state: peerInformPanelState,
      selection: peerInformPanelSelection,
    })
    assert.equal(peerInformPanelLines.join('\n').includes('diagnostic_peer_message_ref'), false, 'default panel should not expose diagnostic peer event type')
    assert.equal(peerInformPanelLines.join('\n').includes('diagnostic peer message ref'), false, 'default panel should not expose diagnostic peer event text')

    const progressLeaderMailboxBefore = modules.state.readMailbox(teamName, 'team-lead').length
    const progressLeaderProjectionBefore = Object.keys(modules.state.readLeaderProjectionStore(teamName).projections).length
    const progressOutboxBefore = modules.state.listOutboxEffects(teamName).length
    const progressLeaderRequestsBefore = deliveryRequestsForMember('team-lead')
    const progressTaskNotesBefore = legacyNotes(modules.state.readTeamState(teamName).tasks['T001']).length
    const progressEventsBefore = Object.keys(modules.state.readTeamState(teamName).taskEvents).length
    const progressEffects = []
    const taskService = helpers.requireDist('tools/taskService.js')
    const taskApplication = helpers.requireDist('app/taskApplication.js')
    assert.equal(typeof taskApplication.executeTaskApplication, 'function', 'task app boundary should expose the task use-case')
    res = await taskService.executeTaskAction({
      action: 'progress',
      taskId: 'T001',
      note: 'ordinary progress should inform only',
    }, researchCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      requestLeaderAttentionIfNeeded: async () => {
        progressEffects.push('leaderAttention')
        return { ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'projected', method: 'leader_attention_requested' }
      },
      requestWorkerDelivery: async () => {
        progressEffects.push('workerDelivery')
        return { ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'worker delivery requested', method: 'bridge_requested' }
      },
      invalidateStatus: () => {
        progressEffects.push('invalidateStatus')
      },
    }))
    helpers.assertContains(res.content[0].text, 'Recorded progress on T001')
    assert.equal(res.details.leaderMailboxDelivered, undefined, 'worker progress must not inform leader mailbox')
    assert.deepEqual(progressEffects, ['invalidateStatus'], 'progress must only invalidate UI status')
    const progressLeaderMailbox = modules.state.readMailbox(teamName, 'team-lead')
    assert.equal(progressLeaderMailbox.length, progressLeaderMailboxBefore, 'progress should not create a leader mailbox message')
    assertDeliveryRequestsUnchanged('team-lead', progressLeaderRequestsBefore, 'progress must not create leader delivery requests')
    assert.equal(Object.keys(modules.state.readLeaderProjectionStore(teamName).projections).length, progressLeaderProjectionBefore, 'progress must not create leader projection state')
    assert.equal(modules.state.listOutboxEffects(teamName).length, progressOutboxBefore, 'progress must not enqueue outbox side effects')
    team = modules.state.readTeamState(teamName)
    assert.equal(legacyNotes(team.tasks['T001']).length, progressTaskNotesBefore, 'progress should not append TeamTask.notes')
    assert.equal(Object.keys(team.taskEvents).length, progressEventsBefore + 1, 'progress should append one TaskEvent')
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T001' && event.type === 'progress' && event.summary === 'ordinary progress should inform only' && event.data?.source === 'agentteam_task_progress'), 'progress should write TaskEvent only')

    const unsupportedNoteEventsBefore = Object.keys(team.taskEvents).length
    res = await taskService.executeTaskAction({
      action: 'note',
      taskId: 'T001',
      note: 'removed note action should be rejected',
    }, researchCtx, env.patches.withOutboxHandlers(env.patches.deps))
    assert.equal(res.details.denied, true, 'removed note action should be denied for workers')
    assert.equal(legacyNotes(modules.state.readTeamState(teamName).tasks['T001']).length, progressTaskNotesBefore, 'removed note action should not append legacy task notes')
    assert.equal(Object.keys(modules.state.readTeamState(teamName).taskEvents).length, unsupportedNoteEventsBefore, 'removed note action should not append TaskEvent')

    const unsupportedSendLeaderMailboxBefore = modules.state.readMailbox(teamName, 'team-lead').length
    const unsupportedSendEventsBefore = modules.state.readTeamState(teamName).events?.length ?? 0
    const unsupportedSendRequestsBefore = deliveryRequestsForMember('team-lead')
    for (const unsupportedType of ['fyi', 'blocked', 'report_done']) {
      res = await tool('agentteam_send').execute(`send-${unsupportedType}-unsupported`, {
        to: 'team-lead',
        message: `${unsupportedType} should be rejected by send schema`,
        type: unsupportedType,
        taskId: 'T001',
      }, null, () => {}, researchCtx)
      assert.equal(res.details.denied, true)
      assert.equal(res.details.reason, 'unsupported_message_type')
      assert.equal(res.details.type, unsupportedType)
      helpers.assertContains(res.content[0].text, 'Allowed types: assignment, question, inform')
    }
    assert.equal(modules.state.readMailbox(teamName, 'team-lead').length, unsupportedSendLeaderMailboxBefore, 'unsupported send types should not write leader mailbox')
    assert.equal(modules.state.readTeamState(teamName).events?.length ?? 0, unsupportedSendEventsBefore, 'unsupported send types should not append peer event')
    assertDeliveryRequestsUnchanged('team-lead', unsupportedSendRequestsBefore, 'unsupported send types should not create or refresh leader delivery')

    } finally {
      modules.tmux.captureTmuxSnapshot = originalCaptureTmuxSnapshot
      cleanupTaskMessageProgressTeam()
    }
  },
}
