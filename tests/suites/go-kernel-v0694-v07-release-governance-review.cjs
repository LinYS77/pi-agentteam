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
  GOVERNANCE_CHECKLIST_ROWS,
  GOVERNANCE_GATE_STATUS,
  KERNEL_FILE,
  NATIVE_ARTIFACT_SNAPSHOT,
  NATIVE_ROOT,
  NO_LEAK_CONCLUSIONS,
  PACKAGE_FILE,
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
  V0693_DOC,
  V07_RELEASE_GOVERNANCE_REVIEW_SCHEMA_VERSION,
  V07_RELEASE_GOVERNANCE_REVIEW_THEME,
  v07ReleaseGovernanceReview,
} = require('../fixtures/kernel/v0694/v07ReleaseGovernanceReview.cjs')

const FIXTURE = 'tests/fixtures/kernel/v0694/v07ReleaseGovernanceReview.cjs'
const SUITE = 'tests/suites/go-kernel-v0694-v07-release-governance-review.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum', '.agentteam-artifacts']
const REQUIRED_DOC = [
  '# v0.6.94 v0.7 Release Checklist / Governance Review',
  `Release target remains exactly: \`${RELEASE_TARGET}\``,
  `Slice status: \`${STATUS}\``,
  `governance gate status: \`${GOVERNANCE_GATE_STATUS}\``,
  'Overall v0.7 status remains `not-release-ready`',
  '`package.json` remains `0.6.8`.',
  'This is a docs/tests/readiness-governance slice, not release mechanics.',
  'No release/package action is authorized or performed.',
  'no `npm version`',
  'no `npm publish`',
  'no tag creation/push',
  'no GitHub release/assets',
  'no release asset upload',
  'no signing/cosign/SLSA/security attestation',
  'no package source approval',
  'no package metadata/lifecycle hook/optional native dependency/native dependency/postinstall/download/runtime build flow',
  'no release/package control-plane migration',
  'current embedded helper path remains `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/`',
  'no native helper path/binary rename',
  'no second platform claim',
  'no default resolver/default Go expansion beyond already accepted explicit cutovers',
  'no hidden TypeScript tmux fallback reintroduction',
  'True interactive pi/TUI/operator/model pass was not performed in v0.6.92',
  'deferred/manual operator procedure and not a current blocker for this v0.7 readiness track',
  'worker delivery remains bridge-only',
  'Go `send-keys` / active `wakePane` remain unauthorized',
  'Mutating lifecycle/state/task/PlanRun/mailbox/governance/team panel/UI/release control-plane migrations remain deferred/blocked unless separately gated',
  'evidence reconciliation remains outstanding',
  'continued no raw artifact policy remains in force',
  '`docs/perf/v0.6.91-v07-clean-temp-p95-refresh.md`',
  '`docs/perf/v0.6.92-v07-clean-temp-manual-rc-refresh.md`',
  '`docs/perf/v0.6.93-v07-bug-burndown-ledger.md`',
  '`tests/suites/tools-state.cjs`',
  '`e423179 Isolate tools-state tmux snapshot fixture`',
  '`package-version-npm`',
  '`git-tag-github-release-assets`',
  '`release-ownership-approval`',
  '`rollback-policy`',
  '`native-helper-default-resolver-platform`',
  '`security-signing-attestation`',
  '`true-interactive-operator-coverage`',
  '`raw-artifact-policy`',
  '`evidence-reconciliation`',
  '`bridge-only-worker-delivery`',
  '`deferred-runtime-migrations`',
  'Every checklist row has `releaseActionAuthorized=false` and `releaseActionPerformed=false` in the machine-readable fixture.',
  'Do not check in raw logs, validation output, transcripts, state archives, screenshots, temp homes, raw hosted records, release artifacts, tarballs, signatures, or raw JSON.',
  '`tests/fixtures/kernel/v0694/v07ReleaseGovernanceReview.cjs`',
  '`tests/suites/go-kernel-v0694-v07-release-governance-review.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.94 v0.7 release checklist/governance review',
  `\`${RELEASE_TARGET}\``,
  `status \`${STATUS}\``,
  `governance gate \`${GOVERNANCE_GATE_STATUS}\``,
  '`package.json` stays `0.6.8`',
  'no `npm version` / `npm publish` / tags / GitHub releases/assets',
  'no signing/cosign/SLSA/security attestation',
  'current embedded helper path remains `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/`',
  'true interactive pi/TUI/operator/model pass remains a deferred/manual operator procedure and not a current blocker',
  'evidence reconciliation remains outstanding',
  'continued no raw artifact policy remains in force',
  'v0.6.91 p95, v0.6.92 operator-seam RC, v0.6.93 bug ledger, and T046 fix are accepted',
  'worker delivery remains bridge-only',
  'Go `send-keys` / active `wakePane` remain unauthorized',
  'docs/perf/v0.6.94-v07-release-governance-review.md',
  '**v0.6.94 v0.7 release checklist/governance review**',
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
  'evidence reconciliation complete',
  'npm publish completed',
  'npm version completed',
  'tag pushed',
  'tag was pushed',
  'tag was created',
  'GitHub release created',
  'release assets uploaded',
  'signing completed',
  'package source approved',
  'default resolver expanded',
  'default Go expanded',
  'true interactive pi/TUI/operator/model pass completed',
  'true interactive operator pass completed',
]
const FORBIDDEN_RAW_FILE = /(?:^|\/)(?:.*raw.*(?:benchmark|p95|manual|rc|smoke|terminal|mailbox|report|transcript|state|hosted|validation|release).*|.*(?:benchmark|p95|manual|rc|smoke|terminal|mailbox|report|transcript|state|hosted|validation|release).*raw.*)\.(?:json|jsonl|log|txt|ndjson|tgz|tar|tar\.gz|zip|png|jpg|jpeg|gif|webp)$/i
const FORBIDDEN_ARTIFACT = /\.(?:tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig|asc|spdx|sbom)$/i
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
  assert.deepEqual(JSON.parse(JSON.stringify(v07ReleaseGovernanceReview)), v07ReleaseGovernanceReview)
  assert.equal(v07ReleaseGovernanceReview.schemaVersion, V07_RELEASE_GOVERNANCE_REVIEW_SCHEMA_VERSION)
  assert.equal(v07ReleaseGovernanceReview.theme, V07_RELEASE_GOVERNANCE_REVIEW_THEME)
  assert.equal(v07ReleaseGovernanceReview.releaseTarget, RELEASE_TARGET)
  assert.equal(v07ReleaseGovernanceReview.packageVersion, PACKAGE_VERSION)
  assert.equal(v07ReleaseGovernanceReview.status, STATUS)
  assert.equal(v07ReleaseGovernanceReview.governanceGateStatus, GOVERNANCE_GATE_STATUS)
  assert.equal(v07ReleaseGovernanceReview.ready, false)
  assert.equal(v07ReleaseGovernanceReview.releaseReadyClaim, false)
  assert.equal(v07ReleaseGovernanceReview.releaseActionAuthorized, false)
  assert.equal(v07ReleaseGovernanceReview.releaseActionPerformed, false)
  assert.equal(v07ReleaseGovernanceReview.trueInteractiveOperatorCoverageDecision, 'deferred-manual-operator-procedure-not-current-blocker')
  assert.equal(v07ReleaseGovernanceReview.trueInteractivePiTuiOperatorModelPassPerformed, false)
  assert.deepEqual(v07ReleaseGovernanceReview.governanceChecklistRows, [...GOVERNANCE_CHECKLIST_ROWS])
  assert.deepEqual(v07ReleaseGovernanceReview.acceptedPriorGates, [...ACCEPTED_PRIOR_GATES])
  assert.deepEqual(v07ReleaseGovernanceReview.remainingV07Gates, [...REMAINING_V07_GATES])
  assert.deepEqual(v07ReleaseGovernanceReview.rawArtifactNoCheckinPolicy, [...RAW_ARTIFACT_NO_CHECKIN_POLICY])
  assert.deepEqual(v07ReleaseGovernanceReview.noLeakConclusions, NO_LEAK_CONCLUSIONS)
  assert.deepEqual(v07ReleaseGovernanceReview.stillUnauthorized, [...STILL_UNAUTHORIZED])
  assert.deepEqual(v07ReleaseGovernanceReview.expectedChangedFiles, [...EXPECTED_CHANGED_FILES])
  assert.equal(v07ReleaseGovernanceReview.workerDeliveryBridgeOnly, true)
  assert.equal(v07ReleaseGovernanceReview.goSendKeysAuthorized, false)
  assert.equal(v07ReleaseGovernanceReview.activeWakePaneAuthorized, false)
  assert.equal(v07ReleaseGovernanceReview.stateTaskPlanRunMailboxGovernanceMigrated, false)
  assert.equal(v07ReleaseGovernanceReview.teamPanelUiMigrated, false)
  assert.equal(v07ReleaseGovernanceReview.releasePackageControlPlaneMigrated, false)
  assert.equal(v07ReleaseGovernanceReview.packageVersionChanged, false)
  assert.equal(v07ReleaseGovernanceReview.npmVersionPerformed, false)
  assert.equal(v07ReleaseGovernanceReview.npmPublished, false)
  assert.equal(v07ReleaseGovernanceReview.tagCreated, false)
  assert.equal(v07ReleaseGovernanceReview.githubReleaseCreated, false)
  assert.equal(v07ReleaseGovernanceReview.releaseAssetsCreated, false)
  assert.equal(v07ReleaseGovernanceReview.signingPerformed, false)
  assert.equal(v07ReleaseGovernanceReview.packageSourceApproved, false)
  assert.equal(v07ReleaseGovernanceReview.defaultResolverExpanded, false)
  assert.equal(v07ReleaseGovernanceReview.defaultGoExpanded, false)
  assert.equal(v07ReleaseGovernanceReview.nativeHelperRebuilt, false)
  assert.equal(v07ReleaseGovernanceReview.nativePathRenamed, false)
  assert.equal(v07ReleaseGovernanceReview.secondPlatformClaimed, false)
  assert.equal(v07ReleaseGovernanceReview.lifecycleHooksAdded, false)
  assert.equal(v07ReleaseGovernanceReview.optionalNativeDependencyFlowAdded, false)
  assert.equal(v07ReleaseGovernanceReview.runtimeBehaviorChanged, false)
  assert.equal(v07ReleaseGovernanceReview.sourceBehaviorChanged, false)
  assert.equal(v07ReleaseGovernanceReview.goSourceChanged, false)
  assert.equal(v07ReleaseGovernanceReview.tmuxRuntimeChanged, false)
  assert.equal(v07ReleaseGovernanceReview.hiddenFallbacksReintroduced, false)
  assert.equal(STATUS.includes('not-release-ready'), true)

  assert.ok(GOVERNANCE_CHECKLIST_ROWS.length >= 10, 'governance checklist should cover package/git/approval/rollback/native/operator/raw/evidence/delivery/deferred areas')
  for (const row of GOVERNANCE_CHECKLIST_ROWS) {
    assert.equal(Boolean(row.id), true, 'governance row id required')
    assert.equal(Boolean(row.category), true, `${row.id} category required`)
    assert.equal(Boolean(row.status), true, `${row.id} status required`)
    assert.equal(Boolean(row.decision), true, `${row.id} decision required`)
    assert.ok(Array.isArray(row.evidence) && row.evidence.length > 0, `${row.id} evidence required`)
    assert.equal(Boolean(row.requiredNextAction), true, `${row.id} requiredNextAction required`)
    assert.equal(row.releaseActionAuthorized, false, `${row.id} must not authorize release action`)
    assert.equal(row.releaseActionPerformed, false, `${row.id} must not perform release action`)
  }
  const operator = GOVERNANCE_CHECKLIST_ROWS.find(row => row.id === 'true-interactive-operator-coverage')
  assert.equal(operator?.status, 'deferred-manual-operator-procedure-not-current-blocker')
  assert.ok(operator.decision.includes('was not performed'))
  const evidence = GOVERNANCE_CHECKLIST_ROWS.find(row => row.id === 'evidence-reconciliation')
  assert.equal(evidence?.status, 'outstanding')
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  for (const rel of [V0690_DOC, V0691_DOC, V0692_DOC, V0693_DOC, T046_FIX_FILE]) assert.equal(exists(root, rel), true, `${rel} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  const roadmapCheckpoint = roadmap.split('\n').find(line => line.includes('**v0.6.94 v0.7 release checklist/governance review**')) ?? ''
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoOverclaims(doc, DOC)
  assertNoOverclaims(roadmapCheckpoint, `${ROADMAP} v0.6.94 checkpoint`)
  assertIncludes(read(root, V0691_DOC), 'Slice status: `p95-refreshed-not-release-ready`', V0691_DOC)
  assertIncludes(read(root, V0692_DOC), 'Slice status: `manual-rc-operator-seam-refreshed-not-release-ready`', V0692_DOC)
  assertIncludes(read(root, V0693_DOC), 'Slice status: `bug-burndown-ledger-refreshed-not-release-ready`', V0693_DOC)
  assertIncludes(read(root, T046_FIX_FILE), 'host tmux pane IDs cannot collide', T046_FIX_FILE)
  assertIncludes(read(root, T046_FIX_FILE), 'test tmux snapshot unavailable', T046_FIX_FILE)
  assert.equal(/"runId"\s*:|"commands"\s*:|"tools"\s*:|V0638_RC_FULL_TEXT_SENTINEL_DO_NOT_LEAK/i.test(doc), false, `${DOC} must not embed raw harness JSON or sentinels`)
}

function assertPackageAndReleaseGuards(root) {
  const packageJson = JSON.parse(read(root, PACKAGE_FILE))
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
  assert.deepEqual(forbiddenRaw.sort(), [], 'repo must not contain raw v0.7 release-governance evidence files')
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved release/archive/signing artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.94 v0.7 release governance review',
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
