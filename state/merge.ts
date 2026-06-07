import type {
  PlanRun,
  PlanRunEvent,
  TaskEvent,
  TaskMessageRef,
  TaskReport,
  TeamEvent,
  TeamState,
  TeamTask,
} from '../internalTypes.js'
import { TEAM_LEAD } from '../internalTypes.js'

// ---------------------------------------------------------------------------
// Merge policy for concurrent/stale team-state writers.
// ---------------------------------------------------------------------------

function nextSeq(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : 1
}

function recordValue<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, T>) }
    : {}
}

function stripLegacyTaskNotes<T extends Record<string, unknown>>(task: T): Omit<T, 'notes'> {
  const { notes: _notes, ...rest } = task
  return rest
}

export function normalizeTeamState(state: TeamState): TeamState {
  const rawTasks = recordValue<TeamTask & { notes?: unknown }>((state as TeamState & { tasks?: unknown }).tasks)
  const tasks = Object.fromEntries(
    Object.entries(rawTasks).map(([taskId, task]) => [taskId, stripLegacyTaskNotes(task) as TeamTask]),
  )
  return {
    ...state,
    tasks,
    revision: Number.isFinite(state.revision) ? Number(state.revision) : 0,
    memberTombstones: { ...(state.memberTombstones ?? {}) },
    events: [...(state.events ?? [])],
    taskReports: recordValue<TaskReport>(state.taskReports),
    taskEvents: recordValue<TaskEvent>(state.taskEvents),
    taskMessageRefs: recordValue<TaskMessageRef>(state.taskMessageRefs),
    planRuns: recordValue<PlanRun>(state.planRuns),
    planRunEvents: recordValue<PlanRunEvent>(state.planRunEvents),
    activePlanRunId: typeof state.activePlanRunId === 'string' ? state.activePlanRunId : undefined,
    nextTaskSeq: nextSeq(state.nextTaskSeq),
    nextTaskReportSeq: nextSeq(state.nextTaskReportSeq),
    nextTaskEventSeq: nextSeq(state.nextTaskEventSeq),
    nextTaskMessageRefSeq: nextSeq(state.nextTaskMessageRefSeq),
    nextPlanRunSeq: nextSeq(state.nextPlanRunSeq),
    nextPlanRunEventSeq: nextSeq(state.nextPlanRunEventSeq),
  }
}

function pickLatestEntity<T extends { updatedAt: number }>(
  current: T | undefined,
  incoming: T | undefined,
  options?: {
    currentRevision?: number
    incomingRevision?: number
  },
): T | undefined {
  if (!current) return incoming
  if (!incoming) return current
  if (incoming.updatedAt > current.updatedAt) return incoming
  if (current.updatedAt > incoming.updatedAt) return current

  const currentRevision = options?.currentRevision ?? 0
  const incomingRevision = options?.incomingRevision ?? 0
  if (incomingRevision > currentRevision) return incoming
  if (currentRevision > incomingRevision) return current

  return incoming
}

