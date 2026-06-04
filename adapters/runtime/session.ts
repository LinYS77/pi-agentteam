import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { peekUnreadMailbox } from '../../state/mailboxStore.js'
import { ensureAttachedSessionContext } from '../../state/sessionBinding.js'
import { deleteTeamState, readTeamState, updateTeamState } from '../../state/teamStore.js'
import { getCurrentMemberName, getCurrentTeamName, getSessionFile } from '../../session.js'
import {
  captureCurrentPaneBinding,
  syncPaneLabelsForTeam,
} from '../tmux/index.js'
export { isInsideTmux as isLeaderInsideTmux } from '../../tmux/core.js'
import { TEAM_LEAD } from '../../internalTypes.js'
import type { TeamState } from '../../internalTypes.js'
import {
  leaderMailboxSignalItemFromMailboxMessage,
  type LeaderMailboxSignalItem,
} from '../../runtime/leaderMailboxSignalRuntime.js'
import {
  assertValidOwner,
  classifySpawnTask,
  normalizeOwnerName,
  sanitizeTeamName,
  sanitizeWorkerName,
} from './rules.js'
import {
  ensureTeamStorageReady,
  invalidateMailboxEnsureCache,
} from './storage.js'
import {
  clearAndKillTeamPanes,
  healMemberPaneBinding,
  invalidatePaneReconcileCache,
  reconcileTeamPanes,
} from '../tmux/teamPanes.js'
import type { TeamPaneCleanupOptions } from '../tmux/teamPanes.js'
import {
  requestLeaderAttentionIfNeeded,
  requestWorkerDelivery,
} from '../bridge/delivery.js'
import type { DeliveryResult } from '../bridge/delivery.js'

export type AttachedSessionContext = {
  context: { teamName: string | null; memberName: string | null }
  source: 'cached' | 'derived' | 'cleared' | 'none'
}

export type { TeamPaneCleanupOptions, DeliveryResult }

export {
  assertValidOwner,
  classifySpawnTask,
  ensureTeamStorageReady,
  invalidateMailboxEnsureCache,
  healMemberPaneBinding,
  invalidatePaneReconcileCache,
  normalizeOwnerName,
  reconcileTeamPanes,
  requestLeaderAttentionIfNeeded,
  requestWorkerDelivery,
  sanitizeTeamName,
  sanitizeWorkerName,
}

export function ensureTeamForSession(ctx: ExtensionContext): TeamState | null {
  const teamName = getCurrentTeamName(ctx)
  if (!teamName) return null
  const team = readTeamState(teamName)
  if (!team) return null
  ensureTeamStorageReady(team)
  if (reconcileTeamPanes(team, { force: true })) {
    updateTeamState(team.name, () => team)
  }
  return team
}

export function currentActor(ctx: ExtensionContext): string {
  return getCurrentMemberName(ctx) ?? TEAM_LEAD
}

export function attachCurrentSessionIfNeeded(ctx: ExtensionContext): AttachedSessionContext {
  return ensureAttachedSessionContext(getSessionFile(ctx))
}

export function refreshForSession(
  ctx: ExtensionContext,
  attached?: AttachedSessionContext,
  options?: { forceReconcile?: boolean },
): void {
  const resolved = attached ?? attachCurrentSessionIfNeeded(ctx)
  const team = resolved.context.teamName ? readTeamState(resolved.context.teamName) : null
  if (team) {
    ensureTeamStorageReady(team)
    const changed = reconcileTeamPanes(team, options?.forceReconcile ? { force: true } : undefined)
    const currentPane = captureCurrentPaneBinding()
    let leaderChanged = false
    if (
      resolved.context.memberName === TEAM_LEAD &&
      currentPane &&
      !team.members[TEAM_LEAD]?.paneId
    ) {
      team.members[TEAM_LEAD] = {
        ...(team.members[TEAM_LEAD] ?? {
          name: TEAM_LEAD,
          role: 'leader',
          cwd: ctx.cwd,
          sessionFile: getSessionFile(ctx),
          status: 'idle',
          createdAt: team.createdAt,
          updatedAt: Date.now(),
        }),
        paneId: currentPane.paneId,
        windowTarget: currentPane.target,
      }
      leaderChanged = true
    }
    if (changed || leaderChanged) {
      updateTeamState(team.name, () => team)
    }
    void syncPaneLabelsForTeam(team)
  }
  ctx.ui.setStatus('agentteam', undefined)
  ctx.ui.setWidget('agentteam', undefined)
}

export function buildSessionStatusKey(
  ctx: ExtensionContext,
  attached: AttachedSessionContext,
): string {
  const sessionFile = getSessionFile(ctx)
  const teamName = attached.context.teamName
  const memberName = attached.context.memberName
  if (!teamName || !memberName) {
    return `${sessionFile}|${attached.source}|unbound`
  }

  const team = readTeamState(teamName)
  if (!team) {
    return `${sessionFile}|${attached.source}|${teamName}|missing`
  }

  const actor = team.members[memberName]
  const revision = team.revision ?? 0
  const memberCount = Object.keys(team.members).length
  const taskCount = Object.keys(team.tasks).length
  if (!actor) {
    return `${sessionFile}|${attached.source}|${teamName}|${memberName}|rev:${revision}|members:${memberCount}|tasks:${taskCount}|actor:missing`
  }

  return `${sessionFile}|${attached.source}|${teamName}|${memberName}|rev:${revision}|members:${memberCount}|tasks:${taskCount}|actor:${actor.status}:${actor.updatedAt}:${actor.lastWakeReason ?? ''}:${actor.lastError ?? ''}`
}

export function deleteTeamRuntime(team: TeamState, options?: TeamPaneCleanupOptions): void {
  clearAndKillTeamPanes(team, options)
  deleteTeamState(team.name)
  invalidateMailboxEnsureCache(team.name)
  invalidatePaneReconcileCache(team.name)
}

export function deliverLeaderMailbox(
  ctx: ExtensionContext,
): LeaderMailboxSignalItem[] {
  const teamName = getCurrentTeamName(ctx)
  const memberName = getCurrentMemberName(ctx)
  if (!teamName || memberName !== TEAM_LEAD) return []
  const team = readTeamState(teamName)
  if (team) ensureTeamStorageReady(team)
  if (team && reconcileTeamPanes(team)) {
    updateTeamState(team.name, () => team)
  }
  const unread = peekUnreadMailbox(teamName, TEAM_LEAD)
  return unread.map(msg => leaderMailboxSignalItemFromMailboxMessage(teamName, msg))
}
