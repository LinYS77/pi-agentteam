const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  COVERED_GATES,
  ENV_METADATA,
  NO_LEAK_MARKERS,
  NOT_COVERED_GATES,
  P95_EVIDENCE_SCHEMA_VERSION,
  P95_EVIDENCE_STATUS,
  P95_EVIDENCE_THEME,
  RAW_ARTIFACTS,
  SUPPORTING_STATE_READ_MODEL,
  V05_RELEASE_TARGET,
  p95Evidence,
} = require('../fixtures/kernel/v0638/p95Evidence.cjs')

const DOC = 'docs/perf/v0.6.38-p95-evidence.md'
const FIXTURE = 'tests/fixtures/kernel/v0638/p95Evidence.cjs'
const SUITE = 'tests/suites/go-kernel-v0638-p95-evidence.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_DOC = [
  '# v0.6.38 p95 Evidence',
  'Result: v0.6.38 collected p95 evidence from the existing deterministic state/read-model and team-panel/tmux benches.',
  'Final result remains `ready:false`.',
  'Existing benches cover five Slice 3 gates as passing numeric/policy evidence.',
  'Existing benches cover `unchanged-state-no-repeated-request-render` as failing current semantic evidence because requestRender activity is still present during cache-hit/no-diff measured refreshes.',
  'Five Slice 3 gates remain `not-covered-by-existing-bench` and need future focused harnesses or manual evidence.',
  'PI_AGENTTEAM_PROFILE=1 AGENTTEAM_BENCH_FIXTURE=baseline node tests/bench/team-read-model-baseline.cjs > /tmp/pi-agentteam-v0638-p95/team-read-model-baseline.json',
  'PI_AGENTTEAM_PROFILE=1 AGENTTEAM_BENCH_FIXTURE=baseline node tests/bench/team-panel-tmux-refresh-v0415.cjs > /tmp/pi-agentteam-v0638-p95/team-panel-tmux-refresh-baseline.json',
  '`/tmp/pi-agentteam-v0638-p95/team-read-model-baseline.json`',
  '`/tmp/pi-agentteam-v0638-p95/team-panel-tmux-refresh-baseline.json`',
  '`ae8a7fe090f8467a14e18767cb297b8a4a8b571078fe12a27713595fd3f9ac5f`',
  '`1eb60acdbe7af022de9ea810ce19e402b801dd82828bf0a096c974e1775ab69a`',
  '`882294237465b9f93d47bce85dc3d61832251d2a041625eda865d40c33b7eb12`',
  '## No-Leak Check',
  'All searches were absent',
  '## Covered Gate Table',
  '`attached-team-warm-refresh-data-load-p95`',
  '`attached-team-warm-refresh-render-p95`',
  '`attached-team-warm-refresh-tmux-command-count`',
  '`global-team-warm-refresh-data-load-p95`',
  '`global-team-warm-refresh-snapshot-policy`',
  '`unchanged-state-no-repeated-request-render`',
  '| `unchanged-state-no-repeated-request-render` | `fail` |',
  '## Not-Covered Gates',
  '`task-message-report-action-normal-p95`',
  '`task-message-report-action-large-mailbox-p95`',
  '`fsstore-lock-wait-p95`',
  '`data-change-render-debounce-rate`',
  '`spawn-bookkeeping-p95`',
  'Do not claim v0.5 release readiness from this artifact.',
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'v0.5 release-ready approval is granted',
  'v0.5 release ready approval is granted',
  'v0.5 is release-ready',
  'v0.5 is release ready',
  'release can ship',
  'ready for release',
  'all p95 gates pass',
  'all p95 gates passed',
  'p95 gates passed',
  'manual RC passed',
  'npm test is green',
  'tag was created',
  'tag was pushed',
  'git push completed',
  'npm version completed',
  'npm publish completed',
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'native helper delivery is complete',
  'native package delivery is complete',
  'package release is approved',
  'signing is approved',
  'second-platform support is approved',
  'second platform support is approved',
  'fallback deletion is approved',
]
const EXPECTED_COVERED = new Map([
  ['attached-team-warm-refresh-data-load-p95', { status: 'pass', observed: 7, threshold: 100 }],
  ['attached-team-warm-refresh-render-p95', { status: 'pass', observed: 2, threshold: 16 }],
  ['attached-team-warm-refresh-tmux-command-count', { status: 'pass', observed: 0, threshold: 1 }],
  ['global-team-warm-refresh-data-load-p95', { status: 'pass', observed: 17, threshold: 200 }],
  ['global-team-warm-refresh-snapshot-policy', { status: 'pass' }],
  ['unchanged-state-no-repeated-request-render', { status: 'fail' }],
])
const EXPECTED_NOT_COVERED = [
  'task-message-report-action-normal-p95',
  'task-message-report-action-large-mailbox-p95',
  'fsstore-lock-wait-p95',
  'data-change-render-debounce-rate',
  'spawn-bookkeeping-p95',
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

function assertNoOverclaims(source, label) {
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(source.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  assertNoOverclaims(doc, DOC)
  assert.match(doc, /raw benchmark JSON is preserved under `\/tmp\/pi-agentteam-v0638-p95\/` and is not checked in/i)
  assert.match(doc, /STOP for release\/tag\/git push\/npm version\/npm publish\/native\/default-Go\/package\/signing\/second-platform\/fallback-deletion work/i)
  assert.match(doc, /No raw full mailbox\/report bodies, worker transcripts, screenshots, state archives, secrets, or terminal logs are checked in/i)
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(p95Evidence)), p95Evidence, 'p95 evidence fixture should be plain deterministic data')
  assert.equal(p95Evidence.schemaVersion, P95_EVIDENCE_SCHEMA_VERSION)
  assert.equal(p95Evidence.theme, P95_EVIDENCE_THEME)
  assert.equal(p95Evidence.releaseTarget, V05_RELEASE_TARGET)
  assert.equal(p95Evidence.status, P95_EVIDENCE_STATUS)
  assert.equal(p95Evidence.ready, false)
  assert.equal(p95Evidence.releaseReadyClaim, false)
  assert.equal(p95Evidence.provesAllP95Gates, false)
  assert.equal(p95Evidence.runtimeBehaviorChanged, false)
  assert.equal(p95Evidence.packageVersionChanged, false)
  assert.equal(p95Evidence.tagCreated, false)
  assert.equal(p95Evidence.npmPublished, false)
  assert.equal(p95Evidence.nativeWorkPerformed, false)
  assert.equal(p95Evidence.defaultGoApproved, false)
  assert.equal(p95Evidence.defaultResolverApproved, false)
  assert.equal(p95Evidence.fallbackDeletionApproved, false)
  assert.equal(p95Evidence.signingApproved, false)
  assert.equal(p95Evidence.secondPlatformApproved, false)
  assert.deepEqual(p95Evidence.rawArtifacts, RAW_ARTIFACTS)
  assert.deepEqual(p95Evidence.envMetadata, ENV_METADATA)
  assert.deepEqual(p95Evidence.noLeak.markers, NO_LEAK_MARKERS)
  assert.equal(p95Evidence.noLeak.status, 'pass')
  assert.equal(p95Evidence.noLeak.rawFullBodiesCheckedIn, false)
  assert.deepEqual(p95Evidence.coveredGates, COVERED_GATES)
  assert.deepEqual(p95Evidence.supportingStateReadModel, SUPPORTING_STATE_READ_MODEL)
  assert.deepEqual(p95Evidence.notCoveredGates, NOT_COVERED_GATES)
}

