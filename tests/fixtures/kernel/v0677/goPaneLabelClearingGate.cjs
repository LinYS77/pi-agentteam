const GO_PANE_LABEL_CLEARING_GATE_SCHEMA_VERSION = 1
const GO_PANE_LABEL_CLEARING_GATE_THEME = 'v0.6.77 Go pane label clearing gate'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const FUTURE_OPERATION = 'clearPaneLabel'
const SET_HELPER_NAME = 'setPaneLabel'
const CLEAR_HELPER_NAME = 'clearPaneLabel'
const ORCHESTRATOR_NAME = 'clearPaneLabelsForTeam'
const SET_ORCHESTRATOR_NAME = 'syncPaneLabelsForTeam'
const RUNTIME_FILE = 'tmux/labels.ts'
const CONTRACT_STATUS = 'gate-only-no-runtime-mutation'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'findWindowTargetByName', 'sessionExists', 'markWindowAsAgentTeam', 'refreshWindowPaneLabels', 'setPaneLabel'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const CURRENT_CLEAR_PANE_LABEL_COMMAND_SURFACE = Object.freeze([
  Object.freeze({
    rendered: 'tmux set-option -up -t <paneId> @agentteam-name',
    runTmuxNoThrowAsyncCall: "runTmuxNoThrowAsync(['set-option', '-up', '-t', paneId, '@agentteam-name'], undefined, signal)",
    command: 'set-option',
    scope: 'pane-clear',
    option: '@agentteam-name',
    value: '<unset>',
  }),
  Object.freeze({
    rendered: "tmux select-pane -t <paneId> -T ''",
    runTmuxNoThrowAsyncCall: "runTmuxNoThrowAsync(['select-pane', '-t', paneId, '-T', ''], undefined, signal)",
    command: 'select-pane',
    scope: 'pane-title-clear',
    option: '-T',
    value: '',
  }),
])
const CURRENT_SET_PANE_LABEL_ADAPTER_SURFACE = Object.freeze({
  helperName: SET_HELPER_NAME,
  operation: 'setPaneLabel',
  adapterDelegation: 'createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)',
  directTypescriptFallbackRemoved: true,
})
const AUTHORIZED_FUTURE_TMUX_COMMANDS = Object.freeze([
  Object.freeze({
    rendered: 'tmux set-option -up -t <paneId> @agentteam-name',
    args: Object.freeze(['set-option', '-up', '-t', '<paneId>', '@agentteam-name']),
    command: 'set-option',
    scope: 'pane-clear',
    option: '@agentteam-name',
    value: '<unset>',
    mutatesTmux: true,
    destructive: false,
    clearsAgentTeamName: true,
  }),
  Object.freeze({
    rendered: "tmux select-pane -t <paneId> -T ''",
    args: Object.freeze(['select-pane', '-t', '<paneId>', '-T', '']),
    command: 'select-pane',
    scope: 'pane-title-clear',
    option: '-T',
    value: '',
    mutatesTmux: true,
    destructive: false,
    clearsPaneTitle: true,
  }),
])
const EXISTING_GO_MUTATING_TMUX_COMMANDS = Object.freeze([
  Object.freeze({ rendered: 'tmux set-option -w -t <target> automatic-rename off', args: Object.freeze(['set-option', '-w', '-t', '<target>', 'automatic-rename', 'off']), operation: 'markWindowAsAgentTeam', scope: 'window' }),
  Object.freeze({ rendered: 'tmux set-option -w -t <target> allow-rename off', args: Object.freeze(['set-option', '-w', '-t', '<target>', 'allow-rename', 'off']), operation: 'markWindowAsAgentTeam', scope: 'window' }),
  Object.freeze({ rendered: 'tmux set-option -w -t <target> @agentteam-window 1', args: Object.freeze(['set-option', '-w', '-t', '<target>', '@agentteam-window', '1']), operation: 'markWindowAsAgentTeam', scope: 'window' }),
  Object.freeze({ rendered: 'tmux set-option -w -t <target> pane-border-status top', args: Object.freeze(['set-option', '-w', '-t', '<target>', 'pane-border-status', 'top']), operation: 'refreshWindowPaneLabels', scope: 'window' }),
  Object.freeze({ rendered: "tmux set-option -w -t <target> pane-border-format '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'", args: Object.freeze(['set-option', '-w', '-t', '<target>', 'pane-border-format', '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}']), operation: 'refreshWindowPaneLabels', scope: 'window' }),
  Object.freeze({ rendered: 'tmux set-option -p -t <paneId> @agentteam-name <label>', args: Object.freeze(['set-option', '-p', '-t', '<paneId>', '@agentteam-name', '<label>']), operation: 'setPaneLabel', scope: 'pane' }),
  Object.freeze({ rendered: 'tmux select-pane -t <paneId> -T <label>', args: Object.freeze(['select-pane', '-t', '<paneId>', '-T', '<label>']), operation: 'setPaneLabel', scope: 'pane' }),
])
const FORBIDDEN_CURRENT_GO_TMUX_SNIPPETS = Object.freeze([
  'case "clearPaneLabel"',
  'func clearPaneLabel',
  'set-option", "-up"',
])
const FORBIDDEN_FUTURE_SCOPE = Object.freeze([
  'clearPaneLabelsForTeam(...) orchestration migration',
  'setPaneLabel(paneId, label, signal) changes',
  'refreshWindowPaneLabels(target, signal) changes',
  'markWindowAsAgentTeam(target, signal) changes',
  'new-session',
  'new-window',
  'pane creation/split/layout/resize',
  'wake/send-keys',
  'kill-pane',
  'kill-window',
  'state repository',
  'task/report/PlanRun governance',
  'team panel view-model',
  'release/package verification',
  'native artifact path/name changes',
])
const FACADE_AUTHORITY = Object.freeze([
  'TypeScript/pi facade remains the public product and pi extension compliance boundary',
  'clearPaneLabelsForTeam remains TypeScript-owned orchestration',
  'clearPaneLabel remains a private no-throw helper boundary unless a later cutover explicitly changes it',
  'Go runtime mutation may only be introduced by an explicit task-scoped contract',
  'Go may not own hidden fallback behavior for a facade after cutover',
])
const FUTURE_FACADE_RULE = Object.freeze({
  afterCutoverNoDirectTypescriptUnsetFallback: true,
  afterCutoverNoDirectTypescriptSelectPaneTitleClearFallback: true,
  forbiddenUnsetFallbackPattern: "runTmuxNoThrowAsync(['set-option', '-up'",
  forbiddenSelectPaneClearFallbackPattern: "runTmuxNoThrowAsync(['select-pane', '-t', paneId, '-T', '']",
  hiddenTypeScriptFallbackAllowedAfterCutover: false,
  helperStillReturns: 'Promise<void>',
  publicOrchestrationStillTypescriptOwned: true,
})
const FUTURE_PUBLIC_BEHAVIOR = Object.freeze({
  noThrowVoidHelper: true,
  helperFailureBehavior: 'resolve void with compact internal diagnostics',
  invalidPaneBehavior: 'resolve void with compact internal diagnostics',
  abortBehavior: 'resolve void with compact internal diagnostics',
  tmuxFailureBehavior: 'resolve void with compact internal diagnostics',
  rawStdoutStderrLeakageAllowed: false,
  rawHelperOutputLeakageAllowed: false,
})
const FUTURE_INPUT_POLICY = Object.freeze({
  paneIdValidation: 'compact %123-style pane id validation consistent with v0.6.76 setPaneLabel',
  shellInterpolationAllowed: false,
  rawTmuxOutputDiagnosticsAllowed: false,
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
const NATIVE_ARTIFACT_SNAPSHOT = Object.freeze({
  root: 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc',
  helperPath: 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/agentteam-tmuxSnapshotParse',
  helperSha256: 'cbbb29aff69ad498e095b2f6282e8a06787720838cbd1aceae57e84d6f696b59',
  helperSize: 3485986,
  manifestSha256: '423a2fe31277336263eba21359ba7985d6c8e96de178478d68c8ad584fdcd6c2',
  provenanceSha256: '7b542b88a415a33d593b75dcd72aad30dfc5fc3d754220cb96d73452732812ec',
  attestationSha256: 'bfbd2adec8e42f6e0b491ff3d0fc7540134e02ca662197c2ec3f5af00ea65e3f',
  sourceRevision: '323c983500ea2334c315cb1e189ea87bc0998df7',
  setPaneLabelSmokePresent: true,
  clearPaneLabelSmokePresent: false,
})
const goPaneLabelClearingGate = Object.freeze({
  schemaVersion: GO_PANE_LABEL_CLEARING_GATE_SCHEMA_VERSION,
  theme: GO_PANE_LABEL_CLEARING_GATE_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  contractStatus: CONTRACT_STATUS,
  futureOperation: FUTURE_OPERATION,
  setHelperName: SET_HELPER_NAME,
  clearHelperName: CLEAR_HELPER_NAME,
  orchestratorName: ORCHESTRATOR_NAME,
  setOrchestratorName: SET_ORCHESTRATOR_NAME,
  runtimeFile: RUNTIME_FILE,
  authorizedFutureMutatingCandidates: Object.freeze([FUTURE_OPERATION]),
  authorizedFutureTmuxCommands: AUTHORIZED_FUTURE_TMUX_COMMANDS,
  currentClearPaneLabelCommandSurface: CURRENT_CLEAR_PANE_LABEL_COMMAND_SURFACE,
  currentSetPaneLabelAdapterSurface: CURRENT_SET_PANE_LABEL_ADAPTER_SURFACE,
  existingGoMutatingTmuxCommands: EXISTING_GO_MUTATING_TMUX_COMMANDS,
  forbiddenCurrentGoTmuxSnippets: FORBIDDEN_CURRENT_GO_TMUX_SNIPPETS,
  forbiddenFutureScope: FORBIDDEN_FUTURE_SCOPE,
  facadeAuthority: FACADE_AUTHORITY,
  futureFacadeRule: FUTURE_FACADE_RULE,
  futurePublicBehavior: FUTURE_PUBLIC_BEHAVIOR,
  futureInputPolicy: FUTURE_INPUT_POLICY,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  nativeArtifactSnapshot: NATIVE_ARTIFACT_SNAPSHOT,
  gateOnly: true,
  noRuntimeMigrationInThisSlice: true,
  futureCandidateMutatesTmux: true,
  futureCandidateDestructive: false,
  setPaneLabelMigrated: true,
  clearPaneLabelMigrated: false,
  clearPaneLabelsForTeamMigrated: false,
  syncPaneLabelsMigrated: false,
  markWindowAsAgentTeamMigrated: true,
  refreshWindowPaneLabelsMigrated: true,
  newSessionMigrated: false,
  newWindowMigrated: false,
  createTeammatePaneMigrated: false,
  wakePaneMigrated: false,
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
  CLEAR_HELPER_NAME,
  CONTRACT_STATUS,
  CURRENT_CLEAR_PANE_LABEL_COMMAND_SURFACE,
  CURRENT_SET_PANE_LABEL_ADAPTER_SURFACE,
  EXISTING_GO_MUTATING_TMUX_COMMANDS,
  FACADE_AUTHORITY,
  FORBIDDEN_CURRENT_GO_TMUX_SNIPPETS,
  FORBIDDEN_FUTURE_SCOPE,
  FUTURE_FACADE_RULE,
  FUTURE_INPUT_POLICY,
  FUTURE_OPERATION,
  FUTURE_PUBLIC_BEHAVIOR,
  GO_PANE_LABEL_CLEARING_GATE_SCHEMA_VERSION,
  GO_PANE_LABEL_CLEARING_GATE_THEME,
  HELPER_VERSION,
  NATIVE_ARTIFACT_SNAPSHOT,
  ORCHESTRATOR_NAME,
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  SET_HELPER_NAME,
  SET_ORCHESTRATOR_NAME,
  goPaneLabelClearingGate,
}
