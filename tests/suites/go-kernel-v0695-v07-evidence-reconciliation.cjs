const assert = require('node:assert/strict')
const {
  assertIncludes,
  assertNoOverclaims,
  existsRel,
  readRel,
} = require('../helpers/fsAssertions.cjs')
const { assertPackageNoReleaseGuards } = require('../helpers/packageGuards.cjs')
const {
  assertNativeArtifactSnapshot,
  assertNoRawOrReleaseArtifacts,
} = require('../helpers/nativeGuards.cjs')
const {
  parseGoCapabilities,
  parseGoWorkerLifecycleCases,
  sourceWithoutLineComments,
} = require('../helpers/goKernelGuards.cjs')
const {
  ACCEPTED_EVIDENCE_CHAIN,
  ACTIVE_CAPABILITIES,
  ACTIVE_WORKER_LIFECYCLE_OPERATIONS,
  CURRENT_REPO_FACT_ROWS,
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
  RAW_ARTIFACT_NO_CHECKIN_POLICY,
  RECONCILIATION_GATE_STATUS,
  RELEASE_DECISION_STATUS,
  RELEASE_TARGET,
  REMAINING_DECISION_AND_POLICY_ROWS,
  ROADMAP,
  STATUS,
  STILL_UNAUTHORIZED_OR_DEFERRED,
  T046_FIX_COMMIT,
  T046_FIX_FILE,
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
  V07_EVIDENCE_RECONCILIATION_SCHEMA_VERSION,
  V07_EVIDENCE_RECONCILIATION_THEME,
  VALIDATION_SNAPSHOT,
  v07EvidenceReconciliation,
} = require('../fixtures/kernel/v0695/v07EvidenceReconciliation.cjs')

