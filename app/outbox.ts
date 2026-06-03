export {
  OUTBOX_EFFECT_KINDS,
  OUTBOX_EFFECT_STATUSES,
  defaultOutboxIdempotencyKey,
  isOutboxEffectKind,
  isOutboxEffectStatus,
  outboxBackoffMs,
  outboxClaimId,
  outboxEffectId,
  outboxHash,
  type OutboxClaim,
  type OutboxClaimInput,
  type OutboxCompleteInput,
  type OutboxEffect,
  type OutboxEffectKind,
  type OutboxEffectPayloadMap,
  type OutboxEffectStatus,
  type OutboxEnqueueInput,
  type OutboxFailInput,
} from '../core/outboxModel.js'

export function outboxEffectWarningName(kind: string): string {
  switch (kind) {
    case 'inbox_item_append_requested':
      return 'pushMailbox'
    case 'worker_delivery_requested':
      return 'requestWorkerDelivery'
    case 'leader_attention_requested':
      return 'requestLeaderAttention'
    case 'task_message_ref_append_requested':
      return 'appendTaskMessageRef'
    case 'append_event_requested':
      return 'appendEvent'
    default:
      return kind
  }
}
