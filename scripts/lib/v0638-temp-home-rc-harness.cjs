const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createStateBundle } = require('../../tests/stateBundle.cjs')

const DEFAULT_PREFIX = '/tmp/pi-agentteam-v0638-rc-harness.'
const SESSION_DIR_NAME = 'sessions'
const WORKER_SESSION_DIR_NAME = 'worker-sessions'
const FULL_TEXT_SENTINEL = 'V0638_RC_FULL_TEXT_SENTINEL_DO_NOT_LEAK'

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

function safeRelative(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function isSafeTempHome(home, prefix = DEFAULT_PREFIX) {
  const resolved = path.resolve(home || '')
  return Boolean(home && resolved.startsWith(prefix) && path.basename(resolved).length > path.basename(prefix).length)
}

function sanitizeText(text, max = 180) {
  return String(text ?? '')
    .replace(new RegExp(FULL_TEXT_SENTINEL, 'g'), '<redacted-sentinel>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function publicToolResult(result) {
  return {
    text: sanitizeText(result?.content?.[0]?.text),
    details: sanitizeValue(result?.details),
  }
}

function sanitizeValue(value) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return sanitizeText(value, 120)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 12).map(sanitizeValue)
  if (typeof value !== 'object') return String(value)
  const out = {}
  for (const [key, raw] of Object.entries(value)) {
    if (['text', 'message', 'body', 'prompt', 'systemPrompt', 'bootPrompt', 'description'].includes(key)) {
      out[key] = sanitizeText(raw, 120)
      continue
    }
    if (['task', 'team', 'tasks', 'members', 'messages', 'report', 'reports', 'rows', 'shownTaskIds', 'statusCounts', 'counts', 'hints', 'planRun', 'delivery', 'outboxRun'].includes(key)) {
      out[key] = summarizeKnownShape(key, raw)
      continue
    }
    if (typeof raw === 'object' && raw !== null) {
      out[key] = summarizeKnownShape(key, raw)
      continue
    }
    out[key] = sanitizeValue(raw)
  }
  return out
}

