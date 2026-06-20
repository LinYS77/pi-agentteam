const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  CleanInstallProofError,
  compactFailure,
  runInstalledLayoutConsumptionProof,
} = require('../../scripts/lib/go-helper-clean-install-proof.cjs')

const DOC = 'docs/perf/v0.6.33-clean-install-native-helper-consumption.md'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITIES = ['health', 'profile', MODULE, 'compactReadModelFingerprint']
const FIXED_GENERATED_AT = '2026-06-14T04:00:00.000Z'
const FIXED_SOURCE_REVISION = '8888888888888888888888888888888888888888'
const RUN_IDENTITY = 'v0633-installed-layout-fail-closed-suite'
const LEAK_SENTINELS = [
  'V0633_FAILCLOSED_STDOUT_SHOULD_NOT_LEAK',
  'V0633_FAILCLOSED_STDERR_SHOULD_NOT_LEAK',
  'V0633_FAILCLOSED_MANIFEST_BODY_SHOULD_NOT_LEAK',
  'V0633_FAILCLOSED_PROVENANCE_BODY_SHOULD_NOT_LEAK',
  'V0633_FAILCLOSED_LICENSE_BODY_SHOULD_NOT_LEAK',
  'V0633_FAILCLOSED_ATTESTATION_BODY_SHOULD_NOT_LEAK',
]
const EXPECTED_FAILURE_KINDS = new Set([
  'artifact-verification-failed',
  'installed-preview-smoke-failed',
])

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function artifactPath(root, relPath) {
  return path.join(root, ...relPath.split('/'))
}

function manifestPath(root) {
  return path.join(root, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'manifest.json')
}

function indexPath(root) {
  return path.join(root, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'artifact-index.json')
}

function checksumPath(root) {
  return path.join(root, 'native', MODULE, HELPER_VERSION, 'linux-x64-glibc', 'SHA256SUMS')
}

function mkTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0633-fail-closed-suite-'))
  assert.equal(path.dirname(root), os.tmpdir(), 'suite temp root must be directly under OS tmpdir')
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
  'let input = ""',
  "process.stdin.setEncoding('utf8')",
  "process.stdin.on('data', chunk => { input += chunk })",
  "process.stdin.on('end', () => {",
  "  const request = input.trim() ? JSON.parse(input.trim().split('\\\\n')[0]) : {}",
  '  const health = ' + JSON.stringify(health),
  "  function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\\\n') }",
  "  if (request.method === 'health') respond(health)",
  "  else if (request.method === 'profile') respond({ ...health, profile: { scope: 'skeleton-only', params: request.params || {}, stateConnected: false, tmuxConnected: false, tmuxSnapshotParseConnected: true, compactReadModelFingerprintConnected: true, panelConnected: false, taskReportPlanRunConnected: false } })",
  "  else if (request.method === 'tmuxSnapshotParse') respond({ ok: true, capturedAt: Number((request.params || {}).capturedAt || 0), panes: [{ paneId: '%1', target: 'installed:@1', label: 'installed-helper', currentCommand: 'pi' }], byPaneId: { '%1': { paneId: '%1', target: 'installed:@1', label: 'installed-helper', currentCommand: 'pi' } } })",
  "  else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params && request.params.input, fingerprint: 'helper-should-not-run', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })",
  "  else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'method not found' } }) + '\\\\n')",
  '})',
].join('\\n') + '\\n'
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, helperSource, 'utf8')
if (process.platform !== 'win32') fs.chmodSync(output, 0o755)
`, 'utf8')
  fs.chmodSync(fakeGoPath, 0o755)
}

function builderOptions(root) {
  const fakeBin = path.join(root, 'fake-bin')
  writeFakeGo(fakeBin)
  return {
    env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}` },
    generatedAt: FIXED_GENERATED_AT,
    sourceRevision: FIXED_SOURCE_REVISION,
    runIdentity: RUN_IDENTITY,
  }
}

function rewriteIndex(root, mutator) {
  const filePath = indexPath(root)
  const index = readJson(filePath)
  mutator(index)
  writeJson(filePath, index)
}

function rewriteManifest(root, mutator) {
  const filePath = manifestPath(root)
  const manifest = readJson(filePath)
  mutator(manifest)
  writeJson(filePath, manifest)
  if (manifest.files?.manifest) refreshChecksumAndIndex(root, manifest.files.manifest, 'manifest')
}

