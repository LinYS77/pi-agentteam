const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  AUTHORIZED_FUTURE_TMUX_COMMANDS,
  CAPABILITY,
  CONTRACT_STATUS,
  CURRENT_GO_READ_ONLY_TMUX_COMMANDS,
  CURRENT_TYPESCRIPT_COMMAND_SURFACE,
  CURRENT_WINDOW_EXISTENCE_GUARD,
  FACADE_AUTHORITY,
  FACADE_NAME,
  FORBIDDEN_CURRENT_GO_TMUX_COMMANDS,
  FUTURE_ADAPTER_DELEGATION,
  FUTURE_FACADE_RULE,
  FUTURE_OPERATION,
  FUTURE_PUBLIC_BEHAVIOR,
  GO_MUTATING_WINDOW_MARKING_GATE_SCHEMA_VERSION,
  GO_MUTATING_WINDOW_MARKING_GATE_THEME,
  HELPER_CONNECTION_MODEL,
  HELPER_VERSION,
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  STILL_FORBIDDEN_MUTATING_SCOPE,
  WINDOW_EXISTENCE_AUTHORITY,
  goMutatingWindowMarkingGate,
} = require('../fixtures/kernel/v0671/goMutatingWindowMarkingGate.cjs')

const DOC = 'docs/perf/v0.6.71-go-mutating-window-marking-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0671/goMutatingWindowMarkingGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0671-go-mutating-window-marking-gate.cjs'
const TMUX_LABELS = 'tmux/labels.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_FUTURE_COMMANDS = [
  'tmux set-option -w -t <target> automatic-rename off',
  'tmux set-option -w -t <target> allow-rename off',
  'tmux set-option -w -t <target> @agentteam-window 1',
]
const REQUIRED_GO_READ_ONLY_COMMAND_SNIPPETS = [
  'exec.CommandContext(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat)',
  'exec.CommandContext(ctx, "tmux", "-V")',
  'exec.CommandContext(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat)',
  'exec.CommandContext(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat)',
  'exec.CommandContext(ctx, "tmux", "list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat)',
  'exec.CommandContext(ctx, "tmux", "list-windows", "-t", sessionName, "-F", workerLifecycleAgentTeamWindowFormat)',
  'exec.CommandContext(ctx, "tmux", "list-windows", "-t", sessionName, "-F", workerLifecycleWindowNameFormat)',
  'exec.CommandContext(ctx, "tmux", "has-session", "-t", sessionName)',
]
const REQUIRED_DOC = [
  '# v0.6.71 Go Mutating Window Marking Gate',
  'Result: v0.6.71 defines the first explicit mutating tmux Go cutover gate without implementing runtime mutation.',
  'Current state: Go source still has no mutating tmux commands.',
  'Authorized next runtime candidate: `markWindowAsAgentTeam(target, signal)` only.',
  '`tmux set-option -w -t <target> automatic-rename off`',
  '`tmux set-option -w -t <target> allow-rename off`',
  '`tmux set-option -w -t <target> @agentteam-window 1`',
  'No other Go mutating tmux commands are authorized by this gate.',
  'After the actual future cutover, `tmux/labels.ts markWindowAsAgentTeam` must not retain direct TypeScript `runTmuxNoThrowAsync([\'set-option\', \'-w\'...])` fallback for the same behavior.',
  'The public facade remains no-throw/void.',
  'helper failure, invalid target, and abort should produce compact diagnostics internally and must not leak raw stdout/stderr/helper output through the public facade.',
  'Window existence authority remains explicit: keep the TypeScript `windowExists(target, signal)` guard or move it only inside the same future slice if documented and tested.',
  'Mutating commands remain per-call helper for now; long-lived helper is still deferred.',
  'TypeScript/pi facade remains the pi extension compliance boundary.',
  'Go may own runtime mutation only through explicit task-scoped contracts.',
  '`new-session`, `new-window`, pane creation/split/layout/resize, wake/send-keys, kill/clear labels, state/task/UI/release/package remain forbidden for this gate.',
  'No Go source, native artifact, package version, release, or runtime facade change is made in v0.6.71.',
  '`tests/fixtures/kernel/v0671/goMutatingWindowMarkingGate.cjs`',
  '`tests/suites/go-kernel-v0671-go-mutating-window-marking-gate.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.71 Go mutating window marking gate',
  'docs/perf/v0.6.71-go-mutating-window-marking-gate.md',
  'defines the first explicit mutating tmux Go cutover gate without runtime mutation',
  'current Go source still has no mutating tmux commands',
  'authorized next runtime candidate is only `markWindowAsAgentTeam(target, signal)`',
  'future Go may use only `tmux set-option -w -t <target> automatic-rename off`, `tmux set-option -w -t <target> allow-rename off`, and `tmux set-option -w -t <target> @agentteam-window 1`',
  'after the actual cutover `tmux/labels.ts markWindowAsAgentTeam` must not keep direct TypeScript `runTmuxNoThrowAsync([\'set-option\', \'-w\'...])` fallback',
  'TypeScript/pi facade remains the pi extension compliance boundary',
  'new-session/new-window/pane creation/split/layout/resize/wake/send-keys/kill/clear labels/state/task/UI/release/package remain forbidden',
  'no Go source/native artifact rebuild',
  '**v0.6.71 Go mutating window marking gate**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'markWindowAsAgentTeamMigrated: true',
  'refreshWindowPaneLabelsMigrated: true',
  'newSessionMigrated: true',
  'newWindowMigrated: true',
  'createTeammatePaneMigrated: true',
  'wakePaneMigrated: true',
  'syncPaneLabelsMigrated: true',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goMutatingWindowMarkingGate)), goMutatingWindowMarkingGate)
  assert.equal(goMutatingWindowMarkingGate.schemaVersion, GO_MUTATING_WINDOW_MARKING_GATE_SCHEMA_VERSION)
  assert.equal(goMutatingWindowMarkingGate.theme, GO_MUTATING_WINDOW_MARKING_GATE_THEME)
  assert.equal(goMutatingWindowMarkingGate.packageVersion, PACKAGE_VERSION)
  assert.equal(goMutatingWindowMarkingGate.helperVersion, HELPER_VERSION)
  assert.equal(goMutatingWindowMarkingGate.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goMutatingWindowMarkingGate.capability, CAPABILITY)
  assert.deepEqual(goMutatingWindowMarkingGate.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goMutatingWindowMarkingGate.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goMutatingWindowMarkingGate.contractStatus, CONTRACT_STATUS)
  assert.equal(goMutatingWindowMarkingGate.futureOperation, FUTURE_OPERATION)
  assert.equal(goMutatingWindowMarkingGate.facadeName, FACADE_NAME)
  assert.equal(goMutatingWindowMarkingGate.runtimeFile, RUNTIME_FILE)
  assert.equal(goMutatingWindowMarkingGate.currentWindowExistenceGuard, CURRENT_WINDOW_EXISTENCE_GUARD)
  assert.equal(goMutatingWindowMarkingGate.futureAdapterDelegation, FUTURE_ADAPTER_DELEGATION)
  assert.deepEqual(goMutatingWindowMarkingGate.authorizedFutureMutatingCandidates, [FUTURE_OPERATION])
  assert.deepEqual(goMutatingWindowMarkingGate.authorizedFutureTmuxCommands, [...AUTHORIZED_FUTURE_TMUX_COMMANDS])
  assert.deepEqual(goMutatingWindowMarkingGate.currentTypescriptCommandSurface, [...CURRENT_TYPESCRIPT_COMMAND_SURFACE])
  assert.deepEqual(goMutatingWindowMarkingGate.currentGoReadOnlyTmuxCommands, [...CURRENT_GO_READ_ONLY_TMUX_COMMANDS])
  assert.deepEqual(goMutatingWindowMarkingGate.forbiddenCurrentGoTmuxCommands, [...FORBIDDEN_CURRENT_GO_TMUX_COMMANDS])
  assert.deepEqual(goMutatingWindowMarkingGate.stillForbiddenMutatingScope, [...STILL_FORBIDDEN_MUTATING_SCOPE])
  assert.deepEqual(goMutatingWindowMarkingGate.facadeAuthority, [...FACADE_AUTHORITY])
  assert.deepEqual(goMutatingWindowMarkingGate.futureFacadeRule, FUTURE_FACADE_RULE)
  assert.deepEqual(goMutatingWindowMarkingGate.futurePublicBehavior, FUTURE_PUBLIC_BEHAVIOR)
  assert.deepEqual(goMutatingWindowMarkingGate.windowExistenceAuthority, WINDOW_EXISTENCE_AUTHORITY)
  assert.deepEqual(goMutatingWindowMarkingGate.helperConnectionModel, HELPER_CONNECTION_MODEL)
  assert.deepEqual(goMutatingWindowMarkingGate.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.equal(goMutatingWindowMarkingGate.gateOnly, true)
  assert.equal(goMutatingWindowMarkingGate.noRuntimeMigrationInThisSlice, true)
  assert.equal(goMutatingWindowMarkingGate.currentGoMutatingTmuxCommands, false)
  assert.equal(goMutatingWindowMarkingGate.futureCandidateMutatesTmux, true)
  assert.equal(goMutatingWindowMarkingGate.futureCandidateDestructive, false)
  assert.equal(goMutatingWindowMarkingGate.markWindowAsAgentTeamMigrated, false)
  assert.equal(goMutatingWindowMarkingGate.refreshWindowPaneLabelsMigrated, false)
  assert.equal(goMutatingWindowMarkingGate.newSessionMigrated, false)
  assert.equal(goMutatingWindowMarkingGate.newWindowMigrated, false)
  assert.equal(goMutatingWindowMarkingGate.createTeammatePaneMigrated, false)
  assert.equal(goMutatingWindowMarkingGate.wakePaneMigrated, false)
  assert.equal(goMutatingWindowMarkingGate.syncPaneLabelsMigrated, false)
  assert.equal(goMutatingWindowMarkingGate.killPaneMigrated, false)
  assert.equal(goMutatingWindowMarkingGate.stateRepositoryMigrated, false)
  assert.equal(goMutatingWindowMarkingGate.taskReportPlanRunMigrated, false)
  assert.equal(goMutatingWindowMarkingGate.teamPanelViewModelMigrated, false)
  assert.equal(goMutatingWindowMarkingGate.releasePackageVerificationMigrated, false)
  assert.equal(goMutatingWindowMarkingGate.nativeArtifactRenamed, false)
  assert.equal(goMutatingWindowMarkingGate.nativeHelperRebuilt, false)
  assert.equal(goMutatingWindowMarkingGate.goSourceChanged, false)

  assert.deepEqual(AUTHORIZED_FUTURE_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_FUTURE_COMMANDS)
  assert.deepEqual(AUTHORIZED_FUTURE_TMUX_COMMANDS.map(command => command.args), [
    ['set-option', '-w', '-t', '<target>', 'automatic-rename', 'off'],
    ['set-option', '-w', '-t', '<target>', 'allow-rename', 'off'],
    ['set-option', '-w', '-t', '<target>', '@agentteam-window', '1'],
  ])
  for (const command of AUTHORIZED_FUTURE_TMUX_COMMANDS) {
    assert.equal(command.command, 'set-option')
    assert.equal(command.scope, 'window')
    assert.equal(command.destructive, false)
    assert.equal(command.mutatesTmux, true)
  }
  assert.equal(AUTHORIZED_FUTURE_TMUX_COMMANDS.some(command => command.option === 'pane-border-status'), false)
  assert.equal(AUTHORIZED_FUTURE_TMUX_COMMANDS.some(command => command.option === 'pane-border-format'), false)
  assert.equal(STILL_FORBIDDEN_MUTATING_SCOPE.includes('set-option -p pane labels'), true)
  assert.equal(STILL_FORBIDDEN_MUTATING_SCOPE.includes('select-pane -T pane titles'), true)
  assert.equal(STILL_FORBIDDEN_MUTATING_SCOPE.includes('set-option -w pane-border-status refreshWindowPaneLabels'), true)
  assert.equal(STILL_FORBIDDEN_MUTATING_SCOPE.includes('set-option -w pane-border-format refreshWindowPaneLabels'), true)
  assert.equal(FUTURE_FACADE_RULE.afterCutoverNoDirectTypescriptSetOptionFallback, true)
  assert.equal(FUTURE_FACADE_RULE.hiddenTypeScriptFallbackAllowedAfterCutover, false)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.noThrowVoidFacade, true)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.rawOutputLeakageAllowed, false)
  assert.equal(WINDOW_EXISTENCE_AUTHORITY.broadWindowCreationAuthorized, false)
  assert.equal(WINDOW_EXISTENCE_AUTHORITY.broadSessionCreationAuthorized, false)
  assert.equal(HELPER_CONNECTION_MODEL.status, 'per-call-helper-for-mutating-slice')
  assert.equal(HELPER_CONNECTION_MODEL.longLivedHelperStatus, 'deferred')
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

