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
  GO_CURRENT_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_CURRENT_PANE_BINDING_FACADE_CUTOVER_THEME,
  GO_CURRENT_PANE_COMMAND,
  GO_CURRENT_PANE_FORMAT,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  goCurrentPaneBindingFacadeCutover,
} = require('../fixtures/kernel/v0660/goCurrentPaneBindingFacadeCutover.cjs')

const DOC = 'docs/perf/v0.6.60-go-current-pane-binding-facade-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0660/goCurrentPaneBindingFacadeCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0660-go-current-pane-binding-facade-cutover.cjs'
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
  '# v0.6.60 Go captureCurrentPaneBinding Facade Cutover',
  'Result: v0.6.60 cuts over the TypeScript `captureCurrentPaneBinding()` facade/default path to a narrow Go-backed `workerLifecycle.captureCurrentPaneBinding` operation.',
  '`tmux/core.ts` keeps `if (!isInsideTmux()) return null` before invoking the helper.',
  '`tmux/core.ts` `captureCurrentPaneBinding()` now delegates to `createAgentTeamKernelAdapter().captureCurrentPaneBinding()`.',
  'The TypeScript `runTmuxNoThrow([\'display-message\', \'-p\', \'#{pane_id}\'])` and `runTmuxNoThrow([\'display-message\', \'-p\', \'#{session_name}:#{window_id}\'])` fallback calls are removed from `captureCurrentPaneBinding()`.',
  'Go uses exactly `tmux display-message -p workerLifecycleCurrentPaneBindingFormat` with compact format `#{pane_id}\\t#{session_name}:#{window_id}`.',
  'The adapter forwards only `PATH`, `TMUX`, and `TMUX_PANE` to the helper process.',
  'Helper failure, outside-tmux, tmux unavailable, empty pane id, empty target, unsafe response shape, and command timeout all fail closed to `null` at the public facade.',
  '`resolvePaneBindingAsync(paneId, signal)` remains TypeScript `display-message`-owned to preserve `AbortSignal` semantics.',
  '`windowExists()` and `firstPaneInWindow()` remain TypeScript window helper paths.',
  'Mutating worker lifecycle remains TypeScript-owned',
  'Native artifact path and binary name remain unchanged.',
  'Because Go source changes, the existing embedded helper is rebuilt in the same approved path with refreshed manifest, checksums, provenance, and placeholder attestation.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0660/goCurrentPaneBindingFacadeCutover.cjs`',
  '`tests/suites/go-kernel-v0660-go-current-pane-binding-facade-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.60 Go captureCurrentPaneBinding facade cutover',
  'docs/perf/v0.6.60-go-current-pane-binding-facade-cutover.md',
  'tmux/core.ts captureCurrentPaneBinding() keeps the isInsideTmux guard and delegates to createAgentTeamKernelAdapter().captureCurrentPaneBinding()',
  'Go `workerLifecycle.captureCurrentPaneBinding` uses only `tmux display-message -p workerLifecycleCurrentPaneBindingFormat`',
  'the TypeScript display-message fallback for captureCurrentPaneBinding is removed',
  'resolvePaneBindingAsync remains TypeScript-owned because the current kernel adapter is sync/per-call and cannot preserve AbortSignal semantics',
  'window helpers remain TypeScript-owned',
  '**v0.6.60 Go captureCurrentPaneBinding facade cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
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
    "if (args[0] === 'display-message' && args[1] === '-p') {",
    "  if (!process.env.TMUX) process.exit(1)",
    "  const format = args[2] || ''",
    "  if (format === '#{pane_id}\\t#{session_name}:#{window_id}') process.stdout.write('%current\\tsession:@current\\n')",
    "  else process.exit(3)",
    "} else if (args[0] === 'list-panes') {",
    "  const format = args[args.length - 1] || ''",
    "  if (format.includes('#{@agentteam-name}')) process.stdout.write('%current\\tsession:@current\\tleader\\tpi\\n')",
    "  else process.stdout.write('%current\\tsession:@current\\tpi\\t0\\tdefault\\n')",
    "} else process.exit(2)",
  ].join('\n') + '\n', 'utf8')
  fs.chmodSync(tmuxPath, 0o755)
  return tmuxPath
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goCurrentPaneBindingFacadeCutover)), goCurrentPaneBindingFacadeCutover)
  assert.equal(goCurrentPaneBindingFacadeCutover.schemaVersion, GO_CURRENT_PANE_BINDING_FACADE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goCurrentPaneBindingFacadeCutover.theme, GO_CURRENT_PANE_BINDING_FACADE_CUTOVER_THEME)
  assert.equal(goCurrentPaneBindingFacadeCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goCurrentPaneBindingFacadeCutover.helperVersion, HELPER_VERSION)
  assert.equal(goCurrentPaneBindingFacadeCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goCurrentPaneBindingFacadeCutover.capability, CAPABILITY)
  assert.equal(goCurrentPaneBindingFacadeCutover.facadeName, FACADE_NAME)
  assert.equal(goCurrentPaneBindingFacadeCutover.kernelAdapterDelegation, KERNEL_ADAPTER_DELEGATION)
  assert.equal(goCurrentPaneBindingFacadeCutover.goCurrentPaneFormat, GO_CURRENT_PANE_FORMAT)
  assert.equal(goCurrentPaneBindingFacadeCutover.goCurrentPaneCommand, GO_CURRENT_PANE_COMMAND)
  assert.deepEqual(goCurrentPaneBindingFacadeCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goCurrentPaneBindingFacadeCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goCurrentPaneBindingFacadeCutover.facadeCutoverMigrated, true)
  assert.equal(goCurrentPaneBindingFacadeCutover.typescriptDisplayMessageFallbackRemoved, true)
  assert.equal(goCurrentPaneBindingFacadeCutover.failClosedNullOutsideTmux, true)
  assert.equal(goCurrentPaneBindingFacadeCutover.failClosedNullOnHelperFailure, true)
  assert.equal(goCurrentPaneBindingFacadeCutover.failClosedNullOnMissingPaneIdOrTarget, true)
  assert.equal(goCurrentPaneBindingFacadeCutover.tmuxEnvForwardedToHelper, true)
  assert.equal(goCurrentPaneBindingFacadeCutover.currentPaneDisplayMessageAllowedOnlyForThisOperation, true)
  assert.equal(goCurrentPaneBindingFacadeCutover.resolvePaneBindingAsyncMigrated, false)
  assert.equal(goCurrentPaneBindingFacadeCutover.windowHelpersMigrated, false)
  assert.equal(goCurrentPaneBindingFacadeCutover.createTeammatePaneMigrated, false)
  assert.equal(goCurrentPaneBindingFacadeCutover.wakePaneMigrated, false)
  assert.equal(goCurrentPaneBindingFacadeCutover.syncPaneLabelsMigrated, false)
  assert.equal(goCurrentPaneBindingFacadeCutover.killPaneMigrated, false)
  assert.equal(goCurrentPaneBindingFacadeCutover.stateRepositoryMigrated, false)
  assert.equal(goCurrentPaneBindingFacadeCutover.taskReportPlanRunMigrated, false)
  assert.equal(goCurrentPaneBindingFacadeCutover.teamPanelViewModelMigrated, false)
  assert.equal(goCurrentPaneBindingFacadeCutover.releasePackageVerificationMigrated, false)
  assert.equal(goCurrentPaneBindingFacadeCutover.nativeArtifactRenamed, false)
  assert.equal(goCurrentPaneBindingFacadeCutover.nativeHelperRebuilt, true)
  assert.deepEqual(goCurrentPaneBindingFacadeCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goCurrentPaneBindingFacadeCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goCurrentPaneBindingFacadeCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const captureBody = functionBody(coreSource, 'captureCurrentPaneBinding')
  const resolveAsyncBody = functionBody(coreSource, 'resolvePaneBindingAsync')
  const windowExistsBody = functionBody(coreSource, 'windowExists')
  const firstPaneBody = functionBody(coreSource, 'firstPaneInWindow')
  const inspectBody = functionBody(coreSource, 'inspectPane')
  const resolveBody = functionBody(coreSource, 'resolvePaneBinding')
  const targetBody = functionBody(coreSource, 'targetForPaneId')
  const listBody = functionBody(coreSource, 'listAgentTeamPanes')

  assertIncludes(captureBody, 'if (!isInsideTmux()) return null', `${TMUX_CORE} captureCurrentPaneBinding outside tmux guard`)
  assertIncludes(captureBody, KERNEL_ADAPTER_DELEGATION, `${TMUX_CORE} captureCurrentPaneBinding delegation`)
  assertIncludes(captureBody, 'if (!result.ok || !result.paneId || !result.target) return null', `${TMUX_CORE} captureCurrentPaneBinding fail closed`)
  assertIncludes(captureBody, 'paneId: result.paneId', `${TMUX_CORE} captureCurrentPaneBinding pane id mapping`)
  assertIncludes(captureBody, 'target: result.target', `${TMUX_CORE} captureCurrentPaneBinding target mapping`)
  assert.equal(captureBody.includes('runTmuxNoThrow(['), false, 'captureCurrentPaneBinding facade must not retain TypeScript tmux fallback')
  assert.equal(captureBody.includes('display-message'), false, 'captureCurrentPaneBinding facade must not call display-message directly')
  assert.equal(coreSource.includes('runTmuxNoThrow,'), false, `${TMUX_CORE} should not import sync runTmuxNoThrow after current-pane cutover`)

  assert.equal(resolveAsyncBody.includes('display-message'), true, 'resolvePaneBindingAsync must remain TypeScript display-message path')
  assert.equal(resolveAsyncBody.includes('runTmuxNoThrowAsync(['), true, 'resolvePaneBindingAsync must remain async tmux-owned')
  assert.equal(resolveAsyncBody.includes('signal'), true, 'resolvePaneBindingAsync must preserve AbortSignal parameter usage')
  assert.equal(windowExistsBody.includes('list-panes'), true, 'windowExists must remain TypeScript window helper path')
  assert.equal(firstPaneBody.includes('list-panes'), true, 'firstPaneInWindow must remain TypeScript window helper path')
  assertIncludes(inspectBody, 'createAgentTeamKernelAdapter().inspectWorkerPane(paneId)', `${TMUX_CORE} inspectPane`)
  assertIncludes(resolveBody, 'createAgentTeamKernelAdapter().inspectWorkerPane(paneId)', `${TMUX_CORE} resolvePaneBinding`)
  assertIncludes(targetBody, 'return resolvePaneBinding(paneId)?.target ?? null', `${TMUX_CORE} targetForPaneId`)
  assertIncludes(listBody, 'createAgentTeamKernelAdapter().listAgentTeamPanes()', `${TMUX_CORE} listAgentTeamPanes`)

  assertIncludes(kernelSource, 'export type AgentTeamKernelCurrentPaneBinding', KERNEL)
  assertIncludes(kernelSource, 'captureCurrentPaneBinding(): AgentTeamKernelCurrentPaneBinding', KERNEL)
  assertIncludes(kernelSource, 'validateCurrentPaneBindingResult', KERNEL)
  assertIncludes(kernelSource, "callHelper<unknown>('workerLifecycle', { operation: 'captureCurrentPaneBinding' })", KERNEL)
  assertIncludes(kernelSource, 'TMUX: env.TMUX', `${KERNEL} helper env`)
  assertIncludes(kernelSource, 'TMUX_PANE: env.TMUX_PANE', `${KERNEL} helper env`)

  assertIncludes(goSource, 'const workerLifecycleCurrentPaneBindingFormat = "#{pane_id}\\t#{session_name}:#{window_id}"', GO_SOURCE)
  assertIncludes(goSource, 'type workerPaneBindingResult struct', GO_SOURCE)
  assertIncludes(goSource, 'func captureCurrentPaneBinding() workerPaneBindingResult', GO_SOURCE)
  assertIncludes(goSource, GO_CURRENT_PANE_COMMAND, GO_SOURCE)
  assert.match(goSource, /case "captureCurrentPaneBinding"/, 'Go worker lifecycle current-pane operation should be implemented')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'Go should use exact current-pane display-message command')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, 'Go must not use target-based display-message')
  assert.equal(/"display-message",\s*"-p",\s*"#{pane_id}"/.test(goSource), false, 'Go must not split current pane id into separate display-message calls')
  assert.equal(/"display-message",\s*"-p",\s*"#{session_name}:#{window_id}"/.test(goSource), false, 'Go must not split current target into separate display-message calls')
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include ${operation}`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
  for (const forbidden of ['os.ReadFile', 'os.WriteFile', 'os.Create', 'PI_AGENTTEAM_HOME', 'agentteam_task', 'agentteam_receive', 'report_done', 'report_blocked', 'renderPanel', 'openTeamPanel', 'npm publish', 'npm version']) {
    assert.equal(goSource.includes(forbidden), false, `${GO_SOURCE} must not migrate ${forbidden}`)
  }
}

function assertFacadeRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const tmuxCore = env.helpers.requireDist('tmux/core.js')
  const original = kernel.createAgentTeamKernelAdapter
  const previousTmux = process.env.TMUX
  try {
    let calls = 0
    delete process.env.TMUX
    kernel.createAgentTeamKernelAdapter = () => ({
      captureCurrentPaneBinding: () => {
        calls += 1
        throw new Error('outside tmux guard must avoid helper')
      },
    })
    assert.equal(tmuxCore.captureCurrentPaneBinding(), null)
    assert.equal(calls, 0)

    process.env.TMUX = '/tmp/agentteam-v0660-test-tmux'
    kernel.createAgentTeamKernelAdapter = () => ({
      captureCurrentPaneBinding: () => ({ ok: true, operation: 'captureCurrentPaneBinding', capability: 'workerLifecycle', paneId: '%current', target: 'session:@7', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
    })
    assert.deepEqual(tmuxCore.captureCurrentPaneBinding(), { paneId: '%current', target: 'session:@7' })

    kernel.createAgentTeamKernelAdapter = () => ({
      captureCurrentPaneBinding: () => ({ ok: true, operation: 'captureCurrentPaneBinding', capability: 'workerLifecycle', paneId: '%current', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
    })
    assert.equal(tmuxCore.captureCurrentPaneBinding(), null)

    kernel.createAgentTeamKernelAdapter = () => ({
      captureCurrentPaneBinding: () => ({ ok: false, operation: 'captureCurrentPaneBinding', capability: 'workerLifecycle', status: 'unknown', resultMarker: 'stale', failureKind: 'tmux-command-failed', reason: 'compact unavailable', error: 'compact unavailable', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
    })
    assert.equal(tmuxCore.captureCurrentPaneBinding(), null)
  } finally {
    kernel.createAgentTeamKernelAdapter = original
    if (previousTmux === undefined) delete process.env.TMUX
    else process.env.TMUX = previousTmux
  }
}

function assertDirectGoBehavior(root) {
  if (!hasGoToolchain()) return
  const fakeTmuxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0660-fake-tmux-'))
  try {
    writeFakeTmux(fakeTmuxRoot)
    const env = { PATH: `${fakeTmuxRoot}${path.delimiter}${process.env.PATH || ''}`, TMUX: '/tmp/agentteam-v0660-fake-socket', TMUX_PANE: '%current' }
    const current = runGoHelper(root, { jsonrpc: '2.0', id: 'current-binding', method: 'workerLifecycle', params: { operation: 'captureCurrentPaneBinding' } }, env)
    assert.equal(current.status, 0, current.stderr)
    const currentResponse = JSON.parse(current.stdout.trim())
    assert.equal(currentResponse.jsonrpc, '2.0')
    assert.equal(currentResponse.id, 'current-binding')
    assert.deepEqual(currentResponse.result, {
      ok: true,
      operation: 'captureCurrentPaneBinding',
      capability: CAPABILITY,
      paneId: '%current',
      target: 'session:@current',
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    })

    const missingEnv = { PATH: `${fakeTmuxRoot}${path.delimiter}${process.env.PATH || ''}`, TMUX: '', TMUX_PANE: '' }
    const missing = runGoHelper(root, { jsonrpc: '2.0', id: 'current-binding-missing-tmux', method: 'workerLifecycle', params: { operation: 'captureCurrentPaneBinding' } }, missingEnv)
    assert.equal(missing.status, 0, missing.stderr)
    const missingResponse = JSON.parse(missing.stdout.trim())
    assert.equal(missingResponse.result.ok, false)
    assert.equal(missingResponse.result.operation, 'captureCurrentPaneBinding')
    assert.equal(missingResponse.result.capability, CAPABILITY)
    assert.equal(missingResponse.result.status, 'unknown')
    assert.equal(missingResponse.result.resultMarker, 'stale')
    assert.equal(['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found'].includes(missingResponse.result.failureKind), true)
    assert.equal(/stdout|stderr|stack|MAILBOX_BODY|REPORT_BODY|worker transcript|rawState/i.test(JSON.stringify(missingResponse.result)), false)
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
  assert.deepEqual(provenance.smoke.workerLifecycleCaptureCurrentPaneBinding.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found'])
  assert.equal(manifest.smoke.workerLifecycleCaptureCurrentPaneBinding.acceptedFailureKinds.includes('tmux-unavailable'), true)
  assert.equal(checksums.includes(HELPER), true)
  assert.equal(checksums.includes(MANIFEST), true)
  assert.equal(checksums.includes(PROVENANCE), true)
  assert.equal(checksums.includes(ATTESTATION), true)
  assert.equal(attestation.includes('agentteam-tmuxSnapshotParse'), true)
}

module.exports = {
  name: 'Go kernel v0.6.60 Go captureCurrentPaneBinding facade cutover',
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
