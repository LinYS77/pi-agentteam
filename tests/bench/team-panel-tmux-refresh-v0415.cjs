#!/usr/bin/env node
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { buildFixtureProfileMetadata, buildKernelMetadata, normalizeFixtureProfileName } = require('./kernelMetadata.cjs')

const BASE_TIME = 1700006000000
const BENCH_SENTINEL = 'BENCH_PANEL_TMUX_V0415_FULL_BODY_SENTINEL_SHOULD_NOT_LEAK'
const KEYS = { enter: '__enter__', down: '__down__' }
const DEFAULT_FIXTURE = Object.freeze({
  warmupIterations: 1,
  iterations: 5,
  attached: {
    teamName: 'bench-panel-tmux-v0415-attached',
    workerCount: 3,
    taskCount: 100,
    mailboxCount: 500,
  },
  global: {
    teamPrefix: 'bench-panel-tmux-v0415-global',
    teamCount: 10,
    workerCount: 3,
    taskCount: 10,
    mailboxCount: 25,
  },
})
const STRESS_FIXTURE = Object.freeze({
  warmupIterations: 1,
  iterations: 3,
  attached: {
    teamName: 'bench-panel-tmux-v0415-attached-stress',
    workerCount: 6,
    taskCount: 500,
    mailboxCount: 2_000,
  },
  global: {
    teamPrefix: 'bench-panel-tmux-v0415-global-stress',
    teamCount: 25,
    workerCount: 6,
    taskCount: 40,
    mailboxCount: 100,
  },
})
const FIXTURE_PROFILES = Object.freeze({
  baseline: DEFAULT_FIXTURE,
  large: STRESS_FIXTURE,
  stress: STRESS_FIXTURE,
})

function resolveFixtureProfileName(profileName = 'baseline') {
  const normalized = normalizeFixtureProfileName(profileName)
  return Object.prototype.hasOwnProperty.call(FIXTURE_PROFILES, normalized) ? normalized : 'baseline'
}

function fixtureForProfile(profileName = 'baseline') {
  return FIXTURE_PROFILES[resolveFixtureProfileName(profileName)]
}

function percentile(values, percentileValue) {
  const finite = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b)
  if (finite.length === 0) return 0
  const index = Math.min(finite.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * finite.length) - 1))
  return finite[index]
}

function stats(values) {
  const finite = values.filter(value => Number.isFinite(value))
  return {
    count: finite.length,
    min: finite.length ? Math.min(...finite) : 0,
    max: finite.length ? Math.max(...finite) : 0,
    p50: percentile(finite, 50),
    p95: percentile(finite, 95),
  }
}

function panelEventStats(summary, kind) {
  return stats((summary?.panel?.events || []).filter(event => event.kind === kind).map(event => event.durationMs))
}

function summarizePanel(summary) {
  return {
    dataLoadMs: panelEventStats(summary, 'dataLoad'),
    renderMs: panelEventStats(summary, 'render'),
    requestRenderCount: summary?.panel?.requestRenderCount ?? 0,
    cacheHitCount: summary?.panel?.cacheHitCount ?? 0,
    diffChangedCount: summary?.panel?.diffChangedCount ?? 0,
    events: {
      dataLoad: summary?.panel?.dataLoadCount ?? 0,
      readModelBuild: summary?.panel?.readModelBuildCount ?? 0,
      render: summary?.panel?.renderCount ?? 0,
      requestRender: summary?.panel?.requestRenderCount ?? 0,
      cacheHit: summary?.panel?.cacheHitCount ?? 0,
      diffChanged: summary?.panel?.diffChangedCount ?? 0,
    },
  }
}

function summarizeTmux(summary, fakeClient) {
  return {
    commandCount: summary?.tmux?.commandCount ?? 0,
    totalDurationMs: summary?.tmux?.totalDurationMs ?? 0,
    successCount: summary?.tmux?.successCount ?? 0,
    failureCount: summary?.tmux?.failureCount ?? 0,
    commandNames: summary?.tmux?.commandNames ?? [],
    stubCallCount: fakeClient.calls.length,
    stubCommands: [...new Set(fakeClient.calls.map(args => args[0]))].sort(),
  }
}

function createFakeTheme() {
  const passthrough = value => String(value ?? '')
  return {
    fg: (_name, text) => String(text ?? ''),
    bg: (_name, text) => String(text ?? ''),
    bold: passthrough,
  }
}

