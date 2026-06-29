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
  CURRENT_TYPESCRIPT_CLEAR_PANE_LABEL_SYNC_SURFACE,
  CURRENT_TYPESCRIPT_KILL_PANE_SURFACE,
  CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE,
  CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE,
  CURRENT_V0684_DETACHED_NEW_WINDOW_SURFACE,
  EXISTING_GO_MUTATING_TMUX_COMMANDS,
  FORBIDDEN_FUTURE_SCOPE,
  FORBIDDEN_GO_CUTOVER_SNIPPETS,
  FORBIDDEN_RUNTIME_CUTOVER_SNIPPETS,
  FUTURE_INPUT_POLICY,
  FUTURE_OPERATION,
  FUTURE_PUBLIC_BEHAVIOR,
  GO_KILL_PANE_GATE_SCHEMA_VERSION,
  GO_KILL_PANE_GATE_THEME,
  GO_SOURCE_FILE,
  HELPER_VERSION,
  KERNEL_FILE,
  LABELS_FILE,
  NATIVE_ARTIFACT_SNAPSHOT,
  NATIVE_ROOT,
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  WINDOWS_FILE,
  goKillPaneGate,
} = require('../fixtures/kernel/v0685/goKillPaneGate.cjs')

const DOC = 'docs/perf/v0.6.85-go-kill-pane-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0685/goKillPaneGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0685-go-kill-pane-gate.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_FUTURE_COMMANDS = ['tmux kill-pane -t <paneId>']
const REQUIRED_DOC = [
  '# v0.6.85 Go Kill-Pane Gate',
  'Result: v0.6.85 defines the destructive `tmux/panes.ts killPane(paneId)` Go cutover gate without implementing runtime mutation.',
  'exactly one future candidate: replacing `runTmuxNoThrow([\'kill-pane\', \'-t\', paneId])` in `tmux/panes.ts killPane(paneId)`',
  'future `workerLifecycle.killPane` helper operation',
  'No Go handler, TypeScript adapter method, `tmux/panes.ts` cutover, native helper rebuild, or package/release action is made in this slice.',
  '`killPane(paneId)` remains TypeScript-owned, no-throw, and `void`',
  'runTmuxNoThrow([\'kill-pane\', \'-t\', paneId])',
  '`clearPaneLabelSync(paneId)` remains TypeScript-owned and unchanged',
  '`createTeammatePane(...)` remains the v0.6.80 Go-backed pane discovery/creation/layout/resize cutover and is not changed here.',
  '`createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)` remains the v0.6.82 Go-backed detached missing-session `new-session` cutover.',
  '`createAgentTeamKernelAdapter().createDetachedSwarmWindowAsync(SWARM_SESSION, SWARM_WINDOW, signal)` remains the v0.6.84 Go-backed detached missing-agentteam-window `new-window` cutover.',
  '`adapters/tmux/teamPanes.ts clearAndKillTeamPanes(...)` / `killTeamPanes(...)`',
  '`tmux kill-pane -t <paneId>`',
  'Future Go must pass the pane id as an argv value only, never shell-interpolate it.',
  'compactly validate `paneId` as a `%123`-style tmux pane id',
  'raw tmux stdout/stderr/helper output must not leak',
  'The future public facade must preserve current no-throw/void behavior through TypeScript.',
  'Helper failures should not throw publicly from `killPane(...)` unless a later gate explicitly changes the public API.',
  '`clearPaneLabelSync(paneId)` migration or deletion',
  'kill-window / kill-session / respawn-pane / buffers / broader destructive lifecycle',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0685/goKillPaneGate.cjs`',
  '`tests/suites/go-kernel-v0685-go-kill-pane-gate.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.85 Go kill-pane gate',
  'docs/perf/v0.6.85-go-kill-pane-gate.md',
  'candidate is only `tmux/panes.ts killPane(paneId)` replacing `runTmuxNoThrow([\'kill-pane\', \'-t\', paneId])`',
  'future Go may use only `tmux kill-pane -t <paneId>`',
  'compact `%123`-style pane-id validation',
  'preserve current no-throw/void public behavior through the TypeScript facade',
  '`clearPaneLabelSync(paneId)`, clear-label/team kill orchestration, wake/send-keys, kill-window/kill-session/respawn, state/task/UI/release/package remain out of scope',
  'no runtime migration, Go handler, adapter method, native rebuild, package/release action, or artifact rename',
  '**v0.6.85 Go kill-pane gate**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'killPaneMigrated: true',
  'killPaneGoHandlerAdded: true',
  'killPaneAdapterMethodAdded: true',
  'clearPaneLabelSyncChanged: true',
  'clearAndKillTeamPanesChanged: true',
  'wakePaneMigrated: true',
  'broaderDestructiveLifecycleMigrated: true',
  'stateRepositoryMigrated: true',
  'taskReportPlanRunMigrated: true',
  'teamPanelViewModelMigrated: true',
  'releasePackageVerificationMigrated: true',
  'nativeArtifactRenamed: true',
  'nativeHelperRebuilt: true',
  'goSourceChanged: true',
  'coreKernelChanged: true',
  'tmuxPanesRuntimeChanged: true',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goKillPaneGate)), goKillPaneGate)
  assert.equal(goKillPaneGate.schemaVersion, GO_KILL_PANE_GATE_SCHEMA_VERSION)
  assert.equal(goKillPaneGate.theme, GO_KILL_PANE_GATE_THEME)
  assert.equal(goKillPaneGate.packageVersion, PACKAGE_VERSION)
  assert.equal(goKillPaneGate.helperVersion, HELPER_VERSION)
  assert.equal(goKillPaneGate.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goKillPaneGate.capability, CAPABILITY)
  assert.deepEqual(goKillPaneGate.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goKillPaneGate.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goKillPaneGate.contractStatus, CONTRACT_STATUS)
  assert.equal(goKillPaneGate.futureOperation, FUTURE_OPERATION)
  assert.equal(goKillPaneGate.runtimeFile, RUNTIME_FILE)
  assert.equal(goKillPaneGate.windowsFile, WINDOWS_FILE)
  assert.equal(goKillPaneGate.labelsFile, LABELS_FILE)
  assert.equal(goKillPaneGate.kernelFile, KERNEL_FILE)
  assert.equal(goKillPaneGate.goSourceFile, GO_SOURCE_FILE)
  assert.deepEqual(goKillPaneGate.authorizedFutureMutatingCandidates, [FUTURE_OPERATION])
  assert.deepEqual(goKillPaneGate.authorizedFutureCommandSurface, [...AUTHORIZED_FUTURE_COMMAND_SURFACE])
  assert.deepEqual(goKillPaneGate.currentTypescriptKillPaneSurface, CURRENT_TYPESCRIPT_KILL_PANE_SURFACE)
  assert.deepEqual(goKillPaneGate.currentTypescriptClearPaneLabelSyncSurface, CURRENT_TYPESCRIPT_CLEAR_PANE_LABEL_SYNC_SURFACE)
  assert.deepEqual(goKillPaneGate.currentV0680CreateTeammatePaneSurface, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE)
  assert.deepEqual(goKillPaneGate.currentV0682DetachedNewSessionSurface, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE)
  assert.deepEqual(goKillPaneGate.currentV0684DetachedNewWindowSurface, CURRENT_V0684_DETACHED_NEW_WINDOW_SURFACE)
  assert.deepEqual(goKillPaneGate.existingGoMutatingTmuxCommands, [...EXISTING_GO_MUTATING_TMUX_COMMANDS])
  assert.deepEqual(goKillPaneGate.forbiddenRuntimeCutoverSnippets, [...FORBIDDEN_RUNTIME_CUTOVER_SNIPPETS])
  assert.deepEqual(goKillPaneGate.forbiddenGoCutoverSnippets, [...FORBIDDEN_GO_CUTOVER_SNIPPETS])
  assert.deepEqual(goKillPaneGate.forbiddenFutureScope, [...FORBIDDEN_FUTURE_SCOPE])
  assert.deepEqual(goKillPaneGate.futureInputPolicy, FUTURE_INPUT_POLICY)
  assert.deepEqual(goKillPaneGate.futurePublicBehavior, FUTURE_PUBLIC_BEHAVIOR)
  assert.deepEqual(goKillPaneGate.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(goKillPaneGate.nativeArtifactSnapshot, NATIVE_ARTIFACT_SNAPSHOT)

  assert.deepEqual(AUTHORIZED_FUTURE_COMMAND_SURFACE.map(command => command.rendered), EXPECTED_FUTURE_COMMANDS)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.length, 1)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE[0].command, 'kill-pane')
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE[0].operation, FUTURE_OPERATION)
  assert.deepEqual(AUTHORIZED_FUTURE_COMMAND_SURFACE[0].args, ['kill-pane', '-t', '<paneId>'])
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE[0].mutatesTmux, true)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE[0].destructive, true)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE[0].createsSession, false)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE[0].createsWindow, false)
  assert.equal(ACTIVE_OPERATIONS.includes(FUTURE_OPERATION), false, 'killPane must not be an active operation in the gate')
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.some(command => command.command === 'kill-window'), false)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.some(command => command.command === 'kill-session'), false)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.some(command => command.command === 'respawn-pane'), false)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.some(command => command.command === 'send-keys'), false)
  assert.equal(FUTURE_INPUT_POLICY.argvOnly, true)
  assert.equal(FUTURE_INPUT_POLICY.shellInterpolationAllowed, false)
  assert.equal(FUTURE_INPUT_POLICY.paneIdValidation.includes('%123'), true)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.preservesNoThrowVoidFacade, true)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.helperFailuresThrowPublicly, false)

  assert.equal(goKillPaneGate.gateOnly, true)
  assert.equal(goKillPaneGate.noRuntimeMigrationInThisSlice, true)
  assert.equal(goKillPaneGate.futureCandidateMutatesTmux, true)
  assert.equal(goKillPaneGate.futureCandidateDestructive, true)
  assert.equal(goKillPaneGate.publicNoThrowVoidPreserved, true)
  assert.equal(goKillPaneGate.helperFailuresThrowPublicly, false)
  assert.equal(goKillPaneGate.createTeammatePaneMigrated, true)
  assert.equal(goKillPaneGate.detachedNewSessionMigrated, true)
  assert.equal(goKillPaneGate.detachedNewWindowMigrated, true)
  assert.equal(goKillPaneGate.killPaneMigrated, false)
  assert.equal(goKillPaneGate.killPaneGoHandlerAdded, false)
  assert.equal(goKillPaneGate.killPaneAdapterMethodAdded, false)
  assert.equal(goKillPaneGate.clearPaneLabelSyncChanged, false)
  assert.equal(goKillPaneGate.clearPaneLabelsForTeamChanged, false)
  assert.equal(goKillPaneGate.clearAndKillTeamPanesChanged, false)
  assert.equal(goKillPaneGate.wakePaneMigrated, false)
  assert.equal(goKillPaneGate.broaderDestructiveLifecycleMigrated, false)
  assert.equal(goKillPaneGate.stateRepositoryMigrated, false)
  assert.equal(goKillPaneGate.taskReportPlanRunMigrated, false)
  assert.equal(goKillPaneGate.teamPanelViewModelMigrated, false)
  assert.equal(goKillPaneGate.releasePackageVerificationMigrated, false)
  assert.equal(goKillPaneGate.nativeArtifactRenamed, false)
  assert.equal(goKillPaneGate.nativeHelperRebuilt, false)
  assert.equal(goKillPaneGate.goSourceChanged, false)
  assert.equal(goKillPaneGate.coreKernelChanged, false)
  assert.equal(goKillPaneGate.tmuxPanesRuntimeChanged, false)
  assert.equal(goKillPaneGate.tmuxWindowsRuntimeChanged, false)
  assert.equal(goKillPaneGate.packageVersionChanged, false)
  assert.equal(goKillPaneGate.packageReleaseApproved, false)
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