function assertAuthorizedRuntimeCutover(root) {
  const labelsSource = read(root, TMUX_LABELS)
  const kernelSource = read(root, KERNEL)
  const goSource = read(root, GO_SOURCE)
  const markBody = functionBody(labelsSource, FACADE_NAME)
  const refreshBody = functionBody(labelsSource, 'refreshWindowPaneLabels')

  assertIncludes(markBody, `if (!await ${CURRENT_WINDOW_EXISTENCE_GUARD}) return`, `${TMUX_LABELS} window existence guard`)
  assertIncludes(markBody, FUTURE_ADAPTER_DELEGATION, `${TMUX_LABELS} authorized adapter delegation`)
  for (const command of CURRENT_TYPESCRIPT_COMMAND_SURFACE) {
    assert.equal(markBody.includes(command.runTmuxNoThrowAsyncCall), false, `${TMUX_LABELS} direct TS marking fallback should be gone after the authorized cutover`)
  }
  assertIncludes(kernelSource, 'markWindowAsAgentTeamAsync(target: string, signal?: AbortSignal): Promise<AgentTeamKernelWindowMarking>', `${KERNEL} runtime mutation adapter`)
  assertIncludes(kernelSource, "callHelperAsync<unknown>('workerLifecycle', { operation: 'markWindowAsAgentTeam', target: requestedTarget }, signal)", `${KERNEL} workerLifecycle ${FUTURE_OPERATION}`)

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should keep active read-only operation ${operation}`)
  assert.match(goSource, new RegExp(`case "${FUTURE_OPERATION}"`), `${GO_SOURCE} should implement the gate-authorized ${FUTURE_OPERATION}`)
  assertIncludes(goSource, 'func markWindowAsAgentTeam(params map[string]any) workerWindowMarkingResult', `${GO_SOURCE} mark runtime implementation`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-w", "-t", target, option, value)', `${GO_SOURCE} authorized set-option helper`)
  for (const command of AUTHORIZED_FUTURE_TMUX_COMMANDS) {
    assertIncludes(goSource, `"${command.option}"`, `${GO_SOURCE} authorized option ${command.option}`)
    assertIncludes(goSource, `"${command.value}"`, `${GO_SOURCE} authorized value ${command.value}`)
  }
  assertIncludes(goSource, 'func refreshWindowPaneLabels(params map[string]any) workerWindowPaneLabelsRefreshResult', `${GO_SOURCE} later v0.6.74 refresh runtime implementation`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-status", "top")', `${GO_SOURCE} later v0.6.74 authorized pane-border-status`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-format", "#{?@agentteam-name,#{@agentteam-name},#{pane_title}}")', `${GO_SOURCE} later v0.6.74 authorized pane-border-format`)
  for (const snippet of REQUIRED_GO_READ_ONLY_COMMAND_SNIPPETS) assertIncludes(goSource, snippet, `${GO_SOURCE} current read-only command surface`)
  for (const command of FORBIDDEN_CURRENT_GO_TMUX_COMMANDS.filter(command => command !== 'set-option' && command !== 'select-pane')) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add forbidden tmux command ${command}`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} later v0.6.76 authorized pane-title command`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} later v0.6.78 authorized pane label clearing`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} later v0.6.78 authorized pane title clearing`)

  assertIncludes(refreshBody, `if (!await ${CURRENT_WINDOW_EXISTENCE_GUARD}) return`, 'refreshWindowPaneLabels keeps window guard after later cutover')
  assertIncludes(refreshBody, 'createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)', 'refreshWindowPaneLabels is superseded by v0.6.74 Go cutover')
  assert.equal(refreshBody.includes("runTmuxNoThrowAsync(['set-option', '-w', '-t', target, 'pane-border-status', 'top']"), false, 'refreshWindowPaneLabels direct TS pane-border-status fallback removed after later cutover')
  assert.equal(refreshBody.includes("runTmuxNoThrowAsync(['set-option', '-w', '-t', target, 'pane-border-format'"), false, 'refreshWindowPaneLabels direct TS pane-border-format fallback removed after later cutover')
}

function assertPackageAndNativeGuards(root) {
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
  name: 'Go kernel v0.6.71 Go mutating window marking gate',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertAuthorizedRuntimeCutover(root)
    assertPackageAndNativeGuards(root)
  },
}
