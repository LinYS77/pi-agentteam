import type { OutboxEffect, OutboxEffectKind } from './outbox.js'
import type { EffectHandlerResult, OutboxEffectHandlers, OutboxStorePort } from './ports.js'

// Concrete task-note handlers still detect communication refs through
// isCommunicationReferenceNote; this runner only dispatches injected handlers.

export type OutboxEffectRunnerDeps = {
  outboxStore: Pick<OutboxStorePort, 'claim' | 'markDone' | 'markFailed'>
  outboxHandlers: OutboxEffectHandlers
  now?: () => number
}

export type RunOutboxInput = {
  teamName: string
  workerId: string
  limit?: number
  claimTtlMs?: number
  now?: number
  effectIds?: string[]
}

export type OutboxRunResult = {
  claimed: number
  done: number
  failed: number
  retried: number
  terminalFailed: number
  results: OutboxRunEffectResult[]
}

export type OutboxRunEffectResult = {
  effectId: string
  kind: OutboxEffect['kind']
  ok: boolean
  terminal?: boolean
  error?: string
  value?: unknown
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function resolveOutboxStore(deps: OutboxEffectRunnerDeps): Pick<OutboxStorePort, 'claim' | 'markDone' | 'markFailed'> {
  if (!deps.outboxStore) throw new Error('OutboxEffectRunnerDeps.outboxStore is required')
  return deps.outboxStore
}

function resolveOutboxHandlers(deps: OutboxEffectRunnerDeps): OutboxEffectHandlers {
  if (!deps.outboxHandlers) throw new Error('OutboxEffectRunnerDeps.outboxHandlers is required')
  return deps.outboxHandlers
}

async function executeOutboxEffect(effect: OutboxEffect, handlers: OutboxEffectHandlers): Promise<EffectHandlerResult> {
  const handler = handlers[effect.kind] as (effect: OutboxEffect<OutboxEffectKind>) => EffectHandlerResult | Promise<EffectHandlerResult>
  return handler(effect)
}

export async function runOutboxOnce(input: RunOutboxInput, deps: OutboxEffectRunnerDeps): Promise<OutboxRunResult> {
  const now = input.now ?? (deps.now ?? Date.now)()
  const outboxStore = resolveOutboxStore(deps)
  const outboxHandlers = resolveOutboxHandlers(deps)
  const claimed = outboxStore.claim({
    teamName: input.teamName,
    workerId: input.workerId,
    limit: input.limit,
    claimTtlMs: input.claimTtlMs,
    now,
    effectIds: input.effectIds,
  })
  const summary: OutboxRunResult = {
    claimed: claimed.length,
    done: 0,
    failed: 0,
    retried: 0,
    terminalFailed: 0,
    results: [],
  }

  for (const effect of claimed) {
    const claimId = effect.claim?.claimId
    try {
      const result = await executeOutboxEffect(effect, outboxHandlers)
      if (!result.ok) {
        const failed = outboxStore.markFailed({
          teamName: input.teamName,
          effectId: effect.effectId,
          claimId,
          error: result.error,
          result: result.result,
          now: input.now ?? (deps.now ?? Date.now)(),
        })
        const terminal = failed?.status === 'failed'
        summary.failed += 1
        summary.terminalFailed += terminal ? 1 : 0
        summary.retried += terminal ? 0 : 1
        summary.results.push({ effectId: effect.effectId, kind: effect.kind, ok: false, terminal, error: result.error, value: result.result })
        continue
      }
      outboxStore.markDone({
        teamName: input.teamName,
        effectId: effect.effectId,
        claimId,
        result: result.result,
        now: input.now ?? (deps.now ?? Date.now)(),
      })
      summary.done += 1
      summary.results.push({ effectId: effect.effectId, kind: effect.kind, ok: true, value: result.result })
    } catch (error) {
      const message = errorMessage(error)
      const failed = outboxStore.markFailed({
        teamName: input.teamName,
        effectId: effect.effectId,
        claimId,
        error: message,
        now: input.now ?? (deps.now ?? Date.now)(),
      })
      const terminal = failed?.status === 'failed'
      summary.failed += 1
      summary.terminalFailed += terminal ? 1 : 0
      summary.retried += terminal ? 0 : 1
      summary.results.push({ effectId: effect.effectId, kind: effect.kind, ok: false, terminal, error: message })
    }
  }

  return summary
}

export function createOutboxRunner(deps: OutboxEffectRunnerDeps): (input: RunOutboxInput) => Promise<OutboxRunResult> {
  return input => runOutboxOnce(input, deps)
}

