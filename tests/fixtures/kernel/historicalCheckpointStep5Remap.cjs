const {
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORIES,
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORY_DESCRIPTIONS,
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_HELPER,
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_SUITE,
} = require('../../helpers/packageReleaseGovernanceGuards.cjs')
const {
  READINESS_COMMAND_SURFACE_CATEGORIES,
  READINESS_COMMAND_SURFACE_CATEGORY_DESCRIPTIONS,
  READINESS_COMMAND_SURFACE_GUARD_HELPER,
  READINESS_COMMAND_SURFACE_GUARD_SUITE,
} = require('../../helpers/readinessCommandSurfaceGuards.cjs')
const {
  PARSER_DIAGNOSTICS_CATEGORIES,
  PARSER_DIAGNOSTICS_CATEGORY_DESCRIPTIONS,
  PARSER_DIAGNOSTICS_GUARD_HELPER,
  PARSER_DIAGNOSTICS_GUARD_SUITE,
  PARSER_DIAGNOSTICS_SOURCE_FILES,
  PARSER_DIAGNOSTICS_SUPPORTING_FIXTURES,
  PARSER_DIAGNOSTICS_SUPPORTING_SUITES,
} = require('../../helpers/parserDiagnosticsGuards.cjs')
const {
  KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORY_DESCRIPTIONS,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE,
  KERNEL_RESOLVER_SOURCE_FILES,
  KERNEL_RESOLVER_SUPPORTING_FIXTURES,
  KERNEL_RESOLVER_SUPPORTING_SUITES,
} = require('../../helpers/kernelResolverSourceBoundaryGuards.cjs')
const {
  ARTIFACT_CI_PROVENANCE_CATEGORIES,
  ARTIFACT_CI_PROVENANCE_CATEGORY_DESCRIPTIONS,
  ARTIFACT_CI_PROVENANCE_GUARD_HELPER,
  ARTIFACT_CI_PROVENANCE_GUARD_SUITE,
  ARTIFACT_CI_PROVENANCE_SOURCE_FILES,
  ARTIFACT_CI_PROVENANCE_SUPPORTING_DOCS,
  ARTIFACT_CI_PROVENANCE_SUPPORTING_SUITES,
} = require('../../helpers/artifactCiProvenanceGuards.cjs')
const {
  INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES,
  INSTALL_LAYOUT_PATH_SAFETY_CATEGORY_DESCRIPTIONS,
  INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER,
  INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE,
  INSTALL_LAYOUT_PATH_SAFETY_SOURCE_FILES,
  INSTALL_LAYOUT_PATH_SAFETY_SUPPORTING_DOCS,
  INSTALL_LAYOUT_PATH_SAFETY_SUPPORTING_SUITES,
} = require('../../helpers/installLayoutPathSafetyGuards.cjs')
const {
  PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES,
  PI_EXTENSION_PUBLIC_SURFACE_CATEGORY_DESCRIPTIONS,
  PI_EXTENSION_PUBLIC_SURFACE_GUARD_HELPER,
  PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE,
  PI_EXTENSION_PUBLIC_SURFACE_SOURCE_FILES,
  PI_EXTENSION_PUBLIC_SURFACE_SUPPORTING_DOCS,
  PI_EXTENSION_PUBLIC_SURFACE_SUPPORTING_SUITES,
} = require('../../helpers/piExtensionPublicSurfaceGuards.cjs')
const {
  DEFAULT_GO_READINESS_FIXTURE_CATEGORIES,
  DEFAULT_GO_READINESS_FIXTURE_CATEGORY_DESCRIPTIONS,
  DEFAULT_GO_READINESS_FIXTURE_GUARD_HELPER,
  DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE,
  DEFAULT_GO_READINESS_FIXTURE_SOURCE_FILES,
  DEFAULT_GO_READINESS_FIXTURE_SUPPORTING_DOCS,
  DEFAULT_GO_READINESS_FIXTURE_SUPPORTING_SUITES,
} = require('../../helpers/defaultGoReadinessFixtureGuards.cjs')
const {
  HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT,
  HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP,
  HISTORICAL_CHECKPOINT_DELETION_REPLACEMENT_AUDITS,
  HISTORICAL_CHECKPOINT_KEEP_SUITES,
  HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES,
  HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES,
  HISTORICAL_CHECKPOINT_STEP5C_READY_DELETION_CANDIDATE_DETAILS,
} = require('./historicalCheckpointDeletionMap.cjs')

const HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT = CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_SUITE

const HISTORICAL_CHECKPOINT_STEP5A_STATUS_VALUES = Object.freeze([
  'step5a-needs-split',
  'step5a-keep',
  'step5b-ready',
  'step5c-ready',
])

const HISTORICAL_CHECKPOINT_STEP5A_CONSOLIDATED_GUARD_EVIDENCE = Object.freeze({
  suite: CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_SUITE,
  helper: CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_HELPER,
  reusedHelpers: Object.freeze([
    'tests/helpers/packageGuards.cjs',
    'tests/helpers/nativeGuards.cjs',
    'tests/helpers/reviewArtifactWorkflowGuard.cjs',
    'tests/helpers/goKernelGuards.cjs',
  ]),
  supportingFixtures: Object.freeze([
    'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs',
  ]),
})

const HISTORICAL_CHECKPOINT_STEP5B_READINESS_SURFACE_GUARD_EVIDENCE = Object.freeze({
  suite: READINESS_COMMAND_SURFACE_GUARD_SUITE,
  helper: READINESS_COMMAND_SURFACE_GUARD_HELPER,
  sourceFiles: Object.freeze([
    'commands/readiness.ts',
    'commands/team.ts',
    'api/commands.ts',
    'api/tools.ts',
    'core/kernelDiagnostics.ts',
    'teamPanel.ts',
    'renderers.ts',
    'teamPanel/dataSource.ts',
    'teamPanel/input.ts',
    'teamPanel/layout.ts',
    'teamPanel/readModel.ts',
    'teamPanel/viewModel.ts',
  ]),
  behaviorEvidence: Object.freeze([
    'direct buildReadinessText() compact-safe output checks',
    'direct handleTeamReadinessCommand() parser acceptance/rejection checks',
    '/team readiness command execution without panel/state mutation',
  ]),
})

const HISTORICAL_CHECKPOINT_STEP5C_PARSER_DIAGNOSTICS_GUARD_EVIDENCE = Object.freeze({
  suite: PARSER_DIAGNOSTICS_GUARD_SUITE,
  helper: PARSER_DIAGNOSTICS_GUARD_HELPER,
  sourceFiles: Object.freeze([...PARSER_DIAGNOSTICS_SOURCE_FILES]),
  supportingFixtures: Object.freeze([...PARSER_DIAGNOSTICS_SUPPORTING_FIXTURES]),
  supportingSuites: Object.freeze([...PARSER_DIAGNOSTICS_SUPPORTING_SUITES]),
  behaviorEvidence: Object.freeze([
    'canonical tmux snapshot fixture parity through the current parser entrypoint and default Go adapter',
    'complete helper failure taxonomy mapped to compact diagnostics and safe readiness formatting',
    'parser-unavailable fail-closed ok:false unknown/stale snapshots with no false successful empty pane list',
  ]),
})

const HISTORICAL_CHECKPOINT_STEP5C_KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_EVIDENCE = Object.freeze({
  suite: KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE,
  helper: KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER,
  sourceFiles: Object.freeze([...KERNEL_RESOLVER_SOURCE_FILES]),
  supportingFixtures: Object.freeze([...KERNEL_RESOLVER_SUPPORTING_FIXTURES]),
  supportingSuites: Object.freeze([...KERNEL_RESOLVER_SUPPORTING_SUITES]),
  behaviorEvidence: Object.freeze([
    'current kernel adapter mode-boundary checks for default/go/go-cutover/go-packaged-preview and explicit helper path precedence',
    'packaged resolver success and fail-closed failure-kind checks with compact no-leak cutover diagnostics',
    'default embedded helper gating, no hidden TypeScript parser fallback after cutover, and no non-parser production authority expansion',
  ]),
})

