const assert = require('node:assert/strict')
const cp = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  APPROVED_REVIEW_WORKFLOW,
  APPROVED_REVIEW_WORKFLOW_PATH,
  REQUIRED_MATRIX_TARGET,
  STRICT_VERIFIER_EXPECTED_CONTEXT_LINES,
  VERIFIER_COMMAND_BASE,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const builder = require('../../scripts/lib/go-helper-artifact-builder.cjs')
const verifier = require('../../scripts/lib/go-helper-artifact-verifier.cjs')

const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITIES = ['health', 'profile', MODULE, 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability']
const FIXED_GENERATED_AT = '2026-06-13T03:00:00.000Z'
const FIXED_SOURCE_REVISION = '7777777777777777777777777777777777777777'
const FIXED_GITHUB_SHA = '8888888888888888888888888888888888888888'
const FIXED_GITHUB_RUN_ID = '632643643'
const FIXED_GITHUB_RUN_ATTEMPT = '3'
const FIXED_GITHUB_REF = 'refs/heads/main'
const GITHUB_ENV = {
  GITHUB_REPOSITORY: 'LinYS77/PI-agentteam',
  GITHUB_WORKFLOW: 'Go-Helper-Review-Artifact',
  GITHUB_RUN_ID: FIXED_GITHUB_RUN_ID,
  GITHUB_RUN_ATTEMPT: FIXED_GITHUB_RUN_ATTEMPT,
  GITHUB_SHA: FIXED_GITHUB_SHA,
  GITHUB_REF: FIXED_GITHUB_REF,
}
const LEAK_SENTINELS = [
  'V0632-WORKFLOW-CONTEXT-RUN-ATTEMPT-SHOULD-NOT-LEAK',
  'V0632-WORKFLOW-CONTEXT-REF-SHOULD-NOT-LEAK',
  'V0632-WORKFLOW-CONTEXT-MAILBOX-REPORT-SHOULD-NOT-LEAK',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel))
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

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
  "else if (request.method === 'workerLifecycle') { const params = request.params || {}; if (params.operation === 'listAgentTeamPanes') respond({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'captureCurrentPaneBinding') respond({ ok: true, operation: 'captureCurrentPaneBinding', capability: 'workerLifecycle', paneId: '%fake-current', target: 'test:@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'listPanesInWindow') respond({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: params.target || 'test:@1', exists: true, paneIds: ['%fake-current'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findAgentTeamWindowTarget') respond({ ok: true, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findWindowTargetByName') respond({ ok: true, operation: 'findWindowTargetByName', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', windowName: params.windowName || 'agentteam', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'sessionExists') respond({ ok: true, operation: 'sessionExists', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'markWindowAsAgentTeam') respond({ ok: false, operation: 'markWindowAsAgentTeam', capability: 'workerLifecycle', target: '', marked: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', error: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'refreshWindowPaneLabels') respond({ ok: false, operation: 'refreshWindowPaneLabels', capability: 'workerLifecycle', target: '', refreshed: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle refreshWindowPaneLabels unavailable (invalid-target)', error: 'Go worker lifecycle refreshWindowPaneLabels unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'setPaneLabel') respond({ ok: false, operation: 'setPaneLabel', capability: 'workerLifecycle', paneId: '', labeled: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-pane-id', reason: 'Go worker lifecycle setPaneLabel unavailable (invalid-pane-id)', error: 'Go worker lifecycle setPaneLabel unavailable (invalid-pane-id)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else respond({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId: params.paneId || '', requestedPaneId: params.paneId || '', exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', error: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) }",
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

function runCli(root, args) {
  const cli = path.join(root, 'scripts', 'verify-go-helper-artifact.cjs')
  return cp.spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, PATH: process.env.PATH || '' },
  })
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
  assert.ok(JSON.stringify(diagnostic).length < 1200, 'diagnostic must stay compact')
  assertNoOutputLeaks(diagnostic, roots, forbiddenValues)
}

function assertVerifierContext(root, env, outputRoot, index) {
  const verified = verifier.verifyGoHelperArtifact({
    artifactRoot: outputRoot,
    kernelModule: env.helpers.requireDist('core/kernel.js'),
    ...expectedOptions(index),
  })
  assert.equal(verified.summary.ok, true)
  assert.equal(verified.index.github.runAttempt, FIXED_GITHUB_RUN_ATTEMPT)
  assert.equal(verified.index.github.ref, FIXED_GITHUB_REF)
  assertNoOutputLeaks(verified.summary, [root, outputRoot])

  const mismatchCases = [
    ['runAttempt', { expectedGithubRunAttempt: LEAK_SENTINELS[0] }, [index.github.runAttempt, LEAK_SENTINELS[0]]],
    ['ref', { expectedGithubRef: LEAK_SENTINELS[1] }, [index.github.ref, LEAK_SENTINELS[1]]],
  ]
  for (const [name, options, forbiddenValues] of mismatchCases) {
    assert.throws(() => verifier.verifyGoHelperArtifact({ artifactRoot: outputRoot, ...expectedOptions(index), ...options }), error => {
      assertContextMismatch(error, [root, outputRoot], forbiddenValues)
      return true
    }, `${name} mismatch should fail closed`)
  }

  const cli = runCli(root, [
    '--artifact-root', outputRoot,
    '--expected-target', index.target,
    '--expected-source-revision', index.sourceRevision,
    '--expected-github-sha', index.github.sha,
    '--expected-github-run-id', index.github.runId,
    '--expected-github-run-attempt', index.github.runAttempt,
    '--expected-github-ref', index.github.ref,
    '--json',
  ])
  assert.equal(cli.status, 0, cli.stderr)
  const summary = JSON.parse(cli.stdout)
  assert.equal(summary.ok, true)
  assertNoOutputLeaks(summary, [root, outputRoot])

  const cliMismatch = runCli(root, [
    '--artifact-root', outputRoot,
    '--expected-github-run-attempt', LEAK_SENTINELS[0],
    '--json',
  ])
  assert.equal(cliMismatch.status, 1, 'CLI runAttempt mismatch should fail closed')
  assert.equal(cliMismatch.stdout, '')
  const diagnostic = JSON.parse(cliMismatch.stderr)
  assert.equal(diagnostic.failureKind, 'context-mismatch')
  assertNoOutputLeaks(diagnostic, [root, outputRoot], [index.github.runAttempt, LEAK_SENTINELS[0]])
}

