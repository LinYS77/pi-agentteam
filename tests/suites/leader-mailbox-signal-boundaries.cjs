const assert = require('node:assert/strict')

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
  name: 'leader mailbox signal boundaries',
  async run(env) {
    const { modules, helpers } = env
    const cleanup = []
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

    } finally {
      for (const item of cleanup.reverse()) {
        if (item.teamName) modules.state.deleteTeamState(item.teamName)
        if (item.sessionFile) modules.state.clearSessionContext(item.sessionFile)
      }
    }
  },
}