const HISTORICAL_CHECKPOINT_STEP5C_ARTIFACT_CI_PROVENANCE_GUARD_EVIDENCE = Object.freeze({
  suite: ARTIFACT_CI_PROVENANCE_GUARD_SUITE,
  helper: ARTIFACT_CI_PROVENANCE_GUARD_HELPER,
  sourceFiles: Object.freeze([...ARTIFACT_CI_PROVENANCE_SOURCE_FILES]),
  supportingDocs: Object.freeze([...ARTIFACT_CI_PROVENANCE_SUPPORTING_DOCS]),
  supportingSuites: Object.freeze([...ARTIFACT_CI_PROVENANCE_SUPPORTING_SUITES]),
  behaviorEvidence: Object.freeze([
    'current artifact builder temp-output, artifact-index, and verifier/provenance source-boundary checks',
    'bounded GitHub review-artifact workflow and strict reverify context checks with no release/package/signing mechanics',
    'hosted observation record non-availability semantics plus no checked-in generated/release artifact residue',
  ]),
})

const HISTORICAL_CHECKPOINT_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_GUARD_EVIDENCE = Object.freeze({
  suite: INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE,
  helper: INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER,
  sourceFiles: Object.freeze([...INSTALL_LAYOUT_PATH_SAFETY_SOURCE_FILES]),
  supportingDocs: Object.freeze([...INSTALL_LAYOUT_PATH_SAFETY_SUPPORTING_DOCS]),
  supportingSuites: Object.freeze([...INSTALL_LAYOUT_PATH_SAFETY_SUPPORTING_SUITES]),
  behaviorEvidence: Object.freeze([
    'current packaged resolver platform tuple, package-relative path safety, and fail-closed no-leak layout-input checks',
    'clean-install proof and package-manager baseline non-availability boundaries for installed-layout consumption',
    'non-applied package layout proposal fixture inertness, package/native allowlist preservation, and default/control-surface containment',
  ]),
})

const HISTORICAL_CHECKPOINT_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_GUARD_EVIDENCE = Object.freeze({
  suite: PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE,
  helper: PI_EXTENSION_PUBLIC_SURFACE_GUARD_HELPER,
  sourceFiles: Object.freeze([...PI_EXTENSION_PUBLIC_SURFACE_SOURCE_FILES]),
  supportingDocs: Object.freeze([...PI_EXTENSION_PUBLIC_SURFACE_SUPPORTING_DOCS]),
  supportingSuites: Object.freeze([...PI_EXTENSION_PUBLIC_SURFACE_SUPPORTING_SUITES]),
  behaviorEvidence: Object.freeze([
    'current pi extension entrypoint, public facade export, command/tool registration, and read-boundary checks',
    'bridge-only worker delivery plus no model-callable readiness/native/default/package/release/signing tool surface',
    'bounded temp install/load proof script and evidence registry proof-only checks with approved embedded helper path preservation',
  ]),
})

const HISTORICAL_CHECKPOINT_STEP5C_DEFAULT_GO_READINESS_FIXTURE_GUARD_EVIDENCE = Object.freeze({
  suite: DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE,
  helper: DEFAULT_GO_READINESS_FIXTURE_GUARD_HELPER,
  sourceFiles: Object.freeze([...DEFAULT_GO_READINESS_FIXTURE_SOURCE_FILES]),
  supportingDocs: Object.freeze([...DEFAULT_GO_READINESS_FIXTURE_SUPPORTING_DOCS]),
  supportingSuites: Object.freeze([...DEFAULT_GO_READINESS_FIXTURE_SUPPORTING_SUITES]),
  behaviorEvidence: Object.freeze([
    'current default-Go dry-run verifier summary/fail-closed/source-boundary checks with no mutation, helper execution, release, tag, hosted query, or network behavior',
    'v0.6.36 readiness ledger, install/load registry, rollback/default-disable policy, and tag gate fixtures kept proof-only/non-applied/non-release',
    'v0.6.37 v0.5 P0/final readiness, p95/manual RC/performance/reliability/validation fixtures kept evidence-only and not imported by production sources',
  ]),
})

