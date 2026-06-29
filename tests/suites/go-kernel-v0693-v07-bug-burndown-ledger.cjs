const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACCEPTED_PRIOR_GATES,
  ACTIVE_CAPABILITIES,
  ACTIVE_TEST_VISIBLE_BLOCKERS,
  ACTIVE_WORKER_LIFECYCLE_OPERATIONS,
  BUG_LEDGER_GATE_STATUS,
  DELIVERY_POLICY_FILE,
  DOC,
  EXPECTED_CHANGED_FILES,
  GO_SOURCE_FILE,
  KERNEL_FILE,
  LEDGER_ROWS,
  NATIVE_ARTIFACT_SNAPSHOT,
  NATIVE_ROOT,
  NO_LEAK_CONCLUSIONS,
  PACKAGE_VERSION,
  RAW_ARTIFACT_NO_CHECKIN_POLICY,
  RELEASE_TARGET,
  REMAINING_V07_GATES,
  ROADMAP,
  STATUS,
  STILL_UNAUTHORIZED,
  T046_FIX_COMMIT,
  T046_FIX_FILE,
  V0690_DOC,
  V0691_DOC,
  V0692_DOC,
  V07_BUG_BURNDOWN_LEDGER_SCHEMA_VERSION,
  V07_BUG_BURNDOWN_LEDGER_THEME,
  VALIDATION_SNAPSHOT,
  v07BugBurndownLedger,
} = require('../fixtures/kernel/v0693/v07BugBurndownLedger.cjs')

const FIXTURE = 'tests/fixtures/kernel/v0693/v07BugBurndownLedger.cjs'
const SUITE = 'tests/suites/go-kernel-v0693-v07-bug-burndown-ledger.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum', '.agentteam-artifacts']
const REQUIRED_DOC = [
  '# v0.6.93 v0.7 Bug Burn-down Ledger',
  `Release target remains exactly: \`${RELEASE_TARGET}\``,
  `Slice status: \`${STATUS}\``,
  `bug burn-down ledger gate status: \`${BUG_LEDGER_GATE_STATUS}\``,
  'Overall v0.7 status remains `not-release-ready`',
  '`package.json` remains `0.6.8`.',
  'This ledger does not claim no bugs in all possible environments.',
  'no known active test-visible P0/P1 blockers',
  '`tools-state-pane-health-host-snapshot-collision`',
  '`fixed-accepted`',
  '`e423179 Isolate tools-state tmux snapshot fixture`',
  '`tests/suites/tools-state.cjs`',
  '`node tests/run.cjs tools-state` | pass',
  '`npm test` | pass',
  '`npm run typecheck` | pass',
  '`npm run -s check:boundaries` | pass',
  'v0.6.91 clean-temp p95 refresh is accepted',
  '`docs/perf/v0.6.91-v07-clean-temp-p95-refresh.md`',
  'v0.6.92 clean-temp manual RC/operator-seam refresh is accepted',
  '`docs/perf/v0.6.92-v07-clean-temp-manual-rc-refresh.md`',
  'true interactive pi/TUI/operator/model pass is not claimed by v0.6.92',
  'release checklist/governance review remains outstanding',
  'evidence reconciliation remains outstanding',
  'continued no raw artifact policy remains in force',
  'Go `send-keys` / active `wakePane` remains unauthorized',
  'state/task/PlanRun/mailbox/governance, team panel/UI, and release/package control-plane migrations remain deferred future design gates',
  'Native helper path/name remains intentionally unchanged',
  'Do not check in raw logs, raw validation output, transcripts, state archives, screenshots, temp homes, raw hosted records, release artifacts, raw harness JSON output files, or full mailbox/report bodies.',
  'worker delivery remains bridge-only',
  '`tests/fixtures/kernel/v0693/v07BugBurndownLedger.cjs`',
  '`tests/suites/go-kernel-v0693-v07-bug-burndown-ledger.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.93 v0.7 bug burn-down ledger refresh',
  `\`${RELEASE_TARGET}\``,
  `status \`${STATUS}\``,
  `bug ledger gate \`${BUG_LEDGER_GATE_STATUS}\``,
  'T046 `tools-state.cjs:577` pane-health mismatch is fixed',
  'no known active test-visible P0/P1 blockers after current validation',
  '`node tests/run.cjs tools-state` pass',
  '`npm test` pass',
  'v0.6.91 clean-temp p95 refresh is accepted',
  'v0.6.92 clean-temp manual RC/operator-seam refresh is accepted',
  'true interactive pi/TUI/operator/model pass is a coverage limitation/deferred operator procedure',
  'release checklist/governance review and evidence reconciliation remain outstanding',
  'worker delivery remains bridge-only',
  'Go `send-keys` / active `wakePane` remain unauthorized',
  'docs/perf/v0.6.93-v07-bug-burndown-ledger.md',
  '**v0.6.93 v0.7 bug burn-down ledger refresh**',
]
const FORBIDDEN_OVERCLAIMS = [
  'ready:true',
  'releaseReadyClaim: true',
  'v0.7.0 is release-ready',
  'v0.7 is release-ready',
  'v0.7.0 release-ready approval is granted',
  'release can ship',
  'ready for release',
  'GO for release',
  'GO to release',
  'v0.7 shipped',
  'v0.7.0 shipped',
  'all v0.7 gates complete',
  'all gates complete',
  'there are no bugs in all possible environments',
  'no possible bugs',
  'bug burn-down complete and release can proceed',
  'release checklist complete',
  'evidence reconciliation complete',
  'npm publish completed',
  'npm version completed',
  'tag pushed',
  'tag was pushed',
  'tag was created',
  'GitHub release created',
  'release assets uploaded',
]
const FORBIDDEN_RAW_FILE = /(?:^|\/)(?:.*raw.*(?:benchmark|p95|manual|rc|smoke|terminal|mailbox|report|transcript|state|hosted|validation).*|.*(?:benchmark|p95|manual|rc|smoke|terminal|mailbox|report|transcript|state|hosted|validation).*raw.*)\.(?:json|jsonl|log|txt|ndjson|tgz|tar|tar\.gz|zip|png|jpg|jpeg|gif|webp)$/i
const FORBIDDEN_ARTIFACT = /\.(?:tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig)$/i
const APPROVED_NATIVE_PREFIX = `${NATIVE_ROOT}/`

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
}

