import { TEAM_LEAD } from './types.js'
import type {
  TeamMessagePriority,
  TeamMessageType,
  TeamMessageWakeHint,
} from './types.js'

export function normalizeMessageType(type?: string): TeamMessageType {
  if (type === 'assignment') return 'assignment'
  if (type === 'question') return 'question'
  if (type === 'blocked') return 'blocked'
  if (type === 'completion_report') return 'completion_report'
  return 'fyi'
}

export function normalizeWakeHint(
  type: TeamMessageType,
  wakeHint?: TeamMessageWakeHint,
  recipient?: string,
): TeamMessageWakeHint {
  if (wakeHint) return wakeHint

  const toLeader = recipient === TEAM_LEAD

  if (type === 'assignment') return 'hard'
  if (type === 'question') return 'soft'
  if (type === 'blocked') return 'hard'
  if (type === 'completion_report') return toLeader ? 'hard' : 'soft'
  return 'none'
}

export function normalizePriority(priority?: TeamMessagePriority): TeamMessagePriority {
  return priority ?? 'normal'
}

export function defaultThreadIdForTask(taskId?: string): string | undefined {
  return taskId ? `task:${taskId}` : undefined
}

export function shouldWakeRecipient(
  wakeHint: TeamMessageWakeHint,
): boolean {
  return wakeHint === 'soft' || wakeHint === 'hard'
}

export function mailboxUrgencyRank(type: TeamMessageType, priority?: TeamMessagePriority): number {
  if (type === 'blocked') return 0
  if (type === 'question') return 1
  if (type === 'assignment') return 2
  if (type === 'completion_report') return 3
  if (priority === 'high') return 4
  if (priority === 'normal') return 5
  return 6
}
