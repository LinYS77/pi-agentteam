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
import { recordPanelProfileEvent } from '../runtime/profiling.js'
import { toPanelMailboxItem, toPanelTeamModel } from './readModel.js'
import { buildTeamAttentionSummary, hasUnreadBlockedReportAttention } from './viewModel.js'
import type { TmuxSnapshot } from '../tmux/snapshot.js'
import type {
  AttachedPanelData,
  GlobalPanelData,
  GlobalTeamMailboxProjection,
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
  const startedAt = Date.now()
  const team = readTeamState(teamName)
  if (!team) return null
  prepareTeamForPanel(team)
  const panelTeam = toPanelTeamModel(team, 'attached')
  const members = Object.values(panelTeam.members)
    .filter(member => member.name !== TEAM_LEAD)
    .sort((a, b) => a.name.localeCompare(b.name))
  const tasks = Object.values(panelTeam.tasks).sort((a, b) => a.id.localeCompare(b.id))
  const mailbox = readMailbox(teamName, TEAM_LEAD)
    .map(toPanelMailboxItem)
    .sort((a, b) => b.createdAt - a.createdAt)
  const data: AttachedPanelData = { mode: 'attached', team: panelTeam, members, tasks, mailbox, outboxDiagnostics: outboxDiagnosticsSummary(team.name) }
  recordPanelProfileEvent({
    kind: 'dataLoad',
    mode: 'attached',
    durationMs: Date.now() - startedAt,
    teamCount: 1,
    taskCount: tasks.length,
    memberCount: members.length,
    mailboxProjectionCount: mailbox.length,
    orphanPaneCount: 0,
  })
  return data
}

function loadGlobalPanelData(): GlobalPanelData {
  const startedAt = Date.now()
  const teams = listTeams()
  const panelTeams: GlobalPanelData['teams'] = []
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
    const panelTeam = toPanelTeamModel(team, 'global')
    const leaderMailboxItems = leaderMailbox.map(toPanelMailboxItem)
    panelTeams.push(panelTeam)
    teamSummaries[team.name] = buildTeamAttentionSummary(panelTeam, leaderMailboxItems)
    teamMailboxes[team.name] = {
      total: leaderMailbox.length,
      unread: leaderMailbox.filter(isMailboxMessageUnread).length,
      blocked: leaderMailboxItems.filter(hasUnreadBlockedReportAttention).length,
      latestAttention: latestAttention ? toPanelMailboxItem(latestAttention) : undefined,
    }
    teamDiagnostics[team.name] = { outbox: outboxDiagnosticsSummary(team.name) }
  }

  const orphanPanes = (snapshot.ok === false ? listAgentTeamPanes() : listAgentTeamPanesFromSnapshot(snapshot))
    .filter(pane => !knownPaneIds.has(pane.paneId))
    .sort((a, b) => a.paneId.localeCompare(b.paneId))

  const data: GlobalPanelData = { mode: 'global', teams: panelTeams, teamSummaries, teamMailboxes, teamDiagnostics, quarantinedTeams: listQuarantinedTeams(), orphanPanes }
  recordPanelProfileEvent({
    kind: 'dataLoad',
    mode: 'global',
    durationMs: Date.now() - startedAt,
    teamCount: panelTeams.length,
    taskCount: panelTeams.reduce((sum, team) => sum + Object.keys(team.tasks).length, 0),
    memberCount: panelTeams.reduce((sum, team) => sum + Object.values(team.members).filter(member => member.name !== TEAM_LEAD).length, 0),
    mailboxProjectionCount: Object.values(teamMailboxes).reduce((sum, mailbox) => sum + mailbox.total, 0),
    orphanPaneCount: orphanPanes.length,
  })
  return data
}

export function loadPanelData(teamName?: string | null): PanelData {
  if (teamName) {
    const attached = loadAttachedPanelData(teamName)
    if (attached) return attached
  }
  return loadGlobalPanelData()
}
