const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_RESOLVE_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_RESOLVE_PANE_BINDING_FACADE_CUTOVER_THEME,
  HELPER_VERSION,
  INSPECT_FORMAT_TARGET,
  INSPECT_TARGET_FIELD,
  KERNEL_ADAPTER_DELEGATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  PUBLIC_SUCCESS_MAPPING,
  RELEASE_PACKAGE_GUARDS,
  goResolvePaneBindingFacadeCutover,
} = require('../fixtures/kernel/v0658/goResolvePaneBindingFacadeCutover.cjs')

const DOC = 'docs/perf/v0.6.58-go-resolve-pane-binding-facade-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0658/goResolvePaneBindingFacadeCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0658-go-resolve-pane-binding-facade-cutover.cjs'
const TMUX_CORE = 'tmux/core.ts'
const TMUX_SNAPSHOT = 'tmux/snapshot.ts'
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
  '# v0.6.58 Go resolvePaneBinding Facade Cutover',
  'Result: v0.6.58 cuts over the TypeScript `resolvePaneBinding(paneId)` facade/default path to the Go-backed `workerLifecycle.inspectPane` adapter after extending that compact inspect result with `target`.',
  'Go `workerLifecycle.inspectPane` now returns compact `target` (`#{session_name}:#{window_id}`)',
  '`core/kernel.ts` sanitizes optional `target` on successful inspect results',
  '`tmux/core.ts` `resolvePaneBinding(paneId)` now delegates to `createAgentTeamKernelAdapter().inspectWorkerPane(paneId)`.',
  'The TypeScript `runTmuxNoThrow([\'display-message\', ...])` fallback for `resolvePaneBinding()` is removed.',
  '`resolvePaneBinding(paneId)` returns `{ paneId, target }` only when inspect succeeds and compact `target` is present.',
  'Helper failure, invalid pane id, pane-not-found, unsafe response shape, and missing target all fail closed to `null`.',
  'The target field belongs on the universal read-only `inspectPane` operation, not on `listAgentTeamPanes()` lookup behavior.',
  '`listAgentTeamPanes()` remains intentionally filtered to labeled agentteam panes only.',
  'No mutating tmux command is added to Go; v0.6.60 later adds only a narrow no-target current-pane `display-message` binding operation.',
  '`resolvePaneBindingAsync()` is cut over separately by v0.6.61 through a cancellable async helper seam.',
  '`targetForPaneId()` is cut over by v0.6.59 and `captureCurrentPaneBinding()` is cut over by v0.6.60.',
  'Native artifact path and binary name remain unchanged.',
  'Because Go source changes, the existing embedded helper is rebuilt in the same approved path with refreshed manifest, checksums, provenance, and placeholder attestation.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0658/goResolvePaneBindingFacadeCutover.cjs`',
  '`tests/suites/go-kernel-v0658-go-resolve-pane-binding-facade-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.58 Go resolvePaneBinding facade cutover',
  'docs/perf/v0.6.58-go-resolve-pane-binding-facade-cutover.md',
  'tmux/core.ts resolvePaneBinding(paneId) delegates to createAgentTeamKernelAdapter().inspectWorkerPane(paneId)',
  'workerLifecycle.inspectPane compact result includes target',
  'the TypeScript display-message fallback for resolvePaneBinding is removed',
  'listAgentTeamPanes still filters labeled panes only',
  'targetForPaneId, captureCurrentPaneBinding, resolvePaneBindingAsync, and window helpers are later cut over by v0.6.59-v0.6.62',
  '**v0.6.58 Go resolvePaneBinding facade cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'targetForPaneIdMigrated: true',
  'captureCurrentPaneBindingMigrated: true',
  'resolvePaneBindingAsyncMigrated: true',
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

