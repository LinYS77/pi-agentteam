function bool(value: unknown): boolean {
  return value !== undefined && value !== null
}

export function stableCompactStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableCompactStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableCompactStringify(entryValue)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function taskHistoryCounts(team: any, taskId: string, task?: any) {
  const history = team?.tasks?.[taskId]?.history ?? task?.history
  return {
    reports: history?.reports ?? 0,
    events: history?.events ?? 0,
    messageRefs: history?.messageRefs ?? 0,
  }
}

function teamIdentityFingerprint(team: any) {
  return {
    name: team?.name,
    displayName: team?.identity?.displayName ?? team?.displayName,
    slug: team?.identity?.slug ?? team?.slug,
    projectKey: team?.identity?.projectKey ?? team?.projectKey,
    teamId: team?.identity?.teamId ?? team?.teamId,
    revision: team?.revision,
    leaderCwd: team?.leaderCwd,
  }
}

export function compactPanelReadModelFingerprint(data: any): string {
  if (data?.mode === 'global') {
    return stableCompactStringify({
      mode: data.mode,
      teams: (data.teams ?? []).map(teamIdentityFingerprint),
      teamSummaries: data.teamSummaries,
      teamMailboxes: Object.fromEntries(Object.entries(data.teamMailboxes ?? {}).map(([teamName, mailbox]) => [teamName, {
        total: (mailbox as any).total,
        unread: (mailbox as any).unread,
        blocked: (mailbox as any).blocked,
        latestAttention: (mailbox as any).latestAttention ? {
          id: (mailbox as any).latestAttention.id,
          type: (mailbox as any).latestAttention.type,
          from: (mailbox as any).latestAttention.from,
          summary: (mailbox as any).latestAttention.summary,
          priority: (mailbox as any).latestAttention.priority,
          read: bool((mailbox as any).latestAttention.readAt) || Boolean((mailbox as any).latestAttention.read),
          delivered: bool((mailbox as any).latestAttention.deliveredAt) || Boolean((mailbox as any).latestAttention.delivered),
        } : undefined,
      }])),
      teamDiagnostics: data.teamDiagnostics,
      quarantinedTeams: data.quarantinedTeams,
      orphanPanes: (data.orphanPanes ?? []).map((pane: any) => ({
        paneId: pane.paneId,
        target: pane.target,
        label: pane.label,
        currentCommand: pane.currentCommand,
      })),
    })
  }

  return stableCompactStringify({
    mode: data?.mode,
    team: teamIdentityFingerprint(data?.team),
    members: (data?.members ?? []).map((member: any) => ({
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
    tasks: (data?.tasks ?? []).map((task: any) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      owner: task.owner,
      updatedAt: task.updatedAt,
      blockedBy: task.blockedBy,
      history: taskHistoryCounts(data?.team, task.id, task),
      watchdog: task.watchdog ? {
        state: task.watchdog.state,
        needsNudge: task.watchdog.needsNudge,
        latestAssignmentAt: task.watchdog.latestAssignmentAt,
        latestOwnerReportAt: task.watchdog.latestOwnerReportAt,
        workerStatus: task.watchdog.workerStatus,
      } : undefined,
    })),
    mailbox: (data?.mailbox ?? []).map((item: any) => ({
      id: item.id,
      type: item.type,
      from: item.from,
      summary: item.summary,
      priority: item.priority,
      taskId: item.taskId,
      read: bool(item.readAt) || Boolean(item.read),
      delivered: bool(item.deliveredAt) || Boolean(item.delivered),
    })),
    outboxDiagnostics: data?.outboxDiagnostics,
  })
}

export function compactReadModelProjection(input: unknown): unknown {
  return JSON.parse(compactPanelReadModelFingerprint(input))
}
