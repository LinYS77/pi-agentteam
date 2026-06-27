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
  GO_AGENTTEAM_WINDOW_DISCOVERY_CUTOVER_SCHEMA_VERSION,
  GO_AGENTTEAM_WINDOW_DISCOVERY_CUTOVER_THEME,
  GO_WINDOW_DISCOVERY_COMMAND,
  GO_WINDOW_DISCOVERY_FORMAT,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  goAgentTeamWindowDiscoveryCutover,
} = require('../fixtures/kernel/v0665/goAgentTeamWindowDiscoveryCutover.cjs')

const DOC = 'docs/perf/v0.6.65-go-agentteam-window-discovery-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0665/goAgentTeamWindowDiscoveryCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0665-go-agentteam-window-discovery-cutover.cjs'
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
  '# v0.6.65 Go AgentTeam Window Discovery Cutover',
  'Result: v0.6.65 cuts over `tmux/windows.ts` internal `findAgentTeamWindowTarget(sessionName, signal)` from direct TypeScript `list-windows` parsing to a narrow Go-backed `workerLifecycle.findAgentTeamWindowTarget` operation through the cancellable async kernel adapter seam.',
  '`tmux/windows.ts` `findAgentTeamWindowTarget(sessionName, signal)` now delegates to `createAgentTeamKernelAdapter().findAgentTeamWindowTargetAsync(sessionName, signal)`.',
  "The TypeScript `runTmuxNoThrowAsync(['list-windows', '-t', sessionName, '-F', '#{window_id}\\t#{@agentteam-window}'], undefined, signal)` fallback is removed from the discovery helper.",
  'Go uses exactly `tmux list-windows -t <sessionName> -F workerLifecycleAgentTeamWindowFormat` with compact format `#{window_id}\\t#{@agentteam-window}` for `workerLifecycle.findAgentTeamWindowTarget`.',
  'A marked agentteam window returns `${sessionName}:${windowId}` as before.',
  'No marked window, missing session, helper failure, invalid response, empty session name, pre-aborted signal, and in-flight abort fail closed to `null` so TypeScript-owned creation remains in place.',
  '`new-session`, `new-window`, list-panes during pane setup, marking, labels, kill, state/task/UI/release/package remain TypeScript-owned; `has-session` is superseded by the v0.6.66 `sessionExists` cutover, and inside-tmux current binding `display-message` fallbacks are superseded by the v0.6.67 `captureCurrentPaneBinding()` reuse cutover.',
  'Because Go source changes, the existing embedded helper is rebuilt in the same approved path with refreshed manifest, checksums, provenance, and placeholder attestation.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0665/goAgentTeamWindowDiscoveryCutover.cjs`',
  '`tests/suites/go-kernel-v0665-go-agentteam-window-discovery-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.65 Go agentteam window discovery cutover',
  'docs/perf/v0.6.65-go-agentteam-window-discovery-cutover.md',
  'tmux/windows.ts findAgentTeamWindowTarget(sessionName, signal) delegates to createAgentTeamKernelAdapter().findAgentTeamWindowTargetAsync(sessionName, signal)',
  'Go `workerLifecycle.findAgentTeamWindowTarget` uses only `tmux list-windows -t <sessionName> -F workerLifecycleAgentTeamWindowFormat`',
  'missing session/no marked window/helper failure/empty session/pre-aborted/in-flight aborted signals fail closed to null',
  'new-session/new-window/marking/labels/pane setup remain TypeScript-owned while has-session is superseded by v0.6.66',
  '**v0.6.65 Go agentteam window discovery cutover**',
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0665-helper-'))
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
    "if (args[0] === 'list-windows' && args[1] === '-t') {",
    "  const session = args[2] || ''",
    "  const format = args[4] || ''",
    "  if (format !== '#{window_id}\\t#{@agentteam-window}') process.exit(4)",
    "  if (session === 'team') process.stdout.write('@1\\t0\\n@7\\t1\\n@8\\t0\\n')",
    "  else if (session === 'unmarked') process.stdout.write('@1\\t0\\n@2\\t\\n')",
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
  assert.deepEqual(JSON.parse(JSON.stringify(goAgentTeamWindowDiscoveryCutover)), goAgentTeamWindowDiscoveryCutover)
  assert.equal(goAgentTeamWindowDiscoveryCutover.schemaVersion, GO_AGENTTEAM_WINDOW_DISCOVERY_CUTOVER_SCHEMA_VERSION)
  assert.equal(goAgentTeamWindowDiscoveryCutover.theme, GO_AGENTTEAM_WINDOW_DISCOVERY_CUTOVER_THEME)
  assert.equal(goAgentTeamWindowDiscoveryCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goAgentTeamWindowDiscoveryCutover.helperVersion, HELPER_VERSION)
  assert.equal(goAgentTeamWindowDiscoveryCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goAgentTeamWindowDiscoveryCutover.capability, CAPABILITY)
  assert.equal(goAgentTeamWindowDiscoveryCutover.operation, OPERATION)
  assert.equal(goAgentTeamWindowDiscoveryCutover.facadeName, FACADE_NAME)
  assert.equal(goAgentTeamWindowDiscoveryCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goAgentTeamWindowDiscoveryCutover.kernelAdapterDelegation, KERNEL_ADAPTER_DELEGATION)
  assert.equal(goAgentTeamWindowDiscoveryCutover.goWindowDiscoveryCommand, GO_WINDOW_DISCOVERY_COMMAND)
  assert.equal(goAgentTeamWindowDiscoveryCutover.goWindowDiscoveryFormat, GO_WINDOW_DISCOVERY_FORMAT)
  assert.equal(goAgentTeamWindowDiscoveryCutover.asyncAbortPolicy, ASYNC_ABORT_POLICY)
  assert.deepEqual(goAgentTeamWindowDiscoveryCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goAgentTeamWindowDiscoveryCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goAgentTeamWindowDiscoveryCutover.facadeCutoverMigrated, true)
  assert.equal(goAgentTeamWindowDiscoveryCutover.typescriptListWindowsFallbackRemoved, true)
  assert.equal(goAgentTeamWindowDiscoveryCutover.ensureSwarmWindowBehaviorPreserved, true)
  assert.equal(goAgentTeamWindowDiscoveryCutover.failClosedOnHelperFailure, true)
  assert.equal(goAgentTeamWindowDiscoveryCutover.failClosedOnMissingSession, true)
  assert.equal(goAgentTeamWindowDiscoveryCutover.failClosedOnNoMarkedWindow, true)
  assert.equal(goAgentTeamWindowDiscoveryCutover.failClosedOnEmptySessionName, true)
  assert.equal(goAgentTeamWindowDiscoveryCutover.failClosedOnAbort, true)
  assert.equal(goAgentTeamWindowDiscoveryCutover.rawOutputLeakageAllowed, false)
  assert.equal(goAgentTeamWindowDiscoveryCutover.hasSessionMigrated, true)
  assert.equal(goAgentTeamWindowDiscoveryCutover.newSessionMigrated, false)
  assert.equal(goAgentTeamWindowDiscoveryCutover.newWindowMigrated, false)
  assert.equal(goAgentTeamWindowDiscoveryCutover.markWindowAsAgentTeamMigrated, false)
  assert.equal(goAgentTeamWindowDiscoveryCutover.refreshWindowPaneLabelsMigrated, false)
  assert.equal(goAgentTeamWindowDiscoveryCutover.createTeammatePaneMigrated, false)
  assert.equal(goAgentTeamWindowDiscoveryCutover.killPaneMigrated, false)
  assert.equal(goAgentTeamWindowDiscoveryCutover.stateRepositoryMigrated, false)
  assert.equal(goAgentTeamWindowDiscoveryCutover.taskReportPlanRunMigrated, false)
  assert.equal(goAgentTeamWindowDiscoveryCutover.teamPanelViewModelMigrated, false)
  assert.equal(goAgentTeamWindowDiscoveryCutover.releasePackageVerificationMigrated, false)
  assert.equal(goAgentTeamWindowDiscoveryCutover.nativeArtifactRenamed, false)
  assert.equal(goAgentTeamWindowDiscoveryCutover.nativeHelperRebuilt, true)
  assert.equal(goAgentTeamWindowDiscoveryCutover.goSourceChanged, true)
  assert.deepEqual(goAgentTeamWindowDiscoveryCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goAgentTeamWindowDiscoveryCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goAgentTeamWindowDiscoveryCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const discoveryBody = functionBody(windowsSource, FACADE_NAME)
  const ensureBody = functionBody(windowsSource, 'ensureSwarmWindow')
  const waitBody = functionBody(processSource, 'waitForPaneAppStart')
  const ensureTmuxBody = functionBody(coreSource, 'ensureTmuxAvailable')

  assertIncludes(windowsSource, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", TMUX_WINDOWS)
  assertIncludes(discoveryBody, KERNEL_ADAPTER_DELEGATION, `${TMUX_WINDOWS} discovery delegation`)
  assertIncludes(discoveryBody, 'if (!sessionName || signal?.aborted) return null', `${TMUX_WINDOWS} empty/preabort fail closed`)
  assertIncludes(discoveryBody, 'if (!result.ok || !result.target) return null', `${TMUX_WINDOWS} helper failure fail closed`)
  assert.equal(discoveryBody.includes("runTmuxNoThrowAsync(['list-windows'"), false, 'discovery helper must not retain direct list-windows fallback')
  assert.equal(discoveryBody.includes('stdout'), false, 'discovery helper must not parse tmux stdout')
  assert.equal(discoveryBody.includes('@agentteam-window'), false, 'discovery helper must not parse marker in TypeScript')
  assert.equal(discoveryBody.includes('throw new Error'), false, 'discovery helper must not throw')

  assertIncludes(ensureBody, 'createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)', 'has-session later v0.6.66 cutover')
  assert.equal(ensureBody.includes("runTmuxNoThrowAsync(['has-session'"), false, 'has-session direct TS fallback is superseded by v0.6.66')
  assertIncludes(ensureBody, "runTmuxAsync(['new-session', '-d', '-s', SWARM_SESSION, '-n', SWARM_WINDOW]", 'new-session remains TS-owned')
  assertIncludes(ensureBody, "runTmuxAsync(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW]", 'new-window remains TS-owned')
  assertIncludes(ensureBody, "runTmuxAsync(['list-windows', '-t', SWARM_SESSION, '-F', '#{window_id}\\t#{window_name}']", 'post-creation window name lookup remains TS-owned')
  assertIncludes(ensureBody, "runTmuxAsync(['list-panes', '-t', initialTarget, '-F', '#{pane_id}']", 'pane setup list-panes remains TS-owned')
  assertIncludes(ensureBody, 'resolvePaneBindingAsync(leaderPaneId, signal)', 'detached leader target binding is superseded by v0.6.68')
  assert.equal(ensureBody.includes("runTmuxAsync(['display-message', '-p', '-t', leaderPaneId, '#{window_id}']"), false, 'detached target-based fallback is superseded by v0.6.68')
  assert.equal(ensureBody.includes("runTmuxAsync(['display-message', '-p', '#{session_name}:#{window_id}']"), false, 'inside-tmux current target fallback is superseded by v0.6.67')
  assert.equal(ensureBody.includes("runTmuxAsync(['display-message', '-p', '#{pane_id}']"), false, 'inside-tmux current pane fallback is superseded by v0.6.67')
  assertIncludes(ensureBody, 'await markWindowAsAgentTeam', 'marking remains TS-owned')
  assertIncludes(ensureBody, 'await refreshWindowPaneLabels', 'label refresh remains TS-owned')

  assertIncludes(waitBody, 'kernel.inspectWorkerPaneAsync(paneId, signal)', 'v0.6.64 app-start wait remains Go-backed')
  assertIncludes(ensureTmuxBody, 'createAgentTeamKernelAdapter().checkTmuxAvailableAsync(signal)', 'v0.6.63 tmux availability remains Go-backed')

  assertIncludes(kernelSource, 'export type AgentTeamKernelAgentTeamWindowTarget', KERNEL)
  assertIncludes(kernelSource, 'findAgentTeamWindowTargetAsync(sessionName: string, signal?: AbortSignal): Promise<AgentTeamKernelAgentTeamWindowTarget>', KERNEL)
  assertIncludes(kernelSource, 'function compactTmuxSessionName', KERNEL)
  assertIncludes(kernelSource, 'function validateAgentTeamWindowTargetResult', KERNEL)
  assertIncludes(kernelSource, "callHelperAsync<unknown>('workerLifecycle', { operation: 'findAgentTeamWindowTarget', sessionName: requestedSessionName }, signal)", KERNEL)
  assertIncludes(kernelSource, "detail: 'aborted'", `${KERNEL} compact abort diagnostic`)

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  assertIncludes(goSource, 'const workerLifecycleAgentTeamWindowFormat = "#{window_id}\\t#{@agentteam-window}"', GO_SOURCE)
  assertIncludes(goSource, 'type workerAgentTeamWindowTargetResult struct', GO_SOURCE)
  assertIncludes(goSource, 'func findAgentTeamWindowTarget(params map[string]any) workerAgentTeamWindowTargetResult', GO_SOURCE)
  assertIncludes(goSource, GO_WINDOW_DISCOVERY_COMMAND, GO_SOURCE)
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include ${operation}`)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat\)/, 'inspect command remains global list-panes')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat\)/, 'window pane lookup remains approved list-panes')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'display-message remains current-pane only')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, `${GO_SOURCE} must not add target-based display-message`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
  for (const forbidden of ['PI_AGENTTEAM_HOME', 'team.json', 'agentteam_task', 'agentteam_receive', 'report_done', 'report_blocked', 'renderPanel', 'openTeamPanel', 'npm publish', 'npm version']) {
    assert.equal(goSource.includes(forbidden), false, `${GO_SOURCE} must not migrate ${forbidden}`)
  }

  assertIncludes(builderSource, 'runWorkerLifecycleFindAgentTeamWindowTargetSmoke', BUILDER)
  assertIncludes(builderSource, 'workerLifecycleFindAgentTeamWindowTarget', BUILDER)
  assertIncludes(builderSource, 'workerLifecycleSessionExists', BUILDER)
  assertIncludes(verifierSource, 'workerLifecycleFindAgentTeamWindowTarget', VERIFIER)
  assertIncludes(verifierSource, 'workerLifecycleSessionExists', VERIFIER)
}

async function assertAsyncHelperRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  await withTempHelper(helperSourceForWorkerLifecycle(`params => ({ ok: true, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', sessionName: params.sessionName, exists: true, target: params.sessionName + ':@9', windowId: '@9', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })`), async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, env: { PATH: process.env.PATH || '', TMUX: '/tmp/v0665', TMUX_PANE: '%pane' } })
    const result = await adapter.findAgentTeamWindowTargetAsync('pi-agentteam')
    assert.equal(result.ok, true)
    assert.equal(result.target, 'pi-agentteam:@9')
    assert.equal(adapter.metadata().kernel.fallbacks, 0)
  })

  await withTempHelper(helperSourceForWorkerLifecycle(`params => ({ ok: true, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', sessionName: params.sessionName, exists: true, target: 'MAILBOX_BODY_SHOULD_NOT_LEAK', windowId: '@1', text: 'REPORT_BODY_SHOULD_NOT_LEAK', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })`), async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
    const result = await adapter.findAgentTeamWindowTargetAsync('pi-agentteam')
    assert.equal(result.ok, false, 'unsafe response should fail closed')
    assert.equal(JSON.stringify(result).includes('MAILBOX_BODY_SHOULD_NOT_LEAK'), false)
    assert.equal(JSON.stringify(result).includes('REPORT_BODY_SHOULD_NOT_LEAK'), false)
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
else if (request.method === 'workerLifecycle') setTimeout(() => respond({ ok: true, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', sessionName: request.params.sessionName, exists: true, target: request.params.sessionName + ':@late', windowId: '@late', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }), 500)
`, async helperPath => {
    const preAbort = new AbortController()
    preAbort.abort()
    const preAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, timeoutMs: 1000 })
    const preResult = await preAdapter.findAgentTeamWindowTargetAsync('pi-agentteam', preAbort.signal)
    assert.equal(preResult.ok, false)
    assert.equal(preResult.failureKind, 'helper-spawn-error')

    const controller = new AbortController()
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, timeoutMs: 1000 })
    const pending = adapter.findAgentTeamWindowTargetAsync('pi-agentteam', controller.signal)
    setTimeout(() => controller.abort(), 50)
    const aborted = await pending
    assert.equal(aborted.ok, false)
    assert.equal(aborted.failureKind, 'helper-spawn-error')
  })
}

function assertDirectGoBehavior(root) {
  if (!hasGoToolchain()) return
  const fakeTmuxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0665-fake-tmux-'))
  try {
    writeFakeTmux(fakeTmuxRoot)
    const env = { PATH: `${fakeTmuxRoot}${path.delimiter}${process.env.PATH || ''}`, TMUX: '/tmp/agentteam-v0665-fake-socket', TMUX_PANE: '%current' }
    const success = runGoHelper(root, { jsonrpc: '2.0', id: 'window-target', method: 'workerLifecycle', params: { operation: 'findAgentTeamWindowTarget', sessionName: 'team' } }, env)
    assert.equal(success.status, 0, success.stderr)
    const successResponse = JSON.parse(success.stdout.trim())
    assert.equal(successResponse.result.ok, true)
    assert.equal(successResponse.result.operation, 'findAgentTeamWindowTarget')
    assert.equal(successResponse.result.target, 'team:@7')
    assert.equal(successResponse.result.windowId, '@7')
    assert.equal(successResponse.result.readOnly, true)
    assert.equal(successResponse.result.tmuxMutation, false)

    const unmarked = runGoHelper(root, { jsonrpc: '2.0', id: 'window-unmarked', method: 'workerLifecycle', params: { operation: 'findAgentTeamWindowTarget', sessionName: 'unmarked' } }, env)
    const unmarkedResponse = JSON.parse(unmarked.stdout.trim())
    assert.equal(unmarkedResponse.result.ok, false)
    assert.equal(unmarkedResponse.result.failureKind, 'pane-not-found')

    const missing = runGoHelper(root, { jsonrpc: '2.0', id: 'window-missing', method: 'workerLifecycle', params: { operation: 'findAgentTeamWindowTarget', sessionName: 'missing' } }, env)
    const missingResponse = JSON.parse(missing.stdout.trim())
    assert.equal(missingResponse.result.ok, false)
    assert.equal(missingResponse.result.failureKind, 'tmux-command-failed')

    const invalid = runGoHelper(root, { jsonrpc: '2.0', id: 'window-invalid', method: 'workerLifecycle', params: { operation: 'findAgentTeamWindowTarget', sessionName: 'bad session' } }, env)
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
  assert.deepEqual(provenance.smoke.workerLifecycleFindAgentTeamWindowTarget.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found'])
  assert.deepEqual(provenance.smoke.workerLifecycleSessionExists.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found'])
  assert.equal(manifest.smoke.workerLifecycleFindAgentTeamWindowTarget.acceptedFailureKinds.includes('tmux-unavailable'), true)
  assert.equal(manifest.smoke.workerLifecycleSessionExists.acceptedFailureKinds.includes('tmux-unavailable'), true)
  assert.equal(checksums.includes(HELPER), true)
  assert.equal(checksums.includes(MANIFEST), true)
  assert.equal(checksums.includes(PROVENANCE), true)
  assert.equal(checksums.includes(ATTESTATION), true)
}

module.exports = {
  name: 'Go kernel v0.6.65 Go agentteam window discovery cutover',
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
