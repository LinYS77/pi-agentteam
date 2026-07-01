const assert = require('node:assert/strict')
const path = require('node:path')
const {
  assertIncludes,
  assertNoOverclaims,
  existsRel,
  readRel,
} = require('../helpers/fsAssertions.cjs')
const { assertPackageNoReleaseGuards } = require('../helpers/packageGuards.cjs')
const { assertNoRawOrReleaseArtifacts } = require('../helpers/nativeGuards.cjs')
const {
  COMMON_NO_RELEASE_OVERCLAIMS,
  CURRENT_ROADMAP_EXPECTATIONS,
  HISTORICAL_CHECKPOINT_FAMILIES_V0644_V0688,
  HISTORICAL_CHECKPOINT_DOCS_V0644_V0688,
  HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0644_V0688,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688,
} = require('../fixtures/kernel/historicalCheckpoints.cjs')

const HISTORICAL_SCOPE_MARKERS = [
  'Result:',
  'Scope:',
  'gate',
  'cutover',
  'checkpoint',
  'evidence',
  'does not',
  'No ',
  'STOP for',
  'remain',
]

const RELEASE_AND_PACKAGE_OVERCLAIMS = COMMON_NO_RELEASE_OVERCLAIMS.filter(phrase => ![
  'default Go is approved',
  'Go is default',
  'Go remains default',
  'fallback deletion is approved',
  'TypeScript parser fallback deletion is approved',
].includes(phrase))

const RELEASE_AUTHORIZATION_PATTERNS = [
  /\b(?:npm\s+publish|npm\s+version|git\s+tag|git\s+push|gh\s+release)\s+(?:is|are|was|were|remains?)?\s*(?:approved|authorized|allowed)\b/i,
  /\b(?:approve|approves|approved|authorize|authorizes|authorized|allow|allows|allowed)\s+(?:npm\s+publish|npm\s+version|git\s+tag|git\s+push|gh\s+release)\b/i,
]

const EXPECTED_V0644_V0688_VERSIONS = Array.from(
  { length: 45 },
  (_, index) => `v0.6.${44 + index}`,
)

