function bool(value: unknown): boolean {
  return value !== undefined && value !== null
}

export function stableCompactStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableCompactStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined && entryValue !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableCompactStringify(entryValue)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function stripTextFields(value: unknown, depth = 0): unknown {
  if (!value || depth > 12) return value
  if (Array.isArray(value)) return value.map(item => stripTextFields(item, depth + 1))
  if (typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, entryValue]) => key !== 'text' && entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripTextFields(entryValue, depth + 1)]),
  )
}

function compactConfigProjection(config: any) {
  if (!config || typeof config !== 'object') return undefined
  return stripTextFields({
    exists: config.exists,
    path: config.path,
    schemaVersion: config.schemaVersion,
    diagnosticCount: config.diagnosticCount,
    roleModels: (config.roleModels ?? []).map((role: any) => ({
      role: role.role,
      modelLabel: role.modelLabel,
      modelSource: role.modelSource,
    })),
  })
}

function compactPlanRuns(planRuns: any) {
  if (!Array.isArray(planRuns)) return []
  return planRuns.map(run => stripTextFields({
    planRunId: run.planRunId,
    status: run.status,
    stepIndex: run.stepIndex,
    stepNumber: run.stepNumber,
    stepStatus: run.stepStatus,
    taskId: run.taskId,
    pauseReason: run.pauseReason,
    latestEventId: run.latestEventId,
    latestEventType: run.latestEventType,
    latestReportId: run.latestReportId,
    watchdog: run.watchdog ? {
      state: run.watchdog.state,
      needsNudge: run.watchdog.needsNudge,
      reason: run.watchdog.reason,
      owner: run.watchdog.owner,
      workerStatus: run.watchdog.workerStatus,
    } : undefined,
    nextAction: run.nextAction,
  }))
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
      teamSummaries: stripTextFields(data.teamSummaries),
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
      teamDiagnostics: stripTextFields(data.teamDiagnostics),
      quarantinedTeams: stripTextFields(data.quarantinedTeams),
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
    team: {
      ...teamIdentityFingerprint(data?.team),
      config: compactConfigProjection(data?.team?.config),
      planRuns: compactPlanRuns(data?.team?.planRuns),
    },
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
    outboxDiagnostics: stripTextFields(data?.outboxDiagnostics),
  })
}

export function compactReadModelProjection(input: unknown): unknown {
  return JSON.parse(compactPanelReadModelFingerprint(input))
}
