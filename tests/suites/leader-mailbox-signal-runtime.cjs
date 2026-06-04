const assert = require('node:assert/strict')

function nativeMessages(pi, start, customType) {
  return pi.__messages.slice(start).filter(message => message.customType === customType)
}

function assertNoNativeFullText(label, message, fullText) {
  assert.equal(String(message?.content ?? '').includes(fullText), false, `${label} content should not include full mailbox/report body`)
  assert.equal(message?.details?.text, undefined, `${label} details should not carry full text`)
  assert.equal(JSON.stringify(message?.details ?? {}).includes(fullText), false, `${label} details should not include full mailbox/report body`)
}

function createLeaderTeam(env, cleanup, name) {
  const sessionFile = `/tmp/${name}-leader.jsonl`
  const cwd = `/tmp/${name}-project`
  const ctx = env.helpers.createCtx(cwd, sessionFile, [])
  const team = env.modules.state.createInitialTeamState({
    teamName: name,
    leaderSessionFile: sessionFile,
    leaderCwd: cwd,
    description: 'leader mailbox signal characterization',
  })
  team.members['team-lead'].paneId = '%leader'
  team.members['team-lead'].windowTarget = 'test:@1'
  env.modules.state.writeTeamState(team)
  env.modules.state.writeSessionContext(sessionFile, {
    teamName: team.name,
    memberName: 'team-lead',
  })
  cleanup.push({ teamName: team.name, sessionFile })
  return { team, ctx }
}

