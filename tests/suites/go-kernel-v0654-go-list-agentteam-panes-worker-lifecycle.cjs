const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ALLOWED_GO_TMUX_COMMANDS,
  CAPABILITY,
  CAPABILITY_ADVERTISEMENT_DECISION,
  COMPACT_LIST_RESULT_FIELDS,
  COMPACT_PANE_FIELDS,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_LIST_AGENTTEAM_PANES_WORKER_LIFECYCLE_SCHEMA_VERSION,
  GO_LIST_AGENTTEAM_PANES_WORKER_LIFECYCLE_THEME,
  HELPER_VERSION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  UNSUPPORTED_OPERATIONS,
  WORKER_LIFECYCLE_STATUS,
  goListAgentTeamPanesWorkerLifecycle,
} = require('../fixtures/kernel/v0654/goListAgentTeamPanesWorkerLifecycle.cjs')

const DOC = 'docs/perf/v0.6.54-go-list-agentteam-panes-worker-lifecycle.md'
const ROADMAP = 'docs/agentteam方案书.md'
const CONTRACT = 'core/kernelContract.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const MANIFEST = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json'
const PROVENANCE = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/provenance.json'
const CHECKSUMS = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/SHA256SUMS'
const HELPER = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/agentteam-tmuxSnapshotParse'
const FIXTURE = 'tests/fixtures/kernel/v0654/goListAgentTeamPanesWorkerLifecycle.cjs'
const SUITE = 'tests/suites/go-kernel-v0654-go-list-agentteam-panes-worker-lifecycle.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.54 Go listAgentTeamPanes Worker Lifecycle Slice',
  'Result: v0.6.54 activates the next narrow worker lifecycle runtime slice: Go-owned read-only `listAgentTeamPanes` alongside the existing read-only `inspectPane`.',
  'Capability advertisement decision: `advertise-workerLifecycle-for-read-only-inspect-and-list-agentteam-panes`.',
  '`operation:"listAgentTeamPanes"`',
  'Unsupported worker lifecycle operations continue to fail closed with compact diagnostics.',
  'Go worker lifecycle authority is reachable only through explicit TypeScript kernel adapter seams:',
  '`createAgentTeamKernelAdapter().listAgentTeamPanes()`',
  'The TypeScript/pi facade remains authoritative.',
  'For `listAgentTeamPanes`, Go reuses the existing compact snapshot format: `tmux list-panes -a -F tmuxPaneSnapshotFormat`, then filters out rows without a pane id or `@agentteam-name` label.',
  'The list result includes only panes with a non-empty `paneId` and non-empty `label` (`@agentteam-name`), matching the TypeScript `tmux/core.ts` `listAgentTeamPanes()` semantics.',
  '`byPaneId` is built from the filtered list only, so unlabeled/non-agentteam panes are excluded from the worker lifecycle seam.',
  'No `display-message`, `send-keys`, `split-window`, `new-window`, `kill-pane`, `set-option`, `select-pane`, or `respawn-pane` is added to Go.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0654/goListAgentTeamPanesWorkerLifecycle.cjs`',
  '`tests/suites/go-kernel-v0654-go-list-agentteam-panes-worker-lifecycle.cjs`',
  'node tests/run.cjs go-kernel-v0654-go-list-agentteam-panes-worker-lifecycle',
]
const REQUIRED_ROADMAP = [
  'v0.6.54 Go listAgentTeamPanes worker lifecycle slice',
  'docs/perf/v0.6.54-go-list-agentteam-panes-worker-lifecycle.md',
  'active operations are exactly read-only `inspectPane` and `listAgentTeamPanes`',
  'advertise-workerLifecycle-for-read-only-inspect-and-list-agentteam-panes',
  'create/wake/label/kill remain TypeScript-owned and unmigrated',
  '**v0.6.54 Go listAgentTeamPanes worker lifecycle slice**',
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
    "process.stdout.write('%agentteam\tsession:@1\tleader\tpi\\n%unlabeled\tsession:@2\t\tbash\\n\tsession:@3\tmissing-pane-id\tzsh\\n%worker\tsession:@4\tworker-a\tnode\\n')",
  ].join('\n') + '\n', 'utf8')
  fs.chmodSync(tmuxPath, 0o755)
  return tmuxPath
}

