import { isMailboxMessageUnread } from '../messageLifecycle.js'
import { displayMessageType, mailboxUrgencyRank } from '../protocol.js'
import { inferTaskNoteDisplayMode, isCommunicationReferenceNote, latestVisibleTaskNote, visibleTaskNotes } from '../state/taskNotes.js'
import { TEAM_LEAD } from '../internalTypes.js'
import type { OutboxDiagnosticsSummary } from '../app/outboxDiagnostics.js'
import type { QuarantinedTeamSummary } from '../state/validation.js'
import type {
  MailboxMessage,
  TeamMember,
  TeamMessageType,
  TeamState,
  TeamTask,
} from '../internalTypes.js'

export type LeaderMailboxItem = MailboxMessage
export type GlobalPaneItem = {
  paneId: string
  target: string
  label: string
  currentCommand: string
}

export type FocusSection = 'members' | 'tasks' | 'mailbox' | 'teams' | 'panes'
export type PanelInteractionMode = 'browse' | 'action-menu'

export type TeamPanelResult =
  | { type: 'close' }
  | { type: 'sync' }
  | { type: 'remove-member'; teamName: string; memberName: string }
  | { type: 'delete-team'; teamName: string }
  | { type: 'cleanup-all' }
  | { type: 'recover-team'; teamName: string }

export type PanelActionId =
  | 'toggle-details'
  | 'refresh'
  | 'sync'
  | 'remove-member'
  | 'delete-team'
  | 'cleanup-all'
  | 'recover-team'

export type PanelAction = {
  id: PanelActionId
  label: string
  description?: string
  danger?: boolean
  result?: TeamPanelResult
}

export type PanelActionMenu = {
  title: string
  actions: PanelAction[]
  selectedIndex: number
}

export type AttachedPanelData = {
  mode: 'attached'
  team: TeamState
  members: TeamMember[]
  tasks: TeamTask[]
  mailbox: LeaderMailboxItem[]
  outboxDiagnostics?: OutboxDiagnosticsSummary
}

export type TeamAttentionSummary = {
  blockedTasks: number
  unreadMessages: number
  blockedMessages: number
  unownedActiveTasks: number
  errorMembers: number
  paneLostMembers: number
}

export type TaskReferenceSummary = {
  total: number
  hidden: number
  folded: number
}

export type TeamRuntimeDiagnostics = {
  outbox?: OutboxDiagnosticsSummary
}

export type GlobalTeamMailboxProjection = {
  total: number
  unread: number
  blocked: number
  latestAttention?: MailboxMessage
}

export type GlobalPanelData = {
  mode: 'global'
  teams: TeamState[]
  teamSummaries: Record<string, TeamAttentionSummary>
  teamMailboxes: Record<string, GlobalTeamMailboxProjection>
  teamDiagnostics: Record<string, TeamRuntimeDiagnostics>
  quarantinedTeams: QuarantinedTeamSummary[]
  orphanPanes: GlobalPaneItem[]
}

export type PanelData = AttachedPanelData | GlobalPanelData

export type TeamPanelState = {
  focus: FocusSection
  selectedIndex: number
  selectedMemberIndex: number
  selectedTeamIndex: number
  selectedPaneIndex: number
  isDetailExpanded: boolean
  detailScrollOffset: number
  interactionMode: PanelInteractionMode
  actionMenu?: PanelActionMenu
}

export type PanelSelectionView = {
  visibleTasks: TeamTask[]
  visibleMailbox: LeaderMailboxItem[]
  selectedTask?: TeamTask
  selectedMailbox?: LeaderMailboxItem
  selectedMember?: TeamMember
  selectedTeam?: TeamState
  selectedPane?: GlobalPaneItem
}

export function createInitialPanelState(): TeamPanelState {
  return {
    focus: 'members',
    selectedIndex: 0,
    selectedMemberIndex: 0,
    selectedTeamIndex: 0,
    selectedPaneIndex: 0,
    isDetailExpanded: false,
    detailScrollOffset: 0,
    interactionMode: 'browse',
  }
}

export function hasPaneLostAttention(member: TeamMember): boolean {
  const lastWake = String(member.lastWakeReason ?? '').toLowerCase()
  const lastError = String(member.lastError ?? '').toLowerCase()
  return member.status === 'error' && (
    lastWake.includes('pane lost') ||
    lastError.includes('pane disappeared') ||
    lastError.includes('pane lost')
  )
}

export function buildTeamAttentionSummary(
  team: TeamState,
  mailbox: MailboxMessage[],
): TeamAttentionSummary {
  const teammates = Object.values(team.members).filter(member => member.name !== TEAM_LEAD)
  const tasks = Object.values(team.tasks)
  return {
    blockedTasks: tasks.filter(task => task.status === 'blocked').length,
    unreadMessages: mailbox.filter(isMailboxMessageUnread).length,
    blockedMessages: mailbox.filter(item => isMailboxMessageUnread(item) && mailboxType(item) === 'report_blocked').length,
    unownedActiveTasks: tasks.filter(task => task.status !== 'done' && !task.owner).length,
    errorMembers: teammates.filter(member => member.status === 'error').length,
    paneLostMembers: teammates.filter(hasPaneLostAttention).length,
  }
}

