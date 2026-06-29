const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  AUTHORIZED_FUTURE_COMMAND_SURFACE,
  CAPABILITY,
  CONTRACT_STATUS,
  CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE,
  CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE,
  CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE,
  EXISTING_GO_MUTATING_TMUX_COMMANDS,
  FORBIDDEN_FUTURE_SCOPE,
  FORBIDDEN_GO_CUTOVER_SNIPPETS,
  FORBIDDEN_RUNTIME_CUTOVER_SNIPPETS,
  FUTURE_INPUT_POLICY,
  FUTURE_OPERATION,
  FUTURE_PUBLIC_BEHAVIOR,
  GO_DETACHED_NEW_WINDOW_GATE_SCHEMA_VERSION,
  GO_DETACHED_NEW_WINDOW_GATE_THEME,
  GO_SOURCE_FILE,
  HELPER_VERSION,
  KERNEL_FILE,
  LABELS_FILE,
  NATIVE_ARTIFACT_SNAPSHOT,
  NATIVE_ROOT,
  PACKAGE_VERSION,
  PANES_FILE,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  goDetachedNewWindowGate,
} = require('../fixtures/kernel/v0683/goDetachedNewWindowGate.cjs')

const DOC = 'docs/perf/v0.6.83-go-detached-new-window-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0683/goDetachedNewWindowGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0683-go-detached-new-window-gate.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_FUTURE_COMMANDS = [
  'tmux new-window -t <SWARM_SESSION> -n <SWARM_WINDOW>',
]
const REQUIRED_DOC = [
  '# v0.6.83 Go Detached New-Window Gate',
  'Result: v0.6.83 defines the detached-branch `tmux/windows.ts ensureSwarmWindow(...)` `new-window` Go cutover gate without implementing runtime mutation.',
  'exactly one future candidate: replacing `runTmuxAsync([\'new-window\', \'-t\', SWARM_SESSION, \'-n\', SWARM_WINDOW], undefined, signal)`',
  '`findAgentTeamWindowTarget(SWARM_SESSION, signal)` cannot find an agentteam window after detached session handling',
  '`createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)`',
  '`runTmuxAsync([\'new-window\', \'-t\', SWARM_SESSION, \'-n\', SWARM_WINDOW], undefined, signal)`',
  '`tmux new-window -t <SWARM_SESSION> -n <SWARM_WINDOW>`',
  'Future Go must pass the session and window names as argv values only, never shell-interpolate them.',
  'compactly validate `SWARM_SESSION` and `SWARM_WINDOW`',
  'raw tmux stdout/stderr/helper output must not leak',
  'future public failure should preserve current throwing create failure behavior through the TypeScript facade',
  'No Go handler, TypeScript adapter method, `tmux/windows.ts` cutover, native helper rebuild, or package/release action is made in this slice.',
  'detached `new-session` remains the existing v0.6.82 Go-backed cutover and is not changed by this gate.',
  '`ensureSwarmWindow(...)` broader orchestration remains TypeScript-owned unless a separate explicit gate authorizes it.',
  '`findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)` lookup remains unchanged unless separately gated.',
  '`createTeammatePane(...)` remains the v0.6.80 Go-backed pane split/layout/resize cutover and is not changed here.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0683/goDetachedNewWindowGate.cjs`',
  '`tests/suites/go-kernel-v0683-go-detached-new-window-gate.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.83 Go detached new-window gate',
  'docs/perf/v0.6.83-go-detached-new-window-gate.md',
  'candidate is only the detached-branch `tmux/windows.ts ensureSwarmWindow(...)` `new-window` call when `findAgentTeamWindowTarget(SWARM_SESSION, signal)` cannot find the agentteam window after session handling',
  'future Go may use only `tmux new-window -t <SWARM_SESSION> -n <SWARM_WINDOW>`',
  '`new-session` changes, inside-tmux branch, broader `ensureSwarmWindow(...)` orchestration, post-creation lookup, marking/labels, and createTeammatePane remain out of scope',
  'no runtime migration, Go handler, adapter method, native rebuild, package/release action, or artifact rename',
  '**v0.6.83 Go detached new-window gate**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'detachedNewWindowMigrated: true',
  'newWindowMigrated: true',
  'ensureSwarmWindowMigrated: true',
  'insideTmuxBranchMigrated: true',
  'postCreationWindowLookupMigrated: true',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goDetachedNewWindowGate)), goDetachedNewWindowGate)
  assert.equal(goDetachedNewWindowGate.schemaVersion, GO_DETACHED_NEW_WINDOW_GATE_SCHEMA_VERSION)
  assert.equal(goDetachedNewWindowGate.theme, GO_DETACHED_NEW_WINDOW_GATE_THEME)
  assert.equal(goDetachedNewWindowGate.packageVersion, PACKAGE_VERSION)
  assert.equal(goDetachedNewWindowGate.helperVersion, HELPER_VERSION)
  assert.equal(goDetachedNewWindowGate.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goDetachedNewWindowGate.capability, CAPABILITY)
  assert.deepEqual(goDetachedNewWindowGate.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goDetachedNewWindowGate.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goDetachedNewWindowGate.contractStatus, CONTRACT_STATUS)
  assert.equal(goDetachedNewWindowGate.futureOperation, FUTURE_OPERATION)
  assert.equal(goDetachedNewWindowGate.runtimeFile, RUNTIME_FILE)
  assert.equal(goDetachedNewWindowGate.panesFile, PANES_FILE)
  assert.equal(goDetachedNewWindowGate.labelsFile, LABELS_FILE)
  assert.equal(goDetachedNewWindowGate.kernelFile, KERNEL_FILE)
  assert.equal(goDetachedNewWindowGate.goSourceFile, GO_SOURCE_FILE)
  assert.deepEqual(goDetachedNewWindowGate.authorizedFutureMutatingCandidates, [FUTURE_OPERATION])
  assert.deepEqual(goDetachedNewWindowGate.authorizedFutureCommandSurface, [...AUTHORIZED_FUTURE_COMMAND_SURFACE])
  assert.deepEqual(goDetachedNewWindowGate.currentTypescriptDetachedNewWindowSurface, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE)
  assert.deepEqual(goDetachedNewWindowGate.currentV0682DetachedNewSessionSurface, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE)
  assert.deepEqual(goDetachedNewWindowGate.currentV0680CreateTeammatePaneSurface, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE)
  assert.deepEqual(goDetachedNewWindowGate.existingGoMutatingTmuxCommands, [...EXISTING_GO_MUTATING_TMUX_COMMANDS])
  assert.deepEqual(goDetachedNewWindowGate.forbiddenRuntimeCutoverSnippets, [...FORBIDDEN_RUNTIME_CUTOVER_SNIPPETS])
  assert.deepEqual(goDetachedNewWindowGate.forbiddenGoCutoverSnippets, [...FORBIDDEN_GO_CUTOVER_SNIPPETS])
  assert.deepEqual(goDetachedNewWindowGate.forbiddenFutureScope, [...FORBIDDEN_FUTURE_SCOPE])
  assert.deepEqual(goDetachedNewWindowGate.futureInputPolicy, FUTURE_INPUT_POLICY)
  assert.deepEqual(goDetachedNewWindowGate.futurePublicBehavior, FUTURE_PUBLIC_BEHAVIOR)
  assert.deepEqual(goDetachedNewWindowGate.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(goDetachedNewWindowGate.nativeArtifactSnapshot, NATIVE_ARTIFACT_SNAPSHOT)

  assert.equal(goDetachedNewWindowGate.gateOnly, true)
  assert.equal(goDetachedNewWindowGate.noRuntimeMigrationInThisSlice, true)
  assert.equal(goDetachedNewWindowGate.futureCandidateMutatesTmux, true)
  assert.equal(goDetachedNewWindowGate.futureCandidateDestructive, false)
  assert.equal(goDetachedNewWindowGate.futureCandidateCreatesSession, false)
  assert.equal(goDetachedNewWindowGate.futureCandidateCreatesWindow, true)
  assert.equal(goDetachedNewWindowGate.createTeammatePaneMigrated, true)
  assert.equal(goDetachedNewWindowGate.detachedNewSessionMigrated, true)
  assert.equal(goDetachedNewWindowGate.detachedNewWindowMigrated, false)
  assert.equal(goDetachedNewWindowGate.ensureSwarmWindowMigrated, false)
  assert.equal(goDetachedNewWindowGate.newSessionChanged, false)
  assert.equal(goDetachedNewWindowGate.newWindowMigrated, false)
  assert.equal(goDetachedNewWindowGate.insideTmuxBranchMigrated, false)
  assert.equal(goDetachedNewWindowGate.postCreationWindowLookupMigrated, false)
  assert.equal(goDetachedNewWindowGate.markWindowAsAgentTeamChanged, false)
  assert.equal(goDetachedNewWindowGate.refreshWindowPaneLabelsChanged, false)
  assert.equal(goDetachedNewWindowGate.paneSplitLayoutResizeChanged, false)
  assert.equal(goDetachedNewWindowGate.wakePaneMigrated, false)
  assert.equal(goDetachedNewWindowGate.killPaneMigrated, false)
  assert.equal(goDetachedNewWindowGate.stateRepositoryMigrated, false)
  assert.equal(goDetachedNewWindowGate.taskReportPlanRunMigrated, false)
  assert.equal(goDetachedNewWindowGate.teamPanelViewModelMigrated, false)
  assert.equal(goDetachedNewWindowGate.releasePackageVerificationMigrated, false)
  assert.equal(goDetachedNewWindowGate.nativeArtifactRenamed, false)
  assert.equal(goDetachedNewWindowGate.nativeHelperRebuilt, false)
  assert.equal(goDetachedNewWindowGate.goSourceChanged, false)
  assert.equal(goDetachedNewWindowGate.coreKernelChanged, false)
  assert.equal(goDetachedNewWindowGate.tmuxWindowsRuntimeChanged, false)
  assert.equal(goDetachedNewWindowGate.packageVersionChanged, false)
  assert.equal(goDetachedNewWindowGate.packageReleaseApproved, false)
  assert.equal(goDetachedNewWindowGate.npmVersionChanged, false)
  assert.equal(goDetachedNewWindowGate.npmPublished, false)
  assert.equal(goDetachedNewWindowGate.tagReleaseCreated, false)

  assert.deepEqual(AUTHORIZED_FUTURE_COMMAND_SURFACE.map(command => command.rendered), EXPECTED_FUTURE_COMMANDS)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.length, 1)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE[0].command, 'new-window')
  assert.deepEqual(AUTHORIZED_FUTURE_COMMAND_SURFACE[0].args, ['new-window', '-t', '<SWARM_SESSION>', '-n', '<SWARM_WINDOW>'])
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE[0].createsSession, false)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE[0].createsWindow, true)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.some(command => command.command === 'new-session'), false)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.some(command => command.command === 'send-keys'), false)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.some(command => command.command.startsWith('kill-')), false)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.some(command => command.command === 'split-window'), false)
  assert.equal(FUTURE_INPUT_POLICY.argvOnly, true)
  assert.equal(FUTURE_INPUT_POLICY.shellInterpolationAllowed, false)
  assert.equal(FUTURE_INPUT_POLICY.sessionNameValidation.includes('SWARM_SESSION'), true)
  assert.equal(FUTURE_INPUT_POLICY.windowNameValidation.includes('SWARM_WINDOW'), true)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.preservesThrownCreateFailures, true)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.noHiddenTypescriptFallbackAfterCutover, true)
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

