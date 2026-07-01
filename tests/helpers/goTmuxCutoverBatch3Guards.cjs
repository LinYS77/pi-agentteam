const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  assertIncludes,
  assertNotIncludes,
  existsRel,
  readJsonRel,
  readRel,
} = require('./fsAssertions.cjs')
const { assertPackageNoReleaseGuards } = require('./packageGuards.cjs')
const { assertNoRawOrReleaseArtifacts } = require('./nativeGuards.cjs')
const {
  HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES,
  HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES,
  HISTORICAL_CHECKPOINT_T024_DELETED_SUITES,
} = require('../fixtures/kernel/historicalCheckpointDeletionMap.cjs')
const {
  STEP6_BATCH3_ACTIONS,
  STEP6_BATCH3_AUDIT_ENTRIES,
  STEP6_BATCH3_CLUSTER_COUNTS,
  STEP6_BATCH3_CLUSTERS,
  STEP6_BATCH3_DELETION_CANDIDATE_SUITES,
  STEP6_BATCH3_GUARD_HELPER,
  STEP6_BATCH3_GUARD_SUITE,
  STEP6_BATCH3_RETAINED_SUITES,
  STEP6_BATCH3_SCOPE_DOCS,
  STEP6_BATCH3_SCOPE_FIXTURES,
} = require('../fixtures/kernel/goCutoverStep6Batch3Audit.cjs')

const GO_TMUX_CUTOVER_BATCH3_GUARD_HELPER = STEP6_BATCH3_GUARD_HELPER
const GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE = STEP6_BATCH3_GUARD_SUITE

const GO_TMUX_CUTOVER_BATCH3_GUARD_CATEGORIES = Object.freeze([
  'step6-batch3-audit-map-complete',
  'read-only-worker-lifecycle-facades',
  'mutation-facade-authority-exact',
  'go-helper-operation-surface-exact',
  'package-native-release-boundaries-preserved',
  'historical-suite-retention-honest',
])

const GO_TMUX_CUTOVER_BATCH3_CATEGORY_DESCRIPTIONS = Object.freeze({
  'step6-batch3-audit-map-complete': 'v0.6.53-v0.6.88 suites are mapped to clusters with duplicated assertions, unique assertions, current owner evidence, and keep/delete recommendations.',
  'read-only-worker-lifecycle-facades': 'Current TypeScript tmux read-only pane/window/session facades delegate through the Go kernel adapter without direct tmux fallback or hidden fallback after cutover.',
  'mutation-facade-authority-exact': 'Current mutating window/label/pane/session facades keep TypeScript authority, exact helper operations, compact fail-closed public behavior, and no wake/send-keys expansion.',
  'go-helper-operation-surface-exact': 'The Go helper exposes only the approved workerLifecycle/tmuxAvailability operation surface and exact tmux argv snippets for Step 6 batch-3 cutovers.',
  'package-native-release-boundaries-preserved': 'Package/native/release boundaries remain unchanged: package version 0.6.8, approved embedded helper path, no package/release/signing mechanics.',
  'historical-suite-retention-honest': 'Step 6 deletion accounting is honest: replaced read-only facade/orchestration suites are expected absent, retained v0.6.53-v0.6.88 suites stay present, and prior historical deletions remain absent.',
})

const GO_TMUX_CUTOVER_BATCH3_SOURCE_FILES = Object.freeze([
  'tmux/core.ts',
  'tmux/snapshot.ts',
  'tmux/process.ts',
  'tmux/windows.ts',
  'tmux/labels.ts',
  'tmux/panes.ts',
  'core/kernel.ts',
  'core/kernelContract.ts',
  'kernel/go/agentteam-kernel/main.go',
  'scripts/lib/go-helper-artifact-builder.cjs',
  'scripts/lib/go-helper-artifact-verifier.cjs',
  'tests/fixtures/kernel/jsonrpc/protocolCases.cjs',
  'package.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/SHA256SUMS',
])

const EXPECTED_CLUSTER_COUNTS = Object.freeze({
  workerLifecycle: 2,
  readOnlyFacade: 16,
  windowLabelMutation: 8,
  teammatePaneLifecycleMutation: 8,
  clearPaneLabelSync: 2,
})

const EXPECTED_STEP6_BATCH1_DELETED_SUITES = Object.freeze([
  'tests/suites/go-kernel-v0655-go-list-agentteam-panes-facade-cutover.cjs',
  'tests/suites/go-kernel-v0656-go-inspect-pane-facade-cutover.cjs',
  'tests/suites/go-kernel-v0657-go-pane-exists-facade-cutover.cjs',
  'tests/suites/go-kernel-v0658-go-resolve-pane-binding-facade-cutover.cjs',
  'tests/suites/go-kernel-v0659-go-target-for-pane-facade-cutover.cjs',
])

const EXPECTED_STEP6_BATCH2_DELETED_SUITES = Object.freeze([
  'tests/suites/go-kernel-v0662-go-window-pane-lookup-facade-cutover.cjs',
  'tests/suites/go-kernel-v0663-go-tmux-availability-facade-cutover.cjs',
  'tests/suites/go-kernel-v0664-go-pane-app-start-wait-cutover.cjs',
  'tests/suites/go-kernel-v0665-go-agentteam-window-discovery-cutover.cjs',
  'tests/suites/go-kernel-v0666-go-session-existence-cutover.cjs',
  'tests/suites/go-kernel-v0667-go-current-binding-window-fallback-cutover.cjs',
  'tests/suites/go-kernel-v0668-go-detached-leader-binding-cutover.cjs',
  'tests/suites/go-kernel-v0669-go-detached-first-pane-cutover.cjs',
  'tests/suites/go-kernel-v0670-go-window-name-lookup-cutover.cjs',
])

const EXPECTED_STEP6_DELETED_SUITES = Object.freeze([
  ...EXPECTED_STEP6_BATCH1_DELETED_SUITES,
  ...EXPECTED_STEP6_BATCH2_DELETED_SUITES,
])

const EXPECTED_WORKER_LIFECYCLE_OPERATIONS = Object.freeze([
  'inspectPane',
  'listAgentTeamPanes',
  'captureCurrentPaneBinding',
  'listPanesInWindow',
  'findAgentTeamWindowTarget',
  'findWindowTargetByName',
  'sessionExists',
  'createDetachedSwarmSession',
  'createDetachedSwarmWindow',
  'markWindowAsAgentTeam',
  'refreshWindowPaneLabels',
  'setPaneLabel',
  'clearPaneLabel',
  'killPane',
  'createTeammatePane',
])

const GO_REQUIRED_TMUX_COMMAND_SNIPPETS = Object.freeze([
  'exec.CommandContext(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat)',
  'exec.CommandContext(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat)',
  'exec.CommandContext(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat)',
  'exec.CommandContext(ctx, "tmux", "list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat)',
  'exec.CommandContext(ctx, "tmux", "list-windows", "-t", sessionName, "-F", workerLifecycleAgentTeamWindowFormat)',
  'exec.CommandContext(ctx, "tmux", "list-windows", "-t", sessionName, "-F", workerLifecycleWindowNameFormat)',
  'exec.CommandContext(ctx, "tmux", "has-session", "-t", sessionName)',
  'exec.CommandContext(ctx, "tmux", "new-session", "-d", "-s", sessionName, "-n", windowName)',
  'exec.CommandContext(ctx, "tmux", "new-window", "-t", sessionName, "-n", windowName)',
  'exec.CommandContext(ctx, "tmux", "set-option", "-w", "-t", target, option, value)',
  'exec.CommandContext(ctx, "tmux", "set-option", "-p", "-t", paneID, "@agentteam-name", label)',
  'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)',
  'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")',
  'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")',
  'exec.CommandContext(ctx, "tmux", "kill-pane", "-t", paneID)',
  'exec.CommandContext(ctx, "tmux", "-V")',
])

const FORBIDDEN_GO_OPERATION_CASES = Object.freeze([
  'wakePane',
  'syncPaneLabels',
  'stateRepositoryWrite',
  'taskReportPlanRun',
  'sendKeys',
])

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function assertUnique(values, label) {
  assert.deepEqual(sorted(values), sorted([...new Set(values)]), `${label} should not contain duplicates`)
}

