import * as fs from 'node:fs'
import { getBridgeLease } from '../state/bridgeStore.js'
import { getWorkerSessionPath } from '../state/paths.js'
import { buildSessionContextForTeam, clearSessionContext, writeSessionContext } from '../state/sessionBinding.js'
import { removeMember, upsertMember, updateMemberStatus, updateTeamState } from '../state/teamStore.js'
import {
  createTeammatePane,
  killPane,
  paneExists,
  resolvePaneBinding,
  waitForPaneAppStart,
} from '../adapters/tmux/index.js'
import { formatConfigDiagnostic, summarizeConfigDiagnostics } from '../config.js'
import { isBridgeFresh } from '../adapters/bridge/index.js'
import { transitionWorkerFsm } from '../runtime/workerFsm.js'
import { TEAM_LEAD } from '../internalTypes.js'
import type { TeamState } from '../internalTypes.js'
import { runSelectedOutboxEffects } from '../app/outboxSideEffects.js'
import type { ToolHandlerDeps } from './shared.js'
import type { SpawnResult, SpawnRollbackCleanup, TeamSpawnInput } from './teamTypes.js'
import { buildWorkerLaunchCommand, buildWorkerSystemPrompt } from './workerPrompt.js'
import { resolveSpawnRole } from './workerRole.js'

function effectiveModelLabel(model?: string): string {
  return model && model.trim() ? model.trim() : 'default'
}

function appendModelAndDiagnostics(text: string, modelLabel: string, modelSource: SpawnResult['modelSource'], diagnostics: ReturnType<typeof summarizeConfigDiagnostics>['actionable']): string {
  const parts = [`${text} [model: ${modelLabel}] [modelSource: ${modelSource ?? 'default'}]`]
  if (diagnostics.length > 0) {
    parts.push(`Config diagnostics: ${diagnostics.map(formatConfigDiagnostic).join('; ')}`)
  }
  return parts.join('\n')
}

function spawnResultPatch(roleAgentModel: string | undefined, modelSource: SpawnResult['modelSource'], configDiagnostics: ReturnType<typeof summarizeConfigDiagnostics>['actionable']): Pick<SpawnResult, 'model' | 'modelLabel' | 'modelSource' | 'configDiagnostics'> {
  const modelLabel = effectiveModelLabel(roleAgentModel)
  return {
    model: roleAgentModel,
    modelLabel,
    modelSource: modelSource ?? (roleAgentModel ? 'v1' : 'default'),
    configDiagnostics,
  }
}

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

function removeSessionFile(sessionFile: string): boolean {
  if (!sessionFile || sessionFile.startsWith('ephemeral:')) return false
  try {
    fs.rmSync(sessionFile, { force: true })
    return true
  } catch {
    return false
  }
}

const BRIDGE_SPAWN_READY_TIMEOUT_MS = 2_000
const BRIDGE_SPAWN_READY_POLL_MS = 100
const BRIDGE_SPAWN_READY_TIMEOUT_ENV = 'PI_AGENTTEAM_BRIDGE_SPAWN_READY_TIMEOUT_MS'

type InitialSpawnDeliveryResult = {
  deliveryRequestId?: string
  outboxEffectId?: string
  outboxStatus?: 'pending' | 'done' | 'failed'
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function bridgeSpawnReadyTimeoutMs(): number {
  const parsed = Number(process.env[BRIDGE_SPAWN_READY_TIMEOUT_ENV])
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : BRIDGE_SPAWN_READY_TIMEOUT_MS
}

async function waitForBridgeReady(teamName: string, workerName: string, timeoutMs = bridgeSpawnReadyTimeoutMs()): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    const latest = updateTeamState(teamName, team => team)
    const member = latest?.members[workerName]
    const lease = getBridgeLease(teamName, workerName)
    if (member && isBridgeFresh(member, Date.now(), lease)) return true
    await sleep(BRIDGE_SPAWN_READY_POLL_MS)
  }
  return false
}

async function requestInitialSpawnDeliveryThroughOutbox(
  deps: ToolHandlerDeps,
  teamName: string,
  workerName: string,
  initialInstruction: string,
): Promise<InitialSpawnDeliveryResult> {
  const effect = deps.outboxStore.enqueue({
    teamName,
    kind: 'worker_delivery_requested',
    idempotencyKey: ['spawn-initial-worker-delivery', teamName, workerName].join(':'),
    payload: {
      teamName,
      memberName: workerName,
      explicitTask: initialInstruction,
      options: {
        requestedBy: TEAM_LEAD,
        reason: 'initial spawn task',
        wakeHint: 'hard',
      },
    },
  })
  const selected = await runSelectedOutboxEffects({
    teamName,
    workerId: 'worker-spawn-service',
    effectIds: [effect.effectId],
    limit: 1,
  }, deps)
  const result = selected.byId[effect.effectId]?.result
  const value = result?.value
  const deliveryRequestId = value && typeof value === 'object' && 'requestId' in value && typeof value.requestId === 'string'
    ? value.requestId
    : undefined
  return {
    deliveryRequestId,
    outboxEffectId: effect.effectId,
    outboxStatus: result?.status,
  }
}

