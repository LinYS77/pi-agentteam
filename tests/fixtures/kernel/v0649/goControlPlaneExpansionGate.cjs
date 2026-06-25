const GO_CONTROL_PLANE_EXPANSION_SCHEMA_VERSION = 1
const GO_CONTROL_PLANE_EXPANSION_THEME = 'v0.6.49 Go control-plane expansion gate'
const PACKAGE_VERSION = '0.6.8'
const ACTIVE_ADR = 'docs/decisions/0003-go-control-plane-expansion.md'
const SUPERSEDED_ADRS = Object.freeze([
  'docs/decisions/0001-replaceable-go-kernel.md',
  'docs/decisions/0002-module-owned-go-kernel-cutover.md',
])
const EXPANSION_STATUS = 'accepted-for-staged-implementation'
const TARGET_ARCHITECTURE = 'typescript-pi-facade-with-embedded-go-control-plane-core'
const FIRST_IMPLEMENTATION_SLICE = 'tmuxSnapshotCapture'
const FACADE_RESPONSIBILITIES = Object.freeze([
  'pi extension registration',
  'tool and command schemas',
  'hook registration',
  'role prompt files and operator prompt wording',
  'TUI shell integration during migration',
  'compact diagnostics shaping',
])
const ALLOWED_FUTURE_GO_CAPABILITIES = Object.freeze([
  'tmuxSnapshotCapture',
  'workerLifecycle',
  'stateRepository',
  'taskReportPlanRun',
  'teamPanelViewModel',
  'packageReleaseVerify',
])
const PRESERVED_PRODUCT_SEMANTICS = Object.freeze([
  'visible teammate work remains in tmux panes',
  'leader-gated task governance remains authoritative',
  'non-leader reports remain report-only until leader review',
  'agentteam_receive remains the mailbox full-text/read boundary',
  'agentteam_task action=report remains the TaskReport full-text boundary',
  'workers do not spawn workers',
  'peer reports do not auto-create downstream tasks',
  'PlanRun remains explicit with no hidden scheduler/autopilot',
  'legacy teams/- remains compatible and non-destructive',
])
const TMUX_CAPTURE_ENTRY_CRITERIA = Object.freeze([
  'no state writes',
  'no pane lifecycle mutations',
  'no task/report/PlanRun mutations',
  'parity with TMUX_PANE_SNAPSHOT_FORMAT',
  'timeout and tmux-unavailable failure classes',
  'compact no-leak diagnostics',
  'rollback/default-disable without hidden TypeScript parser fallback ambiguity',
])
const MIGRATION_ORDER = Object.freeze([
  'architecture gate',
  'tmux snapshot capture',
  'worker lifecycle primitives',
  'state repository',
  'task/report/PlanRun transitions',
  'team panel view-model generation',
  'package/release verification helpers',
])
const RELEASE_PACKAGE_GUARDS = Object.freeze([
  'no npm version',
  'no npm publish',
  'no tag or release creation',
  'no GitHub release assets',
  'no second-platform approval',
  'no signing release gate',
  'no package-manager native delivery outside approved embedded layout',
  'no go.mod or go.sum',
  'no package lockfiles',
  'no lifecycle hooks or postinstall downloads',
  'no runtime go build',
])
const goControlPlaneExpansionGate = Object.freeze({
  schemaVersion: GO_CONTROL_PLANE_EXPANSION_SCHEMA_VERSION,
  theme: GO_CONTROL_PLANE_EXPANSION_THEME,
  packageVersion: PACKAGE_VERSION,
  activeAdr: ACTIVE_ADR,
  supersededAdrs: SUPERSEDED_ADRS,
  status: EXPANSION_STATUS,
  targetArchitecture: TARGET_ARCHITECTURE,
  firstImplementationSlice: FIRST_IMPLEMENTATION_SLICE,
  facadeResponsibilities: FACADE_RESPONSIBILITIES,
  allowedFutureGoCapabilities: ALLOWED_FUTURE_GO_CAPABILITIES,
  preservedProductSemantics: PRESERVED_PRODUCT_SEMANTICS,
  tmuxCaptureEntryCriteria: TMUX_CAPTURE_ENTRY_CRITERIA,
  migrationOrder: MIGRATION_ORDER,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  runtimeControlPlaneMigratedInThisSlice: false,
  packageReleaseApproved: false,
  packageVersionChanged: false,
  tagReleaseApproved: false,
})

module.exports = {
  ACTIVE_ADR,
  ALLOWED_FUTURE_GO_CAPABILITIES,
  EXPANSION_STATUS,
  FACADE_RESPONSIBILITIES,
  FIRST_IMPLEMENTATION_SLICE,
  GO_CONTROL_PLANE_EXPANSION_SCHEMA_VERSION,
  GO_CONTROL_PLANE_EXPANSION_THEME,
  MIGRATION_ORDER,
  PACKAGE_VERSION,
  PRESERVED_PRODUCT_SEMANTICS,
  RELEASE_PACKAGE_GUARDS,
  SUPERSEDED_ADRS,
  TARGET_ARCHITECTURE,
  TMUX_CAPTURE_ENTRY_CRITERIA,
  goControlPlaneExpansionGate,
}
