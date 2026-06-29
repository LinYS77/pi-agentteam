import { createAgentTeamKernelAdapter } from '../core/kernel.js'
import type { WorkerHealth } from '../core/publicModel.js'
import type { TeamMember, TeamState } from '../internalTypes.js'
import { projectTeamMemberHealth } from '../runtime/memberHealth.js'
import { targetForPaneId, windowExists } from './core.js'

function roleIcon(member: TeamMember): string {
  if (member.role === 'planner') return '🧭'
  if (member.role === 'researcher') return '🔎'
  if (member.role === 'implementer') return '🛠️'
  return '👤'
}

function workerHealth(member: TeamMember): WorkerHealth {
  return projectTeamMemberHealth(member)
}

function statusWord(member: TeamMember): string {
  return workerHealth(member)
}

function compactCounts(items: string[]): string {
  return items.filter(Boolean).join(' · ')
}

export function formatMemberPaneLabel(member: TeamMember): string {
  const role = member.role === 'leader' ? 'leader' : member.role
  return `${roleIcon(member)} ${member.name} · ${role} · ${statusWord(member)}`
}

export function formatLeaderPaneLabel(team: TeamState): string {
  const teammates = Object.values(team.members).filter(member => member.name !== 'team-lead')
  const offline = teammates.filter(member => workerHealth(member) === 'offline').length
  const idle = teammates.filter(member => workerHealth(member) === 'idle').length
  const busy = teammates.filter(member => workerHealth(member) === 'busy').length
  const error = teammates.filter(member => workerHealth(member) === 'error').length
  const tasks = Object.values(team.tasks)
  const open = tasks.filter(task => task.status === 'open').length
  const blocked = tasks.filter(task => task.status === 'blocked').length
  const taskBits = compactCounts([
    open > 0 ? `${open} open` : '',
    blocked > 0 ? `${blocked} blocked` : '',
  ])
  const teammateBits = compactCounts([
    offline > 0 ? `${offline} offline` : '',
    busy > 0 ? `${busy} busy` : '',
    idle > 0 && offline === 0 && busy === 0 ? `${idle} idle` : '',
    error > 0 ? `${error} error` : '',
  ])
  const bits = compactCounts([
    teammateBits ? `👥 ${teammateBits}` : '',
    taskBits ? `📝 ${taskBits}` : '',
  ])
  return bits ? `👑 leader · ${bits}` : '👑 leader · ready'
}

export async function setPaneLabel(paneId: string, label: string, signal?: AbortSignal): Promise<void> {
  await createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)
}

async function clearPaneLabel(paneId: string, signal?: AbortSignal): Promise<void> {
  await createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)
}

async function markWindowAsAgentTeam(target: string, signal?: AbortSignal): Promise<void> {
  if (!await windowExists(target, signal)) return
  await createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)
}

async function refreshWindowPaneLabels(target: string, signal?: AbortSignal): Promise<void> {
  if (!await windowExists(target, signal)) return
  await createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)
}

export async function syncPaneLabelsForTeam(team: TeamState, signal?: AbortSignal): Promise<void> {
  const targets = new Set<string>()
  for (const member of Object.values(team.members)) {
    const target = member.paneId ? targetForPaneId(member.paneId) : member.windowTarget
    if (member.paneId) {
      await setPaneLabel(member.paneId, member.name === 'team-lead' ? formatLeaderPaneLabel(team) : formatMemberPaneLabel(member), signal)
    }
    if (target) targets.add(target)
  }

  for (const target of targets) {
    await refreshWindowPaneLabels(target, signal)
  }
}

export async function clearPaneLabelsForTeam(team: TeamState, signal?: AbortSignal): Promise<void> {
  const targets = new Set<string>()
  for (const member of Object.values(team.members)) {
    if (member.paneId) {
      await clearPaneLabel(member.paneId, signal)
      const target = targetForPaneId(member.paneId) ?? member.windowTarget
      if (target) targets.add(target)
    } else if (member.windowTarget) {
      targets.add(member.windowTarget)
    }
  }
  for (const target of targets) {
    await refreshWindowPaneLabels(target, signal)
  }
}

export { markWindowAsAgentTeam, refreshWindowPaneLabels }
