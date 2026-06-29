const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const {
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
} = require('../fixtures/kernel/v0644/goCutoverCandidateSelection.cjs')

const DOC = 'docs/perf/v0.6.44-go-cutover-candidate-selection.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0644/goCutoverCandidateSelection.cjs'
const SUITE = 'tests/suites/go-kernel-v0644-go-cutover-candidate-selection.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_DOC = [
  '# v0.6.44 Go Cutover Candidate Selection',
  'Result: v0.6.44 selects `tmuxSnapshotParse` / tmux snapshot parser as the first bounded candidate for a future Go-owned runtime cutover.',
  'Final result remains `ready:false`.',
  'GO for the next small implementation slice',
  'STOP for runtime cutover, default selection, fallback deletion, package/release work, native distribution, or v0.7 readiness claims',
  'Go may only parse that already captured text after a later explicit module cutover gate',
  'Go must not execute tmux, own pane/session lifecycle, write state, manage task/report/PlanRun governance, read full mailbox/report bodies, or participate in UI/control-plane authority.',
  '## Candidate Module',
  '| Candidate | `tmuxSnapshotParse` / tmux snapshot parser |',
  '## TypeScript/pi Control-Plane Boundaries',
  'TypeScript/pi remains authoritative for:',
  '## Explicit Cutover Gate',
  '| Parity corpus |',
  '| Shadow comparison |',
  '| Focused smoke |',
  '| Focused bench |',
  '| Failure classes |',
  '| Fail-closed diagnostics |',
  '| Boundary scans |',
  '| Runtime prerequisites |',
  '| Fallback deletion plan |',
  '| Release rollback |',
  '## Parity And Shadow Checklist',
  '## Failure Classes And Fail-Closed Diagnostics',
  'Parser failure is unknown/stale snapshot state; it is not proof that panes disappeared.',
  'Parser failure must not clear pane bindings, kill panes, mark workers error, force reconcile, write state, or emit a successful empty snapshot.',
  '## Fallback Deletion Prerequisites',
  'TypeScript runtime fallback deletion is not approved in v0.6.44.',
  '## Release Rollback Path',
  'rollback is release governance, not silent runtime fallback',
  '## Next Implementation Entry Criteria',
  'STOP for any next slice that attempts broad Go rewrite',
  '## Validation',
  'Use v0.6.44 as the current Go cutover candidate-selection checkpoint only.',
]
const REQUIRED_ROADMAP = [
  'v0.6.44 Go cutover candidate selection',
  'docs/perf/v0.6.44-go-cutover-candidate-selection.md',
  'future module cutover gate',
  '当前仍为 `ready:false`',
  'v0.6.44 在此基础上进入 Go cutover candidate selection',
  '推荐 `tmuxSnapshotParse` / tmux snapshot parser 作为第一个 future Go-owned runtime 候选',
  'planning/evidence only',
  '**v0.6.44 Go cutover candidate selection**',
  'Go 只处理 TypeScript 已捕获的 snapshot text',
  '不执行 tmux、不拥有 pane/session lifecycle、不写 state、不做 task/report/PlanRun governance、不读 full mailbox/report bodies、不参与 UI/control plane',
]
const POSITIVE_OVERCLAIMS = [
  'v0.7 release-ready approval is granted',
  'v0.7 release ready approval is granted',
  'v0.7 is release-ready',
  'v0.7 is release ready',
  'v0.7 readiness approved',
  'release can ship',
  'ready for release',
  'Go default enabled: true',
  'default Go enabled: true',
  'goDefaultEnabled: true',
  'default resolver enabled: true',
  'defaultResolverEnabled: true',
  'TypeScript fallback deleted: true',
  'typeScriptFallbackDeleted: true',
  'tmux execution moved to Go: true',
  'tmuxExecutionMovedToGo: true',
  'worker lifecycle moved to Go: true',
  'workerLifecycleMovedToGo: true',
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'native package approved: true',
  'fallback deletion approved: true',
  'fallbackDeletionApproved: true',
]
const REQUIRED_STOP_TERMS = [
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
const FORBIDDEN_RAW_EVIDENCE = /(?:^|\/)(?:.*go-cutover-candidate.*\.json|.*v0644.*raw.*|.*raw-tmux.*|.*tmux.*stdout.*|.*state-archive.*|.*raw-state.*|.*mailbox.*body.*|.*report.*body.*|.*worker.*transcript.*|.*screenshot.*|.*terminal.*raw.*log.*|.*hosted.*record.*)$/i
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'
const REQUIRED_EXISTING_FILES = [
  'tests/fixtures/kernel/tmux/snapshotCases.cjs',
  'tests/suites/go-kernel-tmux-snapshot-parser.cjs',
  'tmux/snapshot.ts',
  'core/kernel.ts',
  'docs/decisions/0002-module-owned-go-kernel-cutover.md',
  'docs/perf/v0.4.18-tmux-snapshot-parse-cutover.md',
]

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
  for (const stopTerm of REQUIRED_STOP_TERMS) assert.equal(STOP_ITEMS.includes(stopTerm), true, `fixture STOP_ITEMS should include ${stopTerm}`)
  assertNoPositiveOverclaims(doc, DOC)
  assertNoPositiveOverclaims(roadmap, ROADMAP)
  assert.match(doc, /Candidate \| `tmuxSnapshotParse` \/ tmux snapshot parser/i)
  assert.match(doc, /Final result remains `ready:false`/)
  assert.match(doc, /GO for the next bounded implementation slice/i)
  assert.match(doc, /STOP for any next slice/i)
  assert.match(doc, /TypeScript runtime fallback deletion is not approved in v0\.6\.44/i)
  assert.match(doc, /rollback is release governance, not silent runtime fallback/i)
  assert.equal(/"records"\s*:|"profileSummary"\s*:|"runId"\s*:/i.test(doc), false, `${DOC} must not embed raw timing JSON`)
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goCutoverCandidateSelection)), goCutoverCandidateSelection, 'fixture should be plain deterministic data')
  assert.equal(goCutoverCandidateSelection.schemaVersion, GO_CUTOVER_CANDIDATE_SELECTION_SCHEMA_VERSION)
  assert.equal(goCutoverCandidateSelection.theme, GO_CUTOVER_CANDIDATE_SELECTION_THEME)
  assert.equal(goCutoverCandidateSelection.releaseTarget, CURRENT_RELEASE_TARGET)
  assert.equal(goCutoverCandidateSelection.status, STATUS)
  assert.equal(goCutoverCandidateSelection.ready, false)
  assert.equal(goCutoverCandidateSelection.selectedModule, SELECTED_MODULE)
  assert.equal(goCutoverCandidateSelection.selectedModule, 'tmuxSnapshotParse')
  assert.equal(goCutoverCandidateSelection.releaseReadyClaim, false)
  assert.equal(goCutoverCandidateSelection.runtimeBehaviorChanged, false)
  assert.equal(goCutoverCandidateSelection.packageVersionChanged, false)
  assert.equal(goCutoverCandidateSelection.tagCreated, false)
  assert.equal(goCutoverCandidateSelection.npmPublished, false)
  assert.equal(goCutoverCandidateSelection.nativeWorkPerformed, false)
  assert.equal(goCutoverCandidateSelection.defaultGoApproved, false)
  assert.equal(goCutoverCandidateSelection.defaultResolverApproved, false)
  assert.equal(goCutoverCandidateSelection.fallbackDeletionApproved, false)
  assert.equal(goCutoverCandidateSelection.packageReleaseApproved, false)
  assert.equal(goCutoverCandidateSelection.releaseAssetsCreated, false)
  assert.equal(goCutoverCandidateSelection.rawArtifactsCheckedIn, false)
  assert.equal(goCutoverCandidateSelection.wholeGoRewrite, false)
  assert.equal(goCutoverCandidateSelection.goDefaultEnabled, false)
  assert.equal(goCutoverCandidateSelection.defaultGoEnabled, false)
  assert.equal(goCutoverCandidateSelection.defaultResolverEnabled, false)
  assert.equal(goCutoverCandidateSelection.releaseCreated, false)
  assert.equal(goCutoverCandidateSelection.nativePackageApproved, false)
  assert.equal(goCutoverCandidateSelection.tmuxExecutionMovedToGo, false)
  assert.equal(goCutoverCandidateSelection.workerLifecycleMovedToGo, false)
  assert.equal(goCutoverCandidateSelection.typeScriptFallbackDeleted, false)
  assert.deepEqual(goCutoverCandidateSelection.packageRuntimeInvariants, PACKAGE_RUNTIME_INVARIANTS)
  assert.deepEqual(goCutoverCandidateSelection.noLeak.markers, NO_LEAK_MARKERS)
  assert.equal(goCutoverCandidateSelection.noLeak.rawStateArchivesCheckedIn, false)
  assert.equal(goCutoverCandidateSelection.noLeak.rawFullBodiesCheckedIn, false)
  assert.equal(goCutoverCandidateSelection.noLeak.rawTmuxStdoutCheckedIn, false)
  assert.equal(goCutoverCandidateSelection.noLeak.rawTimingJsonCheckedIn, false)
  assert.equal(goCutoverCandidateSelection.noLeak.screenshotsCheckedIn, false)
  assert.equal(goCutoverCandidateSelection.noLeak.terminalRawLogsCheckedIn, false)
  assert.equal(goCutoverCandidateSelection.noLeak.workerTranscriptsCheckedIn, false)
  assert.equal(goCutoverCandidateSelection.noLeak.rawHostedRecordsCheckedIn, false)
  assert.deepEqual(goCutoverCandidateSelection.candidateRationale, CANDIDATE_RATIONALE)
  assert.deepEqual(goCutoverCandidateSelection.tsPiControlPlaneBoundaries, TS_PI_CONTROL_PLANE_BOUNDARIES)
  assert.deepEqual(goCutoverCandidateSelection.goAllowedScope, GO_ALLOWED_SCOPE)
  assert.deepEqual(goCutoverCandidateSelection.goForbiddenScope, GO_FORBIDDEN_SCOPE)
  assert.deepEqual(goCutoverCandidateSelection.cutoverGate, CUTOVER_GATE)
  assert.deepEqual(goCutoverCandidateSelection.parityChecklist, PARITY_CHECKLIST)
  assert.deepEqual(goCutoverCandidateSelection.failureClasses, FAILURE_CLASSES)
  assert.deepEqual(goCutoverCandidateSelection.failClosedDiagnostics, FAIL_CLOSED_DIAGNOSTICS)
  assert.deepEqual(goCutoverCandidateSelection.focusedSmokeAndBench, FOCUSED_SMOKE_AND_BENCH)
  assert.deepEqual(goCutoverCandidateSelection.fallbackDeletionPrerequisites, FALLBACK_DELETION_PREREQUISITES)
  assert.deepEqual(goCutoverCandidateSelection.releaseRollback, RELEASE_ROLLBACK)
  assert.deepEqual(goCutoverCandidateSelection.nextImplementationEntryCriteria, NEXT_IMPLEMENTATION_ENTRY_CRITERIA)
  assert.deepEqual(goCutoverCandidateSelection.stopItems, STOP_ITEMS)
  assert.match(goCutoverCandidateSelection.recommendation, /ready remains false/i)
}

