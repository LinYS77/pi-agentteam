#!/usr/bin/env node
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const EXT_ROOT = path.resolve(__dirname, '..', '..')
function requireTypeScript() {
  try {
    return require('typescript')
  } catch {
    return require('/home/linyusheng/.nvm/versions/node/v24.9.0/lib/node_modules/typescript')
  }
}
const ts = requireTypeScript()
const IS_INSIDE_TMUX = process.argv.includes('--inside')

let lastStep = 'bootstrap'
let leaderPaneId = ''
let leaderTarget = ''
let tmuxSession = process.env.AGENTTEAM_E2E_TMUX_SESSION || ''
let buildRoot = process.env.AGENTTEAM_E2E_BUILD_ROOT || ''
let distRoot = buildRoot ? path.join(buildRoot, 'dist') : ''
let stubRoot = distRoot ? path.join(distRoot, 'stubs') : ''
let homeRoot = process.env.PI_AGENTTEAM_HOME || ''
let resultFile = process.env.AGENTTEAM_E2E_RESULT_FILE || ''
let leaderSessionFile = buildRoot ? path.join(buildRoot, 'leader.jsonl') : ''
let recoveredLeaderSessionFile = buildRoot ? path.join(buildRoot, 'leader-recovered.jsonl') : ''

function log(message) {
  process.stdout.write(`${message}\n`)
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function writeFile(file, content) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, content, 'utf8')
}

function shellEscape(text) {
  return `'${String(text).replace(/'/g, `'"'"'`)}'`
}

function tmux(args, options = {}) {
  return execFileSync('tmux', args, {
    encoding: 'utf8',
    env: { ...process.env, PI_AGENTTEAM_HOME: homeRoot },
    ...options,
  }).trim()
}

function tmuxNoThrow(args) {
  try {
    return { ok: true, stdout: tmux(args) }
  } catch (error) {
    return {
      ok: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    }
  }
}

function tmuxPaneExists(paneId) {
  if (!paneId) return false
  const result = tmuxNoThrow(['display-message', '-p', '-t', paneId, '#{pane_id}'])
  return result.ok && result.stdout.trim() === paneId
}

function paneWidth(paneId) {
  return Number(tmux(['display-message', '-p', '-t', paneId, '#{pane_width}']))
}

function paneLabel(paneId) {
  const result = tmuxNoThrow(['show-option', '-p', '-v', '-t', paneId, '@agentteam-name'])
  return result.ok ? result.stdout.trim() : ''
}

function sessionAlive() {
  return tmuxNoThrow(['has-session', '-t', tmuxSession]).ok
}

function selectLeaderPane() {
  tmuxNoThrow(['select-pane', '-t', leaderPaneId])
}

