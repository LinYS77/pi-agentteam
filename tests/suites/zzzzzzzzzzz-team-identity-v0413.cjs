const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-team-identity-v0413-${name}-`))
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

function tool(env, name) {
  return env.pi.__tools.get(name)
}

function formatResult(result) {
  return JSON.stringify({ text: result?.content?.[0]?.text, details: result?.details }, null, 2)
}

function listTeamDirs(home) {
  const teamsDir = path.join(home, 'teams')
  if (!fs.existsSync(teamsDir)) return []
  return fs.readdirSync(teamsDir).sort((a, b) => a.localeCompare(b))
}

function teamStatePath(home, teamName) {
  return path.join(home, 'teams', teamName, 'team.json')
}

function sessionJsonPath(modules, sessionFile) {
  return modules.state.getSessionContextPath(sessionFile)
}

function readRawSessionJson(modules, sessionFile) {
  const filePath = sessionJsonPath(modules, sessionFile)
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null
}

function identityOf(team) {
  const embedded = team && typeof team.identity === 'object' && team.identity ? team.identity : {}
  return {
    teamId: embedded.teamId ?? team?.teamId,
    projectKey: embedded.projectKey ?? team?.projectKey,
    displayName: embedded.displayName ?? team?.displayName ?? team?.name,
    slug: embedded.slug ?? team?.slug ?? team?.name,
    legacyName: embedded.legacyName ?? team?.legacyName,
  }
}

function sessionScopeOf(context) {
  if (!context || typeof context !== 'object') return {}
  return {
    teamName: context.teamName,
    memberName: context.memberName,
    teamId: context.teamId,
    projectKey: context.projectKey,
    identityKey: context.identityKey,
    teamSlug: context.teamSlug,
  }
}

function sameDisplayTeams(teams, displayName) {
  return teams.filter(team => identityOf(team).displayName === displayName)
}

function assertRawIncludesIdentity(rawSession, label, failures) {
  if (!rawSession || typeof rawSession !== 'object') {
    failures.push(`${label}: expected persisted session JSON to exist, got ${JSON.stringify(rawSession)}`)
    return
  }
  if (!rawSession.teamId) {
    failures.push(`${label}: persisted session JSON should include enumerable teamId, got ${JSON.stringify(rawSession)}`)
  }
  if (!rawSession.projectKey) {
    failures.push(`${label}: persisted session JSON should include enumerable projectKey, got ${JSON.stringify(rawSession)}`)
  }
  if (!rawSession.identityKey) {
    failures.push(`${label}: persisted session JSON should include enumerable identityKey, got ${JSON.stringify(rawSession)}`)
  }
}

function assertDeniedWithAsciiGuidance(result, label, failures) {
  const text = String(result?.content?.[0]?.text ?? '')
  const detailsText = JSON.stringify(result?.details ?? {})
  if (!result.details?.denied) {
    failures.push(`${label}: expected create to be denied, got ${formatResult(result)}`)
  }
  if (!/ASCII/i.test(text) && !/ASCII/i.test(detailsText)) {
    failures.push(`${label}: denial should guide user toward an ASCII slug/name, got ${formatResult(result)}`)
  }
}

async function exerciseChineseOnlyDoesNotTouchDash(env, failures) {
  const { modules, helpers } = env
  await withTempHome(modules, 'chinese-only-dash-safety', async home => {
    const legacySessionFile = '/tmp/team-identity-v0413-legacy-dash-leader.jsonl'
    const newSessionFile = '/tmp/team-identity-v0413-chinese-only-leader.jsonl'
    const legacyTeam = modules.state.createInitialTeamState({
      teamName: '-',
      description: 'legacy teams/- sentinel must not be reused by unsafe names',
      leaderSessionFile: legacySessionFile,
      leaderCwd: '/tmp/team-identity-v0413/legacy-dash-project',
    })
    delete legacyTeam.identity
    modules.state.writeTeamState(legacyTeam)
    const legacyPath = teamStatePath(home, '-')
    const beforeRaw = fs.readFileSync(legacyPath, 'utf8')

    const result = await tool(env, 'agentteam_create').execute('team-identity-v0413-chinese-only-create', {
      team_name: '基础员工团队',
      description: 'unsafe Chinese-only team must not normalize to teams/-',
    }, null, () => {}, helpers.createCtx('/tmp/team-identity-v0413/chinese-only-project', newSessionFile, []))

    assertDeniedWithAsciiGuidance(result, 'Chinese-only team_name', failures)
    const afterRaw = fs.existsSync(legacyPath) ? fs.readFileSync(legacyPath, 'utf8') : null
    if (afterRaw !== beforeRaw) {
      failures.push('Chinese-only team_name: existing legacy teams/-/team.json must remain byte-for-byte unchanged')
    }
    if (JSON.stringify(listTeamDirs(home)) !== JSON.stringify(['-'])) {
      failures.push(`Chinese-only team_name: expected only seeded legacy teams/- dir, found ${JSON.stringify(listTeamDirs(home))}`)
    }
    if (result.details?.teamName === '-' || result.details?.storageTeamName === '-' || result.details?.alreadyExists || result.details?.recovered) {
      failures.push(`Chinese-only team_name: must not read/reuse/recover teams/-, got ${formatResult(result)}`)
    }
    const newContext = modules.state.ensureAttachedSessionContext(newSessionFile).context
    if (newContext.teamName !== null || newContext.memberName !== null || newContext.teamName === '-') {
      failures.push(`Chinese-only team_name: session must stay unattached and never attach to teams/-, got ${JSON.stringify(sessionScopeOf(newContext))}`)
    }
    const legacyContext = modules.state.ensureAttachedSessionContext(legacySessionFile).context
    if (legacyContext.teamName !== '-' || legacyContext.memberName !== modules.types.TEAM_LEAD) {
      failures.push(`Chinese-only team_name: existing legacy dash session fallback should still resolve its own team, got ${JSON.stringify(sessionScopeOf(legacyContext))}`)
    }
  })
}

async function exerciseLegacyDashSurvivesUnsafeLookups(env, failures) {
  const { modules, helpers } = env
  await withTempHome(modules, 'legacy-dash-lookup-safety', async home => {
    const legacySessionFile = '/tmp/team-identity-v0413-lookup-dash-leader.jsonl'
    const unsafeSessionFile = '/tmp/team-identity-v0413-lookup-unsafe-leader.jsonl'
    const legacyTeam = modules.state.createInitialTeamState({
      teamName: '-',
      description: 'legacy teams/- byte stability sentinel',
      leaderSessionFile: legacySessionFile,
      leaderCwd: '/tmp/team-identity-v0413/lookup-dash-old-project',
    })
    delete legacyTeam.identity
    modules.state.writeTeamState(legacyTeam)
    const legacyPath = teamStatePath(home, '-')
    const beforeRaw = fs.readFileSync(legacyPath, 'utf8')

    const unsafeCtx = helpers.createCtx('/tmp/team-identity-v0413/lookup-dash-new-project', unsafeSessionFile, [])
    const createResult = await tool(env, 'agentteam_create').execute('team-identity-v0413-unsafe-create', {
      team_name: '基础员工团队',
      description: 'unsafe create must not mutate legacy dash',
    }, null, () => {}, unsafeCtx)
    modules.panelDataSource.loadPanelData(null)
    modules.state.ensureAttachedSessionContext(unsafeSessionFile)

    const afterRaw = fs.existsSync(legacyPath) ? fs.readFileSync(legacyPath, 'utf8') : null
    assertDeniedWithAsciiGuidance(createResult, 'legacy teams/- unsafe create', failures)
    if (afterRaw !== beforeRaw) {
      failures.push('legacy teams/-: unsafe create + global panel + attached lookup must leave team.json byte-for-byte unchanged')
    }
    if (!fs.existsSync(legacyPath)) {
      failures.push('legacy teams/-: must not auto-delete, rename, migrate, quarantine, or take over seeded legacy state')
    }
    const legacyTeamAfter = modules.state.readTeamState('-')
    if (!legacyTeamAfter || legacyTeamAfter.identity) {
      failures.push(`legacy teams/-: must remain readable as legacy no-identity state, got ${JSON.stringify(identityOf(legacyTeamAfter))}`)
    }
  })
}

async function exerciseSeparatorTrimming(env, failures) {
  const { modules, helpers } = env
  await withTempHome(modules, 'separator-trimming', async home => {
    for (const [rawName, sessionSuffix] of [['---Shared Team---', 'dash-wrapped'], ['...Shared Team...', 'dot-wrapped']]) {
      const sessionFile = `/tmp/team-identity-v0413-${sessionSuffix}-leader.jsonl`
      const result = await tool(env, 'agentteam_create').execute(`team-identity-v0413-${sessionSuffix}`, {
        team_name: rawName,
        description: 'separator-wrapped safe names should trim separators for slug identity',
      }, null, () => {}, helpers.createCtx(`/tmp/team-identity-v0413/${sessionSuffix}`, sessionFile, []))
      const expectedPath = teamStatePath(home, 'shared-team')
      const createdTeam = modules.state.readTeamState('shared-team')
      const createdIdentity = identityOf(createdTeam)

      if (result.details?.denied) {
        failures.push(`${rawName}: separator-wrapped safe display name should create slug shared-team, got ${formatResult(result)}`)
      }
      if (result.details?.teamName !== 'shared-team') {
        failures.push(`${rawName}: create details should expose normalized teamName shared-team, got ${formatResult(result)}`)
      }
      if (!fs.existsSync(expectedPath)) {
        failures.push(`${rawName}: expected storage path teams/shared-team/team.json to exist`)
      }
      if (createdIdentity.slug !== 'shared-team') {
        failures.push(`${rawName}: expected TeamIdentity slug shared-team, got ${JSON.stringify(createdIdentity)}`)
      }
      const rawSession = readRawSessionJson(modules, sessionFile)
      assertRawIncludesIdentity(rawSession, `${rawName} session`, failures)

      modules.state.clearSessionContext(sessionFile)
      if (fs.existsSync(expectedPath)) fs.rmSync(path.dirname(expectedPath), { recursive: true, force: true })
      modules.state.invalidateSessionContextCache()
    }

    for (const [rawName, label] of [['---', 'dash-only'], ['!!!', 'punctuation-only'], ['。。。', 'Chinese punctuation only'], ['基础员工团队', 'Chinese-only']]) {
      const sessionFile = `/tmp/team-identity-v0413-invalid-${label}.jsonl`
      const result = await tool(env, 'agentteam_create').execute(`team-identity-v0413-invalid-${label}`, {
        team_name: rawName,
        description: 'unsafe separator-only and non-ASCII names should be denied',
      }, null, () => {}, helpers.createCtx(`/tmp/team-identity-v0413/invalid-${label}`, sessionFile, []))
      assertDeniedWithAsciiGuidance(result, label, failures)
      const sessionContext = modules.state.ensureAttachedSessionContext(sessionFile).context
      if (sessionContext.teamName !== null || sessionContext.memberName !== null) {
        failures.push(`${label}: denied unsafe create must leave session unattached, got ${JSON.stringify(sessionScopeOf(sessionContext))}`)
      }
      if (rawName === '基础员工团队' && fs.existsSync(teamStatePath(home, '-'))) {
        failures.push('Chinese-only team_name with no legacy dash fixture must not create teams/-')
      }
    }
  })
}

async function withTwoLeaderPanes(modules, fn) {
  const originalCaptureCurrentPaneBinding = modules.tmux.captureCurrentPaneBinding
  const originalPaneExists = modules.tmux.paneExists
  const originalResolvePaneBinding = modules.tmux.resolvePaneBinding
  const livePanes = new Set()
  let currentPane = { paneId: '%team-identity-v0413-a', target: 'identity-v0413:@1' }

  modules.tmux.captureCurrentPaneBinding = () => currentPane
  modules.tmux.paneExists = paneId => livePanes.has(paneId) || originalPaneExists(paneId)
  modules.tmux.resolvePaneBinding = paneId => livePanes.has(paneId)
    ? { paneId, target: paneId.includes('-b') ? 'identity-v0413:@2' : 'identity-v0413:@1' }
    : originalResolvePaneBinding(paneId)

  try {
    return await fn({
      setCurrent(paneId, target) {
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

async function exerciseScopedIdentityBehavior(env, failures) {
  const { modules, helpers } = env
  await withTempHome(modules, 'scoped-identity', async () => {
    await withTwoLeaderPanes(modules, async panes => {
      const cwdA = '/tmp/team-identity-v0413/scoped/project-a'
      const cwdB = '/tmp/team-identity-v0413/scoped/project-b'
      const sessionA = '/tmp/team-identity-v0413-scoped-a-leader.jsonl'
      const sessionB = '/tmp/team-identity-v0413-scoped-b-leader.jsonl'
      const ctxA = helpers.createCtx(cwdA, sessionA, [])
      const ctxB = helpers.createCtx(cwdB, sessionB, [])

      panes.setCurrent('%team-identity-v0413-a', 'identity-v0413:@1')
      const createA = await tool(env, 'agentteam_create').execute('team-identity-v0413-create-a', {
        team_name: 'Shared Team',
        description: 'project A scoped identity fixture',
      }, null, () => {}, ctxA)
      if (createA.details?.denied) {
        failures.push(`project A scoped create should succeed, got ${formatResult(createA)}`)
        return
      }
      assertRawIncludesIdentity(readRawSessionJson(modules, sessionA), 'project A create session', failures)

      const duplicateA = await tool(env, 'agentteam_create').execute('team-identity-v0413-create-a-duplicate', {
        team_name: 'Shared Team',
        description: 'same project duplicate should return scoped collision/attached details',
      }, null, () => {}, ctxA)
      const duplicateDetails = duplicateA.details ?? {}
      const duplicateText = JSON.stringify(duplicateDetails)
      if (!duplicateDetails.alreadyAttached && !duplicateDetails.denied) {
        failures.push(`same project duplicate should deny or report alreadyAttached, got ${formatResult(duplicateA)}`)
      }
      for (const key of ['existingLeaderCwd', 'existingLeaderWindowTarget', 'existingLeaderPaneId', 'existingLeaderSessionFile']) {
        if (!(key in duplicateDetails)) {
          failures.push(`same project duplicate details should include ${key}, got ${formatResult(duplicateA)}`)
        }
      }
      if (!duplicateText.includes(cwdA) || !duplicateText.includes('%team-identity-v0413-a') || !duplicateText.includes(sessionA)) {
        failures.push(`same project duplicate details should include existing cwd/windowTarget/paneId/sessionFile values, got ${formatResult(duplicateA)}`)
      }

      panes.setCurrent('%team-identity-v0413-b', 'identity-v0413:@2')
      const createB = await tool(env, 'agentteam_create').execute('team-identity-v0413-create-b', {
        team_name: 'Shared Team',
        description: 'project B scoped identity fixture with same display/slug',
      }, null, () => {}, ctxB)
      const teams = modules.state.listTeams()
      const sharedTeams = sameDisplayTeams(teams, 'Shared Team')
      if (createB.details?.denied || createB.details?.alreadyExists || createB.details?.recovered || sharedTeams.length !== 2) {
        failures.push([
          'same display/slug in different projectKey should create separate scoped teams, not globally conflict or recover',
          `project B result: ${formatResult(createB)}`,
          `teams: ${JSON.stringify(teams.map(team => ({ name: team.name, identity: identityOf(team), leaderCwd: team.leaderCwd, leaderSessionFile: team.leaderSessionFile })), null, 2)}`,
        ].join('\n'))
        if (createB.details?.denied && !/cwd|project|pane|session|existing/i.test(JSON.stringify(createB.details))) {
          failures.push(`if implementation still denies global duplicates, details must explicitly include global conflict cwd/pane/session/project info, got ${formatResult(createB)}`)
        }
      }
      if (sharedTeams.length === 2) {
        const identities = sharedTeams.map(identityOf)
        if (!identities.every(identity => identity.teamId && identity.projectKey && identity.slug === 'shared-team')) {
          failures.push(`scoped same-display teams should persist complete identity metadata, got ${JSON.stringify(identities)}`)
        }
        if (identities[0].teamId === identities[1].teamId || identities[0].projectKey === identities[1].projectKey) {
          failures.push(`scoped same-display teams should have distinct teamId and projectKey, got ${JSON.stringify(identities)}`)
        }
        assertRawIncludesIdentity(readRawSessionJson(modules, sessionB), 'project B create session', failures)
      }
    })
  })
}

async function exerciseLegacyNoIdentitySameSlug(env, failures) {
  const { modules, helpers } = env
  await withTempHome(modules, 'legacy-no-identity-same-slug', async home => {
    const legacySessionFile = '/tmp/team-identity-v0413-legacy-same-slug-old-leader.jsonl'
    const newSessionFile = '/tmp/team-identity-v0413-legacy-same-slug-new-leader.jsonl'
    const legacyTeam = modules.state.createInitialTeamState({
      teamName: 'legacy-shared',
      description: 'pre-TeamIdentity legacy same slug fixture',
      leaderSessionFile: legacySessionFile,
      leaderCwd: '/tmp/team-identity-v0413/legacy-same-slug-old-project',
    })
    delete legacyTeam.identity
    modules.state.writeTeamState(legacyTeam)
    const legacyPath = teamStatePath(home, 'legacy-shared')
    const beforeRaw = fs.readFileSync(legacyPath, 'utf8')

    const listedBefore = modules.state.listTeams().find(team => team.name === 'legacy-shared')
    if (!listedBefore || listedBefore.identity) {
      failures.push(`legacy no-identity same-slug team should be readable/listable before create, got ${JSON.stringify(listedBefore)}`)
    }

    const result = await tool(env, 'agentteam_create').execute('team-identity-v0413-create-near-legacy', {
      team_name: 'legacy-shared',
      description: 'new scoped create must not silently recover/take over legacy no-identity team',
    }, null, () => {}, helpers.createCtx('/tmp/team-identity-v0413/legacy-same-slug-new-project', newSessionFile, []))
    const afterRaw = fs.existsSync(legacyPath) ? fs.readFileSync(legacyPath, 'utf8') : null
    const newSessionContext = modules.state.ensureAttachedSessionContext(newSessionFile).context
    const createdSeparateScopedTeam = modules.state.listTeams().some(team => {
      const identity = identityOf(team)
      return team.name !== 'legacy-shared' && identity.displayName === 'legacy-shared' && identity.teamId && team.leaderSessionFile === newSessionFile
    })
    const deniedWithLegacyDiagnostic = Boolean(result.details?.denied && /legacy|no[-_ ]?identity|pre[-_ ]?TeamIdentity/i.test(`${result.content?.[0]?.text ?? ''} ${JSON.stringify(result.details)}`))

    if (result.details?.recovered || result.details?.alreadyExists || afterRaw !== beforeRaw || (!createdSeparateScopedTeam && !deniedWithLegacyDiagnostic)) {
      failures.push([
        'new scoped create with same slug as pre-TeamIdentity legacy team must not silently recover/take over or mutate it',
        `result: ${formatResult(result)}`,
        `legacy mutated: ${afterRaw !== beforeRaw}`,
        `new session: ${JSON.stringify(sessionScopeOf(newSessionContext))}`,
      ].join('\n'))
    }
  })
}

async function exerciseLegacyNameAndEffectiveIdentityVisibility(env, failures) {
  const { modules, helpers } = env
  await withTempHome(modules, 'legacy-effective-identity', async home => {
    const legacyDash = modules.state.createInitialTeamState({
      teamName: '-',
      description: 'legacy dash effective identity fixture',
      leaderSessionFile: '/tmp/team-identity-v0413-legacy-effective-dash-leader.jsonl',
      leaderCwd: '/tmp/team-identity-v0413/legacy-effective/dash',
    })
    delete legacyDash.identity
    modules.state.writeTeamState(legacyDash)
    const legacyNormal = modules.state.createInitialTeamState({
      teamName: 'legacy-visible',
      description: 'legacy normal effective identity fixture',
      leaderSessionFile: '/tmp/team-identity-v0413-legacy-effective-normal-leader.jsonl',
      leaderCwd: '/tmp/team-identity-v0413/legacy-effective/normal',
    })
    delete legacyNormal.identity
    modules.state.writeTeamState(legacyNormal)

    const dashPath = teamStatePath(home, '-')
    const normalPath = teamStatePath(home, 'legacy-visible')
    const dashBefore = fs.readFileSync(dashPath, 'utf8')
    const normalBefore = fs.readFileSync(normalPath, 'utf8')

    const listed = modules.state.listTeams().map(team => identityOf(team))
    if (listed.some(identity => identity.legacyName)) {
      failures.push(`state listTeams should not mutate raw legacy teams into effective identities, got ${JSON.stringify(listed)}`)
    }

    const repository = helpers.requireDist('state/repository.js').createStateRepository()
    const dashPanel = repository.readTeamPanelModel('-')
    const normalPanel = repository.readTeamPanelModel('legacy-visible')
    const globalPanel = modules.panelDataSource.loadPanelData(null)
    modules.state.ensureAttachedSessionContext('/tmp/team-identity-v0413-legacy-effective-normal-leader.jsonl')

    const dashIdentity = identityOf(dashPanel)
    const normalIdentity = identityOf(normalPanel)
    if (dashIdentity.displayName !== '-' || dashIdentity.slug !== '-' || dashIdentity.legacyName !== '-') {
      failures.push(`legacy teams/- panel model should expose effective legacy identity without raw mutation, got ${JSON.stringify(dashIdentity)}`)
    }
    if (!dashIdentity.teamId || !dashIdentity.projectKey) {
      failures.push(`legacy teams/- effective identity should include compact stable teamId/projectKey, got ${JSON.stringify(dashIdentity)}`)
    }
    if (normalIdentity.displayName !== 'legacy-visible' || normalIdentity.slug !== 'legacy-visible' || normalIdentity.legacyName !== 'legacy-visible') {
      failures.push(`legacy normal panel model should expose effective legacy identity, got ${JSON.stringify(normalIdentity)}`)
    }
    const globalLegacy = globalPanel.mode === 'global' ? globalPanel.teams.map(team => identityOf(team)) : []
    if (!globalLegacy.some(identity => identity.legacyName === '-') || !globalLegacy.some(identity => identity.legacyName === 'legacy-visible')) {
      failures.push(`global panel should expose effective legacy identities for legacy teams, got ${JSON.stringify(globalLegacy)}`)
    }

    const mailboxMessage = modules.state.pushMailboxMessage('legacy-visible', 'team-lead', {
      id: 'legacy-effective-identity-mailbox',
      from: 'legacy-worker',
      to: 'team-lead',
      type: 'inform',
      summary: 'legacy identity mailbox compact sentinel',
      text: 'FULL LEGACY IDENTITY MAILBOX BODY MUST STAY IN MAILBOX',
    })
    modules.panelDataSource.loadPanelData(null)
    const storedMailbox = modules.state.readMailbox('legacy-visible', 'team-lead').find(item => item.id === mailboxMessage.id)
    if (!storedMailbox || storedMailbox.readAt !== undefined || storedMailbox.deliveredAt !== undefined) {
      failures.push(`legacy effective identity global panel load must not mark mailbox read/delivered, got ${JSON.stringify(storedMailbox)}`)
    }

    const dashAfter = fs.existsSync(dashPath) ? fs.readFileSync(dashPath, 'utf8') : null
    const normalAfter = fs.existsSync(normalPath) ? fs.readFileSync(normalPath, 'utf8') : null
    if (dashAfter !== dashBefore) {
      failures.push('legacy teams/- read-only list/panel/session lookup should leave team.json byte-for-byte unchanged')
    }
    if (normalAfter !== normalBefore) {
      failures.push('legacy normal read-only list/panel/session lookup should leave team.json byte-for-byte unchanged')
    }
  })
}

async function exerciseLegacyNameValidationAndRoundTrip(env, failures) {
  const { modules } = env
  await withTempHome(modules, 'legacy-name-roundtrip', async () => {
    const team = modules.state.createInitialTeamState({
      teamName: 'legacy-roundtrip',
      description: 'legacyName validation roundtrip fixture',
      leaderSessionFile: '/tmp/team-identity-v0413-legacy-name-roundtrip-leader.jsonl',
      leaderCwd: '/tmp/team-identity-v0413/legacy-name-roundtrip',
    })
    team.identity = {
      teamId: 'legacy-team-roundtrip-id',
      projectKey: 'legacy-project-roundtrip-key',
      displayName: 'Legacy Roundtrip',
      slug: 'legacy-roundtrip',
      legacyName: 'legacy-roundtrip',
    }
    const validationReasons = modules.state.validatePersistedTeamState(team)
    if (validationReasons.length !== 0) {
      failures.push(`valid persisted identity.legacyName should pass validation, got ${JSON.stringify(validationReasons)}`)
    }
    modules.state.writeTeamState(team)
    const readBack = modules.state.readTeamState('legacy-roundtrip')
    if (readBack?.identity?.legacyName !== 'legacy-roundtrip') {
      failures.push(`persisted identity.legacyName should round-trip, got ${JSON.stringify(identityOf(readBack))}`)
    }

    for (const [label, legacyName] of [['non-string', 123], ['empty', ''], ['mismatch', 'other-legacy-name']]) {
      const invalid = JSON.parse(JSON.stringify(team))
      invalid.identity.legacyName = legacyName
      const codes = modules.state.validatePersistedTeamState(invalid).map(reason => reason.code)
      if (!codes.includes('invalid_team_identity_legacy_name')) {
        failures.push(`${label} legacyName should fail validation with invalid_team_identity_legacy_name, got ${JSON.stringify(codes)}`)
      }
    }

    const newTeam = modules.state.createInitialTeamState({
      teamName: 'new-team-no-legacy-name',
      description: 'new TeamIdentity should not gain legacyName by default',
      leaderSessionFile: '/tmp/team-identity-v0413-new-no-legacy-name-leader.jsonl',
      leaderCwd: '/tmp/team-identity-v0413/new-no-legacy-name',
    })
    if (Object.prototype.hasOwnProperty.call(newTeam.identity ?? {}, 'legacyName')) {
      failures.push(`new team identity should not include accidental legacyName, got ${JSON.stringify(identityOf(newTeam))}`)
    }
  })
}

async function exerciseSessionBindingCompatibility(env, failures) {
  const { modules } = env
  await withTempHome(modules, 'session-binding-compat', async () => {
    const legacyLeaderSession = '/tmp/team-identity-v0413-legacy-session-leader.jsonl'
    const legacyWorkerSession = '/tmp/team-identity-v0413-legacy-session-worker.jsonl'
    const legacyTeam = modules.state.createInitialTeamState({
      teamName: 'legacy-session-team',
      description: 'legacy session fallback fixture',
      leaderSessionFile: legacyLeaderSession,
      leaderCwd: '/tmp/team-identity-v0413/legacy-session-project',
    })
    delete legacyTeam.identity
    legacyTeam.members['legacy-worker'] = {
      name: 'legacy-worker',
      role: 'researcher',
      cwd: '/tmp/team-identity-v0413/legacy-session-project',
      sessionFile: legacyWorkerSession,
      status: 'idle',
      createdAt: legacyTeam.createdAt,
      updatedAt: legacyTeam.createdAt,
    }
    modules.state.writeTeamState(legacyTeam)
    modules.state.writeSessionContext(legacyWorkerSession, { teamName: 'legacy-session-team', memberName: 'legacy-worker' })

    const legacyResolved = modules.state.ensureAttachedSessionContext(legacyWorkerSession)
    if (legacyResolved.context.teamName !== 'legacy-session-team' || legacyResolved.context.memberName !== 'legacy-worker') {
      failures.push(`legacy session { teamName, memberName } fallback should resolve existing attached member, got ${JSON.stringify({ source: legacyResolved.source, context: sessionScopeOf(legacyResolved.context) })}`)
    }

    const identitySessionFile = '/tmp/team-identity-v0413-identity-session-leader.jsonl'
    const identityTeam = modules.state.createInitialTeamState({
      teamName: 'identity-session-team',
      description: 'new session identity-first persistence fixture',
      leaderSessionFile: identitySessionFile,
      leaderCwd: '/tmp/team-identity-v0413/identity-session-project',
    })
    modules.state.writeTeamState(identityTeam)
    modules.state.writeSessionContext(identitySessionFile, modules.state.buildSessionContextForTeam(identityTeam, modules.types.TEAM_LEAD))

    const rawIdentitySession = readRawSessionJson(modules, identitySessionFile)
    assertRawIncludesIdentity(rawIdentitySession, 'new identity-first session binding', failures)
    if (rawIdentitySession?.teamName !== 'identity-session-team' || rawIdentitySession?.memberName !== modules.types.TEAM_LEAD) {
      failures.push(`new identity-first session binding should retain compatible teamName/memberName, got ${JSON.stringify(rawIdentitySession)}`)
    }
  })
}

module.exports = {
  name: 'TeamIdentity v0.4.13 RED characterization',
  async run(env) {
    const failures = []
    await exerciseChineseOnlyDoesNotTouchDash(env, failures)
    await exerciseLegacyDashSurvivesUnsafeLookups(env, failures)
    await exerciseSeparatorTrimming(env, failures)
    await exerciseScopedIdentityBehavior(env, failures)
    await exerciseLegacyNoIdentitySameSlug(env, failures)
    await exerciseLegacyNameAndEffectiveIdentityVisibility(env, failures)
    await exerciseLegacyNameValidationAndRoundTrip(env, failures)
    await exerciseSessionBindingCompatibility(env, failures)

    assert.deepEqual(failures, [], `TeamIdentity v0.4.13 RED expectations not met:\n${failures.join('\n\n')}`)
  },
}
