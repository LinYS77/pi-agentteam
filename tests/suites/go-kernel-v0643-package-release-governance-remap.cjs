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
const {
  READINESS_COMMAND_SURFACE_CATEGORIES: HELPER_READINESS_CATEGORIES,
  READINESS_COMMAND_SURFACE_GUARD_HELPER,
  READINESS_COMMAND_SURFACE_GUARD_SUITE,
  assertReadinessCommandSurface,
} = require('../helpers/readinessCommandSurfaceGuards.cjs')
const {
  PARSER_DIAGNOSTICS_CATEGORIES: HELPER_PARSER_DIAGNOSTICS_CATEGORIES,
  PARSER_DIAGNOSTICS_GUARD_HELPER,
  PARSER_DIAGNOSTICS_GUARD_SUITE,
  assertParserDiagnosticsGuard,
} = require('../helpers/parserDiagnosticsGuards.cjs')
const {
  KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES: HELPER_KERNEL_RESOLVER_CATEGORIES,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE,
  assertKernelResolverSourceBoundaryGuard,
} = require('../helpers/kernelResolverSourceBoundaryGuards.cjs')
const {
  ARTIFACT_CI_PROVENANCE_CATEGORIES: HELPER_ARTIFACT_CI_PROVENANCE_CATEGORIES,
  ARTIFACT_CI_PROVENANCE_GUARD_HELPER,
  ARTIFACT_CI_PROVENANCE_GUARD_SUITE,
  assertArtifactCiProvenanceGuard,
} = require('../helpers/artifactCiProvenanceGuards.cjs')
const {
  INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES: HELPER_INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES,
  INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER,
  INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE,
  assertInstallLayoutPathSafetyGuard,
} = require('../helpers/installLayoutPathSafetyGuards.cjs')
const {
  PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES: HELPER_PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES,
  PI_EXTENSION_PUBLIC_SURFACE_GUARD_HELPER,
  PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE,
  assertPiExtensionPublicSurfaceGuard,
} = require('../helpers/piExtensionPublicSurfaceGuards.cjs')
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
  HISTORICAL_CHECKPOINT_STEP5B_READINESS_SURFACE_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5C_PARSER_DIAGNOSTICS_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5C_KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5C_ARTIFACT_CI_PROVENANCE_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_COUNTS,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_INPUTS,
  HISTORICAL_CHECKPOINT_STEP5A_STATUS_VALUES,
  HISTORICAL_CHECKPOINT_STEP5A_STILL_KEEP_SUITES,
  HISTORICAL_CHECKPOINT_STEP5A_STILL_NEEDS_SPLIT_SUITES,
  HISTORICAL_CHECKPOINT_STEP5B_DELETION_CANDIDATE_SUITES,
  HISTORICAL_CHECKPOINT_STEP5C_DELETION_CANDIDATE_SUITES,
  ARTIFACT_CI_PROVENANCE_CATEGORIES,
  ARTIFACT_CI_PROVENANCE_CATEGORY_DESCRIPTIONS,
  INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES,
  INSTALL_LAYOUT_PATH_SAFETY_CATEGORY_DESCRIPTIONS,
  PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES,
  PI_EXTENSION_PUBLIC_SURFACE_CATEGORY_DESCRIPTIONS,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORY_DESCRIPTIONS,
  PARSER_DIAGNOSTICS_CATEGORIES,
  PARSER_DIAGNOSTICS_CATEGORY_DESCRIPTIONS,
  READINESS_COMMAND_SURFACE_CATEGORIES,
  READINESS_COMMAND_SURFACE_CATEGORY_DESCRIPTIONS,
  RESIDUAL_REMAP_DETAILS,
} = require('../fixtures/kernel/historicalCheckpointStep5Remap.cjs')

