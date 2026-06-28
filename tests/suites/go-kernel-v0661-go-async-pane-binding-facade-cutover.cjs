const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ASYNC_ABORT_POLICY,
  ASYNC_HELPER_SEAM,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_ASYNC_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_ASYNC_PANE_BINDING_FACADE_CUTOVER_THEME,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  goAsyncPaneBindingFacadeCutover,
} = require('../fixtures/kernel/v0661/goAsyncPaneBindingFacadeCutover.cjs')

const DOC = 'docs/perf/v0.6.61-go-async-pane-binding-facade-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0661/goAsyncPaneBindingFacadeCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0661-go-async-pane-binding-facade-cutover.cjs'
const TMUX_CORE = 'tmux/core.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const HELPER = `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.61 Go resolvePaneBindingAsync Facade Cutover',
  'Result: v0.6.61 cuts over the TypeScript `resolvePaneBindingAsync(paneId, signal)` facade/default path to the existing Go-backed `workerLifecycle.inspectPane` operation through a cancellable async kernel adapter seam.',
  '`tmux/core.ts` `resolvePaneBindingAsync(paneId, signal)` now delegates to `createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)`.',
  "The TypeScript `runTmuxNoThrowAsync(['display-message', '-p', '-t', paneId, ...], undefined, signal)` fallback calls are removed from `resolvePaneBindingAsync()`.",
  '`core/kernel.ts` adds a cancellable async helper seam using `spawn` with stdin JSON-RPC, bounded stdout collection, timeout handling, and `AbortSignal` propagation.',
  'The async helper process forwards only `PATH`, `TMUX`, and `TMUX_PANE`, matching the synchronous helper environment boundary.',
  'Empty pane id, helper unavailable/failure, pane-not-found, unsafe response shape, missing target, pre-aborted signal, and in-flight abort all fail closed to `null` at the public facade.',
  'Abort policy: pre-aborted and in-flight aborted `AbortSignal` resolve `null` at `resolvePaneBindingAsync()` and record only compact `helper-spawn-error`/`aborted` diagnostics inside the adapter; they do not throw or leak process output.',
  '`windowExists()` and `firstPaneInWindow()` are cut over separately by v0.6.62 through a cancellable async Go `listPanesInWindow` seam.',
  'No Go source or native helper rebuild is required for this TypeScript adapter-seam cutover.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0661/goAsyncPaneBindingFacadeCutover.cjs`',
  '`tests/suites/go-kernel-v0661-go-async-pane-binding-facade-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.61 Go resolvePaneBindingAsync facade cutover',
  'docs/perf/v0.6.61-go-async-pane-binding-facade-cutover.md',
  'tmux/core.ts resolvePaneBindingAsync(paneId, signal) delegates to createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)',
  'pre-aborted and in-flight aborted signals fail closed to `null` at the public facade with compact diagnostics',
  'the TypeScript async display-message fallback for resolvePaneBindingAsync is removed',
  'window helpers and mutating lifecycle remain TypeScript-owned',
  '**v0.6.61 Go resolvePaneBindingAsync facade cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'windowHelpersMigrated: true',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goAsyncPaneBindingFacadeCutover)), goAsyncPaneBindingFacadeCutover)
  assert.equal(goAsyncPaneBindingFacadeCutover.schemaVersion, GO_ASYNC_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goAsyncPaneBindingFacadeCutover.theme, GO_ASYNC_PANE_BINDING_FACADE_CUTOVER_THEME)
  assert.equal(goAsyncPaneBindingFacadeCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goAsyncPaneBindingFacadeCutover.helperVersion, HELPER_VERSION)
  assert.equal(goAsyncPaneBindingFacadeCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goAsyncPaneBindingFacadeCutover.capability, CAPABILITY)
  assert.equal(goAsyncPaneBindingFacadeCutover.facadeName, FACADE_NAME)
  assert.equal(goAsyncPaneBindingFacadeCutover.kernelAdapterDelegation, KERNEL_ADAPTER_DELEGATION)
  assert.equal(goAsyncPaneBindingFacadeCutover.asyncHelperSeam, ASYNC_HELPER_SEAM)
  assert.equal(goAsyncPaneBindingFacadeCutover.asyncAbortPolicy, ASYNC_ABORT_POLICY)
  assert.deepEqual(goAsyncPaneBindingFacadeCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goAsyncPaneBindingFacadeCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goAsyncPaneBindingFacadeCutover.facadeCutoverMigrated, true)
  assert.equal(goAsyncPaneBindingFacadeCutover.cancellableAsyncKernelSeamAdded, true)
  assert.equal(goAsyncPaneBindingFacadeCutover.typescriptDisplayMessageFallbackRemoved, true)
  assert.equal(goAsyncPaneBindingFacadeCutover.abortResolvesNull, true)
  assert.equal(goAsyncPaneBindingFacadeCutover.failClosedNullOnEmptyPaneId, true)
  assert.equal(goAsyncPaneBindingFacadeCutover.failClosedNullOnHelperFailure, true)
  assert.equal(goAsyncPaneBindingFacadeCutover.failClosedNullOnMissingTarget, true)
  assert.equal(goAsyncPaneBindingFacadeCutover.failClosedNullOnInvalidResponse, true)
  assert.equal(goAsyncPaneBindingFacadeCutover.syncFacadesUnchanged, true)
  assert.equal(goAsyncPaneBindingFacadeCutover.windowHelpersMigratedByLaterSlice, true)
  assert.equal(goAsyncPaneBindingFacadeCutover.createTeammatePaneMigrated, false)
  assert.equal(goAsyncPaneBindingFacadeCutover.wakePaneMigrated, false)
  assert.equal(goAsyncPaneBindingFacadeCutover.syncPaneLabelsMigrated, false)
  assert.equal(goAsyncPaneBindingFacadeCutover.killPaneMigrated, false)
  assert.equal(goAsyncPaneBindingFacadeCutover.stateRepositoryMigrated, false)
  assert.equal(goAsyncPaneBindingFacadeCutover.taskReportPlanRunMigrated, false)
  assert.equal(goAsyncPaneBindingFacadeCutover.teamPanelViewModelMigrated, false)
  assert.equal(goAsyncPaneBindingFacadeCutover.releasePackageVerificationMigrated, false)
  assert.equal(goAsyncPaneBindingFacadeCutover.nativeArtifactRenamed, false)
  assert.equal(goAsyncPaneBindingFacadeCutover.nativeHelperRebuilt, false)
  assert.equal(goAsyncPaneBindingFacadeCutover.goSourceChanged, false)
  assert.deepEqual(goAsyncPaneBindingFacadeCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goAsyncPaneBindingFacadeCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goAsyncPaneBindingFacadeCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const goSource = read(root, GO_SOURCE)
  const resolveAsyncBody = functionBody(coreSource, 'resolvePaneBindingAsync')
  const windowExistsBody = functionBody(coreSource, 'windowExists')
  const firstPaneBody = functionBody(coreSource, 'firstPaneInWindow')
  const captureBody = functionBody(coreSource, 'captureCurrentPaneBinding')
  const inspectBody = functionBody(coreSource, 'inspectPane')
  const resolveBody = functionBody(coreSource, 'resolvePaneBinding')
  const targetBody = functionBody(coreSource, 'targetForPaneId')
  const listBody = functionBody(coreSource, 'listAgentTeamPanes')

  assertIncludes(resolveAsyncBody, KERNEL_ADAPTER_DELEGATION, `${TMUX_CORE} resolvePaneBindingAsync delegation`)
  assertIncludes(resolveAsyncBody, 'if (!paneId) return null', `${TMUX_CORE} resolvePaneBindingAsync empty pane guard`)
  assertIncludes(resolveAsyncBody, 'if (!result.ok || !result.target) return null', `${TMUX_CORE} resolvePaneBindingAsync fail closed`)
  assertIncludes(resolveAsyncBody, 'paneId: result.paneId || paneId', `${TMUX_CORE} resolvePaneBindingAsync pane mapping`)
  assertIncludes(resolveAsyncBody, 'target: result.target', `${TMUX_CORE} resolvePaneBindingAsync target mapping`)
  assert.equal(resolveAsyncBody.includes('display-message'), false, 'resolvePaneBindingAsync facade must not call display-message directly')
  assert.equal(resolveAsyncBody.includes('runTmuxNoThrowAsync(['), false, 'resolvePaneBindingAsync facade must not retain TypeScript tmux fallback')
  assert.equal(resolveAsyncBody.includes('resolvePaneBinding('), false, 'resolvePaneBindingAsync must not wrap the sync facade')
  assert.equal(resolveAsyncBody.includes('signal'), true, 'resolvePaneBindingAsync must preserve AbortSignal parameter usage')
  assertIncludes(windowExistsBody, 'createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)', 'windowExists later v0.6.62 cutover')
  assert.equal(windowExistsBody.includes('runTmuxNoThrowAsync(['), false, 'windowExists direct tmux path is removed by later v0.6.62 slice')
  assertIncludes(firstPaneBody, 'createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)', 'firstPaneInWindow later v0.6.62 cutover')
  assert.equal(firstPaneBody.includes('runTmuxNoThrowAsync(['), false, 'firstPaneInWindow direct tmux path is removed by later v0.6.62 slice')
  assertIncludes(captureBody, 'if (!isInsideTmux()) return null', 'captureCurrentPaneBinding v0.6.60 guard remains')
  assertIncludes(captureBody, 'createAgentTeamKernelAdapter().captureCurrentPaneBinding()', 'captureCurrentPaneBinding v0.6.60 cutover remains')
  assertIncludes(inspectBody, 'createAgentTeamKernelAdapter().inspectWorkerPane(paneId)', `${TMUX_CORE} inspectPane remains sync Go-backed`)
  assertIncludes(resolveBody, 'createAgentTeamKernelAdapter().inspectWorkerPane(paneId)', `${TMUX_CORE} resolvePaneBinding remains sync Go-backed`)
  assertIncludes(targetBody, 'return resolvePaneBinding(paneId)?.target ?? null', `${TMUX_CORE} targetForPaneId remains v0.6.59 path`)
  assertIncludes(listBody, 'createAgentTeamKernelAdapter().listAgentTeamPanes()', `${TMUX_CORE} listAgentTeamPanes remains Go-backed`)

  assertIncludes(kernelSource, 'inspectWorkerPaneAsync(paneId: string, signal?: AbortSignal): Promise<AgentTeamKernelWorkerPaneInspection>', KERNEL)
  assertIncludes(kernelSource, 'function invokeHelperAsync', KERNEL)
  assertIncludes(kernelSource, 'async function ensureHelperCompatibleAsync', KERNEL)
  assertIncludes(kernelSource, 'async function callHelperAsync', KERNEL)
  assertIncludes(kernelSource, "spawn(helperPath, [], {", KERNEL)
  assertIncludes(kernelSource, 'signal,', `${KERNEL} async helper signal propagation`)
  assertIncludes(kernelSource, "detail: 'aborted'", `${KERNEL} compact abort diagnostic`)
  assertIncludes(kernelSource, "callHelperAsync<unknown>('workerLifecycle', { operation: 'inspectPane', paneId: requestedPaneId }, signal)", `${KERNEL} async inspect call`)
  assert.match(kernelSource, /function helperSpawnEnv\(\): Record<string, string> \{\s*return \{\s*PATH: env\.PATH \?\? process\.env\.PATH \?\? '',\s*\.\.\.\(env\.TMUX \? \{ TMUX: env\.TMUX \} : \{\}\),\s*\.\.\.\(env\.TMUX_PANE \? \{ TMUX_PANE: env\.TMUX_PANE \} : \{\}\),\s*\}/, 'helper env should stay narrow to PATH/TMUX/TMUX_PANE')

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include ${operation}`)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'Go display-message remains limited to current-pane binding')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, 'Go must not use target-based display-message')
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => command !== 'select-pane')) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} later v0.6.76 permits only narrow pane-title setPaneLabel select-pane`)
  assert.equal(goSource.includes('exec.CommandContext(ctx, "tmux", "set-option", "-up"'), false, `${GO_SOURCE} must not add clearPaneLabel set-option -up`)
}

