const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  BLOCKER_LEDGER,
  CLEAN_TEMP_SMOKE_EVIDENCE,
  CURRENT_RELEASE_TARGET,
  DEFAULT_GO_READINESS_APPROVAL_GATE_SCHEMA_VERSION,
  DEFAULT_GO_READINESS_APPROVAL_GATE_THEME,
  DEFAULT_RESOLVER_APPROVAL_CHECKLIST,
  GO_ALLOWED_SCOPE,
  GO_FORBIDDEN_SCOPE,
  GO_NO_GO_RECOMMENDATION,
  HELPER_VERSION,
  NO_LEAK_MARKERS,
  OVERCLAIM_BANS,
  PACKAGE_RUNTIME_INVARIANTS,
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  REQUIRED_CAPABILITIES,
  SELECTED_MODULE,
  SELECTED_MODULE_LABEL,
  STATUS,
  TS_PI_CONTROL_PLANE_BOUNDARIES,
  VALIDATION_COMMANDS,
  defaultGoReadinessApprovalGate,
} = require('../fixtures/kernel/v0646/defaultGoReadinessApprovalGate.cjs')

const DOC = 'docs/perf/v0.6.46-default-go-readiness-approval-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0646/defaultGoReadinessApprovalGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0646-default-go-readiness-approval-gate.cjs'
const REQUIRED_DOC = [
  '# v0.6.46 Default-Go Readiness Approval Gate',
  'Result: v0.6.46 starts the true default-Go readiness approval gate for `tmuxSnapshotParse` and returns GO for a later non-mutating default-Go dry-run implementation slice.',
  'Final result remains `ready:false`.',
  'default Go is not enabled',
  'default resolver is not enabled',
  'TypeScript fallback is not deleted',
  '## Clean-Temp Smoke Evidence Map',
  'direct-helper-health-smoke',
  'direct-helper-tmuxSnapshotParse-smoke',
  'explicit-go-cutover-adapter-smoke',
  'explicit-go-packaged-preview-adapter-smoke',
  'default-disabled-control-smoke',
  '## Default Resolver Approval Checklist',
  'helper-discoverability',
  'version-protocol-capability-match',
  'unsupported-platform-policy',
  'fail-closed-no-leak-diagnostics',
  'package-manager-install-load-proof',
  'rollback-default-disable-rehearsal',
  'manual-rc-implication',
  'broad-validation',
  'explicit-leader-user-approval',
  '## GO/NO-GO Recommendation',
  'GO for a later non-mutating default-Go dry-run implementation slice',
  'NO-GO for actual default Go enablement',
  'NO-GO for actual default resolver enablement',
  'NO-GO for TypeScript fallback deletion',
  'NO-GO for package/native release work',
  'NO-GO for v0.7 release-ready approval',
  '## Blocker Ledger',
  'actual-default-go-enable',
  'default-resolver-normal-user-availability',
  'package-manager-native-delivery',
  'fallback-deletion',
  'rollback-default-disable-rehearsal',
  'manual-rc-and-broad-validation',
  'explicit-release-governance',
  '## TypeScript/pi Authority Boundary',
  'Go remains parser-only for `tmuxSnapshotParse`.',
  'Go must not execute tmux',
  'Go must not own capture/session/pane/worker lifecycle',
  'Go must not write state',
  'Go must not govern task/report/PlanRun',
  'Go must not read full-text mailbox/report bodies',
  'Go must not render UI',
  'Go must not manage package/release behavior',
  '## Package And Artifact Invariants',
  '`package.json` version remains `0.6.8`.',
  'No `package-lock.json`, `npm-shrinkwrap.json`, `go.mod`, or `go.sum` is introduced.',
  '## Explicit STOP Items',
  'default Go enabled',
  'default resolver enabled',
  'fallback deletion approved/deleted',
  'v0.7 release-ready',
  'npm publish/version',
  'tag/release created',
  'native package approved',
  '## Validation',
]
const REQUIRED_ROADMAP = [
  'v0.6.46 default-Go readiness approval gate',
  'docs/perf/v0.6.46-default-go-readiness-approval-gate.md',
  'default-Go readiness approval gate 已启动/完成',
  '仍 `ready:false`',
  'default Go 未启用',
  'GO for later non-mutating default-Go dry-run implementation',
  'NO-GO for actual default enablement/fallback deletion/release-ready',
  '**v0.6.46 default-Go readiness approval gate**',
]
const POSITIVE_OVERCLAIMS = [
  'default Go enabled: true',
  'default Go is enabled',
  'default resolver enabled: true',
  'default resolver is enabled',
  'fallback deletion approved: true',
  'fallback deletion is approved',
  'fallback deletion deleted',
  'TypeScript fallback deleted: true',
  'TypeScript fallback deletion approved: true',
  'v0.7 release-ready approval is granted',
  'v0.7 is release-ready',
  'v0.7 is release ready',
  'ready for release',
  'release can ship',
  'npm publish completed',
  'npm version completed',
  'tag/release created: true',
  'tag was created',
  'GitHub release created',
  'native package approved: true',
]
const REQUIRED_EXISTING_FILES = [
  'docs/perf/v0.6.44-go-cutover-candidate-selection.md',
  'docs/perf/v0.6.45-tmux-snapshot-cutover-gate-prep.md',
  'tests/fixtures/kernel/v0644/goCutoverCandidateSelection.cjs',
  'tests/fixtures/kernel/v0645/tmuxSnapshotCutoverGatePrep.cjs',
  'tests/suites/go-kernel-v0644-go-cutover-candidate-selection.cjs',
  'tests/suites/go-kernel-v0645-tmux-snapshot-cutover-gate-prep.cjs',
  'tests/fixtures/kernel/tmux/snapshotCases.cjs',
  'tests/suites/go-kernel-tmux-snapshot-parser.cjs',
  'tests/suites/go-kernel-tmux-cutover-failure-classes.cjs',
  'tests/suites/go-kernel-v0421-packaged-preview-resolver.cjs',
  'tests/suites/go-kernel-v0636-default-go-readiness-dry-run.cjs',
  'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs',
  'core/kernel.ts',
  'tmux/snapshot.ts',
  'teamPanel/dataSource.ts',
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
const FORBIDDEN_RAW_EVIDENCE = /(?:^|\/)(?:.*default-go-readiness-approval.*\.json|.*v0646.*raw.*|.*raw-tmux.*|.*tmux.*stdout.*|.*tmux.*stderr.*|.*state-archive.*|.*raw-state.*|.*mailbox.*body.*|.*report.*body.*|.*worker.*transcript.*|.*screenshot.*|.*terminal.*raw.*log.*|.*hosted.*record.*)$/i
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'

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

function assertNoLeaks(value, roots = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'summary must not leak absolute temp/repo roots')
  }
  assert.equal(text.includes(process.cwd()), false, 'summary must not leak process cwd')
  for (const marker of NO_LEAK_MARKERS) assert.equal(text.includes(marker), false, `summary must not leak ${marker}`)
  assert.equal(/stdout|stderr|stack|AssertionError|\bat\s+|kernel\/go\/agentteam-kernel|agentteam-v0646-default-go-approval/i.test(text), false, 'summary must not leak raw process/package internals')
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
  assert.match(doc, /Result: v0\.6\.46 starts the true default-Go readiness approval gate/i)
  assert.match(doc, /Final result remains `ready:false`\./)
  assert.match(doc, /GO for a later non-mutating default-Go dry-run implementation slice/i)
  assert.match(doc, /NO-GO for actual default Go enablement/i)
  assert.equal(/"records"\s*:|"profileSummary"\s*:|"runId"\s*:|"jobs"\s*:|"manifest"\s*:|"provenance"\s*:/i.test(doc), false, `${DOC} must not embed raw JSON evidence`)
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(defaultGoReadinessApprovalGate)), defaultGoReadinessApprovalGate, 'fixture should be plain deterministic data')
  assert.equal(defaultGoReadinessApprovalGate.schemaVersion, DEFAULT_GO_READINESS_APPROVAL_GATE_SCHEMA_VERSION)
  assert.equal(defaultGoReadinessApprovalGate.theme, DEFAULT_GO_READINESS_APPROVAL_GATE_THEME)
  assert.equal(defaultGoReadinessApprovalGate.releaseTarget, CURRENT_RELEASE_TARGET)
  assert.equal(defaultGoReadinessApprovalGate.status, STATUS)
  assert.equal(defaultGoReadinessApprovalGate.ready, false)
  assert.equal(defaultGoReadinessApprovalGate.selectedModule, SELECTED_MODULE)
  assert.equal(defaultGoReadinessApprovalGate.selectedModuleLabel, SELECTED_MODULE_LABEL)
  assert.equal(defaultGoReadinessApprovalGate.helperVersion, HELPER_VERSION)
  assert.equal(defaultGoReadinessApprovalGate.protocolVersion, PROTOCOL_VERSION)
  assert.deepEqual(defaultGoReadinessApprovalGate.requiredCapabilities, REQUIRED_CAPABILITIES)
  for (const field of ['runtimeBehaviorChanged', 'defaultGoEnabled', 'defaultResolverEnabled', 'defaultGoApproved', 'defaultResolverApproved', 'typeScriptFallbackDeleted', 'fallbackDeletionApproved', 'packageVersionChanged', 'packageMetadataChanged', 'tagCreated', 'releaseCreated', 'npmPublished', 'npmVersionChanged', 'nativeWorkPerformed', 'nativePackageApproved', 'releaseReadyClaim', 'packageReleaseApproved', 'releaseAssetsCreated', 'rawArtifactsCheckedIn']) {
    assert.equal(defaultGoReadinessApprovalGate[field], false, `${field} should remain false`)
  }
  assert.deepEqual(defaultGoReadinessApprovalGate.packageRuntimeInvariants, PACKAGE_RUNTIME_INVARIANTS)
  assert.deepEqual(defaultGoReadinessApprovalGate.cleanTempSmokeEvidence, CLEAN_TEMP_SMOKE_EVIDENCE)
  assert.deepEqual(defaultGoReadinessApprovalGate.defaultResolverApprovalChecklist, DEFAULT_RESOLVER_APPROVAL_CHECKLIST)
  assert.deepEqual(defaultGoReadinessApprovalGate.blockerLedger, BLOCKER_LEDGER)
  assert.deepEqual(defaultGoReadinessApprovalGate.tsPiControlPlaneBoundaries, TS_PI_CONTROL_PLANE_BOUNDARIES)
  assert.deepEqual(defaultGoReadinessApprovalGate.goAllowedScope, GO_ALLOWED_SCOPE)
  assert.deepEqual(defaultGoReadinessApprovalGate.goForbiddenScope, GO_FORBIDDEN_SCOPE)
  assert.deepEqual(defaultGoReadinessApprovalGate.goNoGoRecommendation, GO_NO_GO_RECOMMENDATION)
  assert.deepEqual(defaultGoReadinessApprovalGate.noLeak.markers, NO_LEAK_MARKERS)
  assert.equal(defaultGoReadinessApprovalGate.noLeak.rawStdoutCheckedIn, false)
  assert.equal(defaultGoReadinessApprovalGate.noLeak.rawStderrCheckedIn, false)
  assert.equal(defaultGoReadinessApprovalGate.noLeak.rawStateArchivesCheckedIn, false)
  assert.equal(defaultGoReadinessApprovalGate.noLeak.rawFullBodiesCheckedIn, false)
  assert.equal(defaultGoReadinessApprovalGate.noLeak.nativeBinariesCheckedIn, false)
  assert.equal(defaultGoReadinessApprovalGate.noLeak.releaseAssetsCheckedIn, false)
  assert.deepEqual(defaultGoReadinessApprovalGate.overclaimBans, OVERCLAIM_BANS)
  assert.deepEqual(defaultGoReadinessApprovalGate.validationCommands, VALIDATION_COMMANDS)
}

