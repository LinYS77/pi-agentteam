const GO_CUTOVER_CANDIDATE_SELECTION_SCHEMA_VERSION = 1
const GO_CUTOVER_CANDIDATE_SELECTION_THEME = 'v0.6.44 Go cutover candidate selection'
const CURRENT_RELEASE_TARGET = 'v0.7.0 = core refactor + performance baseline + bug burn-down release'
const STATUS = 'candidate-selected-planning-evidence-ready-false'
const SELECTED_MODULE = 'tmuxSnapshotParse'

const PACKAGE_RUNTIME_INVARIANTS = Object.freeze({
  packageName: 'pi-agentteam',
  packageVersion: '0.6.8',
  packageType: 'module',
  piExtensions: Object.freeze(['./index.ts']),
  productFacade: 'TypeScript/pi remains the product and control-plane facade.',
  runtimeBehaviorChanged: false,
  packageVersionChanged: false,
  packageMetadataChanged: false,
  tagCreated: false,
  npmPublished: false,
  nativeWorkPerformed: false,
  defaultGoApproved: false,
  defaultResolverApproved: false,
  fallbackDeletionApproved: false,
  releaseAssetCreated: false,
})

const NO_LEAK_MARKERS = Object.freeze([
  'V0644_GO_CUTOVER_CANDIDATE_FULL_TEXT_SENTINEL_DO_NOT_LEAK',
  'MailboxMessage.text',
  'TaskReport.text',
  'full mailbox body',
  'full report body',
  'worker transcript',
  'terminal raw log',
  'raw tmux stdout',
  'state archive',
  'raw state archive',
  'BEGIN PRIVATE KEY',
  'raw hosted record',
  'provider response id',
  'raw tool-call id',
])

const CANDIDATE_RATIONALE = Object.freeze([
  Object.freeze({
    id: 'narrow-boundary',
    status: 'supports-selection',
    evidence: 'Input is TypeScript-captured tmux snapshot text plus capturedAt; output is compact TmuxSnapshot data.',
  }),
  Object.freeze({
    id: 'deterministic-parser',
    status: 'supports-selection',
    evidence: 'Parser semantics are deterministic and do not require live tmux, state, mailbox/report full text, provider calls, or user interaction.',
  }),
  Object.freeze({
    id: 'existing-parity-corpus',
    status: 'supports-selection',
    evidence: 'tests/fixtures/kernel/tmux/snapshotCases.cjs and tests/suites/go-kernel-tmux-snapshot-parser.cjs already exercise TypeScript, direct Go, and adapter paths.',
  }),
  Object.freeze({
    id: 'failure-can-fail-closed',
    status: 'supports-selection',
    evidence: 'Parser failure can become unknown/stale diagnostics instead of pane deletion, state mutation, or governance changes.',
  }),
])

const TS_PI_CONTROL_PLANE_BOUNDARIES = Object.freeze([
  'pi extension loading, commands, tools, hooks, schemas, prompts, and role routing',
  'tmux command execution and capture, including list-panes and snapshot text capture',
  'pane labels, pane/window lifecycle, and worker lifecycle',
  'leader-gated task/message/report governance and PlanRun control',
  'state/repository/sidecar/outbox writes and legacy compatibility',
  '/team UI data loading, rendering, and compact/full-text read boundaries',
  'package metadata, package version, package inclusion, release/tag/npm governance, and rollback coordination',
])

const GO_ALLOWED_SCOPE = Object.freeze([
  'parse TypeScript-captured tmux snapshot text',
  'return TmuxSnapshot-compatible compact output',
  'emit compact module-level diagnostics after a future cutover gate',
])

const GO_FORBIDDEN_SCOPE = Object.freeze([
  'tmux execution',
  'tmux capture',
  'pane lifecycle',
  'session lifecycle',
  'worker lifecycle',
  'state writes',
  'sidecar writes',
  'outbox writes',
  'task governance',
  'report governance',
  'PlanRun governance',
  'full mailbox body reads',
  'full report body reads',
  'UI control plane',
  'package release control',
  'daemon scheduler',
  'network listener',
])

const CUTOVER_GATE = Object.freeze([
  Object.freeze({ id: 'parity-corpus', status: 'future-required', required: true }),
  Object.freeze({ id: 'shadow-comparison', status: 'future-required', required: true }),
  Object.freeze({ id: 'focused-smoke', status: 'future-required', required: true }),
  Object.freeze({ id: 'focused-bench', status: 'future-required', required: true }),
  Object.freeze({ id: 'failure-classes', status: 'future-required', required: true }),
  Object.freeze({ id: 'fail-closed-diagnostics', status: 'future-required', required: true }),
  Object.freeze({ id: 'boundary-scans', status: 'future-required', required: true }),
  Object.freeze({ id: 'runtime-prerequisite-signoff', status: 'future-required', required: true }),
  Object.freeze({ id: 'fallback-deletion-plan', status: 'future-required', required: true }),
  Object.freeze({ id: 'release-rollback-plan', status: 'future-required', required: true }),
])