function rollbackFailedWorkerSpawn(input: {
  team: TeamState
  workerName: string
  sessionFile: string
  paneId?: string
  leaderPaneId?: string
}): SpawnRollbackCleanup {
  let memberRemoved = false
  const rolledBack = updateTeamState(input.team.name, latest => {
    if (!latest.members[input.workerName]) return
    removeMember(latest, input.workerName)
    memberRemoved = true
  })
  if (rolledBack) Object.assign(input.team, rolledBack)

  clearSessionContext(input.sessionFile)
  const sessionFileRemoved = removeSessionFile(input.sessionFile)

  let paneKilled: boolean | undefined
  let paneCleanupSkipped: string | undefined
  if (input.paneId) {
    if (input.paneId === input.leaderPaneId) {
      paneCleanupSkipped = 'pane cleanup skipped because it matches the current leader pane'
    } else if (!paneExists(input.paneId)) {
      paneCleanupSkipped = `pane ${input.paneId} already absent`
      paneKilled = false
    } else {
      killPane(input.paneId)
      paneKilled = true
    }
  }

  return {
    memberRemoved,
    sessionContextCleared: true,
    sessionFileRemoved,
    paneKilled,
    paneCleanupSkipped,
  }
}

function formatSpawnRollbackCleanup(cleanup: SpawnRollbackCleanup): string {
  const parts = [
    cleanup.memberRemoved ? 'reserved member removed' : 'reserved member was already absent',
    'session context cleared',
    cleanup.sessionFileRemoved ? 'worker session file removed' : 'worker session file already absent',
  ]
  if (cleanup.paneKilled === true) {
    parts.push('failed spawn pane killed')
  } else if (cleanup.paneCleanupSkipped) {
    parts.push(cleanup.paneCleanupSkipped)
  }
  return parts.join('; ')
}

function failedSpawnResult(input: {
  text: string
  roleAgentModel: string | undefined
  modelLabel: string
  modelSource: SpawnResult['modelSource']
  configDiagnostics: ReturnType<typeof summarizeConfigDiagnostics>['actionable']
  workerName: string
  sessionFile: string
  paneId?: string
  cleanup: SpawnRollbackCleanup
}): SpawnResult {
  const modelResult = spawnResultPatch(input.roleAgentModel, input.modelSource, input.configDiagnostics)
  return {
    ok: false,
    text: appendModelAndDiagnostics(`${input.text}. Cleanup: ${formatSpawnRollbackCleanup(input.cleanup)}`, input.modelLabel, modelResult.modelSource, input.configDiagnostics),
    memberName: input.workerName,
    sessionFile: input.sessionFile,
    paneId: input.paneId,
    rollbackCleanup: input.cleanup,
    ...modelResult,
  }
}

