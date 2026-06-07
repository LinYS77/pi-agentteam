import type { TeamState, TeamTask } from '../internalTypes.js'
import { buildReportWatchdogSummary, type ReportWatchdogTaskSummary } from '../state/taskReportWatchdogReadModel.js'
import {
  compactTaskActivity,
  compactTaskReport,
  taskHistoryCompactSummary,
  taskHistoryTimelineItems,
  taskReportsForTask,
  type TaskHistoryActivityCompact,
} from '../state/taskHistoryReadModel.js'
import { formatTask } from './taskFormatting.js'
import type { TaskApplicationDeps } from './types.js'
import type { TaskCommandResult, TeamTaskInput } from './taskTypes.js'

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

type TaskReadCommandContext = {
  team: TeamState
  deps: Pick<TaskApplicationDeps, 'taskHistory'>
}

function requireTask(team: TeamState, taskId: string): TeamTask {
  const task = team.tasks[taskId]
  if (!task) throw new Error(`Task ${taskId} not found`)
  return task
}

function taskAttentionRank(task: TeamTask): number {
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

function compareTasksForList(a: TeamTask, b: TeamTask): number {
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

function countTasksByStatus(tasks: TeamTask[]): Record<TaskStatus, number> {
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

function taskBrief(task: TeamTask) {
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

function formatMaybeList(values: string[]): string {
  return values.length ? values.join(', ') : '-'
}

function formatMaybeNumber(value: number | undefined): string {
  return value === undefined ? '-' : String(value)
}

function reportWatchdogForTask(team: TeamState, taskId: string): ReportWatchdogTaskSummary | undefined {
  return buildReportWatchdogSummary(team).tasks.find(task => task.taskId === taskId)
}

function formatReportWatchdog(watchdog: ReportWatchdogTaskSummary | undefined, taskId: string): string {
  if (!watchdog) return 'Report watchdog: -'
  const nudgeHint = watchdog.needsNudge ? `; hint agentteam_task action=nudge_report taskId=${taskId}` : ''
  return `Report watchdog: state=${watchdog.state}; owner=${watchdog.owner}; workerStatus=${watchdog.workerStatus ?? '-'}; needsNudge=${watchdog.needsNudge}; latestAssignmentAt=${formatMaybeNumber(watchdog.latestAssignmentAt)}; latestOwnerReportAt=${formatMaybeNumber(watchdog.latestOwnerReportAt)}${nudgeHint}`
}

export function showTaskCommand(input: TaskReadCommandContext, taskId: string): TaskCommandResult {
  const task = requireTask(input.team, taskId)
  const summary = taskHistoryCompactSummary(input.team, task.id)
  const latestReport = summary.latestReport
  const latestActivity = summary.latestActivity
  const latestActivityDisplayType = latestActivity
    ? (latestActivity.kind === 'event' ? latestActivity.displayType : latestActivity.type)
    : undefined
  const reportWatchdog = reportWatchdogForTask(input.team, task.id)
  const lines = [
    `${task.id} [${task.status}] ${task.title}`,
    `Owner: ${task.owner ?? '-'}`,
    `Blocked by: ${formatMaybeList(task.blockedBy)}`,
    `Description: ${task.description || '-'}`,
    `History counts: reports ${summary.reports}, events ${summary.events}, messageRefs ${summary.messageRefs}`,
    `Latest report: ${latestReport ? `${latestReport.id} ${latestReport.type} by ${latestReport.author} — ${latestReport.summary}` : '-'}`,
    `Latest activity: ${latestActivity ? `${latestActivity.kind} ${latestActivity.id} ${latestActivityDisplayType} — ${latestActivity.summary ?? '-'}` : '-'}`,
    formatReportWatchdog(reportWatchdog, task.id),
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
      reportWatchdog,
      hints: {
        history: { action: 'history', taskId: task.id },
        reports: { action: 'reports', taskId: task.id },
        report: latestReport ? { action: 'report', reportId: latestReport.id } : { action: 'report', reportId: '<id>' },
      },
    },
  }
}

function formatHistoryRow(compact: TaskHistoryActivityCompact): string {
  if (compact.kind === 'report') return `${compact.at} report ${compact.id} ${compact.type} by ${compact.by}: ${compact.summary}`
  if (compact.kind === 'messageRef') return `${compact.at} messageRef ${compact.id} ${compact.type} ${compact.from}->${compact.to}: ${compact.summary ?? '(no summary)'}`
  return `${compact.at} event ${compact.id} ${compact.displayType} by ${compact.by}: ${compact.summary}`
}

export function historyTaskCommand(input: TaskReadCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const task = requireTask(input.team, taskId)
  const includeMessages = params.includeMessages !== false
  const allItems = taskHistoryTimelineItems(input.team, task.id, { includeMessages })
  const all = params.all === true
  const effectiveLimit = all ? allItems.length : clampHistoryLimit(params.limit)
  const shown = all ? allItems : allItems.slice(Math.max(0, allItems.length - effectiveLimit))
  const shownRows = shown.map(item => compactTaskActivity(item)!)
  const hiddenCount = Math.max(0, allItems.length - shown.length)
  const header = `History for ${task.id}: showing ${shown.length} of ${allItems.length} rows (hidden ${hiddenCount}; limit ${all ? 'all' : effectiveLimit}; messageRefs ${includeMessages ? 'included' : 'excluded'}). Use action=report reportId=<id> for full report text.`
  const rows = shownRows.map(formatHistoryRow)
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
      rows: shownRows,
    },
  }
}

export function reportsTaskCommand(input: TaskReadCommandContext, taskId: string): TaskCommandResult {
  const task = requireTask(input.team, taskId)
  const reports = taskReportsForTask(input.team, task.id)
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
      reports: reports.map(compactTaskReport),
    },
  }
}

export function reportTaskCommand(input: TaskReadCommandContext, params: TeamTaskInput): TaskCommandResult {
  const reportId = params.reportId?.trim()
  if (!reportId) throw new Error('reportId is required for action=report')
  const report = input.deps.taskHistory.findTaskReport(input.team, reportId)
  if (!report) throw new Error(`Task report ${reportId} not found`)
  if (params.taskId && report.taskId !== params.taskId) {
    throw new Error(`Task report ${report.id} is for task ${report.taskId}, not ${params.taskId}`)
  }
  const task = requireTask(input.team, report.taskId)
  const meta = compactTaskReport(report)
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

export function listTasksCommand(input: TaskReadCommandContext, params: TeamTaskInput = { action: 'list' }): TaskCommandResult {
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
