const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  BLOCKED,
  GREEN,
  P0,
  P0_READINESS_LEDGER_ROW_IDS,
  P0_READINESS_LEDGER_SCHEMA_VERSION,
  P0_READINESS_LEDGER_SLICE,
  P0_READINESS_LEDGER_THEME,
  P0_READINESS_SEVERITIES,
  P0_READINESS_STATUSES,
  STOP_GATES,
  UNKNOWN,
  V05_RELEASE_TARGET,
  WATCH,
  p0ReadinessLedger,
  p0ReadinessRows,
} = require('../fixtures/kernel/v0637/p0ReadinessLedger.cjs')

const DOC = 'docs/perf/v0.6.37-v0.5-release-readiness-burndown.md'
const FIXTURE = 'tests/fixtures/kernel/v0637/p0ReadinessLedger.cjs'
const SUITE = 'tests/suites/go-kernel-v0637-v05-p0-readiness-ledger.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_ROW_FIELDS = [
  'id',
  'severity',
  'status',
  'affectedSeam',
  'existingEvidence',
  'releaseImpact',
  'requiredProof',
  'releaseReadyClaim',
]
const REQUIRED_DOC = [
  '# v0.6.37 v0.5 Release Readiness Burn-down',
  'Target: `v0.5.0 = core refactor + performance baseline + bug burn-down release`.',
  'v0.6.37 is a release readiness burn-down checkpoint for v0.5 P0 risk inventory. It is not a default-Go governance continuation and it does not extend v0.6.36 default-Go dry-run work.',
  '`tests/fixtures/kernel/v0637/p0ReadinessLedger.cjs`',
  '`tests/suites/go-kernel-v0637-v05-p0-readiness-ledger.cjs`',
  '## Slice 1 — P0 bug inventory & severity ledger',
  '## Scope',
  '## Non-goals / STOP gates',
  '## Ledger',
  '| ID | Severity | Status | Affected seam | Existing evidence/tests/docs | Release impact | Required proof / next action |',
  '## Required release proof before v0.5 decision',
  '## Validation runner caveat',
  'Do not use `tests/run.cjs <suite>` as focused proof for v0.6.37 guards because `tests/run.cjs` can ignore the suite-name argument and run unrelated suites.',
  '## Package / runtime invariants',
  '`package.json` version remains `0.6.8`.',
  '`package.json#pi.extensions` remains exactly `["./index.ts"]` in package metadata terms; this slice does not edit it.',
  'TypeScript/pi remains the product and control-plane facade.',
  '## Final recommendation after Slice 8',
  'Proceed with leader review of the Slice 1 P0 ledger, Slice 2 baseline inventory, Slice 3 p95 gate definitions, Slice 4 hot-path candidate matrix, Slice 5 manual RC smoke checklist, Slice 6 validation strategy, Slice 7 task/report/PlanRun reliability map, and Slice 8 final checkpoint only.',
]
const REQUIRED_SEAM_TERMS = [
  'identity-name-safety',
  'config-bootstrap',
  'state-read-model',
  'tmux-snapshot-adapter',
  'team-panel-refresh-render',
  'worker-report-prompt-contract',
  'task-report-watchdog-lifecycle',
  'planrun',
  'public-output-full-text-boundaries',
  'performance-baseline-p95-gates',
  'manual-rc-smoke',
  'validation-runner-caveat',
  'release-tag-default-go-native-governance',
]
const STOP_DOC_LINES = [
  'No tag creation, tag movement, tag push, git push, release creation, or implied tag/release without an explicit leader decision.',
  'No `npm version`, `npm publish`, package release, install-source approval, or release asset work.',
  'No native package, native helper delivery, signing, cosign, SLSA, security attestation, or second-platform work.',
  'No default Go, default resolver, `go-cutover` defaulting, `go-packaged-preview` defaulting, TypeScript fallback deletion, or `compactReadModelFingerprint` cutover.',
  'No production TypeScript, Go, command, tool, workflow, readiness, package metadata, package file, or runtime behavior change.',
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'native helper delivery is complete',
  'native package delivery is complete',
  'package-manager native delivery is complete',
  'package release is approved',
  'install source is approved',
  'release asset is approved',
  'signing is approved',
  'cosign is approved',
  'SLSA is approved',
  'security attestation is approved',
  'second-platform support is approved',
  'second platform support is approved',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'tag was created',
  'tag was pushed',
  'npm version completed',
  'npm publish completed',
]
const FORBIDDEN_ROW_READY_PATTERNS = [
  /releaseReadyClaim\s*:\s*true/i,
  /ready\s*:\s*true/i,
  /ready for release/i,
  /release can ship/i,
  /ship v0\.5/i,
]
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]
const FORBIDDEN_ARTIFACT = /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig)$/i
const FORBIDDEN_GENERATED_RECORD = /(?:^|\/)(?:artifact-index|generated-manifest|checksum|checksums|sha256sums|provenance|attestation|hosted-observation|raw-record|raw-hosted|release-bundle|release-asset|signature-material)(?:[-_.\/]|$)/i
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'
const ALLOWED_REVIEW_RECORDS = new Set([
  '.github/workflows/go-helper-review-artifact.yml',
  'scripts/build-go-helper-artifact.cjs',
  'scripts/lib/go-helper-artifact-builder.cjs',
  'scripts/lib/go-helper-artifact-verifier.cjs',
  'scripts/lib/go-helper-clean-install-proof.cjs',
  'scripts/lib/go-helper-hosted-observation-record.cjs',
  'scripts/lib/pi-extension-install-load-proof.cjs',
  'scripts/verify-go-helper-artifact.cjs',
  'scripts/verify-go-helper-clean-install-proof.cjs',
  'scripts/verify-go-helper-hosted-observation-record.cjs',
  'scripts/verify-pi-extension-install-load.cjs',
])

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
}

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'data') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertLedgerShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(p0ReadinessLedger)), p0ReadinessLedger, 'ledger should be plain deterministic data')
  assert.deepEqual(Object.keys(p0ReadinessLedger).sort(), [
    'defaultGoGovernanceContinuation',
    'nativeWorkPerformed',
    'npmPublished',
    'packageVersionChanged',
    'ready',
    'releaseTarget',
    'rows',
    'runtimeBehaviorChanged',
    'schemaVersion',
    'slice',
    'stopGates',
    'tagCreated',
    'theme',
  ].sort(), 'ledger should expose only expected aggregate fields')
  assert.equal(p0ReadinessLedger.schemaVersion, P0_READINESS_LEDGER_SCHEMA_VERSION)
  assert.equal(p0ReadinessLedger.theme, P0_READINESS_LEDGER_THEME)
  assert.equal(p0ReadinessLedger.releaseTarget, V05_RELEASE_TARGET)
  assert.equal(p0ReadinessLedger.slice, P0_READINESS_LEDGER_SLICE)
  assert.equal(p0ReadinessLedger.ready, false, 'Slice 1 ledger must not claim release ready')
  assert.equal(p0ReadinessLedger.defaultGoGovernanceContinuation, false, 'v0.6.37 must not continue default-Go governance')
  assert.equal(p0ReadinessLedger.runtimeBehaviorChanged, false, 'Slice 1 must not change runtime behavior')
  assert.equal(p0ReadinessLedger.packageVersionChanged, false, 'Slice 1 must not change package version')
  assert.equal(p0ReadinessLedger.tagCreated, false, 'Slice 1 must not create tags')
  assert.equal(p0ReadinessLedger.npmPublished, false, 'Slice 1 must not publish npm')
  assert.equal(p0ReadinessLedger.nativeWorkPerformed, false, 'Slice 1 must not perform native work')
  assert.deepEqual(p0ReadinessLedger.stopGates, STOP_GATES, 'ledger stop gates should be deterministic')
  assert.deepEqual(p0ReadinessLedger.rows, p0ReadinessRows, 'ledger rows should reference exported rows')
}

