import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { defaultThreadIdForTask } from '../protocol.js'
import { planTaskReportAttention, planTaskReportEffects } from './messageApplication.js'
import { transitionTask, type TaskState as ReducerTaskState } from '../core/taskReducer.js'
import { TEAM_LEAD, type TaskEvent, type TaskMessageRef, type TaskReport, type TaskReportStatusAtReport } from '../internalTypes.js'
import { runOutboxOnce, type OutboxRunResult } from './effectRunner.js'
import { outboxEffectWarningName, outboxHash } from './outbox.js'
import { isLeader } from '../utils.js'
import { buildImplementationCompletionNote, formatTask } from './taskFormatting.js'
import type { TaskApplicationDeps } from './types.js'
import type { TaskApplicationInput, TaskApplicationResult, TaskCommandContext, TaskCommandResult, TeamTaskInput } from './taskTypes.js'

export function actorRole(team: { members: Record<string, { role: string }> }, actor: string): string {
  if (isLeader(actor)) return 'leader'
  return (team.members[actor]?.role ?? '').trim().toLowerCase()
}

export function ensureTaskPrivilege(
  team: { members: Record<string, { role: string }> },
  actor: string,
  action: string,
): string | null {
  if (isLeader(actor)) return null

  const role = actorRole(team, actor)

  // Non-leaders can inspect, record compact progress, and send report-only task reports.
  if (action === 'list' || action === 'show' || action === 'history' || action === 'reports' || action === 'report' || action === 'progress' || action === 'report_done' || action === 'report_blocked') return null

  return `Task action '${action}' is leader-only for ${actor} (${role || 'worker'}). Allowed for non-leaders: list/show/history/reports/report/progress/report_done/report_blocked`
}

function requireUpdatedTeam(team: TaskCommandContext['team'] | null, teamName: string): TaskCommandContext['team'] {
  if (!team) throw new Error(`Team ${teamName} no longer exists`)
  return team
}

function requireTask(team: TaskCommandContext['team'], taskId: string) {
  const task = team.tasks[taskId]
  if (!task) throw new Error(`Task ${taskId} not found`)
  return task
}

function reducerTaskSnapshot(task: ReturnType<typeof requireTask>): ReducerTaskState {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    owner: task.owner,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

function applyReducerTask(task: ReturnType<typeof requireTask>, reducerTask: ReducerTaskState): void {
  task.status = reducerTask.status
  task.owner = reducerTask.owner
  task.updatedAt = reducerTask.updatedAt
}

function applyReducerTransition(
  task: ReturnType<typeof requireTask>,
  input: Parameters<typeof transitionTask>[1],
): ReturnType<typeof transitionTask> {
  const reducerTask = reducerTaskSnapshot(task)
  const result = transitionTask(reducerTask, input)
  if (result.ok) applyReducerTask(task, result.task)
  return result
}

function taskTransitionExpectedStatus(action: Parameters<typeof transitionTask>[1]['type']): string {
  switch (action) {
    case 'assign':
    case 'block':
      return 'open'
    case 'unblock':
      return 'blocked'
    case 'close':
    case 'report_done':
    case 'report_blocked':
      return 'open or blocked'
  }
}

function taskTransitionFailure(task: ReturnType<typeof requireTask>, action: Parameters<typeof transitionTask>[1]['type'], reason: string): TaskCommandResult {
  if (reason.startsWith('unsupported task status ')) {
    return {
      task,
      text: `Cannot ${action} ${task.id}: unsupported task status ${task.status}.`,
      details: {
        task,
        denied: true,
        reason: 'unsupported_task_status',
        action,
        taskId: task.id,
        status: task.status,
      },
    }
  }
  return invalidTaskStatus(task, action, taskTransitionExpectedStatus(action))
}

function resolveTaskOwner(
  input: TaskCommandContext,
  team: TaskCommandContext['team'],
  ownerName: string | undefined,
  fallbackOwner?: string,
): string {
  const owner = ownerName !== undefined ? input.deps.normalizeOwnerName(ownerName) : fallbackOwner
  if (!owner) throw new Error('owner cannot be empty')
  input.deps.assertValidOwner(team, owner)
  return owner
}

const DEFAULT_TASK_LIST_LIMIT = 10
const DEFAULT_TASK_HISTORY_LIMIT = 20
const MAX_TASK_LIST_LIMIT = 100
const MAX_TASK_HISTORY_LIMIT = 100

type TaskStatus = NonNullable<TeamTaskInput['status']>

type TaskListFilter = {
  status?: TaskStatus
  limit?: number
  all: boolean
}

function taskAttentionRank(task: ReturnType<typeof requireTask>): number {
  if (task.status === 'blocked' || task.blockedBy.length > 0) return 0
  if (task.status === 'open' && !task.owner) return 1
  if (task.status === 'open') return 2
  return 3
}

function taskIdNumber(id: string): number {
  const match = /^T(\d+)$/.exec(id)
  return match ? Number(match[1]) : Number.NaN
}

function compareTaskIds(a: string, b: string): number {
  const aNum = taskIdNumber(a)
  const bNum = taskIdNumber(b)
  if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum
  return a.localeCompare(b)
}

function compareTasksForList(a: ReturnType<typeof requireTask>, b: ReturnType<typeof requireTask>): number {
  const rankDiff = taskAttentionRank(a) - taskAttentionRank(b)
  if (rankDiff !== 0) return rankDiff
  const updatedDiff = b.updatedAt - a.updatedAt
  if (updatedDiff !== 0) return updatedDiff
  return compareTaskIds(a.id, b.id)
}

function clampListLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_TASK_LIST_LIMIT
  return Math.max(1, Math.min(MAX_TASK_LIST_LIMIT, Math.floor(limit)))
}

function clampHistoryLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_TASK_HISTORY_LIMIT
  return Math.max(1, Math.min(MAX_TASK_HISTORY_LIMIT, Math.floor(limit)))
}

function countTasksByStatus(tasks: Array<ReturnType<typeof requireTask>>): Record<TaskStatus, number> {
  return tasks.reduce<Record<TaskStatus, number>>((counts, task) => {
    counts[task.status] += 1
    return counts
  }, {
    open: 0,
    blocked: 0,
    done: 0,
  })
}

function formatStatusCounts(counts: Record<TaskStatus, number>): string {
  return `open ${counts.open}, blocked ${counts.blocked}, done ${counts.done}`
}

function listHeader(input: {
  totalCount: number
  matchingCount: number
  shownCount: number
  hiddenCount: number
  statusCounts: Record<TaskStatus, number>
  filter: TaskListFilter
  hasMore: boolean
}): string {
  const scope = input.filter.status ? ` matching status=${input.filter.status}` : ''
  const limitText = input.filter.all ? 'all' : String(input.filter.limit ?? DEFAULT_TASK_LIST_LIMIT)
  const moreHint = input.hasMore
    ? ' Use action=list all=true or limit=N/status=... for more.'
    : ' Use action=list all=true or limit=N/status=... to adjust.'
  return `Showing ${input.shownCount} of ${input.matchingCount}${scope} tasks (${input.totalCount} total; hidden ${input.hiddenCount}; ${formatStatusCounts(input.statusCounts)}; limit ${limitText}).${moreHint}`
}

function invalidTaskStatus(task: ReturnType<typeof requireTask>, action: string, expected: string): TaskCommandResult {
  return {
    task,
    text: `Cannot ${action} ${task.id}: expected ${expected}, got ${task.status}.`,
    details: { task, denied: true, reason: 'invalid_task_status', action, taskId: task.id, status: task.status, expected },
  }
}

function noteText(params: TeamTaskInput, fallback: string): string {
  return params.note?.trim() || fallback
}

function compactTaskHistorySummary(text: string): string {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  return singleLine.length > 140 ? `${singleLine.slice(0, 137)}...` : singleLine
}

function taskStatusAtReport(task: ReturnType<typeof requireTask>): TaskReportStatusAtReport {
  return task.status === 'blocked' ? 'blocked' : 'open'
}

function appendTaskEventHistory(
  input: TaskCommandContext,
  event: Parameters<TaskApplicationDeps['taskMutations']['appendTaskEvent']>[1],
): void {
  input.deps.taskMutations.appendTaskEvent(input.team, event)
}

function appendTaskReportHistory(
  input: TaskCommandContext,
  report: Parameters<TaskApplicationDeps['taskMutations']['appendTaskReport']>[1],
) {
  return input.deps.taskMutations.appendTaskReport(input.team, report)
}

function unsupportedStatusParam(params: TeamTaskInput, action: string): TaskCommandResult | null {
  if (params.status === undefined) return null
  return {
    text: `Action ${action} does not accept status; use assign/block/unblock/close/report actions instead.`,
    details: { denied: true, reason: 'status_param_unsupported', action, status: params.status },
  }
}

function unsupportedBlockedByParam(params: TeamTaskInput, action: string): TaskCommandResult | null {
  if (!params.blockedBy || params.blockedBy.length === 0) return null
  return {
    text: `Action ${action} does not accept blockedBy; use action=block or action=report_blocked instead.`,
    details: { denied: true, reason: 'blocked_by_param_unsupported', action, blockedBy: params.blockedBy },
  }
}

function denyNonOwnerReport(task: ReturnType<typeof requireTask>, actor: string, action: 'report_done' | 'report_blocked'): TaskCommandResult {
  return {
    task,
    text: `Cannot ${action} ${task.id}: ${actor} is not the task owner${task.owner ? ` (${task.owner})` : ''}. Non-owners should use agentteam_send type=inform/question for context.`,
    details: {
      task,
      denied: true,
      reason: 'task_reporter_not_owner',
      action,
      taskId: task.id,
      actor,
      taskOwner: task.owner ?? null,
    },
  }
}

function taskBrief(task: ReturnType<typeof requireTask>) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    owner: task.owner,
    blockedBy: [...task.blockedBy],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

function historyItemTime(item: TaskReport | TaskEvent | TaskMessageRef): number {
  return 'createdAt' in item ? item.createdAt : item.at
}

function historyItemKind(item: TaskReport | TaskEvent | TaskMessageRef): 'report' | 'event' | 'messageRef' {
  if ('author' in item) return 'report'
  if ('mailboxMessageId' in item) return 'messageRef'
  return 'event'
}

function displayEventType(type: TaskEvent['type']): string {
  return type === 'report_submitted' ? 'report' : type
}

