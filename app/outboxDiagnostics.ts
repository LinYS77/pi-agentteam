import type { OutboxEffect, OutboxEffectKind } from './outbox.js'

export type OutboxLastFailedEffectSummary = {
  effectId: string
  kind: OutboxEffectKind
  error?: string
  failedAt?: number
  updatedAt: number
}

export type OutboxDiagnosticsSummary = {
  pending: number
  failed: number
  lastFailedEffect?: OutboxLastFailedEffectSummary
  lastRunAt?: number
}

export type OutboxDiagnosticsStoreState = {
  version: 1
  lastRunAt?: number
}

export function summarizeOutboxEffects(
  effects: OutboxEffect[],
  input: { lastRunAt?: number } = {},
): OutboxDiagnosticsSummary {
  const pending = effects.filter(effect => effect.status === 'pending').length
  const failedEffects = effects
    .filter(effect => effect.status === 'failed')
    .sort((a, b) => (b.failedAt ?? b.updatedAt) - (a.failedAt ?? a.updatedAt) || b.effectId.localeCompare(a.effectId))
  const lastFailed = failedEffects[0]
  return {
    pending,
    failed: failedEffects.length,
    ...(lastFailed
      ? {
          lastFailedEffect: {
            effectId: lastFailed.effectId,
            kind: lastFailed.kind,
            error: lastFailed.lastError,
            failedAt: lastFailed.failedAt,
            updatedAt: lastFailed.updatedAt,
          },
        }
      : {}),
    ...(typeof input.lastRunAt === 'number' && Number.isFinite(input.lastRunAt) ? { lastRunAt: input.lastRunAt } : {}),
  }
}
