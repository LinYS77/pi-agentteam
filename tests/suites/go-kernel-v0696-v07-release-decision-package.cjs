const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACCEPTED_EVIDENCE_CHAIN,
  ACTIVE_CAPABILITIES,
  ACTIVE_WORKER_LIFECYCLE_OPERATIONS,
  DELIVERY_POLICY_FILE,
  DOC,
  EXPECTED_CHANGED_FILES,
  GO_SOURCE_FILE,
  KERNEL_FILE,
  NATIVE_ARTIFACT_SNAPSHOT,
  NATIVE_ROOT,
  NO_LEAK_CONCLUSIONS,
  PACKAGE_FILE,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARY_ROWS,
  RAW_ARTIFACT_NO_CHECKIN_POLICY,
  RELEASE_DECISION_STATUS,
  RELEASE_TARGET,
  ROADMAP,
  STATUS,
  STILL_UNAUTHORIZED_OR_DEFERRED,
  T046_FIX_COMMIT,
  T046_FIX_FILE,
  T050_COMMIT,
  USER_DECISION_OPTIONS,
  V0690_DOC,
  V0690_FIXTURE,
  V0690_SUITE,
  V0691_DOC,
  V0691_FIXTURE,
  V0691_SUITE,
  V0692_DOC,
  V0692_FIXTURE,
  V0692_SUITE,
  V0693_DOC,
  V0693_FIXTURE,
  V0693_SUITE,
  V0694_DOC,
  V0694_FIXTURE,
  V0694_SUITE,
  V0695_DOC,
  V0695_FIXTURE,
  V0695_SUITE,
  V07_RELEASE_DECISION_PACKAGE_SCHEMA_VERSION,
  V07_RELEASE_DECISION_PACKAGE_THEME,
  VALIDATION_SNAPSHOT,
  v07ReleaseDecisionPackage,
} = require('../fixtures/kernel/v0696/v07ReleaseDecisionPackage.cjs')

