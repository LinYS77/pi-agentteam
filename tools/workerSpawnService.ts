import * as path from 'node:path'
import {
  getWorkerSessionsDir,
  upsertMember,
  updateMemberStatus,
  updateTeamState,
  writeSessionContext,
} from '../state.js'
import {
  createTeammatePane,
  resolvePaneBinding,
  waitForPaneAppStart,
} from '../tmux.js'
import { TEAM_LEAD } from '../types.js'
import type { TeamState } from '../types.js'
import type { ToolHandlerDeps } from './shared.js'
import type { SpawnResult, TeamSpawnInput } from './teamTypes.js'
import { buildWorkerLaunchCommand, buildWorkerSystemPrompt } from './workerPrompt.js'
import { resolveSpawnRole } from './workerRole.js'

function commitWorkerSpawnState(
  team: TeamState,
  updater: (latest: TeamState) => void,
): TeamState {
  // Worker spawn is an ordered lifecycle with external side effects (tmux pane
  // creation, pi process boot, session binding). Each state transition now
  // commits against the latest team snapshot under updateTeamState() so a spawn
  // status write does not clobber concurrent task/message updates.
  const updated = updateTeamState(team.name, latest => {
    updater(latest)
  })
  if (!updated) throw new Error(`Team ${team.name} no longer exists`)
  Object.assign(team, updated)
  return updated
}

export async function spawnWorkerMember(
  deps: ToolHandlerDeps,
  team: TeamState,
  assignment: TeamSpawnInput,
  leaderCwd: string,
): Promise<SpawnResult> {
  const workerName = deps.sanitizeWorkerName(assignment.name)
  if (!workerName) {
    return { ok: false, text: 'Teammate name cannot be empty after normalization' }
  }
  if (team.members[workerName]) {
    return { ok: false, text: `Member ${workerName} already exists` }
  }
  const sessionFile = path.join(getWorkerSessionsDir(), `${team.name}-${workerName}.jsonl`)
  const cwd = assignment.cwd ?? leaderCwd
  const roleResolution = resolveSpawnRole(assignment.role, assignment.name)
  if (!roleResolution.ok) {
    return { ok: false, text: roleResolution.text }
  }
  const { normalizedRole, roleAgent } = roleResolution
  const leader = team.members[TEAM_LEAD]
  deps.healMemberPaneBinding(leader)
  const { initialTask: initialWake, bootPrompt: deferredBootPrompt } = deps.classifySpawnTask(assignment.task)

  const basePrompt = buildWorkerSystemPrompt({
    teamName: team.name,
    workerName,
    role: normalizedRole,
    roleAgent,
  })
  const startCommand = buildWorkerLaunchCommand({
    sessionFile,
    basePrompt,
    roleAgent,
  })

  commitWorkerSpawnState(team, latest => {
    upsertMember(latest, {
      name: workerName,
      role: normalizedRole,
      model: roleAgent.model,
      tools: roleAgent.tools,
      systemPrompt: roleAgent.systemPrompt,
      cwd,
      sessionFile,
      bootPrompt: deferredBootPrompt,
      status: deferredBootPrompt ? 'idle' : 'queued',
      lastWakeReason: deferredBootPrompt ? 'created waiting for follow-up instruction' : 'created',
    })
  })
  writeSessionContext(sessionFile, { teamName: team.name, memberName: workerName })

  let pane: Awaited<ReturnType<typeof createTeammatePane>>
  try {
    pane = await createTeammatePane({
      name: workerName,
      preferred: {
        target: leader?.windowTarget,
        leaderPaneId: leader?.paneId,
      },
      cwd,
      startCommand,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    commitWorkerSpawnState(team, latest => {
      updateMemberStatus(latest, workerName, {
        status: 'error',
        lastWakeReason: 'spawn failed',
        lastError: message,
      })
    })
    return {
      ok: false,
      text: `Failed to create tmux pane for ${workerName}: ${message}`,
      memberName: workerName,
      sessionFile,
    }
  }

  commitWorkerSpawnState(team, latest => {
    const member = latest.members[workerName]
    if (!member) return
    member.paneId = pane.paneId
    member.windowTarget = pane.target
    member.updatedAt = Date.now()
  })

  const binding = resolvePaneBinding(pane.paneId)
  if (!binding) {
    commitWorkerSpawnState(team, latest => {
      updateMemberStatus(latest, workerName, {
        status: 'error',
        lastError: 'Teammate tmux pane disappeared immediately after creation',
      })
    })
    return {
      ok: false,
      text: `Failed to keep tmux pane alive for ${workerName}`,
    }
  }
  commitWorkerSpawnState(team, latest => {
    const member = latest.members[workerName]
    if (!member) return
    member.paneId = binding.paneId
    member.windowTarget = binding.target
    member.updatedAt = Date.now()
  })

  const ready = await waitForPaneAppStart(binding.paneId, 20000)
  if (!ready) {
    commitWorkerSpawnState(team, latest => {
      updateMemberStatus(latest, workerName, {
        status: 'error',
        lastError: 'Timed out waiting for teammate pi process to start in tmux pane',
      })
    })
    return {
      ok: false,
      text: `Failed to start visible teammate session for ${workerName}`,
    }
  }

  const wakeResult = initialWake
    ? await deps.wakeWorker(team, workerName, initialWake)
    : undefined
  const started = Boolean(wakeResult?.ok)
  if (!started) {
    commitWorkerSpawnState(team, latest => {
      updateMemberStatus(latest, workerName, {
        status: 'idle',
        lastWakeReason: deferredBootPrompt
          ? 'created waiting for follow-up instruction'
          : initialWake
            ? 'created without accepted task'
            : 'created idle',
        lastError: undefined,
      })
    })
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