function assertCurrentTypescriptPaneState(root) {
  const panesSource = read(root, RUNTIME_FILE)
  const killBody = functionBody(panesSource, 'killPane')
  const clearBody = functionBody(panesSource, 'clearPaneLabelSync')
  const createBody = functionBody(panesSource, 'createTeammatePane')

  assert.equal(panesSource.includes(CURRENT_TYPESCRIPT_KILL_PANE_SURFACE.runTmuxNoThrowImport), false, `${RUNTIME_FILE} later v0.6.88 removes runTmuxNoThrow import after clearPaneLabelSync cutover`)
  assertIncludes(killBody, CURRENT_TYPESCRIPT_KILL_PANE_SURFACE.signature, `${RUNTIME_FILE} killPane signature`)
  assertIncludes(killBody, 'createAgentTeamKernelAdapter().killPane(paneId)', `${RUNTIME_FILE} later v0.6.86 killPane adapter cutover`)
  assert.equal([...killBody.matchAll(/runTmuxNoThrow\(\['kill-pane', '-t', paneId\]\)/g)].length, 0, `${RUNTIME_FILE} later v0.6.86 removes direct no-throw kill-pane fallback`)
  assert.equal(killBody.includes('killPaneAsync'), false, `${RUNTIME_FILE} killPane remains synchronous, not async`)
  assert.equal(killBody.includes('await '), false, `${RUNTIME_FILE} killPane must remain synchronous`)
  assert.equal(killBody.includes('throw '), false, `${RUNTIME_FILE} killPane must preserve no-throw facade`)
  assert.equal(killBody.includes('return '), false, `${RUNTIME_FILE} killPane must remain void/no return value`)

  assertIncludes(clearBody, CURRENT_TYPESCRIPT_CLEAR_PANE_LABEL_SYNC_SURFACE.signature, `${RUNTIME_FILE} clearPaneLabelSync signature`)
  assertIncludes(clearBody, 'createAgentTeamKernelAdapter().clearPaneLabel(paneId)', `${RUNTIME_FILE} later v0.6.88 clearPaneLabelSync adapter cutover`)
  assert.equal(clearBody.includes(CURRENT_TYPESCRIPT_CLEAR_PANE_LABEL_SYNC_SURFACE.unsetLabelCall), false, `${RUNTIME_FILE} later v0.6.88 removes clearPaneLabelSync unset fallback`)
  assert.equal(clearBody.includes(CURRENT_TYPESCRIPT_CLEAR_PANE_LABEL_SYNC_SURFACE.clearTitleCall), false, `${RUNTIME_FILE} later v0.6.88 removes clearPaneLabelSync title clear fallback`)
  assert.equal([...clearBody.matchAll(/runTmuxNoThrow\(/g)].length, 0, `${RUNTIME_FILE} clearPaneLabelSync should not keep direct no-throw calls after later v0.6.88`)

  assertIncludes(createBody, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.runtimeDelegation, `${RUNTIME_FILE} createTeammatePane v0.6.80 delegation remains`)
  assertIncludes(createBody, 'await setPaneLabel(created.paneId, input.name, signal)', `${RUNTIME_FILE} post-create label remains`)
  assertIncludes(createBody, 'await refreshWindowPaneLabels(created.target, signal)', `${RUNTIME_FILE} post-create refresh remains`)
}

function assertNoKillPaneRuntimeCutover(root) {
  const kernelSource = read(root, KERNEL_FILE)
  const goSource = read(root, GO_SOURCE_FILE)
  const windowsSource = read(root, WINDOWS_FILE)
  const labelsSource = read(root, LABELS_FILE)

  assertIncludes(kernelSource, "operation: 'killPane'", `${KERNEL_FILE} later v0.6.86 killPane operation`)
  assertIncludes(kernelSource, 'killPane(paneId: string): AgentTeamKernelPaneKill', `${KERNEL_FILE} later v0.6.86 sync adapter method`)
  assertIncludes(goSource, 'case "killPane":', `${GO_SOURCE_FILE} later v0.6.86 killPane case`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "kill-pane", "-t", paneID)', `${GO_SOURCE_FILE} later v0.6.86 exact argv kill-pane command`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "kill-pane", "-t", paneID\)/g)].length, 1, `${GO_SOURCE_FILE} should contain exactly one authorized kill-pane command`)
  assert.equal(windowsSource.includes('kill-pane'), false, `${WINDOWS_FILE} must remain unrelated to kill-pane`)
  assert.equal(labelsSource.includes('kill-pane'), false, `${LABELS_FILE} must remain unrelated to kill-pane`)
}

function assertCurrentGoCutoversStillRecognized(root) {
  const panesSource = read(root, RUNTIME_FILE)
  const windowsSource = read(root, WINDOWS_FILE)
  const kernelSource = read(root, KERNEL_FILE)
  const goSource = read(root, GO_SOURCE_FILE)
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE_FILE} should keep active workerLifecycle operation ${operation}`)
  assert.equal(ACTIVE_OPERATIONS.includes(FUTURE_OPERATION), false, 'active operations must not include killPane')

  assertIncludes(panesSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.runtimeDelegation, `${RUNTIME_FILE} v0.6.80 runtime delegation`)
  assertIncludes(kernelSource, 'createTeammatePaneAsync(input: AgentTeamKernelCreateTeammatePaneInput, signal?: AbortSignal)', `${KERNEL_FILE} v0.6.80 adapter method`)
  assertIncludes(kernelSource, "operation: 'createTeammatePane'", `${KERNEL_FILE} v0.6.80 operation`)
  assertIncludes(kernelSource, 'workerLifecycleCreateTeammatePaneConnected', `${KERNEL_FILE} v0.6.80 profile flag`)
  assertIncludes(goSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.goCase, `${GO_SOURCE_FILE} v0.6.80 Go case`)
  assertIncludes(goSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.goFunction, `${GO_SOURCE_FILE} v0.6.80 Go function`)
  assertIncludes(goSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.goListPanes, `${GO_SOURCE_FILE} v0.6.80 list-panes`)
  assertIncludes(goSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.goSplitWindow, `${GO_SOURCE_FILE} v0.6.80 split-window`)
  assertIncludes(goSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.goSelectLayout, `${GO_SOURCE_FILE} v0.6.80 select-layout`)
  assertIncludes(goSource, CURRENT_V0680_CREATE_TEAMMATE_PANE_SURFACE.goResizePane, `${GO_SOURCE_FILE} v0.6.80 resize-pane`)
  assert.deepEqual(manifest.smoke.workerLifecycleCreateTeammatePane, NATIVE_ARTIFACT_SNAPSHOT.createTeammatePaneSmoke)

  assertIncludes(windowsSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.runtimeDelegation, `${WINDOWS_FILE} v0.6.82 runtime delegation`)
  assertIncludes(windowsSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.runtimeFailureThrow, `${WINDOWS_FILE} v0.6.82 compact failure throw`)
  assertIncludes(kernelSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.kernelAdapterMethod, `${KERNEL_FILE} v0.6.82 adapter method`)
  assertIncludes(kernelSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.kernelOperation, `${KERNEL_FILE} v0.6.82 operation`)
  assertIncludes(kernelSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.kernelProfileFlag, `${KERNEL_FILE} v0.6.82 profile flag`)
  assertIncludes(goSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.goCase, `${GO_SOURCE_FILE} v0.6.82 Go case`)
  assertIncludes(goSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.goFunction, `${GO_SOURCE_FILE} v0.6.82 Go function`)
  assertIncludes(goSource, CURRENT_V0682_DETACHED_NEW_SESSION_SURFACE.goCommand, `${GO_SOURCE_FILE} v0.6.82 argv-only new-session`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "new-session", "-d", "-s", sessionName, "-n", windowName\)/g)].length, 1, `${GO_SOURCE_FILE} should keep exactly one authorized new-session command`)
  assert.deepEqual(manifest.smoke.workerLifecycleCreateDetachedSwarmSession, NATIVE_ARTIFACT_SNAPSHOT.createDetachedSwarmSessionSmoke)

  assertIncludes(windowsSource, CURRENT_V0684_DETACHED_NEW_WINDOW_SURFACE.runtimeDelegation, `${WINDOWS_FILE} v0.6.84 runtime delegation`)
  assertIncludes(windowsSource, CURRENT_V0684_DETACHED_NEW_WINDOW_SURFACE.runtimeFailureThrow, `${WINDOWS_FILE} v0.6.84 compact failure throw`)
  assertIncludes(kernelSource, CURRENT_V0684_DETACHED_NEW_WINDOW_SURFACE.kernelAdapterMethod, `${KERNEL_FILE} v0.6.84 adapter method`)
  assertIncludes(kernelSource, CURRENT_V0684_DETACHED_NEW_WINDOW_SURFACE.kernelOperation, `${KERNEL_FILE} v0.6.84 operation`)
  assertIncludes(kernelSource, CURRENT_V0684_DETACHED_NEW_WINDOW_SURFACE.kernelProfileFlag, `${KERNEL_FILE} v0.6.84 profile flag`)
  assertIncludes(goSource, CURRENT_V0684_DETACHED_NEW_WINDOW_SURFACE.goCase, `${GO_SOURCE_FILE} v0.6.84 Go case`)
  assertIncludes(goSource, CURRENT_V0684_DETACHED_NEW_WINDOW_SURFACE.goFunction, `${GO_SOURCE_FILE} v0.6.84 Go function`)
  assertIncludes(goSource, CURRENT_V0684_DETACHED_NEW_WINDOW_SURFACE.goCommand, `${GO_SOURCE_FILE} v0.6.84 argv-only new-window`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "new-window", "-t", sessionName, "-n", windowName\)/g)].length, 1, `${GO_SOURCE_FILE} should keep exactly one authorized new-window command`)
  assert.deepEqual(manifest.smoke.workerLifecycleCreateDetachedSwarmWindow, NATIVE_ARTIFACT_SNAPSHOT.createDetachedSwarmWindowSmoke)

  for (const command of EXISTING_GO_MUTATING_TMUX_COMMANDS) {
    assert.equal(command.rendered.includes('kill-pane'), false, 'existing Go mutating command list must not already include kill-pane')
  }
}

function assertNativeArtifactCurrentAndSelfConsistent(root) {
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
  assert.deepEqual(manifest.smoke.workerLifecycleCreateTeammatePane, NATIVE_ARTIFACT_SNAPSHOT.createTeammatePaneSmoke)
  assert.deepEqual(manifest.smoke.workerLifecycleCreateDetachedSwarmSession, NATIVE_ARTIFACT_SNAPSHOT.createDetachedSwarmSessionSmoke)
  assert.deepEqual(manifest.smoke.workerLifecycleCreateDetachedSwarmWindow, NATIVE_ARTIFACT_SNAPSHOT.createDetachedSwarmWindowSmoke)
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.smoke, 'workerLifecycleKillPane'), true, 'later v0.6.86 native smoke includes killPane')
  assert.deepEqual(manifest.smoke.workerLifecycleKillPane, { ok: false, acceptedFailureKinds: ['invalid-pane-id'] })
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
  name: 'Go kernel v0.6.85 Go kill-pane gate',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertCurrentTypescriptPaneState(root)
    assertNoKillPaneRuntimeCutover(root)
    assertCurrentGoCutoversStillRecognized(root)
    assertNativeArtifactCurrentAndSelfConsistent(root)
    assertPackageAndReleaseGuards(root)
  },
}
