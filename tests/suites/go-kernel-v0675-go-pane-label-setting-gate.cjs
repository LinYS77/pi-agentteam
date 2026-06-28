const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  AUTHORIZED_FUTURE_TMUX_COMMANDS,
  CAPABILITY,
  CLEAR_HELPER_NAME,
  CONTRACT_STATUS,
  CURRENT_CLEAR_PANE_LABEL_COMMAND_SURFACE,
  CURRENT_SET_PANE_LABEL_COMMAND_SURFACE,
  EXISTING_GO_MUTATING_TMUX_COMMANDS,
  FACADE_AUTHORITY,
  FORBIDDEN_CURRENT_GO_TMUX_SNIPPETS,
  FORBIDDEN_FUTURE_SCOPE,
  FUTURE_FACADE_RULE,
  FUTURE_INPUT_POLICY,
  FUTURE_OPERATION,
  FUTURE_PUBLIC_BEHAVIOR,
  GO_PANE_LABEL_SETTING_GATE_SCHEMA_VERSION,
  GO_PANE_LABEL_SETTING_GATE_THEME,
  HELPER_NAME,
  HELPER_VERSION,
  NATIVE_ARTIFACT_SNAPSHOT,
  ORCHESTRATOR_NAME,
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  goPaneLabelSettingGate,
} = require('../fixtures/kernel/v0675/goPaneLabelSettingGate.cjs')

const DOC = 'docs/perf/v0.6.75-go-pane-label-setting-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0675/goPaneLabelSettingGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0675-go-pane-label-setting-gate.cjs'
const TMUX_LABELS = 'tmux/labels.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_FUTURE_COMMANDS = [
  'tmux set-option -p -t <paneId> @agentteam-name <label>',
  'tmux select-pane -t <paneId> -T <label>',
]
const EXPECTED_SET_PANE_LABEL_CALLS = [
  "runTmuxNoThrowAsync(['set-option', '-p', '-t', paneId, '@agentteam-name', label], undefined, signal)",
  "runTmuxNoThrowAsync(['select-pane', '-t', paneId, '-T', label], undefined, signal)",
]
const EXPECTED_CLEAR_PANE_LABEL_CALLS = [
  "runTmuxNoThrowAsync(['set-option', '-up', '-t', paneId, '@agentteam-name'], undefined, signal)",
  "runTmuxNoThrowAsync(['select-pane', '-t', paneId, '-T', ''], undefined, signal)",
]
const EXPECTED_EXISTING_GO_MUTATING_COMMANDS = [
  'tmux set-option -w -t <target> automatic-rename off',
  'tmux set-option -w -t <target> allow-rename off',
  'tmux set-option -w -t <target> @agentteam-window 1',
  'tmux set-option -w -t <target> pane-border-status top',
  "tmux set-option -w -t <target> pane-border-format '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'",
]
const REQUIRED_DOC = [
  '# v0.6.75 Go Pane Label Setting Gate',
  'Result: v0.6.75 defines the next narrow mutating tmux Go cutover gate without implementing runtime mutation.',
  'exactly one future candidate: private `tmux/labels.ts setPaneLabel(paneId, label, signal)`',
  "`runTmuxNoThrowAsync(['set-option', '-p', '-t', paneId, '@agentteam-name', label], undefined, signal)`",
  "`runTmuxNoThrowAsync(['select-pane', '-t', paneId, '-T', label], undefined, signal)`",
  '`syncPaneLabelsForTeam(...)` remains TypeScript-owned orchestration',
  '`tmux set-option -p -t <paneId> @agentteam-name <label>`',
  '`tmux select-pane -t <paneId> -T <label>`',
  'pass `<label>` as an argv value, not shell text',
  'must not log or leak the raw label in diagnostics',
  'Future Go should validate the pane id compactly',
  'after the actual cutover, `tmux/labels.ts setPaneLabel` must not retain direct TypeScript `runTmuxNoThrowAsync([\'set-option\', \'-p\'...])` fallback',
  'after the actual cutover, `tmux/labels.ts setPaneLabel` must not retain direct TypeScript `runTmuxNoThrowAsync([\'select-pane\', \'-t\', paneId, \'-T\', label]...)` fallback',
  '`clearPaneLabel(paneId, signal)` remains TypeScript-owned and is not authorized by this candidate',
  '`tmux set-option -up -t <paneId> @agentteam-name`',
  "`tmux select-pane -t <paneId> -T ''`",
  '`markWindowAsAgentTeam(target, signal)` remains v0.6.72 Go-backed',
  '`refreshWindowPaneLabels(target, signal)` remains v0.6.74 Go-backed',
  'No Go source or native artifact rebuild occurs in v0.6.75.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0675/goPaneLabelSettingGate.cjs`',
  '`tests/suites/go-kernel-v0675-go-pane-label-setting-gate.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.75 Go pane label setting gate',
  'docs/perf/v0.6.75-go-pane-label-setting-gate.md',
  'defines the next narrow mutating tmux Go cutover gate without runtime mutation',
  'authorized next runtime candidate is only private `setPaneLabel(paneId, label, signal)`',
  'future Go may use only `tmux set-option -p -t <paneId> @agentteam-name <label>` and `tmux select-pane -t <paneId> -T <label>`',
  'label remains opaque Unicode/user-visible argv data and must not leak raw label diagnostics',
  'at v0.6.75 current `setPaneLabel` and `clearPaneLabel` direct TypeScript calls remained in place, and v0.6.76 later implemented the authorized `setPaneLabel` cutover without migrating `clearPaneLabel`',
  'clearPaneLabel/new-session/new-window/pane creation/layout/wake/kill/state/task/UI/release/package remain forbidden',
  'no Go source/native artifact rebuild',
  '**v0.6.75 Go pane label setting gate**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'setPaneLabelMigrated: true',
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
  'nativeHelperRebuilt: true',
  'goSourceChanged: true',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
}

