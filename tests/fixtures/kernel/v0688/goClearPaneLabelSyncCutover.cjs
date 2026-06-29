const GO_CLEAR_PANE_LABEL_SYNC_CUTOVER_SCHEMA_VERSION = 1
const GO_CLEAR_PANE_LABEL_SYNC_CUTOVER_THEME = 'v0.6.88-go-clear-pane-label-sync-cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'clearPaneLabel'
const FACADE_NAME = 'clearPaneLabelSync'
const HELPER_NAME = 'workerLifecycle.clearPaneLabel'
const RUNTIME_FILE = 'tmux/panes.ts'
const LABELS_FILE = 'tmux/labels.ts'
const KERNEL_FILE = 'core/kernel.ts'
const GO_SOURCE_FILE = 'kernel/go/agentteam-kernel/main.go'
const WINDOWS_FILE = 'tmux/windows.ts'
const TEAM_PANES_FILE = 'adapters/tmux/teamPanes.ts'
const TEAM_ACTIONS_FILE = 'commands/teamActions.ts'
const WORKER_SPAWN_FILE = 'tools/workerSpawnService.ts'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().clearPaneLabel(paneId)'
const REMOVED_TYPESCRIPT_FALLBACKS = Object.freeze([
  "runTmuxNoThrow(['set-option', '-up', '-t', paneId, '@agentteam-name'])",
  "runTmuxNoThrow(['select-pane', '-t', paneId, '-T', ''])",
])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const ACTIVE_OPERATIONS = Object.freeze([
  'inspectPane',
  'listAgentTeamPanes',
  'captureCurrentPaneBinding',
  'listPanesInWindow',
  'findAgentTeamWindowTarget',
  'findWindowTargetByName',
  'sessionExists',
  'markWindowAsAgentTeam',
  'refreshWindowPaneLabels',
  'setPaneLabel',
  'clearPaneLabel',
  'createTeammatePane',
  'createDetachedSwarmSession',
  'createDetachedSwarmWindow',
  'killPane',
])
const AUTHORIZED_TMUX_COMMANDS = Object.freeze([
  Object.freeze({
    operation: OPERATION,
    command: 'set-option',
    args: Object.freeze(['set-option', '-up', '-t', '<paneId>', '@agentteam-name']),
    rendered: 'tmux set-option -up -t <paneId> @agentteam-name',
    argvOnly: true,
    mutatesTmux: true,
    destructive: false,
    clearsAgentTeamName: true,
    shellInterpolationAllowed: false,
  }),
  Object.freeze({
    operation: OPERATION,
    command: 'select-pane',
    args: Object.freeze(['select-pane', '-t', '<paneId>', '-T', '']),
    rendered: "tmux select-pane -t <paneId> -T ''",
    argvOnly: true,
    mutatesTmux: true,
    destructive: false,
    clearsPaneTitle: true,
    shellInterpolationAllowed: false,
  }),
])
const FORBIDDEN_GO_TMUX_COMMANDS = Object.freeze([
  'send-keys',
  'kill-window',
  'kill-session',
  'respawn-pane',
  'set-buffer',
  'paste-buffer',
  'capture-pane',
])
const INPUT_POLICY = Object.freeze({
  paneIdPattern: '^%[0-9]+$',
  compactPaneIdOnly: true,
  argvOnly: true,
  shellInterpolationAllowed: false,
  rawInputLeakageAllowed: false,
  rawTmuxOutputLeakageAllowed: false,
  rawHelperOutputLeakageAllowed: false,
  helperFailureThrowsPublicly: false,
})
const PUBLIC_FACADE = Object.freeze({
  signature: 'export function clearPaneLabelSync(paneId: string): void',
  noThrow: true,
  voidReturn: true,
  async: false,
  hiddenTypescriptFallbackRemoved: true,
  helperFailuresThrowPublicly: false,
})
const SYNC_ADAPTER = Object.freeze({
  method: 'clearPaneLabel(paneId: string): AgentTeamKernelPaneLabelClearing',
  helperCall: "callHelper<unknown>('workerLifecycle', { operation: 'clearPaneLabel', paneId: requestedPaneId })",
  reusedOperation: OPERATION,
  resultValidator: 'validatePaneLabelClearingResult',
  unavailableResult: 'workerLifecycleUnavailablePaneLabelClearing',
  incompatibleFallbackDetail: 'workerLifecycle clearPaneLabel result shape',
})
const ASYNC_HELPER_SURFACE = Object.freeze({
  runtimeFile: LABELS_FILE,
  helperName: 'clearPaneLabel',
  adapterDelegation: 'createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)',
  kernelMethod: 'clearPaneLabelAsync(paneId: string, signal?: AbortSignal): Promise<AgentTeamKernelPaneLabelClearing>',
  helperCall: "callHelperAsync<unknown>('workerLifecycle', { operation: 'clearPaneLabel', paneId: requestedPaneId }, signal)",
})
const PRESERVED_BOUNDARIES = Object.freeze([
  'tmux/labels.ts clearPaneLabel(paneId, signal) remains the v0.6.78 async Go-backed helper',
  'clearPaneLabelsForTeam(...) orchestration remains TypeScript-owned',
  'clearAndKillTeamPanes(...) / killTeamPanes(...) orchestration remains TypeScript-owned',
  'commands/teamActions.ts cleanup orchestration remains TypeScript-owned',
  'tools/workerSpawnService.ts pane cleanup remains TypeScript-owned',
  'killPane remains v0.6.86 Go-backed and unchanged',
  'createTeammatePane and detached new-session/new-window remain unchanged',
  'wake/send-keys remains out of scope',
  'kill-window, kill-session, respawn-pane, and buffers remain out of scope',
  'state/task/report/PlanRun/mailbox governance remains out of scope',
  'team panel/UI remains out of scope',
  'package/release/native dependency flow remains out of scope',
  'native helper path/name remains unchanged',
])
const RELEASE_PACKAGE_GUARDS = Object.freeze([
  'package.json remains 0.6.8',
  'no npm version',
  'no npm publish',
  'no release tag or GitHub release asset',
  'no package lockfiles',
  'no go.mod or go.sum',
  'no lifecycle hooks or postinstall downloads',
  'no package-manager native dependency/download flow',
  'no native artifact rebuild',
  'no native artifact rename',
])
const NATIVE_ARTIFACT_SNAPSHOT = Object.freeze({
  root: NATIVE_ROOT,
  helperPath: 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/agentteam-tmuxSnapshotParse',
  helperSha256: 'a654e58ff5a2c61b6c03d2fa5e05bc3d888243c49eecdd745f10c24d82f4f2a9',
  helperSize: 3521170,
  manifestSha256: '1eb45fb80806940f164a7c4e0a54cd063018fd943856a640897fa3dc11b90b6d',
  provenanceSha256: '69598eff59490feb76d48c325ebc6ee9022951832ee52935cd3f12cd5fb594b1',
  attestationSha256: 'c00b8ad0c65a66957609c6a2449d162a0eb447239ca8f9a5b3406f2ff3d71a83',
  checksumsSha256: '7879455dfc22823b86185c19d829d33e3bdb8651f75320f5d4b65421a3aabdbd',
  sourceRevision: '6603982e9c0130b9298a43b8214fd6887d7a125b',
  clearPaneLabelSmoke: Object.freeze({ ok: false, acceptedFailureKinds: Object.freeze(['invalid-pane-id']) }),
  killPaneSmoke: Object.freeze({ ok: false, acceptedFailureKinds: Object.freeze(['invalid-pane-id']) }),
})
const goClearPaneLabelSyncCutover = Object.freeze({
  schemaVersion: GO_CLEAR_PANE_LABEL_SYNC_CUTOVER_SCHEMA_VERSION,
  theme: GO_CLEAR_PANE_LABEL_SYNC_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  facadeName: FACADE_NAME,
  helperName: HELPER_NAME,
  runtimeFile: RUNTIME_FILE,
  labelsFile: LABELS_FILE,
  kernelFile: KERNEL_FILE,
  goSourceFile: GO_SOURCE_FILE,
  windowsFile: WINDOWS_FILE,
  teamPanesFile: TEAM_PANES_FILE,
  teamActionsFile: TEAM_ACTIONS_FILE,
  workerSpawnFile: WORKER_SPAWN_FILE,
  nativeRoot: NATIVE_ROOT,
  adapterDelegation: ADAPTER_DELEGATION,
  removedTypescriptFallbacks: REMOVED_TYPESCRIPT_FALLBACKS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  activeOperations: ACTIVE_OPERATIONS,
  authorizedTmuxCommands: AUTHORIZED_TMUX_COMMANDS,
  forbiddenGoTmuxCommands: FORBIDDEN_GO_TMUX_COMMANDS,
  inputPolicy: INPUT_POLICY,
  publicFacade: PUBLIC_FACADE,
  syncAdapter: SYNC_ADAPTER,
  asyncHelperSurface: ASYNC_HELPER_SURFACE,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  nativeArtifactSnapshot: NATIVE_ARTIFACT_SNAPSHOT,
  clearPaneLabelSyncMigrated: true,
  clearPaneLabelSyncAdapterMethodAdded: true,
  reusedExistingClearPaneLabelOperation: true,
  clearPaneLabelSyncGoHandlerAdded: false,
  clearPaneLabelSyncNativeSmokeAdded: false,
  typescriptClearPaneLabelSyncFallbackRemoved: true,
  publicNoThrowVoidPreserved: true,
  clearPaneLabelAsyncChanged: false,
  clearPaneLabelsForTeamChanged: false,
  clearAndKillTeamPanesChanged: false,
  teamActionsCleanupChanged: false,
  workerSpawnPaneCleanupChanged: false,
  killPaneChanged: false,
  createTeammatePaneChanged: false,
  detachedNewSessionChanged: false,
  detachedNewWindowChanged: false,
  wakePaneMigrated: false,
  broaderDestructiveLifecycleMigrated: false,
  stateRepositoryMigrated: false,
  taskReportPlanRunMigrated: false,
  teamPanelViewModelMigrated: false,
  releasePackageVerificationMigrated: false,
  goSourceChanged: false,
  nativeArtifactRenamed: false,
  nativeHelperRebuilt: false,
  packageVersionChanged: false,
  packageReleaseApproved: false,
})

module.exports = {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ADAPTER_DELEGATION,
  ASYNC_HELPER_SURFACE,
  AUTHORIZED_TMUX_COMMANDS,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_CLEAR_PANE_LABEL_SYNC_CUTOVER_SCHEMA_VERSION,
  GO_CLEAR_PANE_LABEL_SYNC_CUTOVER_THEME,
  GO_SOURCE_FILE,
  HELPER_NAME,
  HELPER_VERSION,
  INPUT_POLICY,
  KERNEL_FILE,
  LABELS_FILE,
  NATIVE_ARTIFACT_SNAPSHOT,
  NATIVE_ROOT,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  PUBLIC_FACADE,
  RELEASE_PACKAGE_GUARDS,
  REMOVED_TYPESCRIPT_FALLBACKS,
  RUNTIME_FILE,
  SYNC_ADAPTER,
  TEAM_ACTIONS_FILE,
  TEAM_PANES_FILE,
  WINDOWS_FILE,
  WORKER_SPAWN_FILE,
  goClearPaneLabelSyncCutover,
}