function functionBody(source, name) {
  const candidates = [
    `export async function ${name}(`,
    `export function ${name}(`,
    `async function ${name}(`,
    `function ${name}(`,
  ]
  const start = candidates.map(marker => source.indexOf(marker)).filter(index => index >= 0).sort((a, b) => a - b)[0]
  assert.notEqual(start, undefined, `${name} should exist`)
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

function assertEveryRelExists(root, files, label) {
  for (const rel of files) assert.equal(existsRel(root, rel), true, `${rel} should exist for ${label}`)
}

function assertEveryRelAbsent(root, files, label) {
  for (const rel of files) assert.equal(existsRel(root, rel), false, `${rel} should stay absent for ${label}`)
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

function writeReadOnlyFacadeFakeTmux(binDir) {
  fs.mkdirSync(binDir, { recursive: true })
  const tmuxPath = path.join(binDir, 'tmux')
  fs.writeFileSync(tmuxPath, [
    '#!/usr/bin/env node',
    "const args = process.argv.slice(2)",
    "const format = args[args.length - 1] || ''",
    "if (args.length === 1 && args[0] === '-V') {",
    "  process.stdout.write('tmux 3.4\\n')",
    "} else if (args[0] === 'list-panes' && args[1] === '-t') {",
    "  const target = args[2] || ''",
    "  if (format !== '#{pane_id}') process.exit(4)",
    "  if (target === 'team:@1') process.stdout.write('%first\\n%second\\n')",
    "  else if (target === 'empty:@1') process.stdout.write('')",
    "  else process.exit(5)",
    "} else if (args[0] === 'list-panes' && args[1] === '-a') {",
    "  if (format.includes('#{@agentteam-name}')) {",
    "    process.stdout.write('%agentteam\\tsession:@1\\tleader\\tpi\\n%unlabeled\\tsession:@9\\t\\tbash\\n%worker\\tsession:@2\\tworker-a\\tnode\\n')",
    "  } else {",
    "    process.stdout.write('%agentteam\\tsession:@1\\tpi\\t0\\tdefault\\n%unlabeled\\tsession:@9\\tbash\\t0\\tdefault\\n%worker\\tsession:@2\\tnode\\t1\\tcopy-mode\\n')",
    "  }",
    "} else if (args[0] === 'list-windows' && args[1] === '-t') {",
    "  const session = args[2] || ''",
    "  if (format === '#{window_id}\\t#{@agentteam-window}') {",
    "    if (session === 'team') process.stdout.write('@1\\t0\\n@7\\t1\\n')",
    "    else if (session === 'unmarked') process.stdout.write('@1\\t0\\n')",
    "    else process.exit(5)",
    "  } else if (format === '#{window_id}\\t#{window_name}') {",
    "    if (session === 'team') process.stdout.write('@5\\tother\\n@7\\tagentteam\\n')",
    "    else if (session === 'empty') process.stdout.write('@5\\tother\\n')",
    "    else process.exit(5)",
    "  } else process.exit(4)",
    "} else if (args[0] === 'has-session' && args[1] === '-t') {",
    "  if (args[2] === 'team') process.exit(0)",
    "  if (args[2] === 'missing') process.exit(1)",
    "  process.exit(3)",
    "} else if (args[0] === 'display-message' && args[1] === '-p') {",
    "  process.stdout.write('%current\\tsession:@current\\n')",
    "} else process.exit(2)",
  ].join('\n') + '\n', 'utf8')
  fs.chmodSync(tmuxPath, 0o755)
  return tmuxPath
}

function assertCompactInspectResult(result) {
  assert.equal(result.operation, 'inspectPane', 'direct Go inspect operation')
  assert.equal(result.capability, 'workerLifecycle', 'direct Go inspect capability')
  assert.equal(result.readOnly, true, 'direct Go inspect should be read-only')
  assert.equal(result.stateFilesRead, false, 'direct Go inspect should not read state files')
  assert.equal(result.stateFilesWritten, false, 'direct Go inspect should not write state files')
  assert.equal(result.tmuxMutation, false, 'direct Go inspect should not mutate tmux')
  const allowed = new Set(['ok', 'operation', 'capability', 'paneId', 'requestedPaneId', 'exists', 'target', 'currentCommand', 'inMode', 'mode', 'copyMode', 'status', 'resultMarker', 'failureKind', 'reason', 'error', 'readOnly', 'stateFilesRead', 'stateFilesWritten', 'tmuxMutation'])
  for (const key of Object.keys(result)) assert.equal(allowed.has(key), true, `unexpected direct Go inspect field ${key}`)
  assert.equal(/stdout|stderr|stack|cwd|MAILBOX_BODY|REPORT_BODY|worker transcript|rawState|stateArchive|terminal raw/i.test(JSON.stringify(result)), false, 'direct Go inspect result must not leak raw output')
}

function assertStep6Batch3AuditMap(root) {
  assert.equal(path.basename(GO_TMUX_CUTOVER_BATCH3_GUARD_HELPER), 'goTmuxCutoverBatch3Guards.cjs')
  assert.equal(path.basename(GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE), 'go-kernel-tmux-cutover-batch3-guard.cjs')
  assert.deepEqual(STEP6_BATCH3_ACTIONS, ['keep-unique', 'split-later', 'delete-replaced'])
  assert.equal(STEP6_BATCH3_AUDIT_ENTRIES.length, 36, 'Step 6 audit map should cover v0.6.53-v0.6.88')
  assert.deepEqual(STEP6_BATCH3_CLUSTER_COUNTS, EXPECTED_CLUSTER_COUNTS, 'Step 6 cluster counts should be explicit')
  assert.deepEqual(STEP6_BATCH3_DELETION_CANDIDATE_SUITES, [...EXPECTED_STEP6_DELETED_SUITES], 'Step 6 should mark exactly the batch 1/2 replaced read-only facade/orchestration suites')
  assert.equal(STEP6_BATCH3_RETAINED_SUITES.length, STEP6_BATCH3_AUDIT_ENTRIES.length - EXPECTED_STEP6_DELETED_SUITES.length, 'retained suite list should exclude Step 6 batch 1/2 deleted suites')
  assert.equal(STEP6_BATCH3_SCOPE_DOCS.length, STEP6_BATCH3_AUDIT_ENTRIES.length, 'scope docs should match audit entries')
  assert.equal(STEP6_BATCH3_SCOPE_FIXTURES.length, STEP6_BATCH3_AUDIT_ENTRIES.length, 'scope fixtures should match audit entries')
  assertUnique(STEP6_BATCH3_DELETION_CANDIDATE_SUITES, 'Step 6 deletion candidate suites')
  assertUnique(STEP6_BATCH3_RETAINED_SUITES, 'Step 6 retained suites')
  assertUnique(STEP6_BATCH3_SCOPE_DOCS, 'Step 6 scope docs')
  assertUnique(STEP6_BATCH3_SCOPE_FIXTURES, 'Step 6 scope fixtures')

  for (const [cluster, definition] of Object.entries(STEP6_BATCH3_CLUSTERS)) {
    assert.equal(STEP6_BATCH3_CLUSTER_COUNTS[cluster], definition.expectedSuiteCount, `${cluster} suite count should match cluster definition`)
    assert.equal(STEP6_BATCH3_ACTIONS.includes(definition.recommendedAction), true, `${cluster} should use a known Step 6 action`)
    assert.ok(definition.rationale.length >= 40, `${cluster} rationale should explain retention/deletion posture`)
  }

  const validClusters = new Set(Object.keys(STEP6_BATCH3_CLUSTERS))
  for (const entry of STEP6_BATCH3_AUDIT_ENTRIES) {
    const expectedDeleted = EXPECTED_STEP6_DELETED_SUITES.includes(entry.suite)
    assert.ok(validClusters.has(entry.cluster), `${entry.suite} should use a known cluster`)
    assert.equal(entry.recommendedAction, expectedDeleted ? 'delete-replaced' : 'keep-unique', `${entry.suite} should have the expected Step 6 batch 1/2 action`)
    assert.equal(entry.deletionReady, expectedDeleted, `${entry.suite} deletion readiness should match Step 6 batch 1/2 scope`)
    assert.ok(entry.duplicateAssertions.length >= 5, `${entry.suite} should document duplicate assertion clusters`)
    assert.ok(entry.uniqueAssertions.length >= 1, `${entry.suite} should document migrated or retained behavior-unique assertions`)
    assert.ok(entry.replacementEvidence.length >= 1, `${entry.suite} should cite current guard evidence for duplicated assertions`)
    assert.equal(entry.replacementEvidence[0].suite, GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE, `${entry.suite} should point to this guard suite`)
    assert.equal(entry.replacementEvidence[0].helper, GO_TMUX_CUTOVER_BATCH3_GUARD_HELPER, `${entry.suite} should point to this guard helper`)
    assert.ok(entry.replacementEvidence[0].categories.length >= 1, `${entry.suite} replacement evidence should list categories`)
    assert.equal(entry.replacementEvidence[0].categories.includes('read-only-worker-lifecycle-facades') || !expectedDeleted, true, `${entry.suite} deleted read-only facade should cite read-only current guard coverage`)
    assert.equal(existsRel(root, entry.suite), !expectedDeleted, `${entry.suite} presence should match Step 6 batch 1/2 deletion accounting`)
    assert.equal(existsRel(root, entry.doc), true, `${entry.doc} should remain present; Step 6 must not delete docs`)
    assert.equal(existsRel(root, entry.fixture), true, `${entry.fixture} should remain present; Step 6 must not delete fixtures`)
  }
}

function assertReadOnlyFacadeSourceBoundaries(root) {
  const core = readRel(root, 'tmux/core.ts')
  const snapshot = readRel(root, 'tmux/snapshot.ts')
  const processSource = readRel(root, 'tmux/process.ts')
  const windows = readRel(root, 'tmux/windows.ts')
  const kernel = readRel(root, 'core/kernel.ts')
  const kernelContract = readRel(root, 'core/kernelContract.ts')
  const goSource = readRel(root, 'kernel/go/agentteam-kernel/main.go')
  const builder = readRel(root, 'scripts/lib/go-helper-artifact-builder.cjs')
  const verifier = readRel(root, 'scripts/lib/go-helper-artifact-verifier.cjs')
  const protocolCases = readRel(root, 'tests/fixtures/kernel/jsonrpc/protocolCases.cjs')

  assertIncludes(core, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", 'tmux/core import')

  const ensureAvailable = functionBody(core, 'ensureTmuxAvailable')
  assertIncludes(ensureAvailable, 'createAgentTeamKernelAdapter().checkTmuxAvailableAsync(signal)', 'ensureTmuxAvailable adapter call')
  assertIncludes(ensureAvailable, "throw new Error(`tmux is required for agentteam panes${suffix}`)", 'ensureTmuxAvailable compact throw')
  assertNotIncludes(ensureAvailable, 'runTmux', 'ensureTmuxAvailable direct tmux fallback')
  assertNotIncludes(ensureAvailable, 'result.stderr', 'ensureTmuxAvailable must not leak raw stderr')
  assertNotIncludes(core, "import { runTmuxNoThrowAsync }", 'tmux/core should not import direct tmux client for read-only facades')

  const inspect = functionBody(core, 'inspectPane')
  assertIncludes(inspect, 'createAgentTeamKernelAdapter().inspectWorkerPane(paneId)', 'inspectPane adapter call')
  assertIncludes(inspect, 'exists: false', 'inspectPane fail-closed')
  assertIncludes(inspect, 'error: result.error || result.reason', 'inspectPane compact error mapping')
  assertIncludes(inspect, 'exists: true', 'inspectPane success mapping')
  assertIncludes(inspect, 'currentCommand: result.currentCommand', 'inspectPane current command mapping')
  assertIncludes(inspect, 'inMode: result.inMode', 'inspectPane mode mapping')
  assertIncludes(inspect, 'mode: result.mode', 'inspectPane mode name mapping')
  assertIncludes(inspect, 'copyMode: result.copyMode', 'inspectPane copy-mode mapping')
  assertNotIncludes(inspect, 'display-message', 'inspectPane direct tmux fallback')
  assertNotIncludes(inspect, 'runTmux', 'inspectPane direct tmux fallback')

  const paneExists = functionBody(core, 'paneExists')
  assertIncludes(paneExists, 'return Boolean(paneId && inspectPane(paneId).exists)', 'paneExists inspect wrapper')
  assertNotIncludes(paneExists, 'createAgentTeamKernelAdapter()', 'paneExists should not create a new helper operation')

  const resolveBinding = functionBody(core, 'resolvePaneBinding')
  assertIncludes(resolveBinding, 'const result = createAgentTeamKernelAdapter().inspectWorkerPane(paneId)', 'resolvePaneBinding inspect adapter')
  assertIncludes(resolveBinding, 'if (!result.ok || !result.target) return null', 'resolvePaneBinding fail closed')
  assertIncludes(resolveBinding, 'paneId: result.paneId || paneId', 'resolvePaneBinding pane id mapping')
  assertIncludes(resolveBinding, 'target: result.target', 'resolvePaneBinding target mapping')
  assertNotIncludes(resolveBinding, 'listAgentTeamPanes', 'resolvePaneBinding must not use label-filtered pane list')

  const resolveBindingAsync = functionBody(core, 'resolvePaneBindingAsync')
  assertIncludes(resolveBindingAsync, 'await createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)', 'resolvePaneBindingAsync async inspect adapter')
  assertIncludes(resolveBindingAsync, 'if (!result.ok || !result.target) return null', 'resolvePaneBindingAsync fail closed')

  const windowExists = functionBody(core, 'windowExists')
  assertIncludes(windowExists, 'if (!target) return false', 'windowExists empty target fail-closed')
  assertIncludes(windowExists, 'await createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)', 'windowExists adapter call')
  assertIncludes(windowExists, 'return result.ok', 'windowExists boolean result')
  assertNotIncludes(windowExists, 'runTmux', 'windowExists direct tmux fallback')
  assertNotIncludes(windowExists, 'list-panes', 'windowExists direct list-panes fallback')

  const firstPaneInWindow = functionBody(core, 'firstPaneInWindow')
  assertIncludes(firstPaneInWindow, 'if (!target) return null', 'firstPaneInWindow empty target fail-closed')
  assertIncludes(firstPaneInWindow, 'await createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)', 'firstPaneInWindow adapter call')
  assertIncludes(firstPaneInWindow, 'if (!result.ok || result.paneIds.length === 0) return null', 'firstPaneInWindow fail closed')
  assertIncludes(firstPaneInWindow, 'return result.paneIds[0] ?? null', 'firstPaneInWindow first compact pane mapping')
  assertNotIncludes(firstPaneInWindow, 'runTmux', 'firstPaneInWindow direct tmux fallback')
  assertNotIncludes(firstPaneInWindow, 'list-panes', 'firstPaneInWindow direct list-panes fallback')

  const currentBinding = functionBody(core, 'captureCurrentPaneBinding')
  assertIncludes(currentBinding, 'if (!isInsideTmux()) return null', 'captureCurrentPaneBinding tmux env gate')
  assertIncludes(currentBinding, 'createAgentTeamKernelAdapter().captureCurrentPaneBinding()', 'captureCurrentPaneBinding adapter call')
  assertIncludes(currentBinding, 'if (!result.ok || !result.paneId || !result.target) return null', 'captureCurrentPaneBinding fail closed')
  assertNotIncludes(currentBinding, 'display-message', 'captureCurrentPaneBinding direct tmux fallback')

  const targetForPaneId = functionBody(core, 'targetForPaneId')
  assertIncludes(targetForPaneId, 'return resolvePaneBinding(paneId)?.target ?? null', 'targetForPaneId resolve wrapper')

  const listPanes = functionBody(core, 'listAgentTeamPanes')
  assertIncludes(listPanes, 'const result = createAgentTeamKernelAdapter().listAgentTeamPanes()', 'listAgentTeamPanes adapter call')
  assertIncludes(listPanes, 'return result.ok ? result.panes : []', 'listAgentTeamPanes empty-array failure')
  assertNotIncludes(listPanes, 'runTmux', 'listAgentTeamPanes direct tmux fallback')
  assertNotIncludes(listPanes, "'list-panes'", 'listAgentTeamPanes direct tmux fallback')

  const snapshotListPanes = functionBody(snapshot, 'listAgentTeamPanesFromSnapshot')
  assertIncludes(snapshotListPanes, 'return snapshot.panes.filter(item => item.paneId && item.label)', 'listAgentTeamPanesFromSnapshot local label filter')
  assertNotIncludes(snapshotListPanes, 'createAgentTeamKernelAdapter()', 'listAgentTeamPanesFromSnapshot must stay snapshot-local')

  const wait = functionBody(processSource, 'waitForPaneAppStart')
  assertIncludes(processSource, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", 'waitForPaneAppStart adapter import')
  assertNotIncludes(processSource, "import { runTmuxNoThrowAsync } from './client.js'", 'waitForPaneAppStart direct tmux client import')
  assertIncludes(wait, 'const kernel = createAgentTeamKernelAdapter()', 'waitForPaneAppStart adapter capture')
  assertIncludes(wait, 'kernel.inspectWorkerPaneAsync(paneId, signal).catch(() => undefined)', 'waitForPaneAppStart inspect polling')
  assertIncludes(wait, 'SHELL_COMMANDS.has(command)', 'waitForPaneAppStart shell exclusion')
  assertIncludes(wait, 'Math.min(200, remaining)', 'waitForPaneAppStart 200ms-capped polling cadence')
  assertIncludes(wait, 'if (!paneId || signal?.aborted) return false', 'waitForPaneAppStart empty/pre-abort fail-closed')
  assertIncludes(wait, 'if (signal?.aborted) return false', 'waitForPaneAppStart in-flight abort fail-closed')
  assertNotIncludes(wait, 'display-message', 'waitForPaneAppStart direct tmux fallback')
  assertNotIncludes(wait, '#{pane_current_command}', 'waitForPaneAppStart raw tmux stdout parsing')
  assertNotIncludes(wait, 'throw new Error', 'waitForPaneAppStart public no-throw behavior')

  const findAgentWindow = functionBody(windows, 'findAgentTeamWindowTarget')
  assertIncludes(findAgentWindow, 'createAgentTeamKernelAdapter().findAgentTeamWindowTargetAsync(sessionName, signal)', 'findAgentTeamWindowTarget adapter call')
  assertIncludes(findAgentWindow, 'if (!sessionName || signal?.aborted) return null', 'findAgentTeamWindowTarget fail closed')
  assertIncludes(findAgentWindow, 'if (!result.ok || !result.target) return null', 'findAgentTeamWindowTarget helper failure fail closed')
  assertNotIncludes(findAgentWindow, 'runTmux', 'findAgentTeamWindowTarget direct tmux fallback')
  assertNotIncludes(findAgentWindow, 'stdout', 'findAgentTeamWindowTarget must not parse tmux stdout')
  assertNotIncludes(findAgentWindow, '@agentteam-window', 'findAgentTeamWindowTarget marker parsing stays in Go')
  assertNotIncludes(findAgentWindow, 'throw new Error', 'findAgentTeamWindowTarget public no-throw behavior')

  const findByName = functionBody(windows, 'findWindowTargetByName')
  assertIncludes(findByName, 'createAgentTeamKernelAdapter().findWindowTargetByNameAsync(sessionName, windowName, signal)', 'findWindowTargetByName adapter call')
  assertIncludes(findByName, 'if (!sessionName || !windowName || signal?.aborted) return null', 'findWindowTargetByName fail closed')
  assertIncludes(findByName, 'if (!result.ok || !result.target) return null', 'findWindowTargetByName helper failure fail closed')
  assertNotIncludes(findByName, 'runTmux', 'findWindowTargetByName direct tmux fallback')
  assertNotIncludes(findByName, 'stdout', 'findWindowTargetByName must not parse tmux stdout')

  const ensureWindow = functionBody(windows, 'ensureSwarmWindow')
  for (const expected of [
    'await ensureTmuxAvailable(signal)',
    'const preferredBinding = preferred?.leaderPaneId ? await resolvePaneBindingAsync(preferred.leaderPaneId, signal) : null',
    'preferred?.target && await windowExists(preferred.target, signal) ? preferred.target : null',
    'currentBinding ??= captureCurrentPaneBinding()',
    'const target = preferredTarget ?? getCurrentBinding()?.target',
    'await firstPaneInWindow(target, signal) ?? getCurrentBinding()?.paneId',
    "throw new Error('Failed to resolve current tmux pane binding')",
    'const sessionResult = await createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)',
    'const hasSession = sessionResult.ok && sessionResult.exists',
    'createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)',
    'let initialTarget = await findAgentTeamWindowTarget(SWARM_SESSION, signal)',
    'createAgentTeamKernelAdapter().createDetachedSwarmWindowAsync(SWARM_SESSION, SWARM_WINDOW, signal)',
    'initialTarget = await findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)',
    "throw new Error('Failed to locate agentteam tmux window after creation')",
    'const leaderPaneId = await firstPaneInWindow(initialTarget, signal)',
    "throw new Error('Failed to resolve agentteam leader pane')",
    'const binding = await resolvePaneBindingAsync(leaderPaneId, signal)',
    'const target = binding?.target',
    "throw new Error('Failed to resolve agentteam leader pane binding')",
    'await markWindowAsAgentTeam(target, signal)',
    'await refreshWindowPaneLabels(target, signal)',
  ]) assertIncludes(ensureWindow, expected, 'ensureSwarmWindow Step 6 source boundary')
  assert.ok(ensureWindow.indexOf('createAgentTeamKernelAdapter().createDetachedSwarmWindowAsync(SWARM_SESSION, SWARM_WINDOW, signal)') < ensureWindow.indexOf('await findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)'), 'ensureSwarmWindow should run new-window before post-creation window-name lookup')
  for (const forbidden of [
    "runTmuxAsync(['display-message', '-p', '#{session_name}:#{window_id}']",
    "runTmuxAsync(['display-message', '-p', '#{pane_id}']",
    "runTmuxAsync(['display-message', '-p', '-t', leaderPaneId, '#{window_id}']",
    "runTmuxAsync(['list-panes', '-t', initialTarget, '-F', '#{pane_id}']",
    "runTmuxAsync(['list-windows', '-t', SWARM_SESSION, '-F', '#{window_id}\\t#{window_name}']",
    "runTmuxNoThrowAsync(['has-session'",
  ]) assertNotIncludes(ensureWindow, forbidden, 'ensureSwarmWindow removed direct read-only tmux fallback')
  assertNotIncludes(ensureWindow, 'stdout', 'ensureSwarmWindow must not parse direct tmux stdout')
  assertNotIncludes(ensureWindow, 'send-keys', 'ensureSwarmWindow must not send keys')

  for (const expected of [
    'export type AgentTeamKernelWindowPaneList',
    'export type AgentTeamKernelAgentTeamWindowTarget',
    'export type AgentTeamKernelWindowNameTarget',
    'export type AgentTeamKernelSessionExistence',
    'export type AgentTeamKernelTmuxAvailability',
    'listPanesInWindowAsync(target: string, signal?: AbortSignal): Promise<AgentTeamKernelWindowPaneList>',
    'findAgentTeamWindowTargetAsync(sessionName: string, signal?: AbortSignal): Promise<AgentTeamKernelAgentTeamWindowTarget>',
    'findWindowTargetByNameAsync(sessionName: string, windowName: string, signal?: AbortSignal): Promise<AgentTeamKernelWindowNameTarget>',
    'sessionExistsAsync(sessionName: string, signal?: AbortSignal): Promise<AgentTeamKernelSessionExistence>',
    'checkTmuxAvailableAsync(signal?: AbortSignal): Promise<AgentTeamKernelTmuxAvailability>',
    'function compactTmuxWindowTarget',
    'function compactTmuxSessionName',
    'function compactTmuxWindowName',
    'function validateWindowPaneListResult',
    'function validateAgentTeamWindowTargetResult',
    'function validateWindowNameTargetResult',
    'function validateSessionExistenceResult',
    'function validateTmuxAvailabilityResult',
    "callHelper<unknown>('workerLifecycle', { operation: 'inspectPane'",
    "callHelper<unknown>('workerLifecycle', { operation: 'listAgentTeamPanes' })",
    "callHelper<unknown>('workerLifecycle', { operation: 'captureCurrentPaneBinding' })",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'listPanesInWindow', target: requestedTarget }, signal)",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'findAgentTeamWindowTarget', sessionName: requestedSessionName }, signal)",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'findWindowTargetByName', sessionName: requestedSessionName, windowName: requestedWindowName }, signal)",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'sessionExists', sessionName: requestedSessionName }, signal)",
    "callHelperAsync<unknown>('tmuxAvailability', undefined, signal)",
    "detail: 'aborted'",
  ]) assertIncludes(kernel, expected, 'core/kernel read-only helper calls')
  for (const expected of [
    'target?: string',
    "const target = typeof result.target === 'string' ? compactKernelText(result.target) : ''",
    '...(target ? { target } : {})',
  ]) assertIncludes(kernel, expected, 'core/kernel compact target mapping')
  const inspectFormat = goSource.match(/const workerLifecycleInspectPaneFormat = "([^"]+)"/)?.[1] || ''
  assertIncludes(inspectFormat, '#{pane_id}', 'Go inspect format pane id')
  assertIncludes(inspectFormat, '#{session_name}:#{window_id}', 'Go inspect format target')
  assertIncludes(inspectFormat, '#{pane_current_command}', 'Go inspect format current command')
  assertIncludes(goSource, 'Target            string `json:"target,omitempty"`', 'Go inspect target field')
  assertIncludes(goSource, 'Target:            strings.TrimSpace(fields[1])', 'Go inspect target parse')
  for (const expected of [
    'const workerLifecycleWindowPaneFormat = "#{pane_id}"',
    'const workerLifecycleAgentTeamWindowFormat = "#{window_id}\\t#{@agentteam-window}"',
    'const workerLifecycleWindowNameFormat = "#{window_id}\\t#{window_name}"',
    'type tmuxAvailabilityResult struct',
    'type workerAgentTeamWindowTargetResult struct',
    'type workerWindowNameTargetResult struct',
    'type workerSessionExistenceResult struct',
    'func checkTmuxAvailability() tmuxAvailabilityResult',
    'func listPanesInWindow(params map[string]any) workerWindowPaneListResult',
    'func findAgentTeamWindowTarget(params map[string]any) workerAgentTeamWindowTargetResult',
    'func findWindowTargetByName(params map[string]any) workerWindowNameTargetResult',
    'func sessionExists(params map[string]any) workerSessionExistenceResult',
    'exec.CommandContext(ctx, "tmux", "list-panes", "-t", target, "-F", workerLifecycleWindowPaneFormat)',
    'exec.CommandContext(ctx, "tmux", "list-windows", "-t", sessionName, "-F", workerLifecycleAgentTeamWindowFormat)',
    'exec.CommandContext(ctx, "tmux", "list-windows", "-t", sessionName, "-F", workerLifecycleWindowNameFormat)',
    'exec.CommandContext(ctx, "tmux", "has-session", "-t", sessionName)',
    'exec.CommandContext(ctx, "tmux", "-V")',
  ]) assertIncludes(goSource, expected, 'Go read-only orchestration operation surface')
  assertIncludes(kernelContract, "AGENTTEAM_KERNEL_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability']", 'kernel contract tmuxAvailability capability')
  for (const expected of [
    'runWorkerLifecycleFindAgentTeamWindowTargetSmoke',
    'runWorkerLifecycleFindWindowTargetByNameSmoke',
    'runWorkerLifecycleSessionExistsSmoke',
    'workerLifecycleFindAgentTeamWindowTarget',
    'workerLifecycleFindWindowTargetByName',
    'workerLifecycleSessionExists',
  ]) assertIncludes(builder, expected, 'artifact builder read-only orchestration smoke coverage')
  for (const expected of [
    'workerLifecycleFindAgentTeamWindowTarget',
    'workerLifecycleFindWindowTargetByName',
    'workerLifecycleSessionExists',
  ]) assertIncludes(verifier, expected, 'artifact verifier read-only orchestration smoke coverage')
  for (const expected of [
    "operation: 'findAgentTeamWindowTarget'",
    "operation: 'findWindowTargetByName'",
    "operation: 'sessionExists'",
    "request('tmuxAvailability'",
  ]) assertIncludes(protocolCases, expected, 'JSON-RPC protocol read-only orchestration cases')
}

