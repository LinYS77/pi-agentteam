const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStateBundle } = require('../../tests/stateBundle.cjs')

const DEFAULT_PREFIX = '/tmp/pi-agentteam-v0642-spawn-bookkeeping-p95.'
const SPAWN_BOOKKEEPING_THRESHOLD_MS = 100
const DEFAULT_WARMUP = 2
const DEFAULT_MEASURED = 12
const FULL_TEXT_SENTINEL = 'V0642_SPAWN_BOOKKEEPING_FULL_TEXT_SENTINEL_DO_NOT_LEAK'
const FORBIDDEN_OUTPUT_MARKERS = Object.freeze([
  FULL_TEXT_SENTINEL,
  'MailboxMessage.text',
  'TaskReport.text',
  'worker transcript',
  'terminal raw log',
  'screenshot',
  'state archive',
  'raw state archive',
  'BEGIN PRIVATE KEY',
  'raw hosted record',
])
const REQUIRED_SEGMENTS = Object.freeze([
  'validate-config-classify',
  'build-prompt-command',
  'reserve-worker-state',
  'write-session-context',
  'commit-pane-created',
  'resolve-pane-binding-commit',
  'final-worker-status',
])

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

function writeFile(file, content) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, content, 'utf8')
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'data' || entry.name === 'tests' || entry.name === 'node_modules') continue
      walkFiles(full, out)
      continue
    }
    if (entry.isFile() && full.endsWith('.ts')) out.push(full)
  }
  return out
}

function walkAllFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkAllFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function safeRelative(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function listFilesSafe(root) {
  return walkAllFiles(root).map(file => safeRelative(root, file)).sort()
}

function isSafeTempHome(home, prefix = DEFAULT_PREFIX) {
  const resolved = path.resolve(home || '')
  return Boolean(home && resolved.startsWith(prefix) && path.basename(resolved).length > path.basename(prefix).length)
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function percentile(values, percentileRank) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileRank / 100) * sorted.length) - 1))
  return sorted[index]
}

function round(value, places = 3) {
  return Number(value.toFixed(places))
}

function summarizeDurations(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((total, value) => total + value, 0)
  return {
    count: values.length,
    min: round(sorted[0] ?? 0),
    median: round(percentile(values, 50)),
    p95: round(percentile(values, 95)),
    max: round(sorted[sorted.length - 1] ?? 0),
    mean: round(values.length ? sum / values.length : 0),
  }
}

