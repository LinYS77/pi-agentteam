const {
  HISTORICAL_CHECKPOINT_FAMILIES_V0419_V0427,
  HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643,
  HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643,
  HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0644_V0688,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0419_V0427,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688,
} = require('./historicalCheckpoints.cjs')

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

const READY_DELETION_CANDIDATE_SUITES = [
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

const NEEDS_SPLIT_DELETION_CANDIDATE_DETAILS = {
  'tests/suites/go-kernel-v0419-tmux-readiness-docs.cjs': {
    uniqueAssertions: [
      'asserts parser parity fixture and parser parity suite existence',
      'checks detailed helper failure taxonomy and no-leak wording beyond compact manifest themes',
    ],
    risks: ['Split or explicitly migrate the parity fixture/suite existence and detailed helper-failure taxonomy before deleting.'],
  },
  'tests/suites/go-kernel-v0419-readiness-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'asserts v0.4.19 checkpoint links every prerequisite artifact plus parser parity fixture/suite evidence',
      'checks detailed STOP recommendation wording for runtime prerequisite signoff',
    ],
    risks: ['Split checkpoint-specific parity fixture references and detailed readiness recommendation checks before deleting.'],
  },
  'tests/suites/go-kernel-v0421-runtime-availability-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'executes dist kernel adapter metadata for go-packaged-preview semantics',
      'checks benchmark metadata helpers for preview-mode behavior',
      'asserts package/native surface invariants beyond historical doc existence',
    ],
    risks: ['Move runtime metadata and benchmark-mode assertions into non-historical behavior coverage before deletion.'],
  },
  'tests/suites/go-kernel-v0422-native-package-metadata-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'checks package/native metadata absence and generated native path exclusion in package surface',
      'executes kernel adapter metadata for explicit preview semantics',
      'cross-links multiple v0.4.22 prototype/guard suites as evidence artifacts',
    ],
    risks: ['Keep until package/native metadata and preview-mode behavior assertions are separately represented.'],
  },
  'tests/suites/go-kernel-v0423-compact-diagnostics-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'checks compact diagnostics helper/source references and package/native metadata absence',
      'executes kernel adapter metadata for explicit local preview behavior',
      'links multiple diagnostics model and parser failure policy suites as evidence artifacts',
    ],
    risks: ['Split compact diagnostics runtime/package assertions from historical checkpoint doc assertions before deletion.'],
  },
  'tests/suites/go-kernel-v0424-readiness-command-contract-docs.cjs': {
    uniqueAssertions: [
      'executes kernel adapter metadata to verify readiness remains explicit/local and non-default',
      'checks diagnostics helper/source seam references beyond manifest themes',
    ],
    risks: ['Move kernel-mode metadata assertions to behavior coverage before deleting this docs contract suite.'],
  },
  'tests/suites/go-kernel-v0424-readiness-command-seam-docs.cjs': {
    uniqueAssertions: [
      'reads command and tool source files to verify public command/tool seams are unchanged',
      'asserts readiness does not become a model-callable tool or broad public API surface',
    ],
    risks: ['Source-seam assertions must be migrated to current command/tool surface coverage before deletion.'],
  },
  'tests/suites/go-kernel-v0424-readiness-command-sunset-docs.cjs': {
    uniqueAssertions: [
      'reads readiness command, team command, tool, panel, and renderer source to enforce minimal transitional command scope',
      'checks parser literal count and absence of nested readiness options/subcommands',
    ],
    risks: ['Do not delete until readiness command minimality/source checks have a non-historical owner.'],
  },
  'tests/suites/go-kernel-v0424-readiness-command-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'reads readiness command and public surface source to enforce transitional command containment',
      'links integration and sunset suites as evidence for command behavior',
    ],
    risks: ['Split command containment and source-surface assertions before deleting checkpoint docs coverage.'],
  },
  'tests/suites/go-kernel-v0425-native-availability-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'reads core/kernel.ts to assert explicit helper-path and fallback behavior',
      'reads readiness command/team command source to prevent command expansion',
      'checks native artifact/package surface invariants beyond compact manifest coverage',
    ],
    risks: ['Move kernel/readiness source invariants to behavior/package coverage before deletion.'],
  },
  'tests/suites/go-kernel-v0426-storage-release-policy-docs.cjs': {
    uniqueAssertions: [
      'uses review artifact workflow guard helpers to prevent CI release/package scripts',
      'checks future storage/release policy matrix details beyond compact manifest themes',
    ],
    risks: ['Migrate workflow/release-script guard coverage before deleting this storage policy suite.'],
  },
  'tests/suites/go-kernel-v0426-artifact-pipeline-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'reads core/kernel.ts and readiness command source to assert production behavior remains unchanged',
      'uses workflow guard helpers and package/native artifact scans',
      'links multiple artifact pipeline behavior/prototype suites as evidence',
    ],
    risks: ['Split source, workflow, package, and artifact-scan assertions before deleting checkpoint docs coverage.'],
  },
  'tests/suites/go-kernel-v0427-clean-install-consumption-contract-docs.cjs': {
    uniqueAssertions: [
      'reads core/kernel.ts and readiness source to assert production resolver behavior remains unchanged',
      'uses workflow guard helpers and package/native artifact scans',
      'references clean-install behavior suites and resolver discovery contracts as evidence',
    ],
    risks: ['Migrate clean-install/source/workflow guard assertions before deletion.'],
  },
  'tests/suites/go-kernel-v0427-install-layout-matrix-docs.cjs': {
    uniqueAssertions: [
      'defines PLATFORM_ROWS for supported and unsupported platform targets and asserts fail-closed unsupported rows',
      'implements packageRelativeLayoutPath and path-safety checks for future package-relative helper, manifest, checksum, provenance, and license paths',
      'implements validateResolverInputs cases for unsafe paths/path traversal, module/capability/protocol/helper/package-version skew, stale helper, and stale metadata fail-closed behavior',
    ],
    risks: ['Do not delete until platform matrix, path-safety, and resolver-input fail-closed contract coverage is migrated or explicitly replaced.'],
  },
  'tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'reads core/kernel.ts and readiness source to enforce helper-path/default behavior',
      'checks artifact bundle hashes, workflow guardrails, and package/native scans',
      'links clean-install, resolver discovery, rollback, and package-native behavior suites',
    ],
    risks: ['Split artifact hash, source, workflow, and package/native checks before deleting checkpoint docs coverage.'],
  },
  'tests/suites/go-kernel-v0629-real-implementation-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'reads builder scripts, packaged resolver source, and core/kernel.ts',
      'uses child process/go-build scope checks and gitignore allow-list checks',
      'asserts explicit preview runtime boundaries beyond historical doc wording',
    ],
    risks: ['Move builder/resolver/source/go-build-scope assertions to implementation coverage before deletion.'],
  },
  'tests/suites/go-kernel-v0630-ci-review-artifact-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'checks review-only GitHub workflow shape and permissions',
      'reads builder/verifier scripts and runtime resolver sources',
      'asserts no generated committed artifacts and go-build context boundaries',
    ],
    risks: ['Keep until workflow/script/runtime guard assertions are covered outside historical checkpoint docs.'],
  },
  'tests/suites/go-kernel-v0631-ci-review-artifact-hardening-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'checks strict review-only workflow shape and hosted-observation non-claims',
      'reads verifier scripts and runtime resolver sources',
      'asserts no generated or hosted artifacts are checked in',
    ],
    risks: ['Migrate verifier/workflow/runtime guardrails before deletion.'],
  },
  'tests/suites/go-kernel-v0632-ci-review-provenance-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'checks provenance workflow, hosted observation scripts, and strict review-only context',
      'reads builder/verifier/runtime resolver sources',
      'asserts no hosted/raw artifact records or release assets are checked in',
    ],
    risks: ['Split provenance workflow/script/runtime guard assertions before deletion.'],
  },
  'tests/suites/go-kernel-v0633-clean-install-proof-contract-docs.cjs': {
    uniqueAssertions: [
      'reads kernel/runtime resolver source to keep installed-layout discovery explicit and non-default',
      'checks hosted observation scripts/workflow invariants and no generated native artifacts',
      'executes dist/source boundary helpers for package/runtime semantics',
    ],
    risks: ['Migrate clean-install runtime/package/workflow assertions before deletion.'],
  },
  'tests/suites/go-kernel-v0633-clean-install-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'reads core kernel, resolver, fingerprint, readiness, team command, and Go helper source',
      'checks workflow/script/native artifact invariants and roadmap future gating',
      'asserts tool/control-plane non-expansion beyond manifest doc themes',
    ],
    risks: ['Move source/control-plane/workflow/native checks to non-historical coverage before deletion.'],
  },
  'tests/suites/go-kernel-v0634-ownership-install-layout-contract-docs.cjs': {
    uniqueAssertions: [
      'reads kernel/resolver source for install-layout and release behavior boundaries',
      'checks review workflow remains one linux-x64-glibc row with no release/signing/npm behavior',
      'scans for checked-in artifacts beyond compact manifest assertions',
    ],
    risks: ['Split package/runtime/workflow guardrails before deletion.'],
  },
  'tests/suites/go-kernel-v0634-distribution-option-matrix-docs.cjs': {
    uniqueAssertions: [
      'checks distribution option matrix fields and allowed/forbidden claims',
      'reads kernel/resolver source for package/release availability boundaries',
      'checks workflow target and package surface invariants',
    ],
    risks: ['Migrate distribution matrix and runtime/package guardrails before deletion.'],
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
  'tests/suites/go-kernel-v0635-pi-extension-compliance-contract-docs.cjs': {
    uniqueAssertions: [
      'reads index.ts, kernel/resolver, readiness, workflow, and tool fixtures for pi extension/package surface boundaries',
      'checks no native provider/release/default behavior or named public API surface is added',
    ],
    risks: ['Migrate pi extension package surface and runtime/workflow source guardrails before deletion.'],
  },
  'tests/suites/go-kernel-v0635-pi-extension-compliance-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'checks pi extension install/load scripts and evidence files exist',
      'reads package/runtime source and scans scripts/workflows/native artifacts',
      'asserts this remains a TypeScript pi extension package, not native/default/release checkpoint',
    ],
    risks: ['Split pi extension smoke/package/runtime/artifact checks before deletion.'],
  },
  'tests/suites/go-kernel-v0636-default-go-dry-run-contract-docs.cjs': {
    uniqueAssertions: [
      'reads core/kernel.ts, readiness/team command source, review workflow, builder/verifier/clean-install scripts',
      'asserts default-Go dry-run remains future governance and no default resolver/runtime authority is enabled',
    ],
    risks: ['Migrate runtime authority, workflow, and script guardrails before deletion.'],
  },
  'tests/suites/go-kernel-v0636-final-readiness-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'checks v0636 readiness fixtures and evidence registry/tag ledger suites',
      'reads runtime/command source and dry-run scripts/workflow for no default Go enablement',
      'asserts package/runtime/workflow/artifact invariants beyond manifest themes',
    ],
    risks: ['Split fixture, runtime, workflow, and default-Go dry-run assertions before deletion.'],
  },
  'tests/suites/go-kernel-v0637-v05-final-readiness-checkpoint-docs.cjs': {
    uniqueAssertions: [
      'checks final release-readiness fixture content and all v0637 supporting fixture/suite files',
      'asserts fixtures are not used by production panel/renderer sources',
      'checks package/runtime/artifact invariants for v0.5 readiness burn-down evidence',
    ],
    risks: ['Migrate fixture integrity and production-not-used assertions before deletion.'],
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
  const isReady = READY_DELETION_CANDIDATE_SET.has(suite)
  const details = keepDetails || needsSplitDetails || {}
  const deleteReadiness = keepDetails ? 'keep' : isReady ? 'ready' : 'needs-split'

  return {
    suite,
    scope,
    familyId: family.id,
    version: family.version,
    replacementAuditSuite: HISTORICAL_CHECKPOINT_DELETION_REPLACEMENT_AUDITS[scope],
    supplementalAuditSuites: [HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT],
    deleteReadiness,
    replacedAssertionCategories: deleteReadiness === 'ready'
      ? READY_REPLACED_ASSERTION_CATEGORIES
      : PARTIAL_REPLACED_ASSERTION_CATEGORIES,
    uniqueAssertions: deleteReadiness === 'ready' ? [] : details.uniqueAssertions,
    risks: deleteReadiness === 'ready' ? [] : details.risks,
    rationale: deleteReadiness === 'ready'
      ? 'Ready only because the suite is docs/checkpoint/evidence-only: its deletion-relevant assertions are represented by the scoped historical manifest audit plus this deletion parity audit, and it has no unique source/runtime/script/workflow/fixture behavior to preserve.'
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
  KEEP_DELETION_CANDIDATE_DETAILS,
  NEEDS_SPLIT_DELETION_CANDIDATE_DETAILS,
  PARTIAL_REPLACED_ASSERTION_CATEGORIES,
  READY_DELETION_CANDIDATE_SUITES,
  READY_REPLACED_ASSERTION_CATEGORIES,
}
