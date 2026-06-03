import { isMailboxMessageUnread } from '../messageLifecycle.js'
import { displayMessageType, mailboxUrgencyRank } from '../protocol.js'
import { TEAM_LEAD } from '../internalTypes.js'
import type { OutboxDiagnosticsSummary } from '../app/outboxDiagnostics.js'
import type { QuarantinedTeamSummary } from '../state/validation.js'
import type {
  MailboxMessage,
  TaskEvent,
  TaskMessageRef,
  TaskReport,
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

export type FocusSection = 'cockpit' | 'members' | 'tasks' | 'mailbox' | 'teams' | 'panes'
export type PanelInteractionMode = 'browse' | 'action-menu'
export type PanelScrollFocus = 'list' | 'detail'

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

export type PanelActionSection = 'selected' | 'maintenance' | 'danger'

export type PanelAction = {
  id: PanelActionId
  label: string
  description?: string
  danger?: boolean
  result?: TeamPanelResult
  section?: PanelActionSection
}

export type PanelActionMenu = {
  title: string
  actions: PanelAction[]
  selectedIndex: number
  confirmingAction?: PanelAction
  confirmSelectedIndex?: number
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

export type PanelTaskReportSummary = {
  id: string
  taskId: string
  type: TaskReport['type']
  author: string
  summary: string
  createdAt: number
  statusAtReport: TaskReport['statusAtReport']
  ownerAtReport?: string
  reportedBlockedBy: string[]
  mailboxMessageId?: string
}

export type PanelTaskActivitySummary =
  | {
    kind: 'report'
    id: string
    taskId: string
    type: TaskReport['type']
    at: number
    by: string
    summary: string
  }
  | {
    kind: 'event'
    id: string
    taskId: string
    type: TaskEvent['type']
    displayType: string
    at: number
    by: string
    summary: string
    reportId?: string
  }
  | {
    kind: 'messageRef'
    id: string
    taskId: string
    mailboxMessageId: string
    type: TaskMessageRef['type']
    at: number
    from: string
    to: string
    summary?: string
    reportId?: string
    diagnostic?: boolean
  }

export type PanelTaskHistorySummary = {
  taskId: string
  reports: number
  events: number
  messageRefs: number
  latestReport?: PanelTaskReportSummary
  latestActivity?: PanelTaskActivitySummary
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
  /** Legacy active-row alias retained while input/render slices move to per-tab state. */
  selectedIndex: number
  cockpitSelectedIndex: number
  tasksSelectedIndex: number
  mailboxSelectedIndex: number
  membersSelectedIndex: number
  teamsSelectedIndex: number
  panesSelectedIndex: number
  /** Legacy aliases retained for current rendering/tests until the layout slice finishes. */
  selectedMemberIndex: number
  selectedTeamIndex: number
  selectedPaneIndex: number
  scrollFocus: PanelScrollFocus
  isDetailExpanded: boolean
  detailScrollOffset: number
  interactionMode: PanelInteractionMode
  actionMenu?: PanelActionMenu
}

export type CockpitQueueItem =
  | { kind: 'task'; task: TeamTask; attention: string[] }
  | { kind: 'mailbox'; message: LeaderMailboxItem; attention: string[] }

export type PanelSelectionView = {
  visibleTasks: TeamTask[]
  visibleMailbox: LeaderMailboxItem[]
  cockpitQueue: CockpitQueueItem[]
  selectedCockpitItem?: CockpitQueueItem
  selectedTask?: TeamTask
  selectedMailbox?: LeaderMailboxItem
  selectedMember?: TeamMember
  selectedTeam?: TeamState
  selectedPane?: GlobalPaneItem
}

export function createInitialPanelState(): TeamPanelState {
  return {
    focus: 'cockpit',
    selectedIndex: 0,
    cockpitSelectedIndex: 0,
    tasksSelectedIndex: 0,
    mailboxSelectedIndex: 0,
    membersSelectedIndex: 0,
    teamsSelectedIndex: 0,
    panesSelectedIndex: 0,
    selectedMemberIndex: 0,
    selectedTeamIndex: 0,
    selectedPaneIndex: 0,
    scrollFocus: 'list',
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

function historyItemTime(item: TaskReport | TaskEvent | TaskMessageRef): number {
  return 'createdAt' in item ? item.createdAt : item.at
}

function newestHistoryItem<T extends TaskReport | TaskEvent | TaskMessageRef>(items: T[]): T | undefined {
  return items
    .slice()
    .sort((a, b) => historyItemTime(b) - historyItemTime(a) || b.id.localeCompare(a.id))[0]
}

function historyReportsForTask(team: TeamState, taskId: string): TaskReport[] {
  return Object.values(team.taskReports ?? {})
    .filter(report => report.taskId === taskId)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

function historyEventsForTask(team: TeamState, taskId: string): TaskEvent[] {
  return Object.values(team.taskEvents ?? {})
    .filter(event => event.taskId === taskId)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}

function historyMessageRefsForTask(team: TeamState, taskId: string): TaskMessageRef[] {
  return Object.values(team.taskMessageRefs ?? {})
    .filter(ref => ref.taskId === taskId)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

function displayTaskEventType(type: TaskEvent['type']): string {
  return type === 'report_submitted' ? 'report' : type
}

function compactPanelReport(report: TaskReport): PanelTaskReportSummary {
  return {
    id: report.id,
    taskId: report.taskId,
    type: report.type,
    author: report.author,
    summary: report.summary,
    createdAt: report.createdAt,
    statusAtReport: report.statusAtReport,
    ownerAtReport: report.ownerAtReport,
    reportedBlockedBy: report.reportedBlockedBy ?? [],
    mailboxMessageId: report.mailboxMessageId,
  }
}

function compactPanelActivity(item: TaskReport | TaskEvent | TaskMessageRef | undefined): PanelTaskActivitySummary | undefined {
  if (!item) return undefined
  if ('author' in item) {
    return {
      kind: 'report',
      id: item.id,
      taskId: item.taskId,
      type: item.type,
      at: item.createdAt,
      by: item.author,
      summary: item.summary,
    }
  }
  if ('mailboxMessageId' in item) {
    return {
      kind: 'messageRef',
      id: item.id,
      taskId: item.taskId,
      mailboxMessageId: item.mailboxMessageId,
      type: item.type,
      at: item.createdAt,
      from: item.from,
      to: item.to,
      summary: item.summary,
      reportId: item.reportId,
      diagnostic: item.diagnostic,
    }
  }
  return {
    kind: 'event',
    id: item.id,
    taskId: item.taskId,
    type: item.type,
    displayType: displayTaskEventType(item.type),
    at: item.at,
    by: item.by,
    summary: item.summary,
    reportId: item.reportId,
  }
}

export function taskHistorySummary(team: TeamState, taskId: string): PanelTaskHistorySummary {
  const reports = historyReportsForTask(team, taskId)
  const events = historyEventsForTask(team, taskId)
  const messageRefs = historyMessageRefsForTask(team, taskId)
  const latestReport = newestHistoryItem(reports)
  const latestActivity = newestHistoryItem<TaskReport | TaskEvent | TaskMessageRef>([
    ...reports,
    ...events,
    ...messageRefs,
  ])
  return {
    taskId,
    reports: reports.length,
    events: events.length,
    messageRefs: messageRefs.length,
    latestReport: latestReport ? compactPanelReport(latestReport) : undefined,
    latestActivity: compactPanelActivity(latestActivity),
  }
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

function taskAttentionLabels(task: TeamTask): string[] {
  return [
    task.status === 'blocked' ? 'blocked' : '',
    task.status !== 'done' && !task.owner ? 'unowned' : '',
  ].filter(Boolean)
}

function mailboxAttentionLabels(item: LeaderMailboxItem): string[] {
  return [
    isMailboxMessageUnread(item) ? 'unread' : '',
    hasUnreadBlockedReportAttention(item) ? 'blocked report' : '',
  ].filter(Boolean)
}

function getVisibleTasks(
  data: AttachedPanelData,
): TeamTask[] {
  return data.tasks
}

export function buildCockpitQueue(
  tasks: TeamTask[],
  mailbox: LeaderMailboxItem[],
): CockpitQueueItem[] {
  const taskItems = tasks
    .filter(task => task.status !== 'done')
    .map(task => ({ kind: 'task' as const, task, attention: taskAttentionLabels(task) }))
  const mailboxItems = sortMailboxByUrgency(mailbox)
    .filter(item => isMailboxMessageUnread(item))
    .map(message => ({ kind: 'mailbox' as const, message, attention: mailboxAttentionLabels(message) }))

  return [...taskItems, ...mailboxItems].sort((a, b) => {
    const rank = (item: CockpitQueueItem) => {
      if (item.kind === 'task' && item.task.status === 'blocked') return 0
      if (item.kind === 'mailbox' && hasUnreadBlockedReportAttention(item.message)) return 1
      if (item.kind === 'task' && !item.task.owner) return 2
      if (item.kind === 'mailbox') return 3
      return 4
    }
    const time = (item: CockpitQueueItem) => item.kind === 'task' ? item.task.updatedAt : item.message.createdAt
    return rank(a) - rank(b) || time(b) - time(a)
  })
}

function isAttachedFocus(focus: FocusSection): boolean {
  return focus === 'cockpit' || focus === 'members' || focus === 'tasks' || focus === 'mailbox'
}

function isGlobalFocus(focus: FocusSection): boolean {
  return focus === 'teams' || focus === 'panes'
}

function clampIndex(value: number | undefined, count: number): number {
  if (count <= 0) return 0
  return Math.max(0, Math.min(value ?? 0, count - 1))
}

function normalizeLegacySelectedIndices(state: TeamPanelState): void {
  if (state.focus === 'members') state.membersSelectedIndex = state.selectedIndex
  else state.membersSelectedIndex = state.selectedMemberIndex ?? state.membersSelectedIndex

  if (state.focus === 'teams') state.teamsSelectedIndex = state.selectedIndex
  else state.teamsSelectedIndex = state.selectedTeamIndex ?? state.teamsSelectedIndex

  if (state.focus === 'panes') state.panesSelectedIndex = state.selectedIndex
  else state.panesSelectedIndex = state.selectedPaneIndex ?? state.panesSelectedIndex

  if (state.focus === 'cockpit') state.cockpitSelectedIndex = state.selectedIndex
  if (state.focus === 'tasks') state.tasksSelectedIndex = state.selectedIndex
  if (state.focus === 'mailbox') state.mailboxSelectedIndex = state.selectedIndex
}

function getStoredIndex(state: TeamPanelState, focus: FocusSection): number {
  if (focus === 'cockpit') return state.cockpitSelectedIndex
  if (focus === 'members') return state.membersSelectedIndex
  if (focus === 'tasks') return state.tasksSelectedIndex
  if (focus === 'mailbox') return state.mailboxSelectedIndex
  if (focus === 'teams') return state.teamsSelectedIndex
  return state.panesSelectedIndex
}

function setStoredIndex(state: TeamPanelState, focus: FocusSection, value: number): void {
  if (focus === 'cockpit') state.cockpitSelectedIndex = value
  else if (focus === 'members') state.membersSelectedIndex = value
  else if (focus === 'tasks') state.tasksSelectedIndex = value
  else if (focus === 'mailbox') state.mailboxSelectedIndex = value
  else if (focus === 'teams') state.teamsSelectedIndex = value
  else state.panesSelectedIndex = value

  if (focus === 'members') state.selectedMemberIndex = value
  if (focus === 'teams') state.selectedTeamIndex = value
  if (focus === 'panes') state.selectedPaneIndex = value
}

export function syncPanelActiveIndex(state: TeamPanelState): void {
  const activeIndex = getStoredIndex(state, state.focus)
  state.selectedIndex = activeIndex
  state.selectedMemberIndex = state.membersSelectedIndex
  state.selectedTeamIndex = state.teamsSelectedIndex
  state.selectedPaneIndex = state.panesSelectedIndex
}

export function syncPanelSelectedIndex(state: TeamPanelState): void {
  setStoredIndex(state, state.focus, state.selectedIndex)
}

function getSectionCount(
  data: PanelData,
  state: TeamPanelState,
  cockpitQueue?: CockpitQueueItem[],
): number {
  if (data.mode === 'global') {
    if (state.focus === 'panes') return data.orphanPanes.length
    return data.teams.length
  }
  if (state.focus === 'cockpit') return cockpitQueue?.length ?? buildCockpitQueue(getVisibleTasks(data), filterMailboxItems(data.mailbox)).length
  if (state.focus === 'members') return data.members.length
  if (state.focus === 'tasks') return getVisibleTasks(data).length
  return filterMailboxItems(data.mailbox).length
}

export function getPanelActiveSelectedIndex(state: TeamPanelState): number {
  return state.selectedIndex
}

export function clampPanelStateToData(
  state: TeamPanelState,
  data: PanelData,
): void {
  normalizeLegacySelectedIndices(state)

  if (data.mode === 'attached' && !isAttachedFocus(state.focus)) {
    state.focus = 'cockpit'
  }
  if (data.mode === 'global' && !isGlobalFocus(state.focus)) {
    state.focus = 'teams'
  }

  if (state.scrollFocus !== 'detail') state.scrollFocus = 'list'

  if (data.mode === 'attached') {
    const visibleTasks = getVisibleTasks(data)
    const visibleMailbox = filterMailboxItems(data.mailbox)
    const cockpitQueue = buildCockpitQueue(visibleTasks, visibleMailbox)
    state.cockpitSelectedIndex = clampIndex(state.cockpitSelectedIndex, cockpitQueue.length)
    state.membersSelectedIndex = clampIndex(state.membersSelectedIndex, data.members.length)
    state.tasksSelectedIndex = clampIndex(state.tasksSelectedIndex, visibleTasks.length)
    state.mailboxSelectedIndex = clampIndex(state.mailboxSelectedIndex, visibleMailbox.length)
    state.selectedMemberIndex = state.membersSelectedIndex
    state.selectedTeamIndex = state.teamsSelectedIndex
    state.selectedPaneIndex = state.panesSelectedIndex
    state.selectedIndex = clampIndex(getStoredIndex(state, state.focus), getSectionCount(data, state, cockpitQueue))
    setStoredIndex(state, state.focus, state.selectedIndex)
  } else {
    state.teamsSelectedIndex = clampIndex(state.teamsSelectedIndex, data.teams.length)
    state.panesSelectedIndex = clampIndex(state.panesSelectedIndex, data.orphanPanes.length)
    state.selectedTeamIndex = state.teamsSelectedIndex
    state.selectedPaneIndex = state.panesSelectedIndex
    state.selectedIndex = clampIndex(getStoredIndex(state, state.focus), getSectionCount(data, state))
    setStoredIndex(state, state.focus, state.selectedIndex)
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
  normalizeLegacySelectedIndices(state)

  if (data.mode === 'global') {
    const teamIndex = state.focus === 'teams' ? state.selectedIndex : state.teamsSelectedIndex
    const paneIndex = state.focus === 'panes' ? state.selectedIndex : state.panesSelectedIndex
    return {
      visibleTasks: [],
      visibleMailbox: [],
      cockpitQueue: [],
      selectedTeam: data.teams[teamIndex],
      selectedPane: data.orphanPanes[paneIndex],
    }
  }

  const visibleTasks = getVisibleTasks(data)
  const visibleMailbox = filterMailboxItems(data.mailbox)
  const cockpitQueue = buildCockpitQueue(visibleTasks, visibleMailbox)
  const cockpitIndex = state.focus === 'cockpit' ? state.selectedIndex : state.cockpitSelectedIndex
  const taskIndex = state.focus === 'tasks' ? state.selectedIndex : state.tasksSelectedIndex
  const mailboxIndex = state.focus === 'mailbox' ? state.selectedIndex : state.mailboxSelectedIndex
  const memberIndex = state.focus === 'members' ? state.selectedIndex : state.membersSelectedIndex

  return {
    visibleTasks,
    visibleMailbox,
    cockpitQueue,
    selectedCockpitItem: cockpitQueue[cockpitIndex],
    selectedTask: visibleTasks[taskIndex],
    selectedMailbox: visibleMailbox[mailboxIndex],
    selectedMember: data.members[memberIndex],
  }
}
