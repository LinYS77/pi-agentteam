import { getBridgeLease } from '../state/bridgeStore.js'
import { peekUnreadMailbox } from '../state/mailboxStore.js'
import {
  promptHashForParts,
  readDeliveryRequestStore,
  requestHasExpired,
} from '../state/deliveryStore.js'
import { readTeamState, updateMemberStatus, updateTeamState } from '../state/teamStore.js'
import { TEAM_LEAD } from '../internalTypes.js'
import type { DeliveryRequestState, MailboxMessage, TeamState } from '../internalTypes.js'
import { undeliveredMailboxMessages } from '../messageLifecycle.js'
import { buildWorkerTurnPrompt } from '../workerTurnPrompt.js'
import { transitionWorkerFsm } from './workerFsm.js'
import { BRIDGE_VERSION } from './bridgeConstants.js'
import { bridgeLeaseReadyForMember, heartbeatBridgeLease } from './bridgeLease.js'
import { clearBridgeRequestState, updateBridgeMemberState } from './bridgeShared.js'
import type { BridgeNativeContext, BridgePumpInput, BridgePumpResult } from './bridgeTypes.js'
import { claimNextDelivery, maintainDeliveryRequests, markDeliveryFailed, markDeliverySubmitted } from './deliveryRequestService.js'

const DELIVERY_CLAIM_TTL_MS = 30_000
export const BRIDGE_TASK_REQUEST_REASON = 'bridge task delivery requested'

export function buildBridgeTurnPrompt(
  team: TeamState,
  memberName: string,
  explicitTask: string | undefined,
  unreadMessagesForPrompt: MailboxMessage[],
  options?: { allowAssignedTaskTrigger?: boolean },
): string | null {
  return buildWorkerTurnPrompt(team, memberName, {
    explicitInstruction: explicitTask,
    unreadMessages: unreadMessagesForPrompt,
    allowAssignedTaskTrigger: options?.allowAssignedTaskTrigger,
  })
}

async function submitBridgePrompt(ctx: BridgeNativeContext, prompt: string, request: DeliveryRequestState): Promise<void> {
  const hasPending = typeof ctx.hasPendingMessages === 'function' && ctx.hasPendingMessages()
  const idle = typeof ctx.isIdle === 'function'
    ? ctx.isIdle() && !hasPending
    : !hasPending
  if (!idle) throw new Error('worker is busy; bridge delivery remains pending')
  const details = {
    source: 'agentteam-bridge',
    requestId: request.requestId,
    claimId: request.claim?.claimId,
    messageIds: request.claim?.messageIds ?? request.messageIds,
    promptHash: request.claim?.promptHash ?? request.promptHash,
  }
  if (typeof ctx.sendUserMessage === 'function') {
    await ctx.sendUserMessage(prompt)
    return
  }
  if (typeof ctx.sendMessage === 'function') {
    await ctx.sendMessage(
      {
        customType: 'agentteam-bridge-delivery',
        content: prompt,
        display: true,
        details,
      },
      { triggerTurn: true },
    )
    return
  }
  throw new Error('pi-native delivery API unavailable')
}

function recordBridgeFailure(teamName: string, memberName: string, error: string, now = Date.now()): void {
  updateBridgeMemberState(teamName, memberName, member => {
    member.bridgeAvailable = false
    member.bridgeVersion = BRIDGE_VERSION
    member.bridgeLastSeenAt = now
    clearBridgeRequestState(member)
    Object.assign(member, transitionWorkerFsm({ member, event: 'deliveryFailed', error }).patch)
  }, now)
}

function livePreSubmitRequests(teamName: string, memberName: string, now = Date.now()): DeliveryRequestState[] {
  return Object.values(readDeliveryRequestStore(teamName).requests)
    .filter(request => {
      if (request.memberName !== memberName) return false
      if (request.status !== 'pending' && request.status !== 'claimed') return false
      return !requestHasExpired(request, now)
    })
}

function liveSubmittedOrStartedRequests(teamName: string, memberName: string): DeliveryRequestState[] {
  return Object.values(readDeliveryRequestStore(teamName).requests)
    .filter(request => request.memberName === memberName && (request.status === 'submitted' || request.status === 'started'))
}