function createPanelHarness(panelModule, teamName) {
  const requestedRenders = []
  const doneCalls = []
  const panels = []
  const ctx = {
    cwd: '/tmp/bench-panel-tmux-v0415',
    sessionManager: { getSessionFile: () => '/tmp/bench-panel-tmux-v0415-leader.jsonl' },
    isIdle: () => true,
    hasPendingMessages: () => false,
    ui: {
      notify() {},
      setStatus() {},
      setWidget() {},
      confirm: async () => true,
      theme: createFakeTheme(),
      custom: async callback => {
        const tui = {
          terminal: { rows: 48, columns: 160 },
          requestRender() {
            requestedRenders.push({ at: requestedRenders.length })
          },
        }
        const done = value => { doneCalls.push(value) }
        const panel = await callback(tui, createFakeTheme(), {}, done)
        panels.push(panel)
        return doneCalls[doneCalls.length - 1]
      },
    },
  }
  return {
    requestedRenders,
    doneCalls,
    panels,
    async open() {
      await panelModule.openTeamPanel(ctx, teamName)
      if (!panels[0]) throw new Error('Expected openTeamPanel to create a panel instance')
      return panels[0]
    },
  }
}

async function flushPanel(panel) {
  if (panel && typeof panel.flushRender === 'function') await panel.flushRender()
}

async function runAttachedSyncIteration(panel) {
  panel.render(160)
  panel.handleInput('a')
  await flushPanel(panel)
  panel.handleInput(KEYS.down)
  await flushPanel(panel)
  panel.handleInput(KEYS.enter)
  await flushPanel(panel)
}

async function runGlobalRefreshIteration(panel) {
  panel.render(160)
  panel.handleInput('a')
  await flushPanel(panel)
  panel.handleInput(KEYS.enter)
  await flushPanel(panel)
}

function addWorker(modules, team, workerName, index, panePrefix) {
  const paneId = `%${panePrefix}-${index}`
  modules.state.upsertMember(team, {
    name: workerName,
    role: ['researcher', 'planner', 'implementer'][index % 3],
    cwd: team.leaderCwd,
    sessionFile: `/tmp/${team.name}-${workerName}.jsonl`,
    paneId,
    windowTarget: 'bench-panel-tmux-v0415:@1',
    status: 'idle',
  })
  team.members[workerName].createdAt = BASE_TIME + index
  team.members[workerName].updatedAt = BASE_TIME + index
  return paneId
}