function assertRows(root) {
  assert.equal(Array.isArray(p0ReadinessRows), true, 'rows must be an array')
  assert.deepEqual(p0ReadinessRows.map(row => row.id), P0_READINESS_LEDGER_ROW_IDS, 'row IDs should be deterministic and ordered')
  assert.deepEqual(new Set(p0ReadinessRows.map(row => row.id)).size, P0_READINESS_LEDGER_ROW_IDS.length, 'row IDs should be unique')
  assert.ok(p0ReadinessRows.some(row => row.status === GREEN), 'ledger should have at least one green row')
  assert.ok(p0ReadinessRows.some(row => row.status === WATCH), 'ledger should have at least one watch row')
  assert.ok(p0ReadinessRows.some(row => row.status === BLOCKED), 'ledger should have at least one blocked row')
  assert.ok(p0ReadinessRows.some(row => row.status === UNKNOWN), 'ledger should have at least one unknown row')

  for (const row of p0ReadinessRows) {
    assert.deepEqual(Object.keys(row).sort(), REQUIRED_ROW_FIELDS.sort(), `${row.id} should expose required row fields only`)
    assert.equal(typeof row.id, 'string', `${row.id} id should be string`)
    assert.ok(P0_READINESS_SEVERITIES.includes(row.severity), `${row.id} severity should be valid`)
    assert.equal(row.severity, P0, `${row.id} severity should remain P0`)
    assert.ok(P0_READINESS_STATUSES.includes(row.status), `${row.id} status should be valid`)
    assert.equal(typeof row.affectedSeam, 'string', `${row.id} affectedSeam should be string`)
    assert.equal(Array.isArray(row.existingEvidence), true, `${row.id} existingEvidence should be array`)
    assert.equal(typeof row.releaseImpact, 'string', `${row.id} releaseImpact should be string`)
    assert.equal(typeof row.requiredProof, 'string', `${row.id} requiredProof should be string`)
    assert.equal(row.releaseReadyClaim, false, `${row.id} must not claim release-ready`)
    assert.ok(row.affectedSeam.length > 30, `${row.id} affectedSeam should be meaningful`)
    assert.ok(row.existingEvidence.length >= 2, `${row.id} existingEvidence should cite docs/tests`)
    assert.ok(row.releaseImpact.length > 30, `${row.id} releaseImpact should be meaningful`)
    assert.ok(row.requiredProof.length > 30, `${row.id} requiredProof should be meaningful`)
    for (const evidence of row.existingEvidence) {
      assert.equal(typeof evidence, 'string', `${row.id} evidence should be string`)
      assert.ok(evidence.length > 10, `${row.id} evidence should not be empty`)
      if (evidence.includes('/') || evidence.endsWith('.json')) {
        const rel = evidence.replace(/`/g, '')
        if (!rel.startsWith('No current')) assert.equal(exists(root, rel), true, `${row.id} evidence should exist: ${rel}`)
      }
    }
    const rowText = [row.id, row.affectedSeam, ...row.existingEvidence, row.releaseImpact, row.requiredProof].join('\n')
    for (const pattern of FORBIDDEN_ROW_READY_PATTERNS) assert.equal(pattern.test(rowText), false, `${row.id} must not claim release-ready: ${pattern}`)
    if (row.status === GREEN) {
      assert.ok(row.existingEvidence.some(evidence => /^docs\//.test(evidence)), `${row.id} green row should cite docs evidence`)
      assert.ok(row.existingEvidence.some(evidence => /^tests\//.test(evidence)), `${row.id} green row should cite tests evidence`)
      assert.match(row.requiredProof, /Keep|include|spot-check|RC|passing|runnable/i, `${row.id} green row should still require proof`)
    }
    if ([WATCH, BLOCKED, UNKNOWN].includes(row.status)) {
      assert.equal(row.releaseReadyClaim, false, `${row.id} non-green row must not claim release-ready`)
    }
  }
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_SEAM_TERMS) assertIncludes(doc, `\`${expected}\``, DOC)
  for (const expected of STOP_DOC_LINES) assertIncludes(doc, expected, DOC)
  const normalizedDoc = doc.replace(/`/g, '').toLowerCase()
  for (const stopGate of STOP_GATES) {
    assert.ok(normalizedDoc.includes(stopGate.toLowerCase()), `${DOC} should include stop gate: ${stopGate}`)
  }
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not embed raw hosted/artifact/verifier JSON bodies`)
  assert.equal(/\btag created\b|\btag pushed\b|\bnpm publish completed\b|\bnpm version completed\b/i.test(doc), false, `${DOC} must not imply release/package actions happened`)
}

function assertPackageRuntimeInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.type, 'module')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
  for (const field of ['main', 'exports', 'types']) assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  assert.deepEqual(Object.keys(packageJson.dependencies || {}).sort(), [], 'dependencies must remain empty or absent')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish', 'prepack', 'postpack']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define lifecycle script ${lifecycle}`)
  }
  for (const [scriptName, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+version\b/i.test(command), false, `${scriptName} must not run npm version`)
    assert.equal(/npm\s+publish\b/i.test(command), false, `${scriptName} must not run npm publish`)
    if (/npm\s+pack\b/i.test(command)) {
      assert.match(command, /--dry-run\b/, `${scriptName} may only run npm pack as dry-run`)
      assert.match(command, /--ignore-scripts\b/, `${scriptName} npm pack dry-run must ignore scripts`)
    }
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild\b/i.test(command), false, `${scriptName} must not build/download native helper`)
  }
}

