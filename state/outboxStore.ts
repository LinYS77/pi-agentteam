import {
  defaultOutboxIdempotencyKey,
  isOutboxEffectKind,
  isOutboxEffectStatus,
  outboxBackoffMs,
  outboxClaimId,
  outboxEffectId,
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
import { readJsonFile, withFileLock, writeJsonFile } from './fsStore.js'
import { finiteNumberOrUndefined, isObjectRecord, numberValue, stringArray, stringValue } from './normalizers.js'
import { getOutboxStatePath } from './paths.js'
import { validateOrQuarantineTeam } from './validation.js'

export const OUTBOX_STORE_VERSION = 1
export const DEFAULT_OUTBOX_MAX_ATTEMPTS = 3
export const DEFAULT_OUTBOX_CLAIM_TTL_MS = 30_000

export type OutboxStoreState = {
  version: 1
  effects: Record<string, OutboxEffect>
  idempotency: Record<string, string>
}

function emptyOutboxStore(): OutboxStoreState {
  return { version: OUTBOX_STORE_VERSION, effects: {}, idempotency: {} }
}

function normalizeClaim(value: unknown): OutboxClaim | undefined {
  if (!isObjectRecord(value)) return undefined
  const claimId = stringValue(value.claimId)
  const workerId = stringValue(value.workerId)
  if (!claimId || !workerId) return undefined
  return {
    claimId,
    workerId,
    claimedAt: numberValue(value.claimedAt, 0),
    expiresAt: numberValue(value.expiresAt, 0),
    generation: numberValue(value.generation, 1),
  }
}

function normalizeEffect(raw: unknown): OutboxEffect | null {
  if (!isObjectRecord(raw)) return null
  const effectId = stringValue(raw.effectId)
  const teamName = stringValue(raw.teamName)
  const idempotencyKey = stringValue(raw.idempotencyKey)
  if (!effectId || !teamName || !idempotencyKey) return null
  if (!isOutboxEffectKind(raw.kind)) return null
  const status: OutboxEffectStatus = isOutboxEffectStatus(raw.status) ? raw.status : 'pending'
  const now = Date.now()
  const attempts = Math.max(0, numberValue(raw.attempts, 0))
  const maxAttempts = Math.max(1, numberValue(raw.maxAttempts, DEFAULT_OUTBOX_MAX_ATTEMPTS))
  const effect: OutboxEffect = {
    effectId,
    teamName,
    kind: raw.kind,
    idempotencyKey,
    status,
    payload: isObjectRecord(raw.payload) ? raw.payload as OutboxEffectPayloadMap[OutboxEffectKind] : {} as OutboxEffectPayloadMap[OutboxEffectKind],
    attempts,
    maxAttempts,
    nextAttemptAt: numberValue(raw.nextAttemptAt, now),
    dependsOn: stringArray(raw.dependsOn),
    createdAt: numberValue(raw.createdAt, now),
    updatedAt: numberValue(raw.updatedAt, now),
    claim: normalizeClaim(raw.claim),
    lastError: typeof raw.lastError === 'string' ? raw.lastError : undefined,
    result: raw.result,
    doneAt: finiteNumberOrUndefined(raw.doneAt),
    failedAt: finiteNumberOrUndefined(raw.failedAt),
  }
  if (effect.status !== 'pending') effect.claim = undefined
  return effect
}

export function normalizeOutboxStore(raw: unknown): OutboxStoreState {
  if (!isObjectRecord(raw)) return emptyOutboxStore()
  const out = emptyOutboxStore()
  const rawEffects = isObjectRecord(raw.effects) ? raw.effects : {}
  for (const rawEffect of Object.values(rawEffects)) {
    const effect = normalizeEffect(rawEffect)
    if (!effect) continue
    out.effects[effect.effectId] = effect
    out.idempotency[effect.idempotencyKey] = effect.effectId
  }
  const rawIndex = isObjectRecord(raw.idempotency) ? raw.idempotency : {}
  for (const [key, value] of Object.entries(rawIndex)) {
    if (typeof value !== 'string') continue
    if (!out.effects[value]) continue
    out.idempotency[key] = value
  }
  return out
}

export function readOutboxStore(teamName: string): OutboxStoreState {
  if (validateOrQuarantineTeam(teamName)) return emptyOutboxStore()
  return normalizeOutboxStore(readJsonFile<unknown>(getOutboxStatePath(teamName)))
}

export function updateOutboxStore(
  teamName: string,
  updater: (state: OutboxStoreState) => void | false | OutboxStoreState,
): OutboxStoreState {
  if (validateOrQuarantineTeam(teamName)) return emptyOutboxStore()
  const outboxPath = getOutboxStatePath(teamName)
  return withFileLock(outboxPath, () => {
    let state = readOutboxStore(teamName)
    const replacement = updater(state)
    if (replacement === false) return state
    if (replacement) state = normalizeOutboxStore(replacement)
    writeJsonFile(outboxPath, state)
    return state
  })
}

function terminal(status: OutboxEffectStatus): boolean {
  return status === 'done' || status === 'failed'
}

function upsertExistingEffect<K extends OutboxEffectKind>(
  effect: OutboxEffect,
  input: OutboxEnqueueInput<K>,
  now: number,
): OutboxEffect {
  if (terminal(effect.status)) return effect
  effect.payload = input.payload as OutboxEffect['payload']
  effect.maxAttempts = Math.max(1, input.maxAttempts ?? effect.maxAttempts ?? DEFAULT_OUTBOX_MAX_ATTEMPTS)
  effect.nextAttemptAt = input.nextAttemptAt ?? effect.nextAttemptAt ?? now
  effect.dependsOn = [...new Set([...(effect.dependsOn ?? []), ...(input.dependsOn ?? [])])]
  effect.updatedAt = now
  return effect
}

export function enqueueOutboxEffect<K extends OutboxEffectKind>(input: OutboxEnqueueInput<K>): OutboxEffect<K> {
  const now = input.now ?? Date.now()
  const idempotencyKey = input.idempotencyKey ?? defaultOutboxIdempotencyKey({
    teamName: input.teamName,
    kind: input.kind,
    payload: input.payload,
  })
  const effectId = outboxEffectId(input.teamName, idempotencyKey)
  let result: OutboxEffect | null = null
  updateOutboxStore(input.teamName, state => {
    const existingId = state.idempotency[idempotencyKey]
    const existing = existingId ? state.effects[existingId] : undefined
    if (existing) {
      result = upsertExistingEffect(existing, input, now)
      return
    }
    const effect: OutboxEffect<K> = {
      effectId,
      teamName: input.teamName,
      kind: input.kind,
      idempotencyKey,
      status: 'pending',
      payload: input.payload,
      attempts: 0,
      maxAttempts: Math.max(1, input.maxAttempts ?? DEFAULT_OUTBOX_MAX_ATTEMPTS),
      nextAttemptAt: input.nextAttemptAt ?? now,
      dependsOn: [...new Set(input.dependsOn ?? [])],
      createdAt: now,
      updatedAt: now,
    }
    state.effects[effect.effectId] = effect
    state.idempotency[idempotencyKey] = effect.effectId
    result = effect
  })
  if (!result) throw new Error('Failed to enqueue outbox effect')
  return result as OutboxEffect<K>
}

export function getOutboxEffect(teamName: string, effectId: string): OutboxEffect | null {
  return readOutboxStore(teamName).effects[effectId] ?? null
}

export function getOutboxEffectByIdempotencyKey(teamName: string, idempotencyKey: string): OutboxEffect | null {
  const store = readOutboxStore(teamName)
  const effectId = store.idempotency[idempotencyKey]
  return effectId ? store.effects[effectId] ?? null : null
}

export function recoverExpiredOutboxClaims(teamName: string, now = Date.now()): OutboxEffect[] {
  const recovered: OutboxEffect[] = []
  updateOutboxStore(teamName, state => {
    let changed = false
    for (const effect of Object.values(state.effects)) {
      if (effect.status !== 'pending') continue
      if (!effect.claim || effect.claim.expiresAt > now) continue
      effect.claim = undefined
      effect.updatedAt = now
      effect.lastError = 'outbox claim expired; recovered to pending'
      recovered.push(effect)
      changed = true
    }
    return changed ? undefined : false
  })
  return recovered
}

export function claimOutboxEffects(input: OutboxClaimInput): OutboxEffect[] {
  const now = input.now ?? Date.now()
  const claimTtlMs = input.claimTtlMs ?? DEFAULT_OUTBOX_CLAIM_TTL_MS
  const limit = Math.max(1, input.limit ?? input.effectIds?.length ?? 1)
  const effectIdFilter = input.effectIds ? new Set(input.effectIds) : undefined
  const claimed: OutboxEffect[] = []
  updateOutboxStore(input.teamName, state => {
    for (const effect of Object.values(state.effects)) {
      if (effect.status !== 'pending') continue
      if (effect.claim && effect.claim.expiresAt > now) continue
      if (effect.nextAttemptAt > now) continue
      effect.claim = undefined
    }
    const eligible = Object.values(state.effects)
      .filter(effect => {
        if (effect.status !== 'pending' || effect.claim || effect.nextAttemptAt > now) return false
        if (effectIdFilter && !effectIdFilter.has(effect.effectId)) return false
        if ((effect.dependsOn ?? []).some(effectId => state.effects[effectId]?.status !== 'done')) return false
        return true
      })
      .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt || a.createdAt - b.createdAt || a.effectId.localeCompare(b.effectId))
      .slice(0, limit)
    if (eligible.length === 0) return false
    for (const effect of eligible) {
      const generation = (effect.claim?.generation ?? 0) + 1
      effect.claim = {
        claimId: outboxClaimId({ effectId: effect.effectId, workerId: input.workerId, generation, claimedAt: now }),
        workerId: input.workerId,
        claimedAt: now,
        expiresAt: now + claimTtlMs,
        generation,
      }
      effect.updatedAt = now
      claimed.push(effect)
    }
  })
  return claimed
}