function createBenchTeam(modules, input) {
  modules.state.deleteTeamState(input.teamName)
  const team = modules.state.createInitialTeamState({
    teamName: input.teamName,
    storageName: input.teamName,
    leaderSessionFile: `/tmp/${input.teamName}-leader.jsonl`,
    leaderCwd: `/tmp/${input.teamName}`,
    description: 'v0.4.15 deterministic panel/tmux bench fixture',
  })
  team.createdAt = BASE_TIME
  team.members['team-lead'].createdAt = BASE_TIME
  team.members['team-lead'].updatedAt = BASE_TIME
  team.members['team-lead'].paneId = `%${input.panePrefix}-leader`
  team.members['team-lead'].windowTarget = 'bench-panel-tmux-v0415:@1'

  const workerNames = []
  const livePaneIds = new Set([team.members['team-lead'].paneId])
  for (let index = 1; index <= input.workerCount; index += 1) {
    const workerName = `bench-worker-${index}`
    workerNames.push(workerName)
    livePaneIds.add(addWorker(modules, team, workerName, index, input.panePrefix))
  }

  for (let index = 0; index < input.taskCount; index += 1) {
    const owner = workerNames[index % workerNames.length]
    const task = modules.state.createTask(team, {
      title: `Bench panel task ${String(index + 1).padStart(3, '0')}`,
      description: `Deterministic panel/tmux bench task ${index + 1}`,
      owner,
    })
    task.createdAt = BASE_TIME + 1_000 + index
    task.updatedAt = BASE_TIME + 2_000 + index
    if (index % 17 === 0) {
      task.status = 'blocked'
      task.blockedBy.push('deterministic panel bench blocker')
    }
    if (index % 10 === 0) {
      const report = modules.state.appendTaskReport(team, {
        taskId: task.id,
        type: 'report_done',
        author: owner,
        text: `${BENCH_SENTINEL} report body ${index} ${'R'.repeat(200)}`,
        summary: `Bench panel compact report ${index}`,
        createdAt: BASE_TIME + 3_000 + index,
        threadId: `task:${task.id}`,
        reporterIsOwner: true,
        statusAtReport: task.status === 'blocked' ? 'blocked' : 'open',
        ownerAtReport: owner,
      })
      modules.state.appendTaskEvent(team, {
        taskId: task.id,
        type: 'report_submitted',
        by: owner,
        at: report.createdAt + 1,
        summary: report.summary,
        reportId: report.id,
      })
    }
    if (index % 5 === 0) {
      modules.state.appendTaskMessageRef(team, {
        taskId: task.id,
        mailboxMessageId: `${input.teamName}-task-ref-${index}`,
        from: 'team-lead',
        to: owner,
        type: 'assignment',
        createdAt: BASE_TIME + 4_000 + index,
        threadId: `task:${task.id}`,
        summary: `Bench panel compact assignment ${index}`,
      })
    }
  }

  modules.state.writeTeamState(team)
  modules.state.writeSessionContext(team.leaderSessionFile, modules.state.buildSessionContextForTeam(team, 'team-lead'))
  const taskIds = Object.keys(team.tasks).sort()
  for (let index = 0; index < input.mailboxCount; index += 1) {
    modules.state.pushMailboxMessage(input.teamName, 'team-lead', {
      id: `${input.teamName}-mailbox-${String(index + 1).padStart(4, '0')}`,
      from: workerNames[index % workerNames.length],
      to: 'team-lead',
      type: index % 11 === 0 ? 'report_blocked' : index % 7 === 0 ? 'question' : 'inform',
      priority: index % 11 === 0 ? 'high' : 'normal',
      taskId: taskIds[index % taskIds.length],
      threadId: `task:${taskIds[index % taskIds.length]}`,
      summary: `Bench panel compact mailbox ${index + 1}`,
      text: `${BENCH_SENTINEL} mailbox body ${index + 1} ${'M'.repeat(240)}`,
      metadata: { benchIndex: index },
      createdAt: BASE_TIME + 10_000 + index,
    })
  }
  modules.runtimePanes?.invalidatePaneReconcileCache?.(input.teamName)
  return { teamName: input.teamName, livePaneIds }
}

function createFixtures(modules, options) {
  const fixture = mergeFixtureOptions(options)
  const attached = createBenchTeam(modules, {
    ...fixture.attached,
    panePrefix: 'bench-panel-attached',
  })
  const globalTeams = []
  const livePaneIds = new Set(attached.livePaneIds)
  for (let index = 0; index < fixture.global.teamCount; index += 1) {
    const teamName = `${fixture.global.teamPrefix}-${String(index + 1).padStart(2, '0')}`
    const created = createBenchTeam(modules, {
      teamName,
      workerCount: fixture.global.workerCount,
      taskCount: fixture.global.taskCount,
      mailboxCount: fixture.global.mailboxCount,
      panePrefix: `bench-panel-global-${index + 1}`,
    })
    globalTeams.push(created.teamName)
    for (const paneId of created.livePaneIds) livePaneIds.add(paneId)
  }
  return { fixture, attachedTeamName: attached.teamName, globalTeams, livePaneIds }
}

function mergeFixtureOptions(options = {}) {
  const fixtureProfile = resolveFixtureProfileName(options.fixtureProfile ?? process.env.AGENTTEAM_BENCH_FIXTURE ?? 'baseline')
  const defaults = fixtureForProfile(fixtureProfile)
  return {
    fixtureProfile,
    warmupIterations: options.warmupIterations ?? defaults.warmupIterations,
    iterations: options.iterations ?? defaults.iterations,
    attached: { ...defaults.attached, ...(options.attached || {}) },
    global: { ...defaults.global, ...(options.global || {}) },
  }
}

