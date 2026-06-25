const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const {
  CURRENT_RELEASE_TARGET,
  NO_LEAK_MARKERS,
  PACKAGE_RUNTIME_INVARIANTS,
  READINESS_RECONCILIATION_SCHEMA_VERSION,
  READINESS_RECONCILIATION_THEME,
  RECONCILED_GATES,
  REMAINING_DECISIONS,
  SOURCE_EVIDENCE,
  STATUS,
  STILL_NOT_AUTHORIZED,
  SUPERSEDED_BLOCKERS,
  readinessEvidenceReconciliation,
} = require('../fixtures/kernel/v0643/readinessEvidenceReconciliation.cjs')

const DOC = 'docs/perf/v0.6.43-readiness-evidence-reconciliation.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0643/readinessEvidenceReconciliation.cjs'
const SUITE = 'tests/suites/go-kernel-v0643-readiness-evidence-reconciliation.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_DOC = [
  '# v0.6.43 Readiness Evidence Reconciliation',
  'Result: v0.6.43 reconciles the release-readiness evidence map after focused p95 and true-operator evidence improvements.',
  'Final result remains `ready:false`.',
  '`true-operator-manual-rc-main-checklist`',
  '`true-operator-planrun-cancel-follow-up`',
  '`accepted-task-board-pass-not-force-added`',
  '`task-message-report-action-normal-p95`',
  '`task-message-report-action-large-mailbox-p95`',
  '`covered-focused-pass-supersedes-v0639-fail`',
  '`fsstore-lock-wait-p95`',
  '`data-change-render-debounce-rate`',
  '`spawn-bookkeeping-p95`',
  'T129 local ignored sanitized doc is not force-added by this slice.',
  'Historical docs may still contain old fail/not-covered rows because they are audit records for the earlier checkpoint.',
  'v0.6.43 is docs/tests reconciliation only',
  '## Validation',
  'Use v0.6.43 as the current readiness evidence reconciliation checkpoint only.',
]
const REQUIRED_ROADMAP = [
  '### 0.4 当前推进状态（截至 v0.6.43 evidence reconciliation）',
  'v0.6.39/v0.6.40 task/message/report normal 与 large-mailbox focused p95 pass',
  'v0.6.41 fsStore lock-wait focused p95 pass',
  'v0.6.42 data-change render debounce focused pass',
  'v0.6.42 spawn bookkeeping focused p95 pass',
  'T129 true operator PlanRun cancel follow-up 已在任务板验收为 pass',
  'ignored 本地 evidence 不纳入 repo',
  'v0.6.39 的 large-mailbox fail 已被 v0.6.40 validation-cache optimization 后的 pass evidence supersede',
  '当前仍为 `ready:false`',
  'v0.6.43 只对账并关闭/替换旧 evidence blocker 口径',
  '它不是 v0.7 release-ready、tag、npm、default-Go、native 或 package approval',
  '**v0.6.43 evidence reconciliation**',
  'focused p95 主 gate 均已有 pass evidence',
  'task/message/report action、large mailbox、fsStore lock wait、data-change debounce、spawn bookkeeping 均已有 focused harness pass',
  'T129 PlanRun cancel follow-up 已由任务板验收为 pass，但 ignored 本地 evidence 不 force-add',
]
const FORBIDDEN_OVERCLAIMS = [
  'v0.7 release-ready approval is granted',
  'v0.7 release ready approval is granted',
  'v0.7 is release-ready',
  'v0.7 is release ready',
  'v0.7 readiness approved',
  'release can ship',
  'ready for release',
  'all gates product-ready',
  'all gates product ready',
  'all p95 gates product-ready',
  'all p95 gates product ready',
  'tag was created',
  'tag was pushed',
  'git push completed',
  'GitHub release created',
  'npm version completed',
  'npm publish completed',
  'package release is approved',
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'native helper delivery is complete',
  'native package delivery is complete',
  'fallback deletion is approved',
  'signing is approved',
  'second-platform support is approved',
  'second platform support is approved',
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
const FORBIDDEN_RAW_EVIDENCE = /(?:^|\/)(?:.*readiness-evidence-reconciliation.*\.json|.*v0643.*raw.*|.*state-archive.*|.*raw-state.*|.*mailbox.*body.*|.*report.*body.*|.*worker.*transcript.*|.*screenshot.*|.*terminal.*raw.*log.*|.*hosted.*record.*)$/i
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'
const REQUIRED_EXISTING_FILES = [
  'docs/perf/v0.6.38-p95-evidence.md',
  'docs/perf/v0.6.38-true-operator-manual-rc-pass-evidence.md',
  'docs/perf/v0.6.39-task-message-report-p95.md',
  'docs/perf/v0.6.41-fsstore-lock-wait-p95.md',
  'docs/perf/v0.6.42-data-change-render-debounce.md',
  'docs/perf/v0.6.42-spawn-bookkeeping-p95.md',
  'tests/fixtures/kernel/v0638/p95Evidence.cjs',
  'tests/fixtures/kernel/v0639/taskMessageReportP95.cjs',
  'tests/fixtures/kernel/v0641/fsStoreLockWaitP95.cjs',
  'tests/fixtures/kernel/v0642/dataChangeRenderDebounce.cjs',
  'tests/fixtures/kernel/v0642/spawnBookkeepingP95.cjs',
  'tests/suites/go-kernel-v0638-p95-evidence.cjs',
  'tests/suites/go-kernel-v0639-task-message-report-p95.cjs',
  'tests/suites/go-kernel-v0641-fsstore-lock-wait-p95.cjs',
  'tests/suites/go-kernel-v0642-data-change-render-debounce.cjs',
  'tests/suites/go-kernel-v0642-spawn-bookkeeping-p95.cjs',
]
const IGNORED_T129_DOC = 'docs/perf/v0.6.41-true-operator-planrun-cancel-evidence.md'

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
  for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(source.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  assert.equal(exists(root, ROADMAP), true, `${ROADMAP} should exist`)
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoOverclaims(doc, DOC)
  assertNoOverclaims(roadmap, ROADMAP)
  assert.match(doc, /task-message-report-action-large-mailbox-p95`[^\n]+`covered-focused-pass-supersedes-v0639-fail`/i)
  assert.match(doc, /t120-optional-planrun-cancel-gap`[^\n]+`optional-not-covered`[^\n]+`closed-by-t129-task-board-pass-without-force-adding-ignored-doc`/i)
  assert.equal(/"records"\s*:|"profileSummary"\s*:|"runId"\s*:/i.test(doc), false, `${DOC} must not embed raw timing JSON`)
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(readinessEvidenceReconciliation)), readinessEvidenceReconciliation, 'fixture should be plain deterministic data')
  assert.equal(readinessEvidenceReconciliation.schemaVersion, READINESS_RECONCILIATION_SCHEMA_VERSION)
  assert.equal(readinessEvidenceReconciliation.theme, READINESS_RECONCILIATION_THEME)
  assert.equal(readinessEvidenceReconciliation.releaseTarget, CURRENT_RELEASE_TARGET)
  assert.equal(readinessEvidenceReconciliation.status, STATUS)
  assert.equal(readinessEvidenceReconciliation.ready, false)
  assert.equal(readinessEvidenceReconciliation.releaseReadyClaim, false)
  assert.equal(readinessEvidenceReconciliation.focusedP95CoverageImproved, true)
  assert.equal(readinessEvidenceReconciliation.focusedP95GatesCovered, true)
  assert.equal(readinessEvidenceReconciliation.allGatesProductReadyClaim, false)
  assert.equal(readinessEvidenceReconciliation.manualRcMainChecklistPassed, true)
  assert.equal(readinessEvidenceReconciliation.planRunCancelFollowUpAccepted, true)
  assert.equal(readinessEvidenceReconciliation.planRunCancelRepoEvidenceForceAdded, false)
  assert.equal(readinessEvidenceReconciliation.runtimeBehaviorChanged, false)
  assert.equal(readinessEvidenceReconciliation.packageVersionChanged, false)
  assert.equal(readinessEvidenceReconciliation.tagCreated, false)
  assert.equal(readinessEvidenceReconciliation.npmPublished, false)
  assert.equal(readinessEvidenceReconciliation.nativeWorkPerformed, false)
  assert.equal(readinessEvidenceReconciliation.defaultGoApproved, false)
  assert.equal(readinessEvidenceReconciliation.defaultResolverApproved, false)
  assert.equal(readinessEvidenceReconciliation.fallbackDeletionApproved, false)
  assert.equal(readinessEvidenceReconciliation.signingApproved, false)
  assert.equal(readinessEvidenceReconciliation.secondPlatformApproved, false)
  assert.equal(readinessEvidenceReconciliation.releaseAssetsCreated, false)
  assert.equal(readinessEvidenceReconciliation.rawArtifactsCheckedIn, false)
  assert.deepEqual(readinessEvidenceReconciliation.packageRuntimeInvariants, PACKAGE_RUNTIME_INVARIANTS)
  assert.deepEqual(readinessEvidenceReconciliation.noLeak.markers, NO_LEAK_MARKERS)
  assert.equal(readinessEvidenceReconciliation.noLeak.rawStateArchivesCheckedIn, false)
  assert.equal(readinessEvidenceReconciliation.noLeak.rawFullBodiesCheckedIn, false)
  assert.equal(readinessEvidenceReconciliation.noLeak.rawTimingJsonCheckedIn, false)
  assert.equal(readinessEvidenceReconciliation.noLeak.screenshotsCheckedIn, false)
  assert.equal(readinessEvidenceReconciliation.noLeak.terminalRawLogsCheckedIn, false)
  assert.equal(readinessEvidenceReconciliation.noLeak.workerTranscriptsCheckedIn, false)
  assert.equal(readinessEvidenceReconciliation.noLeak.rawHostedRecordsCheckedIn, false)
  assert.deepEqual(readinessEvidenceReconciliation.sourceEvidence, SOURCE_EVIDENCE)
  assert.deepEqual(readinessEvidenceReconciliation.reconciledGates, RECONCILED_GATES)
  assert.deepEqual(readinessEvidenceReconciliation.supersededBlockers, SUPERSEDED_BLOCKERS)
  assert.deepEqual(readinessEvidenceReconciliation.stillNotAuthorized, STILL_NOT_AUTHORIZED)
  assert.deepEqual(readinessEvidenceReconciliation.remainingDecisions, REMAINING_DECISIONS)
  assert.match(readinessEvidenceReconciliation.recommendation, /ready remains false/i)
}

