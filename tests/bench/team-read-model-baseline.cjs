#!/usr/bin/env node
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const FIXTURE = Object.freeze({
  teamName: 'bench-state-read-model-baseline',
  workerCount: 3,
  taskCount: 100,
  mailboxCount: 500,
  warmupIterations: 1,
  iterations: 5,
})
const BENCH_SENTINEL = 'BENCH_STATE_READ_MODEL_FULL_BODY_SENTINEL_SHOULD_NOT_LEAK'
const BASE_TIME = 1700005000000

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

function groupBy(items, keyFn) {
  const groups = new Map()
  for (const item of items) {
    const key = keyFn(item)
    const group = groups.get(key) || []
    group.push(item)
    groups.set(key, group)
  }
  return groups
}

function summarizeFsStore(summary) {
  const events = summary?.fsStore?.events || []
  const byKind = {}
  for (const kind of ['lock', 'read', 'parse', 'write']) {
    const group = events.filter(event => event.kind === kind)
    const timingField = kind === 'lock' ? 'lockWaitMs' : kind === 'read' ? 'readMs' : kind === 'parse' ? 'parseMs' : kind === 'write' ? 'writeMs' : 'durationMs'
    byKind[kind] = {
      ...stats(group.map(event => event[timingField] ?? event.durationMs ?? 0)),
      bytes: group.reduce((sum, event) => sum + (typeof event.bytes === 'number' ? event.bytes : 0), 0),
    }
  }
  const byCategory = [...groupBy(events, event => event.category || 'unknown').entries()]
    .map(([category, group]) => ({
      category,
      count: group.length,
      bytes: group.reduce((sum, event) => sum + (typeof event.bytes === 'number' ? event.bytes : 0), 0),
      kinds: Object.fromEntries([...groupBy(group, event => event.kind).entries()].map(([kind, kindGroup]) => [kind, kindGroup.length])),
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
  const byCallSite = [...groupBy(events, event => event.callSite || 'unknown').entries()]
    .map(([callSite, group]) => ({ callSite, count: group.length }))
    .sort((a, b) => b.count - a.count || a.callSite.localeCompare(b.callSite))
    .slice(0, 12)

  return {
    eventCount: events.length,
    counts: {
      lock: summary?.fsStore?.lockCount ?? 0,
      read: summary?.fsStore?.readCount ?? 0,
      parse: summary?.fsStore?.parseCount ?? 0,
      write: summary?.fsStore?.writeCount ?? 0,
    },
    bytes: {
      read: summary?.fsStore?.bytesRead ?? 0,
      written: summary?.fsStore?.bytesWritten ?? 0,
    },
    byKind,
    byCategory,
    byCallSite,
  }
}

function summarizePanel(summary, iterationDurations) {
  const panelEvents = summary?.panel?.events || []
  return {
    iterations: stats(iterationDurations),
    dataLoadMs: stats(panelEvents.filter(event => event.kind === 'dataLoad').map(event => event.durationMs)),
    readModelMs: stats(panelEvents.filter(event => event.kind === 'readModelBuild').map(event => event.durationMs)),
    eventCount: panelEvents.length,
    lastCounts: summary?.panel?.lastCounts || {},
  }
}

function summarizeTmux(summary, stubCalls) {
  return {
    commandCount: summary?.tmux?.commandCount ?? 0,
    profiledCommandNames: summary?.tmux?.commandNames || [],
    stubCallCount: stubCalls.length,
    stubCommands: [...new Set(stubCalls.map(call => call[0]))].sort(),
  }
}

function createStubRuntimeRepository(livePaneIds) {
  const calls = []
  const panes = [...livePaneIds].map(paneId => ({
    paneId,
    target: 'bench:@1',
    label: `agentteam ${paneId}`,
    currentCommand: 'pi',
  }))
  const snapshot = {
    capturedAt: BASE_TIME,
    panes,
    byPaneId: Object.fromEntries(panes.map(pane => [pane.paneId, pane])),
    ok: true,
  }
  return {
    calls,
    repository: {
      captureCurrentPaneBinding: () => null,
      paneExists: paneId => livePaneIds.has(paneId),
      syncPaneLabelsForTeam: async () => undefined,
      withRuntimeSnapshot(handler) {
        calls.push(['withRuntimeSnapshot'])
        return handler(snapshot)
      },
      listAgentTeamPanes() {
        calls.push(['listAgentTeamPanes'])
        return []
      },
      reconcileTeamPanes() {
        calls.push(['reconcileTeamPanes'])
        return false
      },
      prepareTeamForPanel() {
        calls.push(['prepareTeamForPanel'])
        return false
      },
    },
  }
}

function resetHome(modules, home) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  process.env.PI_AGENTTEAM_HOME = home
  modules.state.invalidateSessionContextCache()
  modules.runtimePanes?.invalidatePaneReconcileCache?.()
  return () => {
    modules.runtimePanes?.invalidatePaneReconcileCache?.()
    modules.state.invalidateSessionContextCache()
    if (previousHome === undefined) delete process.env.PI_AGENTTEAM_HOME
    else process.env.PI_AGENTTEAM_HOME = previousHome
  }
}

function createFixture(modules, options = {}) {
  const fixture = { ...FIXTURE, ...options }
  modules.state.deleteTeamState(fixture.teamName)
  const team = modules.state.createInitialTeamState({
    teamName: fixture.teamName,
    storageName: fixture.teamName,
    leaderSessionFile: `/tmp/${fixture.teamName}-leader.jsonl`,
    leaderCwd: `/tmp/${fixture.teamName}`,
    description: 'Deterministic state/read-model microbench baseline fixture',
  })
  team.createdAt = BASE_TIME
  team.members['team-lead'].createdAt = BASE_TIME
  team.members['team-lead'].updatedAt = BASE_TIME
  team.members['team-lead'].paneId = '%bench-leader'
  team.members['team-lead'].windowTarget = 'bench:@1'

  const workerNames = Array.from({ length: fixture.workerCount }, (_, index) => `bench-worker-${index + 1}`)
  for (const [index, workerName] of workerNames.entries()) {
    modules.state.upsertMember(team, {
      name: workerName,
      role: ['researcher', 'planner', 'implementer'][index % 3],
      cwd: team.leaderCwd,
      sessionFile: `/tmp/${fixture.teamName}-${workerName}.jsonl`,
      paneId: `%bench-worker-${index + 1}`,
      windowTarget: 'bench:@1',
      status: 'idle',
    })
    team.members[workerName].createdAt = BASE_TIME + index + 1
    team.members[workerName].updatedAt = BASE_TIME + index + 1
  }

  for (let index = 0; index < fixture.taskCount; index += 1) {
    const owner = workerNames[index % workerNames.length]
    const task = modules.state.createTask(team, {
      title: `Bench task ${String(index + 1).padStart(3, '0')}`,
      description: `Deterministic bench task ${index + 1}`,
      owner,
    })
    task.createdAt = BASE_TIME + 1_000 + index
    task.updatedAt = BASE_TIME + 2_000 + index
    if (index % 17 === 0) {
      task.status = 'blocked'
      task.blockedBy.push('deterministic bench blocker')
    }
    if (index % 10 === 0) {
      const report = modules.state.appendTaskReport(team, {
        taskId: task.id,
        type: 'report_done',
        author: owner,
        text: `${BENCH_SENTINEL} report body ${index} ${'R'.repeat(200)}`,
        summary: `Bench compact report ${index}`,
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
        mailboxMessageId: `${fixture.teamName}-task-ref-${index}`,
        from: 'team-lead',
        to: owner,
        type: 'assignment',
        createdAt: BASE_TIME + 4_000 + index,
        threadId: `task:${task.id}`,
        summary: `Bench compact assignment ${index}`,
      })
    }
  }

  modules.state.writeTeamState(team)
  modules.state.writeSessionContext(team.leaderSessionFile, modules.state.buildSessionContextForTeam(team, 'team-lead'))

  const taskIds = Object.keys(team.tasks).sort()
  for (let index = 0; index < fixture.mailboxCount; index += 1) {
    modules.state.pushMailboxMessage(fixture.teamName, 'team-lead', {
      id: `${fixture.teamName}-mailbox-${String(index + 1).padStart(4, '0')}`,
      from: workerNames[index % workerNames.length],
      to: 'team-lead',
      type: index % 11 === 0 ? 'report_blocked' : index % 7 === 0 ? 'question' : 'inform',
      priority: index % 11 === 0 ? 'high' : 'normal',
      taskId: taskIds[index % taskIds.length],
      threadId: `task:${taskIds[index % taskIds.length]}`,
      summary: `Bench compact mailbox ${index + 1}`,
      text: `${BENCH_SENTINEL} mailbox body ${index + 1} ${'M'.repeat(240)}`,
      metadata: { benchIndex: index },
      createdAt: BASE_TIME + 10_000 + index,
    })
  }

  return {
    fixture,
    teamName: fixture.teamName,
    leaderSessionFile: team.leaderSessionFile,
    livePaneIds: new Set(['%bench-leader', ...workerNames.map((_, index) => `%bench-worker-${index + 1}`)]),
  }
}

function runPanelIterations(input) {
  const { modules, profiling, panelDataSource, stateRepository, runtimeRepository, teamName, taskCount, iterations, warmupIterations } = input
  const previousProfile = process.env.PI_AGENTTEAM_PROFILE
  process.env.PI_AGENTTEAM_PROFILE = '1'
  try {
    profiling.resetProfiling()
    for (let index = 0; index < warmupIterations; index += 1) {
      panelDataSource.loadPanelData(teamName, { stateRepository, runtimeRepository })
    }
    profiling.resetProfiling()
    const durations = []
    for (let index = 0; index < iterations; index += 1) {
      const startedAt = Number(process.hrtime.bigint()) / 1_000_000
      const data = panelDataSource.loadPanelData(teamName, { stateRepository, runtimeRepository })
      durations.push(Number(process.hrtime.bigint()) / 1_000_000 - startedAt)
      if (data.mode !== 'attached') throw new Error(`Expected attached panel data, got ${data.mode}`)
      if (data.tasks.length !== taskCount) throw new Error(`Expected ${taskCount} tasks, got ${data.tasks.length}`)
    }
    const summary = profiling.readProfilingSummary()
    return { durations, summary }
  } finally {
    if (previousProfile === undefined) delete process.env.PI_AGENTTEAM_PROFILE
    else process.env.PI_AGENTTEAM_PROFILE = previousProfile
  }
}

function buildBaselineResult(input) {
  const { fixture, durations, profilingSummary, runtimeCalls } = input
  const result = {
    name: 'team-read-model-baseline',
    note: 'baseline only; not a release target pass/fail gate',
    fixture: {
      leaders: 1,
      workers: fixture.workerCount,
      tasks: fixture.taskCount,
      mailboxItems: fixture.mailboxCount,
    },
    iterations: {
      warmup: fixture.warmupIterations,
      measured: fixture.iterations,
    },
    panel: summarizePanel(profilingSummary, durations),
    fsStore: summarizeFsStore(profilingSummary),
    tmux: summarizeTmux(profilingSummary, runtimeCalls),
  }
  const serialized = JSON.stringify(result)
  if (serialized.includes(BENCH_SENTINEL)) throw new Error('Bench output leaked full body sentinel')
  return result
}

function runBaselineWithModules(input) {
  const { modules, profiling, panelDataSource, stateRepository, options = {} } = input
  const fixture = { ...FIXTURE, ...options }
  const created = createFixture(modules, fixture)
  const runtime = createStubRuntimeRepository(created.livePaneIds)
  const run = runPanelIterations({
    modules,
    profiling,
    panelDataSource,
    stateRepository,
    runtimeRepository: runtime.repository,
    teamName: created.teamName,
    taskCount: fixture.taskCount,
    iterations: fixture.iterations,
    warmupIterations: fixture.warmupIterations,
  })
  return buildBaselineResult({
    fixture,
    durations: run.durations,
    profilingSummary: run.summary,
    runtimeCalls: runtime.calls,
  })
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
  fs.writeFileSync(path.join(stubRoot, 'pi-tui.js'), 'module.exports = { visibleWidth:t=>[...String(t||"")].length, truncateToWidth:(t,w)=>String(t||"").slice(0,w), Text: class Text {}, Box: class Box {}, Key: {}, matchesKey:()=>false }\n', 'utf8')
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

function runCli() {
  const extRoot = path.resolve(__dirname, '..', '..')
  const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-read-model-bench-'))
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
    const result = runBaselineWithModules({
      modules,
      profiling: requireDist('runtime/profiling.js'),
      panelDataSource: requireDist('teamPanel/dataSource.js'),
      stateRepository: requireDist('state/repository.js').createStateRepository(),
      options: {
        iterations: Number(process.env.AGENTTEAM_BENCH_ITERATIONS || FIXTURE.iterations),
        warmupIterations: Number(process.env.AGENTTEAM_BENCH_WARMUP || FIXTURE.warmupIterations),
      },
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    if (previousHome === undefined) delete process.env.PI_AGENTTEAM_HOME
    else process.env.PI_AGENTTEAM_HOME = previousHome
    fs.rmSync(buildRoot, { recursive: true, force: true })
  }
}

if (require.main === module) {
  runCli()
}

module.exports = {
  BASE_TIME,
  BENCH_SENTINEL,
  FIXTURE,
  buildBaselineResult,
  createFixture,
  createStubRuntimeRepository,
  runBaselineWithModules,
  runPanelIterations,
  stats,
  summarizeFsStore,
  summarizePanel,
  summarizeTmux,
}
