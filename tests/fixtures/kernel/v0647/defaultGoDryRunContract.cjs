const DEFAULT_GO_DRY_RUN_SCHEMA_VERSION = 1
const DEFAULT_GO_DRY_RUN_THEME = 'v0.6.47 non-mutating default-Go dry-run implementation'
const CURRENT_RELEASE_TARGET = 'v0.7.0 = core refactor + performance baseline + bug burn-down release'
const STATUS = 'default-go-dry-run-implemented-ready-false'
const SELECTED_MODULE = 'tmuxSnapshotParse'
const SELECTED_MODULE_LABEL = 'tmux snapshot parser'
const GO_AUTHORITY = 'tmuxSnapshotParse-parser-only'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const REQUIRED_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint'])

const DRY_RUN_RUNTIME_PATH = Object.freeze({
  cli: 'scripts/verify-v0647-default-go-dry-run.cjs',
  harness: 'scripts/lib/v0647-default-go-dry-run-harness.cjs',
  resultMarker: 'v0.6.47-default-go-dry-run',
  futureResolverMode: 'current-default-go-embedded-cutover',
  executionRoot: 'os-temp-only',
  buildsHelperToTemp: true,
  usesPackagedPreviewFixture: true,
  mutatesProductDefaults: false,
  mutatesPackageMetadata: false,
  writesRepoArtifacts: false,
  rawEvidenceCheckedIn: false,
})

const SUMMARY_CONTRACT = Object.freeze({
  ok: true,
  ready: false,
  wouldUseGoForTmuxSnapshotParse: true,
  defaultBehaviorChanged: true,
  defaultGoEnabled: true,
  defaultResolverEnabled: true,
  defaultRuntime: 'go/embedded-helper',
  fallbackDeleted: true,
  typeScriptFallbackDeleted: true,
  fallbackDeletionApproved: false,
  goAuthority: GO_AUTHORITY,
  goCutoverExplicitOnly: true,
  goPackagedPreviewExplicitOnly: true,
  packageReleaseApproved: false,
  nativePackageApproved: false,
  releaseReadyClaim: false,
})

const SMOKE_CHECKS = Object.freeze([
  Object.freeze({ id: 'direct-helper-health', status: 'implemented', requiresGoToolchain: true }),
  Object.freeze({ id: 'direct-helper-tmuxSnapshotParse', status: 'implemented', requiresGoToolchain: true }),
  Object.freeze({ id: 'explicit-go-cutover-adapter', status: 'implemented', requiresGoToolchain: true }),
  Object.freeze({ id: 'future-default-resolver-dry-run', status: 'implemented', requiresGoToolchain: true }),
  Object.freeze({ id: 'default-disabled-control', status: 'implemented', requiresGoToolchain: false }),
])

const FAILURE_CLASSES = Object.freeze([
  'missing',
  'corrupt',
  'wrongVersion',
  'unsupported',
  'malformed',
])

const FAILURE_EXPECTATIONS = Object.freeze({
  missing: 'manifest-missing',
  corrupt: 'manifest-invalid',
  wrongVersion: 'version-skew',
  unsupported: 'unsupported-platform',
  malformed: 'helper-unsafe-response-shape',
})

const PACKAGE_RUNTIME_INVARIANTS = Object.freeze({
  packageName: 'pi-agentteam',
  packageVersion: PACKAGE_VERSION,
  packageType: 'module',
  piExtensions: Object.freeze(['./index.ts']),
  productFacade: 'TypeScript/pi remains the product and control-plane facade.',
  runtimeBehaviorChanged: false,
  packageVersionChanged: false,
  packageMetadataChanged: false,
  packageFilesChangedForNative: false,
  defaultGoEnabled: true,
  defaultResolverEnabled: true,
  fallbackDeletionApproved: false,
  typeScriptFallbackDeleted: true,
  packageReleaseApproved: false,
  tagCreated: false,
  releaseCreated: false,
  npmPublished: false,
  npmVersionChanged: false,
  nativePackageApproved: false,
  releaseAssetCreated: false,
})

const TS_PI_CONTROL_PLANE_BOUNDARIES = Object.freeze([
  'tmux command execution and capture, including list-panes and snapshot text capture',
  'pane labels, pane/window lifecycle, session lifecycle, and worker lifecycle',
  'leader-gated task/message/report governance and PlanRun control',
  'state/repository/sidecar/outbox writes and legacy compatibility',
  '/team UI data loading, rendering, and compact/full-text read boundaries',
  'package metadata, package version, package files, tag/release/npm governance, and rollback coordination',
])

const GO_ALLOWED_SCOPE = Object.freeze([
  'parse TypeScript-captured tmux snapshot text',
  'return TmuxSnapshot-compatible compact pane snapshot output',
  'run inside a non-mutating reviewer dry-run verifier for future default resolver logic',
])

