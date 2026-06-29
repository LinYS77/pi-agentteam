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
  CURRENT_CREATE_TEAMMATE_PANE_SURFACE,
  CURRENT_DETACHED_NEW_SESSION_SURFACE,
  CURRENT_DETACHED_NEW_WINDOW_SURFACE,
  CURRENT_KILL_PANE_SURFACE,
  CURRENT_TYPESCRIPT_CLEAR_PANE_LABEL_SYNC_SURFACE,
  EXISTING_ASYNC_CLEAR_PANE_LABEL_SURFACE,
  FORBIDDEN_SCOPE,
  FUTURE_FACADE,
  FUTURE_HELPER_NAME,
  FUTURE_INPUT_POLICY,
  FUTURE_OPERATION,
  FUTURE_PUBLIC_BEHAVIOR,
  FUTURE_REUSE_POLICY,
  GO_CLEAR_PANE_LABEL_SYNC_GATE_SCHEMA_VERSION,
  GO_CLEAR_PANE_LABEL_SYNC_GATE_THEME,
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
  TEAM_ACTIONS_FILE,
  TEAM_PANES_FILE,
  WINDOWS_FILE,
  WORKER_SPAWN_FILE,
  goClearPaneLabelSyncGate,
} = require('../fixtures/kernel/v0687/goClearPaneLabelSyncGate.cjs')