function compactReport(report: TaskReport) {
  return {
    id: report.id,
    taskId: report.taskId,
    type: report.type,
    author: report.author,
    summary: report.summary,
    createdAt: report.createdAt,
    threadId: report.threadId,
    reportOnly: report.reportOnly,
    reporterIsOwner: report.reporterIsOwner,
    reportedBlockedBy: report.reportedBlockedBy ?? [],
    statusAtReport: report.statusAtReport,
    ownerAtReport: report.ownerAtReport,
    mailboxMessageId: report.mailboxMessageId,
  }
}

function compactActivity(item: TaskReport | TaskEvent | TaskMessageRef | undefined) {
  if (!item) return undefined
  if (historyItemKind(item) === 'report') {
    const report = item as TaskReport
    return {
      kind: 'report' as const,
      id: report.id,
      taskId: report.taskId,
      type: report.type,
      at: report.createdAt,
      by: report.author,
      summary: report.summary,
    }
  }
  if (historyItemKind(item) === 'messageRef') {
    const ref = item as TaskMessageRef
    return {
      kind: 'messageRef' as const,
      id: ref.id,
      taskId: ref.taskId,
      mailboxMessageId: ref.mailboxMessageId,
      type: ref.type,
      at: ref.createdAt,
      from: ref.from,
      to: ref.to,
      summary: ref.summary,
    }
  }
  const event = item as TaskEvent
  return {
    kind: 'event' as const,
    id: event.id,
    taskId: event.taskId,
    type: event.type,
    displayType: displayEventType(event.type),
    at: event.at,
    by: event.by,
    summary: event.summary,
    reportId: event.reportId,
  }
}

function formatMaybeList(values: string[]): string {
  return values.length ? values.join(', ') : '-'
}

function showTaskCommand(input: TaskCommandContext, taskId: string): TaskCommandResult {
  const task = requireTask(input.team, taskId)
  const summary = input.deps.taskHistory.taskHistorySummary(input.team, task.id)
  const latestReport = summary.latestReport ? compactReport(summary.latestReport) : undefined
  const latestActivity = compactActivity(summary.latestActivity)
  const latestActivityDisplayType = latestActivity
    ? (latestActivity.kind === 'event' ? latestActivity.displayType : latestActivity.type)
    : undefined
  const lines = [
    `${task.id} [${task.status}] ${task.title}`,
    `Owner: ${task.owner ?? '-'}`,
    `Blocked by: ${formatMaybeList(task.blockedBy)}`,
    `Description: ${task.description || '-'}`,
    `History counts: reports ${summary.reports}, events ${summary.events}, messageRefs ${summary.messageRefs}`,
    `Latest report: ${latestReport ? `${latestReport.id} ${latestReport.type} by ${latestReport.author} — ${latestReport.summary}` : '-'}`,
    `Latest activity: ${latestActivity ? `${latestActivity.kind} ${latestActivity.id} ${latestActivityDisplayType} — ${latestActivity.summary ?? '-'}` : '-'}`,
    `Hints: use action=history taskId=${task.id}; action=reports taskId=${task.id}; action=report reportId=<id>`,
  ]
  return {
    task,
    text: lines.join('\n'),
    details: {
      task: taskBrief(task),
      counts: { reports: summary.reports, events: summary.events, messageRefs: summary.messageRefs },
      latestReport,
      latestActivity,
      hints: {
        history: { action: 'history', taskId: task.id },
        reports: { action: 'reports', taskId: task.id },
        report: latestReport ? { action: 'report', reportId: latestReport.id } : { action: 'report', reportId: '<id>' },
      },
    },
  }
}

function historyTimelineItems(input: TaskCommandContext, taskId: string, includeMessages: boolean): Array<TaskReport | TaskEvent | TaskMessageRef> {
  const items: Array<TaskReport | TaskEvent | TaskMessageRef> = [
    ...input.deps.taskHistory.taskEventsForTask(input.team, taskId),
    ...input.deps.taskHistory.taskReportsForTask(input.team, taskId),
  ]
  if (includeMessages) items.push(...input.deps.taskHistory.taskMessageRefsForTask(input.team, taskId))
  return items.sort((a, b) => historyItemTime(a) - historyItemTime(b) || a.id.localeCompare(b.id))
}

function formatHistoryRow(item: TaskReport | TaskEvent | TaskMessageRef): string {
  const compact = compactActivity(item)!
  if (compact.kind === 'report') return `${compact.at} report ${compact.id} ${compact.type} by ${compact.by}: ${compact.summary}`
  if (compact.kind === 'messageRef') return `${compact.at} messageRef ${compact.id} ${compact.type} ${compact.from}->${compact.to}: ${compact.summary ?? '(no summary)'}`
  return `${compact.at} event ${compact.id} ${compact.displayType} by ${compact.by}: ${compact.summary}`
}

function historyTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const task = requireTask(input.team, taskId)
  const includeMessages = params.includeMessages !== false
  const allItems = historyTimelineItems(input, task.id, includeMessages)
  const all = params.all === true
  const effectiveLimit = all ? allItems.length : clampHistoryLimit(params.limit)
  const shown = all ? allItems : allItems.slice(Math.max(0, allItems.length - effectiveLimit))
  const hiddenCount = Math.max(0, allItems.length - shown.length)
  const header = `History for ${task.id}: showing ${shown.length} of ${allItems.length} rows (hidden ${hiddenCount}; limit ${all ? 'all' : effectiveLimit}; messageRefs ${includeMessages ? 'included' : 'excluded'}). Use action=report reportId=<id> for full report text.`
  const rows = shown.map(formatHistoryRow)
  const filter: { all: boolean; limit?: number; includeMessages: boolean } = { all, includeMessages }
  if (!all) filter.limit = effectiveLimit
  return {
    task,
    text: rows.length ? `${header}\n${rows.join('\n')}` : `${header}\nNo history rows`,
    details: {
      task: taskBrief(task),
      shownCount: shown.length,
      totalCount: allItems.length,
      hiddenCount,
      filter,
      rows: shown.map(compactActivity),
    },
  }
}