const PARITY_CHECKLIST = Object.freeze([
  'empty stdout returns successful empty snapshot',
  'trailing newline and CRLF rows normalize consistently',
  'malformed rows and too few fields are skipped',
  'empty pane id rows are skipped',
  'empty labels are retained',
  'empty current commands are retained',
  'duplicate pane ids preserve first-seen pane order and last-seen values',
  'extra tab fields after current command are ignored',
  'unicode labels and commands are preserved',
  'long labels and commands are preserved',
  'sentinel-like compact tmux labels do not become full-text leakage',
  'panes and byPaneId remain internally consistent',
  'successful parses return ok:true without parser error',
])

const FAILURE_CLASSES = Object.freeze([
  'missing-helper',
  'disabled-helper',
  'helper-unsupported-protocol',
  'helper-unsupported-version',
  'helper-unsupported-capability',
  'helper-timeout',
  'helper-spawn-error',
  'helper-crash',
  'helper-nonzero-exit',
  'helper-empty-response',
  'helper-malformed-json',
  'helper-jsonrpc-error',
  'helper-incompatible-response',
  'helper-unsafe-response-shape',
  'previous-helper-failure',
])

const FAIL_CLOSED_DIAGNOSTICS = Object.freeze({
  required: true,
  status: 'future-required',
  unknownStaleSnapshot: true,
  emptySuccessfulSnapshotOnFailure: false,
  destructiveStateUpdateOnFailure: false,
  clearPaneBindingsOnFailure: false,
  killPanesOnFailure: false,
  markWorkersErrorOnParserFailure: false,
  forceReconcileOnParserFailure: false,
  rawStdoutIncluded: false,
  rawStderrIncluded: false,
  stackTracesIncluded: false,
  absolutePathsIncluded: false,
  fullBodiesIncluded: false,
  diagnosticsFields: Object.freeze(['module', 'capability', 'cutoverFailureKind', 'reason']),
})

const FOCUSED_SMOKE_AND_BENCH = Object.freeze([
  Object.freeze({ id: 'fixture-syntax-check', command: 'node --check tests/fixtures/kernel/v0644/goCutoverCandidateSelection.cjs', status: 'required-now' }),
  Object.freeze({ id: 'suite-syntax-check', command: 'node --check tests/suites/go-kernel-v0644-go-cutover-candidate-selection.cjs', status: 'required-now' }),
  Object.freeze({ id: 'direct-guard-run', command: 'direct require-based suite invocation', status: 'required-now' }),
  Object.freeze({ id: 'npm-test', command: 'npm test', status: 'required-now' }),
  Object.freeze({ id: 'typecheck', command: 'npm run typecheck', status: 'required-now' }),
  Object.freeze({ id: 'boundary-check', command: 'npm run -s check:boundaries', status: 'required-now' }),
  Object.freeze({ id: 'diff-check', command: 'git diff --check', status: 'required-now' }),
  Object.freeze({ id: 'parser-direct-helper-smoke', command: 'future direct helper smoke against tmux corpus', status: 'future-required' }),
  Object.freeze({ id: 'parser-focused-bench', command: 'future parser bench excluding tmux subprocess cost', status: 'future-required' }),
])

const FALLBACK_DELETION_PREREQUISITES = Object.freeze([
  'explicit tmuxSnapshotParse module cutover gate pass with reviewer signoff',
  'parity corpus pass',
  'shadow comparison pass without raw artifacts',
  'focused smoke pass',
  'focused bench pass',
  'all failure classes covered',
  'fail-closed diagnostics implemented and tested',
  'runtime prerequisite signoff for helper availability and install/source policy',
  'release rollback/default-disable path reviewed without hidden TypeScript runtime fallback',
  'package/runtime invariants and no-leak guard remain green',
  'deletion targets in tmux/snapshot.ts and core/kernel.ts listed and reviewed',
  'TypeScript/pi authority boundaries remain unchanged',
])

const RELEASE_ROLLBACK = Object.freeze({
  hiddenRuntimeFallbackAllowed: false,
  allowedPaths: Object.freeze([
    'revert to prior known-good GitHub tag/npm version',
    'publish corrected npm version with documented fix or reviewed disable path',
  ]),
  requiredNotes: Object.freeze([
    'affected version',
    'failure class',
    'operator guidance',
    'follow-up guard',
  ]),
})

const NEXT_IMPLEMENTATION_ENTRY_CRITERIA = Object.freeze({
  decision: 'GO-for-next-bounded-implementation-slice',
  module: SELECTED_MODULE,
  ready: false,
  conditions: Object.freeze([
    'reuse tests/fixtures/kernel/tmux/snapshotCases.cjs as canonical corpus',
    'begin with fail-closed parser diagnostics evidence',
    'keep TypeScript as capture/control plane and active runtime until explicit future gate pass',
    'keep package version 0.6.8',
    'do not add lockfiles, Go modules, native binaries, release artifacts, raw logs, state archives, or full bodies',
  ]),
})

