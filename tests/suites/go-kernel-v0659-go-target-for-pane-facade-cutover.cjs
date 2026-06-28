const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ASYNC_BINDING_DECISION,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_BACKED_BINDING_PATH,
  GO_TARGET_FOR_PANE_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_TARGET_FOR_PANE_FACADE_CUTOVER_THEME,
  HELPER_VERSION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  goTargetForPaneFacadeCutover,
} = require('../fixtures/kernel/v0659/goTargetForPaneFacadeCutover.cjs')

const DOC = 'docs/perf/v0.6.59-go-target-for-pane-facade-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0659/goTargetForPaneFacadeCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0659-go-target-for-pane-facade-cutover.cjs'
const TMUX_CORE = 'tmux/core.ts'
const TMUX_SNAPSHOT = 'tmux/snapshot.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const HELPER = `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`
const MANIFEST = `${NATIVE_ROOT}/manifest.json`
const CHECKSUMS = `${NATIVE_ROOT}/SHA256SUMS`
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.59 Go targetForPaneId Facade Cutover',
  'Result: v0.6.59 cuts over the TypeScript `targetForPaneId(paneId)` facade/default path to the existing Go-backed `resolvePaneBinding(paneId)` / `workerLifecycle.inspectPane` path.',
  '`tmux/core.ts` `targetForPaneId(paneId)` now returns `resolvePaneBinding(paneId)?.target ?? null`.',
  'The TypeScript `runTmuxNoThrow([\'display-message\', \'-p\', \'-t\', paneId, \'#{session_name}:#{window_id}\'])` fallback for `targetForPaneId()` is removed.',
  '`targetForPaneId(paneId)` preserves the existing public API: `string | null`.',
  'Helper failure, invalid pane id, pane-not-found, missing target, and empty pane id all fail closed to `null` via `resolvePaneBinding()`.',
  '`resolvePaneBinding()`, `paneExists()`, `inspectPane()`, and `listAgentTeamPanes()` remain on their existing Go-backed facade seams.',
  '`resolvePaneBindingAsync(paneId, signal)` is intentionally not cut over in this slice, and is later cut over by v0.6.61.',
  'Reason at v0.6.59 time: it accepted `AbortSignal` and awaited two async tmux calls that received the signal.',
  'Decision superseded by v0.6.61: `resolvePaneBindingAsync` now delegates to the cancellable `inspectWorkerPaneAsync(paneId, signal)` kernel adapter seam.',
  '`captureCurrentPaneBinding()` is cut over separately by v0.6.60, not by this slice.',
  '`windowExists()` and `firstPaneInWindow()` are cut over separately by v0.6.62 through a cancellable async Go `listPanesInWindow` seam.',
  'no Go source change in v0.6.59 itself; v0.6.60 later adds a narrow current-pane binding operation.',
  'no native helper rebuild in v0.6.59 itself; v0.6.60 later rebuilds the existing helper path.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0659/goTargetForPaneFacadeCutover.cjs`',
  '`tests/suites/go-kernel-v0659-go-target-for-pane-facade-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.59 Go targetForPaneId facade cutover',
  'docs/perf/v0.6.59-go-target-for-pane-facade-cutover.md',
  'tmux/core.ts targetForPaneId(paneId) delegates to resolvePaneBinding(paneId)?.target ?? null',
  'the TypeScript display-message fallback for targetForPaneId is removed',
  'resolvePaneBindingAsync is cut over separately by v0.6.61 because that later slice adds a cancellable async helper seam',
  'captureCurrentPaneBinding is cut over separately by v0.6.60 and window helpers by v0.6.62',
  '**v0.6.59 Go targetForPaneId facade cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'captureCurrentPaneBindingMigrated: true',
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
  'nativeHelperRebuilt: true',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goTargetForPaneFacadeCutover)), goTargetForPaneFacadeCutover)
  assert.equal(goTargetForPaneFacadeCutover.schemaVersion, GO_TARGET_FOR_PANE_FACADE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goTargetForPaneFacadeCutover.theme, GO_TARGET_FOR_PANE_FACADE_CUTOVER_THEME)
  assert.equal(goTargetForPaneFacadeCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goTargetForPaneFacadeCutover.helperVersion, HELPER_VERSION)
  assert.equal(goTargetForPaneFacadeCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goTargetForPaneFacadeCutover.capability, CAPABILITY)
  assert.equal(goTargetForPaneFacadeCutover.facadeName, FACADE_NAME)
  assert.equal(goTargetForPaneFacadeCutover.goBackedBindingPath, GO_BACKED_BINDING_PATH)
  assert.equal(goTargetForPaneFacadeCutover.asyncBindingDecision, ASYNC_BINDING_DECISION)
  assert.deepEqual(goTargetForPaneFacadeCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goTargetForPaneFacadeCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goTargetForPaneFacadeCutover.facadeCutoverMigrated, true)
  assert.equal(goTargetForPaneFacadeCutover.typescriptDisplayMessageFallbackRemoved, true)
  assert.equal(goTargetForPaneFacadeCutover.failClosedNullOnHelperFailure, true)
  assert.equal(goTargetForPaneFacadeCutover.failClosedNullOnMissingTarget, true)
  assert.equal(goTargetForPaneFacadeCutover.resolvePaneBindingFacadeStillMigrated, true)
  assert.equal(goTargetForPaneFacadeCutover.inspectPaneFacadeStillMigrated, true)
  assert.equal(goTargetForPaneFacadeCutover.paneExistsFacadeStillMigrated, true)
  assert.equal(goTargetForPaneFacadeCutover.listAgentTeamPanesFacadeStillMigrated, true)
  assert.equal(goTargetForPaneFacadeCutover.resolvePaneBindingAsyncMigratedByLaterSlice, true)
  assert.equal(goTargetForPaneFacadeCutover.captureCurrentPaneBindingMigrated, false)
  assert.equal(goTargetForPaneFacadeCutover.windowHelpersMigratedByLaterSlice, true)
  assert.equal(goTargetForPaneFacadeCutover.createTeammatePaneMigrated, false)
  assert.equal(goTargetForPaneFacadeCutover.wakePaneMigrated, false)
  assert.equal(goTargetForPaneFacadeCutover.syncPaneLabelsMigrated, false)
  assert.equal(goTargetForPaneFacadeCutover.killPaneMigrated, false)
  assert.equal(goTargetForPaneFacadeCutover.stateRepositoryMigrated, false)
  assert.equal(goTargetForPaneFacadeCutover.taskReportPlanRunMigrated, false)
  assert.equal(goTargetForPaneFacadeCutover.teamPanelViewModelMigrated, false)
  assert.equal(goTargetForPaneFacadeCutover.releasePackageVerificationMigrated, false)
  assert.equal(goTargetForPaneFacadeCutover.nativeArtifactRenamed, false)
  assert.equal(goTargetForPaneFacadeCutover.nativeHelperRebuilt, false)
  assert.deepEqual(goTargetForPaneFacadeCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goTargetForPaneFacadeCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goTargetForPaneFacadeCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const goSource = read(root, GO_SOURCE)
  const targetBody = functionBody(coreSource, 'targetForPaneId')
  const resolveBody = functionBody(coreSource, 'resolvePaneBinding')
  const resolveAsyncBody = functionBody(coreSource, 'resolvePaneBindingAsync')
  const inspectBody = functionBody(coreSource, 'inspectPane')
  const paneExistsBody = functionBody(coreSource, 'paneExists')
  const listBody = functionBody(coreSource, 'listAgentTeamPanes')
  const captureBody = functionBody(coreSource, 'captureCurrentPaneBinding')
  const windowExistsBody = functionBody(coreSource, 'windowExists')
  const firstPaneBody = functionBody(coreSource, 'firstPaneInWindow')
  const snapshotListBody = functionBody(snapshotSource, 'listAgentTeamPanesFromSnapshot')

  assertIncludes(targetBody, `return ${GO_BACKED_BINDING_PATH}`, `${TMUX_CORE} targetForPaneId`)
  assert.equal(targetBody.includes('runTmuxNoThrow(['), false, 'targetForPaneId facade must not retain TypeScript tmux fallback')
  assert.equal(targetBody.includes('display-message'), false, 'targetForPaneId facade must not call display-message directly')
  assert.equal(targetBody.includes('#{session_name}:#{window_id}'), false, 'targetForPaneId facade must not parse tmux target directly')

  assertIncludes(resolveBody, 'createAgentTeamKernelAdapter().inspectWorkerPane(paneId)', `${TMUX_CORE} resolvePaneBinding`)
  assert.equal(resolveBody.includes('display-message'), false, 'resolvePaneBinding must remain cut over to Go')
  assertIncludes(inspectBody, 'createAgentTeamKernelAdapter().inspectWorkerPane(paneId)', `${TMUX_CORE} inspectPane`)
  assert.equal(inspectBody.includes('display-message'), false, 'inspectPane must remain cut over to Go')
  assertIncludes(paneExistsBody, 'return Boolean(paneId && inspectPane(paneId).exists)', `${TMUX_CORE} paneExists`)
  assertIncludes(listBody, 'createAgentTeamKernelAdapter().listAgentTeamPanes()', `${TMUX_CORE} listAgentTeamPanes`)
  assert.match(snapshotListBody, /return snapshot\.panes\.filter\(item => item\.paneId && item\.label\)/, 'snapshot helper should keep existing labeled-pane filter')

  assertIncludes(resolveAsyncBody, 'createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)', 'resolvePaneBindingAsync later v0.6.61 cutover')
  assert.equal(resolveAsyncBody.includes('display-message'), false, 'resolvePaneBindingAsync display-message path is removed by later v0.6.61 slice')
  assert.equal(resolveAsyncBody.includes('runTmuxNoThrowAsync(['), false, 'resolvePaneBindingAsync direct tmux path is removed by later v0.6.61 slice')
  assert.equal(resolveAsyncBody.includes('signal'), true, 'resolvePaneBindingAsync must preserve AbortSignal parameter usage')
  assertIncludes(captureBody, 'if (!isInsideTmux()) return null', 'captureCurrentPaneBinding later v0.6.60 guard')
  assertIncludes(captureBody, 'createAgentTeamKernelAdapter().captureCurrentPaneBinding()', 'captureCurrentPaneBinding later v0.6.60 cutover')
  assert.equal(captureBody.includes('display-message'), false, 'captureCurrentPaneBinding display-message path is removed by later v0.6.60 slice')
  assertIncludes(windowExistsBody, 'createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)', 'windowExists later v0.6.62 cutover')
  assert.equal(windowExistsBody.includes('runTmuxNoThrowAsync(['), false, 'windowExists direct tmux path is removed by later v0.6.62 slice')
  assertIncludes(firstPaneBody, 'createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)', 'firstPaneInWindow later v0.6.62 cutover')
  assert.equal(firstPaneBody.includes('runTmuxNoThrowAsync(['), false, 'firstPaneInWindow direct tmux path is removed by later v0.6.62 slice')

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat\)/, 'Go should keep read-only list-panes inspect execution')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'later v0.6.60 permits only current-pane binding display-message')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, `${GO_SOURCE} must not add target-based display-message`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => command !== 'select-pane')) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} later v0.6.76 permits only narrow pane-title setPaneLabel select-pane`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} later v0.6.78 authorized pane label clearing`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} later v0.6.78 authorized pane title clearing`)
}

function assertFacadeRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const tmuxCore = env.helpers.requireDist('tmux/core.js')
  const original = kernel.createAgentTeamKernelAdapter
  try {
    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPane: paneId => ({ ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId: '%resolved', requestedPaneId: paneId, exists: true, target: 'session:@7', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
      listAgentTeamPanes: () => ({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
    })
    assert.equal(tmuxCore.targetForPaneId('%input'), 'session:@7')

    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPane: paneId => ({ ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId, requestedPaneId: paneId, exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
      listAgentTeamPanes: () => { throw new Error('targetForPaneId must not call listAgentTeamPanes') },
    })
    assert.equal(tmuxCore.targetForPaneId('%missing-target'), null)

    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPane: paneId => ({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId, requestedPaneId: paneId, exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'compact unavailable', error: 'compact unavailable', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
      listAgentTeamPanes: () => { throw new Error('targetForPaneId must not call listAgentTeamPanes') },
    })
    assert.equal(tmuxCore.targetForPaneId('%missing'), null)
    assert.equal(tmuxCore.targetForPaneId(''), null)
  } finally {
    kernel.createAgentTeamKernelAdapter = original
  }
}

function assertPackageAndNativeGuards(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  const manifest = JSON.parse(read(root, MANIFEST))
  const checksums = read(root, CHECKSUMS)
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
  assert.equal(checksums.includes(HELPER), true)
  assert.equal(checksums.includes(MANIFEST), true)
}

module.exports = {
  name: 'Go kernel v0.6.59 Go targetForPaneId facade cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeSource(root)
    assertFacadeRuntime(env)
    assertPackageAndNativeGuards(root)
  },
}
