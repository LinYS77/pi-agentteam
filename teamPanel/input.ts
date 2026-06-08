import {
  Key,
  matchesKey,
} from '@earendil-works/pi-tui'
import { buildPanelActions } from './actions.js'
import { panelStateFingerprint } from './fingerprint.js'
import type { PanelActionScope } from './actions.js'
import {
  getPanelActiveSelectedIndex,
  syncPanelActiveIndex,
  syncPanelSelectedIndex,
} from './viewModel.js'
import type {
  FocusSection,
  PanelData,
  PanelSelectionView,
  TeamPanelResult,
  TeamPanelState,
} from './viewModel.js'

type TeamPanelInputDeps = {
  done: (result: TeamPanelResult) => void
  refresh: () => void
  requestRender: () => void
}

function sectionCount(
  data: PanelData,
  state: TeamPanelState,
  selection: PanelSelectionView,
): number {
  if (data.mode === 'global') {
    return state.focus === 'panes' ? data.orphanPanes.length : data.teams.length
  }
  if (state.focus === 'cockpit') return selection.cockpitQueue.length
  return state.focus === 'members'
    ? data.members.length
    : state.focus === 'tasks'
      ? selection.visibleTasks.length
      : selection.visibleMailbox.length
}

function resetDetailScroll(state: TeamPanelState): void {
  state.detailScrollOffset = 0
}

function focusOrder(data: PanelData): FocusSection[] {
  return data.mode === 'global'
    ? ['teams', 'panes']
    : ['cockpit', 'tasks', 'mailbox', 'members']
}

function requestRenderIfChanged(state: TeamPanelState, before: string, deps: TeamPanelInputDeps): void {
  if (panelStateFingerprint(state) !== before) deps.requestRender()
}

function setFocus(data: PanelData, state: TeamPanelState, focus: FocusSection): boolean {
  if (!focusOrder(data).includes(focus)) return false
  const before = panelStateFingerprint(state)
  syncPanelSelectedIndex(state)
  state.focus = focus
  syncPanelActiveIndex(state)
  state.scrollFocus = 'list'
  resetDetailScroll(state)
  return panelStateFingerprint(state) !== before
}

function cycleSection(data: PanelData, state: TeamPanelState, direction: 1 | -1): boolean {
  const order = focusOrder(data)
  const currentIndex = Math.max(0, order.indexOf(state.focus))
  const nextIndex = (currentIndex + direction + order.length) % order.length
  return setFocus(data, state, order[nextIndex]!)
}

function hotkeyFocus(data: PanelData, input: string): FocusSection | undefined {
  if (data.mode === 'global') {
    if (input === '1') return 'teams'
    if (input === '2') return 'panes'
    return undefined
  }

  if (input === '1') return 'cockpit'
  if (input === '2') return 'tasks'
  if (input === '3') return 'mailbox'
  if (input === '4') return 'members'
  return undefined
}

function openActionMenu(
  data: PanelData,
  state: TeamPanelState,
  selection: PanelSelectionView,
  deps: TeamPanelInputDeps,
  scope: PanelActionScope,
): void {
  const menu = buildPanelActions(data, state, selection, scope)
  state.interactionMode = 'action-menu'
  state.actionMenu = {
    ...menu,
    selectedIndex: 0,
  }
  deps.requestRender()
}

