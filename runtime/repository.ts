import { ensureTeamStorageReady } from '../adapters/runtime/storage.js'
import * as tmux from '../adapters/tmux/index.js'
import {
  reconcileTeamPanes as reconcileRuntimeTeamPanes,
  type ReconcileTeamPanesOptions,
} from '../adapters/tmux/teamPanes.js'
import type { TeamState } from '../internalTypes.js'
import type { TmuxPaneSnapshotItem, TmuxSnapshot } from '../tmux/snapshot.js'

export type RuntimeSnapshotHandler<T> = (snapshot: TmuxSnapshot) => T

export type PaneBinding = NonNullable<ReturnType<typeof tmux.captureCurrentPaneBinding>>

export type RuntimeRepository = {
  captureCurrentPaneBinding(): PaneBinding | null
  paneExists(paneId: string): boolean
  syncPaneLabelsForTeam(team: TeamState): Promise<void>
  withRuntimeSnapshot<T>(handler: RuntimeSnapshotHandler<T>): T
  listAgentTeamPanes(snapshot?: TmuxSnapshot): TmuxPaneSnapshotItem[]
  reconcileTeamPanes(team: TeamState, options?: ReconcileTeamPanesOptions): boolean
  prepareTeamForPanel(team: TeamState, options?: ReconcileTeamPanesOptions): boolean
}

function captureRuntimeSnapshot(): TmuxSnapshot {
  return tmux.captureTmuxSnapshot()
}

export function captureCurrentPaneBinding(): PaneBinding | null {
  return tmux.captureCurrentPaneBinding()
}

export function paneExists(paneId: string): boolean {
  return tmux.paneExists(paneId)
}

export function syncPaneLabelsForTeam(team: TeamState): Promise<void> {
  return tmux.syncPaneLabelsForTeam(team)
}

export function withRuntimeSnapshot<T>(handler: RuntimeSnapshotHandler<T>): T {
  return handler(captureRuntimeSnapshot())
}

export function listAgentTeamPanesForRepository(snapshot?: TmuxSnapshot): TmuxPaneSnapshotItem[] {
  return snapshot ? tmux.listAgentTeamPanesFromSnapshot(snapshot) : tmux.listAgentTeamPanes()
}

export { listAgentTeamPanesForRepository as listAgentTeamPanes }

export function reconcileTeamPanes(team: TeamState, options?: ReconcileTeamPanesOptions): boolean {
  return reconcileRuntimeTeamPanes(team, options)
}

export function prepareTeamForPanel(team: TeamState, options?: ReconcileTeamPanesOptions): boolean {
  ensureTeamStorageReady(team)
  return reconcileTeamPanes(team, options)
}

export function createRuntimeRepository(): RuntimeRepository {
  return {
    captureCurrentPaneBinding,
    paneExists,
    syncPaneLabelsForTeam,
    withRuntimeSnapshot,
    listAgentTeamPanes: listAgentTeamPanesForRepository,
    reconcileTeamPanes,
    prepareTeamForPanel,
  }
}

export const fileBackedRuntimeRepository: RuntimeRepository = createRuntimeRepository()
