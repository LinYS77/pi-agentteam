import { type OutboxDiagnosticsStoreState } from '../app/outboxDiagnostics.js'
import { readJsonFile, withFileLock, writeJsonFile } from './fsStore.js'
import { getOutboxDiagnosticsPath } from './paths.js'
import { validateOrQuarantineTeam } from './validation.js'

export const OUTBOX_DIAGNOSTICS_STORE_VERSION = 1

function emptyOutboxDiagnosticsStore(): OutboxDiagnosticsStoreState {
  return { version: OUTBOX_DIAGNOSTICS_STORE_VERSION }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeOutboxDiagnosticsStore(raw: unknown): OutboxDiagnosticsStoreState {
  if (!isObjectRecord(raw)) return emptyOutboxDiagnosticsStore()
  return {
    version: OUTBOX_DIAGNOSTICS_STORE_VERSION,
    lastRunAt: typeof raw.lastRunAt === 'number' && Number.isFinite(raw.lastRunAt) ? raw.lastRunAt : undefined,
  }
}

export function readOutboxDiagnosticsStore(teamName: string): OutboxDiagnosticsStoreState {
  if (validateOrQuarantineTeam(teamName)) return emptyOutboxDiagnosticsStore()
  return normalizeOutboxDiagnosticsStore(readJsonFile<unknown>(getOutboxDiagnosticsPath(teamName)))
}

export function markOutboxMaintenanceRun(teamName: string, lastRunAt = Date.now()): OutboxDiagnosticsStoreState {
  if (validateOrQuarantineTeam(teamName)) return emptyOutboxDiagnosticsStore()
  const storePath = getOutboxDiagnosticsPath(teamName)
  return withFileLock(storePath, () => {
    const next = normalizeOutboxDiagnosticsStore(readJsonFile<unknown>(storePath))
    next.lastRunAt = lastRunAt
    writeJsonFile(storePath, next)
    return next
  })
}
