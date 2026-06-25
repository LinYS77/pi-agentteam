const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  COVERED_ACTIONS,
  CURRENT_RELEASE_TARGET,
  OBSERVED_GATES,
  ENV_METADATA_REQUIREMENTS,
  FIXTURE_PROFILES,
  NO_LEAK_MARKERS,
  NOT_COVERED_GATES,
  RAW_ARTIFACT,
  REPORT_ONLY_SEMANTICS,
  STATUS,
  TASK_MESSAGE_REPORT_P95_SCHEMA_VERSION,
  TASK_MESSAGE_REPORT_P95_THEME,
  taskMessageReportP95Evidence,
} = require('../fixtures/kernel/v0639/taskMessageReportP95.cjs')
const {
  CHECKED_IN_RAW_BODY_PATTERNS,
  DEFAULT_MEASURED,
  DEFAULT_PREFIX,
  DEFAULT_WARMUP,
  FULL_TEXT_SENTINEL,
  LARGE_MAILBOX_THRESHOLD_MS,
  NORMAL_THRESHOLD_MS,
  isSafeTempHome,
  runHarness,
} = require('../../scripts/lib/v0639-task-message-report-p95-harness.cjs')

const DOC = 'docs/perf/v0.6.39-task-message-report-p95.md'
const FIXTURE = 'tests/fixtures/kernel/v0639/taskMessageReportP95.cjs'
const SUITE = 'tests/suites/go-kernel-v0639-task-message-report-p95.cjs'
const SCRIPT = 'scripts/verify-v0639-task-message-report-p95.cjs'
const LIB = 'scripts/lib/v0639-task-message-report-p95-harness.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_DOC = [
  '# v0.6.39/v0.6.40 Task/Message/Report p95 Evidence',
  'Result: v0.6.39 adds focused task/message/report action p95 coverage through a clean temp `PI_AGENTTEAM_HOME` harness, and v0.6.40 optimizes the large-mailbox action path by caching unchanged active-state validation reads.',
  'Final result remains `ready:false`.',
  '`task-message-report-action-normal-p95`',
  '`task-message-report-action-large-mailbox-p95`',
  '`agentteam_task` create/assign/close/block/unblock',
  '`agentteam_send` assignment/question/inform',
  '`agentteam_receive markRead=false` and `agentteam_receive markRead=true`',
  '`report_done` and `report_blocked` are report-only for worker owners',
  '`taskMessageReportAction.normal.p95` observed `30.434ms`',
  '`taskMessageReportAction.largeMailbox.p95` observed `106.863ms`',
  'v0.6.40 validation-cache optimization burns down the large-mailbox task/message/report p95 blocker',
  'No raw full mailbox/report bodies, worker transcripts, screenshots, state archives, secrets, raw hosted records, or raw timing JSON are checked in.',
  'Do not claim v0.7 release readiness from this artifact.',
  'this slice does not re-execute manual RC or prove every release p95 gate; the true operator/model manual RC main checklist is tracked separately by the v0.6.38 evidence artifact.',
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
const FORBIDDEN_RAW_EVIDENCE = /(?:^|\/)(?:.*task-message-report-p95.*\.json|.*v0639.*raw.*|.*mailbox.*body.*|.*report.*body.*|.*worker.*transcript.*|.*screenshot.*|.*state-archive.*)$/i
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
  SCRIPT,
  LIB,
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
  assert.match(doc, /normal[^\n]+`pass`|normal[^\n]+`blocked`|normal[^\n]+`fail`/i)
  assert.match(doc, /large-mailbox[^\n]+`pass`|large-mailbox[^\n]+`blocked`|large-mailbox[^\n]+`fail`/i)
  assert.match(doc, /fsstore-lock-wait-p95`[^\n]+`not-covered/i)
  assert.match(doc, /data-change-render-debounce-rate`[^\n]+`not-covered/i)
  assert.match(doc, /spawn-bookkeeping-p95`[^\n]+`not-covered/i)
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(taskMessageReportP95Evidence)), taskMessageReportP95Evidence, 'fixture should be plain deterministic data')
  assert.equal(taskMessageReportP95Evidence.schemaVersion, TASK_MESSAGE_REPORT_P95_SCHEMA_VERSION)
  assert.equal(taskMessageReportP95Evidence.theme, TASK_MESSAGE_REPORT_P95_THEME)
  assert.equal(taskMessageReportP95Evidence.releaseTarget, CURRENT_RELEASE_TARGET)
  assert.equal(taskMessageReportP95Evidence.status, STATUS)
  assert.equal(taskMessageReportP95Evidence.ready, false)
  assert.equal(taskMessageReportP95Evidence.releaseReadyClaim, false)
  assert.equal(taskMessageReportP95Evidence.provesAllP95Gates, false)
  assert.equal(taskMessageReportP95Evidence.manualRcPassed, false)
  assert.equal(taskMessageReportP95Evidence.runtimeBehaviorChanged, true)
  assert.equal(taskMessageReportP95Evidence.packageVersionChanged, false)
  assert.equal(taskMessageReportP95Evidence.tagCreated, false)
  assert.equal(taskMessageReportP95Evidence.npmPublished, false)
  assert.equal(taskMessageReportP95Evidence.nativeWorkPerformed, false)
  assert.equal(taskMessageReportP95Evidence.defaultGoApproved, false)
  assert.equal(taskMessageReportP95Evidence.defaultResolverApproved, false)
  assert.equal(taskMessageReportP95Evidence.fallbackDeletionApproved, false)
  assert.equal(taskMessageReportP95Evidence.signingApproved, false)
  assert.equal(taskMessageReportP95Evidence.secondPlatformApproved, false)
  assert.deepEqual(taskMessageReportP95Evidence.rawArtifact, RAW_ARTIFACT)
  assert.deepEqual(taskMessageReportP95Evidence.envMetadataRequirements, ENV_METADATA_REQUIREMENTS)
  assert.deepEqual(taskMessageReportP95Evidence.noLeak.markers, NO_LEAK_MARKERS)
  assert.equal(taskMessageReportP95Evidence.noLeak.rawFullBodiesCheckedIn, false)
  assert.equal(taskMessageReportP95Evidence.noLeak.rawTimingJsonCheckedIn, false)
  assert.deepEqual(taskMessageReportP95Evidence.fixtureProfiles, FIXTURE_PROFILES)
  assert.deepEqual(taskMessageReportP95Evidence.coveredActions, COVERED_ACTIONS)
  assert.deepEqual(taskMessageReportP95Evidence.observedGates, OBSERVED_GATES)
  assert.deepEqual(taskMessageReportP95Evidence.reportOnlySemantics, REPORT_ONLY_SEMANTICS)
  assert.deepEqual(taskMessageReportP95Evidence.notCoveredGates, NOT_COVERED_GATES)
  assert.match(taskMessageReportP95Evidence.recommendation, /Do not claim v0\.7 release readiness/i)
}

