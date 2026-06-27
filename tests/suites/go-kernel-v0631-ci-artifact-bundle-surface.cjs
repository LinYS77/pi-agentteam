const assert = require('node:assert/strict')
const crypto = require('node:crypto')
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
const FIXED_GENERATED_AT = '2026-06-13T01:00:00.000Z'
const FIXED_SOURCE_REVISION = '3333333333333333333333333333333333333333'
const FIXED_GITHUB_SHA = '4444444444444444444444444444444444444444'
const FIXED_GITHUB_RUN_ID = '631632632'
const GITHUB_ENV = {
  GITHUB_REPOSITORY: 'LinYS77/PI-agentteam',
  GITHUB_WORKFLOW: 'Go-Helper-Review-Artifact',
  GITHUB_RUN_ID: FIXED_GITHUB_RUN_ID,
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: FIXED_GITHUB_SHA,
  GITHUB_REF: 'refs/pull/632/merge',
}
const LEAK_SENTINELS = [
  'V0631-BUNDLE-SURFACE-SYMLINK-SHOULD-NOT-LEAK',
  'V0631-BUNDLE-SURFACE-EXTRA-SHOULD-NOT-LEAK',
  'V0631-BUNDLE-SURFACE-CHECKSUM-SHOULD-NOT-LEAK',
  'V0631-BUNDLE-SURFACE-INDEX-SHOULD-NOT-LEAK',
  'V0631-BUNDLE-SURFACE-SIZE-SHOULD-NOT-LEAK',
  'V0631-BUNDLE-SURFACE-MAILBOX-REPORT-SHOULD-NOT-LEAK',
]

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  assert.equal(path.dirname(root), os.tmpdir(), 'temp root must be directly under OS tmpdir')
  return root
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function artifactPath(root, relPath) {
  return path.join(root, ...relPath.split('/'))
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
  "else if (request.method === 'workerLifecycle') { const params = request.params || {}; if (params.operation === 'listAgentTeamPanes') respond({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'captureCurrentPaneBinding') respond({ ok: true, operation: 'captureCurrentPaneBinding', capability: 'workerLifecycle', paneId: '%fake-current', target: 'test:@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'listPanesInWindow') respond({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: params.target || 'test:@1', exists: true, paneIds: ['%fake-current'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findAgentTeamWindowTarget') respond({ ok: true, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else respond({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId: params.paneId || '', requestedPaneId: params.paneId || '', exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', error: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) }",
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
    runIdentity: 'v0631-bundle-surface-suite-run',
    sourceRevision: FIXED_SOURCE_REVISION,
  })
  return { outputRoot, result }
}

function cloneArtifact(tempRoot, sourceRoot, name) {
  const cloneRoot = path.join(tempRoot, `case-${name.replace(/[^a-z0-9-]+/gi, '-')}`)
  fs.cpSync(sourceRoot, cloneRoot, { recursive: true })
  return cloneRoot
}

function artifactDir(root) {
  return path.join(root, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc')
}

function indexPath(root) {
  return path.join(artifactDir(root), 'artifact-index.json')
}

function checksumPath(root) {
  return path.join(artifactDir(root), 'SHA256SUMS')
}

function rewriteIndex(root, mutator) {
  const filePath = indexPath(root)
  const index = readJson(filePath)
  mutator(index)
  writeJson(filePath, index)
}

function refreshIndexRow(root, kind) {
  rewriteIndex(root, index => {
    const row = index.files.find(item => item.kind === kind)
    const filePath = artifactPath(root, row.path)
    row.sha256 = sha256(filePath)
    row.size = fs.statSync(filePath).size
  })
}

function rewriteChecksums(root, mutator) {
  const filePath = checksumPath(root)
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean)
  fs.writeFileSync(filePath, `${mutator(lines).join('\n')}\n`, 'utf8')
  refreshIndexRow(root, 'checksums')
}

function assertNoDiagnosticLeaks(value, roots = [], forbiddenValues = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  assert.ok(text.length < 1200, 'diagnostic must stay compact')
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'diagnostic must not leak absolute roots')
  }
  assert.equal(text.includes(process.cwd()), false, 'diagnostic must not leak cwd')
  assert.equal(/stdout|stderr|Error:|AssertionError|\bat\s+|stack|native\/tmuxSnapshotParse|manifest\.json|provenance\.json|license\.json|attestation\.intoto|SHA256SUMS|https?:\/\//i.test(text), false, 'diagnostic must avoid internals and URLs')
  for (const secret of [...LEAK_SENTINELS, ...forbiddenValues]) {
    assert.equal(text.includes(secret), false, `diagnostic must not leak ${secret}`)
  }
}

function assertDiagnostic(error, failureKind, roots, forbiddenValues = []) {
  assert.ok(error instanceof verifier.GoHelperArtifactVerifierError, 'expected verifier error')
  const diagnostic = error.toDiagnostic()
  assert.equal(diagnostic.ok, false)
  assert.equal(diagnostic.status, 'unavailable')
  assert.equal(diagnostic.module, MODULE)
  assert.equal(diagnostic.capability, MODULE)
  assert.equal(diagnostic.resultMarker, 'fail-closed')
  assert.equal(diagnostic.failureKind, failureKind)
  assertNoDiagnosticLeaks(diagnostic, roots, forbiddenValues)
}

