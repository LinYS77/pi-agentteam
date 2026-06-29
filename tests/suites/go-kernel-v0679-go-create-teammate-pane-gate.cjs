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
  CURRENT_TYPESCRIPT_CREATE_TEAMMATE_PANE_SURFACE,
  EXISTING_GO_MUTATING_TMUX_COMMANDS,
  FORBIDDEN_FUTURE_SCOPE,
  FORBIDDEN_GO_CUTOVER_SNIPPETS,
  FORBIDDEN_RUNTIME_CUTOVER_SNIPPETS,
  FUTURE_INPUT_POLICY,
  FUTURE_OPERATION,
  FUTURE_PUBLIC_BEHAVIOR,
  GO_CREATE_TEAMMATE_PANE_GATE_SCHEMA_VERSION,
  GO_CREATE_TEAMMATE_PANE_GATE_THEME,
  GO_SOURCE_FILE,
  HELPER_VERSION,
  KERNEL_FILE,
  NATIVE_ARTIFACT_SNAPSHOT,
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  goCreateTeammatePaneGate,
} = require('../fixtures/kernel/v0679/goCreateTeammatePaneGate.cjs')

const DOC = 'docs/perf/v0.6.79-go-create-teammate-pane-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0679/goCreateTeammatePaneGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0679-go-create-teammate-pane-gate.cjs'
const TMUX_WINDOWS = 'tmux/windows.ts'
const TMUX_LABELS = 'tmux/labels.ts'
const NATIVE_ROOT = NATIVE_ARTIFACT_SNAPSHOT.root
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_FUTURE_COMMANDS = [
  "tmux list-panes -t <swarm.target> -F '#{pane_id}'",
  "tmux split-window -t <leaderPaneId> -h -p 34 [-c <cwd>] -P -F '#{pane_id}' [startCommand]",
  "tmux split-window -t <lastPaneId> -v [-c <cwd>] -P -F '#{pane_id}' [startCommand]",
  'tmux select-layout -t <swarm.target> main-vertical',
  'tmux select-layout -t <swarm.target> tiled',
  'tmux resize-pane -t <leaderPaneId> -x 66%',
]
const REQUIRED_DOC = [
  '# v0.6.79 Go Create Teammate Pane Gate',
  'Result: v0.6.79 defines the high-risk `tmux/panes.ts createTeammatePane(...)` Go cutover gate without implementing runtime mutation.',
  'exactly one future candidate: `workerLifecycle.createTeammatePane` backing private/public `tmux/panes.ts createTeammatePane(...)`',
  '`ensureSwarmWindow(input.preferred, signal)` remains TypeScript-owned',
  "`tmux list-panes -t <swarm.target> -F '#{pane_id}'`",
  "`tmux split-window -t <leaderPaneId> -h -p 34 [-c <cwd>] -P -F '#{pane_id}' [startCommand]`",
  "`tmux split-window -t <lastPaneId> -v [-c <cwd>] -P -F '#{pane_id}' [startCommand]`",
  '`tmux select-layout -t <swarm.target> main-vertical`',
  '`tmux select-layout -t <swarm.target> tiled`',
  '`tmux resize-pane -t <leaderPaneId> -x 66%`',
  'Future Go must pass `cwd` and `startCommand` as argv values only, never shell-interpolate them.',
  'The future operation should preserve current thrown create/layout failure behavior',
  'No Go handler, TypeScript adapter method, `tmux/panes.ts` cutover, native helper rebuild, or package/release action is made in this slice.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0679/goCreateTeammatePaneGate.cjs`',
  '`tests/suites/go-kernel-v0679-go-create-teammate-pane-gate.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.79 Go createTeammatePane gate',
  'docs/perf/v0.6.79-go-create-teammate-pane-gate.md',
  'candidate is only `tmux/panes.ts createTeammatePane(...)`',
  "future Go may use only `tmux list-panes -t <swarm.target> -F '#{pane_id}'`, the two `split-window` shapes, `select-layout main-vertical|tiled`, and `resize-pane -t <leaderPaneId> -x 66%`",
  '`ensureSwarmWindow(...)` remains TypeScript-owned',
  'no runtime migration, Go handler, adapter method, native rebuild, package/release action, or artifact rename',
  '**v0.6.79 Go createTeammatePane gate**',
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
  'ensureSwarmWindowMigrated: true',
  'newSessionMigrated: true',
  'newWindowMigrated: true',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goCreateTeammatePaneGate)), goCreateTeammatePaneGate)
  assert.equal(goCreateTeammatePaneGate.schemaVersion, GO_CREATE_TEAMMATE_PANE_GATE_SCHEMA_VERSION)
  assert.equal(goCreateTeammatePaneGate.theme, GO_CREATE_TEAMMATE_PANE_GATE_THEME)
  assert.equal(goCreateTeammatePaneGate.packageVersion, PACKAGE_VERSION)
  assert.equal(goCreateTeammatePaneGate.helperVersion, HELPER_VERSION)
  assert.equal(goCreateTeammatePaneGate.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goCreateTeammatePaneGate.capability, CAPABILITY)
  assert.deepEqual(goCreateTeammatePaneGate.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goCreateTeammatePaneGate.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goCreateTeammatePaneGate.contractStatus, CONTRACT_STATUS)
  assert.equal(goCreateTeammatePaneGate.futureOperation, FUTURE_OPERATION)
  assert.equal(goCreateTeammatePaneGate.runtimeFile, RUNTIME_FILE)
  assert.equal(goCreateTeammatePaneGate.kernelFile, KERNEL_FILE)
  assert.equal(goCreateTeammatePaneGate.goSourceFile, GO_SOURCE_FILE)
  assert.deepEqual(goCreateTeammatePaneGate.authorizedFutureMutatingCandidates, [FUTURE_OPERATION])
  assert.deepEqual(goCreateTeammatePaneGate.currentTypescriptCreateTeammatePaneSurface, CURRENT_TYPESCRIPT_CREATE_TEAMMATE_PANE_SURFACE)
  assert.deepEqual(goCreateTeammatePaneGate.authorizedFutureCommandSurface, [...AUTHORIZED_FUTURE_COMMAND_SURFACE])
  assert.deepEqual(goCreateTeammatePaneGate.existingGoMutatingTmuxCommands, [...EXISTING_GO_MUTATING_TMUX_COMMANDS])
  assert.deepEqual(goCreateTeammatePaneGate.forbiddenRuntimeCutoverSnippets, [...FORBIDDEN_RUNTIME_CUTOVER_SNIPPETS])
  assert.deepEqual(goCreateTeammatePaneGate.forbiddenGoCutoverSnippets, [...FORBIDDEN_GO_CUTOVER_SNIPPETS])
  assert.deepEqual(goCreateTeammatePaneGate.forbiddenFutureScope, [...FORBIDDEN_FUTURE_SCOPE])
  assert.deepEqual(goCreateTeammatePaneGate.futureInputPolicy, FUTURE_INPUT_POLICY)
  assert.deepEqual(goCreateTeammatePaneGate.futurePublicBehavior, FUTURE_PUBLIC_BEHAVIOR)
  assert.deepEqual(goCreateTeammatePaneGate.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(goCreateTeammatePaneGate.nativeArtifactSnapshot, NATIVE_ARTIFACT_SNAPSHOT)

  assert.equal(goCreateTeammatePaneGate.gateOnly, true)
  assert.equal(goCreateTeammatePaneGate.noRuntimeMigrationInThisSlice, true)
  assert.equal(goCreateTeammatePaneGate.futureCandidateMutatesTmux, true)
  assert.equal(goCreateTeammatePaneGate.futureCandidateDestructive, false)
  assert.equal(goCreateTeammatePaneGate.createTeammatePaneMigrated, false)
  assert.equal(goCreateTeammatePaneGate.ensureSwarmWindowMigrated, false)
  assert.equal(goCreateTeammatePaneGate.newSessionMigrated, false)
  assert.equal(goCreateTeammatePaneGate.newWindowMigrated, false)
  assert.equal(goCreateTeammatePaneGate.wakePaneMigrated, false)
  assert.equal(goCreateTeammatePaneGate.killPaneMigrated, false)
  assert.equal(goCreateTeammatePaneGate.syncPaneLabelsMigrated, false)
  assert.equal(goCreateTeammatePaneGate.clearPaneLabelsForTeamMigrated, false)
  assert.equal(goCreateTeammatePaneGate.stateRepositoryMigrated, false)
  assert.equal(goCreateTeammatePaneGate.taskReportPlanRunMigrated, false)
  assert.equal(goCreateTeammatePaneGate.teamPanelViewModelMigrated, false)
  assert.equal(goCreateTeammatePaneGate.releasePackageVerificationMigrated, false)
  assert.equal(goCreateTeammatePaneGate.nativeArtifactRenamed, false)
  assert.equal(goCreateTeammatePaneGate.nativeHelperRebuilt, false)
  assert.equal(goCreateTeammatePaneGate.goSourceChanged, false)
  assert.equal(goCreateTeammatePaneGate.coreKernelChanged, false)
  assert.equal(goCreateTeammatePaneGate.tmuxPanesRuntimeChanged, false)
  assert.equal(goCreateTeammatePaneGate.packageVersionChanged, false)
  assert.equal(goCreateTeammatePaneGate.packageReleaseApproved, false)
  assert.equal(goCreateTeammatePaneGate.npmVersionChanged, false)
  assert.equal(goCreateTeammatePaneGate.npmPublished, false)
  assert.equal(goCreateTeammatePaneGate.tagReleaseCreated, false)

  assert.deepEqual(AUTHORIZED_FUTURE_COMMAND_SURFACE.map(command => command.rendered), EXPECTED_FUTURE_COMMANDS)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.filter(command => command.command === 'split-window').length, 2)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.filter(command => command.command === 'select-layout').length, 2)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.filter(command => command.command === 'resize-pane').length, 1)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.some(command => command.command === 'new-session'), false)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.some(command => command.command === 'new-window'), false)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.some(command => command.command === 'send-keys'), false)
  assert.equal(AUTHORIZED_FUTURE_COMMAND_SURFACE.some(command => command.command.startsWith('kill-')), false)
  assert.equal(FUTURE_INPUT_POLICY.argvOnly, true)
  assert.equal(FUTURE_INPUT_POLICY.shellInterpolationAllowed, false)
  assert.equal(FUTURE_INPUT_POLICY.cwdPolicy.includes('never log raw cwd text'), true)
  assert.equal(FUTURE_INPUT_POLICY.startCommandPolicy.includes('never shell-interpolate'), true)
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

