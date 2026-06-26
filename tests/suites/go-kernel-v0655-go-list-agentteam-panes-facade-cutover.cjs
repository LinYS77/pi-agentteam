const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  CAPABILITY,
  FACADE_NAME,
  FAILURE_RETURN,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_LIST_AGENTTEAM_PANES_FACADE_CUTOVER_SCHEMA_VERSION,
  GO_LIST_AGENTTEAM_PANES_FACADE_CUTOVER_THEME,
  HELPER_VERSION,
  KERNEL_ADAPTER_DELEGATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  SNAPSHOT_FILTER,
  goListAgentTeamPanesFacadeCutover,
} = require('../fixtures/kernel/v0655/goListAgentTeamPanesFacadeCutover.cjs')

const DOC = 'docs/perf/v0.6.55-go-list-agentteam-panes-facade-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0655/goListAgentTeamPanesFacadeCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0655-go-list-agentteam-panes-facade-cutover.cjs'
const TMUX_CORE = 'tmux/core.ts'
const TMUX_SNAPSHOT = 'tmux/snapshot.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const HELPER = `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`
const MANIFEST = `${NATIVE_ROOT}/manifest.json`
const CHECKSUMS = `${NATIVE_ROOT}/SHA256SUMS`
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.55 Go listAgentTeamPanes Facade Cutover',
  'Result: v0.6.55 cuts over the TypeScript `listAgentTeamPanes()` facade/default path to the existing Go `workerLifecycle.listAgentTeamPanes` adapter.',
  '`tmux/core.ts` `listAgentTeamPanes()` now delegates to `createAgentTeamKernelAdapter().listAgentTeamPanes()`.',
  'The TypeScript `runTmuxNoThrow([\'list-panes\', \'-a\', \'-F\', ...])` fallback for this facade is removed.',
  '`listAgentTeamPanes()` returns `result.ok ? result.panes : []`.',
  'When the Go helper is missing, unavailable, incompatible, or returns a failed worker lifecycle result, the public facade returns `[]`.',
  'Kernel-level diagnostics remain compact on the adapter result and do not leak raw stdout, stderr, cwd, stack traces, state archives, mailbox bodies, report bodies, or worker transcripts.',
  '`listAgentTeamPanesFromSnapshot()` remains unchanged and still filters snapshot panes by `item.paneId && item.label`.',
  'No `inspectPane`, `wakePane`, `syncPaneLabels`, `createTeammatePane`, `killPane`, `clearPaneLabel`, `targetForPaneId`, `captureCurrentPaneBinding`, or `display-message` path is migrated in this slice.',
  'No Go source or native helper rebuild is required for this facade-only cutover.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0655/goListAgentTeamPanesFacadeCutover.cjs`',
  '`tests/suites/go-kernel-v0655-go-list-agentteam-panes-facade-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.55 Go listAgentTeamPanes facade cutover',
  'docs/perf/v0.6.55-go-list-agentteam-panes-facade-cutover.md',
  'tmux/core.ts listAgentTeamPanes() delegates to createAgentTeamKernelAdapter().listAgentTeamPanes()',
  'the TypeScript tmux list-panes fallback for listAgentTeamPanes is removed',
  'inspectPane and mutating lifecycle remain TypeScript-owned',
  '**v0.6.55 Go listAgentTeamPanes facade cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'inspectPaneFacadeMigrated: true',
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
  const start = source.indexOf(`export function ${name}(`)
  assert.notEqual(start, -1, `${name} should exist`)
  const brace = source.indexOf('{', start)
  assert.notEqual(brace, -1, `${name} should have a body`)
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
  assert.deepEqual(JSON.parse(JSON.stringify(goListAgentTeamPanesFacadeCutover)), goListAgentTeamPanesFacadeCutover)
  assert.equal(goListAgentTeamPanesFacadeCutover.schemaVersion, GO_LIST_AGENTTEAM_PANES_FACADE_CUTOVER_SCHEMA_VERSION)
  assert.equal(goListAgentTeamPanesFacadeCutover.theme, GO_LIST_AGENTTEAM_PANES_FACADE_CUTOVER_THEME)
  assert.equal(goListAgentTeamPanesFacadeCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goListAgentTeamPanesFacadeCutover.helperVersion, HELPER_VERSION)
  assert.equal(goListAgentTeamPanesFacadeCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goListAgentTeamPanesFacadeCutover.capability, CAPABILITY)
  assert.equal(goListAgentTeamPanesFacadeCutover.facadeName, FACADE_NAME)
  assert.equal(goListAgentTeamPanesFacadeCutover.kernelAdapterDelegation, KERNEL_ADAPTER_DELEGATION)
  assert.equal(goListAgentTeamPanesFacadeCutover.failureReturn, FAILURE_RETURN)
  assert.equal(goListAgentTeamPanesFacadeCutover.snapshotFilter, SNAPSHOT_FILTER)
  assert.deepEqual(goListAgentTeamPanesFacadeCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goListAgentTeamPanesFacadeCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goListAgentTeamPanesFacadeCutover.facadeCutoverMigrated, true)
  assert.equal(goListAgentTeamPanesFacadeCutover.typescriptTmuxListPanesFallbackRemoved, true)
  assert.equal(goListAgentTeamPanesFacadeCutover.failClosedEmptyArrayOnHelperFailure, true)
  assert.equal(goListAgentTeamPanesFacadeCutover.compactPaneFieldsOnly, true)
  assert.equal(goListAgentTeamPanesFacadeCutover.listAgentTeamPanesFromSnapshotUnchanged, true)
  assert.equal(goListAgentTeamPanesFacadeCutover.inspectPaneFacadeMigrated, false)
  assert.equal(goListAgentTeamPanesFacadeCutover.createTeammatePaneMigrated, false)
  assert.equal(goListAgentTeamPanesFacadeCutover.wakePaneMigrated, false)
  assert.equal(goListAgentTeamPanesFacadeCutover.syncPaneLabelsMigrated, false)
  assert.equal(goListAgentTeamPanesFacadeCutover.killPaneMigrated, false)
  assert.equal(goListAgentTeamPanesFacadeCutover.stateRepositoryMigrated, false)
  assert.equal(goListAgentTeamPanesFacadeCutover.taskReportPlanRunMigrated, false)
  assert.equal(goListAgentTeamPanesFacadeCutover.teamPanelViewModelMigrated, false)
  assert.equal(goListAgentTeamPanesFacadeCutover.releasePackageVerificationMigrated, false)
  assert.equal(goListAgentTeamPanesFacadeCutover.nativeArtifactRenamed, false)
  assert.equal(goListAgentTeamPanesFacadeCutover.nativeHelperRebuilt, false)
  assert.deepEqual(goListAgentTeamPanesFacadeCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goListAgentTeamPanesFacadeCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goListAgentTeamPanesFacadeCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
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
  const listBody = functionBody(coreSource, 'listAgentTeamPanes')
  const inspectBody = functionBody(coreSource, 'inspectPane')
  const snapshotListBody = functionBody(snapshotSource, 'listAgentTeamPanesFromSnapshot')

  assertIncludes(coreSource, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", TMUX_CORE)
  assertIncludes(listBody, 'const result = createAgentTeamKernelAdapter().listAgentTeamPanes()', `${TMUX_CORE} listAgentTeamPanes`)
  assertIncludes(listBody, 'return result.ok ? result.panes : []', `${TMUX_CORE} listAgentTeamPanes`)
  assert.equal(listBody.includes('runTmuxNoThrow(['), false, 'listAgentTeamPanes facade must not retain TypeScript tmux fallback')
  assert.equal(listBody.includes("'list-panes'"), false, 'listAgentTeamPanes facade must not call tmux list-panes directly')
  assert.equal(listBody.includes('#{@agentteam-name}'), false, 'listAgentTeamPanes facade must not parse tmux labels in TypeScript')
  assert.match(snapshotListBody, /return snapshot\.panes\.filter\(item => item\.paneId && item\.label\)/, 'snapshot helper should keep existing labeled-pane filter')
  assert.equal(snapshotListBody.includes('createAgentTeamKernelAdapter().listAgentTeamPanes()'), false, 'snapshot helper must remain snapshot-local')
  assert.equal(inspectBody.includes('runTmuxNoThrow(['), true, 'inspectPane facade remains TypeScript-owned in this slice')
  assert.equal(inspectBody.includes('display-message'), true, 'inspectPane display-message path remains TypeScript-owned in this slice')
  assertIncludes(kernelSource, "callHelper<unknown>('workerLifecycle', { operation: 'listAgentTeamPanes' })", KERNEL)
  assertIncludes(kernelSource, 'validateWorkerPaneListResult', KERNEL)
  assert.match(goSource, /case "listAgentTeamPanes"/, 'Go worker lifecycle list operation should remain implemented')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat\)/, 'Go should own list-panes execution for listAgentTeamPanes')
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
}