function assertWorkflowContextBinding(root) {
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only one review workflow file may exist')
  assertWorkflowContract(root)
  const workflow = readWorkflow(root)
  assertIncludes(workflow, VERIFIER_COMMAND_BASE, 'workflow verifier base command')
  for (const expected of STRICT_VERIFIER_EXPECTED_CONTEXT_LINES) assertIncludes(workflow, expected, 'workflow strict expected-context flags')
  assertIncludes(workflow, '--expected-github-run-attempt "${{ github.run_attempt }}"', 'workflow strict run attempt')
  assertIncludes(workflow, '--expected-github-ref "${{ github.ref }}"', 'workflow strict ref')
  assert.equal(/--expected-github-workflow|--expected-workflow-name/.test(workflow), false, 'workflow must not strict-match workflow name')
  assert.equal(/--expected-github-repository/.test(workflow), false, 'workflow should not add repository strict flag in this slice')
  assert.equal((workflow.match(/actions\/upload-artifact@v4/g) || []).length, 1, 'workflow uploads exactly once')
  assert.equal((workflow.match(/actions\/download-artifact@v4/g) || []).length, 1, 'workflow downloads exactly once')
  assert.equal((workflow.match(/^\s+- runner:/gm) || []).length, 2, 'workflow keeps one build row and one verify row')
  assert.equal((workflow.match(new RegExp(`target: ${REQUIRED_MATRIX_TARGET}`, 'g')) || []).length, 2, 'workflow keeps linux-x64-glibc build and verify rows only')
  assert.equal((workflow.match(/runner: ubuntu-latest/g) || []).length, 2, 'workflow keeps ubuntu-latest build and verify rows')
  assert.equal((workflow.match(/retention-days: 7/g) || []).length, 1, 'workflow retention stays 7 days')
  assert.equal(/macos-latest|windows-latest|linux-arm64|arm64|musl|cross-?compile|continue-on-error|experimental:\s*true/i.test(workflow), false, 'workflow must not add unsupported rows')
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|signing|gh\s+attestation/i.test(workflow), false, 'workflow must not add release/npm/git/signing behavior')
  assert.equal(/curl\b|wget\b|node-gyp\b|prebuild|postinstall|preinstall|install-time build|package-manager install proof/i.test(workflow), false, 'workflow must not add download/install/package behavior')
}

function assertPackageRuntimeGuardrails(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define ${key}`)
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+(?:publish|version)\b/.test(command), false, `${name} must not publish/version package`)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild|postinstall/i.test(command), false, `${name} must not build/download native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }

  const runtimeSources = [read(root, 'core/kernel.ts'), read(root, 'core/kernelPackagedResolver.ts')].join('\n')
  assert.equal(/artifact-index|artifactIndex|go-helper-review-artifact|download-artifact|github\.sha|github\.run_id|github\.run_attempt|workflow_dispatch|hosted-observation/i.test(runtimeSources), false, 'runtime/resolver must not read artifact or hosted workflow metadata')
  assert.equal(/default Go is enabled|normal-user native availability|package-manager install proof|release asset/i.test(runtimeSources), false, 'runtime/resolver must not claim package/release/default availability')
}

function assertDocUpdated(root) {
  const doc = read(root, 'docs/perf/v0.6.32-ci-review-provenance-build-context.md')
  assertIncludes(doc, 'Slice 3 binds workflow verification to additional bounded GitHub context facts: `github.run_attempt` and `github.ref`.', 'v0.6.32 doc')
  assertIncludes(doc, 'Slice 3 also adds a builder provenance consistency regression guard without changing package/runtime/default behavior.', 'v0.6.32 doc')
}

module.exports = {
  name: 'Go kernel v0.6.32 workflow context binding',
  async run(env) {
    const root = env.helpers.extRoot
    assertWorkflowContextBinding(root)
    let tempRoot
    try {
      tempRoot = mkTempRoot('agentteam-v0632-workflow-context-')
      const { outputRoot, result } = buildReviewArtifact(root, tempRoot)
      assert.equal(result.artifactIndex.github.runAttempt, FIXED_GITHUB_RUN_ATTEMPT)
      assert.equal(result.artifactIndex.github.ref, FIXED_GITHUB_REF)
      assertVerifierContext(root, env, outputRoot, result.artifactIndex)
      assertPackageRuntimeGuardrails(root)
      assertDocUpdated(root)
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  },
}
