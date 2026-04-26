import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent'
import type { HookDigestPatch, HookDigestState } from './lifecycleService.js'
import {
  markWorkerSessionShutdown,
  resetDigestState,
} from './lifecycleService.js'

export type SessionHookDeps = {
  state: HookDigestState
  updateDigestState?: (patch: HookDigestPatch) => void
  attachCurrentSessionIfNeeded: (
    ctx: ExtensionContext,
  ) => {
    context: { teamName: string | null; memberName: string | null }
    source: 'cached' | 'derived' | 'cleared' | 'none'
  }
  invalidateStatus: (ctx: ExtensionContext) => void
  runMailboxSync: (ctx: ExtensionContext) => void
}

export function registerSessionHooks(pi: ExtensionAPI, deps: SessionHookDeps): void {
  pi.on('session_start', async (_event, ctx) => {
    const attached = deps.attachCurrentSessionIfNeeded(ctx)
    resetDigestState(deps)
    deps.invalidateStatus(ctx)
    deps.runMailboxSync(ctx)

    if (attached.source === 'derived' && attached.context.teamName) {
      ctx.ui.notify(`Attached agentteam ${attached.context.teamName} to resumed session`, 'info')
    }
  })

  pi.on('session_shutdown', async (_event, ctx) => {
    resetDigestState(deps)
    markWorkerSessionShutdown(ctx)
  })
}
