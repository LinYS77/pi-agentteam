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
  GO_TMUX_AVAILABILITY_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_TMUX_AVAILABILITY_FACADE_CUTOVER_THEME,
  GO_TMUX_VERSION_COMMAND,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  goTmuxAvailabilityFacadeCutover,
} = require('../fixtures/kernel/v0663/goTmuxAvailabilityFacadeCutover.cjs')

const DOC = 'docs/perf/v0.6.63-go-tmux-availability-facade-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0663/goTmuxAvailabilityFacadeCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0663-go-tmux-availability-facade-cutover.cjs'
const TMUX_CORE = 'tmux/core.ts'
const KERNEL = 'core/kernel.ts'
const KERNEL_CONTRACT = 'core/kernelContract.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const HELPER = `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`
const MANIFEST = `${NATIVE_ROOT}/manifest.json`
const CHECKSUMS = `${NATIVE_ROOT}/SHA256SUMS`
const PROVENANCE = `${NATIVE_ROOT}/provenance.json`
const ATTESTATION = `${NATIVE_ROOT}/attestation.intoto.jsonl`
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.63 Go Tmux Availability Facade Cutover',
  'Result: v0.6.63 cuts over `tmux/core.ts` `ensureTmuxAvailable(signal)` from direct TypeScript `tmux -V` execution to a narrow Go-backed `tmuxAvailability` operation through the cancellable async kernel adapter seam.',
  '`tmux/core.ts` `ensureTmuxAvailable(signal)` now delegates to `createAgentTeamKernelAdapter().checkTmuxAvailableAsync(signal)`.',
  "The TypeScript `runTmuxNoThrowAsync(['-V'], undefined, signal)` fallback is removed from `ensureTmuxAvailable()`.",
  'Go uses exactly `tmux -V` via `exec.CommandContext(ctx, "tmux", "-V")` for `tmuxAvailability`.',
  'Public behavior is preserved: available tmux resolves `void`; unavailable tmux, helper failure, invalid response, pre-aborted signal, and in-flight abort throw compact `Error` from `ensureTmuxAvailable()`.',
  'Abort policy: pre-aborted and in-flight aborted `AbortSignal` throw compact `tmux is required for agentteam panes (helper-spawn-error)` at the facade while raw helper diagnostics stay internal.',
  'Errors do not include raw stdout, raw stderr, cwd, stack, helper path, mailbox/report bodies, worker transcript bodies, or full paths.',
  'Window creation, labels, mutating lifecycle, state repository, task/report/PlanRun, team panel view-model, and release/package verification remain TypeScript-owned.',
  'Because Go source changes, the existing embedded helper is rebuilt in the same approved path with refreshed manifest, checksums, provenance, and placeholder attestation.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0663/goTmuxAvailabilityFacadeCutover.cjs`',
  '`tests/suites/go-kernel-v0663-go-tmux-availability-facade-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.63 Go tmux availability facade cutover',
  'docs/perf/v0.6.63-go-tmux-availability-facade-cutover.md',
  'tmux/core.ts ensureTmuxAvailable(signal) delegates to createAgentTeamKernelAdapter().checkTmuxAvailableAsync(signal)',
  'Go `tmuxAvailability` uses only exact `tmux -V` via `exec.CommandContext(ctx, "tmux", "-V")`',
  'pre-aborted and in-flight aborted signals throw compact tmux-required errors without raw output/path/body leakage',
  '**v0.6.63 Go tmux availability facade cutover**',
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
  'wakePaneMigrated: true',
  'syncPaneLabelsMigrated: true',
  'killPaneMigrated: true',
  'stateRepositoryMigrated: true',
  'taskReportPlanRunMigrated: true',
  'teamPanelViewModelMigrated: true',
  'releasePackageVerificationMigrated: true',
  'nativeArtifactRenamed: true',
]
const LEAK_PATTERN = /RAW_STDERR_SHOULD_NOT_LEAK|RAW_STDOUT_SHOULD_NOT_LEAK|MAILBOX_BODY_SHOULD_NOT_LEAK|REPORT_BODY_SHOULD_NOT_LEAK|worker transcript|stack trace|\/tmp\/agentteam|helper\.cjs|cwd|stderr|stdout/i

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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0663-helper-'))
  try {
    const helperPath = path.join(tempRoot, 'helper.cjs')
    writeHelper(helperPath, source)
    return await callback(helperPath, tempRoot)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function helperSourceForTmuxAvailability(responseExpression) {
  return `
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input.split('\\n')[0]) : {}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const health = { ok: true, implementation: 'go', protocolVersion: ${PROTOCOL_VERSION}, adapterVersion: '0.0.0-test', helperVersion: '${HELPER_VERSION}', capabilities: ${JSON.stringify(ACTIVE_CAPABILITIES)}, businessPathsConnected: false }
if (request.method === 'health') respond(health)
else if (request.method === 'tmuxAvailability') respond((${responseExpression})())
else respond({ ok: false, operation: 'unknown', capability: 'workerLifecycle', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })
`
}

function writeFakeTmux(binDir, mode = 'available') {
  fs.mkdirSync(binDir, { recursive: true })
  const tmuxPath = path.join(binDir, 'tmux')
  fs.writeFileSync(tmuxPath, [
    '#!/usr/bin/env node',
    "const args = process.argv.slice(2)",
    "if (args.length === 1 && args[0] === '-V') {",
    mode === 'available'
      ? "  process.stdout.write('tmux 3.4\\n'); process.exit(0)"
      : "  process.stderr.write('RAW_STDERR_SHOULD_NOT_LEAK\\n'); process.exit(7)",
    "}",
    "if (args[0] === 'list-panes' && args[1] === '-t') process.stdout.write('%first\\n')",
    "else if (args[0] === 'list-panes' && args[1] === '-a') process.stdout.write('%leader\\tsession:@1\\tleader\\tpi\\n')",
    "else if (args[0] === 'display-message' && args[1] === '-p') process.stdout.write('%current\\tsession:@current\\n')",
    "else process.exit(2)",
  ].join('\n') + '\n', 'utf8')
  fs.chmodSync(tmuxPath, 0o755)
  return tmuxPath
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goTmuxAvailabilityFacadeCutover)), goTmuxAvailabilityFacadeCutover)
  assert.equal(goTmuxAvailabilityFacadeCutover.schemaVersion, GO_TMUX_AVAILABILITY_FACADE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goTmuxAvailabilityFacadeCutover.theme, GO_TMUX_AVAILABILITY_FACADE_CUTOVER_THEME)
  assert.equal(goTmuxAvailabilityFacadeCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goTmuxAvailabilityFacadeCutover.helperVersion, HELPER_VERSION)
  assert.equal(goTmuxAvailabilityFacadeCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goTmuxAvailabilityFacadeCutover.capability, CAPABILITY)
  assert.equal(goTmuxAvailabilityFacadeCutover.facadeName, FACADE_NAME)
  assert.equal(goTmuxAvailabilityFacadeCutover.kernelAdapterDelegation, KERNEL_ADAPTER_DELEGATION)
  assert.equal(goTmuxAvailabilityFacadeCutover.asyncAbortPolicy, ASYNC_ABORT_POLICY)
  assert.equal(goTmuxAvailabilityFacadeCutover.goTmuxVersionCommand, GO_TMUX_VERSION_COMMAND)
  assert.deepEqual(goTmuxAvailabilityFacadeCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goTmuxAvailabilityFacadeCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goTmuxAvailabilityFacadeCutover.facadeCutoverMigrated, true)
  assert.equal(goTmuxAvailabilityFacadeCutover.typescriptTmuxVersionFallbackRemoved, true)
  assert.equal(goTmuxAvailabilityFacadeCutover.throwsOnUnavailable, true)
  assert.equal(goTmuxAvailabilityFacadeCutover.resolvesVoidOnAvailable, true)
  assert.equal(goTmuxAvailabilityFacadeCutover.failClosedOnHelperFailure, true)
  assert.equal(goTmuxAvailabilityFacadeCutover.compactErrorMessage, true)
  assert.equal(goTmuxAvailabilityFacadeCutover.abortThrowsCompactError, true)
  assert.equal(goTmuxAvailabilityFacadeCutover.rawOutputLeakageAllowed, false)
  assert.equal(goTmuxAvailabilityFacadeCutover.targetDisplayMessageAdded, false)
  assert.equal(goTmuxAvailabilityFacadeCutover.createTeammatePaneMigrated, false)
  assert.equal(goTmuxAvailabilityFacadeCutover.wakePaneMigrated, false)
  assert.equal(goTmuxAvailabilityFacadeCutover.syncPaneLabelsMigrated, false)
  assert.equal(goTmuxAvailabilityFacadeCutover.killPaneMigrated, false)
  assert.equal(goTmuxAvailabilityFacadeCutover.stateRepositoryMigrated, false)
  assert.equal(goTmuxAvailabilityFacadeCutover.taskReportPlanRunMigrated, false)
  assert.equal(goTmuxAvailabilityFacadeCutover.teamPanelViewModelMigrated, false)
  assert.equal(goTmuxAvailabilityFacadeCutover.releasePackageVerificationMigrated, false)
  assert.equal(goTmuxAvailabilityFacadeCutover.nativeArtifactRenamed, false)
  assert.equal(goTmuxAvailabilityFacadeCutover.nativeHelperRebuilt, true)
  assert.equal(goTmuxAvailabilityFacadeCutover.goSourceChanged, true)
  assert.deepEqual(goTmuxAvailabilityFacadeCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goTmuxAvailabilityFacadeCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goTmuxAvailabilityFacadeCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const coreSource = read(root, TMUX_CORE)
  const kernelSource = read(root, KERNEL)
  const contractSource = read(root, KERNEL_CONTRACT)
  const goSource = read(root, GO_SOURCE)
  const ensureBody = functionBody(coreSource, 'ensureTmuxAvailable')
  const windowExistsBody = functionBody(coreSource, 'windowExists')
  const firstPaneBody = functionBody(coreSource, 'firstPaneInWindow')
  const resolveAsyncBody = functionBody(coreSource, 'resolvePaneBindingAsync')

  assertIncludes(ensureBody, KERNEL_ADAPTER_DELEGATION, `${TMUX_CORE} ensureTmuxAvailable delegation`)
  assertIncludes(ensureBody, 'throw new Error(`tmux is required for agentteam panes${suffix}`)', `${TMUX_CORE} compact throw`)
  assert.equal(ensureBody.includes("runTmuxNoThrowAsync(['-V']"), false, 'ensureTmuxAvailable must not retain TypeScript tmux -V fallback')
  assert.equal(ensureBody.includes('result.stderr'), false, 'ensureTmuxAvailable must not include raw stderr in public error')
  assert.equal(coreSource.includes("import { runTmuxNoThrowAsync }"), false, `${TMUX_CORE} should not import tmux client for remaining core facades`)
  assertIncludes(windowExistsBody, 'createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)', 'windowExists v0.6.62 path remains')
  assertIncludes(firstPaneBody, 'createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)', 'firstPaneInWindow v0.6.62 path remains')
  assertIncludes(resolveAsyncBody, 'createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)', 'resolvePaneBindingAsync v0.6.61 path remains')

  assertIncludes(contractSource, "AGENTTEAM_KERNEL_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability']", KERNEL_CONTRACT)
  assertIncludes(kernelSource, "export type AgentTeamKernelTmuxAvailability", KERNEL)
  assertIncludes(kernelSource, 'checkTmuxAvailableAsync(signal?: AbortSignal): Promise<AgentTeamKernelTmuxAvailability>', KERNEL)
  assertIncludes(kernelSource, 'function validateTmuxAvailabilityResult', KERNEL)
  assertIncludes(kernelSource, "callHelperAsync<unknown>('tmuxAvailability', undefined, signal)", KERNEL)
  assertIncludes(kernelSource, "detail: 'aborted'", `${KERNEL} compact abort diagnostic`)
  assert.match(kernelSource, /function helperSpawnEnv\(\): Record<string, string> \{\s*return \{\s*PATH: env\.PATH \?\? process\.env\.PATH \?\? '',\s*\.\.\.\(env\.TMUX \? \{ TMUX: env\.TMUX \} : \{\}\),\s*\.\.\.\(env\.TMUX_PANE \? \{ TMUX_PANE: env\.TMUX_PANE \} : \{\}\),\s*\}/, 'helper env should stay narrow to PATH/TMUX/TMUX_PANE')

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  assertIncludes(goSource, 'type tmuxAvailabilityResult struct', GO_SOURCE)
  assertIncludes(goSource, 'func checkTmuxAvailability() tmuxAvailabilityResult', GO_SOURCE)
  assertIncludes(goSource, GO_TMUX_VERSION_COMMAND, GO_SOURCE)
  assertIncludes(goSource, 'case "tmuxAvailability":', GO_SOURCE)
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include ${operation}`)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat\)/, 'window lookup command remains')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'Go display-message remains limited to current-pane binding')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, `${GO_SOURCE} must not add target-based display-message`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => command !== 'select-pane')) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} later v0.6.76 permits only narrow pane-title setPaneLabel select-pane`)
  assert.equal(goSource.includes('exec.CommandContext(ctx, "tmux", "set-option", "-up"'), false, `${GO_SOURCE} must not add clearPaneLabel set-option -up`)
  for (const forbidden of ['PI_AGENTTEAM_HOME', 'team.json', 'agentteam_task', 'agentteam_receive', 'report_done', 'report_blocked', 'renderPanel', 'openTeamPanel', 'npm publish', 'npm version']) {
    assert.equal(goSource.includes(forbidden), false, `${GO_SOURCE} must not migrate ${forbidden}`)
  }
}