function sha256(root, rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, ...rel.split('/')))).digest('hex')
}

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'data' || entry.name === 'dist') continue
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

function sourceWithoutLineComments(source) {
  return source.replace(/^\s*\/\/.*$/gm, '')
}

function parseGoCapabilities(source) {
  const body = source.match(/var\s+capabilities\s*=\s*\[\]string\{([^}]+)\}/s)?.[1] || ''
  return [...body.matchAll(/"([^"]+)"/g)].map(match => match[1])
}

function parseGoWorkerLifecycleCases(source) {
  const body = source.match(/func\s+workerLifecycle\([^]*?switch\s+operation\s*\{([^]*?)\n\s*default:/)?.[1] || ''
  return [...body.matchAll(/case "([^"]+)"/g)].map(match => match[1])
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(v07BugBurndownLedger)), v07BugBurndownLedger)
  assert.equal(v07BugBurndownLedger.schemaVersion, V07_BUG_BURNDOWN_LEDGER_SCHEMA_VERSION)
  assert.equal(v07BugBurndownLedger.theme, V07_BUG_BURNDOWN_LEDGER_THEME)
  assert.equal(v07BugBurndownLedger.releaseTarget, RELEASE_TARGET)
  assert.equal(v07BugBurndownLedger.packageVersion, PACKAGE_VERSION)
  assert.equal(v07BugBurndownLedger.status, STATUS)
  assert.equal(v07BugBurndownLedger.bugLedgerGateStatus, BUG_LEDGER_GATE_STATUS)
  assert.equal(v07BugBurndownLedger.ready, false)
  assert.equal(v07BugBurndownLedger.releaseReadyClaim, false)
  assert.equal(v07BugBurndownLedger.noKnownActiveTestVisibleP0P1Blockers, true)
  assert.equal(v07BugBurndownLedger.noPossibleBugsClaim, false)
  assert.deepEqual(v07BugBurndownLedger.activeTestVisibleBlockers, [...ACTIVE_TEST_VISIBLE_BLOCKERS])
  assert.deepEqual(v07BugBurndownLedger.ledgerRows, [...LEDGER_ROWS])
  assert.deepEqual(v07BugBurndownLedger.validationSnapshot, [...VALIDATION_SNAPSHOT])
  assert.deepEqual(v07BugBurndownLedger.acceptedPriorGates, [...ACCEPTED_PRIOR_GATES])
  assert.deepEqual(v07BugBurndownLedger.remainingV07Gates, [...REMAINING_V07_GATES])
  assert.deepEqual(v07BugBurndownLedger.rawArtifactNoCheckinPolicy, [...RAW_ARTIFACT_NO_CHECKIN_POLICY])
  assert.deepEqual(v07BugBurndownLedger.noLeakConclusions, NO_LEAK_CONCLUSIONS)
  assert.deepEqual(v07BugBurndownLedger.stillUnauthorized, [...STILL_UNAUTHORIZED])
  assert.deepEqual(v07BugBurndownLedger.expectedChangedFiles, [...EXPECTED_CHANGED_FILES])
  assert.equal(v07BugBurndownLedger.workerDeliveryBridgeOnly, true)
  assert.equal(v07BugBurndownLedger.goSendKeysAuthorized, false)
  assert.equal(v07BugBurndownLedger.activeWakePaneAuthorized, false)
  assert.equal(v07BugBurndownLedger.stateTaskPlanRunMailboxGovernanceMigrated, false)
  assert.equal(v07BugBurndownLedger.teamPanelUiMigrated, false)
  assert.equal(v07BugBurndownLedger.releasePackageControlPlaneMigrated, false)
  assert.equal(v07BugBurndownLedger.runtimeBehaviorChanged, false)
  assert.equal(v07BugBurndownLedger.sourceBehaviorChanged, false)
  assert.equal(v07BugBurndownLedger.goSourceChanged, false)
  assert.equal(v07BugBurndownLedger.tmuxRuntimeChanged, false)
  assert.equal(v07BugBurndownLedger.nativeHelperRebuilt, false)
  assert.equal(v07BugBurndownLedger.nativePathRenamed, false)
  assert.equal(v07BugBurndownLedger.packageVersionChanged, false)
  assert.equal(v07BugBurndownLedger.npmPublished, false)
  assert.equal(v07BugBurndownLedger.tagCreated, false)
  assert.equal(v07BugBurndownLedger.githubReleaseCreated, false)
  assert.equal(v07BugBurndownLedger.releaseAssetsCreated, false)
  assert.equal(STATUS.includes('not-release-ready'), true)

  assert.ok(LEDGER_ROWS.length >= 10, 'ledger should include fixed/supporting/watch/deferred/governance rows')
  for (const row of LEDGER_ROWS) {
    assert.equal(Boolean(row.id), true, 'ledger row id required')
    assert.equal(Boolean(row.severity), true, `${row.id} severity required`)
    assert.equal(Boolean(row.status), true, `${row.id} status required`)
    assert.equal(Boolean(row.category), true, `${row.id} category required`)
    assert.ok(Array.isArray(row.evidence) && row.evidence.length > 0, `${row.id} evidence required`)
    assert.equal(Boolean(row.requiredNextAction), true, `${row.id} requiredNextAction required`)
    assert.equal(row.releaseReadyClaim, false, `${row.id} must not claim release readiness`)
  }
  const fixed = LEDGER_ROWS.find(row => row.id === 'tools-state-pane-health-host-snapshot-collision')
  assert.equal(fixed?.severity, 'P0')
  assert.equal(fixed?.status, 'fixed-accepted')
  assert.equal(fixed?.category, 'fixed-bug')
  assert.ok(fixed.evidence.includes(T046_FIX_FILE))
  assert.ok(fixed.evidence.includes(T046_FIX_COMMIT))
  assert.ok(VALIDATION_SNAPSHOT.some(item => item.command === 'npm test' && item.status === 'pass'))
  assert.ok(VALIDATION_SNAPSHOT.some(item => item.command === 'node tests/run.cjs tools-state' && item.status === 'pass'))
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  assert.equal(exists(root, V0690_DOC), true, `${V0690_DOC} should exist`)
  assert.equal(exists(root, V0691_DOC), true, `${V0691_DOC} should exist`)
  assert.equal(exists(root, V0692_DOC), true, `${V0692_DOC} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  const roadmapCheckpoint = roadmap.split('\n').find(line => line.includes('**v0.6.93 v0.7 bug burn-down ledger refresh**')) ?? ''
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoOverclaims(doc, DOC)
  assertNoOverclaims(roadmapCheckpoint, `${ROADMAP} v0.6.93 checkpoint`)
  assertIncludes(read(root, V0691_DOC), 'Slice status: `p95-refreshed-not-release-ready`', V0691_DOC)
  assertIncludes(read(root, V0692_DOC), 'Slice status: `manual-rc-operator-seam-refreshed-not-release-ready`', V0692_DOC)
  assertIncludes(read(root, T046_FIX_FILE), 'host tmux pane IDs cannot collide', T046_FIX_FILE)
  assertIncludes(read(root, T046_FIX_FILE), 'test tmux snapshot unavailable', T046_FIX_FILE)
  assert.equal(/"runId"\s*:|"commands"\s*:|"tools"\s*:|V0638_RC_FULL_TEXT_SENTINEL_DO_NOT_LEAK/i.test(doc), false, `${DOC} must not embed raw harness JSON or sentinels`)
}

function assertPackageAndReleaseGuards(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
  assert.equal(packageJson.optionalDependencies, undefined)
  assert.equal(packageJson.bundleDependencies, undefined)
  assert.equal(packageJson.bundledDependencies, undefined)
  assert.equal(packageJson.bin, undefined)
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish', 'prepack', 'postpack']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  for (const rel of EXPECTED_CHANGED_FILES) assert.equal(rel === '.gitignore' || rel.startsWith('docs/') || rel.startsWith('tests/'), true, `${rel} should be docs/tests/.gitignore scoped`)
}

function assertWorkerDeliveryAndGoBoundary(root) {
  const deliveryPolicy = read(root, DELIVERY_POLICY_FILE)
  const deliveryPolicyCode = sourceWithoutLineComments(deliveryPolicy)
  const goSource = read(root, GO_SOURCE_FILE)
  const kernelSource = read(root, KERNEL_FILE)
  assertIncludes(deliveryPolicy, "export type AgentTeamDeliveryPolicyName = 'bridge-only'", DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, "export const BRIDGE_ONLY_DELIVERY_POLICY: AgentTeamDeliveryPolicyName = 'bridge-only'", DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, 'export const DEFAULT_DELIVERY_POLICY: AgentTeamDeliveryPolicyName = BRIDGE_ONLY_DELIVERY_POLICY', DELIVERY_POLICY_FILE)
  for (const alias of ['terminal', 'tmux', 'legacy-terminal', 'send-keys', 'paste-buffer', 'runtimeWake']) {
    const literal = new RegExp(`['\"]${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]`)
    assert.equal(literal.test(deliveryPolicyCode), false, `${DELIVERY_POLICY_FILE} must not expose legacy policy literal ${alias}`)
  }
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  assert.deepEqual(parseGoWorkerLifecycleCases(goSource), [...ACTIVE_WORKER_LIFECYCLE_OPERATIONS])
  assert.equal(goSource.includes('send-keys'), false, `${GO_SOURCE_FILE} must not add send-keys`)
  assert.equal(goSource.includes('wakePane'), false, `${GO_SOURCE_FILE} must not add active wakePane operation`)
  assert.equal(/case "wakePane"/.test(goSource), false, `${GO_SOURCE_FILE} must not add wakePane case`)
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "send-keys"/.test(goSource), false, `${GO_SOURCE_FILE} must not execute send-keys`)
  assert.equal(kernelSource.includes('wakePane'), false, `${KERNEL_FILE} must not add TypeScript adapter wakePane method`)
  assert.equal(kernelSource.includes('send-keys'), false, `${KERNEL_FILE} must not construct send-keys commands`)
}