function assertFacadeRuntime(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const tmuxCore = env.helpers.requireDist('tmux/core.js')
  const original = kernel.createAgentTeamKernelAdapter
  const panes = [
    { paneId: '%1', target: 'session:@1', label: 'leader', currentCommand: 'pi' },
    { paneId: '%2', target: 'session:@2', label: 'worker-a', currentCommand: 'node' },
  ]
  try {
    kernel.createAgentTeamKernelAdapter = () => ({
      listAgentTeamPanes: () => ({
        ok: true,
        operation: 'listAgentTeamPanes',
        capability: 'workerLifecycle',
        panes,
        byPaneId: { '%1': panes[0], '%2': panes[1] },
        readOnly: true,
        stateFilesRead: false,
        stateFilesWritten: false,
        tmuxMutation: false,
      }),
    })
    assert.deepEqual(tmuxCore.listAgentTeamPanes(), panes)
    kernel.createAgentTeamKernelAdapter = () => ({
      listAgentTeamPanes: () => ({
        ok: false,
        operation: 'listAgentTeamPanes',
        capability: 'workerLifecycle',
        panes: [],
        byPaneId: {},
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
    })
    assert.deepEqual(tmuxCore.listAgentTeamPanes(), [])
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
  name: 'Go kernel v0.6.55 Go listAgentTeamPanes facade cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeSource(root)
    assertFacadeRuntime(env)
    assertPackageAndNativeGuards(root)
  },
}
