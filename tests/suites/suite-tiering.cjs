const assert = require('node:assert/strict')
const {
  HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT,
  HISTORICAL_CHECKPOINT_DELETION_READINESS_COUNTS,
  HISTORICAL_CHECKPOINT_KEEP_SUITES,
  HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES,
  HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES,
} = require('../fixtures/kernel/historicalCheckpointDeletionMap.cjs')
const { assertPackageVersion } = require('../helpers/packageGuards.cjs')
const {
  classifySuite,
  discoverSuiteFiles,
  isCurrentGoKernelSuite,
  isHistoricalGoKernelSuite,
  normalizeSuiteFile,
  selectSuiteFiles,
  summarizeSelection,
} = require('../suiteManifest.cjs')

const EXPECTED_TIER_COUNTS_POST_T024 = Object.freeze({
  default: 76,
  smoke: 10,
  core: 57,
  'go-current': 19,
  audit: 157,
  benchmark: 3,
  regression: 236,
})

const EXPECTED_HISTORICAL_CHECKPOINT_DELETION_READINESS_COUNTS = Object.freeze({
  ready: 15,
  'needs-split': 31,
  keep: 1,
})

const HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT_FILE = normalizeSuiteFile(HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT)
const HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITE_FILES = HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES.map(normalizeSuiteFile)
const HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITE_FILES = HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES.map(normalizeSuiteFile)
const HISTORICAL_CHECKPOINT_KEEP_SUITE_FILES = HISTORICAL_CHECKPOINT_KEEP_SUITES.map(normalizeSuiteFile)

