import { decideMessagePolicy } from './core/messagePolicy.js'
import { isMessageType, isTaskReportType } from './core/publicModel.js'
import type { MessageType, TaskReportType } from './core/publicModel.js'
import { TEAM_LEAD } from './internalTypes.js'
import type {
  TeamMessagePriority,
  TeamMessageType,
  TeamMessageWakeHint,
} from './internalTypes.js'

export function parsePersistedMessageType(type: unknown): TeamMessageType | null {
  if (isMessageType(type)) return type as MessageType
  if (isTaskReportType(type)) return type as TaskReportType
  return null
}

export function displayMessageType(type?: string): TeamMessageType {
  return parsePersistedMessageType(type) ?? 'inform'
}

export function normalizeMessageType(type?: string): TeamMessageType {
  return displayMessageType(type)
}

export function normalizeWakeHint(
  type: TeamMessageType,
  wakeHint?: TeamMessageWakeHint,
  recipient?: string,
): TeamMessageWakeHint {
  if (wakeHint) return wakeHint

  const recipientKind = recipient === TEAM_LEAD ? 'leader' : recipient ? 'worker' : 'unknown'
  if (isTaskReportType(type)) {
    return decideMessagePolicy({ kind: 'task_report', reportType: type, recipientKind: 'leader' }).wakeHint
  }
  if (isMessageType(type)) {
    return decideMessagePolicy({ kind: 'message', messageType: type, recipientKind }).wakeHint
  }
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
  if (type === 'report_blocked') return 0
  if (type === 'question') return 1
  if (type === 'assignment') return 2
  if (type === 'report_done') return 3
  if (type === 'inform') return priority === 'high' ? 4 : priority === 'normal' ? 5 : 6
  if (priority === 'high') return 4
  if (priority === 'normal') return 5
  return 6
}
