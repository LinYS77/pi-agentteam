import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { DeliveryResult } from '../app/deliveryTypes.js'
import { runOutboxOnce, type OutboxEffectRunnerDeps, type OutboxRunResult } from '../app/effectRunner.js'
import type { OutboxDiagnosticsSummary } from '../app/outboxDiagnostics.js'
import { summarizeOutboxEffects } from '../app/outboxDiagnostics.js'
import { readOutboxDiagnosticsStore, markOutboxMaintenanceRun } from '../state/outboxDiagnosticsStore.js'
import { listOutboxEffects, recoverExpiredOutboxClaims } from '../state/outboxStore.js'
import { readTeamState } from '../state/teamStore.js'
import { getCurrentTeamName } from '../session.js'

export const OUTBOX_MAINTENANCE_WORKER_ID = 'outbox-maintenance'
export const DEFAULT_OUTBOX_MAINTENANCE_LIMIT = 10

export type OutboxMaintenanceDeps = OutboxEffectRunnerDeps

export type OutboxMaintenanceResult = {
  teamName: string
  recovered: number
  run: OutboxRunResult
  lastRunAt: number
}

const defaultOutboxMaintenanceDeps: OutboxMaintenanceDeps = {
  requestWorkerDelivery: async () => maintenanceDependencyUnavailable('requestWorkerDelivery'),
  requestLeaderAttentionIfNeeded: async () => maintenanceDependencyUnavailable('requestLeaderAttentionIfNeeded'),
}

function maintenanceDependencyUnavailable(name: string): DeliveryResult {
  throw new Error(`outbox maintenance ${name} dependency unavailable`)
}

export function outboxDiagnosticsSummary(teamName: string): OutboxDiagnosticsSummary {
  return summarizeOutboxEffects(listOutboxEffects(teamName), readOutboxDiagnosticsStore(teamName))
}

export async function runOutboxMaintenanceForTeam(
  teamName: string,
  deps: OutboxMaintenanceDeps = defaultOutboxMaintenanceDeps,
  input: { now?: number; limit?: number; claimTtlMs?: number } = {},
): Promise<OutboxMaintenanceResult | null> {
  const team = readTeamState(teamName)
  if (!team) return null
  const now = input.now ?? (deps.now ?? Date.now)()
  const recovered = recoverExpiredOutboxClaims(teamName, now)
  const run = await runOutboxOnce({
    teamName,
    workerId: OUTBOX_MAINTENANCE_WORKER_ID,
    limit: input.limit ?? DEFAULT_OUTBOX_MAINTENANCE_LIMIT,
    claimTtlMs: input.claimTtlMs,
    now,
  }, deps)
  markOutboxMaintenanceRun(teamName, now)
  return {
    teamName,
    recovered: recovered.length,
    run,
    lastRunAt: now,
  }
}

export function runOutboxMaintenanceForContext(
  ctx: ExtensionContext,
  deps: OutboxMaintenanceDeps = defaultOutboxMaintenanceDeps,
): void {
  const teamName = getCurrentTeamName(ctx)
  if (!teamName) return
  void runOutboxMaintenanceForTeam(teamName, deps).catch(error => {
    const message = error instanceof Error ? error.message : String(error)
    ctx.ui.notify(`agentteam outbox maintenance failed: ${message}`, 'warning')
  })
}
