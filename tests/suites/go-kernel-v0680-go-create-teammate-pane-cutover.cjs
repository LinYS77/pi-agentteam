const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ADAPTER_DELEGATION,
  AUTHORIZED_TMUX_COMMANDS,
  BUILDER_FILE,
  CAPABILITY,
  DIRECT_TYPESCRIPT_CREATE_COMMANDS,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_CREATE_TEAMMATE_PANE_CUTOVER_SCHEMA_VERSION,
  GO_CREATE_TEAMMATE_PANE_CUTOVER_THEME,
  GO_SOURCE_FILE,
  HELPER_NAME,
  HELPER_VERSION,
  KERNEL_FILE,
  LABELS_FILE,
  LABEL_HELPER_NAME,
  NATIVE_ROOT,
  OPAQUE_INPUT_POLICY,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  REFRESH_HELPER_NAME,
  RELEASE_PACKAGE_GUARDS,
  REUSED_LABEL_HELPERS,
  RUNTIME_FILE,
  VERIFIER_FILE,
  WINDOWS_FILE,
  goCreateTeammatePaneCutover,
} = require('../fixtures/kernel/v0680/goCreateTeammatePaneCutover.cjs')

const DOC = 'docs/perf/v0.6.80-go-create-teammate-pane-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0680/goCreateTeammatePaneCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0680-go-create-teammate-pane-cutover.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_COMMANDS = [
  "tmux list-panes -t <target> -F '#{pane_id}'",
  "tmux split-window -t <leaderPaneId> -h -p 34 [-c <cwd>] -P -F '#{pane_id}' [startCommand]",
  "tmux split-window -t <lastPaneId> -v [-c <cwd>] -P -F '#{pane_id}' [startCommand]",
  'tmux select-layout -t <target> main-vertical',
  'tmux select-layout -t <target> tiled',
  'tmux resize-pane -t <leaderPaneId> -x 66%',
]
const REQUIRED_DOC = [
  '# v0.6.80 Go Create Teammate Pane Cutover',
  'Result: v0.6.80 cuts over only `tmux/panes.ts createTeammatePane(...)` pane discovery/creation/layout/resize behavior to Go-backed `workerLifecycle.createTeammatePane` behind the TypeScript facade.',
  '`ensureSwarmWindow(input.preferred, signal)` remains TypeScript-owned.',
  '`tmux/panes.ts createTeammatePane(...)` no longer calls direct TypeScript `runTmuxAsync(...)` for `list-panes`, `split-window`, `select-layout`, or `resize-pane`.',
  '`tmux list-panes -t <target> -F \'#{pane_id}\'`',
  '`tmux split-window -t <leaderPaneId> -h -p 34 [-c <cwd>] -P -F \'#{pane_id}\' [startCommand]`',
  '`tmux split-window -t <lastPaneId> -v [-c <cwd>] -P -F \'#{pane_id}\' [startCommand]`',
  '`tmux select-layout -t <target> main-vertical`',
  '`tmux select-layout -t <target> tiled`',
  '`tmux resize-pane -t <leaderPaneId> -x 66%`',
  '`cwd` and `startCommand` remain opaque high-risk argv-only values.',
  'raw `cwd`, raw `startCommand`, raw tmux stdout/stderr, and raw helper output must not leak',
  'Post-create label setting reuses the existing Go-backed `setPaneLabel(created.paneId, input.name, signal)` helper.',
  '`new-session` and `new-window` remain TypeScript-owned in `tmux/windows.ts`.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0680/goCreateTeammatePaneCutover.cjs`',
  '`tests/suites/go-kernel-v0680-go-create-teammate-pane-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.80 Go createTeammatePane cutover',
  'docs/perf/v0.6.80-go-create-teammate-pane-cutover.md',
  '`tmux/panes.ts createTeammatePane(...)` delegates pane discovery/creation/layout/resize to `createAgentTeamKernelAdapter().createTeammatePaneAsync(...)`',
  'Go `workerLifecycle.createTeammatePane` uses only `tmux list-panes -t <target> -F \'#{pane_id}\'`, the two `split-window` shapes, `select-layout main-vertical|tiled`, and `resize-pane -t <leaderPaneId> -x 66%`',
  '`ensureSwarmWindow(...)` remains TypeScript-owned',
  'post-create labels reuse the already Go-backed `setPaneLabel(...)` helper',
  '**v0.6.80 Go createTeammatePane cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
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
]
const BAD_CREATE_OUTPUT = 'CREATE_TEAMMATE_PANE_BAD_HELPER_OUTPUT_SHOULD_NOT_LEAK'
const BAD_OPAQUE_INPUT = 'CREATE_TEAMMATE_PANE_RAW_CWD_OR_COMMAND_SHOULD_NOT_LEAK'

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

