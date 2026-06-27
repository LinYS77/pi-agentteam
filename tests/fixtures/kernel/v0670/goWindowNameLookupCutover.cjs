const GO_WINDOW_NAME_LOOKUP_CUTOVER_SCHEMA_VERSION = 1
const GO_WINDOW_NAME_LOOKUP_CUTOVER_THEME = 'v0.6.70 Go window name lookup cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'findWindowTargetByName'
const FACADE_NAME = 'ensureSwarmWindow'
const RUNTIME_FILE = 'tmux/windows.ts'
const WINDOW_NAME_DELEGATION = 'findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)'
const ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().findWindowTargetByNameAsync(sessionName, windowName, signal)'
const GO_WINDOW_NAME_COMMAND = 'exec.CommandContext(ctx, "tmux", "list-windows", "-t", sessionName, "-F", workerLifecycleWindowNameFormat)'
const WINDOW_NAME_FORMAT = '#{window_id}\t#{window_name}'
const COMPACT_FAILURE_ERROR = 'Failed to locate agentteam tmux window after creation'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'findWindowTargetByName', 'sessionExists'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const PRESERVED_BOUNDARIES = Object.freeze([
  'detached ensureSwarmWindow post-new-window lookup uses workerLifecycle findWindowTargetByName',
  'direct TypeScript list-windows window-name parsing is removed from the post-creation detached branch',
  'Go findWindowTargetByName uses only list-windows by session with compact window id and window name format',
  'new-session remains TypeScript-owned',
  'new-window remains TypeScript-owned and still runs before post-creation lookup',
  'markWindowAsAgentTeam and refreshWindowPaneLabels remain TypeScript-owned',
  'firstPaneInWindow remains the v0.6.69 Go-backed leader pane source after initialTarget',
  'resolvePaneBindingAsync remains the v0.6.68 Go-backed target source after leader pane selection',
  'agentteam marked-window discovery remains v0.6.65 findAgentTeamWindowTarget',
  'session existence remains v0.6.66 sessionExists',
  'inside-tmux current binding fallback remains v0.6.67 captureCurrentPaneBinding reuse',
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
  'new-session',
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
  'rebuild only the existing embedded native helper path/name because Go source changed',
])
const goWindowNameLookupCutover = Object.freeze({
  schemaVersion: GO_WINDOW_NAME_LOOKUP_CUTOVER_SCHEMA_VERSION,
  theme: GO_WINDOW_NAME_LOOKUP_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  facadeName: FACADE_NAME,
  runtimeFile: RUNTIME_FILE,
  windowNameDelegation: WINDOW_NAME_DELEGATION,
  adapterDelegation: ADAPTER_DELEGATION,
  goWindowNameCommand: GO_WINDOW_NAME_COMMAND,
  windowNameFormat: WINDOW_NAME_FORMAT,
  compactFailureError: COMPACT_FAILURE_ERROR,
  facadeCutoverMigrated: true,
  typescriptPostCreationListWindowsFallbackRemoved: true,
  findWindowTargetByNameAdded: true,
  failClosedThrowOnMissingWindow: true,
  newWindowStillTypeScriptOwned: true,
  newWindowRunsBeforeLookup: true,
  firstPaneInWindowReused: true,
  resolvePaneBindingAsyncReused: true,
  returnedShapePreservedOnSuccess: true,
  rawOutputLeakageAllowed: false,
  postCreationWindowLookupMigrated: true,
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
  ADAPTER_DELEGATION,
  CAPABILITY,
  COMPACT_FAILURE_ERROR,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_WINDOW_NAME_COMMAND,
  GO_WINDOW_NAME_LOOKUP_CUTOVER_SCHEMA_VERSION,
  GO_WINDOW_NAME_LOOKUP_CUTOVER_THEME,
  HELPER_VERSION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  WINDOW_NAME_DELEGATION,
  WINDOW_NAME_FORMAT,
  goWindowNameLookupCutover,
}
