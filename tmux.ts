import { execFileSync } from 'node:child_process'
import type { TeamMember, TeamState } from './types.js'

export type PaneBinding = {
  paneId: string
  target: string
}

export type AgentTeamPaneInfo = {
  paneId: string
  target: string
  label: string
  currentCommand: string
}

const TMUX = 'tmux'
const SWARM_SESSION = 'pi-agentteam'
const SWARM_WINDOW = 'agentteam'
const SHELL_COMMANDS = new Set(['bash', 'zsh', 'fish', 'sh'])

function runTmux(args: string[], input?: string): string {
  return execFileSync(TMUX, args, {
    encoding: 'utf8',
    input,
  }).trim()
}

function runTmuxNoThrow(args: string[], input?: string): { ok: boolean; stdout: string; stderr?: string } {
  try {
    return { ok: true, stdout: runTmux(args, input) }
  } catch (error) {
    return {
      ok: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    }
  }
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'"'"'`)}'`
}

export function shellEscapeArg(text: string): string {
  return shellQuote(text)
}

export function isInsideTmux(): boolean {
  return Boolean(process.env.TMUX)
}

export function ensureTmuxAvailable(): void {
  runTmux(['-V'])
}

export function paneExists(paneId: string): boolean {
  if (!paneId) return false
  return runTmuxNoThrow(['display-message', '-p', '-t', paneId, '#{pane_id}']).ok
}

export function resolvePaneBinding(paneId: string): PaneBinding | null {
  if (!paneExists(paneId)) return null
  const paneResult = runTmuxNoThrow(['display-message', '-p', '-t', paneId, '#{pane_id}'])
  const targetResult = runTmuxNoThrow(['display-message', '-p', '-t', paneId, '#{session_name}:#{window_id}'])
  if (!paneResult.ok || !paneResult.stdout || !targetResult.ok || !targetResult.stdout) {
    return null
  }
  return {
    paneId: paneResult.stdout,
    target: targetResult.stdout,
  }
}

function windowExists(target: string): boolean {
  if (!target) return false
  return runTmuxNoThrow(['list-panes', '-t', target, '-F', '#{pane_id}']).ok
}

function firstPaneInWindow(target: string): string | null {
  const result = runTmuxNoThrow(['list-panes', '-t', target, '-F', '#{pane_id}'])
  if (!result.ok || !result.stdout) return null
  return result.stdout.split('\n').filter(Boolean)[0] ?? null
}

function markWindowAsAgentTeam(target: string): void {
  if (!windowExists(target)) return
  runTmuxNoThrow(['set-option', '-w', '-t', target, 'automatic-rename', 'off'])
  runTmuxNoThrow(['set-option', '-w', '-t', target, 'allow-rename', 'off'])
  runTmuxNoThrow(['set-option', '-w', '-t', target, '@agentteam-window', '1'])
}

function findAgentTeamWindowTarget(sessionName: string): string | null {
  const result = runTmuxNoThrow(['list-windows', '-t', sessionName, '-F', '#{window_id}\t#{@agentteam-window}'])
  if (!result.ok || !result.stdout) return null
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue
    const [windowId, marker] = line.split('\t')
    if (marker === '1' && windowId) {
      return `${sessionName}:${windowId}`
    }
  }
  return null
}

export function ensureSwarmWindow(preferred?: { target?: string; leaderPaneId?: string }): { session: string; window: string; target: string; leaderPaneId: string } {
  ensureTmuxAvailable()

  if (isInsideTmux()) {
    const preferredBinding = preferred?.leaderPaneId ? resolvePaneBinding(preferred.leaderPaneId) : null
    const preferredTarget = preferredBinding?.target ?? (preferred?.target && windowExists(preferred.target) ? preferred.target : null)
    const target = preferredTarget ?? runTmux(['display-message', '-p', '#{session_name}:#{window_id}'])
    const leaderPaneId = preferredBinding?.paneId ?? firstPaneInWindow(target) ?? runTmux(['display-message', '-p', '#{pane_id}'])
    markWindowAsAgentTeam(target)
    refreshWindowPaneLabels(target)
    return {
      session: target.split(':')[0]!,
      window: target.split(':')[1]!,
      target,
      leaderPaneId,
    }
  }

  const hasSession = runTmuxNoThrow(['has-session', '-t', SWARM_SESSION]).ok
  if (!hasSession) {
    runTmux(['new-session', '-d', '-s', SWARM_SESSION, '-n', SWARM_WINDOW])
    markWindowAsAgentTeam(`${SWARM_SESSION}:${SWARM_WINDOW}`)
  }

  let initialTarget = findAgentTeamWindowTarget(SWARM_SESSION)
  if (!initialTarget) {
    runTmux(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW])
    const result = runTmux(['list-windows', '-t', SWARM_SESSION, '-F', '#{window_id}\t#{window_name}'])
      .split('\n')
      .map(line => line.split('\t'))
      .find(parts => parts[1] === SWARM_WINDOW)
    if (!result?.[0]) {
      throw new Error('Failed to locate agentteam tmux window after creation')
    }
    initialTarget = `${SWARM_SESSION}:${result[0]}`
    markWindowAsAgentTeam(initialTarget)
  }

  const panes = runTmux(['list-panes', '-t', initialTarget, '-F', '#{pane_id}']).split('\n').filter(Boolean)
  const leaderPaneId = panes[0]!
  const binding = resolvePaneBinding(leaderPaneId)
  const target = binding?.target ?? `${SWARM_SESSION}:${runTmux(['display-message', '-p', '-t', leaderPaneId, '#{window_id}'])}`
  markWindowAsAgentTeam(target)
  refreshWindowPaneLabels(target)
  return { session: target.split(':')[0]!, window: target.split(':')[1]!, target, leaderPaneId }
}

