const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ADAPTER_DELEGATION,
  CAPABILITY,
  COMPACT_FAILURE_ERROR,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_WINDOW_NAME_COMMAND,
  GO_WINDOW_NAME_LOOKUP_CUTOVER_SCHEMA_VERSION,
  GO_WINDOW_NAME_LOOKUP_CUTOVER_THEME,
  HELPER_VERSION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  WINDOW_NAME_DELEGATION,
  WINDOW_NAME_FORMAT,
  goWindowNameLookupCutover,
} = require('../fixtures/kernel/v0670/goWindowNameLookupCutover.cjs')

const DOC = 'docs/perf/v0.6.70-go-window-name-lookup-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0670/goWindowNameLookupCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0670-go-window-name-lookup-cutover.cjs'
const TMUX_WINDOWS = 'tmux/windows.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const BUILDER = 'scripts/lib/go-helper-artifact-builder.cjs'
const VERIFIER = 'scripts/lib/go-helper-artifact-verifier.cjs'
const PROTOCOL_FIXTURE = 'tests/fixtures/kernel/jsonrpc/protocolCases.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const POST_CREATION_TS_CALL = "runTmuxAsync(['list-windows', '-t', SWARM_SESSION, '-F', '#{window_id}\\t#{window_name}']"
const REQUIRED_DOC = [
  '# v0.6.70 Go Window Name Lookup Cutover',
  'Result: v0.6.70 cuts over the `tmux/windows.ts` detached `ensureSwarmWindow()` post-creation window name lookup from direct TypeScript `list-windows` parsing to a narrow Go-backed `workerLifecycle.findWindowTargetByName` operation.',
  '`tmux/windows.ts` now calls `findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)` after TypeScript-owned `new-window` succeeds.',
  '`findWindowTargetByName(sessionName, windowName, signal)` delegates to `createAgentTeamKernelAdapter().findWindowTargetByNameAsync(sessionName, windowName, signal)`.',
  "The direct TypeScript `runTmuxAsync(['list-windows', '-t', SWARM_SESSION, '-F', '#{window_id}\\t#{window_name}'], undefined, signal)` stdout parsing is removed from the post-creation detached branch.",
  'Go uses exactly `tmux list-windows -t <sessionName> -F workerLifecycleWindowNameFormat` with compact format `#{window_id}\\t#{window_name}` for `workerLifecycle.findWindowTargetByName`.',
  'A matching window returns `${sessionName}:${windowId}` as before.',
  'No matching window, missing session, helper failure, invalid response, invalid session/window name, pre-aborted signal, and in-flight abort fail closed to the existing compact `Error(\'Failed to locate agentteam tmux window after creation\')` at the facade.',
  '`new-session`, `new-window`, marking, labels, kill, state/task/UI/release/package remain TypeScript-owned.',
  '`firstPaneInWindow(initialTarget, signal)` remains the v0.6.69 Go-backed leader pane source after `initialTarget` is known.',
  '`resolvePaneBindingAsync(leaderPaneId, signal)` remains the v0.6.68 Go-backed target source after leader pane selection.',
  'Because Go source changes, the existing embedded helper is rebuilt in the same approved path with refreshed manifest, checksums, provenance, and placeholder attestation.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0670/goWindowNameLookupCutover.cjs`',
  '`tests/suites/go-kernel-v0670-go-window-name-lookup-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.70 Go window name lookup cutover',
  'docs/perf/v0.6.70-go-window-name-lookup-cutover.md',
  'tmux/windows.ts detached ensureSwarmWindow()` post-new-window lookup uses `findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)`',
  'Go `workerLifecycle.findWindowTargetByName` uses only `tmux list-windows -t <sessionName> -F workerLifecycleWindowNameFormat`',
  'direct TypeScript post-creation `list-windows -t SWARM_SESSION -F #{window_id}\\t#{window_name}` parsing is removed',
  'missing/invalid lookup throws compact `Failed to locate agentteam tmux window after creation`',
  'new-session/new-window/marking/labels remain TypeScript-owned',
  '**v0.6.70 Go window name lookup cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'newSessionMigrated: true',
  'newWindowMigrated: true',
  'markWindowAsAgentTeamMigrated: true',
  'refreshWindowPaneLabelsMigrated: true',
  'createTeammatePaneMigrated: true',
  'wakePaneMigrated: true',
  'syncPaneLabelsMigrated: true',
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

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goWindowNameLookupCutover)), goWindowNameLookupCutover)
  assert.equal(goWindowNameLookupCutover.schemaVersion, GO_WINDOW_NAME_LOOKUP_CUTOVER_SCHEMA_VERSION)
  assert.equal(goWindowNameLookupCutover.theme, GO_WINDOW_NAME_LOOKUP_CUTOVER_THEME)
  assert.equal(goWindowNameLookupCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goWindowNameLookupCutover.helperVersion, HELPER_VERSION)
  assert.equal(goWindowNameLookupCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goWindowNameLookupCutover.capability, CAPABILITY)
  assert.equal(goWindowNameLookupCutover.operation, OPERATION)
  assert.equal(goWindowNameLookupCutover.facadeName, FACADE_NAME)
  assert.equal(goWindowNameLookupCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goWindowNameLookupCutover.windowNameDelegation, WINDOW_NAME_DELEGATION)
  assert.equal(goWindowNameLookupCutover.adapterDelegation, ADAPTER_DELEGATION)
  assert.equal(goWindowNameLookupCutover.goWindowNameCommand, GO_WINDOW_NAME_COMMAND)
  assert.equal(goWindowNameLookupCutover.windowNameFormat, WINDOW_NAME_FORMAT)
  assert.equal(goWindowNameLookupCutover.compactFailureError, COMPACT_FAILURE_ERROR)
  assert.deepEqual(goWindowNameLookupCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goWindowNameLookupCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goWindowNameLookupCutover.facadeCutoverMigrated, true)
  assert.equal(goWindowNameLookupCutover.typescriptPostCreationListWindowsFallbackRemoved, true)
  assert.equal(goWindowNameLookupCutover.findWindowTargetByNameAdded, true)
  assert.equal(goWindowNameLookupCutover.failClosedThrowOnMissingWindow, true)
  assert.equal(goWindowNameLookupCutover.newWindowStillTypeScriptOwned, true)
  assert.equal(goWindowNameLookupCutover.newWindowRunsBeforeLookup, true)
  assert.equal(goWindowNameLookupCutover.firstPaneInWindowReused, true)
  assert.equal(goWindowNameLookupCutover.resolvePaneBindingAsyncReused, true)
  assert.equal(goWindowNameLookupCutover.returnedShapePreservedOnSuccess, true)
  assert.equal(goWindowNameLookupCutover.rawOutputLeakageAllowed, false)
  assert.equal(goWindowNameLookupCutover.postCreationWindowLookupMigrated, true)
  assert.equal(goWindowNameLookupCutover.newSessionMigrated, false)
  assert.equal(goWindowNameLookupCutover.newWindowMigrated, false)
  assert.equal(goWindowNameLookupCutover.markWindowAsAgentTeamMigrated, false)
  assert.equal(goWindowNameLookupCutover.refreshWindowPaneLabelsMigrated, false)
  assert.equal(goWindowNameLookupCutover.createTeammatePaneMigrated, false)
  assert.equal(goWindowNameLookupCutover.wakePaneMigrated, false)
  assert.equal(goWindowNameLookupCutover.syncPaneLabelsMigrated, false)
  assert.equal(goWindowNameLookupCutover.killPaneMigrated, false)
  assert.equal(goWindowNameLookupCutover.stateRepositoryMigrated, false)
  assert.equal(goWindowNameLookupCutover.taskReportPlanRunMigrated, false)
  assert.equal(goWindowNameLookupCutover.teamPanelViewModelMigrated, false)
  assert.equal(goWindowNameLookupCutover.releasePackageVerificationMigrated, false)
  assert.equal(goWindowNameLookupCutover.nativeArtifactRenamed, false)
  assert.equal(goWindowNameLookupCutover.nativeHelperRebuilt, true)
  assert.equal(goWindowNameLookupCutover.goSourceChanged, true)
  assert.deepEqual(goWindowNameLookupCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goWindowNameLookupCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goWindowNameLookupCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const windowsSource = read(root, TMUX_WINDOWS)
  const kernelSource = read(root, KERNEL)
  const goSource = read(root, GO_SOURCE)
  const builderSource = read(root, BUILDER)
  const verifierSource = read(root, VERIFIER)
  const protocolFixture = read(root, PROTOCOL_FIXTURE)
  const ensureBody = functionBody(windowsSource, FACADE_NAME)
  const nameLookupBody = functionBody(windowsSource, 'findWindowTargetByName')

  assertIncludes(nameLookupBody, ADAPTER_DELEGATION, `${TMUX_WINDOWS} window-name adapter delegation`)
  assertIncludes(ensureBody, WINDOW_NAME_DELEGATION, `${TMUX_WINDOWS} post-creation window-name delegation`)
  assertIncludes(ensureBody, `throw new Error('${COMPACT_FAILURE_ERROR}')`, `${TMUX_WINDOWS} compact post-creation lookup failure`)
  assert.equal(ensureBody.includes(POST_CREATION_TS_CALL), false, 'direct post-creation list-windows parsing must be removed')
  assert.equal(/runTmuxAsync\(\['list-windows', '-t', SWARM_SESSION, '-F', '#\{window_id\}\\t#\{window_name\}'\]/.test(ensureBody), false, 'post-creation list-windows parsing must not remain under formatting variation')
  assert.equal(ensureBody.includes(".split('\\n')\n      .map(line => line.split('\\t'))"), false, 'detached branch must not parse window-name stdout')
  assert.equal(ensureBody.includes('stdout'), false, 'post-creation lookup must not parse raw stdout')
  assert.equal(ensureBody.includes("runTmuxAsync(['new-session', '-d', '-s', SWARM_SESSION, '-n', SWARM_WINDOW]"), false, 'later v0.6.82 removes direct detached new-session fallback')
  assertIncludes(ensureBody, "createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)", 'later v0.6.82 detached new-session cutover')
  assertIncludes(ensureBody, "runTmuxAsync(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW]", 'new-window remains TS-owned')
  assert.ok(ensureBody.indexOf("runTmuxAsync(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW]") < ensureBody.indexOf(WINDOW_NAME_DELEGATION), 'new-window must run before Go-backed post-creation lookup')
  assertIncludes(ensureBody, 'firstPaneInWindow(initialTarget, signal)', 'v0.6.69 first-pane lookup remains Go-backed')
  assertIncludes(ensureBody, 'resolvePaneBindingAsync(leaderPaneId, signal)', 'v0.6.68 target binding remains Go-backed')
  assertIncludes(ensureBody, 'await markWindowAsAgentTeam', 'marking remains TS-owned')
  assertIncludes(ensureBody, 'await refreshWindowPaneLabels', 'label refresh remains TS-owned')
  assertIncludes(ensureBody, 'captureCurrentPaneBinding()', 'v0.6.67 inside-tmux current binding remains Go-backed')

  assertIncludes(kernelSource, 'export type AgentTeamKernelWindowNameTarget', KERNEL)
  assertIncludes(kernelSource, 'findWindowTargetByNameAsync(sessionName: string, windowName: string, signal?: AbortSignal): Promise<AgentTeamKernelWindowNameTarget>', KERNEL)
  assertIncludes(kernelSource, 'function compactTmuxWindowName', KERNEL)
  assertIncludes(kernelSource, 'function validateWindowNameTargetResult', KERNEL)
  assertIncludes(kernelSource, "callHelperAsync<unknown>('workerLifecycle', { operation: 'findWindowTargetByName', sessionName: requestedSessionName, windowName: requestedWindowName }, signal)", KERNEL)

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include ${operation}`)
  assertIncludes(goSource, 'const workerLifecycleWindowNameFormat = "#{window_id}\\t#{window_name}"', GO_SOURCE)
  assertIncludes(goSource, 'type workerWindowNameTargetResult struct', GO_SOURCE)
  assertIncludes(goSource, 'func findWindowTargetByName(params map[string]any) workerWindowNameTargetResult', GO_SOURCE)
  assertIncludes(goSource, GO_WINDOW_NAME_COMMAND, GO_SOURCE)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-windows", "-t", sessionName, "-F", workerLifecycleWindowNameFormat\)/, 'Go window-name lookup command must be exact')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-windows", "-t", sessionName, "-F", workerLifecycleAgentTeamWindowFormat\)/, 'v0.6.65 marked-window discovery remains exact')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat\)/, 'v0.6.69 first-pane source remains exact')
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => !['select-pane', 'split-window', 'select-layout', 'resize-pane', 'new-session'].includes(command))) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} later v0.6.76 permits only narrow pane-title setPaneLabel select-pane`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} later v0.6.78 authorized pane label clearing`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} later v0.6.78 authorized pane title clearing`)

  assertIncludes(builderSource, 'runWorkerLifecycleFindWindowTargetByNameSmoke', BUILDER)
  assertIncludes(builderSource, 'workerLifecycleFindWindowTargetByName', BUILDER)
  assertIncludes(verifierSource, 'workerLifecycleFindWindowTargetByName', VERIFIER)
  assertIncludes(protocolFixture, "operation: 'findWindowTargetByName'", PROTOCOL_FIXTURE)
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