export async function spawnWorkerMember(
  deps: ToolHandlerDeps,
  team: TeamState,
  assignment: TeamSpawnInput,
  leaderCwd: string,
): Promise<SpawnResult> {
  const workerNameValidation = deps.validateNewWorkerName(assignment.name)
  const workerName = workerNameValidation.normalized
  if (!workerNameValidation.ok) {
    return { ok: false, text: workerNameValidation.message, memberName: workerName }
  }
  if (!workerName) {
    return { ok: false, text: 'Teammate name cannot be empty after normalization' }
  }
  if (team.members[workerName]) {
    return { ok: false, text: `Member ${workerName} already exists` }
  }
  const sessionFile = getWorkerSessionPath(team.name, workerName)
  const cwd = assignment.cwd ?? leaderCwd
  const roleResolution = resolveSpawnRole(assignment.role, assignment.name)
  if (!roleResolution.ok) {
    return { ok: false, text: roleResolution.text }
  }
  const { normalizedRole, roleAgent } = roleResolution
  const configDiagnosticSummary = summarizeConfigDiagnostics(roleResolution.configDiagnostics)
  const configDiagnostics = configDiagnosticSummary.actionable
  const modelLabel = roleAgent.modelLabel ?? effectiveModelLabel(roleAgent.model)
  const modelResult = spawnResultPatch(roleAgent.model, roleAgent.modelSource, configDiagnostics)
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
      status: 'offline',
      lastWakeReason: 'created waiting for bridge handshake',
      bridgeAvailable: false,
      bridgeLastError: 'waiting for bridge handshake',
    })
  })
  writeSessionContext(sessionFile, buildSessionContextForTeam(team, workerName))

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
    const cleanup = rollbackFailedWorkerSpawn({
      team,
      workerName,
      sessionFile,
      leaderPaneId: leader?.paneId,
    })
    return failedSpawnResult({
      text: `Failed to create tmux pane for ${workerName}: ${message}`,
      roleAgentModel: roleAgent.model,
      modelLabel,
      modelSource: modelResult.modelSource,
      configDiagnostics,
      workerName,
      sessionFile,
      cleanup,
    })
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
    const cleanup = rollbackFailedWorkerSpawn({
      team,
      workerName,
      sessionFile,
      paneId: pane.paneId,
      leaderPaneId: leader?.paneId,
    })
    return failedSpawnResult({
      text: `Failed to keep tmux pane alive for ${workerName}: Teammate tmux pane disappeared immediately after creation`,
      roleAgentModel: roleAgent.model,
      modelLabel,
      modelSource: modelResult.modelSource,
      configDiagnostics,
      workerName,
      sessionFile,
      paneId: pane.paneId,
      cleanup,
    })
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
    const cleanup = rollbackFailedWorkerSpawn({
      team,
      workerName,
      sessionFile,
      paneId: binding.paneId,
      leaderPaneId: leader?.paneId,
    })
    return failedSpawnResult({
      text: `Failed to start visible teammate session for ${workerName}: Timed out waiting for teammate pi process to start in tmux pane`,
      roleAgentModel: roleAgent.model,
      modelLabel,
      modelSource: modelResult.modelSource,
      configDiagnostics,
      workerName,
      sessionFile,
      paneId: binding.paneId,
      cleanup,
    })
  }

  const bridgeReady = await waitForBridgeReady(team.name, workerName)
  let deliveryRequestId: string | undefined
  let outboxEffectId: string | undefined
  let outboxStatus: InitialSpawnDeliveryResult['outboxStatus']
  const initialInstruction = initialWake ?? deferredBootPrompt
  if (initialInstruction) {
    const initialDelivery = await requestInitialSpawnDeliveryThroughOutbox(deps, team.name, workerName, initialInstruction)
    deliveryRequestId = initialDelivery.deliveryRequestId
    outboxEffectId = initialDelivery.outboxEffectId
    outboxStatus = initialDelivery.outboxStatus
  }
  if (bridgeReady) {
    commitWorkerSpawnState(team, latest => {
      const member = latest.members[workerName]
      if (!member) return
      updateMemberStatus(latest, workerName, {
        ...transitionWorkerFsm({
          member,
          event: initialInstruction ? 'deliveryRequested' : 'bridgeLeasePublished',
          reason: initialInstruction ? 'initial task busy via bridge delivery' : 'created idle; bridge ready',
        }).patch,
        bridgeAvailable: true,
        bridgeLastError: undefined,
        ...(initialInstruction ? { bootPrompt: initialInstruction } : {}),
      })
    })
  } else {
    const reason = initialInstruction
      ? 'bridge handshake timed out; initial task delivery pending'
      : 'bridge handshake timed out; worker visible, no initial task'
    commitWorkerSpawnState(team, latest => {
      const member = latest.members[workerName]
      if (!member) return
      updateMemberStatus(latest, workerName, {
        ...transitionWorkerFsm({
          member,
          event: 'bridgeUnavailable',
          reason,
          error: reason,
          hasPendingDelivery: Boolean(initialInstruction),
        }).patch,
        ...(initialInstruction ? { bootPrompt: initialInstruction } : {}),
      })
    })
  }
  const text = bridgeReady
    ? (initialInstruction
        ? `Created teammate ${workerName} (${normalizedRole}) in pane ${pane.paneId}; initial task delivery requested; worker busy`
        : `Created idle teammate ${workerName} (${normalizedRole}) in pane ${pane.paneId}; bridge ready`)
    : initialInstruction
      ? `Created teammate ${workerName} (${normalizedRole}) in pane ${pane.paneId}; initial task delivery pending; bridge not ready yet`
      : `Created idle teammate ${workerName} (${normalizedRole}) in pane ${pane.paneId}; bridge not ready yet; no initial task supplied`
  return {
    ok: true,
    text: appendModelAndDiagnostics(text, modelLabel, modelResult.modelSource, configDiagnostics),
    memberName: workerName,
    sessionFile,
    paneId: pane.paneId,
    bridgeReady,
    deliveryRequestId,
    outboxEffectId,
    outboxStatus,
    ...modelResult,
  }
}
