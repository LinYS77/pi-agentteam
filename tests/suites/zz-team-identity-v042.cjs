const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-team-identity-${name}-`))
  try {
    process.env.PI_AGENTTEAM_HOME = home
    modules.state.invalidateSessionContextCache()
    modules.runtimePanes.invalidatePaneReconcileCache()
    return await fn(home)
  } finally {
    modules.runtimePanes.invalidatePaneReconcileCache()
    modules.state.invalidateSessionContextCache()
    process.env.PI_AGENTTEAM_HOME = previousHome
    fs.rmSync(home, { recursive: true, force: true })
  }
}

function formatResult(result) {
  return JSON.stringify({ text: result?.content?.[0]?.text, details: result?.details }, null, 2)
}

function identityOf(team) {
  const embedded = team && typeof team.identity === 'object' && team.identity ? team.identity : {}
  return {
    teamId: embedded.teamId ?? team?.teamId,
    projectKey: embedded.projectKey ?? team?.projectKey,
    displayName: embedded.displayName ?? team?.displayName ?? team?.name,
    slug: embedded.slug ?? team?.slug ?? team?.name,
  }
}

function sessionScopeOf(context) {
  if (!context || typeof context !== 'object') return {}
  return {
    teamId: context.teamId,
    projectKey: context.projectKey,
    identityKey: context.identityKey,
    teamName: context.teamName,
    memberName: context.memberName,
  }
}

function hasScopedSessionIdentity(context) {
  const scope = sessionScopeOf(context)
  return Boolean(scope.teamId || scope.identityKey || (scope.projectKey && scope.teamName))
}

function sameDisplayTeams(teams, displayName) {
  return teams.filter(team => identityOf(team).displayName === displayName)
}

function assertSafeIdentityShape(identity, label) {
  assert.equal(typeof identity.teamId, 'string', `${label}: teamId should be a string`)
  assert.ok(identity.teamId.length > 8, `${label}: teamId should be non-trivial`)
  assert.equal(typeof identity.projectKey, 'string', `${label}: projectKey should be a string`)
  assert.ok(identity.projectKey.length > 8, `${label}: projectKey should be non-trivial`)
  assert.equal(identity.displayName, 'Shared Team', `${label}: displayName should preserve user-visible spelling`)
  assert.equal(identity.slug, 'shared-team', `${label}: slug should be normalized ASCII identity key`)
}

function expectInvalidIdentityBuild(buildNewTeamIdentity, rawName, cwd) {
  try {
    const result = buildNewTeamIdentity({ rawName, cwd })
    if (result && typeof result === 'object' && (result.ok === false || result.denied === true)) return
    throw new Error(`unsafe name ${JSON.stringify(rawName)} unexpectedly produced ${JSON.stringify(result)}`)
  } catch (error) {
    if (String(error?.message ?? '').startsWith('unsafe name')) throw error
  }
}

async function exercisePureIdentityHelpers(env, failures) {
  const { helpers } = env
  const identityModule = helpers.requireDist('core/teamIdentity.js')
  const deriveProjectKey = identityModule.deriveProjectKey
  const buildNewTeamIdentity = identityModule.buildNewTeamIdentity

  if (typeof deriveProjectKey !== 'function') {
    failures.push('core/teamIdentity.js should export deriveProjectKey(cwd) for project-scoped identity')
  } else {
    try {
      const projectA1 = deriveProjectKey('/tmp/team-identity-v042/project-a')
      const projectA2 = deriveProjectKey('/tmp/team-identity-v042/project-a')
      const projectB = deriveProjectKey('/tmp/team-identity-v042/project-b')
      assert.equal(projectA1, projectA2, 'deriveProjectKey should be stable for the same cwd')
      assert.notEqual(projectA1, projectB, 'deriveProjectKey should distinguish different cwd/project roots')
      assert.equal(typeof projectA1, 'string', 'projectKey should be string')
      assert.ok(projectA1.length > 8, 'projectKey should be non-trivial')
    } catch (error) {
      failures.push(`deriveProjectKey behavior failed: ${error.message}`)
    }
  }

  if (typeof buildNewTeamIdentity !== 'function') {
    failures.push('core/teamIdentity.js should export buildNewTeamIdentity({ rawName, cwd })')
    return
  }

  try {
    const built = buildNewTeamIdentity({ rawName: 'Shared Team', cwd: '/tmp/team-identity-v042/project-a' })
    assertSafeIdentityShape(built, 'buildNewTeamIdentity ASCII')
    const builtAgain = buildNewTeamIdentity({ rawName: 'Shared Team', cwd: '/tmp/team-identity-v042/project-a' })
    assert.equal(built.projectKey, builtAgain.projectKey, 'buildNewTeamIdentity should keep stable projectKey for same cwd')
    assert.equal(built.teamId, builtAgain.teamId, 'buildNewTeamIdentity should keep stable teamId for same project/name')
    const builtOtherProject = buildNewTeamIdentity({ rawName: 'Shared Team', cwd: '/tmp/team-identity-v042/project-b' })
    assert.notEqual(built.teamId, builtOtherProject.teamId, 'same display/slug in different projects should get different teamId')
    assert.notEqual(built.projectKey, builtOtherProject.projectKey, 'different projects should get different projectKey')
    expectInvalidIdentityBuild(buildNewTeamIdentity, '基础员工团队', '/tmp/team-identity-v042/project-a')
    expectInvalidIdentityBuild(buildNewTeamIdentity, '!!!', '/tmp/team-identity-v042/project-a')
    expectInvalidIdentityBuild(buildNewTeamIdentity, '---', '/tmp/team-identity-v042/project-a')
  } catch (error) {
    failures.push(`buildNewTeamIdentity behavior failed: ${error.message}`)
  }
}

function withScopedLeaderPanes(modules, fn) {
  const originalCaptureCurrentPaneBinding = modules.tmux.captureCurrentPaneBinding
  const originalPaneExists = modules.tmux.paneExists
  const originalResolvePaneBinding = modules.tmux.resolvePaneBinding
  const livePanes = new Set()
  let currentPane = { paneId: '%team-identity-leader-a', target: 'team-identity:@1' }

  modules.tmux.captureCurrentPaneBinding = () => currentPane
  modules.tmux.paneExists = paneId => livePanes.has(paneId) || originalPaneExists(paneId)
  modules.tmux.resolvePaneBinding = paneId => livePanes.has(paneId)
    ? { paneId, target: paneId.includes('leader-b') ? 'team-identity:@2' : 'team-identity:@1' }
    : originalResolvePaneBinding(paneId)

  try {
    return fn({
      setPane(paneId, target) {
        currentPane = { paneId, target }
        livePanes.add(paneId)
      },
    })
  } finally {
    modules.tmux.captureCurrentPaneBinding = originalCaptureCurrentPaneBinding
    modules.tmux.paneExists = originalPaneExists
    modules.tmux.resolvePaneBinding = originalResolvePaneBinding
  }
}

async function exerciseScopedCreateAndSessionBinding(env, failures) {
  const { pi, modules, helpers } = env
  const tool = name => pi.__tools.get(name)

  await withTempHome(modules, 'scoped-create', async () => {
    await withScopedLeaderPanes(modules, async panes => {
      const cwdA = '/tmp/team-identity-v042/project-a'
      const cwdB = '/tmp/team-identity-v042/project-b'
      const sessionA = '/tmp/team-identity-v042-project-a-leader.jsonl'
      const sessionB = '/tmp/team-identity-v042-project-b-leader.jsonl'
      const ctxA = helpers.createCtx(cwdA, sessionA, [])
      const ctxB = helpers.createCtx(cwdB, sessionB, [])

      panes.setPane('%team-identity-leader-a', 'team-identity:@1')
      const createA = await tool('agentteam_create').execute('team-identity-create-a', {
        team_name: 'shared-team',
        description: 'project A scoped identity fixture',
      }, null, () => {}, ctxA)
      if (createA.details?.denied) {
        failures.push(`project A create should succeed, got ${formatResult(createA)}`)
        return
      }

      const createdTeamA = modules.state.readTeamState('shared-team')
      const createdIdentityA = identityOf(createdTeamA)
      if (!createdIdentityA.teamId || !createdIdentityA.projectKey || createdIdentityA.displayName !== 'shared-team' || createdIdentityA.slug !== 'shared-team') {
        failures.push(`project A created team should persist TeamState identity metadata, got ${JSON.stringify(createdIdentityA)}`)
      }

      const sessionContextAAfterCreate = modules.state.readSessionContext(sessionA)
      if (sessionContextAAfterCreate.teamName !== 'shared-team' || sessionContextAAfterCreate.memberName !== modules.types.TEAM_LEAD) {
        failures.push(`session binding should retain compatible teamName/memberName after create, got ${JSON.stringify(sessionContextAAfterCreate)}`)
      }
      if (!hasScopedSessionIdentity(sessionContextAAfterCreate)) {
        failures.push(`session binding should include teamId/project identity while retaining teamName/memberName, got ${JSON.stringify(sessionContextAAfterCreate)}`)
      }

      const duplicateA = await tool('agentteam_create').execute('team-identity-create-a-duplicate', {
        team_name: 'shared-team',
        description: 'same project duplicate should attach/conflict within project A only',
      }, null, () => {}, ctxA)
      const duplicateLooksSameProject = duplicateA.details?.alreadyAttached || duplicateA.details?.reason === 'same_project_team_exists'
      if (!duplicateLooksSameProject) {
        failures.push(`same project duplicate should use same-project duplicate/attached semantics, got ${formatResult(duplicateA)}`)
      }

      panes.setPane('%team-identity-leader-b', 'team-identity:@2')
      const createB = await tool('agentteam_create').execute('team-identity-create-b', {
        team_name: 'shared-team',
        description: 'project B scoped identity fixture with same display/slug',
      }, null, () => {}, ctxB)
      const teamsAfterB = modules.state.listTeams()
      const sharedTeams = sameDisplayTeams(teamsAfterB, 'shared-team')
      if (createB.details?.denied || createB.details?.alreadyExists || createB.details?.recovered || sharedTeams.length !== 2) {
        failures.push([
          'different projects should be able to create same display/slug team without global-name collision or legacy recover',
          `project B result: ${formatResult(createB)}`,
          `teams: ${JSON.stringify(teamsAfterB.map(team => ({ name: team.name, identity: identityOf(team), leaderCwd: team.leaderCwd, leaderSessionFile: team.leaderSessionFile })), null, 2)}`,
        ].join('\n'))
      }

      if (sharedTeams.length === 2) {
        const [teamA, teamB] = sharedTeams
        const identityA = identityOf(teamA)
        const identityB = identityOf(teamB)
        if (!identityA.teamId || !identityB.teamId || identityA.teamId === identityB.teamId) {
          failures.push(`same display teams should have distinct teamId values, got ${JSON.stringify([identityA, identityB])}`)
        }
        if (!identityA.projectKey || !identityB.projectKey || identityA.projectKey === identityB.projectKey) {
          failures.push(`same display teams should have distinct projectKey values, got ${JSON.stringify([identityA, identityB])}`)
        }

        const resolvedA = modules.state.ensureAttachedSessionContext(sessionA).context
        const resolvedB = modules.state.ensureAttachedSessionContext(sessionB).context
        if (!hasScopedSessionIdentity(resolvedA) || !hasScopedSessionIdentity(resolvedB)) {
          failures.push(`same-name project sessions should resolve with scoped identity, got A=${JSON.stringify(resolvedA)} B=${JSON.stringify(resolvedB)}`)
        }
        const scopeA = sessionScopeOf(resolvedA)
        const scopeB = sessionScopeOf(resolvedB)
        if ((scopeA.teamId && scopeB.teamId && scopeA.teamId === scopeB.teamId) ||
          (scopeA.projectKey && scopeB.projectKey && scopeA.projectKey === scopeB.projectKey)) {
          failures.push(`same-name project sessions should resolve to distinct scoped teams, got A=${JSON.stringify(scopeA)} B=${JSON.stringify(scopeB)}`)
        }
      }

      const panelData = modules.panelDataSource.loadPanelData(null)
      if (panelData.mode !== 'global') {
        failures.push(`global panel load should return global mode, got ${panelData.mode}`)
      } else {
        const panelSharedTeams = sameDisplayTeams(panelData.teams, 'shared-team')
        if (panelSharedTeams.length !== 2) {
          failures.push(`global /team panel should list both same-display scoped teams, got ${panelSharedTeams.length} matching entries from ${JSON.stringify(panelData.teams.map(team => ({ name: team.name, identity: identityOf(team), leaderCwd: team.leaderCwd })))}`)
        } else {
          const panelState = modules.viewModel.createInitialPanelState()
          modules.viewModel.clampPanelStateToData(panelState, panelData)
          const selection = modules.viewModel.buildPanelSelectionView(panelData, panelState)
          const rendered = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), {
            width: 180,
            height: 40,
            data: panelData,
            state: panelState,
            selection,
          }).join('\n')
          if (!rendered.includes(cwdA) || !rendered.includes(cwdB)) {
            failures.push(`global /team panel should render project/cwd disambiguation for same-display teams; expected ${cwdA} and ${cwdB} in:\n${rendered}`)
          }
        }
      }
    })
  })
}

async function exerciseLegacyCompatibility(env, failures) {
  const { pi, modules, helpers } = env
  const tool = name => pi.__tools.get(name)

  await withTempHome(modules, 'legacy-dash', async home => {
    const oldSessionFile = '/tmp/team-identity-v042-legacy-dash-old-leader.jsonl'
    const newSessionFile = '/tmp/team-identity-v042-legacy-dash-new-leader.jsonl'
    const legacyTeam = modules.state.createInitialTeamState({
      teamName: '-',
      description: 'legacy dash team must survive unsafe scoped identity create',
      leaderSessionFile: oldSessionFile,
      leaderCwd: '/tmp/team-identity-v042/legacy-dash-old-project',
    })
    modules.state.writeTeamState(legacyTeam)
    const legacyPath = path.join(home, 'teams', '-', 'team.json')
    const beforeRaw = fs.readFileSync(legacyPath, 'utf8')

    const result = await tool('agentteam_create').execute('team-identity-unsafe-unicode', {
      team_name: '基础员工团队',
      description: 'unsafe unicode-only team must not touch teams/-',
    }, null, () => {}, helpers.createCtx('/tmp/team-identity-v042/legacy-dash-new-project', newSessionFile, []))

    const afterRaw = fs.existsSync(legacyPath) ? fs.readFileSync(legacyPath, 'utf8') : null
    if (!result.details?.denied) {
      failures.push(`unicode-only create should be denied before touching legacy teams/-, got ${formatResult(result)}`)
    }
    if (afterRaw !== beforeRaw) {
      failures.push('unicode-only create should not modify existing legacy teams/- team.json')
    }
    if (modules.state.readSessionContext(newSessionFile).teamName !== null) {
      failures.push(`unsafe unicode session should remain unattached, got ${JSON.stringify(modules.state.readSessionContext(newSessionFile))}`)
    }
  })

  await withTempHome(modules, 'legacy-same-slug', async home => {
    const oldSessionFile = '/tmp/team-identity-v042-legacy-shared-old-leader.jsonl'
    const newSessionFile = '/tmp/team-identity-v042-legacy-shared-new-leader.jsonl'
    const legacyTeam = modules.state.createInitialTeamState({
      teamName: 'legacy-shared',
      description: 'pre-TeamIdentity legacy team with same slug',
      leaderSessionFile: oldSessionFile,
      leaderCwd: '/tmp/team-identity-v042/legacy-shared-old-project',
    })
    delete legacyTeam.identity
    modules.state.writeTeamState(legacyTeam)
    const legacyPath = path.join(home, 'teams', 'legacy-shared', 'team.json')
    const beforeRaw = fs.readFileSync(legacyPath, 'utf8')

    const result = await tool('agentteam_create').execute('team-identity-create-near-legacy', {
      team_name: 'legacy-shared',
      description: 'new scoped project should not silently take over pre-TeamIdentity team',
    }, null, () => {}, helpers.createCtx('/tmp/team-identity-v042/legacy-shared-new-project', newSessionFile, []))
    const afterRaw = fs.existsSync(legacyPath) ? fs.readFileSync(legacyPath, 'utf8') : null
    const newSessionContext = modules.state.readSessionContext(newSessionFile)

    const deniedWithLegacyDiagnostic = Boolean(result.details?.denied && /legacy/i.test(JSON.stringify(result.details)))
    const createdSeparateScopedTeam = modules.state.listTeams().some(team => {
      const identity = identityOf(team)
      return identity.displayName === 'legacy-shared' && identity.teamId && team.leaderSessionFile === newSessionFile
    })

    if (result.details?.recovered || result.details?.alreadyExists || afterRaw !== beforeRaw || (!deniedWithLegacyDiagnostic && !createdSeparateScopedTeam)) {
      failures.push([
        'new scoped create near a pre-TeamIdentity same-slug legacy team should not silently recover/take over that legacy team',
        `result: ${formatResult(result)}`,
        `legacy mutated: ${afterRaw !== beforeRaw}`,
        `new session: ${JSON.stringify(newSessionContext)}`,
      ].join('\n'))
    }
  })
}

async function exerciseMailboxReadBoundary(env, failures) {
  const { modules } = env
  await withTempHome(modules, 'panel-mailbox-boundary', async () => {
    const team = modules.state.createInitialTeamState({
      teamName: 'identity-panel-mailbox-suite',
      description: 'panel mailbox read boundary must remain unchanged',
      leaderSessionFile: '/tmp/team-identity-v042-panel-mailbox-leader.jsonl',
      leaderCwd: '/tmp/team-identity-v042/panel-mailbox-project',
    })
    modules.state.writeTeamState(team)
    modules.runtimePanes.invalidatePaneReconcileCache(team.name)
    const message = modules.state.pushMailboxMessage(team.name, 'team-lead', {
      from: 'worker-a',
      to: 'team-lead',
      type: 'inform',
      summary: 'TeamIdentity panel mailbox boundary fixture',
      text: 'Global panel must not mark this message read or delivered.',
    })

    modules.panelDataSource.loadPanelData(null)
    const stored = modules.state.readMailbox(team.name, 'team-lead').find(item => item.id === message.id)
    if (!stored) {
      failures.push('panel mailbox boundary fixture disappeared after global panel load')
      return
    }
    if (stored.readAt !== undefined || stored.deliveredAt !== undefined) {
      failures.push(`global panel load should not mark mailbox read/delivered, got ${JSON.stringify({ readAt: stored.readAt, deliveredAt: stored.deliveredAt })}`)
    }
  })
}

module.exports = {
  name: 'TeamIdentity v0.4.2 characterization',
  async run(env) {
    const failures = []
    await exercisePureIdentityHelpers(env, failures)
    await exerciseScopedCreateAndSessionBinding(env, failures)
    await exerciseLegacyCompatibility(env, failures)
    await exerciseMailboxReadBoundary(env, failures)

    assert.deepEqual(failures, [], `TeamIdentity v0.4.2 RED expectations not met:\n${failures.join('\n\n')}`)
  },
}
