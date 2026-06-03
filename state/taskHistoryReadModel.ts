import type {
  TaskEvent,
  TaskMessageRef,
  TaskReport,
  TeamState,
} from '../internalTypes.js'

export type TaskHistoryCounts = {
  reports: number
  events: number
  messageRefs: number
}

export type TaskHistoryItem = TaskReport | TaskEvent | TaskMessageRef

export type TaskHistorySummary = TaskHistoryCounts & {
  taskId: string
  latestReport?: TaskReport
  latestActivity?: TaskHistoryItem
}

export type TaskHistoryReportCompact = {
  id: string
  taskId: string
  type: TaskReport['type']
  author: string
  summary: string
  createdAt: number
  threadId?: string
  reportOnly: true
  reporterIsOwner: boolean
  reportedBlockedBy: string[]
  statusAtReport: TaskReport['statusAtReport']
  ownerAtReport?: string
  mailboxMessageId?: string
}

export type TaskHistoryReportDisplay = {
  id: string
  taskId: string
  type: TaskReport['type']
  author: string
  summary: string
  createdAt: number
  statusAtReport: TaskReport['statusAtReport']
  ownerAtReport?: string
  reportedBlockedBy: string[]
  mailboxMessageId?: string
}

export type TaskHistoryActivityCompact =
  | {
    kind: 'report'
    id: string
    taskId: string
    type: TaskReport['type']
    at: number
    by: string
    summary: string
  }
  | {
    kind: 'event'
    id: string
    taskId: string
    type: TaskEvent['type']
    displayType: string
    at: number
    by: string
    summary: string
    reportId?: string
  }
  | {
    kind: 'messageRef'
    id: string
    taskId: string
    mailboxMessageId: string
    type: TaskMessageRef['type']
    at: number
    from: string
    to: string
    summary?: string
  }

export type TaskHistoryActivityDisplay =
  | Extract<TaskHistoryActivityCompact, { kind: 'report' }>
  | Extract<TaskHistoryActivityCompact, { kind: 'event' }>
  | (Extract<TaskHistoryActivityCompact, { kind: 'messageRef' }> & {
    reportId?: string
    diagnostic?: boolean
  })

export type TaskHistoryCompactSummary = TaskHistoryCounts & {
  taskId: string
  latestReport?: TaskHistoryReportCompact
  latestActivity?: TaskHistoryActivityCompact
}

export type TaskHistoryDisplaySummary = TaskHistoryCounts & {
  taskId: string
  latestReport?: TaskHistoryReportDisplay
  latestActivity?: TaskHistoryActivityDisplay
}

type TimedTaskHistoryItem = (TaskReport | TaskMessageRef) & { createdAt: number } | TaskEvent

function byTask<T extends { taskId: string }>(items: Record<string, T> | undefined, taskId: string): T[] {
  return Object.values(items ?? {}).filter(item => item.taskId === taskId)
}

export function taskHistoryItemTime(item: TimedTaskHistoryItem): number {
  return 'createdAt' in item ? item.createdAt : item.at
}

export function taskHistoryItemKind(item: TaskHistoryItem): 'report' | 'event' | 'messageRef' {
  if ('author' in item) return 'report'
  if ('mailboxMessageId' in item) return 'messageRef'
  return 'event'
}

export function displayTaskEventType(type: TaskEvent['type']): string {
  return type === 'report_submitted' ? 'report' : type
}

function newest<T extends TimedTaskHistoryItem>(items: T[]): T | undefined {
  return items
    .slice()
    .sort((a, b) => taskHistoryItemTime(b) - taskHistoryItemTime(a) || b.id.localeCompare(a.id))[0]
}

export function compactTaskHistorySummary(text: string): string {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  return singleLine.length > 140 ? `${singleLine.slice(0, 137)}...` : singleLine
}

