const FINAL_CHECKPOINT_SCHEMA_VERSION = 1
const FINAL_CHECKPOINT_THEME = 'v0.6.37 v0.5 final release-readiness checkpoint'
const FINAL_CHECKPOINT_SLICE = 'Slice 8 — Final v0.6.37 release-readiness checkpoint'
const V05_RELEASE_TARGET = 'v0.5.0 = core refactor + performance baseline + bug burn-down release'
const CHECKPOINT_STATUS = 'checkpoint-complete-not-release-ready'

const SLICE_SUMMARIES = Object.freeze([
  Object.freeze({
    slice: 1,
    title: 'P0 readiness ledger',
    status: 'ledger-defined',
    output: 'P0 seams, existing evidence, release impact, required proof, and STOP gates are captured as docs/fixture/guard evidence.',
    docs: Object.freeze(['docs/perf/v0.6.37-v0.5-release-readiness-burndown.md']),
    fixtures: Object.freeze(['tests/fixtures/kernel/v0637/p0ReadinessLedger.cjs']),
    guards: Object.freeze(['tests/suites/go-kernel-v0637-v05-p0-readiness-ledger.cjs']),
  }),
  Object.freeze({
    slice: 2,
    title: 'Performance baseline inventory',
    status: 'baseline-inventory-only',
    output: 'Existing deterministic benchmark commands, output schemas, metadata, and no-leak expectations are inventoried without p95 pass/fail interpretation.',
    docs: Object.freeze(['docs/perf/v0.6.37-v0.5-release-readiness-burndown.md']),
    fixtures: Object.freeze(['tests/fixtures/kernel/v0637/performanceBaselineInventory.cjs']),
    guards: Object.freeze(['tests/suites/go-kernel-v0637-v05-performance-baseline-inventory.cjs']),
  }),
  Object.freeze({
    slice: 3,
    title: 'p95 release gate definitions',
    status: 'defined-not-yet-proven',
    output: 'Auditable v0.5 p95 gate definitions, thresholds, fallback rules, evidence metadata, and STOP conditions are defined but not passed.',
    docs: Object.freeze(['docs/perf/v0.6.37-v0.5-release-readiness-burndown.md']),
    fixtures: Object.freeze(['tests/fixtures/kernel/v0637/p95ReleaseGates.cjs']),
    guards: Object.freeze(['tests/suites/go-kernel-v0637-v05-p95-release-gates.cjs']),
  }),
  Object.freeze({
    slice: 4,
    title: 'Focused hot-path burn-down candidates',
    status: 'proposed-not-started',
    output: 'Candidate matrix ranks hot paths and recommends panel-unchanged-state-render-suppression first, without implementing optimization or claiming p95 improvement.',
    docs: Object.freeze(['docs/perf/v0.6.37-v0.5-release-readiness-burndown.md']),
    fixtures: Object.freeze(['tests/fixtures/kernel/v0637/hotPathBurnDownCandidates.cjs']),
    guards: Object.freeze(['tests/suites/go-kernel-v0637-v05-hot-path-burndown-candidates.cjs']),
  }),
  Object.freeze({
    slice: 5,
    title: 'Manual RC smoke checklist',
    status: 'defined-not-executed',
    output: 'Clean-temp-home RC checklist is defined for config, identity, spawn, task/report, PlanRun, panel, full-text boundaries, governance absence, and cleanup; it is not executed.',
    docs: Object.freeze(['docs/perf/v0.6.37-v0.5-release-readiness-burndown.md']),
    fixtures: Object.freeze(['tests/fixtures/kernel/v0637/manualRcSmokeChecklist.cjs']),
    guards: Object.freeze(['tests/suites/go-kernel-v0637-v05-manual-rc-smoke-checklist.cjs']),
  }),
  Object.freeze({
    slice: 6,
    title: 'Validation strategy',
    status: 'strategy-defined',
    output: 'Validation categories, direct guard invocation policy, broad npm test caveat, and failure triage rules are defined without fixing runner behavior or claiming broad suite green.',
    docs: Object.freeze(['docs/perf/v0.6.37-v0.5-release-readiness-burndown.md']),
    fixtures: Object.freeze(['tests/fixtures/kernel/v0637/validationStrategy.cjs']),
    guards: Object.freeze(['tests/suites/go-kernel-v0637-v05-validation-strategy.cjs']),
  }),
  Object.freeze({
    slice: 7,
    title: 'Task/report/PlanRun release reliability map',
    status: 'mapped-not-proven',
    output: 'Task/report/PlanRun invariants are mapped for worker reports, leader review, full-text boundaries, PlanRun review/pause, peer handoff, and delegation/broadcast limits; final proof remains required.',
    docs: Object.freeze(['docs/perf/v0.6.37-v0.5-release-readiness-burndown.md']),
    fixtures: Object.freeze(['tests/fixtures/kernel/v0637/taskReportPlanRunReliability.cjs']),
    guards: Object.freeze(['tests/suites/go-kernel-v0637-v05-task-report-planrun-reliability.cjs']),
  }),
  Object.freeze({
    slice: 8,
    title: 'Final release-readiness checkpoint',
    status: CHECKPOINT_STATUS,
    output: 'Final reviewer-facing checkpoint summarizes Slice 1-7 evidence, GO/STOP matrix, unresolved blockers, validation status, package/runtime invariants, and next leader decisions without release-ready approval.',
    docs: Object.freeze(['docs/perf/v0.6.37-v0.5-release-readiness-burndown-checkpoint.md']),
    fixtures: Object.freeze(['tests/fixtures/kernel/v0637/finalReleaseReadinessCheckpoint.cjs']),
    guards: Object.freeze(['tests/suites/go-kernel-v0637-v05-final-readiness-checkpoint-docs.cjs']),
  }),
])

