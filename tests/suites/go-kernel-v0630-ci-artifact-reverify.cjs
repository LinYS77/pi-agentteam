const assert = require('node:assert/strict')
const cp = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  BUILDER_COMMAND,
  VERIFIER_COMMAND,
  assertWorkflowContract,
  readWorkflow,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const builder = require('../../scripts/lib/go-helper-artifact-builder.cjs')
const verifier = require('../../scripts/lib/go-helper-artifact-verifier.cjs')

const DOC = 'docs/perf/v0.6.30-ci-review-artifact-prototype.md'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITIES = ['health', 'profile', MODULE, 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability']
const FIXED_GENERATED_AT = '2026-06-12T00:00:00.000Z'
const FIXED_REVISION = '1234567890abcdef1234567890abcdef12345678'
const SECRET_STDOUT = 'V0630_REVERIFY_STDOUT_SHOULD_NOT_LEAK'
const SECRET_STDERR = 'V0630_REVERIFY_STDERR_SHOULD_NOT_LEAK'
const SECRET_MANIFEST = 'V0630_REVERIFY_MANIFEST_BODY_SHOULD_NOT_LEAK'
const SECRET_PROVENANCE = 'V0630_REVERIFY_PROVENANCE_BODY_SHOULD_NOT_LEAK'
const SECRET_LICENSE = 'V0630_REVERIFY_LICENSE_BODY_SHOULD_NOT_LEAK'
const SECRET_ATTESTATION = 'V0630_REVERIFY_ATTESTATION_BODY_SHOULD_NOT_LEAK'
const SECRET_MAILBOX = 'V0630_REVERIFY_MAILBOX_REPORT_SHOULD_NOT_LEAK'

const BAD_HELPER_SOURCE = `#!/usr/bin/env node
process.stdout.write('${SECRET_STDOUT}\n')
process.stderr.write('${SECRET_STDERR}\n')
process.exit(1)
`

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

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
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
  "else if (request.method === 'tmuxSnapshotParse') respond({ ok: true, capturedAt: Number((request.params || {}).capturedAt || 0), panes: [{ paneId: '%1', target: 'test:@1', label: 'team-lead', currentCommand: 'pi' }], byPaneId: { '%1': { paneId: '%1', target: 'test:@1', label: 'team-lead', currentCommand: 'pi' } } })",
  "else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params && request.params.input, fingerprint: 'helper-should-not-run', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })",
  "else if (request.method === 'workerLifecycle') { const params = request.params || {}; if (params.operation === 'listAgentTeamPanes') respond({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'captureCurrentPaneBinding') respond({ ok: true, operation: 'captureCurrentPaneBinding', capability: 'workerLifecycle', paneId: '%fake-current', target: 'test:@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'listPanesInWindow') respond({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: params.target || 'test:@1', exists: true, paneIds: ['%fake-current'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findAgentTeamWindowTarget') respond({ ok: true, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findWindowTargetByName') respond({ ok: true, operation: 'findWindowTargetByName', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', windowName: params.windowName || 'agentteam', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'sessionExists') respond({ ok: true, operation: 'sessionExists', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'markWindowAsAgentTeam') respond({ ok: false, operation: 'markWindowAsAgentTeam', capability: 'workerLifecycle', target: '', marked: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', error: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'refreshWindowPaneLabels') respond({ ok: false, operation: 'refreshWindowPaneLabels', capability: 'workerLifecycle', target: '', refreshed: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle refreshWindowPaneLabels unavailable (invalid-target)', error: 'Go worker lifecycle refreshWindowPaneLabels unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else respond({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId: params.paneId || '', requestedPaneId: params.paneId || '', exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', error: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) }",
  "else if (request.method === 'tmuxAvailability') respond({ ok: true, capability: 'tmuxAvailability', available: true, version: 'tmux 3.4', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })",
  "else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'method not found' } }) + '\\\\n')",
].join('\\n') + '\\n'
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, helperSource, 'utf8')
if (process.platform !== 'win32') fs.chmodSync(output, 0o755)
`, 'utf8')
  fs.chmodSync(fakeGoPath, 0o755)
}

function fakeGoEnv(tempRoot, overrides = {}) {
  const binDir = path.join(tempRoot, 'fake-bin')
  writeFakeGo(binDir)
  return { ...process.env, ...overrides, PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}` }
}

function requireTypeScript() {
  try {
    return require('typescript')
  } catch (_) {
    return require('/home/linyusheng/.nvm/versions/node/v24.9.0/lib/node_modules/typescript')
  }
}