const DOC = 'docs/perf/v0.6.87-go-clear-pane-label-sync-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0687/goClearPaneLabelSyncGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0687-go-clear-pane-label-sync-gate.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_FUTURE_COMMANDS = [
  'tmux set-option -up -t <paneId> @agentteam-name',
  "tmux select-pane -t <paneId> -T ''",
]
const REQUIRED_DOC = [
  '# v0.6.87 Go clearPaneLabelSync Gate',
  'Result: v0.6.87 defines the gate-only contract for future `tmux/panes.ts clearPaneLabelSync(paneId)` Go reuse without changing runtime behavior.',
  'exactly one future candidate: replacing the two current TypeScript-owned no-throw calls in `clearPaneLabelSync(paneId)`',
  "runTmuxNoThrow(['set-option', '-up', '-t', paneId, '@agentteam-name'])",
  "runTmuxNoThrow(['select-pane', '-t', paneId, '-T', ''])",
  'No TypeScript adapter method, Go handler, `tmux/panes.ts` runtime change, native helper rebuild, or package/release action is made in this slice.',
  '`clearPaneLabelSync(paneId)` remains synchronous, TypeScript-owned, public no-throw, and `void`',
  '`killPane(paneId)` remains the v0.6.86 Go-backed synchronous no-throw facade',
  'future cutover should prefer reusing the existing Go `workerLifecycle.clearPaneLabel` operation',
  '`tmux set-option -up -t <paneId> @agentteam-name`',
  "`tmux select-pane -t <paneId> -T ''`",
  'Future Go must pass the pane id as an argv value only, never shell-interpolate it.',
  'compactly validate `paneId` as a `%123`-style tmux pane id',
  'raw tmux stdout/stderr/helper output must not leak',
  'The future public facade must preserve current synchronous no-throw/void behavior through TypeScript.',
  '`tmux/labels.ts clearPaneLabel(paneId, signal)` remains the existing v0.6.78 async Go-backed helper and is unchanged',
  '`clearPaneLabelsForTeam(...)` / `clearAndKillTeamPanes(...)` orchestration migration',
  'wake/send-keys / worker delivery',
  'kill-window / kill-session / respawn-pane / buffers / broader destructive lifecycle',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0687/goClearPaneLabelSyncGate.cjs`',
  '`tests/suites/go-kernel-v0687-go-clear-pane-label-sync-gate.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.87 Go clearPaneLabelSync gate',
  'docs/perf/v0.6.87-go-clear-pane-label-sync-gate.md',
  'candidate is only `tmux/panes.ts clearPaneLabelSync(paneId)` replacing its two direct `runTmuxNoThrow(...)` calls',
  'future cutover should reuse existing Go `workerLifecycle.clearPaneLabel` rather than add a second operation',
  'future Go may use only `tmux set-option -up -t <paneId> @agentteam-name` and `tmux select-pane -t <paneId> -T \'\'`',
  'current synchronous TypeScript no-throw/void behavior remains unchanged',
  'no runtime migration, Go handler, adapter method, native rebuild, package/release action, or artifact rename',
  '**v0.6.87 Go clearPaneLabelSync gate**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'clearPaneLabelSyncChanged: true',
  'clearPaneLabelSyncGoHandlerAdded: true',
  'clearPaneLabelSyncAdapterMethodAdded: true',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goClearPaneLabelSyncGate)), goClearPaneLabelSyncGate)
  assert.equal(goClearPaneLabelSyncGate.schemaVersion, GO_CLEAR_PANE_LABEL_SYNC_GATE_SCHEMA_VERSION)
  assert.equal(goClearPaneLabelSyncGate.theme, GO_CLEAR_PANE_LABEL_SYNC_GATE_THEME)
  assert.equal(goClearPaneLabelSyncGate.packageVersion, PACKAGE_VERSION)
  assert.equal(goClearPaneLabelSyncGate.helperVersion, HELPER_VERSION)
  assert.equal(goClearPaneLabelSyncGate.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goClearPaneLabelSyncGate.capability, CAPABILITY)
  assert.equal(goClearPaneLabelSyncGate.contractStatus, CONTRACT_STATUS)
  assert.equal(goClearPaneLabelSyncGate.futureOperation, FUTURE_OPERATION)
  assert.equal(goClearPaneLabelSyncGate.futureFacade, FUTURE_FACADE)
  assert.equal(goClearPaneLabelSyncGate.futureHelperName, FUTURE_HELPER_NAME)
  assert.equal(goClearPaneLabelSyncGate.runtimeFile, RUNTIME_FILE)
  assert.equal(goClearPaneLabelSyncGate.labelsFile, LABELS_FILE)
  assert.equal(goClearPaneLabelSyncGate.kernelFile, KERNEL_FILE)
  assert.equal(goClearPaneLabelSyncGate.goSourceFile, GO_SOURCE_FILE)
  assert.equal(goClearPaneLabelSyncGate.windowsFile, WINDOWS_FILE)
  assert.equal(goClearPaneLabelSyncGate.teamPanesFile, TEAM_PANES_FILE)
  assert.equal(goClearPaneLabelSyncGate.teamActionsFile, TEAM_ACTIONS_FILE)
  assert.equal(goClearPaneLabelSyncGate.workerSpawnFile, WORKER_SPAWN_FILE)
  assert.equal(goClearPaneLabelSyncGate.nativeRoot, NATIVE_ROOT)
  assert.deepEqual(goClearPaneLabelSyncGate.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(goClearPaneLabelSyncGate.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goClearPaneLabelSyncGate.currentTypescriptClearPaneLabelSyncSurface, CURRENT_TYPESCRIPT_CLEAR_PANE_LABEL_SYNC_SURFACE)
  assert.deepEqual(goClearPaneLabelSyncGate.existingAsyncClearPaneLabelSurface, EXISTING_ASYNC_CLEAR_PANE_LABEL_SURFACE)
  assert.deepEqual(goClearPaneLabelSyncGate.currentKillPaneSurface, CURRENT_KILL_PANE_SURFACE)
  assert.deepEqual(goClearPaneLabelSyncGate.currentCreateTeammatePaneSurface, CURRENT_CREATE_TEAMMATE_PANE_SURFACE)
  assert.deepEqual(goClearPaneLabelSyncGate.currentDetachedNewSessionSurface, CURRENT_DETACHED_NEW_SESSION_SURFACE)
  assert.deepEqual(goClearPaneLabelSyncGate.currentDetachedNewWindowSurface, CURRENT_DETACHED_NEW_WINDOW_SURFACE)
  assert.deepEqual(goClearPaneLabelSyncGate.authorizedFutureCommandSurface, [...AUTHORIZED_FUTURE_COMMAND_SURFACE])
  assert.deepEqual(goClearPaneLabelSyncGate.futureReusePolicy, FUTURE_REUSE_POLICY)
  assert.deepEqual(goClearPaneLabelSyncGate.futureInputPolicy, FUTURE_INPUT_POLICY)
  assert.deepEqual(goClearPaneLabelSyncGate.futurePublicBehavior, FUTURE_PUBLIC_BEHAVIOR)
  assert.deepEqual(goClearPaneLabelSyncGate.forbiddenScope, [...FORBIDDEN_SCOPE])
  assert.deepEqual(goClearPaneLabelSyncGate.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(goClearPaneLabelSyncGate.nativeArtifactSnapshot, NATIVE_ARTIFACT_SNAPSHOT)

  assert.equal(goClearPaneLabelSyncGate.gateOnly, true)
  assert.equal(goClearPaneLabelSyncGate.noRuntimeMigrationInThisSlice, true)
  assert.equal(goClearPaneLabelSyncGate.futureCandidateMutatesTmux, true)
  assert.equal(goClearPaneLabelSyncGate.futureCandidateDestructive, false)
  assert.equal(goClearPaneLabelSyncGate.futureReusesExistingGoOperation, true)
  assert.equal(goClearPaneLabelSyncGate.publicNoThrowVoidPreserved, true)
  assert.equal(goClearPaneLabelSyncGate.helperFailuresThrowPublicly, false)
  assert.equal(goClearPaneLabelSyncGate.clearPaneLabelSyncChanged, false)
  assert.equal(goClearPaneLabelSyncGate.clearPaneLabelSyncGoHandlerAdded, false)
  assert.equal(goClearPaneLabelSyncGate.clearPaneLabelSyncAdapterMethodAdded, false)
  assert.equal(goClearPaneLabelSyncGate.clearPaneLabelMigrated, true)
  assert.equal(goClearPaneLabelSyncGate.clearPaneLabelGoOperationAlreadyExists, true)
  assert.equal(goClearPaneLabelSyncGate.clearPaneLabelNativeSmokeAlreadyExists, true)
  assert.equal(goClearPaneLabelSyncGate.killPaneMigrated, true)
  assert.equal(goClearPaneLabelSyncGate.createTeammatePaneMigrated, true)
  assert.equal(goClearPaneLabelSyncGate.detachedNewSessionMigrated, true)
  assert.equal(goClearPaneLabelSyncGate.detachedNewWindowMigrated, true)
  assert.equal(goClearPaneLabelSyncGate.clearPaneLabelsForTeamChanged, false)
  assert.equal(goClearPaneLabelSyncGate.clearAndKillTeamPanesChanged, false)
  assert.equal(goClearPaneLabelSyncGate.teamActionsCleanupChanged, false)
  assert.equal(goClearPaneLabelSyncGate.workerSpawnPaneCleanupChanged, false)
  assert.equal(goClearPaneLabelSyncGate.wakePaneMigrated, false)
  assert.equal(goClearPaneLabelSyncGate.broaderDestructiveLifecycleMigrated, false)
  assert.equal(goClearPaneLabelSyncGate.stateRepositoryMigrated, false)
  assert.equal(goClearPaneLabelSyncGate.taskReportPlanRunMigrated, false)
  assert.equal(goClearPaneLabelSyncGate.teamPanelViewModelMigrated, false)
  assert.equal(goClearPaneLabelSyncGate.releasePackageVerificationMigrated, false)
  assert.equal(goClearPaneLabelSyncGate.nativeArtifactRenamed, false)
  assert.equal(goClearPaneLabelSyncGate.nativeHelperRebuilt, false)
  assert.equal(goClearPaneLabelSyncGate.goSourceChanged, false)
  assert.equal(goClearPaneLabelSyncGate.coreKernelChanged, false)
  assert.equal(goClearPaneLabelSyncGate.tmuxPanesRuntimeChanged, false)
  assert.equal(goClearPaneLabelSyncGate.tmuxLabelsRuntimeChanged, false)
  assert.equal(goClearPaneLabelSyncGate.tmuxWindowsRuntimeChanged, false)
  assert.equal(goClearPaneLabelSyncGate.packageVersionChanged, false)
  assert.equal(goClearPaneLabelSyncGate.packageReleaseApproved, false)

  assert.deepEqual(AUTHORIZED_FUTURE_COMMAND_SURFACE.map(command => command.rendered), EXPECTED_FUTURE_COMMANDS)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.length, 2)
  assert.deepEqual(AUTHORIZED_FUTURE_COMMAND_SURFACE.map(command => command.args), [
    ['set-option', '-up', '-t', '<paneId>', '@agentteam-name'],
    ['select-pane', '-t', '<paneId>', '-T', ''],
  ])
  for (const command of AUTHORIZED_FUTURE_COMMAND_SURFACE) {
    assert.equal(command.operation, FUTURE_OPERATION)
    assert.equal(command.futureFacade, FUTURE_FACADE)
    assert.equal(command.existingGoOperation, true)
    assert.equal(command.argvOnly, true)
    assert.equal(command.shellInterpolationAllowed, false)
    assert.equal(command.mutatesTmux, true)
    assert.equal(command.destructive, false)
  }
  assert.equal(FUTURE_REUSE_POLICY.preferExistingWorkerLifecycleClearPaneLabel, true)
  assert.equal(FUTURE_REUSE_POLICY.addingSecondGoOperationRequiresLaterJustification, true)
  assert.equal(FUTURE_REUSE_POLICY.preferredOperation, FUTURE_OPERATION)
  assert.equal(FUTURE_REUSE_POLICY.forbiddenNewOperations.includes('clearPaneLabelSync'), true)
  assert.equal(FUTURE_INPUT_POLICY.paneIdValidation.includes('%123'), true)
  assert.equal(FUTURE_INPUT_POLICY.argvOnly, true)
  assert.equal(FUTURE_INPUT_POLICY.rawTmuxOutputLeakageAllowed, false)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.preservesNoThrowVoidFacade, true)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.asyncPublicFacade, false)
  assert.equal(FUTURE_PUBLIC_BEHAVIOR.helperFailuresThrowPublicly, false)
  assert.equal(FORBIDDEN_SCOPE.includes('runtime cutover in v0.6.87'), true)
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