function listPanesDebug() {
  const result = tmuxNoThrow([
    'list-panes',
    '-a',
    '-F',
    '#{pane_id}\t#{session_name}:#{window_id}\t#{@agentteam-name}\t#{pane_width}x#{pane_height}\t#{pane_current_command}',
  ])
  return result.ok ? result.stdout : result.stderr
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'data' || entry.name === 'tests' || entry.name === 'node_modules') continue
      walkFiles(full, out)
    } else if (entry.isFile() && full.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

function createStubs() {
  writeFile(
    path.join(stubRoot, 'pi-coding-agent.js'),
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
    path.join(stubRoot, 'pi-tui.js'),
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
const Key = { tab: '__tab__', up: '__up__', down: '__down__', escape: '__esc__', enter: '__enter__' }
function matchesKey(input, key) { return input === key }
module.exports = { visibleWidth, truncateToWidth, Key, matchesKey }
`,
  )

  writeFile(
    path.join(stubRoot, 'typebox.js'),
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
    path.join(stubRoot, 'pi-ai.js'),
    `
const { Type } = require('./typebox.js')
function StringEnum(values, options) { return { kind: 'string-enum', enum: [...values], options: options || {} } }
module.exports = { Type, StringEnum }
`,
  )
}

function mapImport(specifier) {
  if (specifier === '@mariozechner/pi-coding-agent') return path.join(stubRoot, 'pi-coding-agent.js')
  if (specifier === '@mariozechner/pi-ai') return path.join(stubRoot, 'pi-ai.js')
  if (specifier === '@mariozechner/pi-tui') return path.join(stubRoot, 'pi-tui.js')
  if (specifier === 'typebox') return path.join(stubRoot, 'typebox.js')
  return specifier
}

function transpileSources() {
  ensureDir(distRoot)
  for (const sourceFile of walkFiles(EXT_ROOT)) {
    const sourceText = fs.readFileSync(sourceFile, 'utf8')
    let out = ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: sourceFile,
      reportDiagnostics: false,
    }).outputText

    out = out.replace(/require\((['"])([^'"]+)\1\)/g, (_, q, specifier) => {
      return `require(${q}${mapImport(specifier)}${q})`
    })

    const relative = path.relative(EXT_ROOT, sourceFile).replace(/\.ts$/, '.js')
    writeFile(path.join(distRoot, relative), out)
  }
}

function requireDist(rel) {
  return require(path.join(distRoot, rel))
}

function createCtx(sessionFile = leaderSessionFile, cwd = EXT_ROOT) {
  const notifications = []
  return {
    cwd,
    hasUI: false,
    sessionManager: {
      getSessionFile() { return sessionFile },
    },
    ui: {
      notify(message, level) { notifications.push({ message, level }) },
      confirm: async () => true,
      custom: async () => ({ type: 'close' }),
      setStatus() {},
      setWidget() {},
      theme: {
        fg: (_name, text) => String(text ?? ''),
        bg: (_name, text) => String(text ?? ''),
        bold: text => String(text ?? ''),
      },
    },
    __notifications: notifications,
  }
}

function commandDeps(modules) {
  return {
    deleteTeamRuntime: modules.runtime.deleteTeamRuntime,
    invalidateStatus: () => {},
    resetMailboxSyncKey: () => {},
    runMailboxSync: () => {},
  }
}

function captureLeaderPane() {
  lastStep = 'capture leader pane'
  leaderPaneId = tmux(['display-message', '-p', '#{pane_id}'])
  leaderTarget = tmux(['display-message', '-p', '#{session_name}:#{window_id}'])
  assert.ok(leaderPaneId, 'leader pane id should be available inside tmux')
  assert.ok(leaderTarget, 'leader target should be available inside tmux')
}

function createTeamWithLeader(modules, teamName, sessionFile = leaderSessionFile) {
  const team = modules.state.createInitialTeamState({
    teamName,
    leaderSessionFile: sessionFile,
    leaderCwd: EXT_ROOT,
  })
  team.members['team-lead'].paneId = leaderPaneId
  team.members['team-lead'].windowTarget = leaderTarget
  modules.state.writeTeamState(team)
  modules.state.writeSessionContext(sessionFile, { teamName: team.name, memberName: 'team-lead' })
  return team
}

function addTaskForMember(modules, team, memberName) {
  const task = modules.state.createTask(team, {
    title: 'E2E active task',
    description: 'Validate stale member removal returns task to pending',
  })
  task.owner = memberName
  task.status = 'in_progress'
  task.updatedAt = Date.now()
  return task
}

async function createRealWorkerPane(modules, team, workerName) {
  const sessionFile = path.join(buildRoot, `${workerName}.jsonl`)
  const pane = await modules.tmux.createTeammatePane({
    name: workerName,
    preferred: {
      target: leaderTarget,
      leaderPaneId,
    },
    cwd: EXT_ROOT,
    startCommand: 'sleep 3600',
  })
  modules.state.updateTeamState(team.name, latest => {
    latest.members[workerName] = {
      name: workerName,
      role: 'researcher',
      cwd: EXT_ROOT,
      sessionFile,
      status: 'idle',
      paneId: pane.paneId,
      windowTarget: pane.target,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  })
  modules.state.writeSessionContext(sessionFile, {
    teamName: team.name,
    memberName: workerName,
  })
  modules.state.ensureMailbox(team.name, workerName)
  return pane
}

function debugSnapshot() {
  let stateFiles = []
  try {
    stateFiles = fs.existsSync(homeRoot)
      ? execFileSync('find', [homeRoot, '-maxdepth', '5', '-type', 'f', '-print'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
      : []
  } catch {
    stateFiles = []
  }

  const lines = []
  lines.push('--- agentteam e2e debug ---')
  lines.push(`step: ${lastStep}`)
  lines.push(`PI_AGENTTEAM_HOME: ${homeRoot}`)
  lines.push(`tmux session: ${tmuxSession}`)
  lines.push(`leader pane: ${leaderPaneId}`)
  lines.push(`leader target: ${leaderTarget}`)
  lines.push(`panes:\n${listPanesDebug() || '(none)'}`)
  lines.push(`state files:\n${stateFiles.join('\n') || '(none)'}`)
  for (const file of stateFiles.filter(file => file.endsWith('state.json'))) {
    try {
      lines.push(`\n${file}:\n${fs.readFileSync(file, 'utf8')}`)
    } catch {
      // ignore
    }
  }
  lines.push('--- end debug ---')
  return lines.join('\n')
}

function writeResult(result) {
  if (!resultFile) return
  writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`)
}

function writeInsideRunnerScript() {
  const runner = path.join(buildRoot, 'run-inside-e2e.sh')
  const logFile = path.join(buildRoot, 'inside.log')
  writeFile(runner, `#!/bin/sh
export PI_AGENTTEAM_HOME=${shellEscape(homeRoot)}
export AGENTTEAM_E2E_BUILD_ROOT=${shellEscape(buildRoot)}
export AGENTTEAM_E2E_RESULT_FILE=${shellEscape(resultFile)}
export AGENTTEAM_E2E_TMUX_SESSION=${shellEscape(tmuxSession)}
cd ${shellEscape(EXT_ROOT)}
node ${shellEscape(__filename)} --inside > ${shellEscape(logFile)} 2>&1
status=$?
if [ ! -f ${shellEscape(resultFile)} ]; then
  node -e "const fs=require('fs'); const result=process.argv[1]; const log=process.argv[2]; fs.writeFileSync(result, JSON.stringify({ ok:false, error:'inside e2e runner exited without result', exitCode:Number(process.argv[3]||0), log: fs.existsSync(log) ? fs.readFileSync(log,'utf8') : '' }, null, 2) + '\\n')" ${shellEscape(resultFile)} ${shellEscape(logFile)} "$status"
fi
sleep 3600
`)
  fs.chmodSync(runner, 0o755)
  return runner
}

async function runInnerE2E() {
  process.env.PI_AGENTTEAM_HOME = homeRoot
  createStubs()
  transpileSources()
  captureLeaderPane()

  const modules = {
    state: requireDist('state.js'),
    runtime: requireDist('runtime.js'),
    tmux: requireDist('tmux.js'),
    teamActions: requireDist('commands/teamActions.js'),
  }
  const deps = commandDeps(modules)
  const leaderCtx = createCtx()

  lastStep = 'create real teammate pane and assert layout'
  const team = createTeamWithLeader(modules, 'e2e-pane-suite')
  const pane = await createRealWorkerPane(modules, team, 'worker-one')
  assert.ok(tmuxPaneExists(leaderPaneId), 'leader pane should exist after worker creation')
  assert.ok(tmuxPaneExists(pane.paneId), 'worker pane should exist after creation')
  const leaderWidth = paneWidth(leaderPaneId)
  const workerWidth = paneWidth(pane.paneId)
  assert.ok(
    leaderWidth > workerWidth,
    `leader pane should be wider than worker pane; leader=${leaderWidth}, worker=${workerWidth}`,
  )
  const label = paneLabel(pane.paneId)
  assert.ok(label.includes('worker-one'), 'worker pane should have agentteam label')

  lastStep = 'pane lost reconcile'
  const stateBeforeLost = modules.state.readTeamState(team.name)
  const paneBeforeKill = pane.paneId
  tmux(['kill-pane', '-t', paneBeforeKill])
  await new Promise(resolve => setTimeout(resolve, 250))
  assert.equal(tmuxPaneExists(paneBeforeKill), false, 'worker pane should be killed for lost-pane test')
  assert.equal(pane.paneId, paneBeforeKill, 'pane id returned from createTeammatePane should remain stable')
  const changed = modules.runtime.reconcileTeamPanes(stateBeforeLost, { force: true })
  assert.equal(changed, true, 'reconcile should detect killed pane')
  modules.state.updateTeamState(stateBeforeLost.name, () => stateBeforeLost)
  let afterLost = modules.state.readTeamState(team.name)
  assert.equal(afterLost.members['worker-one'].status, 'error')
  assert.equal(afterLost.members['worker-one'].lastWakeReason, 'pane lost')
  assert.equal(afterLost.members['worker-one'].lastError, 'tmux pane disappeared')
  assert.equal(afterLost.members['worker-one'].paneId, undefined)

  lastStep = 'remove stale teammate action'
  const staleSessionFile = afterLost.members['worker-one'].sessionFile
  modules.state.writeSessionContext(staleSessionFile, { teamName: team.name, memberName: 'worker-one' })
  modules.state.pushMailboxMessage(team.name, 'worker-one', {
    from: 'team-lead',
    to: 'worker-one',
    text: 'stale mailbox message',
    type: 'fyi',
  })
  modules.state.updateTeamState(team.name, latest => {
    addTaskForMember(modules, latest, 'worker-one')
  })
  selectLeaderPane()
  modules.teamActions.removeSelectedMember(leaderCtx, deps, team.name, 'worker-one')
  const afterRemove = modules.state.readTeamState(team.name)
  assert.ok(!afterRemove.members['worker-one'], 'stale member should be removed')
  assert.equal(modules.state.readSessionContext(staleSessionFile).teamName, null, 'stale member session binding should be cleared')
  assert.equal(fs.existsSync(modules.state.getMailboxPath(team.name, 'worker-one')), false, 'stale member mailbox should be removed')
  assert.ok(Object.values(afterRemove.tasks).some(task => task.status === 'pending' && !task.owner), 'owned active task should return to pending')
  assert.ok(tmuxPaneExists(leaderPaneId), 'leader pane should remain alive after remove member')

  lastStep = 'recover selected team as current leader'
  modules.state.updateTeamState(team.name, latest => {
    latest.leaderSessionFile = path.join(buildRoot, 'old-leader.jsonl')
    latest.members['team-lead'].sessionFile = path.join(buildRoot, 'old-leader.jsonl')
    latest.members['team-lead'].paneId = undefined
    latest.members['team-lead'].windowTarget = undefined
    latest.members['stale-current-pane'] = {
      name: 'stale-current-pane',
      role: 'researcher',
      cwd: EXT_ROOT,
      sessionFile: path.join(buildRoot, 'stale-current-pane.jsonl'),
      status: 'error',
      paneId: leaderPaneId,
      windowTarget: leaderTarget,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  })
  const recoverCtx = createCtx(recoveredLeaderSessionFile, EXT_ROOT)
  selectLeaderPane()
  const recovered = modules.teamActions.recoverTeamAsCurrentLeader(recoverCtx, deps, team.name)
  assert.ok(recovered, 'recover should return updated team')
  const afterRecover = modules.state.readTeamState(team.name)
  assert.equal(afterRecover.leaderSessionFile, recoveredLeaderSessionFile)
  assert.equal(afterRecover.members['team-lead'].sessionFile, recoveredLeaderSessionFile)
  assert.equal(afterRecover.members['team-lead'].paneId, leaderPaneId)
  assert.equal(afterRecover.members['team-lead'].windowTarget, leaderTarget)
  assert.ok(!afterRecover.members['stale-current-pane'], 'recover should remove stale worker binding pointing at current pane')
  assert.equal(modules.state.readSessionContext(recoveredLeaderSessionFile).teamName, team.name)
  assert.ok(tmuxPaneExists(leaderPaneId), 'leader pane should remain alive after recover')

  lastStep = 'delete selected team action'
  const deleteTeam = createTeamWithLeader(modules, 'e2e-delete-suite')
  const deletePane = await createRealWorkerPane(modules, deleteTeam, 'delete-worker')
  selectLeaderPane()
  modules.teamActions.deleteSelectedTeam(leaderCtx, deps, deleteTeam.name)
  assert.equal(modules.state.readTeamState(deleteTeam.name), null, 'deleted team state should be gone')
  assert.equal(tmuxPaneExists(deletePane.paneId), false, 'delete should kill worker pane')
  assert.ok(tmuxPaneExists(leaderPaneId), 'delete should keep current leader pane alive')
  assert.equal(paneLabel(leaderPaneId), '', 'delete should clear current leader pane label')
  assert.ok(sessionAlive(), 'tmux session should remain alive after delete')

  const oldLeaderDeleteTeam = createTeamWithLeader(modules, 'e2e-delete-old-leader-suite')
  const oldLeaderPane = await modules.tmux.createTeammatePane({
    name: 'old-leader-delete-pane',
    preferred: { target: leaderTarget, leaderPaneId },
    cwd: EXT_ROOT,
    startCommand: 'sleep 3600',
  })
  modules.state.updateTeamState(oldLeaderDeleteTeam.name, latest => {
    latest.members['team-lead'].paneId = oldLeaderPane.paneId
    latest.members['team-lead'].windowTarget = oldLeaderPane.target
  })
  selectLeaderPane()
  modules.teamActions.deleteSelectedTeam(leaderCtx, deps, oldLeaderDeleteTeam.name)
  assert.equal(tmuxPaneExists(oldLeaderPane.paneId), false, 'delete should kill non-current leader pane')
  assert.ok(tmuxPaneExists(leaderPaneId), 'delete should still keep current leader pane alive')

  lastStep = 'cleanup all action'
  const cleanupA = createTeamWithLeader(modules, 'e2e-cleanup-a')
  const cleanupB = createTeamWithLeader(modules, 'e2e-cleanup-b')
  const cleanupPaneA = await createRealWorkerPane(modules, cleanupA, 'cleanup-worker-a')
  const cleanupPaneB = await createRealWorkerPane(modules, cleanupB, 'cleanup-worker-b')
  const cleanupOldLeaderPane = await modules.tmux.createTeammatePane({
    name: 'old-leader-cleanup-pane',
    preferred: { target: leaderTarget, leaderPaneId },
    cwd: EXT_ROOT,
    startCommand: 'sleep 3600',
  })
  modules.state.updateTeamState(cleanupA.name, latest => {
    latest.members['team-lead'].paneId = cleanupOldLeaderPane.paneId
    latest.members['team-lead'].windowTarget = cleanupOldLeaderPane.target
  })
  const orphanPane = await modules.tmux.createTeammatePane({
    name: 'orphan-worker',
    preferred: { target: leaderTarget, leaderPaneId },
    cwd: EXT_ROOT,
    startCommand: 'sleep 3600',
  })
  assert.ok(tmuxPaneExists(orphanPane.paneId), 'orphan pane should exist before cleanup')
  selectLeaderPane()
  modules.teamActions.cleanupAllAgentTeamData(leaderCtx, deps)
  assert.equal(modules.state.readTeamState(team.name), null, 'cleanup should delete original team')
  assert.equal(modules.state.readTeamState(cleanupA.name), null, 'cleanup should delete cleanup team A')
  assert.equal(modules.state.readTeamState(cleanupB.name), null, 'cleanup should delete cleanup team B')
  assert.equal(tmuxPaneExists(cleanupPaneA.paneId), false, 'cleanup should kill worker pane A')
  assert.equal(tmuxPaneExists(cleanupPaneB.paneId), false, 'cleanup should kill worker pane B')
  assert.equal(tmuxPaneExists(cleanupOldLeaderPane.paneId), false, 'cleanup should kill non-current leader pane')
  assert.equal(tmuxPaneExists(orphanPane.paneId), false, 'cleanup should kill orphan agentteam pane')
  assert.ok(tmuxPaneExists(leaderPaneId), 'cleanup should keep current leader pane alive')
  assert.equal(paneLabel(leaderPaneId), '', 'cleanup should clear current leader pane label')
  assert.ok(sessionAlive(), 'tmux session should remain alive after cleanup')
  assert.equal(modules.state.listTeams().length, 0, 'cleanup should leave no team state')

  writeResult({ ok: true })
}

async function runOuterDriver() {
  try {
    execFileSync('tmux', ['-V'], { encoding: 'utf8' })
  } catch {
    throw new Error('tmux is required for npm run test:e2e')
  }

  const runId = `${Date.now()}-${process.pid}`
  buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-e2e-build-'))
  distRoot = path.join(buildRoot, 'dist')
  stubRoot = path.join(distRoot, 'stubs')
  homeRoot = path.join(buildRoot, 'agentteam-home')
  resultFile = path.join(buildRoot, 'result.json')
  tmuxSession = `agentteam-e2e-${runId}`

  const runner = writeInsideRunnerScript()

  try {
    tmux(['new-session', '-d', '-s', tmuxSession, '-x', '160', '-y', '40', '-n', 'agentteam-e2e', runner])
    const deadline = Date.now() + 180000
    while (Date.now() < deadline) {
      if (fs.existsSync(resultFile)) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    if (!fs.existsSync(resultFile)) {
      const panes = listPanesDebug()
      throw new Error(`timed out waiting for tmux e2e result\n${panes}`)
    }
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
    if (!result.ok) {
      const error = result.stack || result.error || 'unknown e2e failure'
      throw new Error(`${error}\n${result.debug || ''}`)
    }
    log('✅ tmux e2e smoke passed')
  } finally {
    tmuxNoThrow(['kill-session', '-t', tmuxSession])
    fs.rmSync(buildRoot, { recursive: true, force: true })
  }
}

async function main() {
  if (IS_INSIDE_TMUX) {
    if (!buildRoot || !homeRoot || !resultFile || !tmuxSession) {
      throw new Error('missing required AGENTTEAM_E2E_* environment for --inside mode')
    }
    try {
      await runInnerE2E()
    } catch (error) {
      writeResult({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        lastStep,
        debug: debugSnapshot(),
      })
      process.exitCode = 1
    }
    return
  }
  await runOuterDriver()
}

main().catch(error => {
  console.error('❌ tmux e2e smoke failed:', error)
  process.exitCode = 1
})
