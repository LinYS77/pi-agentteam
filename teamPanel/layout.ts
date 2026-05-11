import type { ExtensionContext } from '@mariozechner/pi-coding-agent'
import { truncateToWidth } from '@mariozechner/pi-tui'
import { isMailboxMessageUnread } from '../messageLifecycle.js'
import type {
  PanelData,
  PanelSelectionView,
  TeamPanelState,
} from './viewModel.js'
import { buildTeamAttentionSummary, mailboxType } from './viewModel.js'
import {
  basename,
  drawBox,
  formatAge,
  formatDateTime,
  mergeColumns,
  padCell,
  renderDetailBlock,
  renderDetailField,
  renderDetailSeparator,
  short,
} from './layoutPrimitives.js'
import {
  attentionSummaryParts,
  foldAttentionParts,
  mailboxTypeColor,
  mailboxTypeIcon,
  memberHealthColor,
  memberHealthLabel,
  memberPaneLabel,
  memberStatusBadge,
  sumAttentionSummaries,
  taskStatusBadge,
} from './layoutFormat.js'
import {
  renderActionMenuLines,
  renderGlobalPaneLines,
  renderGlobalTeamLines,
  renderMailboxLines,
  renderMembersLines,
  renderTaskLines,
} from './layoutLists.js'

type RenderLayoutInput = {
  width: number
  height?: number
  data: PanelData
  state: TeamPanelState
  selection: PanelSelectionView
}

function overviewPart(theme: ExtensionContext['ui']['theme'], label: string, value: string): string {
  return `${theme.fg('dim', `${label} `)}${value}`
}

function renderOverviewLine(theme: ExtensionContext['ui']['theme'], data: PanelData): string {
  if (data.mode === 'global') {
    const globalAttention = sumAttentionSummaries(Object.values(data.teamSummaries))
    const attention = foldAttentionParts(theme, attentionSummaryParts(theme, globalAttention))
    const attentionText = attention.length > 0 ? attention.join(theme.fg('dim', ' · ')) : theme.fg('dim', 'OK')
    return `${theme.bold(theme.fg('text', '✦  AgentTeam Console '))} ${theme.fg('dim', '│')} ${overviewPart(theme, 'Attention', attentionText)} ${theme.fg('dim', '│')} ${overviewPart(theme, 'Teams', String(data.teams.length))} ${theme.fg('dim', '│')} ${overviewPart(theme, 'Stale panes', String(data.orphanPanes.length))}`
  }

  const runningCount = data.members.filter(member => member.status === 'running').length
  const queuedCount = data.members.filter(member => member.status === 'queued').length
  const idleCount = data.members.filter(member => member.status === 'idle').length
  const errorCount = data.members.filter(member => member.status === 'error').length

  const pendingCount = data.tasks.filter(task => task.status === 'pending').length
  const inProgressCount = data.tasks.filter(task => task.status === 'in_progress').length
  const blockedCount = data.tasks.filter(task => task.status === 'blocked').length
  const completedCount = data.tasks.filter(task => task.status === 'completed').length

  const blockedMsgCount = data.mailbox.filter(item => mailboxType(item) === 'blocked').length
  const unreadMsgCount = data.mailbox.filter(isMailboxMessageUnread).length

  const tName = theme.bold(theme.fg('text', `✦  ${data.team.name} `))

  const mStatus = `${theme.fg('warning', `⟳ ${runningCount}`)} ${theme.fg('accent', `⋯ ${queuedCount}`)} ${theme.fg('dim', `○ ${idleCount}`)}${errorCount ? ` ${theme.fg('error', `⚠ ${errorCount}`)}` : ''}`
  const tStatus = `${theme.fg('dim', `○ ${pendingCount}`)} ${theme.fg('warning', `⟳ ${inProgressCount}`)} ${theme.fg('error', `⚠ ${blockedCount}`)} ${theme.fg('success', `✔ ${completedCount}`)}`
  const sStatus = `${theme.fg(unreadMsgCount > 0 ? 'warning' : 'dim', `${unreadMsgCount} unread`)} · ${theme.fg(blockedMsgCount > 0 ? 'error' : 'dim', `${blockedMsgCount} blocked`)} · total ${data.mailbox.length}`
  const attention = foldAttentionParts(theme, attentionSummaryParts(theme, buildTeamAttentionSummary(data.team, data.mailbox)))
  const attentionText = attention.length > 0 ? attention.join(theme.fg('dim', ' · ')) : theme.fg('dim', 'OK')

  return `${tName} ${theme.fg('dim', '│')} ${overviewPart(theme, 'Attention', attentionText)}  ${theme.fg('dim', '│')} ${overviewPart(theme, '👥 Members', mStatus)}  ${theme.fg('dim', '│')} ${overviewPart(theme, '📋 Tasks', tStatus)}  ${theme.fg('dim', '│')} ${overviewPart(theme, '📬 Mail', sStatus)}`
}