async function assertFacadeRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const tmuxCore = env.helpers.requireDist('tmux/core.js')
  const original = kernel.createAgentTeamKernelAdapter
  try {
    let calls = 0
    const signal = new AbortController().signal
    kernel.createAgentTeamKernelAdapter = () => ({
      checkTmuxAvailableAsync: async receivedSignal => {
        calls += 1
        assert.equal(receivedSignal, signal)
        return { ok: true, capability: 'tmuxAvailability', available: true, version: 'tmux 3.4', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }
      },
    })
    assert.equal(await tmuxCore.ensureTmuxAvailable(signal), undefined)
    assert.equal(calls, 1)

    kernel.createAgentTeamKernelAdapter = () => ({
      checkTmuxAvailableAsync: async () => ({ ok: false, capability: 'tmuxAvailability', available: false, status: 'unknown', resultMarker: 'stale', failureKind: 'tmux-unavailable', reason: 'compact unavailable', error: 'compact unavailable', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
    })
    await assert.rejects(() => tmuxCore.ensureTmuxAvailable(), error => {
      assert.equal(error instanceof Error, true)
      assert.match(error.message, /^tmux is required for agentteam panes \(tmux-unavailable\)$/)
      assert.equal(LEAK_PATTERN.test(error.message), false)
      return true
    })
  } finally {
    kernel.createAgentTeamKernelAdapter = original
  }
}

async function assertAsyncHelperRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const tmuxCore = env.helpers.requireDist('tmux/core.js')

  await withTempHelper(helperSourceForTmuxAvailability(`() => ({ ok: true, capability: 'tmuxAvailability', available: true, version: 'tmux 3.4', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })`), async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, env: { PATH: process.env.PATH || '', TMUX: '/tmp/v0663', TMUX_PANE: '%pane' } })
    const result = await adapter.checkTmuxAvailableAsync()
    assert.equal(result.ok, true)
    assert.equal(result.available, true)
    assert.equal(result.version, 'tmux 3.4')
    assert.equal(adapter.metadata().kernel.calls, 2)
    assert.equal(adapter.metadata().kernel.fallbacks, 0)
  })

  await withTempHelper(helperSourceForTmuxAvailability(`() => ({ ok: true, capability: 'tmuxAvailability', available: true, version: 'MAILBOX_BODY_SHOULD_NOT_LEAK', text: 'REPORT_BODY_SHOULD_NOT_LEAK', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })`), async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
    const result = await adapter.checkTmuxAvailableAsync()
    assert.equal(result.ok, false, 'unsafe response should fail closed')
    assert.equal(JSON.stringify(result).includes('MAILBOX_BODY_SHOULD_NOT_LEAK'), false)
    assert.equal(JSON.stringify(result).includes('REPORT_BODY_SHOULD_NOT_LEAK'), false)
    const original = kernel.createAgentTeamKernelAdapter
    try {
      kernel.createAgentTeamKernelAdapter = () => adapter
      await assert.rejects(() => tmuxCore.ensureTmuxAvailable(), error => {
        assert.equal(LEAK_PATTERN.test(error.message), false)
        assert.match(error.message, /^tmux is required for agentteam panes \(helper-incompatible-response\)|^tmux is required for agentteam panes \(previous-helper-failure\)$/)
        return true
      })
    } finally {
      kernel.createAgentTeamKernelAdapter = original
    }
  })
}

