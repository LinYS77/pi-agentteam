const assert = require('node:assert/strict')
const crypto = require('node:crypto')
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
  DIRECT_TYPESCRIPT_NEW_SESSION_COMMANDS,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_DETACHED_NEW_SESSION_CUTOVER_SCHEMA_VERSION,
  GO_DETACHED_NEW_SESSION_CUTOVER_THEME,
  GO_SOURCE_FILE,
  HELPER_NAME,
  HELPER_VERSION,
  INPUT_POLICY,
  KERNEL_FILE,
  LABELS_FILE,
  NATIVE_ARTIFACT_SNAPSHOT,
  NATIVE_ROOT,
  OPERATION,
  PACKAGE_VERSION,
  PANES_FILE,
  PRESERVED_BOUNDARIES,
  PRESERVED_TYPESCRIPT_SURFACE,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  VERIFIER_FILE,
  goDetachedNewSessionCutover,
} = require('../fixtures/kernel/v0682/goDetachedNewSessionCutover.cjs')

const DOC = 'docs/perf/v0.6.82-go-detached-new-session-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0682/goDetachedNewSessionCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0682-go-detached-new-session-cutover.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_COMMANDS = [
  'tmux new-session -d -s <SWARM_SESSION> -n <SWARM_WINDOW>',
]
const REQUIRED_DOC = [
  '# v0.6.82 Go Detached New-Session Cutover',
  'Result: v0.6.82 cuts over only the detached missing-session `tmux/windows.ts ensureSwarmWindow(...)` `new-session` command to Go-backed `workerLifecycle.createDetachedSwarmSession` behind the TypeScript facade.',
  '`tmux/windows.ts ensureSwarmWindow(...)` no longer calls direct TypeScript `runTmuxAsync(...)` for the detached missing-session `new-session` command.',
  '`createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)`',
  '`tmux new-session -d -s <SWARM_SESSION> -n <SWARM_WINDOW>`',
  'Future/current Go passes the session and window names as argv values only, never shell-interpolates them.',
  'raw tmux stdout/stderr/helper output must not leak',
  'On compact helper failure, the TypeScript facade throws a compact `Error` from the validated helper failure reason',
  '`markWindowAsAgentTeam(`${SWARM_SESSION}:${SWARM_WINDOW}`, signal)` still runs after successful session creation.',
  '`new-window` remains TypeScript-owned and unchanged.',
  '`createTeammatePane(...)` remains the v0.6.80 Go-backed pane split/layout/resize cutover and is not changed here.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0682/goDetachedNewSessionCutover.cjs`',
  '`tests/suites/go-kernel-v0682-go-detached-new-session-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.82 Go detached new-session cutover',
  'docs/perf/v0.6.82-go-detached-new-session-cutover.md',
  '`tmux/windows.ts ensureSwarmWindow(...)` delegates only the detached missing-session `new-session` command to `createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)`',
  'Go `workerLifecycle.createDetachedSwarmSession` uses only `tmux new-session -d -s <SWARM_SESSION> -n <SWARM_WINDOW>`',
  '`new-window`, inside-tmux branch, broader `ensureSwarmWindow(...)` orchestration, post-creation lookup, marking/labels, and createTeammatePane remain out of scope',
  'direct TypeScript `runTmuxAsync([\'new-session\'...])` fallback is removed for that detached missing-session behavior',
  '**v0.6.82 Go detached new-session cutover**',
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
  'newWindowMigrated: true',
  'insideTmuxBranchMigrated: true',
  'postCreationWindowLookupMigrated: true',
  'wakePaneMigrated: true',
  'killPaneMigrated: true',
  'stateRepositoryMigrated: true',
  'taskReportPlanRunMigrated: true',
  'teamPanelViewModelMigrated: true',
  'releasePackageVerificationMigrated: true',
  'nativeArtifactRenamed: true',
]
const BAD_HELPER_OUTPUT = 'DETACHED_NEW_SESSION_BAD_HELPER_OUTPUT_SHOULD_NOT_LEAK'
const BAD_RAW_SESSION = 'DETACHED_NEW_SESSION_RAW_SESSION_OR_WINDOW_SHOULD_NOT_LEAK 🚫'

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

