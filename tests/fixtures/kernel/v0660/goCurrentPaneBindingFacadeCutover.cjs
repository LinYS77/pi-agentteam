const GO_CURRENT_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION = 1
const GO_CURRENT_PANE_BINDING_FACADE_CUTOVER_THEME = 'v0.6.60 Go captureCurrentPaneBinding facade cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const FACADE_NAME = 'captureCurrentPaneBinding'
const KERNEL_ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().captureCurrentPaneBinding()'
const GO_CURRENT_PANE_FORMAT = '#{pane_id}\t#{session_name}:#{window_id}'
const GO_CURRENT_PANE_COMMAND = 'exec.CommandContext(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat)'
const PRESERVED_BOUNDARIES = Object.freeze([
  'captureCurrentPaneBinding keeps the isInsideTmux fail-closed guard before helper invocation',
  'captureCurrentPaneBinding facade delegates to Go workerLifecycle captureCurrentPaneBinding adapter',
  'TypeScript display-message fallback removed for captureCurrentPaneBinding facade',
  'Go display-message use is limited to the no-target current-pane compact binding operation',
  'resolvePaneBindingAsync is cut over separately by v0.6.61 through a cancellable async helper seam',
  'window helpers are cut over by v0.6.62 through a cancellable async Go listPanesInWindow seam',
  'inspectPane, paneExists, resolvePaneBinding, targetForPaneId, and listAgentTeamPanes remain Go-backed',
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
const goCurrentPaneBindingFacadeCutover = Object.freeze({
  schemaVersion: GO_CURRENT_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION,
  theme: GO_CURRENT_PANE_BINDING_FACADE_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  facadeName: FACADE_NAME,
  kernelAdapterDelegation: KERNEL_ADAPTER_DELEGATION,
  goCurrentPaneFormat: GO_CURRENT_PANE_FORMAT,
  goCurrentPaneCommand: GO_CURRENT_PANE_COMMAND,
  facadeCutoverMigrated: true,
  typescriptDisplayMessageFallbackRemoved: true,
  failClosedNullOutsideTmux: true,
  failClosedNullOnHelperFailure: true,
  failClosedNullOnMissingPaneIdOrTarget: true,
  tmuxEnvForwardedToHelper: true,
  currentPaneDisplayMessageAllowedOnlyForThisOperation: true,
  resolvePaneBindingAsyncMigratedByLaterSlice: true,
  windowHelpersMigratedByLaterSlice: true,
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
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_CURRENT_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_CURRENT_PANE_BINDING_FACADE_CUTOVER_THEME,
  GO_CURRENT_PANE_COMMAND,
  GO_CURRENT_PANE_FORMAT,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  goCurrentPaneBindingFacadeCutover,
}
