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
  helperSha256: 'a654e58ff5a2c61b6c03d2fa5e05bc3d888243c49eecdd745f10c24d82f4f2a9',
  helperSize: 3521170,
  manifestSha256: '1eb45fb80806940f164a7c4e0a54cd063018fd943856a640897fa3dc11b90b6d',
  provenanceSha256: '69598eff59490feb76d48c325ebc6ee9022951832ee52935cd3f12cd5fb594b1',
  attestationSha256: 'c00b8ad0c65a66957609c6a2449d162a0eb447239ca8f9a5b3406f2ff3d71a83',
  checksumsSha256: '7879455dfc22823b86185c19d829d33e3bdb8651f75320f5d4b65421a3aabdbd',
  sourceRevision: '6603982e9c0130b9298a43b8214fd6887d7a125b',
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
