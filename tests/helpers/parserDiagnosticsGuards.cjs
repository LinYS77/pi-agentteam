const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const {
  assertIncludes,
  existsRel,
  readRel,
} = require('./fsAssertions.cjs')
const snapshotFixtures = require('../fixtures/kernel/tmux/snapshotCases.cjs')

const PARSER_DIAGNOSTICS_GUARD_HELPER = 'tests/helpers/parserDiagnosticsGuards.cjs'
const PARSER_DIAGNOSTICS_GUARD_SUITE = 'tests/suites/go-kernel-parser-diagnostics-guard.cjs'
const PARSER_PARITY_FIXTURE = 'tests/fixtures/kernel/tmux/snapshotCases.cjs'

const PARSER_DIAGNOSTICS_CATEGORIES = Object.freeze([
  'parser-parity-fixture-suite-evidence',
  'canonical-snapshot-parse-parity',
  'helper-failure-taxonomy-complete',
  'fail-closed-parser-unavailable-snapshots',
  'compact-diagnostics-source-seam-stable',
  'compact-readiness-format-no-leaks',
  'diagnostics-behavior-suite-evidence',
])

const PARSER_DIAGNOSTICS_CATEGORY_DESCRIPTIONS = Object.freeze({
  'parser-parity-fixture-suite-evidence': 'The canonical tmux snapshot fixture and parser parity suite remain present as current non-historical behavior evidence.',
  'canonical-snapshot-parse-parity': 'The TypeScript entrypoint and current Go kernel adapter parse the canonical snapshot fixture corpus into identical compact snapshots without hidden fallback.',
  'helper-failure-taxonomy-complete': 'The helper failure vocabulary, compact diagnostics mappings, safe keys, and no-leak constraints stay complete and stable.',
  'fail-closed-parser-unavailable-snapshots': 'Parser-unavailable paths return ok:false unknown/stale snapshots with compact cutover failure kinds, no false successful empty snapshot, no migration fallback, and no leaked helper details.',
  'compact-diagnostics-source-seam-stable': 'core/kernelDiagnostics.ts remains a pure compact diagnostics seam over core/kernel.ts failure kinds and does not import runtime, filesystem, child process, or state surfaces.',
  'compact-readiness-format-no-leaks': 'Readiness formatting emits only compact diagnostics fields and never raw helper paths/stdout/stderr/team JSON/mailbox/report/native package internals.',
  'diagnostics-behavior-suite-evidence': 'Current behavior suites for parser parity, cutover failure classes, compact diagnostics model/readiness, and parser failure policy remain present as supporting evidence outside historical docs suites.',
})

const PARSER_DIAGNOSTICS_SOURCE_FILES = Object.freeze([
  'core/kernel.ts',
  'core/kernelDiagnostics.ts',
  'tmux/snapshot.ts',
  'teamPanel/dataSource.ts',
  'adapters/tmux/teamPanes.ts',
  'commands/readiness.ts',
])

const PARSER_DIAGNOSTICS_SUPPORTING_SUITES = Object.freeze([
  'tests/suites/go-kernel-tmux-snapshot-parser.cjs',
  'tests/suites/go-kernel-tmux-cutover-failure-classes.cjs',
  'tests/suites/go-kernel-v0423-compact-diagnostics-model.cjs',
  'tests/suites/go-kernel-v0423-parser-failure-policy.cjs',
  'tests/suites/go-kernel-v0423-compact-diagnostics-readiness.cjs',
])

const PARSER_DIAGNOSTICS_SUPPORTING_FIXTURES = Object.freeze([
  PARSER_PARITY_FIXTURE,
])