function assertCurrentTypescriptRuntimeState(root) {
  const panesSource = read(root, RUNTIME_FILE)
  const labelsSource = read(root, LABELS_FILE)
  const teamPanesSource = read(root, TEAM_PANES_FILE)
  const teamActionsSource = read(root, TEAM_ACTIONS_FILE)
  const workerSpawnSource = read(root, WORKER_SPAWN_FILE)
  const clearSyncBody = functionBody(panesSource, FUTURE_FACADE)
  const killBody = functionBody(panesSource, 'killPane')
  const createBody = functionBody(panesSource, 'createTeammatePane')
  const asyncClearBody = functionBody(labelsSource, 'clearPaneLabel')
  const clearAllBody = functionBody(labelsSource, 'clearPaneLabelsForTeam')

  assert.equal(panesSource.includes(CURRENT_TYPESCRIPT_CLEAR_PANE_LABEL_SYNC_SURFACE.importSurface), false, `${RUNTIME_FILE} later v0.6.88 removes runTmuxNoThrow import`)
  assertIncludes(clearSyncBody, CURRENT_TYPESCRIPT_CLEAR_PANE_LABEL_SYNC_SURFACE.signature, `${RUNTIME_FILE} clearPaneLabelSync signature`)
  assertIncludes(clearSyncBody, 'createAgentTeamKernelAdapter().clearPaneLabel(paneId)', `${RUNTIME_FILE} later v0.6.88 clearPaneLabelSync adapter cutover`)
  assert.equal(clearSyncBody.includes(CURRENT_TYPESCRIPT_CLEAR_PANE_LABEL_SYNC_SURFACE.unsetLabelCall), false, `${RUNTIME_FILE} later v0.6.88 removes clearPaneLabelSync unset fallback`)
  assert.equal(clearSyncBody.includes(CURRENT_TYPESCRIPT_CLEAR_PANE_LABEL_SYNC_SURFACE.clearTitleCall), false, `${RUNTIME_FILE} later v0.6.88 removes clearPaneLabelSync clear-title fallback`)
  assert.equal([...clearSyncBody.matchAll(/runTmuxNoThrow\(/g)].length, 0, `${RUNTIME_FILE} clearPaneLabelSync keeps no direct no-throw calls after later v0.6.88`)
  assert.equal(clearSyncBody.includes('await '), false, `${RUNTIME_FILE} clearPaneLabelSync remains synchronous`)
  assert.equal(clearSyncBody.includes('throw '), false, `${RUNTIME_FILE} clearPaneLabelSync remains no-throw`)
  assert.equal(clearSyncBody.includes('return '), false, `${RUNTIME_FILE} clearPaneLabelSync remains void/no return`)

  assertIncludes(killBody, CURRENT_KILL_PANE_SURFACE.signature, `${RUNTIME_FILE} killPane signature`)
  assertIncludes(killBody, CURRENT_KILL_PANE_SURFACE.adapterDelegation, `${RUNTIME_FILE} v0.6.86 killPane delegation`)
  assert.equal(killBody.includes(CURRENT_KILL_PANE_SURFACE.removedTypescriptFallback), false, `${RUNTIME_FILE} killPane direct fallback remains removed`)
  assertIncludes(createBody, CURRENT_CREATE_TEAMMATE_PANE_SURFACE.runtimeDelegation, `${RUNTIME_FILE} v0.6.80 createTeammatePane delegation`)

  assertIncludes(asyncClearBody, EXISTING_ASYNC_CLEAR_PANE_LABEL_SURFACE.adapterDelegation, `${LABELS_FILE} v0.6.78 async clearPaneLabel delegation`)
  assert.equal(asyncClearBody.includes("runTmuxNoThrowAsync(['set-option', '-up'"), false, `${LABELS_FILE} async clearPaneLabel must not regain TS fallback`)
  assert.equal(asyncClearBody.includes("runTmuxNoThrowAsync(['select-pane', '-t', paneId, '-T', '']"), false, `${LABELS_FILE} async clearPaneLabel must not regain TS fallback`)
  assertIncludes(clearAllBody, 'await clearPaneLabel(member.paneId, signal)', `${LABELS_FILE} clearPaneLabelsForTeam orchestration remains through private helper`)
  assert.equal(clearAllBody.includes('createAgentTeamKernelAdapter'), false, `${LABELS_FILE} clearPaneLabelsForTeam remains TS-owned orchestration`)

  assertIncludes(teamPanesSource, 'clearPaneLabelSync(options.preservePaneId)', `${TEAM_PANES_FILE} preserve-pane cleanup still calls sync helper`)
  assertIncludes(teamPanesSource, 'void clearPaneLabelsForTeam(team)', `${TEAM_PANES_FILE} async clear orchestration remains`)
  assertIncludes(teamPanesSource, 'killTeamPanes(team, options)', `${TEAM_PANES_FILE} kill orchestration remains`)
  assertIncludes(teamActionsSource, 'clearPaneLabelSync(paneId)', `${TEAM_ACTIONS_FILE} member remove preserve branch remains`)
  assertIncludes(teamActionsSource, 'clearPaneLabelSync(currentPane)', `${TEAM_ACTIONS_FILE} current pane cleanup remains`)
  assert.equal(workerSpawnSource.includes('clearPaneLabelSync'), false, `${WORKER_SPAWN_FILE} must not gain direct sync clear migration in this gate`)
}

function assertExistingGoClearOperationAndNoSyncRuntime(root) {
  const kernelSource = read(root, KERNEL_FILE)
  const goSource = read(root, GO_SOURCE_FILE)
  const windowsSource = read(root, WINDOWS_FILE)

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE_FILE} should keep active workerLifecycle operation ${operation}`)

  assertIncludes(kernelSource, EXISTING_ASYNC_CLEAR_PANE_LABEL_SURFACE.kernelAdapterMethod, `${KERNEL_FILE} existing async clear adapter method`)
  assertIncludes(kernelSource, EXISTING_ASYNC_CLEAR_PANE_LABEL_SURFACE.kernelOperation, `${KERNEL_FILE} existing clearPaneLabel operation`)
  assertIncludes(kernelSource, 'workerLifecycleClearPaneLabelConnected', `${KERNEL_FILE} existing clear profile flag`)
  assertIncludes(kernelSource, 'validatePaneLabelClearingResult', `${KERNEL_FILE} existing clear result validation`)
  assert.equal(kernelSource.includes('clearPaneLabelSync'), false, `${KERNEL_FILE} must not add sync-specific adapter surface in this gate`)

  assertIncludes(goSource, EXISTING_ASYNC_CLEAR_PANE_LABEL_SURFACE.goCase, `${GO_SOURCE_FILE} existing clearPaneLabel case`)
  assertIncludes(goSource, EXISTING_ASYNC_CLEAR_PANE_LABEL_SURFACE.goFunction, `${GO_SOURCE_FILE} existing clearPaneLabel function`)
  assertIncludes(goSource, 'workerLifecycleClearPaneLabelConnected', `${GO_SOURCE_FILE} existing clear profile flag`)
  assertIncludes(goSource, 'paneID := compactTmuxPaneID(stringParam(params, "paneId"))', `${GO_SOURCE_FILE} compact pane validation`)
  assertIncludes(goSource, EXISTING_ASYNC_CLEAR_PANE_LABEL_SURFACE.goUnsetCommand, `${GO_SOURCE_FILE} existing pane label unset command`)
  assertIncludes(goSource, EXISTING_ASYNC_CLEAR_PANE_LABEL_SURFACE.goClearTitleCommand, `${GO_SOURCE_FILE} existing pane title clear command`)
  assert.equal([...goSource.matchAll(/case "clearPaneLabel"/g)].length, 1, `${GO_SOURCE_FILE} keeps exactly one clearPaneLabel case`)
  assert.equal([...goSource.matchAll(/func clearPaneLabel\(params map\[string\]any\) workerPaneLabelClearingResult/g)].length, 1, `${GO_SOURCE_FILE} keeps exactly one clearPaneLabel function`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name"\)/g)].length, 1, `${GO_SOURCE_FILE} keeps exactly one clearPaneLabel set-option command`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "select-pane", "-t", paneID, "-T", ""\)/g)].length, 1, `${GO_SOURCE_FILE} keeps exactly one clearPaneLabel select-pane clear-title command`)
  assert.equal(goSource.includes('clearPaneLabelSync'), false, `${GO_SOURCE_FILE} must not add sync-specific clear operation`)
  assert.equal(goSource.includes('clear-pane-label-sync'), false, `${GO_SOURCE_FILE} must not add sync-specific clear handler`)

  assertIncludes(goSource, CURRENT_KILL_PANE_SURFACE.goCommand, `${GO_SOURCE_FILE} v0.6.86 killPane command remains`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "kill-pane", "-t", paneID\)/g)].length, 1, `${GO_SOURCE_FILE} keeps exactly one killPane command`)
  assertIncludes(goSource, CURRENT_CREATE_TEAMMATE_PANE_SURFACE.goCase, `${GO_SOURCE_FILE} v0.6.80 createTeammatePane case remains`)
  assertIncludes(goSource, CURRENT_CREATE_TEAMMATE_PANE_SURFACE.goSplitWindow, `${GO_SOURCE_FILE} v0.6.80 split-window remains`)
  assertIncludes(goSource, CURRENT_CREATE_TEAMMATE_PANE_SURFACE.goSelectLayout, `${GO_SOURCE_FILE} v0.6.80 select-layout remains`)
  assertIncludes(goSource, CURRENT_DETACHED_NEW_SESSION_SURFACE.goCommand, `${GO_SOURCE_FILE} v0.6.82 new-session remains`)
  assertIncludes(goSource, CURRENT_DETACHED_NEW_WINDOW_SURFACE.goCommand, `${GO_SOURCE_FILE} v0.6.84 new-window remains`)
  assert.equal(windowsSource.includes('clearPaneLabelSync'), false, `${WINDOWS_FILE} must remain unrelated to sync pane-label clearing`)
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
  assert.deepEqual(manifest.smoke.workerLifecycleClearPaneLabel, NATIVE_ARTIFACT_SNAPSHOT.clearPaneLabelSmoke)
  assert.deepEqual(provenance.smoke.workerLifecycleClearPaneLabel, NATIVE_ARTIFACT_SNAPSHOT.clearPaneLabelSmoke)
  assert.deepEqual(manifest.smoke.workerLifecycleKillPane, NATIVE_ARTIFACT_SNAPSHOT.killPaneSmoke)
  assert.deepEqual(manifest.smoke.workerLifecycleCreateTeammatePane, NATIVE_ARTIFACT_SNAPSHOT.createTeammatePaneSmoke)
  assert.deepEqual(manifest.smoke.workerLifecycleCreateDetachedSwarmSession, NATIVE_ARTIFACT_SNAPSHOT.createDetachedSwarmSessionSmoke)
  assert.deepEqual(manifest.smoke.workerLifecycleCreateDetachedSwarmWindow, NATIVE_ARTIFACT_SNAPSHOT.createDetachedSwarmWindowSmoke)
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.smoke, 'workerLifecycleClearPaneLabelSync'), false, 'v0.6.87 gate must not add a new native sync clear smoke')
  assert.equal(Object.prototype.hasOwnProperty.call(provenance.smoke, 'workerLifecycleClearPaneLabelSync'), false, 'v0.6.87 gate must not add a new provenance sync clear smoke')
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
  name: 'Go kernel v0.6.87 Go clearPaneLabelSync gate',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertCurrentTypescriptRuntimeState(root)
    assertExistingGoClearOperationAndNoSyncRuntime(root)
    assertNativeArtifactUnchanged(root)
    assertPackageAndReleaseGuards(root)
  },
}