function createCountingTmuxClient(livePaneIds, orphanPaneIds = []) {
  const calls = []
  function record(args) {
    calls.push([...args])
  }
  function rows() {
    return [
      ...Array.from(livePaneIds).map(paneId => `${paneId}\tbench-panel-tmux-v0415:@1\tagentteam ${paneId}\tpi`),
      ...orphanPaneIds.map(paneId => `${paneId}\tbench-panel-tmux-v0415:@9\tagentteam orphan ${paneId}\tpi`),
    ].join('\n')
  }
  function display(args) {
    const targetIndex = args.indexOf('-t')
    const paneId = targetIndex >= 0 ? args[targetIndex + 1] : '%current'
    if (!livePaneIds.has(paneId)) return { ok: false, stdout: '', stderr: `missing ${paneId}` }
    const format = args[args.length - 1] || ''
    if (format.includes('#{session_name}:#{window_id}')) return { ok: true, stdout: 'bench-panel-tmux-v0415:@1' }
    return { ok: true, stdout: paneId }
  }
  return {
    calls,
    exec(args) {
      record(args)
      if (args[0] === 'list-panes') return rows()
      if (args[0] === 'display-message') return display(args).stdout
      return ''
    },
    execNoThrow(args) {
      record(args)
      if (args[0] === 'list-panes') return { ok: true, stdout: rows() }
      if (args[0] === 'display-message') return display(args)
      return { ok: true, stdout: '' }
    },
    async execAsync(args) {
      return this.exec(args)
    },
    async execNoThrowAsync(args) {
      return this.execNoThrow(args)
    },
  }
}

async function runScenario(input) {
  const { profiling, tmuxClient, fakeClient, panelModule, teamName, kind, iterations, warmupIterations } = input
  profiling.resetProfiling()
  const harness = createPanelHarness(panelModule, teamName)
  const panel = await harness.open()
  const iterate = kind === 'attached' ? runAttachedSyncIteration : runGlobalRefreshIteration
  for (let index = 0; index < warmupIterations; index += 1) {
    await iterate(panel)
  }
  profiling.resetProfiling()
  fakeClient.calls.length = 0
  for (let index = 0; index < iterations; index += 1) {
    await iterate(panel)
  }
  const summary = profiling.readProfilingSummary()
  return {
    panel: summarizePanel(summary),
    tmux: summarizeTmux(summary, fakeClient),
    requestRenderCount: harness.requestedRenders.length,
    doneCallCount: harness.doneCalls.length,
    customPanelCount: harness.panels.length,
    profileEnabled: summary.enabled,
    tmuxClient,
  }
}

async function runPanelTmuxBenchWithModules(input) {
  const { modules, profiling, panelModule, tmuxClient, options = {} } = input
  const fixture = createFixtures(modules, options)
  const fakeClient = createCountingTmuxClient(fixture.livePaneIds, ['%bench-panel-tmux-v0415-orphan'])
  const previousProfile = process.env.PI_AGENTTEAM_PROFILE
  process.env.PI_AGENTTEAM_PROFILE = '1'
  try {
    let attached
    let global
    await tmuxClient.withTmuxClientForTests(fakeClient, async () => {
      attached = await runScenario({
        profiling,
        tmuxClient,
        fakeClient,
        panelModule,
        teamName: fixture.attachedTeamName,
        kind: 'attached',
        iterations: fixture.fixture.iterations,
        warmupIterations: fixture.fixture.warmupIterations,
      })
      global = await runScenario({
        profiling,
        tmuxClient,
        fakeClient,
        panelModule,
        teamName: null,
        kind: 'global',
        iterations: fixture.fixture.iterations,
        warmupIterations: fixture.fixture.warmupIterations,
      })
    })
    return buildBenchResult({ fixture, attached, global })
  } finally {
    if (previousProfile === undefined) delete process.env.PI_AGENTTEAM_PROFILE
    else process.env.PI_AGENTTEAM_PROFILE = previousProfile
  }
}

