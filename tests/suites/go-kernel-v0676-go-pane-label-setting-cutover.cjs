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
  CLEAR_HELPER_NAME,
  DIRECT_TYPESCRIPT_SET_PANE_LABEL_CALLS,
  EXISTING_MARK_WINDOW_TMUX_COMMANDS,
  EXISTING_REFRESH_WINDOW_PANE_LABELS_TMUX_COMMANDS,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_PANE_LABEL_SETTING_CUTOVER_SCHEMA_VERSION,
  GO_PANE_LABEL_SETTING_CUTOVER_THEME,
  HELPER_NAME,
  HELPER_VERSION,
  LABEL_ARGUMENT_LIMIT,
  OPERATION,
  ORCHESTRATOR_NAME,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PRESERVED_CLEAR_PANE_LABEL_CALLS,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  goPaneLabelSettingCutover,
} = require('../fixtures/kernel/v0676/goPaneLabelSettingCutover.cjs')

const DOC = 'docs/perf/v0.6.76-go-pane-label-setting-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0676/goPaneLabelSettingCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0676-go-pane-label-setting-cutover.cjs'
const TMUX_LABELS = 'tmux/labels.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const BUILDER = 'scripts/lib/go-helper-artifact-builder.cjs'
const VERIFIER = 'scripts/lib/go-helper-artifact-verifier.cjs'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_COMMANDS = [
  'tmux set-option -p -t <paneId> @agentteam-name <label>',
  'tmux select-pane -t <paneId> -T <label>',
]
const RAW_LABEL_PARTS = ['raw', 'unicode', 'pane', 'label', 'canary']
const RAW_LABEL_CANARY = `${RAW_LABEL_PARTS.join('-')} 🧪`
const REQUIRED_DOC = [
  '# v0.6.76 Go Pane Label Setting Cutover',
  'Result: v0.6.76 cuts over private `tmux/labels.ts setPaneLabel(paneId, label, signal)` from direct TypeScript pane label/title tmux calls to Go-backed `workerLifecycle.setPaneLabel`.',
  '`setPaneLabel(paneId, label, signal)` now delegates to `createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)`.',
  'The direct TypeScript `runTmuxNoThrowAsync([\'set-option\', \'-p\'...])` fallback is removed for the same pane label behavior.',
  'The direct TypeScript `runTmuxNoThrowAsync([\'select-pane\', \'-t\', paneId, \'-T\', label]...)` fallback is removed for the same pane title behavior.',
  '`tmux set-option -p -t <paneId> @agentteam-name <label>`',
  '`tmux select-pane -t <paneId> -T <label>`',
  'The label is passed as an argv value only, never shell text.',
  'The label is opaque Unicode/user-visible text and may contain emoji.',
  'Raw label text must not appear in diagnostics, errors, reports, logs, or validation fixtures.',
  'The adapter and Go helper enforce a `4096` UTF-16-code-unit/byte-level label argument cap before invoking tmux.',
  '`clearPaneLabel(paneId, signal)` remains TypeScript-owned',
  '`markWindowAsAgentTeam(target, signal)` remains v0.6.72 Go-backed',
  '`refreshWindowPaneLabels(target, signal)` remains v0.6.74 Go-backed',
  'No `set-option -up` command was added by v0.6.76 itself; v0.6.78 later added the separately gated clear-pane-label command.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0676/goPaneLabelSettingCutover.cjs`',
  '`tests/suites/go-kernel-v0676-go-pane-label-setting-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.76 Go pane label setting cutover',
  'docs/perf/v0.6.76-go-pane-label-setting-cutover.md',
  'private `tmux/labels.ts setPaneLabel(paneId, label, signal)` delegates to `createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)`',
  'Go `workerLifecycle.setPaneLabel` uses only `tmux set-option -p -t <paneId> @agentteam-name <label>` and `tmux select-pane -t <paneId> -T <label>`',
  'label remains opaque Unicode/user-visible argv data and raw label diagnostics are forbidden',
  'direct TypeScript `set-option -p`/`select-pane -T label` fallback is removed for `setPaneLabel`',
  '`clearPaneLabel`, new-session/new-window, pane creation/layout, wake/kill, state/task/UI/release/package remain TypeScript-owned/out of scope',
  '**v0.6.76 Go pane label setting cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'clearPaneLabelMigrated: true',
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

function writeHelper(name, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-v0676-${name}-`))
  const file = path.join(dir, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return { dir, file }
}

function assertNoRawLabelLeak(value, label = RAW_LABEL_CANARY) {
  assert.equal(JSON.stringify(value).includes(label), false, 'setPaneLabel diagnostics must not leak raw label text')
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goPaneLabelSettingCutover)), goPaneLabelSettingCutover)
  assert.equal(goPaneLabelSettingCutover.schemaVersion, GO_PANE_LABEL_SETTING_CUTOVER_SCHEMA_VERSION)
  assert.equal(goPaneLabelSettingCutover.theme, GO_PANE_LABEL_SETTING_CUTOVER_THEME)
  assert.equal(goPaneLabelSettingCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goPaneLabelSettingCutover.helperVersion, HELPER_VERSION)
  assert.equal(goPaneLabelSettingCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goPaneLabelSettingCutover.capability, CAPABILITY)
  assert.equal(goPaneLabelSettingCutover.operation, OPERATION)
  assert.equal(goPaneLabelSettingCutover.helperName, HELPER_NAME)
  assert.equal(goPaneLabelSettingCutover.orchestratorName, ORCHESTRATOR_NAME)
  assert.equal(goPaneLabelSettingCutover.clearHelperName, CLEAR_HELPER_NAME)
  assert.equal(goPaneLabelSettingCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goPaneLabelSettingCutover.adapterDelegation, ADAPTER_DELEGATION)
  assert.equal(goPaneLabelSettingCutover.labelArgumentLimit, LABEL_ARGUMENT_LIMIT)
  assert.deepEqual(goPaneLabelSettingCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goPaneLabelSettingCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(goPaneLabelSettingCutover.authorizedTmuxCommands, [...AUTHORIZED_TMUX_COMMANDS])
  assert.deepEqual(goPaneLabelSettingCutover.existingMarkWindowTmuxCommands, [...EXISTING_MARK_WINDOW_TMUX_COMMANDS])
  assert.deepEqual(goPaneLabelSettingCutover.existingRefreshWindowPaneLabelsTmuxCommands, [...EXISTING_REFRESH_WINDOW_PANE_LABELS_TMUX_COMMANDS])
  assert.deepEqual(goPaneLabelSettingCutover.directTypescriptSetPaneLabelCalls, [...DIRECT_TYPESCRIPT_SET_PANE_LABEL_CALLS])
  assert.deepEqual(goPaneLabelSettingCutover.preservedClearPaneLabelCalls, [...PRESERVED_CLEAR_PANE_LABEL_CALLS])
  assert.deepEqual(goPaneLabelSettingCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goPaneLabelSettingCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goPaneLabelSettingCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(AUTHORIZED_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_COMMANDS)
  for (const command of AUTHORIZED_TMUX_COMMANDS) {
    assert.equal(command.scope, 'pane')
    assert.equal(command.destructive, false)
    assert.equal(command.mutatesTmux, true)
  }
  assert.equal(goPaneLabelSettingCutover.facadeCutoverMigrated, true)
  assert.equal(goPaneLabelSettingCutover.setPaneLabelMigrated, true)
  assert.equal(goPaneLabelSettingCutover.typescriptSetPaneLabelFallbackRemoved, true)
  assert.equal(goPaneLabelSettingCutover.noThrowVoidHelperPreserved, true)
  assert.equal(goPaneLabelSettingCutover.rawLabelLeakageAllowed, false)
  assert.equal(goPaneLabelSettingCutover.rawOutputLeakageAllowed, false)
  assert.equal(goPaneLabelSettingCutover.clearPaneLabelMigrated, false)
  assert.equal(goPaneLabelSettingCutover.syncPaneLabelsMigrated, false)
  assert.equal(goPaneLabelSettingCutover.markWindowAsAgentTeamMigrated, true)
  assert.equal(goPaneLabelSettingCutover.markWindowAsAgentTeamCommandSurfaceChanged, false)
  assert.equal(goPaneLabelSettingCutover.refreshWindowPaneLabelsMigrated, true)
  assert.equal(goPaneLabelSettingCutover.refreshWindowPaneLabelsCommandSurfaceChanged, false)
  assert.equal(goPaneLabelSettingCutover.nativeArtifactRenamed, false)
  assert.equal(goPaneLabelSettingCutover.nativeHelperRebuilt, true)
  assert.equal(goPaneLabelSettingCutover.goSourceChanged, true)
  assert.equal(goPaneLabelSettingCutover.packageVersionChanged, false)
  assert.equal(goPaneLabelSettingCutover.packageReleaseApproved, false)
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
  const setPaneBody = functionBody(labelsSource, HELPER_NAME)
  const clearPaneBody = functionBody(labelsSource, CLEAR_HELPER_NAME)
  const syncBody = functionBody(labelsSource, ORCHESTRATOR_NAME)
  const markBody = functionBody(labelsSource, 'markWindowAsAgentTeam')
  const refreshBody = functionBody(labelsSource, 'refreshWindowPaneLabels')

  assertIncludes(setPaneBody, ADAPTER_DELEGATION, `${TMUX_LABELS} ${HELPER_NAME}`)
  assert.equal(setPaneBody.includes('runTmuxNoThrowAsync'), false, `${TMUX_LABELS} ${HELPER_NAME} must not keep direct TS fallback`)
  for (const call of DIRECT_TYPESCRIPT_SET_PANE_LABEL_CALLS) assert.equal(setPaneBody.includes(call), false, `${TMUX_LABELS} ${HELPER_NAME} must remove ${call}`)

  for (const call of PRESERVED_CLEAR_PANE_LABEL_CALLS) assert.equal(clearPaneBody.includes(call), false, `${TMUX_LABELS} ${CLEAR_HELPER_NAME} direct TS fallback removed after later v0.6.78 cutover`)
  assertIncludes(clearPaneBody, 'createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)', `${TMUX_LABELS} ${CLEAR_HELPER_NAME} uses later v0.6.78 Go adapter delegation`)

  assertIncludes(syncBody, 'await setPaneLabel(member.paneId', `${TMUX_LABELS} ${ORCHESTRATOR_NAME}`)
  assertIncludes(syncBody, 'formatLeaderPaneLabel(team)', `${TMUX_LABELS} leader label formatting`)
  assertIncludes(syncBody, 'formatMemberPaneLabel(member)', `${TMUX_LABELS} member label formatting`)
  assert.equal(syncBody.includes('setPaneLabelAsync'), false, `${TMUX_LABELS} ${ORCHESTRATOR_NAME} should not bypass private helper`)

  assertIncludes(markBody, 'createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)', `${TMUX_LABELS} markWindowAsAgentTeam preserved`)
  assertIncludes(refreshBody, 'createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)', `${TMUX_LABELS} refreshWindowPaneLabels preserved`)

  assertIncludes(kernelSource, 'export type AgentTeamKernelPaneLabelSetting', KERNEL)
  assertIncludes(kernelSource, 'setPaneLabelAsync(paneId: string, label: string, signal?: AbortSignal): Promise<AgentTeamKernelPaneLabelSetting>', KERNEL)
  assertIncludes(kernelSource, "operation: 'setPaneLabel'", KERNEL)
  assertIncludes(kernelSource, "callHelperAsync<unknown>('workerLifecycle', { operation: 'setPaneLabel', paneId: requestedPaneId, label }, signal)", KERNEL)
  assertIncludes(kernelSource, 'workerLifecycleSetPaneLabelConnected', KERNEL)
  assertIncludes(kernelSource, 'workerLifecycleUnavailablePaneLabelSetting', KERNEL)
  assertIncludes(kernelSource, 'validatePaneLabelSettingResult', KERNEL)
  assertIncludes(kernelSource, 'PANE_LABEL_ARGUMENT_LIMIT = 4096', KERNEL)
}

async function assertAdapterNoThrowAndNoLeak(distRoot) {
  const kernel = require(path.join(distRoot, 'core/kernel.js'))
  const missingHelper = path.join(distRoot, 'missing-set-pane-label-helper')
  const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: missingHelper, env: {} })

  const invalidPane = await adapter.setPaneLabelAsync('not a pane', RAW_LABEL_CANARY)
  assert.equal(invalidPane.ok, false)
  assert.equal(invalidPane.operation, 'setPaneLabel')
  assert.equal(invalidPane.failureKind, 'invalid-pane-id')
  assertNoRawLabelLeak(invalidPane)

  const overLimitLabel = `${RAW_LABEL_CANARY}${'x'.repeat(LABEL_ARGUMENT_LIMIT)}`
  const invalidLabel = await adapter.setPaneLabelAsync('%123', overLimitLabel)
  assert.equal(invalidLabel.ok, false)
  assert.equal(invalidLabel.operation, 'setPaneLabel')
  assert.equal(invalidLabel.failureKind, 'invalid-label')
  assertNoRawLabelLeak(invalidLabel, overLimitLabel)
  assertNoRawLabelLeak(invalidLabel)

  const missing = await adapter.setPaneLabelAsync('%123', RAW_LABEL_CANARY)
  assert.equal(missing.ok, false)
  assert.equal(missing.operation, 'setPaneLabel')
  assertNoRawLabelLeak(missing)

  const controller = new AbortController()
  controller.abort()
  const aborted = await adapter.setPaneLabelAsync('%123', RAW_LABEL_CANARY, controller.signal)
  assert.equal(aborted.ok, false)
  assert.equal(aborted.operation, 'setPaneLabel')
  assertNoRawLabelLeak(aborted)

  const malicious = writeHelper('malicious-label-leak', `#!/usr/bin/env node
const fs = require('node:fs')
const request = JSON.parse(fs.readFileSync(0, 'utf8').trim())
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const baseHealth = { ok: true, implementation: 'go', protocolVersion: 1, helperVersion: '0.3.0-read-model-shadow', capabilities: ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'], businessPathsConnected: false }
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'workerLifecycle') { const label = request.params && request.params.label; respond({ ok: false, operation: 'setPaneLabel', capability: 'workerLifecycle', paneId: '%123', labeled: false, status: 'unknown', resultMarker: 'stale', failureKind: 'tmux-command-failed', reason: 'bad label ' + label, error: 'bad label ' + label, readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }) }
else respond(baseHealth)
`)
  try {
    const maliciousAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: malicious.file, env: {} })
    const leaked = await maliciousAdapter.setPaneLabelAsync('%123', RAW_LABEL_CANARY)
    assert.equal(leaked.ok, false)
    assert.equal(leaked.failureKind, 'tmux-command-failed')
    assertNoRawLabelLeak(leaked)
  } finally {
    fs.rmSync(malicious.dir, { recursive: true, force: true })
  }
}

function assertGoRuntime(root) {
  const goSource = read(root, GO_SOURCE)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include workerLifecycle ${operation}`)
  assertIncludes(goSource, '"workerLifecycleSetPaneLabelConnected":', `${GO_SOURCE} profile flag`)
  assertIncludes(goSource, 'const paneLabelArgumentLimit = 4096', `${GO_SOURCE} label cap`)
  assertIncludes(goSource, 'func compactTmuxPaneID(raw string) string', `${GO_SOURCE} pane id validation`)
  assertIncludes(goSource, 'func paneLabelParam(params map[string]any) (string, bool)', `${GO_SOURCE} label argument validation`)
  assertIncludes(goSource, 'type workerPaneLabelSettingResult struct', `${GO_SOURCE} setPaneLabel result type`)
  assertIncludes(goSource, 'func setPaneLabel(params map[string]any) workerPaneLabelSettingResult', `${GO_SOURCE} setPaneLabel implementation`)
  assertIncludes(goSource, 'func unavailablePaneLabelSetting(paneID string, kind string) workerPaneLabelSettingResult', `${GO_SOURCE} compact setPaneLabel diagnostics`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-p", "-t", paneID, "@agentteam-name", label)', `${GO_SOURCE} authorized pane @agentteam-name command`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} authorized pane title command`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "set-option", "-p", "-t", paneID, "@agentteam-name", label\)/g)].length, 1, `${GO_SOURCE} should contain exactly one pane set-option command`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "select-pane", "-t", paneID, "-T", label\)/g)].length, 1, `${GO_SOURCE} should contain exactly one pane select-pane title command`)
  assertIncludes(goSource, 'func clearPaneLabel(params map[string]any) workerPaneLabelClearingResult', `${GO_SOURCE} later v0.6.78 clearPaneLabel implementation`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} later v0.6.78 authorized pane label clearing`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} later v0.6.78 authorized pane title clearing`)
  assert.equal(goSource.includes('+ label'), false, `${GO_SOURCE} diagnostics must not concatenate raw label`)
  assert.equal(goSource.includes('label +'), false, `${GO_SOURCE} diagnostics must not concatenate raw label`)

  for (const command of EXISTING_MARK_WINDOW_TMUX_COMMANDS) {
    const option = command.args[4]
    const value = command.args[5]
    assertIncludes(goSource, `runWindowMarkingSetOption(target, "${option}", "${value}")`, `${GO_SOURCE} existing mark ${option}`)
  }
  assert.equal([...goSource.matchAll(/runWindowMarkingSetOption\(target,/g)].length, EXISTING_MARK_WINDOW_TMUX_COMMANDS.length, `${GO_SOURCE} should keep exactly three mark mutations`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-status", "top")', `${GO_SOURCE} existing refresh pane-border-status`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-format", "#{?@agentteam-name,#{@agentteam-name},#{pane_title}}")', `${GO_SOURCE} existing refresh pane-border-format`)
  assert.equal([...goSource.matchAll(/runWindowPaneLabelsSetOption\(target,/g)].length, EXISTING_REFRESH_WINDOW_PANE_LABELS_TMUX_COMMANDS.length, `${GO_SOURCE} should keep exactly two refresh mutations`)

  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => !['split-window', 'select-layout', 'resize-pane', 'new-session', 'new-window'].includes(command))) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add forbidden command ${command}`)
  assertIncludes(goSource, 'splitArgs := []string{"split-window"}', `${GO_SOURCE} later v0.6.80 authorized createTeammatePane split-window`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("select-layout", "-t", target, layout)', `${GO_SOURCE} later v0.6.80 authorized createTeammatePane select-layout`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("resize-pane", "-t", leaderPaneID, "-x", "66%")', `${GO_SOURCE} later v0.6.80 authorized createTeammatePane resize-pane`)
}

function assertArtifactPipelineAndNative(root) {
  const builder = read(root, BUILDER)
  const verifier = read(root, VERIFIER)
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  const provenance = JSON.parse(read(root, `${NATIVE_ROOT}/provenance.json`))
  const checksums = read(root, `${NATIVE_ROOT}/SHA256SUMS`)
  assertIncludes(builder, 'runWorkerLifecycleSetPaneLabelSmoke', BUILDER)
  assertIncludes(builder, 'workerLifecycleSetPaneLabel', BUILDER)
  assertIncludes(verifier, 'workerLifecycleSetPaneLabel', VERIFIER)
  assert.equal(manifest.packageVersion, PACKAGE_VERSION)
  assert.equal(manifest.helperVersion, HELPER_VERSION)
  assert.equal(manifest.protocolVersion, PROTOCOL_VERSION)
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(manifest.artifact.path, `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`)
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
  assert.equal(manifest.smoke.workerLifecycleSetPaneLabel.ok, false)
  assert.deepEqual(manifest.smoke.workerLifecycleSetPaneLabel.acceptedFailureKinds, ['invalid-pane-id'])
  assert.equal(provenance.smoke.workerLifecycleSetPaneLabel.ok, false)
  assert.deepEqual(provenance.smoke.workerLifecycleSetPaneLabel.acceptedFailureKinds, ['invalid-pane-id'])
  assert.equal(manifest.smoke.workerLifecycleClearPaneLabel.ok, false)
  assert.deepEqual(manifest.smoke.workerLifecycleClearPaneLabel.acceptedFailureKinds, ['invalid-pane-id'])
  assert.equal(provenance.smoke.workerLifecycleClearPaneLabel.ok, false)
  assert.deepEqual(provenance.smoke.workerLifecycleClearPaneLabel.acceptedFailureKinds, ['invalid-pane-id'])
  assertNoRawLabelLeak(manifest.smoke)
  assertNoRawLabelLeak(provenance.smoke)
  assertIncludes(checksums, `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`, 'native checksums')
  assertIncludes(checksums, `${NATIVE_ROOT}/manifest.json`, 'native checksums')
  assertIncludes(checksums, `${NATIVE_ROOT}/provenance.json`, 'native checksums')
  assertIncludes(checksums, `${NATIVE_ROOT}/attestation.intoto.jsonl`, 'native checksums')
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
  name: 'Go kernel v0.6.76 Go pane label setting cutover',
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
