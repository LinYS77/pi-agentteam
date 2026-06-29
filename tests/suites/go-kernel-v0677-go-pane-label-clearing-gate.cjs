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
  CURRENT_SET_PANE_LABEL_ADAPTER_SURFACE,
  EXISTING_GO_MUTATING_TMUX_COMMANDS,
  FACADE_AUTHORITY,
  FORBIDDEN_CURRENT_GO_TMUX_SNIPPETS,
  FORBIDDEN_FUTURE_SCOPE,
  FUTURE_FACADE_RULE,
  FUTURE_INPUT_POLICY,
  FUTURE_OPERATION,
  FUTURE_PUBLIC_BEHAVIOR,
  GO_PANE_LABEL_CLEARING_GATE_SCHEMA_VERSION,
  GO_PANE_LABEL_CLEARING_GATE_THEME,
  HELPER_VERSION,
  NATIVE_ARTIFACT_SNAPSHOT,
  ORCHESTRATOR_NAME,
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  SET_HELPER_NAME,
  SET_ORCHESTRATOR_NAME,
  goPaneLabelClearingGate,
} = require('../fixtures/kernel/v0677/goPaneLabelClearingGate.cjs')

const DOC = 'docs/perf/v0.6.77-go-pane-label-clearing-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0677/goPaneLabelClearingGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0677-go-pane-label-clearing-gate.cjs'
const TMUX_LABELS = 'tmux/labels.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_FUTURE_COMMANDS = [
  'tmux set-option -up -t <paneId> @agentteam-name',
  "tmux select-pane -t <paneId> -T ''",
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
  'tmux set-option -p -t <paneId> @agentteam-name <label>',
  'tmux select-pane -t <paneId> -T <label>',
]
const REQUIRED_DOC = [
  '# v0.6.77 Go Pane Label Clearing Gate',
  'Result: v0.6.77 defines the next narrow mutating tmux Go cutover gate without implementing runtime mutation.',
  'exactly one future candidate: private `tmux/labels.ts clearPaneLabel(paneId, signal)`',
  "`runTmuxNoThrowAsync(['set-option', '-up', '-t', paneId, '@agentteam-name'], undefined, signal)`",
  "`runTmuxNoThrowAsync(['select-pane', '-t', paneId, '-T', ''], undefined, signal)`",
  '`clearPaneLabelsForTeam(...)` remains TypeScript-owned orchestration',
  '`tmux set-option -up -t <paneId> @agentteam-name`',
  "`tmux select-pane -t <paneId> -T ''`",
  'Future Go should validate the pane id compactly using the same `%123`-style policy used by v0.6.76 `setPaneLabel`.',
  'after the actual cutover, `tmux/labels.ts clearPaneLabel` must not retain direct TypeScript `runTmuxNoThrowAsync([\'set-option\', \'-up\'...])` fallback',
  'after the actual cutover, `tmux/labels.ts clearPaneLabel` must not retain direct TypeScript `runTmuxNoThrowAsync([\'select-pane\', \'-t\', paneId, \'-T\', \'\']...)` fallback',
  '`setPaneLabel(paneId, label, signal)` remains v0.6.76 Go-backed',
  '`markWindowAsAgentTeam(target, signal)` remains v0.6.72 Go-backed',
  '`refreshWindowPaneLabels(target, signal)` remains v0.6.74 Go-backed',
  'No Go source or native artifact rebuild occurs in v0.6.77.',
  'Postscript: v0.6.78 later implemented the authorized `clearPaneLabel(paneId, signal)` cutover using exactly the two pane-level commands authorized by this gate.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0677/goPaneLabelClearingGate.cjs`',
  '`tests/suites/go-kernel-v0677-go-pane-label-clearing-gate.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.77 Go pane label clearing gate',
  'docs/perf/v0.6.77-go-pane-label-clearing-gate.md',
  'defines the next narrow mutating tmux Go cutover gate without runtime mutation',
  'authorized next runtime candidate is only private `clearPaneLabel(paneId, signal)`',
  'future Go may use only `tmux set-option -up -t <paneId> @agentteam-name` and `tmux select-pane -t <paneId> -T \'\'`',
  'current `clearPaneLabel` stays TypeScript-owned with the two direct no-throw calls',
  '`clearPaneLabelsForTeam(...)` remains TypeScript-owned orchestration',
  'v0.6.78 Go pane label clearing cutover',
  'no Go source/native artifact rebuild',
  '**v0.6.77 Go pane label clearing gate**',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goPaneLabelClearingGate)), goPaneLabelClearingGate)
  assert.equal(goPaneLabelClearingGate.schemaVersion, GO_PANE_LABEL_CLEARING_GATE_SCHEMA_VERSION)
  assert.equal(goPaneLabelClearingGate.theme, GO_PANE_LABEL_CLEARING_GATE_THEME)
  assert.equal(goPaneLabelClearingGate.packageVersion, PACKAGE_VERSION)
  assert.equal(goPaneLabelClearingGate.helperVersion, HELPER_VERSION)
  assert.equal(goPaneLabelClearingGate.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goPaneLabelClearingGate.capability, CAPABILITY)
  assert.deepEqual(goPaneLabelClearingGate.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goPaneLabelClearingGate.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goPaneLabelClearingGate.contractStatus, CONTRACT_STATUS)
  assert.equal(goPaneLabelClearingGate.futureOperation, FUTURE_OPERATION)
  assert.equal(goPaneLabelClearingGate.setHelperName, SET_HELPER_NAME)
  assert.equal(goPaneLabelClearingGate.clearHelperName, CLEAR_HELPER_NAME)
  assert.equal(goPaneLabelClearingGate.orchestratorName, ORCHESTRATOR_NAME)
  assert.equal(goPaneLabelClearingGate.setOrchestratorName, SET_ORCHESTRATOR_NAME)
  assert.equal(goPaneLabelClearingGate.runtimeFile, RUNTIME_FILE)
  assert.deepEqual(goPaneLabelClearingGate.authorizedFutureMutatingCandidates, [FUTURE_OPERATION])
  assert.deepEqual(goPaneLabelClearingGate.authorizedFutureTmuxCommands, [...AUTHORIZED_FUTURE_TMUX_COMMANDS])
  assert.deepEqual(goPaneLabelClearingGate.currentClearPaneLabelCommandSurface, [...CURRENT_CLEAR_PANE_LABEL_COMMAND_SURFACE])
  assert.deepEqual(goPaneLabelClearingGate.currentSetPaneLabelAdapterSurface, CURRENT_SET_PANE_LABEL_ADAPTER_SURFACE)
  assert.deepEqual(goPaneLabelClearingGate.existingGoMutatingTmuxCommands, [...EXISTING_GO_MUTATING_TMUX_COMMANDS])
  assert.deepEqual(goPaneLabelClearingGate.forbiddenCurrentGoTmuxSnippets, [...FORBIDDEN_CURRENT_GO_TMUX_SNIPPETS])
  assert.deepEqual(goPaneLabelClearingGate.forbiddenFutureScope, [...FORBIDDEN_FUTURE_SCOPE])
  assert.deepEqual(goPaneLabelClearingGate.facadeAuthority, [...FACADE_AUTHORITY])
  assert.deepEqual(goPaneLabelClearingGate.futureFacadeRule, FUTURE_FACADE_RULE)
  assert.deepEqual(goPaneLabelClearingGate.futurePublicBehavior, FUTURE_PUBLIC_BEHAVIOR)
  assert.deepEqual(goPaneLabelClearingGate.futureInputPolicy, FUTURE_INPUT_POLICY)
  assert.deepEqual(goPaneLabelClearingGate.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(goPaneLabelClearingGate.nativeArtifactSnapshot, NATIVE_ARTIFACT_SNAPSHOT)

  assert.equal(goPaneLabelClearingGate.gateOnly, true)
  assert.equal(goPaneLabelClearingGate.noRuntimeMigrationInThisSlice, true)
  assert.equal(goPaneLabelClearingGate.futureCandidateMutatesTmux, true)
  assert.equal(goPaneLabelClearingGate.futureCandidateDestructive, false)
  assert.equal(goPaneLabelClearingGate.setPaneLabelMigrated, true)
  assert.equal(goPaneLabelClearingGate.clearPaneLabelMigrated, false)
  assert.equal(goPaneLabelClearingGate.clearPaneLabelsForTeamMigrated, false)
  assert.equal(goPaneLabelClearingGate.syncPaneLabelsMigrated, false)
  assert.equal(goPaneLabelClearingGate.markWindowAsAgentTeamMigrated, true)
  assert.equal(goPaneLabelClearingGate.refreshWindowPaneLabelsMigrated, true)
  assert.equal(goPaneLabelClearingGate.newSessionMigrated, false)
  assert.equal(goPaneLabelClearingGate.newWindowMigrated, false)
  assert.equal(goPaneLabelClearingGate.createTeammatePaneMigrated, false)
  assert.equal(goPaneLabelClearingGate.wakePaneMigrated, false)
  assert.equal(goPaneLabelClearingGate.killPaneMigrated, false)
  assert.equal(goPaneLabelClearingGate.stateRepositoryMigrated, false)
  assert.equal(goPaneLabelClearingGate.taskReportPlanRunMigrated, false)
  assert.equal(goPaneLabelClearingGate.teamPanelViewModelMigrated, false)
  assert.equal(goPaneLabelClearingGate.releasePackageVerificationMigrated, false)
  assert.equal(goPaneLabelClearingGate.nativeArtifactRenamed, false)
  assert.equal(goPaneLabelClearingGate.nativeHelperRebuilt, false)
  assert.equal(goPaneLabelClearingGate.goSourceChanged, false)
  assert.equal(goPaneLabelClearingGate.packageVersionChanged, false)
  assert.equal(goPaneLabelClearingGate.packageReleaseApproved, false)
  assert.equal(goPaneLabelClearingGate.npmVersionChanged, false)
  assert.equal(goPaneLabelClearingGate.npmPublished, false)
  assert.equal(goPaneLabelClearingGate.tagReleaseCreated, false)

  assert.deepEqual(AUTHORIZED_FUTURE_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_FUTURE_COMMANDS)
  assert.deepEqual(AUTHORIZED_FUTURE_TMUX_COMMANDS.map(command => command.args), [
    ['set-option', '-up', '-t', '<paneId>', '@agentteam-name'],
    ['select-pane', '-t', '<paneId>', '-T', ''],
  ])
  assert.deepEqual(CURRENT_CLEAR_PANE_LABEL_COMMAND_SURFACE.map(command => command.runTmuxNoThrowAsyncCall), EXPECTED_CLEAR_PANE_LABEL_CALLS)
  assert.deepEqual(EXISTING_GO_MUTATING_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_EXISTING_GO_MUTATING_COMMANDS)
  for (const command of AUTHORIZED_FUTURE_TMUX_COMMANDS) {
    assert.equal(command.scope.startsWith('pane'), true)
    assert.equal(command.destructive, false)
    assert.equal(command.mutatesTmux, true)
  }
  assert.equal(AUTHORIZED_FUTURE_TMUX_COMMANDS.some(command => command.rendered.includes('<label>')), false)
  assert.equal(AUTHORIZED_FUTURE_TMUX_COMMANDS.some(command => command.command === 'new-session'), false)
  assert.equal(AUTHORIZED_FUTURE_TMUX_COMMANDS.some(command => command.command === 'new-window'), false)
  assert.equal(FORBIDDEN_FUTURE_SCOPE.includes('clearPaneLabelsForTeam(...) orchestration migration'), true)
  assert.equal(FUTURE_FACADE_RULE.hiddenTypeScriptFallbackAllowedAfterCutover, false)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.noThrowVoidHelper, true)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.rawStdoutStderrLeakageAllowed, false)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.rawHelperOutputLeakageAllowed, false)
  assert.equal(FUTURE_INPUT_POLICY.paneIdValidation.includes('%123'), true)
  assert.equal(FUTURE_INPUT_POLICY.shellInterpolationAllowed, false)
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
  const setPaneBody = functionBody(labelsSource, SET_HELPER_NAME)
  const clearPaneBody = functionBody(labelsSource, CLEAR_HELPER_NAME)
  const clearAllBody = functionBody(labelsSource, ORCHESTRATOR_NAME)
  const syncBody = functionBody(labelsSource, SET_ORCHESTRATOR_NAME)
  const refreshBody = functionBody(labelsSource, 'refreshWindowPaneLabels')
  const markBody = functionBody(labelsSource, 'markWindowAsAgentTeam')

  assertIncludes(setPaneBody, CURRENT_SET_PANE_LABEL_ADAPTER_SURFACE.adapterDelegation, `${TMUX_LABELS} ${SET_HELPER_NAME}`)
  assert.equal(setPaneBody.includes("runTmuxNoThrowAsync(['set-option', '-p'"), false, `${TMUX_LABELS} ${SET_HELPER_NAME} must not regain direct set-option fallback`)
  assert.equal(setPaneBody.includes("runTmuxNoThrowAsync(['select-pane', '-t', paneId, '-T', label]"), false, `${TMUX_LABELS} ${SET_HELPER_NAME} must not regain direct select-pane fallback`)
  assert.equal([...setPaneBody.matchAll(/runTmuxNoThrowAsync\(/g)].length, 0, `${TMUX_LABELS} ${SET_HELPER_NAME} should not keep same-behavior direct TS no-throw calls`)

  // The v0.6.77 fixture/doc remain historical gate-only evidence; current source may include the later v0.6.78 authorized cutover.
  for (const call of EXPECTED_CLEAR_PANE_LABEL_CALLS) assert.equal(clearPaneBody.includes(call), false, `${TMUX_LABELS} ${CLEAR_HELPER_NAME} direct TS fallback removed after authorized cutover`)
  assertIncludes(clearPaneBody, 'createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)', `${TMUX_LABELS} ${CLEAR_HELPER_NAME} uses v0.6.78 Go adapter delegation`)
  assert.equal([...clearPaneBody.matchAll(/runTmuxNoThrowAsync\(/g)].length, 0, `${TMUX_LABELS} ${CLEAR_HELPER_NAME} should not keep same-behavior direct TS no-throw calls after v0.6.78`)

  assertIncludes(clearAllBody, 'await clearPaneLabel(member.paneId, signal)', `${TMUX_LABELS} ${ORCHESTRATOR_NAME}`)
  assertIncludes(clearAllBody, 'const target = targetForPaneId(member.paneId) ?? member.windowTarget', `${TMUX_LABELS} ${ORCHESTRATOR_NAME}`)
  assertIncludes(clearAllBody, 'targets.add(member.windowTarget)', `${TMUX_LABELS} ${ORCHESTRATOR_NAME}`)
  assertIncludes(clearAllBody, 'await refreshWindowPaneLabels(target, signal)', `${TMUX_LABELS} ${ORCHESTRATOR_NAME}`)
  assert.equal(clearAllBody.includes('clearPaneLabelAsync'), false, `${TMUX_LABELS} ${ORCHESTRATOR_NAME} must not bypass private helper`)
  assert.equal(clearAllBody.includes('createAgentTeamKernelAdapter'), false, `${TMUX_LABELS} ${ORCHESTRATOR_NAME} remains TS-owned orchestration`)
  assert.equal(clearAllBody.includes('workerLifecycle'), false, `${TMUX_LABELS} ${ORCHESTRATOR_NAME} must not mention workerLifecycle`)

  assertIncludes(syncBody, 'await setPaneLabel(member.paneId', `${TMUX_LABELS} ${SET_ORCHESTRATOR_NAME}`)
  assertIncludes(syncBody, 'await refreshWindowPaneLabels(target, signal)', `${TMUX_LABELS} ${SET_ORCHESTRATOR_NAME}`)
  assert.equal(syncBody.includes('setPaneLabelAsync'), false, `${TMUX_LABELS} ${SET_ORCHESTRATOR_NAME} remains TS-owned orchestration and should call private setPaneLabel`)

  assertIncludes(refreshBody, 'createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)', `${TMUX_LABELS} refreshWindowPaneLabels v0.6.74 delegation preserved`)
  assertIncludes(markBody, 'createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)', `${TMUX_LABELS} markWindowAsAgentTeam v0.6.72 delegation preserved`)
  assertIncludes(kernelSource, 'setPaneLabelAsync(paneId: string, label: string, signal?: AbortSignal): Promise<AgentTeamKernelPaneLabelSetting>', `${KERNEL} v0.6.76 setPaneLabelAsync adapter`)
  assertIncludes(kernelSource, "operation: 'setPaneLabel'", `${KERNEL} v0.6.76 workerLifecycle setPaneLabel operation`)
  assertIncludes(kernelSource, 'clearPaneLabelAsync(paneId: string, signal?: AbortSignal): Promise<AgentTeamKernelPaneLabelClearing>', `${KERNEL} later v0.6.78 clearPaneLabelAsync adapter`)
  assertIncludes(kernelSource, "operation: 'clearPaneLabel'", `${KERNEL} later v0.6.78 workerLifecycle clearPaneLabel operation`)
}

function assertGoRuntimeAndCommandSurface(root) {
  const goSource = read(root, GO_SOURCE)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should keep current operation ${operation}`)
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

  assertIncludes(goSource, 'func setPaneLabel(params map[string]any) workerPaneLabelSettingResult', `${GO_SOURCE} v0.6.76 setPaneLabel implementation preserved`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-p", "-t", paneID, "@agentteam-name", label)', `${GO_SOURCE} v0.6.76 pane label set-option`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} v0.6.76 pane title setting`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "set-option", "-p", "-t", paneID, "@agentteam-name", label\)/g)].length, 1, `${GO_SOURCE} should keep exactly one setPaneLabel set-option command`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "select-pane", "-t", paneID, "-T", label\)/g)].length, 1, `${GO_SOURCE} should keep exactly one setPaneLabel select-pane command`)

  assertIncludes(goSource, 'func clearPaneLabel(params map[string]any) workerPaneLabelClearingResult', `${GO_SOURCE} later v0.6.78 clearPaneLabel implementation`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} later v0.6.78 pane label unset`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} later v0.6.78 pane title clearing`)

  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "new-session", "-d", "-s", sessionName, "-n", windowName)', `${GO_SOURCE} later v0.6.82 authorized detached new-session`)
  for (const forbiddenCommand of ['new-window', 'send-keys', 'kill-pane', 'kill-window', 'kill-session', 'respawn-pane', 'set-buffer', 'paste-buffer']) {
    assert.equal(goSource.includes(`"${forbiddenCommand}"`), false, `${GO_SOURCE} must not add forbidden command ${forbiddenCommand}`)
  }
  assertIncludes(goSource, 'splitArgs := []string{"split-window"}', `${GO_SOURCE} later v0.6.80 authorized createTeammatePane split-window`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("select-layout", "-t", target, layout)', `${GO_SOURCE} later v0.6.80 authorized createTeammatePane select-layout`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("resize-pane", "-t", leaderPaneID, "-x", "66%")', `${GO_SOURCE} later v0.6.80 authorized createTeammatePane resize-pane`)
}

