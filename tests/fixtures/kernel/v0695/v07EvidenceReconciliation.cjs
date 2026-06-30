const V07_EVIDENCE_RECONCILIATION_SCHEMA_VERSION = 1
const V07_EVIDENCE_RECONCILIATION_THEME = 'v0.6.95-v07-evidence-reconciliation'
const RELEASE_TARGET = 'v0.7.0 = core refactor + performance baseline + bug burn-down release'
const PACKAGE_VERSION = '0.6.8'
const STATUS = 'evidence-reconciled-release-decision-pending-no-release-action'
const RECONCILIATION_GATE_STATUS = 'reconciled-current-evidence-chain-no-release-action'
const RELEASE_DECISION_STATUS = 'release-decision-pending-explicit-user-authorization'
const DOC = 'docs/perf/v0.6.95-v07-evidence-reconciliation.md'
const ROADMAP = 'docs/agentteam方案书.md'
const V0690_DOC = 'docs/perf/v0.6.90-v07-readiness-burndown-refresh.md'
const V0691_DOC = 'docs/perf/v0.6.91-v07-clean-temp-p95-refresh.md'
const V0692_DOC = 'docs/perf/v0.6.92-v07-clean-temp-manual-rc-refresh.md'
const V0693_DOC = 'docs/perf/v0.6.93-v07-bug-burndown-ledger.md'
const V0694_DOC = 'docs/perf/v0.6.94-v07-release-governance-review.md'
const V0690_FIXTURE = 'tests/fixtures/kernel/v0690/v07ReadinessBurndownRefresh.cjs'
const V0691_FIXTURE = 'tests/fixtures/kernel/v0691/v07CleanTempP95Refresh.cjs'
const V0692_FIXTURE = 'tests/fixtures/kernel/v0692/v07CleanTempManualRcRefresh.cjs'
const V0693_FIXTURE = 'tests/fixtures/kernel/v0693/v07BugBurndownLedger.cjs'
const V0694_FIXTURE = 'tests/fixtures/kernel/v0694/v07ReleaseGovernanceReview.cjs'
const V0690_SUITE = 'tests/suites/go-kernel-v0690-v07-readiness-burndown-refresh.cjs'
const V0691_SUITE = 'tests/suites/go-kernel-v0691-v07-clean-temp-p95-refresh.cjs'
const V0692_SUITE = 'tests/suites/go-kernel-v0692-v07-clean-temp-manual-rc-refresh.cjs'
const V0693_SUITE = 'tests/suites/go-kernel-v0693-v07-bug-burndown-ledger.cjs'
const V0694_SUITE = 'tests/suites/go-kernel-v0694-v07-release-governance-review.cjs'
const T046_FIX_FILE = 'tests/suites/tools-state.cjs'
const T046_FIX_COMMIT = 'e423179 Isolate tools-state tmux snapshot fixture'
const DELIVERY_POLICY_FILE = 'deliveryPolicy.ts'
const GO_SOURCE_FILE = 'kernel/go/agentteam-kernel/main.go'
const KERNEL_FILE = 'core/kernel.ts'
const PACKAGE_FILE = 'package.json'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const ACTIVE_WORKER_LIFECYCLE_OPERATIONS = Object.freeze([
  'inspectPane',
  'listAgentTeamPanes',
  'captureCurrentPaneBinding',
  'listPanesInWindow',
  'findAgentTeamWindowTarget',
  'findWindowTargetByName',
  'sessionExists',
  'createDetachedSwarmSession',
  'createDetachedSwarmWindow',
  'markWindowAsAgentTeam',
  'refreshWindowPaneLabels',
  'setPaneLabel',
  'clearPaneLabel',
  'killPane',
  'createTeammatePane',
])
const ACCEPTED_EVIDENCE_CHAIN = Object.freeze([
  Object.freeze({
    id: 'v0.6.90-readiness-inventory',
    status: 'accepted-historical-inventory',
    recordedStatus: 'not-release-ready-readiness-inventory-only',
    evidence: Object.freeze([V0690_DOC, V0690_FIXTURE, V0690_SUITE]),
    reconciliation: 'historical inventory identified remaining v0.7 gates later addressed by v0.6.91 through v0.6.95 except continuous policy/release decision',
  }),
  Object.freeze({
    id: 'v0.6.91-clean-temp-p95-refresh',
    status: 'accepted',
    recordedStatus: 'p95-refreshed-not-release-ready',
    gateStatus: 'refreshed-pass',
    evidence: Object.freeze([V0691_DOC, V0691_FIXTURE, V0691_SUITE]),
    reconciliation: 'accepted clean-temp p95 values are carried forward as performance baseline evidence',
  }),
  Object.freeze({
    id: 'T046-tools-state-pane-health-blocker-fix',
    status: 'accepted',
    recordedStatus: 'fixed-accepted',
    evidence: Object.freeze([T046_FIX_FILE]),
    commit: T046_FIX_COMMIT,
    reconciliation: 'pre-existing tools-state pane-health mismatch fixed and kept in focused regression set',
  }),
  Object.freeze({
    id: 'v0.6.92-clean-temp-manual-rc-operator-seam-refresh',
    status: 'accepted-with-declared-coverage-limitation',
    recordedStatus: 'manual-rc-operator-seam-refreshed-not-release-ready',
    gateStatus: 'operator-seam-refreshed-pass',
    evidence: Object.freeze([V0692_DOC, V0692_FIXTURE, V0692_SUITE]),
    reconciliation: 'deterministic operator-seam RC evidence accepted; true interactive pi/TUI/operator/model pass remains unclaimed and deferred/manual',
  }),
  Object.freeze({
    id: 'v0.6.93-bug-burndown-ledger',
    status: 'accepted',
    recordedStatus: 'bug-burndown-ledger-refreshed-not-release-ready',
    gateStatus: 'refreshed-no-known-active-test-visible-p0-p1-blockers',
    evidence: Object.freeze([V0693_DOC, V0693_FIXTURE, V0693_SUITE]),
    reconciliation: 'no known active test-visible P0/P1 blockers after recorded validation; not a claim of no possible bugs in every environment',
  }),
  Object.freeze({
    id: 'v0.6.94-release-checklist-governance-review',
    status: 'accepted',
    recordedStatus: 'release-governance-reviewed-not-release-ready',
    gateStatus: 'reviewed-no-release-action-authorized',
    evidence: Object.freeze([V0694_DOC, V0694_FIXTURE, V0694_SUITE]),
    reconciliation: 'release governance accepted no-release-action posture and classified true interactive coverage as deferred/manual unless promoted later',
  }),
])
const CURRENT_REPO_FACT_ROWS = Object.freeze([
  Object.freeze({
    id: 'release-target',
    status: 'reconciled',
    fact: RELEASE_TARGET,
    evidence: Object.freeze([DOC, ROADMAP]),
  }),
  Object.freeze({
    id: 'package-version',
    status: 'reconciled-unchanged',
    fact: '`package.json` remains 0.6.8',
    evidence: Object.freeze([PACKAGE_FILE]),
  }),
  Object.freeze({
    id: 'no-release-mechanics',
    status: 'reconciled-no-action-authorized-or-performed',
    fact: 'no npm version, npm publish, tags, GitHub releases/assets, release asset uploads, signing/cosign/SLSA/security attestations, or hosted release workflow queries',
    evidence: Object.freeze([V0694_DOC, DOC]),
  }),
  Object.freeze({
    id: 'native-helper-path-platform',
    status: 'reconciled-unchanged',
    fact: 'embedded native helper path remains native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/ with no path/binary rename or second platform claim',
    evidence: Object.freeze([NATIVE_ROOT]),
  }),
  Object.freeze({
    id: 'default-resolver-default-go',
    status: 'reconciled-no-expansion',
    fact: 'no default resolver/default Go expansion beyond accepted explicit cutovers',
    evidence: Object.freeze([KERNEL_FILE, V0694_DOC]),
  }),
  Object.freeze({
    id: 'bridge-only-worker-delivery',
    status: 'reconciled-preserved',
    fact: 'worker delivery remains bridge-only; Go send-keys and active wakePane remain unauthorized',
    evidence: Object.freeze([DELIVERY_POLICY_FILE, GO_SOURCE_FILE]),
  }),
  Object.freeze({
    id: 'true-interactive-operator-coverage',
    status: 'reconciled-deferred-manual-not-current-blocker',
    fact: 'true interactive pi/TUI/operator/model pass was not performed and remains deferred/manual unless release ownership promotes it',
    evidence: Object.freeze([V0692_DOC, V0694_DOC]),
  }),
  Object.freeze({
    id: 'deferred-runtime-migrations',
    status: 'reconciled-deferred-blocked',
    fact: 'state/task/PlanRun/mailbox/governance, team panel/UI, and release/package control-plane migrations remain deferred/blocked unless separately gated',
    evidence: Object.freeze([V0690_DOC, V0693_DOC, V0694_DOC]),
  }),
  Object.freeze({
    id: 'change-scope',
    status: 'reconciled-docs-tests-roadmap-gitignore-only',
    fact: 'T050 changes are limited to docs/tests/.gitignore/roadmap evidence files',
    evidence: Object.freeze([DOC]),
  }),
])
const VALIDATION_SNAPSHOT = Object.freeze([
  Object.freeze({ command: 'node --check tests/fixtures/kernel/v0695/v07EvidenceReconciliation.cjs', status: 'pass', scope: 'new fixture syntax' }),
  Object.freeze({ command: 'node --check tests/suites/go-kernel-v0695-v07-evidence-reconciliation.cjs', status: 'pass', scope: 'new suite syntax' }),
  Object.freeze({ command: 'node tests/run.cjs go-kernel-v0695-v07-evidence-reconciliation', status: 'pass', scope: 'new evidence reconciliation suite' }),
  Object.freeze({ command: 'node tests/run.cjs go-kernel-v0691-v07-clean-temp-p95-refresh go-kernel-v0692-v07-clean-temp-manual-rc-refresh go-kernel-v0693-v07-bug-burndown-ledger go-kernel-v0694-v07-release-governance-review go-kernel-v0695-v07-evidence-reconciliation tools-state', status: 'pass', scope: 'focused v0.7 readiness + T046 regression' }),
  Object.freeze({ command: 'npm test', status: 'pass', scope: 'full regression' }),
  Object.freeze({ command: 'npm run typecheck', status: 'pass', scope: 'TypeScript static validation' }),
  Object.freeze({ command: 'npm run -s check:boundaries', status: 'pass', scope: 'boundary guardrails' }),
  Object.freeze({ command: 'git diff --check', status: 'pass', scope: 'diff whitespace guard' }),
  Object.freeze({ command: 'node -p "require(\'./package.json\').version"', status: 'pass', scope: 'package version guard returns 0.6.8' }),
  Object.freeze({ command: 'sha256sum -c native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/SHA256SUMS', status: 'pass', scope: 'native artifact checksum guard' }),
  Object.freeze({ command: 'status/diff forbidden artifact guard', status: 'pass', scope: 'only docs/tests/.gitignore/roadmap changed; no lock/module/raw/release/signing/archive artifacts' }),
])
const REMAINING_DECISION_AND_POLICY_ROWS = Object.freeze([
  Object.freeze({
    id: 'release-decision',
    status: RELEASE_DECISION_STATUS,
    conclusion: 'final release/tag/npm action requires explicit user authorization; this slice does not authorize or perform release mechanics',
    releaseReadyClaim: false,
    releaseActionAuthorized: false,
    releaseActionPerformed: false,
  }),
  Object.freeze({
    id: 'continuous-no-raw-artifact-policy',
    status: 'continuous-in-force',
    conclusion: 'raw logs, validation output, transcripts, state archives, screenshots, temp homes, raw hosted records, release artifacts, tarballs, signatures, and raw JSON remain out of repo',
    releaseReadyClaim: false,
    releaseActionAuthorized: false,
    releaseActionPerformed: false,
  }),
])
const RAW_ARTIFACT_NO_CHECKIN_POLICY = Object.freeze([
  'raw logs',
  'raw validation output',
  'transcripts',
  'state archives',
  'screenshots',
  'temp homes',
  'raw hosted records',
  'release artifacts',
  'tarballs',
  'signatures',
  'raw JSON',
])
const NO_LEAK_CONCLUSIONS = Object.freeze({
  rawLogsCheckedIn: false,
  rawValidationOutputCheckedIn: false,
  transcriptsCheckedIn: false,
  stateArchivesCheckedIn: false,
  screenshotsCheckedIn: false,
  tempHomesCheckedIn: false,
  rawHostedRecordsCheckedIn: false,
  releaseArtifactsCheckedIn: false,
  tarballsCheckedIn: false,
  signaturesCheckedIn: false,
  rawJsonCheckedIn: false,
})
const STILL_UNAUTHORIZED_OR_DEFERRED = Object.freeze([
  'release-ready claim',
  'npm version',
  'npm publish',
  'tag creation/push',
  'GitHub release/assets',
  'release asset upload',
  'signing/cosign/SLSA/security attestation',
  'hosted release workflow/query',
  'package source approval',
  'package metadata/lifecycle hook/optional native dependency/native dependency/postinstall/download/runtime build flow',
  'release/package control-plane migration',
  'default resolver/default Go expansion beyond accepted explicit cutovers',
  'native helper path/binary rename',
  'second platform claim',
  'runtime/source behavior changes',
  'Go source changes',
  'tmux runtime changes',
  'state/task/PlanRun/mailbox/governance migration',
  'team panel/UI migration',
  'hidden TypeScript tmux fallback reintroduction',
  'Go send-keys',
  'active Go wakePane',
  'true interactive pi/TUI/operator/model coverage claim',
])
const EXPECTED_CHANGED_FILES = Object.freeze([
  '.gitignore',
  ROADMAP,
  DOC,
  'tests/fixtures/kernel/v0695/v07EvidenceReconciliation.cjs',
  'tests/suites/go-kernel-v0695-v07-evidence-reconciliation.cjs',
])
const NATIVE_ARTIFACT_SNAPSHOT = Object.freeze({
  root: NATIVE_ROOT,
  helperPath: 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/agentteam-tmuxSnapshotParse',
  helperSha256: 'a654e58ff5a2c61b6c03d2fa5e05bc3d888243c49eecdd745f10c24d82f4f2a9',
  helperSize: 3521170,
  manifestSha256: '1eb45fb80806940f164a7c4e0a54cd063018fd943856a640897fa3dc11b90b6d',
  provenanceSha256: '69598eff59490feb76d48c325ebc6ee9022951832ee52935cd3f12cd5fb594b1',
  attestationSha256: 'c00b8ad0c65a66957609c6a2449d162a0eb447239ca8f9a5b3406f2ff3d71a83',
  checksumsSha256: '7879455dfc22823b86185c19d829d33e3bdb8651f75320f5d4b65421a3aabdbd',
  sourceRevision: '6603982e9c0130b9298a43b8214fd6887d7a125b',
  forbiddenSmokeKeys: Object.freeze(['workerLifecycleWakePane']),
})
const v07EvidenceReconciliation = Object.freeze({
  schemaVersion: V07_EVIDENCE_RECONCILIATION_SCHEMA_VERSION,
  theme: V07_EVIDENCE_RECONCILIATION_THEME,
  releaseTarget: RELEASE_TARGET,
  packageVersion: PACKAGE_VERSION,
  status: STATUS,
  reconciliationGateStatus: RECONCILIATION_GATE_STATUS,
  releaseDecisionStatus: RELEASE_DECISION_STATUS,
  evidenceReconciled: true,
  releaseDecisionPending: true,
  explicitUserReleaseAuthorizationRequired: true,
  releaseReadyClaim: false,
  releaseActionAuthorized: false,
  releaseActionPerformed: false,
  ready: false,
  packageVersionChanged: false,
  npmVersionPerformed: false,
  npmPublished: false,
  tagCreated: false,
  githubReleaseCreated: false,
  releaseAssetsCreated: false,
  signingPerformed: false,
  hostedReleaseQueryPerformed: false,
  packageSourceApproved: false,
  defaultResolverExpanded: false,
  defaultGoExpanded: false,
  nativeHelperRebuilt: false,
  nativePathRenamed: false,
  secondPlatformClaimed: false,
  lifecycleHooksAdded: false,
  optionalNativeDependencyFlowAdded: false,
  runtimeBehaviorChanged: false,
  sourceBehaviorChanged: false,
  goSourceChanged: false,
  tmuxRuntimeChanged: false,
  hiddenFallbacksReintroduced: false,
  workerDeliveryBridgeOnly: true,
  goSendKeysAuthorized: false,
  activeWakePaneAuthorized: false,
  stateTaskPlanRunMailboxGovernanceMigrated: false,
  teamPanelUiMigrated: false,
  releasePackageControlPlaneMigrated: false,
  trueInteractiveOperatorCoverageDecision: 'deferred-manual-operator-procedure-not-current-blocker',
  trueInteractivePiTuiOperatorModelPassPerformed: false,
  acceptedEvidenceChain: ACCEPTED_EVIDENCE_CHAIN,
  currentRepoFactRows: CURRENT_REPO_FACT_ROWS,
  validationSnapshot: VALIDATION_SNAPSHOT,
  remainingDecisionAndPolicyRows: REMAINING_DECISION_AND_POLICY_ROWS,
  rawArtifactNoCheckinPolicy: RAW_ARTIFACT_NO_CHECKIN_POLICY,
  noLeakConclusions: NO_LEAK_CONCLUSIONS,
  stillUnauthorizedOrDeferred: STILL_UNAUTHORIZED_OR_DEFERRED,
  expectedChangedFiles: EXPECTED_CHANGED_FILES,
  doc: DOC,
  roadmap: ROADMAP,
  deliveryPolicyFile: DELIVERY_POLICY_FILE,
  goSourceFile: GO_SOURCE_FILE,
  kernelFile: KERNEL_FILE,
  packageFile: PACKAGE_FILE,
  nativeRoot: NATIVE_ROOT,
  activeCapabilities: ACTIVE_CAPABILITIES,
  activeWorkerLifecycleOperations: ACTIVE_WORKER_LIFECYCLE_OPERATIONS,
  nativeArtifactSnapshot: NATIVE_ARTIFACT_SNAPSHOT,
})

module.exports = {
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
}