function writeHelper(filePath, body) {
  fs.writeFileSync(filePath, ['#!/usr/bin/env node', body].join('\n') + '\n', 'utf8')
  fs.chmodSync(filePath, 0o755)
}

function helperHealthSource() {
  return `
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input.split('\\n')[0]) : {}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
function error(code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code, message } }) + '\\n') }
const health = { ok: true, implementation: 'go', protocolVersion: ${PROTOCOL_VERSION}, adapterVersion: '0.0.0-test', helperVersion: '${HELPER_VERSION}', capabilities: ${JSON.stringify(ACTIVE_CAPABILITIES)}, businessPathsConnected: false }
if (request.method === 'health') respond(health)
else if (request.method === 'workerLifecycle') {
  const params = request.params || {}
  ${''}
}
else error(-32601, 'method not found')
`
}

async function withTempHelper(source, callback) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0661-helper-'))
  try {
    const helperPath = path.join(tempRoot, 'helper.cjs')
    writeHelper(helperPath, source)
    return await callback(helperPath, tempRoot)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

async function assertFacadeRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const tmuxCore = env.helpers.requireDist('tmux/core.js')
  const original = kernel.createAgentTeamKernelAdapter
  try {
    let calls = 0
    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPaneAsync: async (paneId, signal) => {
        calls += 1
        assert.equal(paneId, '%pane')
        assert.equal(signal && typeof signal.aborted === 'boolean', true)
        return { ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId: '%actual', requestedPaneId: '%pane', exists: true, target: 'session:@7', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }
      },
    })
    assert.deepEqual(await tmuxCore.resolvePaneBindingAsync('%pane', new AbortController().signal), { paneId: '%actual', target: 'session:@7' })
    assert.equal(calls, 1)

    kernel.createAgentTeamKernelAdapter = () => ({ inspectWorkerPaneAsync: async () => { throw new Error('empty pane id must avoid helper') } })
    assert.equal(await tmuxCore.resolvePaneBindingAsync(''), null)

    kernel.createAgentTeamKernelAdapter = () => ({ inspectWorkerPaneAsync: async () => ({ ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId: '%pane', requestedPaneId: '%pane', exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) })
    assert.equal(await tmuxCore.resolvePaneBindingAsync('%pane'), null)

    kernel.createAgentTeamKernelAdapter = () => ({ inspectWorkerPaneAsync: async () => ({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId: '%pane', requestedPaneId: '%pane', exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'compact unavailable', error: 'compact unavailable', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) })
    assert.equal(await tmuxCore.resolvePaneBindingAsync('%pane'), null)
  } finally {
    kernel.createAgentTeamKernelAdapter = original
  }
}

