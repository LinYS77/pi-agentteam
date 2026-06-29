const GO_CREATE_TEAMMATE_PANE_CUTOVER_SCHEMA_VERSION = 1
const GO_CREATE_TEAMMATE_PANE_CUTOVER_THEME = 'v0.6.80 Go createTeammatePane cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'workerLifecycle'
const OPERATION = 'createTeammatePane'
const HELPER_NAME = 'createTeammatePane'
const LABEL_HELPER_NAME = 'setPaneLabel'
const REFRESH_HELPER_NAME = 'refreshWindowPaneLabels'
const RUNTIME_FILE = 'tmux/panes.ts'
const LABELS_FILE = 'tmux/labels.ts'
const WINDOWS_FILE = 'tmux/windows.ts'
const KERNEL_FILE = 'core/kernel.ts'
const GO_SOURCE_FILE = 'kernel/go/agentteam-kernel/main.go'
const BUILDER_FILE = 'scripts/lib/go-helper-artifact-builder.cjs'
const VERIFIER_FILE = 'scripts/lib/go-helper-artifact-verifier.cjs'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ADAPTER_DELEGATION = 'createAgentTeamKernelAdapter().createTeammatePaneAsync({'
const ACTIVE_OPERATIONS = Object.freeze(['inspectPane', 'listAgentTeamPanes', 'captureCurrentPaneBinding', 'listPanesInWindow', 'findAgentTeamWindowTarget', 'findWindowTargetByName', 'sessionExists', 'markWindowAsAgentTeam', 'refreshWindowPaneLabels', 'setPaneLabel', 'clearPaneLabel', 'createTeammatePane'])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const AUTHORIZED_TMUX_COMMANDS = Object.freeze([
  Object.freeze({ rendered: "tmux list-panes -t <target> -F '#{pane_id}'", args: Object.freeze(['list-panes', '-t', '<target>', '-F', '#{pane_id}']), command: 'list-panes', phase: 'pane-discovery', mutatesTmux: false, destructive: false }),
  Object.freeze({ rendered: "tmux split-window -t <leaderPaneId> -h -p 34 [-c <cwd>] -P -F '#{pane_id}' [startCommand]", args: Object.freeze(['split-window', '-t', '<leaderPaneId>', '-h', '-p', '34', '[-c <cwd>]', '-P', '-F', '#{pane_id}', '[startCommand]']), command: 'split-window', phase: 'first-leader-layout-split', mutatesTmux: true, destructive: false, createsPane: true }),
  Object.freeze({ rendered: "tmux split-window -t <lastPaneId> -v [-c <cwd>] -P -F '#{pane_id}' [startCommand]", args: Object.freeze(['split-window', '-t', '<lastPaneId>', '-v', '[-c <cwd>]', '-P', '-F', '#{pane_id}', '[startCommand]']), command: 'split-window', phase: 'later-or-other-split', mutatesTmux: true, destructive: false, createsPane: true }),
  Object.freeze({ rendered: 'tmux select-layout -t <target> main-vertical', args: Object.freeze(['select-layout', '-t', '<target>', 'main-vertical']), command: 'select-layout', phase: 'leader-layout', mutatesTmux: true, destructive: false }),
  Object.freeze({ rendered: 'tmux select-layout -t <target> tiled', args: Object.freeze(['select-layout', '-t', '<target>', 'tiled']), command: 'select-layout', phase: 'non-leader-layout', mutatesTmux: true, destructive: false }),
  Object.freeze({ rendered: 'tmux resize-pane -t <leaderPaneId> -x 66%', args: Object.freeze(['resize-pane', '-t', '<leaderPaneId>', '-x', '66%']), command: 'resize-pane', phase: 'leader-resize', mutatesTmux: true, destructive: false }),
])
const REUSED_LABEL_HELPERS = Object.freeze([
  Object.freeze({ helper: LABEL_HELPER_NAME, operation: 'setPaneLabel', commandSurfaceChanged: false, reusedByCreateTeammatePane: true }),
  Object.freeze({ helper: REFRESH_HELPER_NAME, operation: 'refreshWindowPaneLabels', commandSurfaceChanged: false, reusedByCreateTeammatePane: true }),
])
const FORBIDDEN_GO_TMUX_COMMANDS = Object.freeze([
  'new-session',
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
const DIRECT_TYPESCRIPT_CREATE_COMMANDS = Object.freeze([
  "runTmuxAsync(['list-panes'",
  "runTmuxAsync(['split-window'",
  "runTmuxAsync(['select-layout'",
  "runTmuxAsync(['resize-pane'",
  "runTmuxNoThrowAsync(['set-option', '-p'",
  "runTmuxNoThrowAsync(['select-pane', '-t', paneId, '-T', input.name]",
])
const OPAQUE_INPUT_POLICY = Object.freeze({
  argvOnly: true,
  shellInterpolationAllowed: false,
  cwdRawDiagnosticsAllowed: false,
  startCommandRawDiagnosticsAllowed: false,
  rawTmuxOutputDiagnosticsAllowed: false,
  rawHelperOutputLeakageAllowed: false,
  opaqueArgumentLimit: 4096,
})
const PRESERVED_BOUNDARIES = Object.freeze([
  'TypeScript/pi facade remains the public product and pi extension compliance boundary',
  'ensureSwarmWindow(input.preferred, signal) remains TypeScript-owned',
  'new-session and new-window remain TypeScript-owned inside tmux/windows.ts',
  'createTeammatePane Go owns only pane discovery, split-window, select-layout, and resize-pane',
  'post-create labels reuse the existing Go-backed setPaneLabel helper; no new label command surface is introduced',
  'refreshWindowPaneLabels remains v0.6.74 Go-backed and is reused after pane creation',
  'killPane and clearPaneLabelSync remain TypeScript-owned helpers in tmux/panes.ts',
  'wake/send-keys, destructive lifecycle, state/task/PlanRun/mailbox/governance, team panel/UI, and release/package control plane remain out of scope',
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
  'no package-manager native dependency/download flow',
])
const goCreateTeammatePaneCutover = Object.freeze({
  schemaVersion: GO_CREATE_TEAMMATE_PANE_CUTOVER_SCHEMA_VERSION,
  theme: GO_CREATE_TEAMMATE_PANE_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  operation: OPERATION,
  helperName: HELPER_NAME,
  labelHelperName: LABEL_HELPER_NAME,
  refreshHelperName: REFRESH_HELPER_NAME,
  runtimeFile: RUNTIME_FILE,
  labelsFile: LABELS_FILE,
  windowsFile: WINDOWS_FILE,
  kernelFile: KERNEL_FILE,
  goSourceFile: GO_SOURCE_FILE,
  builderFile: BUILDER_FILE,
  verifierFile: VERIFIER_FILE,
  nativeRoot: NATIVE_ROOT,
  adapterDelegation: ADAPTER_DELEGATION,
  activeOperations: ACTIVE_OPERATIONS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  authorizedTmuxCommands: AUTHORIZED_TMUX_COMMANDS,
  reusedLabelHelpers: REUSED_LABEL_HELPERS,
  forbiddenGoTmuxCommands: FORBIDDEN_GO_TMUX_COMMANDS,
  directTypescriptCreateCommands: DIRECT_TYPESCRIPT_CREATE_COMMANDS,
  opaqueInputPolicy: OPAQUE_INPUT_POLICY,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  facadeCutoverMigrated: true,
  createTeammatePaneMigrated: true,
  typescriptCreateFallbackRemoved: true,
  noHiddenTypescriptFallbackAfterCutover: true,
  preservesPublicResultShape: true,
  publicResultShape: Object.freeze(['paneId', 'target']),
  thrownCreateFailuresPreserved: true,
  rawOutputLeakageAllowed: false,
  rawCwdLeakageAllowed: false,
  rawStartCommandLeakageAllowed: false,
  shellInterpolationAllowed: false,
  ensureSwarmWindowMigrated: false,
  newSessionMigrated: false,
  newWindowMigrated: false,
  wakePaneMigrated: false,
  killPaneMigrated: false,
  stateRepositoryMigrated: false,
  taskReportPlanRunMigrated: false,
  teamPanelViewModelMigrated: false,
  releasePackageVerificationMigrated: false,
  setPaneLabelMigrated: true,
  setPaneLabelCommandSurfaceChanged: false,
  refreshWindowPaneLabelsMigrated: true,
  refreshWindowPaneLabelsCommandSurfaceChanged: false,
  nativeArtifactRenamed: false,
  nativeHelperRebuilt: true,
  goSourceChanged: true,
  coreKernelChanged: true,
  tmuxPanesRuntimeChanged: true,
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
  DIRECT_TYPESCRIPT_CREATE_COMMANDS,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_CREATE_TEAMMATE_PANE_CUTOVER_SCHEMA_VERSION,
  GO_CREATE_TEAMMATE_PANE_CUTOVER_THEME,
  GO_SOURCE_FILE,
  HELPER_NAME,
  HELPER_VERSION,
  KERNEL_FILE,
  LABELS_FILE,
  LABEL_HELPER_NAME,
  NATIVE_ROOT,
  OPAQUE_INPUT_POLICY,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  REFRESH_HELPER_NAME,
  RELEASE_PACKAGE_GUARDS,
  REUSED_LABEL_HELPERS,
  RUNTIME_FILE,
  VERIFIER_FILE,
  WINDOWS_FILE,
  goCreateTeammatePaneCutover,
}
