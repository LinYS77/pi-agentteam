import { type MessageType, type TaskReportType } from './publicModel.js'

const MESSAGE_POLICY_INTENTS = Object.freeze([
  'none',
  'worker_delivery',
  'recipient_attention',
  'leader_attention',
] as const)
export type MessagePolicyIntent = typeof MESSAGE_POLICY_INTENTS[number]

const MESSAGE_POLICY_AUDIENCE_KINDS = Object.freeze(['leader', 'worker', 'unknown'] as const)
export type MessagePolicyAudienceKind = typeof MESSAGE_POLICY_AUDIENCE_KINDS[number]

export type MessagePolicyInput =
  | {
      kind: 'message'
      messageType: MessageType
      recipientKind?: MessagePolicyAudienceKind
    }
  | {
      kind: 'task_report'
      reportType: TaskReportType
      recipientKind?: MessagePolicyAudienceKind
    }

export type MessagePolicyWakeHint = 'none' | 'soft' | 'hard'

export type MessagePolicyDecision = {
  kind: MessagePolicyInput['kind']
  sourceType: MessageType | TaskReportType
  audienceKind: MessagePolicyAudienceKind
  intent: MessagePolicyIntent
  shouldWake: boolean
  wakeHint: MessagePolicyWakeHint
  reason: string
}

function isExactString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOneOf<const Values extends readonly string[]>(values: Values, value: unknown): value is Values[number] {
  return isExactString(value) && (values as readonly string[]).includes(value)
}

function normalizeOneOf<const Values extends readonly string[]>(values: Values, value: unknown): Values[number] | undefined {
  return isOneOf(values, value) ? value : undefined
}

export { MESSAGE_POLICY_INTENTS, MESSAGE_POLICY_AUDIENCE_KINDS }

export function isMessagePolicyIntent(value: unknown): value is MessagePolicyIntent {
  return isOneOf(MESSAGE_POLICY_INTENTS, value)
}

export function normalizeMessagePolicyIntent(value: unknown): MessagePolicyIntent | undefined {
  return normalizeOneOf(MESSAGE_POLICY_INTENTS, value)
}

export function isMessagePolicyAudienceKind(value: unknown): value is MessagePolicyAudienceKind {
  return isOneOf(MESSAGE_POLICY_AUDIENCE_KINDS, value)
}

export function normalizeMessagePolicyAudienceKind(value: unknown): MessagePolicyAudienceKind | undefined {
  return normalizeOneOf(MESSAGE_POLICY_AUDIENCE_KINDS, value)
}

function policyWakeHint(sourceType: MessageType | TaskReportType, intent: MessagePolicyIntent): MessagePolicyWakeHint {
  if (intent === 'none') return 'none'
  if (intent === 'worker_delivery') return 'hard'
  if (intent === 'recipient_attention') return 'soft'
  if (intent === 'leader_attention') return sourceType === 'question' ? 'soft' : 'hard'
  return 'none'
}

function decision(
  kind: MessagePolicyInput['kind'],
  sourceType: MessageType | TaskReportType,
  audienceKind: MessagePolicyAudienceKind,
  intent: MessagePolicyIntent,
  reason: string,
): MessagePolicyDecision {
  const wakeHint = policyWakeHint(sourceType, intent)
  return {
    kind,
    sourceType,
    audienceKind,
    intent,
    shouldWake: wakeHint !== 'none',
    wakeHint,
    reason,
  }
}

export function decideMessagePolicy(input: MessagePolicyInput): MessagePolicyDecision {
  if (input.kind === 'message') {
    switch (input.messageType) {
      case 'assignment':
        return decision(
          'message',
          input.messageType,
          'worker',
          'worker_delivery',
          'assignment routes to worker delivery',
        )
      case 'question': {
        const audienceKind = input.recipientKind ?? 'unknown'
        const intent = audienceKind === 'leader' ? 'leader_attention' : 'recipient_attention'
        const reason = audienceKind === 'leader'
          ? 'question to leader routes to leader attention'
          : 'question routes to recipient attention'
        return decision('message', input.messageType, audienceKind, intent, reason)
      }
      case 'inform': {
        const audienceKind = input.recipientKind ?? 'unknown'
        return decision(
          'message',
          input.messageType,
          audienceKind,
          'none',
          'inform is context-only and does not wake',
        )
      }
    }
  }

  return decision(
    'task_report',
    input.reportType,
    'leader',
    'leader_attention',
    `${input.reportType} routes to leader attention`,
  )
}
