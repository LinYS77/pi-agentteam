#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { createStateBundle } = require('./stateBundle.cjs')

const DEFAULT_EXT_ROOT = path.resolve(__dirname, '..')
const EXT_ROOT = process.env.AGENTTEAM_EXT_ROOT
  ? path.resolve(process.env.AGENTTEAM_EXT_ROOT)
  : DEFAULT_EXT_ROOT
function requireTypeScript() {
  try {
    return require('typescript')
  } catch {
    return require('/home/linyusheng/.nvm/versions/node/v24.9.0/lib/node_modules/typescript')
  }
}
const ts = requireTypeScript()

const BUILD_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-test-build-'))
const DIST_ROOT = path.join(BUILD_ROOT, 'dist')
const STUB_ROOT = path.join(DIST_ROOT, 'stubs')
process.env.PI_AGENTTEAM_HOME = path.join(BUILD_ROOT, 'agentteam-home')
process.env.TMUX = process.env.TMUX || '/tmp/agentteam-test-tmux'


function log(msg) {
  process.stdout.write(`${msg}\n`)
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function walkFiles(root, out = []) {
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

function writeFile(p, content) {
  ensureDir(path.dirname(p))
  fs.writeFileSync(p, content, 'utf8')
}

function createStubs() {
  writeFile(
    path.join(STUB_ROOT, 'pi-coding-agent.js'),
    `
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
`,
  )

  writeFile(
    path.join(STUB_ROOT, 'pi-tui.js'),
    `
function visibleWidth(text) {
  const raw = String(text || '')
  const stripped = raw.replace(/\\u001b\\[[0-9;]*m/g, '')
  return [...stripped].length
}

function truncateToWidth(text, width) {
  const safe = Math.max(0, Number.isFinite(width) ? width : 0)
  const raw = String(text || '')
  let out = ''
  let count = 0
  for (const ch of [...raw]) {
    if (count >= safe) break
    out += ch
    count += 1
  }
  return out
}

class Text {
  constructor(text, x = 0, y = 0) {
    this.text = String(text || '')
    this.x = x
    this.y = y
  }
}

class Box {
  constructor() {
    this.children = []
  }
  addChild(child) {
    this.children.push(child)
  }
}

const Key = {
  tab: '__tab__',
  up: '__up__',
  down: '__down__',
  left: '__left__',
  right: '__right__',
  escape: '__esc__',
  enter: '__enter__',
  shift: key => 'shift+' + key,
}

function matchesKey(input, key) {
  return input === key
}

module.exports = {
  visibleWidth,
  truncateToWidth,
  Text,
  Box,
  Key,
  matchesKey,
}
`,
  )

  writeFile(
    path.join(STUB_ROOT, 'typebox.js'),
    `
const Type = {
  Object: o => ({ kind: 'object', o }),
  String: o => ({ kind: 'string', o }),
  Optional: v => ({ kind: 'optional', v }),
  Union: v => ({ kind: 'union', v }),
  Literal: v => ({ kind: 'literal', v }),
  Array: (v, o) => ({ kind: 'array', v, o }),
  Number: o => ({ kind: 'number', o }),
  Boolean: o => ({ kind: 'boolean', o }),
  Record: (k, v) => ({ kind: 'record', k, v }),
  Unknown: () => ({ kind: 'unknown' }),
}
module.exports = { Type }
`,
  )

  writeFile(
    path.join(STUB_ROOT, 'pi-ai.js'),
    `
const { Type } = require('./typebox.js')
function StringEnum(values, options) {
  return { kind: 'string-enum', enum: [...values], options: options || {} }
}
module.exports = { Type, StringEnum }
`,
  )
}

function mapImport(specifier) {
  if (specifier === '@earendil-works/pi-coding-agent') return path.join(STUB_ROOT, 'pi-coding-agent.js')
  if (specifier === '@earendil-works/pi-ai') return path.join(STUB_ROOT, 'pi-ai.js')
  if (specifier === '@earendil-works/pi-tui') return path.join(STUB_ROOT, 'pi-tui.js')
  if (specifier === 'typebox') return path.join(STUB_ROOT, 'typebox.js')
  return specifier
}

function transpile() {
  ensureDir(DIST_ROOT)
  for (const agentFile of fs.readdirSync(path.join(EXT_ROOT, 'agents')).filter(name => name.endsWith('.md'))) {
    const sourceFile = path.join(EXT_ROOT, 'agents', agentFile)
    const target = path.join(DIST_ROOT, 'agents', agentFile)
    writeFile(target, fs.readFileSync(sourceFile, 'utf8'))
  }
  const configExamplePath = path.join(EXT_ROOT, 'config.example.json')
  if (fs.existsSync(configExamplePath)) {
    writeFile(path.join(DIST_ROOT, 'config.example.json'), fs.readFileSync(configExamplePath, 'utf8'))
  }

  const files = walkFiles(EXT_ROOT)
  for (const sourceFile of files) {
    let sourceText = fs.readFileSync(sourceFile, 'utf8')
    sourceText = sourceText.replace(/import\.meta\.url/g, `require('node:url').pathToFileURL(__filename).href`)
    let out = ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: sourceFile,
      reportDiagnostics: false,
    }).outputText

    out = out.replace(/require\((['"])([^'"]+)\1\)/g, (_, q, s) => {
      return `require(${q}${mapImport(s)}${q})`
    })

    const relative = path.relative(EXT_ROOT, sourceFile).replace(/\.ts$/, '.js')
    const target = path.join(DIST_ROOT, relative)
    writeFile(target, out)
  }
}

function createFakeTheme() {
  const passthrough = v => String(v ?? '')
  return {
    fg: (_name, text) => String(text ?? ''),
    bg: (_name, text) => String(text ?? ''),
    bold: passthrough,
  }
}

function createStubPi() {
  const tools = new Map()
  const commands = new Map()
  const hooks = new Map()
  const renderers = new Map()
  const messages = []
  let idle = true

  return {
    registerTool(def) { tools.set(def.name, def) },
    registerCommand(name, def) { commands.set(name, def) },
    on(name, handler) {
      const list = hooks.get(name) || []
      list.push(handler)
      hooks.set(name, list)
    },
    registerMessageRenderer(type, renderer) { renderers.set(type, renderer) },
    isIdle() { return idle },
    setIdle(value) { idle = Boolean(value) },
    hasPendingMessages() { return false },
    sendMessage(message, options) { messages.push({ ...message, options: options || {} }) },
    sendUserMessage(content, options) {
      messages.push({ customType: 'user-message', content, details: options || {} })
    },
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
    sessionManager: {
      getSessionFile() { return sessionFile },
    },
    isIdle() { return true },
    hasPendingMessages() { return false },
    ui: {
      notify(message, level) {
        notifications.push({ message, level })
      },
      setStatus() {},
      setWidget() {},
      confirm: async () => true,
      custom: async callback => {
        let doneValue
        const done = value => { doneValue = value }
        const panel = await callback({ requestRender() {}, terminal: { rows: 40, columns: 120 } }, createFakeTheme(), {}, done)
        if (doneValue === undefined && panel && typeof panel.handleInput === 'function') {
          panel.handleInput('__esc__')
        }
        return doneValue
      },
      theme: createFakeTheme(),
    },
  }
}

function assertContains(text, expected, msg) {
  assert.ok(String(text).includes(expected), msg || `Expected text to contain: ${expected}\nActual: ${text}`)
}

function setupRuntimePatches(modules) {
  const sentPrompts = []
  const clearedPaneLabels = []
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
  }

  const livePanes = new Set(['%leader'])
  let nextPane = 10

  tmux.captureCurrentPaneBinding = () => ({ paneId: '%leader', target: 'test:@1' })
  tmux.inspectPane = paneId => livePanes.has(paneId)
    ? { paneId, exists: true, currentCommand: 'pi', inMode: false, mode: undefined, copyMode: false }
    : { paneId, exists: false, error: `tmux pane ${paneId} not found` }
  tmux.resolvePaneBinding = paneId => (livePanes.has(paneId) ? { paneId, target: 'test:@1' } : null)
  tmux.paneExists = paneId => livePanes.has(paneId)
  tmux.createTeammatePane = async input => {
    const paneId = `%${nextPane++}`
    livePanes.add(paneId)
    return { paneId, target: 'test:@1', input }
  }
  tmux.waitForPaneAppStart = async () => true
  const originalCreateTeammatePaneForBridge = tmux.createTeammatePane
  tmux.createTeammatePane = async input => {
    const pane = await originalCreateTeammatePaneForBridge(input)
    if (input?.name && process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE !== '0') {
      const state = modules.state
      queueMicrotask(() => {
        for (const team of state.listTeams()) {
          const member = team.members[input.name]
          if (!member?.sessionFile) continue
          modules.runtimeBridge.publishBridgeLease({
            teamName: team.name,
            memberName: input.name,
            sessionFile: member.sessionFile,
          })
        }
      })
    }
    return pane
  }
  tmux.syncPaneLabelsForTeam = () => {}
  tmux.clearPaneLabelsForTeam = () => {}
  tmux.clearPaneLabelSync = paneId => { clearedPaneLabels.push(paneId) }
  tmux.ensureSwarmWindow = async () => ({ session: 'test', window: '@1', target: 'test:@1', leaderPaneId: '%leader' })
  tmux.killPane = paneId => { livePanes.delete(paneId) }
  tmux.listAgentTeamPanes = () => []

  const deps = {
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
    teamState: modules.appStatePorts.fileBackedTeamStatePort,
    taskMutations: modules.appStatePorts.fileBackedTaskMutationPort,
    taskHistory: modules.appStatePorts.fileBackedTaskHistoryQueryPort,
    mailboxRepository: modules.mailboxPorts.fileBackedMailboxRepositoryPort,
    requestWorkerDelivery: modules.runtime.requestWorkerDelivery,
    requestLeaderAttentionIfNeeded: modules.runtime.requestLeaderAttentionIfNeeded,
    invalidateStatus: () => {},
  }

  function withOutboxHandlers(overrides = {}) {
    const hasOutboxRunnerOverride = Object.prototype.hasOwnProperty.call(overrides, 'outboxRunner') && overrides.outboxRunner !== deps.outboxRunner
    const base = { ...deps, ...overrides }
    const outboxHandlers = modules.outboxEffectHandlers.createFileBackedOutboxEffectHandlers(base)
    const resolved = {
      ...base,
      outboxStore: base.outboxStore ?? modules.outboxStorePort.fileBackedOutboxStorePort,
      teamState: base.teamState ?? modules.appStatePorts.fileBackedTeamStatePort,
      taskMutations: base.taskMutations ?? modules.appStatePorts.fileBackedTaskMutationPort,
      taskHistory: base.taskHistory ?? modules.appStatePorts.fileBackedTaskHistoryQueryPort,
      mailboxRepository: base.mailboxRepository ?? modules.mailboxPorts.fileBackedMailboxRepositoryPort,
      outboxHandlers,
    }
    return {
      ...resolved,
      outboxRunner: hasOutboxRunnerOverride ? base.outboxRunner : {
        runOnce(input) {
          return modules.effectRunner.runOutboxOnce(input, resolved)
        },
      },
    }
  }

  Object.assign(deps, withOutboxHandlers())

  return {
    sentPrompts,
    livePanes,
    clearedPaneLabels,
    deps,
    withOutboxHandlers,
    restore() {
      Object.assign(tmux, original)
    },
  }
}

function loadModules() {
  const req = rel => require(path.join(DIST_ROOT, rel))
  const state = createStateBundle(req)
  return {
    index: req('index.js'),
    state,
    tmux: req('adapters/tmux/index.js'),
    agents: req('agents.js'),
    protocol: req('protocol.js'),
    orchestration: req('orchestration.js'),
    runtime: req('adapters/runtime/session.js'),
    runtimeBridge: req('adapters/bridge/index.js'),
    runtimeDelivery: req('adapters/bridge/delivery.js'),
    deliveryPolicy: req('deliveryPolicy.js'),
    runtimePanes: req('adapters/tmux/teamPanes.js'),
    runtimeRules: req('adapters/runtime/rules.js'),
    bridgeStore: req('state/bridgeStore.js'),
    deliveryStore: req('state/deliveryStore.js'),
    lifecycleService: req('hooks/lifecycleService.js'),
    effectRunner: req('app/effectRunner.js'),
    workerTurnPrompt: req('workerTurnPrompt.js'),
    runtimeService: req('adapters/runtime/service.js'),
    leaderProjectionService: req('runtime/leaderProjectionService.js'),
    leaderAttention: req('runtime/leaderAttention.js'),
    messageRouting: req('app/messageRouting.js'),
    outboxStorePort: req('adapters/runtime/outboxStorePort.js'),
    outboxEffectHandlers: req('adapters/runtime/outboxEffectHandlers.js'),
    appStatePorts: req('adapters/runtime/appStatePorts.js'),
    mailboxPorts: req('adapters/runtime/mailboxPorts.js'),
    shared: req('tools/shared.js'),
    types: req('types.js'),
    workerSpawnService: req('tools/workerSpawnService.js'),
    viewModel: req('teamPanel/viewModel.js'),
    panelDataSource: req('teamPanel/dataSource.js'),
    layout: req('teamPanel/layout.js'),
    tmuxLabels: req('tmux/labels.js'),
  }
}

function loadSuites() {
  const suitesDir = path.join(__dirname, 'suites')
  const preferredOrder = [
    'core-vocabulary.cjs',
    'core-task-reducer.cjs',
    'core-message-policy.cjs',
    'core-worker-health.cjs',
    'package-install-smoke.cjs',
    'tools-state.cjs',
    'commands.cjs',
    'protocol-decisions-orchestration.cjs',
    'panel-renderer.cjs',
    'public-output-leak-guards.cjs',
    'outbox-store-runner.cjs',
    'data-layout-vnext.cjs',
  ]
  const existing = new Set(
    fs.readdirSync(suitesDir).filter(name => name.endsWith('.cjs')),
  )
  const ordered = preferredOrder.filter(name => existing.has(name))
  for (const file of [...existing].sort((a, b) => a.localeCompare(b))) {
    if (!ordered.includes(file)) ordered.push(file)
  }
  return ordered.map(file => require(path.join(suitesDir, file)))
}

async function main() {
  createStubs()
  transpile()

  try {
    const modules = loadModules()
    const pi = createStubPi()
    modules.index.default(pi)

    const notifications = []
    const leaderCtx = createCtx('/tmp/project-under-test', '/tmp/leader-session.jsonl', notifications)

    const patches = setupRuntimePatches(modules)
    try {
      const helpers = {
        createCtx,
        createFakeTheme,
        assertContains,
        requireDist: rel => require(path.join(DIST_ROOT, rel)),
        createBridgeDeliveryRequest: require(path.join(DIST_ROOT, 'runtime/bridgeRequest.js')).createBridgeDeliveryRequest,
        readSource: rel => fs.readFileSync(path.join(EXT_ROOT, rel), 'utf8'),
        distRoot: DIST_ROOT,
        extRoot: EXT_ROOT,
        stubRoot: STUB_ROOT,
        visibleWidth: require(path.join(STUB_ROOT, 'pi-tui.js')).visibleWidth,
        tuiKeys: require(path.join(STUB_ROOT, 'pi-tui.js')).Key,
      }
      const toolsSuite = require(path.join(__dirname, 'suites', 'tools-state.cjs'))
      const env = {
        pi,
        modules,
        leaderCtx,
        notifications,
        sentPrompts: patches.sentPrompts,
        patches,
        helpers,
        toolsSuite,
        publishAllWorkerBridges() {
          for (const team of modules.state.listTeams()) {
            for (const member of Object.values(team.members)) {
              if (!member || member.name === modules.types.TEAM_LEAD || !member.sessionFile) continue
              modules.runtimeBridge.publishBridgeLease({
                teamName: team.name,
                memberName: member.name,
                sessionFile: member.sessionFile,
              })
            }
          }
        },
      }

      for (const suite of loadSuites()) {
        log(`▶ suite: ${suite.name}`)
        await suite.run(env)
        log(`✅ ${suite.name} passed`)
      }
    } finally {
      patches.restore()
    }

    log('✅ ALL agentteam tests passed')
  } finally {
    fs.rmSync(BUILD_ROOT, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error('❌ agentteam tests failed:', error)
  process.exitCode = 1
})
