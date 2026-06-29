import { createAgentTeamKernelAdapter } from '../core/kernel.js'
import { runTmuxAsync } from './client.js'
import {
  ensureTmuxAvailable,
  captureCurrentPaneBinding,
  firstPaneInWindow,
  isInsideTmux,
  resolvePaneBindingAsync,
  SWARM_SESSION,
  SWARM_WINDOW,
  windowExists,
} from './core.js'
import {
  markWindowAsAgentTeam,
  refreshWindowPaneLabels,
} from './labels.js'

async function findAgentTeamWindowTarget(sessionName: string, signal?: AbortSignal): Promise<string | null> {
  if (!sessionName || signal?.aborted) return null
  const result = await createAgentTeamKernelAdapter().findAgentTeamWindowTargetAsync(sessionName, signal)
  if (!result.ok || !result.target) return null
  return result.target
}

async function findWindowTargetByName(sessionName: string, windowName: string, signal?: AbortSignal): Promise<string | null> {
  if (!sessionName || !windowName || signal?.aborted) return null
  const result = await createAgentTeamKernelAdapter().findWindowTargetByNameAsync(sessionName, windowName, signal)
  if (!result.ok || !result.target) return null
  return result.target
}

export async function ensureSwarmWindow(
  preferred?: { target?: string; leaderPaneId?: string },
  signal?: AbortSignal,
): Promise<{ session: string; window: string; target: string; leaderPaneId: string }> {
  await ensureTmuxAvailable(signal)

  if (isInsideTmux()) {
    const preferredBinding = preferred?.leaderPaneId ? await resolvePaneBindingAsync(preferred.leaderPaneId, signal) : null
    const preferredTarget = preferredBinding?.target ?? (preferred?.target && await windowExists(preferred.target, signal) ? preferred.target : null)
    let currentBinding: { paneId: string; target: string } | null | undefined
    const getCurrentBinding = (): { paneId: string; target: string } | null => {
      currentBinding ??= captureCurrentPaneBinding()
      return currentBinding
    }
    const target = preferredTarget ?? getCurrentBinding()?.target
    if (!target) throw new Error('Failed to resolve current tmux pane binding')
    const leaderPaneId = preferredBinding?.paneId ?? await firstPaneInWindow(target, signal) ?? getCurrentBinding()?.paneId
    if (!leaderPaneId) throw new Error('Failed to resolve current tmux pane binding')
    await markWindowAsAgentTeam(target, signal)
    await refreshWindowPaneLabels(target, signal)
    return {
      session: target.split(':')[0]!,
      window: target.split(':')[1]!,
      target,
      leaderPaneId,
    }
  }

  const sessionResult = await createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)
  const hasSession = sessionResult.ok && sessionResult.exists
  if (!hasSession) {
    const createdSession = await createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)
    if (!createdSession.ok) {
      throw new Error(createdSession.reason || 'Go worker lifecycle createDetachedSwarmSession unavailable (previous-helper-failure)')
    }
    await markWindowAsAgentTeam(`${SWARM_SESSION}:${SWARM_WINDOW}`, signal)
  }

  let initialTarget = await findAgentTeamWindowTarget(SWARM_SESSION, signal)
  if (!initialTarget) {
    await runTmuxAsync(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW], undefined, signal)
    initialTarget = await findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)
    if (!initialTarget) {
      throw new Error('Failed to locate agentteam tmux window after creation')
    }
    await markWindowAsAgentTeam(initialTarget, signal)
  }

  const leaderPaneId = await firstPaneInWindow(initialTarget, signal)
  if (!leaderPaneId) throw new Error('Failed to resolve agentteam leader pane')
  const binding = await resolvePaneBindingAsync(leaderPaneId, signal)
  const target = binding?.target
  if (!target) throw new Error('Failed to resolve agentteam leader pane binding')
  await markWindowAsAgentTeam(target, signal)
  await refreshWindowPaneLabels(target, signal)
  return { session: target.split(':')[0]!, window: target.split(':')[1]!, target, leaderPaneId }
}
