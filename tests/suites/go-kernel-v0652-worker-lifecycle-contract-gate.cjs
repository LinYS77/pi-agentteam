const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_RUNTIME_CAPABILITIES,
  CONTRACT_STATUS,
  FACADE_AUTHORITY,
  FUTURE_CAPABILITY,
  FUTURE_JSONRPC_METHOD,
  FUTURE_JSONRPC_REQUEST_SHAPE,
  FUTURE_WORKER_LIFECYCLE_OPERATIONS,
  HELPER_CONNECTION_MODEL,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  RELEASE_PACKAGE_GUARDS,
  WORKER_LIFECYCLE_CONTRACT_GATE_SCHEMA_VERSION,
  WORKER_LIFECYCLE_CONTRACT_GATE_THEME,
  workerLifecycleContractGate,
} = require('../fixtures/kernel/v0652/workerLifecycleContractGate.cjs')

const DOC = 'docs/perf/v0.6.52-worker-lifecycle-contract-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const CONTRACT = 'core/kernelContract.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const MANIFEST = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json'
const FIXTURE = 'tests/fixtures/kernel/v0652/workerLifecycleContractGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0652-worker-lifecycle-contract-gate.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const ALLOWED_GO_TMUX_COMMAND = 'exec.CommandContext(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat)'
const BROAD_GO_LIFECYCLE_COMMANDS = [
  'send-keys',
  'split-window',
  'new-window',
  'kill-pane',
  'display-message',
  'set-option',
  'set-window-option',
  'select-pane',
  'respawn-pane',
]
const CURRENT_RUNTIME_CAPABILITIES = [...ACTIVE_RUNTIME_CAPABILITIES, FUTURE_CAPABILITY]
const REQUIRED_DOC = [
  '# v0.6.52 Worker Lifecycle Contract Gate',
  'Result: v0.6.52 defines the future Go worker lifecycle JSON-RPC boundary and helper connection model as a non-runtime gate.',
  'Runtime behavior stays unchanged from v0.6.51.',
  '`workerLifecycle` is `design-only-not-runtime-capability`.',
  'It is not added to active helper capabilities in this slice.',
  'Future JSON-RPC method: `workerLifecycle`.',
  '`inspectPane` and `listAgentTeamPanes` are read-only-first operations.',
  '`wakePane` and `syncPaneLabels` are later mutating operations.',
  '`createTeammatePane` is later-high-risk.',
  '`killPane` is last-highest-risk.',
  'Worker lifecycle Go authority can only be invoked by TypeScript governance/facade through an explicit adapter seam.',
  'The initial helper connection model remains per-call helper invocation.',
  'Long-lived or pooled helper mode is deferred until state/panel/high-frequency paths need it.',
  'bounded request queue and backpressure policy',
  'timeout and cancellation propagation per request',
  'crash detection and restart budget',
  'No Go handler for `workerLifecycle` is added in this slice.',
  'No worker-spawns-worker.',
  'No hidden scheduler/autopilot/background orchestration.',
  'No peer report auto-task creation.',
  'No state repository, task/report/PlanRun, team panel view-model, release/package verification, or native artifact rename migration.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0652/workerLifecycleContractGate.cjs`',
  '`tests/suites/go-kernel-v0652-worker-lifecycle-contract-gate.cjs`',
  'node tests/run.cjs go-kernel-v0652-worker-lifecycle-contract-gate',
]
const REQUIRED_ROADMAP = [
  'v0.6.52 worker lifecycle contract gate',
  'docs/perf/v0.6.52-worker-lifecycle-contract-gate.md',
  'workerLifecycle` remains `design-only-not-runtime-capability`',
  'per-call helper remains acceptable initially',
  'long-lived helper is deferred until state/panel/high-frequency paths',
  'read-only first (`inspectPane`, `listAgentTeamPanes`), mutating later (`wakePane`, `syncPaneLabels`, `createTeammatePane`), `killPane` last/highest-risk',
  'no worker lifecycle runtime migration、no Go handler、no package/release/native rename action',
  '**v0.6.52 worker lifecycle contract gate**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'workerLifecycleMigrated: true',
  'stateRepositoryMigrated: true',
  'taskReportPlanRunMigrated: true',
  'teamPanelViewModelMigrated: true',
  'releasePackageVerificationMigrated: true',
  'stateRepositoryMigrated: true',
  'goHandlerActive: true for mutating operations',
  'nativeArtifactRenamed: true',
  'packageReleaseApproved: true',
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

function parseGoCapabilities(source) {
  const body = source.match(/var\s+capabilities\s*=\s*\[\]string\{([^}]+)\}/s)?.[1] || ''
  return [...body.matchAll(/"([^"]+)"/g)].map(match => match[1])
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(workerLifecycleContractGate)), workerLifecycleContractGate, 'fixture should be deterministic plain data')
  assert.equal(workerLifecycleContractGate.schemaVersion, WORKER_LIFECYCLE_CONTRACT_GATE_SCHEMA_VERSION)
  assert.equal(workerLifecycleContractGate.theme, WORKER_LIFECYCLE_CONTRACT_GATE_THEME)
  assert.equal(workerLifecycleContractGate.packageVersion, PACKAGE_VERSION)
  assert.deepEqual(workerLifecycleContractGate.activeRuntimeCapabilities, [...ACTIVE_RUNTIME_CAPABILITIES])
  assert.equal(workerLifecycleContractGate.futureCapability, FUTURE_CAPABILITY)
  assert.equal(workerLifecycleContractGate.futureJsonRpcMethod, FUTURE_JSONRPC_METHOD)
  assert.equal(workerLifecycleContractGate.contractStatus, CONTRACT_STATUS)
  assert.equal(workerLifecycleContractGate.runtimeCapabilityActive, false)
  assert.equal(workerLifecycleContractGate.goHandlerActive, false)
  assert.equal(workerLifecycleContractGate.runtimeBehaviorChangedFromV0651, false)
  assert.equal(workerLifecycleContractGate.workerLifecycleMigrated, false)
  assert.equal(workerLifecycleContractGate.stateRepositoryMigrated, false)
  assert.equal(workerLifecycleContractGate.taskReportPlanRunMigrated, false)
  assert.equal(workerLifecycleContractGate.teamPanelViewModelMigrated, false)
  assert.equal(workerLifecycleContractGate.releasePackageVerificationMigrated, false)
  assert.equal(workerLifecycleContractGate.nativeArtifactRenamed, false)
  assert.equal(workerLifecycleContractGate.packageVersionChanged, false)
  assert.equal(workerLifecycleContractGate.packageReleaseApproved, false)
  assert.deepEqual(workerLifecycleContractGate.futureWorkerLifecycleOperations, JSON.parse(JSON.stringify(FUTURE_WORKER_LIFECYCLE_OPERATIONS)))
  assert.deepEqual(workerLifecycleContractGate.futureJsonRpcRequestShape, JSON.parse(JSON.stringify(FUTURE_JSONRPC_REQUEST_SHAPE)))
  assert.deepEqual(workerLifecycleContractGate.helperConnectionModel, JSON.parse(JSON.stringify(HELPER_CONNECTION_MODEL)))
  assert.deepEqual(workerLifecycleContractGate.facadeAuthority, [...FACADE_AUTHORITY])
  assert.deepEqual(workerLifecycleContractGate.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(workerLifecycleContractGate.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])

  const operations = workerLifecycleContractGate.futureWorkerLifecycleOperations.map(item => item.operation)
  assert.deepEqual(operations, ['inspectPane', 'listAgentTeamPanes', 'wakePane', 'syncPaneLabels', 'createTeammatePane', 'killPane'])
  assert.equal(workerLifecycleContractGate.futureWorkerLifecycleOperations[0].mutatesTmux, false)
  assert.equal(workerLifecycleContractGate.futureWorkerLifecycleOperations[1].mutatesTmux, false)
  assert.equal(workerLifecycleContractGate.futureWorkerLifecycleOperations.at(-1).operation, 'killPane')
  assert.equal(workerLifecycleContractGate.futureWorkerLifecycleOperations.at(-1).phase, 'last-highest-risk')
}

