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
const { goMutatingWindowMarkingGate } = require('../fixtures/kernel/v0671/goMutatingWindowMarkingGate.cjs')
const { goWindowMarkingCutover } = require('../fixtures/kernel/v0672/goWindowMarkingCutover.cjs')
const { goRefreshWindowPaneLabelsGate } = require('../fixtures/kernel/v0673/goRefreshWindowPaneLabelsGate.cjs')
const { goRefreshWindowPaneLabelsCutover } = require('../fixtures/kernel/v0674/goRefreshWindowPaneLabelsCutover.cjs')
const { goPaneLabelSettingGate } = require('../fixtures/kernel/v0675/goPaneLabelSettingGate.cjs')
const { goPaneLabelSettingCutover } = require('../fixtures/kernel/v0676/goPaneLabelSettingCutover.cjs')
const { goPaneLabelClearingGate } = require('../fixtures/kernel/v0677/goPaneLabelClearingGate.cjs')
const { goPaneLabelClearingCutover } = require('../fixtures/kernel/v0678/goPaneLabelClearingCutover.cjs')

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
  'mutation-facade-authority-exact': 'Current non-destructive window/label mutation facades keep TypeScript authority, exact helper operations, compact fail-closed public behavior, and no wake/send-keys/destructive lifecycle expansion.',
  'go-helper-operation-surface-exact': 'The Go helper exposes only the approved workerLifecycle/tmuxAvailability operation surface and exact tmux argv snippets for Step 6 batch-3 cutovers.',
  'package-native-release-boundaries-preserved': 'Package/native/release boundaries remain unchanged: package version 0.6.8, approved embedded helper path, no package/release/signing mechanics.',
  'historical-suite-retention-honest': 'Step 6 deletion accounting is honest: replaced read-only facade/orchestration and non-destructive window/label suites are expected absent, retained v0.6.53-v0.6.88 suites stay present, and prior historical deletions remain absent.',
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

const EXPECTED_STEP6_BATCH3_DELETED_SUITES = Object.freeze([
  'tests/suites/go-kernel-v0671-go-mutating-window-marking-gate.cjs',
  'tests/suites/go-kernel-v0672-go-window-marking-cutover.cjs',
  'tests/suites/go-kernel-v0673-go-refresh-window-pane-labels-gate.cjs',
  'tests/suites/go-kernel-v0674-go-refresh-window-pane-labels-cutover.cjs',
  'tests/suites/go-kernel-v0675-go-pane-label-setting-gate.cjs',
  'tests/suites/go-kernel-v0676-go-pane-label-setting-cutover.cjs',
  'tests/suites/go-kernel-v0677-go-pane-label-clearing-gate.cjs',
  'tests/suites/go-kernel-v0678-go-pane-label-clearing-cutover.cjs',
])

const EXPECTED_STEP6_DELETED_SUITES = Object.freeze([
  ...EXPECTED_STEP6_BATCH1_DELETED_SUITES,
  ...EXPECTED_STEP6_BATCH2_DELETED_SUITES,
  ...EXPECTED_STEP6_BATCH3_DELETED_SUITES,
])

const STEP6_WINDOW_MARKING_COMMANDS = Object.freeze([
  'tmux set-option -w -t <target> automatic-rename off',
  'tmux set-option -w -t <target> allow-rename off',
  'tmux set-option -w -t <target> @agentteam-window 1',
])
const STEP6_WINDOW_PANE_LABEL_REFRESH_COMMANDS = Object.freeze([
  'tmux set-option -w -t <target> pane-border-status top',
  "tmux set-option -w -t <target> pane-border-format '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'",
])
const STEP6_PANE_LABEL_SETTING_COMMANDS = Object.freeze([
  'tmux set-option -p -t <paneId> @agentteam-name <label>',
  'tmux select-pane -t <paneId> -T <label>',
])
const STEP6_PANE_LABEL_CLEARING_COMMANDS = Object.freeze([
  'tmux set-option -up -t <paneId> @agentteam-name',
  "tmux select-pane -t <paneId> -T ''",
])
const STEP6_RAW_LABEL_CANARY = 'raw-unicode-pane-label-canary 🧪'
const STEP6_BAD_HELPER_OUTPUT = 'STEP6_BAD_HELPER_OUTPUT_SHOULD_NOT_LEAK'

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

function commandRenderings(commands) {
  return commands.map(command => command.rendered)
}

