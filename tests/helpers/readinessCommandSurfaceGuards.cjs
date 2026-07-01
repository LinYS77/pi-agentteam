const assert = require('node:assert/strict')
const {
  assertIncludes,
  existsRel,
  readRel,
} = require('./fsAssertions.cjs')

const READINESS_COMMAND_SURFACE_GUARD_HELPER = 'tests/helpers/readinessCommandSurfaceGuards.cjs'
const READINESS_COMMAND_SURFACE_GUARD_SUITE = 'tests/suites/readiness-command-surface-guard.cjs'

const READINESS_COMMAND_SURFACE_CATEGORIES = Object.freeze([
  'single-team-command-entrypoint',
  'minimal-readiness-subcommand-parser',
  'readiness-routes-before-panel',
  'compact-safe-diagnostics-output',
  'readiness-read-only-no-runtime-control',
  'no-model-callable-readiness-tool',
  'no-ambient-panel-readiness-rendering',
  'diagnostics-helper-seam-stable',
  'no-package-release-default-native-fallback-control-surface',
])

const READINESS_COMMAND_SURFACE_CATEGORY_DESCRIPTIONS = Object.freeze({
  'single-team-command-entrypoint': 'Only the existing /team command is registered; readiness remains a bounded /team subcommand and does not add a top-level command.',
  'minimal-readiness-subcommand-parser': 'The readiness parser accepts only the exact trimmed readiness literal and has no nested options/subcommands.',
  'readiness-routes-before-panel': 'The /team command routes explicit readiness before opening the ambient panel; normal /team behavior remains panel-driven.',
  'compact-safe-diagnostics-output': 'Readiness output is deterministic compact diagnostics with only allowed fields and no raw paths/stdout/stderr/state/mailbox/full-text/package internals.',
  'readiness-read-only-no-runtime-control': 'Readiness handling is read-only: no fs/process/tmux/state/task/mailbox/report/pane/runtime mutation or control-plane APIs.',
  'no-model-callable-readiness-tool': 'Readiness is not registered as a model-callable tool or public tool surface.',
  'no-ambient-panel-readiness-rendering': 'Team panel, renderer, and input sources do not render readiness diagnostics ambiently.',
  'diagnostics-helper-seam-stable': 'Readiness uses only the compact kernel diagnostics list/format seam and preserves safe diagnostic summary fields.',
  'no-package-release-default-native-fallback-control-surface': 'Readiness sources do not expose package/release/default/native/fallback control-plane authority.',
})

const READINESS_COMMAND_SOURCE_FILES = Object.freeze([
  'commands/readiness.ts',
  'commands/team.ts',
  'api/commands.ts',
  'api/tools.ts',
  'commands/config.ts',
  'commands/shared.ts',
  'core/kernelDiagnostics.ts',
])

const READINESS_PANEL_SURFACE_FILES = Object.freeze([
  'teamPanel.ts',
  'renderers.ts',
  'teamPanel/dataSource.ts',
  'teamPanel/input.ts',
  'teamPanel/layout.ts',
  'teamPanel/readModel.ts',
  'teamPanel/viewModel.ts',
])

const READINESS_ALLOWED_OUTPUT_FIELDS = Object.freeze([
  'module=',
  'capability=',
  'status=',
  'resultMarker=',
  'failureKind=',
  'remediation=',
  'releaseDecision=',
])

const READINESS_FORBIDDEN_OUTPUT_TOKENS = Object.freeze([
  'helperPath=',
  'stdout=',
  'stderr=',
  'cutoverReason=',
  'rawTeamJson=',
  'mailbox/report',
  'packageInternal=',
  'process.env',
  'V0424_READINESS_HELPER_PATH_SHOULD_NOT_LEAK',
  'V0424_READINESS_STDOUT_SHOULD_NOT_LEAK',
  'V0424_READINESS_STDERR_SHOULD_NOT_LEAK',
  'V0424_READINESS_RAW_CUTOVER_REASON_SHOULD_NOT_LEAK',
  'V0424_READINESS_RAW_TEAM_JSON_SHOULD_NOT_LEAK',
  'V0424_READINESS_MAILBOX_REPORT_TEXT_SHOULD_NOT_LEAK',
])