function assertCompactListResult(result) {
  assert.equal(result.operation, 'listAgentTeamPanes')
  assert.equal(result.capability, CAPABILITY)
  assert.equal(result.readOnly, true)
  assert.equal(result.stateFilesRead, false)
  assert.equal(result.stateFilesWritten, false)
  assert.equal(result.tmuxMutation, false)
  for (const key of Object.keys(result)) assert.equal(COMPACT_LIST_RESULT_FIELDS.includes(key), true, `unexpected list field ${key}`)
  assert.equal(Array.isArray(result.panes), true)
  assert.equal(result.byPaneId && typeof result.byPaneId === 'object' && !Array.isArray(result.byPaneId), true)
  for (const pane of result.panes) {
    for (const key of Object.keys(pane)) assert.equal(COMPACT_PANE_FIELDS.includes(key), true, `unexpected pane field ${key}`)
    assert.equal(typeof pane.paneId, 'string')
    assert.equal(typeof pane.target, 'string')
    assert.equal(typeof pane.label, 'string')
    assert.equal(typeof pane.currentCommand, 'string')
  }
  const serialized = JSON.stringify(result)
  assert.equal(/stdout|stderr|stack|cwd|MAILBOX_BODY|REPORT_BODY|worker transcript|rawState|stateArchive|terminal raw/i.test(serialized), false)
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goListAgentTeamPanesWorkerLifecycle)), goListAgentTeamPanesWorkerLifecycle)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.schemaVersion, GO_LIST_AGENTTEAM_PANES_WORKER_LIFECYCLE_SCHEMA_VERSION)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.theme, GO_LIST_AGENTTEAM_PANES_WORKER_LIFECYCLE_THEME)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.packageVersion, PACKAGE_VERSION)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.helperVersion, HELPER_VERSION)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.capability, CAPABILITY)
  assert.deepEqual(goListAgentTeamPanesWorkerLifecycle.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goListAgentTeamPanesWorkerLifecycle.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(goListAgentTeamPanesWorkerLifecycle.capabilityAdvertisementDecision, CAPABILITY_ADVERTISEMENT_DECISION)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.workerLifecycleStatus, WORKER_LIFECYCLE_STATUS)
  assert.deepEqual(goListAgentTeamPanesWorkerLifecycle.allowedGoTmuxCommands, [...ALLOWED_GO_TMUX_COMMANDS])
  assert.deepEqual(goListAgentTeamPanesWorkerLifecycle.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goListAgentTeamPanesWorkerLifecycle.unsupportedOperations, [...UNSUPPORTED_OPERATIONS])
  assert.equal(goListAgentTeamPanesWorkerLifecycle.inspectPaneReadOnly, true)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.listAgentTeamPanesReadOnly, true)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.listAgentTeamPanesRequiresNonEmptyLabel, true)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.listAgentTeamPanesByPaneIdFilteredOnly, true)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.unsupportedOperationsFailClosed, true)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.workerLifecycleMigrated, true)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.createTeammatePaneMigrated, false)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.wakePaneMigrated, false)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.syncPaneLabelsMigrated, false)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.killPaneMigrated, false)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.stateRepositoryMigrated, false)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.taskReportPlanRunMigrated, false)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.teamPanelViewModelMigrated, false)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.releasePackageVerificationMigrated, false)
  assert.equal(goListAgentTeamPanesWorkerLifecycle.nativeArtifactRenamed, false)
  assert.deepEqual(goListAgentTeamPanesWorkerLifecycle.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goListAgentTeamPanesWorkerLifecycle.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
}

