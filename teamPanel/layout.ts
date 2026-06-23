import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'
import { bridgeLeaseMismatchReason, getBridgeLease, staleBridge } from '../state/bridgeStore.js'
import { BRIDGE_PACKAGE_VERSION, BRIDGE_PROTOCOL_VERSION } from '../adapters/bridge/index.js'
import type {
  LeaderMailboxItem,
  PanelData,
  PanelSelectionView,
  TeamPanelState,
  TeamRuntimeDiagnostics,
} from './viewModel.js'
import { buildTeamAttentionSummary, mailboxType, taskHistorySummary, teamDisplayName, teamProjectDisambiguator, teamSlug } from './viewModel.js'
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
  renderCockpitQueueLines,
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

function renderTab(
  theme: ExtensionContext['ui']['theme'],
  label: string,
  count: number | undefined,
  active: boolean,
  countColor: Parameters<ExtensionContext['ui']['theme']['fg']>[0] = 'dim',
): string {
  const badge = count && count > 0 ? ` ${theme.fg(countColor, `(${count})`)}` : ''
  const text = `${label}${badge}`
  return active
    ? theme.bold(`${theme.fg('accent', '●')} ${theme.fg('accent', text)}`)
    : theme.fg('dim', text)
}

function renderHeaderLines(
  theme: ExtensionContext['ui']['theme'],
  width: number,
  overview: string,
  tabBar: string,
  combineIdentityAndTabs: boolean,
  tabRightInset = 0,
): string[] {
  const contentWidth = Math.max(0, width - 2)
  const tabWidth = visibleWidth(tabBar)
  const safeInset = Math.max(0, Math.min(tabRightInset, Math.max(0, contentWidth - tabWidth - 2)))

  if (combineIdentityAndTabs && tabWidth + 16 + safeInset <= contentWidth) {
    const overviewText = truncateToWidth(overview, Math.max(12, contentWidth - tabWidth - safeInset - 2))
    const gap = Math.max(2, contentWidth - visibleWidth(overviewText) - tabWidth - safeInset)
    return [`  ${overviewText}${' '.repeat(gap)}${tabBar}`]
  }

  return [`  ${truncateToWidth(overview, contentWidth)}`, `  ${truncateToWidth(tabBar, Math.max(0, contentWidth - safeInset))}`]
}

function renderMasterFooter(scope: 'team' | 'global', focused: boolean): string | undefined {
  return focused ? `↑↓ move · r refresh · Enter item · a ${scope}` : undefined
}

function renderDetailFooter(state: TeamPanelState): string | undefined {
  if (state.interactionMode === 'action-menu') {
    return state.actionMenu?.confirmingAction
      ? '↑↓ choose · Enter choose · default Cancel · Esc cancel'
      : '↑↓ choose · Enter run · Esc cancel'
  }
  return state.scrollFocus === 'detail' ? '↑↓ scroll · e list · q close' : undefined
}

function renderOverviewLine(theme: ExtensionContext['ui']['theme'], data: PanelData): string {
  if (data.mode === 'global') {
    const globalAttention = sumAttentionSummaries(Object.values(data.teamSummaries))
    const attention = foldAttentionParts(theme, attentionSummaryParts(theme, globalAttention))
    const attentionText = attention.length > 0 ? attention.join(theme.fg('dim', ' · ')) : theme.fg('dim', 'OK')
    const quarantine = data.quarantinedTeams.length > 0
      ? ` ${theme.fg('dim', '│')} ${overviewPart(theme, 'Quarantine', theme.fg('warning', String(data.quarantinedTeams.length)))}`
      : ''
    return `${theme.bold(theme.fg('text', '✦  AgentTeam Console'))} ${theme.fg('dim', '│')} ${overviewPart(theme, 'Attention', attentionText)} ${theme.fg('dim', '│')} ${overviewPart(theme, 'Teams', String(data.teams.length))} ${theme.fg('dim', '│')} ${overviewPart(theme, 'Stale panes', String(data.orphanPanes.length))}${quarantine}`
  }

  const attention = foldAttentionParts(theme, attentionSummaryParts(theme, buildTeamAttentionSummary(data.team, data.mailbox)))
  const attentionText = attention.length > 0
    ? ` ${theme.fg('dim', '·')} ${attention.join(theme.fg('dim', ' · '))}`
    : ''

  return `${theme.bold(theme.fg('text', `✦  ${data.team.name}`))}${attentionText}`
}

