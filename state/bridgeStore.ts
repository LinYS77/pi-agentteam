import type { BridgeLeaseState } from '../internalTypes.js'
import { readRuntimeSection, updateRuntimeSection } from './runtimeStore.js'

export const BRIDGE_LEASE_STATE_VERSION = 1

export type BridgeLeaseStoreState = {
  version: 1
  leases: Record<string, BridgeLeaseState>
}

export type BridgeLeaseFreshnessInput = {
  memberName: string
  sessionFile: string
  protocolVersion: number
  packageVersion?: string
  bridgeId?: string
  generation?: number
  now?: number
}

function emptyBridgeLeaseStore(): BridgeLeaseStoreState {
  return { version: BRIDGE_LEASE_STATE_VERSION, leases: {} }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => String(item ?? '').trim()).filter(Boolean)
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeLease(raw: unknown): BridgeLeaseState | null {
  if (!isObjectRecord(raw)) return null
  const memberName = typeof raw.memberName === 'string' ? raw.memberName.trim() : ''
  const bridgeId = typeof raw.bridgeId === 'string' ? raw.bridgeId.trim() : ''
  const sessionFile = typeof raw.sessionFile === 'string' ? raw.sessionFile : ''
  if (!memberName || !bridgeId || !sessionFile) return null
  const now = Date.now()
  return {
    memberName,
    bridgeId,
    protocolVersion: numberValue(raw.protocolVersion, 1),
    packageVersion: typeof raw.packageVersion === 'string' ? raw.packageVersion : undefined,
    sessionFile,
    pid: typeof raw.pid === 'number' && Number.isFinite(raw.pid) ? raw.pid : undefined,
    processIdentity: typeof raw.processIdentity === 'string' ? raw.processIdentity : undefined,
    startedAt: numberValue(raw.startedAt, now),
    lastSeenAt: numberValue(raw.lastSeenAt, now),
    expiresAt: numberValue(raw.expiresAt, 0),
    generation: numberValue(raw.generation, 1),
    capabilities: stringArray(raw.capabilities),
    lastError: typeof raw.lastError === 'string' ? raw.lastError : undefined,
  }
}

export function normalizeBridgeLeaseStore(raw: unknown): BridgeLeaseStoreState {
  if (!isObjectRecord(raw)) return emptyBridgeLeaseStore()
  const out = emptyBridgeLeaseStore()
  const rawLeases = isObjectRecord(raw.leases) ? raw.leases : {}
  for (const rawLease of Object.values(rawLeases)) {
    const lease = normalizeLease(rawLease)
    if (!lease) continue
    out.leases[lease.memberName] = lease
  }
  return out
}

export function readBridgeLeaseStore(teamName: string): BridgeLeaseStoreState {
  return readRuntimeSection(teamName, 'bridge', normalizeBridgeLeaseStore)
}

export function updateBridgeLeaseStore(
  teamName: string,
  updater: (state: BridgeLeaseStoreState) => void | BridgeLeaseStoreState,
): BridgeLeaseStoreState {
  return updateRuntimeSection(teamName, 'bridge', normalizeBridgeLeaseStore, updater).section
}

export function upsertBridgeLease(teamName: string, lease: BridgeLeaseState): BridgeLeaseState {
  const normalized = normalizeLease(lease)
  if (!normalized) throw new Error('Invalid bridge lease')
  updateBridgeLeaseStore(teamName, state => {
    state.leases[normalized.memberName] = normalized
  })
  return normalized
}

export function getBridgeLease(teamName: string, memberName: string): BridgeLeaseState | null {
  return readBridgeLeaseStore(teamName).leases[memberName] ?? null
}

export function removeBridgeLease(teamName: string, memberName: string): BridgeLeaseState | null {
  let removed: BridgeLeaseState | null = null
  updateBridgeLeaseStore(teamName, state => {
    removed = state.leases[memberName] ?? null
    delete state.leases[memberName]
  })
  return removed
}

export function staleBridge(lease: BridgeLeaseState | null | undefined, now = Date.now()): boolean {
  if (!lease) return true
  if (!lease.bridgeId || !lease.sessionFile) return true
  if (!Number.isFinite(lease.expiresAt) || lease.expiresAt <= now) return true
  if (!Number.isFinite(lease.lastSeenAt) || lease.lastSeenAt <= 0) return true
  return false
}

export function bridgeLeaseMismatchReason(
  lease: BridgeLeaseState | null | undefined,
  input: BridgeLeaseFreshnessInput,
): string | null {
  const now = input.now ?? Date.now()
  if (staleBridge(lease, now)) return 'bridge lease stale or expired'
  if (!lease) return 'bridge lease missing'
  if (lease.memberName !== input.memberName) return 'bridge member mismatch'
  if (lease.sessionFile !== input.sessionFile) return 'bridge session mismatch'
  if (lease.protocolVersion !== input.protocolVersion) return 'bridge protocol mismatch'
  if ((lease.packageVersion ?? '') !== (input.packageVersion ?? '')) return 'bridge package mismatch'
  if (input.bridgeId && lease.bridgeId !== input.bridgeId) return 'bridge id mismatch'
  if (input.generation !== undefined && lease.generation !== input.generation) return 'bridge generation mismatch'
  return null
}

export function bridgeLeaseIsFresh(
  lease: BridgeLeaseState | null | undefined,
  input: BridgeLeaseFreshnessInput,
): boolean {
  return bridgeLeaseMismatchReason(lease, input) === null
}
