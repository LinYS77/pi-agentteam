import {
  captureTmuxSnapshot,
  clearPaneLabelSync,
  clearPaneLabelsForTeam,
  killPane,
  paneExists,
  resolvePaneBinding,
  resolvePaneBindingFromSnapshot,
} from './index.js'
import type { TmuxSnapshot } from '../../tmux/snapshot.js'
import type { TeamState } from '../../internalTypes.js'
import { TEAM_LEAD } from '../../internalTypes.js'
import { transitionWorkerFsm } from '../../runtime/workerFsm.js'

export type TeamPaneCleanupOptions = {
  includeLeaderPane?: boolean
  preservePaneId?: string
}

export type ReconcileTeamPanesOptions = {
  force?: boolean
  mode?: 'light' | 'force'
  snapshot?: TmuxSnapshot
}

const paneReconcileCache = new Map<string, number>()
const paneReconcileRevisionCache = new Map<string, number>()
const PANE_RECONCILE_TTL_MS = 2000

export function invalidatePaneReconcileCache(teamName?: string): void {
  if (teamName) {
    paneReconcileCache.delete(teamName)
    paneReconcileRevisionCache.delete(teamName)
  } else {
    paneReconcileCache.clear()
    paneReconcileRevisionCache.clear()
  }
}

function markMemberPaneLost(member: TeamState['members'][string]): void {
  const priorPaneId = member.paneId
  member.paneId = undefined
  member.windowTarget = undefined
  Object.assign(member, transitionWorkerFsm({ member, event: 'paneLost', error: 'tmux pane disappeared' }).patch)
  member.updatedAt = Date.now()
  if (priorPaneId) {
    invalidatePaneReconcileCache()
  }
}

export function healMemberPaneBinding(member: TeamState['members'][string]): void {
  if (!member.paneId) return
  const binding = resolvePaneBinding(member.paneId)
  if (!binding) {
    markMemberPaneLost(member)
    return
  }
  if (member.paneId !== binding.paneId || member.windowTarget !== binding.target) {
    member.paneId = binding.paneId
    member.windowTarget = binding.target
    member.updatedAt = Date.now()
  }
}

function healMemberPaneBindingFromSnapshot(member: TeamState['members'][string], snapshot: TmuxSnapshot): void {
  if (!member.paneId) return
  const binding = resolvePaneBindingFromSnapshot(snapshot, member.paneId)
  if (!binding) {
    markMemberPaneLost(member)
    return
  }
  if (member.paneId !== binding.paneId || member.windowTarget !== binding.target) {
    member.paneId = binding.paneId
    member.windowTarget = binding.target
    member.updatedAt = Date.now()
  }
}

export function reconcileTeamPanes(team: TeamState, options?: ReconcileTeamPanesOptions): boolean {
  const now = Date.now()
  const revision = team.revision ?? 0
  const lastAt = paneReconcileCache.get(team.name)
  const lastRevision = paneReconcileRevisionCache.get(team.name)
  const force = options?.force || options?.mode === 'force'
  if (!force && lastAt !== undefined && now - lastAt < PANE_RECONCILE_TTL_MS && lastRevision === revision) {
    return false
  }
  paneReconcileCache.set(team.name, now)
  paneReconcileRevisionCache.set(team.name, revision)

  const snapshot = force ? undefined : options?.snapshot ?? captureTmuxSnapshot()
  if (!force && options?.mode === 'light' && snapshot?.ok === false) {
    return false
  }
  const teamPaneIds = Object.values(team.members).map(member => member.paneId).filter((paneId): paneId is string => Boolean(paneId))
  const useSnapshot = snapshot?.ok !== false && (teamPaneIds.length === 0 || teamPaneIds.some(paneId => Boolean(snapshot?.byPaneId[paneId])))
  let changed = false
  for (const member of Object.values(team.members)) {
    const beforePane = member.paneId
    const beforeTarget = member.windowTarget
    const beforeStatus = member.status
    const beforeError = member.lastError
    const beforeWake = member.lastWakeReason
    if (snapshot && useSnapshot) {
      healMemberPaneBindingFromSnapshot(member, snapshot)
    } else {
      healMemberPaneBinding(member)
    }
    if (
      member.paneId !== beforePane ||
      member.windowTarget !== beforeTarget ||
      member.status !== beforeStatus ||
      member.lastError !== beforeError ||
      member.lastWakeReason !== beforeWake
    ) {
      changed = true
    }
  }
  return changed
}

function killTeamPanes(team: TeamState, options?: TeamPaneCleanupOptions): void {
  for (const member of Object.values(team.members)) {
    if (!options?.includeLeaderPane && member.name === TEAM_LEAD) continue
    if (!member.paneId) continue
    if (member.paneId === options?.preservePaneId) continue
    if (!paneExists(member.paneId)) continue
    killPane(member.paneId)
  }
}

export function clearAndKillTeamPanes(team: TeamState, options?: TeamPaneCleanupOptions): void {
  void clearPaneLabelsForTeam(team)
  if (options?.preservePaneId) {
    clearPaneLabelSync(options.preservePaneId)
  }
  killTeamPanes(team, options)
}
