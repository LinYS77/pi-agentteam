const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ASYNC_ABORT_POLICY,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_SESSION_EXISTENCE_CUTOVER_SCHEMA_VERSION,
  GO_SESSION_EXISTENCE_CUTOVER_THEME,
  GO_SESSION_EXISTS_COMMAND,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  goSessionExistenceCutover,
} = require('../fixtures/kernel/v0666/goSessionExistenceCutover.cjs')

const DOC = 'docs/perf/v0.6.66-go-session-existence-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0666/goSessionExistenceCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0666-go-session-existence-cutover.cjs'
const TMUX_WINDOWS = 'tmux/windows.ts'
const TMUX_PROCESS = 'tmux/process.ts'
const TMUX_CORE = 'tmux/core.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const BUILDER = 'scripts/lib/go-helper-artifact-builder.cjs'
const VERIFIER = 'scripts/lib/go-helper-artifact-verifier.cjs'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const HELPER = `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`
const MANIFEST = `${NATIVE_ROOT}/manifest.json`
const CHECKSUMS = `${NATIVE_ROOT}/SHA256SUMS`
const PROVENANCE = `${NATIVE_ROOT}/provenance.json`
const ATTESTATION = `${NATIVE_ROOT}/attestation.intoto.jsonl`
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.66 Go Session Existence Cutover',
  'Result: v0.6.66 cuts over the `tmux/windows.ts` `ensureSwarmWindow()` session existence check from direct TypeScript `has-session` probing to a narrow Go-backed `workerLifecycle.sessionExists` operation through the cancellable async kernel adapter seam.',
  '`tmux/windows.ts` `ensureSwarmWindow()` now calls `createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)`.',
  "The TypeScript `runTmuxNoThrowAsync(['has-session', '-t', SWARM_SESSION], undefined, signal).ok` implementation is removed from `ensureSwarmWindow()`.",
  'Go uses exactly `tmux has-session -t <sessionName>` for `workerLifecycle.sessionExists`.',
  'A positive helper result skips the existing TypeScript `new-session` branch as before.',
  'Missing session, helper failure, invalid response, empty session name, pre-aborted signal, and in-flight abort fail closed to `false`, so the existing TypeScript creation path remains in charge.',
  "`new-session`, `new-window`, post-creation `list-windows -F '#{window_id}\\t#{window_name}'`, marking, labels, kill, state/task/UI/release/package remain TypeScript-owned; inside-tmux current binding `display-message` fallbacks are superseded by the v0.6.67 `captureCurrentPaneBinding()` reuse cutover, detached target-based leader-pane `display-message` is superseded by the v0.6.68 `resolvePaneBindingAsync()` reuse cutover, and pane setup `list-panes` is superseded by the v0.6.69 `firstPaneInWindow()` reuse cutover.",
  'Because Go source changes, the existing embedded helper is rebuilt in the same approved path with refreshed manifest, checksums, provenance, and placeholder attestation.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0666/goSessionExistenceCutover.cjs`',
  '`tests/suites/go-kernel-v0666-go-session-existence-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.66 Go session existence cutover',
  'docs/perf/v0.6.66-go-session-existence-cutover.md',
  'tmux/windows.ts ensureSwarmWindow()` checks `createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)`',
  'Go `workerLifecycle.sessionExists` uses only exact `tmux has-session -t <sessionName>`',
  'missing session/helper failure/invalid response/empty session/pre-aborted/in-flight aborted signals fail closed to false',
  'new-session/new-window/post-creation list-windows/marking/labels remain TypeScript-owned',
  'pane setup list-panes is superseded by v0.6.69',
  'inside-tmux current binding display-message fallbacks are superseded by v0.6.67',
  '**v0.6.66 Go session existence cutover**',
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
  'postCreationWindowLookupMigrated: true',
  'paneSetupMigrated: true',
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

function hasGoToolchain() {
  return spawnSync('go', ['version'], { encoding: 'utf8' }).status === 0
}

function runGoHelper(root, request, env = {}) {
  return spawnSync('go', ['run', '.'], {
    cwd: path.join(root, 'kernel', 'go', 'agentteam-kernel'),
    input: `${JSON.stringify(request)}\n`,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, ...env, GO111MODULE: 'off', PATH: env.PATH || process.env.PATH || '' },
  })
}

function writeHelper(filePath, body) {
  fs.writeFileSync(filePath, ['#!/usr/bin/env node', body].join('\n') + '\n', 'utf8')
  fs.chmodSync(filePath, 0o755)
}