function assertCoverageMap() {
  const gates = new Map(RECONCILED_GATES.map(gate => [gate.id, gate]))
  assert.equal(gates.get('task-message-report-action-normal-p95')?.status, 'covered-focused-pass')
  assert.equal(gates.get('task-message-report-action-normal-p95')?.observed, 30.434)
  assert.equal(gates.get('task-message-report-action-large-mailbox-p95')?.status, 'covered-focused-pass-supersedes-v0639-fail')
  assert.equal(gates.get('task-message-report-action-large-mailbox-p95')?.observed, 106.863)
  assert.equal(gates.get('fsstore-lock-wait-p95')?.observed, 10.644)
  assert.equal(gates.get('data-change-render-debounce-rate')?.observed, 3.021)
  assert.equal(gates.get('spawn-bookkeeping-p95')?.observed, 21.995)
  assert.equal(gates.get('true-operator-manual-rc-main-checklist')?.status, 'accepted-pass')
  assert.equal(gates.get('true-operator-planrun-cancel-follow-up')?.status, 'accepted-task-board-pass-not-force-added')
  const blockers = new Map(SUPERSEDED_BLOCKERS.map(blocker => [blocker.id, blocker]))
  assert.equal(blockers.get('v0639-large-mailbox-task-message-report-p95-fail')?.currentStatus, 'superseded-by-v0640-pass')
  assert.equal(blockers.get('t120-optional-planrun-cancel-gap')?.currentStatus, 'closed-by-t129-task-board-pass-without-force-adding-ignored-doc')
  assert.equal(STILL_NOT_AUTHORIZED.includes('v0.7 release-ready claim'), true)
  assert.equal(STILL_NOT_AUTHORIZED.includes('npm publish'), true)
  assert.equal(STILL_NOT_AUTHORIZED.includes('default Go or default resolver enablement'), true)
}

