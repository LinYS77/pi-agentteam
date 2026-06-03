const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-layout-${name}-`))
  try {
    process.env.PI_AGENTTEAM_HOME = home
    modules.state.invalidateSessionContextCache()
    return await fn(home)
  } finally {
    modules.state.invalidateSessionContextCache()
    process.env.PI_AGENTTEAM_HOME = previousHome
    fs.rmSync(home, { recursive: true, force: true })
  }
}

function createFreshTeam(modules, teamName) {
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
  return team
}

function vnextTeamFixture(modules, teamName) {
  const now = Date.now()
  return {
    version: 1,
    name: modules.state.sanitizeName(teamName),
    createdAt: now,
    leaderSessionFile: `/tmp/${teamName}-leader.jsonl`,
    leaderCwd: `/tmp/${teamName}`,
    members: {
      'team-lead': {
        name: 'team-lead',
        role: 'leader',
        cwd: `/tmp/${teamName}`,
        sessionFile: `/tmp/${teamName}-leader.jsonl`,
        status: 'idle',
        createdAt: now,
        updatedAt: now,
      },
    },
    tasks: {},
    events: [],
    taskReports: {},
    taskEvents: {},
    taskMessageRefs: {},
    nextTaskSeq: 1,
    nextTaskReportSeq: 1,
    nextTaskEventSeq: 1,
    nextTaskMessageRefSeq: 1,
    revision: 1,
    memberTombstones: {},
  }
}

module.exports = {
  name: 'vNext data layout paths',
  async run(env) {
    const { modules } = env

    await withTempHome(modules, 'fresh-writes', home => {
      const team = createFreshTeam(modules, 'layout-fresh-suite')
      modules.state.ensureMailbox(team.name, 'team-lead')
      modules.state.pushMailboxMessage(team.name, 'worker-a', {
        from: 'team-lead',
        to: 'worker-a',
        text: 'fresh inbox write',
        type: 'assignment',
      })
      modules.state.enqueueOutboxEffect({
        teamName: team.name,
        kind: 'append_event_requested',
        idempotencyKey: 'layout:fresh:outbox',
        payload: {
          teamName: team.name,
          event: { type: 'message', actor: 'team-lead', text: 'layout outbox event' },
        },
      })
      const layoutNow = 2_000_000
      modules.state.upsertBridgeLease(team.name, {
        memberName: 'worker-a',
        bridgeId: 'layout-bridge-1',
        protocolVersion: 1,
        packageVersion: '0.5.1-test',
        sessionFile: `/tmp/${team.name}-worker-a.jsonl`,
        startedAt: layoutNow,
        lastSeenAt: layoutNow,
        expiresAt: layoutNow + 60_000,
        generation: 1,
        capabilities: ['deliver.prompt'],
      })
      const runtimeDeliveryRequest = modules.state.createDeliveryRequest({
        teamName: team.name,
        memberName: 'worker-a',
        messageIds: ['layout-message-1'],
        requestedBy: 'team-lead',
        reason: 'layout runtime request',
        now: layoutNow + 1,
      })
      const runtimeProjection = modules.state.claimLeaderProjection(team.name, 'layout-leader-message-1', 'layout-generation-1', layoutNow + 2)
      assert.ok(runtimeProjection, 'fresh runtime projection claim should be stored in runtime.json')
      modules.state.markLeaderProjectionFailed(team.name, runtimeProjection.projectionKey, 'layout projection retry diagnostic', layoutNow + 3)
      const runtimeAttention = modules.state.claimLeaderAttention(team.name, 'layout-leader-message-1', 'layout-generation-1', layoutNow + 4)
      assert.ok(runtimeAttention, 'fresh runtime attention claim should be stored in runtime.json')
      modules.state.markLeaderAttentionFailed(team.name, runtimeAttention.attentionKey, 'layout attention retry diagnostic', layoutNow + 5)
      modules.state.writeSessionContext('/tmp/layout-fresh-suite-leader.jsonl', {
        teamName: team.name,
        memberName: 'team-lead',
      })

      const teamDir = path.join(home, 'teams', team.name)
      assert.equal(modules.state.getTeamStatePath(team.name), path.join(teamDir, 'team.json'))
      assert.equal(modules.state.getMailboxDir(team.name), path.join(teamDir, 'inboxes'))
      assert.equal(modules.state.getMailboxPath(team.name, 'worker-a'), path.join(teamDir, 'inboxes', 'worker-a.json'))
      assert.equal(modules.state.getOutboxStatePath(team.name), path.join(teamDir, 'outbox.json'))
      assert.equal(modules.state.getRuntimeStatePath(team.name), path.join(teamDir, 'runtime.json'))
      assert.equal(modules.state.getSessionsDir(), path.join(home, 'sessions'))
      assert.equal(fs.existsSync(path.join(teamDir, 'team.json')), true, 'fresh team writes should use team.json')
      assert.equal(fs.existsSync(path.join(teamDir, 'inboxes', 'team-lead.json')), true, 'fresh mailbox ensure should use inboxes/')
      assert.equal(fs.existsSync(path.join(teamDir, 'inboxes', 'worker-a.json')), true, 'fresh mailbox push should use inboxes/')
      assert.equal(fs.existsSync(path.join(teamDir, 'outbox.json')), true, 'fresh outbox writes should use outbox.json')
      assert.equal(fs.existsSync(path.join(teamDir, 'runtime.json')), true, 'fresh bridge/delivery/projection runtime writes should use runtime.json')
      const runtimeState = JSON.parse(fs.readFileSync(path.join(teamDir, 'runtime.json'), 'utf8'))
      assert.equal(runtimeState.version, 1)
      assert.equal(runtimeState.bridge.leases['worker-a'].bridgeId, 'layout-bridge-1')
      assert.equal(runtimeState.delivery.requests[runtimeDeliveryRequest.requestId].status, 'pending')
      assert.equal(runtimeState.leaderProjection.projections[runtimeProjection.projectionKey].status, 'failed')
      assert.equal(runtimeState.leaderAttention.attentions[runtimeAttention.attentionKey].status, 'failed')
      assert.equal(fs.existsSync(modules.state.getSessionContextPath('/tmp/layout-fresh-suite-leader.jsonl')), true, 'fresh session binding should use sessions/')
      assert.equal(fs.existsSync(path.join(teamDir, 'state.json')), false, 'fresh team writes must not create old state.json')
      assert.equal(fs.existsSync(path.join(teamDir, 'mailboxes')), false, 'fresh mailbox writes must not create old mailboxes/')
      assert.equal(fs.existsSync(path.join(teamDir, 'outbox-state.json')), false, 'fresh outbox writes must not create old outbox-state.json')
      assert.equal(fs.existsSync(path.join(teamDir, 'bridge-state.json')), false, 'fresh bridge writes must not create old bridge-state.json')
      assert.equal(fs.existsSync(path.join(teamDir, 'delivery-state.json')), false, 'fresh delivery writes must not create old delivery-state.json')
      assert.equal(fs.existsSync(path.join(teamDir, 'leader-projection-state.json')), false, 'fresh projection writes must not create old leader-projection-state.json')
      assert.equal(fs.existsSync(path.join(home, 'session-bindings')), false, 'fresh session writes must not create old session-bindings/')
      assert.deepEqual(modules.state.listTeams().map(item => item.name), [team.name], 'active list should read new team.json layout')
    })

    await withTempHome(modules, 'old-layout-quarantine', home => {
      const oldTeamName = 'layout-old-suite'
      const teamDir = path.join(home, 'teams', oldTeamName)
      writeJson(path.join(teamDir, 'state.json'), vnextTeamFixture(modules, oldTeamName))
      writeJson(path.join(teamDir, 'mailboxes', 'team-lead.json'), [])
      writeJson(path.join(teamDir, 'outbox-state.json'), { version: 1, effects: {}, idempotency: {} })
      writeJson(path.join(teamDir, 'bridge-state.json'), { version: 1, leases: { 'worker-a': { memberName: 'worker-a', bridgeId: 'old-bridge', sessionFile: '/tmp/old-worker.jsonl' } } })
      writeJson(path.join(teamDir, 'delivery-state.json'), { version: 1, requests: { oldDelivery: { requestId: 'oldDelivery', teamName: oldTeamName, memberName: 'worker-a', status: 'pending' } } })
      writeJson(path.join(teamDir, 'leader-projection-state.json'), { version: 1, projections: { oldProjection: { projectionKey: 'oldProjection', teamName: oldTeamName, messageId: 'old-message', generation: '1', status: 'projected' } } })

      assert.equal(modules.state.readTeamState(oldTeamName), null, 'old active layout must quarantine instead of fallback-reading state.json')
      assert.equal(fs.existsSync(teamDir), false, 'old active layout dir should move to quarantine')
      assert.deepEqual(modules.state.listTeams(), [], 'old active layout must not be active-listed')
      const quarantined = modules.state.readLatestQuarantineForTeam(oldTeamName)
      assert.ok(quarantined, 'old active layout should have quarantine summary')
      const reasonTuples = quarantined.reasons.map(reason => [reason.code, reason.file, reason.value])
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_layout_entry' && item[1] === 'state.json'), 'state.json should be rejected as old layout')
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_layout_entry' && item[1] === 'mailboxes'), 'mailboxes/ should be rejected as old layout')
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_layout_entry' && item[1] === 'outbox-state.json'), 'outbox-state.json should be rejected as old layout')
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_layout_entry' && item[1] === 'bridge-state.json'), 'bridge-state.json should be rejected as old runtime layout')
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_layout_entry' && item[1] === 'delivery-state.json'), 'delivery-state.json should be rejected as old runtime layout')
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_layout_entry' && item[1] === 'leader-projection-state.json'), 'leader-projection-state.json should be rejected as old runtime layout')

      const replacement = createFreshTeam(modules, 'layout-new-suite')
      assert.deepEqual(modules.state.listTeams().map(team => team.name), [replacement.name], 'active list should continue with only new layout teams')
      const panelData = modules.panelDataSource.loadPanelData(null)
      assert.deepEqual(panelData.teams.map(team => team.name), [replacement.name], 'panel active list should use new layout only')
    })

    await withTempHome(modules, 'old-outbox-effect-kind-quarantine', home => {
      const oldTeamName = 'layout-old-outbox-effect-suite'
      const teamDir = path.join(home, 'teams', oldTeamName)
      writeJson(path.join(teamDir, 'team.json'), vnextTeamFixture(modules, oldTeamName))
      writeJson(path.join(teamDir, 'outbox.json'), {
        version: 1,
        effects: {
          legacyLeaderEffect: {
            effectId: 'legacyLeaderEffect',
            teamName: oldTeamName,
            kind: 'leader_triage_requested',
            idempotencyKey: 'legacy:leader-triage',
            status: 'pending',
            payload: { teamName: oldTeamName, message: { type: 'question', wakeHint: 'soft', from: 'worker-a', text: 'old leader effect' } },
            attempts: 0,
            maxAttempts: 3,
            nextAttemptAt: 1,
            dependsOn: [],
            createdAt: 1,
            updatedAt: 1,
          },
        },
        idempotency: { 'legacy:leader-triage': 'legacyLeaderEffect' },
      })

      assert.equal(modules.state.readTeamState(oldTeamName), null, 'old leader_triage_requested outbox effects must quarantine instead of normalizing or executing')
      assert.equal(fs.existsSync(teamDir), false, 'old outbox effect active dir should move to quarantine')
      const quarantined = modules.state.readLatestQuarantineForTeam(oldTeamName)
      assert.ok(quarantined, 'old outbox effect should have quarantine summary')
      const reasonTuples = quarantined.reasons.map(reason => [reason.code, reason.file, reason.path, reason.value])
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_outbox_effect_kind' && item[1] === 'outbox.json' && item[2] === '$.effects.legacyLeaderEffect.kind' && item[3] === 'leader_triage_requested'), 'old leader triage effect kind should be rejected explicitly')
    })

    await withTempHome(modules, 'old-runtime-files-with-team-json-quarantine', home => {
      const oldTeamName = 'layout-old-runtime-suite'
      const teamDir = path.join(home, 'teams', oldTeamName)
      writeJson(path.join(teamDir, 'team.json'), vnextTeamFixture(modules, oldTeamName))
      writeJson(path.join(teamDir, 'bridge-state.json'), { version: 1, leases: { 'worker-a': { memberName: 'worker-a', bridgeId: 'old-runtime-bridge', sessionFile: '/tmp/old-runtime-worker.jsonl' } } })
      writeJson(path.join(teamDir, 'delivery-state.json'), { version: 1, requests: { oldRuntimeDelivery: { requestId: 'oldRuntimeDelivery', teamName: oldTeamName, memberName: 'worker-a', status: 'pending' } } })
      writeJson(path.join(teamDir, 'leader-projection-state.json'), { version: 1, projections: { oldRuntimeProjection: { projectionKey: 'oldRuntimeProjection', teamName: oldTeamName, messageId: 'old-message', generation: '1', status: 'projected' } } })

      assert.equal(modules.state.readBridgeLeaseStore(oldTeamName).leases['worker-a'], undefined, 'old bridge-state.json must not be silently consumed')
      assert.equal(fs.existsSync(teamDir), false, 'old runtime file active dir should move to quarantine')
      assert.deepEqual(modules.state.listTeams(), [], 'team with old runtime files must not remain active-listed')
      const quarantined = modules.state.readLatestQuarantineForTeam(oldTeamName)
      assert.ok(quarantined, 'old runtime files should have quarantine summary')
      const reasonTuples = quarantined.reasons.map(reason => [reason.code, reason.file, reason.value])
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_layout_entry' && item[1] === 'bridge-state.json'))
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_layout_entry' && item[1] === 'delivery-state.json'))
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_layout_entry' && item[1] === 'leader-projection-state.json'))
    })

    await withTempHome(modules, 'old-layout-no-vocab-leak', home => {
      const oldTeamName = 'layout-old-vocab-suite'
      const teamDir = path.join(home, 'teams', oldTeamName)
      writeJson(path.join(teamDir, 'state.json'), {
        ...vnextTeamFixture(modules, oldTeamName),
        tasks: {
          T001: {
            id: 'T001',
            title: 'old task should not leak',
            description: 'old task should not leak',
            status: 'completed',
            blockedBy: [],
            notes: [{ at: Date.now(), author: 'worker-a', text: 'old note', messageType: 'completion_report' }],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
        nextTaskSeq: 2,
      })
      assert.equal(modules.state.readTeamState(oldTeamName), null)
      const fresh = createFreshTeam(modules, 'layout-public-suite')
      const data = modules.panelDataSource.loadPanelData(null)
      assert.deepEqual(data.teams.map(team => team.name), [fresh.name])
      const panelState = modules.viewModel.createInitialPanelState()
      modules.viewModel.clampPanelStateToData(panelState, data)
      const selection = modules.viewModel.buildPanelSelectionView(data, panelState)
      const text = modules.layout.renderTeamPanelLines(env.helpers.createFakeTheme(), { width: 180, height: 40, data, state: panelState, selection }).join('\n')
      assert.equal(text.includes('completed'), false, 'public layout quarantine diagnostics must not leak old task vocabulary')
      assert.equal(text.includes('completion_report'), false, 'public layout quarantine diagnostics must not leak old message vocabulary')
      assert.equal(text.includes('state.json'), false, 'public layout quarantine diagnostics should stay concise and not render old filenames as active state')
      assert.equal(text.includes('bridge-state.json'), false, 'public layout quarantine diagnostics should not render old runtime filenames')
      assert.equal(text.includes('delivery-state.json'), false, 'public layout quarantine diagnostics should not render old runtime filenames')
      assert.equal(text.includes('leader-projection-state.json'), false, 'public layout quarantine diagnostics should not render old runtime filenames')
    })
  },
}
