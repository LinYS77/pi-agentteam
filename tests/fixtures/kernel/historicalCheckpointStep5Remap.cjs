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
  HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT,
  HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP,
  HISTORICAL_CHECKPOINT_DELETION_REPLACEMENT_AUDITS,
  HISTORICAL_CHECKPOINT_KEEP_SUITES,
  HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES,
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

const RESIDUAL_REMAP_DETAILS = Object.freeze({
  'tests/suites/go-kernel-v0419-tmux-readiness-docs.cjs': {
    currentStatus: 'step5c-ready',
    parserDiagnosticsAssertionCategories: Object.freeze([...PARSER_DIAGNOSTICS_CATEGORIES]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
  },
  'tests/suites/go-kernel-v0419-readiness-checkpoint-docs.cjs': {
    currentStatus: 'step5c-ready',
    parserDiagnosticsAssertionCategories: Object.freeze([...PARSER_DIAGNOSTICS_CATEGORIES]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
  },
  'tests/suites/go-kernel-v0421-runtime-availability-checkpoint-docs.cjs': {
    currentStatus: 'step5c-ready',
    kernelResolverSourceBoundaryAssertionCategories: Object.freeze([...KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
  },
  'tests/suites/go-kernel-v0422-native-package-metadata-checkpoint-docs.cjs': {
    currentStatus: 'step5c-ready',
    kernelResolverSourceBoundaryAssertionCategories: Object.freeze([...KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
  },
  'tests/suites/go-kernel-v0423-compact-diagnostics-checkpoint-docs.cjs': {
    currentStatus: 'step5c-ready',
    parserDiagnosticsAssertionCategories: Object.freeze([...PARSER_DIAGNOSTICS_CATEGORIES]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
  },
  'tests/suites/go-kernel-v0424-readiness-command-contract-docs.cjs': {
    currentStatus: 'step5c-ready',
    readinessCommandSurfaceAssertionCategories: Object.freeze([...READINESS_COMMAND_SURFACE_CATEGORIES]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
  },
  'tests/suites/go-kernel-v0424-readiness-command-seam-docs.cjs': {
    currentStatus: 'step5c-ready',
    readinessCommandSurfaceAssertionCategories: Object.freeze([...READINESS_COMMAND_SURFACE_CATEGORIES]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
  },
  'tests/suites/go-kernel-v0424-readiness-command-sunset-docs.cjs': {
    currentStatus: 'step5c-ready',
    readinessCommandSurfaceAssertionCategories: Object.freeze([...READINESS_COMMAND_SURFACE_CATEGORIES]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
  },
  'tests/suites/go-kernel-v0424-readiness-command-checkpoint-docs.cjs': {
    currentStatus: 'step5c-ready',
    readinessCommandSurfaceAssertionCategories: Object.freeze([...READINESS_COMMAND_SURFACE_CATEGORIES]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
  },
  'tests/suites/go-kernel-v0425-native-availability-checkpoint-docs.cjs': {
    currentStatus: 'step5c-ready',
    kernelResolverSourceBoundaryAssertionCategories: Object.freeze([...KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
  },
  'tests/suites/go-kernel-v0426-storage-release-policy-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'future storage/release policy matrix details remain historical policy content beyond executable package/release guardrails',
    ]),
    residualRisks: Object.freeze(['Consolidated workflow/package guards cover mechanics, but the storage/release policy matrix still needs an owner.']),
  },
  'tests/suites/go-kernel-v0426-artifact-pipeline-checkpoint-docs.cjs': {
    currentStatus: 'step5c-ready',
    kernelResolverSourceBoundaryAssertionCategories: Object.freeze([...KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
  },
  'tests/suites/go-kernel-v0427-clean-install-consumption-contract-docs.cjs': {
    currentStatus: 'step5c-ready',
    kernelResolverSourceBoundaryAssertionCategories: Object.freeze([...KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
  },
  'tests/suites/go-kernel-v0427-install-layout-matrix-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'PLATFORM_ROWS supported/unsupported target matrix and fail-closed unsupported rows remain unique',
      'packageRelativeLayoutPath path-safety checks remain unique',
      'validateResolverInputs skew, traversal, stale-helper, and stale-metadata fail-closed cases remain unique',
    ]),
    residualRisks: Object.freeze(['Do not delete until platform matrix, path safety, and resolver-input fail-closed coverage is migrated.']),
  },
  'tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs': {
    currentStatus: 'step5c-ready',
    kernelResolverSourceBoundaryAssertionCategories: Object.freeze([...KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES]),
    residualUniqueAssertions: Object.freeze([]),
    residualRisks: Object.freeze([]),
  },
  'tests/suites/go-kernel-v0629-real-implementation-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'builder scripts and Go helper artifact build boundaries remain implementation-specific',
      'child-process/go-build scope checks remain build-boundary behavior coverage',
      'runtime source assertions outside the kernel/resolver parser-boundary guard remain tied to artifact builder implementation evidence',
    ]),
    residualRisks: Object.freeze(['Kernel/resolver mode boundaries are covered by the current guard; move builder/go-build/artifact implementation assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0630-ci-review-artifact-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'builder/verifier script assertions remain CI review artifact implementation evidence',
      'go-build context boundary assertions remain outside consolidated workflow/package governance',
      'runtime source assertions outside the kernel/resolver parser-boundary guard remain tied to CI artifact prototype evidence',
    ]),
    residualRisks: Object.freeze(['Kernel/resolver mode boundaries are covered by the current guard; deleting now would drop builder/verifier and go-build context checks.']),
  },
  'tests/suites/go-kernel-v0631-ci-review-artifact-hardening-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'verifier script assertions remain hardening evidence',
      'hosted-observation non-claims remain stricter slice-specific wording beyond the workflow guard',
      'runtime resolver checks outside parser-boundary behavior remain tied to CI hardening evidence',
    ]),
    residualRisks: Object.freeze(['Kernel/resolver mode boundaries are covered by the current guard; migrate verifier hardening and hosted-observation non-claim assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0632-ci-review-provenance-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'hosted observation scripts and provenance strict-context details remain slice-specific',
      'builder/verifier assertions remain implementation evidence outside kernel/resolver parser-boundary coverage',
    ]),
    residualRisks: Object.freeze(['Kernel/resolver mode boundaries are covered by the current guard; split hosted-observation/provenance and builder/verifier assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0633-clean-install-proof-contract-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'installed-layout consumption proof script and host-environment invariants remain unique',
      'hosted observation script invariants remain outside the package/release guard',
      'dist/source boundary helper execution remains package/runtime behavior coverage beyond the parser-boundary guard',
    ]),
    residualRisks: Object.freeze(['Kernel/resolver parser boundaries are covered by the current guard; migrate installed-layout proof, hosted-observation script, and dist/source execution assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0633-clean-install-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'clean-install fixture/evidence, fingerprint, and Go helper source reads remain unique',
      'roadmap future gating and broad tool/control-plane non-expansion assertions remain checkpoint-specific beyond readiness command containment and parser-boundary coverage',
    ]),
    residualRisks: Object.freeze(['Readiness containment and kernel/resolver boundaries are covered by current guards; deleting now would still remove clean-install evidence, helper-source, and roadmap-gating checks.']),
  },
  'tests/suites/go-kernel-v0634-ownership-install-layout-contract-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'install-layout ownership semantics remain broader than consolidated package/release mechanics and parser-boundary checks',
      'future package-manager/native ownership assertions remain policy-specific',
    ]),
    residualRisks: Object.freeze(['Kernel/resolver parser boundaries are covered by the current guard; keep until install-layout ownership assertions are migrated.']),
  },
  'tests/suites/go-kernel-v0634-distribution-option-matrix-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'distribution option matrix fields and allowed/forbidden claims remain policy-matrix evidence',
      'package/release availability claims remain broader policy evidence beyond parser-boundary source coverage',
    ]),
    residualRisks: Object.freeze(['Kernel/resolver parser boundaries are covered by the current guard; migrate distribution matrix and package availability policy assertions before deleting.']),
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
      'Go helper source and package/release/default decision checks remain unique beyond parser-boundary source coverage',
      'tool control-plane invariants remain broader than package/release governance mechanics and readiness command containment',
    ]),
    residualRisks: Object.freeze(['Readiness containment and kernel/resolver boundaries are covered by current guards; migrate broader helper-source and tool-control-plane assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0635-pi-extension-compliance-contract-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'index.ts and tool fixture source checks for pi extension boundaries remain unique beyond parser-boundary coverage',
      'named public API surface assertions remain broader than package manifest/facade and readiness command surface checks',
    ]),
    residualRisks: Object.freeze(['Readiness containment and kernel/resolver boundaries are covered by current guards; move pi extension public surface and source/tool fixture assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0635-pi-extension-compliance-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'pi extension install/load scripts and evidence file existence checks remain unique',
      'public runtime/facade source assertions remain outside consolidated package/release governance and parser-boundary coverage',
    ]),
    residualRisks: Object.freeze(['Kernel/resolver boundaries are covered by the current guard; migrate install/load proof script, evidence-file, and public runtime/facade assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0636-default-go-dry-run-contract-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'default-Go dry-run verifier/source/script boundaries remain unique',
      'runtime authority checks tied to dry-run implementation remain outside the consolidated readiness ledger guard',
    ]),
    residualRisks: Object.freeze(['Keep until dry-run verifier/script and runtime-authority assertions have a non-historical owner.']),
  },
  'tests/suites/go-kernel-v0636-final-readiness-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'v0.6.36 readiness fixtures, evidence registry, and tag ledger suite links remain unique',
      'runtime/command source and dry-run script assertions remain outside package/release governance',
    ]),
    residualRisks: Object.freeze(['Migrate readiness fixture/evidence registry and dry-run runtime/script checks before deleting.']),
  },
  'tests/suites/go-kernel-v0637-v05-final-readiness-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'final release-readiness fixture content and supporting v0.6.37 fixture/suite existence checks remain unique',
      'assertions that fixtures are not used by production panel/renderer sources remain unique',
    ]),
    residualRisks: Object.freeze(['Keep until v0.6.37 fixture integrity and production-not-used assertions are separately owned.']),
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

