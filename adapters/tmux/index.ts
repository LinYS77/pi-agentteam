import * as core from '../../tmux/core.js'
import * as labels from '../../tmux/labels.js'
import * as panes from '../../tmux/panes.js'
import * as process from '../../tmux/process.js'
import * as windows from '../../tmux/windows.js'

// Small writable facade so runtime/tests can patch only the business-level tmux helpers.
export const captureCurrentPaneBinding = core.captureCurrentPaneBinding
export const inspectPane = core.inspectPane
export const captureTmuxSnapshot = core.captureTmuxSnapshot
export const findPaneInSnapshot = core.findPaneInSnapshot
export const listAgentTeamPanes = core.listAgentTeamPanes
export const listAgentTeamPanesFromSnapshot = core.listAgentTeamPanesFromSnapshot
export const paneExistsInSnapshot = core.paneExistsInSnapshot
export const parseTmuxPaneSnapshot = core.parseTmuxPaneSnapshot
export const resolvePaneBindingFromSnapshot = core.resolvePaneBindingFromSnapshot
export const paneExists = core.paneExists
export const resolvePaneBinding = core.resolvePaneBinding
export const shellEscapeArg = core.shellEscapeArg

export const clearPaneLabelsForTeam = labels.clearPaneLabelsForTeam
export const syncPaneLabelsForTeam = labels.syncPaneLabelsForTeam

export const createTeammatePane = panes.createTeammatePane
export const killPane = panes.killPane
export const clearPaneLabelSync = panes.clearPaneLabelSync

export const ensureSwarmWindow = windows.ensureSwarmWindow

export const waitForPaneAppStart = process.waitForPaneAppStart
