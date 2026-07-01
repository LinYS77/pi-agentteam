const {
  HISTORICAL_CHECKPOINT_FAMILIES_V0419_V0427,
  HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643,
  HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643,
  HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0644_V0688,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0419_V0427,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688,
} = require('./historicalCheckpoints.cjs')
const {
  READINESS_COMMAND_SURFACE_CATEGORIES,
  READINESS_COMMAND_SURFACE_GUARD_HELPER,
  READINESS_COMMAND_SURFACE_GUARD_SUITE,
} = require('../../helpers/readinessCommandSurfaceGuards.cjs')
const {
  PARSER_DIAGNOSTICS_CATEGORIES,
  PARSER_DIAGNOSTICS_GUARD_HELPER,
  PARSER_DIAGNOSTICS_GUARD_SUITE,
} = require('../../helpers/parserDiagnosticsGuards.cjs')
const {
  KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE,
} = require('../../helpers/kernelResolverSourceBoundaryGuards.cjs')
const {
  ARTIFACT_CI_PROVENANCE_CATEGORIES,
  ARTIFACT_CI_PROVENANCE_GUARD_HELPER,
  ARTIFACT_CI_PROVENANCE_GUARD_SUITE,
} = require('../../helpers/artifactCiProvenanceGuards.cjs')
const {
  INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES,
  INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER,
  INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE,
} = require('../../helpers/installLayoutPathSafetyGuards.cjs')
const {
  PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES,
  PI_EXTENSION_PUBLIC_SURFACE_GUARD_HELPER,
  PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE,
} = require('../../helpers/piExtensionPublicSurfaceGuards.cjs')
const {
  DEFAULT_GO_READINESS_FIXTURE_CATEGORIES,
  DEFAULT_GO_READINESS_FIXTURE_GUARD_HELPER,
  DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE,
} = require('../../helpers/defaultGoReadinessFixtureGuards.cjs')

const DELETE_READINESS_VALUES = ['ready', 'needs-split', 'keep']

const HISTORICAL_CHECKPOINT_DELETION_REPLACEMENT_AUDITS = {
  'v0419-v0427': 'tests/suites/go-kernel-v0427-historical-checkpoints-audit.cjs',
  'v0628-v0643': 'tests/suites/go-kernel-v0643-historical-checkpoints-audit.cjs',
}

const HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT = 'tests/suites/go-kernel-v0643-historical-checkpoint-deletion-parity.cjs'

const READY_REPLACED_ASSERTION_CATEGORIES = [
  'doc-existence',
  'historical-framing',
  'no-release-authorization',
  'package-version-guard',
  'package-surface-no-release-guard',
  'gitignore-allow-list',
  'current-roadmap-no-override',
  'continuity-backlink',
  'no-raw-or-release-artifacts',
  'preserved-candidate-existence',
]

const PARTIAL_REPLACED_ASSERTION_CATEGORIES = [
  'doc-existence',
  'historical-framing',
  'no-release-authorization',
  'package-version-guard',
  'gitignore-allow-list',
  'current-roadmap-no-override',
  'continuity-backlink',
  'preserved-candidate-existence',
]

const HISTORICAL_CHECKPOINT_T024_DELETED_SUITES = [
  'tests/suites/go-kernel-v0419-runtime-prereq-docs.cjs',
  'tests/suites/go-kernel-v0419-helper-smoke-docs.cjs',
  'tests/suites/go-kernel-v0420-helper-smoke-docs.cjs',
  'tests/suites/go-kernel-v0420-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0421-runtime-availability-docs.cjs',
  'tests/suites/go-kernel-v0421-native-artifact-contract-docs.cjs',
  'tests/suites/go-kernel-v0421-package-policy-guardrails.cjs',
  'tests/suites/go-kernel-v0421-resolver-diagnostics-docs.cjs',
  'tests/suites/go-kernel-v0422-native-package-metadata-docs.cjs',
  'tests/suites/go-kernel-v0423-compact-diagnostics-docs.cjs',
  'tests/suites/go-kernel-v0425-native-availability-contract-docs.cjs',
  'tests/suites/go-kernel-v0426-artifact-pipeline-contract-docs.cjs',
  'tests/suites/go-kernel-v0426-build-matrix-policy-docs.cjs',
  'tests/suites/go-kernel-v0628-final-prep-entry-guard.cjs',
  'tests/suites/go-kernel-v0638-manual-rc-evidence.cjs',
]

const HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES = [
  'tests/suites/go-kernel-v0419-tmux-readiness-docs.cjs',
  'tests/suites/go-kernel-v0419-readiness-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0421-runtime-availability-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0422-native-package-metadata-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0423-compact-diagnostics-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-contract-docs.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-seam-docs.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-sunset-docs.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0425-native-availability-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0426-artifact-pipeline-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0427-clean-install-consumption-contract-docs.cjs',
  'tests/suites/go-kernel-v0427-install-layout-matrix-docs.cjs',
  'tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0629-real-implementation-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0630-ci-review-artifact-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0631-ci-review-artifact-hardening-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0632-ci-review-provenance-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0633-clean-install-proof-contract-docs.cjs',
  'tests/suites/go-kernel-v0633-clean-install-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0634-ownership-install-layout-contract-docs.cjs',
  'tests/suites/go-kernel-v0634-distribution-option-matrix-docs.cjs',
  'tests/suites/go-kernel-v0635-pi-extension-compliance-contract-docs.cjs',
  'tests/suites/go-kernel-v0635-pi-extension-compliance-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0636-default-go-dry-run-contract-docs.cjs',
  'tests/suites/go-kernel-v0636-final-readiness-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0637-v05-final-readiness-checkpoint-docs.cjs',
]

const READY_DELETION_CANDIDATE_SUITES = [
  ...HISTORICAL_CHECKPOINT_T024_DELETED_SUITES,
  ...HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES,
]

const KEEP_DELETION_CANDIDATE_DETAILS = {
  'tests/suites/go-kernel-v0419-refresh-parser-unavailable-safety.cjs': {
    uniqueAssertions: [
      'executes temp-home panel refresh behavior through dist runtime modules',
      'asserts parser-unavailable snapshots preserve pane ids, window targets, worker status, wake reason, and last error',
      'covers attached and global panel refresh behavior, not only historical doc wording',
    ],
    risks: [
      'Deleting this suite would remove executable parser-unavailable refresh safety coverage; keep it until a dedicated behavior regression owns that contract.',
    ],
    rationale: 'This suite is primarily executable refresh-safety coverage with supporting docs assertions; the manifest audit must not replace it.',
  },
}

function step5cReadyDetails(guardLabel, suite, helper, categories) {
  return {
    currentGuardEvidence: [{ guardLabel, suite, helper, categories }],
    rationale: `Ready/absent after Step 5C because historical audits/parity plus the Step 5B current ${guardLabel} guard evidence cover the migrated residual assertions; no unique source/runtime/script/workflow/fixture behavior remains in this historical docs suite.`,
  }
}

