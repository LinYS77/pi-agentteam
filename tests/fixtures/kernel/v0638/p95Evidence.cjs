const P95_EVIDENCE_SCHEMA_VERSION = 2
const P95_EVIDENCE_THEME = 'v0.6.38 p95 evidence reconciliation'
const P95_EVIDENCE_STATUS = 'post-fix-evidence-reconciled-not-release-ready'
const CURRENT_RELEASE_TARGET = 'v0.7.0 = core refactor + performance baseline + bug burn-down release'
const HISTORICAL_V05_CONTEXT = 'Historical v0.5 checkpoint naming is audit background only; it is not the current final target.'

const T115_PANEL_BASELINE_SOURCE = '/tmp/pi-agentteam-v0638-p95/team-panel-tmux-refresh-baseline.json'
const T116_PANEL_FIX_SOURCE = '/tmp/pi-agentteam-v0638-panel-fix-bench-leader-review.json'
const T116_PANEL_FIX_SHA256 = '5f8755729d43cc35063770f3067e7d98f4f0340cdc3b26e8bed3c6934335e2e0'

const RAW_ARTIFACTS = Object.freeze([
  Object.freeze({
    id: 'env-metadata',
    phase: 'T115 pre-fix baseline',
    path: '/tmp/pi-agentteam-v0638-p95/env-metadata.json',
    sha256: 'ae8a7fe090f8467a14e18767cb297b8a4a8b571078fe12a27713595fd3f9ac5f',
    parse: 'ok',
  }),
  Object.freeze({
    id: 'team-read-model-baseline',
    phase: 'T115 pre-fix baseline',
    path: '/tmp/pi-agentteam-v0638-p95/team-read-model-baseline.json',
    sha256: '1eb60acdbe7af022de9ea810ce19e402b801dd82828bf0a096c974e1775ab69a',
    parse: 'ok',
  }),
  Object.freeze({
    id: 'team-panel-tmux-refresh-baseline',
    phase: 'T115 pre-fix baseline',
    path: T115_PANEL_BASELINE_SOURCE,
    sha256: '882294237465b9f93d47bce85dc3d61832251d2a041625eda865d40c33b7eb12',
    parse: 'ok',
  }),
  Object.freeze({
    id: 'team-panel-direct-refresh-postfix-leader-review',
    phase: 'T116 post-fix direct refresh',
    path: T116_PANEL_FIX_SOURCE,
    sha256: T116_PANEL_FIX_SHA256,
    parse: 'ok',
  }),
])

const ENV_METADATA = Object.freeze({
  date: '2026-06-23T02:17:53.663Z',
  git: 'dc13417',
  node: 'v24.9.0',
  npm: '11.7.0',
  uname: 'Linux root123-AS-4124GS-TNR 5.19.0-32-generic #33~22.04.1-Ubuntu SMP PREEMPT_DYNAMIC Mon Jan 30 17:03:34 UTC 2 x86_64 x86_64 x86_64 GNU/Linux',
  cpu: Object.freeze({
    source: 'node:os',
    model: 'AMD EPYC 7402 24-Core Processor',
    logicalCpus: 96,
    arch: 'x64',
    platform: 'linux',
  }),
  piAgentteamProfile: '1',
  agentteamBenchFixture: 'baseline',
  piAgentteamHome: 'bench-created temporary home under os.tmpdir; removed by bench scripts',
  warmupIterations: 1,
  measuredIterations: 5,
})

const NO_LEAK_MARKERS = Object.freeze([
  'BENCH_STATE_READ_MODEL_FULL_BODY_SENTINEL_SHOULD_NOT_LEAK',
  'BENCH_PANEL_TMUX_V0415_FULL_BODY_SENTINEL_SHOULD_NOT_LEAK',
  'MailboxMessage.text',
  'TaskReport.text',
  'FULL_BODY_SENTINEL',
  'PROFILE_FULL_BODY_SENTINEL',
  'V0638_RC_FULL_TEXT_SENTINEL_DO_NOT_LEAK',
])

