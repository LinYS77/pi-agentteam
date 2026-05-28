import { createTask as createCoreTask } from '../core/taskReducer.js'
import { isCommunicationReferenceNote } from './taskNotes.js'
import type {
  TeamEvent,
  TeamMessageType,
  TeamState,
  TeamTask,
  TeamTaskNote,
} from '../internalTypes.js'

// ---------------------------------------------------------------------------
// In-memory mutations for tasks, task notes, and bounded team event history.
// Callers remain responsible for persisting the containing TeamState.
// ---------------------------------------------------------------------------

export function createTask(
  state: TeamState,
  input: { title: string; description: string; owner?: string },
): TeamTask {
  const now = Date.now()
  const id = `T${String(state.nextTaskSeq).padStart(3, '0')}`
  state.nextTaskSeq += 1
  const coreTask = createCoreTask({
    id,
    title: input.title,
    description: input.description,
    owner: input.owner,
    createdAt: now,
  })
  const task: TeamTask = {
    ...coreTask,
    description: coreTask.description ?? '',
    blockedBy: [],
    notes: [],
  }
  state.tasks[id] = task
  return task
}

export function appendTaskNote(
  task: TeamTask,
  author: string,
  text: string,
  extra?: {
    threadId?: string
    messageType?: TeamMessageType
    requestId?: string
    linkedMessageId?: string
    metadata?: Record<string, unknown>
    hidden?: boolean
  },
): TeamTaskNote {
  const note: TeamTaskNote = {
    at: Date.now(),
    author,
    text,
    threadId: extra?.threadId,
    messageType: extra?.messageType,
    requestId: extra?.requestId,
    linkedMessageId: extra?.linkedMessageId,
    metadata: extra?.metadata,
    hidden: extra?.hidden,
  }
  task.notes.push(note)
  if (!isCommunicationReferenceNote(note)) task.updatedAt = note.at
  return note
}

const TEAM_EVENT_LIMIT = 300

export function appendTeamEvent(
  team: TeamState,
  input: {
    id?: string
    at?: number
    type: string
    by: string
    text: string
    metadata?: Record<string, unknown>
  },
): TeamEvent {
  const existing = input.id ? team.events?.find(event => event.id === input.id) : undefined
  if (existing) return existing
  const event: TeamEvent = {
    id: input.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: input.at ?? Date.now(),
    type: input.type,
    by: input.by,
    text: input.text,
    metadata: input.metadata,
  }
  const next = [...(team.events ?? []), event]
  team.events = next.length > TEAM_EVENT_LIMIT ? next.slice(next.length - TEAM_EVENT_LIMIT) : next
  return event
}
