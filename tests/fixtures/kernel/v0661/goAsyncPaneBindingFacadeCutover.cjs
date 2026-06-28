const GO_ASYNC_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION = 1
const GO_ASYNC_PANE_BINDING_FACADE_CUTOVER_THEME = 'v0.6.61 Go resolvePaneBindingAsync facade cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const FACADE_NAME = 'resolvePaneBindingAsync'
const KERNEL_ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)'
const ASYNC_HELPER_SEAM = 'invokeHelperAsync'
const ASYNC_ABORT_POLICY = 'pre-aborted and in-flight aborted AbortSignal resolve null at the public facade with compact helper-spawn-error diagnostics'
const PRESERVED_BOUNDARIES = Object.freeze([
  'resolvePaneBindingAsync facade delegates to the cancellable Go workerLifecycle inspectPane async adapter',
  'TypeScript display-message fallback removed for resolvePaneBindingAsync facade',
  'AbortSignal cancellation is preserved by the async helper subprocess seam and fails closed to null',
  'sync facades remain unchanged and Go-backed',
  'captureCurrentPaneBinding keeps the v0.6.60 outside-tmux guard and Go operation',
  'window helpers are cut over by v0.6.62 through a cancellable async Go listPanesInWindow seam',
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
  'no Go source or native helper rebuild required for this TypeScript adapter seam cutover',
])
const goAsyncPaneBindingFacadeCutover = Object.freeze({
  schemaVersion: GO_ASYNC_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION,
  theme: GO_ASYNC_PANE_BINDING_FACADE_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  facadeName: FACADE_NAME,
  kernelAdapterDelegation: KERNEL_ADAPTER_DELEGATION,
  asyncHelperSeam: ASYNC_HELPER_SEAM,
  asyncAbortPolicy: ASYNC_ABORT_POLICY,
  facadeCutoverMigrated: true,
  cancellableAsyncKernelSeamAdded: true,
  typescriptDisplayMessageFallbackRemoved: true,
  abortResolvesNull: true,
  failClosedNullOnEmptyPaneId: true,
  failClosedNullOnHelperFailure: true,
  failClosedNullOnMissingTarget: true,
  failClosedNullOnInvalidResponse: true,
  syncFacadesUnchanged: true,
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
  ASYNC_HELPER_SEAM,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_ASYNC_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_ASYNC_PANE_BINDING_FACADE_CUTOVER_THEME,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  goAsyncPaneBindingFacadeCutover,
}
