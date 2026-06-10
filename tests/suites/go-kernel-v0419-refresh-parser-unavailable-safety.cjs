const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const SAFETY = 'docs/perf/v0.4.19-team-refresh-parser-unavailable-safety.md'
const READINESS = 'docs/perf/v0.4.19-tmux-snapshot-fail-closed-readiness.md'
const PREREQ = 'docs/perf/v0.4.19-go-runtime-prerequisites.md'
const PLAN = 'docs/agentteam方案书.md'
const V0415_PANEL_TMUX_SUITE = 'tests/suites/zzzzzzzzzzzzzz-team-panel-tmux-v0415.cjs'
const PARITY_SUITE = 'tests/suites/go-kernel-tmux-snapshot-parser.cjs'
const EXPECTED_VERSION = '0.6.8'

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} should match ${pattern}`)
}

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-v0419-parser-unavailable-${name}-`))
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

function createTeamWithWorker(modules, name, workerName = 'worker-1') {
  modules.state.deleteTeamState(name)
  const team = modules.state.createInitialTeamState({
    teamName: name,
    storageName: name,
    leaderCwd: `/tmp/${name}`,
    leaderSessionFile: `/tmp/${name}-leader.jsonl`,
    description: 'v0.4.19 parser unavailable refresh safety fixture',
  })
  modules.state.upsertMember(team, {
    name: workerName,
    role: 'implementer',
    cwd: team.leaderCwd,
    sessionFile: `/tmp/${name}-${workerName}.jsonl`,
    paneId: `%${name}-${workerName}`,
    windowTarget: 'parser-unavailable:@1',
    status: 'running',
    lastWakeReason: 'working normally',
    lastError: 'preexisting non-pane warning',
  })
  modules.state.writeTeamState(team)
  modules.runtimePanes.invalidatePaneReconcileCache(team.name)
  return modules.state.readTeamState(team.name)
}

function memberSnapshot(team, workerName = 'worker-1') {
  const member = team?.members?.[workerName]
  assert.ok(member, `fixture member ${workerName} should exist`)
  return {
    paneId: member.paneId,
    windowTarget: member.windowTarget,
    status: member.status,
    lastWakeReason: member.lastWakeReason,
    lastError: member.lastError,
    updatedAt: member.updatedAt,
  }
}

function parserUnavailableSnapshot() {
  return {
    capturedAt: 1700001903000,
    panes: [],
    byPaneId: {},
    ok: false,
    error: 'tmuxSnapshotParse unavailable: helper-malformed-json',
  }
}

function createParserUnavailableRuntimeRepository(runtimeRepositoryModule, options = {}) {
  const prepareCalls = []
  const listCalls = []
  const fallbackPanes = options.fallbackPanes ?? []
  return {
    ...runtimeRepositoryModule.createRuntimeRepository(),
    prepareCalls,
    listCalls,
    withRuntimeSnapshot(handler) {
      return handler(parserUnavailableSnapshot())
    },
    prepareTeamForPanel(team, prepareOptions) {
      prepareCalls.push({ teamName: team.name, options: prepareOptions })
      return runtimeRepositoryModule.reconcileTeamPanes(team, { ...(prepareOptions || {}), snapshot: parserUnavailableSnapshot() })
    },
    listAgentTeamPanes(snapshot) {
      listCalls.push({ snapshot })
      return snapshot ? [] : fallbackPanes
    },
  }
}

function assertSameMemberSafety(before, after, label) {
  assert.equal(after.paneId, before.paneId, `${label} must preserve paneId`)
  assert.equal(after.windowTarget, before.windowTarget, `${label} must preserve windowTarget`)
  assert.equal(after.status, before.status, `${label} must preserve worker status`)
  assert.equal(after.lastWakeReason, before.lastWakeReason, `${label} must not write pane lost wake reason`)
  assert.equal(after.lastError, before.lastError, `${label} must not write tmux pane disappeared error`)
  assert.equal(String(after.lastWakeReason || '').includes('pane lost'), false, `${label} must not include pane lost`)
  assert.equal(String(after.lastError || '').includes('pane disappeared'), false, `${label} must not include pane disappeared`)
}

