import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import {
  attachCurrentSessionIfNeeded,
  buildSessionStatusKey,
  refreshForSession,
} from './session.js'
import { createLeaderProjectionService } from '../../runtime/leaderProjectionService.js'
import type { LeaderMailboxProjectionWatcher } from '../../runtime/leaderProjectionService.js'
import { runOutboxMaintenanceForContext, type OutboxMaintenanceDeps } from '../../runtime/outboxMaintenance.js'
import {
  requestLeaderAttentionIfNeeded,
  requestWorkerDelivery,
} from '../bridge/delivery.js'

export type RuntimeHookState = {
  lastLeaderDigestKey: string
  lastLeaderDigestAt: number
  lastBlockedCountForDigest: number
  lastBlockedFingerprintsForDigest: string[]
}

type RuntimeService = {
  hookState: RuntimeHookState
  updateDigestState: (patch: Partial<RuntimeHookState>) => void
  attachCurrentSessionIfNeeded: typeof attachCurrentSessionIfNeeded
  refreshStatus: (ctx: ExtensionContext, options?: { forceReconcile?: boolean }) => void
  invalidateStatus: (ctx: ExtensionContext) => void
  runMailboxSync: (ctx: ExtensionContext) => void
  runOutboxMaintenance: (ctx: ExtensionContext) => void
  startLeaderMailboxProjectionWatcher: (ctx: ExtensionContext, attached?: ReturnType<typeof attachCurrentSessionIfNeeded>) => LeaderMailboxProjectionWatcher | null
  stopLeaderMailboxProjectionWatcher: (ctx: ExtensionContext) => void
  resetMailboxSyncKey: () => void
}

export function createRuntimeService(pi: ExtensionAPI): RuntimeService {
  const leaderProjectionService = createLeaderProjectionService(pi)
  const outboxMaintenanceDeps: OutboxMaintenanceDeps = {
    requestWorkerDelivery,
    requestLeaderAttentionIfNeeded,
  }
  let lastStatusKey = ''

  const hookState: RuntimeHookState = {
    lastLeaderDigestKey: '',
    lastLeaderDigestAt: 0,
    lastBlockedCountForDigest: 0,
    lastBlockedFingerprintsForDigest: [],
  }

  function updateDigestState(patch: Partial<RuntimeHookState>): void {
    Object.assign(hookState, patch)
  }

  function refreshStatus(ctx: ExtensionContext, options?: { forceReconcile?: boolean }): void {
    runOutboxMaintenanceForContext(ctx, outboxMaintenanceDeps)
    const attached = attachCurrentSessionIfNeeded(ctx)
    leaderProjectionService.startLeaderMailboxProjectionWatcher(ctx, attached)
    const statusKey = buildSessionStatusKey(ctx, attached)
    if (statusKey === lastStatusKey && !options?.forceReconcile) return
    lastStatusKey = statusKey
    refreshForSession(ctx, attached, options)
  }

  function invalidateStatus(ctx: ExtensionContext): void {
    lastStatusKey = ''
    refreshStatus(ctx, { forceReconcile: true })
  }

  return {
    hookState,
    updateDigestState,
    attachCurrentSessionIfNeeded,
    refreshStatus,
    invalidateStatus,
    runMailboxSync: leaderProjectionService.runMailboxSync,
    runOutboxMaintenance: ctx => runOutboxMaintenanceForContext(ctx, outboxMaintenanceDeps),
    startLeaderMailboxProjectionWatcher: leaderProjectionService.startLeaderMailboxProjectionWatcher,
    stopLeaderMailboxProjectionWatcher: leaderProjectionService.stopLeaderMailboxProjectionWatcher,
    resetMailboxSyncKey: leaderProjectionService.resetMailboxSyncKey,
  }
}
