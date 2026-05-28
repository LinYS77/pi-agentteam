import type { LeaderAttentionState, LeaderAttentionStatus } from '../internalTypes.js'
import { readRuntimeSection, updateRuntimeSection } from './runtimeStore.js'

export const LEADER_ATTENTION_STATE_VERSION = 1
const ATTENTION_CLAIM_TTL_MS = 30_000

export type LeaderAttentionStoreState = {
  version: 1
  attentions: Record<string, LeaderAttentionState>
}

function emptyLeaderAttentionStore(): LeaderAttentionStoreState {
  return { version: LEADER_ATTENTION_STATE_VERSION, attentions: {} }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function statusValue(value: unknown): LeaderAttentionStatus {
  return value === 'pending' || value === 'sending' || value === 'sent' || value === 'failed' || value === 'skipped'
    ? value
    : 'pending'
}

function normalizeAttention(raw: unknown): LeaderAttentionState | null {
  if (!isObjectRecord(raw)) return null
  const attentionKey = typeof raw.attentionKey === 'string' ? raw.attentionKey.trim() : ''
  const teamName = typeof raw.teamName === 'string' ? raw.teamName.trim() : ''
  const messageId = typeof raw.messageId === 'string' ? raw.messageId.trim() : ''
  const generation = typeof raw.generation === 'string' ? raw.generation.trim() : ''
  if (!attentionKey || !teamName || !messageId || !generation) return null
  const now = Date.now()
  return {
    attentionKey,
    teamName,
    messageId,
    generation,
    status: statusValue(raw.status),
    attempts: numberValue(raw.attempts, 0),
    createdAt: numberValue(raw.createdAt, now),
    updatedAt: numberValue(raw.updatedAt, now),
    claimExpiresAt: typeof raw.claimExpiresAt === 'number' && Number.isFinite(raw.claimExpiresAt) ? raw.claimExpiresAt : undefined,
    sentAt: typeof raw.sentAt === 'number' && Number.isFinite(raw.sentAt) ? raw.sentAt : undefined,
    failedAt: typeof raw.failedAt === 'number' && Number.isFinite(raw.failedAt) ? raw.failedAt : undefined,
    skippedAt: typeof raw.skippedAt === 'number' && Number.isFinite(raw.skippedAt) ? raw.skippedAt : undefined,
    lastError: typeof raw.lastError === 'string' ? raw.lastError : undefined,
  }
}

export function leaderAttentionKey(teamName: string, messageId: string, generation: string | number): string {
  return `${teamName}:${messageId}:${generation}`
}

export function normalizeLeaderAttentionStore(raw: unknown): LeaderAttentionStoreState {
  if (!isObjectRecord(raw)) return emptyLeaderAttentionStore()
  const out = emptyLeaderAttentionStore()
  const rawAttentions = isObjectRecord(raw.attentions) ? raw.attentions : {}
  for (const rawAttention of Object.values(rawAttentions)) {
    const attention = normalizeAttention(rawAttention)
    if (!attention) continue
    out.attentions[attention.attentionKey] = attention
  }
  return out
}

export function readLeaderAttentionStore(teamName: string): LeaderAttentionStoreState {
  return readRuntimeSection(teamName, 'leaderAttention', normalizeLeaderAttentionStore)
}

export function updateLeaderAttentionStore(
  teamName: string,
  updater: (state: LeaderAttentionStoreState) => void | false | LeaderAttentionStoreState,
): LeaderAttentionStoreState {
  return updateRuntimeSection(teamName, 'leaderAttention', normalizeLeaderAttentionStore, updater).section
}

export function claimLeaderAttention(
  teamName: string,
  messageId: string,
  generation: string | number,
  now = Date.now(),
): LeaderAttentionState | null {
  const attentionKey = leaderAttentionKey(teamName, messageId, generation)
  let claimed: LeaderAttentionState | null = null
  updateLeaderAttentionStore(teamName, state => {
    const existing = state.attentions[attentionKey]
    if (existing?.status === 'sent' || existing?.status === 'skipped') return
    if (existing?.status === 'sending' && (existing.claimExpiresAt ?? 0) > now) return
    const next: LeaderAttentionState = existing ?? {
      attentionKey,
      teamName,
      messageId,
      generation: String(generation),
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    }
    next.status = 'sending'
    next.attempts = (next.attempts ?? 0) + 1
    next.updatedAt = now
    next.claimExpiresAt = now + ATTENTION_CLAIM_TTL_MS
    next.lastError = undefined
    state.attentions[attentionKey] = next
    claimed = next
  })
  return claimed
}

export function markLeaderAttentionSent(
  teamName: string,
  attentionKey: string,
  now = Date.now(),
): LeaderAttentionState | null {
  let updated: LeaderAttentionState | null = null
  updateLeaderAttentionStore(teamName, state => {
    const attention = state.attentions[attentionKey]
    if (!attention) return
    attention.status = 'sent'
    attention.sentAt = now
    attention.updatedAt = now
    attention.claimExpiresAt = undefined
    attention.lastError = undefined
    updated = attention
  })
  return updated
}

export function markLeaderAttentionSkipped(
  teamName: string,
  attentionKey: string,
  reason: string,
  now = Date.now(),
): LeaderAttentionState | null {
  let updated: LeaderAttentionState | null = null
  updateLeaderAttentionStore(teamName, state => {
    const attention = state.attentions[attentionKey]
    if (!attention) return
    attention.status = 'skipped'
    attention.skippedAt = now
    attention.updatedAt = now
    attention.claimExpiresAt = undefined
    attention.lastError = reason
    updated = attention
  })
  return updated
}

export function markLeaderAttentionFailed(
  teamName: string,
  attentionKey: string,
  error: string,
  now = Date.now(),
): LeaderAttentionState | null {
  let updated: LeaderAttentionState | null = null
  updateLeaderAttentionStore(teamName, state => {
    const attention = state.attentions[attentionKey]
    if (!attention) return
    attention.status = 'failed'
    attention.failedAt = now
    attention.updatedAt = now
    attention.claimExpiresAt = undefined
    attention.lastError = error
    updated = attention
  })
  return updated
}

export function getLeaderAttention(
  teamName: string,
  messageId: string,
  generation: string | number,
): LeaderAttentionState | null {
  return readLeaderAttentionStore(teamName).attentions[leaderAttentionKey(teamName, messageId, generation)] ?? null
}
