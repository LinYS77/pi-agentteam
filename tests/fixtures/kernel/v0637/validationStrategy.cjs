const VALIDATION_STRATEGY_SCHEMA_VERSION = 1
const VALIDATION_STRATEGY_THEME = 'v0.6.37 v0.5 release validation strategy'
const VALIDATION_STRATEGY_SLICE = 'Slice 6 — Regression suite stabilization / validation strategy'
const V05_RELEASE_TARGET = 'v0.5.0 = core refactor + performance baseline + bug burn-down release'
const STRATEGY_DEFINED = 'strategy-defined'

const CATEGORY_IDS = Object.freeze([
  'syntax-node-check',
  'focused-v0637-guards-direct',
  'broad-regression-npm-test',
  'typecheck-boundary-diff',
  'performance-bench-evidence',
  'manual-rc-smoke-evidence',
])

const KNOWN_CAVEATS = Object.freeze([
  Object.freeze({
    id: 'tests-run-suite-argument-not-focused-proof',
    status: 'unresolved-runner-caveat',
    summary: 'tests/run.cjs <suite> must not be represented as focused proof unless a future runner fix is implemented and tested.',
    policy: 'Use direct require-based invocation of the focused guard with helpers.extRoot=process.cwd() for Slice 1-8 proof; npm test remains broad regression only.',
  }),
  Object.freeze({
    id: 'tools-state-pane-health-mismatch',
    status: 'unresolved-watch',
    summary: 'Prior broad npm test attempt failed at tests/suites/tools-state.cjs:577 with actual pane lost vs expected initial task busy via bridge delivery.',
    policy: 'Record and triage this broad-regression blocker/watch item before any release-readiness claim; do not attribute it to docs-only v0.6.37 slices unless evidence proves causality.',
  }),
])

const FAILURE_TRIAGE_POLICY = Object.freeze([
  'A new syntax or focused v0.6.37 guard failure blocks the current slice until fixed or explicitly reported blocked.',
  'A broad npm test failure is not focused proof failure by itself, but it must be recorded, triaged, and leader-reviewed before any release-readiness claim.',
  'Do not silently ignore broad regression failures as unrelated; document command, first failing suite/file/line, observed vs expected output, and whether the failure is pre-existing or newly introduced.',
  'Bench timing output must be preserved as evidence for later p95 review, but local timing numbers alone do not approve release readiness.',
  'Manual RC evidence must be collected through the Slice 5 checklist in a later authorized execution, not by this Slice 6 strategy definition.',
])

const COMMON_STOP_CONDITIONS = Object.freeze([
  'STOP if tests/run.cjs <suite> is presented as focused proof without a future runner fix and dedicated runner test.',
  'STOP if broad npm test failure is ignored, hidden, or used as release-green evidence without leader triage.',
  'STOP if this strategy claims broad suite green without an actual successful npm test run recorded for the reviewed revision.',
  'STOP if local benchmark numbers are treated as Slice 3 p95 pass/fail approval without preserved evidence and reviewer decision.',
  'STOP if manual RC smoke is represented as executed or passed by this Slice 6 docs/tests-only strategy work.',
  'STOP if validation work creates tags/releases, runs npm version/publish, changes package metadata, approves native/default-Go/default-resolver/fallback-deletion/signing/second-platform work, or changes production runtime behavior.',
])

function category(input) {
  return Object.freeze({
    id: input.id,
    status: STRATEGY_DEFINED,
    purpose: input.purpose,
    commands: Object.freeze(input.commands),
    scope: input.scope,
    proofKind: input.proofKind,
    focusedProof: Boolean(input.focusedProof),
    broadRegression: Boolean(input.broadRegression),
    requiredForRelease: input.requiredForRelease,
    requiredForCurrentSlice: input.requiredForCurrentSlice,
    knownCaveats: Object.freeze(input.knownCaveats),
    stopConditions: Object.freeze([...COMMON_STOP_CONDITIONS, ...input.stopConditions]),
    releaseReadyClaim: false,
  })
}

