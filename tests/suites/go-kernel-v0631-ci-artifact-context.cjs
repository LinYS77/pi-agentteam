const assert = require('node:assert/strict')
const cp = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const builder = require('../../scripts/lib/go-helper-artifact-builder.cjs')
const verifier = require('../../scripts/lib/go-helper-artifact-verifier.cjs')

const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITIES = ['health', 'profile', MODULE, 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability']
const FIXED_GENERATED_AT = '2026-06-13T00:00:00.000Z'
const FIXED_SOURCE_REVISION = '1111111111111111111111111111111111111111'
const FIXED_GITHUB_SHA = '2222222222222222222222222222222222222222'
const FIXED_GITHUB_RUN_ID = '631631631'
const GITHUB_ENV = {
  GITHUB_REPOSITORY: 'LinYS77/PI-agentteam',
  GITHUB_WORKFLOW: 'Go-Helper-Review-Artifact',
  GITHUB_RUN_ID: FIXED_GITHUB_RUN_ID,
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: FIXED_GITHUB_SHA,
  GITHUB_REF: 'refs/pull/631/merge',
}
const LEAK_SENTINELS = [
  'V0631-CONTEXT-EXPECTED-TARGET-SHOULD-NOT-LEAK',
  'V0631-CONTEXT-EXPECTED-SOURCE-SHOULD-NOT-LEAK',
  'V0631-CONTEXT-EXPECTED-GITHUB-SHA-SHOULD-NOT-LEAK',
  'V0631-CONTEXT-EXPECTED-GITHUB-RUN-ID-SHOULD-NOT-LEAK',
  'V0631-CONTEXT-MAILBOX-REPORT-SHOULD-NOT-LEAK',
]

function mkTempRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  assert.equal(path.dirname(root), os.tmpdir(), 'temp root must be directly under OS tmpdir')
  return root
}