function renderDetailSection(theme: ExtensionContext['ui']['theme'], label: string): string {
  return theme.bold(theme.fg('dim', label))
}

function renderGlobalDetailLines(
  theme: ExtensionContext['ui']['theme'],
  data: Extract<PanelData, { mode: 'global' }>,
  state: TeamPanelState,
  selection: PanelSelectionView,
): string[] {
  const detailLines: string[] = []
  if (state.focus === 'panes') {
    const pane = selection.selectedPane
    if (!pane) {
      detailLines.push(theme.fg('muted', 'No stale pane selected'))
    } else {
      detailLines.push(`🧹 ${theme.bold(theme.fg('text', pane.paneId))}`)
      detailLines.push('')
      detailLines.push(renderDetailSection(theme, 'Pane state'))
      detailLines.push(renderDetailField(theme, 'Pane', pane.paneId, 'text'))
      detailLines.push(renderDetailField(theme, 'Target', pane.target || '-', 'text'))
      detailLines.push(renderDetailField(theme, 'Label', pane.label || '-', pane.label ? 'warning' : 'dim'))
      detailLines.push(renderDetailField(theme, 'Command', pane.currentCommand || '-', 'text'))
      detailLines.push(renderDetailField(theme, 'State', 'stale agentteam-labeled pane', 'warning'))
    }
  } else {
    const team = selection.selectedTeam
    if (!team) {
      detailLines.push(theme.fg('muted', 'No team selected'))
    } else {
      const teammates = Object.values(team.members).filter(member => member.name !== 'team-lead')
      const tasks = Object.values(team.tasks)
      const leader = team.members['team-lead']
      const summary = data.teamSummaries[team.name]
      const mailbox = data.teamMailboxes[team.name]
      detailLines.push(`🤝 ${theme.bold(theme.fg('text', team.name))}`)
      detailLines.push('')
      const errorCount = teammates.filter(member => member.status === 'error').length
      const missingPaneCount = teammates.filter(member => !member.paneId).length
      const runningCount = teammates.filter(member => member.status === 'running').length
      const queuedCount = teammates.filter(member => member.status === 'queued').length
      const idleCount = teammates.filter(member => member.status === 'idle').length
      const pendingCount = tasks.filter(task => task.status === 'pending').length
      const inProgressCount = tasks.filter(task => task.status === 'in_progress').length
      const blockedCount = tasks.filter(task => task.status === 'blocked').length
      const completedCount = tasks.filter(task => task.status === 'completed').length
      const unownedCount = tasks.filter(task => task.status !== 'completed' && !task.owner).length
      const attentionParts = summary ? attentionSummaryParts(theme, summary) : []
      detailLines.push(renderDetailSection(theme, 'Status'))
      detailLines.push(renderDetailField(theme, 'Teammates', String(teammates.length), 'text'))
      detailLines.push(renderDetailField(theme, 'Health', `running ${runningCount} · queued ${queuedCount} · idle ${idleCount} · error ${errorCount} · no pane ${missingPaneCount}`, errorCount || missingPaneCount ? 'warning' : 'text'))
      detailLines.push(renderDetailField(theme, 'Tasks', `pending ${pendingCount} · active ${inProgressCount} · blocked ${blockedCount} · done ${completedCount} · unowned ${unownedCount}`, blockedCount || unownedCount ? 'warning' : 'text'))
      detailLines.push(renderDetailField(theme, 'Mailbox', mailbox ? `unread ${mailbox.unread} · blocked ${mailbox.blocked} · total ${mailbox.total}` : 'unread 0 · blocked 0 · total 0', mailbox && (mailbox.unread || mailbox.blocked) ? 'warning' : 'text'))
      detailLines.push(renderDetailField(theme, 'Attention', attentionParts.join(' · ') || 'OK', attentionParts.length > 0 ? 'warning' : 'text'))
      detailLines.push('')
      detailLines.push(renderDetailSection(theme, 'Identity'))
      detailLines.push(renderDetailField(theme, 'Leader pane', leader?.paneId ?? 'missing', leader?.paneId ? 'text' : 'warning'))
      detailLines.push(renderDetailField(theme, 'Created', new Date(team.createdAt).toLocaleString(), 'text'))

      if (mailbox?.latestAttention) {
        const latest = mailbox.latestAttention
        const latestType = mailboxType(latest)
        detailLines.push('')
        detailLines.push(renderDetailSection(theme, 'Latest attention'))
        detailLines.push(...renderDetailBlock(theme, `Latest mail attention · ${latestType} · ${latest.from}`, latest.summary ?? latest.text, 44, latestType === 'blocked' ? 'error' : 'text'))
      } else {
        const latestBlocked = tasks
          .filter(task => task.status === 'blocked' || (task.status !== 'completed' && !task.owner))
          .sort((a, b) => b.updatedAt - a.updatedAt)[0]
        if (latestBlocked) {
          const kind = latestBlocked.status === 'blocked' ? 'blocked task' : 'unowned task'
          detailLines.push('')
          detailLines.push(renderDetailSection(theme, 'Latest attention'))
          detailLines.push(...renderDetailBlock(theme, `Latest task attention · ${kind} · ${latestBlocked.id}`, latestBlocked.title, 44, latestBlocked.status === 'blocked' ? 'error' : 'warning'))
        }
      }

      if (teammates.length > 0) {
        detailLines.push('')
        detailLines.push(renderDetailSeparator(theme, 44))
        detailLines.push(renderDetailSection(theme, 'Roster'))
        for (const member of teammates.slice(0, 4)) {
          const health = memberHealthLabel(member)
          const pane = memberPaneLabel(member)
          const healthCol = padCell(theme.fg(memberHealthColor(member), short(health, 9)), 10)
          const nameCol = padCell(theme.fg('text', short(member.name, 16)), 16)
          const roleCol = padCell(theme.fg('dim', short(member.role, 10)), 10)
          const paneCol = theme.fg(member.paneId ? 'dim' : 'warning', short(pane, 12))
          detailLines.push(`  ${healthCol}${nameCol}${roleCol}${paneCol}`)
        }
        const hidden = teammates.length - 4
        if (hidden > 0) detailLines.push(theme.fg('dim', `  … ${hidden} more teammate(s)`))
      }
    }
  }
  detailLines.push('')
  detailLines.push(theme.fg('dim', '👉 ') + theme.fg('accent', 'Enter ') + theme.fg('dim', 'actions'))
  return detailLines
}

