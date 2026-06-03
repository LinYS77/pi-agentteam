import type {
  TaskEvent,
  TaskEventType,
  TaskMessageRef,
  TaskReport,
  TaskReportStatusAtReport,
  TeamMessagePriority,
  TeamMessageType,
  TeamMessageWakeHint,
  TeamState,
} from '../internalTypes.js'

export type TaskHistoryCounts = {
  reports: number
  events: number
  messageRefs: number
}

export type TaskHistorySummary = TaskHistoryCounts & {
  taskId: string
  latestReport?: TaskReport
  latestActivity?: TaskReport | TaskEvent | TaskMessageRef
}

type TimedTaskHistoryItem = (TaskReport | TaskMessageRef) & { createdAt: number } | TaskEvent

function seq(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : 1
}

function id(prefix: string, value: number): string {
  return `${prefix}${String(value).padStart(4, '0')}`
}

function itemTime(item: TimedTaskHistoryItem): number {
  return 'createdAt' in item ? item.createdAt : item.at
}

export function compactTaskHistorySummary(text: string): string {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  return singleLine.length > 140 ? `${singleLine.slice(0, 137)}...` : singleLine
}

export function formatTaskReportId(seqValue: number): string {
  return id('TR', seq(seqValue))
}

export function formatTaskEventId(seqValue: number): string {
  return id('TE', seq(seqValue))
}

export function formatTaskMessageRefId(seqValue: number): string {
  return id('TMR', seq(seqValue))
}

export function allocateTaskReportId(team: TeamState): string {
  const next = seq(team.nextTaskReportSeq)
  team.nextTaskReportSeq = next + 1
  return formatTaskReportId(next)
}

export function allocateTaskEventId(team: TeamState): string {
  const next = seq(team.nextTaskEventSeq)
  team.nextTaskEventSeq = next + 1
  return formatTaskEventId(next)
}

export function allocateTaskMessageRefId(team: TeamState): string {
  const next = seq(team.nextTaskMessageRefSeq)
  team.nextTaskMessageRefSeq = next + 1
  return formatTaskMessageRefId(next)
}

export type AppendTaskReportHistoryInput = {
  taskId: string
  type: Extract<TeamMessageType, 'report_done' | 'report_blocked'>
  author: string
  text: string
  summary?: string
  createdAt?: number
  threadId?: string
  reporterIsOwner: boolean
  reportedBlockedBy?: string[]
  statusAtReport: TaskReportStatusAtReport
  ownerAtReport?: string
  mailboxMessageId?: string
  metadata?: Record<string, unknown>
}

export type UpdateTaskReportHistoryInput = Partial<Omit<TaskReport, 'id' | 'taskId'>>

export function appendTaskReport(
  team: TeamState,
  input: AppendTaskReportHistoryInput,
): TaskReport {
  const report: TaskReport = {
    id: allocateTaskReportId(team),
    taskId: input.taskId,
    type: input.type,
    author: input.author,
    text: input.text,
    summary: input.summary ?? compactTaskHistorySummary(input.text),
    createdAt: input.createdAt ?? Date.now(),
    threadId: input.threadId,
    reportOnly: true,
    reporterIsOwner: input.reporterIsOwner,
    reportedBlockedBy: input.reportedBlockedBy,
    statusAtReport: input.statusAtReport,
    ownerAtReport: input.ownerAtReport,
    mailboxMessageId: input.mailboxMessageId,
    metadata: input.metadata,
  }
  team.taskReports[report.id] = report
  return report
}

export function updateTaskReport(
  team: TeamState,
  reportId: string,
  patch: UpdateTaskReportHistoryInput,
): TaskReport | undefined {
  const existing = team.taskReports[reportId]
  if (!existing) return undefined
  const next: TaskReport = {
    ...existing,
    ...patch,
    id: existing.id,
    taskId: existing.taskId,
    reportOnly: true,
  }
  team.taskReports[reportId] = next
  return next
}

export function appendTaskEvent(
  team: TeamState,
  input: {
    taskId: string
    type: TaskEventType
    by: string
    at?: number
    summary: string
    reportId?: string
    data?: Record<string, unknown>
  },
): TaskEvent {
  const event: TaskEvent = {
    id: allocateTaskEventId(team),
    taskId: input.taskId,
    type: input.type,
    by: input.by,
    at: input.at ?? Date.now(),
    summary: input.summary,
    reportId: input.reportId,
    data: input.data,
  }
  team.taskEvents[event.id] = event
  return event
}

export function appendTaskMessageRef(
  team: TeamState,
  input: {
    taskId: string
    mailboxMessageId: string
    from: string
    to: string
    type: TeamMessageType
    createdAt?: number
    threadId?: string
    summary?: string
    priority?: TeamMessagePriority
    wakeHint?: TeamMessageWakeHint
    reportId?: string
    diagnostic?: boolean
    metadata?: Record<string, unknown>
  },
): TaskMessageRef {
  const existing = findTaskMessageRefByMailboxMessageId(team, input.mailboxMessageId)
  if (existing) return existing
  const ref: TaskMessageRef = {
    id: allocateTaskMessageRefId(team),
    taskId: input.taskId,
    mailboxMessageId: input.mailboxMessageId,
    from: input.from,
    to: input.to,
    type: input.type,
    createdAt: input.createdAt ?? Date.now(),
    threadId: input.threadId,
    summary: input.summary,
    priority: input.priority,
    wakeHint: input.wakeHint,
    reportId: input.reportId,
    diagnostic: input.diagnostic,
    metadata: input.metadata,
  }
  team.taskMessageRefs[ref.id] = ref
  return ref
}

export function findTaskMessageRefByMailboxMessageId(
  team: TeamState,
  mailboxMessageId: string,
): TaskMessageRef | undefined {
  return Object.values(team.taskMessageRefs).find(ref => ref.mailboxMessageId === mailboxMessageId)
}

function byTask<T extends { taskId: string }>(items: Record<string, T>, taskId: string): T[] {
  return Object.values(items).filter(item => item.taskId === taskId)
}

function newest<T extends TimedTaskHistoryItem>(items: T[]): T | undefined {
  return items
    .slice()
    .sort((a, b) => itemTime(b) - itemTime(a) || b.id.localeCompare(a.id))[0]
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
  return team.taskReports[reportId]
}

export function latestTaskReport(team: TeamState, taskId: string): TaskReport | undefined {
  return newest(taskReportsForTask(team, taskId))
}

export function latestTaskActivity(team: TeamState, taskId: string): TaskReport | TaskEvent | TaskMessageRef | undefined {
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
