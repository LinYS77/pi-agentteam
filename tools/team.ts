import * as path from 'node:path'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { discoverAgents } from '../agents.js'
import {
  createInitialTeamState,
  ensureAttachedSessionContext,
  getWorkerSessionsDir,
  readTeamState,
  upsertMember,
  updateMemberStatus,
  writeSessionContext,
  writeTeamState,
} from '../state.js'
import { getSessionFile } from '../session.js'
import {
  captureCurrentPaneBinding,
  createTeammatePane,
  resolvePaneBinding,
  shellEscapeArg,
  waitForPaneAppStart,
} from '../tmux.js'
import { TEAM_LEAD } from '../types.js'
import type { TeamState } from '../types.js'
import type { ToolHandlerDeps } from './shared.js'

const TeamCreateParams = Type.Object({
  team_name: Type.String({ description: 'Team name' }),
  description: Type.Optional(Type.String({ description: 'Team description' })),
})

const TeamSpawnParams = Type.Object({
  name: Type.String({ description: 'Teammate display name' }),
  role: Type.String({ description: 'Role or built-in agentteam agent name' }),
  task: Type.Optional(Type.String({ description: 'Optional initial task to delegate. Omit to create only and leave the teammate idle.' })),
  cwd: Type.Optional(Type.String({ description: 'Working directory for the worker' })),
})


type SpawnResult = {
  ok: boolean
  text: string
  memberName?: string
  sessionFile?: string
  paneId?: string
}

const BUILTIN_CLI_TOOLS = new Set(['read', 'write', 'edit', 'bash', 'grep', 'find', 'ls'])

function normalizeSpawnRole(role: string, memberName?: string): string {
  const raw = role.trim()
  const key = raw.toLowerCase()
  const name = (memberName ?? '').trim().toLowerCase()
  if (!raw) return role

  const plannerAliases = ['plan', 'planner', 'planning', '规划', '规划师']
  const researcherAliases = ['research', 'researcher', 'researching', '研究', '研究员']
  const implementerAliases = ['implement', 'implementer', 'coder', 'developer', 'dev', '实现', '实现者', '工程师']

  if (plannerAliases.includes(key)) return 'planner'
  if (researcherAliases.includes(key)) return 'researcher'
  if (implementerAliases.includes(key)) return 'implementer'

  const genericRole = ['worker', 'teammate', 'agent', 'subagent', '成员', '队员'].includes(key)
  if (genericRole) {
    if (name.includes('plan') || name.includes('规划')) return 'planner'
    if (name.includes('research') || name.includes('研究')) return 'researcher'
    if (name.includes('implement') || name.includes('dev') || name.includes('code') || name.includes('实现')) return 'implementer'
  }

  return raw
}

function ensureLeaderOnlyOperation(
  deps: ToolHandlerDeps,
  ctx: Parameters<ToolHandlerDeps['currentActor']>[0],
): string | null {
  const actor = deps.currentActor(ctx)
  return actor === TEAM_LEAD ? null : `Only ${TEAM_LEAD} can perform this operation. Current actor: ${actor}`
}