const HISTORICAL_CHECKPOINT_STEP5C_READY_DELETION_CANDIDATE_DETAILS = {
  'tests/suites/go-kernel-v0419-tmux-readiness-docs.cjs': step5cReadyDetails('parser parity/compact diagnostics', PARSER_DIAGNOSTICS_GUARD_SUITE, PARSER_DIAGNOSTICS_GUARD_HELPER, PARSER_DIAGNOSTICS_CATEGORIES),
  'tests/suites/go-kernel-v0419-readiness-checkpoint-docs.cjs': step5cReadyDetails('parser parity/compact diagnostics', PARSER_DIAGNOSTICS_GUARD_SUITE, PARSER_DIAGNOSTICS_GUARD_HELPER, PARSER_DIAGNOSTICS_CATEGORIES),
  'tests/suites/go-kernel-v0423-compact-diagnostics-checkpoint-docs.cjs': step5cReadyDetails('parser parity/compact diagnostics', PARSER_DIAGNOSTICS_GUARD_SUITE, PARSER_DIAGNOSTICS_GUARD_HELPER, PARSER_DIAGNOSTICS_CATEGORIES),
  'tests/suites/go-kernel-v0424-readiness-command-contract-docs.cjs': step5cReadyDetails('readiness command surface', READINESS_COMMAND_SURFACE_GUARD_SUITE, READINESS_COMMAND_SURFACE_GUARD_HELPER, READINESS_COMMAND_SURFACE_CATEGORIES),
  'tests/suites/go-kernel-v0424-readiness-command-seam-docs.cjs': step5cReadyDetails('readiness command surface', READINESS_COMMAND_SURFACE_GUARD_SUITE, READINESS_COMMAND_SURFACE_GUARD_HELPER, READINESS_COMMAND_SURFACE_CATEGORIES),
  'tests/suites/go-kernel-v0424-readiness-command-sunset-docs.cjs': step5cReadyDetails('readiness command surface', READINESS_COMMAND_SURFACE_GUARD_SUITE, READINESS_COMMAND_SURFACE_GUARD_HELPER, READINESS_COMMAND_SURFACE_CATEGORIES),
  'tests/suites/go-kernel-v0424-readiness-command-checkpoint-docs.cjs': step5cReadyDetails('readiness command surface', READINESS_COMMAND_SURFACE_GUARD_SUITE, READINESS_COMMAND_SURFACE_GUARD_HELPER, READINESS_COMMAND_SURFACE_CATEGORIES),
  'tests/suites/go-kernel-v0421-runtime-availability-checkpoint-docs.cjs': step5cReadyDetails('kernel/resolver source-boundary', KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE, KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER, KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES),
  'tests/suites/go-kernel-v0422-native-package-metadata-checkpoint-docs.cjs': step5cReadyDetails('kernel/resolver source-boundary', KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE, KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER, KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES),
  'tests/suites/go-kernel-v0425-native-availability-checkpoint-docs.cjs': step5cReadyDetails('kernel/resolver source-boundary', KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE, KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER, KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES),
  'tests/suites/go-kernel-v0426-artifact-pipeline-checkpoint-docs.cjs': step5cReadyDetails('kernel/resolver source-boundary', KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE, KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER, KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES),
  'tests/suites/go-kernel-v0427-clean-install-consumption-contract-docs.cjs': step5cReadyDetails('kernel/resolver source-boundary', KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE, KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER, KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES),
  'tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs': step5cReadyDetails('kernel/resolver source-boundary', KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE, KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER, KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES),
  'tests/suites/go-kernel-v0629-real-implementation-checkpoint-docs.cjs': step5cReadyDetails('artifact/CI/provenance', ARTIFACT_CI_PROVENANCE_GUARD_SUITE, ARTIFACT_CI_PROVENANCE_GUARD_HELPER, ARTIFACT_CI_PROVENANCE_CATEGORIES),
  'tests/suites/go-kernel-v0630-ci-review-artifact-checkpoint-docs.cjs': step5cReadyDetails('artifact/CI/provenance', ARTIFACT_CI_PROVENANCE_GUARD_SUITE, ARTIFACT_CI_PROVENANCE_GUARD_HELPER, ARTIFACT_CI_PROVENANCE_CATEGORIES),
  'tests/suites/go-kernel-v0631-ci-review-artifact-hardening-checkpoint-docs.cjs': step5cReadyDetails('artifact/CI/provenance', ARTIFACT_CI_PROVENANCE_GUARD_SUITE, ARTIFACT_CI_PROVENANCE_GUARD_HELPER, ARTIFACT_CI_PROVENANCE_CATEGORIES),
  'tests/suites/go-kernel-v0632-ci-review-provenance-checkpoint-docs.cjs': step5cReadyDetails('artifact/CI/provenance', ARTIFACT_CI_PROVENANCE_GUARD_SUITE, ARTIFACT_CI_PROVENANCE_GUARD_HELPER, ARTIFACT_CI_PROVENANCE_CATEGORIES),
  'tests/suites/go-kernel-v0427-install-layout-matrix-docs.cjs': step5cReadyDetails('install-layout/platform path-safety', INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE, INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER, INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES),
  'tests/suites/go-kernel-v0633-clean-install-proof-contract-docs.cjs': step5cReadyDetails('install-layout/platform path-safety', INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE, INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER, INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES),
  'tests/suites/go-kernel-v0633-clean-install-checkpoint-docs.cjs': step5cReadyDetails('install-layout/platform path-safety', INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE, INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER, INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES),
  'tests/suites/go-kernel-v0634-ownership-install-layout-contract-docs.cjs': step5cReadyDetails('install-layout/platform path-safety', INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE, INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER, INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES),
  'tests/suites/go-kernel-v0634-distribution-option-matrix-docs.cjs': step5cReadyDetails('install-layout/platform path-safety', INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE, INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER, INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES),
  'tests/suites/go-kernel-v0635-pi-extension-compliance-contract-docs.cjs': step5cReadyDetails('pi extension public-surface/install-load', PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE, PI_EXTENSION_PUBLIC_SURFACE_GUARD_HELPER, PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES),
  'tests/suites/go-kernel-v0635-pi-extension-compliance-checkpoint-docs.cjs': step5cReadyDetails('pi extension public-surface/install-load', PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE, PI_EXTENSION_PUBLIC_SURFACE_GUARD_HELPER, PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES),
  'tests/suites/go-kernel-v0636-default-go-dry-run-contract-docs.cjs': step5cReadyDetails('default-Go readiness fixture', DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE, DEFAULT_GO_READINESS_FIXTURE_GUARD_HELPER, DEFAULT_GO_READINESS_FIXTURE_CATEGORIES),
  'tests/suites/go-kernel-v0636-final-readiness-checkpoint-docs.cjs': step5cReadyDetails('default-Go readiness fixture', DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE, DEFAULT_GO_READINESS_FIXTURE_GUARD_HELPER, DEFAULT_GO_READINESS_FIXTURE_CATEGORIES),
  'tests/suites/go-kernel-v0637-v05-final-readiness-checkpoint-docs.cjs': step5cReadyDetails('default-Go readiness fixture', DEFAULT_GO_READINESS_FIXTURE_GUARD_SUITE, DEFAULT_GO_READINESS_FIXTURE_GUARD_HELPER, DEFAULT_GO_READINESS_FIXTURE_CATEGORIES),
}

