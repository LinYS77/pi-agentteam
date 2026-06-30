const assert = require('node:assert/strict')

module.exports = {
  name: 'service outbox effect runner',
  async run(env) {
    const sideEffectsTeam = env.modules.state.createInitialTeamState({
      teamName: 'side-effects-suite',
      leaderSessionFile: '/tmp/side-effects-leader.jsonl',
      leaderCwd: '/tmp/side-effects-project',
    })
    env.modules.state.upsertMember(sideEffectsTeam, {
      name: 'worker-x',
      role: 'researcher',
      cwd: '/tmp/side-effects-project',
      sessionFile: '/tmp/side-effects-worker-x.jsonl',
      status: 'idle',
    })
    const sideEffectsTask = env.modules.state.createTask(sideEffectsTeam, { title: 'side effects task', description: 'verify outbox effect runner ordering' })
    env.modules.state.writeTeamState(sideEffectsTeam)
    const effectRunner = env.helpers.requireDist('app/effectRunner.js')
    const outboxStore = env.helpers.requireDist('state/outboxStore.js')
    const runnerDeps = deps => env.patches.withOutboxHandlers(deps)
    const runOutboxOnceWithDeps = (input, deps) => effectRunner.runOutboxOnce(input, runnerDeps(deps))
    const effectOrder = []
    const refEffect = outboxStore.enqueueOutboxEffect({
      teamName: sideEffectsTeam.name,
      kind: 'task_message_ref_append_requested',
      idempotencyKey: 'side-effects:ref',
      payload: {
        teamName: sideEffectsTeam.name,
        taskId: sideEffectsTask.id,
        mailboxMessageId: 'mailbox-side-effects-ref',
        from: 'tester',
        to: 'team-lead',
        type: 'inform',
        threadId: `task:${sideEffectsTask.id}`,
        summary: 'compact mailbox ref',
      },
      now: 10,
    })
    const mailboxEffect = outboxStore.enqueueOutboxEffect({
      teamName: sideEffectsTeam.name,
      kind: 'inbox_item_append_requested',
      idempotencyKey: 'side-effects:mailbox',
      payload: {
        teamName: sideEffectsTeam.name,
        recipient: 'team-lead',
        message: { from: 'tester', to: 'team-lead', text: 'mail after ref', type: 'inform' },
      },
      dependsOn: [refEffect.effectId],
      now: 11,
    })
    const eventEffect = outboxStore.enqueueOutboxEffect({
      teamName: sideEffectsTeam.name,
      kind: 'append_event_requested',
      idempotencyKey: 'side-effects:event',
      payload: { teamName: sideEffectsTeam.name, event: { type: 'test_event', by: 'tester', text: 'event after mail' } },
      dependsOn: [mailboxEffect.effectId],
      now: 12,
    })
    const leaderEffect = outboxStore.enqueueOutboxEffect({
      teamName: sideEffectsTeam.name,
      kind: 'leader_attention_requested',
      idempotencyKey: 'side-effects:leader',
      payload: { teamName: sideEffectsTeam.name, message: { type: 'inform', wakeHint: 'hard', from: 'tester', text: 'project leader' } },
      dependsOn: [eventEffect.effectId],
      now: 13,
    })
    const workerEffect = outboxStore.enqueueOutboxEffect({
      teamName: sideEffectsTeam.name,
      kind: 'worker_delivery_requested',
      idempotencyKey: 'side-effects:worker',
      payload: {
        teamName: sideEffectsTeam.name,
        memberName: 'worker-x',
        explicitTask: 'do worker delivery',
        options: { requestedBy: 'tester', reason: 'side-effect test' },
      },
      dependsOn: [leaderEffect.effectId],
      now: 14,
    })
    const sideEffectResults = await runOutboxOnceWithDeps({ teamName: sideEffectsTeam.name, workerId: 'side-effects-runner', limit: 10, now: 20 }, {
      requestLeaderAttentionIfNeeded: async () => {
        effectOrder.push('leaderAttention')
        return { ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'projected', method: 'projection_requested' }
      },
      requestWorkerDelivery: async (_team, memberName, explicitTask) => {
        effectOrder.push(`workerDelivery:${memberName}:${explicitTask}`)
        return { ok: true, recipient: memberName, wakeHint: 'hard', reason: 'requested', method: 'bridge_requested', requestId: 'req-side-effect' }
      },
    })
    assert.equal(sideEffectResults.done, 1, 'first outbox pass should execute first dependency effect')
    const sideEffectRun2 = await runOutboxOnceWithDeps({ teamName: sideEffectsTeam.name, workerId: 'side-effects-runner', limit: 10, now: 21 }, {
      requestLeaderAttentionIfNeeded: async () => {
        effectOrder.push('leaderAttention')
        return { ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'projected', method: 'projection_requested' }
      },
      requestWorkerDelivery: async (_team, memberName, explicitTask) => {
        effectOrder.push(`workerDelivery:${memberName}:${explicitTask}`)
        return { ok: true, recipient: memberName, wakeHint: 'hard', reason: 'requested', method: 'bridge_requested', requestId: 'req-side-effect' }
      },
    })
    const sideEffectRun3 = await runOutboxOnceWithDeps({ teamName: sideEffectsTeam.name, workerId: 'side-effects-runner', limit: 10, now: 22 }, {
      requestLeaderAttentionIfNeeded: async () => {
        effectOrder.push('leaderAttention')
        return { ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'projected', method: 'projection_requested' }
      },
      requestWorkerDelivery: async (_team, memberName, explicitTask) => {
        effectOrder.push(`workerDelivery:${memberName}:${explicitTask}`)
        return { ok: true, recipient: memberName, wakeHint: 'hard', reason: 'requested', method: 'bridge_requested', requestId: 'req-side-effect' }
      },
    })
    const sideEffectRun4 = await runOutboxOnceWithDeps({ teamName: sideEffectsTeam.name, workerId: 'side-effects-runner', limit: 10, now: 23 }, {
      requestLeaderAttentionIfNeeded: async () => {
        effectOrder.push('leaderAttention')
        return { ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'projected', method: 'projection_requested' }
      },
      requestWorkerDelivery: async (_team, memberName, explicitTask) => {
        effectOrder.push(`workerDelivery:${memberName}:${explicitTask}`)
        return { ok: true, recipient: memberName, wakeHint: 'hard', reason: 'requested', method: 'bridge_requested', requestId: 'req-side-effect' }
      },
    })
    const sideEffectRun5 = await runOutboxOnceWithDeps({ teamName: sideEffectsTeam.name, workerId: 'side-effects-runner', limit: 10, now: 24 }, {
      requestLeaderAttentionIfNeeded: async () => {
        effectOrder.push('leaderAttention')
        return { ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'projected', method: 'projection_requested' }
      },
      requestWorkerDelivery: async (_team, memberName, explicitTask) => {
        effectOrder.push(`workerDelivery:${memberName}:${explicitTask}`)
        return { ok: true, recipient: memberName, wakeHint: 'hard', reason: 'requested', method: 'bridge_requested', requestId: 'req-side-effect' }
      },
    })
    assert.equal(sideEffectRun2.done + sideEffectRun3.done + sideEffectRun4.done + sideEffectRun5.done, 4, 'subsequent outbox passes should drain dependent effects')
    const refUpdatedAtBefore = env.modules.state.readTeamState(sideEffectsTeam.name).tasks[sideEffectsTask.id].updatedAt
    const diagnosticRefEffect = outboxStore.enqueueOutboxEffect({
      teamName: sideEffectsTeam.name,
      kind: 'task_message_ref_append_requested',
      idempotencyKey: 'side-effects:diagnostic-ref',
      payload: {
        teamName: sideEffectsTeam.name,
        taskId: sideEffectsTask.id,
        mailboxMessageId: 'mailbox-side-effects-diagnostic-ref',
        from: 'tester',
        to: 'team-lead',
        type: 'inform',
        threadId: `task:${sideEffectsTask.id}`,
        summary: 'diagnostic ref',
        diagnostic: true,
        metadata: { source: 'side_effects_suite' },
      },
      now: 25,
    })
    const diagnosticRefRun = await runOutboxOnceWithDeps({ teamName: sideEffectsTeam.name, workerId: 'side-effects-runner', limit: 10, effectIds: [diagnosticRefEffect.effectId], now: 26 }, {
      requestLeaderAttentionIfNeeded: async () => { throw new Error('unused') },
      requestWorkerDelivery: async () => { throw new Error('unused') },
    })
    assert.equal(diagnosticRefRun.done, 1, 'TaskMessageRef effect should execute')
    const sideEffectsStoredTeam = env.modules.state.readTeamState(sideEffectsTeam.name)
    assert.equal(sideEffectsStoredTeam.tasks[sideEffectsTask.id].updatedAt, refUpdatedAtBefore, 'TaskMessageRef effect should not bump task updatedAt')
    const sideEffectRefs = Object.values(sideEffectsStoredTeam.taskMessageRefs).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    assert.equal(sideEffectRefs[0].mailboxMessageId, 'mailbox-side-effects-ref', 'task_message_ref_append_requested should append compact message ref')
    assert.equal(sideEffectRefs[0].summary, 'compact mailbox ref')
    assert.equal(sideEffectRefs[1].mailboxMessageId, 'mailbox-side-effects-diagnostic-ref', 'diagnostic TaskMessageRef effect should append compact message ref')
    assert.equal(sideEffectRefs[1].diagnostic, true, 'diagnostic TaskMessageRef flag should be preserved')
    assert.equal(env.modules.state.readMailbox(sideEffectsTeam.name, 'team-lead')[0].text, 'mail after ref', 'inbox_item_append_requested should append mailbox message')
    assert.equal(sideEffectsStoredTeam.events[0].type, 'test_event', 'append_event_requested should persist event')
    assert.deepEqual(effectOrder, ['leaderAttention', 'workerDelivery:worker-x:do worker delivery'], 'async/request side effects should execute in dependency order')
    assert.throws(() => outboxStore.enqueueOutboxEffect({
      teamName: sideEffectsTeam.name,
      kind: 'task_note_append_requested',
      idempotencyKey: 'side-effects:unsupported-note',
      payload: { teamName: sideEffectsTeam.name, taskId: sideEffectsTask.id, author: 'tester', text: 'unsupported' },
      now: 29,
    }), /Unsupported outbox effect kind: task_note_append_requested/, 'new task_note_append_requested effects should be rejected')
    const missingRefEffect = outboxStore.enqueueOutboxEffect({
      teamName: sideEffectsTeam.name,
      kind: 'task_message_ref_append_requested',
      idempotencyKey: 'side-effects:missing-ref',
      payload: {
        teamName: sideEffectsTeam.name,
        taskId: 'T999',
        mailboxMessageId: 'mailbox-side-effects-missing-ref',
        from: 'tester',
        to: 'team-lead',
        type: 'inform',
      },
      now: 30,
    })
    const failingSideEffects = await runOutboxOnceWithDeps({ teamName: sideEffectsTeam.name, workerId: 'side-effects-failure', effectIds: [missingRefEffect.effectId], now: 31 }, {
      requestLeaderAttentionIfNeeded: async () => { throw new Error('unused') },
      requestWorkerDelivery: async () => { throw new Error('unused') },
    })
    assert.equal(failingSideEffects.failed, 1, 'effect runner should capture TaskMessageRef errors as retryable failures')
    assert.ok(failingSideEffects.results[0].error.includes('task not found'))
    assert.equal(outboxStore.getOutboxEffect(sideEffectsTeam.name, workerEffect.effectId).status, 'done')

  },
}
