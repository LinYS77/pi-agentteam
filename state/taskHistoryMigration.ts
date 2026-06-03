import { isMessageType, isTaskReportType, type TaskReportType, type TaskStatus } from '../core/publicModel.js'
import type {
  TaskEvent,
  TaskEventType,
  TaskMessageRef,
  TaskReport,
  TeamMessagePriority,
  TeamMessageType,
  TeamMessageWakeHint,
  TeamState,
  TeamTask,
} from '../internalTypes.js'
import { TEAM_LEAD } from '../internalTypes.js'
import { normalizeTeamState } from './merge.js'
import {
  compactTaskHistorySummary,
  formatTaskEventId,
  formatTaskMessageRefId,
  formatTaskReportId,
} from './taskHistory.js'

export type TaskHistoryMigrationResult = {
  team: TeamState
  reportsAdded: number
  eventsAdded: number
  messageRefsAdded: number
  notesRemoved: number
}

type LegacyTaskNote = {
  at?: number
  author?: string
  text?: string
  threadId?: string
  messageType?: TeamMessageType | string
  requestId?: string
  linkedMessageId?: string
  metadata?: Record<string, unknown>
  hidden?: boolean
}

type LegacyTask = TeamTask & {
  notes?: LegacyTaskNote[]
}

type LegacyTeamState = Omit<TeamState, 'tasks'> & {
  tasks: Record<string, LegacyTask>
}

type MigrationMutableState = {
  nextTaskReportSeq: number
  nextTaskEventSeq: number
  nextTaskMessageRefSeq: number
}

type ExistingKeys = {
  reportKeys: Set<string>
  reportByKey: Map<string, TaskReport>
  eventKeys: Set<string>
  mailboxMessageIds: Set<string>
}

function recordValue<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, T>) }
    : {}
}

function seq(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : 1
}