function handleActionMenuInput(
  input: string,
  state: TeamPanelState,
  deps: TeamPanelInputDeps,
): void {
  const menu = state.actionMenu
  if (!menu) {
    state.interactionMode = 'browse'
    deps.requestRender()
    return
  }

  if (matchesKey(input, Key.escape) || input === 'q') {
    if (menu.confirmingAction) {
      menu.confirmingAction = undefined
      menu.confirmSelectedIndex = undefined
      deps.requestRender()
      return
    }
    state.interactionMode = 'browse'
    state.actionMenu = undefined
    deps.requestRender()
    return
  }

  if (menu.confirmingAction) {
    if (matchesKey(input, Key.up) || matchesKey(input, Key.down)) {
      menu.confirmSelectedIndex = menu.confirmSelectedIndex === 0 ? 1 : 0
      deps.requestRender()
      return
    }

    if (matchesKey(input, Key.enter)) {
      if (menu.confirmSelectedIndex === 0) {
        menu.confirmingAction = undefined
        menu.confirmSelectedIndex = undefined
        deps.requestRender()
      } else {
        const action = menu.confirmingAction
        state.interactionMode = 'browse'
        state.actionMenu = undefined
        if (action.result) {
          deps.done(action.result)
        }
      }
      return
    }
    return
  }

  if (matchesKey(input, Key.up)) {
    menu.selectedIndex = Math.max(0, menu.selectedIndex - 1)
    deps.requestRender()
    return
  }

  if (matchesKey(input, Key.down)) {
    menu.selectedIndex = Math.min(Math.max(0, menu.actions.length - 1), menu.selectedIndex + 1)
    deps.requestRender()
    return
  }

  if (!matchesKey(input, Key.enter)) return

  const action = menu.actions[menu.selectedIndex]
  if (!action) return

  if (action.danger) {
    menu.confirmingAction = action
    menu.confirmSelectedIndex = 0
    deps.requestRender()
    return
  }

  if (action.id === 'toggle-details') {
    state.isDetailExpanded = !state.isDetailExpanded
    resetDetailScroll(state)
    state.interactionMode = 'browse'
    state.actionMenu = undefined
    deps.requestRender()
    return
  }

  if (action.id === 'refresh' || action.id === 'sync') {
    state.interactionMode = 'browse'
    state.actionMenu = undefined
    deps.refresh()
    return
  }

  if (action.result) {
    deps.done(action.result)
  }
}

export function handleTeamPanelInput(
  input: string,
  data: PanelData,
  state: TeamPanelState,
  selection: PanelSelectionView,
  deps: TeamPanelInputDeps,
): void {
  if (state.interactionMode === 'action-menu') {
    handleActionMenuInput(input, state, deps)
    return
  }

  const count = sectionCount(data, state, selection)

  if (matchesKey(input, Key.shift(Key.tab)) || matchesKey(input, Key.tab)) {
    if (cycleSection(data, state, matchesKey(input, Key.shift(Key.tab)) ? -1 : 1)) deps.requestRender()
    return
  }

  const hotkeyTarget = hotkeyFocus(data, input)
  if (hotkeyTarget) {
    if (setFocus(data, state, hotkeyTarget)) deps.requestRender()
    return
  }

  if (matchesKey(input, Key.right) || input === 'e') {
    const before = panelStateFingerprint(state)
    state.scrollFocus = 'detail'
    requestRenderIfChanged(state, before, deps)
    return
  }

  if (matchesKey(input, Key.left)) {
    const before = panelStateFingerprint(state)
    state.scrollFocus = 'list'
    requestRenderIfChanged(state, before, deps)
    return
  }

  if (matchesKey(input, Key.up)) {
    const before = panelStateFingerprint(state)
    if (state.scrollFocus === 'detail') {
      state.detailScrollOffset = Math.max(0, state.detailScrollOffset - 1)
    } else {
      state.selectedIndex = Math.max(0, getPanelActiveSelectedIndex(state) - 1)
      syncPanelSelectedIndex(state)
      resetDetailScroll(state)
    }
    requestRenderIfChanged(state, before, deps)
    return
  }

  if (matchesKey(input, Key.down)) {
    const before = panelStateFingerprint(state)
    if (state.scrollFocus === 'detail') {
      state.detailScrollOffset += 1
    } else {
      state.selectedIndex = Math.min(Math.max(0, count - 1), getPanelActiveSelectedIndex(state) + 1)
      syncPanelSelectedIndex(state)
      resetDetailScroll(state)
    }
    requestRenderIfChanged(state, before, deps)
    return
  }

  if (input === 'q') {
    deps.done({ type: 'close' })
    return
  }

  if (matchesKey(input, Key.escape)) {
    if (state.scrollFocus === 'detail') {
      state.scrollFocus = 'list'
      deps.requestRender()
      return
    }
    if (state.isDetailExpanded) {
      state.isDetailExpanded = false
      resetDetailScroll(state)
      deps.requestRender()
      return
    }
    deps.done({ type: 'close' })
    return
  }

  if (matchesKey(input, Key.enter)) {
    openActionMenu(data, state, selection, deps, 'context')
    return
  }

  if (input === 'a') {
    openActionMenu(data, state, selection, deps, 'maintenance')
  }
}
