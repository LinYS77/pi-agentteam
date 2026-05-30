import type {
  BridgeLeaseState,
  DeliveryRequestState,
  DeliveryRequestStatus,
} from '../internalTypes.js'
import {
  activeClaim,
  claimNextEligibleDeliveryRequest,
  createOrRefreshDeliveryRequest,
  expireStaleDeliveryRequests,
  getDeliveryRequest,
  maintainDeliveryRequests as maintainDeliveryRequestsInStore,
  readDeliveryRequestStore,
  requestHasExpired,
  transitionDeliveryRequest,
} from '../state/deliveryStore.js'
// Guarded production boundary for delivery request lifecycle transitions.
// The state/deliveryStore.ts module intentionally remains a low-level
// persistence/normalization surface; bridge/runtime callers should use this
// service for state transitions that require lifecycle, expiry, and claim guards.
export type DeliveryRequestServiceInput = {
  teamName: string
  memberName: string
  messageIds?: string[]
  bootPrompt?: string
  requestedBy?: string
  reason?: string
  expiresAt?: number
  now?: number
}

export type ClaimNextDeliveryInput = {
  teamName: string
  memberName: string
  bridgeId: string
  generation: number
  promptHash: string
  messageIds: string[]
  claimTtlMs?: number
  now?: number
}

export type DeliveryRequestServiceResult<T = DeliveryRequestState> =
  | { ok: true; request: T; reason: string }
  | { ok: false; request?: DeliveryRequestState | null; reason: string; error?: string }

const allowedTransitions: Record<DeliveryRequestStatus, DeliveryRequestStatus[]> = {
  pending: ['claimed', 'cancelled', 'expired'],
  claimed: ['submitted', 'failed', 'cancelled', 'expired'],
  submitted: ['started', 'failed', 'cancelled', 'expired'],
  started: ['completed', 'failed', 'cancelled', 'expired'],
  completed: [],
  failed: [],
  expired: [],
  cancelled: [],
}

function canTransition(from: DeliveryRequestStatus, to: DeliveryRequestStatus): boolean {
  return allowedTransitions[from]?.includes(to) ?? false
}

function transitionReason(from: DeliveryRequestStatus, to: DeliveryRequestStatus): string {
  return `illegal delivery request transition ${from} -> ${to}`
}

function guardedTransition(
  teamName: string,
  request: DeliveryRequestState | null | undefined,
  to: DeliveryRequestStatus,
  input: { now?: number; error?: string; claimId?: string } = {},
): DeliveryRequestServiceResult {
  const now = input.now ?? Date.now()
  if (!request) return { ok: false, request: null, reason: 'delivery request not found' }
  if (requestHasExpired(request, now) && request.status !== 'expired') {
    return { ok: false, request, reason: 'delivery request expired' }
  }
  if (!canTransition(request.status, to)) {
    return { ok: false, request, reason: transitionReason(request.status, to) }
  }
  if (input.claimId && request.claim?.claimId !== input.claimId) {
    return { ok: false, request, reason: 'delivery request claim mismatch' }
  }
  const updated = transitionDeliveryRequest(teamName, request.requestId, to, input)
  if (!updated) return { ok: false, request, reason: 'delivery request transition failed' }
  return { ok: true, request: updated, reason: `delivery request marked ${to}` }
}

export function requestOrRefreshDelivery(input: DeliveryRequestServiceInput): DeliveryRequestServiceResult {
  maintainDeliveryRequestsInStore(input.teamName, input.now ?? Date.now())
  return {
    ok: true,
    request: createOrRefreshDeliveryRequest(input),
    reason: 'delivery request pending',
  }
}

export function claimNextDelivery(input: ClaimNextDeliveryInput): DeliveryRequestServiceResult {
  const now = input.now ?? Date.now()
  maintainDeliveryRequestsInStore(input.teamName, now)
  const request = Object.values(readDeliveryRequestStore(input.teamName).requests)
    .filter(candidate => candidate.memberName === input.memberName && candidate.status === 'pending' && !requestHasExpired(candidate, now))
    .sort((a, b) => a.createdAt - b.createdAt)[0]
  if (!request) return { ok: false, request: null, reason: 'no pending delivery request' }
  if (!canTransition(request.status, 'claimed')) {
    return { ok: false, request, reason: transitionReason(request.status, 'claimed') }
  }
  const claimed = claimNextEligibleDeliveryRequest(input)
  if (!claimed?.claim || !activeClaim(claimed, now)) {
    return { ok: false, request: claimed ?? request, reason: 'delivery request already claimed' }
  }
  return { ok: true, request: claimed, reason: 'delivery request claimed' }
}