function cloneLegacyTeamState(input: unknown): LegacyTeamState {
  const team = JSON.parse(JSON.stringify(input)) as LegacyTeamState
  team.tasks = recordValue<LegacyTask>(team.tasks)
  team.events = Array.isArray(team.events) ? [...team.events] : []
  team.taskReports = recordValue<TaskReport>(team.taskReports)
  team.taskEvents = recordValue<TaskEvent>(team.taskEvents)
  team.taskMessageRefs = recordValue<TaskMessageRef>(team.taskMessageRefs)
  team.nextTaskReportSeq = seq(team.nextTaskReportSeq)
  team.nextTaskEventSeq = seq(team.nextTaskEventSeq)
  team.nextTaskMessageRefSeq = seq(team.nextTaskMessageRefSeq)
  return team
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function noteAt(note: LegacyTaskNote): number {
  return typeof note.at === 'number' && Number.isFinite(note.at) ? note.at : 0
}

function noteAuthor(note: LegacyTaskNote): string {
  return typeof note.author === 'string' && note.author.trim() ? note.author : TEAM_LEAD
}

function noteText(note: LegacyTaskNote): string {
  return typeof note.text === 'string' ? note.text : ''
}

function noteKey(taskId: string, note: LegacyTaskNote, kind: string): string {
  return stableSerialize({
    kind,
    taskId,
    at: noteAt(note),
    author: noteAuthor(note),
    text: noteText(note),
    threadId: note.threadId,
    messageType: note.messageType,
    linkedMessageId: note.linkedMessageId,
  })
}

function meta(note: LegacyTaskNote): Record<string, unknown> {
  return note.metadata && typeof note.metadata === 'object' && !Array.isArray(note.metadata)
    ? note.metadata
    : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value.map(item => String(item ?? '').trim()).filter(Boolean)
  return out.length > 0 ? out : undefined
}

function messageTypeValue(value: unknown): TeamMessageType | undefined {
  return isMessageType(value) || isTaskReportType(value) ? value : undefined
}

function priorityValue(value: unknown): TeamMessagePriority | undefined {
  return value === 'low' || value === 'normal' || value === 'high' ? value : undefined
}

function wakeHintValue(value: unknown): TeamMessageWakeHint | undefined {
  return value === 'none' || value === 'soft' || value === 'hard' ? value : undefined
}

function taskEventTypeFromAction(value: unknown): TaskEventType | undefined {
  switch (value) {
    case 'create':
    case 'created':
      return 'created'
    case 'assign':
    case 'assigned':
      return 'assigned'
    case 'block':
    case 'blocked':
      return 'blocked'
    case 'unblock':
    case 'unblocked':
      return 'unblocked'
    case 'close':
    case 'closed':
      return 'closed'
    case 'progress':
    case 'note':
      return 'progress'
    default:
      return undefined
  }
}

function ownerRemovedMember(note: LegacyTaskNote): string | undefined {
  const match = noteText(note).match(/^Owner\s+(.+?)\s+removed from team; task returned to open$/)
  return match?.[1]
}

function legacyLinkedIds(note: LegacyTaskNote): Record<string, string> {
  const metadata = meta(note)
  const linkedIds: Record<string, string> = {}
  const metaLinkedIds = metadata.linkedIds
  if (metaLinkedIds && typeof metaLinkedIds === 'object' && !Array.isArray(metaLinkedIds)) {
    for (const [key, value] of Object.entries(metaLinkedIds as Record<string, unknown>)) {
      const text = stringValue(value)
      if (text) linkedIds[key] = text
    }
  }
  const linkedMessageId = stringValue(note.linkedMessageId) ?? stringValue(metadata.linkedMailboxMessageId)
  if (linkedMessageId) linkedIds.mailboxMessageId = linkedMessageId
  const taskId = stringValue(metadata.taskId)
  if (taskId) linkedIds.taskId = taskId
  const threadId = stringValue(note.threadId) ?? stringValue(metadata.threadId)
  if (threadId) linkedIds.threadId = threadId
  const mirrorOf = stringValue(metadata.mirrorOf)
  if (mirrorOf) linkedIds.mirrorOf = mirrorOf
  return linkedIds
}

function sourceKind(note: LegacyTaskNote): string {
  const metadata = meta(note)
  if (metadata.sourceKind === 'communication_ref') return 'communication_ref'
  if (metadata.sourceKind === 'legacy_communication_ref') return 'legacy_communication_ref'
  if (metadata.sourceKind === 'task_report') return 'task_report'
  if (metadata.sourceKind === 'task_note') return 'task_note'
  if (metadata.kind === 'communication_ref') return 'communication_ref'
  if (metadata.hidden === true && (metadata.source === 'agentteam_send' || typeof metadata.linkedMailboxMessageId === 'string')) return 'communication_ref'
  if (noteText(note).startsWith('Linked message:')) return 'legacy_communication_ref'
  if (note.messageType === 'report_done' || note.messageType === 'report_blocked' || metadata.reportOnly === true) return 'task_report'
  return 'task_note'
}

function isReportNote(note: LegacyTaskNote): boolean {
  if (note.messageType === 'report_done' || note.messageType === 'report_blocked') return true
  const metadata = meta(note)
  return metadata.sourceKind === 'task_report' || metadata.reportOnly === true
}

function reportType(note: LegacyTaskNote): TaskReportType {
  if (note.messageType === 'report_blocked') return 'report_blocked'
  if (note.messageType === 'report_done') return 'report_done'
  return stringArrayValue(meta(note).reportedBlockedBy) ? 'report_blocked' : 'report_done'
}

function statusAtReport(task: TeamTask, type: TaskReportType): Extract<TaskStatus, 'open' | 'blocked'> {
  if (task.status === 'open' || task.status === 'blocked') return task.status
  return type === 'report_blocked' ? 'blocked' : 'open'
}

function isCommunicationRef(note: LegacyTaskNote): boolean {
  if (sourceKind(note) === 'communication_ref' || sourceKind(note) === 'legacy_communication_ref') return true
  const links = legacyLinkedIds(note)
  return Boolean(links.mailboxMessageId || note.linkedMessageId)
}

function communicationMailboxMessageId(note: LegacyTaskNote): string | undefined {
  const links = legacyLinkedIds(note)
  return links.mailboxMessageId ?? stringValue(note.linkedMessageId)
}

function existingKeys(team: TeamState): ExistingKeys {
  const reportByKey = new Map<string, TaskReport>()
  for (const report of Object.values(team.taskReports)) {
    reportByKey.set(stableSerialize({
      taskId: report.taskId,
      type: report.type,
      author: report.author,
      text: report.text,
      createdAt: report.createdAt,
      threadId: report.threadId,
      mailboxMessageId: report.mailboxMessageId,
    }), report)
  }
  return {
    reportKeys: new Set(reportByKey.keys()),
    reportByKey,
    eventKeys: new Set(Object.values(team.taskEvents).map(event => stableSerialize({
      taskId: event.taskId,
      type: event.type,
      by: event.by,
      at: event.at,
      summary: event.summary,
      reportId: event.reportId,
      data: event.data,
    }))),
    mailboxMessageIds: new Set(Object.values(team.taskMessageRefs).map(ref => ref.mailboxMessageId)),
  }
}

function addReport(
  team: TeamState,
  state: MigrationMutableState,
  keys: ExistingKeys,
  report: Omit<TaskReport, 'id'>,
): { report: TaskReport; added: boolean } {
  const key = stableSerialize({
    taskId: report.taskId,
    type: report.type,
    author: report.author,
    text: report.text,
    createdAt: report.createdAt,
    threadId: report.threadId,
    mailboxMessageId: report.mailboxMessageId,
  })
  const existing = keys.reportByKey.get(key)
  if (existing) return { report: existing, added: false }
  const id = formatTaskReportId(state.nextTaskReportSeq)
  state.nextTaskReportSeq += 1
  const next = { id, ...report }
  team.taskReports[id] = next
  keys.reportKeys.add(key)
  keys.reportByKey.set(key, next)
  return { report: next, added: true }
}

function addEvent(team: TeamState, state: MigrationMutableState, keys: ExistingKeys, event: Omit<TaskEvent, 'id'>): TaskEvent | null {
  const key = stableSerialize({
    taskId: event.taskId,
    type: event.type,
    by: event.by,
    at: event.at,
    summary: event.summary,
    reportId: event.reportId,
    data: event.data,
  })
  if (keys.eventKeys.has(key)) return null
  const id = formatTaskEventId(state.nextTaskEventSeq)
  state.nextTaskEventSeq += 1
  const next = { id, ...event }
  team.taskEvents[id] = next
  keys.eventKeys.add(key)
  return next
}

function addMessageRef(team: TeamState, state: MigrationMutableState, keys: ExistingKeys, ref: Omit<TaskMessageRef, 'id'>): TaskMessageRef | null {
  if (keys.mailboxMessageIds.has(ref.mailboxMessageId)) return null
  const id = formatTaskMessageRefId(state.nextTaskMessageRefSeq)
  state.nextTaskMessageRefSeq += 1
  const next = { id, ...ref }
  team.taskMessageRefs[id] = next
  keys.mailboxMessageIds.add(ref.mailboxMessageId)
  return next
}

function migrateReportNote(
  team: TeamState,
  task: TeamTask,
  note: LegacyTaskNote,
  state: MigrationMutableState,
  keys: ExistingKeys,
): { reportAdded: boolean; eventAdded: boolean } {
  const metadata = meta(note)
  const type = reportType(note)
  const mailboxMessageId = communicationMailboxMessageId(note) ?? stringValue(metadata.mailboxMessageId)
  const text = noteText(note)
  const reportResult = addReport(team, state, keys, {
    taskId: task.id,
    type,
    author: noteAuthor(note),
    text,
    summary: stringValue(metadata.summary) ?? compactTaskHistorySummary(text),
    createdAt: noteAt(note),
    threadId: note.threadId,
    reportOnly: true,
    reporterIsOwner: booleanValue(metadata.reporterIsOwner) ?? noteAuthor(note) === task.owner,
    reportedBlockedBy: stringArrayValue(metadata.reportedBlockedBy),
    statusAtReport: statusAtReport(task, type),
    ownerAtReport: task.owner,
    mailboxMessageId,
    metadata: {
      source: 'legacy_task_note_migration',
      sourceKind: sourceKind(note),
      noteKey: noteKey(task.id, note, 'report'),
    },
  })
  const event = addEvent(team, state, keys, {
    taskId: task.id,
    type: 'report_submitted',
    by: noteAuthor(note),
    at: noteAt(note),
    summary: compactTaskHistorySummary(text),
    reportId: reportResult.report.id,
    data: {
      source: 'legacy_task_note',
      reportType: type,
    },
  })
  return { reportAdded: reportResult.added, eventAdded: Boolean(event) }
}

function migrateMessageRefNote(
  team: TeamState,
  task: TeamTask,
  note: LegacyTaskNote,
  state: MigrationMutableState,
  keys: ExistingKeys,
): boolean {
  const mailboxMessageId = communicationMailboxMessageId(note)
  if (!mailboxMessageId) return false
  const metadata = meta(note)
  const type = messageTypeValue(note.messageType) ?? messageTypeValue(metadata.messageType) ?? 'inform'
  const ref = addMessageRef(team, state, keys, {
    taskId: task.id,
    mailboxMessageId,
    from: stringValue(metadata.from) ?? noteAuthor(note),
    to: stringValue(metadata.to) ?? TEAM_LEAD,
    type,
    createdAt: noteAt(note),
    threadId: note.threadId,
    summary: stringValue(metadata.summary),
    priority: priorityValue(metadata.priority),
    wakeHint: wakeHintValue(metadata.wakeHint),
    diagnostic: Boolean(metadata.hidden ?? note.hidden),
    metadata: {
      source: sourceKind(note) === 'legacy_communication_ref' ? 'legacy_linked_message_note_migration' : 'communication_ref_note_migration',
      sourceKind: sourceKind(note),
      noteKey: noteKey(task.id, note, 'message_ref'),
    },
  })
  return Boolean(ref)
}

function migrateEventNote(
  team: TeamState,
  task: TeamTask,
  note: LegacyTaskNote,
  state: MigrationMutableState,
  keys: ExistingKeys,
): boolean {
  const metadata = meta(note)
  const ownerRemoved = ownerRemovedMember(note)
  const lifecycleType = ownerRemoved ? 'owner_removed' : taskEventTypeFromAction(metadata.action)
  const hidden = Boolean(note.hidden || metadata.hidden === true)
  const type: TaskEventType = lifecycleType ?? (hidden ? 'migrated' : 'progress')
  const data: Record<string, unknown> = {
    source: lifecycleType && lifecycleType !== 'progress' ? 'legacy_lifecycle_note' : 'legacy_note',
    sourceKind: sourceKind(note),
    noteKey: noteKey(task.id, note, 'event'),
  }
  if (ownerRemoved) data.memberName = ownerRemoved
  if (hidden) data.hidden = true
  if (metadata.action !== undefined) data.action = metadata.action
  if (metadata.owner !== undefined) data.owner = metadata.owner
  if (metadata.blockedBy !== undefined) data.blockedBy = metadata.blockedBy
  const text = noteText(note)
  const event = addEvent(team, state, keys, {
    taskId: task.id,
    type,
    by: noteAuthor(note),
    at: noteAt(note),
    summary: compactTaskHistorySummary(text),
    data,
  })
  return Boolean(event)
}

export function teamHasLegacyTaskNotes(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false
  const tasks = (input as { tasks?: unknown }).tasks
  if (!tasks || typeof tasks !== 'object' || Array.isArray(tasks)) return false
  return Object.values(tasks as Record<string, unknown>).some(task => {
    if (!task || typeof task !== 'object' || Array.isArray(task)) return false
    return Array.isArray((task as { notes?: unknown }).notes)
  })
}

export function migrateTaskNotesToHistory(input: unknown): TaskHistoryMigrationResult {
  const team = cloneLegacyTeamState(input)
  const state: MigrationMutableState = {
    nextTaskReportSeq: team.nextTaskReportSeq,
    nextTaskEventSeq: team.nextTaskEventSeq,
    nextTaskMessageRefSeq: team.nextTaskMessageRefSeq,
  }
  const keys = existingKeys(team as unknown as TeamState)
  let reportsAdded = 0
  let eventsAdded = 0
  let messageRefsAdded = 0
  let notesRemoved = 0

  for (const task of Object.values(team.tasks).sort((a, b) => a.id.localeCompare(b.id))) {
    const notes = Array.isArray(task.notes)
      ? [...task.notes].sort((a, b) => noteAt(a) - noteAt(b) || noteAuthor(a).localeCompare(noteAuthor(b)) || noteText(a).localeCompare(noteText(b)))
      : []
    notesRemoved += notes.length
    for (const note of notes) {
      if (isCommunicationRef(note)) {
        if (migrateMessageRefNote(team as unknown as TeamState, task, note, state, keys)) messageRefsAdded += 1
        continue
      }
      if (isReportNote(note)) {
        const migrated = migrateReportNote(team as unknown as TeamState, task, note, state, keys)
        if (migrated.reportAdded) reportsAdded += 1
        if (migrated.eventAdded) eventsAdded += 1
        continue
      }
      if (migrateEventNote(team as unknown as TeamState, task, note, state, keys)) eventsAdded += 1
    }
    delete task.notes
  }

  team.nextTaskReportSeq = state.nextTaskReportSeq
  team.nextTaskEventSeq = state.nextTaskEventSeq
  team.nextTaskMessageRefSeq = state.nextTaskMessageRefSeq
  return { team: normalizeTeamState(team as unknown as TeamState), reportsAdded, eventsAdded, messageRefsAdded, notesRemoved }
}