function assertCurrentTypescriptWindowState(root) {
  const windowsSource = read(root, RUNTIME_FILE)
  const ensureBody = functionBody(windowsSource, 'ensureSwarmWindow')
  assertIncludes(windowsSource, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", RUNTIME_FILE)
  assertIncludes(windowsSource, "import { runTmuxAsync } from './client.js'", RUNTIME_FILE)
  assertIncludes(windowsSource, 'SWARM_SESSION', RUNTIME_FILE)
  assertIncludes(windowsSource, 'SWARM_WINDOW', RUNTIME_FILE)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.detachedBranchGuard, `${RUNTIME_FILE} inside-tmux branch guard`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.sessionExistsDelegation, `${RUNTIME_FILE} detached sessionExists`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.missingSessionCheck, `${RUNTIME_FILE} detached missing-session check`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.detachedNewSessionDelegation, `${RUNTIME_FILE} v0.6.82 detached new-session cutover`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.markAfterNewSessionCall, `${RUNTIME_FILE} mark after new-session remains unchanged`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.agentteamWindowLookupCall, `${RUNTIME_FILE} agentteam window lookup remains unchanged`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.missingAgentteamWindowGuard, `${RUNTIME_FILE} missing agentteam window guard remains unchanged`)
  assertIncludes(ensureBody, `await ${CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.newWindowCall}`, `${RUNTIME_FILE} new-window remains TS-owned`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.findWindowByNameCall, `${RUNTIME_FILE} findWindowTargetByName remains unchanged`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.failedPostCreateLookupThrow, `${RUNTIME_FILE} post-create failure throw remains unchanged`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.markAfterNewWindowLookupCall, `${RUNTIME_FILE} mark after new-window lookup remains unchanged`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.firstPaneLookupCall, `${RUNTIME_FILE} firstPaneInWindow remains unchanged`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.leaderBindingLookupCall, `${RUNTIME_FILE} resolvePaneBindingAsync remains unchanged`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.finalMarkCall, `${RUNTIME_FILE} final mark remains unchanged`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_WINDOW_SURFACE.finalRefreshCall, `${RUNTIME_FILE} refresh remains unchanged`)
  assert.equal([...ensureBody.matchAll(/runTmuxAsync\(\['new-session'/g)].length, 0, `${RUNTIME_FILE} should not reintroduce direct detached new-session call after v0.6.82`)
  assert.equal([...ensureBody.matchAll(/runTmuxAsync\(\['new-window'/g)].length, 1, `${RUNTIME_FILE} should keep exactly one direct detached new-window call in this gate`)
  for (const forbidden of FORBIDDEN_RUNTIME_CUTOVER_SNIPPETS) {
    assert.equal(ensureBody.includes(forbidden), false, `${RUNTIME_FILE} must not add gate future runtime cutover ${forbidden}`)
  }
}

function assertNoGateRuntimeCutover(root) {
  const kernelSource = read(root, KERNEL_FILE)
  const goSource = read(root, GO_SOURCE_FILE)
  const windowsSource = read(root, RUNTIME_FILE)
  for (const forbidden of FORBIDDEN_RUNTIME_CUTOVER_SNIPPETS) {
    assert.equal(kernelSource.includes(forbidden), false, `${KERNEL_FILE} must not add future detached new-window adapter/runtime snippet ${forbidden}`)
    assert.equal(windowsSource.includes(forbidden), false, `${RUNTIME_FILE} must not add future detached new-window adapter/runtime snippet ${forbidden}`)
  }
  for (const forbidden of FORBIDDEN_GO_CUTOVER_SNIPPETS) {
    assert.equal(goSource.includes(forbidden), false, `${GO_SOURCE_FILE} must not add future detached new-window Go cutover snippet ${forbidden}`)
  }
  assert.equal(goSource.includes('exec.CommandContext(ctx, "tmux", "new-window"'), false, `${GO_SOURCE_FILE} must not add Go new-window command in this gate`)
}

function assertV0682DetachedNewSessionStillRecognized(root) {
  const windowsSource = read(root, RUNTIME_FILE)
  const kernelSource = read(root, KERNEL_FILE)
  const goSource = read(root, GO_SOURCE_FILE)
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  assertIncludes(windowsSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.adapterDelegation, `${RUNTIME_FILE} v0.6.82 runtime delegation`)
  assertIncludes(windowsSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.runtimeFailureThrow, `${RUNTIME_FILE} v0.6.82 compact failure throw`)
  assertIncludes(kernelSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.kernelType, `${KERNEL_FILE} v0.6.82 type`)
  assertIncludes(kernelSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.kernelAdapterMethod, `${KERNEL_FILE} v0.6.82 adapter method`)
  assertIncludes(kernelSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.kernelOperation, `${KERNEL_FILE} v0.6.82 operation`)
  assertIncludes(kernelSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.kernelProfileFlag, `${KERNEL_FILE} v0.6.82 profile flag`)
  assertIncludes(goSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.goCase, `${GO_SOURCE_FILE} v0.6.82 Go case`)
  assertIncludes(goSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.goFunction, `${GO_SOURCE_FILE} v0.6.82 Go function`)
  assertIncludes(goSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.goCommand, `${GO_SOURCE_FILE} v0.6.82 argv-only new-session`)
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.smoke, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.nativeSmoke), true, 'v0.6.82 native smoke remains present')
  assert.deepEqual(manifest.smoke.workerLifecycleCreateDetachedSwarmSession, { ok: false, acceptedFailureKinds: ['invalid-session'] })
}

function assertV0680CreateTeammatePaneStillRecognized(root) {
  const panesSource = read(root, PANES_FILE)
  const kernelSource = read(root, KERNEL_FILE)
  const goSource = read(root, GO_SOURCE_FILE)
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  assertIncludes(panesSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.runtimeDelegation, `${PANES_FILE} v0.6.80 runtime delegation`)
  assertIncludes(kernelSource, 'createTeammatePaneAsync(input: AgentTeamKernelCreateTeammatePaneInput, signal?: AbortSignal)', `${KERNEL_FILE} v0.6.80 adapter method`)
  assertIncludes(kernelSource, "operation: 'createTeammatePane'", `${KERNEL_FILE} v0.6.80 operation`)
  assertIncludes(kernelSource, 'workerLifecycleCreateTeammatePaneConnected', `${KERNEL_FILE} v0.6.80 profile flag`)
  assertIncludes(goSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.goCase, `${GO_SOURCE_FILE} v0.6.80 Go case`)
  assertIncludes(goSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.goFunction, `${GO_SOURCE_FILE} v0.6.80 Go function`)
  assertIncludes(goSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.goListPanes, `${GO_SOURCE_FILE} v0.6.80 list-panes`)
  assertIncludes(goSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.goSplitWindow, `${GO_SOURCE_FILE} v0.6.80 split-window`)
  assertIncludes(goSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.goSelectLayout, `${GO_SOURCE_FILE} v0.6.80 select-layout`)
  assertIncludes(goSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.goResizePane, `${GO_SOURCE_FILE} v0.6.80 resize-pane`)
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.smoke, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.nativeSmoke), true, 'v0.6.80 native smoke remains present')
  assert.deepEqual(manifest.smoke.workerLifecycleCreateTeammatePane, { ok: false, acceptedFailureKinds: ['invalid-target'] })
}

