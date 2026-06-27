const GO_DETACHED_FIRST_PANE_CUTOVER_SCHEMA_VERSION = 1
const GO_DETACHED_FIRST_PANE_CUTOVER_THEME = 'v0.6.69 Go detached first pane cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'listPanesInWindow'
const FACADE_NAME = 'ensureSwarmWindow'
const RUNTIME_FILE = 'tmux/windows.ts'
const FIRST_PANE_DELEGATION = 'firstPaneInWindow(initialTarget, signal)'
const TARGET_BINDING_DELEGATION = 'resolvePaneBindingAsync(leaderPaneId, signal)'
const GO_LIST_PANES_IN_WINDOW_COMMAND = 'exec.CommandContext(ctx, "tmux", "list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat)'
const COMPACT_FAILURE_ERROR = 'Failed to resolve agentteam leader pane'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'sessionExists'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const PRESERVED_BOUNDARIES = Object.freeze([
  'detached ensureSwarmWindow leader pane selection reuses firstPaneInWindow initialTarget signal',
  'direct TypeScript list-panes pane setup parsing is removed from detached ensureSwarmWindow branch',
  'firstPaneInWindow remains Go-backed through workerLifecycle listPanesInWindow',
  'resolvePaneBindingAsync remains the Go-backed leader target source after leader pane selection',
  'unavailable first pane throws compact Failed to resolve agentteam leader pane',
  'initialTarget discovery and creation behavior remain unchanged',
  'post-creation list-windows window name lookup remains TypeScript-owned',
  'new-session remains TypeScript-owned',
  'new-window remains TypeScript-owned',
  'markWindowAsAgentTeam and refreshWindowPaneLabels remain TypeScript-owned',
  'inside-tmux current binding fallback remains v0.6.67 captureCurrentPaneBinding reuse',
  'detached leader target fallback remains v0.6.68 resolvePaneBindingAsync reuse',
  'createTeammatePane, pane creation, labels, kill, wake, and sync lifecycle remain TypeScript-owned',
  'state repository remains TypeScript-owned',
  'task/report/PlanRun governance remains TypeScript-owned',
  'team panel view-model remains TypeScript-owned',
  'release/package verification remains unmigrated',
  'native artifact path and binary name remain unchanged',
])
const FORBIDDEN_GO_TMUX_COMMANDS = Object.freeze([
  'send-keys',
  'split-window',
  'new-session',
  'new-window',
  'kill-pane',
  'capture-pane',
  'set-option',
  'set-window-option',
  'select-pane',
  'respawn-pane',
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
  'no native artifact rename',
  'no Go source or native artifact rebuild in this slice',
])
const goDetachedFirstPaneCutover = Object.freeze({
  schemaVersion: GO_DETACHED_FIRST_PANE_CUTOVER_SCHEMA_VERSION,
  theme: GO_DETACHED_FIRST_PANE_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  facadeName: FACADE_NAME,
  runtimeFile: RUNTIME_FILE,
  firstPaneDelegation: FIRST_PANE_DELEGATION,
  targetBindingDelegation: TARGET_BINDING_DELEGATION,
  goListPanesInWindowCommand: GO_LIST_PANES_IN_WINDOW_COMMAND,
  compactFailureError: COMPACT_FAILURE_ERROR,
  facadeCutoverMigrated: true,
  typescriptPaneSetupListPanesFallbackRemoved: true,
  firstPaneInWindowReused: true,
  resolvePaneBindingAsyncReused: true,
  failClosedThrowOnMissingFirstPane: true,
  returnedShapePreservedOnSuccess: true,
  rawOutputLeakageAllowed: false,
  postCreationWindowLookupMigrated: false,
  newSessionMigrated: false,
  newWindowMigrated: false,
  markWindowAsAgentTeamMigrated: false,
  refreshWindowPaneLabelsMigrated: false,
  createTeammatePaneMigrated: false,
  wakePaneMigrated: false,
  syncPaneLabelsMigrated: false,
  killPaneMigrated: false,
  stateRepositoryMigrated: false,
  taskReportPlanRunMigrated: false,
  teamPanelViewModelMigrated: false,
  releasePackageVerificationMigrated: false,
  nativeArtifactRenamed: false,
  nativeHelperRebuilt: false,
  goSourceChanged: false,
  packageVersionChanged: false,
  packageReleaseApproved: false,
  npmVersionChanged: false,
  npmPublished: false,
  tagReleaseCreated: false,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  forbiddenGoTmuxCommands: FORBIDDEN_GO_TMUX_COMMANDS,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
})

module.exports = {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  CAPABILITY,
  COMPACT_FAILURE_ERROR,
  FACADE_NAME,
  FIRST_PANE_DELEGATION,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_DETACHED_FIRST_PANE_CUTOVER_SCHEMA_VERSION,
  GO_DETACHED_FIRST_PANE_CUTOVER_THEME,
  GO_LIST_PANES_IN_WINDOW_COMMAND,
  HELPER_VERSION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  TARGET_BINDING_DELEGATION,
  goDetachedFirstPaneCutover,
}
