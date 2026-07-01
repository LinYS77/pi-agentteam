const assert = require('node:assert/strict')
const path = require('node:path')
const {
  assertIncludes,
  existsRel,
  readRel,
} = require('../helpers/fsAssertions.cjs')
const {
  APPROVED_EMBEDDED_NATIVE_FILES,
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORIES: HELPER_GUARD_CATEGORIES,
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_HELPER,
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_SUITE,
  assertConsolidatedPackageReleaseGovernance,
} = require('../helpers/packageReleaseGovernanceGuards.cjs')
const { assertPackageVersion } = require('../helpers/packageGuards.cjs')
const {
  HISTORICAL_CHECKPOINT_DOCS_V0419_V0427,
  HISTORICAL_CHECKPOINT_DOCS_V0628_V0643,
  HISTORICAL_CHECKPOINT_DOCS_V0644_V0688,
  HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643,
  HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0644_V0688,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688,
} = require('../fixtures/kernel/historicalCheckpoints.cjs')
const {
  HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT,
  HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP,
  HISTORICAL_CHECKPOINT_KEEP_SUITES,
  HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES,
  HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES,
} = require('../fixtures/kernel/historicalCheckpointDeletionMap.cjs')
const {
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORIES,
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORY_DESCRIPTIONS,
  HISTORICAL_CHECKPOINT_STEP5A_CONSOLIDATED_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_COUNTS,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_INPUTS,
  HISTORICAL_CHECKPOINT_STEP5A_STATUS_VALUES,
  HISTORICAL_CHECKPOINT_STEP5A_STILL_KEEP_SUITES,
  HISTORICAL_CHECKPOINT_STEP5A_STILL_NEEDS_SPLIT_SUITES,
  HISTORICAL_CHECKPOINT_STEP5B_DELETION_CANDIDATE_SUITES,
  RESIDUAL_REMAP_DETAILS,
} = require('../fixtures/kernel/historicalCheckpointStep5Remap.cjs')

const EXPECTED_REMAINING_TOTAL = 32
const EXPECTED_STEP5B_READY = 0
const EXPECTED_STILL_NEEDS_SPLIT = 31
const EXPECTED_STILL_KEEP = 1

const SCRIPT_FILES_THAT_MUST_REMAIN = Object.freeze([
  'scripts/build-go-helper-artifact.cjs',
  'scripts/check-import-boundaries.cjs',
  'scripts/lib/go-default-readiness-dry-run.cjs',
  'scripts/lib/go-helper-artifact-builder.cjs',
  'scripts/lib/go-helper-artifact-verifier.cjs',
  'scripts/lib/go-helper-clean-install-proof.cjs',
  'scripts/lib/go-helper-hosted-observation-record.cjs',
  'scripts/lib/pi-extension-install-load-proof.cjs',
  'scripts/lib/v0638-temp-home-rc-harness.cjs',
  'scripts/lib/v0639-task-message-report-p95-harness.cjs',
  'scripts/lib/v0641-fsstore-lock-wait-p95-harness.cjs',
  'scripts/lib/v0642-data-change-render-debounce-harness.cjs',
  'scripts/lib/v0642-spawn-bookkeeping-p95-harness.cjs',
  'scripts/lib/v0647-default-go-dry-run-harness.cjs',
  'scripts/seed-team-panel.cjs',
  'scripts/verify-go-default-readiness-dry-run.cjs',
  'scripts/verify-go-helper-artifact.cjs',
  'scripts/verify-go-helper-clean-install-proof.cjs',
  'scripts/verify-go-helper-hosted-observation-record.cjs',
  'scripts/verify-pi-extension-install-load.cjs',
  'scripts/verify-v0638-temp-home-rc-harness.cjs',
  'scripts/verify-v0639-task-message-report-p95.cjs',
  'scripts/verify-v0641-fsstore-lock-wait-p95.cjs',
  'scripts/verify-v0642-data-change-render-debounce.cjs',
  'scripts/verify-v0642-spawn-bookkeeping-p95.cjs',
  'scripts/verify-v0647-default-go-dry-run.cjs',
])

