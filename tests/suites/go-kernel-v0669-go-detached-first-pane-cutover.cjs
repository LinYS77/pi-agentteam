const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  CAPABILITY,
  COMPACT_FAILURE_ERROR,
  FACADE_NAME,
  FIRST_PANE_DELEGATION,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_DETACHED_FIRST_PANE_CUTOVER_SCHEMA_VERSION,
  GO_DETACHED_FIRST_PANE_CUTOVER_THEME,
  GO_LIST_PANES_IN_WINDOW_COMMAND,
  HELPER_VERSION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  TARGET_BINDING_DELEGATION,
  goDetachedFirstPaneCutover,
} = require('../fixtures/kernel/v0669/goDetachedFirstPaneCutover.cjs')

const DOC = 'docs/perf/v0.6.69-go-detached-first-pane-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0669/goDetachedFirstPaneCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0669-go-detached-first-pane-cutover.cjs'
const TMUX_WINDOWS = 'tmux/windows.ts'
const TMUX_CORE = 'tmux/core.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const PANE_SETUP_TS_CALL = "runTmuxAsync(['list-panes', '-t', initialTarget, '-F', '#{pane_id}']"
const REQUIRED_DOC = [
  '# v0.6.69 Go Detached First Pane Cutover',
  'Result: v0.6.69 cuts over the `tmux/windows.ts` detached `ensureSwarmWindow()` leader pane selection from direct TypeScript `list-panes` parsing to existing Go-backed `firstPaneInWindow(initialTarget, signal)`.',
  '`tmux/windows.ts` now calls `firstPaneInWindow(initialTarget, signal)` as the sole detached leader pane source after `initialTarget` is known.',
  "The direct TypeScript `runTmuxAsync(['list-panes', '-t', initialTarget, '-F', '#{pane_id}'], undefined, signal)` parsing is removed from the detached branch.",
  'If `firstPaneInWindow(initialTarget, signal)` cannot provide a pane id, `ensureSwarmWindow()` throws compact `Error(\'Failed to resolve agentteam leader pane\')`.',
  '`resolvePaneBindingAsync(leaderPaneId, signal)` remains the Go-backed target source after leader pane selection.',
  'Successful detached behavior still returns `{ session, window, target, leaderPaneId }`.',
  "Post-creation `list-windows -F '#{window_id}\\t#{window_name}'` is superseded by the v0.6.70 `findWindowTargetByName()` cutover; `new-session`, `new-window`, marking, labels, kill, state/task/UI/release/package remain TypeScript-owned.",
  'No Go source or native artifact rebuild is required for this slice.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0669/goDetachedFirstPaneCutover.cjs`',
  '`tests/suites/go-kernel-v0669-go-detached-first-pane-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.69 Go detached first pane cutover',
  'docs/perf/v0.6.69-go-detached-first-pane-cutover.md',
  'tmux/windows.ts detached ensureSwarmWindow()` uses `firstPaneInWindow(initialTarget, signal)` as the sole leader pane source',
  'direct TypeScript `list-panes -t initialTarget -F #{pane_id}` parsing is removed',
  'missing first pane throws compact `Failed to resolve agentteam leader pane`',
  'post-creation list-windows lookup is superseded by v0.6.70 while new-session/new-window/marking/labels remain TypeScript-owned',
  'no Go source/native artifact rebuild',
  '**v0.6.69 Go detached first pane cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goDetachedFirstPaneCutover)), goDetachedFirstPaneCutover)
  assert.equal(goDetachedFirstPaneCutover.schemaVersion, GO_DETACHED_FIRST_PANE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goDetachedFirstPaneCutover.theme, GO_DETACHED_FIRST_PANE_CUTOVER_THEME)
  assert.equal(goDetachedFirstPaneCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goDetachedFirstPaneCutover.helperVersion, HELPER_VERSION)
  assert.equal(goDetachedFirstPaneCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goDetachedFirstPaneCutover.capability, CAPABILITY)
  assert.equal(goDetachedFirstPaneCutover.operation, OPERATION)
  assert.equal(goDetachedFirstPaneCutover.facadeName, FACADE_NAME)
  assert.equal(goDetachedFirstPaneCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goDetachedFirstPaneCutover.firstPaneDelegation, FIRST_PANE_DELEGATION)
  assert.equal(goDetachedFirstPaneCutover.targetBindingDelegation, TARGET_BINDING_DELEGATION)
  assert.equal(goDetachedFirstPaneCutover.goListPanesInWindowCommand, GO_LIST_PANES_IN_WINDOW_COMMAND)
  assert.equal(goDetachedFirstPaneCutover.compactFailureError, COMPACT_FAILURE_ERROR)
  assert.deepEqual(goDetachedFirstPaneCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goDetachedFirstPaneCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goDetachedFirstPaneCutover.facadeCutoverMigrated, true)
  assert.equal(goDetachedFirstPaneCutover.typescriptPaneSetupListPanesFallbackRemoved, true)
  assert.equal(goDetachedFirstPaneCutover.firstPaneInWindowReused, true)
  assert.equal(goDetachedFirstPaneCutover.resolvePaneBindingAsyncReused, true)
  assert.equal(goDetachedFirstPaneCutover.failClosedThrowOnMissingFirstPane, true)
  assert.equal(goDetachedFirstPaneCutover.returnedShapePreservedOnSuccess, true)
  assert.equal(goDetachedFirstPaneCutover.rawOutputLeakageAllowed, false)
  assert.equal(goDetachedFirstPaneCutover.postCreationWindowLookupMigrated, false)
  assert.equal(goDetachedFirstPaneCutover.newSessionMigrated, false)
  assert.equal(goDetachedFirstPaneCutover.newWindowMigrated, false)
  assert.equal(goDetachedFirstPaneCutover.markWindowAsAgentTeamMigrated, false)
  assert.equal(goDetachedFirstPaneCutover.refreshWindowPaneLabelsMigrated, false)
  assert.equal(goDetachedFirstPaneCutover.createTeammatePaneMigrated, false)
  assert.equal(goDetachedFirstPaneCutover.wakePaneMigrated, false)
  assert.equal(goDetachedFirstPaneCutover.syncPaneLabelsMigrated, false)
  assert.equal(goDetachedFirstPaneCutover.killPaneMigrated, false)
  assert.equal(goDetachedFirstPaneCutover.stateRepositoryMigrated, false)
  assert.equal(goDetachedFirstPaneCutover.taskReportPlanRunMigrated, false)
  assert.equal(goDetachedFirstPaneCutover.teamPanelViewModelMigrated, false)
  assert.equal(goDetachedFirstPaneCutover.releasePackageVerificationMigrated, false)
  assert.equal(goDetachedFirstPaneCutover.nativeArtifactRenamed, false)
  assert.equal(goDetachedFirstPaneCutover.nativeHelperRebuilt, false)
  assert.equal(goDetachedFirstPaneCutover.goSourceChanged, false)
  assert.deepEqual(goDetachedFirstPaneCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goDetachedFirstPaneCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goDetachedFirstPaneCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const firstPaneBody = functionBody(coreSource, 'firstPaneInWindow')
  const resolveAsyncBody = functionBody(coreSource, 'resolvePaneBindingAsync')

  assertIncludes(ensureBody, FIRST_PANE_DELEGATION, `${TMUX_WINDOWS} detached first pane delegation`)
  assertIncludes(ensureBody, `throw new Error('${COMPACT_FAILURE_ERROR}')`, `${TMUX_WINDOWS} compact first pane failure`)
  assertIncludes(ensureBody, TARGET_BINDING_DELEGATION, `${TMUX_WINDOWS} detached target binding delegation`)
  assert.equal(ensureBody.includes(PANE_SETUP_TS_CALL), false, 'detached pane setup list-panes parsing must be removed')
  assert.equal(/runTmuxAsync\(\['list-panes', '-t', initialTarget, '-F', '#\{pane_id\}'\]/.test(ensureBody), false, 'detached pane setup list-panes parsing must not remain under formatting variation')
  assert.equal(ensureBody.includes('const panes ='), false, 'detached branch must not parse panes array directly')
  assert.equal(ensureBody.includes('.split(\'\\n\').filter(Boolean)'), false, 'detached branch must not parse pane stdout')
  assert.equal(ensureBody.includes('stdout'), false, 'detached first-pane path must not parse raw stdout')
  assertIncludes(ensureBody, "createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)", 'session existence remains Go-backed')
  assert.equal(ensureBody.includes("runTmuxAsync(['new-session', '-d', '-s', SWARM_SESSION, '-n', SWARM_WINDOW]"), false, 'later v0.6.82 removes direct detached new-session fallback')
  assertIncludes(ensureBody, "createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)", 'later v0.6.82 detached new-session cutover')
  assertIncludes(ensureBody, "runTmuxAsync(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW]", 'new-window remains TS-owned')
  assertIncludes(ensureBody, 'findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)', 'post-creation window lookup is superseded by v0.6.70')
  assert.equal(ensureBody.includes("runTmuxAsync(['list-windows', '-t', SWARM_SESSION, '-F', '#{window_id}\\t#{window_name}']"), false, 'direct post-creation window lookup is superseded by v0.6.70')
  assertIncludes(ensureBody, 'await markWindowAsAgentTeam', 'marking remains TS-owned')
  assertIncludes(ensureBody, 'await refreshWindowPaneLabels', 'label refresh remains TS-owned')
  assertIncludes(ensureBody, 'captureCurrentPaneBinding()', 'v0.6.67 inside-tmux current binding remains Go-backed')

  assertIncludes(firstPaneBody, 'createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)', 'firstPaneInWindow remains Go-backed')
  assertIncludes(firstPaneBody, 'return result.paneIds[0] ?? null', 'firstPaneInWindow returns compact first pane')
  assert.equal(firstPaneBody.includes('runTmuxNoThrowAsync(['), false, 'firstPaneInWindow direct tmux fallback remains removed')
  assertIncludes(resolveAsyncBody, 'createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)', 'resolvePaneBindingAsync remains Go-backed')
  assertIncludes(resolveAsyncBody, 'target: result.target', 'resolvePaneBindingAsync returns compact target')

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include ${operation}`)
  assertIncludes(goSource, GO_LIST_PANES_IN_WINDOW_COMMAND, GO_SOURCE)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat\)/, 'Go listPanesInWindow remains first-pane source')
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => !['select-pane', 'split-window', 'select-layout', 'resize-pane', 'new-session'].includes(command))) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
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
  // Historical v0.6.69 made no Go/native changes; later slices such as v0.6.70 may legitimately change them.
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
  }, async ({ windows, tmuxCalls, markCalls, refreshCalls }) => {
    const result = await windows.ensureSwarmWindow()
    assert.deepEqual(result, { session: 'detached-session', window: '@7', target: 'detached-session:@7', leaderPaneId: '%leader' })
    assert.deepEqual(tmuxCalls, [], 'detached first-pane cutover should not use direct TypeScript tmux calls when discovery succeeds')
    assert.deepEqual(markCalls.map(call => call.target), ['detached-session:@7'])
    assert.deepEqual(refreshCalls.map(call => call.target), ['detached-session:@7'])
  })

  await withPatchedDetachedDeps(env, {
    core: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => false,
      firstPaneInWindow: async () => null,
      resolvePaneBindingAsync: async () => { throw new Error('resolvePaneBindingAsync should not run without first pane') },
    },
  }, async ({ windows, tmuxCalls }) => {
    await assert.rejects(() => windows.ensureSwarmWindow(), error => {
      assert.equal(error instanceof Error, true)
      assert.equal(error.message, COMPACT_FAILURE_ERROR)
      return true
    })
    assert.deepEqual(tmuxCalls, [], 'missing first pane should not use hidden direct list-panes fallback')
  })
}

module.exports = {
  name: 'Go kernel v0.6.69 Go detached first pane cutover',
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
