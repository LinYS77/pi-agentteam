const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  CAPABILITY,
  FACADE_NAME,
  FAILURE_MAPPING,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_INSPECT_PANE_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_INSPECT_PANE_FACADE_CUTOVER_THEME,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  SUCCESS_MAPPING,
  goInspectPaneFacadeCutover,
} = require('../fixtures/kernel/v0656/goInspectPaneFacadeCutover.cjs')

const DOC = 'docs/perf/v0.6.56-go-inspect-pane-facade-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0656/goInspectPaneFacadeCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0656-go-inspect-pane-facade-cutover.cjs'
const TMUX_CORE = 'tmux/core.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const HELPER = `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`
const MANIFEST = `${NATIVE_ROOT}/manifest.json`
const CHECKSUMS = `${NATIVE_ROOT}/SHA256SUMS`
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.56 Go inspectPane Facade Cutover',
  'Result: v0.6.56 cuts over the TypeScript `inspectPane(paneId)` facade/default path to the existing Go `workerLifecycle.inspectPane` adapter.',
  '`tmux/core.ts` `inspectPane(paneId)` now delegates to `createAgentTeamKernelAdapter().inspectWorkerPane(paneId)`.',
  'The TypeScript `runTmuxNoThrow([\'display-message\', \'-p\', \'-t\', paneId, ...])` fallback for this facade is removed.',
  '`inspectPane(paneId)` preserves the existing `PaneInspection` facade shape.',
  'Successful adapter results map to `{ paneId, exists:true, currentCommand, inMode, mode, copyMode }`.',
  'Failed adapter results map to `{ paneId, exists:false, error }`.',
  'Kernel-level diagnostics remain compact on the adapter result and do not leak raw stdout, stderr, cwd, stack traces, state archives, mailbox bodies, report bodies, or worker transcripts.',
  '`targetForPaneId()`, `captureCurrentPaneBinding()`, `paneExists()`, and `resolvePaneBinding()` remain TypeScript `display-message` paths.',
  '`listAgentTeamPanes()` remains delegated to `createAgentTeamKernelAdapter().listAgentTeamPanes()`.',
  'No Go source or native helper rebuild is required for this facade-only cutover.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0656/goInspectPaneFacadeCutover.cjs`',
  '`tests/suites/go-kernel-v0656-go-inspect-pane-facade-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.56 Go inspectPane facade cutover',
  'docs/perf/v0.6.56-go-inspect-pane-facade-cutover.md',
  'tmux/core.ts inspectPane(paneId) delegates to createAgentTeamKernelAdapter().inspectWorkerPane(paneId)',
  'the TypeScript display-message fallback for inspectPane is removed',
  'targetForPaneId and captureCurrentPaneBinding remain TypeScript display-message-owned',
  '**v0.6.56 Go inspectPane facade cutover**',
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
  assert.deepEqual(JSON.parse(JSON.stringify(goInspectPaneFacadeCutover)), goInspectPaneFacadeCutover)
  assert.equal(goInspectPaneFacadeCutover.schemaVersion, GO_INSPECT_PANE_FACADE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goInspectPaneFacadeCutover.theme, GO_INSPECT_PANE_FACADE_CUTOVER_THEME)
  assert.equal(goInspectPaneFacadeCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goInspectPaneFacadeCutover.helperVersion, HELPER_VERSION)
  assert.equal(goInspectPaneFacadeCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goInspectPaneFacadeCutover.capability, CAPABILITY)
  assert.equal(goInspectPaneFacadeCutover.facadeName, FACADE_NAME)
  assert.equal(goInspectPaneFacadeCutover.kernelAdapterDelegation, KERNEL_ADAPTER_DELEGATION)
  assert.deepEqual(goInspectPaneFacadeCutover.successMapping, [...SUCCESS_MAPPING])
  assert.deepEqual(goInspectPaneFacadeCutover.failureMapping, [...FAILURE_MAPPING])
  assert.deepEqual(goInspectPaneFacadeCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goInspectPaneFacadeCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goInspectPaneFacadeCutover.facadeCutoverMigrated, true)
  assert.equal(goInspectPaneFacadeCutover.typescriptDisplayMessageFallbackRemoved, true)
  assert.equal(goInspectPaneFacadeCutover.failClosedExistsFalseOnHelperFailure, true)
  assert.equal(goInspectPaneFacadeCutover.compactInspectionFieldsOnly, true)
  assert.equal(goInspectPaneFacadeCutover.listAgentTeamPanesFacadeStillMigrated, true)
  assert.equal(goInspectPaneFacadeCutover.targetForPaneIdMigrated, false)
  assert.equal(goInspectPaneFacadeCutover.captureCurrentPaneBindingMigrated, false)
  assert.equal(goInspectPaneFacadeCutover.windowHelpersMigrated, false)
  assert.equal(goInspectPaneFacadeCutover.createTeammatePaneMigrated, false)
  assert.equal(goInspectPaneFacadeCutover.wakePaneMigrated, false)
  assert.equal(goInspectPaneFacadeCutover.syncPaneLabelsMigrated, false)
  assert.equal(goInspectPaneFacadeCutover.killPaneMigrated, false)
  assert.equal(goInspectPaneFacadeCutover.stateRepositoryMigrated, false)
  assert.equal(goInspectPaneFacadeCutover.taskReportPlanRunMigrated, false)
  assert.equal(goInspectPaneFacadeCutover.teamPanelViewModelMigrated, false)
  assert.equal(goInspectPaneFacadeCutover.releasePackageVerificationMigrated, false)
  assert.equal(goInspectPaneFacadeCutover.nativeArtifactRenamed, false)
  assert.equal(goInspectPaneFacadeCutover.nativeHelperRebuilt, false)
  assert.deepEqual(goInspectPaneFacadeCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goInspectPaneFacadeCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goInspectPaneFacadeCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const inspectBody = functionBody(coreSource, 'inspectPane')
  const listBody = functionBody(coreSource, 'listAgentTeamPanes')
  const targetBody = functionBody(coreSource, 'targetForPaneId')
  const captureBody = functionBody(coreSource, 'captureCurrentPaneBinding')
  const paneExistsBody = functionBody(coreSource, 'paneExists')
  const resolveBody = functionBody(coreSource, 'resolvePaneBinding')
  const windowExistsBody = functionBody(coreSource, 'windowExists')
  const firstPaneBody = functionBody(coreSource, 'firstPaneInWindow')

  assertIncludes(coreSource, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", TMUX_CORE)
  assertIncludes(inspectBody, 'const result = createAgentTeamKernelAdapter().inspectWorkerPane(paneId)', `${TMUX_CORE} inspectPane`)
  assertIncludes(inspectBody, 'if (!result.ok)', `${TMUX_CORE} inspectPane`)
  assertIncludes(inspectBody, 'exists: false', `${TMUX_CORE} inspectPane failure mapping`)
  assertIncludes(inspectBody, 'error: result.error || result.reason', `${TMUX_CORE} inspectPane failure mapping`)
  assertIncludes(inspectBody, 'exists: true', `${TMUX_CORE} inspectPane success mapping`)
  assertIncludes(inspectBody, 'currentCommand: result.currentCommand', `${TMUX_CORE} inspectPane success mapping`)
  assertIncludes(inspectBody, 'inMode: result.inMode', `${TMUX_CORE} inspectPane success mapping`)
  assertIncludes(inspectBody, 'mode: result.mode', `${TMUX_CORE} inspectPane success mapping`)
  assertIncludes(inspectBody, 'copyMode: result.copyMode', `${TMUX_CORE} inspectPane success mapping`)
  assert.equal(inspectBody.includes('runTmuxNoThrow(['), false, 'inspectPane facade must not retain TypeScript tmux fallback')
  assert.equal(inspectBody.includes('display-message'), false, 'inspectPane facade must not call display-message directly')
  assert.equal(inspectBody.includes('#{pane_current_command}'), false, 'inspectPane facade must not parse tmux stdout')
  assertIncludes(listBody, 'const result = createAgentTeamKernelAdapter().listAgentTeamPanes()', `${TMUX_CORE} listAgentTeamPanes`)
  assertIncludes(listBody, 'return result.ok ? result.panes : []', `${TMUX_CORE} listAgentTeamPanes`)
  assert.equal(listBody.includes('runTmuxNoThrow(['), false, 'listAgentTeamPanes facade must remain cut over to Go')
  assert.equal(targetBody.includes('display-message'), true, 'targetForPaneId must remain TypeScript display-message path')
  assert.equal(captureBody.includes('display-message'), true, 'captureCurrentPaneBinding must remain TypeScript display-message path')
  assert.equal(paneExistsBody.includes('display-message'), true, 'paneExists must remain TypeScript display-message path')
  assert.equal(resolveBody.includes('display-message'), true, 'resolvePaneBinding must remain TypeScript display-message path')
  assert.equal(windowExistsBody.includes('list-panes'), true, 'windowExists must remain TypeScript window helper path')
  assert.equal(firstPaneBody.includes('list-panes'), true, 'firstPaneInWindow must remain TypeScript window helper path')
  assertIncludes(kernelSource, "callHelper<unknown>('workerLifecycle', { operation: 'inspectPane'", KERNEL)
  assertIncludes(kernelSource, 'validateWorkerPaneInspectionResult', KERNEL)
  assert.match(goSource, /case "inspectPane"/, 'Go worker lifecycle inspect operation should remain implemented')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat\)/, 'Go should own read-only list-panes inspect execution')
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
}

function assertFacadeRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const tmuxCore = env.helpers.requireDist('tmux/core.js')
  const original = kernel.createAgentTeamKernelAdapter
  try {
    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPane: paneId => ({
        ok: true,
        operation: 'inspectPane',
        capability: 'workerLifecycle',
        paneId: '%resolved',
        requestedPaneId: paneId,
        exists: true,
        currentCommand: 'pi',
        inMode: true,
        mode: 'copy-mode',
        copyMode: true,
        readOnly: true,
        stateFilesRead: false,
        stateFilesWritten: false,
        tmuxMutation: false,
      }),
      listAgentTeamPanes: () => ({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
    })
    assert.deepEqual(tmuxCore.inspectPane('%input'), {
      paneId: '%resolved',
      exists: true,
      currentCommand: 'pi',
      inMode: true,
      mode: 'copy-mode',
      copyMode: true,
    })
    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPane: paneId => ({
        ok: false,
        operation: 'inspectPane',
        capability: 'workerLifecycle',
        paneId,
        requestedPaneId: paneId,
        exists: false,
        status: 'unknown',
        resultMarker: 'stale',
        failureKind: 'missing-helper',
        reason: 'compact unavailable',
        error: 'compact unavailable',
        readOnly: true,
        stateFilesRead: false,
        stateFilesWritten: false,
        tmuxMutation: false,
      }),
      listAgentTeamPanes: () => ({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
    })
    assert.deepEqual(tmuxCore.inspectPane('%missing'), {
      paneId: '%missing',
      exists: false,
      error: 'compact unavailable',
    })
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
  name: 'Go kernel v0.6.56 Go inspectPane facade cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeSource(root)
    assertFacadeRuntime(env)
    assertPackageAndNativeGuards(root)
  },
}