export function maintainBridgeDeliveryRequests(teamName: string, memberName: string, now = Date.now()): void {
  const maintenance = maintainDeliveryRequests({ teamName, memberName, now })
  const live = livePreSubmitRequests(teamName, memberName, now)
  const activeSubmittedOrStarted = liveSubmittedOrStartedRequests(teamName, memberName)
  if (live.length === 0 && activeSubmittedOrStarted.length > 0) {
    const member = readTeamState(teamName)?.members[memberName]
    if (!member) return
    if (member.bridgeWorkRequestedAt === undefined && member.bridgeWorkRequestMessageIds === undefined && member.bridgeWorkRequestBootPrompt === undefined) return
    updateBridgeMemberState(teamName, memberName, current => {
      clearBridgeRequestState(current)
      current.bridgeLastError = undefined
    }, now)
    return
  }
  if (maintenance.expired.length === 0 && maintenance.recovered.length === 0 && live.length === 0) return
  updateBridgeMemberState(teamName, memberName, member => {
    if (live.length === 0) {
      clearBridgeRequestState(member)
      if (activeSubmittedOrStarted.length === 0 && (member.status === 'pending_delivery' || member.status === 'queued')) {
        Object.assign(member, transitionWorkerFsm({ member, event: 'manualRecovered', reason: 'delivery request maintenance cleared pending bridge work' }).patch)
      }
      return
    }
    const liveIds = [...new Set(live.flatMap(request => request.messageIds))]
    const bootPrompt = live.find(request => request.bootPrompt)?.bootPrompt
    member.bridgeWorkRequestedAt = Math.max(...live.map(request => request.updatedAt))
    member.bridgeWorkRequestMessageIds = liveIds
    member.bridgeWorkRequestBootPrompt = bootPrompt
    member.bridgeLastError = undefined
    Object.assign(member, transitionWorkerFsm({
      member,
      event: 'deliveryRequested',
      reason: liveIds.length > 0 ? 'bridge delivery request pending' : BRIDGE_TASK_REQUEST_REASON,
    }).patch)
  }, now)
}

function recordBridgeSubmitted(
  teamName: string,
  memberName: string,
  request: DeliveryRequestState,
  now = Date.now(),
): void {
  const team = readTeamState(teamName)
  const lease = getBridgeLease(teamName, memberName)
  updateBridgeMemberState(teamName, memberName, (member, latestTeam) => {
    const bridgeReady = bridgeLeaseReadyForMember(team ?? latestTeam, memberName, lease, now)
    Object.assign(member, {
      ...transitionWorkerFsm({ member, event: 'deliverySubmitted' }).patch,
      bridgeVersion: BRIDGE_VERSION,
      bridgeLastSeenAt: now,
      bridgeAvailable: bridgeReady,
      bridgeLastDeliveryAt: now,
      bootPrompt: undefined,
    })
    const claimedIds = request.claim?.messageIds ?? request.messageIds
    const remainingIds = member.bridgeWorkRequestMessageIds?.filter(id => !claimedIds.includes(id)) ?? []
    if (remainingIds.length > 0) {
      member.bridgeWorkRequestMessageIds = remainingIds
    } else {
      clearBridgeRequestState(member)
    }
  }, now)
}

type ActiveBridgePump = {
  promise: Promise<BridgePumpResult>
  rerunRequested: boolean
}

const activeBridgePumps = new Map<string, ActiveBridgePump>()

function scopedBridgeKey(...parts: string[]): string {
  return JSON.stringify(parts)
}

function bridgePumpKey(input: Pick<BridgePumpInput, 'teamName' | 'memberName'>): string {
  return scopedBridgeKey(input.teamName, input.memberName)
}

