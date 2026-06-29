const GO_KILL_PANE_CUTOVER_SCHEMA_VERSION = 1
const GO_KILL_PANE_CUTOVER_THEME = 'v0.6.86-go-kill-pane-cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'killPane'
const HELPER_NAME = 'workerLifecycle.killPane'
const RUNTIME_FILE = 'tmux/panes.ts'
const KERNEL_FILE = 'core/kernel.ts'
const GO_SOURCE_FILE = 'kernel/go/agentteam-kernel/main.go'
const WINDOWS_FILE = 'tmux/windows.ts'
const LABELS_FILE = 'tmux/labels.ts'
const TEAM_PANES_FILE = 'adapters/tmux/teamPanes.ts'
const BUILDER_FILE = 'scripts/lib/go-helper-artifact-builder.cjs'
const VERIFIER_FILE = 'scripts/lib/go-helper-artifact-verifier.cjs'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().killPane(paneId)'
const REMOVED_TYPESCRIPT_FALLBACK = "runTmuxNoThrow(['kill-pane', '-t', paneId])"
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
    command: 'kill-pane',
    args: Object.freeze(['kill-pane', '-t', '<paneId>']),
    rendered: 'tmux kill-pane -t <paneId>',
    argvOnly: true,
    mutatesTmux: true,
    destructive: true,
    createsSession: false,
    createsWindow: false,
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
  helperFailureThrowsPublicly: false,
})
const PUBLIC_FACADE = Object.freeze({
  signature: 'export function killPane(paneId: string): void',
  noThrow: true,
  voidReturn: true,
  async: false,
  hiddenTypescriptFallbackRemoved: true,
})
const PRESERVED_BOUNDARIES = Object.freeze([
  'clearPaneLabelSync(paneId) remains TypeScript-owned and unchanged',
  'clearAndKillTeamPanes(...) / killTeamPanes(...) orchestration remains TypeScript-owned',
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
  killPaneSmoke: Object.freeze({ ok: false, acceptedFailureKinds: Object.freeze(['invalid-pane-id']) }),
})
const goKillPaneCutover = Object.freeze({
  schemaVersion: GO_KILL_PANE_CUTOVER_SCHEMA_VERSION,
  theme: GO_KILL_PANE_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  helperName: HELPER_NAME,
  runtimeFile: RUNTIME_FILE,
  kernelFile: KERNEL_FILE,
  goSourceFile: GO_SOURCE_FILE,
  windowsFile: WINDOWS_FILE,
  labelsFile: LABELS_FILE,
  teamPanesFile: TEAM_PANES_FILE,
  builderFile: BUILDER_FILE,
  verifierFile: VERIFIER_FILE,
  nativeRoot: NATIVE_ROOT,
  adapterDelegation: ADAPTER_DELEGATION,
  removedTypescriptFallback: REMOVED_TYPESCRIPT_FALLBACK,
  activeCapabilities: ACTIVE_CAPABILITIES,
  activeOperations: ACTIVE_OPERATIONS,
  authorizedTmuxCommands: AUTHORIZED_TMUX_COMMANDS,
  forbiddenGoTmuxCommands: FORBIDDEN_GO_TMUX_COMMANDS,
  inputPolicy: INPUT_POLICY,
  publicFacade: PUBLIC_FACADE,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  nativeArtifactSnapshot: NATIVE_ARTIFACT_SNAPSHOT,
  killPaneMigrated: true,
  killPaneGoHandlerAdded: true,
  killPaneAdapterMethodAdded: true,
  typescriptKillPaneFallbackRemoved: true,
  noHiddenTypescriptFallbackAfterCutover: true,
  publicNoThrowVoidPreserved: true,
  clearPaneLabelSyncChanged: false,
  clearPaneLabelsForTeamChanged: false,
  clearAndKillTeamPanesChanged: false,
  wakePaneMigrated: false,
  broaderDestructiveLifecycleMigrated: false,
  stateRepositoryMigrated: false,
  taskReportPlanRunMigrated: false,
  teamPanelViewModelMigrated: false,
  releasePackageVerificationMigrated: false,
  nativeArtifactRenamed: false,
  nativeHelperRebuilt: true,
  packageVersionChanged: false,
  packageReleaseApproved: false,
})

module.exports = {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ADAPTER_DELEGATION,
  AUTHORIZED_TMUX_COMMANDS,
  BUILDER_FILE,
  CAPABILITY,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_KILL_PANE_CUTOVER_SCHEMA_VERSION,
  GO_KILL_PANE_CUTOVER_THEME,
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
  REMOVED_TYPESCRIPT_FALLBACK,
  RUNTIME_FILE,
  TEAM_PANES_FILE,
  VERIFIER_FILE,
  WINDOWS_FILE,
  goKillPaneCutover,
}
