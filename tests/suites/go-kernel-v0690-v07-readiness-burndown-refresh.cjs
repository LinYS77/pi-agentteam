const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACCEPTED_RECENT_CHECKPOINTS,
  ACTIVE_CAPABILITIES,
  ACTIVE_WORKER_LIFECYCLE_OPERATIONS,
  BLOCKED_WITHOUT_FUTURE_DESIGN_GATES,
  CURRENT_STATE,
  DELIVERY_POLICY_FILE,
  DOC,
  GO_SOURCE_FILE,
  HELPER_VERSION,
  KERNEL_FILE,
  NATIVE_ARTIFACT_SNAPSHOT,
  NATIVE_ROOT,
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  RAW_ARTIFACT_NO_CHECKIN_POLICY,
  RELEASE_PACKAGE_GUARDS,
  RELEASE_TARGET,
  REMAINING_V07_GATES,
  ROADMAP,
  STATUS,
  STILL_UNAUTHORIZED,
  V0688_DOC,
  V0689_DOC,
  V07_READINESS_BURNDOWN_REFRESH_SCHEMA_VERSION,
  V07_READINESS_BURNDOWN_REFRESH_THEME,
  v07ReadinessBurndownRefresh,
} = require('../fixtures/kernel/v0690/v07ReadinessBurndownRefresh.cjs')