function setPaneLabel(paneId: string, label: string): void {
  runTmuxNoThrow(['set-option', '-p', '-t', paneId, '@agentteam-name', label])
  runTmuxNoThrow(['select-pane', '-t', paneId, '-T', label])
}

function clearPaneLabel(paneId: string): void {
  runTmuxNoThrow(['set-option', '-up', '-t', paneId, '@agentteam-name'])
}

export function captureCurrentPaneBinding(): { paneId: string; target: string } | null {
  if (!isInsideTmux()) return null
  const paneIdResult = runTmuxNoThrow(['display-message', '-p', '#{pane_id}'])
  const targetResult = runTmuxNoThrow(['display-message', '-p', '#{session_name}:#{window_id}'])
  if (!paneIdResult.ok || !paneIdResult.stdout || !targetResult.ok || !targetResult.stdout) {
    return null
  }
  return {
    paneId: paneIdResult.stdout,
    target: targetResult.stdout,
  }
}

function targetForPaneId(paneId: string): string | null {
  const result = runTmuxNoThrow(['display-message', '-p', '-t', paneId, '#{session_name}:#{window_id}'])
  return result.ok && result.stdout ? result.stdout : null
}

function roleIcon(member: TeamMember): string {
  if (member.role === 'planner') return '🧭'
  if (member.role === 'researcher') return '🔎'
  if (member.role === 'implementer') return '🛠️'
  return '👤'
}

function statusWord(member: TeamMember): string {
  if (member.status === 'running') return 'running'
  if (member.status === 'queued') return 'queued'
  if (member.status === 'error') return 'error'
  return 'idle'
}

function compactCounts(items: string[]): string {
  return items.filter(Boolean).join(' · ')
}

function formatMemberPaneLabel(member: TeamMember): string {
  const role = member.role === 'leader' ? 'leader' : member.role
  return `${roleIcon(member)} ${member.name} · ${role} · ${statusWord(member)}`
}

function formatLeaderPaneLabel(team: TeamState): string {
  const teammates = Object.values(team.members).filter(member => member.name !== 'team-lead')
  const running = teammates.filter(member => member.status === 'running').length
  const queued = teammates.filter(member => member.status === 'queued').length
  const idle = teammates.filter(member => member.status === 'idle').length
  const error = teammates.filter(member => member.status === 'error').length
  const tasks = Object.values(team.tasks)
  const pending = tasks.filter(task => task.status === 'pending').length
  const active = tasks.filter(task => task.status === 'in_progress').length
  const blocked = tasks.filter(task => task.status === 'blocked').length
  const taskBits = compactCounts([
    pending > 0 ? `${pending} pending` : '',
    active > 0 ? `${active} active` : '',
    blocked > 0 ? `${blocked} blocked` : '',
  ])
  const teammateBits = compactCounts([
    running > 0 ? `${running} running` : '',
    queued > 0 ? `${queued} queued` : '',
    idle > 0 && running === 0 && queued === 0 ? `${idle} idle` : '',
    error > 0 ? `${error} error` : '',
  ])
  const bits = compactCounts([
    teammateBits ? `👥 ${teammateBits}` : '',
    taskBits ? `📝 ${taskBits}` : '',
  ])
  return bits ? `👑 leader · ${bits}` : '👑 leader · ready'
}

