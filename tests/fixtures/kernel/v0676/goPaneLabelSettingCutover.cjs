const GO_PANE_LABEL_SETTING_CUTOVER_SCHEMA_VERSION = 1
const GO_PANE_LABEL_SETTING_CUTOVER_THEME = 'v0.6.76 Go pane label setting cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'setPaneLabel'
const HELPER_NAME = 'setPaneLabel'
const ORCHESTRATOR_NAME = 'syncPaneLabelsForTeam'
const CLEAR_HELPER_NAME = 'clearPaneLabel'
const RUNTIME_FILE = 'tmux/labels.ts'
const ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)'
const LABEL_ARGUMENT_LIMIT = 4096
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'findWindowTargetByName', 'sessionExists', 'markWindowAsAgentTeam', 'refreshWindowPaneLabels', 'setPaneLabel'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const AUTHORIZED_TMUX_COMMANDS = Object.freeze([
  Object.freeze({
    rendered: 'tmux set-option -p -t <paneId> @agentteam-name <label>',
    args: Object.freeze(['set-option', '-p', '-t', '<paneId>', '@agentteam-name', '<label>']),
    command: 'set-option',
    scope: 'pane',
    option: '@agentteam-name',
    value: '<opaque label argv>',
    destructive: false,
    mutatesTmux: true,
  }),
  Object.freeze({
    rendered: 'tmux select-pane -t <paneId> -T <label>',
    args: Object.freeze(['select-pane', '-t', '<paneId>', '-T', '<label>']),
    command: 'select-pane',
    scope: 'pane',
    option: '-T',
    value: '<opaque label argv>',
    destructive: false,
    mutatesTmux: true,
  }),
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
const DIRECT_TYPESCRIPT_SET_PANE_LABEL_CALLS = Object.freeze([
  "runTmuxNoThrowAsync(['set-option', '-p', '-t', paneId, '@agentteam-name', label], undefined, signal)",
  "runTmuxNoThrowAsync(['select-pane', '-t', paneId, '-T', label], undefined, signal)",
])
const PRESERVED_CLEAR_PANE_LABEL_CALLS = Object.freeze([
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
  'syncPaneLabelsForTeam remains TypeScript-owned orchestration',
  'setPaneLabel remains private no-throw Promise<void> at the TypeScript helper boundary',
  'Go owns only the two authorized non-destructive pane-level setPaneLabel tmux commands',
  'label is opaque Unicode/user-visible argv data and is never shell text',
  'raw label text must not appear in diagnostics, errors, logs, reports, or validation fixtures',
  'clearPaneLabel remains TypeScript-owned',
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
const goPaneLabelSettingCutover = Object.freeze({
  schemaVersion: GO_PANE_LABEL_SETTING_CUTOVER_SCHEMA_VERSION,
  theme: GO_PANE_LABEL_SETTING_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  helperName: HELPER_NAME,
  orchestratorName: ORCHESTRATOR_NAME,
  clearHelperName: CLEAR_HELPER_NAME,
  runtimeFile: RUNTIME_FILE,
  adapterDelegation: ADAPTER_DELEGATION,
  labelArgumentLimit: LABEL_ARGUMENT_LIMIT,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  authorizedTmuxCommands: AUTHORIZED_TMUX_COMMANDS,
  existingMarkWindowTmuxCommands: EXISTING_MARK_WINDOW_TMUX_COMMANDS,
  existingRefreshWindowPaneLabelsTmuxCommands: EXISTING_REFRESH_WINDOW_PANE_LABELS_TMUX_COMMANDS,
  directTypescriptSetPaneLabelCalls: DIRECT_TYPESCRIPT_SET_PANE_LABEL_CALLS,
  preservedClearPaneLabelCalls: PRESERVED_CLEAR_PANE_LABEL_CALLS,
  forbiddenGoTmuxCommands: FORBIDDEN_GO_TMUX_COMMANDS,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  facadeCutoverMigrated: true,
  setPaneLabelMigrated: true,
  typescriptSetPaneLabelFallbackRemoved: true,
  noThrowVoidHelperPreserved: true,
  rawLabelLeakageAllowed: false,
  rawOutputLeakageAllowed: false,
  helperFailureThrowsPublicly: false,
  invalidPaneThrowsPublicly: false,
  invalidLabelThrowsPublicly: false,
  abortThrowsPublicly: false,
  futureCandidateDestructive: false,
  clearPaneLabelMigrated: false,
  syncPaneLabelsMigrated: false,
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
  CLEAR_HELPER_NAME,
  DIRECT_TYPESCRIPT_SET_PANE_LABEL_CALLS,
  EXISTING_MARK_WINDOW_TMUX_COMMANDS,
  EXISTING_REFRESH_WINDOW_PANE_LABELS_TMUX_COMMANDS,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_PANE_LABEL_SETTING_CUTOVER_SCHEMA_VERSION,
  GO_PANE_LABEL_SETTING_CUTOVER_THEME,
  HELPER_NAME,
  HELPER_VERSION,
  LABEL_ARGUMENT_LIMIT,
  OPERATION,
  ORCHESTRATOR_NAME,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PRESERVED_CLEAR_PANE_LABEL_CALLS,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  goPaneLabelSettingCutover,
}