export function mergeTeamEvents(currentEvents: TeamEvent[], incomingEvents: TeamEvent[]): TeamEvent[] {
  const byId = new Map<string, TeamEvent>()
  for (const event of [...currentEvents, ...incomingEvents]) {
    const existing = byId.get(event.id)
    if (!existing || event.at >= existing.at) {
      byId.set(event.id, event)
    }
  }
  return [...byId.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}

function taskHistoryItemTime(item: { at?: number; createdAt?: number; updatedAt?: number }): number {
  return item.updatedAt ?? item.createdAt ?? item.at ?? 0
}

function mergeTaskHistoryRecord<T extends { id: string; at?: number; createdAt?: number; updatedAt?: number }>(
  currentItems: Record<string, T>,
  incomingItems: Record<string, T>,
): Record<string, T> {
  const byId = new Map<string, T>()
  for (const item of [...Object.values(currentItems), ...Object.values(incomingItems)]) {
    const existing = byId.get(item.id)
    if (!existing || taskHistoryItemTime(item) >= taskHistoryItemTime(existing)) byId.set(item.id, item)
  }
  return Object.fromEntries([...byId.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function mergeTaskMessageRefs(
  currentItems: Record<string, TaskMessageRef>,
  incomingItems: Record<string, TaskMessageRef>,
): Record<string, TaskMessageRef> {
  const byId = new Map<string, TaskMessageRef>()
  const mailboxIdToId = new Map<string, string>()
  for (const item of [...Object.values(currentItems), ...Object.values(incomingItems)]) {
    const duplicateId = mailboxIdToId.get(item.mailboxMessageId)
    const existing = duplicateId ? byId.get(duplicateId) : byId.get(item.id)
    if (!existing) {
      byId.set(item.id, item)
      mailboxIdToId.set(item.mailboxMessageId, item.id)
      continue
    }
    const chosen = item.createdAt >= existing.createdAt ? item : existing
    const chosenId = chosen.id
    byId.delete(existing.id)
    byId.set(chosenId, chosen)
    mailboxIdToId.set(chosen.mailboxMessageId, chosenId)
  }
  return Object.fromEntries([...byId.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

export function mergeTeamStates(current: TeamState, incoming: TeamState): TeamState {
  const currentState = normalizeTeamState(current)
  const incomingState = normalizeTeamState(incoming)

  const tombstones: Record<string, number> = { ...(currentState.memberTombstones ?? {}) }
  for (const [name, at] of Object.entries(incomingState.memberTombstones ?? {})) {
    const existing = tombstones[name]
    if (existing === undefined || at > existing) {
      tombstones[name] = at
    }
  }

  const members: TeamState['members'] = {}
  const memberNames = new Set([
    ...Object.keys(currentState.members),
    ...Object.keys(incomingState.members),
  ])
  for (const name of memberNames) {
    const chosen = pickLatestEntity(currentState.members[name], incomingState.members[name], {
      currentRevision: currentState.revision,
      incomingRevision: incomingState.revision,
    })
    if (!chosen) continue
    const removedAt = tombstones[name]
    if (removedAt !== undefined && chosen.updatedAt <= removedAt) continue
    members[name] = chosen
  }

  const tasks: TeamState['tasks'] = {}
  const taskIds = new Set([
    ...Object.keys(currentState.tasks),
    ...Object.keys(incomingState.tasks),
  ])
  for (const taskId of taskIds) {
    const chosen = pickLatestEntity(
      currentState.tasks[taskId],
      incomingState.tasks[taskId],
      {
        currentRevision: currentState.revision,
        incomingRevision: incomingState.revision,
      },
    )
    if (chosen) tasks[taskId] = chosen
  }

  const merged: TeamState = {
    ...currentState,
    ...incomingState,
    name: incomingState.name,
    description: incomingState.description ?? currentState.description,
    createdAt: Math.min(currentState.createdAt, incomingState.createdAt),
    leaderSessionFile: incomingState.leaderSessionFile ?? currentState.leaderSessionFile,
    leaderCwd: incomingState.leaderCwd || currentState.leaderCwd,
    members,
    tasks,
    events: mergeTeamEvents(currentState.events ?? [], incomingState.events ?? []),
    taskReports: mergeTaskHistoryRecord(currentState.taskReports, incomingState.taskReports),
    taskEvents: mergeTaskHistoryRecord(currentState.taskEvents, incomingState.taskEvents),
    taskMessageRefs: mergeTaskMessageRefs(currentState.taskMessageRefs, incomingState.taskMessageRefs),
    planRuns: mergeTaskHistoryRecord(currentState.planRuns ?? {}, incomingState.planRuns ?? {}),
    planRunEvents: mergeTaskHistoryRecord(currentState.planRunEvents ?? {}, incomingState.planRunEvents ?? {}),
    activePlanRunId: incomingState.activePlanRunId ?? currentState.activePlanRunId,
    nextTaskSeq: Math.max(currentState.nextTaskSeq, incomingState.nextTaskSeq),
    nextTaskReportSeq: Math.max(currentState.nextTaskReportSeq, incomingState.nextTaskReportSeq),
    nextTaskEventSeq: Math.max(currentState.nextTaskEventSeq, incomingState.nextTaskEventSeq),
    nextTaskMessageRefSeq: Math.max(currentState.nextTaskMessageRefSeq, incomingState.nextTaskMessageRefSeq),
    nextPlanRunSeq: Math.max(currentState.nextPlanRunSeq ?? 1, incomingState.nextPlanRunSeq ?? 1),
    nextPlanRunEventSeq: Math.max(currentState.nextPlanRunEventSeq ?? 1, incomingState.nextPlanRunEventSeq ?? 1),
    revision: Math.max(currentState.revision ?? 0, incomingState.revision ?? 0) + 1,
    memberTombstones: tombstones,
  }

  delete merged.memberTombstones?.[TEAM_LEAD]

  if (!merged.members[TEAM_LEAD]) {
    merged.members[TEAM_LEAD] = {
      name: TEAM_LEAD,
      role: 'leader',
      cwd: merged.leaderCwd,
      sessionFile: merged.leaderSessionFile ?? '',
      status: 'idle',
      createdAt: merged.createdAt,
      updatedAt: Date.now(),
    }
  }

  return merged
}
