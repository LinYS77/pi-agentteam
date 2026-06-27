const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ASYNC_ABORT_POLICY,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_PANE_APP_START_WAIT_CUTOVER_SCHEMA_VERSION,
  GO_PANE_APP_START_WAIT_CUTOVER_THEME,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  OPERATION,
  PACKAGE_VERSION,
  POLLING_CADENCE,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  SHELL_COMMAND_FILTER,
  goPaneAppStartWaitCutover,
} = require('../fixtures/kernel/v0664/goPaneAppStartWaitCutover.cjs')

const DOC = 'docs/perf/v0.6.64-go-pane-app-start-wait-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0664/goPaneAppStartWaitCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0664-go-pane-app-start-wait-cutover.cjs'
const TMUX_PROCESS = 'tmux/process.ts'
const TMUX_CORE = 'tmux/core.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const HELPER = `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`
const MANIFEST = `${NATIVE_ROOT}/manifest.json`
const CHECKSUMS = `${NATIVE_ROOT}/SHA256SUMS`
const PROVENANCE = `${NATIVE_ROOT}/provenance.json`
const ATTESTATION = `${NATIVE_ROOT}/attestation.intoto.jsonl`
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.64 Go Pane App-Start Wait Cutover',
  'Result: v0.6.64 cuts over `tmux/process.ts` `waitForPaneAppStart(paneId, timeoutMs, signal)` from direct TypeScript target-based `display-message` polling to the existing Go-backed `workerLifecycle.inspectPane` async adapter path.',
  '`tmux/process.ts` now creates a kernel adapter once per wait loop and calls `kernel.inspectWorkerPaneAsync(paneId, signal)` on each poll.',
  "The TypeScript `runTmuxNoThrowAsync(['display-message', '-p', '-t', paneId, '#{pane_current_command}'], undefined, signal)` fallback is removed from `waitForPaneAppStart()`.",
  'Polling cadence is preserved as a loop with sleeps capped at 200ms between inspect calls.',
  '`SHELL_COMMANDS` remains the filter: a trimmed non-empty command not in the shell set returns `true`.',
  'Timeout, shell command, empty command, missing pane, helper failure, empty pane id, pre-aborted signal, and in-flight abort all return `false` without throwing.',
  'Go source and native helper artifacts do not change for v0.6.64 because the existing `workerLifecycle.inspectPane` contract already returns compact `currentCommand`.',
  'No target-based Go `display-message` is added.',
  'Spawn, labels, kill, window/session creation, state repository, task/report/PlanRun, team panel view-model, and release/package verification remain TypeScript-owned.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0664/goPaneAppStartWaitCutover.cjs`',
  '`tests/suites/go-kernel-v0664-go-pane-app-start-wait-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.64 Go pane app-start wait cutover',
  'docs/perf/v0.6.64-go-pane-app-start-wait-cutover.md',
  'tmux/process.ts waitForPaneAppStart(paneId, timeoutMs, signal) polls createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)',
  '`SHELL_COMMANDS` remains the shell filter and the 200ms-capped polling cadence is preserved',
  'timeout/helper failure/missing command/empty pane id/pre-aborted/in-flight aborted signals return false without throwing',
  'no Go source/native rebuild because workerLifecycle.inspectPane already returns compact currentCommand',
  '**v0.6.64 Go pane app-start wait cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'createTeammatePaneMigrated: true',
  'wakePaneMigrated: true',
  'syncPaneLabelsMigrated: true',
  'killPaneMigrated: true',
  'windowCreationMigrated: true',
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

function inspectSuccess(paneId, currentCommand) {
  return {
    ok: true,
    operation: 'inspectPane',
    capability: 'workerLifecycle',
    paneId,
    requestedPaneId: paneId,
    exists: true,
    target: 'team:@1',
    currentCommand,
    readOnly: true,
    stateFilesRead: false,
    stateFilesWritten: false,
    tmuxMutation: false,
  }
}

