import { isMailboxMessageUnread } from '../messageLifecycle.js'
import type { PanelActionMenu, PanelData, PanelSelectionView, TeamPanelState } from './viewModel.js'
import { hasPaneLostAttention, hasUnreadBlockedReportAttention, mailboxType, taskReferenceSummary } from './viewModel.js'
import {
  compactAttentionSummaryParts,
  foldCompactAttentionParts,
  mailboxTypeColor,
  mailboxTypeIcon,
  memberHealthBadge,
  memberPaneLabel,
  taskStatusBadge,
} from './layoutFormat.js'
import type { PanelTheme } from './layoutPrimitives.js'
import {
  formatAge,
  padCell,
  short,
  windowSlice,
} from './layoutPrimitives.js'

export function renderMembersLines(
  theme: PanelTheme,
  data: Extract<PanelData, { mode: 'attached' }>,
  state: TeamPanelState,
): string[] {
  const membersWindow = windowSlice(data.members, state.selectedMemberIndex, 6)
  const lines: string[] = []
  if (data.members.length === 0) {
    lines.push(theme.fg('muted', 'No teammates'))
    return lines
  }

  lines.push(theme.fg('dim', `   ${padCell('Name', 14)} Health          Context`))

  if (membersWindow.offset > 0) {
    lines.push(theme.fg('dim', `… ${membersWindow.offset} above`))
  }

  for (let i = 0; i < membersWindow.items.length; i += 1) {
    const member = membersWindow.items[i]!
    const absolute = membersWindow.offset + i
    const isSelected = state.focus === 'members' && absolute === state.selectedIndex
    const pointer = isSelected ? theme.fg('accent', '›') : ' '

    const unread = data.mailbox.filter(m => m.from === member.name && isMailboxMessageUnread(m)).length
    const activeTasks = data.tasks.filter(t => t.owner === member.name && t.status !== 'done').length
    const blockedTasks = data.tasks.filter(t => t.owner === member.name && t.status === 'blocked').length
    const paneLost = hasPaneLostAttention(member)
    const ageStr = formatAge(Date.now() - member.updatedAt)
    const paneStr = memberPaneLabel(member)
    const paneColor = paneLost || !member.paneId ? 'warning' : 'dim'
    const attention = [
      paneLost || member.bridgeLastError ? theme.fg('error', 'error') : '',
      blockedTasks > 0 ? theme.fg('error', `blocked ${blockedTasks}`) : '',
      unread > 0 ? theme.fg('warning', `unread ${unread}`) : '',
      member.bridgeWorkRequestedAt ? theme.fg('accent', 'busy') : '',
    ].filter(Boolean).join(theme.fg('dim', ' · '))

    const statsStr = `${theme.fg('dim', short(member.role, 10))} · ${theme.fg(paneColor, paneStr)} · ${theme.fg('dim', `tasks ${activeTasks}`)} · ${theme.fg('dim', `age ${ageStr}`)}`
    const attentionStr = attention ? `  ${attention}` : ''
    const nameStr = short(member.name, 14)
    const nameCol = isSelected ? padCell(theme.bold(theme.fg('accent', nameStr)), 14) : padCell(theme.fg('text', nameStr), 14)

    lines.push(
      `${pointer}  ${nameCol} ${memberHealthBadge(theme, member)}  ${statsStr}${attentionStr}`,
    )
  }

  const hiddenBelow = data.members.length - (membersWindow.offset + membersWindow.items.length)
  if (hiddenBelow > 0) {
    lines.push(theme.fg('dim', `… ${hiddenBelow} below`))
  }

  return lines
}