const SOURCE_AND_RUNTIME_FILES_THAT_MUST_REMAIN = Object.freeze([
  'index.ts',
  'deliveryPolicy.ts',
  'core/kernel.ts',
  'commands/readiness.ts',
  'api/tools.ts',
  'api/commands.ts',
  'runtime/leaderAttention.ts',
  'runtime/leaderMailboxSignalRuntime.ts',
  'runtime/bridgeDeliveryPump.ts',
  'adapters/bridge/delivery.ts',
  'adapters/runtime/service.ts',
  'teamPanel/layout.ts',
  'tools/message.ts',
  'tools/task.ts',
  'workerTurnPrompt.ts',
  'kernel/go/agentteam-kernel/main.go',
])

const FIXTURE_AND_HELPER_FILES_THAT_MUST_REMAIN = Object.freeze([
  'tests/fixtures/kernel/historicalCheckpoints.cjs',
  'tests/fixtures/kernel/historicalCheckpointDeletionMap.cjs',
  'tests/fixtures/kernel/historicalCheckpointStep5Remap.cjs',
  'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs',
  'tests/helpers/fsAssertions.cjs',
  'tests/helpers/goKernelGuards.cjs',
  'tests/helpers/nativeGuards.cjs',
  'tests/helpers/packageGuards.cjs',
  'tests/helpers/packageReleaseGovernanceGuards.cjs',
  'tests/helpers/reviewArtifactWorkflowGuard.cjs',
])

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function assertUnique(values, label) {
  const seen = new Set()
  const duplicates = []
  for (const value of values) {
    if (seen.has(value)) duplicates.push(value)
    seen.add(value)
  }
  assert.deepEqual(duplicates, [], `${label} should not contain duplicates`)
}

function assertSameSet(actual, expected, label) {
  assert.deepEqual(sorted(actual), sorted(expected), `${label} should match exactly`)
}

function remainingCandidateSuites() {
  return [
    ...HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES,
    ...HISTORICAL_CHECKPOINT_KEEP_SUITES,
  ]
}

function assertConsolidatedGuard(root) {
  const result = assertConsolidatedPackageReleaseGovernance(root)
  assertSameSet(result.checkedCategories, HELPER_GUARD_CATEGORIES, 'helper checked consolidated package/release guard categories')
  assertSameSet(CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORIES, HELPER_GUARD_CATEGORIES, 'remap fixture guard categories')
  assert.equal(Object.keys(CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORY_DESCRIPTIONS).length, HELPER_GUARD_CATEGORIES.length, 'each guard category should have a description')
  for (const category of HELPER_GUARD_CATEGORIES) {
    assert.ok(CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORY_DESCRIPTIONS[category], `${category} should have a description`)
  }
  assert.equal(HISTORICAL_CHECKPOINT_STEP5A_CONSOLIDATED_GUARD_EVIDENCE.suite, CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_SUITE, 'guard evidence should point at this suite')
  assert.equal(HISTORICAL_CHECKPOINT_STEP5A_CONSOLIDATED_GUARD_EVIDENCE.helper, CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_HELPER, 'guard evidence should point at the consolidated helper')
  for (const rel of [
    HISTORICAL_CHECKPOINT_STEP5A_CONSOLIDATED_GUARD_EVIDENCE.suite,
    HISTORICAL_CHECKPOINT_STEP5A_CONSOLIDATED_GUARD_EVIDENCE.helper,
    ...HISTORICAL_CHECKPOINT_STEP5A_CONSOLIDATED_GUARD_EVIDENCE.reusedHelpers,
    ...HISTORICAL_CHECKPOINT_STEP5A_CONSOLIDATED_GUARD_EVIDENCE.supportingFixtures,
  ]) {
    assert.equal(existsRel(root, rel), true, `${rel} should exist as consolidated guard evidence`)
  }
}

