const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  CAPABILITY,
  COMPACT_FAILURE_ERROR,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_DETACHED_LEADER_BINDING_CUTOVER_SCHEMA_VERSION,
  GO_DETACHED_LEADER_BINDING_CUTOVER_THEME,
  GO_INSPECT_PANE_COMMAND,
  HELPER_VERSION,
  LEADER_BINDING_DELEGATION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  goDetachedLeaderBindingCutover,
} = require('../fixtures/kernel/v0668/goDetachedLeaderBindingCutover.cjs')

const DOC = 'docs/perf/v0.6.68-go-detached-leader-binding-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0668/goDetachedLeaderBindingCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0668-go-detached-leader-binding-cutover.cjs'
const TMUX_WINDOWS = 'tmux/windows.ts'
const TMUX_CORE = 'tmux/core.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const TARGET_BASED_TS_CALL = "runTmuxAsync(['display-message', '-p', '-t', leaderPaneId, '#{window_id}']"
const REQUIRED_DOC = [
  '# v0.6.68 Go Detached Leader Binding Cutover',
  'Result: v0.6.68 cuts over the `tmux/windows.ts` detached `ensureSwarmWindow()` leader target fallback from direct TypeScript target-based `display-message` to the existing Go-backed `resolvePaneBindingAsync(leaderPaneId, signal)` path.',
  '`tmux/windows.ts` keeps `const binding = await resolvePaneBindingAsync(leaderPaneId, signal)` and uses `binding?.target` as the sole detached leader target source after pane setup.',
  "The direct TypeScript `runTmuxAsync(['display-message', '-p', '-t', leaderPaneId, '#{window_id}'], undefined, signal)` fallback is removed from the detached branch.",
  'If `resolvePaneBindingAsync(leaderPaneId, signal)` cannot provide a target, `ensureSwarmWindow()` throws compact `Error(\'Failed to resolve agentteam leader pane binding\')`.',
  'Successful detached behavior still returns `{ session, window, target, leaderPaneId }` from the Go-backed binding target.',
  "Pane setup `runTmuxAsync(['list-panes', '-t', initialTarget, '-F', '#{pane_id}'], undefined, signal)` is superseded by the v0.6.69 `firstPaneInWindow(initialTarget, signal)` cutover.",
  "Post-creation `list-windows -F '#{window_id}\\t#{window_name}'` is superseded by the v0.6.70 `findWindowTargetByName()` cutover; `new-session`, `new-window`, marking, labels, kill, state/task/UI/release/package remain TypeScript-owned.",
  'No Go source or native artifact rebuild is required for this slice.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0668/goDetachedLeaderBindingCutover.cjs`',
  '`tests/suites/go-kernel-v0668-go-detached-leader-binding-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.68 Go detached leader binding cutover',
  'docs/perf/v0.6.68-go-detached-leader-binding-cutover.md',
  'tmux/windows.ts detached ensureSwarmWindow()` uses `resolvePaneBindingAsync(leaderPaneId, signal)` as the sole leader target source',
  'direct TypeScript target-based `display-message -p -t leaderPaneId #{window_id}` fallback is removed',
  'missing leader binding throws compact `Failed to resolve agentteam leader pane binding`',
  'pane setup list-panes is superseded by v0.6.69 and post-creation list-windows is superseded by v0.6.70 while new-session/new-window/marking/labels remain TypeScript-owned',
  'no Go source/native artifact rebuild',
  '**v0.6.68 Go detached leader binding cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'paneSetupMigrated: true',
  'postCreationWindowLookupMigrated: true',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goDetachedLeaderBindingCutover)), goDetachedLeaderBindingCutover)
  assert.equal(goDetachedLeaderBindingCutover.schemaVersion, GO_DETACHED_LEADER_BINDING_CUTOVER_SCHEMA_VERSION)
  assert.equal(goDetachedLeaderBindingCutover.theme, GO_DETACHED_LEADER_BINDING_CUTOVER_THEME)
  assert.equal(goDetachedLeaderBindingCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goDetachedLeaderBindingCutover.helperVersion, HELPER_VERSION)
  assert.equal(goDetachedLeaderBindingCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goDetachedLeaderBindingCutover.capability, CAPABILITY)
  assert.equal(goDetachedLeaderBindingCutover.operation, OPERATION)
  assert.equal(goDetachedLeaderBindingCutover.facadeName, FACADE_NAME)
  assert.equal(goDetachedLeaderBindingCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goDetachedLeaderBindingCutover.leaderBindingDelegation, LEADER_BINDING_DELEGATION)
  assert.equal(goDetachedLeaderBindingCutover.goInspectPaneCommand, GO_INSPECT_PANE_COMMAND)
  assert.equal(goDetachedLeaderBindingCutover.compactFailureError, COMPACT_FAILURE_ERROR)
  assert.deepEqual(goDetachedLeaderBindingCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goDetachedLeaderBindingCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goDetachedLeaderBindingCutover.facadeCutoverMigrated, true)
  assert.equal(goDetachedLeaderBindingCutover.typescriptTargetBasedDisplayMessageFallbackRemoved, true)
  assert.equal(goDetachedLeaderBindingCutover.resolvePaneBindingAsyncReused, true)
  assert.equal(goDetachedLeaderBindingCutover.failClosedThrowOnMissingLeaderBinding, true)
  assert.equal(goDetachedLeaderBindingCutover.returnedShapePreservedOnSuccess, true)
  assert.equal(goDetachedLeaderBindingCutover.rawOutputLeakageAllowed, false)
  assert.equal(goDetachedLeaderBindingCutover.insideTmuxCurrentBindingMigratedByPreviousSlice, true)
  assert.equal(goDetachedLeaderBindingCutover.paneSetupMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.postCreationWindowLookupMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.newSessionMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.newWindowMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.markWindowAsAgentTeamMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.refreshWindowPaneLabelsMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.createTeammatePaneMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.wakePaneMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.syncPaneLabelsMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.killPaneMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.stateRepositoryMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.taskReportPlanRunMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.teamPanelViewModelMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.releasePackageVerificationMigrated, false)
  assert.equal(goDetachedLeaderBindingCutover.nativeArtifactRenamed, false)
  assert.equal(goDetachedLeaderBindingCutover.nativeHelperRebuilt, false)
  assert.equal(goDetachedLeaderBindingCutover.goSourceChanged, false)
  assert.deepEqual(goDetachedLeaderBindingCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goDetachedLeaderBindingCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goDetachedLeaderBindingCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const coreSource = read(root, TMUX_CORE)
  const goSource = read(root, GO_SOURCE)
  const ensureBody = functionBody(windowsSource, FACADE_NAME)
  const resolveAsyncBody = functionBody(coreSource, 'resolvePaneBindingAsync')

  assertIncludes(ensureBody, 'firstPaneInWindow(initialTarget, signal)', 'pane setup list-panes is superseded by v0.6.69')
  assert.equal(ensureBody.includes("runTmuxAsync(['list-panes', '-t', initialTarget, '-F', '#{pane_id}']"), false, 'direct pane setup list-panes is superseded by v0.6.69')
  assertIncludes(ensureBody, LEADER_BINDING_DELEGATION, `${TMUX_WINDOWS} detached leader binding delegation`)
  assertIncludes(ensureBody, 'const target = binding?.target', `${TMUX_WINDOWS} target source`) 
  assertIncludes(ensureBody, `throw new Error('${COMPACT_FAILURE_ERROR}')`, `${TMUX_WINDOWS} compact failure`)
  assert.equal(ensureBody.includes(TARGET_BASED_TS_CALL), false, 'detached target-based display-message fallback must be removed')
  assert.equal(/runTmuxAsync\(\['display-message', '-p', '-t', leaderPaneId, '#\{window_id\}'\]/.test(ensureBody), false, 'detached target-based display-message fallback must not remain under formatting variation')
  assert.equal(ensureBody.includes('stdout'), false, 'detached leader binding path must not parse raw stdout')
  assertIncludes(ensureBody, "createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)", 'session existence remains Go-backed')
  assertIncludes(ensureBody, "runTmuxAsync(['new-session', '-d', '-s', SWARM_SESSION, '-n', SWARM_WINDOW]", 'new-session remains TS-owned')
  assertIncludes(ensureBody, "runTmuxAsync(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW]", 'new-window remains TS-owned')
  assertIncludes(ensureBody, 'findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)', 'post-creation window lookup is superseded by v0.6.70')
  assert.equal(ensureBody.includes("runTmuxAsync(['list-windows', '-t', SWARM_SESSION, '-F', '#{window_id}\\t#{window_name}']"), false, 'direct post-creation window lookup is superseded by v0.6.70')
  assertIncludes(ensureBody, 'firstPaneInWindow(initialTarget, signal)', 'pane setup first pane lookup is Go-backed by v0.6.69')
  assertIncludes(ensureBody, 'await markWindowAsAgentTeam', 'marking remains TS-owned')
  assertIncludes(ensureBody, 'await refreshWindowPaneLabels', 'label refresh remains TS-owned')
  assertIncludes(ensureBody, 'captureCurrentPaneBinding()', 'v0.6.67 inside-tmux current binding remains Go-backed')

  assertIncludes(resolveAsyncBody, 'createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)', 'resolvePaneBindingAsync remains Go-backed')
  assertIncludes(resolveAsyncBody, 'target: result.target', 'resolvePaneBindingAsync returns compact target')
  assert.equal(resolveAsyncBody.includes('display-message'), false, 'resolvePaneBindingAsync must not call display-message directly')
  assert.equal(resolveAsyncBody.includes('runTmuxNoThrowAsync(['), false, 'resolvePaneBindingAsync direct tmux fallback remains removed')

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include ${operation}`)
  assertIncludes(goSource, GO_INSPECT_PANE_COMMAND, GO_SOURCE)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat\)/, 'Go inspectPane remains target source')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, `${GO_SOURCE} must not add target-based display-message`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => !['select-pane', 'split-window', 'select-layout', 'resize-pane'].includes(command))) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} later v0.6.76 permits only narrow pane-title setPaneLabel select-pane`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} later v0.6.78 authorized pane label clearing`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} later v0.6.78 authorized pane title clearing`)
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