function reportsTaskCommand(input: TaskCommandContext, taskId: string): TaskCommandResult {
  const task = requireTask(input.team, taskId)
  const reports = input.deps.taskHistory.taskReportsForTask(input.team, task.id)
  const rows = reports.map(report => {
    const blockedBy = report.reportedBlockedBy?.length ? ` blockedBy=${report.reportedBlockedBy.join(',')}` : ''
    return `${report.id} ${report.type} by ${report.author} at ${report.createdAt} statusAtReport=${report.statusAtReport}${blockedBy}: ${report.summary}`
  })
  const header = `Reports for ${task.id}: ${reports.length} report${reports.length === 1 ? '' : 's'}. Use action=report reportId=<id> for full report text.`
  return {
    task,
    text: rows.length ? `${header}\n${rows.join('\n')}` : `${header}\nNo reports`,
    details: {
      task: taskBrief(task),
      reports: reports.map(compactReport),
    },
  }
}

function reportTaskCommand(input: TaskCommandContext, params: TeamTaskInput): TaskCommandResult {
  const reportId = params.reportId?.trim()
  if (!reportId) throw new Error('reportId is required for action=report')
  const report = input.deps.taskHistory.findTaskReport(input.team, reportId)
  if (!report) throw new Error(`Task report ${reportId} not found`)
  if (params.taskId && report.taskId !== params.taskId) {
    throw new Error(`Task report ${report.id} is for task ${report.taskId}, not ${params.taskId}`)
  }
  const task = requireTask(input.team, report.taskId)
  const meta = compactReport(report)
  return {
    task,
    text: [
      `${report.id} ${report.type} for ${report.taskId} by ${report.author} at ${report.createdAt}`,
      `Status at report: ${report.statusAtReport}; owner at report: ${report.ownerAtReport ?? '-'}; blockedBy: ${formatMaybeList(report.reportedBlockedBy ?? [])}`,
      'Report text:',
      report.text,
    ].join('\n'),
    details: {
      task: taskBrief(task),
      report: meta,
      text: report.text,
    },
  }
}

function listTasksCommand(input: TaskCommandContext, params: TeamTaskInput = { action: 'list' }): TaskCommandResult {
  const allTasks = Object.values(input.team.tasks)
  const statusCounts = countTasksByStatus(allTasks)
  const matching = params.status
    ? allTasks.filter(task => task.status === params.status)
    : allTasks
  const sorted = matching.sort(compareTasksForList)
  const all = params.all === true
  const effectiveLimit = all ? sorted.length : clampListLimit(params.limit)
  const shown = all ? sorted : sorted.slice(0, effectiveLimit)
  const hiddenCount = Math.max(0, sorted.length - shown.length)
  const filter: TaskListFilter = { all }
  if (params.status) filter.status = params.status
  if (!all) filter.limit = effectiveLimit
  const header = listHeader({
    totalCount: allTasks.length,
    matchingCount: sorted.length,
    shownCount: shown.length,
    hiddenCount,
    statusCounts,
    filter,
    hasMore: hiddenCount > 0,
  })
  const lines = shown.map(formatTask)
  const text = lines.length > 0 ? `${header}\n${lines.join('\n')}` : `${header}\nNo matching tasks`
  return {
    text,
    details: {
      totalCount: allTasks.length,
      matchingCount: sorted.length,
      shownCount: shown.length,
      hiddenCount,
      statusCounts,
      filter,
      shownTaskIds: shown.map(task => task.id),
      hasMore: hiddenCount > 0,
    },
  }
}

function createTaskCommand(input: TaskCommandContext, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'create')
  if (unsupportedStatus) return unsupportedStatus
  const unsupportedBlockedBy = unsupportedBlockedByParam(params, 'create')
  if (unsupportedBlockedBy) return unsupportedBlockedBy
  if (!params.title || !params.description) {
    throw new Error('title and description are required')
  }
  let createdTaskId = ''
  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const owner = params.owner !== undefined
      ? resolveTaskOwner(input, latest, params.owner)
      : undefined
    const task = input.deps.taskMutations.createTask(latest, {
      title: params.title!,
      description: params.description!,
      owner,
    })
    createdTaskId = task.id
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'created',
      by: input.actor,
      at: task.createdAt,
      summary: 'Task created',
      data: { source: 'agentteam_task_dual_write' },
    })
    if (owner) {
      appendTaskEventHistory({ ...input, team: latest }, {
        taskId: task.id,
        type: 'assigned',
        by: input.actor,
        at: task.updatedAt,
        summary: `Assigned to ${owner} on create`,
        data: { source: 'agentteam_task_dual_write', newOwner: owner, onCreate: true },
      })
    }
  }), input.teamName)
  const task = requireTask(updated, createdTaskId)
  return { task, text: `Created ${formatTask(task)}`, details: { task } }
}

function assignTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'assign')
  if (unsupportedStatus) return unsupportedStatus
  const unsupportedBlockedBy = unsupportedBlockedByParam(params, 'assign')
  if (unsupportedBlockedBy) return unsupportedBlockedBy
  const existingTask = requireTask(input.team, taskId)
  const owner = resolveTaskOwner(input, input.team, params.owner, input.actor)
  const transitionAt = Date.now()
  const initialTransition = transitionTask(reducerTaskSnapshot(existingTask), { type: 'assign', owner, at: transitionAt })
  if (!initialTransition.ok) return taskTransitionFailure(existingTask, 'assign', initialTransition.reason)

  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const previousOwner = task.owner
    const transition = applyReducerTransition(task, { type: 'assign', owner, at: transitionAt })
    if (!transition.ok) throw new Error(transition.reason)
    const note = noteText(params, `Assigned to ${owner}`)
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'assigned',
      by: input.actor,
      at: transitionAt,
      summary: compactTaskHistorySummary(note),
      data: { source: 'agentteam_task_dual_write', previousOwner, newOwner: owner },
    })
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return { task, text: `Assigned ${formatTask(task)}`, details: { task } }
}

function blockTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'block')
  if (unsupportedStatus) return unsupportedStatus
  const existingTask = requireTask(input.team, taskId)
  const transitionAt = Date.now()
  const initialTransition = transitionTask(reducerTaskSnapshot(existingTask), { type: 'block', at: transitionAt })
  if (!initialTransition.ok) return taskTransitionFailure(existingTask, 'block', initialTransition.reason)

  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const transition = applyReducerTransition(task, { type: 'block', at: transitionAt })
    if (!transition.ok) throw new Error(transition.reason)
    task.blockedBy = params.blockedBy ?? []
    const note = noteText(params, 'Task blocked')
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'blocked',
      by: input.actor,
      at: transitionAt,
      summary: compactTaskHistorySummary(note),
      data: { source: 'agentteam_task_dual_write', blockedBy: task.blockedBy },
    })
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return { task, text: `Blocked ${formatTask(task)}`, details: { task } }
}

function unblockTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'unblock')
  if (unsupportedStatus) return unsupportedStatus
  const unsupportedBlockedBy = unsupportedBlockedByParam(params, 'unblock')
  if (unsupportedBlockedBy) return unsupportedBlockedBy
  const existingTask = requireTask(input.team, taskId)
  const transitionAt = Date.now()
  const initialTransition = transitionTask(reducerTaskSnapshot(existingTask), { type: 'unblock', at: transitionAt })
  if (!initialTransition.ok) return taskTransitionFailure(existingTask, 'unblock', initialTransition.reason)

  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const previousBlockedBy = [...task.blockedBy]
    const transition = applyReducerTransition(task, { type: 'unblock', at: transitionAt })
    if (!transition.ok) throw new Error(transition.reason)
    task.blockedBy = []
    const note = noteText(params, 'Task unblocked')
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'unblocked',
      by: input.actor,
      at: transitionAt,
      summary: compactTaskHistorySummary(note),
      data: { source: 'agentteam_task_dual_write', previousBlockedBy },
    })
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return { task, text: `Unblocked ${formatTask(task)}`, details: { task } }
}

function closeTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'close')
  if (unsupportedStatus) return unsupportedStatus
  const unsupportedBlockedBy = unsupportedBlockedByParam(params, 'close')
  if (unsupportedBlockedBy) return unsupportedBlockedBy
  const existingTask = requireTask(input.team, taskId)
  const transitionAt = Date.now()
  const initialTransition = transitionTask(reducerTaskSnapshot(existingTask), { type: 'close', at: transitionAt })
  if (!initialTransition.ok) return taskTransitionFailure(existingTask, 'close', initialTransition.reason)

  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const previousStatus = task.status
    const previousBlockedBy = [...task.blockedBy]
    const transition = applyReducerTransition(task, { type: 'close', at: transitionAt })
    if (!transition.ok) throw new Error(transition.reason)
    const role = actorRole(latest, input.actor)
    const note = role === 'implementer'
      ? buildImplementationCompletionNote(params.note)
      : noteText(params, 'Task closed')
    task.blockedBy = []
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'closed',
      by: input.actor,
      at: transitionAt,
      summary: compactTaskHistorySummary(note),
      data: { source: 'agentteam_task_dual_write', previousStatus, previousBlockedBy },
    })
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return { task, text: `Closed ${formatTask(task)}`, details: { task } }
}

function progressTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'progress')
  if (unsupportedStatus) return unsupportedStatus
  const unsupportedBlockedBy = unsupportedBlockedByParam(params, 'progress')
  if (unsupportedBlockedBy) return unsupportedBlockedBy
  const at = Date.now()
  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const progress = noteText(params, 'Progress recorded')
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'progress',
      by: input.actor,
      at,
      summary: compactTaskHistorySummary(progress),
      data: { source: 'agentteam_task_progress' },
    })
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return { task, text: `Recorded progress on ${task.id}`, details: { task } }
}

function reportDoneTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'report_done')
  if (unsupportedStatus) return unsupportedStatus
  const unsupportedBlockedBy = unsupportedBlockedByParam(params, 'report_done')
  if (unsupportedBlockedBy) return unsupportedBlockedBy
  const existingTask = requireTask(input.team, taskId)
  const transitionAt = Date.now()
  const initialTransition = transitionTask(reducerTaskSnapshot(existingTask), {
    type: 'report_done',
    at: transitionAt,
    actor: input.actor,
    note: params.note,
  })
  if (!initialTransition.ok) return taskTransitionFailure(existingTask, 'report_done', initialTransition.reason)
  if (input.actor !== TEAM_LEAD && input.actor !== existingTask.owner) {
    return denyNonOwnerReport(existingTask, input.actor, 'report_done')
  }
  let leaderWake: TaskCommandResult['leaderWake']
  let leaderMailbox: TaskCommandResult['leaderMailbox']
  const reportAttention = planTaskReportAttention('report_done')
  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const ownerAtReport = task.owner
    const statusAtReport = taskStatusAtReport(task)
    const reporterIsOwner = input.actor === task.owner
    const role = actorRole(latest, input.actor)
    const note = role === 'implementer'
      ? buildImplementationCompletionNote(params.note)
      : noteText(params, 'Done report')
    const transition = applyReducerTransition(task, {
      type: 'report_done',
      at: transitionAt,
      actor: input.actor,
      note,
    })
    if (!transition.ok) throw new Error(transition.reason)
    const threadId = defaultThreadIdForTask(task.id)
    const report = appendTaskReportHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'report_done',
      author: input.actor,
      text: note,
      summary: compactTaskHistorySummary(note),
      createdAt: transitionAt,
      threadId,
      reporterIsOwner,
      statusAtReport,
      ownerAtReport,
      metadata: { source: 'agentteam_task_dual_write' },
    })
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'report_submitted',
      by: input.actor,
      at: transitionAt,
      summary: compactTaskHistorySummary(note),
      reportId: report.id,
      data: { source: 'agentteam_task_dual_write', reportType: 'report_done' },
    })
    if (input.actor !== TEAM_LEAD) {
      leaderMailbox = {
        message: {
          from: input.actor,
          to: TEAM_LEAD,
          text: `${task.id} done report by ${input.actor}: ${task.title}`,
          summary: `${task.id} done report: ${report.summary}`,
          type: 'report_done',
          taskId: task.id,
          threadId: defaultThreadIdForTask(task.id),
          priority: 'normal',
          wakeHint: reportAttention.wakeHint,
          metadata: { reportOnly: true, reporterIsOwner: true, reportId: report.id, ...reportAttention.metadata },
        },
      }
      leaderWake = {
        type: 'report_done',
        wakeHint: reportAttention.wakeHint,
        from: input.actor,
        summary: `${task.id} done report`,
        text: `${task.id} done report by ${input.actor}: ${task.title}`,
      }
    }
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return {
    task,
    text: input.actor === TEAM_LEAD ? `Recorded done report for ${task.id}` : `Reported done for ${task.id} to ${TEAM_LEAD}`,
    details: { task, reportOnly: true, reporterIsOwner: true },
    leaderWake,
    wakeTeam: updated,
    leaderMailbox,
  }
}

function reportBlockedTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'report_blocked')
  if (unsupportedStatus) return unsupportedStatus
  const existingTask = requireTask(input.team, taskId)
  const transitionAt = Date.now()
  const initialTransition = transitionTask(reducerTaskSnapshot(existingTask), {
    type: 'report_blocked',
    at: transitionAt,
    actor: input.actor,
    note: params.note,
  })
  if (!initialTransition.ok) return taskTransitionFailure(existingTask, 'report_blocked', initialTransition.reason)
  if (input.actor !== TEAM_LEAD && input.actor !== existingTask.owner) {
    return denyNonOwnerReport(existingTask, input.actor, 'report_blocked')
  }
  let leaderWake: TaskCommandResult['leaderWake']
  let leaderMailbox: TaskCommandResult['leaderMailbox']
  const reportAttention = planTaskReportAttention('report_blocked')
  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const ownerAtReport = task.owner
    const statusAtReport = taskStatusAtReport(task)
    const reporterIsOwner = input.actor === task.owner
    const blockerText = params.blockedBy?.length
      ? `Blocked by: ${params.blockedBy.join(', ')}`
      : undefined
    const note = [noteText(params, 'Blocked report'), blockerText].filter(Boolean).join('\n')
    const transition = applyReducerTransition(task, {
      type: 'report_blocked',
      at: transitionAt,
      actor: input.actor,
      note,
    })
    if (!transition.ok) throw new Error(transition.reason)
    const threadId = defaultThreadIdForTask(task.id)
    const report = appendTaskReportHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'report_blocked',
      author: input.actor,
      text: note,
      summary: compactTaskHistorySummary(note),
      createdAt: transitionAt,
      threadId,
      reporterIsOwner,
      reportedBlockedBy: params.blockedBy ?? [],
      statusAtReport,
      ownerAtReport,
      metadata: { source: 'agentteam_task_dual_write' },
    })
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'report_submitted',
      by: input.actor,
      at: transitionAt,
      summary: compactTaskHistorySummary(note),
      reportId: report.id,
      data: { source: 'agentteam_task_dual_write', reportType: 'report_blocked', reportedBlockedBy: params.blockedBy ?? [] },
    })
    if (input.actor !== TEAM_LEAD) {
      leaderMailbox = {
        message: {
          from: input.actor,
          to: TEAM_LEAD,
          text: `${task.id} blocked report by ${input.actor}: ${task.title}`,
          summary: `${task.id} blocked report: ${report.summary}`,
          type: 'report_blocked',
          taskId: task.id,
          threadId: defaultThreadIdForTask(task.id),
          priority: 'high',
          wakeHint: reportAttention.wakeHint,
          metadata: {
            reportOnly: true,
            ...reportAttention.metadata,
            reportId: report.id,
            reportedBlockedBy: params.blockedBy ?? [],
            reporterIsOwner: true,
          },
        },
      }
      leaderWake = {
        type: 'report_blocked',
        wakeHint: reportAttention.wakeHint,
        from: input.actor,
        summary: `${task.id} blocked report`,
        text: `${task.id} blocked report by ${input.actor}: ${task.title}`,
      }
    }
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return {
    task,
    text: input.actor === TEAM_LEAD ? `Recorded blocked report for ${task.id}` : `Reported blocked status for ${task.id} to ${TEAM_LEAD}`,
    details: { task, reportOnly: true, reportedBlockedBy: params.blockedBy ?? [], reporterIsOwner: true },
    leaderWake,
    wakeTeam: updated,
    leaderMailbox,
  }
}