function writeHelper(name, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-v0680-${name}-`))
  const file = path.join(dir, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return { dir, file }
}

function assertNoBadCreateLeak(value) {
  const text = JSON.stringify(value)
  assert.equal(text.includes(BAD_CREATE_OUTPUT), false, 'createTeammatePane diagnostics must not leak raw helper/stdout/stderr text')
  assert.equal(text.includes(BAD_OPAQUE_INPUT), false, 'createTeammatePane diagnostics must not leak raw cwd/startCommand text')
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goCreateTeammatePaneCutover)), goCreateTeammatePaneCutover)
  assert.equal(goCreateTeammatePaneCutover.schemaVersion, GO_CREATE_TEAMMATE_PANE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goCreateTeammatePaneCutover.theme, GO_CREATE_TEAMMATE_PANE_CUTOVER_THEME)
  assert.equal(goCreateTeammatePaneCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goCreateTeammatePaneCutover.helperVersion, HELPER_VERSION)
  assert.equal(goCreateTeammatePaneCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goCreateTeammatePaneCutover.capability, CAPABILITY)
  assert.equal(goCreateTeammatePaneCutover.operation, OPERATION)
  assert.equal(goCreateTeammatePaneCutover.helperName, HELPER_NAME)
  assert.equal(goCreateTeammatePaneCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goCreateTeammatePaneCutover.labelsFile, LABELS_FILE)
  assert.equal(goCreateTeammatePaneCutover.windowsFile, WINDOWS_FILE)
  assert.equal(goCreateTeammatePaneCutover.kernelFile, KERNEL_FILE)
  assert.equal(goCreateTeammatePaneCutover.goSourceFile, GO_SOURCE_FILE)
  assert.equal(goCreateTeammatePaneCutover.builderFile, BUILDER_FILE)
  assert.equal(goCreateTeammatePaneCutover.verifierFile, VERIFIER_FILE)
  assert.equal(goCreateTeammatePaneCutover.nativeRoot, NATIVE_ROOT)
  assert.equal(goCreateTeammatePaneCutover.adapterDelegation, ADAPTER_DELEGATION)
  assert.deepEqual(goCreateTeammatePaneCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goCreateTeammatePaneCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(goCreateTeammatePaneCutover.authorizedTmuxCommands, [...AUTHORIZED_TMUX_COMMANDS])
  assert.deepEqual(goCreateTeammatePaneCutover.reusedLabelHelpers, [...REUSED_LABEL_HELPERS])
  assert.deepEqual(goCreateTeammatePaneCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goCreateTeammatePaneCutover.directTypescriptCreateCommands, [...DIRECT_TYPESCRIPT_CREATE_COMMANDS])
  assert.deepEqual(goCreateTeammatePaneCutover.opaqueInputPolicy, OPAQUE_INPUT_POLICY)
  assert.deepEqual(goCreateTeammatePaneCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goCreateTeammatePaneCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(AUTHORIZED_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_COMMANDS)
  assert.equal(AUTHORIZED_TMUX_COMMANDS.filter(command => command.command === 'split-window').length, 2)
  assert.equal(AUTHORIZED_TMUX_COMMANDS.filter(command => command.command === 'select-layout').length, 2)
  assert.equal(AUTHORIZED_TMUX_COMMANDS.filter(command => command.command === 'resize-pane').length, 1)
  assert.equal(AUTHORIZED_TMUX_COMMANDS.some(command => command.command === 'new-session'), false)
  assert.equal(AUTHORIZED_TMUX_COMMANDS.some(command => command.command === 'new-window'), false)
  assert.equal(AUTHORIZED_TMUX_COMMANDS.some(command => command.command === 'send-keys'), false)
  assert.equal(AUTHORIZED_TMUX_COMMANDS.some(command => command.command.startsWith('kill-')), false)
  assert.equal(OPAQUE_INPUT_POLICY.argvOnly, true)
  assert.equal(OPAQUE_INPUT_POLICY.shellInterpolationAllowed, false)
  assert.equal(OPAQUE_INPUT_POLICY.rawHelperOutputLeakageAllowed, false)
  assert.equal(goCreateTeammatePaneCutover.facadeCutoverMigrated, true)
  assert.equal(goCreateTeammatePaneCutover.createTeammatePaneMigrated, true)
  assert.equal(goCreateTeammatePaneCutover.typescriptCreateFallbackRemoved, true)
  assert.equal(goCreateTeammatePaneCutover.noHiddenTypescriptFallbackAfterCutover, true)
  assert.equal(goCreateTeammatePaneCutover.preservesPublicResultShape, true)
  assert.deepEqual(goCreateTeammatePaneCutover.publicResultShape, ['paneId', 'target'])
  assert.equal(goCreateTeammatePaneCutover.thrownCreateFailuresPreserved, true)
  assert.equal(goCreateTeammatePaneCutover.ensureSwarmWindowMigrated, false)
  assert.equal(goCreateTeammatePaneCutover.newSessionMigrated, false)
  assert.equal(goCreateTeammatePaneCutover.newWindowMigrated, false)
  assert.equal(goCreateTeammatePaneCutover.killPaneMigrated, false)
  assert.equal(goCreateTeammatePaneCutover.nativeArtifactRenamed, false)
  assert.equal(goCreateTeammatePaneCutover.nativeHelperRebuilt, true)
  assert.equal(goCreateTeammatePaneCutover.packageVersionChanged, false)
  assert.equal(goCreateTeammatePaneCutover.packageReleaseApproved, false)
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

function assertRuntimeCutover(root) {
  const panesSource = read(root, RUNTIME_FILE)
  const labelsSource = read(root, LABELS_FILE)
  const windowsSource = read(root, WINDOWS_FILE)
  const createBody = functionBody(panesSource, HELPER_NAME)
  const killBody = functionBody(panesSource, 'killPane')
  const clearSyncBody = functionBody(panesSource, 'clearPaneLabelSync')

  assertIncludes(panesSource, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", RUNTIME_FILE)
  assert.equal(panesSource.includes("import { runTmuxNoThrow } from './client.js'"), false, `${RUNTIME_FILE} later v0.6.88 removes direct sync clear fallback import`)
  assertIncludes(panesSource, "import { refreshWindowPaneLabels, setPaneLabel } from './labels.js'", RUNTIME_FILE)
  assertIncludes(createBody, 'const swarm = await ensureSwarmWindow(input.preferred, signal)', `${RUNTIME_FILE} ${HELPER_NAME}`)
  assertIncludes(createBody, ADAPTER_DELEGATION, `${RUNTIME_FILE} ${HELPER_NAME}`)
  assertIncludes(createBody, 'target: swarm.target', `${RUNTIME_FILE} ${HELPER_NAME}`)
  assertIncludes(createBody, 'leaderPaneId: swarm.leaderPaneId', `${RUNTIME_FILE} ${HELPER_NAME}`)
  assertIncludes(createBody, 'hasLeaderLayout: Boolean(process.env.TMUX)', `${RUNTIME_FILE} ${HELPER_NAME}`)
  assertIncludes(createBody, 'cwd: input.cwd', `${RUNTIME_FILE} ${HELPER_NAME}`)
  assertIncludes(createBody, 'startCommand: input.startCommand', `${RUNTIME_FILE} ${HELPER_NAME}`)
  assertIncludes(createBody, "throw new Error(created.reason || 'Go worker lifecycle createTeammatePane unavailable (previous-helper-failure)')", `${RUNTIME_FILE} compact throw`)
  assertIncludes(createBody, 'await setPaneLabel(created.paneId, input.name, signal)', `${RUNTIME_FILE} post-create label helper`)
  assertIncludes(createBody, 'await refreshWindowPaneLabels(created.target, signal)', `${RUNTIME_FILE} post-create refresh`)
  assertIncludes(createBody, 'return { paneId: created.paneId, target: created.target }', `${RUNTIME_FILE} public result`)
  for (const forbidden of DIRECT_TYPESCRIPT_CREATE_COMMANDS) assert.equal(createBody.includes(forbidden), false, `${RUNTIME_FILE} ${HELPER_NAME} must remove direct TS fallback ${forbidden}`)
  assert.equal(createBody.includes('runTmuxAsync'), false, `${RUNTIME_FILE} ${HELPER_NAME} must not retain runTmuxAsync fallback`)
  assert.equal(createBody.includes('runTmuxNoThrowAsync'), false, `${RUNTIME_FILE} ${HELPER_NAME} must not retain direct label no-throw fallback`)

  assertIncludes(killBody, 'createAgentTeamKernelAdapter().killPane(paneId)', `${RUNTIME_FILE} later v0.6.86 killPane adapter cutover`)
  assert.equal(killBody.includes("runTmuxNoThrow(['kill-pane', '-t', paneId])"), false, `${RUNTIME_FILE} later v0.6.86 removes direct killPane fallback`)
  assertIncludes(clearSyncBody, 'createAgentTeamKernelAdapter().clearPaneLabel(paneId)', `${RUNTIME_FILE} later v0.6.88 clearPaneLabelSync adapter cutover`)
  assert.equal(clearSyncBody.includes("runTmuxNoThrow(['set-option', '-up', '-t', paneId, '@agentteam-name'])"), false, `${RUNTIME_FILE} later v0.6.88 removes direct clearPaneLabelSync set-option fallback`)
  assert.equal(clearSyncBody.includes("runTmuxNoThrow(['select-pane', '-t', paneId, '-T', ''])"), false, `${RUNTIME_FILE} later v0.6.88 removes direct clearPaneLabelSync select-pane fallback`)

  assertIncludes(labelsSource, 'export async function setPaneLabel(paneId: string, label: string, signal?: AbortSignal): Promise<void>', `${LABELS_FILE} exported setPaneLabel`)
  assertIncludes(labelsSource, 'createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)', `${LABELS_FILE} ${LABEL_HELPER_NAME}`)
  assertIncludes(labelsSource, 'createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)', `${LABELS_FILE} ${REFRESH_HELPER_NAME}`)
  assertIncludes(windowsSource, 'export async function ensureSwarmWindow', `${WINDOWS_FILE} ensureSwarmWindow remains TS-owned`)
  assert.equal(windowsSource.includes("runTmuxAsync(['new-session', '-d', '-s', SWARM_SESSION, '-n', SWARM_WINDOW]"), false, `${WINDOWS_FILE} later v0.6.82 removes direct detached new-session fallback`)
  assertIncludes(windowsSource, 'createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)', `${WINDOWS_FILE} later v0.6.82 detached new-session cutover`)
  assert.equal(windowsSource.includes("runTmuxAsync(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW]"), false, `${WINDOWS_FILE} later v0.6.84 removes direct detached new-window fallback`)
  assertIncludes(windowsSource, 'createAgentTeamKernelAdapter().createDetachedSwarmWindowAsync(SWARM_SESSION, SWARM_WINDOW, signal)', `${WINDOWS_FILE} later v0.6.84 detached new-window cutover`)
}

async function assertAdapterNoLeakAndCompactFailures(distRoot) {
  const kernel = require(path.join(distRoot, 'core/kernel.js'))
  const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(distRoot, 'missing-create-teammate-pane-helper'), env: {} })

  const invalidTarget = await adapter.createTeammatePaneAsync({ target: 'invalid target!', leaderPaneId: '%123', hasLeaderLayout: true, cwd: BAD_OPAQUE_INPUT, startCommand: BAD_OPAQUE_INPUT })
  assert.equal(invalidTarget.ok, false)
  assert.equal(invalidTarget.operation, OPERATION)
  assert.equal(invalidTarget.failureKind, 'invalid-target')
  assertNoBadCreateLeak(invalidTarget)

  const invalidCwd = await adapter.createTeammatePaneAsync({ target: 'agentteam:@1', leaderPaneId: '%123', hasLeaderLayout: true, cwd: `${BAD_OPAQUE_INPUT}\0`, startCommand: BAD_OPAQUE_INPUT })
  assert.equal(invalidCwd.ok, false)
  assert.equal(invalidCwd.operation, OPERATION)
  assert.equal(invalidCwd.failureKind, 'invalid-cwd')
  assertNoBadCreateLeak(invalidCwd)

  const invalidStartCommand = await adapter.createTeammatePaneAsync({ target: 'agentteam:@1', leaderPaneId: '%123', hasLeaderLayout: true, cwd: BAD_OPAQUE_INPUT, startCommand: `${BAD_OPAQUE_INPUT}\0` })
  assert.equal(invalidStartCommand.ok, false)
  assert.equal(invalidStartCommand.operation, OPERATION)
  assert.equal(invalidStartCommand.failureKind, 'invalid-start-command')
  assertNoBadCreateLeak(invalidStartCommand)

  const missingHelper = await adapter.createTeammatePaneAsync({ target: 'agentteam:@1', leaderPaneId: '%123', hasLeaderLayout: true, cwd: BAD_OPAQUE_INPUT, startCommand: BAD_OPAQUE_INPUT })
  assert.equal(missingHelper.ok, false)
  assert.equal(missingHelper.operation, OPERATION)
  assertNoBadCreateLeak(missingHelper)

  const malicious = writeHelper('malicious-create-output', `#!/usr/bin/env node
const fs = require('node:fs')
const request = JSON.parse(fs.readFileSync(0, 'utf8').trim())
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const baseHealth = { ok: true, implementation: 'go', protocolVersion: 1, helperVersion: '0.3.0-read-model-shadow', capabilities: ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'], businessPathsConnected: false }
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'workerLifecycle') respond({ ok: false, operation: 'createTeammatePane', capability: 'workerLifecycle', target: 'agentteam:@1', paneId: '%123', created: false, status: 'unknown', resultMarker: 'stale', failureKind: 'tmux-command-failed', reason: '${BAD_CREATE_OUTPUT}', error: '${BAD_CREATE_OUTPUT}', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true })
else respond(baseHealth)
`)
  try {
    const maliciousAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: malicious.file, env: {} })
    const leaked = await maliciousAdapter.createTeammatePaneAsync({ target: 'agentteam:@1', leaderPaneId: '%123', hasLeaderLayout: true, cwd: BAD_OPAQUE_INPUT, startCommand: BAD_OPAQUE_INPUT })
    assert.equal(leaked.ok, false)
    assert.equal(leaked.failureKind, 'tmux-command-failed')
    assertNoBadCreateLeak(leaked)
  } finally {
    fs.rmSync(malicious.dir, { recursive: true, force: true })
  }
}

function assertKernelRuntime(root) {
  const kernelSource = read(root, KERNEL_FILE)
  assertIncludes(kernelSource, 'export type AgentTeamKernelCreateTeammatePaneInput', KERNEL_FILE)
  assertIncludes(kernelSource, 'export type AgentTeamKernelTeammatePaneCreation', KERNEL_FILE)
  assertIncludes(kernelSource, 'createTeammatePaneAsync(input: AgentTeamKernelCreateTeammatePaneInput, signal?: AbortSignal): Promise<AgentTeamKernelTeammatePaneCreation>', KERNEL_FILE)
  assertIncludes(kernelSource, 'workerLifecycleCreateTeammatePaneConnected', KERNEL_FILE)
  assertIncludes(kernelSource, "| 'invalid-cwd'", KERNEL_FILE)
  assertIncludes(kernelSource, "| 'invalid-start-command'", KERNEL_FILE)
  assertIncludes(kernelSource, 'const TMUX_OPAQUE_ARGUMENT_LIMIT = 4096', KERNEL_FILE)
  assertIncludes(kernelSource, 'function isValidOptionalTmuxOpaqueArgument', KERNEL_FILE)
  assertIncludes(kernelSource, 'workerLifecycleUnavailableTeammatePaneCreation', KERNEL_FILE)
  assertIncludes(kernelSource, 'validateTeammatePaneCreationResult', KERNEL_FILE)
  assertIncludes(kernelSource, "operation: 'createTeammatePane'", KERNEL_FILE)
  assertIncludes(kernelSource, "const helperResult = await callHelperAsync<unknown>('workerLifecycle', params, signal)", KERNEL_FILE)
}

function assertGoRuntime(root) {
  const goSource = read(root, GO_SOURCE_FILE)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE_FILE} should include workerLifecycle ${operation}`)
  assertIncludes(goSource, 'tmuxOpaqueArgumentLimit = 4096', GO_SOURCE_FILE)
  assertIncludes(goSource, 'type workerTeammatePaneCreationResult struct', GO_SOURCE_FILE)
  assertIncludes(goSource, '"workerLifecycleCreateTeammatePaneConnected":', `${GO_SOURCE_FILE} profile flag`)
  assertIncludes(goSource, 'func optionalOpaqueStringParam(params map[string]any, key string) (string, bool)', GO_SOURCE_FILE)
  assertIncludes(goSource, 'func unavailableTeammatePaneCreation(target string, paneID string, kind string) workerTeammatePaneCreationResult', GO_SOURCE_FILE)
  assertIncludes(goSource, 'func runCreateTeammatePaneTmuxOutput(args ...string) (string, string)', GO_SOURCE_FILE)
  assertIncludes(goSource, 'func createTeammatePane(params map[string]any) workerTeammatePaneCreationResult', GO_SOURCE_FILE)
  assertIncludes(goSource, 'runCreateTeammatePaneTmuxOutput("list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat)', `${GO_SOURCE_FILE} authorized list-panes`)
  assertIncludes(goSource, 'splitArgs := []string{"split-window"}', `${GO_SOURCE_FILE} authorized split-window argv`)
  assertIncludes(goSource, 'splitArgs = append(splitArgs, "-t", leaderPaneID, "-h", "-p", "34")', `${GO_SOURCE_FILE} authorized leader split`)
  assertIncludes(goSource, 'splitArgs = append(splitArgs, "-t", panes[len(panes)-1], "-v")', `${GO_SOURCE_FILE} authorized later split`)
  assertIncludes(goSource, 'splitArgs = append(splitArgs, "-c", cwd)', `${GO_SOURCE_FILE} cwd argv`)
  assertIncludes(goSource, 'splitArgs = append(splitArgs, "-P", "-F", workerLifecycleWindowPaneFormat)', `${GO_SOURCE_FILE} split pane id format`)
  assertIncludes(goSource, 'splitArgs = append(splitArgs, startCommand)', `${GO_SOURCE_FILE} startCommand argv`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("select-layout", "-t", target, layout)', `${GO_SOURCE_FILE} authorized select-layout`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("resize-pane", "-t", leaderPaneID, "-x", "66%")', `${GO_SOURCE_FILE} authorized resize-pane`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", args...)', `${GO_SOURCE_FILE} argv-only tmux execution`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-p", "-t", paneID, "@agentteam-name", label)', `${GO_SOURCE_FILE} existing setPaneLabel preserved`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE_FILE} existing pane title label preserved`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE_FILE} existing clearPaneLabel preserved`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-status", "top")', `${GO_SOURCE_FILE} existing refresh preserved`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "new-session", "-d", "-s", sessionName, "-n", windowName)', `${GO_SOURCE_FILE} later v0.6.82 authorized detached new-session`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "new-window", "-t", sessionName, "-n", windowName)', `${GO_SOURCE_FILE} later v0.6.84 authorized detached new-window`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => !['new-session', 'new-window', 'kill-pane'].includes(command))) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE_FILE} must not add forbidden command ${command}`)
  assert.equal(/exec\.Command\s*\(/.test(goSource), false, `${GO_SOURCE_FILE} must not use shell-capable exec.Command`)
  assert.equal(/"(?:sh|bash|zsh|fish)"/.test(goSource), false, `${GO_SOURCE_FILE} must not invoke shells`)
}

function assertArtifactPipelineAndNative(root) {
  const builder = read(root, BUILDER_FILE)
  const verifier = read(root, VERIFIER_FILE)
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  const provenance = JSON.parse(read(root, `${NATIVE_ROOT}/provenance.json`))
  assertIncludes(builder, 'runWorkerLifecycleCreateTeammatePaneSmoke', BUILDER_FILE)
  assertIncludes(builder, 'workerLifecycleCreateTeammatePaneSmoke', BUILDER_FILE)
  assertIncludes(verifier, 'workerLifecycleCreateTeammatePane', VERIFIER_FILE)
  assert.equal(manifest.packageVersion, PACKAGE_VERSION)
  assert.equal(manifest.helperVersion, HELPER_VERSION)
  assert.equal(manifest.protocolVersion, PROTOCOL_VERSION)
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(manifest.artifact.path, `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`)
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
  assert.equal(manifest.smoke.workerLifecycleCreateTeammatePane.ok, false)
  assert.deepEqual(manifest.smoke.workerLifecycleCreateTeammatePane.acceptedFailureKinds, ['invalid-target'])
  assert.equal(provenance.smoke.workerLifecycleCreateTeammatePane.ok, false)
  assert.deepEqual(provenance.smoke.workerLifecycleCreateTeammatePane.acceptedFailureKinds, ['invalid-target'])
  assert.equal(manifest.smoke.workerLifecycleCreateDetachedSwarmSession.ok, false)
  assert.deepEqual(manifest.smoke.workerLifecycleCreateDetachedSwarmSession.acceptedFailureKinds, ['invalid-session'])
  assert.equal(provenance.smoke.workerLifecycleCreateDetachedSwarmSession.ok, false)
  assert.deepEqual(provenance.smoke.workerLifecycleCreateDetachedSwarmSession.acceptedFailureKinds, ['invalid-session'])
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
  name: 'Go kernel v0.6.80 Go createTeammatePane cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertRuntimeCutover(root)
    await assertAdapterNoLeakAndCompactFailures(env.helpers.distRoot)
    assertKernelRuntime(root)
    assertGoRuntime(root)
    assertArtifactPipelineAndNative(root)
    assertPackageAndReleaseGuards(root)
  },
}
