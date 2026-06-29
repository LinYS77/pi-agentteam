import { createAgentTeamKernelAdapter } from '../core/kernel.js'
import { runTmuxNoThrow } from './client.js'
import { refreshWindowPaneLabels, setPaneLabel } from './labels.js'
import { ensureSwarmWindow } from './windows.js'

export async function createTeammatePane(
  input: {
    name: string
    preferred?: { target?: string; leaderPaneId?: string }
    cwd?: string
    startCommand?: string
  },
  signal?: AbortSignal,
): Promise<{ paneId: string; target: string }> {
  const swarm = await ensureSwarmWindow(input.preferred, signal)
  const created = await createAgentTeamKernelAdapter().createTeammatePaneAsync({
    target: swarm.target,
    leaderPaneId: swarm.leaderPaneId,
    hasLeaderLayout: Boolean(process.env.TMUX),
    cwd: input.cwd,
    startCommand: input.startCommand,
  }, signal)
  if (!created.ok) {
    throw new Error(created.reason || 'Go worker lifecycle createTeammatePane unavailable (previous-helper-failure)')
  }

  await setPaneLabel(created.paneId, input.name, signal)
  await refreshWindowPaneLabels(created.target, signal)
  return { paneId: created.paneId, target: created.target }
}

export function killPane(paneId: string): void {
  try {
    createAgentTeamKernelAdapter().killPane(paneId)
  } catch (_) {}
}

export function clearPaneLabelSync(paneId: string): void {
  runTmuxNoThrow(['set-option', '-up', '-t', paneId, '@agentteam-name'])
  runTmuxNoThrow(['select-pane', '-t', paneId, '-T', ''])
}
