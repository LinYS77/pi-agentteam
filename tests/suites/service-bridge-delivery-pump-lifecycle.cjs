const assert = require('node:assert/strict')

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function countOccurrences(haystack, needle) {
  return String(haystack).split(needle).length - 1
}

module.exports = {
  name: 'service bridge delivery pump lifecycle',
  async run(env) {
    const bridgeTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-pump-suite',
      leaderSessionFile: '/tmp/bridge-pump-leader.jsonl',
      leaderCwd: '/tmp/bridge-pump-project',
      description: 'bridge pump test',
    })
    env.modules.state.upsertMember(bridgeTeam, {
      name: 'bridge-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-pump-project',
      sessionFile: '/tmp/bridge-pump-worker.jsonl',
      paneId: '%bridge-worker',
      windowTarget: 'test:@1',
      status: 'idle',
    })
    env.modules.state.upsertMember(bridgeTeam, {
      name: 'unrelated-worker',
      role: 'researcher',
      cwd: '/tmp/bridge-pump-project',
      sessionFile: '/tmp/unrelated-worker.jsonl',
      status: 'pending_delivery',
      bridgeWorkRequestedAt: 12345,
      bridgeWorkRequestMessageIds: ['unrelated-message'],
      bridgeWorkRequestBootPrompt: 'unrelated boot',
    })
    env.modules.state.upsertMember(bridgeTeam, {
      name: 'maintenance-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-pump-project',
      sessionFile: '/tmp/maintenance-worker.jsonl',
      paneId: '%maintenance-worker',
      windowTarget: 'test:@2',
      status: 'idle',
    })
    env.modules.state.writeTeamState(bridgeTeam)
    const bridgeHookOutbox = env.modules.state.enqueueOutboxEffect({
      teamName: bridgeTeam.name,
      kind: 'inbox_item_append_requested',
      idempotencyKey: 'bridge-session-hook-outbox',
      payload: {
        teamName: bridgeTeam.name,
        recipient: 'bridge-hook-worker',
        message: {
          from: 'team-lead',
          to: 'bridge-hook-worker',
          text: 'session hook should run outbox maintenance',
          type: 'inform',
          wakeHint: 'none',
        },
      },
    })
    const initialBridgeMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge worker please handle this',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [initialBridgeMessage.id] })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      sessionFile: '/tmp/bridge-pump-worker.jsonl',
    })

    const bridgeSends = []
    let bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { bridgeSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, true)
    assert.equal(bridgeSends.length, 1, 'bridge pump should submit one pi-native user message')
    assert.ok(bridgeSends[0].content.includes('bridge worker please handle this'))
    let bridgeMailbox = env.modules.state.readMailbox(bridgeTeam.name, 'bridge-worker')
    assert.equal(bridgeMailbox[0].deliveredAt, undefined, 'bridge submit should not mark message delivered before ack/start')
    assert.equal(bridgeMailbox[0].readAt, undefined, 'bridge submit should not mark message read')
    let bridgeDeliveryRequests = Object.values(env.modules.state.readDeliveryRequestStore(bridgeTeam.name).requests)
      .filter(request => request.memberName === 'bridge-worker')
    assert.equal(bridgeDeliveryRequests[0].status, 'submitted', 'bridge success should mark request submitted only')
    const bridgeWorkerAfterSuccess = env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker']
    assert.equal(bridgeWorkerAfterSuccess.bridgeAvailable, true, 'bridge success should publish bridge availability')
    assert.equal(bridgeWorkerAfterSuccess.bridgeVersion, env.modules.runtimeBridge.BRIDGE_VERSION, 'bridge success should publish bridge version')
    assert.ok(bridgeWorkerAfterSuccess.bridgeLastDeliveryAt, 'bridge success should record last native delivery time')

    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { bridgeSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(bridgePump.reason, 'no pending bridge delivery request')
    assert.equal(bridgeSends.length, 1, 'second bridge pump should not duplicate delivered message')
    assert.equal(
      env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker'].lastWakeReason,
      'bridge submitted prompt',
      'idempotent no-op pump should not churn member status',
    )

    const busyFollowupMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge busy followup',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [busyFollowupMessage.id] })
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      ctx: {
        isIdle: () => false,
        sendUserMessage: (content, options) => { bridgeSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(bridgePump.reason, 'native session busy for bridge delivery')
    assert.equal(bridgeSends.length, 1, 'busy bridge delivery should not submit followUp')
    env.modules.state.transitionDeliveryRequest(bridgeTeam.name, Object.values(env.modules.state.readDeliveryRequestStore(bridgeTeam.name).requests).find(request => request.memberName === 'bridge-worker' && request.status === 'pending').requestId, 'cancelled')

    const openFollowupMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge pending followup',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [openFollowupMessage.id] })
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      ctx: {
        isIdle: () => true,
        hasPendingMessages: () => true,
        sendUserMessage: (content, options) => { bridgeSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(bridgePump.reason, 'native session busy for bridge delivery')
    assert.equal(bridgeSends.length, 1, 'pending native messages should not submit followUp')
    env.modules.state.transitionDeliveryRequest(bridgeTeam.name, Object.values(env.modules.state.readDeliveryRequestStore(bridgeTeam.name).requests).find(request => request.memberName === 'bridge-worker' && request.status === 'pending').requestId, 'cancelled')

    const recoverClaimMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge recover expired claim',
      type: 'question',
    })
    const recoverClaimRequest = env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [recoverClaimMessage.id], now: 100_000 })
    const recoverClaimed = env.modules.state.claimDeliveryRequest(bridgeTeam.name, recoverClaimRequest.requestId, {
      bridgeId: 'stale-bridge',
      generation: 1,
      claimTtlMs: 100,
      now: 100_010,
      messageIds: [recoverClaimMessage.id],
      promptHash: 'stale-claim-hash',
    })
    assert.equal(recoverClaimed.status, 'claimed')
    const bridgeRecoverSends = []
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      now: 100_200,
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { bridgeRecoverSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, true, 'pump should recover expired claim and submit once')
    assert.equal(bridgeRecoverSends.length, 1)
    assert.ok(bridgeRecoverSends[0].content.includes('bridge recover expired claim'))
    assert.equal(env.modules.state.getDeliveryRequest(bridgeTeam.name, recoverClaimRequest.requestId).status, 'submitted')

    env.modules.state.upsertMember(bridgeTeam, {
      name: 'maintenance-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-pump-project',
      sessionFile: '/tmp/maintenance-worker.jsonl',
      paneId: '%maintenance-worker',
      windowTarget: 'test:@2',
      status: 'idle',
    })
    const unrelatedMirrorBeforeExpiredPending = env.modules.state.readTeamState(bridgeTeam.name).members['unrelated-worker']
    const expiredPendingMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'maintenance-worker', {
      from: 'team-lead',
      to: 'maintenance-worker',
      text: 'bridge expired pending should not send',
      type: 'question',
    })
    const expiredPendingRequest = env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'maintenance-worker', { messageIds: [expiredPendingMessage.id], now: 200_000 })
    const expiredOpenSends = []
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'maintenance-worker',
      sessionFile: '/tmp/maintenance-worker.jsonl',
      now: 200_000 + 5 * 60_000,
    })
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'maintenance-worker',
      now: 200_000 + 5 * 60_000 + 1,
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { expiredOpenSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(bridgePump.reason, 'no pending bridge delivery request')
    assert.equal(expiredOpenSends.length, 0, 'expired pending request should not submit prompt')
    assert.equal(env.modules.state.getDeliveryRequest(bridgeTeam.name, expiredPendingRequest.requestId).status, 'expired')
    assert.deepEqual(env.modules.state.readTeamState(bridgeTeam.name).members['unrelated-worker'], unrelatedMirrorBeforeExpiredPending, 'member-scoped maintenance should not clear unrelated member mirror/status')
    const bridgeWorkerAfterExpiredOpen = env.modules.state.readTeamState(bridgeTeam.name).members['maintenance-worker']
    assert.equal(bridgeWorkerAfterExpiredOpen.bridgeWorkRequestedAt, undefined, 'expired pending maintenance should clear bridge mirror')
    assert.equal(bridgeWorkerAfterExpiredOpen.bridgeWorkRequestMessageIds, undefined)

    const expiredClaimMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'maintenance-worker', {
      from: 'team-lead',
      to: 'maintenance-worker',
      text: 'bridge expired claimed should not send',
      type: 'question',
    })
    const expiredClaimRequest = env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'maintenance-worker', { messageIds: [expiredClaimMessage.id], now: 300_000 })
    env.modules.state.claimDeliveryRequest(bridgeTeam.name, expiredClaimRequest.requestId, {
      bridgeId: 'stale-bridge',
      generation: 1,
      claimTtlMs: 100,
      now: 300_010,
      messageIds: [expiredClaimMessage.id],
      promptHash: 'expired-claim-hash',
    })
    const expiredClaimSends = []
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'maintenance-worker',
      sessionFile: '/tmp/maintenance-worker.jsonl',
      now: 300_000 + 5 * 60_000,
    })
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'maintenance-worker',
      now: 300_000 + 5 * 60_000 + 1,
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { expiredClaimSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(expiredClaimSends.length, 0, 'expired claimed request should not submit prompt')
    assert.equal(env.modules.state.getDeliveryRequest(bridgeTeam.name, expiredClaimRequest.requestId).status, 'expired')
    assert.equal(env.modules.state.readTeamState(bridgeTeam.name).members['maintenance-worker'].bridgeWorkRequestedAt, undefined, 'expired claimed maintenance should clear bridge mirror')

    const submittedNoResendMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge submitted should not resend after ttl',
      type: 'question',
    })
    const submittedNoResendRequest = env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [submittedNoResendMessage.id], now: 400_000 })
    env.modules.state.claimDeliveryRequest(bridgeTeam.name, submittedNoResendRequest.requestId, {
      bridgeId: 'submitted-bridge',
      generation: 1,
      claimTtlMs: 1_000,
      now: 400_010,
      messageIds: [submittedNoResendMessage.id],
      promptHash: 'submitted-hash',
    })
    env.modules.state.transitionDeliveryRequest(bridgeTeam.name, submittedNoResendRequest.requestId, 'submitted', { now: 400_020 })
    const submittedNoResendSends = []
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      sessionFile: '/tmp/bridge-pump-worker.jsonl',
      now: 400_000 + 5 * 60_000,
    })
    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.updateMemberStatus(latest, 'bridge-worker', { status: 'queued', lastWakeReason: 'submitted request still queued' })
    })
    const submittedQueuedStatusAt = env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker'].updatedAt
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      now: Math.max(400_000 + 5 * 60_000 + 1, submittedQueuedStatusAt + 1),
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { submittedNoResendSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(submittedNoResendSends.length, 0, 'submitted request past TTL should not be resent')
    const submittedNoResendStored = env.modules.state.getDeliveryRequest(bridgeTeam.name, submittedNoResendRequest.requestId)
    assert.equal(submittedNoResendStored.status, 'submitted')
    assert.equal(env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker'].status, 'queued', 'submitted request maintenance must not recover queued worker to idle')
    env.modules.state.transitionDeliveryRequest(bridgeTeam.name, submittedNoResendRequest.requestId, 'cancelled', { now: Math.max(400_000 + 5 * 60_000 + 2, submittedQueuedStatusAt + 2) })
    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.updateMemberStatus(latest, 'bridge-worker', { status: 'idle', lastWakeReason: 'reset after submitted no-resend check' })
    })

    const startedNoResendMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge started should not resend after ttl',
      type: 'question',
    })
    const startedNoResendRequest = env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [startedNoResendMessage.id], now: 500_000 })
    env.modules.state.claimDeliveryRequest(bridgeTeam.name, startedNoResendRequest.requestId, {
      bridgeId: 'started-bridge',
      generation: 1,
      claimTtlMs: 1_000,
      now: 500_010,
      messageIds: [startedNoResendMessage.id],
      promptHash: 'started-hash',
    })
    env.modules.state.transitionDeliveryRequest(bridgeTeam.name, startedNoResendRequest.requestId, 'submitted', { now: 500_020 })
    env.modules.state.transitionDeliveryRequest(bridgeTeam.name, startedNoResendRequest.requestId, 'started', { now: 500_030 })
    const startedNoResendSends = []
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      sessionFile: '/tmp/bridge-pump-worker.jsonl',
      now: 500_000 + 5 * 60_000,
    })
    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.updateMemberStatus(latest, 'bridge-worker', { status: 'running', lastWakeReason: 'started request still running' })
    })
    const startedRunningStatusAt = env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker'].updatedAt
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      now: Math.max(500_000 + 5 * 60_000 + 1, startedRunningStatusAt + 1),
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { startedNoResendSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(startedNoResendSends.length, 0, 'started request past TTL should not be resent')
    assert.equal(env.modules.state.getDeliveryRequest(bridgeTeam.name, startedNoResendRequest.requestId).status, 'started')
    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.updateMemberStatus(latest, 'bridge-worker', { status: 'idle', lastWakeReason: 'reset after submitted/started no-resend checks' })
    })

    const alternateApiMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge sendMessage alternate API',
      type: 'question',
    })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      sessionFile: '/tmp/bridge-pump-worker.jsonl',
    })
    const bridgeCustomMessages = []
    const bridgeCustomNow = Date.now()
    env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [alternateApiMessage.id], now: bridgeCustomNow })
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      now: bridgeCustomNow,
      ctx: {
        isIdle: () => true,
        sendMessage: (message, options) => { bridgeCustomMessages.push({ message, options }) },
      },
    })
    assert.equal(bridgePump.ok, true)
    assert.equal(bridgeCustomMessages[0].message.customType, 'agentteam-bridge-delivery')
    assert.equal(bridgeCustomMessages[0].options.triggerTurn, true, 'sendMessage alternate API should trigger a turn')
    const sendMessageAlternateStored = env.modules.state.readMailbox(bridgeTeam.name, 'bridge-worker')
      .find(message => message.text.includes('bridge sendMessage alternate API'))
    assert.equal(sendMessageAlternateStored?.deliveredAt, undefined, 'sendMessage alternate API submit should not mark delivered')
    assert.equal(sendMessageAlternateStored?.readAt, undefined, 'sendMessage alternate API success should not mark read')

    const throwingBridgeMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge send throws remains undelivered',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [throwingBridgeMessage.id] })
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      ctx: {
        isIdle: () => true,
        sendUserMessage: () => { throw new Error('native send failed') },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(bridgePump.reason, 'bridge delivery failed')
    assert.equal(typeof env.helpers.requireDist('runtime/bridgeDeliveryPump.js').pumpBridgeOnce, 'function', 'focused bridgeDeliveryPump module should expose pumpBridgeOnce')
    bridgeMailbox = env.modules.state.readMailbox(bridgeTeam.name, 'bridge-worker')
    const failedBridgeMessage = bridgeMailbox.find(message => message.text.includes('bridge send throws'))
    assert.equal(failedBridgeMessage?.deliveredAt, undefined, 'failed bridge send should leave message undelivered')
    const bridgeWorkerAfterFailure = env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker']
    assert.equal(bridgeWorkerAfterFailure.bridgeAvailable, false, 'failed bridge should mark bridge unavailable for later policy-selected retry')
    assert.ok(String(bridgeWorkerAfterFailure.bridgeLastError || '').includes('native send failed'))
    assert.ok(String(bridgeWorkerAfterFailure.lastError || '').includes('native send failed'))
    env.modules.runtimeBridge.markBridgeStopped(bridgeTeam.name, 'bridge-worker')
    const bridgeWorkerAfterFailureStop = env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker']
    assert.ok(String(bridgeWorkerAfterFailureStop.bridgeLastError || '').includes('native send failed'), 'normal stop after failure should preserve bridgeLastError')
    assert.ok(String(bridgeWorkerAfterFailureStop.lastError || '').includes('native send failed'), 'normal stop after failure should preserve lastError')

    const promptTeam = env.modules.state.createInitialTeamState({
      teamName: 'prompt-consolidation-suite',
      leaderSessionFile: '/tmp/prompt-consolidation-leader.jsonl',
      leaderCwd: '/tmp/prompt-consolidation-project',
    })
    env.modules.state.upsertMember(promptTeam, {
      name: 'prompt-worker',
      role: 'implementer',
      cwd: '/tmp/prompt-consolidation-project',
      sessionFile: '/tmp/prompt-consolidation-worker.jsonl',
      status: 'idle',
      bootPrompt: 'prompt boot work',
    })
    const promptTask = env.modules.state.createTask(promptTeam, {
      title: 'Prompt task',
      description: 'prompt assigned task',
    })
    promptTask.owner = 'prompt-worker'
    promptTask.status = 'open'
    env.modules.state.writeTeamState(promptTeam)
    const promptMessage = env.modules.state.pushMailboxMessage(promptTeam.name, 'prompt-worker', {
      from: 'team-lead',
      to: 'prompt-worker',
      text: 'prompt unread message',
      type: 'question',
    })
    const promptMessages = env.modules.state.peekUnreadMailbox(promptTeam.name, 'prompt-worker')
    const bridgePrompt = env.modules.runtimeBridge.buildBridgeTurnPrompt(promptTeam, 'prompt-worker', 'explicit prompt instruction', promptMessages, { allowAssignedTaskTrigger: true })
    const sharedPrompt = env.modules.workerTurnPrompt.buildWorkerTurnPrompt(promptTeam, 'prompt-worker', {
      explicitInstruction: 'explicit prompt instruction',
      unreadMessages: promptMessages,
      allowAssignedTaskTrigger: true,
    })
    assert.equal(bridgePrompt, sharedPrompt, 'bridge prompt should use consolidated worker turn prompt builder')
    assert.ok(bridgePrompt.includes('Boot: prompt boot work'), 'prompt should include boot first')
    assert.ok(bridgePrompt.indexOf('Boot: prompt boot work') < bridgePrompt.indexOf('Assigned tasks:'), 'boot should precede assigned tasks')
    assert.ok(bridgePrompt.indexOf('Assigned tasks:') < bridgePrompt.indexOf('Messages:'), 'assigned tasks should precede messages')
    assert.ok(bridgePrompt.indexOf('Messages:') < bridgePrompt.indexOf('Instruction:'), 'messages should precede explicit instruction')
    assert.ok(bridgePrompt.includes(promptMessage.text), 'prompt should include unread message text')

    const dedupePromptTeam = env.modules.state.createInitialTeamState({
      teamName: 'worker-prompt-same-task-dedupe-suite',
      leaderSessionFile: '/tmp/worker-prompt-same-task-dedupe-leader.jsonl',
      leaderCwd: '/tmp/worker-prompt-same-task-dedupe-project',
    })
    env.modules.state.upsertMember(dedupePromptTeam, {
      name: 'dedupe-worker',
      role: 'implementer',
      cwd: '/tmp/worker-prompt-same-task-dedupe-project',
      sessionFile: '/tmp/worker-prompt-same-task-dedupe-worker.jsonl',
      status: 'idle',
    })
    const dedupeTask = env.modules.state.createTask(dedupePromptTeam, {
      title: 'Dedupe prompt task',
      description: 'same task should appear once with message signals',
    })
    dedupeTask.owner = 'dedupe-worker'
    dedupeTask.status = 'open'
    const otherTask = env.modules.state.createTask(dedupePromptTeam, {
      title: 'Other task prompt',
      description: 'different task message should stay in Messages',
    })
    otherTask.owner = 'someone-else'
    otherTask.status = 'open'
    env.modules.state.writeTeamState(dedupePromptTeam)
    const sameTaskAssignmentText = 'UNIQUE same task assignment instruction: implement the compact path'
    const sameTaskQuestionText = 'UNIQUE same task question: which validation should run?'
    const unscopedMessageText = 'UNIQUE unscoped message should remain standalone'
    const differentTaskMessageText = 'UNIQUE different task message should remain standalone'
    const sameTaskAssignment = env.modules.state.pushMailboxMessage(dedupePromptTeam.name, 'dedupe-worker', {
      from: 'team-lead',
      to: 'dedupe-worker',
      text: sameTaskAssignmentText,
      summary: 'assignment summary signal',
      type: 'assignment',
      taskId: dedupeTask.id,
    })
    const sameTaskQuestion = env.modules.state.pushMailboxMessage(dedupePromptTeam.name, 'dedupe-worker', {
      from: 'team-lead',
      to: 'dedupe-worker',
      text: sameTaskQuestionText,
      type: 'question',
      taskId: dedupeTask.id,
    })
    const unscopedPromptMessage = env.modules.state.pushMailboxMessage(dedupePromptTeam.name, 'dedupe-worker', {
      from: 'researcher',
      to: 'dedupe-worker',
      text: unscopedMessageText,
      type: 'inform',
    })
    const differentTaskPromptMessage = env.modules.state.pushMailboxMessage(dedupePromptTeam.name, 'dedupe-worker', {
      from: 'planner',
      to: 'dedupe-worker',
      text: differentTaskMessageText,
      type: 'question',
      taskId: otherTask.id,
    })
    const dedupePromptMessages = env.modules.state.peekUnreadMailbox(dedupePromptTeam.name, 'dedupe-worker')
    const dedupePrompt = env.modules.workerTurnPrompt.buildWorkerTurnPrompt(dedupePromptTeam, 'dedupe-worker', {
      unreadMessages: dedupePromptMessages,
      allowAssignedTaskTrigger: true,
    })
    assert.ok(dedupePrompt.includes('Assigned tasks: T001 Dedupe prompt task'), 'assigned task should render task-centric block')
    assert.ok(dedupePrompt.includes('task messages: [type=assignment from=team-lead summary=assignment summary signal]'), 'same-task assignment should be compactly merged under assigned task')
    assert.ok(dedupePrompt.includes('[type=question from=team-lead]'), 'same-task question should be compactly merged under assigned task')
    assert.equal(countOccurrences(dedupePrompt, sameTaskAssignmentText), 1, 'same task assignment instruction should be preserved exactly once')
    assert.equal(countOccurrences(dedupePrompt, sameTaskQuestionText), 1, 'same task question should be preserved exactly once')
    assert.equal(countOccurrences(dedupePrompt, 'Dedupe prompt task'), 1, 'same task title should not be repeated in Messages')
    const dedupeMessagesSection = dedupePrompt.slice(dedupePrompt.indexOf('Messages:'))
    assert.ok(!dedupeMessagesSection.includes(sameTaskAssignmentText), 'same-task assignment body should not repeat in Messages')
    assert.ok(!dedupeMessagesSection.includes(sameTaskQuestionText), 'same-task question body should not repeat in Messages')
    assert.ok(dedupeMessagesSection.includes(unscopedMessageText), 'unscoped message should remain in Messages')
    assert.ok(dedupeMessagesSection.includes(differentTaskMessageText), 'different-task message should remain in Messages')
    assert.ok(dedupePrompt.includes('Do the work now'), 'assignment on same task should keep work instruction')
    assert.ok(dedupePrompt.includes('durable completion report'), 'worker turn prompt should direct completion into report_done TaskReport path')
    assert.ok(dedupePrompt.includes('Progress/history is compact local activity only and does not notify team-lead'), 'worker turn prompt should not present notes as primary progress')
    assert.equal(dedupePrompt.includes('task-local notes'), false, 'worker turn prompt should not recommend task-local notes as active workflow')
    const dedupeMailboxAfterPrompt = env.modules.state.readMailbox(dedupePromptTeam.name, 'dedupe-worker')
    for (const message of [sameTaskAssignment, sameTaskQuestion, unscopedPromptMessage, differentTaskPromptMessage]) {
      const stored = dedupeMailboxAfterPrompt.find(item => item.id === message.id)
      assert.equal(stored?.readAt, undefined, 'prompt construction must not mark messages read')
      assert.equal(stored?.deliveredAt, undefined, 'prompt construction must not mark messages delivered')
    }

    const bridgeDedupeTeam = env.modules.state.createInitialTeamState({
      teamName: 'worker-prompt-bridge-dedupe-suite',
      leaderSessionFile: '/tmp/worker-prompt-bridge-dedupe-leader.jsonl',
      leaderCwd: '/tmp/worker-prompt-bridge-dedupe-project',
    })
    env.modules.state.upsertMember(bridgeDedupeTeam, {
      name: 'bridge-dedupe-worker',
      role: 'implementer',
      cwd: '/tmp/worker-prompt-bridge-dedupe-project',
      sessionFile: '/tmp/worker-prompt-bridge-dedupe-worker.jsonl',
      status: 'idle',
    })
    const bridgeDedupeTask = env.modules.state.createTask(bridgeDedupeTeam, {
      title: 'Bridge dedupe task',
      description: 'bridge prompt should merge same task message',
    })
    bridgeDedupeTask.owner = 'bridge-dedupe-worker'
    bridgeDedupeTask.status = 'open'
    env.modules.state.writeTeamState(bridgeDedupeTeam)
    const bridgeDedupeMessageText = 'UNIQUE bridge same task instruction should appear once'
    env.modules.state.pushMailboxMessage(bridgeDedupeTeam.name, 'bridge-dedupe-worker', {
      from: 'team-lead',
      to: 'bridge-dedupe-worker',
      text: bridgeDedupeMessageText,
      type: 'assignment',
      taskId: bridgeDedupeTask.id,
    })
    const bridgeDedupePromptMessages = env.modules.state.peekUnreadMailbox(bridgeDedupeTeam.name, 'bridge-dedupe-worker')
    const bridgeDedupePrompt = env.modules.runtimeBridge.buildBridgeTurnPrompt(bridgeDedupeTeam, 'bridge-dedupe-worker', undefined, bridgeDedupePromptMessages, { allowAssignedTaskTrigger: true })
    assert.ok(bridgeDedupePrompt.includes('Bridge dedupe task'), 'bridge delivery prompt should still include assigned task')
    assert.equal(countOccurrences(bridgeDedupePrompt, bridgeDedupeMessageText), 1, 'bridge delivery prompt should preserve same-task instruction once')
    assert.equal(bridgeDedupePrompt.includes('Messages:'), false, 'bridge delivery prompt should not repeat same-task assignment as a separate message')
    const bridgeDedupeMailboxAfterPrompt = env.modules.state.readMailbox(bridgeDedupeTeam.name, 'bridge-dedupe-worker')
    assert.equal(bridgeDedupeMailboxAfterPrompt[0]?.readAt, undefined, 'bridge prompt construction must not mark read')
    assert.equal(bridgeDedupeMailboxAfterPrompt[0]?.deliveredAt, undefined, 'bridge prompt construction must not mark delivered')

    const informationalPromptTeam = env.modules.state.createInitialTeamState({
      teamName: 'informational-prompt-suite',
      leaderSessionFile: '/tmp/informational-prompt-leader.jsonl',
      leaderCwd: '/tmp/informational-prompt-project',
    })
    env.modules.state.upsertMember(informationalPromptTeam, {
      name: 'informational-worker',
      role: 'planner',
      cwd: '/tmp/informational-prompt-project',
      sessionFile: '/tmp/informational-prompt-worker.jsonl',
      status: 'idle',
    })
    env.modules.state.writeTeamState(informationalPromptTeam)
    env.modules.state.pushMailboxMessage(informationalPromptTeam.name, 'informational-worker', {
      from: 'researcher',
      to: 'informational-worker',
      text: 'Inform only: research context for later leader attention',
      type: 'inform',
    })
    env.modules.state.pushMailboxMessage(informationalPromptTeam.name, 'informational-worker', {
      from: 'researcher',
      to: 'informational-worker',
      text: 'Done report context only',
      type: 'report_done',
    })
    const informationalOnlyPrompt = env.modules.workerTurnPrompt.buildWorkerTurnPrompt(informationalPromptTeam, 'informational-worker', {
      unreadMessages: env.modules.state.peekUnreadMailbox(informationalPromptTeam.name, 'informational-worker'),
    })
    assert.equal(informationalOnlyPrompt, null, 'informational-only messages should not trigger a worker turn prompt')

    env.modules.state.pushMailboxMessage(informationalPromptTeam.name, 'informational-worker', {
      from: 'team-lead',
      to: 'informational-worker',
      text: 'Can you answer this planning clarification?',
      type: 'question',
    })
    const questionOnlyPrompt = env.modules.workerTurnPrompt.buildWorkerTurnPrompt(informationalPromptTeam, 'informational-worker', {
      unreadMessages: env.modules.state.peekUnreadMailbox(informationalPromptTeam.name, 'informational-worker'),
    })
    assert.ok(questionOnlyPrompt.includes('Can you answer this planning clarification?'), 'question prompt should include question text')
    assert.ok(questionOnlyPrompt.includes('Answer/respond to the question now'), 'question prompt should tell worker to answer/respond')
    assert.ok(!questionOnlyPrompt.includes('Do the work now'), 'question-only prompt should not use broad work instruction')

    env.modules.state.pushMailboxMessage(informationalPromptTeam.name, 'informational-worker', {
      from: 'team-lead',
      to: 'informational-worker',
      text: 'Please start the assigned planning task',
      type: 'assignment',
    })
    const assignmentPrompt = env.modules.workerTurnPrompt.buildWorkerTurnPrompt(informationalPromptTeam, 'informational-worker', {
      unreadMessages: env.modules.state.peekUnreadMailbox(informationalPromptTeam.name, 'informational-worker'),
    })
    assert.ok(assignmentPrompt.includes('Please start the assigned planning task'), 'assignment prompt should include assignment text')
    assert.ok(assignmentPrompt.includes('Do the work now'), 'assignment prompt should keep work instruction')

    const blockedPromptTeam = env.modules.state.createInitialTeamState({
      teamName: 'blocked-prompt-suite',
      leaderSessionFile: '/tmp/blocked-prompt-leader.jsonl',
      leaderCwd: '/tmp/blocked-prompt-project',
    })
    env.modules.state.upsertMember(blockedPromptTeam, {
      name: 'blocked-prompt-worker',
      role: 'implementer',
      cwd: '/tmp/blocked-prompt-project',
      sessionFile: '/tmp/blocked-prompt-worker.jsonl',
      status: 'idle',
    })
    const actionablePromptTask = env.modules.state.createTask(blockedPromptTeam, {
      title: 'Actionable prompt task',
      description: 'safe to work',
    })
    actionablePromptTask.owner = 'blocked-prompt-worker'
    actionablePromptTask.status = 'open'
    const blockedPromptTask = env.modules.state.createTask(blockedPromptTeam, {
      title: 'Blocked prompt task',
      description: 'must wait',
      blockedBy: ['leader decision'],
    })
    blockedPromptTask.owner = 'blocked-prompt-worker'
    blockedPromptTask.status = 'blocked'
    env.modules.state.writeTeamState(blockedPromptTeam)
    env.modules.state.pushMailboxMessage(blockedPromptTeam.name, 'blocked-prompt-worker', {
      from: 'team-lead',
      to: 'blocked-prompt-worker',
      text: 'question about blocked prompt task',
      type: 'question',
      taskId: blockedPromptTask.id,
    })
    const blockedPromptMessages = env.modules.state.peekUnreadMailbox(blockedPromptTeam.name, 'blocked-prompt-worker')
    const blockedPrompt = env.modules.workerTurnPrompt.buildWorkerTurnPrompt(blockedPromptTeam, 'blocked-prompt-worker', {
      unreadMessages: blockedPromptMessages,
      allowAssignedTaskTrigger: true,
    })
    assert.ok(blockedPrompt.includes('Assigned tasks: T001 Actionable prompt task'), 'actionable owned task should remain in assigned tasks')
    assert.ok(!blockedPrompt.includes('Assigned tasks: T002 Blocked prompt task'), 'blocked owned task should not appear as actionable assigned task')
    assert.ok(blockedPrompt.includes('Blocked tasks / non-actionable: T002 Blocked prompt task'), 'blocked owned task should be shown separately as non-actionable')
    assert.ok(blockedPrompt.includes('do not work until team-lead clears blockers'), 'blocked prompt should tell worker not to work until leader clears blockers')
    assert.ok(blockedPrompt.includes('question about blocked prompt task'), 'communication about blocked task should still appear in messages')
    assert.deepEqual(
      env.modules.workerTurnPrompt.assignedTasksForWorker(blockedPromptTeam, 'blocked-prompt-worker').map(task => task.id),
      ['T001'],
      'assignedTasksForWorker should only return actionable owned tasks',
    )
    assert.deepEqual(
      env.modules.workerTurnPrompt.blockedTasksForWorker(blockedPromptTeam, 'blocked-prompt-worker').map(task => task.id),
      ['T002'],
      'blockedTasksForWorker should expose blocked owned tasks separately',
    )

    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.upsertMember(latest, {
        name: 'bridge-task-worker',
        role: 'researcher',
        cwd: '/tmp/bridge-pump-project',
        sessionFile: '/tmp/bridge-task-worker.jsonl',
        paneId: '%bridge-task-worker',
        windowTarget: 'test:@1',
        status: 'idle',
        bootPrompt: 'start from bridge boot prompt',
      })
      const bridgeTask = env.modules.state.createTask(latest, {
        title: 'Bridge task prompt',
        description: 'task prompt should flow through bridge',
      })
      bridgeTask.owner = 'bridge-task-worker'
      bridgeTask.status = 'open'
    })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'bridge-task-worker',
      sessionFile: '/tmp/bridge-task-worker.jsonl',
    })
    env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-task-worker', {
      bootPrompt: 'start from bridge boot prompt',
    })
    const taskBridgeSends = []
    const taskBridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-task-worker',
      ctx: {
        isIdle: () => true,
        sendUserMessage: content => { taskBridgeSends.push(content) },
      },
    })
    assert.equal(taskBridgePump.ok, true)
    assert.ok(taskBridgeSends[0].includes('start from bridge boot prompt'), 'bridge should include bootPrompt work')
    assert.ok(taskBridgeSends[0].includes('Bridge task prompt'), 'bridge should include assigned task work')
    assert.equal(env.modules.state.readTeamState(bridgeTeam.name).members['bridge-task-worker'].bootPrompt, undefined, 'bridge success should clear bootPrompt')

    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.upsertMember(latest, {
        name: 'bridge-explicit-worker',
        role: 'implementer',
        cwd: '/tmp/bridge-pump-project',
        sessionFile: '/tmp/bridge-explicit-worker.jsonl',
        paneId: '%bridge-explicit-worker',
        windowTarget: 'test:@1',
        status: 'idle',
      })
    })
    env.patches.livePanes.add('%bridge-explicit-worker')
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'bridge-explicit-worker',
      sessionFile: '/tmp/bridge-explicit-worker.jsonl',
    })
    const explicitBridgeWake = await env.modules.runtime.requestWorkerDelivery(
      env.modules.state.readTeamState(bridgeTeam.name),
      'bridge-explicit-worker',
      'explicit bridge task now',
    )
    assert.equal(explicitBridgeWake.ok, true)
    assert.equal(explicitBridgeWake.method, 'bridge_requested')
    assert.equal(explicitBridgeWake.reason, env.modules.runtimeBridge.BRIDGE_TASK_REQUEST_REASON)
    assert.ok(explicitBridgeWake.requestId, 'explicit bridge wake should create a durable request id')
    const explicitBridgeSends = []
    const explicitBridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-explicit-worker',
      ctx: {
        isIdle: () => true,
        sendUserMessage: content => { explicitBridgeSends.push(content) },
      },
    })
    assert.equal(explicitBridgePump.ok, true)
    assert.ok(explicitBridgeSends[0].includes('explicit bridge task now'), 'explicit wake task should flow through bridge pump')
    assert.equal(env.modules.state.readTeamState(bridgeTeam.name).members['bridge-explicit-worker'].bootPrompt, undefined, 'bridge explicit task success should clear bootPrompt')

    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.upsertMember(latest, {
        name: 'bridge-hook-worker',
        role: 'researcher',
        cwd: '/tmp/bridge-pump-project',
        sessionFile: '/tmp/bridge-hook-worker.jsonl',
        paneId: '%bridge-hook-worker',
        windowTarget: 'test:@1',
        status: 'idle',
      })
    })
    env.modules.state.writeSessionContext('/tmp/bridge-hook-worker.jsonl', {
      teamName: bridgeTeam.name,
      memberName: 'bridge-hook-worker',
    })
    const bridgeSessionHooks = env.pi.__hooks.get('session_start') || []
    assert.ok(bridgeSessionHooks.length > 0, 'session_start hook should be registered for bridge startup')
    await bridgeSessionHooks[0]({}, env.helpers.createCtx('/tmp/bridge-pump-project', '/tmp/bridge-hook-worker.jsonl', []))
    const bridgeHookMember = env.modules.state.readTeamState(bridgeTeam.name).members['bridge-hook-worker']
    assert.equal(env.modules.state.getOutboxEffect(bridgeTeam.name, bridgeHookOutbox.effectId).status, 'done', 'session_start should run outbox maintenance for attached worker team')
    assert.equal(env.modules.state.readMailbox(bridgeTeam.name, 'bridge-hook-worker').filter(message => message.text === 'session hook should run outbox maintenance').length, 1, 'session_start outbox maintenance should persist mailbox effect exactly once')
    assert.equal(bridgeHookMember.bridgeAvailable, true, 'session_start should publish worker bridge availability')
    assert.equal(bridgeHookMember.bridgeVersion, env.modules.runtimeBridge.BRIDGE_VERSION, 'bridge availability should include bridge version')

    const lifecycleTeam = env.modules.state.createInitialTeamState({
      teamName: 'lifecycle-shutdown-suite',
      leaderSessionFile: '/tmp/lifecycle-shutdown-leader.jsonl',
      leaderCwd: '/tmp/lifecycle-shutdown-project',
    })
    env.modules.state.upsertMember(lifecycleTeam, {
      name: 'error-worker',
      role: 'implementer',
      cwd: '/tmp/lifecycle-shutdown-project',
      sessionFile: '/tmp/lifecycle-error-worker.jsonl',
      status: 'error',
      lastWakeReason: 'wake preflight failed: pane missing',
      lastError: 'pane lost',
    })
    env.modules.state.upsertMember(lifecycleTeam, {
      name: 'normal-worker',
      role: 'researcher',
      cwd: '/tmp/lifecycle-shutdown-project',
      sessionFile: '/tmp/lifecycle-normal-worker.jsonl',
      status: 'running',
      lastWakeReason: 'processing prompt',
    })
    env.modules.state.writeTeamState(lifecycleTeam)
    env.modules.state.writeSessionContext('/tmp/lifecycle-error-worker.jsonl', {
      teamName: lifecycleTeam.name,
      memberName: 'error-worker',
    })
    env.modules.lifecycleService.markWorkerSessionShutdown(env.helpers.createCtx('/tmp/lifecycle-shutdown-project', '/tmp/lifecycle-error-worker.jsonl', []))
    let lifecycleAfterShutdown = env.modules.state.readTeamState(lifecycleTeam.name)
    assert.equal(lifecycleAfterShutdown.members['error-worker'].status, 'error', 'session shutdown should not clear existing error status')
    assert.equal(lifecycleAfterShutdown.members['error-worker'].lastError, 'pane lost', 'session shutdown should preserve existing lastError')
    env.modules.state.writeSessionContext('/tmp/lifecycle-normal-worker.jsonl', {
      teamName: lifecycleTeam.name,
      memberName: 'normal-worker',
    })
    env.modules.lifecycleService.markWorkerSessionShutdown(env.helpers.createCtx('/tmp/lifecycle-shutdown-project', '/tmp/lifecycle-normal-worker.jsonl', []))
    lifecycleAfterShutdown = env.modules.state.readTeamState(lifecycleTeam.name)
    assert.equal(lifecycleAfterShutdown.members['normal-worker'].status, 'offline', 'normal shutdown should mark running worker offline')
    assert.equal(lifecycleAfterShutdown.members['normal-worker'].lastWakeReason, 'session shutdown')
    assert.equal(lifecycleAfterShutdown.members['normal-worker'].bridgeAvailable, false)
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: lifecycleTeam.name,
      memberName: 'normal-worker',
      sessionFile: '/tmp/lifecycle-normal-worker.jsonl',
    })
    env.modules.runtimeBridge.markBridgeStopped(lifecycleTeam.name, 'normal-worker')
    const normalAfterBridgeStop = env.modules.state.readTeamState(lifecycleTeam.name).members['normal-worker']
    assert.equal(normalAfterBridgeStop.bridgeAvailable, false, 'normal bridge stop should mark bridge unavailable')

    const bridgeOnlyDeliveryTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-only-delivery-suite',
      leaderSessionFile: '/tmp/bridge-only-delivery-leader.jsonl',
      leaderCwd: '/tmp/bridge-only-delivery-project',
    })
    env.modules.state.upsertMember(bridgeOnlyDeliveryTeam, {
      name: 'bridge-only-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-only-delivery-project',
      sessionFile: '/tmp/bridge-only-delivery-worker.jsonl',
      paneId: '%bridge-only-worker',
      windowTarget: 'test:@1',
      status: 'idle',
    })
    env.modules.state.writeTeamState(bridgeOnlyDeliveryTeam)
    env.patches.livePanes.add('%bridge-only-worker')
    env.modules.state.writeSessionContext('/tmp/bridge-only-delivery-leader.jsonl', {
      teamName: bridgeOnlyDeliveryTeam.name,
      memberName: 'team-lead',
    })
    env.modules.state.writeSessionContext('/tmp/bridge-only-delivery-worker.jsonl', {
      teamName: bridgeOnlyDeliveryTeam.name,
      memberName: 'bridge-only-worker',
    })
    const bridgeOnlyLeaderCtx = env.helpers.createCtx('/tmp/bridge-only-delivery-project', '/tmp/bridge-only-delivery-leader.jsonl', [])
    const bridgeOnlySendMessagesBefore = env.pi.__messages.length
    env.sentPrompts.length = 0
    const bridgeOnlySend = await env.pi.__tools.get('agentteam_send').execute('bridge-only-send-request', {
      to: 'bridge-only-worker',
      message: 'bridge-only send should create request without tmux paste',
      type: 'question',
    }, null, () => {}, bridgeOnlyLeaderCtx)
    assert.equal(bridgeOnlySend.details.wakeByRecipient[0].method, 'bridge_requested')
    assert.equal(bridgeOnlySend.details.wakeByRecipient[0].ok, false)
    assert.equal(bridgeOnlySend.details.wakeByRecipient[0].reason, 'bridge unavailable in bridge-only delivery mode')
    assert.ok(bridgeOnlySend.details.wakeByRecipient[0].requestId, 'bridge-only send should expose delivery request id even when bridge unavailable')
    assert.equal(env.sentPrompts.length, 0, 'bridge-only send should not paste into tmux pane')
    assert.equal(env.pi.__messages.length, bridgeOnlySendMessagesBefore, 'bridge-only send should not native-submit from leader process')
    const bridgeOnlyRequests = Object.values(env.modules.state.readDeliveryRequestStore(bridgeOnlyDeliveryTeam.name).requests)
    assert.equal(bridgeOnlyRequests.length, 1, 'bridge-only send should create one durable request')
    assert.equal(bridgeOnlyRequests[0].requestId, bridgeOnlySend.details.wakeByRecipient[0].requestId)
    assert.equal(bridgeOnlyRequests[0].status, 'pending')
    const bridgeOnlyMailbox = env.modules.state.readMailbox(bridgeOnlyDeliveryTeam.name, 'bridge-only-worker')
    assert.equal(bridgeOnlyMailbox[0].readAt, undefined, 'bridge-only send should leave mailbox unread')
    assert.equal(bridgeOnlyMailbox[0].deliveredAt, undefined, 'bridge-only send should not mark delivered')

    const leaderAttentionRequest = await env.modules.runtime.requestLeaderAttentionIfNeeded(bridgeOnlyDeliveryTeam, {
      type: 'report_done',
      wakeHint: 'hard',
      from: 'bridge-only-worker',
      summary: 'leader attention status truth',
      text: 'leader attention should not make leader look like a worker pending delivery',
    })
    assert.equal(leaderAttentionRequest.method, 'leader_attention_requested')
    assert.equal(env.modules.state.readTeamState(bridgeOnlyDeliveryTeam.name).members['team-lead'].status, 'idle', 'leader attention request should not mark team-lead open_delivery')

    env.modules.state.updateTeamState(bridgeOnlyDeliveryTeam.name, latest => {
      env.modules.state.updateMemberStatus(latest, 'bridge-only-worker', {
        status: 'running',
        lastWakeReason: 'processing prompt',
      })
    })
    const runningWorkerMessage = env.modules.state.pushMailboxMessage(bridgeOnlyDeliveryTeam.name, 'bridge-only-worker', {
      from: 'team-lead',
      to: 'bridge-only-worker',
      text: 'running worker follow-up should stay pending',
      type: 'question',
      wakeHint: 'soft',
    })
    const runningWorkerDelivery = await env.modules.runtime.requestWorkerDelivery(
      env.modules.state.readTeamState(bridgeOnlyDeliveryTeam.name),
      'bridge-only-worker',
      undefined,
      {
        messageIds: [runningWorkerMessage.id],
        requestedBy: 'team-lead',
        reason: 'running worker delivery test',
        wakeHint: 'soft',
      },
    )
    assert.equal(runningWorkerDelivery.method, 'bridge_requested')
    assert.ok(runningWorkerDelivery.requestId, 'running worker follow-up should still create a durable request')
    const runningWorkerAfterRequest = env.modules.state.readTeamState(bridgeOnlyDeliveryTeam.name).members['bridge-only-worker']
    assert.equal(runningWorkerAfterRequest.status, 'running', 'requesting delivery to running worker should not overwrite running status')
    assert.equal(runningWorkerAfterRequest.lastWakeReason, 'bridge delivery pending while running')

    const raceTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-claim-race-suite',
      leaderSessionFile: '/tmp/bridge-race-leader.jsonl',
      leaderCwd: '/tmp/bridge-race-project',
    })
    env.modules.state.upsertMember(raceTeam, {
      name: 'race-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-race-project',
      sessionFile: '/tmp/bridge-race-worker.jsonl',
      status: 'idle',
      paneId: '%bridge-race-worker',
    })
    env.modules.state.writeTeamState(raceTeam)
    env.modules.state.pushMailboxMessage(raceTeam.name, 'race-worker', {
      from: 'team-lead',
      to: 'race-worker',
      text: 'race request one',
      type: 'question',
    })
    env.modules.state.pushMailboxMessage(raceTeam.name, 'race-worker', {
      from: 'team-lead',
      to: 'race-worker',
      text: 'race request two',
      type: 'question',
    })
    const raceMessages = env.modules.state.readMailbox(raceTeam.name, 'race-worker')
    env.helpers.createBridgeDeliveryRequest(raceTeam.name, 'race-worker', {
      messageIds: raceMessages.map(message => message.id),
      requestedBy: 'team-lead',
      reason: 'race test',
    })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: raceTeam.name,
      memberName: 'race-worker',
      sessionFile: '/tmp/bridge-race-worker.jsonl',
    })
    const raceSends = []
    const raceCtx = {
      isIdle: () => true,
      hasPendingMessages: () => false,
      sendUserMessage: content => { raceSends.push(content) },
    }
    const raceResults = await Promise.all([
      env.modules.runtimeBridge.pumpBridgeOnce({ teamName: raceTeam.name, memberName: 'race-worker', ctx: raceCtx }),
      env.modules.runtimeBridge.pumpBridgeOnce({ teamName: raceTeam.name, memberName: 'race-worker', ctx: raceCtx }),
    ])
    assert.equal(raceSends.length, 1, 'two racing bridge controllers should produce exactly one native send')
    assert.equal(raceResults.filter(result => result.ok).length, 1, 'only one racing bridge claim should succeed')
    const submittedRaceRequests = Object.values(env.modules.state.readDeliveryRequestStore(raceTeam.name).requests)
      .filter(request => request.memberName === 'race-worker' && request.status === 'submitted')
    assert.equal(submittedRaceRequests.length, 1, 'race should leave one submitted request')
    assert.ok(submittedRaceRequests[0].claim.claimId, 'claim should include claimId')
    assert.equal(submittedRaceRequests[0].claim.bridgeId.includes('bridge-claim-race-suite'), true)
    assert.deepEqual(submittedRaceRequests[0].claim.messageIds.sort(), raceMessages.map(message => message.id).sort())
    assert.ok(submittedRaceRequests[0].claim.promptHash, 'claim should include prompt hash')
    const raceMailbox = env.modules.state.readMailbox(raceTeam.name, 'race-worker')
    assert.equal(raceMailbox.every(message => message.readAt === undefined), true, 'bridge submit should not read mailbox')
    assert.equal(raceMailbox.every(message => message.deliveredAt === undefined), true, 'bridge submit should not mark delivered')

    const rerunTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-rerun-suite',
      leaderSessionFile: '/tmp/bridge-rerun-leader.jsonl',
      leaderCwd: '/tmp/bridge-rerun-project',
    })
    env.modules.state.upsertMember(rerunTeam, {
      name: 'rerun-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-rerun-project',
      sessionFile: '/tmp/bridge-rerun-worker.jsonl',
      status: 'idle',
      paneId: '%bridge-rerun-worker',
    })
    env.modules.state.writeTeamState(rerunTeam)
    const rerunFirstMessage = env.modules.state.pushMailboxMessage(rerunTeam.name, 'rerun-worker', {
      from: 'team-lead',
      to: 'rerun-worker',
      text: 'rerun first request',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(rerunTeam.name, 'rerun-worker', {
      messageIds: [rerunFirstMessage.id],
      requestedBy: 'team-lead',
      reason: 'rerun first',
    })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: rerunTeam.name,
      memberName: 'rerun-worker',
      sessionFile: '/tmp/bridge-rerun-worker.jsonl',
    })
    const rerunSends = []
    let releaseFirstSend
    const firstSendEntered = new Promise(resolve => { releaseFirstSend = resolve })
    const firstSendCanFinish = new Promise(resolve => { globalThis.__releaseRerunFirstSend = resolve })
    let sendCount = 0
    const rerunCtx = {
      isIdle: () => true,
      hasPendingMessages: () => false,
      sendUserMessage: async content => {
        sendCount += 1
        rerunSends.push(content)
        if (sendCount === 1) {
          releaseFirstSend()
          await firstSendCanFinish
        }
      },
    }
    const firstPumpPromise = env.modules.runtimeBridge.pumpBridgeOnce({ teamName: rerunTeam.name, memberName: 'rerun-worker', ctx: rerunCtx })
    await firstSendEntered
    const rerunSecondMessage = env.modules.state.pushMailboxMessage(rerunTeam.name, 'rerun-worker', {
      from: 'team-lead',
      to: 'rerun-worker',
      text: 'rerun second request',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(rerunTeam.name, 'rerun-worker', {
      messageIds: [rerunSecondMessage.id],
      requestedBy: 'team-lead',
      reason: 'rerun second',
    })
    const secondPumpPromise = env.modules.runtimeBridge.pumpBridgeOnce({ teamName: rerunTeam.name, memberName: 'rerun-worker', ctx: rerunCtx })
    globalThis.__releaseRerunFirstSend()
    const rerunResults = await Promise.all([firstPumpPromise, secondPumpPromise])
    delete globalThis.__releaseRerunFirstSend
    assert.equal(rerunSends.length, 2, 'rerunRequested should be consumed by a follow-up pump after active pump finishes')
    assert.ok(rerunSends[0].includes('rerun first request'), 'first pump should deliver first request')
    assert.ok(rerunSends[1].includes('rerun second request'), 'follow-up rerun should deliver request created during active pump')
    assert.equal(rerunResults[0].ok, true, 'active pump should return success after consumed rerun')
    assert.equal(rerunResults[1].ok, false, 'concurrent caller remains queued/claimed response')
    const submittedRerunRequests = Object.values(env.modules.state.readDeliveryRequestStore(rerunTeam.name).requests)
      .filter(request => request.memberName === 'rerun-worker' && request.status === 'submitted')
    assert.equal(submittedRerunRequests.length, 2, 'both original and rerun-created requests should be submitted')

    const busyTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-busy-suite',
      leaderSessionFile: '/tmp/bridge-busy-leader.jsonl',
      leaderCwd: '/tmp/bridge-busy-project',
    })
    env.modules.state.upsertMember(busyTeam, {
      name: 'busy-worker',
      role: 'researcher',
      cwd: '/tmp/bridge-busy-project',
      sessionFile: '/tmp/bridge-busy-worker.jsonl',
      status: 'running',
    })
    env.modules.state.writeTeamState(busyTeam)
    const busyMessage = env.modules.state.pushMailboxMessage(busyTeam.name, 'busy-worker', {
      from: 'team-lead',
      to: 'busy-worker',
      text: 'busy worker should not receive native send yet',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(busyTeam.name, 'busy-worker', {
      messageIds: [busyMessage.id],
      requestedBy: 'team-lead',
      reason: 'busy test',
    })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: busyTeam.name,
      memberName: 'busy-worker',
      sessionFile: '/tmp/bridge-busy-worker.jsonl',
    })
    const busySends = []
    const busyResult = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: busyTeam.name,
      memberName: 'busy-worker',
      ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: content => { busySends.push(content) } },
    })
    assert.equal(busyResult.ok, false)
    assert.equal(busySends.length, 0, 'running worker should receive no native send')
    assert.equal(Object.values(env.modules.state.readDeliveryRequestStore(busyTeam.name).requests)[0].status, 'pending', 'running worker request should remain pending')
    env.modules.state.updateTeamState(busyTeam.name, latest => {
      env.modules.state.updateMemberStatus(latest, 'busy-worker', { status: 'idle', lastWakeReason: 'idle for pending submit' })
    })
    const busyAfterIdle = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: busyTeam.name,
      memberName: 'busy-worker',
      ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: content => { busySends.push(content) } },
    })
    assert.equal(busyAfterIdle.ok, true)
    assert.equal(busySends.length, 1, 'pending request should submit after worker is idle')
    assert.ok(busySends[0].includes('busy worker should not receive native send yet'))

    const staleTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-stale-claim-suite',
      leaderSessionFile: '/tmp/bridge-stale-leader.jsonl',
      leaderCwd: '/tmp/bridge-stale-project',
    })
    env.modules.state.upsertMember(staleTeam, {
      name: 'stale-worker',
      role: 'researcher',
      cwd: '/tmp/bridge-stale-project',
      sessionFile: '/tmp/bridge-stale-worker.jsonl',
      status: 'idle',
    })
    env.modules.state.writeTeamState(staleTeam)
    const staleMessage = env.modules.state.pushMailboxMessage(staleTeam.name, 'stale-worker', {
      from: 'team-lead',
      to: 'stale-worker',
      text: 'stale lease should not send',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(staleTeam.name, 'stale-worker', { messageIds: [staleMessage.id] })
    const staleLease = env.modules.runtimeBridge.publishBridgeLease({
      teamName: staleTeam.name,
      memberName: 'stale-worker',
      sessionFile: '/tmp/bridge-stale-worker.jsonl',
    })
    env.modules.state.upsertBridgeLease(staleTeam.name, { ...staleLease, expiresAt: Date.now() - 1 })
    const staleSends = []
    const staleResult = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: staleTeam.name,
      memberName: 'stale-worker',
      ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: content => { staleSends.push(content) } },
    })
    assert.equal(staleResult.ok, false)
    assert.equal(staleSends.length, 0, 'stale lease should not send')
    assert.equal(Object.values(env.modules.state.readDeliveryRequestStore(staleTeam.name).requests)[0].status, 'pending')

    const lifecycleBridgeTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-lifecycle-suite',
      leaderSessionFile: '/tmp/bridge-lifecycle-leader.jsonl',
      leaderCwd: '/tmp/bridge-lifecycle-project',
    })
    env.modules.state.upsertMember(lifecycleBridgeTeam, {
      name: 'lifecycle-bridge-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-lifecycle-project',
      sessionFile: '/tmp/bridge-lifecycle-worker.jsonl',
      status: 'idle',
      paneId: '%bridge-lifecycle-worker',
    })
    env.modules.state.writeTeamState(lifecycleBridgeTeam)
    env.modules.state.writeSessionContext('/tmp/bridge-lifecycle-worker.jsonl', {
      teamName: lifecycleBridgeTeam.name,
      memberName: 'lifecycle-bridge-worker',
    })
    const lifecycleMessage = env.modules.state.pushMailboxMessage(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      from: 'team-lead',
      to: 'lifecycle-bridge-worker',
      text: 'lifecycle request should start and close',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', { messageIds: [lifecycleMessage.id] })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: lifecycleBridgeTeam.name,
      memberName: 'lifecycle-bridge-worker',
      sessionFile: '/tmp/bridge-lifecycle-worker.jsonl',
    })
    const lifecycleSends = []
    const lifecyclePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: lifecycleBridgeTeam.name,
      memberName: 'lifecycle-bridge-worker',
      ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: content => { lifecycleSends.push(content) } },
    })
    assert.equal(lifecyclePump.ok, true)
    let lifecycleRequest = Object.values(env.modules.state.readDeliveryRequestStore(lifecycleBridgeTeam.name).requests)[0]
    assert.equal(lifecycleRequest.status, 'submitted')
    const lifecycleStart = env.modules.runtimeBridge.markBridgeAgentStart(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker')
    assert.equal(typeof env.helpers.requireDist('runtime/bridgeLifecycle.js').markBridgeAgentStart, 'function', 'focused bridgeLifecycle module should expose lifecycle start')
    assert.equal(lifecycleStart.request.status, 'started', 'agent_start should transition submitted request to started')
    lifecycleRequest = Object.values(env.modules.state.readDeliveryRequestStore(lifecycleBridgeTeam.name).requests)[0]
    assert.equal(lifecycleRequest.status, 'started')
    const lifecycleMailboxAfterStart = env.modules.state.readMailbox(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker')
    assert.ok(lifecycleMailboxAfterStart[0].deliveredAt, 'agent_start may conservatively mark mailbox delivered')
    assert.equal(lifecycleMailboxAfterStart[0].readAt, undefined, 'agent_start must not mark mailbox read')
    assert.equal(env.modules.state.readTeamState(lifecycleBridgeTeam.name).members['lifecycle-bridge-worker'].status, 'running')
    const lifecycleEnd = env.modules.runtimeBridge.markBridgeAgentEnd(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      isIdle: () => true,
      hasPendingMessages: () => false,
    })
    assert.equal(lifecycleEnd.request.status, 'completed', 'agent_end should close current started request')
    assert.equal(lifecycleEnd.status, 'idle', 'safe bridge lifecycle end should mark worker idle')
    lifecycleRequest = Object.values(env.modules.state.readDeliveryRequestStore(lifecycleBridgeTeam.name).requests)[0]
    assert.equal(lifecycleRequest.status, 'completed')
    assert.equal(env.modules.state.readTeamState(lifecycleBridgeTeam.name).members['lifecycle-bridge-worker'].status, 'idle')

    const openAfterEndMessage = env.modules.state.pushMailboxMessage(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      from: 'team-lead',
      to: 'lifecycle-bridge-worker',
      text: 'pending after end should prevent idle',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', { messageIds: [openAfterEndMessage.id] })
    env.modules.runtimeBridge.markBridgeAgentStart(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker')
    const openEnd = env.modules.runtimeBridge.markBridgeAgentEnd(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      isIdle: () => true,
      hasPendingMessages: () => false,
    })
    assert.equal(openEnd.status, 'pending_delivery', 'pending request after agent_end should not show idle')
    assert.equal(env.modules.state.readTeamState(lifecycleBridgeTeam.name).members['lifecycle-bridge-worker'].status, 'pending_delivery')

    const assignAfterEndMessage = env.modules.state.pushMailboxMessage(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      from: 'team-lead',
      to: 'lifecycle-bridge-worker',
      text: 'active claim should drain',
      type: 'question',
    })
    const assignRequest = env.helpers.createBridgeDeliveryRequest(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', { messageIds: [assignAfterEndMessage.id] })
    const lifecycleLease = env.modules.state.getBridgeLease(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker')
    env.modules.state.claimDeliveryRequest(lifecycleBridgeTeam.name, assignRequest.requestId, {
      bridgeId: lifecycleLease.bridgeId,
      generation: lifecycleLease.generation,
      messageIds: [assignAfterEndMessage.id],
      promptHash: 'active-claim-hash',
    })
    env.modules.runtimeBridge.markBridgeAgentStart(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker')
    const activeClaimEnd = env.modules.runtimeBridge.markBridgeAgentEnd(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      isIdle: () => true,
      hasPendingMessages: () => false,
    })
    assert.equal(activeClaimEnd.status, 'draining', 'active claim after agent_end should not show idle')
    assert.equal(env.modules.state.readTeamState(lifecycleBridgeTeam.name).members['lifecycle-bridge-worker'].status, 'draining')

    env.modules.state.transitionDeliveryRequest(lifecycleBridgeTeam.name, assignRequest.requestId, 'cancelled')
    env.modules.runtimeBridge.markBridgeAgentStart(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker')
    const queuedEnd = env.modules.runtimeBridge.markBridgeAgentEnd(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      isIdle: () => true,
      hasPendingMessages: () => true,
    })
    assert.equal(queuedEnd.status, 'draining', 'pi pending queue after agent_end should not show idle')

    env.modules.state.updateTeamState(lifecycleBridgeTeam.name, latest => {
        env.modules.state.updateMemberStatus(latest, 'lifecycle-bridge-worker', { status: 'idle', lastWakeReason: 'hook lifecycle reset' })
    })
    const hookMessage = env.modules.state.pushMailboxMessage(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
        from: 'team-lead',
        to: 'lifecycle-bridge-worker',
        text: 'hook lifecycle request',
        type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', { messageIds: [hookMessage.id] })
    await env.modules.runtimeBridge.pumpBridgeOnce({
        teamName: lifecycleBridgeTeam.name,
        memberName: 'lifecycle-bridge-worker',
        ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: () => {} },
    })
    const hookCtx = env.helpers.createCtx('/tmp/bridge-lifecycle-project', '/tmp/bridge-lifecycle-worker.jsonl', [])
    const agentHookOutbox = env.modules.state.enqueueOutboxEffect({
        teamName: lifecycleBridgeTeam.name,
        kind: 'inbox_item_append_requested',
        idempotencyKey: 'agent-start-hook-outbox',
        payload: {
          teamName: lifecycleBridgeTeam.name,
          recipient: 'lifecycle-bridge-worker',
          message: {
            from: 'team-lead',
            to: 'lifecycle-bridge-worker',
            text: 'agent_start should run outbox maintenance',
            type: 'inform',
            wakeHint: 'none',
          },
        },
    })
    const agentStartHooks = env.pi.__hooks.get('agent_start') || []
    const agentEndHooks = env.pi.__hooks.get('agent_end') || []
    await agentStartHooks[0]({}, hookCtx)
    await wait(25)
    assert.equal(env.modules.state.getOutboxEffect(lifecycleBridgeTeam.name, agentHookOutbox.effectId).status, 'done', 'agent_start should trigger outbox maintenance on existing safe runtime tick')
    assert.equal(env.modules.state.readMailbox(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker').filter(message => message.text === 'agent_start should run outbox maintenance').length, 1, 'agent_start maintenance should not duplicate mailbox')
    assert.equal(Object.values(env.modules.state.readDeliveryRequestStore(lifecycleBridgeTeam.name).requests).find(request => request.messageIds.includes(hookMessage.id)).status, 'started')
    await agentEndHooks[0]({}, hookCtx)
    assert.equal(Object.values(env.modules.state.readDeliveryRequestStore(lifecycleBridgeTeam.name).requests).find(request => request.messageIds.includes(hookMessage.id)).status, 'completed')

  },
}