const RESIDUAL_REMAP_DETAILS = Object.freeze({
  'tests/suites/go-kernel-v0426-storage-release-policy-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'future storage/release policy matrix details remain historical policy content beyond executable package/release guardrails',
    ]),
    residualRisks: Object.freeze(['Consolidated workflow/package guards cover mechanics, but the storage/release policy matrix still needs an owner.']),
  },
  'tests/suites/go-kernel-v0634-rollback-default-disable-policy-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'rollback/default-disable policy and UI behavior checks remain unique',
      'fixture/tool-surface checks for default/release/signing control-plane remain source-fixture-specific beyond current readiness and parser-boundary guards',
    ]),
    residualRisks: Object.freeze(['Kernel/resolver parser boundaries are covered by the current guard; do not delete until rollback/default-disable policy and fixture/tool-surface coverage is migrated.']),
  },
  'tests/suites/go-kernel-v0634-security-signing-ownership-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'tool fixture checks for signing/security control-plane remain unique beyond consolidated mechanics and parser-boundary source coverage',
    ]),
    residualRisks: Object.freeze(['Consolidated guard covers signing mechanics and the current guard covers parser boundaries, but not source/tool fixture ownership assertions.']),
  },
  'tests/suites/go-kernel-v0634-package-release-decision-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'final package/release/default decision checkpoint, rollback/default-disable, and signing/security ownership synthesis remain broader than install-layout path-safety coverage',
      'tool control-plane invariants remain broader than package/release governance, readiness command containment, kernel/resolver, and install-layout guards',
    ]),
    residualRisks: Object.freeze(['Install-layout/path-safety decisions are covered by the current guard; migrate broader package-release/default, rollback/security, and tool-control-plane checkpoint assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0419-refresh-parser-unavailable-safety.cjs': {
    currentStatus: 'step5a-keep',
    residualUniqueAssertions: Object.freeze([
      'temp-home panel refresh behavior executes through dist runtime modules',
      'parser-unavailable snapshots preserve pane ids, window targets, worker status, wake reason, and last error',
      'attached and global panel refresh behavior remains executable behavior coverage, not package/release governance',
    ]),
    residualRisks: Object.freeze(['This suite remains keep; deleting it would remove executable parser-unavailable refresh safety coverage.']),
  },
})

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function priorEntryForSuite(suite) {
  const entry = HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP.find(item => item.suite === suite)
  if (!entry) throw new Error(`Missing prior deletion parity entry for ${suite}`)
  return entry
}

