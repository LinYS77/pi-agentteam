const GO_LIST_AGENTTEAM_PANES_FACADE_CUTOVER_SCHEMA_VERSION = 1
const GO_LIST_AGENTTEAM_PANES_FACADE_CUTOVER_THEME = 'v0.6.55 Go listAgentTeamPanes facade cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle'])
const FACADE_NAME = 'listAgentTeamPanes'
const KERNEL_ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().listAgentTeamPanes()'
const FAILURE_RETURN = 'result.ok ? result.panes : []'
const SNAPSHOT_FILTER = 'item.paneId && item.label'
const PRESERVED_BOUNDARIES = Object.freeze([
  'listAgentTeamPanes facade delegates to Go workerLifecycle adapter',
  'TypeScript tmux list-panes fallback removed for listAgentTeamPanes facade',
  'listAgentTeamPanesFromSnapshot remains unchanged and TypeScript-owned',
  'inspectPane facade remains TypeScript-owned in this slice',
  'wake/create/label/kill lifecycle remains TypeScript-owned',
  'target/current pane binding and display-message helpers remain TypeScript-owned',
  'state repository remains TypeScript-owned',
  'task/report/PlanRun governance remains TypeScript-owned',
  'team panel view-model remains TypeScript-owned',
  'release/package verification remains unmigrated',
  'native artifact path and binary name remain unchanged',
])
const FORBIDDEN_GO_TMUX_COMMANDS = Object.freeze([
  'display-message',
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
const goListAgentTeamPanesFacadeCutover = Object.freeze({
  schemaVersion: GO_LIST_AGENTTEAM_PANES_FACADE_CUTOVER_SCHEMA_VERSION,
  theme: GO_LIST_AGENTTEAM_PANES_FACADE_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  facadeName: FACADE_NAME,
  kernelAdapterDelegation: KERNEL_ADAPTER_DELEGATION,
  failureReturn: FAILURE_RETURN,
  snapshotFilter: SNAPSHOT_FILTER,
  facadeCutoverMigrated: true,
  typescriptTmuxListPanesFallbackRemoved: true,
  failClosedEmptyArrayOnHelperFailure: true,
  compactPaneFieldsOnly: true,
  listAgentTeamPanesFromSnapshotUnchanged: true,
  inspectPaneFacadeMigrated: false,
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
  FAILURE_RETURN,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_LIST_AGENTTEAM_PANES_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_LIST_AGENTTEAM_PANES_FACADE_CUTOVER_THEME,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  SNAPSHOT_FILTER,
  goListAgentTeamPanesFacadeCutover,
}