const GO_ITEMS = Object.freeze([
  Object.freeze({
    id: 'local-docs-tests-governance-evidence',
    decision: 'GO',
    scope: 'Local docs/tests/fixtures governance evidence for leader review only.',
    evidence: Object.freeze(['docs/perf/v0.6.37-v0.5-release-readiness-burndown.md', 'docs/perf/v0.6.37-v0.5-release-readiness-burndown-checkpoint.md', 'tests/fixtures/kernel/v0637/*.cjs', 'tests/suites/go-kernel-v0637-v05-*.cjs']),
    limit: 'Does not approve v0.5 release readiness, tag, npm publish, runtime optimization, default-Go/native/package/signing/platform work, or manual RC pass.',
  }),
  Object.freeze({
    id: 'focused-guards-direct-pass',
    decision: 'GO',
    scope: 'Focused Slice 1-8 guards can be validated through direct require-based invocation with helpers.extRoot=process.cwd().',
    evidence: Object.freeze(['node --check for v0637 .cjs fixtures/suites', 'direct require-based invocation of Slice 1-8 guards']),
    limit: 'Focused guards prove docs/fixtures/checkpoint invariants only; tests/run.cjs <suite> is not focused proof.',
  }),
  Object.freeze({
    id: 'burn-down-map-complete',
    decision: 'GO',
    scope: 'The v0.6.37 v0.5 readiness burn-down map is complete enough for leader review of known P0 seams, gates, candidates, manual RC plan, validation strategy, and reliability map.',
    evidence: Object.freeze(['Slice 1 P0 ledger', 'Slice 2 baseline inventory', 'Slice 3 p95 gate definitions', 'Slice 4 candidate matrix', 'Slice 5 manual RC checklist', 'Slice 6 validation strategy', 'Slice 7 reliability map', 'Slice 8 checkpoint']),
    limit: 'Completion of the map is not completion of the release evidence, p95 proof, broad regression triage, or manual RC execution.',
  }),
  Object.freeze({
    id: 'ts-pi-facade-authority-preserved',
    decision: 'GO',
    scope: 'Package/runtime governance facts remain unchanged and TypeScript/pi remains the product and control-plane facade.',
    evidence: Object.freeze(['package.json name pi-agentteam', 'package.json version 0.6.8', 'package.json pi.extensions ./index.ts', 'stable /team command and agentteam_* tool surface']),
    limit: 'Go remains bounded helper/kernel work only where separately authorized; no default-Go/default resolver approval is implied.',
  }),
])

