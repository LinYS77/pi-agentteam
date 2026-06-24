const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const DEFAULT_PREFIX = '/tmp/pi-agentteam-v0641-fsstore-lock-wait-p95.'
const LOCK_WAIT_THRESHOLD_MS = 25
const DEFAULT_WARMUP = 5
const DEFAULT_MEASURED = 30
const DEFAULT_HOLD_MS = 8
const FORBIDDEN_OUTPUT_MARKERS = Object.freeze([
  'V0641_FSSTORE_LOCK_WAIT_FULL_TEXT_SENTINEL_DO_NOT_LEAK',
  'MailboxMessage.text',
  'TaskReport.text',
  'worker transcript',
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
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function transpileProjectFiles(extRoot, distRoot) {
  const ts = requireTypeScript()
  const files = [
    'core/profiling.ts',
    'runtime/profiling.ts',
    'state/fsStore.ts',
  ]
  ensureDir(distRoot)
  for (const rel of files) {
    const sourceFile = path.join(extRoot, rel)
    const sourceText = fs.readFileSync(sourceFile, 'utf8')
    const output = ts.transpileModule(sourceText, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: sourceFile,
      reportDiagnostics: false,
    }).outputText
    writeFile(path.join(distRoot, rel.replace(/\.ts$/, '.js')), output)
  }
}

function loadModules(distRoot) {
  const req = rel => require(path.join(distRoot, rel))
  return {
    fsStore: req('state/fsStore.js'),
    profiling: req('runtime/profiling.js'),
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
    lockHolderMs: options.holdMs,
  }
}

function lockHolderScript() {
  return `
const fs = require('node:fs')
const path = require('node:path')
const target = process.env.LOCK_TARGET
const holdMs = Number.parseInt(process.env.LOCK_HOLD_MS || '8', 10)
if (!target) throw new Error('LOCK_TARGET is required')
const lockPath = target + '.lock'
fs.mkdirSync(path.dirname(lockPath), { recursive: true })
let fd
try {
  fd = fs.openSync(lockPath, 'wx')
  fs.writeFileSync(fd, process.pid + '\\n' + Date.now() + '\\n', 'utf8')
  process.stdout.write('ready\\n')
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number.isFinite(holdMs) && holdMs > 0 ? holdMs : 8)
} finally {
  try { if (fd !== undefined) fs.closeSync(fd) } catch {}
  try { fs.rmSync(lockPath, { force: true }) } catch {}
}
`
}

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for lock holder readiness')), 1000)
    child.stdout.on('data', chunk => {
      output += chunk.toString('utf8')
      if (output.includes('ready')) {
        clearTimeout(timeout)
        resolve()
      }
    })
    child.on('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('exit', code => {
      if (!output.includes('ready')) {
        clearTimeout(timeout)
        reject(new Error(`Lock holder exited before ready: ${code}`))
      }
    })
  })
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`Lock holder exited with code ${code}`))
    })
  })
}

