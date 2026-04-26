import { TEAM_LEAD } from '../types.js'
import type {
  PanelAction,
  PanelData,
  PanelSelectionView,
  TeamPanelState,
} from './viewModel.js'

function commonAttachedActions(teamName: string): PanelAction[] {
  return [
    {
      id: 'refresh',
      label: 'Refresh / reconcile',
      description: 'Reload state and reconcile tmux pane bindings.',
    },
    {
      id: 'sync',
      label: 'Sync mailbox projection',
      description: 'Project unread leader mailbox messages into the transcript without marking them read.',
      result: { type: 'sync' },
    },
    {
      id: 'delete-team',
      label: 'Delete current team',
      description: 'Remove team state, mailboxes, teammate panes, and bindings. Current pane stays alive but its agentteam label is cleared.',
      danger: true,
      result: { type: 'delete-team', teamName },
    },
    {
      id: 'cleanup-all',
      label: 'Cleanup all agentteam data/panes',
      description: 'Emergency reset for all agentteam state. Current pane stays alive but its agentteam label is cleared.',
      danger: true,
      result: { type: 'cleanup-all' },
    },
  ]
}

function selectedObjectTitle(
  data: PanelData,
  state: TeamPanelState,
  selection: PanelSelectionView,
): string {
  if (data.mode === 'global') {
    if (state.focus === 'panes') return selection.selectedPane ? `stale pane ${selection.selectedPane.paneId}` : 'stale panes'
    return selection.selectedTeam ? `team ${selection.selectedTeam.name}` : 'teams'
  }
  if (state.focus === 'tasks') return selection.selectedTask ? `task ${selection.selectedTask.id}` : 'tasks'
  if (state.focus === 'mailbox') return selection.selectedMailbox ? `message from ${selection.selectedMailbox.from}` : 'mailbox'
  return selection.selectedMember ? `member ${selection.selectedMember.name}` : 'members'
}

export function buildPanelActions(
  data: PanelData,
  state: TeamPanelState,
  selection: PanelSelectionView,
): { title: string; actions: PanelAction[] } {
  const actions: PanelAction[] = [
    {
      id: 'toggle-details',
      label: state.isDetailExpanded ? 'Collapse details' : 'Expand details',
      description: 'Toggle the details panel for the selected item.',
    },
  ]

  if (data.mode === 'global') {
    if (state.focus === 'teams' && selection.selectedTeam) {
      actions.push(
        {
          id: 'recover-team',
          label: 'Recover as current leader',
          description: 'Attach the current pi session and tmux pane as this team\'s leader.',
          result: { type: 'recover-team', teamName: selection.selectedTeam.name },
        },
        {
          id: 'delete-team',
          label: 'Delete team',
          description: 'Remove selected team state, mailboxes, teammate panes, and bindings. Current pane label is cleared if needed.',
          danger: true,
          result: { type: 'delete-team', teamName: selection.selectedTeam.name },
        },
      )
    }

    actions.push(
      {
        id: 'cleanup-all',
        label: 'Cleanup all agentteam data/panes',
        description: 'Emergency reset for all agentteam state. Current pane stays alive but its agentteam label is cleared.',
        danger: true,
        result: { type: 'cleanup-all' },
      },
      {
        id: 'refresh',
        label: 'Refresh / reconcile',
        description: 'Reload team list and stale pane information.',
      },
    )

    return {
      title: `Actions for ${selectedObjectTitle(data, state, selection)}`,
      actions,
    }
  }

  if (state.focus === 'members' && selection.selectedMember) {
    const member = selection.selectedMember
    if (member.name !== TEAM_LEAD) {
      actions.push({
        id: 'remove-member',
        label: member.status === 'error' ? 'Remove stale teammate' : 'Remove teammate',
        description: 'Clear its pane/session/mailbox and return active owned tasks to pending.',
        danger: true,
        result: { type: 'remove-member', teamName: data.team.name, memberName: member.name },
      })
    }
  }

  actions.push(...commonAttachedActions(data.team.name))

  return {
    title: `Actions for ${selectedObjectTitle(data, state, selection)}`,
    actions,
  }
}