function writeFakeGo(binDir) {
  fs.mkdirSync(binDir, { recursive: true })
  const fakeGoPath = path.join(binDir, 'go')
  fs.writeFileSync(fakeGoPath, `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
if (args[0] === 'version') {
  process.stdout.write('go version go1.99.0 agentteam-fake/host\\n')
  process.exit(0)
}
if (args[0] !== 'build') process.exit(2)
const output = args[args.indexOf('-o') + 1]
const health = ${JSON.stringify({ ok: true, implementation: 'go', protocolVersion: PROTOCOL_VERSION, helperVersion: HELPER_VERSION, capabilities: CAPABILITIES, businessPathsConnected: false })}
const helperSource = [
  '#!/usr/bin/env node',
  "const fs = require('node:fs')",
  "const input = fs.readFileSync(0, 'utf8').trim()",
  "const request = input ? JSON.parse(input.split('\\\\n')[0]) : {}",
  'const health = ' + JSON.stringify(health),
  "function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\\\n') }",
  "if (request.method === 'health') respond(health)",
  "else if (request.method === 'profile') respond({ ...health, profile: { scope: 'skeleton-only', params: request.params || {}, stateConnected: false, tmuxConnected: false, tmuxSnapshotParseConnected: true, tmuxSnapshotCaptureConnected: true, compactReadModelFingerprintConnected: true, workerLifecycleInspectPaneConnected: true, workerLifecycleListAgentTeamPanesConnected: true, panelConnected: false, taskReportPlanRunConnected: false } })",
  "else if (request.method === 'tmuxSnapshotParse') respond({ ok: true, capturedAt: Number((request.params || {}).capturedAt || 0), panes: [{ paneId: '%1', target: 'review:@1', label: 'reviewer', currentCommand: 'pi' }], byPaneId: { '%1': { paneId: '%1', target: 'review:@1', label: 'reviewer', currentCommand: 'pi' } } })",
  "else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params && request.params.input, fingerprint: 'helper-should-not-run', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })",
  "else if (request.method === 'workerLifecycle') { const params = request.params || {}; if (params.operation === 'listAgentTeamPanes') respond({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'captureCurrentPaneBinding') respond({ ok: true, operation: 'captureCurrentPaneBinding', capability: 'workerLifecycle', paneId: '%fake-current', target: 'test:@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'listPanesInWindow') respond({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: params.target || 'test:@1', exists: true, paneIds: ['%fake-current'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findAgentTeamWindowTarget') respond({ ok: true, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findWindowTargetByName') respond({ ok: true, operation: 'findWindowTargetByName', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', windowName: params.windowName || 'agentteam', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'sessionExists') respond({ ok: true, operation: 'sessionExists', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'markWindowAsAgentTeam') respond({ ok: false, operation: 'markWindowAsAgentTeam', capability: 'workerLifecycle', target: '', marked: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', error: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'refreshWindowPaneLabels') respond({ ok: false, operation: 'refreshWindowPaneLabels', capability: 'workerLifecycle', target: '', refreshed: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle refreshWindowPaneLabels unavailable (invalid-target)', error: 'Go worker lifecycle refreshWindowPaneLabels unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'createTeammatePane') respond({ ok: false, operation: 'createTeammatePane', capability: 'workerLifecycle', target: '', paneId: '', created: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle createTeammatePane unavailable (invalid-target)', error: 'Go worker lifecycle createTeammatePane unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'createDetachedSwarmSession') respond({ ok: false, operation: 'createDetachedSwarmSession', capability: 'workerLifecycle', sessionName: '', windowName: '', created: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-session', reason: 'Go worker lifecycle createDetachedSwarmSession unavailable (invalid-session)', error: 'Go worker lifecycle createDetachedSwarmSession unavailable (invalid-session)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'clearPaneLabel') respond({ ok: false, operation: 'clearPaneLabel', capability: 'workerLifecycle', paneId: '', cleared: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-pane-id', reason: 'Go worker lifecycle clearPaneLabel unavailable (invalid-pane-id)', error: 'Go worker lifecycle clearPaneLabel unavailable (invalid-pane-id)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'setPaneLabel') respond({ ok: false, operation: 'setPaneLabel', capability: 'workerLifecycle', paneId: '', labeled: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-pane-id', reason: 'Go worker lifecycle setPaneLabel unavailable (invalid-pane-id)', error: 'Go worker lifecycle setPaneLabel unavailable (invalid-pane-id)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else respond({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId: params.paneId || '', requestedPaneId: params.paneId || '', exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', error: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) }",
  "else if (request.method === 'tmuxAvailability') respond({ ok: true, capability: 'tmuxAvailability', available: true, version: 'tmux 3.4', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })",
  "else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'method not found' } }) + '\\\\n')",
].join('\\n') + '\\n'
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, helperSource, 'utf8')
if (process.platform !== 'win32') fs.chmodSync(output, 0o755)
`, 'utf8')
  fs.chmodSync(fakeGoPath, 0o755)
}

function fakeGoEnv(tempRoot) {
  const binDir = path.join(tempRoot, 'fake-bin')
  writeFakeGo(binDir)
  return {
    ...process.env,
    ...GITHUB_ENV,
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
  }
}

function buildReviewArtifact(root, tempRoot) {
  const outputRoot = path.join(tempRoot, 'downloaded-review-artifact')
  const result = builder.buildGoHelperArtifact({
    extRoot: root,
    outputRoot,
    env: fakeGoEnv(tempRoot),
    ciReview: true,
    generatedAt: FIXED_GENERATED_AT,
    sourceRevision: FIXED_SOURCE_REVISION,
  })
  return { outputRoot, result }
}

function expectedOptions(index) {
  return {
    expectedTarget: index.target,
    expectedSourceRevision: index.sourceRevision,
    expectedGithubSha: index.github.sha,
    expectedGithubRunId: index.github.runId,
    expectedGithubRunAttempt: index.github.runAttempt,
    expectedGithubRef: index.github.ref,
  }
}

function assertNoOutputLeaks(value, roots = [], forbiddenValues = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'output must not leak absolute roots')
  }
  assert.equal(text.includes(process.cwd()), false, 'output must not leak cwd')
  assert.equal(/stdout|stderr|Error:|AssertionError|\bat\s+|stack|https?:\/\//i.test(text), false, 'output must avoid process internals and URLs')
  for (const secret of [...LEAK_SENTINELS, ...forbiddenValues]) {
    assert.equal(text.includes(secret), false, `output must not leak ${secret}`)
  }
}

