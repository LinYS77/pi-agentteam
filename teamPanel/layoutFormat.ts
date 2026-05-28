import { projectWorkerHealth, type WorkerHealthProjectionInput } from '../core/workerHealth.js'
import type {
  TeamMember,
  TeamTask,
} from '../internalTypes.js'
import type { TeamAttentionSummary } from './viewModel.js'
import { hasPaneLostAttention, mailboxType } from './viewModel.js'
import type { PanelColor, PanelTheme } from './layoutPrimitives.js'

export function memberPaneLabel(member: TeamMember): string {
  return member.paneId ? `pane ${member.paneId}` : 'pane missing'
}

export function projectMemberHealth(member: TeamMember): ReturnType<typeof projectWorkerHealth> {
  const projection: WorkerHealthProjectionInput = {
    isOperational: Boolean(member.paneId) && member.status !== 'offline',
    hasError: member.status === 'error' || Boolean(member.bridgeLastError),
    hasActiveTurn: member.status === 'running' || member.status === 'draining',
    hasPendingWork: member.status === 'queued' || member.status === 'pending_delivery' || Boolean(member.bridgeWorkRequestedAt),
  }
  return projectWorkerHealth(projection)
}

export function memberHealthLabel(member: TeamMember): ReturnType<typeof projectMemberHealth> {
  return projectMemberHealth(member)
}

export function memberHealthColor(member: TeamMember): PanelColor {
  const health = projectMemberHealth(member)
  if (health === 'error') return 'error'
  if (health === 'busy') return 'accent'
  if (health === 'offline') return 'warning'
  return 'dim'
}

export function mailboxTypeIcon(type: ReturnType<typeof mailboxType>): string {
  if (type === 'report_blocked') return '⧗'
  if (type === 'report_done') return '✓'
  if (type === 'assignment') return '↦'
  if (type === 'question') return '?'
  return '•'
}

export function mailboxTypeColor(type: ReturnType<typeof mailboxType>): PanelColor {
  if (type === 'report_blocked') return 'error'
  if (type === 'report_done') return 'success'
  if (type === 'assignment') return 'accent'
  if (type === 'question') return 'warning'
  return 'text'
}

function taskStatusIcon(status: TeamTask['status']): string {
  if (status === 'done') return '✔'
  if (status === 'blocked') return '⚠'
  return '○'
}

function workerHealthIcon(health: ReturnType<typeof projectMemberHealth>): string {
  if (health === 'busy') return '⋯'
  if (health === 'offline') return '◇'
  if (health === 'error') return '⚠'
  return '○'
}

export function memberHealthBadge(theme: PanelTheme, member: TeamMember): string {
  const health = projectMemberHealth(member)
  return theme.fg(memberHealthColor(member), `[${workerHealthIcon(health)} ${health}]`)
}

export function taskStatusBadge(theme: PanelTheme, status: TeamTask['status']): string {
  const color =
    status === 'done'
      ? 'success'
      : status === 'blocked'
        ? 'error'
        : 'dim'
  return theme.fg(color, `[${taskStatusIcon(status)} ${status}]`)
}

export function attentionSummaryParts(
  theme: PanelTheme,
  summary: TeamAttentionSummary,
): string[] {
  const parts: string[] = []
  if (summary.paneLostMembers > 0) parts.push(theme.fg('error', `worker error ${summary.paneLostMembers}`))
  else if (summary.errorMembers > 0) parts.push(theme.fg('error', `⚠ ${summary.errorMembers} member error${summary.errorMembers === 1 ? '' : 's'}`))
  if (summary.blockedTasks > 0) parts.push(theme.fg('error', `⚠ ${summary.blockedTasks} blocked task${summary.blockedTasks === 1 ? '' : 's'}`))
  if (summary.blockedMessages > 0) parts.push(theme.fg('error', `⧗ ${summary.blockedMessages} unread blocked report${summary.blockedMessages === 1 ? '' : 's'}`))
  if (summary.unreadMessages > 0) parts.push(theme.fg('warning', `✉ ${summary.unreadMessages} unread`))
  if (summary.unownedActiveTasks > 0) parts.push(theme.fg('warning', `◇ ${summary.unownedActiveTasks} unowned`))
  return parts
}

export function compactAttentionSummaryParts(
  theme: PanelTheme,
  summary: TeamAttentionSummary,
): string[] {
  const parts: string[] = []
  if (summary.paneLostMembers > 0) parts.push(theme.fg('error', `err${summary.paneLostMembers}`))
  else if (summary.errorMembers > 0) parts.push(theme.fg('error', `err${summary.errorMembers}`))
  if (summary.blockedTasks > 0) parts.push(theme.fg('error', `⚠${summary.blockedTasks}`))
  if (summary.blockedMessages > 0) parts.push(theme.fg('error', `⧗${summary.blockedMessages}`))
  if (summary.unreadMessages > 0) parts.push(theme.fg('warning', `✉${summary.unreadMessages}`))
  if (summary.unownedActiveTasks > 0) parts.push(theme.fg('warning', `◇${summary.unownedActiveTasks}`))
  return parts
}

export function foldAttentionParts(
  theme: PanelTheme,
  parts: string[],
  limit = 3,
): string[] {
  if (parts.length <= limit) return parts
  return [...parts.slice(0, limit), theme.fg('dim', `+${parts.length - limit} more`)]
}

export function foldCompactAttentionParts(
  theme: PanelTheme,
  parts: string[],
  limit = 3,
): string[] {
  if (parts.length <= limit) return parts
  return [...parts.slice(0, limit), theme.fg('dim', `+${parts.length - limit}`)]
}

export function sumAttentionSummaries(summaries: TeamAttentionSummary[]): TeamAttentionSummary {
  return summaries.reduce<TeamAttentionSummary>((acc, item) => ({
    blockedTasks: acc.blockedTasks + item.blockedTasks,
    unreadMessages: acc.unreadMessages + item.unreadMessages,
    blockedMessages: acc.blockedMessages + item.blockedMessages,
    unownedActiveTasks: acc.unownedActiveTasks + item.unownedActiveTasks,
    errorMembers: acc.errorMembers + item.errorMembers,
    paneLostMembers: acc.paneLostMembers + item.paneLostMembers,
  }), {
    blockedTasks: 0,
    unreadMessages: 0,
    blockedMessages: 0,
    unownedActiveTasks: 0,
    errorMembers: 0,
    paneLostMembers: 0,
  })
}
