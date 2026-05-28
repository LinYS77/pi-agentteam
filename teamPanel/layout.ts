import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { truncateToWidth } from '@earendil-works/pi-tui'
import { bridgeLeaseMismatchReason, getBridgeLease, staleBridge } from '../state/bridgeStore.js'
import { BRIDGE_PACKAGE_VERSION, BRIDGE_PROTOCOL_VERSION } from '../adapters/bridge/index.js'
import { isMailboxMessageUnread } from '../messageLifecycle.js'
import type {
  PanelData,
  PanelSelectionView,
  TeamPanelState,
  TeamRuntimeDiagnostics,
} from './viewModel.js'
import { buildTeamAttentionSummary, hasUnreadBlockedReportAttention, latestVisibleTaskNote, mailboxType, taskReferenceSummary } from './viewModel.js'
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
  memberHealthBadge,
  memberHealthLabel,
  memberPaneLabel,
  projectMemberHealth,
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
    const quarantine = data.quarantinedTeams.length > 0
      ? ` ${theme.fg('dim', '│')} ${overviewPart(theme, 'Quarantine', theme.fg('warning', String(data.quarantinedTeams.length)))}`
      : ''
    return `${theme.bold(theme.fg('text', '✦  AgentTeam Console '))} ${theme.fg('dim', '│')} ${overviewPart(theme, 'Attention', attentionText)} ${theme.fg('dim', '│')} ${overviewPart(theme, 'Teams', String(data.teams.length))} ${theme.fg('dim', '│')} ${overviewPart(theme, 'Stale panes', String(data.orphanPanes.length))}${quarantine}`
  }

  const offlineCount = data.members.filter(member => projectMemberHealth(member) === 'offline').length
  const idleCount = data.members.filter(member => projectMemberHealth(member) === 'idle').length
  const busyCount = data.members.filter(member => projectMemberHealth(member) === 'busy').length
  const errorCount = data.members.filter(member => projectMemberHealth(member) === 'error').length

  const openCount = data.tasks.filter(task => task.status === 'open').length
  const blockedCount = data.tasks.filter(task => task.status === 'blocked').length
  const doneCount = data.tasks.filter(task => task.status === 'done').length

  const blockedMsgCount = data.mailbox.filter(hasUnreadBlockedReportAttention).length
  const unreadMsgCount = data.mailbox.filter(isMailboxMessageUnread).length

  const tName = theme.bold(theme.fg('text', `✦  ${data.team.name} `))

  const mStatus = `${theme.fg('warning', `◇ ${offlineCount}`)} ${theme.fg('dim', `○ ${idleCount}`)} ${theme.fg('accent', `⋯ ${busyCount}`)}${errorCount ? ` ${theme.fg('error', `⚠ ${errorCount}`)}` : ''}`
  const tStatus = `${theme.fg('dim', `○ ${openCount}`)} ${theme.fg('error', `⚠ ${blockedCount}`)} ${theme.fg('success', `✔ ${doneCount}`)}`
  const sStatus = `${theme.fg(unreadMsgCount > 0 ? 'warning' : 'dim', `${unreadMsgCount} unread`)} · ${theme.fg(blockedMsgCount > 0 ? 'error' : 'dim', `${blockedMsgCount} unread blocked reports`)} · total ${data.mailbox.length}`
  const attention = foldAttentionParts(theme, attentionSummaryParts(theme, buildTeamAttentionSummary(data.team, data.mailbox)))
  const attentionText = attention.length > 0 ? attention.join(theme.fg('dim', ' · ')) : theme.fg('dim', 'OK')

  return `${tName} ${theme.fg('dim', '│')} ${overviewPart(theme, 'Attention', attentionText)}  ${theme.fg('dim', '│')} ${overviewPart(theme, '👥 Members', mStatus)}  ${theme.fg('dim', '│')} ${overviewPart(theme, '📋 Tasks', tStatus)}  ${theme.fg('dim', '│')} ${overviewPart(theme, '📬 Mail', sStatus)}`
}

function renderDetailSection(theme: ExtensionContext['ui']['theme'], label: string): string {
  return theme.bold(theme.fg('dim', label))
}

