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

    } finally {
      modules.tmux.captureTmuxSnapshot = originalCaptureTmuxSnapshot
    }
  },
}