function assertFixtureCoverage() {
  assert.deepEqual(COVERED_ACTIONS.agentteamTask, ['create', 'assign', 'close', 'block', 'unblock', 'report_done', 'report_blocked'])
  assert.deepEqual(COVERED_ACTIONS.agentteamSend, ['assignment', 'question', 'inform'])
  assert.deepEqual(COVERED_ACTIONS.agentteamReceive, ['markRead=false', 'markRead=true'])
  assert.equal(RAW_ARTIFACT.parse, 'ok')
  assert.match(RAW_ARTIFACT.sha256, /^[a-f0-9]{64}$/)
  assert.equal(FIXTURE_PROFILES.normal.thresholdMs, NORMAL_THRESHOLD_MS)
  assert.equal(FIXTURE_PROFILES.largeMailbox.thresholdMs, LARGE_MAILBOX_THRESHOLD_MS)
  assert.equal(FIXTURE_PROFILES.normal.warmup, DEFAULT_WARMUP)
  assert.equal(FIXTURE_PROFILES.normal.measured, DEFAULT_MEASURED)
  assert.equal(FIXTURE_PROFILES.largeMailbox.warmup, DEFAULT_WARMUP)
  assert.equal(FIXTURE_PROFILES.largeMailbox.measured, DEFAULT_MEASURED)
  assert.equal(OBSERVED_GATES.length, 2)
  assert.equal(OBSERVED_GATES[0].threshold.value, NORMAL_THRESHOLD_MS)
  assert.equal(OBSERVED_GATES[0].status, OBSERVED_GATES[0].observed <= NORMAL_THRESHOLD_MS ? 'pass' : 'fail')
  assert.equal(OBSERVED_GATES[1].threshold.value, LARGE_MAILBOX_THRESHOLD_MS)
  assert.equal(OBSERVED_GATES[1].status, OBSERVED_GATES[1].observed <= LARGE_MAILBOX_THRESHOLD_MS ? 'pass' : 'fail')
  assert.equal(REPORT_ONLY_SEMANTICS.length, 2)
  assert.equal(NOT_COVERED_GATES.map(gate => gate.id).includes('manual-rc-smoke'), true)
}

