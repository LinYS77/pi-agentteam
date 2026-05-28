import { readJsonFile, withFileLock, writeJsonFile } from './fsStore.js'
import { getRuntimeStatePath } from './paths.js'
import { validateOrQuarantineTeam } from './validation.js'

export const RUNTIME_STORE_VERSION = 1

export type RuntimeStoreSectionKey = 'bridge' | 'delivery' | 'leaderProjection' | 'leaderAttention'

export type RuntimeStoreState = {
  version: 1
  bridge: unknown
  delivery: unknown
  leaderProjection: unknown
  leaderAttention: unknown
}

export type RuntimeStoreUpdateResult<T> = {
  section: T
  runtime: RuntimeStoreState
}

export function emptyRuntimeStore(): RuntimeStoreState {
  return {
    version: RUNTIME_STORE_VERSION,
    bridge: { version: 1, leases: {} },
    delivery: { version: 1, requests: {} },
    leaderProjection: { version: 1, projections: {} },
    leaderAttention: { version: 1, attentions: {} },
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeRuntimeStore(raw: unknown): RuntimeStoreState {
  const out = emptyRuntimeStore()
  if (!isObjectRecord(raw)) return out
  out.bridge = raw.bridge ?? null
  out.delivery = raw.delivery ?? null
  out.leaderProjection = raw.leaderProjection ?? null
  out.leaderAttention = raw.leaderAttention ?? null
  return out
}

export function readRuntimeStore(teamName: string): RuntimeStoreState {
  if (validateOrQuarantineTeam(teamName)) return emptyRuntimeStore()
  return normalizeRuntimeStore(readJsonFile<unknown>(getRuntimeStatePath(teamName)))
}

export function readRuntimeSection<T>(teamName: string, section: RuntimeStoreSectionKey, normalize: (raw: unknown) => T): T {
  const runtime = readRuntimeStore(teamName)
  return normalize(runtime[section])
}

export function updateRuntimeSection<T>(
  teamName: string,
  section: RuntimeStoreSectionKey,
  normalize: (raw: unknown) => T,
  updater: (sectionState: T) => void | false | T,
): RuntimeStoreUpdateResult<T> {
  if (validateOrQuarantineTeam(teamName)) {
    const runtime = emptyRuntimeStore()
    return { section: normalize(runtime[section]), runtime }
  }
  const runtimePath = getRuntimeStatePath(teamName)
  return withFileLock(runtimePath, () => {
    const runtime = normalizeRuntimeStore(readJsonFile<unknown>(runtimePath))
    let sectionState = normalize(runtime[section])
    const replacement = updater(sectionState)
    if (replacement === false) return { section: sectionState, runtime }
    if (replacement) sectionState = replacement
    runtime[section] = sectionState
    writeJsonFile(runtimePath, runtime)
    return { section: sectionState, runtime }
  })
}
