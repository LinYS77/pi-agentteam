const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATION,
  CAPABILITY,
  CAPABILITY_ADVERTISEMENT_DECISION,
  COMPACT_RESULT_FIELDS,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_INSPECT_PANE_WORKER_LIFECYCLE_SCHEMA_VERSION,
  GO_INSPECT_PANE_WORKER_LIFECYCLE_THEME,
  HELPER_VERSION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  UNSUPPORTED_OPERATIONS,
  WORKER_LIFECYCLE_STATUS,
  goInspectPaneWorkerLifecycle,
} = require('../fixtures/kernel/v0653/goInspectPaneWorkerLifecycle.cjs')

const DOC = 'docs/perf/v0.6.53-go-inspect-pane-worker-lifecycle.md'
const ROADMAP = 'docs/agentteam方案书.md'
const CONTRACT = 'core/kernelContract.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const MANIFEST = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json'
const PROVENANCE = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/provenance.json'
const CHECKSUMS = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/SHA256SUMS'
const HELPER = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/agentteam-tmuxSnapshotParse'
const FIXTURE = 'tests/fixtures/kernel/v0653/goInspectPaneWorkerLifecycle.cjs'
const SUITE = 'tests/suites/go-kernel-v0653-go-inspect-pane-worker-lifecycle.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.53 Go inspectPane Worker Lifecycle Slice',
  'Result: v0.6.53 activates the first narrow worker lifecycle runtime slice: Go-owned read-only `inspectPane` only.',
  'Capability advertisement decision: `advertise-workerLifecycle-for-inspectPane-only`.',
  '`workerLifecycle` is now an active helper capability only for `operation:"inspectPane"`.',
  'Unsupported worker lifecycle operations fail closed with compact diagnostics.',
  'No `createTeammatePane`, `wakePane`, `syncPaneLabels`, `killPane`, spawn, send-keys, label mutation, or pane mutation is migrated.',
  'The TypeScript/pi facade remains authoritative.',
  'Go worker lifecycle authority is reachable only through `createAgentTeamKernelAdapter().inspectWorkerPane(...)`.',
  'The Go helper uses read-only `tmux list-panes -a -F workerLifecycleInspectPaneFormat`.',
  'No `display-message`, `send-keys`, `split-window`, `new-window`, or `kill-pane` is added to Go.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0653/goInspectPaneWorkerLifecycle.cjs`',
  '`tests/suites/go-kernel-v0653-go-inspect-pane-worker-lifecycle.cjs`',
  'node tests/run.cjs go-kernel-v0653-go-inspect-pane-worker-lifecycle',
]
const REQUIRED_ROADMAP = [
  'v0.6.53 Go inspectPane worker lifecycle slice',
  'docs/perf/v0.6.53-go-inspect-pane-worker-lifecycle.md',
  'workerLifecycle` is active only for read-only `inspectPane`',
  'advertise-workerLifecycle-for-inspectPane-only',
  'create/wake/label/kill remain TypeScript-owned and unmigrated',
  '**v0.6.53 Go inspectPane worker lifecycle slice**',
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

function hasGoToolchain() {
  return spawnSync('go', ['version'], { encoding: 'utf8' }).status === 0
}

function runGoHelper(root, request) {
  return spawnSync('go', ['run', '.'], {
    cwd: path.join(root, 'kernel', 'go', 'agentteam-kernel'),
    input: `${JSON.stringify(request)}\n`,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, GO111MODULE: 'off', PATH: process.env.PATH || '' },
  })
}

