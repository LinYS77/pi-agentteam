import { setTimeout as sleep } from 'node:timers/promises'
import { runTmuxNoThrowAsync } from './client.js'
import { SHELL_COMMANDS } from './core.js'

export async function waitForPaneAppStart(
  paneId: string,
  timeoutMs = 15000,
  signal?: AbortSignal,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (signal?.aborted) return false
    const current = await runTmuxNoThrowAsync(['display-message', '-p', '-t', paneId, '#{pane_current_command}'], undefined, signal)
    if (current.ok) {
      const command = current.stdout.trim()
      if (command && !SHELL_COMMANDS.has(command)) return true
    }
    const remaining = Math.max(0, deadline - Date.now())
    await sleep(Math.min(200, remaining), undefined, { signal }).catch(() => undefined)
  }
  return false
}