function assertApprovalChecklistAndRecommendation() {
  const checklist = new Map(DEFAULT_RESOLVER_APPROVAL_CHECKLIST.map(item => [item.id, item]))
  for (const id of ['helper-discoverability', 'version-protocol-capability-match', 'unsupported-platform-policy', 'fail-closed-no-leak-diagnostics', 'package-manager-install-load-proof', 'rollback-default-disable-rehearsal', 'manual-rc-implication', 'broad-validation', 'explicit-leader-user-approval']) {
    assert.equal(checklist.has(id), true, `approval checklist should include ${id}`)
    assert.equal(checklist.get(id).requiredBeforeActualDefault, true, `${id} should be required before actual default`)
  }
  assert.equal(checklist.get('helper-discoverability').requiredBeforeDryRunImplementation, true)
  assert.equal(checklist.get('package-manager-install-load-proof').requiredBeforeDryRunImplementation, true)
  assert.equal(checklist.get('manual-rc-implication').requiredBeforeDryRunImplementation, false)
  assert.equal(GO_NO_GO_RECOMMENDATION.nextDefaultGoDryRunImplementation, 'GO')
  assert.equal(GO_NO_GO_RECOMMENDATION.actualDefaultGoEnablement, 'NO-GO')
  assert.equal(GO_NO_GO_RECOMMENDATION.actualDefaultResolverEnablement, 'NO-GO')
  assert.equal(GO_NO_GO_RECOMMENDATION.typeScriptFallbackDeletion, 'NO-GO')
  assert.equal(GO_NO_GO_RECOMMENDATION.packageNativeRelease, 'NO-GO')
  assert.equal(GO_NO_GO_RECOMMENDATION.v07ReleaseReady, 'NO-GO')
}