function clearDistModules(env, rels) {
  for (const rel of rels) {
    const full = path.join(env.helpers.distRoot, rel)
    delete require.cache[require.resolve(full)]
  }
}

async function withPatchedDetachedDeps(env, patch, callback) {
  const corePath = path.join(env.helpers.distRoot, 'tmux/core.js')
  const kernelPath = path.join(env.helpers.distRoot, 'core/kernel.js')
  const windowsPath = path.join(env.helpers.distRoot, 'tmux/windows.js')
  const labelsPath = path.join(env.helpers.distRoot, 'tmux/labels.js')
  const clientPath = path.join(env.helpers.distRoot, 'tmux/client.js')
  clearDistModules(env, ['tmux/windows.js'])
  const core = require(corePath)
  const kernel = require(kernelPath)
  const labels = require(labelsPath)
  const client = require(clientPath)
  const originals = {
    TMUX: process.env.TMUX,
    ensureTmuxAvailable: core.ensureTmuxAvailable,
    isInsideTmux: core.isInsideTmux,
    firstPaneInWindow: core.firstPaneInWindow,
    resolvePaneBindingAsync: core.resolvePaneBindingAsync,
    windowExists: core.windowExists,
    captureCurrentPaneBinding: core.captureCurrentPaneBinding,
    createAgentTeamKernelAdapter: kernel.createAgentTeamKernelAdapter,
    markWindowAsAgentTeam: labels.markWindowAsAgentTeam,
    refreshWindowPaneLabels: labels.refreshWindowPaneLabels,
  }
  const tmuxCalls = []
  const markCalls = []
  const refreshCalls = []
  const adapterCalls = []
  Object.assign(core, patch.core || {})
  kernel.createAgentTeamKernelAdapter = () => ({
    sessionExistsAsync: async () => ({ ok: true, exists: true }),
    findAgentTeamWindowTargetAsync: async () => ({ ok: false, exists: false }),
    findWindowTargetByNameAsync: async (sessionName, windowName, signal) => {
      adapterCalls.push({ operation: 'findWindowTargetByName', sessionName, windowName, signal })
      return { ok: true, exists: true, sessionName, windowName, target: `${sessionName}:@7`, windowId: '@7' }
    },
    ...(patch.kernelAdapter || {}),
  })
  labels.markWindowAsAgentTeam = async (target, signal) => { markCalls.push({ target, signal }) }
  labels.refreshWindowPaneLabels = async (target, signal) => { refreshCalls.push({ target, signal }) }
  const fakeClient = {
    exec() { throw new Error('sync tmux should not be used') },
    execNoThrow() { return { ok: false, stdout: '', stderr: 'sync tmux should not be used' } },
    async execAsync(args) {
      tmuxCalls.push(args)
      if (args[0] === 'new-session' || args[0] === 'new-window') return ''
      throw new Error(`unexpected direct tmux call: ${args.join(' ')}`)
    },
    async execNoThrowAsync(args) {
      tmuxCalls.push(args)
      return { ok: false, stdout: '', stderr: `unexpected direct tmux call: ${args.join(' ')}` }
    },
  }
  try {
    delete process.env.TMUX
    return await client.withTmuxClientForTests(fakeClient, async () => {
      clearDistModules(env, ['tmux/windows.js'])
      const windows = require(windowsPath)
      return callback({ windows, tmuxCalls, markCalls, refreshCalls, adapterCalls })
    })
  } finally {
    core.ensureTmuxAvailable = originals.ensureTmuxAvailable
    core.isInsideTmux = originals.isInsideTmux
    core.firstPaneInWindow = originals.firstPaneInWindow
    core.resolvePaneBindingAsync = originals.resolvePaneBindingAsync
    core.windowExists = originals.windowExists
    core.captureCurrentPaneBinding = originals.captureCurrentPaneBinding
    kernel.createAgentTeamKernelAdapter = originals.createAgentTeamKernelAdapter
    labels.markWindowAsAgentTeam = originals.markWindowAsAgentTeam
    labels.refreshWindowPaneLabels = originals.refreshWindowPaneLabels
    if (originals.TMUX === undefined) delete process.env.TMUX
    else process.env.TMUX = originals.TMUX
    delete require.cache[require.resolve(windowsPath)]
  }
}