function rewriteChecksum(root, targetRel, nextHash) {
  const filePath = checksumPath(root)
  const rows = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean).map(line => {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/i)
    assert.ok(match, 'checksum row should stay parseable')
    return match[2] === targetRel ? `${nextHash}  ${targetRel}` : line
  })
  fs.writeFileSync(filePath, `${rows.join('\n')}\n`, 'utf8')
}

function refreshIndexRow(root, kind) {
  rewriteIndex(root, index => {
    const row = index.files.find(item => item.kind === kind)
    const filePath = artifactPath(root, row.path)
    row.sha256 = sha256(filePath)
    row.size = fs.statSync(filePath).size
  })
}

function refreshChecksumAndIndex(root, rel, kind) {
  rewriteChecksum(root, rel, sha256(artifactPath(root, rel)))
  refreshIndexRow(root, kind)
  refreshIndexRow(root, 'checksums')
}

function setInstalledHelper(root, source, options = {}) {
  const manifest = readJson(manifestPath(root))
  const helperPath = artifactPath(root, manifest.files.helper)
  fs.writeFileSync(helperPath, source, 'utf8')
  if (process.platform !== 'win32') fs.chmodSync(helperPath, options.mode ?? 0o755)
  manifest.artifact.size = fs.statSync(helperPath).size
  manifest.artifact.sha256 = sha256(helperPath)
  if (options.executable === false) manifest.artifact.mode = '0644'
  writeJson(manifestPath(root), manifest)
  rewriteChecksum(root, manifest.files.helper, sha256(helperPath))
  rewriteChecksum(root, manifest.files.manifest, sha256(manifestPath(root)))
}

function corruptSmokeHelperSource() {
  return `#!/usr/bin/env node
process.stdout.write('${LEAK_SENTINELS[0]}\\n')
process.stderr.write('${LEAK_SENTINELS[1]}\\n')
process.exit(1)
`
}

function assertNoLeaks(value, roots = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'diagnostic must not leak absolute roots')
  }
  assert.equal(text.includes(process.cwd()), false, 'diagnostic must not leak cwd')
  assert.equal(/stdout|stderr|Error:|AssertionError|\bat\s+|stack|node_modules\/pi-agentteam|\.tgz|agentteam-v0633-|package\/index\.ts|raw manifest|raw provenance|raw verifier|manifest body|provenance body|license body|attestation body/i.test(text), false, 'diagnostic must stay compact and avoid raw process/package/metadata internals')
  for (const sentinel of LEAK_SENTINELS) assert.equal(text.includes(sentinel), false, `diagnostic must not leak ${sentinel}`)
}

function assertDiagnostic(error, expected) {
  assert.ok(error instanceof CleanInstallProofError, `${expected.name} should throw CleanInstallProofError`)
  assert.ok(EXPECTED_FAILURE_KINDS.has(error.failureKind), `${expected.name} failureKind should be bounded`)
  assert.equal(error.failureKind, expected.failureKind, `${expected.name} failureKind`)
  if (expected.hint) assert.equal(error.hint, expected.hint, `${expected.name} hint`)
  const diagnostic = error.toDiagnostic()
  assert.equal(diagnostic.ok, false)
  assert.equal(diagnostic.status, 'unavailable')
  assert.equal(diagnostic.resultMarker, 'fail-closed')
  assert.equal(diagnostic.reviewOnly, true)
  assert.equal(diagnostic.prototype, true)
  assert.equal(diagnostic.nonAvailability, true)
  assert.equal(diagnostic.normalUserAvailability, false)
  assert.equal(diagnostic.nativePackageDelivery, false)
  assert.equal(diagnostic.defaultResolverChanged, false)
  assert.equal(typeof diagnostic.remediation, 'string')
  assert.equal(typeof diagnostic.hint, 'string')
  assertNoLeaks(diagnostic, expected.roots)
}