function sha256(root, rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, ...rel.split('/')))).digest('hex')
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
  assert.deepEqual(JSON.parse(JSON.stringify(goPaneLabelSettingGate)), goPaneLabelSettingGate)
  assert.equal(goPaneLabelSettingGate.schemaVersion, GO_PANE_LABEL_SETTING_GATE_SCHEMA_VERSION)
  assert.equal(goPaneLabelSettingGate.theme, GO_PANE_LABEL_SETTING_GATE_THEME)
  assert.equal(goPaneLabelSettingGate.packageVersion, PACKAGE_VERSION)
  assert.equal(goPaneLabelSettingGate.helperVersion, HELPER_VERSION)
  assert.equal(goPaneLabelSettingGate.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goPaneLabelSettingGate.capability, CAPABILITY)
  assert.deepEqual(goPaneLabelSettingGate.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goPaneLabelSettingGate.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goPaneLabelSettingGate.contractStatus, CONTRACT_STATUS)
  assert.equal(goPaneLabelSettingGate.futureOperation, FUTURE_OPERATION)
  assert.equal(goPaneLabelSettingGate.helperName, HELPER_NAME)
  assert.equal(goPaneLabelSettingGate.orchestratorName, ORCHESTRATOR_NAME)
  assert.equal(goPaneLabelSettingGate.clearHelperName, CLEAR_HELPER_NAME)
  assert.equal(goPaneLabelSettingGate.runtimeFile, RUNTIME_FILE)
  assert.deepEqual(goPaneLabelSettingGate.authorizedFutureMutatingCandidates, [FUTURE_OPERATION])
  assert.deepEqual(goPaneLabelSettingGate.authorizedFutureTmuxCommands, [...AUTHORIZED_FUTURE_TMUX_COMMANDS])
  assert.deepEqual(goPaneLabelSettingGate.currentSetPaneLabelCommandSurface, [...CURRENT_SET_PANE_LABEL_COMMAND_SURFACE])
  assert.deepEqual(goPaneLabelSettingGate.currentClearPaneLabelCommandSurface, [...CURRENT_CLEAR_PANE_LABEL_COMMAND_SURFACE])
  assert.deepEqual(goPaneLabelSettingGate.existingGoMutatingTmuxCommands, [...EXISTING_GO_MUTATING_TMUX_COMMANDS])
  assert.deepEqual(goPaneLabelSettingGate.forbiddenCurrentGoTmuxSnippets, [...FORBIDDEN_CURRENT_GO_TMUX_SNIPPETS])
  assert.deepEqual(goPaneLabelSettingGate.forbiddenFutureScope, [...FORBIDDEN_FUTURE_SCOPE])
  assert.deepEqual(goPaneLabelSettingGate.facadeAuthority, [...FACADE_AUTHORITY])
  assert.deepEqual(goPaneLabelSettingGate.futureFacadeRule, FUTURE_FACADE_RULE)
  assert.deepEqual(goPaneLabelSettingGate.futurePublicBehavior, FUTURE_PUBLIC_BEHAVIOR)
  assert.deepEqual(goPaneLabelSettingGate.futureInputPolicy, FUTURE_INPUT_POLICY)
  assert.deepEqual(goPaneLabelSettingGate.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(goPaneLabelSettingGate.nativeArtifactSnapshot, NATIVE_ARTIFACT_SNAPSHOT)

  assert.equal(goPaneLabelSettingGate.gateOnly, true)
  assert.equal(goPaneLabelSettingGate.noRuntimeMigrationInThisSlice, true)
  assert.equal(goPaneLabelSettingGate.futureCandidateMutatesTmux, true)
  assert.equal(goPaneLabelSettingGate.futureCandidateDestructive, false)
  assert.equal(goPaneLabelSettingGate.setPaneLabelMigrated, false)
  assert.equal(goPaneLabelSettingGate.clearPaneLabelMigrated, false)
  assert.equal(goPaneLabelSettingGate.syncPaneLabelsMigrated, false)
  assert.equal(goPaneLabelSettingGate.markWindowAsAgentTeamMigrated, true)
  assert.equal(goPaneLabelSettingGate.refreshWindowPaneLabelsMigrated, true)
  assert.equal(goPaneLabelSettingGate.newSessionMigrated, false)
  assert.equal(goPaneLabelSettingGate.newWindowMigrated, false)
  assert.equal(goPaneLabelSettingGate.createTeammatePaneMigrated, false)
  assert.equal(goPaneLabelSettingGate.wakePaneMigrated, false)
  assert.equal(goPaneLabelSettingGate.killPaneMigrated, false)
  assert.equal(goPaneLabelSettingGate.stateRepositoryMigrated, false)
  assert.equal(goPaneLabelSettingGate.taskReportPlanRunMigrated, false)
  assert.equal(goPaneLabelSettingGate.teamPanelViewModelMigrated, false)
  assert.equal(goPaneLabelSettingGate.releasePackageVerificationMigrated, false)
  assert.equal(goPaneLabelSettingGate.nativeArtifactRenamed, false)
  assert.equal(goPaneLabelSettingGate.nativeHelperRebuilt, false)
  assert.equal(goPaneLabelSettingGate.goSourceChanged, false)
  assert.equal(goPaneLabelSettingGate.packageVersionChanged, false)
  assert.equal(goPaneLabelSettingGate.packageReleaseApproved, false)
  assert.equal(goPaneLabelSettingGate.npmVersionChanged, false)
  assert.equal(goPaneLabelSettingGate.npmPublished, false)
  assert.equal(goPaneLabelSettingGate.tagReleaseCreated, false)

  assert.deepEqual(AUTHORIZED_FUTURE_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_FUTURE_COMMANDS)
  assert.deepEqual(AUTHORIZED_FUTURE_TMUX_COMMANDS.map(command => command.args), [
    ['set-option', '-p', '-t', '<paneId>', '@agentteam-name', '<label>'],
    ['select-pane', '-t', '<paneId>', '-T', '<label>'],
  ])
  assert.deepEqual(CURRENT_SET_PANE_LABEL_COMMAND_SURFACE.map(command => command.runTmuxNoThrowAsyncCall), EXPECTED_SET_PANE_LABEL_CALLS)
  assert.deepEqual(CURRENT_CLEAR_PANE_LABEL_COMMAND_SURFACE.map(command => command.runTmuxNoThrowAsyncCall), EXPECTED_CLEAR_PANE_LABEL_CALLS)
  assert.deepEqual(EXISTING_GO_MUTATING_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_EXISTING_GO_MUTATING_COMMANDS)
  for (const command of AUTHORIZED_FUTURE_TMUX_COMMANDS) {
    assert.equal(command.scope, 'pane')
    assert.equal(command.destructive, false)
    assert.equal(command.mutatesTmux, true)
    assert.equal(command.labelHandling, 'opaque unicode argv; never shell text')
  }
  assert.equal(AUTHORIZED_FUTURE_TMUX_COMMANDS.some(command => command.args.includes('-up')), false)
  assert.equal(AUTHORIZED_FUTURE_TMUX_COMMANDS.some(command => command.value === ''), false)
  assert.equal(FORBIDDEN_FUTURE_SCOPE.includes('clearPaneLabel(paneId, signal)'), true)
  assert.equal(FUTURE_FACADE_RULE.hiddenTypeScriptFallbackAllowedAfterCutover, false)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.noThrowVoidHelper, true)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.rawLabelLeakageAllowed, false)
  assert.equal(FUTURE_INPUT_POLICY.labelMayContainUnicode, true)
  assert.equal(FUTURE_INPUT_POLICY.labelMayContainEmoji, true)
  assert.equal(FUTURE_INPUT_POLICY.labelShellInterpolationAllowed, false)
  assert.equal(FUTURE_INPUT_POLICY.rawLabelDiagnosticsAllowed, false)
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

