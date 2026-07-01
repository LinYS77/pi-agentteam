const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  DEFAULT_GO_READINESS_DRY_RUN_RESULT_MARKER,
  createFailClosedDefaultGoReadinessDryRunSummary,
  formatDefaultGoReadinessDryRunText,
  verifyDefaultGoReadinessDryRun,
} = require('../../scripts/lib/go-default-readiness-dry-run.cjs')
const {
  assertIncludes,
  existsRel,
  readJsonRel,
  readRel,
  toRel,
  walkFiles,
} = require('./fsAssertions.cjs')
const {
  APPROVED_EMBEDDED_NATIVE_FILES,
  assertPackageFilesDoNotBroaden,
  assertPackageManifestGovernance,
} = require('./packageReleaseGovernanceGuards.cjs')
const {
  APPROVED_NATIVE_ROOT,
  assertNoRawOrReleaseArtifacts,
} = require('./nativeGuards.cjs')
const {
  BLOCKED,
  DEFAULT_GO_BLOCKER_IDS,
  DEFAULT_GO_READINESS_LEDGER_SCHEMA_VERSION,
  DEFAULT_GO_READINESS_MODULE,
  DEFAULT_GO_READINESS_THEME,
  defaultGoReadinessLedger,
} = require('../fixtures/kernel/v0636/defaultGoReadinessLedger.cjs')
const {
  READINESS_EVIDENCE_ENTRY_IDS,
  READINESS_EVIDENCE_REGISTRY_SCHEMA_VERSION,
  READINESS_EVIDENCE_REGISTRY_THEME,
  readinessEvidenceEntries,
  readinessEvidenceRegistry,
} = require('../fixtures/kernel/v0636/readinessEvidenceRegistry.cjs')
const {
  CURRENTLY_BLOCKED,
  FUTURE_REQUIRED,
  NON_APPLIED,
  NOT_IMPLEMENTED,
  ROLLBACK_DISABLE_POLICY_CASE_IDS,
  ROLLBACK_DISABLE_POLICY_MODULE,
  ROLLBACK_DISABLE_POLICY_SCHEMA_VERSION,
  ROLLBACK_DISABLE_POLICY_THEME,
  rollbackDisablePolicy,
  rollbackDisablePolicyCases,
} = require('../fixtures/kernel/v0636/rollbackDisablePolicyCases.cjs')
const {
  GATED,
  TAG_GATE_LEDGER_SCHEMA_VERSION,
  TAG_GATE_LEDGER_THEME,
  TAG_GATE_VERSIONS,
  UNRESOLVED,
  tagGateEntries,
  tagGateLedger,
} = require('../fixtures/kernel/v0636/tagGateLedger.cjs')
const {
  BLOCKED: P0_BLOCKED,
  GREEN,
  P0,
  P0_READINESS_LEDGER_ROW_IDS,
  P0_READINESS_LEDGER_SCHEMA_VERSION,
  P0_READINESS_LEDGER_SLICE,
  P0_READINESS_LEDGER_THEME,
  STOP_GATES,
  UNKNOWN,
  V05_RELEASE_TARGET,
  WATCH,
  p0ReadinessLedger,
  p0ReadinessRows,
} = require('../fixtures/kernel/v0637/p0ReadinessLedger.cjs')
const {
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
  VALIDATION_STATUS,
  finalReleaseReadinessCheckpoint,
} = require('../fixtures/kernel/v0637/finalReleaseReadinessCheckpoint.cjs')
const {
  performanceBaselineBenchmarks,
  performanceBaselineInventory,
} = require('../fixtures/kernel/v0637/performanceBaselineInventory.cjs')
const {
  p95ReleaseGateDefinitions,
  p95ReleaseGates,
} = require('../fixtures/kernel/v0637/p95ReleaseGates.cjs')
const {
  hotPathBurnDownCandidates,
  hotPathBurnDownPlan,
} = require('../fixtures/kernel/v0637/hotPathBurnDownCandidates.cjs')
const {
  manualRcSmokeChecklist,
  manualRcSmokeSteps,
} = require('../fixtures/kernel/v0637/manualRcSmokeChecklist.cjs')
const {
  validationCategories,
  validationStrategy,
} = require('../fixtures/kernel/v0637/validationStrategy.cjs')
const {
  taskReportPlanRunReliability,
  taskReportPlanRunRequirements,
} = require('../fixtures/kernel/v0637/taskReportPlanRunReliability.cjs')

const DEFAULT_GO_READINESS_FIXTURE_GUARD_HELPER = 'tests/helpers/defaultGoReadinessFixtureGuards.cjs'
const DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE = 'tests/suites/go-kernel-default-go-readiness-fixture-guard.cjs'

const DEFAULT_GO_READINESS_FIXTURE_CATEGORIES = Object.freeze([
  'default-go-dry-run-summary-contract',
  'default-go-dry-run-source-boundaries',
  'default-go-readiness-ledger-integrity',
  'install-load-evidence-registry-proof-only',
  'rollback-default-disable-policy-non-applied',
  'release-tag-ledger-non-release',
  'v05-p0-readiness-ledger-integrity',
  'v05-final-checkpoint-fixture-integrity',
  'v05-supporting-fixtures-evidence-only',
  'readiness-fixtures-not-production-inputs',
  'package-runtime-public-boundaries-preserved',
  'default-go-readiness-supporting-suite-evidence',
])

const DEFAULT_GO_READINESS_FIXTURE_CATEGORY_DESCRIPTIONS = Object.freeze({
  'default-go-dry-run-summary-contract': 'The default-Go readiness dry-run verifier returns review-only, non-mutating, fail-closed summaries with all availability/default/release flags false and all blocker IDs still blocked.',
  'default-go-dry-run-source-boundaries': 'The dry-run library and CLI read static repo facts/fixtures only and contain no helper execution, package release, tag, hosted query, network, environment mutation, or artifact-writing behavior.',
  'default-go-readiness-ledger-integrity': 'The v0.6.36 readiness ledger remains deterministic fixture data with ten blocked, required, non-waivable blockers and no default-Go/default-resolver/native/release/signing/platform approval claim.',
  'install-load-evidence-registry-proof-only': 'The v0.6.36 install/load evidence registry remains accepted local proof-only evidence that reruns no proofs, generates no artifacts, and keeps default/native/release/signing/platform claims false.',
  'rollback-default-disable-policy-non-applied': 'The rollback/default-disable policy fixture remains non-applied, future-required, currently blocked, not implemented, and not approved while preserving fail-closed future case taxonomy as fixture evidence only.',
  'release-tag-ledger-non-release': 'The tag gate ledger keeps v0.6.31-v0.6.36 gated/unresolved, performs no tag/release/push/npm/gh/hosted action, and treats any future v0.6.36 tag as governance-only.',
  'v05-p0-readiness-ledger-integrity': 'The v0.6.37 v0.5 P0 ledger remains not release-ready, not a default-Go governance continuation, with STOP gates and P0 rows preserving evidence-only readiness mapping.',
  'v05-final-checkpoint-fixture-integrity': 'The v0.6.37 final checkpoint fixture remains checkpoint-complete-not-release-ready with GO/STOP matrices, blockers, leader next decisions, and package/runtime invariants all denying release/default/native/signing/p95/manual RC approval.',
  'v05-supporting-fixtures-evidence-only': 'v0.6.37 performance baseline, p95 gates, hot-path candidates, manual RC checklist, validation strategy, and task/report/PlanRun reliability fixtures remain evidence-only maps with no pass/release/runtime/default/native claims.',
  'readiness-fixtures-not-production-inputs': 'Default-Go/v0.5 readiness fixtures are not imported or read by production TypeScript/Go/panel/renderer/control-plane sources; they remain tests/docs evidence only.',
  'package-runtime-public-boundaries-preserved': 'Package version 0.6.8, TypeScript/pi facade, /team readiness compact diagnostics, stable agentteam tools, bridge/read boundaries, and bounded Go helper authority remain unchanged with no package/native/default/release controls.',
  'default-go-readiness-supporting-suite-evidence': 'Current non-deleted supporting dry-run/readiness/fixture suites, scripts, docs, fixtures, and approved embedded helper files remain present outside the Step5C candidate historical docs suites.',
})