function assertNoNativeDiff(_root) {
  // Historical v0.6.68 made no Go/native changes; later slices such as v0.6.70 may legitimately change them.
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
    resolvePaneBindingAsync: core.resolvePaneBindingAsync,
    windowExists: core.windowExists,
    firstPaneInWindow: core.firstPaneInWindow,
    captureCurrentPaneBinding: core.captureCurrentPaneBinding,
    createAgentTeamKernelAdapter: kernel.createAgentTeamKernelAdapter,
    markWindowAsAgentTeam: labels.markWindowAsAgentTeam,
    refreshWindowPaneLabels: labels.refreshWindowPaneLabels,
  }
  const tmuxCalls = []
  const markCalls = []
  const refreshCalls = []
  Object.assign(core, patch.core || {})
  kernel.createAgentTeamKernelAdapter = () => ({
    sessionExistsAsync: async () => ({ ok: true, exists: true }),
    findAgentTeamWindowTargetAsync: async () => ({ ok: true, target: 'pi-agentteam:@7' }),
    findWindowTargetByNameAsync: async (sessionName, windowName) => ({ ok: true, exists: true, sessionName, windowName, target: `${sessionName}:@7`, windowId: '@7' }),
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
      return callback({ windows, tmuxCalls, markCalls, refreshCalls })
    })
  } finally {
    core.ensureTmuxAvailable = originals.ensureTmuxAvailable
    core.isInsideTmux = originals.isInsideTmux
    core.resolvePaneBindingAsync = originals.resolvePaneBindingAsync
    core.windowExists = originals.windowExists
    core.firstPaneInWindow = originals.firstPaneInWindow
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
  }, async ({ windows, tmuxCalls, markCalls, refreshCalls }) => {
    const result = await windows.ensureSwarmWindow()
    assert.deepEqual(result, { session: 'detached-session', window: '@7', target: 'detached-session:@7', leaderPaneId: '%leader' })
    assert.deepEqual(tmuxCalls, [], 'detached branch should not use direct pane setup list-panes after v0.6.69')
    assert.deepEqual(markCalls.map(call => call.target), ['detached-session:@7'])
    assert.deepEqual(refreshCalls.map(call => call.target), ['detached-session:@7'])
  })

  await withPatchedDetachedDeps(env, {
    core: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => false,
      firstPaneInWindow: async target => (target === 'pi-agentteam:@7' ? '%leader' : null),
      resolvePaneBindingAsync: async () => null,
    },
  }, async ({ windows, tmuxCalls }) => {
    await assert.rejects(() => windows.ensureSwarmWindow(), error => {
      assert.equal(error instanceof Error, true)
      assert.equal(error.message, COMPACT_FAILURE_ERROR)
      return true
    })
    assert.deepEqual(tmuxCalls, [], 'missing binding should not use hidden target-based display-message or pane setup list-panes fallback')
  })
}

module.exports = {
  name: 'Go kernel v0.6.68 Go detached leader binding cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeSource(root)
    assertPackageAndNativeGuards(root)
    assertNoNativeDiff(root)
    await assertDetachedRuntime(env)
  },
}
