const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md'
const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.4.27-bundle-fixture'
const PROTOCOL_VERSION = '1'
const TARGET = {
  target: 'linux-x64-glibc',
  os: 'linux',
  arch: 'x64',
  libc: 'glibc',
  helperFile: 'agentteam-tmuxSnapshotParse',
}
const FAILURE_KINDS = new Set([
  'bundle_invalid',
  'manifest_invalid',
  'integrity_mismatch',
  'artifact_not_executable',
  'unsupported_platform',
  'unsupported_attestation',
])
const REQUIRED_DOC_ITEMS = [
  'Slice 2 — Artifact Bundle Contract from v0.4.26 Outputs',
  'Slice 2 is docs/tests plus OS temp fixture coverage only',
  'Focused suite: `tests/suites/go-kernel-v0427-artifact-bundle-contract.cjs`',
  'helper executable',
  '`manifest.json`',
  '`SHA256SUMS`',
  '`provenance.json`',
  'license metadata/copy/checksum',
  'attestation/signing placeholder',
  '`module` = `tmuxSnapshotParse`',
  '`helperVersion` identifies the generated helper artifact version',
  '`protocolVersion` = `1`',
  '`packageVersion` = `0.6.8`',
  '`os` and `arch` are required',
  'linux bundles must include `libc`',
  'accepted bundle metadata contains package-relative paths only',
  'no absolute paths',
  'no `..` traversal',
  'no repo/cwd/temp absolute path leakage in accepted metadata',
  'compatible with v0.4.26 generator metadata fields',
  'compatible with v0.4.25 manifest validation concepts',
  'future input contract only, not a release artifact, not normal-user availability proof, not package/default/fallback approval',
  'Repository scans must confirm no checked-in generated bundle, artifact, manifest, tarball, native binary, release metadata, or package artifact exists outside allowed test source',
  'Slice 3 — Future Package / Install Layout Decision Matrix',
  'Focused suite: `tests/suites/go-kernel-v0427-install-layout-matrix-docs.cjs`',
  'Slice 4 — Clean-Install Consumption Simulation',
  'Focused suite: `tests/suites/go-kernel-v0427-clean-install-consumption.cjs`',
  'Slice 5 — Resolver Discovery Contract Without Behavior Change',
  'Focused suite: `tests/suites/go-kernel-v0427-resolver-discovery-contract.cjs`',
  'Slice 6 — Failure Rollback No-Leak Hardening',
  'Focused suite: `tests/suites/go-kernel-v0427-consumption-failure-rollback-no-leak.cjs`',
  'Slice 7 — Package Native Guardrails and Readiness Containment',
  'Focused suite: `tests/suites/go-kernel-v0427-package-native-guardrails.cjs`',
  'Slice 8 — Final Checkpoint',
  'Final checkpoint doc: `docs/perf/v0.4.27-generated-artifact-clean-install-consumption-checkpoint.md`',
  'Focused suite: `tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs`',
]
const STOP_ITEMS = [
  'STOP for real generated pipeline artifacts',
  'STOP for checked-in generated bundles',
  'STOP for helper build commands',
  'STOP for running `go build`',
  'STOP for CI workflow implementation',
  'STOP for upload or artifact storage',
  'STOP for active GitHub Actions artifact storage',
  'STOP for GitHub release assets',
  'STOP for package metadata changes',
  'STOP for optionalDependencies',
  'STOP for package scripts',
  'STOP for lifecycle hooks/downloads',
  'STOP for postinstall/download/install-time build',
  'STOP for npm pack/version/publish',
  'STOP for go.mod/go.sum or lockfiles',
  'STOP for native binaries or tarballs',
  'STOP for production runtime resolver changes',
  'STOP for default modes or default resolver activation',
  'STOP for current `go-cutover` behavior changes',
  'STOP for `go-packaged-preview` availability semantics changes',
  'STOP for TypeScript fallback deletion',
  'STOP for broadening Go authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
  'STOP for `/team readiness` changes',
]
const FORBIDDEN_DOC = [
  'bundle is a release artifact',
  'bundle is release-ready',
  'normal-user availability is proven',
  'normal-user native availability is proven',
  'package/default/fallback approval is granted',
  'native/default cutover is approved',
  'fallback deletion is approved',
  'native packaging is approved',
  'npm publish is approved',
  'npm version is approved',
  'Go is default',
  'native Go pi extension is assumed',
  'broader Go authority is approved',
]

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempRoot() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0427-bundle-'))
  assert.equal(path.dirname(tempRoot), os.tmpdir(), 'bundle root must be under OS tmpdir')
  return tempRoot
}

