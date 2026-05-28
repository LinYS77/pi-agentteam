import { getBridgeLease } from '../state/bridgeStore.js'
import { readTeamState } from '../state/teamStore.js'
import type { DeliveryRequestState } from '../internalTypes.js'
import { transitionWorkerFsm } from './workerFsm.js'
import { BRIDGE_VERSION } from './bridgeConstants.js'
import { bridgeLeaseReadyForMember } from './bridgeLease.js'
import { updateBridgeMemberState } from './bridgeShared.js'
import { requestOrRefreshDelivery } from './deliveryRequestService.js'

const DELIVERY_REQUEST_TTL_MS = 5 * 60_000

export function createBridgeDeliveryRequest(
  teamName: string,
  memberName: string,
  input: { messageIds?: string[]; bootPrompt?: string; requestedBy?: string; reason?: string; now?: number; markWorkRequested?: boolean } = {},
): DeliveryRequestState {
  const now = input.now ?? Date.now()
  const result = requestOrRefreshDelivery({
    teamName,
    memberName,
    messageIds: input.messageIds ?? [],
    bootPrompt: input.bootPrompt,
    requestedBy: input.requestedBy,
    reason: input.reason ?? 'bridge delivery requested',
    expiresAt: now + DELIVERY_REQUEST_TTL_MS,
    now,
  })
  if (!result.ok) throw new Error(result.reason)
  const request = result.request
  if (input.markWorkRequested !== false) {
    markBridgeWorkRequested(teamName, memberName, {
      messageIds: request.messageIds,
      bootPrompt: request.bootPrompt,
      requestId: request.requestId,
    }, now)
  }
  return request
}

export function markBridgeWorkRequested(
  teamName: string,
  memberName: string,
  input: { messageIds: string[]; bootPrompt?: string; requestId?: string },
  now = Date.now(),
): void {
  const team = readTeamState(teamName)
  const member = team?.members[memberName]
  const lease = team && member ? getBridgeLease(teamName, memberName) : null
  updateBridgeMemberState(teamName, memberName, member => {
    member.bridgeAvailable = Boolean(team && bridgeLeaseReadyForMember(team, memberName, lease, now))
    member.bridgeVersion = BRIDGE_VERSION
    member.bridgeWorkRequestedAt = now
    member.bridgeWorkRequestCount = (member.bridgeWorkRequestCount ?? 0) + 1
    member.bridgeWorkRequestMessageIds = [...input.messageIds]
    member.bridgeWorkRequestBootPrompt = input.bootPrompt
    Object.assign(member, transitionWorkerFsm({
      member,
      event: 'deliveryRequested',
      reason: input.messageIds.length > 0 ? 'bridge delivery request pending' : 'bridge task delivery requested',
    }).patch)
    member.bridgeLastError = undefined
  }, now)
}
