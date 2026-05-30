import { createHash } from 'node:crypto'
import type {
  BridgeLeaseState,
  DeliveryRequestClaim,
  DeliveryRequestState,
  DeliveryRequestStatus,
  WorkerFsmStatus,
} from '../internalTypes.js'
import { staleBridge } from './bridgeStore.js'
import { finiteNumberOrUndefined, isObjectRecord, numberValue, stringArray, stringOrUndefined, stringValue } from './normalizers.js'
import { readRuntimeSection, updateRuntimeSection } from './runtimeStore.js'

// Low-level persisted delivery request store helpers.
// Production bridge delivery state transitions should prefer
// runtime/deliveryRequestService.ts, which wraps this store with transition
// guards, expiry checks, and claim validation. These store exports remain for
// focused tests, normalization, and runtime maintenance internals.
export const DELIVERY_REQUEST_STATE_VERSION = 1

export const DELIVERY_REQUEST_STATUSES = [
  'pending',
  'claimed',
  'submitted',
  'started',
  'completed',
  'failed',
  'expired',
  'cancelled',
] as const satisfies readonly DeliveryRequestStatus[]

const ACTIVE_DELIVERY_STATUSES = new Set<DeliveryRequestStatus>(['claimed', 'submitted', 'started'])
const TERMINAL_DELIVERY_STATUSES = new Set<DeliveryRequestStatus>(['completed', 'failed', 'expired', 'cancelled'])

export type DeliveryRequestStoreState = {
  version: 1
  requests: Record<string, DeliveryRequestState>
}

export type DeliveryRequestInput = {
  teamName: string
  memberName: string
  messageIds?: string[]
  bootPrompt?: string
  requestedBy?: string
  reason?: string
  expiresAt?: number
  now?: number
}

export type ClaimDeliveryRequestInput = {
  bridgeId: string
  generation?: number
  claimTtlMs?: number
  now?: number
  messageIds?: string[]
  promptHash?: string
}

export type ClaimEligibleDeliveryRequestInput = {
  teamName: string
  memberName: string
  bridgeId: string
  generation: number
  promptHash: string
  messageIds: string[]
  claimTtlMs?: number
  now?: number
}

export function promptHashForParts(messageIds: string[], prompt: string): string {
  const hash = createHash('sha256')
  hash.update(JSON.stringify([...messageIds].sort()))
  hash.update('\n')
  hash.update(prompt)
  return hash.digest('hex')
}

function claimIdFor(input: { bridgeId: string; generation: number; claimedAt: number; promptHash: string }): string {
  const shortHash = createHash('sha256')
    .update(`${input.bridgeId}\n${input.generation}\n${input.claimedAt}\n${input.promptHash}`)
    .digest('hex')
    .slice(0, 12)
  return `claim-${input.generation}-${input.claimedAt}-${shortHash}`
}

function emptyDeliveryRequestStore(): DeliveryRequestStoreState {
  return { version: DELIVERY_REQUEST_STATE_VERSION, requests: {} }
}

function statusValue(value: unknown): DeliveryRequestStatus {
  return DELIVERY_REQUEST_STATUSES.includes(value as DeliveryRequestStatus)
    ? value as DeliveryRequestStatus
    : 'pending'
}

function normalizeClaim(value: unknown): DeliveryRequestClaim | undefined {
  if (!isObjectRecord(value)) return undefined
  const bridgeId = stringValue(value.bridgeId) ?? ''
  if (!bridgeId) return undefined
  const claimedAt = numberValue(value.claimedAt, Date.now())
  const generation = numberValue(value.generation, 1)
  const messageIds = stringArray(value.messageIds)
  const promptHash = stringValue(value.promptHash) ?? promptHashForParts(messageIds, '')
  const claimId = stringValue(value.claimId) ?? claimIdFor({ bridgeId, generation, claimedAt, promptHash })
  return {
    claimId,
    bridgeId,
    claimedAt,
    expiresAt: numberValue(value.expiresAt, 0),
    generation,
    messageIds,
    promptHash,
  }
}

