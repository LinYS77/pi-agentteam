import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { buildNewTeamIdentity } from '../core/teamIdentity.js'
import { fileBackedRuntimeRepository, type PaneBinding, type RuntimeRepository } from '../runtime/repository.js'
import { fileBackedStateRepository, type StateRepository } from '../state/repository.js'
import { getSessionFile } from '../session.js'
import { TEAM_LEAD } from '../internalTypes.js'
import type { TeamState } from '../internalTypes.js'
import type { ToolHandlerDeps } from './shared.js'
import type { TeamCreateInput, TeamSpawnInput } from './teamTypes.js'
import { spawnWorkerMember } from './workerSpawnService.js'

const stateRepository: StateRepository = fileBackedStateRepository
const runtimeRepository: RuntimeRepository = fileBackedRuntimeRepository

function ensureLeaderOnlyOperation(
  deps: ToolHandlerDeps,
  ctx: ExtensionContext,
): string | null {
  const actor = deps.currentActor(ctx)
  return actor === TEAM_LEAD ? null : `Only ${TEAM_LEAD} can perform this operation. Current actor: ${actor}`
}

function teamMatchesRequestedSlug(team: TeamState, slug: string): boolean {
  return team.name === slug || team.identity?.slug === slug
}

function hasLeaderSessionBinding(team: TeamState): boolean {
  if (!team.leaderSessionFile) return false
  const context = stateRepository.readSessionContext(team.leaderSessionFile)
  return context.teamName === team.name && context.memberName === TEAM_LEAD
}

function attachCurrentLeaderToExistingTeam(
  team: TeamState,
  sessionFile: string,
  cwd: string,
  currentPane: PaneBinding,
): TeamState | null {
  const now = Date.now()
  const recovered = stateRepository.updateTeamState(team.name, latest => {
    latest.leaderSessionFile = sessionFile
    latest.leaderCwd = cwd
    const previousLeader = latest.members[TEAM_LEAD]
    latest.members[TEAM_LEAD] = {
      ...(previousLeader ?? {
        name: TEAM_LEAD,
        role: 'leader',
        cwd,
        sessionFile,
        status: 'idle' as const,
        createdAt: latest.createdAt,
        updatedAt: now,
      }),
      name: TEAM_LEAD,
      role: 'leader',
      cwd,
      sessionFile,
      paneId: currentPane.paneId,
      windowTarget: currentPane.target,
      status: 'idle',
      lastError: undefined,
      lastWakeReason: 'recovered as current leader',
      updatedAt: now,
    }
  })
  if (!recovered) return null
  stateRepository.writeSessionContext(sessionFile, stateRepository.buildSessionContextForTeam(recovered, TEAM_LEAD))
  void runtimeRepository.syncPaneLabelsForTeam(recovered)
  return recovered
}

