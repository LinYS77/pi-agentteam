import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import {
  markWorkerAgentIdleAfterTurn,
  markWorkerAgentRunning,
} from './lifecycleService.js'

type AgentHookDeps = {
  runMailboxSync: (ctx: ExtensionContext) => void
  refreshStatus: (ctx: ExtensionContext) => void
  runOutboxMaintenance?: (ctx: ExtensionContext) => void
  pumpWorkerBridge?: (ctx: ExtensionContext) => void
}

function pumpWorkerBridgeIfEnabled(ctx: ExtensionContext, deps: AgentHookDeps): void {
  deps.pumpWorkerBridge?.(ctx)
}

export function registerAgentHooks(pi: ExtensionAPI, deps: AgentHookDeps): void {
  pi.on('agent_start', async (_event, ctx) => {
    const memberName = markWorkerAgentRunning(ctx)
    if (!memberName) return

    deps.runOutboxMaintenance?.(ctx)
    pumpWorkerBridgeIfEnabled(ctx, deps)
    deps.refreshStatus(ctx)
  })

  pi.on('agent_end', async (_event, ctx) => {
    markWorkerAgentIdleAfterTurn(ctx, {
      isIdle: () => typeof ctx.isIdle === 'function' ? ctx.isIdle() : true,
      hasPendingMessages: () => typeof ctx.hasPendingMessages === 'function' ? ctx.hasPendingMessages() : false,
    })
    deps.runOutboxMaintenance?.(ctx)
    deps.runMailboxSync(ctx)
    deps.refreshStatus(ctx)
  })
}