export function mailboxType(item: LeaderMailboxItem): TeamMessageType {
  return displayMessageType(item.type as string)
}

export { isCommunicationReferenceNote, latestVisibleTaskNote, visibleTaskNotes }

export function taskReferenceSummary(task: Pick<TeamTask, 'notes'>): TaskReferenceSummary {
  return task.notes.reduce<TaskReferenceSummary>((summary, note) => {
    if (!isCommunicationReferenceNote(note)) return summary
    const displayMode = inferTaskNoteDisplayMode(note)
    summary.total += 1
    if (displayMode === 'hidden') summary.hidden += 1
    else summary.folded += 1
    return summary
  }, { total: 0, hidden: 0, folded: 0 })
}

export function hasUnreadBlockedReportAttention(item: LeaderMailboxItem): boolean {
  return isMailboxMessageUnread(item) && mailboxType(item) === 'report_blocked'
}

function sortMailboxByUrgency(items: LeaderMailboxItem[]): LeaderMailboxItem[] {
  return items
    .slice()
    .sort(
      (a, b) =>
        mailboxUrgencyRank(mailboxType(a), a.priority) - mailboxUrgencyRank(mailboxType(b), b.priority) ||
        b.createdAt - a.createdAt,
    )
}

function filterMailboxItems(
  mailbox: LeaderMailboxItem[],
): LeaderMailboxItem[] {
  return sortMailboxByUrgency(mailbox)
}

function getVisibleTasks(
  data: AttachedPanelData,
): TeamTask[] {
  return data.tasks
}

function isAttachedFocus(focus: FocusSection): boolean {
  return focus === 'members' || focus === 'tasks' || focus === 'mailbox'
}

function isGlobalFocus(focus: FocusSection): boolean {
  return focus === 'teams' || focus === 'panes'
}

function getSectionCount(
  data: PanelData,
  state: TeamPanelState,
): number {
  if (data.mode === 'global') {
    if (state.focus === 'panes') return data.orphanPanes.length
    return data.teams.length
  }
  if (state.focus === 'members') return data.members.length
  if (state.focus === 'tasks') return getVisibleTasks(data).length
  return filterMailboxItems(data.mailbox).length
}

export function clampPanelStateToData(
  state: TeamPanelState,
  data: PanelData,
): void {
  if (data.mode === 'attached' && !isAttachedFocus(state.focus)) {
    state.focus = 'members'
    state.selectedIndex = state.selectedMemberIndex
  }
  if (data.mode === 'global' && !isGlobalFocus(state.focus)) {
    state.focus = 'teams'
    state.selectedIndex = state.selectedTeamIndex
  }

  if (data.mode === 'attached') {
    state.selectedMemberIndex = data.members.length === 0
      ? 0
      : Math.max(0, Math.min(state.selectedMemberIndex, data.members.length - 1))
  } else {
    state.selectedTeamIndex = data.teams.length === 0
      ? 0
      : Math.max(0, Math.min(state.selectedTeamIndex, data.teams.length - 1))
    state.selectedPaneIndex = data.orphanPanes.length === 0
      ? 0
      : Math.max(0, Math.min(state.selectedPaneIndex, data.orphanPanes.length - 1))
  }

  const count = getSectionCount(data, state)
  state.selectedIndex = count === 0
    ? 0
    : Math.max(0, Math.min(state.selectedIndex, count - 1))

  if (data.mode === 'attached' && state.focus === 'members') {
    state.selectedIndex = state.selectedMemberIndex
  }
  if (data.mode === 'global' && state.focus === 'teams') {
    state.selectedIndex = state.selectedTeamIndex
  }
  if (data.mode === 'global' && state.focus === 'panes') {
    state.selectedIndex = state.selectedPaneIndex
  }

  if (state.actionMenu) {
    state.actionMenu.selectedIndex = state.actionMenu.actions.length === 0
      ? 0
      : Math.max(0, Math.min(state.actionMenu.selectedIndex, state.actionMenu.actions.length - 1))
  }
}

export function buildPanelSelectionView(
  data: PanelData,
  state: TeamPanelState,
): PanelSelectionView {
  if (data.mode === 'global') {
    return {
      visibleTasks: [],
      visibleMailbox: [],
      selectedTeam: data.teams[state.focus === 'teams' ? state.selectedIndex : state.selectedTeamIndex],
      selectedPane: data.orphanPanes[state.focus === 'panes' ? state.selectedIndex : state.selectedPaneIndex],
    }
  }

  const visibleTasks = getVisibleTasks(data)
  const visibleMailbox = filterMailboxItems(data.mailbox)

  return {
    visibleTasks,
    visibleMailbox,
    selectedTask: visibleTasks[state.focus === 'tasks' ? state.selectedIndex : 0],
    selectedMailbox: visibleMailbox[state.focus === 'mailbox' ? state.selectedIndex : 0],
    selectedMember: data.members[state.selectedMemberIndex],
  }
}
