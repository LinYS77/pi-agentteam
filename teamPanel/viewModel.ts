import { ensureTeamStorageReady, reconcileTeamPanes } from '../runtime.js'
import { mailboxUrgencyRank, normalizeMessageType } from '../protocol.js'
import { readMailbox, readTeamState, writeTeamState } from '../state.js'
import { TEAM_LEAD } from '../types.js'
import type {
  MailboxMessage,
  TeamMember,
  TeamMessageType,
  TeamState,
  TeamTask,
} from '../types.js'

export type LeaderMailboxItem = MailboxMessage

export type FocusSection = 'members' | 'tasks' | 'mailbox'

export type TeamPanelResult =
  | { type: 'close' }
  | { type: 'open-session'; sessionFile: string }
  | { type: 'open-leader-session'; sessionFile: string }
  | { type: 'open-task'; taskId: string }

export type PanelData = {
  team: TeamState
  leader: TeamMember | undefined
  members: TeamMember[]
  tasks: TeamTask[]
  mailbox: LeaderMailboxItem[]
}

export type TeamPanelState = {
  focus: FocusSection
  selectedIndex: number
  selectedMemberIndex: number
  isDetailExpanded: boolean
  footerHint: string
}

export type PanelSelectionView = {
  selectedMemberName?: string
  visibleTasks: TeamTask[]
  visibleMailbox: LeaderMailboxItem[]
  selectedTask?: TeamTask
  selectedMailbox?: LeaderMailboxItem
  selectedMember?: TeamMember
}

export function createInitialPanelState(): TeamPanelState {
  return {
    focus: 'members',
    selectedIndex: 0,
    selectedMemberIndex: 0,
    isDetailExpanded: false,
    footerHint: 'Ready',
  }
}

export function loadPanelData(teamName: string): PanelData | null {
  const team = readTeamState(teamName)
  if (!team) return null
  ensureTeamStorageReady(team)
  if (reconcileTeamPanes(team)) {
    writeTeamState(team)
  }
  const leader = team.members[TEAM_LEAD]
  const members = Object.values(team.members)
    .filter(member => member.name !== TEAM_LEAD)
    .sort((a, b) => a.name.localeCompare(b.name))
  const tasks = Object.values(team.tasks).sort((a, b) => a.id.localeCompare(b.id))
  const mailbox = (readMailbox(teamName, TEAM_LEAD) as LeaderMailboxItem[])
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
  return { team, leader, members, tasks, mailbox }
}

export function mailboxType(item: LeaderMailboxItem): TeamMessageType {
  return normalizeMessageType(item.type as string)
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
  data: PanelData,
): TeamTask[] {
  return data.tasks
}

function getCurrentSelectedMemberName(
  data: PanelData,
  state: TeamPanelState,
): string | undefined {
  if (data.members.length === 0) return undefined
  const index = Math.max(0, Math.min(state.selectedMemberIndex, data.members.length - 1))
  return data.members[index]?.name
}

function getSectionCount(
  data: PanelData,
  state: TeamPanelState,
): number {
  if (state.focus === 'members') return data.members.length
  if (state.focus === 'tasks') return getVisibleTasks(data).length
  return filterMailboxItems(data.mailbox).length
}

export function clampPanelStateToData(
  state: TeamPanelState,
  data: PanelData,
): void {
  state.selectedMemberIndex = data.members.length === 0
    ? 0
    : Math.max(0, Math.min(state.selectedMemberIndex, data.members.length - 1))

  const count = getSectionCount(data, state)
  state.selectedIndex = count === 0
    ? 0
    : Math.max(0, Math.min(state.selectedIndex, count - 1))

  if (state.focus === 'members') {
    state.selectedIndex = state.selectedMemberIndex
  }
}

export function buildPanelSelectionView(
  data: PanelData,
  state: TeamPanelState,
): PanelSelectionView {
  const selectedMemberName = getCurrentSelectedMemberName(data, state)
  const visibleTasks = getVisibleTasks(data)
  const visibleMailbox = filterMailboxItems(data.mailbox)

  return {
    selectedMemberName,
    visibleTasks,
    visibleMailbox,
    selectedTask: state.focus === 'tasks' ? visibleTasks[state.selectedIndex] : undefined,
    selectedMailbox: state.focus === 'mailbox' ? visibleMailbox[state.selectedIndex] : undefined,
    selectedMember: data.members[state.selectedMemberIndex],
  }
}