function assertContractModule(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const contract = env.helpers.requireDist('core/kernelContract.js')
  assert.deepEqual(contract.AGENTTEAM_KERNEL_CAPABILITIES, CURRENT_RUNTIME_CAPABILITIES)
  assert.equal(contract.AGENTTEAM_KERNEL_CAPABILITIES.includes(FUTURE_CAPABILITY), true, 'v0.6.54 keeps workerLifecycle active for read-only inspect/list operations')
  assert.equal(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CAPABILITY, FUTURE_CAPABILITY)
  assert.equal(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT_STATUS, 'runtime-read-only-inspect-and-list-agentteam-panes')
  assert.equal(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_JSONRPC_METHOD, FUTURE_JSONRPC_METHOD)
  assert.deepEqual(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_OPERATIONS, JSON.parse(JSON.stringify(FUTURE_WORKER_LIFECYCLE_OPERATIONS)))
  assert.equal(contract.AGENTTEAM_KERNEL_WORKER_LIFECYCLE_HELPER_CONNECTION_DECISION.status, HELPER_CONNECTION_MODEL.status)
  assert.equal(contract.AGENTTEAM_KERNEL_WORKER_LIFECYCLE_HELPER_CONNECTION_DECISION.longLivedHelperStatus, HELPER_CONNECTION_MODEL.longLivedHelperStatus)
  assert.deepEqual(contract.AGENTTEAM_KERNEL_WORKER_LIFECYCLE_HELPER_CONNECTION_DECISION.prerequisitesForLongLivedHelper, [...HELPER_CONNECTION_MODEL.prerequisitesForLongLivedHelper])
  assert.equal(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT.activeRuntimeCapability, true)
  assert.deepEqual(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT.activeOperations, ['inspectPane', 'listAgentTeamPanes'])
  assert.equal(contract.AGENTTEAM_KERNEL_CONTRACT.futureWorkerLifecycleContract.status, 'runtime-read-only-inspect-and-list-agentteam-panes')
}

