const assert = require('node:assert/strict')

function createOutboxSuiteTeam(modules, teamName) {
  modules.state.deleteTeamState(teamName)
  const team = modules.state.createInitialTeamState({
    teamName,
    leaderSessionFile: `/tmp/${teamName}-leader.jsonl`,
    leaderCwd: `/tmp/${teamName}`,
  })
  modules.state.upsertMember(team, {
    name: 'worker-a',
    role: 'researcher',
    cwd: `/tmp/${teamName}`,
    sessionFile: `/tmp/${teamName}-worker-a.jsonl`,
    status: 'idle',
  })
  modules.state.writeTeamState(team)
  modules.state.writeSessionContext(`/tmp/${teamName}-leader.jsonl`, { teamName, memberName: 'team-lead' })
  return team
}

function noopDelivery(recipient = 'worker-a') {
  return async (_team, memberName, _explicitTask, options) => ({
    ok: true,
    recipient: memberName ?? recipient,
    wakeHint: options?.wakeHint,
    reason: 'ok',
    method: 'bridge_requested',
  })
}

module.exports = {
  name: 'outbox store + runner skeleton',
  async run(env) {
    const outbox = env.helpers.requireDist('app/outbox.js')
    const store = env.helpers.requireDist('state/outboxStore.js')
    const runner = env.helpers.requireDist('app/effectRunner.js')
    const maintenance = env.helpers.requireDist('runtime/outboxMaintenance.js')
    const { modules } = env
    const runnerDeps = deps => env.patches.withOutboxHandlers(deps)
    const runOutboxOnceWithDeps = (input, deps) => runner.runOutboxOnce(input, runnerDeps(deps))
    const legacyNotes = task => Array.isArray(task?.notes) ? task.notes : []
    const maintenanceDeps = deps => ({
      outboxRunner: { runOnce: input => runOutboxOnceWithDeps(input, deps) },
    })

    assert.deepEqual(outbox.OUTBOX_EFFECT_STATUSES, ['pending', 'done', 'failed'])
    assert.ok(outbox.OUTBOX_EFFECT_KINDS.includes('inbox_item_append_requested'))
    assert.ok(outbox.OUTBOX_EFFECT_KINDS.includes('worker_delivery_requested'))
    assert.ok(outbox.OUTBOX_EFFECT_KINDS.includes('leader_attention_requested'))
    assert.ok(outbox.OUTBOX_EFFECT_KINDS.includes('task_message_ref_append_requested'), 'task-bound sends should have a durable TaskMessageRef effect kind')
    assert.equal(outbox.OUTBOX_EFFECT_KINDS.includes('leader_triage_requested'), false, 'old leader triage effect kind must not remain in the enum')
    assert.equal(typeof maintenance.runOutboxMaintenanceForTeam, 'function')
    assert.equal(typeof maintenance.outboxDiagnosticsSummary, 'function')

    const teamName = 'outbox-suite'
    createOutboxSuiteTeam(modules, teamName)

    const payload = {
      teamName,
      recipient: 'worker-a',
      message: {
        from: 'team-lead',
        to: 'worker-a',
        text: 'hello durable outbox',
        type: 'question',
        wakeHint: 'soft',
      },
    }
    const first = store.enqueueOutboxEffect({
      teamName,
      kind: 'inbox_item_append_requested',
      payload,
      idempotencyKey: 'inbox:M001',
      now: 1000,
    })
    const second = store.enqueueOutboxEffect({
      teamName,
      kind: 'inbox_item_append_requested',
      payload: { ...payload, message: { ...payload.message, summary: 'same key update' } },
      idempotencyKey: 'inbox:M001',
      now: 1010,
    })
    assert.equal(second.effectId, first.effectId, 'same idempotency key should return same effect id')
    assert.equal(Object.keys(store.readOutboxStore(teamName).effects).length, 1, 'same idempotency key should not duplicate effect records')
    assert.equal(store.getOutboxEffectByIdempotencyKey(teamName, 'inbox:M001').effectId, first.effectId)

    let pushCount = 0
    let result = await runOutboxOnceWithDeps({ teamName, workerId: 'runner-a', limit: 10, now: 1020 }, {
      pushMailboxMessage: (targetTeam, memberName, message) => {
        pushCount += 1
        return modules.state.pushMailboxMessage(targetTeam, memberName, message)
      },
      requestWorkerDelivery: noopDelivery(),
      requestLeaderAttentionIfNeeded: async () => ({ ok: true, recipient: 'team-lead', wakeHint: 'soft', reason: 'attention requested', method: 'leader_attention_requested' }),
    })
    assert.equal(result.claimed, 1)
    assert.equal(result.done, 1)
    assert.equal(pushCount, 1)
    assert.equal(store.getOutboxEffect(teamName, first.effectId).status, 'done')
    assert.equal(modules.state.readMailbox(teamName, 'worker-a').length, 1)

    result = await runOutboxOnceWithDeps({ teamName, workerId: 'runner-a', limit: 10, now: 1030 }, {
      pushMailboxMessage: () => {
        pushCount += 1
        throw new Error('done effect should not run again')
      },
      requestWorkerDelivery: noopDelivery(),
      requestLeaderAttentionIfNeeded: async () => ({ ok: true, recipient: 'team-lead', wakeHint: 'soft', reason: 'attention requested', method: 'leader_attention_requested' }),
    })
    assert.equal(result.claimed, 0, 'repeated runner execution should not claim done effects')
    assert.equal(pushCount, 1, 'done effect should not execute twice')
    assert.equal(modules.state.readMailbox(teamName, 'worker-a').length, 1, 'done effect should not duplicate mailbox side effect')

    const retry = store.enqueueOutboxEffect({
      teamName,
      kind: 'worker_delivery_requested',
      idempotencyKey: 'worker:retry',
      payload: {
        teamName,
        memberName: 'worker-a',
        options: { requestedBy: 'team-lead', reason: 'retry test', wakeHint: 'soft' },
      },
      maxAttempts: 3,
      now: 2000,
    })
    let deliveryAttempts = 0
    result = await runOutboxOnceWithDeps({ teamName, workerId: 'runner-b', limit: 10, now: 2010 }, {
      requestWorkerDelivery: async (_team, memberName, _explicitTask, options) => {
        deliveryAttempts += 1
        return { ok: false, recipient: memberName, wakeHint: options?.wakeHint, reason: 'transient bridge failure' }
      },
      requestLeaderAttentionIfNeeded: async () => ({ ok: true, recipient: 'team-lead', wakeHint: 'soft', reason: 'attention requested', method: 'leader_attention_requested' }),
    })
    assert.equal(result.failed, 1)
    assert.equal(result.retried, 1)
    assert.equal(deliveryAttempts, 1)
    let retryAfterFailure = store.getOutboxEffect(teamName, retry.effectId)
    assert.equal(retryAfterFailure.status, 'pending')
    assert.equal(retryAfterFailure.attempts, 1)
    assert.equal(retryAfterFailure.nextAttemptAt, 3010, 'first retry should use deterministic default backoff')
    assert.equal(retryAfterFailure.lastError, 'transient bridge failure')

    result = await runOutboxOnceWithDeps({ teamName, workerId: 'runner-b', limit: 10, now: 2500 }, {
      requestWorkerDelivery: async () => {
        deliveryAttempts += 1
        throw new Error('should not run before nextAttemptAt')
      },
      requestLeaderAttentionIfNeeded: async () => ({ ok: true, recipient: 'team-lead', wakeHint: 'soft', reason: 'attention requested', method: 'leader_attention_requested' }),
    })
    assert.equal(result.claimed, 0, 'effect should not be eligible before nextAttemptAt')
    assert.equal(deliveryAttempts, 1)

    result = await runOutboxOnceWithDeps({ teamName, workerId: 'runner-b', limit: 10, now: 3010 }, {
      requestWorkerDelivery: async (_team, memberName, _explicitTask, options) => {
        deliveryAttempts += 1
        return { ok: true, recipient: memberName, wakeHint: options?.wakeHint, reason: 'ok', method: 'bridge_requested' }
      },
      requestLeaderAttentionIfNeeded: async () => ({ ok: true, recipient: 'team-lead', wakeHint: 'soft', reason: 'attention requested', method: 'leader_attention_requested' }),
    })
    assert.equal(result.done, 1)
    assert.equal(deliveryAttempts, 2)
    assert.equal(store.getOutboxEffect(teamName, retry.effectId).status, 'done')

    const terminal = store.enqueueOutboxEffect({
      teamName,
      kind: 'worker_delivery_requested',
      idempotencyKey: 'worker:terminal-fail',
      payload: { teamName, memberName: 'worker-a', options: { wakeHint: 'hard' } },
      maxAttempts: 2,
      now: 4000,
    })
    for (const now of [4010, 5020]) {
      result = await runOutboxOnceWithDeps({ teamName, workerId: 'runner-c', limit: 10, now }, {
        requestWorkerDelivery: async (_team, memberName, _explicitTask, options) => ({
          ok: false,
          recipient: memberName,
          wakeHint: options?.wakeHint,
          reason: `fail at ${now}`,
        }),
        requestLeaderAttentionIfNeeded: async () => ({ ok: true, recipient: 'team-lead', wakeHint: 'soft', reason: 'attention requested', method: 'leader_attention_requested' }),
      })
    }
    const terminalAfter = store.getOutboxEffect(teamName, terminal.effectId)
    assert.equal(terminalAfter.status, 'failed')
    assert.equal(terminalAfter.attempts, 2)
    assert.equal(terminalAfter.lastError, 'fail at 5020')
    assert.equal(result.terminalFailed, 1)

    const terminalDuplicate = store.enqueueOutboxEffect({
      teamName,
      kind: 'worker_delivery_requested',
      idempotencyKey: 'worker:terminal-fail',
      payload: { teamName, memberName: 'worker-a', options: { wakeHint: 'hard', reason: 'should not resurrect' } },
      maxAttempts: 5,
      now: 6000,
    })
    assert.equal(terminalDuplicate.effectId, terminal.effectId)
    assert.equal(terminalDuplicate.status, 'failed', 'idempotent upsert should not resurrect terminal failed effects')
    result = await runOutboxOnceWithDeps({ teamName, workerId: 'runner-c', limit: 10, now: 7000 }, {
      requestWorkerDelivery: async () => {
        throw new Error('failed terminal effect should not run again')
      },
      requestLeaderAttentionIfNeeded: async () => ({ ok: true, recipient: 'team-lead', wakeHint: 'soft', reason: 'attention requested', method: 'leader_attention_requested' }),
    })
    assert.equal(result.claimed, 0)

    const claimRecovery = store.enqueueOutboxEffect({
      teamName,
      kind: 'leader_attention_requested',
      idempotencyKey: 'leader:claim-recovery',
      payload: {
        teamName,
        message: { type: 'question', wakeHint: 'soft', from: 'worker-a', text: 'need leader' },
      },
      now: 8000,
    })
    const claimed = store.claimOutboxEffects({ teamName, workerId: 'runner-d', claimTtlMs: 100, now: 8010 })
    assert.equal(claimed.length, 1)
    assert.equal(claimed[0].effectId, claimRecovery.effectId)
    assert.ok(store.getOutboxEffect(teamName, claimRecovery.effectId).claim, 'claim should be stored')
    const blockedClaim = store.claimOutboxEffects({ teamName, workerId: 'runner-e', claimTtlMs: 100, now: 8050 })
    assert.equal(blockedClaim.length, 0, 'active claim should block duplicate execution')
    const recovered = store.recoverExpiredOutboxClaims(teamName, 8111)
    assert.equal(recovered.length, 1)
    assert.equal(recovered[0].effectId, claimRecovery.effectId)
    assert.equal(store.getOutboxEffect(teamName, claimRecovery.effectId).claim, undefined)
    result = await runOutboxOnceWithDeps({ teamName, workerId: 'runner-e', limit: 10, now: 8120 }, {
      requestWorkerDelivery: noopDelivery(),
      requestLeaderAttentionIfNeeded: async (_team, message) => ({
        ok: true,
        recipient: 'team-lead',
        wakeHint: message.wakeHint,
        reason: 'leader attention requested question',
        method: 'leader_attention_requested',
      }),
    })
    assert.equal(result.done, 1)
    assert.equal(store.getOutboxEffect(teamName, claimRecovery.effectId).status, 'done')

    const maintenanceTeamName = 'outbox-maintenance-suite'
    createOutboxSuiteTeam(modules, maintenanceTeamName)
    const maintenanceEffect = store.enqueueOutboxEffect({
      teamName: maintenanceTeamName,
      kind: 'inbox_item_append_requested',
      idempotencyKey: 'maintenance:mailbox',
      payload: {
        teamName: maintenanceTeamName,
        recipient: 'worker-a',
        message: {
          from: 'team-lead',
          to: 'worker-a',
          text: 'maintenance retries pending mailbox effect',
          type: 'inform',
          wakeHint: 'none',
        },
      },
      now: 9000,
    })
    const expiredEffect = store.enqueueOutboxEffect({
      teamName: maintenanceTeamName,
      kind: 'leader_attention_requested',
      idempotencyKey: 'maintenance:expired-claim',
      payload: {
        teamName: maintenanceTeamName,
        message: { type: 'question', wakeHint: 'soft', from: 'worker-a', text: 'expired claim should recover' },
      },
      now: 9010,
    })
    const expiredClaim = store.claimOutboxEffects({ teamName: maintenanceTeamName, workerId: 'stale-maintenance', effectIds: [expiredEffect.effectId], claimTtlMs: 10, now: 9020 })
    assert.equal(expiredClaim.length, 1)
    let maintenanceProjectionCalls = 0
    const maintenanceRun = await maintenance.runOutboxMaintenanceForTeam(maintenanceTeamName, maintenanceDeps({
      requestWorkerDelivery: noopDelivery(),
      requestLeaderAttentionIfNeeded: async (_team, message) => {
        maintenanceProjectionCalls += 1
        return { ok: true, recipient: 'team-lead', wakeHint: message.wakeHint, reason: 'maintenance recovered attention', method: 'leader_attention_requested' }
      },
    }), { now: 9050, limit: 10 })
    assert.equal(maintenanceRun.recovered, 1, 'maintenance should recover expired claims before running')
    assert.equal(maintenanceRun.run.done, 2, 'maintenance tick should run eligible pending effects')
    assert.equal(store.getOutboxEffect(maintenanceTeamName, maintenanceEffect.effectId).status, 'done')
    assert.equal(store.getOutboxEffect(maintenanceTeamName, expiredEffect.effectId).status, 'done')
    assert.equal(maintenanceProjectionCalls, 1)
    assert.equal(modules.state.readMailbox(maintenanceTeamName, 'worker-a').filter(item => item.text === 'maintenance retries pending mailbox effect').length, 1)
    let maintenanceSummary = maintenance.outboxDiagnosticsSummary(maintenanceTeamName)
    assert.equal(maintenanceSummary.pending, 0)
    assert.equal(maintenanceSummary.failed, 0)
    assert.equal(maintenanceSummary.lastRunAt, 9050)
    const repeatedMaintenance = await maintenance.runOutboxMaintenanceForTeam(maintenanceTeamName, maintenanceDeps({
      requestWorkerDelivery: async () => {
        throw new Error('done maintenance effects must not rerun')
      },
      requestLeaderAttentionIfNeeded: async () => {
        throw new Error('done maintenance attention must not rerun')
      },
    }), { now: 9060, limit: 10 })
    assert.equal(repeatedMaintenance.run.claimed, 0, 'repeated maintenance should not claim done effects')
    assert.equal(modules.state.readMailbox(maintenanceTeamName, 'worker-a').filter(item => item.text === 'maintenance retries pending mailbox effect').length, 1, 'repeated maintenance should not duplicate mailbox output')
    maintenanceSummary = maintenance.outboxDiagnosticsSummary(maintenanceTeamName)
    assert.equal(maintenanceSummary.lastRunAt, 9060)

    const diagnosticsTeamName = 'outbox-diagnostics-suite'
    createOutboxSuiteTeam(modules, diagnosticsTeamName)
    const failedEffect = store.enqueueOutboxEffect({
      teamName: diagnosticsTeamName,
      kind: 'leader_attention_requested',
      idempotencyKey: 'diagnostics:terminal-fail',
      payload: {
        teamName: diagnosticsTeamName,
        message: { type: 'report_blocked', wakeHint: 'hard', from: 'worker-a', text: 'terminal diagnostics failure' },
      },
      maxAttempts: 1,
      now: 9100,
    })
    const diagnosticsRun = await maintenance.runOutboxMaintenanceForTeam(diagnosticsTeamName, maintenanceDeps({
      requestWorkerDelivery: noopDelivery(),
      requestLeaderAttentionIfNeeded: async () => {
        throw new Error('diagnostic terminal failure')
      },
    }), { now: 9110, limit: 10 })
    assert.equal(diagnosticsRun.run.terminalFailed, 1)
    const failedStored = store.getOutboxEffect(diagnosticsTeamName, failedEffect.effectId)
    assert.equal(failedStored.status, 'failed')
    const diagnosticsSummary = maintenance.outboxDiagnosticsSummary(diagnosticsTeamName)
    assert.equal(diagnosticsSummary.pending, 0)
    assert.equal(diagnosticsSummary.failed, 1)
    assert.equal(diagnosticsSummary.lastRunAt, 9110)
    assert.equal(diagnosticsSummary.lastFailedEffect.effectId, failedEffect.effectId)
    assert.equal(diagnosticsSummary.lastFailedEffect.kind, 'leader_attention_requested')
    assert.equal(diagnosticsSummary.lastFailedEffect.error, 'diagnostic terminal failure')
    const diagnosticsData = modules.panelDataSource.loadPanelData(diagnosticsTeamName)
    const diagnosticsState = modules.viewModel.createInitialPanelState()
    diagnosticsState.focus = 'members'
    diagnosticsState.selectedMemberIndex = 0
    diagnosticsState.selectedIndex = 0
    let diagnosticsSelection = modules.viewModel.buildPanelSelectionView(diagnosticsData, diagnosticsState)
    const collapsedDiagnosticsLines = modules.layout.renderTeamPanelLines(env.helpers.createFakeTheme(), { width: 180, height: 40, data: diagnosticsData, state: diagnosticsState, selection: diagnosticsSelection })
    assert.equal(collapsedDiagnosticsLines.some(line => line.includes('Outbox')), false, 'collapsed panel should not leak outbox diagnostics')
    assert.equal(collapsedDiagnosticsLines.some(line => line.includes('leader_attention_requested')), false, 'collapsed panel should not leak outbox effect kind')
    diagnosticsState.isDetailExpanded = true
    diagnosticsSelection = modules.viewModel.buildPanelSelectionView(diagnosticsData, diagnosticsState)
    const expandedDiagnosticsLines = modules.layout.renderTeamPanelLines(env.helpers.createFakeTheme(), { width: 180, height: 40, data: diagnosticsData, state: diagnosticsState, selection: diagnosticsSelection })
    assert.ok(expandedDiagnosticsLines.some(line => line.includes('Outbox') && line.includes('failed 1')), 'expanded diagnostics should show outbox failed count')
    assert.ok(expandedDiagnosticsLines.some(line => line.includes(failedEffect.effectId) && line.includes('leader_attention_requested')), 'expanded diagnostics should show last failed effect id/kind')
    assert.ok(expandedDiagnosticsLines.some(line => line.includes('diagnostic terminal failure')), 'expanded diagnostics should show last failed error')

    const messageService = env.helpers.requireDist('tools/messageService.js')
    const messageTeamName = 'outbox-message-production-suite'
    createOutboxSuiteTeam(modules, messageTeamName)
    modules.state.updateTeamState(messageTeamName, latest => {
      modules.state.createTask(latest, {
        title: 'task-bound message through outbox',
        description: 'validate linked task-note durability for send messages',
        owner: 'worker-a',
      })
    })
    const messageCtx = env.helpers.createCtx(`/tmp/${messageTeamName}`, `/tmp/${messageTeamName}-leader.jsonl`, env.notifications)
    const failingMessageCalls = []
    let sendResult = await messageService.executeSendMessage({
      to: 'worker-a',
      type: 'assignment',
      message: 'durable assignment with retry',
      summary: 'retry assignment',
      taskId: 'T001',
    }, messageCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      requestWorkerDelivery: async (_team, memberName, _explicitTask, options) => {
        failingMessageCalls.push(memberName)
        throw new Error('transient message delivery failure')
      },
    }))
    assert.deepEqual(sendResult.details.recipients, ['worker-a'], 'failed delivery should not make successful mailbox send disappear')
    assert.equal(sendResult.details.warning, 'side_effect_failed')
    assert.equal(failingMessageCalls.length, 1)
    const workerMailboxMessages = modules.state.readMailbox(messageTeamName, 'worker-a').filter(item => item.text === 'durable assignment with retry')
    assert.equal(workerMailboxMessages.length, 1, 'task-bound send should keep recipient mailbox as source of truth')
    let messageEffects = modules.state.listOutboxEffects(messageTeamName)
    let mailboxEffects = messageEffects.filter(effect => effect.kind === 'inbox_item_append_requested' && effect.payload?.message?.text === 'durable assignment with retry')
    assert.equal(mailboxEffects.length, 1, 'task-bound send should enqueue one durable mailbox effect')
    assert.equal(mailboxEffects[0].idempotencyKey.includes('durable assignment with retry'), false, 'mailbox outbox idempotency key should hash, not copy, the full message body')
    assert.ok(mailboxEffects[0].idempotencyKey.startsWith(`send-mailbox:${messageTeamName}:team-lead:worker-a:assignment:T001:task:T001::retry assignment:`), 'message mailbox idempotency key should preserve current routing/type/task/thread/summary components')
    assert.equal(mailboxEffects[0].payload.message.id, `mailbox-outbox-pending-${mailboxEffects[0].idempotencyKey}`, 'message mailbox outbox payload should retain current pending id before effect id is known')
    assert.equal(workerMailboxMessages[0].id, `mailbox-${mailboxEffects[0].effectId}`, 'delivered message mailbox id should match deterministic outbox mailbox id')
    assert.equal(workerMailboxMessages[0].metadata?.outboxEffectId, mailboxEffects[0].effectId, 'delivered mailbox should reference source outbox effect id')
    assert.equal(workerMailboxMessages[0].metadata?.outboxMailboxId, `mailbox-${mailboxEffects[0].effectId}`, 'delivered mailbox should persist deterministic outbox mailbox id metadata')
    assert.equal(mailboxEffects[0].payload.message.text, 'durable assignment with retry', 'mailbox outbox payload should retain full message body as source of truth')
    assert.equal(workerMailboxMessages[0].text, 'durable assignment with retry', 'recipient mailbox should retain full message body')
    let linkedTaskNoteEffects = messageEffects.filter(effect => effect.kind === 'task_note_append_requested')
    assert.equal(linkedTaskNoteEffects.length, 0, 'new task-bound send should not enqueue hidden communication-ref task-note effects')
    let taskMessageRefEffects = messageEffects.filter(effect => effect.kind === 'task_message_ref_append_requested')
    assert.equal(taskMessageRefEffects.length, 1, 'task-bound send should enqueue one durable TaskMessageRef effect')
    assert.equal(taskMessageRefEffects[0].status, 'done', 'task-bound send should run TaskMessageRef effect after mailbox success')
    assert.equal(taskMessageRefEffects[0].payload.mailboxMessageId, workerMailboxMessages[0].id)
    assert.equal(taskMessageRefEffects[0].payload.from, 'team-lead')
    assert.equal(taskMessageRefEffects[0].payload.to, 'worker-a')
    assert.equal(taskMessageRefEffects[0].payload.type, 'assignment')
    assert.equal(taskMessageRefEffects[0].payload.taskId, 'T001')
    assert.equal(taskMessageRefEffects[0].payload.threadId, 'task:T001')
    assert.equal(taskMessageRefEffects[0].payload.summary, 'retry assignment')
    assert.equal(taskMessageRefEffects[0].payload.priority, 'normal')
    assert.equal(taskMessageRefEffects[0].payload.wakeHint, 'hard')
    assert.equal(JSON.stringify(taskMessageRefEffects[0].payload).includes('durable assignment with retry'), false, 'TaskMessageRef outbox payload should not copy full message body')
    let messageTask = modules.state.readTeamState(messageTeamName).tasks.T001
    const taskUpdatedAtAfterRef = messageTask.updatedAt
    assert.equal(taskUpdatedAtAfterRef, messageTask.createdAt, 'TaskMessageRef should not bump task updatedAt from creation recency')
    assert.equal(legacyNotes(messageTask).filter(note => note.text === 'Linked message: durable assignment with retry').length, 0, 'task-bound send should not copy full body into a visible linked note')
    assert.equal(legacyNotes(messageTask).length, 0, 'new task-bound send should append zero legacy task notes')
    let messageRefs = Object.values(modules.state.readTeamState(messageTeamName).taskMessageRefs)
    assert.equal(messageRefs.length, 1, 'task-bound send should append one TaskMessageRef')
    assert.equal(messageRefs[0].mailboxMessageId, workerMailboxMessages[0].id)
    assert.equal(messageRefs[0].summary, 'retry assignment')
    assert.equal(JSON.stringify(messageRefs[0]).includes('durable assignment with retry'), false, 'persisted TaskMessageRef should not copy full message body')
    assert.equal(legacyNotes(messageTask).length, 0, 'TaskMessageRef should not be latest substantive task note')
    const failedWorkerEffects = messageEffects.filter(effect => effect.kind === 'worker_delivery_requested')
    assert.equal(failedWorkerEffects.length, 1)
    assert.equal(failedWorkerEffects[0].idempotencyKey, ['send-worker-delivery', messageTeamName, 'worker-a', workerMailboxMessages[0].id, 'worker_delivery'].join(':'), 'message worker delivery idempotency key should preserve current recipient/message/policy shape')
    assert.equal(failedWorkerEffects[0].payload.options?.messageIds?.[0], workerMailboxMessages[0].id, 'message worker delivery payload should reference delivered mailbox id')
    assert.equal(failedWorkerEffects[0].payload.options?.requestedBy, 'team-lead')
    assert.equal(failedWorkerEffects[0].payload.options?.reason, 'assignment routes to worker delivery')
    assert.equal(failedWorkerEffects[0].payload.options?.wakeHint, 'hard')
    assert.equal(failedWorkerEffects[0].status, 'pending')
    assert.equal(failedWorkerEffects[0].attempts, 1)

    sendResult = await messageService.executeSendMessage({
      to: 'worker-a',
      type: 'assignment',
      message: 'durable assignment with retry',
      summary: 'retry assignment',
      taskId: 'T001',
    }, messageCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      requestWorkerDelivery: async () => {
        throw new Error('repeated send should not run pending delivery before retry backoff')
      },
    }))
    assert.deepEqual(sendResult.details.recipients, ['worker-a'], 'retry send should reuse done mailbox outbox effect as delivered')
    assert.equal(sendResult.details.warning, undefined)
    assert.equal(sendResult.details.wakeByRecipient[0].requestId, failedWorkerEffects[0].effectId, 'repeated command before retry eligibility should expose the pending outbox request id')
    assert.equal(modules.state.readMailbox(messageTeamName, 'worker-a').filter(item => item.text === 'durable assignment with retry').length, 1, 'retry should not duplicate mailbox message')
    messageEffects = modules.state.listOutboxEffects(messageTeamName)
    mailboxEffects = messageEffects.filter(effect => effect.kind === 'inbox_item_append_requested' && effect.payload?.message?.text === 'durable assignment with retry')
    assert.equal(mailboxEffects.length, 1, 'repeated task-bound send should reuse one durable mailbox effect')
    assert.equal(mailboxEffects[0].idempotencyKey.includes('durable assignment with retry'), false, 'repeated send should keep full body out of mailbox idempotency key')
    assert.equal(mailboxEffects[0].payload.message.text, 'durable assignment with retry', 'reused mailbox outbox payload should retain full message body')
    linkedTaskNoteEffects = messageEffects.filter(effect => effect.kind === 'task_note_append_requested')
    assert.equal(linkedTaskNoteEffects.length, 0, 'repeated task-bound send should still avoid communication-ref task-note effects')
    taskMessageRefEffects = messageEffects.filter(effect => effect.kind === 'task_message_ref_append_requested')
    assert.equal(taskMessageRefEffects.length, 1, 'repeated task-bound send should reuse one TaskMessageRef outbox effect')
    messageTask = modules.state.readTeamState(messageTeamName).tasks.T001
    assert.equal(messageTask.updatedAt, taskUpdatedAtAfterRef, 'repeated TaskMessageRef should not bump task recency')
    assert.equal(legacyNotes(messageTask).filter(note => note.text === 'Linked message: durable assignment with retry').length, 0, 'repeated task-bound send should not create visible linked task note')
    assert.equal(legacyNotes(messageTask).length, 0, 'repeated task-bound send should not create legacy task notes')
    messageRefs = Object.values(modules.state.readTeamState(messageTeamName).taskMessageRefs)
    assert.equal(messageRefs.length, 1, 'repeated task-bound send should not duplicate TaskMessageRef')
    assert.equal(legacyNotes(messageTask).length, 0, 'TaskMessageRef should remain excluded from latest substantive task note')
    const taskMessageRefRetry = await runOutboxOnceWithDeps({ teamName: messageTeamName, workerId: 'message-ref-rerun', effectIds: [taskMessageRefEffects[0].effectId], now: Date.now() + 5_000 }, {
      requestWorkerDelivery: noopDelivery(),
      requestLeaderAttentionIfNeeded: async () => ({ ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'unused', method: 'leader_attention_requested' }),
    })
    assert.equal(taskMessageRefRetry.claimed, 0, 'done TaskMessageRef effect should not rerun')
    assert.equal(Object.values(modules.state.readTeamState(messageTeamName).taskMessageRefs).length, 1, 'done TaskMessageRef effect rerun attempt should not duplicate ref')
    assert.throws(
      () => store.enqueueOutboxEffect({
        teamName: messageTeamName,
        kind: 'task_note_append_requested',
        idempotencyKey: 'manual-legacy-linked-note-after-send',
        payload: {
          teamName: messageTeamName,
          taskId: 'T001',
          author: 'team-lead',
          text: 'Linked message: legacy compatibility body should not be visible',
          details: { linkedMessageId: 'legacy-mailbox-note-compat', messageType: 'assignment', threadId: 'task:T001' },
        },
        now: Date.now() + 6_000,
      }),
      /Unsupported outbox effect kind/,
      'new legacy task-note outbox effects should be rejected after no-notes cleanup',
    )
    messageTask = modules.state.readTeamState(messageTeamName).tasks.T001
    assert.equal(messageTask.updatedAt, taskUpdatedAtAfterRef, 'rejected legacy task-note effect should not bump task recency')
    assert.equal(legacyNotes(messageTask).length, 0, 'rejected legacy task-note effect should not append legacy task notes')
    assert.equal(Object.values(modules.state.readTeamState(messageTeamName).taskMessageRefs).length, 1, 'rejected legacy task-note effect should not duplicate TaskMessageRef')
    const retriedWorkerEffects = messageEffects.filter(effect => effect.kind === 'worker_delivery_requested')
    assert.equal(retriedWorkerEffects.length, 1, 'retry should reuse one worker delivery outbox effect')
    assert.equal(retriedWorkerEffects[0].status, 'pending', 'already requested delivery remains retryable for the outbox pump')
    assert.equal(retriedWorkerEffects[0].attempts, 1)
    const messageRetryRun = await runOutboxOnceWithDeps({ teamName: messageTeamName, workerId: 'message-retry', effectIds: [retriedWorkerEffects[0].effectId], now: Date.now() + 5_000 }, {
      requestWorkerDelivery: async (_team, memberName, _explicitTask, options) => ({
        ok: true,
        recipient: memberName,
        wakeHint: options?.wakeHint,
        reason: 'retried via outbox pump',
        method: 'bridge_requested',
        requestId: 'req-outbox-retry',
      }),
      requestLeaderAttentionIfNeeded: async () => ({ ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'unused', method: 'leader_attention_requested' }),
    })
    assert.equal(messageRetryRun.done, 1)
    assert.equal(store.getOutboxEffect(messageTeamName, retriedWorkerEffects[0].effectId).status, 'done')
    assert.equal(modules.state.readMailbox(messageTeamName, 'worker-a').filter(item => item.text === 'durable assignment with retry').length, 1, 'outbox pump retry should not duplicate mailbox message')

    const taskService = env.helpers.requireDist('tools/taskService.js')
    const taskApplication = env.helpers.requireDist('app/taskApplication.js')
    const taskTeamName = 'outbox-report-production-suite'
    const taskTeam = createOutboxSuiteTeam(modules, taskTeamName)
    modules.state.updateTeamState(taskTeamName, latest => {
      modules.state.createTask(latest, {
        title: 'report through outbox',
        description: 'validate durable report side effects',
        owner: 'worker-a',
      })
    })
    const workerCtx = env.helpers.createCtx(`/tmp/${taskTeamName}`, `/tmp/${taskTeamName}-worker-a.jsonl`, env.notifications)
    modules.state.writeSessionContext(`/tmp/${taskTeamName}-worker-a.jsonl`, { teamName: taskTeamName, memberName: 'worker-a' })
    let leaderAttentionCalls = 0
    const reportResult = await taskService.executeTaskAction({
      action: 'report_done',
      taskId: 'T001',
      note: 'report mailbox succeeds but attention fails once',
    }, workerCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      requestLeaderAttentionIfNeeded: async () => {
        leaderAttentionCalls += 1
        throw new Error('transient report attention failure')
      },
    }))
    assert.equal(reportResult.details.reportOnly, true)
    assert.equal(typeof taskApplication.executeTaskApplication, 'function', 'report task path should be backed by app task boundary')
    assert.equal(reportResult.details.warning, 'side_effect_failed')
    assert.equal(reportResult.details.leaderMailboxDelivered, true)
    assert.equal(reportResult.details.outboxEffectIds.length, 2, 'task report details should preserve both mailbox and leader attention outbox effect ids')
    assert.equal(reportResult.details.outboxEffects.length, 1, 'task report details.outboxEffects should describe the latest attempted outbox run')
    assert.equal(reportResult.details.outboxEffects[0].kind, 'leader_attention_requested', 'task report latest outboxEffects entry should describe failed leader attention')
    assert.equal(reportResult.details.outboxEffects[0].status, 'pending')
    assert.equal(reportResult.details.outboxRun.claimed, 1, 'task report details.outboxRun should reflect latest attempted side-effect run')
    assert.equal(reportResult.details.outboxRun.results[0].kind, 'leader_attention_requested', 'task report details.outboxRun should describe failed leader attention run')
    assert.equal(reportResult.details.sideEffectWarnings[0].kind, 'requestLeaderAttention', 'task report warning kind should map leader attention outbox effect')
    assert.equal(reportResult.details.sideEffectWarnings[0].outboxKind, 'leader_attention_requested')
    assert.equal(reportResult.details.sideEffectWarnings[0].outboxStatus, 'pending')
    assert.equal(leaderAttentionCalls, 1)
    const leaderReportMessages = modules.state.readMailbox(taskTeamName, 'team-lead').filter(item => item.type === 'report_done')
    assert.equal(leaderReportMessages.length, 1)
    assert.equal(leaderReportMessages[0].metadata?.reportId, 'TR0001', 'leader mailbox should reference TaskReport id')
    assert.equal(leaderReportMessages[0].text.includes('report mailbox succeeds but attention fails once'), false, 'leader mailbox should keep compact report notification text')
    const taskReportAfterMailbox = modules.state.readTeamState(taskTeamName).taskReports.TR0001
    assert.ok(taskReportAfterMailbox.text.includes('report mailbox succeeds but attention fails once'), 'TaskReport should retain full report body')
    assert.equal(taskReportAfterMailbox.mailboxMessageId, leaderReportMessages[0].id, 'TaskReport should back-reference delivered leader mailbox message id')
    let reportEffects = modules.state.listOutboxEffects(taskTeamName)
    const reportMailboxEffect = reportEffects.find(effect => effect.payload?.message?.metadata?.outboxSource === 'taskApplication')
    assert.ok(reportMailboxEffect, 'task report mailbox effect should be planned by app task boundary')
    assert.equal(reportMailboxEffect.idempotencyKey.includes('report mailbox succeeds but attention fails once'), false, 'task report mailbox outbox idempotency key should hash, not copy, the full report body')
    assert.ok(reportMailboxEffect.idempotencyKey.startsWith(`task-leader-mailbox:${taskTeamName}:report_done:T001:worker-a:team-lead:TR0001:`), 'task report mailbox idempotency key should preserve current report routing/type/reportId prefix')
    assert.equal(reportMailboxEffect.payload.message.id, 'mailbox-pending', 'task report mailbox outbox payload should retain current pending id before handler assigns deterministic id')
    assert.equal(leaderReportMessages[0].id, `mailbox-${reportMailboxEffect.effectId}`, 'delivered leader report mailbox id should match deterministic task outbox mailbox id')
    assert.equal(leaderReportMessages[0].metadata?.outboxEffectId, reportMailboxEffect.effectId, 'delivered task report mailbox should reference source outbox effect id')
    assert.equal(leaderReportMessages[0].metadata?.outboxMailboxId, `mailbox-${reportMailboxEffect.effectId}`, 'delivered task report mailbox should persist deterministic outbox mailbox id metadata')
    assert.equal(reportMailboxEffect.payload.message.metadata?.outboxSource, 'taskApplication', 'task report mailbox effect should preserve taskApplication outbox source metadata')
    assert.equal(reportMailboxEffect.payload.message.metadata?.reportId, 'TR0001', 'task report mailbox outbox payload should reference TaskReport id')
    assert.equal(reportMailboxEffect.payload.message.text.includes('report mailbox succeeds but attention fails once'), false, 'task report mailbox outbox payload should keep compact notification text')
    const attentionEffect = reportEffects.find(effect => effect.kind === 'leader_attention_requested')
    assert.ok(attentionEffect, 'report should enqueue leader attention outbox effect')
    assert.deepEqual(reportResult.details.outboxEffectIds, [reportMailboxEffect.effectId, attentionEffect.effectId], 'task report outboxEffectIds should preserve mailbox-before-attention planning order')
    assert.equal(reportResult.details.outboxEffects[0].effectId, attentionEffect.effectId, 'task report latest outboxEffects entry should match failed attention effect')
    assert.deepEqual(attentionEffect.dependsOn, [reportMailboxEffect.effectId], 'task report leader attention should depend on successful leader mailbox delivery')
    assert.equal(attentionEffect.idempotencyKey, ['task-leader-attention', taskTeamName, 'report_done', leaderReportMessages[0].id, 'T001'].join(':'), 'task report leader attention idempotency key should preserve current message/task shape')
    assert.equal(attentionEffect.payload.message.messageId, leaderReportMessages[0].id, 'task report leader attention should reference delivered leader mailbox id')
    assert.equal(attentionEffect.payload.message.taskId, 'T001')
    assert.equal(attentionEffect.payload.message.threadId, 'task:T001')
    assert.equal(attentionEffect.status, 'pending')
    assert.equal(attentionEffect.attempts, 1)
    assert.equal(reportEffects.filter(effect => effect.kind === 'task_note_append_requested').length, 0, 'task report should not enqueue linked task-note effect')
    assert.equal(legacyNotes(modules.state.readTeamState(taskTeamName).tasks.T001).filter(note => note.text.startsWith('Linked message:')).length, 0)

    const retryRun = await runOutboxOnceWithDeps({ teamName: taskTeamName, workerId: 'report-retry', effectIds: [attentionEffect.effectId], now: Date.now() + 5_000 }, {
      requestWorkerDelivery: noopDelivery(),
      requestLeaderAttentionIfNeeded: async (_team, message) => {
        leaderAttentionCalls += 1
        return {
          ok: true,
          recipient: 'team-lead',
          wakeHint: message.wakeHint,
          reason: 'retried report attention',
          method: 'leader_attention_requested',
        }
      },
    })
    assert.equal(retryRun.done, 1)
    reportEffects = modules.state.listOutboxEffects(taskTeamName)
    assert.equal(reportEffects.find(effect => effect.effectId === attentionEffect.effectId).status, 'done')
    const retriedReportMailboxEffects = reportEffects.filter(effect => effect.payload?.message?.metadata?.outboxSource === 'taskApplication')
    assert.equal(retriedReportMailboxEffects.length, 1, 'attention retry should reuse one durable leader mailbox effect')
    assert.equal(retriedReportMailboxEffects[0].idempotencyKey.includes('report mailbox succeeds but attention fails once'), false, 'report retry should keep full body out of mailbox idempotency key')
    assert.equal(retriedReportMailboxEffects[0].payload.message.metadata?.reportId, 'TR0001', 'reused report mailbox outbox payload should retain TaskReport reference')
    assert.equal(retriedReportMailboxEffects[0].payload.message.text.includes('report mailbox succeeds but attention fails once'), false, 'reused report mailbox outbox payload should stay compact')
    assert.equal(reportEffects.filter(effect => effect.kind === 'task_note_append_requested').length, 0, 'attention retry must not create linked task-note effect')
    assert.equal(modules.state.readMailbox(taskTeamName, 'team-lead').filter(item => item.type === 'report_done').length, 1, 'attention retry must not duplicate leader mailbox')
    assert.equal(legacyNotes(modules.state.readTeamState(taskTeamName).tasks.T001).filter(note => note.text.startsWith('Linked message:')).length, 0, 'attention retry must not create linked task note')
    assert.equal(leaderAttentionCalls, 2)

    modules.state.deleteTeamState(taskTeam.name)
    modules.state.deleteTeamState(maintenanceTeamName)
    modules.state.deleteTeamState(diagnosticsTeamName)
    modules.state.deleteTeamState(messageTeamName)
    modules.state.deleteTeamState(taskTeamName)
  },
}