module.exports = {
  name: 'suite tiering manifest',
  async run(env) {
    const root = env.helpers.extRoot
    const packageJson = assertPackageVersion(root)

    assert.equal(packageJson.scripts?.test, 'node tests/run.cjs --tier default')
    assert.equal(packageJson.scripts?.['test:regression'], 'node tests/run.cjs --tier regression')
    assert.equal(packageJson.scripts?.['test:audit'], 'node tests/run.cjs --tier audit')
    assert.equal(packageJson.scripts?.['test:go-current'], 'node tests/run.cjs --tier go-current')
    assert.equal(packageJson.scripts?.['test:list'], 'node tests/run.cjs --list')
    assert.ok(packageJson.scripts?.check?.includes('npm run test:regression'), 'check must keep the full regression suite wired in')
    assert.equal(packageJson.scripts?.check?.includes('npm test'), false, 'check must not use the reduced default developer suite')
    assert.equal(packageJson.scripts?.['release:check']?.includes('npm publish'), false, 'release check must not publish')
    assert.equal(packageJson.scripts?.['release:check']?.includes('npm version'), false, 'release check must not bump versions')

    const allSuites = discoverSuiteFiles()
    const defaultSuites = selectSuiteFiles({ tiers: ['default'] })
    const regressionSuites = selectSuiteFiles({ tiers: ['regression'] })
    const auditSuites = selectSuiteFiles({ tiers: ['audit'] })
    const benchmarkSuites = selectSuiteFiles({ tiers: ['benchmark'] })
    const goCurrentSuites = selectSuiteFiles({ tiers: ['go-current'] })
    const smokeSuites = selectSuiteFiles({ tiers: ['smoke'] })
    const coreSuites = selectSuiteFiles({ tiers: ['core'] })
    const tierSelections = {
      default: defaultSuites,
      smoke: smokeSuites,
      core: coreSuites,
      'go-current': goCurrentSuites,
      audit: auditSuites,
      benchmark: benchmarkSuites,
      regression: regressionSuites,
    }

    assert.equal(allSuites.length, EXPECTED_TIER_COUNTS_POST_T024.regression, 'manifest should encode the post-T024 discovered suite count')
    assert.deepEqual(summarizeSelection(allSuites), EXPECTED_TIER_COUNTS_POST_T024, 'suite tier summary should encode the post-T024 topology')
    for (const [tier, suites] of Object.entries(tierSelections)) {
      assert.equal(suites.length, EXPECTED_TIER_COUNTS_POST_T024[tier], `${tier} tier count should match post-T024 topology`)
    }
    assert.deepEqual(regressionSuites, allSuites, 'regression tier should preserve every suite')
    assert.ok(defaultSuites.length < regressionSuites.length, 'default tier should be reduced from full regression')
    assert.ok(auditSuites.length > defaultSuites.length, 'audit tier should preserve historical Go/kernel coverage explicitly')
    assert.ok(benchmarkSuites.includes('zzzzzzzzzzzzz-read-model-bench-v0414.cjs'), 'benchmark tier should preserve opt-in bench suites')
    assert.equal(defaultSuites.includes('zzzzzzzzzzzzz-read-model-bench-v0414.cjs'), false, 'default tier should exclude benchmark suites')

    assert.ok(defaultSuites.includes('service-units.cjs'), 'default tier should keep non-Go core integration coverage')
    assert.ok(defaultSuites.includes('package-install-smoke.cjs'), 'default tier should keep package/no-release smoke coverage')
    assert.ok(smokeSuites.includes('package-install-smoke.cjs'), 'smoke tier should include package smoke coverage')
    assert.ok(goCurrentSuites.includes('go-kernel-v0696-v07-release-decision-package.cjs'), 'go-current tier should keep latest release/no-action guard')
    assert.ok(defaultSuites.includes('go-kernel-v0696-v07-release-decision-package.cjs'), 'default tier should keep current Go release guard')
    assert.ok(auditSuites.includes('go-kernel-v0688-go-clear-pane-label-sync-cutover.cjs'), 'audit tier should retain historical cutover coverage')
    assert.ok(auditSuites.includes('go-kernel-v0688-historical-checkpoints-audit.cjs'), 'audit tier should include the historical checkpoint manifest audit')
    assert.deepEqual(classifySuite(HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT_FILE).tiers, ['audit', 'regression'], 'deletion parity suite must remain audit/regression only')
    assert.ok(auditSuites.includes(HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT_FILE), 'audit tier should include the historical checkpoint deletion parity audit')
    assert.ok(regressionSuites.includes(HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT_FILE), 'regression tier should include the historical checkpoint deletion parity audit')
    assert.equal(defaultSuites.includes('go-kernel-v0688-go-clear-pane-label-sync-cutover.cjs'), false, 'default tier should remove historical audit coverage')
    assert.equal(defaultSuites.includes('go-kernel-v0688-historical-checkpoints-audit.cjs'), false, 'default tier should exclude the historical checkpoint manifest audit')
    assert.equal(defaultSuites.includes(HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT_FILE), false, 'default tier should exclude the historical checkpoint deletion parity audit')
    assert.ok(auditSuites.includes('go-kernel-release-checklist-docs.cjs'), 'audit tier should retain older release checklist docs')
    assert.equal(defaultSuites.includes('go-kernel-release-checklist-docs.cjs'), false, 'default tier should remove older release checklist docs')

    for (const file of auditSuites) {
      assert.equal(defaultSuites.includes(file), false, `${file} should not be both audit and default`)
      assert.ok(classifySuite(file).tiers.includes('regression'), `${file} must remain in full regression`)
    }
    for (const file of goCurrentSuites) {
      assert.equal(isCurrentGoKernelSuite(file), true, `${file} should be classified as current Go/kernel coverage`)
    }
    assert.equal(isHistoricalGoKernelSuite('go-kernel-v0688-go-clear-pane-label-sync-cutover.cjs'), true)
    assert.equal(isHistoricalGoKernelSuite('go-kernel-v0689-go-worker-delivery-boundary-gate.cjs'), false)

    assert.deepEqual(HISTORICAL_CHECKPOINT_DELETION_READINESS_COUNTS, EXPECTED_HISTORICAL_CHECKPOINT_DELETION_READINESS_COUNTS, 'historical checkpoint deletion readiness counts should remain explicit')
    assert.equal(HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITE_FILES.length, EXPECTED_HISTORICAL_CHECKPOINT_DELETION_READINESS_COUNTS.ready, 'T024 ready-deleted suite list should remain exactly 15 suites')
    for (const file of HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITE_FILES) {
      assert.equal(allSuites.includes(file), false, `${file} should remain absent after the T024 ready-suite deletion slice`)
      assert.equal(auditSuites.includes(file), false, `${file} should not reappear in audit after the T024 deletion slice`)
      assert.equal(regressionSuites.includes(file), false, `${file} should not reappear in regression after the T024 deletion slice`)
    }
    for (const file of [...HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITE_FILES, ...HISTORICAL_CHECKPOINT_KEEP_SUITE_FILES]) {
      assert.ok(allSuites.includes(file), `${file} should remain discoverable after the T024 deletion slice`)
      assert.ok(auditSuites.includes(file), `${file} should remain in audit until separately migrated or accepted`)
      assert.ok(regressionSuites.includes(file), `${file} should remain in regression until separately migrated or accepted`)
      assert.equal(defaultSuites.includes(file), false, `${file} should remain historical/audit-only and absent from default`)
    }

    assert.deepEqual(selectSuiteFiles({ filters: ['service-units'] }), ['service-units.cjs'], 'legacy substring suite filters should still work without tiers')
    assert.deepEqual(selectSuiteFiles({ tiers: ['audit'], filters: ['go-kernel-v0688'] }), [
      'go-kernel-v0688-go-clear-pane-label-sync-cutover.cjs',
      'go-kernel-v0688-historical-checkpoints-audit.cjs',
    ], 'suite filters should intersect with tier selectors')
  },
}
