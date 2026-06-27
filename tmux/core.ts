import { createAgentTeamKernelAdapter } from '../core/kernel.js'
export {
  captureTmuxSnapshot,
  findPaneInSnapshot,
  listAgentTeamPanesFromSnapshot,
  paneExistsInSnapshot,
  parseTmuxPaneSnapshot,
  resolvePaneBindingFromSnapshot,
  TMUX_PANE_SNAPSHOT_FORMAT,
} from './snapshot.js'
export type {
  TmuxPaneSnapshotItem,
  TmuxSnapshot,
  TmuxSnapshotPaneBinding,
} from './snapshot.js'

type PaneBinding = {
  paneId: string
  target: string
}

type AgentTeamPaneInfo = {
  paneId: string
  target: string
  label: string
  currentCommand: string
}

export type PaneInspection = {
  paneId: string
  exists: boolean
  currentCommand?: string
  inMode?: boolean
  mode?: string
  copyMode?: boolean
  error?: string
}

export const SWARM_SESSION = 'pi-agentteam'
export const SWARM_WINDOW = 'agentteam'
export const SHELL_COMMANDS = new Set(['bash', 'zsh', 'fish', 'sh'])

export function shellEscapeArg(text: string): string {
  return `'${text.replace(/'/g, `"'"'`)}'`
}

export function isInsideTmux(): boolean {
  return Boolean(process.env.TMUX)
}

export async function ensureTmuxAvailable(signal?: AbortSignal): Promise<void> {
  const result = await createAgentTeamKernelAdapter().checkTmuxAvailableAsync(signal)
  if (!result.ok) {
    const suffix = result.failureKind ? ` (${result.failureKind})` : ''
    throw new Error(`tmux is required for agentteam panes${suffix}`)
  }
}

export function inspectPane(paneId: string): PaneInspection {
  const result = createAgentTeamKernelAdapter().inspectWorkerPane(paneId)
  if (!result.ok) {
    return {
      paneId,
      exists: false,
      error: result.error || result.reason,
    }
  }
  return {
    paneId: result.paneId || paneId,
    exists: true,
    currentCommand: result.currentCommand,
    inMode: result.inMode,
    mode: result.mode,
    copyMode: result.copyMode,
  }
}

export function paneExists(paneId: string): boolean {
  return Boolean(paneId && inspectPane(paneId).exists)
}

export function resolvePaneBinding(paneId: string): PaneBinding | null {
  if (!paneId) return null
  const result = createAgentTeamKernelAdapter().inspectWorkerPane(paneId)
  if (!result.ok || !result.target) return null
  return {
    paneId: result.paneId || paneId,
    target: result.target,
  }
}

export async function resolvePaneBindingAsync(paneId: string, signal?: AbortSignal): Promise<PaneBinding | null> {
  if (!paneId) return null
  const result = await createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)
  if (!result.ok || !result.target) return null
  return {
    paneId: result.paneId || paneId,
    target: result.target,
  }
}

export async function windowExists(target: string, signal?: AbortSignal): Promise<boolean> {
  if (!target) return false
  const result = await createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)
  return result.ok
}

export async function firstPaneInWindow(target: string, signal?: AbortSignal): Promise<string | null> {
  if (!target) return null
  const result = await createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)
  if (!result.ok || result.paneIds.length === 0) return null
  return result.paneIds[0] ?? null
}

export function captureCurrentPaneBinding(): { paneId: string; target: string } | null {
  if (!isInsideTmux()) return null
  const result = createAgentTeamKernelAdapter().captureCurrentPaneBinding()
  if (!result.ok || !result.paneId || !result.target) return null
  return {
    paneId: result.paneId,
    target: result.target,
  }
}

export function targetForPaneId(paneId: string): string | null {
  return resolvePaneBinding(paneId)?.target ?? null
}

export function listAgentTeamPanes(): AgentTeamPaneInfo[] {
  const result = createAgentTeamKernelAdapter().listAgentTeamPanes()
  return result.ok ? result.panes : []
}