const STOP_ITEMS = Object.freeze([
  Object.freeze({ id: 'not-v05-release-ready', reason: 'v0.6.37 is a readiness burn-down/checkpoint, not a v0.5 release-ready approval.' }),
  Object.freeze({ id: 'no-tag-release-git-push', reason: 'No git tag creation/movement/push, GitHub release, release asset, or git push is authorized.' }),
  Object.freeze({ id: 'no-npm-version-publish-package-release', reason: 'No npm version, npm publish, package release, install source approval, package metadata expansion, package artifact, or release bundle is permitted.' }),
  Object.freeze({ id: 'no-default-go-native-resolver', reason: 'No default-Go, default resolver, native package/helper delivery, go-cutover defaulting, go-packaged-preview defaulting, or normal-user native availability claim is authorized.' }),
  Object.freeze({ id: 'no-signing-security-second-platform', reason: 'No signing, cosign, SLSA, security attestation, signing material, platform matrix expansion, macOS, Windows, arm64, musl, or second-platform support is authorized.' }),
  Object.freeze({ id: 'no-fallback-deletion', reason: 'No TypeScript fallback deletion, compactReadModelFingerprint cutover, or default resolver fallback deletion is authorized.' }),
  Object.freeze({ id: 'no-runtime-optimization-implementation', reason: 'No production TypeScript/Go/runtime behavior, command/tool/readiness, workflow, or UI behavior change is authorized by Slice 8.' }),
  Object.freeze({ id: 'no-manual-rc-execution-claim', reason: 'The Slice 5 manual RC checklist remains defined-not-executed; no pass/fail smoke evidence is claimed.' }),
  Object.freeze({ id: 'no-p95-pass-claim', reason: 'The Slice 3 p95 gates remain defined-not-yet-proven; no benchmark/manual evidence proves pass/fail.' }),
  Object.freeze({ id: 'no-broad-npm-test-green-claim', reason: 'Broad npm test green is not claimed; known tests/suites/tools-state.cjs:577 pane-health mismatch remains unresolved unless separately triaged.' }),
  Object.freeze({ id: 'no-unresolved-pane-health-waiver', reason: 'No waiver is invented for the pane-health mismatch or any broad regression failure.' }),
])

const REMAINING_BLOCKERS = Object.freeze([
  Object.freeze({ id: 'manual-rc-not-executed', status: 'blocked', detail: 'Manual RC smoke checklist is defined but not executed; release readiness needs clean/backed-up PI_AGENTTEAM_HOME execution and compact evidence.' }),
  Object.freeze({ id: 'p95-gates-not-proven', status: 'blocked', detail: 'p95 gates are defined but not proven with preserved benchmark/manual artifacts, environment metadata, threshold comparison, fallback comparison if used, and reviewer decision.' }),
  Object.freeze({ id: 'broad-npm-test-pane-health-mismatch', status: 'blocked-watch', detail: 'Prior broad npm test failed at tests/suites/tools-state.cjs:577 with actual pane lost vs expected initial task busy via bridge delivery; no green claim or waiver exists.' }),
  Object.freeze({ id: 'hot-path-improvements-not-implemented', status: 'blocked', detail: 'Slice 4 candidates are proposed-not-started; no runtime optimization or p95 improvement is implemented.' }),
  Object.freeze({ id: 'release-tag-decisions-leader-gated', status: 'blocked', detail: 'Release, tag, npm, package, signing, platform, default-Go/default-resolver, fallback deletion, and native decisions remain leader/user gated.' }),
  Object.freeze({ id: 'default-go-native-remains-blocked', status: 'blocked', detail: 'Default-Go/default resolver/native/package work remains out of scope and blocked by prior governance requirements.' }),
  Object.freeze({ id: 'task-report-planrun-final-proof-required', status: 'watch', detail: 'Slice 7 reliability requirements are mapped but still require final validation and manual RC observations before release readiness.' }),
])