export function taskReportsForTask(team: TeamState, taskId: string): TaskReport[] {
  return byTask(team.taskReports, taskId).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export function taskEventsForTask(team: TeamState, taskId: string): TaskEvent[] {
  return byTask(team.taskEvents, taskId).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}

export function taskMessageRefsForTask(team: TeamState, taskId: string): TaskMessageRef[] {
  return byTask(team.taskMessageRefs, taskId).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export function findTaskReport(team: TeamState, reportId: string): TaskReport | undefined {
  return (team.taskReports ?? {})[reportId]
}

export function latestTaskReport(team: TeamState, taskId: string): TaskReport | undefined {
  return newest(taskReportsForTask(team, taskId))
}

export function latestTaskActivity(team: TeamState, taskId: string): TaskHistoryItem | undefined {
  return newest([
    ...taskReportsForTask(team, taskId),
    ...taskEventsForTask(team, taskId),
    ...taskMessageRefsForTask(team, taskId),
  ])
}

export function taskHistoryCounts(team: TeamState, taskId: string): TaskHistoryCounts {
  return {
    reports: taskReportsForTask(team, taskId).length,
    events: taskEventsForTask(team, taskId).length,
    messageRefs: taskMessageRefsForTask(team, taskId).length,
  }
}

export function taskHistorySummary(team: TeamState, taskId: string): TaskHistorySummary {
  return {
    taskId,
    ...taskHistoryCounts(team, taskId),
    latestReport: latestTaskReport(team, taskId),
    latestActivity: latestTaskActivity(team, taskId),
  }
}

export function taskHistoryTimelineItems(
  team: TeamState,
  taskId: string,
  options: { includeMessages?: boolean } = {},
): TaskHistoryItem[] {
  const includeMessages = options.includeMessages !== false
  const items: TaskHistoryItem[] = [
    ...taskEventsForTask(team, taskId),
    ...taskReportsForTask(team, taskId),
  ]
  if (includeMessages) items.push(...taskMessageRefsForTask(team, taskId))
  return items.sort((a, b) => taskHistoryItemTime(a) - taskHistoryItemTime(b) || a.id.localeCompare(b.id))
}

export function compactTaskReport(report: TaskReport): TaskHistoryReportCompact {
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

export function displayTaskReport(report: TaskReport): TaskHistoryReportDisplay {
  return {
    id: report.id,
    taskId: report.taskId,
    type: report.type,
    author: report.author,
    summary: report.summary,
    createdAt: report.createdAt,
    statusAtReport: report.statusAtReport,
    ownerAtReport: report.ownerAtReport,
    reportedBlockedBy: report.reportedBlockedBy ?? [],
    mailboxMessageId: report.mailboxMessageId,
  }
}

export function compactTaskActivity(item: TaskHistoryItem | undefined): TaskHistoryActivityCompact | undefined {
  if (!item) return undefined
  const kind = taskHistoryItemKind(item)
  if (kind === 'report') {
    const report = item as TaskReport
    return {
      kind: 'report',
      id: report.id,
      taskId: report.taskId,
      type: report.type,
      at: report.createdAt,
      by: report.author,
      summary: report.summary,
    }
  }
  if (kind === 'messageRef') {
    const ref = item as TaskMessageRef
    return {
      kind: 'messageRef',
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
    kind: 'event',
    id: event.id,
    taskId: event.taskId,
    type: event.type,
    displayType: displayTaskEventType(event.type),
    at: event.at,
    by: event.by,
    summary: event.summary,
    reportId: event.reportId,
  }
}

export function displayTaskActivity(item: TaskHistoryItem | undefined): TaskHistoryActivityDisplay | undefined {
  if (!item) return undefined
  const compact = compactTaskActivity(item)
  if (!compact || compact.kind !== 'messageRef') return compact
  const ref = item as TaskMessageRef
  return {
    ...compact,
    reportId: ref.reportId,
    diagnostic: ref.diagnostic,
  }
}

export function compactTaskReportsForTask(team: TeamState, taskId: string): TaskHistoryReportCompact[] {
  return taskReportsForTask(team, taskId).map(compactTaskReport)
}

export function displayTaskReportsForTask(team: TeamState, taskId: string): TaskHistoryReportDisplay[] {
  return taskReportsForTask(team, taskId).map(displayTaskReport)
}

export function compactTaskHistoryTimeline(
  team: TeamState,
  taskId: string,
  options: { includeMessages?: boolean } = {},
): TaskHistoryActivityCompact[] {
  return taskHistoryTimelineItems(team, taskId, options)
    .map(item => compactTaskActivity(item)!)
}

export function displayTaskHistoryTimeline(
  team: TeamState,
  taskId: string,
  options: { includeMessages?: boolean } = {},
): TaskHistoryActivityDisplay[] {
  return taskHistoryTimelineItems(team, taskId, options)
    .map(item => displayTaskActivity(item)!)
}

export function taskHistoryCompactSummary(team: TeamState, taskId: string): TaskHistoryCompactSummary {
  const summary = taskHistorySummary(team, taskId)
  return {
    taskId,
    reports: summary.reports,
    events: summary.events,
    messageRefs: summary.messageRefs,
    latestReport: summary.latestReport ? compactTaskReport(summary.latestReport) : undefined,
    latestActivity: compactTaskActivity(summary.latestActivity),
  }
}

export function taskHistoryDisplaySummary(team: TeamState, taskId: string): TaskHistoryDisplaySummary {
  const summary = taskHistorySummary(team, taskId)
  return {
    taskId,
    reports: summary.reports,
    events: summary.events,
    messageRefs: summary.messageRefs,
    latestReport: summary.latestReport ? displayTaskReport(summary.latestReport) : undefined,
    latestActivity: displayTaskActivity(summary.latestActivity),
  }
}
