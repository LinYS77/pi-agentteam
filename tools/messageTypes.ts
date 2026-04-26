import type { TeamMessagePriority, TeamMessageType, TeamState } from '../types.js'
import type { ToolHandlerDeps } from './shared.js'

export type TeamSendInput = {
  to: string
  message: string
  summary?: string
  type?: 'assignment' | 'question' | 'blocked' | 'completion_report' | 'fyi'
  taskId?: string
  priority?: TeamMessagePriority
  metadata?: Record<string, unknown>
}

export type TeamReceiveInput = {
  markRead?: boolean
  limit?: number
}

export type MessageDeliveryState = {
  team: TeamState
  deps: ToolHandlerDeps
  sender: string
  params: TeamSendInput
  messageType: TeamMessageType
  resolvedThreadId: string | undefined
  priority: TeamMessagePriority
  metadata?: Record<string, unknown>
  sent: string[]
  leaderMirrors: string[]
  wakeByRecipient: Array<{ recipient: string; wakeHint: string }>
  skippedRecipients: Array<{ recipient: string; reason: string }>
}

export type MessageDeliveryOptions = {
  mirrorOf?: string
}
