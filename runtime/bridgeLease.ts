import type { BridgeLeaseState, TeamState } from '../internalTypes.js'
import { TEAM_LEAD } from '../internalTypes.js'
import {
  bridgeLeaseIsFresh,
  getBridgeLease,
  removeBridgeLease,
  staleBridge,
  updateBridgeLeaseStore,
  upsertBridgeLease,
} from '../state/bridgeStore.js'
import { readTeamState } from '../state/teamStore.js'
import { transitionWorkerFsm } from './workerFsm.js'
import { updateBridgeMemberState } from './bridgeShared.js'
import {
  BRIDGE_CAPABILITIES,
  BRIDGE_HEARTBEAT_MS,
  BRIDGE_PACKAGE_VERSION,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SEEN_MIN_UPDATE_MS,
  BRIDGE_VERSION,
} from './bridgeConstants.js'

function processIdentity(startedAt: number): string {
  return `pid:${process.pid}:started:${startedAt}`
}

function createBridgeId(input: { teamName: string; memberName: string; sessionFile: string; startedAt: number; generation: number }): string {
  const nonce = Math.random().toString(36).slice(2, 10)
  return [input.teamName, input.memberName, input.generation, process.pid, input.startedAt, nonce].join(':')
}

function leaseGeneration(existing: BridgeLeaseState | null | undefined): number {
  return existing ? existing.generation + 1 : 1
}

function buildLease(input: {
  teamName: string
  memberName: string
  sessionFile: string
  existing?: BridgeLeaseState | null
  now?: number
}): BridgeLeaseState {
  const now = input.now ?? Date.now()
  const generation = leaseGeneration(input.existing)
  return {
    memberName: input.memberName,
    bridgeId: createBridgeId({ ...input, startedAt: now, generation }),
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    packageVersion: BRIDGE_PACKAGE_VERSION,
    sessionFile: input.sessionFile,
    pid: process.pid,
    processIdentity: processIdentity(now),
    startedAt: now,
    lastSeenAt: now,
    expiresAt: now + BRIDGE_HEARTBEAT_MS * 4,
    generation,
    capabilities: [...BRIDGE_CAPABILITIES],
  }
}

function mirrorBridgeLeaseToMember(teamName: string, memberName: string, lease: BridgeLeaseState, now = Date.now()): void {
  updateBridgeMemberState(teamName, memberName, member => {
    Object.assign(member, transitionWorkerFsm({ member, event: 'bridgeLeasePublished' }).patch)
    member.bridgeVersion = BRIDGE_VERSION
    member.bridgeLastSeenAt = lease.lastSeenAt
    member.bridgeLastError = lease.lastError
  }, now)
}

export function bridgeLeaseReadyForMember(
  team: TeamState,
  memberName: string,
  lease: BridgeLeaseState | null | undefined,
  now = Date.now(),
): boolean {
  const member = team.members[memberName]
  if (!member || member.name === TEAM_LEAD) return false
  return bridgeLeaseIsFresh(lease, {
    memberName,
    sessionFile: member.sessionFile,
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    packageVersion: BRIDGE_PACKAGE_VERSION,
    now,
  })
}

export function isBridgeFresh(
  member: TeamState['members'][string] | undefined,
  now = Date.now(),
  lease?: BridgeLeaseState | null,
): boolean {
  if (!member || member.name === TEAM_LEAD) return false
  if (!lease) return false
  return bridgeLeaseIsFresh(lease, {
    memberName: member.name,
    sessionFile: member.sessionFile,
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    packageVersion: BRIDGE_PACKAGE_VERSION,
    now,
  })
}

export function publishBridgeLease(input: {
  teamName: string
  memberName: string
  sessionFile: string
  now?: number
}): BridgeLeaseState | null {
  if (!input.teamName || !input.memberName || input.memberName === TEAM_LEAD || !input.sessionFile) return null
  const team = readTeamState(input.teamName)
  const member = team?.members[input.memberName]
  if (!member || member.sessionFile !== input.sessionFile) return null
  const existing = getBridgeLease(input.teamName, input.memberName)
  const lease = upsertBridgeLease(input.teamName, buildLease({ ...input, existing }))
  mirrorBridgeLeaseToMember(input.teamName, input.memberName, lease, input.now ?? lease.lastSeenAt)
  return lease
}

