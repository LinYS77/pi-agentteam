import type { PanelData, TeamPanelState } from './viewModel.js'

function bool(value: unknown): boolean {
  return value !== undefined && value !== null
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function taskHistoryCounts(team: Extract<PanelData, { mode: 'attached' }>['team'], taskId: string) {
  const history = team.tasks[taskId]?.history
  return {
    reports: history?.reports ?? 0,
    events: history?.events ?? 0,
    messageRefs: history?.messageRefs ?? 0,
  }
}

function teamIdentityFingerprint(team: Extract<PanelData, { mode: 'attached' }>['team']) {
  return {
    name: team.name,
    displayName: team.identity?.displayName,
    slug: team.identity?.slug,
    projectKey: team.identity?.projectKey,
    teamId: team.identity?.teamId,
    revision: team.revision,
    leaderCwd: team.leaderCwd,
  }
}

export function panelStateFingerprint(state: TeamPanelState): string {
  return stableStringify({
    focus: state.focus,
    selectedIndex: state.selectedIndex,
    cockpitSelectedIndex: state.cockpitSelectedIndex,
    tasksSelectedIndex: state.tasksSelectedIndex,
    mailboxSelectedIndex: state.mailboxSelectedIndex,
    membersSelectedIndex: state.membersSelectedIndex,
    teamsSelectedIndex: state.teamsSelectedIndex,
    panesSelectedIndex: state.panesSelectedIndex,
    selectedMemberIndex: state.selectedMemberIndex,
    selectedTeamIndex: state.selectedTeamIndex,
    selectedPaneIndex: state.selectedPaneIndex,
    scrollFocus: state.scrollFocus,
    isDetailExpanded: state.isDetailExpanded,
    detailScrollOffset: state.detailScrollOffset,
    interactionMode: state.interactionMode,
    actionMenu: state.actionMenu,
  })
}

export function panelDataFingerprint(data: PanelData): string {
  if (data.mode === 'global') {
    return stableStringify({
      mode: data.mode,
      teams: data.teams.map(team => teamIdentityFingerprint(team)),
      teamSummaries: data.teamSummaries,
      teamMailboxes: Object.fromEntries(Object.entries(data.teamMailboxes).map(([teamName, mailbox]) => [teamName, {
        total: mailbox.total,
        unread: mailbox.unread,
        blocked: mailbox.blocked,
        latestAttention: mailbox.latestAttention ? {
          id: mailbox.latestAttention.id,
          type: mailbox.latestAttention.type,
          from: mailbox.latestAttention.from,
          summary: mailbox.latestAttention.summary,
          priority: mailbox.latestAttention.priority,
          read: bool(mailbox.latestAttention.readAt),
          delivered: bool(mailbox.latestAttention.deliveredAt),
        } : undefined,
      }])),
      teamDiagnostics: data.teamDiagnostics,
      quarantinedTeams: data.quarantinedTeams,
      orphanPanes: data.orphanPanes.map(pane => ({
        paneId: pane.paneId,
        target: pane.target,
        label: pane.label,
        currentCommand: pane.currentCommand,
      })),
    })
  }

  return stableStringify({
    mode: data.mode,
    team: teamIdentityFingerprint(data.team),
    members: data.members.map(member => ({
      name: member.name,
      role: member.role,
      status: member.status,
      paneId: member.paneId,
      windowTarget: member.windowTarget,
      bridgeAvailable: member.bridgeAvailable,
      bridgeVersion: member.bridgeVersion,
      bridgeLastSeenAt: member.bridgeLastSeenAt,
      bridgeLastDeliveryAt: member.bridgeLastDeliveryAt,
      bridgeLastError: member.bridgeLastError,
      bridgeWorkRequestedAt: member.bridgeWorkRequestedAt,
      bridgeWorkRequestCount: member.bridgeWorkRequestCount,
      lastWakeReason: member.lastWakeReason,
      lastError: member.lastError,
    })),
    tasks: data.tasks.map(task => ({
      id: task.id,
      title: task.title,
      status: task.status,
      owner: task.owner,
      updatedAt: task.updatedAt,
      blockedBy: task.blockedBy,
      history: taskHistoryCounts(data.team, task.id),
      watchdog: task.watchdog ? {
        state: task.watchdog.state,
        needsNudge: task.watchdog.needsNudge,
        latestAssignmentAt: task.watchdog.latestAssignmentAt,
        latestOwnerReportAt: task.watchdog.latestOwnerReportAt,
        workerStatus: task.watchdog.workerStatus,
      } : undefined,
    })),
    mailbox: data.mailbox.map(item => ({
      id: item.id,
      type: item.type,
      from: item.from,
      summary: item.summary,
      priority: item.priority,
      taskId: item.taskId,
      read: bool(item.readAt),
      delivered: bool(item.deliveredAt),
    })),
    outboxDiagnostics: data.outboxDiagnostics,
  })
}
