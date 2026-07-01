const assert = require('node:assert/strict')
const {
  HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT,
  HISTORICAL_CHECKPOINT_DELETION_READINESS_COUNTS,
  HISTORICAL_CHECKPOINT_KEEP_SUITES,
  HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES,
  HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES,
} = require('../fixtures/kernel/historicalCheckpointDeletionMap.cjs')
const {
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT,
} = require('../fixtures/kernel/historicalCheckpointStep5Remap.cjs')
const { assertPackageVersion } = require('../helpers/packageGuards.cjs')
const {
  ARTIFACT_CI_PROVENANCE_GUARD_SUITE,
} = require('../helpers/artifactCiProvenanceGuards.cjs')
const {
  INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE,
} = require('../helpers/installLayoutPathSafetyGuards.cjs')
const {
  PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE,
} = require('../helpers/piExtensionPublicSurfaceGuards.cjs')
const {
  DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE,
} = require('../helpers/defaultGoReadinessFixtureGuards.cjs')
const {
  PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_SUITE,
} = require('../helpers/packageReleaseSecurityRollbackGuards.cjs')
const {
  PARSER_DIAGNOSTICS_GUARD_SUITE,
} = require('../helpers/parserDiagnosticsGuards.cjs')
const {
  KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE,
} = require('../helpers/kernelResolverSourceBoundaryGuards.cjs')
const {
  READINESS_COMMAND_SURFACE_GUARD_SUITE,
} = require('../helpers/readinessCommandSurfaceGuards.cjs')
const {
  GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE,
} = require('../helpers/goTmuxCutoverBatch3Guards.cjs')
const {
  classifySuite,
  discoverSuiteFiles,
  isCurrentGoKernelSuite,
  isHistoricalGoKernelSuite,
  normalizeSuiteFile,
  selectSuiteFiles,
  summarizeSelection,
} = require('../suiteManifest.cjs')

const EXPECTED_TIER_COUNTS_POST_T040 = Object.freeze({
  default: 85,
  smoke: 10,
  core: 59,
  'go-current': 26,
  audit: 105,
  benchmark: 3,
  regression: 193,
})

const EXPECTED_HISTORICAL_CHECKPOINT_DELETION_READINESS_COUNTS = Object.freeze({
  ready: 46,
  'needs-split': 0,
  keep: 1,
})

const HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT_FILE = normalizeSuiteFile(HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT)
const HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT_FILE = normalizeSuiteFile(HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT)
const ARTIFACT_CI_PROVENANCE_GUARD_SUITE_FILE = normalizeSuiteFile(ARTIFACT_CI_PROVENANCE_GUARD_SUITE)
const INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE_FILE = normalizeSuiteFile(INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE)
const PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE_FILE = normalizeSuiteFile(PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE)
const DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE_FILE = normalizeSuiteFile(DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE)
const PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_SUITE_FILE = normalizeSuiteFile(PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_SUITE)
const PARSER_DIAGNOSTICS_GUARD_SUITE_FILE = normalizeSuiteFile(PARSER_DIAGNOSTICS_GUARD_SUITE)
const KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE_FILE = normalizeSuiteFile(KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE)
const READINESS_COMMAND_SURFACE_GUARD_SUITE_FILE = normalizeSuiteFile(READINESS_COMMAND_SURFACE_GUARD_SUITE)
const GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE_FILE = normalizeSuiteFile(GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE)
const HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITE_FILES = HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES.map(normalizeSuiteFile)
const HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITE_FILES = HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES.map(normalizeSuiteFile)
const HISTORICAL_CHECKPOINT_KEEP_SUITE_FILES = HISTORICAL_CHECKPOINT_KEEP_SUITES.map(normalizeSuiteFile)
const STEP6_DELETED_READ_ONLY_AND_WINDOW_LABEL_SUITE_FILES = Object.freeze([
  'go-kernel-v0655-go-list-agentteam-panes-facade-cutover.cjs',
  'go-kernel-v0656-go-inspect-pane-facade-cutover.cjs',
  'go-kernel-v0657-go-pane-exists-facade-cutover.cjs',
  'go-kernel-v0658-go-resolve-pane-binding-facade-cutover.cjs',
  'go-kernel-v0659-go-target-for-pane-facade-cutover.cjs',
  'go-kernel-v0662-go-window-pane-lookup-facade-cutover.cjs',
  'go-kernel-v0663-go-tmux-availability-facade-cutover.cjs',
  'go-kernel-v0664-go-pane-app-start-wait-cutover.cjs',
  'go-kernel-v0665-go-agentteam-window-discovery-cutover.cjs',
  'go-kernel-v0666-go-session-existence-cutover.cjs',
  'go-kernel-v0667-go-current-binding-window-fallback-cutover.cjs',
  'go-kernel-v0668-go-detached-leader-binding-cutover.cjs',
  'go-kernel-v0669-go-detached-first-pane-cutover.cjs',
  'go-kernel-v0670-go-window-name-lookup-cutover.cjs',
  'go-kernel-v0671-go-mutating-window-marking-gate.cjs',
  'go-kernel-v0672-go-window-marking-cutover.cjs',
  'go-kernel-v0673-go-refresh-window-pane-labels-gate.cjs',
  'go-kernel-v0674-go-refresh-window-pane-labels-cutover.cjs',
  'go-kernel-v0675-go-pane-label-setting-gate.cjs',
  'go-kernel-v0676-go-pane-label-setting-cutover.cjs',
  'go-kernel-v0677-go-pane-label-clearing-gate.cjs',
  'go-kernel-v0678-go-pane-label-clearing-cutover.cjs',
])
const STEP6_OUT_OF_SCOPE_READ_ONLY_AND_HIGH_RISK_SUITE_FILES = Object.freeze([
  'go-kernel-v0653-go-inspect-pane-worker-lifecycle.cjs',
  'go-kernel-v0654-go-list-agentteam-panes-worker-lifecycle.cjs',
  'go-kernel-v0660-go-current-pane-binding-facade-cutover.cjs',
  'go-kernel-v0661-go-async-pane-binding-facade-cutover.cjs',
  'go-kernel-v0679-go-create-teammate-pane-gate.cjs',
  'go-kernel-v0680-go-create-teammate-pane-cutover.cjs',
  'go-kernel-v0681-go-detached-new-session-gate.cjs',
  'go-kernel-v0682-go-detached-new-session-cutover.cjs',
  'go-kernel-v0683-go-detached-new-window-gate.cjs',
  'go-kernel-v0684-go-detached-new-window-cutover.cjs',
  'go-kernel-v0685-go-kill-pane-gate.cjs',
  'go-kernel-v0686-go-kill-pane-cutover.cjs',
  'go-kernel-v0687-go-clear-pane-label-sync-gate.cjs',
  'go-kernel-v0688-go-clear-pane-label-sync-cutover.cjs',
])

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

    assert.equal(allSuites.length, EXPECTED_TIER_COUNTS_POST_T040.regression, 'manifest should encode the post-T040 discovered suite count')
    assert.deepEqual(summarizeSelection(allSuites), EXPECTED_TIER_COUNTS_POST_T040, 'suite tier summary should encode the post-T040 topology')
    for (const [tier, suites] of Object.entries(tierSelections)) {
      assert.equal(suites.length, EXPECTED_TIER_COUNTS_POST_T040[tier], `${tier} tier count should match post-T040 topology`)
    }
    assert.deepEqual(regressionSuites, allSuites, 'regression tier should preserve every suite')
    assert.ok(defaultSuites.length < regressionSuites.length, 'default tier should be reduced from full regression')
    assert.ok(auditSuites.length > defaultSuites.length, 'audit tier should preserve historical Go/kernel coverage explicitly')
    assert.ok(benchmarkSuites.includes('zzzzzzzzzzzzz-read-model-bench-v0414.cjs'), 'benchmark tier should preserve opt-in bench suites')
    assert.equal(defaultSuites.includes('zzzzzzzzzzzzz-read-model-bench-v0414.cjs'), false, 'default tier should exclude benchmark suites')

    assert.ok(defaultSuites.includes('service-units.cjs'), 'default tier should keep non-Go core integration coverage')
    assert.ok(defaultSuites.includes('package-install-smoke.cjs'), 'default tier should keep package/no-release smoke coverage')
    assert.deepEqual(classifySuite(ARTIFACT_CI_PROVENANCE_GUARD_SUITE_FILE).tiers, ['default', 'go-current', 'regression'], 'artifact CI provenance guard should remain current Go/default coverage')
    assert.ok(defaultSuites.includes(ARTIFACT_CI_PROVENANCE_GUARD_SUITE_FILE), 'default tier should include current artifact CI provenance guard')
    assert.ok(goCurrentSuites.includes(ARTIFACT_CI_PROVENANCE_GUARD_SUITE_FILE), 'go-current tier should include current artifact CI provenance guard')
    assert.ok(regressionSuites.includes(ARTIFACT_CI_PROVENANCE_GUARD_SUITE_FILE), 'regression tier should include current artifact CI provenance guard')
    assert.equal(auditSuites.includes(ARTIFACT_CI_PROVENANCE_GUARD_SUITE_FILE), false, 'audit tier should not classify the current artifact CI provenance guard as historical audit')
    assert.deepEqual(classifySuite(INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE_FILE).tiers, ['default', 'go-current', 'regression'], 'install-layout path-safety guard should remain current Go/default coverage')
    assert.ok(defaultSuites.includes(INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE_FILE), 'default tier should include current install-layout path-safety guard')
    assert.ok(goCurrentSuites.includes(INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE_FILE), 'go-current tier should include current install-layout path-safety guard')
    assert.ok(regressionSuites.includes(INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE_FILE), 'regression tier should include current install-layout path-safety guard')
    assert.equal(auditSuites.includes(INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE_FILE), false, 'audit tier should not classify the current install-layout path-safety guard as historical audit')
    assert.deepEqual(classifySuite(PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE_FILE).tiers, ['core', 'default', 'regression'], 'pi extension public-surface guard should remain current core/default coverage')
    assert.ok(defaultSuites.includes(PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE_FILE), 'default tier should include current pi extension public-surface guard')
    assert.ok(coreSuites.includes(PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE_FILE), 'core tier should include current pi extension public-surface guard')
    assert.ok(regressionSuites.includes(PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE_FILE), 'regression tier should include current pi extension public-surface guard')
    assert.equal(goCurrentSuites.includes(PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE_FILE), false, 'go-current tier should not classify the pi extension public-surface guard as Go-kernel coverage')
    assert.equal(auditSuites.includes(PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE_FILE), false, 'audit tier should not classify the current pi extension public-surface guard as historical audit')
    assert.deepEqual(classifySuite(DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE_FILE).tiers, ['default', 'go-current', 'regression'], 'default-Go readiness fixture guard should remain current Go/default coverage')
    assert.ok(defaultSuites.includes(DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE_FILE), 'default tier should include current default-Go readiness fixture guard')
    assert.ok(goCurrentSuites.includes(DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE_FILE), 'go-current tier should include current default-Go readiness fixture guard')
    assert.ok(regressionSuites.includes(DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE_FILE), 'regression tier should include current default-Go readiness fixture guard')
    assert.equal(coreSuites.includes(DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE_FILE), false, 'core tier should not classify the default-Go readiness fixture guard as non-Go core coverage')
    assert.equal(auditSuites.includes(DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE_FILE), false, 'audit tier should not classify the current default-Go readiness fixture guard as historical audit')
    assert.deepEqual(classifySuite(PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_SUITE_FILE).tiers, ['default', 'go-current', 'regression'], 'package/release/security/rollback guard should be current Go/default coverage')
    assert.ok(defaultSuites.includes(PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_SUITE_FILE), 'default tier should include current package/release/security/rollback guard')
    assert.ok(goCurrentSuites.includes(PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_SUITE_FILE), 'go-current tier should include current package/release/security/rollback guard')
    assert.ok(regressionSuites.includes(PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_SUITE_FILE), 'regression tier should include current package/release/security/rollback guard')
    assert.equal(coreSuites.includes(PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_SUITE_FILE), false, 'core tier should not classify the package/release/security/rollback guard as non-Go core coverage')
    assert.equal(auditSuites.includes(PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_SUITE_FILE), false, 'audit tier should not classify the current package/release/security/rollback guard as historical audit')
    assert.deepEqual(classifySuite(PARSER_DIAGNOSTICS_GUARD_SUITE_FILE).tiers, ['default', 'go-current', 'regression'], 'parser diagnostics guard should remain current Go/default coverage')
    assert.ok(defaultSuites.includes(PARSER_DIAGNOSTICS_GUARD_SUITE_FILE), 'default tier should include current parser diagnostics guard')
    assert.ok(goCurrentSuites.includes(PARSER_DIAGNOSTICS_GUARD_SUITE_FILE), 'go-current tier should include current parser diagnostics guard')
    assert.ok(regressionSuites.includes(PARSER_DIAGNOSTICS_GUARD_SUITE_FILE), 'regression tier should include current parser diagnostics guard')
    assert.equal(auditSuites.includes(PARSER_DIAGNOSTICS_GUARD_SUITE_FILE), false, 'audit tier should not classify the current parser diagnostics guard as historical audit')
    assert.deepEqual(classifySuite(KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE_FILE).tiers, ['default', 'go-current', 'regression'], 'kernel resolver source-boundary guard should remain current Go/default coverage')
    assert.ok(defaultSuites.includes(KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE_FILE), 'default tier should include current kernel resolver source-boundary guard')
    assert.ok(goCurrentSuites.includes(KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE_FILE), 'go-current tier should include current kernel resolver source-boundary guard')
    assert.ok(regressionSuites.includes(KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE_FILE), 'regression tier should include current kernel resolver source-boundary guard')
    assert.equal(auditSuites.includes(KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE_FILE), false, 'audit tier should not classify the current kernel resolver source-boundary guard as historical audit')
    assert.deepEqual(classifySuite(READINESS_COMMAND_SURFACE_GUARD_SUITE_FILE).tiers, ['core', 'default', 'regression'], 'readiness command surface guard should remain current core/default coverage')
    assert.ok(defaultSuites.includes(READINESS_COMMAND_SURFACE_GUARD_SUITE_FILE), 'default tier should include current readiness command surface guard')
    assert.ok(coreSuites.includes(READINESS_COMMAND_SURFACE_GUARD_SUITE_FILE), 'core tier should include current readiness command surface guard')
    assert.ok(regressionSuites.includes(READINESS_COMMAND_SURFACE_GUARD_SUITE_FILE), 'regression tier should include current readiness command surface guard')
    assert.equal(auditSuites.includes(READINESS_COMMAND_SURFACE_GUARD_SUITE_FILE), false, 'audit tier should not classify the current readiness command surface guard as historical audit')
    assert.deepEqual(classifySuite(GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE_FILE).tiers, ['default', 'go-current', 'regression'], 'Step 6 batch 3 tmux cutover guard should be current Go/default coverage')
    assert.ok(defaultSuites.includes(GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE_FILE), 'default tier should include current Step 6 batch 3 tmux cutover guard')
    assert.ok(goCurrentSuites.includes(GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE_FILE), 'go-current tier should include current Step 6 batch 3 tmux cutover guard')
    assert.ok(regressionSuites.includes(GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE_FILE), 'regression tier should include current Step 6 batch 3 tmux cutover guard')
    assert.equal(auditSuites.includes(GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE_FILE), false, 'audit tier should not classify the current Step 6 batch 3 tmux cutover guard as historical audit')
    assert.equal(coreSuites.includes(GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE_FILE), false, 'core tier should not classify the Step 6 batch 3 tmux cutover guard as non-Go core coverage')
    assert.ok(smokeSuites.includes('package-install-smoke.cjs'), 'smoke tier should include package smoke coverage')
    assert.ok(goCurrentSuites.includes('go-kernel-v0696-v07-release-decision-package.cjs'), 'go-current tier should keep latest release/no-action guard')
    assert.ok(defaultSuites.includes('go-kernel-v0696-v07-release-decision-package.cjs'), 'default tier should keep current Go release guard')
    assert.ok(auditSuites.includes('go-kernel-v0688-go-clear-pane-label-sync-cutover.cjs'), 'audit tier should retain historical cutover coverage')
    assert.ok(auditSuites.includes('go-kernel-v0688-historical-checkpoints-audit.cjs'), 'audit tier should include the historical checkpoint manifest audit')
    for (const file of STEP6_DELETED_READ_ONLY_AND_WINDOW_LABEL_SUITE_FILES) {
      assert.equal(allSuites.includes(file), false, `${file} should be absent after Step 6 read-only facade/orchestration and non-destructive window/label deletion`)
      assert.equal(auditSuites.includes(file), false, `${file} should not remain in audit after Step 6 read-only facade/orchestration and non-destructive window/label deletion`)
      assert.equal(regressionSuites.includes(file), false, `${file} should not remain in regression after Step 6 read-only facade/orchestration and non-destructive window/label deletion`)
    }
    for (const file of STEP6_OUT_OF_SCOPE_READ_ONLY_AND_HIGH_RISK_SUITE_FILES) {
      assert.ok(allSuites.includes(file), `${file} should remain discoverable because it is out of T040 scope`)
      assert.ok(auditSuites.includes(file), `${file} should remain audit coverage because it is out of T040 scope`)
      assert.ok(regressionSuites.includes(file), `${file} should remain regression coverage because it is out of T040 scope`)
    }
    assert.deepEqual(classifySuite(HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT_FILE).tiers, ['audit', 'regression'], 'deletion parity suite must remain audit/regression only')
    assert.ok(auditSuites.includes(HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT_FILE), 'audit tier should include the historical checkpoint deletion parity audit')
    assert.ok(regressionSuites.includes(HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT_FILE), 'regression tier should include the historical checkpoint deletion parity audit')
    assert.deepEqual(classifySuite(HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT_FILE).tiers, ['audit', 'regression'], 'Step 5A package/release remap suite must remain audit/regression only')
    assert.ok(auditSuites.includes(HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT_FILE), 'audit tier should include the Step 5A package/release remap audit')
    assert.ok(regressionSuites.includes(HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT_FILE), 'regression tier should include the Step 5A package/release remap audit')
    assert.equal(defaultSuites.includes('go-kernel-v0688-go-clear-pane-label-sync-cutover.cjs'), false, 'default tier should remove historical audit coverage')
    assert.equal(defaultSuites.includes('go-kernel-v0688-historical-checkpoints-audit.cjs'), false, 'default tier should exclude the historical checkpoint manifest audit')
    assert.equal(defaultSuites.includes(HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT_FILE), false, 'default tier should exclude the historical checkpoint deletion parity audit')
    assert.equal(defaultSuites.includes(HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT_FILE), false, 'default tier should exclude the Step 5A package/release remap audit')
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
    assert.equal(HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITE_FILES.length, EXPECTED_HISTORICAL_CHECKPOINT_DELETION_READINESS_COUNTS.ready, 'T024+Step5C+Step5D ready/deleted suite list should remain exactly 46 suites')
    for (const file of HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITE_FILES) {
      assert.equal(allSuites.includes(file), false, `${file} should remain absent after the T024/Step5C/Step5D ready-suite deletion slices`)
      assert.equal(auditSuites.includes(file), false, `${file} should not reappear in audit after the T024/Step5C/Step5D deletion slices`)
      assert.equal(regressionSuites.includes(file), false, `${file} should not reappear in regression after the T024/Step5C/Step5D deletion slices`)
    }
    for (const file of [...HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITE_FILES, ...HISTORICAL_CHECKPOINT_KEEP_SUITE_FILES]) {
      assert.ok(allSuites.includes(file), `${file} should remain discoverable after the T024/Step5C/Step5D deletion slices`)
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