const FIXTURE = 'tests/fixtures/kernel/v0690/v07ReadinessBurndownRefresh.cjs'
const SUITE = 'tests/suites/go-kernel-v0690-v07-readiness-burndown-refresh.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.90 v0.7 Readiness Burn-down Refresh',
  `Release target remains exactly: \`${RELEASE_TARGET}\``,
  'Current status: `not-release-ready`.',
  'v0.7.0 remains not release-ready',
  '`package.json` remains `0.6.8`.',
  'v0.6.88 `clearPaneLabelSync` cutover is accepted',
  'v0.6.89 worker delivery boundary is accepted',
  'worker delivery remains bridge-only TypeScript-owned outbox/bridge orchestration',
  'Go `send-keys` / active `wakePane` remain unauthorized',
  'TypeScript/pi remains facade/compliance boundary; Go owns only explicit helper/kernel slices.',
  'Clean-temp `PI_AGENTTEAM_HOME` p95 evidence refresh',
  'Clean-temp manual RC/operator evidence',
  'Bug burn-down ledger: P0/P1/P2 or equivalent, with deferred/non-goal classification',
  'Release checklist and governance review',
  'Evidence reconciliation so docs/tests/roadmap/actual behavior agree',
  'No raw artifact check-ins',
  'No raw p95/manual RC run is performed in this slice',
  'Do not check in raw benchmark JSON, raw smoke logs, terminal logs, screenshots, raw mailbox/report bodies, worker transcripts, state archives, secrets, raw hosted records, tarballs, or raw p95/manual RC output.',
  'state/task/PlanRun/mailbox/governance, team panel/UI, and release/package control-plane remain blocked without future design gates',
  '`docs/perf/v0.6.88-go-clear-pane-label-sync-cutover.md`',
  '`docs/perf/v0.6.89-go-worker-delivery-boundary-gate.md`',
  '`tests/fixtures/kernel/v0690/v07ReadinessBurndownRefresh.cjs`',
  '`tests/suites/go-kernel-v0690-v07-readiness-burndown-refresh.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.90 v0.7 readiness burn-down refresh',
  `\`${RELEASE_TARGET}\``,
  'accepted head includes v0.6.88 `clearPaneLabelSync` cutover and v0.6.89 bridge-only worker delivery boundary gate',
  'current status remains `not-release-ready`',
  'clean-temp `PI_AGENTTEAM_HOME` p95 evidence refresh',
  'clean-temp manual RC/operator evidence',
  'bug burn-down ledger',
  'release checklist/governance review',
  'evidence reconciliation',
  'no raw artifact check-ins',
  'worker delivery remains bridge-only',
  'Go `send-keys` / active `wakePane` remain unauthorized',
  'docs/perf/v0.6.90-v07-readiness-burndown-refresh.md',
  '**v0.6.90 v0.7 readiness burn-down refresh**',
]
const FORBIDDEN_OVERCLAIMS = [
  'ready:true',
  'releaseReadyClaim: true',
  'status: release-ready',
  'status: `release-ready`',
  'v0.7.0 is release-ready',
  'v0.7 is release-ready',
  'v0.7.0 release-ready approval is granted',
  'release can ship',
  'ready for release',
  'GO for release',
  'GO to release',
  'v0.7 shipped',
  'v0.7.0 shipped',
  'npm publish completed',
  'npm version completed',
  'tag pushed',
  'tag was pushed',
  'tag was created',
  'GitHub release created',
  'release assets uploaded',
  'default publish approved',
  'manual RC passed in this slice',
  'fresh p95 run passed in this slice',
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
  assert.deepEqual(JSON.parse(JSON.stringify(v07ReadinessBurndownRefresh)), v07ReadinessBurndownRefresh)
  assert.equal(v07ReadinessBurndownRefresh.schemaVersion, V07_READINESS_BURNDOWN_REFRESH_SCHEMA_VERSION)
  assert.equal(v07ReadinessBurndownRefresh.theme, V07_READINESS_BURNDOWN_REFRESH_THEME)
  assert.equal(v07ReadinessBurndownRefresh.releaseTarget, RELEASE_TARGET)
  assert.equal(v07ReadinessBurndownRefresh.packageVersion, PACKAGE_VERSION)
  assert.equal(v07ReadinessBurndownRefresh.helperVersion, HELPER_VERSION)
  assert.equal(v07ReadinessBurndownRefresh.protocolVersion, PROTOCOL_VERSION)
  assert.equal(v07ReadinessBurndownRefresh.status, STATUS)
  assert.equal(v07ReadinessBurndownRefresh.ready, false)
  assert.equal(v07ReadinessBurndownRefresh.releaseReadyClaim, false)
  assert.equal(v07ReadinessBurndownRefresh.docsTestsOnly, true)
  assert.equal(v07ReadinessBurndownRefresh.runtimeBehaviorChanged, false)
  assert.equal(v07ReadinessBurndownRefresh.sourceBehaviorChanged, false)
  assert.equal(v07ReadinessBurndownRefresh.goSourceChanged, false)
  assert.equal(v07ReadinessBurndownRefresh.tmuxRuntimeChanged, false)
  assert.equal(v07ReadinessBurndownRefresh.nativeHelperRebuilt, false)
  assert.equal(v07ReadinessBurndownRefresh.nativePathRenamed, false)
  assert.equal(v07ReadinessBurndownRefresh.packageVersionChanged, false)
  assert.equal(v07ReadinessBurndownRefresh.npmPublished, false)
  assert.equal(v07ReadinessBurndownRefresh.tagCreated, false)
  assert.equal(v07ReadinessBurndownRefresh.githubReleaseCreated, false)
  assert.equal(v07ReadinessBurndownRefresh.releaseAssetsCreated, false)
  assert.equal(v07ReadinessBurndownRefresh.rawArtifactsCheckedIn, false)
  assert.equal(v07ReadinessBurndownRefresh.manualRcRunPerformed, false)
  assert.equal(v07ReadinessBurndownRefresh.p95RunPerformed, false)
  assert.equal(v07ReadinessBurndownRefresh.workerDeliveryBridgeOnly, true)
  assert.equal(v07ReadinessBurndownRefresh.goSendKeysAuthorized, false)
  assert.equal(v07ReadinessBurndownRefresh.activeWakePaneAuthorized, false)
  assert.equal(v07ReadinessBurndownRefresh.terminalDeliveryAuthorized, false)
  assert.equal(v07ReadinessBurndownRefresh.stateTaskMailboxGovernanceMigrated, false)
  assert.equal(v07ReadinessBurndownRefresh.teamPanelUiMigrated, false)
  assert.equal(v07ReadinessBurndownRefresh.releasePackageControlPlaneMigrated, false)
  assert.equal(v07ReadinessBurndownRefresh.defaultResolverPackageNativeChanged, false)
  assert.deepEqual(v07ReadinessBurndownRefresh.acceptedRecentCheckpoints, [...ACCEPTED_RECENT_CHECKPOINTS])
  assert.deepEqual(v07ReadinessBurndownRefresh.currentState, CURRENT_STATE)
  assert.deepEqual(v07ReadinessBurndownRefresh.remainingV07Gates, [...REMAINING_V07_GATES])
  assert.deepEqual(v07ReadinessBurndownRefresh.rawArtifactNoCheckinPolicy, [...RAW_ARTIFACT_NO_CHECKIN_POLICY])
  assert.deepEqual(v07ReadinessBurndownRefresh.stillUnauthorized, [...STILL_UNAUTHORIZED])
  assert.deepEqual(v07ReadinessBurndownRefresh.blockedWithoutFutureDesignGates, [...BLOCKED_WITHOUT_FUTURE_DESIGN_GATES])
  assert.deepEqual(v07ReadinessBurndownRefresh.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(v07ReadinessBurndownRefresh.activeWorkerLifecycleOperations, [...ACTIVE_WORKER_LIFECYCLE_OPERATIONS])
  assert.deepEqual(v07ReadinessBurndownRefresh.nativeArtifactSnapshot, NATIVE_ARTIFACT_SNAPSHOT)
  assert.deepEqual(v07ReadinessBurndownRefresh.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.equal(STATUS.includes('not-release-ready'), true)
  assert.equal(REMAINING_V07_GATES.length, 6)
  assert.equal(ACCEPTED_RECENT_CHECKPOINTS.map(item => item.doc).includes(V0688_DOC), true)
  assert.equal(ACCEPTED_RECENT_CHECKPOINTS.map(item => item.doc).includes(V0689_DOC), true)
  assert.equal(ACTIVE_WORKER_LIFECYCLE_OPERATIONS.includes('wakePane'), false)
  assert.equal(STILL_UNAUTHORIZED.includes('Go send-keys'), true)
  assert.equal(STILL_UNAUTHORIZED.includes('active Go wakePane'), true)
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  assert.equal(exists(root, V0688_DOC), true, `${V0688_DOC} should exist`)
  assert.equal(exists(root, V0689_DOC), true, `${V0689_DOC} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  const roadmapCheckpoint = roadmap.split('\n').find(line => line.includes('**v0.6.90 v0.7 readiness burn-down refresh**')) ?? ''
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoOverclaims(doc, DOC)
  assertNoOverclaims(roadmapCheckpoint, `${ROADMAP} v0.6.90 checkpoint`)
  assertIncludes(doc, STATUS, DOC)
  assertIncludes(roadmapCheckpoint, STATUS, `${ROADMAP} v0.6.90 checkpoint`)
  assert.equal(/"records"\s*:|"profileSummary"\s*:|"runId"\s*:|"rawOutput"\s*:/i.test(doc), false, `${DOC} must not embed raw timing/manual JSON`)
  assert.equal(/manual RC passed|fresh p95 pass|p95 passed/i.test(doc), false, `${DOC} must not claim new p95/manual RC pass`)
}

function assertAcceptedCheckpointReferences(root) {
  const v0688 = read(root, V0688_DOC)
  const v0689 = read(root, V0689_DOC)
  assertIncludes(v0688, '# v0.6.88 Go clearPaneLabelSync Cutover', V0688_DOC)
  assertIncludes(v0688, 'Result: v0.6.88 cuts over only `tmux/panes.ts clearPaneLabelSync(paneId)`', V0688_DOC)
  assertIncludes(v0689, '# v0.6.89 Go Worker Delivery Boundary Gate', V0689_DOC)
  assertIncludes(v0689, 'AgentTeam worker delivery is bridge-only TypeScript-owned outbox/bridge orchestration, not legacy terminal/tmux `send-keys` delivery.', V0689_DOC)
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
  assert.equal(manifest.helperVersion, HELPER_VERSION)
  assert.equal(manifest.protocolVersion, PROTOCOL_VERSION)
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
  assert.deepEqual(forbiddenRaw.sort(), [], 'repo must not contain raw v0.7 readiness evidence files')
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved release/archive/signing artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.90 v0.7 readiness burn-down refresh',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertAcceptedCheckpointReferences(root)
    assertPackageAndReleaseGuards(root)
    assertWorkerDeliveryAndGoBoundary(root)
    assertNativeUnchanged(root)
    assertNoRawArtifactsCheckedIn(root)
  },
}