const EXPECTED_REMAINING_TOTAL = 32
const EXPECTED_STEP5B_READY = 0
const EXPECTED_STEP5C_READY = 24
const EXPECTED_STILL_NEEDS_SPLIT = 7
const EXPECTED_STILL_KEEP = 1
const EXPECTED_STEP5C_PARSER_DIAGNOSTICS_CANDIDATES = Object.freeze([
  'tests/suites/go-kernel-v0419-tmux-readiness-docs.cjs',
  'tests/suites/go-kernel-v0419-readiness-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0423-compact-diagnostics-checkpoint-docs.cjs',
])
const EXPECTED_STEP5C_READINESS_CANDIDATES = Object.freeze([
  'tests/suites/go-kernel-v0424-readiness-command-contract-docs.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-seam-docs.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-sunset-docs.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-checkpoint-docs.cjs',
])
const EXPECTED_STEP5C_KERNEL_RESOLVER_CANDIDATES = Object.freeze([
  'tests/suites/go-kernel-v0421-runtime-availability-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0422-native-package-metadata-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0425-native-availability-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0426-artifact-pipeline-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0427-clean-install-consumption-contract-docs.cjs',
  'tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs',
])
const EXPECTED_STEP5C_ARTIFACT_CI_PROVENANCE_CANDIDATES = Object.freeze([
  'tests/suites/go-kernel-v0629-real-implementation-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0630-ci-review-artifact-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0631-ci-review-artifact-hardening-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0632-ci-review-provenance-checkpoint-docs.cjs',
])
const EXPECTED_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_CANDIDATES = Object.freeze([
  'tests/suites/go-kernel-v0427-install-layout-matrix-docs.cjs',
  'tests/suites/go-kernel-v0633-clean-install-proof-contract-docs.cjs',
  'tests/suites/go-kernel-v0633-clean-install-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0634-ownership-install-layout-contract-docs.cjs',
  'tests/suites/go-kernel-v0634-distribution-option-matrix-docs.cjs',
])
const EXPECTED_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_CANDIDATES = Object.freeze([
  'tests/suites/go-kernel-v0635-pi-extension-compliance-contract-docs.cjs',
  'tests/suites/go-kernel-v0635-pi-extension-compliance-checkpoint-docs.cjs',
])
const EXPECTED_STEP5C_DELETION_CANDIDATES = Object.freeze([
  ...EXPECTED_STEP5C_PARSER_DIAGNOSTICS_CANDIDATES,
  ...EXPECTED_STEP5C_READINESS_CANDIDATES,
  ...EXPECTED_STEP5C_KERNEL_RESOLVER_CANDIDATES,
  ...EXPECTED_STEP5C_ARTIFACT_CI_PROVENANCE_CANDIDATES,
  ...EXPECTED_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_CANDIDATES,
  ...EXPECTED_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_CANDIDATES,
])

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
  'core/kernelContract.ts',
  'core/kernelPackagedResolver.ts',
  'tmux/snapshot.ts',
  'adapters/tmux/teamPanes.ts',
  'commands/readiness.ts',
  'commands/team.ts',
  'api/tools.ts',
  'api/commands.ts',
  'core/kernelDiagnostics.ts',
  'runtime/leaderAttention.ts',
  'runtime/leaderMailboxSignalRuntime.ts',
  'runtime/bridgeDeliveryPump.ts',
  'adapters/bridge/delivery.ts',
  'adapters/runtime/service.ts',
  'teamPanel/layout.ts',
  'tools/message.ts',
  'tools/messageReceive.ts',
  'tools/messageService.ts',
  'tools/task.ts',
  'tools/taskService.ts',
  'tools/teamService.ts',
  'tools/workerPrompt.ts',
  'tools/workerSpawnService.ts',
  'app/messageReceiveApplication.ts',
  'app/taskReadCommands.ts',
  'workerTurnPrompt.ts',
  'kernel/go/agentteam-kernel/main.go',
])