function describeStep5CCurrentGuards(readinessCategories, parserDiagnosticsCategories, kernelResolverCategories) {
  const guards = []
  if (readinessCategories.length > 0) guards.push('the current readiness command surface guard')
  if (parserDiagnosticsCategories.length > 0) guards.push('the current parser parity/compact diagnostics guard')
  if (kernelResolverCategories.length > 0) guards.push('the current kernel/resolver source-boundary guard')
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
  const step5CCurrentGuardDescription = describeStep5CCurrentGuards(readinessCommandSurfaceAssertionCategories, parserDiagnosticsAssertionCategories, kernelResolverSourceBoundaryAssertionCategories)
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
  HISTORICAL_CHECKPOINT_STEP5A_REMAP,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_COUNTS,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_INPUTS,
  HISTORICAL_CHECKPOINT_STEP5A_STATUS_VALUES,
  HISTORICAL_CHECKPOINT_STEP5A_STILL_KEEP_SUITES,
  HISTORICAL_CHECKPOINT_STEP5A_STILL_NEEDS_SPLIT_SUITES,
  HISTORICAL_CHECKPOINT_STEP5B_DELETION_CANDIDATE_SUITES,
  HISTORICAL_CHECKPOINT_STEP5C_DELETION_CANDIDATE_SUITES,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORY_DESCRIPTIONS,
  PARSER_DIAGNOSTICS_CATEGORIES,
  PARSER_DIAGNOSTICS_CATEGORY_DESCRIPTIONS,
  READINESS_COMMAND_SURFACE_CATEGORIES,
  READINESS_COMMAND_SURFACE_CATEGORY_DESCRIPTIONS,
  RESIDUAL_REMAP_DETAILS,
  sorted,
}