function inspectFailure(paneId) {
  return {
    ok: false,
    operation: 'inspectPane',
    capability: 'workerLifecycle',
    paneId,
    requestedPaneId: paneId,
    exists: false,
    status: 'unknown',
    resultMarker: 'stale',
    failureKind: 'pane-not-found',
    reason: 'compact unavailable',
    error: 'compact unavailable',
    readOnly: true,
    stateFilesRead: false,
    stateFilesWritten: false,
    tmuxMutation: false,
  }
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goPaneAppStartWaitCutover)), goPaneAppStartWaitCutover)
  assert.equal(goPaneAppStartWaitCutover.schemaVersion, GO_PANE_APP_START_WAIT_CUTOVER_SCHEMA_VERSION)
  assert.equal(goPaneAppStartWaitCutover.theme, GO_PANE_APP_START_WAIT_CUTOVER_THEME)
  assert.equal(goPaneAppStartWaitCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goPaneAppStartWaitCutover.helperVersion, HELPER_VERSION)
  assert.equal(goPaneAppStartWaitCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goPaneAppStartWaitCutover.capability, CAPABILITY)
  assert.equal(goPaneAppStartWaitCutover.operation, OPERATION)
  assert.equal(goPaneAppStartWaitCutover.facadeName, FACADE_NAME)
  assert.equal(goPaneAppStartWaitCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goPaneAppStartWaitCutover.kernelAdapterDelegation, KERNEL_ADAPTER_DELEGATION)
  assert.equal(goPaneAppStartWaitCutover.pollingCadence, POLLING_CADENCE)
  assert.equal(goPaneAppStartWaitCutover.asyncAbortPolicy, ASYNC_ABORT_POLICY)
  assert.equal(goPaneAppStartWaitCutover.shellCommandFilter, SHELL_COMMAND_FILTER)
  assert.deepEqual(goPaneAppStartWaitCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goPaneAppStartWaitCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goPaneAppStartWaitCutover.facadeCutoverMigrated, true)
  assert.equal(goPaneAppStartWaitCutover.typescriptDisplayMessageFallbackRemoved, true)
  assert.equal(goPaneAppStartWaitCutover.shellCommandFilterPreserved, true)
  assert.equal(goPaneAppStartWaitCutover.pollingLoopPreserved, true)
  assert.equal(goPaneAppStartWaitCutover.failClosedOnHelperFailure, true)
  assert.equal(goPaneAppStartWaitCutover.failClosedOnMissingCommand, true)
  assert.equal(goPaneAppStartWaitCutover.failClosedOnMissingPane, true)
  assert.equal(goPaneAppStartWaitCutover.failClosedOnEmptyPaneId, true)
  assert.equal(goPaneAppStartWaitCutover.failClosedOnAbort, true)
  assert.equal(goPaneAppStartWaitCutover.rawOutputLeakageAllowed, false)
  assert.equal(goPaneAppStartWaitCutover.targetDisplayMessageAdded, false)
  assert.equal(goPaneAppStartWaitCutover.createTeammatePaneMigrated, false)
  assert.equal(goPaneAppStartWaitCutover.wakePaneMigrated, false)
  assert.equal(goPaneAppStartWaitCutover.syncPaneLabelsMigrated, false)
  assert.equal(goPaneAppStartWaitCutover.killPaneMigrated, false)
  assert.equal(goPaneAppStartWaitCutover.windowCreationMigrated, false)
  assert.equal(goPaneAppStartWaitCutover.stateRepositoryMigrated, false)
  assert.equal(goPaneAppStartWaitCutover.taskReportPlanRunMigrated, false)
  assert.equal(goPaneAppStartWaitCutover.teamPanelViewModelMigrated, false)
  assert.equal(goPaneAppStartWaitCutover.releasePackageVerificationMigrated, false)
  assert.equal(goPaneAppStartWaitCutover.nativeArtifactRenamed, false)
  assert.equal(goPaneAppStartWaitCutover.nativeHelperRebuilt, false)
  assert.equal(goPaneAppStartWaitCutover.goSourceChanged, false)
  assert.deepEqual(goPaneAppStartWaitCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goPaneAppStartWaitCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goPaneAppStartWaitCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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

function assertFacadeSource(root) {
  const processSource = read(root, TMUX_PROCESS)
  const coreSource = read(root, TMUX_CORE)
  const kernelSource = read(root, KERNEL)
  const goSource = read(root, GO_SOURCE)
  const waitBody = functionBody(processSource, FACADE_NAME)
  const ensureBody = functionBody(coreSource, 'ensureTmuxAvailable')
  const resolveAsyncBody = functionBody(coreSource, 'resolvePaneBindingAsync')

  assertIncludes(processSource, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", TMUX_PROCESS)
  assert.equal(processSource.includes("import { runTmuxNoThrowAsync } from './client.js'"), false, `${TMUX_PROCESS} must not import tmux client`)
  assertIncludes(processSource, "import { SHELL_COMMANDS } from './core.js'", TMUX_PROCESS)
  assertIncludes(waitBody, 'const kernel = createAgentTeamKernelAdapter()', `${TMUX_PROCESS} adapter per wait loop`)
  assertIncludes(waitBody, 'kernel.inspectWorkerPaneAsync(paneId, signal)', `${TMUX_PROCESS} inspect delegation`)
  assertIncludes(waitBody, 'SHELL_COMMANDS.has(command)', `${TMUX_PROCESS} shell filter`)
  assertIncludes(waitBody, 'Math.min(200, remaining)', `${TMUX_PROCESS} polling cadence`)
  assertIncludes(waitBody, 'if (!paneId || signal?.aborted) return false', `${TMUX_PROCESS} empty/preabort fail closed`)
  assertIncludes(waitBody, 'if (signal?.aborted) return false', `${TMUX_PROCESS} in-loop abort fail closed`)
  assertIncludes(waitBody, '.catch(() => undefined)', `${TMUX_PROCESS} helper/sleep failures fail closed`)
  assert.equal(waitBody.includes('runTmuxNoThrowAsync'), false, 'waitForPaneAppStart must not call runTmuxNoThrowAsync')
  assert.equal(waitBody.includes('display-message'), false, 'waitForPaneAppStart must not call display-message directly')
  assert.equal(waitBody.includes('#{pane_current_command}'), false, 'waitForPaneAppStart must not parse tmux stdout directly')
  assert.equal(waitBody.includes('throw new Error'), false, 'waitForPaneAppStart must not throw public errors')
  assert.equal(/stdout|stderr|cwd|helperPath|MAILBOX_BODY|REPORT_BODY|worker transcript/i.test(waitBody), false, 'waitForPaneAppStart should not expose raw diagnostics')

  assertIncludes(resolveAsyncBody, 'createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)', 'resolvePaneBindingAsync v0.6.61 path remains')
  assertIncludes(ensureBody, 'createAgentTeamKernelAdapter().checkTmuxAvailableAsync(signal)', 'ensureTmuxAvailable v0.6.63 path remains')
  assertIncludes(kernelSource, 'inspectWorkerPaneAsync(paneId: string, signal?: AbortSignal): Promise<AgentTeamKernelWorkerPaneInspection>', KERNEL)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat\)/, 'inspectPane must remain global list-panes -a')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, `${GO_SOURCE} must not add target-based display-message`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
  for (const forbidden of ['PI_AGENTTEAM_HOME', 'team.json', 'agentteam_task', 'agentteam_receive', 'report_done', 'report_blocked', 'renderPanel', 'openTeamPanel', 'npm publish', 'npm version']) {
    assert.equal(goSource.includes(forbidden), false, `${GO_SOURCE} must not migrate ${forbidden}`)
  }
}

