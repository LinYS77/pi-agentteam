import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { updateMemberStatus, updateTeamState } from '../state/teamStore.js'
import { markBridgeAgentEnd, markBridgeAgentStart, type BridgeLifecycleContext } from '../adapters/bridge/index.js'
import { transitionWorkerFsm } from '../runtime/workerFsm.js'
import { getCurrentMemberName, getCurrentTeamName } from '../session.js'
import { TEAM_LEAD } from '../internalTypes.js'

export type HookDigestState = {
  lastLeaderDigestKey: string
  lastLeaderDigestAt: number
  lastBlockedCountForDigest: number
  lastBlockedFingerprintsForDigest: string[]
}

export type HookDigestPatch = Partial<HookDigestState>

export function updateHookDigestState(
  deps: { state: HookDigestState; updateDigestState?: (patch: HookDigestPatch) => void },
  patch: HookDigestPatch,
): void {
  if (deps.updateDigestState) {
    deps.updateDigestState(patch)
    return
  }
  Object.assign(deps.state, patch)
}

export function resetDigestState(
  deps: { state: HookDigestState; updateDigestState?: (patch: HookDigestPatch) => void },
): void {
  updateHookDigestState(deps, {
    lastLeaderDigestKey: '',
    lastLeaderDigestAt: 0,
    lastBlockedCountForDigest: 0,
    lastBlockedFingerprintsForDigest: [],
  })
}

export function markWorkerAgentRunning(ctx: ExtensionContext): string | null {
  const teamName = getCurrentTeamName(ctx)
  const memberName = getCurrentMemberName(ctx)
  if (!teamName || !memberName || memberName === TEAM_LEAD) return null

  markBridgeAgentStart(teamName, memberName)
  return memberName
}

export function markWorkerAgentIdleAfterTurn(ctx: ExtensionContext, lifecycleCtx: BridgeLifecycleContext = {}): void {
  const teamName = getCurrentTeamName(ctx)
  const memberName = getCurrentMemberName(ctx)
  if (!teamName || !memberName || memberName === TEAM_LEAD) return

  markBridgeAgentEnd(teamName, memberName, lifecycleCtx)
}

export function markWorkerSessionShutdown(ctx: ExtensionContext): void {
  const teamName = getCurrentTeamName(ctx)
  const memberName = getCurrentMemberName(ctx)
  if (!teamName || !memberName || memberName === TEAM_LEAD) return

  updateTeamState(teamName, team => {
    const member = team.members[memberName]
    if (!member) return
    if (member.status === 'error') {
      updateMemberStatus(team, memberName, {
        lastWakeReason: member.lastWakeReason ?? 'session shutdown while error',
      })
      return
    }
    updateMemberStatus(team, memberName, {
      ...transitionWorkerFsm({ member, event: 'sessionShutdown', reason: 'session shutdown' }).patch,
      lastWakeReason: 'session shutdown',
    })
  })
}