function spawnOne(
  deps: ToolHandlerDeps,
  team: TeamState,
  assignment: { name: string; role: string; task?: string; cwd?: string },
  leaderCwd: string,
): SpawnResult {
  const workerName = deps.sanitizeWorkerName(assignment.name)
  if (team.members[workerName]) {
    return { ok: false, text: `Member ${workerName} already exists` }
  }
  const sessionFile = path.join(getWorkerSessionsDir(), `${team.name}-${workerName}.jsonl`)
  const cwd = assignment.cwd ?? leaderCwd
  const discovered = discoverAgents(cwd)
  const normalizedRole = normalizeSpawnRole(assignment.role, assignment.name)
  const roleAgent = discovered.find(a => a.name === normalizedRole)
  const leader = team.members[TEAM_LEAD]
  deps.healMemberPaneBinding(leader)
  const { initialTask: initialWake, bootPrompt: deferredBootPrompt } = deps.classifySpawnTask(assignment.task)

  const basePrompt = [
    'You are a worker in an agent team running inside pi.',
    `Team: ${team.name}`,
    `Worker name: ${workerName}`,
    `Role: ${normalizedRole}`,
    '',
    'Rules:',
    '- Coordinate through agentteam_send and agentteam_task.',
    '- Update shared tasks as you make progress.',
    '- Be concise, practical, and action-oriented.',
    '- If asked to summarize findings, send the summary to team-lead using agentteam_send.',
    roleAgent?.systemPrompt ? `\nRole prompt:\n${roleAgent.systemPrompt}` : '',
  ].filter(Boolean).join('\n')

  const launchCommandParts = ['pi', '--session', sessionFile]
  if (basePrompt) {
    launchCommandParts.push('--append-system-prompt', basePrompt)
  }
  if (roleAgent?.model) {
    launchCommandParts.push('--model', roleAgent.model)
  }
  if (roleAgent?.tools && roleAgent.tools.length > 0) {
    const builtinCliTools = roleAgent.tools.filter(tool => BUILTIN_CLI_TOOLS.has(tool))
    if (builtinCliTools.length > 0) {
      launchCommandParts.push('--tools', builtinCliTools.join(','))
    }
  }
  const pane = createTeammatePane({
    name: workerName,
    preferred: {
      target: leader?.windowTarget,
      leaderPaneId: leader?.paneId,
    },
    cwd,
    startCommand: launchCommandParts.map(part => shellEscapeArg(String(part))).join(' '),
  })

  upsertMember(team, {
    name: workerName,
    role: normalizedRole,
    model: roleAgent?.model,
    tools: roleAgent?.tools,
    systemPrompt: roleAgent?.systemPrompt,
    cwd,
    sessionFile,
    paneId: pane.paneId,
    windowTarget: pane.target,
    bootPrompt: deferredBootPrompt,
    status: deferredBootPrompt ? 'idle' : 'queued',
    lastWakeReason: deferredBootPrompt ? 'created waiting for follow-up instruction' : 'created',
  })

  const binding = resolvePaneBinding(pane.paneId)
  if (!binding) {
    updateMemberStatus(team, workerName, {
      status: 'error',
      lastError: 'Teammate tmux pane disappeared immediately after creation',
    })
    writeTeamState(team)
    return {
      ok: false,
      text: `Failed to keep tmux pane alive for ${workerName}`,
    }
  }
  team.members[workerName]!.paneId = binding.paneId
  team.members[workerName]!.windowTarget = binding.target

  const ready = waitForPaneAppStart(binding.paneId, 20000)
  if (!ready) {
    updateMemberStatus(team, workerName, {
      status: 'error',
      lastError: 'Timed out waiting for teammate pi process to start in tmux pane',
    })
    writeTeamState(team)
    return {
      ok: false,
      text: `Failed to start visible teammate session for ${workerName}`,
    }
  }

  const started = Boolean(initialWake) && deps.wakeWorker(team, workerName, initialWake)
  if (!started) {
    updateMemberStatus(team, workerName, {
      status: 'idle',
      lastWakeReason: deferredBootPrompt
        ? 'created waiting for follow-up instruction'
        : initialWake
          ? 'created without accepted task'
          : 'created idle',
      lastError: undefined,
    })
    writeTeamState(team)
  }
  return {
    ok: true,
    text: started
      ? `Spawned teammate ${workerName} (${normalizedRole}) in pane ${pane.paneId}`
      : deferredBootPrompt
        ? `Created waiting teammate ${workerName} (${normalizedRole}) in pane ${pane.paneId}`
        : `Created idle teammate ${workerName} (${normalizedRole}) in pane ${pane.paneId}`,
    memberName: workerName,
    sessionFile,
    paneId: pane.paneId,
  }
}

export function registerTeamTools(pi: ExtensionAPI, deps: ToolHandlerDeps): void {
  pi.registerTool({
    name: 'agentteam_create',
    label: 'AgentTeam Create',
    description: 'Create a shared agent team with all extension files isolated under ~/.pi/agent/extensions/agentteam.',
    parameters: TeamCreateParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const teamName = deps.sanitizeTeamName(params.team_name)
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
    },
  })

  pi.registerTool({
    name: 'agentteam_spawn',
    label: 'AgentTeam Spawn',
    description: 'Create a teammate in a tmux pane for the current session-attached team. If task is omitted, the teammate is created idle and waits for later instructions.',
    parameters: TeamSpawnParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const team = deps.ensureTeamForSession(ctx)
      if (!team) {
        return { content: [{ type: 'text', text: 'No current team. Use agentteam_create first.' }], details: {} }
      }
      const denied = ensureLeaderOnlyOperation(deps, ctx)
      if (denied) {
        return { content: [{ type: 'text', text: denied }], details: { denied: true } }
      }
      if (!team.members[TEAM_LEAD]?.paneId) {
        return {
          content: [{ type: 'text', text: 'Current leader pane binding is missing. Re-enter the leader pane and try again.' }],
          details: {},
        }
      }
      const result = spawnOne(deps, team, params, ctx.cwd)
      deps.invalidateStatus(ctx)
      return {
        content: [{ type: 'text', text: result.text }],
        details: result,
      }
    },
  })

}
