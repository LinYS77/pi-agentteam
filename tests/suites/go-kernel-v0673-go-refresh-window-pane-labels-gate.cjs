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
  GO_REFRESH_WINDOW_PANE_LABELS_GATE_SCHEMA_VERSION,
  GO_REFRESH_WINDOW_PANE_LABELS_GATE_THEME,
  HELPER_CONNECTION_MODEL,
  HELPER_VERSION,
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  STILL_FORBIDDEN_MUTATING_SCOPE,
  WINDOW_EXISTENCE_AUTHORITY,
  goRefreshWindowPaneLabelsGate,
} = require('../fixtures/kernel/v0673/goRefreshWindowPaneLabelsGate.cjs')

const DOC = 'docs/perf/v0.6.73-go-refresh-window-pane-labels-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0673/goRefreshWindowPaneLabelsGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0673-go-refresh-window-pane-labels-gate.cjs'
const TMUX_LABELS = 'tmux/labels.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_FUTURE_COMMANDS = [
  'tmux set-option -w -t <target> pane-border-status top',
  "tmux set-option -w -t <target> pane-border-format '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'",
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
  '# v0.6.73 Go Refresh Window Pane Labels Gate',
  'Result: v0.6.73 defines the second explicit mutating tmux Go cutover gate without implementing runtime mutation.',
  'Current state: Go source still has `markWindowAsAgentTeam` as the only mutating tmux operation.',
  'Authorized next runtime candidate: `refreshWindowPaneLabels(target, signal)` only.',
  '`tmux set-option -w -t <target> pane-border-status top`',
  "`tmux set-option -w -t <target> pane-border-format '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'`",
  'No other Go mutating tmux commands are authorized by this gate.',
  'After the actual future cutover, `tmux/labels.ts refreshWindowPaneLabels` must not retain direct TypeScript `runTmuxNoThrowAsync([\'set-option\', \'-w\'...])` fallback for the same pane-border behavior.',
  'The public facade remains no-throw/void.',
  'helper failure, invalid target, and abort should produce compact diagnostics internally and must not leak raw stdout/stderr/helper output through the public facade.',
  'Window existence authority remains explicit: keep the TypeScript `windowExists(target, signal)` guard or move it only inside the same future slice if documented and tested.',
  'Mutating commands remain per-call helper for now; long-lived helper is still deferred.',
  'TypeScript/pi facade remains the pi extension compliance boundary.',
  'Go may own runtime mutation only through explicit task-scoped contracts.',
  '`new-session`, `new-window`, pane creation/split/layout/resize, wake/send-keys, pane labels, pane titles, `markWindowAsAgentTeam`, state/task/UI/release/package remain forbidden for this gate.',
  'No Go source, native artifact, package version, release, or runtime facade change is made in v0.6.73.',
  '`tests/fixtures/kernel/v0673/goRefreshWindowPaneLabelsGate.cjs`',
  '`tests/suites/go-kernel-v0673-go-refresh-window-pane-labels-gate.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.73 Go refresh window pane labels gate',
  'docs/perf/v0.6.73-go-refresh-window-pane-labels-gate.md',
  'defines the second explicit mutating tmux Go cutover gate without runtime mutation',
  'current Go source has `markWindowAsAgentTeam` as the only mutating tmux operation',
  'authorized next runtime candidate is only `refreshWindowPaneLabels(target, signal)`',
  "future Go may use only `tmux set-option -w -t <target> pane-border-status top` and `tmux set-option -w -t <target> pane-border-format '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'`",
  'after the actual cutover `tmux/labels.ts refreshWindowPaneLabels` must not keep direct TypeScript `runTmuxNoThrowAsync([\'set-option\', \'-w\'...])` fallback',
  'TypeScript/pi facade remains the pi extension compliance boundary',
  'pane labels/pane titles/new-session/new-window/pane creation/layout/wake/kill/state/task/UI/release/package remain forbidden',
  'no Go source/native artifact rebuild',
  '**v0.6.73 Go refresh window pane labels gate**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goRefreshWindowPaneLabelsGate)), goRefreshWindowPaneLabelsGate)
  assert.equal(goRefreshWindowPaneLabelsGate.schemaVersion, GO_REFRESH_WINDOW_PANE_LABELS_GATE_SCHEMA_VERSION)
  assert.equal(goRefreshWindowPaneLabelsGate.theme, GO_REFRESH_WINDOW_PANE_LABELS_GATE_THEME)
  assert.equal(goRefreshWindowPaneLabelsGate.packageVersion, PACKAGE_VERSION)
  assert.equal(goRefreshWindowPaneLabelsGate.helperVersion, HELPER_VERSION)
  assert.equal(goRefreshWindowPaneLabelsGate.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goRefreshWindowPaneLabelsGate.capability, CAPABILITY)
  assert.deepEqual(goRefreshWindowPaneLabelsGate.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goRefreshWindowPaneLabelsGate.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goRefreshWindowPaneLabelsGate.contractStatus, CONTRACT_STATUS)
  assert.equal(goRefreshWindowPaneLabelsGate.futureOperation, FUTURE_OPERATION)
  assert.equal(goRefreshWindowPaneLabelsGate.facadeName, FACADE_NAME)
  assert.equal(goRefreshWindowPaneLabelsGate.runtimeFile, RUNTIME_FILE)
  assert.equal(goRefreshWindowPaneLabelsGate.currentWindowExistenceGuard, CURRENT_WINDOW_EXISTENCE_GUARD)
  assert.equal(goRefreshWindowPaneLabelsGate.futureAdapterDelegation, FUTURE_ADAPTER_DELEGATION)
  assert.deepEqual(goRefreshWindowPaneLabelsGate.authorizedFutureMutatingCandidates, [FUTURE_OPERATION])
  assert.deepEqual(goRefreshWindowPaneLabelsGate.authorizedFutureTmuxCommands, [...AUTHORIZED_FUTURE_TMUX_COMMANDS])
  assert.deepEqual(goRefreshWindowPaneLabelsGate.currentTypescriptCommandSurface, [...CURRENT_TYPESCRIPT_COMMAND_SURFACE])
  assert.deepEqual(goRefreshWindowPaneLabelsGate.currentGoReadOnlyTmuxCommands, [...CURRENT_GO_READ_ONLY_TMUX_COMMANDS])
  assert.deepEqual(goRefreshWindowPaneLabelsGate.forbiddenCurrentGoTmuxCommands, [...FORBIDDEN_CURRENT_GO_TMUX_COMMANDS])
  assert.deepEqual(goRefreshWindowPaneLabelsGate.stillForbiddenMutatingScope, [...STILL_FORBIDDEN_MUTATING_SCOPE])
  assert.deepEqual(goRefreshWindowPaneLabelsGate.facadeAuthority, [...FACADE_AUTHORITY])
  assert.deepEqual(goRefreshWindowPaneLabelsGate.futureFacadeRule, FUTURE_FACADE_RULE)
  assert.deepEqual(goRefreshWindowPaneLabelsGate.futurePublicBehavior, FUTURE_PUBLIC_BEHAVIOR)
  assert.deepEqual(goRefreshWindowPaneLabelsGate.windowExistenceAuthority, WINDOW_EXISTENCE_AUTHORITY)
  assert.deepEqual(goRefreshWindowPaneLabelsGate.helperConnectionModel, HELPER_CONNECTION_MODEL)
  assert.deepEqual(goRefreshWindowPaneLabelsGate.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.equal(goRefreshWindowPaneLabelsGate.gateOnly, true)
  assert.equal(goRefreshWindowPaneLabelsGate.noRuntimeMigrationInThisSlice, true)
  assert.equal(goRefreshWindowPaneLabelsGate.currentGoMutatingTmuxCommands, true)
  assert.equal(goRefreshWindowPaneLabelsGate.futureCandidateMutatesTmux, true)
  assert.equal(goRefreshWindowPaneLabelsGate.futureCandidateDestructive, false)
  assert.equal(goRefreshWindowPaneLabelsGate.markWindowAsAgentTeamMigrated, true)
  assert.equal(goRefreshWindowPaneLabelsGate.refreshWindowPaneLabelsMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsGate.newSessionMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsGate.newWindowMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsGate.createTeammatePaneMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsGate.wakePaneMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsGate.syncPaneLabelsMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsGate.killPaneMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsGate.stateRepositoryMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsGate.taskReportPlanRunMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsGate.teamPanelViewModelMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsGate.releasePackageVerificationMigrated, false)
  assert.equal(goRefreshWindowPaneLabelsGate.nativeArtifactRenamed, false)
  assert.equal(goRefreshWindowPaneLabelsGate.nativeHelperRebuilt, false)
  assert.equal(goRefreshWindowPaneLabelsGate.goSourceChanged, false)

  assert.deepEqual(AUTHORIZED_FUTURE_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_FUTURE_COMMANDS)
  assert.deepEqual(AUTHORIZED_FUTURE_TMUX_COMMANDS.map(command => command.args), [
    ['set-option', '-w', '-t', '<target>', 'pane-border-status', 'top'],
    ['set-option', '-w', '-t', '<target>', 'pane-border-format', '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'],
  ])
  for (const command of AUTHORIZED_FUTURE_TMUX_COMMANDS) {
    assert.equal(command.command, 'set-option')
    assert.equal(command.scope, 'window')
    assert.equal(command.destructive, false)
    assert.equal(command.mutatesTmux, true)
  }
  assert.equal(AUTHORIZED_FUTURE_TMUX_COMMANDS.some(command => command.option === 'automatic-rename'), false)
  assert.equal(AUTHORIZED_FUTURE_TMUX_COMMANDS.some(command => command.option === 'allow-rename'), false)
  assert.equal(AUTHORIZED_FUTURE_TMUX_COMMANDS.some(command => command.option === '@agentteam-window'), false)
  assert.equal(STILL_FORBIDDEN_MUTATING_SCOPE.includes('set-option -p pane labels'), true)
  assert.equal(STILL_FORBIDDEN_MUTATING_SCOPE.includes('select-pane -T pane titles'), true)
  assert.equal(STILL_FORBIDDEN_MUTATING_SCOPE.includes('set-option -w automatic-rename markWindowAsAgentTeam'), true)
  assert.equal(STILL_FORBIDDEN_MUTATING_SCOPE.includes('set-option -w allow-rename markWindowAsAgentTeam'), true)
  assert.equal(STILL_FORBIDDEN_MUTATING_SCOPE.includes('set-option -w @agentteam-window markWindowAsAgentTeam'), true)
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

function assertGatePreservesCurrentState(root) {
  const labelsSource = read(root, TMUX_LABELS)
  const kernelSource = read(root, KERNEL)
  const goSource = read(root, GO_SOURCE)
  const refreshBody = functionBody(labelsSource, FACADE_NAME)
  const markBody = functionBody(labelsSource, 'markWindowAsAgentTeam')

  // The v0.6.73 fixture/doc remain historical gate-only evidence; current source may include the later v0.6.74 authorized cutover.
  assertIncludes(refreshBody, `if (!await ${CURRENT_WINDOW_EXISTENCE_GUARD}) return`, `${TMUX_LABELS} window guard for refreshWindowPaneLabels`)
  assertIncludes(refreshBody, FUTURE_ADAPTER_DELEGATION, `${TMUX_LABELS} authorized v0.6.74 adapter delegation`)
  for (const command of CURRENT_TYPESCRIPT_COMMAND_SURFACE) {
    assert.equal(refreshBody.includes(command.runTmuxNoThrowAsyncCall), false, `${TMUX_LABELS} direct TS refreshWindowPaneLabels fallback removed after authorized cutover`)
  }

  // markWindowAsAgentTeam remains cut over (v0.6.72 state)
  assertIncludes(markBody, `if (!await windowExists(target, signal)) return`, `${TMUX_LABELS} markWindowAsAgentTeam window guard preserved`)
  assertIncludes(markBody, 'createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)', `${TMUX_LABELS} markWindowAsAgentTeam Go delegation preserved`)
  assert.equal(markBody.includes("automatic-rename"), false, `${TMUX_LABELS} markWindowAsAgentTeam should not keep TS fallback`)

  // Go source: markWindowAsAgentTeam plus the later v0.6.74 refreshWindowPaneLabels cutover.
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should keep active operation ${operation}`)
  assert.match(goSource, /case "markWindowAsAgentTeam"/, `${GO_SOURCE} should keep markWindowAsAgentTeam`)
  assert.match(goSource, /case "refreshWindowPaneLabels"/, `${GO_SOURCE} should include v0.6.74 refreshWindowPaneLabels`)
  assertIncludes(goSource, 'func markWindowAsAgentTeam(params map[string]any) workerWindowMarkingResult', `${GO_SOURCE} markWindowAsAgentTeam implementation`)
  assertIncludes(goSource, 'func runWindowMarkingSetOption(target string, option string, value string) string', `${GO_SOURCE} runWindowMarkingSetOption implementation`)
  assertIncludes(goSource, 'func refreshWindowPaneLabels(params map[string]any) workerWindowPaneLabelsRefreshResult', `${GO_SOURCE} refreshWindowPaneLabels implementation`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-status", "top")', `${GO_SOURCE} authorized pane-border-status`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-format", "#{?@agentteam-name,#{@agentteam-name},#{pane_title}}")', `${GO_SOURCE} authorized pane-border-format`)
  for (const snippet of REQUIRED_GO_READ_ONLY_COMMAND_SNIPPETS) assertIncludes(goSource, snippet, `${GO_SOURCE} current read-only command surface`)
  for (const command of FORBIDDEN_CURRENT_GO_TMUX_COMMANDS.filter(command => command !== 'select-pane')) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add forbidden command ${command}`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} later v0.6.76 authorized pane-title command`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} later v0.6.78 authorized pane label clearing`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} later v0.6.78 authorized pane title clearing`)

  // Kernel adapter: markWindowAsAgentTeamAsync plus v0.6.74 refreshWindowPaneLabelsAsync.
  assertIncludes(kernelSource, 'markWindowAsAgentTeamAsync(target: string, signal?: AbortSignal): Promise<AgentTeamKernelWindowMarking>', `${KERNEL} markWindowAsAgentTeamAsync adapter`)
  assertIncludes(kernelSource, "operation: 'markWindowAsAgentTeam'", `${KERNEL} markWindowAsAgentTeam operation`)
  assertIncludes(kernelSource, 'workerLifecycleMarkWindowAsAgentTeamConnected', `${KERNEL} markWindowAsAgentTeam profile flag`)
  assertIncludes(kernelSource, 'refreshWindowPaneLabelsAsync(target: string, signal?: AbortSignal): Promise<AgentTeamKernelWindowPaneLabelsRefresh>', `${KERNEL} refreshWindowPaneLabelsAsync adapter`)
  assertIncludes(kernelSource, "operation: 'refreshWindowPaneLabels'", `${KERNEL} refreshWindowPaneLabels operation`)
  assertIncludes(kernelSource, 'workerLifecycleRefreshWindowPaneLabelsConnected', `${KERNEL} refreshWindowPaneLabels profile flag`)
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
  name: 'Go kernel v0.6.73 Go refresh window pane labels gate',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertGatePreservesCurrentState(root)
    assertPackageAndNativeGuards(root)
  },
}