function renderDetailSection(theme: ExtensionContext['ui']['theme'], label: string): string {
  return theme.bold(theme.fg('dim', label))
}

function renderPanelReportSummary(report: ReturnType<typeof taskHistorySummary>['latestReport']): string {
  if (!report) return '-'
  return `${report.id} ${report.type} — ${report.summary || '-'} (by ${short(report.author, 18)})`
}

function renderPanelActivitySummary(activity: ReturnType<typeof taskHistorySummary>['latestActivity']): string {
  if (!activity) return '-'
  if (activity.kind === 'report') return `report ${activity.id} ${activity.type} — ${activity.summary || '-'} (by ${short(activity.by, 18)})`
  if (activity.kind === 'messageRef') return `messageRef ${activity.id} ${activity.type} — ${activity.summary ?? '(no summary)'} (${short(activity.from, 14)}->${short(activity.to, 14)})`
  return `event ${activity.id} ${activity.displayType} — ${activity.summary || '-'} (by ${short(activity.by, 18)})`
}

function compactMailboxSummary(message: LeaderMailboxItem): string {
  const summary = message.summary?.trim()
  return (summary ? summary : '(no summary)').replace(/\n/g, ' ')
}

function mailboxMetadataString(message: LeaderMailboxItem, key: string): string | undefined {
  const value = message.metadata?.[key]
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function renderMailboxReadBoundaryFields(
  theme: ExtensionContext['ui']['theme'],
  message: LeaderMailboxItem,
): string[] {
  const lines: string[] = []
  const reportId = mailboxMetadataString(message, 'reportId')
  if (reportId) lines.push(renderDetailField(theme, 'Report', `agentteam_task action=report reportId=${reportId}`, 'dim'))
  lines.push(renderDetailField(theme, 'Full text', 'agentteam_receive({ markRead: true })', 'dim'))
  lines.push(renderDetailField(theme, 'Panel', 'compact only; does not mark delivered/read', 'dim'))
  return lines
}

function renderTaskHistorySummaryFields(
  theme: ExtensionContext['ui']['theme'],
  history: ReturnType<typeof taskHistorySummary>,
  textWidth: number,
): string[] {
  const lines = [
    renderDetailField(theme, 'History', `reports ${history.reports} · events ${history.events} · messageRefs ${history.messageRefs}`, history.reports || history.messageRefs ? 'text' : 'dim'),
  ]
  if (history.latestReport) {
    lines.push(renderDetailField(theme, 'Latest report', short(renderPanelReportSummary(history.latestReport), Math.max(12, textWidth - 16)), 'success'))
  }
  if (history.latestActivity) {
    lines.push(renderDetailField(theme, 'Latest activity', short(renderPanelActivitySummary(history.latestActivity), Math.max(12, textWidth - 16)), 'text'))
  }
  if (history.latestReport) {
    lines.push(renderDetailField(theme, 'Full report', `agentteam_task action=report reportId=${history.latestReport.id}`, 'dim'))
  }
  return lines
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
      const displayName = teamDisplayName(team)
      detailLines.push(`🤝 ${theme.bold(theme.fg('text', displayName))}`)
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
      detailLines.push(renderDetailField(theme, 'Display', displayName, 'text'))
      detailLines.push(renderDetailField(theme, 'Slug', teamSlug(team), 'dim'))
      detailLines.push(renderDetailField(theme, 'Storage key', team.name, 'dim'))
      detailLines.push(renderDetailField(theme, 'Project cwd', teamProjectDisambiguator(team), 'dim'))
      if (team.identity?.projectKey) detailLines.push(renderDetailField(theme, 'Project key', team.identity.projectKey, 'dim'))
      if (team.identity?.teamId) detailLines.push(renderDetailField(theme, 'Team id', team.identity.teamId, 'dim'))
      detailLines.push(renderDetailField(theme, 'Leader pane', leader?.paneId ?? 'missing', leader?.paneId ? 'text' : 'warning'))
      detailLines.push(renderDetailField(theme, 'Created', new Date(team.createdAt).toLocaleString(), 'text'))

      if (mailbox?.latestAttention) {
        const latest = mailbox.latestAttention
        const latestType = mailboxType(latest)
        detailLines.push('')
        detailLines.push(renderDetailSection(theme, 'Latest attention'))
        detailLines.push(...renderDetailBlock(theme, `Latest mail attention · ${latestType} · ${latest.from}`, compactMailboxSummary(latest), 44, latestType === 'report_blocked' ? 'error' : 'text'))
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
  detailLines.push(theme.fg('dim', '👉 ') + theme.fg('accent', 'Enter ') + theme.fg('dim', 'item actions · ') + theme.fg('accent', 'a ') + theme.fg('dim', 'global actions'))
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

  if (state.focus === 'cockpit') {
    const selectedCockpitItem = selection.selectedCockpitItem
    if (!selectedCockpitItem) {
      detailLines.push(theme.fg('muted', '☰ No cockpit item selected'))
      return detailLines
    }

    if (selectedCockpitItem.kind === 'task') {
      const task = selectedCockpitItem.task
      detailLines.push(`☰ ${theme.bold(theme.fg('accent', task.id))}  ${taskStatusBadge(theme, task.status)}  ${theme.fg('text', short(task.title, Math.max(12, textWidth - 25)))}`)
      detailLines.push('')
      detailLines.push(renderDetailSection(theme, 'Queue item'))
      detailLines.push(renderDetailField(theme, 'Kind', 'task', 'text'))
      detailLines.push(renderDetailField(theme, 'Owner', task.owner ?? '-', task.owner ? 'text' : 'warning'))
      detailLines.push(renderDetailField(theme, 'Attention', selectedCockpitItem.attention.join(' · ') || 'active', selectedCockpitItem.attention.length > 0 ? 'warning' : 'dim'))
      if (task.blockedBy.length > 0) {
        detailLines.push(renderDetailField(theme, 'Blocked by', task.blockedBy.join(','), 'error'))
      }
    } else {
      const message = selectedCockpitItem.message
      const type = mailboxType(message)
      detailLines.push(`☰ ${theme.fg(mailboxTypeColor(type), mailboxTypeIcon(type))} ${theme.bold(theme.fg(mailboxTypeColor(type), type))}  ${theme.fg('dim', `from `)}${theme.fg('accent', message.from)}`)
      detailLines.push('')
      detailLines.push(renderDetailSection(theme, 'Queue item'))
      detailLines.push(renderDetailField(theme, 'Kind', 'mailbox', 'text'))
      detailLines.push(renderDetailField(theme, 'Time', new Date(message.createdAt).toLocaleTimeString(), 'text'))
      detailLines.push(renderDetailField(theme, 'References', `${message.taskId ?? '-'} / ${message.threadId ?? '-'}`, 'text'))
      detailLines.push(renderDetailField(theme, 'Attention', selectedCockpitItem.attention.join(' · ') || 'active', selectedCockpitItem.attention.length > 0 ? 'warning' : 'dim'))
      const summary = compactMailboxSummary(message)
      detailLines.push('')
      detailLines.push(renderDetailSection(theme, 'Content'))
      detailLines.push(renderDetailField(theme, 'Summary', short(summary, Math.max(12, textWidth - 16)), 'text'))
    }

    detailLines.push('')
    detailLines.push(theme.fg('dim', '👉 ') + theme.fg('accent', 'Tab ') + theme.fg('dim', 'tabs · ') + theme.fg('accent', 'Enter ') + theme.fg('dim', 'item actions · ') + theme.fg('accent', 'a ') + theme.fg('dim', 'team actions'))
    return detailLines
  }

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
    detailLines.push(theme.fg('dim', '👉 ') + theme.fg('accent', 'Enter ') + theme.fg('dim', 'item actions · ') + theme.fg('accent', 'a ') + theme.fg('dim', 'team actions'))
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
    
    const history = taskHistorySummary(data.team, selectedTask.id)
    if (state.isDetailExpanded) {
      detailLines.push('')
      detailLines.push(renderDetailSeparator(theme, textWidth))
      detailLines.push(renderDetailSection(theme, 'Content'))
      detailLines.push(...renderDetailBlock(theme, 'Description', selectedTask.description || '(none)', textWidth, 'text'))
      detailLines.push('')
      detailLines.push(renderDetailSection(theme, 'History'))
      detailLines.push(...renderTaskHistorySummaryFields(theme, history, textWidth))
    } else {
      const desc = (selectedTask.description || '(none)').replace(/\n/g, ' ')
      detailLines.push('')
      detailLines.push(renderDetailSection(theme, 'Content'))
      detailLines.push(renderDetailField(theme, 'Description', short(desc, Math.max(12, textWidth - 16)), 'text'))
      detailLines.push(...renderTaskHistorySummaryFields(theme, history, textWidth))
    }
    if (state.isDetailExpanded) {
      detailLines.push('')
      detailLines.push(renderDetailSeparator(theme, textWidth))
      detailLines.push(renderDetailSection(theme, 'Diagnostics'))
      detailLines.push(...renderOutboxDiagnosticsLines(theme, { outbox: data.outboxDiagnostics }))
    }
    
    detailLines.push('')
    detailLines.push(theme.fg('dim', '👉 ') + theme.fg('accent', 'Enter ') + theme.fg('dim', 'item actions · ') + theme.fg('accent', 'a ') + theme.fg('dim', 'team actions'))
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
    detailLines.push(renderDetailField(theme, 'Message', selectedMailbox.id, 'dim'))
    detailLines.push(renderDetailField(theme, 'Time', new Date(selectedMailbox.createdAt).toLocaleTimeString(), 'text'))
    detailLines.push(renderDetailField(theme, 'References', `${selectedMailbox.taskId ?? '-'} / ${selectedMailbox.threadId ?? '-'}`, 'text'))
    detailLines.push(renderDetailField(theme, 'Priority', selectedMailbox.priority ?? '-', 'text'))
    detailLines.push(renderDetailField(theme, 'Wake', selectedMailbox.wakeHint ?? '-', 'text'))
    if (selectedMailbox.requestId) detailLines.push(renderDetailField(theme, 'Request', selectedMailbox.requestId, 'dim'))
    if (selectedMailbox.replyTo) detailLines.push(renderDetailField(theme, 'Reply to', selectedMailbox.replyTo, 'dim'))
    detailLines.push(...renderMailboxReadBoundaryFields(theme, selectedMailbox))
    
    const summary = compactMailboxSummary(selectedMailbox)
    if (state.isDetailExpanded) {
      detailLines.push('')
      detailLines.push(renderDetailSeparator(theme, textWidth))
      detailLines.push(renderDetailSection(theme, 'Content'))
      detailLines.push(...renderDetailBlock(theme, 'Summary', summary, textWidth, 'text'))
    } else {
      detailLines.push('')
      detailLines.push(renderDetailSection(theme, 'Content'))
      detailLines.push(renderDetailField(theme, 'Summary', short(summary, Math.max(12, textWidth - 16)), 'text'))
    }
    if (state.isDetailExpanded) {
      detailLines.push('')
      detailLines.push(renderDetailSeparator(theme, textWidth))
      detailLines.push(renderDetailSection(theme, 'Diagnostics'))
      detailLines.push(...renderOutboxDiagnosticsLines(theme, { outbox: data.outboxDiagnostics }))
    }
    
    detailLines.push('')
    detailLines.push(theme.fg('dim', '👉 ') + theme.fg('accent', 'Enter ') + theme.fg('dim', 'item actions · ') + theme.fg('accent', 'a ') + theme.fg('dim', 'team actions'))
    return detailLines
  }

  return detailLines
}

function visibleDetailLines(
  state: TeamPanelState,
  lines: string[],
  maxContentLines: number | undefined,
): { lines: string[]; suffix: string } {
  if (maxContentLines === undefined || lines.length <= maxContentLines) {
    state.detailScrollOffset = 0
    return { lines, suffix: '' }
  }

  const bodyHeight = Math.max(4, maxContentLines)
  const maxOffset = Math.max(0, lines.length - bodyHeight)
  const offset = Math.max(0, Math.min(state.detailScrollOffset, maxOffset))
  state.detailScrollOffset = offset
  const visibleLines = lines.slice(offset, offset + bodyHeight)
  const start = lines.length === 0 ? 0 : offset + 1
  const end = Math.min(lines.length, offset + visibleLines.length)
  return {
    lines: visibleLines,
    suffix: ` · ${start}-${end}/${lines.length}${offset > 0 ? ' ↑' : ''}${offset < maxOffset ? ' ↓' : ''}`,
  }
}

function stackedMasterContentHeight(height: number | undefined): number | undefined {
  if (height === undefined) return undefined
  // Reserve about half the screen for detail/action content in stacked mode.
  return Math.max(4, Math.floor((Math.floor(height) - 10) * 0.48))
}

function stackedDetailContentHeight(height: number | undefined, masterContentLines: number): number | undefined {
  if (height === undefined) return undefined
  // overview + tabs + 2 blanks + two box borders = 8 rows outside content.
  return Math.max(4, Math.floor(height) - masterContentLines - 8)
}

function sideBySideContentHeight(height: number | undefined): number | undefined {
  if (height === undefined) return undefined
  // combined header + blank + box borders = 4 rows outside content.
  return Math.max(4, Math.floor(height) - 4)
}

export function renderTeamPanelLines(
  theme: ExtensionContext['ui']['theme'],
  input: RenderLayoutInput,
): string[] {
  const { width, height, data, state, selection } = input

  const safeWidth = Math.max(56, width)

  const overview = renderOverviewLine(theme, data)

  if (data.mode === 'global') {
    const useGlobalColumns = safeWidth >= 112
    const gap = 2
    const leftWidth = useGlobalColumns ? Math.max(48, Math.floor((safeWidth - gap) * 0.42)) : safeWidth
    const rightWidth = useGlobalColumns ? Math.max(54, safeWidth - gap - leftWidth) : safeWidth
    const masterContentHeight = useGlobalColumns ? sideBySideContentHeight(height) : stackedMasterContentHeight(height)
    const masterLines = state.focus === 'panes'
      ? renderGlobalPaneLines(theme, data, state, masterContentHeight)
      : renderGlobalTeamLines(theme, data, state, masterContentHeight)
    const masterCount = state.focus === 'panes' ? data.orphanPanes.length : data.teams.length
    const masterTitle = state.focus === 'panes' ? `🧹 Stale panes (${masterCount})` : `🤝 Teams (${masterCount})`
    const detailLines = state.interactionMode === 'action-menu' && state.actionMenu
      ? renderActionMenuLines(theme, state.actionMenu)
      : renderGlobalDetailLines(theme, data, state, selection)
    const boxHeight = Math.max(masterContentHeight ?? masterLines.length, 8)
    const tabBar = [
      renderTab(theme, 'Teams', data.teams.length, state.focus === 'teams'),
      renderTab(theme, 'Panes', data.orphanPanes.length, state.focus === 'panes'),
    ].join(theme.fg('dim', '  '))
    const headerLines = renderHeaderLines(theme, width, overview, tabBar, useGlobalColumns, useGlobalColumns ? 2 : 0)
    const masterBox = drawBox(theme, {
      width: leftWidth,
      title: `${masterTitle}${state.scrollFocus === 'list' ? '  ✦' : ''}`,
      lines: masterLines,
      focused: state.scrollFocus === 'list',
      minContentLines: useGlobalColumns ? boxHeight : undefined,
      footer: renderMasterFooter('global', state.scrollFocus === 'list' && state.interactionMode !== 'action-menu'),
    })
    const detailWindow = visibleDetailLines(
      state,
      detailLines,
      useGlobalColumns ? sideBySideContentHeight(height) : stackedDetailContentHeight(height, masterContentHeight ?? masterLines.length),
    )
    const detailsBox = drawBox(theme, {
      width: useGlobalColumns ? rightWidth : safeWidth,
      title: state.interactionMode === 'action-menu' ? '⚙ Actions' : `🔎 Details${state.scrollFocus === 'detail' ? '  ✦' : ''}${detailWindow.suffix}`,
      lines: detailWindow.lines,
      focused: state.interactionMode === 'action-menu' || state.scrollFocus === 'detail',
      minContentLines: useGlobalColumns ? boxHeight : undefined,
      footer: renderDetailFooter(state),
    })
    if (!useGlobalColumns) {
      return [
        ...headerLines,
        '',
        ...masterBox,
        '',
        ...detailsBox,
      ].map(line => truncateToWidth(line, width, ''))
    }
    const grid = mergeColumns(masterBox, detailsBox, leftWidth, rightWidth, gap)
    return [
      ...headerLines,
      '',
      ...grid,
    ].map(line => truncateToWidth(line, width, ''))
  }

  const attentionSummary = buildTeamAttentionSummary(data.team, data.mailbox)
  const taskTabColor = attentionSummary.blockedTasks > 0 ? 'error' : attentionSummary.unownedActiveTasks > 0 ? 'warning' : 'dim'
  const mailTabColor = attentionSummary.blockedMessages > 0 ? 'error' : attentionSummary.unreadMessages > 0 ? 'warning' : 'dim'
  const tabBar = [
    renderTab(theme, 'Cockpit', selection.cockpitQueue.length, state.focus === 'cockpit', selection.cockpitQueue.length > 0 ? 'warning' : 'dim'),
    renderTab(theme, 'Tasks', selection.visibleTasks.length, state.focus === 'tasks', taskTabColor),
    renderTab(theme, 'Mail', selection.visibleMailbox.length, state.focus === 'mailbox', mailTabColor),
    renderTab(theme, 'Members', data.members.length, state.focus === 'members', 'dim'),
  ].join(theme.fg('dim', '  '))

  const useTwoColumns = safeWidth >= 112
  const headerLines = renderHeaderLines(theme, width, overview, tabBar, useTwoColumns, useTwoColumns ? 2 : 0)
  const gap = 2
  const leftWidth = useTwoColumns ? Math.max(48, Math.floor((safeWidth - gap) * 0.42)) : safeWidth
  const rightWidth = useTwoColumns ? Math.max(54, safeWidth - gap - leftWidth) : safeWidth
  const masterContentHeight = useTwoColumns ? sideBySideContentHeight(height) : stackedMasterContentHeight(height)
  const masterLines = state.focus === 'cockpit'
    ? renderCockpitQueueLines(theme, state, selection, masterContentHeight)
    : state.focus === 'tasks'
      ? renderTaskLines(theme, data, state, selection, masterContentHeight)
      : state.focus === 'mailbox'
        ? renderMailboxLines(theme, state, selection, masterContentHeight)
        : renderMembersLines(theme, data, state, masterContentHeight)
  const masterTitle = state.focus === 'cockpit'
    ? `☰ Cockpit (${selection.cockpitQueue.length})`
    : state.focus === 'tasks'
      ? `📋 Tasks (${selection.visibleTasks.length})`
      : state.focus === 'mailbox'
        ? `📬 Mailbox (${selection.visibleMailbox.length})`
        : `👥 Members (${data.members.length})`
  const detailWidth = useTwoColumns ? rightWidth : safeWidth
  const rawDetailLines = state.interactionMode === 'action-menu' && state.actionMenu
    ? renderActionMenuLines(theme, state.actionMenu, detailWidth)
    : renderDetailLines(theme, data, state, selection, detailWidth)
  const detailWindow = visibleDetailLines(
    state,
    rawDetailLines,
    useTwoColumns ? sideBySideContentHeight(height) : stackedDetailContentHeight(height, masterContentHeight ?? masterLines.length),
  )
  const boxHeight = Math.max(masterContentHeight ?? masterLines.length, detailWindow.lines.length, 8)
  const masterBox = drawBox(theme, {
    width: leftWidth,
    title: `${masterTitle}${state.scrollFocus === 'list' ? '  ✦' : ''}`,
    lines: masterLines,
    focused: state.scrollFocus === 'list',
    minContentLines: useTwoColumns ? boxHeight : undefined,
    footer: renderMasterFooter('team', state.scrollFocus === 'list' && state.interactionMode !== 'action-menu'),
  })
  const detailBox = drawBox(theme, {
    width: detailWidth,
    title: state.interactionMode === 'action-menu' ? '⚙ Actions' : `🔎 Details${state.scrollFocus === 'detail' ? '  ✦' : ''}${detailWindow.suffix}`,
    lines: detailWindow.lines,
    focused: state.interactionMode === 'action-menu' || state.scrollFocus === 'detail',
    minContentLines: useTwoColumns ? boxHeight : undefined,
    footer: renderDetailFooter(state),
  })

  if (!useTwoColumns) {
    return [
      ...headerLines,
      '',
      ...masterBox,
      '',
      ...detailBox,
    ].map(line => truncateToWidth(line, width, ''))
  }

  const grid = mergeColumns(masterBox, detailBox, leftWidth, rightWidth, gap)
  return [
    ...headerLines,
    '',
    ...grid,
  ].map(line => truncateToWidth(line, width, ''))
}