const FIXTURE = 'tests/fixtures/kernel/v0695/v07EvidenceReconciliation.cjs'
const SUITE = 'tests/suites/go-kernel-v0695-v07-evidence-reconciliation.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum', '.agentteam-artifacts']
const REQUIRED_DOC = [
  '# v0.6.95 v0.7 Evidence Reconciliation',
  `Release target remains exactly: \`${RELEASE_TARGET}\``,
  `Slice status: \`${STATUS}\``,
  `reconciliation gate status: \`${RECONCILIATION_GATE_STATUS}\``,
  `release decision status: \`${RELEASE_DECISION_STATUS}\``,
  'This is a docs/tests/readiness reconciliation slice, not release mechanics.',
  '`releaseReadyClaim=false`',
  '`releaseActionPerformed=false`',
  'final release/tag/npm action requires explicit user authorization',
  '`package.json` remains `0.6.8`.',
  'No release/package action is authorized or performed.',
  'no `npm version`',
  'no `npm publish`',
  'no tag creation/push',
  'no GitHub releases/assets',
  'no release asset upload',
  'no signing/cosign/SLSA/security attestations',
  'no hosted release workflow/query',
  'current embedded native helper path remains `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/`',
  'no native helper path/binary rename',
  'no second platform claim',
  'no default resolver/default Go expansion beyond accepted explicit cutovers',
  'worker delivery remains bridge-only',
  'Go `send-keys` / active `wakePane` remain unauthorized',
  'State/task/PlanRun/mailbox/governance, team panel/UI, and release/package control-plane migrations remain deferred/blocked unless separately gated',
  'True interactive pi/TUI/operator/model pass was not performed',
  'deferred/manual operator procedure and not a current blocker unless release ownership promotes it',
  '`docs/perf/v0.6.90-v07-readiness-burndown-refresh.md`',
  '`docs/perf/v0.6.91-v07-clean-temp-p95-refresh.md`',
  '`docs/perf/v0.6.92-v07-clean-temp-manual-rc-refresh.md`',
  '`docs/perf/v0.6.93-v07-bug-burndown-ledger.md`',
  '`docs/perf/v0.6.94-v07-release-governance-review.md`',
  '`tests/suites/tools-state.cjs`',
  '`e423179 Isolate tools-state tmux snapshot fixture`',
  '`not-release-ready-readiness-inventory-only`',
  '`p95-refreshed-not-release-ready`',
  '`manual-rc-operator-seam-refreshed-not-release-ready`',
  '`bug-burndown-ledger-refreshed-not-release-ready`',
  '`release-governance-reviewed-not-release-ready`',
  '`refreshed-pass`',
  '`operator-seam-refreshed-pass`',
  '`refreshed-no-known-active-test-visible-p0-p1-blockers`',
  '`reviewed-no-release-action-authorized`',
  '`release-target`',
  '`package-version`',
  '`no-release-mechanics`',
  '`native-helper-path-platform`',
  '`default-resolver-default-go`',
  '`bridge-only-worker-delivery`',
  '`true-interactive-operator-coverage`',
  '`deferred-runtime-migrations`',
  '`change-scope`',
  '`release-decision`',
  '`continuous-no-raw-artifact-policy`',
  'raw logs, validation output, transcripts, state archives, screenshots, temp homes, raw hosted records, release artifacts, tarballs, signatures, and raw JSON remain not checked in',
  'continued no raw artifact policy remains in force',
  '`node tests/run.cjs go-kernel-v0695-v07-evidence-reconciliation`',
  '`node tests/run.cjs go-kernel-v0691-v07-clean-temp-p95-refresh go-kernel-v0692-v07-clean-temp-manual-rc-refresh go-kernel-v0693-v07-bug-burndown-ledger go-kernel-v0694-v07-release-governance-review go-kernel-v0695-v07-evidence-reconciliation tools-state`',
  '`npm test`',
  '`npm run typecheck`',
  '`npm run -s check:boundaries`',
  '`git diff --check`',
  '`node -p "require(\'./package.json\').version"`',
  '`sha256sum -c native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/SHA256SUMS`',
  '`tests/fixtures/kernel/v0695/v07EvidenceReconciliation.cjs`',
  '`tests/suites/go-kernel-v0695-v07-evidence-reconciliation.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.95 v0.7 evidence reconciliation',
  `\`${RELEASE_TARGET}\``,
  `status \`${STATUS}\``,
  `reconciliation gate \`${RECONCILIATION_GATE_STATUS}\``,
  `release decision \`${RELEASE_DECISION_STATUS}\``,
  '`releaseReadyClaim=false`',
  '`releaseActionPerformed=false`',
  'final release/tag/npm action still requires explicit user authorization',
  '`package.json` remains `0.6.8`',
  'no release/package action is authorized or performed',
  'v0.6.90 readiness inventory, v0.6.91 p95, v0.6.92 deterministic manual RC/operator-seam, v0.6.93 bug ledger, v0.6.94 governance review, and T046 fix now reconcile with current repo behavior',
  'continued no raw artifact policy remains in force',
  'true interactive pi/TUI/operator/model pass remains unperformed and deferred/manual unless release ownership promotes it',
  'worker delivery remains bridge-only',
  'Go `send-keys` / active `wakePane` remain unauthorized',
  'current embedded native helper path remains `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/`',
  'docs/perf/v0.6.95-v07-evidence-reconciliation.md',
  '**v0.6.95 v0.7 evidence reconciliation**',
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

function assertFixtureShape(root) {
  assert.equal(existsRel(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(existsRel(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(v07EvidenceReconciliation)), v07EvidenceReconciliation)
  assert.equal(v07EvidenceReconciliation.schemaVersion, V07_EVIDENCE_RECONCILIATION_SCHEMA_VERSION)
  assert.equal(v07EvidenceReconciliation.theme, V07_EVIDENCE_RECONCILIATION_THEME)
  assert.equal(v07EvidenceReconciliation.releaseTarget, RELEASE_TARGET)
  assert.equal(v07EvidenceReconciliation.packageVersion, PACKAGE_VERSION)
  assert.equal(v07EvidenceReconciliation.status, STATUS)
  assert.equal(v07EvidenceReconciliation.reconciliationGateStatus, RECONCILIATION_GATE_STATUS)
  assert.equal(v07EvidenceReconciliation.releaseDecisionStatus, RELEASE_DECISION_STATUS)
  assert.equal(v07EvidenceReconciliation.evidenceReconciled, true)
  assert.equal(v07EvidenceReconciliation.releaseDecisionPending, true)
  assert.equal(v07EvidenceReconciliation.explicitUserReleaseAuthorizationRequired, true)
  assert.equal(v07EvidenceReconciliation.releaseReadyClaim, false)
  assert.equal(v07EvidenceReconciliation.releaseActionAuthorized, false)
  assert.equal(v07EvidenceReconciliation.releaseActionPerformed, false)
  assert.equal(v07EvidenceReconciliation.ready, false)
  assert.equal(v07EvidenceReconciliation.packageVersionChanged, false)
  assert.equal(v07EvidenceReconciliation.npmVersionPerformed, false)
  assert.equal(v07EvidenceReconciliation.npmPublished, false)
  assert.equal(v07EvidenceReconciliation.tagCreated, false)
  assert.equal(v07EvidenceReconciliation.githubReleaseCreated, false)
  assert.equal(v07EvidenceReconciliation.releaseAssetsCreated, false)
  assert.equal(v07EvidenceReconciliation.signingPerformed, false)
  assert.equal(v07EvidenceReconciliation.hostedReleaseQueryPerformed, false)
  assert.equal(v07EvidenceReconciliation.packageSourceApproved, false)
  assert.equal(v07EvidenceReconciliation.defaultResolverExpanded, false)
  assert.equal(v07EvidenceReconciliation.defaultGoExpanded, false)
  assert.equal(v07EvidenceReconciliation.nativeHelperRebuilt, false)
  assert.equal(v07EvidenceReconciliation.nativePathRenamed, false)
  assert.equal(v07EvidenceReconciliation.secondPlatformClaimed, false)
  assert.equal(v07EvidenceReconciliation.lifecycleHooksAdded, false)
  assert.equal(v07EvidenceReconciliation.optionalNativeDependencyFlowAdded, false)
  assert.equal(v07EvidenceReconciliation.runtimeBehaviorChanged, false)
  assert.equal(v07EvidenceReconciliation.sourceBehaviorChanged, false)
  assert.equal(v07EvidenceReconciliation.goSourceChanged, false)
  assert.equal(v07EvidenceReconciliation.tmuxRuntimeChanged, false)
  assert.equal(v07EvidenceReconciliation.hiddenFallbacksReintroduced, false)
  assert.equal(v07EvidenceReconciliation.workerDeliveryBridgeOnly, true)
  assert.equal(v07EvidenceReconciliation.goSendKeysAuthorized, false)
  assert.equal(v07EvidenceReconciliation.activeWakePaneAuthorized, false)
  assert.equal(v07EvidenceReconciliation.stateTaskPlanRunMailboxGovernanceMigrated, false)
  assert.equal(v07EvidenceReconciliation.teamPanelUiMigrated, false)
  assert.equal(v07EvidenceReconciliation.releasePackageControlPlaneMigrated, false)
  assert.equal(v07EvidenceReconciliation.trueInteractiveOperatorCoverageDecision, 'deferred-manual-operator-procedure-not-current-blocker')
  assert.equal(v07EvidenceReconciliation.trueInteractivePiTuiOperatorModelPassPerformed, false)
  assert.deepEqual(v07EvidenceReconciliation.acceptedEvidenceChain, [...ACCEPTED_EVIDENCE_CHAIN])
  assert.deepEqual(v07EvidenceReconciliation.currentRepoFactRows, [...CURRENT_REPO_FACT_ROWS])
  assert.deepEqual(v07EvidenceReconciliation.validationSnapshot, [...VALIDATION_SNAPSHOT])
  assert.deepEqual(v07EvidenceReconciliation.remainingDecisionAndPolicyRows, [...REMAINING_DECISION_AND_POLICY_ROWS])
  assert.deepEqual(v07EvidenceReconciliation.rawArtifactNoCheckinPolicy, [...RAW_ARTIFACT_NO_CHECKIN_POLICY])
  assert.deepEqual(v07EvidenceReconciliation.noLeakConclusions, NO_LEAK_CONCLUSIONS)
  assert.deepEqual(v07EvidenceReconciliation.stillUnauthorizedOrDeferred, [...STILL_UNAUTHORIZED_OR_DEFERRED])
  assert.deepEqual(v07EvidenceReconciliation.expectedChangedFiles, [...EXPECTED_CHANGED_FILES])

  assert.equal(ACCEPTED_EVIDENCE_CHAIN.length, 6, 'evidence chain should reconcile v0.6.90-v0.6.94 and T046')
  for (const row of ACCEPTED_EVIDENCE_CHAIN) {
    assert.equal(Boolean(row.id), true, 'evidence row id required')
    assert.equal(Boolean(row.status), true, `${row.id} status required`)
    assert.equal(Boolean(row.recordedStatus), true, `${row.id} recorded status required`)
    assert.ok(Array.isArray(row.evidence) && row.evidence.length > 0, `${row.id} evidence required`)
    assert.equal(Boolean(row.reconciliation), true, `${row.id} reconciliation required`)
  }
  assert.equal(ACCEPTED_EVIDENCE_CHAIN.some(row => row.id === 'v0.6.94-release-checklist-governance-review'), true)
  assert.equal(CURRENT_REPO_FACT_ROWS.length, 9, 'current fact rows should cover target/package/release/native/default/delivery/operator/deferred/scope')
  assert.equal(VALIDATION_SNAPSHOT.length, 11, 'validation snapshot should include syntax/new/focused/full/static/boundary/diff/package/native/status guards')
  for (const row of VALIDATION_SNAPSHOT) assert.equal(row.status, 'pass', `${row.command} should be recorded as pass`)
  for (const row of REMAINING_DECISION_AND_POLICY_ROWS) {
    assert.equal(row.releaseReadyClaim, false, `${row.id} must not claim release readiness`)
    assert.equal(row.releaseActionAuthorized, false, `${row.id} must not authorize release action`)
    assert.equal(row.releaseActionPerformed, false, `${row.id} must not perform release action`)
  }
}

function assertDocs(root) {
  assert.equal(existsRel(root, DOC), true, `${DOC} should exist`)
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
    T046_FIX_FILE,
  ]) assert.equal(existsRel(root, rel), true, `${rel} should exist`)
  assertIncludes(readRel(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = readRel(root, DOC)
  const roadmap = readRel(root, ROADMAP)
  const roadmapCheckpoint = roadmap.split('\n').find(line => line.includes('**v0.6.95 v0.7 evidence reconciliation**')) ?? ''
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoOverclaims(doc, FORBIDDEN_OVERCLAIMS, DOC)
  assertNoOverclaims(roadmapCheckpoint, FORBIDDEN_OVERCLAIMS, `${ROADMAP} v0.6.95 checkpoint`)
  assertIncludes(readRel(root, V0690_DOC), 'Machine-readable status: `not-release-ready-readiness-inventory-only`', V0690_DOC)
  assertIncludes(readRel(root, V0691_DOC), 'Slice status: `p95-refreshed-not-release-ready`', V0691_DOC)
  assertIncludes(readRel(root, V0691_DOC), 'p95 gate status: `refreshed-pass`', V0691_DOC)
  assertIncludes(readRel(root, V0692_DOC), 'Slice status: `manual-rc-operator-seam-refreshed-not-release-ready`', V0692_DOC)
  assertIncludes(readRel(root, V0692_DOC), 'manual RC/operator-seam gate status: `operator-seam-refreshed-pass`', V0692_DOC)
  assertIncludes(readRel(root, V0692_DOC), 'No true interactive pi/TUI/operator/model evidence is claimed', V0692_DOC)
  assertIncludes(readRel(root, V0693_DOC), 'Slice status: `bug-burndown-ledger-refreshed-not-release-ready`', V0693_DOC)
  assertIncludes(readRel(root, V0693_DOC), 'bug burn-down ledger gate status: `refreshed-no-known-active-test-visible-p0-p1-blockers`', V0693_DOC)
  assertIncludes(readRel(root, V0693_DOC), 'does not claim no bugs in all possible environments', V0693_DOC)
  assertIncludes(readRel(root, V0694_DOC), 'Slice status: `release-governance-reviewed-not-release-ready`', V0694_DOC)
  assertIncludes(readRel(root, V0694_DOC), 'governance gate status: `reviewed-no-release-action-authorized`', V0694_DOC)
  assertIncludes(readRel(root, V0694_DOC), 'True interactive pi/TUI/operator/model pass was not performed in v0.6.92', V0694_DOC)
  assertIncludes(readRel(root, T046_FIX_FILE), 'host tmux pane IDs cannot collide', T046_FIX_FILE)
  assertIncludes(readRel(root, T046_FIX_FILE), 'test tmux snapshot unavailable', T046_FIX_FILE)
  assertIncludes(doc, T046_FIX_COMMIT, DOC)
  assert.equal(/"runId"\s*:|"commands"\s*:|"tools"\s*:|V0638_RC_FULL_TEXT_SENTINEL_DO_NOT_LEAK/i.test(doc), false, `${DOC} must not embed raw harness JSON or sentinels`)
}

function assertPackageAndReleaseGuards(root) {
  assertPackageNoReleaseGuards(root, {
    packageRel: PACKAGE_FILE,
    expectedVersion: PACKAGE_VERSION,
    expectedPiExtensions: ['./index.ts'],
    forbiddenRootFiles: ROOT_FORBIDDEN_FILES,
  })
  for (const rel of EXPECTED_CHANGED_FILES) assert.equal(rel === '.gitignore' || rel.startsWith('docs/') || rel.startsWith('tests/'), true, `${rel} should be docs/tests/.gitignore scoped`)
}

function assertWorkerDeliveryAndGoBoundary(root) {
  const deliveryPolicy = readRel(root, DELIVERY_POLICY_FILE)
  const deliveryPolicyCode = sourceWithoutLineComments(deliveryPolicy)
  const goSource = readRel(root, GO_SOURCE_FILE)
  const kernelSource = readRel(root, KERNEL_FILE)
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
  assertNativeArtifactSnapshot(root, {
    nativeRoot: NATIVE_ROOT,
    packageVersion: PACKAGE_VERSION,
    capabilities: ACTIVE_CAPABILITIES,
    snapshot: NATIVE_ARTIFACT_SNAPSHOT,
  })
}

function assertNoRawArtifactsCheckedIn(root) {
  assertNoRawOrReleaseArtifacts(root, {
    approvedPrefixes: [APPROVED_NATIVE_PREFIX],
    rawPattern: FORBIDDEN_RAW_FILE,
    artifactPattern: FORBIDDEN_ARTIFACT,
    rawMessage: 'repo must not contain raw v0.7 evidence reconciliation files',
    artifactMessage: 'repo must not contain unapproved release/archive/signing artifacts',
  })
}

module.exports = {
  name: 'Go kernel v0.6.95 v0.7 evidence reconciliation',
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