function assertNativeArtifactUnchanged(root) {
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  const provenance = JSON.parse(read(root, `${NATIVE_ROOT}/provenance.json`))
  assert.equal(exists(root, NATIVE_ARTIFACT_SNAPSHOT.helperPath), true, 'existing native helper should remain present')
  assert.equal(manifest.artifact.path, NATIVE_ARTIFACT_SNAPSHOT.helperPath)
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(manifest.smoke.workerLifecycleSetPaneLabel.ok, false, 'v0.6.76 native manifest includes setPaneLabel smoke')
  assert.deepEqual(manifest.smoke.workerLifecycleSetPaneLabel.acceptedFailureKinds, ['invalid-pane-id'])
  assert.equal(provenance.smoke.workerLifecycleSetPaneLabel.ok, false, 'v0.6.76 native provenance includes setPaneLabel smoke')
  assert.equal(manifest.smoke.workerLifecycleClearPaneLabel.ok, false, 'v0.6.78 native manifest includes clearPaneLabel smoke after authorized cutover')
  assert.deepEqual(manifest.smoke.workerLifecycleClearPaneLabel.acceptedFailureKinds, ['invalid-pane-id'])
  assert.equal(provenance.smoke.workerLifecycleClearPaneLabel.ok, false, 'v0.6.78 native provenance includes clearPaneLabel smoke after authorized cutover')
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
  name: 'Go kernel v0.6.77 Go pane label clearing gate',
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
