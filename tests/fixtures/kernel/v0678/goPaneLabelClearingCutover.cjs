const GO_PANE_LABEL_CLEARING_CUTOVER_SCHEMA_VERSION = 1
const GO_PANE_LABEL_CLEARING_CUTOVER_THEME = 'v0.6.78 Go pane label clearing cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'clearPaneLabel'
const SET_OPERATION = 'setPaneLabel'
const HELPER_NAME = 'clearPaneLabel'
const SET_HELPER_NAME = 'setPaneLabel'
const ORCHESTRATOR_NAME = 'clearPaneLabelsForTeam'
const SET_ORCHESTRATOR_NAME = 'syncPaneLabelsForTeam'
const RUNTIME_FILE = 'tmux/labels.ts'
const ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'findWindowTargetByName', 'sessionExists', 'markWindowAsAgentTeam', 'refreshWindowPaneLabels', 'setPaneLabel', 'clearPaneLabel'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const AUTHORIZED_TMUX_COMMANDS = Object.freeze([
  Object.freeze({
    rendered: 'tmux set-option -up -t <paneId> @agentteam-name',
    args: Object.freeze(['set-option', '-up', '-t', '<paneId>', '@agentteam-name']),
    command: 'set-option',
    scope: 'pane-clear',
    option: '@agentteam-name',
    value: '<unset>',
    mutatesTmux: true,
    destructive: false,
  }),
  Object.freeze({
    rendered: "tmux select-pane -t <paneId> -T ''",
    args: Object.freeze(['select-pane', '-t', '<paneId>', '-T', '']),
    command: 'select-pane',
    scope: 'pane-title-clear',
    option: '-T',
    value: '',
    mutatesTmux: true,
    destructive: false,
  }),
])
const EXISTING_SET_PANE_LABEL_TMUX_COMMANDS = Object.freeze([
  Object.freeze({ rendered: 'tmux set-option -p -t <paneId> @agentteam-name <label>', args: Object.freeze(['set-option', '-p', '-t', '<paneId>', '@agentteam-name', '<label>']), operation: 'setPaneLabel', scope: 'pane' }),
  Object.freeze({ rendered: 'tmux select-pane -t <paneId> -T <label>', args: Object.freeze(['select-pane', '-t', '<paneId>', '-T', '<label>']), operation: 'setPaneLabel', scope: 'pane' }),
])
const EXISTING_MARK_WINDOW_TMUX_COMMANDS = Object.freeze([
  Object.freeze({ rendered: 'tmux set-option -w -t <target> automatic-rename off', args: Object.freeze(['set-option', '-w', '-t', '<target>', 'automatic-rename', 'off']), operation: 'markWindowAsAgentTeam', scope: 'window' }),
  Object.freeze({ rendered: 'tmux set-option -w -t <target> allow-rename off', args: Object.freeze(['set-option', '-w', '-t', '<target>', 'allow-rename', 'off']), operation: 'markWindowAsAgentTeam', scope: 'window' }),
  Object.freeze({ rendered: 'tmux set-option -w -t <target> @agentteam-window 1', args: Object.freeze(['set-option', '-w', '-t', '<target>', '@agentteam-window', '1']), operation: 'markWindowAsAgentTeam', scope: 'window' }),
])
const EXISTING_REFRESH_WINDOW_PANE_LABELS_TMUX_COMMANDS = Object.freeze([
  Object.freeze({ rendered: 'tmux set-option -w -t <target> pane-border-status top', args: Object.freeze(['set-option', '-w', '-t', '<target>', 'pane-border-status', 'top']), operation: 'refreshWindowPaneLabels', scope: 'window' }),
  Object.freeze({ rendered: "tmux set-option -w -t <target> pane-border-format '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'", args: Object.freeze(['set-option', '-w', '-t', '<target>', 'pane-border-format', '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}']), operation: 'refreshWindowPaneLabels', scope: 'window' }),
])
const DIRECT_TYPESCRIPT_CLEAR_PANE_LABEL_CALLS = Object.freeze([
  "runTmuxNoThrowAsync(['set-option', '-up', '-t', paneId, '@agentteam-name'], undefined, signal)",
  "runTmuxNoThrowAsync(['select-pane', '-t', paneId, '-T', ''], undefined, signal)",
])
const FORBIDDEN_GO_TMUX_COMMANDS = Object.freeze([
  'set-window-option',
  'new-session',
  'new-window',
  'split-window',
  'select-layout',
  'resize-pane',
  'send-keys',
  'kill-pane',
  'respawn-pane',
  'set-buffer',
  'paste-buffer',
  'kill-window',
  'kill-session',
])
const PRESERVED_BOUNDARIES = Object.freeze([
  'TypeScript/pi facade remains the public product and pi extension compliance boundary',
  'clearPaneLabelsForTeam remains TypeScript-owned orchestration',
  'clearPaneLabel remains private no-throw Promise<void> at the TypeScript helper boundary',
  'Go owns only the two authorized non-destructive pane-level clearPaneLabel tmux commands',
  'setPaneLabel remains v0.6.76 Go-backed with raw-label diagnostics policy unchanged',
  'markWindowAsAgentTeam remains Go-backed with the v0.6.72 command surface',
  'refreshWindowPaneLabels remains Go-backed with the v0.6.74 command surface',
  'new-session/new-window/pane creation/layout/wake/kill/state/task/UI/release/package remain outside this slice',
])
const RELEASE_PACKAGE_GUARDS = Object.freeze([
  'no npm version',
  'no npm publish',
  'no tag or release creation',
  'no GitHub release assets',
  'no package version bump',
  'no package lockfiles',
  'no go.mod or go.sum',
  'no lifecycle hooks or postinstall downloads',
  'no native artifact path or binary rename',
])
const goPaneLabelClearingCutover = Object.freeze({
  schemaVersion: GO_PANE_LABEL_CLEARING_CUTOVER_SCHEMA_VERSION,
  theme: GO_PANE_LABEL_CLEARING_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  setOperation: SET_OPERATION,
  helperName: HELPER_NAME,
  setHelperName: SET_HELPER_NAME,
  orchestratorName: ORCHESTRATOR_NAME,
  setOrchestratorName: SET_ORCHESTRATOR_NAME,
  runtimeFile: RUNTIME_FILE,
  adapterDelegation: ADAPTER_DELEGATION,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  authorizedTmuxCommands: AUTHORIZED_TMUX_COMMANDS,
  existingSetPaneLabelTmuxCommands: EXISTING_SET_PANE_LABEL_TMUX_COMMANDS,
  existingMarkWindowTmuxCommands: EXISTING_MARK_WINDOW_TMUX_COMMANDS,
  existingRefreshWindowPaneLabelsTmuxCommands: EXISTING_REFRESH_WINDOW_PANE_LABELS_TMUX_COMMANDS,
  directTypescriptClearPaneLabelCalls: DIRECT_TYPESCRIPT_CLEAR_PANE_LABEL_CALLS,
  forbiddenGoTmuxCommands: FORBIDDEN_GO_TMUX_COMMANDS,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  facadeCutoverMigrated: true,
  clearPaneLabelMigrated: true,
  typescriptClearPaneLabelFallbackRemoved: true,
  noThrowVoidHelperPreserved: true,
  rawOutputLeakageAllowed: false,
  helperFailureThrowsPublicly: false,
  invalidPaneThrowsPublicly: false,
  abortThrowsPublicly: false,
  futureCandidateDestructive: false,
  clearPaneLabelsForTeamMigrated: false,
  setPaneLabelMigrated: true,
  setPaneLabelCommandSurfaceChanged: false,
  markWindowAsAgentTeamMigrated: true,
  markWindowAsAgentTeamCommandSurfaceChanged: false,
  refreshWindowPaneLabelsMigrated: true,
  refreshWindowPaneLabelsCommandSurfaceChanged: false,
  newSessionMigrated: false,
  newWindowMigrated: false,
  createTeammatePaneMigrated: false,
  wakePaneMigrated: false,
  killPaneMigrated: false,
  stateRepositoryMigrated: false,
  taskReportPlanRunMigrated: false,
  teamPanelViewModelMigrated: false,
  releasePackageVerificationMigrated: false,
  nativeArtifactRenamed: false,
  nativeHelperRebuilt: true,
  goSourceChanged: true,
  packageVersionChanged: false,
  packageReleaseApproved: false,
  npmVersionChanged: false,
  npmPublished: false,
  tagReleaseCreated: false,
})

module.exports = {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ADAPTER_DELEGATION,
  AUTHORIZED_TMUX_COMMANDS,
  CAPABILITY,
  DIRECT_TYPESCRIPT_CLEAR_PANE_LABEL_CALLS,
  EXISTING_MARK_WINDOW_TMUX_COMMANDS,
  EXISTING_REFRESH_WINDOW_PANE_LABELS_TMUX_COMMANDS,
  EXISTING_SET_PANE_LABEL_TMUX_COMMANDS,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_PANE_LABEL_CLEARING_CUTOVER_SCHEMA_VERSION,
  GO_PANE_LABEL_CLEARING_CUTOVER_THEME,
  HELPER_NAME,
  HELPER_VERSION,
  OPERATION,
  ORCHESTRATOR_NAME,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  SET_HELPER_NAME,
  SET_OPERATION,
  SET_ORCHESTRATOR_NAME,
  goPaneLabelClearingCutover,
}