function assertNativeUnchanged(root) {
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  const provenance = JSON.parse(read(root, `${NATIVE_ROOT}/provenance.json`))
  assert.equal(manifest.packageVersion, PACKAGE_VERSION)
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(manifest.artifact.path, `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`)
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
  assert.equal(manifest.artifact.size, NATIVE_ARTIFACT_SNAPSHOT.helperSize)
  assert.equal(manifest.artifact.sha256, NATIVE_ARTIFACT_SNAPSHOT.helperSha256)
  assert.equal(manifest.source.revision, NATIVE_ARTIFACT_SNAPSHOT.sourceRevision)
  assert.equal(provenance.source.revision, NATIVE_ARTIFACT_SNAPSHOT.sourceRevision)
  for (const key of NATIVE_ARTIFACT_SNAPSHOT.forbiddenSmokeKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(manifest.smoke, key), false, `native manifest must not add ${key}`)
    assert.equal(Object.prototype.hasOwnProperty.call(provenance.smoke, key), false, `native provenance must not add ${key}`)
  }
  assert.equal(sha256(root, NATIVE_ARTIFACT_SNAPSHOT.helperPath), NATIVE_ARTIFACT_SNAPSHOT.helperSha256)
  assert.equal(sha256(root, `${NATIVE_ROOT}/manifest.json`), NATIVE_ARTIFACT_SNAPSHOT.manifestSha256)
  assert.equal(sha256(root, `${NATIVE_ROOT}/provenance.json`), NATIVE_ARTIFACT_SNAPSHOT.provenanceSha256)
  assert.equal(sha256(root, `${NATIVE_ROOT}/attestation.intoto.jsonl`), NATIVE_ARTIFACT_SNAPSHOT.attestationSha256)
  assert.equal(sha256(root, `${NATIVE_ROOT}/SHA256SUMS`), NATIVE_ARTIFACT_SNAPSHOT.checksumsSha256)
}

function assertNoRawArtifactsCheckedIn(root) {
  const forbiddenRaw = []
  const forbiddenArtifacts = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (rel.startsWith(APPROVED_NATIVE_PREFIX)) continue
    if (FORBIDDEN_RAW_FILE.test(rel)) forbiddenRaw.push(rel)
    if (FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
  }
  assert.deepEqual(forbiddenRaw.sort(), [], 'repo must not contain raw v0.7 bug burn-down evidence files')
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved release/archive/signing artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.93 v0.7 bug burn-down ledger',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertPackageAndReleaseGuards(root)
    assertWorkerDeliveryAndGoBoundary(root)
    assertNativeUnchanged(root)
    assertNoRawArtifactsCheckedIn(root)
  },
}
