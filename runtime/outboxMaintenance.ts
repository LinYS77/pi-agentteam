import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { OutboxDiagnosticsSummary } from '../app/outboxDiagnostics.js'
import { summarizeOutboxEffects } from '../app/outboxDiagnostics.js'
import { readOutboxDiagnosticsStore, markOutboxMaintenanceRun } from '../state/outboxDiagnosticsStore.js'
import { listOutboxEffects, recoverExpiredOutboxClaims } from '../state/outboxStore.js'
import { readTeamState } from '../state/teamStore.js'
import { getCurrentTeamName } from '../session.js'

export const OUTBOX_MAINTENANCE_WORKER_ID = 'outbox-maintenance'
export const DEFAULT_OUTBOX_MAINTENANCE_LIMIT = 10

export type OutboxMaintenanceRunInput = {
  teamName: string
  workerId: string
  limit?: number
  claimTtlMs?: number
  now?: number
  effectIds?: string[]
}

export type OutboxMaintenanceRunEffectResult = {
  effectId: string
  kind: string
  ok: boolean
  terminal?: boolean
  error?: string
  value?: unknown
}

export type OutboxMaintenanceRunResult = {
  claimed: number
  done: number
  failed: number
  retried: number
  terminalFailed: number
  results: OutboxMaintenanceRunEffectResult[]
}

export type OutboxMaintenanceRunnerPort = {
  runOnce(input: OutboxMaintenanceRunInput): Promise<OutboxMaintenanceRunResult>
}

export type OutboxMaintenanceDeps = {
  outboxRunner: OutboxMaintenanceRunnerPort
  now?: () => number
}

export type OutboxMaintenanceResult = {
  teamName: string
  recovered: number
  run: OutboxMaintenanceRunResult
  lastRunAt: number
}

export function outboxDiagnosticsSummary(teamName: string): OutboxDiagnosticsSummary {
  return summarizeOutboxEffects(listOutboxEffects(teamName), readOutboxDiagnosticsStore(teamName))
}

export async function runOutboxMaintenanceForTeam(
  teamName: string,
  deps: OutboxMaintenanceDeps,
  input: { now?: number; limit?: number; claimTtlMs?: number } = {},
): Promise<OutboxMaintenanceResult | null> {
  const team = readTeamState(teamName)
  if (!team) return null
  const now = input.now ?? (deps.now ?? Date.now)()
  const recovered = recoverExpiredOutboxClaims(teamName, now)
  const run = await deps.outboxRunner.runOnce({
    teamName,
    workerId: OUTBOX_MAINTENANCE_WORKER_ID,
    limit: input.limit ?? DEFAULT_OUTBOX_MAINTENANCE_LIMIT,
    claimTtlMs: input.claimTtlMs,
    now,
  })
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
  deps: OutboxMaintenanceDeps,
): Promise<OutboxMaintenanceResult | null> | void {
  const teamName = getCurrentTeamName(ctx)
  if (!teamName) return
  const run = runOutboxMaintenanceForTeam(teamName, deps).catch(error => {
    const message = error instanceof Error ? error.message : String(error)
    ctx.ui.notify(`agentteam outbox maintenance failed: ${message}`, 'warning')
    return null
  })
  void run
  return run
}
