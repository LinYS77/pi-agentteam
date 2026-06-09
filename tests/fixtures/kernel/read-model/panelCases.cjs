const SENTINELS = {
  mailbox: 'READ_MODEL_MAILBOX_TEXT_SHOULD_NOT_LEAK',
  report: 'READ_MODEL_REPORT_TEXT_SHOULD_NOT_LEAK',
  unknown: 'READ_MODEL_UNKNOWN_TEXT_SHOULD_NOT_LEAK',
  config: 'READ_MODEL_CONFIG_FULL_DUMP_SHOULD_NOT_LEAK',
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function member(name, overrides = {}) {
  return {
    name,
    role: overrides.role || 'implementer',
    status: overrides.status || 'idle',
    paneId: overrides.paneId || `%${name}`,
    windowTarget: overrides.windowTarget || 'read-model:@1',
    bridgeAvailable: overrides.bridgeAvailable ?? true,
    bridgeVersion: overrides.bridgeVersion || 'test-bridge',
    bridgeLastSeenAt: overrides.bridgeLastSeenAt || 1700003000000,
    bridgeLastDeliveryAt: overrides.bridgeLastDeliveryAt,
    bridgeLastError: overrides.bridgeLastError,
    bridgeWorkRequestedAt: overrides.bridgeWorkRequestedAt,
    bridgeWorkRequestCount: overrides.bridgeWorkRequestCount ?? 0,
    lastWakeReason: overrides.lastWakeReason,
    lastError: overrides.lastError,
  }
}

function task(id, overrides = {}) {
  return {
    id,
    title: overrides.title || `Task ${id}`,
    status: overrides.status || 'open',
    owner: overrides.owner,
    updatedAt: overrides.updatedAt || 1700003000100,
    blockedBy: overrides.blockedBy || [],
    history: overrides.history || { taskId: id, reports: 0, events: 0, messageRefs: 0 },
    watchdog: overrides.watchdog,
    description: overrides.description || 'description omitted from fingerprint',
  }
}

function mailbox(id, overrides = {}) {
  return {
    id,
    type: overrides.type || 'inform',
    from: overrides.from || 'worker-a',
    to: overrides.to || 'team-lead',
    summary: overrides.summary || `Mailbox ${id}`,
    priority: overrides.priority || 'normal',
    taskId: overrides.taskId,
    threadId: overrides.threadId,
    requestId: overrides.requestId,
    replyTo: overrides.replyTo,
    wakeHint: overrides.wakeHint,
    metadata: overrides.metadata,
    createdAt: overrides.createdAt || 1700003000200,
    readAt: overrides.readAt,
    deliveredAt: overrides.deliveredAt,
  }
}

function configProjection(overrides = {}) {
  return {
    exists: overrides.exists ?? true,
    path: overrides.path || '/tmp/read-model/config.json',
    schemaVersion: overrides.schemaVersion ?? 1,
    diagnosticCount: overrides.diagnosticCount ?? 1,
    roleModels: overrides.roleModels || [
      { role: 'researcher', modelLabel: 'default', modelSource: 'default' },
      { role: 'planner', modelLabel: 'planner-model', modelSource: 'v1' },
      { role: 'implementer', modelLabel: 'legacy-implementer', modelSource: 'legacy' },
    ],
  }
}

function planRun(overrides = {}) {
  return {
    planRunId: overrides.planRunId || 'PR-RM-001',
    status: overrides.status || 'active',
    stepIndex: overrides.stepIndex ?? 0,
    stepNumber: overrides.stepNumber ?? 1,
    stepStatus: overrides.stepStatus || 'assigned',
    taskId: overrides.taskId || 'T001',
    pauseReason: overrides.pauseReason,
    latestEventId: overrides.latestEventId || 'PRE001',
    latestEventType: overrides.latestEventType || 'advanced',
    latestReportId: overrides.latestReportId || 'TR001',
    watchdog: overrides.watchdog,
    nextAction: overrides.nextAction || 'watchdog active; owner report_done/report_blocked; no automatic advance',
  }
}

function team(overrides = {}) {
  const name = overrides.name || 'read-model-team'
  const identity = Object.prototype.hasOwnProperty.call(overrides, 'identity')
    ? overrides.identity
    : {
        teamId: `team-${name}`,
        projectKey: `project-${name}`,
        displayName: overrides.displayName || 'Read Model Team',
        slug: overrides.slug || name,
      }
  return {
    name,
    identity,
    displayName: overrides.displayName,
    slug: overrides.slug,
    projectKey: overrides.projectKey,
    teamId: overrides.teamId,
    leaderCwd: overrides.leaderCwd || `/tmp/${name}`,
    revision: overrides.revision ?? 1,
    config: overrides.config,
    planRuns: overrides.planRuns,
    tasks: overrides.taskMap,
  }
}

function attachedMinimal() {
  return {
    mode: 'attached',
    team: team({ name: 'minimal-empty', config: configProjection({ exists: false, path: undefined, diagnosticCount: 0, roleModels: [] }), planRuns: [] }),
    members: [],
    tasks: [],
    mailbox: [],
    outboxDiagnostics: { pending: 0, failed: 0, lastRunAt: 1700003000000 },
  }
}

function attachedNormal() {
  const tasks = [
    task('T001', {
      title: '正常任务 🚀',
      owner: 'worker-a',
      history: {
        taskId: 'T001',
        reports: 2,
        events: 3,
        messageRefs: 1,
        latestReport: {
          id: 'TR001',
          taskId: 'T001',
          type: 'report_done',
          author: 'worker-a',
          summary: 'Compact report summary only',
          createdAt: 1700003000300,
          statusAtReport: 'open',
          reportedBlockedBy: [],
        },
        latestActivity: {
          kind: 'messageRef',
          id: 'TMR001',
          taskId: 'T001',
          mailboxMessageId: 'M001',
          type: 'assignment',
          at: 1700003000310,
          from: 'team-lead',
          to: 'worker-a',
          summary: 'Compact message-ref summary',
        },
      },
    }),
    task('T002', {
      title: 'Blocked task with watchdog',
      status: 'blocked',
      owner: 'worker-b',
      blockedBy: ['external dependency'],
      history: { taskId: 'T002', reports: 1, events: 4, messageRefs: 2 },
      watchdog: {
        state: 'waiting_for_report',
        needsNudge: true,
        latestAssignmentAt: 1700003000400,
        latestOwnerReportAt: 1700003000500,
        workerStatus: 'idle',
        owner: 'worker-b',
        reason: 'owner idle after assignment',
      },
    }),
  ]
  const taskMap = Object.fromEntries(tasks.map(item => [item.id, { history: item.history }]))
  return {
    mode: 'attached',
    team: team({
      name: 'normal-attached',
      displayName: 'Normal Attached Team',
      config: configProjection(),
      planRuns: [planRun({ taskId: 'T001' })],
      taskMap,
      revision: 7,
    }),
    members: [
      member('worker-a', { role: 'researcher', bridgeWorkRequestCount: 2, lastWakeReason: 'assignment' }),
      member('worker-b', { role: 'planner', status: 'busy', bridgeLastError: 'compact bridge error', bridgeWorkRequestedAt: 1700003000600 }),
    ],
    tasks,
    mailbox: [
      mailbox('M001', { type: 'report_done', summary: '完成摘要 ✨', priority: 'high', taskId: 'T001', deliveredAt: 1700003000700 }),
      mailbox('M002', { type: 'report_blocked', summary: 'Blocked summary', priority: 'high', taskId: 'T002', readAt: 1700003000800 }),
    ],
    outboxDiagnostics: {
      pending: 1,
      failed: 1,
      lastRunAt: 1700003000900,
      lastFailedEffect: {
        effectId: 'E001',
        kind: 'worker_delivery_requested',
        error: 'compact delivery error',
        failedAt: 1700003000910,
        updatedAt: 1700003000920,
      },
    },
  }
}

function attachedLegacyNoIdentity() {
  return {
    mode: 'attached',
    team: team({
      name: 'legacy-team',
      identity: undefined,
      displayName: 'Legacy Team',
      slug: 'legacy-team',
      projectKey: 'legacy-project',
      teamId: 'legacy-team-id',
      leaderCwd: '/tmp/legacy-team',
      revision: undefined,
      config: configProjection({ diagnosticCount: 0 }),
      planRuns: [],
    }),
    members: [member('legacy-worker', { paneId: undefined, windowTarget: undefined, bridgeAvailable: undefined })],
    tasks: [task('TLEG', { title: 'Legacy task', owner: undefined, updatedAt: undefined, history: undefined })],
    mailbox: [mailbox('MLEG', { summary: undefined, priority: undefined, readAt: null, deliveredAt: undefined })],
    outboxDiagnostics: undefined,
  }
}

function globalFixture() {
  const teamA = team({ name: 'global-a', config: configProjection(), planRuns: [planRun({ planRunId: 'PR-GLOBAL', taskId: 'TG001' })], revision: 10 })
  const teamB = team({ name: 'global-b', identity: undefined, displayName: 'Global Legacy', slug: 'global-legacy', projectKey: 'global-project', teamId: 'global-legacy-id', revision: 2 })
  return {
    mode: 'global',
    teams: [teamA, teamB],
    teamSummaries: {
      'global-a': { blockedTasks: 1, unreadMessages: 2, blockedMessages: 1, unownedActiveTasks: 0, errorMembers: 0, paneLostMembers: 0 },
      'global-b': { blockedTasks: 0, unreadMessages: 0, blockedMessages: 0, unownedActiveTasks: 1, errorMembers: 1, paneLostMembers: 1 },
    },
    teamMailboxes: {
      'global-a': {
        total: 3,
        unread: 2,
        blocked: 1,
        latestAttention: mailbox('GM001', { type: 'report_blocked', summary: 'Global blocked summary', priority: 'high', taskId: 'TG001' }),
      },
      'global-b': { total: 0, unread: 0, blocked: 0 },
    },
    teamDiagnostics: {
      'global-a': { outbox: { pending: 1, failed: 0, lastRunAt: 1700003001000 } },
      'global-b': { outbox: { pending: 0, failed: 1, lastFailedEffect: { effectId: 'GE001', kind: 'leader_attention_requested', error: 'compact global error', updatedAt: 1700003001100 } } },
    },
    quarantinedTeams: [
      {
        teamName: 'bad-team',
        quarantinedAt: 1700003001200,
        quarantineDir: '/tmp/quarantine/bad-team',
        reasonCount: 2,
        reasons: [
          { code: 'unsupported_legacy_state', file: 'team.json', path: '$.legacy', field: 'legacy', value: 'bad', message: 'compact quarantine reason' },
        ],
      },
    ],
    orphanPanes: [
      { paneId: '%orphan-a', target: 'orphan:@1', label: 'agentteam orphan', currentCommand: 'pi' },
      { paneId: '%orphan-b', target: 'orphan:@2', label: '孤儿 pane', currentCommand: 'bash' },
    ],
  }
}

function withSentinels(input) {
  const data = clone(input)
  if (data.mailbox?.[0]) data.mailbox[0].text = SENTINELS.mailbox
  if (data.team) {
    data.team.taskReports = {
      TR_SENTINEL: {
        id: 'TR_SENTINEL',
        taskId: data.tasks?.[0]?.id || 'T001',
        text: SENTINELS.report,
        summary: 'Compact report summary survives',
        metadata: { text: SENTINELS.unknown },
      },
    }
    data.team.unknownNested = { text: SENTINELS.unknown, child: { text: SENTINELS.unknown } }
    if (data.team.config) data.team.config.fullDump = { text: SENTINELS.config }
    if (Array.isArray(data.team.planRuns) && data.team.planRuns[0]) data.team.planRuns[0].text = SENTINELS.unknown
  }
  if (data.outboxDiagnostics) data.outboxDiagnostics.text = SENTINELS.unknown
  if (data.teamSummaries) data.teamSummaries.text = SENTINELS.unknown
  if (data.teamDiagnostics) data.teamDiagnostics.text = SENTINELS.unknown
  if (data.quarantinedTeams?.[0]) data.quarantinedTeams[0].text = SENTINELS.unknown
  return data
}

function unorderedEquivalent(input) {
  const data = clone(input)
  if (Array.isArray(data.tasks)) {
    data.tasks = data.tasks.map(item => ({
      watchdog: item.watchdog,
      blockedBy: item.blockedBy,
      updatedAt: item.updatedAt,
      owner: item.owner,
      status: item.status,
      title: item.title,
      id: item.id,
      history: item.history,
    }))
  }
  if (data.team) {
    data.team = {
      planRuns: data.team.planRuns,
      config: data.team.config,
      leaderCwd: data.team.leaderCwd,
      revision: data.team.revision,
      identity: data.team.identity,
      name: data.team.name,
    }
  }
  return data
}

function largeAttached(size = 36) {
  const base = attachedNormal()
  const members = Array.from({ length: 8 }, (_, index) => member(`large-worker-${index + 1}`, { role: ['researcher', 'planner', 'implementer'][index % 3], bridgeWorkRequestCount: index }))
  const tasks = Array.from({ length: size }, (_, index) => task(`TL${String(index + 1).padStart(3, '0')}`, {
    title: `Large task ${index + 1} 多语言`,
    status: index % 7 === 0 ? 'blocked' : 'open',
    owner: members[index % members.length].name,
    blockedBy: index % 7 === 0 ? ['large blocker'] : [],
    updatedAt: 1700004000000 + index,
    history: { taskId: `TL${String(index + 1).padStart(3, '0')}`, reports: index % 4, events: index % 5, messageRefs: index % 6 },
  }))
  const mailboxItems = tasks.slice(0, 18).map((item, index) => mailbox(`ML${String(index + 1).padStart(3, '0')}`, {
    from: members[index % members.length].name,
    summary: `Large compact mailbox ${index + 1}`,
    taskId: item.id,
    priority: index % 5 === 0 ? 'high' : 'normal',
  }))
  return {
    ...base,
    team: team({ name: 'large-attached', config: configProjection(), planRuns: [planRun({ taskId: tasks[0].id })], taskMap: Object.fromEntries(tasks.map(item => [item.id, { history: item.history }])) }),
    members,
    tasks,
    mailbox: mailboxItems,
  }
}

function cases() {
  return [
    { name: 'attached minimal empty team', input: attachedMinimal(), expect: { mode: 'attached', taskCount: 0, mailboxCount: 0 } },
    { name: 'normal attached team', input: attachedNormal(), expect: { mode: 'attached', taskCount: 2, mailboxCount: 2, hasPlanRun: true, hasConfig: true } },
    { name: 'attached sentinels sanitized', input: withSentinels(attachedNormal()), expect: { mode: 'attached', taskCount: 2, mailboxCount: 2, noText: true } },
    { name: 'legacy no identity attached team', input: attachedLegacyNoIdentity(), expect: { mode: 'attached', taskCount: 1, mailboxCount: 1, legacyIdentity: true } },
    { name: 'global panel data', input: withSentinels(globalFixture()), expect: { mode: 'global', teamCount: 2, orphanPaneCount: 2, noText: true } },
    { name: 'missing optional fields and nulls', input: { mode: 'attached', team: { name: 'nullish', leaderCwd: null, identity: null }, members: null, tasks: null, mailbox: null }, expect: { mode: 'attached', taskCount: 0, mailboxCount: 0 } },
    { name: 'unordered object keys stable', input: unorderedEquivalent(attachedNormal()), equivalentTo: attachedNormal(), expect: { mode: 'attached' } },
    { name: 'large attached fixture', input: largeAttached(), expect: { mode: 'attached', taskCount: 36, mailboxCount: 18, large: true } },
  ]
}

module.exports = {
  SENTINELS,
  attachedMinimal,
  attachedNormal,
  attachedLegacyNoIdentity,
  globalFixture,
  withSentinels,
  unorderedEquivalent,
  largeAttached,
  cases,
}