const EXPECTED_FAILURE_KINDS = Object.freeze([
  'missing-helper',
  'disabled-helper',
  'helper-unsupported-protocol',
  'helper-unsupported-version',
  'helper-unsupported-capability',
  'helper-timeout',
  'helper-spawn-error',
  'helper-crash',
  'helper-nonzero-exit',
  'helper-empty-response',
  'helper-malformed-json',
  'helper-jsonrpc-error',
  'helper-incompatible-response',
  'helper-unsafe-response-shape',
  'previous-helper-failure',
  'tmux-command-timeout',
  'tmux-command-failed',
  'tmux-unavailable',
])

const HELPER_FAILURE_KINDS = Object.freeze([
  'missing-helper',
  'disabled-helper',
  'helper-unsupported-protocol',
  'helper-unsupported-version',
  'helper-unsupported-capability',
  'helper-timeout',
  'helper-spawn-error',
  'helper-crash',
  'helper-nonzero-exit',
  'helper-empty-response',
  'helper-malformed-json',
  'helper-jsonrpc-error',
  'helper-incompatible-response',
  'helper-unsafe-response-shape',
  'previous-helper-failure',
])

const SAFE_DIAGNOSTIC_KEYS = Object.freeze(['module', 'capability', 'status', 'resultMarker', 'failureKind', 'remediation', 'platformHint', 'freshnessHint', 'releaseDecision'].sort())
const SAFE_SUMMARY_KEYS = Object.freeze(['module', 'capability', 'status', 'resultMarker', 'failureKind', 'summary', 'remediation', 'hint', 'releaseDecision'].sort())
const READINESS_ALLOWED_FIELDS = Object.freeze([
  'module=',
  'capability=',
  'status=',
  'resultMarker=',
  'failureKind=',
  'remediation=',
  'releaseDecision=',
])

const FORBIDDEN_LEAK_TOKENS = Object.freeze([
  'helperPath=',
  'stdout=',
  'stderr=',
  'cutoverReason=',
  'rawTeamJson=',
  'mailbox/report',
  'TaskReport body',
  'team.json',
  'raw state',
  'sidecar/cache/index/raw',
  'hidden runtime state',
  'packageInternal=',
  '@earendil-works/agentteam-native-readiness-internal',
  '@earendil-works/agentteam-native-secret-internal',
  'PARSER_DIAGNOSTICS_HELPER_PATH_SHOULD_NOT_LEAK',
  'PARSER_DIAGNOSTICS_STDOUT_SHOULD_NOT_LEAK',
  'PARSER_DIAGNOSTICS_STDERR_SHOULD_NOT_LEAK',
  'PARSER_DIAGNOSTICS_RAW_TEAM_JSON_SHOULD_NOT_LEAK',
  'PARSER_DIAGNOSTICS_MAILBOX_REPORT_TEXT_SHOULD_NOT_LEAK',
  'PARSER_DIAGNOSTICS_RAW_STATE_SHOULD_NOT_LEAK',
  'PARSER_DIAGNOSTICS_STACK_TRACE_SHOULD_NOT_LEAK',
  'V0419_READINESS_HELPER_PATH_SHOULD_NOT_LEAK',
  'V0419_READINESS_STDOUT_SHOULD_NOT_LEAK',
  'V0419_READINESS_STDERR_SHOULD_NOT_LEAK',
  'V0423_HELPER_PATH_SHOULD_NOT_LEAK',
  'V0423_STDOUT_SHOULD_NOT_LEAK',
  'V0423_STDERR_SHOULD_NOT_LEAK',
  'V0423_MAILBOX_REPORT_TEXT_SHOULD_NOT_LEAK',
  'V0423_READINESS_HELPER_PATH_SHOULD_NOT_LEAK',
  'V0423_READINESS_STDOUT_SHOULD_NOT_LEAK',
  'V0423_READINESS_STDERR_SHOULD_NOT_LEAK',
  'V0423_READINESS_MAILBOX_REPORT_TEXT_SHOULD_NOT_LEAK',
])

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function assertEveryFileExists(root, files, label) {
  for (const rel of files) assert.equal(existsRel(root, rel), true, `${rel} should exist for ${label}`)
}

