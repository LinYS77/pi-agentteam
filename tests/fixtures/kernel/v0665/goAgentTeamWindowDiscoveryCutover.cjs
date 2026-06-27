const GO_AGENTTEAM_WINDOW_DISCOVERY_CUTOVER_SCHEMA_VERSION = 1
const GO_AGENTTEAM_WINDOW_DISCOVERY_CUTOVER_THEME = 'v0.6.65 Go agentteam window discovery cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'findAgentTeamWindowTarget'
const FACADE_NAME = 'findAgentTeamWindowTarget'
const RUNTIME_FILE = 'tmux/windows.ts'
const KERNEL_ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().findAgentTeamWindowTargetAsync(sessionName, signal)'
const GO_WINDOW_DISCOVERY_COMMAND = 'exec.CommandContext(ctx, "tmux", "list-windows", "-t", sessionName, "-F", workerLifecycleAgentTeamWindowFormat)'
const GO_WINDOW_DISCOVERY_FORMAT = '#{window_id}\t#{@agentteam-window}'
const ASYNC_ABORT_POLICY = 'pre-aborted and in-flight aborted AbortSignal fail closed to null at findAgentTeamWindowTarget with compact helper diagnostics hidden inside the adapter'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const PRESERVED_BOUNDARIES = Object.freeze([
  'findAgentTeamWindowTarget delegates to a cancellable Go workerLifecycle findAgentTeamWindowTarget async adapter',
  'TypeScript target-based list-windows marker parsing is removed from findAgentTeamWindowTarget',
  'ensureSwarmWindow caller behavior remains unchanged',
  'marked agentteam window returns sessionName:windowId target',
  'no marked window, missing session, helper failure, invalid response, empty session name, and abort fail closed to null',
  'Go findAgentTeamWindowTarget uses only tmux list-windows -t sessionName with compact window_id and agentteam-window marker format',
  'has-session remains TypeScript-owned',
  'new-session and new-window remain TypeScript-owned',
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
const goAgentTeamWindowDiscoveryCutover = Object.freeze({
  schemaVersion: GO_AGENTTEAM_WINDOW_DISCOVERY_CUTOVER_SCHEMA_VERSION,
  theme: GO_AGENTTEAM_WINDOW_DISCOVERY_CUTOVER_THEME,
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
  goWindowDiscoveryCommand: GO_WINDOW_DISCOVERY_COMMAND,
  goWindowDiscoveryFormat: GO_WINDOW_DISCOVERY_FORMAT,
  asyncAbortPolicy: ASYNC_ABORT_POLICY,
  facadeCutoverMigrated: true,
  typescriptListWindowsFallbackRemoved: true,
  ensureSwarmWindowBehaviorPreserved: true,
  failClosedOnHelperFailure: true,
  failClosedOnMissingSession: true,
  failClosedOnNoMarkedWindow: true,
  failClosedOnEmptySessionName: true,
  failClosedOnAbort: true,
  rawOutputLeakageAllowed: false,
  targetDisplayMessageAdded: false,
  hasSessionMigrated: false,
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
  GO_AGENTTEAM_WINDOW_DISCOVERY_CUTOVER_SCHEMA_VERSION,
  GO_AGENTTEAM_WINDOW_DISCOVERY_CUTOVER_THEME,
  GO_WINDOW_DISCOVERY_COMMAND,
  GO_WINDOW_DISCOVERY_FORMAT,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  goAgentTeamWindowDiscoveryCutover,
}
