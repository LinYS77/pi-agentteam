const assert = require('node:assert/strict')
module.exports = {
  name: 'service unit helpers',
  async run(env) {
    const { modules } = env
    const workerRole = env.helpers.requireDist('tools/workerRole.js')
    const workerPrompt = env.helpers.requireDist('tools/workerPrompt.js')
    const taskApplication = env.helpers.requireDist('app/taskApplication.js')
    const taskPermissions = env.helpers.requireDist('app/taskPermissions.js')
    const taskFormatting = env.helpers.requireDist('app/taskFormatting.js')
    const corePublicModel = env.helpers.requireDist('core/publicModel.js')
    const internalTypes = env.helpers.requireDist('internalTypes.js')
    const contextService = env.helpers.requireDist('hooks/contextService.js')
    const messageLifecycle = env.helpers.requireDist('messageLifecycle.js')

    assert.equal(env.modules.deliveryPolicy.resolveDeliveryPolicy({ policy: undefined }).policy, 'bridge-only')
    assert.equal(env.modules.deliveryPolicy.resolveDeliveryPolicy({ policy: 'legacy' }).workerBridgeAutoStart, true)
    assert.equal(env.modules.deliveryPolicy.resolveDeliveryPolicy({ policy: 'bridge-only' }).workerBridgeAutoPump, true)
    assert.equal(env.modules.deliveryPolicy.parseDeliveryPolicyName('bridge-only'), 'bridge-only')
    assert.equal(env.modules.deliveryPolicy.parseDeliveryPolicyName('bridge'), null, 'legacy bridge policy alias should not parse')
    assert.equal(env.modules.deliveryPolicy.parseDeliveryMode, undefined, 'deliveryMode compatibility parser should not be exported')
    assert.equal(env.modules.deliveryPolicy.normalizeDeliveryMode, undefined, 'deliveryMode compatibility normalizer should not be exported')
    assert.equal(env.modules.deliveryPolicy.DELIVERY_MODE_ENV_VAR, undefined, 'deliveryMode env alias should not be exported')
    assert.equal(env.modules.deliveryPolicy.DEFAULT_DELIVERY_MODE, undefined, 'deliveryMode default alias should not be exported')
    assert.equal(env.modules.deliveryPolicy.BRIDGE_ONLY_DELIVERY_MODE, undefined, 'deliveryMode bridge alias should not be exported')
    assert.equal(env.modules.deliveryPolicy.isBridgeOnlyDeliveryMode, undefined, 'deliveryMode predicate alias should not be exported')
    assert.equal(env.modules.deliveryPolicy.normalizeDeliveryPolicyName('surprise-mode'), 'bridge-only')
    assert.equal(env.modules.deliveryPolicy.isBridgeOnlyDeliveryPolicy({ policy: 'legacy' }), true)
    assert.deepEqual(env.modules.deliveryStore.DELIVERY_REQUEST_STATUSES, ['pending', 'claimed', 'submitted', 'started', 'completed', 'failed', 'expired', 'cancelled'])
    assert.deepEqual(internalTypes.WORKER_FSM_STATUSES, ['offline', 'idle', 'pending_delivery', 'queued', 'running', 'draining', 'error'])
    assert.equal(modules.state.TASK_NOTE_SOURCE_KINDS, undefined, 'task-note source-kind model should be retired')
    assert.equal(modules.state.TASK_NOTE_DISPLAY_MODES, undefined, 'task-note display-mode model should be retired')
    assert.equal(modules.state.TASK_NOTE_METADATA_VERSION, undefined, 'task-note metadata model should be retired')
    assert.equal(modules.state.taskLocalNoteMetadata, undefined, 'task-local note metadata helper should be retired')
    assert.equal(modules.state.taskReportNoteMetadata, undefined, 'task-report note metadata helper should be retired')
    assert.equal(modules.state.communicationRefMetadata, undefined, 'communication-ref note metadata helper should be retired')
    const legacyTaskNoteReasons = modules.state.validatePersistedTeamState({
      version: 1,
      tasks: {
        T001: {
          status: 'open',
          notes: [{ at: 1, author: 'worker-a', text: '[legacy note]', metadata: { sourceKind: 'communication_ref' } }],
        },
      },
    })
    assert.ok(legacyTaskNoteReasons.some(reason => reason.code === 'legacy_task_notes'), 'validation should reject active legacy task.notes after no-notes cleanup')
    assert.equal(env.modules.types.TEAM_LEAD, 'team-lead')
    assert.deepEqual(env.modules.types.TASK_STATUSES, corePublicModel.TASK_STATUSES, 'types.ts should expose public task statuses')
    assert.deepEqual(env.modules.types.WORKER_HEALTHS, corePublicModel.WORKER_HEALTHS, 'types.ts should expose public worker health')
    assert.deepEqual(env.modules.types.MESSAGE_TYPES, corePublicModel.MESSAGE_TYPES, 'types.ts should expose public message types')
    assert.deepEqual(env.modules.types.TASK_REPORT_TYPES, corePublicModel.TASK_REPORT_TYPES, 'types.ts should expose public task report types')
    assert.deepEqual(env.modules.types.MESSAGE_READ_STATES, corePublicModel.MESSAGE_READ_STATES, 'types.ts should expose public read lifecycle')
    assert.equal(env.modules.types.WORKER_FSM_STATUSES, undefined, 'types.ts public surface must not expose internal worker FSM statuses')
    assert.equal(env.modules.types.DELIVERY_REQUEST_STATUSES, undefined, 'types.ts public surface must not expose internal delivery statuses')
    assert.equal(env.modules.types.OUTBOX_EFFECT_STATUSES, undefined, 'types.ts public surface must not expose internal outbox statuses')
    assert.equal(env.modules.types.isWorkerHealth('running'), false, 'public worker health should reject internal runtime status')


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
    assert.ok(systemPrompt.includes('Public vocabulary: task statuses are open/blocked/done'), 'worker prompt should expose vNext public vocabulary')
    assert.ok(systemPrompt.includes('call agentteam_receive when you need full inbox/mailbox details'), 'worker prompt should keep mailbox read state clean')
    assert.ok(systemPrompt.includes('Task facts are concise shared state'), 'worker prompt should define task facts as concise state')
    assert.ok(systemPrompt.includes('durable TaskReport artifacts and owner-to-leader action requests'), 'worker prompt should define report artifacts as completion/blocker path')
    assert.ok(systemPrompt.includes('Task progress/history is compact local activity only and does not notify team-lead'), 'worker prompt should define progress/history as non-notifying local activity')
    assert.ok(systemPrompt.includes('same-task assigned task facts with task-bound mailbox messages'), 'worker prompt should mention same-task prompt merge')
    assert.ok(systemPrompt.includes('task-id based'), 'worker prompt should prefer task-linked handoffs')
    assert.ok(systemPrompt.includes('omit agentteam_send.to'), 'worker prompt should describe task-based return routing')
    assert.ok(systemPrompt.includes('agentteam_task action=report_blocked with the taskId'), 'worker prompt should prefer task-based blocked reports')
    assert.ok(systemPrompt.includes('implementer role prompt'))

    const plannerSystemPrompt = workerPrompt.buildWorkerSystemPrompt({
      teamName: 'demo',
      workerName: 'planner-1',
      role: 'planner',
      roleAgent: {
        name: 'planner',
        description: 'Planner',
        tools: [],
        systemPrompt: 'planner role prompt',
      },
    })
    assert.ok(plannerSystemPrompt.includes('Planner advisory gate'), 'planner system prompt should include advisory gate')
    assert.ok(plannerSystemPrompt.includes('leader-created actionable planning task'), 'planner prompt should require leader-created planning task')
    assert.ok(plannerSystemPrompt.includes('leader direct question'), 'planner prompt should allow direct leader question')
    assert.ok(plannerSystemPrompt.includes('leader assignment with taskId'), 'planner prompt should allow leader assignment with taskId')
    assert.ok(plannerSystemPrompt.includes('Peer inform/handoff messages are context for team-lead attention only'), 'planner prompt should prevent peer-driven planning work')

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

    const inheritedLaunch = workerPrompt.buildWorkerLaunchCommand({
      sessionFile: '/tmp/worker-session.jsonl',
      basePrompt: systemPrompt,
      roleAgent,
      leaderArgv: ['/usr/local/bin/node', '/usr/local/bin/pi', '--no-extensions', '--extension', './index.ts', '--session-dir', '/tmp/pi-agentteam-explicit-sessions'],
      leaderCwd: '/tmp/pi-agentteam-explicit-extension-root',
    })
    assert.ok(inheritedLaunch.includes("'--no-extensions'"), 'worker launch should inherit explicit leader no-extension discovery mode')
    assert.ok(inheritedLaunch.includes("'--extension' '/tmp/pi-agentteam-explicit-extension-root/index.ts'"), 'worker launch should inherit explicit local extension as an absolute path')
    assert.ok(inheritedLaunch.includes("'--session-dir' '/tmp/pi-agentteam-explicit-sessions'"), 'worker launch should inherit explicit leader session-dir')
    assert.ok(inheritedLaunch.includes("'--session' '/tmp/worker-session.jsonl'"), 'worker launch should still bind the worker session file')

    const team = {
      members: {
        'team-lead': { role: 'not-a-real-leader-role' },
        plan: { role: ' Planner ' },
        impl: { role: 'implementer' },
        blank: { role: '   ' },
      },
    }
    assert.equal(taskPermissions.actorRole(team, 'team-lead'), 'leader', 'team-lead name should always resolve as leader')
    assert.equal(taskPermissions.actorRole(team, 'plan'), 'planner', 'roles should be trimmed and lowercased')
    assert.equal(taskPermissions.actorRole(team, 'impl'), 'implementer')
    assert.equal(taskPermissions.actorRole(team, 'blank'), '', 'blank member role should stay empty before denial fallback')
    assert.equal(taskPermissions.actorRole(team, 'missing-worker'), '', 'unknown actor role should stay empty before denial fallback')
    assert.equal(taskApplication.actorRole(team, 'team-lead'), taskPermissions.actorRole(team, 'team-lead'), 'taskApplication should preserve actorRole compatibility re-export')
    assert.equal(taskApplication.actorRole(team, 'plan'), taskPermissions.actorRole(team, 'plan'), 'taskApplication should preserve normalized actorRole behavior')
    assert.equal(taskApplication.actorRole(team, 'impl'), taskPermissions.actorRole(team, 'impl'), 'taskApplication should preserve actorRole compatibility re-export')
    for (const leaderAction of ['create', 'assign', 'block', 'unblock', 'close', 'nudge_report', 'note']) {
      assert.equal(taskPermissions.ensureTaskPrivilege(team, 'team-lead', leaderAction), null, `team-lead should bypass privilege denial for ${leaderAction}`)
      assert.equal(taskApplication.ensureTaskPrivilege(team, 'team-lead', leaderAction), null, `taskApplication re-export should preserve leader privilege for ${leaderAction}`)
    }
    for (const workerAllowedAction of ['list', 'show', 'history', 'reports', 'report', 'progress', 'report_done', 'report_blocked']) {
      assert.equal(taskPermissions.ensureTaskPrivilege(team, 'plan', workerAllowedAction), null, `non-leader should be allowed to ${workerAllowedAction}`)
      assert.equal(taskApplication.ensureTaskPrivilege(team, 'plan', workerAllowedAction), null, `taskApplication re-export should allow ${workerAllowedAction}`)
    }
    for (const leaderOnlyAction of ['create', 'assign', 'block', 'unblock', 'close', 'nudge_report']) {
      const denial = taskPermissions.ensureTaskPrivilege(team, 'plan', leaderOnlyAction)
      assert.ok(denial.includes(`Task action '${leaderOnlyAction}' is leader-only for plan (planner). Allowed for non-leaders: list/show/history/reports/report/progress/report_done/report_blocked`), `${leaderOnlyAction} denial text should remain exact`)
      assert.equal(taskApplication.ensureTaskPrivilege(team, 'plan', leaderOnlyAction), denial, `taskApplication re-export should preserve ${leaderOnlyAction} denial text`)
    }
    assert.ok(taskPermissions.ensureTaskPrivilege(team, 'plan', 'note').includes("Task action 'note' is leader-only"), 'removed note action should not be worker-allowed')
    assert.ok(taskApplication.ensureTaskPrivilege(team, 'plan', 'note').includes("Task action 'note' is leader-only"), 'removed note action should not be worker-allowed through compatibility re-export')
    assert.ok(taskPermissions.ensureTaskPrivilege(team, 'impl', 'note').includes("Task action 'note' is leader-only"), 'removed note action should not be implementer-allowed')
    assert.ok(taskPermissions.ensureTaskPrivilege(team, 'impl', 'assign').includes("Task action 'assign' is leader-only"))
    assert.equal(taskPermissions.ensureTaskPrivilege(team, 'impl', 'assign') === null, false)
    assert.ok(taskPermissions.ensureTaskPrivilege(team, 'blank', 'create').includes("Task action 'create' is leader-only for blank (worker)."), 'blank role denial should use worker fallback')
    assert.ok(taskPermissions.ensureTaskPrivilege(team, 'missing-worker', 'create').includes("Task action 'create' is leader-only for missing-worker (worker)."), 'unknown actor denial should use worker fallback')

    const emptyCompletion = taskFormatting.buildImplementationCompletionNote()
    assert.ok(emptyCompletion.includes('Files changed:'))
    const briefCompletion = taskFormatting.buildImplementationCompletionNote('Implemented feature')
    assert.ok(briefCompletion.startsWith('Implemented feature'))
    assert.ok(briefCompletion.includes('Checks run:'))
    const structuredCompletion = taskFormatting.buildImplementationCompletionNote('Files changed: a.ts\nChecks run: npm test')
    assert.equal(structuredCompletion, 'Files changed: a.ts\nChecks run: npm test')

    assert.equal(contextService.shouldSyncMailboxOnInput({ source: 'interactive', text: 'ask agentteam for blocks' }), true)
    assert.equal(contextService.shouldSyncMailboxOnInput({ source: 'interactive', text: '/team' }), true)
    assert.equal(contextService.shouldSyncMailboxOnInput({ source: 'interactive', text: '/help' }), false)
    assert.equal(contextService.shouldSyncMailboxOnInput({ source: 'api', text: 'agentteam' }), false)

    const statusSessionFile = '/tmp/status-refresh-suite-leader.jsonl'
    const statusTeam = env.modules.state.createInitialTeamState({
      teamName: 'status-refresh-suite',
      leaderSessionFile: statusSessionFile,
      leaderCwd: '/tmp/status-refresh-suite-project',
    })
    statusTeam.members['team-lead'].paneId = '%leader'
    statusTeam.members['team-lead'].windowTarget = 'test:@1'
    env.modules.state.writeTeamState(statusTeam)
    env.modules.state.writeSessionContext(statusSessionFile, {
      teamName: statusTeam.name,
      memberName: 'team-lead',
    })
    const statusCtx = env.helpers.createCtx('/tmp/status-refresh-suite-project', statusSessionFile, [])

    const statusRuntime = env.modules.runtimeService.createRuntimeService(env.pi)
    let statusCalls = 0
    let widgetCalls = 0
    statusCtx.ui.setStatus = () => { statusCalls += 1 }
    statusCtx.ui.setWidget = () => { widgetCalls += 1 }

    statusRuntime.refreshStatus(statusCtx)
    assert.equal(statusCalls, 1, 'first non-forcing refresh should block status UI')
    assert.equal(widgetCalls, 1, 'first non-forcing refresh should block widget UI')

    statusRuntime.refreshStatus(statusCtx)
    assert.equal(statusCalls, 1, 'repeated non-forcing refresh should be skipped when status key is unchanged')
    assert.equal(widgetCalls, 1, 'repeated non-forcing refresh should not block widget UI when status key is unchanged')

    statusRuntime.invalidateStatus(statusCtx)
    assert.equal(statusCalls, 2, 'invalidateStatus should still force one status refresh')
    assert.equal(widgetCalls, 2, 'invalidateStatus should still force one widget refresh')

  },
}
