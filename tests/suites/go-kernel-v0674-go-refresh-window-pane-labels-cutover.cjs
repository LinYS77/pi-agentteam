const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ADAPTER_DELEGATION,
  AUTHORIZED_TMUX_COMMANDS,
  CAPABILITY,
  DIRECT_TS_REFRESH_CALLS,
  EXISTING_MARK_WINDOW_TMUX_COMMANDS,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_REFRESH_WINDOW_PANE_LABELS_CUTOVER_SCHEMA_VERSION,
  GO_REFRESH_WINDOW_PANE_LABELS_CUTOVER_THEME,
  HELPER_VERSION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  WINDOW_EXISTENCE_GUARD,
  goRefreshWindowPaneLabelsCutover,
} = require('../fixtures/kernel/v0674/goRefreshWindowPaneLabelsCutover.cjs')

const DOC = 'docs/perf/v0.6.74-go-refresh-window-pane-labels-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0674/goRefreshWindowPaneLabelsCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0674-go-refresh-window-pane-labels-cutover.cjs'
const TMUX_LABELS = 'tmux/labels.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const BUILDER = 'scripts/lib/go-helper-artifact-builder.cjs'
const VERIFIER = 'scripts/lib/go-helper-artifact-verifier.cjs'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_REFRESH_COMMANDS = [
  'tmux set-option -w -t <target> pane-border-status top',
  "tmux set-option -w -t <target> pane-border-format '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'",
]
const EXPECTED_MARK_COMMANDS = [
  'tmux set-option -w -t <target> automatic-rename off',
  'tmux set-option -w -t <target> allow-rename off',
  'tmux set-option -w -t <target> @agentteam-window 1',
]
const REQUIRED_DOC = [
  '# v0.6.74 Go Refresh Window Pane Labels Cutover',
  'Result: v0.6.74 cuts over `tmux/labels.ts refreshWindowPaneLabels(target, signal)` from direct TypeScript pane-border window `set-option` calls to the Go-backed `workerLifecycle.refreshWindowPaneLabels` operation.',
  '`tmux/labels.ts` keeps the explicit `windowExists(target, signal)` authority guard and then delegates to `createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)`.',
  'The direct TypeScript `runTmuxNoThrowAsync([\'set-option\', \'-w\'...])` fallback for the same pane-border behavior is removed.',
  '`tmux set-option -w -t <target> pane-border-status top`',
  "`tmux set-option -w -t <target> pane-border-format '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'`",
  'No other Go mutating tmux commands are introduced by this slice.',
  '`markWindowAsAgentTeam(target, signal)` remains Go-backed with the v0.6.72 command surface.',
  'pane labels, pane titles, new-session/new-window, pane creation/layout, wake/kill, state/task/UI/release/package remain TypeScript-owned.',
  'The public facade remains no-throw `Promise<void>`.',
  'helper failure, invalid target, abort, and tmux command failure resolve without throwing at the public facade and expose only compact internal diagnostics.',
  'Because Go source changes, the existing embedded helper is rebuilt in the same approved `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc` path with refreshed manifest, checksums, provenance, and placeholder attestation.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0674/goRefreshWindowPaneLabelsCutover.cjs`',
  '`tests/suites/go-kernel-v0674-go-refresh-window-pane-labels-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.74 Go refresh window pane labels cutover',
  'docs/perf/v0.6.74-go-refresh-window-pane-labels-cutover.md',
  '`tmux/labels.ts refreshWindowPaneLabels(target, signal)` keeps `windowExists(target, signal)` and delegates to `createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)`',
  "Go `workerLifecycle.refreshWindowPaneLabels` uses only `tmux set-option -w -t <target> pane-border-status top` and `tmux set-option -w -t <target> pane-border-format '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'`",
  'direct TypeScript `runTmuxNoThrowAsync([\'set-option\', \'-w\'...])` fallback is removed for the same pane-border behavior',
  '`markWindowAsAgentTeam(target, signal)` remains v0.6.72 Go-backed',
  'public facade remains no-throw `Promise<void>`',
  'pane labels/pane titles/new-session/new-window/pane creation/layout/wake/kill/state/task/UI/release/package remain TypeScript-owned',
  '**v0.6.74 Go refresh window pane labels cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'newSessionMigrated: true',
  'newWindowMigrated: true',
  'createTeammatePaneMigrated: true',
  'wakePaneMigrated: true',
  'killPaneMigrated: true',
  'stateRepositoryMigrated: true',
  'taskReportPlanRunMigrated: true',
  'teamPanelViewModelMigrated: true',
  'releasePackageVerificationMigrated: true',
  'nativeArtifactRenamed: true',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertNoReleaseOverclaims(source, label) {
  for (const forbidden of RELEASE_OVERCLAIMS) assert.equal(source.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
}

function functionBody(source, name) {
  let start = source.indexOf(`export function ${name}(`)
  if (start === -1) start = source.indexOf(`export async function ${name}(`)
  if (start === -1) start = source.indexOf(`async function ${name}(`)
  assert.notEqual(start, -1, `${name} should exist`)
  const parameterEnd = source.indexOf(')', start)
  assert.notEqual(parameterEnd, -1, `${name} should have parameters`)
  const signatureEnd = source.indexOf('\n', parameterEnd)
  const brace = source.lastIndexOf('{', signatureEnd === -1 ? source.length : signatureEnd)
  assert.ok(brace > parameterEnd, `${name} should have a body`)
  let depth = 0
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error(`${name} body should close`)
}

function parseGoCapabilities(source) {
  const body = source.match(/var\s+capabilities\s*=\s*\[\]string\{([^}]+)\}/s)?.[1] || ''
  return [...body.matchAll(/"([^"]+)"/g)].map(match => match[1])
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goRefreshWindowPaneLabelsCutover)), goRefreshWindowPaneLabelsCutover)
  assert.equal(goRefreshWindowPaneLabelsCutover.schemaVersion, GO_REFRESH_WINDOW_PANE_LABELS_CUTOVER_SCHEMA_VERSION)
  assert.equal(goRefreshWindowPaneLabelsCutover.theme, GO_REFRESH_WINDOW_PANE_LABELS_CUTOVER_THEME)
  assert.equal(goRefreshWindowPaneLabelsCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goRefreshWindowPaneLabelsCutover.helperVersion, HELPER_VERSION)
  assert.equal(goRefreshWindowPaneLabelsCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goRefreshWindowPaneLabelsCutover.capability, CAPABILITY)
  assert.equal(goRefreshWindowPaneLabelsCutover.operation, OPERATION)
  assert.equal(goRefreshWindowPaneLabelsCutover.facadeName, FACADE_NAME)
  assert.equal(goRefreshWindowPaneLabelsCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goRefreshWindowPaneLabelsCutover.windowExistenceGuard, WINDOW_EXISTENCE_GUARD)
  assert.equal(goRefreshWindowPaneLabelsCutover.adapterDelegation, ADAPTER_DELEGATION)
  assert.deepEqual(goRefreshWindowPaneLabelsCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goRefreshWindowPaneLabelsCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(goRefreshWindowPaneLabelsCutover.authorizedTmuxCommands, [...AUTHORIZED_TMUX_COMMANDS])
  assert.deepEqual(goRefreshWindowPaneLabelsCutover.existingMarkWindowTmuxCommands, [...EXISTING_MARK_WINDOW_TMUX_COMMANDS])
  assert.deepEqual(goRefreshWindowPaneLabelsCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goRefreshWindowPaneLabelsCutover.directTypescriptRefreshCalls, [...DIRECT_TS_REFRESH_CALLS])
  assert.deepEqual(goRefreshWindowPaneLabelsCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goRefreshWindowPaneLabelsCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.equal(goRefreshWindowPaneLabelsCutover.facadeCutoverMigrated, true)
  assert.equal(goRefreshWindowPaneLabelsCutover.refreshWindowPaneLabelsMigrated, true)
  assert.equal(goRefreshWindowPaneLabelsCutover.typescriptSetOptionFallbackRemoved, true)
  assert.equal(goRefreshWindowPaneLabelsCutover.windowExistsGuardPreserved, true)
  assert.equal(goRefreshWindowPaneLabelsCutover.noThrowVoidFacadePreserved, true)
  assert.equal(goRefreshWindowPaneLabelsCutover.rawOutputLeakageAllowed, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.helperFailureThrowsPublicly, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.invalidTargetThrowsPublicly, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.abortThrowsPublicly, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.futureCandidateDestructive, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.markWindowAsAgentTeamMigrated, true)
  assert.equal(goRefreshWindowPaneLabelsCutover.markWindowAsAgentTeamCommandSurfaceChanged, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.paneLabelsMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.paneTitlesMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.newSessionMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.newWindowMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.createTeammatePaneMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.wakePaneMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.syncPaneLabelsMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.killPaneMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.stateRepositoryMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.taskReportPlanRunMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.teamPanelViewModelMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.releasePackageVerificationMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.nativeArtifactRenamed, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.nativeHelperRebuilt, true)
  assert.equal(goRefreshWindowPaneLabelsCutover.goSourceChanged, true)
  assert.equal(goRefreshWindowPaneLabelsCutover.packageVersionChanged, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.packageReleaseApproved, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.npmVersionChanged, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.npmPublished, false)
  assert.equal(goRefreshWindowPaneLabelsCutover.tagReleaseCreated, false)
  assert.deepEqual(AUTHORIZED_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_REFRESH_COMMANDS)
  assert.deepEqual(EXISTING_MARK_WINDOW_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_MARK_COMMANDS)
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

function assertFacadeAndAdapter(root) {
  const labelsSource = read(root, TMUX_LABELS)
  const kernelSource = read(root, KERNEL)
  const refreshBody = functionBody(labelsSource, FACADE_NAME)
  const markBody = functionBody(labelsSource, 'markWindowAsAgentTeam')
  const setPaneBody = functionBody(labelsSource, 'setPaneLabel')
  const clearPaneBody = functionBody(labelsSource, 'clearPaneLabel')

  assertIncludes(refreshBody, `if (!await ${WINDOW_EXISTENCE_GUARD}) return`, `${TMUX_LABELS} refresh window guard`)
  assertIncludes(refreshBody, ADAPTER_DELEGATION, `${TMUX_LABELS} refresh Go adapter delegation`)
  for (const directCall of DIRECT_TS_REFRESH_CALLS) assert.equal(refreshBody.includes(directCall), false, `${TMUX_LABELS} must remove direct TS refresh fallback ${directCall}`)
  assert.equal(refreshBody.includes('pane-border-status'), false, `${TMUX_LABELS} refresh body should not keep pane-border-status implementation`)
  assert.equal(refreshBody.includes('pane-border-format'), false, `${TMUX_LABELS} refresh body should not keep pane-border-format implementation`)

  assertIncludes(markBody, 'createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)', `${TMUX_LABELS} markWindowAsAgentTeam Go delegation preserved`)
  assert.equal(markBody.includes('automatic-rename'), false, `${TMUX_LABELS} mark body should not keep TS fallback`)
  // v0.6.74 remains historical refresh cutover evidence; current source may include the later v0.6.76 setPaneLabel cutover.
  assertIncludes(setPaneBody, 'createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)', `${TMUX_LABELS} pane label setting superseded by v0.6.76 Go cutover`)
  assert.equal(setPaneBody.includes("runTmuxNoThrowAsync(['set-option', '-p'"), false, `${TMUX_LABELS} setPaneLabel direct TS set-option fallback removed by v0.6.76`)
  assert.equal(setPaneBody.includes("runTmuxNoThrowAsync(['select-pane', '-t', paneId, '-T', label]"), false, `${TMUX_LABELS} setPaneLabel direct TS select-pane fallback removed by v0.6.76`)
  assert.equal(clearPaneBody.includes("runTmuxNoThrowAsync(['set-option', '-up'"), false, `${TMUX_LABELS} pane label clear direct TS fallback removed by later v0.6.78`)
  assert.equal(clearPaneBody.includes("runTmuxNoThrowAsync(['select-pane'"), false, `${TMUX_LABELS} pane title clear direct TS fallback removed by later v0.6.78`)
  assertIncludes(clearPaneBody, 'createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)', `${TMUX_LABELS} clearPaneLabel later v0.6.78 Go-backed`)

  assertIncludes(kernelSource, 'export type AgentTeamKernelWindowPaneLabelsRefresh', KERNEL)
  assertIncludes(kernelSource, 'refreshWindowPaneLabelsAsync(target: string, signal?: AbortSignal): Promise<AgentTeamKernelWindowPaneLabelsRefresh>', KERNEL)
  assertIncludes(kernelSource, "operation: 'refreshWindowPaneLabels'", KERNEL)
  assertIncludes(kernelSource, "callHelperAsync<unknown>('workerLifecycle', { operation: 'refreshWindowPaneLabels', target: requestedTarget }, signal)", KERNEL)
  assertIncludes(kernelSource, 'workerLifecycleRefreshWindowPaneLabelsConnected', KERNEL)
  assertIncludes(kernelSource, 'workerLifecycleUnavailableWindowPaneLabelsRefresh', KERNEL)
  assertIncludes(kernelSource, 'validateWindowPaneLabelsRefreshResult', KERNEL)
}

function assertGoRuntime(root) {
  const goSource = read(root, GO_SOURCE)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include workerLifecycle ${operation}`)

  assertIncludes(goSource, 'type workerWindowPaneLabelsRefreshResult struct', GO_SOURCE)
  assertIncludes(goSource, 'func refreshWindowPaneLabels(params map[string]any) workerWindowPaneLabelsRefreshResult', GO_SOURCE)
  assertIncludes(goSource, 'func runWindowPaneLabelsSetOption(target string, option string, value string) string', GO_SOURCE)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-status", "top")', `${GO_SOURCE} authorized pane-border-status`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-format", "#{?@agentteam-name,#{@agentteam-name},#{pane_title}}")', `${GO_SOURCE} authorized pane-border-format`)
  assert.equal([...goSource.matchAll(/runWindowPaneLabelsSetOption\(target,/g)].length, AUTHORIZED_TMUX_COMMANDS.length, `${GO_SOURCE} should use exactly two refresh set-option calls`)

  assertIncludes(goSource, 'func markWindowAsAgentTeam(params map[string]any) workerWindowMarkingResult', `${GO_SOURCE} markWindowAsAgentTeam preserved`)
  assertIncludes(goSource, 'func runWindowMarkingSetOption(target string, option string, value string) string', `${GO_SOURCE} mark set-option helper preserved`)
  for (const command of EXISTING_MARK_WINDOW_TMUX_COMMANDS) {
    assertIncludes(goSource, `runWindowMarkingSetOption(target, "${command.option}", "${command.value}")`, `${GO_SOURCE} existing mark command ${command.option}`)
  }
  assert.equal([...goSource.matchAll(/runWindowMarkingSetOption\(target,/g)].length, EXISTING_MARK_WINDOW_TMUX_COMMANDS.length, `${GO_SOURCE} should keep exactly three mark set-option calls`)

  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => !['select-pane', 'split-window', 'select-layout', 'resize-pane', 'new-session', 'new-window', 'kill-pane'].includes(command))) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add forbidden command ${command}`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-p", "-t", paneID, "@agentteam-name", label)', `${GO_SOURCE} later v0.6.76 authorized pane label set-option`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} later v0.6.78 authorized pane label clearing`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} later v0.6.78 authorized pane title clearing`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} later v0.6.76 authorized pane title set`)
}

async function assertPublicNoThrowBehavior(distRoot) {
  const kernel = require(path.join(distRoot, 'core/kernel.js'))
  const missingHelper = path.join(distRoot, 'missing-refresh-helper')
  const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: missingHelper, env: {} })
  const invalid = await adapter.refreshWindowPaneLabelsAsync('agentteam invalid target')
  assert.equal(invalid.ok, false)
  assert.equal(invalid.operation, 'refreshWindowPaneLabels')
  assert.equal(invalid.failureKind, 'invalid-target')
  const missing = await adapter.refreshWindowPaneLabelsAsync('agentteam:@1')
  assert.equal(missing.ok, false)
  assert.equal(missing.operation, 'refreshWindowPaneLabels')
  const controller = new AbortController()
  controller.abort()
  const aborted = await adapter.refreshWindowPaneLabelsAsync('agentteam:@1', controller.signal)
  assert.equal(aborted.ok, false)
  assert.equal(aborted.operation, 'refreshWindowPaneLabels')
}