async function assertDetachedRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return

  await withPatchedDetachedDeps(env, {
    core: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => false,
      firstPaneInWindow: async target => (target === 'pi-agentteam:@7' ? '%leader' : null),
      resolvePaneBindingAsync: async paneId => ({ paneId, target: 'detached-session:@7' }),
    },
  }, async ({ windows, tmuxCalls, markCalls, refreshCalls, adapterCalls }) => {
    const result = await windows.ensureSwarmWindow()
    assert.deepEqual(result, { session: 'detached-session', window: '@7', target: 'detached-session:@7', leaderPaneId: '%leader' })
    assert.deepEqual(tmuxCalls, [['new-window', '-t', 'pi-agentteam', '-n', 'agentteam']], 'detached post-creation path should only keep TS-owned new-window direct tmux call')
    assert.deepEqual(adapterCalls.map(call => ({ operation: call.operation, sessionName: call.sessionName, windowName: call.windowName })), [{ operation: 'findWindowTargetByName', sessionName: 'pi-agentteam', windowName: 'agentteam' }])
    assert.deepEqual(markCalls.map(call => call.target), ['pi-agentteam:@7', 'detached-session:@7'])
    assert.deepEqual(refreshCalls.map(call => call.target), ['detached-session:@7'])
  })

  await withPatchedDetachedDeps(env, {
    core: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => false,
      firstPaneInWindow: async () => { throw new Error('firstPaneInWindow should not run without post-creation target') },
      resolvePaneBindingAsync: async () => { throw new Error('resolvePaneBindingAsync should not run without post-creation target') },
    },
    kernelAdapter: {
      findWindowTargetByNameAsync: async () => ({ ok: false, exists: false, failureKind: 'pane-not-found' }),
    },
  }, async ({ windows, tmuxCalls }) => {
    await assert.rejects(() => windows.ensureSwarmWindow(), error => {
      assert.equal(error instanceof Error, true)
      assert.equal(error.message, COMPACT_FAILURE_ERROR)
      return true
    })
    assert.deepEqual(tmuxCalls, [['new-window', '-t', 'pi-agentteam', '-n', 'agentteam']], 'missing post-creation window should not use hidden direct list-windows fallback')
  })
}

