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
  HISTORICAL_CHECKPOINT_FAMILIES,
  HISTORICAL_CHECKPOINT_DOCS,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES,
} = require('../fixtures/kernel/historicalCheckpoints.cjs')

const HISTORICAL_SCOPE_MARKERS = [
  'Scope:',
  'docs/tests',
  'docs/reference',
  'GitHub-only',
  'checkpoint',
  'evidence only',
  'STOP for',
  'does not',
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

function assertManifestShape() {
  assert.ok(HISTORICAL_CHECKPOINT_FAMILIES.length >= 9, 'manifest should cover v0.4.19 through v0.4.27 families')
  assertUnique(HISTORICAL_CHECKPOINT_FAMILIES.map(family => family.id), 'family ids')
  assertUnique(HISTORICAL_CHECKPOINT_DOCS, 'historical checkpoint docs')
  assertUnique(HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES, 'replacement candidate suites')

  const versions = HISTORICAL_CHECKPOINT_FAMILIES.map(family => family.version)
  assert.deepEqual(versions, [
    'v0.4.19',
    'v0.4.20',
    'v0.4.21',
    'v0.4.22',
    'v0.4.23',
    'v0.4.24',
    'v0.4.25',
    'v0.4.26',
    'v0.4.27',
  ], 'manifest should preserve append-only chronological coverage')

  for (const family of HISTORICAL_CHECKPOINT_FAMILIES) {
    assert.ok(family.id.startsWith(family.version.replace(/\./g, '').replace('v', 'v')), `${family.id} should carry version identity`)
    assert.ok(family.checkpointLabel, `${family.id} should have a checkpoint label`)
    assert.ok(family.docs.includes(family.checkpointDoc), `${family.id} docs should include checkpointDoc`)
    assert.ok(family.requiredThemes.length >= 3, `${family.id} should define compact required themes`)
    assert.ok(family.replacementCandidateSuites.length >= 1, `${family.id} should name legacy candidate suites for later replacement review`)
    for (const doc of family.docs) {
      assert.ok(doc.startsWith(`docs/perf/${family.version}-`), `${doc} should stay under its historical version prefix`)
      assert.ok(doc.endsWith('.md'), `${doc} should be a markdown checkpoint/audit doc`)
    }
    for (const suite of family.replacementCandidateSuites) {
      assert.ok(suite.startsWith(`tests/suites/go-kernel-${family.version.replace('v0.', 'v0').replace(/\./g, '')}`), `${suite} should carry the historical suite version prefix`)
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
  assert.equal(/\b(?:npm\s+publish|npm\s+version|git\s+tag|gh\s+release)\b/i.test(text) && !/(?:does not|no |STOP|Do not|not approve|not release|without)/i.test(text), false, `${doc} should not authorize release mechanics`)
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
  for (const doc of HISTORICAL_CHECKPOINT_DOCS) assertIncludes(gitignore, `!${doc}`, '.gitignore historical docs allow-list')
}

module.exports = {
  name: 'Go kernel v0.4.19-v0.4.27 historical checkpoint manifest audit',
  async run(env) {
    const root = env.helpers.extRoot

    assertManifestShape()
    assertPackageNoReleaseGuards(root)
    assertNoRawOrReleaseArtifacts(root)
    assertCurrentRoadmapFraming(root)
    assertGitignoreAllowList(root)

    for (const suitePath of HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES) {
      assert.equal(existsRel(root, suitePath), true, `${suitePath} should remain in place until a later deletion slice`)
    }

    for (const family of HISTORICAL_CHECKPOINT_FAMILIES) {
      for (const doc of family.docs) assert.equal(existsRel(root, doc), true, `${family.id} doc should exist: ${doc}`)
      const docs = readDocs(root, family.docs)
      const combined = docs.map(item => item.text).join('\n\n')

      for (const { doc, text } of docs) assertHistoricalFraming(doc, text)
      for (const theme of family.requiredThemes) assertIncludes(combined, theme, `${family.id} compact theme`)
      assertNoOverclaims(combined, COMMON_NO_RELEASE_OVERCLAIMS, `${family.id} no-release/no-overclaim expectations`)
      assertContinuityLinks(root, family)
    }

    const packageJson = JSON.parse(readRel(root, 'package.json'))
    assert.equal(packageJson.version, '0.6.8', 'historical checkpoint audit must keep package version unchanged')
    assert.equal(path.basename(__filename), 'go-kernel-v0427-historical-checkpoints-audit.cjs', 'suite name should remain versioned historical/audit-only for tier auto-discovery')
  },
}
