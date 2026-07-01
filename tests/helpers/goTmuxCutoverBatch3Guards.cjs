const assert = require('node:assert/strict')
const path = require('node:path')
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
  'historical-suite-retention-honest': 'No v0.6.53-v0.6.88 suite is deleted in this batch because every audited suite keeps behavior-unique assertions; T024/T034 deleted suites remain absent.',
})

const GO_TMUX_CUTOVER_BATCH3_SOURCE_FILES = Object.freeze([
  'tmux/core.ts',
  'tmux/process.ts',
  'tmux/windows.ts',
  'tmux/labels.ts',
  'tmux/panes.ts',
  'core/kernel.ts',
  'kernel/go/agentteam-kernel/main.go',
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

function assertStep6Batch3AuditMap(root) {
  assert.equal(path.basename(GO_TMUX_CUTOVER_BATCH3_GUARD_HELPER), 'goTmuxCutoverBatch3Guards.cjs')
  assert.equal(path.basename(GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE), 'go-kernel-tmux-cutover-batch3-guard.cjs')
  assert.deepEqual(STEP6_BATCH3_ACTIONS, ['keep-unique', 'split-later', 'delete-replaced'])
  assert.equal(STEP6_BATCH3_AUDIT_ENTRIES.length, 36, 'Step 6 batch 3 audit map should cover v0.6.53-v0.6.88')
  assert.deepEqual(STEP6_BATCH3_CLUSTER_COUNTS, EXPECTED_CLUSTER_COUNTS, 'Step 6 batch 3 cluster counts should be explicit')
  assert.deepEqual(STEP6_BATCH3_DELETION_CANDIDATE_SUITES, [], 'Step 6 batch 3 should not mark deletion candidates without behavior parity')
  assert.equal(STEP6_BATCH3_RETAINED_SUITES.length, STEP6_BATCH3_AUDIT_ENTRIES.length, 'retained suite list should match audit entries')
  assert.equal(STEP6_BATCH3_SCOPE_DOCS.length, STEP6_BATCH3_AUDIT_ENTRIES.length, 'scope docs should match audit entries')
  assert.equal(STEP6_BATCH3_SCOPE_FIXTURES.length, STEP6_BATCH3_AUDIT_ENTRIES.length, 'scope fixtures should match audit entries')
  assertUnique(STEP6_BATCH3_RETAINED_SUITES, 'Step 6 retained suites')
  assertUnique(STEP6_BATCH3_SCOPE_DOCS, 'Step 6 scope docs')
  assertUnique(STEP6_BATCH3_SCOPE_FIXTURES, 'Step 6 scope fixtures')

  for (const [cluster, definition] of Object.entries(STEP6_BATCH3_CLUSTERS)) {
    assert.equal(STEP6_BATCH3_CLUSTER_COUNTS[cluster], definition.expectedSuiteCount, `${cluster} suite count should match cluster definition`)
    assert.equal(definition.recommendedAction, 'keep-unique', `${cluster} should stay keep-unique in this conservative batch`)
    assert.ok(definition.rationale.length >= 40, `${cluster} rationale should explain retention`)
  }

  const validClusters = new Set(Object.keys(STEP6_BATCH3_CLUSTERS))
  for (const entry of STEP6_BATCH3_AUDIT_ENTRIES) {
    assert.ok(validClusters.has(entry.cluster), `${entry.suite} should use a known cluster`)
    assert.equal(entry.recommendedAction, 'keep-unique', `${entry.suite} should remain keep-unique in this batch`)
    assert.equal(entry.deletionReady, false, `${entry.suite} should not be deletion-ready in this batch`)
    assert.ok(entry.duplicateAssertions.length >= 5, `${entry.suite} should document duplicate assertion clusters`)
    assert.ok(entry.uniqueAssertions.length >= 1, `${entry.suite} should document behavior-unique assertions`)
    assert.ok(entry.replacementEvidence.length >= 1, `${entry.suite} should cite current guard evidence for duplicated assertions`)
    assert.equal(entry.replacementEvidence[0].suite, GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE, `${entry.suite} should point to this guard suite`)
    assert.equal(entry.replacementEvidence[0].helper, GO_TMUX_CUTOVER_BATCH3_GUARD_HELPER, `${entry.suite} should point to this guard helper`)
    assert.ok(entry.replacementEvidence[0].categories.length >= 1, `${entry.suite} replacement evidence should list categories`)
    assert.equal(existsRel(root, entry.suite), true, `${entry.suite} should remain present; Step 6 batch 3 made no deletions`)
    assert.equal(existsRel(root, entry.doc), true, `${entry.doc} should remain present; Step 6 must not delete docs`)
    assert.equal(existsRel(root, entry.fixture), true, `${entry.fixture} should remain present; Step 6 must not delete fixtures`)
  }
}

function assertReadOnlyFacadeSourceBoundaries(root) {
  const core = readRel(root, 'tmux/core.ts')
  const processSource = readRel(root, 'tmux/process.ts')
  const windows = readRel(root, 'tmux/windows.ts')
  const kernel = readRel(root, 'core/kernel.ts')

  assertIncludes(core, "import { createAgentTeamKernelAdapter } from '../core/kernel.js'", 'tmux/core import')

  const ensureAvailable = functionBody(core, 'ensureTmuxAvailable')
  assertIncludes(ensureAvailable, 'createAgentTeamKernelAdapter().checkTmuxAvailableAsync(signal)', 'ensureTmuxAvailable adapter call')
  assertIncludes(ensureAvailable, "throw new Error(`tmux is required for agentteam panes${suffix}`)", 'ensureTmuxAvailable compact throw')
  assertNotIncludes(ensureAvailable, 'runTmux', 'ensureTmuxAvailable direct tmux fallback')

  const inspect = functionBody(core, 'inspectPane')
  assertIncludes(inspect, 'createAgentTeamKernelAdapter().inspectWorkerPane(paneId)', 'inspectPane adapter call')
  assertIncludes(inspect, 'exists: false', 'inspectPane fail-closed')
  assertNotIncludes(inspect, 'display-message', 'inspectPane direct tmux fallback')
  assertNotIncludes(inspect, 'runTmux', 'inspectPane direct tmux fallback')

  const paneExists = functionBody(core, 'paneExists')
  assertIncludes(paneExists, 'return Boolean(paneId && inspectPane(paneId).exists)', 'paneExists inspect wrapper')
  assertNotIncludes(paneExists, 'createAgentTeamKernelAdapter()', 'paneExists should not create a new helper operation')

  const resolveBinding = functionBody(core, 'resolvePaneBinding')
  assertIncludes(resolveBinding, 'const result = createAgentTeamKernelAdapter().inspectWorkerPane(paneId)', 'resolvePaneBinding inspect adapter')
  assertIncludes(resolveBinding, 'if (!result.ok || !result.target) return null', 'resolvePaneBinding fail closed')
  assertNotIncludes(resolveBinding, 'listAgentTeamPanes', 'resolvePaneBinding must not use label-filtered pane list')

  const resolveBindingAsync = functionBody(core, 'resolvePaneBindingAsync')
  assertIncludes(resolveBindingAsync, 'await createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)', 'resolvePaneBindingAsync async inspect adapter')
  assertIncludes(resolveBindingAsync, 'if (!result.ok || !result.target) return null', 'resolvePaneBindingAsync fail closed')

  const windowExists = functionBody(core, 'windowExists')
  assertIncludes(windowExists, 'await createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)', 'windowExists adapter call')
  assertIncludes(windowExists, 'return result.ok', 'windowExists boolean result')
  assertNotIncludes(windowExists, 'runTmux', 'windowExists direct tmux fallback')

  const firstPaneInWindow = functionBody(core, 'firstPaneInWindow')
  assertIncludes(firstPaneInWindow, 'await createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)', 'firstPaneInWindow adapter call')
  assertIncludes(firstPaneInWindow, 'if (!result.ok || result.paneIds.length === 0) return null', 'firstPaneInWindow fail closed')

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

  const wait = functionBody(processSource, 'waitForPaneAppStart')
  assertIncludes(wait, 'const kernel = createAgentTeamKernelAdapter()', 'waitForPaneAppStart adapter capture')
  assertIncludes(wait, 'kernel.inspectWorkerPaneAsync(paneId, signal).catch(() => undefined)', 'waitForPaneAppStart inspect polling')
  assertIncludes(wait, 'SHELL_COMMANDS.has(command)', 'waitForPaneAppStart shell exclusion')
  assertNotIncludes(wait, 'display-message', 'waitForPaneAppStart direct tmux fallback')

  const findAgentWindow = functionBody(windows, 'findAgentTeamWindowTarget')
  assertIncludes(findAgentWindow, 'createAgentTeamKernelAdapter().findAgentTeamWindowTargetAsync(sessionName, signal)', 'findAgentTeamWindowTarget adapter call')
  assertIncludes(findAgentWindow, 'if (!sessionName || signal?.aborted) return null', 'findAgentTeamWindowTarget fail closed')
  assertNotIncludes(findAgentWindow, 'runTmux', 'findAgentTeamWindowTarget direct tmux fallback')

  const findByName = functionBody(windows, 'findWindowTargetByName')
  assertIncludes(findByName, 'createAgentTeamKernelAdapter().findWindowTargetByNameAsync(sessionName, windowName, signal)', 'findWindowTargetByName adapter call')
  assertIncludes(findByName, 'if (!sessionName || !windowName || signal?.aborted) return null', 'findWindowTargetByName fail closed')
  assertNotIncludes(findByName, 'runTmux', 'findWindowTargetByName direct tmux fallback')

  const ensureWindow = functionBody(windows, 'ensureSwarmWindow')
  for (const expected of [
    'await ensureTmuxAvailable(signal)',
    'await resolvePaneBindingAsync(preferred.leaderPaneId, signal)',
    'await windowExists(preferred.target, signal)',
    'currentBinding ??= captureCurrentPaneBinding()',
    'await firstPaneInWindow(target, signal)',
    'await markWindowAsAgentTeam(target, signal)',
    'await refreshWindowPaneLabels(target, signal)',
    'createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)',
    'createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)',
    'createAgentTeamKernelAdapter().createDetachedSwarmWindowAsync(SWARM_SESSION, SWARM_WINDOW, signal)',
    'await findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)',
  ]) assertIncludes(ensureWindow, expected, 'ensureSwarmWindow Step 6 source boundary')
  assertNotIncludes(ensureWindow, 'runTmux', 'ensureSwarmWindow direct tmux fallback')
  assertNotIncludes(ensureWindow, 'send-keys', 'ensureSwarmWindow must not send keys')

  for (const expected of [
    "callHelper<unknown>('workerLifecycle', { operation: 'inspectPane'",
    "callHelper<unknown>('workerLifecycle', { operation: 'listAgentTeamPanes' })",
    "callHelper<unknown>('workerLifecycle', { operation: 'captureCurrentPaneBinding' })",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'listPanesInWindow'",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'findAgentTeamWindowTarget'",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'findWindowTargetByName'",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'sessionExists'",
    "callHelperAsync<unknown>('tmuxAvailability', undefined, signal)",
  ]) assertIncludes(kernel, expected, 'core/kernel read-only helper calls')
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

function assertPackageNativeBoundaries(root) {
  const packageJson = assertPackageNoReleaseGuards(root, { expectedVersion: '0.6.8', expectedPiExtensions: ['./index.ts'] })
  assert.equal(packageJson.scripts?.check?.includes('npm run test:regression'), true, 'package check must keep full regression coverage')
  assert.equal(packageJson.scripts?.check?.includes('npm test'), false, 'package check must not demote to default tests only')
  assertNoRawOrReleaseArtifacts(root)
  const manifest = readJsonRel(root, 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json')
  const checksums = readRel(root, 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/SHA256SUMS')
  assert.equal(manifest.module, 'tmuxSnapshotParse', 'approved embedded helper module should remain tmuxSnapshotParse')
  assert.equal(manifest.helperVersion, '0.3.0-read-model-shadow', 'approved embedded helper version should remain stable')
  assert.ok(manifest.capabilities.includes('workerLifecycle'), 'embedded helper manifest should include workerLifecycle capability')
  assert.ok(manifest.capabilities.includes('tmuxAvailability'), 'embedded helper manifest should include tmuxAvailability capability')
  assertIncludes(checksums, 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/agentteam-tmuxSnapshotParse', 'embedded helper checksum list')
}

function assertHistoricalRetention(root) {
  assertEveryRelExists(root, GO_TMUX_CUTOVER_BATCH3_SOURCE_FILES, 'Step 6 batch 3 current guard source files')
  assertEveryRelExists(root, STEP6_BATCH3_RETAINED_SUITES, 'Step 6 batch 3 retained suites')
  assertEveryRelExists(root, STEP6_BATCH3_SCOPE_DOCS, 'Step 6 batch 3 retained docs')
  assertEveryRelExists(root, STEP6_BATCH3_SCOPE_FIXTURES, 'Step 6 batch 3 retained fixtures')
  assertEveryRelAbsent(root, HISTORICAL_CHECKPOINT_T024_DELETED_SUITES, 'T024 historical deletions')
  assertEveryRelAbsent(root, HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES, 'T034 Step5C historical deletions')
  assertEveryRelAbsent(root, HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES, 'T024/T034 ready-deleted suites')
}

function assertGoTmuxCutoverBatch3RuntimeSeam(requireDist) {
  if (typeof requireDist !== 'function') return
  const kernel = requireDist('core/kernel.js')
  const tmuxCore = requireDist('tmux/core.js')
  const tmuxPanes = requireDist('tmux/panes.js')
  const original = kernel.createAgentTeamKernelAdapter
  const calls = []
  const panes = [{ paneId: '%1', target: 'pi-agentteam:agentteam.1', label: 'team-lead', currentCommand: 'pi' }]
  try {
    kernel.createAgentTeamKernelAdapter = () => ({
      inspectWorkerPane(paneId) {
        calls.push(['inspectWorkerPane', paneId])
        return { ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId, target: 'pi-agentteam:agentteam.1', currentCommand: 'pi', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }
      },
      inspectWorkerPaneAsync(paneId) {
        calls.push(['inspectWorkerPaneAsync', paneId])
        return Promise.resolve({ ok: true, operation: 'inspectPane', capability: 'workerLifecycle', paneId, target: 'pi-agentteam:agentteam.1', currentCommand: 'pi', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })
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
    assert.equal(tmuxCore.paneExists('%1'), true)
    assert.deepEqual(tmuxCore.resolvePaneBinding('%1'), { paneId: '%1', target: 'pi-agentteam:agentteam.1' })
    assert.equal(tmuxCore.targetForPaneId('%1'), 'pi-agentteam:agentteam.1')
    assert.doesNotThrow(() => tmuxPanes.killPane('%1'))
    assert.doesNotThrow(() => tmuxPanes.clearPaneLabelSync('%1'))
    assert.deepEqual(calls.map(call => call[0]), ['listAgentTeamPanes', 'inspectWorkerPane', 'inspectWorkerPane', 'inspectWorkerPane', 'killPane', 'clearPaneLabel'])
  } finally {
    kernel.createAgentTeamKernelAdapter = original
  }
}

function assertGoTmuxCutoverBatch3Guard({ repoRoot, requireDist } = {}) {
  const root = repoRoot || process.cwd()
  assertStep6Batch3AuditMap(root)
  assertReadOnlyFacadeSourceBoundaries(root)
  assertMutationFacadeSourceBoundaries(root)
  assertGoHelperOperationSurface(root)
  assertPackageNativeBoundaries(root)
  assertHistoricalRetention(root)
  assertGoTmuxCutoverBatch3RuntimeSeam(requireDist)
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
  assertMutationFacadeSourceBoundaries,
  assertPackageNativeBoundaries,
  assertReadOnlyFacadeSourceBoundaries,
  assertStep6Batch3AuditMap,
}
