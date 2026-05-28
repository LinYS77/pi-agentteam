import type { LeaderProjectionState, LeaderProjectionStatus } from '../internalTypes.js'
import { readRuntimeSection, updateRuntimeSection } from './runtimeStore.js'

export const LEADER_PROJECTION_STATE_VERSION = 1
const PROJECTION_CLAIM_TTL_MS = 30_000

export type LeaderProjectionStoreState = {
  version: 1
  projections: Record<string, LeaderProjectionState>
}

function emptyLeaderProjectionStore(): LeaderProjectionStoreState {
  return { version: LEADER_PROJECTION_STATE_VERSION, projections: {} }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function statusValue(value: unknown): LeaderProjectionStatus {
  return value === 'pending' || value === 'projecting' || value === 'projected' || value === 'failed'
    ? value
    : 'pending'
}

function normalizeProjection(raw: unknown): LeaderProjectionState | null {
  if (!isObjectRecord(raw)) return null
  const projectionKey = typeof raw.projectionKey === 'string' ? raw.projectionKey.trim() : ''
  const teamName = typeof raw.teamName === 'string' ? raw.teamName.trim() : ''
  const messageId = typeof raw.messageId === 'string' ? raw.messageId.trim() : ''
  const generation = typeof raw.generation === 'string' ? raw.generation.trim() : ''
  if (!projectionKey || !teamName || !messageId || !generation) return null
  const now = Date.now()
  return {
    projectionKey,
    teamName,
    messageId,
    generation,
    status: statusValue(raw.status),
    attempts: numberValue(raw.attempts, 0),
    createdAt: numberValue(raw.createdAt, now),
    updatedAt: numberValue(raw.updatedAt, now),
    claimExpiresAt: typeof raw.claimExpiresAt === 'number' && Number.isFinite(raw.claimExpiresAt) ? raw.claimExpiresAt : undefined,
    projectedAt: typeof raw.projectedAt === 'number' && Number.isFinite(raw.projectedAt) ? raw.projectedAt : undefined,
    failedAt: typeof raw.failedAt === 'number' && Number.isFinite(raw.failedAt) ? raw.failedAt : undefined,
    lastError: typeof raw.lastError === 'string' ? raw.lastError : undefined,
  }
}

export function leaderProjectionKey(teamName: string, messageId: string, generation: string | number): string {
  return `${teamName}:${messageId}:${generation}`
}

export function normalizeLeaderProjectionStore(raw: unknown): LeaderProjectionStoreState {
  if (!isObjectRecord(raw)) return emptyLeaderProjectionStore()
  const out = emptyLeaderProjectionStore()
  const rawProjections = isObjectRecord(raw.projections) ? raw.projections : {}
  for (const rawProjection of Object.values(rawProjections)) {
    const projection = normalizeProjection(rawProjection)
    if (!projection) continue
    out.projections[projection.projectionKey] = projection
  }
  return out
}

export function readLeaderProjectionStore(teamName: string): LeaderProjectionStoreState {
  return readRuntimeSection(teamName, 'leaderProjection', normalizeLeaderProjectionStore)
}

export function updateLeaderProjectionStore(
  teamName: string,
  updater: (state: LeaderProjectionStoreState) => void | false | LeaderProjectionStoreState,
): LeaderProjectionStoreState {
  return updateRuntimeSection(teamName, 'leaderProjection', normalizeLeaderProjectionStore, updater).section
}

export function claimLeaderProjection(
  teamName: string,
  messageId: string,
  generation: string | number,
  now = Date.now(),
): LeaderProjectionState | null {
  const projectionKey = leaderProjectionKey(teamName, messageId, generation)
  let claimed: LeaderProjectionState | null = null
  updateLeaderProjectionStore(teamName, state => {
    const existing = state.projections[projectionKey]
    if (existing?.status === 'projected') return
    if (existing?.status === 'projecting' && (existing.claimExpiresAt ?? 0) > now) return
    const next: LeaderProjectionState = existing ?? {
      projectionKey,
      teamName,
      messageId,
      generation: String(generation),
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    }
    next.status = 'projecting'
    next.attempts = (next.attempts ?? 0) + 1
    next.updatedAt = now
    next.claimExpiresAt = now + PROJECTION_CLAIM_TTL_MS
    next.lastError = undefined
    state.projections[projectionKey] = next
    claimed = next
  })
  return claimed
}

export function markLeaderProjectionProjected(
  teamName: string,
  projectionKey: string,
  now = Date.now(),
): LeaderProjectionState | null {
  let updated: LeaderProjectionState | null = null
  updateLeaderProjectionStore(teamName, state => {
    const projection = state.projections[projectionKey]
    if (!projection) return
    projection.status = 'projected'
    projection.projectedAt = now
    projection.updatedAt = now
    projection.claimExpiresAt = undefined
    projection.lastError = undefined
    updated = projection
  })
  return updated
}

export function markLeaderProjectionFailed(
  teamName: string,
  projectionKey: string,
  error: string,
  now = Date.now(),
): LeaderProjectionState | null {
  let updated: LeaderProjectionState | null = null
  updateLeaderProjectionStore(teamName, state => {
    const projection = state.projections[projectionKey]
    if (!projection) return
    projection.status = 'failed'
    projection.failedAt = now
    projection.updatedAt = now
    projection.claimExpiresAt = undefined
    projection.lastError = error
    updated = projection
  })
  return updated
}

export function getLeaderProjection(
  teamName: string,
  messageId: string,
  generation: string | number,
): LeaderProjectionState | null {
  return readLeaderProjectionStore(teamName).projections[leaderProjectionKey(teamName, messageId, generation)] ?? null
}
