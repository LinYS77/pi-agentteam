const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  BEHAVIOR_CHECKS,
  CURRENT_RELEASE_TARGET,
  ENV_METADATA_REQUIREMENTS,
  FIXTURE_PROFILE,
  INSTRUMENTATION,
  NO_LEAK_MARKERS,
  NOT_COVERED_GATES,
  OBSERVED_GATES,
  RAW_ARTIFACT,
  REQUIRED_SEGMENTS,
  SPAWN_BOOKKEEPING_P95_SCHEMA_VERSION,
  SPAWN_BOOKKEEPING_P95_THEME,
  STATUS,
  spawnBookkeepingP95Evidence,
} = require('../fixtures/kernel/v0642/spawnBookkeepingP95.cjs')
const {
  DEFAULT_MEASURED,
  DEFAULT_PREFIX,
  DEFAULT_WARMUP,
  FORBIDDEN_OUTPUT_MARKERS,
  FULL_TEXT_SENTINEL,
  REQUIRED_SEGMENTS: HARNESS_REQUIRED_SEGMENTS,
  SPAWN_BOOKKEEPING_THRESHOLD_MS,
  isSafeTempHome,
  runHarness,
} = require('../../scripts/lib/v0642-spawn-bookkeeping-p95-harness.cjs')

const DOC = 'docs/perf/v0.6.42-spawn-bookkeeping-p95.md'
const FIXTURE = 'tests/fixtures/kernel/v0642/spawnBookkeepingP95.cjs'
const SUITE = 'tests/suites/go-kernel-v0642-spawn-bookkeeping-p95.cjs'
const SCRIPT = 'scripts/verify-v0642-spawn-bookkeeping-p95.cjs'
const LIB = 'scripts/lib/v0642-spawn-bookkeeping-p95-harness.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_DOC = [
  '# v0.6.42 Spawn Bookkeeping p95 Evidence',
  'Result: v0.6.42 adds focused worker spawn bookkeeping p95 coverage through clean-temp file-backed state and app-owned profiling segments.',
  'Final result remains `ready:false`.',
  '`spawn-bookkeeping-p95`',
  '`workerSpawn.bookkeepingMs.p95` observed `21.995ms`',
  '`visible-pane-semantics`',
  '`launch-provenance-inheritance`',
  '`initial-delivery-bookkeeping` is instrumented but not required by this idle-spawn fixture',
  '`core/profiling.ts`, `runtime/profiling.ts`, and `tools/workerSpawnService.ts` now expose and record spawn bookkeeping profile events.',
  'No raw terminal logs, screenshots, raw state archives, raw full mailbox/report bodies, worker transcripts, secrets, raw hosted records, or raw timing JSON are checked in.',
  'Do not claim v0.7 release readiness from this artifact.',
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
const FORBIDDEN_RAW_EVIDENCE = /(?:^|\/)(?:.*spawn-bookkeeping.*\.json|.*v0642.*raw.*|.*state-archive.*|.*raw-state.*|.*mailbox.*body.*|.*report.*body.*|.*worker.*transcript.*|.*screenshot.*|.*terminal.*raw.*log.*)$/i

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
  assert.match(doc, /spawn-bookkeeping-p95`[^\n]+`pass`/i)
  assert.match(doc, /visible-pane-semantics`[^\n]+`pass`/i)
  assert.match(doc, /launch-provenance-inheritance`[^\n]+`pass`/i)
  assert.match(doc, /manual-rc-smoke`[^\n]+`not-covered/i)
  assert.equal(/"records"\s*:|"profileSummary"\s*:|"runId"\s*:/i.test(doc), false, `${DOC} must not embed raw timing JSON`)
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(spawnBookkeepingP95Evidence)), spawnBookkeepingP95Evidence, 'fixture should be plain deterministic data')
  assert.equal(spawnBookkeepingP95Evidence.schemaVersion, SPAWN_BOOKKEEPING_P95_SCHEMA_VERSION)
  assert.equal(spawnBookkeepingP95Evidence.theme, SPAWN_BOOKKEEPING_P95_THEME)
  assert.equal(spawnBookkeepingP95Evidence.releaseTarget, CURRENT_RELEASE_TARGET)
  assert.equal(spawnBookkeepingP95Evidence.status, STATUS)
  assert.equal(spawnBookkeepingP95Evidence.ready, false)
  assert.equal(spawnBookkeepingP95Evidence.releaseReadyClaim, false)
  assert.equal(spawnBookkeepingP95Evidence.provesAllP95Gates, false)
  assert.equal(spawnBookkeepingP95Evidence.manualRcPassed, false)
  assert.equal(spawnBookkeepingP95Evidence.runtimeBehaviorChanged, true)
  assert.equal(spawnBookkeepingP95Evidence.packageVersionChanged, false)
  assert.equal(spawnBookkeepingP95Evidence.tagCreated, false)
  assert.equal(spawnBookkeepingP95Evidence.npmPublished, false)
  assert.equal(spawnBookkeepingP95Evidence.nativeWorkPerformed, false)
  assert.equal(spawnBookkeepingP95Evidence.defaultGoApproved, false)
  assert.equal(spawnBookkeepingP95Evidence.defaultResolverApproved, false)
  assert.equal(spawnBookkeepingP95Evidence.fallbackDeletionApproved, false)
  assert.equal(spawnBookkeepingP95Evidence.signingApproved, false)
  assert.equal(spawnBookkeepingP95Evidence.secondPlatformApproved, false)
  assert.deepEqual(spawnBookkeepingP95Evidence.rawArtifact, RAW_ARTIFACT)
  assert.deepEqual(spawnBookkeepingP95Evidence.envMetadataRequirements, ENV_METADATA_REQUIREMENTS)
  assert.deepEqual(spawnBookkeepingP95Evidence.noLeak.markers, NO_LEAK_MARKERS)
  assert.equal(spawnBookkeepingP95Evidence.noLeak.rawStateArchivesCheckedIn, false)
  assert.equal(spawnBookkeepingP95Evidence.noLeak.rawFullBodiesCheckedIn, false)
  assert.equal(spawnBookkeepingP95Evidence.noLeak.rawTimingJsonCheckedIn, false)
  assert.equal(spawnBookkeepingP95Evidence.noLeak.screenshotsCheckedIn, false)
  assert.equal(spawnBookkeepingP95Evidence.noLeak.terminalRawLogsCheckedIn, false)
  assert.deepEqual(spawnBookkeepingP95Evidence.fixtureProfile, FIXTURE_PROFILE)
  assert.deepEqual(spawnBookkeepingP95Evidence.instrumentation, INSTRUMENTATION)
  assert.deepEqual(spawnBookkeepingP95Evidence.observedGates, OBSERVED_GATES)
  assert.deepEqual(spawnBookkeepingP95Evidence.behaviorChecks, BEHAVIOR_CHECKS)
  assert.deepEqual(spawnBookkeepingP95Evidence.notCoveredGates, NOT_COVERED_GATES)
  assert.match(spawnBookkeepingP95Evidence.recommendation, /Do not claim v0\.7 release readiness/i)
}

function assertFixtureCoverage() {
  assert.equal(RAW_ARTIFACT.parse, 'ok')
  assert.match(RAW_ARTIFACT.sha256, /^[a-f0-9]{64}$/)
  assert.equal(FIXTURE_PROFILE.thresholdMs, SPAWN_BOOKKEEPING_THRESHOLD_MS)
  assert.equal(FIXTURE_PROFILE.warmup, DEFAULT_WARMUP)
  assert.equal(FIXTURE_PROFILE.measured, DEFAULT_MEASURED)
  assert.deepEqual(REQUIRED_SEGMENTS, [...HARNESS_REQUIRED_SEGMENTS])
  assert.deepEqual(FIXTURE_PROFILE.requiredSegments, REQUIRED_SEGMENTS)
  assert.equal(OBSERVED_GATES.length, 1)
  assert.equal(OBSERVED_GATES[0].id, 'spawn-bookkeeping-p95')
  assert.equal(OBSERVED_GATES[0].threshold.value, SPAWN_BOOKKEEPING_THRESHOLD_MS)
  assert.equal(OBSERVED_GATES[0].status, OBSERVED_GATES[0].observed <= SPAWN_BOOKKEEPING_THRESHOLD_MS ? 'pass' : 'fail')
  assert.equal(BEHAVIOR_CHECKS.visiblePaneSemanticsPreserved, true)
  assert.equal(BEHAVIOR_CHECKS.launchProvenanceInherited, true)
  assert.equal(INSTRUMENTATION.changedPaths.includes('tools/workerSpawnService.ts'), true)
  assert.equal(INSTRUMENTATION.compactFullTextBoundariesChanged, false)
  assert.equal(NOT_COVERED_GATES.map(gate => gate.id).includes('manual-rc-smoke'), true)
}

function assertScriptStatic(root) {
  for (const rel of [SCRIPT, LIB, SUITE]) assert.equal(exists(root, rel), true, `${rel} should exist`)
  const script = read(root, SCRIPT)
  const lib = read(root, LIB)
  const coreProfiling = read(root, 'core/profiling.ts')
  const runtimeProfiling = read(root, 'runtime/profiling.ts')
  const spawnService = read(root, 'tools/workerSpawnService.ts')
  assertIncludes(script, "require('./lib/v0642-spawn-bookkeeping-p95-harness.cjs')", SCRIPT)
  assertIncludes(script, '--warmup', SCRIPT)
  assertIncludes(script, '--measured', SCRIPT)
  assertIncludes(script, '--out', SCRIPT)
  assertIncludes(lib, "const DEFAULT_PREFIX = '/tmp/pi-agentteam-v0642-spawn-bookkeeping-p95.'", LIB)
  assertIncludes(lib, 'process.env.PI_AGENTTEAM_HOME = resolvedHome', LIB)
  assertIncludes(lib, "process.env.PI_AGENTTEAM_PROFILE = '1'", LIB)
  assertIncludes(lib, 'spawnWorkerMember(deps, team', LIB)
  assertIncludes(lib, 'visible-pane-semantics-preserved', LIB)
  assertIncludes(lib, 'launch-provenance-inherited', LIB)
  assertIncludes(coreProfiling, 'SpawnProfileSummary', 'core/profiling.ts')
  assertIncludes(coreProfiling, 'recordSpawnBookkeepingEvent', 'core/profiling.ts')
  assertIncludes(runtimeProfiling, 'recordSpawnBookkeepingEvent', 'runtime/profiling.ts')
  assertIncludes(spawnService, 'recordSpawnSegment', 'tools/workerSpawnService.ts')
  for (const segment of REQUIRED_SEGMENTS) assertIncludes(spawnService, segment, 'tools/workerSpawnService.ts')
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
    if (FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/') && FORBIDDEN_RAW_EVIDENCE.test(rel)) forbiddenRawEvidence.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain checked-in native/archive/signing/release artifacts')
  assert.deepEqual(forbiddenRawEvidence.sort(), [], 'repo must not contain raw v0.6.42 timing/body/state evidence files')
}

function assertNoCheckedInLeakMarkers(root) {
  const leakFiles = []
  const allowed = new Set([FIXTURE, SUITE, SCRIPT, LIB, DOC])
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/')) continue
    const content = fs.readFileSync(file, 'utf8')
    if (content.includes(FULL_TEXT_SENTINEL) && !allowed.has(rel)) leakFiles.push(`${rel}:${FULL_TEXT_SENTINEL}`)
  }
  assert.deepEqual(leakFiles.sort(), [], 'unexpected checked-in v0.6.42 spawn sentinel outside guard artifacts')
  assert.equal(FORBIDDEN_OUTPUT_MARKERS.includes(FULL_TEXT_SENTINEL), true)
}

async function assertHarnessRun(root) {
  const originalHome = process.env.PI_AGENTTEAM_HOME
  const originalProfile = process.env.PI_AGENTTEAM_PROFILE
  const out = path.join('/tmp', `pi-agentteam-v0642-spawn-bookkeeping-p95-test-${process.pid}-${Date.now()}.json`)
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
  const gate = summary.gates.find(item => item.id === 'spawn-bookkeeping-p95')
  assert.ok(gate, 'spawn bookkeeping gate should be present')
  assert.equal(gate.status, gate.observed <= SPAWN_BOOKKEEPING_THRESHOLD_MS ? 'pass' : 'fail')
  assert.equal(gate.status, 'pass', `spawn bookkeeping should pass focused gate: ${JSON.stringify(gate)}`)
  assert.equal(summary.p95Status, 'pass')
  const checks = new Map(summary.checks.map(check => [check.id, check]))
  for (const id of ['spawn-bookkeeping-events-recorded', 'required-bookkeeping-segments-covered', 'spawn-bookkeeping-p95-threshold', 'visible-pane-semantics-preserved', 'launch-provenance-inherited', 'clean-temp-home', 'no-release-actions']) {
    assert.equal(checks.get(id)?.pass, true, `harness check should pass: ${id}`)
  }
  assert.deepEqual(checks.get('required-bookkeeping-segments-covered')?.required, REQUIRED_SEGMENTS)
  assert.equal(summary.rawArtifact.path, out)
  assert.equal(summary.rawArtifact.parse, 'ok')
  assert.match(summary.rawArtifact.sha256, /^[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(summary).includes(FULL_TEXT_SENTINEL), false, 'summary must not leak sentinel')
  const raw = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.equal(raw.records.length, DEFAULT_MEASURED, 'raw timing artifact should preserve measured timing records')
  assert.equal(JSON.stringify(raw).includes(FULL_TEXT_SENTINEL), false, 'raw timing artifact must not leak sentinel')
  assert.equal(raw.gates[0].status, 'pass')
  fs.rmSync(out, { force: true })
}

module.exports = {
  name: 'Go kernel v0.6.42 spawn bookkeeping p95 evidence',
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