function assertCompactInspectionResult(result, expectedPaneId) {
  assert.equal(result.operation, ACTIVE_OPERATION)
  assert.equal(result.capability, CAPABILITY)
  assert.equal(result.readOnly, true)
  assert.equal(result.stateFilesRead, false)
  assert.equal(result.stateFilesWritten, false)
  assert.equal(result.tmuxMutation, false)
  assert.equal(typeof result.requestedPaneId, 'string')
  assert.equal(result.requestedPaneId.length > 0, true)
  for (const key of Object.keys(result)) assert.equal(COMPACT_RESULT_FIELDS.includes(key), true, `unexpected inspection field ${key}`)
  if (expectedPaneId) assert.equal(result.requestedPaneId, expectedPaneId)
  const serialized = JSON.stringify(result)
  assert.equal(/stdout|stderr|stack|cwd|MAILBOX_BODY|REPORT_BODY|worker transcript|rawState|stateArchive|terminal raw/i.test(serialized), false)
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goInspectPaneWorkerLifecycle)), goInspectPaneWorkerLifecycle)
  assert.equal(goInspectPaneWorkerLifecycle.schemaVersion, GO_INSPECT_PANE_WORKER_LIFECYCLE_SCHEMA_VERSION)
  assert.equal(goInspectPaneWorkerLifecycle.theme, GO_INSPECT_PANE_WORKER_LIFECYCLE_THEME)
  assert.equal(goInspectPaneWorkerLifecycle.packageVersion, PACKAGE_VERSION)
  assert.equal(goInspectPaneWorkerLifecycle.helperVersion, HELPER_VERSION)
  assert.equal(goInspectPaneWorkerLifecycle.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goInspectPaneWorkerLifecycle.capability, CAPABILITY)
  assert.equal(goInspectPaneWorkerLifecycle.activeOperation, ACTIVE_OPERATION)
  assert.deepEqual(goInspectPaneWorkerLifecycle.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goInspectPaneWorkerLifecycle.capabilityAdvertisementDecision, CAPABILITY_ADVERTISEMENT_DECISION)
  assert.equal(goInspectPaneWorkerLifecycle.workerLifecycleStatus, WORKER_LIFECYCLE_STATUS)
  assert.deepEqual(goInspectPaneWorkerLifecycle.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goInspectPaneWorkerLifecycle.unsupportedOperations, [...UNSUPPORTED_OPERATIONS])
  assert.equal(goInspectPaneWorkerLifecycle.inspectPaneReadOnly, true)
  assert.equal(goInspectPaneWorkerLifecycle.unsupportedOperationsFailClosed, true)
  assert.equal(goInspectPaneWorkerLifecycle.workerLifecycleMigrated, true)
  assert.equal(goInspectPaneWorkerLifecycle.createTeammatePaneMigrated, false)
  assert.equal(goInspectPaneWorkerLifecycle.wakePaneMigrated, false)
  assert.equal(goInspectPaneWorkerLifecycle.syncPaneLabelsMigrated, false)
  assert.equal(goInspectPaneWorkerLifecycle.killPaneMigrated, false)
  assert.equal(goInspectPaneWorkerLifecycle.stateRepositoryMigrated, false)
  assert.equal(goInspectPaneWorkerLifecycle.taskReportPlanRunMigrated, false)
  assert.equal(goInspectPaneWorkerLifecycle.teamPanelViewModelMigrated, false)
  assert.equal(goInspectPaneWorkerLifecycle.releasePackageVerificationMigrated, false)
  assert.equal(goInspectPaneWorkerLifecycle.nativeArtifactRenamed, false)
  assert.deepEqual(goInspectPaneWorkerLifecycle.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goInspectPaneWorkerLifecycle.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
}

function assertContractAndRuntime(env) {
  const contract = env.helpers.requireDist('core/kernelContract.js')
  const kernel = env.helpers.requireDist('core/kernel.js')
  assert.deepEqual(contract.AGENTTEAM_KERNEL_CAPABILITIES, [...ACTIVE_CAPABILITIES])
  assert.ok([WORKER_LIFECYCLE_STATUS, 'runtime-read-only-inspect-and-list-agentteam-panes'].includes(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT_STATUS))
  assert.equal(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT.activeRuntimeCapability, true)
  assert.deepEqual(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT.activeOperations, ['inspectPane', 'listAgentTeamPanes'])
  assert.equal(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT.unsupportedOperationsFailClosed, true)
  const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'typescript', env: {} })
  assert.equal(typeof adapter.inspectWorkerPane, 'function')
  assert.equal(typeof adapter.listAgentTeamPanes, 'function')

  const missing = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(os.tmpdir(), 'missing-v0653-worker-helper') })
  const result = missing.inspectWorkerPane('%missing-v0653-pane')
  assertCompactInspectionResult(result, '%missing-v0653-pane')
  assert.equal(result.ok, false)
  assert.equal(result.exists, false)
  assert.equal(result.status, 'unknown')
  assert.equal(result.resultMarker, 'stale')
  assert.equal(result.failureKind, 'missing-helper')
}

