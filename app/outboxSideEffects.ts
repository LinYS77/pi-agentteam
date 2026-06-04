import type { OutboxRunEffectResult, OutboxRunResult, RunOutboxInput } from './effectRunner.js'
import { outboxEffectWarningName, type OutboxEffect, type OutboxEffectStatus } from './outbox.js'
import type { OutboxRunnerPort, OutboxStorePort } from './ports.js'

export type OutboxSideEffectWarning = {
  kind: string
  error?: string
  effectId: string
  outboxKind: OutboxEffect['kind']
  outboxStatus: 'pending' | 'failed'
}

export type OutboxEffectRecord =
  | {
      effectId: string
      kind: OutboxEffect['kind']
      status: OutboxEffectStatus
      idempotencyKey: string
      lastError?: string
    }
  | {
      effectId: string
      status: 'pending'
    }

export type OutboxResultForEffect = {
  effectId: string
  runResult?: OutboxRunEffectResult
  storedEffect?: OutboxEffect
  ok: boolean
  value?: unknown
  status?: OutboxEffectStatus
  error?: string
}

export type RunSelectedOutboxEffectsDeps = {
  outboxRunner: Pick<OutboxRunnerPort, 'runOnce'>
  outboxStore: Pick<OutboxStorePort, 'get'>
}

export type SelectedOutboxEffectResult = {
  effectId: string
  record: OutboxEffectRecord
  result: OutboxResultForEffect
}

export type RunSelectedOutboxEffectsResult = {
  run: OutboxRunResult
  records: OutboxEffectRecord[]
  warnings: OutboxSideEffectWarning[]
  results: SelectedOutboxEffectResult[]
  byId: Record<string, SelectedOutboxEffectResult>
}

export function mailboxMessageIdForEffect(effectId: string): string {
  return `mailbox-${effectId}`
}

export function outboxWarnings(run: Pick<OutboxRunResult, 'results'>): OutboxSideEffectWarning[] {
  return run.results
    .filter(item => !item.ok)
    .map(item => ({
      kind: outboxEffectWarningName(item.kind),
      error: item.error,
      effectId: item.effectId,
      outboxKind: item.kind,
      outboxStatus: item.terminal ? 'failed' : 'pending',
    }))
}

export function outboxEffectRecord(effectId: string, effect: OutboxEffect | null | undefined): OutboxEffectRecord {
  if (!effect) return { effectId, status: 'pending' }
  return {
    effectId: effect.effectId,
    kind: effect.kind,
    status: effect.status,
    idempotencyKey: effect.idempotencyKey,
    lastError: effect.lastError,
  }
}

export function outboxResultForEffect(input: {
  effectId: string
  run?: Pick<OutboxRunResult, 'results'>
  storedEffect?: OutboxEffect | null
}): OutboxResultForEffect {
  const runResult = input.run?.results.find(item => item.effectId === input.effectId)
  const storedEffect = input.storedEffect ?? undefined
  return {
    effectId: input.effectId,
    runResult,
    storedEffect,
    ok: Boolean(runResult?.ok || storedEffect?.status === 'done'),
    value: runResult?.value ?? storedEffect?.result,
    status: storedEffect?.status,
    error: runResult?.error ?? storedEffect?.lastError,
  }
}

export async function runSelectedOutboxEffects(
  input: RunOutboxInput,
  deps: RunSelectedOutboxEffectsDeps,
): Promise<RunSelectedOutboxEffectsResult> {
  const effectIds = [...(input.effectIds ?? [])]
  const run = await deps.outboxRunner.runOnce({
    ...input,
    effectIds: input.effectIds ? effectIds : undefined,
    limit: input.limit ?? (effectIds.length || 1),
  })
  const readbackEffectIds = effectIds.length > 0
    ? effectIds
    : run.results.map(item => item.effectId)
  const records: OutboxEffectRecord[] = []
  const results: SelectedOutboxEffectResult[] = []
  const byId: Record<string, SelectedOutboxEffectResult> = {}

  for (const effectId of readbackEffectIds) {
    const storedEffect = deps.outboxStore.get(input.teamName, effectId)
    const record = outboxEffectRecord(effectId, storedEffect)
    const result = outboxResultForEffect({ effectId, run, storedEffect })
    const item = { effectId, record, result }
    records.push(record)
    results.push(item)
    byId[effectId] = item
  }

  return {
    run,
    records,
    warnings: outboxWarnings(run),
    results,
    byId,
  }
}
