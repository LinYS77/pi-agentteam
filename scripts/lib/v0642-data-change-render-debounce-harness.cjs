const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStateBundle } = require('../../tests/stateBundle.cjs')

const DEFAULT_PREFIX = '/tmp/pi-agentteam-v0642-data-change-render-debounce.'
const RENDER_RATE_THRESHOLD_PER_SEC = 4
const DEFAULT_WARMUP = 1
const DEFAULT_MEASURED = 5
const DEFAULT_BURST_CHANGES = 8
const DEFAULT_DEBOUNCE_MS = 250
const DEFAULT_SETTLE_MS = 320
const FULL_TEXT_SENTINEL = 'V0642_DATA_CHANGE_RENDER_DEBOUNCE_FULL_TEXT_SENTINEL_DO_NOT_LEAK'
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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
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
    teamPanel: req('teamPanel.js'),
    state: createStateBundle(req),
    profiling: req('runtime/profiling.js'),
    runtimePanes: req('adapters/tmux/teamPanes.js'),
    tmux: req('adapters/tmux/index.js'),
  }
}

function createFakeTheme() {
  const passthrough = value => String(value ?? '')
  return { fg: (_name, text) => String(text ?? ''), bg: (_name, text) => String(text ?? ''), bold: passthrough }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createMountedPanelContext(records) {
  return {
    cwd: '/tmp/v0642-panel-fixture',
    sessionManager: { getSessionFile() { return '/tmp/v0642-panel-fixture-leader.jsonl' } },
    isIdle() { return true },
    hasPendingMessages() { return false },
    ui: {
      notify() {},
      setStatus() {},
      setWidget() {},
      confirm: async () => true,
      custom: async callback => {
        let doneValue
        const done = value => { doneValue = value }
        const panel = await callback({
          requestRender() {
            records.requestRenderCalls.push({ at: Date.now() })
          },
          terminal: { rows: 40, columns: 120 },
        }, createFakeTheme(), {}, done)
        records.panel = panel
        return doneValue
      },
      theme: createFakeTheme(),
    },
  }
}

function seedTeam(modules, teamName) {
  modules.state.deleteTeamState(teamName)
  const team = modules.state.createInitialTeamState({
    teamName,
    leaderSessionFile: `/tmp/${teamName}-leader.jsonl`,
    leaderCwd: `/tmp/${teamName}`,
    description: 'v0.6.42 data-change render debounce fixture',
  })
  modules.state.upsertMember(team, {
    name: 'implementer-one',
    role: 'implementer',
    cwd: `/tmp/${teamName}`,
    sessionFile: `/tmp/${teamName}-implementer-one.jsonl`,
    paneId: `%${teamName}-1`,
    windowTarget: 'test:@1',
    status: 'idle',
  })
  modules.state.writeTeamState(team)
  modules.runtimePanes.invalidatePaneReconcileCache(teamName)
}

function patchRuntime(modules) {
  const original = {
    resolvePaneBinding: modules.tmux.resolvePaneBinding,
    listAgentTeamPanes: modules.tmux.listAgentTeamPanes,
  }
  modules.tmux.resolvePaneBinding = paneId => (paneId ? { paneId, target: 'test:@1' } : null)
  modules.tmux.listAgentTeamPanes = () => []
  return {
    restore() {
      modules.tmux.resolvePaneBinding = original.resolvePaneBinding
      modules.tmux.listAgentTeamPanes = original.listAgentTeamPanes
    },
  }
}

function mutateSemanticTask(modules, teamName, iteration, changeIndex) {
  const updated = modules.state.updateTeamState(teamName, latest => {
    const taskId = `T${String(iteration + 1).padStart(3, '0')}-${String(changeIndex + 1).padStart(2, '0')}`
    latest.tasks[taskId] = {
      id: taskId,
      title: `semantic change ${iteration + 1}.${changeIndex + 1}`,
      description: 'compact fixture task without raw body content',
      owner: 'implementer-one',
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      blockedBy: [],
    }
  })
  if (!updated) throw new Error(`Failed to mutate fixture team ${teamName}`)
}

function countEventsSince(summaryBefore, summaryAfter, kind) {
  return summaryAfter.panel.events.slice(summaryBefore.panel.events.length).filter(event => event.kind === kind).length
}

function latestPanelSummary(modules) {
  return modules.profiling.readProfilingSummary()
}

async function warmRender(panel, width = 120) {
  if (!panel || typeof panel.render !== 'function') throw new Error('Mounted panel fixture missing render()')
  panel.render(width)
  if (typeof panel.flushRender === 'function') await panel.flushRender()
}

async function runSemanticIteration(modules, panel, teamName, iteration, options, requestRenderRecords) {
  const beforeProfile = latestPanelSummary(modules)
  const beforeRequests = requestRenderRecords.length
  const started = Date.now()
  for (let index = 0; index < options.burstChanges; index += 1) {
    mutateSemanticTask(modules, teamName, iteration, index)
    panel.invalidate()
  }
  await sleep(options.settleMs)
  if (typeof panel.flushRender === 'function') await panel.flushRender()
  const elapsedMs = Math.max(1, Date.now() - started)
  const afterProfile = latestPanelSummary(modules)
  return {
    id: `measured-semantic-${iteration + 1}`,
    kind: 'semantic-data-change',
    elapsedMs,
    renderRequests: requestRenderRecords.length - beforeRequests,
    renderRatePerSec: round((requestRenderRecords.length - beforeRequests) / (elapsedMs / 1000), 6),
    diffChangedCount: countEventsSince(beforeProfile, afterProfile, 'diffChanged'),
    cacheHitCount: countEventsSince(beforeProfile, afterProfile, 'cacheHit'),
  }
}

async function runNoopRefreshIteration(modules, panel, requestRenderRecords) {
  const beforeProfile = latestPanelSummary(modules)
  const beforeRequests = requestRenderRecords.length
  panel.handleInput('r')
  if (typeof panel.flushRender === 'function') await panel.flushRender()
  const afterProfile = latestPanelSummary(modules)
  return {
    kind: 'manual-noop-refresh',
    renderRequests: requestRenderRecords.length - beforeRequests,
    diffChangedCount: countEventsSince(beforeProfile, afterProfile, 'diffChanged'),
    cacheHitCount: countEventsSince(beforeProfile, afterProfile, 'cacheHit'),
  }
}

async function runDirectRefreshIteration(modules, panel, teamName, requestRenderRecords) {
  const beforeProfile = latestPanelSummary(modules)
  const beforeRequests = requestRenderRecords.length
  mutateSemanticTask(modules, teamName, 99, 1)
  panel.handleInput('r')
  if (typeof panel.flushRender === 'function') await panel.flushRender()
  const afterProfile = latestPanelSummary(modules)
  return {
    kind: 'manual-direct-refresh',
    renderRequests: requestRenderRecords.length - beforeRequests,
    diffChangedCount: countEventsSince(beforeProfile, afterProfile, 'diffChanged'),
    cacheHitCount: countEventsSince(beforeProfile, afterProfile, 'cacheHit'),
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
    burstChanges: options.burstChanges,
    debounceMs: options.debounceMs,
    settleMs: options.settleMs,
  }
}

function summarizePanelProfile(summary) {
  return {
    enabled: summary.enabled,
    panel: {
      dataLoadCount: summary.panel.dataLoadCount,
      readModelBuildCount: summary.panel.readModelBuildCount,
      renderCount: summary.panel.renderCount,
      requestRenderCount: summary.panel.requestRenderCount,
      cacheHitCount: summary.panel.cacheHitCount,
      diffChangedCount: summary.panel.diffChangedCount,
      byMode: summary.panel.byMode,
      lastCounts: summary.panel.lastCounts,
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
  const stats = summarizeDurations(records.map(record => record.renderRatePerSec))
  return {
    id: 'data-change-render-debounce-rate',
    status: stats.p95 <= RENDER_RATE_THRESHOLD_PER_SEC ? 'pass' : 'fail',
    metric: 'teamPanel.semanticDataChange.renderRequestsPerSecond.p95',
    threshold: { kind: 'p95-rate-lte', value: RENDER_RATE_THRESHOLD_PER_SEC, unit: 'renders/sec' },
    observed: stats.p95,
    observedUnit: 'renders/sec',
    measuredBursts: records.length,
  }
}

async function runHarness(options = {}) {
  const extRoot = path.resolve(options.extRoot || path.join(__dirname, '..', '..'))
  const prefix = options.prefix || DEFAULT_PREFIX
  const cleanup = options.cleanup !== false
  const warmup = parsePositiveInt(options.warmup ?? process.env.AGENTTEAM_BENCH_WARMUP, DEFAULT_WARMUP)
  const measured = parsePositiveInt(options.measured ?? process.env.AGENTTEAM_BENCH_ITERATIONS, DEFAULT_MEASURED)
  const burstChanges = parsePositiveInt(options.burstChanges ?? process.env.AGENTTEAM_PANEL_BURST_CHANGES, DEFAULT_BURST_CHANGES)
  const debounceMs = parsePositiveInt(options.debounceMs ?? process.env.AGENTTEAM_PANEL_DEBOUNCE_MS, DEFAULT_DEBOUNCE_MS)
  const settleMs = parsePositiveInt(options.settleMs ?? process.env.AGENTTEAM_PANEL_SETTLE_MS, Math.max(DEFAULT_SETTLE_MS, debounceMs + 70))
  const providedHome = options.home || process.env.PI_AGENTTEAM_HOME
  const tempHome = providedHome || fs.mkdtempSync(prefix)
  const resolvedHome = path.resolve(tempHome)
  const originalHome = process.env.PI_AGENTTEAM_HOME
  const originalProfile = process.env.PI_AGENTTEAM_PROFILE
  const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-agentteam-v0642-data-change-render-debounce-build-'))
  const distRoot = path.join(buildRoot, 'dist')
  const stubRoot = path.join(distRoot, 'stubs')
  const outputPath = options.out || path.join(os.tmpdir(), `pi-agentteam-v0642-data-change-render-debounce-${process.pid}-${Date.now()}.json`)
  const records = []
  const warmupRecords = []
  const directRefresh = []
  const noopRefresh = []
  const summary = {
    schemaVersion: 1,
    runId: `v0642-data-change-render-debounce-${Date.now()}`,
    status: 'started',
    ok: false,
    tempHome: resolvedHome,
    tempHomePrefix: prefix,
    cleanupRequested: cleanup,
    cleanupResult: 'not-run',
    env: createEnvMetadata({ warmup, measured, burstChanges, debounceMs, settleMs }, resolvedHome),
    isolation: {
      safePrefix: false,
      underRepo: false,
      initialEntryCount: undefined,
      finalEntryCountBeforeCleanup: undefined,
      liveHomeEnvRestored: false,
      profileEnvRestored: false,
    },
    fixture: {
      profile: 'mounted-attached-team-panel-semantic-burst',
      warmup,
      measured,
      burstChanges,
      debounceMs,
      settleMs,
      appOwnedTime: 'mounted /team panel input/layout refresh scheduling for semantic data changes in a clean temporary PI_AGENTTEAM_HOME; excludes LLM/provider, tmux, terminal rendering host, image captures, operator time, and raw terminal logs',
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
    renderRate: {},
    directRefresh: {},
    noopRefresh: {},
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
    summary.env = createEnvMetadata({ warmup, measured, burstChanges, debounceMs, settleMs }, resolvedHome)
    writeFile(path.join(resolvedHome, 'config.json'), `${JSON.stringify({ version: 1, ui: { teamPanel: { refreshMode: 'debounced', minRefreshMs: debounceMs } } }, null, 2)}\n`)

    createStubs(stubRoot)
    transpileProject(extRoot, distRoot, stubRoot)
    const modules = loadModules(distRoot)
    modules.profiling.resetProfiling()
    const patch = patchRuntime(modules)
    const teamName = 'v0642-data-change-render-debounce'
    seedTeam(modules, teamName)
    const mountRecords = { requestRenderCalls: [], panel: undefined }
    const ctx = createMountedPanelContext(mountRecords)
    await modules.teamPanel.openTeamPanel(ctx, teamName)
    const panel = mountRecords.panel
    await warmRender(panel)

    try {
      for (let index = 0; index < warmup; index += 1) {
        warmupRecords.push(await runSemanticIteration(modules, panel, teamName, index, { burstChanges, settleMs }, mountRecords.requestRenderCalls))
      }
      modules.profiling.resetProfiling()
      mountRecords.requestRenderCalls.length = 0
      for (let index = 0; index < measured; index += 1) {
        records.push(await runSemanticIteration(modules, panel, teamName, index, { burstChanges, settleMs }, mountRecords.requestRenderCalls))
      }
      noopRefresh.push(await runNoopRefreshIteration(modules, panel, mountRecords.requestRenderCalls))
      directRefresh.push(await runDirectRefreshIteration(modules, panel, teamName, mountRecords.requestRenderCalls))
    } finally {
      patch.restore()
    }

    const profilingSummary = modules.profiling.readProfilingSummary()
    const gate = gateResult(records)
    summary.gates = [gate]
    summary.p95Status = gate.status
    summary.renderRate = summarizeDurations(records.map(record => record.renderRatePerSec))
    summary.directRefresh = {
      iterations: directRefresh.length,
      renderRequests: directRefresh.reduce((sum, record) => sum + record.renderRequests, 0),
      diffChangedCount: directRefresh.reduce((sum, record) => sum + record.diffChangedCount, 0),
    }
    summary.noopRefresh = {
      iterations: noopRefresh.length,
      renderRequests: noopRefresh.reduce((sum, record) => sum + record.renderRequests, 0),
      cacheHitCount: noopRefresh.reduce((sum, record) => sum + record.cacheHitCount, 0),
    }
    summary.profileSummary = summarizePanelProfile(profilingSummary)
    pushCheck(summary, 'mounted-panel-captured', Boolean(panel && typeof panel.invalidate === 'function' && typeof panel.handleInput === 'function' && typeof panel.render === 'function'))
    pushCheck(summary, 'semantic-data-change-render-rate-threshold', gate.status === 'pass', { observed: gate.observed, threshold: RENDER_RATE_THRESHOLD_PER_SEC })
    pushCheck(summary, 'semantic-data-change-diff-recorded', records.every(record => record.diffChangedCount >= 1), { diffChangedCounts: records.map(record => record.diffChangedCount) })
    pushCheck(summary, 'manual-direct-refresh-preserved', summary.directRefresh.renderRequests >= 1 && summary.directRefresh.diffChangedCount >= 1, summary.directRefresh)
    pushCheck(summary, 'manual-noop-refresh-cache-hit-no-render', summary.noopRefresh.renderRequests === 0 && summary.noopRefresh.cacheHitCount >= 1, summary.noopRefresh)
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
      renderRate: summary.renderRate,
      directRefresh: summary.directRefresh,
      noopRefresh: summary.noopRefresh,
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
  DEFAULT_BURST_CHANGES,
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_MEASURED,
  DEFAULT_PREFIX,
  DEFAULT_SETTLE_MS,
  DEFAULT_WARMUP,
  FORBIDDEN_OUTPUT_MARKERS,
  FULL_TEXT_SENTINEL,
  RENDER_RATE_THRESHOLD_PER_SEC,
  isSafeTempHome,
  runHarness,
  summarizeDurations,
}