function assertNoRawCanary(value, canary, label) {
  assert.equal(JSON.stringify(value).includes(canary), false, `${label} must not leak raw canary text`)
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

function assertWindowLabelMutationFixtureContracts() {
  assert.deepEqual(commandRenderings(goMutatingWindowMarkingGate.authorizedFutureTmuxCommands), [...STEP6_WINDOW_MARKING_COMMANDS], 'v0671 gate authorized future mark commands')
  assert.equal(goMutatingWindowMarkingGate.gateOnly, true, 'v0671 should remain gate-only historical evidence')
  assert.equal(goMutatingWindowMarkingGate.noRuntimeMigrationInThisSlice, true, 'v0671 should not claim runtime migration in that slice')
  assert.equal(goMutatingWindowMarkingGate.futureCandidateDestructive, false, 'v0671 mark command should be non-destructive')
  assert.equal(goMutatingWindowMarkingGate.futureFacadeRule.hiddenTypeScriptFallbackAllowedAfterCutover, false, 'v0671 should forbid hidden TS fallback after cutover')
  assert.ok(goMutatingWindowMarkingGate.stillForbiddenMutatingScope.includes('send-keys'), 'v0671 should keep send-keys forbidden')
  assert.ok(goMutatingWindowMarkingGate.stillForbiddenMutatingScope.includes('kill-pane'), 'v0671 should keep destructive kill-pane forbidden')

  assert.deepEqual(commandRenderings(goWindowMarkingCutover.authorizedTmuxCommands), [...STEP6_WINDOW_MARKING_COMMANDS], 'v0672 cutover authorized mark commands')
  assert.equal(goWindowMarkingCutover.operation, 'markWindowAsAgentTeam', 'v0672 operation')
  assert.equal(goWindowMarkingCutover.facadeCutoverMigrated, true, 'v0672 should record migrated facade cutover')
  assert.equal(goWindowMarkingCutover.typescriptSetOptionFallbackRemoved, true, 'v0672 should record TS set-option fallback removal')
  assert.equal(goWindowMarkingCutover.noThrowVoidFacadePreserved, true, 'v0672 public facade should remain no-throw void')
  assert.equal(goWindowMarkingCutover.refreshWindowPaneLabelsMigrated, false, 'v0672 should not claim refresh migration')
  assert.equal(goWindowMarkingCutover.newSessionMigrated, false, 'v0672 should not authorize detached new-session')

  assert.deepEqual(commandRenderings(goRefreshWindowPaneLabelsGate.authorizedFutureTmuxCommands), [...STEP6_WINDOW_PANE_LABEL_REFRESH_COMMANDS], 'v0673 gate authorized future refresh commands')
  assert.equal(goRefreshWindowPaneLabelsGate.gateOnly, true, 'v0673 should remain gate-only historical evidence')
  assert.equal(goRefreshWindowPaneLabelsGate.markWindowAsAgentTeamMigrated, true, 'v0673 should preserve prior mark cutover state')
  assert.equal(goRefreshWindowPaneLabelsGate.refreshWindowPaneLabelsMigrated, false, 'v0673 should not claim runtime migration in that slice')
  assert.equal(goRefreshWindowPaneLabelsGate.futureCandidateDestructive, false, 'v0673 refresh command should be non-destructive')
  assert.ok(goRefreshWindowPaneLabelsGate.stillForbiddenMutatingScope.includes('set-option -p pane labels'), 'v0673 should keep pane labels forbidden')

  assert.deepEqual(commandRenderings(goRefreshWindowPaneLabelsCutover.authorizedTmuxCommands), [...STEP6_WINDOW_PANE_LABEL_REFRESH_COMMANDS], 'v0674 cutover authorized refresh commands')
  assert.deepEqual(commandRenderings(goRefreshWindowPaneLabelsCutover.existingMarkWindowTmuxCommands), [...STEP6_WINDOW_MARKING_COMMANDS], 'v0674 should preserve mark command surface')
  assert.equal(goRefreshWindowPaneLabelsCutover.operation, 'refreshWindowPaneLabels', 'v0674 operation')
  assert.equal(goRefreshWindowPaneLabelsCutover.facadeCutoverMigrated, true, 'v0674 should record migrated facade cutover')
  assert.equal(goRefreshWindowPaneLabelsCutover.typescriptSetOptionFallbackRemoved, true, 'v0674 should record TS pane-border fallback removal')
  assert.equal(goRefreshWindowPaneLabelsCutover.noThrowVoidFacadePreserved, true, 'v0674 public facade should remain no-throw void')
  assert.equal(goRefreshWindowPaneLabelsCutover.paneLabelsMigrated, false, 'v0674 should not claim pane label migration')

  assert.deepEqual(commandRenderings(goPaneLabelSettingGate.authorizedFutureTmuxCommands), [...STEP6_PANE_LABEL_SETTING_COMMANDS], 'v0675 gate authorized future setPaneLabel commands')
  assert.equal(goPaneLabelSettingGate.gateOnly, true, 'v0675 should remain gate-only historical evidence')
  assert.equal(goPaneLabelSettingGate.setPaneLabelMigrated, false, 'v0675 should not claim runtime migration in that slice')
  assert.equal(goPaneLabelSettingGate.clearPaneLabelMigrated, false, 'v0675 should not authorize clearing')
  assert.equal(goPaneLabelSettingGate.futureInputPolicy.labelMayContainUnicode, true, 'v0675 should keep Unicode label policy')
  assert.equal(goPaneLabelSettingGate.futureInputPolicy.labelMayContainEmoji, true, 'v0675 should keep emoji label policy')
  assert.equal(goPaneLabelSettingGate.futureInputPolicy.labelShellInterpolationAllowed, false, 'v0675 should forbid shell interpolation')
  assert.equal(goPaneLabelSettingGate.futurePublicBehavior.rawLabelLeakageAllowed, false, 'v0675 should forbid raw label diagnostics')

  assert.deepEqual(commandRenderings(goPaneLabelSettingCutover.authorizedTmuxCommands), [...STEP6_PANE_LABEL_SETTING_COMMANDS], 'v0676 cutover authorized setPaneLabel commands')
  assert.equal(goPaneLabelSettingCutover.operation, 'setPaneLabel', 'v0676 operation')
  assert.equal(goPaneLabelSettingCutover.labelArgumentLimit, 4096, 'v0676 label argument cap')
  assert.equal(goPaneLabelSettingCutover.facadeCutoverMigrated, true, 'v0676 should record migrated private helper')
  assert.equal(goPaneLabelSettingCutover.typescriptSetPaneLabelFallbackRemoved, true, 'v0676 should record TS pane-label fallback removal')
  assert.equal(goPaneLabelSettingCutover.rawLabelLeakageAllowed, false, 'v0676 should forbid raw label leakage')
  assert.equal(goPaneLabelSettingCutover.clearPaneLabelMigrated, false, 'v0676 should not claim clearPaneLabel migration')

  assert.deepEqual(commandRenderings(goPaneLabelClearingGate.authorizedFutureTmuxCommands), [...STEP6_PANE_LABEL_CLEARING_COMMANDS], 'v0677 gate authorized future clearPaneLabel commands')
  assert.equal(goPaneLabelClearingGate.gateOnly, true, 'v0677 should remain gate-only historical evidence')
  assert.equal(goPaneLabelClearingGate.setPaneLabelMigrated, true, 'v0677 should preserve prior setPaneLabel cutover state')
  assert.equal(goPaneLabelClearingGate.clearPaneLabelMigrated, false, 'v0677 should not claim runtime migration in that slice')
  assert.equal(goPaneLabelClearingGate.clearPaneLabelsForTeamMigrated, false, 'v0677 should keep orchestration unmigrated')
  assert.equal(goPaneLabelClearingGate.futureInputPolicy.shellInterpolationAllowed, false, 'v0677 should forbid shell interpolation')

  assert.deepEqual(commandRenderings(goPaneLabelClearingCutover.authorizedTmuxCommands), [...STEP6_PANE_LABEL_CLEARING_COMMANDS], 'v0678 cutover authorized clearPaneLabel commands')
  assert.equal(goPaneLabelClearingCutover.operation, 'clearPaneLabel', 'v0678 operation')
  assert.equal(goPaneLabelClearingCutover.facadeCutoverMigrated, true, 'v0678 should record migrated private helper')
  assert.equal(goPaneLabelClearingCutover.typescriptClearPaneLabelFallbackRemoved, true, 'v0678 should record TS clear fallback removal')
  assert.equal(goPaneLabelClearingCutover.noThrowVoidHelperPreserved, true, 'v0678 private helper should remain no-throw void')
  assert.equal(goPaneLabelClearingCutover.rawOutputLeakageAllowed, false, 'v0678 should forbid raw helper output leakage')
  assert.equal(goPaneLabelClearingCutover.clearPaneLabelsForTeamMigrated, false, 'v0678 should keep team orchestration unmigrated')
}

function assertStep6Batch3AuditMap(root) {
  assert.equal(path.basename(GO_TMUX_CUTOVER_BATCH3_GUARD_HELPER), 'goTmuxCutoverBatch3Guards.cjs')
  assert.equal(path.basename(GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE), 'go-kernel-tmux-cutover-batch3-guard.cjs')
  assert.deepEqual(STEP6_BATCH3_ACTIONS, ['keep-unique', 'split-later', 'delete-replaced'])
  assert.equal(STEP6_BATCH3_AUDIT_ENTRIES.length, 36, 'Step 6 audit map should cover v0.6.53-v0.6.88')
  assert.deepEqual(STEP6_BATCH3_CLUSTER_COUNTS, EXPECTED_CLUSTER_COUNTS, 'Step 6 cluster counts should be explicit')
  assert.deepEqual(STEP6_BATCH3_DELETION_CANDIDATE_SUITES, [...EXPECTED_STEP6_DELETED_SUITES], 'Step 6 should mark exactly the batch 1/2/3 replaced read-only facade/orchestration and non-destructive window/label suites')
  assert.equal(STEP6_BATCH3_RETAINED_SUITES.length, STEP6_BATCH3_AUDIT_ENTRIES.length - EXPECTED_STEP6_DELETED_SUITES.length, 'retained suite list should exclude Step 6 batch 1/2/3 deleted suites')
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
    assert.equal(entry.recommendedAction, expectedDeleted ? 'delete-replaced' : 'keep-unique', `${entry.suite} should have the expected Step 6 batch 1/2/3 action`)
    assert.equal(entry.deletionReady, expectedDeleted, `${entry.suite} deletion readiness should match Step 6 batch 1/2/3 scope`)
    assert.ok(entry.duplicateAssertions.length >= 5, `${entry.suite} should document duplicate assertion clusters`)
    assert.ok(entry.uniqueAssertions.length >= 1, `${entry.suite} should document migrated or retained behavior-unique assertions`)
    assert.ok(entry.replacementEvidence.length >= 1, `${entry.suite} should cite current guard evidence for duplicated assertions`)
    assert.equal(entry.replacementEvidence[0].suite, GO_TMUX_CUTOVER_BATCH3_GUARD_SUITE, `${entry.suite} should point to this guard suite`)
    assert.equal(entry.replacementEvidence[0].helper, GO_TMUX_CUTOVER_BATCH3_GUARD_HELPER, `${entry.suite} should point to this guard helper`)
    assert.ok(entry.replacementEvidence[0].categories.length >= 1, `${entry.suite} replacement evidence should list categories`)
    const expectedDeletedEvidenceCategory = entry.cluster === 'windowLabelMutation' ? 'mutation-facade-authority-exact' : 'read-only-worker-lifecycle-facades'
    assert.equal(entry.replacementEvidence[0].categories.includes(expectedDeletedEvidenceCategory) || !expectedDeleted, true, `${entry.suite} deleted suite should cite current guard coverage category ${expectedDeletedEvidenceCategory}`)
    assert.equal(existsRel(root, entry.suite), !expectedDeleted, `${entry.suite} presence should match Step 6 batch 1/2/3 deletion accounting`)
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
  const goSource = readRel(root, 'kernel/go/agentteam-kernel/main.go')
  const builder = readRel(root, 'scripts/lib/go-helper-artifact-builder.cjs')
  const verifier = readRel(root, 'scripts/lib/go-helper-artifact-verifier.cjs')
  const protocolCases = readRel(root, 'tests/fixtures/kernel/jsonrpc/protocolCases.cjs')

  const setPaneLabel = functionBody(labels, 'setPaneLabel')
  assertIncludes(setPaneLabel, 'await createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)', 'setPaneLabel adapter call')
  assertNotIncludes(setPaneLabel, 'runTmux', 'setPaneLabel direct tmux fallback')
  assertNotIncludes(setPaneLabel, 'set-option', 'setPaneLabel direct pane label fallback')
  assertNotIncludes(setPaneLabel, 'select-pane', 'setPaneLabel direct pane title fallback')

  const clearPaneLabel = functionBody(labels, 'clearPaneLabel')
  assertIncludes(clearPaneLabel, 'await createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)', 'clearPaneLabel adapter call')
  assertNotIncludes(clearPaneLabel, 'runTmux', 'clearPaneLabel direct tmux fallback')
  assertNotIncludes(clearPaneLabel, 'set-option', 'clearPaneLabel direct pane label fallback')
  assertNotIncludes(clearPaneLabel, 'select-pane', 'clearPaneLabel direct pane title fallback')

  const markWindow = functionBody(labels, 'markWindowAsAgentTeam')
  assertIncludes(markWindow, 'if (!await windowExists(target, signal)) return', 'markWindowAsAgentTeam window guard')
  assertIncludes(markWindow, 'await createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)', 'markWindowAsAgentTeam adapter call')
  assertNotIncludes(markWindow, 'runTmux', 'markWindowAsAgentTeam direct tmux fallback')
  assertNotIncludes(markWindow, 'automatic-rename', 'markWindowAsAgentTeam direct automatic-rename fallback')
  assertNotIncludes(markWindow, 'allow-rename', 'markWindowAsAgentTeam direct allow-rename fallback')
  assertNotIncludes(markWindow, '@agentteam-window', 'markWindowAsAgentTeam direct marker fallback')

  const refreshLabels = functionBody(labels, 'refreshWindowPaneLabels')
  assertIncludes(refreshLabels, 'if (!await windowExists(target, signal)) return', 'refreshWindowPaneLabels window guard')
  assertIncludes(refreshLabels, 'await createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)', 'refreshWindowPaneLabels adapter call')
  assertNotIncludes(refreshLabels, 'runTmux', 'refreshWindowPaneLabels direct tmux fallback')
  assertNotIncludes(refreshLabels, 'pane-border-status', 'refreshWindowPaneLabels direct border-status fallback')
  assertNotIncludes(refreshLabels, 'pane-border-format', 'refreshWindowPaneLabels direct border-format fallback')

  const syncLabels = functionBody(labels, 'syncPaneLabelsForTeam')
  assertIncludes(syncLabels, 'await setPaneLabel(member.paneId, member.name === \'team-lead\' ? formatLeaderPaneLabel(team) : formatMemberPaneLabel(member), signal)', 'syncPaneLabelsForTeam set labels')
  assertIncludes(syncLabels, 'formatLeaderPaneLabel(team)', 'syncPaneLabelsForTeam leader label formatting')
  assertIncludes(syncLabels, 'formatMemberPaneLabel(member)', 'syncPaneLabelsForTeam member label formatting')
  assertIncludes(syncLabels, 'const target = member.paneId ? targetForPaneId(member.paneId) : member.windowTarget', 'syncPaneLabelsForTeam target collection')
  assertIncludes(syncLabels, 'await refreshWindowPaneLabels(target, signal)', 'syncPaneLabelsForTeam refresh labels')
  assertNotIncludes(syncLabels, 'createAgentTeamKernelAdapter()', 'syncPaneLabelsForTeam should use local facades only')
  assertNotIncludes(syncLabels, 'setPaneLabelAsync', 'syncPaneLabelsForTeam should not bypass private setPaneLabel')

  const clearLabels = functionBody(labels, 'clearPaneLabelsForTeam')
  assertIncludes(clearLabels, 'await clearPaneLabel(member.paneId, signal)', 'clearPaneLabelsForTeam clear labels')
  assertIncludes(clearLabels, 'const target = targetForPaneId(member.paneId) ?? member.windowTarget', 'clearPaneLabelsForTeam target fallback')
  assertIncludes(clearLabels, 'targets.add(member.windowTarget)', 'clearPaneLabelsForTeam window target fallback')
  assertIncludes(clearLabels, 'await refreshWindowPaneLabels(target, signal)', 'clearPaneLabelsForTeam refresh labels')
  assertNotIncludes(clearLabels, 'clearPaneLabelAsync', 'clearPaneLabelsForTeam should not bypass private clearPaneLabel')
  assertNotIncludes(clearLabels, 'createAgentTeamKernelAdapter()', 'clearPaneLabelsForTeam remains TypeScript orchestration')
  assertNotIncludes(clearLabels, 'workerLifecycle', 'clearPaneLabelsForTeam must not mention helper operation names')

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
    'export type AgentTeamKernelWindowMarking',
    'export type AgentTeamKernelWindowPaneLabelsRefresh',
    'export type AgentTeamKernelPaneLabelSetting',
    'export type AgentTeamKernelPaneLabelClearing',
    'const PANE_LABEL_ARGUMENT_LIMIT = 4096',
    'function isValidPaneLabelArgument',
    'function validateWindowMarkingResult',
    'function validateWindowPaneLabelsRefreshResult',
    'function validatePaneLabelSettingResult',
    'function validatePaneLabelClearingResult',
    'workerLifecycleMarkWindowAsAgentTeamConnected',
    'workerLifecycleRefreshWindowPaneLabelsConnected',
    'workerLifecycleSetPaneLabelConnected',
    'workerLifecycleClearPaneLabelConnected',
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'markWindowAsAgentTeam', target: requestedTarget }, signal)",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'refreshWindowPaneLabels', target: requestedTarget }, signal)",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'setPaneLabel', paneId: requestedPaneId, label }, signal)",
    "callHelperAsync<unknown>('workerLifecycle', { operation: 'clearPaneLabel', paneId: requestedPaneId }, signal)",
    "callHelper<unknown>('workerLifecycle', { operation: 'clearPaneLabel', paneId: requestedPaneId })",
    "callHelper<unknown>('workerLifecycle', { operation: 'killPane'",
    "operation: 'createTeammatePane'",
  ]) assertIncludes(kernel, expected, 'core/kernel mutating helper calls')
  assertNotIncludes(kernel, '+ label', 'core/kernel diagnostics must not concatenate raw pane labels')
  assertNotIncludes(kernel, 'label +', 'core/kernel diagnostics must not concatenate raw pane labels')

  for (const expected of [
    'type workerWindowMarkingResult struct',
    'type workerWindowPaneLabelsRefreshResult struct',
    'type workerPaneLabelSettingResult struct',
    'type workerPaneLabelClearingResult struct',
    'const paneLabelArgumentLimit = 4096',
    'func paneLabelParam(params map[string]any) (string, bool)',
    'func runWindowMarkingSetOption(target string, option string, value string) string',
    'func markWindowAsAgentTeam(params map[string]any) workerWindowMarkingResult',
    'func runWindowPaneLabelsSetOption(target string, option string, value string) string',
    'func refreshWindowPaneLabels(params map[string]any) workerWindowPaneLabelsRefreshResult',
    'func setPaneLabel(params map[string]any) workerPaneLabelSettingResult',
    'func clearPaneLabel(params map[string]any) workerPaneLabelClearingResult',
    'runWindowMarkingSetOption(target, "automatic-rename", "off")',
    'runWindowMarkingSetOption(target, "allow-rename", "off")',
    'runWindowMarkingSetOption(target, "@agentteam-window", "1")',
    'runWindowPaneLabelsSetOption(target, "pane-border-status", "top")',
    'runWindowPaneLabelsSetOption(target, "pane-border-format", "#{?@agentteam-name,#{@agentteam-name},#{pane_title}}")',
    'exec.CommandContext(ctx, "tmux", "set-option", "-p", "-t", paneID, "@agentteam-name", label)',
    'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)',
    'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")',
    'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")',
  ]) assertIncludes(goSource, expected, 'Go non-destructive window/label mutation surface')
  assert.equal([...goSource.matchAll(/runWindowMarkingSetOption\(target,/g)].length, 3, 'Go helper should keep exactly three window marking set-option calls')
  assert.equal([...goSource.matchAll(/runWindowPaneLabelsSetOption\(target,/g)].length, 2, 'Go helper should keep exactly two refresh set-option calls')
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "set-option", "-p", "-t", paneID, "@agentteam-name", label\)/g)].length, 1, 'Go helper should contain exactly one pane label set-option command')
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "select-pane", "-t", paneID, "-T", label\)/g)].length, 1, 'Go helper should contain exactly one pane title set command')
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name"\)/g)].length, 1, 'Go helper should contain exactly one pane label clear command')
  assert.equal([...goSource.matchAll(/exec\.CommandContext\(ctx, "tmux", "select-pane", "-t", paneID, "-T", ""\)/g)].length, 1, 'Go helper should contain exactly one pane title clear command')
  assertNotIncludes(goSource, '+ label', 'Go diagnostics must not concatenate raw pane labels')
  assertNotIncludes(goSource, 'label +', 'Go diagnostics must not concatenate raw pane labels')

  for (const expected of [
    'runWorkerLifecycleMarkWindowAsAgentTeamSmoke',
    'runWorkerLifecycleRefreshWindowPaneLabelsSmoke',
    'runWorkerLifecycleSetPaneLabelSmoke',
    'runWorkerLifecycleClearPaneLabelSmoke',
    'workerLifecycleMarkWindowAsAgentTeam',
    'workerLifecycleRefreshWindowPaneLabels',
    'workerLifecycleSetPaneLabel',
    'workerLifecycleClearPaneLabel',
  ]) assertIncludes(builder, expected, 'artifact builder window/label mutation smoke coverage')
  for (const expected of [
    'workerLifecycleMarkWindowAsAgentTeam',
    'workerLifecycleRefreshWindowPaneLabels',
    'workerLifecycleSetPaneLabel',
    'workerLifecycleClearPaneLabel',
  ]) assertIncludes(verifier, expected, 'artifact verifier window/label mutation smoke coverage')
  for (const expected of [
    "operation: 'setPaneLabel'",
    "operation: 'clearPaneLabel'",
  ]) assertIncludes(protocolCases, expected, 'JSON-RPC protocol pane label mutation cases')
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