function normalizeRequest(raw: unknown): DeliveryRequestState | null {
  if (!isObjectRecord(raw)) return null
  const requestId = stringValue(raw.requestId) ?? ''
  const teamName = stringValue(raw.teamName) ?? ''
  const memberName = stringValue(raw.memberName) ?? ''
  if (!requestId || !teamName || !memberName) return null
  const now = Date.now()
  const status = statusValue(raw.status)
  const request: DeliveryRequestState = {
    requestId,
    teamName,
    memberName,
    status,
    messageIds: stringArray(raw.messageIds),
    bootPrompt: stringOrUndefined(raw.bootPrompt),
    requestedBy: stringOrUndefined(raw.requestedBy),
    reason: stringOrUndefined(raw.reason),
    promptHash: stringOrUndefined(raw.promptHash),
    createdAt: numberValue(raw.createdAt, now),
    updatedAt: numberValue(raw.updatedAt, now),
    expiresAt: numberValue(raw.expiresAt, 0),
    claim: normalizeClaim(raw.claim),
    submittedAt: finiteNumberOrUndefined(raw.submittedAt),
    startedAt: finiteNumberOrUndefined(raw.startedAt),
    completedAt: finiteNumberOrUndefined(raw.completedAt),
    failedAt: finiteNumberOrUndefined(raw.failedAt),
    expiredAt: finiteNumberOrUndefined(raw.expiredAt),
    cancelledAt: finiteNumberOrUndefined(raw.cancelledAt),
    lastError: stringOrUndefined(raw.lastError),
  }
  return request
}

export function normalizeDeliveryRequestStore(raw: unknown): DeliveryRequestStoreState {
  if (!isObjectRecord(raw)) return emptyDeliveryRequestStore()
  const out = emptyDeliveryRequestStore()
  const rawRequests = isObjectRecord(raw.requests) ? raw.requests : {}
  for (const [requestId, rawRequest] of Object.entries(rawRequests)) {
    const request = normalizeRequest(rawRequest)
    if (!request) continue
    out.requests[requestId] = request
  }
  return out
}

export function readDeliveryRequestStore(teamName: string): DeliveryRequestStoreState {
  return readRuntimeSection(teamName, 'delivery', normalizeDeliveryRequestStore)
}

export function updateDeliveryRequestStore(
  teamName: string,
  updater: (state: DeliveryRequestStoreState) => void | false | DeliveryRequestStoreState,
): DeliveryRequestStoreState {
  return updateRuntimeSection(teamName, 'delivery', normalizeDeliveryRequestStore, updater).section
}

function requestId(now: number): string {
  return `delivery-${now}-${Math.random().toString(36).slice(2, 8)}`
}

export function createDeliveryRequest(input: DeliveryRequestInput): DeliveryRequestState {
  const now = input.now ?? Date.now()
  const request: DeliveryRequestState = {
    requestId: requestId(now),
    teamName: input.teamName,
    memberName: input.memberName,
    status: 'pending',
    messageIds: [...(input.messageIds ?? [])],
    bootPrompt: input.bootPrompt,
    requestedBy: input.requestedBy,
    reason: input.reason,
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt ?? now + 60_000,
  }
  updateDeliveryRequestStore(input.teamName, state => {
    state.requests[request.requestId] = request
  })
  return request
}

export function createOrRefreshDeliveryRequest(input: DeliveryRequestInput): DeliveryRequestState {
  const now = input.now ?? Date.now()
  let result: DeliveryRequestState | null = null
  updateDeliveryRequestStore(input.teamName, state => {
    maintainDeliveryRequestsInState(state, now)
    const incomingIds = new Set(input.messageIds ?? [])
    const existing = Object.values(state.requests)
      .filter(request => request.memberName === input.memberName && request.status === 'pending' && !requestHasExpired(request, now))
      .sort((a, b) => a.createdAt - b.createdAt)[0]
    if (existing) {
      for (const id of incomingIds) {
        if (!existing.messageIds.includes(id)) existing.messageIds.push(id)
      }
      if (input.bootPrompt) existing.bootPrompt = input.bootPrompt
      existing.requestedBy = input.requestedBy ?? existing.requestedBy
      existing.reason = input.reason ?? existing.reason
      existing.expiresAt = Math.max(existing.expiresAt, input.expiresAt ?? now + 60_000)
      existing.updatedAt = now
      existing.lastError = undefined
      result = existing
      return
    }

    const request: DeliveryRequestState = {
      requestId: requestId(now),
      teamName: input.teamName,
      memberName: input.memberName,
      status: 'pending',
      messageIds: [...incomingIds],
      bootPrompt: input.bootPrompt,
      requestedBy: input.requestedBy,
      reason: input.reason,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt ?? now + 60_000,
    }
    state.requests[request.requestId] = request
    result = request
  })
  if (!result) throw new Error('Failed to create delivery request')
  return result
}

export function getDeliveryRequest(teamName: string, requestId: string): DeliveryRequestState | null {
  return readDeliveryRequestStore(teamName).requests[requestId] ?? null
}

export function updateDeliveryRequest(
  teamName: string,
  requestId: string,
  updater: (request: DeliveryRequestState, now: number) => void | false,
  now = Date.now(),
): DeliveryRequestState | null {
  let updated: DeliveryRequestState | null = null
  updateDeliveryRequestStore(teamName, state => {
    const request = state.requests[requestId]
    if (!request) return
    const changed = updater(request, now)
    if (changed === false) return false
    request.updatedAt = now
    updated = request
  })
  return updated
}

