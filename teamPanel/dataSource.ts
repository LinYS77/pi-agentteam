import { ensureTeamStorageReady, reconcileTeamPanes } from '../adapters/runtime/session.js'
import { isMailboxMessageUnread } from '../messageLifecycle.js'
import { listAgentTeamPanes } from '../adapters/tmux/index.js'
import { readMailbox } from '../state/mailboxStore.js'
import { listTeams, readTeamState, updateTeamState } from '../state/teamStore.js'
import { listQuarantinedTeams } from '../state/validation.js'
import { summarizeOutboxEffects } from '../app/outboxDiagnostics.js'
import { listOutboxEffects } from '../state/outboxStore.js'
import { readOutboxDiagnosticsStore } from '../state/outboxDiagnosticsStore.js'
import { TEAM_LEAD } from '../internalTypes.js'
import { buildTeamAttentionSummary, hasUnreadBlockedReportAttention } from './viewModel.js'
import type {
  AttachedPanelData,
  GlobalPanelData,
  GlobalTeamMailboxProjection,
  LeaderMailboxItem,
  PanelData,
  TeamAttentionSummary,
  TeamRuntimeDiagnostics,
} from './viewModel.js'

function prepareTeamForPanel(team: NonNullable<ReturnType<typeof readTeamState>>): void {
  ensureTeamStorageReady(team)
  if (reconcileTeamPanes(team, { force: true })) {
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
  const teamSummaries: Record<string, TeamAttentionSummary> = {}
  const teamMailboxes: Record<string, GlobalTeamMailboxProjection> = {}
  const teamDiagnostics: Record<string, TeamRuntimeDiagnostics> = {}
  const knownPaneIds = new Set<string>()
  for (const team of teams) {
    prepareTeamForPanel(team)
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

  const orphanPanes = listAgentTeamPanes()
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