const validationCategories = Object.freeze([
  category({
    id: 'syntax-node-check',
    purpose: 'Catch syntax errors in new or changed v0.6.37 CommonJS fixtures and suites before focused invocation.',
    commands: Object.freeze(['node --check tests/fixtures/kernel/v0637/<changed>.cjs', 'node --check tests/suites/go-kernel-v0637-v05-<changed>.cjs']),
    scope: 'New/changed v0637 .cjs fixtures and suites, usually all v0637 fixtures/suites when the shared readiness doc or guards change.',
    proofKind: 'syntax',
    focusedProof: true,
    broadRegression: false,
    requiredForRelease: true,
    requiredForCurrentSlice: true,
    knownCaveats: Object.freeze(['Syntax success does not prove behavior, p95 pass, broad suite health, or manual RC execution.']),
    stopConditions: Object.freeze(['STOP if any changed v0637 fixture/suite fails node --check.']),
  }),
  category({
    id: 'focused-v0637-guards-direct',
    purpose: 'Provide focused proof for Slice 1-8 docs/fixtures/guards without relying on tests/run.cjs suite-name behavior.',
    commands: Object.freeze(['node - <<\'NODE\'\nconst suites = [\n  \'./tests/suites/go-kernel-v0637-v05-p0-readiness-ledger.cjs\',\n  \'./tests/suites/go-kernel-v0637-v05-performance-baseline-inventory.cjs\',\n  \'./tests/suites/go-kernel-v0637-v05-p95-release-gates.cjs\',\n  \'./tests/suites/go-kernel-v0637-v05-hot-path-burndown-candidates.cjs\',\n  \'./tests/suites/go-kernel-v0637-v05-manual-rc-smoke-checklist.cjs\',\n  \'./tests/suites/go-kernel-v0637-v05-validation-strategy.cjs\',\n  \'./tests/suites/go-kernel-v0637-v05-task-report-planrun-reliability.cjs\',\n  \'./tests/suites/go-kernel-v0637-v05-final-readiness-checkpoint-docs.cjs\',\n]\nasync function main() {\n  for (const rel of suites) await require(rel).run({ helpers: { extRoot: process.cwd() } })\n}\nmain().catch(error => { console.error(error); process.exit(1) })\nNODE']),
    scope: 'Focused v0.6.37 release readiness guards only; invokes exported suite.run with helpers.extRoot=process.cwd().',
    proofKind: 'focused-guard',
    focusedProof: true,
    broadRegression: false,
    requiredForRelease: true,
    requiredForCurrentSlice: true,
    knownCaveats: Object.freeze(['Do not replace this with tests/run.cjs <suite>.', 'Focused guards prove docs/fixtures/invariants only, not runtime optimization, p95 pass, broad regression health, or manual RC pass.']),
    stopConditions: Object.freeze(['STOP if any Slice 1-8 focused guard fails.', 'STOP if tests/run.cjs <suite> is substituted as focused proof.']),
  }),
  category({
    id: 'broad-regression-npm-test',
    purpose: 'Run the repository broad regression suite through the configured test runner.',
    commands: Object.freeze(['npm test']),
    scope: 'All suites loaded by tests/run.cjs in its configured order; broad regression only, not focused proof for a specific Slice 1-8 guard.',
    proofKind: 'broad-regression',
    focusedProof: false,
    broadRegression: true,
    requiredForRelease: true,
    requiredForCurrentSlice: false,
    knownCaveats: Object.freeze(['tests/run.cjs <suite> is not focused proof.', 'Prior broad run hit tests/suites/tools-state.cjs:577 pane-health mismatch: actual pane lost vs expected initial task busy via bridge delivery.', 'If npm test is not run for a slice, report that explicitly.']),
    stopConditions: Object.freeze(['STOP release-readiness claim if npm test fails until leader-reviewed triage records blocker/watch/disposition.', 'STOP if npm test failure is silently ignored as unrelated.']),
  }),
  category({
    id: 'typecheck-boundary-diff',
    purpose: 'Validate TypeScript type surface, import boundaries, and whitespace/diff hygiene.',
    commands: Object.freeze(['npm run typecheck', 'npm run -s check:boundaries', 'git diff --check']),
    scope: 'TypeScript project type checking, repository import boundary policy, and diff whitespace checks.',
    proofKind: 'type-boundary-diff',
    focusedProof: false,
    broadRegression: true,
    requiredForRelease: true,
    requiredForCurrentSlice: true,
    knownCaveats: Object.freeze(['Docs/tests-only slices normally must at least run git diff --check; typecheck/boundary are broader release checks and may be deferred only with explicit report note.']),
    stopConditions: Object.freeze(['STOP if git diff --check fails.', 'STOP release-readiness claim if typecheck or boundary checks fail without leader-reviewed triage.']),
  }),
  category({
    id: 'performance-bench-evidence',
    purpose: 'Collect deterministic benchmark JSON for state/read-model and team-panel/tmux evidence.',
    commands: Object.freeze(['npm run --silent bench:state-read-model', 'npm run --silent bench:team-panel-tmux']),
    scope: 'Deterministic benchmark harnesses from Slice 2 and p95 gate inputs from Slice 3; outputs should be preserved as reviewer evidence when used for gate decisions.',
    proofKind: 'performance-benchmark-evidence',
    focusedProof: false,
    broadRegression: false,
    requiredForRelease: true,
    requiredForCurrentSlice: false,
    knownCaveats: Object.freeze(['Bench note remains baseline only unless later p95 evidence artifact records pass/fail.', 'Local timing numbers are not release approval.', 'Use --silent when redirecting JSON so npm banners do not contaminate output.']),
    stopConditions: Object.freeze(['STOP if benchmark JSON leaks full mailbox/report body sentinels.', 'STOP if local bench timing is claimed as p95 release pass without accepted evidence artifact and reviewer decision.']),
  }),
  category({
    id: 'manual-rc-smoke-evidence',
    purpose: 'Capture real pi/tmux/operator flow evidence that static tests and deterministic benches cannot cover.',
    commands: Object.freeze(['Execute the Slice 5 checklist from docs/perf/v0.6.37-v0.5-release-readiness-burndown.md using a clean temporary or backed-up PI_AGENTTEAM_HOME']),
    scope: 'Manual RC smoke checklist execution in a later authorized task; includes config, team identity, tmux spawn, task/report/PlanRun, /team, full-text boundaries, legacy teams/-, release governance absence, and cleanup evidence.',
    proofKind: 'manual-rc-evidence',
    focusedProof: false,
    broadRegression: false,
    requiredForRelease: true,
    requiredForCurrentSlice: false,
    knownCaveats: Object.freeze(['Slice 6 does not execute manual smoke.', 'Manual smoke pass does not replace Slice 3 p95 evidence or approve npm/tag/release/default-Go/native work.', 'Do not use real PI_AGENTTEAM_HOME unless backed up and recorded.']),
    stopConditions: Object.freeze(['STOP if manual smoke uses real user state without backup.', 'STOP if raw full mailbox/report bodies, screenshots, logs, or state archives are checked in without separate approval.']),
  }),
])

