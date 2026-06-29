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
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_KILL_PANE_CUTOVER_SCHEMA_VERSION,
  GO_KILL_PANE_CUTOVER_THEME,
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
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  PUBLIC_FACADE,
  RELEASE_PACKAGE_GUARDS,
  REMOVED_TYPESCRIPT_FALLBACK,
  RUNTIME_FILE,
  TEAM_PANES_FILE,
  VERIFIER_FILE,
  WINDOWS_FILE,
  goKillPaneCutover,
} = require('../fixtures/kernel/v0686/goKillPaneCutover.cjs')

const DOC = 'docs/perf/v0.6.86-go-kill-pane-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0686/goKillPaneCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0686-go-kill-pane-cutover.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_COMMANDS = ['tmux kill-pane -t <paneId>']
const BAD_HELPER_OUTPUT = 'KILL_PANE_BAD_HELPER_OUTPUT_SHOULD_NOT_LEAK'
const BAD_RAW_PANE_ID = '%987654321x'
const REQUIRED_DOC = [
  '# v0.6.86 Go Kill-Pane Cutover',
  'Result: v0.6.86 cuts over only `tmux/panes.ts killPane(paneId)`',
  "runTmuxNoThrow(['kill-pane', '-t', paneId])",
  '`workerLifecycle.killPane`',
  '`killPane(paneId): void` remains synchronous, public no-throw, and returns no value.',
  '`createAgentTeamKernelAdapter().killPane(paneId)`',
  'The hidden direct TypeScript fallback for this behavior is removed',
  '`tmux kill-pane -t <paneId>`',
  'argv execution only',
  'compactly validated as a `%123`-style tmux pane id',
  'Raw pane input, raw tmux stdout/stderr, helper paths, stack traces, and raw helper output must not leak',
  '`clearPaneLabelSync(paneId)` remains TypeScript-owned and unchanged',
  '`package.json` remains `0.6.8`',
  '`tests/fixtures/kernel/v0686/goKillPaneCutover.cjs`',
  '`tests/suites/go-kernel-v0686-go-kill-pane-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.86 Go kill-pane cutover',
  'docs/perf/v0.6.86-go-kill-pane-cutover.md',
  '`tmux/panes.ts killPane(paneId)` delegates to synchronous `createAgentTeamKernelAdapter().killPane(paneId)`',
  'Go `workerLifecycle.killPane` uses only `tmux kill-pane -t <paneId>`',
  'hidden direct TypeScript `runTmuxNoThrow([\'kill-pane\', \'-t\', paneId])` fallback is removed',
  '`clearPaneLabelSync(paneId)`, clear-label/team kill orchestration, wake/send-keys, kill-window/kill-session/respawn, state/task/UI/release/package remain out of scope',
  '**v0.6.86 Go kill-pane cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'clearPaneLabelSyncChanged: true',
  'clearAndKillTeamPanesChanged: true',
  'wakePaneMigrated: true',
  'broaderDestructiveLifecycleMigrated: true',
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-v0686-${name}-`))
  const file = path.join(dir, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return { dir, file }
}

function assertNoBadKillLeak(value) {
  const text = JSON.stringify(value)
  assert.equal(text.includes(BAD_HELPER_OUTPUT), false, 'killPane diagnostics must not leak raw helper/stdout/stderr text')
  assert.equal(text.includes(BAD_RAW_PANE_ID), false, 'killPane diagnostics must not leak raw pane id text')
  assert.equal(/stdout|stderr|stack|MAILBOX_BODY|REPORT_BODY|worker transcript|rawState/i.test(text), false, 'killPane diagnostics must stay compact')
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goKillPaneCutover)), goKillPaneCutover)
  assert.equal(goKillPaneCutover.schemaVersion, GO_KILL_PANE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goKillPaneCutover.theme, GO_KILL_PANE_CUTOVER_THEME)
  assert.equal(goKillPaneCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goKillPaneCutover.helperVersion, HELPER_VERSION)
  assert.equal(goKillPaneCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goKillPaneCutover.capability, CAPABILITY)
  assert.equal(goKillPaneCutover.operation, OPERATION)
  assert.equal(goKillPaneCutover.helperName, HELPER_NAME)
  assert.equal(goKillPaneCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goKillPaneCutover.kernelFile, KERNEL_FILE)
  assert.equal(goKillPaneCutover.goSourceFile, GO_SOURCE_FILE)
  assert.equal(goKillPaneCutover.windowsFile, WINDOWS_FILE)
  assert.equal(goKillPaneCutover.labelsFile, LABELS_FILE)
  assert.equal(goKillPaneCutover.teamPanesFile, TEAM_PANES_FILE)
  assert.equal(goKillPaneCutover.builderFile, BUILDER_FILE)
  assert.equal(goKillPaneCutover.verifierFile, VERIFIER_FILE)
  assert.equal(goKillPaneCutover.nativeRoot, NATIVE_ROOT)
  assert.equal(goKillPaneCutover.adapterDelegation, ADAPTER_DELEGATION)
  assert.equal(goKillPaneCutover.removedTypescriptFallback, REMOVED_TYPESCRIPT_FALLBACK)
  assert.deepEqual(goKillPaneCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goKillPaneCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(goKillPaneCutover.authorizedTmuxCommands, [...AUTHORIZED_TMUX_COMMANDS])
  assert.deepEqual(goKillPaneCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goKillPaneCutover.inputPolicy, INPUT_POLICY)
  assert.deepEqual(goKillPaneCutover.publicFacade, PUBLIC_FACADE)
  assert.deepEqual(goKillPaneCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goKillPaneCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(AUTHORIZED_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_COMMANDS)
  assert.equal(AUTHORIZED_TMUX_COMMANDS.length, 1)
  assert.equal(AUTHORIZED_TMUX_COMMANDS[0].command, 'kill-pane')
  assert.deepEqual(AUTHORIZED_TMUX_COMMANDS[0].args, ['kill-pane', '-t', '<paneId>'])
  assert.equal(AUTHORIZED_TMUX_COMMANDS[0].argvOnly, true)
  assert.equal(AUTHORIZED_TMUX_COMMANDS[0].destructive, true)
  assert.equal(AUTHORIZED_TMUX_COMMANDS[0].shellInterpolationAllowed, false)
  assert.equal(AUTHORIZED_TMUX_COMMANDS.some(command => command.command === 'kill-window'), false)
  assert.equal(AUTHORIZED_TMUX_COMMANDS.some(command => command.command === 'kill-session'), false)
  assert.equal(AUTHORIZED_TMUX_COMMANDS.some(command => command.command === 'respawn-pane'), false)
  assert.equal(PUBLIC_FACADE.noThrow, true)
  assert.equal(PUBLIC_FACADE.voidReturn, true)
  assert.equal(PUBLIC_FACADE.hiddenTypescriptFallbackRemoved, true)
  assert.equal(INPUT_POLICY.paneIdPattern, '^%[0-9]+$')
  assert.equal(INPUT_POLICY.argvOnly, true)
  assert.equal(INPUT_POLICY.rawTmuxOutputLeakageAllowed, false)
  assert.equal(goKillPaneCutover.killPaneMigrated, true)
  assert.equal(goKillPaneCutover.killPaneGoHandlerAdded, true)
  assert.equal(goKillPaneCutover.killPaneAdapterMethodAdded, true)
  assert.equal(goKillPaneCutover.typescriptKillPaneFallbackRemoved, true)
  assert.equal(goKillPaneCutover.publicNoThrowVoidPreserved, true)
  assert.equal(goKillPaneCutover.clearPaneLabelSyncChanged, false)
  assert.equal(goKillPaneCutover.clearAndKillTeamPanesChanged, false)
  assert.equal(goKillPaneCutover.wakePaneMigrated, false)
  assert.equal(goKillPaneCutover.broaderDestructiveLifecycleMigrated, false)
  assert.equal(goKillPaneCutover.nativeArtifactRenamed, false)
  assert.equal(goKillPaneCutover.nativeHelperRebuilt, true)
  assert.equal(goKillPaneCutover.packageVersionChanged, false)
  assert.equal(goKillPaneCutover.packageReleaseApproved, false)
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
  const teamPanesSource = read(root, TEAM_PANES_FILE)
  const killBody = functionBody(panesSource, 'killPane')
  const clearBody = functionBody(panesSource, 'clearPaneLabelSync')
  const createBody = functionBody(panesSource, 'createTeammatePane')

  assertIncludes(panesSource, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", RUNTIME_FILE)
  assertIncludes(killBody, PUBLIC_FACADE.signature, `${RUNTIME_FILE} killPane signature`)
  assertIncludes(killBody, ADAPTER_DELEGATION, `${RUNTIME_FILE} killPane adapter delegation`)
  assert.equal(killBody.includes(REMOVED_TYPESCRIPT_FALLBACK), false, `${RUNTIME_FILE} killPane must remove direct TS fallback`)
  assert.equal([...killBody.matchAll(/runTmuxNoThrow\(\['kill-pane', '-t', paneId\]\)/g)].length, 0, `${RUNTIME_FILE} killPane must not keep hidden direct TS fallback`)
  assert.equal(killBody.includes('await '), false, `${RUNTIME_FILE} killPane must remain synchronous`)
  assert.equal(killBody.includes('throw '), false, `${RUNTIME_FILE} killPane must remain no-throw`)
  assert.equal(killBody.includes('return '), false, `${RUNTIME_FILE} killPane must remain void/no return`)
  assert.equal(killBody.includes('killPaneAsync'), false, `${RUNTIME_FILE} killPane must use sync adapter`)

  assertIncludes(clearBody, "runTmuxNoThrow(['set-option', '-up', '-t', paneId, '@agentteam-name'])", `${RUNTIME_FILE} clearPaneLabelSync remains TS-owned`)
  assertIncludes(clearBody, "runTmuxNoThrow(['select-pane', '-t', paneId, '-T', ''])", `${RUNTIME_FILE} clearPaneLabelSync remains TS-owned`)
  assert.equal(clearBody.includes('createAgentTeamKernelAdapter'), false, `${RUNTIME_FILE} clearPaneLabelSync must not migrate in this slice`)
  assertIncludes(createBody, 'createAgentTeamKernelAdapter().createTeammatePaneAsync({', `${RUNTIME_FILE} createTeammatePane remains existing Go cutover`)
  assert.equal(windowsSource.includes('kill-pane'), false, `${WINDOWS_FILE} must remain unrelated to killPane`)
  assert.equal(labelsSource.includes('kill-pane'), false, `${LABELS_FILE} must remain unrelated to killPane`)
  assertIncludes(teamPanesSource, 'clearAndKillTeamPanes', `${TEAM_PANES_FILE} orchestration remains present`)
}

async function assertAdapterNoLeakAndPublicNoThrow(distRoot) {
  const kernel = require(path.join(distRoot, 'core/kernel.js'))
  const tmuxPanes = require(path.join(distRoot, 'tmux/panes.js'))
  const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(distRoot, 'missing-kill-pane-helper'), env: {} })

  assert.doesNotThrow(() => tmuxPanes.killPane('not-a-pane-id'), 'public killPane must swallow invalid pane id failures')

  const invalid = adapter.killPane(`${BAD_RAW_PANE_ID}x`)
  assert.equal(invalid.ok, false)
  assert.equal(invalid.operation, OPERATION)
  assert.equal(invalid.capability, CAPABILITY)
  assert.equal(invalid.killed, false)
  assert.equal(invalid.failureKind, 'invalid-pane-id')
  assert.equal(invalid.paneId, '')
  assertNoBadKillLeak(invalid)

  const missingHelper = adapter.killPane('%123')
  assert.equal(missingHelper.ok, false)
  assert.equal(missingHelper.operation, OPERATION)
  assert.equal(missingHelper.killed, false)
  assertNoBadKillLeak(missingHelper)

  const malicious = writeHelper('malicious-kill-pane-output', `#!/usr/bin/env node
const fs = require('node:fs')
const request = JSON.parse(fs.readFileSync(0, 'utf8').trim())
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const baseHealth = { ok: true, implementation: 'go', protocolVersion: 1, helperVersion: '0.3.0-read-model-shadow', capabilities: ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'], businessPathsConnected: false }
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'workerLifecycle') respond({ ok: false, operation: 'killPane', capability: 'workerLifecycle', paneId: '${BAD_RAW_PANE_ID}', killed: false, status: 'unknown', resultMarker: 'stale', failureKind: 'tmux-command-failed', reason: '${BAD_HELPER_OUTPUT}', error: '${BAD_HELPER_OUTPUT}', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true })
else respond(baseHealth)
`)
  try {
    const maliciousAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: malicious.file, env: {} })
    const leaked = maliciousAdapter.killPane('%123')
    assert.equal(leaked.ok, false)
    assert.equal(leaked.operation, OPERATION)
    assert.equal(leaked.killed, false)
    assert.equal(leaked.failureKind, 'tmux-command-failed')
    assertNoBadKillLeak(leaked)
  } finally {
    fs.rmSync(malicious.dir, { recursive: true, force: true })
  }
}

function assertKernelRuntime(root) {
  const kernelSource = read(root, KERNEL_FILE)
  assertIncludes(kernelSource, 'export type AgentTeamKernelPaneKill', KERNEL_FILE)
  assertIncludes(kernelSource, 'killPane(paneId: string): AgentTeamKernelPaneKill', KERNEL_FILE)
  assertIncludes(kernelSource, 'workerLifecycleKillPaneConnected', KERNEL_FILE)
  assertIncludes(kernelSource, 'workerLifecycleUnavailablePaneKill', KERNEL_FILE)
  assertIncludes(kernelSource, 'validatePaneKillResult', KERNEL_FILE)
  assertIncludes(kernelSource, "operation: 'killPane'", KERNEL_FILE)
  assertIncludes(kernelSource, "const helperResult = callHelper<unknown>('workerLifecycle', { operation: 'killPane', paneId: requestedPaneId })", KERNEL_FILE)
  assertIncludes(kernelSource, 'compactTmuxPaneId(paneId)', `${KERNEL_FILE} compact pane validation`)
  assert.equal(kernelSource.includes('kill-pane'), false, `${KERNEL_FILE} adapter must not construct tmux command text`)
}

function assertGoRuntime(root) {
  const goSource = read(root, GO_SOURCE_FILE)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE_FILE} should include workerLifecycle ${operation}`)
  assertIncludes(goSource, 'type workerPaneKillResult struct', GO_SOURCE_FILE)
  assertIncludes(goSource, '"workerLifecycleKillPaneConnected":', `${GO_SOURCE_FILE} profile flag`)
  assertIncludes(goSource, 'func unavailablePaneKill(paneID string, kind string) workerPaneKillResult', GO_SOURCE_FILE)
  assertIncludes(goSource, 'func runPaneKill(paneID string) string', GO_SOURCE_FILE)
  assertIncludes(goSource, 'func killPane(params map[string]any) workerPaneKillResult', GO_SOURCE_FILE)
  assertIncludes(goSource, 'paneID := compactTmuxPaneID(stringParam(params, "paneId"))', `${GO_SOURCE_FILE} compact pane validation`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "kill-pane", "-t", paneID)', `${GO_SOURCE_FILE} exact argv-only kill-pane`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "kill-pane", "-t", paneID\)/g)].length, 1, `${GO_SOURCE_FILE} must contain exactly one authorized kill-pane command`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE_FILE} must not add forbidden command ${command}`)
  assert.equal(/exec\.Command\s*\(/.test(goSource), false, `${GO_SOURCE_FILE} must not use shell-capable exec.Command`)
  assert.equal(/"(?:sh|bash|zsh|fish)"/.test(goSource), false, `${GO_SOURCE_FILE} must not invoke shells`)
}

function assertArtifactPipelineAndNative(root) {
  const builder = read(root, BUILDER_FILE)
  const verifier = read(root, VERIFIER_FILE)
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  const provenance = JSON.parse(read(root, `${NATIVE_ROOT}/provenance.json`))
  assertIncludes(builder, 'runWorkerLifecycleKillPaneSmoke', BUILDER_FILE)
  assertIncludes(builder, 'workerLifecycleKillPaneSmoke', BUILDER_FILE)
  assertIncludes(verifier, 'workerLifecycleKillPane', VERIFIER_FILE)
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
  assert.deepEqual(manifest.smoke.workerLifecycleKillPane, NATIVE_ARTIFACT_SNAPSHOT.killPaneSmoke)
  assert.deepEqual(provenance.smoke.workerLifecycleKillPane, NATIVE_ARTIFACT_SNAPSHOT.killPaneSmoke)
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
  name: 'Go kernel v0.6.86 Go kill-pane cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertRuntimeCutover(root)
    await assertAdapterNoLeakAndPublicNoThrow(env.helpers.distRoot)
    assertKernelRuntime(root)
    assertGoRuntime(root)
    assertArtifactPipelineAndNative(root)
    assertPackageAndReleaseGuards(root)
  },
}
