const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_WORKER_LIFECYCLE_OPERATIONS,
  DELIVERY_POLICY_FILE,
  DOC,
  GO_SOURCE_FILE,
  KERNEL_FILE,
  NATIVE_ARTIFACT_SNAPSHOT,
  NATIVE_ROOT,
  NO_LEAK_CONCLUSIONS,
  P95_GATE_STATUS,
  P95_HARNESSES,
  PACKAGE_VERSION,
  RAW_ARTIFACT_NO_CHECKIN_POLICY,
  REFRESHED_GATE_IDS,
  RELEASE_TARGET,
  REMAINING_V07_GATES,
  ROADMAP,
  STATUS,
  STILL_UNAUTHORIZED,
  V0690_DOC,
  V07_CLEAN_TEMP_P95_REFRESH_SCHEMA_VERSION,
  V07_CLEAN_TEMP_P95_REFRESH_THEME,
  v07CleanTempP95Refresh,
} = require('../fixtures/kernel/v0691/v07CleanTempP95Refresh.cjs')

const FIXTURE = 'tests/fixtures/kernel/v0691/v07CleanTempP95Refresh.cjs'
const SUITE = 'tests/suites/go-kernel-v0691-v07-clean-temp-p95-refresh.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum', '.agentteam-artifacts']
const REQUIRED_DOC = [
  '# v0.6.91 v0.7 Clean-temp p95 Refresh',
  `Release target remains exactly: \`${RELEASE_TARGET}\``,
  `Slice status: \`${STATUS}\``,
  `p95 gate status: \`${P95_GATE_STATUS}\``,
  'Overall v0.7 status remains `not-release-ready`',
  '`package.json` remains `0.6.8`.',
  'No `--keep-home` or `--allow-non-empty-home` was passed.',
  'All selected harnesses passed and cleaned their own temp homes under `/tmp`.',
  'node scripts/verify-v0639-task-message-report-p95.cjs --out /tmp/pi-agentteam-v0691-task-message-report-p95.json',
  'node scripts/verify-v0641-fsstore-lock-wait-p95.cjs --out /tmp/pi-agentteam-v0691-fsstore-lock-wait-p95.json',
  'node scripts/verify-v0642-data-change-render-debounce.cjs --out /tmp/pi-agentteam-v0691-data-change-render-debounce.json',
  'node scripts/verify-v0642-spawn-bookkeeping-p95.cjs --out /tmp/pi-agentteam-v0691-spawn-bookkeeping-p95.json',
  '320b89ae1db4b230e0981d8cc69e597b50d742571a44408908a32c21bf5058f3',
  '4e8e50c41d24c2281126ad55dc2252c4b2e0078911d080c1b5b68448b12ab01a',
  '2c7e6e4bbc362af9e48847648930c7b69cb790e3295ba714c7cb7e8eeab9f588',
  '9c9473666ccc6a24fcc1b7e65eebe54a6dec818e528347f9272981d516466150',
  '`task-message-report-action-normal-p95` | pass | `29.725 ms` | `<= 50 ms`',
  '`task-message-report-action-large-mailbox-p95` | pass | `102.84 ms` | `<= 150 ms`',
  '`fsstore-lock-wait-p95` | pass | `10.63 ms` | `<= 25 ms`',
  '`data-change-render-debounce-rate` | pass | `2.985 renders/sec` | `<= 4 renders/sec`',
  '`spawn-bookkeeping-p95` | pass | `9.098 ms` | `<= 100 ms`',
  'clean-temp manual RC/operator evidence remains outstanding',
  'bug burn-down ledger remains outstanding',
  'release checklist/governance review remains outstanding',
  'evidence reconciliation remains outstanding',
  'continued no raw artifact policy remains in force',
  'Do not check in raw harness JSON output files, raw timing records, raw benchmark JSON, raw smoke logs, terminal logs, screenshots, full mailbox/report bodies, worker transcripts, state archives, secrets, raw hosted records, tarballs/temp homes.',
  'worker delivery remains bridge-only',
  'Go `send-keys` / active `wakePane` remain unauthorized',
  'state/task/PlanRun/mailbox/governance, team panel/UI, and release/package control-plane remain blocked',
  '`docs/perf/v0.6.90-v07-readiness-burndown-refresh.md`',
  '`tests/fixtures/kernel/v0691/v07CleanTempP95Refresh.cjs`',
  '`tests/suites/go-kernel-v0691-v07-clean-temp-p95-refresh.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.91 clean-temp v0.7 p95 evidence refresh',
  `\`${RELEASE_TARGET}\``,
  `status \`${STATUS}\``,
  `p95 gate \`${P95_GATE_STATUS}\``,
  'task-message-report normal p95 `29.725ms <= 50ms`',
  'large-mailbox p95 `102.84ms <= 150ms`',
  'fsStore lock-wait p95 `10.63ms <= 25ms`',
  'data-change render debounce `2.985 renders/sec <= 4`',
  'spawn bookkeeping p95 `9.098ms <= 100ms`',
  'manual RC/operator evidence, bug burn-down ledger, release checklist/governance review, and evidence reconciliation remain outstanding',
  'worker delivery remains bridge-only',
  'Go `send-keys` / active `wakePane` remain unauthorized',
  'docs/perf/v0.6.91-v07-clean-temp-p95-refresh.md',
  '**v0.6.91 clean-temp v0.7 p95 evidence refresh**',
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
  'manual RC passed',
  'manual RC completed',
  'bug burn-down complete',
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
const FORBIDDEN_RAW_FILE = /(?:^|\/)(?:.*raw.*(?:benchmark|p95|manual|rc|smoke|terminal|mailbox|report|transcript|state|hosted).*|.*(?:benchmark|p95|manual|rc|smoke|terminal|mailbox|report|transcript|state|hosted).*raw.*)\.(?:json|jsonl|log|txt|ndjson|tgz|tar|tar\.gz|zip|png|jpg|jpeg|gif|webp)$/i
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
  assert.deepEqual(JSON.parse(JSON.stringify(v07CleanTempP95Refresh)), v07CleanTempP95Refresh)
  assert.equal(v07CleanTempP95Refresh.schemaVersion, V07_CLEAN_TEMP_P95_REFRESH_SCHEMA_VERSION)
  assert.equal(v07CleanTempP95Refresh.theme, V07_CLEAN_TEMP_P95_REFRESH_THEME)
  assert.equal(v07CleanTempP95Refresh.releaseTarget, RELEASE_TARGET)
  assert.equal(v07CleanTempP95Refresh.packageVersion, PACKAGE_VERSION)
  assert.equal(v07CleanTempP95Refresh.status, STATUS)
  assert.equal(v07CleanTempP95Refresh.p95GateStatus, P95_GATE_STATUS)
  assert.equal(v07CleanTempP95Refresh.ready, false)
  assert.equal(v07CleanTempP95Refresh.releaseReadyClaim, false)
  assert.equal(v07CleanTempP95Refresh.p95RefreshGateAddressed, true)
  assert.equal(v07CleanTempP95Refresh.allSelectedHarnessesPassed, true)
  assert.equal(v07CleanTempP95Refresh.selectedHarnessCount, 4)
  assert.deepEqual(v07CleanTempP95Refresh.refreshedGateIds, [...REFRESHED_GATE_IDS])
  assert.deepEqual(v07CleanTempP95Refresh.remainingV07Gates, [...REMAINING_V07_GATES])
  assert.deepEqual(v07CleanTempP95Refresh.p95Harnesses, [...P95_HARNESSES])
  assert.deepEqual(v07CleanTempP95Refresh.rawArtifactNoCheckinPolicy, [...RAW_ARTIFACT_NO_CHECKIN_POLICY])
  assert.deepEqual(v07CleanTempP95Refresh.noLeakConclusions, NO_LEAK_CONCLUSIONS)
  assert.deepEqual(v07CleanTempP95Refresh.stillUnauthorized, [...STILL_UNAUTHORIZED])
  assert.equal(v07CleanTempP95Refresh.workerDeliveryBridgeOnly, true)
  assert.equal(v07CleanTempP95Refresh.goSendKeysAuthorized, false)
  assert.equal(v07CleanTempP95Refresh.activeWakePaneAuthorized, false)
  assert.equal(v07CleanTempP95Refresh.stateTaskMailboxGovernanceMigrated, false)
  assert.equal(v07CleanTempP95Refresh.teamPanelUiMigrated, false)
  assert.equal(v07CleanTempP95Refresh.releasePackageControlPlaneMigrated, false)
  assert.equal(v07CleanTempP95Refresh.runtimeBehaviorChanged, false)
  assert.equal(v07CleanTempP95Refresh.sourceBehaviorChanged, false)
  assert.equal(v07CleanTempP95Refresh.goSourceChanged, false)
  assert.equal(v07CleanTempP95Refresh.tmuxRuntimeChanged, false)
  assert.equal(v07CleanTempP95Refresh.nativeHelperRebuilt, false)
  assert.equal(v07CleanTempP95Refresh.nativePathRenamed, false)
  assert.equal(v07CleanTempP95Refresh.packageVersionChanged, false)
  assert.equal(v07CleanTempP95Refresh.npmPublished, false)
  assert.equal(v07CleanTempP95Refresh.tagCreated, false)
  assert.equal(v07CleanTempP95Refresh.githubReleaseCreated, false)
  assert.equal(v07CleanTempP95Refresh.releaseAssetsCreated, false)
  assert.equal(STATUS.includes('not-release-ready'), true)

  const allGates = P95_HARNESSES.flatMap(harness => harness.gates)
  assert.deepEqual(allGates.map(gate => gate.id), [...REFRESHED_GATE_IDS])
  for (const harness of P95_HARNESSES) {
    assert.equal(harness.status, 'passed')
    assert.equal(harness.ok, true)
    assert.equal(harness.p95Status, 'pass')
    assert.equal(harness.outputPath.startsWith('/tmp/pi-agentteam-v0691-'), true)
    assert.match(harness.outputSha256, /^[a-f0-9]{64}$/)
    assert.equal(harness.tempHomePrefix.startsWith('/tmp/pi-agentteam-v0'), true)
    assert.equal(harness.cleanupRequested, true)
    assert.equal(harness.cleanupResult, 'removed')
    assert.equal(harness.tempHomeExistsAfterCleanup, false)
    assert.equal(harness.keepHomePassed, false)
    assert.equal(harness.allowNonEmptyHomePassed, false)
    assert.equal(harness.rawJsonCheckedIn, false)
    assert.equal(harness.noLeakStatus, 'pass')
    for (const gate of harness.gates) {
      assert.equal(gate.status, 'pass')
      assert.equal(typeof gate.observed, 'number')
      assert.equal(gate.observed <= gate.threshold, true, `${gate.id} should be within threshold`)
    }
  }
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  assert.equal(exists(root, V0690_DOC), true, `${V0690_DOC} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  const roadmapCheckpoint = roadmap.split('\n').find(line => line.includes('**v0.6.91 clean-temp v0.7 p95 evidence refresh**')) ?? ''
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoOverclaims(doc, DOC)
  assertNoOverclaims(roadmapCheckpoint, `${ROADMAP} v0.6.91 checkpoint`)
  assertIncludes(read(root, V0690_DOC), 'Current status: `not-release-ready`', V0690_DOC)
  assertIncludes(read(root, V0690_DOC), 'v0.7.0 remains not release-ready', V0690_DOC)
  assert.equal(/"records"\s*:|"profileSummary"\s*:|"runId"\s*:|"rawOutput"\s*:/i.test(doc), false, `${DOC} must not embed raw harness JSON`)
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
}

function assertWorkerDeliveryAndGoBoundary(root) {
  const deliveryPolicy = read(root, DELIVERY_POLICY_FILE)
  const deliveryPolicyCode = sourceWithoutLineComments(deliveryPolicy)
  const goSource = read(root, GO_SOURCE_FILE)
  const kernelSource = read(root, KERNEL_FILE)
  assertIncludes(deliveryPolicy, "export type AgentTeamDeliveryPolicyName = 'bridge-only'", DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, "export const BRIDGE_ONLY_DELIVERY_POLICY: AgentTeamDeliveryPolicyName = 'bridge-only'", DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, 'export const DEFAULT_DELIVERY_POLICY: AgentTeamDeliveryPolicyName = BRIDGE_ONLY_DELIVERY_POLICY', DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, 'they do not reintroduce legacy terminal/tmux delivery modes', DELIVERY_POLICY_FILE)
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
  assert.deepEqual(forbiddenRaw.sort(), [], 'repo must not contain raw v0.7 p95 evidence files')
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved release/archive/signing artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.91 v0.7 clean-temp p95 refresh',
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
