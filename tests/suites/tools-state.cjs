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

    const configPath = modules.state.getConfigPath()
    modules.state.ensureDir(path.dirname(configPath))
    fs.writeFileSync(configPath, JSON.stringify({
      agentModels: {
        planner: '077-gpt-5.4',
        researcher: '077-glm-5.1',
        implementer: '077-gpt-5.3-codex',
      },
    }), 'utf8')

    let res = await tool('agentteam_create').execute('create-1', {
      team_name: 'full-suite-team',
      description: 'Integration test team',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created team full-suite-team')

    let team = modules.state.readTeamState('full-suite-team')
    assert.ok(team, 'team should exist after create')
    assert.equal(team.members['team-lead'].role, 'leader')

    res = await tool('agentteam_create').execute('create-already-attached', {
      team_name: 'full-suite-team',
      description: 'Already attached duplicate create',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'already exists; current session is already attached')
    assert.equal(res.details.alreadyAttached, true)
    assert.equal(res.details.currentTeamName, 'full-suite-team')

    const oldLeaderTeam = modules.state.createInitialTeamState({
      teamName: 'old-session-suite',
      description: 'existing team from old leader session',
      leaderSessionFile: '/tmp/old-session-suite-leader.jsonl',
      leaderCwd: '/tmp/old-session-suite',
    })
    modules.state.writeTeamState(oldLeaderTeam)
    const newLeaderCtx = helpers.createCtx('/tmp/new-session-suite', '/tmp/new-session-suite-leader.jsonl', env.notifications)
    res = await tool('agentteam_create').execute('create-existing-old-session', {
      team_name: 'old-session-suite',
      description: 'attach existing team',
    }, null, () => {}, newLeaderCtx)
    helpers.assertContains(res.content[0].text, 'Team old-session-suite already exists; attached current session as leader')
    assert.equal(res.details.teamName, 'old-session-suite')
    assert.equal(res.details.recovered, true)
    let recoveredTeam = modules.state.readTeamState('old-session-suite')
    assert.equal(recoveredTeam.leaderSessionFile, '/tmp/new-session-suite-leader.jsonl')
    assert.equal(recoveredTeam.leaderCwd, '/tmp/new-session-suite')
    assert.equal(recoveredTeam.members['team-lead'].sessionFile, '/tmp/new-session-suite-leader.jsonl')
    assert.equal(recoveredTeam.members['team-lead'].paneId, '%leader')
    assert.deepEqual(modules.state.readSessionContext('/tmp/new-session-suite-leader.jsonl'), { teamName: 'old-session-suite', memberName: 'team-lead' })
    res = await tool('agentteam_spawn').execute('spawn-after-existing-create-attach', {
      name: 'Recovered Worker',
      role: 'researcher',
    }, null, () => {}, newLeaderCtx)
    helpers.assertContains(res.content[0].text, 'Created idle teammate recovered-worker (researcher)')
    env.patches.livePanes.delete(res.details.paneId)
    modules.state.deleteTeamState('old-session-suite')

    const otherSessionCtx = helpers.createCtx('/tmp/other-session-suite', '/tmp/other-session-suite-leader.jsonl', env.notifications)
    res = await tool('agentteam_create').execute('create-other-attached-a', {
      team_name: 'other-session-suite-a',
      description: 'first team for attached refusal',
    }, null, () => {}, otherSessionCtx)
    helpers.assertContains(res.content[0].text, 'Created team other-session-suite-a')
    const secondExistingTeam = modules.state.createInitialTeamState({
      teamName: 'other-session-suite-b',
      description: 'second existing team for attached refusal',
      leaderSessionFile: '/tmp/other-session-suite-b-old-leader.jsonl',
      leaderCwd: '/tmp/other-session-suite-b',
    })
    modules.state.writeTeamState(secondExistingTeam)
    res = await tool('agentteam_create').execute('create-other-attached-b-denied', {
      team_name: 'other-session-suite-b',
      description: 'should refuse reattach to different existing team',
    }, null, () => {}, otherSessionCtx)
    helpers.assertContains(res.content[0].text, 'Current session is already attached to team other-session-suite-a')
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'session_already_attached')
    assert.equal(res.details.teamName, 'other-session-suite-b')
    assert.equal(res.details.currentTeamName, 'other-session-suite-a')
    assert.equal(modules.state.readTeamState('other-session-suite-b').leaderSessionFile, '/tmp/other-session-suite-b-old-leader.jsonl')
    modules.state.deleteTeamState('other-session-suite-a')
    modules.state.deleteTeamState('other-session-suite-b')

    const originalCaptureCurrentPaneBindingForCreate = modules.tmux.captureCurrentPaneBinding
    const originalPaneExistsForCreate = modules.tmux.paneExists
    try {
      const unattachedExistingTeam = modules.state.createInitialTeamState({
        teamName: 'unsafe-existing-suite',
        description: 'existing team that cannot attach without current pane',
        leaderSessionFile: '/tmp/unsafe-existing-suite-old-leader.jsonl',
        leaderCwd: '/tmp/unsafe-existing-suite',
      })
      unattachedExistingTeam.members['team-lead'].paneId = '%still-live-leader'
      unattachedExistingTeam.members['team-lead'].windowTarget = 'test:@2'
      modules.state.writeTeamState(unattachedExistingTeam)
      modules.tmux.paneExists = paneId => paneId === '%still-live-leader' || originalPaneExistsForCreate(paneId)
      const unsafeCtx = helpers.createCtx('/tmp/unsafe-existing-suite-new', '/tmp/unsafe-existing-suite-new-leader.jsonl', env.notifications)
      res = await tool('agentteam_create').execute('create-existing-unsafe', {
        team_name: 'unsafe-existing-suite',
        description: 'cannot safely attach',
      }, null, () => {}, unsafeCtx)
      helpers.assertContains(res.content[0].text, 'Team unsafe-existing-suite already exists and appears to have an active leader pane')
      assert.equal(res.details.denied, true)
      assert.equal(res.details.reason, 'team_exists_not_attached')
      helpers.assertContains(res.details.recoverInstruction, '/team recover')
      assert.equal(res.details.existingLeaderPaneId, '%still-live-leader')
      assert.deepEqual(modules.state.readSessionContext('/tmp/unsafe-existing-suite-new-leader.jsonl'), { teamName: null, memberName: null })

      modules.tmux.captureCurrentPaneBinding = () => null
      modules.tmux.paneExists = originalPaneExistsForCreate
      res = await tool('agentteam_create').execute('create-existing-no-pane', {
        team_name: 'unsafe-existing-suite',
        description: 'cannot safely attach without pane',
      }, null, () => {}, unsafeCtx)
      helpers.assertContains(res.content[0].text, 'Team unsafe-existing-suite already exists, but the current session is not safely attached')
      assert.equal(res.details.denied, true)
      assert.equal(res.details.reason, 'team_exists_not_attached')
    } finally {
      modules.tmux.captureCurrentPaneBinding = originalCaptureCurrentPaneBindingForCreate
      modules.tmux.paneExists = originalPaneExistsForCreate
      modules.state.deleteTeamState('unsafe-existing-suite')
    }

    res = await tool('agentteam_spawn').execute('spawn-1', {
      name: 'Research One',
      role: 'worker',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created idle teammate research-one (researcher)')
    helpers.assertContains(res.content[0].text, '[model: 077-glm-5.1]')
    assert.equal(res.details.model, '077-glm-5.1')
    assert.equal(res.details.modelLabel, '077-glm-5.1')
    assert.equal(res.details.modelSource, 'configured')

    res = await tool('agentteam_spawn').execute('spawn-2', {
      name: 'Plan One',
      role: 'plan',
      task: '请先等待 research 的报告，收到消息后给出计划。',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created teammate plan-one (planner)')
    helpers.assertContains(res.content[0].text, 'initial task delivery requested; worker busy')
    assert.ok(res.details.deliveryRequestId, 'spawn bootPrompt should create a durable bridge delivery request')
    assert.ok(res.details.outboxEffectId, 'spawn bootPrompt should be routed through a durable worker delivery Outbox effect')
    assert.equal(res.details.outboxStatus, 'done')
    helpers.assertContains(res.content[0].text, '[model: 077-gpt-5.4]')
    assert.equal(res.details.model, '077-gpt-5.4')
    assert.equal(res.details.modelLabel, '077-gpt-5.4')
    assert.equal(res.details.modelSource, 'configured')

    const originalWriteTeamState = modules.state.writeTeamState
    let duplicateSpawnWrites = 0
    modules.state.writeTeamState = state => {
      duplicateSpawnWrites += 1
      return originalWriteTeamState(state)
    }
    try {
      res = await tool('agentteam_spawn').execute('spawn-dup-existing', {
        name: 'Research One',
        role: 'researcher',
      }, null, () => {}, leaderCtx)
      helpers.assertContains(res.content[0].text, 'already exists')
    } finally {
      modules.state.writeTeamState = originalWriteTeamState
    }
    assert.equal(duplicateSpawnWrites, 0, 'duplicate spawn should not perform unconditional outer writeTeamState')

    const originalCreateTeammatePane = modules.tmux.createTeammatePane
    const originalResolvePaneBindingForSpawn = modules.tmux.resolvePaneBinding
    const originalWaitForPaneAppStart = modules.tmux.waitForPaneAppStart
    const originalKillPaneForSpawn = modules.tmux.killPane
    try {
      modules.tmux.createTeammatePane = async () => { throw new Error('simulated pane create failure') }
      res = await tool('agentteam_spawn').execute('spawn-create-fails', {
        name: 'Retry Worker',
        role: 'researcher',
      }, null, () => {}, leaderCtx)
      assert.equal(res.ok, undefined)
      assert.equal(res.details.ok, false)
      helpers.assertContains(res.content[0].text, 'Failed to create tmux pane for retry-worker')
      helpers.assertContains(res.content[0].text, 'reserved member removed')
      helpers.assertContains(res.content[0].text, 'session context cleared')
      assert.equal(modules.state.readTeamState('full-suite-team').members['retry-worker'], undefined, 'failed pane create should roll back reserved member')
      assert.deepEqual(modules.state.readSessionContext(res.details.sessionFile), { teamName: null, memberName: null }, 'failed pane create should clear session context')
      assert.equal(fs.existsSync(res.details.sessionFile), false, 'failed pane create should remove worker session file if present/created')

      modules.tmux.createTeammatePane = originalCreateTeammatePane
      res = await tool('agentteam_spawn').execute('spawn-retry-after-create-failure', {
        name: 'Retry Worker',
        role: 'researcher',
      }, null, () => {}, leaderCtx)
      helpers.assertContains(res.content[0].text, 'Created idle teammate retry-worker (researcher)')
      assert.ok(modules.state.readTeamState('full-suite-team').members['retry-worker'], 'retry after rollback should succeed')

      const retryPaneId = res.details.paneId
      env.patches.livePanes.delete(retryPaneId)
      modules.state.updateTeamState('full-suite-team', latest => {
        modules.state.removeMember(latest, 'retry-worker')
      })
      modules.state.clearSessionContext(res.details.sessionFile)
      if (res.details.sessionFile) fs.rmSync(res.details.sessionFile, { force: true })

      let bindingFailurePane
      modules.tmux.createTeammatePane = async () => {
        bindingFailurePane = await originalCreateTeammatePane({})
        return bindingFailurePane
      }
      modules.tmux.resolvePaneBinding = paneId => paneId === bindingFailurePane?.paneId ? null : originalResolvePaneBindingForSpawn(paneId)
      let killedPaneId
      modules.tmux.killPane = paneId => {
        killedPaneId = paneId
        originalKillPaneForSpawn(paneId)
      }
      res = await tool('agentteam_spawn').execute('spawn-binding-fails', {
        name: 'Binding Fail Worker',
        role: 'researcher',
      }, null, () => {}, leaderCtx)
      assert.equal(res.details.ok, false)
      helpers.assertContains(res.content[0].text, 'Failed to keep tmux pane alive for binding-fail-worker')
      helpers.assertContains(res.content[0].text, 'failed spawn pane killed')
      assert.equal(killedPaneId, bindingFailurePane.paneId, 'binding failure should kill failed worker pane')
      assert.notEqual(killedPaneId, '%leader', 'spawn rollback must never kill current leader pane')
      assert.equal(env.patches.livePanes.has(bindingFailurePane.paneId), false, 'binding failure pane should be removed from live panes')
      assert.equal(modules.state.readTeamState('full-suite-team').members['binding-fail-worker'], undefined)
      assert.deepEqual(modules.state.readSessionContext(res.details.sessionFile), { teamName: null, memberName: null })

      modules.tmux.createTeammatePane = originalCreateTeammatePane
      modules.tmux.resolvePaneBinding = originalResolvePaneBindingForSpawn
      modules.tmux.killPane = originalKillPaneForSpawn
      res = await tool('agentteam_spawn').execute('spawn-retry-after-binding-failure', {
        name: 'Binding Fail Worker',
        role: 'researcher',
      }, null, () => {}, leaderCtx)
      helpers.assertContains(res.content[0].text, 'Created idle teammate binding-fail-worker (researcher)')
      env.patches.livePanes.delete(res.details.paneId)
      modules.state.updateTeamState('full-suite-team', latest => {
        modules.state.removeMember(latest, 'binding-fail-worker')
      })
      modules.state.clearSessionContext(res.details.sessionFile)
      if (res.details.sessionFile) fs.rmSync(res.details.sessionFile, { force: true })

      let appStartPane
      modules.tmux.createTeammatePane = async () => {
        appStartPane = await originalCreateTeammatePane({})
        return appStartPane
      }
      modules.tmux.waitForPaneAppStart = async paneId => paneId === appStartPane?.paneId ? false : originalWaitForPaneAppStart(paneId)
      killedPaneId = undefined
      modules.tmux.killPane = paneId => {
        killedPaneId = paneId
        originalKillPaneForSpawn(paneId)
      }
      res = await tool('agentteam_spawn').execute('spawn-app-start-fails', {
        name: 'Timeout Worker',
        role: 'researcher',
      }, null, () => {}, leaderCtx)
      assert.equal(res.details.ok, false)
      helpers.assertContains(res.content[0].text, 'Failed to start visible teammate session for timeout-worker')
      helpers.assertContains(res.content[0].text, 'failed spawn pane killed')
      assert.equal(killedPaneId, appStartPane.paneId, 'app-start timeout should kill failed worker pane')
      assert.notEqual(killedPaneId, '%leader', 'app-start timeout cleanup must not kill current leader pane')
      assert.equal(env.patches.livePanes.has(appStartPane.paneId), false, 'app-start timeout pane should be removed from live panes')
      assert.equal(modules.state.readTeamState('full-suite-team').members['timeout-worker'], undefined)
      assert.deepEqual(modules.state.readSessionContext(res.details.sessionFile), { teamName: null, memberName: null })

      modules.tmux.createTeammatePane = originalCreateTeammatePane
      modules.tmux.waitForPaneAppStart = originalWaitForPaneAppStart
      modules.tmux.killPane = originalKillPaneForSpawn
      res = await tool('agentteam_spawn').execute('spawn-retry-after-app-start-failure', {
        name: 'Timeout Worker',
        role: 'researcher',
      }, null, () => {}, leaderCtx)
      helpers.assertContains(res.content[0].text, 'Created idle teammate timeout-worker (researcher)')
      assert.ok(modules.state.readTeamState('full-suite-team').members['timeout-worker'], 'retry after app-start rollback should succeed')
    } finally {
      modules.tmux.createTeammatePane = originalCreateTeammatePane
      modules.tmux.resolvePaneBinding = originalResolvePaneBindingForSpawn
      modules.tmux.waitForPaneAppStart = originalWaitForPaneAppStart
      modules.tmux.killPane = originalKillPaneForSpawn
    }

    const longWorkerNameInput = `Long ${'WorkerName '.repeat(18)}`
    const longWorkerName = modules.runtimeRules.sanitizeWorkerName(longWorkerNameInput)
    team = modules.state.readTeamState('full-suite-team')
    let capturedLongSpawnPaneInput
    modules.tmux.createTeammatePane = async input => {
      capturedLongSpawnPaneInput = input
      return originalCreateTeammatePane(input)
    }
    res = await tool('agentteam_spawn').execute('spawn-long-bounded-worker-session', {
      name: longWorkerNameInput,
      role: 'researcher',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.ok, true)
    const longSessionBase = path.basename(res.details.sessionFile)
    assert.ok(longSessionBase.startsWith('worker-'), 'new worker session files should use bounded worker prefix')
    assert.ok(longSessionBase.length < 120, 'new worker session basename should remain safely bounded')
    assert.equal(res.details.sessionFile, modules.state.getWorkerSessionPath(team.name, longWorkerName), 'spawn should use shared worker session path helper')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.members[longWorkerName].sessionFile, res.details.sessionFile, 'member state should store bounded worker session path')
    assert.ok(capturedLongSpawnPaneInput.startCommand.includes("'--session'"), 'pi launch command should pass --session')
    assert.ok(capturedLongSpawnPaneInput.startCommand.includes(`'${res.details.sessionFile}'`), 'pi launch command should use the bounded worker session path')
    assert.deepEqual(modules.state.readSessionContext(res.details.sessionFile), { teamName: team.name, memberName: longWorkerName }, 'bounded worker session should be bound consistently')
    env.patches.livePanes.delete(res.details.paneId)
    modules.tmux.createTeammatePane = originalCreateTeammatePane
    modules.state.updateTeamState('full-suite-team', latest => {
      modules.state.removeMember(latest, longWorkerName)
    })
    modules.state.clearSessionContext(res.details.sessionFile)
    if (res.details.sessionFile) fs.rmSync(res.details.sessionFile, { force: true })

    const longDirectTeamName = `full-suite-team-${'rollback-long-team-name-'.repeat(6)}`
    const longDirectTeam = modules.state.createInitialTeamState({
      teamName: longDirectTeamName,
      description: 'direct long spawn team',
      leaderSessionFile: '/tmp/direct-long-leader.jsonl',
      leaderCwd: '/tmp/project-under-test',
    })
    longDirectTeam.members['team-lead'].paneId = '%leader'
    modules.state.writeTeamState(longDirectTeam)
    const longDirectSpawn = await modules.workerSpawnService.spawnWorkerMember(env.patches.deps, longDirectTeam, {
      name: longWorkerNameInput,
      role: 'researcher',
    }, '/tmp/project-under-test')
    assert.equal(longDirectSpawn.ok, true)
    assert.ok(path.basename(longDirectSpawn.sessionFile).length < 120, 'direct long-name spawn should use bounded session basename')
    assert.equal(longDirectSpawn.sessionFile, modules.state.getWorkerSessionPath(longDirectTeam.name, longWorkerName), 'direct spawn should use helper for long team/member names')
    assert.equal(longDirectTeam.members[longWorkerName].sessionFile, longDirectSpawn.sessionFile, 'direct spawn should store bounded path on member state')
    assert.deepEqual(modules.state.readSessionContext(longDirectSpawn.sessionFile), { teamName: longDirectTeam.name, memberName: longWorkerName })
    env.patches.livePanes.delete(longDirectSpawn.paneId)
    modules.state.clearSessionContext(longDirectSpawn.sessionFile)
    if (longDirectSpawn.sessionFile) fs.rmSync(longDirectSpawn.sessionFile, { force: true })
    modules.state.updateTeamState(longDirectTeamName, latest => {
      modules.state.removeMember(latest, longWorkerName)
    })

    let longRollbackPane
    modules.tmux.createTeammatePane = async () => {
      longRollbackPane = await originalCreateTeammatePane({})
      return longRollbackPane
    }
    modules.tmux.waitForPaneAppStart = async paneId => paneId === longRollbackPane?.paneId ? false : originalWaitForPaneAppStart(paneId)
    let longRollbackKilledPaneId
    modules.tmux.killPane = paneId => {
      longRollbackKilledPaneId = paneId
      originalKillPaneForSpawn(paneId)
    }
    const longRollbackTeam = modules.state.readTeamState(longDirectTeamName)
    const longRollbackSpawn = await modules.workerSpawnService.spawnWorkerMember(env.patches.deps, longRollbackTeam, {
      name: longWorkerNameInput,
      role: 'researcher',
    }, '/tmp/project-under-test')
    assert.equal(longRollbackSpawn.ok, false)
    assert.ok(path.basename(longRollbackSpawn.sessionFile).length < 120, 'failed long spawn should still use bounded session basename')
    assert.equal(longRollbackSpawn.sessionFile, modules.state.getWorkerSessionPath(longRollbackTeam.name, longWorkerName))
    assert.equal(longRollbackKilledPaneId, longRollbackPane.paneId)
    assert.equal(fs.existsSync(longRollbackSpawn.sessionFile), false, 'rollback should remove actual bounded worker session file')
    assert.deepEqual(modules.state.readSessionContext(longRollbackSpawn.sessionFile), { teamName: null, memberName: null }, 'rollback should clear hashed binding for bounded worker session')
    assert.equal(longRollbackTeam.members[longWorkerName], undefined, 'rollback should remove long worker reservation')

    modules.tmux.createTeammatePane = originalCreateTeammatePane
    modules.tmux.waitForPaneAppStart = originalWaitForPaneAppStart
    modules.tmux.killPane = originalKillPaneForSpawn
    const longRetrySpawn = await modules.workerSpawnService.spawnWorkerMember(env.patches.deps, longRollbackTeam, {
      name: longWorkerNameInput,
      role: 'researcher',
    }, '/tmp/project-under-test')
    assert.equal(longRetrySpawn.ok, true, 'retry after long rollback should succeed')
    assert.equal(longRetrySpawn.sessionFile, modules.state.getWorkerSessionPath(longRollbackTeam.name, longWorkerName), 'retry should reuse same bounded session path')
    env.patches.livePanes.delete(longRetrySpawn.paneId)
    modules.state.clearSessionContext(longRetrySpawn.sessionFile)
    if (longRetrySpawn.sessionFile) fs.rmSync(longRetrySpawn.sessionFile, { force: true })
    modules.state.deleteTeamState(longDirectTeamName)

    const bridgeSpawnTimeoutBefore = process.env.PI_AGENTTEAM_BRIDGE_SPAWN_READY_TIMEOUT_MS
    const autoBridgeBefore = process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE
    process.env.PI_AGENTTEAM_BRIDGE_SPAWN_READY_TIMEOUT_MS = '0'
    process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE = '0'
    env.sentPrompts.length = 0
    try {
      res = await tool('agentteam_spawn').execute('spawn-bridge-timeout', {
        name: 'Bridge Timeout Worker',
        role: 'researcher',
        task: 'initial bridge task should remain queued',
      }, null, () => {}, leaderCtx)
    } finally {
      if (bridgeSpawnTimeoutBefore === undefined) delete process.env.PI_AGENTTEAM_BRIDGE_SPAWN_READY_TIMEOUT_MS
      else process.env.PI_AGENTTEAM_BRIDGE_SPAWN_READY_TIMEOUT_MS = bridgeSpawnTimeoutBefore
      if (autoBridgeBefore === undefined) delete process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE
      else process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE = autoBridgeBefore
    }
    assert.equal(res.details.ok, true)
    assert.equal(res.details.bridgeReady, false)
    assert.ok(res.details.deliveryRequestId, 'bridge timeout spawn should create durable initial request')
    assert.ok(res.details.outboxEffectId, 'bridge timeout spawn should expose durable initial Outbox request')
    assert.equal(res.details.outboxStatus, 'done')
    assert.equal(env.sentPrompts.length, 0, 'bridge-only spawn timeout should not tmux paste initial task')
    team = modules.state.readTeamState('full-suite-team')
    const bridgeTimeoutMember = team.members['bridge-timeout-worker']
    assert.equal(bridgeTimeoutMember.status, 'pending_delivery', 'bridge timeout worker should not appear idle-ready')
    assert.equal(bridgeTimeoutMember.bridgeAvailable, false)
    assert.ok(String(bridgeTimeoutMember.bridgeLastError || '').includes('bridge handshake timed out'))
    const bridgeTimeoutRequests = Object.values(modules.state.readDeliveryRequestStore('full-suite-team').requests)
      .filter(request => request.memberName === 'bridge-timeout-worker')
    assert.equal(bridgeTimeoutRequests.length, 1)
    assert.equal(bridgeTimeoutRequests[0].requestId, res.details.deliveryRequestId)
    assert.equal(bridgeTimeoutRequests[0].status, 'pending')
    assert.equal(bridgeTimeoutRequests[0].bootPrompt, 'initial bridge task should remain queued')
    const bridgeTimeoutOutbox = modules.state.getOutboxEffect('full-suite-team', res.details.outboxEffectId)
    assert.equal(bridgeTimeoutOutbox?.kind, 'worker_delivery_requested')
    assert.equal(bridgeTimeoutOutbox?.status, 'done')
    assert.equal(bridgeTimeoutOutbox?.result?.requestId, res.details.deliveryRequestId)
    env.patches.livePanes.delete(res.details.paneId)
    modules.state.updateTeamState('full-suite-team', latest => {
      modules.state.removeMember(latest, 'bridge-timeout-worker')
    })
    modules.state.clearSessionContext(res.details.sessionFile)
    if (res.details.sessionFile) fs.rmSync(res.details.sessionFile, { force: true })

    team = modules.state.readTeamState('full-suite-team')
    const bridgeReadyTimeoutBefore = process.env.PI_AGENTTEAM_BRIDGE_SPAWN_READY_TIMEOUT_MS
    process.env.PI_AGENTTEAM_BRIDGE_SPAWN_READY_TIMEOUT_MS = '250'
    let bridgeReadyPane
    const originalReadyCreateTeammatePane = modules.tmux.createTeammatePane
    modules.tmux.createTeammatePane = async input => {
      bridgeReadyPane = await originalReadyCreateTeammatePane(input)
      const expectedSessionFile = modules.state.getWorkerSessionPath('full-suite-team', 'bridge-ready-worker')
      setTimeout(() => {
        modules.runtimeBridge.publishBridgeLease({
          teamName: 'full-suite-team',
          memberName: 'bridge-ready-worker',
          sessionFile: expectedSessionFile,
        })
      }, 0)
      return bridgeReadyPane
    }
    env.sentPrompts.length = 0
    try {
      res = await tool('agentteam_spawn').execute('spawn-bridge-ready', {
        name: 'Bridge Ready Worker',
        role: 'researcher',
        task: 'initial bridge ready task',
      }, null, () => {}, leaderCtx)
    } finally {
      modules.tmux.createTeammatePane = originalReadyCreateTeammatePane
      if (bridgeReadyTimeoutBefore === undefined) delete process.env.PI_AGENTTEAM_BRIDGE_SPAWN_READY_TIMEOUT_MS
      else process.env.PI_AGENTTEAM_BRIDGE_SPAWN_READY_TIMEOUT_MS = bridgeReadyTimeoutBefore
    }
    assert.equal(res.details.ok, true)
    assert.equal(res.details.bridgeReady, true)
    assert.equal(env.sentPrompts.length, 0, 'bridge-ready spawn should not tmux paste initial task')
    team = modules.state.readTeamState('full-suite-team')
    const bridgeReadyMember = team.members['bridge-ready-worker']
    assert.equal(bridgeReadyMember.status, 'pending_delivery')
    assert.equal(bridgeReadyMember.bridgeAvailable, true)
    assert.ok(res.details.outboxEffectId, 'bridge-ready spawn should expose durable initial Outbox request')
    assert.equal(res.details.outboxStatus, 'done')
    const bridgeReadyRequests = Object.values(modules.state.readDeliveryRequestStore('full-suite-team').requests)
      .filter(request => request.memberName === 'bridge-ready-worker')
    assert.equal(bridgeReadyRequests.length, 1)
    assert.equal(bridgeReadyRequests[0].requestId, res.details.deliveryRequestId)
    assert.equal(bridgeReadyRequests[0].bootPrompt, 'initial bridge ready task')
    const bridgeReadyOutbox = modules.state.getOutboxEffect('full-suite-team', res.details.outboxEffectId)
    assert.equal(bridgeReadyOutbox?.kind, 'worker_delivery_requested')
    assert.equal(bridgeReadyOutbox?.status, 'done')
    assert.equal(bridgeReadyOutbox?.result?.requestId, res.details.deliveryRequestId)
    const bridgeReadySends = []
    const bridgeReadyPump = await modules.runtimeBridge.pumpBridgeOnce({
      teamName: 'full-suite-team',
      memberName: 'bridge-ready-worker',
      ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: content => { bridgeReadySends.push(content) } },
    })
    assert.equal(bridgeReadyPump.ok, true)
    assert.equal(bridgeReadySends.length, 1, 'initial assignment should submit exactly once after bridge ready')
    assert.ok(bridgeReadySends[0].includes('initial bridge ready task'))
    const bridgeReadySecondPump = await modules.runtimeBridge.pumpBridgeOnce({
      teamName: 'full-suite-team',
      memberName: 'bridge-ready-worker',
      ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: content => { bridgeReadySends.push(content) } },
    })
    assert.equal(bridgeReadySecondPump.ok, false)
    assert.equal(bridgeReadySends.length, 1, 'initial assignment should not duplicate after submitted')
    env.patches.livePanes.delete(res.details.paneId)
    modules.state.updateTeamState('full-suite-team', latest => {
      modules.state.removeMember(latest, 'bridge-ready-worker')
    })
    modules.state.clearSessionContext(res.details.sessionFile)
    if (res.details.sessionFile) fs.rmSync(res.details.sessionFile, { force: true })

    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.members['research-one'].role, 'researcher')
    assert.equal(team.members['research-one'].model, '077-glm-5.1')
    assert.equal(team.members['plan-one'].role, 'planner')
    assert.equal(team.members['plan-one'].model, '077-gpt-5.4')
    assert.equal(team.members['plan-one'].lastWakeReason, 'initial task busy via bridge delivery')

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
    const t001RecencyAfterSubstantiveAssign = team.tasks['T001'].updatedAt

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

    res = await tool('agentteam_send').execute('assign-1', {
      message: 'You were assigned shared task T001: Inspect project\n\nExplore project and report findings',
      summary: 'Assigned T001',
      type: 'assignment',
      taskId: 'T001',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'via task T001 owner research-one')
    assert.deepEqual(res.details.recipients, ['research-one'])
    assert.equal(res.details.routing.mode, 'task_owner')
    assert.equal(res.details.routing.taskOwner, 'research-one')
    assert.equal(res.details.wakeByRecipient[0].attempted, false)
    assert.equal(res.details.wakeByRecipient[0].ok, true)
    assert.equal(res.details.wakeByRecipient[0].method, 'bridge_requested')
    assert.ok(res.details.wakeByRecipient[0].requestId, 'worker assignment should create a durable bridge request')

    const researchMailboxAfterWake = modules.state.readMailbox('full-suite-team', 'research-one')
    const assignmentForResearch = researchMailboxAfterWake.find(item => item.text.includes('Inspect project'))
    assert.equal(assignmentForResearch?.deliveredAt, undefined, 'worker bridge request should not mark assignment delivered')
    assert.equal(assignmentForResearch?.readAt, undefined, 'worker bridge request should not mark assignment read')
    const assignmentRequests = Object.values(modules.state.readDeliveryRequestStore('full-suite-team').requests)
      .filter(request => request.memberName === 'research-one' && request.messageIds.includes(assignmentForResearch.id))
    assert.equal(assignmentRequests.length, 1, 'worker assignment should be backed by one durable request')

    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T001'].owner, 'research-one')
    assert.equal(team.tasks['T001'].status, 'open')
    const taskT001UpdatedAtAfterAssignmentRef = team.tasks['T001'].updatedAt
    assert.equal(taskT001UpdatedAtAfterAssignmentRef, t001RecencyAfterSubstantiveAssign, 'task message ref should not bump task recency')
    assert.equal(legacyNotes(team.tasks['T001']).filter(note => note.text.startsWith('Linked message:')).length, 0, 'task-bound assignment should not create visible full-body linked note')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'new task-bound assignment should not create legacy task notes')
    let t001MessageRefs = Object.values(team.taskMessageRefs).filter(ref => ref.taskId === 'T001')
    assert.equal(t001MessageRefs.length, 1, 'task-bound assignment should create one TaskMessageRef')
    const assignmentMessageRef = t001MessageRefs.find(ref => ref.mailboxMessageId === assignmentForResearch.id)
    assert.ok(assignmentMessageRef, 'task-bound assignment TaskMessageRef should point at recipient mailbox message')
    assert.equal(assignmentMessageRef.from, 'team-lead')
    assert.equal(assignmentMessageRef.to, 'research-one')
    assert.equal(assignmentMessageRef.type, 'assignment')
    assert.equal(assignmentMessageRef.taskId, 'T001')
    assert.equal(assignmentMessageRef.threadId, 'task:T001')
    assert.equal(assignmentMessageRef.summary, 'Assigned T001')
    assert.equal(assignmentMessageRef.priority, 'normal')
    assert.equal(assignmentMessageRef.wakeHint, 'hard')
    assert.equal(assignmentMessageRef.metadata?.source, 'agentteam_send')
    assert.equal(assignmentMessageRef.metadata?.compact, true)
    assert.equal(JSON.stringify(assignmentMessageRef).includes('You were assigned shared task'), false, 'TaskMessageRef must not copy full assignment body')
    assert.ok(assignmentForResearch.text.includes('You were assigned shared task T001'), 'recipient mailbox should retain full assignment body')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'TaskMessageRef should not create latest substantive note')

    res = await tool('agentteam_send').execute('send-1', {
      to: 'plan-one',
      message: 'Research done, please draft plan',
      type: 'inform',
      taskId: 'T001',
    }, null, () => {}, leaderCtx)
    assert.deepEqual(res.details.recipients, ['plan-one'])
    assert.equal(res.details.wakeByRecipient[0].wakeHint, 'none')
    assert.equal(res.details.wakeByRecipient[0].policyIntent, 'none')
    assert.equal(res.details.wakeByRecipient[0].policyReason, 'inform is context-only and does not wake')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T001'].updatedAt, taskT001UpdatedAtAfterAssignmentRef, 'leader inform TaskMessageRef should not bump task recency')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'leader inform should not add legacy task notes')
    const leaderInformMailbox = modules.state.readMailbox('full-suite-team', 'plan-one').find(item => item.text.includes('Research done'))
    t001MessageRefs = Object.values(team.taskMessageRefs).filter(ref => ref.taskId === 'T001')
    assert.equal(t001MessageRefs.length, 2, 'leader inform should add a TaskMessageRef alongside assignment ref')
    const leaderInformRef = t001MessageRefs.find(ref => ref.mailboxMessageId === leaderInformMailbox?.id)
    assert.ok(leaderInformRef, 'leader inform TaskMessageRef should point at recipient mailbox message')
    assert.equal(leaderInformRef.from, 'team-lead')
    assert.equal(leaderInformRef.to, 'plan-one')
    assert.equal(leaderInformRef.type, 'inform')
    assert.equal(leaderInformRef.threadId, 'task:T001')
    assert.equal(leaderInformRef.summary, undefined)
    assert.equal(JSON.stringify(leaderInformRef).includes('Research done'), false, 'leader inform TaskMessageRef must not copy full message body')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'leader inform TaskMessageRef should not create latest substantive note')

    const planSession = team.members['plan-one'].sessionFile
    const planCtx = helpers.createCtx(leaderCtx.cwd, planSession, env.notifications)
    const researchSession = team.members['research-one'].sessionFile
    const researchCtx = helpers.createCtx(leaderCtx.cwd, researchSession, env.notifications)

    res = await tool('agentteam_receive').execute('recv-1', {
      markRead: true,
      limit: 10,
    }, null, () => {}, planCtx)
    helpers.assertContains(res.content[0].text, 'Received 1 message from team-lead')

    const planMailboxAfterRead = modules.state.readMailbox('full-suite-team', 'plan-one')
    assert.ok(planMailboxAfterRead[0].deliveredAt, 'receive should stamp deliveredAt')
    assert.ok(planMailboxAfterRead[0].readAt, 'receive markRead should stamp readAt')

    const peerInformTaskUpdatedAtBefore = modules.state.readTeamState('full-suite-team').tasks['T001'].updatedAt
    const peerInformRequestsBefore = deliveryRequestsForMember('plan-one')
    res = await tool('agentteam_send').execute('send-peer-inform-mailbox-only', {
      to: 'plan-one',
      message: 'peer handoff with report summary',
      type: 'inform',
      taskId: 'T001',
    }, null, () => {}, researchCtx)
    assert.deepEqual(res.details.recipients, ['plan-one'])
    assert.equal(res.details.wakeByRecipient[0].wakeHint, 'none')
    assert.equal(res.details.wakeByRecipient[0].ok, undefined, 'worker->worker inform should not attempt worker delivery')

    const planMailbox = modules.state.readMailbox('full-suite-team', 'plan-one')
    assert.equal(planMailbox.length, 2)
    assert.ok(planMailbox.every(item => item.type === 'inform'))
    const peerInform = planMailbox.find(item => item.text.includes('peer handoff'))
    assert.equal(peerInform?.wakeHint, 'none')
    assert.equal(peerInform?.deliveredAt, undefined, 'mailbox-only peer inform should not mark mailbox messages delivered')
    assert.equal(peerInform?.readAt, undefined, 'mailbox-only peer inform should not mark mailbox messages read')
    const peerInformRequests = Object.values(modules.state.readDeliveryRequestStore('full-suite-team').requests)
      .filter(request => request.memberName === 'plan-one' && request.messageIds.includes(peerInform.id))
    assert.equal(peerInformRequests.length, 0, 'peer inform should not create a durable bridge request by default')
    assertDeliveryRequestsUnchanged('plan-one', peerInformRequestsBefore, 'peer inform should not create or refresh any delivery request for recipient')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T001'].updatedAt, peerInformTaskUpdatedAtBefore, 'peer inform TaskMessageRef should not bump task recency')
    assert.equal(legacyNotes(team.tasks['T001']).filter(note => note.text === 'Linked message: peer handoff with report summary').length, 0, 'peer inform should not copy full body into visible task note')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'peer inform should not add legacy task notes')
    t001MessageRefs = Object.values(team.taskMessageRefs).filter(ref => ref.taskId === 'T001')
    assert.equal(t001MessageRefs.length, 3, 'peer inform should add a TaskMessageRef alongside assignment and leader inform refs')
    const peerInformRef = t001MessageRefs.find(ref => ref.mailboxMessageId === peerInform.id)
    assert.ok(peerInformRef, 'peer inform TaskMessageRef should point at recipient mailbox message')
    assert.equal(peerInformRef.from, 'research-one')
    assert.equal(peerInformRef.to, 'plan-one')
    assert.equal(peerInformRef.type, 'inform')
    assert.equal(peerInformRef.threadId, 'task:T001')
    assert.equal(peerInformRef.summary, undefined)
    assert.equal(peerInformRef.wakeHint, 'none')
    assert.equal(peerInformRef.metadata?.source, 'agentteam_send')
    assert.equal(JSON.stringify(peerInformRef).includes('peer handoff with report summary'), false, 'peer inform TaskMessageRef must not copy full message body')
    assert.equal(legacyNotes(team.tasks['T001']).length, 0, 'peer inform TaskMessageRef should not create latest substantive note')
    const peerInformEvents = (team.events ?? []).filter(event => event.by === 'research-one' && event.metadata?.sourceKind === 'worker_peer_message_ref')
    assert.equal(peerInformEvents.length, 1, 'peer inform should keep one compact diagnostic event ref')
    const peerInformEvent = peerInformEvents[0]
    assert.equal(peerInformEvent.type, 'diagnostic_peer_message_ref')
    assert.equal(peerInformEvent.metadata?.diagnostic, true)
    assert.equal(peerInformEvent.metadata?.hidden, true)
    assert.equal(peerInformEvent.metadata?.displayMode, 'hidden')
    assert.equal(peerInformEvent.metadata?.compact, true)
    assert.equal(peerInformEvent.metadata?.from, 'research-one')
    assert.deepEqual(peerInformEvent.metadata?.to, ['plan-one'])
    assert.equal(peerInformEvent.metadata?.type, 'inform')
    assert.equal(peerInformEvent.metadata?.taskId, 'T001')
    assert.equal(peerInformEvent.metadata?.threadId, 'task:T001')
    assert.equal(peerInformEvent.metadata?.linkedIds?.mailboxMessageIds?.['plan-one'], peerInform.id)
    assert.equal(peerInformEvent.text.includes('peer handoff with report summary'), false, 'diagnostic peer event should not copy full message body')
    assert.ok(peerInformEvent.text.includes('diagnostic peer message ref'), 'diagnostic peer event should be clearly diagnostic')
    assert.ok(peerInformEvent.text.includes('type=inform'), 'diagnostic peer event should keep type identity')
    assert.ok(peerInformEvent.text.includes('to=plan-one'), 'diagnostic peer event should keep recipient identity')
    const peerInformRefForQuery = team.taskMessageRefs[peerInformRef.id]
    peerInformRefForQuery.summary = 'compact peer handoff summary'
    peerInformRefForQuery.diagnostic = true
    peerInformRefForQuery.metadata = { ...(peerInformRefForQuery.metadata ?? {}), source: 'agentteam_send', diagnosticFixture: true }
    modules.state.writeTeamState(team)
    const peerInformOutboxEffects = modules.state.listOutboxEffects('full-suite-team')
      .filter(effect => effect.kind === 'append_event_requested' && effect.payload?.event?.type === 'diagnostic_peer_message_ref' && effect.payload?.event?.by === 'research-one')
    assert.equal(peerInformOutboxEffects.length, 1, 'peer diagnostic event should keep one append_event_requested outbox effect')
    assert.equal(peerInformOutboxEffects[0].status, 'done', 'peer diagnostic append_event_requested should complete through outbox')
    assert.equal(peerInformOutboxEffects[0].idempotencyKey.includes('peer handoff with report summary'), false, 'peer diagnostic event idempotency key should not copy full body')
    assert.ok(peerInformOutboxEffects[0].idempotencyKey.includes(peerInform.id), 'peer diagnostic event idempotency key should include linked mailbox message id')
    assert.equal(peerInformOutboxEffects[0].payload.event.text.includes('peer handoff with report summary'), false, 'outbox diagnostic event payload text should not copy full body')
    assert.equal(JSON.stringify(peerInformOutboxEffects[0].payload.event.metadata ?? {}).includes('peer handoff with report summary'), false, 'outbox diagnostic event payload metadata should not copy full body')
    assert.equal(peerInform.text, 'peer handoff with report summary', 'recipient mailbox should retain full peer body as source of truth')
    const peerInformPrompt = modules.workerTurnPrompt.buildWorkerTurnPrompt(team, 'plan-one', {
      unreadMessages: modules.state.peekUnreadMailbox('full-suite-team', 'plan-one'),
      allowAssignedTaskTrigger: true,
    })
    assert.equal(String(peerInformPrompt).includes('diagnostic_peer_message_ref'), false, 'worker prompt should not expose diagnostic event type')
    assert.equal(String(peerInformPrompt).includes('diagnostic peer message ref'), false, 'worker prompt should not surface diagnostic event text as ordinary context')
    const peerInformPanelData = modules.panelDataSource.loadPanelData('full-suite-team')
    const peerInformPanelState = modules.viewModel.createInitialPanelState()
    peerInformPanelState.focus = 'tasks'
    peerInformPanelState.selectedIndex = 0
    const peerInformPanelSelection = modules.viewModel.buildPanelSelectionView(peerInformPanelData, peerInformPanelState)
    const peerInformPanelLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), {
      width: 180,
      height: 40,
      data: peerInformPanelData,
      state: peerInformPanelState,
      selection: peerInformPanelSelection,
    })
    assert.equal(peerInformPanelLines.join('\n').includes('diagnostic_peer_message_ref'), false, 'default panel should not expose diagnostic peer event type')
    assert.equal(peerInformPanelLines.join('\n').includes('diagnostic peer message ref'), false, 'default panel should not expose diagnostic peer event text')

    const progressLeaderMailboxBefore = modules.state.readMailbox('full-suite-team', 'team-lead').length
    const progressLeaderProjectionBefore = Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length
    const progressOutboxBefore = modules.state.listOutboxEffects('full-suite-team').length
    const progressLeaderRequestsBefore = deliveryRequestsForMember('team-lead')
    const progressTaskNotesBefore = legacyNotes(modules.state.readTeamState('full-suite-team').tasks['T001']).length
    const progressEventsBefore = Object.keys(modules.state.readTeamState('full-suite-team').taskEvents).length
    const progressEffects = []
    const taskService = helpers.requireDist('tools/taskService.js')
    const taskApplication = helpers.requireDist('app/taskApplication.js')
    assert.equal(typeof taskApplication.executeTaskApplication, 'function', 'task app boundary should expose the task use-case')
    res = await taskService.executeTaskAction({
      action: 'progress',
      taskId: 'T001',
      note: 'ordinary progress should inform only',
    }, researchCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      requestLeaderAttentionIfNeeded: async () => {
        progressEffects.push('leaderAttention')
        return { ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'projected', method: 'leader_attention_requested' }
      },
      requestWorkerDelivery: async () => {
        progressEffects.push('workerDelivery')
        return { ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'worker delivery requested', method: 'bridge_requested' }
      },
      invalidateStatus: () => {
        progressEffects.push('invalidateStatus')
      },
    }))
    helpers.assertContains(res.content[0].text, 'Recorded progress on T001')
    assert.equal(res.details.leaderMailboxDelivered, undefined, 'worker progress must not inform leader mailbox')
    assert.deepEqual(progressEffects, ['invalidateStatus'], 'progress must only invalidate UI status')
    const progressLeaderMailbox = modules.state.readMailbox('full-suite-team', 'team-lead')
    assert.equal(progressLeaderMailbox.length, progressLeaderMailboxBefore, 'progress should not create a leader mailbox message')
    assertDeliveryRequestsUnchanged('team-lead', progressLeaderRequestsBefore, 'progress must not create leader delivery requests')
    assert.equal(Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length, progressLeaderProjectionBefore, 'progress must not create leader projection state')
    assert.equal(modules.state.listOutboxEffects('full-suite-team').length, progressOutboxBefore, 'progress must not enqueue outbox side effects')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(legacyNotes(team.tasks['T001']).length, progressTaskNotesBefore, 'progress should not append TeamTask.notes')
    assert.equal(Object.keys(team.taskEvents).length, progressEventsBefore + 1, 'progress should append one TaskEvent')
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T001' && event.type === 'progress' && event.summary === 'ordinary progress should inform only' && event.data?.source === 'agentteam_task_progress'), 'progress should write TaskEvent only')

    const unsupportedNoteEventsBefore = Object.keys(team.taskEvents).length
    res = await taskService.executeTaskAction({
      action: 'note',
      taskId: 'T001',
      note: 'removed note action should be rejected',
    }, researchCtx, env.patches.withOutboxHandlers(env.patches.deps))
    assert.equal(res.details.denied, true, 'removed note action should be denied for workers')
    assert.equal(legacyNotes(modules.state.readTeamState('full-suite-team').tasks['T001']).length, progressTaskNotesBefore, 'removed note action should not append legacy task notes')
    assert.equal(Object.keys(modules.state.readTeamState('full-suite-team').taskEvents).length, unsupportedNoteEventsBefore, 'removed note action should not append TaskEvent')

    const unsupportedSendLeaderMailboxBefore = modules.state.readMailbox('full-suite-team', 'team-lead').length
    const unsupportedSendEventsBefore = modules.state.readTeamState('full-suite-team').events?.length ?? 0
    const unsupportedSendRequestsBefore = deliveryRequestsForMember('team-lead')
    for (const unsupportedType of ['fyi', 'blocked', 'report_done']) {
      res = await tool('agentteam_send').execute(`send-${unsupportedType}-unsupported`, {
        to: 'team-lead',
        message: `${unsupportedType} should be rejected by send schema`,
        type: unsupportedType,
        taskId: 'T001',
      }, null, () => {}, researchCtx)
      assert.equal(res.details.denied, true)
      assert.equal(res.details.reason, 'unsupported_message_type')
      assert.equal(res.details.type, unsupportedType)
      helpers.assertContains(res.content[0].text, 'Allowed types: assignment, question, inform')
    }
    assert.equal(modules.state.readMailbox('full-suite-team', 'team-lead').length, unsupportedSendLeaderMailboxBefore, 'unsupported send types should not write leader mailbox')
    assert.equal(modules.state.readTeamState('full-suite-team').events?.length ?? 0, unsupportedSendEventsBefore, 'unsupported send types should not append peer event')
    assertDeliveryRequestsUnchanged('team-lead', unsupportedSendRequestsBefore, 'unsupported send types should not create or refresh leader delivery')

    let leadMailbox = modules.state.readMailbox('full-suite-team', 'team-lead')

    res = await tool('agentteam_task').execute('task-close-worker', {
      action: 'report_done',
      taskId: 'T001',
      note: 'Done',
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, 'Reported done for T001 to team-lead')
    assert.equal(res.details.reportOnly, true)

    team = modules.state.readTeamState('full-suite-team')
    const coreDoneReportT001 = coreReducer.transitionTask(
      { ...team.tasks['T001'], updatedAt: team.tasks['T001'].updatedAt - 1 },
      { type: 'report_done', at: team.tasks['T001'].updatedAt, actor: 'research-one', note: 'Done' },
    )
    assert.equal(coreDoneReportT001.ok, true)
    assert.equal(team.tasks['T001'].status, coreDoneReportT001.task.status, 'production report_done status should match core reducer')
    assert.equal(team.tasks['T001'].status, 'open', 'worker done report should be report-only and not mutate task status')
    assert.equal(team.tasks['T001'].owner, 'research-one', 'worker done report report should not mutate owner')
    assert.deepEqual(team.tasks['T001'].blockedBy, [], 'worker done report report should not mutate blockers')
    assert.equal(legacyNotes(team.tasks['T001']).length, progressTaskNotesBefore, 'worker report_done should not append TeamTask.notes')
    assert.equal(legacyNotes(team.tasks['T001']).some(note => note.messageType === 'report_done' && note.metadata?.reportOnly === true), false, 'worker report_done should not append report-only task note')
    assert.equal(legacyNotes(team.tasks['T001']).filter(note => note.text.startsWith('Linked message:') && note.text.includes('done report by research-one')).length, 0, 'worker done report should not append linked mailbox task note')
    const t001DoneReports = Object.values(team.taskReports).filter(report => report.taskId === 'T001' && report.type === 'report_done' && report.author === 'research-one')
    assert.equal(t001DoneReports.length, 1, 'worker report_done should dual-write one TaskReport')
    assert.equal(t001DoneReports[0].text, 'Done')
    assert.equal(t001DoneReports[0].reportOnly, true)
    assert.equal(t001DoneReports[0].reporterIsOwner, true)
    assert.equal(t001DoneReports[0].statusAtReport, 'open')
    assert.equal(t001DoneReports[0].ownerAtReport, 'research-one')
    assert.ok(t001DoneReports[0].mailboxMessageId?.startsWith('mailbox-outbox-'), 'TaskReport should back-reference delivered leader mailbox id')
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T001' && event.type === 'report_submitted' && event.reportId === t001DoneReports[0].id), 'worker report_done should dual-write report_submitted event')

    res = await tool('agentteam_task').execute('query-show-worker', {
      action: 'show',
      taskId: 'T001',
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, 'T001 [open] Inspect project')
    helpers.assertContains(res.content[0].text, 'History counts: reports 1, events')
    helpers.assertContains(res.content[0].text, `Latest report: ${t001DoneReports[0].id} report_done by research-one — Done`)
    helpers.assertContains(res.content[0].text, 'messageRefs 3')
    assert.equal(res.content[0].text.includes('peer handoff with report summary'), false, 'show must not copy full peer message body')
    assert.equal(res.content[0].text.includes('report_done: Done'), false, 'show must expose report summary but not a full report-body line')
    assert.equal(res.details.latestReport.text, undefined, 'show latestReport details must not include full report body')
    assert.equal(res.details.counts.reports, 1)
    assert.equal(res.details.counts.messageRefs, 3)

    res = await tool('agentteam_task').execute('query-reports-worker', {
      action: 'reports',
      taskId: 'T001',
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, `Reports for T001: 1 report`)
    helpers.assertContains(res.content[0].text, `${t001DoneReports[0].id} report_done by research-one`)
    helpers.assertContains(res.content[0].text, 'Done')
    assert.equal(res.content[0].text.includes('Report text:'), false, 'reports must not include full report body section')
    assert.equal(res.content[0].text.includes('peer handoff with report summary'), false, 'reports must not include ordinary message bodies')
    assert.equal(res.details.reports[0].text, undefined, 'reports details must not include full report body')

    res = await tool('agentteam_task').execute('query-report-worker', {
      action: 'report',
      reportId: t001DoneReports[0].id,
      taskId: 'T001',
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, `${t001DoneReports[0].id} report_done for T001 by research-one`)
    helpers.assertContains(res.content[0].text, 'Report text:\nDone')
    assert.equal(res.details.text, 'Done')
    assert.equal(res.details.report.text, undefined, 'report metadata should stay compact even when full text is returned separately')

    res = await tool('agentteam_task').execute('query-history-worker-limit', {
      action: 'history',
      taskId: 'T001',
      limit: 10,
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, 'History for T001: showing 8 of')
    helpers.assertContains(res.content[0].text, 'limit 10; messageRefs included')
    helpers.assertContains(res.content[0].text, 'messageRef')
    helpers.assertContains(res.content[0].text, 'compact peer handoff summary')
    helpers.assertContains(res.content[0].text, `${t001DoneReports[0].id} report_done by research-one: Done`)
    assert.equal(res.content[0].text.includes('Report text:'), false, 'history must not include full report body section')
    assert.equal(res.content[0].text.includes('peer handoff with report summary'), false, 'history must not include full ordinary message body')
    assert.equal(JSON.stringify(res.details.rows).includes('peer handoff with report summary'), false, 'history details must not include full ordinary message body')
    assert.equal(res.details.filter.limit, 10)
    assert.equal(res.details.filter.includeMessages, true)

    res = await tool('agentteam_task').execute('query-history-worker-bounded', {
      action: 'history',
      taskId: 'T001',
      limit: 3,
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, 'History for T001: showing 3 of 8 rows')
    assert.equal(res.details.shownCount, 3)
    assert.equal(res.details.hiddenCount, 5)
    assert.equal(res.details.filter.limit, 3)

    await assert.rejects(
      () => tool('agentteam_task').execute('query-history-missing-task', {
        action: 'history',
        taskId: 'T999',
      }, null, () => {}, researchCtx),
      /Task T999 not found/,
    )
    await assert.rejects(
      () => tool('agentteam_task').execute('query-report-missing', {
        action: 'report',
        reportId: 'TR9999',
      }, null, () => {}, researchCtx),
      /Task report TR9999 not found/,
    )
    await assert.rejects(
      () => tool('agentteam_task').execute('query-report-wrong-task', {
        action: 'report',
        reportId: t001DoneReports[0].id,
        taskId: 'T002',
      }, null, () => {}, researchCtx),
      new RegExp(`Task report ${t001DoneReports[0].id} is for task T001, not T002`),
    )

    leadMailbox = modules.state.readMailbox('full-suite-team', 'team-lead')
    const t001DoneMailbox = leadMailbox.find(m => m.type === 'report_done' && m.metadata?.reportId === t001DoneReports[0].id)
    assert.ok(t001DoneMailbox, 'worker done report should notify leader with TaskReport reference')
    assert.ok(t001DoneMailbox.text.includes('done report by research-one'), 'compact report mailbox should keep notification identity')
    assert.equal(t001DoneMailbox.text.includes('Done'), false, 'compact report mailbox should not duplicate full report body')
    assert.equal(t001DoneMailbox.summary.includes('Done'), true, 'compact report mailbox may include report summary')
    assert.equal(t001DoneMailbox.deliveredAt, undefined, 'new compact report mailbox should start undelivered')
    assert.equal(t001DoneMailbox.readAt, undefined, 'new compact report mailbox should start unread')

    res = await tool('agentteam_receive').execute('query-report-receive-hydrated-unread', {
      markRead: false,
      limit: 50,
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, `Hydrated report ${t001DoneReports[0].id}`)
    helpers.assertContains(res.content[0].text, 'Report text:\nDone')
    assert.equal(res.details.hydratedReports[t001DoneReports[0].id].text, 'Done')
    assert.ok(res.details.messages.some(message => message.id === t001DoneMailbox.id && message.text === t001DoneMailbox.text), 'details.messages should preserve compact mailbox row')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.taskReports[t001DoneReports[0].id].mailboxMessageId, t001DoneMailbox.id, 'TaskReport should retain delivered leader mailbox message id')
    let t001DoneMailboxAfterUnreadReceive = modules.state.readMailbox('full-suite-team', 'team-lead').find(m => m.id === t001DoneMailbox.id)
    assert.ok(t001DoneMailboxAfterUnreadReceive.deliveredAt, 'receive markRead=false should stamp deliveredAt')
    assert.equal(t001DoneMailboxAfterUnreadReceive.readAt, undefined, 'receive markRead=false should not stamp readAt')

    res = await tool('agentteam_receive').execute('query-report-receive-hydrated-read', {
      markRead: true,
      limit: 50,
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, `Hydrated report ${t001DoneReports[0].id}`)
    helpers.assertContains(res.content[0].text, 'Report text:\nDone')
    assert.equal(res.details.hydratedReports[t001DoneReports[0].id].text, 'Done')
    t001DoneMailboxAfterUnreadReceive = modules.state.readMailbox('full-suite-team', 'team-lead').find(m => m.id === t001DoneMailbox.id)
    assert.ok(t001DoneMailboxAfterUnreadReceive.deliveredAt, 'receive markRead=true should retain deliveredAt')
    assert.ok(t001DoneMailboxAfterUnreadReceive.readAt, 'receive markRead=true should stamp readAt')

    modules.state.pushMailboxMessage('full-suite-team', 'team-lead', {
      id: 'legacy-report-mailbox-full-text',
      from: 'legacy-worker',
      to: 'team-lead',
      text: 'legacy stored report full text body',
      summary: 'legacy report summary',
      type: 'report_done',
      taskId: 'T001',
      threadId: 'task:T001',
      priority: 'normal',
      wakeHint: 'hard',
      metadata: { reportOnly: true },
      createdAt: Date.now() + 1,
    })
    res = await tool('agentteam_receive').execute('query-report-receive-legacy-fallback', {
      markRead: true,
      limit: 50,
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'legacy stored report full text body')
    assert.equal(res.details.hydratedReports, undefined, 'legacy report mailbox without reportId should not claim hydration')

    res = await tool('agentteam_task').execute('task-close-owned-create', {
      action: 'report_done',
      taskId: 'T002',
      note: 'planner done task created with owner',
    }, null, () => {}, planCtx)
    helpers.assertContains(res.content[0].text, 'Reported done for T002 to team-lead')
    assert.equal(res.details.reportOnly, true)
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, 'open', 'planner done report should be report-only and not mutate task status')
    assert.equal(legacyNotes(team.tasks['T002']).length, 0, 'planner report_done should not append TeamTask.notes')
    assert.equal(legacyNotes(team.tasks['T002']).filter(note => note.text.startsWith('Linked message:') && note.text.includes('done report by plan-one')).length, 0, 'planner done report should not append linked mailbox task note')

    res = await tool('agentteam_task').execute('planner-create-denied', {
      action: 'create',
      title: 'Planner should not create',
      description: 'planner default advisory only',
    }, null, () => {}, planCtx)
    assert.equal(res.details.denied, true)
    helpers.assertContains(res.content[0].text, "Task action 'create' is leader-only")

    res = await tool('agentteam_task').execute('planner-assign-denied', {
      action: 'assign',
      taskId: 'T002',
      owner: 'plan-one',
    }, null, () => {}, planCtx)
    assert.equal(res.details.denied, true)
    helpers.assertContains(res.content[0].text, "Task action 'assign' is leader-only")

    res = await tool('agentteam_task').execute('planner-block-denied', {
      action: 'block',
      taskId: 'T002',
    }, null, () => {}, planCtx)
    assert.equal(res.details.denied, true)
    helpers.assertContains(res.content[0].text, "Task action 'block' is leader-only")

    res = await tool('agentteam_task').execute('worker-report-blocked', {
      action: 'report_blocked',
      taskId: 'T002',
      note: 'Need leader decision',
      blockedBy: ['leader decision'],
    }, null, () => {}, planCtx)
    helpers.assertContains(res.content[0].text, 'Reported blocked status for T002 to team-lead')
    assert.equal(res.details.reportOnly, true)
    assert.deepEqual(res.details.reportedBlockedBy, ['leader decision'])
    team = modules.state.readTeamState('full-suite-team')
    const coreBlockedReportT002 = coreReducer.transitionTask(
      { ...team.tasks['T002'], updatedAt: team.tasks['T002'].updatedAt - 1 },
      { type: 'report_blocked', at: team.tasks['T002'].updatedAt, actor: 'plan-one', note: 'Need leader decision' },
    )
    assert.equal(coreBlockedReportT002.ok, true)
    assert.equal(team.tasks['T002'].status, coreBlockedReportT002.task.status, 'production report_blocked status should match core reducer')
    assert.equal(team.tasks['T002'].status, 'open', 'report_blocked should not mutate task status')
    assert.deepEqual(team.tasks['T002'].blockedBy, [], 'report_blocked should not mutate task blockedBy')
    assert.equal(legacyNotes(team.tasks['T002']).length, 0, 'report_blocked should not append TeamTask.notes')
    assert.equal(legacyNotes(team.tasks['T002']).some(note => note.messageType === 'report_blocked' && note.metadata?.reportOnly === true), false, 'report_blocked should not append blocked report-only note')
    assert.equal(legacyNotes(team.tasks['T002']).filter(note => note.text.startsWith('Linked message:') && note.text.includes('blocked report by plan-one')).length, 0, 'report_blocked should not append linked mailbox task note')
    const t002BlockedReports = Object.values(team.taskReports).filter(report => report.taskId === 'T002' && report.type === 'report_blocked' && report.author === 'plan-one')
    assert.equal(t002BlockedReports.length, 1, 'report_blocked should dual-write one TaskReport')
    assert.equal(t002BlockedReports[0].text, 'Need leader decision\nBlocked by: leader decision')
    assert.deepEqual(t002BlockedReports[0].reportedBlockedBy, ['leader decision'])
    assert.equal(t002BlockedReports[0].reporterIsOwner, true)
    assert.equal(t002BlockedReports[0].ownerAtReport, 'plan-one')
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T002' && event.type === 'report_submitted' && event.reportId === t002BlockedReports[0].id), 'report_blocked should dual-write report_submitted event')
    leadMailbox = modules.state.readMailbox('full-suite-team', 'team-lead')
    const blockedReport = leadMailbox.find(m => m.type === 'report_blocked' && m.text.includes('blocked report by plan-one'))
    assert.ok(blockedReport, 'report_blocked should notify leader')
    assert.equal(blockedReport.priority, 'high')
    assert.equal(blockedReport.wakeHint, 'hard')
    assert.equal(blockedReport.metadata?.policyIntent, 'leader_attention')
    assert.equal(blockedReport.metadata?.reportOnly, true)
    assert.equal(blockedReport.metadata?.reporterIsOwner, true)
    assert.equal(blockedReport.metadata?.reportId, t002BlockedReports[0].id, 'blocked report mailbox should reference TaskReport id')
    assert.equal(blockedReport.text.includes('Need leader decision'), false, 'blocked report mailbox should not duplicate full report body')

    const nonOwnerBlockedMailboxBefore = modules.state.readMailbox('full-suite-team', 'team-lead').length
    const nonOwnerBlockedProjectionBefore = Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length
    const nonOwnerBlockedTeamLeadRequestsBefore = deliveryRequestsForMember('team-lead')
    const nonOwnerBlockedReportsBefore = Object.keys(modules.state.readTeamState('full-suite-team').taskReports).length
    const nonOwnerBlockedReportEventsBefore = Object.values(modules.state.readTeamState('full-suite-team').taskEvents).filter(event => event.type === 'report_submitted').length
    res = await tool('agentteam_task').execute('non-owner-report-blocked', {
      action: 'report_blocked',
      taskId: 'T002',
      note: 'Cross-team dependency looks blocked',
      blockedBy: ['external dependency'],
    }, null, () => {}, researchCtx)
    helpers.assertContains(res.content[0].text, 'Cannot report_blocked T002: research-one is not the task owner (plan-one)')
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'task_reporter_not_owner')
    assert.equal(res.details.actor, 'research-one')
    assert.equal(res.details.taskOwner, 'plan-one')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, 'open', 'non-owner report_blocked should not mutate task status')
    assert.equal(team.tasks['T002'].owner, 'plan-one', 'non-owner report_blocked should not mutate owner')
    assert.deepEqual(team.tasks['T002'].blockedBy, [], 'non-owner report_blocked should not mutate blockedBy')
    assert.equal(legacyNotes(team.tasks['T002']).some(note => note.author === 'research-one' && note.messageType === 'report_blocked'), false, 'non-owner report_blocked must not append task note')
    assert.equal(Object.keys(team.taskReports).length, nonOwnerBlockedReportsBefore, 'non-owner report_blocked must not append TaskReport')
    assert.equal(Object.values(team.taskEvents).filter(event => event.type === 'report_submitted').length, nonOwnerBlockedReportEventsBefore, 'non-owner report_blocked must not append report_submitted event')
    leadMailbox = modules.state.readMailbox('full-suite-team', 'team-lead')
    assert.equal(leadMailbox.length, nonOwnerBlockedMailboxBefore, 'non-owner report_blocked must not notify leader')
    assert.equal(leadMailbox.some(m => m.type === 'report_blocked' && m.text.includes('blocked report by research-one')), false, 'non-owner report_blocked must not notify leader')
    assert.equal(Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length, nonOwnerBlockedProjectionBefore, 'non-owner report_blocked must not create leader projection state')
    assertDeliveryRequestsUnchanged('team-lead', nonOwnerBlockedTeamLeadRequestsBefore, 'non-owner report_blocked must not create leader delivery')

    const nonOwnerDoneNotesBefore = legacyNotes(team.tasks['T002']).length
    const nonOwnerDoneMailboxBefore = modules.state.readMailbox('full-suite-team', 'team-lead').length
    const nonOwnerDoneProjectionBefore = Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length
    const nonOwnerDoneTeamLeadRequestsBefore = deliveryRequestsForMember('team-lead')
    const nonOwnerDoneReportsBefore = Object.keys(team.taskReports).length
    const nonOwnerDoneReportEventsBefore = Object.values(team.taskEvents).filter(event => event.type === 'report_submitted').length
    const nonOwnerDoneEffects = []
    res = await taskService.executeTaskAction({
      action: 'report_done',
      taskId: 'T002',
      note: 'Cross-team done report must be rejected',
    }, researchCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      pushMailboxMessage: async () => {
        nonOwnerDoneEffects.push('pushMailbox')
        throw new Error('non-owner report_done should not push mailbox')
      },
      requestLeaderAttentionIfNeeded: async () => {
        nonOwnerDoneEffects.push('leaderAttention')
        throw new Error('non-owner report_done should not project')
      },
      requestWorkerDelivery: async () => {
        nonOwnerDoneEffects.push('workerDelivery')
        throw new Error('non-owner report_done should not deliver')
      },
      invalidateStatus: () => {
        nonOwnerDoneEffects.push('invalidateStatus')
      },
    }))
    helpers.assertContains(res.content[0].text, 'Cannot report_done T002: research-one is not the task owner (plan-one)')
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'task_reporter_not_owner')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(legacyNotes(team.tasks['T002']).length, nonOwnerDoneNotesBefore, 'non-owner report_done must not append task note')
    assert.equal(Object.keys(team.taskReports).length, nonOwnerDoneReportsBefore, 'non-owner report_done must not append TaskReport')
    assert.equal(Object.values(team.taskEvents).filter(event => event.type === 'report_submitted').length, nonOwnerDoneReportEventsBefore, 'non-owner report_done must not append report_submitted event')
    assert.equal(modules.state.readMailbox('full-suite-team', 'team-lead').length, nonOwnerDoneMailboxBefore, 'non-owner report_done must not notify leader')
    assert.equal(Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length, nonOwnerDoneProjectionBefore, 'non-owner report_done must not create leader projection state')
    assertDeliveryRequestsUnchanged('team-lead', nonOwnerDoneTeamLeadRequestsBefore, 'non-owner report_done must not create leader delivery')
    assert.deepEqual(nonOwnerDoneEffects, ['invalidateStatus'], 'non-owner report_done should only invalidate UI status after denial')

    const factualBlockPlanRequestsBefore = deliveryRequestsForMember('plan-one')
    res = await tool('agentteam_task').execute('leader-block-factually', {
      action: 'block',
      taskId: 'T002',
      blockedBy: ['leader decision'],
      note: 'Leader accepted blocker',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Blocked T002')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, 'blocked', 'leader block should factually block task')
    assert.deepEqual(team.tasks['T002'].blockedBy, ['leader decision'])
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T002' && event.type === 'blocked' && event.data?.blockedBy?.[0] === 'leader decision'), 'leader factual block should dual-write blocked event')

    assertDeliveryRequestsUnchanged('plan-one', factualBlockPlanRequestsBefore, 'leader factual block should not create or refresh worker delivery')

    const assignmentWhileBlockedMailboxBefore = modules.state.readMailbox('full-suite-team', 'plan-one').length
    const assignmentWhileBlockedRequestsBefore = deliveryRequestsForMember('plan-one')
    res = await tool('agentteam_send').execute('send-assignment-factually-blocked-denied', {
      to: 'plan-one',
      message: 'Try to work T002 while blocked',
      type: 'assignment',
      taskId: 'T002',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'task_blocked_by_gate')
    assert.equal(modules.state.readMailbox('full-suite-team', 'plan-one').length, assignmentWhileBlockedMailboxBefore, 'factually blocked assignment deny should not push mailbox')
    assertDeliveryRequestsUnchanged('plan-one', assignmentWhileBlockedRequestsBefore, 'factually blocked assignment deny should not create or refresh delivery')

    const beforeBlockedUpdateComplete = modules.state.readTeamState('full-suite-team').tasks['T002']
    const blockCompleteRequestsBefore = deliveryRequestsForMember('plan-one')
    res = await tool('agentteam_task').execute('leader-block-blocked-denied', {
      action: 'block',
      taskId: 'T002',
      note: 'try to block while already blocked',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'invalid_task_status')
    helpers.assertContains(res.content[0].text, 'Cannot block T002: expected open, got blocked')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, beforeBlockedUpdateComplete.status, 'denied block done should not mutate status')
    assert.deepEqual(team.tasks['T002'].blockedBy, beforeBlockedUpdateComplete.blockedBy, 'denied block done should retain blockers')
    assert.equal(team.tasks['T002'].updatedAt, beforeBlockedUpdateComplete.updatedAt, 'denied block done should not mutate task timestamp')
    assertDeliveryRequestsUnchanged('plan-one', blockCompleteRequestsBefore, 'denied block done should not create or refresh delivery')

    res = await tool('agentteam_task').execute('leader-unblock-factually', {
      action: 'unblock',
      taskId: 'T002',
      note: 'Leader cleared blocker',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Unblocked T002')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, 'open', 'leader unblock should factually unblock task')
    assert.deepEqual(team.tasks['T002'].blockedBy, [])
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T002' && event.type === 'unblocked'), 'leader unblock should dual-write unblocked event')

    res = await tool('agentteam_task').execute('leader-close-blocked-allowed', {
      action: 'close',
      taskId: 'T003',
      note: 'leader accepts closure from blocked state',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Closed T003')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T003'].status, 'done')
    assert.deepEqual(team.tasks['T003'].blockedBy, [])
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T003' && event.type === 'closed'), 'leader close should dual-write closed event')

    res = await taskService.executeTaskAction({
      action: 'report_done',
      taskId: 'T002',
      note: 'Done but projection fails',
    }, planCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      requestLeaderAttentionIfNeeded: async (_team, message) => {
        assert.equal(message.type, 'report_done')
        assert.equal(message.wakeHint, 'hard')
        assert.equal(String(message.text).includes('Done but projection fails'), false, 'leader attention should remain compact and omit full report body')
        throw new Error('simulated projection failure')
      },
    }))
    helpers.assertContains(res.content[0].text, 'Reported done for T002 to team-lead')
    helpers.assertContains(res.content[0].text, 'warning: side effect failed')
    assert.equal(res.details.reportOnly, true)
    assert.equal(res.details.warning, 'side_effect_failed')
    assert.ok(res.details.sideEffectWarnings.some(item => item.kind === 'requestLeaderAttention' && item.error.includes('simulated projection failure')))

    const doneReportTeamBeforeMailboxFailure = modules.state.readTeamState('full-suite-team')
    const doneReportNotesBeforeMailboxFailure = legacyNotes(doneReportTeamBeforeMailboxFailure.tasks['T002']).length
    const doneReportLinkedNotesBeforeMailboxFailure = legacyNotes(doneReportTeamBeforeMailboxFailure.tasks['T002']).filter(note => note.text.startsWith('Linked message:')).length
    const doneReportArtifactsBeforeMailboxFailure = Object.keys(doneReportTeamBeforeMailboxFailure.taskReports).length
    const doneReportEventsBeforeMailboxFailure = Object.values(doneReportTeamBeforeMailboxFailure.taskEvents).filter(event => event.type === 'report_submitted').length
    const doneReportMailboxFailureOrder = []
    res = await taskService.executeTaskAction({
      action: 'report_done',
      taskId: 'T002',
      note: 'Done but mailbox fails',
    }, planCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      pushMailboxMessage: async () => {
        doneReportMailboxFailureOrder.push('pushMailbox')
        throw new Error('simulated leader mailbox failure')
      },
      requestLeaderAttentionIfNeeded: async () => {
        doneReportMailboxFailureOrder.push('leaderAttention')
        return { ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'projected', method: 'projection_requested' }
      },
      invalidateStatus: () => {
        doneReportMailboxFailureOrder.push('invalidateStatus')
      },
    }))
    helpers.assertContains(res.content[0].text, 'Reported done for T002 to team-lead')
    helpers.assertContains(res.content[0].text, 'warning: side effect failed')
    helpers.assertContains(res.content[0].text, 'leader mailbox push failed for team-lead: simulated leader mailbox failure')
    assert.equal(res.details.reportOnly, true)
    assert.equal(res.details.warning, 'side_effect_failed')
    assert.equal(res.details.leaderMailboxDelivered, false)
    assert.deepEqual(res.details.mailboxDeliveryFailed, { recipient: 'team-lead', error: 'simulated leader mailbox failure' })
    assert.ok(res.details.sideEffectWarnings.some(item => item.kind === 'pushMailbox' && item.error.includes('simulated leader mailbox failure')))
    assert.deepEqual(doneReportMailboxFailureOrder.sort(), ['invalidateStatus', 'pushMailbox'], 'leader mailbox failure should not request leader attention/projection without a stored mailbox message')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, 'open', 'mailbox failure should not mutate report-only task status')
    assert.equal(legacyNotes(team.tasks['T002']).length, doneReportNotesBeforeMailboxFailure, 'mailbox failure should not append TeamTask.notes')
    assert.equal(legacyNotes(team.tasks['T002']).filter(note => note.text.startsWith('Linked message:')).length, doneReportLinkedNotesBeforeMailboxFailure, 'mailbox failure should not append a linked mailbox note')
    assert.equal(Object.keys(team.taskReports).length, doneReportArtifactsBeforeMailboxFailure + 1, 'mailbox failure should still append TaskReport artifact')
    assert.ok(Object.values(team.taskReports).some(report => report.text === 'Done but mailbox fails' && report.mailboxMessageId === undefined), 'mailbox failure TaskReport should not reference a missing mailbox message')
    assert.equal(Object.values(team.taskEvents).filter(event => event.type === 'report_submitted').length, doneReportEventsBeforeMailboxFailure + 1, 'mailbox failure should still append report_submitted event')

    const blockedNotesBeforeMailboxFailure = legacyNotes(team.tasks['T002']).length
    const blockedLinkedNotesBeforeMailboxFailure = legacyNotes(team.tasks['T002']).filter(note => note.text.startsWith('Linked message:')).length
    const blockedReportArtifactsBeforeMailboxFailure = Object.keys(team.taskReports).length
    const blockedReportEventsBeforeMailboxFailure = Object.values(team.taskEvents).filter(event => event.type === 'report_submitted').length
    const blockedMailboxFailureOrder = []
    res = await taskService.executeTaskAction({
      action: 'report_blocked',
      taskId: 'T002',
      note: 'Blocked but mailbox fails',
      blockedBy: ['leader decision'],
    }, planCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      pushMailboxMessage: async () => {
        blockedMailboxFailureOrder.push('pushMailbox')
        throw new Error('simulated leader mailbox failure')
      },
      requestLeaderAttentionIfNeeded: async () => {
        blockedMailboxFailureOrder.push('leaderAttention')
        return { ok: true, recipient: 'team-lead', wakeHint: 'hard', reason: 'projected', method: 'projection_requested' }
      },
      invalidateStatus: () => {
        blockedMailboxFailureOrder.push('invalidateStatus')
      },
    }))
    helpers.assertContains(res.content[0].text, 'Reported blocked status for T002 to team-lead')
    helpers.assertContains(res.content[0].text, 'warning: side effect failed')
    helpers.assertContains(res.content[0].text, 'leader mailbox push failed for team-lead: simulated leader mailbox failure')
    assert.equal(res.details.reportOnly, true)
    assert.equal(res.details.warning, 'side_effect_failed')
    assert.equal(res.details.leaderMailboxDelivered, false)
    assert.deepEqual(res.details.mailboxDeliveryFailed, { recipient: 'team-lead', error: 'simulated leader mailbox failure' })
    assert.ok(res.details.sideEffectWarnings.some(item => item.kind === 'pushMailbox' && item.error.includes('simulated leader mailbox failure')))
    assert.deepEqual(blockedMailboxFailureOrder.sort(), ['invalidateStatus', 'pushMailbox'], 'blocked report mailbox failure should not request leader attention/projection without a stored mailbox message')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T002'].status, 'open', 'blocked report mailbox failure should not mutate task status')
    assert.equal(legacyNotes(team.tasks['T002']).length, blockedNotesBeforeMailboxFailure, 'blocked report mailbox failure should not append TeamTask.notes')
    assert.equal(legacyNotes(team.tasks['T002']).filter(note => note.text.startsWith('Linked message:')).length, blockedLinkedNotesBeforeMailboxFailure, 'blocked report mailbox failure should not append a linked mailbox note')
    assert.equal(Object.keys(team.taskReports).length, blockedReportArtifactsBeforeMailboxFailure + 1, 'blocked report mailbox failure should still append TaskReport artifact')
    assert.ok(Object.values(team.taskReports).some(report => report.text === 'Blocked but mailbox fails\nBlocked by: leader decision' && report.mailboxMessageId === undefined), 'blocked mailbox failure TaskReport should not reference a missing mailbox message')
    assert.equal(Object.values(team.taskEvents).filter(event => event.type === 'report_submitted').length, blockedReportEventsBeforeMailboxFailure + 1, 'blocked report mailbox failure should still append report_submitted event')

    res = await tool('agentteam_task').execute('leader-close-worker-reported', {
      action: 'close',
      taskId: 'T001',
      note: 'Leader accepted done report',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Closed T001')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T001'].status, 'done', 'leader close should mutate status')
    assert.ok(Object.values(team.taskEvents).some(event => event.taskId === 'T001' && event.type === 'closed'), 'leader close accepted report should dual-write closed event')
    const coreClosedT001 = coreReducer.transitionTask(
      { ...team.tasks['T001'], status: 'open', updatedAt: team.tasks['T001'].updatedAt - 1 },
      { type: 'close', at: team.tasks['T001'].updatedAt },
    )
    assert.equal(coreClosedT001.ok, true)
    assert.equal(team.tasks['T001'].status, coreClosedT001.task.status, 'production close status should match core reducer')
    assert.equal(team.tasks['T001'].owner, 'research-one', 'leader close should not mutate owner')
    assert.deepEqual(team.tasks['T001'].blockedBy, [], 'leader close should clear blockers')

    const doneTaskBeforeReports = modules.state.readTeamState('full-suite-team').tasks['T001']
    const doneTaskNoteCountBeforeReports = legacyNotes(doneTaskBeforeReports).length
    const doneReportMailboxBefore = modules.state.readMailbox('full-suite-team', 'team-lead').length
    const doneReportProjectionBefore = Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length
    const doneReportTeamLeadRequestsBefore = deliveryRequestsForMember('team-lead')
    const doneReportEffects = []
    res = await taskService.executeTaskAction({
      action: 'report_done',
      taskId: 'T001',
      note: 'late done report after close',
    }, researchCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      pushMailboxMessage: async () => {
        doneReportEffects.push('pushMailbox')
        throw new Error('done report should not push mailbox')
      },
      requestLeaderAttentionIfNeeded: async () => {
        doneReportEffects.push('leaderAttention')
        throw new Error('done report should not project')
      },
      requestWorkerDelivery: async () => {
        doneReportEffects.push('workerDelivery')
        throw new Error('done report should not deliver')
      },
      invalidateStatus: () => {
        doneReportEffects.push('invalidateStatus')
      },
    }))
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'invalid_task_status')
    assert.equal(res.details.status, 'done')
    helpers.assertContains(res.content[0].text, 'Cannot report_done T001: expected open or blocked, got done')

    res = await taskService.executeTaskAction({
      action: 'report_blocked',
      taskId: 'T001',
      note: 'late blocked report after close',
      blockedBy: ['already done'],
    }, researchCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      pushMailboxMessage: async () => {
        doneReportEffects.push('pushMailbox')
        throw new Error('done blocked report should not push mailbox')
      },
      requestLeaderAttentionIfNeeded: async () => {
        doneReportEffects.push('leaderAttention')
        throw new Error('done blocked report should not project')
      },
      requestWorkerDelivery: async () => {
        doneReportEffects.push('workerDelivery')
        throw new Error('done blocked report should not deliver')
      },
      invalidateStatus: () => {
        doneReportEffects.push('invalidateStatus')
      },
    }))
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'invalid_task_status')
    assert.equal(res.details.status, 'done')
    helpers.assertContains(res.content[0].text, 'Cannot report_blocked T001: expected open or blocked, got done')

    team = modules.state.readTeamState('full-suite-team')
    assert.equal(team.tasks['T001'].status, 'done', 'denied reports on done task should not mutate status')
    assert.equal(legacyNotes(team.tasks['T001']).length, doneTaskNoteCountBeforeReports, 'denied reports on done task should not append task notes')
    assert.equal(modules.state.readMailbox('full-suite-team', 'team-lead').length, doneReportMailboxBefore, 'denied reports on done task should not notify leader')
    assert.equal(Object.keys(modules.state.readLeaderProjectionStore('full-suite-team').projections).length, doneReportProjectionBefore, 'denied reports on done task should not create projection state')
    assertDeliveryRequestsUnchanged('team-lead', doneReportTeamLeadRequestsBefore, 'denied reports on done task should not create leader delivery')
    assert.deepEqual(doneReportEffects, ['invalidateStatus', 'invalidateStatus'], 'denied reports on done task should only invalidate UI status')

    const doneCloseNotesBefore = legacyNotes(team.tasks['T001']).length
    const doneCloseMailboxBefore = modules.state.readMailbox('full-suite-team', 'team-lead').length
    const doneCloseEffects = []
    res = await taskService.executeTaskAction({
      action: 'close',
      taskId: 'T001',
      note: 'late close after close',
    }, leaderCtx, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      pushMailboxMessage: async () => {
        doneCloseEffects.push('pushMailbox')
        throw new Error('done close should not push mailbox')
      },
      requestLeaderAttentionIfNeeded: async () => {
        doneCloseEffects.push('leaderAttention')
        throw new Error('done close should not project')
      },
      requestWorkerDelivery: async () => {
        doneCloseEffects.push('workerDelivery')
        throw new Error('done close should not deliver')
      },
      invalidateStatus: () => {
        doneCloseEffects.push('invalidateStatus')
      },
    }))
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'invalid_task_status')
    assert.equal(res.details.status, 'done')
    helpers.assertContains(res.content[0].text, 'Cannot close T001: expected open or blocked, got done')
    team = modules.state.readTeamState('full-suite-team')
    assert.equal(legacyNotes(team.tasks['T001']).length, doneCloseNotesBefore, 'denied close on done task should not append task notes')
    assert.equal(modules.state.readMailbox('full-suite-team', 'team-lead').length, doneCloseMailboxBefore, 'denied close on done task should not notify leader')
    assert.deepEqual(doneCloseEffects, ['invalidateStatus'], 'denied close on done task should only invalidate UI status')

    const legacyValidationProbe = modules.state.validatePersistedTeamState({
      tasks: {
        T999: {
          id: 'T999',
          title: 'Legacy task status fixture',
          description: 'strict validation should quarantine before production task commands',
          status: 'in_progress',
          blockedBy: [],
          notes: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    })
    assert.ok(legacyValidationProbe.some(reason => reason.code === 'legacy_task_status' && reason.path === '$.tasks.T999.status' && reason.value === 'in_progress'), 'strict validation should reject legacy persisted task statuses before active task commands')

    const doneAssignmentMailboxBefore = modules.state.readMailbox('full-suite-team', 'research-one').length
    const doneAssignmentRequestsBefore = deliveryRequestsForMember('research-one')
    res = await tool('agentteam_send').execute('send-assignment-done-denied', {
      to: 'research-one',
      message: 'Try to reassign done T001',
      type: 'assignment',
      taskId: 'T001',
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.denied, true)
    assert.equal(res.details.reason, 'task_not_actionable')
    assert.equal(modules.state.readMailbox('full-suite-team', 'research-one').length, doneAssignmentMailboxBefore, 'done assignment deny should not push mailbox')
    assertDeliveryRequestsUnchanged('research-one', doneAssignmentRequestsBefore, 'done assignment deny should not create or refresh delivery')

    const mergeTeam = modules.state.createInitialTeamState({
      teamName: 'merge-freshness-suite',
      leaderSessionFile: '/tmp/merge-freshness-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.upsertMember(mergeTeam, {
      name: 'worker-one',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/merge-freshness-worker.jsonl',
      status: 'idle',
    })
    const mergeTask = modules.state.createTask(mergeTeam, {
      title: 'Freshness merge task',
      description: 'ensure stale writer does not clobber newer task/member state',
    })
    modules.state.writeTeamState(mergeTeam)

    const staleSnapshot = modules.state.readTeamState('merge-freshness-suite')
    const newerSnapshot = modules.state.readTeamState('merge-freshness-suite')

    // Newer writer blocks existing member + existing task.
    modules.state.updateMemberStatus(newerSnapshot, 'worker-one', {
      status: 'running',
      lastWakeReason: 'newer writer block',
    })
    newerSnapshot.tasks[mergeTask.id].status = 'blocked'
    newerSnapshot.tasks[mergeTask.id].updatedAt = Date.now() + 10
    modules.state.appendTaskEvent(newerSnapshot, {
      taskId: mergeTask.id,
      type: 'blocked',
      by: 'worker-one',
      at: Date.now() + 10,
      summary: 'newer task block',
    })
    modules.state.writeTeamState(newerSnapshot)

    // Stale writer blocks unrelated top-level field and writes older entity copies back.
    staleSnapshot.description = 'stale writer changed description only'
    modules.state.writeTeamState(staleSnapshot)

    const mergedFreshness = modules.state.readTeamState('merge-freshness-suite')
    assert.equal(mergedFreshness.members['worker-one'].status, 'running')
    assert.equal(mergedFreshness.members['worker-one'].lastWakeReason, 'newer writer block')
    assert.equal(mergedFreshness.tasks[mergeTask.id].status, 'blocked')
    assert.ok(
      Object.values(mergedFreshness.taskEvents).some(event => event.taskId === mergeTask.id && event.summary === 'newer task block'),
      'newer task event should survive stale writer merge',
    )
    assert.equal(mergedFreshness.description, 'stale writer changed description only')

    const statusKeyTeam = modules.state.createInitialTeamState({
      teamName: 'status-key-suite',
      leaderSessionFile: '/tmp/status-key-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.upsertMember(statusKeyTeam, {
      name: 'status-worker',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/status-key-worker.jsonl',
      status: 'idle',
    })
    modules.state.writeTeamState(statusKeyTeam)

    const statusCtx = helpers.createCtx('/tmp', '/tmp/status-key-leader.jsonl', env.notifications)
    const attachedStatus = {
      context: { teamName: 'status-key-suite', memberName: 'team-lead' },
      source: 'cached',
    }
    const statusKey1 = modules.runtime.buildSessionStatusKey(statusCtx, attachedStatus)

    const statusTeamV2 = modules.state.readTeamState('status-key-suite')
    modules.state.updateMemberStatus(statusTeamV2, 'status-worker', {
      status: 'running',
      lastWakeReason: 'status-key-block',
    })
    modules.state.writeTeamState(statusTeamV2)

    const statusKey2 = modules.runtime.buildSessionStatusKey(statusCtx, attachedStatus)
    assert.notEqual(statusKey1, statusKey2, 'status key should change when team revision changes')

    const storageTeam = modules.state.createInitialTeamState({
      teamName: 'storage-cache-suite',
      leaderSessionFile: '/tmp/storage-cache-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.upsertMember(storageTeam, {
      name: 'storage-worker',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/storage-cache-worker.jsonl',
      status: 'idle',
      paneId: '%storage-worker',
      windowTarget: 'test:@1',
    })

    modules.runtime.invalidateMailboxEnsureCache(storageTeam.name)
    modules.runtime.ensureTeamStorageReady(storageTeam)
    const leaderMailboxPath = modules.state.getMailboxPath(storageTeam.name, 'team-lead')
    const workerMailboxPath = modules.state.getMailboxPath(storageTeam.name, 'storage-worker')
    const leaderMtime = fs.statSync(leaderMailboxPath).mtimeMs
    const workerMtime = fs.statSync(workerMailboxPath).mtimeMs
    await new Promise(resolve => setTimeout(resolve, 5))
    modules.runtime.ensureTeamStorageReady(storageTeam)
    assert.equal(fs.statSync(leaderMailboxPath).mtimeMs, leaderMtime, 'ensureTeamStorageReady should avoid repeated leader mailbox writes')
    assert.equal(fs.statSync(workerMailboxPath).mtimeMs, workerMtime, 'ensureTeamStorageReady should avoid repeated worker mailbox writes')

    const originalResolvePaneBinding = modules.tmux.resolvePaneBinding
    let resolveCalls = 0
    modules.tmux.resolvePaneBinding = paneId => {
      resolveCalls += 1
      if (paneId === '%lost-pane') return null
      if (paneId === '%live-pane') return { paneId, target: 'test:@1' }
      return originalResolvePaneBinding(paneId)
    }

    const reconcileTeam = modules.state.createInitialTeamState({
      teamName: 'reconcile-invalidate-suite',
      leaderSessionFile: '/tmp/reconcile-invalidate-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.upsertMember(reconcileTeam, {
      name: 'lost-worker',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/reconcile-lost-worker.jsonl',
      status: 'running',
      paneId: '%lost-pane',
      windowTarget: 'test:@1',
    })
    modules.state.upsertMember(reconcileTeam, {
      name: 'live-worker',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/reconcile-live-worker.jsonl',
      status: 'idle',
      paneId: '%live-pane',
      windowTarget: 'test:@1',
    })

    modules.runtime.invalidatePaneReconcileCache()
    const firstReconcileChanged = modules.runtime.reconcileTeamPanes(reconcileTeam)
    const secondReconcileChanged = modules.runtime.reconcileTeamPanes(reconcileTeam)
    modules.tmux.resolvePaneBinding = originalResolvePaneBinding

    assert.equal(firstReconcileChanged, true, 'first reconcile should detect lost pane changes')
    assert.equal(secondReconcileChanged, false, 'second reconcile should be stable after healing')
    assert.equal(
      resolveCalls,
      3,
      'pane reconcile cache should be invalidated after pane-loss healing so immediate second reconcile still checks live panes',
    )

    const txTeam = modules.state.createInitialTeamState({
      teamName: 'transaction-suite',
      leaderSessionFile: '/tmp/transaction-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.upsertMember(txTeam, {
      name: 'transaction-worker',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/transaction-worker.jsonl',
      status: 'idle',
    })
    modules.state.writeTeamState(txTeam)

    const txUpdated = modules.state.updateTeamState('transaction-suite', team => {
      team.description = 'updated through transaction api'
      modules.state.updateMemberStatus(team, 'transaction-worker', {
        status: 'running',
        lastWakeReason: 'transaction block',
      })
      modules.state.createTask(team, {
        title: 'transaction task',
        description: 'created inside updateTeamState',
      })
    })

    assert.ok(txUpdated, 'updateTeamState should return updated team state')
    assert.equal(txUpdated.description, 'updated through transaction api')
    assert.equal(txUpdated.members['transaction-worker'].status, 'running')
    assert.equal(txUpdated.members['transaction-worker'].lastWakeReason, 'transaction block')
    assert.ok(txUpdated.tasks.T001, 'updateTeamState should persist task creation')

    const txMissing = modules.state.updateTeamState('missing-transaction-suite', team => team)
    assert.equal(txMissing, null, 'updateTeamState should return null for missing team')

    const txBeforeNoop = modules.state.readTeamState('transaction-suite')
    const txNoop = modules.state.updateTeamState('transaction-suite', () => undefined)
    assert.equal(txNoop.revision, txBeforeNoop.revision, 'no-op updateTeamState should not bump revision')

    const txBeforeSameStatus = modules.state.readTeamState('transaction-suite')
    const sameStatusUpdatedAt = txBeforeSameStatus.members['transaction-worker'].updatedAt
    const txSameStatus = modules.state.updateTeamState('transaction-suite', team => {
      modules.state.updateMemberStatus(team, 'transaction-worker', {
        status: 'running',
        lastWakeReason: 'transaction block',
      })
    })
    assert.equal(txSameStatus.revision, txBeforeSameStatus.revision, 'same member status patch should not bump revision')
    assert.equal(
      txSameStatus.members['transaction-worker'].updatedAt,
      sameStatusUpdatedAt,
      'same member status patch should not block member timestamp',
    )

    const txStatusChanged = modules.state.updateTeamState('transaction-suite', team => {
      modules.state.updateMemberStatus(team, 'transaction-worker', {
        status: 'idle',
        lastWakeReason: 'transaction finished',
      })
    })
    assert.equal(
      txStatusChanged.revision,
      txBeforeSameStatus.revision + 1,
      'actual member status change should bump revision',
    )
    assert.equal(txStatusChanged.members['transaction-worker'].status, 'idle')
    assert.equal(txStatusChanged.members['transaction-worker'].lastWakeReason, 'transaction finished')

    const concurrentTeam = modules.state.createInitialTeamState({
      teamName: 'concurrent-progress-suite',
      leaderSessionFile: '/tmp/concurrent-progress-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.upsertMember(concurrentTeam, {
      name: 'progress-worker-a',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/concurrent-progress-worker-a.jsonl',
      status: 'idle',
    })
    modules.state.upsertMember(concurrentTeam, {
      name: 'progress-worker-b',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/concurrent-progress-worker-b.jsonl',
      status: 'idle',
    })
    const concurrentTask = modules.state.createTask(concurrentTeam, {
      title: 'Concurrent progress',
      description: 'ensure transaction blocks preserve both progress events',
    })
    modules.state.writeTeamState(concurrentTeam)

    const progressWorkerACtx = helpers.createCtx('/tmp', '/tmp/concurrent-progress-worker-a.jsonl', env.notifications)
    const progressWorkerBCtx = helpers.createCtx('/tmp', '/tmp/concurrent-progress-worker-b.jsonl', env.notifications)
    await Promise.all([
      tool('agentteam_task').execute('concurrent-progress-a', {
        action: 'progress',
        taskId: concurrentTask.id,
        note: 'progress-from-a',
      }, null, () => {}, progressWorkerACtx),
      tool('agentteam_task').execute('concurrent-progress-b', {
        action: 'progress',
        taskId: concurrentTask.id,
        note: 'progress-from-b',
      }, null, () => {}, progressWorkerBCtx),
    ])
    const concurrentAfter = modules.state.readTeamState('concurrent-progress-suite')
    assert.equal(legacyNotes(concurrentAfter.tasks[concurrentTask.id]).length, 0, 'concurrent progress should not append TeamTask.notes')
    const concurrentProgress = Object.values(concurrentAfter.taskEvents).filter(event => event.taskId === concurrentTask.id && event.type === 'progress').map(event => event.summary)
    assert.ok(concurrentProgress.includes('progress-from-a'), 'transaction progress event block should preserve progress from worker A')
    assert.ok(concurrentProgress.includes('progress-from-b'), 'transaction progress event block should preserve progress from worker B')

    modules.state.deleteTeamState('concurrent-progress-suite')
    modules.state.deleteTeamState('status-key-suite')
    modules.state.deleteTeamState('storage-cache-suite')
    modules.state.deleteTeamState('reconcile-invalidate-suite')
    modules.state.deleteTeamState('transaction-suite')
  },
}