function refreshWindowPaneLabels(target: string): void {
  if (!windowExists(target)) return
  runTmuxNoThrow(['set-option', '-w', '-t', target, 'pane-border-status', 'top'])
  runTmuxNoThrow(['set-option', '-w', '-t', target, 'pane-border-format', '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'])
}

export function createTeammatePane(input: {
  name: string
  preferred?: { target?: string; leaderPaneId?: string }
  cwd?: string
  startCommand?: string
}): { paneId: string; target: string } {
  const swarm = ensureSwarmWindow(input.preferred)
  const panes = runTmux(['list-panes', '-t', swarm.target, '-F', '#{pane_id}']).split('\n').filter(Boolean)
  const hasLeaderLayout = isInsideTmux()

  const commandArgs = input.startCommand ? [input.startCommand] : []
  const cwdArgs = input.cwd ? ['-c', input.cwd] : []

  let paneId = ''
  if (hasLeaderLayout && panes.length === 1) {
    paneId = runTmux(['split-window', '-t', swarm.leaderPaneId, '-h', '-l', '70%', ...cwdArgs, '-P', '-F', '#{pane_id}', ...commandArgs])
    runTmux(['select-layout', '-t', swarm.target, 'main-vertical'])
    runTmux(['resize-pane', '-t', swarm.leaderPaneId, '-x', '30%'])
  } else {
    const splitTarget = panes[panes.length - 1]!
    paneId = runTmux(['split-window', '-t', splitTarget, '-v', ...cwdArgs, '-P', '-F', '#{pane_id}', ...commandArgs])
    runTmux(['select-layout', '-t', swarm.target, hasLeaderLayout ? 'main-vertical' : 'tiled'])
    if (hasLeaderLayout) {
      runTmux(['resize-pane', '-t', swarm.leaderPaneId, '-x', '30%'])
    }
  }

  setPaneLabel(paneId, input.name)
  refreshWindowPaneLabels(swarm.target)
  return { paneId, target: swarm.target }
}

export function waitForPaneAppStart(paneId: string, timeoutMs = 15000): boolean {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const current = runTmuxNoThrow(['display-message', '-p', '-t', paneId, '#{pane_current_command}'])
    if (current.ok) {
      const command = current.stdout.trim()
      if (command && !SHELL_COMMANDS.has(command)) return true
    }
    sleep(200)
  }
  return false
}

export function pasteTextToPane(paneId: string, text: string): void {
  runTmux(['set-buffer', '--', text])
  runTmux(['paste-buffer', '-d', '-t', paneId])
}

export function sendPromptToPane(paneId: string, text: string): void {
  pasteTextToPane(paneId, text)
  runTmux(['send-keys', '-t', paneId, 'Enter'])
}

export function sendEnterToPane(paneId: string): void {
  runTmuxNoThrow(['send-keys', '-t', paneId, 'Enter'])
}

export function syncPaneLabelsForTeam(team: TeamState): void {
  const targets = new Set<string>()
  for (const member of Object.values(team.members)) {
    const target = member.paneId ? targetForPaneId(member.paneId) : member.windowTarget
    if (member.paneId) {
      setPaneLabel(member.paneId, member.name === 'team-lead' ? formatLeaderPaneLabel(team) : formatMemberPaneLabel(member))
    }
    if (target) {
      targets.add(target)
    }
  }

  for (const target of targets) {
    refreshWindowPaneLabels(target)
  }
}

export function clearPaneLabelsForTeam(team: TeamState): void {
  const targets = new Set<string>()
  for (const member of Object.values(team.members)) {
    if (member.paneId) {
      clearPaneLabel(member.paneId)
      const target = targetForPaneId(member.paneId) ?? member.windowTarget
      if (target) targets.add(target)
    } else if (member.windowTarget) {
      targets.add(member.windowTarget)
    }
  }
  for (const target of targets) {
    refreshWindowPaneLabels(target)
  }
}

export function listAgentTeamPanes(): AgentTeamPaneInfo[] {
  const result = runTmuxNoThrow([
    'list-panes',
    '-a',
    '-F',
    '#{pane_id}\t#{session_name}:#{window_id}\t#{@agentteam-name}\t#{pane_current_command}',
  ])
  if (!result.ok || !result.stdout) return []
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [paneId, target, label, currentCommand] = line.split('\t')
      return {
        paneId: paneId ?? '',
        target: target ?? '',
        label: label ?? '',
        currentCommand: currentCommand ?? '',
      }
    })
    .filter(item => item.paneId && item.label)
}

export function focusPane(paneId: string): void {
  runTmux(['select-pane', '-t', paneId])
}

export function killPane(paneId: string): void {
  runTmuxNoThrow(['kill-pane', '-t', paneId])
}