function writeWindowLabelMutationFakeTmux(binDir) {
  fs.mkdirSync(binDir, { recursive: true })
  const tmuxPath = path.join(binDir, 'tmux')
  fs.writeFileSync(tmuxPath, [
    '#!/usr/bin/env node',
    "const fs = require('node:fs')",
    "const args = process.argv.slice(2)",
    "const log = process.env.AGENTTEAM_STEP6_TMUX_ARGV_LOG",
    "if (log) fs.appendFileSync(log, JSON.stringify(args) + '\\n')",
    "if (args[0] === 'set-option' || args[0] === 'select-pane') process.exit(0)",
    "process.exit(2)",
  ].join('\n') + '\n', 'utf8')
  fs.chmodSync(tmuxPath, 0o755)
  return tmuxPath
}

function readTmuxArgvLog(logPath) {
  if (!fs.existsSync(logPath)) return []
  return fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
}

function assertMutationResultShape(result, operation) {
  assert.equal(result.operation, operation, `${operation} direct Go operation`)
  assert.equal(result.capability, 'workerLifecycle', `${operation} capability`)
  assert.equal(result.readOnly, false, `${operation} should not be read-only`)
  assert.equal(result.stateFilesRead, false, `${operation} should not read state files`)
  assert.equal(result.stateFilesWritten, false, `${operation} should not write state files`)
  assert.equal(result.tmuxMutation, true, `${operation} should be an exact tmux mutation`)
  assert.equal(/stdout|stderr|stack|MAILBOX_BODY|REPORT_BODY|worker transcript|rawState|stateArchive|terminal raw/i.test(JSON.stringify(result)), false, `${operation} result must not leak raw output`)
}