function assertScriptStatic(root) {
  for (const rel of [SCRIPT, LIB, SUITE]) assert.equal(exists(root, rel), true, `${rel} should exist`)
  const script = read(root, SCRIPT)
  const lib = read(root, LIB)
  assertIncludes(script, "require('./lib/v0639-task-message-report-p95-harness.cjs')", SCRIPT)
  assertIncludes(script, '--warmup', SCRIPT)
  assertIncludes(script, '--measured', SCRIPT)
  assertIncludes(script, '--out', SCRIPT)
  assertIncludes(script, '--keep-home', SCRIPT)
  assertIncludes(lib, "const DEFAULT_PREFIX = '/tmp/pi-agentteam-v0639-task-message-report-p95.'", LIB)
  assertIncludes(lib, 'process.env.PI_AGENTTEAM_HOME = resolvedHome', LIB)
  assertIncludes(lib, "process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE = '0'", LIB)
  assertIncludes(lib, "agentteam_task', `normal-create", LIB)
  assertIncludes(lib, "agentteam_send', `normal-send-assignment", LIB)
  assertIncludes(lib, "agentteam_receive', `normal-receive-peek", LIB)
  assertIncludes(lib, "agentteam_task', `normal-report-done", LIB)
  assertIncludes(lib, "agentteam_task', `normal-report-blocked", LIB)
  assertIncludes(lib, 'seedLargeFixture(modules, teamName, workerNames', LIB)
  assertIncludes(lib, 'assertNoSentinelInSummary(summary)', LIB)
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
  const forbiddenRecords = []
  const forbiddenRawEvidence = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && !rel.startsWith('docs/') && !rel.startsWith('tests/') && !ALLOWED_REVIEW_RECORDS.has(rel) && FORBIDDEN_GENERATED_RECORD.test(rel)) forbiddenRecords.push(rel)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && !rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/') && FORBIDDEN_RAW_EVIDENCE.test(rel)) forbiddenRawEvidence.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved checked-in native/archive/signing/release artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain unapproved generated manifests/checksums/provenance/attestation/raw hosted/release records outside docs/tests/review helper areas')
  assert.deepEqual(forbiddenRawEvidence.sort(), [], 'repo must not contain raw v0.6.39 timing/body evidence files')
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
  assert.deepEqual(leakFiles.sort(), [], 'unexpected checked-in v0.6.39 full-body sentinel outside guard artifacts')
  assert.equal(CHECKED_IN_RAW_BODY_PATTERNS.includes(FULL_TEXT_SENTINEL), true)
  assert.equal(FULL_TEXT_SENTINEL, 'V0639_TASK_MESSAGE_REPORT_FULL_TEXT_SENTINEL_DO_NOT_LEAK')
}

