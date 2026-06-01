import type { OutboxStorePort } from '../../app/ports.js'
import {
  claimOutboxEffects,
  enqueueOutboxEffect,
  getOutboxEffect,
  listOutboxEffects,
  markOutboxEffectDone,
  markOutboxEffectFailed,
  recoverExpiredOutboxClaims,
} from '../../state/outboxStore.js'

export const fileBackedOutboxStorePort: OutboxStorePort = {
  enqueue: enqueueOutboxEffect,
  get: getOutboxEffect,
  claim: claimOutboxEffects,
  markDone: markOutboxEffectDone,
  markFailed: markOutboxEffectFailed,
  list: listOutboxEffects,
  recoverExpiredClaims: recoverExpiredOutboxClaims,
}
