const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_BACKED_INSPECT_PATH,
  GO_PANE_EXISTS_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_PANE_EXISTS_FACADE_CUTOVER_THEME,
  HELPER_VERSION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  goPaneExistsFacadeCutover,
} = require('../fixtures/kernel/v0657/goPaneExistsFacadeCutover.cjs')

const DOC = 'docs/perf/v0.6.57-go-pane-exists-facade-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0657/goPaneExistsFacadeCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0657-go-pane-exists-facade-cutover.cjs'
const TMUX_CORE = 'tmux/core.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const HELPER = `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`
const MANIFEST = `${NATIVE_ROOT}/manifest.json`
const CHECKSUMS = `${NATIVE_ROOT}/SHA256SUMS`
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.57 Go paneExists Facade Cutover',
  'Result: v0.6.57 cuts over the TypeScript `paneExists(paneId)` facade/default path to the already Go-backed `inspectPane(paneId)` facade.',
  '`tmux/core.ts` `paneExists(paneId)` now returns `Boolean(paneId && inspectPane(paneId).exists)`.',
  'The TypeScript `runTmuxNoThrow([\'display-message\', \'-p\', \'-t\', paneId, \'#{pane_id}\'])` fallback for this facade is removed.',
  '`paneExists(paneId)` preserves the existing boolean public API.',
  'Helper failure, invalid pane id, and pane-not-found all fail closed to `false`.',
  'Kernel-level diagnostics remain compact on the inspect adapter result; the public facade returns only `true` or `false`.',
  '`targetForPaneId()`, `captureCurrentPaneBinding()`, `resolvePaneBinding()`, and `resolvePaneBindingAsync()` remain TypeScript `display-message` paths.',
  '`windowExists()` and `firstPaneInWindow()` remain TypeScript window helper paths.',
  '`inspectPane()` and `listAgentTeamPanes()` remain delegated through their Go-backed facade seams.',
  'No Go source or native helper rebuild is required for this facade-only cutover.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0657/goPaneExistsFacadeCutover.cjs`',
  '`tests/suites/go-kernel-v0657-go-pane-exists-facade-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.57 Go paneExists facade cutover',
  'docs/perf/v0.6.57-go-pane-exists-facade-cutover.md',
  'tmux/core.ts paneExists(paneId) delegates to the Go-backed inspectPane(paneId) facade',
  'the TypeScript display-message fallback for paneExists is removed',
  'resolvePaneBinding and window helpers remain TypeScript-owned',
  '**v0.6.57 Go paneExists facade cutover**',
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
  'resolvePaneBindingMigrated: true',
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

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goPaneExistsFacadeCutover)), goPaneExistsFacadeCutover)
  assert.equal(goPaneExistsFacadeCutover.schemaVersion, GO_PANE_EXISTS_FACADE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goPaneExistsFacadeCutover.theme, GO_PANE_EXISTS_FACADE_CUTOVER_THEME)
  assert.equal(goPaneExistsFacadeCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goPaneExistsFacadeCutover.helperVersion, HELPER_VERSION)
  assert.equal(goPaneExistsFacadeCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goPaneExistsFacadeCutover.capability, CAPABILITY)
  assert.equal(goPaneExistsFacadeCutover.facadeName, FACADE_NAME)
  assert.equal(goPaneExistsFacadeCutover.goBackedInspectPath, GO_BACKED_INSPECT_PATH)
  assert.deepEqual(goPaneExistsFacadeCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goPaneExistsFacadeCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goPaneExistsFacadeCutover.facadeCutoverMigrated, true)
  assert.equal(goPaneExistsFacadeCutover.typescriptDisplayMessageFallbackRemoved, true)
  assert.equal(goPaneExistsFacadeCutover.failClosedFalseOnHelperFailure, true)
  assert.equal(goPaneExistsFacadeCutover.publicFacadeReturnsBooleanOnly, true)
  assert.equal(goPaneExistsFacadeCutover.inspectPaneFacadeStillMigrated, true)
  assert.equal(goPaneExistsFacadeCutover.listAgentTeamPanesFacadeStillMigrated, true)
  assert.equal(goPaneExistsFacadeCutover.targetForPaneIdMigrated, false)
  assert.equal(goPaneExistsFacadeCutover.captureCurrentPaneBindingMigrated, false)
  assert.equal(goPaneExistsFacadeCutover.resolvePaneBindingMigrated, false)
  assert.equal(goPaneExistsFacadeCutover.resolvePaneBindingAsyncMigrated, false)
  assert.equal(goPaneExistsFacadeCutover.windowHelpersMigrated, false)
  assert.equal(goPaneExistsFacadeCutover.createTeammatePaneMigrated, false)
  assert.equal(goPaneExistsFacadeCutover.wakePaneMigrated, false)
  assert.equal(goPaneExistsFacadeCutover.syncPaneLabelsMigrated, false)
  assert.equal(goPaneExistsFacadeCutover.killPaneMigrated, false)
  assert.equal(goPaneExistsFacadeCutover.stateRepositoryMigrated, false)
  assert.equal(goPaneExistsFacadeCutover.taskReportPlanRunMigrated, false)
  assert.equal(goPaneExistsFacadeCutover.teamPanelViewModelMigrated, false)
  assert.equal(goPaneExistsFacadeCutover.releasePackageVerificationMigrated, false)
  assert.equal(goPaneExistsFacadeCutover.nativeArtifactRenamed, false)
  assert.equal(goPaneExistsFacadeCutover.nativeHelperRebuilt, false)
  assert.deepEqual(goPaneExistsFacadeCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goPaneExistsFacadeCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goPaneExistsFacadeCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const goSource = read(root, GO_SOURCE)
  const inspectBody = functionBody(coreSource, 'inspectPane')
  const paneExistsBody = functionBody(coreSource, 'paneExists')
  const listBody = functionBody(coreSource, 'listAgentTeamPanes')
  const targetBody = functionBody(coreSource, 'targetForPaneId')
  const captureBody = functionBody(coreSource, 'captureCurrentPaneBinding')
  const resolveBody = functionBody(coreSource, 'resolvePaneBinding')
  const resolveAsyncBody = functionBody(coreSource, 'resolvePaneBindingAsync')
  const windowExistsBody = functionBody(coreSource, 'windowExists')
  const firstPaneBody = functionBody(coreSource, 'firstPaneInWindow')

  assertIncludes(paneExistsBody, 'return Boolean(paneId && inspectPane(paneId).exists)', `${TMUX_CORE} paneExists`)
  assert.equal(paneExistsBody.includes('runTmuxNoThrow(['), false, 'paneExists facade must not retain TypeScript tmux fallback')
  assert.equal(paneExistsBody.includes('display-message'), false, 'paneExists facade must not call display-message directly')
  assert.equal(paneExistsBody.includes('#{pane_id}'), false, 'paneExists facade must not parse tmux pane_id directly')
  assertIncludes(inspectBody, 'const result = createAgentTeamKernelAdapter().inspectWorkerPane(paneId)', `${TMUX_CORE} inspectPane`)
  assert.equal(inspectBody.includes('display-message'), false, 'inspectPane must remain cut over to Go')
  assertIncludes(listBody, 'const result = createAgentTeamKernelAdapter().listAgentTeamPanes()', `${TMUX_CORE} listAgentTeamPanes`)
  assert.equal(listBody.includes('runTmuxNoThrow(['), false, 'listAgentTeamPanes must remain cut over to Go')
  assert.equal(targetBody.includes('display-message'), true, 'targetForPaneId must remain TypeScript display-message path')
  assert.equal(captureBody.includes('display-message'), true, 'captureCurrentPaneBinding must remain TypeScript display-message path')
  assert.equal(resolveBody.includes('display-message'), true, 'resolvePaneBinding must remain TypeScript display-message path')
  assert.equal(resolveAsyncBody.includes('display-message'), true, 'resolvePaneBindingAsync must remain TypeScript display-message path')
  assert.equal(windowExistsBody.includes('list-panes'), true, 'windowExists must remain TypeScript window helper path')
  assert.equal(firstPaneBody.includes('list-panes'), true, 'firstPaneInWindow must remain TypeScript window helper path')
  assert.match(goSource, /case "inspectPane"/, 'Go worker lifecycle inspect operation should remain implemented')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat\)/, 'Go should keep read-only list-panes inspect execution')
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
}

function assertFacadeRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const tmuxCore = env.helpers.requireDist('tmux/core.js')
  const original = kernel.createAgentTeamKernelAdapter
  try {
    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPane: paneId => ({ ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId, requestedPaneId: paneId, exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
    })
    assert.equal(tmuxCore.paneExists('%present'), true)
    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPane: paneId => ({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId, requestedPaneId: paneId, exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'compact unavailable', error: 'compact unavailable', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
    })
    assert.equal(tmuxCore.paneExists('%missing'), false)
    assert.equal(tmuxCore.paneExists(''), false)
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
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(checksums.includes(HELPER), true)
  assert.equal(checksums.includes(MANIFEST), true)
}

module.exports = {
  name: 'Go kernel v0.6.57 Go paneExists facade cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeSource(root)
    assertFacadeRuntime(env)
    assertPackageAndNativeGuards(root)
  },
}