async function withTempHelper(source, callback) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0666-helper-'))
  try {
    const helperPath = path.join(tempRoot, 'helper.cjs')
    writeHelper(helperPath, source)
    return await callback(helperPath, tempRoot)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function helperSourceForWorkerLifecycle(responseExpression) {
  return `
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input.split('\\n')[0]) : {}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const health = { ok: true, implementation: 'go', protocolVersion: ${PROTOCOL_VERSION}, adapterVersion: '0.0.0-test', helperVersion: '${HELPER_VERSION}', capabilities: ${JSON.stringify(ACTIVE_CAPABILITIES)}, businessPathsConnected: false }
if (request.method === 'health') respond(health)
else if (request.method === 'workerLifecycle') {
  const params = request.params || {}
  respond((${responseExpression})(params))
}
else respond({ ok: false, operation: 'unknown', capability: 'workerLifecycle', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })
`
}

function writeFakeTmux(binDir) {
  fs.mkdirSync(binDir, { recursive: true })
  const tmuxPath = path.join(binDir, 'tmux')
  fs.writeFileSync(tmuxPath, [
    '#!/usr/bin/env node',
    "const args = process.argv.slice(2)",
    "if (args[0] === 'has-session' && args[1] === '-t') {",
    "  if (args[2] === 'team') process.exit(0)",
    "  if (args[2] === 'missing') process.exit(1)",
    "  process.exit(3)",
    "} else if (args[0] === 'list-windows' && args[1] === '-t') {",
    "  const session = args[2] || ''",
    "  const format = args[4] || ''",
    "  if (format !== '#{window_id}\\t#{@agentteam-window}') process.exit(4)",
    "  if (session === 'team') process.stdout.write('@7\\t1\\n')",
    "  else process.exit(5)",
    "} else if (args[0] === 'list-panes' && args[1] === '-a') {",
    "  process.stdout.write('%leader\\tsession:@1\\tleader\\tpi\\n')",
    "} else if (args[0] === 'display-message' && args[1] === '-p') {",
    "  process.stdout.write('%current\\tsession:@current\\n')",
    "} else process.exit(2)",
  ].join('\n') + '\n', 'utf8')
  fs.chmodSync(tmuxPath, 0o755)
  return tmuxPath
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goSessionExistenceCutover)), goSessionExistenceCutover)
  assert.equal(goSessionExistenceCutover.schemaVersion, GO_SESSION_EXISTENCE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goSessionExistenceCutover.theme, GO_SESSION_EXISTENCE_CUTOVER_THEME)
  assert.equal(goSessionExistenceCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goSessionExistenceCutover.helperVersion, HELPER_VERSION)
  assert.equal(goSessionExistenceCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goSessionExistenceCutover.capability, CAPABILITY)
  assert.equal(goSessionExistenceCutover.operation, OPERATION)
  assert.equal(goSessionExistenceCutover.facadeName, FACADE_NAME)
  assert.equal(goSessionExistenceCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goSessionExistenceCutover.kernelAdapterDelegation, KERNEL_ADAPTER_DELEGATION)
  assert.equal(goSessionExistenceCutover.goSessionExistsCommand, GO_SESSION_EXISTS_COMMAND)
  assert.equal(goSessionExistenceCutover.asyncAbortPolicy, ASYNC_ABORT_POLICY)
  assert.deepEqual(goSessionExistenceCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goSessionExistenceCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goSessionExistenceCutover.facadeCutoverMigrated, true)
  assert.equal(goSessionExistenceCutover.typescriptHasSessionFallbackRemoved, true)
  assert.equal(goSessionExistenceCutover.ensureSwarmWindowBehaviorPreserved, true)
  assert.equal(goSessionExistenceCutover.failClosedOnHelperFailure, true)
  assert.equal(goSessionExistenceCutover.failClosedOnMissingSession, true)
  assert.equal(goSessionExistenceCutover.failClosedOnEmptySessionName, true)
  assert.equal(goSessionExistenceCutover.failClosedOnAbort, true)
  assert.equal(goSessionExistenceCutover.rawOutputLeakageAllowed, false)
  assert.equal(goSessionExistenceCutover.hasSessionMigrated, true)
  assert.equal(goSessionExistenceCutover.newSessionMigrated, false)
  assert.equal(goSessionExistenceCutover.newWindowMigrated, false)
  assert.equal(goSessionExistenceCutover.postCreationWindowLookupMigrated, false)
  assert.equal(goSessionExistenceCutover.paneSetupMigrated, false)
  assert.equal(goSessionExistenceCutover.markWindowAsAgentTeamMigrated, false)
  assert.equal(goSessionExistenceCutover.refreshWindowPaneLabelsMigrated, false)
  assert.equal(goSessionExistenceCutover.createTeammatePaneMigrated, false)
  assert.equal(goSessionExistenceCutover.killPaneMigrated, false)
  assert.equal(goSessionExistenceCutover.stateRepositoryMigrated, false)
  assert.equal(goSessionExistenceCutover.taskReportPlanRunMigrated, false)
  assert.equal(goSessionExistenceCutover.teamPanelViewModelMigrated, false)
  assert.equal(goSessionExistenceCutover.releasePackageVerificationMigrated, false)
  assert.equal(goSessionExistenceCutover.nativeArtifactRenamed, false)
  assert.equal(goSessionExistenceCutover.nativeHelperRebuilt, true)
  assert.equal(goSessionExistenceCutover.goSourceChanged, true)
  assert.deepEqual(goSessionExistenceCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goSessionExistenceCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goSessionExistenceCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const processSource = read(root, TMUX_PROCESS)
  const coreSource = read(root, TMUX_CORE)
  const kernelSource = read(root, KERNEL)
  const goSource = read(root, GO_SOURCE)
  const builderSource = read(root, BUILDER)
  const verifierSource = read(root, VERIFIER)
  const discoveryBody = functionBody(windowsSource, 'findAgentTeamWindowTarget')
  const ensureBody = functionBody(windowsSource, FACADE_NAME)
  const waitBody = functionBody(processSource, 'waitForPaneAppStart')
  const ensureTmuxBody = functionBody(coreSource, 'ensureTmuxAvailable')

  assertIncludes(windowsSource, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", TMUX_WINDOWS)
  assertIncludes(ensureBody, KERNEL_ADAPTER_DELEGATION, `${TMUX_WINDOWS} session existence delegation`)
  assertIncludes(ensureBody, 'const hasSession = sessionResult.ok && sessionResult.exists', `${TMUX_WINDOWS} positive confirmation only`)
  assert.equal(ensureBody.includes("runTmuxNoThrowAsync(['has-session'"), false, 'ensureSwarmWindow must not retain direct has-session fallback')
  assert.equal(windowsSource.includes('runTmuxNoThrowAsync'), false, `${TMUX_WINDOWS} should no longer import no-throw tmux for has-session`)
  assert.equal(ensureBody.includes('stdout'), false, 'ensureSwarmWindow must not parse tmux stdout for session existence')
  assert.equal(ensureBody.includes('throw new Error') && ensureBody.includes('has-session'), false, 'session existence must not throw')

  assertIncludes(discoveryBody, 'createAgentTeamKernelAdapter().findAgentTeamWindowTargetAsync(sessionName, signal)', 'v0.6.65 window discovery remains Go-backed')
  assertIncludes(ensureBody, "runTmuxAsync(['new-session', '-d', '-s', SWARM_SESSION, '-n', SWARM_WINDOW]", 'new-session remains TS-owned')
  assertIncludes(ensureBody, "runTmuxAsync(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW]", 'new-window remains TS-owned')
  assertIncludes(ensureBody, "runTmuxAsync(['list-windows', '-t', SWARM_SESSION, '-F', '#{window_id}\\t#{window_name}']", 'post-creation window name lookup remains TS-owned')
  assertIncludes(ensureBody, 'firstPaneInWindow(initialTarget, signal)', 'pane setup first-pane lookup is superseded by v0.6.69')
  assert.equal(ensureBody.includes("runTmuxAsync(['list-panes', '-t', initialTarget, '-F', '#{pane_id}']"), false, 'direct pane setup list-panes is superseded by v0.6.69')
  assertIncludes(ensureBody, 'resolvePaneBindingAsync(leaderPaneId, signal)', 'detached leader target binding is superseded by v0.6.68')
  assert.equal(ensureBody.includes("runTmuxAsync(['display-message', '-p', '-t', leaderPaneId, '#{window_id}']"), false, 'detached target-based fallback is superseded by v0.6.68')
  assert.equal(ensureBody.includes("runTmuxAsync(['display-message', '-p', '#{session_name}:#{window_id}']"), false, 'inside-tmux current target fallback is superseded by v0.6.67')
  assert.equal(ensureBody.includes("runTmuxAsync(['display-message', '-p', '#{pane_id}']"), false, 'inside-tmux current pane fallback is superseded by v0.6.67')
  assertIncludes(ensureBody, 'await markWindowAsAgentTeam', 'marking remains TS-owned')
  assertIncludes(ensureBody, 'await refreshWindowPaneLabels', 'label refresh remains TS-owned')

  assertIncludes(waitBody, 'kernel.inspectWorkerPaneAsync(paneId, signal)', 'v0.6.64 app-start wait remains Go-backed')
  assertIncludes(ensureTmuxBody, 'createAgentTeamKernelAdapter().checkTmuxAvailableAsync(signal)', 'v0.6.63 tmux availability remains Go-backed')

  assertIncludes(kernelSource, 'export type AgentTeamKernelSessionExistence', KERNEL)
  assertIncludes(kernelSource, 'sessionExistsAsync(sessionName: string, signal?: AbortSignal): Promise<AgentTeamKernelSessionExistence>', KERNEL)
  assertIncludes(kernelSource, 'function validateSessionExistenceResult', KERNEL)
  assertIncludes(kernelSource, "callHelperAsync<unknown>('workerLifecycle', { operation: 'sessionExists', sessionName: requestedSessionName }, signal)", KERNEL)
  assertIncludes(kernelSource, "detail: 'aborted'", `${KERNEL} compact abort diagnostic`)

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  assertIncludes(goSource, 'type workerSessionExistenceResult struct', GO_SOURCE)
  assertIncludes(goSource, 'func sessionExists(params map[string]any) workerSessionExistenceResult', GO_SOURCE)
  assertIncludes(goSource, GO_SESSION_EXISTS_COMMAND, GO_SOURCE)
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include ${operation}`)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat\)/, 'inspect command remains global list-panes')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat\)/, 'window pane lookup remains approved list-panes')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-windows", "-t", sessionName, "-F", workerLifecycleAgentTeamWindowFormat\)/, 'window discovery remains approved list-windows')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'display-message remains current-pane only')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, `${GO_SOURCE} must not add target-based display-message`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
  for (const forbidden of ['PI_AGENTTEAM_HOME', 'team.json', 'agentteam_task', 'agentteam_receive', 'report_done', 'report_blocked', 'renderPanel', 'openTeamPanel', 'npm publish', 'npm version']) {
    assert.equal(goSource.includes(forbidden), false, `${GO_SOURCE} must not migrate ${forbidden}`)
  }

  assertIncludes(builderSource, 'runWorkerLifecycleSessionExistsSmoke', BUILDER)
  assertIncludes(builderSource, 'workerLifecycleSessionExists', BUILDER)
  assertIncludes(verifierSource, 'workerLifecycleSessionExists', VERIFIER)
}

async function assertAsyncHelperRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  await withTempHelper(helperSourceForWorkerLifecycle(`params => ({ ok: true, operation: 'sessionExists', capability: 'workerLifecycle', sessionName: params.sessionName, exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })`), async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, env: { PATH: process.env.PATH || '', TMUX: '/tmp/v0666', TMUX_PANE: '%pane' } })
    const result = await adapter.sessionExistsAsync('pi-agentteam')
    assert.equal(result.ok, true)
    assert.equal(result.exists, true)
    assert.equal(result.sessionName, 'pi-agentteam')
    assert.equal(adapter.metadata().kernel.fallbacks, 0)
  })

  await withTempHelper(helperSourceForWorkerLifecycle(`params => ({ ok: false, operation: 'sessionExists', capability: 'workerLifecycle', sessionName: params.sessionName, exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'missing', error: 'missing', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })`), async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
    const result = await adapter.sessionExistsAsync('pi-agentteam')
    assert.equal(result.ok, false)
    assert.equal(result.exists, false)
    assert.equal(result.failureKind, 'pane-not-found')
  })

  await withTempHelper(helperSourceForWorkerLifecycle(`params => ({ ok: true, operation: 'sessionExists', capability: 'workerLifecycle', sessionName: params.sessionName, exists: true, text: 'REPORT_BODY_SHOULD_NOT_LEAK', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })`), async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
    const result = await adapter.sessionExistsAsync('pi-agentteam')
    assert.equal(result.ok, false, 'unsafe response should fail closed')
    assert.equal(JSON.stringify(result).includes('REPORT_BODY_SHOULD_NOT_LEAK'), false)
  })

  await withTempHelper(helperSourceForWorkerLifecycle(`params => ({ ok: true, operation: 'sessionExists', capability: 'workerLifecycle', sessionName: params.sessionName, exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })`), async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
    const result = await adapter.sessionExistsAsync('bad session')
    assert.equal(result.ok, false)
    assert.equal(result.exists, false)
    assert.equal(result.failureKind, 'invalid-session')
  })
}

async function assertAbortRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  await withTempHelper(`
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input.split('\\n')[0]) : {}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const health = { ok: true, implementation: 'go', protocolVersion: ${PROTOCOL_VERSION}, adapterVersion: '0.0.0-test', helperVersion: '${HELPER_VERSION}', capabilities: ${JSON.stringify(ACTIVE_CAPABILITIES)}, businessPathsConnected: false }
if (request.method === 'health') setTimeout(() => respond(health), 200)
else if (request.method === 'workerLifecycle') setTimeout(() => respond({ ok: true, operation: 'sessionExists', capability: 'workerLifecycle', sessionName: request.params.sessionName, exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }), 500)
`, async helperPath => {
    const preAbort = new AbortController()
    preAbort.abort()
    const preAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, timeoutMs: 1000 })
    const preResult = await preAdapter.sessionExistsAsync('pi-agentteam', preAbort.signal)
    assert.equal(preResult.ok, false)
    assert.equal(preResult.exists, false)
    assert.equal(preResult.failureKind, 'helper-spawn-error')

    const controller = new AbortController()
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, timeoutMs: 1000 })
    const pending = adapter.sessionExistsAsync('pi-agentteam', controller.signal)
    setTimeout(() => controller.abort(), 50)
    const aborted = await pending
    assert.equal(aborted.ok, false)
    assert.equal(aborted.exists, false)
    assert.equal(aborted.failureKind, 'helper-spawn-error')
  })
}

function assertDirectGoBehavior(root) {
  if (!hasGoToolchain()) return
  const fakeTmuxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0666-fake-tmux-'))
  try {
    writeFakeTmux(fakeTmuxRoot)
    const env = { PATH: `${fakeTmuxRoot}${path.delimiter}${process.env.PATH || ''}`, TMUX: '/tmp/agentteam-v0666-fake-socket', TMUX_PANE: '%current' }
    const success = runGoHelper(root, { jsonrpc: '2.0', id: 'session-exists', method: 'workerLifecycle', params: { operation: 'sessionExists', sessionName: 'team' } }, env)
    assert.equal(success.status, 0, success.stderr)
    const successResponse = JSON.parse(success.stdout.trim())
    assert.equal(successResponse.result.ok, true)
    assert.equal(successResponse.result.operation, 'sessionExists')
    assert.equal(successResponse.result.sessionName, 'team')
    assert.equal(successResponse.result.exists, true)
    assert.equal(successResponse.result.readOnly, true)
    assert.equal(successResponse.result.tmuxMutation, false)

    const missing = runGoHelper(root, { jsonrpc: '2.0', id: 'session-missing', method: 'workerLifecycle', params: { operation: 'sessionExists', sessionName: 'missing' } }, env)
    const missingResponse = JSON.parse(missing.stdout.trim())
    assert.equal(missingResponse.result.ok, false)
    assert.equal(missingResponse.result.exists, false)
    assert.equal(missingResponse.result.failureKind, 'pane-not-found')

    const failed = runGoHelper(root, { jsonrpc: '2.0', id: 'session-failed', method: 'workerLifecycle', params: { operation: 'sessionExists', sessionName: 'failed' } }, env)
    const failedResponse = JSON.parse(failed.stdout.trim())
    assert.equal(failedResponse.result.ok, false)
    assert.equal(failedResponse.result.exists, false)
    assert.equal(failedResponse.result.failureKind, 'pane-not-found')

    const invalid = runGoHelper(root, { jsonrpc: '2.0', id: 'session-invalid', method: 'workerLifecycle', params: { operation: 'sessionExists', sessionName: 'bad session' } }, env)
    const invalidResponse = JSON.parse(invalid.stdout.trim())
    assert.equal(invalidResponse.result.ok, false)
    assert.equal(invalidResponse.result.failureKind, 'invalid-session')
  } finally {
    fs.rmSync(fakeTmuxRoot, { recursive: true, force: true })
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
  const provenance = JSON.parse(read(root, PROVENANCE))
  const checksums = read(root, CHECKSUMS)
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(provenance.smoke.workerLifecycleSessionExists.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found'])
  assert.equal(manifest.smoke.workerLifecycleSessionExists.acceptedFailureKinds.includes('tmux-unavailable'), true)
  assert.equal(checksums.includes(HELPER), true)
  assert.equal(checksums.includes(MANIFEST), true)
  assert.equal(checksums.includes(PROVENANCE), true)
  assert.equal(checksums.includes(ATTESTATION), true)
}

module.exports = {
  name: 'Go kernel v0.6.66 Go session existence cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeSource(root)
    await assertAsyncHelperRuntime(env)
    await assertAbortRuntime(env)
    assertDirectGoBehavior(root)
    assertPackageAndNativeGuards(root)
  },
}