function assertCurrentGoSurfaceNoNewWindow(root) {
  const goSource = read(root, GO_SOURCE_FILE)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE_FILE} should keep existing operation ${operation}`)
  for (const command of EXISTING_GO_MUTATING_TMUX_COMMANDS) {
    if (command.operation === 'markWindowAsAgentTeam') assertIncludes(goSource, `runWindowMarkingSetOption(target, "${command.args[4]}", "${command.args[5]}")`, `${GO_SOURCE_FILE} ${command.rendered}`)
    if (command.operation === 'refreshWindowPaneLabels') assertIncludes(goSource, `runWindowPaneLabelsSetOption(target, "${command.args[4]}", "${command.args[5]}")`, `${GO_SOURCE_FILE} ${command.rendered}`)
  }
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-p", "-t", paneID, "@agentteam-name", label)', `${GO_SOURCE_FILE} setPaneLabel set-option`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE_FILE} setPaneLabel select-pane`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE_FILE} clearPaneLabel unset`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE_FILE} clearPaneLabel select-pane`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmuxOutput("list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat)', `${GO_SOURCE_FILE} createTeammatePane list-panes`)
  assertIncludes(goSource, 'splitArgs := []string{"split-window"}', `${GO_SOURCE_FILE} createTeammatePane split-window`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("select-layout", "-t", target, layout)', `${GO_SOURCE_FILE} createTeammatePane select-layout`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("resize-pane", "-t", leaderPaneID, "-x", "66%")', `${GO_SOURCE_FILE} createTeammatePane resize-pane`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "new-session", "-d", "-s", sessionName, "-n", windowName)', `${GO_SOURCE_FILE} v0.6.82 detached new-session`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "new-session", "-d", "-s", sessionName, "-n", windowName\)/g)].length, 1, `${GO_SOURCE_FILE} should contain exactly one authorized detached new-session command`)
  for (const forbiddenCommand of ['new-window', 'send-keys', 'kill-pane', 'kill-window', 'kill-session', 'respawn-pane', 'set-buffer', 'paste-buffer']) {
    assert.equal(goSource.includes(`"${forbiddenCommand}"`), false, `${GO_SOURCE_FILE} must not add forbidden command ${forbiddenCommand}`)
  }
}

