import type { MessageType, TaskReportType } from './publicModel.js'

const TASK_NOTE_METADATA_VERSION = 1

const TASK_NOTE_SOURCE_KINDS = Object.freeze([
  'task_note',
  'task_report',
  'communication_ref',
  'legacy_communication_ref',
] as const)
export type TaskNoteSourceKind = typeof TASK_NOTE_SOURCE_KINDS[number]

const TASK_NOTE_DISPLAY_MODES = Object.freeze(['visible', 'hidden', 'folded'] as const)
export type TaskNoteDisplayMode = typeof TASK_NOTE_DISPLAY_MODES[number]

export type TaskNoteMessageType = MessageType | TaskReportType

export type TaskNoteMetadata = Record<string, unknown> & {
  metadataVersion?: number
  sourceKind?: TaskNoteSourceKind
  displayMode?: TaskNoteDisplayMode
  linkedIds?: Record<string, string>
}

export type TaskNoteModel = {
  at: number
  author: string
  text: string
  threadId?: string
  messageType?: TaskNoteMessageType
  requestId?: string
  linkedMessageId?: string
  metadata?: TaskNoteMetadata
  hidden?: boolean
}

export const COMMUNICATION_REF_METADATA_KIND = 'communication_ref'
export const COMMUNICATION_REF_SOURCE_KIND = 'communication_ref' satisfies TaskNoteSourceKind
export const LEGACY_COMMUNICATION_REF_SOURCE_KIND = 'legacy_communication_ref' satisfies TaskNoteSourceKind
export const COMMUNICATION_REF_DISPLAY_MODE = 'hidden' satisfies TaskNoteDisplayMode
export const LEGACY_COMMUNICATION_REF_DISPLAY_MODE = 'folded' satisfies TaskNoteDisplayMode
export const PRIMARY_NOTE_DISPLAY_MODE = 'visible' satisfies TaskNoteDisplayMode
export const COMMUNICATION_REF_TEXT = '[communication ref]'

function isExactString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOneOf<const Values extends readonly string[]>(values: Values, value: unknown): value is Values[number] {
  return isExactString(value) && (values as readonly string[]).includes(value)
}

type CommunicationRefMetadata = TaskNoteMetadata & {
  kind?: unknown
  hidden?: unknown
  source?: unknown
  linkedMailboxMessageId?: unknown
  taskId?: unknown
  threadId?: unknown
  mirrorOf?: unknown
}

function metadata(note: TaskNoteModel): CommunicationRefMetadata {
  return (note.metadata ?? {}) as CommunicationRefMetadata
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

export { TASK_NOTE_METADATA_VERSION, TASK_NOTE_SOURCE_KINDS, TASK_NOTE_DISPLAY_MODES }

export function isTaskNoteSourceKind(value: unknown): value is TaskNoteSourceKind {
  return isOneOf(TASK_NOTE_SOURCE_KINDS, value)
}

export function isTaskNoteDisplayMode(value: unknown): value is TaskNoteDisplayMode {
  return isOneOf(TASK_NOTE_DISPLAY_MODES, value)
}

export function taskNoteMetadata(input: {
  sourceKind: TaskNoteSourceKind
  displayMode?: TaskNoteDisplayMode
  linkedIds?: Record<string, string | undefined>
  extra?: Record<string, unknown>
}): TaskNoteMetadata {
  const linkedIds: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.linkedIds ?? {})) {
    if (typeof value === 'string' && value.trim()) linkedIds[key] = value
  }
  return {
    ...(input.extra ?? {}),
    metadataVersion: TASK_NOTE_METADATA_VERSION,
    sourceKind: input.sourceKind,
    displayMode: input.displayMode ?? PRIMARY_NOTE_DISPLAY_MODE,
    ...(Object.keys(linkedIds).length > 0 ? { linkedIds } : {}),
  }
}

export function taskLocalNoteMetadata(extra?: Record<string, unknown>): TaskNoteMetadata {
  return taskNoteMetadata({
    sourceKind: 'task_note',
    displayMode: PRIMARY_NOTE_DISPLAY_MODE,
    extra,
  })
}

export function taskReportNoteMetadata(extra?: Record<string, unknown>): TaskNoteMetadata {
  return taskNoteMetadata({
    sourceKind: 'task_report',
    displayMode: PRIMARY_NOTE_DISPLAY_MODE,
    extra,
  })
}

