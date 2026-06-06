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
    ...(error === undefined ? {} : { error }),
  }
}

export function parseTmuxPaneSnapshot(stdout: string, capturedAt = Date.now()): TmuxSnapshot {
  const byPaneId: Record<string, TmuxPaneSnapshotItem> = {}
  const order: string[] = []

  for (const line of String(stdout || '').split('\n')) {
    if (!line) continue
    const fields = line.split('\t')
    if (fields.length < 4) continue
    const [paneId = '', target = '', label = '', currentCommand = ''] = fields
    if (!paneId) continue
    if (!Object.prototype.hasOwnProperty.call(byPaneId, paneId)) {
      order.push(paneId)
    }
    byPaneId[paneId] = {
      paneId,
      target,
      label,
      currentCommand,
    }
  }

  return {
    capturedAt,
    panes: order.map(paneId => byPaneId[paneId]!).filter(Boolean),
    byPaneId,
    ok: true,
  }
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
