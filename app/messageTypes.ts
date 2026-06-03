import type { MessagePolicyIntent } from '../core/messagePolicy.js'
import type { MessageType, TaskReportType } from '../core/publicModel.js'
import type { MailboxMessage, TeamMessagePriority, TeamMessageWakeHint, TeamState } from '../internalTypes.js'
import type { OutboxRunResult } from './effectRunner.js'

export type MessageAttentionPolicy = import('../core/messagePolicy.js').MessagePolicyDecision
export type SendMessageType = MessageType

export type SendMessageApplicationContext = {
  team: TeamState
  actor: string
}

export type SendMessageApplicationInput = {
  params: SendMessageInput
  context: SendMessageApplicationContext
}

export type SendMessageInput = {
  to?: string
  message: string
  summary?: string
  type?: 'assignment' | 'question' | 'inform'
  taskId?: string
  priority?: TeamMessagePriority
  metadata?: Record<string, unknown>
}

export type MessageRoutingMode = 'explicit' | 'broadcast' | 'task_owner' | 'owner_to_leader'

export type MessageRoutingDetails = {
  mode: MessageRoutingMode
  reason: string
  explicitTo?: string
  resolvedRecipient?: string
  taskId?: string
  taskOwner?: string
}

export type MessageRoutingErrorReason =
  | 'missing_recipient'
  | 'explicit_recipient_empty'
  | 'explicit_recipient_not_found'
  | 'task_not_found'
  | 'task_owner_missing'
  | 'task_owner_member_not_found'
  | 'task_owner_is_leader'
  | 'task_sender_not_owner'
  | 'leader_member_not_found'

export type MessageRoutingErrorDetails = {
  denied: true
  reason: MessageRoutingErrorReason
  sender: string
  taskId?: string
  taskOwner?: string
}

export type MessageRoutingResult =
  | {
      ok: true
      recipients: string[]
      routing: MessageRoutingDetails
    }
  | {
      ok: false
      text: string
      details: MessageRoutingErrorDetails
    }

export type SendMessageWakeDetail = {
  recipient: string
  wakeHint: TeamMessageWakeHint
  attempted?: boolean
  ok?: boolean
  reason?: string
  error?: string
  requestId?: string
  method?: 'bridge' | 'bridge_requested' | 'projection_requested' | 'leader_attention_requested' | 'failed'
  policyIntent?: MessagePolicyIntent
  policyReason?: string
}

export type MessageSideEffectWarning = {
  kind: string
  error?: string
  recipient?: string
  memberName?: string
  effectId?: string
  outboxStatus?: 'pending' | 'failed'
  outboxKind?: string
}

export type MessageOutboxRecord = {
  effectId: string
  kind: string
  status: 'pending' | 'done' | 'failed'
  idempotencyKey: string
  lastError?: string
}

export type SendMessageApplicationResult = {
  text: string
  details: Record<string, unknown> & {
    recipients?: string[]
    skippedRecipients?: Array<{ recipient: string; reason: string }>
    type?: string
    wakeByRecipient?: SendMessageWakeDetail[]
    priority?: TeamMessagePriority
    taskId?: string
    threadId?: string
    routing?: MessageRoutingDetails
    mirroredToLeader?: string[]
    warning?: 'side_effect_failed'
    sideEffectWarnings?: MessageSideEffectWarning[]
    outboxEffects?: MessageOutboxRecord[]
    outboxRun?: OutboxRunResult
  }
  statusInvalidationRequested?: boolean
}

export type TaskReportAttentionPlan = {
  type: TaskReportType
  policy: MessageAttentionPolicy
  wakeHint: TeamMessageWakeHint
  metadata: { policyIntent: MessagePolicyIntent }
}

export type PlannedTaskLeaderAttention = {
  kind: 'requestLeaderAttention'
  team: TeamState
  message: {
    type: TaskReportType
    wakeHint: TeamMessageWakeHint
    from: string
    summary: string
    text: string
    messageId?: string
    taskId?: string
    threadId?: string
  }
}

export type PlannedTaskReportEffects = {
  leaderAttention?: PlannedTaskLeaderAttention
}

export type SendMessagePlanningState = {
  team: TeamState
  sender: string
  params: SendMessageInput
  messageType: MessageType
  resolvedThreadId: string | undefined
  priority: TeamMessagePriority
  metadata?: Record<string, unknown>
  routing: MessageRoutingDetails
  recipients: string[]
  sent: string[]
  leaderMirrors: string[]
  wakeByRecipient: SendMessageWakeDetail[]
  skippedRecipients: Array<{ recipient: string; reason: string }>
  sentMessages: Record<string, MailboxMessage>
  sideEffectWarnings: MessageSideEffectWarning[]
  outboxEffects: MessageOutboxRecord[]
  outboxRun?: OutboxRunResult
}