function transpileCoreForDirect(root) {
  const ts = requireTypeScript()
  const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0630-reverify-preview-core-'))
  fs.mkdirSync(path.join(distRoot, 'core'), { recursive: true })
  for (const rel of ['core/readModelFingerprint.ts', 'core/kernelContract.ts', 'core/kernelPackagedResolver.ts', 'core/kernel.ts']) {
    const sourcePath = path.join(root, rel)
    const out = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: sourcePath,
      reportDiagnostics: false,
    }).outputText
    fs.writeFileSync(path.join(distRoot, rel.replace(/\.ts$/, '.js')), out, 'utf8')
  }
  return {
    kernel: require(path.join(distRoot, 'core/kernel.js')),
    cleanup() {
      fs.rmSync(distRoot, { recursive: true, force: true })
    },
  }
}

function loadKernel(env) {
  if (env.helpers.requireDist) return { kernel: env.helpers.requireDist('core/kernel.js'), cleanup() {} }
  return transpileCoreForDirect(env.helpers.extRoot)
}

function instrumentKernel(kernel, counters) {
  return {
    ...kernel,
    createAgentTeamKernelAdapter(options = {}) {
      counters.adapterCalls += 1
      assert.equal(options.mode, 'go-packaged-preview', 'verifier preview smoke must use explicit packaged preview mode')
      assert.equal(typeof options.packagedHelperInstallRoot, 'string', 'verifier preview smoke must pass installed root')
      assert.equal(typeof options.packagedHelperManifestPath, 'string', 'verifier preview smoke must pass manifest rel path')
      const adapter = kernel.createAgentTeamKernelAdapter(options)
      return {
        metadata: (...args) => adapter.metadata(...args),
        health: (...args) => adapter.health(...args),
        profile: (...args) => adapter.profile(...args),
        compactReadModelFingerprint(input, fallback) {
          counters.fingerprintCalls += 1
          const before = adapter.metadata().kernel.calls
          const result = adapter.compactReadModelFingerprint(input, fallback)
          const after = adapter.metadata().kernel.calls
          assert.equal(after, before, 'compactReadModelFingerprint must remain TypeScript fallback in preview')
          return result
        },
        parseTmuxPaneSnapshot(stdout, capturedAt, fallback) {
          counters.parseCalls += 1
          return adapter.parseTmuxPaneSnapshot(stdout, capturedAt, (...args) => {
            counters.tmuxFallbackCalls += 1
            return fallback(...args)
          })
        },
      }
    },
  }
}

function buildReviewArtifact(root, tempRoot, overrides = {}) {
  const outputRoot = path.join(tempRoot, 'downloaded-review-artifact')
  const result = builder.buildGoHelperArtifact({
    extRoot: root,
    outputRoot,
    env: fakeGoEnv(tempRoot, overrides.env),
    ciReview: true,
    generatedAt: FIXED_GENERATED_AT,
    runIdentity: 'suite-reverify-run',
    sourceRevision: FIXED_REVISION,
  })
  return { outputRoot, result }
}

function cloneArtifact(tempRoot, sourceRoot, name) {
  const cloneRoot = path.join(tempRoot, `case-${name.replace(/[^a-z0-9-]+/gi, '-')}`)
  fs.cpSync(sourceRoot, cloneRoot, { recursive: true })
  return cloneRoot
}

function artifactPath(root, relPath) {
  return path.join(root, ...relPath.split('/'))
}

function assertNoAbsoluteLeaks(value, roots = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'output must not leak absolute roots')
  }
  assert.equal(text.includes(process.cwd()), false, 'output must not leak cwd')
  return text
}

function assertNoDiagnosticLeaks(value, roots = []) {
  const text = assertNoAbsoluteLeaks(value, roots)
  assert.equal(/stdout|stderr|Error:|AssertionError|\bat\s+|stack|native\/tmuxSnapshotParse|manifest\.json|provenance\.json|license\.json|attestation\.intoto|SHA256SUMS/i.test(text), false, 'diagnostic must stay compact and avoid internals')
  for (const secret of [SECRET_STDOUT, SECRET_STDERR, SECRET_MANIFEST, SECRET_PROVENANCE, SECRET_LICENSE, SECRET_ATTESTATION, SECRET_MAILBOX]) {
    assert.equal(text.includes(secret), false, `diagnostic must not leak ${secret}`)
  }
}

