const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  CURRENT_RELEASE_TARGET,
  CUTOVER_GATE_PREP_ROWS,
  EXISTING_EVIDENCE,
  FAIL_CLOSED_CONTRACT,
  FAILURE_CLASSES,
  FALLBACK_DELETION_PREREQUISITES,
  GO_ALLOWED_SCOPE,
  GO_FORBIDDEN_SCOPE,
  NO_LEAK_MARKERS,
  OVERCLAIM_BANS,
  PACKAGE_RUNTIME_INVARIANTS,
  PARITY_CORPUS_CASES,
  ROLLBACK_DEFAULT_DISABLE_CRITERIA,
  SELECTED_MODULE,
  SELECTED_MODULE_LABEL,
  STATUS,
  STOP_ITEMS,
  TMUX_SNAPSHOT_CUTOVER_GATE_PREP_SCHEMA_VERSION,
  TMUX_SNAPSHOT_CUTOVER_GATE_PREP_THEME,
  TS_PI_CONTROL_PLANE_BOUNDARIES,
  VALIDATION_COMMANDS,
  tmuxSnapshotCutoverGatePrep,
} = require('../fixtures/kernel/v0645/tmuxSnapshotCutoverGatePrep.cjs')

const DOC = 'docs/perf/v0.6.45-tmux-snapshot-cutover-gate-prep.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0645/tmuxSnapshotCutoverGatePrep.cjs'
const SUITE = 'tests/suites/go-kernel-v0645-tmux-snapshot-cutover-gate-prep.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_DOC = [
  '# v0.6.45 tmuxSnapshotParse Cutover Gate Prep',
  'Result: v0.6.45 prepares the future `tmuxSnapshotParse` module cutover gate with docs, deterministic fixture data, and guard coverage only.',
  'Final result remains `ready:false`.',
  'implementation-prep evidence only',
  'No runtime behavior changes are made.',
  'default/unset remains disabled/TypeScript',
  '`go-cutover` remains explicit helper-path only',
  '`go-packaged-preview` remains explicit preview only and non-default',
  'The TypeScript parser fallback remains present and active where it is currently allowed.',
  '## Gate Prep Scope',
  '| Selected module | `tmuxSnapshotParse` / tmux snapshot parser |',
  '## Evidence Mapped Into The Gate',
  'tests/fixtures/kernel/tmux/snapshotCases.cjs',
  'tests/suites/go-kernel-tmux-snapshot-parser.cjs',
  'tests/suites/go-kernel-tmux-cutover-failure-classes.cjs',
  'tests/suites/go-kernel-v0420-refresh-cutover-safety.cjs',
  'tests/suites/go-kernel-v0421-packaged-preview-resolver.cjs',
  'tests/suites/go-kernel-v0425-resolver-default-cutover-gate.cjs',
  '## Parity Corpus Criteria',
  'empty stdout',
  'duplicate pane ids keep first order and last values',
  'mixed corpus canonical snapshot',
  '## Fail-Closed Criteria',
  'unknown/stale snapshot',
  'TypeScript parser fallback callback is not invoked',
  'not a successful empty snapshot',
  'does not clear pane bindings',
  'does not kill panes',
  'does not mark workers error',
  'does not write state',
  '## No-Leak Criteria',
  'raw stdout',
  'raw stderr',
  'absolute helper paths',
  'full mailbox/report bodies',
  'worker transcripts',
  'terminal raw logs',
  'state archives',
  '## Fallback Deletion Prerequisites',
  'TypeScript runtime fallback deletion is not approved in v0.6.45.',
  '## Rollback And Default-Disable Criteria',
  'Rollback is release governance, not hidden TypeScript runtime fallback',
  '## Explicit STOP Items',
  'default Go enablement',
  'default resolver enablement',
  'TypeScript fallback deletion',
  'tag or GitHub release creation',
  'npm version or npm publish',
  'v0.7 release-ready claim',
  '## Validation',
  'Use v0.6.45 as tmuxSnapshotParse cutover gate prep only.',
]
const REQUIRED_ROADMAP = [
  'v0.6.45 tmuxSnapshotParse cutover gate prep',
  'docs/perf/v0.6.45-tmux-snapshot-cutover-gate-prep.md',
  'guardable prerequisites for a future module cutover gate',
  '当前仍为 `ready:false`',
  'v0.6.45 在 v0.6.44 选中的 `tmuxSnapshotParse` 基础上准备 cutover gate',
  'implementation-prep evidence only',
  '不启用 default Go、不启用 default resolver、不删除 TypeScript fallback、不把 tmux execution/capture/lifecycle/state/governance 移到 Go、不做 tag/release/npm/native/package 工作',
  '**v0.6.45 tmuxSnapshotParse cutover gate prep**',
  'parity/fail-closed/no-leak/fallback-prereq/rollback-default-disable guard',
]
const POSITIVE_OVERCLAIMS = [
  'default Go enabled: true',
  'default Go is enabled',
  'default resolver enabled: true',
  'default resolver is enabled',
  'TS fallback deleted: true',
  'TypeScript fallback deleted: true',
  'TypeScript fallback deletion approved: true',
  'fallback deletion approved: true',
  'Go now owns tmux execution',
  'tmux execution moved to Go: true',
  'Go now owns tmux capture',
  'tmux capture moved to Go: true',
  'Go now owns worker lifecycle',
  'worker lifecycle moved to Go: true',
  'state ownership moved to Go: true',
  'task/report governance moved to Go: true',
  'v0.7 release-ready approval is granted',
  'v0.7 is release-ready',
  'v0.7 is release ready',
  'ready for release',
  'release can ship',
  'tag/release created: true',
  'tag was created',
  'GitHub release created',
  'npm publish completed',
  'npm version completed',
  'native package approved: true',
  'native helper package approved: true',
]
const REQUIRED_STOP_TERMS = [
  'default Go enablement',
  'default resolver enablement',
  'TypeScript fallback deletion',
  'tmux execution moved to Go',
  'tmux capture moved to Go',
  'worker lifecycle moved to Go',
  'state writes moved to Go',
  'task/report governance moved to Go',
  'PlanRun governance moved to Go',
  'full mailbox/report bodies moved to Go',
  'UI/control plane moved to Go',
  'package/native metadata changes',
  'native package approval',
  'tag or GitHub release creation',
  'npm version or npm publish',
  'v0.7 release-ready claim',
]
const REQUIRED_EXISTING_FILES = [
  'docs/perf/v0.6.44-go-cutover-candidate-selection.md',
  'tests/fixtures/kernel/v0644/goCutoverCandidateSelection.cjs',
  'tests/suites/go-kernel-v0644-go-cutover-candidate-selection.cjs',
  'tests/fixtures/kernel/tmux/snapshotCases.cjs',
  'tests/suites/go-kernel-tmux-snapshot-parser.cjs',
  'tests/fixtures/kernel/jsonrpc/protocolCases.cjs',
  'tests/suites/go-kernel-protocol-contract.cjs',
  'tests/suites/go-kernel-tmux-cutover-failure-classes.cjs',
  'tests/suites/go-kernel-v0420-refresh-cutover-safety.cjs',
  'tests/suites/go-kernel-v0421-packaged-preview-resolver.cjs',
  'tests/suites/go-kernel-v0425-resolver-default-cutover-gate.cjs',
  'tmux/snapshot.ts',
  'core/kernel.ts',
  'teamPanel/dataSource.ts',
  'runtime/repository.ts',
  'adapters/tmux/teamPanes.ts',
]
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]
const FORBIDDEN_ARTIFACT = /(?:^|\/)(?:pi-agentteam-.*\.tgz|.*\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig))$/i
const FORBIDDEN_RAW_EVIDENCE = /(?:^|\/)(?:.*tmux-snapshot-cutover-gate.*\.json|.*v0645.*raw.*|.*raw-tmux.*|.*tmux.*stdout.*|.*tmux.*stderr.*|.*state-archive.*|.*raw-state.*|.*mailbox.*body.*|.*report.*body.*|.*worker.*transcript.*|.*screenshot.*|.*terminal.*raw.*log.*|.*hosted.*record.*)$/i

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
}

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'data') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertNoPositiveOverclaims(source, label) {
  for (const forbidden of POSITIVE_OVERCLAIMS) assert.equal(source.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  assert.equal(exists(root, ROADMAP), true, `${ROADMAP} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoPositiveOverclaims(doc, DOC)
  assertNoPositiveOverclaims(roadmap, ROADMAP)
  assert.match(doc, /Result: v0\.6\.45 prepares the future `tmuxSnapshotParse` module cutover gate/i)
  assert.match(doc, /Final result remains `ready:false`\./)
  assert.match(doc, /TypeScript runtime fallback deletion is not approved in v0\.6\.45\./)
  assert.match(doc, /rollback is release governance, not hidden TypeScript runtime fallback/i)
  assert.match(doc, /No runtime behavior changes are made\./)
  assert.equal(/"records"\s*:|"profileSummary"\s*:|"runId"\s*:/i.test(doc), false, `${DOC} must not embed raw timing JSON`)
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(tmuxSnapshotCutoverGatePrep)), tmuxSnapshotCutoverGatePrep, 'fixture should be plain deterministic data')
  assert.equal(tmuxSnapshotCutoverGatePrep.schemaVersion, TMUX_SNAPSHOT_CUTOVER_GATE_PREP_SCHEMA_VERSION)
  assert.equal(tmuxSnapshotCutoverGatePrep.theme, TMUX_SNAPSHOT_CUTOVER_GATE_PREP_THEME)
  assert.equal(tmuxSnapshotCutoverGatePrep.releaseTarget, CURRENT_RELEASE_TARGET)
  assert.equal(tmuxSnapshotCutoverGatePrep.status, STATUS)
  assert.equal(tmuxSnapshotCutoverGatePrep.ready, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.selectedModule, SELECTED_MODULE)
  assert.equal(tmuxSnapshotCutoverGatePrep.selectedModule, 'tmuxSnapshotParse')
  assert.equal(tmuxSnapshotCutoverGatePrep.selectedModuleLabel, SELECTED_MODULE_LABEL)
  assert.equal(tmuxSnapshotCutoverGatePrep.runtimeBehaviorChanged, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.defaultGoEnabled, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.defaultResolverEnabled, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.goCutoverDefaultEnabled, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.goPackagedPreviewDefaultEnabled, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.typeScriptFallbackDeleted, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.fallbackDeletionApproved, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.packageVersionChanged, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.packageMetadataChanged, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.tagCreated, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.releaseCreated, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.npmPublished, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.npmVersionChanged, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.nativeWorkPerformed, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.nativePackageApproved, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.releaseReadyClaim, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.packageReleaseApproved, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.releaseAssetsCreated, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.rawArtifactsCheckedIn, false)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.packageRuntimeInvariants, PACKAGE_RUNTIME_INVARIANTS)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.existingEvidence, EXISTING_EVIDENCE)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.parityCorpusCases, PARITY_CORPUS_CASES)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.cutoverGatePrepRows, CUTOVER_GATE_PREP_ROWS)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.failureClasses, FAILURE_CLASSES)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.failClosedContract, FAIL_CLOSED_CONTRACT)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.noLeak.markers, NO_LEAK_MARKERS)
  assert.equal(tmuxSnapshotCutoverGatePrep.noLeak.rawStdoutCheckedIn, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.noLeak.rawStderrCheckedIn, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.noLeak.rawStateArchivesCheckedIn, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.noLeak.rawFullBodiesCheckedIn, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.noLeak.rawTimingJsonCheckedIn, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.noLeak.screenshotsCheckedIn, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.noLeak.terminalRawLogsCheckedIn, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.noLeak.workerTranscriptsCheckedIn, false)
  assert.equal(tmuxSnapshotCutoverGatePrep.noLeak.rawHostedRecordsCheckedIn, false)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.tsPiControlPlaneBoundaries, TS_PI_CONTROL_PLANE_BOUNDARIES)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.goAllowedScope, GO_ALLOWED_SCOPE)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.goForbiddenScope, GO_FORBIDDEN_SCOPE)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.fallbackDeletionPrerequisites, FALLBACK_DELETION_PREREQUISITES)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.rollbackDefaultDisableCriteria, ROLLBACK_DEFAULT_DISABLE_CRITERIA)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.stopItems, STOP_ITEMS)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.overclaimBans, OVERCLAIM_BANS)
  assert.deepEqual(tmuxSnapshotCutoverGatePrep.validationCommands, VALIDATION_COMMANDS)
  assert.match(tmuxSnapshotCutoverGatePrep.recommendation, /ready remains false/i)
}

function assertGateRowsAndEvidence() {
  const rows = new Map(CUTOVER_GATE_PREP_ROWS.map(row => [row.id, row]))
  for (const id of ['candidate-selection', 'parity-corpus', 'jsonrpc-protocol-contract', 'go-cutover-failure-classes', 'go-packaged-preview-failure-classes', 'fail-closed-diagnostics', 'no-leak-diagnostics', 'refresh-safety-no-destructive-state', 'boundary-authority-scans', 'package-runtime-invariants']) {
    assert.equal(rows.get(id)?.deletionPrerequisite, true, `gate row ${id} should be fallback deletion prerequisite`)
    assert.notEqual(rows.get(id)?.status, undefined, `gate row ${id} should exist`)
  }
  for (const id of ['shadow-comparison-without-raw-artifacts', 'focused-parser-bench', 'runtime-helper-availability-signoff', 'package-release-ownership-signoff', 'fallback-deletion-target-review', 'rollback-default-disable-review']) {
    assert.equal(rows.get(id)?.status, 'future-required', `gate row ${id} should remain future-required`)
  }
  const evidence = new Map(EXISTING_EVIDENCE.map(item => [item.id, item]))
  assert.equal(evidence.get('parser-parity-corpus')?.guard, 'tests/suites/go-kernel-tmux-snapshot-parser.cjs')
  assert.equal(evidence.get('jsonrpc-protocol-contract')?.guard, 'tests/suites/go-kernel-protocol-contract.cjs')
  assert.equal(evidence.get('go-cutover-failure-classes')?.guard, 'tests/suites/go-kernel-tmux-cutover-failure-classes.cjs')
  assert.equal(evidence.get('packaged-preview-fail-closed')?.guard, 'tests/suites/go-kernel-v0421-packaged-preview-resolver.cjs')
  for (const item of EXISTING_EVIDENCE) assert.equal(item.status, 'guarded-now', `${item.id} should be guarded-now`)
}

function assertParityCorpus(root) {
  const tmuxCases = require(path.join(root, 'tests/fixtures/kernel/tmux/snapshotCases.cjs')).cases()
  assert.ok(Array.isArray(tmuxCases) && tmuxCases.length >= PARITY_CORPUS_CASES.length, 'tmux snapshot corpus should remain substantial')
  const caseNames = tmuxCases.map(item => item.name)
  assert.deepEqual(PARITY_CORPUS_CASES, caseNames, 'v0.6.45 prep fixture should enumerate current canonical corpus exactly')
  for (const testCase of tmuxCases) {
    assert.equal(testCase.expected.ok, true, `${testCase.name} expected snapshot should be ok:true`)
    assert.equal(Object.prototype.hasOwnProperty.call(testCase.expected, 'error'), false, `${testCase.name} expected snapshot should not include error`)
    assert.deepEqual(Object.keys(testCase.expected.byPaneId).sort(), testCase.expected.panes.map(item => item.paneId).sort(), `${testCase.name} byPaneId should mirror panes`)
  }
}

function assertFailClosedFixture() {
  assert.equal(FAIL_CLOSED_CONTRACT.required, true)
  assert.equal(FAIL_CLOSED_CONTRACT.module, 'tmuxSnapshotParse')
  assert.deepEqual(FAIL_CLOSED_CONTRACT.modeScope, ['go-cutover', 'go-packaged-preview'])
  assert.deepEqual(FAIL_CLOSED_CONTRACT.unavailableSnapshot, {
    ok: false,
    status: 'unknown',
    resultMarker: 'stale',
    module: 'tmuxSnapshotParse',
    capability: 'tmuxSnapshotParse',
    panes: [],
    byPaneId: {},
  })
  assert.equal(FAIL_CLOSED_CONTRACT.typeScriptParserFallbackCallbackInvoked, false)
  assert.equal(FAIL_CLOSED_CONTRACT.migrationFallbackFieldsAllowed, false)
  assert.equal(FAIL_CLOSED_CONTRACT.migrationFallbackCountIncremented, false)
  assert.equal(FAIL_CLOSED_CONTRACT.successfulEmptySnapshotAllowedOnFailure, false)
  assert.equal(FAIL_CLOSED_CONTRACT.clearPaneBindingsOnFailure, false)
  assert.equal(FAIL_CLOSED_CONTRACT.killPanesOnFailure, false)
  assert.equal(FAIL_CLOSED_CONTRACT.markWorkersErrorOnParserFailure, false)
  assert.equal(FAIL_CLOSED_CONTRACT.forceReconcileOnParserFailure, false)
  assert.equal(FAIL_CLOSED_CONTRACT.writeStateOnParserFailure, false)
  for (const kind of ['missing-helper', 'helper-unsupported-protocol', 'helper-unsupported-version', 'helper-unsupported-capability', 'helper-timeout', 'helper-spawn-error', 'helper-crash', 'helper-nonzero-exit', 'helper-empty-response', 'helper-malformed-json', 'helper-jsonrpc-error', 'helper-incompatible-response', 'helper-unsafe-response-shape', 'previous-helper-failure']) {
    assert.equal(FAILURE_CLASSES.includes(kind), true, `failure classes should include ${kind}`)
  }
}

function assertFallbackDeletionAndRollback() {
  for (const prereq of ['explicit reviewer-approved tmuxSnapshotParse module cutover gate pass', 'shadow comparison pass with compact counters and no raw stdout/log/state/full-body artifacts', 'runtime helper availability and install/source policy signoff for target release path', 'package release ownership signoff if any package/native/default resolver path is proposed', 'deletion targets in tmux/snapshot.ts and core/kernel.ts listed and reviewed in a separate PR']) {
    assert.equal(FALLBACK_DELETION_PREREQUISITES.includes(prereq), true, `fallback deletion prerequisites should include ${prereq}`)
  }
  assert.equal(ROLLBACK_DEFAULT_DISABLE_CRITERIA.defaultUnsetRuntime, 'disabled/TypeScript')
  assert.equal(ROLLBACK_DEFAULT_DISABLE_CRITERIA.goCutoverMode, 'explicit helper-path only')
  assert.equal(ROLLBACK_DEFAULT_DISABLE_CRITERIA.goPackagedPreviewMode, 'explicit preview only and non-default')
  assert.equal(ROLLBACK_DEFAULT_DISABLE_CRITERIA.hiddenTypeScriptRuntimeFallbackAfterCutover, false)
  assert.equal(ROLLBACK_DEFAULT_DISABLE_CRITERIA.allowedRollbackPaths.includes('revert to a prior known-good GitHub tag/npm version'), true)
  for (const stopTerm of REQUIRED_STOP_TERMS) assert.equal(STOP_ITEMS.includes(stopTerm), true, `STOP_ITEMS should include ${stopTerm}`)
}

function assertPackageRuntimeInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, PACKAGE_RUNTIME_INVARIANTS.packageName)
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.version, PACKAGE_RUNTIME_INVARIANTS.packageVersion)
  assert.equal(packageJson.type, PACKAGE_RUNTIME_INVARIANTS.packageType)
  assert.deepEqual(packageJson.pi?.extensions, [...PACKAGE_RUNTIME_INVARIANTS.piExtensions])
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.runtimeBehaviorChanged, false)
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.packageMetadataChanged, false)
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.defaultGoApproved, false)
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.defaultResolverApproved, false)
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.fallbackDeletionApproved, false)
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.nativePackageApproved, false)
  for (const field of ['main', 'exports', 'types']) assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  assert.deepEqual(Object.keys(packageJson.dependencies || {}).sort(), [], 'dependencies must remain empty or absent')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish', 'prepack', 'postpack']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define lifecycle script ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    assert.equal(/go\s+(?:build|install)\b/.test(command), false, `${name} must not build/install helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not download/build native helper`)
  }
}

function assertExistingEvidence(root) {
  for (const rel of REQUIRED_EXISTING_FILES) assert.equal(exists(root, rel), true, `${rel} should exist`)
  const v0644 = require(path.join(root, 'tests/fixtures/kernel/v0644/goCutoverCandidateSelection.cjs')).goCutoverCandidateSelection
  assert.equal(v0644.selectedModule, 'tmuxSnapshotParse', 'v0.6.44 should remain selected candidate baseline')
  assert.equal(v0644.ready, false, 'v0.6.44 baseline should remain ready:false')
}

function assertDistRuntimeCutoverCoverage(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  assert.equal(kernel.normalizeAgentTeamKernelMode(undefined), 'disabled')
  assert.equal(kernel.normalizeAgentTeamKernelMode(''), 'disabled')
  assert.equal(kernel.normalizeAgentTeamKernelMode('go-cutover'), 'go-cutover')
  assert.equal(kernel.normalizeAgentTeamKernelMode('go-packaged-preview'), 'go-packaged-preview')
  assert.deepEqual(kernel.AGENTTEAM_KERNEL_CAPABILITIES, ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint'])
  assert.equal(kernel.AGENTTEAM_KERNEL_CUTOVER_MODULE, 'tmuxSnapshotParse')
  assert.deepEqual(kernel.AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS, [...FAILURE_CLASSES])

  const defaultAdapter = kernel.createAgentTeamKernelAdapter({ env: {} })
  assert.equal(defaultAdapter.metadata().kernel.requestedMode, 'disabled')
  assert.equal(defaultAdapter.metadata().kernel.mode, 'typescript')
  assert.equal(defaultAdapter.metadata().kernel.enabled, false)
  assert.equal(defaultAdapter.metadata().kernel.calls, 0)

  const missingCutover = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath: path.join(os.tmpdir(), 'v0645-missing-helper') })
  let fallbackCalled = false
  const snapshot = missingCutover.parseTmuxPaneSnapshot('%secret\ts:@1\tV0645_SHOULD_NOT_FALLBACK\tpi', 1700006450001, () => {
    fallbackCalled = true
    throw new Error('TypeScript fallback callback must not run in go-cutover missing-helper coverage')
  })
  assert.equal(fallbackCalled, false, 'go-cutover missing helper must not call TypeScript parser fallback callback')
  assert.equal(snapshot.ok, false)
  assert.equal(snapshot.status, 'unknown')
  assert.equal(snapshot.resultMarker, 'stale')
  assert.equal(snapshot.module, 'tmuxSnapshotParse')
  assert.equal(snapshot.capability, 'tmuxSnapshotParse')
  assert.equal(snapshot.cutoverFailureKind, 'missing-helper')
  assert.deepEqual(snapshot.panes, [])
  assert.deepEqual(snapshot.byPaneId, {})
  assert.equal(JSON.stringify(snapshot).includes('V0645_SHOULD_NOT_FALLBACK'), false, 'cutover failure must not leak raw stdout')
  const metadata = missingCutover.metadata()
  assert.equal(metadata.kernel.requestedMode, 'go-cutover')
  assert.equal(metadata.kernel.mode, 'typescript')
  assert.equal(metadata.kernel.enabled, false)
  assert.equal(metadata.kernel.fallbacks, 0)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false)
  assert.equal(metadata.kernel.cutoverModule, 'tmuxSnapshotParse')
  assert.equal(metadata.kernel.cutoverStatus, 'unavailable')
  assert.equal(metadata.kernel.cutoverFailureKind, 'missing-helper')
  assert.equal(JSON.stringify(metadata).includes(path.join(os.tmpdir(), 'v0645-missing-helper')), false, 'metadata must not leak absolute helper path in missing-helper cutover failure')
}

function assertNoRuntimeCutoverBehaviorChanged(root, env) {
  assertDistRuntimeCutoverCoverage(env)

  const snapshotSource = read(root, 'tmux/snapshot.ts')
  assert.match(snapshotSource, /runTmuxNoThrow\(\[/, 'TypeScript must still capture tmux output')
  assert.match(snapshotSource, /list-panes/, 'TypeScript capture path must still call list-panes')
  assert.match(snapshotSource, /TMUX_PANE_SNAPSHOT_FORMAT/, 'TypeScript capture path must still own tmux format')
  assert.match(snapshotSource, /parseTmuxPaneSnapshotWithTypeScript/, 'TypeScript parser fallback must remain present')
  assert.match(snapshotSource, /createAgentTeamKernelAdapter\(\)\.parseTmuxPaneSnapshot/, 'adapter call remains optional parser seam only')

  const kernelSource = read(root, 'core/kernel.ts')
  assert.match(kernelSource, /AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse'/, 'tmuxSnapshotParse remains only cutover module marker')
  assert.match(kernelSource, /using TypeScript fallback/, 'migration fallback text remains present')
  assert.match(kernelSource, /requestedMode === 'go-cutover'/, 'go-cutover remains explicit mode')
  assert.match(kernelSource, /requestedMode === 'go-packaged-preview'/, 'go-packaged-preview remains explicit mode')
  assert.match(kernelSource, /compactReadModelFingerprint\(input, fallback = fallbackCompactReadModelFingerprint\)/, 'compactReadModelFingerprint seam remains present')
  assert.match(kernelSource, /if \(cutoverRequested\) return fallback\(compactInput\)/, 'compactReadModelFingerprint remains non-cutover TS fallback')

  for (const rel of ['adapters/tmux/teamPanes.ts', 'tools/workerSpawnService.ts', 'app/taskApplication.ts', 'app/taskReportWorkflow.ts', 'app/planRunApplication.ts', 'teamPanel/dataSource.ts']) {
    const source = read(root, rel)
    assert.equal(source.includes('core/kernel.js'), false, `${rel} must not import kernel authority`)
    assert.equal(source.includes('createAgentTeamKernelAdapter'), false, `${rel} must not call the Go parser adapter`)
    assert.equal(source.includes('PI_AGENTTEAM_KERNEL'), false, `${rel} must not read kernel env`)
  }

  const panelDataSource = read(root, 'teamPanel/dataSource.ts')
  assert.match(panelDataSource, /snapshot\.module === 'tmuxSnapshotParse'/, 'panel may recognize compact parser-unavailable diagnostics')
  assert.match(panelDataSource, /cutoverParserUnavailable/, 'panel diagnostic handling remains TypeScript-owned and non-authoritative')

  const goSource = read(root, 'kernel/go/agentteam-kernel/main.go')
  for (const forbidden of ['exec.Command', 'os/exec', 'tmux ', 'list-panes', 'createTeammatePane', 'kill-pane', 'display-message', 'send-keys', 'PI_AGENTTEAM_HOME', 'team.json', 'os.Open', 'os.ReadFile', 'os.WriteFile', 'os.Create']) {
    assert.equal(goSource.includes(forbidden), false, `Go helper must not own tmux/runtime/state authority: ${forbidden}`)
  }
}

function assertArtifactInvariants(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  const forbiddenArtifacts = []
  const forbiddenRawEvidence = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/') && FORBIDDEN_RAW_EVIDENCE.test(rel)) forbiddenRawEvidence.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain checked-in native/archive/signing/release artifacts')
  assert.deepEqual(forbiddenRawEvidence.sort(), [], 'repo must not contain raw v0.6.45 timing/body/state/operator/tmux evidence files')
}

function assertNoCheckedInLeakMarkers(root) {
  const sentinel = 'V0645_TMUX_SNAPSHOT_CUTOVER_GATE_PREP_FULL_TEXT_SENTINEL_DO_NOT_LEAK'
  const leakFiles = []
  const allowed = new Set([FIXTURE, SUITE, DOC])
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/')) continue
    const content = fs.readFileSync(file, 'utf8')
    if (content.includes(sentinel) && !allowed.has(rel)) leakFiles.push(`${rel}:${sentinel}`)
  }
  assert.deepEqual(leakFiles.sort(), [], 'unexpected checked-in v0.6.45 full-body sentinel outside guard artifacts')
  assert.equal(NO_LEAK_MARKERS.includes(sentinel), true)
}

function assertGitNoReleaseArtifacts(root) {
  let files = []
  try {
    files = childProcess.execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
  } catch {
    files = []
  }
  const forbiddenTracked = files.filter(rel => FORBIDDEN_ARTIFACT.test(rel) || ROOT_FORBIDDEN_FILES.includes(rel))
  assert.deepEqual(forbiddenTracked.sort(), [], 'git tracked files must not include release/native/package-manager artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.45 tmuxSnapshotParse cutover gate prep',
  async run(env) {
    const root = env.helpers.extRoot
    assertDocs(root)
    assertFixtureShape(root)
    assertGateRowsAndEvidence()
    assertParityCorpus(root)
    assertFailClosedFixture()
    assertFallbackDeletionAndRollback()
    assertPackageRuntimeInvariants(root)
    assertExistingEvidence(root)
    assertNoRuntimeCutoverBehaviorChanged(root, env)
    assertArtifactInvariants(root)
    assertNoCheckedInLeakMarkers(root)
    assertGitNoReleaseArtifacts(root)
  },
}
