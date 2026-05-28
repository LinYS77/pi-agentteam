import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { writeSessionContext } from '../state/sessionBinding.js'
import {
  createInitialTeamState,
  readTeamState,
  updateTeamState,
  writeTeamState,
} from '../state/teamStore.js'
import { readLatestQuarantineForTeam } from '../state/validation.js'
import { getSessionFile } from '../session.js'
import { captureCurrentPaneBinding, paneExists, syncPaneLabelsForTeam } from '../adapters/tmux/index.js'
import { TEAM_LEAD } from '../internalTypes.js'
import type { TeamState } from '../internalTypes.js'
import type { ToolHandlerDeps } from './shared.js'
import type { TeamCreateInput, TeamSpawnInput } from './teamTypes.js'
import { spawnWorkerMember } from './workerSpawnService.js'

type PaneBinding = NonNullable<ReturnType<typeof captureCurrentPaneBinding>>

function ensureLeaderOnlyOperation(
  deps: ToolHandlerDeps,
  ctx: ExtensionContext,
): string | null {
  const actor = deps.currentActor(ctx)
  return actor === TEAM_LEAD ? null : `Only ${TEAM_LEAD} can perform this operation. Current actor: ${actor}`
}

function attachCurrentLeaderToExistingTeam(
  team: TeamState,
  sessionFile: string,
  cwd: string,
  currentPane: PaneBinding,
): TeamState | null {
  const now = Date.now()
  const recovered = updateTeamState(team.name, latest => {
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
  writeSessionContext(sessionFile, { teamName: recovered.name, memberName: TEAM_LEAD })
  void syncPaneLabelsForTeam(recovered)
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
  const teamName = deps.sanitizeTeamName(params.team_name)
  if (!teamName) {
    return {
      content: [{ type: 'text' as const, text: 'Team name cannot be empty after normalization' }],
      details: { denied: true },
    }
  }
  const sessionFile = getSessionFile(ctx)
  const currentTeam = deps.ensureTeamForSession(ctx)
  if (currentTeam) {
    if (currentTeam.name === teamName) {
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
  const existingTeam = readTeamState(teamName)
  const quarantinedExistingTeam = existingTeam ? null : readLatestQuarantineForTeam(teamName)
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
    const currentPane = captureCurrentPaneBinding()
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
    const existingLeaderPaneId = existingTeam.members[TEAM_LEAD]?.paneId
    if (existingLeaderPaneId && existingLeaderPaneId !== currentPane.paneId && paneExists(existingLeaderPaneId)) {
      return {
        content: [{
          type: 'text' as const,
          text: `Team ${teamName} already exists and appears to have an active leader pane. Use /team recover to attach this session as current leader if that pane is stale.`,
        }],
        details: {
          denied: true,
          teamName,
          reason: 'team_exists_not_attached',
          recoverInstruction: 'Use /team recover to attach this session as current leader if the existing leader pane is stale.',
          currentPaneId: currentPane.paneId,
          existingLeaderPaneId,
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
  const state = createInitialTeamState({
    teamName,
    description: params.description,
    leaderSessionFile: sessionFile,
    leaderCwd: ctx.cwd,
  })
  const currentPane = captureCurrentPaneBinding()
  if (currentPane) {
    state.members[TEAM_LEAD] = {
      ...state.members[TEAM_LEAD]!,
      paneId: currentPane.paneId,
      windowTarget: currentPane.target,
    }
  }
  writeTeamState(state)
  writeSessionContext(sessionFile, { teamName, memberName: TEAM_LEAD })
  deps.invalidateStatus(ctx)
  return {
    content: [{ type: 'text' as const, text: `Created team ${teamName}` }],
    details: { teamName },
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