function assertMutationFacadeSourceBoundaries(root) {
  const labels = readRel(root, 'tmux/labels.ts')
  const panes = readRel(root, 'tmux/panes.ts')
  const kernel = readRel(root, 'core/kernel.ts')

  const setPaneLabel = functionBody(labels, 'setPaneLabel')
  assertIncludes(setPaneLabel, 'await createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)', 'setPaneLabel adapter call')
  assertNotIncludes(setPaneLabel, 'runTmux', 'setPaneLabel direct tmux fallback')

  const clearPaneLabel = functionBody(labels, 'clearPaneLabel')
  assertIncludes(clearPaneLabel, 'await createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)', 'clearPaneLabel adapter call')
  assertNotIncludes(clearPaneLabel, 'runTmux', 'clearPaneLabel direct tmux fallback')

  const markWindow = functionBody(labels, 'markWindowAsAgentTeam')
  assertIncludes(markWindow, 'if (!await windowExists(target, signal)) return', 'markWindowAsAgentTeam window guard')
  assertIncludes(markWindow, 'await createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)', 'markWindowAsAgentTeam adapter call')
  assertNotIncludes(markWindow, 'runTmux', 'markWindowAsAgentTeam direct tmux fallback')

  const refreshLabels = functionBody(labels, 'refreshWindowPaneLabels')
  assertIncludes(refreshLabels, 'if (!await windowExists(target, signal)) return', 'refreshWindowPaneLabels window guard')
  assertIncludes(refreshLabels, 'await createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)', 'refreshWindowPaneLabels adapter call')
  assertNotIncludes(refreshLabels, 'runTmux', 'refreshWindowPaneLabels direct tmux fallback')

  const syncLabels = functionBody(labels, 'syncPaneLabelsForTeam')
  assertIncludes(syncLabels, 'await setPaneLabel(member.paneId, member.name === \'team-lead\' ? formatLeaderPaneLabel(team) : formatMemberPaneLabel(member), signal)', 'syncPaneLabelsForTeam set labels')
  assertIncludes(syncLabels, 'const target = member.paneId ? targetForPaneId(member.paneId) : member.windowTarget', 'syncPaneLabelsForTeam target collection')
  assertIncludes(syncLabels, 'await refreshWindowPaneLabels(target, signal)', 'syncPaneLabelsForTeam refresh labels')
  assertNotIncludes(syncLabels, 'createAgentTeamKernelAdapter()', 'syncPaneLabelsForTeam should use local facades only')

  const clearLabels = functionBody(labels, 'clearPaneLabelsForTeam')
  assertIncludes(clearLabels, 'await clearPaneLabel(member.paneId, signal)', 'clearPaneLabelsForTeam clear labels')
  assertIncludes(clearLabels, 'const target = targetForPaneId(member.paneId) ?? member.windowTarget', 'clearPaneLabelsForTeam target fallback')
  assertIncludes(clearLabels, 'await refreshWindowPaneLabels(target, signal)', 'clearPaneLabelsForTeam refresh labels')

  const createPane = functionBody(panes, 'createTeammatePane')
  for (const expected of [
    'const swarm = await ensureSwarmWindow(input.preferred, signal)',
    'createAgentTeamKernelAdapter().createTeammatePaneAsync({',
    'target: swarm.target',
    'leaderPaneId: swarm.leaderPaneId',
    'hasLeaderLayout: Boolean(process.env.TMUX)',
    'cwd: input.cwd',
    'startCommand: input.startCommand',
    "throw new Error(created.reason || 'Go worker lifecycle createTeammatePane unavailable (previous-helper-failure)')",
    'await setPaneLabel(created.paneId, input.name, signal)',
    'await refreshWindowPaneLabels(created.target, signal)',
  ]) assertIncludes(createPane, expected, 'createTeammatePane source boundary')
  assertNotIncludes(createPane, 'send-keys', 'createTeammatePane must not introduce send-keys')
  assertNotIncludes(createPane, 'wake', 'createTeammatePane must not wake panes')

  const killPane = functionBody(panes, 'killPane')
  assertIncludes(killPane, 'createAgentTeamKernelAdapter().killPane(paneId)', 'killPane sync adapter call')
  assertIncludes(killPane, 'catch (_) {}', 'killPane no-throw public facade')
  assertNotIncludes(killPane, 'runTmux', 'killPane direct tmux fallback')

  const clearPaneLabelSync = functionBody(panes, 'clearPaneLabelSync')
  assertIncludes(clearPaneLabelSync, 'createAgentTeamKernelAdapter().clearPaneLabel(paneId)', 'clearPaneLabelSync sync adapter call')
  assertIncludes(clearPaneLabelSync, 'catch (_) {}', 'clearPaneLabelSync no-throw public facade')
  assertNotIncludes(clearPaneLabelSync, 'runTmux', 'clearPaneLabelSync direct tmux fallback')

  for (const expected of [
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'markWindowAsAgentTeam'",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'refreshWindowPaneLabels'",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'setPaneLabel'",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'clearPaneLabel'",
    "callHelper<unknown>('workerLifecycle', { operation: 'clearPaneLabel'",
    "callHelper<unknown>('workerLifecycle', { operation: 'killPane'",
    "operation: 'createTeammatePane'",
  ]) assertIncludes(kernel, expected, 'core/kernel mutating helper calls')
}

