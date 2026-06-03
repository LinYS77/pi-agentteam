import { isMailboxMessageUnread } from '../messageLifecycle.js'
import type { PanelActionMenu, PanelData, PanelSelectionView, TeamPanelState } from './viewModel.js'
import { getPanelActiveSelectedIndex, hasPaneLostAttention, hasUnreadBlockedReportAttention, mailboxType, taskHistorySummary } from './viewModel.js'
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
  wordWrap,
} from './layoutPrimitives.js'

function listContentRows(maxContentLines: number | undefined, fallbackRows: number, hasHeader = true): number {
  if (maxContentLines === undefined) return fallbackRows
  const headerRows = hasHeader ? 1 : 0
  const markerRows = 2
  return Math.max(1, maxContentLines - headerRows - markerRows)
}

export function renderMembersLines(
  theme: PanelTheme,
  data: Extract<PanelData, { mode: 'attached' }>,
  state: TeamPanelState,
  maxContentLines?: number,
): string[] {
  const selectedIndex = getPanelActiveSelectedIndex(state)
  const membersWindow = windowSlice(data.members, state.membersSelectedIndex, listContentRows(maxContentLines, 6))
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
    const isSelected = state.focus === 'members' && absolute === selectedIndex
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
  data: Extract<PanelData, { mode: 'attached' }>,
  state: TeamPanelState,
  selection: PanelSelectionView,
  maxContentLines?: number,
): string[] {
  const selectedIndex = getPanelActiveSelectedIndex(state)
  const tasksWindow = windowSlice(selection.visibleTasks, state.focus === 'tasks' ? selectedIndex : state.tasksSelectedIndex, listContentRows(maxContentLines, 6))
  const lines: string[] = []

  if (selection.visibleTasks.length === 0) {
    lines.push(theme.fg('muted', 'No tasks'))
    return lines
  }

  lines.push(theme.fg('dim', `   ${padCell('Task', 8)}  Status          ${padCell('Title', 30)}  Owner / History`))

  if (tasksWindow.offset > 0) {
    lines.push(theme.fg('dim', `… ${tasksWindow.offset} above`))
  }

  for (let i = 0; i < tasksWindow.items.length; i += 1) {
    const task = tasksWindow.items[i]!
    const absolute = tasksWindow.offset + i
    const isSelected = state.focus === 'tasks' && absolute === selectedIndex
    const pointer = isSelected ? theme.fg('accent', '›') : ' '

    const idCol = padCell(isSelected ? theme.bold(theme.fg('accent', task.id)) : theme.fg('dim', task.id), 8)
    const ownerCol = theme.fg('dim', `@${short(task.owner ?? '-', 10)}`)
    const titleCol = padCell(isSelected ? theme.fg('text', short(task.title, 30)) : theme.fg('text', short(task.title, 30)), 30)
    const history = taskHistorySummary(data.team, task.id)
    const attention = [
      task.status === 'blocked' ? theme.fg('error', 'blocked') : '',
      task.status !== 'done' && !task.owner ? theme.fg('warning', 'unowned') : '',
      history.reports > 0 ? theme.fg('success', `reports ${history.reports}`) : '',
      history.events > 0 ? theme.fg('dim', `events ${history.events}`) : '',
      history.messageRefs > 0 ? theme.fg('dim', `msgs ${history.messageRefs}`) : '',
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

export function renderCockpitQueueLines(
  theme: PanelTheme,
  state: TeamPanelState,
  selection: PanelSelectionView,
  maxContentLines?: number,
): string[] {
  const selectedIndex = getPanelActiveSelectedIndex(state)
  const queueWindow = windowSlice(selection.cockpitQueue, state.focus === 'cockpit' ? selectedIndex : state.cockpitSelectedIndex, listContentRows(maxContentLines, 8))
  const lines: string[] = []
  if (selection.cockpitQueue.length === 0) {
    lines.push(theme.fg('muted', 'No active task or unread mailbox attention'))
    return lines
  }
  lines.push(theme.fg('dim', `   ${padCell('Kind', 8)}  ${padCell('Subject', 36)}  Attention`))
  for (let i = 0; i < queueWindow.items.length; i += 1) {
    const item = queueWindow.items[i]!
    const absolute = queueWindow.offset + i
    const isSelected = state.focus === 'cockpit' && absolute === selectedIndex
    const pointer = isSelected ? theme.fg('accent', '›') : ' '
    const kind = item.kind === 'task' ? theme.fg('accent', 'task') : theme.fg('warning', 'mail')
    const subject = item.kind === 'task'
      ? `${item.task.id} ${short(item.task.title, 28)}`
      : `${mailboxTypeIcon(mailboxType(item.message))} ${short(item.message.summary ?? item.message.text, 31)}`
    const attention = item.attention.length > 0 ? item.attention.join(theme.fg('dim', ' · ')) : theme.fg('dim', 'active')
    const subjectFmt = isSelected ? theme.bold(theme.fg('text', subject)) : theme.fg('text', subject)
    lines.push(`${pointer}  ${padCell(kind, 8)}  ${padCell(subjectFmt, 36)}  ${attention}`)
  }
  const hiddenBelow = selection.cockpitQueue.length - queueWindow.items.length
  if (hiddenBelow > 0) lines.push(theme.fg('dim', `… ${hiddenBelow} more attention item(s)`))
  return lines
}

export function renderMailboxLines(
  theme: PanelTheme,
  state: TeamPanelState,
  selection: PanelSelectionView,
  maxContentLines?: number,
): string[] {
  const selectedIndex = getPanelActiveSelectedIndex(state)
  const mailboxWindow = windowSlice(selection.visibleMailbox, state.focus === 'mailbox' ? selectedIndex : state.mailboxSelectedIndex, listContentRows(maxContentLines, 5))
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
    const isSelected = state.focus === 'mailbox' && absolute === selectedIndex
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
  maxContentLines?: number,
): string[] {
  const selectedIndex = getPanelActiveSelectedIndex(state)
  const teamsWindow = windowSlice(data.teams, state.teamsSelectedIndex, listContentRows(maxContentLines, 8))
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
    const isSelected = state.focus === 'teams' && absolute === selectedIndex
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
  maxContentLines?: number,
): string[] {
  const selectedIndex = getPanelActiveSelectedIndex(state)
  const panesWindow = windowSlice(data.orphanPanes, state.panesSelectedIndex, listContentRows(maxContentLines, 8))
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
    const isSelected = state.focus === 'panes' && absolute === selectedIndex
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
  width = 80,
): string[] {
  const lines: string[] = []

  if (menu.confirmingAction) {
    const action = menu.confirmingAction
    lines.push(theme.bold(theme.fg('error', '⚠️  CONFIRM DESTRUCTIVE ACTION')))
    lines.push('')

    const wrapWidth = Math.max(10, width - 6)
    const promptLines = wordWrap(`Are you sure you want to perform the following dangerous action?\n"${action.label}"`, wrapWidth)
    for (const pLine of promptLines) {
      lines.push(theme.fg('text', pLine))
    }
    lines.push('')

    const cancelSel = menu.confirmSelectedIndex === 0
    const confirmSel = menu.confirmSelectedIndex === 1

    const cancelPointer = cancelSel ? theme.fg('accent', '›') : ' '
    const confirmPointer = confirmSel ? theme.fg('accent', '›') : ' '

    const cancelFmt = cancelSel
      ? theme.bold(theme.fg('accent', '[ No, Cancel operation ]'))
      : theme.fg('dim', '[ No, Cancel operation ]')

    const confirmFmt = confirmSel
      ? theme.bold(theme.fg('error', '[ Yes, execute dangerous action ]'))
      : theme.fg('dim', '[ Yes, execute dangerous action ]')

    lines.push(`${cancelPointer}  ${cancelFmt}`)
    lines.push(`${confirmPointer}  ${confirmFmt}`)
    lines.push('')

    if (action.description) {
      lines.push(theme.fg('dim', '─'.repeat(wrapWidth)))
      const descLines = wordWrap(action.description, wrapWidth)
      for (const dLine of descLines) {
        lines.push(theme.fg('dim', dLine))
      }
    }
    return lines
  }

  lines.push(theme.bold(theme.fg('text', menu.title)))
  lines.push('')

  const sections: { key: string; label: string }[] = [
    { key: 'selected', label: 'SELECTED ITEM' },
    { key: 'maintenance', label: 'MAINTENANCE' },
    { key: 'danger', label: 'DANGER ZONE' },
  ]

  for (const sec of sections) {
    const sectionActions = menu.actions.filter(a => (a.section ?? 'selected') === sec.key)
    if (sectionActions.length === 0) continue

    lines.push(theme.bold(theme.fg('dim', `▼ ${sec.label}`)))

    for (const action of sectionActions) {
      const originalIndex = menu.actions.findIndex(a => a.id === action.id)
      const isSelected = originalIndex === menu.selectedIndex

      const pointer = isSelected ? theme.fg('accent', '›') : ' '
      const labelColor = action.danger ? 'error' : isSelected ? 'accent' : 'text'
      const label = isSelected ? theme.bold(theme.fg(labelColor, action.label)) : theme.fg(labelColor, action.label)

      lines.push(`${pointer}  ${label}`)
    }
    lines.push('')
  }

  const selectedAction = menu.actions[menu.selectedIndex]
  if (selectedAction && selectedAction.description) {
    const wrapWidth = Math.max(10, width - 6)
    lines.push(theme.fg('dim', '─'.repeat(wrapWidth)))
    const descLines = wordWrap(selectedAction.description, wrapWidth)
    for (const dLine of descLines) {
      lines.push(theme.fg('dim', dLine))
    }
  }

  return lines
}
