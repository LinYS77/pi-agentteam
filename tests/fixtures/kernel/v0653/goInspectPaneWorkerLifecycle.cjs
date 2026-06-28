const GO_INSPECT_PANE_WORKER_LIFECYCLE_SCHEMA_VERSION = 1
const GO_INSPECT_PANE_WORKER_LIFECYCLE_THEME = 'v0.6.53 Go inspectPane worker lifecycle slice'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const ACTIVE_OPERATION = 'inspectPane'
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const CAPABILITY_ADVERTISEMENT_DECISION = 'advertise-workerLifecycle-for-inspectPane-only'
const WORKER_LIFECYCLE_STATUS = 'runtime-inspect-pane-only'
const ALLOWED_GO_TMUX_COMMANDS = Object.freeze([
  'tmux list-panes -a -F tmuxPaneSnapshotFormat',
  'tmux list-panes -a -F workerLifecycleInspectPaneFormat',
])
const FORBIDDEN_GO_TMUX_COMMANDS = Object.freeze([
  'send-keys',
  'split-window',
  'new-window',
  'kill-pane',
  'set-window-option',
  'select-pane',
  'respawn-pane',
])
const COMPACT_RESULT_FIELDS = Object.freeze([
  'ok',
  'operation',
  'capability',
  'paneId',
  'requestedPaneId',
  'exists',
  'target',
  'currentCommand',
  'inMode',
  'mode',
  'copyMode',
  'status',
  'resultMarker',
  'failureKind',
  'reason',
  'error',
  'readOnly',
  'stateFilesRead',
  'stateFilesWritten',
  'tmuxMutation',
])
const UNSUPPORTED_OPERATIONS = Object.freeze([
  'listAgentTeamPanes',
  'wakePane',
  'syncPaneLabels',
  'createTeammatePane',
  'killPane',
])
const PRESERVED_BOUNDARIES = Object.freeze([
  'TypeScript/pi facade remains authoritative',
  'tools/commands/hooks/renderers/TUI shell remain TS-owned',
  'worker lifecycle Go authority is explicit adapter seam only',
  'no worker-spawns-worker',
  'no hidden scheduler/autopilot/background orchestration',
  'no peer report auto-task creation',
  'no create/wake/label/kill migration',
  'no state repository migration',
  'no task/report/PlanRun migration',
  'no team panel view-model migration',
  'no release/package verification migration',
  'no native artifact path or binary rename',
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
  'no runtime go build',
])
const goInspectPaneWorkerLifecycle = Object.freeze({
  schemaVersion: GO_INSPECT_PANE_WORKER_LIFECYCLE_SCHEMA_VERSION,
  theme: GO_INSPECT_PANE_WORKER_LIFECYCLE_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  activeOperation: ACTIVE_OPERATION,
  activeCapabilities: ACTIVE_CAPABILITIES,
  capabilityAdvertisementDecision: CAPABILITY_ADVERTISEMENT_DECISION,
  workerLifecycleStatus: WORKER_LIFECYCLE_STATUS,
  allowedGoTmuxCommands: ALLOWED_GO_TMUX_COMMANDS,
  forbiddenGoTmuxCommands: FORBIDDEN_GO_TMUX_COMMANDS,
  compactResultFields: COMPACT_RESULT_FIELDS,
  unsupportedOperations: UNSUPPORTED_OPERATIONS,
  inspectPaneReadOnly: true,
  unsupportedOperationsFailClosed: true,
  perCallHelperStillAccepted: true,
  longLivedHelperDeferred: true,
  workerLifecycleMigrated: true,
  createTeammatePaneMigrated: false,
  wakePaneMigrated: false,
  syncPaneLabelsMigrated: false,
  killPaneMigrated: false,
  stateRepositoryMigrated: false,
  taskReportPlanRunMigrated: false,
  teamPanelViewModelMigrated: false,
  releasePackageVerificationMigrated: false,
  nativeArtifactRenamed: false,
  packageVersionChanged: false,
  packageReleaseApproved: false,
  npmVersionChanged: false,
  npmPublished: false,
  tagReleaseCreated: false,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
})

module.exports = {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATION,
  ALLOWED_GO_TMUX_COMMANDS,
  CAPABILITY,
  CAPABILITY_ADVERTISEMENT_DECISION,
  COMPACT_RESULT_FIELDS,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_INSPECT_PANE_WORKER_LIFECYCLE_SCHEMA_VERSION,
  GO_INSPECT_PANE_WORKER_LIFECYCLE_THEME,
  HELPER_VERSION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  UNSUPPORTED_OPERATIONS,
  WORKER_LIFECYCLE_STATUS,
  goInspectPaneWorkerLifecycle,
}