function assertRuntimeAndGoUnchanged(root) {
  const kernel = read(root, KERNEL)
  const goSource = read(root, GO_SOURCE)
  const manifest = JSON.parse(read(root, MANIFEST))
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

  assert.deepEqual(manifest.capabilities, CURRENT_RUNTIME_CAPABILITIES)
  assert.equal(manifest.capabilities.includes(FUTURE_CAPABILITY), true, 'v0.6.54 manifest advertises workerLifecycle for read-only inspect/list operations')
  assert.equal(manifest.module, 'tmuxSnapshotParse')
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')

  assert.deepEqual(parseGoCapabilities(goSource), CURRENT_RUNTIME_CAPABILITIES)
  assert.equal(parseGoCapabilities(goSource).includes(FUTURE_CAPABILITY), true, 'v0.6.54 Go health advertises workerLifecycle for read-only inspect/list operations')
  assert.match(goSource, /case\s+"workerLifecycle"/, 'v0.6.54 keeps workerLifecycle handler read-only')
  assert.match(goSource, /case\s+"inspectPane"/, 'workerLifecycle must keep inspectPane active')
  assert.match(goSource, /case\s+"listAgentTeamPanes"/, 'workerLifecycle must activate listAgentTeamPanes')
  for (const command of BROAD_GO_LIFECYCLE_COMMANDS) assert.equal(goSource.includes(command), false, `${GO_SOURCE} must not add broad tmux lifecycle command ${command}`)
  assertIncludes(goSource, ALLOWED_GO_TMUX_COMMAND, GO_SOURCE)

  assertIncludes(kernel, "callHelper<unknown>('workerLifecycle', { operation: 'inspectPane'", KERNEL)
  assertIncludes(kernel, "callHelper<unknown>('workerLifecycle', { operation: 'listAgentTeamPanes' })", KERNEL)
  assertIncludes(kernel, "callHelper<unknown>('tmuxSnapshotParse', { stdout, capturedAt })", KERNEL)
  assertIncludes(kernel, "callHelper<unknown>('tmuxSnapshotCapture', { capturedAt })", KERNEL)
}

function assertContractSource(root) {
  const source = read(root, CONTRACT)
  assertIncludes(source, `AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CAPABILITY = '${FUTURE_CAPABILITY}'`, CONTRACT)
  assertIncludes(source, "AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT_STATUS = 'runtime-read-only-inspect-and-list-agentteam-panes'", CONTRACT)
  assertIncludes(source, `AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_JSONRPC_METHOD = '${FUTURE_JSONRPC_METHOD}'`, CONTRACT)
  assertIncludes(source, 'AGENTTEAM_KERNEL_WORKER_LIFECYCLE_HELPER_CONNECTION_DECISION', CONTRACT)
  assertIncludes(source, 'futureWorkerLifecycleContract: AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT', CONTRACT)
  assert.equal(/AGENTTEAM_KERNEL_CAPABILITIES\s*=\s*\[[^\]]*workerLifecycle/s.test(source), true, `${CONTRACT} should keep workerLifecycle active after v0.6.54 read-only list activation`)
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  assert.equal(exists(root, ROADMAP), true, `${ROADMAP} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoReleaseOverclaims(doc, DOC)
  assertNoReleaseOverclaims(roadmap, ROADMAP)
}

module.exports = {
  name: 'Go kernel v0.6.52 worker lifecycle contract gate',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertContractModule(env)
    assertContractSource(root)
    assertRuntimeAndGoUnchanged(root)
    assertDocs(root)
  },
}
