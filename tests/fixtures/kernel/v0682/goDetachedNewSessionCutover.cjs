const GO_DETACHED_NEW_SESSION_CUTOVER_SCHEMA_VERSION = 1
const GO_DETACHED_NEW_SESSION_CUTOVER_THEME = 'v0.6.82 Go detached new-session cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'createDetachedSwarmSession'
const HELPER_NAME = 'createDetachedSwarmSession'
const RUNTIME_FILE = 'tmux/windows.ts'
const PANES_FILE = 'tmux/panes.ts'
const LABELS_FILE = 'tmux/labels.ts'
const KERNEL_FILE = 'core/kernel.ts'
const GO_SOURCE_FILE = 'kernel/go/agentteam-kernel/main.go'
const BUILDER_FILE = 'scripts/lib/go-helper-artifact-builder.cjs'
const VERIFIER_FILE = 'scripts/lib/go-helper-artifact-verifier.cjs'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'findWindowTargetByName', 'sessionExists', 'createDetachedSwarmSession', 'markWindowAsAgentTeam', 'refreshWindowPaneLabels', 'setPaneLabel', 'clearPaneLabel', 'createTeammatePane'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const AUTHORIZED_TMUX_COMMANDS = Object.freeze([
  Object.freeze({ rendered: 'tmux new-session -d -s <SWARM_SESSION> -n <SWARM_WINDOW>', args: Object.freeze(['new-session', '-d', '-s', '<SWARM_SESSION>', '-n', '<SWARM_WINDOW>']), command: 'new-session', phase: 'detached-swarm-session-creation', mutatesTmux: true, destructive: false, createsSession: true, createsWindow: true }),
])
const PRESERVED_TYPESCRIPT_SURFACE = Object.freeze({
  ensureSwarmWindowOwnedByTypescript: true,
  sessionExistsCall: 'const sessionResult = await createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)',
  hasSessionCheck: 'const hasSession = sessionResult.ok && sessionResult.exists',
  markAfterCreateCall: 'await markWindowAsAgentTeam(`${SWARM_SESSION}:${SWARM_WINDOW}`, signal)',
  newWindowCall: "runTmuxAsync(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW], undefined, signal)",
  postCreationLookupCall: 'let initialTarget = await findAgentTeamWindowTarget(SWARM_SESSION, signal)',
  findWindowByNameCall: 'initialTarget = await findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)',
  firstPaneLookupCall: 'const leaderPaneId = await firstPaneInWindow(initialTarget, signal)',
  leaderBindingLookupCall: 'const binding = await resolvePaneBindingAsync(leaderPaneId, signal)',
})
const DIRECT_TYPESCRIPT_NEW_SESSION_COMMANDS = Object.freeze([
  "runTmuxAsync(['new-session'",
  "runTmuxAsync(['new-session', '-d', '-s', SWARM_SESSION, '-n', SWARM_WINDOW]",
])
const FORBIDDEN_GO_TMUX_COMMANDS = Object.freeze([
  'new-window',
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
  'only the detached missing-session new-session command moved to Go',
  'markWindowAsAgentTeam(`${SWARM_SESSION}:${SWARM_WINDOW}`, signal) still runs after successful session creation',
  'detached new-window remains TypeScript-owned',
  'inside-tmux branch remains TypeScript-owned/orchestrated',
  'post-creation window lookup remains unchanged',
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
  helperSha256: '80b207e685fcdebbba17b03316d5a65fefd26cc28430a763f0b3672eb735ce9c',
  helperSize: 3511594,
  manifestSha256: '3f65f8c504bc9cbccdd34e8d5582cf8e44656182290f3ca6dd0ed6fe4fa34679',
  provenanceSha256: '098f3e6bb38a311b8482c196cdb8f1b5660c29737c094ec56c6a1ff41b3eedb8',
  attestationSha256: 'c60a141ffc90afe0b8690893673abbc49594efcdea79fc11e1b9785e032ae90c',
  checksumsSha256: '9858249d6d098b2d30c882e24715f06fbad41b03f06e8938272cfbdae2a60bf3',
  sourceRevision: 'd928f2f71ed8386a5a04e21e68096a9524fb0975',
  createDetachedSwarmSessionSmoke: Object.freeze({ ok: false, acceptedFailureKinds: Object.freeze(['invalid-session']) }),
})
const goDetachedNewSessionCutover = Object.freeze({
  schemaVersion: GO_DETACHED_NEW_SESSION_CUTOVER_SCHEMA_VERSION,
  theme: GO_DETACHED_NEW_SESSION_CUTOVER_THEME,
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
  directTypescriptNewSessionCommands: DIRECT_TYPESCRIPT_NEW_SESSION_COMMANDS,
  forbiddenGoTmuxCommands: FORBIDDEN_GO_TMUX_COMMANDS,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  inputPolicy: INPUT_POLICY,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  nativeArtifactSnapshot: NATIVE_ARTIFACT_SNAPSHOT,
  facadeCutoverMigrated: true,
  detachedNewSessionMigrated: true,
  typescriptNewSessionFallbackRemoved: true,
  noHiddenTypescriptFallbackAfterCutover: true,
  thrownCreateFailuresPreserved: true,
  rawOutputLeakageAllowed: false,
  shellInterpolationAllowed: false,
  ensureSwarmWindowMigrated: false,
  newWindowMigrated: false,
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
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_DETACHED_NEW_SESSION_CUTOVER_SCHEMA_VERSION,
  GO_DETACHED_NEW_SESSION_CUTOVER_THEME,
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
  goDetachedNewSessionCutover,
}
