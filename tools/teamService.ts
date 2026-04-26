import type { ExtensionContext } from '@mariozechner/pi-coding-agent'
import {
  createInitialTeamState,
  ensureAttachedSessionContext,
  readTeamState,
  writeSessionContext,
  writeTeamState,
} from '../state.js'
import { getSessionFile } from '../session.js'
import { captureCurrentPaneBinding } from '../tmux.js'
import { TEAM_LEAD } from '../types.js'
import type { ToolHandlerDeps } from './shared.js'
import type { TeamCreateInput, TeamSpawnInput } from './teamTypes.js'
import { spawnWorkerMember } from './workerSpawnService.js'

function ensureLeaderOnlyOperation(
  deps: ToolHandlerDeps,
  ctx: ExtensionContext,
): string | null {
  const actor = deps.currentActor(ctx)
  return actor === TEAM_LEAD ? null : `Only ${TEAM_LEAD} can perform this operation. Current actor: ${actor}`
}

export function executeCreateTeam(
  params: TeamCreateInput,
  ctx: ExtensionContext,
  deps: ToolHandlerDeps,
) {
  if (!deps.isLeaderInsideTmux()) {
    return {
      content: [{ type: 'text', text: 'agentteam requires the leader pi session to run inside tmux.' }],
      details: { denied: true, reason: 'leader_not_in_tmux' },
    }
  }
  const teamName = deps.sanitizeTeamName(params.team_name)
  if (!teamName) {
    return {
      content: [{ type: 'text', text: 'Team name cannot be empty after normalization' }],
      details: { denied: true },
    }
  }
  if (readTeamState(teamName)) {
    return {
      content: [{ type: 'text', text: `Team ${teamName} already exists` }],
      details: { teamName },
    }
  }
  const sessionFile = getSessionFile(ctx)
  const existingContext = ensureAttachedSessionContext(sessionFile).context
  if (existingContext.teamName && existingContext.teamName !== teamName) {
    return {
      content: [{
        type: 'text',
        text: `Current session is already attached to team ${existingContext.teamName}. One session can only have one team.`,
      }],
      details: { teamName: existingContext.teamName },
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
    content: [{ type: 'text', text: `Created team ${teamName}` }],
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
    return { content: [{ type: 'text', text: 'No current team. Use agentteam_create first.' }], details: {} }
  }
  const denied = ensureLeaderOnlyOperation(deps, ctx)
  if (denied) {
    return { content: [{ type: 'text', text: denied }], details: { denied: true } }
  }
  if (!deps.isLeaderInsideTmux()) {
    return {
      content: [{ type: 'text', text: 'agentteam_spawn requires the leader pi session to run inside tmux.' }],
      details: { denied: true, reason: 'leader_not_in_tmux' },
    }
  }
  if (!team.members[TEAM_LEAD]?.paneId) {
    return {
      content: [{ type: 'text', text: 'Current leader pane binding is missing. Re-enter the leader pane and try again.' }],
      details: {},
    }
  }
  const result = await spawnWorkerMember(deps, team, params, ctx.cwd)
  deps.invalidateStatus(ctx)
  return {
    content: [{ type: 'text', text: result.text }],
    details: result,
  }
}
