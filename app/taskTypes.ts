import type { TaskStatus } from '../core/publicModel.js'
import type { TeamTaskAction } from '../core/taskActions.js'
import type { TeamMessageType, TeamMessageWakeHint, TeamState, TeamTask } from '../internalTypes.js'
import type { TaskApplicationDeps } from './types.js'

export type { TeamTaskAction } from '../core/taskActions.js'

export type TeamTaskInput = {
  action: TeamTaskAction
  taskId?: string
  reportId?: string
  title?: string
  description?: string
  owner?: string
  note?: string
  blockedBy?: string[]
  limit?: number
  all?: boolean
  includeMessages?: boolean
} & {
  status?: TaskStatus
}

export type LeaderWakeRequest = {
  type: TeamMessageType
  wakeHint: TeamMessageWakeHint
  from: string
  summary: string
  text: string
  messageId?: string
  taskId?: string
  threadId?: string
}

export type TaskCommandContext = {
  team: TeamState
  teamName: string
  actor: string
  deps: TaskApplicationDeps
}

export type TaskDirectedMailboxEffect = {
  recipient: string
  message: {
    from: string
    to: string
    text: string
    summary?: string
    type?: TeamMessageType
    taskId?: string
    threadId?: string
    priority?: 'low' | 'normal' | 'high'
    wakeHint?: TeamMessageWakeHint
    metadata?: Record<string, unknown>
  }
}

export type TaskLeaderMailboxEffect = Omit<TaskDirectedMailboxEffect, 'recipient'>

export type TaskSideEffectWarning = {
  kind: string
  error?: string
  recipient?: string
  memberName?: string
  effectId?: string
  outboxStatus?: 'pending' | 'failed'
  outboxKind?: string
}

export type TaskCommandResult = {
  task?: TeamTask
  text: string
  details: Record<string, unknown>
  sideEffectWarnings?: TaskSideEffectWarning[]
  leaderWake?: LeaderWakeRequest
  wakeTeam?: TeamState
  leaderMailbox?: TaskLeaderMailboxEffect
  ownerNudge?: TaskDirectedMailboxEffect
}

export type TaskApplicationContext = {
  team: TeamState
  actor: string
}

export type TaskApplicationInput = {
  params: TeamTaskInput
  context: TaskApplicationContext
}

export type TaskApplicationResult = {
  text: string
  details: Record<string, unknown>
  sideEffectWarnings?: TaskSideEffectWarning[]
  statusInvalidationRequested?: boolean
}