export function claimDeliveryRequest(
  teamName: string,
  requestId: string,
  input: ClaimDeliveryRequestInput,
): DeliveryRequestState | null {
  const now = input.now ?? Date.now()
  const claimTtlMs = input.claimTtlMs ?? 30_000
  return updateDeliveryRequest(teamName, requestId, request => {
    if (TERMINAL_DELIVERY_STATUSES.has(request.status)) return false
    const generation = input.generation ?? ((request.claim?.generation ?? 0) + 1)
    const messageIds = [...(input.messageIds ?? request.messageIds)]
    const promptHash = input.promptHash ?? request.promptHash ?? promptHashForParts(messageIds, request.bootPrompt ?? '')
    request.status = 'claimed'
    request.promptHash = promptHash
    request.claim = {
      claimId: claimIdFor({ bridgeId: input.bridgeId, generation, claimedAt: now, promptHash }),
      bridgeId: input.bridgeId,
      claimedAt: now,
      expiresAt: now + claimTtlMs,
      generation,
      messageIds,
      promptHash,
    }
  }, now)
}

export function claimNextEligibleDeliveryRequest(input: ClaimEligibleDeliveryRequestInput): DeliveryRequestState | null {
  const now = input.now ?? Date.now()
  const claimTtlMs = input.claimTtlMs ?? 30_000
  let claimed: DeliveryRequestState | null = null
  updateDeliveryRequestStore(input.teamName, state => {
    const request = Object.values(state.requests)
      .filter(candidate => candidate.memberName === input.memberName && candidate.status === 'pending' && !requestHasExpired(candidate, now))
      .sort((a, b) => a.createdAt - b.createdAt)[0]
    if (!request) return
    request.status = 'claimed'
    request.promptHash = input.promptHash
    request.claim = {
      claimId: claimIdFor({ bridgeId: input.bridgeId, generation: input.generation, claimedAt: now, promptHash: input.promptHash }),
      bridgeId: input.bridgeId,
      claimedAt: now,
      expiresAt: now + claimTtlMs,
      generation: input.generation,
      messageIds: [...input.messageIds],
      promptHash: input.promptHash,
    }
    request.updatedAt = now
    request.lastError = undefined
    claimed = request
  })
  return claimed
}

export function transitionDeliveryRequest(
  teamName: string,
  requestId: string,
  status: DeliveryRequestStatus,
  input: { now?: number; error?: string; claimId?: string } = {},
): DeliveryRequestState | null {
  const now = input.now ?? Date.now()
  return updateDeliveryRequest(teamName, requestId, request => {
    if (input.claimId && request.claim?.claimId !== input.claimId) return false
    request.status = status
    request.lastError = input.error
    if (status === 'submitted') request.submittedAt = now
    if (status === 'started') request.startedAt = now
    if (status === 'completed') request.completedAt = now
    if (status === 'failed') request.failedAt = now
    if (status === 'expired') request.expiredAt = now
    if (status === 'cancelled') request.cancelledAt = now
  }, now)
}

export function transitionLatestDeliveryRequest(
  teamName: string,
  memberName: string,
  fromStatuses: DeliveryRequestStatus[],
  status: DeliveryRequestStatus,
  input: { now?: number; error?: string; bridgeId?: string; generation?: number } = {},
): DeliveryRequestState | null {
  const now = input.now ?? Date.now()
  let transitioned: DeliveryRequestState | null = null
  const allowed = new Set(fromStatuses)
  updateDeliveryRequestStore(teamName, state => {
    const request = Object.values(state.requests)
      .filter(candidate => {
        if (candidate.memberName !== memberName || !allowed.has(candidate.status)) return false
        if (requestHasExpired(candidate, now)) return false
        if (input.bridgeId && candidate.claim?.bridgeId !== input.bridgeId) return false
        if (input.generation !== undefined && candidate.claim?.generation !== input.generation) return false
        return true
      })
      .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)[0]
    if (!request) return
    request.status = status
    request.lastError = input.error
    request.updatedAt = now
    if (status === 'submitted') request.submittedAt = now
    if (status === 'started') request.startedAt = now
    if (status === 'completed') request.completedAt = now
    if (status === 'failed') request.failedAt = now
    if (status === 'expired') request.expiredAt = now
    if (status === 'cancelled') request.cancelledAt = now
    transitioned = request
  })
  return transitioned
}