function renderOutboxDiagnosticsLines(
  theme: ExtensionContext['ui']['theme'],
  diagnostics: TeamRuntimeDiagnostics | undefined,
): string[] {
  const outbox = diagnostics?.outbox
  if (!outbox) return []
  const pending = outbox.pending
  const failed = outbox.failed
  const lines = [
    renderDetailField(theme, 'Outbox', `pending ${pending} · failed ${failed}`, failed ? 'error' : pending ? 'warning' : 'text'),
  ]
  if (outbox.lastRunAt) {
    lines.push(renderDetailField(theme, 'Outbox run', formatDateTime(outbox.lastRunAt), 'text'))
  }
  if (outbox.lastFailedEffect) {
    const failedEffect = outbox.lastFailedEffect
    lines.push(renderDetailField(theme, 'Outbox failed', `${failedEffect.effectId} · ${failedEffect.kind}`, 'error'))
    if (failedEffect.error) lines.push(renderDetailField(theme, 'Outbox error', short(failedEffect.error, 80), 'error'))
  }
  return lines
}

function renderQuarantineSummaryLines(
  theme: ExtensionContext['ui']['theme'],
  data: Extract<PanelData, { mode: 'global' }>,
): string[] {
  if (data.quarantinedTeams.length === 0) return []
  const latest = data.quarantinedTeams[0]
  const firstReason = latest?.reasons[0]
  const lines = [
    renderDetailField(theme, 'Legacy quarantine', `${data.quarantinedTeams.length} team(s) quarantined`, 'warning'),
  ]
  if (latest) {
    const reasonText = firstReason ? firstReason.code : 'unsupported persisted state'
    lines.push(renderDetailField(theme, 'Latest quarantine', `${latest.teamName} · ${reasonText}`, 'warning'))
  }
  return lines
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
      if (state.isDetailExpanded && data.quarantinedTeams.length > 0) {
        detailLines.push('')
        detailLines.push(renderDetailSeparator(theme, 44))
        detailLines.push(renderDetailSection(theme, 'Diagnostics'))
        detailLines.push(...renderQuarantineSummaryLines(theme, data))
      }
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
      const offlineCount = teammates.filter(member => projectMemberHealth(member) === 'offline').length
      const idleCount = teammates.filter(member => projectMemberHealth(member) === 'idle').length
      const busyCount = teammates.filter(member => projectMemberHealth(member) === 'busy').length
      const errorCount = teammates.filter(member => projectMemberHealth(member) === 'error').length
      const openCount = tasks.filter(task => task.status === 'open').length
      const blockedCount = tasks.filter(task => task.status === 'blocked').length
      const doneCount = tasks.filter(task => task.status === 'done').length
      const unownedCount = tasks.filter(task => task.status !== 'done' && !task.owner).length
      const attentionParts = summary ? attentionSummaryParts(theme, summary) : []
      detailLines.push(renderDetailSection(theme, 'Status'))
      detailLines.push(renderDetailField(theme, 'Teammates', String(teammates.length), 'text'))
      detailLines.push(renderDetailField(theme, 'Worker health', `offline ${offlineCount} · idle ${idleCount} · busy ${busyCount} · error ${errorCount}`, errorCount ? 'warning' : 'text'))
      detailLines.push(renderDetailField(theme, 'Tasks', `open ${openCount} · blocked ${blockedCount} · done ${doneCount} · unowned ${unownedCount}`, blockedCount || unownedCount ? 'warning' : 'text'))
      detailLines.push(renderDetailField(theme, 'Mailbox', mailbox ? `unread ${mailbox.unread} · unread blocked reports ${mailbox.blocked} · total ${mailbox.total}` : 'unread 0 · unread blocked reports 0 · total 0', mailbox && (mailbox.unread || mailbox.blocked) ? 'warning' : 'text'))
      detailLines.push(renderDetailField(theme, 'Attention', attentionParts.join(' · ') || 'OK', attentionParts.length > 0 ? 'warning' : 'text'))
      if (state.isDetailExpanded) {
        detailLines.push('')
        detailLines.push(renderDetailSeparator(theme, 44))
        detailLines.push(renderDetailSection(theme, 'Diagnostics'))
        detailLines.push(...renderOutboxDiagnosticsLines(theme, data.teamDiagnostics[team.name]))
        detailLines.push(...renderQuarantineSummaryLines(theme, data))
      }
      detailLines.push('')
      detailLines.push(renderDetailSection(theme, 'Identity'))
      detailLines.push(renderDetailField(theme, 'Leader pane', leader?.paneId ?? 'missing', leader?.paneId ? 'text' : 'warning'))
      detailLines.push(renderDetailField(theme, 'Created', new Date(team.createdAt).toLocaleString(), 'text'))

      if (mailbox?.latestAttention) {
        const latest = mailbox.latestAttention
        const latestType = mailboxType(latest)
        detailLines.push('')
        detailLines.push(renderDetailSection(theme, 'Latest attention'))
        detailLines.push(...renderDetailBlock(theme, `Latest mail attention · ${latestType} · ${latest.from}`, latest.summary ?? latest.text, 44, latestType === 'report_blocked' ? 'error' : 'text'))
      } else {
        const latestBlocked = tasks
          .filter(task => task.status === 'blocked' || (task.status !== 'done' && !task.owner))
          .sort((a, b) => b.updatedAt - a.updatedAt)[0]
        if (latestBlocked) {
          const kind = latestBlocked.status === 'blocked' ? 'blocked task' : 'unowned task'
          detailLines.push('')
          detailLines.push(renderDetailSection(theme, 'Latest attention'))
          detailLines.push(...renderDetailBlock(theme, `Latest task attention · ${kind} · ${latestBlocked.id}`, latestBlocked.title, 44, latestBlocked.status === 'blocked' ? 'error' : 'warning'))
        }
      }

      if (state.isDetailExpanded && data.quarantinedTeams.length > 0) {
        detailLines.push('')
        detailLines.push(renderDetailSeparator(theme, 44))
        detailLines.push(renderDetailSection(theme, 'Quarantined legacy teams'))
        for (const item of data.quarantinedTeams.slice(0, 5)) {
          const firstReason = item.reasons[0]
          const reasonText = firstReason ? firstReason.code : 'unsupported persisted state'
          detailLines.push(renderDetailField(theme, item.teamName, reasonText, 'warning'))
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

    const activeTasks = data.tasks.filter(task => task.owner === selectedMember.name && task.status !== 'done').length
    const msgCount = data.mailbox.filter(item => item.from === selectedMember.name).length
    detailLines.push(`👤 ${theme.bold(theme.fg('text', selectedMember.name))}  ${memberHealthBadge(theme, selectedMember)}  ${theme.fg('dim', selectedMember.role)}`)
    detailLines.push('')
    detailLines.push(renderDetailSection(theme, 'Status'))
    detailLines.push(renderDetailField(theme, 'Health', memberHealthLabel(selectedMember), memberHealthColor(selectedMember)))
    detailLines.push(renderDetailField(theme, 'Model', selectedMember.model || '(default)', selectedMember.model ? 'text' : 'dim'))
    detailLines.push(renderDetailField(theme, 'Pane', memberPaneLabel(selectedMember), selectedMember.paneId ? 'text' : 'warning'))
    if (selectedMember.windowTarget) detailLines.push(renderDetailField(theme, 'Window', selectedMember.windowTarget, 'text'))
    detailLines.push(renderDetailField(theme, 'Tasks', String(activeTasks), 'text'))
    detailLines.push(renderDetailField(theme, 'Mailbox', String(msgCount), 'text'))
    detailLines.push('')
    detailLines.push(renderDetailSection(theme, 'Session'))
    detailLines.push(renderDetailField(theme, 'Session', basename(selectedMember.sessionFile), 'text'))
    detailLines.push(renderDetailField(theme, 'Updated', `${formatDateTime(selectedMember.updatedAt)} (${formatAge(Date.now() - selectedMember.updatedAt)} ago)`, 'text'))
    detailLines.push(renderDetailField(theme, 'Created', formatDateTime(selectedMember.createdAt), 'text'))
    if (state.isDetailExpanded) {
      const hasBridgeDiagnostics = selectedMember.bridgeAvailable !== undefined || selectedMember.bridgeLastSeenAt || selectedMember.bridgeLastError
      detailLines.push('')
      detailLines.push(renderDetailSeparator(theme, textWidth))
      detailLines.push(renderDetailSection(theme, 'Diagnostics'))
      if (hasBridgeDiagnostics) {
        const bridgeAge = selectedMember.bridgeLastSeenAt ? `${formatAge(Date.now() - selectedMember.bridgeLastSeenAt)} ago` : 'never'
        const lease = getBridgeLease(data.team.name, selectedMember.name)
        const mismatch = bridgeLeaseMismatchReason(lease, {
          memberName: selectedMember.name,
          sessionFile: selectedMember.sessionFile,
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          packageVersion: BRIDGE_PACKAGE_VERSION,
        })
        const bridgeReady = Boolean(lease && !mismatch && !staleBridge(lease))
        const bridgeState = bridgeReady
          ? `ready · seen ${bridgeAge} · gen ${lease?.generation ?? '-'}`
          : `${selectedMember.bridgeAvailable ? 'stale' : 'unavailable'} · ${mismatch ?? 'no active lease'} · seen ${bridgeAge}`
        detailLines.push(renderDetailField(theme, 'Bridge', bridgeState, bridgeReady ? 'success' : selectedMember.bridgeLastError ? 'error' : 'dim'))
        if (selectedMember.bridgeLastDeliveryAt) detailLines.push(renderDetailField(theme, 'Bridge delivery', formatDateTime(selectedMember.bridgeLastDeliveryAt), 'text'))
        if (selectedMember.bridgeWorkRequestedAt) detailLines.push(renderDetailField(theme, 'Bridge requested', `${formatDateTime(selectedMember.bridgeWorkRequestedAt)} · count ${selectedMember.bridgeWorkRequestCount ?? 1}`, 'text'))
        if (selectedMember.bridgeLastError) detailLines.push(renderDetailField(theme, 'Bridge error', selectedMember.bridgeLastError, 'error'))
      }
      detailLines.push(renderDetailField(theme, 'Runtime status', selectedMember.status, 'dim'))
      detailLines.push(...renderOutboxDiagnosticsLines(theme, { outbox: data.outboxDiagnostics }))
    }
    if (state.isDetailExpanded && selectedMember.lastWakeReason) detailLines.push(renderDetailField(theme, 'Wake', selectedMember.lastWakeReason, 'text'))
    if (state.isDetailExpanded && selectedMember.lastError) detailLines.push(renderDetailField(theme, 'Error', selectedMember.lastError, 'error'))

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
    
    const latest = latestVisibleTaskNote(selectedTask)
    const refs = taskReferenceSummary(selectedTask)
    if (state.isDetailExpanded) {
      detailLines.push('')
      detailLines.push(renderDetailSeparator(theme, textWidth))
      detailLines.push(renderDetailSection(theme, 'Content'))
      detailLines.push(...renderDetailBlock(theme, 'Description', selectedTask.description || '(none)', textWidth, 'text'))

      if (latest) {
        detailLines.push('')
        detailLines.push(...renderDetailBlock(theme, `Latest note · ${latest.author}`, latest.text, textWidth, 'text'))
      }
      if (refs.total > 0) {
        detailLines.push(renderDetailField(theme, 'References', `${refs.total} folded (${refs.hidden} hidden, ${refs.folded} legacy)`, 'dim'))
      }
    } else {
      const desc = (selectedTask.description || '(none)').replace(/\n/g, ' ')
      detailLines.push('')
      detailLines.push(renderDetailSection(theme, 'Content'))
      detailLines.push(renderDetailField(theme, 'Description', short(desc, Math.max(12, textWidth - 16)), 'text'))
      if (latest) {
        detailLines.push(renderDetailField(theme, 'Latest note', short(latest.text.replace(/\n/g, ' '), Math.max(12, textWidth - 16)), 'text'))
      }
      if (refs.total > 0) {
        detailLines.push(renderDetailField(theme, 'Refs', `${refs.total} folded`, 'dim'))
      }
    }
    if (state.isDetailExpanded) {
      detailLines.push('')
      detailLines.push(renderDetailSeparator(theme, textWidth))
      detailLines.push(renderDetailSection(theme, 'Diagnostics'))
      detailLines.push(...renderOutboxDiagnosticsLines(theme, { outbox: data.outboxDiagnostics }))
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
    if (state.isDetailExpanded) {
      detailLines.push('')
      detailLines.push(renderDetailSeparator(theme, textWidth))
      detailLines.push(renderDetailSection(theme, 'Diagnostics'))
      detailLines.push(...renderOutboxDiagnosticsLines(theme, { outbox: data.outboxDiagnostics }))
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
