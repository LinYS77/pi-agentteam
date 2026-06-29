const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACCEPTED_PRIOR_GATES,
  ACTIVE_CAPABILITIES,
  ACTIVE_WORKER_LIFECYCLE_OPERATIONS,
  DELIVERY_POLICY_FILE,
  DOC,
  EXPECTED_CHANGED_FILES,
  GO_SOURCE_FILE,
  KERNEL_FILE,
  MANUAL_RC_GATE_STATUS,
  MANUAL_RC_HARNESS,
  NATIVE_ARTIFACT_SNAPSHOT,
  NATIVE_ROOT,
  NO_LEAK_CONCLUSIONS,
  PACKAGE_VERSION,
  RAW_ARTIFACT_NO_CHECKIN_POLICY,
  REFRESHED_GATE_IDS,
  RELEASE_TARGET,
  REMAINING_V07_GATES,
  ROADMAP,
  STATUS,
  STILL_UNAUTHORIZED,
  T046_FIX_FILE,
  V0690_DOC,
  V0691_DOC,
  V07_CLEAN_TEMP_MANUAL_RC_REFRESH_SCHEMA_VERSION,
  V07_CLEAN_TEMP_MANUAL_RC_REFRESH_THEME,
  v07CleanTempManualRcRefresh,
} = require('../fixtures/kernel/v0692/v07CleanTempManualRcRefresh.cjs')