function assertNoDiagnosticLeaks(value, roots = [], forbiddenValues = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  assert.ok(text.length < 1200, 'diagnostic must stay compact')
  assertNoOutputLeaks(value, roots, forbiddenValues)
  assert.equal(/native\/tmuxSnapshotParse|manifest\.json|provenance\.json|license\.json|attestation\.intoto|SHA256SUMS/i.test(text), false, 'diagnostic must avoid artifact internals')
}

function assertContextMismatch(error, roots, forbiddenValues = []) {
  assert.ok(error instanceof verifier.GoHelperArtifactVerifierError, 'expected verifier error')
  const diagnostic = error.toDiagnostic()
  assert.equal(diagnostic.ok, false)
  assert.equal(diagnostic.status, 'unavailable')
  assert.equal(diagnostic.module, MODULE)
  assert.equal(diagnostic.capability, MODULE)
  assert.equal(diagnostic.resultMarker, 'fail-closed')
  assert.equal(diagnostic.failureKind, 'context-mismatch')
  assert.match(`${diagnostic.hint}`, /context-mismatch/)
  assertNoDiagnosticLeaks(diagnostic, roots, forbiddenValues)
}

function verifyWithKernel(env, outputRoot, options = {}) {
  return verifier.verifyGoHelperArtifact({
    artifactRoot: outputRoot,
    kernelModule: env.helpers.requireDist('core/kernel.js'),
    ...options,
  })
}

function runCli(root, args, env) {
  const cli = path.join(root, 'scripts', 'verify-go-helper-artifact.cjs')
  return cp.spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, ...env, PATH: process.env.PATH || '' },
  })
}

function runPositiveCases(root, env, outputRoot, index) {
  const noExpected = verifyWithKernel(env, outputRoot)
  assert.equal(noExpected.summary.ok, true, 'omitting expected context remains reviewer-friendly')
  assert.equal(noExpected.summary.resultMarker, 'review-artifact-reverified')
  assert.equal(noExpected.summary.target, index.target)

  const matched = verifyWithKernel(env, outputRoot, expectedOptions(index))
  assert.equal(matched.summary.ok, true, 'matching expected context should pass')
  assert.equal(matched.summary.target, index.target)

  const cli = runCli(root, [
    '--artifact-root', outputRoot,
    '--expected-target', index.target,
    '--expected-source-revision', index.sourceRevision,
    '--expected-github-sha', index.github.sha,
    '--expected-github-run-id', index.github.runId,
    '--expected-github-run-attempt', index.github.runAttempt,
    '--expected-github-ref', index.github.ref,
    '--json',
  ], GITHUB_ENV)
  assert.equal(cli.status, 0, cli.stderr)
  const summary = JSON.parse(cli.stdout)
  assert.equal(summary.ok, true)
  assert.equal(summary.target, index.target)
  assertNoOutputLeaks(summary, [root, outputRoot], LEAK_SENTINELS)
}

function runNegativeCases(root, outputRoot, index) {
  const cases = [
    ['target', { expectedTarget: LEAK_SENTINELS[0] }, [index.target, LEAK_SENTINELS[0]]],
    ['sourceRevision', { expectedSourceRevision: LEAK_SENTINELS[1] }, [index.sourceRevision, LEAK_SENTINELS[1]]],
    ['github.sha', { expectedGithubSha: LEAK_SENTINELS[2] }, [index.github.sha, LEAK_SENTINELS[2]]],
    ['github.runId', { expectedGithubRunId: LEAK_SENTINELS[3] }, [index.github.runId, LEAK_SENTINELS[3]]],
    ['github.runAttempt', { expectedGithubRunAttempt: LEAK_SENTINELS[3] }, [index.github.runAttempt, LEAK_SENTINELS[3]]],
    ['github.ref', { expectedGithubRef: LEAK_SENTINELS[3] }, [index.github.ref, LEAK_SENTINELS[3]]],
  ]

  for (const [name, options, forbiddenValues] of cases) {
    assert.throws(() => verifier.verifyGoHelperArtifact({ artifactRoot: outputRoot, ...options }), error => {
      try {
        assertContextMismatch(error, [root, outputRoot], forbiddenValues)
      } catch (assertion) {
        assertion.message = `${name}: ${assertion.message}`
        throw assertion
      }
      return true
    }, `${name} mismatch should fail closed`)
  }

  const cli = runCli(root, [
    '--artifact-root', outputRoot,
    '--expected-github-run-id', index.github.runId,
    '--expected-github-run-attempt', LEAK_SENTINELS[3],
    '--json',
  ], GITHUB_ENV)
  assert.equal(cli.status, 1, 'CLI mismatch should fail closed')
  assert.equal(cli.stdout, '')
  const diagnostic = JSON.parse(cli.stderr)
  assert.equal(diagnostic.failureKind, 'context-mismatch')
  assert.match(`${diagnostic.hint}`, /context-mismatch/)
  assertNoDiagnosticLeaks(diagnostic, [root, outputRoot], [index.github.runId, LEAK_SENTINELS[3]])
}