function runFailureCase(root, testRoot, expected, options = {}) {
  const roots = []
  assert.throws(() => runInstalledLayoutConsumptionProof({
    repoRoot: root,
    buildReviewArtifact: true,
    builderOptions: builderOptions(testRoot),
    onTempRoots(tempRoots) {
      roots.push(tempRoots.packRoot, tempRoots.installProjectRoot)
    },
    ...options,
  }), error => {
    expected.roots = [root, testRoot, ...roots]
    assertDiagnostic(error, expected)
    return true
  }, expected.name)
  for (const tempRoot of roots) assert.equal(fs.existsSync(tempRoot), false, `temp root should be cleaned for ${expected.name}: ${tempRoot}`)
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of [
    'Slice 4 — Installed Layout Fail-Closed / No-Leak Negative Evidence',
    '`tests/suites/go-kernel-v0633-installed-layout-fail-closed.cjs`',
    'missing helper, missing copied layout, unsafe traversal/backslash paths, wrong platform, checksum mismatch, missing provenance, missing license metadata, invalid placeholder attestation, package/helper/protocol/capability skew, non-executable helper, corrupt helper smoke output, and attempted default resolver use',
    'Each negative case must fail closed with compact redacted diagnostics and no temp root, repo cwd, helper path, raw stdout/stderr, raw manifest/provenance/license/attestation body, stack trace, signing, cosign, or SLSA claim.',
    'Explicit preview failures must not hide behind the TypeScript `tmuxSnapshotParse` parser fallback.',
    'Default/unset, `disabled`, `typescript`, `go`, and `auto` behavior remains unchanged and must not consume the installed layout.',
  ]) assert.ok(doc.includes(expected), `${DOC} should include ${expected}`)
}

function assertNoRepoArtifacts(root) {
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain pack tarballs')
}

