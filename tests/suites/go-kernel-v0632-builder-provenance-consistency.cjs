const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const builder = require('../../scripts/lib/go-helper-artifact-builder.cjs')

const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITIES = ['health', 'profile', MODULE, 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability']
const FIXED_GENERATED_AT = '2026-06-13T04:00:00.000Z'
const FIXED_SOURCE_REVISION = '9999999999999999999999999999999999999999'
const FIXED_GITHUB_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const FIXED_GITHUB_RUN_ID = '632644644'
const FIXED_GITHUB_RUN_ATTEMPT = '2'
const FIXED_GITHUB_REF = 'refs/pull/644/merge'
const GITHUB_ENV = {
  GITHUB_REPOSITORY: 'LinYS77/PI-agentteam',
  GITHUB_WORKFLOW: 'Go-Helper-Review-Artifact',
  GITHUB_RUN_ID: FIXED_GITHUB_RUN_ID,
  GITHUB_RUN_ATTEMPT: FIXED_GITHUB_RUN_ATTEMPT,
  GITHUB_SHA: FIXED_GITHUB_SHA,
  GITHUB_REF: FIXED_GITHUB_REF,
}
const LEAK_SENTINELS = [
  'V0632-BUILDER-PROVENANCE-STDOUT-SHOULD-NOT-LEAK',
  'V0632-BUILDER-PROVENANCE-STDERR-SHOULD-NOT-LEAK',
  'V0632-BUILDER-PROVENANCE-STACK-SHOULD-NOT-LEAK',
  'V0632-BUILDER-PROVENANCE-RAW-ENV-SHOULD-NOT-LEAK',
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

function artifactPath(root, relPath) {
  return path.join(root, ...relPath.split('/'))
}

function artifactDir(outputRoot) {
  return path.join(outputRoot, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc')
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
  "import fs from 'node:fs'",
  "const input = fs.readFileSync(0, 'utf8').trim()",
  "const request = input ? JSON.parse(input.split('\\\\n')[0]) : {}",
  'const health = ' + JSON.stringify(health),
  "function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\\\n') }",
  "if (request.method === 'health') respond(health)",
  "else if (request.method === 'profile') respond({ ...health, profile: { scope: 'skeleton-only', params: request.params || {}, stateConnected: false, tmuxConnected: false, tmuxSnapshotParseConnected: true, tmuxSnapshotCaptureConnected: true, compactReadModelFingerprintConnected: true, workerLifecycleInspectPaneConnected: true, workerLifecycleListAgentTeamPanesConnected: true, panelConnected: false, taskReportPlanRunConnected: false } })",
  "else if (request.method === 'tmuxSnapshotParse') respond({ ok: true, capturedAt: Number((request.params || {}).capturedAt || 0), panes: [{ paneId: '%1', target: 'review:@1', label: 'reviewer', currentCommand: 'pi' }], byPaneId: { '%1': { paneId: '%1', target: 'review:@1', label: 'reviewer', currentCommand: 'pi' } } })",
  "else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params && request.params.input, fingerprint: 'helper-should-not-run', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })",
  "else if (request.method === 'workerLifecycle') { const params = request.params || {}; if (params.operation === 'listAgentTeamPanes') respond({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'captureCurrentPaneBinding') respond({ ok: true, operation: 'captureCurrentPaneBinding', capability: 'workerLifecycle', paneId: '%fake-current', target: 'test:@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'listPanesInWindow') respond({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: params.target || 'test:@1', exists: true, paneIds: ['%fake-current'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findAgentTeamWindowTarget') respond({ ok: true, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findWindowTargetByName') respond({ ok: true, operation: 'findWindowTargetByName', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', windowName: params.windowName || 'agentteam', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'sessionExists') respond({ ok: true, operation: 'sessionExists', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'markWindowAsAgentTeam') respond({ ok: false, operation: 'markWindowAsAgentTeam', capability: 'workerLifecycle', target: '', marked: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', error: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else respond({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId: params.paneId || '', requestedPaneId: params.paneId || '', exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', error: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) }",
  "else if (request.method === 'tmuxAvailability') respond({ ok: true, capability: 'tmuxAvailability', available: true, version: 'tmux 3.4', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })",
  "else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'method not found' } }) + '\\\\n')",
].join('\\n') + '\\n'
const outputDir = path.dirname(output)
fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(output, helperSource, 'utf8')
if (process.platform !== 'win32') fs.chmodSync(output, 0o755)
`, 'utf8')
  fs.chmodSync(fakeGoPath, 0o755)
}

function fakeGoEnv(tempRoot, overrides = {}) {
  const binDir = path.join(tempRoot, 'fake-bin')
  writeFakeGo(binDir)
  return {
    ...process.env,
    ...GITHUB_ENV,
    ...overrides,
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
  }
}

function buildArtifact(root, tempRoot, options = {}) {
  return builder.buildGoHelperArtifact({
    extRoot: root,
    outputRoot: options.outputRoot || path.join(tempRoot, options.name || 'artifact-output'),
    env: options.env || fakeGoEnv(tempRoot),
    ciReview: true,
    generatedAt: FIXED_GENERATED_AT,
    sourceRevision: FIXED_SOURCE_REVISION,
    runIdentity: options.runIdentity,
  })
}

function assertNoLeaks(value, roots = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'metadata/summary must not leak absolute roots')
  }
  assert.equal(text.includes(process.cwd()), false, 'metadata/summary must not leak cwd')
  assert.equal(/stdout|stderr|Error:|AssertionError|\bat\s+|stack|PATH=|HOME=|GITHUB_TOKEN=|https?:\/\//i.test(text), false, 'metadata/summary must avoid process output, raw env, stacks, and URLs')
  for (const secret of LEAK_SENTINELS) assert.equal(text.includes(secret), false, `metadata/summary must not leak ${secret}`)
}

function assertCommonIdentity(index, manifest, provenance) {
  assert.equal(index.schemaVersion, 1)
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(provenance.schemaVersion, 1)
  assert.equal(index.packageName, PACKAGE_NAME)
  assert.equal(manifest.packageName, PACKAGE_NAME)
  assert.equal(provenance.packageName, PACKAGE_NAME)
  assert.equal(index.packageVersion, PACKAGE_VERSION)
  assert.equal(manifest.packageVersion, PACKAGE_VERSION)
  assert.equal(provenance.packageVersion, PACKAGE_VERSION)
  assert.equal(index.module, MODULE)
  assert.equal(index.capability, MODULE)
  assert.equal(manifest.module, MODULE)
  assert.equal(provenance.module, MODULE)
  assert.equal(index.helperVersion, HELPER_VERSION)
  assert.equal(manifest.helperVersion, HELPER_VERSION)
  assert.equal(index.protocolVersion, PROTOCOL_VERSION)
  assert.equal(manifest.protocolVersion, PROTOCOL_VERSION)
  assert.deepEqual(manifest.capabilities, CAPABILITIES)
}

function assertTargetPlatform(index, manifest) {
  assert.equal(index.target, 'linux-x64-glibc')
  assert.equal(manifest.target, index.target)
  assert.deepEqual(index.platform, { os: 'linux', arch: 'x64', libc: 'glibc' })
  assert.deepEqual(manifest.platform, index.platform)
}

function assertBuildContext(index, manifest, provenance, expectedRunIdentity) {
  assert.equal(index.sourceRevision, FIXED_SOURCE_REVISION)
  assert.equal(manifest.source.path, 'kernel/go/agentteam-kernel')
  assert.equal(provenance.source.path, 'kernel/go/agentteam-kernel')
  assert.equal(manifest.source.revision, index.sourceRevision)
  assert.equal(provenance.source.revision, index.sourceRevision)
  assert.equal(index.generatedAt, FIXED_GENERATED_AT)
  assert.equal(manifest.build.generatedAt, index.generatedAt)
  assert.equal(provenance.build.generatedAt, index.generatedAt)
  assert.deepEqual(manifest.build.command, ['go', 'build', '-trimpath', '-o', manifest.artifact.path, '.'])
  assert.deepEqual(provenance.build.command, manifest.build.command)
  assert.deepEqual(manifest.build.env, { GO111MODULE: 'off' })
  assert.deepEqual(provenance.build.env, { GO111MODULE: 'off' })
  assert.equal(manifest.build.cwd, 'kernel/go/agentteam-kernel')
  assert.equal(provenance.build.cwd, manifest.build.cwd)
  assert.match(manifest.build.toolchain, /^go version /)
  assert.equal(provenance.build.toolchain, manifest.build.toolchain)
  assert.equal(manifest.build.runIdentity, expectedRunIdentity)
  assert.equal(provenance.build.runIdentity, expectedRunIdentity)
}

function assertFileConsistency(outputRoot, index, manifest, provenance) {
  const rows = new Map(index.files.map(row => [row.kind, row]))
  for (const kind of ['helper', 'manifest', 'checksums', 'provenance', 'license', 'license-metadata', 'attestation']) assert.ok(rows.has(kind), `${kind} row should exist`)
  assert.equal(manifest.files.helper, manifest.artifact.path)
  assert.equal(rows.get('helper').path, manifest.artifact.path)
  assert.equal(rows.get('manifest').path, manifest.files.manifest)
  assert.equal(rows.get('provenance').path, manifest.files.provenance)
  assert.equal(rows.get('license').path, manifest.files.license)
  assert.equal(rows.get('license-metadata').path, manifest.files.licenseMetadata)
  assert.equal(rows.get('attestation').path, manifest.files.attestation)
  assert.equal(manifest.files.provenance.endsWith('/provenance.json'), true)
  assert.equal(provenance.outputRootKind === 'os-temp' || provenance.outputRootKind === 'repo-ignored-artifacts', true)
  for (const row of rows.values()) {
    const filePath = artifactPath(outputRoot, row.path)
    assert.equal(fs.existsSync(filePath), true, `${row.path} should exist`)
    assert.equal(row.sha256, sha256(filePath), `${row.kind} hash should match`)
    assert.equal(row.size, fs.statSync(filePath).size, `${row.kind} size should match`)
  }
}

function assertSmoke(manifest, provenance) {
  assert.equal(manifest.smoke.health, true)
  assert.equal(provenance.smoke.health, true)
  assert.equal(manifest.smoke[MODULE].ok, true)
  assert.equal(provenance.smoke[MODULE].ok, true)
  assert.equal(typeof manifest.smoke[MODULE].paneCount, 'number')
  assert.equal(typeof provenance.smoke[MODULE].paneCount, 'number')
  assert.equal(manifest.smoke[MODULE].capturedAt, provenance.smoke[MODULE].capturedAt)
}

function assertReviewFlags(index, manifest) {
  assert.equal(index.reviewOnly, true)
  assert.equal(index.releaseAsset, false)
  assert.equal(index.installSource, false)
  assert.equal(index.normalUserAvailability, false)
  assert.equal(manifest.businessPathsConnected, false)
  assert.equal(index.retentionHint.kind, 'github-actions-artifact')
  assert.equal(index.retentionHint.days, 7)
  assert.equal(index.expiresHint, 'retention-days:7')
}

function assertGithubContext(index) {
  assert.equal(index.github.repository, GITHUB_ENV.GITHUB_REPOSITORY)
  assert.equal(index.github.workflow, GITHUB_ENV.GITHUB_WORKFLOW)
  assert.equal(index.github.runId, FIXED_GITHUB_RUN_ID)
  assert.equal(index.github.runAttempt, FIXED_GITHUB_RUN_ATTEMPT)
  assert.equal(index.github.sha, FIXED_GITHUB_SHA)
  assert.equal(index.github.ref, FIXED_GITHUB_REF)
}

function assertBuiltArtifact(root, tempRoot, result, expectedRunIdentity, expectedOutputRootKind) {
  const outputRoot = result.outputRoot
  const artifactRoot = artifactDir(outputRoot)
  const index = readJson(path.join(artifactRoot, 'artifact-index.json'))
  const manifest = readJson(path.join(artifactRoot, 'manifest.json'))
  const provenance = readJson(path.join(artifactRoot, 'provenance.json'))
  assertCommonIdentity(index, manifest, provenance)
  assertTargetPlatform(index, manifest)
  assertBuildContext(index, manifest, provenance, expectedRunIdentity)
  assertFileConsistency(outputRoot, index, manifest, provenance)
  assertSmoke(manifest, provenance)
  assertReviewFlags(index, manifest)
  assertGithubContext(index)
  assert.equal(provenance.outputRootKind, expectedOutputRootKind)
  assert.equal(result.summary.outputRootKind, expectedOutputRootKind)
  assert.equal(result.summary.target, 'linux-x64-glibc')
  assert.equal(result.summary.artifact, manifest.artifact.path)
  assert.deepEqual(result.summary.files, {
    artifactIndex: path.posix.join(path.posix.dirname(manifest.files.manifest), 'artifact-index.json'),
    manifest: manifest.files.manifest,
    checksums: manifest.files.checksums,
    provenance: manifest.files.provenance,
    license: manifest.files.license,
    licenseMetadata: manifest.files.licenseMetadata,
    attestation: manifest.files.attestation,
  })
  assertNoLeaks(result.summary, [root, tempRoot, outputRoot])
  assertNoLeaks(index, [root, tempRoot, outputRoot])
  assertNoLeaks(manifest, [root, tempRoot, outputRoot])
  assertNoLeaks(provenance, [root, tempRoot, outputRoot])
}

function assertOutputRootBoundaries(root, tempRoot) {
  const repoIgnoredRoot = path.join(root, '.agentteam-artifacts', 'v0632-builder-provenance-suite')
  assert.doesNotThrow(() => builder.assertAllowedOutputRoot(repoIgnoredRoot, root), 'ignored artifact root class should remain allowed')
  assert.throws(() => buildArtifact(root, tempRoot, {
    outputRoot: path.join(root, 'tracked-output'),
    name: 'tracked-output',
  }), error => {
    assert.ok(error instanceof builder.GoHelperArtifactBuilderError, 'expected builder output-root error')
    assert.equal(error.failureKind, 'output-root-forbidden')
    assertNoLeaks(error.toDiagnostic(), [root, tempRoot])
    return true
  })
}

module.exports = {
  name: 'Go kernel v0.6.32 builder provenance consistency',
  async run(env) {
    const root = env.helpers.extRoot
    let tempRoot
    try {
      tempRoot = mkTempRoot('agentteam-v0632-builder-provenance-')
      const ciResult = buildArtifact(root, tempRoot, { name: 'ci-artifact-output' })
      assertBuiltArtifact(root, tempRoot, ciResult, `github-run-${FIXED_GITHUB_RUN_ID}`, 'os-temp')

      const customResult = buildArtifact(root, tempRoot, {
        name: 'custom-artifact-output',
        runIdentity: 'custom-local-reviewer-run',
      })
      assertBuiltArtifact(root, tempRoot, customResult, 'custom-local-reviewer-run', 'os-temp')

      assertOutputRootBoundaries(root, tempRoot)
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  },
}
