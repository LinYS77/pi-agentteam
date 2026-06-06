import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { initializeStateStores } from './state/init.js'
import { registerSessionHooks } from './hooks/session.js'
import { registerContextHooks } from './hooks/context.js'
import { registerAgentHooks } from './hooks/agent.js'
import { registerToolGuardHooks } from './hooks/toolGuard.js'
import { registerAgentTeamCommands } from './api/commands.js'
import { registerAgentTeamTools } from './api/tools.js'
import {
  assertValidOwner,
  classifySpawnTask,
  currentActor,
  deleteTeamRuntime,
  ensureTeamForSession,
  healMemberPaneBinding,
  isLeaderInsideTmux,
  normalizeOwnerName,
  sanitizeTeamName,
  requestLeaderAttentionIfNeeded,
  requestWorkerDelivery,
  sanitizeWorkerName,
  validateNewTeamName,
  validateNewWorkerName,
} from './adapters/runtime/session.js'
import { createRuntimeService } from './adapters/runtime/service.js'
import {
  pumpWorkerBridgeForContext,
  startWorkerBridgeForContext,
  stopWorkerBridge,
} from './adapters/bridge/index.js'
import { createOutboxRunner } from './app/effectRunner.js'
import { createFileBackedOutboxEffectHandlers } from './adapters/runtime/outboxEffectHandlers.js'
import { fileBackedOutboxStorePort } from './adapters/runtime/outboxStorePort.js'
import { fileBackedTaskHistoryQueryPort, fileBackedTaskMutationPort, fileBackedTeamStatePort } from './adapters/runtime/appStatePorts.js'
import { fileBackedMailboxRepositoryPort } from './adapters/runtime/mailboxPorts.js'
import { registerBeforeAgentStartPolicy } from './policy.js'
import { registerAgentTeamRenderers } from './renderers.js'

export default function agentTeamExtension(pi: ExtensionAPI): void {
  initializeStateStores()
  registerBeforeAgentStartPolicy(pi)
  registerAgentTeamRenderers(pi)
  registerToolGuardHooks(pi)

  const runtime = createRuntimeService(pi)

  registerSessionHooks(pi, {
    state: runtime.hookState,
    updateDigestState: runtime.updateDigestState,
    attachCurrentSessionIfNeeded: runtime.attachCurrentSessionIfNeeded,
    invalidateStatus: runtime.invalidateStatus,
    runMailboxSync: runtime.runMailboxSync,
    runOutboxMaintenance: runtime.runOutboxMaintenance,
    startLeaderMailboxProjectionWatcher: runtime.startLeaderMailboxProjectionWatcher,
    stopLeaderMailboxProjectionWatcher: runtime.stopLeaderMailboxProjectionWatcher,
    startWorkerBridge: (ctx, attached) => startWorkerBridgeForContext(pi, ctx, attached),
    stopWorkerBridge,
  })

  registerContextHooks(pi, {
    state: runtime.hookState,
    updateDigestState: runtime.updateDigestState,
    refreshStatus: runtime.refreshStatus,
    runMailboxSync: runtime.runMailboxSync,
    runOutboxMaintenance: runtime.runOutboxMaintenance,
  })

  registerAgentHooks(pi, {
    runMailboxSync: runtime.runMailboxSync,
    refreshStatus: runtime.refreshStatus,
    runOutboxMaintenance: runtime.runOutboxMaintenance,
    pumpWorkerBridge: pumpWorkerBridgeForContext,
  })

  registerAgentTeamCommands(pi, {
    deleteTeamRuntime,
    invalidateStatus: runtime.invalidateStatus,
    resetMailboxSyncKey: runtime.resetMailboxSyncKey,
    runMailboxSync: runtime.runMailboxSync,
    runOutboxMaintenance: runtime.runOutboxMaintenance,
  })

  const outboxHandlers = createFileBackedOutboxEffectHandlers({
    requestWorkerDelivery,
    requestLeaderAttentionIfNeeded,
  })
  const outboxRunner = {
    runOnce: createOutboxRunner({
      outboxStore: fileBackedOutboxStorePort,
      outboxHandlers,
    }),
  }

  registerAgentTeamTools(pi, {
    sanitizeTeamName,
    sanitizeWorkerName,
    validateNewTeamName,
    validateNewWorkerName,
    normalizeOwnerName,
    assertValidOwner,
    classifySpawnTask,
    ensureTeamForSession,
    currentActor,
    healMemberPaneBinding,
    isLeaderInsideTmux,
    outboxStore: fileBackedOutboxStorePort,
    outboxRunner,
    outboxHandlers,
    teamState: fileBackedTeamStatePort,
    taskMutations: fileBackedTaskMutationPort,
    taskHistory: fileBackedTaskHistoryQueryPort,
    mailboxRepository: fileBackedMailboxRepositoryPort,
    requestWorkerDelivery,
    requestLeaderAttentionIfNeeded,
    invalidateStatus: runtime.invalidateStatus,
  })
}
