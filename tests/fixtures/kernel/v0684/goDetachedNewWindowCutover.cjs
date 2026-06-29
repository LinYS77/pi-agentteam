const GO_DETACHED_NEW_WINDOW_CUTOVER_SCHEMA_VERSION = 1
const GO_DETACHED_NEW_WINDOW_CUTOVER_THEME = 'v0.6.84 Go detached new-window cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'createDetachedSwarmWindow'
const HELPER_NAME = 'createDetachedSwarmWindow'
const RUNTIME_FILE = 'tmux/windows.ts'
const PANES_FILE = 'tmux/panes.ts'
const LABELS_FILE = 'tmux/labels.ts'
const KERNEL_FILE = 'core/kernel.ts'
const GO_SOURCE_FILE = 'kernel/go/agentteam-kernel/main.go'
const BUILDER_FILE = 'scripts/lib/go-helper-artifact-builder.cjs'
const VERIFIER_FILE = 'scripts/lib/go-helper-artifact-verifier.cjs'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().createDetachedSwarmWindowAsync(SWARM_SESSION, SWARM_WINDOW, signal)'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'findWindowTargetByName', 'sessionExists', 'createDetachedSwarmSession', 'createDetachedSwarmWindow', 'markWindowAsAgentTeam', 'refreshWindowPaneLabels', 'setPaneLabel', 'clearPaneLabel', 'createTeammatePane'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const AUTHORIZED_TMUX_COMMANDS = Object.freeze([
  Object.freeze({ rendered: 'tmux new-window -t <SWARM_SESSION> -n <SWARM_WINDOW>', args: Object.freeze(['new-window', '-t', '<SWARM_SESSION>', '-n', '<SWARM_WINDOW>']), command: 'new-window', phase: 'detached-agentteam-window-creation', mutatesTmux: true, destructive: false, createsSession: false, createsWindow: true }),
])
const PRESERVED_TYPESCRIPT_SURFACE = Object.freeze({
  ensureSwarmWindowOwnedByTypescript: true,
  sessionExistsCall: 'const sessionResult = await createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)',
  hasSessionCheck: 'const hasSession = sessionResult.ok && sessionResult.exists',
  detachedNewSessionCall: 'createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)',
  markAfterSessionCreateCall: 'await markWindowAsAgentTeam(`${SWARM_SESSION}:${SWARM_WINDOW}`, signal)',
  agentteamWindowLookupCall: 'let initialTarget = await findAgentTeamWindowTarget(SWARM_SESSION, signal)',
  postCreationLookupCall: 'initialTarget = await findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)',
  failedPostCreateLookupThrow: "throw new Error('Failed to locate agentteam tmux window after creation')",
  markAfterWindowCreateLookupCall: 'await markWindowAsAgentTeam(initialTarget, signal)',
  firstPaneLookupCall: 'const leaderPaneId = await firstPaneInWindow(initialTarget, signal)',
  leaderBindingLookupCall: 'const binding = await resolvePaneBindingAsync(leaderPaneId, signal)',
  finalMarkCall: 'await markWindowAsAgentTeam(target, signal)',
  finalRefreshCall: 'await refreshWindowPaneLabels(target, signal)',
})
const DIRECT_TYPESCRIPT_NEW_WINDOW_COMMANDS = Object.freeze([
  "runTmuxAsync(['new-window'",
  "runTmuxAsync(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW]",
])
const DIRECT_TYPESCRIPT_NEW_SESSION_COMMANDS = Object.freeze([
  "runTmuxAsync(['new-session'",
  "runTmuxAsync(['new-session', '-d', '-s', SWARM_SESSION, '-n', SWARM_WINDOW]",
])
const FORBIDDEN_GO_TMUX_COMMANDS = Object.freeze([
  'send-keys',
  'kill-pane',
  'kill-window',
  'kill-session',
  'respawn-pane',
  'set-buffer',
  'paste-buffer',
  'capture-pane',
])
const PRESERVED_BOUNDARIES = Object.freeze([
  'TypeScript/pi facade remains the public product and pi extension compliance boundary',
  'ensureSwarmWindow(...) broader orchestration remains TypeScript-owned',
  'only the detached missing-agentteam-window new-window command moved to Go',
  'v0.6.82 createDetachedSwarmSession remains unchanged',
  'findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal) post-create lookup remains unchanged',
  "throw new Error('Failed to locate agentteam tmux window after creation') remains unchanged",
  'markWindowAsAgentTeam(initialTarget, signal) after lookup remains unchanged',
  'inside-tmux branch remains TypeScript-owned/orchestrated',
  'createTeammatePane remains the v0.6.80 Go-backed pane split/layout/resize cutover and is not changed here',
  'wake/send-keys, destructive lifecycle, state/task/PlanRun/mailbox/governance, team panel/UI, and release/package control plane remain out of scope',
])
const INPUT_POLICY = Object.freeze({
  argvOnly: true,
  shellInterpolationAllowed: false,
  sessionNameValidation: 'compact tmux session-name validation before argv execution',
  windowNameValidation: 'compact tmux window-name validation before argv execution',
  rawStdoutStderrLeakageAllowed: false,
  rawHelperOutputLeakageAllowed: false,
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
  'no native artifact path or binary rename',
  'no package-manager native dependency/download flow',
])
const NATIVE_ARTIFACT_SNAPSHOT = Object.freeze({
  root: NATIVE_ROOT,
  helperPath: 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/agentteam-tmuxSnapshotParse',
  helperSha256: '5647a92fb74238f7747eb3ce48f6d2f834f1b47a4584615c7f897a2815eff27e',
  helperSize: 3516559,
  manifestSha256: '553dcb5ee94a93494276435b1aea9f40fbb064c64487fd042cf4f6f55870c5f1',
  provenanceSha256: 'b295c78c757787303aca37fa06830dd3a331749fa4ce54e4842c652e5749c9ab',
  attestationSha256: '7cb152bfbc1a7101dc2891a4ea1f6a8924dc7a6f74b6fb528e73b2be12746a00',
  checksumsSha256: 'a1e55d6a1cf9afd09b096bbd2554a7063fc09fee76aa3d3cb64a0de7233d2a2d',
  sourceRevision: '5f1e7d3546950a81dee47987ac12134885ee958c',
  createDetachedSwarmSessionSmoke: Object.freeze({ ok: false, acceptedFailureKinds: Object.freeze(['invalid-session']) }),
  createDetachedSwarmWindowSmoke: Object.freeze({ ok: false, acceptedFailureKinds: Object.freeze(['invalid-session']) }),
})
const goDetachedNewWindowCutover = Object.freeze({
  schemaVersion: GO_DETACHED_NEW_WINDOW_CUTOVER_SCHEMA_VERSION,
  theme: GO_DETACHED_NEW_WINDOW_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  helperName: HELPER_NAME,
  runtimeFile: RUNTIME_FILE,
  panesFile: PANES_FILE,
  labelsFile: LABELS_FILE,
  kernelFile: KERNEL_FILE,
  goSourceFile: GO_SOURCE_FILE,
  builderFile: BUILDER_FILE,
  verifierFile: VERIFIER_FILE,
  nativeRoot: NATIVE_ROOT,
  adapterDelegation: ADAPTER_DELEGATION,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  authorizedTmuxCommands: AUTHORIZED_TMUX_COMMANDS,
  preservedTypescriptSurface: PRESERVED_TYPESCRIPT_SURFACE,
  directTypescriptNewWindowCommands: DIRECT_TYPESCRIPT_NEW_WINDOW_COMMANDS,
  directTypescriptNewSessionCommands: DIRECT_TYPESCRIPT_NEW_SESSION_COMMANDS,
  forbiddenGoTmuxCommands: FORBIDDEN_GO_TMUX_COMMANDS,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  inputPolicy: INPUT_POLICY,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  nativeArtifactSnapshot: NATIVE_ARTIFACT_SNAPSHOT,
  facadeCutoverMigrated: true,
  detachedNewWindowMigrated: true,
  typescriptNewWindowFallbackRemoved: true,
  noHiddenTypescriptFallbackAfterCutover: true,
  thrownCreateFailuresPreserved: true,
  rawOutputLeakageAllowed: false,
  shellInterpolationAllowed: false,
  detachedNewSessionChanged: false,
  ensureSwarmWindowMigrated: false,
  insideTmuxBranchMigrated: false,
  postCreationWindowLookupMigrated: false,
  markWindowAsAgentTeamChanged: false,
  refreshWindowPaneLabelsChanged: false,
  createTeammatePaneChanged: false,
  paneSplitLayoutResizeChanged: false,
  wakePaneMigrated: false,
  killPaneMigrated: false,
  stateRepositoryMigrated: false,
  taskReportPlanRunMigrated: false,
  teamPanelViewModelMigrated: false,
  releasePackageVerificationMigrated: false,
  nativeArtifactRenamed: false,
  nativeHelperRebuilt: true,
  goSourceChanged: true,
  coreKernelChanged: true,
  tmuxWindowsRuntimeChanged: true,
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
  BUILDER_FILE,
  CAPABILITY,
  DIRECT_TYPESCRIPT_NEW_SESSION_COMMANDS,
  DIRECT_TYPESCRIPT_NEW_WINDOW_COMMANDS,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_DETACHED_NEW_WINDOW_CUTOVER_SCHEMA_VERSION,
  GO_DETACHED_NEW_WINDOW_CUTOVER_THEME,
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
  PANES_FILE,
  PRESERVED_BOUNDARIES,
  PRESERVED_TYPESCRIPT_SURFACE,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  VERIFIER_FILE,
  goDetachedNewWindowCutover,
}
