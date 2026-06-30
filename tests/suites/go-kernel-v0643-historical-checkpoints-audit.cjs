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
  HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643,
  HISTORICAL_CHECKPOINT_DOCS_V0628_V0643,
  HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643,
} = require('../fixtures/kernel/historicalCheckpoints.cjs')
const {
  HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES,
} = require('../fixtures/kernel/historicalCheckpointDeletionMap.cjs')

const HISTORICAL_SCOPE_MARKERS = [
  'Scope:',
  'docs/tests',
  'review-only',
  'checkpoint',
  'evidence',
  'STOP for',
  'does not',
  'not approve',
]

const EXPECTED_V0628_V0643_VERSIONS = [
  'v0.6.28',
  'v0.6.29',
  'v0.6.30',
  'v0.6.31',
  'v0.6.32',
  'v0.6.33',
  'v0.6.34',
  'v0.6.35',
  'v0.6.36',
  'v0.6.37',
  'v0.6.38',
  'v0.6.39',
  'v0.6.41',
  'v0.6.42',
  'v0.6.43',
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

function suitePrefixForVersion(version) {
  return `tests/suites/go-kernel-${String(version).replace('v0.', 'v0').replace(/\./g, '')}`
}

function assertManifestShape() {
  assert.equal(HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643.length, EXPECTED_V0628_V0643_VERSIONS.length, 'manifest should cover the coherent v0.6.28-v0.6.43 historical family scope')
  assert.deepEqual(HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643.map(family => family.version), EXPECTED_V0628_V0643_VERSIONS, 'manifest should preserve chronological v0.6.28-v0.6.43 coverage with no synthetic v0.6.40 doc')
  assertUnique(HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643.map(family => family.id), 'v0.6.28-v0.6.43 family ids')
  assertUnique(HISTORICAL_CHECKPOINT_DOCS_V0628_V0643, 'v0.6.28-v0.6.43 historical checkpoint docs')
  assertUnique(HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643, 'v0.6.28-v0.6.43 replacement candidate suites')
  assertUnique(HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643, 'v0.6.28-v0.6.43 cautious non-candidate suites')

  for (const suite of HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643) {
    assert.equal(HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643.includes(suite), false, `${suite} should not be both a replacement candidate and a cautious non-candidate`)
  }

  for (const family of HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643) {
    assert.ok(family.id.startsWith(family.version.replace(/\./g, '').replace('v', 'v')), `${family.id} should carry version identity`)
    assert.ok(family.checkpointLabel, `${family.id} should have a checkpoint label`)
    assert.ok(family.docs.includes(family.checkpointDoc), `${family.id} docs should include checkpointDoc`)
    assert.ok(Array.isArray(family.replacementCandidateSuites), `${family.id} should explicitly name replacement candidates, even when empty`)
    assert.ok(Array.isArray(family.nonCandidateSuites), `${family.id} should explicitly preserve cautious non-candidates, even when empty`)
    assert.ok(family.requiredThemes.length >= 3, `${family.id} should define compact required themes`)
    for (const doc of family.docs) {
      assert.ok(doc.startsWith(`docs/perf/${family.version}-`), `${doc} should stay under its historical version prefix`)
      assert.ok(doc.endsWith('.md'), `${doc} should be a markdown checkpoint/audit doc`)
    }
    for (const suite of family.replacementCandidateSuites) {
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
  assert.ok(HISTORICAL_SCOPE_MARKERS.some(marker => text.includes(marker)), `${doc} should retain historical/audit-only scope framing`)
  assert.equal(/\b(?:npm\s+publish|npm\s+version|git\s+tag|gh\s+release)\b/i.test(text) && !/(?:does not|no |STOP|Do not|not approve|not release|without|forbidden|not run)/i.test(text), false, `${doc} should not authorize release mechanics`)
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
  for (const doc of HISTORICAL_CHECKPOINT_DOCS_V0628_V0643) assertIncludes(gitignore, `!${doc}`, '.gitignore v0.6.28-v0.6.43 docs allow-list')
  assert.equal(gitignore.includes('!docs/perf/v0.6.41-true-operator-planrun-cancel-evidence.md'), false, 'ignored T129 local evidence doc must remain untracked/not allow-listed')
}

module.exports = {
  name: 'Go kernel v0.6.28-v0.6.43 historical checkpoint manifest audit',
  async run(env) {
    const root = env.helpers.extRoot

    assertManifestShape()
    assertPackageNoReleaseGuards(root)
    assertNoRawOrReleaseArtifacts(root)
    assertCurrentRoadmapFraming(root)
    assertGitignoreAllowList(root)

    const deletedReadySuites = new Set(HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES)
    for (const suitePath of HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643) {
      if (deletedReadySuites.has(suitePath)) {
        assert.equal(existsRel(root, suitePath), false, `${suitePath} should be absent after the audited ready-suite deletion slice`)
      } else {
        assert.equal(existsRel(root, suitePath), true, `${suitePath} should remain in place because it was not ready-to-delete`)
      }
    }
    for (const suitePath of HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643) {
      assert.equal(existsRel(root, suitePath), true, `${suitePath} should remain preserved as a cautious non-candidate`)
    }

    for (const family of HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643) {
      for (const doc of family.docs) assert.equal(existsRel(root, doc), true, `${family.id} doc should exist: ${doc}`)
      const docs = readDocs(root, family.docs)
      const combined = docs.map(item => item.text).join('\n\n')

      for (const { doc, text } of docs) assertHistoricalFraming(doc, text)
      for (const theme of family.requiredThemes) assertIncludes(combined, theme, `${family.id} compact theme`)
      assertNoOverclaims(combined, COMMON_NO_RELEASE_OVERCLAIMS, `${family.id} no-release/no-overclaim expectations`)
      assertContinuityLinks(root, family)
    }

    const packageJson = JSON.parse(readRel(root, 'package.json'))
    assert.equal(packageJson.version, '0.6.8', 'v0.6.28-v0.6.43 historical checkpoint audit must keep package version unchanged')
    assert.equal(path.basename(__filename), 'go-kernel-v0643-historical-checkpoints-audit.cjs', 'suite name should remain versioned historical/audit-only for tier auto-discovery')
  },
}
