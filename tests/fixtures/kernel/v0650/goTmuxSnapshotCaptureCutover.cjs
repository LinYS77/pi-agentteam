const GO_TMUX_SNAPSHOT_CAPTURE_CUTOVER_SCHEMA_VERSION = 1
const GO_TMUX_SNAPSHOT_CAPTURE_CUTOVER_THEME = 'v0.6.50 Go tmuxSnapshotCapture cutover'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITY = 'tmuxSnapshotCapture'
const PARSER_CAPABILITY = 'tmuxSnapshotParse'
const REQUIRED_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle'])
const SNAPSHOT_FORMAT = '#{pane_id}\t#{session_name}:#{window_id}\t#{@agentteam-name}\t#{pane_current_command}'
const GO_CAPTURE_COMMAND = Object.freeze(['tmux', 'list-panes', '-a', '-F', 'tmuxPaneSnapshotFormat'])
const FAILURE_KINDS = Object.freeze([
  'missing-helper',
  'helper-unsupported-capability',
  'helper-timeout',
  'helper-spawn-error',
  'helper-jsonrpc-error',
  'helper-incompatible-response',
  'previous-helper-failure',
  'tmux-command-timeout',
  'tmux-command-failed',
  'tmux-unavailable',
])
const PRESERVED_BOUNDARIES = Object.freeze([
  'worker lifecycle remains TypeScript-governed',
  'state repository remains TypeScript-owned',
  'task/report/PlanRun governance remains TypeScript-owned',
  'mailbox/report full-text boundaries remain TypeScript-owned',
  'team panel TUI rendering remains TypeScript-owned',
  'package release actions remain separately gated',
])
const FORBIDDEN_GO_RUNTIME_TERMS = Object.freeze([
  'createTeammatePane',
  'send-keys',
  'split-window',
  'new-window',
  'kill-pane',
  'PI_AGENTTEAM_HOME',
  'team.json',
  'os.ReadFile',
  'os.WriteFile',
  'os.Create',
  'agentteam_task',
  'agentteam_receive',
  'report_done',
  'report_blocked',
  'renderPanel',
  'openTeamPanel',
  'npm publish',
  'npm version',
])
const RELEASE_PACKAGE_GUARDS = Object.freeze([
  'no npm version',
  'no npm publish',
  'no tag or release creation',
  'no GitHub release assets',
  'no package lockfiles',
  'no go.mod or go.sum',
  'no lifecycle hooks or postinstall downloads',
  'no runtime go build',
  'no second-platform support',
  'no signing release gate',
])
const goTmuxSnapshotCaptureCutover = Object.freeze({
  schemaVersion: GO_TMUX_SNAPSHOT_CAPTURE_CUTOVER_SCHEMA_VERSION,
  theme: GO_TMUX_SNAPSHOT_CAPTURE_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capability: CAPABILITY,
  parserCapability: PARSER_CAPABILITY,
  requiredCapabilities: REQUIRED_CAPABILITIES,
  snapshotFormat: SNAPSHOT_FORMAT,
  goCaptureCommand: GO_CAPTURE_COMMAND,
  failureKinds: FAILURE_KINDS,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  forbiddenGoRuntimeTerms: FORBIDDEN_GO_RUNTIME_TERMS,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  captureRuntimeMigrated: true,
  workerLifecycleMigrated: false,
  stateRepositoryMigrated: false,
  taskReportPlanRunMigrated: false,
  teamPanelViewModelMigrated: false,
  packageReleaseApproved: false,
  npmVersionChanged: false,
  npmPublished: false,
  tagReleaseCreated: false,
})

module.exports = {
  CAPABILITY,
  FAILURE_KINDS,
  FORBIDDEN_GO_RUNTIME_TERMS,
  GO_CAPTURE_COMMAND,
  GO_TMUX_SNAPSHOT_CAPTURE_CUTOVER_SCHEMA_VERSION,
  GO_TMUX_SNAPSHOT_CAPTURE_CUTOVER_THEME,
  HELPER_VERSION,
  PACKAGE_VERSION,
  PARSER_CAPABILITY,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  REQUIRED_CAPABILITIES,
  SNAPSHOT_FORMAT,
  goTmuxSnapshotCaptureCutover,
}
