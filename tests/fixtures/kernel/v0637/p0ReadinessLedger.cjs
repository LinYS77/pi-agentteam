const P0_READINESS_LEDGER_SCHEMA_VERSION = 1
const P0_READINESS_LEDGER_THEME = 'v0.6.37 v0.5 release readiness burn-down'
const P0_READINESS_LEDGER_SLICE = 'Slice 1 — P0 bug inventory & severity ledger'
const V05_RELEASE_TARGET = 'v0.5.0 = core refactor + performance baseline + bug burn-down release'

const P0 = 'P0'
const GREEN = 'green'
const WATCH = 'watch'
const BLOCKED = 'blocked'
const UNKNOWN = 'unknown'

const P0_READINESS_STATUSES = Object.freeze([GREEN, WATCH, BLOCKED, UNKNOWN])
const P0_READINESS_SEVERITIES = Object.freeze([P0])

const P0_READINESS_LEDGER_ROW_IDS = Object.freeze([
  'identity-name-safety',
  'config-bootstrap',
  'state-read-model',
  'tmux-snapshot-adapter',
  'team-panel-refresh-render',
  'worker-report-prompt-contract',
  'task-report-watchdog-lifecycle',
  'planrun',
  'public-output-full-text-boundaries',
  'performance-baseline-p95-gates',
  'manual-rc-smoke',
  'validation-runner-caveat',
  'release-tag-default-go-native-governance',
])

const STOP_GATES = Object.freeze([
  'no tag creation, tag movement, tag push, git push, release creation, or implied tag/release without an explicit leader decision',
  'no npm version, npm publish, package release, install-source approval, or release asset work',
  'no native package, native helper delivery, signing, cosign, SLSA, security attestation, or second-platform work',
  'no default Go, default resolver, go-cutover defaulting, go-packaged-preview defaulting, TypeScript fallback deletion, or compactReadModelFingerprint cutover',
  'no production TypeScript, Go, command, tool, workflow, readiness, package metadata, package file, or runtime behavior change',
])

function row(id, status, affectedSeam, existingEvidence, releaseImpact, requiredProof) {
  return Object.freeze({
    id,
    severity: P0,
    status,
    affectedSeam,
    existingEvidence: Object.freeze(existingEvidence),
    releaseImpact,
    requiredProof,
    releaseReadyClaim: false,
  })
}

