const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  CAPABILITY,
  COMPACT_FAILURE_ERROR,
  CURRENT_BINDING_DELEGATION,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_CURRENT_BINDING_WINDOW_FALLBACK_CUTOVER_SCHEMA_VERSION,
  GO_CURRENT_BINDING_WINDOW_FALLBACK_CUTOVER_THEME,
  GO_CURRENT_PANE_COMMAND,
  GO_CURRENT_PANE_FORMAT,
  HELPER_VERSION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  goCurrentBindingWindowFallbackCutover,
} = require('../fixtures/kernel/v0667/goCurrentBindingWindowFallbackCutover.cjs')

const DOC = 'docs/perf/v0.6.67-go-current-binding-window-fallback-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0667/goCurrentBindingWindowFallbackCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0667-go-current-binding-window-fallback-cutover.cjs'
const TMUX_WINDOWS = 'tmux/windows.ts'
const TMUX_CORE = 'tmux/core.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const CURRENT_TARGET_TS_CALL = "runTmuxAsync(['display-message', '-p', '#{session_name}:#{window_id}']"
const CURRENT_PANE_TS_CALL = "runTmuxAsync(['display-message', '-p', '#{pane_id}']"
const TARGET_BASED_DETACHED_CALL = "runTmuxAsync(['display-message', '-p', '-t', leaderPaneId, '#{window_id}']"
const REQUIRED_DOC = [
  '# v0.6.67 Go Current Binding Window Fallback Cutover',
  'Result: v0.6.67 cuts over the `tmux/windows.ts` `ensureSwarmWindow()` inside-tmux current target/current pane fallbacks from direct TypeScript `display-message` calls to the existing Go-backed `captureCurrentPaneBinding()` seam.',
  '`tmux/windows.ts` imports and calls `captureCurrentPaneBinding()` for the inside-tmux current binding fallback.',
  "The direct TypeScript `runTmuxAsync(['display-message', '-p', '#{session_name}:#{window_id}'], undefined, signal)` current target fallback is removed from the inside-tmux branch.",
  "The direct TypeScript `runTmuxAsync(['display-message', '-p', '#{pane_id}'], undefined, signal)` current pane id fallback is removed from the inside-tmux branch.",
  'Preferred leader pane binding still wins first; preferred target still wins when `windowExists(preferred.target, signal)` confirms it; `firstPaneInWindow(target, signal)` still chooses the leader pane when a target is known.',
  'If no preferred binding, preferred target, or first-pane lookup can provide the needed values and `captureCurrentPaneBinding()` returns `null`, `ensureSwarmWindow()` throws compact `Error(\'Failed to resolve current tmux pane binding\')`.',
  '`tmux/core.ts` `captureCurrentPaneBinding()` remains the v0.6.60 Go-backed facade over `workerLifecycle.captureCurrentPaneBinding`.',
  "The detached setup fallback `runTmuxAsync(['display-message', '-p', '-t', leaderPaneId, '#{window_id}'], undefined, signal)` is superseded by the v0.6.68 `resolvePaneBindingAsync(leaderPaneId, signal)` cutover.",
  "`new-session`, `new-window`, marking, labels, kill, state/task/UI/release/package remain TypeScript-owned; pane setup `list-panes` is superseded by the v0.6.69 `firstPaneInWindow()` reuse cutover, and post-creation `list-windows -F '#{window_id}\\t#{window_name}'` is superseded by the v0.6.70 `findWindowTargetByName()` cutover.",
  'No Go source or native artifact rebuild is required for this slice.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0667/goCurrentBindingWindowFallbackCutover.cjs`',
  '`tests/suites/go-kernel-v0667-go-current-binding-window-fallback-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.67 Go current binding window fallback cutover',
  'docs/perf/v0.6.67-go-current-binding-window-fallback-cutover.md',
  'tmux/windows.ts ensureSwarmWindow()` inside-tmux branch reuses `captureCurrentPaneBinding()`',
  'direct TypeScript current target `display-message -p #{session_name}:#{window_id}` fallback is removed',
  'direct TypeScript current pane `display-message -p #{pane_id}` fallback is removed',
  'missing current binding throws compact `Failed to resolve current tmux pane binding` only when no preferred/first-pane equivalent can provide values',
  'target-based detached `display-message -p -t leaderPaneId #{window_id}` fallback is superseded by v0.6.68',
  'no Go source/native artifact rebuild',
  '**v0.6.67 Go current binding window fallback cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'targetBasedLeaderPaneWindowIdFallbackMigrated: true',
  'postCreationWindowLookupMigrated: true',
  'paneSetupMigrated: true',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goCurrentBindingWindowFallbackCutover)), goCurrentBindingWindowFallbackCutover)
  assert.equal(goCurrentBindingWindowFallbackCutover.schemaVersion, GO_CURRENT_BINDING_WINDOW_FALLBACK_CUTOVER_SCHEMA_VERSION)
  assert.equal(goCurrentBindingWindowFallbackCutover.theme, GO_CURRENT_BINDING_WINDOW_FALLBACK_CUTOVER_THEME)
  assert.equal(goCurrentBindingWindowFallbackCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goCurrentBindingWindowFallbackCutover.helperVersion, HELPER_VERSION)
  assert.equal(goCurrentBindingWindowFallbackCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goCurrentBindingWindowFallbackCutover.capability, CAPABILITY)
  assert.equal(goCurrentBindingWindowFallbackCutover.operation, OPERATION)
  assert.equal(goCurrentBindingWindowFallbackCutover.facadeName, FACADE_NAME)
  assert.equal(goCurrentBindingWindowFallbackCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goCurrentBindingWindowFallbackCutover.currentBindingDelegation, CURRENT_BINDING_DELEGATION)
  assert.equal(goCurrentBindingWindowFallbackCutover.goCurrentPaneFormat, GO_CURRENT_PANE_FORMAT)
  assert.equal(goCurrentBindingWindowFallbackCutover.goCurrentPaneCommand, GO_CURRENT_PANE_COMMAND)
  assert.equal(goCurrentBindingWindowFallbackCutover.compactFailureError, COMPACT_FAILURE_ERROR)
  assert.deepEqual(goCurrentBindingWindowFallbackCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goCurrentBindingWindowFallbackCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goCurrentBindingWindowFallbackCutover.facadeCutoverMigrated, true)
  assert.equal(goCurrentBindingWindowFallbackCutover.typescriptCurrentTargetDisplayMessageFallbackRemoved, true)
  assert.equal(goCurrentBindingWindowFallbackCutover.typescriptCurrentPaneDisplayMessageFallbackRemoved, true)
  assert.equal(goCurrentBindingWindowFallbackCutover.captureCurrentPaneBindingReused, true)
  assert.equal(goCurrentBindingWindowFallbackCutover.preferredBindingPreserved, true)
  assert.equal(goCurrentBindingWindowFallbackCutover.preferredTargetPreserved, true)
  assert.equal(goCurrentBindingWindowFallbackCutover.firstPaneInWindowPreserved, true)
  assert.equal(goCurrentBindingWindowFallbackCutover.failClosedThrowOnMissingCurrentBinding, true)
  assert.equal(goCurrentBindingWindowFallbackCutover.rawOutputLeakageAllowed, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.targetBasedLeaderPaneWindowIdFallbackMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.postCreationWindowLookupMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.paneSetupMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.newSessionMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.newWindowMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.markWindowAsAgentTeamMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.refreshWindowPaneLabelsMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.createTeammatePaneMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.wakePaneMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.syncPaneLabelsMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.killPaneMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.stateRepositoryMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.taskReportPlanRunMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.teamPanelViewModelMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.releasePackageVerificationMigrated, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.nativeArtifactRenamed, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.nativeHelperRebuilt, false)
  assert.equal(goCurrentBindingWindowFallbackCutover.goSourceChanged, false)
  assert.deepEqual(goCurrentBindingWindowFallbackCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goCurrentBindingWindowFallbackCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goCurrentBindingWindowFallbackCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const captureBody = functionBody(coreSource, 'captureCurrentPaneBinding')

  assertIncludes(windowsSource, 'captureCurrentPaneBinding,', `${TMUX_WINDOWS} import`)
  assertIncludes(ensureBody, CURRENT_BINDING_DELEGATION, `${TMUX_WINDOWS} current binding fallback`)
  assertIncludes(ensureBody, 'const getCurrentBinding = ()', `${TMUX_WINDOWS} lazy current binding lookup`)
  assertIncludes(ensureBody, 'const target = preferredTarget ?? getCurrentBinding()?.target', `${TMUX_WINDOWS} target fallback`) 
  assertIncludes(ensureBody, 'await firstPaneInWindow(target, signal) ?? getCurrentBinding()?.paneId', `${TMUX_WINDOWS} leader pane fallback`)
  assertIncludes(ensureBody, `throw new Error('${COMPACT_FAILURE_ERROR}')`, `${TMUX_WINDOWS} compact failure`)
  assertIncludes(ensureBody, 'const preferredBinding = preferred?.leaderPaneId ? await resolvePaneBindingAsync(preferred.leaderPaneId, signal) : null', 'preferred binding preserved')
  assertIncludes(ensureBody, 'preferred?.target && await windowExists(preferred.target, signal) ? preferred.target : null', 'preferred target preserved')
  assert.equal(ensureBody.includes(CURRENT_TARGET_TS_CALL), false, 'inside-tmux current target direct display-message fallback must be removed')
  assert.equal(ensureBody.includes(CURRENT_PANE_TS_CALL), false, 'inside-tmux current pane direct display-message fallback must be removed')
  assert.equal(/runTmuxAsync\(\['display-message', '-p', '#\{session_name\}:#\{window_id\}'\]/.test(ensureBody), false, 'inside-tmux current target fallback must not remain under formatting variation')
  assert.equal(/runTmuxAsync\(\['display-message', '-p', '#\{pane_id\}'\]/.test(ensureBody), false, 'inside-tmux current pane fallback must not remain under formatting variation')
  assert.equal(ensureBody.includes('stdout'), false, 'inside-tmux current binding path must not parse raw stdout')
  assertIncludes(ensureBody, 'resolvePaneBindingAsync(leaderPaneId, signal)', 'detached leader binding is superseded by v0.6.68')
  assert.equal(ensureBody.includes(TARGET_BASED_DETACHED_CALL), false, 'detached target-based display-message fallback is superseded by v0.6.68')
  assertIncludes(ensureBody, "runTmuxAsync(['new-session', '-d', '-s', SWARM_SESSION, '-n', SWARM_WINDOW]", 'new-session remains TS-owned')
  assertIncludes(ensureBody, "runTmuxAsync(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW]", 'new-window remains TS-owned')
  assertIncludes(ensureBody, 'findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)', 'post-creation window lookup is superseded by v0.6.70')
  assert.equal(ensureBody.includes("runTmuxAsync(['list-windows', '-t', SWARM_SESSION, '-F', '#{window_id}\\t#{window_name}']"), false, 'direct post-creation window lookup is superseded by v0.6.70')
  assertIncludes(ensureBody, 'firstPaneInWindow(initialTarget, signal)', 'pane setup first-pane lookup is superseded by v0.6.69')
  assert.equal(ensureBody.includes("runTmuxAsync(['list-panes', '-t', initialTarget, '-F', '#{pane_id}']"), false, 'direct pane setup list-panes is superseded by v0.6.69')
  assertIncludes(ensureBody, 'await markWindowAsAgentTeam', 'marking remains TS-owned')
  assertIncludes(ensureBody, 'await refreshWindowPaneLabels', 'label refresh remains TS-owned')

  assertIncludes(captureBody, 'createAgentTeamKernelAdapter().captureCurrentPaneBinding()', 'current binding facade remains Go-backed')
  assertIncludes(captureBody, 'if (!isInsideTmux()) return null', 'current binding facade outside tmux guard')
  assert.equal(captureBody.includes('runTmuxNoThrow(['), false, 'captureCurrentPaneBinding must not regain TS tmux fallback')

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include ${operation}`)
  assertIncludes(goSource, 'const workerLifecycleCurrentPaneBindingFormat = "#{pane_id}\\t#{session_name}:#{window_id}"', GO_SOURCE)
  assertIncludes(goSource, GO_CURRENT_PANE_COMMAND, GO_SOURCE)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'Go current binding command remains compact single no-target display-message')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, `${GO_SOURCE} must not add target-based display-message`)
  assert.equal(/"display-message",\s*"-p",\s*"#\{pane_id\}"/.test(goSource), false, 'Go must not split current pane id into separate display-message calls')
  assert.equal(/"display-message",\s*"-p",\s*"#\{session_name\}:#\{window_id\}"/.test(goSource), false, 'Go must not split current target into separate display-message calls')
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => command !== 'select-pane')) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
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
  // Historical v0.6.67 made no Go/native changes; later slices such as v0.6.70 may legitimately change them.
}

function clearDistModules(env, rels) {
  for (const rel of rels) {
    const full = path.join(env.helpers.distRoot, rel)
    delete require.cache[require.resolve(full)]
  }
}

async function withPatchedCore(env, patch, callback) {
  const corePath = path.join(env.helpers.distRoot, 'tmux/core.js')
  const windowsPath = path.join(env.helpers.distRoot, 'tmux/windows.js')
  const labelsPath = path.join(env.helpers.distRoot, 'tmux/labels.js')
  const clientPath = path.join(env.helpers.distRoot, 'tmux/client.js')
  clearDistModules(env, ['tmux/windows.js'])
  const core = require(corePath)
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
    markWindowAsAgentTeam: labels.markWindowAsAgentTeam,
    refreshWindowPaneLabels: labels.refreshWindowPaneLabels,
  }
  const tmuxCalls = []
  const markCalls = []
  const refreshCalls = []
  Object.assign(core, patch.core || {})
  labels.markWindowAsAgentTeam = async (target, signal) => { markCalls.push({ target, signal }) }
  labels.refreshWindowPaneLabels = async (target, signal) => { refreshCalls.push({ target, signal }) }
  const fakeClient = {
    exec() { throw new Error('sync tmux should not be used') },
    execNoThrow() { return { ok: false, stdout: '', stderr: 'sync tmux should not be used' } },
    async execAsync(args) {
      tmuxCalls.push(args)
      throw new Error(`unexpected direct tmux call: ${args.join(' ')}`)
    },
    async execNoThrowAsync(args) {
      tmuxCalls.push(args)
      return { ok: false, stdout: '', stderr: `unexpected direct tmux call: ${args.join(' ')}` }
    },
  }
  try {
    process.env.TMUX = '/tmp/agentteam-v0667-tmux'
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
    labels.markWindowAsAgentTeam = originals.markWindowAsAgentTeam
    labels.refreshWindowPaneLabels = originals.refreshWindowPaneLabels
    if (originals.TMUX === undefined) delete process.env.TMUX
    else process.env.TMUX = originals.TMUX
    delete require.cache[require.resolve(windowsPath)]
  }
}

async function assertInsideTmuxRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return

  let captureCalls = 0
  await withPatchedCore(env, {
    core: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => true,
      resolvePaneBindingAsync: async () => null,
      windowExists: async () => false,
      firstPaneInWindow: async () => null,
      captureCurrentPaneBinding: () => {
        captureCalls += 1
        return { paneId: '%current', target: 'current-session:@7' }
      },
    },
  }, async ({ windows, tmuxCalls, markCalls, refreshCalls }) => {
    const result = await windows.ensureSwarmWindow()
    assert.deepEqual(result, { session: 'current-session', window: '@7', target: 'current-session:@7', leaderPaneId: '%current' })
    assert.equal(captureCalls, 1, 'current binding should be captured once and reused')
    assert.deepEqual(tmuxCalls, [], 'inside-tmux current binding fallback should not use direct TypeScript tmux calls')
    assert.deepEqual(markCalls.map(call => call.target), ['current-session:@7'])
    assert.deepEqual(refreshCalls.map(call => call.target), ['current-session:@7'])
  })

  captureCalls = 0
  await withPatchedCore(env, {
    core: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => true,
      resolvePaneBindingAsync: async paneId => ({ paneId, target: 'preferred-session:@3' }),
      windowExists: async () => false,
      firstPaneInWindow: async () => { throw new Error('firstPaneInWindow should not be needed for preferred binding') },
      captureCurrentPaneBinding: () => {
        captureCalls += 1
        return { paneId: '%current', target: 'current-session:@7' }
      },
    },
  }, async ({ windows, tmuxCalls }) => {
    const result = await windows.ensureSwarmWindow({ leaderPaneId: '%preferred' })
    assert.deepEqual(result, { session: 'preferred-session', window: '@3', target: 'preferred-session:@3', leaderPaneId: '%preferred' })
    assert.equal(captureCalls, 0, 'preferred binding should avoid current binding lookup')
    assert.deepEqual(tmuxCalls, [], 'preferred binding path should not use direct TypeScript tmux calls')
  })

  await withPatchedCore(env, {
    core: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => true,
      resolvePaneBindingAsync: async () => null,
      windowExists: async target => target === 'preferred-session:@9',
      firstPaneInWindow: async target => (target === 'preferred-session:@9' ? '%first' : null),
      captureCurrentPaneBinding: () => null,
    },
  }, async ({ windows, tmuxCalls }) => {
    const result = await windows.ensureSwarmWindow({ target: 'preferred-session:@9' })
    assert.deepEqual(result, { session: 'preferred-session', window: '@9', target: 'preferred-session:@9', leaderPaneId: '%first' })
    assert.deepEqual(tmuxCalls, [], 'preferred target/first-pane path should not use direct TypeScript tmux calls')
  })

  await withPatchedCore(env, {
    core: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => true,
      resolvePaneBindingAsync: async () => null,
      windowExists: async () => false,
      firstPaneInWindow: async () => null,
      captureCurrentPaneBinding: () => null,
    },
  }, async ({ windows, tmuxCalls }) => {
    await assert.rejects(() => windows.ensureSwarmWindow(), error => {
      assert.equal(error instanceof Error, true)
      assert.equal(error.message, COMPACT_FAILURE_ERROR)
      return true
    })
    assert.deepEqual(tmuxCalls, [], 'current binding failure should not use hidden TypeScript display-message fallback')
  })
}

module.exports = {
  name: 'Go kernel v0.6.67 Go current binding window fallback cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeSource(root)
    assertPackageAndNativeGuards(root)
    assertNoNativeDiff(root)
    await assertInsideTmuxRuntime(env)
  },
}