function assertRemapCompleteness() {
  const remaining = remainingCandidateSuites()
  const remappedSuites = HISTORICAL_CHECKPOINT_STEP5A_REMAP.map(entry => entry.suite)
  assert.equal(remaining.length, EXPECTED_REMAINING_TOTAL, 'remaining candidate input count should stay 31 needs-split + 1 keep')
  assert.equal(HISTORICAL_CHECKPOINT_STEP5A_REMAP.length, EXPECTED_REMAINING_TOTAL, 'Step 5A remap should enumerate every remaining candidate')
  assertUnique(remappedSuites, 'Step 5A remap suites')
  assertSameSet(remappedSuites, remaining, 'Step 5A remap suites vs remaining candidates')
  assertSameSet(Object.keys(RESIDUAL_REMAP_DETAILS), remaining, 'Step 5A residual detail keys')
  assert.deepEqual(HISTORICAL_CHECKPOINT_STEP5A_REMAP_COUNTS, {
    totalRemainingCandidates: EXPECTED_REMAINING_TOTAL,
    step5BReady: EXPECTED_STEP5B_READY,
    stillNeedsSplit: EXPECTED_STILL_NEEDS_SPLIT,
    stillKeep: EXPECTED_STILL_KEEP,
  }, 'Step 5A remap counts should stay explicit')
  assertSameSet(HISTORICAL_CHECKPOINT_STEP5A_STILL_NEEDS_SPLIT_SUITES, HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES, 'Step 5A still-needs-split suites')
  assertSameSet(HISTORICAL_CHECKPOINT_STEP5A_STILL_KEEP_SUITES, HISTORICAL_CHECKPOINT_KEEP_SUITES, 'Step 5A still-keep suites')
  assert.deepEqual(HISTORICAL_CHECKPOINT_STEP5B_DELETION_CANDIDATE_SUITES, [], 'Step 5B deletion candidate list should remain empty until residual assertions are migrated')

  const validStatuses = new Set(HISTORICAL_CHECKPOINT_STEP5A_STATUS_VALUES)
  const priorBySuite = new Map(HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP.map(entry => [entry.suite, entry]))
  for (const entry of HISTORICAL_CHECKPOINT_STEP5A_REMAP) {
    const prior = priorBySuite.get(entry.suite)
    assert.ok(prior, `${entry.suite} should have prior T023/T024 deletion parity entry`)
    assert.equal(validStatuses.has(entry.currentStatus), true, `${entry.suite} should use a valid Step 5A status`)
    assert.equal(entry.priorDeleteReadiness, prior.deleteReadiness, `${entry.suite} should preserve prior deleteReadiness`)
    assert.equal(entry.replacementAuditSuite, prior.replacementAuditSuite, `${entry.suite} should preserve replacement audit evidence`)
    assert.equal(entry.deletionParityAuditSuite, HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT, `${entry.suite} should preserve deletion parity audit evidence`)
    assertSameSet(entry.packageReleaseGovernanceAssertionCategories, HELPER_GUARD_CATEGORIES, `${entry.suite} covered package/release categories`)
    assert.equal(entry.consolidatedGuardEvidence.suite, CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_SUITE, `${entry.suite} guard suite evidence`)
    assert.equal(entry.consolidatedGuardEvidence.helper, CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_HELPER, `${entry.suite} guard helper evidence`)
    assert.ok(entry.rationale.includes('consolidated package/release governance guard'), `${entry.suite} should mention consolidated guard rationale`)

    if (entry.step5BDeletionCandidate) {
      assert.equal(entry.currentStatus, 'step5b-ready', `${entry.suite} Step 5B candidate should have step5b-ready status`)
      assert.deepEqual(entry.residualUniqueAssertions, [], `${entry.suite} Step 5B candidate should have no residual assertions`)
      assert.deepEqual(entry.residualRisks, [], `${entry.suite} Step 5B candidate should have no residual risks`)
    } else {
      assert.notEqual(entry.currentStatus, 'step5b-ready', `${entry.suite} non-ready entry must not use step5b-ready status`)
      assert.ok(entry.residualUniqueAssertions.length >= 1, `${entry.suite} non-ready entry should keep residual assertions`)
      assert.ok(entry.residualRisks.length >= 1, `${entry.suite} non-ready entry should keep residual risks`)
    }

    if (HISTORICAL_CHECKPOINT_KEEP_SUITES.includes(entry.suite)) {
      assert.equal(entry.currentStatus, 'step5a-keep', `${entry.suite} keep suite should remain keep after Step 5A`)
    } else {
      assert.equal(entry.currentStatus, 'step5a-needs-split', `${entry.suite} should remain needs-split after Step 5A`)
    }
  }
}