function isGitTracked(root, rel) {
  try {
    childProcess.execFileSync('git', ['ls-files', '--error-unmatch', rel], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function assertSourceEvidence(root) {
  for (const rel of REQUIRED_EXISTING_FILES) assert.equal(exists(root, rel), true, `${rel} should exist`)
  const sources = new Map(SOURCE_EVIDENCE.map(item => [item.id, item]))
  assert.equal(sources.get('v0641-true-operator-planrun-cancel-follow-up')?.checkedInDoc, null)
  assert.equal(sources.get('v0641-true-operator-planrun-cancel-follow-up')?.reportId, 'TR0135')
  assert.equal(sources.get('v0638-true-operator-manual-rc-main')?.reportId, 'TR0132')
  assert.equal(REMAINING_DECISIONS.find(item => item.id === 't129-ignored-evidence-doc')?.status, 'not-force-added')
  assert.equal(isGitTracked(root, IGNORED_T129_DOC), false, `${IGNORED_T129_DOC} must not be tracked for T132`)
  assert.equal(read(root, '.gitignore').includes(`!${IGNORED_T129_DOC}`), false, `${IGNORED_T129_DOC} must not be allow-listed by T132`)
}

function assertPackageRuntimeInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, PACKAGE_RUNTIME_INVARIANTS.packageName)
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.version, PACKAGE_RUNTIME_INVARIANTS.packageVersion)
  assert.equal(packageJson.type, PACKAGE_RUNTIME_INVARIANTS.packageType)
  assert.deepEqual(packageJson.pi?.extensions, [...PACKAGE_RUNTIME_INVARIANTS.piExtensions])
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
  assert.deepEqual(forbiddenRawEvidence.sort(), [], 'repo must not contain raw v0.6.43 timing/body/state/operator evidence files')
}

function assertNoCheckedInLeakMarkers(root) {
  const sentinel = 'V0643_READINESS_RECONCILIATION_FULL_TEXT_SENTINEL_DO_NOT_LEAK'
  const leakFiles = []
  const allowed = new Set([FIXTURE, SUITE, DOC])
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/')) continue
    const content = fs.readFileSync(file, 'utf8')
    if (content.includes(sentinel) && !allowed.has(rel)) leakFiles.push(`${rel}:${sentinel}`)
  }
  assert.deepEqual(leakFiles.sort(), [], 'unexpected checked-in v0.6.43 full-body sentinel outside guard artifacts')
  assert.equal(NO_LEAK_MARKERS.includes(sentinel), true)
}

module.exports = {
  name: 'Go kernel v0.6.43 readiness evidence reconciliation',
  async run(env) {
    const root = env.helpers.extRoot
    assertDocs(root)
    assertFixtureShape(root)
    assertCoverageMap()
    assertSourceEvidence(root)
    assertPackageRuntimeInvariants(root)
    assertArtifactInvariants(root)
    assertNoCheckedInLeakMarkers(root)
  },
}
