import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent'
import { maybeInjectLeaderOrchestrationContext } from '../orchestration.js'
import { readTeamState } from '../state.js'
import { getCurrentMemberName, getCurrentTeamName } from '../session.js'
import { TEAM_LEAD } from '../types.js'

type ContextHookState = {
  lastLeaderDigestKey: string
  lastLeaderDigestAt: number
  lastBlockedCountForDigest: number
  lastBlockedFingerprintsForDigest: string[]
}

type ContextDigestPatch = Partial<ContextHookState>

function updateContextDigestState(
  deps: Pick<ContextHookDeps, 'state' | 'updateDigestState'>,
  patch: ContextDigestPatch,
): void {
  if (deps.updateDigestState) {
    deps.updateDigestState(patch)
    return
  }
  Object.assign(deps.state, patch)
}

export type ContextHookDeps = {
  state: ContextHookState
  updateDigestState?: (patch: ContextDigestPatch) => void
  invalidateStatus: (ctx: ExtensionContext) => void
  runMailboxSync: (ctx: ExtensionContext) => void
}

const TEAM_INPUT_TRIGGER_RE = /\bagentteam\b|\bagent\s*team\b|\bteammate\b|\bsubagent\b|\bagentteam_(?:create|spawn|send|receive|task)\b|队友|队员/i
const TEAM_COMMAND_RE = /^\/(?:team(?:-(?:sync|delete|cleanup|remove-member))?)\b/i

function shouldSyncMailboxOnInput(event: { source?: string; text?: unknown }): boolean {
  if (event.source !== 'interactive') return false
  const text = String(event.text ?? '').trim()
  if (!text) return false
  if (text.startsWith('/')) {
    return TEAM_COMMAND_RE.test(text)
  }
  return TEAM_INPUT_TRIGGER_RE.test(text)
}

export function registerContextHooks(pi: ExtensionAPI, deps: ContextHookDeps): void {
  pi.on('context', async (event, ctx) => {
    const teamName = getCurrentTeamName(ctx)
    const memberName = getCurrentMemberName(ctx)
    const team = teamName ? readTeamState(teamName) : null

    const injected = maybeInjectLeaderOrchestrationContext(
      event as { messages: { role: string; content: unknown }[] },
      {
        team,
        memberName,
        state: {
          lastDigestKey: deps.state.lastLeaderDigestKey,
          lastDigestAt: deps.state.lastLeaderDigestAt,
          lastBlockedCount: deps.state.lastBlockedCountForDigest,
          lastBlockedFingerprints: deps.state.lastBlockedFingerprintsForDigest,
        },
      },
    )

    const digestStateChanged =
      injected.digestKey !== deps.state.lastLeaderDigestKey ||
      injected.digestAt !== deps.state.lastLeaderDigestAt ||
      injected.blockedCount !== deps.state.lastBlockedCountForDigest ||
      injected.blockedFingerprints.join('|') !== deps.state.lastBlockedFingerprintsForDigest.join('|')

    updateContextDigestState(deps, {
      lastLeaderDigestKey: injected.digestKey,
      lastLeaderDigestAt: injected.digestAt,
      lastBlockedCountForDigest: injected.blockedCount,
      lastBlockedFingerprintsForDigest: injected.blockedFingerprints,
    })

    if (injected.injected || digestStateChanged) {
      deps.invalidateStatus(ctx)
    }
    return injected.injected
  })

  pi.on('tool_result', async (_event, ctx) => {
    deps.runMailboxSync(ctx)
    deps.invalidateStatus(ctx)
  })

  pi.on('message_end', async (_event, ctx) => {
    deps.runMailboxSync(ctx)
    deps.invalidateStatus(ctx)
  })

  pi.on('input', async (event, ctx) => {
    if (!shouldSyncMailboxOnInput(event as { source?: string; text?: unknown })) return
    const teamName = getCurrentTeamName(ctx)
    const memberName = getCurrentMemberName(ctx)
    if (!teamName || memberName !== TEAM_LEAD) return
    deps.runMailboxSync(ctx)
    deps.invalidateStatus(ctx)
  })
}
