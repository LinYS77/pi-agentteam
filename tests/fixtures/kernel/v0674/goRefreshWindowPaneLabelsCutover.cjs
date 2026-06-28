const GO_REFRESH_WINDOW_PANE_LABELS_CUTOVER_SCHEMA_VERSION = 1
const GO_REFRESH_WINDOW_PANE_LABELS_CUTOVER_THEME = 'v0.6.74 Go refresh window pane labels cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'refreshWindowPaneLabels'
const FACADE_NAME = 'refreshWindowPaneLabels'
const RUNTIME_FILE = 'tmux/labels.ts'
const WINDOW_EXISTENCE_GUARD = 'windowExists(target, signal)'
const ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'findWindowTargetByName', 'sessionExists', 'markWindowAsAgentTeam', 'refreshWindowPaneLabels'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const AUTHORIZED_TMUX_COMMANDS = Object.freeze([
  Object.freeze({
    rendered: 'tmux set-option -w -t <target> pane-border-status top',
    args: Object.freeze(['set-option', '-w', '-t', '<target>', 'pane-border-status', 'top']),
    option: 'pane-border-status',
    value: 'top',
    destructive: false,
    mutatesTmux: true,
  }),
  Object.freeze({
    rendered: "tmux set-option -w -t <target> pane-border-format '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'",
    args: Object.freeze(['set-option', '-w', '-t', '<target>', 'pane-border-format', '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}']),
    option: 'pane-border-format',
    value: '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}',
    destructive: false,
    mutatesTmux: true,
  }),
])
const EXISTING_MARK_WINDOW_TMUX_COMMANDS = Object.freeze([
  Object.freeze({
    rendered: 'tmux set-option -w -t <target> automatic-rename off',
    args: Object.freeze(['set-option', '-w', '-t', '<target>', 'automatic-rename', 'off']),
    option: 'automatic-rename',
    value: 'off',
    destructive: false,
    mutatesTmux: true,
  }),
  Object.freeze({
    rendered: 'tmux set-option -w -t <target> allow-rename off',
    args: Object.freeze(['set-option', '-w', '-t', '<target>', 'allow-rename', 'off']),
    option: 'allow-rename',
    value: 'off',
    destructive: false,
    mutatesTmux: true,
  }),
  Object.freeze({
    rendered: 'tmux set-option -w -t <target> @agentteam-window 1',
    args: Object.freeze(['set-option', '-w', '-t', '<target>', '@agentteam-window', '1']),
    option: '@agentteam-window',
    value: '1',
    destructive: false,
    mutatesTmux: true,
  }),
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
  'select-pane',
  'respawn-pane',
  'set-buffer',
  'paste-buffer',
  'kill-window',
  'kill-session',
])
const DIRECT_TS_REFRESH_CALLS = Object.freeze([
  "runTmuxNoThrowAsync(['set-option', '-w', '-t', target, 'pane-border-status', 'top'], undefined, signal)",
  "runTmuxNoThrowAsync(['set-option', '-w', '-t', target, 'pane-border-format', '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'], undefined, signal)",
])
const PRESERVED_BOUNDARIES = Object.freeze([
  'TypeScript/pi facade remains the public product and pi extension compliance boundary',
  'window existence authority remains explicit through the TypeScript windowExists(target, signal) guard',
  'refreshWindowPaneLabels remains no-throw Promise<void> at the public facade',
  'Go owns only the two authorized non-destructive pane-border window set-option commands for refreshWindowPaneLabels',
  'no direct TypeScript set-option -w fallback remains for refreshWindowPaneLabels',
  'markWindowAsAgentTeam remains Go-backed with the v0.6.72 three-command surface',
  'pane labels via set-option -p remain TypeScript-owned',
  'pane titles via select-pane -T remain TypeScript-owned',
  'new-session and new-window remain TypeScript-owned',
  'pane creation, layout, wake, kill, state, task, UI, release, and package remain outside this slice',
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
const goRefreshWindowPaneLabelsCutover = Object.freeze({
  schemaVersion: GO_REFRESH_WINDOW_PANE_LABELS_CUTOVER_SCHEMA_VERSION,
  theme: GO_REFRESH_WINDOW_PANE_LABELS_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  facadeName: FACADE_NAME,
  runtimeFile: RUNTIME_FILE,
  windowExistenceGuard: WINDOW_EXISTENCE_GUARD,
  adapterDelegation: ADAPTER_DELEGATION,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  authorizedTmuxCommands: AUTHORIZED_TMUX_COMMANDS,
  existingMarkWindowTmuxCommands: EXISTING_MARK_WINDOW_TMUX_COMMANDS,
  forbiddenGoTmuxCommands: FORBIDDEN_GO_TMUX_COMMANDS,
  directTypescriptRefreshCalls: DIRECT_TS_REFRESH_CALLS,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  facadeCutoverMigrated: true,
  refreshWindowPaneLabelsMigrated: true,
  typescriptSetOptionFallbackRemoved: true,
  windowExistsGuardPreserved: true,
  noThrowVoidFacadePreserved: true,
  rawOutputLeakageAllowed: false,
  helperFailureThrowsPublicly: false,
  invalidTargetThrowsPublicly: false,
  abortThrowsPublicly: false,
  futureCandidateDestructive: false,
  markWindowAsAgentTeamMigrated: true,
  markWindowAsAgentTeamCommandSurfaceChanged: false,
  paneLabelsMigrated: false,
  paneTitlesMigrated: false,
  newSessionMigrated: false,
  newWindowMigrated: false,
  createTeammatePaneMigrated: false,
  wakePaneMigrated: false,
  syncPaneLabelsMigrated: false,
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
  DIRECT_TS_REFRESH_CALLS,
  EXISTING_MARK_WINDOW_TMUX_COMMANDS,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_REFRESH_WINDOW_PANE_LABELS_CUTOVER_SCHEMA_VERSION,
  GO_REFRESH_WINDOW_PANE_LABELS_CUTOVER_THEME,
  HELPER_VERSION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  WINDOW_EXISTENCE_GUARD,
  goRefreshWindowPaneLabelsCutover,
}
