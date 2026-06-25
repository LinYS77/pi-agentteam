import { createAgentTeamKernelAdapter, type AgentTeamKernelCutoverFailureKind } from '../core/kernel.js'
import { runTmuxNoThrow } from './client.js'

export type TmuxPaneSnapshotItem = {
  paneId: string
  target: string
  label: string
  currentCommand: string
}

export type TmuxSnapshot = {
  capturedAt: number
  panes: TmuxPaneSnapshotItem[]
  byPaneId: Record<string, TmuxPaneSnapshotItem>
  ok?: boolean
  error?: string
  status?: 'unknown'
  resultMarker?: 'stale'
  module?: 'tmuxSnapshotParse'
  capability?: 'tmuxSnapshotParse'
  cutoverFailureKind?: AgentTeamKernelCutoverFailureKind
  reason?: string
}

export type TmuxSnapshotPaneBinding = {
  paneId: string
  target: string
  label: string
}

export const TMUX_PANE_SNAPSHOT_FORMAT = '#{pane_id}\t#{session_name}:#{window_id}\t#{@agentteam-name}\t#{pane_current_command}'

function emptySnapshot(capturedAt: number, ok = true, error?: string): TmuxSnapshot {
  return {
    capturedAt,
    panes: [],
    byPaneId: {},
    ok,
    ...(ok === false ? { status: 'unknown' as const, resultMarker: 'stale' as const } : {}),
    ...(error === undefined ? {} : { error }),
  }
}

export function parseTmuxPaneSnapshot(stdout: string, capturedAt = Date.now()): TmuxSnapshot {
  return createAgentTeamKernelAdapter().parseTmuxPaneSnapshot(stdout, capturedAt)
}

export function findPaneInSnapshot(snapshot: TmuxSnapshot, paneId: string): TmuxPaneSnapshotItem | null {
  if (!paneId) return null
  return snapshot.byPaneId[paneId] ?? null
}

export function paneExistsInSnapshot(snapshot: TmuxSnapshot, paneId: string): boolean {
  return findPaneInSnapshot(snapshot, paneId) !== null
}

export function resolvePaneBindingFromSnapshot(snapshot: TmuxSnapshot, paneId: string): TmuxSnapshotPaneBinding | null {
  const pane = findPaneInSnapshot(snapshot, paneId)
  if (!pane) return null
  return {
    paneId: pane.paneId,
    target: pane.target,
    label: pane.label,
  }
}

export function listAgentTeamPanesFromSnapshot(snapshot: TmuxSnapshot): TmuxPaneSnapshotItem[] {
  return snapshot.panes.filter(item => item.paneId && item.label)
}

export function captureTmuxSnapshot(capturedAt = Date.now()): TmuxSnapshot {
  const result = runTmuxNoThrow([
    'list-panes',
    '-a',
    '-F',
    TMUX_PANE_SNAPSHOT_FORMAT,
  ])
  if (!result.ok) return emptySnapshot(capturedAt, false, result.stderr || 'tmux list-panes failed')
  if (!result.stdout) return emptySnapshot(capturedAt)
  return parseTmuxPaneSnapshot(result.stdout, capturedAt)
}