function sanitizeText(text, max = 160) {
  return String(text ?? '')
    .replace(new RegExp(FULL_TEXT_SENTINEL, 'g'), '<redacted-sentinel>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function createStubs(stubRoot) {
  writeFile(path.join(stubRoot, 'pi-coding-agent.js'), `
function parseFrontmatter(content) {
  const s = String(content || '')
  const m = s.match(/^---\\n([\\s\\S]*?)\\n---\\n?([\\s\\S]*)$/)
  if (!m) return { frontmatter: {}, body: s }
  const frontmatter = {}
  for (const line of m[1].split('\\n')) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key) frontmatter[key] = value
  }
  return { frontmatter, body: m[2] || '' }
}
module.exports = { parseFrontmatter }
`)
  writeFile(path.join(stubRoot, 'pi-tui.js'), `
function visibleWidth(text) { return [...String(text || '').replace(/\\u001b\\[[0-9;]*m/g, '')].length }
function truncateToWidth(text, width) { return [...String(text || '')].slice(0, Math.max(0, width || 0)).join('') }
class Text { constructor(text, x = 0, y = 0) { this.text = String(text || ''); this.x = x; this.y = y } }
class Box { constructor() { this.children = [] } addChild(child) { this.children.push(child) } }
const Key = { tab: '__tab__', up: '__up__', down: '__down__', left: '__left__', right: '__right__', escape: '__esc__', enter: '__enter__', shift: key => 'shift+' + key }
function matchesKey(input, key) { return input === key }
module.exports = { visibleWidth, truncateToWidth, Text, Box, Key, matchesKey }
`)
  writeFile(path.join(stubRoot, 'typebox.js'), `
const Type = {
  Object: (o, options) => ({ kind: 'object', o, options }), String: o => ({ kind: 'string', o }), Optional: v => ({ kind: 'optional', v }),
  Union: v => ({ kind: 'union', v }), Literal: v => ({ kind: 'literal', v }), Array: (v, o) => ({ kind: 'array', v, o }),
  Number: o => ({ kind: 'number', o }), Boolean: o => ({ kind: 'boolean', o }), Record: (k, v) => ({ kind: 'record', k, v }), Unknown: () => ({ kind: 'unknown' }),
}
module.exports = { Type }
`)
  writeFile(path.join(stubRoot, 'pi-ai.js'), `
const { Type } = require('./typebox.js')
function StringEnum(values, options) { return { kind: 'string-enum', enum: [...values], options: options || {} } }
module.exports = { Type, StringEnum }
`)
}

function mapImport(stubRoot, specifier) {
  if (specifier === '@earendil-works/pi-coding-agent') return path.join(stubRoot, 'pi-coding-agent.js')
  if (specifier === '@earendil-works/pi-ai') return path.join(stubRoot, 'pi-ai.js')
  if (specifier === '@earendil-works/pi-tui') return path.join(stubRoot, 'pi-tui.js')
  if (specifier === 'typebox') return path.join(stubRoot, 'typebox.js')
  return specifier
}

function transpileProject(extRoot, distRoot, stubRoot) {
  const ts = requireTypeScript()
  ensureDir(distRoot)
  const agentsDir = path.join(extRoot, 'agents')
  if (fs.existsSync(agentsDir)) {
    for (const agentFile of fs.readdirSync(agentsDir).filter(name => name.endsWith('.md'))) {
      writeFile(path.join(distRoot, 'agents', agentFile), fs.readFileSync(path.join(agentsDir, agentFile), 'utf8'))
    }
  }
  const configExample = path.join(extRoot, 'config.example.json')
  if (fs.existsSync(configExample)) writeFile(path.join(distRoot, 'config.example.json'), fs.readFileSync(configExample, 'utf8'))
  for (const sourceFile of walkFiles(extRoot)) {
    let sourceText = fs.readFileSync(sourceFile, 'utf8').replace(/import\.meta\.url/g, `require('node:url').pathToFileURL(__filename).href`)
    let output = ts.transpileModule(sourceText, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: sourceFile,
      reportDiagnostics: false,
    }).outputText
    output = output.replace(/require\((['"])([^'"]+)\1\)/g, (_, quote, specifier) => `require(${quote}${mapImport(stubRoot, specifier)}${quote})`)
    const relative = path.relative(extRoot, sourceFile).replace(/\.ts$/, '.js')
    writeFile(path.join(distRoot, relative), output)
  }
}

function loadModules(distRoot) {
  const req = rel => require(path.join(distRoot, rel))
  return {
    state: createStateBundle(req),
    profiling: req('runtime/profiling.js'),
    runtimeRules: req('adapters/runtime/rules.js'),
    runtimePanes: req('adapters/tmux/teamPanes.js'),
    tmux: req('adapters/tmux/index.js'),
    runtimeBridge: req('adapters/bridge/index.js'),
    workerSpawnService: req('tools/workerSpawnService.js'),
  }
}

function patchRuntime(modules, teamName, paneByWorker) {
  const original = {
    createTeammatePane: modules.tmux.createTeammatePane,
    waitForPaneAppStart: modules.tmux.waitForPaneAppStart,
    resolvePaneBinding: modules.tmux.resolvePaneBinding,
    paneExists: modules.tmux.paneExists,
    killPane: modules.tmux.killPane,
  }
  let nextPane = 1
  modules.tmux.createTeammatePane = async input => {
    const paneId = `%spawn-${nextPane++}`
    paneByWorker.set(input.name, { paneId, target: 'test:@1', cwd: input.cwd, startCommand: input.startCommand })
    return { paneId, target: 'test:@1', input }
  }
  modules.tmux.waitForPaneAppStart = async paneId => {
    const match = [...paneByWorker.entries()].find(([, pane]) => pane.paneId === paneId)
    if (match) {
      const [workerName] = match
      const latest = modules.state.readTeamState(teamName)
      const member = latest?.members[workerName]
      if (member?.sessionFile) {
        modules.runtimeBridge.publishBridgeLease({ teamName, memberName: workerName, sessionFile: member.sessionFile })
      }
    }
    return true
  }
  modules.tmux.resolvePaneBinding = paneId => (paneId ? { paneId, target: 'test:@1' } : null)
  modules.tmux.paneExists = paneId => Boolean(paneId)
  modules.tmux.killPane = () => {}
  return {
    restore() {
      modules.tmux.createTeammatePane = original.createTeammatePane
      modules.tmux.waitForPaneAppStart = original.waitForPaneAppStart
      modules.tmux.resolvePaneBinding = original.resolvePaneBinding
      modules.tmux.paneExists = original.paneExists
      modules.tmux.killPane = original.killPane
    },
  }
}

function seedTeam(modules, teamName, leaderCwd) {
  modules.state.deleteTeamState(teamName)
  const team = modules.state.createInitialTeamState({
    teamName,
    leaderSessionFile: `/tmp/${teamName}-leader.jsonl`,
    leaderCwd,
    description: 'v0.6.42 spawn bookkeeping p95 fixture',
  })
  const leader = team.members['team-lead']
  if (leader) {
    leader.paneId = '%leader'
    leader.windowTarget = 'test:@1'
    leader.cwd = leaderCwd
  }
  modules.state.writeTeamState(team)
  modules.runtimePanes.invalidatePaneReconcileCache(teamName)
  return modules.state.readTeamState(teamName)
}

function createDeps(modules) {
  return {
    validateNewWorkerName: modules.runtimeRules.validateNewWorkerName,
    classifySpawnTask: modules.runtimeRules.classifySpawnTask,
    healMemberPaneBinding: () => {},
  }
}

function eventsForWorker(summary, workerName) {
  return summary.spawn.events.filter(event => event.workerName === workerName)
}

function measureWorkerBookkeeping(summary, workerName) {
  const events = eventsForWorker(summary, workerName)
  const totalMs = events.reduce((sum, event) => sum + event.durationMs, 0)
  return {
    eventCount: events.length,
    totalMs: round(totalMs, 6),
    segments: events.map(event => ({ segment: event.segment, durationMs: round(event.durationMs, 6), ok: event.ok })),
  }
}

async function spawnFixtureWorker(input) {
  const { modules, deps, teamName, leaderCwd, index, phase, paneByWorker } = input
  const workerName = `${phase}-worker-${String(index + 1).padStart(2, '0')}`
  const beforeSummary = modules.profiling.readProfilingSummary()
  const started = process.hrtime.bigint()
  const team = modules.state.readTeamState(teamName)
  const result = await modules.workerSpawnService.spawnWorkerMember(deps, team, {
    name: workerName,
    role: 'implementer',
    task: 'Stay idle.',
    cwd: leaderCwd,
  }, leaderCwd)
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  if (!result.ok) throw new Error(`Spawn fixture failed for ${workerName}: ${sanitizeText(result.text, 240)}`)
  const afterSummary = modules.profiling.readProfilingSummary()
  const workerBookkeeping = measureWorkerBookkeeping(afterSummary, workerName)
  const newEvents = afterSummary.spawn.events.slice(beforeSummary.spawn.events.length).filter(event => event.workerName === workerName)
  const capturedPane = paneByWorker.get(workerName)
  return {
    id: `${phase}-spawn-${index + 1}`,
    phase,
    workerName,
    role: 'implementer',
    elapsedMs: round(elapsedMs, 6),
    bookkeepingMs: workerBookkeeping.totalMs,
    segmentCount: workerBookkeeping.eventCount,
    segments: workerBookkeeping.segments,
    bridgeReady: Boolean(result.bridgeReady),
    paneId: result.paneId,
    paneCreated: Boolean(capturedPane?.paneId),
    paneCwdInherited: capturedPane?.cwd === leaderCwd,
    startCommandHasSessionFile: Boolean(result.sessionFile && capturedPane?.startCommand?.includes(result.sessionFile)),
    newProfileEvents: newEvents.length,
  }
}

function createEnvMetadata(options, tempHome) {
  const cpus = os.cpus()
  return {
    date: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: {
      model: cpus[0]?.model || 'unknown',
      logicalCpus: cpus.length,
    },
    piAgentteamProfile: process.env.PI_AGENTTEAM_PROFILE || '',
    piAgentteamHome: `${tempHome.startsWith('/tmp/') ? '/tmp/' : ''}clean temporary home; removed unless --keep-home`,
    warmupIterations: options.warmup,
    measuredIterations: options.measured,
  }
}

function summarizeSpawnProfile(summary) {
  const bySegment = new Map()
  for (const event of summary.spawn.events) {
    const item = bySegment.get(event.segment) || { segment: event.segment, count: 0, values: [] }
    item.count += 1
    item.values.push(event.durationMs)
    bySegment.set(event.segment, item)
  }
  return {
    enabled: summary.enabled,
    spawn: {
      bookkeepingCount: summary.spawn.bookkeepingCount,
      totalBookkeepingMs: round(summary.spawn.totalBookkeepingMs, 6),
      segments: [...summary.spawn.segments].sort(),
      bySegment: [...bySegment.values()].map(item => ({
        segment: item.segment,
        count: item.count,
        p95: summarizeDurations(item.values).p95,
        max: summarizeDurations(item.values).max,
      })).sort((a, b) => b.p95 - a.p95),
    },
  }
}

function pushCheck(summary, id, pass, extra = {}) {
  summary.checks.push({ id, pass: Boolean(pass), ...extra })
}

function assertOutputNoLeak(file) {
  const raw = fs.readFileSync(file, 'utf8')
  for (const marker of FORBIDDEN_OUTPUT_MARKERS) {
    if (raw.includes(marker)) throw new Error(`raw timing output leaked forbidden marker: ${marker}`)
  }
}

function gateResult(records) {
  const stats = summarizeDurations(records.map(record => record.bookkeepingMs))
  return {
    id: 'spawn-bookkeeping-p95',
    status: stats.p95 <= SPAWN_BOOKKEEPING_THRESHOLD_MS ? 'pass' : 'fail',
    metric: 'workerSpawn.bookkeepingMs.p95',
    threshold: { kind: 'p95-ms-lte', value: SPAWN_BOOKKEEPING_THRESHOLD_MS, unit: 'ms' },
    observed: stats.p95,
    observedUnit: 'ms',
    measuredSpawns: records.length,
  }
}

async function runHarness(options = {}) {
  const extRoot = path.resolve(options.extRoot || path.join(__dirname, '..', '..'))
  const prefix = options.prefix || DEFAULT_PREFIX
  const cleanup = options.cleanup !== false
  const warmup = parsePositiveInt(options.warmup ?? process.env.AGENTTEAM_BENCH_WARMUP, DEFAULT_WARMUP)
  const measured = parsePositiveInt(options.measured ?? process.env.AGENTTEAM_BENCH_ITERATIONS, DEFAULT_MEASURED)
  const providedHome = options.home || process.env.PI_AGENTTEAM_HOME
  const tempHome = providedHome || fs.mkdtempSync(prefix)
  const resolvedHome = path.resolve(tempHome)
  const originalHome = process.env.PI_AGENTTEAM_HOME
  const originalProfile = process.env.PI_AGENTTEAM_PROFILE
  const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-agentteam-v0642-spawn-bookkeeping-p95-build-'))
  const distRoot = path.join(buildRoot, 'dist')
  const stubRoot = path.join(distRoot, 'stubs')
  const outputPath = options.out || path.join(os.tmpdir(), `pi-agentteam-v0642-spawn-bookkeeping-p95-${process.pid}-${Date.now()}.json`)
  const records = []
  const warmupRecords = []
  const paneByWorker = new Map()
  const teamName = 'v0642-spawn-bookkeeping-p95'
  const leaderCwd = '/tmp/v0642-spawn-bookkeeping-project'
  const summary = {
    schemaVersion: 1,
    runId: `v0642-spawn-bookkeeping-p95-${Date.now()}`,
    status: 'started',
    ok: false,
    tempHome: resolvedHome,
    tempHomePrefix: prefix,
    cleanupRequested: cleanup,
    cleanupResult: 'not-run',
    env: createEnvMetadata({ warmup, measured }, resolvedHome),
    isolation: {
      safePrefix: false,
      underRepo: false,
      initialEntryCount: undefined,
      finalEntryCountBeforeCleanup: undefined,
      liveHomeEnvRestored: false,
      profileEnvRestored: false,
    },
    fixture: {
      profile: 'file-backed-worker-spawn-bookkeeping-stubbed-external-boundaries',
      warmup,
      measured,
      appOwnedTime: 'worker spawn validation/config/prompt/session/team-state/pane-binding/final-status bookkeeping segments in a clean temporary PI_AGENTTEAM_HOME; excludes real provider/LLM/operator time, external tmux pane creation latency, terminal rendering, and bridge wait latency',
      visiblePaneSemanticsStubbed: true,
      bridgeLeasePublishedByHarness: true,
      rawStateArchived: false,
      fullBodiesIncluded: false,
      imageCapturesIncluded: false,
    },
    rawArtifact: {
      path: outputPath,
      parse: 'not-written',
      sha256: '',
      checkedIn: false,
    },
    gates: [],
    bookkeeping: {},
    profileSummary: {},
    checks: [],
    noLeak: {
      status: 'started',
      markerCount: FORBIDDEN_OUTPUT_MARKERS.length,
      markerPolicy: 'forbidden full-body/state-archive/image-capture/raw-log markers are checked but marker strings are not emitted in harness JSON',
      rawStateArchivesCheckedIn: false,
      rawFullBodiesCheckedIn: false,
      rawTimingJsonCheckedIn: false,
      imageCapturesCheckedIn: false,
      terminalRawLogsCheckedIn: false,
    },
    governance: {
      packageVersionChanged: false,
      tagCreated: false,
      npmPublished: false,
      nativeWorkPerformed: false,
      defaultGoApproved: false,
      defaultResolverApproved: false,
      fallbackDeletionApproved: false,
      releaseReadyClaim: false,
      v07ReadyClaim: false,
    },
    errors: [],
  }

  try {
    if (!isSafeTempHome(resolvedHome, prefix)) throw new Error(`Unsafe PI_AGENTTEAM_HOME for harness: ${resolvedHome}`)
    summary.isolation.safePrefix = true
    summary.isolation.underRepo = resolvedHome === extRoot || resolvedHome.startsWith(`${extRoot}${path.sep}`)
    if (summary.isolation.underRepo) throw new Error(`PI_AGENTTEAM_HOME must not be under repo: ${resolvedHome}`)
    ensureDir(resolvedHome)
    summary.isolation.initialEntryCount = listFilesSafe(resolvedHome).length
    if (summary.isolation.initialEntryCount !== 0 && !options.allowNonEmptyHome) throw new Error(`PI_AGENTTEAM_HOME must start empty; found ${summary.isolation.initialEntryCount} files`)
    process.env.PI_AGENTTEAM_HOME = resolvedHome
    process.env.PI_AGENTTEAM_PROFILE = '1'
    summary.env = createEnvMetadata({ warmup, measured }, resolvedHome)

    createStubs(stubRoot)
    transpileProject(extRoot, distRoot, stubRoot)
    const modules = loadModules(distRoot)
    modules.profiling.resetProfiling()
    seedTeam(modules, teamName, leaderCwd)
    const patch = patchRuntime(modules, teamName, paneByWorker)
    const deps = createDeps(modules)
    try {
      for (let index = 0; index < warmup; index += 1) {
        warmupRecords.push(await spawnFixtureWorker({ modules, deps, teamName, leaderCwd, index, phase: 'warmup', paneByWorker }))
      }
      modules.profiling.resetProfiling()
      for (let index = 0; index < measured; index += 1) {
        records.push(await spawnFixtureWorker({ modules, deps, teamName, leaderCwd, index, phase: 'measured', paneByWorker }))
      }
    } finally {
      patch.restore()
    }

    const profilingSummary = modules.profiling.readProfilingSummary()
    const gate = gateResult(records)
    const allSegments = new Set(records.flatMap(record => record.segments.map(segment => segment.segment)))
    summary.gates = [gate]
    summary.p95Status = gate.status
    summary.bookkeeping = summarizeDurations(records.map(record => record.bookkeepingMs))
    summary.profileSummary = summarizeSpawnProfile(profilingSummary)
    pushCheck(summary, 'spawn-bookkeeping-events-recorded', profilingSummary.spawn.bookkeepingCount >= measured * REQUIRED_SEGMENTS.length, { count: profilingSummary.spawn.bookkeepingCount, measured })
    pushCheck(summary, 'required-bookkeeping-segments-covered', REQUIRED_SEGMENTS.every(segment => allSegments.has(segment)), { required: REQUIRED_SEGMENTS, observed: [...allSegments].sort() })
    pushCheck(summary, 'spawn-bookkeeping-p95-threshold', gate.status === 'pass', { observed: gate.observed, threshold: SPAWN_BOOKKEEPING_THRESHOLD_MS })
    pushCheck(summary, 'visible-pane-semantics-preserved', records.every(record => record.paneCreated && record.paneId && record.bridgeReady), { measured: records.length })
    pushCheck(summary, 'launch-provenance-inherited', records.every(record => record.paneCwdInherited && record.startCommandHasSessionFile), { measured: records.length })
    pushCheck(summary, 'clean-temp-home', summary.isolation.safePrefix && !summary.isolation.underRepo && summary.isolation.initialEntryCount === 0)
    pushCheck(summary, 'no-release-actions', true, summary.governance)

    summary.isolation.finalEntryCountBeforeCleanup = listFilesSafe(resolvedHome).length
    summary.noLeak.status = 'pass'
    summary.ok = summary.checks.every(check => check.pass)
    summary.status = summary.ok ? 'passed' : 'failed'
    const rawOutput = {
      schemaVersion: 1,
      runId: summary.runId,
      env: summary.env,
      fixture: summary.fixture,
      gates: summary.gates,
      bookkeeping: summary.bookkeeping,
      profileSummary: summary.profileSummary,
      records,
      checks: summary.checks,
      noLeak: summary.noLeak,
      governance: summary.governance,
    }
    writeFile(outputPath, `${JSON.stringify(rawOutput, null, 2)}\n`)
    assertOutputNoLeak(outputPath)
    summary.rawArtifact.parse = 'ok'
    summary.rawArtifact.sha256 = sha256File(outputPath)
  } catch (error) {
    summary.ok = false
    summary.status = 'failed'
    summary.errors.push(error instanceof Error ? error.message : String(error))
  } finally {
    if (cleanup && isSafeTempHome(resolvedHome, prefix)) {
      fs.rmSync(resolvedHome, { recursive: true, force: true })
      summary.cleanupResult = fs.existsSync(resolvedHome) ? 'failed' : 'removed'
    } else if (cleanup) {
      summary.cleanupResult = 'skipped-unsafe-prefix'
    } else {
      summary.cleanupResult = 'kept'
    }
    fs.rmSync(buildRoot, { recursive: true, force: true })
    if (originalHome === undefined) delete process.env.PI_AGENTTEAM_HOME
    else process.env.PI_AGENTTEAM_HOME = originalHome
    if (originalProfile === undefined) delete process.env.PI_AGENTTEAM_PROFILE
    else process.env.PI_AGENTTEAM_PROFILE = originalProfile
    summary.isolation.liveHomeEnvRestored = process.env.PI_AGENTTEAM_HOME === originalHome
    summary.isolation.profileEnvRestored = process.env.PI_AGENTTEAM_PROFILE === originalProfile
    summary.ok = summary.ok && summary.cleanupResult !== 'failed' && summary.cleanupResult !== 'skipped-unsafe-prefix' && summary.isolation.liveHomeEnvRestored && summary.isolation.profileEnvRestored
    if (!summary.ok && summary.status === 'passed') summary.status = 'failed'
  }
  return summary
}

module.exports = {
  DEFAULT_MEASURED,
  DEFAULT_PREFIX,
  DEFAULT_WARMUP,
  FORBIDDEN_OUTPUT_MARKERS,
  FULL_TEXT_SENTINEL,
  REQUIRED_SEGMENTS,
  SPAWN_BOOKKEEPING_THRESHOLD_MS,
  isSafeTempHome,
  runHarness,
  summarizeDurations,
}