const DEFAULT_GO_READINESS_FIXTURE_SOURCE_FILES = Object.freeze([
  'package.json',
  'index.ts',
  'api/commands.ts',
  'api/tools.ts',
  'commands/readiness.ts',
  'commands/team.ts',
  'core/kernel.ts',
  'core/kernelPackagedResolver.ts',
  'teamPanel/layout.ts',
  'tools/message.ts',
  'tools/task.ts',
  'tools/planRun.ts',
  'tools/workerPrompt.ts',
  'workerTurnPrompt.ts',
  'scripts/lib/go-default-readiness-dry-run.cjs',
  'scripts/verify-go-default-readiness-dry-run.cjs',
  'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs',
  'tests/fixtures/kernel/v0636/readinessEvidenceRegistry.cjs',
  'tests/fixtures/kernel/v0636/rollbackDisablePolicyCases.cjs',
  'tests/fixtures/kernel/v0636/tagGateLedger.cjs',
  'tests/fixtures/kernel/v0637/p0ReadinessLedger.cjs',
  'tests/fixtures/kernel/v0637/finalReleaseReadinessCheckpoint.cjs',
  'tests/fixtures/kernel/v0637/performanceBaselineInventory.cjs',
  'tests/fixtures/kernel/v0637/p95ReleaseGates.cjs',
  'tests/fixtures/kernel/v0637/hotPathBurnDownCandidates.cjs',
  'tests/fixtures/kernel/v0637/manualRcSmokeChecklist.cjs',
  'tests/fixtures/kernel/v0637/validationStrategy.cjs',
  'tests/fixtures/kernel/v0637/taskReportPlanRunReliability.cjs',
])

const DEFAULT_GO_READINESS_FIXTURE_SUPPORTING_SUITES = Object.freeze([
  'tests/suites/go-kernel-v0636-default-go-readiness-dry-run.cjs',
  'tests/suites/go-kernel-v0636-default-go-readiness-ledger.cjs',
  'tests/suites/go-kernel-v0636-install-load-evidence-registry.cjs',
  'tests/suites/go-kernel-v0636-release-tag-debt-governance.cjs',
  'tests/suites/go-kernel-v0636-rollback-disable-policy.cjs',
  'tests/suites/go-kernel-v0636-ts-pi-default-go-authority-boundary.cjs',
  'tests/suites/go-kernel-v0637-v05-p0-readiness-ledger.cjs',
  'tests/suites/go-kernel-v0637-v05-performance-baseline-inventory.cjs',
  'tests/suites/go-kernel-v0637-v05-p95-release-gates.cjs',
  'tests/suites/go-kernel-v0637-v05-hot-path-burndown-candidates.cjs',
  'tests/suites/go-kernel-v0637-v05-manual-rc-smoke-checklist.cjs',
  'tests/suites/go-kernel-v0637-v05-validation-strategy.cjs',
  'tests/suites/go-kernel-v0637-v05-task-report-planrun-reliability.cjs',
])

const DEFAULT_GO_READINESS_FIXTURE_SUPPORTING_DOCS = Object.freeze([
  'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md',
  'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy-checkpoint.md',
  'docs/perf/v0.6.37-v0.5-release-readiness-burndown.md',
  'docs/perf/v0.6.37-v0.5-release-readiness-burndown-checkpoint.md',
])