function assertSourceAndMetadata(root) {
  const contract = read(root, CONTRACT)
  const kernel = read(root, KERNEL)
  const goSource = read(root, GO_SOURCE)
  const packageJson = JSON.parse(read(root, 'package.json'))
  const manifest = JSON.parse(read(root, MANIFEST))
  const provenance = JSON.parse(read(root, PROVENANCE))
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

  assertIncludes(contract, "AGENTTEAM_KERNEL_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle']", CONTRACT)
  assertIncludes(contract, "AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT_STATUS = 'runtime-read-only-inspect-and-list-agentteam-panes'", CONTRACT)
  assertIncludes(kernel, "inspectWorkerPane(paneId: string)", KERNEL)
  assertIncludes(kernel, 'listAgentTeamPanes(): AgentTeamKernelWorkerPaneList', KERNEL)
  assertIncludes(kernel, "callHelper<unknown>('workerLifecycle', { operation: 'inspectPane'", KERNEL)
  assertIncludes(kernel, "callHelper<unknown>('workerLifecycle', { operation: 'listAgentTeamPanes' })", KERNEL)
  assertIncludes(kernel, 'validateWorkerPaneInspectionResult', KERNEL)
  assertIncludes(kernel, 'validateWorkerPaneListResult', KERNEL)

  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(provenance.smoke.workerLifecycleInspectPane.acceptedFailureKinds, ['pane-not-found', 'tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'])
  assert.deepEqual(provenance.smoke.workerLifecycleListAgentTeamPanes.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'])
  assert.equal(manifest.smoke.workerLifecycleInspectPane.acceptedFailureKinds.includes('tmux-unavailable'), true)
  assert.equal(manifest.smoke.workerLifecycleListAgentTeamPanes.acceptedFailureKinds.includes('tmux-unavailable'), true)
  assert.equal(checksums.includes(HELPER), true)
  assert.equal(checksums.includes(MANIFEST), true)
  assert.equal(checksums.includes(PROVENANCE), true)

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  assert.match(goSource, /case "workerLifecycle"/)
  assert.match(goSource, /case "inspectPane"/)
  assert.match(goSource, /case "listAgentTeamPanes"/)
  const inspectFormat = goSource.match(/const workerLifecycleInspectPaneFormat = "([^"]+)"/)?.[1] || ''
  assertIncludes(inspectFormat, '#{session_name}:#{window_id}', 'workerLifecycleInspectPaneFormat compact target')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat\)/)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat\)/)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'later v0.6.60 permits only current-pane binding display-message')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, `${GO_SOURCE} must not add target-based display-message`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
  for (const forbidden of ['os.ReadFile', 'os.WriteFile', 'os.Create', 'agentteam_task', 'agentteam_receive', 'report_done', 'report_blocked', 'renderPanel', 'openTeamPanel', 'npm publish', 'npm version']) {
    assert.equal(goSource.includes(forbidden), false, `${GO_SOURCE} must not migrate ${forbidden}`)
  }
}

function assertDirectGoBehavior(root) {
  if (!hasGoToolchain()) return
  const missingPane = '%agentteam-v0653-missing-pane'
  const inspect = runGoHelper(root, { jsonrpc: '2.0', id: 'inspect-missing', method: 'workerLifecycle', params: { operation: ACTIVE_OPERATION, paneId: missingPane } })
  assert.equal(inspect.status, 0, inspect.stderr)
  const inspectResponse = JSON.parse(inspect.stdout.trim())
  assert.equal(inspectResponse.jsonrpc, '2.0')
  assert.equal(inspectResponse.id, 'inspect-missing')
  assertCompactInspectionResult(inspectResponse.result, missingPane)
  assert.equal(inspectResponse.result.ok, false)
  assert.equal(['pane-not-found', 'tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'].includes(inspectResponse.result.failureKind), true)

  const unsupported = runGoHelper(root, { jsonrpc: '2.0', id: 'kill-rejected', method: 'workerLifecycle', params: { operation: 'killPane', paneId: '%1' } })
  assert.equal(unsupported.status, 0, unsupported.stderr)
  const unsupportedResponse = JSON.parse(unsupported.stdout.trim())
  assertCompactInspectionResult(unsupportedResponse.result, '%1')
  assert.equal(unsupportedResponse.result.ok, false)
  assert.equal(unsupportedResponse.result.failureKind, 'unsupported-operation')
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
  name: 'Go kernel v0.6.53 Go inspectPane worker lifecycle',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertContractAndRuntime(env)
    assertSourceAndMetadata(root)
    assertDirectGoBehavior(root)
    assertDocs(root)
  },
}