const NEEDS_SPLIT_DELETION_CANDIDATE_DETAILS = {
  'tests/suites/go-kernel-v0426-storage-release-policy-docs.cjs': {
    uniqueAssertions: [
      'uses review artifact workflow guard helpers to prevent CI release/package scripts',
      'checks future storage/release policy matrix details beyond compact manifest themes',
    ],
    risks: ['Migrate workflow/release-script guard coverage and assign ownership for the storage/release policy matrix before deletion.'],
  },
  'tests/suites/go-kernel-v0634-rollback-default-disable-policy-docs.cjs': {
    uniqueAssertions: [
      'reads kernel/resolver/readiness source to assert fail-closed and no rollback/default UI behavior',
      'checks fixture/tool surfaces for no default/release/signing control plane',
    ],
    risks: ['Keep until rollback/default-disable source and tool-surface assertions have a current owner.'],
  },
  'tests/suites/go-kernel-v0634-security-signing-ownership-docs.cjs': {
    uniqueAssertions: [
      'reads kernel/resolver/readiness source and tool fixtures for no signing/security control plane',
      'checks workflow has no signing/cosign/SLSA behavior and no generated security artifacts',
    ],
    risks: ['Migrate security/signing workflow and source guardrails before deletion.'],
  },
  'tests/suites/go-kernel-v0634-package-release-decision-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'reads kernel/resolver/readiness/team command and Go helper source for package/release/default boundaries',
      'checks workflow, native/security scans, package surface, and tool control-plane invariants',
    ],
    risks: ['Split broad package/release/runtime/workflow guardrails before deleting checkpoint docs coverage.'],
  },
}

const READY_DELETION_CANDIDATE_SET = new Set(READY_DELETION_CANDIDATE_SUITES)

function scopeForFamily(family) {
  return family.version.startsWith('v0.4.') ? 'v0419-v0427' : 'v0628-v0643'
}

function familyEntries(families) {
  return families.flatMap(family => family.replacementCandidateSuites.map(suite => entryForCandidate(family, suite)))
}