function assertCandidateDecision() {
  const rationaleIds = new Set(CANDIDATE_RATIONALE.map(item => item.id))
  for (const id of ['narrow-boundary', 'deterministic-parser', 'existing-parity-corpus', 'failure-can-fail-closed']) {
    assert.equal(rationaleIds.has(id), true, `candidate rationale should include ${id}`)
  }
  assert.equal(CANDIDATE_RATIONALE.every(item => item.status === 'supports-selection'), true)
  assert.equal(GO_ALLOWED_SCOPE.includes('parse TypeScript-captured tmux snapshot text'), true)
  for (const forbidden of ['tmux execution', 'tmux capture', 'pane lifecycle', 'session lifecycle', 'worker lifecycle', 'state writes', 'task governance', 'report governance', 'PlanRun governance', 'full mailbox body reads', 'full report body reads', 'UI control plane', 'package release control']) {
    assert.equal(GO_FORBIDDEN_SCOPE.includes(forbidden), true, `Go forbidden scope should include ${forbidden}`)
  }
  for (const boundary of ['tmux command execution and capture, including list-panes and snapshot text capture', 'leader-gated task/message/report governance and PlanRun control', '/team UI data loading, rendering, and compact/full-text read boundaries']) {
    assert.equal(TS_PI_CONTROL_PLANE_BOUNDARIES.includes(boundary), true, `TS/pi boundary should include ${boundary}`)
  }
}

