const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  BASELINE_OBSERVATION,
  CURRENT_RELEASE_TARGET,
  ENV_METADATA_REQUIREMENTS,
  FIXTURE_PROFILE,
  FSSTORE_LOCK_WAIT_P95_SCHEMA_VERSION,
  FSSTORE_LOCK_WAIT_P95_THEME,
  NO_LEAK_MARKERS,
  NOT_COVERED_GATES,
  OBSERVED_GATES,
  OPTIMIZATION,
  RAW_ARTIFACT,
  STATUS,
  fsStoreLockWaitP95Evidence,
} = require('../fixtures/kernel/v0641/fsStoreLockWaitP95.cjs')
const {
  DEFAULT_HOLD_MS,
  DEFAULT_MEASURED,
  DEFAULT_PREFIX,
  DEFAULT_WARMUP,
  FORBIDDEN_OUTPUT_MARKERS,
  LOCK_WAIT_THRESHOLD_MS,
  isSafeTempHome,
  runHarness,
} = require('../../scripts/lib/v0641-fsstore-lock-wait-p95-harness.cjs')

const DOC = 'docs/perf/v0.6.41-fsstore-lock-wait-p95.md'
const FIXTURE = 'tests/fixtures/kernel/v0641/fsStoreLockWaitP95.cjs'
const SUITE = 'tests/suites/go-kernel-v0641-fsstore-lock-wait-p95.cjs'
const SCRIPT = 'scripts/verify-v0641-fsstore-lock-wait-p95.cjs'
const LIB = 'scripts/lib/v0641-fsstore-lock-wait-p95-harness.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_DOC = [
  '# v0.6.41 fsStore Lock-Wait p95 Evidence',
  'Result: v0.6.41 adds focused fsStore lock-wait p95 coverage through a clean temp `PI_AGENTTEAM_HOME` harness and applies a minimal retry-granularity optimization.',
  'Final result remains `ready:false`.',
  '`fsstore-lock-wait-p95`',
  '`fsStore.lockWaitMs.p95` observed `10.644ms`',
  'Baseline before the runtime fix: `fsstore-lock-wait-p95` observed `25.343ms > 25ms`.',
  '`state/fsStore.ts` reduces `LOCK_RETRY_MS` from `25` to `5`.',
  'No raw state archives, raw full mailbox/report bodies, worker transcripts, screenshots, secrets, raw hosted records, or raw timing JSON are checked in.',
  'Do not claim v0.7 release readiness from this artifact.',
  'data-change render debounce rate, spawn bookkeeping p95, manual RC/release governance',
  'STOP for release/tag/git push/npm version/npm publish/native/default-Go/package/signing/second-platform/fallback-deletion work.',
  '## Validation',
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'v0.7 release-ready approval is granted',
  'v0.7 release ready approval is granted',
  'v0.7 is release-ready',
  'v0.7 is release ready',
  'release can ship',
  'ready for release',
  'all p95 gates pass',
  'all p95 gates passed',
  'manual RC passed',
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
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]
const FORBIDDEN_ARTIFACT = /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig)$/i
const FORBIDDEN_RAW_EVIDENCE = /(?:^|\/)(?:.*fsstore-lock-wait.*\.json|.*v0641.*raw.*|.*state-archive.*|.*raw-state.*|.*mailbox.*body.*|.*report.*body.*|.*worker.*transcript.*|.*screenshot.*)$/i
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'

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
  assert.match(doc, /fsstore-lock-wait-p95`[^\n]+`pass`/i)
  assert.match(doc, /data-change-render-debounce-rate`[^\n]+`not-covered/i)
  assert.match(doc, /spawn-bookkeeping-p95`[^\n]+`not-covered/i)
  assert.equal(/"records"\s*:|"profileSummary"\s*:|"runId"\s*:/i.test(doc), false, `${DOC} must not embed raw timing JSON`)
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(fsStoreLockWaitP95Evidence)), fsStoreLockWaitP95Evidence, 'fixture should be plain deterministic data')
  assert.equal(fsStoreLockWaitP95Evidence.schemaVersion, FSSTORE_LOCK_WAIT_P95_SCHEMA_VERSION)
  assert.equal(fsStoreLockWaitP95Evidence.theme, FSSTORE_LOCK_WAIT_P95_THEME)
  assert.equal(fsStoreLockWaitP95Evidence.releaseTarget, CURRENT_RELEASE_TARGET)
  assert.equal(fsStoreLockWaitP95Evidence.status, STATUS)
  assert.equal(fsStoreLockWaitP95Evidence.ready, false)
  assert.equal(fsStoreLockWaitP95Evidence.releaseReadyClaim, false)
  assert.equal(fsStoreLockWaitP95Evidence.provesAllP95Gates, false)
  assert.equal(fsStoreLockWaitP95Evidence.manualRcPassed, false)
  assert.equal(fsStoreLockWaitP95Evidence.runtimeBehaviorChanged, true)
  assert.equal(fsStoreLockWaitP95Evidence.packageVersionChanged, false)
  assert.equal(fsStoreLockWaitP95Evidence.tagCreated, false)
  assert.equal(fsStoreLockWaitP95Evidence.npmPublished, false)
  assert.equal(fsStoreLockWaitP95Evidence.nativeWorkPerformed, false)
  assert.equal(fsStoreLockWaitP95Evidence.defaultGoApproved, false)
  assert.equal(fsStoreLockWaitP95Evidence.defaultResolverApproved, false)
  assert.equal(fsStoreLockWaitP95Evidence.fallbackDeletionApproved, false)
  assert.equal(fsStoreLockWaitP95Evidence.signingApproved, false)
  assert.equal(fsStoreLockWaitP95Evidence.secondPlatformApproved, false)
  assert.deepEqual(fsStoreLockWaitP95Evidence.rawArtifact, RAW_ARTIFACT)
  assert.deepEqual(fsStoreLockWaitP95Evidence.envMetadataRequirements, ENV_METADATA_REQUIREMENTS)
  assert.deepEqual(fsStoreLockWaitP95Evidence.noLeak.markers, NO_LEAK_MARKERS)
  assert.equal(fsStoreLockWaitP95Evidence.noLeak.rawStateArchivesCheckedIn, false)
  assert.equal(fsStoreLockWaitP95Evidence.noLeak.rawFullBodiesCheckedIn, false)
  assert.equal(fsStoreLockWaitP95Evidence.noLeak.rawTimingJsonCheckedIn, false)
  assert.deepEqual(fsStoreLockWaitP95Evidence.fixtureProfile, FIXTURE_PROFILE)
  assert.deepEqual(fsStoreLockWaitP95Evidence.baselineObservation, BASELINE_OBSERVATION)
  assert.deepEqual(fsStoreLockWaitP95Evidence.optimization, OPTIMIZATION)
  assert.deepEqual(fsStoreLockWaitP95Evidence.observedGates, OBSERVED_GATES)
  assert.deepEqual(fsStoreLockWaitP95Evidence.notCoveredGates, NOT_COVERED_GATES)
  assert.match(fsStoreLockWaitP95Evidence.recommendation, /Do not claim v0\.7 release readiness/i)
}

function assertFixtureCoverage() {
  assert.equal(RAW_ARTIFACT.parse, 'ok')
  assert.match(RAW_ARTIFACT.sha256, /^[a-f0-9]{64}$/)
  assert.equal(FIXTURE_PROFILE.thresholdMs, LOCK_WAIT_THRESHOLD_MS)
  assert.equal(FIXTURE_PROFILE.warmup, DEFAULT_WARMUP)
  assert.equal(FIXTURE_PROFILE.measured, DEFAULT_MEASURED)
  assert.equal(FIXTURE_PROFILE.lockHolderMs, DEFAULT_HOLD_MS)
  assert.equal(OBSERVED_GATES.length, 1)
  assert.equal(OBSERVED_GATES[0].id, 'fsstore-lock-wait-p95')
  assert.equal(OBSERVED_GATES[0].threshold.value, LOCK_WAIT_THRESHOLD_MS)
  assert.equal(OBSERVED_GATES[0].status, OBSERVED_GATES[0].observed <= LOCK_WAIT_THRESHOLD_MS ? 'pass' : 'fail')
  assert.equal(BASELINE_OBSERVATION.status, 'fail')
  assert.equal(BASELINE_OBSERVATION.observed > BASELINE_OBSERVATION.thresholdMs, true)
  assert.equal(OPTIMIZATION.changedPath, 'state/fsStore.ts')
  assert.equal(NOT_COVERED_GATES.map(gate => gate.id).includes('manual-rc-smoke'), true)
}

function assertScriptStatic(root) {
  for (const rel of [SCRIPT, LIB, SUITE]) assert.equal(exists(root, rel), true, `${rel} should exist`)
  const script = read(root, SCRIPT)
  const lib = read(root, LIB)
  const fsStore = read(root, 'state/fsStore.ts')
  assertIncludes(script, "require('./lib/v0641-fsstore-lock-wait-p95-harness.cjs')", SCRIPT)
  assertIncludes(script, '--warmup', SCRIPT)
  assertIncludes(script, '--measured', SCRIPT)
  assertIncludes(script, '--hold-ms', SCRIPT)
  assertIncludes(script, '--out', SCRIPT)
  assertIncludes(script, '--keep-home', SCRIPT)
  assertIncludes(lib, "const DEFAULT_PREFIX = '/tmp/pi-agentteam-v0641-fsstore-lock-wait-p95.'", LIB)
  assertIncludes(lib, 'process.env.PI_AGENTTEAM_HOME = resolvedHome', LIB)
  assertIncludes(lib, "process.env.PI_AGENTTEAM_PROFILE = '1'", LIB)
  assertIncludes(lib, 'measureContendedLock', LIB)
  assertIncludes(lib, 'withFileLock(targetPath', LIB)
  assertIncludes(lib, 'writeJsonFile(targetPath', LIB)
  assertIncludes(lib, 'readJsonFile(targetPath)', LIB)
  assertIncludes(fsStore, 'const LOCK_RETRY_MS = 5', 'state/fsStore.ts')
  assert.equal(/npm\s+version\b|npm\s+publish\b|git\s+tag\b|git\s+push\b|go\s+(?:build|install|mod)\b/.test(script + lib), false, 'harness must not contain release/native commands')
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
  const forbiddenRawEvidence = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && !rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/') && FORBIDDEN_RAW_EVIDENCE.test(rel)) forbiddenRawEvidence.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved checked-in native/archive/signing/release artifacts')
  assert.deepEqual(forbiddenRawEvidence.sort(), [], 'repo must not contain raw v0.6.41 timing/body/state evidence files')
}

function assertNoCheckedInLeakMarkers(root) {
  const leakFiles = []
  const allowed = new Set([FIXTURE, SUITE, SCRIPT, LIB, DOC])
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/')) continue
    const content = fs.readFileSync(file, 'utf8')
    for (const marker of ['V0641_FSSTORE_LOCK_WAIT_FULL_TEXT_SENTINEL_DO_NOT_LEAK']) {
      if (content.includes(marker) && !allowed.has(rel)) leakFiles.push(`${rel}:${marker}`)
    }
  }
  assert.deepEqual(leakFiles.sort(), [], 'unexpected checked-in v0.6.41 full-body sentinel outside guard artifacts')
  assert.equal(FORBIDDEN_OUTPUT_MARKERS.includes('V0641_FSSTORE_LOCK_WAIT_FULL_TEXT_SENTINEL_DO_NOT_LEAK'), true)
}

async function assertHarnessRun(root) {
  const originalHome = process.env.PI_AGENTTEAM_HOME
  const originalProfile = process.env.PI_AGENTTEAM_PROFILE
  const out = path.join('/tmp', `pi-agentteam-v0641-fsstore-lock-wait-p95-test-${process.pid}-${Date.now()}.json`)
  delete process.env.PI_AGENTTEAM_HOME
  let summary
  try {
    summary = await runHarness({ extRoot: root, out })
  } finally {
    if (originalHome === undefined) delete process.env.PI_AGENTTEAM_HOME
    else process.env.PI_AGENTTEAM_HOME = originalHome
    if (originalProfile === undefined) delete process.env.PI_AGENTTEAM_PROFILE
    else process.env.PI_AGENTTEAM_PROFILE = originalProfile
  }
  assert.equal(summary.ok, true, `harness should pass: ${JSON.stringify(summary.errors)}`)
  assert.equal(summary.status, 'passed')
  assert.equal(summary.cleanupResult, 'removed')
  assert.equal(summary.isolation.safePrefix, true)
  assert.equal(summary.isolation.underRepo, false)
  assert.equal(summary.isolation.initialEntryCount, 0)
  assert.equal(summary.isolation.liveHomeEnvRestored, true)
  assert.equal(summary.isolation.profileEnvRestored, true)
  assert.equal(process.env.PI_AGENTTEAM_HOME, originalHome)
  assert.equal(process.env.PI_AGENTTEAM_PROFILE, originalProfile)
  assert.equal(isSafeTempHome(summary.tempHome, DEFAULT_PREFIX), true)
  assert.equal(fs.existsSync(summary.tempHome), false, 'temp home should be removed')
  assert.equal(summary.gates.length, 1)
  const gate = summary.gates.find(item => item.id === 'fsstore-lock-wait-p95')
  assert.ok(gate, 'fsstore lock gate should be present')
  assert.equal(gate.status, gate.observed <= LOCK_WAIT_THRESHOLD_MS ? 'pass' : 'fail')
  assert.equal(gate.status, 'pass', `fsstore lock wait should pass focused gate: ${JSON.stringify(gate)}`)
  assert.equal(summary.p95Status, 'pass')
  assert.ok(summary.profileSummary.fsStore.lockCount >= DEFAULT_MEASURED, 'profile summary should include measured locks')
  assert.ok(summary.profileSummary.fsStore.readCount >= DEFAULT_MEASURED, 'profile summary should include reads')
  assert.ok(summary.profileSummary.fsStore.writeCount >= DEFAULT_MEASURED, 'profile summary should include writes')
  assert.ok(summary.profileSummary.fsStore.parseCount >= DEFAULT_MEASURED, 'profile summary should include parses')
  assert.ok(summary.profileSummary.fsStore.byCallSite.length >= 1, 'profile summary should include call-site breakdown')
  const checks = new Map(summary.checks.map(check => [check.id, check]))
  for (const id of ['fsstore-lock-events-recorded', 'fsstore-read-write-parse-covered', 'fsstore-lock-wait-p95-threshold', 'clean-temp-home', 'no-release-actions']) {
    assert.equal(checks.get(id)?.pass, true, `harness check should pass: ${id}`)
  }
  assert.equal(summary.rawArtifact.path, out)
  assert.equal(summary.rawArtifact.parse, 'ok')
  assert.match(summary.rawArtifact.sha256, /^[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(summary).includes('V0641_FSSTORE_LOCK_WAIT_FULL_TEXT_SENTINEL_DO_NOT_LEAK'), false, 'summary must not leak sentinel')
  const raw = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.equal(raw.records.length, DEFAULT_MEASURED, 'raw timing artifact should preserve measured timing records')
  assert.equal(JSON.stringify(raw).includes('V0641_FSSTORE_LOCK_WAIT_FULL_TEXT_SENTINEL_DO_NOT_LEAK'), false, 'raw timing artifact must not leak sentinel')
  assert.equal(raw.gates[0].status, 'pass')
  fs.rmSync(out, { force: true })
}

module.exports = {
  name: 'Go kernel v0.6.41 fsStore lock-wait p95 evidence',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertFixtureShape(root)
    assertFixtureCoverage()
    assertScriptStatic(root)
    assertPackageRuntimeInvariants(root)
    assertArtifactInvariants(root)
    assertNoCheckedInLeakMarkers(root)
    await assertHarnessRun(root)
  },
}
