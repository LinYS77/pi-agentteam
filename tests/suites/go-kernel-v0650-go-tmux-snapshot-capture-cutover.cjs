const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  CAPABILITY,
  FAILURE_KINDS,
  FORBIDDEN_GO_RUNTIME_TERMS,
  GO_TMUX_SNAPSHOT_CAPTURE_CUTOVER_SCHEMA_VERSION,
  GO_TMUX_SNAPSHOT_CAPTURE_CUTOVER_THEME,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  REQUIRED_CAPABILITIES,
  SNAPSHOT_FORMAT,
  goTmuxSnapshotCaptureCutover,
} = require('../fixtures/kernel/v0650/goTmuxSnapshotCaptureCutover.cjs')

const DOC = 'docs/perf/v0.6.50-go-tmux-snapshot-capture-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0650/goTmuxSnapshotCaptureCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0650-go-tmux-snapshot-capture-cutover.cjs'
const MANIFEST = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.50 Go tmuxSnapshotCapture Cutover',
  'Result: v0.6.50 implements the first post-v0.6.49 control-plane expansion slice: Go now owns the narrow tmux snapshot capture adapter.',
  'TypeScript caller -> Go `tmux list-panes -a -F <format>` -> Go snapshot parse -> compact TmuxSnapshot result',
  '`captureTmuxSnapshot(capturedAt)` now delegates to `createAgentTeamKernelAdapter().captureTmuxSnapshot(capturedAt)`.',
  'The embedded Go helper exposes `tmuxSnapshotCapture` in health capabilities.',
  'The Go helper executes exactly `tmux list-panes -a -F tmuxPaneSnapshotFormat` for this capability.',
  'worker pane creation, wake delivery, labeling, or kill lifecycle',
  '`display-message`, `send-keys`, `split-window`, `new-window`, or broad tmux lifecycle commands',
  'state/repository reads or writes',
  'task/report/PlanRun governance',
  'mailbox/report full-text reads',
  '`/team` TUI rendering',
  '`module:"tmuxSnapshotCapture"`',
  '`capability:"tmuxSnapshotCapture"`',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0650/goTmuxSnapshotCaptureCutover.cjs`',
  '`tests/suites/go-kernel-v0650-go-tmux-snapshot-capture-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.50 Go tmuxSnapshotCapture cutover',
  'docs/perf/v0.6.50-go-tmux-snapshot-capture-cutover.md',
  'Go now owns the narrow tmux snapshot capture adapter',
  'captureTmuxSnapshot(capturedAt) delegates to createAgentTeamKernelAdapter().captureTmuxSnapshot(capturedAt)',
  'worker lifecycle、state repository、task/report/PlanRun、team panel view-model、package/release 仍未迁移',
  '**v0.6.50 Go tmuxSnapshotCapture cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'package release approved: true',
  'workerLifecycleMigrated: true',
  'stateRepositoryMigrated: true',
  'taskReportPlanRunMigrated: true',
  'teamPanelViewModelMigrated: true',
]
const RAW_EVIDENCE = /(?:^|\/)(?:.*v0650.*raw.*|.*tmux.*stdout.*|.*tmux.*stderr.*|.*state-archive.*|.*raw-state.*|.*mailbox.*body.*|.*report.*body.*|.*worker.*transcript.*|.*terminal.*raw.*log.*)$/i

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
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

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertNoReleaseOverclaims(source, label) {
  for (const forbidden of RELEASE_OVERCLAIMS) assert.equal(source.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goTmuxSnapshotCaptureCutover)), goTmuxSnapshotCaptureCutover)
  assert.equal(goTmuxSnapshotCaptureCutover.schemaVersion, GO_TMUX_SNAPSHOT_CAPTURE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goTmuxSnapshotCaptureCutover.theme, GO_TMUX_SNAPSHOT_CAPTURE_CUTOVER_THEME)
  assert.equal(goTmuxSnapshotCaptureCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goTmuxSnapshotCaptureCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goTmuxSnapshotCaptureCutover.capability, CAPABILITY)
  assert.deepEqual(goTmuxSnapshotCaptureCutover.requiredCapabilities, [...REQUIRED_CAPABILITIES])
  assert.equal(goTmuxSnapshotCaptureCutover.snapshotFormat, SNAPSHOT_FORMAT)
  assert.deepEqual(goTmuxSnapshotCaptureCutover.failureKinds, [...FAILURE_KINDS])
  assert.deepEqual(goTmuxSnapshotCaptureCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goTmuxSnapshotCaptureCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.equal(goTmuxSnapshotCaptureCutover.captureRuntimeMigrated, true)
  assert.equal(goTmuxSnapshotCaptureCutover.workerLifecycleMigrated, false)
  assert.equal(goTmuxSnapshotCaptureCutover.stateRepositoryMigrated, false)
  assert.equal(goTmuxSnapshotCaptureCutover.taskReportPlanRunMigrated, false)
  assert.equal(goTmuxSnapshotCaptureCutover.teamPanelViewModelMigrated, false)
  assert.equal(goTmuxSnapshotCaptureCutover.packageReleaseApproved, false)
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoReleaseOverclaims(doc, DOC)
  assertNoReleaseOverclaims(roadmap, ROADMAP)
}