function assertCutoverGateAndChecklists() {
  assert.equal(CUTOVER_GATE.length, 10)
  assert.equal(CUTOVER_GATE.every(item => item.status === 'future-required' && item.required === true), true)
  for (const id of ['parity-corpus', 'shadow-comparison', 'focused-smoke', 'focused-bench', 'failure-classes', 'fail-closed-diagnostics', 'boundary-scans', 'runtime-prerequisite-signoff', 'fallback-deletion-plan', 'release-rollback-plan']) {
    assert.ok(CUTOVER_GATE.some(item => item.id === id), `cutover gate should include ${id}`)
  }
  for (const item of ['duplicate pane ids preserve first-seen pane order and last-seen values', 'sentinel-like compact tmux labels do not become full-text leakage', 'successful parses return ok:true without parser error']) {
    assert.equal(PARITY_CHECKLIST.includes(item), true, `parity checklist should include ${item}`)
  }
  for (const kind of ['missing-helper', 'disabled-helper', 'helper-unsupported-protocol', 'helper-unsupported-version', 'helper-unsupported-capability', 'helper-timeout', 'helper-spawn-error', 'helper-crash', 'helper-nonzero-exit', 'helper-empty-response', 'helper-malformed-json', 'helper-jsonrpc-error', 'helper-incompatible-response', 'helper-unsafe-response-shape', 'previous-helper-failure']) {
    assert.equal(FAILURE_CLASSES.includes(kind), true, `failure classes should include ${kind}`)
  }
  assert.equal(FAIL_CLOSED_DIAGNOSTICS.required, true)
  assert.equal(FAIL_CLOSED_DIAGNOSTICS.unknownStaleSnapshot, true)
  assert.equal(FAIL_CLOSED_DIAGNOSTICS.emptySuccessfulSnapshotOnFailure, false)
  assert.equal(FAIL_CLOSED_DIAGNOSTICS.destructiveStateUpdateOnFailure, false)
  assert.equal(FAIL_CLOSED_DIAGNOSTICS.clearPaneBindingsOnFailure, false)
  assert.equal(FAIL_CLOSED_DIAGNOSTICS.killPanesOnFailure, false)
  assert.equal(FAIL_CLOSED_DIAGNOSTICS.markWorkersErrorOnParserFailure, false)
  assert.equal(FAIL_CLOSED_DIAGNOSTICS.forceReconcileOnParserFailure, false)
  assert.equal(FAIL_CLOSED_DIAGNOSTICS.rawStdoutIncluded, false)
  assert.equal(FAIL_CLOSED_DIAGNOSTICS.rawStderrIncluded, false)
  assert.equal(FAIL_CLOSED_DIAGNOSTICS.fullBodiesIncluded, false)
}