async function pumpBridgeOnceUnlocked(input: BridgePumpInput): Promise<BridgePumpResult> {
  const now = input.now ?? Date.now()
  maintainBridgeDeliveryRequests(input.teamName, input.memberName, now)
  const team = readTeamState(input.teamName)
  if (!team) {
    return { ok: false, method: 'bridge', reason: 'team not found', deliveredMessageIds: [] }
  }
  const member = team.members[input.memberName]
  if (!member || member.name === TEAM_LEAD) {
    return { ok: false, method: 'bridge', reason: 'member not found or leader', deliveredMessageIds: [] }
  }

  const lease = getBridgeLease(team.name, member.name)
  if (!bridgeLeaseReadyForMember(team, member.name, lease, now)) {
    return { ok: false, method: 'bridge', reason: 'bridge lease unavailable or stale', deliveredMessageIds: [] }
  }
  if (member.status === 'running' || member.status === 'draining' || member.status === 'error') {
    updateMemberStatus(team, member.name, {
      lastWakeReason: 'bridge delivery pending; worker not idle',
      lastError: undefined,
    })
    updateTeamState(team.name, latest => {
      updateMemberStatus(latest, member.name, {
        lastWakeReason: 'bridge delivery pending; worker not idle',
        lastError: undefined,
      })
    })
    return { ok: false, method: 'bridge', reason: 'worker not idle for bridge delivery', deliveredMessageIds: [] }
  }
  const requests = Object.values(readDeliveryRequestStore(team.name).requests)
    .filter(request => request.memberName === member.name && request.status === 'pending' && !requestHasExpired(request, now))
    .sort((a, b) => a.createdAt - b.createdAt)
  if (requests.length === 0) {
    return { ok: false, method: 'bridge', reason: 'no pending bridge delivery request', deliveredMessageIds: [] }
  }
  const promptMessages = undeliveredMailboxMessages(peekUnreadMailbox(team.name, member.name))
    .filter(message => requests.some(request => request.messageIds.includes(message.id)))
  const requestedIds = new Set(requests.flatMap(request => request.messageIds))
  const requestedPromptMessages = promptMessages.filter(message => requestedIds.has(message.id))
  const bootPrompt = requests.find(request => request.bootPrompt)?.bootPrompt
  const explicitTask = bootPrompt ?? member.bootPrompt ?? (member.lastWakeReason === BRIDGE_TASK_REQUEST_REASON ? member.bootPrompt : undefined)
  const prompt = buildBridgeTurnPrompt(team, member.name, explicitTask, requestedPromptMessages, {
    allowAssignedTaskTrigger: Boolean(explicitTask || member.lastWakeReason === BRIDGE_TASK_REQUEST_REASON),
  })
  if (!prompt) {
    return { ok: false, method: 'bridge', reason: 'no prompt-worthy bridge work', deliveredMessageIds: [] }
  }
  const hasPendingNative = typeof input.ctx.hasPendingMessages === 'function' && input.ctx.hasPendingMessages()
  const idleNative = typeof input.ctx.isIdle === 'function' ? input.ctx.isIdle() : true
  if (!idleNative || hasPendingNative) {
    updateTeamState(team.name, latest => {
      const latestMember = latest.members[member.name] ?? member
      updateMemberStatus(latest, member.name, transitionWorkerFsm({ member: latestMember, event: 'nativeBusy' }).patch)
    })
    return { ok: false, method: 'bridge', reason: 'native session busy for bridge delivery', deliveredMessageIds: [] }
  }
  const messageIds = requestedPromptMessages.map(msg => msg.id)
  const promptHash = promptHashForParts(messageIds, prompt)
  const claimedResult = claimNextDelivery({
    teamName: team.name,
    memberName: member.name,
    bridgeId: lease!.bridgeId,
    generation: lease!.generation,
    promptHash,
    messageIds,
    claimTtlMs: DELIVERY_CLAIM_TTL_MS,
    now,
  })
  if (!claimedResult.ok || !claimedResult.request?.claim) {
    return { ok: false, method: 'bridge', reason: claimedResult.reason, deliveredMessageIds: [] }
  }
  const claimed = claimedResult.request
  const claim = claimed.claim
  if (!claim) {
    return { ok: false, method: 'bridge', reason: 'delivery request already claimed', deliveredMessageIds: [] }
  }

  heartbeatBridgeLease({
    teamName: team.name,
    memberName: member.name,
    bridgeId: lease!.bridgeId,
    generation: lease!.generation,
    sessionFile: member.sessionFile,
    now,
  })

  try {
    await submitBridgePrompt(input.ctx, prompt, claimed)
    const submittedResult = markDeliverySubmitted(team.name, claimed.requestId, {
      claimId: claim.claimId,
      now,
    })
    if (!submittedResult.ok || submittedResult.request.status !== 'submitted') {
      return { ok: false, method: 'bridge', reason: submittedResult.reason, deliveredMessageIds: [] }
    }
    const submitted = submittedResult.request
    recordBridgeSubmitted(team.name, member.name, submitted, now)
    return {
      ok: true,
      method: 'bridge',
      reason: 'bridge submitted prompt',
      prompt,
      deliveredMessageIds: [],
      queued: false,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    markDeliveryFailed(team.name, claimed.requestId, {
      claimId: claim.claimId,
      now,
      error: message,
    })
    recordBridgeFailure(team.name, member.name, message, now)
    return {
      ok: false,
      method: 'bridge',
      reason: 'bridge delivery failed',
      error: message,
      deliveredMessageIds: [],
    }
  }
}

export async function pumpBridgeOnce(input: BridgePumpInput): Promise<BridgePumpResult> {
  const key = bridgePumpKey(input)
  const existing = activeBridgePumps.get(key)
  if (existing) {
    existing.rerunRequested = true
    await existing.promise
    return { ok: false, method: 'bridge', reason: 'bridge delivery request already claimed', deliveredMessageIds: [] }
  }

  const active: ActiveBridgePump = {
    promise: pumpBridgeOnceUnlocked(input),
    rerunRequested: false,
  }
  activeBridgePumps.set(key, active)
  try {
    let result = await active.promise
    while (active.rerunRequested) {
      active.rerunRequested = false
      active.promise = pumpBridgeOnceUnlocked(input)
      const rerun = await active.promise
      result = rerun.ok ? rerun : result
    }
    return result
  } finally {
    activeBridgePumps.delete(key)
  }
}
