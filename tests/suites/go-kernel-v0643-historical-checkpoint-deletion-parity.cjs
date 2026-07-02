const assert = require('node:assert/strict')
const path = require('node:path')
const {
  assertIncludes,
  existsRel,
  readRel,
} = require('../helpers/fsAssertions.cjs')
const { APPROVED_NATIVE_ROOT, assertNoRawOrReleaseArtifacts } = require('../helpers/nativeGuards.cjs')
const { assertPackageNoReleaseGuards } = require('../helpers/packageGuards.cjs')
const {
  HISTORICAL_CHECKPOINT_DOCS_V0419_V0427,
  HISTORICAL_CHECKPOINT_DOCS_V0628_V0643,
  HISTORICAL_CHECKPOINT_DOCS_V0644_V0688,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0419_V0427,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688,
} = require('../fixtures/kernel/historicalCheckpoints.cjs')
const {
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
  HISTORICAL_CHECKPOINT_STEP5D_DELETED_SUITES,
  HISTORICAL_CHECKPOINT_STEP5D_READY_DELETION_CANDIDATE_DETAILS,
  HISTORICAL_CHECKPOINT_T024_DELETED_SUITES,
  KEEP_DELETION_CANDIDATE_DETAILS,
  NEEDS_SPLIT_DELETION_CANDIDATE_DETAILS,
  READY_DELETION_CANDIDATE_SUITES,
  READY_REPLACED_ASSERTION_CATEGORIES,
} = require('../fixtures/kernel/historicalCheckpointDeletionMap.cjs')

const EXPECTED_CANDIDATE_TOTAL = 47
const EXPECTED_READY_COUNT = 46
const EXPECTED_T024_DELETED_COUNT = 15
const EXPECTED_STEP5C_DELETED_COUNT = 27
const EXPECTED_STEP5D_DELETED_COUNT = 4
const EXPECTED_NEEDS_SPLIT_COUNT = 0
const EXPECTED_KEEP_COUNT = 1
const EXPECTED_V0644_V0688_STEP6_DELETION_CANDIDATES = [
  'tests/suites/go-kernel-v0655-go-list-agentteam-panes-facade-cutover.cjs',
  'tests/suites/go-kernel-v0656-go-inspect-pane-facade-cutover.cjs',
  'tests/suites/go-kernel-v0657-go-pane-exists-facade-cutover.cjs',
  'tests/suites/go-kernel-v0658-go-resolve-pane-binding-facade-cutover.cjs',
  'tests/suites/go-kernel-v0659-go-target-for-pane-facade-cutover.cjs',
  'tests/suites/go-kernel-v0662-go-window-pane-lookup-facade-cutover.cjs',
  'tests/suites/go-kernel-v0663-go-tmux-availability-facade-cutover.cjs',
  'tests/suites/go-kernel-v0664-go-pane-app-start-wait-cutover.cjs',
  'tests/suites/go-kernel-v0665-go-agentteam-window-discovery-cutover.cjs',
  'tests/suites/go-kernel-v0666-go-session-existence-cutover.cjs',
  'tests/suites/go-kernel-v0667-go-current-binding-window-fallback-cutover.cjs',
  'tests/suites/go-kernel-v0668-go-detached-leader-binding-cutover.cjs',
  'tests/suites/go-kernel-v0669-go-detached-first-pane-cutover.cjs',
  'tests/suites/go-kernel-v0670-go-window-name-lookup-cutover.cjs',
  'tests/suites/go-kernel-v0671-go-mutating-window-marking-gate.cjs',
  'tests/suites/go-kernel-v0672-go-window-marking-cutover.cjs',
  'tests/suites/go-kernel-v0673-go-refresh-window-pane-labels-gate.cjs',
  'tests/suites/go-kernel-v0674-go-refresh-window-pane-labels-cutover.cjs',
  'tests/suites/go-kernel-v0675-go-pane-label-setting-gate.cjs',
  'tests/suites/go-kernel-v0676-go-pane-label-setting-cutover.cjs',
  'tests/suites/go-kernel-v0677-go-pane-label-clearing-gate.cjs',
  'tests/suites/go-kernel-v0678-go-pane-label-clearing-cutover.cjs',
  'tests/suites/go-kernel-v0679-go-create-teammate-pane-gate.cjs',
  'tests/suites/go-kernel-v0680-go-create-teammate-pane-cutover.cjs',
  'tests/suites/go-kernel-v0681-go-detached-new-session-gate.cjs',
  'tests/suites/go-kernel-v0682-go-detached-new-session-cutover.cjs',
  'tests/suites/go-kernel-v0683-go-detached-new-window-gate.cjs',
  'tests/suites/go-kernel-v0684-go-detached-new-window-cutover.cjs',
]

