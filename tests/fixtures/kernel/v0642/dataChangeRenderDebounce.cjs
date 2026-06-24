const DATA_CHANGE_RENDER_DEBOUNCE_SCHEMA_VERSION = 1
const DATA_CHANGE_RENDER_DEBOUNCE_THEME = 'v0.6.42-data-change-render-debounce-p95'
const CURRENT_RELEASE_TARGET = 'v0.6.42'
const STATUS = 'pass-focused-gate-not-release-ready'

const RAW_ARTIFACT = Object.freeze({
  path: '/tmp/pi-agentteam-v0642-data-change-render-debounce-latest.json',
  parse: 'ok',
  sha256: '1379175288f03d13c0c6b801485afb47859285b08ff730b1c55423d3aa2fb9a3',
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
  'burstChanges',
  'debounceMs',
  'settleMs',
])

const NO_LEAK_MARKERS = Object.freeze([
  'V0642_DATA_CHANGE_RENDER_DEBOUNCE_FULL_TEXT_SENTINEL_DO_NOT_LEAK',
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

const FIXTURE_PROFILE = Object.freeze({
  profile: 'mounted-attached-team-panel-semantic-burst',
  warmup: 1,
  measured: 5,
  burstChanges: 8,
  debounceMs: 250,
  settleMs: 320,
  thresholdPerSec: 4,
  mountedPanel: true,
  semanticDataChangeSource: 'clean-temp task read-model mutations followed by mounted panel invalidate()',
  directRefreshInput: 'r',
  appOwnedTime: 'mounted /team panel input/layout refresh scheduling for semantic data changes in a clean temporary PI_AGENTTEAM_HOME; excludes LLM/provider, tmux, terminal rendering host, image captures, operator time, and raw terminal logs',
  rawStateArchived: false,
  fullBodiesIncluded: false,
  imageCapturesIncluded: false,
})

const BASELINE_OBSERVATION = Object.freeze({
  status: 'fail-without-runtime-patch',
  reason: 'mounted panel invalidate() was a no-op and render scheduling only coalesced same-tick requests; semantic data-change invalidations did not have configured minRefreshMs debounce coverage',
  expectedDefaultMinRefreshMs: 250,
})

const OPTIMIZATION = Object.freeze({
  changedPath: 'teamPanel.ts',
  summary: 'Mount-time semantic invalidations now use the existing ui.teamPanel.minRefreshMs debounce setting, while manual r refresh remains immediate and cancels any pending semantic debounce.',
  defaultMinRefreshMs: 250,
  directRefreshPreserved: true,
  noOpRefreshNoRenderPreserved: true,
  compactFullTextBoundariesChanged: false,
  packageVersionChanged: false,
  defaultGoChanged: false,
  nativeWorkPerformed: false,
})

const OBSERVED_GATES = Object.freeze([
  Object.freeze({
    id: 'data-change-render-debounce-rate',
    status: 'pass',
    metric: 'teamPanel.semanticDataChange.renderRequestsPerSecond.p95',
    observed: 3.021,
    observedUnit: 'renders/sec',
    threshold: { kind: 'p95-rate-lte', value: 4, unit: 'renders/sec' },
    measuredBursts: 5,
  }),
])

const BEHAVIOR_CHECKS = Object.freeze({
  mountedPanelCaptured: true,
  semanticDiffRecordedEachBurst: true,
  manualDirectRefresh: {
    preserved: true,
    renderRequests: 1,
    diffChangedCount: 1,
  },
  manualNoopRefresh: {
    cacheHitNoRender: true,
    renderRequests: 0,
    cacheHitCount: 1,
  },
})

const NOT_COVERED_GATES = Object.freeze([
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
    id: 'spawn-bookkeeping-p95',
    status: 'not-covered-by-this-slice',
    note: 'Spawn bookkeeping p95 needs a separate app-owned spawn harness.',
  }),
  Object.freeze({
    id: 'manual-rc-smoke',
    status: 'not-covered-by-this-slice',
    note: 'Manual RC requires separate true operator/model evidence.',
  }),
])

const dataChangeRenderDebounceEvidence = Object.freeze({
  schemaVersion: DATA_CHANGE_RENDER_DEBOUNCE_SCHEMA_VERSION,
  theme: DATA_CHANGE_RENDER_DEBOUNCE_THEME,
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
  baselineObservation: BASELINE_OBSERVATION,
  optimization: OPTIMIZATION,
  observedGates: OBSERVED_GATES,
  behaviorChecks: BEHAVIOR_CHECKS,
  notCoveredGates: NOT_COVERED_GATES,
  recommendation: 'Use this as the v0.6.42 focused data-change render debounce p95 coverage and minimal panel debounce evidence slice only. Do not claim v0.7 release readiness, manual RC pass, all p95 gates pass, default-Go/native/package approval, or release/tag/npm authority.',
})

module.exports = {
  BASELINE_OBSERVATION,
  BEHAVIOR_CHECKS,
  CURRENT_RELEASE_TARGET,
  DATA_CHANGE_RENDER_DEBOUNCE_SCHEMA_VERSION,
  DATA_CHANGE_RENDER_DEBOUNCE_THEME,
  ENV_METADATA_REQUIREMENTS,
  FIXTURE_PROFILE,
  NO_LEAK_MARKERS,
  NOT_COVERED_GATES,
  OBSERVED_GATES,
  OPTIMIZATION,
  RAW_ARTIFACT,
  STATUS,
  dataChangeRenderDebounceEvidence,
}