const FIXTURE_AND_HELPER_FILES_THAT_MUST_REMAIN = Object.freeze([
  'tests/fixtures/kernel/historicalCheckpoints.cjs',
  'tests/fixtures/kernel/historicalCheckpointDeletionMap.cjs',
  'tests/fixtures/kernel/historicalCheckpointStep5Remap.cjs',
  'tests/fixtures/kernel/tmux/snapshotCases.cjs',
  'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs',
  'tests/helpers/artifactCiProvenanceGuards.cjs',
  'tests/helpers/fsAssertions.cjs',
  'tests/helpers/goKernelGuards.cjs',
  'tests/helpers/nativeGuards.cjs',
  'tests/helpers/packageGuards.cjs',
  'tests/helpers/packageReleaseGovernanceGuards.cjs',
  'tests/helpers/parserDiagnosticsGuards.cjs',
  'tests/helpers/installLayoutPathSafetyGuards.cjs',
  'tests/helpers/piExtensionPublicSurfaceGuards.cjs',
  'tests/helpers/kernelResolverSourceBoundaryGuards.cjs',
  'tests/helpers/readinessCommandSurfaceGuards.cjs',
  'tests/helpers/reviewArtifactWorkflowGuard.cjs',
  'tests/suites/go-kernel-artifact-ci-provenance-guard.cjs',
  'tests/suites/go-kernel-install-layout-path-safety-guard.cjs',
  'tests/suites/go-kernel-parser-diagnostics-guard.cjs',
  'tests/suites/go-kernel-resolver-source-boundary-guard.cjs',
  'tests/suites/pi-extension-public-surface-install-load-guard.cjs',
  'tests/suites/readiness-command-surface-guard.cjs',
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

async function assertReadinessGuard(root, env) {
  const result = await assertReadinessCommandSurface(root, env)
  assertSameSet(result.checkedCategories, HELPER_READINESS_CATEGORIES, 'helper checked readiness command surface categories')
  assertSameSet(READINESS_COMMAND_SURFACE_CATEGORIES, HELPER_READINESS_CATEGORIES, 'remap fixture readiness categories')
  assert.equal(Object.keys(READINESS_COMMAND_SURFACE_CATEGORY_DESCRIPTIONS).length, HELPER_READINESS_CATEGORIES.length, 'each readiness category should have a description')
  for (const category of HELPER_READINESS_CATEGORIES) {
    assert.ok(READINESS_COMMAND_SURFACE_CATEGORY_DESCRIPTIONS[category], `${category} should have a description`)
  }
  assert.equal(HISTORICAL_CHECKPOINT_STEP5B_READINESS_SURFACE_GUARD_EVIDENCE.suite, READINESS_COMMAND_SURFACE_GUARD_SUITE, 'readiness evidence should point at current guard suite')
  assert.equal(HISTORICAL_CHECKPOINT_STEP5B_READINESS_SURFACE_GUARD_EVIDENCE.helper, READINESS_COMMAND_SURFACE_GUARD_HELPER, 'readiness evidence should point at current guard helper')
  for (const rel of [
    HISTORICAL_CHECKPOINT_STEP5B_READINESS_SURFACE_GUARD_EVIDENCE.suite,
    HISTORICAL_CHECKPOINT_STEP5B_READINESS_SURFACE_GUARD_EVIDENCE.helper,
    ...HISTORICAL_CHECKPOINT_STEP5B_READINESS_SURFACE_GUARD_EVIDENCE.sourceFiles,
  ]) {
    assert.equal(existsRel(root, rel), true, `${rel} should exist as readiness command surface guard evidence`)
  }
  assert.ok(HISTORICAL_CHECKPOINT_STEP5B_READINESS_SURFACE_GUARD_EVIDENCE.behaviorEvidence.length >= 3, 'readiness guard evidence should include behavioral checks')
}

async function assertParserDiagnosticsGuardCoverage(root, env) {
  const result = await assertParserDiagnosticsGuard(root, env)
  assertSameSet(result.checkedCategories, HELPER_PARSER_DIAGNOSTICS_CATEGORIES, 'helper checked parser diagnostics categories')
  assertSameSet(PARSER_DIAGNOSTICS_CATEGORIES, HELPER_PARSER_DIAGNOSTICS_CATEGORIES, 'remap fixture parser diagnostics categories')
  assert.equal(Object.keys(PARSER_DIAGNOSTICS_CATEGORY_DESCRIPTIONS).length, HELPER_PARSER_DIAGNOSTICS_CATEGORIES.length, 'each parser diagnostics category should have a description')
  for (const category of HELPER_PARSER_DIAGNOSTICS_CATEGORIES) {
    assert.ok(PARSER_DIAGNOSTICS_CATEGORY_DESCRIPTIONS[category], `${category} should have a description`)
  }
  assert.equal(HISTORICAL_CHECKPOINT_STEP5C_PARSER_DIAGNOSTICS_GUARD_EVIDENCE.suite, PARSER_DIAGNOSTICS_GUARD_SUITE, 'parser diagnostics evidence should point at current guard suite')
  assert.equal(HISTORICAL_CHECKPOINT_STEP5C_PARSER_DIAGNOSTICS_GUARD_EVIDENCE.helper, PARSER_DIAGNOSTICS_GUARD_HELPER, 'parser diagnostics evidence should point at current guard helper')
  for (const rel of [
    HISTORICAL_CHECKPOINT_STEP5C_PARSER_DIAGNOSTICS_GUARD_EVIDENCE.suite,
    HISTORICAL_CHECKPOINT_STEP5C_PARSER_DIAGNOSTICS_GUARD_EVIDENCE.helper,
    ...HISTORICAL_CHECKPOINT_STEP5C_PARSER_DIAGNOSTICS_GUARD_EVIDENCE.sourceFiles,
    ...HISTORICAL_CHECKPOINT_STEP5C_PARSER_DIAGNOSTICS_GUARD_EVIDENCE.supportingFixtures,
    ...HISTORICAL_CHECKPOINT_STEP5C_PARSER_DIAGNOSTICS_GUARD_EVIDENCE.supportingSuites,
  ]) {
    assert.equal(existsRel(root, rel), true, `${rel} should exist as parser diagnostics guard evidence`)
  }
  assert.ok(HISTORICAL_CHECKPOINT_STEP5C_PARSER_DIAGNOSTICS_GUARD_EVIDENCE.behaviorEvidence.length >= 3, 'parser diagnostics guard evidence should include behavioral checks')
}

async function assertKernelResolverGuardCoverage(root, env) {
  const result = await assertKernelResolverSourceBoundaryGuard(root, env)
  assertSameSet(result.checkedCategories, HELPER_KERNEL_RESOLVER_CATEGORIES, 'helper checked kernel/resolver source-boundary categories')
  assertSameSet(KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES, HELPER_KERNEL_RESOLVER_CATEGORIES, 'remap fixture kernel/resolver categories')
  assert.equal(Object.keys(KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORY_DESCRIPTIONS).length, HELPER_KERNEL_RESOLVER_CATEGORIES.length, 'each kernel/resolver category should have a description')
  for (const category of HELPER_KERNEL_RESOLVER_CATEGORIES) {
    assert.ok(KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORY_DESCRIPTIONS[category], `${category} should have a description`)
  }
  assert.equal(HISTORICAL_CHECKPOINT_STEP5C_KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_EVIDENCE.suite, KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE, 'kernel/resolver evidence should point at current guard suite')
  assert.equal(HISTORICAL_CHECKPOINT_STEP5C_KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_EVIDENCE.helper, KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER, 'kernel/resolver evidence should point at current guard helper')
  for (const rel of [
    HISTORICAL_CHECKPOINT_STEP5C_KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_EVIDENCE.suite,
    HISTORICAL_CHECKPOINT_STEP5C_KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_EVIDENCE.helper,
    ...HISTORICAL_CHECKPOINT_STEP5C_KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_EVIDENCE.sourceFiles,
    ...HISTORICAL_CHECKPOINT_STEP5C_KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_EVIDENCE.supportingFixtures,
    ...HISTORICAL_CHECKPOINT_STEP5C_KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_EVIDENCE.supportingSuites,
  ]) {
    assert.equal(existsRel(root, rel), true, `${rel} should exist as kernel/resolver source-boundary guard evidence`)
  }
  assert.ok(HISTORICAL_CHECKPOINT_STEP5C_KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_EVIDENCE.behaviorEvidence.length >= 3, 'kernel/resolver guard evidence should include behavioral checks')
}

async function assertArtifactCiProvenanceGuardCoverage(root) {
  const result = await assertArtifactCiProvenanceGuard(root)
  assertSameSet(result.checkedCategories, HELPER_ARTIFACT_CI_PROVENANCE_CATEGORIES, 'helper checked artifact/CI/provenance categories')
  assertSameSet(ARTIFACT_CI_PROVENANCE_CATEGORIES, HELPER_ARTIFACT_CI_PROVENANCE_CATEGORIES, 'remap fixture artifact/CI/provenance categories')
  assert.equal(Object.keys(ARTIFACT_CI_PROVENANCE_CATEGORY_DESCRIPTIONS).length, HELPER_ARTIFACT_CI_PROVENANCE_CATEGORIES.length, 'each artifact/CI/provenance category should have a description')
  for (const category of HELPER_ARTIFACT_CI_PROVENANCE_CATEGORIES) {
    assert.ok(ARTIFACT_CI_PROVENANCE_CATEGORY_DESCRIPTIONS[category], `${category} should have a description`)
  }
  assert.equal(HISTORICAL_CHECKPOINT_STEP5C_ARTIFACT_CI_PROVENANCE_GUARD_EVIDENCE.suite, ARTIFACT_CI_PROVENANCE_GUARD_SUITE, 'artifact/CI/provenance evidence should point at current guard suite')
  assert.equal(HISTORICAL_CHECKPOINT_STEP5C_ARTIFACT_CI_PROVENANCE_GUARD_EVIDENCE.helper, ARTIFACT_CI_PROVENANCE_GUARD_HELPER, 'artifact/CI/provenance evidence should point at current guard helper')
  for (const rel of [
    HISTORICAL_CHECKPOINT_STEP5C_ARTIFACT_CI_PROVENANCE_GUARD_EVIDENCE.suite,
    HISTORICAL_CHECKPOINT_STEP5C_ARTIFACT_CI_PROVENANCE_GUARD_EVIDENCE.helper,
    ...HISTORICAL_CHECKPOINT_STEP5C_ARTIFACT_CI_PROVENANCE_GUARD_EVIDENCE.sourceFiles,
    ...HISTORICAL_CHECKPOINT_STEP5C_ARTIFACT_CI_PROVENANCE_GUARD_EVIDENCE.supportingDocs,
    ...HISTORICAL_CHECKPOINT_STEP5C_ARTIFACT_CI_PROVENANCE_GUARD_EVIDENCE.supportingSuites,
  ]) {
    assert.equal(existsRel(root, rel), true, `${rel} should exist as artifact/CI/provenance guard evidence`)
  }
  assert.ok(HISTORICAL_CHECKPOINT_STEP5C_ARTIFACT_CI_PROVENANCE_GUARD_EVIDENCE.behaviorEvidence.length >= 3, 'artifact/CI/provenance guard evidence should include behavioral checks')
}

async function assertInstallLayoutPathSafetyGuardCoverage(root, env) {
  const result = await assertInstallLayoutPathSafetyGuard(root, env)
  assertSameSet(result.checkedCategories, HELPER_INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES, 'helper checked install-layout/path-safety categories')
  assertSameSet(INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES, HELPER_INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES, 'remap fixture install-layout/path-safety categories')
  assert.equal(Object.keys(INSTALL_LAYOUT_PATH_SAFETY_CATEGORY_DESCRIPTIONS).length, HELPER_INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES.length, 'each install-layout/path-safety category should have a description')
  for (const category of HELPER_INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES) {
    assert.ok(INSTALL_LAYOUT_PATH_SAFETY_CATEGORY_DESCRIPTIONS[category], `${category} should have a description`)
  }
  assert.equal(HISTORICAL_CHECKPOINT_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_GUARD_EVIDENCE.suite, INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE, 'install-layout/path-safety evidence should point at current guard suite')
  assert.equal(HISTORICAL_CHECKPOINT_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_GUARD_EVIDENCE.helper, INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER, 'install-layout/path-safety evidence should point at current guard helper')
  for (const rel of [
    HISTORICAL_CHECKPOINT_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_GUARD_EVIDENCE.suite,
    HISTORICAL_CHECKPOINT_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_GUARD_EVIDENCE.helper,
    ...HISTORICAL_CHECKPOINT_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_GUARD_EVIDENCE.sourceFiles,
    ...HISTORICAL_CHECKPOINT_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_GUARD_EVIDENCE.supportingDocs,
    ...HISTORICAL_CHECKPOINT_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_GUARD_EVIDENCE.supportingSuites,
  ]) {
    assert.equal(existsRel(root, rel), true, `${rel} should exist as install-layout/path-safety guard evidence`)
  }
  assert.ok(HISTORICAL_CHECKPOINT_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_GUARD_EVIDENCE.behaviorEvidence.length >= 3, 'install-layout/path-safety guard evidence should include behavioral checks')
}

function assertPiExtensionPublicSurfaceGuardCoverage(root, env) {
  const result = assertPiExtensionPublicSurfaceGuard(root, env)
  assertSameSet(result.checkedCategories, HELPER_PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES, 'helper checked pi extension public-surface categories')
  assertSameSet(PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES, HELPER_PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES, 'remap fixture pi extension public-surface categories')
  assert.equal(Object.keys(PI_EXTENSION_PUBLIC_SURFACE_CATEGORY_DESCRIPTIONS).length, HELPER_PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES.length, 'each pi extension public-surface category should have a description')
  for (const category of HELPER_PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES) {
    assert.ok(PI_EXTENSION_PUBLIC_SURFACE_CATEGORY_DESCRIPTIONS[category], `${category} should have a description`)
  }
  assert.equal(HISTORICAL_CHECKPOINT_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_GUARD_EVIDENCE.suite, PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE, 'pi extension public-surface evidence should point at current guard suite')
  assert.equal(HISTORICAL_CHECKPOINT_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_GUARD_EVIDENCE.helper, PI_EXTENSION_PUBLIC_SURFACE_GUARD_HELPER, 'pi extension public-surface evidence should point at current guard helper')
  for (const rel of [
    HISTORICAL_CHECKPOINT_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_GUARD_EVIDENCE.suite,
    HISTORICAL_CHECKPOINT_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_GUARD_EVIDENCE.helper,
    ...HISTORICAL_CHECKPOINT_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_GUARD_EVIDENCE.sourceFiles,
    ...HISTORICAL_CHECKPOINT_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_GUARD_EVIDENCE.supportingDocs,
    ...HISTORICAL_CHECKPOINT_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_GUARD_EVIDENCE.supportingSuites,
  ]) {
    assert.equal(existsRel(root, rel), true, `${rel} should exist as pi extension public-surface guard evidence`)
  }
  assert.ok(HISTORICAL_CHECKPOINT_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_GUARD_EVIDENCE.behaviorEvidence.length >= 3, 'pi extension public-surface guard evidence should include behavioral checks')
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
    step5CReady: EXPECTED_STEP5C_READY,
    stillNeedsSplit: EXPECTED_STILL_NEEDS_SPLIT,
    stillKeep: EXPECTED_STILL_KEEP,
  }, 'Step 5 remap counts should stay explicit')
  assertSameSet(HISTORICAL_CHECKPOINT_STEP5C_DELETION_CANDIDATE_SUITES, EXPECTED_STEP5C_DELETION_CANDIDATES, 'Step 5C deletion candidate list')
  assertSameSet(HISTORICAL_CHECKPOINT_STEP5A_STILL_NEEDS_SPLIT_SUITES, HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES.filter(suite => !HISTORICAL_CHECKPOINT_STEP5C_DELETION_CANDIDATE_SUITES.includes(suite)), 'Step 5 still-needs-split suites')
  assertSameSet(HISTORICAL_CHECKPOINT_STEP5A_STILL_KEEP_SUITES, HISTORICAL_CHECKPOINT_KEEP_SUITES, 'Step 5 still-keep suites')
  assert.deepEqual(HISTORICAL_CHECKPOINT_STEP5B_DELETION_CANDIDATE_SUITES, [], 'Step 5B package/release-only deletion candidate list should remain empty')

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
    } else if (entry.step5CDeletionCandidate) {
      const readinessCandidate = EXPECTED_STEP5C_READINESS_CANDIDATES.includes(entry.suite)
      const parserDiagnosticsCandidate = EXPECTED_STEP5C_PARSER_DIAGNOSTICS_CANDIDATES.includes(entry.suite)
      const kernelResolverCandidate = EXPECTED_STEP5C_KERNEL_RESOLVER_CANDIDATES.includes(entry.suite)
      const artifactCiProvenanceCandidate = EXPECTED_STEP5C_ARTIFACT_CI_PROVENANCE_CANDIDATES.includes(entry.suite)
      const installLayoutPathSafetyCandidate = EXPECTED_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_CANDIDATES.includes(entry.suite)
      const piExtensionPublicSurfaceCandidate = EXPECTED_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_CANDIDATES.includes(entry.suite)
      assert.equal(entry.currentStatus, 'step5c-ready', `${entry.suite} Step 5C candidate should have step5c-ready status`)
      assert.equal(readinessCandidate || parserDiagnosticsCandidate || kernelResolverCandidate || artifactCiProvenanceCandidate || installLayoutPathSafetyCandidate || piExtensionPublicSurfaceCandidate, true, `${entry.suite} Step 5C candidate should be backed by a known migrated current guard`)
      assert.deepEqual(entry.residualUniqueAssertions, [], `${entry.suite} Step 5C candidate should have no residual assertions`)
      assert.deepEqual(entry.residualRisks, [], `${entry.suite} Step 5C candidate should have no residual risks`)
      if (readinessCandidate) {
        assertSameSet(entry.readinessCommandSurfaceAssertionCategories, HELPER_READINESS_CATEGORIES, `${entry.suite} Step 5C readiness coverage categories`)
        assert.equal(entry.readinessCommandSurfaceGuardEvidence.suite, READINESS_COMMAND_SURFACE_GUARD_SUITE, `${entry.suite} Step 5C readiness guard suite evidence`)
        assert.equal(entry.readinessCommandSurfaceGuardEvidence.helper, READINESS_COMMAND_SURFACE_GUARD_HELPER, `${entry.suite} Step 5C readiness guard helper evidence`)
        assert.ok(entry.rationale.includes('current readiness command surface guard'), `${entry.suite} Step 5C rationale should cite the current readiness guard`)
      } else {
        assert.deepEqual(entry.readinessCommandSurfaceAssertionCategories, [], `${entry.suite} non-readiness Step 5C candidate should not claim readiness categories`)
        assert.equal(entry.readinessCommandSurfaceGuardEvidence, null, `${entry.suite} non-readiness Step 5C candidate should not claim readiness guard evidence`)
      }
      if (parserDiagnosticsCandidate) {
        assertSameSet(entry.parserDiagnosticsAssertionCategories, HELPER_PARSER_DIAGNOSTICS_CATEGORIES, `${entry.suite} Step 5C parser diagnostics coverage categories`)
        assert.equal(entry.parserDiagnosticsGuardEvidence.suite, PARSER_DIAGNOSTICS_GUARD_SUITE, `${entry.suite} Step 5C parser diagnostics guard suite evidence`)
        assert.equal(entry.parserDiagnosticsGuardEvidence.helper, PARSER_DIAGNOSTICS_GUARD_HELPER, `${entry.suite} Step 5C parser diagnostics guard helper evidence`)
        assert.ok(entry.rationale.includes('current parser parity/compact diagnostics guard'), `${entry.suite} Step 5C rationale should cite the current parser diagnostics guard`)
      } else {
        assert.deepEqual(entry.parserDiagnosticsAssertionCategories, [], `${entry.suite} non-parser Step 5C candidate should not claim parser diagnostics categories`)
        assert.equal(entry.parserDiagnosticsGuardEvidence, null, `${entry.suite} non-parser Step 5C candidate should not claim parser diagnostics guard evidence`)
      }
      if (kernelResolverCandidate) {
        assertSameSet(entry.kernelResolverSourceBoundaryAssertionCategories, HELPER_KERNEL_RESOLVER_CATEGORIES, `${entry.suite} Step 5C kernel/resolver coverage categories`)
        assert.equal(entry.kernelResolverSourceBoundaryGuardEvidence.suite, KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE, `${entry.suite} Step 5C kernel/resolver guard suite evidence`)
        assert.equal(entry.kernelResolverSourceBoundaryGuardEvidence.helper, KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER, `${entry.suite} Step 5C kernel/resolver guard helper evidence`)
        assert.ok(entry.rationale.includes('current kernel/resolver source-boundary guard'), `${entry.suite} Step 5C rationale should cite the current kernel/resolver guard`)
      } else {
        assert.deepEqual(entry.kernelResolverSourceBoundaryAssertionCategories, [], `${entry.suite} non-kernel/resolver Step 5C candidate should not claim kernel/resolver categories`)
        assert.equal(entry.kernelResolverSourceBoundaryGuardEvidence, null, `${entry.suite} non-kernel/resolver Step 5C candidate should not claim kernel/resolver guard evidence`)
      }
      if (artifactCiProvenanceCandidate) {
        assertSameSet(entry.artifactCiProvenanceAssertionCategories, HELPER_ARTIFACT_CI_PROVENANCE_CATEGORIES, `${entry.suite} Step 5C artifact/CI/provenance coverage categories`)
        assert.equal(entry.artifactCiProvenanceGuardEvidence.suite, ARTIFACT_CI_PROVENANCE_GUARD_SUITE, `${entry.suite} Step 5C artifact/CI/provenance guard suite evidence`)
        assert.equal(entry.artifactCiProvenanceGuardEvidence.helper, ARTIFACT_CI_PROVENANCE_GUARD_HELPER, `${entry.suite} Step 5C artifact/CI/provenance guard helper evidence`)
        assert.ok(entry.rationale.includes('current artifact/CI/provenance guard'), `${entry.suite} Step 5C rationale should cite the current artifact/CI/provenance guard`)
      } else {
        assert.deepEqual(entry.artifactCiProvenanceAssertionCategories, [], `${entry.suite} non-artifact/CI/provenance Step 5C candidate should not claim artifact/CI/provenance categories`)
        assert.equal(entry.artifactCiProvenanceGuardEvidence, null, `${entry.suite} non-artifact/CI/provenance Step 5C candidate should not claim artifact/CI/provenance guard evidence`)
      }
      if (installLayoutPathSafetyCandidate) {
        assertSameSet(entry.installLayoutPathSafetyAssertionCategories, HELPER_INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES, `${entry.suite} Step 5C install-layout/path-safety coverage categories`)
        assert.equal(entry.installLayoutPathSafetyGuardEvidence.suite, INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE, `${entry.suite} Step 5C install-layout/path-safety guard suite evidence`)
        assert.equal(entry.installLayoutPathSafetyGuardEvidence.helper, INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER, `${entry.suite} Step 5C install-layout/path-safety guard helper evidence`)
        assert.ok(entry.rationale.includes('current install-layout/platform path-safety guard'), `${entry.suite} Step 5C rationale should cite the current install-layout/path-safety guard`)
      } else {
        assert.deepEqual(entry.installLayoutPathSafetyAssertionCategories, [], `${entry.suite} non-install-layout/path-safety Step 5C candidate should not claim install-layout/path-safety categories`)
        assert.equal(entry.installLayoutPathSafetyGuardEvidence, null, `${entry.suite} non-install-layout/path-safety Step 5C candidate should not claim install-layout/path-safety guard evidence`)
      }
      if (piExtensionPublicSurfaceCandidate) {
        assertSameSet(entry.piExtensionPublicSurfaceAssertionCategories, HELPER_PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES, `${entry.suite} Step 5C pi extension public-surface coverage categories`)
        assert.equal(entry.piExtensionPublicSurfaceGuardEvidence.suite, PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE, `${entry.suite} Step 5C pi extension public-surface guard suite evidence`)
        assert.equal(entry.piExtensionPublicSurfaceGuardEvidence.helper, PI_EXTENSION_PUBLIC_SURFACE_GUARD_HELPER, `${entry.suite} Step 5C pi extension public-surface guard helper evidence`)
        assert.ok(entry.rationale.includes('current pi extension public-surface/install-load guard'), `${entry.suite} Step 5C rationale should cite the current pi extension public-surface guard`)
      } else {
        assert.deepEqual(entry.piExtensionPublicSurfaceAssertionCategories, [], `${entry.suite} non-pi-extension Step 5C candidate should not claim pi extension public-surface categories`)
        assert.equal(entry.piExtensionPublicSurfaceGuardEvidence, null, `${entry.suite} non-pi-extension Step 5C candidate should not claim pi extension public-surface guard evidence`)
      }
    } else {
      assert.notEqual(entry.currentStatus, 'step5b-ready', `${entry.suite} non-ready entry must not use step5b-ready status`)
      assert.notEqual(entry.currentStatus, 'step5c-ready', `${entry.suite} non-ready entry must not use step5c-ready status`)
      assert.deepEqual(entry.readinessCommandSurfaceAssertionCategories, [], `${entry.suite} non-ready entry must not claim readiness categories`)
      assert.equal(entry.readinessCommandSurfaceGuardEvidence, null, `${entry.suite} non-ready entry must not claim readiness evidence`)
      assert.deepEqual(entry.parserDiagnosticsAssertionCategories, [], `${entry.suite} non-ready entry must not claim parser diagnostics categories`)
      assert.equal(entry.parserDiagnosticsGuardEvidence, null, `${entry.suite} non-ready entry must not claim parser diagnostics evidence`)
      assert.deepEqual(entry.kernelResolverSourceBoundaryAssertionCategories, [], `${entry.suite} non-ready entry must not claim kernel/resolver categories`)
      assert.equal(entry.kernelResolverSourceBoundaryGuardEvidence, null, `${entry.suite} non-ready entry must not claim kernel/resolver evidence`)
      assert.deepEqual(entry.artifactCiProvenanceAssertionCategories, [], `${entry.suite} non-ready entry must not claim artifact/CI/provenance categories`)
      assert.equal(entry.artifactCiProvenanceGuardEvidence, null, `${entry.suite} non-ready entry must not claim artifact/CI/provenance evidence`)
      assert.deepEqual(entry.installLayoutPathSafetyAssertionCategories, [], `${entry.suite} non-ready entry must not claim install-layout/path-safety categories`)
      assert.equal(entry.installLayoutPathSafetyGuardEvidence, null, `${entry.suite} non-ready entry must not claim install-layout/path-safety evidence`)
      assert.deepEqual(entry.piExtensionPublicSurfaceAssertionCategories, [], `${entry.suite} non-ready entry must not claim pi extension public-surface categories`)
      assert.equal(entry.piExtensionPublicSurfaceGuardEvidence, null, `${entry.suite} non-ready entry must not claim pi extension public-surface evidence`)
      assert.ok(entry.residualUniqueAssertions.length >= 1, `${entry.suite} non-ready entry should keep residual assertions`)
      assert.ok(entry.residualRisks.length >= 1, `${entry.suite} non-ready entry should keep residual risks`)
    }

    if (HISTORICAL_CHECKPOINT_KEEP_SUITES.includes(entry.suite)) {
      assert.equal(entry.currentStatus, 'step5a-keep', `${entry.suite} keep suite should remain keep after Step 5A/5B`)
    } else if (HISTORICAL_CHECKPOINT_STEP5C_DELETION_CANDIDATE_SUITES.includes(entry.suite)) {
      assert.equal(entry.currentStatus, 'step5c-ready', `${entry.suite} should be Step 5C ready after current guard migration`)
    } else {
      assert.equal(entry.currentStatus, 'step5a-needs-split', `${entry.suite} should remain needs-split after Step 5B current guard migration`)
    }
  }
}

