const GO_TMUX_AVAILABILITY_FACADE_CUTOVER_SCHEMA_VERSION = 1
const GO_TMUX_AVAILABILITY_FACADE_CUTOVER_THEME = 'v0.6.63 Go tmux availability facade cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'tmuxAvailability'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const FACADE_NAME = 'ensureTmuxAvailable'
const KERNEL_ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().checkTmuxAvailableAsync(signal)'
const ASYNC_ABORT_POLICY = 'pre-aborted and in-flight aborted AbortSignal throw compact tmux-required Error through ensureTmuxAvailable with helper-spawn-error diagnostics hidden inside the adapter'
const GO_TMUX_VERSION_COMMAND = 'exec.CommandContext(ctx, "tmux", "-V")'
const PRESERVED_BOUNDARIES = Object.freeze([
  'ensureTmuxAvailable delegates to a cancellable Go tmuxAvailability async adapter',
  'TypeScript tmux -V fallback removed from ensureTmuxAvailable',
  'public ensureTmuxAvailable still resolves void when tmux is available',
  'public ensureTmuxAvailable still throws Error when tmux is unavailable or helper fails',
  'availability error text is compact and does not include raw stdout/stderr/cwd/stack/helper paths/mailbox/report/worker transcript bodies',
  'Go tmuxAvailability uses only exact tmux -V read-only command',
  'windowExists and firstPaneInWindow remain Go-backed through listPanesInWindowAsync',
  'resolvePaneBindingAsync remains Go-backed through inspectWorkerPaneAsync',
  'captureCurrentPaneBinding keeps the v0.6.60 outside-tmux guard and current-pane Go operation',
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
const goTmuxAvailabilityFacadeCutover = Object.freeze({
  schemaVersion: GO_TMUX_AVAILABILITY_FACADE_CUTOVER_SCHEMA_VERSION,
  theme: GO_TMUX_AVAILABILITY_FACADE_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  facadeName: FACADE_NAME,
  kernelAdapterDelegation: KERNEL_ADAPTER_DELEGATION,
  asyncAbortPolicy: ASYNC_ABORT_POLICY,
  goTmuxVersionCommand: GO_TMUX_VERSION_COMMAND,
  facadeCutoverMigrated: true,
  typescriptTmuxVersionFallbackRemoved: true,
  throwsOnUnavailable: true,
  resolvesVoidOnAvailable: true,
  failClosedOnHelperFailure: true,
  compactErrorMessage: true,
  abortThrowsCompactError: true,
  rawOutputLeakageAllowed: false,
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
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_TMUX_AVAILABILITY_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_TMUX_AVAILABILITY_FACADE_CUTOVER_THEME,
  GO_TMUX_VERSION_COMMAND,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  goTmuxAvailabilityFacadeCutover,
}