function renderDetailLines(
  theme: ExtensionContext['ui']['theme'],
  data: Extract<PanelData, { mode: 'attached' }>,
  state: TeamPanelState,
  selection: PanelSelectionView,
  width: number,
): string[] {
  const detailLines: string[] = []
  const textWidth = Math.max(20, width - 6) // Content width inside details box after borders/padding.

  if (state.focus === 'members') {
    const selectedMember = selection.selectedMember
    if (!selectedMember) {
      detailLines.push(theme.fg('muted', '👤 No member selected'))
      return detailLines
    }

    const activeTasks = data.tasks.filter(task => task.owner === selectedMember.name && task.status !== 'completed').length
    const msgCount = data.mailbox.filter(item => item.from === selectedMember.name).length
    detailLines.push(`👤 ${theme.bold(theme.fg('text', selectedMember.name))}  ${memberStatusBadge(theme, selectedMember.status)}  ${theme.fg('dim', selectedMember.role)}`)
    detailLines.push('')
    detailLines.push(renderDetailSection(theme, 'Status'))
    detailLines.push(renderDetailField(theme, 'Health', memberHealthLabel(selectedMember), memberHealthColor(selectedMember)))
    detailLines.push(renderDetailField(theme, 'Pane', memberPaneLabel(selectedMember), selectedMember.paneId ? 'text' : 'warning'))
    if (selectedMember.windowTarget) detailLines.push(renderDetailField(theme, 'Window', selectedMember.windowTarget, 'text'))
    detailLines.push(renderDetailField(theme, 'Tasks', String(activeTasks), 'text'))
    detailLines.push(renderDetailField(theme, 'Mailbox', String(msgCount), 'text'))
    detailLines.push('')
    detailLines.push(renderDetailSection(theme, 'Session'))
    detailLines.push(renderDetailField(theme, 'Session', basename(selectedMember.sessionFile), 'text'))
    detailLines.push(renderDetailField(theme, 'Updated', `${formatDateTime(selectedMember.updatedAt)} (${formatAge(Date.now() - selectedMember.updatedAt)} ago)`, 'text'))
    detailLines.push(renderDetailField(theme, 'Created', formatDateTime(selectedMember.createdAt), 'text'))
    if (selectedMember.lastWakeReason) detailLines.push(renderDetailField(theme, 'Wake', selectedMember.lastWakeReason, 'text'))
    if (selectedMember.lastError) detailLines.push(renderDetailField(theme, 'Error', selectedMember.lastError, 'error'))
    
    detailLines.push('')
    detailLines.push(theme.fg('dim', '👉 ') + theme.fg('accent', 'Enter ') + theme.fg('dim', 'actions'))
    return detailLines
  }

  if (state.focus === 'tasks') {
    const selectedTask = selection.selectedTask
    if (!selectedTask) {
      detailLines.push(theme.fg('muted', '📋 No task selected'))
      return detailLines
    }

    detailLines.push(`📋 ${theme.bold(theme.fg('accent', selectedTask.id))}  ${taskStatusBadge(theme, selectedTask.status)}  ${theme.fg('text', short(selectedTask.title, Math.max(12, textWidth - 25)))}`)
    detailLines.push('')
    detailLines.push(renderDetailSection(theme, 'Status'))
    detailLines.push(renderDetailField(theme, 'Owner', selectedTask.owner ?? '-', 'text'))
    if (selectedTask.blockedBy.length > 0) {
      detailLines.push(renderDetailField(theme, 'Blocked by', selectedTask.blockedBy.join(','), 'error'))
    }
    
    const latest = selectedTask.notes[selectedTask.notes.length - 1]
    if (state.isDetailExpanded) {
      detailLines.push('')
      detailLines.push(renderDetailSeparator(theme, textWidth))
      detailLines.push(renderDetailSection(theme, 'Content'))
      detailLines.push(...renderDetailBlock(theme, 'Description', selectedTask.description || '(none)', textWidth, 'text'))

      if (latest) {
        detailLines.push('')
        detailLines.push(...renderDetailBlock(theme, `Latest note · ${latest.author}`, latest.text, textWidth, 'text'))
      }
    } else {
      const desc = (selectedTask.description || '(none)').replace(/\n/g, ' ')
      detailLines.push('')
      detailLines.push(renderDetailSection(theme, 'Content'))
      detailLines.push(renderDetailField(theme, 'Description', short(desc, Math.max(12, textWidth - 16)), 'text'))
      if (latest) {
        detailLines.push(renderDetailField(theme, 'Latest note', short(latest.text.replace(/\n/g, ' '), Math.max(12, textWidth - 16)), 'text'))
      }
    }
    
    detailLines.push('')
    detailLines.push(theme.fg('dim', '👉 ') + theme.fg('accent', 'Enter ') + theme.fg('dim', 'actions'))
    return detailLines
  }

  if (state.focus === 'mailbox') {
    const selectedMailbox = selection.selectedMailbox
    if (!selectedMailbox) {
      detailLines.push(theme.fg('muted', '📬 No mailbox item selected'))
      return detailLines
    }

    const type = mailboxType(selectedMailbox)
    detailLines.push(`📬 ${theme.fg(mailboxTypeColor(type), mailboxTypeIcon(type))} ${theme.bold(theme.fg(mailboxTypeColor(type), type))}  ${theme.fg('dim', `from `)}${theme.fg('accent', selectedMailbox.from)}`)
    detailLines.push('')
    detailLines.push(renderDetailSection(theme, 'Routing'))
    detailLines.push(renderDetailField(theme, 'Time', new Date(selectedMailbox.createdAt).toLocaleTimeString(), 'text'))
    detailLines.push(renderDetailField(theme, 'References', `${selectedMailbox.taskId ?? '-'} / ${selectedMailbox.threadId ?? '-'}`, 'text'))
    
    if (state.isDetailExpanded) {
      detailLines.push('')
      detailLines.push(renderDetailSeparator(theme, textWidth))
      detailLines.push(renderDetailSection(theme, 'Content'))
      detailLines.push(...renderDetailBlock(theme, 'Summary', selectedMailbox.summary ?? '(none)', textWidth, 'text'))
      detailLines.push('')
      detailLines.push(...renderDetailBlock(theme, 'Text', selectedMailbox.text || '(none)', textWidth, 'text'))
    } else {
      const summary = (selectedMailbox.summary ?? '(none)').replace(/\n/g, ' ')
      detailLines.push('')
      detailLines.push(renderDetailSection(theme, 'Content'))
      detailLines.push(renderDetailField(theme, 'Summary', short(summary, Math.max(12, textWidth - 16)), 'text'))
      const text = (selectedMailbox.text || '(none)').replace(/\n/g, ' ')
      detailLines.push(renderDetailField(theme, 'Text', short(text, Math.max(12, textWidth - 16)), 'text'))
    }
    
    detailLines.push('')
    detailLines.push(theme.fg('dim', '👉 ') + theme.fg('accent', 'Enter ') + theme.fg('dim', 'actions'))
    return detailLines
  }

  return detailLines
}

