const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ADAPTER_DELEGATION,
  AUTHORIZED_TMUX_COMMANDS,
  CAPABILITY,
  DIRECT_TYPESCRIPT_CLEAR_PANE_LABEL_CALLS,
  EXISTING_MARK_WINDOW_TMUX_COMMANDS,
  EXISTING_REFRESH_WINDOW_PANE_LABELS_TMUX_COMMANDS,
  EXISTING_SET_PANE_LABEL_TMUX_COMMANDS,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_PANE_LABEL_CLEARING_CUTOVER_SCHEMA_VERSION,
  GO_PANE_LABEL_CLEARING_CUTOVER_THEME,
  HELPER_NAME,
  HELPER_VERSION,
  OPERATION,
  ORCHESTRATOR_NAME,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  SET_HELPER_NAME,
  SET_OPERATION,
  SET_ORCHESTRATOR_NAME,
  goPaneLabelClearingCutover,
} = require('../fixtures/kernel/v0678/goPaneLabelClearingCutover.cjs')

const DOC = 'docs/perf/v0.6.78-go-pane-label-clearing-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0678/goPaneLabelClearingCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0678-go-pane-label-clearing-cutover.cjs'
const TMUX_LABELS = 'tmux/labels.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const BUILDER = 'scripts/lib/go-helper-artifact-builder.cjs'
const VERIFIER = 'scripts/lib/go-helper-artifact-verifier.cjs'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_COMMANDS = [
  'tmux set-option -up -t <paneId> @agentteam-name',
  "tmux select-pane -t <paneId> -T ''",
]
const REQUIRED_DOC = [
  '# v0.6.78 Go Pane Label Clearing Cutover',
  'Result: v0.6.78 cuts over private `tmux/labels.ts clearPaneLabel(paneId, signal)` from direct TypeScript pane label/title clearing tmux calls to Go-backed `workerLifecycle.clearPaneLabel`.',
  '`clearPaneLabel(paneId, signal)` now delegates to `createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)`.',
  'The direct TypeScript `runTmuxNoThrowAsync([\'set-option\', \'-up\'...])` fallback is removed for the same pane label clearing behavior.',
  'The direct TypeScript `runTmuxNoThrowAsync([\'select-pane\', \'-t\', paneId, \'-T\', \'\']...)` fallback is removed for the same pane title clearing behavior.',
  '`tmux set-option -up -t <paneId> @agentteam-name`',
  "`tmux select-pane -t <paneId> -T ''`",
  'The Go implementation validates pane id compactly as a `%123`-style pane id before invoking tmux.',
  'No label argument exists for this operation.',
  '`clearPaneLabelsForTeam(...)` remains TypeScript-owned orchestration',
  '`setPaneLabel(paneId, label, signal)` remains v0.6.76 Go-backed',
  '`markWindowAsAgentTeam(target, signal)` remains v0.6.72 Go-backed',
  '`refreshWindowPaneLabels(target, signal)` remains v0.6.74 Go-backed',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0678/goPaneLabelClearingCutover.cjs`',
  '`tests/suites/go-kernel-v0678-go-pane-label-clearing-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.78 Go pane label clearing cutover',
  'docs/perf/v0.6.78-go-pane-label-clearing-cutover.md',
  'private `tmux/labels.ts clearPaneLabel(paneId, signal)` delegates to `createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)`',
  'Go `workerLifecycle.clearPaneLabel` uses only `tmux set-option -up -t <paneId> @agentteam-name` and `tmux select-pane -t <paneId> -T \'\'`',
  'direct TypeScript `set-option -up`/`select-pane -T \'\'` fallback is removed for `clearPaneLabel`',
  '`clearPaneLabelsForTeam(...)` remains TypeScript-owned orchestration',
  '**v0.6.78 Go pane label clearing cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'clearPaneLabelsForTeamMigrated: true',
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
const BAD_HELPER_OUTPUT = 'CLEAR_PANE_LABEL_BAD_HELPER_OUTPUT_SHOULD_NOT_LEAK'

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

function writeHelper(name, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-v0678-${name}-`))
  const file = path.join(dir, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return { dir, file }
}

function assertNoBadOutputLeak(value) {
  assert.equal(JSON.stringify(value).includes(BAD_HELPER_OUTPUT), false, 'clearPaneLabel diagnostics must not leak raw helper/stdout/stderr text')
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goPaneLabelClearingCutover)), goPaneLabelClearingCutover)
  assert.equal(goPaneLabelClearingCutover.schemaVersion, GO_PANE_LABEL_CLEARING_CUTOVER_SCHEMA_VERSION)
  assert.equal(goPaneLabelClearingCutover.theme, GO_PANE_LABEL_CLEARING_CUTOVER_THEME)
  assert.equal(goPaneLabelClearingCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goPaneLabelClearingCutover.helperVersion, HELPER_VERSION)
  assert.equal(goPaneLabelClearingCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goPaneLabelClearingCutover.capability, CAPABILITY)
  assert.equal(goPaneLabelClearingCutover.operation, OPERATION)
  assert.equal(goPaneLabelClearingCutover.setOperation, SET_OPERATION)
  assert.equal(goPaneLabelClearingCutover.helperName, HELPER_NAME)
  assert.equal(goPaneLabelClearingCutover.setHelperName, SET_HELPER_NAME)
  assert.equal(goPaneLabelClearingCutover.orchestratorName, ORCHESTRATOR_NAME)
  assert.equal(goPaneLabelClearingCutover.setOrchestratorName, SET_ORCHESTRATOR_NAME)
  assert.equal(goPaneLabelClearingCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goPaneLabelClearingCutover.adapterDelegation, ADAPTER_DELEGATION)
  assert.deepEqual(goPaneLabelClearingCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goPaneLabelClearingCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(goPaneLabelClearingCutover.authorizedTmuxCommands, [...AUTHORIZED_TMUX_COMMANDS])
  assert.deepEqual(goPaneLabelClearingCutover.existingSetPaneLabelTmuxCommands, [...EXISTING_SET_PANE_LABEL_TMUX_COMMANDS])
  assert.deepEqual(goPaneLabelClearingCutover.existingMarkWindowTmuxCommands, [...EXISTING_MARK_WINDOW_TMUX_COMMANDS])
  assert.deepEqual(goPaneLabelClearingCutover.existingRefreshWindowPaneLabelsTmuxCommands, [...EXISTING_REFRESH_WINDOW_PANE_LABELS_TMUX_COMMANDS])
  assert.deepEqual(goPaneLabelClearingCutover.directTypescriptClearPaneLabelCalls, [...DIRECT_TYPESCRIPT_CLEAR_PANE_LABEL_CALLS])
  assert.deepEqual(goPaneLabelClearingCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goPaneLabelClearingCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goPaneLabelClearingCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(AUTHORIZED_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_COMMANDS)
  assert.deepEqual(AUTHORIZED_TMUX_COMMANDS.map(command => command.args), [
    ['set-option', '-up', '-t', '<paneId>', '@agentteam-name'],
    ['select-pane', '-t', '<paneId>', '-T', ''],
  ])
  for (const command of AUTHORIZED_TMUX_COMMANDS) {
    assert.equal(command.scope.startsWith('pane'), true)
    assert.equal(command.destructive, false)
    assert.equal(command.mutatesTmux, true)
  }
  assert.equal(goPaneLabelClearingCutover.facadeCutoverMigrated, true)
  assert.equal(goPaneLabelClearingCutover.clearPaneLabelMigrated, true)
  assert.equal(goPaneLabelClearingCutover.typescriptClearPaneLabelFallbackRemoved, true)
  assert.equal(goPaneLabelClearingCutover.noThrowVoidHelperPreserved, true)
  assert.equal(goPaneLabelClearingCutover.rawOutputLeakageAllowed, false)
  assert.equal(goPaneLabelClearingCutover.clearPaneLabelsForTeamMigrated, false)
  assert.equal(goPaneLabelClearingCutover.setPaneLabelMigrated, true)
  assert.equal(goPaneLabelClearingCutover.setPaneLabelCommandSurfaceChanged, false)
  assert.equal(goPaneLabelClearingCutover.markWindowAsAgentTeamMigrated, true)
  assert.equal(goPaneLabelClearingCutover.markWindowAsAgentTeamCommandSurfaceChanged, false)
  assert.equal(goPaneLabelClearingCutover.refreshWindowPaneLabelsMigrated, true)
  assert.equal(goPaneLabelClearingCutover.refreshWindowPaneLabelsCommandSurfaceChanged, false)
  assert.equal(goPaneLabelClearingCutover.nativeArtifactRenamed, false)
  assert.equal(goPaneLabelClearingCutover.nativeHelperRebuilt, true)
  assert.equal(goPaneLabelClearingCutover.goSourceChanged, true)
  assert.equal(goPaneLabelClearingCutover.packageVersionChanged, false)
  assert.equal(goPaneLabelClearingCutover.packageReleaseApproved, false)
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

function assertRuntimeCutover(root) {
  const labelsSource = read(root, TMUX_LABELS)
  const kernelSource = read(root, KERNEL)
  const setPaneBody = functionBody(labelsSource, SET_HELPER_NAME)
  const clearPaneBody = functionBody(labelsSource, HELPER_NAME)
  const clearAllBody = functionBody(labelsSource, ORCHESTRATOR_NAME)
  const syncBody = functionBody(labelsSource, SET_ORCHESTRATOR_NAME)
  const markBody = functionBody(labelsSource, 'markWindowAsAgentTeam')
  const refreshBody = functionBody(labelsSource, 'refreshWindowPaneLabels')

  assertIncludes(clearPaneBody, ADAPTER_DELEGATION, `${TMUX_LABELS} ${HELPER_NAME}`)
  assert.equal(clearPaneBody.includes('runTmuxNoThrowAsync'), false, `${TMUX_LABELS} ${HELPER_NAME} must not keep direct TS fallback`)
  for (const call of DIRECT_TYPESCRIPT_CLEAR_PANE_LABEL_CALLS) assert.equal(clearPaneBody.includes(call), false, `${TMUX_LABELS} ${HELPER_NAME} must remove ${call}`)

  assertIncludes(setPaneBody, 'createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)', `${TMUX_LABELS} ${SET_HELPER_NAME}`)
  assert.equal(setPaneBody.includes("runTmuxNoThrowAsync(['set-option', '-p'"), false, `${TMUX_LABELS} ${SET_HELPER_NAME} must not regain direct TS fallback`)

  assertIncludes(clearAllBody, 'await clearPaneLabel(member.paneId, signal)', `${TMUX_LABELS} ${ORCHESTRATOR_NAME}`)
  assertIncludes(clearAllBody, 'const target = targetForPaneId(member.paneId) ?? member.windowTarget', `${TMUX_LABELS} ${ORCHESTRATOR_NAME}`)
  assertIncludes(clearAllBody, 'await refreshWindowPaneLabels(target, signal)', `${TMUX_LABELS} ${ORCHESTRATOR_NAME}`)
  assert.equal(clearAllBody.includes('clearPaneLabelAsync'), false, `${TMUX_LABELS} ${ORCHESTRATOR_NAME} should not bypass private helper`)
  assert.equal(clearAllBody.includes('createAgentTeamKernelAdapter'), false, `${TMUX_LABELS} ${ORCHESTRATOR_NAME} remains TS-owned orchestration`)

  assertIncludes(syncBody, 'await setPaneLabel(member.paneId', `${TMUX_LABELS} ${SET_ORCHESTRATOR_NAME}`)
  assert.equal(syncBody.includes('setPaneLabelAsync'), false, `${TMUX_LABELS} ${SET_ORCHESTRATOR_NAME} should not bypass private helper`)
  assertIncludes(markBody, 'createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)', `${TMUX_LABELS} markWindowAsAgentTeam preserved`)
  assertIncludes(refreshBody, 'createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)', `${TMUX_LABELS} refreshWindowPaneLabels preserved`)

  assertIncludes(kernelSource, 'export type AgentTeamKernelPaneLabelClearing', KERNEL)
  assertIncludes(kernelSource, 'clearPaneLabelAsync(paneId: string, signal?: AbortSignal): Promise<AgentTeamKernelPaneLabelClearing>', KERNEL)
  assertIncludes(kernelSource, "operation: 'clearPaneLabel'", KERNEL)
  assertIncludes(kernelSource, "callHelperAsync<unknown>('workerLifecycle', { operation: 'clearPaneLabel', paneId: requestedPaneId }, signal)", KERNEL)
  assertIncludes(kernelSource, 'workerLifecycleClearPaneLabelConnected', KERNEL)
  assertIncludes(kernelSource, 'workerLifecycleUnavailablePaneLabelClearing', KERNEL)
  assertIncludes(kernelSource, 'validatePaneLabelClearingResult', KERNEL)
}

async function assertAdapterNoThrowAndNoLeak(distRoot) {
  const kernel = require(path.join(distRoot, 'core/kernel.js'))
  const missingHelper = path.join(distRoot, 'missing-clear-pane-label-helper')
  const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: missingHelper, env: {} })

  const invalidPane = await adapter.clearPaneLabelAsync('not a pane')
  assert.equal(invalidPane.ok, false)
  assert.equal(invalidPane.operation, 'clearPaneLabel')
  assert.equal(invalidPane.failureKind, 'invalid-pane-id')
  assertNoBadOutputLeak(invalidPane)

  const missing = await adapter.clearPaneLabelAsync('%123')
  assert.equal(missing.ok, false)
  assert.equal(missing.operation, 'clearPaneLabel')
  assertNoBadOutputLeak(missing)

  const controller = new AbortController()
  controller.abort()
  const aborted = await adapter.clearPaneLabelAsync('%123', controller.signal)
  assert.equal(aborted.ok, false)
  assert.equal(aborted.operation, 'clearPaneLabel')
  assertNoBadOutputLeak(aborted)

  const malicious = writeHelper('malicious-clear-output', `#!/usr/bin/env node
const fs = require('node:fs')
const request = JSON.parse(fs.readFileSync(0, 'utf8').trim())
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const baseHealth = { ok: true, implementation: 'go', protocolVersion: 1, helperVersion: '0.3.0-read-model-shadow', capabilities: ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'], businessPathsConnected: false }
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'workerLifecycle') respond({ ok: false, operation: 'clearPaneLabel', capability: 'workerLifecycle', paneId: '%123', cleared: false, status: 'unknown', resultMarker: 'stale', failureKind: 'tmux-command-failed', reason: '${BAD_HELPER_OUTPUT}', error: '${BAD_HELPER_OUTPUT}', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true })
else respond(baseHealth)
`)
  try {
    const maliciousAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: malicious.file, env: {} })
    const leaked = await maliciousAdapter.clearPaneLabelAsync('%123')
    assert.equal(leaked.ok, false)
    assert.equal(leaked.failureKind, 'tmux-command-failed')
    assertNoBadOutputLeak(leaked)
  } finally {
    fs.rmSync(malicious.dir, { recursive: true, force: true })
  }
}

function assertGoRuntime(root) {
  const goSource = read(root, GO_SOURCE)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include workerLifecycle ${operation}`)
  assertIncludes(goSource, '"workerLifecycleClearPaneLabelConnected":', `${GO_SOURCE} profile flag`)
  assertIncludes(goSource, 'func clearPaneLabel(params map[string]any) workerPaneLabelClearingResult', `${GO_SOURCE} clearPaneLabel implementation`)
  assertIncludes(goSource, 'func unavailablePaneLabelClearing(paneID string, kind string) workerPaneLabelClearingResult', `${GO_SOURCE} compact clear diagnostics`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} authorized pane @agentteam-name unset`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} authorized pane title clear`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name"\)/g)].length, 1, `${GO_SOURCE} should contain exactly one clear set-option command`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "select-pane", "-t", paneID, "-T", ""\)/g)].length, 1, `${GO_SOURCE} should contain exactly one clear select-pane command`)

  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-p", "-t", paneID, "@agentteam-name", label)', `${GO_SOURCE} v0.6.76 setPaneLabel set-option preserved`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} v0.6.76 setPaneLabel select-pane preserved`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-status", "top")', `${GO_SOURCE} v0.6.74 refresh preserved`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-format", "#{?@agentteam-name,#{@agentteam-name},#{pane_title}}")', `${GO_SOURCE} v0.6.74 refresh preserved`)
  for (const command of EXISTING_MARK_WINDOW_TMUX_COMMANDS) assertIncludes(goSource, `runWindowMarkingSetOption(target, "${command.args[4]}", "${command.args[5]}")`, `${GO_SOURCE} v0.6.72 mark preserved`)

  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => !['split-window', 'select-layout', 'resize-pane'].includes(command))) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add forbidden command ${command}`)
  assertIncludes(goSource, 'splitArgs := []string{"split-window"}', `${GO_SOURCE} later v0.6.80 authorized createTeammatePane split-window`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("select-layout", "-t", target, layout)', `${GO_SOURCE} later v0.6.80 authorized createTeammatePane select-layout`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("resize-pane", "-t", leaderPaneID, "-x", "66%")', `${GO_SOURCE} later v0.6.80 authorized createTeammatePane resize-pane`)
}

function assertArtifactPipelineAndNative(root) {
  const builder = read(root, BUILDER)
  const verifier = read(root, VERIFIER)
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  const provenance = JSON.parse(read(root, `${NATIVE_ROOT}/provenance.json`))
  assertIncludes(builder, 'runWorkerLifecycleClearPaneLabelSmoke', BUILDER)
  assertIncludes(builder, 'workerLifecycleClearPaneLabel', BUILDER)
  assertIncludes(verifier, 'workerLifecycleClearPaneLabel', VERIFIER)
  assert.equal(manifest.packageVersion, PACKAGE_VERSION)
  assert.equal(manifest.helperVersion, HELPER_VERSION)
  assert.equal(manifest.protocolVersion, PROTOCOL_VERSION)
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(manifest.artifact.path, `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`)
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
  assert.equal(manifest.smoke.workerLifecycleSetPaneLabel.ok, false)
  assert.deepEqual(manifest.smoke.workerLifecycleSetPaneLabel.acceptedFailureKinds, ['invalid-pane-id'])
  assert.equal(manifest.smoke.workerLifecycleClearPaneLabel.ok, false)
  assert.deepEqual(manifest.smoke.workerLifecycleClearPaneLabel.acceptedFailureKinds, ['invalid-pane-id'])
  assert.equal(provenance.smoke.workerLifecycleClearPaneLabel.ok, false)
  assert.deepEqual(provenance.smoke.workerLifecycleClearPaneLabel.acceptedFailureKinds, ['invalid-pane-id'])
}

function assertPackageAndReleaseGuards(root) {
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
}

module.exports = {
  name: 'Go kernel v0.6.78 Go pane label clearing cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertRuntimeCutover(root)
    await assertAdapterNoThrowAndNoLeak(env.helpers.distRoot)
    assertGoRuntime(root)
    assertArtifactPipelineAndNative(root)
    assertPackageAndReleaseGuards(root)
  },
}
