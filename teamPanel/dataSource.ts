import { ensureTeamStorageReady, reconcileTeamPanes } from '../adapters/runtime/session.js'
import { isMailboxMessageUnread } from '../messageLifecycle.js'
import { captureTmuxSnapshot, listAgentTeamPanes, listAgentTeamPanesFromSnapshot } from '../adapters/tmux/index.js'
import { readMailbox } from '../state/mailboxStore.js'
import { listTeams, readTeamState, updateTeamState } from '../state/teamStore.js'
import { listQuarantinedTeams } from '../state/validation.js'
import { summarizeOutboxEffects } from '../app/outboxDiagnostics.js'
import { listOutboxEffects } from '../state/outboxStore.js'
import { readOutboxDiagnosticsStore } from '../state/outboxDiagnosticsStore.js'
import { TEAM_LEAD } from '../internalTypes.js'
import { buildTeamAttentionSummary, hasUnreadBlockedReportAttention } from './viewModel.js'
import type { TmuxSnapshot } from '../tmux/snapshot.js'
import type {
  AttachedPanelData,
  GlobalPanelData,
  GlobalTeamMailboxProjection,
  LeaderMailboxItem,
  PanelData,
  TeamAttentionSummary,
  TeamRuntimeDiagnostics,
} from './viewModel.js'

const defaultListAgentTeamPanes = listAgentTeamPanes

function mergeSnapshotPanes(snapshot: TmuxSnapshot, panes: ReturnType<typeof listAgentTeamPanes>): TmuxSnapshot {
  if (panes.length === 0) return snapshot
  const byPaneId: TmuxSnapshot['byPaneId'] = { ...snapshot.byPaneId }
  const order = snapshot.panes.map(pane => pane.paneId)
  for (const pane of panes) {
    if (!byPaneId[pane.paneId]) order.push(pane.paneId)
    byPaneId[pane.paneId] = pane
  }
  return {
    capturedAt: snapshot.capturedAt,
    panes: order.map(paneId => byPaneId[paneId]!).filter(Boolean),
    byPaneId,
    ok: true,
  }
}

function captureGlobalPanelSnapshot(): TmuxSnapshot {
  const snapshot = captureTmuxSnapshot()
  const listAgentTeamPanesWasPatched = listAgentTeamPanes !== defaultListAgentTeamPanes
  if (!listAgentTeamPanesWasPatched) return snapshot
  return mergeSnapshotPanes(snapshot, listAgentTeamPanes())
}

function prepareTeamForPanel(team: NonNullable<ReturnType<typeof readTeamState>>, options?: { snapshot?: TmuxSnapshot }): void {
  ensureTeamStorageReady(team)
  if (reconcileTeamPanes(team, options?.snapshot ? { mode: 'light', snapshot: options.snapshot } : undefined)) {
    updateTeamState(team.name, () => team)
  }
}

function outboxDiagnosticsSummary(teamName: string) {
  return summarizeOutboxEffects(listOutboxEffects(teamName), readOutboxDiagnosticsStore(teamName))
}

function loadAttachedPanelData(teamName: string): AttachedPanelData | null {
  const team = readTeamState(teamName)
  if (!team) return null
  prepareTeamForPanel(team)
  const members = Object.values(team.members)
    .filter(member => member.name !== TEAM_LEAD)
    .sort((a, b) => a.name.localeCompare(b.name))
  const tasks = Object.values(team.tasks).sort((a, b) => a.id.localeCompare(b.id))
  const mailbox = (readMailbox(teamName, TEAM_LEAD) as LeaderMailboxItem[])
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
  return { mode: 'attached', team, members, tasks, mailbox, outboxDiagnostics: outboxDiagnosticsSummary(team.name) }
}

function loadGlobalPanelData(): GlobalPanelData {
  const teams = listTeams()
  const snapshot = captureGlobalPanelSnapshot()
  const teamSummaries: Record<string, TeamAttentionSummary> = {}
  const teamMailboxes: Record<string, GlobalTeamMailboxProjection> = {}
  const teamDiagnostics: Record<string, TeamRuntimeDiagnostics> = {}
  const knownPaneIds = new Set<string>()
  for (const team of teams) {
    prepareTeamForPanel(team, { snapshot })
    for (const member of Object.values(team.members)) {
      if (member.paneId) knownPaneIds.add(member.paneId)
    }
    const leaderMailbox = readMailbox(team.name, TEAM_LEAD)
    const latestAttention = leaderMailbox
      .filter(item => isMailboxMessageUnread(item))
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    teamSummaries[team.name] = buildTeamAttentionSummary(team, leaderMailbox)
    teamMailboxes[team.name] = {
      total: leaderMailbox.length,
      unread: leaderMailbox.filter(isMailboxMessageUnread).length,
      blocked: leaderMailbox.filter(hasUnreadBlockedReportAttention).length,
      latestAttention,
    }
    teamDiagnostics[team.name] = { outbox: outboxDiagnosticsSummary(team.name) }
  }

  const orphanPanes = (snapshot.ok === false ? listAgentTeamPanes() : listAgentTeamPanesFromSnapshot(snapshot))
    .filter(pane => !knownPaneIds.has(pane.paneId))
    .sort((a, b) => a.paneId.localeCompare(b.paneId))

  return { mode: 'global', teams, teamSummaries, teamMailboxes, teamDiagnostics, quarantinedTeams: listQuarantinedTeams(), orphanPanes }
}

export function loadPanelData(teamName?: string | null): PanelData {
  if (teamName) {
    const attached = loadAttachedPanelData(teamName)
    if (attached) return attached
  }
  return loadGlobalPanelData()
}