export function communicationRefMetadata(input: {
  linkedMessageId: string
  source?: string
  from?: string
  to?: string
  taskId?: string
  threadId?: string
  messageType?: TaskNoteMessageType
  mirrorOf?: string
  extra?: Record<string, unknown>
}): TaskNoteMetadata {
  return taskNoteMetadata({
    sourceKind: COMMUNICATION_REF_SOURCE_KIND,
    displayMode: COMMUNICATION_REF_DISPLAY_MODE,
    linkedIds: {
      mailboxMessageId: input.linkedMessageId,
      taskId: input.taskId,
      threadId: input.threadId,
      mirrorOf: input.mirrorOf,
    },
    extra: {
      ...(input.extra ?? {}),
      kind: COMMUNICATION_REF_METADATA_KIND,
      hidden: true,
      source: input.source ?? 'agentteam_send',
      from: input.from,
      to: input.to,
      taskId: input.taskId,
      threadId: input.threadId,
      messageType: input.messageType,
      linkedMailboxMessageId: input.linkedMessageId,
      ...(input.mirrorOf ? { mirrorOf: input.mirrorOf } : {}),
    },
  })
}

export function inferTaskNoteSourceKind(note: TaskNoteModel): TaskNoteSourceKind {
  const meta = metadata(note)
  if (meta.sourceKind === COMMUNICATION_REF_SOURCE_KIND) return COMMUNICATION_REF_SOURCE_KIND
  if (meta.sourceKind === LEGACY_COMMUNICATION_REF_SOURCE_KIND) return LEGACY_COMMUNICATION_REF_SOURCE_KIND
  if (meta.kind === COMMUNICATION_REF_METADATA_KIND) return COMMUNICATION_REF_SOURCE_KIND
  if (meta.hidden === true && (meta.source === 'agentteam_send' || typeof meta.linkedMailboxMessageId === 'string')) return COMMUNICATION_REF_SOURCE_KIND
  if (typeof note.text === 'string' && note.text.startsWith('Linked message:')) return LEGACY_COMMUNICATION_REF_SOURCE_KIND
  if (note.messageType === 'report_done' || note.messageType === 'report_blocked' || meta.reportOnly === true) return 'task_report'
  return 'task_note'
}

export function inferTaskNoteDisplayMode(note: TaskNoteModel): TaskNoteDisplayMode {
  const meta = metadata(note)
  if (meta.displayMode === COMMUNICATION_REF_DISPLAY_MODE) return COMMUNICATION_REF_DISPLAY_MODE
  if (meta.displayMode === LEGACY_COMMUNICATION_REF_DISPLAY_MODE) return LEGACY_COMMUNICATION_REF_DISPLAY_MODE
  const sourceKind = inferTaskNoteSourceKind(note)
  if (sourceKind === COMMUNICATION_REF_SOURCE_KIND) return COMMUNICATION_REF_DISPLAY_MODE
  if (sourceKind === LEGACY_COMMUNICATION_REF_SOURCE_KIND) return LEGACY_COMMUNICATION_REF_DISPLAY_MODE
  return PRIMARY_NOTE_DISPLAY_MODE
}

export function taskNoteLinkedIds(note: TaskNoteModel): Record<string, string> {
  const meta = metadata(note)
  const linkedIds: Record<string, string> = {}
  if (isObjectRecord(meta.linkedIds)) {
    for (const [key, value] of Object.entries(meta.linkedIds)) {
      const stringValue = stringOrUndefined(value)
      if (stringValue) linkedIds[key] = stringValue
    }
  }
  const linkedMessageId = stringOrUndefined(note.linkedMessageId) ?? stringOrUndefined(meta.linkedMailboxMessageId)
  if (linkedMessageId) linkedIds.mailboxMessageId = linkedMessageId
  const taskId = stringOrUndefined(meta.taskId)
  if (taskId) linkedIds.taskId = taskId
  const threadId = stringOrUndefined(note.threadId) ?? stringOrUndefined(meta.threadId)
  if (threadId) linkedIds.threadId = threadId
  const mirrorOf = stringOrUndefined(meta.mirrorOf)
  if (mirrorOf) linkedIds.mirrorOf = mirrorOf
  return linkedIds
}

export function isCommunicationReferenceNote(note: TaskNoteModel): boolean {
  const sourceKind = inferTaskNoteSourceKind(note)
  return sourceKind === COMMUNICATION_REF_SOURCE_KIND || sourceKind === LEGACY_COMMUNICATION_REF_SOURCE_KIND
}