const EXPECTED_FALSE_SUMMARY_FLAGS = Object.freeze([
  'ready',
  'modeChange',
  'defaultGo',
  'defaultResolver',
  'nativePackageDelivery',
  'normalUserNativeAvailability',
  'fallbackDeletion',
  'packageReleaseApproved',
  'installSourceApproved',
  'signingApproved',
  'secondPlatformSupport',
])
const STABLE_TOOL_NAMES = Object.freeze([
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
])
const PRODUCTION_ROOTS = Object.freeze(['api', 'app', 'commands', 'core', 'hooks', 'runtime', 'state', 'teamPanel', 'tmux', 'tools', 'adapters', 'kernel'])
const PRODUCTION_ROOT_FILES = Object.freeze(['index.ts', 'renderers.ts', 'teamPanel.ts', 'workerTurnPrompt.ts', 'deliveryPolicy.ts'])
const READINESS_FIXTURE_TOKENS = Object.freeze([
  'defaultGoReadinessLedger',
  'defaultGoReadinessBlockers',
  'readinessEvidenceRegistry',
  'readinessEvidenceEntries',
  'rollbackDisablePolicy',
  'rollbackDisablePolicyCases',
  'tagGateLedger',
  'tagGateEntries',
  'p0ReadinessLedger',
  'p0ReadinessRows',
  'performanceBaselineInventory',
  'p95ReleaseGates',
  'hotPathBurnDownPlan',
  'manualRcSmokeChecklist',
  'validationStrategy',
  'taskReportPlanRunReliability',
  'finalReleaseReadinessCheckpoint',
  'tests/fixtures/kernel/v0636',
  'tests/fixtures/kernel/v0637',
])
const FORBIDDEN_DRY_RUN_SOURCE_PATTERNS = Object.freeze([
  /require\(['"]node:child_process['"]\)/,
  /require\(['"]child_process['"]\)/,
  /\b(?:spawnSync|spawn|execSync|execFileSync|execFile|exec)\s*\(/,
  /\b(?:writeFileSync|appendFileSync|mkdirSync|mkdtempSync|rmSync|rmdirSync|unlinkSync|renameSync|copyFileSync)\s*\(/,
  /\bprocess\.env\b/,
  /\bfetch\s*\(/,
  /\bhttps?\.(?:request|get)\s*\(/,
  /\b(?:npm\s+(?:publish|version|pack|install)|git\s+(?:tag|push|commit)|gh\s+(?:release|workflow|run|api|attestation)|go\s+(?:build|install|mod|run)|tmux\b|curl\b|wget\b|cosign\b|slsa\b)/i,
  /\bready\s*:\s*true\b/,
])

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function assertSameSet(actual, expected, label) {
  assert.deepEqual(sorted(actual), sorted(expected), `${label} should match exactly`)
}

function assertPlainDeterministic(value, label) {
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value, `${label} should be plain deterministic data`)
}

function assertEveryFileExists(root, files, label) {
  for (const rel of files) assert.equal(existsRel(root, rel), true, `${rel} should exist for ${label}`)
}

function assertFalseFields(record, fields, label) {
  for (const field of fields) assert.equal(record[field], false, `${label} ${field} should remain false`)
}

function assertNoAbsolutePaths(value, label) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  assert.equal(/(?:^|["'\s])\/(?:home|tmp|var|Users|private|mnt|workspace)\//.test(text), false, `${label} must not contain absolute POSIX host paths`)
  assert.equal(/[A-Za-z]:\\/.test(text), false, `${label} must not contain Windows absolute paths`)
}

function assertNonEmptyStrings(values, label) {
  for (const value of values) {
    assert.equal(typeof value, 'string', `${label} item should be string`)
    assert.ok(value.length > 10, `${label} item should be meaningful`)
  }
}

function sourceWithoutAllowedBoundaryPhrases(source) {
  return String(source)
    .replace(/not normal-user native availability proof/g, '')
    .replace(/default-go-readiness-dry-run/g, '')
    .replace(/defaultGo/g, '')
    .replace(/defaultResolver/g, '')
}

function assertDefaultGoDryRunSummaryContract(root) {
  const summary = verifyDefaultGoReadinessDryRun({ repoRoot: root })
  assert.equal(summary.ok, true, 'default-Go dry-run should pass static repo fact collection')
  assert.equal(summary.resultMarker, DEFAULT_GO_READINESS_DRY_RUN_RESULT_MARKER)
  for (const field of EXPECTED_FALSE_SUMMARY_FLAGS) assert.equal(summary[field], false, `dry-run ${field} must remain false`)
  assert.equal(summary.noSilentWaiver, true)
  assert.equal(summary.reviewOnly, true)
  assert.equal(summary.prototype, true)
  assert.equal(summary.blockerCount, DEFAULT_GO_BLOCKER_IDS.length)
  assert.deepEqual(summary.blockedIds, DEFAULT_GO_BLOCKER_IDS)
  assert.equal(summary.ledger.schemaVersion, DEFAULT_GO_READINESS_LEDGER_SCHEMA_VERSION)
  assert.equal(summary.ledger.theme, DEFAULT_GO_READINESS_THEME)
  assert.equal(summary.ledger.module, DEFAULT_GO_READINESS_MODULE)
  assert.equal(summary.ledger.ready, false)
  assert.equal(summary.ledger.allBlockersBlocked, true)
  for (const blocker of summary.blockers) {
    assert.equal(blocker.status, BLOCKED, `${blocker.id} remains blocked`)
    assert.equal(blocker.requiredBeforeDefaultGo, true, `${blocker.id} remains required before default Go`)
    assert.equal(blocker.waivableByRepoStateAlone, false, `${blocker.id} must not be silently waived`)
  }
  assert.deepEqual(summary.repoFacts.packageJson.piExtensions, ['./index.ts'])
  assert.equal(summary.repoFacts.packageJson.version, '0.6.8')
  assert.equal(summary.repoFacts.packageJson.nativeMetadataAbsent, true)
  assert.deepEqual(summary.repoFacts.kernel.knownModes, ['default', 'disabled', 'typescript', 'go', 'auto', 'go-cutover', 'go-packaged-preview'])
  assert.equal(summary.repoFacts.kernel.defaultRuntime, 'go/embedded-helper')
  assert.equal(summary.repoFacts.kernel.defaultResolverSource, 'approved-embedded-helper-manifest')
  assert.equal(summary.repoFacts.kernel.compactReadModelFingerprintFallbackRetained, true)
  assert.equal(summary.repoFacts.readiness.reviewerDiagnosticsOnly, true)
  assert.equal(summary.repoFacts.readiness.normalUserNativeAvailabilityProof, false)
  assert.deepEqual(summary.repoFacts.workflows.workflowFiles, ['go-helper-review-artifact.yml'])
  assert.equal(summary.repoFacts.workflows.secondPlatformMatrix, false)
  assert.equal(summary.repoFacts.artifacts.rootForbiddenArtifactsAbsent, true)
  assert.equal(summary.diagnostics.pathsRedacted, true)
  assert.equal(summary.diagnostics.rawOutputIncluded, false)
  assert.equal(summary.diagnostics.stackIncluded, false)
  assert.equal(summary.diagnostics.repoMutation, false)
  assert.equal(summary.diagnostics.envMutation, false)
  assert.equal(summary.diagnostics.networkAccess, false)
  assert.equal(summary.diagnostics.helperExecution, false)
  assertNoAbsolutePaths(summary, 'dry-run summary')

  const text = formatDefaultGoReadinessDryRunText(summary)
  assertIncludes(text, 'ready=false', 'dry-run text')
  assertIncludes(text, 'defaultGo=false', 'dry-run text')
  assertIncludes(text, `blockerCount=${DEFAULT_GO_BLOCKER_IDS.length}`, 'dry-run text')
  assertNoAbsolutePaths(text, 'dry-run text')

  const missingRoot = verifyDefaultGoReadinessDryRun({ repoRoot: path.join(root, '__missing_default_go_readiness_fixture_guard__') })
  assert.equal(missingRoot.ok, false, 'missing root should fail closed')
  for (const field of EXPECTED_FALSE_SUMMARY_FLAGS) assert.equal(missingRoot[field], false, `fail-closed ${field} must remain false`)
  assert.equal(missingRoot.diagnostics.pathsRedacted, true)
  assert.equal(missingRoot.diagnostics.rawOutputIncluded, false)
  assert.equal(missingRoot.diagnostics.stackIncluded, false)
  assertNoAbsolutePaths(missingRoot, 'fail-closed dry-run summary')

  const explicitFailure = createFailClosedDefaultGoReadinessDryRunSummary('argument-error', 'bad repo root')
  assert.equal(explicitFailure.ok, false)
  assert.equal(explicitFailure.ready, false)
  assert.equal(explicitFailure.defaultGo, false)
  assert.equal(explicitFailure.defaultResolver, false)
  assert.equal(explicitFailure.diagnostics.failureKind, 'argument-error')
  assertNoAbsolutePaths(explicitFailure, 'explicit fail-closed dry-run summary')
}

function assertDefaultGoDryRunSourceBoundaries(root) {
  for (const rel of ['scripts/lib/go-default-readiness-dry-run.cjs', 'scripts/verify-go-default-readiness-dry-run.cjs']) {
    const source = readRel(root, rel)
    for (const pattern of FORBIDDEN_DRY_RUN_SOURCE_PATTERNS) assert.equal(pattern.test(source), false, `${rel} must not contain forbidden dry-run behavior: ${pattern}`)
  }
  const lib = readRel(root, 'scripts/lib/go-default-readiness-dry-run.cjs')
  for (const expected of [
    "const DEFAULT_GO_READINESS_DRY_RUN_RESULT_MARKER = 'default-go-readiness-dry-run'",
    "const LEDGER_RELATIVE_PATH = 'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs'",
    "const PACKAGE_VERSION = '0.6.8'",
    'FALSE_AVAILABILITY_FLAGS',
    'repoMutation: false',
    'envMutation: false',
    'networkAccess: false',
    'helperExecution: false',
    'readPackageJson(repoRoot)',
    'collectKernelFacts(repoRoot)',
    'collectReadinessFacts(repoRoot)',
    'collectWorkflowFacts(repoRoot)',
  ]) assertIncludes(lib, expected, 'scripts/lib/go-default-readiness-dry-run.cjs')
  const cli = readRel(root, 'scripts/verify-go-default-readiness-dry-run.cjs')
  for (const expected of [
    'Runs a non-mutating local default-Go readiness dry-run against static repo facts and the Slice 2 ledger.',
    "if (arg === '--repo-root')",
    "if (arg === '--json')",
    'verifyDefaultGoReadinessDryRun({ repoRoot: args.repoRoot })',
    'createFailClosedDefaultGoReadinessDryRunSummary',
  ]) assertIncludes(cli, expected, 'scripts/verify-go-default-readiness-dry-run.cjs')
}

function assertDefaultGoReadinessLedgerIntegrity() {
  assertPlainDeterministic(defaultGoReadinessLedger, 'default-Go readiness ledger')
  assert.equal(defaultGoReadinessLedger.schemaVersion, DEFAULT_GO_READINESS_LEDGER_SCHEMA_VERSION)
  assert.equal(defaultGoReadinessLedger.theme, DEFAULT_GO_READINESS_THEME)
  assert.equal(defaultGoReadinessLedger.module, DEFAULT_GO_READINESS_MODULE)
  assertFalseFields(defaultGoReadinessLedger, [
    'ready',
    'defaultGo',
    'defaultResolver',
    'normalUserNativeAvailability',
    'fallbackDeletion',
    'modeChange',
    'packageReleaseApproved',
    'secondPlatformSupport',
    'signingApproved',
  ], 'default-Go readiness ledger')
  assert.equal(defaultGoReadinessLedger.noSilentWaiver, true)
  assert.deepEqual(defaultGoReadinessLedger.blockers.map(blocker => blocker.id), DEFAULT_GO_BLOCKER_IDS)
  assert.equal(new Set(DEFAULT_GO_BLOCKER_IDS).size, DEFAULT_GO_BLOCKER_IDS.length)
  for (const blocker of defaultGoReadinessLedger.blockers) {
    assert.equal(blocker.status, BLOCKED, `${blocker.id} must remain blocked`)
    assert.equal(blocker.requiredBeforeDefaultGo, true, `${blocker.id} requiredBeforeDefaultGo`)
    assert.equal(blocker.waivableByRepoStateAlone, false, `${blocker.id} waivableByRepoStateAlone`)
    assert.equal(typeof blocker.currentEvidence, 'string', `${blocker.id} currentEvidence`)
    assert.equal(typeof blocker.missingForApproval, 'string', `${blocker.id} missingForApproval`)
    assert.equal(typeof blocker.stopIfMissing, 'string', `${blocker.id} stopIfMissing`)
    assert.ok(blocker.stopIfMissing.includes('Default Go must remain disabled') || blocker.stopIfMissing.includes('Default Go and fallback deletion must remain disabled'), `${blocker.id} stop gate should keep default Go disabled`)
    for (const denied of [
      'normal-user native availability',
      'default Go approval or enablement',
      'default resolver approval or enablement',
      'TypeScript fallback deletion approval',
      'package release approval',
      'install source approval',
      'signing/cosign/SLSA/security attestation approval',
      'second-platform support or platform matrix',
    ]) assert.ok(blocker.doesNotProve.includes(denied), `${blocker.id} should deny ${denied}`)
  }
}

function assertInstallLoadEvidenceRegistryProofOnly(root) {
  assertPlainDeterministic(readinessEvidenceRegistry, 'readiness evidence registry')
  assert.equal(readinessEvidenceRegistry.schemaVersion, READINESS_EVIDENCE_REGISTRY_SCHEMA_VERSION)
  assert.equal(readinessEvidenceRegistry.theme, READINESS_EVIDENCE_REGISTRY_THEME)
  assertFalseFields(readinessEvidenceRegistry, [
    'availabilityClaim',
    'defaultGoEvidence',
    'defaultResolverEvidence',
    'normalUserNativeAvailability',
    'nativePackageDelivery',
    'packageManagerNativeDelivery',
    'packageReleaseEvidence',
    'installSourceEvidence',
    'releaseAssetEvidence',
    'signingEvidence',
    'fallbackDeletionEvidence',
    'secondPlatformSupport',
    'rerunsProofs',
    'generatesArtifacts',
  ], 'readiness evidence registry')
  assert.deepEqual(readinessEvidenceEntries.map(entry => entry.id), READINESS_EVIDENCE_ENTRY_IDS)
  assert.equal(readinessEvidenceRegistry.entries, readinessEvidenceEntries)
  for (const entry of readinessEvidenceEntries) {
    assert.equal(entry.status, 'accepted-local-evidence')
    assert.equal(entry.reviewOnly, true)
    assert.equal(entry.prototype, true)
    assert.equal(entry.localOnly, true)
    assert.equal(entry.rerunByRegistry, false)
    assertFalseFields(entry, [
      'availabilityClaim',
      'defaultGoEvidence',
      'defaultResolverEvidence',
      'normalUserNativeAvailability',
      'nativePackageDelivery',
      'packageManagerNativeDelivery',
      'packageReleaseEvidence',
      'installSourceEvidence',
      'releaseAssetEvidence',
      'signingEvidence',
      'fallbackDeletionEvidence',
      'secondPlatformSupport',
    ], `readiness evidence entry ${entry.id}`)
    assert.ok(entry.doesProve.length >= 1, `${entry.id} should state bounded proof`)
    for (const denied of [
      'native helper delivery',
      'normal-user native availability',
      'default Go approval or enablement',
      'default resolver approval or enablement',
      'package release approval',
      'install source approval',
      'release asset approval',
      'signing/cosign/SLSA/security attestation approval',
    ]) assert.ok(entry.doesNotProve.includes(denied), `${entry.id} should deny ${denied}`)
    for (const rel of entry.references) {
      if (rel.startsWith('tests/suites/') && /-docs\.cjs$/.test(rel)) continue
      assert.equal(existsRel(root, rel), true, `${entry.id} non-candidate reference should exist: ${rel}`)
    }
  }
}

function assertRollbackDefaultDisablePolicyNonApplied() {
  assertPlainDeterministic(rollbackDisablePolicy, 'rollback/default-disable policy')
  assert.equal(rollbackDisablePolicy.schemaVersion, ROLLBACK_DISABLE_POLICY_SCHEMA_VERSION)
  assert.equal(rollbackDisablePolicy.theme, ROLLBACK_DISABLE_POLICY_THEME)
  assert.equal(rollbackDisablePolicy.module, ROLLBACK_DISABLE_POLICY_MODULE)
  assert.equal(rollbackDisablePolicy.application, NON_APPLIED)
  assert.equal(rollbackDisablePolicy.gate, FUTURE_REQUIRED)
  assert.equal(rollbackDisablePolicy.currentState, CURRENTLY_BLOCKED)
  assert.equal(rollbackDisablePolicy.status, NOT_IMPLEMENTED)
  assertFalseFields(rollbackDisablePolicy, [
    'implemented',
    'approved',
    'rollbackDisableImplemented',
    'defaultGoApproved',
    'defaultResolverApproved',
    'fallbackDeletionApproved',
    'repoStateAloneCanApprove',
  ], 'rollback/default-disable policy')
  assert.equal(rollbackDisablePolicy.currentKernelSemanticsUnchanged, true)
  assert.deepEqual(rollbackDisablePolicyCases.map(item => item.id), ROLLBACK_DISABLE_POLICY_CASE_IDS)
  assert.equal(rollbackDisablePolicy.cases, rollbackDisablePolicyCases)
  const failureModes = new Set(rollbackDisablePolicyCases.flatMap(item => item.failureModes))
  for (const mode of ['bad-package', 'bad-helper', 'missing-helper', 'bad-manifest', 'unsupported-platform', 'package-deprecated', 'package-unpublished', 'checksum-mismatch', 'signing-mismatch']) {
    assert.equal(failureModes.has(mode), true, `rollback/default-disable policy should include ${mode}`)
  }
  for (const item of rollbackDisablePolicyCases) {
    assert.equal(item.application, NON_APPLIED, `${item.id} application`)
    assert.equal(item.gate, FUTURE_REQUIRED, `${item.id} gate`)
    assert.equal(item.currentState, CURRENTLY_BLOCKED, `${item.id} currentState`)
    assert.equal(item.status, NOT_IMPLEMENTED, `${item.id} status`)
    assertFalseFields(item, ['implemented', 'approved', 'rollbackDisableImplemented', 'defaultGoApproved', 'defaultResolverApproved', 'repoStateAloneCanApprove'], `rollback/default-disable case ${item.id}`)
    assert.equal(item.currentSemanticsUnchanged, true, `${item.id} currentSemanticsUnchanged`)
    assert.equal(item.requiresExplicitApproval, true, `${item.id} requiresExplicitApproval`)
    assertNonEmptyStrings([item.futureRequirement, item.currentEvidence, item.stopIfMissing], `${item.id} policy strings`)
    for (const denied of ['rollback/default-disable implementation', 'default Go approval or enablement', 'default resolver approval or enablement', 'normal-user native availability', 'TypeScript fallback deletion approval']) {
      assert.ok(item.doesNotProve.includes(denied), `${item.id} should deny ${denied}`)
    }
  }
}

function assertReleaseTagLedgerNonRelease(root) {
  assertPlainDeterministic(tagGateLedger, 'tag gate ledger')
  assert.equal(tagGateLedger.schemaVersion, TAG_GATE_LEDGER_SCHEMA_VERSION)
  assert.equal(tagGateLedger.theme, TAG_GATE_LEDGER_THEME)
  assertFalseFields(tagGateLedger, [
    'releaseWorkPerformed',
    'tagCreated',
    'pushPerformed',
    'hostedWorkflowQueried',
    'ghUsed',
    'npmPublish',
    'npmVersion',
    'rawHostedRecordsCheckedIn',
    'releaseAssetsCreated',
    'waiverInvented',
  ], 'tag gate ledger')
  assert.deepEqual(tagGateEntries.map(entry => entry.version), TAG_GATE_VERSIONS)
  assert.equal(tagGateLedger.entries, tagGateEntries)
  for (const entry of tagGateEntries) {
    assert.equal(entry.status, GATED, `${entry.version} status`)
    assert.equal(entry.resolution, UNRESOLVED, `${entry.version} resolution`)
    assert.equal(entry.requiresLeaderDecision, true, `${entry.version} requiresLeaderDecision`)
    assert.equal(entry.requiresHostedEvidenceOrWaiver, true, `${entry.version} requiresHostedEvidenceOrWaiver`)
    assertFalseFields(entry, [
      'releaseWorkPerformed',
      'tagCreated',
      'tagPushed',
      'pushPerformed',
      'hostedWorkflowQueried',
      'ghUsed',
      'npmPublish',
      'npmVersion',
      'rawHostedRecordsCheckedIn',
      'releaseAssetsCreated',
      'waiverInvented',
      'tagWouldMeanAvailability',
    ], `tag gate ${entry.version}`)
    for (const denied of ['tag created', 'tag pushed', 'release created', 'npm version completed', 'npm publish completed', 'native helper delivery', 'default Go approval or enablement', 'default resolver approval or enablement']) {
      assert.ok(entry.doesNotProve.includes(denied), `${entry.version} should deny ${denied}`)
    }
    for (const rel of entry.references) assert.equal(existsRel(root, rel), true, `${entry.version} reference should exist: ${rel}`)
  }
  const byVersion = new Map(tagGateEntries.map(entry => [entry.version, entry]))
  assert.deepEqual(byVersion.get('v0.6.36').blockedBy, ['v0.6.31', 'v0.6.32', 'v0.6.33', 'v0.6.34', 'v0.6.35'])
  assert.ok(byVersion.get('v0.6.36').policy.includes('docs/tests dry-run governance only'))
  assert.ok(byVersion.get('v0.6.36').doesNotProve.includes('native/default/release availability'))
}

function assertV05P0ReadinessLedgerIntegrity(root) {
  assertPlainDeterministic(p0ReadinessLedger, 'v0.5 P0 readiness ledger')
  assert.equal(p0ReadinessLedger.schemaVersion, P0_READINESS_LEDGER_SCHEMA_VERSION)
  assert.equal(p0ReadinessLedger.theme, P0_READINESS_LEDGER_THEME)
  assert.equal(p0ReadinessLedger.releaseTarget, V05_RELEASE_TARGET)
  assert.equal(p0ReadinessLedger.slice, P0_READINESS_LEDGER_SLICE)
  assertFalseFields(p0ReadinessLedger, ['ready', 'defaultGoGovernanceContinuation', 'runtimeBehaviorChanged', 'packageVersionChanged', 'tagCreated', 'npmPublished', 'nativeWorkPerformed'], 'v0.5 P0 readiness ledger')
  assert.deepEqual(p0ReadinessLedger.stopGates, STOP_GATES)
  assert.deepEqual(p0ReadinessRows.map(row => row.id), P0_READINESS_LEDGER_ROW_IDS)
  assert.equal(p0ReadinessLedger.rows, p0ReadinessRows)
  assert.ok(p0ReadinessRows.some(row => row.status === GREEN), 'P0 ledger should keep green rows')
  assert.ok(p0ReadinessRows.some(row => row.status === WATCH), 'P0 ledger should keep watch rows')
  assert.ok(p0ReadinessRows.some(row => row.status === P0_BLOCKED), 'P0 ledger should keep blocked rows')
  assert.ok(p0ReadinessRows.some(row => row.status === UNKNOWN), 'P0 ledger should keep unknown rows')
  for (const stopGate of [
    'no tag creation',
    'no npm version',
    'no native package',
    'no default Go',
    'no production TypeScript',
  ]) assert.ok(STOP_GATES.some(gate => gate.includes(stopGate)), `P0 ledger stop gates should include ${stopGate}`)
  for (const row of p0ReadinessRows) {
    assert.equal(row.severity, P0, `${row.id} severity`)
    assert.equal(row.releaseReadyClaim, false, `${row.id} releaseReadyClaim`)
    assert.ok(row.existingEvidence.length >= 2, `${row.id} should cite existing evidence`)
    for (const evidence of row.existingEvidence) {
      if (evidence.startsWith('No current')) continue
      if (evidence.includes('/') || evidence.endsWith('.json')) assert.equal(existsRel(root, evidence), true, `${row.id} evidence should exist: ${evidence}`)
    }
    assertNonEmptyStrings([row.affectedSeam, row.releaseImpact, row.requiredProof], `${row.id} P0 row`)
  }
}

function assertV05FinalCheckpointFixtureIntegrity() {
  assertPlainDeterministic(finalReleaseReadinessCheckpoint, 'v0.5 final release-readiness checkpoint')
  assert.equal(finalReleaseReadinessCheckpoint.schemaVersion, FINAL_CHECKPOINT_SCHEMA_VERSION)
  assert.equal(finalReleaseReadinessCheckpoint.theme, FINAL_CHECKPOINT_THEME)
  assert.equal(finalReleaseReadinessCheckpoint.slice, FINAL_CHECKPOINT_SLICE)
  assert.equal(finalReleaseReadinessCheckpoint.releaseTarget, V05_RELEASE_TARGET)
  assert.equal(finalReleaseReadinessCheckpoint.status, CHECKPOINT_STATUS)
  assert.equal(finalReleaseReadinessCheckpoint.docsTestsFixturesOnly, true)
  assertFalseFields(finalReleaseReadinessCheckpoint, [
    'ready',
    'releaseReadyClaim',
    'runtimeBehaviorChanged',
    'packageVersionChanged',
    'tagCreated',
    'npmPublished',
    'nativeWorkPerformed',
    'defaultGoApproved',
    'defaultResolverApproved',
    'fallbackDeletionApproved',
    'signingApproved',
    'secondPlatformApproved',
    'manualRcExecuted',
    'p95GatesProven',
    'broadNpmTestGreenClaim',
    'paneHealthWaived',
  ], 'v0.5 final checkpoint')
  assert.deepEqual(finalReleaseReadinessCheckpoint.sliceSummaries, SLICE_SUMMARIES)
  assert.deepEqual(finalReleaseReadinessCheckpoint.goItems, GO_ITEMS)
  assert.deepEqual(finalReleaseReadinessCheckpoint.stopItems, STOP_ITEMS)
  assert.deepEqual(finalReleaseReadinessCheckpoint.remainingBlockers, REMAINING_BLOCKERS)
  assert.deepEqual(finalReleaseReadinessCheckpoint.nextDecisions, NEXT_DECISIONS)
  assert.deepEqual(finalReleaseReadinessCheckpoint.validationStatus, VALIDATION_STATUS)
  assert.deepEqual(finalReleaseReadinessCheckpoint.packageRuntimeInvariants, PACKAGE_RUNTIME_INVARIANTS)
  assert.deepEqual(SLICE_SUMMARIES.map(row => row.slice), [1, 2, 3, 4, 5, 6, 7, 8])
  const statusBySlice = new Map(SLICE_SUMMARIES.map(row => [row.slice, row.status]))
  assert.equal(statusBySlice.get(3), 'defined-not-yet-proven')
  assert.equal(statusBySlice.get(4), 'proposed-not-started')
  assert.equal(statusBySlice.get(5), 'defined-not-executed')
  assert.equal(statusBySlice.get(7), 'mapped-not-proven')
  assert.equal(statusBySlice.get(8), CHECKPOINT_STATUS)
  assert.deepEqual(GO_ITEMS.map(row => row.id), ['local-docs-tests-governance-evidence', 'focused-guards-direct-pass', 'burn-down-map-complete', 'ts-pi-facade-authority-preserved'])
  assert.ok(GO_ITEMS.every(row => /not|only|does not|no default-Go|not completion/i.test(row.limit)), 'GO item limits should remain explicit')
  assert.ok(STOP_ITEMS.some(row => row.id === 'no-tag-release-git-push'), 'STOP matrix should deny tag/release/git push')
  assert.ok(STOP_ITEMS.some(row => row.id === 'no-npm-version-publish-package-release'), 'STOP matrix should deny npm package release')
  assert.ok(STOP_ITEMS.some(row => row.id === 'no-default-go-native-resolver'), 'STOP matrix should deny default Go/native resolver')
  assert.ok(STOP_ITEMS.some(row => row.id === 'no-p95-pass-claim'), 'STOP matrix should deny p95 pass claim')
  assert.ok(STOP_ITEMS.some(row => row.id === 'no-manual-rc-execution-claim'), 'STOP matrix should deny manual RC claim')
  assert.ok(REMAINING_BLOCKERS.some(row => row.id === 'manual-rc-not-executed'), 'manual RC blocker should remain')
  assert.ok(REMAINING_BLOCKERS.some(row => row.id === 'p95-gates-not-proven'), 'p95 blocker should remain')
  assert.ok(REMAINING_BLOCKERS.some(row => row.id === 'default-go-native-remains-blocked'), 'default-Go/native blocker should remain')
  assert.ok(NEXT_DECISIONS.every(row => row.decisionOwner === 'leader'), 'next decisions should remain leader-owned')
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.packageVersion, '0.6.8')
  assert.deepEqual(PACKAGE_RUNTIME_INVARIANTS.piExtensions, ['./index.ts'])
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.productionRuntimeChanged, false)
}

function assertV05SupportingFixturesEvidenceOnly() {
  assertPlainDeterministic(performanceBaselineInventory, 'performance baseline inventory')
  assert.equal(performanceBaselineInventory.ready, false)
  assert.equal(performanceBaselineInventory.baselineOnly, true)
  assert.equal(performanceBaselineInventory.provesP95ReleaseGate, false)
  assert.equal(performanceBaselineInventory.provesReleaseReady, false)
  assertFalseFields(performanceBaselineInventory, ['runtimeBehaviorChanged', 'packageVersionChanged', 'tagCreated', 'npmPublished', 'nativeWorkPerformed', 'defaultGoApproved'], 'performance baseline inventory')
  assert.equal(performanceBaselineInventory.benchmarks, performanceBaselineBenchmarks)

  assertPlainDeterministic(p95ReleaseGates, 'p95 release gates')
  assert.equal(p95ReleaseGates.currentStatus, 'defined-not-yet-proven')
  assertFalseFields(p95ReleaseGates, ['ready', 'provesReleaseReady', 'provesP95Pass', 'releaseReadyClaim', 'runtimeBehaviorChanged', 'packageVersionChanged', 'tagCreated', 'npmPublished', 'nativeWorkPerformed', 'defaultGoApproved', 'defaultResolverApproved', 'fallbackDeletionApproved', 'signingApproved', 'secondPlatformApproved'], 'p95 release gates')
  assert.equal(p95ReleaseGates.gates, p95ReleaseGateDefinitions)

  assertPlainDeterministic(hotPathBurnDownPlan, 'hot-path burn-down plan')
  assert.equal(hotPathBurnDownPlan.currentStatus, 'proposed-not-started')
  assertFalseFields(hotPathBurnDownPlan, ['ready', 'runtimeBehaviorChanged', 'runtimeOptimizationApplied', 'p95ImprovementClaimed', 'releaseReadyClaim', 'tagCreated', 'npmPublished', 'nativeWorkPerformed', 'defaultGoApproved', 'defaultResolverApproved', 'fallbackDeletionApproved', 'signingApproved', 'secondPlatformApproved', 'hiddenSchedulerApproved', 'workerSpawnsWorkerApproved', 'fullTextBoundaryChanged'], 'hot-path burn-down plan')
  assert.equal(hotPathBurnDownPlan.candidates, hotPathBurnDownCandidates)

  assertPlainDeterministic(manualRcSmokeChecklist, 'manual RC smoke checklist')
  assert.equal(manualRcSmokeChecklist.currentStatus, 'defined-not-executed')
  assertFalseFields(manualRcSmokeChecklist, ['ready', 'executedInThisSlice', 'smokePassed', 'provesReleaseReady', 'provesP95Pass', 'releaseReadyClaim', 'runtimeBehaviorChanged', 'packageVersionChanged', 'tagCreated', 'npmPublished', 'nativeWorkPerformed', 'defaultGoApproved', 'defaultResolverApproved', 'fallbackDeletionApproved', 'signingApproved', 'secondPlatformApproved', 'realUserStateAllowedWithoutBackup', 'rawFullTextEvidenceAllowedByDefault'], 'manual RC smoke checklist')
  assert.equal(manualRcSmokeChecklist.steps, manualRcSmokeSteps)

  assertPlainDeterministic(validationStrategy, 'validation strategy')
  assert.equal(validationStrategy.currentStatus, 'strategy-defined')
  assertFalseFields(validationStrategy, ['ready', 'broadSuiteGreenClaimed', 'releaseReadyClaim', 'runtimeBehaviorChanged', 'packageVersionChanged', 'tagCreated', 'npmPublished', 'nativeWorkPerformed', 'defaultGoApproved', 'defaultResolverApproved', 'fallbackDeletionApproved', 'signingApproved', 'secondPlatformApproved', 'testsRunSuiteArgumentFocusedProofAllowed'], 'validation strategy')
  assert.equal(validationStrategy.categories, validationCategories)

  assertPlainDeterministic(taskReportPlanRunReliability, 'task/report/PlanRun reliability map')
  assert.equal(taskReportPlanRunReliability.currentStatus, 'mapped-not-proven')
  assertFalseFields(taskReportPlanRunReliability, ['ready', 'releaseReadyClaim', 'runtimeBehaviorChanged', 'packageVersionChanged', 'tagCreated', 'npmPublished', 'nativeWorkPerformed', 'defaultGoApproved', 'defaultResolverApproved', 'fallbackDeletionApproved', 'signingApproved', 'secondPlatformApproved', 'hiddenSchedulerApproved', 'workerSpawnsWorkerApproved', 'fullTextBoundaryChanged', 'autoCloseAutoBlockApproved'], 'task/report/PlanRun reliability map')
  assert.equal(taskReportPlanRunReliability.requirements, taskReportPlanRunRequirements)
}

function productionFiles(root) {
  const files = []
  for (const rel of PRODUCTION_ROOT_FILES) if (existsRel(root, rel)) files.push(path.join(root, ...rel.split('/')))
  for (const rel of PRODUCTION_ROOTS) {
    const full = path.join(root, rel)
    for (const file of walkFiles(full, { include: candidate => /\.(?:ts|js|cjs|mjs|go)$/.test(candidate) })) files.push(file)
  }
  return [...new Set(files)]
}

function assertReadinessFixturesNotProductionInputs(root) {
  for (const file of productionFiles(root)) {
    const rel = toRel(root, file)
    const source = fs.readFileSync(file, 'utf8')
    for (const token of READINESS_FIXTURE_TOKENS) assert.equal(source.includes(token), false, `${rel} must not import/read readiness fixture token ${token}`)
  }
}

function assertPackageRuntimePublicBoundariesPreserved(root) {
  const packageJson = assertPackageManifestGovernance(root)
  assert.equal(packageJson.version, '0.6.8')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
  assertPackageFilesDoNotBroaden(packageJson)

  const index = readRel(root, 'index.ts')
  assertIncludes(index, "import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'", 'index.ts')
  assertIncludes(index, 'export default function agentTeamExtension', 'index.ts')
  assert.equal(/^export\s+(?!default\s+function\s+agentTeamExtension\b)/m.test(index), false, 'index.ts should not expose broad named exports')
  assert.equal(/registerProvider|native provider|provider ABI|gh\s+release|npm\s+(?:publish|version)|git\s+(?:tag|push)|cosign|slsa/i.test(index), false, 'index.ts should stay TypeScript/pi facade only')

  const team = sourceWithoutAllowedBoundaryPhrases(readRel(root, 'commands/team.ts'))
  assertIncludes(team, "pi.registerCommand('team'", 'commands/team.ts')
  assertIncludes(team, "const options = ['config init', 'config show', 'config validate', 'config migrate --dry-run', 'readiness']", 'commands/team.ts')
  assert.equal(/default Go is enabled|default resolver is enabled|package release|release asset|install source|cosign|slsa|native helper delivery|normal-user native availability is proven/i.test(team), false, '/team command should not become default/release/native control surface')

  const readiness = readRel(root, 'commands/readiness.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'commands/readiness.ts')
  assert.equal(/normal-user native helper availability is proven|default Go is enabled|default resolver is enabled|release asset is approved|signing is approved/i.test(readiness), false, 'readiness command should not overclaim availability')

  const toolSource = [
    'tools/team.ts',
    'tools/message.ts',
    'tools/task.ts',
    'tools/planRun.ts',
  ].map(rel => readRel(root, rel)).join('\n')
  const toolNames = [...toolSource.matchAll(/name:\s*'([^']+)'/g)].map(match => match[1]).filter(name => name.startsWith('agentteam_')).sort()
  assert.deepEqual(toolNames, STABLE_TOOL_NAMES.slice().sort(), 'model-callable tool surface should remain stable')
  assert.equal(/readiness tool|native helper delivery|package publish|npm publish|npm version|release asset|install source|signing approval|cosign proof|SLSA proof|default Go enabled|default resolver enabled|hosted workflow trigger|download artifact/i.test(sourceWithoutAllowedBoundaryPhrases(toolSource)), false, 'tools should not expose default/release/native controls')
  assertIncludes(readRel(root, 'tools/message.ts'), 'This is the full-text mailbox read boundary', 'tools/message.ts')
  assertIncludes(readRel(root, 'tools/task.ts'), 'one full TaskReport body without changing task state', 'tools/task.ts')
  assertIncludes(readRel(root, 'workerTurnPrompt.ts'), 'agentteam_task action=report_done', 'workerTurnPrompt.ts')
  assertIncludes(readRel(root, 'teamPanel/layout.ts'), 'compact only; does not mark delivered/read', 'teamPanel/layout.ts')

  const kernel = readRel(root, 'core/kernel.ts')
  for (const expected of [
    "export type AgentTeamKernelKnownMode = 'default' | 'disabled' | 'typescript' | 'go' | 'auto' | 'go-cutover' | 'go-packaged-preview'",
    "const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)",
    "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'",
    "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested",
    "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const",
    'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)',
    'if (cutoverRequested) return fallback(compactInput)',
  ]) assertIncludes(kernel, expected, 'core/kernel.ts')
  assert.equal(/AGENTTEAM_KERNEL_CUTOVER_MODULE\s*=\s*'compactReadModelFingerprint'/.test(kernel), false, 'compactReadModelFingerprint must not become cutover module')
  assert.equal(/registerCommand|registerTool|registerMessageRenderer|registerProvider|ExtensionAPI|pi\.register|native provider|provider ABI/i.test(kernel), false, 'kernel must not register pi public surfaces')
}

function assertNoReleaseArtifactResidue(root) {
  const workflows = fs.readdirSync(path.join(root, '.github', 'workflows')).filter(name => name.endsWith('.yml') || name.endsWith('.yaml')).sort()
  assert.deepEqual(workflows, ['go-helper-review-artifact.yml'], 'only review-artifact workflow should exist')
  const workflow = readRel(root, '.github/workflows/go-helper-review-artifact.yml')
  assert.equal(/gh\s+release|git\s+(?:tag|push)|npm\s+(?:version|publish|pack)|cosign|slsa|softprops\/action-gh-release|upload-release-asset|contents:\s*write|packages:\s*write/i.test(workflow), false, 'review workflow must not add release/package/signing mechanics')
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(existsRel(root, rel), false, `${rel} must not exist`)
  }
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root should not contain package tarballs')
  assertNoRawOrReleaseArtifacts(root, {
    approvedPrefixes: [`${APPROVED_NATIVE_ROOT}/`],
    rawMessage: 'repo must not contain raw readiness/manual/p95/hosted evidence files',
    artifactMessage: 'repo must not contain unapproved release/archive/signing artifacts',
  })
}

function assertDefaultGoReadinessSupportingSuiteEvidence(root) {
  assertEveryFileExists(root, [
    DEFAULT_GO_READINESS_FIXTURE_GUARD_HELPER,
    DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE,
    ...DEFAULT_GO_READINESS_FIXTURE_SOURCE_FILES,
    ...DEFAULT_GO_READINESS_FIXTURE_SUPPORTING_SUITES,
    ...DEFAULT_GO_READINESS_FIXTURE_SUPPORTING_DOCS,
    ...APPROVED_EMBEDDED_NATIVE_FILES,
  ], 'default-Go readiness fixture guard evidence')
  assertSameSet(DEFAULT_GO_READINESS_FIXTURE_CATEGORIES, Object.keys(DEFAULT_GO_READINESS_FIXTURE_CATEGORY_DESCRIPTIONS), 'default-Go readiness fixture category descriptions')
}

function assertDefaultGoReadinessFixtureGuard(root) {
  const checkedCategories = []
  function mark(category, assertion) {
    assertion()
    checkedCategories.push(category)
  }

  mark('default-go-dry-run-summary-contract', () => assertDefaultGoDryRunSummaryContract(root))
  mark('default-go-dry-run-source-boundaries', () => assertDefaultGoDryRunSourceBoundaries(root))
  mark('default-go-readiness-ledger-integrity', () => assertDefaultGoReadinessLedgerIntegrity())
  mark('install-load-evidence-registry-proof-only', () => assertInstallLoadEvidenceRegistryProofOnly(root))
  mark('rollback-default-disable-policy-non-applied', () => assertRollbackDefaultDisablePolicyNonApplied())
  mark('release-tag-ledger-non-release', () => assertReleaseTagLedgerNonRelease(root))
  mark('v05-p0-readiness-ledger-integrity', () => assertV05P0ReadinessLedgerIntegrity(root))
  mark('v05-final-checkpoint-fixture-integrity', () => assertV05FinalCheckpointFixtureIntegrity())
  mark('v05-supporting-fixtures-evidence-only', () => assertV05SupportingFixturesEvidenceOnly())
  mark('readiness-fixtures-not-production-inputs', () => assertReadinessFixturesNotProductionInputs(root))
  mark('package-runtime-public-boundaries-preserved', () => assertPackageRuntimePublicBoundariesPreserved(root))
  mark('default-go-readiness-supporting-suite-evidence', () => {
    assertNoReleaseArtifactResidue(root)
    assertDefaultGoReadinessSupportingSuiteEvidence(root)
  })

  assertSameSet(checkedCategories, DEFAULT_GO_READINESS_FIXTURE_CATEGORIES, 'default-Go readiness fixture guard checked categories')
  return { checkedCategories: Object.freeze([...checkedCategories]) }
}

module.exports = {
  DEFAULT_GO_READINESS_FIXTURE_CATEGORIES,
  DEFAULT_GO_READINESS_FIXTURE_CATEGORY_DESCRIPTIONS,
  DEFAULT_GO_READINESS_FIXTURE_GUARD_HELPER,
  DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE,
  DEFAULT_GO_READINESS_FIXTURE_SOURCE_FILES,
  DEFAULT_GO_READINESS_FIXTURE_SUPPORTING_DOCS,
  DEFAULT_GO_READINESS_FIXTURE_SUPPORTING_SUITES,
  assertDefaultGoReadinessFixtureGuard,
}
