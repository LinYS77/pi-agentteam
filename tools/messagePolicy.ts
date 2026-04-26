import { TEAM_LEAD } from '../types.js'
import type { TeamMessageType } from '../types.js'
import { isLeader } from '../utils.js'

export function canSendMessageType(actor: string, type: TeamMessageType): boolean {
  if (isLeader(actor)) return true
  // Workers can report status and ask questions; only leader can assign.
  if (type === 'assignment') return false
  return true
}

export function enforcePlannerSendPolicy(input: {
  senderRole: string
  messageType: TeamMessageType
  taskId?: string
}): string | null {
  if (input.senderRole !== 'planner') return null

  if (input.messageType === 'completion_report' && !input.taskId) {
    return 'Planner completion_report requires taskId so leader can audit the planning artifact in agentteam_task.'
  }

  return null
}

export function shouldMirrorMessageToLeader(input: {
  sender: string
  sentRecipients: string[]
  messageType: TeamMessageType
  leaderExists: boolean
}): boolean {
  return (
    input.sender !== TEAM_LEAD &&
    input.leaderExists &&
    !input.sentRecipients.includes(TEAM_LEAD) &&
    (input.messageType === 'completion_report' || input.messageType === 'blocked')
  )
}