function assertNoDeletionOrReintroduction(root) {
  const remapped = new Set(HISTORICAL_CHECKPOINT_STEP5A_REMAP.map(entry => entry.suite))
  const step5B = new Set(HISTORICAL_CHECKPOINT_STEP5B_DELETION_CANDIDATE_SUITES)
  const step5C = new Set(HISTORICAL_CHECKPOINT_STEP5C_DELETION_CANDIDATE_SUITES)
  for (const suite of HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES) {
    assert.equal(existsRel(root, suite), false, `${suite} should remain absent after T024`)
    assert.equal(remapped.has(suite), false, `${suite} must not be remapped as a remaining candidate`)
    assert.equal(step5B.has(suite), false, `${suite} must not be reintroduced as a Step 5B candidate`)
    assert.equal(step5C.has(suite), false, `${suite} must not be reintroduced as a Step 5C candidate`)
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
  const step5C = new Set(HISTORICAL_CHECKPOINT_STEP5C_DELETION_CANDIDATE_SUITES)
  for (const suite of [
    ...HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643,
    ...HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0644_V0688,
  ]) {
    assert.equal(existsRel(root, suite), true, `${suite} should remain present as a non-candidate`)
    assert.equal(remapped.has(suite), false, `${suite} non-candidate must not appear in Step 5A remaining-candidate remap`)
    assert.equal(step5B.has(suite), false, `${suite} non-candidate must not appear in Step 5B deletion candidates`)
    assert.equal(step5C.has(suite), false, `${suite} non-candidate must not appear in Step 5C deletion candidates`)
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
    await assertReadinessGuard(root, env)
    await assertParserDiagnosticsGuardCoverage(root, env)
    await assertKernelResolverGuardCoverage(root, env)
    await assertArtifactCiProvenanceGuardCoverage(root)
    await assertInstallLayoutPathSafetyGuardCoverage(root, env)
    assertPiExtensionPublicSurfaceGuardCoverage(root, env)
    assertRemapCompleteness()
    assertNoDeletionOrReintroduction(root)
    assertNonCandidatesRemainNonCandidates(root)
    assertNoDocsFixturesScriptsSourceRuntimeNativeDeletion(root)
  },
}