const EXPECTED_STEP6_BATCH1_DELETED_READ_ONLY_FACADE_SUITES = [
  'tests/suites/go-kernel-v0655-go-list-agentteam-panes-facade-cutover.cjs',
  'tests/suites/go-kernel-v0656-go-inspect-pane-facade-cutover.cjs',
  'tests/suites/go-kernel-v0657-go-pane-exists-facade-cutover.cjs',
  'tests/suites/go-kernel-v0658-go-resolve-pane-binding-facade-cutover.cjs',
  'tests/suites/go-kernel-v0659-go-target-for-pane-facade-cutover.cjs',
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

function suitePrefixForVersion(version) {
  return `tests/suites/go-kernel-${String(version).replace('v0.', 'v0').replace(/\./g, '')}`
}

function assertManifestShape() {
  assert.equal(HISTORICAL_CHECKPOINT_FAMILIES_V0644_V0688.length, EXPECTED_V0644_V0688_VERSIONS.length, 'manifest should cover every historical checkpoint from v0.6.44 through v0.6.88')
  assert.deepEqual(HISTORICAL_CHECKPOINT_FAMILIES_V0644_V0688.map(family => family.version), EXPECTED_V0644_V0688_VERSIONS, 'manifest should preserve chronological v0.6.44-v0.6.88 coverage')
  assert.equal(HISTORICAL_CHECKPOINT_DOCS_V0644_V0688.length, EXPECTED_V0644_V0688_VERSIONS.length, 'v0.6.44-v0.6.88 scope should have one canonical perf doc per historical version')
  assert.equal(HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688.length, EXPECTED_STEP6_BATCH1_DELETED_READ_ONLY_FACADE_SUITES.length, 'v0.6.44-v0.6.88 should mark only Step 6 batch 1 deleted low-risk read-only facade wrappers as replacement candidates')
  assert.equal(HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0644_V0688.length, EXPECTED_V0644_V0688_VERSIONS.length - EXPECTED_STEP6_BATCH1_DELETED_READ_ONLY_FACADE_SUITES.length, 'v0.6.44-v0.6.88 should preserve all non-deleted behavior/gate suites as cautious non-candidates')
  assertSameSet(HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688, EXPECTED_STEP6_BATCH1_DELETED_READ_ONLY_FACADE_SUITES, 'v0.6.44-v0.6.88 Step 6 batch 1 replacement candidates')
  assertUnique(HISTORICAL_CHECKPOINT_FAMILIES_V0644_V0688.map(family => family.id), 'v0.6.44-v0.6.88 family ids')
  assertUnique(HISTORICAL_CHECKPOINT_DOCS_V0644_V0688, 'v0.6.44-v0.6.88 historical checkpoint docs')
  assertUnique(HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688, 'v0.6.44-v0.6.88 replacement candidate suites')
  assertUnique(HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0644_V0688, 'v0.6.44-v0.6.88 cautious non-candidate suites')

  for (const suite of HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688) {
    assert.equal(HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0644_V0688.includes(suite), false, `${suite} should not be both a replacement candidate and a cautious non-candidate`)
  }

  for (const family of HISTORICAL_CHECKPOINT_FAMILIES_V0644_V0688) {
    assert.ok(family.id.startsWith(family.version.replace(/\./g, '').replace('v', 'v')), `${family.id} should carry version identity`)
    assert.ok(family.checkpointLabel, `${family.id} should have a checkpoint label`)
    assert.deepEqual(family.docs, [family.checkpointDoc], `${family.id} should map to one canonical historical perf doc`)
    const isStep6Batch1DeletedFamily = family.replacementCandidateSuites.length === 1
    assert.ok(Array.isArray(family.replacementCandidateSuites), `${family.id} should explicitly name replacement candidates, even when empty`)
    assert.ok(Array.isArray(family.nonCandidateSuites), `${family.id} should explicitly preserve cautious non-candidates`)
    assert.equal(family.replacementCandidateSuites.length, isStep6Batch1DeletedFamily ? 1 : 0, `${family.id} replacement candidate count should match Step 6 batch 1 deletion scope`)
    assert.equal(family.nonCandidateSuites.length, isStep6Batch1DeletedFamily ? 0 : 1, `${family.id} non-candidate count should match Step 6 batch 1 deletion scope`)
    assert.ok(family.requiredThemes.length >= 3, `${family.id} should define compact required themes`)

    for (const doc of family.docs) {
      assert.ok(doc.startsWith(`docs/perf/${family.version}-`), `${doc} should stay under its historical version prefix`)
      assert.ok(doc.endsWith('.md'), `${doc} should be a markdown checkpoint/audit doc`)
    }
    for (const suite of family.replacementCandidateSuites) {
      assert.ok(EXPECTED_STEP6_BATCH1_DELETED_READ_ONLY_FACADE_SUITES.includes(suite), `${suite} should be an approved Step 6 batch 1 deleted replacement candidate`)
      assert.ok(suite.startsWith(suitePrefixForVersion(family.version)), `${suite} should carry the historical suite version prefix`)
      assert.ok(suite.endsWith('.cjs'), `${suite} should be a CommonJS suite path`)
    }
    for (const suite of family.nonCandidateSuites) {
      assert.ok(suite.startsWith(suitePrefixForVersion(family.version)), `${suite} should carry the historical suite version prefix`)
      assert.ok(suite.endsWith('.cjs'), `${suite} should be a CommonJS suite path`)
    }
  }
}

function readDocs(root, docs) {
  return docs.map(doc => ({ doc, text: readRel(root, doc) }))
}

function assertHistoricalFraming(doc, text) {
  assert.ok(text.startsWith('# '), `${doc} should keep a markdown title`)
  const markerHits = HISTORICAL_SCOPE_MARKERS.filter(marker => text.includes(marker))
  assert.ok(markerHits.length >= 2, `${doc} should retain historical gate/cutover/audit framing`)
  for (const pattern of RELEASE_AUTHORIZATION_PATTERNS) {
    assert.equal(pattern.test(text), false, `${doc} should not authorize release mechanics: ${pattern}`)
  }
}

function assertContinuityLinks(root, family) {
  const plan = readRel(root, CURRENT_ROADMAP_EXPECTATIONS.path)
  for (const backlink of family.planBacklinks) assertIncludes(plan, backlink, `${family.id} plan backlink`)

  for (const link of family.continuityLinks) {
    const source = readRel(root, link.from)
    for (const target of link.to) assertIncludes(source, target, `${family.id} continuity ${link.from}`)
  }
}

function assertCurrentRoadmapFraming(root) {
  const plan = readRel(root, CURRENT_ROADMAP_EXPECTATIONS.path)
  for (const phrase of CURRENT_ROADMAP_EXPECTATIONS.requiredPhrases) {
    assertIncludes(plan, phrase, 'current roadmap historical ledger framing')
  }
  assertNoOverclaims(plan, CURRENT_ROADMAP_EXPECTATIONS.forbiddenPhrases, 'current roadmap historical ledger framing')
}

function assertGitignoreAllowList(root) {
  const gitignore = readRel(root, '.gitignore')
  for (const doc of HISTORICAL_CHECKPOINT_DOCS_V0644_V0688) assertIncludes(gitignore, `!${doc}`, '.gitignore v0.6.44-v0.6.88 docs allow-list')
  assert.equal(gitignore.includes('!docs/perf/v0.6.41-true-operator-planrun-cancel-evidence.md'), false, 'ignored T129 local evidence doc must remain untracked/not allow-listed')
}

module.exports = {
  name: 'Go kernel v0.6.44-v0.6.88 historical checkpoint manifest audit',
  async run(env) {
    const root = env.helpers.extRoot

    assertManifestShape()
    assertPackageNoReleaseGuards(root)
    assertNoRawOrReleaseArtifacts(root)
    assertCurrentRoadmapFraming(root)
    assertGitignoreAllowList(root)

    for (const suitePath of HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688) {
      assert.equal(existsRel(root, suitePath), false, `${suitePath} should be absent after Step 6 batch 1 read-only facade deletion`)
    }
    for (const suitePath of HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0644_V0688) {
      assert.equal(existsRel(root, suitePath), true, `${suitePath} should remain preserved as a cautious non-candidate`)
    }

    for (const family of HISTORICAL_CHECKPOINT_FAMILIES_V0644_V0688) {
      for (const doc of family.docs) assert.equal(existsRel(root, doc), true, `${family.id} doc should exist: ${doc}`)
      const docs = readDocs(root, family.docs)
      const combined = docs.map(item => item.text).join('\n\n')

      for (const { doc, text } of docs) assertHistoricalFraming(doc, text)
      for (const theme of family.requiredThemes) assertIncludes(combined, theme, `${family.id} compact theme`)
      assertNoOverclaims(combined, RELEASE_AND_PACKAGE_OVERCLAIMS, `${family.id} release/package no-overclaim expectations`)
      assertContinuityLinks(root, family)
    }

    const packageJson = JSON.parse(readRel(root, 'package.json'))
    assert.equal(packageJson.version, '0.6.8', 'v0.6.44-v0.6.88 historical checkpoint audit must keep package version unchanged')
    assert.equal(path.basename(__filename), 'go-kernel-v0688-historical-checkpoints-audit.cjs', 'suite name should remain versioned historical/audit-only for tier auto-discovery')
  },
}