module.exports = {
  name: 'leader mailbox signal runtime characterization',
  async run(env) {
    const { modules, pi, helpers } = env
    const cleanup = []
    const originalSendMessage = pi.sendMessage
    const signalHelpers = helpers.requireDist('runtime/leaderMailboxSignalRuntime.js')

    try {
      modules.leaderAttention.resetLeaderAttentionThrottle()

      const helperFullText = 'UNIQUE-HELPER-FULL-TEXT must stay out of compact projection helper output'
      const helperItem = {
        id: 'helper-message',
        teamName: 'leader-signal-helper-suite',
        from: 'helper-worker',
        text: helperFullText,
        summary: 'helper compact summary',
        type: 'question',
        taskId: 'T123',
        threadId: 'task:T123',
        requestId: 'helper-request-generation',
        replyTo: 'prior-message',
        priority: 'high',
        wakeHint: 'soft',
        createdAt: 1700000000000,
      }
      const helperGeneration = signalHelpers.leaderMailboxSignalGeneration(helperItem)
      const helperKey = signalHelpers.leaderMailboxSignalKey(helperItem.teamName, helperItem.id, helperGeneration)
      assert.equal(helperGeneration, 'helper-request-generation', 'leader mailbox signal generation should prefer requestId')
      assert.equal(signalHelpers.leaderMailboxSignalGeneration({ createdAt: 1700000000002 }), 1700000000002, 'leader mailbox signal generation should fall back to createdAt')
      assert.equal(helperKey, 'leader-signal-helper-suite:helper-message:helper-request-generation', 'leader mailbox signal key should preserve team:message:generation shape')
      assert.equal(signalHelpers.compactLeaderMailboxProjectionContent(helperItem), [
        'AgentTeam leader mailbox notification.',
        'id=helper-message type=question from=helper-worker task=T123 thread=task:T123 summary=helper compact summary priority=high wakeHint=soft',
        'Full directed body/report notification is in the persistent mailbox. Call agentteam_receive({ markRead: true }) for full details; use agentteam_task show/history/reports/report for referenced task artifacts.',
      ].join('\n'), 'compact projection content helper should preserve exact native projection wording')
      assert.deepEqual(signalHelpers.compactLeaderMailboxProjectionDetails(helperItem, helperKey, helperGeneration), {
        id: 'helper-message',
        teamName: 'leader-signal-helper-suite',
        from: 'helper-worker',
        summary: 'helper compact summary',
        type: 'question',
        taskId: 'T123',
        threadId: 'task:T123',
        requestId: 'helper-request-generation',
        replyTo: 'prior-message',
        priority: 'high',
        wakeHint: 'soft',
        createdAt: 1700000000000,
        projectionKey: helperKey,
        generation: helperGeneration,
        bridgeOnly: true,
        compact: true,
      }, 'compact projection details helper should preserve exact native metadata shape')
      assert.equal(signalHelpers.compactLeaderMailboxProjectionContent(helperItem).includes(helperFullText), false, 'compact projection content helper should not include full text')
      assert.equal(JSON.stringify(signalHelpers.compactLeaderMailboxProjectionDetails(helperItem, helperKey, helperGeneration)).includes(helperFullText), false, 'compact projection details helper should not include full text')
      assert.deepEqual(signalHelpers.leaderMailboxSignalItemFromMailboxMessage('leader-signal-helper-suite', {
        ...helperItem,
        to: 'team-lead',
        type: 'question',
        priority: undefined,
        wakeHint: undefined,
      }), {
        ...helperItem,
        type: 'question',
        priority: 'normal',
        wakeHint: 'soft',
      }, 'signal item adapter should default question-to-leader wake metadata and normalize missing priority')
      assert.deepEqual(signalHelpers.leaderMailboxSignalItemFromMailboxMessage('leader-signal-helper-suite', {
        ...helperItem,
        to: 'team-lead',
        type: 'report_done',
        priority: 'high',
        wakeHint: undefined,
      }), {
        ...helperItem,
        type: 'report_done',
        priority: 'high',
        wakeHint: 'hard',
      }, 'signal item adapter should default report_done to hard leader attention')
      assert.deepEqual(signalHelpers.leaderMailboxSignalItemFromMailboxMessage('leader-signal-helper-suite', {
        ...helperItem,
        to: 'team-lead',
        type: 'report_blocked',
        wakeHint: 'none',
      }).wakeHint, 'none', 'signal item adapter should preserve explicit wakeHint over policy default')
      assert.deepEqual(signalHelpers.leaderMailboxSignalItemFromMailboxMessage('leader-signal-helper-suite', {
        ...helperItem,
        to: 'team-lead',
        type: 'inform',
        priority: 'high',
        wakeHint: undefined,
      }).wakeHint, 'none', 'signal item adapter should default inform to no leader wake')
      const unknownAdapted = signalHelpers.leaderMailboxSignalItemFromMailboxMessage('leader-signal-helper-suite', {
        ...helperItem,
        to: 'team-lead',
        type: 'unknown-persisted-type',
        requestId: 'unknown-request',
        replyTo: 'reply-message',
        taskId: 'T999',
        threadId: 'thread:T999',
        summary: 'unknown compact summary',
        priority: 'high',
        wakeHint: undefined,
        createdAt: 1700000000999,
      })
      assert.deepEqual(unknownAdapted, {
        ...helperItem,
        requestId: 'unknown-request',
        replyTo: 'reply-message',
        taskId: 'T999',
        threadId: 'thread:T999',
        summary: 'unknown compact summary',
        type: undefined,
        priority: 'high',
        wakeHint: 'none',
        createdAt: 1700000000999,
      }, 'signal item adapter should preserve metadata but normalize unknown type to projection-only')

      const deliver = createLeaderTeam(env, cleanup, 'leader-signal-deliver-suite')
      const deliverFixtures = [
        {
          id: 'deliver-inform',
          from: 'worker-inform',
          to: 'team-lead',
          text: 'deliver inform full text',
          summary: 'deliver inform summary',
          type: 'inform',
          taskId: 'T001',
          threadId: 'task:T001',
          requestId: 'deliver-inform-request',
          replyTo: 'deliver-prior-message',
          priority: undefined,
          wakeHint: undefined,
          createdAt: 1700000001001,
        },
        {
          id: 'deliver-question',
          from: 'worker-question',
          to: 'team-lead',
          text: 'deliver question full text',
          summary: 'deliver question summary',
          type: 'question',
          priority: 'high',
          createdAt: 1700000001002,
        },
        {
          id: 'deliver-report-done',
          from: 'worker-done',
          to: 'team-lead',
          text: 'deliver report_done full text',
          summary: 'deliver report_done summary',
          type: 'report_done',
          priority: 'normal',
          createdAt: 1700000001003,
        },
        {
          id: 'deliver-report-blocked-none',
          from: 'worker-blocked',
          to: 'team-lead',
          text: 'deliver report_blocked explicit none full text',
          summary: 'deliver report_blocked summary',
          type: 'report_blocked',
          priority: 'high',
          wakeHint: 'none',
          createdAt: 1700000001004,
        },
        {
          id: 'deliver-missing-type',
          from: 'worker-missing-type',
          to: 'team-lead',
          text: 'deliver missing type full text',
          summary: 'deliver missing type summary',
          priority: undefined,
          createdAt: 1700000001005,
        },
      ]
      for (const fixture of deliverFixtures) {
        modules.state.pushMailboxMessage(deliver.team.name, 'team-lead', fixture)
      }
      const deliveredSignalItems = modules.runtime.deliverLeaderMailbox(deliver.ctx)
      assert.deepEqual(deliveredSignalItems, [
        {
          id: 'deliver-inform',
          teamName: deliver.team.name,
          from: 'worker-inform',
          text: 'deliver inform full text',
          summary: 'deliver inform summary',
          type: 'inform',
          taskId: 'T001',
          threadId: 'task:T001',
          requestId: 'deliver-inform-request',
          replyTo: 'deliver-prior-message',
          priority: 'normal',
          wakeHint: 'none',
          createdAt: 1700000001001,
        },
        {
          id: 'deliver-question',
          teamName: deliver.team.name,
          from: 'worker-question',
          text: 'deliver question full text',
          summary: 'deliver question summary',
          type: 'question',
          taskId: undefined,
          threadId: undefined,
          requestId: undefined,
          replyTo: undefined,
          priority: 'high',
          wakeHint: 'soft',
          createdAt: 1700000001002,
        },
        {
          id: 'deliver-report-done',
          teamName: deliver.team.name,
          from: 'worker-done',
          text: 'deliver report_done full text',
          summary: 'deliver report_done summary',
          type: 'report_done',
          taskId: undefined,
          threadId: undefined,
          requestId: undefined,
          replyTo: undefined,
          priority: 'normal',
          wakeHint: 'hard',
          createdAt: 1700000001003,
        },
        {
          id: 'deliver-report-blocked-none',
          teamName: deliver.team.name,
          from: 'worker-blocked',
          text: 'deliver report_blocked explicit none full text',
          summary: 'deliver report_blocked summary',
          type: 'report_blocked',
          taskId: undefined,
          threadId: undefined,
          requestId: undefined,
          replyTo: undefined,
          priority: 'high',
          wakeHint: 'none',
          createdAt: 1700000001004,
        },
        {
          id: 'deliver-missing-type',
          teamName: deliver.team.name,
          from: 'worker-missing-type',
          text: 'deliver missing type full text',
          summary: 'deliver missing type summary',
          type: undefined,
          taskId: undefined,
          threadId: undefined,
          requestId: undefined,
          replyTo: undefined,
          priority: 'normal',
          wakeHint: 'none',
          createdAt: 1700000001005,
        },
      ], 'deliverLeaderMailbox should delegate per-message signal normalization while preserving ordering and metadata')
      const deliveredMailboxAfterAdapter = modules.state.readMailbox(deliver.team.name, 'team-lead')
      assert.equal(deliveredMailboxAfterAdapter.every(message => message.deliveredAt === undefined && message.readAt === undefined), true, 'deliverLeaderMailbox should not mark delivered/read')
      const noContextDeliverCtx = helpers.createCtx('/tmp/leader-signal-deliver-none-project', '/tmp/leader-signal-deliver-none.jsonl', [])
      assert.deepEqual(modules.runtime.deliverLeaderMailbox(noContextDeliverCtx), [], 'deliverLeaderMailbox should return [] outside attached context')
      const workerDeliverCtx = helpers.createCtx('/tmp/leader-signal-deliver-worker-project', '/tmp/leader-signal-deliver-worker.jsonl', [])
      modules.state.writeSessionContext('/tmp/leader-signal-deliver-worker.jsonl', { teamName: deliver.team.name, memberName: 'worker-not-leader' })
      cleanup.push({ teamName: null, sessionFile: '/tmp/leader-signal-deliver-worker.jsonl' })
      assert.deepEqual(modules.runtime.deliverLeaderMailbox(workerDeliverCtx), [], 'deliverLeaderMailbox should return [] outside attached team-lead context')

      assert.equal(typeof signalHelpers.createLeaderMailboxSignalRuntime, 'function', 'leader mailbox signal runtime should export a sync seam factory')
      const leaderProjectionServiceSource = helpers.readSource('runtime/leaderProjectionService.ts')
      const leaderProjectionService = helpers.requireDist('runtime/leaderProjectionService.js')
      assert.equal(typeof leaderProjectionService.createLeaderProjectionService, 'function', 'leader projection facade should preserve createLeaderProjectionService export')
      assert.ok(leaderProjectionServiceSource.includes('createLeaderMailboxSignalRuntime({ nativeSender: pi })'), 'leaderProjectionService should delegate signal sync to LeaderMailboxSignalRuntime')
      assert.ok(leaderProjectionServiceSource.includes('const unread = deps.deliverLeaderMailbox(ctx)'), 'leaderProjectionService should keep session/team gating through deliverLeaderMailbox dependency')
      assert.ok(leaderProjectionServiceSource.includes('signalRuntime.sync(unread)'), 'leaderProjectionService should delegate sync to signal runtime')
      assert.ok(leaderProjectionServiceSource.includes('signalRuntime.resetVolatileState()'), 'leaderProjectionService should delegate reset to signal runtime')
      for (const shellToken of [
        'watchFileDebounced',
        'ensureMailbox',
        'getMailboxPath',
        'getSessionFile',
        'TEAM_LEAD',
        'ctx.ui.notify',
        'LEADER_MAILBOX_WATCH_DEBOUNCE_MS = 150',
        'LEADER_MAILBOX_WATCH_RETRY_MS = 1_000',
      ]) {
        assert.ok(leaderProjectionServiceSource.includes(shellToken), `leaderProjectionService shell should retain watcher/facade token ${shellToken}`)
      }
      for (const migratedToken of [
        'claimLeaderProjection',
        'markLeaderProjectionProjected',
        'markLeaderProjectionFailed',
        'getLeaderProjection',
        'claimLeaderAttention',
        'markLeaderAttentionSent',
        'markLeaderAttentionFailed',
        'markLeaderAttentionSkipped',
        'getLeaderAttention',
        'sendLeaderAttentionMessage',
        'isLeaderAttentionMessageType',
      ]) {
        assert.equal(leaderProjectionServiceSource.includes(migratedToken), false, `leaderProjectionService should not directly own migrated signal orchestration token ${migratedToken}`)
      }
      const boundaryScriptSource = helpers.readSource('scripts/check-import-boundaries.cjs')
      for (const boundaryRel of [
        'runtime/leaderProjectionService.ts',
        'runtime/leaderMailboxSignalRuntime.ts',
        'adapters/runtime/session.ts',
        'teamPanel/layout.ts',
        'teamPanel/layoutLists.ts',
      ]) {
        assert.ok(boundaryScriptSource.includes(`rel: '${boundaryRel}'`), `boundary checker should include final v0.6.6 rule for ${boundaryRel}`)
      }
      assert.ok(boundaryScriptSource.includes('state/leaderProjectionStore.ts'), 'boundary checker should prevent direct leader projection store imports in facade')
      assert.ok(boundaryScriptSource.includes('state/leaderAttentionStore.ts'), 'boundary checker should prevent direct leader attention store imports in facade')
      assert.ok(boundaryScriptSource.includes('signalRuntime.sync'), 'boundary checker should require signalRuntime sync delegation in facade')
      assert.ok(boundaryScriptSource.includes('signalRuntime.resetVolatileState'), 'boundary checker should require signalRuntime reset delegation in facade')
      assert.ok(boundaryScriptSource.includes('leaderMailboxSignalItemFromMailboxMessage'), 'boundary checker should guard shared mailbox-signal item adaptation')
      assert.ok(boundaryScriptSource.includes('peekUnreadMailbox'), 'boundary checker should guard read-mostly mailbox peeking')
      assert.ok(boundaryScriptSource.includes('selectedMailbox.text'), 'boundary checker should guard selected mailbox full-text panel rendering')
      assert.ok(boundaryScriptSource.includes('item.message.text'), 'boundary checker should guard mailbox list full-text fallback rendering')
      assert.ok(boundaryScriptSource.includes('agentteam_receive({ markRead: true })'), 'boundary checker should require explicit receive read-boundary instructions')
      const signalRuntimeSource = helpers.readSource('runtime/leaderMailboxSignalRuntime.ts')
      assert.ok(signalRuntimeSource.includes('../state/leaderProjectionStore.js'), 'leader mailbox signal runtime should own default leader projection store orchestration')
      assert.ok(signalRuntimeSource.includes('../state/leaderAttentionStore.js'), 'leader mailbox signal runtime should own default leader attention store orchestration')
      assert.ok(signalRuntimeSource.includes('./leaderAttention.js'), 'leader mailbox signal runtime should own bounded leader attention delegation')
      assert.ok(signalRuntimeSource.includes('leaderMailboxSignalItemFromMailboxMessage'), 'leader mailbox signal runtime should centralize mailbox-message-to-signal-item adaptation')
      assert.ok(signalRuntimeSource.includes('compactLeaderMailboxProjectionContent'), 'leader mailbox signal runtime should keep compact projection content helper')
      assert.ok(signalRuntimeSource.includes('compactLeaderMailboxProjectionDetails'), 'leader mailbox signal runtime should keep compact projection details helper')
      assert.ok(signalRuntimeSource.includes("customType: 'agentteam-mailbox'"), 'leader mailbox signal runtime should preserve native projection custom type')
      assert.ok(signalRuntimeSource.includes('triggerTurn: false'), 'leader mailbox signal runtime should preserve non-waking native projection')
      assert.ok(signalRuntimeSource.includes('Full directed body/report notification is in the persistent mailbox'), 'leader mailbox signal runtime should preserve compact full-text boundary wording')
      for (const forbiddenSignalImport of ['../adapters/', '../tools/', '../commands/', '../teamPanel/', '../app/']) {
        assert.equal(signalRuntimeSource.includes(forbiddenSignalImport), false, `leader mailbox signal runtime should not import ${forbiddenSignalImport}`)
      }
      for (const forbiddenSignalToken of ['peekUnreadMailbox', 'markMailboxMessages', 'deliveredAt', 'readAt']) {
        assert.equal(signalRuntimeSource.includes(forbiddenSignalToken), false, `leader mailbox signal runtime should not own mailbox read/delivery lifecycle token ${forbiddenSignalToken}`)
      }
      const sessionAdapterSource = helpers.readSource('adapters/runtime/session.ts')
      assert.ok(sessionAdapterSource.includes('leaderMailboxSignalItemFromMailboxMessage'), 'session adapter should delegate signal item normalization to LeaderMailboxSignalRuntime')
      assert.ok(sessionAdapterSource.includes('peekUnreadMailbox'), 'session adapter should peek unread mailbox without marking lifecycle state')
      assert.ok(sessionAdapterSource.includes('deliverLeaderMailbox'), 'session adapter should keep deliverLeaderMailbox context/session adapter facade')
      for (const forbiddenSessionToken of [
        'decideMessagePolicy',
        'parsePersistedMessageType',
        'normalizePriority',
        'markMailboxMessages',
        'deliveredAt',
        'readAt',
        'claimLeaderProjection',
        'claimLeaderAttention',
        'sendLeaderAttentionMessage',
      ]) {
        assert.equal(sessionAdapterSource.includes(forbiddenSessionToken), false, `session adapter should not inline signal policy/orchestration/lifecycle token ${forbiddenSessionToken}`)
      }

      const seamEvents = []
      const projectionStates = new Map()
      const attentionStates = new Map()
      const keyFor = (teamName, messageId, generation) => signalHelpers.leaderMailboxSignalKey(teamName, messageId, generation)
      const projectionStore = {
        claimLeaderProjection(teamName, messageId, generation) {
          const projectionKey = keyFor(teamName, messageId, generation)
          const existing = projectionStates.get(projectionKey)
          if (existing?.status === 'projected') return null
          seamEvents.push(`projection:claim:${projectionKey}`)
          const next = existing ?? { projectionKey, teamName, messageId, generation: String(generation), attempts: 0 }
          next.status = 'projecting'
          projectionStates.set(projectionKey, next)
          return next
        },
        getLeaderProjection(teamName, messageId, generation) {
          return projectionStates.get(keyFor(teamName, messageId, generation)) ?? null
        },
        markLeaderProjectionProjected(teamName, projectionKey) {
          seamEvents.push(`projection:projected:${projectionKey}`)
          const next = projectionStates.get(projectionKey)
          next.status = 'projected'
          return next
        },
        markLeaderProjectionFailed(teamName, projectionKey, error) {
          seamEvents.push(`projection:failed:${projectionKey}:${error}`)
          const next = projectionStates.get(projectionKey)
          next.status = 'failed'
          next.lastError = error
          return next
        },
      }
      const attentionStore = {
        claimLeaderAttention(teamName, messageId, generation) {
          const attentionKey = keyFor(teamName, messageId, generation)
          const existing = attentionStates.get(attentionKey)
          if (existing?.status === 'sent' || existing?.status === 'skipped') return null
          seamEvents.push(`attention:claim:${attentionKey}`)
          const next = existing ?? { attentionKey, teamName, messageId, generation: String(generation), attempts: 0 }
          next.status = 'sending'
          attentionStates.set(attentionKey, next)
          return next
        },
        getLeaderAttention(teamName, messageId, generation) {
          return attentionStates.get(keyFor(teamName, messageId, generation)) ?? null
        },
        markLeaderAttentionSent(teamName, attentionKey) {
          seamEvents.push(`attention:sent:${attentionKey}`)
          const next = attentionStates.get(attentionKey)
          next.status = 'sent'
          return next
        },
        markLeaderAttentionFailed(teamName, attentionKey, error) {
          seamEvents.push(`attention:failed:${attentionKey}:${error}`)
          const next = attentionStates.get(attentionKey)
          next.status = 'failed'
          next.lastError = error
          return next
        },
        markLeaderAttentionSkipped(teamName, attentionKey, reason) {
          seamEvents.push(`attention:skipped:${attentionKey}:${reason}`)
          const next = attentionStates.get(attentionKey)
          next.status = 'skipped'
          next.lastError = reason
          return next
        },
      }
      const nativeProjectionMessages = []
      const failProjectionIds = new Set()
      const nativeSender = {
        sendMessage(message, options) {
          seamEvents.push(`native:${message.customType}:${message.details.id}`)
          if (message.customType === 'agentteam-mailbox' && failProjectionIds.delete(message.details.id)) {
            throw new Error('direct seam projection failed once')
          }
          nativeProjectionMessages.push({ message, options })
        },
      }
      const attentionFailures = new Set()
      const attention = {
        isLeaderAttentionMessageType(type) {
          seamEvents.push(`attention:type:${type}`)
          return type === 'question' || type === 'report_done' || type === 'report_blocked'
        },
        sendLeaderAttentionMessage(item) {
          seamEvents.push(`attention:send:${item.id}`)
          if (attentionFailures.delete(item.id)) {
            return { ok: false, reason: 'leader attention sendMessage failed', error: 'direct seam attention failed once' }
          }
          if (item.wakeHint === 'none') return { ok: false, reason: 'wake hint does not require wake' }
          return { ok: true, reason: `leader attention requested ${item.type}` }
        },
        resetLeaderAttentionThrottle() {
          seamEvents.push('attention:reset')
        },
      }
      const seamRuntime = signalHelpers.createLeaderMailboxSignalRuntime({
        nativeSender,
        projectionStore,
        attentionStore,
        attention,
      })
      seamEvents.length = 0
      assert.deepEqual(seamRuntime.sync([helperItem]), { projectedCount: 1, attentionCount: 1 }, 'LeaderMailboxSignalRuntime.sync should report projection and attention counts')
      assert.deepEqual(seamEvents, [
        `projection:claim:${helperKey}`,
        'native:agentteam-mailbox:helper-message',
        `projection:projected:${helperKey}`,
        'attention:type:question',
        `attention:claim:${helperKey}`,
        'attention:send:helper-message',
        `attention:sent:${helperKey}`,
      ], 'direct signal runtime sync should project before attention and mark durable state in order')
      assert.equal(nativeProjectionMessages[0].options.triggerTurn, false, 'direct signal runtime projection should preserve triggerTurn=false')
      assert.equal(nativeProjectionMessages[0].message.content.includes(helperFullText), false, 'direct signal runtime projection should not include full text')
      seamEvents.length = 0
      assert.deepEqual(seamRuntime.sync([helperItem]), { projectedCount: 0, attentionCount: 0 }, 'LeaderMailboxSignalRuntime.sync should not repeat sent/projected generation')
      assert.equal(nativeProjectionMessages.filter(item => item.message.customType === 'agentteam-mailbox' && item.message.details.id === helperItem.id).length, 1, 'direct signal runtime should not duplicate native projection for same runtime generation')
      seamEvents.length = 0
      seamRuntime.resetVolatileState()
      assert.deepEqual(seamEvents, ['attention:reset'], 'LeaderMailboxSignalRuntime.resetVolatileState should clear volatile cache and delegate throttle reset')
      seamEvents.length = 0
      assert.deepEqual(seamRuntime.sync([helperItem]), { projectedCount: 0, attentionCount: 0 }, 'durable projected/sent state should prevent repeats after volatile reset')
      assert.equal(nativeProjectionMessages.filter(item => item.message.customType === 'agentteam-mailbox' && item.message.details.id === helperItem.id).length, 1, 'direct signal runtime should not duplicate native projection after reset')

      const projectionRetryItem = { ...helperItem, id: 'helper-projection-retry', requestId: 'helper-projection-retry-generation', text: 'projection retry direct seam full text' }
      const projectionRetryKey = keyFor(projectionRetryItem.teamName, projectionRetryItem.id, projectionRetryItem.requestId)
      failProjectionIds.add(projectionRetryItem.id)
      seamEvents.length = 0
      assert.deepEqual(seamRuntime.sync([projectionRetryItem]), { projectedCount: 0, attentionCount: 0 }, 'failed projection should not count or request attention')
      assert.equal(attentionStates.get(projectionRetryKey), undefined, 'failed projection should not create attention state')
      assert.equal(projectionStates.get(projectionRetryKey).status, 'failed', 'failed projection should remain retryable in durable state')
      assert.deepEqual(seamRuntime.sync([projectionRetryItem]), { projectedCount: 1, attentionCount: 1 }, 'subsequent sync should retry failed projection and then attention')
      assert.equal(projectionStates.get(projectionRetryKey).status, 'projected')
      assert.equal(attentionStates.get(projectionRetryKey).status, 'sent')

      const attentionRetryItem = { ...helperItem, id: 'helper-attention-retry', requestId: 'helper-attention-retry-generation', text: 'attention retry direct seam full text' }
      const attentionRetryKey = keyFor(attentionRetryItem.teamName, attentionRetryItem.id, attentionRetryItem.requestId)
      attentionFailures.add(attentionRetryItem.id)
      const mailboxProjectionCountBeforeAttentionFailure = nativeProjectionMessages.filter(item => item.message.customType === 'agentteam-mailbox').length
      assert.deepEqual(seamRuntime.sync([attentionRetryItem]), { projectedCount: 1, attentionCount: 0 }, 'attention send failure should not count attention')
      assert.equal(projectionStates.get(attentionRetryKey).status, 'projected', 'attention failure should not make projection retryable')
      assert.equal(attentionStates.get(attentionRetryKey).status, 'failed', 'attention send failure should remain retryable')
      assert.deepEqual(seamRuntime.sync([attentionRetryItem]), { projectedCount: 0, attentionCount: 1 }, 'attention retry should not duplicate projection')
      assert.equal(nativeProjectionMessages.filter(item => item.message.customType === 'agentteam-mailbox').length, mailboxProjectionCountBeforeAttentionFailure + 1, 'attention retry should not emit another mailbox projection')
      assert.equal(attentionStates.get(attentionRetryKey).status, 'sent')

      const shape = createLeaderTeam(env, cleanup, 'leader-signal-shape-suite')
      const shapeRuntime = modules.runtimeService.createRuntimeService(pi)
      const shapeStart = pi.__messages.length
      const shapeFullText = 'UNIQUE-SIGNAL-SHAPE-FULL-BODY should only be visible through agentteam_receive full text boundary'
      const shapeMessage = modules.state.pushMailboxMessage(shape.team.name, 'team-lead', {
        from: 'planner-signal',
        to: 'team-lead',
        text: shapeFullText,
        summary: 'shape compact summary',
        type: 'question',
        taskId: 'T777',
        threadId: 'task:T777',
        requestId: 'shape-generation-request',
        priority: 'high',
        wakeHint: 'soft',
        createdAt: 1700000000001,
      })

      shapeRuntime.runMailboxSync(shape.ctx)
      const shapeEmitted = pi.__messages.slice(shapeStart)
      const shapeProjection = shapeEmitted.find(message => message.customType === 'agentteam-mailbox' && message.details.id === shapeMessage.id)
      const shapeAttention = shapeEmitted.find(message => message.customType === 'agentteam-leader-attention' && message.details.id === shapeMessage.id)
      assert.ok(shapeProjection, 'first mailbox sync should emit compact leader mailbox projection')
      assert.ok(shapeAttention, 'question-to-leader mailbox sync should emit bounded leader attention')
      assert.ok(shapeEmitted.indexOf(shapeProjection) < shapeEmitted.indexOf(shapeAttention), 'mailbox projection should be sent before bounded leader attention')

      assert.equal(shapeProjection.customType, 'agentteam-mailbox')
      assert.equal(shapeProjection.display, true)
      assert.equal(shapeProjection.options.triggerTurn, false)
      assert.equal(shapeProjection.options.deliverAs, undefined)
      assert.equal(shapeProjection.details.id, shapeMessage.id)
      assert.equal(shapeProjection.details.teamName, shape.team.name)
      assert.equal(shapeProjection.details.from, 'planner-signal')
      assert.equal(shapeProjection.details.summary, 'shape compact summary')
      assert.equal(shapeProjection.details.type, 'question')
      assert.equal(shapeProjection.details.taskId, 'T777')
      assert.equal(shapeProjection.details.threadId, 'task:T777')
      assert.equal(shapeProjection.details.requestId, 'shape-generation-request')
      assert.equal(shapeProjection.details.priority, 'high')
      assert.equal(shapeProjection.details.wakeHint, 'soft')
      assert.equal(shapeProjection.details.createdAt, shapeMessage.createdAt)
      assert.equal(shapeProjection.details.generation, 'shape-generation-request')
      assert.equal(shapeProjection.details.projectionKey, `${shape.team.name}:${shapeMessage.id}:shape-generation-request`)
      assert.equal(shapeProjection.details.bridgeOnly, true)
      assert.equal(shapeProjection.details.compact, true)
      assert.ok(String(shapeProjection.content).includes('shape compact summary'), 'mailbox projection content should include compact summary')
      assert.ok(String(shapeProjection.content).includes('Call agentteam_receive({ markRead: true })'), 'mailbox projection content should preserve receive read boundary instruction')
      assert.ok(String(shapeProjection.content).includes('agentteam_task show/history/reports/report'), 'mailbox projection content should point to task artifact read commands')
      assertNoNativeFullText('mailbox projection', shapeProjection, shapeFullText)

      assert.equal(shapeAttention.customType, 'agentteam-leader-attention')
      assert.equal(shapeAttention.display, true)
      assert.equal(shapeAttention.options.triggerTurn, true)
      assert.equal(shapeAttention.options.deliverAs, 'followUp')
      assert.equal(shapeAttention.details.id, shapeMessage.id)
      assert.equal(shapeAttention.details.teamName, shape.team.name)
      assert.equal(shapeAttention.details.from, 'planner-signal')
      assert.equal(shapeAttention.details.summary, 'shape compact summary')
      assert.equal(shapeAttention.details.type, 'question')
      assert.equal(shapeAttention.details.taskId, 'T777')
      assert.equal(shapeAttention.details.threadId, 'task:T777')
      assert.equal(shapeAttention.details.requestId, 'shape-generation-request')
      assert.equal(shapeAttention.details.priority, 'high')
      assert.equal(shapeAttention.details.wakeHint, 'soft')
      assert.equal(shapeAttention.details.createdAt, shapeMessage.createdAt)
      assert.equal(shapeAttention.details.bounded, true)
      assert.equal(shapeAttention.details.compact, true)
      assert.equal(shapeAttention.details.attentionReason, 'leader attention requested question')
      assert.equal(shapeAttention.details.triggerTurn, true)
      assert.ok(String(shapeAttention.content).includes('shape compact summary'), 'bounded attention content should include compact summary')
      assert.ok(String(shapeAttention.content).includes('Call agentteam_receive({ markRead: true })'), 'bounded attention content should preserve receive read boundary instruction')
      assert.ok(String(shapeAttention.content).includes('Do exactly one bounded attention turn'), 'bounded attention content should constrain the leader wake')
      assertNoNativeFullText('bounded attention', shapeAttention, shapeFullText)

      let storedShapeMailbox = modules.state.readMailbox(shape.team.name, 'team-lead').find(message => message.id === shapeMessage.id)
      assert.equal(storedShapeMailbox?.deliveredAt, undefined, 'projection/attention should not mark mailbox delivered')
      assert.equal(storedShapeMailbox?.readAt, undefined, 'projection/attention should not mark mailbox read')
      const shapeProjectionState = modules.state.getLeaderProjection(shape.team.name, shapeMessage.id, 'shape-generation-request')
      const shapeAttentionState = modules.state.getLeaderAttention(shape.team.name, shapeMessage.id, 'shape-generation-request')
      assert.equal(shapeProjectionState.projectionKey, `${shape.team.name}:${shapeMessage.id}:shape-generation-request`, 'projection durable key should stay team:message:generation')
      assert.equal(shapeProjectionState.status, 'projected')
      assert.equal(shapeAttentionState.attentionKey, `${shape.team.name}:${shapeMessage.id}:shape-generation-request`, 'attention durable key should stay team:message:generation')
      assert.equal(shapeAttentionState.status, 'sent')

      const receiveTool = pi.__tools.get('agentteam_receive')
      let receiveResult = await receiveTool.execute('leader-signal-receive-no-read', { markRead: false, limit: 1 }, null, () => {}, shape.ctx)
      assert.equal(receiveResult.details.messages[0].id, shapeMessage.id)
      assert.ok(receiveResult.content[0].text.includes(shapeFullText), 'agentteam_receive markRead=false should expose full text through explicit read boundary')
      assert.equal(receiveResult.details.messages[0].text, shapeFullText, 'agentteam_receive details should preserve full mailbox text')
      storedShapeMailbox = modules.state.readMailbox(shape.team.name, 'team-lead').find(message => message.id === shapeMessage.id)
      assert.ok(storedShapeMailbox?.deliveredAt, 'agentteam_receive markRead=false should mark returned message delivered')
      assert.equal(storedShapeMailbox?.readAt, undefined, 'agentteam_receive markRead=false should not mark returned message read')
      receiveResult = await receiveTool.execute('leader-signal-receive-read', { markRead: true, limit: 1 }, null, () => {}, shape.ctx)
      assert.equal(receiveResult.details.messages[0].id, shapeMessage.id, 'delivered-but-unread message should remain visible until markRead=true')
      assert.ok(receiveResult.content[0].text.includes(shapeFullText), 'agentteam_receive markRead=true should expose full text through explicit read boundary')
      storedShapeMailbox = modules.state.readMailbox(shape.team.name, 'team-lead').find(message => message.id === shapeMessage.id)
      assert.ok(storedShapeMailbox?.readAt, 'agentteam_receive markRead=true should mark returned message read')

      modules.leaderAttention.resetLeaderAttentionThrottle()
      const panel = createLeaderTeam(env, cleanup, 'leader-signal-panel-suite')
      const panelFullText = 'UNIQUE-TEAM-PANEL-FULL-TEXT-LEAK-CURRENT-BEHAVIOR-0123456789'
      const panelMessage = modules.state.pushMailboxMessage(panel.team.name, 'team-lead', {
        from: 'researcher-panel',
        to: 'team-lead',
        text: panelFullText,
        summary: 'panel compact summary',
        type: 'question',
        taskId: 'T900',
        threadId: 'task:T900',
        wakeHint: 'soft',
        createdAt: 1700000000100,
      })
      const panelData = modules.panelDataSource.loadPanelData(panel.team.name)
      const panelState = modules.viewModel.createInitialPanelState()
      panelState.focus = 'mailbox'
      panelState.selectedIndex = 0
      panelState.mailboxSelectedIndex = 0
      panelState.isDetailExpanded = true
      const panelSelection = modules.viewModel.buildPanelSelectionView(panelData, panelState)
      assert.equal(panelSelection.selectedMailbox?.id, panelMessage.id)
      const panelLayoutSource = helpers.readSource('teamPanel/layout.ts')
      const panelListSource = helpers.readSource('teamPanel/layoutLists.ts')
      assert.equal(panelLayoutSource.includes('selectedMailbox.text'), false, 'panel selected-mailbox detail should not render the mailbox full text field')
      assert.equal(panelLayoutSource.includes('message.text'), false, 'panel mailbox/cockpit details should not use mailbox full text as compact fallback')
      assert.equal(panelListSource.includes('item.message.text'), false, 'panel cockpit list should not use mailbox full text as compact fallback')
      assert.equal(panelListSource.includes('item.text'), false, 'panel mailbox list should not use mailbox full text as compact fallback')
      const panelLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 220, height: 60, data: panelData, state: panelState, selection: panelSelection })
      const panelOutput = panelLines.join('\n')
      assert.equal(panelOutput.includes(panelFullText), false, 'expanded /team selected-mailbox detail should not render exact mailbox full text')
      assert.ok(panelOutput.includes('panel compact summary'), 'expanded /team selected-mailbox detail should render compact summary')
      assert.ok(panelOutput.includes('Full text') && panelOutput.includes('agentteam_receive({ markRead: true })'), 'expanded /team selected-mailbox detail should point to explicit receive full-text boundary')
      assert.ok(panelOutput.includes(panelMessage.id) && panelOutput.includes('T900') && panelOutput.includes('task:T900'), 'expanded /team selected-mailbox detail should render compact routing fields')
      let storedPanelMessage = modules.state.readMailbox(panel.team.name, 'team-lead').find(message => message.id === panelMessage.id)
      assert.equal(storedPanelMessage?.deliveredAt, undefined, '/team panel data/render should not mark selected mailbox delivered')
      assert.equal(storedPanelMessage?.readAt, undefined, '/team panel data/render should not mark selected mailbox read')
      const panelReceiveResult = await receiveTool.execute('leader-signal-panel-receive-read-boundary', { markRead: true, limit: 1 }, null, () => {}, panel.ctx)
      assert.equal(panelReceiveResult.details.messages[0].id, panelMessage.id, 'agentteam_receive should return the same panel mailbox item')
      assert.ok(panelReceiveResult.content[0].text.includes(panelFullText), 'agentteam_receive should still expose full text for the same mailbox item')
      assert.equal(panelReceiveResult.details.messages[0].text, panelFullText, 'agentteam_receive details should still preserve full mailbox text')
      storedPanelMessage = modules.state.readMailbox(panel.team.name, 'team-lead').find(message => message.id === panelMessage.id)
      assert.ok(storedPanelMessage?.deliveredAt, 'agentteam_receive markRead=true should mark returned panel mailbox delivered')
      assert.ok(storedPanelMessage?.readAt, 'agentteam_receive markRead=true should mark returned panel mailbox read')

      modules.leaderAttention.resetLeaderAttentionThrottle()
      const policy = createLeaderTeam(env, cleanup, 'leader-signal-policy-suite')
      const policyRuntime = modules.runtimeService.createRuntimeService(pi)
      const policyStart = pi.__messages.length
      const informMessage = modules.state.pushMailboxMessage(policy.team.name, 'team-lead', {
        from: 'worker-inform',
        to: 'team-lead',
        text: 'inform full text should project compactly without bounded wake',
        summary: 'inform compact summary',
        type: 'inform',
        createdAt: 1700000000201,
      })
      const questionNoWakeMessage = modules.state.pushMailboxMessage(policy.team.name, 'team-lead', {
        from: 'worker-question-none',
        to: 'team-lead',
        text: 'question with wakeHint none should not wake leader',
        summary: 'question none compact summary',
        type: 'question',
        wakeHint: 'none',
        createdAt: 1700000000202,
      })
      policyRuntime.runMailboxSync(policy.ctx)
      const policyProjectionIds = nativeMessages(pi, policyStart, 'agentteam-mailbox').map(message => message.details.id)
      const policyAttentionIds = nativeMessages(pi, policyStart, 'agentteam-leader-attention').map(message => message.details.id)
      assert.deepEqual(policyProjectionIds, [informMessage.id, questionNoWakeMessage.id], 'inform and wakeHint=none question should still project compact mailbox notifications')
      assert.deepEqual(policyAttentionIds, [], 'inform and wakeHint=none question should not send bounded leader attention')
      const informProjection = nativeMessages(pi, policyStart, 'agentteam-mailbox').find(message => message.details.id === informMessage.id)
      assert.equal(informProjection.details.generation, informMessage.createdAt, 'messages without requestId should use createdAt as native generation')
      assert.equal(informProjection.details.projectionKey, `${policy.team.name}:${informMessage.id}:${informMessage.createdAt}`, 'createdAt generation should be reflected in durable projection key')
      assert.equal(modules.state.getLeaderAttention(policy.team.name, informMessage.id, informMessage.createdAt), null, 'inform should not create a leader attention durable record')
      const questionNoWakeAttention = modules.state.getLeaderAttention(policy.team.name, questionNoWakeMessage.id, questionNoWakeMessage.createdAt)
      assert.equal(questionNoWakeAttention.status, 'skipped', 'wakeHint=none eligible message should be durably marked skipped')
      assert.ok(questionNoWakeAttention.lastError.includes('wake hint does not require wake'))

      const syntheticRuntime = modules.leaderProjectionService.createLeaderProjectionService(pi, {
        attachCurrentSessionIfNeeded: () => ({ context: { teamName: policy.team.name, memberName: 'team-lead' }, source: 'cached' }),
        deliverLeaderMailbox: () => [
          {
            id: 'synthetic-unknown-type-message',
            teamName: policy.team.name,
            from: 'worker-unknown',
            text: 'unknown persisted type full text should not wake',
            summary: 'unknown type compact summary',
            type: 'unknown-persisted-type',
            requestId: 'unknown-type-generation',
            createdAt: 1700000000210,
          },
          {
            id: 'synthetic-missing-type-message',
            teamName: policy.team.name,
            from: 'worker-missing',
            text: 'missing type full text should not wake',
            summary: 'missing type compact summary',
            createdAt: 1700000000211,
          },
        ],
      })
      const syntheticStart = pi.__messages.length
      syntheticRuntime.runMailboxSync(policy.ctx)
      assert.deepEqual(nativeMessages(pi, syntheticStart, 'agentteam-mailbox').map(message => message.details.id), [
        'synthetic-unknown-type-message',
        'synthetic-missing-type-message',
      ], 'missing/unknown synthetic persisted types should still project compact mailbox notifications')
      assert.deepEqual(nativeMessages(pi, syntheticStart, 'agentteam-leader-attention').map(message => message.details.id), [], 'missing/unknown synthetic persisted types should not request bounded leader attention')
      assert.equal(modules.state.getLeaderAttention(policy.team.name, 'synthetic-unknown-type-message', 'unknown-type-generation'), null)
      assert.equal(modules.state.getLeaderAttention(policy.team.name, 'synthetic-missing-type-message', 1700000000211), null)

      for (const [type, teamName] of [['report_done', 'leader-signal-report-done-suite'], ['report_blocked', 'leader-signal-report-blocked-suite']]) {
        modules.leaderAttention.resetLeaderAttentionThrottle()
        const report = createLeaderTeam(env, cleanup, teamName)
        const reportRuntime = modules.runtimeService.createRuntimeService(pi)
        const reportStart = pi.__messages.length
        const reportMessage = modules.state.pushMailboxMessage(report.team.name, 'team-lead', {
          from: 'worker-report',
          to: 'team-lead',
          text: `${type} full report body should not be in native attention`,
          summary: `${type} compact summary`,
          type,
          wakeHint: 'hard',
          createdAt: type === 'report_done' ? 1700000000301 : 1700000000302,
        })
        reportRuntime.runMailboxSync(report.ctx)
        const reportProjection = nativeMessages(pi, reportStart, 'agentteam-mailbox').find(message => message.details.id === reportMessage.id)
        const reportAttention = nativeMessages(pi, reportStart, 'agentteam-leader-attention').find(message => message.details.id === reportMessage.id)
        assert.deepEqual(nativeMessages(pi, reportStart, 'agentteam-mailbox').map(message => message.details.id), [reportMessage.id], `${type} should project leader mailbox notification`)
        assert.deepEqual(nativeMessages(pi, reportStart, 'agentteam-leader-attention').map(message => message.details.id), [reportMessage.id], `${type} should request bounded leader attention`)
        assertNoNativeFullText(`${type} mailbox projection`, reportProjection, reportMessage.text)
        assertNoNativeFullText(`${type} bounded attention`, reportAttention, reportMessage.text)
        assert.equal(modules.state.getLeaderAttention(report.team.name, reportMessage.id, reportMessage.createdAt).status, 'sent')
      }

      modules.leaderAttention.resetLeaderAttentionThrottle()
      const throttle = createLeaderTeam(env, cleanup, 'leader-signal-throttle-suite')
      const throttleRuntime = modules.runtimeService.createRuntimeService(pi)
      const throttleStart = pi.__messages.length
      const firstThrottleMessage = modules.state.pushMailboxMessage(throttle.team.name, 'team-lead', {
        from: 'worker-throttle-a',
        to: 'team-lead',
        text: 'first throttle message',
        summary: 'first throttle compact summary',
        type: 'report_done',
        wakeHint: 'hard',
        requestId: 'throttle-generation-1',
        createdAt: 1700000000401,
      })
      const secondThrottleMessage = modules.state.pushMailboxMessage(throttle.team.name, 'team-lead', {
        from: 'worker-throttle-b',
        to: 'team-lead',
        text: 'second throttle message should be skipped after first attention',
        summary: 'second throttle compact summary',
        type: 'report_blocked',
        wakeHint: 'hard',
        requestId: 'throttle-generation-2',
        createdAt: 1700000000402,
      })
      throttleRuntime.runMailboxSync(throttle.ctx)
      assert.deepEqual(nativeMessages(pi, throttleStart, 'agentteam-mailbox').map(message => message.details.id), [firstThrottleMessage.id, secondThrottleMessage.id], 'throttled eligible messages should still project mailbox notifications')
      assert.deepEqual(nativeMessages(pi, throttleStart, 'agentteam-leader-attention').map(message => message.details.id), [firstThrottleMessage.id], 'team throttle should suppress second native attention in same team')
      assert.equal(modules.state.getLeaderAttention(throttle.team.name, firstThrottleMessage.id, 'throttle-generation-1').status, 'sent')
      const skippedThrottleAttention = modules.state.getLeaderAttention(throttle.team.name, secondThrottleMessage.id, 'throttle-generation-2')
      assert.equal(skippedThrottleAttention.status, 'skipped', 'throttled eligible attention should be durably marked skipped')
      assert.ok(skippedThrottleAttention.lastError.includes(`leader attention already requested recently for ${throttle.team.name}`), 'throttled attention should record compact skip reason')
      throttleRuntime.resetMailboxSyncKey()
      throttleRuntime.runMailboxSync(throttle.ctx)
      assert.deepEqual(nativeMessages(pi, throttleStart, 'agentteam-mailbox').map(message => message.details.id), [firstThrottleMessage.id, secondThrottleMessage.id], 'runtime reset should not duplicate durable projected messages')
      assert.deepEqual(nativeMessages(pi, throttleStart, 'agentteam-leader-attention').map(message => message.details.id), [firstThrottleMessage.id], 'runtime reset should not override durable sent/skipped attention states')
      const throttleReloadedRuntime = modules.runtimeService.createRuntimeService(pi)
      throttleReloadedRuntime.runMailboxSync(throttle.ctx)
      assert.deepEqual(nativeMessages(pi, throttleStart, 'agentteam-mailbox').map(message => message.details.id), [firstThrottleMessage.id, secondThrottleMessage.id], 'new runtime service should not duplicate durable projected messages')
      assert.deepEqual(nativeMessages(pi, throttleStart, 'agentteam-leader-attention').map(message => message.details.id), [firstThrottleMessage.id], 'new runtime service should not override durable sent/skipped attention states')

      const throttleOther = createLeaderTeam(env, cleanup, 'leader-signal-throttle-other-suite')
      const throttleOtherRuntime = modules.runtimeService.createRuntimeService(pi)
      const throttleOtherStart = pi.__messages.length
      const otherTeamMessage = modules.state.pushMailboxMessage(throttleOther.team.name, 'team-lead', {
        from: 'worker-other-team',
        to: 'team-lead',
        text: 'other team throttle should be independent',
        summary: 'other team compact summary',
        type: 'report_done',
        wakeHint: 'hard',
        createdAt: 1700000000410,
      })
      throttleOtherRuntime.runMailboxSync(throttleOther.ctx)
      assert.deepEqual(nativeMessages(pi, throttleOtherStart, 'agentteam-leader-attention').map(message => message.details.id), [otherTeamMessage.id], 'leader attention throttle should be team-scoped')

      modules.leaderAttention.resetLeaderAttentionThrottle()
      let attentionSendFailed = false
      pi.sendMessage = (message, options) => {
        if (message.customType === 'agentteam-leader-attention' && message.details.teamName === 'leader-signal-throttle-failure-suite' && !attentionSendFailed) {
          attentionSendFailed = true
          throw new Error('native attention failed before throttle commit')
        }
        return originalSendMessage(message, options)
      }
      const failedDirectAttention = modules.leaderAttention.sendLeaderAttentionMessage(pi, {
        id: 'direct-attention-failure',
        teamName: 'leader-signal-throttle-failure-suite',
        from: 'worker-direct',
        text: 'failed direct attention body',
        summary: 'failed direct attention compact summary',
        type: 'question',
        wakeHint: 'soft',
      })
      assert.equal(failedDirectAttention.ok, false, 'failed native attention send should fail the direct attention request')
      const directRetryStart = pi.__messages.length
      const directRetryAttention = modules.leaderAttention.sendLeaderAttentionMessage(pi, {
        id: 'direct-attention-retry',
        teamName: 'leader-signal-throttle-failure-suite',
        from: 'worker-direct',
        text: 'retry direct attention body',
        summary: 'retry direct attention compact summary',
        type: 'question',
        wakeHint: 'soft',
      })
      assert.equal(directRetryAttention.ok, true, 'leader attention throttle should commit only after successful native send')
      assert.deepEqual(nativeMessages(pi, directRetryStart, 'agentteam-leader-attention').map(message => message.details.id), ['direct-attention-retry'])
      pi.sendMessage = originalSendMessage

      modules.leaderAttention.resetLeaderAttentionThrottle()
      const projectionFailure = createLeaderTeam(env, cleanup, 'leader-signal-projection-failure-suite')
      const projectionFailureRuntime = modules.runtimeService.createRuntimeService(pi)
      const projectionFailureMessage = modules.state.pushMailboxMessage(projectionFailure.team.name, 'team-lead', {
        from: 'worker-projection-failure',
        to: 'team-lead',
        text: 'projection failure should retry without attention',
        summary: 'projection failure compact summary',
        type: 'report_blocked',
        wakeHint: 'hard',
        createdAt: 1700000000501,
      })
      const projectionFailureStart = pi.__messages.length
      let projectionThrows = true
      pi.sendMessage = (message, options) => {
        if (message.customType === 'agentteam-mailbox' && message.details.id === projectionFailureMessage.id && projectionThrows) {
          projectionThrows = false
          throw new Error('mailbox projection failed once')
        }
        return originalSendMessage(message, options)
      }
      projectionFailureRuntime.runMailboxSync(projectionFailure.ctx)
      assert.deepEqual(nativeMessages(pi, projectionFailureStart, 'agentteam-mailbox').map(message => message.details.id), [], 'failed projection should not emit native mailbox message')
      assert.deepEqual(nativeMessages(pi, projectionFailureStart, 'agentteam-leader-attention').map(message => message.details.id), [], 'failed projection should not request bounded attention')
      assert.equal(modules.state.getLeaderProjection(projectionFailure.team.name, projectionFailureMessage.id, projectionFailureMessage.createdAt).status, 'failed')
      assert.equal(modules.state.getLeaderAttention(projectionFailure.team.name, projectionFailureMessage.id, projectionFailureMessage.createdAt), null)
      projectionFailureRuntime.runMailboxSync(projectionFailure.ctx)
      assert.deepEqual(nativeMessages(pi, projectionFailureStart, 'agentteam-mailbox').map(message => message.details.id), [projectionFailureMessage.id], 'next sync should retry failed projection')
      assert.deepEqual(nativeMessages(pi, projectionFailureStart, 'agentteam-leader-attention').map(message => message.details.id), [projectionFailureMessage.id], 'successful projection retry should then request bounded attention')
      projectionFailureRuntime.runMailboxSync(projectionFailure.ctx)
      assert.deepEqual(nativeMessages(pi, projectionFailureStart, 'agentteam-mailbox').map(message => message.details.id), [projectionFailureMessage.id], 'projected retry should not duplicate mailbox projection')
      assert.deepEqual(nativeMessages(pi, projectionFailureStart, 'agentteam-leader-attention').map(message => message.details.id), [projectionFailureMessage.id], 'sent attention retry should not duplicate bounded attention')
      pi.sendMessage = originalSendMessage

      modules.leaderAttention.resetLeaderAttentionThrottle()
      const attentionFailure = createLeaderTeam(env, cleanup, 'leader-signal-attention-failure-suite')
      const attentionFailureRuntime = modules.runtimeService.createRuntimeService(pi)
      const attentionFailureMessage = modules.state.pushMailboxMessage(attentionFailure.team.name, 'team-lead', {
        from: 'worker-attention-failure',
        to: 'team-lead',
        text: 'attention failure should retry without duplicate projection',
        summary: 'attention failure compact summary',
        type: 'report_done',
        wakeHint: 'hard',
        createdAt: 1700000000601,
      })
      const attentionFailureStart = pi.__messages.length
      let attentionThrows = true
      pi.sendMessage = (message, options) => {
        if (message.customType === 'agentteam-leader-attention' && message.details.id === attentionFailureMessage.id && attentionThrows) {
          attentionThrows = false
          throw new Error('leader attention failed once')
        }
        return originalSendMessage(message, options)
      }
      attentionFailureRuntime.runMailboxSync(attentionFailure.ctx)
      assert.deepEqual(nativeMessages(pi, attentionFailureStart, 'agentteam-mailbox').map(message => message.details.id), [attentionFailureMessage.id], 'mailbox projection should complete before attention failure')
      assert.deepEqual(nativeMessages(pi, attentionFailureStart, 'agentteam-leader-attention').map(message => message.details.id), [], 'failed attention send should not emit native attention')
      assert.equal(modules.state.getLeaderProjection(attentionFailure.team.name, attentionFailureMessage.id, attentionFailureMessage.createdAt).status, 'projected')
      assert.equal(modules.state.getLeaderAttention(attentionFailure.team.name, attentionFailureMessage.id, attentionFailureMessage.createdAt).status, 'failed')
      let attentionFailureStored = modules.state.readMailbox(attentionFailure.team.name, 'team-lead').find(message => message.id === attentionFailureMessage.id)
      assert.equal(attentionFailureStored?.deliveredAt, undefined, 'attention failure should not mark mailbox delivered')
      assert.equal(attentionFailureStored?.readAt, undefined, 'attention failure should not mark mailbox read')
      pi.sendMessage = originalSendMessage
      attentionFailureRuntime.runMailboxSync(attentionFailure.ctx)
      assert.deepEqual(nativeMessages(pi, attentionFailureStart, 'agentteam-mailbox').map(message => message.details.id), [attentionFailureMessage.id], 'attention retry should not duplicate durable mailbox projection')
      assert.deepEqual(nativeMessages(pi, attentionFailureStart, 'agentteam-leader-attention').map(message => message.details.id), [attentionFailureMessage.id], 'attention retry should emit exactly one bounded attention')
      assert.equal(modules.state.getLeaderAttention(attentionFailure.team.name, attentionFailureMessage.id, attentionFailureMessage.createdAt).status, 'sent')
      attentionFailureRuntime.runMailboxSync(attentionFailure.ctx)
      assert.deepEqual(nativeMessages(pi, attentionFailureStart, 'agentteam-mailbox').map(message => message.details.id), [attentionFailureMessage.id], 'sent attention should keep projection idempotent')
      assert.deepEqual(nativeMessages(pi, attentionFailureStart, 'agentteam-leader-attention').map(message => message.details.id), [attentionFailureMessage.id], 'sent attention should not repeat for the same generation')
      attentionFailureStored = modules.state.readMailbox(attentionFailure.team.name, 'team-lead').find(message => message.id === attentionFailureMessage.id)
      assert.equal(attentionFailureStored?.deliveredAt, undefined, 'successful attention retry should still not mark mailbox delivered')
      assert.equal(attentionFailureStored?.readAt, undefined, 'successful attention retry should still not mark mailbox read')
    } finally {
      pi.sendMessage = originalSendMessage
      modules.leaderAttention.resetLeaderAttentionThrottle()
      for (const item of cleanup.reverse()) {
        modules.state.clearSessionContext(item.sessionFile)
        if (item.teamName) modules.state.deleteTeamState(item.teamName)
      }
    }
  },
}
