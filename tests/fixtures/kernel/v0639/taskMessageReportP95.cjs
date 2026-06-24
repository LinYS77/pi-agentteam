const TASK_MESSAGE_REPORT_P95_SCHEMA_VERSION = 1
const TASK_MESSAGE_REPORT_P95_THEME = 'v0.6.39/v0.6.40 task/message/report p95 coverage and large-mailbox optimization'
const CURRENT_RELEASE_TARGET = 'v0.7.0 = core refactor + performance baseline + bug burn-down release'
const STATUS = 'focused-task-message-report-p95-large-mailbox-optimized-not-release-ready'

const RAW_ARTIFACT = Object.freeze({
  id: 'task-message-report-action-p95',
  path: '/tmp/pi-agentteam-v0639-task-message-report-p95-latest.json',
  checkedIn: false,
  parse: 'ok',
  sha256: '45f9e0e2c375433c35a0036f3b68f2aa9f008a1336a2dce001e17e76830796cd',
  preservation: 'raw sanitized timing JSON stays under /tmp and is not checked in',
})

const ENV_METADATA_REQUIREMENTS = Object.freeze([
  'node --version',
  'npm --version when available',
  'git rev-parse --short HEAD when available',
  'OS/platform/arch and CPU facts',
  'PI_AGENTTEAM_PROFILE value when set',
  'AGENTTEAM_BENCH_WARMUP and AGENTTEAM_BENCH_ITERATIONS or defaults',
  'clean temporary PI_AGENTTEAM_HOME path under /tmp/pi-agentteam-v0639-task-message-report-p95.*',
])

const NO_LEAK_MARKERS = Object.freeze([
  'V0639_TASK_MESSAGE_REPORT_FULL_TEXT_SENTINEL_DO_NOT_LEAK',
  'MailboxMessage.text',
  'TaskReport.text',
  'worker transcript',
  'screenshot',
  'state archive',
  'BEGIN PRIVATE KEY',
  'raw hosted record',
])

const FIXTURE_PROFILES = Object.freeze({
  normal: Object.freeze({
    profile: 'normal',
    shape: 'single active team with team-lead, 6 seeded workers, measured action loop assigned to one worker, normal mailbox size before measured actions',
    warmup: 1,
    measured: 3,
    thresholdMs: 50,
  }),
  largeMailbox: Object.freeze({
    profile: 'large-mailbox',
    shape: 'same team with >=500 tasks and >=2000 mailbox items seeded into compact file-backed state before measured action loop',
    warmup: 1,
    measured: 3,
    thresholdMs: 150,
  }),
})

const COVERED_ACTIONS = Object.freeze({
  agentteamTask: Object.freeze(['create', 'assign', 'close', 'block', 'unblock', 'report_done', 'report_blocked']),
  agentteamSend: Object.freeze(['assignment', 'question', 'inform']),
  agentteamReceive: Object.freeze(['markRead=false', 'markRead=true']),
})

const OBSERVED_GATES = Object.freeze([
  Object.freeze({
    id: 'task-message-report-action-normal-p95',
    status: 'pass',
    metric: 'taskMessageReportAction.normal.p95',
    threshold: Object.freeze({ kind: 'p95-ms-lte', value: 50, unit: 'ms' }),
    observed: 30.434,
    observedUnit: 'ms',
    measuredActions: 51,
    fixtureProfile: 'normal',
    evidenceCommand: 'PI_AGENTTEAM_PROFILE=1 node scripts/verify-v0639-task-message-report-p95.cjs --out /tmp/pi-agentteam-v0639-task-message-report-p95-latest.json',
  }),
  Object.freeze({
    id: 'task-message-report-action-large-mailbox-p95',
    status: 'pass',
    metric: 'taskMessageReportAction.largeMailbox.p95',
    threshold: Object.freeze({ kind: 'p95-ms-lte', value: 150, unit: 'ms' }),
    observed: 106.863,
    observedUnit: 'ms',
    measuredActions: 51,
    fixtureProfile: 'large-mailbox',
    evidenceCommand: 'PI_AGENTTEAM_PROFILE=1 node scripts/verify-v0639-task-message-report-p95.cjs --out /tmp/pi-agentteam-v0639-task-message-report-p95-latest.json',
  }),
])

const REPORT_ONLY_SEMANTICS = Object.freeze([
  Object.freeze({ id: 'report_done-worker-report-only', status: 'covered', expectation: 'worker report_done leaves task open; leader close changes task to done' }),
  Object.freeze({ id: 'report_blocked-worker-report-only', status: 'covered', expectation: 'worker report_blocked leaves task open; leader block changes task to blocked; leader unblock returns task to open' }),
])

const NOT_COVERED_GATES = Object.freeze([
  Object.freeze({ id: 'fsstore-lock-wait-p95', status: 'not-covered-by-this-slice', reason: 'v0.6.39 task/message/report action harness records action duration p95 only; representative fsStore lock wait remains separate.' }),
  Object.freeze({ id: 'data-change-render-debounce-rate', status: 'not-covered-by-this-slice', reason: 'No mounted /team semantic data-change render-rate evidence is collected by this action harness.' }),
  Object.freeze({ id: 'spawn-bookkeeping-p95', status: 'not-covered-by-this-slice', reason: 'Spawn is used only to create fixture members; the harness does not time spawn bookkeeping as a p95 gate.' }),
  Object.freeze({ id: 'manual-rc-smoke', status: 'not-covered-by-this-slice', reason: 'This is a non-interactive registered-tool harness, not a manual operator RC run.' }),
])

const taskMessageReportP95Evidence = Object.freeze({
  schemaVersion: TASK_MESSAGE_REPORT_P95_SCHEMA_VERSION,
  theme: TASK_MESSAGE_REPORT_P95_THEME,
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
    rawFullBodiesCheckedIn: false,
    rawTimingJsonCheckedIn: false,
  }),
  fixtureProfiles: FIXTURE_PROFILES,
  coveredActions: COVERED_ACTIONS,
  observedGates: OBSERVED_GATES,
  reportOnlySemantics: REPORT_ONLY_SEMANTICS,
  notCoveredGates: NOT_COVERED_GATES,
  recommendation: 'Use this as the focused task/message/report p95 coverage and large-mailbox optimization evidence slice only. Do not claim v0.7 release readiness, manual RC pass, all p95 gates pass, default-Go/native/package approval, or release/tag/npm authority.',
})

module.exports = {
  COVERED_ACTIONS,
  OBSERVED_GATES,
  CURRENT_RELEASE_TARGET,
  ENV_METADATA_REQUIREMENTS,
  FIXTURE_PROFILES,
  NO_LEAK_MARKERS,
  NOT_COVERED_GATES,
  RAW_ARTIFACT,
  REPORT_ONLY_SEMANTICS,
  STATUS,
  TASK_MESSAGE_REPORT_P95_SCHEMA_VERSION,
  TASK_MESSAGE_REPORT_P95_THEME,
  taskMessageReportP95Evidence,
}