const FIXTURE = 'tests/fixtures/kernel/v0696/v07ReleaseDecisionPackage.cjs'
const SUITE = 'tests/suites/go-kernel-v0696-v07-release-decision-package.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum', '.agentteam-artifacts']
const REQUIRED_DOC = [
  '# v0.6.96 v0.7 Release Decision Package / No-action Preflight',
  `Release target remains exactly: \`${RELEASE_TARGET}\``,
  `Slice status: \`${STATUS}\``,
  `release decision status: \`${RELEASE_DECISION_STATUS}\``,
  'This is a docs/tests/user-decision-preflight slice, not release mechanics, not release approval, and not a release readiness claim.',
  '`releaseReadyClaim=false`',
  '`releaseActionAuthorized=false`',
  '`releaseActionPerformed=false`',
  '`packageVersion=0.6.8`',
  'release decision package ready for user review; no release action authorized or performed',
  'final release/tag/npm action still requires explicit user authorization',
  '`package.json` remains `0.6.8`.',
  'Evidence chain reconciled for user review',
  '`docs/perf/v0.6.90-v07-readiness-burndown-refresh.md`',
  '`docs/perf/v0.6.91-v07-clean-temp-p95-refresh.md`',
  '`docs/perf/v0.6.92-v07-clean-temp-manual-rc-refresh.md`',
  '`docs/perf/v0.6.93-v07-bug-burndown-ledger.md`',
  '`docs/perf/v0.6.94-v07-release-governance-review.md`',
  '`docs/perf/v0.6.95-v07-evidence-reconciliation.md`',
  '`tests/suites/tools-state.cjs`',
  '`e423179 Isolate tools-state tmux snapshot fixture`',
  '`bab6937 Add v0.7 evidence reconciliation`',
  '`not-release-ready-readiness-inventory-only`',
  '`p95-refreshed-not-release-ready`',
  '`manual-rc-operator-seam-refreshed-not-release-ready`',
  '`bug-burndown-ledger-refreshed-not-release-ready`',
  '`release-governance-reviewed-not-release-ready`',
  '`evidence-reconciled-release-decision-pending-no-release-action`',
  '`reconciled-current-evidence-chain-no-release-action`',
  '`pending-explicit-user-choice`',
  '`authorize-separate-release-mechanics-task-later`',
  'Explicitly authorize a separate release mechanics task later',
  '`request-additional-true-interactive-manual-operator-pass-first`',
  'Ask for an additional true interactive pi/TUI/operator/model manual pass first',
  '`defer-release-and-continue-development-refactoring`',
  'Defer release and continue development/refactoring',
  'No decision option is selected or executed in this slice.',
  'True interactive pi/TUI/operator/model pass remains explicitly unperformed and deferred/manual unless release ownership promotes it.',
  'continuous no-raw-artifact policy remains in force',
  'raw logs, validation output, transcripts, state archives, screenshots, temp homes, raw hosted records, release artifacts, tarballs, signatures, and raw JSON remain not checked in',
  'no `npm version`',
  'no `npm publish`',
  'no tag creation/push',
  'no GitHub release/assets',
  'no release asset upload',
  'no signing/cosign/SLSA/security attestation',
  'no hosted workflow/release query',
  'no package source approval',
  'no package lifecycle hooks',
  'no optional native dependency flow',
  'no postinstall/download/runtime build',
  'no native helper path/binary rename',
  'no second platform claim',
  'no default resolver/default Go expansion beyond accepted explicit cutovers',
  'worker delivery remains bridge-only',
  'Go `send-keys` / active `wakePane` remain unauthorized',
  'State/task/PlanRun/mailbox/governance, team panel/UI, and release/package control-plane migrations remain deferred/blocked unless separately gated',
  'No runtime/source/Go/native/tmux/package behavior changes',
  'no hidden TypeScript tmux fallback reintroduction',
  'current embedded native helper path remains `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/`',
  '`node tests/run.cjs go-kernel-v0696-v07-release-decision-package`',
  '`node tests/run.cjs go-kernel-v0691-v07-clean-temp-p95-refresh go-kernel-v0692-v07-clean-temp-manual-rc-refresh go-kernel-v0693-v07-bug-burndown-ledger go-kernel-v0694-v07-release-governance-review go-kernel-v0695-v07-evidence-reconciliation go-kernel-v0696-v07-release-decision-package tools-state`',
  '`npm test`',
  '`npm run typecheck`',
  '`npm run -s check:boundaries`',
  '`git diff --check`',
  '`node -p "require(\'./package.json\').version"`',
  '`sha256sum -c native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/SHA256SUMS`',
  '`tests/fixtures/kernel/v0696/v07ReleaseDecisionPackage.cjs`',
  '`tests/suites/go-kernel-v0696-v07-release-decision-package.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.96 v0.7 release decision package/no-action preflight',
  `\`${RELEASE_TARGET}\``,
  `status \`${STATUS}\``,
  `release decision \`${RELEASE_DECISION_STATUS}\``,
  '`releaseReadyClaim=false`',
  '`releaseActionAuthorized=false`',
  '`releaseActionPerformed=false`',
  '`packageVersion=0.6.8`',
  'release decision package ready for user review; no release action authorized or performed',
  'final release/tag/npm action still requires explicit user authorization',
  'accepted evidence through v0.6.95 and commit `bab6937 Add v0.7 evidence reconciliation`',
  'user options are explicit release mechanics authorization later, additional true interactive/manual operator pass first, or deferral/continued development',
  'true interactive pi/TUI/operator/model pass remains unperformed and deferred/manual unless release ownership promotes it',
  'continuous no-raw-artifact policy remains in force',
  '`package.json` remains `0.6.8`',
  'worker delivery remains bridge-only',
  'Go `send-keys` / active `wakePane` remain unauthorized',
  'current embedded native helper path remains `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/`',
  'docs/perf/v0.6.96-v07-release-decision-package.md',
  '**v0.6.96 v0.7 release decision package/no-action preflight**',
]
const FORBIDDEN_OVERCLAIMS = [
  'ready:true',
  'releaseReadyClaim: true',
  'releaseReadyClaim=true',
  'releaseActionPerformed=true',
  'releaseActionAuthorized=true',
  'v0.7.0 is release-ready',
  'v0.7 is release-ready',
  'v0.7.0 release-ready approval is granted',
  'release-ready approval granted',
  'release can ship',
  'ready for release',
  'GO for release',
  'GO to release',
  'v0.7 shipped',
  'v0.7.0 shipped',
  'all v0.7 gates complete',
  'all gates complete',
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
  assert.deepEqual(JSON.parse(JSON.stringify(v07ReleaseDecisionPackage)), v07ReleaseDecisionPackage)
  assert.equal(v07ReleaseDecisionPackage.schemaVersion, V07_RELEASE_DECISION_PACKAGE_SCHEMA_VERSION)
  assert.equal(v07ReleaseDecisionPackage.theme, V07_RELEASE_DECISION_PACKAGE_THEME)
  assert.equal(v07ReleaseDecisionPackage.releaseTarget, RELEASE_TARGET)
  assert.equal(v07ReleaseDecisionPackage.packageVersion, PACKAGE_VERSION)
  assert.equal(v07ReleaseDecisionPackage.status, STATUS)
  assert.equal(v07ReleaseDecisionPackage.releaseDecisionStatus, RELEASE_DECISION_STATUS)
  assert.equal(v07ReleaseDecisionPackage.evidenceChainReconciledForUserReview, true)
  assert.equal(v07ReleaseDecisionPackage.explicitUserChoiceRequired, true)
  assert.equal(v07ReleaseDecisionPackage.releaseReadyClaim, false)
  assert.equal(v07ReleaseDecisionPackage.releaseActionAuthorized, false)
  assert.equal(v07ReleaseDecisionPackage.releaseActionPerformed, false)
  assert.equal(v07ReleaseDecisionPackage.releaseApprovalClaim, false)
  assert.equal(v07ReleaseDecisionPackage.releaseMechanicsPerformed, false)
  assert.equal(v07ReleaseDecisionPackage.ready, false)
  assert.equal(v07ReleaseDecisionPackage.packageVersionChanged, false)
  assert.equal(v07ReleaseDecisionPackage.npmVersionPerformed, false)
  assert.equal(v07ReleaseDecisionPackage.npmPublished, false)
  assert.equal(v07ReleaseDecisionPackage.tagCreated, false)
  assert.equal(v07ReleaseDecisionPackage.githubReleaseCreated, false)
  assert.equal(v07ReleaseDecisionPackage.releaseAssetsCreated, false)
  assert.equal(v07ReleaseDecisionPackage.signingPerformed, false)
  assert.equal(v07ReleaseDecisionPackage.hostedWorkflowOrReleaseQueryPerformed, false)
  assert.equal(v07ReleaseDecisionPackage.packageSourceApproved, false)
  assert.equal(v07ReleaseDecisionPackage.defaultResolverExpanded, false)
  assert.equal(v07ReleaseDecisionPackage.defaultGoExpanded, false)
  assert.equal(v07ReleaseDecisionPackage.nativeHelperRebuilt, false)
  assert.equal(v07ReleaseDecisionPackage.nativePathRenamed, false)
  assert.equal(v07ReleaseDecisionPackage.secondPlatformClaimed, false)
  assert.equal(v07ReleaseDecisionPackage.lifecycleHooksAdded, false)
  assert.equal(v07ReleaseDecisionPackage.optionalNativeDependencyFlowAdded, false)
  assert.equal(v07ReleaseDecisionPackage.runtimeBehaviorChanged, false)
  assert.equal(v07ReleaseDecisionPackage.sourceBehaviorChanged, false)
  assert.equal(v07ReleaseDecisionPackage.goSourceChanged, false)
  assert.equal(v07ReleaseDecisionPackage.tmuxRuntimeChanged, false)
  assert.equal(v07ReleaseDecisionPackage.hiddenFallbacksReintroduced, false)
  assert.equal(v07ReleaseDecisionPackage.workerDeliveryBridgeOnly, true)
  assert.equal(v07ReleaseDecisionPackage.goSendKeysAuthorized, false)
  assert.equal(v07ReleaseDecisionPackage.activeWakePaneAuthorized, false)
  assert.equal(v07ReleaseDecisionPackage.stateTaskPlanRunMailboxGovernanceMigrated, false)
  assert.equal(v07ReleaseDecisionPackage.teamPanelUiMigrated, false)
  assert.equal(v07ReleaseDecisionPackage.releasePackageControlPlaneMigrated, false)
  assert.equal(v07ReleaseDecisionPackage.trueInteractiveOperatorCoverageDecision, 'deferred-manual-operator-procedure-not-current-blocker')
  assert.equal(v07ReleaseDecisionPackage.trueInteractivePiTuiOperatorModelPassPerformed, false)
  assert.deepEqual(v07ReleaseDecisionPackage.acceptedEvidenceChain, [...ACCEPTED_EVIDENCE_CHAIN])
  assert.deepEqual(v07ReleaseDecisionPackage.userDecisionOptions, [...USER_DECISION_OPTIONS])
  assert.deepEqual(v07ReleaseDecisionPackage.preservedBoundaryRows, [...PRESERVED_BOUNDARY_ROWS])
  assert.deepEqual(v07ReleaseDecisionPackage.validationSnapshot, [...VALIDATION_SNAPSHOT])
  assert.deepEqual(v07ReleaseDecisionPackage.rawArtifactNoCheckinPolicy, [...RAW_ARTIFACT_NO_CHECKIN_POLICY])
  assert.deepEqual(v07ReleaseDecisionPackage.noLeakConclusions, NO_LEAK_CONCLUSIONS)
  assert.deepEqual(v07ReleaseDecisionPackage.stillUnauthorizedOrDeferred, [...STILL_UNAUTHORIZED_OR_DEFERRED])
  assert.deepEqual(v07ReleaseDecisionPackage.expectedChangedFiles, [...EXPECTED_CHANGED_FILES])

  assert.equal(ACCEPTED_EVIDENCE_CHAIN.length, 7, 'evidence chain should include v0.6.90-v0.6.95 and T046')
  assert.equal(ACCEPTED_EVIDENCE_CHAIN.some(row => row.id === 'v0.6.95-evidence-reconciliation' && row.commit === T050_COMMIT), true)
  for (const row of ACCEPTED_EVIDENCE_CHAIN) {
    assert.equal(Boolean(row.id), true, 'evidence row id required')
    assert.equal(Boolean(row.status), true, `${row.id} status required`)
    assert.equal(Boolean(row.recordedStatus), true, `${row.id} recorded status required`)
    assert.ok(Array.isArray(row.evidence) && row.evidence.length > 0, `${row.id} evidence required`)
    assert.equal(Boolean(row.userDecisionPacketSummary), true, `${row.id} decision summary required`)
  }
  assert.deepEqual(USER_DECISION_OPTIONS.map(row => row.id), [
    'authorize-separate-release-mechanics-task-later',
    'request-additional-true-interactive-manual-operator-pass-first',
    'defer-release-and-continue-development-refactoring',
  ])
  for (const row of USER_DECISION_OPTIONS) {
    assert.equal(row.status, 'available-not-selected')
    assert.equal(row.actionExecutedNow, false)
    assert.equal(Boolean(row.effectIfSelectedLater), true)
  }
  assert.equal(PRESERVED_BOUNDARY_ROWS.length, 8, 'boundary rows should cover package/release/native/delivery/deferred/runtime/operator/raw policies')
  assert.equal(VALIDATION_SNAPSHOT.length, 11, 'validation snapshot should include syntax/new/focused/full/static/boundary/diff/package/native/status guards')
  for (const row of VALIDATION_SNAPSHOT) assert.equal(row.status, 'pass', `${row.command} should be recorded as pass`)
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  for (const rel of [
    V0690_DOC,
    V0690_FIXTURE,
    V0690_SUITE,
    V0691_DOC,
    V0691_FIXTURE,
    V0691_SUITE,
    V0692_DOC,
    V0692_FIXTURE,
    V0692_SUITE,
    V0693_DOC,
    V0693_FIXTURE,
    V0693_SUITE,
    V0694_DOC,
    V0694_FIXTURE,
    V0694_SUITE,
    V0695_DOC,
    V0695_FIXTURE,
    V0695_SUITE,
    T046_FIX_FILE,
  ]) assert.equal(exists(root, rel), true, `${rel} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  const roadmapCheckpoint = roadmap.split('\n').find(line => line.includes('**v0.6.96 v0.7 release decision package/no-action preflight**')) ?? ''
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoOverclaims(doc, DOC)
  assertNoOverclaims(roadmapCheckpoint, `${ROADMAP} v0.6.96 checkpoint`)
  assertIncludes(read(root, V0690_DOC), 'Machine-readable status: `not-release-ready-readiness-inventory-only`', V0690_DOC)
  assertIncludes(read(root, V0691_DOC), 'Slice status: `p95-refreshed-not-release-ready`', V0691_DOC)
  assertIncludes(read(root, V0692_DOC), 'Slice status: `manual-rc-operator-seam-refreshed-not-release-ready`', V0692_DOC)
  assertIncludes(read(root, V0692_DOC), 'No true interactive pi/TUI/operator/model evidence is claimed', V0692_DOC)
  assertIncludes(read(root, V0693_DOC), 'Slice status: `bug-burndown-ledger-refreshed-not-release-ready`', V0693_DOC)
  assertIncludes(read(root, V0693_DOC), 'bug burn-down ledger gate status: `refreshed-no-known-active-test-visible-p0-p1-blockers`', V0693_DOC)
  assertIncludes(read(root, V0694_DOC), 'Slice status: `release-governance-reviewed-not-release-ready`', V0694_DOC)
  assertIncludes(read(root, V0694_DOC), 'governance gate status: `reviewed-no-release-action-authorized`', V0694_DOC)
  assertIncludes(read(root, V0695_DOC), 'Slice status: `evidence-reconciled-release-decision-pending-no-release-action`', V0695_DOC)
  assertIncludes(read(root, V0695_DOC), 'release decision status: `release-decision-pending-explicit-user-authorization`', V0695_DOC)
  assertIncludes(read(root, T046_FIX_FILE), 'host tmux pane IDs cannot collide', T046_FIX_FILE)
  assertIncludes(read(root, T046_FIX_FILE), 'test tmux snapshot unavailable', T046_FIX_FILE)
  assertIncludes(doc, T046_FIX_COMMIT, DOC)
  assertIncludes(doc, T050_COMMIT, DOC)
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
  assert.deepEqual(forbiddenRaw.sort(), [], 'repo must not contain raw v0.7 release decision package files')
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved release/archive/signing artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.96 v0.7 release decision package',
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