function writeHelper(name, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-v0682-${name}-`))
  const file = path.join(dir, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return { dir, file }
}

function assertNoBadDetachedSessionLeak(value) {
  const text = JSON.stringify(value)
  assert.equal(text.includes(BAD_HELPER_OUTPUT), false, 'createDetachedSwarmSession diagnostics must not leak raw helper/stdout/stderr text')
  assert.equal(text.includes(BAD_RAW_SESSION), false, 'createDetachedSwarmSession diagnostics must not leak raw session/window text')
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goDetachedNewSessionCutover)), goDetachedNewSessionCutover)
  assert.equal(goDetachedNewSessionCutover.schemaVersion, GO_DETACHED_NEW_SESSION_CUTOVER_SCHEMA_VERSION)
  assert.equal(goDetachedNewSessionCutover.theme, GO_DETACHED_NEW_SESSION_CUTOVER_THEME)
  assert.equal(goDetachedNewSessionCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goDetachedNewSessionCutover.helperVersion, HELPER_VERSION)
  assert.equal(goDetachedNewSessionCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goDetachedNewSessionCutover.capability, CAPABILITY)
  assert.equal(goDetachedNewSessionCutover.operation, OPERATION)
  assert.equal(goDetachedNewSessionCutover.helperName, HELPER_NAME)
  assert.equal(goDetachedNewSessionCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goDetachedNewSessionCutover.panesFile, PANES_FILE)
  assert.equal(goDetachedNewSessionCutover.labelsFile, LABELS_FILE)
  assert.equal(goDetachedNewSessionCutover.kernelFile, KERNEL_FILE)
  assert.equal(goDetachedNewSessionCutover.goSourceFile, GO_SOURCE_FILE)
  assert.equal(goDetachedNewSessionCutover.builderFile, BUILDER_FILE)
  assert.equal(goDetachedNewSessionCutover.verifierFile, VERIFIER_FILE)
  assert.equal(goDetachedNewSessionCutover.nativeRoot, NATIVE_ROOT)
  assert.equal(goDetachedNewSessionCutover.adapterDelegation, ADAPTER_DELEGATION)
  assert.deepEqual(goDetachedNewSessionCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goDetachedNewSessionCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(goDetachedNewSessionCutover.authorizedTmuxCommands, [...AUTHORIZED_TMUX_COMMANDS])
  assert.deepEqual(goDetachedNewSessionCutover.preservedTypescriptSurface, PRESERVED_TYPESCRIPT_SURFACE)
  assert.deepEqual(goDetachedNewSessionCutover.directTypescriptNewSessionCommands, [...DIRECT_TYPESCRIPT_NEW_SESSION_COMMANDS])
  assert.deepEqual(goDetachedNewSessionCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goDetachedNewSessionCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goDetachedNewSessionCutover.inputPolicy, INPUT_POLICY)
  assert.deepEqual(goDetachedNewSessionCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(goDetachedNewSessionCutover.nativeArtifactSnapshot, NATIVE_ARTIFACT_SNAPSHOT)
  assert.deepEqual(AUTHORIZED_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_COMMANDS)
  assert.equal(AUTHORIZED_TMUX_COMMANDS.length, 1)
  assert.equal(AUTHORIZED_TMUX_COMMANDS[0].command, 'new-session')
  assert.deepEqual(AUTHORIZED_TMUX_COMMANDS[0].args, ['new-session', '-d', '-s', '<SWARM_SESSION>', '-n', '<SWARM_WINDOW>'])
  assert.equal(AUTHORIZED_TMUX_COMMANDS.some(command => command.command === 'new-window'), false)
  assert.equal(AUTHORIZED_TMUX_COMMANDS.some(command => command.command === 'split-window'), false)
  assert.equal(INPUT_POLICY.argvOnly, true)
  assert.equal(INPUT_POLICY.shellInterpolationAllowed, false)
  assert.equal(goDetachedNewSessionCutover.facadeCutoverMigrated, true)
  assert.equal(goDetachedNewSessionCutover.detachedNewSessionMigrated, true)
  assert.equal(goDetachedNewSessionCutover.typescriptNewSessionFallbackRemoved, true)
  assert.equal(goDetachedNewSessionCutover.noHiddenTypescriptFallbackAfterCutover, true)
  assert.equal(goDetachedNewSessionCutover.thrownCreateFailuresPreserved, true)
  assert.equal(goDetachedNewSessionCutover.ensureSwarmWindowMigrated, false)
  assert.equal(goDetachedNewSessionCutover.newWindowMigrated, false)
  assert.equal(goDetachedNewSessionCutover.insideTmuxBranchMigrated, false)
  assert.equal(goDetachedNewSessionCutover.postCreationWindowLookupMigrated, false)
  assert.equal(goDetachedNewSessionCutover.createTeammatePaneChanged, false)
  assert.equal(goDetachedNewSessionCutover.nativeArtifactRenamed, false)
  assert.equal(goDetachedNewSessionCutover.nativeHelperRebuilt, true)
  assert.equal(goDetachedNewSessionCutover.packageVersionChanged, false)
  assert.equal(goDetachedNewSessionCutover.packageReleaseApproved, false)
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
  const windowsSource = read(root, RUNTIME_FILE)
  const panesSource = read(root, PANES_FILE)
  const labelsSource = read(root, LABELS_FILE)
  const ensureBody = functionBody(windowsSource, HELPER_NAME === 'createDetachedSwarmSession' ? 'ensureSwarmWindow' : 'ensureSwarmWindow')

  assertIncludes(windowsSource, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", RUNTIME_FILE)
  assertIncludes(windowsSource, "import { runTmuxAsync } from './client.js'", RUNTIME_FILE)
  assertIncludes(ensureBody, PRESERVED_TYPESCRIPT_SURFACE.sessionExistsCall, `${RUNTIME_FILE} sessionExists preserved`)
  assertIncludes(ensureBody, PRESERVED_TYPESCRIPT_SURFACE.hasSessionCheck, `${RUNTIME_FILE} hasSession preserved`)
  assertIncludes(ensureBody, `const createdSession = await ${ADAPTER_DELEGATION}`, `${RUNTIME_FILE} detached new-session adapter seam`)
  assertIncludes(ensureBody, "throw new Error(createdSession.reason || 'Go worker lifecycle createDetachedSwarmSession unavailable (previous-helper-failure)')", `${RUNTIME_FILE} compact throw`)
  assertIncludes(ensureBody, PRESERVED_TYPESCRIPT_SURFACE.markAfterCreateCall, `${RUNTIME_FILE} mark after successful create preserved`)
  assertIncludes(ensureBody, `await ${PRESERVED_TYPESCRIPT_SURFACE.newWindowCall}`, `${RUNTIME_FILE} detached new-window remains TS-owned`)
  assertIncludes(ensureBody, PRESERVED_TYPESCRIPT_SURFACE.postCreationLookupCall, `${RUNTIME_FILE} post-creation lookup preserved`)
  assertIncludes(ensureBody, PRESERVED_TYPESCRIPT_SURFACE.findWindowByNameCall, `${RUNTIME_FILE} findWindowTargetByName preserved`)
  assertIncludes(ensureBody, PRESERVED_TYPESCRIPT_SURFACE.firstPaneLookupCall, `${RUNTIME_FILE} firstPaneInWindow preserved`)
  assertIncludes(ensureBody, PRESERVED_TYPESCRIPT_SURFACE.leaderBindingLookupCall, `${RUNTIME_FILE} resolvePaneBindingAsync preserved`)
  for (const forbidden of DIRECT_TYPESCRIPT_NEW_SESSION_COMMANDS) assert.equal(ensureBody.includes(forbidden), false, `${RUNTIME_FILE} must remove direct TS new-session fallback ${forbidden}`)
  assert.equal([...ensureBody.matchAll(/runTmuxAsync\(\['new-session'/g)].length, 0, `${RUNTIME_FILE} must not retain direct detached new-session fallback`)
  assert.equal([...ensureBody.matchAll(/runTmuxAsync\(\['new-window'/g)].length, 1, `${RUNTIME_FILE} must keep exactly one detached new-window fallback`)

  assertIncludes(panesSource, 'createAgentTeamKernelAdapter().createTeammatePaneAsync({', `${PANES_FILE} v0.6.80 createTeammatePane preserved`)
  assertIncludes(labelsSource, 'createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)', `${LABELS_FILE} mark helper preserved`)
  assertIncludes(labelsSource, 'createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)', `${LABELS_FILE} refresh helper preserved`)
}

async function assertAdapterNoLeakAndCompactFailures(distRoot) {
  const kernel = require(path.join(distRoot, 'core/kernel.js'))
  const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(distRoot, 'missing-detached-session-helper'), env: {} })

  const invalidSession = await adapter.createDetachedSwarmSessionAsync(BAD_RAW_SESSION, BAD_RAW_SESSION)
  assert.equal(invalidSession.ok, false)
  assert.equal(invalidSession.operation, OPERATION)
  assert.equal(invalidSession.failureKind, 'invalid-session')
  assertNoBadDetachedSessionLeak(invalidSession)

  const invalidWindow = await adapter.createDetachedSwarmSessionAsync('agentteam', BAD_RAW_SESSION)
  assert.equal(invalidWindow.ok, false)
  assert.equal(invalidWindow.operation, OPERATION)
  assert.equal(invalidWindow.failureKind, 'invalid-window-name')
  assertNoBadDetachedSessionLeak(invalidWindow)

  const missingHelper = await adapter.createDetachedSwarmSessionAsync('agentteam', 'agentteam')
  assert.equal(missingHelper.ok, false)
  assert.equal(missingHelper.operation, OPERATION)
  assertNoBadDetachedSessionLeak(missingHelper)

  const malicious = writeHelper('malicious-detached-session-output', `#!/usr/bin/env node
const fs = require('node:fs')
const request = JSON.parse(fs.readFileSync(0, 'utf8').trim())
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const baseHealth = { ok: true, implementation: 'go', protocolVersion: 1, helperVersion: '0.3.0-read-model-shadow', capabilities: ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'], businessPathsConnected: false }
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'workerLifecycle') respond({ ok: false, operation: 'createDetachedSwarmSession', capability: 'workerLifecycle', sessionName: 'agentteam', windowName: 'agentteam', created: false, status: 'unknown', resultMarker: 'stale', failureKind: 'tmux-command-failed', reason: '${BAD_HELPER_OUTPUT}', error: '${BAD_HELPER_OUTPUT}', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true })
else respond(baseHealth)
`)
  try {
    const maliciousAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: malicious.file, env: {} })
    const leaked = await maliciousAdapter.createDetachedSwarmSessionAsync('agentteam', 'agentteam')
    assert.equal(leaked.ok, false)
    assert.equal(leaked.failureKind, 'tmux-command-failed')
    assertNoBadDetachedSessionLeak(leaked)
  } finally {
    fs.rmSync(malicious.dir, { recursive: true, force: true })
  }
}

function assertKernelRuntime(root) {
  const kernelSource = read(root, KERNEL_FILE)
  assertIncludes(kernelSource, 'export type AgentTeamKernelDetachedSwarmSessionCreation', KERNEL_FILE)
  assertIncludes(kernelSource, 'createDetachedSwarmSessionAsync(sessionName: string, windowName: string, signal?: AbortSignal): Promise<AgentTeamKernelDetachedSwarmSessionCreation>', KERNEL_FILE)
  assertIncludes(kernelSource, 'workerLifecycleCreateDetachedSwarmSessionConnected', KERNEL_FILE)
  assertIncludes(kernelSource, 'workerLifecycleUnavailableDetachedSwarmSessionCreation', KERNEL_FILE)
  assertIncludes(kernelSource, 'validateDetachedSwarmSessionCreationResult', KERNEL_FILE)
  assertIncludes(kernelSource, "operation: 'createDetachedSwarmSession'", KERNEL_FILE)
  assertIncludes(kernelSource, "const helperResult = await callHelperAsync<unknown>('workerLifecycle', { operation: 'createDetachedSwarmSession', sessionName: requestedSessionName, windowName: requestedWindowName }, signal)", KERNEL_FILE)
  assertIncludes(kernelSource, 'compactTmuxSessionName(sessionName)', `${KERNEL_FILE} session validation`)
  assertIncludes(kernelSource, 'compactTmuxWindowName(windowName)', `${KERNEL_FILE} window validation`)
}

function assertGoRuntime(root) {
  const goSource = read(root, GO_SOURCE_FILE)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE_FILE} should include workerLifecycle ${operation}`)
  assertIncludes(goSource, 'type workerDetachedSwarmSessionCreationResult struct', GO_SOURCE_FILE)
  assertIncludes(goSource, '"workerLifecycleCreateDetachedSwarmSessionConnected": true', `${GO_SOURCE_FILE} profile flag`)
  assertIncludes(goSource, 'func unavailableDetachedSwarmSessionCreation(sessionName string, windowName string, kind string) workerDetachedSwarmSessionCreationResult', GO_SOURCE_FILE)
  assertIncludes(goSource, 'func runDetachedSwarmSessionCreation(sessionName string, windowName string) string', GO_SOURCE_FILE)
  assertIncludes(goSource, 'func createDetachedSwarmSession(params map[string]any) workerDetachedSwarmSessionCreationResult', GO_SOURCE_FILE)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "new-session", "-d", "-s", sessionName, "-n", windowName)', `${GO_SOURCE_FILE} authorized argv-only new-session`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "new-session", "-d", "-s", sessionName, "-n", windowName\)/g)].length, 1, `${GO_SOURCE_FILE} must contain exactly one authorized new-session command`)
  assertIncludes(goSource, 'sessionName := compactTmuxSessionName(stringParam(params, "sessionName"))', `${GO_SOURCE_FILE} compact session validation`)
  assertIncludes(goSource, 'windowName := compactTmuxWindowName(stringParam(params, "windowName"))', `${GO_SOURCE_FILE} compact window validation`)
  assertIncludes(goSource, 'runCreateTeammatePaneTmuxOutput("list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat)', `${GO_SOURCE_FILE} v0.6.80 createTeammatePane preserved`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE_FILE} must not add forbidden command ${command}`)
  assert.equal(/exec\.Command\s*\(/.test(goSource), false, `${GO_SOURCE_FILE} must not use shell-capable exec.Command`)
  assert.equal(/"(?:sh|bash|zsh|fish)"/.test(goSource), false, `${GO_SOURCE_FILE} must not invoke shells`)
}

function assertArtifactPipelineAndNative(root) {
  const builder = read(root, BUILDER_FILE)
  const verifier = read(root, VERIFIER_FILE)
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  const provenance = JSON.parse(read(root, `${NATIVE_ROOT}/provenance.json`))
  assertIncludes(builder, 'runWorkerLifecycleCreateDetachedSwarmSessionSmoke', BUILDER_FILE)
  assertIncludes(builder, 'workerLifecycleCreateDetachedSwarmSessionSmoke', BUILDER_FILE)
  assertIncludes(verifier, 'workerLifecycleCreateDetachedSwarmSession', VERIFIER_FILE)
  assert.equal(manifest.packageVersion, PACKAGE_VERSION)
  assert.equal(manifest.helperVersion, HELPER_VERSION)
  assert.equal(manifest.protocolVersion, PROTOCOL_VERSION)
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(manifest.artifact.path, `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`)
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
  assert.equal(manifest.artifact.size, NATIVE_ARTIFACT_SNAPSHOT.helperSize)
  assert.equal(manifest.artifact.sha256, NATIVE_ARTIFACT_SNAPSHOT.helperSha256)
  assert.equal(manifest.source.revision, NATIVE_ARTIFACT_SNAPSHOT.sourceRevision)
  assert.equal(provenance.source.revision, NATIVE_ARTIFACT_SNAPSHOT.sourceRevision)
  assert.deepEqual(manifest.smoke.workerLifecycleCreateDetachedSwarmSession, { ok: false, acceptedFailureKinds: ['invalid-session'] })
  assert.deepEqual(provenance.smoke.workerLifecycleCreateDetachedSwarmSession, { ok: false, acceptedFailureKinds: ['invalid-session'] })
  assert.equal(sha256(root, NATIVE_ARTIFACT_SNAPSHOT.helperPath), NATIVE_ARTIFACT_SNAPSHOT.helperSha256)
  assert.equal(sha256(root, `${NATIVE_ROOT}/manifest.json`), NATIVE_ARTIFACT_SNAPSHOT.manifestSha256)
  assert.equal(sha256(root, `${NATIVE_ROOT}/provenance.json`), NATIVE_ARTIFACT_SNAPSHOT.provenanceSha256)
  assert.equal(sha256(root, `${NATIVE_ROOT}/attestation.intoto.jsonl`), NATIVE_ARTIFACT_SNAPSHOT.attestationSha256)
  assert.equal(sha256(root, `${NATIVE_ROOT}/SHA256SUMS`), NATIVE_ARTIFACT_SNAPSHOT.checksumsSha256)
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
  name: 'Go kernel v0.6.82 Go detached new-session cutover',
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