function assertDocs(root) {
  const safety = read(root, SAFETY)
  const readiness = read(root, READINESS)
  const prereq = read(root, PREREQ)
  const plan = read(root, PLAN)
  const combined = [safety, readiness, prereq, plan].join('\n\n')

  for (const rel of [SAFETY, READINESS, PREREQ, PLAN, V0415_PANEL_TMUX_SUITE, PARITY_SUITE]) {
    assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
  }

  for (const [rel, source] of [[READINESS, readiness], [PREREQ, prereq], [PLAN, plan]]) {
    assertIncludes(source, SAFETY, `${rel} should link parser-unavailable safety doc`)
  }

  for (const expected of [
    'parser unavailable means an unknown/stale snapshot, not pane disappearance',
    'Capture failure',
    'Parser failure',
    'Successful empty snapshot',
    'Future cutover must distinguish tmux capture failure from parser failure',
    'Light Attached Refresh Safety',
    'Global Refresh Safety',
    '`reconcileTeamPanes(team, { mode: \'light\', snapshot })`',
    'snapshot.ok === false',
    'clear `paneId` or `windowTarget`',
    'mark active workers `error`',
    '`lastWakeReason` as `pane lost`',
    '`lastError` as `tmux pane disappeared`',
    'kill panes',
    'force reconcile',
    'destructively mutate worker/member state',
    'false successful empty pane list',
    'live tmux fallback/retry behavior',
    'explicit TypeScript/pi tmux authority',
    'not hidden parser success',
    'TypeScript/pi remains owner',
    'tmux execution',
    'pane lifecycle',
    'worker lifecycle',
    '`/team`',
    'state writes',
    'task/report governance',
    'full-text boundaries',
    V0415_PANEL_TMUX_SUITE,
    PARITY_SUITE,
  ]) {
    assertIncludes(safety, expected, 'parser-unavailable safety doc')
  }

  for (const [label, pattern] of [
    ['unknown stale not pane loss', /parser unavailable means an unknown\/stale snapshot, not pane disappearance/i],
    ['capture vs parser vs empty', /Capture failure[\s\S]*Parser failure[\s\S]*Successful empty snapshot/i],
    ['light refresh non-destructive', /Light Attached Refresh Safety[\s\S]*snapshot is `ok:false`[\s\S]*must not[\s\S]*clear `paneId`[\s\S]*mark active workers `error`[\s\S]*kill panes[\s\S]*force reconcile/i],
    ['global no false empty', /Global Refresh Safety[\s\S]*must not present it as a false successful empty pane list[\s\S]*avoid treating `panes: \[\]` with `ok:false` as proof that no panes exist/i],
    ['explicit fallback retry', /snapshot is `ok:false`[\s\S]*runtimeRepository\.listAgentTeamPanes\(undefined\)[\s\S]*explicit TypeScript\/pi tmux authority[\s\S]*not hidden parser success/i],
    ['source facts', /adapters\/tmux\/teamPanes\.ts[\s\S]*snapshot\.ok === false[\s\S]*teamPanel\/dataSource\.ts[\s\S]*\{ mode: 'light' \}[\s\S]*snapshot\.ok === false \? undefined : snapshot/i],
    ['stop go implementation tests', /No future parser cutover[\s\S]*refresh safety tests prove[\s\S]*unknown\/stale and non-destructive/i],
    ['no runtime behavior changes', /no runtime behavior changes are made|does not change runtime behavior/i],
  ]) {
    assertMatches(safety, pattern, `parser-unavailable safety doc: ${label}`)
  }

  const sourceCombined = [
    read(root, 'adapters/tmux/teamPanes.ts'),
    read(root, 'teamPanel/dataSource.ts'),
  ].join('\n')
  assertMatches(sourceCombined, /snapshot\?\.ok === false[\s\S]*return false/i, 'source should short-circuit light reconcile on parser unavailable snapshot')
  assertMatches(sourceCombined, /loadAttachedPanelData[\s\S]*prepareTeamForPanel\(deps, teamName, 'attached', \{ mode: 'light' \}\)/i, 'attached panel should use light refresh intent')
  assertMatches(sourceCombined, /prepareTeamForPanel\(deps, teamName, 'global', \{ mode: 'light', snapshot \}\)/i, 'global panel should pass light refresh snapshot')
  assertMatches(sourceCombined, /listAgentTeamPanes\(snapshot\.ok === false \? undefined : snapshot\)/i, 'global orphan discovery should make live fallback explicit for ok:false snapshot')

  for (const forbiddenPhrase of [
    'Go is default',
    'Go remains default',
    'default Go runtime approved',
    'delete TypeScript parser fallback now',
    'parser failure means pane disappearance',
    'parser failure should clear paneId',
    'parser failure should mark workers error',
    'false successful empty pane list is allowed',
    'hidden parser success is allowed',
    'Go owns tmux lifecycle',
    'Go owns worker lifecycle',
    'Go owns state writes',
    'Go owns task/report governance',
    'Go reads mailbox full text',
    'native packaging is approved',
    'run `npm version` to release',
    'run `npm publish` to release',
  ]) {
    assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.19 refresh safety docs must not imply forbidden policy: ${forbiddenPhrase}`)
  }
}

async function assertRefreshSafety(env) {
  const { modules, helpers } = env
  const runtimeRepositoryModule = helpers.requireDist('runtime/repository.js')
  const stateRepository = helpers.requireDist('state/repository.js').createStateRepository()

  await withTempHome(modules, 'attached', async () => {
    const team = createTeamWithWorker(modules, 'v0419-parser-unavailable-attached')
    const before = memberSnapshot(team)
    const runtimeRepository = createParserUnavailableRuntimeRepository(runtimeRepositoryModule)

    const data = modules.panelDataSource.loadPanelData(team.name, { stateRepository, runtimeRepository })
    assert.equal(data.mode, 'attached', 'attached panel should still load')
    assert.equal(runtimeRepository.prepareCalls.length, 1, 'attached refresh should prepare once')
    assert.equal(runtimeRepository.prepareCalls[0].options.mode, 'light', 'attached refresh should use light mode')
    assert.equal(runtimeRepository.prepareCalls[0].options.force, undefined, 'attached refresh must not force reconcile')
    assert.equal(runtimeRepository.listCalls.length, 0, 'attached refresh should not run orphan pane fallback discovery')

    const after = memberSnapshot(modules.state.readTeamState(team.name))
    assertSameMemberSafety(before, after, 'attached parser-unavailable refresh')
    assert.equal(data.team.members['worker-1'].paneId, before.paneId, 'attached panel model should preserve paneId')
    assert.equal(data.team.members['worker-1'].status, before.status, 'attached panel model should preserve worker status')
  })

  await withTempHome(modules, 'global', async () => {
    const first = createTeamWithWorker(modules, 'v0419-parser-unavailable-global-a', 'worker-1')
    const second = createTeamWithWorker(modules, 'v0419-parser-unavailable-global-b', 'worker-2')
    const firstBefore = memberSnapshot(first, 'worker-1')
    const secondBefore = memberSnapshot(second, 'worker-2')
    const fallbackPane = {
      paneId: '%v0419-parser-unavailable-orphan',
      target: 'parser-unavailable:@9',
      label: 'agentteam orphan',
      currentCommand: 'pi',
    }
    const runtimeRepository = createParserUnavailableRuntimeRepository(runtimeRepositoryModule, { fallbackPanes: [fallbackPane] })

    const data = modules.panelDataSource.loadPanelData(null, { stateRepository, runtimeRepository })
    assert.equal(data.mode, 'global', 'global panel should load')
    assert.equal(runtimeRepository.prepareCalls.length, 2, 'global refresh should prepare each team once')
    for (const call of runtimeRepository.prepareCalls) {
      assert.equal(call.options.mode, 'light', 'global refresh should use light mode')
      assert.equal(call.options.force, undefined, 'global refresh must not force reconcile')
      assert.equal(call.options.snapshot.ok, false, 'global refresh should pass parser-unavailable snapshot to light reconcile')
    }
    assert.equal(runtimeRepository.listCalls.length, 1, 'global refresh should do one explicit orphan discovery call')
    assert.equal(runtimeRepository.listCalls[0].snapshot, undefined, 'global ok:false snapshot should trigger explicit live tmux fallback, not snapshot empty success')
    assert.deepEqual(data.orphanPanes, [fallbackPane], 'global orphan panes should come from explicit fallback discovery')

    const firstAfter = memberSnapshot(modules.state.readTeamState(first.name), 'worker-1')
    const secondAfter = memberSnapshot(modules.state.readTeamState(second.name), 'worker-2')
    assertSameMemberSafety(firstBefore, firstAfter, 'global parser-unavailable refresh first team')
    assertSameMemberSafety(secondBefore, secondAfter, 'global parser-unavailable refresh second team')
    const panelTeam = data.teams.find(item => item.name === first.name)
    assert.ok(panelTeam, 'global panel should include first team')
    assert.equal(panelTeam.members['worker-1'].paneId, firstBefore.paneId, 'global panel model should preserve paneId')
    assert.equal(panelTeam.members['worker-1'].status, firstBefore.status, 'global panel model should preserve worker status')
  })
}

module.exports = {
  name: 'Go kernel v0.4.19 refresh parser-unavailable safety',
  async run(env) {
    const root = env.helpers.extRoot
    assertDocs(root)
    await assertRefreshSafety(env)

    const packageJson = JSON.parse(read(root, 'package.json'))
    assert.equal(packageJson.version, EXPECTED_VERSION, 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist for docs-only refresh safety planning`)
    }
  },
}
