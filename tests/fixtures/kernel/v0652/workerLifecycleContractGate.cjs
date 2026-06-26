const WORKER_LIFECYCLE_CONTRACT_GATE_SCHEMA_VERSION = 1
const WORKER_LIFECYCLE_CONTRACT_GATE_THEME = 'v0.6.52 worker lifecycle contract gate'
const PACKAGE_VERSION = '0.6.8'
const ACTIVE_RUNTIME_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint'])
const FUTURE_CAPABILITY = 'workerLifecycle'
const FUTURE_JSONRPC_METHOD = 'workerLifecycle'
const CONTRACT_STATUS = 'design-only-not-runtime-capability'
const HELPER_CONNECTION_MODEL = Object.freeze({
  status: 'per-call-helper-initially-accepted',
  longLivedHelperStatus: 'deferred-until-state-panel-or-high-frequency-paths',
  prerequisitesForLongLivedHelper: Object.freeze([
    'bounded request queue and backpressure policy',
    'timeout and cancellation propagation per request',
    'crash detection and restart budget',
    'health preflight and version/capability renegotiation',
    'no raw stdout/stderr/cwd/stack leakage in diagnostics',
  ]),
})
const FUTURE_WORKER_LIFECYCLE_OPERATIONS = Object.freeze([
  Object.freeze({
    operation: 'inspectPane',
    phase: 'read-only-first',
    mutatesTmux: false,
    authority: 'typescript-governed-explicit-adapter-call',
  }),
  Object.freeze({
    operation: 'listAgentTeamPanes',
    phase: 'read-only-first',
    mutatesTmux: false,
    authority: 'typescript-governed-explicit-adapter-call',
  }),
  Object.freeze({
    operation: 'wakePane',
    phase: 'later-mutating',
    mutatesTmux: true,
    authority: 'typescript-governed-explicit-adapter-call',
  }),
  Object.freeze({
    operation: 'syncPaneLabels',
    phase: 'later-mutating',
    mutatesTmux: true,
    authority: 'typescript-governed-explicit-adapter-call',
  }),
  Object.freeze({
    operation: 'createTeammatePane',
    phase: 'later-high-risk',
    mutatesTmux: true,
    authority: 'typescript-governed-explicit-adapter-call',
  }),
  Object.freeze({
    operation: 'killPane',
    phase: 'last-highest-risk',
    mutatesTmux: true,
    authority: 'typescript-governed-explicit-adapter-call',
  }),
])
const FUTURE_JSONRPC_REQUEST_SHAPE = Object.freeze({
  jsonrpc: '2.0',
  method: FUTURE_JSONRPC_METHOD,
  params: Object.freeze({
    operation: '<one of future worker lifecycle operations>',
    governanceToken: '<opaque TS-issued call boundary marker>',
    paneId: '<required for pane-scoped operations>',
    teamId: '<compact identity only; no full state payload>',
    requestId: '<TS-generated id for diagnostics and cancellation>',
  }),
})
const FACADE_AUTHORITY = Object.freeze([
  'TypeScript/pi facade remains public product entry',
  'tools and commands remain TS-owned',
  'hooks and renderers remain TS-owned',
  'TUI shell remains TS-owned',
  'leader-gated task governance remains TS-owned',
  'Go worker lifecycle may only be invoked through explicit TypeScript adapter seam',
  'Go helper must not autonomously spawn, wake, label, create, or kill panes',
])
const PRESERVED_BOUNDARIES = Object.freeze([
  'no worker-spawns-worker',
  'no hidden scheduler/autopilot/background orchestration',
  'no peer report auto-task creation',
  'no state repository migration',
  'no task/report/PlanRun migration',
  'no team panel view-model migration',
  'no release/package verification migration',
  'no native artifact path or binary rename',
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
  'no runtime go build',
])
const workerLifecycleContractGate = Object.freeze({
  schemaVersion: WORKER_LIFECYCLE_CONTRACT_GATE_SCHEMA_VERSION,
  theme: WORKER_LIFECYCLE_CONTRACT_GATE_THEME,
  packageVersion: PACKAGE_VERSION,
  activeRuntimeCapabilities: ACTIVE_RUNTIME_CAPABILITIES,
  futureCapability: FUTURE_CAPABILITY,
  futureJsonRpcMethod: FUTURE_JSONRPC_METHOD,
  contractStatus: CONTRACT_STATUS,
  runtimeCapabilityActive: false,
  goHandlerActive: false,
  runtimeBehaviorChangedFromV0651: false,
  workerLifecycleMigrated: false,
  stateRepositoryMigrated: false,
  taskReportPlanRunMigrated: false,
  teamPanelViewModelMigrated: false,
  releasePackageVerificationMigrated: false,
  nativeArtifactRenamed: false,
  packageVersionChanged: false,
  packageReleaseApproved: false,
  npmVersionChanged: false,
  npmPublished: false,
  tagReleaseCreated: false,
  futureWorkerLifecycleOperations: FUTURE_WORKER_LIFECYCLE_OPERATIONS,
  futureJsonRpcRequestShape: FUTURE_JSONRPC_REQUEST_SHAPE,
  helperConnectionModel: HELPER_CONNECTION_MODEL,
  facadeAuthority: FACADE_AUTHORITY,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
})

module.exports = {
  ACTIVE_RUNTIME_CAPABILITIES,
  CONTRACT_STATUS,
  FACADE_AUTHORITY,
  FUTURE_CAPABILITY,
  FUTURE_JSONRPC_METHOD,
  FUTURE_JSONRPC_REQUEST_SHAPE,
  FUTURE_WORKER_LIFECYCLE_OPERATIONS,
  HELPER_CONNECTION_MODEL,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  RELEASE_PACKAGE_GUARDS,
  WORKER_LIFECYCLE_CONTRACT_GATE_SCHEMA_VERSION,
  WORKER_LIFECYCLE_CONTRACT_GATE_THEME,
  workerLifecycleContractGate,
}