function assertUnique(values, label) {
  const seen = new Set()
  const duplicates = []
  for (const value of values) {
    if (seen.has(value)) duplicates.push(value)
    seen.add(value)
  }
  assert.deepEqual(duplicates, [], `${label} should not contain duplicates`)
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function assertSameSet(actual, expected, label) {
  assert.deepEqual(sorted(actual), sorted(expected), `${label} should match exactly`)
}

function manifestCandidates() {
  return [
    ...HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0419_V0427,
    ...HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643,
  ]
}

function assertMapShape() {
  const candidates = manifestCandidates()
  assert.equal(HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0419_V0427.length, 29, 'v0.4.19-v0.4.27 manifest candidate count should remain stable')
  assert.equal(HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643.length, 18, 'v0.6.28-v0.6.43 manifest candidate count should remain stable')
  assertSameSet(HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688, EXPECTED_V0644_V0688_STEP6_DELETION_CANDIDATES, 'v0.6.44-v0.6.88 deletion candidates should be limited to Step 6 read-only facade/orchestration, non-destructive window/label, and high-risk creation lifecycle deletions')
  assert.equal(candidates.length, EXPECTED_CANDIDATE_TOTAL, 'combined deletion parity candidate count should remain stable')
  assert.equal(HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP.length, EXPECTED_CANDIDATE_TOTAL, 'deletion parity map should enumerate every manifest candidate exactly once')
  assert.equal(HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT, 'tests/suites/go-kernel-v0643-historical-checkpoint-deletion-parity.cjs', 'parity audit suite path should stay versioned historical/audit-only')

  assertUnique(candidates, 'manifest deletion candidates')
  assertUnique(HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP.map(entry => entry.suite), 'deletion parity map suites')
  assertSameSet(HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP.map(entry => entry.suite), candidates, 'deletion parity map candidate suites')

  assert.deepEqual(HISTORICAL_CHECKPOINT_DELETION_MANIFEST_INPUTS.candidatesV0419V0427, HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0419_V0427, 'fixture should preserve v0.4.19-v0.4.27 manifest input snapshot')
  assert.deepEqual(HISTORICAL_CHECKPOINT_DELETION_MANIFEST_INPUTS.candidatesV0628V0643, HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643, 'fixture should preserve v0.6.28-v0.6.43 manifest input snapshot')
  assertSameSet(HISTORICAL_CHECKPOINT_DELETION_MANIFEST_INPUTS.candidatesV0644V0688, EXPECTED_V0644_V0688_STEP6_DELETION_CANDIDATES, 'fixture should explicitly record Step 6 v0.6.44-v0.6.88 candidate input')

  assert.equal(HISTORICAL_CHECKPOINT_DELETION_READINESS_COUNTS.ready, EXPECTED_READY_COUNT, 'ready-to-delete count should remain evidence-reviewed')
  assert.equal(HISTORICAL_CHECKPOINT_DELETION_READINESS_COUNTS['needs-split'], EXPECTED_NEEDS_SPLIT_COUNT, 'needs-split count should remain evidence-reviewed')
  assert.equal(HISTORICAL_CHECKPOINT_DELETION_READINESS_COUNTS.keep, EXPECTED_KEEP_COUNT, 'keep count should remain evidence-reviewed')
  assert.equal(HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES.length, EXPECTED_READY_COUNT, 'ready-to-delete list length should match count')
  assert.equal(HISTORICAL_CHECKPOINT_T024_DELETED_SUITES.length, EXPECTED_T024_DELETED_COUNT, 'T024 deleted suite count should remain explicit')
  assert.equal(HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES.length, EXPECTED_STEP5C_DELETED_COUNT, 'Step5C deleted suite count should remain explicit')
  assert.equal(HISTORICAL_CHECKPOINT_STEP5D_DELETED_SUITES.length, EXPECTED_STEP5D_DELETED_COUNT, 'Step5D deleted suite count should remain explicit')
  assert.equal(HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES.length, EXPECTED_NEEDS_SPLIT_COUNT, 'needs-split list length should match count')
  assert.equal(HISTORICAL_CHECKPOINT_KEEP_SUITES.length, EXPECTED_KEEP_COUNT, 'keep list length should match count')
  assertSameSet(HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES, READY_DELETION_CANDIDATE_SUITES, 'ready-to-delete suite export')
  assertSameSet(HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES, [...HISTORICAL_CHECKPOINT_T024_DELETED_SUITES, ...HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES, ...HISTORICAL_CHECKPOINT_STEP5D_DELETED_SUITES], 'ready-to-delete suite slices')
  assertSameSet(Object.keys(HISTORICAL_CHECKPOINT_STEP5C_READY_DELETION_CANDIDATE_DETAILS), HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES, 'Step5C guard-evidence details')
  assertSameSet(Object.keys(HISTORICAL_CHECKPOINT_STEP5D_READY_DELETION_CANDIDATE_DETAILS), HISTORICAL_CHECKPOINT_STEP5D_DELETED_SUITES, 'Step5D guard-evidence details')

  const detailSuites = [
    ...HISTORICAL_CHECKPOINT_T024_DELETED_SUITES,
    ...Object.keys(HISTORICAL_CHECKPOINT_STEP5C_READY_DELETION_CANDIDATE_DETAILS),
    ...Object.keys(HISTORICAL_CHECKPOINT_STEP5D_READY_DELETION_CANDIDATE_DETAILS),
    ...Object.keys(NEEDS_SPLIT_DELETION_CANDIDATE_DETAILS),
    ...Object.keys(KEEP_DELETION_CANDIDATE_DETAILS),
  ]
  assertSameSet(detailSuites, candidates, 'manual readiness classifications')
}

function assertEntryShape(root) {
  const validReadiness = new Set(DELETE_READINESS_VALUES)
  const readyRequired = new Set(READY_REPLACED_ASSERTION_CATEGORIES)
  for (const entry of HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP) {
    assert.ok(entry.suite.startsWith('tests/suites/go-kernel-v0'), `${entry.suite} should be a historical Go suite path`)
    assert.ok(entry.suite.endsWith('.cjs'), `${entry.suite} should be a CommonJS suite`)
    assert.ok(['v0419-v0427', 'v0628-v0643'].includes(entry.scope), `${entry.suite} should have a supported historical scope`)
    assert.ok(entry.familyId, `${entry.suite} should record its manifest family id`)
    assert.ok(/^v0\.(?:4|6)\./.test(entry.version), `${entry.suite} should record a historical version`)
    assert.equal(validReadiness.has(entry.deleteReadiness), true, `${entry.suite} should use a valid deleteReadiness value`)
    assert.equal(entry.replacementAuditSuite, HISTORICAL_CHECKPOINT_DELETION_REPLACEMENT_AUDITS[entry.scope], `${entry.suite} should point at the scope replacement audit`)
    assert.deepEqual(entry.supplementalAuditSuites, [HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT], `${entry.suite} should point at this parity audit as supplemental deletion evidence`)
    assert.ok(Array.isArray(entry.replacedAssertionCategories), `${entry.suite} should list replaced assertion categories`)
    assert.ok(entry.replacedAssertionCategories.length >= 5, `${entry.suite} should have meaningful replacement categories`)
    assert.ok(Array.isArray(entry.uniqueAssertions), `${entry.suite} should list unique assertions or an empty list`)
    assert.ok(Array.isArray(entry.risks), `${entry.suite} should list risks or an empty list`)
    assert.ok(entry.rationale && typeof entry.rationale === 'string', `${entry.suite} should have a rationale`)

    if (entry.deleteReadiness === 'ready') {
      for (const category of readyRequired) assert.ok(entry.replacedAssertionCategories.includes(category), `${entry.suite} ready entry should include replacement category ${category}`)
      assert.deepEqual(entry.uniqueAssertions, [], `${entry.suite} ready entry should not carry unresolved unique assertions`)
      assert.deepEqual(entry.risks, [], `${entry.suite} ready entry should not carry unresolved risks`)
      if (HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES.includes(entry.suite)) {
        assert.equal(entry.deletionSlice, 'T034-step5c', `${entry.suite} should record Step5C deletion slice`)
        assert.ok(entry.currentGuardEvidence.length >= 1, `${entry.suite} Step5C entry should record current guard evidence`)
        for (const evidence of entry.currentGuardEvidence) {
          assert.equal(existsRel(root, evidence.suite), true, `${entry.suite} guard suite should exist: ${evidence.suite}`)
          assert.equal(existsRel(root, evidence.helper), true, `${entry.suite} guard helper should exist: ${evidence.helper}`)
          assert.ok(evidence.categories.length >= 1, `${entry.suite} guard evidence should list categories`)
        }
        assertIncludes(entry.rationale, 'Step 5B current', `${entry.suite} Step5C ready rationale`)
        assertIncludes(entry.rationale, 'guard evidence', `${entry.suite} Step5C ready rationale`)
      } else if (HISTORICAL_CHECKPOINT_STEP5D_DELETED_SUITES.includes(entry.suite)) {
        assert.equal(entry.deletionSlice, 'T036-step5d', `${entry.suite} should record Step5D deletion slice`)
        assert.ok(entry.currentGuardEvidence.length >= 1, `${entry.suite} Step5D entry should record current guard evidence`)
        for (const evidence of entry.currentGuardEvidence) {
          assert.equal(existsRel(root, evidence.suite), true, `${entry.suite} guard suite should exist: ${evidence.suite}`)
          assert.equal(existsRel(root, evidence.helper), true, `${entry.suite} guard helper should exist: ${evidence.helper}`)
          assert.ok(evidence.categories.length >= 1, `${entry.suite} guard evidence should list categories`)
        }
        assertIncludes(entry.rationale, 'Step 5D', `${entry.suite} Step5D ready rationale`)
        assertIncludes(entry.rationale, 'current package/release/security/rollback guard', `${entry.suite} Step5D ready rationale`)
      } else {
        assert.equal(entry.deletionSlice, 'T024-ready', `${entry.suite} should record T024 ready deletion slice`)
        assert.deepEqual(entry.currentGuardEvidence, [], `${entry.suite} T024-ready entry should not claim current guard evidence`)
        assertIncludes(entry.rationale, 'docs/checkpoint/evidence-only', `${entry.suite} ready rationale`)
      }
    } else {
      assert.ok(entry.uniqueAssertions.length >= 1, `${entry.suite} non-ready entry should document unique assertions`)
      assert.ok(entry.risks.length >= 1, `${entry.suite} non-ready entry should document deletion risks`)
      assert.equal(entry.replacedAssertionCategories.includes('preserved-candidate-existence'), true, `${entry.suite} non-ready entry should still preserve candidate existence`)
    }
  }
}

function assertNoNonCandidatesInDeletionLists() {
  const nonCandidates = [
    ...HISTORICAL_CHECKPOINT_DELETION_MANIFEST_INPUTS.nonCandidatesV0628V0643,
    ...HISTORICAL_CHECKPOINT_DELETION_MANIFEST_INPUTS.nonCandidatesV0644V0688,
  ]
  const mappedSuites = HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP.map(entry => entry.suite)
  for (const suite of nonCandidates) {
    assert.equal(HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES.includes(suite), false, `${suite} must not appear in ready-to-delete suites`)
    assert.equal(mappedSuites.includes(suite), false, `${suite} must not appear in manifest candidate deletion map`)
  }

  for (const suite of HISTORICAL_CHECKPOINT_DELETION_MANIFEST_INPUTS.nonCandidatesV0644V0688) {
    assert.equal(suite.startsWith('tests/suites/go-kernel-v06'), true, `${suite} should be a v0.6 historical non-candidate`)
    assert.equal(HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES.includes(suite), false, `${suite} v0.6.44-v0.6.88 non-candidate must not be deletion-ready`)
  }
}

function assertPostDeletionFileState(root) {
  const allCandidateSuites = manifestCandidates()
  const readySet = new Set(HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES)
  const notDeletedSuites = [
    ...HISTORICAL_CHECKPOINT_NEEDS_SPLIT_SUITES,
    ...HISTORICAL_CHECKPOINT_KEEP_SUITES,
  ]
  assertSameSet([
    ...HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES,
    ...notDeletedSuites,
  ], allCandidateSuites, 'post-deletion suite accounting')

  for (const suite of HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES) {
    assert.equal(existsRel(root, suite), false, `${suite} should be absent after the T024 + Step5C + Step5D ready-suite deletion slices`)
  }
  for (const suite of notDeletedSuites) {
    assert.equal(existsRel(root, suite), true, `${suite} should remain because it is needs-split/keep, not ready-to-delete`)
    assert.equal(readySet.has(suite), false, `${suite} must not also be ready-to-delete`)
  }

  for (const entry of HISTORICAL_CHECKPOINT_DELETION_PARITY_MAP) {
    assert.equal(existsRel(root, entry.replacementAuditSuite), true, `${entry.replacementAuditSuite} should exist for ${entry.suite}`)
    for (const supplemental of entry.supplementalAuditSuites) assert.equal(existsRel(root, supplemental), true, `${supplemental} should exist for ${entry.suite}`)
  }
  for (const doc of [
    ...HISTORICAL_CHECKPOINT_DOCS_V0419_V0427,
    ...HISTORICAL_CHECKPOINT_DOCS_V0628_V0643,
    ...HISTORICAL_CHECKPOINT_DOCS_V0644_V0688,
  ]) {
    assert.equal(existsRel(root, doc), true, `${doc} should still exist; T024/Step5C/Step5D must not delete historical docs`)
  }
  for (const suite of [
    ...HISTORICAL_CHECKPOINT_DELETION_MANIFEST_INPUTS.nonCandidatesV0628V0643,
    ...HISTORICAL_CHECKPOINT_DELETION_MANIFEST_INPUTS.nonCandidatesV0644V0688,
  ]) {
    assert.equal(existsRel(root, suite), true, `${suite} should remain as a cautious non-candidate`)
  }
  for (const manifestFile of [
    'tests/fixtures/kernel/historicalCheckpoints.cjs',
    'tests/fixtures/kernel/historicalCheckpointDeletionMap.cjs',
  ]) {
    assert.equal(existsRel(root, manifestFile), true, `${manifestFile} should remain as canonical manifest evidence`)
  }
}

function assertPackageSurfaceStillConservative(root) {
  const packageJson = assertPackageNoReleaseGuards(root)
  const files = packageJson.files || []
  assert.equal(files.some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'package files should not include kernel source')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'os'), false, 'main package must not define native os metadata')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'cpu'), false, 'main package must not define native cpu metadata')
  for (const item of files) {
    const allowedEmbeddedNative = item.startsWith(`${APPROVED_NATIVE_ROOT}/`)
    const nativeGenerated = /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)
    assert.equal(nativeGenerated && !allowedEmbeddedNative, false, `package files must not include unapproved native/helper/generated output: ${item}`)
  }
}

module.exports = {
  name: 'Go kernel historical checkpoint deletion parity map',
  async run(env) {
    const root = env.helpers.extRoot

    assertMapShape()
    assertEntryShape(root)
    assertNoNonCandidatesInDeletionLists()
    assertPostDeletionFileState(root)
    assertPackageSurfaceStillConservative(root)
    assertNoRawOrReleaseArtifacts(root)

    const packageJson = JSON.parse(readRel(root, 'package.json'))
    assert.equal(packageJson.version, '0.6.8', 'historical checkpoint deletion parity must keep package version unchanged')
    assert.equal(path.basename(__filename), path.basename(HISTORICAL_CHECKPOINT_DELETION_PARITY_AUDIT), 'suite name should remain versioned historical/audit-only for tier auto-discovery')
  },
}