const validationStrategy = Object.freeze({
  schemaVersion: VALIDATION_STRATEGY_SCHEMA_VERSION,
  theme: VALIDATION_STRATEGY_THEME,
  releaseTarget: V05_RELEASE_TARGET,
  slice: VALIDATION_STRATEGY_SLICE,
  currentStatus: STRATEGY_DEFINED,
  ready: false,
  broadSuiteGreenClaimed: false,
  releaseReadyClaim: false,
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
  testsRunSuiteArgumentFocusedProofAllowed: false,
  categoryIds: CATEGORY_IDS,
  categories: validationCategories,
  knownCaveats: KNOWN_CAVEATS,
  failureTriagePolicy: FAILURE_TRIAGE_POLICY,
  stopConditions: COMMON_STOP_CONDITIONS,
  validationCaveat: 'Slice 6 defines validation strategy only; it does not fix tests/run.cjs behavior, does not mark npm test green, and does not claim release readiness.',
})

module.exports = {
  CATEGORY_IDS,
  COMMON_STOP_CONDITIONS,
  FAILURE_TRIAGE_POLICY,
  KNOWN_CAVEATS,
  STRATEGY_DEFINED,
  V05_RELEASE_TARGET,
  VALIDATION_STRATEGY_SCHEMA_VERSION,
  VALIDATION_STRATEGY_SLICE,
  VALIDATION_STRATEGY_THEME,
  validationCategories,
  validationStrategy,
}