export function markOutboxEffectDone(input: OutboxCompleteInput): OutboxEffect | null {
  const now = input.now ?? Date.now()
  let updated: OutboxEffect | null = null
  updateOutboxStore(input.teamName, state => {
    const effect = state.effects[input.effectId]
    if (!effect) return false
    if (effect.status === 'done') {
      updated = effect
      return false
    }
    if (effect.status === 'failed') return false
    if (input.claimId && effect.claim?.claimId !== input.claimId) return false
    effect.status = 'done'
    effect.doneAt = now
    effect.updatedAt = now
    effect.claim = undefined
    effect.lastError = undefined
    effect.result = input.result
    updated = effect
  })
  return updated
}

export function markOutboxEffectFailed(input: OutboxFailInput): OutboxEffect | null {
  const now = input.now ?? Date.now()
  let updated: OutboxEffect | null = null
  updateOutboxStore(input.teamName, state => {
    const effect = state.effects[input.effectId]
    if (!effect) return false
    if (terminal(effect.status)) return false
    if (input.claimId && effect.claim?.claimId !== input.claimId) return false
    const attempts = effect.attempts + 1
    effect.attempts = attempts
    effect.updatedAt = now
    effect.claim = undefined
    effect.lastError = input.error
    effect.result = input.result
    if (attempts >= effect.maxAttempts) {
      effect.status = 'failed'
      effect.failedAt = now
      effect.nextAttemptAt = now
    } else {
      effect.status = 'pending'
      effect.nextAttemptAt = now + (input.backoffMs ?? outboxBackoffMs(attempts))
    }
    updated = effect
  })
  return updated
}

export function listOutboxEffects(teamName: string): OutboxEffect[] {
  return Object.values(readOutboxStore(teamName).effects)
    .sort((a, b) => a.createdAt - b.createdAt || a.effectId.localeCompare(b.effectId))
}
