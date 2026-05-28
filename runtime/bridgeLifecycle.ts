import { getBridgeLease } from '../state/bridgeStore.js'
import { markMailboxMessagesDelivered } from '../state/mailboxStore.js'
import { activeClaim, readDeliveryRequestStore, requestHasExpired } from '../state/deliveryStore.js'
import { readTeamState } from '../state/teamStore.js'
import { TEAM_LEAD } from '../internalTypes.js'
import type { DeliveryRequestState } from '../internalTypes.js'
import { transitionWorkerFsm } from './workerFsm.js'
import { updateBridgeMemberState } from './bridgeShared.js'
import type { BridgeLifecycleContext, BridgeLifecycleResult } from './bridgeTypes.js'
import { markLatestDeliveryCompleted, markLatestDeliveryStarted } from './deliveryRequestService.js'

function activeBridgeDeliveryRequests(teamName: string, memberName: string, now = Date.now()): DeliveryRequestState[] {
  return Object.values(readDeliveryRequestStore(teamName).requests)
    .filter(request => request.memberName === memberName && Boolean(activeClaim(request, now)))
}

function pendingBridgeDeliveryRequests(teamName: string, memberName: string, now = Date.now()): DeliveryRequestState[] {
  return Object.values(readDeliveryRequestStore(teamName).requests)
    .filter(request => request.memberName === memberName && request.status === 'pending' && !requestHasExpired(request, now))
}

export function markBridgeAgentStart(teamName: string, memberName: string, now = Date.now()): BridgeLifecycleResult {
  const team = readTeamState(teamName)
  const member = team?.members[memberName]
  if (!team || !member || member.name === TEAM_LEAD) return { reason: 'member not found or leader' }
  const lease = getBridgeLease(teamName, memberName)
  const startedResult = markLatestDeliveryStarted({
    teamName,
    memberName,
    bridgeId: lease?.bridgeId,
    generation: lease?.generation,
    now,
  })
  const request = startedResult.ok
    ? startedResult.request
    : markLatestDeliveryStarted({ teamName, memberName, now }).request
  if (request?.messageIds.length) {
    markMailboxMessagesDelivered(teamName, memberName, request.messageIds)
  }
  updateBridgeMemberState(teamName, memberName, member => {
    Object.assign(member, transitionWorkerFsm({
      member,
      event: 'agentStarted',
      reason: request ? 'bridge delivery started' : 'processing prompt',
    }).patch)
    if (request) {
      member.bridgeLastDeliveryAt = now
      member.bridgeLastError = undefined
    }
  }, now)
  return { request, status: 'running', reason: request ? 'bridge delivery started' : 'processing prompt' }
}

export function markBridgeAgentEnd(
  teamName: string,
  memberName: string,
  ctx: BridgeLifecycleContext = {},
  now = Date.now(),
): BridgeLifecycleResult {
  const team = readTeamState(teamName)
  const member = team?.members[memberName]
  if (!team || !member || member.name === TEAM_LEAD) return { reason: 'member not found or leader' }
  const completedResult = markLatestDeliveryCompleted({ teamName, memberName, now })
  const completed = completedResult.ok ? completedResult.request : null
  const hasPendingNative = typeof ctx.hasPendingMessages === 'function' && ctx.hasPendingMessages()
  const nativeIdle = typeof ctx.isIdle === 'function' ? ctx.isIdle() : true
  const active = activeBridgeDeliveryRequests(teamName, memberName, now)
  const pending = pendingBridgeDeliveryRequests(teamName, memberName, now)
  const fsm = transitionWorkerFsm({
    member,
    event: 'agentEnded',
    hasPendingNative,
    nativeIdle,
    hasActiveDelivery: active.length > 0,
    hasPendingDelivery: pending.length > 0,
  })
  updateBridgeMemberState(teamName, memberName, member => {
    Object.assign(member, fsm.patch)
    if (completed) {
      member.bridgeLastError = undefined
      member.bridgeLastDeliveryAt = now
    }
  }, now)
  return { request: completed, status: fsm.to, reason: fsm.reason }
}