const UNCHANGED_STATE_RECONCILIATION = Object.freeze({
  gateId: 'unchanged-state-no-repeated-request-render',
  preFix: Object.freeze({
    taskId: 'T115',
    status: 'fail',
    source: T115_PANEL_BASELINE_SOURCE,
    reason: 'requestRender activity was still present during unchanged cache-hit/no-diff measured refreshes.',
    observed: Object.freeze({
      attached: Object.freeze({ requestRenderCount: 12, cacheHitCount: 5, diffChangedCount: 0 }),
      global: Object.freeze({ requestRenderCount: 6, cacheHitCount: 5, diffChangedCount: 0 }),
    }),
  }),
  postFix: Object.freeze({
    taskId: 'T116',
    status: 'pass',
    inputPath: 'direct r refresh',
    source: T116_PANEL_FIX_SOURCE,
    sha256: T116_PANEL_FIX_SHA256,
    observed: Object.freeze({
      attached: Object.freeze({ requestRenderCount: 0, cacheHitCount: 5, diffChangedCount: 0 }),
      global: Object.freeze({ requestRenderCount: 0, cacheHitCount: 5, diffChangedCount: 0 }),
    }),
  }),
  currentScopeLimit: 'Post-fix pass is limited to deterministic unchanged-state direct-refresh evidence; it does not prove manual RC or missing p95 gates.',
})

const COVERED_GATES = Object.freeze([
  Object.freeze({
    id: 'attached-team-warm-refresh-data-load-p95',
    status: 'pass',
    metric: 'attached.panel.dataLoadMs.p95',
    threshold: Object.freeze({ kind: 'p95-ms-lte', value: 100, unit: 'ms' }),
    observed: 8,
    observedUnit: 'ms',
    source: T116_PANEL_FIX_SOURCE,
  }),
  Object.freeze({
    id: 'attached-team-warm-refresh-render-p95',
    status: 'pass',
    metric: 'attached.panel.renderMs.p95',
    threshold: Object.freeze({ kind: 'p95-ms-lte', value: 16, unit: 'ms' }),
    observed: 2,
    observedUnit: 'ms',
    source: T116_PANEL_FIX_SOURCE,
  }),
  Object.freeze({
    id: 'attached-team-warm-refresh-tmux-command-count',
    status: 'pass',
    metric: 'attached.tmux.commandCount',
    threshold: Object.freeze({ kind: 'count-lte', value: 1, unit: 'commands per measured attached refresh batch' }),
    observed: 0,
    observedUnit: 'commands',
    source: T116_PANEL_FIX_SOURCE,
  }),
  Object.freeze({
    id: 'global-team-warm-refresh-data-load-p95',
    status: 'pass',
    metric: 'global.panel.dataLoadMs.p95',
    threshold: Object.freeze({ kind: 'p95-ms-lte', value: 200, unit: 'ms' }),
    observed: 19,
    observedUnit: 'ms',
    source: T116_PANEL_FIX_SOURCE,
  }),
  Object.freeze({
    id: 'global-team-warm-refresh-snapshot-policy',
    status: 'pass',
    metric: 'global.tmux.commandNames plus global.tmux.commandCount normalized to measured iterations',
    threshold: Object.freeze({ kind: 'policy', value: 'one list-panes snapshot per measured global refresh; no fan-out', unit: 'policy' }),
    observed: Object.freeze({ commandCount: 5, measuredIterations: 5, commandNames: Object.freeze(['list-panes']) }),
    observedUnit: 'policy',
    source: T116_PANEL_FIX_SOURCE,
  }),
  Object.freeze({
    id: 'unchanged-state-no-repeated-request-render',
    status: 'pass',
    metric: 'direct r refresh attached/global requestRenderCount with cacheHitCount and diffChangedCount under unchanged measured refreshes',
    threshold: Object.freeze({ kind: 'semantic-invariant', value: 'no repeated requestRender growth for unchanged state after the initial mounted panel', unit: 'invariant' }),
    observed: UNCHANGED_STATE_RECONCILIATION.postFix.observed,
    observedUnit: 'counter-set',
    source: T116_PANEL_FIX_SOURCE,
  }),
])