function assertCurrentTypescriptPaneState(root) {
  const panesSource = read(root, RUNTIME_FILE)
  const windowsSource = read(root, TMUX_WINDOWS)
  const labelsSource = read(root, TMUX_LABELS)
  const createBody = functionBody(panesSource, 'createTeammatePane')
  const killBody = functionBody(panesSource, 'killPane')
  const clearSyncBody = functionBody(panesSource, 'clearPaneLabelSync')

  assert.equal(CURRENT_TYPESCRIPT_CREATE_TEAMMATE_PANE_SURFACE.paneDiscoveryCall.includes("runTmuxAsync(['list-panes'"), true, 'v0.6.79 fixture preserves the historical gate-time TypeScript surface')
  assertIncludes(panesSource, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", `${RUNTIME_FILE} later v0.6.80 cutover seam`)
  assertIncludes(panesSource, "import { runTmuxNoThrow } from './client.js'", `${RUNTIME_FILE} kill/clear sync helpers remain TS-owned`)
  assertIncludes(panesSource, "import { refreshWindowPaneLabels, setPaneLabel } from './labels.js'", `${RUNTIME_FILE} later v0.6.80 reuses label helpers`)
  assertIncludes(panesSource, "import { ensureSwarmWindow } from './windows.js'", RUNTIME_FILE)
  assertIncludes(createBody, 'const swarm = await ensureSwarmWindow(input.preferred, signal)', `${RUNTIME_FILE} createTeammatePane`)
  assertIncludes(createBody, 'createAgentTeamKernelAdapter().createTeammatePaneAsync({', `${RUNTIME_FILE} later v0.6.80 createTeammatePane cutover`)
  assertIncludes(createBody, 'hasLeaderLayout: Boolean(process.env.TMUX)', `${RUNTIME_FILE} preserves leader-layout input`)
  assertIncludes(createBody, 'cwd: input.cwd', `${RUNTIME_FILE} passes cwd as opaque helper param`)
  assertIncludes(createBody, 'startCommand: input.startCommand', `${RUNTIME_FILE} passes startCommand as opaque helper param`)
  assertIncludes(createBody, 'await setPaneLabel(created.paneId, input.name, signal)', `${RUNTIME_FILE} later v0.6.80 reuses setPaneLabel`)
  assertIncludes(createBody, 'await refreshWindowPaneLabels(created.target, signal)', `${RUNTIME_FILE} refresh preserved`)
  assert.equal(createBody.includes('runTmuxAsync'), false, `${RUNTIME_FILE} later v0.6.80 must not keep direct createTeammatePane runTmuxAsync fallback`)
  assert.equal(createBody.includes('runTmuxNoThrowAsync'), false, `${RUNTIME_FILE} later v0.6.80 must not keep direct post-create label fallback`)

  assertIncludes(killBody, "runTmuxNoThrow(['kill-pane', '-t', paneId])", `${RUNTIME_FILE} killPane remains TS-owned`)
  assertIncludes(clearSyncBody, "runTmuxNoThrow(['set-option', '-up', '-t', paneId, '@agentteam-name'])", `${RUNTIME_FILE} clearPaneLabelSync remains TS-owned sync helper`)
  assertIncludes(clearSyncBody, "runTmuxNoThrow(['select-pane', '-t', paneId, '-T', ''])", `${RUNTIME_FILE} clearPaneLabelSync remains TS-owned sync helper`)

  assertIncludes(windowsSource, 'export async function ensureSwarmWindow', `${TMUX_WINDOWS} ensureSwarmWindow remains TS-owned`)
  assert.equal(windowsSource.includes("runTmuxAsync(['new-session', '-d', '-s', SWARM_SESSION, '-n', SWARM_WINDOW]"), false, `${TMUX_WINDOWS} later v0.6.82 removes direct detached new-session fallback`)
  assertIncludes(windowsSource, 'createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)', `${TMUX_WINDOWS} later v0.6.82 detached new-session cutover`)
  assert.equal(windowsSource.includes("runTmuxAsync(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW]"), false, `${TMUX_WINDOWS} later v0.6.84 removes direct detached new-window fallback`)
  assertIncludes(windowsSource, 'createAgentTeamKernelAdapter().createDetachedSwarmWindowAsync(SWARM_SESSION, SWARM_WINDOW, signal)', `${TMUX_WINDOWS} later v0.6.84 detached new-window cutover`)
  assertIncludes(labelsSource, 'createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)', `${TMUX_LABELS} v0.6.76 setPaneLabel helper preserved`)
  assertIncludes(labelsSource, 'createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)', `${TMUX_LABELS} v0.6.74 refresh helper preserved`)
}

function assertNoRuntimeCutover(root) {
  const kernelSource = read(root, KERNEL_FILE)
  const goSource = read(root, GO_SOURCE_FILE)
  const panesSource = read(root, RUNTIME_FILE)
  assert.deepEqual(FORBIDDEN_RUNTIME_CUTOVER_SNIPPETS, ['createTeammatePaneAsync', "operation: 'createTeammatePane'", 'workerLifecycleCreateTeammatePaneConnected'])
  assert.deepEqual(FORBIDDEN_GO_CUTOVER_SNIPPETS, ['case "createTeammatePane"', 'func createTeammatePane', 'split-window', 'select-layout', 'resize-pane'])
  assertIncludes(kernelSource, 'createTeammatePaneAsync(input: AgentTeamKernelCreateTeammatePaneInput, signal?: AbortSignal)', `${KERNEL_FILE} later v0.6.80 adapter method`)
  assertIncludes(kernelSource, "operation: 'createTeammatePane'", `${KERNEL_FILE} later v0.6.80 operation`)
  assertIncludes(kernelSource, 'workerLifecycleCreateTeammatePaneConnected', `${KERNEL_FILE} later v0.6.80 profile flag`)
  assertIncludes(panesSource, 'createAgentTeamKernelAdapter().createTeammatePaneAsync({', `${RUNTIME_FILE} later v0.6.80 facade cutover`)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE_FILE} should keep existing operation ${operation}`)
  assert.match(goSource, /case "createTeammatePane"/, `${GO_SOURCE_FILE} later v0.6.80 adds authorized createTeammatePane handler`)
  assert.match(goSource, /func createTeammatePane/, `${GO_SOURCE_FILE} later v0.6.80 adds authorized createTeammatePane implementation`)
}

function assertExistingGoCommandSurface(root) {
  const goSource = read(root, GO_SOURCE_FILE)
  for (const command of EXISTING_GO_MUTATING_TMUX_COMMANDS) {
    if (command.operation === 'markWindowAsAgentTeam') assertIncludes(goSource, `runWindowMarkingSetOption(target, "${command.args[4]}", "${command.args[5]}")`, `${GO_SOURCE_FILE} ${command.rendered}`)
    if (command.operation === 'refreshWindowPaneLabels') assertIncludes(goSource, `runWindowPaneLabelsSetOption(target, "${command.args[4]}", "${command.args[5]}")`, `${GO_SOURCE_FILE} ${command.rendered}`)
  }
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-p", "-t", paneID, "@agentteam-name", label)', `${GO_SOURCE_FILE} v0.6.76 setPaneLabel set-option`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE_FILE} v0.6.76 setPaneLabel select-pane`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE_FILE} v0.6.78 clearPaneLabel set-option unset`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE_FILE} v0.6.78 clearPaneLabel select-pane clear`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmuxOutput("list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat)', `${GO_SOURCE_FILE} later v0.6.80 authorized list-panes`)
  assertIncludes(goSource, 'splitArgs := []string{"split-window"}', `${GO_SOURCE_FILE} later v0.6.80 authorized split-window`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("select-layout", "-t", target, layout)', `${GO_SOURCE_FILE} later v0.6.80 authorized select-layout`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("resize-pane", "-t", leaderPaneID, "-x", "66%")', `${GO_SOURCE_FILE} later v0.6.80 authorized resize-pane`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "new-session", "-d", "-s", sessionName, "-n", windowName)', `${GO_SOURCE_FILE} later v0.6.82 authorized detached new-session`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "new-window", "-t", sessionName, "-n", windowName)', `${GO_SOURCE_FILE} later v0.6.84 authorized detached new-window`)
  for (const forbidden of ['send-keys', 'kill-pane', 'kill-window', 'kill-session', 'respawn-pane', 'set-buffer', 'paste-buffer']) {
    assert.equal(goSource.includes(`"${forbidden}"`), false, `${GO_SOURCE_FILE} must not add forbidden command ${forbidden}`)
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
  assert.equal(typeof manifest.artifact.sha256, 'string')
  assert.equal(sha256(root, NATIVE_ARTIFACT_SNAPSHOT.helperPath), manifest.artifact.sha256)
  assert.equal(fs.statSync(path.join(root, ...NATIVE_ARTIFACT_SNAPSHOT.helperPath.split('/'))).size, manifest.artifact.size)
  assert.equal(typeof manifest.source.revision, 'string')
  assert.equal(provenance.source.revision, manifest.source.revision)
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.smoke, 'workerLifecycleCreateTeammatePane'), true, 'later v0.6.80 cutover adds createTeammatePane native smoke')
  assert.deepEqual(manifest.smoke.workerLifecycleCreateTeammatePane, { ok: false, acceptedFailureKinds: ['invalid-target'] })
  assert.deepEqual(provenance.smoke.workerLifecycleCreateTeammatePane, { ok: false, acceptedFailureKinds: ['invalid-target'] })
  assert.deepEqual(manifest.smoke.workerLifecycleCreateDetachedSwarmSession, { ok: false, acceptedFailureKinds: ['invalid-session'] })
  assert.deepEqual(provenance.smoke.workerLifecycleCreateDetachedSwarmSession, { ok: false, acceptedFailureKinds: ['invalid-session'] })
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
  name: 'Go kernel v0.6.79 Go createTeammatePane gate',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertCurrentTypescriptPaneState(root)
    assertNoRuntimeCutover(root)
    assertExistingGoCommandSurface(root)
    assertNativeArtifactUnchanged(root)
    assertPackageAndReleaseGuards(root)
  },
}