const p0ReadinessRows = Object.freeze([
  row(
    'identity-name-safety',
    GREEN,
    'Team identity, project/name scoping, unsafe slug rejection, legacy teams/- quarantine, and session binding compatibility.',
    Object.freeze([
      'docs/agentteam方案书.md',
      'tests/suites/name-safety.cjs',
      'tests/suites/zz-team-identity-v042.cjs',
      'tests/suites/zzzzzzzzzzz-team-identity-v0413.cjs',
      'tests/suites/session-binding-paths.cjs',
    ]),
    'A regression can attach users to the wrong team, recreate unsafe teams/-, or break legacy team recovery boundaries.',
    'Keep the focused identity/name-safety suites passing in the final validation set and include an RC check with legacy teams/- plus scoped duplicate names.',
  ),
  row(
    'config-bootstrap',
    GREEN,
    'Config v1 bootstrap, legacy agentModels compatibility, diagnostics, migration dry-run, and effective model source surfaces.',
    Object.freeze([
      'docs/agentteam方案书.md',
      'config.example.json',
      'tests/suites/config-diagnostics.cjs',
      'tests/suites/zzzzzzzzzz-config-v0412.cjs',
    ]),
    'A regression can make workers boot with the wrong model, hide invalid config, or write legacy-only config during v0.5 rollout.',
    'Keep config diagnostics and v0.4.12 bootstrap suites passing, then include config init/show/validate/migrate --dry-run in the RC smoke.',
  ),
  row(
    'state-read-model',
    GREEN,
    'File-backed state repositories, compact panel sidecars/read model, current-team lookup, profiling fields, and full-body boundary preservation.',
    Object.freeze([
      'docs/agentteam方案书.md',
      'docs/perf/v0.4.14-state-read-model-baseline.md',
      'tests/suites/zzzzzzzzzzzz-state-read-model-v0414.cjs',
      'tests/suites/zzzzz-state-runtime-repository-v047.cjs',
      'tests/suites/zzzz-team-panel-read-model-v045.cjs',
      'tests/bench/team-read-model-baseline.cjs',
    ]),
    'A regression can reintroduce full team scans, leak full mailbox/report bodies into panel paths, or erase profiling needed for burn-down decisions.',
    'Keep state/read-model suites and the deterministic baseline runnable; final release proof still needs the performance p95 gate row to move out of watch.',
  ),
  row(
    'tmux-snapshot-adapter',
    GREEN,
    'Tmux snapshot parsing, light-vs-force reconcile boundaries, pane binding preservation on unknown snapshots, and bounded global refresh work.',
    Object.freeze([
      'docs/agentteam方案书.md',
      'docs/perf/v0.4.15-team-panel-tmux-refresh.md',
      'tests/suites/tmux-snapshot-v043.cjs',
      'tests/suites/go-kernel-tmux-snapshot-parser.cjs',
      'tests/suites/zzzzzzzzzzzzzz-team-panel-tmux-v0415.cjs',
    ]),
    'A regression can make /team warm refresh expensive, mark live workers stale/error, or break pane recovery while workers are active.',
    'Keep snapshot/parser and v0.4.15 tmux-panel suites passing, then include an RC check that ordinary refresh does not invoke force reconcile.',
  ),
  row(
    'team-panel-refresh-render',
    GREEN,
    '/team data source, fingerprint/cache-hit render loop, in-place refresh/sync actions, layout stability, and profiling counters.',
    Object.freeze([
      'docs/agentteam方案书.md',
      'docs/perf/v0.4.15-team-panel-tmux-refresh.md',
      'tests/suites/team-panel-flicker-characterization.cjs',
      'tests/suites/zzz-team-panel-cache-v044.cjs',
      'tests/suites/zzzzzzzzzzzzzz-team-panel-tmux-bench-v0415.cjs',
      'tests/bench/team-panel-tmux-refresh-v0415.cjs',
    ]),
    'A regression can bring back panel flicker, close/reopen behavior, unbounded requestRender loops, or full-body panel leaks during active work.',
    'Keep panel cache/flicker/bench guards passing and include an RC observation with worker output while /team remains mounted.',
  ),
  row(
    'worker-report-prompt-contract',
    GREEN,
    'Worker system prompt, task-bound assignment delivery, bridge turn prompt, and explicit report_done/report_blocked completion contract.',
    Object.freeze([
      'docs/agentteam方案书.md',
      'tests/suites/worker-report-prompt-contract.cjs',
    ]),
    'A regression can let workers finish in natural language only, leaving leader review and PlanRun chains without durable TaskReports.',
    'Keep the worker report prompt contract suite passing and include a manual worker task in RC that ends through report_done or report_blocked.',
  ),
  row(
    'task-report-watchdog-lifecycle',
    WATCH,
    'TaskReport creation, owner-to-leader action requests, idle/open/no-report visibility, watchdog nudges, and report lifecycle diagnostics.',
    Object.freeze([
      'docs/agentteam方案书.md',
      'tests/suites/zzzzzz-worker-report-watchdog-v048.cjs',
      'tests/suites/task-history.cjs',
    ]),
    'A regression can strand completed worker work without leader-visible reports or mutate task state directly from non-leader reports.',
    'Run the watchdog suite in final validation and add RC proof that an idle owner with an open assigned task/no report is visible and nudgeable.',
  ),
  row(
    'planrun',
    WATCH,
    'Approved PlanRun progression, waiting_review pauses, recovery/limits/failure semantics, and compact-only plan/report surfaces.',
    Object.freeze([
      'docs/agentteam方案书.md',
      'tests/suites/zzzzzzz-planrun-v049.cjs',
      'tests/suites/zzzzzzzz-planrun-v0410.cjs',
      'tests/suites/zzzzzzzzz-planrun-v0411.cjs',
    ]),
    'A regression can make approved plans stall after report review, bypass leader gates, or leak full report/mailbox bodies into compact views.',
    'Run PlanRun focused suites and include an RC two-step approved plan that advances only after leader review without autopilot or peer-triggered work.',
  ),
  row(
    'public-output-full-text-boundaries',
    GREEN,
    'Public vocabulary, compact task/message/report projections, /team no-body behavior, agentteam_receive mailbox boundary, and task report full-text boundary.',
    Object.freeze([
      'docs/agentteam方案书.md',
      'tests/suites/public-output-leak-guards.cjs',
      'tests/suites/public-surface-facade.cjs',
      'tests/suites/zzzzzzzzzzzz-state-read-model-v0414.cjs',
      'tests/suites/zzzzzz-worker-report-watchdog-v048.cjs',
      'tests/suites/zzzzzzz-planrun-v049.cjs',
    ]),
    'A regression can expose internal lifecycle tokens or full message/report bodies through public docs, prompts, /team, or compact task history.',
    'Keep public leak guards and compact full-body sentinel suites passing, then spot-check /team and task history output in RC.',
  ),
  row(
    'performance-baseline-p95-gates',
    WATCH,
    'State/read-model and team-panel/tmux deterministic baselines, profiling fields, p50/p95 output shape, and future release target gate.',
    Object.freeze([
      'docs/perf/v0.4.14-state-read-model-baseline.md',
      'docs/perf/v0.4.15-team-panel-tmux-refresh.md',
      'tests/bench/team-read-model-baseline.cjs',
      'tests/bench/team-panel-tmux-refresh-v0415.cjs',
      'tests/suites/profiling-harness.cjs',
    ]),
    'Without final p95 target thresholds and fresh RC numbers, v0.5 cannot prove the performance baseline requirement beyond repeatable measurement.',
    'Define final v0.5 p95 thresholds, rerun both deterministic benches under PI_AGENTTEAM_PROFILE=1, and record pass/fail numbers in a later slice.',
  ),
  row(
    'manual-rc-smoke',
    UNKNOWN,
    'End-to-end RC smoke across create/spawn/send/receive/report/task history/PlanRun/team panel/config on a clean or backed-up PI_AGENTTEAM_HOME.',
    Object.freeze([
      'docs/agentteam方案书.md',
      'docs/baseline-v0.5.0.md',
      'No current v0.6.37 manual RC smoke artifact is recorded in this Slice 1 ledger.',
    ]),
    'Without a current manual RC smoke, local static guards cannot prove real pi/tmux behavior, worker reporting discipline, or operator rollback instructions.',
    'Create and execute a manual RC smoke checklist in a later authorized slice, recording environment, commands, expected observations, and failures.',
  ),
  row(
    'validation-runner-caveat',
    WATCH,
    'Focused validation command selection, tests/run.cjs suite-name caveat, direct suite invocation, node --check coverage, and npm test breadth.',
    Object.freeze([
      'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy-checkpoint.md',
      'tests/run.cjs',
    ]),
    'Using tests/run.cjs with a suite argument can accidentally run unrelated suites or hide that the focused guard was not invoked as intended.',
    'Use node --check for new .cjs files and a direct require-based focused guard invocation; run npm test only as broad validation, not the focused proof.',
  ),
  row(
    'release-tag-default-go-native-governance',
    BLOCKED,
    'Release/tag/default-Go/native governance, package release ownership, default resolver approval, fallback deletion, signing, and platform policy.',
    Object.freeze([
      'docs/baseline-v0.5.0.md',
      'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy-checkpoint.md',
      'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs',
      'tests/suites/go-kernel-v0636-default-go-readiness-ledger.cjs',
      'tests/fixtures/kernel/v0636/tagGateLedger.cjs',
      'tests/suites/go-kernel-v0636-release-tag-debt-governance.cjs',
    ]),
    'Release/tag/default/native work remains outside this slice and requires explicit leader decisions; current repo facts do not clear those gates.',
    'Keep all STOP gates in force until the leader explicitly authorizes separate release/tag/package/default-Go/native/signing/platform work and records the decision.',
  ),
])

const p0ReadinessLedger = Object.freeze({
  schemaVersion: P0_READINESS_LEDGER_SCHEMA_VERSION,
  theme: P0_READINESS_LEDGER_THEME,
  releaseTarget: V05_RELEASE_TARGET,
  slice: P0_READINESS_LEDGER_SLICE,
  ready: false,
  defaultGoGovernanceContinuation: false,
  runtimeBehaviorChanged: false,
  packageVersionChanged: false,
  tagCreated: false,
  npmPublished: false,
  nativeWorkPerformed: false,
  stopGates: STOP_GATES,
  rows: p0ReadinessRows,
})

module.exports = {
  BLOCKED,
  GREEN,
  P0,
  P0_READINESS_LEDGER_ROW_IDS,
  P0_READINESS_LEDGER_SCHEMA_VERSION,
  P0_READINESS_LEDGER_SLICE,
  P0_READINESS_LEDGER_THEME,
  P0_READINESS_SEVERITIES,
  P0_READINESS_STATUSES,
  STOP_GATES,
  UNKNOWN,
  V05_RELEASE_TARGET,
  WATCH,
  p0ReadinessLedger,
  p0ReadinessRows,
}