function assertCurrentTypescriptState(root) {
  const labelsSource = read(root, TMUX_LABELS)
  const kernelSource = read(root, KERNEL)
  const setPaneBody = functionBody(labelsSource, HELPER_NAME)
  const clearPaneBody = functionBody(labelsSource, CLEAR_HELPER_NAME)
  const syncBody = functionBody(labelsSource, ORCHESTRATOR_NAME)
  const refreshBody = functionBody(labelsSource, 'refreshWindowPaneLabels')
  const markBody = functionBody(labelsSource, 'markWindowAsAgentTeam')

  // The v0.6.75 fixture/doc remain historical gate-only evidence; current source may include the later v0.6.76 authorized cutover.
  for (const call of EXPECTED_SET_PANE_LABEL_CALLS) assert.equal(setPaneBody.includes(call), false, `${TMUX_LABELS} ${HELPER_NAME} direct TS fallback removed after authorized cutover`)
  assertIncludes(setPaneBody, 'createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)', `${TMUX_LABELS} ${HELPER_NAME} uses v0.6.76 Go adapter delegation`)
  assert.equal([...setPaneBody.matchAll(/runTmuxNoThrowAsync\(/g)].length, 0, `${TMUX_LABELS} ${HELPER_NAME} should not keep same-behavior direct TS no-throw calls after v0.6.76`)

  for (const call of EXPECTED_CLEAR_PANE_LABEL_CALLS) assert.equal(clearPaneBody.includes(call), false, `${TMUX_LABELS} ${CLEAR_HELPER_NAME} direct TS fallback removed after later authorized v0.6.78 cutover`)
  assertIncludes(clearPaneBody, 'createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)', `${TMUX_LABELS} ${CLEAR_HELPER_NAME} uses later v0.6.78 Go adapter delegation`)
  assert.equal([...clearPaneBody.matchAll(/runTmuxNoThrowAsync\(/g)].length, 0, `${TMUX_LABELS} ${CLEAR_HELPER_NAME} should not keep same-behavior direct TS no-throw calls after v0.6.78`)

  assertIncludes(syncBody, 'await setPaneLabel(member.paneId', `${TMUX_LABELS} ${ORCHESTRATOR_NAME}`)
  assertIncludes(syncBody, 'formatLeaderPaneLabel(team)', `${TMUX_LABELS} ${ORCHESTRATOR_NAME} leader labels`)
  assertIncludes(syncBody, 'formatMemberPaneLabel(member)', `${TMUX_LABELS} ${ORCHESTRATOR_NAME} member labels`)
  assert.equal(syncBody.includes('setPaneLabelAsync'), false, `${TMUX_LABELS} ${ORCHESTRATOR_NAME} remains TS-owned orchestration and should only call the private helper`)

  assertIncludes(refreshBody, 'createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)', `${TMUX_LABELS} refreshWindowPaneLabels v0.6.74 delegation preserved`)
  assertIncludes(markBody, 'createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)', `${TMUX_LABELS} markWindowAsAgentTeam v0.6.72 delegation preserved`)
  assertIncludes(kernelSource, 'setPaneLabelAsync(paneId: string, label: string, signal?: AbortSignal): Promise<AgentTeamKernelPaneLabelSetting>', `${KERNEL} v0.6.76 setPaneLabelAsync adapter`)
  assertIncludes(kernelSource, "operation: 'setPaneLabel'", `${KERNEL} v0.6.76 workerLifecycle setPaneLabel operation`)
  assertIncludes(kernelSource, 'AgentTeamKernelPaneLabelSetting', `${KERNEL} v0.6.76 pane label result type`)
}

function assertGoRuntimeAndCommandSurface(root) {
  const goSource = read(root, GO_SOURCE)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should keep current operation ${operation}`)
  assert.match(goSource, /case "setPaneLabel"/, `${GO_SOURCE} should include later v0.6.76 setPaneLabel`)
  assert.match(goSource, /case "clearPaneLabel"/, `${GO_SOURCE} should include later v0.6.78 clearPaneLabel`)

  assertIncludes(goSource, 'func markWindowAsAgentTeam(params map[string]any) workerWindowMarkingResult', `${GO_SOURCE} markWindowAsAgentTeam preserved`)
  assertIncludes(goSource, 'runWindowMarkingSetOption(target, "automatic-rename", "off")', `${GO_SOURCE} automatic-rename mark command`)
  assertIncludes(goSource, 'runWindowMarkingSetOption(target, "allow-rename", "off")', `${GO_SOURCE} allow-rename mark command`)
  assertIncludes(goSource, 'runWindowMarkingSetOption(target, "@agentteam-window", "1")', `${GO_SOURCE} @agentteam-window mark command`)
  assert.equal([...goSource.matchAll(/runWindowMarkingSetOption\(target,/g)].length, 3, `${GO_SOURCE} should keep exactly three window marking mutations`)

  assertIncludes(goSource, 'func refreshWindowPaneLabels(params map[string]any) workerWindowPaneLabelsRefreshResult', `${GO_SOURCE} refreshWindowPaneLabels preserved`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-status", "top")', `${GO_SOURCE} pane-border-status refresh command`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-format", "#{?@agentteam-name,#{@agentteam-name},#{pane_title}}")', `${GO_SOURCE} pane-border-format refresh command`)
  assert.equal([...goSource.matchAll(/runWindowPaneLabelsSetOption\(target,/g)].length, 2, `${GO_SOURCE} should keep exactly two pane-border refresh mutations`)

  assertIncludes(goSource, 'func setPaneLabel(params map[string]any) workerPaneLabelSettingResult', `${GO_SOURCE} later v0.6.76 setPaneLabel implementation`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-p", "-t", paneID, "@agentteam-name", label)', `${GO_SOURCE} later v0.6.76 pane label set-option`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} later v0.6.76 pane title setting`)
  assertIncludes(goSource, 'func clearPaneLabel(params map[string]any) workerPaneLabelClearingResult', `${GO_SOURCE} later v0.6.78 clearPaneLabel implementation`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} later v0.6.78 pane label clearing`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} later v0.6.78 pane title clearing`)
}

