import * as fs from 'node:fs'
import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { getMailboxPath } from '../state/paths.js'
import { clearSessionContext, writeSessionContext } from '../state/sessionBinding.js'
import { listTeams, readTeamState, removeMember, updateTeamState } from '../state/teamStore.js'
import { readLatestQuarantineForTeam } from '../state/validation.js'
import { getCurrentTeamName, getSessionFile } from '../session.js'
import {
  captureCurrentPaneBinding,
  clearPaneLabelSync,
  killPane,
  listAgentTeamPanes,
  paneExists,
  syncPaneLabelsForTeam,
} from '../adapters/tmux/index.js'
import { TEAM_LEAD } from '../internalTypes.js'
import type { TeamPaneCleanupOptions } from '../adapters/runtime/session.js'
import type { TeamState } from '../internalTypes.js'
import type { CommandHandlerDeps } from './shared.js'

export function removeSelectedMember(
  ctx: ExtensionContext,
  deps: CommandHandlerDeps,
  teamName: string,
  memberName: string,
): boolean {
  if (memberName === TEAM_LEAD) {
    ctx.ui.notify('team-lead cannot be removed from /team', 'warning')
    return false
  }

  const team = readTeamState(teamName)
  const member = team?.members[memberName]
  if (!team || !member) {
    ctx.ui.notify(`Member ${memberName} no longer exists`, 'warning')
    return false
  }

  const paneId = member.paneId
  const sessionFile = member.sessionFile
  const currentPane = currentPaneId()
  updateTeamState(team.name, latest => {
    removeMember(latest, memberName)
  })

  clearSessionFileAndBinding(sessionFile)
  removeMailbox(team.name, memberName)

  clearOrKillMemberPane(paneId, currentPane)

  deps.invalidateStatus(ctx)
  ctx.ui.notify(`Removed ${memberName}`, 'info')
  return true
}

function currentPane(): { paneId: string; target: string } | null {
  return captureCurrentPaneBinding()
}

function currentPaneId(): string | undefined {
  return currentPane()?.paneId
}

function clearOrKillMemberPane(paneId: string | undefined, preservePaneId: string | undefined): void {
  if (!paneId) return
  if (paneId === preservePaneId) {
    clearPaneLabelSync(paneId)
    return
  }
  if (paneExists(paneId)) {
    killPane(paneId)
  }
}

function quietRemovePath(path?: string): void {
  if (!path) return
  try {
    fs.rmSync(path, { force: true })
  } catch {
    // ignore
  }
}

function clearSessionFileAndBinding(sessionFile?: string): void {
  if (!sessionFile) return
  clearSessionContext(sessionFile)
  if (sessionFile.startsWith('ephemeral:')) return
  quietRemovePath(sessionFile)
}

function removeMailbox(teamName: string, memberName: string): void {
  quietRemovePath(getMailboxPath(teamName, memberName))
}

function removeSessionContextOnly(sessionFile?: string): void {
  if (!sessionFile) return
  clearSessionContext(sessionFile)
}

function staleMemberForMissingLeader(
  team: TeamState,
  currentPaneIdValue: string | undefined,
  currentTarget: string | undefined,
): string | undefined {
  if (!currentPaneIdValue) return undefined
  for (const member of Object.values(team.members)) {
    if (member.name === TEAM_LEAD) continue
    if (member.paneId === currentPaneIdValue) return member.name
    if (!member.paneId && currentTarget && member.windowTarget === currentTarget) return member.name
  }
  return undefined
}

function cleanupOptionsPreservingCurrentPane(team: TeamState, currentPane: string | undefined): TeamPaneCleanupOptions {
  const leaderPaneId = team.members[TEAM_LEAD]?.paneId
  return {
    includeLeaderPane: leaderPaneId !== currentPane,
    preservePaneId: currentPane,
  }
}