const NEXT_DECISIONS = Object.freeze([
  Object.freeze({ id: 'triage-broad-npm-test-mismatch', decisionOwner: 'leader', recommendation: 'Triage tests/suites/tools-state.cjs:577 pane-health mismatch under a separate task before any broad green or release-ready claim.' }),
  Object.freeze({ id: 'execute-manual-rc-clean-home', decisionOwner: 'leader', recommendation: 'Execute the Slice 5 manual RC smoke checklist in a clean temp or backed-up PI_AGENTTEAM_HOME, preserving compact sanitized evidence only.' }),
  Object.freeze({ id: 'collect-p95-evidence', decisionOwner: 'leader', recommendation: 'Collect fresh p95 benchmark/manual artifacts for Slice 3 gates with environment metadata and reviewed pass/fail decisions.' }),
  Object.freeze({ id: 'start-first-hot-path-candidate', decisionOwner: 'leader', recommendation: 'If implementation work is authorized, start panel-unchanged-state-render-suppression first under a separate runtime-change task with characterization tests.' }),
  Object.freeze({ id: 'defer-release-tag-npm-native-default-go', decisionOwner: 'leader', recommendation: 'Keep tag/release/npm/native/default-Go/default-resolver/package/signing/second-platform/fallback-deletion blocked until separately authorized.' }),
])

const VALIDATION_STATUS = Object.freeze([
  Object.freeze({ id: 'node-check-v0637-cjs', status: 'required-for-slice', command: 'node --check for all new/changed v0637 .cjs fixtures/suites', resultPolicy: 'Must pass before reporting Slice 8 done.' }),
  Object.freeze({ id: 'direct-slice-1-8-guards', status: 'required-for-slice', command: 'direct require-based invocation of Slice 1/2/3/4/5/6/7/8 guards with helpers.extRoot=process.cwd()', resultPolicy: 'Must pass; tests/run.cjs <suite> must not be claimed as focused proof.' }),
  Object.freeze({ id: 'git-diff-check', status: 'required-for-slice', command: 'git diff --check', resultPolicy: 'Must pass before reporting Slice 8 done.' }),
  Object.freeze({ id: 'npm-test', status: 'optional-broad-regression', command: 'npm test', resultPolicy: 'If not run, say not run. If run and tests/suites/tools-state.cjs:577 pane lost appears, report it exactly.' }),
])

const PACKAGE_RUNTIME_INVARIANTS = Object.freeze({
  packageName: 'pi-agentteam',
  packageVersion: '0.6.8',
  packageType: 'module',
  piExtensions: Object.freeze(['./index.ts']),
  stableCommandSurface: Object.freeze(['/team']),
  stableToolSurface: Object.freeze(['agentteam_create', 'agentteam_spawn', 'agentteam_send', 'agentteam_receive', 'agentteam_task', 'agentteam_planrun']),
  productFacade: 'TypeScript/pi remains the product and control-plane facade.',
  goAuthority: 'Go remains bounded helper/kernel work only where explicitly authorized by prior checkpoints; Slice 8 does not authorize default Go or runtime mode change.',
  packageMetadataChanged: false,
  productionRuntimeChanged: false,
  tagCreated: false,
  npmPublished: false,
  nativeWorkPerformed: false,
})

const finalReleaseReadinessCheckpoint = Object.freeze({
  schemaVersion: FINAL_CHECKPOINT_SCHEMA_VERSION,
  theme: FINAL_CHECKPOINT_THEME,
  slice: FINAL_CHECKPOINT_SLICE,
  releaseTarget: V05_RELEASE_TARGET,
  status: CHECKPOINT_STATUS,
  ready: false,
  releaseReadyClaim: false,
  docsTestsFixturesOnly: true,
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
  manualRcExecuted: false,
  p95GatesProven: false,
  broadNpmTestGreenClaim: false,
  paneHealthWaived: false,
  sliceSummaries: SLICE_SUMMARIES,
  goItems: GO_ITEMS,
  stopItems: STOP_ITEMS,
  remainingBlockers: REMAINING_BLOCKERS,
  nextDecisions: NEXT_DECISIONS,
  validationStatus: VALIDATION_STATUS,
  packageRuntimeInvariants: PACKAGE_RUNTIME_INVARIANTS,
})

module.exports = {
  CHECKPOINT_STATUS,
  FINAL_CHECKPOINT_SCHEMA_VERSION,
  FINAL_CHECKPOINT_SLICE,
  FINAL_CHECKPOINT_THEME,
  GO_ITEMS,
  NEXT_DECISIONS,
  PACKAGE_RUNTIME_INVARIANTS,
  REMAINING_BLOCKERS,
  SLICE_SUMMARIES,
  STOP_ITEMS,
  V05_RELEASE_TARGET,
  VALIDATION_STATUS,
  finalReleaseReadinessCheckpoint,
}
