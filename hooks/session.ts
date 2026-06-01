import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { HookDigestPatch, HookDigestState } from './lifecycleService.js'
import {
  markWorkerSessionShutdown,
  resetDigestState,
} from './lifecycleService.js'

export type AttachedSessionHookContext = {
  context: { teamName: string | null; memberName: string | null }
  source: 'cached' | 'derived' | 'cleared' | 'none'
}

export type SessionHookDeps = {
  state: HookDigestState
  updateDigestState?: (patch: HookDigestPatch) => void
  startWorkerBridge?: (ctx: ExtensionContext, attached: { teamName: string | null; memberName: string | null }) => void
  stopWorkerBridge?: (ctx: ExtensionContext) => void
  startLeaderMailboxProjectionWatcher?: (ctx: ExtensionContext, attached: AttachedSessionHookContext) => void
  stopLeaderMailboxProjectionWatcher?: (ctx: ExtensionContext) => void
  attachCurrentSessionIfNeeded: (
    ctx: ExtensionContext,
  ) => AttachedSessionHookContext
  invalidateStatus: (ctx: ExtensionContext) => void
  runMailboxSync: (ctx: ExtensionContext) => void
  runOutboxMaintenance?: (ctx: ExtensionContext) => void | Promise<unknown>
}

export function registerSessionHooks(pi: ExtensionAPI, deps: SessionHookDeps): void {
  pi.on('session_start', async (_event, ctx) => {
    const attached = deps.attachCurrentSessionIfNeeded(ctx)
    resetDigestState(deps)
    deps.invalidateStatus(ctx)
    await deps.runOutboxMaintenance?.(ctx)
    deps.runMailboxSync(ctx)
    deps.startLeaderMailboxProjectionWatcher?.(ctx, attached)
    deps.startWorkerBridge?.(ctx, attached.context)

    if (attached.source === 'derived' && attached.context.teamName) {
      ctx.ui.notify(`Attached agentteam ${attached.context.teamName} to resumed session`, 'info')
    }
  })

  pi.on('session_shutdown', async (_event, ctx) => {
    resetDigestState(deps)
    deps.stopLeaderMailboxProjectionWatcher?.(ctx)
    deps.stopWorkerBridge?.(ctx)
    markWorkerSessionShutdown(ctx)
  })
}
