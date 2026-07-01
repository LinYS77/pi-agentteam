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

const RESIDUAL_REMAP_DETAILS = Object.freeze({
  'tests/suites/go-kernel-v0419-tmux-readiness-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'parser parity fixture and parser parity suite existence remain historical behavior evidence, not package/release governance',
      'detailed helper failure taxonomy and no-leak wording still exceed compact manifest themes',
    ]),
    residualRisks: Object.freeze(['Deleting now would drop parser-parity evidence links and detailed failure/no-leak taxonomy checks.']),
  },
  'tests/suites/go-kernel-v0419-readiness-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'checkpoint-specific prerequisite artifact links and parser parity evidence remain broader than package/release governance',
      'runtime prerequisite STOP recommendation wording remains unevaluated by the consolidated guard',
    ]),
    residualRisks: Object.freeze(['Deleting now would remove detailed runtime-prerequisite signoff and parser-parity continuity checks.']),
  },
  'tests/suites/go-kernel-v0421-runtime-availability-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'dist kernel adapter metadata still exercises go-packaged-preview semantics',
      'benchmark metadata helper checks for preview-mode behavior are not package/release governance',
    ]),
    residualRisks: Object.freeze(['Move preview-mode runtime metadata and benchmark helper assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0422-native-package-metadata-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'kernel adapter metadata still verifies explicit preview semantics',
      'v0.4.22 prototype, fixture, dry-run, manifest, and packaged-preview evidence cross-links remain checkpoint-specific',
    ]),
    residualRisks: Object.freeze(['Deleting now would remove explicit preview semantic coverage and v0.4.22 evidence cross-link checks.']),
  },
  'tests/suites/go-kernel-v0423-compact-diagnostics-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'compact diagnostics helper/source references remain source-seam evidence',
      'kernel adapter explicit local preview behavior remains runtime metadata coverage',
      'diagnostics model and parser failure policy suite links remain behavior evidence',
    ]),
    residualRisks: Object.freeze(['Split compact diagnostics source/runtime and behavior-suite evidence before deleting.']),
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
    residualUniqueAssertions: Object.freeze([
      'core/kernel.ts explicit helper-path and fallback behavior checks remain source-specific',
      'v0.4.25 native availability checkpoint source/evidence assertions remain broader than the current readiness surface guard',
    ]),
    residualRisks: Object.freeze(['Readiness command expansion is covered by the current guard; split remaining helper-path/fallback and native availability source assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0426-storage-release-policy-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'future storage/release policy matrix details remain historical policy content beyond executable package/release guardrails',
    ]),
    residualRisks: Object.freeze(['Consolidated workflow/package guards cover mechanics, but the storage/release policy matrix still needs an owner.']),
  },
  'tests/suites/go-kernel-v0426-artifact-pipeline-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'core/kernel.ts production behavior source checks remain unique',
      'artifact pipeline behavior/prototype suite links remain checkpoint-specific evidence',
    ]),
    residualRisks: Object.freeze(['Readiness command containment is covered by the current guard; deleting now would still remove production-behavior source checks and artifact pipeline evidence links.']),
  },
  'tests/suites/go-kernel-v0427-clean-install-consumption-contract-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'core/kernel.ts production resolver behavior checks remain unique',
      'clean-install behavior suites and resolver discovery contracts remain linked evidence outside package/release/readiness governance',
    ]),
    residualRisks: Object.freeze(['Readiness command containment is covered by the current guard; migrate clean-install source/resolver behavior evidence before deleting.']),
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
    residualUniqueAssertions: Object.freeze([
      'core/kernel.ts helper-path/default behavior checks remain unique',
      'artifact bundle hash checks remain outside package/release/readiness governance',
      'clean-install, resolver discovery, rollback, and package-native behavior suite links remain checkpoint-specific',
    ]),
    residualRisks: Object.freeze(['Readiness command containment is covered by the current guard; split helper/default source checks, artifact hashes, and behavior-suite evidence before deleting.']),
  },
  'tests/suites/go-kernel-v0629-real-implementation-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'builder scripts, packaged resolver source, and core/kernel.ts reads remain implementation-specific',
      'child-process/go-build scope checks remain build-boundary behavior coverage',
      'explicit preview runtime boundaries remain outside package/release governance',
    ]),
    residualRisks: Object.freeze(['Move builder/resolver/source/go-build and preview-runtime assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0630-ci-review-artifact-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'builder/verifier script and runtime resolver source reads remain implementation evidence',
      'go-build context boundary assertions remain outside consolidated workflow/package governance',
    ]),
    residualRisks: Object.freeze(['Deleting now would drop builder/verifier/runtime and go-build context checks.']),
  },
  'tests/suites/go-kernel-v0631-ci-review-artifact-hardening-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'verifier script and runtime resolver source reads remain hardening evidence',
      'hosted-observation non-claims remain stricter slice-specific wording beyond the workflow guard',
    ]),
    residualRisks: Object.freeze(['Migrate verifier/runtime hardening and hosted-observation non-claim assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0632-ci-review-provenance-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'hosted observation scripts and provenance strict-context details remain slice-specific',
      'builder/verifier/runtime resolver source reads remain implementation evidence',
    ]),
    residualRisks: Object.freeze(['Split hosted-observation/provenance script and runtime-source assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0633-clean-install-proof-contract-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'kernel/runtime resolver source checks for installed-layout discovery remain unique',
      'hosted observation script invariants remain outside the package/release guard',
      'dist/source boundary helper execution remains package/runtime behavior coverage',
    ]),
    residualRisks: Object.freeze(['Migrate installed-layout resolver, hosted-observation script, and dist/source boundary assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0633-clean-install-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'core kernel, resolver, fingerprint, and Go helper source reads remain unique',
      'roadmap future gating and broad tool/control-plane non-expansion assertions remain checkpoint-specific beyond readiness command containment',
    ]),
    residualRisks: Object.freeze(['Readiness command containment is covered by the current guard; deleting now would still remove broad source/control-plane and roadmap-gating checks.']),
  },
  'tests/suites/go-kernel-v0634-ownership-install-layout-contract-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'kernel/resolver install-layout and release-boundary source checks remain unique',
      'install-layout ownership semantics remain broader than consolidated package/release mechanics',
    ]),
    residualRisks: Object.freeze(['Keep until install-layout source/ownership assertions are migrated.']),
  },
  'tests/suites/go-kernel-v0634-distribution-option-matrix-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'distribution option matrix fields and allowed/forbidden claims remain policy-matrix evidence',
      'kernel/resolver source checks for package/release availability boundaries remain unique',
    ]),
    residualRisks: Object.freeze(['Migrate distribution matrix and runtime source-boundary assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0634-rollback-default-disable-policy-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'kernel/resolver/readiness source fail-closed and rollback/default UI behavior checks remain unique',
      'fixture/tool-surface checks for default/release/signing control-plane remain source-fixture-specific',
    ]),
    residualRisks: Object.freeze(['Do not delete until rollback/default-disable source and fixture/tool-surface coverage is migrated.']),
  },
  'tests/suites/go-kernel-v0634-security-signing-ownership-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'kernel/resolver/readiness source and tool fixture checks for signing/security control-plane remain unique',
    ]),
    residualRisks: Object.freeze(['Consolidated guard covers signing mechanics, but not source/tool fixture ownership assertions.']),
  },
  'tests/suites/go-kernel-v0634-package-release-decision-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'kernel/resolver and Go helper source checks for package/release/default boundaries remain unique',
      'tool control-plane invariants remain broader than package/release governance mechanics and readiness command containment',
    ]),
    residualRisks: Object.freeze(['Readiness command containment is covered by the current guard; migrate broader source and tool-control-plane assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0635-pi-extension-compliance-contract-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'index.ts, kernel/resolver, and tool fixture source checks for pi extension boundaries remain unique',
      'named public API surface assertions remain broader than package manifest/facade and readiness command surface checks',
    ]),
    residualRisks: Object.freeze(['Readiness command containment is covered by the current guard; move pi extension public surface and source/tool fixture assertions before deleting.']),
  },
  'tests/suites/go-kernel-v0635-pi-extension-compliance-checkpoint-docs.cjs': {
    residualUniqueAssertions: Object.freeze([
      'pi extension install/load scripts and evidence file existence checks remain unique',
      'runtime source assertions remain outside consolidated package/release governance',
    ]),
    residualRisks: Object.freeze(['Migrate install/load proof script, evidence-file, and runtime-source assertions before deleting.']),
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

function remapEntryForSuite(suite) {
  const prior = priorEntryForSuite(suite)
  const residual = RESIDUAL_REMAP_DETAILS[suite]
  if (!residual) throw new Error(`Missing Step 5A residual remap details for ${suite}`)
  const currentStatus = residual.currentStatus || 'step5a-needs-split'
  const step5BDeletionCandidate = currentStatus === 'step5b-ready'
  const step5CDeletionCandidate = currentStatus === 'step5c-ready'
  const readinessCommandSurfaceAssertionCategories = residual.readinessCommandSurfaceAssertionCategories || []
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
    residualUniqueAssertions: residual.residualUniqueAssertions,
    residualRisks: residual.residualRisks,
    step5BDeletionCandidate,
    step5CDeletionCandidate,
    rationale: step5BDeletionCandidate
      ? 'Existing historical audits/parity plus the consolidated package/release governance guard cover this suite; no residual unique assertions remain.'
      : step5CDeletionCandidate
        ? 'Existing historical audits/parity, the consolidated package/release governance guard, and the current readiness command surface guard cover this suite; no residual unique assertions remain.'
        : 'The consolidated package/release governance guard and any migrated readiness command surface coverage cover shared mechanics, but residual source/runtime/script/workflow/fixture/path-safety/behavior assertions still require migration or explicit acceptance before deletion.',
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
  HISTORICAL_CHECKPOINT_STEP5A_REMAP,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_AUDIT,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_COUNTS,
  HISTORICAL_CHECKPOINT_STEP5A_REMAP_INPUTS,
  HISTORICAL_CHECKPOINT_STEP5A_STATUS_VALUES,
  HISTORICAL_CHECKPOINT_STEP5A_STILL_KEEP_SUITES,
  HISTORICAL_CHECKPOINT_STEP5A_STILL_NEEDS_SPLIT_SUITES,
  HISTORICAL_CHECKPOINT_STEP5B_DELETION_CANDIDATE_SUITES,
  HISTORICAL_CHECKPOINT_STEP5C_DELETION_CANDIDATE_SUITES,
  READINESS_COMMAND_SURFACE_CATEGORIES,
  READINESS_COMMAND_SURFACE_CATEGORY_DESCRIPTIONS,
  RESIDUAL_REMAP_DETAILS,
  sorted,
}