function assertGoHelperOperationSurface(root) {
  const goSource = readRel(root, 'kernel/go/agentteam-kernel/main.go')
  for (const operation of EXPECTED_WORKER_LIFECYCLE_OPERATIONS) {
    assertIncludes(goSource, `case "${operation}":`, `Go workerLifecycle operation ${operation}`)
  }
  for (const operation of FORBIDDEN_GO_OPERATION_CASES) {
    assertNotIncludes(goSource, `case "${operation}":`, `Go workerLifecycle forbidden operation ${operation}`)
  }
  for (const snippet of GO_REQUIRED_TMUX_COMMAND_SNIPPETS) assertIncludes(goSource, snippet, 'Go tmux argv surface')
  for (const forbidden of ['"send-keys"', '"respawn-pane"', '"capture-pane"', '"pipe-pane"']) {
    assertNotIncludes(goSource, forbidden, 'Go helper forbidden tmux command surface')
  }
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "kill-pane", "-t", paneID\)/g)].length, 1, 'Go helper should contain exactly one authorized kill-pane command')
  assertIncludes(goSource, 'func runCreateTeammatePaneTmuxOutput(args ...string) (string, string)', 'Go createTeammatePane bounded argv helper')
  assertIncludes(goSource, 'splitArgs := []string{"split-window"}', 'Go createTeammatePane split-window argv construction')
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("select-layout", "-t", target, layout)', 'Go createTeammatePane layout argv')
  assertIncludes(goSource, 'runCreateTeammatePaneTmux("resize-pane", "-t", leaderPaneID, "-x", "66%")', 'Go createTeammatePane resize argv')
  assertIncludes(goSource, 'if startCommand != "" {', 'Go createTeammatePane optional start command handling')
  assertIncludes(goSource, 'splitArgs = append(splitArgs, startCommand)', 'Go createTeammatePane bounded start command append')
  assertIncludes(goSource, 'return unavailableTeammatePaneCreation(target, leaderPaneID, "invalid-start-command")', 'core/kernel invalid start command fail-closed')
}