async function measureContendedLock(input) {
  const { modules, targetPath, holdMs, iteration, phase } = input
  const child = spawn(process.execPath, ['-e', lockHolderScript()], {
    env: { ...process.env, LOCK_TARGET: targetPath, LOCK_HOLD_MS: String(holdMs) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk.toString('utf8') })
  await waitForReady(child)
  const beforeEvents = modules.profiling.readProfilingSummary().fsStore.events.length
  const started = process.hrtime.bigint()
  modules.fsStore.withFileLock(targetPath, () => {
    modules.fsStore.writeJsonFile(targetPath, {
      schemaVersion: 1,
      fixture: 'v0641-fsstore-lock-wait-p95',
      phase,
      iteration,
      compactValue: `lock wait fixture ${phase} ${iteration}`,
    })
    const readback = modules.fsStore.readJsonFile(targetPath)
    if (!readback || readback.iteration !== iteration) throw new Error(`readback mismatch for ${phase} ${iteration}`)
  })
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  await waitForExit(child).catch(error => {
    throw new Error(`${error.message}${stderr ? `: ${sanitizeText(stderr, 240)}` : ''}`)
  })
  const events = modules.profiling.readProfilingSummary().fsStore.events.slice(beforeEvents)
  const lockEvent = events.filter(event => event.kind === 'lock').at(-1)
  if (!lockEvent || typeof lockEvent.lockWaitMs !== 'number') throw new Error(`Missing lock event for ${phase} ${iteration}`)
  return {
    id: `${phase}-lock-${iteration}`,
    phase,
    fixture: 'contended-json-read-write',
    lockWaitMs: round(lockEvent.lockWaitMs, 6),
    elapsedMs: round(elapsedMs, 6),
    operationCount: events.length,
    categories: [...new Set(events.map(event => event.category).filter(Boolean))].sort(),
    callSite: sanitizeText(lockEvent.callSite, 160),
  }
}

function summarizeProfile(summary) {
  const lockEvents = summary.fsStore.events.filter(event => event.kind === 'lock')
  const callSites = new Map()
  for (const event of lockEvents) {
    const key = sanitizeText(event.callSite, 160)
    const item = callSites.get(key) || { callSite: key, count: 0, p95: 0, max: 0, values: [] }
    item.count += 1
    item.values.push(event.lockWaitMs ?? event.durationMs)
    callSites.set(key, item)
  }
  return {
    enabled: summary.enabled,
    fsStore: {
      lockCount: summary.fsStore.lockCount,
      readCount: summary.fsStore.readCount,
      parseCount: summary.fsStore.parseCount,
      writeCount: summary.fsStore.writeCount,
      stateReadCount: summary.fsStore.stateReadCount,
      stateWriteCount: summary.fsStore.stateWriteCount,
      bytesRead: summary.fsStore.bytesRead,
      bytesWritten: summary.fsStore.bytesWritten,
      lockWait: summarizeDurations(lockEvents.map(event => event.lockWaitMs ?? event.durationMs)),
      byCallSite: [...callSites.values()].map(item => ({
        callSite: item.callSite,
        count: item.count,
        p95: summarizeDurations(item.values).p95,
        max: summarizeDurations(item.values).max,
      })).sort((a, b) => b.p95 - a.p95).slice(0, 5),
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
  const stats = summarizeDurations(records.map(record => record.lockWaitMs))
  return {
    id: 'fsstore-lock-wait-p95',
    status: stats.p95 <= LOCK_WAIT_THRESHOLD_MS ? 'pass' : 'fail',
    metric: 'fsStore.lockWaitMs.p95',
    threshold: { kind: 'p95-ms-lte', value: LOCK_WAIT_THRESHOLD_MS, unit: 'ms' },
    observed: stats.p95,
    observedUnit: 'ms',
    measuredLocks: records.length,
  }
}

async function runHarness(options = {}) {
  const extRoot = path.resolve(options.extRoot || path.join(__dirname, '..', '..'))
  const prefix = options.prefix || DEFAULT_PREFIX
  const cleanup = options.cleanup !== false
  const warmup = parsePositiveInt(options.warmup ?? process.env.AGENTTEAM_BENCH_WARMUP, DEFAULT_WARMUP)
  const measured = parsePositiveInt(options.measured ?? process.env.AGENTTEAM_BENCH_ITERATIONS, DEFAULT_MEASURED)
  const holdMs = parsePositiveInt(options.holdMs ?? process.env.AGENTTEAM_LOCK_HOLD_MS, DEFAULT_HOLD_MS)
  const providedHome = options.home || process.env.PI_AGENTTEAM_HOME
  const tempHome = providedHome || fs.mkdtempSync(prefix)
  const resolvedHome = path.resolve(tempHome)
  const originalHome = process.env.PI_AGENTTEAM_HOME
  const originalProfile = process.env.PI_AGENTTEAM_PROFILE
  const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-agentteam-v0641-fsstore-lock-wait-p95-build-'))
  const distRoot = path.join(buildRoot, 'dist')
  const outputPath = options.out || path.join(os.tmpdir(), `pi-agentteam-v0641-fsstore-lock-wait-p95-${process.pid}-${Date.now()}.json`)
  const records = []
  const summary = {
    schemaVersion: 1,
    runId: `v0641-fsstore-lock-wait-p95-${Date.now()}`,
    status: 'started',
    ok: false,
    tempHome: resolvedHome,
    tempHomePrefix: prefix,
    cleanupRequested: cleanup,
    cleanupResult: 'not-run',
    env: createEnvMetadata({ warmup, measured, holdMs }, resolvedHome),
    isolation: {
      safePrefix: false,
      underRepo: false,
      initialEntryCount: undefined,
      finalEntryCountBeforeCleanup: undefined,
      liveHomeEnvRestored: false,
      profileEnvRestored: false,
    },
    fixture: {
      profile: 'contended-json-read-write',
      lockHolderMs: holdMs,
      warmup,
      measured,
      appOwnedTime: 'fsStore withFileLock lock acquisition wait plus compact JSON read/write inside a clean temporary PI_AGENTTEAM_HOME; excludes LLM/provider, tmux, terminal rendering, worker execution, and operator time',
      rawStateArchived: false,
      fullBodiesIncluded: false,
    },
    rawArtifact: {
      path: outputPath,
      parse: 'not-written',
      sha256: '',
      checkedIn: false,
    },
    gates: [],
    lockWait: {},
    profileSummary: {},
    checks: [],
    noLeak: {
      status: 'started',
      markerCount: FORBIDDEN_OUTPUT_MARKERS.length,
      markerPolicy: 'forbidden full-body/state-archive markers are checked but marker strings are not emitted in harness JSON',
      rawStateArchivesCheckedIn: false,
      rawFullBodiesCheckedIn: false,
      rawTimingJsonCheckedIn: false,
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
    summary.env = createEnvMetadata({ warmup, measured, holdMs }, resolvedHome)

    transpileProjectFiles(extRoot, distRoot)
    const modules = loadModules(distRoot)
    modules.profiling.resetProfiling()
    const targetPath = path.join(resolvedHome, 'teams', 'v0641-fsstore-lock-wait-p95', 'state', 'lock-target.json')
    modules.fsStore.writeJsonFile(targetPath, { schemaVersion: 1, fixture: 'v0641-fsstore-lock-wait-p95', seeded: true })
    modules.profiling.resetProfiling()

    for (let index = 0; index < warmup; index += 1) {
      await measureContendedLock({ modules, targetPath, holdMs, iteration: index + 1, phase: 'warmup' })
    }
    modules.profiling.resetProfiling()
    for (let index = 0; index < measured; index += 1) {
      records.push(await measureContendedLock({ modules, targetPath, holdMs, iteration: index + 1, phase: 'measured' }))
    }

    const profilingSummary = modules.profiling.readProfilingSummary()
    const gate = gateResult(records)
    summary.gates = [gate]
    summary.p95Status = gate.status
    summary.lockWait = summarizeDurations(records.map(record => record.lockWaitMs))
    summary.profileSummary = summarizeProfile(profilingSummary)
    pushCheck(summary, 'fsstore-lock-events-recorded', profilingSummary.fsStore.lockCount >= measured, { lockCount: profilingSummary.fsStore.lockCount, measured })
    pushCheck(summary, 'fsstore-read-write-parse-covered', profilingSummary.fsStore.readCount >= measured && profilingSummary.fsStore.writeCount >= measured && profilingSummary.fsStore.parseCount >= measured, {
      readCount: profilingSummary.fsStore.readCount,
      writeCount: profilingSummary.fsStore.writeCount,
      parseCount: profilingSummary.fsStore.parseCount,
    })
    pushCheck(summary, 'fsstore-lock-wait-p95-threshold', gate.status === 'pass', { observed: gate.observed, threshold: LOCK_WAIT_THRESHOLD_MS })
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
      lockWait: summary.lockWait,
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
  DEFAULT_HOLD_MS,
  DEFAULT_MEASURED,
  DEFAULT_PREFIX,
  DEFAULT_WARMUP,
  FORBIDDEN_OUTPUT_MARKERS,
  LOCK_WAIT_THRESHOLD_MS,
  isSafeTempHome,
  runHarness,
  summarizeDurations,
}
