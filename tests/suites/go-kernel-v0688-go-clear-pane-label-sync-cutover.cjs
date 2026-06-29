const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ADAPTER_DELEGATION,
  ASYNC_HELPER_SURFACE,
  AUTHORIZED_TMUX_COMMANDS,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_CLEAR_PANE_LABEL_SYNC_CUTOVER_SCHEMA_VERSION,
  GO_CLEAR_PANE_LABEL_SYNC_CUTOVER_THEME,
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
  REMOVED_TYPESCRIPT_FALLBACKS,
  RUNTIME_FILE,
  SYNC_ADAPTER,
  TEAM_ACTIONS_FILE,
  TEAM_PANES_FILE,
  WINDOWS_FILE,
  WORKER_SPAWN_FILE,
  goClearPaneLabelSyncCutover,
} = require('../fixtures/kernel/v0688/goClearPaneLabelSyncCutover.cjs')

const DOC = 'docs/perf/v0.6.88-go-clear-pane-label-sync-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0688/goClearPaneLabelSyncCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0688-go-clear-pane-label-sync-cutover.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const EXPECTED_COMMANDS = [
  'tmux set-option -up -t <paneId> @agentteam-name',
  "tmux select-pane -t <paneId> -T ''",
]
const BAD_HELPER_OUTPUT = 'CLEAR_PANE_LABEL_SYNC_BAD_HELPER_OUTPUT_SHOULD_NOT_LEAK'
const BAD_RAW_PANE_ID = '%987654321x'
const REQUIRED_DOC = [
  '# v0.6.88 Go clearPaneLabelSync Cutover',
  'Result: v0.6.88 cuts over only `tmux/panes.ts clearPaneLabelSync(paneId)`',
  "runTmuxNoThrow(['set-option', '-up', '-t', paneId, '@agentteam-name'])",
  "runTmuxNoThrow(['select-pane', '-t', paneId, '-T', ''])",
  '`workerLifecycle.clearPaneLabel`',
  '`clearPaneLabelSync(paneId): void` remains synchronous, public no-throw, and returns no value.',
  '`createAgentTeamKernelAdapter().clearPaneLabel(paneId)`',
  'The hidden direct TypeScript fallback for this behavior is removed',
  '`tmux set-option -up -t <paneId> @agentteam-name`',
  "`tmux select-pane -t <paneId> -T ''`",
  'No new Go operation, sync-specific Go handler, native helper rebuild, or new native smoke key is introduced.',
  'compactly validated as a `%123`-style tmux pane id',
  'Raw pane input, raw tmux stdout/stderr, helper paths, stack traces, and raw helper output must not leak',
  '`tmux/labels.ts clearPaneLabel(paneId, signal)` remains the existing v0.6.78 async Go-backed helper and is unchanged',
  '`killPane(paneId)` remains v0.6.86 Go-backed and unchanged',
  '`package.json` remains `0.6.8`',
  '`tests/fixtures/kernel/v0688/goClearPaneLabelSyncCutover.cjs`',
  '`tests/suites/go-kernel-v0688-go-clear-pane-label-sync-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.88 Go clearPaneLabelSync cutover',
  'docs/perf/v0.6.88-go-clear-pane-label-sync-cutover.md',
  '`tmux/panes.ts clearPaneLabelSync(paneId)` delegates to synchronous `createAgentTeamKernelAdapter().clearPaneLabel(paneId)`',
  'reuses existing Go `workerLifecycle.clearPaneLabel` operation',
  'hidden direct TypeScript `runTmuxNoThrow([\'set-option\', \'-up\', \'-t\', paneId, \'@agentteam-name\'])` and `runTmuxNoThrow([\'select-pane\', \'-t\', paneId, \'-T\', \'\'])` fallbacks are removed',
  'no Go source/native rebuild or new native smoke key',
  '**v0.6.88 Go clearPaneLabelSync cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'clearPaneLabelSyncGoHandlerAdded: true',
  'clearPaneLabelSyncNativeSmokeAdded: true',
  'clearPaneLabelAsyncChanged: true',
  'clearAndKillTeamPanesChanged: true',
  'wakePaneMigrated: true',
  'broaderDestructiveLifecycleMigrated: true',
  'stateRepositoryMigrated: true',
  'taskReportPlanRunMigrated: true',
  'teamPanelViewModelMigrated: true',
  'releasePackageVerificationMigrated: true',
  'nativeArtifactRenamed: true',
  'nativeHelperRebuilt: true',
  'goSourceChanged: true',
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-v0688-${name}-`))
  const file = path.join(dir, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return { dir, file }
}

function assertNoBadClearLeak(value) {
  const text = JSON.stringify(value)
  assert.equal(text.includes(BAD_HELPER_OUTPUT), false, 'clearPaneLabel diagnostics must not leak raw helper/stdout/stderr text')
  assert.equal(text.includes(BAD_RAW_PANE_ID), false, 'clearPaneLabel diagnostics must not leak raw pane id text')
  assert.equal(/stdout|stderr|stack|MAILBOX_BODY|REPORT_BODY|worker transcript|rawState|helper paths|native\/tmuxSnapshotParse/i.test(text), false, 'clearPaneLabel diagnostics must stay compact')
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goClearPaneLabelSyncCutover)), goClearPaneLabelSyncCutover)
  assert.equal(goClearPaneLabelSyncCutover.schemaVersion, GO_CLEAR_PANE_LABEL_SYNC_CUTOVER_SCHEMA_VERSION)
  assert.equal(goClearPaneLabelSyncCutover.theme, GO_CLEAR_PANE_LABEL_SYNC_CUTOVER_THEME)
  assert.equal(goClearPaneLabelSyncCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goClearPaneLabelSyncCutover.helperVersion, HELPER_VERSION)
  assert.equal(goClearPaneLabelSyncCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goClearPaneLabelSyncCutover.capability, CAPABILITY)
  assert.equal(goClearPaneLabelSyncCutover.operation, OPERATION)
  assert.equal(goClearPaneLabelSyncCutover.facadeName, FACADE_NAME)
  assert.equal(goClearPaneLabelSyncCutover.helperName, HELPER_NAME)
  assert.equal(goClearPaneLabelSyncCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goClearPaneLabelSyncCutover.labelsFile, LABELS_FILE)
  assert.equal(goClearPaneLabelSyncCutover.kernelFile, KERNEL_FILE)
  assert.equal(goClearPaneLabelSyncCutover.goSourceFile, GO_SOURCE_FILE)
  assert.equal(goClearPaneLabelSyncCutover.windowsFile, WINDOWS_FILE)
  assert.equal(goClearPaneLabelSyncCutover.teamPanesFile, TEAM_PANES_FILE)
  assert.equal(goClearPaneLabelSyncCutover.teamActionsFile, TEAM_ACTIONS_FILE)
  assert.equal(goClearPaneLabelSyncCutover.workerSpawnFile, WORKER_SPAWN_FILE)
  assert.equal(goClearPaneLabelSyncCutover.nativeRoot, NATIVE_ROOT)
  assert.equal(goClearPaneLabelSyncCutover.adapterDelegation, ADAPTER_DELEGATION)
  assert.deepEqual(goClearPaneLabelSyncCutover.removedTypescriptFallbacks, [...REMOVED_TYPESCRIPT_FALLBACKS])
  assert.deepEqual(goClearPaneLabelSyncCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(goClearPaneLabelSyncCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goClearPaneLabelSyncCutover.authorizedTmuxCommands, [...AUTHORIZED_TMUX_COMMANDS])
  assert.deepEqual(goClearPaneLabelSyncCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goClearPaneLabelSyncCutover.inputPolicy, INPUT_POLICY)
  assert.deepEqual(goClearPaneLabelSyncCutover.publicFacade, PUBLIC_FACADE)
  assert.deepEqual(goClearPaneLabelSyncCutover.syncAdapter, SYNC_ADAPTER)
  assert.deepEqual(goClearPaneLabelSyncCutover.asyncHelperSurface, ASYNC_HELPER_SURFACE)
  assert.deepEqual(goClearPaneLabelSyncCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goClearPaneLabelSyncCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(goClearPaneLabelSyncCutover.nativeArtifactSnapshot, NATIVE_ARTIFACT_SNAPSHOT)

  assert.deepEqual(AUTHORIZED_TMUX_COMMANDS.map(command => command.rendered), EXPECTED_COMMANDS)
  assert.deepEqual(AUTHORIZED_TMUX_COMMANDS.map(command => command.args), [
    ['set-option', '-up', '-t', '<paneId>', '@agentteam-name'],
    ['select-pane', '-t', '<paneId>', '-T', ''],
  ])
  for (const command of AUTHORIZED_TMUX_COMMANDS) {
    assert.equal(command.operation, OPERATION)
    assert.equal(command.argvOnly, true)
    assert.equal(command.shellInterpolationAllowed, false)
    assert.equal(command.mutatesTmux, true)
    assert.equal(command.destructive, false)
  }
  assert.equal(PUBLIC_FACADE.noThrow, true)
  assert.equal(PUBLIC_FACADE.voidReturn, true)
  assert.equal(PUBLIC_FACADE.async, false)
  assert.equal(PUBLIC_FACADE.hiddenTypescriptFallbackRemoved, true)
  assert.equal(INPUT_POLICY.paneIdPattern, '^%[0-9]+$')
  assert.equal(INPUT_POLICY.argvOnly, true)
  assert.equal(INPUT_POLICY.rawTmuxOutputLeakageAllowed, false)
  assert.equal(SYNC_ADAPTER.reusedOperation, OPERATION)
  assert.equal(SYNC_ADAPTER.helperCall, "callHelper<unknown>('workerLifecycle', { operation: 'clearPaneLabel', paneId: requestedPaneId })")
  assert.equal(ASYNC_HELPER_SURFACE.helperCall.includes('callHelperAsync'), true)
  assert.equal(ASYNC_HELPER_SURFACE.helperCall.includes("operation: 'clearPaneLabel'"), true)

  assert.equal(goClearPaneLabelSyncCutover.clearPaneLabelSyncMigrated, true)
  assert.equal(goClearPaneLabelSyncCutover.clearPaneLabelSyncAdapterMethodAdded, true)
  assert.equal(goClearPaneLabelSyncCutover.reusedExistingClearPaneLabelOperation, true)
  assert.equal(goClearPaneLabelSyncCutover.clearPaneLabelSyncGoHandlerAdded, false)
  assert.equal(goClearPaneLabelSyncCutover.clearPaneLabelSyncNativeSmokeAdded, false)
  assert.equal(goClearPaneLabelSyncCutover.typescriptClearPaneLabelSyncFallbackRemoved, true)
  assert.equal(goClearPaneLabelSyncCutover.publicNoThrowVoidPreserved, true)
  assert.equal(goClearPaneLabelSyncCutover.clearPaneLabelAsyncChanged, false)
  assert.equal(goClearPaneLabelSyncCutover.clearPaneLabelsForTeamChanged, false)
  assert.equal(goClearPaneLabelSyncCutover.clearAndKillTeamPanesChanged, false)
  assert.equal(goClearPaneLabelSyncCutover.teamActionsCleanupChanged, false)
  assert.equal(goClearPaneLabelSyncCutover.workerSpawnPaneCleanupChanged, false)
  assert.equal(goClearPaneLabelSyncCutover.killPaneChanged, false)
  assert.equal(goClearPaneLabelSyncCutover.createTeammatePaneChanged, false)
  assert.equal(goClearPaneLabelSyncCutover.detachedNewSessionChanged, false)
  assert.equal(goClearPaneLabelSyncCutover.detachedNewWindowChanged, false)
  assert.equal(goClearPaneLabelSyncCutover.wakePaneMigrated, false)
  assert.equal(goClearPaneLabelSyncCutover.broaderDestructiveLifecycleMigrated, false)
  assert.equal(goClearPaneLabelSyncCutover.stateRepositoryMigrated, false)
  assert.equal(goClearPaneLabelSyncCutover.taskReportPlanRunMigrated, false)
  assert.equal(goClearPaneLabelSyncCutover.teamPanelViewModelMigrated, false)
  assert.equal(goClearPaneLabelSyncCutover.releasePackageVerificationMigrated, false)
  assert.equal(goClearPaneLabelSyncCutover.goSourceChanged, false)
  assert.equal(goClearPaneLabelSyncCutover.nativeArtifactRenamed, false)
  assert.equal(goClearPaneLabelSyncCutover.nativeHelperRebuilt, false)
  assert.equal(goClearPaneLabelSyncCutover.packageVersionChanged, false)
  assert.equal(goClearPaneLabelSyncCutover.packageReleaseApproved, false)
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
  const teamPanesSource = read(root, TEAM_PANES_FILE)
  const teamActionsSource = read(root, TEAM_ACTIONS_FILE)
  const workerSpawnSource = read(root, WORKER_SPAWN_FILE)
  const clearBody = functionBody(panesSource, FACADE_NAME)
  const killBody = functionBody(panesSource, 'killPane')
  const createBody = functionBody(panesSource, 'createTeammatePane')
  const asyncClearBody = functionBody(labelsSource, 'clearPaneLabel')
  const clearAllBody = functionBody(labelsSource, 'clearPaneLabelsForTeam')

  assertIncludes(panesSource, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", RUNTIME_FILE)
  assert.equal(panesSource.includes("import { runTmuxNoThrow } from './client.js'"), false, `${RUNTIME_FILE} must remove runTmuxNoThrow import when no longer used`)
  assertIncludes(clearBody, PUBLIC_FACADE.signature, `${RUNTIME_FILE} clearPaneLabelSync signature`)
  assertIncludes(clearBody, ADAPTER_DELEGATION, `${RUNTIME_FILE} clearPaneLabelSync adapter delegation`)
  assertIncludes(clearBody, 'try {', `${RUNTIME_FILE} clearPaneLabelSync no-throw wrapper`)
  assertIncludes(clearBody, 'catch (_) {}', `${RUNTIME_FILE} clearPaneLabelSync swallow wrapper`)
  for (const fallback of REMOVED_TYPESCRIPT_FALLBACKS) assert.equal(clearBody.includes(fallback), false, `${RUNTIME_FILE} clearPaneLabelSync must remove direct TS fallback ${fallback}`)
  assert.equal([...clearBody.matchAll(/runTmuxNoThrow\(/g)].length, 0, `${RUNTIME_FILE} clearPaneLabelSync must not keep direct no-throw tmux calls`)
  assert.equal(clearBody.includes('await '), false, `${RUNTIME_FILE} clearPaneLabelSync must remain synchronous`)
  assert.equal(clearBody.includes('throw '), false, `${RUNTIME_FILE} clearPaneLabelSync must remain no-throw`)
  assert.equal(clearBody.includes('return '), false, `${RUNTIME_FILE} clearPaneLabelSync must remain void/no return`)
  assert.equal(clearBody.includes('clearPaneLabelAsync'), false, `${RUNTIME_FILE} clearPaneLabelSync must use sync adapter method`)

  assertIncludes(killBody, 'createAgentTeamKernelAdapter().killPane(paneId)', `${RUNTIME_FILE} killPane remains v0.6.86 Go-backed`)
  assert.equal(killBody.includes("runTmuxNoThrow(['kill-pane', '-t', paneId])"), false, `${RUNTIME_FILE} killPane fallback remains removed`)
  assertIncludes(createBody, 'createAgentTeamKernelAdapter().createTeammatePaneAsync({', `${RUNTIME_FILE} createTeammatePane remains v0.6.80 Go-backed`)

  assertIncludes(asyncClearBody, ASYNC_HELPER_SURFACE.adapterDelegation, `${LABELS_FILE} async clearPaneLabel remains unchanged`)
  assert.equal(asyncClearBody.includes('clearPaneLabelSync'), false, `${LABELS_FILE} async clear helper must not depend on sync facade`)
  assertIncludes(clearAllBody, 'await clearPaneLabel(member.paneId, signal)', `${LABELS_FILE} clearPaneLabelsForTeam orchestration remains through async helper`)
  assert.equal(clearAllBody.includes('createAgentTeamKernelAdapter'), false, `${LABELS_FILE} clearPaneLabelsForTeam remains TS-owned orchestration`)
  assertIncludes(teamPanesSource, 'clearPaneLabelSync(options.preservePaneId)', `${TEAM_PANES_FILE} preserve-pane cleanup still calls sync facade`)
  assertIncludes(teamPanesSource, 'void clearPaneLabelsForTeam(team)', `${TEAM_PANES_FILE} async clear orchestration remains`)
  assertIncludes(teamActionsSource, 'clearPaneLabelSync(paneId)', `${TEAM_ACTIONS_FILE} preserve-pane cleanup remains`)
  assertIncludes(teamActionsSource, 'clearPaneLabelSync(currentPane)', `${TEAM_ACTIONS_FILE} current pane cleanup remains`)
  assert.equal(workerSpawnSource.includes('clearPaneLabelSync'), false, `${WORKER_SPAWN_FILE} remains unrelated to sync clear facade`)
}

function assertKernelRuntime(root) {
  const kernelSource = read(root, KERNEL_FILE)
  assertIncludes(kernelSource, 'clearPaneLabelAsync(paneId: string, signal?: AbortSignal): Promise<AgentTeamKernelPaneLabelClearing>', `${KERNEL_FILE} async clear adapter remains`)
  assertIncludes(kernelSource, SYNC_ADAPTER.method, `${KERNEL_FILE} sync clear adapter method`)
  assertIncludes(kernelSource, "async clearPaneLabelAsync(paneId, signal) {", `${KERNEL_FILE} async clear implementation remains`)
  assertIncludes(kernelSource, 'clearPaneLabel(paneId) {', `${KERNEL_FILE} sync clear implementation`)
  assertIncludes(kernelSource, ASYNC_HELPER_SURFACE.helperCall, `${KERNEL_FILE} async clear still uses clearPaneLabel operation`)
  assertIncludes(kernelSource, SYNC_ADAPTER.helperCall, `${KERNEL_FILE} sync clear reuses clearPaneLabel operation`)
  assertIncludes(kernelSource, 'validatePaneLabelClearingResult(helperResult, requestedPaneId)', `${KERNEL_FILE} sync/async clear validation`)
  assertIncludes(kernelSource, 'workerLifecycleUnavailablePaneLabelClearing(paneId, \'invalid-pane-id\')', `${KERNEL_FILE} compact invalid pane diagnostics`)
  assertIncludes(kernelSource, "recordRuntimeFallback('helper-incompatible-response', 'workerLifecycle clearPaneLabel result shape')", `${KERNEL_FILE} compact sync incompatible fallback detail`)
  assert.equal(kernelSource.includes('clearPaneLabelSync'), false, `${KERNEL_FILE} must not add sync-specific worker lifecycle operation text`)
  assert.equal(kernelSource.includes('workerLifecycleClearPaneLabelSync'), false, `${KERNEL_FILE} must not add sync-specific profile/smoke text`)
  assert.equal(kernelSource.includes('clear-pane-label-sync'), false, `${KERNEL_FILE} must not add sync-specific operation text`)
  assert.equal(kernelSource.includes('set-option", "-up"'), false, `${KERNEL_FILE} adapter must not construct tmux command text`)
  assert.equal(kernelSource.includes('select-pane", "-t", paneID, "-T", ""'), false, `${KERNEL_FILE} adapter must not construct tmux command text`)
}

function assertGoRuntimeUnchanged(root) {
  const goSource = read(root, GO_SOURCE_FILE)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE_FILE} should include workerLifecycle ${operation}`)
  assertIncludes(goSource, 'func clearPaneLabel(params map[string]any) workerPaneLabelClearingResult', `${GO_SOURCE_FILE} existing clearPaneLabel implementation`)
  assertIncludes(goSource, 'paneID := compactTmuxPaneID(stringParam(params, "paneId"))', `${GO_SOURCE_FILE} compact pane validation`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE_FILE} existing argv-only clear set-option`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE_FILE} existing argv-only clear title`)
  assert.equal([...goSource.matchAll(/case "clearPaneLabel"/g)].length, 1, `${GO_SOURCE_FILE} must contain exactly one clearPaneLabel case`)
  assert.equal([...goSource.matchAll(/func clearPaneLabel\(params map\[string\]any\) workerPaneLabelClearingResult/g)].length, 1, `${GO_SOURCE_FILE} must contain exactly one clearPaneLabel function`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name"\)/g)].length, 1, `${GO_SOURCE_FILE} must contain exactly one clearPaneLabel set-option command`)
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "select-pane", "-t", paneID, "-T", ""\)/g)].length, 1, `${GO_SOURCE_FILE} must contain exactly one clearPaneLabel select-pane command`)
  assert.equal(goSource.includes('clearPaneLabelSync'), false, `${GO_SOURCE_FILE} must not add sync-specific Go operation`)
  assert.equal(goSource.includes('workerLifecycleClearPaneLabelSync'), false, `${GO_SOURCE_FILE} must not add sync-specific profile/smoke text`)
  assert.equal(goSource.includes('clear-pane-label-sync'), false, `${GO_SOURCE_FILE} must not add sync-specific handler`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE_FILE} must not add forbidden command ${command}`)
  assert.equal(/exec\.Command\s*\(/.test(goSource), false, `${GO_SOURCE_FILE} must not use shell-capable exec.Command`)
  assert.equal(/"(?:sh|bash|zsh|fish)"/.test(goSource), false, `${GO_SOURCE_FILE} must not invoke shells`)
}

async function assertAdapterNoLeakAndPublicNoThrow(distRoot) {
  const kernel = require(path.join(distRoot, 'core/kernel.js'))
  const tmuxPanes = require(path.join(distRoot, 'tmux/panes.js'))
  const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(distRoot, 'missing-clear-pane-label-sync-helper'), env: {} })

  assert.equal(typeof adapter.clearPaneLabel, 'function')
  assert.doesNotThrow(() => tmuxPanes.clearPaneLabelSync('not-a-pane-id'), 'public clearPaneLabelSync must swallow invalid pane id failures')

  const invalid = adapter.clearPaneLabel(`${BAD_RAW_PANE_ID}x`)
  assert.equal(invalid.ok, false)
  assert.equal(invalid.operation, OPERATION)
  assert.equal(invalid.capability, CAPABILITY)
  assert.equal(invalid.cleared, false)
  assert.equal(invalid.failureKind, 'invalid-pane-id')
  assert.equal(invalid.paneId, '')
  assertNoBadClearLeak(invalid)

  const missingHelper = adapter.clearPaneLabel('%123')
  assert.equal(missingHelper.ok, false)
  assert.equal(missingHelper.operation, OPERATION)
  assert.equal(missingHelper.cleared, false)
  assertNoBadClearLeak(missingHelper)

  const malicious = writeHelper('malicious-clear-pane-label-output', `#!/usr/bin/env node