const GO_FORBIDDEN_SCOPE = Object.freeze([
  'tmux execution',
  'tmux capture',
  'pane lifecycle',
  'session lifecycle',
  'worker lifecycle',
  'state writes',
  'task governance',
  'report governance',
  'PlanRun governance',
  'mailbox full-text reads',
  'report full-text reads',
  'UI rendering',
  'package release control',
])

const STOP_ITEMS = Object.freeze([
  'default Go enabled',
  'default resolver enabled',
  'TypeScript fallback deleted',
  'fallback deletion approved',
  'v0.7 release-ready',
  'tag/release created',
  'npm version/publish',
  'native package approved',
])

const NO_LEAK_MARKERS = Object.freeze([
  'V0647_DEFAULT_GO_DRY_RUN_FULL_TEXT_SENTINEL_DO_NOT_LEAK',
  'DEFAULT_GO_DRY_RUN_STDOUT_SHOULD_NOT_LEAK',
  'DEFAULT_GO_DRY_RUN_STDERR_SHOULD_NOT_LEAK',
  'DEFAULT_GO_DRY_RUN_MAILBOX_BODY_SHOULD_NOT_LEAK',
  'DEFAULT_GO_DRY_RUN_REPORT_BODY_SHOULD_NOT_LEAK',
  'MailboxMessage.text',
  'TaskReport.text',
  'full mailbox body',
  'full report body',
  'raw tmux stdout',
  'raw tmux stderr',
  'raw state archive',
  'absolute helper path',
])

const VALIDATION_COMMANDS = Object.freeze([
  'node --check scripts/lib/v0647-default-go-dry-run-harness.cjs',
  'node --check scripts/verify-v0647-default-go-dry-run.cjs',
  'node --check tests/fixtures/kernel/v0647/defaultGoDryRunContract.cjs',
  'node --check tests/suites/go-kernel-v0647-non-mutating-default-go-dry-run.cjs',
  'node scripts/verify-v0647-default-go-dry-run.cjs --json',
  'node tests/run.cjs go-kernel-v0647-non-mutating-default-go-dry-run',
  'npm test',
  'npm run typecheck',
  'npm run -s check:boundaries',
  'git diff --check',
])

const defaultGoDryRunContract = Object.freeze({
  schemaVersion: DEFAULT_GO_DRY_RUN_SCHEMA_VERSION,
  theme: DEFAULT_GO_DRY_RUN_THEME,
  releaseTarget: CURRENT_RELEASE_TARGET,
  status: STATUS,
  ready: false,
  selectedModule: SELECTED_MODULE,
  selectedModuleLabel: SELECTED_MODULE_LABEL,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  requiredCapabilities: REQUIRED_CAPABILITIES,
  dryRunRuntimePath: DRY_RUN_RUNTIME_PATH,
  summaryContract: SUMMARY_CONTRACT,
  smokeChecks: SMOKE_CHECKS,
  failureClasses: FAILURE_CLASSES,
  failureExpectations: FAILURE_EXPECTATIONS,
  packageRuntimeInvariants: PACKAGE_RUNTIME_INVARIANTS,
  tsPiControlPlaneBoundaries: TS_PI_CONTROL_PLANE_BOUNDARIES,
  goAllowedScope: GO_ALLOWED_SCOPE,
  goForbiddenScope: GO_FORBIDDEN_SCOPE,
  stopItems: STOP_ITEMS,
  noLeak: Object.freeze({
    status: 'guarded-now',
    markers: NO_LEAK_MARKERS,
    rawStdoutCheckedIn: false,
    rawStderrCheckedIn: false,
    rawStateArchivesCheckedIn: false,
    rawFullBodiesCheckedIn: false,
    rawTimingJsonCheckedIn: false,
    nativeBinariesCheckedIn: false,
    releaseAssetsCheckedIn: false,
  }),
  validationCommands: VALIDATION_COMMANDS,
  recommendation: 'v0.6.47 originally implemented the non-mutating default-Go dry-run verifier path; v0.6.48 now supersedes it with approved embedded default Go for tmuxSnapshotParse while package/native release work, npm/tag/release actions, and v0.7 release-ready status remain unapproved.',
})

module.exports = {
  CURRENT_RELEASE_TARGET,
  DEFAULT_GO_DRY_RUN_SCHEMA_VERSION,
  DEFAULT_GO_DRY_RUN_THEME,
  DRY_RUN_RUNTIME_PATH,
  FAILURE_CLASSES,
  FAILURE_EXPECTATIONS,
  GO_ALLOWED_SCOPE,
  GO_AUTHORITY,
  GO_FORBIDDEN_SCOPE,
  HELPER_VERSION,
  NO_LEAK_MARKERS,
  PACKAGE_RUNTIME_INVARIANTS,
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  REQUIRED_CAPABILITIES,
  SELECTED_MODULE,
  SELECTED_MODULE_LABEL,
  SMOKE_CHECKS,
  STATUS,
  STOP_ITEMS,
  SUMMARY_CONTRACT,
  TS_PI_CONTROL_PLANE_BOUNDARIES,
  VALIDATION_COMMANDS,
  defaultGoDryRunContract,
}