function appendTaskWarnings(result: TaskCommandResult, warnings: NonNullable<TaskCommandResult['sideEffectWarnings']>): void {
  if (warnings.length === 0) return
  result.sideEffectWarnings = [...(result.sideEffectWarnings ?? []), ...warnings]
  result.details.sideEffectWarnings = result.sideEffectWarnings
  result.details.warning = result.details.warning ?? 'side_effect_failed'
  result.text = `${result.text} (warning: side effect failed: ${warnings.map(item => `${item.kind}${item.error ? ` ${item.error}` : ''}`).join('; ')})`
}

function appendOutboxTaskWarnings(result: TaskCommandResult, run: OutboxRunResult): void {
  appendTaskWarnings(result, run.results
    .filter(item => !item.ok)
    .map(item => ({
      kind: outboxEffectWarningName(item.kind),
      error: item.error,
      effectId: item.effectId,
      outboxKind: item.kind,
      outboxStatus: item.terminal ? 'failed' : 'pending',
    })))
}

function mailboxMessageId(effectId: string): string {
  return `mailbox-${effectId}`
}

async function runTaskOutboxEffects(
  result: TaskCommandResult,
  deps: TaskApplicationDeps,
  teamName: string,
  effectIds: string[],
): Promise<OutboxRunResult> {
  const run = await runOutboxOnce({
    teamName,
    workerId: 'task-application',
    limit: effectIds.length || 1,
    effectIds,
  }, deps)
  result.details.outboxRun = run
  result.details.outboxEffects = effectIds.map(effectId => {
    const effect = deps.outboxStore.get(teamName, effectId)
    return effect
      ? { effectId, kind: effect.kind, status: effect.status, idempotencyKey: effect.idempotencyKey, lastError: effect.lastError }
      : { effectId, status: 'pending' }
  })
  appendOutboxTaskWarnings(result, run)
  return run
}

async function handleTaskApplicationSideEffects(result: TaskCommandResult, ctx: ExtensionContext, deps: TaskApplicationDeps): Promise<void> {
  deps.invalidateStatus(ctx)

  let leaderWakeMessage = result.leaderWake
  let mailboxDelivered = false
  let sentLeaderMailboxMessage: { id?: string } | undefined
  let mailboxOutboxEffectId: string | undefined
  let leaderMailboxReportId: string | undefined
  const outboxEffectIds: string[] = []

  if (result.leaderMailbox && result.wakeTeam) {
    const pushed = result.leaderMailbox.message
    leaderMailboxReportId = typeof pushed.metadata?.reportId === 'string' ? pushed.metadata.reportId : undefined
    const mailboxEffect = deps.outboxStore.enqueue({
      teamName: result.wakeTeam.name,
      kind: 'inbox_item_append_requested',
      idempotencyKey: ['task-leader-mailbox', result.wakeTeam.name, pushed.type ?? 'inform', pushed.taskId ?? '', pushed.from, pushed.to, String(pushed.metadata?.reportId ?? ''), outboxHash(pushed.summary ?? ''), outboxHash(pushed.text)].join(':'),
      payload: {
        teamName: result.wakeTeam.name,
        recipient: pushed.to,
        message: {
          ...pushed,
          id: 'mailbox-pending',
          metadata: { ...(pushed.metadata ?? {}), outboxSource: 'taskApplication' },
        },
      },
    })
    const deterministicMailboxId = mailboxMessageId(mailboxEffect.effectId)
    mailboxEffect.payload.message.id = deterministicMailboxId
    mailboxOutboxEffectId = mailboxEffect.effectId
    outboxEffectIds.push(mailboxEffect.effectId)
    if (leaderWakeMessage) {
      leaderWakeMessage = {
        ...leaderWakeMessage,
        messageId: deterministicMailboxId,
        taskId: pushed.taskId,
        threadId: pushed.threadId,
      }
    }
    const run = await runTaskOutboxEffects(result, deps, result.wakeTeam.name, [mailboxEffect.effectId])
    const mailboxRunResult = run.results.find(item => item.effectId === mailboxEffect.effectId)
    const storedMailboxEffect = deps.outboxStore.get(result.wakeTeam.name, mailboxEffect.effectId)
    mailboxDelivered = Boolean(mailboxRunResult?.ok || storedMailboxEffect?.status === 'done')
    sentLeaderMailboxMessage = (mailboxRunResult?.value ?? storedMailboxEffect?.result) as { id?: string } | undefined
    if (!sentLeaderMailboxMessage && mailboxDelivered) sentLeaderMailboxMessage = { id: deterministicMailboxId }
    result.details.leaderMailboxDelivered = mailboxDelivered
    if (mailboxDelivered && leaderMailboxReportId && sentLeaderMailboxMessage?.id) {
      const reportId = leaderMailboxReportId
      const mailboxMessageId = sentLeaderMailboxMessage.id
      const refreshed = deps.teamState.updateTeam(result.wakeTeam.name, latest => {
        deps.taskMutations.updateTaskReport(latest, reportId, { mailboxMessageId })
      })
      if (refreshed) result.wakeTeam = refreshed
    }
    if (!mailboxDelivered) {
      const mailboxError = mailboxRunResult?.error ?? deps.outboxStore.get(result.wakeTeam.name, mailboxEffect.effectId)?.lastError ?? 'leader mailbox push failed'
      result.details.mailboxDeliveryFailed = { recipient: pushed.to, error: mailboxError }
      result.text = `${result.text} (leader mailbox push failed for ${pushed.to}: ${mailboxError})`
    }
  }

  const reportEffects = planTaskReportEffects({
    wakeTeam: result.wakeTeam,
    leaderWake: leaderWakeMessage,
    mailboxDelivered,
    mailboxMessageId: sentLeaderMailboxMessage?.id,
    leaderMailboxRequired: Boolean(result.leaderMailbox),
  })
  if (reportEffects.leaderAttention && result.wakeTeam) {
    const attentionEffect = deps.outboxStore.enqueue({
      teamName: result.wakeTeam.name,
      kind: 'leader_attention_requested',
      idempotencyKey: ['task-leader-attention', result.wakeTeam.name, reportEffects.leaderAttention.message.type, reportEffects.leaderAttention.message.messageId ?? '', reportEffects.leaderAttention.message.taskId ?? ''].join(':'),
      payload: {
        teamName: result.wakeTeam.name,
        message: reportEffects.leaderAttention.message,
      },
      dependsOn: mailboxOutboxEffectId ? [mailboxOutboxEffectId] : [],
    })
    outboxEffectIds.push(attentionEffect.effectId)
    await runTaskOutboxEffects(result, deps, result.wakeTeam.name, [attentionEffect.effectId])
  }


  if (outboxEffectIds.length > 0) {
    result.details.outboxEffectIds = outboxEffectIds
  }
}