function buildBenchResult(input) {
  const { fixture, attached, global } = input
  const result = {
    name: 'team-panel-tmux-refresh-v0415',
    note: 'baseline only; not a release target pass/fail gate',
    ...buildKernelMetadata(),
    fixtureProfile: buildFixtureProfileMetadata(fixture.fixture.fixtureProfile),
    fixture: {
      attached: {
        leaders: 1,
        workers: fixture.fixture.attached.workerCount,
        tasks: fixture.fixture.attached.taskCount,
        mailboxItems: fixture.fixture.attached.mailboxCount,
      },
      global: {
        teams: fixture.fixture.global.teamCount,
        workersPerTeam: fixture.fixture.global.workerCount,
        totalWorkers: fixture.fixture.global.teamCount * fixture.fixture.global.workerCount,
        tasksPerTeam: fixture.fixture.global.taskCount,
        totalTasks: fixture.fixture.global.teamCount * fixture.fixture.global.taskCount,
        mailboxItemsPerTeam: fixture.fixture.global.mailboxCount,
        totalMailboxItems: fixture.fixture.global.teamCount * fixture.fixture.global.mailboxCount,
      },
    },
    iterations: {
      warmup: fixture.fixture.warmupIterations,
      measured: fixture.fixture.iterations,
    },
    attached: {
      panel: attached.panel,
      tmux: attached.tmux,
      requestRenderCount: attached.requestRenderCount,
      cacheHitCount: attached.panel.cacheHitCount,
      diffChangedCount: attached.panel.diffChangedCount,
      customPanelCount: attached.customPanelCount,
      doneCallCount: attached.doneCallCount,
    },
    global: {
      panel: global.panel,
      tmux: global.tmux,
      requestRenderCount: global.requestRenderCount,
      cacheHitCount: global.panel.cacheHitCount,
      diffChangedCount: global.panel.diffChangedCount,
      customPanelCount: global.customPanelCount,
      doneCallCount: global.doneCallCount,
    },
  }
  const serialized = JSON.stringify(result)
  if (serialized.includes(BENCH_SENTINEL)) throw new Error('Bench output leaked full body sentinel')
  return result
}

function requireTypeScript() {
  try {
    return require('typescript')
  } catch {
    return require('/home/linyusheng/.nvm/versions/node/v24.9.0/lib/node_modules/typescript')
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function walkTsFiles(root, out = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'data' || entry.name === 'tests' || entry.name === 'node_modules') continue
      walkTsFiles(full, out)
      continue
    }
    if (entry.isFile() && full.endsWith('.ts')) out.push(full)
  }
  return out
}

function createStubs(stubRoot) {
  ensureDir(stubRoot)
  fs.writeFileSync(path.join(stubRoot, 'pi-coding-agent.js'), 'module.exports = { parseFrontmatter(content) { return { frontmatter: {}, body: String(content || "") } } }\n', 'utf8')
  fs.writeFileSync(path.join(stubRoot, 'pi-ai.js'), 'module.exports = { Type: require("./typebox.js").Type, StringEnum(values, options) { return { kind: "string-enum", enum: values, options: options || {} } } }\n', 'utf8')
  fs.writeFileSync(path.join(stubRoot, 'typebox.js'), 'const Type = { Object:o=>({kind:"object",o}), String:o=>({kind:"string",o}), Optional:v=>({kind:"optional",v}), Union:v=>({kind:"union",v}), Literal:v=>({kind:"literal",v}), Array:(v,o)=>({kind:"array",v,o}), Number:o=>({kind:"number",o}), Boolean:o=>({kind:"boolean",o}), Record:(k,v)=>({kind:"record",k,v}), Unknown:()=>({kind:"unknown"}) }; module.exports = { Type }\n', 'utf8')
  fs.writeFileSync(path.join(stubRoot, 'pi-tui.js'), `
function visibleWidth(text) { return [...String(text || '')].length }
function truncateToWidth(text, width) { return String(text || '').slice(0, width) }
const Key = { tab: '__tab__', up: '__up__', down: '__down__', left: '__left__', right: '__right__', escape: '__esc__', enter: '__enter__', shift: key => 'shift+' + key }
function matchesKey(input, key) { return input === key }
class Text { constructor(text, x = 0, y = 0) { this.text = String(text || ''); this.x = x; this.y = y } }
class Box { constructor() { this.children = [] } addChild(child) { this.children.push(child) } }
module.exports = { visibleWidth, truncateToWidth, Text, Box, Key, matchesKey }
`, 'utf8')
}

function mapImport(specifier, stubRoot) {
  if (specifier === '@earendil-works/pi-coding-agent') return path.join(stubRoot, 'pi-coding-agent.js')
  if (specifier === '@earendil-works/pi-ai') return path.join(stubRoot, 'pi-ai.js')
  if (specifier === '@earendil-works/pi-tui') return path.join(stubRoot, 'pi-tui.js')
  if (specifier === 'typebox') return path.join(stubRoot, 'typebox.js')
  return specifier
}

