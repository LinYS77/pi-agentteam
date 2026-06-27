const GO_TARGET_FOR_PANE_FACADE_CUTOVER_SCHEMA_VERSION = 1
const GO_TARGET_FOR_PANE_FACADE_CUTOVER_THEME = 'v0.6.59 Go targetForPaneId facade cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle'])
const FACADE_NAME = 'targetForPaneId'
const GO_BACKED_BINDING_PATH = 'resolvePaneBinding(paneId)?.target ?? null'
const ASYNC_BINDING_DECISION = 'deferred-sync-kernel-adapter-cannot-preserve-abort-signal'
const PRESERVED_BOUNDARIES = Object.freeze([
  'targetForPaneId facade delegates to Go-backed resolvePaneBinding',
  'TypeScript display-message fallback removed for targetForPaneId facade',
  'resolvePaneBinding remains Go-backed through workerLifecycle inspect adapter',
  'resolvePaneBindingAsync is cut over separately by v0.6.61 through a cancellable async helper seam',
  'async binding migration is completed by the later cancellable async kernel adapter slice',
  'captureCurrentPaneBinding is cut over by v0.6.60, not this slice',
  'window helpers remain TypeScript tmux-owned',
  'listAgentTeamPanes continues to filter labeled panes only',
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
  'no native helper rebuild required',
])
const goTargetForPaneFacadeCutover = Object.freeze({
  schemaVersion: GO_TARGET_FOR_PANE_FACADE_CUTOVER_SCHEMA_VERSION,
  theme: GO_TARGET_FOR_PANE_FACADE_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  facadeName: FACADE_NAME,
  goBackedBindingPath: GO_BACKED_BINDING_PATH,
  asyncBindingDecision: ASYNC_BINDING_DECISION,
  facadeCutoverMigrated: true,
  typescriptDisplayMessageFallbackRemoved: true,
  failClosedNullOnHelperFailure: true,
  failClosedNullOnMissingTarget: true,
  resolvePaneBindingFacadeStillMigrated: true,
  inspectPaneFacadeStillMigrated: true,
  paneExistsFacadeStillMigrated: true,
  listAgentTeamPanesFacadeStillMigrated: true,
  resolvePaneBindingAsyncMigratedByLaterSlice: true,
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
  ASYNC_BINDING_DECISION,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_BACKED_BINDING_PATH,
  GO_TARGET_FOR_PANE_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_TARGET_FOR_PANE_FACADE_CUTOVER_THEME,
  HELPER_VERSION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  goTargetForPaneFacadeCutover,
}