export function renderTaskLines(
  theme: PanelTheme,
  state: TeamPanelState,
  selection: PanelSelectionView,
): string[] {
  const tasksWindow = windowSlice(selection.visibleTasks, state.focus === 'tasks' ? state.selectedIndex : 0, 6)
  const lines: string[] = []

  if (selection.visibleTasks.length === 0) {
    lines.push(theme.fg('muted', 'No tasks'))
    return lines
  }

  lines.push(theme.fg('dim', `   ${padCell('Task', 8)}  Status          ${padCell('Title', 30)}  Owner`))

  if (tasksWindow.offset > 0) {
    lines.push(theme.fg('dim', `… ${tasksWindow.offset} above`))
  }

  for (let i = 0; i < tasksWindow.items.length; i += 1) {
    const task = tasksWindow.items[i]!
    const absolute = tasksWindow.offset + i
    const isSelected = state.focus === 'tasks' && absolute === state.selectedIndex
    const pointer = isSelected ? theme.fg('accent', '›') : ' '

    const idCol = padCell(isSelected ? theme.bold(theme.fg('accent', task.id)) : theme.fg('dim', task.id), 8)
    const ownerCol = theme.fg('dim', `@${short(task.owner ?? '-', 10)}`)
    const titleCol = padCell(isSelected ? theme.fg('text', short(task.title, 30)) : theme.fg('text', short(task.title, 30)), 30)
    const refs = taskReferenceSummary(task)
    const attention = [
      task.status === 'blocked' ? theme.fg('error', 'blocked') : '',
      task.status !== 'done' && !task.owner ? theme.fg('warning', 'unowned') : '',
      refs.total > 0 ? theme.fg('dim', `refs ${refs.total}`) : '',
    ].filter(Boolean).join(theme.fg('dim', ' · '))
    const attentionStr = attention ? `  ${attention}` : ''

    lines.push(
      `${pointer}  ${idCol}  ${taskStatusBadge(theme, task.status)}  ${titleCol}  ${ownerCol}${attentionStr}`,
    )
  }

  const hiddenBelow = selection.visibleTasks.length - (tasksWindow.offset + tasksWindow.items.length)
  if (hiddenBelow > 0) {
    lines.push(theme.fg('dim', `… ${hiddenBelow} below`))
  }

  return lines
}

export function renderMailboxLines(
  theme: PanelTheme,
  state: TeamPanelState,
  selection: PanelSelectionView,
): string[] {
  const mailboxWindow = windowSlice(selection.visibleMailbox, state.focus === 'mailbox' ? state.selectedIndex : 0, 5)
  const lines: string[] = []

  if (selection.visibleMailbox.length === 0) {
    lines.push(theme.fg('muted', 'No messages'))
    return lines
  }

  lines.push(theme.fg('dim', `   T  ${padCell('From', 14)}  ${padCell('Summary', 36)}  Time`))

  if (mailboxWindow.offset > 0) {
    lines.push(theme.fg('dim', `… ${mailboxWindow.offset} above`))
  }

  for (let i = 0; i < mailboxWindow.items.length; i += 1) {
    const item = mailboxWindow.items[i]!
    const absolute = mailboxWindow.offset + i
    const isSelected = state.focus === 'mailbox' && absolute === state.selectedIndex
    const pointer = isSelected ? theme.fg('accent', '›') : ' '

    const type = mailboxType(item)
    const icon = theme.fg(mailboxTypeColor(type), mailboxTypeIcon(type))
    const fromCol = isSelected ? padCell(theme.bold(theme.fg('accent', short(item.from, 14))), 14) : padCell(theme.fg('text', short(item.from, 14)), 14)

    const isUnread = isMailboxMessageUnread(item)
    const summaryText = short(item.summary ?? item.text, 36)
    const summaryFmt = isUnread ? theme.bold(theme.fg('text', summaryText)) : theme.fg('dim', summaryText)
    const summaryCol = padCell(summaryFmt, 36)
    const attention = [
      isUnread ? theme.fg('warning', 'unread') : '',
      hasUnreadBlockedReportAttention(item) ? theme.fg('error', 'blocked report') : '',
    ].filter(Boolean).join(theme.fg('dim', ' · '))
    const attentionStr = attention ? `  ${attention}` : ''

    const timeStr = theme.fg('dim', new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))

    lines.push(
      `${pointer}  ${icon}  ${fromCol}  ${summaryCol}  ${timeStr}${attentionStr}`,
    )
  }

  const hiddenBelow = selection.visibleMailbox.length - (mailboxWindow.offset + mailboxWindow.items.length)
  if (hiddenBelow > 0) {
    lines.push(theme.fg('dim', `… ${hiddenBelow} below`))
  }

  return lines
}

function teamStatusLine(
  theme: PanelTheme,
  team: Extract<PanelData, { mode: 'global' }>['teams'][number],
  summary?: Extract<PanelData, { mode: 'global' }>['teamSummaries'][string],
): string {
  const teammates = Object.values(team.members).filter(member => member.name !== 'team-lead')
  const taskCount = Object.keys(team.tasks).length
  const attention = summary ? foldCompactAttentionParts(theme, compactAttentionSummaryParts(theme, summary)) : []
  const attentionSuffix = attention.length > 0 ? attention.join(' ') : theme.fg('success', 'OK')
  return `${theme.fg('dim', `${teammates.length}m`)} · ${theme.fg('dim', `${taskCount}t`)} · ${attentionSuffix}`
}

