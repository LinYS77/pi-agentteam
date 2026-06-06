const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-${name}-`))
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

function listActiveTeamDirs(home) {
  const teamsDir = path.join(home, 'teams')
  if (!fs.existsSync(teamsDir)) return []
  return fs.readdirSync(teamsDir).sort((a, b) => a.localeCompare(b))
}

function formatResult(result) {
  return JSON.stringify({ text: result?.content?.[0]?.text, details: result?.details }, null, 2)
}

function isWeakGeneratedName(name) {
  return name === '-' || name === '-a' || /^[._-]+$/.test(name)
}

async function exerciseInvalidTeamName(env, input) {
  const { pi, modules, helpers } = env
  const tool = name => pi.__tools.get(name)
  const label = input.label
  return await withTempHome(modules, `name-safety-team-${input.slug}`, async home => {
    const sessionFile = `/tmp/name-safety-${input.slug}-leader.jsonl`
    const ctx = helpers.createCtx(`/tmp/name-safety-${input.slug}-project`, sessionFile, [])
    const result = await tool('agentteam_create').execute(`name-safety-${input.slug}`, {
      team_name: input.value,
      description: `unsafe team name fixture: ${label}`,
    }, null, () => {}, ctx)

    const violations = []
    const dirs = listActiveTeamDirs(home)
    const sessionContext = modules.state.readSessionContext(sessionFile)

    if (!result.details?.denied) {
      violations.push(`${label}: expected create to be denied, got ${formatResult(result)}`)
    }
    if (dirs.length > 0) {
      violations.push(`${label}: expected no active team dirs, found ${JSON.stringify(dirs)}`)
    }
    if (fs.existsSync(path.join(home, 'teams', '-'))) {
      violations.push(`${label}: must not create or reuse active teams/-`)
    }
    if (sessionContext.teamName !== null || sessionContext.memberName !== null) {
      violations.push(`${label}: expected session to remain unattached, got ${JSON.stringify(sessionContext)}`)
    }
    return violations
  })
}

async function exerciseLegacyDashTeamIsNotReused(env) {
  const { pi, modules, helpers } = env
  const tool = name => pi.__tools.get(name)
  return await withTempHome(modules, 'name-safety-legacy-dash', async home => {
    const oldSessionFile = '/tmp/name-safety-legacy-dash-old-leader.jsonl'
    const newSessionFile = '/tmp/name-safety-legacy-dash-new-leader.jsonl'
    const legacyTeam = modules.state.createInitialTeamState({
      teamName: '-',
      description: 'legacy dash team must not be reused by unsafe unicode names',
      leaderSessionFile: oldSessionFile,
      leaderCwd: '/tmp/name-safety-legacy-dash-old-project',
    })
    modules.state.writeTeamState(legacyTeam)

    const legacyPath = path.join(home, 'teams', '-', 'team.json')
    const beforeRaw = fs.readFileSync(legacyPath, 'utf8')
    const beforeParsed = JSON.parse(beforeRaw)

    const ctx = helpers.createCtx('/tmp/name-safety-legacy-dash-new-project', newSessionFile, [])
    const result = await tool('agentteam_create').execute('name-safety-legacy-dash-create', {
      team_name: '基础员工团队',
      description: 'unsafe unicode name must not attach to teams/-',
    }, null, () => {}, ctx)

    const violations = []
    const afterRaw = fs.existsSync(legacyPath) ? fs.readFileSync(legacyPath, 'utf8') : null
    const afterTeam = modules.state.readTeamState('-')
    const newSessionContext = modules.state.readSessionContext(newSessionFile)
    const dirs = listActiveTeamDirs(home)

    if (!result.details?.denied) {
      violations.push(`legacy teams/-: expected unicode create to be denied, got ${formatResult(result)}`)
    }
    if (result.details?.recovered || result.details?.alreadyExists) {
      violations.push(`legacy teams/-: unsafe unicode create must not attach/recover existing teams/-, got ${formatResult(result)}`)
    }
    if (afterRaw !== beforeRaw) {
      violations.push('legacy teams/-: unsafe unicode create must not modify the legacy dash team file')
    }
    if (!afterTeam) {
      violations.push('legacy teams/-: existing dash team must remain present, not deleted or quarantined')
    } else {
      if (afterTeam.leaderSessionFile !== beforeParsed.leaderSessionFile) {
        violations.push(`legacy teams/-: leaderSessionFile changed from ${beforeParsed.leaderSessionFile} to ${afterTeam.leaderSessionFile}`)
      }
      if (afterTeam.leaderCwd !== beforeParsed.leaderCwd) {
        violations.push(`legacy teams/-: leaderCwd changed from ${beforeParsed.leaderCwd} to ${afterTeam.leaderCwd}`)
      }
      if (afterTeam.members['team-lead']?.sessionFile !== beforeParsed.members['team-lead'].sessionFile) {
        violations.push(`legacy teams/-: team-lead sessionFile changed to ${afterTeam.members['team-lead']?.sessionFile}`)
      }
    }
    if (newSessionContext.teamName !== null || newSessionContext.memberName !== null) {
      violations.push(`legacy teams/-: new unsafe session should remain unattached, got ${JSON.stringify(newSessionContext)}`)
    }
    if (JSON.stringify(dirs) !== JSON.stringify(['-'])) {
      violations.push(`legacy teams/-: expected only pre-existing dash dir to remain active, found ${JSON.stringify(dirs)}`)
    }
    return violations
  })
}

async function exerciseInvalidWorkerName(env, input) {
  const { pi, modules, helpers } = env
  const tool = name => pi.__tools.get(name)
  const label = input.label
  return await withTempHome(modules, `name-safety-worker-${input.slug}`, async () => {
    const sessionFile = `/tmp/name-safety-worker-${input.slug}-leader.jsonl`
    const ctx = helpers.createCtx(`/tmp/name-safety-worker-${input.slug}-project`, sessionFile, [])
    const createResult = await tool('agentteam_create').execute(`name-safety-worker-${input.slug}-create`, {
      team_name: `worker-name-safety-${input.slug}`,
      description: 'valid team for invalid worker name regression',
    }, null, () => {}, ctx)
    assert.equal(createResult.details?.teamName, `worker-name-safety-${input.slug}`)

    const spawnResult = await tool('agentteam_spawn').execute(`name-safety-worker-${input.slug}-spawn`, {
      name: input.value,
      role: 'researcher',
    }, null, () => {}, ctx)

    if (env.patches?.livePanes && spawnResult.details?.paneId) {
      env.patches.livePanes.delete(spawnResult.details.paneId)
    }

    const team = modules.state.readTeamState(`worker-name-safety-${input.slug}`)
    const memberNames = Object.keys(team?.members ?? {}).filter(name => name !== modules.types.TEAM_LEAD).sort()
    const weakMembers = memberNames.filter(isWeakGeneratedName)
    const violations = []
    if (!(spawnResult.details?.denied || spawnResult.details?.ok === false)) {
      violations.push(`${label}: expected spawn to be denied, got ${formatResult(spawnResult)}`)
    }
    if (memberNames.length > 0) {
      violations.push(`${label}: invalid worker name should not create teammates, found ${JSON.stringify(memberNames)}`)
    }
    if (weakMembers.length > 0) {
      violations.push(`${label}: invalid worker name must not produce weak member names, found ${JSON.stringify(weakMembers)}`)
    }
    return violations
  })
}

module.exports = {
  name: 'name safety guardrails',
  async run(env) {
    const { pi, modules, helpers } = env
    const tool = name => pi.__tools.get(name)

    await withTempHome(modules, 'name-safety-ascii-team', async home => {
      const sessionFile = '/tmp/name-safety-ascii-team-leader.jsonl'
      const ctx = helpers.createCtx('/tmp/name-safety-ascii-project', sessionFile, [])
      const result = await tool('agentteam_create').execute('name-safety-ascii-create', {
        team_name: 'safe-team-01',
        description: 'ASCII team names should keep current compatible behavior',
      }, null, () => {}, ctx)

      helpers.assertContains(result.content[0].text, 'Created team safe-team-01')
      assert.equal(result.details?.teamName, 'safe-team-01')
      assert.equal(fs.existsSync(path.join(home, 'teams', 'safe-team-01', 'team.json')), true, 'ASCII team should create vNext team state')
      assert.equal(modules.state.readTeamState('safe-team-01')?.name, 'safe-team-01')
      assert.deepEqual(modules.state.readSessionContext(sessionFile), { teamName: 'safe-team-01', memberName: modules.types.TEAM_LEAD })
    })

    const violations = []
    for (const input of [
      { label: 'Chinese-only team name', slug: 'chinese-only', value: '基础员工团队' },
      { label: 'dash-only team name', slug: 'dash-only', value: '---' },
      { label: 'underscore-only team name', slug: 'underscore-only', value: '___' },
      { label: 'punctuation-only team name', slug: 'punctuation-only', value: '!!!' },
      { label: 'whitespace-only team name', slug: 'whitespace-only', value: '   ' },
    ]) {
      violations.push(...await exerciseInvalidTeamName(env, input))
    }

    violations.push(...await exerciseLegacyDashTeamIsNotReused(env))

    for (const input of [
      { label: 'Chinese-only worker name', slug: 'chinese-only', value: '基础员工' },
      { label: 'dash-only worker name', slug: 'dash-only', value: '---' },
    ]) {
      violations.push(...await exerciseInvalidWorkerName(env, input))
    }

    assert.deepEqual(violations, [], 'unsafe team/worker names must be rejected without creating, attaching, or mutating weak slug state')
  },
}