function entryForCandidate(family, suite) {
  const scope = scopeForFamily(family)
  const keepDetails = KEEP_DELETION_CANDIDATE_DETAILS[suite]
  const needsSplitDetails = NEEDS_SPLIT_DELETION_CANDIDATE_DETAILS[suite]
  const step5cReadyDetails = HISTORICAL_CHECKPOINT_STEP5C_READY_DELETION_CANDIDATE_DETAILS[suite]
  const isReady = READY_DELETION_CANDIDATE_SET.has(suite)
  const details = keepDetails || needsSplitDetails || step5cReadyDetails || {}
  const deleteReadiness = keepDetails ? 'keep' : isReady ? 'ready' : 'needs-split'

  return {
    suite,
    scope,
    familyId: family.id,
    version: family.version,
    replacementAuditSuite: HISTORICAL_CHECKPOINT_DELETION_REPLACEMENT_AUDITS[scope],
    supplementalAuditSuites: [HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT],
    deleteReadiness,
    deletionSlice: step5cReadyDetails ? 'T034-step5c' : isReady ? 'T024-ready' : null,
    currentGuardEvidence: Object.freeze([...(step5cReadyDetails?.currentGuardEvidence || [])]),
    replacedAssertionCategories: deleteReadiness === 'ready'
      ? READY_REPLACED_ASSERTION_CATEGORIES
      : PARTIAL_REPLACED_ASSERTION_CATEGORIES,
    uniqueAssertions: deleteReadiness === 'ready' ? [] : details.uniqueAssertions,
    risks: deleteReadiness === 'ready' ? [] : details.risks,
    rationale: deleteReadiness === 'ready'
      ? details.rationale || 'Ready only because the suite is docs/checkpoint/evidence-only: its deletion-relevant assertions are represented by the scoped historical manifest audit plus this deletion parity audit, and it has no unique source/runtime/script/workflow/fixture behavior to preserve.'
      : details.rationale || 'Needs a split before deletion: manifest audits cover the historical docs, but this suite also carries unique source/runtime/script/workflow/fixture/package guardrails that must be migrated or explicitly accepted elsewhere first.',
  }
}

const HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP = [
  ...familyEntries(HISTORICAL_CHECKPOINT_FAMILIES_V0419_V0427),
  ...familyEntries(HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643),
]

const HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES = HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP
  .filter(entry => entry.deleteReadiness === 'ready')
  .map(entry => entry.suite)

const HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES = HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP
  .filter(entry => entry.deleteReadiness === 'needs-split')
  .map(entry => entry.suite)

const HISTORICAL_CHECKPOINT_KEEP_SUITES = HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP
  .filter(entry => entry.deleteReadiness === 'keep')
  .map(entry => entry.suite)

const HISTORICAL_CHECKPOINT_DELETION_READINESS_COUNTS = HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP
  .reduce((counts, entry) => {
    counts[entry.deleteReadiness] += 1
    return counts
  }, { ready: 0, 'needs-split': 0, keep: 0 })

const HISTORICAL_CHECKPOINT_DELETION_MANIFEST_INPUTS = {
  candidatesV0419V0427: HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0419_V0427,
  candidatesV0628V0643: HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643,
  candidatesV0644V0688: HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688,
  nonCandidatesV0628V0643: HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643,
  nonCandidatesV0644V0688: HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0644_V0688,
}

module.exports = {
  DELETE_READINESS_VALUES,
  HISTORICAL_CHECKPOINT_DELETION_MANIFEST_INPUTS,
  HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT,
  HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP,
  HISTORICAL_CHECKPOINT_DELETION_READINESS_COUNTS,
  HISTORICAL_CHECKPOINT_DELETION_REPLACEMENT_AUDITS,
  HISTORICAL_CHECKPOINT_KEEP_SUITES,
  HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES,
  HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES,
  HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES,
  HISTORICAL_CHECKPOINT_STEP5C_READY_DELETION_CANDIDATE_DETAILS,
  HISTORICAL_CHECKPOINT_T024_DELETED_SUITES,
  KEEP_DELETION_CANDIDATE_DETAILS,
  NEEDS_SPLIT_DELETION_CANDIDATE_DETAILS,
  PARTIAL_REPLACED_ASSERTION_CATEGORIES,
  READY_DELETION_CANDIDATE_SUITES,
  READY_REPLACED_ASSERTION_CATEGORIES,
}