async function assertHarnessRun(root) {
  const originalHome = process.env.PI_AGENTTEAM_HOME
  const originalAutoBridge = process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE
  const out = path.join('/tmp', `pi-agentteam-v0639-task-message-report-p95-test-${process.pid}-${Date.now()}.json`)
  delete process.env.PI_AGENTTEAM_HOME
  let summary
  try {
    summary = await runHarness({ extRoot: root, out })
  } finally {
    if (originalHome === undefined) delete process.env.PI_AGENTTEAM_HOME
    else process.env.PI_AGENTTEAM_HOME = originalHome
  }
  assert.equal(summary.ok, true, `harness should pass: ${JSON.stringify(summary.errors)}`)
  assert.equal(summary.status, 'passed')
  assert.equal(summary.cleanupResult, 'removed')
  assert.equal(summary.isolation.safePrefix, true)
  assert.equal(summary.isolation.underRepo, false)
  assert.equal(summary.isolation.initialEntryCount, 0)
  assert.equal(summary.isolation.liveHomeEnvRestored, true)
  assert.equal(summary.isolation.autoBridgeEnvRestored, true)
  assert.equal(summary.isolation.liveHomeEnvRestored, true)
  assert.equal(process.env.PI_AGENTTEAM_HOME, originalHome)
  assert.equal(process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE, originalAutoBridge)
  assert.equal(isSafeTempHome(summary.tempHome, DEFAULT_PREFIX), true)
  assert.equal(fs.existsSync(summary.tempHome), false, 'temp home should be removed')
  assert.equal(summary.gates.length, 2)
  const normal = summary.gates.find(gate => gate.id === 'task-message-report-action-normal-p95')
  const large = summary.gates.find(gate => gate.id === 'task-message-report-action-large-mailbox-p95')
  assert.ok(['pass', 'fail'].includes(normal.status), 'normal gate should record pass/fail')
  assert.ok(['pass', 'fail'].includes(large.status), 'large gate should record pass/fail')
  assert.equal(normal.status, normal.observed <= NORMAL_THRESHOLD_MS ? 'pass' : 'fail')
  assert.equal(large.status, large.observed <= LARGE_MAILBOX_THRESHOLD_MS ? 'pass' : 'fail')
  assert.ok(['pass', 'fail'].includes(summary.p95Status), 'summary should record aggregate p95 status')
  assert.equal(summary.toolSamples.length > 0, true, 'summary should keep compact tool samples')
  assert.equal(summary.toolSamples.length <= 24, true, 'summary should bound compact tool samples')
  const checks = new Map(summary.checks.map(check => [check.id, check]))
  for (const id of ['report-done-report-only', 'leader-close-mutates-after-report-done', 'report-blocked-report-only', 'leader-block-mutates-after-report-blocked', 'leader-unblock-mutates-after-block', 'task-actions-covered', 'send-types-covered', 'receive-markread-covered', 'typescript-pi-facade-authority-preserved', 'no-release-actions']) {
    assert.equal(checks.get(id)?.pass, true, `harness check should pass: ${id}`)
  }
  assert.equal(checks.get('normal-p95-threshold')?.pass, normal.status === 'pass')
  assert.equal(checks.get('large-mailbox-p95-threshold')?.pass, large.status === 'pass')
  assert.equal(JSON.stringify(summary).includes(FULL_TEXT_SENTINEL), false, 'summary must not leak full-text sentinel')
  assert.equal(summary.rawArtifact.path, out)
  assert.equal(summary.rawArtifact.parse, 'ok')
  assert.match(summary.rawArtifact.sha256, /^[a-f0-9]{64}$/)
  const raw = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.equal(raw.rawRecords.length > 0, true, 'raw timing artifact should preserve timing records')
  assert.equal(JSON.stringify(raw).includes(FULL_TEXT_SENTINEL), false, 'raw timing artifact must not leak full-text sentinel')
  assert.equal(raw.gates.length, 2)
  assert.equal(raw.gates[0].status, raw.gates[0].observed <= raw.gates[0].threshold.value ? 'pass' : 'fail')
  fs.rmSync(out, { force: true })
}

module.exports = {
  name: 'Go kernel v0.6.39 task/message/report p95 evidence',
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
