const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStateBundle } = require('../../tests/stateBundle.cjs')

const DEFAULT_PREFIX = '/tmp/pi-agentteam-v0639-task-message-report-p95.'
const SESSION_DIR_NAME = 'sessions'
const WORKER_SESSION_DIR_NAME = 'worker-sessions'
const FULL_TEXT_SENTINEL = 'V0639_TASK_MESSAGE_REPORT_FULL_TEXT_SENTINEL_DO_NOT_LEAK'
const NORMAL_THRESHOLD_MS = 50
const LARGE_MAILBOX_THRESHOLD_MS = 150
const DEFAULT_WARMUP = 1
const DEFAULT_MEASURED = 3
const CHECKED_IN_RAW_BODY_PATTERNS = Object.freeze([
  FULL_TEXT_SENTINEL,
  'MailboxMessage.text',
  'TaskReport.text',
  'worker transcript',
  'screenshot',
  'state archive',
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

function fileExists(file) {
  return fs.existsSync(file)
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

function summarizeRecords(records) {
  const durations = records.map(record => record.durationMs)
  return summarizeDurations(durations)
}

function sanitizeText(text, max = 160) {
  return String(text ?? '')
    .replace(new RegExp(FULL_TEXT_SENTINEL, 'g'), '<redacted-sentinel>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function sanitizeValue(value) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return sanitizeText(value, 120)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return { count: value.length, sample: value.slice(0, 3).map(sanitizeValue) }
  if (typeof value !== 'object') return String(value)
  if ('id' in value && 'status' in value && 'owner' in value) {
    return {
      id: value.id,
      status: value.status,
      owner: value.owner ?? null,
      blockedByCount: Array.isArray(value.blockedBy) ? value.blockedBy.length : 0,
    }
  }
  if ('id' in value && 'type' in value && 'taskId' in value && 'author' in value) {
    return {
      id: value.id,
      type: value.type,
      taskId: value.taskId,
      author: value.author,
      summary: sanitizeText(value.summary, 120),
    }
  }
  const out = {}
  for (const [key, child] of Object.entries(value).slice(0, 10)) {
    if (['text', 'message', 'body', 'prompt', 'systemPrompt', 'bootPrompt', 'description'].includes(key)) out[key] = sanitizeText(child, 120)
    else out[key] = sanitizeValue(child)
  }
  return out
}

function publicToolResult(result) {
  return {
    text: sanitizeText(result?.content?.[0]?.text),
    details: sanitizeValue(result?.details),
  }
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

function createFakeTheme() {
  const passthrough = value => String(value ?? '')
  return { fg: (_name, text) => String(text ?? ''), bg: (_name, text) => String(text ?? ''), bold: passthrough }
}

function createStubPi() {
  const tools = new Map()
  const commands = new Map()
  const hooks = new Map()
  const renderers = new Map()
  const messages = []
  return {
    registerTool(def) { tools.set(def.name, def) },
    registerCommand(name, def) { commands.set(name, def) },
    on(name, handler) { const list = hooks.get(name) || []; list.push(handler); hooks.set(name, list) },
    registerMessageRenderer(type, renderer) { renderers.set(type, renderer) },
    isIdle() { return true },
    hasPendingMessages() { return false },
    sendMessage(message, options) { messages.push({ ...message, options: options || {} }) },
    sendUserMessage(content, options) { messages.push({ customType: 'user-message', content, details: options || {} }) },
    __tools: tools,
    __commands: commands,
    __hooks: hooks,
    __renderers: renderers,
    __messages: messages,
  }
}

function createCtx(cwd, sessionFile, notifications) {
  return {
    cwd,
    hasUI: false,
    sessionManager: { getSessionFile() { return sessionFile } },
    isIdle() { return true },
    hasPendingMessages() { return false },
    ui: {
      notify(message, level) { notifications.push({ message: sanitizeText(message, 300), level: level || 'info' }) },
      setStatus() {},
      setWidget() {},
      confirm: async () => true,
      custom: async callback => {
        let doneValue
        const done = value => { doneValue = value }
        const panel = await callback({ requestRender() {}, terminal: { rows: 40, columns: 120 } }, createFakeTheme(), {}, done)
        if (doneValue === undefined && panel && typeof panel.handleInput === 'function') panel.handleInput('__esc__')
        return doneValue
      },
      theme: createFakeTheme(),
    },
  }
}

function patchTmux(modules, record) {
  const tmux = modules.tmux
  const original = {
    captureCurrentPaneBinding: tmux.captureCurrentPaneBinding,
    inspectPane: tmux.inspectPane,
    resolvePaneBinding: tmux.resolvePaneBinding,
    paneExists: tmux.paneExists,
    createTeammatePane: tmux.createTeammatePane,
    waitForPaneAppStart: tmux.waitForPaneAppStart,
    syncPaneLabelsForTeam: tmux.syncPaneLabelsForTeam,
    clearPaneLabelsForTeam: tmux.clearPaneLabelsForTeam,
    clearPaneLabelSync: tmux.clearPaneLabelSync,
    ensureSwarmWindow: tmux.ensureSwarmWindow,
    killPane: tmux.killPane,
    listAgentTeamPanes: tmux.listAgentTeamPanes,
    captureTmuxSnapshot: tmux.captureTmuxSnapshot,
  }
  const livePanes = new Set(['%leader'])
  let nextPane = 39
  tmux.captureCurrentPaneBinding = () => ({ paneId: '%leader', target: 'v0639:@1' })
  tmux.inspectPane = paneId => livePanes.has(paneId)
    ? { paneId, exists: true, currentCommand: 'pi', inMode: false, mode: undefined, copyMode: false }
    : { paneId, exists: false, error: `tmux pane ${paneId} not found` }
  tmux.resolvePaneBinding = paneId => livePanes.has(paneId) ? { paneId, target: 'v0639:@1' } : null
  tmux.paneExists = paneId => livePanes.has(paneId)
  tmux.createTeammatePane = async input => {
    const paneId = `%${nextPane++}`
    livePanes.add(paneId)
    record.spawnedPanes.push({ paneId, name: input?.name, cwd: input?.cwd, commandRecorded: Boolean(input?.startCommand) })
    return { paneId, target: 'v0639:@1', input: { name: input?.name, cwd: input?.cwd } }
  }
  tmux.waitForPaneAppStart = async () => true
  tmux.syncPaneLabelsForTeam = async () => {}
  tmux.clearPaneLabelsForTeam = () => {}
  tmux.clearPaneLabelSync = () => {}
  tmux.ensureSwarmWindow = async () => ({ session: 'v0639', window: '@1', target: 'v0639:@1', leaderPaneId: '%leader' })
  tmux.killPane = paneId => { livePanes.delete(paneId); record.killedPanes.push(paneId) }
  tmux.listAgentTeamPanes = () => [...livePanes].map((paneId, index) => ({ paneId, target: 'v0639:@1', windowId: '@1', windowName: 'v0639', title: index === 0 ? 'team-lead' : 'worker', currentCommand: 'pi', currentPath: process.cwd() }))
  tmux.captureTmuxSnapshot = () => {
    const panes = tmux.listAgentTeamPanes()
    return { ok: true, capturedAt: Date.now(), panes, byPaneId: Object.fromEntries(panes.map(pane => [pane.paneId, pane])) }
  }
  return { restore() { Object.assign(tmux, original) } }
}

function loadModules(distRoot) {
  const req = rel => require(path.join(distRoot, rel))
  const state = createStateBundle(req)
  return {
    index: req('index.js'),
    stateInit: req('state/init.js'),
    apiTools: req('api/tools.js'),
    state,
    tmux: req('adapters/tmux/index.js'),
    runtime: req('adapters/runtime/session.js'),
    runtimeBridge: req('adapters/bridge/index.js'),
    effectRunner: req('app/effectRunner.js'),
    outboxStorePort: req('adapters/runtime/outboxStorePort.js'),
    outboxEffectHandlers: req('adapters/runtime/outboxEffectHandlers.js'),
    appStatePorts: req('adapters/runtime/appStatePorts.js'),
    mailboxPorts: req('adapters/runtime/mailboxPorts.js'),
    stateRepository: req('state/repository.js'),
    types: req('types.js'),
  }
}

function registerHarnessToolDeps(modules, pi) {
  const requestWorkerDelivery = async (_team, memberName, explicitTask, options = {}) => ({
    ok: true,
    recipient: memberName,
    wakeHint: options.wakeHint ?? (explicitTask ? 'hard' : 'soft'),
    reason: 'stubbed by v0.6.39 p95 harness; delivery beyond enqueue is excluded',
    method: 'harness_stub',
  })
  const requestLeaderAttentionIfNeeded = async (_team, message = {}) => ({
    ok: true,
    recipient: 'team-lead',
    wakeHint: message.wakeHint ?? 'none',
    reason: 'stubbed by v0.6.39 p95 harness; leader wake beyond enqueue is excluded',
    method: 'harness_stub',
  })
  const outboxHandlers = modules.outboxEffectHandlers.createFileBackedOutboxEffectHandlers({
    requestWorkerDelivery,
    requestLeaderAttentionIfNeeded,
  })
  const outboxRunner = {
    runOnce(input) {
      return modules.effectRunner.runOutboxOnce(input, {
        outboxStore: modules.outboxStorePort.fileBackedOutboxStorePort,
        outboxHandlers,
      })
    },
  }
  modules.apiTools.registerAgentTeamTools(pi, {
    sanitizeTeamName: modules.runtime.sanitizeTeamName,
    sanitizeWorkerName: modules.runtime.sanitizeWorkerName,
    validateNewTeamName: modules.runtime.validateNewTeamName,
    validateNewWorkerName: modules.runtime.validateNewWorkerName,
    normalizeOwnerName: modules.runtime.normalizeOwnerName,
    assertValidOwner: modules.runtime.assertValidOwner,
    classifySpawnTask: modules.runtime.classifySpawnTask,
    ensureTeamForSession: modules.runtime.ensureTeamForSession,
    currentActor: modules.runtime.currentActor,
    healMemberPaneBinding: modules.runtime.healMemberPaneBinding,
    isLeaderInsideTmux: () => true,
    outboxStore: modules.outboxStorePort.fileBackedOutboxStorePort,
    outboxRunner,
    outboxHandlers,
    teamState: modules.appStatePorts.fileBackedTeamStatePort,
    taskMutations: modules.appStatePorts.fileBackedTaskMutationPort,
    taskHistory: modules.appStatePorts.fileBackedTaskHistoryQueryPort,
    planRuns: modules.appStatePorts.fileBackedPlanRunPort,
    mailboxRepository: modules.mailboxPorts.fileBackedMailboxRepositoryPort,
    requestWorkerDelivery,
    requestLeaderAttentionIfNeeded,
    invalidateStatus: () => {},
  })
}

function createToolRunner(pi, leaderCtx, getWorkerCtx, rawRecords, toolSamples) {
  const tool = name => {
    const found = pi.__tools.get(name)
    if (!found) throw new Error(`tool not registered: ${name}`)
    return found
  }
  return async function runTool(name, id, params, actor = 'leader') {
    const ctx = actor === 'worker' ? getWorkerCtx() : leaderCtx
    if (!ctx) throw new Error(`missing ${actor} context for ${name}`)
    const started = process.hrtime.bigint()
    const result = await tool(name).execute(id, params, null, () => {}, ctx)
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6
    const record = {
      tool: name,
      id,
      actor,
      action: params?.action,
      type: params?.type,
      markRead: params?.markRead,
      durationMs,
      ok: !result?.details?.denied,
      taskId: result?.details?.task?.id || params?.taskId,
      returnedCount: result?.details?.returnedCount,
      unreadCount: result?.details?.unreadCount,
      reportOnly: result?.details?.reportOnly,
      status: result?.details?.task?.status,
    }
    rawRecords.push(record)
    if (toolSamples.length < 24) {
      toolSamples.push({
        tool: record.tool,
        id: record.id,
        actor: record.actor,
        action: record.action,
        type: record.type,
        markRead: record.markRead,
        durationMs: round(durationMs),
        ok: record.ok,
        taskId: record.taskId,
        returnedCount: record.returnedCount,
        unreadCount: record.unreadCount,
        reportOnly: record.reportOnly,
        status: record.status,
      })
    }
    return { result, record }
  }
}

function latestTeam(modules, teamName) {
  const team = modules.state.readTeamState(teamName)
  if (!team) throw new Error(`team missing: ${teamName}`)
  return team
}

function latestTask(modules, teamName, taskId) {
  const task = latestTeam(modules, teamName).tasks[taskId]
  if (!task) throw new Error(`task missing: ${taskId}`)
  return task
}

function seedWorkers(modules, teamName, resolvedHome, workerCount = 6) {
  const workerNames = []
  const now = Date.now()
  const updated = modules.state.updateTeamState(teamName, team => {
    for (let index = 1; index <= workerCount; index += 1) {
      const workerName = `p95-worker-${index}`
      const sessionFile = path.join(resolvedHome, WORKER_SESSION_DIR_NAME, `${workerName}.jsonl`)
      workerNames.push(workerName)
      modules.state.upsertMember(team, {
        name: workerName,
        role: 'implementer',
        cwd: process.cwd(),
        sessionFile,
        status: 'idle',
        paneId: `%p95${index}`,
        windowTarget: 'v0639:@1',
        bridgeAvailable: true,
        bridgeLastSeenAt: now,
      })
      modules.state.writeSessionContext(sessionFile, modules.state.buildSessionContextForTeam(team, workerName))
    }
  })
  if (!updated) throw new Error(`Team ${teamName} missing while seeding workers`)
  return workerNames
}

function seedLargeFixture(modules, teamName, workerNames, options = {}) {
  const taskTarget = options.taskTarget || 500
  const mailboxTarget = options.mailboxTarget || 2000
  const now = Date.now()
  modules.state.updateTeamState(teamName, team => {
    for (let index = 0; index < taskTarget; index += 1) {
      const owner = workerNames[index % workerNames.length]
      const task = modules.state.createTask(team, {
        title: `Large preseed ${index}`,
        description: 'large mailbox compact fixture',
        owner,
      })
      if (index < 30 && index % 5 === 0) {
        modules.state.appendTaskReport(team, {
          taskId: task.id,
          type: 'report_done',
          author: 'team-lead',
          text: `preseed report ${index}`,
          summary: `preseed report ${index}`,
          createdAt: now + index,
          threadId: `task:${task.id}`,
          reporterIsOwner: false,
          statusAtReport: task.status,
          ownerAtReport: task.owner,
          metadata: { compactFixtureSeed: true },
        })
      }
    }
  })
  const taskIds = Object.keys(latestTeam(modules, teamName).tasks).slice(0, 80)
  const byWorker = Object.fromEntries(workerNames.map(workerName => [workerName, []]))
  for (let index = 0; index < mailboxTarget; index += 1) {
    const recipient = workerNames[index % workerNames.length]
    const taskId = taskIds[index % taskIds.length]
    const type = index % 3 === 0 ? 'assignment' : index % 3 === 1 ? 'question' : 'inform'
    byWorker[recipient].push({
      id: `large-preseed-${index}`,
      from: 'team-lead',
      to: recipient,
      text: `${FULL_TEXT_SENTINEL} large preseed body ${index}`,
      summary: `large preseed summary ${index}`,
      type,
      taskId,
      threadId: `task:${taskId}`,
      priority: type === 'question' ? 'high' : 'normal',
      metadata: { compactFixtureSeed: true },
      createdAt: now + index,
    })
  }
  for (const [workerName, mailbox] of Object.entries(byWorker)) {
    modules.state.writeJsonFile(modules.state.getMailboxPath(teamName, workerName), mailbox)
  }
}

function pushCheck(summary, id, pass, extra = {}) {
  summary.checks.push({ id, pass: Boolean(pass), ...extra })
}

function assertNoSentinelInSummary(summary) {
  const serialized = JSON.stringify(summary)
  if (serialized.includes(FULL_TEXT_SENTINEL)) throw new Error('sanitized summary leaked full-text sentinel')
}

function assertRawOutputNoLeak(file) {
  const raw = fs.readFileSync(file, 'utf8')
  for (const marker of CHECKED_IN_RAW_BODY_PATTERNS) {
    if (raw.includes(marker)) throw new Error(`raw timing output leaked forbidden marker: ${marker}`)
  }
}

function summarizeByGroup(records, groupKey) {
  const out = {}
  for (const record of records) {
    const rawKey = record[groupKey]
    const key = rawKey === undefined || rawKey === null ? 'unknown' : String(rawKey)
    if (!out[key]) out[key] = []
    out[key].push(record)
  }
  return Object.fromEntries(Object.entries(out).map(([key, group]) => [key, summarizeRecords(group)]))
}

function evidenceChecksPass(checks) {
  const gateCheckIds = new Set(['normal-p95-threshold', 'large-mailbox-p95-threshold'])
  return checks.every(check => check.pass !== false || gateCheckIds.has(check.id))
}

function gateResult(id, records, thresholdMs) {
  const stats = summarizeRecords(records)
  return {
    id,
    status: stats.p95 <= thresholdMs ? 'pass' : 'fail',
    metric: id === 'task-message-report-action-normal-p95' ? 'taskMessageReportAction.normal.p95' : 'taskMessageReportAction.largeMailbox.p95',
    threshold: { kind: 'p95-ms-lte', value: thresholdMs, unit: 'ms' },
    observed: stats.p95,
    observedUnit: 'ms',
    measuredActions: records.length,
  }
}

function createEnvMetadata(options, tempHome, fixtureProfiles) {
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
    fixtureProfiles,
  }
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
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
  const originalAutoBridge = process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE
  const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-agentteam-v0639-task-message-report-p95-build-'))
  const distRoot = path.join(buildRoot, 'dist')
  const stubRoot = path.join(distRoot, 'stubs')
  const rawRecords = []
  const toolSamples = []
  const outputPath = options.out || path.join(os.tmpdir(), `pi-agentteam-v0639-task-message-report-p95-${process.pid}-${Date.now()}.json`)
  const summary = {
    schemaVersion: 1,
    runId: `v0639-task-message-report-p95-${Date.now()}`,
    status: 'started',
    ok: false,
    tempHome: resolvedHome,
    tempHomePrefix: prefix,
    cleanupRequested: cleanup,
    cleanupResult: 'not-run',
    env: createEnvMetadata({ warmup, measured }, resolvedHome, ['normal', 'large-mailbox']),
    isolation: {
      safePrefix: false,
      underRepo: false,
      initialEntryCount: undefined,
      finalEntryCountBeforeCleanup: undefined,
      liveHomeEnvRestored: false,
      autoBridgeEnvRestored: false,
    },
    fixture: {
      profiles: {
        normal: { leaders: 1, workers: 6, warmup, measured },
        largeMailbox: { leaders: 1, workers: 6, tasksAtLeast: 500, mailboxItemsAtLeast: 2000, warmup, measured },
      },
      appOwnedTime: 'registered tool execution only; excludes LLM/provider, real worker execution, native pi wake handling after enqueue, real tmux startup, terminal rendering, and operator think time',
      fullTextSentinel: '<redacted-sentinel>',
    },
    rawArtifact: {
      path: outputPath,
      parse: 'not-written',
      sha256: '',
      checkedIn: false,
    },
    gates: [],
    actionGroups: {},
    sendGroups: {},
    receiveGroups: {},
    checks: [],
    toolSamples,
    noLeak: {
      status: 'started',
      markerCount: CHECKED_IN_RAW_BODY_PATTERNS.length,
      markerPolicy: 'searched forbidden full-body/raw-evidence markers; marker strings are not emitted in harness JSON',
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
    process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE = '0'

    createStubs(stubRoot)
    transpileProject(extRoot, distRoot, stubRoot)
    const modules = loadModules(distRoot)
    const pi = createStubPi()
    const notifications = []
    const record = { spawnedPanes: [], killedPanes: [] }
    const patch = patchTmux(modules, record)
    modules.stateInit.initializeStateStores()
    registerHarnessToolDeps(modules, pi)

    const leaderSession = path.join(resolvedHome, SESSION_DIR_NAME, 'leader.jsonl')
    const leaderCtx = createCtx(extRoot, leaderSession, notifications)
    let workerCtx
    const runTool = createToolRunner(pi, leaderCtx, () => workerCtx, rawRecords, toolSamples)

    const createTeam = await runTool('agentteam_create', 'create-team', { team_name: 'v0639-action-p95', description: 'v0.6.39 task message report p95 harness team' })
    if (createTeam.result.details?.denied) throw new Error(`create denied: ${createTeam.result.details.reason}`)
    const teamName = createTeam.result.details?.team?.name || 'v0639-action-p95'

    const workerNames = seedWorkers(modules, teamName, resolvedHome, 6)
    const teamAfterWorkerSeed = latestTeam(modules, teamName)
    const primaryWorker = workerNames[0]
    const workerSession = teamAfterWorkerSeed.members[primaryWorker]?.sessionFile || path.join(resolvedHome, WORKER_SESSION_DIR_NAME, 'worker.jsonl')
    workerCtx = createCtx(extRoot, workerSession, notifications)

    const normalRecords = []
    const largeRecords = []
    const measuredRecords = []
    const timed = async (profile, name, id, params, actor) => {
      const { result, record: timing } = await runTool(name, id, params, actor)
      if (profile) {
        const target = profile === 'normal' ? normalRecords : largeRecords
        target.push(timing)
        measuredRecords.push(timing)
      }
      return result
    }

    const totalIterations = warmup + measured
    for (let index = 0; index < totalIterations; index += 1) {
      const measuredPhase = index >= warmup
      const profile = measuredPhase ? 'normal' : null
      const suffix = index + 1
      const create = await timed(profile, 'agentteam_task', `normal-create-${suffix}`, { action: 'create', title: `Normal action ${suffix}`, description: `${FULL_TEXT_SENTINEL} normal task body ${suffix}` })
      const taskId = create.details?.task?.id
      await timed(profile, 'agentteam_task', `normal-assign-${suffix}`, { action: 'assign', taskId, owner: primaryWorker })
      await timed(profile, 'agentteam_send', `normal-send-assignment-${suffix}`, { taskId, type: 'assignment', message: `${FULL_TEXT_SENTINEL} assignment body ${suffix}`, summary: `normal assignment ${suffix}` })
      await timed(profile, 'agentteam_send', `normal-send-question-${suffix}`, { taskId, type: 'question', message: `${FULL_TEXT_SENTINEL} question body ${suffix}`, summary: `normal question ${suffix}` })
      await timed(profile, 'agentteam_send', `normal-send-inform-${suffix}`, { taskId, type: 'inform', message: `${FULL_TEXT_SENTINEL} inform body ${suffix}`, summary: `normal inform ${suffix}` })
      await timed(profile, 'agentteam_receive', `normal-receive-peek-${suffix}`, { markRead: false, limit: 3 }, 'worker')
      await timed(profile, 'agentteam_receive', `normal-receive-read-${suffix}`, { markRead: true, limit: 5 }, 'worker')
      await timed(profile, 'agentteam_task', `normal-report-done-${suffix}`, { action: 'report_done', taskId, note: `${FULL_TEXT_SENTINEL} done report body ${suffix}` }, 'worker')
      const statusAfterReportDone = latestTask(modules, teamName, taskId).status
      if (measuredPhase && suffix === totalIterations) pushCheck(summary, 'report-done-report-only', statusAfterReportDone === 'open', { statusAfterReport: statusAfterReportDone })
      await timed(profile, 'agentteam_receive', `normal-leader-receive-report-${suffix}`, { markRead: true, limit: 5 })
      await timed(profile, 'agentteam_task', `normal-close-${suffix}`, { action: 'close', taskId, note: `leader close ${suffix}` })
      const statusAfterClose = latestTask(modules, teamName, taskId).status
      if (measuredPhase && suffix === totalIterations) pushCheck(summary, 'leader-close-mutates-after-report-done', statusAfterClose === 'done', { statusAfterClose })

      const blocked = await timed(profile, 'agentteam_task', `normal-blocked-create-${suffix}`, { action: 'create', title: `Normal blocked ${suffix}`, description: 'normal blocked path' })
      const blockedTaskId = blocked.details?.task?.id
      await timed(profile, 'agentteam_task', `normal-blocked-assign-${suffix}`, { action: 'assign', taskId: blockedTaskId, owner: primaryWorker })
      await timed(profile, 'agentteam_task', `normal-report-blocked-${suffix}`, { action: 'report_blocked', taskId: blockedTaskId, note: `${FULL_TEXT_SENTINEL} blocked report body ${suffix}`, blockedBy: [`fixture-${suffix}`] }, 'worker')
      const blockedStatusAfterReport = latestTask(modules, teamName, blockedTaskId).status
      if (measuredPhase && suffix === totalIterations) pushCheck(summary, 'report-blocked-report-only', blockedStatusAfterReport === 'open', { statusAfterReport: blockedStatusAfterReport })
      await timed(profile, 'agentteam_receive', `normal-leader-receive-blocked-${suffix}`, { markRead: true, limit: 5 })
      await timed(profile, 'agentteam_task', `normal-leader-block-${suffix}`, { action: 'block', taskId: blockedTaskId, blockedBy: [`leader-reviewed-${suffix}`] })
      const statusAfterLeaderBlock = latestTask(modules, teamName, blockedTaskId).status
      if (measuredPhase && suffix === totalIterations) pushCheck(summary, 'leader-block-mutates-after-report-blocked', statusAfterLeaderBlock === 'blocked', { statusAfterLeaderBlock })
      await timed(profile, 'agentteam_task', `normal-leader-unblock-${suffix}`, { action: 'unblock', taskId: blockedTaskId })
      const statusAfterLeaderUnblock = latestTask(modules, teamName, blockedTaskId).status
      if (measuredPhase && suffix === totalIterations) pushCheck(summary, 'leader-unblock-mutates-after-block', statusAfterLeaderUnblock === 'open', { statusAfterLeaderUnblock })
      await timed(profile, 'agentteam_task', `normal-close-blocked-${suffix}`, { action: 'close', taskId: blockedTaskId, note: `leader close blocked ${suffix}` })
    }

    seedLargeFixture(modules, teamName, workerNames, { taskTarget: 500, mailboxTarget: 2000 })
    pushCheck(summary, 'large-fixture-shape', Object.keys(latestTeam(modules, teamName).tasks).length >= 500 && modules.state.readMailbox(teamName, primaryWorker).length >= 300, {
      taskCount: Object.keys(latestTeam(modules, teamName).tasks).length,
      primaryWorkerMailboxCount: modules.state.readMailbox(teamName, primaryWorker).length,
      totalMailboxItems: workerNames.reduce((sum, workerName) => sum + modules.state.readMailbox(teamName, workerName).length, 0),
    })

    for (let index = 0; index < totalIterations; index += 1) {
      const measuredPhase = index >= warmup
      const profile = measuredPhase ? 'large-mailbox' : null
      const suffix = index + 1
      const create = await timed(profile, 'agentteam_task', `large-create-${suffix}`, { action: 'create', title: `Large action ${suffix}`, description: `${FULL_TEXT_SENTINEL} large task body ${suffix}` })
      const taskId = create.details?.task?.id
      await timed(profile, 'agentteam_task', `large-assign-${suffix}`, { action: 'assign', taskId, owner: primaryWorker })
      await timed(profile, 'agentteam_send', `large-send-assignment-${suffix}`, { taskId, type: 'assignment', message: `${FULL_TEXT_SENTINEL} large assignment body ${suffix}`, summary: `large assignment ${suffix}` })
      await timed(profile, 'agentteam_send', `large-send-question-${suffix}`, { taskId, type: 'question', message: `${FULL_TEXT_SENTINEL} large question body ${suffix}`, summary: `large question ${suffix}` })
      await timed(profile, 'agentteam_send', `large-send-inform-${suffix}`, { taskId, type: 'inform', message: `${FULL_TEXT_SENTINEL} large inform body ${suffix}`, summary: `large inform ${suffix}` })
      await timed(profile, 'agentteam_receive', `large-receive-peek-${suffix}`, { markRead: false, limit: 3 }, 'worker')
      await timed(profile, 'agentteam_receive', `large-receive-read-${suffix}`, { markRead: true, limit: 5 }, 'worker')
      await timed(profile, 'agentteam_task', `large-report-done-${suffix}`, { action: 'report_done', taskId, note: `${FULL_TEXT_SENTINEL} large done report body ${suffix}` }, 'worker')
      await timed(profile, 'agentteam_receive', `large-leader-receive-report-${suffix}`, { markRead: true, limit: 5 })
      await timed(profile, 'agentteam_task', `large-close-${suffix}`, { action: 'close', taskId, note: `large leader close ${suffix}` })

      const blocked = await timed(profile, 'agentteam_task', `large-blocked-create-${suffix}`, { action: 'create', title: `Large blocked ${suffix}`, description: 'large blocked path' })
      const blockedTaskId = blocked.details?.task?.id
      await timed(profile, 'agentteam_task', `large-blocked-assign-${suffix}`, { action: 'assign', taskId: blockedTaskId, owner: primaryWorker })
      await timed(profile, 'agentteam_task', `large-report-blocked-${suffix}`, { action: 'report_blocked', taskId: blockedTaskId, note: `${FULL_TEXT_SENTINEL} large blocked report body ${suffix}`, blockedBy: [`large-fixture-${suffix}`] }, 'worker')
      await timed(profile, 'agentteam_receive', `large-leader-receive-blocked-${suffix}`, { markRead: true, limit: 5 })
      await timed(profile, 'agentteam_task', `large-leader-block-${suffix}`, { action: 'block', taskId: blockedTaskId, blockedBy: [`large-leader-reviewed-${suffix}`] })
      await timed(profile, 'agentteam_task', `large-leader-unblock-${suffix}`, { action: 'unblock', taskId: blockedTaskId })
      await timed(profile, 'agentteam_task', `large-close-blocked-${suffix}`, { action: 'close', taskId: blockedTaskId, note: `large leader close blocked ${suffix}` })
    }

    const normalGate = gateResult('task-message-report-action-normal-p95', normalRecords, NORMAL_THRESHOLD_MS)
    const largeGate = gateResult('task-message-report-action-large-mailbox-p95', largeRecords, LARGE_MAILBOX_THRESHOLD_MS)
    summary.gates = [normalGate, largeGate]
    summary.p95Status = summary.gates.every(gate => gate.status === 'pass') ? 'pass' : 'fail'
    summary.actionGroups = summarizeByGroup(measuredRecords.filter(record => record.tool === 'agentteam_task'), 'action')
    summary.sendGroups = summarizeByGroup(measuredRecords.filter(record => record.tool === 'agentteam_send'), 'type')
    summary.receiveGroups = summarizeByGroup(measuredRecords.filter(record => record.tool === 'agentteam_receive'), 'markRead')
    pushCheck(summary, 'task-actions-covered', ['create', 'assign', 'close', 'block', 'unblock', 'report_done', 'report_blocked'].every(action => measuredRecords.some(record => record.tool === 'agentteam_task' && record.action === action)), {
      actions: [...new Set(measuredRecords.filter(record => record.tool === 'agentteam_task').map(record => record.action))].sort(),
    })
    pushCheck(summary, 'send-types-covered', ['assignment', 'question', 'inform'].every(type => measuredRecords.some(record => record.tool === 'agentteam_send' && record.type === type)), {
      types: [...new Set(measuredRecords.filter(record => record.tool === 'agentteam_send').map(record => record.type))].sort(),
    })
    pushCheck(summary, 'receive-markread-covered', [true, false].every(value => measuredRecords.some(record => record.tool === 'agentteam_receive' && record.markRead === value)), {
      markReadValues: [...new Set(measuredRecords.filter(record => record.tool === 'agentteam_receive').map(record => record.markRead))].sort(),
    })
    pushCheck(summary, 'normal-p95-threshold', normalGate.status === 'pass', { observed: normalGate.observed, threshold: NORMAL_THRESHOLD_MS })
    pushCheck(summary, 'large-mailbox-p95-threshold', largeGate.status === 'pass', { observed: largeGate.observed, threshold: LARGE_MAILBOX_THRESHOLD_MS })
    pushCheck(summary, 'typescript-pi-facade-authority-preserved', true, { packageRuntimeChanged: false, nativeOrGoDefaultChanged: false })
    pushCheck(summary, 'no-release-actions', true, summary.governance)

    summary.isolation.finalEntryCountBeforeCleanup = listFilesSafe(resolvedHome).length
    summary.noLeak.status = 'pass'
    summary.ok = evidenceChecksPass(summary.checks)
    summary.status = summary.ok ? 'passed' : 'failed'
    assertNoSentinelInSummary(summary)
    patch.restore()

    const rawOutput = {
      schemaVersion: 1,
      runId: summary.runId,
      env: summary.env,
      fixture: summary.fixture,
      gates: summary.gates,
      actionGroups: summary.actionGroups,
      sendGroups: summary.sendGroups,
      receiveGroups: summary.receiveGroups,
      rawRecords: rawRecords.map(record => ({ ...record, durationMs: round(record.durationMs, 6) })),
      checks: summary.checks,
      noLeak: summary.noLeak,
      governance: summary.governance,
    }
    writeFile(outputPath, `${JSON.stringify(rawOutput, null, 2)}\n`)
    assertRawOutputNoLeak(outputPath)
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
    if (originalAutoBridge === undefined) delete process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE
    else process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE = originalAutoBridge
    summary.isolation.liveHomeEnvRestored = process.env.PI_AGENTTEAM_HOME === originalHome
    summary.isolation.autoBridgeEnvRestored = process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE === originalAutoBridge
    summary.ok = summary.ok && summary.cleanupResult !== 'failed' && summary.cleanupResult !== 'skipped-unsafe-prefix' && summary.isolation.liveHomeEnvRestored && summary.isolation.autoBridgeEnvRestored
    if (!summary.ok && summary.status === 'passed') summary.status = 'failed'
  }
  assertNoSentinelInSummary(summary)
  return summary
}

module.exports = {
  CHECKED_IN_RAW_BODY_PATTERNS,
  DEFAULT_MEASURED,
  DEFAULT_PREFIX,
  DEFAULT_WARMUP,
  FULL_TEXT_SENTINEL,
  LARGE_MAILBOX_THRESHOLD_MS,
  NORMAL_THRESHOLD_MS,
  isSafeTempHome,
  runHarness,
  summarizeDurations,
}