function transpileProject(extRoot, distRoot, stubRoot) {
  const ts = requireTypeScript()
  createStubs(stubRoot)
  for (const sourceFile of walkTsFiles(extRoot)) {
    let sourceText = fs.readFileSync(sourceFile, 'utf8').replace(/import\.meta\.url/g, `require('node:url').pathToFileURL(__filename).href`)
    let out = ts.transpileModule(sourceText, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: sourceFile,
      reportDiagnostics: false,
    }).outputText
    out = out.replace(/require\((['"])([^'"]+)\1\)/g, (_, quote, specifier) => `require(${quote}${mapImport(specifier, stubRoot)}${quote})`)
    const relative = path.relative(extRoot, sourceFile).replace(/\.ts$/, '.js')
    const target = path.join(distRoot, relative)
    ensureDir(path.dirname(target))
    fs.writeFileSync(target, out, 'utf8')
  }
  for (const agentFile of fs.readdirSync(path.join(extRoot, 'agents')).filter(name => name.endsWith('.md'))) {
    const target = path.join(distRoot, 'agents', agentFile)
    ensureDir(path.dirname(target))
    fs.copyFileSync(path.join(extRoot, 'agents', agentFile), target)
  }
  fs.copyFileSync(path.join(extRoot, 'config.example.json'), path.join(distRoot, 'config.example.json'))
}

function createStateBundle(requireDist) {
  return {
    ...requireDist('state/fsStore.js'),
    ...requireDist('state/paths.js'),
    ...requireDist('state/sessionBinding.js'),
    ...requireDist('state/merge.js'),
    ...requireDist('state/taskStore.js'),
    ...requireDist('state/taskHistoryReadModel.js'),
    ...requireDist('state/taskHistory.js'),
    ...requireDist('state/taskHistoryMigration.js'),
    ...requireDist('state/mailboxStore.js'),
    ...requireDist('state/runtimeStore.js'),
    ...requireDist('state/bridgeStore.js'),
    ...requireDist('state/deliveryStore.js'),
    ...requireDist('state/leaderProjectionStore.js'),
    ...requireDist('state/leaderAttentionStore.js'),
    ...requireDist('state/outboxStore.js'),
    ...requireDist('state/outboxDiagnosticsStore.js'),
    ...requireDist('state/validation.js'),
    ...requireDist('state/teamStore.js'),
  }
}

async function runCli() {
  const extRoot = path.resolve(__dirname, '..', '..')
  const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-panel-tmux-bench-'))
  const distRoot = path.join(buildRoot, 'dist')
  const stubRoot = path.join(distRoot, 'stubs')
  const home = path.join(buildRoot, 'home')
  const previousHome = process.env.PI_AGENTTEAM_HOME
  try {
    process.env.PI_AGENTTEAM_HOME = home
    transpileProject(extRoot, distRoot, stubRoot)
    const requireDist = rel => require(path.join(distRoot, rel))
    const modules = {
      state: createStateBundle(requireDist),
      runtimePanes: requireDist('adapters/tmux/teamPanes.js'),
    }
    requireDist('state/init.js').initializeStateStores()
    const result = await runPanelTmuxBenchWithModules({
      modules,
      profiling: requireDist('runtime/profiling.js'),
      panelModule: requireDist('teamPanel.js'),
      tmuxClient: requireDist('tmux/client.js'),
      options: (() => {
        const fixtureProfile = resolveFixtureProfileName(process.env.AGENTTEAM_BENCH_FIXTURE || 'baseline')
        const fixtureDefaults = fixtureForProfile(fixtureProfile)
        return {
          fixtureProfile,
          iterations: Number(process.env.AGENTTEAM_BENCH_ITERATIONS || fixtureDefaults.iterations),
          warmupIterations: Number(process.env.AGENTTEAM_BENCH_WARMUP || fixtureDefaults.warmupIterations),
        }
      })(),
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    if (previousHome === undefined) delete process.env.PI_AGENTTEAM_HOME
    else process.env.PI_AGENTTEAM_HOME = previousHome
    fs.rmSync(buildRoot, { recursive: true, force: true })
  }
}

if (require.main === module) {
  runCli().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = {
  BASE_TIME,
  BENCH_SENTINEL,
  DEFAULT_FIXTURE,
  FIXTURE_PROFILES,
  STRESS_FIXTURE,
  buildBenchResult,
  buildKernelMetadata,
  fixtureForProfile,
  createBenchTeam,
  createCountingTmuxClient,
  createFixtures,
  mergeFixtureOptions,
  resolveFixtureProfileName,
  runPanelTmuxBenchWithModules,
  stats,
  summarizePanel,
  summarizeTmux,
}