async function assertRuntimeBehavior(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const tmuxProcess = env.helpers.requireDist('tmux/process.js')
  const original = kernel.createAgentTeamKernelAdapter
  try {
    let calls = []
    const signal = new AbortController().signal
    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPaneAsync: async (paneId, receivedSignal) => {
        calls.push({ paneId, signal: receivedSignal })
        return inspectSuccess(paneId, 'node')
      },
    })
    assert.equal(await tmuxProcess.waitForPaneAppStart('%node', 1000, signal), true)
    assert.deepEqual(calls, [{ paneId: '%node', signal }])

    let shellCalls = 0
    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPaneAsync: async paneId => {
        shellCalls += 1
        return inspectSuccess(paneId, 'bash')
      },
    })
    assert.equal(await tmuxProcess.waitForPaneAppStart('%shell', 35), false)
    assert.ok(shellCalls >= 1, 'shell command should be inspected at least once')
    assert.ok(shellCalls <= 3, 'short timeout should keep polling bounded')

    let transitionCalls = 0
    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPaneAsync: async paneId => {
        transitionCalls += 1
        return inspectSuccess(paneId, transitionCalls === 1 ? 'sh' : 'pi')
      },
    })
    assert.equal(await tmuxProcess.waitForPaneAppStart('%transition', 350), true)
    assert.equal(transitionCalls, 2, 'shell command should keep polling until non-shell command appears')

    kernel.createAgentTeamKernelAdapter = () => ({ inspectWorkerPaneAsync: async paneId => inspectSuccess(paneId, '   ') })
    assert.equal(await tmuxProcess.waitForPaneAppStart('%empty-command', 20), false)

    kernel.createAgentTeamKernelAdapter = () => ({ inspectWorkerPaneAsync: async paneId => inspectFailure(paneId) })
    assert.equal(await tmuxProcess.waitForPaneAppStart('%missing', 20), false)

    kernel.createAgentTeamKernelAdapter = () => ({ inspectWorkerPaneAsync: async () => { throw new Error('RAW_STDERR_SHOULD_NOT_LEAK') } })
    assert.equal(await tmuxProcess.waitForPaneAppStart('%helper-failure', 20), false)

    let emptyPaneCalls = 0
    kernel.createAgentTeamKernelAdapter = () => ({ inspectWorkerPaneAsync: async () => { emptyPaneCalls += 1; throw new Error('empty pane id must avoid helper') } })
    assert.equal(await tmuxProcess.waitForPaneAppStart('', 100), false)
    assert.equal(emptyPaneCalls, 0)

    const preAbort = new AbortController()
    preAbort.abort()
    let preAbortCalls = 0
    kernel.createAgentTeamKernelAdapter = () => ({ inspectWorkerPaneAsync: async () => { preAbortCalls += 1; return inspectSuccess('%preabort', 'node') } })
    assert.equal(await tmuxProcess.waitForPaneAppStart('%preabort', 100, preAbort.signal), false)
    assert.equal(preAbortCalls, 0)

    const inFlightAbort = new AbortController()
    let inFlightCalls = 0
    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPaneAsync: async paneId => {
        inFlightCalls += 1
        inFlightAbort.abort()
        return inspectSuccess(paneId, 'bash')
      },
    })
    assert.equal(await tmuxProcess.waitForPaneAppStart('%inflight-abort', 1000, inFlightAbort.signal), false)
    assert.equal(inFlightCalls, 1)
  } finally {
    kernel.createAgentTeamKernelAdapter = original
  }
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
  assert.equal(exists(root, HELPER), true, `${HELPER} should remain in the existing native path`)
  assert.equal(exists(root, MANIFEST), true, `${MANIFEST} should exist`)
  assert.equal(exists(root, CHECKSUMS), true, `${CHECKSUMS} should exist`)
  assert.equal(exists(root, PROVENANCE), true, `${PROVENANCE} should exist`)
  assert.equal(exists(root, ATTESTATION), true, `${ATTESTATION} should exist`)
  const manifest = JSON.parse(read(root, MANIFEST))
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
}

module.exports = {
  name: 'Go kernel v0.6.64 Go pane app-start wait cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeSource(root)
    await assertRuntimeBehavior(env)
    assertPackageAndNativeGuards(root)
  },
}
