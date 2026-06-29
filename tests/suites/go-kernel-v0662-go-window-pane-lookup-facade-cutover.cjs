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
  FACADE_NAMES,
  FIRST_PANE_DELEGATION,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_WINDOW_PANE_COMMAND,
  GO_WINDOW_PANE_FORMAT,
  GO_WINDOW_PANE_LOOKUP_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_WINDOW_PANE_LOOKUP_FACADE_CUTOVER_THEME,
  HELPER_VERSION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  WINDOW_EXISTS_DELEGATION,
  goWindowPaneLookupFacadeCutover,
} = require('../fixtures/kernel/v0662/goWindowPaneLookupFacadeCutover.cjs')

const DOC = 'docs/perf/v0.6.62-go-window-pane-lookup-facade-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0662/goWindowPaneLookupFacadeCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0662-go-window-pane-lookup-facade-cutover.cjs'
const TMUX_CORE = 'tmux/core.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const HELPER = `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`
const MANIFEST = `${NATIVE_ROOT}/manifest.json`
const CHECKSUMS = `${NATIVE_ROOT}/SHA256SUMS`
const PROVENANCE = `${NATIVE_ROOT}/provenance.json`
const ATTESTATION = `${NATIVE_ROOT}/attestation.intoto.jsonl`
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.62 Go Window Pane Lookup Facade Cutover',
  'Result: v0.6.62 cuts over the TypeScript `windowExists(target, signal)` and `firstPaneInWindow(target, signal)` facades to a narrow Go-backed `workerLifecycle.listPanesInWindow` operation through the cancellable async kernel adapter seam.',
  '`tmux/core.ts` `windowExists(target, signal)` now delegates to `createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)` and returns `true` only when the Go-backed lookup succeeds.',
  '`tmux/core.ts` `firstPaneInWindow(target, signal)` now delegates to `createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)` and returns the first compact pane id or `null`.',
  "The TypeScript `runTmuxNoThrowAsync(['list-panes', '-t', target, '-F', '#{pane_id}'], undefined, signal)` fallback calls are removed from both window helper facades.",
  'Go uses exactly `tmux list-panes -t <target> -F workerLifecycleWindowPaneFormat` with compact format `#{pane_id}` for `workerLifecycle.listPanesInWindow`.',
  'Empty or unsafe target, helper unavailable/failure, command failure, unsafe response shape, empty pane list for `firstPaneInWindow()`, pre-aborted signal, and in-flight abort all fail closed at the public facades.',
  'Abort policy: pre-aborted and in-flight aborted `AbortSignal` resolve `false` for `windowExists()` and `null` for `firstPaneInWindow()` with only compact `helper-spawn-error`/`aborted` diagnostics inside the adapter.',
  '`listAgentTeamPanes()` remains the separate label-filtered global `list-panes -a` operation and is not used for window lookup.',
  'Go `display-message` remains limited to the existing no-target current-pane binding operation; no target-based `display-message` is added.',
  'Because Go source changes, the existing embedded helper is rebuilt in the same approved path with refreshed manifest, checksums, provenance, and placeholder attestation.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0662/goWindowPaneLookupFacadeCutover.cjs`',
  '`tests/suites/go-kernel-v0662-go-window-pane-lookup-facade-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.62 Go window pane lookup facade cutover',
  'docs/perf/v0.6.62-go-window-pane-lookup-facade-cutover.md',
  'tmux/core.ts windowExists(target, signal) and firstPaneInWindow(target, signal) delegate to createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)',
  'Go `workerLifecycle.listPanesInWindow` uses only target-based `tmux list-panes -t <target> -F workerLifecycleWindowPaneFormat`',
  'pre-aborted and in-flight aborted signals fail closed to `false`/`null` at the public facades with compact diagnostics',
  'listAgentTeamPanes remains label-filtered and global `list-panes -a` only',
  '**v0.6.62 Go window pane lookup facade cutover**',
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0662-helper-'))
  try {
    const helperPath = path.join(tempRoot, 'helper.cjs')
    writeHelper(helperPath, source)
    return await callback(helperPath, tempRoot)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function writeFakeTmux(binDir) {
  fs.mkdirSync(binDir, { recursive: true })
  const tmuxPath = path.join(binDir, 'tmux')
  fs.writeFileSync(tmuxPath, [
    '#!/usr/bin/env node',
    "const args = process.argv.slice(2)",
    "if (args[0] === 'list-panes' && args[1] === '-t') {",
    "  const target = args[2] || ''",
    "  const format = args[4] || ''",
    "  if (format !== '#{pane_id}') process.exit(4)",
    "  if (target === 'team:@1') process.stdout.write('%first\\n%second\\n')",
    "  else if (target === 'empty:@1') process.stdout.write('')",
    "  else process.exit(5)",
    "} else if (args[0] === 'list-panes' && args[1] === '-a') {",
    "  const format = args[args.length - 1] || ''",
    "  if (format.includes('#{@agentteam-name}')) process.stdout.write('%leader\\nsession:@1\\tleader\\tpi\\n')",
    "  else process.stdout.write('%leader\\tsession:@1\\tpi\\t0\\tdefault\\n')",
    "} else if (args[0] === 'display-message' && args[1] === '-p') {",
    "  process.stdout.write('%current\\tsession:@current\\n')",
    "} else process.exit(2)",
  ].join('\n') + '\n', 'utf8')
  fs.chmodSync(tmuxPath, 0o755)
  return tmuxPath
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

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goWindowPaneLookupFacadeCutover)), goWindowPaneLookupFacadeCutover)
  assert.equal(goWindowPaneLookupFacadeCutover.schemaVersion, GO_WINDOW_PANE_LOOKUP_FACADE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goWindowPaneLookupFacadeCutover.theme, GO_WINDOW_PANE_LOOKUP_FACADE_CUTOVER_THEME)
  assert.equal(goWindowPaneLookupFacadeCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goWindowPaneLookupFacadeCutover.helperVersion, HELPER_VERSION)
  assert.equal(goWindowPaneLookupFacadeCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goWindowPaneLookupFacadeCutover.capability, CAPABILITY)
  assert.equal(goWindowPaneLookupFacadeCutover.operation, OPERATION)
  assert.deepEqual(goWindowPaneLookupFacadeCutover.facadeNames, [...FACADE_NAMES])
  assert.equal(goWindowPaneLookupFacadeCutover.windowExistsDelegation, WINDOW_EXISTS_DELEGATION)
  assert.equal(goWindowPaneLookupFacadeCutover.firstPaneDelegation, FIRST_PANE_DELEGATION)
  assert.equal(goWindowPaneLookupFacadeCutover.asyncAbortPolicy, ASYNC_ABORT_POLICY)
  assert.equal(goWindowPaneLookupFacadeCutover.goWindowPaneCommand, GO_WINDOW_PANE_COMMAND)
  assert.equal(goWindowPaneLookupFacadeCutover.goWindowPaneFormat, GO_WINDOW_PANE_FORMAT)
  assert.deepEqual(goWindowPaneLookupFacadeCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goWindowPaneLookupFacadeCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goWindowPaneLookupFacadeCutover.facadeCutoverMigrated, true)
  assert.equal(goWindowPaneLookupFacadeCutover.windowHelpersMigrated, true)
  assert.equal(goWindowPaneLookupFacadeCutover.typescriptTargetListPanesFallbackRemoved, true)
  assert.equal(goWindowPaneLookupFacadeCutover.abortWindowExistsFalse, true)
  assert.equal(goWindowPaneLookupFacadeCutover.abortFirstPaneNull, true)
  assert.equal(goWindowPaneLookupFacadeCutover.failClosedFalseOnEmptyTarget, true)
  assert.equal(goWindowPaneLookupFacadeCutover.failClosedFalseOnHelperFailure, true)
  assert.equal(goWindowPaneLookupFacadeCutover.failClosedNullOnEmptyTarget, true)
  assert.equal(goWindowPaneLookupFacadeCutover.failClosedNullOnHelperFailure, true)
  assert.equal(goWindowPaneLookupFacadeCutover.failClosedNullOnEmptyPaneList, true)
  assert.equal(goWindowPaneLookupFacadeCutover.failClosedOnInvalidResponse, true)
  assert.equal(goWindowPaneLookupFacadeCutover.listAgentTeamPanesStillLabelFiltered, true)
  assert.equal(goWindowPaneLookupFacadeCutover.targetDisplayMessageAdded, false)
  assert.equal(goWindowPaneLookupFacadeCutover.createTeammatePaneMigrated, false)
  assert.equal(goWindowPaneLookupFacadeCutover.wakePaneMigrated, false)
  assert.equal(goWindowPaneLookupFacadeCutover.syncPaneLabelsMigrated, false)
  assert.equal(goWindowPaneLookupFacadeCutover.killPaneMigrated, false)
  assert.equal(goWindowPaneLookupFacadeCutover.stateRepositoryMigrated, false)
  assert.equal(goWindowPaneLookupFacadeCutover.taskReportPlanRunMigrated, false)
  assert.equal(goWindowPaneLookupFacadeCutover.teamPanelViewModelMigrated, false)
  assert.equal(goWindowPaneLookupFacadeCutover.releasePackageVerificationMigrated, false)
  assert.equal(goWindowPaneLookupFacadeCutover.nativeArtifactRenamed, false)
  assert.equal(goWindowPaneLookupFacadeCutover.nativeHelperRebuilt, true)
  assert.equal(goWindowPaneLookupFacadeCutover.goSourceChanged, true)
  assert.deepEqual(goWindowPaneLookupFacadeCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goWindowPaneLookupFacadeCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goWindowPaneLookupFacadeCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const windowExistsBody = functionBody(coreSource, 'windowExists')
  const firstPaneBody = functionBody(coreSource, 'firstPaneInWindow')
  const resolveAsyncBody = functionBody(coreSource, 'resolvePaneBindingAsync')
  const captureBody = functionBody(coreSource, 'captureCurrentPaneBinding')
  const listBody = functionBody(coreSource, 'listAgentTeamPanes')

  assertIncludes(windowExistsBody, 'if (!target) return false', `${TMUX_CORE} windowExists empty target guard`)
  assertIncludes(windowExistsBody, WINDOW_EXISTS_DELEGATION, `${TMUX_CORE} windowExists delegation`)
  assertIncludes(windowExistsBody, 'return result.ok', `${TMUX_CORE} windowExists success mapping`)
  assertIncludes(firstPaneBody, 'if (!target) return null', `${TMUX_CORE} firstPaneInWindow empty target guard`)
  assertIncludes(firstPaneBody, FIRST_PANE_DELEGATION, `${TMUX_CORE} firstPaneInWindow delegation`)
  assertIncludes(firstPaneBody, 'if (!result.ok || result.paneIds.length === 0) return null', `${TMUX_CORE} firstPaneInWindow empty list guard`)
  assertIncludes(firstPaneBody, 'return result.paneIds[0] ?? null', `${TMUX_CORE} firstPaneInWindow first pane mapping`)
  for (const body of [windowExistsBody, firstPaneBody]) {
    assert.equal(body.includes('runTmuxNoThrowAsync(['), false, 'window helper facades must not retain TypeScript tmux fallback')
    assert.equal(body.includes('list-panes'), false, 'window helper facades must not call tmux list-panes directly')
  }
  assertIncludes(resolveAsyncBody, 'createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)', 'resolvePaneBindingAsync v0.6.61 path remains')
  assertIncludes(captureBody, 'createAgentTeamKernelAdapter().captureCurrentPaneBinding()', 'captureCurrentPaneBinding v0.6.60 path remains')
  assertIncludes(listBody, 'createAgentTeamKernelAdapter().listAgentTeamPanes()', 'listAgentTeamPanes remains Go-backed')

  assertIncludes(kernelSource, 'export type AgentTeamKernelWindowPaneList', KERNEL)
  assertIncludes(kernelSource, 'listPanesInWindowAsync(target: string, signal?: AbortSignal): Promise<AgentTeamKernelWindowPaneList>', KERNEL)
  assertIncludes(kernelSource, 'function compactTmuxWindowTarget', KERNEL)
  assertIncludes(kernelSource, 'function validateWindowPaneListResult', KERNEL)
  assertIncludes(kernelSource, "callHelperAsync<unknown>('workerLifecycle', { operation: 'listPanesInWindow', target: requestedTarget }, signal)", KERNEL)
  assertIncludes(kernelSource, "detail: 'aborted'", `${KERNEL} compact abort diagnostic`)
  assert.match(kernelSource, /function helperSpawnEnv\(\): Record<string, string> \{\s*return \{\s*PATH: env\.PATH \?\? process\.env\.PATH \?\? '',\s*\.\.\.\(env\.TMUX \? \{ TMUX: env\.TMUX \} : \{\}\),\s*\.\.\.\(env\.TMUX_PANE \? \{ TMUX_PANE: env\.TMUX_PANE \} : \{\}\),\s*\}/, 'helper env should stay narrow to PATH/TMUX/TMUX_PANE')

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include ${operation}`)
  assertIncludes(goSource, 'const workerLifecycleWindowPaneFormat = "#{pane_id}"', GO_SOURCE)
  assertIncludes(goSource, 'func compactTmuxWindowTarget', GO_SOURCE)
  assertIncludes(goSource, 'func listPanesInWindow(params map[string]any) workerWindowPaneListResult', GO_SOURCE)
  assertIncludes(goSource, GO_WINDOW_PANE_COMMAND, GO_SOURCE)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat\)/, 'listAgentTeamPanes/global snapshot list-panes remains')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'Go display-message remains limited to current-pane binding')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, `${GO_SOURCE} must not add target-based display-message`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => !['select-pane', 'split-window', 'select-layout', 'resize-pane'].includes(command))) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} later v0.6.76 permits only narrow pane-title setPaneLabel select-pane`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} later v0.6.78 authorized pane label clearing`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} later v0.6.78 authorized pane title clearing`)
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
      listPanesInWindowAsync: async (target, receivedSignal) => {
        calls += 1
        assert.equal(target, 'team:@1')
        assert.equal(receivedSignal, signal)
        return { ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target, exists: true, paneIds: ['%first', '%second'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }
      },
    })
    assert.equal(await tmuxCore.windowExists('team:@1', signal), true)
    assert.equal(await tmuxCore.firstPaneInWindow('team:@1', signal), '%first')
    assert.equal(calls, 2)

    kernel.createAgentTeamKernelAdapter = () => ({ listPanesInWindowAsync: async () => { throw new Error('empty target must avoid helper') } })
    assert.equal(await tmuxCore.windowExists(''), false)
    assert.equal(await tmuxCore.firstPaneInWindow(''), null)

    kernel.createAgentTeamKernelAdapter = () => ({ listPanesInWindowAsync: async () => ({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: 'team:@1', exists: true, paneIds: [], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) })
    assert.equal(await tmuxCore.windowExists('team:@1'), true)
    assert.equal(await tmuxCore.firstPaneInWindow('team:@1'), null)

    kernel.createAgentTeamKernelAdapter = () => ({ listPanesInWindowAsync: async () => ({ ok: false, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: 'team:@1', exists: false, paneIds: [], status: 'unknown', resultMarker: 'stale', failureKind: 'tmux-command-failed', reason: 'compact unavailable', error: 'compact unavailable', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) })
    assert.equal(await tmuxCore.windowExists('team:@1'), false)
    assert.equal(await tmuxCore.firstPaneInWindow('team:@1'), null)
  } finally {
    kernel.createAgentTeamKernelAdapter = original
  }
}

