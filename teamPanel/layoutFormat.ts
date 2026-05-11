import type {
  TeamMember,
  TeamTask,
} from '../types.js'
import type { TeamAttentionSummary } from './viewModel.js'
import { hasPaneLostAttention, mailboxType } from './viewModel.js'
import type { PanelColor, PanelTheme } from './layoutPrimitives.js'

export function memberPaneLabel(member: TeamMember): string {
  return member.paneId ? `pane ${member.paneId}` : 'no pane'
}

export function memberHealthLabel(member: TeamMember): string {
  if (hasPaneLostAttention(member)) return 'pane lost'
  if (member.status === 'error') return 'error'
  if (!member.paneId) return 'no pane'
  return member.status
}

export function memberHealthColor(member: TeamMember): PanelColor {
  if (hasPaneLostAttention(member) || member.status === 'error') return 'error'
  if (!member.paneId) return 'warning'
  if (member.status === 'running') return 'warning'
  if (member.status === 'queued') return 'accent'
  return 'dim'
}

export function mailboxTypeIcon(type: ReturnType<typeof mailboxType>): string {
  if (type === 'blocked') return '⧗'
  if (type === 'completion_report') return '✓'
  if (type === 'assignment') return '↦'
  if (type === 'question') return '?'
  return '•'
}

export function mailboxTypeColor(type: ReturnType<typeof mailboxType>): PanelColor {
  if (type === 'blocked') return 'error'
  if (type === 'completion_report') return 'success'
  if (type === 'assignment') return 'accent'
  if (type === 'question') return 'warning'
  return 'text'
}

function taskStatusIcon(status: TeamTask['status']): string {
  if (status === 'completed') return '✔'
  if (status === 'in_progress') return '⟳'
  if (status === 'blocked') return '⚠'
  return '○'
}

function memberStatusIcon(status: TeamMember['status']): string {
  if (status === 'running') return '⟳'
  if (status === 'queued') return '⋯'
  if (status === 'error') return '⚠'
  return '○'
}

export function memberStatusBadge(theme: PanelTheme, status: TeamMember['status']): string {
  const color =
    status === 'running'
      ? 'warning'
      : status === 'error'
        ? 'error'
        : status === 'queued'
          ? 'accent'
          : 'dim'
  return theme.fg(color, `[${memberStatusIcon(status)} ${status}]`)
}

export function taskStatusBadge(theme: PanelTheme, status: TeamTask['status']): string {
  const color =
    status === 'completed'
      ? 'success'
      : status === 'in_progress'
        ? 'warning'
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
  if (summary.paneLostMembers > 0) parts.push(theme.fg('error', `pane lost ${summary.paneLostMembers}`))
  else if (summary.errorMembers > 0) parts.push(theme.fg('error', `⚠ ${summary.errorMembers} member error${summary.errorMembers === 1 ? '' : 's'}`))
  if (summary.blockedTasks > 0) parts.push(theme.fg('error', `⚠ ${summary.blockedTasks} blocked task${summary.blockedTasks === 1 ? '' : 's'}`))
  if (summary.blockedMessages > 0) parts.push(theme.fg('error', `⧗ ${summary.blockedMessages} blocked msg${summary.blockedMessages === 1 ? '' : 's'}`))
  if (summary.unreadMessages > 0) parts.push(theme.fg('warning', `✉ ${summary.unreadMessages} unread`))
  if (summary.unownedActiveTasks > 0) parts.push(theme.fg('warning', `◇ ${summary.unownedActiveTasks} unowned`))
  return parts
}

export function compactAttentionSummaryParts(
  theme: PanelTheme,
  summary: TeamAttentionSummary,
): string[] {
  const parts: string[] = []
  if (summary.paneLostMembers > 0) parts.push(theme.fg('error', `lost${summary.paneLostMembers}`))
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