function assertReadOnlyFacadeDirectGoBehavior(root) {
  if (!hasGoToolchain()) return
  const fakeTmuxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-step6-readonly-facade-tmux-'))
  try {
    writeReadOnlyFacadeFakeTmux(fakeTmuxRoot)
    const env = { PATH: `${fakeTmuxRoot}${path.delimiter}${process.env.PATH || ''}` }
    const inspect = runGoHelper(root, { jsonrpc: '2.0', id: 'inspect-unlabeled', method: 'workerLifecycle', params: { operation: 'inspectPane', paneId: '%unlabeled' } }, env)
    assert.equal(inspect.status, 0, inspect.stderr)
    const inspectResponse = JSON.parse(inspect.stdout.trim())
    assert.equal(inspectResponse.jsonrpc, '2.0')
    assert.equal(inspectResponse.id, 'inspect-unlabeled')
    assertCompactInspectResult(inspectResponse.result)
    assert.equal(inspectResponse.result.ok, true, 'direct Go inspect should succeed for arbitrary unlabeled pane')
    assert.equal(inspectResponse.result.paneId, '%unlabeled', 'direct Go inspect should preserve pane id')
    assert.equal(inspectResponse.result.target, 'session:@9', 'direct Go inspect should expose compact target for binding facades')
    assert.equal(inspectResponse.result.currentCommand, 'bash', 'direct Go inspect should expose compact current command')

    const list = runGoHelper(root, { jsonrpc: '2.0', id: 'list-filtered', method: 'workerLifecycle', params: { operation: 'listAgentTeamPanes' } }, env)
    assert.equal(list.status, 0, list.stderr)
    const listResponse = JSON.parse(list.stdout.trim())
    assert.equal(listResponse.result.ok, true, 'direct Go listAgentTeamPanes should succeed')
    assert.deepEqual(listResponse.result.panes.map(pane => pane.paneId), ['%agentteam', '%worker'], 'direct Go listAgentTeamPanes should keep only labeled agentteam panes')
    assert.equal(Object.prototype.hasOwnProperty.call(listResponse.result.byPaneId, '%unlabeled'), false, 'direct Go listAgentTeamPanes should not use unlabeled panes for arbitrary binding lookup')

    const windowPanes = runGoHelper(root, { jsonrpc: '2.0', id: 'window-panes', method: 'workerLifecycle', params: { operation: 'listPanesInWindow', target: 'team:@1' } }, env)
    assert.equal(windowPanes.status, 0, windowPanes.stderr)
    const windowPanesResponse = JSON.parse(windowPanes.stdout.trim())
    assert.equal(windowPanesResponse.result.ok, true, 'direct Go listPanesInWindow should succeed')
    assert.equal(windowPanesResponse.result.target, 'team:@1')
    assert.deepEqual(windowPanesResponse.result.paneIds, ['%first', '%second'])
    assert.equal(windowPanesResponse.result.readOnly, true)
    assert.equal(windowPanesResponse.result.tmuxMutation, false)

    const availability = runGoHelper(root, { jsonrpc: '2.0', id: 'tmux-available', method: 'tmuxAvailability' }, env)
    assert.equal(availability.status, 0, availability.stderr)
    const availabilityResponse = JSON.parse(availability.stdout.trim())
    assert.equal(availabilityResponse.result.ok, true, 'direct Go tmuxAvailability should succeed')
    assert.equal(availabilityResponse.result.available, true)
    assert.equal(availabilityResponse.result.version, 'tmux 3.4')
    assert.equal(availabilityResponse.result.readOnly, true)
    assert.equal(availabilityResponse.result.tmuxMutation, false)

    const windowTarget = runGoHelper(root, { jsonrpc: '2.0', id: 'window-target', method: 'workerLifecycle', params: { operation: 'findAgentTeamWindowTarget', sessionName: 'team' } }, env)
    assert.equal(windowTarget.status, 0, windowTarget.stderr)
    const windowTargetResponse = JSON.parse(windowTarget.stdout.trim())
    assert.equal(windowTargetResponse.result.ok, true, 'direct Go findAgentTeamWindowTarget should find marked window')
    assert.equal(windowTargetResponse.result.target, 'team:@7')
    assert.equal(windowTargetResponse.result.windowId, '@7')
    assert.equal(windowTargetResponse.result.readOnly, true)

    const sessionExists = runGoHelper(root, { jsonrpc: '2.0', id: 'session-exists', method: 'workerLifecycle', params: { operation: 'sessionExists', sessionName: 'team' } }, env)
    assert.equal(sessionExists.status, 0, sessionExists.stderr)
    const sessionExistsResponse = JSON.parse(sessionExists.stdout.trim())
    assert.equal(sessionExistsResponse.result.ok, true, 'direct Go sessionExists should succeed')
    assert.equal(sessionExistsResponse.result.exists, true)
    assert.equal(sessionExistsResponse.result.sessionName, 'team')

    const windowName = runGoHelper(root, { jsonrpc: '2.0', id: 'window-name', method: 'workerLifecycle', params: { operation: 'findWindowTargetByName', sessionName: 'team', windowName: 'agentteam' } }, env)
    assert.equal(windowName.status, 0, windowName.stderr)
    const windowNameResponse = JSON.parse(windowName.stdout.trim())
    assert.equal(windowNameResponse.result.ok, true, 'direct Go findWindowTargetByName should find named window')
    assert.equal(windowNameResponse.result.target, 'team:@7')
    assert.equal(windowNameResponse.result.windowName, 'agentteam')

    const invalidWindowPanes = runGoHelper(root, { jsonrpc: '2.0', id: 'window-panes-invalid', method: 'workerLifecycle', params: { operation: 'listPanesInWindow', target: 'bad target' } }, env)
    const invalidWindowPanesResponse = JSON.parse(invalidWindowPanes.stdout.trim())
    assert.equal(invalidWindowPanesResponse.result.ok, false, 'direct Go listPanesInWindow invalid target should fail closed')
    assert.equal(invalidWindowPanesResponse.result.failureKind, 'invalid-target')

    const missingSession = runGoHelper(root, { jsonrpc: '2.0', id: 'session-missing', method: 'workerLifecycle', params: { operation: 'sessionExists', sessionName: 'missing' } }, env)
    const missingSessionResponse = JSON.parse(missingSession.stdout.trim())
    assert.equal(missingSessionResponse.result.ok, false, 'direct Go sessionExists missing session should fail closed')
    assert.equal(missingSessionResponse.result.exists, false)
    assert.equal(/stdout|stderr|stack|MAILBOX_BODY|REPORT_BODY|worker transcript/i.test(JSON.stringify(missingSessionResponse.result)), false, 'direct Go sessionExists failure should stay compact')
  } finally {
    fs.rmSync(fakeTmuxRoot, { recursive: true, force: true })
  }
}