async function assertAsyncHelperRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  await withTempHelper(`
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input.split('\\n')[0]) : {}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const health = { ok: true, implementation: 'go', protocolVersion: ${PROTOCOL_VERSION}, adapterVersion: '0.0.0-test', helperVersion: '${HELPER_VERSION}', capabilities: ${JSON.stringify(ACTIVE_CAPABILITIES)}, businessPathsConnected: false }
if (request.method === 'health') respond(health)
else if (request.method === 'workerLifecycle') respond({ ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId: '%go', requestedPaneId: request.params.paneId, exists: true, target: 'go:@1', currentCommand: 'pi', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })
`, async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, env: { PATH: process.env.PATH || '', TMUX: '/tmp/v0661', TMUX_PANE: '%pane' } })
    const result = await adapter.inspectWorkerPaneAsync('%pane')
    assert.equal(result.ok, true)
    assert.equal(result.paneId, '%go')
    assert.equal(result.target, 'go:@1')
    assert.equal(adapter.metadata().kernel.calls, 2)
    assert.equal(adapter.metadata().kernel.fallbacks, 0)
  })

  await withTempHelper(`
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input.split('\\n')[0]) : {}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const health = { ok: true, implementation: 'go', protocolVersion: ${PROTOCOL_VERSION}, adapterVersion: '0.0.0-test', helperVersion: '${HELPER_VERSION}', capabilities: ${JSON.stringify(ACTIVE_CAPABILITIES)}, businessPathsConnected: false }
if (request.method === 'health') respond(health)
else if (request.method === 'workerLifecycle') respond({ ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId: '%go', requestedPaneId: request.params.paneId, exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })
`, async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
    const result = await adapter.inspectWorkerPaneAsync('%pane')
    assert.equal(result.ok, true, 'adapter can inspect without target')
    const tmuxCore = env.helpers.requireDist('tmux/core.js')
    const original = kernel.createAgentTeamKernelAdapter
    try {
      kernel.createAgentTeamKernelAdapter = () => adapter
      assert.equal(await tmuxCore.resolvePaneBindingAsync('%pane'), null, 'facade fails closed on missing target')
    } finally {
      kernel.createAgentTeamKernelAdapter = original
    }
  })

  await withTempHelper(`
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input.split('\\n')[0]) : {}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const health = { ok: true, implementation: 'go', protocolVersion: ${PROTOCOL_VERSION}, adapterVersion: '0.0.0-test', helperVersion: '${HELPER_VERSION}', capabilities: ${JSON.stringify(ACTIVE_CAPABILITIES)}, businessPathsConnected: false }
if (request.method === 'health') respond(health)
else if (request.method === 'workerLifecycle') respond({ ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId: '%go', requestedPaneId: request.params.paneId, exists: true, target: 'MAILBOX_BODY_SHOULD_NOT_LEAK', text: 'REPORT_BODY_SHOULD_NOT_LEAK', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })
`, async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
    const result = await adapter.inspectWorkerPaneAsync('%pane')
    assert.equal(result.ok, false, 'invalid/unsafe shape should fail closed')
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
else if (request.method === 'workerLifecycle') setTimeout(() => respond({ ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId: '%late', requestedPaneId: request.params.paneId, exists: true, target: 'late:@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }), 500)
`, async helperPath => {
    const preAbort = new AbortController()
    preAbort.abort()
    const preAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, timeoutMs: 1000 })
    const preResult = await preAdapter.inspectWorkerPaneAsync('%pane', preAbort.signal)
    assert.equal(preResult.ok, false)
    assert.equal(preResult.failureKind, 'helper-spawn-error')
    assert.equal(/stdout|stderr|stack|MAILBOX_BODY|REPORT_BODY|worker transcript|\/tmp\/agentteam/i.test(JSON.stringify(preResult)), false)

    const controller = new AbortController()
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, timeoutMs: 1000 })
    const pending = adapter.inspectWorkerPaneAsync('%pane', controller.signal)
    setTimeout(() => controller.abort(), 50)
    const aborted = await pending
    assert.equal(aborted.ok, false)
    assert.equal(aborted.failureKind, 'helper-spawn-error')
    assert.equal(/stdout|stderr|stack|MAILBOX_BODY|REPORT_BODY|worker transcript|\/tmp\/agentteam/i.test(JSON.stringify(aborted)), false)
  })
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
}

module.exports = {
  name: 'Go kernel v0.6.61 Go resolvePaneBindingAsync facade cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeSource(root)
    await assertFacadeRuntime(env)
    await assertAsyncHelperRuntime(env)
    await assertAbortRuntime(env)
    assertPackageAndNativeGuards(root)
  },
}