const FIXTURE = 'tests/fixtures/kernel/v0692/v07CleanTempManualRcRefresh.cjs'
const SUITE = 'tests/suites/go-kernel-v0692-v07-clean-temp-manual-rc-refresh.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum', '.agentteam-artifacts']
const REQUIRED_DOC = [
  '# v0.6.92 v0.7 Clean-temp Manual RC / Operator-seam Refresh',
  `Release target remains exactly: \`${RELEASE_TARGET}\``,
  `Slice status: \`${STATUS}\``,
  `manual RC/operator-seam gate status: \`${MANUAL_RC_GATE_STATUS}\``,
  'Overall v0.7 status remains `not-release-ready`',
  '`package.json` remains `0.6.8`.',
  'No `--keep-home` or `--allow-non-empty-home` was passed.',
  'This slice did not perform a true interactive pi/TUI/operator/model pass.',
  'deterministic temp-home RC harness with stubbed pi/tmux and real registered `/team config` + `agentteam_*` tool seams',
  'node scripts/verify-v0638-temp-home-rc-harness.cjs --out /tmp/pi-agentteam-v0692-temp-home-rc.json',
  'db96d1153fcae7e46cfb38511a34f9ab9cdbd23bfbbd655d4c2a6f85a264c51f',
  '`/tmp/pi-agentteam-v0638-rc-harness.`',
  '`cleanupResult=removed`',
  '`safePrefix=true`',
  '`underRepo=false`',
  '`liveHomeEnvRestored=true`',
  '`autoBridgeEnvRestored=true`',
  '`team config show`',
  '`team config init`',
  '`team config validate`',
  '`team config migrate --dry-run`',
  '`unsafe-name-rejection` | pass',
  '`worker-receive-boundary` | pass',
  '`report-done-report-only` | pass',
  '`leader-receive-report-attention` | pass',
  '`report-blocked-report-only` | pass',
  '`team-panel-compact-model` | pass',
  '`legacy-teams-dash-absent` | pass',
  '`release-governance-absence` | pass',
  'real `/team` TUI observation remains an operator procedure',
  'real model/provider worker execution was not performed',
  'v0.6.91 clean-temp p95 refresh is accepted',
  'T046 tools-state pane-health blocker fix is accepted',
  '`docs/perf/v0.6.91-v07-clean-temp-p95-refresh.md`',
  '`tests/suites/tools-state.cjs`',
  'bug burn-down ledger remains outstanding',
  'release checklist/governance review remains outstanding',
  'evidence reconciliation remains outstanding',
  'continued no raw artifact policy remains in force',
  'Do not check in raw harness JSON output files, raw logs, raw timing records, raw smoke output, terminal logs, screenshots, full mailbox/report bodies, worker transcripts, state archives, secrets, raw hosted records, tarballs/temp homes.',
  'worker delivery remains bridge-only',
  'Go `send-keys` / active `wakePane` remain unauthorized',
  'state/task/PlanRun/mailbox/governance, team panel/UI, and release/package control-plane remain blocked',
  '`tests/fixtures/kernel/v0692/v07CleanTempManualRcRefresh.cjs`',
  '`tests/suites/go-kernel-v0692-v07-clean-temp-manual-rc-refresh.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.92 clean-temp manual RC/operator-seam evidence refresh',
  `\`${RELEASE_TARGET}\``,
  `status \`${STATUS}\``,
  `manual RC/operator-seam gate \`${MANUAL_RC_GATE_STATUS}\``,
  'temp-home RC harness `passed`',
  'output SHA256 `db96d1153fcae7e46cfb38511a34f9ab9cdbd23bfbbd655d4c2a6f85a264c51f`',
  '4 `/team config` command seams',
  '21 `agentteam_*` tool seams',
  '8 checks passed',
  'true interactive pi/TUI/operator/model pass was not performed',
  'bug burn-down ledger, release checklist/governance review, and evidence reconciliation remain outstanding',
  'v0.6.91 clean-temp p95 refresh is accepted',
  'T046 tools-state blocker fix is accepted',
  'worker delivery remains bridge-only',
  'Go `send-keys` / active `wakePane` remain unauthorized',
  'docs/perf/v0.6.92-v07-clean-temp-manual-rc-refresh.md',
  '**v0.6.92 clean-temp manual RC/operator-seam evidence refresh**',
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
  'bug burn-down complete',
  'release checklist complete',
  'evidence reconciliation complete',
  'true interactive pi/TUI/operator pass completed',
  'true interactive operator pass completed',
  'real model/provider worker execution passed',
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
  assert.deepEqual(JSON.parse(JSON.stringify(v07CleanTempManualRcRefresh)), v07CleanTempManualRcRefresh)
  assert.equal(v07CleanTempManualRcRefresh.schemaVersion, V07_CLEAN_TEMP_MANUAL_RC_REFRESH_SCHEMA_VERSION)
  assert.equal(v07CleanTempManualRcRefresh.theme, V07_CLEAN_TEMP_MANUAL_RC_REFRESH_THEME)
  assert.equal(v07CleanTempManualRcRefresh.releaseTarget, RELEASE_TARGET)
  assert.equal(v07CleanTempManualRcRefresh.packageVersion, PACKAGE_VERSION)
  assert.equal(v07CleanTempManualRcRefresh.status, STATUS)
  assert.equal(v07CleanTempManualRcRefresh.manualRcGateStatus, MANUAL_RC_GATE_STATUS)
  assert.equal(v07CleanTempManualRcRefresh.ready, false)
  assert.equal(v07CleanTempManualRcRefresh.releaseReadyClaim, false)
  assert.equal(v07CleanTempManualRcRefresh.manualRcOperatorSeamGateAddressed, true)
  assert.equal(v07CleanTempManualRcRefresh.trueInteractivePiTuiOperatorPassPerformed, false)
  assert.equal(v07CleanTempManualRcRefresh.allSelectedHarnessesPassed, true)
  assert.equal(v07CleanTempManualRcRefresh.selectedHarnessCount, 1)
  assert.deepEqual(v07CleanTempManualRcRefresh.refreshedGateIds, [...REFRESHED_GATE_IDS])
  assert.deepEqual(v07CleanTempManualRcRefresh.acceptedPriorGates, [...ACCEPTED_PRIOR_GATES])
  assert.deepEqual(v07CleanTempManualRcRefresh.remainingV07Gates, [...REMAINING_V07_GATES])
  assert.deepEqual(v07CleanTempManualRcRefresh.manualRcHarness, MANUAL_RC_HARNESS)
  assert.deepEqual(v07CleanTempManualRcRefresh.rawArtifactNoCheckinPolicy, [...RAW_ARTIFACT_NO_CHECKIN_POLICY])
  assert.deepEqual(v07CleanTempManualRcRefresh.noLeakConclusions, NO_LEAK_CONCLUSIONS)
  assert.deepEqual(v07CleanTempManualRcRefresh.stillUnauthorized, [...STILL_UNAUTHORIZED])
  assert.deepEqual(v07CleanTempManualRcRefresh.expectedChangedFiles, [...EXPECTED_CHANGED_FILES])
  assert.equal(v07CleanTempManualRcRefresh.workerDeliveryBridgeOnly, true)
  assert.equal(v07CleanTempManualRcRefresh.goSendKeysAuthorized, false)
  assert.equal(v07CleanTempManualRcRefresh.activeWakePaneAuthorized, false)
  assert.equal(v07CleanTempManualRcRefresh.stateTaskPlanRunMailboxGovernanceMigrated, false)
  assert.equal(v07CleanTempManualRcRefresh.teamPanelUiMigrated, false)
  assert.equal(v07CleanTempManualRcRefresh.releasePackageControlPlaneMigrated, false)
  assert.equal(v07CleanTempManualRcRefresh.runtimeBehaviorChanged, false)
  assert.equal(v07CleanTempManualRcRefresh.sourceBehaviorChanged, false)
  assert.equal(v07CleanTempManualRcRefresh.goSourceChanged, false)
  assert.equal(v07CleanTempManualRcRefresh.tmuxRuntimeChanged, false)
  assert.equal(v07CleanTempManualRcRefresh.nativeHelperRebuilt, false)
  assert.equal(v07CleanTempManualRcRefresh.nativePathRenamed, false)
  assert.equal(v07CleanTempManualRcRefresh.packageVersionChanged, false)
  assert.equal(v07CleanTempManualRcRefresh.npmPublished, false)
  assert.equal(v07CleanTempManualRcRefresh.tagCreated, false)
  assert.equal(v07CleanTempManualRcRefresh.githubReleaseCreated, false)
  assert.equal(v07CleanTempManualRcRefresh.releaseAssetsCreated, false)
  assert.equal(STATUS.includes('not-release-ready'), true)

  const harness = MANUAL_RC_HARNESS
  assert.equal(harness.status, 'passed')
  assert.equal(harness.ok, true)
  assert.equal(harness.outputPath, '/tmp/pi-agentteam-v0692-temp-home-rc.json')
  assert.match(harness.outputSha256, /^[a-f0-9]{64}$/)
  assert.equal(harness.tempHomePrefix, '/tmp/pi-agentteam-v0638-rc-harness.')
  assert.equal(harness.cleanupRequested, true)
  assert.equal(harness.cleanupResult, 'removed')
  assert.equal(harness.tempHomeExistsAfterCleanup, false)
  assert.equal(harness.keepHomePassed, false)
  assert.equal(harness.allowNonEmptyHomePassed, false)
  assert.equal(harness.rawJsonCheckedIn, false)
  assert.equal(harness.noLeakStatus, 'pass')
  assert.equal(harness.trueInteractivePiTuiOperatorPassPerformed, false)
  assert.equal(harness.realModelProviderWorkerExecutionPerformed, false)
  assert.equal(harness.commandCount, harness.commands.length)
  assert.equal(harness.toolCount, harness.toolSeams.length)
  assert.equal(harness.checkCount, harness.checks.length)
  assert.equal(harness.spawnedPaneCount, 1)
  assert.equal(harness.killedPaneCount, 0)
  for (const check of harness.checks) assert.equal(check.status, 'pass', `${check.id} should pass`)
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  assert.equal(exists(root, V0690_DOC), true, `${V0690_DOC} should exist`)
  assert.equal(exists(root, V0691_DOC), true, `${V0691_DOC} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  const roadmapCheckpoint = roadmap.split('\n').find(line => line.includes('**v0.6.92 clean-temp manual RC/operator-seam evidence refresh**')) ?? ''
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoOverclaims(doc, DOC)
  assertNoOverclaims(roadmapCheckpoint, `${ROADMAP} v0.6.92 checkpoint`)
  assertIncludes(read(root, V0690_DOC), 'Current status: `not-release-ready`', V0690_DOC)
  assertIncludes(read(root, V0691_DOC), 'Slice status: `p95-refreshed-not-release-ready`', V0691_DOC)
  assertIncludes(read(root, V0691_DOC), 'p95 gate status: `refreshed-pass`', V0691_DOC)
  assertIncludes(read(root, T046_FIX_FILE), 'host tmux pane IDs cannot collide', T046_FIX_FILE)
  assertIncludes(read(root, T046_FIX_FILE), 'test tmux snapshot unavailable', T046_FIX_FILE)
  assert.equal(/"runId"\s*:|"commands"\s*:|"tools"\s*:|"homeFilesBeforeCleanup"\s*:|V0638_RC_FULL_TEXT_SENTINEL_DO_NOT_LEAK/i.test(doc), false, `${DOC} must not embed raw harness JSON or sentinels`)
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
  assert.deepEqual(forbiddenRaw.sort(), [], 'repo must not contain raw v0.7 manual RC evidence files')
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved release/archive/signing artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.92 v0.7 clean-temp manual RC refresh',
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