function step5cDeletedAuditEntryForSuite(suite) {
  const prior = priorEntryForSuite(suite)
  const deletionDetails = HISTORICAL_CHECKPOINT_STEP5C_READY_DELETION_CANDIDATE_DETAILS[suite]
  if (!deletionDetails) throw new Error(`Missing Step 5C deleted guard audit details for ${suite}`)
  return Object.freeze({
    suite,
    currentStatus: 'step5c-deleted',
    priorDeleteReadiness: prior.deleteReadiness,
    familyId: prior.familyId,
    scope: prior.scope,
    replacementAuditSuite: prior.replacementAuditSuite,
    deletionParityAuditSuite: HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT,
    deletedSuiteExpectedAbsent: true,
    currentGuardEvidence: Object.freeze([...deletionDetails.currentGuardEvidence]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
    rationale: deletionDetails.rationale,
  })
}

const HISTORICAL_CHECKPOINT_STEP5C_DELETED_GUARD_AUDIT = Object.freeze(HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES.map(step5cDeletedAuditEntryForSuite))

function describeStep5CCurrentGuards(readinessCategories, parserDiagnosticsCategories, kernelResolverCategories, artifactCiProvenanceCategories, installLayoutPathSafetyCategories, piExtensionPublicSurfaceCategories, defaultGoReadinessFixtureCategories) {
  const guards = []
  if (readinessCategories.length > 0) guards.push('the current readiness command surface guard')
  if (parserDiagnosticsCategories.length > 0) guards.push('the current parser parity/compact diagnostics guard')
  if (kernelResolverCategories.length > 0) guards.push('the current kernel/resolver source-boundary guard')
  if (artifactCiProvenanceCategories.length > 0) guards.push('the current artifact/CI/provenance guard')
  if (installLayoutPathSafetyCategories.length > 0) guards.push('the current install-layout/platform path-safety guard')
  if (piExtensionPublicSurfaceCategories.length > 0) guards.push('the current pi extension public-surface/install-load guard')
  if (defaultGoReadinessFixtureCategories.length > 0) guards.push('the current default-Go readiness fixture guard')
  return guards.join(' and ')
}

function remapEntryForSuite(suite) {
  const prior = priorEntryForSuite(suite)
  const residual = RESIDUAL_REMAP_DETAILS[suite]
  if (!residual) throw new Error(`Missing Step 5A residual remap details for ${suite}`)
  const currentStatus = residual.currentStatus || 'step5a-needs-split'
  const step5BDeletionCandidate = currentStatus === 'step5b-ready'
  const step5CDeletionCandidate = currentStatus === 'step5c-ready'
  const readinessCommandSurfaceAssertionCategories = residual.readinessCommandSurfaceAssertionCategories || []
  const parserDiagnosticsAssertionCategories = residual.parserDiagnosticsAssertionCategories || []
  const kernelResolverSourceBoundaryAssertionCategories = residual.kernelResolverSourceBoundaryAssertionCategories || []
  const artifactCiProvenanceAssertionCategories = residual.artifactCiProvenanceAssertionCategories || []
  const installLayoutPathSafetyAssertionCategories = residual.installLayoutPathSafetyAssertionCategories || []
  const piExtensionPublicSurfaceAssertionCategories = residual.piExtensionPublicSurfaceAssertionCategories || []
  const defaultGoReadinessFixtureAssertionCategories = residual.defaultGoReadinessFixtureAssertionCategories || []
  const step5CCurrentGuardDescription = describeStep5CCurrentGuards(readinessCommandSurfaceAssertionCategories, parserDiagnosticsAssertionCategories, kernelResolverSourceBoundaryAssertionCategories, artifactCiProvenanceAssertionCategories, installLayoutPathSafetyAssertionCategories, piExtensionPublicSurfaceAssertionCategories, defaultGoReadinessFixtureAssertionCategories)
  return Object.freeze({
    suite,
    priorDeleteReadiness: prior.deleteReadiness,
    currentStatus,
    familyId: prior.familyId,
    scope: prior.scope,
    replacementAuditSuite: prior.replacementAuditSuite,
    deletionParityAuditSuite: HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT,
    packageReleaseGovernanceAssertionCategories: Object.freeze([...CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORIES]),
    consolidatedGuardEvidence: HISTORICAL_CHECKPOINT_STEP5A_CONSOLIDATED_GUARD_EVIDENCE,
    readinessCommandSurfaceAssertionCategories: Object.freeze([...readinessCommandSurfaceAssertionCategories]),
    readinessCommandSurfaceGuardEvidence: readinessCommandSurfaceAssertionCategories.length > 0
      ? HISTORICAL_CHECKPOINT_STEP5B_READINESS_SURFACE_GUARD_EVIDENCE
      : null,
    parserDiagnosticsAssertionCategories: Object.freeze([...parserDiagnosticsAssertionCategories]),
    parserDiagnosticsGuardEvidence: parserDiagnosticsAssertionCategories.length > 0
      ? HISTORICAL_CHECKPOINT_STEP5C_PARSER_DIAGNOSTICS_GUARD_EVIDENCE
      : null,
    kernelResolverSourceBoundaryAssertionCategories: Object.freeze([...kernelResolverSourceBoundaryAssertionCategories]),
    kernelResolverSourceBoundaryGuardEvidence: kernelResolverSourceBoundaryAssertionCategories.length > 0
      ? HISTORICAL_CHECKPOINT_STEP5C_KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_EVIDENCE
      : null,
    artifactCiProvenanceAssertionCategories: Object.freeze([...artifactCiProvenanceAssertionCategories]),
    artifactCiProvenanceGuardEvidence: artifactCiProvenanceAssertionCategories.length > 0
      ? HISTORICAL_CHECKPOINT_STEP5C_ARTIFACT_CI_PROVENANCE_GUARD_EVIDENCE
      : null,
    installLayoutPathSafetyAssertionCategories: Object.freeze([...installLayoutPathSafetyAssertionCategories]),
    installLayoutPathSafetyGuardEvidence: installLayoutPathSafetyAssertionCategories.length > 0
      ? HISTORICAL_CHECKPOINT_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_GUARD_EVIDENCE
      : null,
    piExtensionPublicSurfaceAssertionCategories: Object.freeze([...piExtensionPublicSurfaceAssertionCategories]),
    piExtensionPublicSurfaceGuardEvidence: piExtensionPublicSurfaceAssertionCategories.length > 0
      ? HISTORICAL_CHECKPOINT_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_GUARD_EVIDENCE
      : null,
    defaultGoReadinessFixtureAssertionCategories: Object.freeze([...defaultGoReadinessFixtureAssertionCategories]),
    defaultGoReadinessFixtureGuardEvidence: defaultGoReadinessFixtureAssertionCategories.length > 0
      ? HISTORICAL_CHECKPOINT_STEP5C_DEFAULT_GO_READINESS_FIXTURE_GUARD_EVIDENCE
      : null,
    residualUniqueAssertions: residual.residualUniqueAssertions,
    residualRisks: residual.residualRisks,
    step5BDeletionCandidate,
    step5CDeletionCandidate,
    rationale: step5BDeletionCandidate
      ? 'Existing historical audits/parity plus the consolidated package/release governance guard cover this suite; no residual unique assertions remain.'
      : step5CDeletionCandidate
        ? `Existing historical audits/parity, the consolidated package/release governance guard, and ${step5CCurrentGuardDescription} cover this suite; no residual unique assertions remain.`
        : 'The consolidated package/release governance guard and any migrated current guard coverage cover shared mechanics, but residual source/runtime/script/workflow/fixture/path-safety/behavior assertions still require migration or explicit acceptance before deletion.',
  })
}

const HISTORICAL_CHECKPOINT_STEP5A_REMAP = Object.freeze([
  ...HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES,
  ...HISTORICAL_CHECKPOINT_KEEP_SUITES,
].map(remapEntryForSuite))

const HISTORICAL_CHECKPOINT_STEP5B_DELETION_CANDIDATE_SUITES = Object.freeze(HISTORICAL_CHECKPOINT_STEP5A_REMAP
  .filter(entry => entry.step5BDeletionCandidate)
  .map(entry => entry.suite))

const HISTORICAL_CHECKPOINT_STEP5C_DELETION_CANDIDATE_SUITES = Object.freeze(HISTORICAL_CHECKPOINT_STEP5A_REMAP
  .filter(entry => entry.step5CDeletionCandidate)
  .map(entry => entry.suite))

const HISTORICAL_CHECKPOINT_STEP5A_STILL_NEEDS_SPLIT_SUITES = Object.freeze(HISTORICAL_CHECKPOINT_STEP5A_REMAP
  .filter(entry => entry.currentStatus === 'step5a-needs-split')
  .map(entry => entry.suite))

const HISTORICAL_CHECKPOINT_STEP5A_STILL_KEEP_SUITES = Object.freeze(HISTORICAL_CHECKPOINT_STEP5A_REMAP
  .filter(entry => entry.currentStatus === 'step5a-keep')
  .map(entry => entry.suite))

const HISTORICAL_CHECKPOINT_STEP5A_REMAP_COUNTS = Object.freeze({
  totalRemainingCandidates: HISTORICAL_CHECKPOINT_STEP5A_REMAP.length,
  step5BReady: HISTORICAL_CHECKPOINT_STEP5B_DELETION_CANDIDATE_SUITES.length,
  step5CReady: HISTORICAL_CHECKPOINT_STEP5C_DELETION_CANDIDATE_SUITES.length,
  stillNeedsSplit: HISTORICAL_CHECKPOINT_STEP5A_STILL_NEEDS_SPLIT_SUITES.length,
  stillKeep: HISTORICAL_CHECKPOINT_STEP5A_STILL_KEEP_SUITES.length,
})

const HISTORICAL_CHECKPOINT_STEP5A_REMAP_INPUTS = Object.freeze({
  needsSplitSuites: Object.freeze([...HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES]),
  keepSuites: Object.freeze([...HISTORICAL_CHECKPOINT_KEEP_SUITES]),
  replacementAuditSuites: Object.freeze({ ...HISTORICAL_CHECKPOINT_DELETION_REPLACEMENT_AUDITS }),
  deletionParityAuditSuite: HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT,
})

module.exports = {
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORIES,
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORY_DESCRIPTIONS,
  HISTORICAL_CHECKPOINT_STEP5A_CONSOLIDATED_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5B_READINESS_SURFACE_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5C_PARSER_DIAGNOSTICS_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5C_KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5C_ARTIFACT_CI_PROVENANCE_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5C_INSTALL_LAYOUT_PATH_SAFETY_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5C_PI_EXTENSION_PUBLIC_SURFACE_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5C_DEFAULT_GO_READINESS_FIXTURE_GUARD_EVIDENCE,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_COUNTS,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_INPUTS,
  HISTORICAL_CHECKPOINT_STEP5A_STATUS_VALUES,
  HISTORICAL_CHECKPOINT_STEP5A_STILL_KEEP_SUITES,
  HISTORICAL_CHECKPOINT_STEP5C_DELETED_GUARD_AUDIT,
  HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES,
  HISTORICAL_CHECKPOINT_STEP5A_STILL_NEEDS_SPLIT_SUITES,
  HISTORICAL_CHECKPOINT_STEP5B_DELETION_CANDIDATE_SUITES,
  HISTORICAL_CHECKPOINT_STEP5C_DELETION_CANDIDATE_SUITES,
  ARTIFACT_CI_PROVENANCE_CATEGORIES,
  ARTIFACT_CI_PROVENANCE_CATEGORY_DESCRIPTIONS,
  INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES,
  INSTALL_LAYOUT_PATH_SAFETY_CATEGORY_DESCRIPTIONS,
  PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES,
  PI_EXTENSION_PUBLIC_SURFACE_CATEGORY_DESCRIPTIONS,
  DEFAULT_GO_READINESS_FIXTURE_CATEGORIES,
  DEFAULT_GO_READINESS_FIXTURE_CATEGORY_DESCRIPTIONS,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORY_DESCRIPTIONS,
  PARSER_DIAGNOSTICS_CATEGORIES,
  PARSER_DIAGNOSTICS_CATEGORY_DESCRIPTIONS,
  READINESS_COMMAND_SURFACE_CATEGORIES,
  READINESS_COMMAND_SURFACE_CATEGORY_DESCRIPTIONS,
  RESIDUAL_REMAP_DETAILS,
  sorted,
}