function expectFailure(root, clone, failureKind, mutator, options = {}) {
  mutator(clone)
  assert.throws(() => verifier.verifyGoHelperArtifact({ artifactRoot: clone, ...options }), error => {
    assertDiagnostic(error, failureKind, [root, clone], options.forbiddenValues || [])
    return true
  })
}

function runPositive(root, env, outputRoot) {
  const verified = verifier.verifyGoHelperArtifact({
    artifactRoot: outputRoot,
    kernelModule: env.helpers.requireDist('core/kernel.js'),
  })
  assert.equal(verified.summary.ok, true)
  assert.equal(verified.summary.resultMarker, 'review-artifact-reverified')
  assert.equal(verified.summary.target, 'linux-x64-glibc')
  assert.equal(verified.index.sourceRevision, FIXED_SOURCE_REVISION)
  assert.equal(verified.index.github.sha, FIXED_GITHUB_SHA)
  assert.equal(verified.index.github.runId, FIXED_GITHUB_RUN_ID)
}

function runNegativeCases(root, tempRoot, outputRoot) {
  const cases = [
    ['symlink', 'artifact-surface-invalid', clone => {
      fs.symlinkSync('manifest.json', path.join(artifactDir(clone), LEAK_SENTINELS[0]))
    }, [LEAK_SENTINELS[0]]],
    ['extra file', 'artifact-surface-invalid', clone => {
      fs.writeFileSync(path.join(artifactDir(clone), 'extra.txt'), LEAK_SENTINELS[1], 'utf8')
    }, [LEAK_SENTINELS[1]]],
    ['duplicate checksum row', 'integrity-mismatch', clone => {
      rewriteChecksums(clone, lines => [...lines, lines[0]])
    }, []],
    ['extra checksum row', 'integrity-mismatch', clone => {
      rewriteChecksums(clone, lines => [...lines, `${'a'.repeat(64)}  native/${MODULE}/${HELPER_VERSION}/linux-x64-glibc/extra.txt`])
    }, []],
    ['malformed checksum row', 'integrity-mismatch', clone => {
      rewriteChecksums(clone, lines => [LEAK_SENTINELS[2], ...lines.slice(1)])
    }, [LEAK_SENTINELS[2]]],
    ['missing checksum row', 'integrity-mismatch', clone => {
      rewriteChecksums(clone, lines => lines.slice(1))
    }, []],
    ['unknown index key', 'artifact-index-invalid', clone => {
      rewriteIndex(clone, index => { index.releaseUrl = LEAK_SENTINELS[3] })
    }, [LEAK_SENTINELS[3]]],
    ['unknown file-row key', 'artifact-index-invalid', clone => {
      rewriteIndex(clone, index => { index.files[0].releaseUrl = LEAK_SENTINELS[3] })
    }, [LEAK_SENTINELS[3]]],
    ['metadata size limit', 'artifact-size-invalid', clone => {}, [], { sizeLimits: { metadataBytes: 1 } }],
    ['helper size limit', 'artifact-size-invalid', clone => {}, [], { sizeLimits: { helperBytes: 1 } }],
    ['total size limit', 'artifact-size-invalid', clone => {}, [], { sizeLimits: { totalBytes: 1 } }],
    ['context tamper', 'context-mismatch', clone => {}, [FIXED_GITHUB_SHA, LEAK_SENTINELS[4]], { expectedGithubSha: LEAK_SENTINELS[4] }],
  ]

  for (const [name, failureKind, mutate, forbiddenValues, options = {}] of cases) {
    const clone = cloneArtifact(tempRoot, outputRoot, name)
    expectFailure(root, clone, failureKind, mutate, { ...options, forbiddenValues })
  }
}

function assertRuntimePackageGuard(root) {
  const kernel = fs.readFileSync(path.join(root, 'core', 'kernel.ts'), 'utf8')
  const resolver = fs.readFileSync(path.join(root, 'core', 'kernelPackagedResolver.ts'), 'utf8')
  const runtimeForbidden = /artifact-index|artifactIndex|download-artifact|verify-go-helper-artifact|artifact URL|artifactUrl|actions\/download-artifact|gh\s+release|release asset/i
  assert.equal(runtimeForbidden.test(kernel), false, 'runtime kernel must not read artifact-index or workflow metadata')
  assert.equal(runtimeForbidden.test(resolver), false, 'packaged resolver must not read artifact-index or workflow metadata')

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define ${key}`)
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/go\s+(?:build|install)\b|curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not build/download native helper`)
  }
}

module.exports = {
  name: 'Go kernel v0.6.31 CI artifact bundle surface verifier',
  async run(env) {
    const root = env.helpers.extRoot
    assert.ok(verifier.FAILURE_KINDS.has('artifact-surface-invalid'), 'verifier should expose surface diagnostics')
    assert.ok(verifier.FAILURE_KINDS.has('artifact-size-invalid'), 'verifier should expose size diagnostics')
    let tempRoot
    try {
      tempRoot = mkTempRoot('agentteam-v0631-bundle-surface-')
      const { outputRoot } = buildReviewArtifact(root, tempRoot)
      runPositive(root, env, outputRoot)
      runNegativeCases(root, tempRoot, outputRoot)
      assertRuntimePackageGuard(root)
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  },
}
