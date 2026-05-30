import {
  COMMUNICATION_REF_DISPLAY_MODE,
  COMMUNICATION_REF_METADATA_KIND,
  COMMUNICATION_REF_SOURCE_KIND,
  COMMUNICATION_REF_TEXT,
  LEGACY_COMMUNICATION_REF_DISPLAY_MODE,
  LEGACY_COMMUNICATION_REF_SOURCE_KIND,
  PRIMARY_NOTE_DISPLAY_MODE,
  TASK_NOTE_DISPLAY_MODES,
  TASK_NOTE_METADATA_VERSION,
  TASK_NOTE_SOURCE_KINDS,
  communicationRefMetadata,
  inferTaskNoteDisplayMode,
  inferTaskNoteSourceKind,
  isCommunicationReferenceNote,
  taskLocalNoteMetadata,
  taskNoteLinkedIds,
  taskNoteMetadata,
  taskReportNoteMetadata,
  type TaskNoteDisplayMode,
  type TaskNoteSourceKind,
} from '../core/taskNoteModel.js'
import type { TeamMessageType, TeamTask, TeamTaskNote } from '../internalTypes.js'

export {
  COMMUNICATION_REF_DISPLAY_MODE,
  COMMUNICATION_REF_METADATA_KIND,
  COMMUNICATION_REF_SOURCE_KIND,
  COMMUNICATION_REF_TEXT,
  LEGACY_COMMUNICATION_REF_DISPLAY_MODE,
  LEGACY_COMMUNICATION_REF_SOURCE_KIND,
  PRIMARY_NOTE_DISPLAY_MODE,
  TASK_NOTE_DISPLAY_MODES,
  TASK_NOTE_METADATA_VERSION,
  TASK_NOTE_SOURCE_KINDS,
  communicationRefMetadata,
  inferTaskNoteDisplayMode,
  inferTaskNoteSourceKind,
  isCommunicationReferenceNote,
  taskLocalNoteMetadata,
  taskNoteLinkedIds,
  taskNoteMetadata,
  taskReportNoteMetadata,
  type TaskNoteDisplayMode,
  type TaskNoteSourceKind,
} from '../core/taskNoteModel.js'

// Metadata sourceKind/displayMode/linkedIds conventions are implemented in
// core/taskNoteModel.ts and re-exported here for existing state imports.
function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function visibleTaskNotes(task: Pick<TeamTask, 'notes'>): TeamTaskNote[] {
  return task.notes.filter(note => inferTaskNoteDisplayMode(note) === PRIMARY_NOTE_DISPLAY_MODE)
}

export function latestVisibleTaskNote(task: Pick<TeamTask, 'notes'>): TeamTaskNote | undefined {
  return visibleTaskNotes(task).at(-1)
}

export function appendCommunicationRefNote(
  task: TeamTask,
  input: {
    author: string
    linkedMessageId: string
    threadId?: string
    messageType?: TeamMessageType
    metadata?: Record<string, unknown>
    at?: number
  },
): TeamTaskNote {
  const inputMetadata = (input.metadata ?? {}) as Record<string, unknown>
  const note: TeamTaskNote = {
    at: input.at ?? Date.now(),
    author: input.author,
    text: COMMUNICATION_REF_TEXT,
    threadId: input.threadId,
    messageType: input.messageType,
    linkedMessageId: input.linkedMessageId,
    metadata: communicationRefMetadata({
      linkedMessageId: input.linkedMessageId,
      source: stringOrUndefined(inputMetadata.source),
      from: stringOrUndefined(inputMetadata.from),
      to: stringOrUndefined(inputMetadata.to),
      taskId: stringOrUndefined(inputMetadata.taskId),
      threadId: input.threadId ?? stringOrUndefined(inputMetadata.threadId),
      messageType: input.messageType,
      mirrorOf: stringOrUndefined(inputMetadata.mirrorOf),
      extra: inputMetadata,
    }),
    hidden: true,
  }
  task.notes.push(note)
  return note
}