function assertContractAndRuntime(env) {
  const contract = env.helpers.requireDist('core/kernelContract.js')
  const kernel = env.helpers.requireDist('core/kernel.js')
  assert.deepEqual(contract.AGENTTEAM_KERNEL_CAPABILITIES, [...ACTIVE_CAPABILITIES])
  assert.equal(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT_STATUS, WORKER_LIFECYCLE_STATUS)
  assert.equal(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT.activeRuntimeCapability, true)
  assert.deepEqual(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT.activeOperations, [...ACTIVE_OPERATIONS])
  assert.equal(contract.AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT.unsupportedOperationsFailClosed, true)
  const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'typescript', env: {} })
  assert.equal(typeof adapter.inspectWorkerPane, 'function')
  assert.equal(typeof adapter.listAgentTeamPanes, 'function')

  const missing = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(os.tmpdir(), 'missing-v0654-worker-helper') })
  const result = missing.listAgentTeamPanes()
  assertCompactListResult(result)
  assert.equal(result.ok, false)
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

  assertIncludes(contract, "AGENTTEAM_KERNEL_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability']", CONTRACT)
  assertIncludes(contract, "AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT_STATUS = 'runtime-read-only-inspect-and-list-agentteam-panes'", CONTRACT)
  assertIncludes(contract, "activeOperations: ['inspectPane', 'listAgentTeamPanes']", CONTRACT)
  assertIncludes(kernel, 'listAgentTeamPanes(): AgentTeamKernelWorkerPaneList', KERNEL)
  assertIncludes(kernel, "callHelper<unknown>('workerLifecycle', { operation: 'listAgentTeamPanes' })", KERNEL)
  assertIncludes(kernel, 'validateWorkerPaneListResult', KERNEL)

  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(provenance.smoke.workerLifecycleInspectPane.acceptedFailureKinds, ['pane-not-found', 'tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'])
  assert.deepEqual(provenance.smoke.workerLifecycleListAgentTeamPanes.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'])
  assert.equal(manifest.smoke.workerLifecycleListAgentTeamPanes.acceptedFailureKinds.includes('tmux-unavailable'), true)
  assert.equal(checksums.includes(HELPER), true)
  assert.equal(checksums.includes(MANIFEST), true)
  assert.equal(checksums.includes(PROVENANCE), true)

  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  assert.match(goSource, /case "workerLifecycle"/)
  assert.match(goSource, /case "inspectPane"/)
  assert.match(goSource, /case "listAgentTeamPanes"/)
  assert.match(goSource, /func workerLifecycle\(params map\[string\]any\) any/)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat\)/)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat\)/)
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'later v0.6.60 permits only current-pane binding display-message')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, `${GO_SOURCE} must not add target-based display-message`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => !['select-pane', 'split-window', 'select-layout', 'resize-pane', 'new-session', 'new-window'].includes(command))) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add ${command}`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} later v0.6.76 permits only narrow pane-title setPaneLabel select-pane`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} later v0.6.78 authorized pane label clearing`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} later v0.6.78 authorized pane title clearing`)
  for (const forbidden of ['os.ReadFile', 'os.WriteFile', 'os.Create', 'PI_AGENTTEAM_HOME', 'agentteam_task', 'agentteam_receive', 'report_done', 'report_blocked', 'renderPanel', 'openTeamPanel', 'npm publish', 'npm version']) {
    assert.equal(goSource.includes(forbidden), false, `${GO_SOURCE} must not migrate ${forbidden}`)
  }
}

function assertDirectGoBehavior(root) {
  if (!hasGoToolchain()) return
  const list = runGoHelper(root, { jsonrpc: '2.0', id: 'list-panes', method: 'workerLifecycle', params: { operation: 'listAgentTeamPanes' } })
  assert.equal(list.status, 0, list.stderr)
  const listResponse = JSON.parse(list.stdout.trim())
  assert.equal(listResponse.jsonrpc, '2.0')
  assert.equal(listResponse.id, 'list-panes')
  assertCompactListResult(listResponse.result)
  if (listResponse.result.ok === false) assert.equal(['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'].includes(listResponse.result.failureKind), true)

  const fakeTmuxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0654-fake-tmux-'))
  try {
    writeFakeTmux(fakeTmuxRoot)
    const filtered = runGoHelper(root, { jsonrpc: '2.0', id: 'list-filtered', method: 'workerLifecycle', params: { operation: 'listAgentTeamPanes' } }, { PATH: `${fakeTmuxRoot}${path.delimiter}${process.env.PATH || ''}` })
    assert.equal(filtered.status, 0, filtered.stderr)
    const filteredResponse = JSON.parse(filtered.stdout.trim())
    assertCompactListResult(filteredResponse.result)
    assert.equal(filteredResponse.result.ok, true)
    assert.deepEqual(filteredResponse.result.panes.map(pane => pane.paneId), ['%agentteam', '%worker'])
    assert.deepEqual(Object.keys(filteredResponse.result.byPaneId).sort(), ['%agentteam', '%worker'])
    assert.equal(filteredResponse.result.byPaneId['%agentteam'].label, 'leader')
    assert.equal(filteredResponse.result.byPaneId['%worker'].label, 'worker-a')
    assert.equal(Object.prototype.hasOwnProperty.call(filteredResponse.result.byPaneId, '%unlabeled'), false)
  } finally {
    fs.rmSync(fakeTmuxRoot, { recursive: true, force: true })
  }

  const unsupported = runGoHelper(root, { jsonrpc: '2.0', id: 'kill-rejected', method: 'workerLifecycle', params: { operation: 'killPane', paneId: '%1' } })
  assert.equal(unsupported.status, 0, unsupported.stderr)
  const unsupportedResponse = JSON.parse(unsupported.stdout.trim())
  assert.equal(unsupportedResponse.result.operation, 'inspectPane')
  assert.equal(unsupportedResponse.result.capability, CAPABILITY)
  assert.equal(unsupportedResponse.result.readOnly, true)
  assert.equal(unsupportedResponse.result.tmuxMutation, false)
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
  name: 'Go kernel v0.6.54 Go listAgentTeamPanes worker lifecycle',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertContractAndRuntime(env)
    assertSourceAndMetadata(root)
    assertDirectGoBehavior(root)
    assertDocs(root)
  },
}
