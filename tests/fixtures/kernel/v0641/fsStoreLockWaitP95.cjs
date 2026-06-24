const FSSTORE_LOCK_WAIT_P95_SCHEMA_VERSION = 1
const FSSTORE_LOCK_WAIT_P95_THEME = 'v0.6.41 fsStore lock-wait p95 coverage'
const CURRENT_RELEASE_TARGET = 'v0.7.0 = core refactor + performance baseline + bug burn-down release'
const STATUS = 'focused-fsstore-lock-wait-p95-covered-not-release-ready'

const RAW_ARTIFACT = Object.freeze({
  id: 'fsstore-lock-wait-p95',
  path: '/tmp/pi-agentteam-v0641-fsstore-lock-wait-p95-latest.json',
  checkedIn: false,
  parse: 'ok',
  sha256: '481deab8087569babf1806541a423214a310b446b1c5e72dc0f7724a9a5f0968',
  preservation: 'sanitized timing JSON stays under /tmp and is not checked in',
})

const ENV_METADATA_REQUIREMENTS = Object.freeze([
  'node --version',
  'npm --version when available',
  'git rev-parse --short HEAD when available',
  'OS/platform/arch and CPU facts',
  'PI_AGENTTEAM_PROFILE value when set',
  'AGENTTEAM_BENCH_WARMUP and AGENTTEAM_BENCH_ITERATIONS or defaults',
  'AGENTTEAM_LOCK_HOLD_MS or default',
  'clean temporary PI_AGENTTEAM_HOME path under /tmp/pi-agentteam-v0641-fsstore-lock-wait-p95.*',
])

const NO_LEAK_MARKERS = Object.freeze([
  'V0641_FSSTORE_LOCK_WAIT_FULL_TEXT_SENTINEL_DO_NOT_LEAK',
  'MailboxMessage.text',
  'TaskReport.text',
  'worker transcript',
  'screenshot',
  'state archive',
  'raw state archive',
  'BEGIN PRIVATE KEY',
  'raw hosted record',
])

const FIXTURE_PROFILE = Object.freeze({
  profile: 'contended-json-read-write',
  shape: 'clean temp PI_AGENTTEAM_HOME with one compact JSON file; a child process holds the fsStore lock briefly while the parent measures withFileLock lockWaitMs and performs compact read/write/parse work',
  warmup: 5,
  measured: 30,
  lockHolderMs: 8,
  thresholdMs: 25,
})

const OBSERVED_GATES = Object.freeze([
  Object.freeze({
    id: 'fsstore-lock-wait-p95',
    status: 'pass',
    metric: 'fsStore.lockWaitMs.p95',
    threshold: Object.freeze({ kind: 'p95-ms-lte', value: 25, unit: 'ms' }),
    observed: 10.644,
    observedUnit: 'ms',
    measuredLocks: 30,
    fixtureProfile: 'contended-json-read-write',
    evidenceCommand: 'PI_AGENTTEAM_PROFILE=1 node scripts/verify-v0641-fsstore-lock-wait-p95.cjs --out /tmp/pi-agentteam-v0641-fsstore-lock-wait-p95-latest.json',
  }),
])

const BASELINE_OBSERVATION = Object.freeze({
  id: 'fsstore-lock-wait-p95-baseline-before-fix',
  status: 'fail',
  observed: 25.343,
  thresholdMs: 25,
  reason: 'Previous fixed 25ms lock retry interval made contended lock acquisition p95 slightly exceed the <=25ms gate.',
})

const OPTIMIZATION = Object.freeze({
  id: 'fsstore-lock-retry-granularity',
  status: 'applied',
  changedPath: 'state/fsStore.ts',
  summary: 'Reduce fsStore lock retry sleep from 25ms to 5ms while preserving file lock, stale lock cleanup, timeout, atomic write, and persisted-state semantics.',
})

const NOT_COVERED_GATES = Object.freeze([
  Object.freeze({ id: 'data-change-render-debounce-rate', status: 'not-covered-by-this-slice', reason: 'No mounted /team semantic data-change render-rate evidence is collected by this fsStore lock-wait harness.' }),
  Object.freeze({ id: 'spawn-bookkeeping-p95', status: 'not-covered-by-this-slice', reason: 'Worker spawn bookkeeping is outside the fsStore lock-wait fixture.' }),
  Object.freeze({ id: 'manual-rc-smoke', status: 'not-covered-by-this-slice', reason: 'This is a non-interactive clean-temp fsStore timing harness, not a manual operator RC run.' }),
])

const fsStoreLockWaitP95Evidence = Object.freeze({
  schemaVersion: FSSTORE_LOCK_WAIT_P95_SCHEMA_VERSION,
  theme: FSSTORE_LOCK_WAIT_P95_THEME,
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
  noLeak: Object.freeze({
    status: 'covered',
    markers: NO_LEAK_MARKERS,
    rawStateArchivesCheckedIn: false,
    rawFullBodiesCheckedIn: false,
    rawTimingJsonCheckedIn: false,
  }),
  fixtureProfile: FIXTURE_PROFILE,
  baselineObservation: BASELINE_OBSERVATION,
  optimization: OPTIMIZATION,
  observedGates: OBSERVED_GATES,
  notCoveredGates: NOT_COVERED_GATES,
  recommendation: 'Use this as the v0.6.41 focused fsStore lock-wait p95 coverage and retry-granularity optimization evidence slice only. Do not claim v0.7 release readiness, manual RC pass, all p95 gates pass, default-Go/native/package approval, or release/tag/npm authority.',
})

module.exports = {
  BASELINE_OBSERVATION,
  CURRENT_RELEASE_TARGET,
  ENV_METADATA_REQUIREMENTS,
  FIXTURE_PROFILE,
  FSSTORE_LOCK_WAIT_P95_SCHEMA_VERSION,
  FSSTORE_LOCK_WAIT_P95_THEME,
  NO_LEAK_MARKERS,
  NOT_COVERED_GATES,
  OBSERVED_GATES,
  OPTIMIZATION,
  RAW_ARTIFACT,
  STATUS,
  fsStoreLockWaitP95Evidence,
}
