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
  CURRENT_TYPESCRIPT_DETACHED_NEW_SESSION_SURFACE,
  CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE,
  EXISTING_GO_MUTATING_TMUX_COMMANDS,
  FORBIDDEN_FUTURE_SCOPE,
  FORBIDDEN_GO_CUTOVER_SNIPPETS,
  FORBIDDEN_RUNTIME_CUTOVER_SNIPPETS,
  FUTURE_INPUT_POLICY,
  FUTURE_OPERATION,
  FUTURE_PUBLIC_BEHAVIOR,
  GO_DETACHED_NEW_SESSION_GATE_SCHEMA_VERSION,
  GO_DETACHED_NEW_SESSION_GATE_THEME,
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
  goDetachedNewSessionGate,
} = require('../fixtures/kernel/v0681/goDetachedNewSessionGate.cjs')

const DOC = 'docs/perf/v0.6.81-go-detached-new-session-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0681/goDetachedNewSessionGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0681-go-detached-new-session-gate.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_FUTURE_COMMANDS = [
  'tmux new-session -d -s <SWARM_SESSION> -n <SWARM_WINDOW>',
]
const REQUIRED_DOC = [
  '# v0.6.81 Go Detached New-Session Gate',
  'Result: v0.6.81 defines the detached-branch `tmux/windows.ts ensureSwarmWindow(...)` `new-session` Go cutover gate without implementing runtime mutation.',
  'exactly one future candidate: replacing `runTmuxAsync([\'new-session\', \'-d\', \'-s\', SWARM_SESSION, \'-n\', SWARM_WINDOW], undefined, signal)`',
  '`createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)` reports that the swarm session is absent',
  '`runTmuxAsync([\'new-session\', \'-d\', \'-s\', SWARM_SESSION, \'-n\', SWARM_WINDOW], undefined, signal)`',
  '`tmux new-session -d -s <SWARM_SESSION> -n <SWARM_WINDOW>`',
  'Future Go must pass the session and window names as argv values only, never shell-interpolate them.',
  'compactly validate `SWARM_SESSION` and `SWARM_WINDOW`',
  'raw tmux stdout/stderr/helper output must not leak',
  'future public failure should preserve current throwing create failure behavior through the TypeScript facade',
  'No Go handler, TypeScript adapter method, `tmux/windows.ts` cutover, native helper rebuild, or package/release action is made in this slice.',
  '`new-window` remains TypeScript-owned',
  '`ensureSwarmWindow(...)` broader orchestration migration remains out of scope',
  '`createTeammatePane(...)` remains the v0.6.80 Go-backed pane split/layout/resize cutover and is not changed here.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0681/goDetachedNewSessionGate.cjs`',
  '`tests/suites/go-kernel-v0681-go-detached-new-session-gate.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.81 Go detached new-session gate',
  'docs/perf/v0.6.81-go-detached-new-session-gate.md',
  'candidate is only the detached-branch `tmux/windows.ts ensureSwarmWindow(...)` `new-session` call',
  'future Go may use only `tmux new-session -d -s <SWARM_SESSION> -n <SWARM_WINDOW>`',
  '`new-window`, inside-tmux branch, broader `ensureSwarmWindow(...)` orchestration, post-creation lookup, marking/labels, and createTeammatePane remain out of scope',
  'no runtime migration, Go handler, adapter method, native rebuild, package/release action, or artifact rename',
  '**v0.6.81 Go detached new-session gate**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'detachedNewSessionMigrated: true',
  'newSessionMigrated: true',
  'ensureSwarmWindowMigrated: true',
  'newWindowMigrated: true',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goDetachedNewSessionGate)), goDetachedNewSessionGate)
  assert.equal(goDetachedNewSessionGate.schemaVersion, GO_DETACHED_NEW_SESSION_GATE_SCHEMA_VERSION)
  assert.equal(goDetachedNewSessionGate.theme, GO_DETACHED_NEW_SESSION_GATE_THEME)
  assert.equal(goDetachedNewSessionGate.packageVersion, PACKAGE_VERSION)
  assert.equal(goDetachedNewSessionGate.helperVersion, HELPER_VERSION)
  assert.equal(goDetachedNewSessionGate.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goDetachedNewSessionGate.capability, CAPABILITY)
  assert.deepEqual(goDetachedNewSessionGate.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goDetachedNewSessionGate.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goDetachedNewSessionGate.contractStatus, CONTRACT_STATUS)
  assert.equal(goDetachedNewSessionGate.futureOperation, FUTURE_OPERATION)
  assert.equal(goDetachedNewSessionGate.runtimeFile, RUNTIME_FILE)
  assert.equal(goDetachedNewSessionGate.panesFile, PANES_FILE)
  assert.equal(goDetachedNewSessionGate.labelsFile, LABELS_FILE)
  assert.equal(goDetachedNewSessionGate.kernelFile, KERNEL_FILE)
  assert.equal(goDetachedNewSessionGate.goSourceFile, GO_SOURCE_FILE)
  assert.deepEqual(goDetachedNewSessionGate.authorizedFutureMutatingCandidates, [FUTURE_OPERATION])
  assert.deepEqual(goDetachedNewSessionGate.authorizedFutureCommandSurface, [...AUTHORIZED_FUTURE_COMMAND_SURFACE])
  assert.deepEqual(goDetachedNewSessionGate.currentTypescriptDetachedNewSessionSurface, CURRENT_TYPESCRIPT_DETACHED_NEW_SESSION_SURFACE)
  assert.deepEqual(goDetachedNewSessionGate.currentV0680CreateTeammatePaneSurface, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE)
  assert.deepEqual(goDetachedNewSessionGate.existingGoMutatingTmuxCommands, [...EXISTING_GO_MUTATING_TMUX_COMMANDS])
  assert.deepEqual(goDetachedNewSessionGate.forbiddenRuntimeCutoverSnippets, [...FORBIDDEN_RUNTIME_CUTOVER_SNIPPETS])
  assert.deepEqual(goDetachedNewSessionGate.forbiddenGoCutoverSnippets, [...FORBIDDEN_GO_CUTOVER_SNIPPETS])
  assert.deepEqual(goDetachedNewSessionGate.forbiddenFutureScope, [...FORBIDDEN_FUTURE_SCOPE])
  assert.deepEqual(goDetachedNewSessionGate.futureInputPolicy, FUTURE_INPUT_POLICY)
  assert.deepEqual(goDetachedNewSessionGate.futurePublicBehavior, FUTURE_PUBLIC_BEHAVIOR)
  assert.deepEqual(goDetachedNewSessionGate.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(goDetachedNewSessionGate.nativeArtifactSnapshot, NATIVE_ARTIFACT_SNAPSHOT)

  assert.equal(goDetachedNewSessionGate.gateOnly, true)
  assert.equal(goDetachedNewSessionGate.noRuntimeMigrationInThisSlice, true)
  assert.equal(goDetachedNewSessionGate.futureCandidateMutatesTmux, true)
  assert.equal(goDetachedNewSessionGate.futureCandidateDestructive, false)
  assert.equal(goDetachedNewSessionGate.futureCandidateCreatesSession, true)
  assert.equal(goDetachedNewSessionGate.futureCandidateCreatesWindow, true)
  assert.equal(goDetachedNewSessionGate.createTeammatePaneMigrated, true)
  assert.equal(goDetachedNewSessionGate.detachedNewSessionMigrated, false)
  assert.equal(goDetachedNewSessionGate.ensureSwarmWindowMigrated, false)
  assert.equal(goDetachedNewSessionGate.newSessionMigrated, false)
  assert.equal(goDetachedNewSessionGate.newWindowMigrated, false)
  assert.equal(goDetachedNewSessionGate.insideTmuxBranchMigrated, false)
  assert.equal(goDetachedNewSessionGate.postCreationWindowLookupMigrated, false)
  assert.equal(goDetachedNewSessionGate.markWindowAsAgentTeamChanged, false)
  assert.equal(goDetachedNewSessionGate.refreshWindowPaneLabelsChanged, false)
  assert.equal(goDetachedNewSessionGate.paneSplitLayoutResizeChanged, false)
  assert.equal(goDetachedNewSessionGate.wakePaneMigrated, false)
  assert.equal(goDetachedNewSessionGate.killPaneMigrated, false)
  assert.equal(goDetachedNewSessionGate.stateRepositoryMigrated, false)
  assert.equal(goDetachedNewSessionGate.taskReportPlanRunMigrated, false)
  assert.equal(goDetachedNewSessionGate.teamPanelViewModelMigrated, false)
  assert.equal(goDetachedNewSessionGate.releasePackageVerificationMigrated, false)
  assert.equal(goDetachedNewSessionGate.nativeArtifactRenamed, false)
  assert.equal(goDetachedNewSessionGate.nativeHelperRebuilt, false)
  assert.equal(goDetachedNewSessionGate.goSourceChanged, false)
  assert.equal(goDetachedNewSessionGate.coreKernelChanged, false)
  assert.equal(goDetachedNewSessionGate.tmuxWindowsRuntimeChanged, false)
  assert.equal(goDetachedNewSessionGate.packageVersionChanged, false)
  assert.equal(goDetachedNewSessionGate.packageReleaseApproved, false)
  assert.equal(goDetachedNewSessionGate.npmVersionChanged, false)
  assert.equal(goDetachedNewSessionGate.npmPublished, false)
  assert.equal(goDetachedNewSessionGate.tagReleaseCreated, false)

  assert.deepEqual(AUTHORIZED_FUTURE_COMMAND_SURFACE.map(command => command.rendered), EXPECTED_FUTURE_COMMANDS)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.length, 1)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE[0].command, 'new-session')
  assert.deepEqual(AUTHORIZED_FUTURE_COMMAND_SURFACE[0].args, ['new-session', '-d', '-s', '<SWARM_SESSION>', '-n', '<SWARM_WINDOW>'])
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.some(command => command.command === 'new-window'), false)
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
  assertIncludes(windowsSource, 'SWARM_SESSION', RUNTIME_FILE)
  assertIncludes(windowsSource, 'SWARM_WINDOW', RUNTIME_FILE)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_SESSION_SURFACE.detachedBranchGuard, `${RUNTIME_FILE} inside-tmux branch guard`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_SESSION_SURFACE.sessionExistsDelegation, `${RUNTIME_FILE} detached sessionExists`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_SESSION_SURFACE.missingSessionCheck, `${RUNTIME_FILE} detached missing-session check`)
  // The v0.6.81 fixture/doc remain historical gate-only evidence; current source may include the later v0.6.82 authorized cutover.
  assert.equal(ensureBody.includes(CURRENT_TYPESCRIPT_DETACHED_NEW_SESSION_SURFACE.newSessionCall), false, `${RUNTIME_FILE} detached new-session direct TS fallback removed after authorized v0.6.82 cutover`)
  assertIncludes(ensureBody, 'createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)', `${RUNTIME_FILE} later v0.6.82 detached new-session cutover`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_SESSION_SURFACE.markAfterNewSessionCall, `${RUNTIME_FILE} mark after new-session remains unchanged`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_SESSION_SURFACE.postCreationLookupCall, `${RUNTIME_FILE} post-creation lookup remains unchanged`)
  assert.equal(ensureBody.includes(CURRENT_TYPESCRIPT_DETACHED_NEW_SESSION_SURFACE.newWindowCall), false, `${RUNTIME_FILE} detached new-window direct TS fallback removed after authorized v0.6.84 cutover`)
  assertIncludes(ensureBody, 'createAgentTeamKernelAdapter().createDetachedSwarmWindowAsync(SWARM_SESSION, SWARM_WINDOW, signal)', `${RUNTIME_FILE} later v0.6.84 detached new-window cutover`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_SESSION_SURFACE.findWindowByNameCall, `${RUNTIME_FILE} findWindowTargetByName remains unchanged`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_SESSION_SURFACE.firstPaneLookupCall, `${RUNTIME_FILE} firstPaneInWindow remains unchanged`)
  assertIncludes(ensureBody, CURRENT_TYPESCRIPT_DETACHED_NEW_SESSION_SURFACE.leaderBindingLookupCall, `${RUNTIME_FILE} resolvePaneBindingAsync remains unchanged`)
  assert.equal([...ensureBody.matchAll(/runTmuxAsync\(\['new-session'/g)].length, 0, `${RUNTIME_FILE} should not keep direct detached new-session call after authorized v0.6.82 cutover`)
  assert.equal([...ensureBody.matchAll(/runTmuxAsync\(\['new-window'/g)].length, 0, `${RUNTIME_FILE} should not keep direct detached new-window call after authorized v0.6.84 cutover`)
  assertIncludes(windowsSource, 'createDetachedSwarmSessionAsync', `${RUNTIME_FILE} later v0.6.82 detached new-session adapter seam`)
  assertIncludes(windowsSource, 'createDetachedSwarmWindowAsync', `${RUNTIME_FILE} later v0.6.84 detached new-window adapter seam`)
}

function assertNoGateRuntimeCutover(root) {
  const kernelSource = read(root, KERNEL_FILE)
  const goSource = read(root, GO_SOURCE_FILE)
  const windowsSource = read(root, RUNTIME_FILE)
  assertIncludes(kernelSource, 'createDetachedSwarmSessionAsync(sessionName: string, windowName: string, signal?: AbortSignal)', `${KERNEL_FILE} later v0.6.82 adapter method`)
  assertIncludes(kernelSource, "operation: 'createDetachedSwarmSession'", `${KERNEL_FILE} later v0.6.82 operation`)
  assertIncludes(kernelSource, 'workerLifecycleCreateDetachedSwarmSessionConnected', `${KERNEL_FILE} later v0.6.82 profile flag`)
  assertIncludes(windowsSource, 'createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)', `${RUNTIME_FILE} later v0.6.82 facade cutover`)
  assertIncludes(goSource, 'case "createDetachedSwarmSession"', `${GO_SOURCE_FILE} later v0.6.82 adds authorized detached new-session handler`)
  assertIncludes(goSource, 'func createDetachedSwarmSession', `${GO_SOURCE_FILE} later v0.6.82 adds authorized detached new-session implementation`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "new-session", "-d", "-s", sessionName, "-n", windowName)', `${GO_SOURCE_FILE} later v0.6.82 authorized new-session command`)
  assertIncludes(kernelSource, 'createDetachedSwarmWindowAsync(sessionName: string, windowName: string, signal?: AbortSignal)', `${KERNEL_FILE} later v0.6.84 adapter method`)
  assertIncludes(kernelSource, "operation: 'createDetachedSwarmWindow'", `${KERNEL_FILE} later v0.6.84 operation`)
  assertIncludes(kernelSource, 'workerLifecycleCreateDetachedSwarmWindowConnected', `${KERNEL_FILE} later v0.6.84 profile flag`)
  assertIncludes(windowsSource, 'createAgentTeamKernelAdapter().createDetachedSwarmWindowAsync(SWARM_SESSION, SWARM_WINDOW, signal)', `${RUNTIME_FILE} later v0.6.84 facade cutover`)
  assertIncludes(goSource, 'case "createDetachedSwarmWindow"', `${GO_SOURCE_FILE} later v0.6.84 adds authorized detached new-window handler`)
  assertIncludes(goSource, 'func createDetachedSwarmWindow', `${GO_SOURCE_FILE} later v0.6.84 adds authorized detached new-window implementation`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "new-window", "-t", sessionName, "-n", windowName)', `${GO_SOURCE_FILE} later v0.6.84 authorized new-window command`)
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

function assertCurrentGoSurfaceAndNoNewSession(root) {
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
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "new-session", "-d", "-s", sessionName, "-n", windowName)', `${GO_SOURCE_FILE} later v0.6.82 authorized detached new-session`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "new-window", "-t", sessionName, "-n", windowName)', `${GO_SOURCE_FILE} later v0.6.84 authorized detached new-window`)
  for (const forbiddenCommand of ['send-keys', 'kill-pane', 'kill-window', 'kill-session', 'respawn-pane', 'set-buffer', 'paste-buffer']) {
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
  assert.equal(typeof manifest.source.revision, 'string')
  assert.equal(provenance.source.revision, manifest.source.revision)
  assert.equal(typeof manifest.artifact.sha256, 'string')
  assert.equal(sha256(root, NATIVE_ARTIFACT_SNAPSHOT.helperPath), manifest.artifact.sha256)
  assert.equal(fs.statSync(path.join(root, ...NATIVE_ARTIFACT_SNAPSHOT.helperPath.split('/'))).size, manifest.artifact.size)
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.smoke, 'workerLifecycleCreateTeammatePane'), NATIVE_ARTIFACT_SNAPSHOT.createTeammatePaneSmokePresent)
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.smoke, 'workerLifecycleCreateDetachedSwarmSession'), true, 'later v0.6.82 cutover adds detached new-session native smoke')
  assert.deepEqual(manifest.smoke.workerLifecycleCreateDetachedSwarmSession, { ok: false, acceptedFailureKinds: ['invalid-session'] })
  assert.deepEqual(provenance.smoke.workerLifecycleCreateDetachedSwarmSession, { ok: false, acceptedFailureKinds: ['invalid-session'] })
  assert.deepEqual(manifest.smoke.workerLifecycleCreateDetachedSwarmWindow, { ok: false, acceptedFailureKinds: ['invalid-session'] })
  assert.deepEqual(provenance.smoke.workerLifecycleCreateDetachedSwarmWindow, { ok: false, acceptedFailureKinds: ['invalid-session'] })
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
  name: 'Go kernel v0.6.81 Go detached new-session gate',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertCurrentTypescriptWindowState(root)
    assertNoGateRuntimeCutover(root)
    assertV0680CreateTeammatePaneStillRecognized(root)
    assertCurrentGoSurfaceAndNoNewSession(root)
    assertNativeArtifactUnchanged(root)
    assertPackageAndReleaseGuards(root)
  },
}