function assertNoDeletionOrReintroduction(root) {
  const remapped = new Set(HISTORICAL_CHECKPOINT_STEP5A_REMAP.map(entry => entry.suite))
  const step5B = new Set(HISTORICAL_CHECKPOINT_STEP5B_DELETION_CANDIDATE_SUITES)
  for (const suite of HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES) {
    assert.equal(existsRel(root, suite), false, `${suite} should remain absent after T024`)
    assert.equal(remapped.has(suite), false, `${suite} must not be remapped as a remaining candidate`)
    assert.equal(step5B.has(suite), false, `${suite} must not be reintroduced as a Step 5B candidate`)
  }
  for (const suite of remainingCandidateSuites()) {
    assert.equal(existsRel(root, suite), true, `${suite} should remain present; Step 5A is non-destructive`)
  }
  for (const entry of HISTORICAL_CHECKPOINT_STEP5A_REMAP) {
    assert.equal(existsRel(root, entry.replacementAuditSuite), true, `${entry.replacementAuditSuite} should exist for ${entry.suite}`)
    assert.equal(existsRel(root, entry.deletionParityAuditSuite), true, `${entry.deletionParityAuditSuite} should exist for ${entry.suite}`)
  }
}

function assertNonCandidatesRemainNonCandidates(root) {
  assert.deepEqual(HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688, [], 'v0.6.44-v0.6.88 replacement/deletion candidates should remain empty')
  const remapped = new Set(HISTORICAL_CHECKPOINT_STEP5A_REMAP.map(entry => entry.suite))
  const step5B = new Set(HISTORICAL_CHECKPOINT_STEP5B_DELETION_CANDIDATE_SUITES)
  for (const suite of [
    ...HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643,
    ...HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0644_V0688,
  ]) {
    assert.equal(existsRel(root, suite), true, `${suite} should remain present as a non-candidate`)
    assert.equal(remapped.has(suite), false, `${suite} non-candidate must not appear in Step 5A remaining-candidate remap`)
    assert.equal(step5B.has(suite), false, `${suite} non-candidate must not appear in Step 5B deletion candidates`)
  }
}

function assertNoDocsFixturesScriptsSourceRuntimeNativeDeletion(root) {
  for (const doc of [
    ...HISTORICAL_CHECKPOINT_DOCS_V0419_V0427,
    ...HISTORICAL_CHECKPOINT_DOCS_V0628_V0643,
    ...HISTORICAL_CHECKPOINT_DOCS_V0644_V0688,
  ]) {
    assert.equal(existsRel(root, doc), true, `${doc} should still exist; Step 5A must not delete docs`)
  }
  for (const rel of [
    '.gitignore',
    'docs/agentteam方案书.md',
    ...FIXTURE_AND_HELPER_FILES_THAT_MUST_REMAIN,
    ...SCRIPT_FILES_THAT_MUST_REMAIN,
    ...SOURCE_AND_RUNTIME_FILES_THAT_MUST_REMAIN,
    ...APPROVED_EMBEDDED_NATIVE_FILES,
  ]) {
    assert.equal(existsRel(root, rel), true, `${rel} should still exist; Step 5A must not delete fixtures/scripts/source/runtime/native files`)
  }
  assertIncludes(readRel(root, 'package.json'), '"version": "0.6.8"', 'package.json')
}

module.exports = {
  name: 'Go kernel v0.6.43 package/release governance remap',
  async run(env) {
    const root = env.helpers.extRoot
    const packageJson = assertPackageVersion(root)
    assert.equal(packageJson.version, '0.6.8', 'Step 5A package/release remap must keep package version unchanged')
    assert.equal(path.basename(__filename), path.basename(HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT), 'Step 5A remap audit should stay versioned historical/audit-only')

    assertConsolidatedGuard(root)
    assertRemapCompleteness()
    assertNoDeletionOrReintroduction(root)
    assertNonCandidatesRemainNonCandidates(root)
    assertNoDocsFixturesScriptsSourceRuntimeNativeDeletion(root)
  },
}
