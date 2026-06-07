import { TEAM_LEAD } from '../internalTypes.js'
import { recordPanelProfileEvent } from '../runtime/profiling.js'
import { fileBackedRuntimeRepository, type RuntimeRepository } from '../runtime/repository.js'
import { fileBackedStateRepository, type StateRepository } from '../state/repository.js'
import { buildTeamAttentionSummary, hasUnreadBlockedReportAttention } from './viewModel.js'
import type {
  AttachedPanelData,
  GlobalPanelData,
  GlobalTeamMailboxProjection,
  PanelData,
  PanelMailboxItem,
  PanelTeamModel,
  TeamAttentionSummary,
  TeamRuntimeDiagnostics,
} from './viewModel.js'

type PanelDataSourceDeps = {
  stateRepository: StateRepository
  runtimeRepository: RuntimeRepository
}

const defaultDeps: PanelDataSourceDeps = {
  stateRepository: fileBackedStateRepository,
  runtimeRepository: fileBackedRuntimeRepository,
}

function toPanelMailboxItem(message: PanelMailboxItem): PanelMailboxItem {
  return { ...message }
}

function prepareTeamForPanel(
  deps: PanelDataSourceDeps,
  teamName: string,
  mode: 'attached' | 'global',
  options?: Parameters<RuntimeRepository['prepareTeamForPanel']>[1],
): PanelTeamModel | null {
  const team = deps.stateRepository.readTeamForPanel(teamName)
  if (!team) return null
  if (deps.runtimeRepository.prepareTeamForPanel(team, options)) {
    deps.stateRepository.writeTeamMutation(team.name, () => team)
  }
  const readModelStartedAt = Date.now()
  const panelTeam = deps.stateRepository.readTeamPanelModel(team.name)
  if (panelTeam) {
    recordPanelProfileEvent({
      kind: 'readModelBuild',
      mode,
      durationMs: Date.now() - readModelStartedAt,
      teamCount: 1,
      memberCount: Object.keys(panelTeam.members).length,
      taskCount: Object.keys(panelTeam.tasks).length,
    })
  }
  return panelTeam
}

function loadAttachedPanelData(teamName: string, deps: PanelDataSourceDeps): AttachedPanelData | null {
  const startedAt = Date.now()
  const panelTeam = prepareTeamForPanel(deps, teamName, 'attached')
  if (!panelTeam) return null
  const members = Object.values(panelTeam.members)
    .filter(member => member.name !== TEAM_LEAD)
    .sort((a, b) => a.name.localeCompare(b.name))
  const watchdogSummary = deps.stateRepository.readReportWatchdogSummary(panelTeam.name)
  const watchdogByTaskId = new Map((watchdogSummary?.tasks ?? []).map(watchdog => [watchdog.taskId, watchdog]))
  const tasks = Object.values(panelTeam.tasks)
    .map(task => ({ ...task, watchdog: task.watchdog ?? watchdogByTaskId.get(task.id) }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const mailbox = deps.stateRepository.readLeaderMailboxProjection(panelTeam.name)
    .items.map(toPanelMailboxItem)
    .sort((a, b) => b.createdAt - a.createdAt)
  const data: AttachedPanelData = {
    mode: 'attached',
    team: panelTeam,
    members,
    tasks,
    mailbox,
    outboxDiagnostics: deps.stateRepository.readOutboxDiagnosticsSummary(panelTeam.name),
  }
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

function loadGlobalPanelData(deps: PanelDataSourceDeps): GlobalPanelData {
  const startedAt = Date.now()
  return deps.runtimeRepository.withRuntimeSnapshot(snapshot => {
    const panelTeams: GlobalPanelData['teams'] = []
    const teamSummaries: Record<string, TeamAttentionSummary> = {}
    const teamMailboxes: Record<string, GlobalTeamMailboxProjection> = {}
    const teamDiagnostics: Record<string, TeamRuntimeDiagnostics> = {}
    const knownPaneIds = new Set<string>()
    for (const teamName of deps.stateRepository.listTeamPanelNames()) {
      const panelTeam = prepareTeamForPanel(deps, teamName, 'global', { mode: 'light', snapshot })
      if (!panelTeam) continue
      for (const member of Object.values(panelTeam.members)) {
        if (member.paneId) knownPaneIds.add(member.paneId)
      }
      const mailboxProjection = deps.stateRepository.readLeaderMailboxProjection(panelTeam.name)
      const leaderMailboxItems = mailboxProjection.items.map(toPanelMailboxItem)
      panelTeams.push(panelTeam)
      teamSummaries[panelTeam.name] = buildTeamAttentionSummary(panelTeam, leaderMailboxItems)
      teamMailboxes[panelTeam.name] = {
        total: mailboxProjection.total,
        unread: mailboxProjection.unread,
        blocked: leaderMailboxItems.filter(hasUnreadBlockedReportAttention).length,
        latestAttention: mailboxProjection.latestAttention ? toPanelMailboxItem(mailboxProjection.latestAttention) : undefined,
      }
      teamDiagnostics[panelTeam.name] = { outbox: deps.stateRepository.readOutboxDiagnosticsSummary(panelTeam.name) }
    }

    const orphanPanes = deps.runtimeRepository.listAgentTeamPanes(snapshot.ok === false ? undefined : snapshot)
      .filter(pane => !knownPaneIds.has(pane.paneId))
      .sort((a, b) => a.paneId.localeCompare(b.paneId))

    const data: GlobalPanelData = {
      mode: 'global',
      teams: panelTeams,
      teamSummaries,
      teamMailboxes,
      teamDiagnostics,
      quarantinedTeams: deps.stateRepository.listQuarantinedTeams(),
      orphanPanes,
    }
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
  })
}

export function loadPanelData(teamName?: string | null, deps: PanelDataSourceDeps = defaultDeps): PanelData {
  if (teamName) {
    const attached = loadAttachedPanelData(teamName, deps)
    if (attached) return attached
  }
  return loadGlobalPanelData(deps)
}
