const SPAWN_BOOKKEEPING_P95_SCHEMA_VERSION = 1
const SPAWN_BOOKKEEPING_P95_THEME = 'v0.6.42-spawn-bookkeeping-p95'
const CURRENT_RELEASE_TARGET = 'v0.6.42'
const STATUS = 'pass-focused-gate-not-release-ready'

const RAW_ARTIFACT = Object.freeze({
  path: '/tmp/pi-agentteam-v0642-spawn-bookkeeping-p95-latest.json',
  parse: 'ok',
  sha256: '59d3f80112dd378426473eb74057087aa54d8fdbe428f822db8ca25e5d309a53',
  checkedIn: false,
})

const ENV_METADATA_REQUIREMENTS = Object.freeze([
  'date',
  'node',
  'platform',
  'arch',
  'cpu.model',
  'cpu.logicalCpus',
  'PI_AGENTTEAM_PROFILE',
  'PI_AGENTTEAM_HOME redacted as clean temp home',
  'warmupIterations',
  'measuredIterations',
])

const NO_LEAK_MARKERS = Object.freeze([
  'V0642_SPAWN_BOOKKEEPING_FULL_TEXT_SENTINEL_DO_NOT_LEAK',
  'MailboxMessage.text',
  'TaskReport.text',
  'worker transcript',
  'terminal raw log',
  'screenshot',
  'state archive',
  'raw state archive',
  'BEGIN PRIVATE KEY',
  'raw hosted record',
])

const REQUIRED_SEGMENTS = Object.freeze([
  'validate-config-classify',
  'build-prompt-command',
  'reserve-worker-state',
  'write-session-context',
  'commit-pane-created',
  'resolve-pane-binding-commit',
  'final-worker-status',
])

const FIXTURE_PROFILE = Object.freeze({
  profile: 'file-backed-worker-spawn-bookkeeping-stubbed-external-boundaries',
  warmup: 2,
  measured: 12,
  thresholdMs: 100,
  requiredSegments: REQUIRED_SEGMENTS,
  appOwnedTime: 'worker spawn validation/config/prompt/session/team-state/pane-binding/final-status bookkeeping segments in a clean temporary PI_AGENTTEAM_HOME; excludes real provider/LLM/operator time, external tmux pane creation latency, terminal rendering, and bridge wait latency',
  visiblePaneSemanticsStubbed: true,
  bridgeLeasePublishedByHarness: true,
  rawStateArchived: false,
  fullBodiesIncluded: false,
  imageCapturesIncluded: false,
})

const INSTRUMENTATION = Object.freeze({
  changedPaths: ['core/profiling.ts', 'runtime/profiling.ts', 'tools/workerSpawnService.ts'],
  summary: 'Adds spawn bookkeeping profiling events around app-owned worker spawn validation/config, prompt/command build, state reservation, session context write, pane binding commits, optional initial delivery bookkeeping, and final worker status updates.',
  externalBoundariesExcluded: ['real provider/LLM time', 'operator time', 'external tmux pane creation latency', 'terminal rendering', 'bridge wait latency'],
  visiblePaneSemanticsPreserved: true,
  launchProvenanceInherited: true,
  compactFullTextBoundariesChanged: false,
  packageVersionChanged: false,
  defaultGoChanged: false,
  nativeWorkPerformed: false,
})

const OBSERVED_GATES = Object.freeze([
  Object.freeze({
    id: 'spawn-bookkeeping-p95',
    status: 'pass',
    metric: 'workerSpawn.bookkeepingMs.p95',
    observed: 21.995,
    observedUnit: 'ms',
    threshold: { kind: 'p95-ms-lte', value: 100, unit: 'ms' },
    measuredSpawns: 12,
  }),
])

const BEHAVIOR_CHECKS = Object.freeze({
  spawnBookkeepingEventsRecorded: true,
  requiredSegmentsCovered: true,
  visiblePaneSemanticsPreserved: true,
  launchProvenanceInherited: true,
  bridgeReadyObserved: true,
})

const NOT_COVERED_GATES = Object.freeze([
  Object.freeze({
    id: 'data-change-render-debounce-rate',
    status: 'covered-by-v0.6.42-data-change-not-this-slice',
    note: 'This slice does not re-measure mounted panel semantic data-change render rate.',
  }),
  Object.freeze({
    id: 'fsstore-lock-wait-p95',
    status: 'covered-by-v0.6.41-not-this-slice',
    note: 'This slice does not re-measure fsStore lock wait.',
  }),
  Object.freeze({
    id: 'task-message-report-action-p95',
    status: 'covered-by-v0.6.39-v0.6.40-not-this-slice',
    note: 'This slice does not re-measure task/message/report action paths.',
  }),
  Object.freeze({
    id: 'manual-rc-smoke',
    status: 'not-covered-by-this-slice',
    note: 'Manual RC requires separate true operator/model evidence.',
  }),
])

const spawnBookkeepingP95Evidence = Object.freeze({
  schemaVersion: SPAWN_BOOKKEEPING_P95_SCHEMA_VERSION,
  theme: SPAWN_BOOKKEEPING_P95_THEME,
  releaseTarget: CURRENT_RELEASE_TARGET,
  status: STATUS,
  ready: false,
  releaseReadyClaim: false,
  provesAllP95Gates: false,
  manualRcPassed: false,
  runtimeBehaviorChanged: true,
  packageVersionChanged: false,
  tagCreated: false,
  npmPublished: false,
  nativeWorkPerformed: false,
  defaultGoApproved: false,
  defaultResolverApproved: false,
  fallbackDeletionApproved: false,
  signingApproved: false,
  secondPlatformApproved: false,
  rawArtifact: RAW_ARTIFACT,
  envMetadataRequirements: ENV_METADATA_REQUIREMENTS,
  noLeak: {
    markers: NO_LEAK_MARKERS,
    rawStateArchivesCheckedIn: false,
    rawFullBodiesCheckedIn: false,
    rawTimingJsonCheckedIn: false,
    screenshotsCheckedIn: false,
    terminalRawLogsCheckedIn: false,
  },
  fixtureProfile: FIXTURE_PROFILE,
  instrumentation: INSTRUMENTATION,
  observedGates: OBSERVED_GATES,
  behaviorChecks: BEHAVIOR_CHECKS,
  notCoveredGates: NOT_COVERED_GATES,
  recommendation: 'Use this as the v0.6.42 focused spawn bookkeeping p95 coverage and app-owned profiling evidence slice only. Do not claim v0.7 release readiness, manual RC pass, all p95 gates pass, default-Go/native/package approval, or release/tag/npm authority.',
})

module.exports = {
  BEHAVIOR_CHECKS,
  CURRENT_RELEASE_TARGET,
  ENV_METADATA_REQUIREMENTS,
  FIXTURE_PROFILE,
  INSTRUMENTATION,
  NO_LEAK_MARKERS,
  NOT_COVERED_GATES,
  OBSERVED_GATES,
  RAW_ARTIFACT,
  REQUIRED_SEGMENTS,
  SPAWN_BOOKKEEPING_P95_SCHEMA_VERSION,
  SPAWN_BOOKKEEPING_P95_THEME,
  STATUS,
  spawnBookkeepingP95Evidence,
}
