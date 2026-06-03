import { transitionTask, type TaskState as ReducerTaskState } from '../core/taskReducer.js'
import type { TaskReportStatusAtReport, TeamState, TeamTask } from '../internalTypes.js'
import type { TaskApplicationDeps } from './types.js'
import type { TaskCommandContext, TaskCommandResult, TeamTaskInput } from './taskTypes.js'

export function requireUpdatedTeam(team: TeamState | null, teamName: string): TeamState {
  if (!team) throw new Error(`Team ${teamName} no longer exists`)
  return team
}

export function requireTask(team: TeamState, taskId: string): TeamTask {
  const task = team.tasks[taskId]
  if (!task) throw new Error(`Task ${taskId} not found`)
  return task
}

export function reducerTaskSnapshot(task: TeamTask): ReducerTaskState {
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

function applyReducerTask(task: TeamTask, reducerTask: ReducerTaskState): void {
  task.status = reducerTask.status
  task.owner = reducerTask.owner
  task.updatedAt = reducerTask.updatedAt
}

export function applyReducerTransition(
  task: TeamTask,
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

export function taskTransitionFailure(task: TeamTask, action: Parameters<typeof transitionTask>[1]['type'], reason: string): TaskCommandResult {
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

export function resolveTaskOwner(
  input: TaskCommandContext,
  team: TeamState,
  ownerName: string | undefined,
  fallbackOwner?: string,
): string {
  const owner = ownerName !== undefined ? input.deps.normalizeOwnerName(ownerName) : fallbackOwner
  if (!owner) throw new Error('owner cannot be empty')
  input.deps.assertValidOwner(team, owner)
  return owner
}

function invalidTaskStatus(task: TeamTask, action: string, expected: string): TaskCommandResult {
  return {
    task,
    text: `Cannot ${action} ${task.id}: expected ${expected}, got ${task.status}.`,
    details: { task, denied: true, reason: 'invalid_task_status', action, taskId: task.id, status: task.status, expected },
  }
}

export function noteText(params: TeamTaskInput, fallback: string): string {
  return params.note?.trim() || fallback
}

export function taskStatusAtReport(task: TeamTask): TaskReportStatusAtReport {
  return task.status === 'blocked' ? 'blocked' : 'open'
}

export function appendTaskEventHistory(
  input: TaskCommandContext,
  event: Parameters<TaskApplicationDeps['taskMutations']['appendTaskEvent']>[1],
): void {
  input.deps.taskMutations.appendTaskEvent(input.team, event)
}

export function appendTaskReportHistory(
  input: TaskCommandContext,
  report: Parameters<TaskApplicationDeps['taskMutations']['appendTaskReport']>[1],
) {
  return input.deps.taskMutations.appendTaskReport(input.team, report)
}

export function unsupportedStatusParam(params: TeamTaskInput, action: string): TaskCommandResult | null {
  if (params.status === undefined) return null
  return {
    text: `Action ${action} does not accept status; use assign/block/unblock/close/report actions instead.`,
    details: { denied: true, reason: 'status_param_unsupported', action, status: params.status },
  }
}

export function unsupportedBlockedByParam(params: TeamTaskInput, action: string): TaskCommandResult | null {
  if (!params.blockedBy || params.blockedBy.length === 0) return null
  return {
    text: `Action ${action} does not accept blockedBy; use action=block or action=report_blocked instead.`,
    details: { denied: true, reason: 'blocked_by_param_unsupported', action, blockedBy: params.blockedBy },
  }
}