export function executeCreateTeam(
  params: TeamCreateInput,
  ctx: ExtensionContext,
  deps: ToolHandlerDeps,
) {
  if (!deps.isLeaderInsideTmux()) {
    return {
      content: [{ type: 'text' as const, text: 'agentteam requires the leader pi session to run inside tmux.' }],
      details: { denied: true, reason: 'leader_not_in_tmux' },
    }
  }
  const teamNameValidation = deps.validateNewTeamName(params.team_name)
  const teamName = teamNameValidation.normalized
  if (!teamNameValidation.ok) {
    return {
      content: [{ type: 'text' as const, text: teamNameValidation.message }],
      details: { denied: true, reason: teamNameValidation.reason, normalizedTeamName: teamName },
    }
  }
  if (!teamName) {
    return {
      content: [{ type: 'text' as const, text: 'Team name cannot be empty after normalization' }],
      details: { denied: true, reason: 'empty_after_normalization' },
    }
  }
  const identity = buildNewTeamIdentity({ rawName: params.team_name, cwd: ctx.cwd })
  const sessionFile = getSessionFile(ctx)
  const currentTeam = deps.ensureTeamForSession(ctx)
  if (currentTeam) {
    if (teamMatchesRequestedSlug(currentTeam, teamName) && (!currentTeam.identity || currentTeam.identity.projectKey === identity.projectKey)) {
      return {
        content: [{ type: 'text' as const, text: `Team ${teamName} already exists; current session is already attached.` }],
        details: { teamName, alreadyAttached: true, currentTeamName: currentTeam.name },
      }
    }
    return {
      content: [{
        type: 'text' as const,
        text: `Current session is already attached to team ${currentTeam.name}. Use that team or recover this session before creating ${teamName}.`,
      }],
      details: { denied: true, reason: 'session_already_attached', teamName, currentTeamName: currentTeam.name },
    }
  }
  const existingByName = stateRepository.readTeamState(teamName)
  let existingTeam = stateRepository.findTeamByProjectSlug(identity.projectKey, identity.slug)
  if (!existingTeam && existingByName?.identity?.slug === identity.slug) {
    if (existingByName.identity.projectKey === identity.projectKey || !hasLeaderSessionBinding(existingByName)) {
      existingTeam = existingByName
    }
  }
  const quarantinedExistingTeam = existingByName || existingTeam ? null : stateRepository.readLatestQuarantineForTeam(teamName)
  if (quarantinedExistingTeam) {
    const firstReason = quarantinedExistingTeam.reasons[0]
    const reasonText = firstReason ? firstReason.code : 'unsupported persisted state'
    return {
      content: [{
        type: 'text' as const,
        text: `Team ${teamName} was quarantined as legacy unsupported persisted state (${reasonText}). Create with a different name or restore by pinning a compatible older package; no vNext migration was applied.`,
      }],
      details: {
        denied: true,
        teamName,
        reason: 'team_quarantined_unsupported_state',
        quarantineDir: quarantinedExistingTeam.quarantineDir,
        reasonCount: quarantinedExistingTeam.reasonCount,
      },
    }
  }
  if (existingTeam) {
    const currentPane = runtimeRepository.captureCurrentPaneBinding()
    if (!currentPane) {
      return {
        content: [{
          type: 'text' as const,
          text: `Team ${teamName} already exists, but the current session is not safely attached. Use /team recover to attach this session as current leader.`,
        }],
        details: {
          denied: true,
          teamName,
          reason: 'team_exists_not_attached',
          recoverInstruction: 'Use /team recover to attach this session as current leader.',
        },
      }
    }
    const existingLeader = existingTeam.members[TEAM_LEAD]
    const existingLeaderPaneId = existingLeader?.paneId
    if (existingLeaderPaneId && existingLeaderPaneId !== currentPane.paneId && runtimeRepository.paneExists(existingLeaderPaneId)) {
      const recoverInstruction = 'Only use /team recover if you have confirmed the existing leader pane is stale.'
      return {
        content: [{
          type: 'text' as const,
          text: `Team ${teamName} already exists and is active in another leader pane. Choose a different team_name. ${recoverInstruction}`,
        }],
        details: {
          denied: true,
          teamName,
          reason: 'team_name_conflict_active_elsewhere',
          recoverInstruction,
          existingLeaderCwd: existingTeam.leaderCwd ?? existingLeader?.cwd,
          existingLeaderSessionFile: existingTeam.leaderSessionFile ?? existingLeader?.sessionFile,
          existingLeaderWindowTarget: existingLeader?.windowTarget,
          existingLeaderPaneId,
          currentCwd: ctx.cwd,
          currentPaneId: currentPane.paneId,
        },
      }
    }
    const recovered = attachCurrentLeaderToExistingTeam(existingTeam, sessionFile, ctx.cwd, currentPane)
    if (!recovered) {
      return {
        content: [{ type: 'text' as const, text: `Team ${teamName} no longer exists` }],
        details: { denied: true, teamName },
      }
    }
    deps.invalidateStatus(ctx)
    return {
      content: [{ type: 'text' as const, text: `Team ${teamName} already exists; attached current session as leader.` }],
      details: { teamName, alreadyExists: true, recovered: true },
    }
  }
  const storageName = existingByName ? identity.teamId : teamName
  const state = stateRepository.createInitialTeamState({
    teamName: params.team_name,
    storageName,
    identity,
    description: params.description,
    leaderSessionFile: sessionFile,
    leaderCwd: ctx.cwd,
  })
  const currentPane = runtimeRepository.captureCurrentPaneBinding()
  if (currentPane) {
    state.members[TEAM_LEAD] = {
      ...state.members[TEAM_LEAD]!,
      paneId: currentPane.paneId,
      windowTarget: currentPane.target,
    }
  }
  stateRepository.writeTeamState(state)
  stateRepository.writeSessionContext(sessionFile, stateRepository.buildSessionContextForTeam(state, TEAM_LEAD))
  deps.invalidateStatus(ctx)
  return {
    content: [{ type: 'text' as const, text: `Created team ${teamName}` }],
    details: { teamName, storageTeamName: state.name, teamId: identity.teamId, projectKey: identity.projectKey },
  }
}

export async function executeSpawnMember(
  params: TeamSpawnInput,
  ctx: ExtensionContext,
  deps: ToolHandlerDeps,
) {
  const team = deps.ensureTeamForSession(ctx)
  if (!team) {
    return { content: [{ type: 'text' as const, text: 'No current team. Use agentteam_create first.' }], details: {} }
  }
  const denied = ensureLeaderOnlyOperation(deps, ctx)
  if (denied) {
    return { content: [{ type: 'text' as const, text: denied }], details: { denied: true } }
  }
  if (!deps.isLeaderInsideTmux()) {
    return {
      content: [{ type: 'text' as const, text: 'agentteam_spawn requires the leader pi session to run inside tmux.' }],
      details: { denied: true, reason: 'leader_not_in_tmux' },
    }
  }
  if (!team.members[TEAM_LEAD]?.paneId) {
    return {
      content: [{ type: 'text' as const, text: 'Current leader pane binding is missing. Re-enter the leader pane and try again.' }],
      details: {},
    }
  }
  const result = await spawnWorkerMember(deps, team, params, ctx.cwd)
  deps.invalidateStatus(ctx)
  return {
    content: [{ type: 'text' as const, text: result.text }],
    details: result,
  }
}
