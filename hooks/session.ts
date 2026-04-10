import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent'
import { readTeamState, updateMemberStatus, writeTeamState } from '../state.js'
import { getCurrentMemberName, getCurrentTeamName } from '../session.js'
import { TEAM_LEAD } from '../types.js'

type SessionHookState = {
  lastLeaderDigestKey: string
  lastLeaderDigestAt: number
  lastBlockedCountForDigest: number
  lastBlockedFingerprintsForDigest: string[]
}

type SessionDigestPatch = Partial<SessionHookState>

function updateSessionDigestState(
  deps: Pick<SessionHookDeps, 'state' | 'updateDigestState'>,
  patch: SessionDigestPatch,
): void {
  if (deps.updateDigestState) {
    deps.updateDigestState(patch)
    return
  }
  Object.assign(deps.state, patch)
}

export type SessionHookDeps = {
  state: SessionHookState
  updateDigestState?: (patch: SessionDigestPatch) => void
  attachCurrentSessionIfNeeded: (
    ctx: ExtensionContext,
  ) => {
    context: { teamName: string | null; memberName: string | null }
    source: 'cached' | 'derived' | 'cleared' | 'none'
  }
  invalidateStatus: (ctx: ExtensionContext) => void
  runMailboxSync: (ctx: ExtensionContext) => void
}

function resetDigestState(deps: Pick<SessionHookDeps, 'state' | 'updateDigestState'>): void {
  updateSessionDigestState(deps, {
    lastLeaderDigestKey: '',
    lastLeaderDigestAt: 0,
    lastBlockedCountForDigest: 0,
    lastBlockedFingerprintsForDigest: [],
  })
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

    const teamName = getCurrentTeamName(ctx)
    const memberName = getCurrentMemberName(ctx)
    if (!teamName || !memberName || memberName === TEAM_LEAD) return

    const team = readTeamState(teamName)
    if (!team) return

    updateMemberStatus(team, memberName, {
      status: 'idle',
      lastWakeReason: 'session shutdown',
    })
    writeTeamState(team)
  })
}