function compactSnapshot(snapshot) {
  return {
    capturedAt: snapshot.capturedAt,
    ok: snapshot.ok,
    panes: (snapshot.panes || []).map(item => ({
      paneId: item.paneId,
      target: item.target,
      label: item.label,
      currentCommand: item.currentCommand,
    })),
    byPaneId: Object.fromEntries(Object.entries(snapshot.byPaneId || {}).map(([paneId, item]) => [paneId, {
      paneId: item.paneId,
      target: item.target,
      label: item.label,
      currentCommand: item.currentCommand,
    }])),
    ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
  }
}

function assertCanonicalSnapshot(actual, expected, label) {
  const compact = compactSnapshot(actual)
  assert.deepEqual(compact, expected, label)
  assert.equal(compact.ok, true, `${label} should set ok:true`)
  assert.equal(Object.prototype.hasOwnProperty.call(compact, 'error'), false, `${label} should not include error on parse success`)
  assert.deepEqual(Object.keys(compact.byPaneId).sort(), compact.panes.map(item => item.paneId).sort(), `${label} byPaneId should contain every pane id`)
  for (const item of compact.panes) assert.deepEqual(compact.byPaneId[item.paneId], item, `${label} byPaneId entry should mirror pane item`)
}

function assertNoForbiddenLeaks(value, label) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  for (const token of FORBIDDEN_LEAK_TOKENS) {
    assert.equal(serialized.includes(token), false, `${label} must not leak ${token}`)
  }
  assert.equal(/\/tmp\/parser-diagnostics-|\/home\/[^\s"']+|[A-Z]:\\/.test(serialized), false, `${label} must not leak local filesystem paths`)
}

function assertSafeKeySubset(value, safeKeys, label) {
  const keys = Object.keys(value).sort()
  assert.deepEqual(keys, keys.filter(key => safeKeys.includes(key)), `${label} should only expose safe keys`)
}

function assertParserParityFixtureSuiteEvidence(root) {
  assertEveryFileExists(root, [
    PARSER_PARITY_FIXTURE,
    ...PARSER_DIAGNOSTICS_SUPPORTING_SUITES,
  ], 'parser parity fixture/suite evidence')

  const cases = snapshotFixtures.cases()
  assert.ok(cases.length >= 10, 'parser parity fixture should keep a representative canonical corpus')
  assert.ok(cases.some(testCase => testCase.name === 'mixed corpus canonical snapshot'), 'parser parity fixture should keep the mixed canonical corpus')
  assert.ok(cases.some(testCase => testCase.name === 'sentinel-like label remains compact tmux label'), 'parser parity fixture should keep compact sentinel-like label coverage')

  const parserSuite = readRel(root, 'tests/suites/go-kernel-tmux-snapshot-parser.cjs')
  for (const expected of [
    '../fixtures/kernel/tmux/snapshotCases.cjs',
    'assertAllFixturesWithParser',
    'default embedded Go parser',
    'default Go parser must not call TypeScript parser fallback',
    'missing Go helper must not call TypeScript parser fallback',
    'assertBoundaryScans',
  ]) assertIncludes(parserSuite, expected, 'parser parity suite')
}

function assertCanonicalSnapshotParseParity(root, env) {
  const kernel = env.helpers.requireDist('core/kernel.js')
  const snapshotModule = env.helpers.requireDist('tmux/snapshot.js')
  const cases = snapshotFixtures.cases()

  for (const testCase of cases) {
    const parsed = snapshotModule.parseTmuxPaneSnapshot(testCase.stdout, testCase.capturedAt)
    assertCanonicalSnapshot(parsed, testCase.expected, `TypeScript entrypoint parser parity: ${testCase.name}`)
  }

  const defaultAdapter = kernel.createAgentTeamKernelAdapter({ env: {} })
  for (const testCase of cases) {
    const parsed = defaultAdapter.parseTmuxPaneSnapshot(testCase.stdout, testCase.capturedAt, () => {
      throw new Error('canonical parser diagnostics guard must not call TypeScript parser fallback from default Go')
    })
    assertCanonicalSnapshot(parsed, testCase.expected, `default Go adapter parser parity: ${testCase.name}`)
  }
  const metadata = defaultAdapter.metadata()
  assert.equal(metadata.kernel.requestedMode, 'default', 'default parser parity adapter should preserve default requested mode')
  assert.equal(metadata.kernel.mode, 'go', 'default parser parity adapter should use current embedded Go')
  assert.equal(metadata.kernel.enabled, true, 'default parser parity adapter should enable parser-only Go')
  assert.equal(metadata.kernel.cutoverStatus, 'active', 'default parser parity adapter should be active')
  assert.equal(metadata.kernel.fallbacks, 0, 'default parser parity adapter must not use migration fallback')
  assert.ok(metadata.kernel.calls >= cases.length, 'default parser parity adapter should call the helper for the fixture corpus')
}

function assertHelperFailureTaxonomy(root, env) {
  const kernel = env.helpers.requireDist('core/kernel.js')
  const diagnostics = env.helpers.requireDist('core/kernelDiagnostics.js')
  assert.deepEqual(kernel.AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS, EXPECTED_FAILURE_KINDS, 'cutover failure vocabulary should remain stable')
  for (const failureKind of HELPER_FAILURE_KINDS) {
    assert.equal(kernel.AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS.includes(failureKind), true, `${failureKind} helper failure kind should remain represented`)
  }

  const allDiagnostics = diagnostics.listTmuxSnapshotParseFailureDiagnostics()
  assert.equal(allDiagnostics.length, EXPECTED_FAILURE_KINDS.length, 'diagnostics should expose one row per failure kind')
  assert.deepEqual(allDiagnostics.map(item => item.failureKind), EXPECTED_FAILURE_KINDS, 'diagnostics should preserve failure kind order')

  for (const failureKind of EXPECTED_FAILURE_KINDS) {
    const diagnostic = diagnostics.createTmuxSnapshotParseFailureDiagnostic(failureKind)
    assertSafeKeySubset(diagnostic, SAFE_DIAGNOSTIC_KEYS, `${failureKind} diagnostic`)
    assert.equal(diagnostic.module, 'tmuxSnapshotParse', `${failureKind} diagnostic module`)
    assert.equal(diagnostic.capability, 'tmuxSnapshotParse', `${failureKind} diagnostic capability`)
    assert.equal(diagnostic.status, 'unknown', `${failureKind} diagnostic status`)
    assert.equal(diagnostic.resultMarker, 'stale', `${failureKind} diagnostic result marker`)
    assert.equal(diagnostic.failureKind, failureKind, `${failureKind} diagnostic failure kind`)
    assert.equal(diagnostic.releaseDecision, 'docs/perf/v0.4.23-compact-native-failure-diagnostics.md', `${failureKind} diagnostic release decision`)
    assert.ok(diagnostic.remediation.length > 0 && diagnostic.remediation.length <= 140, `${failureKind} diagnostic remediation should be compact`)
    assert.ok(diagnostic.platformHint || diagnostic.freshnessHint, `${failureKind} diagnostic should keep a compact platform/freshness hint`)
    if (diagnostic.platformHint) assert.ok(diagnostic.platformHint.length <= 120, `${failureKind} platform hint should be compact`)
    if (diagnostic.freshnessHint) assert.ok(diagnostic.freshnessHint.length <= 120, `${failureKind} freshness hint should be compact`)
    assertNoForbiddenLeaks(diagnostic, `${failureKind} diagnostic`)

    const summary = diagnostics.summarizeTmuxSnapshotParseFailureDiagnostic(diagnostic)
    assertSafeKeySubset(summary, SAFE_SUMMARY_KEYS, `${failureKind} summary`)
    assert.equal(summary.failureKind, failureKind, `${failureKind} summary failure kind`)
    assert.ok(summary.summary.includes('tmuxSnapshotParse unknown/stale'), `${failureKind} summary should include compact unknown/stale text`)
    assert.ok(summary.summary.includes(failureKind), `${failureKind} summary should include failure kind`)
    assert.ok(summary.summary.length <= 96, `${failureKind} summary should stay compact`)
    assertNoForbiddenLeaks(summary, `${failureKind} summary`)

    const formatted = diagnostics.formatTmuxSnapshotParseFailureReadiness(diagnostic)
    for (const field of READINESS_ALLOWED_FIELDS) assertIncludes(formatted, field, `${failureKind} formatted readiness`)
    assertIncludes(formatted, `failureKind=${failureKind}`, `${failureKind} formatted readiness`)
    assert.ok(formatted.length <= 420, `${failureKind} formatted readiness should stay compact`)
    assertNoForbiddenLeaks(formatted, `${failureKind} formatted readiness`)
  }
}

function assertFailClosedSnapshot(snapshot, expectedKind, label) {
  assert.equal(snapshot.ok, false, `${label} should return ok:false`)
  assert.equal(snapshot.status, 'unknown', `${label} should return unknown status`)
  assert.equal(snapshot.resultMarker, 'stale', `${label} should return stale marker`)
  assert.equal(snapshot.module, 'tmuxSnapshotParse', `${label} should expose parser module`)
  assert.equal(snapshot.capability, 'tmuxSnapshotParse', `${label} should expose parser capability`)
  assert.equal(snapshot.cutoverFailureKind, expectedKind, `${label} should expose compact failure kind`)
  assert.deepEqual(snapshot.panes, [], `${label} should not return parsed panes`)
  assert.deepEqual(snapshot.byPaneId, {}, `${label} should not return a pane index`)
  assert.notEqual(snapshot.ok, true, `${label} must not be a false successful empty snapshot`)
  assert.match(snapshot.reason, new RegExp(`Go kernel cutover unavailable \\(${expectedKind}\\)`), `${label} should include compact reason`)
  assert.match(snapshot.error, new RegExp(`Go kernel cutover unavailable \\(${expectedKind}\\)`), `${label} should include compact error`)
  assert.ok(String(snapshot.reason).length <= 220, `${label} reason should stay compact`)
  assert.ok(String(snapshot.error).length <= 220, `${label} error should stay compact`)
  assertNoForbiddenLeaks(snapshot, `${label} snapshot`)
}

function assertFailClosedMetadata(metadata, expectedKind, expectedMode, label) {
  assert.equal(metadata.kernel.requestedMode, expectedMode, `${label} metadata requested mode`)
  assert.equal(metadata.kernel.mode, 'typescript', `${label} metadata should disable helper after parser failure`)
  assert.equal(metadata.kernel.enabled, false, `${label} metadata should not report active Go after parser failure`)
  assert.equal(metadata.kernel.fallbacks, 0, `${label} metadata should not increment migration fallback count`)
  assert.equal(metadata.kernel.cutoverModule, 'tmuxSnapshotParse', `${label} metadata cutover module`)
  assert.equal(metadata.kernel.cutoverStatus, 'unavailable', `${label} metadata cutover status`)
  assert.equal(metadata.kernel.cutoverFailureKind, expectedKind, `${label} metadata failure kind`)
  assert.match(metadata.kernel.cutoverReason, new RegExp(`Go kernel cutover unavailable \\(${expectedKind}\\)`), `${label} metadata compact reason`)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false, `${label} metadata should not expose fallbackKind`)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackReason'), false, `${label} metadata should not expose fallbackReason`)
  assertNoForbiddenLeaks(metadata, `${label} metadata`)
}