export function markDeliverySubmitted(
  teamName: string,
  requestId: string,
  input: { now?: number; claimId?: string } = {},
): DeliveryRequestServiceResult {
  return guardedTransition(teamName, getDeliveryRequest(teamName, requestId), 'submitted', input)
}

export function markDeliveryStarted(
  teamName: string,
  requestId: string,
  input: { now?: number; claimId?: string } = {},
): DeliveryRequestServiceResult {
  return guardedTransition(teamName, getDeliveryRequest(teamName, requestId), 'started', input)
}

export function markLatestDeliveryStarted(input: {
  teamName: string
  memberName: string
  fromStatuses?: DeliveryRequestStatus[]
  bridgeId?: string
  generation?: number
  now?: number
}): DeliveryRequestServiceResult {
  const now = input.now ?? Date.now()
  const fromStatuses = input.fromStatuses ?? ['submitted']
  const allowed = new Set(fromStatuses)
  const request = Object.values(readDeliveryRequestStore(input.teamName).requests)
    .filter(candidate => {
      if (candidate.memberName !== input.memberName || !allowed.has(candidate.status)) return false
      if (requestHasExpired(candidate, now)) return false
      if (input.bridgeId && candidate.claim?.bridgeId !== input.bridgeId) return false
      if (input.generation !== undefined && candidate.claim?.generation !== input.generation) return false
      return true
    })
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)[0]
  if (!request) return { ok: false, request: null, reason: 'no submitted delivery request' }
  const guarded = guardedTransition(input.teamName, request, 'started', { now })
  if (guarded.ok) return guarded
  return guarded
}

export function markDeliveryCompleted(
  teamName: string,
  requestId: string,
  input: { now?: number } = {},
): DeliveryRequestServiceResult {
  return guardedTransition(teamName, getDeliveryRequest(teamName, requestId), 'completed', input)
}

export function markLatestDeliveryCompleted(input: {
  teamName: string
  memberName: string
  fromStatuses?: DeliveryRequestStatus[]
  now?: number
}): DeliveryRequestServiceResult {
  const now = input.now ?? Date.now()
  const fromStatuses = input.fromStatuses ?? ['started']
  const allowed = new Set(fromStatuses)
  const request = Object.values(readDeliveryRequestStore(input.teamName).requests)
    .filter(candidate => candidate.memberName === input.memberName && allowed.has(candidate.status) && !requestHasExpired(candidate, now))
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)[0]
  if (!request) return { ok: false, request: null, reason: 'no started delivery request' }
  return guardedTransition(input.teamName, request, 'completed', { now })
}

export function markDeliveryFailed(
  teamName: string,
  requestId: string,
  input: { now?: number; claimId?: string; error?: string } = {},
): DeliveryRequestServiceResult {
  return guardedTransition(teamName, getDeliveryRequest(teamName, requestId), 'failed', input)
}

export function cancelDelivery(
  teamName: string,
  requestId: string,
  input: { now?: number; error?: string } = {},
): DeliveryRequestServiceResult {
  return guardedTransition(teamName, getDeliveryRequest(teamName, requestId), 'cancelled', input)
}

export function expireStaleDeliveries(teamName: string, now = Date.now()): DeliveryRequestServiceResult<DeliveryRequestState[]> {
  return {
    ok: true,
    request: expireStaleDeliveryRequests(teamName, now),
    reason: 'expired stale delivery requests',
  }
}

export function maintainDeliveryRequests(input: string | { teamName: string; memberName?: string; now?: number }, now = Date.now()): { ok: true; expired: DeliveryRequestState[]; recovered: DeliveryRequestState[]; reason: string } {
  const result = typeof input === 'string'
    ? maintainDeliveryRequestsInStore(input, now)
    : maintainDeliveryRequestsInStore(input)
  return {
    ok: true,
    expired: result.expired,
    recovered: result.recovered,
    reason: 'maintained delivery requests',
  }
}

export function leaseIdentity(input: { lease?: BridgeLeaseState | null }): { bridgeId?: string; generation?: number } {
  return {
    bridgeId: input.lease?.bridgeId,
    generation: input.lease?.generation,
  }
}