function assertBlockersAndSmokeEvidence() {
  assert.deepEqual(CLEAN_TEMP_SMOKE_EVIDENCE.map(item => item.id), [
    'direct-helper-health-smoke',
    'direct-helper-tmuxSnapshotParse-smoke',
    'explicit-go-cutover-adapter-smoke',
    'explicit-go-packaged-preview-adapter-smoke',
    'default-disabled-control-smoke',
  ])
  for (const item of CLEAN_TEMP_SMOKE_EVIDENCE) {
    assert.equal(item.repoArtifact, false, `${item.id} should not create repo artifacts`)
    assert.equal(item.sanitizedSummaryOnly, true, `${item.id} should be sanitized summary only`)
  }
  const blockerIds = BLOCKER_LEDGER.map(item => item.id)
  for (const id of ['actual-default-go-enable', 'default-resolver-normal-user-availability', 'package-manager-native-delivery', 'fallback-deletion', 'rollback-default-disable-rehearsal', 'manual-rc-and-broad-validation', 'explicit-release-governance']) {
    assert.equal(blockerIds.includes(id), true, `blocker ledger should include ${id}`)
  }
  for (const blocker of BLOCKER_LEDGER) {
    assert.equal(blocker.status, 'blocked', `${blocker.id} should remain blocked`)
    assert.equal(Array.isArray(blocker.blocks), true, `${blocker.id} should list blocked decisions`)
    assert.ok(blocker.reason.length > 30, `${blocker.id} should explain reason`)
  }
}

function assertPackageRuntimeInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, PACKAGE_RUNTIME_INVARIANTS.packageName)
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.version, PACKAGE_RUNTIME_INVARIANTS.packageVersion)
  assert.equal(packageJson.type, PACKAGE_RUNTIME_INVARIANTS.packageType)
  assert.deepEqual(packageJson.pi?.extensions, [...PACKAGE_RUNTIME_INVARIANTS.piExtensions])
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.defaultGoEnabled, false)
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.defaultResolverEnabled, false)
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
  const v0645 = require(path.join(root, 'tests/fixtures/kernel/v0645/tmuxSnapshotCutoverGatePrep.cjs')).tmuxSnapshotCutoverGatePrep
  assert.equal(v0644.selectedModule, 'tmuxSnapshotParse')
  assert.equal(v0644.ready, false)
  assert.equal(v0645.selectedModule, 'tmuxSnapshotParse')
  assert.equal(v0645.ready, false)
  assert.equal(v0645.defaultGoEnabled, false)
  const v0636 = require(path.join(root, 'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs')).defaultGoReadinessLedger
  assert.equal(v0636.ready, false)
  assert.equal(v0636.defaultGo, false)
  assert.equal(v0636.defaultResolver, false)
}

function assertNoRuntimeBehaviorChanged(root, env) {
  const snapshotSource = read(root, 'tmux/snapshot.ts')
  assert.equal(snapshotSource.includes('runTmuxNoThrow(['), false, 'post-v0.6.49 tmux capture no longer uses the TypeScript tmux client')
  assert.match(snapshotSource, /TMUX_PANE_SNAPSHOT_FORMAT/, 'TypeScript should retain tmux format as protocol constant')
  assert.equal(/parseTmuxPaneSnapshotWithTypeScript/.test(snapshotSource), false, 'approved v0.6.48 cutover deletes TypeScript parser fallback')
  assert.match(snapshotSource, /createAgentTeamKernelAdapter\(\)\.captureTmuxSnapshot/, 'post-v0.6.49 first slice moves tmux snapshot capture behind the kernel adapter')

  const kernelSource = read(root, 'core/kernel.ts')
  assert.match(kernelSource, /if \(!raw \|\| raw === 'default'\) return 'default'/, 'default/unset should normalize to default cutover mode')
  assert.match(kernelSource, /requestedMode === 'go-cutover'/, 'go-cutover remains explicit')
  assert.match(kernelSource, /requestedMode === 'go-packaged-preview'/, 'go-packaged-preview remains explicit')
  assert.match(kernelSource, /AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse'/, 'tmuxSnapshotParse remains cutover module')
  assert.match(kernelSource, /compactReadModelFingerprint\(input, fallback = fallbackCompactReadModelFingerprint\)/, 'compactReadModelFingerprint seam remains present')
  assert.match(kernelSource, /if \(cutoverRequested\) return fallback\(compactInput\)/, 'compactReadModelFingerprint remains TS fallback/non-cutover')
  assert.equal(/default Go is enabled|default resolver is enabled|fallback deletion is approved|native package approved|npm publish completed|GitHub release created/.test(kernelSource), false, 'kernel source must not overclaim')

  for (const rel of ['adapters/tmux/teamPanes.ts', 'tools/workerSpawnService.ts', 'app/taskApplication.ts', 'app/taskReportWorkflow.ts', 'app/planRunApplication.ts', 'teamPanel/dataSource.ts']) {
    const source = read(root, rel)
    assert.equal(source.includes('core/kernel.js'), false, `${rel} must not import kernel authority`)
    assert.equal(source.includes('createAgentTeamKernelAdapter'), false, `${rel} must not call the Go parser adapter`)
    assert.equal(source.includes('PI_AGENTTEAM_KERNEL'), false, `${rel} must not read kernel env`)
  }

  const goSource = read(root, 'kernel/go/agentteam-kernel/main.go')
  assert.match(goSource, /case "tmuxSnapshotCapture"/, 'post-v0.6.49 first slice may add narrow tmux snapshot capture')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat\)/, 'Go tmux execution must be limited to snapshot capture')
  for (const forbidden of ['createTeammatePane', 'kill-pane', 'display-message', 'send-keys', 'PI_AGENTTEAM_HOME', 'team.json', 'os.Open', 'os.ReadFile', 'os.WriteFile', 'os.Create']) {
    assert.equal(goSource.includes(forbidden), false, `Go helper must not own lifecycle/state authority: ${forbidden}`)
  }

  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const defaultAdapter = kernel.createAgentTeamKernelAdapter({ env: {} })
  assert.equal(defaultAdapter.metadata().kernel.requestedMode, 'default')
  assert.equal(defaultAdapter.metadata().kernel.mode, 'go')
  assert.equal(defaultAdapter.metadata().kernel.enabled, true)
  assert.equal(defaultAdapter.metadata().kernel.calls, 0)
  assert.equal(defaultAdapter.metadata().kernel.cutoverStatus, 'active')
  assert.deepEqual(kernel.AGENTTEAM_KERNEL_CAPABILITIES, [...REQUIRED_CAPABILITIES])
  assert.equal(kernel.AGENTTEAM_KERNEL_CUTOVER_MODULE, 'tmuxSnapshotParse')
}