const fs = require('node:fs')
const request = JSON.parse(fs.readFileSync(0, 'utf8').trim())
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const baseHealth = { ok: true, implementation: 'go', protocolVersion: 1, helperVersion: '0.3.0-read-model-shadow', capabilities: ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'], businessPathsConnected: false }
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'workerLifecycle') respond({ ok: false, operation: 'clearPaneLabel', capability: 'workerLifecycle', paneId: '${BAD_RAW_PANE_ID}', cleared: false, status: 'unknown', resultMarker: 'stale', failureKind: 'tmux-command-failed', reason: '${BAD_HELPER_OUTPUT}', error: '${BAD_HELPER_OUTPUT}', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true })
else respond(baseHealth)
`)
  const previousMode = process.env.PI_AGENTTEAM_KERNEL
  const previousHelper = process.env.PI_AGENTTEAM_KERNEL_HELPER
  try {
    const maliciousAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: malicious.file, env: {} })
    const leaked = maliciousAdapter.clearPaneLabel('%123')
    assert.equal(leaked.ok, false)
    assert.equal(leaked.operation, OPERATION)
    assert.equal(leaked.cleared, false)
    assert.equal(leaked.failureKind, 'tmux-command-failed')
    assertNoBadClearLeak(leaked)

    process.env.PI_AGENTTEAM_KERNEL = 'go'
    process.env.PI_AGENTTEAM_KERNEL_HELPER = malicious.file
    assert.doesNotThrow(() => tmuxPanes.clearPaneLabelSync('%123'), 'public clearPaneLabelSync must swallow helper compact failures')
  } finally {
    if (previousMode === undefined) delete process.env.PI_AGENTTEAM_KERNEL
    else process.env.PI_AGENTTEAM_KERNEL = previousMode
    if (previousHelper === undefined) delete process.env.PI_AGENTTEAM_KERNEL_HELPER
    else process.env.PI_AGENTTEAM_KERNEL_HELPER = previousHelper
    fs.rmSync(malicious.dir, { recursive: true, force: true })
  }
}

function assertArtifactPipelineAndNativeUnchanged(root) {
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  const provenance = JSON.parse(read(root, `${NATIVE_ROOT}/provenance.json`))
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
  assert.deepEqual(manifest.smoke.workerLifecycleClearPaneLabel, NATIVE_ARTIFACT_SNAPSHOT.clearPaneLabelSmoke)
  assert.deepEqual(provenance.smoke.workerLifecycleClearPaneLabel, NATIVE_ARTIFACT_SNAPSHOT.clearPaneLabelSmoke)
  assert.deepEqual(manifest.smoke.workerLifecycleKillPane, NATIVE_ARTIFACT_SNAPSHOT.killPaneSmoke)
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.smoke, 'workerLifecycleClearPaneLabelSync'), false, 'native manifest must not add sync-specific clear smoke')
  assert.equal(Object.prototype.hasOwnProperty.call(provenance.smoke, 'workerLifecycleClearPaneLabelSync'), false, 'native provenance must not add sync-specific clear smoke')
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
  name: 'Go kernel v0.6.88 Go clearPaneLabelSync cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertRuntimeCutover(root)
    assertKernelRuntime(root)
    assertGoRuntimeUnchanged(root)
    await assertAdapterNoLeakAndPublicNoThrow(env.helpers.distRoot)
    assertArtifactPipelineAndNativeUnchanged(root)
    assertPackageAndReleaseGuards(root)
  },
}
