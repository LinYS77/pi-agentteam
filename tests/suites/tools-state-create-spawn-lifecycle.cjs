const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

module.exports = {
  name: 'tools/state create-spawn lifecycle',
  async run(env) {
    const { pi, modules, helpers } = env
    const createSpawnLeaderCtx = helpers.createCtx(
      '/tmp/create-spawn-lifecycle-project',
      '/tmp/create-spawn-lifecycle-leader.jsonl',
      env.notifications,
    )
    const tool = name => pi.__tools.get(name)
    const cleanupCreateSpawnTeams = () => {
      for (const teamName of [
        'create-spawn-lifecycle-suite',
        'old-session-suite',
        'other-session-suite-a',
        'other-session-suite-b',
        'unsafe-existing-suite',
        `create-spawn-lifecycle-suite-${'rollback-long-team-name-'.repeat(6)}`,
      ]) {
        modules.state.deleteTeamState(teamName)
      }
      for (const sessionFile of [
        createSpawnLeaderCtx.sessionManager.getSessionFile(),
        '/tmp/new-session-suite-leader.jsonl',
        '/tmp/other-session-suite-leader.jsonl',
        '/tmp/unsafe-existing-suite-new-leader.jsonl',
      ]) {
        modules.state.clearSessionContext(sessionFile)
      }
    }

    // This suite uses an in-memory fake tmux pane set. Keep snapshot capture in
    // the same fake universe so host tmux pane IDs cannot collide with fixture
    // pane IDs during debounced leader mailbox refresh reconciliation.
    const originalTmux = {
      captureTmuxSnapshot: modules.tmux.captureTmuxSnapshot,
      captureCurrentPaneBinding: modules.tmux.captureCurrentPaneBinding,
      paneExists: modules.tmux.paneExists,
      createTeammatePane: modules.tmux.createTeammatePane,
      resolvePaneBinding: modules.tmux.resolvePaneBinding,
      waitForPaneAppStart: modules.tmux.waitForPaneAppStart,
      killPane: modules.tmux.killPane,
    }
    modules.tmux.captureTmuxSnapshot = (capturedAt = Date.now()) => ({
      capturedAt,
      panes: [],
      byPaneId: {},
      ok: false,
      error: 'test tmux snapshot unavailable',
    })

    try {
      cleanupCreateSpawnTeams()
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
      team_name: 'create-spawn-lifecycle-suite',
      description: 'Integration test team',
    }, null, () => {}, createSpawnLeaderCtx)
    helpers.assertContains(res.content[0].text, 'Created team create-spawn-lifecycle-suite')

    let team = modules.state.readTeamState('create-spawn-lifecycle-suite')
    assert.ok(team, 'team should exist after create')
    assert.equal(team.members['team-lead'].role, 'leader')

    res = await tool('agentteam_create').execute('create-already-attached', {
      team_name: 'create-spawn-lifecycle-suite',
      description: 'Already attached duplicate create',
    }, null, () => {}, createSpawnLeaderCtx)
    helpers.assertContains(res.content[0].text, 'already exists; current session is already attached')
    assert.equal(res.details.alreadyAttached, true)
    assert.equal(res.details.currentTeamName, 'create-spawn-lifecycle-suite')

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
      const existingLeaderSessionFile = '/tmp/unsafe-existing-suite-old-leader.jsonl'
      const existingLeaderCwd = '/tmp/unsafe-existing-suite-existing-cwd'
      const existingLeaderPaneId = '%still-live-leader'
      const existingLeaderWindowTarget = 'test:@2'
      const currentLeaderSessionFile = '/tmp/unsafe-existing-suite-new-leader.jsonl'
      const currentCwd = '/tmp/unsafe-existing-suite-new-cwd'
      const currentPaneId = '%current-collision-leader'
      const unattachedExistingTeam = modules.state.createInitialTeamState({
        teamName: 'unsafe-existing-suite',
        description: 'existing team that cannot attach without current pane',
        leaderSessionFile: existingLeaderSessionFile,
        leaderCwd: existingLeaderCwd,
      })
      unattachedExistingTeam.members['team-lead'].paneId = existingLeaderPaneId
      unattachedExistingTeam.members['team-lead'].windowTarget = existingLeaderWindowTarget
      modules.state.writeTeamState(unattachedExistingTeam)
      const existingTeamRawBeforeCollision = fs.readFileSync(modules.state.getTeamStatePath('unsafe-existing-suite'), 'utf8')
      modules.tmux.captureCurrentPaneBinding = () => ({ paneId: currentPaneId, target: 'test:@9' })
      modules.tmux.paneExists = paneId => paneId === existingLeaderPaneId || originalPaneExistsForCreate(paneId)
      const unsafeCtx = helpers.createCtx(currentCwd, currentLeaderSessionFile, env.notifications)
      res = await tool('agentteam_create').execute('create-existing-unsafe', {
        team_name: 'unsafe-existing-suite',
        description: 'cannot safely attach',
      }, null, () => {}, unsafeCtx)
      helpers.assertContains(res.content[0].text, 'Team unsafe-existing-suite already exists')
      assert.equal(res.details.denied, true)
      const collisionDiagnostic = `${res.content[0].text}\n${JSON.stringify(res.details, null, 2)}`
      const collisionViolations = []
      if (res.details.reason === 'team_exists_not_attached') {
        collisionViolations.push('reason should distinguish active same-name conflict elsewhere, not generic team_exists_not_attached')
      }
      if (!['team_name_conflict_active_elsewhere', 'team_exists_active_elsewhere'].includes(res.details.reason)) {
        collisionViolations.push(`reason should be an active-elsewhere conflict, got ${JSON.stringify(res.details.reason)}`)
      }
      for (const [label, value] of [
        ['existing leader cwd', existingLeaderCwd],
        ['existing leader session file', existingLeaderSessionFile],
        ['existing leader windowTarget', existingLeaderWindowTarget],
        ['existing leader paneId', existingLeaderPaneId],
        ['current cwd', currentCwd],
        ['current paneId', currentPaneId],
      ]) {
        if (!collisionDiagnostic.includes(value)) {
          collisionViolations.push(`${label} missing from active collision diagnostic: ${value}`)
        }
      }
      if (!/different\s+(team[_ -]?name|name)/i.test(res.content[0].text)) {
        collisionViolations.push('text should tell the user to choose a different team_name/name for an active conflict')
      }
      if (/\/team recover/i.test(res.content[0].text) && !/stale/i.test(res.content[0].text)) {
        collisionViolations.push('text may mention /team recover only for a stale existing leader pane')
      }
      if (/\/team recover/i.test(res.content[0].text) && !/different\s+(team[_ -]?name|name)/i.test(res.content[0].text)) {
        collisionViolations.push('text should not present /team recover as the default/only remediation for active conflict')
      }
      assert.deepEqual(collisionViolations, [], `active team name collision should include actionable diagnostics\n${collisionDiagnostic}`)
      assert.deepEqual(modules.state.readSessionContext(currentLeaderSessionFile), { teamName: null, memberName: null })
      assert.equal(fs.readFileSync(modules.state.getTeamStatePath('unsafe-existing-suite'), 'utf8'), existingTeamRawBeforeCollision, 'active collision must not modify existing team state')

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
    }, null, () => {}, createSpawnLeaderCtx)
    helpers.assertContains(res.content[0].text, 'Created idle teammate research-one (researcher)')
    helpers.assertContains(res.content[0].text, '[model: 077-glm-5.1]')
    assert.equal(res.details.model, '077-glm-5.1')
    assert.equal(res.details.modelLabel, '077-glm-5.1')
    assert.equal(res.details.modelSource, 'legacy')

    res = await tool('agentteam_spawn').execute('spawn-2', {
      name: 'Plan One',
      role: 'plan',
      task: '请先等待 research 的报告，收到消息后给出计划。',
    }, null, () => {}, createSpawnLeaderCtx)
    helpers.assertContains(res.content[0].text, 'Created teammate plan-one (planner)')
    helpers.assertContains(res.content[0].text, 'initial task delivery requested; worker busy')
    assert.ok(res.details.deliveryRequestId, 'spawn bootPrompt should create a durable bridge delivery request')
    assert.ok(res.details.outboxEffectId, 'spawn bootPrompt should be routed through a durable worker delivery Outbox effect')
    assert.equal(res.details.outboxStatus, 'done')
    const planOneOutbox = modules.state.getOutboxEffect('create-spawn-lifecycle-suite', res.details.outboxEffectId)
    assert.equal(planOneOutbox?.kind, 'worker_delivery_requested', 'spawn bootPrompt outbox effect kind should remain worker delivery')
    assert.equal(planOneOutbox?.idempotencyKey, ['spawn-initial-worker-delivery', 'create-spawn-lifecycle-suite', 'plan-one'].join(':'), 'spawn bootPrompt outbox idempotency key should preserve current team/member shape')
    assert.equal(planOneOutbox?.payload.memberName, 'plan-one')
    assert.equal(planOneOutbox?.payload.explicitTask, '请先等待 research 的报告，收到消息后给出计划。')
    assert.equal(planOneOutbox?.payload.options?.requestedBy, 'team-lead')
    assert.equal(planOneOutbox?.payload.options?.reason, 'initial spawn task')
    assert.equal(planOneOutbox?.payload.options?.wakeHint, 'hard')
    assert.equal(planOneOutbox?.result?.requestId, res.details.deliveryRequestId, 'spawn bootPrompt outbox result should expose delivery request id')
    helpers.assertContains(res.content[0].text, '[model: 077-gpt-5.4]')
    assert.equal(res.details.model, '077-gpt-5.4')
    assert.equal(res.details.modelLabel, '077-gpt-5.4')
    assert.equal(res.details.modelSource, 'legacy')

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
      }, null, () => {}, createSpawnLeaderCtx)
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
      }, null, () => {}, createSpawnLeaderCtx)
      assert.equal(res.ok, undefined)
      assert.equal(res.details.ok, false)
      helpers.assertContains(res.content[0].text, 'Failed to create tmux pane for retry-worker')
      helpers.assertContains(res.content[0].text, 'reserved member removed')
      helpers.assertContains(res.content[0].text, 'session context cleared')
      assert.equal(modules.state.readTeamState('create-spawn-lifecycle-suite').members['retry-worker'], undefined, 'failed pane create should roll back reserved member')
      assert.deepEqual(modules.state.readSessionContext(res.details.sessionFile), { teamName: null, memberName: null }, 'failed pane create should clear session context')
      assert.equal(fs.existsSync(res.details.sessionFile), false, 'failed pane create should remove worker session file if present/created')

      modules.tmux.createTeammatePane = originalCreateTeammatePane
      res = await tool('agentteam_spawn').execute('spawn-retry-after-create-failure', {
        name: 'Retry Worker',
        role: 'researcher',
      }, null, () => {}, createSpawnLeaderCtx)
      helpers.assertContains(res.content[0].text, 'Created idle teammate retry-worker (researcher)')
      assert.ok(modules.state.readTeamState('create-spawn-lifecycle-suite').members['retry-worker'], 'retry after rollback should succeed')

      const retryPaneId = res.details.paneId
      env.patches.livePanes.delete(retryPaneId)
      modules.state.updateTeamState('create-spawn-lifecycle-suite', latest => {
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
      }, null, () => {}, createSpawnLeaderCtx)
      assert.equal(res.details.ok, false)
      helpers.assertContains(res.content[0].text, 'Failed to keep tmux pane alive for binding-fail-worker')
      helpers.assertContains(res.content[0].text, 'failed spawn pane killed')
      assert.equal(killedPaneId, bindingFailurePane.paneId, 'binding failure should kill failed worker pane')
      assert.notEqual(killedPaneId, '%leader', 'spawn rollback must never kill current leader pane')
      assert.equal(env.patches.livePanes.has(bindingFailurePane.paneId), false, 'binding failure pane should be removed from live panes')
      assert.equal(modules.state.readTeamState('create-spawn-lifecycle-suite').members['binding-fail-worker'], undefined)
      assert.deepEqual(modules.state.readSessionContext(res.details.sessionFile), { teamName: null, memberName: null })

      modules.tmux.createTeammatePane = originalCreateTeammatePane
      modules.tmux.resolvePaneBinding = originalResolvePaneBindingForSpawn
      modules.tmux.killPane = originalKillPaneForSpawn
      res = await tool('agentteam_spawn').execute('spawn-retry-after-binding-failure', {
        name: 'Binding Fail Worker',
        role: 'researcher',
      }, null, () => {}, createSpawnLeaderCtx)
      helpers.assertContains(res.content[0].text, 'Created idle teammate binding-fail-worker (researcher)')
      env.patches.livePanes.delete(res.details.paneId)
      modules.state.updateTeamState('create-spawn-lifecycle-suite', latest => {
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
      }, null, () => {}, createSpawnLeaderCtx)
      assert.equal(res.details.ok, false)
      helpers.assertContains(res.content[0].text, 'Failed to start visible teammate session for timeout-worker')
      helpers.assertContains(res.content[0].text, 'failed spawn pane killed')
      assert.equal(killedPaneId, appStartPane.paneId, 'app-start timeout should kill failed worker pane')
      assert.notEqual(killedPaneId, '%leader', 'app-start timeout cleanup must not kill current leader pane')
      assert.equal(env.patches.livePanes.has(appStartPane.paneId), false, 'app-start timeout pane should be removed from live panes')
      assert.equal(modules.state.readTeamState('create-spawn-lifecycle-suite').members['timeout-worker'], undefined)
      assert.deepEqual(modules.state.readSessionContext(res.details.sessionFile), { teamName: null, memberName: null })

      modules.tmux.createTeammatePane = originalCreateTeammatePane
      modules.tmux.waitForPaneAppStart = originalWaitForPaneAppStart
      modules.tmux.killPane = originalKillPaneForSpawn
      res = await tool('agentteam_spawn').execute('spawn-retry-after-app-start-failure', {
        name: 'Timeout Worker',
        role: 'researcher',
      }, null, () => {}, createSpawnLeaderCtx)
      helpers.assertContains(res.content[0].text, 'Created idle teammate timeout-worker (researcher)')
      assert.ok(modules.state.readTeamState('create-spawn-lifecycle-suite').members['timeout-worker'], 'retry after app-start rollback should succeed')
    } finally {
      modules.tmux.createTeammatePane = originalCreateTeammatePane
      modules.tmux.resolvePaneBinding = originalResolvePaneBindingForSpawn
      modules.tmux.waitForPaneAppStart = originalWaitForPaneAppStart
      modules.tmux.killPane = originalKillPaneForSpawn
    }

    const longWorkerNameInput = `Long ${'WorkerName '.repeat(18)}`
    const longWorkerName = modules.runtimeRules.sanitizeWorkerName(longWorkerNameInput)
    team = modules.state.readTeamState('create-spawn-lifecycle-suite')
    let capturedLongSpawnPaneInput
    modules.tmux.createTeammatePane = async input => {
      capturedLongSpawnPaneInput = input
      return originalCreateTeammatePane(input)
    }
    res = await tool('agentteam_spawn').execute('spawn-long-bounded-worker-session', {
      name: longWorkerNameInput,
      role: 'researcher',
    }, null, () => {}, createSpawnLeaderCtx)
    assert.equal(res.details.ok, true)
    const longSessionBase = path.basename(res.details.sessionFile)
    assert.ok(longSessionBase.startsWith('worker-'), 'new worker session files should use bounded worker prefix')
    assert.ok(longSessionBase.length < 120, 'new worker session basename should remain safely bounded')
    assert.equal(res.details.sessionFile, modules.state.getWorkerSessionPath(team.name, longWorkerName), 'spawn should use shared worker session path helper')
    team = modules.state.readTeamState('create-spawn-lifecycle-suite')
    assert.equal(team.members[longWorkerName].sessionFile, res.details.sessionFile, 'member state should store bounded worker session path')
    assert.ok(capturedLongSpawnPaneInput.startCommand.includes("'--session'"), 'pi launch command should pass --session')
    assert.ok(capturedLongSpawnPaneInput.startCommand.includes(`'${res.details.sessionFile}'`), 'pi launch command should use the bounded worker session path')
    assert.deepEqual(modules.state.readSessionContext(res.details.sessionFile), { teamName: team.name, memberName: longWorkerName }, 'bounded worker session should be bound consistently')
    env.patches.livePanes.delete(res.details.paneId)
    modules.tmux.createTeammatePane = originalCreateTeammatePane
    modules.state.updateTeamState('create-spawn-lifecycle-suite', latest => {
      modules.state.removeMember(latest, longWorkerName)
    })
    modules.state.clearSessionContext(res.details.sessionFile)
    if (res.details.sessionFile) fs.rmSync(res.details.sessionFile, { force: true })

    const longDirectTeamName = `create-spawn-lifecycle-suite-${'rollback-long-team-name-'.repeat(6)}`
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
      }, null, () => {}, createSpawnLeaderCtx)
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
    team = modules.state.readTeamState('create-spawn-lifecycle-suite')
    const bridgeTimeoutMember = team.members['bridge-timeout-worker']
    assert.equal(bridgeTimeoutMember.status, 'pending_delivery', 'bridge timeout worker should not appear idle-ready')
    assert.equal(bridgeTimeoutMember.bridgeAvailable, false)
    assert.ok(String(bridgeTimeoutMember.bridgeLastError || '').includes('bridge handshake timed out'))
    const bridgeTimeoutRequests = Object.values(modules.state.readDeliveryRequestStore('create-spawn-lifecycle-suite').requests)
      .filter(request => request.memberName === 'bridge-timeout-worker')
    assert.equal(bridgeTimeoutRequests.length, 1)
    assert.equal(bridgeTimeoutRequests[0].requestId, res.details.deliveryRequestId)
    assert.equal(bridgeTimeoutRequests[0].status, 'pending')
    assert.equal(bridgeTimeoutRequests[0].bootPrompt, 'initial bridge task should remain queued')
    const bridgeTimeoutOutbox = modules.state.getOutboxEffect('create-spawn-lifecycle-suite', res.details.outboxEffectId)
    assert.equal(bridgeTimeoutOutbox?.kind, 'worker_delivery_requested')
    assert.equal(bridgeTimeoutOutbox?.idempotencyKey, ['spawn-initial-worker-delivery', 'create-spawn-lifecycle-suite', 'bridge-timeout-worker'].join(':'), 'bridge timeout spawn should preserve initial delivery idempotency key shape')
    assert.equal(bridgeTimeoutOutbox?.payload.memberName, 'bridge-timeout-worker')
    assert.equal(bridgeTimeoutOutbox?.payload.explicitTask, 'initial bridge task should remain queued')
    assert.equal(bridgeTimeoutOutbox?.payload.options?.requestedBy, 'team-lead')
    assert.equal(bridgeTimeoutOutbox?.payload.options?.reason, 'initial spawn task')
    assert.equal(bridgeTimeoutOutbox?.payload.options?.wakeHint, 'hard')
    assert.equal(bridgeTimeoutOutbox?.status, 'done')
    assert.equal(bridgeTimeoutOutbox?.result?.requestId, res.details.deliveryRequestId)
    env.patches.livePanes.delete(res.details.paneId)
    modules.state.updateTeamState('create-spawn-lifecycle-suite', latest => {
      modules.state.removeMember(latest, 'bridge-timeout-worker')
    })
    modules.state.clearSessionContext(res.details.sessionFile)
    if (res.details.sessionFile) fs.rmSync(res.details.sessionFile, { force: true })

    team = modules.state.readTeamState('create-spawn-lifecycle-suite')
    const bridgeReadyTimeoutBefore = process.env.PI_AGENTTEAM_BRIDGE_SPAWN_READY_TIMEOUT_MS
    process.env.PI_AGENTTEAM_BRIDGE_SPAWN_READY_TIMEOUT_MS = '250'
    let bridgeReadyPane
    const originalReadyCreateTeammatePane = modules.tmux.createTeammatePane
    modules.tmux.createTeammatePane = async input => {
      bridgeReadyPane = await originalReadyCreateTeammatePane(input)
      const expectedSessionFile = modules.state.getWorkerSessionPath('create-spawn-lifecycle-suite', 'bridge-ready-worker')
      setTimeout(() => {
        modules.runtimeBridge.publishBridgeLease({
          teamName: 'create-spawn-lifecycle-suite',
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
      }, null, () => {}, createSpawnLeaderCtx)
    } finally {
      modules.tmux.createTeammatePane = originalReadyCreateTeammatePane
      if (bridgeReadyTimeoutBefore === undefined) delete process.env.PI_AGENTTEAM_BRIDGE_SPAWN_READY_TIMEOUT_MS
      else process.env.PI_AGENTTEAM_BRIDGE_SPAWN_READY_TIMEOUT_MS = bridgeReadyTimeoutBefore
    }
    assert.equal(res.details.ok, true)
    assert.equal(res.details.bridgeReady, true)
    assert.equal(env.sentPrompts.length, 0, 'bridge-ready spawn should not tmux paste initial task')
    team = modules.state.readTeamState('create-spawn-lifecycle-suite')
    const bridgeReadyMember = team.members['bridge-ready-worker']
    assert.equal(bridgeReadyMember.status, 'pending_delivery')
    assert.equal(bridgeReadyMember.bridgeAvailable, true)
    assert.ok(res.details.outboxEffectId, 'bridge-ready spawn should expose durable initial Outbox request')
    assert.equal(res.details.outboxStatus, 'done')
    const bridgeReadyRequests = Object.values(modules.state.readDeliveryRequestStore('create-spawn-lifecycle-suite').requests)
      .filter(request => request.memberName === 'bridge-ready-worker')
    assert.equal(bridgeReadyRequests.length, 1)
    assert.equal(bridgeReadyRequests[0].requestId, res.details.deliveryRequestId)
    assert.equal(bridgeReadyRequests[0].bootPrompt, 'initial bridge ready task')
    const bridgeReadyOutbox = modules.state.getOutboxEffect('create-spawn-lifecycle-suite', res.details.outboxEffectId)
    assert.equal(bridgeReadyOutbox?.kind, 'worker_delivery_requested')
    assert.equal(bridgeReadyOutbox?.idempotencyKey, ['spawn-initial-worker-delivery', 'create-spawn-lifecycle-suite', 'bridge-ready-worker'].join(':'), 'bridge-ready spawn should preserve initial delivery idempotency key shape')
    assert.equal(bridgeReadyOutbox?.payload.memberName, 'bridge-ready-worker')
    assert.equal(bridgeReadyOutbox?.payload.explicitTask, 'initial bridge ready task')
    assert.equal(bridgeReadyOutbox?.payload.options?.requestedBy, 'team-lead')
    assert.equal(bridgeReadyOutbox?.payload.options?.reason, 'initial spawn task')
    assert.equal(bridgeReadyOutbox?.payload.options?.wakeHint, 'hard')
    assert.equal(bridgeReadyOutbox?.status, 'done')
    assert.equal(bridgeReadyOutbox?.result?.requestId, res.details.deliveryRequestId)
    const bridgeReadySends = []
    const bridgeReadyPump = await modules.runtimeBridge.pumpBridgeOnce({
      teamName: 'create-spawn-lifecycle-suite',
      memberName: 'bridge-ready-worker',
      ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: content => { bridgeReadySends.push(content) } },
    })
    assert.equal(bridgeReadyPump.ok, true)
    assert.equal(bridgeReadySends.length, 1, 'initial assignment should submit exactly once after bridge ready')
    assert.ok(bridgeReadySends[0].includes('initial bridge ready task'))
    const bridgeReadySecondPump = await modules.runtimeBridge.pumpBridgeOnce({
      teamName: 'create-spawn-lifecycle-suite',
      memberName: 'bridge-ready-worker',
      ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: content => { bridgeReadySends.push(content) } },
    })
    assert.equal(bridgeReadySecondPump.ok, false)
    assert.equal(bridgeReadySends.length, 1, 'initial assignment should not duplicate after submitted')
    env.patches.livePanes.delete(res.details.paneId)
    modules.state.updateTeamState('create-spawn-lifecycle-suite', latest => {
      modules.state.removeMember(latest, 'bridge-ready-worker')
    })
    modules.state.clearSessionContext(res.details.sessionFile)
    if (res.details.sessionFile) fs.rmSync(res.details.sessionFile, { force: true })

    team = modules.state.readTeamState('create-spawn-lifecycle-suite')
    assert.equal(team.members['research-one'].role, 'researcher')
    assert.equal(team.members['research-one'].model, '077-glm-5.1')
    assert.equal(team.members['plan-one'].role, 'planner')
    assert.equal(team.members['plan-one'].model, '077-gpt-5.4')
    assert.equal(team.members['plan-one'].lastWakeReason, 'initial task busy via bridge delivery')

    } finally {
      modules.tmux.captureTmuxSnapshot = originalTmux.captureTmuxSnapshot
      modules.tmux.captureCurrentPaneBinding = originalTmux.captureCurrentPaneBinding
      modules.tmux.paneExists = originalTmux.paneExists
      modules.tmux.createTeammatePane = originalTmux.createTeammatePane
      modules.tmux.resolvePaneBinding = originalTmux.resolvePaneBinding
      modules.tmux.waitForPaneAppStart = originalTmux.waitForPaneAppStart
      modules.tmux.killPane = originalTmux.killPane
      cleanupCreateSpawnTeams()
    }
  },
}
