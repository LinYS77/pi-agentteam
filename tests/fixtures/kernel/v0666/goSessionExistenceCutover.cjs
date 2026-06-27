const GO_SESSION_EXISTENCE_CUTOVER_SCHEMA_VERSION = 1
const GO_SESSION_EXISTENCE_CUTOVER_THEME = 'v0.6.66 Go session existence cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'sessionExists'
const FACADE_NAME = 'ensureSwarmWindow'
const RUNTIME_FILE = 'tmux/windows.ts'
const KERNEL_ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)'
const GO_SESSION_EXISTS_COMMAND = 'exec.CommandContext(ctx, "tmux", "has-session", "-t", sessionName)'
const ASYNC_ABORT_POLICY = 'pre-aborted and in-flight aborted AbortSignal fail closed to false at ensureSwarmWindow session existence with compact helper diagnostics hidden inside the adapter'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'sessionExists'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const PRESERVED_BOUNDARIES = Object.freeze([
  'ensureSwarmWindow delegates session existence to a cancellable Go workerLifecycle sessionExists async adapter',
  'TypeScript runTmuxNoThrowAsync has-session fallback is removed from ensureSwarmWindow',
  'positive sessionExists confirmation skips new-session as before',
  'missing session, helper failure, invalid response, empty session name, and abort fail closed to false',
  'Go sessionExists uses only tmux has-session -t sessionName',
  'new-session remains TypeScript-owned',
  'new-window remains TypeScript-owned',
  'post-creation list-windows window name lookup remains TypeScript-owned',
  'pane setup list-panes remains TypeScript-owned',
  'inside-tmux display-message fallbacks remain TypeScript-owned',
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
  'native helper rebuilt only in the existing embedded path because Go source changed',
])
const goSessionExistenceCutover = Object.freeze({
  schemaVersion: GO_SESSION_EXISTENCE_CUTOVER_SCHEMA_VERSION,
  theme: GO_SESSION_EXISTENCE_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  facadeName: FACADE_NAME,
  runtimeFile: RUNTIME_FILE,
  kernelAdapterDelegation: KERNEL_ADAPTER_DELEGATION,
  goSessionExistsCommand: GO_SESSION_EXISTS_COMMAND,
  asyncAbortPolicy: ASYNC_ABORT_POLICY,
  facadeCutoverMigrated: true,
  typescriptHasSessionFallbackRemoved: true,
  ensureSwarmWindowBehaviorPreserved: true,
  failClosedOnHelperFailure: true,
  failClosedOnMissingSession: true,
  failClosedOnEmptySessionName: true,
  failClosedOnAbort: true,
  rawOutputLeakageAllowed: false,
  targetDisplayMessageAdded: false,
  hasSessionMigrated: true,
  newSessionMigrated: false,
  newWindowMigrated: false,
  postCreationWindowLookupMigrated: false,
  paneSetupMigrated: false,
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
  nativeHelperRebuilt: true,
  goSourceChanged: true,
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
  ASYNC_ABORT_POLICY,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_SESSION_EXISTENCE_CUTOVER_SCHEMA_VERSION,
  GO_SESSION_EXISTENCE_CUTOVER_THEME,
  GO_SESSION_EXISTS_COMMAND,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  goSessionExistenceCutover,
}
