import type { TeamMessageType, TeamMessageWakeHint, TeamState, TeamTask } from '../types.js'
import type { ToolHandlerDeps } from './shared.js'

export type TeamTaskAction = 'create' | 'list' | 'claim' | 'update' | 'complete' | 'note'

export type TeamTaskInput = {
  action: TeamTaskAction
  taskId?: string
  title?: string
  description?: string
  owner?: string
  status?: 'pending' | 'in_progress' | 'blocked' | 'completed'
  note?: string
  blockedBy?: string[]
}

export type LeaderWakeRequest = {
  type: TeamMessageType
  wakeHint: TeamMessageWakeHint
  from: string
  summary: string
  text: string
}

export type TaskCommandContext = {
  team: TeamState
  teamName: string
  actor: string
  deps: ToolHandlerDeps
}

export type TaskCommandResult = {
  task?: TeamTask
  text: string
  details: Record<string, unknown>
  wakeWorkerName?: string
  leaderWake?: LeaderWakeRequest
  wakeTeam?: TeamState
}
