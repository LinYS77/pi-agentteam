const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function makeTeam(modules, name) {
  modules.state.deleteTeamState(name)
  const team = modules.state.createInitialTeamState({
    teamName: name,
    leaderSessionFile: '/tmp/leader-phase0.jsonl',
    leaderCwd: '/tmp/project-phase0',
  })
  modules.state.upsertMember(team, {
    name: 'worker-a',
    role: 'implementer',
    cwd: '/tmp/project-phase0',
    sessionFile: '/tmp/worker-a-phase0.jsonl',
    paneId: '%phase0-worker-a',
    windowTarget: 'test:@1',
    status: 'idle',
    createdAt: 1,
    updatedAt: 1,
  })
  modules.state.writeTeamState(team)
  return modules.state.readTeamState(name)
}

function publishLease(modules, teamName, memberName, sessionFile, now) {
  return modules.runtimeBridge.publishBridgeLease({ teamName, memberName, sessionFile, now })
}

module.exports = {
  name: 'phase0 characterization safety net',
  async run(env) {
    const { modules, helpers } = env
    const now = 1_700_000_000_000

    assert.equal(modules.runtimeBridge.BRIDGE_PACKAGE_VERSION, '0.6.3', 'bridge package version should match approved v0.6.3 release target; npm v0.5.0 remains documented rollback baseline')

    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'))
    assert.equal(packageJson.version, '0.6.3', 'package version should match approved v0.6.3 release target while v0.5.0 remains the documented rollback baseline')

    const root = path.resolve(__dirname, '..', '..')
    const deliverySource = fs.readFileSync(path.join(root, 'adapters', 'bridge', 'delivery.ts'), 'utf8')
    const bridgeSource = fs.readFileSync(path.join(root, 'runtime', 'bridgeDeliveryPump.ts'), 'utf8')
    assert.ok(!deliverySource.includes('send-keys'), 'bridge-only delivery must not use tmux send-keys transport')
    assert.ok(!deliverySource.includes('paste-buffer'), 'bridge-only delivery must not use tmux paste-buffer transport')
    assert.ok(!bridgeSource.includes('send-keys'), 'bridge runtime must not use tmux send-keys transport')
    assert.ok(!bridgeSource.includes('paste-buffer'), 'bridge runtime must not use tmux paste-buffer transport')

    // worker status truth: requesting delivery while already running must preserve running.
    let team = makeTeam(modules, 'phase0-running-preserved')
    modules.state.updateTeamState(team.name, latest => {
      latest.members['worker-a'].status = 'running'
      latest.members['worker-a'].lastWakeReason = 'processing prompt'
    })
    team = modules.state.readTeamState(team.name)
    const runningRequest = helpers.createBridgeDeliveryRequest(team.name, 'worker-a', {
      bootPrompt: 'keep working',
      requestedBy: 'team-lead',
      reason: 'phase0 running request',
      now,
    })
    team = modules.state.readTeamState(team.name)
    assert.equal(team.members['worker-a'].status, 'running')
    assert.equal(team.members['worker-a'].lastWakeReason, 'bridge delivery pending while running')
    assert.equal(runningRequest.status, 'pending')

    // delivery request lifecycle + side-effect order: request stays pending until bridge submits.
    team = makeTeam(modules, 'phase0-delivery-lifecycle')
    publishLease(modules, team.name, 'worker-a', '/tmp/worker-a-phase0.jsonl', now)
    const request = helpers.createBridgeDeliveryRequest(team.name, 'worker-a', {
      bootPrompt: 'implement task',
      requestedBy: 'team-lead',
      reason: 'phase0 lifecycle',
      now: now + 1,
    })
    let member = modules.state.readTeamState(team.name).members['worker-a']
    assert.equal(member.status, 'pending_delivery')
    assert.equal(member.bridgeWorkRequestedAt, now + 1)
    assert.equal(member.bridgeWorkRequestBootPrompt, 'implement task')
    assert.equal(modules.state.getDeliveryRequest(team.name, request.requestId).status, 'pending')

    const sent = []
    const pumpResult = await modules.runtimeBridge.pumpBridgeOnce({
      teamName: team.name,
      memberName: 'worker-a',
      now: now + 2,
      ctx: {
        isIdle: () => true,
        hasPendingMessages: () => false,
        sendUserMessage: async content => { sent.push(content) },
      },
    })
    assert.equal(pumpResult.ok, true)
    assert.equal(pumpResult.reason, 'bridge submitted prompt')
    assert.equal(sent.length, 1)
    const submitted = modules.state.getDeliveryRequest(team.name, request.requestId)
    assert.equal(submitted.status, 'submitted')
    assert.ok(submitted.claim, 'submitted request keeps claim metadata')
    member = modules.state.readTeamState(team.name).members['worker-a']
    assert.equal(member.status, 'queued')
    assert.equal(member.bridgeWorkRequestedAt, undefined, 'work request marker is cleared after submit')
    assert.equal(member.lastWakeReason, 'bridge submitted prompt')

    const start = modules.runtimeBridge.markBridgeAgentStart(team.name, 'worker-a', now + 3)
    assert.equal(start.status, 'running')
    assert.equal(start.request.requestId, request.requestId)
    assert.equal(modules.state.getDeliveryRequest(team.name, request.requestId).status, 'started')
    member = modules.state.readTeamState(team.name).members['worker-a']
    assert.equal(member.status, 'running')
    assert.equal(member.lastWakeReason, 'bridge delivery started')

    const end = modules.runtimeBridge.markBridgeAgentEnd(team.name, 'worker-a', { isIdle: () => true, hasPendingMessages: () => false }, now + 4)
    assert.equal(end.status, 'idle')
    assert.equal(end.request.requestId, request.requestId)
    assert.equal(modules.state.getDeliveryRequest(team.name, request.requestId).status, 'completed')
    member = modules.state.readTeamState(team.name).members['worker-a']
    assert.equal(member.status, 'idle')
    assert.equal(member.lastWakeReason, 'finished turn')

    const pendingAfterEnd = helpers.createBridgeDeliveryRequest(team.name, 'worker-a', {
      bootPrompt: 'next task',
      requestedBy: 'team-lead',
      reason: 'phase0 pending after end',
      now: now + 5,
    })
    modules.state.transitionDeliveryRequest(team.name, pendingAfterEnd.requestId, 'claimed', { now: now + 6 })
    modules.state.transitionDeliveryRequest(team.name, pendingAfterEnd.requestId, 'submitted', { now: now + 7 })
    modules.state.transitionDeliveryRequest(team.name, pendingAfterEnd.requestId, 'started', { now: now + 8 })
    const drainingEnd = modules.runtimeBridge.markBridgeAgentEnd(team.name, 'worker-a', { isIdle: () => false, hasPendingMessages: () => true }, now + 9)
    assert.equal(drainingEnd.status, 'draining')
    assert.equal(modules.state.getDeliveryRequest(team.name, pendingAfterEnd.requestId).status, 'completed')

    // native busy should leave a pending request pending and report pending_delivery.
    team = makeTeam(modules, 'phase0-native-busy')
    publishLease(modules, team.name, 'worker-a', '/tmp/worker-a-phase0.jsonl', now)
    const busyRequest = helpers.createBridgeDeliveryRequest(team.name, 'worker-a', {
      bootPrompt: 'busy task',
      requestedBy: 'team-lead',
      reason: 'phase0 busy',
      now: now + 10,
    })
    const busyResult = await modules.runtimeBridge.pumpBridgeOnce({
      teamName: team.name,
      memberName: 'worker-a',
      now: now + 11,
      ctx: { isIdle: () => false, hasPendingMessages: () => true },
    })
    assert.equal(busyResult.ok, false)
    assert.equal(busyResult.reason, 'native session busy for bridge delivery')
    assert.equal(modules.state.getDeliveryRequest(team.name, busyRequest.requestId).status, 'pending')
    assert.equal(modules.state.readTeamState(team.name).members['worker-a'].status, 'pending_delivery')

    // leader attention/read boundary: projection request only touches leader status; mailbox remains unread.
    team = makeTeam(modules, 'phase0-leader-projection')
    const beforeMailbox = modules.state.peekUnreadMailbox(team.name, modules.types.TEAM_LEAD)
    assert.equal(beforeMailbox.length, 0)
    const projection = await modules.runtimeDelivery.requestLeaderAttentionIfNeeded(team, { type: 'report_blocked', wakeHint: 'hard', from: 'worker-a', text: 'blocked' })
    assert.equal(projection.ok, true)
    assert.equal(projection.method, 'leader_attention_requested')
    const projectedTeam = modules.state.readTeamState(team.name)
    assert.equal(projectedTeam.members[modules.types.TEAM_LEAD].lastWakeReason, 'leader attention requested report_blocked')
    assert.equal(modules.state.peekUnreadMailbox(team.name, modules.types.TEAM_LEAD).length, 0, 'projection request must not mark/read mailbox entries')

    const claim = modules.state.claimLeaderProjection(team.name, 'msg-1', 'rev-1', now)
    assert.equal(claim.status, 'projecting')
    assert.equal(claim.attempts, 1)
    assert.equal(modules.state.claimLeaderProjection(team.name, 'msg-1', 'rev-1', now + 1), null, 'active projection claim prevents duplicate projection')
    const marked = modules.state.markLeaderProjectionProjected(team.name, claim.projectionKey, now + 2)
    assert.equal(marked.status, 'projected')
    assert.equal(modules.state.getLeaderProjection(team.name, 'msg-1', 'rev-1').status, 'projected')

    // Failure keeps error truth and moves non-running worker back to queued.
    team = makeTeam(modules, 'phase0-delivery-failure')
    publishLease(modules, team.name, 'worker-a', '/tmp/worker-a-phase0.jsonl', now)
    const failedRequest = helpers.createBridgeDeliveryRequest(team.name, 'worker-a', { bootPrompt: 'fail task', now: now + 20 })
    const failed = await modules.runtimeBridge.pumpBridgeOnce({
      teamName: team.name,
      memberName: 'worker-a',
      now: now + 21,
      ctx: {
        isIdle: () => true,
        hasPendingMessages: () => false,
        sendUserMessage: async () => { throw new Error('simulated native failure') },
      },
    })
    assert.equal(failed.ok, false)
    assert.equal(failed.reason, 'bridge delivery failed')
    assert.equal(modules.state.getDeliveryRequest(team.name, failedRequest.requestId).status, 'failed')
    member = modules.state.readTeamState(team.name).members['worker-a']
    assert.equal(member.status, 'queued')
    assert.equal(member.lastError, 'simulated native failure')
    assert.equal(member.bridgeLastError, 'simulated native failure')

    // Session shutdown clears lease and moves non-error workers offline while preserving error truth.
    modules.runtimeBridge.markBridgeStopped(team.name, 'worker-a', now + 22, 'normal_shutdown')
    member = modules.state.readTeamState(team.name).members['worker-a']
    assert.equal(member.bridgeAvailable, false)
    assert.equal(member.status, 'offline')
    assert.equal(member.lastError, 'simulated native failure')

    helpers.assertContains(fs.readFileSync(path.join(root, 'docs', 'baseline-v0.5.0.md'), 'utf8'), 'npm install pi-agentteam@0.5.0')
  },
}
