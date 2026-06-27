import { setTimeout as sleep } from 'node:timers/promises'
import { createAgentTeamKernelAdapter } from '../core/kernel.js'
import { SHELL_COMMANDS } from './core.js'

export async function waitForPaneAppStart(
  paneId: string,
  timeoutMs = 15000,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!paneId || signal?.aborted) return false
  const deadline = Date.now() + timeoutMs
  if (Date.now() >= deadline) return false
  const kernel = createAgentTeamKernelAdapter()
  while (Date.now() < deadline) {
    if (signal?.aborted) return false
    const inspection = await kernel.inspectWorkerPaneAsync(paneId, signal).catch(() => undefined)
    if (inspection?.ok) {
      const command = (inspection.currentCommand || '').trim()
      if (command && !SHELL_COMMANDS.has(command)) return true
    }
    if (signal?.aborted) return false
    const remaining = Math.max(0, deadline - Date.now())
    if (remaining <= 0) break
    await sleep(Math.min(200, remaining), undefined, { signal }).catch(() => undefined)
  }
  return false
}