function runDirectMutation(root, request, env) {
  const result = runGoHelper(root, request, env)
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout.trim()).result
}

function assertNonDestructiveMutationDirectGoBehavior(root) {
  if (!hasGoToolchain()) return
  const fakeTmuxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-step6-mutation-tmux-'))
  const logPath = path.join(fakeTmuxRoot, 'argv.log')
  try {
    writeWindowLabelMutationFakeTmux(fakeTmuxRoot)
    const env = { PATH: `${fakeTmuxRoot}${path.delimiter}${process.env.PATH || ''}`, AGENTTEAM_STEP6_TMUX_ARGV_LOG: logPath }
    const resetLog = () => fs.writeFileSync(logPath, '', 'utf8')

    resetLog()
    const mark = runDirectMutation(root, { jsonrpc: '2.0', id: 'mark-window', method: 'workerLifecycle', params: { operation: 'markWindowAsAgentTeam', target: 'team:@7' } }, env)
    assertMutationResultShape(mark, 'markWindowAsAgentTeam')
    assert.equal(mark.ok, true, 'direct Go markWindowAsAgentTeam should succeed')
    assert.equal(mark.marked, true)
    assert.deepEqual(readTmuxArgvLog(logPath), [
      ['set-option', '-w', '-t', 'team:@7', 'automatic-rename', 'off'],
      ['set-option', '-w', '-t', 'team:@7', 'allow-rename', 'off'],
      ['set-option', '-w', '-t', 'team:@7', '@agentteam-window', '1'],
    ], 'direct Go markWindowAsAgentTeam should use exactly the three authorized window set-option commands')

    resetLog()
    const refresh = runDirectMutation(root, { jsonrpc: '2.0', id: 'refresh-labels', method: 'workerLifecycle', params: { operation: 'refreshWindowPaneLabels', target: 'team:@7' } }, env)
    assertMutationResultShape(refresh, 'refreshWindowPaneLabels')
    assert.equal(refresh.ok, true, 'direct Go refreshWindowPaneLabels should succeed')
    assert.equal(refresh.refreshed, true)
    assert.deepEqual(readTmuxArgvLog(logPath), [
      ['set-option', '-w', '-t', 'team:@7', 'pane-border-status', 'top'],
      ['set-option', '-w', '-t', 'team:@7', 'pane-border-format', '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'],
    ], 'direct Go refreshWindowPaneLabels should use exactly the two authorized pane-border window options')

    resetLog()
    const setLabel = runDirectMutation(root, { jsonrpc: '2.0', id: 'set-label', method: 'workerLifecycle', params: { operation: 'setPaneLabel', paneId: '%123', label: STEP6_RAW_LABEL_CANARY } }, env)
    assertMutationResultShape(setLabel, 'setPaneLabel')
    assert.equal(setLabel.ok, true, 'direct Go setPaneLabel should succeed')
    assert.equal(setLabel.labeled, true)
    assertNoRawCanary(setLabel, STEP6_RAW_LABEL_CANARY, 'direct Go setPaneLabel result')
    assert.deepEqual(readTmuxArgvLog(logPath), [
      ['set-option', '-p', '-t', '%123', '@agentteam-name', STEP6_RAW_LABEL_CANARY],
      ['select-pane', '-t', '%123', '-T', STEP6_RAW_LABEL_CANARY],
    ], 'direct Go setPaneLabel should pass the raw label only as argv values')

    resetLog()
    const clear = runDirectMutation(root, { jsonrpc: '2.0', id: 'clear-label', method: 'workerLifecycle', params: { operation: 'clearPaneLabel', paneId: '%123' } }, env)
    assertMutationResultShape(clear, 'clearPaneLabel')
    assert.equal(clear.ok, true, 'direct Go clearPaneLabel should succeed')
    assert.equal(clear.cleared, true)
    assert.deepEqual(readTmuxArgvLog(logPath), [
      ['set-option', '-up', '-t', '%123', '@agentteam-name'],
      ['select-pane', '-t', '%123', '-T', ''],
    ], 'direct Go clearPaneLabel should use exactly the two authorized pane-level clear commands')

    resetLog()
    const invalidTarget = runDirectMutation(root, { jsonrpc: '2.0', id: 'invalid-target', method: 'workerLifecycle', params: { operation: 'markWindowAsAgentTeam', target: 'bad target' } }, env)
    assertMutationResultShape(invalidTarget, 'markWindowAsAgentTeam')
    assert.equal(invalidTarget.ok, false, 'direct Go invalid mark target should fail closed')
    assert.equal(invalidTarget.failureKind, 'invalid-target')
    assert.deepEqual(readTmuxArgvLog(logPath), [], 'invalid target should avoid tmux mutation')

    const invalidPane = runDirectMutation(root, { jsonrpc: '2.0', id: 'invalid-pane', method: 'workerLifecycle', params: { operation: 'setPaneLabel', paneId: 'not a pane', label: STEP6_RAW_LABEL_CANARY } }, env)
    assertMutationResultShape(invalidPane, 'setPaneLabel')
    assert.equal(invalidPane.ok, false, 'direct Go invalid pane id should fail closed')
    assert.equal(invalidPane.failureKind, 'invalid-pane-id')
    assertNoRawCanary(invalidPane, STEP6_RAW_LABEL_CANARY, 'direct Go invalid pane setPaneLabel result')
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
  assert.equal(manifest.smoke.workerLifecycleMarkWindowAsAgentTeam.ok, false, 'embedded helper manifest should preserve markWindowAsAgentTeam invalid-target smoke')
  assert.deepEqual(manifest.smoke.workerLifecycleMarkWindowAsAgentTeam.acceptedFailureKinds, ['invalid-target'], 'embedded helper manifest markWindowAsAgentTeam accepted failure kinds')
  assert.equal(manifest.smoke.workerLifecycleRefreshWindowPaneLabels.ok, false, 'embedded helper manifest should preserve refreshWindowPaneLabels invalid-target smoke')
  assert.deepEqual(manifest.smoke.workerLifecycleRefreshWindowPaneLabels.acceptedFailureKinds, ['invalid-target'], 'embedded helper manifest refreshWindowPaneLabels accepted failure kinds')
  assert.equal(manifest.smoke.workerLifecycleSetPaneLabel.ok, false, 'embedded helper manifest should preserve setPaneLabel invalid-pane smoke')
  assert.deepEqual(manifest.smoke.workerLifecycleSetPaneLabel.acceptedFailureKinds, ['invalid-pane-id'], 'embedded helper manifest setPaneLabel accepted failure kinds')
  assert.equal(manifest.smoke.workerLifecycleClearPaneLabel.ok, false, 'embedded helper manifest should preserve clearPaneLabel invalid-pane smoke')
  assert.deepEqual(manifest.smoke.workerLifecycleClearPaneLabel.acceptedFailureKinds, ['invalid-pane-id'], 'embedded helper manifest clearPaneLabel accepted failure kinds')
  assert.equal(provenance.smoke.workerLifecycleSetPaneLabel.ok, false, 'embedded helper provenance should preserve setPaneLabel invalid-pane smoke')
  assert.equal(provenance.smoke.workerLifecycleClearPaneLabel.ok, false, 'embedded helper provenance should preserve clearPaneLabel invalid-pane smoke')
  assertNoRawCanary(manifest.smoke, 'agentteam raw label canary 🚫', 'embedded helper manifest setPaneLabel smoke')
  assertNoRawCanary(provenance.smoke, 'agentteam raw label canary 🚫', 'embedded helper provenance setPaneLabel smoke')
  assertIncludes(checksums, `${nativeRoot}/agentteam-tmuxSnapshotParse`, 'embedded helper checksum list')
  assertIncludes(checksums, `${nativeRoot}/manifest.json`, 'embedded helper checksum list')
  assertIncludes(checksums, `${nativeRoot}/provenance.json`, 'embedded helper checksum list')
  assertIncludes(checksums, `${nativeRoot}/attestation.intoto.jsonl`, 'embedded helper checksum list')
  assertIncludes(attestation, 'placeholderOnly', 'embedded helper attestation should remain placeholder-only')
}

function assertHistoricalRetention(root) {
  assertEveryRelExists(root, GO_TMUX_CUTOVER_BATCH3_SOURCE_FILES, 'Step 6 batch 3 current guard source files')
  assertEveryRelExists(root, STEP6_BATCH3_RETAINED_SUITES, 'Step 6 retained suites')
  assertEveryRelAbsent(root, STEP6_BATCH3_DELETION_CANDIDATE_SUITES, 'Step 6 batch 1/2/3 deleted read-only facade/orchestration and non-destructive window/label suites')
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

function writeJsonRpcHelperExecutable(name, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-step6-${name}-`))
  const file = path.join(dir, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return { dir, file }
}

async function assertWindowLabelMutationRuntimeSeam({ requireDist, distRoot } = {}) {
  if (typeof requireDist !== 'function' || !distRoot) return
  const corePath = path.join(distRoot, 'tmux/core.js')
  const kernelPath = path.join(distRoot, 'core/kernel.js')
  const labelsPath = path.join(distRoot, 'tmux/labels.js')
  clearDistModules(distRoot, ['tmux/labels.js'])
  const core = require(corePath)
  const kernel = require(kernelPath)
  const originals = {
    windowExists: core.windowExists,
    targetForPaneId: core.targetForPaneId,
    createAgentTeamKernelAdapter: kernel.createAgentTeamKernelAdapter,
  }
  const signal = new AbortController().signal
  const windowExistsCalls = []
  const targetForPaneIdCalls = []
  const adapterCalls = []
  try {
    core.windowExists = async (target, receivedSignal) => {
      windowExistsCalls.push({ target, signal: receivedSignal })
      return target !== 'missing:@1'
    }
    core.targetForPaneId = paneId => {
      targetForPaneIdCalls.push(paneId)
      if (paneId === '%lead' || paneId === '%worker' || paneId === '%clear') return 'team:@7'
      return null
    }
    kernel.createAgentTeamKernelAdapter = () => ({
      markWindowAsAgentTeamAsync: async (target, receivedSignal) => {
        adapterCalls.push({ operation: 'markWindowAsAgentTeam', target, signal: receivedSignal })
        return { ok: true, operation: 'markWindowAsAgentTeam', capability: 'workerLifecycle', target, marked: true, readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }
      },
      refreshWindowPaneLabelsAsync: async (target, receivedSignal) => {
        adapterCalls.push({ operation: 'refreshWindowPaneLabels', target, signal: receivedSignal })
        return { ok: true, operation: 'refreshWindowPaneLabels', capability: 'workerLifecycle', target, refreshed: true, readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }
      },
      setPaneLabelAsync: async (paneId, label, receivedSignal) => {
        adapterCalls.push({ operation: 'setPaneLabel', paneId, label, signal: receivedSignal })
        return { ok: true, operation: 'setPaneLabel', capability: 'workerLifecycle', paneId, labeled: true, readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }
      },
      clearPaneLabelAsync: async (paneId, receivedSignal) => {
        adapterCalls.push({ operation: 'clearPaneLabel', paneId, signal: receivedSignal })
        return { ok: true, operation: 'clearPaneLabel', capability: 'workerLifecycle', paneId, cleared: true, readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }
      },
    })
    clearDistModules(distRoot, ['tmux/labels.js'])
    const labels = require(labelsPath)

    await labels.markWindowAsAgentTeam('team:@7', signal)
    await labels.markWindowAsAgentTeam('missing:@1', signal)
    assert.deepEqual(windowExistsCalls.map(call => call.target), ['team:@7', 'missing:@1'], 'markWindowAsAgentTeam should check window existence before mutating')
    assert.deepEqual(adapterCalls.filter(call => call.operation === 'markWindowAsAgentTeam').map(call => call.target), ['team:@7'], 'markWindowAsAgentTeam should skip helper mutation when windowExists fails')

    windowExistsCalls.length = 0
    await labels.refreshWindowPaneLabels('team:@7', signal)
    await labels.refreshWindowPaneLabels('missing:@1', signal)
    assert.deepEqual(windowExistsCalls.map(call => call.target), ['team:@7', 'missing:@1'], 'refreshWindowPaneLabels should check window existence before mutating')
    assert.deepEqual(adapterCalls.filter(call => call.operation === 'refreshWindowPaneLabels').map(call => call.target), ['team:@7'], 'refreshWindowPaneLabels should skip helper mutation when windowExists fails')

    adapterCalls.length = 0
    const team = {
      members: {
        'team-lead': { name: 'team-lead', role: 'leader', paneId: '%lead', status: 'running' },
        worker: { name: 'worker-a', role: 'implementer', paneId: '%worker', status: 'queued' },
        detached: { name: 'detached-worker', role: 'researcher', windowTarget: 'fallback:@9', status: 'offline' },
      },
      tasks: {
        t1: { status: 'open' },
        t2: { status: 'blocked' },
      },
    }
    await labels.syncPaneLabelsForTeam(team, signal)
    const setCalls = adapterCalls.filter(call => call.operation === 'setPaneLabel')
    const refreshCalls = adapterCalls.filter(call => call.operation === 'refreshWindowPaneLabels')
    assert.deepEqual(setCalls.map(call => call.paneId), ['%lead', '%worker'], 'syncPaneLabelsForTeam should use private setPaneLabel for panes only')
    assert.equal(setCalls[0].label.includes('leader'), true, 'leader pane label should stay TypeScript-formatted')
    assert.equal(setCalls[1].label.includes('worker-a'), true, 'member pane label should stay TypeScript-formatted')
    assert.deepEqual(refreshCalls.map(call => call.target), ['team:@7', 'fallback:@9'], 'syncPaneLabelsForTeam should refresh each resolved pane target and member fallback window target once')
    assert.deepEqual(targetForPaneIdCalls.slice(-2), ['%lead', '%worker'], 'syncPaneLabelsForTeam should collect targets through targetForPaneId')

    adapterCalls.length = 0
    targetForPaneIdCalls.length = 0
    await labels.clearPaneLabelsForTeam({ members: {
      clear: { name: 'clear-worker', role: 'implementer', paneId: '%clear', status: 'idle' },
      fallback: { name: 'fallback-worker', role: 'researcher', windowTarget: 'fallback:@9', status: 'offline' },
    }, tasks: {} }, signal)
    assert.deepEqual(adapterCalls.filter(call => call.operation === 'clearPaneLabel').map(call => call.paneId), ['%clear'], 'clearPaneLabelsForTeam should use private clearPaneLabel for panes only')
    assert.deepEqual(adapterCalls.filter(call => call.operation === 'refreshWindowPaneLabels').map(call => call.target), ['team:@7', 'fallback:@9'], 'clearPaneLabelsForTeam should refresh resolved pane and fallback window targets')
    assert.deepEqual(targetForPaneIdCalls, ['%clear'], 'clearPaneLabelsForTeam should resolve pane target before fallback')
  } finally {
    core.windowExists = originals.windowExists
    core.targetForPaneId = originals.targetForPaneId
    kernel.createAgentTeamKernelAdapter = originals.createAgentTeamKernelAdapter
    delete require.cache[require.resolve(labelsPath)]
  }

  const missingHelper = path.join(distRoot, 'missing-step6-window-label-helper')
  const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: missingHelper, env: {} })
  const invalidMark = await adapter.markWindowAsAgentTeamAsync('bad target')
  assert.equal(invalidMark.ok, false)
  assert.equal(invalidMark.failureKind, 'invalid-target')
  const missingRefresh = await adapter.refreshWindowPaneLabelsAsync('team:@7')
  assert.equal(missingRefresh.ok, false)
  assert.equal(missingRefresh.operation, 'refreshWindowPaneLabels')
  const invalidLabel = await adapter.setPaneLabelAsync('%123', `${STEP6_RAW_LABEL_CANARY}${'x'.repeat(4096)}`)
  assert.equal(invalidLabel.ok, false)
  assert.equal(invalidLabel.failureKind, 'invalid-label')
  assertNoRawCanary(invalidLabel, STEP6_RAW_LABEL_CANARY, 'invalid setPaneLabel adapter result')
  const missingSet = await adapter.setPaneLabelAsync('%123', STEP6_RAW_LABEL_CANARY)
  assert.equal(missingSet.ok, false)
  assertNoRawCanary(missingSet, STEP6_RAW_LABEL_CANARY, 'missing helper setPaneLabel adapter result')
  const invalidClear = await adapter.clearPaneLabelAsync('not a pane')
  assert.equal(invalidClear.ok, false)
  assert.equal(invalidClear.failureKind, 'invalid-pane-id')
  const abortController = new AbortController()
  abortController.abort()
  const abortedClear = await adapter.clearPaneLabelAsync('%123', abortController.signal)
  assert.equal(abortedClear.ok, false)
  assert.equal(abortedClear.operation, 'clearPaneLabel')

  const malicious = writeJsonRpcHelperExecutable('malicious-label-output', `#!/usr/bin/env node
const fs = require('node:fs')
const request = JSON.parse(fs.readFileSync(0, 'utf8').trim())
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
const baseHealth = { ok: true, implementation: 'go', protocolVersion: 1, helperVersion: '0.3.0-read-model-shadow', capabilities: ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'], businessPathsConnected: false }
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'workerLifecycle' && request.params && request.params.operation === 'setPaneLabel') respond({ ok: false, operation: 'setPaneLabel', capability: 'workerLifecycle', paneId: '%123', labeled: false, status: 'unknown', resultMarker: 'stale', failureKind: 'tmux-command-failed', reason: 'bad label ${STEP6_RAW_LABEL_CANARY}', error: 'bad label ${STEP6_RAW_LABEL_CANARY}', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true })
else if (request.method === 'workerLifecycle' && request.params && request.params.operation === 'clearPaneLabel') respond({ ok: false, operation: 'clearPaneLabel', capability: 'workerLifecycle', paneId: '%123', cleared: false, status: 'unknown', resultMarker: 'stale', failureKind: 'tmux-command-failed', reason: '${STEP6_BAD_HELPER_OUTPUT}', error: '${STEP6_BAD_HELPER_OUTPUT}', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true })
else respond(baseHealth)
`)
  try {
    const maliciousAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: malicious.file, env: {} })
    const leakedSet = await maliciousAdapter.setPaneLabelAsync('%123', STEP6_RAW_LABEL_CANARY)
    assert.equal(leakedSet.ok, false)
    assert.equal(leakedSet.failureKind, 'tmux-command-failed')
    assertNoRawCanary(leakedSet, STEP6_RAW_LABEL_CANARY, 'malicious setPaneLabel helper result')
    const leakedClear = await maliciousAdapter.clearPaneLabelAsync('%123')
    assert.equal(leakedClear.ok, false)
    assert.equal(leakedClear.failureKind, 'tmux-command-failed')
    assertNoRawCanary(leakedClear, STEP6_BAD_HELPER_OUTPUT, 'malicious clearPaneLabel helper result')
  } finally {
    fs.rmSync(malicious.dir, { recursive: true, force: true })
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
    assert.equal(await tmuxProcess.waitForPaneAppStart('%shell', 25), false)
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
  assertWindowLabelMutationFixtureContracts()
  assertReadOnlyFacadeSourceBoundaries(root)
  assertMutationFacadeSourceBoundaries(root)
  assertGoHelperOperationSurface(root)
  assertReadOnlyFacadeDirectGoBehavior(root)
  assertNonDestructiveMutationDirectGoBehavior(root)
  assertPackageNativeBoundaries(root)
  assertHistoricalRetention(root)
  assertGoTmuxCutoverBatch3RuntimeSeam(requireDist)
  await assertReadOnlyWindowSessionOrchestrationRuntimeSeam({ requireDist, distRoot })
  await assertWindowLabelMutationRuntimeSeam({ requireDist, distRoot })
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
  assertNonDestructiveMutationDirectGoBehavior,
  assertReadOnlyWindowSessionOrchestrationRuntimeSeam,
  assertWindowLabelMutationRuntimeSeam,
  assertMutationFacadeSourceBoundaries,
  assertPackageNativeBoundaries,
  assertReadOnlyFacadeSourceBoundaries,
  assertStep6Batch3AuditMap,
}