function assertArtifactsAndEnv() {
  assert.deepEqual(RAW_ARTIFACTS.map(artifact => artifact.id), ['env-metadata', 'team-read-model-baseline', 'team-panel-tmux-refresh-baseline'])
  for (const artifact of RAW_ARTIFACTS) {
    assert.match(artifact.path, /^\/tmp\/pi-agentteam-v0638-p95\//, `${artifact.id} should remain a /tmp artifact`)
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/, `${artifact.id} should record a SHA-256 hash`)
    assert.equal(artifact.parse, 'ok')
  }
  assert.equal(ENV_METADATA.git, 'dc13417')
  assert.equal(ENV_METADATA.node, 'v24.9.0')
  assert.equal(ENV_METADATA.npm, '11.7.0')
  assert.equal(ENV_METADATA.piAgentteamProfile, '1')
  assert.equal(ENV_METADATA.agentteamBenchFixture, 'baseline')
  assert.equal(ENV_METADATA.warmupIterations, 1)
  assert.equal(ENV_METADATA.measuredIterations, 5)
  assert.equal(ENV_METADATA.cpu.model, 'AMD EPYC 7402 24-Core Processor')
  assert.equal(ENV_METADATA.cpu.logicalCpus, 96)
}

function assertGateInterpretation() {
  assert.deepEqual(COVERED_GATES.map(gate => gate.id), [...EXPECTED_COVERED.keys()])
  for (const gate of COVERED_GATES) {
    const expected = EXPECTED_COVERED.get(gate.id)
    assert.equal(gate.status, expected.status, `${gate.id} status`)
    assert.match(gate.source, /^\/tmp\/pi-agentteam-v0638-p95\//, `${gate.id} source`)
    if (typeof expected.observed === 'number') {
      assert.equal(gate.observed, expected.observed, `${gate.id} observed`)
      assert.equal(gate.threshold.value, expected.threshold, `${gate.id} threshold`)
      assert.equal(gate.observed <= gate.threshold.value, true, `${gate.id} should satisfy numeric threshold`)
    }
  }
  const globalPolicy = COVERED_GATES.find(gate => gate.id === 'global-team-warm-refresh-snapshot-policy')
  assert.deepEqual(globalPolicy.observed.commandNames, ['list-panes'])
  assert.equal(globalPolicy.observed.commandCount, globalPolicy.observed.measuredIterations)
  const unchanged = COVERED_GATES.find(gate => gate.id === 'unchanged-state-no-repeated-request-render')
  assert.equal(unchanged.status, 'fail')
  assert.equal(unchanged.observed.attached.diffChangedCount, 0)
  assert.equal(unchanged.observed.global.diffChangedCount, 0)
  assert.ok(unchanged.observed.attached.requestRenderCount > 1, 'attached requestRender activity should explain fail status')
  assert.ok(unchanged.observed.global.requestRenderCount > 1, 'global requestRender activity should explain fail status')
  assert.equal(SUPPORTING_STATE_READ_MODEL.fsStoreLockCount, 0, 'state/read-model bench must not prove fsstore lock wait')
}

function assertNotCovered() {
  assert.deepEqual(NOT_COVERED_GATES.map(gate => gate.id), EXPECTED_NOT_COVERED)
  for (const gate of NOT_COVERED_GATES) {
    assert.equal(gate.status, 'not-covered-by-existing-bench')
    assert.ok(gate.reason.length > 40, `${gate.id} should explain why it is not covered`)
  }
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
}

function assertArtifactInvariants(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain pi-agentteam temp tarballs')
  const forbiddenArtifacts = []
  const forbiddenRecords = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !ALLOWED_REVIEW_RECORDS.has(rel) && FORBIDDEN_GENERATED_RECORD.test(rel)) forbiddenRecords.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain checked-in native/archive/signing/release artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain generated manifests/checksums/provenance/attestation/raw hosted/release records outside docs/tests/review helper areas')
}

module.exports = {
  name: 'Go kernel v0.6.38 p95 evidence',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertFixtureShape(root)
    assertArtifactsAndEnv()
    assertGateInterpretation()
    assertNotCovered()
    assertPackageRuntimeInvariants(root)
    assertArtifactInvariants(root)
  },
}