async function assertAsyncHelperRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')

  await withTempHelper(helperSourceForWorkerLifecycle(`params => ({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: params.target, exists: true, paneIds: ['%go', '%second'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })`), async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, env: { PATH: process.env.PATH || '', TMUX: '/tmp/v0662', TMUX_PANE: '%pane' } })
    const result = await adapter.listPanesInWindowAsync('team:@1')
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(result.target, 'team:@1')
    assert.deepEqual(result.paneIds, ['%go', '%second'])
    assert.equal(adapter.metadata().kernel.calls, 2)
    assert.equal(adapter.metadata().kernel.fallbacks, 0)
  })

  await withTempHelper(helperSourceForWorkerLifecycle(`params => ({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: params.target, exists: true, paneIds: ['%go'], text: 'REPORT_BODY_SHOULD_NOT_LEAK', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })`), async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
    const result = await adapter.listPanesInWindowAsync('team:@1')
    assert.equal(result.ok, false, 'unsafe response should fail closed')
    assert.equal(JSON.stringify(result).includes('REPORT_BODY_SHOULD_NOT_LEAK'), false)
  })

  await withTempHelper(helperSourceForWorkerLifecycle(`params => ({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: params.target, exists: true, paneIds: ['%go'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })`), async helperPath => {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
    const result = await adapter.listPanesInWindowAsync('bad target with space')
    assert.equal(result.ok, false)
    assert.equal(result.failureKind, 'invalid-target')
    assert.equal(adapter.metadata().kernel.calls, 0, 'invalid target should avoid helper spawn')
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
else if (request.method === 'workerLifecycle') setTimeout(() => respond({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: request.params.target, exists: true, paneIds: ['%late'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }), 500)
`, async helperPath => {
    const preAbort = new AbortController()
    preAbort.abort()
    const preAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, timeoutMs: 1000 })
    const preResult = await preAdapter.listPanesInWindowAsync('team:@1', preAbort.signal)
    assert.equal(preResult.ok, false)
    assert.equal(preResult.failureKind, 'helper-spawn-error')
    assert.equal(/stdout|stderr|stack|MAILBOX_BODY|REPORT_BODY|worker transcript|\/tmp\/agentteam/i.test(JSON.stringify(preResult)), false)

    const controller = new AbortController()
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath, timeoutMs: 1000 })
    const original = kernel.createAgentTeamKernelAdapter
    try {
      kernel.createAgentTeamKernelAdapter = () => adapter
      const existsPromise = tmuxCore.windowExists('team:@1', controller.signal)
      setTimeout(() => controller.abort(), 50)
      assert.equal(await existsPromise, false)
      const secondController = new AbortController()
      const firstPanePromise = tmuxCore.firstPaneInWindow('team:@1', secondController.signal)
      setTimeout(() => secondController.abort(), 50)
      assert.equal(await firstPanePromise, null)
    } finally {
      kernel.createAgentTeamKernelAdapter = original
    }
  })
}

function assertDirectGoBehavior(root) {
  if (!hasGoToolchain()) return
  const fakeTmuxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0662-fake-tmux-'))
  try {
    writeFakeTmux(fakeTmuxRoot)
    const env = { PATH: `${fakeTmuxRoot}${path.delimiter}${process.env.PATH || ''}`, TMUX: '/tmp/agentteam-v0662-fake-socket', TMUX_PANE: '%current' }
    const success = runGoHelper(root, { jsonrpc: '2.0', id: 'window-panes', method: 'workerLifecycle', params: { operation: 'listPanesInWindow', target: 'team:@1' } }, env)
    assert.equal(success.status, 0, success.stderr)
    const successResponse = JSON.parse(success.stdout.trim())
    assert.equal(successResponse.result.ok, true)
    assert.equal(successResponse.result.target, 'team:@1')
    assert.deepEqual(successResponse.result.paneIds, ['%first', '%second'])
    assert.equal(successResponse.result.readOnly, true)
    assert.equal(successResponse.result.tmuxMutation, false)

    const empty = runGoHelper(root, { jsonrpc: '2.0', id: 'window-empty', method: 'workerLifecycle', params: { operation: 'listPanesInWindow', target: 'empty:@1' } }, env)
    const emptyResponse = JSON.parse(empty.stdout.trim())
    assert.equal(emptyResponse.result.ok, true)
    assert.deepEqual(emptyResponse.result.paneIds, [])

    const missing = runGoHelper(root, { jsonrpc: '2.0', id: 'window-missing', method: 'workerLifecycle', params: { operation: 'listPanesInWindow', target: 'missing:@1' } }, env)
    const missingResponse = JSON.parse(missing.stdout.trim())
    assert.equal(missingResponse.result.ok, false)
    assert.equal(missingResponse.result.failureKind, 'tmux-command-failed')

    const invalid = runGoHelper(root, { jsonrpc: '2.0', id: 'window-invalid', method: 'workerLifecycle', params: { operation: 'listPanesInWindow', target: 'bad target' } }, env)
    const invalidResponse = JSON.parse(invalid.stdout.trim())
    assert.equal(invalidResponse.result.ok, false)
    assert.equal(invalidResponse.result.failureKind, 'invalid-target')
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
  assert.deepEqual(provenance.smoke.workerLifecycleListPanesInWindow.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'])
  assert.equal(manifest.smoke.workerLifecycleListPanesInWindow.acceptedFailureKinds.includes('tmux-unavailable'), true)
  assert.equal(checksums.includes(HELPER), true)
  assert.equal(checksums.includes(MANIFEST), true)
  assert.equal(checksums.includes(PROVENANCE), true)
  assert.equal(checksums.includes(ATTESTATION), true)
}

module.exports = {
  name: 'Go kernel v0.6.62 Go window pane lookup facade cutover',
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