export async function executeTaskApplication(
  input: TaskApplicationInput,
  deps: TaskApplicationDeps,
): Promise<TaskApplicationResult> {
  const { params, ctx } = input
  const team = deps.ensureTeamForSession(ctx)
  if (!team) return { text: 'No current team context.', details: {} }

  const teamName = team.name
  const actor = deps.currentActor(ctx)
  const denied = ensureTaskPrivilege(team, actor, params.action)
  if (denied) {
    const result: TaskCommandResult = { text: denied, details: { denied: true, action: params.action, actor } }
    await handleTaskApplicationSideEffects(result, ctx, deps)
    return { text: result.text, details: result.details, sideEffectWarnings: result.sideEffectWarnings }
  }

  const commandContext: TaskCommandContext = { team, teamName, actor, deps }
  if (params.action === 'list') {
    const result = listTasksCommand(commandContext, params)
    return { text: result.text, details: result.details, sideEffectWarnings: result.sideEffectWarnings }
  }

  if (params.action === 'report') {
    const result = reportTaskCommand(commandContext, params)
    return { text: result.text, details: result.details, sideEffectWarnings: result.sideEffectWarnings }
  }

  if (params.action === 'create') {
    const result = createTaskCommand(commandContext, params)
    await handleTaskApplicationSideEffects(result, ctx, deps)
    return { text: result.text, details: result.details, sideEffectWarnings: result.sideEffectWarnings }
  }

  if (!params.taskId) throw new Error('taskId is required for this action')
  const taskId = params.taskId

  let result: TaskCommandResult
  switch (params.action) {
    case 'show':
      result = showTaskCommand(commandContext, taskId)
      break
    case 'history':
      result = historyTaskCommand(commandContext, taskId, params)
      break
    case 'reports':
      result = reportsTaskCommand(commandContext, taskId)
      break
    case 'assign':
      result = assignTaskCommand(commandContext, taskId, params)
      break
    case 'block':
      result = blockTaskCommand(commandContext, taskId, params)
      break
    case 'unblock':
      result = unblockTaskCommand(commandContext, taskId, params)
      break
    case 'close':
      result = closeTaskCommand(commandContext, taskId, params)
      break
    case 'progress':
      result = progressTaskCommand(commandContext, taskId, params)
      break
    case 'report_done':
      result = reportDoneTaskCommand(commandContext, taskId, params)
      break
    case 'report_blocked':
      result = reportBlockedTaskCommand(commandContext, taskId, params)
      break
    default:
      throw new Error(`Unsupported action ${(params as { action: string }).action}`)
  }

  if (params.action === 'show' || params.action === 'history' || params.action === 'reports') {
    return { text: result.text, details: result.details, sideEffectWarnings: result.sideEffectWarnings }
  }

  await handleTaskApplicationSideEffects(result, ctx, deps)
  return { text: result.text, details: result.details, sideEffectWarnings: result.sideEffectWarnings }
}