function hasGoToolchain() {
  return childProcess.spawnSync('go', ['version'], { encoding: 'utf8', timeout: 10_000 }).status === 0
}

function buildGoHelper(root, tempRoot) {
  const out = path.join(tempRoot, 'agentteam-kernel-helper')
  const result = childProcess.spawnSync('go', ['build', '-o', out, '.'], {
    cwd: path.join(root, 'kernel/go/agentteam-kernel'),
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, GO111MODULE: 'off' },
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'go build failed')
  return out
}

function runHelper(helperPath, request) {
  return childProcess.spawnSync(helperPath, [], {
    input: `${JSON.stringify(request)}\n`,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH || '' },
  })
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
}

function assertCleanTempSmoke(root, env) {
  if (typeof env.helpers.requireDist !== 'function') return
  if (!hasGoToolchain()) return
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0646-default-go-approval-'))
  assert.equal(path.dirname(tempRoot), os.tmpdir(), 'clean temp smoke root must live directly under OS tmpdir')
  try {
    const helperPath = buildGoHelper(root, tempRoot)
    const stdout = '%v0646-a\tsession:@1\tleader\tpi\n%v0646-b\tsession:@2\tworker\tbash'
    const healthRun = runHelper(helperPath, { jsonrpc: '2.0', id: 'v0646-health', method: 'health' })
    assert.equal(healthRun.status, 0, healthRun.stderr)
    const health = JSON.parse(healthRun.stdout.trim()).result
    assert.equal(health.ok, true)
    assert.equal(health.protocolVersion, PROTOCOL_VERSION)
    assert.equal(health.helperVersion, HELPER_VERSION)
    assert.deepEqual(health.capabilities, [...REQUIRED_CAPABILITIES])
    assert.equal(health.businessPathsConnected, false)

    const parseRun = runHelper(helperPath, { jsonrpc: '2.0', id: 'v0646-parse', method: 'tmuxSnapshotParse', params: { stdout, capturedAt: 1700006460001 } })
    assert.equal(parseRun.status, 0, parseRun.stderr)
    const parsed = JSON.parse(parseRun.stdout.trim()).result
    assert.equal(parsed.ok, true)
    assert.equal(parsed.panes.length, 2)
    assert.equal(parsed.byPaneId['%v0646-b'].currentCommand, 'bash')

    const kernel = env.helpers.requireDist('core/kernel.js')
    for (const mode of ['go-cutover', 'go-packaged-preview']) {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode, helperPath, packagedHelperPath: helperPath, env: { PATH: process.env.PATH } })
      const snapshot = adapter.parseTmuxPaneSnapshot(stdout, 1700006460002, () => {
        throw new Error('TypeScript fallback must not run for clean-temp approval smoke')
      })
      assert.equal(snapshot.ok, true, `${mode} clean-temp smoke should parse via helper`)
      assert.equal(snapshot.panes.length, 2, `${mode} clean-temp smoke pane count`)
      const metadata = adapter.metadata()
      assert.equal(metadata.kernel.requestedMode, mode)
      assert.equal(metadata.kernel.mode, 'go')
      assert.equal(metadata.kernel.enabled, true)
      assert.equal(metadata.kernel.fallbacks, 0)
      assert.equal(metadata.kernel.cutoverStatus, 'active')
      assertNoLeaks(metadata, [root, tempRoot])
    }

    const sanitizedSummary = {
      rootKind: 'os-temp',
      helperPathPolicy: 'temp-only-redacted',
      snapshotInputHash: sha256Text(stdout),
      health: { ok: true, protocolVersion: health.protocolVersion, helperVersion: health.helperVersion, capabilities: health.capabilities, businessPathsConnected: health.businessPathsConnected },
      tmuxSnapshotParse: { ok: true, paneCount: parsed.panes.length, byPaneIdConsistent: Object.keys(parsed.byPaneId).length === parsed.panes.length },
      defaultGoEnabled: false,
      defaultResolverEnabled: false,
    }
    assertNoLeaks(sanitizedSummary, [root, tempRoot])
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
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
  assert.deepEqual(forbiddenRawEvidence.sort(), [], 'repo must not contain raw v0.6.46 timing/body/state/operator/tmux evidence files')
}

function assertNoCheckedInLeakMarkers(root) {
  const sentinel = 'V0646_DEFAULT_GO_APPROVAL_FULL_TEXT_SENTINEL_DO_NOT_LEAK'
  const leakFiles = []
  const allowed = new Set([FIXTURE, SUITE, DOC])
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/')) continue
    const content = fs.readFileSync(file, 'utf8')
    if (content.includes(sentinel) && !allowed.has(rel)) leakFiles.push(`${rel}:${sentinel}`)
  }
  assert.deepEqual(leakFiles.sort(), [], 'unexpected checked-in v0.6.46 full-body sentinel outside guard artifacts')
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
  name: 'Go kernel v0.6.46 default-Go readiness approval gate',
  async run(env) {
    const root = env.helpers.extRoot
    assertDocs(root)
    assertFixtureShape(root)
    assertApprovalChecklistAndRecommendation()
    assertBlockersAndSmokeEvidence()
    assertPackageRuntimeInvariants(root)
    assertExistingEvidence(root)
    assertNoRuntimeBehaviorChanged(root, env)
    assertCleanTempSmoke(root, env)
    assertArtifactInvariants(root)
    assertNoCheckedInLeakMarkers(root)
    assertGitNoReleaseArtifacts(root)
  },
}