function assertFailClosedParserUnavailable(root, env) {
  const kernel = env.helpers.requireDist('core/kernel.js')
  const capturedAt = 1700009000000
  const sentinelStdout = '%secret\t/tmp/parser-diagnostics-repo-SHOULD_NOT_LEAK\tPARSER_DIAGNOSTICS_MAILBOX_REPORT_TEXT_SHOULD_NOT_LEAK\tpi'
  const missingHelperPath = path.join(os.tmpdir(), 'parser-diagnostics-helper-PARSER_DIAGNOSTICS_HELPER_PATH_SHOULD_NOT_LEAK', 'missing-helper')

  for (const [mode, expectedMode] of [['go-cutover', 'go-cutover'], ['go', 'go']]) {
    let fallbackCalls = 0
    const adapter = kernel.createAgentTeamKernelAdapter({ mode, helperPath: missingHelperPath, env: { PATH: process.env.PATH || '' } })
    const snapshot = adapter.parseTmuxPaneSnapshot(sentinelStdout, capturedAt, () => {
      fallbackCalls += 1
      throw new Error('parser diagnostics guard must not call TypeScript parser fallback on parser-unavailable paths')
    })
    assert.equal(fallbackCalls, 0, `${mode} missing helper must not call TypeScript parser fallback`)
    assertFailClosedSnapshot(snapshot, 'missing-helper', `${mode} missing helper`)
    assertFailClosedMetadata(adapter.metadata(), 'missing-helper', expectedMode, `${mode} missing helper`)
  }

  const disabledAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'disabled', env: {} })
  const disabledSnapshot = disabledAdapter.parseTmuxPaneSnapshot(sentinelStdout, capturedAt + 1)
  assertFailClosedSnapshot(disabledSnapshot, 'previous-helper-failure', 'disabled parser')
  assert.equal(disabledAdapter.metadata().kernel.fallbacks, 0, 'disabled parser should not use migration fallback')
  if (Object.prototype.hasOwnProperty.call(disabledAdapter.metadata().kernel, 'cutoverFailureKind')) {
    assert.equal(disabledAdapter.metadata().kernel.cutoverFailureKind, 'previous-helper-failure', 'disabled parser metadata should only expose compact previous-helper-failure')
    assert.match(disabledAdapter.metadata().kernel.cutoverReason, /Go kernel cutover unavailable \(previous-helper-failure\)/, 'disabled parser metadata should include only compact previous-helper-failure reason')
    assertNoForbiddenLeaks(disabledAdapter.metadata(), 'disabled parser metadata')
  }

  const dataSource = readRel(root, 'teamPanel/dataSource.ts')
  const runtime = readRel(root, 'adapters/tmux/teamPanes.ts')
  assert.match(dataSource, /snapshotForOrphanDiscovery/, 'team panel data source should isolate parser-unavailable orphan discovery')
  assert.match(dataSource, /snapshot\.module === 'tmuxSnapshotParse'/, 'team panel data source should require parser module marker')
  assert.match(dataSource, /snapshot\.capability === 'tmuxSnapshotParse'/, 'team panel data source should require parser capability marker')
  assert.match(dataSource, /Boolean\(snapshot\.cutoverFailureKind\)/, 'team panel data source should require parser failure marker')
  assert.match(dataSource, /snapshot\?\.ok === false \? undefined : snapshot/, 'generic parser-unavailable snapshots should not become false empty successful pane lists')
  assert.match(runtime, /snapshot\?\.ok === false[\s\S]*return false/, 'tmux reconcile should short-circuit parser-unavailable snapshots non-destructively')
}