export function deleteSelectedTeam(
  ctx: ExtensionContext,
  deps: CommandHandlerDeps,
  teamName: string,
): boolean {
  const team = readTeamState(teamName)
  if (!team) {
    ctx.ui.notify(`Team ${teamName} no longer exists`, 'warning')
    return false
  }

  const currentTeamName = getCurrentTeamName(ctx)
  const currentPane = currentPaneId()

  deps.deleteTeamRuntime(team, cleanupOptionsPreservingCurrentPane(team, currentPane))

  if (currentTeamName === team.name) {
    clearSessionContext(getSessionFile(ctx))
  }

  deps.invalidateStatus(ctx)
  ctx.ui.notify(`Deleted team ${team.name}`, 'info')
  return true
}

export function cleanupAllAgentTeamData(
  ctx: ExtensionContext,
  deps: CommandHandlerDeps,
): { deletedTeams: number; killedPanes: number } {
  const currentTeamName = getCurrentTeamName(ctx)
  const teams = listTeams()
  const currentPane = currentPaneId()

  const knownPaneIds = new Set<string>()
  for (const team of teams) {
    for (const member of Object.values(team.members)) {
      if (member.paneId) knownPaneIds.add(member.paneId)
    }
  }

  const orphanPanes = listAgentTeamPanes()
    .filter(pane => pane.paneId !== currentPane && !knownPaneIds.has(pane.paneId))

  let deletedTeams = 0
  for (const team of teams) {
    deps.deleteTeamRuntime(team, cleanupOptionsPreservingCurrentPane(team, currentPane))
    deletedTeams += 1
  }

  if (currentTeamName) {
    clearSessionContext(getSessionFile(ctx))
  }

  if (currentPane) {
    clearPaneLabelSync(currentPane)
  }

  let killedPanes = 0
  for (const pane of orphanPanes) {
    killPane(pane.paneId)
    killedPanes += 1
  }

  deps.invalidateStatus(ctx)
  ctx.ui.notify(`Deleted ${deletedTeams} team(s), killed ${killedPanes} stale pane(s)`, 'info')
  return { deletedTeams, killedPanes }
}

export function recoverTeamAsCurrentLeader(
  ctx: ExtensionContext,
  deps: CommandHandlerDeps,
  teamName: string,
): TeamState | null {
  const sessionFile = getSessionFile(ctx)
  const pane = currentPane()
  const recovered = updateTeamState(teamName, team => {
    const now = Date.now()
    team.leaderSessionFile = sessionFile
    team.leaderCwd = ctx.cwd
    const staleMember = staleMemberForMissingLeader(team, pane?.paneId, pane?.target)
    if (staleMember) {
      const staleSessionFile = team.members[staleMember]?.sessionFile
      removeMember(team, staleMember)
      removeSessionContextOnly(staleSessionFile)
      removeMailbox(team.name, staleMember)
    }
    const previous = team.members[TEAM_LEAD]
    team.members[TEAM_LEAD] = {
      ...(previous ?? {
        name: TEAM_LEAD,
        role: 'leader',
        createdAt: team.createdAt,
        updatedAt: now,
        status: 'idle' as const,
      }),
      name: TEAM_LEAD,
      role: 'leader',
      cwd: ctx.cwd,
      sessionFile,
      paneId: pane?.paneId,
      windowTarget: pane?.target,
      status: 'idle',
      lastError: undefined,
      lastWakeReason: 'recovered as current leader',
      updatedAt: now,
    }
  })

  if (!recovered) {
    const quarantined = readLatestQuarantineForTeam(teamName)
    if (quarantined) {
      const firstReason = quarantined.reasons[0]
      const reasonText = firstReason ? `${firstReason.code} at ${firstReason.path}` : 'unsupported persisted state'
      ctx.ui.notify(`Team ${teamName} is quarantined as legacy unsupported state (${reasonText}); active recovery is disabled.`, 'warning')
    } else {
      ctx.ui.notify(`Team ${teamName} no longer exists`, 'warning')
    }
    return null
  }

  writeSessionContext(sessionFile, {
    teamName: recovered.name,
    memberName: TEAM_LEAD,
  })
  void syncPaneLabelsForTeam(recovered)
  deps.invalidateStatus(ctx)
  ctx.ui.notify(`Recovered team ${recovered.name} as current leader`, 'info')
  return recovered
}