export function hasActiveDeliveryRequest(teamName: string, memberName: string, now = Date.now()): boolean {
  return Object.values(readDeliveryRequestStore(teamName).requests)
    .some(request => request.memberName === memberName && Boolean(activeClaim(request, now)))
}

export function hasPendingDeliveryRequest(teamName: string, memberName: string, now = Date.now()): boolean {
  return Object.values(readDeliveryRequestStore(teamName).requests)
    .some(request => request.memberName === memberName && request.status === 'pending' && !requestHasExpired(request, now))
}

export function requestHasExpired(request: DeliveryRequestState | null | undefined, now = Date.now()): boolean {
  if (!request) return true
  if (request.status === 'expired') return true
  if (TERMINAL_DELIVERY_STATUSES.has(request.status)) return false
  if (request.status !== 'pending' && request.status !== 'claimed') return false
  return Number.isFinite(request.expiresAt) && request.expiresAt <= now
}

export function activeClaim(request: DeliveryRequestState | null | undefined, now = Date.now()): DeliveryRequestClaim | null {
  if (!request?.claim) return null
  if (!ACTIVE_DELIVERY_STATUSES.has(request.status)) return null
  if (!Number.isFinite(request.claim.expiresAt) || request.claim.expiresAt <= now) return null
  return request.claim
}

export function safeIdle(input: {
  member?: { status?: WorkerFsmStatus } | null
  hasPendingMessages?: boolean
  hasActiveRequest?: boolean
}): boolean {
  const status = input.member?.status
  return status === 'idle' && !input.hasPendingMessages && !input.hasActiveRequest
}

export function eligibleToDeliver(input: {
  request?: DeliveryRequestState | null
  lease?: BridgeLeaseState | null
  member?: { status?: WorkerFsmStatus } | null
  now?: number
}): boolean {
  const now = input.now ?? Date.now()
  const request = input.request
  if (!request || request.status !== 'pending') return false
  if (requestHasExpired(request, now)) return false
  if (staleBridge(input.lease, now)) return false
  const status = input.member?.status
  return status === 'idle' || status === 'queued'
}

export type DeliveryRequestMaintenanceResult = {
  expired: DeliveryRequestState[]
  recovered: DeliveryRequestState[]
}

export type MaintainDeliveryRequestsInput = {
  teamName: string
  memberName?: string
  now?: number
}

function maintainDeliveryRequestsInState(state: DeliveryRequestStoreState, now: number, memberName?: string): DeliveryRequestMaintenanceResult & { changed: boolean } {
  const result: DeliveryRequestMaintenanceResult & { changed: boolean } = { expired: [], recovered: [], changed: false }
  for (const request of Object.values(state.requests)) {
    if (memberName && request.memberName !== memberName) continue
    if (request.status === 'pending') {
      if (!requestHasExpired(request, now)) continue
      request.status = 'expired'
      request.expiredAt = now
      request.updatedAt = now
      request.lastError = 'delivery request expired before submit'
      result.expired.push(request)
      result.changed = true
      continue
    }

    if (request.status === 'claimed') {
      if (requestHasExpired(request, now)) {
        request.status = 'expired'
        request.expiredAt = now
        request.updatedAt = now
        request.lastError = 'delivery request expired before submit'
        result.expired.push(request)
        result.changed = true
        continue
      }
      if (request.claim && Number.isFinite(request.claim.expiresAt) && request.claim.expiresAt <= now) {
        request.status = 'pending'
        request.claim = undefined
        request.promptHash = undefined
        request.updatedAt = now
        request.lastError = 'delivery claim expired; recovered to pending'
        result.recovered.push(request)
        result.changed = true
      }
    }
  }
  return result
}

export function maintainDeliveryRequests(input: string | MaintainDeliveryRequestsInput, nowArg = Date.now()): DeliveryRequestMaintenanceResult {
  const teamName = typeof input === 'string' ? input : input.teamName
  const memberName = typeof input === 'string' ? undefined : input.memberName
  const now = typeof input === 'string' ? nowArg : input.now ?? Date.now()
  const result: DeliveryRequestMaintenanceResult = { expired: [], recovered: [] }
  updateDeliveryRequestStore(teamName, state => {
    const maintained = maintainDeliveryRequestsInState(state, now, memberName)
    result.expired.push(...maintained.expired)
    result.recovered.push(...maintained.recovered)
    return maintained.changed ? undefined : false
  })
  return result
}

export function recoverStaleDeliveryClaims(teamName: string, now = Date.now()): DeliveryRequestState[] {
  return maintainDeliveryRequests(teamName, now).recovered
}

export function expireStaleDeliveryRequests(teamName: string, now = Date.now()): DeliveryRequestState[] {
  return maintainDeliveryRequests(teamName, now).expired
}
