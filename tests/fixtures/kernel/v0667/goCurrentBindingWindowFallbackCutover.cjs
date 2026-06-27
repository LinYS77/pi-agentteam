const GO_CURRENT_BINDING_WINDOW_FALLBACK_CUTOVER_SCHEMA_VERSION = 1
const GO_CURRENT_BINDING_WINDOW_FALLBACK_CUTOVER_THEME = 'v0.6.67 Go current binding window fallback cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'captureCurrentPaneBinding'
const FACADE_NAME = 'ensureSwarmWindow'
const RUNTIME_FILE = 'tmux/windows.ts'
const CURRENT_BINDING_DELEGATION = 'captureCurrentPaneBinding()'
const GO_CURRENT_PANE_FORMAT = '#{pane_id}\t#{session_name}:#{window_id}'
const GO_CURRENT_PANE_COMMAND = 'exec.CommandContext(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat)'
const COMPACT_FAILURE_ERROR = 'Failed to resolve current tmux pane binding'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'sessionExists'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const PRESERVED_BOUNDARIES = Object.freeze([
  'ensureSwarmWindow inside-tmux branch reuses captureCurrentPaneBinding for current target and current pane fallbacks',
  'direct TypeScript display-message current target fallback is removed from ensureSwarmWindow inside-tmux branch',
  'direct TypeScript display-message current pane id fallback is removed from ensureSwarmWindow inside-tmux branch',
  'preferred leader pane binding continues to win before current binding fallback',
  'preferred target continues to win when windowExists confirms it',
  'firstPaneInWindow continues to choose leader pane when target is known',
  'unavailable current binding throws compact Failed to resolve current tmux pane binding only when no preferred or first-pane equivalent can provide needed values',
  'target-based detached leaderPane window_id display-message fallback is superseded by v0.6.68 resolvePaneBindingAsync reuse',
  'post-creation list-windows window name lookup remains TypeScript-owned',
  'pane setup list-panes is superseded by v0.6.69 firstPaneInWindow reuse',
  'new-session remains TypeScript-owned',
  'new-window remains TypeScript-owned',
  'markWindowAsAgentTeam and refreshWindowPaneLabels remain TypeScript-owned',
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
const goCurrentBindingWindowFallbackCutover = Object.freeze({
  schemaVersion: GO_CURRENT_BINDING_WINDOW_FALLBACK_CUTOVER_SCHEMA_VERSION,
  theme: GO_CURRENT_BINDING_WINDOW_FALLBACK_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  facadeName: FACADE_NAME,
  runtimeFile: RUNTIME_FILE,
  currentBindingDelegation: CURRENT_BINDING_DELEGATION,
  goCurrentPaneFormat: GO_CURRENT_PANE_FORMAT,
  goCurrentPaneCommand: GO_CURRENT_PANE_COMMAND,
  compactFailureError: COMPACT_FAILURE_ERROR,
  facadeCutoverMigrated: true,
  typescriptCurrentTargetDisplayMessageFallbackRemoved: true,
  typescriptCurrentPaneDisplayMessageFallbackRemoved: true,
  captureCurrentPaneBindingReused: true,
  preferredBindingPreserved: true,
  preferredTargetPreserved: true,
  firstPaneInWindowPreserved: true,
  failClosedThrowOnMissingCurrentBinding: true,
  rawOutputLeakageAllowed: false,
  targetBasedLeaderPaneWindowIdFallbackMigrated: false,
  postCreationWindowLookupMigrated: false,
  paneSetupMigrated: false,
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
  CURRENT_BINDING_DELEGATION,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_CURRENT_BINDING_WINDOW_FALLBACK_CUTOVER_SCHEMA_VERSION,
  GO_CURRENT_BINDING_WINDOW_FALLBACK_CUTOVER_THEME,
  GO_CURRENT_PANE_COMMAND,
  GO_CURRENT_PANE_FORMAT,
  HELPER_VERSION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  goCurrentBindingWindowFallbackCutover,
}
