import { compactPanelReadModelFingerprint, stableCompactStringify } from '../core/readModelFingerprint.js'
import type { PanelData, TeamPanelState } from './viewModel.js'

export function panelStateFingerprint(state: TeamPanelState): string {
  return stableCompactStringify({
    focus: state.focus,
    selectedIndex: state.selectedIndex,
    cockpitSelectedIndex: state.cockpitSelectedIndex,
    tasksSelectedIndex: state.tasksSelectedIndex,
    mailboxSelectedIndex: state.mailboxSelectedIndex,
    membersSelectedIndex: state.membersSelectedIndex,
    teamsSelectedIndex: state.teamsSelectedIndex,
    panesSelectedIndex: state.panesSelectedIndex,
    selectedMemberIndex: state.selectedMemberIndex,
    selectedTeamIndex: state.selectedTeamIndex,
    selectedPaneIndex: state.selectedPaneIndex,
    scrollFocus: state.scrollFocus,
    isDetailExpanded: state.isDetailExpanded,
    detailScrollOffset: state.detailScrollOffset,
    interactionMode: state.interactionMode,
    actionMenu: state.actionMenu,
  })
}

export function panelDataFingerprint(data: PanelData): string {
  return compactPanelReadModelFingerprint(data)
}