function assertDiagnostic(error, failureKind, roots) {
  assert.ok(error instanceof verifier.GoHelperArtifactVerifierError, 'expected verifier error')
  const diagnostic = error.toDiagnostic()
  assert.equal(diagnostic.ok, false)
  assert.equal(diagnostic.status, 'unavailable')
  assert.equal(diagnostic.module, MODULE)
  assert.equal(diagnostic.capability, MODULE)
  assert.equal(diagnostic.resultMarker, 'fail-closed')
  assert.equal(diagnostic.failureKind, failureKind)
  assertNoDiagnosticLeaks(diagnostic, roots)
}

function indexPath(root) {
  return path.join(root, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'artifact-index.json')
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

function rewriteChecksum(root, relPath, hash) {
  const checksumPath = path.join(root, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'SHA256SUMS')
  const rows = fs.readFileSync(checksumPath, 'utf8').trim().split('\n').filter(Boolean).map(line => {
    const [, existingHash, existingRel] = line.match(/^([a-f0-9]{64})  (.+)$/i)
    return existingRel === relPath ? `${hash}  ${existingRel}` : `${existingHash}  ${existingRel}`
  })
  fs.writeFileSync(checksumPath, `${rows.join('\n')}\n`, 'utf8')
  refreshIndexRow(root, 'checksums')
}

function rewriteManifest(root, mutator) {
  const manifestPath = path.join(root, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'manifest.json')
  const manifest = readJson(manifestPath)
  mutator(manifest)
  writeJson(manifestPath, manifest)
  refreshIndexRow(root, 'manifest')
}

function rewriteHelper(root, helperRel, source) {
  const helperPath = artifactPath(root, helperRel)
  fs.writeFileSync(helperPath, source, 'utf8')
  if (process.platform !== 'win32') fs.chmodSync(helperPath, 0o755)
  const helperHash = sha256(helperPath)
  let manifestRel
  rewriteManifest(root, manifest => {
    manifestRel = manifest.files.manifest
    manifest.artifact.sha256 = helperHash
    manifest.artifact.size = fs.statSync(helperPath).size
  })
  rewriteChecksum(root, helperRel, helperHash)
  rewriteChecksum(root, manifestRel, sha256(artifactPath(root, manifestRel)))
  refreshIndexRow(root, 'helper')
}

function rewriteAttestation(root, mutator) {
  const manifestPath = path.join(root, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'manifest.json')
  const manifest = readJson(manifestPath)
  const attestationPath = artifactPath(root, manifest.files.attestation)
  const attestation = JSON.parse(fs.readFileSync(attestationPath, 'utf8').trim())
  mutator(attestation)
  fs.writeFileSync(attestationPath, `${JSON.stringify(attestation)}\n`, 'utf8')
  manifest.attestation.sha256 = sha256(attestationPath)
  writeJson(manifestPath, manifest)
  refreshIndexRow(root, 'attestation')
  refreshIndexRow(root, 'manifest')
  rewriteChecksum(root, manifest.files.attestation, manifest.attestation.sha256)
  rewriteChecksum(root, manifest.files.manifest, sha256(manifestPath))
}

function runPositive(root, env) {
  let tempRoot
  try {
    tempRoot = mkTempRoot('agentteam-v0630-reverify-positive-')
    const { outputRoot, result } = buildReviewArtifact(root, tempRoot)
    const loaded = loadKernel(env)
    const counters = { adapterCalls: 0, fingerprintCalls: 0, parseCalls: 0, tmuxFallbackCalls: 0 }
    const kernel = instrumentKernel(loaded.kernel, counters)
    let verified
    try {
      verified = verifier.verifyGoHelperArtifact({ artifactRoot: outputRoot, kernelModule: kernel })
    } finally {
      loaded.cleanup()
    }
    assert.equal(verified.summary.ok, true)
    assert.equal(verified.summary.resultMarker, 'review-artifact-reverified')
    assert.equal(verified.summary.target, 'linux-x64-glibc')
    assert.equal(verified.summary.reviewOnly, true)
    assert.equal(verified.summary.releaseAsset, false)
    assert.equal(verified.summary.installSource, false)
    assert.equal(verified.summary.normalUserAvailability, false)
    assert.equal(verified.summary.directSmoke.health, true)
    assert.equal(verified.summary.directSmoke.tmuxSnapshotParse, true)
    assert.equal(verified.summary.explicitPreview.packagedManifestResolved, true)
    assert.equal(verified.summary.explicitPreview.tmuxSnapshotParse, true)
    assert.equal(verified.summary.explicitPreview.compactReadModelFingerprint, 'typescript-fallback')
    assert.equal(counters.adapterCalls, 1, 'verifier must create explicit packaged preview adapter')
    assert.equal(counters.fingerprintCalls, 1, 'verifier must exercise compactReadModelFingerprint preview fallback')
    assert.equal(counters.parseCalls, 1, 'verifier must exercise parseTmuxPaneSnapshot through preview adapter')
    assert.equal(counters.tmuxFallbackCalls, 0, 'verifier preview parse must not call TypeScript tmux fallback')
    assert.equal(verified.summary.files.artifactIndex, result.summary.files.artifactIndex)
    assert.equal(verified.summary.files.manifest, result.summary.files.manifest)
    assert.equal(verified.summary.files.helper, result.summary.artifact)
    assertNoAbsoluteLeaks(verified.summary, [root, outputRoot, tempRoot, process.cwd()])

    const cli = path.join(root, 'scripts', 'verify-go-helper-artifact.cjs')
    const run = cp.spawnSync(process.execPath, [cli, '--artifact-root', outputRoot, '--json'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, PATH: process.env.PATH || '' },
    })
    assert.equal(run.status, 0, run.stderr)
    const summary = JSON.parse(run.stdout)
    assert.equal(summary.resultMarker, 'review-artifact-reverified')
    assertNoAbsoluteLeaks(summary, [root, outputRoot, tempRoot, process.cwd()])
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function runNegativeCases(root) {
  let tempRoot
  try {
    tempRoot = mkTempRoot('agentteam-v0630-reverify-negative-')
    const { outputRoot, result } = buildReviewArtifact(root, tempRoot)
    const manifestRel = result.summary.files.manifest
    const helperRel = result.summary.artifact
    const checksumsRel = result.summary.files.checksums
    const provenanceRel = result.summary.files.provenance
    const licenseRel = result.summary.files.license
    const attestationRel = result.summary.files.attestation

    const cases = [
      ['missing index', 'artifact-index-missing', clone => fs.rmSync(artifactPath(clone, result.summary.files.artifactIndex), { force: true })],
      ['missing manifest', 'integrity-mismatch', clone => fs.rmSync(artifactPath(clone, manifestRel), { force: true })],
      ['missing helper', 'helper-missing', clone => fs.rmSync(artifactPath(clone, helperRel), { force: true })],
      ['checksum mismatch', 'integrity-mismatch', clone => fs.appendFileSync(artifactPath(clone, helperRel), 'tamper')],
      ['missing provenance', 'integrity-mismatch', clone => fs.rmSync(artifactPath(clone, provenanceRel), { force: true })],
      ['missing license', 'integrity-mismatch', clone => fs.rmSync(artifactPath(clone, licenseRel), { force: true })],
      ['missing attestation', 'integrity-mismatch', clone => fs.rmSync(artifactPath(clone, attestationRel), { force: true })],
      ['bad flags', 'artifact-index-invalid', clone => rewriteIndex(clone, index => { index.reviewOnly = false; index.releaseAsset = true; index.__secret = SECRET_MAILBOX })],
      ['unsafe index path', 'path-unsafe', clone => rewriteIndex(clone, index => { index.files.find(row => row.kind === 'helper').path = '../escape/helper'; index.__secret = SECRET_MANIFEST })],
      ['unsafe manifest path', 'path-unsafe', clone => rewriteManifest(clone, manifest => { manifest.files.helper = '../escape/helper'; manifest.artifact.path = '../escape/helper'; manifest.__secret = SECRET_MANIFEST })],
      ['stale target', 'unsupported-platform', clone => rewriteManifest(clone, manifest => { manifest.target = 'linux-x64-musl'; manifest.platform.libc = 'musl'; manifest.__secret = SECRET_MANIFEST })],
      ['stale version', 'version-skew', clone => rewriteManifest(clone, manifest => { manifest.helperVersion = '0.0.0-stale'; manifest.__secret = SECRET_MANIFEST })],
      ['missing checksums', 'integrity-mismatch', clone => fs.rmSync(artifactPath(clone, checksumsRel), { force: true })],
      ['bad attestation claim', 'attestation-invalid', clone => rewriteAttestation(clone, attestation => {
        attestation.predicate.placeholderOnly = false
        attestation.predicate.signed = true
        attestation.predicate.signing = SECRET_ATTESTATION
      })],
    ]

    for (const [name, failureKind, mutate] of cases) {
      const clone = cloneArtifact(tempRoot, outputRoot, name)
      mutate(clone)
      assert.throws(() => verifier.verifyGoHelperArtifact({ artifactRoot: clone }), error => {
        try {
          assertDiagnostic(error, failureKind, [root, tempRoot, clone, process.cwd()])
        } catch (assertion) {
          assertion.message = `${name}: ${assertion.message}`
          throw assertion
        }
        return true
      }, name)
    }

    const badSmokeRoot = cloneArtifact(tempRoot, outputRoot, 'bad-jsonrpc-smoke')
    rewriteHelper(badSmokeRoot, helperRel, BAD_HELPER_SOURCE)
    assert.throws(() => verifier.verifyGoHelperArtifact({ artifactRoot: badSmokeRoot }), error => {
      assertDiagnostic(error, 'jsonrpc-smoke-failed', [root, tempRoot, badSmokeRoot, process.cwd()])
      return true
    })
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function assertWorkflow(root) {
  assertWorkflowContract(root)
  const workflow = readWorkflow(root)
  assert.ok(workflow.includes('verify-review-artifact:'), 'workflow should include verify job')
  assert.ok(workflow.includes('needs: build-review-artifact'), 'verify job should depend on build job')
  assert.ok(workflow.includes('actions/download-artifact@v4'), 'verify job should download review artifact')
  assert.ok(workflow.includes(VERIFIER_COMMAND), 'verify job should run reviewer verifier')
  assert.ok(workflow.includes(BUILDER_COMMAND), 'build job should still use CI review builder')
  assert.equal((workflow.match(/actions\/download-artifact@v4/g) || []).length, 1, 'download-artifact should appear only once')
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|curl\b|wget\b|node-gyp\b|prebuild/i.test(workflow), false, 'workflow must not add release/npm/git/network download behavior')
}

function assertDocs(root) {
  const doc = fs.readFileSync(path.join(root, DOC), 'utf8')
  for (const expected of [
    'Slice 4 — CI Artifact Download/Reverify Smoke',
    '`scripts/lib/go-helper-artifact-verifier.cjs`',
    '`scripts/verify-go-helper-artifact.cjs`',
    'reviewer/CI transport validation, not runtime download',
    'actions/download-artifact@v4',
    'Direct JSON-RPC smoke covers `health` and `tmuxSnapshotParse`',
    'Explicit preview smoke constructs `createAgentTeamKernelAdapter({ mode: \'go-packaged-preview\', packagedHelperInstallRoot, packagedHelperManifestPath })`',
    '`compactReadModelFingerprint` remains TypeScript fallback and must not call the helper in explicit preview smoke',
    'No artifact URL/config is product/runtime input in Slice 4',
  ]) assert.ok(doc.includes(expected), `doc should include ${expected}`)
  for (const forbidden of ['runtime download is implemented', 'install source is approved', 'package-manager install proof is implemented', 'release assets are implemented', 'default Go is enabled']) {
    assert.equal(doc.includes(forbidden), false, `doc must not overclaim: ${forbidden}`)
  }
}

function assertRuntimeUnchanged(root) {
  const kernel = fs.readFileSync(path.join(root, 'core/kernel.ts'), 'utf8')
  const resolver = fs.readFileSync(path.join(root, 'core/kernelPackagedResolver.ts'), 'utf8')
  assert.equal(/download-artifact|verify-go-helper-artifact|artifact-index|artifactIndex|artifact URL|artifactUrl/i.test(kernel), false, 'runtime kernel must not auto-download or read artifact-index')
  assert.equal(/download-artifact|verify-go-helper-artifact|artifact-index|artifactIndex|artifact URL|artifactUrl/i.test(resolver), false, 'packaged resolver must not auto-download or read artifact-index')
  assert.ok(kernel.includes('if (cutoverRequested) return fallback(compactInput)'), 'compactReadModelFingerprint remains TS fallback')
}

function assertNoGeneratedCommitted(root) {
  const forbidden = []
  function walk(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      const rel = toPosix(path.relative(root, full))
      if (entry.isDirectory()) walk(full)
      else if (!rel.startsWith('tests/suites/') && !rel.startsWith('tests/helpers/') && !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam') && (/artifact-index\.json$/i.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|zip)$/i.test(rel))) forbidden.push(rel)
    }
  }
  walk(root)
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.30 CI artifact reverify',
  async run(env) {
    const root = env.helpers.extRoot
    runPositive(root, env)
    runNegativeCases(root)
    assertWorkflow(root)
    assertDocs(root)
    assertRuntimeUnchanged(root)
    assertNoGeneratedCommitted(root)
  },
}
