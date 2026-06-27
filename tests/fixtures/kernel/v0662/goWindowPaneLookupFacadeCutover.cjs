const GO_WINDOW_PANE_LOOKUP_FACADE_CUTOVER_SCHEMA_VERSION = 1
const GO_WINDOW_PANE_LOOKUP_FACADE_CUTOVER_THEME = 'v0.6.62 Go window pane lookup facade cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'listPanesInWindow'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const FACADE_NAMES = Object.freeze(['windowExists', 'firstPaneInWindow'])
const WINDOW_EXISTS_DELEGATION = 'createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)'
const FIRST_PANE_DELEGATION = 'createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)'
const ASYNC_ABORT_POLICY = 'pre-aborted and in-flight aborted AbortSignal fail closed to false/null at the public facades with compact helper-spawn-error diagnostics'
const GO_WINDOW_PANE_COMMAND = 'exec.CommandContext(ctx, "tmux", "list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat)'
const GO_WINDOW_PANE_FORMAT = '#{pane_id}'
const PRESERVED_BOUNDARIES = Object.freeze([
  'windowExists and firstPaneInWindow delegate to a cancellable Go workerLifecycle listPanesInWindow async adapter',
  'TypeScript target-based list-panes fallback removed from windowExists and firstPaneInWindow facades',
  'Go listPanesInWindow uses only target-based tmux list-panes -t with compact pane_id format',
  'listAgentTeamPanes remains label-filtered and uses global list-panes -a only',
  'resolvePaneBindingAsync remains Go-backed through inspectWorkerPaneAsync',
  'captureCurrentPaneBinding keeps the v0.6.60 outside-tmux guard and current-pane Go operation',
  'Go display-message use is still limited to the no-target current-pane compact binding operation',
  'wake/create/label/kill lifecycle remains TypeScript-owned',
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
const goWindowPaneLookupFacadeCutover = Object.freeze({
  schemaVersion: GO_WINDOW_PANE_LOOKUP_FACADE_CUTOVER_SCHEMA_VERSION,
  theme: GO_WINDOW_PANE_LOOKUP_FACADE_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  facadeNames: FACADE_NAMES,
  windowExistsDelegation: WINDOW_EXISTS_DELEGATION,
  firstPaneDelegation: FIRST_PANE_DELEGATION,
  asyncAbortPolicy: ASYNC_ABORT_POLICY,
  goWindowPaneCommand: GO_WINDOW_PANE_COMMAND,
  goWindowPaneFormat: GO_WINDOW_PANE_FORMAT,
  facadeCutoverMigrated: true,
  windowHelpersMigrated: true,
  typescriptTargetListPanesFallbackRemoved: true,
  abortWindowExistsFalse: true,
  abortFirstPaneNull: true,
  failClosedFalseOnEmptyTarget: true,
  failClosedFalseOnHelperFailure: true,
  failClosedNullOnEmptyTarget: true,
  failClosedNullOnHelperFailure: true,
  failClosedNullOnEmptyPaneList: true,
  failClosedOnInvalidResponse: true,
  listAgentTeamPanesStillLabelFiltered: true,
  targetDisplayMessageAdded: false,
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
  FACADE_NAMES,
  FIRST_PANE_DELEGATION,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_WINDOW_PANE_COMMAND,
  GO_WINDOW_PANE_FORMAT,
  GO_WINDOW_PANE_LOOKUP_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_WINDOW_PANE_LOOKUP_FACADE_CUTOVER_THEME,
  HELPER_VERSION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  WINDOW_EXISTS_DELEGATION,
  goWindowPaneLookupFacadeCutover,
}
