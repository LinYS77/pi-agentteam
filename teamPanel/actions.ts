import { TEAM_LEAD } from '../internalTypes.js'
import type {
  CockpitQueueItem,
  PanelAction,
  PanelActionSection,
  PanelData,
  PanelSelectionView,
  TeamPanelState,
} from './viewModel.js'

export type PanelActionScope = 'context' | 'maintenance'

function commonAttachedActions(teamName: string): PanelAction[] {
  return [
    {
      id: 'refresh',
      label: 'Refresh / reconcile',
      description: 'Reload state and reconcile tmux pane bindings.',
      section: 'maintenance',
    },
    {
      id: 'sync',
      label: 'Sync mailbox projection',
      description: 'Project unread leader mailbox messages into the transcript without marking them read.',
      result: { type: 'sync' },
      section: 'maintenance',
    },
    {
      id: 'delete-team',
      label: `Delete current team ${teamName}`,
      description: 'Current pane is never killed; its agentteam label is cleared if needed. Danger: remove this team data, inboxes, bindings, and teammate panes.',
      danger: true,
      result: { type: 'delete-team', teamName },
      section: 'danger',
    },
    {
      id: 'cleanup-all',
      label: 'Cleanup ALL agentteam state/panes',
      description: 'Current pane is never killed; its agentteam label is cleared if needed. Danger: reset every agentteam team, mailbox, binding, and labeled pane.',
      danger: true,
      result: { type: 'cleanup-all' },
      section: 'danger',
    },
  ]
}

function cockpitItemTitle(item: CockpitQueueItem): string {
  return item.kind === 'task'
    ? `task ${item.task.id}`
    : `message from ${item.message.from}`
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
  if (state.focus === 'cockpit') return selection.selectedCockpitItem ? cockpitItemTitle(selection.selectedCockpitItem) : 'cockpit'
  if (state.focus === 'tasks') return selection.selectedTask ? `task ${selection.selectedTask.id}` : 'tasks'
  if (state.focus === 'mailbox') return selection.selectedMailbox ? `message from ${selection.selectedMailbox.from}` : 'mailbox'
  return selection.selectedMember ? `member ${selection.selectedMember.name}` : 'members'
}

function sortActionsBySection(actions: PanelAction[]): PanelAction[] {
  const sectionOrder: Record<PanelActionSection, number> = {
    selected: 1,
    maintenance: 2,
    danger: 3,
  }

  return actions.sort((a, b) => {
    const sa = a.section ? sectionOrder[a.section] : 99
    const sb = b.section ? sectionOrder[b.section] : 99
    return sa - sb
  })
}

function buildToggleDetailsAction(state: TeamPanelState): PanelAction {
  return {
    id: 'toggle-details',
    label: state.isDetailExpanded ? 'Collapse details' : 'Expand details',
    description: 'Toggle the details panel for the selected item.',
    section: 'selected',
  }
}

function buildGlobalMaintenanceActions(): PanelAction[] {
  return sortActionsBySection([
    {
      id: 'refresh',
      label: 'Refresh / reconcile',
      description: 'Reload team list and stale pane information.',
      section: 'maintenance',
    },
    {
      id: 'cleanup-all',
      label: 'Cleanup ALL agentteam state/panes',
      description: 'Current pane is never killed; its agentteam label is cleared if needed. Danger: reset every agentteam team, mailbox, binding, and labeled pane.',
      danger: true,
      result: { type: 'cleanup-all' },
      section: 'danger',
    },
  ])
}

export function buildPanelActions(
  data: PanelData,
  state: TeamPanelState,
  selection: PanelSelectionView,
  scope: PanelActionScope = 'context',
): { title: string; actions: PanelAction[] } {
  if (scope === 'maintenance') {
    if (data.mode === 'global') {
      return {
        title: 'Global console actions',
        actions: buildGlobalMaintenanceActions(),
      }
    }
    return {
      title: `Team actions for ${data.team.name}`,
      actions: sortActionsBySection(commonAttachedActions(data.team.name)),
    }
  }

  const actions: PanelAction[] = []

  const pushToggleDetailsAction = (overrides?: Pick<PanelAction, 'label' | 'description'>) => {
    actions.push({
      ...buildToggleDetailsAction(state),
      ...overrides,
    })
  }

  if (data.mode === 'global') {
    if (state.focus === 'teams' && selection.selectedTeam) {
      pushToggleDetailsAction()
      actions.push(
        {
          id: 'recover-team',
          label: `Recover ${selection.selectedTeam.name} as current leader`,
          description: 'Attach the current pi session and current tmux pane as this team\'s leader. Existing teammate state is preserved.',
          result: { type: 'recover-team', teamName: selection.selectedTeam.name },
          section: 'selected',
        },
        {
          id: 'delete-team',
          label: `Delete selected team ${selection.selectedTeam.name}`,
          description: 'Current pane is never killed; its agentteam label is cleared if needed. Danger: remove selected team data, inboxes, bindings, and teammate panes.',
          danger: true,
          result: { type: 'delete-team', teamName: selection.selectedTeam.name },
          section: 'danger',
        },
      )
    }

    if (state.focus === 'panes' && selection.selectedPane) {
      pushToggleDetailsAction()
    }

    return {
      title: `Actions for ${selectedObjectTitle(data, state, selection)}`,
      actions: sortActionsBySection(actions),
    }
  }

  if (state.focus === 'cockpit' && selection.selectedCockpitItem) {
    const item = selection.selectedCockpitItem
    pushToggleDetailsAction({
      label: item.kind === 'task' ? `Inspect task ${item.task.id}` : `Inspect message from ${item.message.from}`,
      description: item.kind === 'task'
        ? 'Show the selected cockpit task in the detail pane.'
        : 'Show the selected cockpit mailbox item in the detail pane without marking it read.',
    })
  }

  if (state.focus === 'tasks' && selection.selectedTask) {
    pushToggleDetailsAction({
      label: `Inspect task ${selection.selectedTask.id}`,
      description: 'Show the selected task in the detail pane.',
    })
  }

  if (state.focus === 'mailbox' && selection.selectedMailbox) {
    pushToggleDetailsAction({
      label: `Inspect message from ${selection.selectedMailbox.from}`,
      description: 'Show the selected mailbox item in the detail pane without marking it read.',
    })
  }

  if (state.focus === 'members' && selection.selectedMember) {
    pushToggleDetailsAction()
    const member = selection.selectedMember
    if (member.name !== TEAM_LEAD) {
      actions.push({
        id: 'remove-member',
        label: member.status === 'error' ? `Remove stale teammate ${member.name}` : `Remove teammate ${member.name}`,
        description: 'Current pane is never killed. Danger: clear this teammate pane binding, worker session, and mailbox; active owned tasks return to open.',
        danger: true,
        result: { type: 'remove-member', teamName: data.team.name, memberName: member.name },
        section: 'danger',
      })
    }
  }

  return {
    title: `Actions for ${selectedObjectTitle(data, state, selection)}`,
    actions: sortActionsBySection(actions),
  }
}