function assertNativeArtifactUnchanged(root) {
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  const provenance = JSON.parse(read(root, `${NATIVE_ROOT}/provenance.json`))
  const checksums = read(root, `${NATIVE_ROOT}/SHA256SUMS`)
  assert.equal(exists(root, NATIVE_ARTIFACT_SNAPSHOT.helperPath), true, 'existing native helper should remain present')
  assert.equal(manifest.artifact.path, NATIVE_ARTIFACT_SNAPSHOT.helperPath)
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
  assert.equal(provenance.source.path, 'kernel/go/agentteam-kernel')
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(manifest.smoke.workerLifecycleSetPaneLabel.ok, false, 'v0.6.76 native manifest includes setPaneLabel smoke')
  assert.deepEqual(manifest.smoke.workerLifecycleSetPaneLabel.acceptedFailureKinds, ['invalid-pane-id'])
  assert.equal(provenance.smoke.workerLifecycleSetPaneLabel.ok, false, 'v0.6.76 native provenance includes setPaneLabel smoke')
  assert.equal(manifest.smoke.workerLifecycleClearPaneLabel.ok, false, 'v0.6.78 native manifest includes clearPaneLabel smoke')
  assert.deepEqual(manifest.smoke.workerLifecycleClearPaneLabel.acceptedFailureKinds, ['invalid-pane-id'])
  assert.equal(provenance.smoke.workerLifecycleClearPaneLabel.ok, false, 'v0.6.78 native provenance includes clearPaneLabel smoke')
  assertIncludes(checksums, `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`, `${NATIVE_ROOT}/SHA256SUMS`)
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
  name: 'Go kernel v0.6.75 Go pane label setting gate',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertCurrentTypescriptState(root)
    assertGoRuntimeAndCommandSurface(root)
    assertNativeArtifactUnchanged(root)
    assertPackageAndReleaseGuards(root)
  },
}