function runGoHelper(root, request, env) {
  return spawnSync('go', ['run', './kernel/go/agentteam-kernel'], {
    cwd: root,
    input: `${JSON.stringify(request)}\n`,
    encoding: 'utf8',
    env: { ...process.env, ...env, GO111MODULE: 'off' },
    timeout: 10_000,
  })
}

function writeFakeTmux(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0670-tmux-'))
  const file = path.join(dir, 'tmux')
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return dir
}

function assertGoRuntime(root) {
  const fakeTmuxRoot = writeFakeTmux(`#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === 'list-windows' && args[1] === '-t' && args[3] === '-F' && args[4] === '#{window_id}\\t#{window_name}') {
  const session = args[2]
  if (session === 'team') process.stdout.write('@5\\tother\\n@7\\tagentteam\\n')
  else if (session === 'empty') process.stdout.write('@5\\tother\\n')
  else process.exit(5)
} else {
  process.exit(7)
}
`)
  const env = { PATH: `${fakeTmuxRoot}${path.delimiter}${process.env.PATH || ''}`, TMUX: '/tmp/agentteam-v0670-fake-socket', TMUX_PANE: '%current' }
  const success = runGoHelper(root, { jsonrpc: '2.0', id: 'window-name', method: 'workerLifecycle', params: { operation: 'findWindowTargetByName', sessionName: 'team', windowName: 'agentteam' } }, env)
  assert.equal(success.status, 0, success.stderr)
  const successResponse = JSON.parse(success.stdout.trim())
  assert.equal(successResponse.result.ok, true)
  assert.equal(successResponse.result.operation, 'findWindowTargetByName')
  assert.equal(successResponse.result.sessionName, 'team')
  assert.equal(successResponse.result.windowName, 'agentteam')
  assert.equal(successResponse.result.target, 'team:@7')
  assert.equal(successResponse.result.windowId, '@7')
  assert.equal(successResponse.result.readOnly, true)
  assert.equal(successResponse.result.tmuxMutation, false)

  const missing = runGoHelper(root, { jsonrpc: '2.0', id: 'window-missing', method: 'workerLifecycle', params: { operation: 'findWindowTargetByName', sessionName: 'empty', windowName: 'agentteam' } }, env)
  const missingResponse = JSON.parse(missing.stdout.trim())
  assert.equal(missingResponse.result.ok, false)
  assert.equal(missingResponse.result.exists, false)
  assert.equal(missingResponse.result.failureKind, 'pane-not-found')
  assert.equal(/stdout|stderr|stack|MAILBOX_BODY|REPORT_BODY|worker transcript/i.test(JSON.stringify(missingResponse.result)), false)

  const invalid = runGoHelper(root, { jsonrpc: '2.0', id: 'window-invalid', method: 'workerLifecycle', params: { operation: 'findWindowTargetByName', sessionName: 'bad session', windowName: 'agentteam' } }, env)
  const invalidResponse = JSON.parse(invalid.stdout.trim())
  assert.equal(invalidResponse.result.ok, false)
  assert.equal(invalidResponse.result.failureKind, 'invalid-session')
}

module.exports = {
  name: 'Go kernel v0.6.70 Go window name lookup cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeSource(root)
    assertPackageAndNativeGuards(root)
    await assertDetachedRuntime(env)
    assertGoRuntime(root)
  },
}