async function assertAbortRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const tmuxCore = env.helpers.requireDist('tmux/core.js')
  await withTempHelper(`
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input.split('\\n')[0]) : {}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const health = { ok: true, implementation: 'go', protocolVersion: ${PROTOCOL_VERSION}, adapterVersion: '0.0.0-test', helperVersion: '${HELPER_VERSION}', capabilities: ${JSON.stringify(ACTIVE_CAPABILITIES)}, businessPathsConnected: false }
if (request.method === 'health') setTimeout(() => respond(health), 200)
else if (request.method === 'tmuxAvailability') setTimeout(() => respond({ ok: true, capability: 'tmuxAvailability', available: true, version: 'tmux 3.4', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }), 500)
`, async helperPath => {
    const preAbort = new AbortController()
    preAbort.abort()
    const preAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, timeoutMs: 1000 })
    const preResult = await preAdapter.checkTmuxAvailableAsync(preAbort.signal)
    assert.equal(preResult.ok, false)
    assert.equal(preResult.failureKind, 'helper-spawn-error')
    assert.equal(LEAK_PATTERN.test(JSON.stringify(preResult)), false)

    const controller = new AbortController()
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, timeoutMs: 1000 })
    const original = kernel.createAgentTeamKernelAdapter
    try {
      kernel.createAgentTeamKernelAdapter = () => adapter
      const ensurePromise = tmuxCore.ensureTmuxAvailable(controller.signal)
      setTimeout(() => controller.abort(), 50)
      await assert.rejects(() => ensurePromise, error => {
        assert.equal(error instanceof Error, true)
        assert.match(error.message, /^tmux is required for agentteam panes \(helper-spawn-error\)$/)
        assert.equal(LEAK_PATTERN.test(error.message), false)
        return true
      })
    } finally {
      kernel.createAgentTeamKernelAdapter = original
    }
  })
}