export function heartbeatBridgeLease(input: {
  teamName: string
  memberName: string
  bridgeId: string
  generation: number
  sessionFile: string
  now?: number
}): BridgeLeaseState | null {
  const now = input.now ?? Date.now()
  const team = readTeamState(input.teamName)
  const member = team?.members[input.memberName]
  if (!member || member.sessionFile !== input.sessionFile) return null
  let heartbeat: BridgeLeaseState | null = null
  updateBridgeLeaseStore(input.teamName, state => {
    const lease = state.leases[input.memberName]
    if (!bridgeLeaseIsFresh(lease, {
      memberName: input.memberName,
      sessionFile: input.sessionFile,
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      packageVersion: BRIDGE_PACKAGE_VERSION,
      bridgeId: input.bridgeId,
      generation: input.generation,
      now,
    })) {
      return
    }
    lease.lastSeenAt = now
    lease.expiresAt = now + BRIDGE_HEARTBEAT_MS * 4
    lease.lastError = undefined
    heartbeat = lease
  })
  if (heartbeat && now - (readTeamState(input.teamName)?.members[input.memberName]?.bridgeLastSeenAt ?? 0) >= BRIDGE_SEEN_MIN_UPDATE_MS) {
    mirrorBridgeLeaseToMember(input.teamName, input.memberName, heartbeat, now)
  }
  return heartbeat
}

export function markBridgeSeen(teamName: string, memberName: string, now = Date.now()): void {
  const team = readTeamState(teamName)
  const member = team?.members[memberName]
  if (!team || !member || member.name === TEAM_LEAD) return
  const lease = getBridgeLease(teamName, memberName)
  if (!bridgeLeaseReadyForMember(team, memberName, lease, now)) return
  heartbeatBridgeLease({
    teamName,
    memberName,
    bridgeId: lease!.bridgeId,
    generation: lease!.generation,
    sessionFile: member.sessionFile,
    now,
  })
}

export function markBridgeStopped(teamName: string, memberName: string, now = Date.now(), reason = 'normal_shutdown'): void {
  const removed = removeBridgeLease(teamName, memberName)
  updateBridgeMemberState(teamName, memberName, member => {
    Object.assign(member, transitionWorkerFsm({
      member,
      event: 'sessionShutdown',
      reason,
      error: removed?.lastError ?? (reason === 'normal_shutdown' ? undefined : reason),
    }).patch)
    member.bridgeVersion = BRIDGE_VERSION
    member.bridgeLastSeenAt = now
    if (!removed?.lastError && reason === 'normal_shutdown' && !member.lastError) {
      member.bridgeLastError = undefined
    }
  }, now)
}

export function expireStaleBridgeLeases(teamName: string, now = Date.now()): BridgeLeaseState[] {
  const expired: BridgeLeaseState[] = []
  updateBridgeLeaseStore(teamName, state => {
    for (const [memberName, lease] of Object.entries(state.leases)) {
      if (!staleBridge(lease, now)) continue
      expired.push(lease)
      delete state.leases[memberName]
    }
  })
  for (const lease of expired) {
    updateBridgeMemberState(teamName, lease.memberName, member => {
      Object.assign(member, transitionWorkerFsm({
        member,
        event: 'bridgeUnavailable',
        reason: lease.lastError ?? 'bridge lease expired',
        error: lease.lastError ?? 'bridge lease expired',
        hasPendingDelivery: member.status === 'pending_delivery',
      }).patch)
      member.bridgeVersion = BRIDGE_VERSION
      member.bridgeLastSeenAt = lease.lastSeenAt
    }, now)
  }
  return expired
}