function assertFixtureNotUsedByProduction(root) {
  const productionRoots = ['api', 'app', 'commands', 'core', 'hooks', 'runtime', 'state', 'teamPanel', 'tmux', 'tools', 'adapters']
  const productionRootFiles = ['index.ts', 'agents.ts', 'policy.ts', 'renderers.ts', 'session.ts', 'teamPanel.ts']
  const productionFiles = []
  for (const rel of productionRootFiles) if (exists(root, rel)) productionFiles.push(path.join(root, rel))
  for (const rel of productionRoots) {
    const full = path.join(root, rel)
    if (fs.existsSync(full)) walkFiles(full, productionFiles)
  }
  for (const file of productionFiles.filter(file => /\.(?:ts|js|cjs|mjs)$/.test(file))) {
    const source = fs.readFileSync(file, 'utf8')
    assert.equal(source.includes('p0ReadinessLedger'), false, `${toRel(root, file)} must not import/read Slice 1 readiness ledger`)
    assert.equal(source.includes('p0ReadinessRows'), false, `${toRel(root, file)} must not import/read Slice 1 readiness rows`)
    assert.equal(source.includes('tests/fixtures/kernel/v0637'), false, `${toRel(root, file)} must not import/read Slice 1 fixture path`)
  }
}

function assertArtifactInvariants(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain pi-agentteam temp tarballs')
  const forbiddenArtifacts = []
  const forbiddenRecords = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && !rel.startsWith('docs/') && !rel.startsWith('tests/') && !ALLOWED_REVIEW_RECORDS.has(rel) && FORBIDDEN_GENERATED_RECORD.test(rel)) forbiddenRecords.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved checked-in native/archive/signing/release artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain unapproved generated manifests/checksums/provenance/attestation/raw hosted/release records outside docs/tests/review helper areas')
}

function assertGitignore(root) {
  const gitignore = read(root, '.gitignore')
  assertIncludes(gitignore, `!${DOC}`, '.gitignore')
}

module.exports = {
  name: 'Go kernel v0.6.37 v0.5 P0 readiness ledger',
  async run(env) {
    const root = env.helpers.extRoot
    assertLedgerShape(root)
    assertRows(root)
    assertDoc(root)
    assertPackageRuntimeInvariants(root)
    assertFixtureNotUsedByProduction(root)
    assertArtifactInvariants(root)
    assertGitignore(root)
    assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  },
}
