import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from 'typebox'
import type { ToolHandlerDeps } from './shared.js'
import { executeCreateTeam, executeSpawnMember } from './teamService.js'

const TeamCreateParams = Type.Object({
  team_name: Type.String({ description: 'Team name' }),
  description: Type.Optional(Type.String({ description: 'Team description' })),
})

const TeamSpawnParams = Type.Object({
  name: Type.String({ description: 'Teammate display name' }),
  role: Type.String({ description: 'Built-in role: researcher, planner, or implementer' }),
  task: Type.Optional(Type.String({ description: 'Optional initial task to delegate. Omit to create only and leave the teammate idle.' })),
  cwd: Type.Optional(Type.String({ description: 'Working directory for the worker' })),
})

export function registerTeamTools(pi: ExtensionAPI, deps: ToolHandlerDeps): void {
  pi.registerTool({
    name: 'agentteam_create',
    label: 'AgentTeam Create',
    description: 'Create a shared agent team attached to the current leader session.',
    promptSnippet: 'Create an agentteam when the user wants coordinated teammates; call this before spawning or messaging teammates.',
    promptGuidelines: [
      'Use agentteam_create only when the current session is not already attached to a team.',
      'After agentteam_create, create shared tasks before delegating concrete work to teammates.',
    ],
    parameters: TeamCreateParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeCreateTeam(params, ctx, deps)
    },
  })

  pi.registerTool({
    name: 'agentteam_spawn',
    label: 'AgentTeam Spawn',
    description: 'Create a teammate in a tmux pane for the current session-attached team. If task is omitted, the teammate is created idle and waits for later instructions.',
    promptSnippet: 'Spawn visible pi teammates in tmux panes for roles such as researcher, planner, or implementer.',
    promptGuidelines: [
      'Use agentteam_spawn only after agentteam_create and only when existing teammates cannot handle the work.',
      'Prefer spawning idle teammates or giving a short initial task; use agentteam_task plus agentteam_send for detailed assignments.',
      'Only the team leader may use agentteam_spawn.',
    ],
    parameters: TeamSpawnParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeSpawnMember(params, ctx, deps)
    },
  })
}