function detailReaderSubject(
  data: PanelData,
  state: TeamPanelState,
  selection: PanelSelectionView,
): string {
  if (data.mode === 'global') {
    if (state.focus === 'panes') return selection.selectedPane ? `pane ${selection.selectedPane.paneId}` : 'stale panes'
    return selection.selectedTeam ? `team ${selection.selectedTeam.name}` : 'teams'
  }
  if (state.focus === 'tasks') return selection.selectedTask ? `task ${selection.selectedTask.id}` : 'tasks'
  if (state.focus === 'mailbox') return selection.selectedMailbox ? `message from ${selection.selectedMailbox.from}` : 'mailbox'
  return selection.selectedMember ? `member ${selection.selectedMember.name}` : 'members'
}

function renderDetailReaderLines(
  theme: ExtensionContext['ui']['theme'],
  input: {
    width: number
    height?: number
    overviewLine: string
    hint: string
    data: PanelData
    state: TeamPanelState
    selection: PanelSelectionView
  },
): string[] {
  const safeHeight = Math.max(16, Math.floor(input.height ?? 40))
  const safeWidth = Math.max(56, input.width)
  const fullDetailLines = input.data.mode === 'global'
    ? renderGlobalDetailLines(theme, input.data, input.state, input.selection)
    : renderDetailLines(theme, input.data, input.state, input.selection, safeWidth)

  // overview + blank + box borders + blank + footer = 6 rows outside body.
  const bodyHeight = Math.max(4, safeHeight - 6)
  const maxOffset = Math.max(0, fullDetailLines.length - bodyHeight)
  const offset = Math.max(0, Math.min(input.state.detailScrollOffset, maxOffset))
  input.state.detailScrollOffset = offset
  const visibleDetailLines = fullDetailLines.slice(offset, offset + bodyHeight)
  const start = fullDetailLines.length === 0 ? 0 : offset + 1
  const end = Math.min(fullDetailLines.length, offset + visibleDetailLines.length)
  const scrollSuffix = `${start}-${end}/${fullDetailLines.length}${offset > 0 ? ' ↑' : ''}${offset < maxOffset ? ' ↓' : ''}`
  const detailBox = drawBox(theme, {
    width: safeWidth,
    title: `🔎 Details · ${detailReaderSubject(input.data, input.state, input.selection)} · ${scrollSuffix}`,
    lines: visibleDetailLines,
    focused: true,
  })

  return [
    input.overviewLine,
    '',
    ...detailBox,
    '',
    `  ${input.hint}`,
  ].map(line => truncateToWidth(line, input.width, ''))
}

