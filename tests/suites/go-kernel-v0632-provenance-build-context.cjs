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
const CAPABILITIES = ['health', 'profile', MODULE, 'compactReadModelFingerprint']
const FIXED_GENERATED_AT = '2026-06-13T02:00:00.000Z'
const FIXED_SOURCE_REVISION = '5555555555555555555555555555555555555555'
const FIXED_GITHUB_SHA = '6666666666666666666666666666666666666666'
const FIXED_GITHUB_RUN_ID = '632632632'
const GITHUB_ENV = {
  GITHUB_REPOSITORY: 'LinYS77/PI-agentteam',
  GITHUB_WORKFLOW: 'Go-Helper-Review-Artifact',
  GITHUB_RUN_ID: FIXED_GITHUB_RUN_ID,
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: FIXED_GITHUB_SHA,
  GITHUB_REF: 'refs/pull/632/merge',
}
const LEAK_SENTINELS = [
  'V0632-PROVENANCE-SOURCE-SHOULD-NOT-LEAK',
  'V0632-PROVENANCE-GENERATED-AT-SHOULD-NOT-LEAK',
  'V0632-PROVENANCE-COMMAND-SHOULD-NOT-LEAK',
  'V0632-PROVENANCE-ENV-SHOULD-NOT-LEAK',
  'V0632-PROVENANCE-CWD-SHOULD-NOT-LEAK',
  'V0632-PROVENANCE-TOOLCHAIN-SHOULD-NOT-LEAK',
  'V0632-PROVENANCE-RUN-IDENTITY-SHOULD-NOT-LEAK',
  'V0632-PROVENANCE-OUTPUT-ROOT-SHOULD-NOT-LEAK',
  'V0632-PROVENANCE-SMOKE-SHOULD-NOT-LEAK',
  'V0632-PROVENANCE-MAILBOX-REPORT-SHOULD-NOT-LEAK',
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

function artifactDir(root) {
  return path.join(root, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc')
}

function manifestPath(root) {
  return path.join(artifactDir(root), 'manifest.json')
}

function provenancePath(root) {
  return path.join(artifactDir(root), 'provenance.json')
}

function indexPath(root) {
  return path.join(artifactDir(root), 'artifact-index.json')
}

function checksumPath(root) {
  return path.join(artifactDir(root), 'SHA256SUMS')
}

function writeFakeGo(binDir) {
  fs.mkdirSync(binDir, { recursive: true })
  const fakeGoPath = path.join(binDir, 'go')
  fs.writeFileSync(fakeGoPath, `#!/usr/bin/env node
const fs = require('node:fs')
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
  "else if (request.method === 'profile') respond({ ...health, profile: { scope: 'skeleton-only', params: request.params || {}, stateConnected: false, tmuxConnected: false, tmuxSnapshotParseConnected: true, compactReadModelFingerprintConnected: true, panelConnected: false, taskReportPlanRunConnected: false } })",
  "else if (request.method === 'tmuxSnapshotParse') respond({ ok: true, capturedAt: Number((request.params || {}).capturedAt || 0), panes: [{ paneId: '%1', target: 'review:@1', label: 'reviewer', currentCommand: 'pi' }], byPaneId: { '%1': { paneId: '%1', target: 'review:@1', label: 'reviewer', currentCommand: 'pi' } } })",
  "else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params && request.params.input, fingerprint: 'helper-should-not-run', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })",
  "else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'method not found' } }) + '\\\\n')",
].join('\\n') + '\\n'
fs.mkdirSync(require('node:path').dirname(output), { recursive: true })
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

function buildReviewArtifact(root, tempRoot, options = {}) {
  const outputRoot = options.outputRoot || path.join(tempRoot, 'downloaded-review-artifact')
  const result = builder.buildGoHelperArtifact({
    extRoot: root,
    outputRoot,
    env: fakeGoEnv(tempRoot),
    ciReview: true,
    generatedAt: FIXED_GENERATED_AT,
    sourceRevision: FIXED_SOURCE_REVISION,
    ...options.builderOptions,
  })
  return { outputRoot, result }
}

function cloneArtifact(tempRoot, sourceRoot, name) {
  const cloneRoot = path.join(tempRoot, `case-${name.replace(/[^a-z0-9-]+/gi, '-')}`)
  fs.cpSync(sourceRoot, cloneRoot, { recursive: true })
  return cloneRoot
}

function rewriteJsonFile(filePath, mutator) {
  const value = readJson(filePath)
  mutator(value)
  writeJson(filePath, value)
  return value
}

function rewriteManifest(root, mutator) {
  return rewriteJsonFile(manifestPath(root), mutator)
}

function rewriteProvenance(root, mutator) {
  return rewriteJsonFile(provenancePath(root), mutator)
}

function rewriteIndex(root, mutator) {
  return rewriteJsonFile(indexPath(root), mutator)
}

function rewriteChecksums(root, mutator) {
  const filePath = checksumPath(root)
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean)
  fs.writeFileSync(filePath, `${mutator(lines).join('\n')}\n`, 'utf8')
}

function refreshIndexRow(root, kind) {
  rewriteIndex(root, index => {
    const row = index.files.find(item => item.kind === kind)
    const filePath = artifactPath(root, row.path)
    row.sha256 = sha256(filePath)
    row.size = fs.statSync(filePath).size
  })
}

function refreshChecksumRow(root, relPath) {
  const nextHash = sha256(artifactPath(root, relPath))
  rewriteChecksums(root, lines => lines.map(line => {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/i)
    assert.ok(match, 'checksum line should stay valid in test fixture')
    return match[2] === relPath ? `${nextHash}  ${relPath}` : line
  }))
}

function refreshMetadata(root, kinds = ['manifest', 'provenance']) {
  const index = readJson(indexPath(root))
  for (const kind of kinds) {
    const row = index.files.find(item => item.kind === kind)
    refreshChecksumRow(root, row.path)
    refreshIndexRow(root, kind)
  }
  refreshChecksumRow(root, readJson(indexPath(root)).files.find(item => item.kind === 'checksums').path)
  refreshIndexRow(root, 'checksums')
}

function verifyWithKernel(env, outputRoot, options = {}) {
  return verifier.verifyGoHelperArtifact({
    artifactRoot: outputRoot,
    kernelModule: env.helpers.requireDist('core/kernel.js'),
    ...options,
  })
}

function strictExpectedOptions(index) {
  return {
    expectedTarget: index.target,
    expectedSourceRevision: index.sourceRevision,
    expectedGithubSha: index.github.sha,
    expectedGithubRunId: index.github.runId,
  }
}

function assertNoOutputLeaks(value, roots = [], forbiddenValues = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'output must not leak absolute roots')
  }
  assert.equal(text.includes(process.cwd()), false, 'output must not leak cwd')
  for (const secret of [...LEAK_SENTINELS, ...forbiddenValues]) {
    assert.equal(text.includes(secret), false, `output must not leak ${secret}`)
  }
}

function assertNoDiagnosticLeaks(value, roots = [], forbiddenValues = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  assert.ok(text.length < 1200, 'diagnostic must stay compact')
  assertNoOutputLeaks(value, roots, forbiddenValues)
  assert.equal(/stdout|stderr|Error:|AssertionError|\bat\s+|stack|native\/tmuxSnapshotParse|manifest\.json|provenance\.json|artifact-index\.json|SHA256SUMS|attestation\.intoto|https?:\/\//i.test(text), false, 'diagnostic must avoid internals and URLs')
}

function assertProvenanceMismatch(error, roots, forbiddenValues = []) {
  assert.ok(error instanceof verifier.GoHelperArtifactVerifierError, 'expected verifier error')
  const diagnostic = error.toDiagnostic()
  assert.equal(diagnostic.ok, false)
  assert.equal(diagnostic.status, 'unavailable')
  assert.equal(diagnostic.module, MODULE)
  assert.equal(diagnostic.capability, MODULE)
  assert.equal(diagnostic.resultMarker, 'fail-closed')
  assert.equal(diagnostic.failureKind, 'provenance-mismatch')
  assertNoDiagnosticLeaks(diagnostic, roots, forbiddenValues)
}

function expectProvenanceFailure(root, env, tempRoot, outputRoot, name, mutator, options = {}) {
  const clone = cloneArtifact(tempRoot, outputRoot, name)
  mutator(clone)
  refreshMetadata(clone, options.kinds || ['manifest', 'provenance'])
  assert.throws(() => verifyWithKernel(env, clone, options.verifyOptions || {}), error => {
    assertProvenanceMismatch(error, [root, tempRoot, clone], options.forbiddenValues || [])
    return true
  }, `${name} should fail provenance validation`)
}

function assertPositive(root, env, outputRoot, index) {
  const noStrict = verifyWithKernel(env, outputRoot)
  assert.equal(noStrict.summary.ok, true)
  assert.equal(noStrict.summary.resultMarker, 'review-artifact-reverified')
  assert.equal(noStrict.index.sourceRevision, FIXED_SOURCE_REVISION)
  assert.equal(noStrict.index.generatedAt, FIXED_GENERATED_AT)
  assert.equal(noStrict.manifest.build.runIdentity, `github-run-${FIXED_GITHUB_RUN_ID}`)
  assert.equal(noStrict.manifest.build.generatedAt, FIXED_GENERATED_AT)
  assert.equal(noStrict.manifest.build.cwd, 'kernel/go/agentteam-kernel')

  const strict = verifyWithKernel(env, outputRoot, strictExpectedOptions(index))
  assert.equal(strict.summary.ok, true)
  assert.equal(strict.manifest.build.runIdentity, `github-run-${FIXED_GITHUB_RUN_ID}`)
  assertNoOutputLeaks(strict.summary, [root, outputRoot])
}

function runNegativeCases(root, env, tempRoot, outputRoot, index) {
  const strict = strictExpectedOptions(index)
  const cases = [
    ['source revision skew', clone => {
      rewriteProvenance(clone, provenance => { provenance.source.revision = LEAK_SENTINELS[0] })
    }, { forbiddenValues: [LEAK_SENTINELS[0]] }],
    ['generatedAt skew', clone => {
      rewriteProvenance(clone, provenance => { provenance.build.generatedAt = LEAK_SENTINELS[1] })
    }, { forbiddenValues: [LEAK_SENTINELS[1]] }],
    ['command tamper shell wrapper', clone => {
      rewriteProvenance(clone, provenance => { provenance.build.command = ['sh', '-c', `go build ${LEAK_SENTINELS[2]}`] })
    }, { forbiddenValues: [LEAK_SENTINELS[2]] }],
    ['command tamper go install', clone => {
      rewriteProvenance(clone, provenance => { provenance.build.command = ['go', 'install', LEAK_SENTINELS[2]] })
    }, { forbiddenValues: [LEAK_SENTINELS[2]] }],
    ['command tamper repo path output', clone => {
      rewriteProvenance(clone, provenance => { provenance.build.command = ['go', 'build', '-trimpath', '-o', `./${LEAK_SENTINELS[2]}`, '.'] })
    }, { forbiddenValues: [LEAK_SENTINELS[2]] }],
    ['env extra key', clone => {
      rewriteProvenance(clone, provenance => { provenance.build.env.GOOS = LEAK_SENTINELS[3] })
    }, { forbiddenValues: [LEAK_SENTINELS[3]] }],
    ['cwd tamper', clone => {
      rewriteProvenance(clone, provenance => { provenance.build.cwd = `../${LEAK_SENTINELS[4]}` })
    }, { forbiddenValues: [LEAK_SENTINELS[4]] }],
    ['toolchain absolute path leak', clone => {
      rewriteProvenance(clone, provenance => { provenance.build.toolchain = `go version go1.99.0 /tmp/${LEAK_SENTINELS[5]}` })
    }, { forbiddenValues: [LEAK_SENTINELS[5]] }],
    ['toolchain raw env leak', clone => {
      rewriteProvenance(clone, provenance => { provenance.build.toolchain = `go version go1.99.0 PATH=${LEAK_SENTINELS[5]}` })
    }, { forbiddenValues: [LEAK_SENTINELS[5]] }],
    ['toolchain mismatch', clone => {
      rewriteProvenance(clone, provenance => { provenance.build.toolchain = 'go version go1.98.0 mismatch/host' })
    }],
    ['runIdentity mismatch', clone => {
      rewriteProvenance(clone, provenance => { provenance.build.runIdentity = LEAK_SENTINELS[6] })
    }, { forbiddenValues: [LEAK_SENTINELS[6]] }],
    ['strict expected run id mismatch', clone => {
      rewriteManifest(clone, manifest => { manifest.build.runIdentity = 'local-reviewer-run' })
      rewriteProvenance(clone, provenance => { provenance.build.runIdentity = 'local-reviewer-run' })
    }, { verifyOptions: strict }],
    ['outputRootKind tamper', clone => {
      rewriteProvenance(clone, provenance => { provenance.outputRootKind = LEAK_SENTINELS[7] })
    }, { forbiddenValues: [LEAK_SENTINELS[7]] }],
    ['strict expected context requires os temp', clone => {
      rewriteProvenance(clone, provenance => { provenance.outputRootKind = 'repo-ignored-artifacts' })
    }, { verifyOptions: strict }],
    ['smoke body tamper', clone => {
      rewriteProvenance(clone, provenance => { provenance.smoke[MODULE].stdout = LEAK_SENTINELS[8] })
    }, { forbiddenValues: [LEAK_SENTINELS[8]] }],
    ['unknown provenance top-level key', clone => {
      rewriteProvenance(clone, provenance => { provenance.releaseAsset = LEAK_SENTINELS[0] })
    }, { forbiddenValues: [LEAK_SENTINELS[0]] }],
    ['unknown provenance source key', clone => {
      rewriteProvenance(clone, provenance => { provenance.source.url = LEAK_SENTINELS[0] })
    }, { forbiddenValues: [LEAK_SENTINELS[0]] }],
    ['unknown provenance build key', clone => {
      rewriteProvenance(clone, provenance => { provenance.build.release = LEAK_SENTINELS[0] })
    }, { forbiddenValues: [LEAK_SENTINELS[0]] }],
    ['unknown provenance env key', clone => {
      rewriteProvenance(clone, provenance => { provenance.build.env.GITHUB_TOKEN = LEAK_SENTINELS[3] })
    }, { forbiddenValues: [LEAK_SENTINELS[3]] }],
    ['unknown provenance smoke key', clone => {
      rewriteProvenance(clone, provenance => { provenance.smoke.normalUserAvailability = LEAK_SENTINELS[8] })
    }, { forbiddenValues: [LEAK_SENTINELS[8]] }],
  ]

  for (const [name, mutator, options = {}] of cases) {
    expectProvenanceFailure(root, env, tempRoot, outputRoot, name, mutator, options)
  }
}

function assertLocalReviewerCustomRunIdentityStillPasses(root, env, tempRoot) {
  const localOutput = path.join(tempRoot, 'local-reviewer-artifact')
  const { outputRoot } = buildReviewArtifact(root, tempRoot, {
    outputRoot: localOutput,
    builderOptions: {
      env: fakeGoEnv(tempRoot),
      runIdentity: 'custom-local-reviewer-run',
    },
  })
  const verified = verifyWithKernel(env, outputRoot)
  assert.equal(verified.summary.ok, true)
  assert.equal(verified.manifest.build.runIdentity, 'custom-local-reviewer-run')
}

function assertRuntimePackageGuard(root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define ${key}`)
  }
  assert.equal((packageJson.files || []).some(item => /(?:github|workflow|helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include workflow/native/helper/generated artifacts')
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
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }

  const runtimeSources = [fs.readFileSync(path.join(root, 'core', 'kernel.ts'), 'utf8'), fs.readFileSync(path.join(root, 'core', 'kernelPackagedResolver.ts'), 'utf8')].join('\n')
  assert.equal(/provenance\.json|artifact-index|artifactIndex|go-helper-review-artifact|download-artifact|github\.sha|github\.run_id|workflow_dispatch/i.test(runtimeSources), false, 'runtime/resolver must not read artifact/provenance workflow metadata')
  assert.equal(/default Go is enabled|normal-user native availability|package-manager install proof|release asset/i.test(runtimeSources), false, 'runtime/resolver must not claim package/release/default availability')
}

function assertDocUpdated(root) {
  const doc = fs.readFileSync(path.join(root, 'docs/perf/v0.6.32-ci-review-provenance-build-context.md'), 'utf8')
  assert.ok(doc.includes('Slice 1 adds the local hosted observation record validator, CLI, docs, and guard only.'), 'doc should retain Slice 1 status')
  assert.ok(doc.includes('Slice 2 hardens review artifact verifier cross-document source/build context consistency across `artifact-index.json`, `manifest.json`, and `provenance.json` with compact `provenance-mismatch` diagnostics.'), 'doc should mention Slice 2 verifier hardening')
  assert.ok(doc.includes('`provenance-mismatch`'), 'doc should mention provenance mismatch diagnostics')
}

module.exports = {
  name: 'Go kernel v0.6.32 provenance build context',
  async run(env) {
    const root = env.helpers.extRoot
    assert.ok(verifier.FAILURE_KINDS.has('provenance-mismatch'), 'verifier should expose provenance-mismatch diagnostics')
    let tempRoot
    try {
      tempRoot = mkTempRoot('agentteam-v0632-provenance-')
      const { outputRoot, result } = buildReviewArtifact(root, tempRoot)
      const index = result.artifactIndex
      assert.equal(index.target, 'linux-x64-glibc')
      assert.equal(index.sourceRevision, FIXED_SOURCE_REVISION)
      assert.equal(index.generatedAt, FIXED_GENERATED_AT)
      assert.equal(index.github.runId, FIXED_GITHUB_RUN_ID)
      assertPositive(root, env, outputRoot, index)
      runNegativeCases(root, env, tempRoot, outputRoot, index)
      assertLocalReviewerCustomRunIdentityStillPasses(root, env, tempRoot)
      assertRuntimePackageGuard(root)
      assertDocUpdated(root)
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  },
}