function assertRuntimePackageGuard(root) {
  const kernel = fs.readFileSync(path.join(root, 'core', 'kernel.ts'), 'utf8')
  const resolver = fs.readFileSync(path.join(root, 'core', 'kernelPackagedResolver.ts'), 'utf8')
  const runtimeForbidden = /artifact-index|artifactIndex|download-artifact|verify-go-helper-artifact|artifact URL|artifactUrl|actions\/download-artifact|gh\s+release|release asset/i
  assert.equal(runtimeForbidden.test(kernel), false, 'runtime kernel must not read artifact-index or perform workflow/download/release behavior')
  assert.equal(runtimeForbidden.test(resolver), false, 'packaged resolver must not read artifact-index or perform workflow/download/release behavior')

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define ${key}`)
  }
  assert.equal((packageJson.files || []).some(item => /(?:^|\/)(?:native|kernel\/go)(?:\/|$)|(?:helper|artifact|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz|\.zip)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include unapproved native/helper/generated outputs')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/go\s+(?:build|install)\b|curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not build/download native helper`)
  }
}

function assertWorkflowContextWiringSafe(root) {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'go-helper-review-artifact.yml'), 'utf8')
  assert.ok(workflow.includes('node scripts/verify-go-helper-artifact.cjs --artifact-root "$artifact_root"'), 'workflow should keep v0.6.30 verifier base invocation')
  if (!/--expected-target|--expected-source-revision|--expected-github-sha|--expected-github-run-id/.test(workflow)) return
  for (const expected of [
    'expected_source_revision=$(git rev-parse --verify HEAD)',
    '--expected-target "${{ matrix.target }}"',
    '--expected-source-revision "$expected_source_revision"',
    '--expected-github-sha "${{ github.sha }}"',
    '--expected-github-run-id "${{ github.run_id }}"',
    '--expected-github-run-attempt "${{ github.run_attempt }}"',
    '--expected-github-ref "${{ github.ref }}"',
  ]) assert.ok(workflow.includes(expected), `workflow strict expected-context wiring should include ${expected}`)
  assert.equal(/--expected-source-revision\s+"\$\{\{\s*github\.sha\s*\}\}"/.test(workflow), false, 'sourceRevision must not be conflated with github.sha')
}

module.exports = {
  name: 'Go kernel v0.6.31 CI artifact context verifier',
  async run(env) {
    const root = env.helpers.extRoot
    assert.ok(verifier.FAILURE_KINDS.has('context-mismatch'), 'verifier should expose context-mismatch diagnostics')
    let tempRoot
    try {
      tempRoot = mkTempRoot('agentteam-v0631-context-')
      const { outputRoot, result } = buildReviewArtifact(root, tempRoot)
      const index = result.artifactIndex
      assert.equal(index.target, 'linux-x64-glibc')
      assert.equal(index.sourceRevision, FIXED_SOURCE_REVISION)
      assert.equal(index.github.sha, FIXED_GITHUB_SHA)
      assert.equal(index.github.runId, FIXED_GITHUB_RUN_ID)
      runPositiveCases(root, env, outputRoot, index)
      runNegativeCases(root, outputRoot, index)
      assertRuntimePackageGuard(root)
      assertWorkflowContextWiringSafe(root)
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  },
}