const READINESS_SOURCE_FORBIDDEN_PATTERNS = Object.freeze([
  ['filesystem access', /node:fs|readFile|writeFile|rmSync|mkdir|unlink/i],
  ['child process or tmux control', /node:child_process|execFile|spawn\(|runTmux|captureTmuxSnapshot|listAgentTeamPanes|tmux\//i],
  ['state/mailbox/report/task mutation', /readMailbox|peekUnreadMailbox|pushMailbox|readReport|taskMutations|writeTeamState|deleteTeamState|report_done|report_blocked|agentteam_task|agentteam_receive/i],
  ['pane lifecycle/control', /reconcile|killPane|remove-member|delete-team|cleanup-all|worker lifecycle/i],
  ['panel rendering', /openTeamPanel|renderPanel|teamPanel\//i],
  ['registration side effects', /registerTool\(|registerCommand\(/i],
])

const READINESS_CONTROL_SURFACE_FORBIDDEN_PATTERNS = Object.freeze([
  ['npm mechanics', /npm\s+(?:version|publish|pack)|package\.json|optionalDependencies|lifecycle hook/i],
  ['release mechanics', /gh\s+release|git\s+(?:tag|push)|release asset|package release|install source approval/i],
  ['default/native/fallback authority', /default Go is enabled|default Go approval|default resolver approval|fallback deletion is approved|delete the TypeScript fallback|package-manager native delivery is complete/i],
  ['signing authority', /cosign proof|SLSA proof|signing is approved|security attestation is approved/i],
])

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function countMatches(source, pattern) {
  return (String(source).match(pattern) || []).length
}

function assertEveryFileExists(root, files, label) {
  for (const rel of files) assert.equal(existsRel(root, rel), true, `${rel} should exist for ${label}`)
}

function assertSingleTeamCommandEntrypoint(root, env) {
  const commandNames = [...env.pi.__commands.keys()].filter(name => name.startsWith('team'))
  assert.deepEqual(commandNames, ['team'], 'readiness must not add a top-level command outside /team')

  const apiCommands = readRel(root, 'api/commands.ts')
  assert.match(apiCommands, /registerAgentTeamCommands\(pi[\s\S]*registerTeamCommands\(pi, deps\)/, 'api commands should register only the team command composition surface')
  assert.equal(/readiness/i.test(apiCommands), false, 'api commands composition must not add a separate readiness command surface')

  const commandsSuite = readRel(root, 'tests/suites/commands.cjs')
  assertIncludes(commandsSuite, "assert.deepEqual([...pi.__commands.keys()].filter(name => name.startsWith('team')), ['team'])", 'commands suite')
}

function assertMinimalParser(root, env) {
  const readinessSource = readRel(root, 'commands/readiness.ts')
  assert.match(readinessSource, /args\.trim\(\)\.toLowerCase\(\) === 'readiness'/, 'readiness parser should accept exactly the trimmed readiness literal')
  assert.equal(countMatches(readinessSource, /=== 'readiness'/g), 1, 'readiness parser should have exactly one accepted literal')
  assert.equal(/args\.includes|args\.split|startsWith\('readiness|--[a-z]|case ['"]readiness|readiness:/.test(readinessSource), false, 'readiness parser must not grow nested subcommands or options')

  const readiness = env.helpers.requireDist('commands/readiness.js')
  const notifications = []
  const ctx = { ui: { notify: (message, level) => notifications.push({ message, level }) } }
  for (const args of ['readiness', ' readiness ', 'READINESS']) {
    const result = readiness.handleTeamReadinessCommand(args, ctx)
    assert.equal(result.handled, true, `${args} should be handled as explicit readiness`)
    assert.equal(result.level, 'info', `${args} should remain informational`)
  }
  for (const args of ['readiness --json', 'readiness status', 'readiness/status', 'ready', 'config readiness', '']) {
    const before = notifications.length
    const result = readiness.handleTeamReadinessCommand(args, ctx)
    assert.deepEqual(result, { handled: false }, `${args || '<empty>'} should not be handled by readiness`)
    assert.equal(notifications.length, before, `${args || '<empty>'} should not notify`)
  }
}

function assertRoutingBeforePanel(root) {
  const teamCommand = readRel(root, 'commands/team.ts')
  assert.match(teamCommand, /handleTeamConfigCommand\(args, ctx\)[\s\S]*if \(configResult\.handled\) return[\s\S]*handleTeamReadinessCommand\(args, ctx\)[\s\S]*if \(readinessResult\.handled\) return[\s\S]*openTeamPanel/, 'team command should route config, then explicit readiness, before opening the panel')
  assert.equal(countMatches(teamCommand, /'readiness'/g), 1, 'team command completions should expose exactly one readiness literal')
  assertIncludes(teamCommand, "'config init'", 'team command completions')
  assertIncludes(teamCommand, "'config migrate --dry-run'", 'team command completions')
}

function assertCompactSafeDiagnostics(root, env) {
  const diagnosticsSource = readRel(root, 'core/kernelDiagnostics.ts')
  const readinessSource = readRel(root, 'commands/readiness.ts')
  assertIncludes(readinessSource, 'listTmuxSnapshotParseFailureDiagnostics', 'readiness command source')
  assertIncludes(readinessSource, 'formatTmuxSnapshotParseFailureReadiness', 'readiness command source')
  assertIncludes(diagnosticsSource, 'formatTmuxSnapshotParseFailureReadiness', 'kernel diagnostics source')
  assertIncludes(diagnosticsSource, 'summarizeTmuxSnapshotParseFailureDiagnostic', 'kernel diagnostics source')

  const readiness = env.helpers.requireDist('commands/readiness.js')
  const { text, level } = readiness.buildReadinessText()
  assert.equal(level, 'info', 'readiness text should stay informational')
  assertIncludes(text, '[agentteam readiness] tmuxSnapshotParse compact diagnostics', 'readiness output')
  assertIncludes(text, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'readiness output')
  for (const field of READINESS_ALLOWED_OUTPUT_FIELDS) assertIncludes(text, field, 'readiness output')
  for (const failureKind of ['missing-helper', 'helper-unsupported-version', 'tmux-unavailable']) assertIncludes(text, `failureKind=${failureKind}`, 'readiness output')
  for (const token of READINESS_FORBIDDEN_OUTPUT_TOKENS) assert.equal(text.includes(token), false, `readiness output must not leak ${token}`)
  assert.equal(/\/tmp\/|\/home\/|[A-Z]:\\|\{\s*"team"|stack trace|Error:/.test(text), false, 'readiness output must not leak local paths, raw JSON, or stack traces')
}

function assertReadOnlyNoRuntimeControl(root, env) {
  const readinessSource = readRel(root, 'commands/readiness.ts')
  for (const [label, pattern] of READINESS_SOURCE_FORBIDDEN_PATTERNS) {
    assert.equal(pattern.test(readinessSource), false, `readiness command source must not include ${label}`)
  }

  const command = env.pi.__commands.get('team')
  assert.ok(command, '/team command should be registered')
  const originalCustom = env.leaderCtx.ui.custom
  let panelOpened = 0
  const teamNamesBefore = JSON.stringify(env.modules.state.listTeams().map(team => team.name).sort())
  const fullSuiteBefore = JSON.stringify(env.modules.state.readTeamState('full-suite-team') ?? null)
  const notificationsBefore = env.notifications.length
  env.leaderCtx.ui.custom = async () => {
    panelOpened += 1
    return { type: 'close' }
  }
  return Promise.resolve(command.handler('readiness', env.leaderCtx)).then(() => {
    env.leaderCtx.ui.custom = originalCustom
    assert.equal(panelOpened, 0, '/team readiness must not open the panel')
    assert.equal(env.notifications.length, notificationsBefore + 1, '/team readiness should emit exactly one notification')
    const message = env.notifications.at(-1).message
    assertIncludes(message, '[agentteam readiness] tmuxSnapshotParse compact diagnostics', '/team readiness notification')
    assert.equal(JSON.stringify(env.modules.state.listTeams().map(team => team.name).sort()), teamNamesBefore, '/team readiness must not create/delete teams')
    assert.equal(JSON.stringify(env.modules.state.readTeamState('full-suite-team') ?? null), fullSuiteBefore, '/team readiness must not mutate the full-suite team state')
  }, error => {
    env.leaderCtx.ui.custom = originalCustom
    throw error
  })
}

function assertNoModelCallableReadinessTool(root, env) {
  const toolNames = [...env.pi.__tools.keys()].sort()
  assert.deepEqual(toolNames.filter(name => /readiness|native|default|release|package/i.test(name)), [], 'readiness/native/default/package/release must not be model-callable tools')
  const apiTools = readRel(root, 'api/tools.ts')
  assert.equal(/readiness/i.test(apiTools), false, 'api tools must not register readiness')
  for (const expected of ['registerTeamTools', 'registerMessageTools', 'registerTaskTools', 'registerPlanRunTools']) assertIncludes(apiTools, expected, 'api tools')
}

function assertNoAmbientPanelReadinessRendering(root) {
  for (const rel of READINESS_PANEL_SURFACE_FILES) {
    const source = readRel(root, rel)
    assert.equal(/readiness|releaseDecision|platformHint|freshnessHint|remediation|failureKind=|resultMarker=/.test(source), false, `${rel} must not render readiness diagnostics ambiently`)
  }
}

function assertDiagnosticsHelperSeam(root) {
  const diagnosticsSource = readRel(root, 'core/kernelDiagnostics.ts')
  for (const expected of [
    'AgentTeamKernelCompactFailureDiagnostic',
    'AgentTeamKernelCompactDiagnosticReadinessSummary',
    'createTmuxSnapshotParseFailureDiagnostic',
    'listTmuxSnapshotParseFailureDiagnostics',
    'summarizeTmuxSnapshotParseFailureDiagnostic',
    'formatTmuxSnapshotParseFailureReadiness',
    'releaseDecision',
    'platformHint',
    'freshnessHint',
  ]) assertIncludes(diagnosticsSource, expected, 'kernel diagnostics seam')
  for (const forbidden of [/node:fs|node:child_process|process\.env|helperPath|stdout=|stderr=|mailbox\/report|full-text content|package internals/i]) {
    assert.equal(forbidden.test(diagnosticsSource), false, `kernel diagnostics seam must not include ${forbidden}`)
  }
}

function assertNoPackageReleaseDefaultNativeFallbackControlSurface(root) {
  for (const rel of ['commands/readiness.ts', 'commands/team.ts', 'api/commands.ts', 'api/tools.ts']) {
    const source = readRel(root, rel)
    for (const [label, pattern] of READINESS_CONTROL_SURFACE_FORBIDDEN_PATTERNS) {
      assert.equal(pattern.test(source), false, `${rel} must not expose ${label}`)
    }
  }
}

async function assertReadinessCommandSurface(root, env) {
  assertEveryFileExists(root, [
    ...READINESS_COMMAND_SOURCE_FILES,
    ...READINESS_PANEL_SURFACE_FILES,
    'tests/suites/commands.cjs',
    READINESS_COMMAND_SURFACE_GUARD_HELPER,
    READINESS_COMMAND_SURFACE_GUARD_SUITE,
  ], 'readiness command surface guard')

  const checked = new Set()
  const mark = async (category, assertion) => {
    await assertion()
    checked.add(category)
  }

  await mark('single-team-command-entrypoint', () => assertSingleTeamCommandEntrypoint(root, env))
  await mark('minimal-readiness-subcommand-parser', () => assertMinimalParser(root, env))
  await mark('readiness-routes-before-panel', () => assertRoutingBeforePanel(root))
  await mark('compact-safe-diagnostics-output', () => assertCompactSafeDiagnostics(root, env))
  await mark('readiness-read-only-no-runtime-control', () => assertReadOnlyNoRuntimeControl(root, env))
  await mark('no-model-callable-readiness-tool', () => assertNoModelCallableReadinessTool(root, env))
  await mark('no-ambient-panel-readiness-rendering', () => assertNoAmbientPanelReadinessRendering(root))
  await mark('diagnostics-helper-seam-stable', () => assertDiagnosticsHelperSeam(root))
  await mark('no-package-release-default-native-fallback-control-surface', () => assertNoPackageReleaseDefaultNativeFallbackControlSurface(root))

  const checkedCategories = sorted(checked)
  assert.deepEqual(checkedCategories, sorted(READINESS_COMMAND_SURFACE_CATEGORIES), 'readiness command surface guard should execute every category')
  return { checkedCategories }
}

module.exports = {
  READINESS_ALLOWED_OUTPUT_FIELDS,
  READINESS_COMMAND_SOURCE_FILES,
  READINESS_COMMAND_SURFACE_CATEGORIES,
  READINESS_COMMAND_SURFACE_CATEGORY_DESCRIPTIONS,
  READINESS_COMMAND_SURFACE_GUARD_HELPER,
  READINESS_COMMAND_SURFACE_GUARD_SUITE,
  READINESS_PANEL_SURFACE_FILES,
  assertReadinessCommandSurface,
}
