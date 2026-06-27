const GO_PANE_APP_START_WAIT_CUTOVER_SCHEMA_VERSION = 1
const GO_PANE_APP_START_WAIT_CUTOVER_THEME = 'v0.6.64 Go pane app-start wait cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'inspectPane'
const FACADE_NAME = 'waitForPaneAppStart'
const RUNTIME_FILE = 'tmux/process.ts'
const KERNEL_ADAPTER_DELEGATION = 'kernel.inspectWorkerPaneAsync(paneId, signal)'
const POLLING_CADENCE = 'polls until timeout with sleeps capped at 200ms between Go-backed inspectWorkerPaneAsync calls'
const ASYNC_ABORT_POLICY = 'pre-aborted and in-flight aborted AbortSignal return false from waitForPaneAppStart without throwing'
const SHELL_COMMAND_FILTER = 'currentCommand is trimmed and must be non-empty and not present in SHELL_COMMANDS'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const PRESERVED_BOUNDARIES = Object.freeze([
  'waitForPaneAppStart delegates polling inspection to createAgentTeamKernelAdapter().inspectWorkerPaneAsync',
  'TypeScript target-based display-message pane_current_command polling is removed from waitForPaneAppStart',
  'public waitForPaneAppStart still returns Promise<boolean>',
  'non-empty non-shell currentCommand returns true',
  'empty currentCommand, shell currentCommand, missing pane/helper failure, empty pane id, timeout, and abort return false',
  'polling cadence remains loop-based with sleeps capped at 200ms',
  'SHELL_COMMANDS remains the shell filter authority',
  'Go inspect path reuses workerLifecycle.inspectPane and global list-panes -a format',
  'Go source and native helper artifacts do not change in this slice',
  'spawn/create/kill/label/window/session lifecycle remains TypeScript-owned',
  'state repository remains TypeScript-owned',
  'task/report/PlanRun governance remains TypeScript-owned',
  'team panel view-model remains TypeScript-owned',
  'release/package verification remains unmigrated',
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
  'no native rebuild required for v0.6.64 because existing inspectPane contract is reused',
])
const goPaneAppStartWaitCutover = Object.freeze({
  schemaVersion: GO_PANE_APP_START_WAIT_CUTOVER_SCHEMA_VERSION,
  theme: GO_PANE_APP_START_WAIT_CUTOVER_THEME,
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
  pollingCadence: POLLING_CADENCE,
  asyncAbortPolicy: ASYNC_ABORT_POLICY,
  shellCommandFilter: SHELL_COMMAND_FILTER,
  facadeCutoverMigrated: true,
  typescriptDisplayMessageFallbackRemoved: true,
  shellCommandFilterPreserved: true,
  pollingLoopPreserved: true,
  failClosedOnHelperFailure: true,
  failClosedOnMissingCommand: true,
  failClosedOnMissingPane: true,
  failClosedOnEmptyPaneId: true,
  failClosedOnAbort: true,
  rawOutputLeakageAllowed: false,
  targetDisplayMessageAdded: false,
  createTeammatePaneMigrated: false,
  wakePaneMigrated: false,
  syncPaneLabelsMigrated: false,
  killPaneMigrated: false,
  windowCreationMigrated: false,
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
  ASYNC_ABORT_POLICY,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_PANE_APP_START_WAIT_CUTOVER_SCHEMA_VERSION,
  GO_PANE_APP_START_WAIT_CUTOVER_THEME,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  OPERATION,
  PACKAGE_VERSION,
  POLLING_CADENCE,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  SHELL_COMMAND_FILTER,
  goPaneAppStartWaitCutover,
}