function assertFallbackDeletionAndRollback() {
  for (const prereq of ['explicit tmuxSnapshotParse module cutover gate pass with reviewer signoff', 'runtime prerequisite signoff for helper availability and install/source policy', 'release rollback/default-disable path reviewed without hidden TypeScript runtime fallback', 'deletion targets in tmux/snapshot.ts and core/kernel.ts listed and reviewed']) {
    assert.equal(FALLBACK_DELETION_PREREQUISITES.includes(prereq), true, `fallback deletion prerequisites should include ${prereq}`)
  }
  assert.equal(RELEASE_ROLLBACK.hiddenRuntimeFallbackAllowed, false)
  assert.deepEqual(RELEASE_ROLLBACK.allowedPaths, [
    'revert to prior known-good GitHub tag/npm version',
    'publish corrected npm version with documented fix or reviewed disable path',
  ])
  assert.equal(NEXT_IMPLEMENTATION_ENTRY_CRITERIA.decision, 'GO-for-next-bounded-implementation-slice')
  assert.equal(NEXT_IMPLEMENTATION_ENTRY_CRITERIA.module, 'tmuxSnapshotParse')
  assert.equal(NEXT_IMPLEMENTATION_ENTRY_CRITERIA.ready, false)
}

function assertExistingEvidence(root) {
  for (const rel of REQUIRED_EXISTING_FILES) assert.equal(exists(root, rel), true, `${rel} should exist`)
  const tmuxCases = require(path.join(root, 'tests/fixtures/kernel/tmux/snapshotCases.cjs')).cases()
  assert.ok(Array.isArray(tmuxCases) && tmuxCases.length >= 10, 'tmux snapshot corpus should remain substantial')
  const caseNames = tmuxCases.map(item => item.name)
  for (const name of ['empty stdout', 'duplicate pane ids keep first order and last values', 'mixed corpus canonical snapshot']) {
    assert.equal(caseNames.includes(name), true, `tmux snapshot corpus should include ${name}`)
  }
}

function assertPackageRuntimeInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, PACKAGE_RUNTIME_INVARIANTS.packageName)
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.version, PACKAGE_RUNTIME_INVARIANTS.packageVersion)
  assert.equal(packageJson.type, PACKAGE_RUNTIME_INVARIANTS.packageType)
  assert.deepEqual(packageJson.pi?.extensions, [...PACKAGE_RUNTIME_INVARIANTS.piExtensions])
  for (const field of ['main', 'exports', 'types']) assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  assert.deepEqual(Object.keys(packageJson.dependencies || {}).sort(), [], 'dependencies must remain empty or absent')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish', 'prepack', 'postpack']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define lifecycle script ${lifecycle}`)
  }
}

function assertNoRuntimeCutoverBehaviorChanged(root) {
  const snapshotSource = read(root, 'tmux/snapshot.ts')
  assert.equal(snapshotSource.includes('runTmuxNoThrow(['), false, 'post-v0.6.49 tmux capture no longer uses the TypeScript tmux client')
  assert.match(snapshotSource, /TMUX_PANE_SNAPSHOT_FORMAT/, 'TypeScript should retain tmux format as protocol constant')
  assert.equal(/parseTmuxPaneSnapshotWithTypeScript/.test(snapshotSource), false, 'approved v0.6.48 cutover deletes TypeScript parser fallback')
  assert.match(snapshotSource, /createAgentTeamKernelAdapter\(\)\.parseTmuxPaneSnapshot/, 'adapter call remains the parser seam')
  assert.match(snapshotSource, /createAgentTeamKernelAdapter\(\)\.captureTmuxSnapshot/, 'post-v0.6.49 first slice moves tmux snapshot capture behind the kernel adapter')

  const kernelSource = read(root, 'core/kernel.ts')
  assert.match(kernelSource, /AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse'/, 'tmuxSnapshotParse remains the only cutover module marker')
  assert.match(kernelSource, /using TypeScript fallback/, 'migration fallback text remains present before future cutover')
  assert.match(kernelSource, /go-cutover/, 'explicit go-cutover mode remains explicit')
  assert.match(kernelSource, /go-packaged-preview/, 'explicit go-packaged-preview mode remains explicit')

  for (const rel of ['adapters/tmux/teamPanes.ts', 'tools/workerSpawnService.ts', 'app/taskApplication.ts', 'app/taskReportWorkflow.ts', 'app/planRunApplication.ts', 'teamPanel/dataSource.ts']) {
    const source = read(root, rel)
    assert.equal(source.includes('core/kernel.js'), false, `${rel} must not import kernel authority`)
    assert.equal(source.includes('createAgentTeamKernelAdapter'), false, `${rel} must not call the Go parser adapter`)
    assert.equal(source.includes('PI_AGENTTEAM_KERNEL'), false, `${rel} must not read kernel env`)
  }
  const panelDataSource = read(root, 'teamPanel/dataSource.ts')
  assert.match(panelDataSource, /snapshot\.module === 'tmuxSnapshotParse'/, 'panel may recognize existing compact parser-unavailable diagnostics')
  assert.match(panelDataSource, /cutoverParserUnavailable/, 'panel diagnostic handling remains TypeScript-owned and non-authoritative')

  const goSource = read(root, 'kernel/go/agentteam-kernel/main.go')
  assert.match(goSource, /case "tmuxSnapshotCapture"/, 'post-v0.6.49 first slice may add narrow tmux snapshot capture')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat\)/, 'Go tmux execution must be limited to snapshot capture')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'Go may only use display-message for the narrow current-pane binding operation')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, 'Go helper must not use target-based display-message')
  for (const forbidden of ['kill-pane', 'send-keys', 'PI_AGENTTEAM_HOME', 'team.json', 'os.Open', 'os.ReadFile', 'os.WriteFile', 'os.Create']) {
    assert.equal(goSource.includes(forbidden), false, `Go helper must not own lifecycle/state authority: ${forbidden}`)
  }
}

