const GO_INSPECT_PANE_FACADE_CUTOVER_SCHEMA_VERSION = 1
const GO_INSPECT_PANE_FACADE_CUTOVER_THEME = 'v0.6.56 Go inspectPane facade cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle'])
const FACADE_NAME = 'inspectPane'
const KERNEL_ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().inspectWorkerPane(paneId)'
const SUCCESS_MAPPING = Object.freeze(['paneId', 'exists', 'target', 'currentCommand', 'inMode', 'mode', 'copyMode'])
const FAILURE_MAPPING = Object.freeze(['paneId', 'exists', 'error'])
const PRESERVED_BOUNDARIES = Object.freeze([
  'inspectPane facade delegates to Go workerLifecycle adapter',
  'TypeScript display-message fallback removed for inspectPane facade',
  'listAgentTeamPanes facade remains Go-owned',
  'targetForPaneId is cut over by v0.6.59, not this slice',
  'captureCurrentPaneBinding is cut over by v0.6.60, not this slice',
  'resolvePaneBindingAsync is cut over by v0.6.61 through a cancellable async helper seam, not this slice',
  'paneExists is cut over by v0.6.57, not this slice',
  'resolvePaneBinding is cut over by v0.6.58, not this slice',
  'window helpers are cut over by v0.6.62 through a cancellable async Go listPanesInWindow seam',
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
  'native helper rebuild handled only by later target-field contract slice',
])
const goInspectPaneFacadeCutover = Object.freeze({
  schemaVersion: GO_INSPECT_PANE_FACADE_CUTOVER_SCHEMA_VERSION,
  theme: GO_INSPECT_PANE_FACADE_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  facadeName: FACADE_NAME,
  kernelAdapterDelegation: KERNEL_ADAPTER_DELEGATION,
  successMapping: SUCCESS_MAPPING,
  failureMapping: FAILURE_MAPPING,
  facadeCutoverMigrated: true,
  typescriptDisplayMessageFallbackRemoved: true,
  failClosedExistsFalseOnHelperFailure: true,
  compactInspectionFieldsOnly: true,
  paneExistsFacadeMigratedByLaterSlice: true,
  listAgentTeamPanesFacadeStillMigrated: true,
  targetForPaneIdMigrated: false,
  captureCurrentPaneBindingMigrated: false,
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
  nativeHelperRebuilt: false,
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
  FAILURE_MAPPING,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_INSPECT_PANE_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_INSPECT_PANE_FACADE_CUTOVER_THEME,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  SUCCESS_MAPPING,
  goInspectPaneFacadeCutover,
}