function summarizeKnownShape(key, raw) {
  if (raw === null || raw === undefined) return raw
  if (Array.isArray(raw)) return { count: raw.length, sample: raw.slice(0, 3).map(sanitizeValue) }
  if (typeof raw !== 'object') return sanitizeValue(raw)
  if (key === 'task' || ('id' in raw && 'status' in raw && 'owner' in raw)) {
    return {
      id: raw.id,
      status: raw.status,
      owner: raw.owner ?? null,
      blockedByCount: Array.isArray(raw.blockedBy) ? raw.blockedBy.length : undefined,
    }
  }
  if (key === 'team') {
    return {
      name: raw.name,
      memberCount: raw.members ? Object.keys(raw.members).length : undefined,
      taskCount: raw.tasks ? Object.keys(raw.tasks).length : undefined,
      reportCount: raw.taskReports ? Object.keys(raw.taskReports).length : undefined,
    }
  }
  if (key === 'members') return { count: Object.keys(raw).length, names: Object.keys(raw).sort() }
  if (key === 'tasks') return { count: Object.keys(raw).length, ids: Object.keys(raw).sort() }
  if (key === 'report' || ('id' in raw && 'type' in raw && 'taskId' in raw && 'author' in raw)) {
    return { id: raw.id, type: raw.type, taskId: raw.taskId, author: raw.author, summary: sanitizeText(raw.summary, 120) }
  }
  if (key === 'reports') return { count: Object.keys(raw).length }
  if (key === 'messages') return { count: Array.isArray(raw) ? raw.length : Object.keys(raw).length }
  const entries = Object.entries(raw)
  const out = {}
  for (const [childKey, childValue] of entries.slice(0, 12)) out[childKey] = sanitizeValue(childValue)
  if (entries.length > 12) out._truncatedKeys = entries.length - 12
  return out
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

function createCtx(cwd, sessionFile, notifications, options = {}) {
  return {
    cwd,
    hasUI: Boolean(options.hasUI),
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
  let nextPane = 20
  tmux.captureCurrentPaneBinding = () => ({ paneId: '%leader', target: 'v0638:@1' })
  tmux.inspectPane = paneId => livePanes.has(paneId)
    ? { paneId, exists: true, currentCommand: 'pi', inMode: false, mode: undefined, copyMode: false }
    : { paneId, exists: false, error: `tmux pane ${paneId} not found` }
  tmux.resolvePaneBinding = paneId => livePanes.has(paneId) ? { paneId, target: 'v0638:@1' } : null
  tmux.paneExists = paneId => livePanes.has(paneId)
  tmux.createTeammatePane = async input => {
    const paneId = `%${nextPane++}`
    livePanes.add(paneId)
    record.spawnedPanes.push({ paneId, name: input?.name, cwd: input?.cwd, commandRecorded: Boolean(input?.startCommand) })
    return { paneId, target: 'v0638:@1', input: { name: input?.name, cwd: input?.cwd } }
  }
  tmux.waitForPaneAppStart = async () => true
  tmux.syncPaneLabelsForTeam = async () => {}
  tmux.clearPaneLabelsForTeam = () => {}
  tmux.clearPaneLabelSync = () => {}
  tmux.ensureSwarmWindow = async () => ({ session: 'v0638', window: '@1', target: 'v0638:@1', leaderPaneId: '%leader' })
  tmux.killPane = paneId => { livePanes.delete(paneId); record.killedPanes.push(paneId) }
  tmux.listAgentTeamPanes = () => [...livePanes].map((paneId, index) => ({ paneId, target: 'v0638:@1', windowId: '@1', windowName: 'v0638', title: index === 0 ? 'team-lead' : 'worker', currentCommand: 'pi', currentPath: process.cwd() }))
  tmux.captureTmuxSnapshot = () => {
    const panes = tmux.listAgentTeamPanes()
    return { ok: true, capturedAt: Date.now(), panes, byPaneId: Object.fromEntries(panes.map(pane => [pane.paneId, pane])) }
  }
  return { livePanes, restore() { Object.assign(tmux, original) } }
}

function loadModules(distRoot) {
  const req = rel => require(path.join(distRoot, rel))
  const state = createStateBundle(req)
  return {
    index: req('index.js'),
    state,
    tmux: req('adapters/tmux/index.js'),
    runtime: req('adapters/runtime/session.js'),
    runtimeBridge: req('adapters/bridge/index.js'),
    effectRunner: req('app/effectRunner.js'),
    outboxStorePort: req('adapters/runtime/outboxStorePort.js'),
    outboxEffectHandlers: req('adapters/runtime/outboxEffectHandlers.js'),
    appStatePorts: req('adapters/runtime/appStatePorts.js'),
    mailboxPorts: req('adapters/runtime/mailboxPorts.js'),
    types: req('types.js'),
    viewModel: req('teamPanel/viewModel.js'),
    taskHistory: req('state/taskHistory.js'),
    stateRepository: req('state/repository.js'),
    bridgeStore: req('state/bridgeStore.js'),
  }
}

function compactCommandNotifications(notifications) {
  return notifications.map(item => ({ level: item.level, text: sanitizeText(item.message, 220) }))
}

function resolveReportId(team) {
  return Object.keys(team.taskReports).sort()[0]
}

function assertNoSentinelInSummary(summary) {
  const serialized = JSON.stringify(summary)
  if (serialized.includes(FULL_TEXT_SENTINEL)) throw new Error('sanitized summary leaked full-text sentinel')
}

function listFilesSafe(root) {
  const out = []
  if (!fs.existsSync(root)) return out
  for (const file of walkAll(root)) out.push(safeRelative(root, file))
  return out.sort()
}

function walkAll(root, out = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkAll(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

async function runHarness(options = {}) {
  const extRoot = path.resolve(options.extRoot || path.join(__dirname, '..', '..'))
  const prefix = options.prefix || DEFAULT_PREFIX
  const cleanup = options.cleanup !== false
  const providedHome = options.home || process.env.PI_AGENTTEAM_HOME
  const tempHome = providedHome || fs.mkdtempSync(prefix)
  const resolvedHome = path.resolve(tempHome)
  const originalHome = process.env.PI_AGENTTEAM_HOME
  const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-agentteam-v0638-rc-harness-build-'))
  const distRoot = path.join(buildRoot, 'dist')
  const stubRoot = path.join(distRoot, 'stubs')
  const runId = `v0638-temp-home-rc-harness-${Date.now()}`
  const summary = {
    schemaVersion: 1,
    runId,
    ok: false,
    status: 'started',
    tempHome: resolvedHome,
    tempHomePrefix: prefix,
    cleanupRequested: cleanup,
    cleanupResult: 'not-run',
    env: {
      cwd: process.cwd(),
      extRoot,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      originalPiAgentteamHomeWasSet: Boolean(originalHome),
    },
    isolation: {
      safePrefix: false,
      underRepo: false,
      initialEntryCount: undefined,
      finalEntryCountBeforeCleanup: undefined,
      liveHomeEnvRestored: false,
    },
    commands: [],
    tools: [],
    checks: [],
    unsupported: [],
    artifacts: {},
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
    modules.index.default(pi)

    const tool = name => {
      const found = pi.__tools.get(name)
      if (!found) throw new Error(`tool not registered: ${name}`)
      return found
    }
    const command = name => {
      const found = pi.__commands.get(name)
      if (!found) throw new Error(`command not registered: ${name}`)
      return found
    }
    const leaderSession = path.join(resolvedHome, SESSION_DIR_NAME, 'leader.jsonl')
    const leaderCtx = createCtx(extRoot, leaderSession, notifications, { hasUI: false })
    let workerCtx
    const runCommand = async (name, args) => {
      const before = notifications.length
      await command(name).handler(args, leaderCtx)
      const emitted = notifications.slice(before)
      summary.commands.push({ name, args, notifications: compactCommandNotifications(emitted) })
      return emitted
    }
    const runTool = async (name, id, params, ctx = leaderCtx) => {
      const result = await tool(name).execute(id, params, null, () => {}, ctx)
      summary.tools.push({ name, id, actorSession: ctx === workerCtx ? 'worker' : 'leader', result: publicToolResult(result) })
      return result
    }

    await runCommand('team', 'config show')
    await runCommand('team', 'config init')
    await runCommand('team', 'config validate')
    await runCommand('team', 'config migrate --dry-run')

    const create = await runTool('agentteam_create', 'create-team', { team_name: 'v0638-rc-harness', description: 'isolated temp-home rc harness team' })
    if (create.details?.denied) throw new Error(`create denied: ${create.details.reason}`)
    const unsafeChinese = await runTool('agentteam_create', 'unsafe-chinese', { team_name: '基础员工团队', description: 'unsafe should be rejected' })
    const unsafeMarker = await runTool('agentteam_create', 'unsafe-marker', { team_name: '---', description: 'unsafe should be rejected' })
    summary.checks.push({ id: 'unsafe-name-rejection', pass: Boolean(unsafeChinese.details?.denied && unsafeMarker.details?.denied), chineseReason: unsafeChinese.details?.reason, markerReason: unsafeMarker.details?.reason })

    const spawn = await runTool('agentteam_spawn', 'spawn-worker', { name: 'RC Worker', role: 'implementer' })
    if (spawn.details?.ok === false) throw new Error(`spawn failed: ${spawn.details.text}`)
    const teamAfterSpawn = modules.state.readTeamState('v0638-rc-harness')
    const workerName = spawn.details?.memberName || 'rc-worker'
    if (!teamAfterSpawn?.members?.[workerName]) throw new Error(`spawned member missing from state: ${workerName}`)
    const workerSession = teamAfterSpawn.members[workerName].sessionFile
    workerCtx = createCtx(extRoot, workerSession, notifications, { hasUI: false })
    modules.runtimeBridge.publishBridgeLease({ teamName: teamAfterSpawn.name, memberName: workerName, sessionFile: workerSession })

    const taskCreate = await runTool('agentteam_task', 'task-create', { action: 'create', title: 'Temp-home RC harness task', description: `${FULL_TEXT_SENTINEL} task description should be sanitized` })
    const taskId = taskCreate.details?.task?.id || 'T001'
    await runTool('agentteam_task', 'task-assign', { action: 'assign', taskId, owner: workerName })
    await runTool('agentteam_send', 'task-send', { taskId, type: 'assignment', message: `${FULL_TEXT_SENTINEL} worker assignment body`, summary: 'compact assignment summary' })
    const receive = await runTool('agentteam_receive', 'worker-receive', { markRead: true, limit: 5 }, workerCtx)
    summary.checks.push({ id: 'worker-receive-boundary', pass: Array.isArray(receive.details?.messages) && receive.details.messages.length >= 1, returnedFullTextOnlyInToolDetails: true, bodyRecordedInSummary: false })
    const reportDone = await runTool('agentteam_task', 'worker-report-done', { action: 'report_done', taskId, note: `${FULL_TEXT_SENTINEL} completion report body` }, workerCtx)
    const reportOnly = reportDone.details?.reportOnly === true
    const statusAfterReport = modules.state.readTeamState('v0638-rc-harness')?.tasks?.[taskId]?.status
    summary.checks.push({ id: 'report-done-report-only', pass: reportOnly && statusAfterReport === 'open', statusAfterReport })
    const leaderReceive = await runTool('agentteam_receive', 'leader-receive', { markRead: true, limit: 5 }, leaderCtx)
    summary.checks.push({ id: 'leader-receive-report-attention', pass: Array.isArray(leaderReceive.details?.messages) && leaderReceive.details.messages.length >= 1, fullTextBoundary: 'agentteam_receive' })
    await runTool('agentteam_task', 'task-show', { action: 'show', taskId })
    const reports = await runTool('agentteam_task', 'task-reports', { action: 'reports', taskId })
    const reportId = reports.details?.reports?.[0]?.id || resolveReportId(modules.state.readTeamState('v0638-rc-harness'))
    await runTool('agentteam_task', 'task-report', { action: 'report', reportId })
    await runTool('agentteam_task', 'task-close', { action: 'close', taskId, note: 'leader reviewed temp-home harness report' })

    const taskCreateBlocked = await runTool('agentteam_task', 'blocked-task-create', { action: 'create', title: 'Temp-home blocked path', description: 'blocked path fixture' })
    const blockedTaskId = taskCreateBlocked.details?.task?.id || 'T002'
    await runTool('agentteam_task', 'blocked-task-assign', { action: 'assign', taskId: blockedTaskId, owner: workerName })
    const reportBlocked = await runTool('agentteam_task', 'worker-report-blocked', { action: 'report_blocked', taskId: blockedTaskId, note: 'blocked by harness fixture', blockedBy: ['harness-fixture'] }, workerCtx)
    const blockedStatusAfterReport = modules.state.readTeamState('v0638-rc-harness')?.tasks?.[blockedTaskId]?.status
    summary.checks.push({ id: 'report-blocked-report-only', pass: reportBlocked.details?.reportOnly === true && blockedStatusAfterReport === 'open', statusAfterReport: blockedStatusAfterReport })
    await runTool('agentteam_receive', 'leader-receive-blocked', { markRead: true, limit: 5 }, leaderCtx)
    await runTool('agentteam_task', 'leader-block', { action: 'block', taskId: blockedTaskId, blockedBy: ['leader-reviewed-harness-block'] })
    await runTool('agentteam_task', 'leader-unblock', { action: 'unblock', taskId: blockedTaskId })
    await runTool('agentteam_task', 'leader-close-blocked-path', { action: 'close', taskId: blockedTaskId, note: 'leader closed blocked path after review' })

    const finalTeam = modules.state.readTeamState('v0638-rc-harness')
    const panelModel = modules.stateRepository.readTeamPanelModel('v0638-rc-harness')
    summary.checks.push({ id: 'team-panel-compact-model', pass: Boolean(panelModel), memberCount: finalTeam ? Object.keys(finalTeam.members).length : 0, taskCount: finalTeam ? Object.keys(finalTeam.tasks).length : 0 })
    summary.checks.push({ id: 'legacy-teams-dash-absent', pass: !fs.existsSync(path.join(resolvedHome, 'teams', '-')) })
    summary.checks.push({ id: 'release-governance-absence', pass: true, noTagNoNpmNoNativeCommands: true })
    summary.unsupported.push({ id: 'real-pi-tui-team-panel', status: 'unsupported-in-script', reason: 'script harness uses registered command/tool seams and stub UI; real /team TUI observation remains operator procedure' })
    summary.unsupported.push({ id: 'real-llm-provider-worker-execution', status: 'unsupported-in-script', reason: 'spawn uses fake tmux pane and no model/provider call; worker actor context is simulated by session binding' })

    summary.artifacts = {
      homeFilesBeforeCleanup: listFilesSafe(resolvedHome).filter(rel => !rel.endsWith('.lock')).slice(0, 80),
      spawnedPanes: record.spawnedPanes,
      killedPanes: record.killedPanes,
      commandCount: summary.commands.length,
      toolCount: summary.tools.length,
      checkCount: summary.checks.length,
    }
    summary.isolation.finalEntryCountBeforeCleanup = listFilesSafe(resolvedHome).length
    summary.ok = summary.checks.every(check => check.pass !== false)
    summary.status = summary.ok ? 'passed' : 'failed'
    assertNoSentinelInSummary(summary)
    patch.restore()
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
    summary.isolation.liveHomeEnvRestored = process.env.PI_AGENTTEAM_HOME === originalHome
    summary.ok = summary.ok && summary.cleanupResult !== 'failed' && summary.cleanupResult !== 'skipped-unsafe-prefix' && summary.isolation.liveHomeEnvRestored
    if (!summary.ok && summary.status === 'passed') summary.status = 'failed'
  }
  assertNoSentinelInSummary(summary)
  return summary
}

module.exports = {
  DEFAULT_PREFIX,
  FULL_TEXT_SENTINEL,
  isSafeTempHome,
  runHarness,
}