const STOP_ITEMS = Object.freeze([
  'v0.7 release-ready claim',
  'Go default enabled',
  'default resolver enabled',
  'TypeScript fallback deleted',
  'tmux execution moved to Go',
  'worker lifecycle moved to Go',
  'npm publish/version',
  'tag/release created',
  'native package approved',
  'fallback deletion approved',
  'whole Go rewrite',
  'state writes moved to Go',
  'task/report governance moved to Go',
  'PlanRun governance moved to Go',
  'full mailbox/report bodies moved to Go',
  'UI control plane moved to Go',
])

const goCutoverCandidateSelection = Object.freeze({
  schemaVersion: GO_CUTOVER_CANDIDATE_SELECTION_SCHEMA_VERSION,
  theme: GO_CUTOVER_CANDIDATE_SELECTION_THEME,
  releaseTarget: CURRENT_RELEASE_TARGET,
  status: STATUS,
  ready: false,
  selectedModule: SELECTED_MODULE,
  selectedModuleLabel: 'tmux snapshot parser',
  decision: 'GO-for-next-bounded-implementation-slice; STOP-for-runtime-cutover-default-release-fallback-deletion',
  releaseReadyClaim: false,
  runtimeBehaviorChanged: false,
  packageVersionChanged: false,
  tagCreated: false,
  npmPublished: false,
  nativeWorkPerformed: false,
  defaultGoApproved: false,
  defaultResolverApproved: false,
  fallbackDeletionApproved: false,
  packageReleaseApproved: false,
  releaseAssetsCreated: false,
  rawArtifactsCheckedIn: false,
  wholeGoRewrite: false,
  goDefaultEnabled: false,
  defaultGoEnabled: false,
  defaultResolverEnabled: false,
  releaseCreated: false,
  nativePackageApproved: false,
  tmuxExecutionMovedToGo: false,
  workerLifecycleMovedToGo: false,
  typeScriptFallbackDeleted: false,
  packageRuntimeInvariants: PACKAGE_RUNTIME_INVARIANTS,
  noLeak: Object.freeze({
    status: 'covered',
    markers: NO_LEAK_MARKERS,
    rawStateArchivesCheckedIn: false,
    rawFullBodiesCheckedIn: false,
    rawTmuxStdoutCheckedIn: false,
    rawTimingJsonCheckedIn: false,
    screenshotsCheckedIn: false,
    terminalRawLogsCheckedIn: false,
    workerTranscriptsCheckedIn: false,
    rawHostedRecordsCheckedIn: false,
  }),
  candidateRationale: CANDIDATE_RATIONALE,
  tsPiControlPlaneBoundaries: TS_PI_CONTROL_PLANE_BOUNDARIES,
  goAllowedScope: GO_ALLOWED_SCOPE,
  goForbiddenScope: GO_FORBIDDEN_SCOPE,
  cutoverGate: CUTOVER_GATE,
  parityChecklist: PARITY_CHECKLIST,
  failureClasses: FAILURE_CLASSES,
  failClosedDiagnostics: FAIL_CLOSED_DIAGNOSTICS,
  focusedSmokeAndBench: FOCUSED_SMOKE_AND_BENCH,
  fallbackDeletionPrerequisites: FALLBACK_DELETION_PREREQUISITES,
  releaseRollback: RELEASE_ROLLBACK,
  nextImplementationEntryCriteria: NEXT_IMPLEMENTATION_ENTRY_CRITERIA,
  stopItems: STOP_ITEMS,
  recommendation: 'Use v0.6.44 as Go cutover candidate selection only. tmuxSnapshotParse is GO for the next bounded implementation slice, but ready remains false and this does not authorize runtime cutover, default Go, default resolver, fallback deletion, package/native/release work, or v0.7 readiness.',
})

module.exports = {
  CANDIDATE_RATIONALE,
  CURRENT_RELEASE_TARGET,
  CUTOVER_GATE,
  FAIL_CLOSED_DIAGNOSTICS,
  FAILURE_CLASSES,
  FALLBACK_DELETION_PREREQUISITES,
  FOCUSED_SMOKE_AND_BENCH,
  GO_ALLOWED_SCOPE,
  GO_CUTOVER_CANDIDATE_SELECTION_SCHEMA_VERSION,
  GO_CUTOVER_CANDIDATE_SELECTION_THEME,
  GO_FORBIDDEN_SCOPE,
  NEXT_IMPLEMENTATION_ENTRY_CRITERIA,
  NO_LEAK_MARKERS,
  PACKAGE_RUNTIME_INVARIANTS,
  PARITY_CHECKLIST,
  RELEASE_ROLLBACK,
  SELECTED_MODULE,
  STATUS,
  STOP_ITEMS,
  TS_PI_CONTROL_PLANE_BOUNDARIES,
  goCutoverCandidateSelection,
}
