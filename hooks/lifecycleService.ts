import type { ExtensionContext } from '@mariozechner/pi-coding-agent'
import { updateMemberStatus, updateTeamState } from '../state.js'
import { getCurrentMemberName, getCurrentTeamName } from '../session.js'
import { TEAM_LEAD } from '../types.js'

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

  updateTeamState(teamName, team => {
    updateMemberStatus(team, memberName, {
      status: 'running',
      lastWakeReason: 'processing prompt',
      lastError: undefined,
    })
  })
  return memberName
}

export function markWorkerAgentIdleAfterTurn(ctx: ExtensionContext): void {
  const teamName = getCurrentTeamName(ctx)
  const memberName = getCurrentMemberName(ctx)
  if (!teamName || !memberName || memberName === TEAM_LEAD) return

  updateTeamState(teamName, team => {
    updateMemberStatus(team, memberName, {
      status: 'idle',
      lastWakeReason: 'finished turn',
      lastError: undefined,
    })
  })
}

export function markWorkerSessionShutdown(ctx: ExtensionContext): void {
  const teamName = getCurrentTeamName(ctx)
  const memberName = getCurrentMemberName(ctx)
  if (!teamName || !memberName || memberName === TEAM_LEAD) return

  updateTeamState(teamName, team => {
    updateMemberStatus(team, memberName, {
      status: 'idle',
      lastWakeReason: 'session shutdown',
    })
  })
}