function assertRuntimeSources(root) {
  const snapshotSource = read(root, 'tmux/snapshot.ts')
  const kernelSource = read(root, 'core/kernel.ts')
  const goSource = read(root, 'kernel/go/agentteam-kernel/main.go')
  assert.match(snapshotSource, /export const TMUX_PANE_SNAPSHOT_FORMAT = '#\{pane_id\}\\t#\{session_name\}:#\{window_id\}\\t#\{@agentteam-name\}\\t#\{pane_current_command\}'/)
  assert.match(snapshotSource, /createAgentTeamKernelAdapter\(\)\.captureTmuxSnapshot\(capturedAt\)/, 'capture should delegate through kernel adapter')
  assert.equal(snapshotSource.includes('runTmuxNoThrow(['), false, 'capture should not execute tmux from TypeScript')
  assert.match(kernelSource, /'tmuxSnapshotCapture'/, 'kernel capabilities should include tmuxSnapshotCapture')
  assert.match(kernelSource, /captureTmuxSnapshot\(capturedAt: number\)/, 'adapter should expose captureTmuxSnapshot')
  assert.match(kernelSource, /callHelper<unknown>\('tmuxSnapshotCapture', \{ capturedAt \}\)/, 'adapter should call helper capture capability')
  assert.match(goSource, /case "tmuxSnapshotCapture"/, 'Go helper should route tmuxSnapshotCapture')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat\)/, 'Go capture must be exactly list-panes snapshot capture')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'later v0.6.60 permits only narrow current-pane binding display-message')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, 'Go must not add target-based display-message')
  for (const forbidden of FORBIDDEN_GO_RUNTIME_TERMS.filter(term => !['createTeammatePane', 'split-window', 'select-layout', 'resize-pane'].includes(term))) {
    assert.equal(goSource.includes(forbidden), false, `Go source must not contain broad control-plane term ${forbidden}`)
  }
  assertIncludes(goSource, 'func createTeammatePane(params map[string]any) workerTeammatePaneCreationResult', 'later v0.6.80 authorized createTeammatePane worker lifecycle cutover')
}

function assertManifest(root) {
  const manifest = JSON.parse(read(root, MANIFEST))
  assert.deepEqual(manifest.capabilities, [...REQUIRED_CAPABILITIES])
  assert.equal(manifest.module, 'tmuxSnapshotParse')
  assert.equal(manifest.businessPathsConnected, false)
}

function assertPackageGuards(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.optionalDependencies, undefined)
  assert.equal(packageJson.bundleDependencies, undefined)
  assert.equal(packageJson.bundledDependencies, undefined)
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
}

function assertCaptureFailureNoLeak(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const missing = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(os.tmpdir(), 'missing-v0650-helper') })
  const snapshot = missing.captureTmuxSnapshot(1700006500000)
  assert.equal(snapshot.ok, false)
  assert.equal(snapshot.status, 'unknown')
  assert.equal(snapshot.resultMarker, 'stale')
  assert.equal(snapshot.module, 'tmuxSnapshotCapture')
  assert.equal(snapshot.capability, 'tmuxSnapshotCapture')
  assert.equal(snapshot.cutoverFailureKind, 'missing-helper')
  assert.deepEqual(snapshot.panes, [])
  assert.deepEqual(snapshot.byPaneId, {})
  const serialized = JSON.stringify(snapshot)
  assert.equal(serialized.includes('missing-v0650-helper'), false, 'missing helper basename should not leak into returned snapshot')
  assert.equal(/stdout|stderr|stack|MAILBOX_BODY|REPORT_BODY|worker transcript|rawState|stateArchive/i.test(serialized), false, 'capture diagnostics must stay compact')
}

function assertRepositoryArtifacts(root) {
  const raw = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/') && RAW_EVIDENCE.test(rel)) raw.push(rel)
  }
  assert.deepEqual(raw.sort(), [], 'repo must not contain raw v0.6.50 evidence files')
}

module.exports = {
  name: 'Go kernel v0.6.50 Go tmuxSnapshotCapture cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertRuntimeSources(root)
    assertManifest(root)
    assertPackageGuards(root)
    assertCaptureFailureNoLeak(env)
    assertRepositoryArtifacts(root)
  },
}