function assertDirectGoBehavior(root) {
  if (!hasGoToolchain()) return
  const fakeTmuxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0663-fake-tmux-'))
  try {
    writeFakeTmux(fakeTmuxRoot, 'available')
    const env = { PATH: `${fakeTmuxRoot}${path.delimiter}${process.env.PATH || ''}`, TMUX: '/tmp/agentteam-v0663-fake-socket', TMUX_PANE: '%current' }
    const success = runGoHelper(root, { jsonrpc: '2.0', id: 'tmux-available', method: 'tmuxAvailability' }, env)
    assert.equal(success.status, 0, success.stderr)
    const successResponse = JSON.parse(success.stdout.trim())
    assert.equal(successResponse.result.ok, true)
    assert.equal(successResponse.result.capability, 'tmuxAvailability')
    assert.equal(successResponse.result.available, true)
    assert.equal(successResponse.result.version, 'tmux 3.4')
    assert.equal(successResponse.result.readOnly, true)
    assert.equal(successResponse.result.tmuxMutation, false)

    fs.rmSync(fakeTmuxRoot, { recursive: true, force: true })
    const failingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0663-fake-tmux-fail-'))
    writeFakeTmux(failingRoot, 'unavailable')
    const failure = runGoHelper(root, { jsonrpc: '2.0', id: 'tmux-failed', method: 'tmuxAvailability' }, { ...env, PATH: `${failingRoot}${path.delimiter}${process.env.PATH || ''}` })
    const failureResponse = JSON.parse(failure.stdout.trim())
    assert.equal(failureResponse.result.ok, false)
    assert.equal(failureResponse.result.available, false)
    assert.equal(failureResponse.result.failureKind, 'tmux-command-failed')
    assert.equal(JSON.stringify(failureResponse).includes('RAW_STDERR_SHOULD_NOT_LEAK'), false)
    fs.rmSync(failingRoot, { recursive: true, force: true })
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
  assert.deepEqual(provenance.smoke.tmuxAvailability.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'])
  assert.equal(manifest.smoke.tmuxAvailability.acceptedFailureKinds.includes('tmux-unavailable'), true)
  assert.equal(checksums.includes(HELPER), true)
  assert.equal(checksums.includes(MANIFEST), true)
  assert.equal(checksums.includes(PROVENANCE), true)
  assert.equal(checksums.includes(ATTESTATION), true)
}

module.exports = {
  name: 'Go kernel v0.6.63 Go tmux availability facade cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeSource(root)
    await assertFacadeRuntime(env)
    await assertAsyncHelperRuntime(env)
    await assertAbortRuntime(env)
    assertDirectGoBehavior(root)
    assertPackageAndNativeGuards(root)
  },
}
