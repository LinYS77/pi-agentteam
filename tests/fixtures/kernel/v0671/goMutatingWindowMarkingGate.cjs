const GO_MUTATING_WINDOW_MARKING_GATE_SCHEMA_VERSION = 1
const GO_MUTATING_WINDOW_MARKING_GATE_THEME = 'v0.6.71 Go mutating window marking gate'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const FUTURE_OPERATION = 'markWindowAsAgentTeam'
const FACADE_NAME = 'markWindowAsAgentTeam'
const RUNTIME_FILE = 'tmux/labels.ts'
const CONTRACT_STATUS = 'gate-only-no-runtime-mutation'
const CURRENT_WINDOW_EXISTENCE_GUARD = 'windowExists(target, signal)'
const FUTURE_ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'findWindowTargetByName', 'sessionExists'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const CURRENT_TYPESCRIPT_COMMAND_SURFACE = Object.freeze([
  Object.freeze({
    rendered: 'tmux set-option -w -t <target> automatic-rename off',
    runTmuxNoThrowAsyncCall: "runTmuxNoThrowAsync(['set-option', '-w', '-t', target, 'automatic-rename', 'off'], undefined, signal)",
    option: 'automatic-rename',
    value: 'off',
  }),
  Object.freeze({
    rendered: 'tmux set-option -w -t <target> allow-rename off',
    runTmuxNoThrowAsyncCall: "runTmuxNoThrowAsync(['set-option', '-w', '-t', target, 'allow-rename', 'off'], undefined, signal)",
    option: 'allow-rename',
    value: 'off',
  }),
  Object.freeze({
    rendered: 'tmux set-option -w -t <target> @agentteam-window 1',
    runTmuxNoThrowAsyncCall: "runTmuxNoThrowAsync(['set-option', '-w', '-t', target, '@agentteam-window', '1'], undefined, signal)",
    option: '@agentteam-window',
    value: '1',
  }),
])
const AUTHORIZED_FUTURE_TMUX_COMMANDS = Object.freeze([
  Object.freeze({
    rendered: 'tmux set-option -w -t <target> automatic-rename off',
    args: Object.freeze(['set-option', '-w', '-t', '<target>', 'automatic-rename', 'off']),
    command: 'set-option',
    scope: 'window',
    option: 'automatic-rename',
    value: 'off',
    destructive: false,
    mutatesTmux: true,
  }),
  Object.freeze({
    rendered: 'tmux set-option -w -t <target> allow-rename off',
    args: Object.freeze(['set-option', '-w', '-t', '<target>', 'allow-rename', 'off']),
    command: 'set-option',
    scope: 'window',
    option: 'allow-rename',
    value: 'off',
    destructive: false,
    mutatesTmux: true,
  }),
  Object.freeze({
    rendered: 'tmux set-option -w -t <target> @agentteam-window 1',
    args: Object.freeze(['set-option', '-w', '-t', '<target>', '@agentteam-window', '1']),
    command: 'set-option',
    scope: 'window',
    option: '@agentteam-window',
    value: '1',
    destructive: false,
    mutatesTmux: true,
  }),
])
const CURRENT_GO_READ_ONLY_TMUX_COMMANDS = Object.freeze([
  'tmux list-panes -a -F tmuxPaneSnapshotFormat',
  'tmux -V',
  'tmux list-panes -a -F workerLifecycleInspectPaneFormat',
  'tmux display-message -p workerLifecycleCurrentPaneBindingFormat',
  'tmux list-panes -t <target> -F workerLifecycleWindowPaneFormat',
  'tmux list-windows -t <sessionName> -F workerLifecycleAgentTeamWindowFormat',
  'tmux list-windows -t <sessionName> -F workerLifecycleWindowNameFormat',
  'tmux has-session -t <sessionName>',
])
const FORBIDDEN_CURRENT_GO_TMUX_COMMANDS = Object.freeze([
  'set-option',
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
const STILL_FORBIDDEN_MUTATING_SCOPE = Object.freeze([
  'new-session',
  'new-window',
  'split-window',
  'select-layout',
  'resize-pane',
  'send-keys',
  'kill-pane',
  'set-option -p pane labels',
  'select-pane -T pane titles',
  'set-option -w pane-border-status refreshWindowPaneLabels',
  'set-option -w pane-border-format refreshWindowPaneLabels',
  'state repository',
  'task/report/PlanRun governance',
  'team panel view-model',
  'release/package verification',
])
const FACADE_AUTHORITY = Object.freeze([
  'TypeScript/pi facade remains the public product and pi extension compliance boundary',
  'Go runtime mutation may only be introduced by an explicit task-scoped contract',
  'Go may not own hidden fallback behavior for a facade after cutover',
  'TypeScript tools, commands, hooks, renderers, TUI, and leader-gated governance remain authoritative',
])
const FUTURE_FACADE_RULE = Object.freeze({
  afterCutoverNoDirectTypescriptSetOptionFallback: true,
  forbiddenFallbackPattern: "runTmuxNoThrowAsync(['set-option', '-w'",
  hiddenTypeScriptFallbackAllowedAfterCutover: false,
  facadeStillReturns: 'Promise<void>',
})
const FUTURE_PUBLIC_BEHAVIOR = Object.freeze({
  noThrowVoidFacade: true,
  helperFailureBehavior: 'resolve void with compact internal diagnostics',
  invalidTargetBehavior: 'resolve void with compact internal diagnostics',
  abortBehavior: 'resolve void with compact internal diagnostics',
  rawOutputLeakageAllowed: false,
})
const WINDOW_EXISTENCE_AUTHORITY = Object.freeze({
  currentGuard: CURRENT_WINDOW_EXISTENCE_GUARD,
  futurePolicy: 'keep the TypeScript windowExists(target, signal) guard or move it only inside the same markWindowAsAgentTeam slice if documented and tested',
  broadWindowCreationAuthorized: false,
  broadSessionCreationAuthorized: false,
})
const HELPER_CONNECTION_MODEL = Object.freeze({
  status: 'per-call-helper-for-mutating-slice',
  longLivedHelperStatus: 'deferred',
  rationale: 'window marking is low frequency; long-lived helper remains deferred until a separate state/panel/high-frequency gate',
})
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
  'no Go source or native artifact rebuild in this gate',
])
const goMutatingWindowMarkingGate = Object.freeze({
  schemaVersion: GO_MUTATING_WINDOW_MARKING_GATE_SCHEMA_VERSION,
  theme: GO_MUTATING_WINDOW_MARKING_GATE_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  contractStatus: CONTRACT_STATUS,
  futureOperation: FUTURE_OPERATION,
  facadeName: FACADE_NAME,
  runtimeFile: RUNTIME_FILE,
  currentWindowExistenceGuard: CURRENT_WINDOW_EXISTENCE_GUARD,
  futureAdapterDelegation: FUTURE_ADAPTER_DELEGATION,
  authorizedFutureMutatingCandidates: Object.freeze([FUTURE_OPERATION]),
  authorizedFutureTmuxCommands: AUTHORIZED_FUTURE_TMUX_COMMANDS,
  currentTypescriptCommandSurface: CURRENT_TYPESCRIPT_COMMAND_SURFACE,
  currentGoReadOnlyTmuxCommands: CURRENT_GO_READ_ONLY_TMUX_COMMANDS,
  forbiddenCurrentGoTmuxCommands: FORBIDDEN_CURRENT_GO_TMUX_COMMANDS,
  stillForbiddenMutatingScope: STILL_FORBIDDEN_MUTATING_SCOPE,
  facadeAuthority: FACADE_AUTHORITY,
  futureFacadeRule: FUTURE_FACADE_RULE,
  futurePublicBehavior: FUTURE_PUBLIC_BEHAVIOR,
  windowExistenceAuthority: WINDOW_EXISTENCE_AUTHORITY,
  helperConnectionModel: HELPER_CONNECTION_MODEL,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  gateOnly: true,
  noRuntimeMigrationInThisSlice: true,
  currentGoMutatingTmuxCommands: false,
  futureCandidateMutatesTmux: true,
  futureCandidateDestructive: false,
  markWindowAsAgentTeamMigrated: false,
  refreshWindowPaneLabelsMigrated: false,
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
  nativeHelperRebuilt: false,
  goSourceChanged: false,
  packageVersionChanged: false,
  packageReleaseApproved: false,
  npmVersionChanged: false,
  npmPublished: false,
  tagReleaseCreated: false,
})

module.exports = {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  AUTHORIZED_FUTURE_TMUX_COMMANDS,
  CAPABILITY,
  CONTRACT_STATUS,
  CURRENT_GO_READ_ONLY_TMUX_COMMANDS,
  CURRENT_TYPESCRIPT_COMMAND_SURFACE,
  CURRENT_WINDOW_EXISTENCE_GUARD,
  FACADE_AUTHORITY,
  FACADE_NAME,
  FORBIDDEN_CURRENT_GO_TMUX_COMMANDS,
  FUTURE_ADAPTER_DELEGATION,
  FUTURE_FACADE_RULE,
  FUTURE_OPERATION,
  FUTURE_PUBLIC_BEHAVIOR,
  GO_MUTATING_WINDOW_MARKING_GATE_SCHEMA_VERSION,
  GO_MUTATING_WINDOW_MARKING_GATE_THEME,
  HELPER_CONNECTION_MODEL,
  HELPER_VERSION,
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  STILL_FORBIDDEN_MUTATING_SCOPE,
  WINDOW_EXISTENCE_AUTHORITY,
  goMutatingWindowMarkingGate,
}