function assertCompactDiagnosticsSourceSeam(root) {
  const diagnosticsSource = readRel(root, 'core/kernelDiagnostics.ts')
  const kernelSource = readRel(root, 'core/kernel.ts')
  for (const expected of [
    'AgentTeamKernelCompactFailureDiagnostic',
    'AgentTeamKernelCompactDiagnosticReadinessSummary',
    'createTmuxSnapshotParseFailureDiagnostic',
    'listTmuxSnapshotParseFailureDiagnostics',
    'summarizeTmuxSnapshotParseFailureDiagnostic',
    'formatTmuxSnapshotParseFailureReadiness',
    'AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS',
    'AGENTTEAM_KERNEL_CUTOVER_MODULE',
    'RELEASE_DECISION_DOC',
  ]) assertIncludes(diagnosticsSource, expected, 'compact diagnostics source seam')

  for (const forbiddenPattern of [/from ['"]node:/, /require\(['"]node:/, /node:fs/, /node:child_process/, /spawnSync\b/, /execFile\b/, /process\.env/, /process\.cwd/, /readFile\b/, /writeFile\b/, /tmux\/client/, /state\//]) {
    assert.equal(forbiddenPattern.test(diagnosticsSource), false, `compact diagnostics source seam should stay pure and not match ${forbiddenPattern}`)
  }
  for (const forbiddenToken of ['helperPath', 'stdout=', 'stderr=', 'mailbox/report', 'full-text content', 'package internals']) {
    assert.equal(diagnosticsSource.includes(forbiddenToken), false, `compact diagnostics source seam should not include ${forbiddenToken}`)
  }

  for (const expected of [
    'export const AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS',
    'function cutoverMessage',
    'function toMigrationFallbackKind',
    'function cutoverUnavailableSnapshot',
    'function validateTmuxSnapshotResult',
    'compactKernelText',
    'resultMarker: \'stale\'',
    'status: \'unknown\'',
  ]) assertIncludes(kernelSource, expected, 'kernel parser diagnostics seam')
}

function assertCompactReadinessFormatNoLeaks(root, env) {
  const readinessSource = readRel(root, 'commands/readiness.ts')
  assertIncludes(readinessSource, 'listTmuxSnapshotParseFailureDiagnostics', 'readiness source')
  assertIncludes(readinessSource, 'formatTmuxSnapshotParseFailureReadiness', 'readiness source')
  assert.equal(/helperPath|stdout=|stderr=|cutoverReason|rawTeamJson|mailbox\/report|TaskReport/.test(readinessSource), false, 'readiness source should not add raw diagnostic leak fields')

  const readiness = env.helpers.requireDist('commands/readiness.js')
  const { text, level } = readiness.buildReadinessText()
  assert.equal(level, 'info', 'readiness diagnostics should remain informational')
  assertIncludes(text, '[agentteam readiness] tmuxSnapshotParse compact diagnostics', 'readiness text')
  assertIncludes(text, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'readiness text')
  const lines = text.split('\n')
  assert.equal(lines.length, EXPECTED_FAILURE_KINDS.length + 2, 'readiness text should include one compact line per failure kind plus headers')
  for (const field of READINESS_ALLOWED_FIELDS) assertIncludes(text, field, 'readiness text')
  for (const failureKind of EXPECTED_FAILURE_KINDS) assertIncludes(text, `failureKind=${failureKind}`, 'readiness text')
  assertNoForbiddenLeaks(text, 'readiness text')
  assert.equal(/\/tmp\/|\/home\/|[A-Z]:\\|\{\s*"team"|stack trace|Error:/.test(text), false, 'readiness text must not leak local paths, raw JSON, or stack traces')
}

function assertDiagnosticsBehaviorSuiteEvidence(root) {
  for (const rel of PARSER_DIAGNOSTICS_SUPPORTING_SUITES) assert.equal(existsRel(root, rel), true, `${rel} should remain as parser diagnostics behavior evidence`)
  const parserSuite = readRel(root, 'tests/suites/go-kernel-tmux-snapshot-parser.cjs')
  const failureSuite = readRel(root, 'tests/suites/go-kernel-tmux-cutover-failure-classes.cjs')
  const modelSuite = readRel(root, 'tests/suites/go-kernel-v0423-compact-diagnostics-model.cjs')
  const policySuite = readRel(root, 'tests/suites/go-kernel-v0423-parser-failure-policy.cjs')
  const readinessSuite = readRel(root, 'tests/suites/go-kernel-v0423-compact-diagnostics-readiness.cjs')

  for (const expected of ['assertAllFixturesWithParser', 'assertBoundaryScans', 'missing Go helper must not call TypeScript parser fallback']) assertIncludes(parserSuite, expected, 'parser parity behavior suite')
  for (const expected of ['AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS', 'assertCutoverFailure', 'assertNoSentinelLeaks', 'helper-unsafe-response-shape', 'previous-helper-failure']) assertIncludes(failureSuite, expected, 'cutover failure behavior suite')
  for (const expected of ['EXPECTED_FAILURE_KINDS', 'SAFE_KEYS', 'createTmuxSnapshotParseFailureDiagnostic', 'listTmuxSnapshotParseFailureDiagnostics']) assertIncludes(modelSuite, expected, 'compact diagnostics model behavior suite')
  for (const expected of ['assertFailClosedPolicy', 'assertPanelBoundarySource', 'helper-unsafe-response-shape', 'TypeScript parser fallback must not be called']) assertIncludes(policySuite, expected, 'parser failure policy behavior suite')
  for (const expected of ['formatTmuxSnapshotParseFailureReadiness', 'FORBIDDEN_SENTINELS', 'assertNoForbiddenLeaks', 'assertRuntimeUiQuiet']) assertIncludes(readinessSuite, expected, 'compact diagnostics readiness behavior suite')
}

async function assertParserDiagnosticsGuard(root, env) {
  assertEveryFileExists(root, [
    PARSER_DIAGNOSTICS_GUARD_HELPER,
    PARSER_DIAGNOSTICS_GUARD_SUITE,
    ...PARSER_DIAGNOSTICS_SOURCE_FILES,
    ...PARSER_DIAGNOSTICS_SUPPORTING_FIXTURES,
    ...PARSER_DIAGNOSTICS_SUPPORTING_SUITES,
  ], 'parser diagnostics guard')

  const checked = new Set()
  const mark = async (category, assertion) => {
    await assertion()
    checked.add(category)
  }

  await mark('parser-parity-fixture-suite-evidence', () => assertParserParityFixtureSuiteEvidence(root))
  await mark('canonical-snapshot-parse-parity', () => assertCanonicalSnapshotParseParity(root, env))
  await mark('helper-failure-taxonomy-complete', () => assertHelperFailureTaxonomy(root, env))
  await mark('fail-closed-parser-unavailable-snapshots', () => assertFailClosedParserUnavailable(root, env))
  await mark('compact-diagnostics-source-seam-stable', () => assertCompactDiagnosticsSourceSeam(root))
  await mark('compact-readiness-format-no-leaks', () => assertCompactReadinessFormatNoLeaks(root, env))
  await mark('diagnostics-behavior-suite-evidence', () => assertDiagnosticsBehaviorSuiteEvidence(root))

  const checkedCategories = sorted(checked)
  assert.deepEqual(checkedCategories, sorted(PARSER_DIAGNOSTICS_CATEGORIES), 'parser diagnostics guard should execute every category')
  return { checkedCategories }
}

module.exports = {
  EXPECTED_FAILURE_KINDS,
  PARSER_DIAGNOSTICS_CATEGORIES,
  PARSER_DIAGNOSTICS_CATEGORY_DESCRIPTIONS,
  PARSER_DIAGNOSTICS_GUARD_HELPER,
  PARSER_DIAGNOSTICS_GUARD_SUITE,
  PARSER_DIAGNOSTICS_SOURCE_FILES,
  PARSER_DIAGNOSTICS_SUPPORTING_FIXTURES,
  PARSER_DIAGNOSTICS_SUPPORTING_SUITES,
  PARSER_PARITY_FIXTURE,
  assertParserDiagnosticsGuard,
}
