import type { TeamTask } from '../internalTypes.js'

export type TaskNonActionableReason = 'task_blocked_by_gate' | 'task_not_actionable'

export function isTaskBlockedByGate(task: Pick<TeamTask, 'status' | 'blockedBy'>): boolean {
  return task.status === 'blocked' || task.blockedBy.length > 0
}

export function taskAssignmentNonActionableReason(task: Pick<TeamTask, 'status' | 'blockedBy'>): TaskNonActionableReason | null {
  if (isTaskBlockedByGate(task)) return 'task_blocked_by_gate'
  if (task.status === 'done') return 'task_not_actionable'
  return null
}

export function isTaskActionableForWorkerDelivery(task: Pick<TeamTask, 'status' | 'blockedBy'>): boolean {
  return taskAssignmentNonActionableReason(task) === null
}
