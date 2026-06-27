const GO_RESOLVE_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION = 1
const GO_RESOLVE_PANE_BINDING_FACADE_CUTOVER_THEME = 'v0.6.58 Go resolvePaneBinding facade cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle'])
const FACADE_NAME = 'resolvePaneBinding'
const KERNEL_ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().inspectWorkerPane(paneId)'
const INSPECT_TARGET_FIELD = 'target'
const INSPECT_FORMAT_TARGET = '#{session_name}:#{window_id}'
const PUBLIC_SUCCESS_MAPPING = Object.freeze(['paneId', 'target'])
const PRESERVED_BOUNDARIES = Object.freeze([
  'resolvePaneBinding facade delegates to Go workerLifecycle inspect adapter',
  'TypeScript display-message fallback removed for resolvePaneBinding facade',
  'Go inspectPane compact result includes target for arbitrary pane ids',
  'resolvePaneBinding does not use listAgentTeamPanes because that filters labeled panes only',
  'listAgentTeamPanes continues to filter labeled panes only',
  'resolvePaneBindingAsync remains TypeScript display-message-owned',
  'targetForPaneId is cut over by v0.6.59, not this slice',
  'captureCurrentPaneBinding is cut over by v0.6.60, not this slice',
  'window helpers remain TypeScript tmux-owned',
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
])
const goResolvePaneBindingFacadeCutover = Object.freeze({
  schemaVersion: GO_RESOLVE_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION,
  theme: GO_RESOLVE_PANE_BINDING_FACADE_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  facadeName: FACADE_NAME,
  kernelAdapterDelegation: KERNEL_ADAPTER_DELEGATION,
  inspectTargetField: INSPECT_TARGET_FIELD,
  inspectFormatTarget: INSPECT_FORMAT_TARGET,
  publicSuccessMapping: PUBLIC_SUCCESS_MAPPING,
  facadeCutoverMigrated: true,
  typescriptDisplayMessageFallbackRemoved: true,
  failClosedNullOnHelperFailure: true,
  failClosedNullOnMissingTarget: true,
  arbitraryPaneIdsSupported: true,
  listAgentTeamPanesFilterUnchanged: true,
  inspectPaneFacadeStillMigrated: true,
  paneExistsFacadeStillMigrated: true,
  listAgentTeamPanesFacadeStillMigrated: true,
  resolvePaneBindingAsyncMigrated: false,
  targetForPaneIdMigrated: false,
  captureCurrentPaneBindingMigrated: false,
  windowHelpersMigrated: false,
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
  GO_RESOLVE_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_RESOLVE_PANE_BINDING_FACADE_CUTOVER_THEME,
  HELPER_VERSION,
  INSPECT_FORMAT_TARGET,
  INSPECT_TARGET_FIELD,
  KERNEL_ADAPTER_DELEGATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  PUBLIC_SUCCESS_MAPPING,
  RELEASE_PACKAGE_GUARDS,
  goResolvePaneBindingFacadeCutover,
}
