const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

module.exports = {
  name: 'tools + state flow',
  async run(env) {
    const { pi, modules, leaderCtx, helpers } = env
    const tool = name => pi.__tools.get(name)
    const deliveryRequestsForMember = memberName => Object.values(modules.state.readDeliveryRequestStore('full-suite-team').requests)
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
    // This suite uses an in-memory fake tmux pane set. Keep snapshot capture in
    // the same fake universe so host tmux pane IDs cannot collide with fixture
    // pane IDs during debounced leader mailbox refresh reconciliation.
    const originalCaptureTmuxSnapshot = modules.tmux.captureTmuxSnapshot
    modules.tmux.captureTmuxSnapshot = (capturedAt = Date.now()) => ({
      capturedAt,
      panes: [],
      byPaneId: {},
      ok: false,
      error: 'test tmux snapshot unavailable',
    })

    try {
    const configPath = modules.state.getConfigPath()
    modules.state.ensureDir(path.dirname(configPath))
    fs.writeFileSync(configPath, JSON.stringify({
      agentModels: {
        planner: '077-gpt-5.4',
        researcher: '077-glm-5.1',
        implementer: '077-gpt-5.3-codex',
      },
    }), 'utf8')

    const setupFullSuiteTeamFixture = async () => {
      modules.state.deleteTeamState('full-suite-team')
      let setupRes = await tool('agentteam_create').execute('tools-state-fixture-create', {
        team_name: 'full-suite-team',
        description: 'Integration test team',
      }, null, () => {}, leaderCtx)
      helpers.assertContains(setupRes.content[0].text, 'Created team full-suite-team', 'fixture create should attach full-suite-team')
      setupRes = await tool('agentteam_spawn').execute('tools-state-fixture-research-one', {
        name: 'Research One',
        role: 'worker',
      }, null, () => {}, leaderCtx)
      assert.equal(setupRes.details.ok, true, 'fixture research-one spawn should succeed')
      setupRes = await tool('agentteam_spawn').execute('tools-state-fixture-plan-one', {
        name: 'Plan One',
        role: 'plan',
        task: '请先等待 research 的报告，收到消息后给出计划。',
      }, null, () => {}, leaderCtx)
      assert.equal(setupRes.details.ok, true, 'fixture plan-one spawn should succeed')
      assert.ok(setupRes.details.deliveryRequestId, 'fixture plan-one should preserve initial delivery request setup')
      assert.ok(setupRes.details.outboxEffectId, 'fixture plan-one should preserve initial worker delivery outbox setup')
      const fixtureTeam = modules.state.readTeamState('full-suite-team')
      assert.ok(fixtureTeam.members['research-one'], 'fixture should include research-one')
      assert.ok(fixtureTeam.members['plan-one'], 'fixture should include plan-one')
      return fixtureTeam
    }

    let team = await setupFullSuiteTeamFixture()
    let res

    res = await tool('agentteam_task').execute('task-create-1', {
      action: 'create',
      title: 'Inspect project',
      description: 'Explore project and report findings',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created T001')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'task create should not append active task notes')
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T001' && event.type === 'created' && event.summary === 'Task created'), 'task create should write created event')

    res = await tool('agentteam_send').execute('send-unowned-no-to-denied', {
      message: 'This should not route without an owner',
      type: 'inform',
      taskId: 'T001',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'task_owner_missing')

    res = await tool('agentteam_task').execute('assign-1', {
      action: 'assign',
      taskId: 'T001',
      owner: 'research-one',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Assigned T001')

    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.members['research-one'].status, 'idle', 'assign should block shared state only and not wake worker')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'task assign should not append active task notes')
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T001' && event.type === 'assigned' && event.data?.newOwner === 'research-one'), 'task assign should write assigned event')
    const promptsBeforeOwnedCreate = env.sentPrompts.length
    res = await tool('agentteam_task').execute('task-create-owned', {
      action: 'create',
      title: 'Owned on create',
      description: 'Validate owner assignment at creation time',
      owner: 'Plan One',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created T002')
    assert.equal(res.details.task.owner, 'plan-one')
    assert.equal(res.details.task.status, 'open')
    const coreReducer = helpers.requireDist('core/taskReducer.js')
    const coreCreatedWithOwner = coreReducer.createTask({
      id: 'T002',
      title: 'Owned on create',
      description: 'Validate owner assignment at creation time',
      owner: 'plan-one',
      createdAt: res.details.task.createdAt,
    })
    assert.equal(res.details.task.status, coreCreatedWithOwner.status, 'production create should use core reducer open status')
    assert.equal(res.details.task.owner, coreCreatedWithOwner.owner, 'production create should preserve core reducer owner')
    assert.equal(
      env.sentPrompts.length,
      promptsBeforeOwnedCreate,
      'create with owner should block task state only and not wake worker',
    )

    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].owner, 'plan-one')
    assert.equal(team.tasks['T002'].status, 'open')
    assert.equal(legacyNotes(team.tasks['T002']).length, 0, 'create with owner should not append active task notes')
    const t002EventsAfterCreate = Object.values(team.taskEvents).filter(event => event.taskId === 'T002')
    assert.ok(t002EventsAfterCreate.some(event => event.type === 'created'), 'owned create should dual-write created event')
    assert.ok(t002EventsAfterCreate.some(event => event.type === 'assigned' && event.data?.newOwner === 'plan-one' && event.data?.onCreate === true), 'owned create should dual-write assigned event')

    const blockedCreateResearchRequestsBefore = deliveryRequestsForMember('research-one')
    res = await tool('agentteam_task').execute('task-create-owned-blockable-denied-blocked-by', {
      action: 'create',
      title: 'Owned but blocked by leader',
      description: 'Validate explicit leader block after create',
      owner: 'Research One',
      blockedBy: ['ignored on create'],
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'blocked_by_param_unsupported')
    res = await tool('agentteam_task').execute('task-create-owned-blockable', {
      action: 'create',
      title: 'Owned but blocked by leader',
      description: 'Validate explicit leader block after create',
      owner: 'Research One',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created T003')
    assert.equal(res.details.task.owner, 'research-one')
    assert.equal(res.details.task.status, 'open')
    assert.deepEqual(res.details.task.blockedBy, [])
    res = await tool('agentteam_task').execute('task-block-owned', {
      action: 'block',
      taskId: 'T003',
      blockedBy: ['missing input'],
      note: 'missing input',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Blocked T003')
    assert.equal(res.details.task.owner, 'research-one')
    assert.equal(res.details.task.status, 'blocked')
    const coreBlockedT003 = coreReducer.transitionTask(
      { ...res.details.task, status: 'open', updatedAt: res.details.task.updatedAt - 1 },
      { type: 'block', at: res.details.task.updatedAt },
    )
    assert.equal(coreBlockedT003.ok, true)
    assert.equal(res.details.task.status, coreBlockedT003.task.status, 'production block status should match core reducer')
    assert.deepEqual(res.details.task.blockedBy, ['missing input'])

    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T003'].owner, 'research-one')
    assert.equal(team.tasks['T003'].status, 'blocked')
    assert.deepEqual(team.tasks['T003'].blockedBy, ['missing input'])
    assert.equal(legacyNotes(team.tasks['T003']).length, 0, 'task block should not append active task notes')
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T003' && event.type === 'blocked' && event.data?.blockedBy?.[0] === 'missing input'), 'task block should write blocked event with blockers')
    assertDeliveryRequestsUnchanged(
      'research-one',
      blockedCreateResearchRequestsBefore,
      'blocked create/block with owner should not create or refresh worker delivery',
    )
    assert.equal(
      modules.viewModel.buildTeamAttentionSummary(team, modules.state.readMailbox('full-suite-team', 'team-lead')).blockedTasks,
      1,
      'blocked task with owner should remain in attention summary',
    )

    res = await tool('agentteam_task').execute('task-create-for-block-denied-blocked-by', {
      action: 'create',
      title: 'Blocked then assigned',
      description: 'Validate explicit block/unblock/assign flow',
      blockedBy: ['ignored on create'],
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'blocked_by_param_unsupported')
    res = await tool('agentteam_task').execute('task-create-for-block', {
      action: 'create',
      title: 'Blocked then assigned',
      description: 'Validate explicit block/unblock/assign flow',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created T004')
    assert.equal(res.details.task.status, 'open')
    assert.deepEqual(res.details.task.blockedBy, [])
    res = await tool('agentteam_task').execute('task-block-unowned', {
      action: 'block',
      taskId: 'T004',
      blockedBy: ['external decision'],
      note: 'external decision',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Blocked T004')
    assert.equal(res.details.task.status, 'blocked')
    assert.deepEqual(res.details.task.blockedBy, ['external decision'])

    const blockedClaimPlanRequestsBefore = deliveryRequestsForMember('plan-one')
    res = await tool('agentteam_task').execute('task-assign-blocked-denied', {
      action: 'assign',
      taskId: 'T004',
      owner: 'Plan One',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'invalid_task_status')
    const coreAssignBlockedDenied = coreReducer.transitionTask(
      { ...modules.state.readTeamState('full-suite-team').tasks['T004'] },
      { type: 'assign', owner: 'plan-one', at: Date.now() },
    )
    assert.equal(coreAssignBlockedDenied.ok, false)
    assert.equal(coreAssignBlockedDenied.reason, 'assign requires open task, got blocked')
    assertDeliveryRequestsUnchanged(
      'plan-one',
      blockedClaimPlanRequestsBefore,
      'blocked assign should not create or refresh worker delivery',
    )

    const blockedUpdateResearchRequestsBefore = deliveryRequestsForMember('research-one')
    res = await tool('agentteam_task').execute('task-block-blocked-owner-denied', {
      action: 'block',
      taskId: 'T004',
      owner: 'Research One',
      note: 'move accountable owner while blocked',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'invalid_task_status')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T004'].owner, undefined)
    assert.equal(team.tasks['T004'].status, 'blocked')
    assert.deepEqual(team.tasks['T004'].blockedBy, ['external decision'])
    assertDeliveryRequestsUnchanged(
      'research-one',
      blockedUpdateResearchRequestsBefore,
      'blocked block owner should not create or refresh worker delivery',
    )

    const beforeDeniedInProgress = modules.state.readTeamState('full-suite-team').tasks['T004']
    res = await tool('agentteam_task').execute('task-blocked-block-denied', {
      action: 'block',
      taskId: 'T004',
      note: 'try to block while already blocked',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'invalid_task_status')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T004'].status, beforeDeniedInProgress.status, 'denied reblock should not mutate status')
    assert.deepEqual(team.tasks['T004'].blockedBy, beforeDeniedInProgress.blockedBy, 'denied reblock should retain blockers')
    assert.equal(team.tasks['T004'].updatedAt, beforeDeniedInProgress.updatedAt, 'denied reblock should not mutate task timestamp')

    res = await tool('agentteam_task').execute('task-unblock-blocked', {
      action: 'unblock',
      taskId: 'T004',
      note: 'blockers cleared, start work',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Unblocked T004')
    assert.equal(res.details.task.status, 'open')
    const coreUnblockedT004 = coreReducer.transitionTask(
      { ...res.details.task, status: 'blocked', updatedAt: res.details.task.updatedAt - 1 },
      { type: 'unblock', at: res.details.task.updatedAt },
    )
    assert.equal(coreUnblockedT004.ok, true)
    assert.equal(res.details.task.status, coreUnblockedT004.task.status, 'production unblock status should match core reducer')
    assert.deepEqual(res.details.task.blockedBy, [])
    res = await tool('agentteam_task').execute('task-assign-unblocked', {
      action: 'assign',
      taskId: 'T004',
      owner: 'Research One',
      note: 'assign after unblock',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Assigned T004')
    assert.equal(res.details.task.owner, 'research-one')
    const coreAssignedT004 = coreReducer.transitionTask(
      { ...res.details.task, owner: undefined, status: 'open', updatedAt: res.details.task.updatedAt - 1 },
      { type: 'assign', owner: 'research-one', at: res.details.task.updatedAt },
    )
    assert.equal(coreAssignedT004.ok, true)
    assert.equal(res.details.task.status, coreAssignedT004.task.status, 'production assign status should match core reducer')
    assert.equal(res.details.task.owner, coreAssignedT004.task.owner, 'production assign owner should match core reducer')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(legacyNotes(team.tasks['T004']).length, 0, 'task unblock/assign should not append active task notes')
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T004' && event.type === 'unblocked'), 'task unblock should write unblocked event')
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T004' && event.type === 'assigned' && event.data?.newOwner === 'research-one'), 'task assign after unblock should write assigned event')
    assert.equal(
      modules.viewModel.buildTeamAttentionSummary(team, modules.state.readMailbox('full-suite-team', 'team-lead')).blockedTasks,
      1,
      'clearing blockers and starting should drop that task from attention while other blocked task remains',
    )

    const blockedAssignmentMailboxBefore = modules.state.readMailbox('full-suite-team', 'research-one').length
    const blockedAssignmentRequestsBefore = deliveryRequestsForMember('research-one')
    res = await tool('agentteam_send').execute('send-assignment-blocked-denied', {
      to: 'research-one',
      message: 'Do blocked task T003 anyway',
      type: 'assignment',
      taskId: 'T003',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'task_blocked_by_gate')
    assert.equal(modules.state.readMailbox('full-suite-team', 'research-one').length, blockedAssignmentMailboxBefore, 'blocked assignment deny should not push mailbox')
    assertDeliveryRequestsUnchanged('research-one', blockedAssignmentRequestsBefore, 'blocked assignment deny should not create or refresh delivery')

    res = await tool('agentteam_send').execute('send-inform-blocked-allowed', {
      to: 'research-one',
      message: 'Inform about blocked task T003',
      type: 'inform',
      taskId: 'T003',
    }, null, () => {}, leaderCtx)
    assert.deepEqual(res.details.recipients, ['research-one'])
    assert.ok(modules.state.readMailbox('full-suite-team', 'research-one').some(m => m.type === 'inform' && m.taskId === 'T003'), 'inform about blocked task should remain allowed')

    res = await tool('agentteam_send').execute('send-question-blocked-allowed', {
      to: 'research-one',
      message: 'Question about blocked task T003',
      type: 'question',
      taskId: 'T003',
    }, null, () => {}, leaderCtx)
    assert.deepEqual(res.details.recipients, ['research-one'])
    assert.equal(res.details.wakeByRecipient[0].policyIntent, 'recipient_attention')
    assert.equal(res.details.wakeByRecipient[0].policyReason, 'question routes to recipient attention')
    assert.equal(res.details.wakeByRecipient[0].wakeHint, 'soft')

    res = await tool('agentteam_send').execute('send-assignment-unblocked-allowed', {
      to: 'research-one',
      message: 'Task T004 is now actionable',
      type: 'assignment',
      taskId: 'T004',
    }, null, () => {}, leaderCtx)
    assert.deepEqual(res.details.recipients, ['research-one'])
    assert.equal(res.details.wakeByRecipient[0].policyIntent, 'worker_delivery')
    assert.equal(res.details.wakeByRecipient[0].policyReason, 'assignment routes to worker delivery')
    assert.equal(res.details.wakeByRecipient[0].method, 'bridge_requested')

    modules.state.updateTeamState('full-suite-team', latest => {
      modules.state.updateMemberStatus(latest, 'plan-one', { status: 'idle' })
    })

    const mailboxBeforeExplicitTypo = modules.state.readMailbox('full-suite-team', 'research-one').length
    const eventsBeforeExplicitTypo = (modules.state.readTeamState('full-suite-team').events ?? []).length
    const promptsBeforeExplicitTypo = env.sentPrompts.length
    res = await tool('agentteam_send').execute('send-explicit-typo-denied', {
      to: 'implmentor',
      message: 'this should be rejected before delivery',
      type: 'question',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'explicit_recipient_not_found')
    helpers.assertContains(res.content[0].text, 'Explicit recipient implmentor is not in the current team')
    assert.equal(modules.state.readMailbox('full-suite-team', 'research-one').length, mailboxBeforeExplicitTypo, 'explicit typo should not create mailbox messages')
    assert.equal((modules.state.readTeamState('full-suite-team').events ?? []).length, eventsBeforeExplicitTypo, 'explicit typo should not create team events')
    assert.equal(env.sentPrompts.length, promptsBeforeExplicitTypo, 'explicit typo should not wake/paste')

    res = await tool('agentteam_send').execute('send-explicit-empty-denied', {
      to: '   ',
      message: 'this should be rejected as empty',
      type: 'question',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'explicit_recipient_empty')
    helpers.assertContains(res.content[0].text, 'Explicit recipient is empty after normalization')
    assert.equal(modules.state.readMailbox('full-suite-team', 'research-one').length, mailboxBeforeExplicitTypo, 'empty explicit recipient should not create mailbox messages')
    assert.equal((modules.state.readTeamState('full-suite-team').events ?? []).length, eventsBeforeExplicitTypo, 'empty explicit recipient should not create team events')
    assert.equal(env.sentPrompts.length, promptsBeforeExplicitTypo, 'empty explicit recipient should not wake/paste')

    await assert.rejects(
      () => tool('agentteam_task').execute('task-create-empty-owner', {
        action: 'create',
        title: 'Bad owner',
        description: 'empty owner should be rejected',
        owner: '   ',
      }, null, () => {}, leaderCtx),
      /owner cannot be empty/,
    )
    await assert.rejects(
      () => tool('agentteam_task').execute('task-create-missing-owner', {
        action: 'create',
        title: 'Missing owner',
        description: 'missing owner should be rejected',
        owner: 'missing-worker',
      }, null, () => {}, leaderCtx),
      /Owner missing-worker not found in current team/,
    )

    const setupReportWorkflowMessageRefs = async () => {
      const fixtureTeam = modules.state.readTeamState('full-suite-team')
      const researchCtx = helpers.createCtx(leaderCtx.cwd, fixtureTeam.members['research-one'].sessionFile, env.notifications)
      const planCtx = helpers.createCtx(leaderCtx.cwd, fixtureTeam.members['plan-one'].sessionFile, env.notifications)

      let setupRes = await tool('agentteam_send').execute('report-fixture-assignment-ref', {
        message: 'You were assigned shared task T001: Inspect project\n\nExplore project and report findings',
        summary: 'Assigned T001',
        type: 'assignment',
        taskId: 'T001',
      }, null, () => {}, leaderCtx)
      helpers.assertContains(setupRes.content[0].text, 'via task T001 owner research-one', 'report fixture should create owner-routed assignment ref')

      setupRes = await tool('agentteam_send').execute('report-fixture-leader-inform-ref', {
        to: 'plan-one',
        message: 'Research done, please draft plan',
        type: 'inform',
        taskId: 'T001',
      }, null, () => {}, leaderCtx)
      assert.deepEqual(setupRes.details.recipients, ['plan-one'], 'report fixture should create leader inform ref')

      setupRes = await tool('agentteam_send').execute('report-fixture-peer-inform-ref', {
        to: 'plan-one',
        message: 'peer handoff with report summary',
        type: 'inform',
        taskId: 'T001',
      }, null, () => {}, researchCtx)
      assert.deepEqual(setupRes.details.recipients, ['plan-one'], 'report fixture should create peer inform ref')

      let latestTeam = modules.state.readTeamState('full-suite-team')
      const t001MessageRefs = Object.values(latestTeam.taskMessageRefs).filter(ref => ref.taskId === 'T001')
      assert.equal(t001MessageRefs.length, 3, 'report fixture should create three T001 TaskMessageRefs')
      const peerInform = modules.state.readMailbox('full-suite-team', 'plan-one').find(item => item.text.includes('peer handoff'))
      const peerInformRef = t001MessageRefs.find(ref => ref.mailboxMessageId === peerInform?.id)
      assert.ok(peerInformRef, 'report fixture peer TaskMessageRef should point at recipient mailbox message')
      const peerInformRefForQuery = latestTeam.taskMessageRefs[peerInformRef.id]
      peerInformRefForQuery.summary = 'compact peer handoff summary'
      peerInformRefForQuery.diagnostic = true
      peerInformRefForQuery.metadata = { ...(peerInformRefForQuery.metadata ?? {}), source: 'agentteam_send', diagnosticFixture: true }
      modules.state.writeTeamState(latestTeam)

      const taskService = helpers.requireDist('tools/taskService.js')
      setupRes = await taskService.executeTaskAction({
        action: 'progress',
        taskId: 'T001',
        note: 'ordinary progress should inform only',
      }, researchCtx, env.patches.withOutboxHandlers(env.patches.deps))
      helpers.assertContains(setupRes.content[0].text, 'Recorded progress on T001', 'report fixture should create progress TaskEvent')
      latestTeam = modules.state.readTeamState('full-suite-team')
      assert.ok(Object.values(latestTeam.taskEvents).some(event => event.taskId === 'T001' && event.type === 'progress' && event.summary === 'ordinary progress should inform only'), 'report fixture should preserve progress event precondition')
      const progressTaskNotesBefore = legacyNotes(latestTeam.tasks['T001']).length
      assert.equal(progressTaskNotesBefore, 0, 'report fixture should keep T001 TeamTask.notes empty before report workflow')
      return { researchCtx, planCtx, taskService, progressTaskNotesBefore }
    }

    const reportWorkflowFixture = await setupReportWorkflowMessageRefs()
    const { researchCtx, planCtx, taskService, progressTaskNotesBefore } = reportWorkflowFixture

    let leadMailbox = modules.state.readMailbox('full-suite-team', 'team-lead')

    res = await tool('agentteam_task').execute('task-close-worker', {
      action: 'report_done',
      taskId: 'T001',
      note: 'Done',
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, 'Reported done for T001 to team-lead')
    assert.equal(res.details.reportOnly, true)

    team = modules.state.readTeamState('full-suite-team')
    const coreDoneReportT001 = coreReducer.transitionTask(
      { ...team.tasks['T001'], updatedAt: team.tasks['T001'].updatedAt - 1 },
      { type: 'report_done', at: team.tasks['T001'].updatedAt, actor: 'research-one', note: 'Done' },
    )
    assert.equal(coreDoneReportT001.ok, true)
    assert.equal(team.tasks['T001'].status, coreDoneReportT001.task.status, 'production report_done status should match core reducer')
    assert.equal(team.tasks['T001'].status, 'open', 'worker done report should be report-only and not mutate task status')
    assert.equal(team.tasks['T001'].owner, 'research-one', 'worker done report report should not mutate owner')
    assert.deepEqual(team.tasks['T001'].blockedBy, [], 'worker done report report should not mutate blockers')
    assert.equal(legacyNotes(team.tasks['T001']).length, progressTaskNotesBefore, 'worker report_done should not append TeamTask.notes')
    assert.equal(legacyNotes(team.tasks['T001']).some(note => note.messageType === 'report_done' && note.metadata?.reportOnly === true), false, 'worker report_done should not append report-only task note')
    assert.equal(legacyNotes(team.tasks['T001']).filter(note => note.text.startsWith('Linked message:') && note.text.includes('done report by research-one')).length, 0, 'worker done report should not append linked mailbox task note')
    const t001DoneReports = Object.values(team.taskReports).filter(report => report.taskId === 'T001' && report.type === 'report_done' && report.author === 'research-one')
    assert.equal(t001DoneReports.length, 1, 'worker report_done should dual-write one TaskReport')
    assert.equal(t001DoneReports[0].text, 'Done')
    assert.equal(t001DoneReports[0].reportOnly, true)
    assert.equal(t001DoneReports[0].reporterIsOwner, true)
    assert.equal(t001DoneReports[0].statusAtReport, 'open')
    assert.equal(t001DoneReports[0].ownerAtReport, 'research-one')
    assert.ok(t001DoneReports[0].mailboxMessageId?.startsWith('mailbox-outbox-'), 'TaskReport should back-reference delivered leader mailbox id')
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T001' && event.type === 'report_submitted' && event.reportId === t001DoneReports[0].id), 'worker report_done should dual-write report_submitted event')

    res = await tool('agentteam_task').execute('query-show-worker', {
      action: 'show',
      taskId: 'T001',
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, 'T001 [open] Inspect project')
    helpers.assertContains(res.content[0].text, 'History counts: reports 1, events')
    helpers.assertContains(res.content[0].text, `Latest report: ${t001DoneReports[0].id} report_done by research-one — Done`)
    helpers.assertContains(res.content[0].text, 'messageRefs 3')
    assert.equal(res.content[0].text.includes('peer handoff with report summary'), false, 'show must not copy full peer message body')
    assert.equal(res.content[0].text.includes('report_done: Done'), false, 'show must expose report summary but not a full report-body line')
    assert.equal(res.details.latestReport.text, undefined, 'show latestReport details must not include full report body')
    assert.equal(res.details.counts.reports, 1)
    assert.equal(res.details.counts.messageRefs, 3)

    res = await tool('agentteam_task').execute('query-reports-worker', {
      action: 'reports',
      taskId: 'T001',
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, `Reports for T001: 1 report`)
    helpers.assertContains(res.content[0].text, `${t001DoneReports[0].id} report_done by research-one`)
    helpers.assertContains(res.content[0].text, 'Done')
    assert.equal(res.content[0].text.includes('Report text:'), false, 'reports must not include full report body section')
    assert.equal(res.content[0].text.includes('peer handoff with report summary'), false, 'reports must not include ordinary message bodies')
    assert.equal(res.details.reports[0].text, undefined, 'reports details must not include full report body')

    res = await tool('agentteam_task').execute('query-report-worker', {
      action: 'report',
      reportId: t001DoneReports[0].id,
      taskId: 'T001',
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, `${t001DoneReports[0].id} report_done for T001 by research-one`)
    helpers.assertContains(res.content[0].text, 'Report text:\nDone')
    assert.equal(res.details.text, 'Done')
    assert.equal(res.details.report.text, undefined, 'report metadata should stay compact even when full text is returned separately')

    res = await tool('agentteam_task').execute('query-history-worker-limit', {
      action: 'history',
      taskId: 'T001',
      limit: 10,
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, 'History for T001: showing 8 of')
    helpers.assertContains(res.content[0].text, 'limit 10; messageRefs included')
    helpers.assertContains(res.content[0].text, 'messageRef')
    helpers.assertContains(res.content[0].text, 'compact peer handoff summary')
    helpers.assertContains(res.content[0].text, `${t001DoneReports[0].id} report_done by research-one: Done`)
    assert.equal(res.content[0].text.includes('Report text:'), false, 'history must not include full report body section')
    assert.equal(res.content[0].text.includes('peer handoff with report summary'), false, 'history must not include full ordinary message body')
    assert.equal(JSON.stringify(res.details.rows).includes('peer handoff with report summary'), false, 'history details must not include full ordinary message body')
    assert.equal(res.details.filter.limit, 10)
    assert.equal(res.details.filter.includeMessages, true)

    res = await tool('agentteam_task').execute('query-history-worker-bounded', {
      action: 'history',
      taskId: 'T001',
      limit: 3,
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, 'History for T001: showing 3 of 8 rows')
    assert.equal(res.details.shownCount, 3)
    assert.equal(res.details.hiddenCount, 5)
    assert.equal(res.details.filter.limit, 3)

    await assert.rejects(
      () => tool('agentteam_task').execute('query-history-missing-task', {
        action: 'history',
        taskId: 'T999',
      }, null, () => {}, researchCtx),
      /Task T999 not found/,
    )
    await assert.rejects(
      () => tool('agentteam_task').execute('query-report-missing', {
        action: 'report',
        reportId: 'TR9999',
      }, null, () => {}, researchCtx),
      /Task report TR9999 not found/,
    )
    await assert.rejects(
      () => tool('agentteam_task').execute('query-report-wrong-task', {
        action: 'report',
        reportId: t001DoneReports[0].id,
        taskId: 'T002',
      }, null, () => {}, researchCtx),
      new RegExp(`Task report ${t001DoneReports[0].id} is for task T001, not T002`),
    )

    leadMailbox = modules.state.readMailbox('full-suite-team', 'team-lead')
    const t001DoneMailbox = leadMailbox.find(m => m.type === 'report_done' && m.metadata?.reportId === t001DoneReports[0].id)
    assert.ok(t001DoneMailbox, 'worker done report should notify leader with TaskReport reference')
    assert.ok(t001DoneMailbox.text.includes('done report by research-one'), 'compact report mailbox should keep notification identity')
    assert.equal(t001DoneMailbox.text.includes('Done'), false, 'compact report mailbox should not duplicate full report body')
    assert.equal(t001DoneMailbox.summary.includes('Done'), true, 'compact report mailbox may include report summary')
    assert.equal(t001DoneMailbox.deliveredAt, undefined, 'new compact report mailbox should start undelivered')
    assert.equal(t001DoneMailbox.readAt, undefined, 'new compact report mailbox should start unread')

    res = await tool('agentteam_receive').execute('query-report-receive-hydrated-unread', {
      markRead: false,
      limit: 50,
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, `Hydrated report ${t001DoneReports[0].id}`)
    helpers.assertContains(res.content[0].text, 'Report text:\nDone')
    assert.equal(res.details.hydratedReports[t001DoneReports[0].id].text, 'Done')
    assert.ok(res.details.messages.some(message => message.id === t001DoneMailbox.id && message.text === t001DoneMailbox.text), 'details.messages should preserve compact mailbox row')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.taskReports[t001DoneReports[0].id].mailboxMessageId, t001DoneMailbox.id, 'TaskReport should retain delivered leader mailbox message id')
    let t001DoneMailboxAfterUnreadReceive = modules.state.readMailbox('full-suite-team', 'team-lead').find(m => m.id === t001DoneMailbox.id)
    assert.ok(t001DoneMailboxAfterUnreadReceive.deliveredAt, 'receive markRead=false should stamp deliveredAt')
    assert.equal(t001DoneMailboxAfterUnreadReceive.readAt, undefined, 'receive markRead=false should not stamp readAt')

    res = await tool('agentteam_receive').execute('query-report-receive-hydrated-read', {
      markRead: true,
      limit: 50,
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, `Hydrated report ${t001DoneReports[0].id}`)
    helpers.assertContains(res.content[0].text, 'Report text:\nDone')
    assert.equal(res.details.hydratedReports[t001DoneReports[0].id].text, 'Done')
    t001DoneMailboxAfterUnreadReceive = modules.state.readMailbox('full-suite-team', 'team-lead').find(m => m.id === t001DoneMailbox.id)
    assert.ok(t001DoneMailboxAfterUnreadReceive.deliveredAt, 'receive markRead=true should retain deliveredAt')
    assert.ok(t001DoneMailboxAfterUnreadReceive.readAt, 'receive markRead=true should stamp readAt')

    modules.state.pushMailboxMessage('full-suite-team', 'team-lead', {
      id: 'legacy-report-mailbox-full-text',
      from: 'legacy-worker',
      to: 'team-lead',
      text: 'legacy stored report full text body',
      summary: 'legacy report summary',
      type: 'report_done',
      taskId: 'T001',
      threadId: 'task:T001',
      priority: 'normal',
      wakeHint: 'hard',
      metadata: { reportOnly: true },
      createdAt: Date.now() + 1,
    })
    res = await tool('agentteam_receive').execute('query-report-receive-legacy-fallback', {
      markRead: true,
      limit: 50,
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'legacy stored report full text body')
    assert.equal(res.details.hydratedReports, undefined, 'legacy report mailbox without reportId should not claim hydration')

    res = await tool('agentteam_task').execute('task-close-owned-create', {
      action: 'report_done',
      taskId: 'T002',
      note: 'planner done task created with owner',
    }, null, () => {}, planCtx)
    helpers.assertContains(res.content[0].text, 'Reported done for T002 to team-lead')
    assert.equal(res.details.reportOnly, true)
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, 'open', 'planner done report should be report-only and not mutate task status')
    assert.equal(legacyNotes(team.tasks['T002']).length, 0, 'planner report_done should not append TeamTask.notes')
    assert.equal(legacyNotes(team.tasks['T002']).filter(note => note.text.startsWith('Linked message:') && note.text.includes('done report by plan-one')).length, 0, 'planner done report should not append linked mailbox task note')

    res = await tool('agentteam_task').execute('planner-create-denied', {
      action: 'create',
      title: 'Planner should not create',
      description: 'planner default advisory only',
    }, null, () => {}, planCtx)
    assert.equal(res.details.denied, true)
    helpers.assertContains(res.content[0].text, "Task action 'create' is leader-only")

    res = await tool('agentteam_task').execute('planner-assign-denied', {
      action: 'assign',
      taskId: 'T002',
      owner: 'plan-one',
    }, null, () => {}, planCtx)
    assert.equal(res.details.denied, true)
    helpers.assertContains(res.content[0].text, "Task action 'assign' is leader-only")

    res = await tool('agentteam_task').execute('planner-block-denied', {
      action: 'block',
      taskId: 'T002',
    }, null, () => {}, planCtx)
    assert.equal(res.details.denied, true)
    helpers.assertContains(res.content[0].text, "Task action 'block' is leader-only")

    res = await tool('agentteam_task').execute('worker-report-blocked', {
      action: 'report_blocked',
      taskId: 'T002',
      note: 'Need leader decision',
      blockedBy: ['leader decision'],
    }, null, () => {}, planCtx)
    helpers.assertContains(res.content[0].text, 'Reported blocked status for T002 to team-lead')
    assert.equal(res.details.reportOnly, true)
    assert.deepEqual(res.details.reportedBlockedBy, ['leader decision'])
    team = modules.state.readTeamState('full-suite-team')
    const coreBlockedReportT002 = coreReducer.transitionTask(
      { ...team.tasks['T002'], updatedAt: team.tasks['T002'].updatedAt - 1 },
      { type: 'report_blocked', at: team.tasks['T002'].updatedAt, actor: 'plan-one', note: 'Need leader decision' },
    )
    assert.equal(coreBlockedReportT002.ok, true)
    assert.equal(team.tasks['T002'].status, coreBlockedReportT002.task.status, 'production report_blocked status should match core reducer')
    assert.equal(team.tasks['T002'].status, 'open', 'report_blocked should not mutate task status')
    assert.deepEqual(team.tasks['T002'].blockedBy, [], 'report_blocked should not mutate task blockedBy')
    assert.equal(legacyNotes(team.tasks['T002']).length, 0, 'report_blocked should not append TeamTask.notes')
    assert.equal(legacyNotes(team.tasks['T002']).some(note => note.messageType === 'report_blocked' && note.metadata?.reportOnly === true), false, 'report_blocked should not append blocked report-only note')
    assert.equal(legacyNotes(team.tasks['T002']).filter(note => note.text.startsWith('Linked message:') && note.text.includes('blocked report by plan-one')).length, 0, 'report_blocked should not append linked mailbox task note')
    const t002BlockedReports = Object.values(team.taskReports).filter(report => report.taskId === 'T002' && report.type === 'report_blocked' && report.author === 'plan-one')
    assert.equal(t002BlockedReports.length, 1, 'report_blocked should dual-write one TaskReport')
    assert.equal(t002BlockedReports[0].text, 'Need leader decision\nBlocked by: leader decision')
    assert.deepEqual(t002BlockedReports[0].reportedBlockedBy, ['leader decision'])
    assert.equal(t002BlockedReports[0].reporterIsOwner, true)
    assert.equal(t002BlockedReports[0].ownerAtReport, 'plan-one')
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T002' && event.type === 'report_submitted' && event.reportId === t002BlockedReports[0].id), 'report_blocked should dual-write report_submitted event')
    leadMailbox = modules.state.readMailbox('full-suite-team', 'team-lead')
    const blockedReport = leadMailbox.find(m => m.type === 'report_blocked' && m.text.includes('blocked report by plan-one'))
    assert.ok(blockedReport, 'report_blocked should notify leader')
    assert.equal(blockedReport.priority, 'high')
    assert.equal(blockedReport.wakeHint, 'hard')
    assert.equal(blockedReport.metadata?.policyIntent, 'leader_attention')
    assert.equal(blockedReport.metadata?.reportOnly, true)
    assert.equal(blockedReport.metadata?.reporterIsOwner, true)
    assert.equal(blockedReport.metadata?.reportId, t002BlockedReports[0].id, 'blocked report mailbox should reference TaskReport id')
    assert.equal(blockedReport.text.includes('Need leader decision'), false, 'blocked report mailbox should not duplicate full report body')

    const nonOwnerBlockedMailboxBefore = modules.state.readMailbox('full-suite-team', 'team-lead').length
    const nonOwnerBlockedProjectionBefore = Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length
    const nonOwnerBlockedTeamLeadRequestsBefore = deliveryRequestsForMember('team-lead')
    const nonOwnerBlockedReportsBefore = Object.keys(modules.state.readTeamState('full-suite-team').taskReports).length
    const nonOwnerBlockedReportEventsBefore = Object.values(modules.state.readTeamState('full-suite-team').taskEvents).filter(event => event.type === 'report_submitted').length
    res = await tool('agentteam_task').execute('non-owner-report-blocked', {
      action: 'report_blocked',
      taskId: 'T002',
      note: 'Cross-team dependency looks blocked',
      blockedBy: ['external dependency'],
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, 'Cannot report_blocked T002: research-one is not the task owner (plan-one)')
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'task_reporter_not_owner')
    assert.equal(res.details.actor, 'research-one')
    assert.equal(res.details.taskOwner, 'plan-one')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, 'open', 'non-owner report_blocked should not mutate task status')
    assert.equal(team.tasks['T002'].owner, 'plan-one', 'non-owner report_blocked should not mutate owner')
    assert.deepEqual(team.tasks['T002'].blockedBy, [], 'non-owner report_blocked should not mutate blockedBy')
    assert.equal(legacyNotes(team.tasks['T002']).some(note => note.author === 'research-one' && note.messageType === 'report_blocked'), false, 'non-owner report_blocked must not append task note')
    assert.equal(Object.keys(team.taskReports).length, nonOwnerBlockedReportsBefore, 'non-owner report_blocked must not append TaskReport')
    assert.equal(Object.values(team.taskEvents).filter(event => event.type === 'report_submitted').length, nonOwnerBlockedReportEventsBefore, 'non-owner report_blocked must not append report_submitted event')
    leadMailbox = modules.state.readMailbox('full-suite-team', 'team-lead')
    assert.equal(leadMailbox.length, nonOwnerBlockedMailboxBefore, 'non-owner report_blocked must not notify leader')
    assert.equal(leadMailbox.some(m => m.type === 'report_blocked' && m.text.includes('blocked report by research-one')), false, 'non-owner report_blocked must not notify leader')
    assert.equal(Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length, nonOwnerBlockedProjectionBefore, 'non-owner report_blocked must not create leader projection state')
    assertDeliveryRequestsUnchanged('team-lead', nonOwnerBlockedTeamLeadRequestsBefore, 'non-owner report_blocked must not create leader delivery')

    const nonOwnerDoneNotesBefore = legacyNotes(team.tasks['T002']).length
    const nonOwnerDoneMailboxBefore = modules.state.readMailbox('full-suite-team', 'team-lead').length
    const nonOwnerDoneProjectionBefore = Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length
    const nonOwnerDoneTeamLeadRequestsBefore = deliveryRequestsForMember('team-lead')
    const nonOwnerDoneReportsBefore = Object.keys(team.taskReports).length
    const nonOwnerDoneReportEventsBefore = Object.values(team.taskEvents).filter(event => event.type === 'report_submitted').length
    const nonOwnerDoneEffects = []
    res = await taskService.executeTaskAction({
      action: 'report_done',
      taskId: 'T002',
      note: 'Cross-team done report must be rejected',
    }, researchCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      pushMailboxMessage: async () => {
        nonOwnerDoneEffects.push('pushMailbox')
        throw new Error('non-owner report_done should not push mailbox')
      },
      requestLeaderAttentionIfNeeded: async () => {
        nonOwnerDoneEffects.push('leaderAttention')
        throw new Error('non-owner report_done should not project')
      },
      requestWorkerDelivery: async () => {
        nonOwnerDoneEffects.push('workerDelivery')
        throw new Error('non-owner report_done should not deliver')
      },
      invalidateStatus: () => {
        nonOwnerDoneEffects.push('invalidateStatus')
      },
    }))
    helpers.assertContains(res.content[0].text, 'Cannot report_done T002: research-one is not the task owner (plan-one)')
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'task_reporter_not_owner')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(legacyNotes(team.tasks['T002']).length, nonOwnerDoneNotesBefore, 'non-owner report_done must not append task note')
    assert.equal(Object.keys(team.taskReports).length, nonOwnerDoneReportsBefore, 'non-owner report_done must not append TaskReport')
    assert.equal(Object.values(team.taskEvents).filter(event => event.type === 'report_submitted').length, nonOwnerDoneReportEventsBefore, 'non-owner report_done must not append report_submitted event')
    assert.equal(modules.state.readMailbox('full-suite-team', 'team-lead').length, nonOwnerDoneMailboxBefore, 'non-owner report_done must not notify leader')
    assert.equal(Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length, nonOwnerDoneProjectionBefore, 'non-owner report_done must not create leader projection state')
    assertDeliveryRequestsUnchanged('team-lead', nonOwnerDoneTeamLeadRequestsBefore, 'non-owner report_done must not create leader delivery')
    assert.deepEqual(nonOwnerDoneEffects, ['invalidateStatus'], 'non-owner report_done should only invalidate UI status after denial')

    const factualBlockPlanRequestsBefore = deliveryRequestsForMember('plan-one')
    res = await tool('agentteam_task').execute('leader-block-factually', {
      action: 'block',
      taskId: 'T002',
      blockedBy: ['leader decision'],
      note: 'Leader accepted blocker',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Blocked T002')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, 'blocked', 'leader block should factually block task')
    assert.deepEqual(team.tasks['T002'].blockedBy, ['leader decision'])
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T002' && event.type === 'blocked' && event.data?.blockedBy?.[0] === 'leader decision'), 'leader factual block should dual-write blocked event')

    assertDeliveryRequestsUnchanged('plan-one', factualBlockPlanRequestsBefore, 'leader factual block should not create or refresh worker delivery')

    const assignmentWhileBlockedMailboxBefore = modules.state.readMailbox('full-suite-team', 'plan-one').length
    const assignmentWhileBlockedRequestsBefore = deliveryRequestsForMember('plan-one')
    res = await tool('agentteam_send').execute('send-assignment-factually-blocked-denied', {
      to: 'plan-one',
      message: 'Try to work T002 while blocked',
      type: 'assignment',
      taskId: 'T002',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'task_blocked_by_gate')
    assert.equal(modules.state.readMailbox('full-suite-team', 'plan-one').length, assignmentWhileBlockedMailboxBefore, 'factually blocked assignment deny should not push mailbox')
    assertDeliveryRequestsUnchanged('plan-one', assignmentWhileBlockedRequestsBefore, 'factually blocked assignment deny should not create or refresh delivery')

    const beforeBlockedUpdateComplete = modules.state.readTeamState('full-suite-team').tasks['T002']
    const blockCompleteRequestsBefore = deliveryRequestsForMember('plan-one')
    res = await tool('agentteam_task').execute('leader-block-blocked-denied', {
      action: 'block',
      taskId: 'T002',
      note: 'try to block while already blocked',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'invalid_task_status')
    helpers.assertContains(res.content[0].text, 'Cannot block T002: expected open, got blocked')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, beforeBlockedUpdateComplete.status, 'denied block done should not mutate status')
    assert.deepEqual(team.tasks['T002'].blockedBy, beforeBlockedUpdateComplete.blockedBy, 'denied block done should retain blockers')
    assert.equal(team.tasks['T002'].updatedAt, beforeBlockedUpdateComplete.updatedAt, 'denied block done should not mutate task timestamp')
    assertDeliveryRequestsUnchanged('plan-one', blockCompleteRequestsBefore, 'denied block done should not create or refresh delivery')

    res = await tool('agentteam_task').execute('leader-unblock-factually', {
      action: 'unblock',
      taskId: 'T002',
      note: 'Leader cleared blocker',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Unblocked T002')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, 'open', 'leader unblock should factually unblock task')
    assert.deepEqual(team.tasks['T002'].blockedBy, [])
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T002' && event.type === 'unblocked'), 'leader unblock should dual-write unblocked event')

    res = await tool('agentteam_task').execute('leader-close-blocked-allowed', {
      action: 'close',
      taskId: 'T003',
      note: 'leader accepts closure from blocked state',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Closed T003')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T003'].status, 'done')
    assert.deepEqual(team.tasks['T003'].blockedBy, [])
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T003' && event.type === 'closed'), 'leader close should dual-write closed event')

    res = await taskService.executeTaskAction({
      action: 'report_done',
      taskId: 'T002',
      note: 'Done but projection fails',
    }, planCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      requestLeaderAttentionIfNeeded: async (_team, message) => {
        assert.equal(message.type, 'report_done')
        assert.equal(message.wakeHint, 'hard')
        assert.equal(String(message.text).includes('Done but projection fails'), false, 'leader attention should remain compact and omit full report body')
        throw new Error('simulated projection failure')
      },
    }))
    helpers.assertContains(res.content[0].text, 'Reported done for T002 to team-lead')
    helpers.assertContains(res.content[0].text, 'warning: side effect failed')
    assert.equal(res.details.reportOnly, true)
    assert.equal(res.details.warning, 'side_effect_failed')
    assert.ok(res.details.sideEffectWarnings.some(item => item.kind === 'requestLeaderAttention' && item.error.includes('simulated projection failure')))

    const doneReportTeamBeforeMailboxFailure = modules.state.readTeamState('full-suite-team')
    const doneReportNotesBeforeMailboxFailure = legacyNotes(doneReportTeamBeforeMailboxFailure.tasks['T002']).length
    const doneReportLinkedNotesBeforeMailboxFailure = legacyNotes(doneReportTeamBeforeMailboxFailure.tasks['T002']).filter(note => note.text.startsWith('Linked message:')).length
    const doneReportArtifactsBeforeMailboxFailure = Object.keys(doneReportTeamBeforeMailboxFailure.taskReports).length
    const doneReportEventsBeforeMailboxFailure = Object.values(doneReportTeamBeforeMailboxFailure.taskEvents).filter(event => event.type === 'report_submitted').length
    const doneReportMailboxFailureOrder = []
    res = await taskService.executeTaskAction({
      action: 'report_done',
      taskId: 'T002',
      note: 'Done but mailbox fails',
    }, planCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      pushMailboxMessage: async () => {
        doneReportMailboxFailureOrder.push('pushMailbox')
        throw new Error('simulated leader mailbox failure')
      },
      requestLeaderAttentionIfNeeded: async () => {
        doneReportMailboxFailureOrder.push('leaderAttention')
        return { ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'projected', method: 'projection_requested' }
      },
      invalidateStatus: () => {
        doneReportMailboxFailureOrder.push('invalidateStatus')
      },
    }))
    helpers.assertContains(res.content[0].text, 'Reported done for T002 to team-lead')
    helpers.assertContains(res.content[0].text, 'warning: side effect failed')
    helpers.assertContains(res.content[0].text, 'leader mailbox push failed for team-lead: simulated leader mailbox failure')
    assert.equal(res.details.reportOnly, true)
    assert.equal(res.details.warning, 'side_effect_failed')
    assert.equal(res.details.leaderMailboxDelivered, false)
    assert.deepEqual(res.details.mailboxDeliveryFailed, { recipient: 'team-lead', error: 'simulated leader mailbox failure' })
    assert.ok(res.details.sideEffectWarnings.some(item => item.kind === 'pushMailbox' && item.error.includes('simulated leader mailbox failure')))
    assert.deepEqual(doneReportMailboxFailureOrder.sort(), ['invalidateStatus', 'pushMailbox'], 'leader mailbox failure should not request leader attention/projection without a stored mailbox message')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, 'open', 'mailbox failure should not mutate report-only task status')
    assert.equal(legacyNotes(team.tasks['T002']).length, doneReportNotesBeforeMailboxFailure, 'mailbox failure should not append TeamTask.notes')
    assert.equal(legacyNotes(team.tasks['T002']).filter(note => note.text.startsWith('Linked message:')).length, doneReportLinkedNotesBeforeMailboxFailure, 'mailbox failure should not append a linked mailbox note')
    assert.equal(Object.keys(team.taskReports).length, doneReportArtifactsBeforeMailboxFailure + 1, 'mailbox failure should still append TaskReport artifact')
    assert.ok(Object.values(team.taskReports).some(report => report.text === 'Done but mailbox fails' && report.mailboxMessageId === undefined), 'mailbox failure TaskReport should not reference a missing mailbox message')
    assert.equal(Object.values(team.taskEvents).filter(event => event.type === 'report_submitted').length, doneReportEventsBeforeMailboxFailure + 1, 'mailbox failure should still append report_submitted event')

    const blockedNotesBeforeMailboxFailure = legacyNotes(team.tasks['T002']).length
    const blockedLinkedNotesBeforeMailboxFailure = legacyNotes(team.tasks['T002']).filter(note => note.text.startsWith('Linked message:')).length
    const blockedReportArtifactsBeforeMailboxFailure = Object.keys(team.taskReports).length
    const blockedReportEventsBeforeMailboxFailure = Object.values(team.taskEvents).filter(event => event.type === 'report_submitted').length
    const blockedMailboxFailureOrder = []
    res = await taskService.executeTaskAction({
      action: 'report_blocked',
      taskId: 'T002',
      note: 'Blocked but mailbox fails',
      blockedBy: ['leader decision'],
    }, planCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      pushMailboxMessage: async () => {
        blockedMailboxFailureOrder.push('pushMailbox')
        throw new Error('simulated leader mailbox failure')
      },
      requestLeaderAttentionIfNeeded: async () => {
        blockedMailboxFailureOrder.push('leaderAttention')
        return { ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'projected', method: 'projection_requested' }
      },
      invalidateStatus: () => {
        blockedMailboxFailureOrder.push('invalidateStatus')
      },
    }))
    helpers.assertContains(res.content[0].text, 'Reported blocked status for T002 to team-lead')
    helpers.assertContains(res.content[0].text, 'warning: side effect failed')
    helpers.assertContains(res.content[0].text, 'leader mailbox push failed for team-lead: simulated leader mailbox failure')
    assert.equal(res.details.reportOnly, true)
    assert.equal(res.details.warning, 'side_effect_failed')
    assert.equal(res.details.leaderMailboxDelivered, false)
    assert.deepEqual(res.details.mailboxDeliveryFailed, { recipient: 'team-lead', error: 'simulated leader mailbox failure' })
    assert.ok(res.details.sideEffectWarnings.some(item => item.kind === 'pushMailbox' && item.error.includes('simulated leader mailbox failure')))
    assert.deepEqual(blockedMailboxFailureOrder.sort(), ['invalidateStatus', 'pushMailbox'], 'blocked report mailbox failure should not request leader attention/projection without a stored mailbox message')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, 'open', 'blocked report mailbox failure should not mutate task status')
    assert.equal(legacyNotes(team.tasks['T002']).length, blockedNotesBeforeMailboxFailure, 'blocked report mailbox failure should not append TeamTask.notes')
    assert.equal(legacyNotes(team.tasks['T002']).filter(note => note.text.startsWith('Linked message:')).length, blockedLinkedNotesBeforeMailboxFailure, 'blocked report mailbox failure should not append a linked mailbox note')
    assert.equal(Object.keys(team.taskReports).length, blockedReportArtifactsBeforeMailboxFailure + 1, 'blocked report mailbox failure should still append TaskReport artifact')
    assert.ok(Object.values(team.taskReports).some(report => report.text === 'Blocked but mailbox fails\nBlocked by: leader decision' && report.mailboxMessageId === undefined), 'blocked mailbox failure TaskReport should not reference a missing mailbox message')
    assert.equal(Object.values(team.taskEvents).filter(event => event.type === 'report_submitted').length, blockedReportEventsBeforeMailboxFailure + 1, 'blocked report mailbox failure should still append report_submitted event')

    res = await tool('agentteam_task').execute('leader-close-worker-reported', {
      action: 'close',
      taskId: 'T001',
      note: 'Leader accepted done report',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Closed T001')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T001'].status, 'done', 'leader close should mutate status')
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T001' && event.type === 'closed'), 'leader close accepted report should dual-write closed event')
    const coreClosedT001 = coreReducer.transitionTask(
      { ...team.tasks['T001'], status: 'open', updatedAt: team.tasks['T001'].updatedAt - 1 },
      { type: 'close', at: team.tasks['T001'].updatedAt },
    )
    assert.equal(coreClosedT001.ok, true)
    assert.equal(team.tasks['T001'].status, coreClosedT001.task.status, 'production close status should match core reducer')
    assert.equal(team.tasks['T001'].owner, 'research-one', 'leader close should not mutate owner')
    assert.deepEqual(team.tasks['T001'].blockedBy, [], 'leader close should clear blockers')

    const doneTaskBeforeReports = modules.state.readTeamState('full-suite-team').tasks['T001']
    const doneTaskNoteCountBeforeReports = legacyNotes(doneTaskBeforeReports).length
    const doneReportMailboxBefore = modules.state.readMailbox('full-suite-team', 'team-lead').length
    const doneReportProjectionBefore = Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length
    const doneReportTeamLeadRequestsBefore = deliveryRequestsForMember('team-lead')
    const doneReportEffects = []
    res = await taskService.executeTaskAction({
      action: 'report_done',
      taskId: 'T001',
      note: 'late done report after close',
    }, researchCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      pushMailboxMessage: async () => {
        doneReportEffects.push('pushMailbox')
        throw new Error('done report should not push mailbox')
      },
      requestLeaderAttentionIfNeeded: async () => {
        doneReportEffects.push('leaderAttention')
        throw new Error('done report should not project')
      },
      requestWorkerDelivery: async () => {
        doneReportEffects.push('workerDelivery')
        throw new Error('done report should not deliver')
      },
      invalidateStatus: () => {
        doneReportEffects.push('invalidateStatus')
      },
    }))
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'invalid_task_status')
    assert.equal(res.details.status, 'done')
    helpers.assertContains(res.content[0].text, 'Cannot report_done T001: expected open or blocked, got done')

    res = await taskService.executeTaskAction({
      action: 'report_blocked',
      taskId: 'T001',
      note: 'late blocked report after close',
      blockedBy: ['already done'],
    }, researchCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      pushMailboxMessage: async () => {
        doneReportEffects.push('pushMailbox')
        throw new Error('done blocked report should not push mailbox')
      },
      requestLeaderAttentionIfNeeded: async () => {
        doneReportEffects.push('leaderAttention')
        throw new Error('done blocked report should not project')
      },
      requestWorkerDelivery: async () => {
        doneReportEffects.push('workerDelivery')
        throw new Error('done blocked report should not deliver')
      },
      invalidateStatus: () => {
        doneReportEffects.push('invalidateStatus')
      },
    }))
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'invalid_task_status')
    assert.equal(res.details.status, 'done')
    helpers.assertContains(res.content[0].text, 'Cannot report_blocked T001: expected open or blocked, got done')

    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T001'].status, 'done', 'denied reports on done task should not mutate status')
    assert.equal(legacyNotes(team.tasks['T001']).length, doneTaskNoteCountBeforeReports, 'denied reports on done task should not append task notes')
    assert.equal(modules.state.readMailbox('full-suite-team', 'team-lead').length, doneReportMailboxBefore, 'denied reports on done task should not notify leader')
    assert.equal(Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length, doneReportProjectionBefore, 'denied reports on done task should not create projection state')
    assertDeliveryRequestsUnchanged('team-lead', doneReportTeamLeadRequestsBefore, 'denied reports on done task should not create leader delivery')
    assert.deepEqual(doneReportEffects, ['invalidateStatus', 'invalidateStatus'], 'denied reports on done task should only invalidate UI status')

    const doneCloseNotesBefore = legacyNotes(team.tasks['T001']).length
    const doneCloseMailboxBefore = modules.state.readMailbox('full-suite-team', 'team-lead').length
    const doneCloseEffects = []
    res = await taskService.executeTaskAction({
      action: 'close',
      taskId: 'T001',
      note: 'late close after close',
    }, leaderCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      pushMailboxMessage: async () => {
        doneCloseEffects.push('pushMailbox')
        throw new Error('done close should not push mailbox')
      },
      requestLeaderAttentionIfNeeded: async () => {
        doneCloseEffects.push('leaderAttention')
        throw new Error('done close should not project')
      },
      requestWorkerDelivery: async () => {
        doneCloseEffects.push('workerDelivery')
        throw new Error('done close should not deliver')
      },
      invalidateStatus: () => {
        doneCloseEffects.push('invalidateStatus')
      },
    }))
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'invalid_task_status')
    assert.equal(res.details.status, 'done')
    helpers.assertContains(res.content[0].text, 'Cannot close T001: expected open or blocked, got done')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(legacyNotes(team.tasks['T001']).length, doneCloseNotesBefore, 'denied close on done task should not append task notes')
    assert.equal(modules.state.readMailbox('full-suite-team', 'team-lead').length, doneCloseMailboxBefore, 'denied close on done task should not notify leader')
    assert.deepEqual(doneCloseEffects, ['invalidateStatus'], 'denied close on done task should only invalidate UI status')

    const legacyValidationProbe = modules.state.validatePersistedTeamState({
      tasks: {
        T999: {
          id: 'T999',
          title: 'Legacy task status fixture',
          description: 'strict validation should quarantine before production task commands',
          status: 'in_progress',
          blockedBy: [],
          notes: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    })
    assert.ok(legacyValidationProbe.some(reason => reason.code === 'legacy_task_status' && reason.path === '$.tasks.T999.status' && reason.value === 'in_progress'), 'strict validation should reject legacy persisted task statuses before active task commands')

    const doneAssignmentMailboxBefore = modules.state.readMailbox('full-suite-team', 'research-one').length
    const doneAssignmentRequestsBefore = deliveryRequestsForMember('research-one')
    res = await tool('agentteam_send').execute('send-assignment-done-denied', {
      to: 'research-one',
      message: 'Try to reassign done T001',
      type: 'assignment',
      taskId: 'T001',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'task_not_actionable')
    assert.equal(modules.state.readMailbox('full-suite-team', 'research-one').length, doneAssignmentMailboxBefore, 'done assignment deny should not push mailbox')
    assertDeliveryRequestsUnchanged('research-one', doneAssignmentRequestsBefore, 'done assignment deny should not create or refresh delivery')

    } finally {
      modules.tmux.captureTmuxSnapshot = originalCaptureTmuxSnapshot
    }
  },
}