function assertPackageNativeBoundaries(root) {
  const packageJson = assertPackageNoReleaseGuards(root, { expectedVersion: '0.6.8', expectedPiExtensions: ['./index.ts'] })
  assert.equal(packageJson.scripts?.check?.includes('npm run test:regression'), true, 'package check must keep full regression coverage')
  assert.equal(packageJson.scripts?.check?.includes('npm test'), false, 'package check must not demote to default tests only')
  assertNoRawOrReleaseArtifacts(root)
  const nativeRoot = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
  const manifest = readJsonRel(root, `${nativeRoot}/manifest.json`)
  const provenance = readJsonRel(root, `${nativeRoot}/provenance.json`)
  const checksums = readRel(root, `${nativeRoot}/SHA256SUMS`)
  const attestation = readRel(root, `${nativeRoot}/attestation.intoto.jsonl`)
  assert.equal(manifest.module, 'tmuxSnapshotParse', 'approved embedded helper module should remain tmuxSnapshotParse')
  assert.equal(manifest.helperVersion, '0.3.0-read-model-shadow', 'approved embedded helper version should remain stable')
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse', 'approved embedded helper artifact filename should remain stable')
  assert.ok(manifest.capabilities.includes('workerLifecycle'), 'embedded helper manifest should include workerLifecycle capability')
  assert.ok(manifest.capabilities.includes('tmuxAvailability'), 'embedded helper manifest should include tmuxAvailability capability')
  assert.deepEqual(provenance.smoke.workerLifecycleInspectPane.acceptedFailureKinds, ['pane-not-found', 'tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'], 'embedded helper provenance should preserve compact inspect failure kinds')
  assertIncludes(checksums, `${nativeRoot}/agentteam-tmuxSnapshotParse`, 'embedded helper checksum list')
  assertIncludes(checksums, `${nativeRoot}/manifest.json`, 'embedded helper checksum list')
  assertIncludes(checksums, `${nativeRoot}/provenance.json`, 'embedded helper checksum list')
  assertIncludes(checksums, `${nativeRoot}/attestation.intoto.jsonl`, 'embedded helper checksum list')
  assertIncludes(attestation, 'placeholderOnly', 'embedded helper attestation should remain placeholder-only')
}

function assertHistoricalRetention(root) {
  assertEveryRelExists(root, GO_TMUX_CUTOVER_BATCH3_SOURCE_FILES, 'Step 6 batch 3 current guard source files')
  assertEveryRelExists(root, STEP6_BATCH3_RETAINED_SUITES, 'Step 6 retained suites')
  assertEveryRelAbsent(root, STEP6_BATCH3_DELETION_CANDIDATE_SUITES, 'Step 6 batch 1/2 deleted read-only facade/orchestration suites')
  assertEveryRelExists(root, STEP6_BATCH3_SCOPE_DOCS, 'Step 6 retained docs')
  assertEveryRelExists(root, STEP6_BATCH3_SCOPE_FIXTURES, 'Step 6 batch 3 retained fixtures')
  assertEveryRelAbsent(root, HISTORICAL_CHECKPOINT_T024_DELETED_SUITES, 'T024 historical deletions')
  assertEveryRelAbsent(root, HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES, 'T034 Step5C historical deletions')
  assertEveryRelAbsent(root, HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES, 'T024/T034/T036 ready-deleted suites')
}

function assertGoTmuxCutoverBatch3RuntimeSeam(requireDist) {
  if (typeof requireDist !== 'function') return
  const kernel = requireDist('core/kernel.js')
  const tmuxCore = requireDist('tmux/core.js')
  const tmuxPanes = requireDist('tmux/panes.js')
  const original = kernel.createAgentTeamKernelAdapter
  const calls = []
  const panes = [{ paneId: '%1', target: 'pi-agentteam:agentteam.1', label: 'team-lead', currentCommand: 'pi' }]
  let inspectMode = 'success'
  const inspectSuccess = paneId => ({ ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId: '%resolved', requestedPaneId: paneId, exists: true, target: 'pi-agentteam:agentteam.1', currentCommand: 'pi', inMode: true, mode: 'copy-mode', copyMode: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })
  const inspectMissingTarget = paneId => ({ ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId, requestedPaneId: paneId, exists: true, currentCommand: 'pi', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })
  const inspectFailure = paneId => ({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId, requestedPaneId: paneId, exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'compact unavailable', error: 'compact unavailable', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })
  try {
    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPane(paneId) {
        calls.push(['inspectWorkerPane', paneId, inspectMode])
        if (inspectMode === 'missing-target') return inspectMissingTarget(paneId)
        if (inspectMode === 'failure') return inspectFailure(paneId)
        return inspectSuccess(paneId)
      },
      inspectWorkerPaneAsync(paneId) {
        calls.push(['inspectWorkerPaneAsync', paneId, inspectMode])
        return Promise.resolve(inspectMode === 'failure' ? inspectFailure(paneId) : inspectMode === 'missing-target' ? inspectMissingTarget(paneId) : inspectSuccess(paneId))
      },
      listAgentTeamPanes() {
        calls.push(['listAgentTeamPanes'])
        return { ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes, byPaneId: { '%1': panes[0] }, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }
      },
      killPane(paneId) {
        calls.push(['killPane', paneId])
        return { ok: true, operation: 'killPane', capability: 'workerLifecycle', paneId, readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }
      },
      clearPaneLabel(paneId) {
        calls.push(['clearPaneLabel', paneId])
        return { ok: true, operation: 'clearPaneLabel', capability: 'workerLifecycle', paneId, readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }
      },
    })
    assert.deepEqual(tmuxCore.listAgentTeamPanes(), panes)
    assert.deepEqual(tmuxCore.inspectPane('%inspect'), { paneId: '%resolved', exists: true, currentCommand: 'pi', inMode: true, mode: 'copy-mode', copyMode: true })
    assert.equal(tmuxCore.paneExists('%exists'), true)
    assert.deepEqual(tmuxCore.resolvePaneBinding('%binding'), { paneId: '%resolved', target: 'pi-agentteam:agentteam.1' })
    assert.equal(tmuxCore.targetForPaneId('%target'), 'pi-agentteam:agentteam.1')
    inspectMode = 'missing-target'
    assert.equal(tmuxCore.resolvePaneBinding('%missing-target'), null)
    assert.equal(tmuxCore.targetForPaneId('%missing-target'), null)
    inspectMode = 'failure'
    assert.deepEqual(tmuxCore.inspectPane('%missing'), { paneId: '%missing', exists: false, error: 'compact unavailable' })
    assert.equal(tmuxCore.paneExists('%missing'), false)
    assert.equal(tmuxCore.paneExists(''), false)
    assert.equal(tmuxCore.resolvePaneBinding('%missing'), null)
    assert.equal(tmuxCore.resolvePaneBinding(''), null)
    assert.equal(tmuxCore.targetForPaneId('%missing'), null)
    assert.equal(tmuxCore.targetForPaneId(''), null)
    assert.doesNotThrow(() => tmuxPanes.killPane('%1'))
    assert.doesNotThrow(() => tmuxPanes.clearPaneLabelSync('%1'))
    assert.equal(calls.filter(call => call[0] === 'listAgentTeamPanes').length, 1, 'runtime seam should call listAgentTeamPanes once')
    assert.equal(calls.filter(call => call[0] === 'inspectWorkerPane').length, 10, 'runtime seam should route read-only pane facade wrappers through inspectWorkerPane')
    assert.deepEqual(calls.slice(-2).map(call => call[0]), ['killPane', 'clearPaneLabel'], 'runtime seam should keep mutation wrappers separate')
  } finally {
    kernel.createAgentTeamKernelAdapter = original
  }
}

