const GO_DETACHED_LEADER_BINDING_CUTOVER_SCHEMA_VERSION = 1
const GO_DETACHED_LEADER_BINDING_CUTOVER_THEME = 'v0.6.68 Go detached leader binding cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'inspectPane'
const FACADE_NAME = 'ensureSwarmWindow'
const RUNTIME_FILE = 'tmux/windows.ts'
const LEADER_BINDING_DELEGATION = 'resolvePaneBindingAsync(leaderPaneId, signal)'
const GO_INSPECT_PANE_COMMAND = 'exec.CommandContext(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat)'
const COMPACT_FAILURE_ERROR = 'Failed to resolve agentteam leader pane binding'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'sessionExists'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const PRESERVED_BOUNDARIES = Object.freeze([
  'detached ensureSwarmWindow leader target resolution reuses resolvePaneBindingAsync leaderPaneId signal',
  'direct TypeScript target-based display-message leaderPane window_id fallback is removed from detached ensureSwarmWindow branch',
  'resolvePaneBindingAsync remains Go-backed through workerLifecycle inspectPane and compact target',
  'unavailable leader binding throws compact Failed to resolve agentteam leader pane binding',
  'initialTarget discovery and creation behavior remain unchanged',
  'pane setup list-panes is superseded by v0.6.69 firstPaneInWindow reuse',
  'post-creation list-windows window name lookup is superseded by v0.6.70 findWindowTargetByName reuse',
  'new-session remains TypeScript-owned',
  'new-window remains TypeScript-owned',
  'markWindowAsAgentTeam and refreshWindowPaneLabels remain TypeScript-owned',
  'inside-tmux current binding fallback remains v0.6.67 captureCurrentPaneBinding reuse',
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
const goDetachedLeaderBindingCutover = Object.freeze({
  schemaVersion: GO_DETACHED_LEADER_BINDING_CUTOVER_SCHEMA_VERSION,
  theme: GO_DETACHED_LEADER_BINDING_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  facadeName: FACADE_NAME,
  runtimeFile: RUNTIME_FILE,
  leaderBindingDelegation: LEADER_BINDING_DELEGATION,
  goInspectPaneCommand: GO_INSPECT_PANE_COMMAND,
  compactFailureError: COMPACT_FAILURE_ERROR,
  facadeCutoverMigrated: true,
  typescriptTargetBasedDisplayMessageFallbackRemoved: true,
  resolvePaneBindingAsyncReused: true,
  failClosedThrowOnMissingLeaderBinding: true,
  returnedShapePreservedOnSuccess: true,
  rawOutputLeakageAllowed: false,
  insideTmuxCurrentBindingMigratedByPreviousSlice: true,
  paneSetupMigrated: false,
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
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_DETACHED_LEADER_BINDING_CUTOVER_SCHEMA_VERSION,
  GO_DETACHED_LEADER_BINDING_CUTOVER_THEME,
  GO_INSPECT_PANE_COMMAND,
  HELPER_VERSION,
  LEADER_BINDING_DELEGATION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  goDetachedLeaderBindingCutover,
}