function assertNativeArtifactUnchanged(root) {
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  const provenance = JSON.parse(read(root, `${NATIVE_ROOT}/provenance.json`))
  assert.equal(exists(root, NATIVE_ARTIFACT_SNAPSHOT.helperPath), true, 'existing native helper should remain present')
  assert.equal(manifest.artifact.path, NATIVE_ARTIFACT_SNAPSHOT.helperPath)
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
  assert.equal(manifest.artifact.executable, true)
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(manifest.packageVersion, PACKAGE_VERSION)
  assert.equal(manifest.helperVersion, HELPER_VERSION)
  assert.equal(manifest.protocolVersion, PROTOCOL_VERSION)
  assert.equal(manifest.artifact.size, NATIVE_ARTIFACT_SNAPSHOT.helperSize)
  assert.equal(manifest.artifact.sha256, NATIVE_ARTIFACT_SNAPSHOT.helperSha256)
  assert.equal(manifest.source.revision, NATIVE_ARTIFACT_SNAPSHOT.sourceRevision)
  assert.equal(provenance.source.revision, NATIVE_ARTIFACT_SNAPSHOT.sourceRevision)
  assert.equal(sha256(root, NATIVE_ARTIFACT_SNAPSHOT.helperPath), NATIVE_ARTIFACT_SNAPSHOT.helperSha256)
  assert.equal(sha256(root, `${NATIVE_ROOT}/manifest.json`), NATIVE_ARTIFACT_SNAPSHOT.manifestSha256)
  assert.equal(sha256(root, `${NATIVE_ROOT}/provenance.json`), NATIVE_ARTIFACT_SNAPSHOT.provenanceSha256)
  assert.equal(sha256(root, `${NATIVE_ROOT}/attestation.intoto.jsonl`), NATIVE_ARTIFACT_SNAPSHOT.attestationSha256)
  assert.equal(sha256(root, `${NATIVE_ROOT}/SHA256SUMS`), NATIVE_ARTIFACT_SNAPSHOT.checksumsSha256)
  assert.deepEqual(manifest.smoke.workerLifecycleCreateDetachedSwarmSession, NATIVE_ARTIFACT_SNAPSHOT.createDetachedSwarmSessionSmoke)
  assert.deepEqual(provenance.smoke.workerLifecycleCreateDetachedSwarmSession, NATIVE_ARTIFACT_SNAPSHOT.createDetachedSwarmSessionSmoke)
  assert.deepEqual(manifest.smoke.workerLifecycleCreateTeammatePane, NATIVE_ARTIFACT_SNAPSHOT.createTeammatePaneSmoke)
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.smoke, 'workerLifecycleCreateDetachedSwarmWindow'), false, 'v0.6.83 gate must not add detached new-window native smoke')
  assert.equal(Object.prototype.hasOwnProperty.call(provenance.smoke, 'workerLifecycleCreateDetachedSwarmWindow'), false, 'v0.6.83 gate must not add detached new-window provenance smoke')
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
  name: 'Go kernel v0.6.83 Go detached new-window gate',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertCurrentTypescriptWindowState(root)
    assertNoGateRuntimeCutover(root)
    assertV0682DetachedNewSessionStillRecognized(root)
    assertV0680CreateTeammatePaneStillRecognized(root)
    assertCurrentGoSurfaceNoNewWindow(root)
    assertNativeArtifactUnchanged(root)
    assertPackageAndReleaseGuards(root)
  },
}