module.exports = {
  name: 'Go kernel v0.6.33 installed-layout fail-closed negatives',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertNoRepoArtifacts(root)

    let testRoot
    try {
      testRoot = mkTempRoot()
      const manifestRel = `native/${MODULE}/${HELPER_VERSION}/linux-x64-glibc/manifest.json`
      const cases = [
        {
          name: 'missing helper',
          failureKind: 'artifact-verification-failed',
          hint: 'helper',
          mutateArtifactBeforeVerify({ artifactRoot }) {
            const manifest = readJson(manifestPath(artifactRoot))
            fs.rmSync(artifactPath(artifactRoot, manifest.files.helper), { force: true })
          },
        },
        {
          name: 'missing copied layout',
          failureKind: 'installed-preview-smoke-failed',
          hint: 'tmuxSnapshotParse',
          mutateInstalledLayoutBeforeSmoke({ installedRoot, layout }) {
            fs.rmSync(path.join(installedRoot, ...layout.layoutRelDir.split('/')), { recursive: true, force: true })
          },
        },
        {
          name: 'unsafe traversal manifest path',
          failureKind: 'artifact-verification-failed',
          hint: 'helper',
          mutateArtifactBeforeVerify({ artifactRoot }) {
            rewriteManifest(artifactRoot, manifest => { manifest.files.helper = '../escape/helper'; manifest.artifact.path = '../escape/helper'; manifest.__secret = LEAK_SENTINELS[2] })
          },
        },
        {
          name: 'unsafe backslash manifest path',
          failureKind: 'artifact-verification-failed',
          hint: 'helper',
          mutateArtifactBeforeVerify({ artifactRoot }) {
            rewriteManifest(artifactRoot, manifest => { manifest.files.helper = 'native\\escape\\helper'; manifest.artifact.path = 'native\\escape\\helper'; manifest.__secret = LEAK_SENTINELS[2] })
          },
        },
        {
          name: 'wrong platform target mismatch',
          failureKind: 'artifact-verification-failed',
          hint: 'platform',
          mutateArtifactBeforeVerify({ artifactRoot }) {
            rewriteManifest(artifactRoot, manifest => { manifest.platform.libc = 'musl'; manifest.target = 'linux-x64-musl'; manifest.__secret = LEAK_SENTINELS[2] })
          },
        },
        {
          name: 'checksum mismatch corrupt helper',
          failureKind: 'artifact-verification-failed',
          hint: 'helper',
          mutateArtifactBeforeVerify({ artifactRoot }) {
            const manifest = readJson(manifestPath(artifactRoot))
            fs.appendFileSync(artifactPath(artifactRoot, manifest.files.helper), LEAK_SENTINELS[0])
          },
        },
        {
          name: 'missing provenance',
          failureKind: 'artifact-verification-failed',
          hint: 'provenance',
          mutateArtifactBeforeVerify({ artifactRoot }) {
            const manifest = readJson(manifestPath(artifactRoot))
            fs.rmSync(artifactPath(artifactRoot, manifest.files.provenance), { force: true })
          },
        },
        {
          name: 'missing license metadata',
          failureKind: 'artifact-verification-failed',
          hint: 'license-metadata',
          mutateArtifactBeforeVerify({ artifactRoot }) {
            const manifest = readJson(manifestPath(artifactRoot))
            fs.rmSync(artifactPath(artifactRoot, manifest.files.licenseMetadata), { force: true })
          },
        },
        {
          name: 'invalid placeholder attestation',
          failureKind: 'artifact-verification-failed',
          hint: 'attestation-placeholder',
          mutateArtifactBeforeVerify({ artifactRoot }) {
            const manifest = readJson(manifestPath(artifactRoot))
            const attestationPath = artifactPath(artifactRoot, manifest.files.attestation)
            const attestation = JSON.parse(fs.readFileSync(attestationPath, 'utf8').trim())
            attestation.predicate.placeholderOnly = false
            attestation.predicate.signed = true
            attestation.predicate.signing = LEAK_SENTINELS[5]
            fs.writeFileSync(attestationPath, `${JSON.stringify(attestation)}\n`, 'utf8')
            manifest.attestation.sha256 = sha256(attestationPath)
            writeJson(manifestPath(artifactRoot), manifest)
            refreshChecksumAndIndex(artifactRoot, manifest.files.attestation, 'attestation')
            refreshChecksumAndIndex(artifactRoot, manifest.files.manifest, 'manifest')
          },
        },
        {
          name: 'package version skew',
          failureKind: 'artifact-verification-failed',
          hint: 'package',
          mutateArtifactBeforeVerify({ artifactRoot }) {
            rewriteIndex(artifactRoot, index => { index.packageVersion = '0.0.0'; index.__secret = LEAK_SENTINELS[2] })
          },
        },
        {
          name: 'helper version skew',
          failureKind: 'artifact-verification-failed',
          hint: 'version',
          mutateArtifactBeforeVerify({ artifactRoot }) {
            rewriteManifest(artifactRoot, manifest => { manifest.helperVersion = '0.0.0-skew'; manifest.__secret = LEAK_SENTINELS[2] })
          },
        },
        {
          name: 'protocol version skew',
          failureKind: 'artifact-verification-failed',
          hint: 'version',
          mutateArtifactBeforeVerify({ artifactRoot }) {
            rewriteManifest(artifactRoot, manifest => { manifest.protocolVersion = 999; manifest.__secret = LEAK_SENTINELS[2] })
          },
        },
        {
          name: 'capability skew',
          failureKind: 'artifact-verification-failed',
          hint: 'capability',
          mutateArtifactBeforeVerify({ artifactRoot }) {
            rewriteManifest(artifactRoot, manifest => { manifest.capabilities = ['health']; manifest.__secret = LEAK_SENTINELS[2] })
          },
        },
        {
          name: 'non-executable POSIX helper',
          failureKind: 'installed-preview-smoke-failed',
          hint: 'tmuxSnapshotParse',
          mutateInstalledLayoutBeforeSmoke({ installedRoot }) {
            const manifest = readJson(manifestPath(installedRoot))
            const helperPath = artifactPath(installedRoot, manifest.files.helper)
            if (process.platform !== 'win32') fs.chmodSync(helperPath, 0o644)
          },
        },
        {
          name: 'corrupt helper smoke output',
          failureKind: 'installed-preview-smoke-failed',
          hint: 'tmuxSnapshotParse',
          mutateInstalledLayoutBeforeSmoke({ installedRoot }) {
            setInstalledHelper(installedRoot, corruptSmokeHelperSource())
          },
        },
      ]

      for (const testCase of cases) runFailureCase(root, testRoot, testCase, {
        mutateArtifactBeforeVerify: testCase.mutateArtifactBeforeVerify,
        mutateInstalledLayoutBeforeSmoke: testCase.mutateInstalledLayoutBeforeSmoke,
      })

      const defaultAttempt = compactFailure('installed-preview-smoke-failed', 'keep installed layout ignored outside explicit go-packaged-preview', 'non-preview:default')
      assert.equal(defaultAttempt.resultMarker, 'fail-closed')
      assertNoLeaks(defaultAttempt, [root, testRoot])
      assert.ok(read(root, 'core/kernel.ts').includes("const packagedPreviewRequested = requestedMode === 'go-packaged-preview'"), 'default resolver must remain explicit-only')
      assert.ok(read(root, 'core/kernel.ts').includes('if (cutoverRequested) return fallback(compactInput)'), 'fingerprint must remain TS fallback for cutover modes')
      assert.ok(manifestRel.includes('manifest.json'), 'bounded manifest rel path should remain explicit')
    } finally {
      if (testRoot) fs.rmSync(testRoot, { recursive: true, force: true })
    }

    assertNoRepoArtifacts(root)
  },
}