const SUPPORTING_STATE_READ_MODEL = Object.freeze({
  source: '/tmp/pi-agentteam-v0638-p95/team-read-model-baseline.json',
  panelDataLoadP95Ms: 4,
  panelReadModelP95Ms: 2,
  fsStoreReadP95Ms: 0.18957996368408203,
  fsStoreParseP95Ms: 0.671779990196228,
  fsStoreLockCount: 0,
  tmuxCommandCount: 0,
})

const NOT_COVERED_GATES = Object.freeze([
  Object.freeze({
    id: 'task-message-report-action-normal-p95',
    status: 'not-covered-by-existing-bench',
    reason: 'Existing benches do not time create/assign/send/receive/report_done/report_blocked app-owned action handling under a normal mailbox fixture.',
  }),
  Object.freeze({
    id: 'task-message-report-action-large-mailbox-p95',
    status: 'not-covered-by-existing-bench',
    reason: 'Existing benches do not time task/message/report actions under large mailbox/report indexes.',
  }),
  Object.freeze({
    id: 'fsstore-lock-wait-p95',
    status: 'not-covered-by-existing-bench',
    reason: 'Existing state/read-model bench has fsStore.byKind.lock.count=0; Slice 3 requires non-zero representative lock timing before pass/fail.',
  }),
  Object.freeze({
    id: 'data-change-render-debounce-rate',
    status: 'not-covered-by-existing-bench',
    reason: 'Existing benches do not provide timestamped semantic data-change render/requestRender rate evidence.',
  }),
  Object.freeze({
    id: 'spawn-bookkeeping-p95',
    status: 'not-covered-by-existing-bench',
    reason: 'Existing benches do not time AgentTeam-owned spawn bookkeeping separately from external pi/tmux/LLM startup.',
  }),
])

const p95Evidence = Object.freeze({
  schemaVersion: P95_EVIDENCE_SCHEMA_VERSION,
  theme: P95_EVIDENCE_THEME,
  releaseTarget: CURRENT_RELEASE_TARGET,
  historicalV05Context: HISTORICAL_V05_CONTEXT,
  status: P95_EVIDENCE_STATUS,
  ready: false,
  releaseReadyClaim: false,
  provesAllP95Gates: false,
  manualRcPassed: false,
  runtimeBehaviorChanged: false,
  packageVersionChanged: false,
  tagCreated: false,
  npmPublished: false,
  nativeWorkPerformed: false,
  defaultGoApproved: false,
  defaultResolverApproved: false,
  fallbackDeletionApproved: false,
  signingApproved: false,
  secondPlatformApproved: false,
  rawArtifacts: RAW_ARTIFACTS,
  envMetadata: ENV_METADATA,
  noLeak: Object.freeze({
    status: 'pass',
    markers: NO_LEAK_MARKERS,
    rawFullBodiesCheckedIn: false,
  }),
  unchangedStateReconciliation: UNCHANGED_STATE_RECONCILIATION,
  coveredGates: COVERED_GATES,
  supportingStateReadModel: SUPPORTING_STATE_READ_MODEL,
  notCoveredGates: NOT_COVERED_GATES,
  recommendation: 'Do not claim v0.7 release readiness. Historical v0.5 checkpoint naming remains audit background only; missing harnesses remain for task/message/report action p95, large mailbox p95, fsStore lock wait p95, data-change debounce rate, and spawn bookkeeping p95. Manual operator RC remains separate.',
})

module.exports = {
  COVERED_GATES,
  CURRENT_RELEASE_TARGET,
  ENV_METADATA,
  HISTORICAL_V05_CONTEXT,
  NO_LEAK_MARKERS,
  NOT_COVERED_GATES,
  P95_EVIDENCE_SCHEMA_VERSION,
  P95_EVIDENCE_STATUS,
  P95_EVIDENCE_THEME,
  RAW_ARTIFACTS,
  SUPPORTING_STATE_READ_MODEL,
  T115_PANEL_BASELINE_SOURCE,
  T116_PANEL_FIX_SHA256,
  T116_PANEL_FIX_SOURCE,
  UNCHANGED_STATE_RECONCILIATION,
  p95Evidence,
}