function assertArtifactPipeline(root) {
  const builder = read(root, BUILDER)
  const verifier = read(root, VERIFIER)
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  const provenance = JSON.parse(read(root, `${NATIVE_ROOT}/provenance.json`))
  const checksums = read(root, `${NATIVE_ROOT}/SHA256SUMS`)

  assertIncludes(builder, 'runWorkerLifecycleRefreshWindowPaneLabelsSmoke', BUILDER)
  assertIncludes(builder, 'workerLifecycleRefreshWindowPaneLabels', BUILDER)
  assertIncludes(verifier, 'workerLifecycleRefreshWindowPaneLabels', VERIFIER)
  assert.equal(manifest.packageVersion, PACKAGE_VERSION)
  assert.equal(manifest.helperVersion, HELPER_VERSION)
  assert.equal(manifest.protocolVersion, PROTOCOL_VERSION)
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(manifest.module, 'tmuxSnapshotParse')
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
  assert.equal(manifest.smoke.health, true)
  assert.equal(manifest.smoke.workerLifecycleMarkWindowAsAgentTeam.ok, false)
  assert.deepEqual(manifest.smoke.workerLifecycleMarkWindowAsAgentTeam.acceptedFailureKinds, ['invalid-target'])
  assert.equal(manifest.smoke.workerLifecycleRefreshWindowPaneLabels.ok, false)
  assert.deepEqual(manifest.smoke.workerLifecycleRefreshWindowPaneLabels.acceptedFailureKinds, ['invalid-target'])
  assert.equal(provenance.smoke.workerLifecycleRefreshWindowPaneLabels.ok, false)
  assertIncludes(checksums, `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`, 'native checksums')
  assertIncludes(checksums, `${NATIVE_ROOT}/manifest.json`, 'native checksums')
  assertIncludes(checksums, `${NATIVE_ROOT}/provenance.json`, 'native checksums')
}

function assertPackageGuards(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.optionalDependencies, undefined)
  assert.equal(packageJson.bundleDependencies, undefined)
  assert.equal(packageJson.bundledDependencies, undefined)
  assert.equal(packageJson.bin, undefined)
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  assert.equal(exists(root, `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`), true, 'existing native helper should remain present')
  assert.equal(exists(root, `${NATIVE_ROOT}/manifest.json`), true, 'existing native manifest should remain present')
  assert.equal(exists(root, `${NATIVE_ROOT}/SHA256SUMS`), true, 'existing native checksums should remain present')
}

module.exports = {
  name: 'Go kernel v0.6.74 Go refresh window pane labels cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeAndAdapter(root)
    assertGoRuntime(root)
    await assertPublicNoThrowBehavior(env.helpers.distRoot)
    assertArtifactPipeline(root)
    assertPackageGuards(root)
  },
}