export function renderGlobalTeamLines(
  theme: PanelTheme,
  data: Extract<PanelData, { mode: 'global' }>,
  state: TeamPanelState,
): string[] {
  const teamsWindow = windowSlice(data.teams, state.selectedTeamIndex, 8)
  const lines: string[] = []
  if (data.teams.length === 0) {
    lines.push(theme.fg('muted', data.quarantinedTeams.length > 0
      ? `No active teams; ${data.quarantinedTeams.length} legacy team(s) quarantined`
      : 'No saved teams'))
    return lines
  }
  lines.push(theme.fg('dim', `   ${padCell('Team', 24)} │ Summary`))
  if (teamsWindow.offset > 0) lines.push(theme.fg('dim', `… ${teamsWindow.offset} above`))
  for (let i = 0; i < teamsWindow.items.length; i += 1) {
    const team = teamsWindow.items[i]!
    const absolute = teamsWindow.offset + i
    const isSelected = state.focus === 'teams' && absolute === state.selectedIndex
    const pointer = isSelected ? theme.fg('accent', '›') : ' '
    const name = isSelected ? theme.bold(theme.fg('accent', short(team.name, 24))) : theme.fg('text', short(team.name, 24))
    lines.push(`${pointer}  ${padCell(name, 24)} ${theme.fg('dim', '│')} ${teamStatusLine(theme, team, data.teamSummaries[team.name])}`)
  }
  const hiddenBelow = data.teams.length - (teamsWindow.offset + teamsWindow.items.length)
  if (hiddenBelow > 0) lines.push(theme.fg('dim', `… ${hiddenBelow} below`))
  return lines
}

export function renderGlobalPaneLines(
  theme: PanelTheme,
  data: Extract<PanelData, { mode: 'global' }>,
  state: TeamPanelState,
): string[] {
  const panesWindow = windowSlice(data.orphanPanes, state.selectedPaneIndex, 8)
  const lines: string[] = []
  if (data.orphanPanes.length === 0) {
    lines.push(theme.fg('muted', 'No stale panes with agentteam labels'))
    return lines
  }
  lines.push(theme.fg('dim', `   ${padCell('Pane', 8)} Label / command`))
  if (panesWindow.offset > 0) lines.push(theme.fg('dim', `… ${panesWindow.offset} above`))
  for (let i = 0; i < panesWindow.items.length; i += 1) {
    const pane = panesWindow.items[i]!
    const absolute = panesWindow.offset + i
    const isSelected = state.focus === 'panes' && absolute === state.selectedIndex
    const pointer = isSelected ? theme.fg('accent', '›') : ' '
    const paneId = isSelected ? theme.bold(theme.fg('accent', pane.paneId)) : theme.fg('text', pane.paneId)
    lines.push(`${pointer}  ${padCell(paneId, 8)} ${theme.fg('dim', short(pane.label || pane.currentCommand || pane.target, 54))}`)
  }
  const hiddenBelow = data.orphanPanes.length - (panesWindow.offset + panesWindow.items.length)
  if (hiddenBelow > 0) lines.push(theme.fg('dim', `… ${hiddenBelow} below`))
  return lines
}

export function renderActionMenuLines(
  theme: PanelTheme,
  menu: PanelActionMenu,
): string[] {
  const lines: string[] = []
  lines.push(theme.bold(theme.fg('text', menu.title)))
  lines.push('')
  for (let i = 0; i < menu.actions.length; i += 1) {
    const action = menu.actions[i]!
    const isSelected = i === menu.selectedIndex
    const pointer = isSelected ? theme.fg('accent', '›') : ' '
    const labelColor = action.danger ? 'error' : isSelected ? 'accent' : 'text'
    const label = isSelected ? theme.bold(theme.fg(labelColor, action.label)) : theme.fg(labelColor, action.label)
    lines.push(`${pointer}  ${label}`)
    if (action.description) {
      lines.push(`   ${theme.fg('dim', short(action.description, 76))}`)
    }
  }
  return lines
}