function compactFailure(failureKind, remediation, hint) {
  assert.ok(FAILURE_KINDS.has(failureKind), `unexpected failureKind ${failureKind}`)
  return {
    status: 'unavailable',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'fail-closed',
    failureKind,
    remediation,
    hint,
    releaseDecision: 'stop-clean-install-consumption-package-default-fallback-approval',
  }
}

function compactAvailable() {
  return {
    status: 'available',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'bundle-temp-fixture-only',
    releaseDecision: 'input-contract-only-not-release-artifact-not-normal-user-availability',
  }
}

function bundleRelPath(filename) {
  assert.equal(path.isAbsolute(filename), false, 'bundle filename must be relative')
  assert.equal(filename.includes('..'), false, 'bundle filename must not traverse')
  assert.equal(/[\\/]/.test(filename), false, 'bundle filename must be simple')
  return `artifact-bundles/${PACKAGE_NAME}/${PACKAGE_VERSION}/${MODULE}/${HELPER_VERSION}/${PROTOCOL_VERSION}/${TARGET.target}/${filename}`
}

function writeBundle(root, options = {}) {
  const helperRel = bundleRelPath(TARGET.helperFile)
  const manifestRel = bundleRelPath('manifest.json')
  const checksumRel = bundleRelPath('SHA256SUMS')
  const provenanceRel = bundleRelPath('provenance.json')
  const licenseRel = bundleRelPath('LICENSE')
  const licenseMetadataRel = bundleRelPath('license.json')
  const attestationRel = bundleRelPath('attestation.intoto.jsonl')

  const helperPath = path.join(root, helperRel)
  fs.mkdirSync(path.dirname(helperPath), { recursive: true })
  fs.writeFileSync(helperPath, 'fake parser helper bundle input only\n')
  fs.chmodSync(helperPath, options.executable === false ? 0o644 : 0o755)

  const provenance = {
    sourceRevision: 'source-revision-placeholder',
    workflowRun: 'workflow-run-placeholder',
    toolchain: 'toolchain-identity-placeholder',
    generatedAt: '2026-06-12T00:00:00.000Z',
  }
  const provenancePath = path.join(root, provenanceRel)
  fs.writeFileSync(provenancePath, JSON.stringify(provenance, null, 2))

  const licensePath = path.join(root, licenseRel)
  fs.writeFileSync(licensePath, 'fixture license copy only\n')
  const licenseMetadata = {
    name: 'MIT',
    path: licenseRel,
    sha256: sha256(licensePath),
  }
  const licenseMetadataPath = path.join(root, licenseMetadataRel)
  fs.writeFileSync(licenseMetadataPath, JSON.stringify(licenseMetadata, null, 2))

  const attestation = {
    path: attestationRel,
    kind: 'placeholder-only',
    signed: false,
    signing: 'not-real-signing',
  }
  const attestationPath = path.join(root, attestationRel)
  fs.writeFileSync(attestationPath, JSON.stringify(attestation))

  const stat = fs.statSync(helperPath)
  const manifest = {
    schemaVersion: 1,
    packageName: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    module: MODULE,
    helperVersion: HELPER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    capabilities: [MODULE],
    os: TARGET.os,
    arch: TARGET.arch,
    libc: TARGET.libc,
    target: TARGET.target,
    path: helperRel,
    filename: TARGET.helperFile,
    size: stat.size,
    sha256: sha256(helperPath),
    executable: true,
    mode: '0755',
    bundle: {
      helperPath: helperRel,
      manifestPath: manifestRel,
      checksumPath: checksumRel,
      provenancePath: provenanceRel,
      licensePath: licenseRel,
      licenseMetadataPath: licenseMetadataRel,
      attestationPath: attestationRel,
    },
    provenance,
    license: licenseMetadata,
    attestation,
    compatibility: {
      v0426GeneratorShape: true,
      v0425ManifestValidationConcepts: true,
      inputContractOnly: true,
      releaseArtifact: false,
      normalUserAvailabilityProof: false,
      packageDefaultFallbackApproval: false,
    },
  }
  if (options.absolutePath) manifest.path = helperPath
  if (options.traversal) manifest.path = '../escape/agentteam-tmuxSnapshotParse'
  if (options.backslashPath) manifest.path = helperRel.replace(/\//g, '\\')
  if (options.wrongModule) manifest.module = 'compactReadModelFingerprint'
  if (options.wrongPackageVersion) manifest.packageVersion = '0.0.0'
  if (options.wrongHelperVersion) manifest.helperVersion = 'unexpected-helper'
  if (options.wrongProtocol) manifest.protocolVersion = '2'
  if (options.missingCapability) manifest.capabilities = []
  if (options.missingLibc) delete manifest.libc
  if (options.checksumMismatch) manifest.sha256 = '0'.repeat(64)
  if (options.sizeMismatch) manifest.size += 1
  if (options.missingProvenance) delete manifest.provenance
  if (options.missingLicense) delete manifest.license
  if (options.realSigningClaim) manifest.attestation = { path: attestationRel, kind: 'signed-provenance', signed: true, signing: 'real-signing-claim' }
  if (options.missingBundleFile) fs.rmSync(provenancePath, { force: true })

  const manifestPath = path.join(root, manifestRel)
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  const checksumPath = path.join(root, checksumRel)
  fs.writeFileSync(checksumPath, `${manifest.sha256}  ${TARGET.helperFile}\n`)

  return {
    root,
    helperPath,
    manifestPath,
    checksumPath,
    provenancePath,
    licensePath,
    licenseMetadataPath,
    attestationPath,
    manifest,
  }
}

function isSafePackageRelativePath(value) {
  return typeof value === 'string'
    && value.startsWith(`artifact-bundles/${PACKAGE_NAME}/${PACKAGE_VERSION}/${MODULE}/`)
    && !path.isAbsolute(value)
    && !value.includes('..')
    && !/[\\]/.test(value)
}

function resolveUnderRoot(root, relPath) {
  if (!isSafePackageRelativePath(relPath)) return null
  const resolved = path.resolve(root, relPath)
  const resolvedRoot = path.resolve(root)
  return resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : null
}

function validateBundle(fixture) {
  try {
    const manifest = fixture.manifest
    if (!manifest || manifest.schemaVersion !== 1) return compactFailure('manifest_invalid', 'regenerate bundle manifest schema', 'schema')
    if (manifest.packageName !== PACKAGE_NAME || manifest.packageVersion !== PACKAGE_VERSION) return compactFailure('manifest_invalid', 'regenerate package version metadata', 'package')
    if (manifest.module !== MODULE) return compactFailure('manifest_invalid', 'regenerate parser module metadata', 'module')
    if (manifest.helperVersion !== HELPER_VERSION) return compactFailure('manifest_invalid', 'regenerate helper version metadata', 'helper-version')
    if (manifest.protocolVersion !== PROTOCOL_VERSION) return compactFailure('manifest_invalid', 'regenerate protocol metadata', 'protocol')
    if (!Array.isArray(manifest.capabilities) || !manifest.capabilities.includes(MODULE)) return compactFailure('manifest_invalid', 'regenerate capability metadata', 'capability')
    if (manifest.os !== TARGET.os || manifest.arch !== TARGET.arch || manifest.libc !== TARGET.libc) return compactFailure('unsupported_platform', 'regenerate target platform metadata', 'platform')
    if (!isSafePackageRelativePath(manifest.path)) return compactFailure('manifest_invalid', 'regenerate safe package-relative helper path', 'path')
    if (!manifest.bundle || typeof manifest.bundle !== 'object') return compactFailure('bundle_invalid', 'regenerate bundle file list', 'bundle')

    for (const key of ['helperPath', 'manifestPath', 'checksumPath', 'provenancePath', 'licensePath', 'licenseMetadataPath', 'attestationPath']) {
      const relPath = manifest.bundle[key]
      const resolved = resolveUnderRoot(fixture.root, relPath)
      if (!resolved || !fs.existsSync(resolved)) return compactFailure('bundle_invalid', 'regenerate complete temp bundle', key)
      if (JSON.stringify(manifest).includes(path.resolve(fixture.root))) return compactFailure('manifest_invalid', 'remove absolute path from metadata', 'path-leak')
      if (JSON.stringify(manifest).includes(process.cwd())) return compactFailure('manifest_invalid', 'remove repo path from metadata', 'repo-leak')
    }

    const helperPath = resolveUnderRoot(fixture.root, manifest.path)
    if (!helperPath || !fs.existsSync(helperPath)) return compactFailure('bundle_invalid', 'regenerate helper bundle file', 'helper')
    const stat = fs.statSync(helperPath)
    if (stat.size !== manifest.size) return compactFailure('integrity_mismatch', 'regenerate helper size metadata', 'size')
    if (sha256(helperPath) !== manifest.sha256) return compactFailure('integrity_mismatch', 'regenerate helper checksum metadata', 'checksum')
    if (manifest.executable !== true || (stat.mode & 0o111) === 0) return compactFailure('artifact_not_executable', 'regenerate executable helper artifact', 'executable')

    const checksumFile = fs.readFileSync(resolveUnderRoot(fixture.root, manifest.bundle.checksumPath), 'utf8')
    if (!checksumFile.includes(manifest.sha256) || !checksumFile.includes(manifest.filename)) return compactFailure('integrity_mismatch', 'regenerate checksum file', 'checksum-file')
    if (!manifest.provenance || !manifest.provenance.sourceRevision || !manifest.provenance.workflowRun || !manifest.provenance.toolchain || !manifest.provenance.generatedAt) return compactFailure('manifest_invalid', 'regenerate provenance placeholder metadata', 'provenance')
    if (!manifest.license || !manifest.license.name || !isSafePackageRelativePath(manifest.license.path) || !manifest.license.sha256) return compactFailure('manifest_invalid', 'regenerate license metadata', 'license')
    const licensePath = resolveUnderRoot(fixture.root, manifest.license.path)
    if (!licensePath || sha256(licensePath) !== manifest.license.sha256) return compactFailure('integrity_mismatch', 'regenerate license checksum metadata', 'license-checksum')
    if (!manifest.attestation || manifest.attestation.kind !== 'placeholder-only' || manifest.attestation.signed !== false || manifest.attestation.signing !== 'not-real-signing') return compactFailure('unsupported_attestation', 'do not claim real signing without proof', 'attestation')
    if (!manifest.compatibility?.v0426GeneratorShape || !manifest.compatibility?.v0425ManifestValidationConcepts || !manifest.compatibility?.inputContractOnly) return compactFailure('bundle_invalid', 'regenerate compatibility metadata', 'compatibility')
    if (manifest.compatibility.releaseArtifact !== false || manifest.compatibility.normalUserAvailabilityProof !== false || manifest.compatibility.packageDefaultFallbackApproval !== false) return compactFailure('bundle_invalid', 'keep bundle as input contract only', 'non-approval')
    return compactAvailable()
  } catch (_) {
    return compactFailure('bundle_invalid', 'regenerate bundle and keep consumption proof blocked', 'exception')
  }
}

function assertNoAcceptedMetadataLeaks(fixture) {
  const text = JSON.stringify(fixture.manifest)
  assert.equal(text.includes(path.resolve(fixture.root)), false, 'accepted metadata must not contain temp absolute path')
  assert.equal(text.includes(process.cwd()), false, 'accepted metadata must not contain repo/cwd absolute path')
  assert.equal(/stdout|stderr/i.test(text), false, 'accepted metadata must not contain stdout/stderr')
  assert.equal(/Error:|AssertionError|stack/i.test(text), false, 'accepted metadata must not contain stack trace text')
}

function assertNoLeaks(result, root) {
  const text = JSON.stringify(result)
  assert.equal(text.includes(path.resolve(root)), false, 'failure must not leak temp root')
  assert.equal(text.includes(process.cwd()), false, 'failure must not leak repo/cwd')
  assert.equal(/stdout|stderr/i.test(text), false, 'failure must not mention stdout/stderr')
  assert.equal(/Error:|AssertionError|at validateBundle|stack/i.test(text), false, 'failure must not leak stack traces')
  assert.equal(/source-revision-placeholder|workflow-run-placeholder|toolchain-identity-placeholder/i.test(text), false, 'failure must not leak raw provenance body')
  assert.equal(/fixture license copy only|license.json|attestation\.intoto|artifact-bundles/i.test(text), false, 'failure must not leak raw bundle/package internals')
  assert.equal(result.status, 'unavailable', 'negative case should be unavailable')
  assert.equal(result.resultMarker, 'fail-closed', 'negative case should fail closed')
  assert.ok(FAILURE_KINDS.has(result.failureKind), 'failureKind should be compact')
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function assertRepoArtifactSanity(root) {
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|clean-install-consumption-manifest|artifact-bundle-manifest|generated-bundle-manifest|bundle-manifest|provenance|attestation\.intoto)\.(?:json|jsonc|yaml|yml|jsonl)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated bundle/manifest/package artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package files must not include native/helper/generated bundle outputs')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    assert.equal(/go\s+(?:build|install)\b/.test(command), false, `${name} must not build/install helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not download/build native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
}

function assertNoWorkflowReleaseOrBuild(root) {
  const workflows = path.join(root, '.github', 'workflows')
  if (!fs.existsSync(workflows)) return
  for (const name of fs.readdirSync(workflows).filter(value => /\.(?:ya?ml)$/i.test(value))) {
    const source = fs.readFileSync(path.join(workflows, name), 'utf8')
    assert.equal(/actions\/upload-artifact|gh\s+release|npm\s+publish|go\s+build/i.test(source), false, `${name} must not add artifact/release/build workflow behavior in Slice 2`)
  }
}

module.exports = {
  name: 'Go kernel v0.4.27 artifact bundle contract',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = fs.readFileSync(path.join(root, DOC), 'utf8')
    const lower = doc.toLowerCase()

    for (const expected of REQUIRED_DOC_ITEMS) {
      assert.ok(lower.includes(expected.toLowerCase()), `doc should include ${expected}`)
    }
    for (const expected of STOP_ITEMS) assert.ok(doc.includes(expected), `doc should include ${expected}`)
    for (const forbidden of FORBIDDEN_DOC) assert.equal(doc.includes(forbidden), false, `doc must not imply forbidden policy: ${forbidden}`)
    assert.equal(/^## v0\.4\.28\b/im.test(doc), false, 'Slice 2 guard must not allow v0.4.28 implementation')

    let tempRoot
    try {
      tempRoot = mkTempRoot()
      const fixture = writeBundle(tempRoot)
      for (const file of [fixture.helperPath, fixture.manifestPath, fixture.checksumPath, fixture.provenancePath, fixture.licensePath, fixture.licenseMetadataPath, fixture.attestationPath]) {
        assert.ok(file.startsWith(`${tempRoot}${path.sep}`), 'bundle fixture files must stay under OS temp root')
        assert.equal(file.startsWith(root), false, 'bundle fixture files must not be under repo root')
      }
      assertNoAcceptedMetadataLeaks(fixture)
      const result = validateBundle(fixture)
      assert.equal(result.status, 'available', 'valid temp bundle should pass')
      assert.equal(result.releaseDecision, 'input-contract-only-not-release-artifact-not-normal-user-availability')
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    const cases = [
      'absolutePath',
      'traversal',
      'backslashPath',
      'wrongModule',
      'wrongPackageVersion',
      'wrongHelperVersion',
      'wrongProtocol',
      'missingCapability',
      'missingLibc',
      'checksumMismatch',
      'sizeMismatch',
      'missingProvenance',
      'missingLicense',
      'realSigningClaim',
      'missingBundleFile',
      'notExecutable',
    ]
    for (const name of cases) {
      let caseRoot
      try {
        caseRoot = mkTempRoot()
        const options = name === 'notExecutable' ? { executable: false } : { [name]: true }
        const fixture = writeBundle(caseRoot, options)
        const result = validateBundle(fixture)
        assertNoLeaks(result, caseRoot)
      } finally {
        if (caseRoot) fs.rmSync(caseRoot, { recursive: true, force: true })
      }
    }

    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
    assertNoWorkflowReleaseOrBuild(root)
  },
}