function writeFakeTmux(binDir) {
  fs.mkdirSync(binDir, { recursive: true })
  const tmuxPath = path.join(binDir, 'tmux')
  fs.writeFileSync(tmuxPath, [
    '#!/usr/bin/env node',
    "const args = process.argv.slice(2)",
    "if (args[0] !== 'list-panes') process.exit(2)",
    "const format = args[args.length - 1] || ''",
    "if (format.includes('#{@agentteam-name}')) {",
    "  process.stdout.write('%agentteam\tsession:@1\tleader\tpi\\n%unlabeled\tsession:@9\t\tbash\\n%worker\tsession:@2\tworker-a\tnode\\n')",
    "} else {",
    "  process.stdout.write('%agentteam\tsession:@1\tpi\t0\tdefault\\n%unlabeled\tsession:@9\tbash\t0\tdefault\\n%worker\tsession:@2\tnode\t1\tcopy-mode\\n')",
    "}",
  ].join('\n') + '\n', 'utf8')
  fs.chmodSync(tmuxPath, 0o755)
  return tmuxPath
}

function assertCompactInspectionResult(result) {
  assert.equal(result.operation, 'inspectPane')
  assert.equal(result.capability, CAPABILITY)
  assert.equal(result.readOnly, true)
  assert.equal(result.stateFilesRead, false)
  assert.equal(result.stateFilesWritten, false)
  assert.equal(result.tmuxMutation, false)
  const allowed = new Set(['ok', 'operation', 'capability', 'paneId', 'requestedPaneId', 'exists', 'target', 'currentCommand', 'inMode', 'mode', 'copyMode', 'status', 'resultMarker', 'failureKind', 'reason', 'error', 'readOnly', 'stateFilesRead', 'stateFilesWritten', 'tmuxMutation'])
  for (const key of Object.keys(result)) assert.equal(allowed.has(key), true, `unexpected inspect field ${key}`)
  const serialized = JSON.stringify(result)
  assert.equal(/stdout|stderr|stack|cwd|MAILBOX_BODY|REPORT_BODY|worker transcript|rawState|stateArchive|terminal raw/i.test(serialized), false)
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goResolvePaneBindingFacadeCutover)), goResolvePaneBindingFacadeCutover)
  assert.equal(goResolvePaneBindingFacadeCutover.schemaVersion, GO_RESOLVE_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goResolvePaneBindingFacadeCutover.theme, GO_RESOLVE_PANE_BINDING_FACADE_CUTOVER_THEME)
  assert.equal(goResolvePaneBindingFacadeCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goResolvePaneBindingFacadeCutover.helperVersion, HELPER_VERSION)
  assert.equal(goResolvePaneBindingFacadeCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goResolvePaneBindingFacadeCutover.capability, CAPABILITY)
  assert.equal(goResolvePaneBindingFacadeCutover.facadeName, FACADE_NAME)
  assert.equal(goResolvePaneBindingFacadeCutover.kernelAdapterDelegation, KERNEL_ADAPTER_DELEGATION)
  assert.equal(goResolvePaneBindingFacadeCutover.inspectTargetField, INSPECT_TARGET_FIELD)
  assert.equal(goResolvePaneBindingFacadeCutover.inspectFormatTarget, INSPECT_FORMAT_TARGET)
  assert.deepEqual(goResolvePaneBindingFacadeCutover.publicSuccessMapping, [...PUBLIC_SUCCESS_MAPPING])
  assert.deepEqual(goResolvePaneBindingFacadeCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goResolvePaneBindingFacadeCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goResolvePaneBindingFacadeCutover.facadeCutoverMigrated, true)
  assert.equal(goResolvePaneBindingFacadeCutover.typescriptDisplayMessageFallbackRemoved, true)
  assert.equal(goResolvePaneBindingFacadeCutover.failClosedNullOnHelperFailure, true)
  assert.equal(goResolvePaneBindingFacadeCutover.failClosedNullOnMissingTarget, true)
  assert.equal(goResolvePaneBindingFacadeCutover.arbitraryPaneIdsSupported, true)
  assert.equal(goResolvePaneBindingFacadeCutover.listAgentTeamPanesFilterUnchanged, true)
  assert.equal(goResolvePaneBindingFacadeCutover.inspectPaneFacadeStillMigrated, true)
  assert.equal(goResolvePaneBindingFacadeCutover.paneExistsFacadeStillMigrated, true)
  assert.equal(goResolvePaneBindingFacadeCutover.listAgentTeamPanesFacadeStillMigrated, true)
  assert.equal(goResolvePaneBindingFacadeCutover.resolvePaneBindingAsyncMigratedByLaterSlice, true)
  assert.equal(goResolvePaneBindingFacadeCutover.targetForPaneIdMigrated, false)
  assert.equal(goResolvePaneBindingFacadeCutover.captureCurrentPaneBindingMigrated, false)
  assert.equal(goResolvePaneBindingFacadeCutover.windowHelpersMigratedByLaterSlice, true)
  assert.equal(goResolvePaneBindingFacadeCutover.createTeammatePaneMigrated, false)
  assert.equal(goResolvePaneBindingFacadeCutover.wakePaneMigrated, false)
  assert.equal(goResolvePaneBindingFacadeCutover.syncPaneLabelsMigrated, false)
  assert.equal(goResolvePaneBindingFacadeCutover.killPaneMigrated, false)
  assert.equal(goResolvePaneBindingFacadeCutover.stateRepositoryMigrated, false)
  assert.equal(goResolvePaneBindingFacadeCutover.taskReportPlanRunMigrated, false)
  assert.equal(goResolvePaneBindingFacadeCutover.teamPanelViewModelMigrated, false)
  assert.equal(goResolvePaneBindingFacadeCutover.releasePackageVerificationMigrated, false)
  assert.equal(goResolvePaneBindingFacadeCutover.nativeArtifactRenamed, false)
  assert.equal(goResolvePaneBindingFacadeCutover.nativeHelperRebuilt, true)
  assert.deepEqual(goResolvePaneBindingFacadeCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goResolvePaneBindingFacadeCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goResolvePaneBindingFacadeCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const snapshotSource = read(root, TMUX_SNAPSHOT)
  const kernelSource = read(root, KERNEL)
  const goSource = read(root, GO_SOURCE)
  const resolveBody = functionBody(coreSource, 'resolvePaneBinding')
  const resolveAsyncBody = functionBody(coreSource, 'resolvePaneBindingAsync')
  const targetBody = functionBody(coreSource, 'targetForPaneId')
  const captureBody = functionBody(coreSource, 'captureCurrentPaneBinding')
  const windowExistsBody = functionBody(coreSource, 'windowExists')
  const firstPaneBody = functionBody(coreSource, 'firstPaneInWindow')
  const listBody = functionBody(coreSource, 'listAgentTeamPanes')
  const inspectBody = functionBody(coreSource, 'inspectPane')
  const paneExistsBody = functionBody(coreSource, 'paneExists')
  const snapshotListBody = functionBody(snapshotSource, 'listAgentTeamPanesFromSnapshot')

  assertIncludes(resolveBody, KERNEL_ADAPTER_DELEGATION, `${TMUX_CORE} resolvePaneBinding`)
  assertIncludes(resolveBody, 'if (!result.ok || !result.target) return null', `${TMUX_CORE} resolvePaneBinding fail closed`)
  assertIncludes(resolveBody, 'paneId: result.paneId || paneId', `${TMUX_CORE} resolvePaneBinding pane id mapping`)
  assertIncludes(resolveBody, 'target: result.target', `${TMUX_CORE} resolvePaneBinding target mapping`)
  assert.equal(resolveBody.includes('runTmuxNoThrow(['), false, 'resolvePaneBinding facade must not retain TypeScript tmux fallback')
  assert.equal(resolveBody.includes('display-message'), false, 'resolvePaneBinding facade must not call display-message directly')
  assert.equal(resolveBody.includes('listAgentTeamPanes'), false, 'resolvePaneBinding must not use labeled-pane list lookup')
  assert.equal(resolveBody.includes('#{session_name}:#{window_id}'), false, 'resolvePaneBinding facade must not parse tmux target directly')
  assertIncludes(inspectBody, 'const result = createAgentTeamKernelAdapter().inspectWorkerPane(paneId)', `${TMUX_CORE} inspectPane`)
  assertIncludes(paneExistsBody, 'return Boolean(paneId && inspectPane(paneId).exists)', `${TMUX_CORE} paneExists`)
  assertIncludes(listBody, 'const result = createAgentTeamKernelAdapter().listAgentTeamPanes()', `${TMUX_CORE} listAgentTeamPanes`)
  assert.match(snapshotListBody, /return snapshot\.panes\.filter\(item => item\.paneId && item\.label\)/, 'snapshot helper should keep existing labeled-pane filter')
  assertIncludes(resolveAsyncBody, 'createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)', 'resolvePaneBindingAsync later v0.6.61 cutover')
  assert.equal(resolveAsyncBody.includes('display-message'), false, 'resolvePaneBindingAsync display-message path is removed by later v0.6.61 slice')
  assert.equal(resolveAsyncBody.includes('runTmuxNoThrowAsync(['), false, 'resolvePaneBindingAsync direct tmux path is removed by later v0.6.61 slice')
  assertIncludes(targetBody, 'return resolvePaneBinding(paneId)?.target ?? null', 'targetForPaneId later v0.6.59 cutover')
  assert.equal(targetBody.includes('display-message'), false, 'targetForPaneId display-message path is removed by later v0.6.59 slice')
  assertIncludes(captureBody, 'if (!isInsideTmux()) return null', 'captureCurrentPaneBinding later v0.6.60 guard')
  assertIncludes(captureBody, 'createAgentTeamKernelAdapter().captureCurrentPaneBinding()', 'captureCurrentPaneBinding later v0.6.60 cutover')
  assert.equal(captureBody.includes('display-message'), false, 'captureCurrentPaneBinding display-message path is removed by later v0.6.60 slice')
  assertIncludes(windowExistsBody, 'createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)', 'windowExists later v0.6.62 cutover')
  assert.equal(windowExistsBody.includes('runTmuxNoThrowAsync(['), false, 'windowExists direct tmux path is removed by later v0.6.62 slice')
  assertIncludes(firstPaneBody, 'createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)', 'firstPaneInWindow later v0.6.62 cutover')
  assert.equal(firstPaneBody.includes('runTmuxNoThrowAsync(['), false, 'firstPaneInWindow direct tmux path is removed by later v0.6.62 slice')

  assertIncludes(kernelSource, 'target?: string', KERNEL)
  assertIncludes(kernelSource, "const target = typeof result.target === 'string' ? compactKernelText(result.target) : ''", KERNEL)
  assertIncludes(kernelSource, '...(target ? { target } : {})', KERNEL)
  assertIncludes(kernelSource, "callHelper<unknown>('workerLifecycle', { operation: 'inspectPane'", KERNEL)

  const inspectFormat = goSource.match(/const workerLifecycleInspectPaneFormat = "([^"]+)"/)?.[1] || ''
  assertIncludes(inspectFormat, '#{pane_id}', 'workerLifecycleInspectPaneFormat pane id')
  assertIncludes(inspectFormat, INSPECT_FORMAT_TARGET, 'workerLifecycleInspectPaneFormat target')
  assertIncludes(inspectFormat, '#{pane_current_command}', 'workerLifecycleInspectPaneFormat current command')
  assertIncludes(goSource, 'Target            string `json:"target,omitempty"`', GO_SOURCE)
  assertIncludes(goSource, 'Target:            strings.TrimSpace(fields[1])', GO_SOURCE)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat\)/, 'Go should keep read-only list-panes inspect execution')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat\)/, 'Go should keep read-only list-panes list execution')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'later v0.6.60 permits only current-pane binding display-message')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, `${GO_SOURCE} must not add target-based display-message`)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => command !== 'select-pane')) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} later v0.6.76 permits only narrow pane-title setPaneLabel select-pane`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} later v0.6.78 authorized pane label clearing`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} later v0.6.78 authorized pane title clearing`)
  for (const forbidden of ['os.ReadFile', 'os.WriteFile', 'os.Create', 'PI_AGENTTEAM_HOME', 'agentteam_task', 'agentteam_receive', 'report_done', 'report_blocked', 'renderPanel', 'openTeamPanel', 'npm publish', 'npm version']) {
    assert.equal(goSource.includes(forbidden), false, `${GO_SOURCE} must not migrate ${forbidden}`)
  }
}

function assertFacadeRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const tmuxCore = env.helpers.requireDist('tmux/core.js')
  const original = kernel.createAgentTeamKernelAdapter
  try {
    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPane: paneId => ({ ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId: '%resolved', requestedPaneId: paneId, exists: true, target: 'session:@9', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
      listAgentTeamPanes: () => ({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
    })
    assert.deepEqual(tmuxCore.resolvePaneBinding('%input'), { paneId: '%resolved', target: 'session:@9' })

    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPane: paneId => ({ ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId, requestedPaneId: paneId, exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
      listAgentTeamPanes: () => { throw new Error('resolvePaneBinding must not call listAgentTeamPanes') },
    })
    assert.equal(tmuxCore.resolvePaneBinding('%missing-target'), null)

    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPane: paneId => ({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId, requestedPaneId: paneId, exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'compact unavailable', error: 'compact unavailable', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
      listAgentTeamPanes: () => { throw new Error('resolvePaneBinding must not call listAgentTeamPanes') },
    })
    assert.equal(tmuxCore.resolvePaneBinding('%missing'), null)
    assert.equal(tmuxCore.resolvePaneBinding(''), null)
  } finally {
    kernel.createAgentTeamKernelAdapter = original
  }
}

function assertDirectGoBehavior(root) {
  if (!hasGoToolchain()) return
  const fakeTmuxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0658-fake-tmux-'))
  try {
    writeFakeTmux(fakeTmuxRoot)
    const env = { PATH: `${fakeTmuxRoot}${path.delimiter}${process.env.PATH || ''}` }
    const inspect = runGoHelper(root, { jsonrpc: '2.0', id: 'inspect-unlabeled', method: 'workerLifecycle', params: { operation: 'inspectPane', paneId: '%unlabeled' } }, env)
    assert.equal(inspect.status, 0, inspect.stderr)
    const inspectResponse = JSON.parse(inspect.stdout.trim())
    assert.equal(inspectResponse.jsonrpc, '2.0')
    assert.equal(inspectResponse.id, 'inspect-unlabeled')
    assertCompactInspectionResult(inspectResponse.result)
    assert.equal(inspectResponse.result.ok, true)
    assert.equal(inspectResponse.result.paneId, '%unlabeled')
    assert.equal(inspectResponse.result.target, 'session:@9')
    assert.equal(inspectResponse.result.currentCommand, 'bash')

    const list = runGoHelper(root, { jsonrpc: '2.0', id: 'list-filtered', method: 'workerLifecycle', params: { operation: 'listAgentTeamPanes' } }, env)
    assert.equal(list.status, 0, list.stderr)
    const listResponse = JSON.parse(list.stdout.trim())
    assert.equal(listResponse.result.ok, true)
    assert.deepEqual(listResponse.result.panes.map(pane => pane.paneId), ['%agentteam', '%worker'])
    assert.equal(Object.prototype.hasOwnProperty.call(listResponse.result.byPaneId, '%unlabeled'), false)
  } finally {
    fs.rmSync(fakeTmuxRoot, { recursive: true, force: true })
  }
}

function assertPackageAndNativeGuards(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  const manifest = JSON.parse(read(root, MANIFEST))
  const provenance = JSON.parse(read(root, PROVENANCE))
  const checksums = read(root, CHECKSUMS)
  const attestation = read(root, ATTESTATION)
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
  assert.equal(manifest.module, 'tmuxSnapshotParse')
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(provenance.smoke.workerLifecycleInspectPane.acceptedFailureKinds, ['pane-not-found', 'tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'])
  assert.equal(checksums.includes(HELPER), true)
  assert.equal(checksums.includes(MANIFEST), true)
  assert.equal(checksums.includes(PROVENANCE), true)
  assert.equal(checksums.includes(ATTESTATION), true)
  assert.equal(attestation.includes('placeholderOnly'), true)
}

module.exports = {
  name: 'Go kernel v0.6.58 Go resolvePaneBinding facade cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeSource(root)
    assertFacadeRuntime(env)
    assertDirectGoBehavior(root)
    assertPackageAndNativeGuards(root)
  },
}
