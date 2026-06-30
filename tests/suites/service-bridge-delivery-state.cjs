const assert = require('node:assert/strict')

module.exports = {
  name: 'service bridge delivery state',
  async run(env) {
    const durableTeam = env.modules.state.createInitialTeamState({
      teamName: 'durable-bridge-delivery-suite',
      leaderSessionFile: '/tmp/durable-bridge-leader.jsonl',
      leaderCwd: '/tmp/durable-bridge-project',
      description: 'durable bridge/delivery state model test',
    })
    env.modules.state.upsertMember(durableTeam, {
      name: 'durable-worker',
      role: 'implementer',
      cwd: '/tmp/durable-bridge-project',
      sessionFile: '/tmp/durable-bridge-worker.jsonl',
      status: 'idle',
    })
    env.modules.state.writeTeamState(durableTeam)
    const durableNow = 1_000_000
    const freshLease = env.modules.state.upsertBridgeLease(durableTeam.name, {
      memberName: 'durable-worker',
      bridgeId: 'bridge-1',
      protocolVersion: 1,
      packageVersion: '0.5.1-test',
      sessionFile: '/tmp/durable-bridge-worker.jsonl',
      pid: 12345,
      processIdentity: 'pid:12345:start:999000',
      startedAt: durableNow - 1000,
      lastSeenAt: durableNow - 100,
      expiresAt: durableNow + 5000,
      generation: 7,
      capabilities: ['deliver.prompt', 'status.heartbeat'],
    })
    assert.equal(env.modules.state.getBridgeLease(durableTeam.name, 'durable-worker').bridgeId, 'bridge-1')
    assert.ok(env.modules.state.getRuntimeStatePath(durableTeam.name).endsWith('/runtime.json'), 'bridge/delivery/projection runtime state should live in runtime.json')
    assert.equal(env.modules.bridgeStore.staleBridge(freshLease, durableNow), false, 'fresh bridge lease should be usable')
    assert.equal(env.modules.bridgeStore.staleBridge({ ...freshLease, expiresAt: durableNow - 1 }, durableNow), true, 'expired bridge lease should be stale')
    assert.equal(env.modules.bridgeStore.staleBridge({ ...freshLease, lastSeenAt: 0 }, durableNow), true, 'missing lastSeenAt should be stale')
    assert.equal(env.modules.bridgeStore.staleBridge(null, durableNow), true, 'missing bridge lease should be stale')
    assert.equal(env.modules.state.bridgeLeaseIsFresh(freshLease, {
      memberName: 'durable-worker',
      sessionFile: '/tmp/durable-bridge-worker.jsonl',
      protocolVersion: 1,
      packageVersion: '0.5.1-test',
      generation: 7,
      now: durableNow,
    }), true, 'fresh lease should match expected member/session/protocol/package/generation')
    assert.equal(env.modules.state.bridgeLeaseMismatchReason(freshLease, {
      memberName: 'durable-worker',
      sessionFile: '/tmp/other-session.jsonl',
      protocolVersion: 1,
      packageVersion: '0.5.1-test',
      generation: 7,
      now: durableNow,
    }), 'bridge session mismatch')
    assert.equal(env.modules.state.bridgeLeaseMismatchReason(freshLease, {
      memberName: 'durable-worker',
      sessionFile: '/tmp/durable-bridge-worker.jsonl',
      protocolVersion: 999,
      packageVersion: '0.5.1-test',
      generation: 7,
      now: durableNow,
    }), 'bridge protocol mismatch')
    assert.equal(env.modules.state.bridgeLeaseMismatchReason(freshLease, {
      memberName: 'durable-worker',
      sessionFile: '/tmp/durable-bridge-worker.jsonl',
      protocolVersion: 1,
      packageVersion: 'other-version',
      generation: 7,
      now: durableNow,
    }), 'bridge package mismatch')
    const migratedBridgeStore = env.modules.bridgeStore.normalizeBridgeLeaseStore({ version: 1, leases: { wrongKey: { ...freshLease }, bad: { bridgeId: '' } } })
    assert.deepEqual(Object.keys(migratedBridgeStore.leases), ['durable-worker'], 'bridge store migration should key by lease member and ignore malformed leases')
    const removedLease = env.modules.state.removeBridgeLease(durableTeam.name, 'missing-worker')
    assert.equal(removedLease, null, 'removing a missing bridge lease should be a safe no-op')

    const deliveryRequest = env.modules.state.createDeliveryRequest({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      messageIds: ['m1', 'm2'],
      requestedBy: 'team-lead',
      reason: 'unit test delivery request',
      expiresAt: durableNow + 10_000,
      now: durableNow,
    })
    assert.equal(deliveryRequest.status, 'pending')
    assert.equal(env.modules.state.getDeliveryRequest(durableTeam.name, deliveryRequest.requestId).status, 'pending')
    assert.equal(env.modules.deliveryStore.requestHasExpired(deliveryRequest, durableNow), false)
    assert.equal(env.modules.deliveryStore.eligibleToDeliver({ request: deliveryRequest, lease: freshLease, member: { status: 'idle' }, now: durableNow }), true, 'fresh pending request and bridge should be eligible')
    assert.equal(env.modules.deliveryStore.eligibleToDeliver({ request: deliveryRequest, lease: freshLease, member: { status: 'running' }, now: durableNow }), false, 'running worker should not be eligible for new delivery')
    assert.equal(env.modules.deliveryStore.eligibleToDeliver({ request: deliveryRequest, lease: { ...freshLease, expiresAt: durableNow - 1 }, member: { status: 'idle' }, now: durableNow }), false, 'stale bridge should block delivery eligibility')

    const claimedRequest = env.modules.state.claimDeliveryRequest(durableTeam.name, deliveryRequest.requestId, {
      bridgeId: freshLease.bridgeId,
      generation: freshLease.generation,
      claimTtlMs: 500,
      now: durableNow,
    })
    assert.equal(claimedRequest.status, 'claimed')
    assert.equal(env.modules.deliveryStore.activeClaim(claimedRequest, durableNow + 100).bridgeId, freshLease.bridgeId)
    assert.equal(env.modules.deliveryStore.activeClaim(claimedRequest, durableNow + 501), null, 'expired claim should not be active')
    assert.equal(env.modules.deliveryStore.eligibleToDeliver({ request: claimedRequest, lease: freshLease, member: { status: 'idle' }, now: durableNow + 100 }), false, 'claimed request should not be eligible as pending')

    let transitionedRequest = env.modules.state.transitionDeliveryRequest(durableTeam.name, deliveryRequest.requestId, 'submitted', { now: durableNow + 200 })
    assert.equal(transitionedRequest.status, 'submitted')
    assert.ok(transitionedRequest.submittedAt, 'submitted transition should timestamp submittedAt')
    transitionedRequest = env.modules.state.transitionDeliveryRequest(durableTeam.name, deliveryRequest.requestId, 'started', { now: durableNow + 300 })
    assert.equal(transitionedRequest.status, 'started')
    assert.ok(transitionedRequest.startedAt, 'started transition should timestamp startedAt')
    transitionedRequest = env.modules.state.transitionDeliveryRequest(durableTeam.name, deliveryRequest.requestId, 'completed', { now: durableNow + 400 })
    assert.equal(transitionedRequest.status, 'completed')
    assert.ok(transitionedRequest.completedAt, 'completed transition should timestamp completedAt')
    assert.equal(env.modules.deliveryStore.requestHasExpired({ ...transitionedRequest, expiresAt: durableNow - 1 }, durableNow), false, 'terminal completed request should not be expired by TTL')
    assert.equal(env.modules.deliveryStore.activeClaim(transitionedRequest, durableNow + 401), null, 'terminal request should not have an active claim')

    const deliveryRequestService = env.helpers.requireDist('runtime/deliveryRequestService.js')
    const serviceRequest = deliveryRequestService.requestOrRefreshDelivery({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      messageIds: ['svc-1'],
      expiresAt: durableNow + 20_000,
      now: durableNow + 1_000,
    })
    assert.equal(serviceRequest.ok, true, 'delivery service should create pending request')
    assert.equal(serviceRequest.request.status, 'pending')
    const illegalSubmit = deliveryRequestService.markDeliverySubmitted(durableTeam.name, serviceRequest.request.requestId, { now: durableNow + 1_001 })
    assert.equal(illegalSubmit.ok, false, 'pending -> submitted should be guarded')
    assert.ok(illegalSubmit.reason.includes('illegal delivery request transition pending -> submitted'))
    assert.equal(env.modules.state.getDeliveryRequest(durableTeam.name, serviceRequest.request.requestId).status, 'pending', 'illegal transition must not mutate request')
    const serviceClaim = deliveryRequestService.claimNextDelivery({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      bridgeId: freshLease.bridgeId,
      generation: freshLease.generation,
      promptHash: 'svc-hash',
      messageIds: ['svc-1'],
      claimTtlMs: 500,
      now: durableNow + 1_002,
    })
    assert.equal(serviceClaim.ok, true, 'delivery service should claim pending request')
    assert.equal(serviceClaim.request.status, 'claimed')
    assert.ok(env.modules.deliveryStore.activeClaim(serviceClaim.request, durableNow + 1_003), 'service claim should be active inside TTL')
    assert.equal(env.modules.deliveryStore.activeClaim(serviceClaim.request, durableNow + 2_000), null, 'service claim should expire after TTL')
    const mismatchSubmit = deliveryRequestService.markDeliverySubmitted(durableTeam.name, serviceClaim.request.requestId, { claimId: 'wrong-claim', now: durableNow + 1_004 })
    assert.equal(mismatchSubmit.ok, false, 'claim mismatch should be guarded')
    assert.equal(mismatchSubmit.reason, 'delivery request claim mismatch')
    assert.equal(env.modules.state.getDeliveryRequest(durableTeam.name, serviceClaim.request.requestId).status, 'claimed', 'claim mismatch must not mutate request')
    const submittedByService = deliveryRequestService.markDeliverySubmitted(durableTeam.name, serviceClaim.request.requestId, { claimId: serviceClaim.request.claim.claimId, now: durableNow + 1_005 })
    assert.equal(submittedByService.ok, true)
    assert.equal(submittedByService.request.status, 'submitted')
    const startedByService = deliveryRequestService.markDeliveryStarted(durableTeam.name, serviceClaim.request.requestId, { now: durableNow + 1_006 })
    assert.equal(startedByService.ok, true)
    assert.equal(startedByService.request.status, 'started')
    const completedByService = deliveryRequestService.markDeliveryCompleted(durableTeam.name, serviceClaim.request.requestId, { now: durableNow + 1_007 })
    assert.equal(completedByService.ok, true)
    assert.equal(completedByService.request.status, 'completed')
    const failedTerminal = deliveryRequestService.markDeliveryFailed(durableTeam.name, serviceClaim.request.requestId, { error: 'too late', now: durableNow + 1_008 })
    assert.equal(failedTerminal.ok, false, 'terminal completed -> failed should be guarded')
    assert.ok(failedTerminal.reason.includes('illegal delivery request transition completed -> failed'))
    const cancelTerminal = deliveryRequestService.cancelDelivery(durableTeam.name, serviceClaim.request.requestId, { now: durableNow + 1_009 })
    assert.equal(cancelTerminal.ok, false, 'terminal completed -> cancelled should be guarded')

    const recoveryRequest = deliveryRequestService.requestOrRefreshDelivery({
      teamName: durableTeam.name,
      memberName: 'ttl-recovery-worker',
      messageIds: ['recover-1'],
      bootPrompt: 'recover boot',
      requestedBy: 'team-lead',
      reason: 'claim recovery test',
      expiresAt: durableNow + 10_000,
      now: durableNow + 2_000,
    })
    const recoveryClaim = deliveryRequestService.claimNextDelivery({
      teamName: durableTeam.name,
      memberName: 'ttl-recovery-worker',
      bridgeId: freshLease.bridgeId,
      generation: freshLease.generation,
      promptHash: 'recover-hash',
      messageIds: ['recover-1'],
      claimTtlMs: 100,
      now: durableNow + 2_010,
    })
    assert.equal(recoveryClaim.ok, true, 'fresh recovery request should claim')
    const recoveredMaintenance = deliveryRequestService.maintainDeliveryRequests(durableTeam.name, durableNow + 2_200)
    assert.equal(recoveredMaintenance.ok, true)
    assert.ok(recoveredMaintenance.recovered.some(request => request.requestId === recoveryRequest.request.requestId), 'expired claim should recover while request TTL remains live')
    const recoveredStored = env.modules.state.getDeliveryRequest(durableTeam.name, recoveryRequest.request.requestId)
    assert.equal(recoveredStored.status, 'pending')
    assert.deepEqual(recoveredStored.messageIds, ['recover-1'])
    assert.equal(recoveredStored.bootPrompt, 'recover boot')
    assert.equal(recoveredStored.requestedBy, 'team-lead')
    assert.equal(recoveredStored.reason, 'claim recovery test')
    assert.equal(recoveredStored.createdAt, recoveryRequest.request.createdAt)
    assert.equal(recoveredStored.expiresAt, durableNow + 10_000)
    assert.equal(recoveredStored.claim, undefined, 'recovered claim should clear claim')
    assert.equal(recoveredStored.promptHash, undefined, 'recovered claim should clear promptHash')
    const reclaimed = deliveryRequestService.claimNextDelivery({
      teamName: durableTeam.name,
      memberName: 'ttl-recovery-worker',
      bridgeId: freshLease.bridgeId,
      generation: freshLease.generation + 1,
      promptHash: 'recover-hash-2',
      messageIds: ['recover-1'],
      claimTtlMs: 500,
      now: durableNow + 2_300,
    })
    assert.equal(reclaimed.ok, true, 'recovered pending request should be claimable again')
    assert.equal(reclaimed.request.requestId, recoveryRequest.request.requestId)

    const claimAndRequestExpired = deliveryRequestService.requestOrRefreshDelivery({
      teamName: durableTeam.name,
      memberName: 'ttl-claim-request-expired-worker',
      messageIds: ['claim-request-expired'],
      expiresAt: durableNow + 3_100,
      now: durableNow + 3_000,
    })
    const claimAndRequestExpiredClaim = deliveryRequestService.claimNextDelivery({
      teamName: durableTeam.name,
      memberName: 'ttl-claim-request-expired-worker',
      bridgeId: freshLease.bridgeId,
      generation: freshLease.generation + 2,
      promptHash: 'claim-request-expired-hash',
      messageIds: ['claim-request-expired'],
      claimTtlMs: 50,
      now: durableNow + 3_010,
    })
    assert.equal(claimAndRequestExpiredClaim.ok, true)
    const claimAndRequestExpiredMaintenance = deliveryRequestService.maintainDeliveryRequests(durableTeam.name, durableNow + 3_200)
    assert.ok(claimAndRequestExpiredMaintenance.expired.some(request => request.requestId === claimAndRequestExpired.request.requestId), 'claimed request past request TTL should expire')
    assert.equal(env.modules.state.getDeliveryRequest(durableTeam.name, claimAndRequestExpired.request.requestId).status, 'expired')

    const openExpired = deliveryRequestService.requestOrRefreshDelivery({
      teamName: durableTeam.name,
      memberName: 'ttl-pending-expired-worker',
      messageIds: ['pending-expired'],
      expiresAt: durableNow + 4_100,
      now: durableNow + 4_000,
    })
    const openExpiredMaintenance = deliveryRequestService.maintainDeliveryRequests(durableTeam.name, durableNow + 4_200)
    assert.ok(openExpiredMaintenance.expired.some(request => request.requestId === openExpired.request.requestId), 'pending request past request TTL should expire')
    assert.equal(env.modules.state.getDeliveryRequest(durableTeam.name, openExpired.request.requestId).status, 'expired')

    const submittedPastTtl = deliveryRequestService.requestOrRefreshDelivery({
      teamName: durableTeam.name,
      memberName: 'ttl-submitted-worker',
      messageIds: ['submitted-past-ttl'],
      expiresAt: durableNow + 5_100,
      now: durableNow + 5_000,
    })
    const submittedPastTtlClaim = deliveryRequestService.claimNextDelivery({
      teamName: durableTeam.name,
      memberName: 'ttl-submitted-worker',
      bridgeId: freshLease.bridgeId,
      generation: freshLease.generation + 3,
      promptHash: 'submitted-past-ttl-hash',
      messageIds: ['submitted-past-ttl'],
      claimTtlMs: 1_000,
      now: durableNow + 5_010,
    })
    assert.equal(submittedPastTtlClaim.ok, true)
    assert.equal(deliveryRequestService.markDeliverySubmitted(durableTeam.name, submittedPastTtl.request.requestId, { claimId: submittedPastTtlClaim.request.claim.claimId, now: durableNow + 5_020 }).ok, true)
    const submittedMaintenance = deliveryRequestService.maintainDeliveryRequests(durableTeam.name, durableNow + 5_200)
    assert.ok(!submittedMaintenance.expired.some(request => request.requestId === submittedPastTtl.request.requestId), 'submitted request past request TTL should not auto-expire')
    assert.equal(env.modules.state.getDeliveryRequest(durableTeam.name, submittedPastTtl.request.requestId).status, 'submitted')
    assert.equal(deliveryRequestService.markDeliveryStarted(durableTeam.name, submittedPastTtl.request.requestId, { now: durableNow + 5_300 }).ok, true)
    assert.equal(deliveryRequestService.markDeliveryCompleted(durableTeam.name, submittedPastTtl.request.requestId, { now: durableNow + 5_400 }).ok, true, 'submitted/started past request TTL should still close')

    const startedPastTtl = deliveryRequestService.requestOrRefreshDelivery({
      teamName: durableTeam.name,
      memberName: 'ttl-started-worker',
      messageIds: ['started-past-ttl'],
      expiresAt: durableNow + 6_100,
      now: durableNow + 6_000,
    })
    const startedPastTtlClaim = deliveryRequestService.claimNextDelivery({
      teamName: durableTeam.name,
      memberName: 'ttl-started-worker',
      bridgeId: freshLease.bridgeId,
      generation: freshLease.generation + 4,
      promptHash: 'started-past-ttl-hash',
      messageIds: ['started-past-ttl'],
      claimTtlMs: 1_000,
      now: durableNow + 6_010,
    })
    assert.equal(startedPastTtlClaim.ok, true)
    assert.equal(deliveryRequestService.markDeliverySubmitted(durableTeam.name, startedPastTtl.request.requestId, { claimId: startedPastTtlClaim.request.claim.claimId, now: durableNow + 6_020 }).ok, true)
    assert.equal(deliveryRequestService.markDeliveryStarted(durableTeam.name, startedPastTtl.request.requestId, { now: durableNow + 6_030 }).ok, true)
    const startedMaintenance = deliveryRequestService.maintainDeliveryRequests(durableTeam.name, durableNow + 6_200)
    assert.ok(!startedMaintenance.expired.some(request => request.requestId === startedPastTtl.request.requestId), 'started request past request TTL should not auto-expire')
    assert.equal(env.modules.state.getDeliveryRequest(durableTeam.name, startedPastTtl.request.requestId).status, 'started')
    assert.equal(deliveryRequestService.markDeliveryCompleted(durableTeam.name, startedPastTtl.request.requestId, { now: durableNow + 6_300 }).ok, true)

    const expiredRefreshOriginal = deliveryRequestService.requestOrRefreshDelivery({
      teamName: durableTeam.name,
      memberName: 'ttl-expired-refresh-worker',
      messageIds: ['expired-refresh-old'],
      expiresAt: durableNow + 7_100,
      now: durableNow + 7_000,
    })
    deliveryRequestService.maintainDeliveryRequests(durableTeam.name, durableNow + 7_200)
    assert.equal(env.modules.state.getDeliveryRequest(durableTeam.name, expiredRefreshOriginal.request.requestId).status, 'expired')
    const expiredRefreshNew = deliveryRequestService.requestOrRefreshDelivery({
      teamName: durableTeam.name,
      memberName: 'ttl-expired-refresh-worker',
      messageIds: ['expired-refresh-new'],
      expiresAt: durableNow + 8_000,
      now: durableNow + 7_300,
    })
    assert.equal(expiredRefreshNew.ok, true)
    assert.notEqual(expiredRefreshNew.request.requestId, expiredRefreshOriginal.request.requestId, 'refresh after expired pending should create a new request')
    assert.equal(expiredRefreshNew.request.status, 'pending')
    assert.equal(env.modules.state.getDeliveryRequest(durableTeam.name, expiredRefreshOriginal.request.requestId).status, 'expired')


    const migratedDeliveryStore = env.modules.deliveryStore.normalizeDeliveryRequestStore({ version: 1, requests: { [deliveryRequest.requestId]: deliveryRequest, malformed: { status: 'pending' } } })
    assert.deepEqual(Object.keys(migratedDeliveryStore.requests), [deliveryRequest.requestId], 'delivery store migration should ignore malformed requests')

    const expiringRequest = env.modules.state.createDeliveryRequest({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      messageIds: ['m3'],
      expiresAt: durableNow - 1,
      now: durableNow - 1000,
    })
    assert.equal(env.modules.deliveryStore.requestHasExpired(expiringRequest, durableNow), true)
    const expiredRequests = env.modules.state.expireStaleDeliveryRequests(durableTeam.name, durableNow)
    assert.ok(expiredRequests.some(item => item.requestId === expiringRequest.requestId), 'expire helper should return expired requests')
    const storedExpiredRequest = env.modules.state.getDeliveryRequest(durableTeam.name, expiringRequest.requestId)
    assert.equal(storedExpiredRequest.status, 'expired')
    assert.equal(env.modules.deliveryStore.requestHasExpired(storedExpiredRequest, durableNow + 1), true, 'expired status should remain expired')
    assert.equal(env.modules.deliveryStore.safeIdle({ member: { status: 'idle' }, hasPendingMessages: false, hasActiveRequest: false }), true)
    assert.equal(env.modules.deliveryStore.safeIdle({ member: { status: 'idle' }, hasPendingMessages: true, hasActiveRequest: false }), false)
    assert.equal(env.modules.deliveryStore.safeIdle({ member: { status: 'pending_delivery' }, hasPendingMessages: false, hasActiveRequest: false }), false)
    assert.equal(env.modules.state.readMailbox(durableTeam.name, 'durable-worker').length, 0, 'durable delivery state helpers should not touch mailbox/read lifecycle')
    assert.equal(env.modules.runtimeBridge.publishBridgeLease({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      sessionFile: '/tmp/wrong-durable-session.jsonl',
      now: durableNow + 19_000,
    }), null, 'mismatched publish session should be rejected')

    const publishedLease = env.modules.runtimeBridge.publishBridgeLease({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      sessionFile: '/tmp/durable-bridge-worker.jsonl',
      now: durableNow + 20_000,
    })
    assert.ok(publishedLease.bridgeId, 'published lease should include bridgeId')
    assert.equal(publishedLease.protocolVersion, env.modules.runtimeBridge.BRIDGE_PROTOCOL_VERSION)
    assert.equal(publishedLease.packageVersion, env.modules.runtimeBridge.BRIDGE_PACKAGE_VERSION)
    assert.equal(publishedLease.pid, process.pid)
    assert.equal(publishedLease.processIdentity.includes(`pid:${process.pid}`), true)
    assert.ok(publishedLease.capabilities.includes('lease.publish'))
    assert.equal(env.modules.runtimeBridge.bridgeLeaseReadyForMember(env.modules.state.readTeamState(durableTeam.name), 'durable-worker', publishedLease, durableNow + 20_001), true)
    const heartbeatLease = env.modules.runtimeBridge.heartbeatBridgeLease({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      bridgeId: publishedLease.bridgeId,
      generation: publishedLease.generation,
      sessionFile: publishedLease.sessionFile,
      now: durableNow + 30_000,
    })
    assert.equal(heartbeatLease.lastSeenAt, durableNow + 30_000, 'heartbeat should refresh lease lastSeenAt in runtime.json bridge section')
    assert.equal(heartbeatLease.expiresAt > publishedLease.expiresAt, true, 'heartbeat should extend lease expiry')
    const directPublishedLease = env.helpers.requireDist('runtime/bridgeLease.js').publishBridgeLease({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      sessionFile: '/tmp/durable-bridge-worker.jsonl',
      now: durableNow + 30_010,
    })
    assert.equal(directPublishedLease.generation, publishedLease.generation + 1, 'focused bridgeLease module should expose publish behavior')
    assert.equal(env.modules.runtimeBridge.heartbeatBridgeLease({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      bridgeId: 'wrong-bridge',
      generation: publishedLease.generation,
      sessionFile: publishedLease.sessionFile,
      now: durableNow + 31_000,
    }), null, 'mismatched bridgeId should not heartbeat current lease')
    assert.equal(env.modules.runtimeBridge.heartbeatBridgeLease({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      bridgeId: publishedLease.bridgeId,
      generation: publishedLease.generation,
      sessionFile: '/tmp/mismatched-session.jsonl',
      now: durableNow + 31_000,
    }), null, 'mismatched session should not heartbeat current lease')
    const duplicateLease = env.modules.runtimeBridge.publishBridgeLease({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      sessionFile: '/tmp/durable-bridge-worker.jsonl',
      now: durableNow + 40_000,
    })
    assert.notEqual(duplicateLease.bridgeId, directPublishedLease.bridgeId, 'duplicate session start should rotate bridgeId')
    assert.equal(duplicateLease.generation, directPublishedLease.generation + 1, 'duplicate session start should increment generation')
    assert.equal(env.modules.runtimeBridge.heartbeatBridgeLease({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      bridgeId: publishedLease.bridgeId,
      generation: publishedLease.generation,
      sessionFile: publishedLease.sessionFile,
      now: durableNow + 41_000,
    }), null, 'old generation heartbeat should be ignored after duplicate lease publish')
    assert.equal(env.helpers.requireDist('runtime/bridgeLease.js').heartbeatBridgeLease({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      bridgeId: duplicateLease.bridgeId,
      generation: duplicateLease.generation,
      sessionFile: duplicateLease.sessionFile,
      now: durableNow + 41_500,
    }).generation, duplicateLease.generation, 'focused bridgeLease module should expose heartbeat behavior')
    const expiredBridgeLease = env.modules.state.upsertBridgeLease(durableTeam.name, {
      ...duplicateLease,
      lastSeenAt: durableNow + 40_000,
      expiresAt: durableNow + 40_001,
    })
    const expiredLeases = env.modules.runtimeBridge.expireStaleBridgeLeases(durableTeam.name, durableNow + 50_000)
    assert.ok(expiredLeases.some(item => item.bridgeId === expiredBridgeLease.bridgeId), 'stale bridge lease should be expired/removed')
    assert.equal(env.modules.state.getBridgeLease(durableTeam.name, 'durable-worker'), null, 'expired bridge lease should be removed from runtime.json bridge section')
    const durableMemberAfterExpire = env.modules.state.readTeamState(durableTeam.name).members['durable-worker']
    assert.equal(durableMemberAfterExpire.bridgeAvailable, false, 'expired bridge lease should mirror stale status to member')
    assert.equal(durableMemberAfterExpire.bridgeLastError, 'bridge lease expired')
    const stoppedLease = env.modules.runtimeBridge.publishBridgeLease({
      teamName: durableTeam.name,
      memberName: 'durable-worker',
      sessionFile: '/tmp/durable-bridge-worker.jsonl',
      now: durableNow + 60_000,
    })
    env.modules.runtimeBridge.markBridgeStopped(durableTeam.name, 'durable-worker', durableNow + 61_000)
    assert.equal(env.modules.state.getBridgeLease(durableTeam.name, 'durable-worker'), null, 'bridge stop should clear active lease')
    assert.equal(env.modules.state.readTeamState(durableTeam.name).members['durable-worker'].bridgeAvailable, false, 'bridge stop should mirror unavailable status')
    assert.equal(stoppedLease.memberName, 'durable-worker')
    const stateBeforeMissingStop = env.modules.state.readTeamState(durableTeam.name).members['durable-worker']
    env.modules.runtimeBridge.markBridgeStopped(durableTeam.name, 'missing-worker', durableNow + 62_000)
    assert.deepEqual(env.modules.state.readTeamState(durableTeam.name).members['durable-worker'], stateBeforeMissingStop, 'stopping missing worker bridge should not churn team state')

  },
}