function clearDistModules(distRoot, rels) {
  for (const rel of rels) {
    const full = path.join(distRoot, rel)
    delete require.cache[require.resolve(full)]
  }
}

async function withPatchedWindowDeps({ distRoot, insideTmux, corePatch = {}, kernelAdapterPatch = {} }, callback) {
  const corePath = path.join(distRoot, 'tmux/core.js')
  const kernelPath = path.join(distRoot, 'core/kernel.js')
  const windowsPath = path.join(distRoot, 'tmux/windows.js')
  const labelsPath = path.join(distRoot, 'tmux/labels.js')
  const clientPath = path.join(distRoot, 'tmux/client.js')
  clearDistModules(distRoot, ['tmux/windows.js'])
  const core = require(corePath)
  const kernel = require(kernelPath)
  const labels = require(labelsPath)
  const client = require(clientPath)
  const originals = {
    TMUX: process.env.TMUX,
    ensureTmuxAvailable: core.ensureTmuxAvailable,
    isInsideTmux: core.isInsideTmux,
    resolvePaneBindingAsync: core.resolvePaneBindingAsync,
    windowExists: core.windowExists,
    firstPaneInWindow: core.firstPaneInWindow,
    captureCurrentPaneBinding: core.captureCurrentPaneBinding,
    createAgentTeamKernelAdapter: kernel.createAgentTeamKernelAdapter,
    markWindowAsAgentTeam: labels.markWindowAsAgentTeam,
    refreshWindowPaneLabels: labels.refreshWindowPaneLabels,
  }
  const tmuxCalls = []
  const markCalls = []
  const refreshCalls = []
  const adapterCalls = []
  Object.assign(core, corePatch)
  kernel.createAgentTeamKernelAdapter = () => ({
    sessionExistsAsync: async (sessionName, signal) => {
      adapterCalls.push({ operation: 'sessionExists', sessionName, signal })
      return { ok: true, operation: 'sessionExists', capability: 'workerLifecycle', sessionName, exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }
    },
    findAgentTeamWindowTargetAsync: async (sessionName, signal) => {
      adapterCalls.push({ operation: 'findAgentTeamWindowTarget', sessionName, signal })
      return { ok: true, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', sessionName, exists: true, target: `${sessionName}:@7`, windowId: '@7', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }
    },
    createDetachedSwarmSessionAsync: async (sessionName, windowName, signal) => {
      adapterCalls.push({ operation: 'createDetachedSwarmSession', sessionName, windowName, signal })
      return { ok: true, operation: 'createDetachedSwarmSession', capability: 'workerLifecycle', sessionName, windowName, created: true, readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }
    },
    createDetachedSwarmWindowAsync: async (sessionName, windowName, signal) => {
      adapterCalls.push({ operation: 'createDetachedSwarmWindow', sessionName, windowName, signal })
      return { ok: true, operation: 'createDetachedSwarmWindow', capability: 'workerLifecycle', sessionName, windowName, created: true, readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }
    },
    findWindowTargetByNameAsync: async (sessionName, windowName, signal) => {
      adapterCalls.push({ operation: 'findWindowTargetByName', sessionName, windowName, signal })
      return { ok: true, operation: 'findWindowTargetByName', capability: 'workerLifecycle', sessionName, windowName, exists: true, target: `${sessionName}:@7`, windowId: '@7', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }
    },
    ...kernelAdapterPatch,
  })
  labels.markWindowAsAgentTeam = async (target, signal) => { markCalls.push({ target, signal }) }
  labels.refreshWindowPaneLabels = async (target, signal) => { refreshCalls.push({ target, signal }) }
  const fakeClient = {
    exec() { throw new Error('sync tmux should not be used') },
    execNoThrow() { return { ok: false, stdout: '', stderr: 'sync tmux should not be used' } },
    async execAsync(args) {
      tmuxCalls.push(args)
      throw new Error(`unexpected direct tmux call: ${args.join(' ')}`)
    },
    async execNoThrowAsync(args) {
      tmuxCalls.push(args)
      return { ok: false, stdout: '', stderr: `unexpected direct tmux call: ${args.join(' ')}` }
    },
  }
  try {
    if (insideTmux) process.env.TMUX = '/tmp/agentteam-step6-runtime-tmux'
    else delete process.env.TMUX
    return await client.withTmuxClientForTests(fakeClient, async () => {
      clearDistModules(distRoot, ['tmux/windows.js'])
      const windows = require(windowsPath)
      return callback({ windows, tmuxCalls, markCalls, refreshCalls, adapterCalls })
    })
  } finally {
    core.ensureTmuxAvailable = originals.ensureTmuxAvailable
    core.isInsideTmux = originals.isInsideTmux
    core.resolvePaneBindingAsync = originals.resolvePaneBindingAsync
    core.windowExists = originals.windowExists
    core.firstPaneInWindow = originals.firstPaneInWindow
    core.captureCurrentPaneBinding = originals.captureCurrentPaneBinding
    kernel.createAgentTeamKernelAdapter = originals.createAgentTeamKernelAdapter
    labels.markWindowAsAgentTeam = originals.markWindowAsAgentTeam
    labels.refreshWindowPaneLabels = originals.refreshWindowPaneLabels
    if (originals.TMUX === undefined) delete process.env.TMUX
    else process.env.TMUX = originals.TMUX
    delete require.cache[require.resolve(windowsPath)]
  }
}

async function assertReadOnlyWindowSessionOrchestrationRuntimeSeam({ requireDist, distRoot } = {}) {
  if (typeof requireDist !== 'function' || !distRoot) return
  const kernel = requireDist('core/kernel.js')
  const tmuxCore = requireDist('tmux/core.js')
  const tmuxProcess = requireDist('tmux/process.js')
  const original = kernel.createAgentTeamKernelAdapter
  try {
    const signal = new AbortController().signal
    let paneListCalls = 0
    kernel.createAgentTeamKernelAdapter = () => ({
      listPanesInWindowAsync: async (target, receivedSignal) => {
        paneListCalls += 1
        assert.equal(target, 'team:@1')
        assert.equal(receivedSignal, signal)
        return { ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target, exists: true, paneIds: ['%first', '%second'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }
      },
    })
    assert.equal(await tmuxCore.windowExists('team:@1', signal), true)
    assert.equal(await tmuxCore.firstPaneInWindow('team:@1', signal), '%first')
    assert.equal(paneListCalls, 2, 'windowExists and firstPaneInWindow should share listPanesInWindowAsync')

    let emptyTargetCalls = 0
    kernel.createAgentTeamKernelAdapter = () => ({ listPanesInWindowAsync: async () => { emptyTargetCalls += 1; throw new Error('empty target must avoid helper') } })
    assert.equal(await tmuxCore.windowExists(''), false)
    assert.equal(await tmuxCore.firstPaneInWindow(''), null)
    assert.equal(emptyTargetCalls, 0, 'empty window target should avoid helper')

    kernel.createAgentTeamKernelAdapter = () => ({ listPanesInWindowAsync: async target => ({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target, exists: true, paneIds: [], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) })
    assert.equal(await tmuxCore.windowExists('team:@1'), true)
    assert.equal(await tmuxCore.firstPaneInWindow('team:@1'), null)
    kernel.createAgentTeamKernelAdapter = () => ({ listPanesInWindowAsync: async target => ({ ok: false, operation: 'listPanesInWindow', capability: 'workerLifecycle', target, exists: false, paneIds: [], failureKind: 'tmux-command-failed', reason: 'compact unavailable', error: 'compact unavailable', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) })
    assert.equal(await tmuxCore.windowExists('team:@1'), false)
    assert.equal(await tmuxCore.firstPaneInWindow('team:@1'), null)

    let availabilitySignals = []
    kernel.createAgentTeamKernelAdapter = () => ({
      checkTmuxAvailableAsync: async receivedSignal => {
        availabilitySignals.push(receivedSignal)
        return { ok: true, capability: 'tmuxAvailability', available: true, version: 'tmux 3.4', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }
      },
    })
    assert.equal(await tmuxCore.ensureTmuxAvailable(signal), undefined)
    assert.deepEqual(availabilitySignals, [signal])
    kernel.createAgentTeamKernelAdapter = () => ({ checkTmuxAvailableAsync: async () => ({ ok: false, capability: 'tmuxAvailability', available: false, failureKind: 'tmux-unavailable', reason: 'compact unavailable', error: 'RAW_STDERR_SHOULD_NOT_LEAK', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) })
    await assert.rejects(() => tmuxCore.ensureTmuxAvailable(), error => {
      assert.equal(error instanceof Error, true)
      assert.match(error.message, /^tmux is required for agentteam panes \(tmux-unavailable\)$/)
      assert.equal(/RAW_STDERR|stdout|stderr|stack|MAILBOX_BODY|REPORT_BODY|worker transcript/i.test(error.message), false)
      return true
    })

    let inspectCalls = []
    kernel.createAgentTeamKernelAdapter = () => ({ inspectWorkerPaneAsync: async (paneId, receivedSignal) => { inspectCalls.push({ paneId, signal: receivedSignal }); return { ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId, exists: true, currentCommand: 'node', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false } } })
    assert.equal(await tmuxProcess.waitForPaneAppStart('%node', 1000, signal), true)
    assert.deepEqual(inspectCalls, [{ paneId: '%node', signal }])
    let shellCalls = 0
    kernel.createAgentTeamKernelAdapter = () => ({ inspectWorkerPaneAsync: async paneId => { shellCalls += 1; return { ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId, exists: true, currentCommand: 'bash', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false } } })
    assert.equal(await tmuxProcess.waitForPaneAppStart('%shell', 1), false)
    assert.ok(shellCalls >= 1, 'shell commands should keep polling until timeout')
    kernel.createAgentTeamKernelAdapter = () => ({ inspectWorkerPaneAsync: async paneId => ({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId, exists: false, failureKind: 'pane-not-found', reason: 'compact unavailable', error: 'compact unavailable', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) })
    assert.equal(await tmuxProcess.waitForPaneAppStart('%missing', 1), false)
    let emptyPaneCalls = 0
    kernel.createAgentTeamKernelAdapter = () => ({ inspectWorkerPaneAsync: async () => { emptyPaneCalls += 1; throw new Error('empty pane id must avoid helper') } })
    assert.equal(await tmuxProcess.waitForPaneAppStart('', 100), false)
    assert.equal(emptyPaneCalls, 0)
    const preAbort = new AbortController()
    preAbort.abort()
    assert.equal(await tmuxProcess.waitForPaneAppStart('%preabort', 100, preAbort.signal), false)
    const inFlightAbort = new AbortController()
    let inFlightCalls = 0
    kernel.createAgentTeamKernelAdapter = () => ({ inspectWorkerPaneAsync: async paneId => { inFlightCalls += 1; inFlightAbort.abort(); return { ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId, exists: true, currentCommand: 'bash', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false } } })
    assert.equal(await tmuxProcess.waitForPaneAppStart('%inflight', 100, inFlightAbort.signal), false)
    assert.equal(inFlightCalls, 1)
  } finally {
    kernel.createAgentTeamKernelAdapter = original
  }

  let captureCalls = 0
  await withPatchedWindowDeps({
    distRoot,
    insideTmux: true,
    corePatch: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => true,
      resolvePaneBindingAsync: async () => null,
      windowExists: async () => false,
      firstPaneInWindow: async () => null,
      captureCurrentPaneBinding: () => { captureCalls += 1; return { paneId: '%current', target: 'current-session:@7' } },
    },
  }, async ({ windows, tmuxCalls, markCalls, refreshCalls }) => {
    const result = await windows.ensureSwarmWindow()
    assert.deepEqual(result, { session: 'current-session', window: '@7', target: 'current-session:@7', leaderPaneId: '%current' })
    assert.equal(captureCalls, 1, 'current binding fallback should be captured once and reused')
    assert.deepEqual(tmuxCalls, [], 'inside-tmux current binding fallback should not use direct TypeScript display-message calls')
    assert.deepEqual(markCalls.map(call => call.target), ['current-session:@7'])
    assert.deepEqual(refreshCalls.map(call => call.target), ['current-session:@7'])
  })

  captureCalls = 0
  await withPatchedWindowDeps({
    distRoot,
    insideTmux: true,
    corePatch: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => true,
      resolvePaneBindingAsync: async paneId => ({ paneId, target: 'preferred-session:@3' }),
      windowExists: async () => false,
      firstPaneInWindow: async () => { throw new Error('preferred binding should avoid first-pane lookup') },
      captureCurrentPaneBinding: () => { captureCalls += 1; return { paneId: '%current', target: 'current-session:@7' } },
    },
  }, async ({ windows, tmuxCalls }) => {
    const result = await windows.ensureSwarmWindow({ leaderPaneId: '%preferred' })
    assert.deepEqual(result, { session: 'preferred-session', window: '@3', target: 'preferred-session:@3', leaderPaneId: '%preferred' })
    assert.equal(captureCalls, 0, 'preferred binding should win before current binding fallback')
    assert.deepEqual(tmuxCalls, [], 'preferred binding path should not use direct tmux calls')
  })

  await withPatchedWindowDeps({
    distRoot,
    insideTmux: false,
    corePatch: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => false,
      firstPaneInWindow: async target => (target === 'pi-agentteam:@7' ? '%leader' : null),
      resolvePaneBindingAsync: async paneId => ({ paneId, target: 'detached-session:@7' }),
    },
  }, async ({ windows, tmuxCalls, markCalls, refreshCalls, adapterCalls }) => {
    const result = await windows.ensureSwarmWindow()
    assert.deepEqual(result, { session: 'detached-session', window: '@7', target: 'detached-session:@7', leaderPaneId: '%leader' })
    assert.deepEqual(tmuxCalls, [], 'detached discovery/first-pane/binding path should not use direct TypeScript tmux calls')
    assert.deepEqual(adapterCalls.map(call => call.operation), ['sessionExists', 'findAgentTeamWindowTarget'])
    assert.deepEqual(markCalls.map(call => call.target), ['detached-session:@7'])
    assert.deepEqual(refreshCalls.map(call => call.target), ['detached-session:@7'])
  })

  await withPatchedWindowDeps({
    distRoot,
    insideTmux: false,
    corePatch: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => false,
      firstPaneInWindow: async target => (target === 'pi-agentteam:@7' ? '%leader' : null),
      resolvePaneBindingAsync: async () => null,
    },
  }, async ({ windows, tmuxCalls }) => {
    await assert.rejects(() => windows.ensureSwarmWindow(), error => {
      assert.equal(error instanceof Error, true)
      assert.equal(error.message, 'Failed to resolve agentteam leader pane binding')
      return true
    })
    assert.deepEqual(tmuxCalls, [], 'missing detached binding should not use target-based display-message fallback')
  })

  await withPatchedWindowDeps({
    distRoot,
    insideTmux: false,
    corePatch: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => false,
      firstPaneInWindow: async () => null,
      resolvePaneBindingAsync: async () => { throw new Error('resolvePaneBindingAsync should not run without first pane') },
    },
  }, async ({ windows, tmuxCalls }) => {
    await assert.rejects(() => windows.ensureSwarmWindow(), error => {
      assert.equal(error instanceof Error, true)
      assert.equal(error.message, 'Failed to resolve agentteam leader pane')
      return true
    })
    assert.deepEqual(tmuxCalls, [], 'missing detached first pane should not use direct list-panes fallback')
  })

  await withPatchedWindowDeps({
    distRoot,
    insideTmux: false,
    corePatch: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => false,
      firstPaneInWindow: async target => (target === 'pi-agentteam:@7' ? '%leader' : null),
      resolvePaneBindingAsync: async paneId => ({ paneId, target: 'detached-session:@7' }),
    },
    kernelAdapterPatch: {
      findAgentTeamWindowTargetAsync: async () => ({ ok: false, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', exists: false, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
    },
  }, async ({ windows, tmuxCalls, markCalls, refreshCalls, adapterCalls }) => {
    const result = await windows.ensureSwarmWindow()
    assert.deepEqual(result, { session: 'detached-session', window: '@7', target: 'detached-session:@7', leaderPaneId: '%leader' })
    assert.deepEqual(tmuxCalls, [], 'post-creation window-name lookup should not use direct list-windows parsing')
    assert.deepEqual(adapterCalls.map(call => call.operation), ['sessionExists', 'createDetachedSwarmWindow', 'findWindowTargetByName'])
    assert.deepEqual(markCalls.map(call => call.target), ['pi-agentteam:@7', 'detached-session:@7'])
    assert.deepEqual(refreshCalls.map(call => call.target), ['detached-session:@7'])
  })

  await withPatchedWindowDeps({
    distRoot,
    insideTmux: false,
    corePatch: {
      ensureTmuxAvailable: async () => {},
      isInsideTmux: () => false,
      firstPaneInWindow: async () => { throw new Error('firstPaneInWindow should not run without post-creation target') },
      resolvePaneBindingAsync: async () => { throw new Error('resolvePaneBindingAsync should not run without post-creation target') },
    },
    kernelAdapterPatch: {
      findAgentTeamWindowTargetAsync: async () => ({ ok: false, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', exists: false, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
      findWindowTargetByNameAsync: async () => ({ ok: false, operation: 'findWindowTargetByName', capability: 'workerLifecycle', exists: false, failureKind: 'pane-not-found', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }),
    },
  }, async ({ windows, tmuxCalls }) => {
    await assert.rejects(() => windows.ensureSwarmWindow(), error => {
      assert.equal(error instanceof Error, true)
      assert.equal(error.message, 'Failed to locate agentteam tmux window after creation')
      return true
    })
    assert.deepEqual(tmuxCalls, [], 'missing post-creation window should not use hidden direct tmux fallback')
  })
}

async function assertGoTmuxCutoverBatch3Guard({ repoRoot, requireDist, distRoot } = {}) {
  const root = repoRoot || process.cwd()
  assertStep6Batch3AuditMap(root)
  assertReadOnlyFacadeSourceBoundaries(root)
  assertMutationFacadeSourceBoundaries(root)
  assertGoHelperOperationSurface(root)
  assertReadOnlyFacadeDirectGoBehavior(root)
  assertPackageNativeBoundaries(root)
  assertHistoricalRetention(root)
  assertGoTmuxCutoverBatch3RuntimeSeam(requireDist)
  await assertReadOnlyWindowSessionOrchestrationRuntimeSeam({ requireDist, distRoot })
}

module.exports = {
  GO_TMUX_CUTOVER_BATCH3_CATEGORY_DESCRIPTIONS,
  GO_TMUX_CUTOVER_BATCH3_GUARD_CATEGORIES,
  GO_TMUX_CUTOVER_BATCH3_GUARD_HELPER,
  GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE,
  GO_TMUX_CUTOVER_BATCH3_SOURCE_FILES,
  assertGoTmuxCutoverBatch3Guard,
  assertGoTmuxCutoverBatch3RuntimeSeam,
  assertGoHelperOperationSurface,
  assertHistoricalRetention,
  assertReadOnlyFacadeDirectGoBehavior,
  assertReadOnlyWindowSessionOrchestrationRuntimeSeam,
  assertMutationFacadeSourceBoundaries,
  assertPackageNativeBoundaries,
  assertReadOnlyFacadeSourceBoundaries,
  assertStep6Batch3AuditMap,
}