function assertArtifactInvariants(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  const forbiddenArtifacts = []
  const forbiddenRawEvidence = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && !rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/') && FORBIDDEN_RAW_EVIDENCE.test(rel)) forbiddenRawEvidence.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved checked-in native/archive/signing/release artifacts')
  assert.deepEqual(forbiddenRawEvidence.sort(), [], 'repo must not contain raw v0.6.44 timing/body/state/operator/tmux evidence files')
}

function assertNoCheckedInLeakMarkers(root) {
  const sentinel = 'V0644_GO_CUTOVER_CANDIDATE_FULL_TEXT_SENTINEL_DO_NOT_LEAK'
  const leakFiles = []
  const allowed = new Set([FIXTURE, SUITE, DOC])
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/')) continue
    const content = fs.readFileSync(file, 'utf8')
    if (content.includes(sentinel) && !allowed.has(rel)) leakFiles.push(`${rel}:${sentinel}`)
  }
  assert.deepEqual(leakFiles.sort(), [], 'unexpected checked-in v0.6.44 full-body sentinel outside guard artifacts')
  assert.equal(NO_LEAK_MARKERS.includes(sentinel), true)
}

function assertGitNoReleaseArtifacts(root) {
  let files = []
  try {
    files = childProcess.execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
  } catch {
    files = []
  }
  const forbiddenTracked = files.filter(rel => (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && FORBIDDEN_ARTIFACT.test(rel)) || ROOT_FORBIDDEN_FILES.includes(rel))
  assert.deepEqual(forbiddenTracked.sort(), [], 'git tracked files must not include unapproved release/native/package-manager artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.44 Go cutover candidate selection',
  async run(env) {
    const root = env.helpers.extRoot
    assertDocs(root)
    assertFixtureShape(root)
    assertCandidateDecision()
    assertCutoverGateAndChecklists()
    assertFallbackDeletionAndRollback()
    assertExistingEvidence(root)
    assertPackageRuntimeInvariants(root)
    assertNoRuntimeCutoverBehaviorChanged(root)
    assertArtifactInvariants(root)
    assertNoCheckedInLeakMarkers(root)
    assertGitNoReleaseArtifacts(root)
  },
}
