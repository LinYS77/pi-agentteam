import type { TeamMember, WorkerFsmStatus } from '../internalTypes.js'

export type WorkerFsmEvent =
  | 'spawnReserved'
  | 'bridgeLeasePublished'
  | 'bridgeUnavailable'
  | 'deliveryRequested'
  | 'deliverySubmitted'
  | 'agentStarted'
  | 'agentEnded'
  | 'nativeBusy'
  | 'deliveryFailed'
  | 'paneLost'
  | 'sessionShutdown'
  | 'manualRecovered'

export type WorkerFsmInput = {
  member?: Pick<TeamMember,
    | 'status'
    | 'lastWakeReason'
    | 'lastError'
    | 'bridgeAvailable'
    | 'bridgeLastError'
  > | null
  event: WorkerFsmEvent
  reason?: string
  error?: string
  hasPendingDelivery?: boolean
  hasActiveDelivery?: boolean
  hasPendingNative?: boolean
  nativeIdle?: boolean
}

export type WorkerFsmPatch = Partial<Pick<TeamMember,
  | 'status'
  | 'lastWakeReason'
  | 'lastError'
  | 'bridgeAvailable'
  | 'bridgeLastError'
>>

export type WorkerFsmResult = {
  ok: boolean
  from: WorkerFsmStatus
  to: WorkerFsmStatus
  event: WorkerFsmEvent
  patch: WorkerFsmPatch
  reason: string
  error?: string
}

function statusOf(member: WorkerFsmInput['member']): WorkerFsmStatus {
  return member?.status ?? 'offline'
}

function runningPreservingStatus(from: WorkerFsmStatus, fallback: WorkerFsmStatus): WorkerFsmStatus {
  return from === 'running' ? 'running' : fallback
}

function result(input: WorkerFsmInput, to: WorkerFsmStatus, patch: WorkerFsmPatch, reason: string): WorkerFsmResult {
  const from = statusOf(input.member)
  return {
    ok: true,
    from,
    to,
    event: input.event,
    patch: { status: to, ...patch },
    reason,
    error: patch.lastError,
  }
}

/**
 * Pure worker status transition helper for the phase-1 migration.
 *
 * It intentionally returns only a patch/result; callers remain responsible for
 * persistence and for preserving public API behavior while call-sites migrate.
 */
export function transitionWorkerFsm(input: WorkerFsmInput): WorkerFsmResult {
  const from = statusOf(input.member)
  switch (input.event) {
    case 'spawnReserved': {
      const reason = input.reason ?? 'worker spawn reserved'
      return result(input, 'pending_delivery', { lastWakeReason: reason, lastError: undefined }, reason)
    }
    case 'bridgeLeasePublished': {
      const to = from === 'pending_delivery' ? 'pending_delivery' : runningPreservingStatus(from, 'idle')
      const reason = input.reason ?? (to === 'pending_delivery' ? 'bridge ready; delivery pending' : 'bridge lease published')
      return result(input, to, {
        bridgeAvailable: true,
        bridgeLastError: undefined,
        lastWakeReason: reason,
        lastError: undefined,
      }, reason)
    }
    case 'bridgeUnavailable': {
      const error = input.error ?? input.reason ?? 'bridge unavailable'
      const to: WorkerFsmStatus = input.hasPendingDelivery ? 'pending_delivery' : 'offline'
      const reason = input.reason ?? error
      return result(input, to, {
        bridgeAvailable: false,
        bridgeLastError: error,
        lastWakeReason: reason,
        lastError: error,
      }, reason)
    }
    case 'deliveryRequested': {
      const to = runningPreservingStatus(from, 'pending_delivery')
      const reason = from === 'running'
        ? 'bridge delivery pending while running'
        : (input.reason ?? 'bridge delivery request pending')
      return result(input, to, { lastWakeReason: reason, lastError: undefined }, reason)
    }
    case 'deliverySubmitted': {
      const to = runningPreservingStatus(from, 'queued')
      const reason = from === 'running'
        ? 'bridge delivery pending while running'
        : (input.reason ?? 'bridge submitted prompt')
      return result(input, to, {
        bridgeAvailable: input.member?.bridgeAvailable,
        bridgeLastError: undefined,
        lastWakeReason: reason,
        lastError: undefined,
      }, reason)
    }
    case 'agentStarted': {
      const reason = input.reason ?? 'bridge delivery started'
      return result(input, 'running', { lastWakeReason: reason, lastError: undefined }, reason)
    }
    case 'agentEnded': {
      const busy = input.hasPendingNative || input.nativeIdle === false || input.hasActiveDelivery
      const to: WorkerFsmStatus = busy ? 'draining' : input.hasPendingDelivery ? 'pending_delivery' : 'idle'
      const reason = input.reason ?? (to === 'idle'
        ? 'finished turn'
        : to === 'pending_delivery'
          ? 'bridge delivery pending after turn'
          : 'bridge draining after turn')
      return result(input, to, { lastWakeReason: reason, lastError: undefined }, reason)
    }
    case 'nativeBusy': {
      const reason = input.reason ?? 'bridge delivery pending; native session busy'
      return result(input, 'pending_delivery', { lastWakeReason: reason, lastError: undefined }, reason)
    }
    case 'deliveryFailed': {
      const error = input.error ?? input.member?.lastError ?? 'bridge delivery failed'
      const to = runningPreservingStatus(from, 'queued')
      const reason = input.reason ?? 'bridge delivery failed'
      return result(input, to, {
        bridgeAvailable: false,
        bridgeLastError: error,
        lastWakeReason: reason,
        lastError: error,
      }, reason)
    }
    case 'paneLost': {
      const error = input.error ?? 'tmux pane disappeared'
      const reason = input.reason ?? 'pane lost'
      return result(input, 'error', {
        bridgeAvailable: false,
        bridgeLastError: error,
        lastWakeReason: reason,
        lastError: error,
      }, reason)
    }
    case 'sessionShutdown': {
      const reason = input.reason ?? 'normal_shutdown'
      const to = from === 'error' ? 'error' : 'offline'
      const bridgeLastError = input.error ?? input.member?.bridgeLastError
      return result(input, to, {
        bridgeAvailable: false,
        bridgeLastError,
        lastWakeReason: input.member?.lastWakeReason,
        lastError: input.member?.lastError,
      }, reason)
    }
    case 'manualRecovered': {
      const reason = input.reason ?? 'manual recovery'
      return result(input, 'idle', {
        bridgeAvailable: input.member?.bridgeAvailable,
        bridgeLastError: undefined,
        lastWakeReason: reason,
        lastError: undefined,
      }, reason)
    }
    default: {
      const exhaustive: never = input.event
      return result({ ...input, event: exhaustive }, from, {}, 'unknown worker FSM event')
    }
  }
}