export function renderTeamPanelLines(
  theme: ExtensionContext['ui']['theme'],
  input: RenderLayoutInput,
): string[] {
  const { width, height, data, state, selection } = input

  const safeWidth = Math.max(56, width)

  const escHint = state.interactionMode === 'action-menu'
    ? 'back'
    : state.isDetailExpanded
      ? 'collapse details'
      : 'close'
  const moveHint = state.isDetailExpanded ? 'scroll details' : 'move'
  const globalHint = theme.fg(
    'dim',
    '⌨ ') + theme.fg('accent', '↑↓ ') + theme.fg('dim', `${moveHint} · `) + theme.fg('accent', 'Tab ') + theme.fg('dim', 'section · ') + theme.fg('accent', 'Enter ') + theme.fg('dim', 'actions · ') + theme.fg('accent', 'Esc ') + theme.fg('dim', escHint)

  const overviewStr = truncateToWidth(renderOverviewLine(theme, data), width - 2)
  const overviewLine = `  ${overviewStr}`

  if (state.isDetailExpanded && state.interactionMode !== 'action-menu') {
    return renderDetailReaderLines(theme, {
      width,
      height,
      overviewLine,
      hint: globalHint,
      data,
      state,
      selection,
    })
  }

  if (data.mode === 'global') {
    const teamsLines = renderGlobalTeamLines(theme, data, state)
    const panesLines = renderGlobalPaneLines(theme, data, state)
    const detailLines = state.interactionMode === 'action-menu' && state.actionMenu
      ? renderActionMenuLines(theme, state.actionMenu)
      : renderGlobalDetailLines(theme, data, state, selection)
    const useGlobalColumns = safeWidth >= 112
    const gap = 2
    const leftWidth = useGlobalColumns ? Math.max(54, Math.floor((safeWidth - gap) * 0.45)) : safeWidth
    const rightWidth = useGlobalColumns ? Math.max(54, safeWidth - gap - leftWidth) : safeWidth
    const listHeight = Math.max(teamsLines.length, panesLines.length, 8)
    const teamsBox = drawBox(theme, {
      width: leftWidth,
      title: `🤝 Teams (${data.teams.length})${state.focus === 'teams' ? '  ✦' : ''}`,
      lines: teamsLines,
      focused: state.focus === 'teams',
      minContentLines: useGlobalColumns ? listHeight : undefined,
    })
    const panesBox = drawBox(theme, {
      width: leftWidth,
      title: `🧹 Stale panes (${data.orphanPanes.length})${state.focus === 'panes' ? '  ✦' : ''}`,
      lines: panesLines,
      focused: state.focus === 'panes',
      minContentLines: useGlobalColumns ? listHeight : undefined,
    })
    const detailsBox = drawBox(theme, {
      width: useGlobalColumns ? rightWidth : safeWidth,
      title: state.interactionMode === 'action-menu' ? '⚙ Actions' : `🔎 Details${state.isDetailExpanded ? '  expanded' : ''}`,
      lines: detailLines,
      focused: state.interactionMode === 'action-menu',
      minContentLines: useGlobalColumns ? (listHeight * 2 + 3) : undefined,
    })
    if (!useGlobalColumns) {
      return [
        overviewLine,
        '',
        ...teamsBox,
        '',
        ...panesBox,
        '',
        ...detailsBox,
        '',
        `  ${globalHint}`,
      ].map(line => truncateToWidth(line, width, ''))
    }
    const leftColumn = [...teamsBox, '', ...panesBox]
    const grid = mergeColumns(leftColumn, detailsBox, leftWidth, rightWidth, gap)
    return [
      overviewLine,
      '',
      ...grid,
      '',
      `  ${globalHint}`,
    ].map(line => truncateToWidth(line, width, ''))
  }

  const membersLines = renderMembersLines(theme, data, state)
  const taskLines = renderTaskLines(theme, state, selection)
  const mailboxLines = renderMailboxLines(theme, state, selection)
  const useTwoColumns = safeWidth >= 112
  const gap = 2
  const leftWidth = useTwoColumns ? Math.max(54, Math.floor((safeWidth - gap) * 0.45)) : safeWidth
  const rightWidth = useTwoColumns ? Math.max(54, safeWidth - gap - leftWidth) : safeWidth

  const leftListHeight = Math.max(membersLines.length, taskLines.length, 7)

  const membersBox = drawBox(theme, {
    width: leftWidth,
    title: `👥 Members (${data.members.length})${state.focus === 'members' ? '  ✦' : ''}`,
    lines: membersLines,
    focused: state.focus === 'members',
    minContentLines: useTwoColumns ? leftListHeight : undefined,
  })
  const tasksBox = drawBox(theme, {
    width: leftWidth,
    title: `📋 Tasks (${selection.visibleTasks.length})${state.focus === 'tasks' ? '  ✦' : ''}`,
    lines: taskLines,
    focused: state.focus === 'tasks',
    minContentLines: useTwoColumns ? leftListHeight : undefined,
  })
  const mailboxBox = drawBox(theme, {
    width: rightWidth,
    title: `📬 Mailbox (${selection.visibleMailbox.length})${state.focus === 'mailbox' ? '  ✦' : ''}`,
    lines: mailboxLines,
    focused: state.focus === 'mailbox',
    minContentLines: useTwoColumns ? leftListHeight : undefined,
  })

  const detailWidth = useTwoColumns ? rightWidth : safeWidth
  const detailLines = state.interactionMode === 'action-menu' && state.actionMenu
    ? renderActionMenuLines(theme, state.actionMenu)
    : renderDetailLines(theme, data, state, selection, detailWidth)
  const detailBox = drawBox(theme, {
    width: detailWidth,
    title: state.interactionMode === 'action-menu' ? '⚙ Actions' : `🔎 Details${state.isDetailExpanded ? '  expanded' : ''}`,
    lines: detailLines,
    focused: state.interactionMode === 'action-menu',
    minContentLines: useTwoColumns ? leftListHeight : undefined,
  })

  if (!useTwoColumns) {
    const lines = [
      overviewLine,
      '',
      ...membersBox,
      '',
      ...tasksBox,
      '',
      ...mailboxBox,
      '',
      ...detailBox,
      '',
      `  ${globalHint}`,
    ]
    return lines.map(line => truncateToWidth(line, width, ''))
  }

  const leftColumn = [...membersBox, '', ...tasksBox]
  const rightColumn = [...mailboxBox, '', ...detailBox]
  const grid = mergeColumns(leftColumn, rightColumn, leftWidth, rightWidth, gap)

  const lines = [
    overviewLine,
    '',
    ...grid,
    '',
    `  ${globalHint}`,
  ]

  return lines.map(line => truncateToWidth(line, width, ''))
}
