import { createHash } from 'node:crypto'
import type { MessageType, TaskReportType } from './publicModel.js'

const OUTBOX_EFFECT_KINDS = Object.freeze([
  'inbox_item_append_requested',
  'worker_delivery_requested',
  'leader_attention_requested',
  'task_note_append_requested',
  'append_event_requested',
] as const)
export type OutboxEffectKind = typeof OUTBOX_EFFECT_KINDS[number]

const OUTBOX_EFFECT_STATUSES = Object.freeze(['pending', 'done', 'failed'] as const)
export type OutboxEffectStatus = typeof OUTBOX_EFFECT_STATUSES[number]

export type OutboxMessageType = MessageType | TaskReportType
export type OutboxMessagePriority = 'low' | 'normal' | 'high'
export type OutboxMessageWakeHint = 'none' | 'soft' | 'hard'

export type OutboxClaim = {
  claimId: string
  workerId: string
  claimedAt: number
  expiresAt: number
  generation: number
}

export type OutboxEffectPayloadMap = {
  inbox_item_append_requested: {
    teamName: string
    recipient: string
    message: {
      id?: string
      createdAt?: number
      from: string
      to: string
      text: string
      summary?: string
      type?: OutboxMessageType
      taskId?: string
      threadId?: string
      replyTo?: string
      priority?: OutboxMessagePriority
      wakeHint?: OutboxMessageWakeHint
      metadata?: Record<string, unknown>
    }
  }
  worker_delivery_requested: {
    teamName: string
    memberName: string
    explicitTask?: string
    options?: {
      requestedBy?: string
      reason?: string
      messageIds?: string[]
      wakeHint?: OutboxMessageWakeHint
    }
  }
  leader_attention_requested: {
    teamName: string
    message: {
      type?: OutboxMessageType
      wakeHint?: OutboxMessageWakeHint
      from?: string
      summary?: string
      text?: string
      messageId?: string
      taskId?: string
      threadId?: string
    }
  }
  task_note_append_requested: {
    teamName: string
    taskId: string
    author: string
    text: string
    details?: {
      threadId?: string
      messageType?: OutboxMessageType
      requestId?: string
      linkedMessageId?: string
      metadata?: Record<string, unknown>
      hidden?: boolean
    }
  }
  append_event_requested: {
    teamName: string
    event: {
      id?: string
      at?: number
      type: string
      by: string
      text: string
      metadata?: Record<string, unknown>
    }
  }
}

export type OutboxEffect<K extends OutboxEffectKind = OutboxEffectKind> = {
  effectId: string
  teamName: string
  kind: K
  idempotencyKey: string
  status: OutboxEffectStatus
  payload: OutboxEffectPayloadMap[K]
  attempts: number
  maxAttempts: number
  nextAttemptAt: number
  dependsOn: string[]
  createdAt: number
  updatedAt: number
  claim?: OutboxClaim
  lastError?: string
  result?: unknown
  doneAt?: number
  failedAt?: number
}

export type OutboxEnqueueInput<K extends OutboxEffectKind = OutboxEffectKind> = {
  teamName: string
  kind: K
  payload: OutboxEffectPayloadMap[K]
  idempotencyKey?: string
  maxAttempts?: number
  nextAttemptAt?: number
  dependsOn?: string[]
  now?: number
}

export type OutboxClaimInput = {
  teamName: string
  workerId: string
  claimTtlMs?: number
  limit?: number
  now?: number
  effectIds?: string[]
}

export type OutboxCompleteInput = {
  teamName: string
  effectId: string
  claimId?: string
  result?: unknown
  now?: number
}

export type OutboxFailInput = {
  teamName: string
  effectId: string
  claimId?: string
  error: string
  now?: number
  backoffMs?: number
  result?: unknown
}

function isExactString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOneOf<const Values extends readonly string[]>(values: Values, value: unknown): value is Values[number] {
  return isExactString(value) && (values as readonly string[]).includes(value)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
}

export { OUTBOX_EFFECT_KINDS, OUTBOX_EFFECT_STATUSES }

export function isOutboxEffectKind(value: unknown): value is OutboxEffectKind {
  return isOneOf(OUTBOX_EFFECT_KINDS, value)
}

export function isOutboxEffectStatus(value: unknown): value is OutboxEffectStatus {
  return isOneOf(OUTBOX_EFFECT_STATUSES, value)
}

export function outboxHash(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function defaultOutboxIdempotencyKey<K extends OutboxEffectKind>(input: {
  teamName: string
  kind: K
  payload: OutboxEffectPayloadMap[K]
}): string {
  return `${input.teamName}:${input.kind}:${outboxHash(stableStringify(input.payload))}`
}

export function outboxEffectId(teamName: string, idempotencyKey: string): string {
  return `outbox-${outboxHash(`${teamName}\n${idempotencyKey}`).slice(0, 24)}`
}

export function outboxClaimId(input: { effectId: string; workerId: string; generation: number; claimedAt: number }): string {
  return `outbox-claim-${outboxHash(`${input.effectId}\n${input.workerId}\n${input.generation}\n${input.claimedAt}`).slice(0, 16)}`
}

export function outboxBackoffMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1)
  return Math.min(60_000, 1_000 * (2 ** exponent))
}
