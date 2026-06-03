import { createTask as createCoreTask } from '../core/taskReducer.js'
import type {
  TeamEvent,
  TeamState,
  TeamTask,
} from '../internalTypes.js'

// ---------------------------------------------------------------------------
// In-memory mutations for tasks and bounded team event history.
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
  }
  state.tasks[id] = task
  return task
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
