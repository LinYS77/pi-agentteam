const GO_WINDOW_MARKING_CUTOVER_SCHEMA_VERSION = 1
const GO_WINDOW_MARKING_CUTOVER_THEME = 'v0.6.72 Go window marking cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'markWindowAsAgentTeam'
const FACADE_NAME = 'markWindowAsAgentTeam'
const RUNTIME_FILE = 'tmux/labels.ts'
const WINDOW_EXISTENCE_GUARD = 'windowExists(target, signal)'
const ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'findWindowTargetByName', 'sessionExists', 'markWindowAsAgentTeam'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const AUTHORIZED_TMUX_COMMANDS = Object.freeze([
  Object.freeze({
    rendered: 'tmux set-option -w -t <target> automatic-rename off',
    args: Object.freeze(['set-option', '-w', '-t', '<target>', 'automatic-rename', 'off']),
    option: 'automatic-rename',
    value: 'off',
    destructive: false,
    mutatesTmux: true,
  }),
  Object.freeze({
    rendered: 'tmux set-option -w -t <target> allow-rename off',
    args: Object.freeze(['set-option', '-w', '-t', '<target>', 'allow-rename', 'off']),
    option: 'allow-rename',
    value: 'off',
    destructive: false,
    mutatesTmux: true,
  }),
  Object.freeze({
    rendered: 'tmux set-option -w -t <target> @agentteam-window 1',
    args: Object.freeze(['set-option', '-w', '-t', '<target>', '@agentteam-window', '1']),
    option: '@agentteam-window',
    value: '1',
    destructive: false,
    mutatesTmux: true,
  }),
])
const FORBIDDEN_GO_TMUX_COMMANDS = Object.freeze([
  'set-window-option',
  'new-session',
  'new-window',
  'split-window',
  'select-layout',
  'resize-pane',
  'send-keys',
  'kill-pane',
  'select-pane',
  'respawn-pane',
  'set-buffer',
  'paste-buffer',
  'kill-window',
  'kill-session',
])
const PRESERVED_BOUNDARIES = Object.freeze([
  'TypeScript/pi facade remains the public product and pi extension compliance boundary',
  'window existence authority remains explicit through the TypeScript windowExists(target, signal) guard',
  'markWindowAsAgentTeam remains no-throw Promise<void> at the public facade',
  'Go owns only the three authorized non-destructive window set-option commands',
  'no direct TypeScript set-option -w fallback remains for markWindowAsAgentTeam',
  'refreshWindowPaneLabels remains TypeScript-owned',
  'pane labels via set-option -p remain TypeScript-owned',
  'pane titles via select-pane -T remain TypeScript-owned',
  'new-session and new-window remain TypeScript-owned',
  'pane creation, layout, wake, kill, state, task, UI, release, and package remain outside this slice',
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
  'no native artifact path or binary rename',
])
const goWindowMarkingCutover = Object.freeze({
  schemaVersion: GO_WINDOW_MARKING_CUTOVER_SCHEMA_VERSION,
  theme: GO_WINDOW_MARKING_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  facadeName: FACADE_NAME,
  runtimeFile: RUNTIME_FILE,
  windowExistenceGuard: WINDOW_EXISTENCE_GUARD,
  adapterDelegation: ADAPTER_DELEGATION,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  authorizedTmuxCommands: AUTHORIZED_TMUX_COMMANDS,
  forbiddenGoTmuxCommands: FORBIDDEN_GO_TMUX_COMMANDS,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  facadeCutoverMigrated: true,
  markWindowAsAgentTeamMigrated: true,
  typescriptSetOptionFallbackRemoved: true,
  windowExistsGuardPreserved: true,
  noThrowVoidFacadePreserved: true,
  rawOutputLeakageAllowed: false,
  helperFailureThrowsPublicly: false,
  invalidTargetThrowsPublicly: false,
  abortThrowsPublicly: false,
  futureCandidateDestructive: false,
  refreshWindowPaneLabelsMigrated: false,
  paneLabelsMigrated: false,
  paneTitlesMigrated: false,
  newSessionMigrated: false,
  newWindowMigrated: false,
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
})

module.exports = {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ADAPTER_DELEGATION,
  AUTHORIZED_TMUX_COMMANDS,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_WINDOW_MARKING_CUTOVER_SCHEMA_VERSION,
  GO_WINDOW_MARKING_CUTOVER_THEME,
  HELPER_VERSION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  WINDOW_EXISTENCE_GUARD,
  goWindowMarkingCutover,
}
