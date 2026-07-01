const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  assertIncludes,
  existsRel,
  readRel,
} = require('./fsAssertions.cjs')

const KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER = 'tests/helpers/kernelResolverSourceBoundaryGuards.cjs'
const KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE = 'tests/suites/go-kernel-resolver-source-boundary-guard.cjs'

const MODULE = 'tmuxSnapshotParse'
const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITIES = Object.freeze(['health', 'profile', MODULE, 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])

const KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES = Object.freeze([
  'kernel-source-mode-boundaries',
  'explicit-helper-path-precedence',
  'packaged-preview-explicit-non-default',
  'packaged-resolver-contract-and-fail-closed',
  'cutover-no-hidden-typescript-fallback',
  'default-embedded-resolver-gated',
  'production-non-parser-boundaries',
  'kernel-resolver-behavior-suite-evidence',
])

const KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORY_DESCRIPTIONS = Object.freeze({
  'kernel-source-mode-boundaries': 'core/kernel.ts keeps the current mode normalization, helper-path/default/preview resolver gates, and compactReadModelFingerprint non-cutover boundary.',
  'explicit-helper-path-precedence': 'An explicit helper path remains highest precedence over packaged preview/default resolver inputs and is compactly redacted in metadata.',
  'packaged-preview-explicit-non-default': 'go-packaged-preview remains an explicit, non-default preview path; without explicit package-root/manifest evidence it fails closed and never claims normal-user availability.',
  'packaged-resolver-contract-and-fail-closed': 'core/kernelPackagedResolver.ts resolves only package-relative verified helper layouts and maps missing/unsafe/skewed metadata to compact fail-closed diagnostics without path/stdout/stderr leaks.',
  'cutover-no-hidden-typescript-fallback': 'default/go/go-cutover/go-packaged-preview parser-unavailable paths do not call a hidden TypeScript parser fallback after cutover/default Go selection.',
  'default-embedded-resolver-gated': 'Default Go uses only the approved embedded helper manifest/root path and ignores unapproved packaged-preview root/manifest environment hints.',
  'production-non-parser-boundaries': 'Production resolver behavior remains parser-only: no package release, lifecycle, download, default-native availability, panel/readiness expansion, task/report, or state-control authority is introduced.',
  'kernel-resolver-behavior-suite-evidence': 'Current behavior/evidence suites for preview resolver, package metadata, availability gates, artifact pipeline, and clean-install resolver contracts remain present outside historical checkpoint docs suites.',
})

const KERNEL_RESOLVER_SOURCE_FILES = Object.freeze([
  'core/kernel.ts',
  'core/kernelPackagedResolver.ts',
  'core/kernelDiagnostics.ts',
  'core/kernelContract.ts',
  'commands/readiness.ts',
  'commands/team.ts',
  'tests/bench/kernelMetadata.cjs',
  'tests/bench/team-read-model-baseline.cjs',
])

const KERNEL_RESOLVER_SUPPORTING_SUITES = Object.freeze([
  'tests/suites/go-kernel-v0421-artifact-prototype.cjs',
  'tests/suites/go-kernel-v0421-packaged-preview-resolver.cjs',
  'tests/suites/go-kernel-v0422-manifest-compatibility-guard.cjs',
  'tests/suites/go-kernel-v0422-native-package-dry-run.cjs',
  'tests/suites/go-kernel-v0422-native-package-metadata-fixtures.cjs',
  'tests/suites/go-kernel-v0422-package-native-guardrails.cjs',
  'tests/suites/go-kernel-v0422-packaged-preview-invariants.cjs',
  'tests/suites/go-kernel-v0425-artifact-manifest-prototype.cjs',
  'tests/suites/go-kernel-v0425-clean-install-smoke.cjs',
  'tests/suites/go-kernel-v0425-resolver-default-cutover-gate.cjs',
  'tests/suites/go-kernel-v0425-unsupported-rollback-policy.cjs',
  'tests/suites/go-kernel-v0426-artifact-output-policy.cjs',
  'tests/suites/go-kernel-v0426-artifact-smoke-handoff.cjs',
  'tests/suites/go-kernel-v0426-manifest-provenance-generator.cjs',
  'tests/suites/go-kernel-v0427-artifact-bundle-contract.cjs',
  'tests/suites/go-kernel-v0427-clean-install-consumption.cjs',
  'tests/suites/go-kernel-v0427-consumption-failure-rollback-no-leak.cjs',
  'tests/suites/go-kernel-v0427-package-native-guardrails.cjs',
  'tests/suites/go-kernel-v0427-resolver-discovery-contract.cjs',
  'tests/suites/go-kernel-v0633-installed-layout-consumption.cjs',
  'tests/suites/go-kernel-v0634-install-layout-contract.cjs',
])

const KERNEL_RESOLVER_SUPPORTING_FIXTURES = Object.freeze([
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json',
])

const SAFE_PACKAGED_FAILURE_KEYS = Object.freeze(['status', 'module', 'capability', 'resultMarker', 'failureKind', 'cutoverFailureKind', 'reason', 'remediation', 'hint'].sort())
const FORBIDDEN_LEAK_TOKENS = Object.freeze([
  'KERNEL_RESOLVER_HELPER_PATH_SHOULD_NOT_LEAK',
  'KERNEL_RESOLVER_STDOUT_SHOULD_NOT_LEAK',
  'KERNEL_RESOLVER_STDERR_SHOULD_NOT_LEAK',
  'KERNEL_RESOLVER_RAW_MANIFEST_SHOULD_NOT_LEAK',
  'KERNEL_RESOLVER_RAW_PROVENANCE_SHOULD_NOT_LEAK',
  'KERNEL_RESOLVER_RAW_LICENSE_SHOULD_NOT_LEAK',
  'KERNEL_RESOLVER_RAW_ATTESTATION_SHOULD_NOT_LEAK',
  'KERNEL_RESOLVER_MAILBOX_REPORT_TEXT_SHOULD_NOT_LEAK',
  'helperPath=',
  'stdout=',
  'stderr=',
  'raw manifest',
  'raw provenance',
  'raw license',
  'raw attestation',
  'mailbox/report',
  'TaskReport body',
  'stack trace',
  'Error:',
])

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function assertEveryFileExists(root, files, label) {
  for (const rel of files) assert.equal(existsRel(root, rel), true, `${rel} should exist for ${label}`)
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function writeJsonLine(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8')
}

function fakeHelperSource() {
  const health = {
    ok: true,
    implementation: 'go',
    protocolVersion: PROTOCOL_VERSION,
    adapterVersion: HELPER_VERSION,
    helperVersion: HELPER_VERSION,
    capabilities: [...CAPABILITIES],
    businessPathsConnected: false,
  }
  return `#!/usr/bin/env node
const inputChunks = []
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => inputChunks.push(chunk))
process.stdin.on('end', () => {
  const raw = inputChunks.join('').trim()
  const request = raw ? JSON.parse(raw.split('\\n')[0]) : {}
  const health = ${JSON.stringify(health)}
  function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
  if (request.method === 'health') respond(health)
  else if (request.method === 'profile') respond({ ...health, profile: { scope: 'skeleton-only', params: request.params || {}, stateConnected: false, tmuxConnected: false, tmuxSnapshotParseConnected: true, tmuxSnapshotCaptureConnected: true, compactReadModelFingerprintConnected: true, workerLifecycleInspectPaneConnected: true, workerLifecycleListAgentTeamPanesConnected: true, panelConnected: false, taskReportPlanRunConnected: false } })
  else if (request.method === 'tmuxSnapshotParse') respond({ capturedAt: Number((request.params || {}).capturedAt || 0), panes: [{ paneId: '%resolver', target: 'resolver:@1', label: 'resolver-helper', currentCommand: 'pi' }], byPaneId: { '%resolver': { paneId: '%resolver', target: 'resolver:@1', label: 'resolver-helper', currentCommand: 'pi' } }, ok: true })
  else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params && request.params.input, fingerprint: 'helper-fingerprint-should-not-be-used-for-cutover', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })
  else respond({ ok: true })
})
`
}

function writeExecutableHelper(root, relPath = 'agentteam-kernel-resolver-helper.cjs') {
  const helperPath = path.join(root, relPath)
  fs.mkdirSync(path.dirname(helperPath), { recursive: true })
  fs.writeFileSync(helperPath, fakeHelperSource(), 'utf8')
  fs.chmodSync(helperPath, 0o755)
  return helperPath
}

function writePackagedLayout(root, options = {}) {
  const installedRoot = path.join(root, 'installed-package')
  const layoutRel = `native/${MODULE}/${HELPER_VERSION}/linux-x64-glibc`
  const helperRel = `${layoutRel}/agentteam-kernel-resolver-helper.cjs`
  const manifestRel = `${layoutRel}/manifest.json`
  const checksumsRel = `${layoutRel}/SHA256SUMS`
  const provenanceRel = `${layoutRel}/provenance.json`
  const licenseRel = `${layoutRel}/LICENSE`
  const licenseMetadataRel = `${layoutRel}/license.json`
  const attestationRel = `${layoutRel}/attestation.intoto.jsonl`

  const helperPath = writeExecutableHelper(installedRoot, helperRel)
  const licensePath = path.join(installedRoot, licenseRel)
  fs.mkdirSync(path.dirname(licensePath), { recursive: true })
  fs.writeFileSync(licensePath, 'MIT fixture license for resolver guard\n', 'utf8')

  const licenseMetadata = {
    schemaVersion: 1,
    name: 'MIT',
    packageName: PACKAGE_NAME,
    module: MODULE,
    path: licenseRel,
    sha256: sha256(licensePath),
  }
  writeJson(path.join(installedRoot, licenseMetadataRel), licenseMetadata)

  const sourceRevision = '1111111111111111111111111111111111111111'
  const provenance = {
    schemaVersion: 1,
    packageName: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    module: MODULE,
    source: { path: 'kernel/go/agentteam-kernel', revision: sourceRevision },
    build: {
      command: ['go', 'build', '-trimpath', '-o', helperRel, '.'],
      env: { GO111MODULE: 'off' },
      toolchain: 'go fixture',
      generatedAt: '2026-06-30T00:00:00.000Z',
      runIdentity: 'kernel-resolver-source-boundary-guard',
    },
    smoke: { health: true, [MODULE]: { ok: true } },
  }
  writeJson(path.join(installedRoot, provenanceRel), provenance)

  const attestation = {
    predicate: { placeholderOnly: true, signed: false, signing: 'not-real-signing' },
    subject: [{ name: helperRel, digest: { sha256: sha256(helperPath) } }],
  }
  writeJsonLine(path.join(installedRoot, attestationRel), attestation)

  const stat = fs.statSync(helperPath)
  const manifest = {
    schemaVersion: 1,
    packageName: options.packageMismatch ? 'wrong-package' : PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    module: options.moduleMismatch ? 'compactReadModelFingerprint' : MODULE,
    helperVersion: options.versionSkew ? 'stale-helper' : HELPER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    capabilities: options.capabilitySkew ? ['health', 'profile', 'compactReadModelFingerprint'] : [...CAPABILITIES],
    businessPathsConnected: false,
    target: 'linux-x64-glibc',
    platform: options.unsupportedPlatform ? { os: 'linux', arch: 'x64', libc: 'unsupported-libc' } : { os: 'linux', arch: 'x64', libc: 'glibc' },
    source: { path: 'kernel/go/agentteam-kernel', revision: sourceRevision },
    files: {
      helper: options.pathUnsafe ? '../escape/helper' : helperRel,
      manifest: manifestRel,
      checksums: checksumsRel,
      provenance: provenanceRel,
      license: licenseRel,
      licenseMetadata: licenseMetadataRel,
      attestation: attestationRel,
    },
    artifact: {
      path: helperRel,
      filename: 'agentteam-kernel-resolver-helper.cjs',
      size: stat.size,
      sha256: sha256(helperPath),
      executable: true,
      mode: '0755',
    },
    license: {
      path: licenseRel,
      metadataPath: licenseMetadataRel,
      name: 'MIT',
      sha256: sha256(licensePath),
      metadataSha256: sha256(path.join(installedRoot, licenseMetadataRel)),
    },
    attestation: {
      path: attestationRel,
      kind: 'placeholder-only',
      signed: false,
      sha256: sha256(path.join(installedRoot, attestationRel)),
    },
  }
  if (options.artifactNotExecutable) {
    fs.chmodSync(helperPath, 0o644)
    manifest.artifact.mode = '0644'
  }
  writeJson(path.join(installedRoot, manifestRel), manifest)

  const checksumLines = [
    [helperRel, options.integrityMismatch ? '0'.repeat(64) : sha256(helperPath)],
    [manifestRel, sha256(path.join(installedRoot, manifestRel))],
    [provenanceRel, sha256(path.join(installedRoot, provenanceRel))],
    [licenseRel, sha256(licensePath)],
    [licenseMetadataRel, sha256(path.join(installedRoot, licenseMetadataRel))],
    [attestationRel, sha256(path.join(installedRoot, attestationRel))],
  ].map(([rel, digest]) => `${digest}  ${rel}`).join('\n') + '\n'
  fs.writeFileSync(path.join(installedRoot, checksumsRel), checksumLines, 'utf8')

  if (options.missingHelper) fs.rmSync(helperPath, { force: true })
  if (options.missingProvenance) fs.rmSync(path.join(installedRoot, provenanceRel), { force: true })
  if (options.missingLicense) fs.rmSync(licensePath, { force: true })
  if (options.invalidAttestation) fs.writeFileSync(path.join(installedRoot, attestationRel), JSON.stringify({ predicate: { placeholderOnly: false, signed: true } }), 'utf8')

  return { installedRoot, manifestRel, helperPath, helperRel }
}

function assertNoFailureLeaks(value, root, label) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const token of FORBIDDEN_LEAK_TOKENS) assert.equal(text.includes(token), false, `${label} must not leak ${token}`)
  if (root) assert.equal(text.includes(path.resolve(root)), false, `${label} must not leak temp/package root`)
  assert.equal(text.includes(process.cwd()), false, `${label} must not leak repo cwd`)
  assert.equal(/\/tmp\/agentteam-kernel-resolver-|[A-Z]:\\/.test(text), false, `${label} must not leak local helper paths`)
}

function assertPackagedFailureShape(result, expectedFailureKind, expectedCutoverFailureKind, label) {
  assert.equal(result.status, 'unavailable', `${label} should be unavailable`)
  assert.deepEqual(Object.keys(result).sort(), SAFE_PACKAGED_FAILURE_KEYS, `${label} should expose only safe compact failure keys`)
  assert.equal(result.module, MODULE, `${label} module`)
  assert.equal(result.capability, MODULE, `${label} capability`)
  assert.equal(result.resultMarker, 'fail-closed', `${label} result marker`)
  assert.equal(result.failureKind, expectedFailureKind, `${label} failure kind`)
  assert.equal(result.cutoverFailureKind, expectedCutoverFailureKind, `${label} cutover failure kind`)
  assert.equal(result.reason, expectedFailureKind, `${label} compact reason`)
  assert.ok(result.remediation.length > 0 && result.remediation.length <= 120, `${label} remediation should be compact`)
  assert.ok(result.hint.length > 0 && result.hint.length <= 80, `${label} hint should be compact`)
}

function assertFailClosedSnapshot(snapshot, expectedKind, label) {
  assert.equal(snapshot.ok, false, `${label} snapshot should fail closed`)
  assert.equal(snapshot.status, 'unknown', `${label} snapshot status`)
  assert.equal(snapshot.resultMarker, 'stale', `${label} snapshot result marker`)
  assert.equal(snapshot.module, MODULE, `${label} snapshot module`)
  assert.equal(snapshot.capability, MODULE, `${label} snapshot capability`)
  assert.equal(snapshot.cutoverFailureKind, expectedKind, `${label} snapshot compact failure kind`)
  assert.deepEqual(snapshot.panes, [], `${label} snapshot panes`)
  assert.deepEqual(snapshot.byPaneId, {}, `${label} snapshot byPaneId`)
  assert.match(snapshot.reason, new RegExp(`Go kernel cutover unavailable \\(${expectedKind}\\)`), `${label} snapshot compact reason`)
  assertNoFailureLeaks(snapshot, null, `${label} snapshot`)
}

function assertKernelSourceModeBoundaries(root) {
  const kernelSource = readRel(root, 'core/kernel.ts')
  const resolverSource = readRel(root, 'core/kernelPackagedResolver.ts')
  const diagnosticsSource = readRel(root, 'core/kernelDiagnostics.ts')
  const contractSource = readRel(root, 'core/kernelContract.ts')

  for (const expected of [
    "if (!raw || raw === 'default') return 'default'",
    "if (raw === 'none' || raw === 'off' || raw === 'disabled') return 'disabled'",
    "if (raw === 'ts' || raw === 'typescript') return 'typescript'",
    'const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)',
    "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'",
    'const defaultCutoverRequested = defaultRequested || requestedMode === \'go\'',
    'const packagedResolverRequested = packagedPreviewRequested || defaultCutoverRequested',
    'const packagedResolverFailure = packagedResolverRequested && !explicitHelperPath',
    'const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure',
    'const packagedManifestPath = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure',
    'const packagedManifestInstallRoot = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure',
    'resolveAgentTeamPackagedHelperManifest({ installedRoot: packagedManifestInstallRoot, manifestPath: packagedManifestPath })',
    'const helperPath = explicitHelperPath || packagedHelperPath || packagedManifestHelperPath',
    "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested",
    'const startupFallback = cutoverRequested ? undefined',
    'if (cutoverRequested || !fallback) return cutoverUnavailableSnapshot(capturedAt)',
    'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)',
    'if (cutoverRequested) return fallback(compactInput)',
  ]) assertIncludes(kernelSource, expected, 'kernel source mode boundary')

  for (const expected of [
    "AGENTTEAM_KERNEL_PACKAGE_NAME = 'pi-agentteam'",
    "AGENTTEAM_KERNEL_PACKAGE_VERSION = '0.6.8'",
    "AGENTTEAM_KERNEL_CURRENT_NATIVE_MODULE = 'tmuxSnapshotParse'",
    'AGENTTEAM_KERNEL_PROTOCOL_VERSION = 1',
    "AGENTTEAM_KERNEL_HELPER_VERSION = '0.3.0-read-model-shadow'",
    'AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED = false',
  ]) assertIncludes(contractSource, expected, 'kernel contract constants')

  for (const expected of [
    'safePackageRelativePath',
    'resolveAgentTeamPackagedHelperManifest',
    "| 'manifest-missing'",
    "| 'path-unsafe'",
    "| 'package-mismatch'",
    "| 'version-skew'",
    "| 'capability-skew'",
    "| 'unsupported-platform'",
    "| 'helper-missing'",
    "| 'integrity-mismatch'",
    "| 'artifact-not-executable'",
    "| 'provenance-missing'",
    "| 'license-missing'",
    "| 'attestation-invalid'",
    "kind: 'placeholder-only'",
    'signed: false',
  ]) assertIncludes(resolverSource, expected, 'kernel packaged resolver source')

  assertIncludes(diagnosticsSource, 'listTmuxSnapshotParseFailureDiagnostics', 'kernel diagnostics evidence')
  assertIncludes(diagnosticsSource, 'formatTmuxSnapshotParseFailureReadiness', 'kernel diagnostics evidence')
}

function assertExplicitHelperPathPrecedence(root, env) {
  const kernel = env.helpers.requireDist('core/kernel.js')
  let tempRoot
  try {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-kernel-resolver-helper-'))
    const helperPath = writeExecutableHelper(tempRoot)
    const adapter = kernel.createAgentTeamKernelAdapter({
      mode: 'go-packaged-preview',
      helperPath,
      packagedHelperStatus: 'unsupported-platform',
      packagedHelperPath: path.join(tempRoot, 'KERNEL_RESOLVER_HELPER_PATH_SHOULD_NOT_LEAK-missing'),
      packagedHelperInstallRoot: path.join(tempRoot, 'KERNEL_RESOLVER_RAW_MANIFEST_SHOULD_NOT_LEAK-root'),
      packagedHelperManifestPath: '../unsafe-manifest.json',
      env: { PATH: process.env.PATH || '' },
    })
    const snapshot = adapter.parseTmuxPaneSnapshot('%x\texplicit:@1\tlabel\tpi', 1700010000001, () => {
      throw new Error('explicit helper path must not fall back')
    })
    assert.equal(snapshot.ok, true, 'explicit helper path should parse through helper')
    assert.equal(snapshot.panes[0].paneId, '%resolver', 'explicit helper path should use the supplied helper')
    const metadata = adapter.metadata()
    assert.equal(metadata.kernel.requestedMode, 'go-packaged-preview', 'explicit helper preserves requested preview mode')
    assert.equal(metadata.kernel.mode, 'go', 'explicit helper activates Go')
    assert.equal(metadata.kernel.enabled, true, 'explicit helper enables Go')
    assert.equal(metadata.kernel.cutoverStatus, 'active', 'explicit helper should not inherit packaged resolver failure')
    assert.equal(metadata.kernel.fallbacks, 0, 'explicit helper should not use migration fallback')
    assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false, 'explicit helper should not expose fallbackKind')
    assert.equal(JSON.stringify(metadata).includes(tempRoot), false, 'explicit helper metadata should not leak temp helper path')
    assertIncludes(JSON.stringify(metadata.kernel), path.basename(helperPath), 'explicit helper metadata should keep only compact helper basename')
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function assertPackagedPreviewExplicitNonDefault(root, env) {
  const kernel = env.helpers.requireDist('core/kernel.js')
  const benchMetadata = require(path.join(root, 'tests/bench/kernelMetadata.cjs'))
  const readModelBench = require(path.join(root, 'tests/bench/team-read-model-baseline.cjs'))

  assert.equal(kernel.isKnownAgentTeamKernelMode('go-packaged-preview'), true, 'go-packaged-preview remains known')
  assert.equal(benchMetadata.buildKernelMetadata({ requestedMode: 'go-packaged-preview' }).kernel.requestedKnownKernel, true, 'bench metadata should know preview mode')
  assert.equal(readModelBench.shouldRunShadow('go-packaged-preview'), false, 'packaged preview should not run read-model shadow')

  const preview = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: {} })
  const previewMetadata = preview.metadata()
  assert.equal(previewMetadata.kernel.requestedMode, 'go-packaged-preview', 'preview requested mode')
  assert.equal(previewMetadata.kernel.requestedKnownKernel, true, 'preview known mode')
  assert.equal(previewMetadata.kernel.mode, 'typescript', 'preview without explicit package evidence should not enable Go')
  assert.equal(previewMetadata.kernel.enabled, false, 'preview without explicit package evidence should stay disabled')
  assert.equal(previewMetadata.kernel.fallbacks, 0, 'preview should not use migration fallback')
  assert.equal(previewMetadata.kernel.cutoverStatus, 'unavailable', 'preview without explicit package evidence should fail closed')
  assert.equal(previewMetadata.kernel.cutoverFailureKind, 'missing-helper', 'preview without package evidence should report compact missing helper')
  assert.equal(Object.prototype.hasOwnProperty.call(previewMetadata.kernel, 'fallbackKind'), false, 'preview must not expose fallbackKind')
  assertNoFailureLeaks(previewMetadata, null, 'preview missing package metadata')

  const defaultMetadata = kernel.createAgentTeamKernelAdapter({ env: {} }).metadata()
  assert.equal(defaultMetadata.kernel.requestedMode, 'default', 'unset/default requested mode')
  assert.equal(defaultMetadata.kernel.mode, 'go', 'default uses approved embedded parser-only Go')
  assert.equal(defaultMetadata.kernel.enabled, true, 'default embedded helper should be enabled')
  assert.equal(defaultMetadata.kernel.cutoverStatus, 'active', 'default embedded helper should be active')
  assert.equal(defaultMetadata.kernel.fallbacks, 0, 'default embedded helper must not use migration fallback')
}

function assertPackagedResolverContractAndFailClosed(root, env) {
  const kernel = env.helpers.requireDist('core/kernel.js')
  const resolver = env.helpers.requireDist('core/kernelPackagedResolver.js')
  const cases = [
    ['unsafe manifest path', { layout: false, manifestPath: '../escape/manifest.json' }, 'path-unsafe', 'helper-unsafe-response-shape'],
    ['missing manifest', { layout: false, manifestPath: `native/${MODULE}/${HELPER_VERSION}/linux-x64-glibc/missing-manifest.json` }, 'manifest-missing', 'missing-helper'],
    ['package mismatch', { layout: { packageMismatch: true } }, 'package-mismatch', 'helper-unsafe-response-shape'],
    ['module mismatch', { layout: { moduleMismatch: true } }, 'module-mismatch', 'helper-unsupported-capability'],
    ['version skew', { layout: { versionSkew: true } }, 'version-skew', 'helper-unsupported-version'],
    ['capability skew', { layout: { capabilitySkew: true } }, 'capability-skew', 'helper-unsupported-capability'],
    ['unsupported platform', { layout: { unsupportedPlatform: true } }, 'unsupported-platform', 'disabled-helper'],
    ['missing helper', { layout: { missingHelper: true } }, 'helper-missing', 'missing-helper'],
    ['integrity mismatch', { layout: { integrityMismatch: true } }, 'integrity-mismatch', 'helper-unsafe-response-shape'],
    ['artifact not executable', { layout: { artifactNotExecutable: true } }, 'artifact-not-executable', 'helper-unsafe-response-shape'],
    ['missing provenance', { layout: { missingProvenance: true } }, 'provenance-missing', 'helper-unsafe-response-shape'],
    ['missing license', { layout: { missingLicense: true } }, 'license-missing', 'helper-unsafe-response-shape'],
    ['invalid attestation', { layout: { invalidAttestation: true } }, 'attestation-invalid', 'helper-unsafe-response-shape'],
  ]

  for (const [label, options, failureKind, cutoverFailureKind] of cases) {
    let tempRoot
    try {
      tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-kernel-resolver-failure-'))
      const layout = options.layout ? writePackagedLayout(tempRoot, options.layout) : { installedRoot: tempRoot, manifestRel: options.manifestPath }
      const manifestPath = options.manifestPath || layout.manifestRel
      const result = resolver.resolveAgentTeamPackagedHelperManifest({ installedRoot: layout.installedRoot, manifestPath, platform: { os: 'linux', arch: 'x64', libc: 'glibc' } })
      assertPackagedFailureShape(result, failureKind, cutoverFailureKind, label)
      assertNoFailureLeaks(result, tempRoot, `${label} resolver result`)

      const adapter = kernel.createAgentTeamKernelAdapter({
        mode: 'go-packaged-preview',
        packagedHelperInstallRoot: layout.installedRoot,
        packagedHelperManifestPath: manifestPath,
        env: { PATH: process.env.PATH || '' },
      })
      let fallbackCalls = 0
      const snapshot = adapter.parseTmuxPaneSnapshot('%x\tresolver:@1\tKERNEL_RESOLVER_MAILBOX_REPORT_TEXT_SHOULD_NOT_LEAK\tpi', 1700010000002, () => {
        fallbackCalls += 1
        throw new Error('packaged preview resolver failures must not use TypeScript parser fallback')
      })
      assert.equal(fallbackCalls, 0, `${label} adapter must not call TypeScript parser fallback`)
      assertFailClosedSnapshot(snapshot, cutoverFailureKind, `${label} adapter`)
      const metadata = adapter.metadata()
      assert.equal(metadata.kernel.fallbacks, 0, `${label} metadata should not use migration fallback`)
      assert.equal(metadata.kernel.cutoverFailureKind, cutoverFailureKind, `${label} metadata cutover failure kind`)
      assertNoFailureLeaks(metadata, tempRoot, `${label} adapter metadata`)
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  }

  let successRoot
  try {
    successRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-kernel-resolver-success-'))
    const layout = writePackagedLayout(successRoot)
    const result = resolver.resolveAgentTeamPackagedHelperManifest({ installedRoot: layout.installedRoot, manifestPath: layout.manifestRel, platform: { os: 'linux', arch: 'x64', libc: 'glibc' } })
    assert.equal(result.status, 'available', 'valid packaged resolver layout should resolve')
    assert.equal(result.module, MODULE, 'valid packaged resolver module')
    assert.equal(result.capability, MODULE, 'valid packaged resolver capability')
    assert.equal(result.resultMarker, 'packaged-manifest-resolved', 'valid packaged resolver marker')
    assert.equal(result.helper.path, layout.helperRel, 'valid packaged resolver should return package-relative helper metadata')
    assert.equal(result.manifest.path, layout.manifestRel, 'valid packaged resolver should return package-relative manifest metadata')
    assert.equal(result.manifest.packageName, PACKAGE_NAME, 'valid packaged resolver package name')
    assert.equal(result.manifest.packageVersion, PACKAGE_VERSION, 'valid packaged resolver package version')
    assert.equal(result.manifest.helperVersion, HELPER_VERSION, 'valid packaged resolver helper version')
    assert.equal(result.manifest.protocolVersion, PROTOCOL_VERSION, 'valid packaged resolver protocol')
    assert.equal(result.attestation.kind, 'placeholder-only', 'valid packaged resolver keeps placeholder attestation only')
    assert.equal(result.attestation.signed, false, 'valid packaged resolver does not claim signing')

    const adapter = kernel.createAgentTeamKernelAdapter({
      mode: 'go-packaged-preview',
      packagedHelperInstallRoot: layout.installedRoot,
      packagedHelperManifestPath: layout.manifestRel,
      env: { PATH: process.env.PATH || '' },
    })
    const snapshot = adapter.parseTmuxPaneSnapshot('%x\tresolver:@1\tlabel\tpi', 1700010000003, () => {
      throw new Error('valid packaged preview helper must not call TypeScript parser fallback')
    })
    assert.equal(snapshot.ok, true, 'valid packaged preview helper should parse')
    assert.equal(snapshot.panes[0].paneId, '%resolver', 'valid packaged preview helper should be used')
    const metadata = adapter.metadata()
    assert.equal(metadata.kernel.requestedMode, 'go-packaged-preview', 'valid packaged preview metadata requested mode')
    assert.equal(metadata.kernel.mode, 'go', 'valid packaged preview metadata active mode')
    assert.equal(metadata.kernel.cutoverStatus, 'active', 'valid packaged preview cutover active')
    assert.equal(metadata.kernel.fallbacks, 0, 'valid packaged preview should not use fallback')
    assert.equal(JSON.stringify(metadata).includes(successRoot), false, 'valid packaged preview metadata should not leak temp root')
  } finally {
    if (successRoot) fs.rmSync(successRoot, { recursive: true, force: true })
  }
}

function assertCutoverNoHiddenTypeScriptFallback(env) {
  const kernel = env.helpers.requireDist('core/kernel.js')
  const missingPath = path.join(os.tmpdir(), 'agentteam-kernel-resolver-KERNEL_RESOLVER_HELPER_PATH_SHOULD_NOT_LEAK', 'missing-helper')
  for (const mode of ['default', 'go', 'go-cutover', 'go-packaged-preview']) {
    let fallbackCalls = 0
    const adapter = kernel.createAgentTeamKernelAdapter({ mode, helperPath: missingPath, env: { PATH: process.env.PATH || '' } })
    const snapshot = adapter.parseTmuxPaneSnapshot('%x\tresolver:@1\tKERNEL_RESOLVER_STDOUT_SHOULD_NOT_LEAK\tpi', 1700010000004, () => {
      fallbackCalls += 1
      return { capturedAt: 1700010000004, panes: [{ paneId: '%ts', target: 'ts:@1', label: 'hidden fallback', currentCommand: 'pi' }], byPaneId: {}, ok: true }
    })
    assert.equal(fallbackCalls, 0, `${mode} cutover/default path must not call TypeScript parser fallback`)
    assertFailClosedSnapshot(snapshot, 'missing-helper', `${mode} missing helper`)
    const metadata = adapter.metadata()
    assert.equal(metadata.kernel.fallbacks, 0, `${mode} missing helper should not use migration fallback`)
    assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false, `${mode} missing helper should not expose fallbackKind`)
    assertNoFailureLeaks(metadata, null, `${mode} missing helper metadata`)
  }

  let autoFallbackCalls = 0
  const auto = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath: missingPath, env: { PATH: process.env.PATH || '' } })
  const autoSnapshot = auto.parseTmuxPaneSnapshot('%x\tauto:@1\tlabel\tpi', 1700010000005, (stdout, capturedAt) => {
    autoFallbackCalls += 1
    return { capturedAt, panes: [{ paneId: '%ts', target: 'auto:@1', label: stdout, currentCommand: 'pi' }], byPaneId: { '%ts': { paneId: '%ts', target: 'auto:@1', label: stdout, currentCommand: 'pi' } }, ok: true }
  })
  assert.equal(autoFallbackCalls, 1, 'auto remains a non-cutover migration mode that may use the provided TypeScript fallback')
  assert.equal(autoSnapshot.ok, true, 'auto fallback behavior remains unchanged outside cutover/default modes')
  assert.equal(auto.metadata().kernel.fallbacks, 0, 'auto fallback call should not be counted as hidden cutover fallback')
}

function assertDefaultEmbeddedResolverGated(root, env) {
  const kernel = env.helpers.requireDist('core/kernel.js')
  let tempRoot
  try {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-kernel-resolver-poisoned-preview-'))
    const poisoned = writePackagedLayout(tempRoot, { packageMismatch: true })
    const defaultAdapter = kernel.createAgentTeamKernelAdapter({
      env: {
        PATH: process.env.PATH || '',
        PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT: poisoned.installedRoot,
        PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST: poisoned.manifestRel,
      },
    })
    const metadata = defaultAdapter.metadata()
    assert.equal(metadata.kernel.requestedMode, 'default', 'default should remain default despite preview env hints')
    assert.equal(metadata.kernel.mode, 'go', 'default should use approved embedded helper rather than preview env manifest')
    assert.equal(metadata.kernel.cutoverStatus, 'active', 'default embedded helper should stay active despite poisoned preview env manifest')
    assert.equal(metadata.kernel.fallbacks, 0, 'default embedded helper should not fallback because of preview env manifest')
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  }

  const kernelSource = readRel(root, 'core/kernel.ts')
  assertIncludes(kernelSource, 'defaultAgentTeamKernelEmbeddedHelperRoot()', 'default embedded resolver root evidence')
  assertIncludes(kernelSource, 'defaultAgentTeamKernelEmbeddedHelperManifestPath()', 'default embedded resolver manifest evidence')
  assert.match(kernelSource, /packagedPreviewRequested[\s\S]*defaultAgentTeamKernelPackagedHelperManifestPath\(env\)[\s\S]*defaultAgentTeamKernelEmbeddedHelperManifestPath\(\)/, 'preview env manifest should be gated away from default embedded manifest')
  assert.match(kernelSource, /packagedPreviewRequested[\s\S]*defaultAgentTeamKernelPackagedHelperRoot\(env\)[\s\S]*defaultAgentTeamKernelEmbeddedHelperRoot\(\)/, 'preview env root should be gated away from default embedded root')
}

function assertProductionNonParserBoundaries(root) {
  const kernelSource = readRel(root, 'core/kernel.ts')
  const resolverSource = readRel(root, 'core/kernelPackagedResolver.ts')
  const readinessSource = readRel(root, 'commands/readiness.ts')
  const teamSource = readRel(root, 'commands/team.ts')
  const combinedRuntime = `${kernelSource}\n${resolverSource}`

  for (const [label, pattern] of [
    ['npm/release mechanics', /npm\s+(?:version|publish|pack)|gh\s+release|git\s+(?:tag|push)|release asset|actions\/upload-release-asset/i],
    ['download/install/build lifecycle', /postinstall|preinstall|install-time build|curl\b|wget\b|node-gyp|prebuild|download-artifact|actions\/download-artifact/i],
    ['signing/SLSA control', /\bcosign\b|\bslsa\b|sigstore|signing material|id-token:\s*write/i],
    ['state/task/report/mailbox authority', /writeTeamState|deleteTeamState|agentteam_receive|report_done|report_blocked|TaskReport body|mailbox\/report/i],
    ['normal-user/package availability claims', /normal-user native availability is proven|package-manager native delivery is complete|fallback deletion is approved/i],
  ]) assert.equal(pattern.test(combinedRuntime), false, `kernel/resolver runtime must not contain ${label}`)

  assert.equal(/readiness\s+--|readiness\s+(?:native|availability|resolver|default|cutover|package|artifact|checkpoint|install)/i.test(readinessSource), false, '/team readiness should not grow resolver/default/native subcommands')
  assert.equal(/openTeamPanel\([^)]*readiness|render.*readiness|ambient.*diagnostics/i.test(teamSource), false, '/team should not ambiently render resolver/readiness diagnostics')
}

function assertKernelResolverBehaviorSuiteEvidence(root) {
  for (const rel of KERNEL_RESOLVER_SUPPORTING_SUITES) assert.equal(existsRel(root, rel), true, `${rel} should remain as kernel/resolver source-boundary evidence`)
  for (const rel of KERNEL_RESOLVER_SUPPORTING_FIXTURES) assert.equal(existsRel(root, rel), true, `${rel} should remain as kernel/resolver fixture evidence`)

  const previewSuite = readRel(root, 'tests/suites/go-kernel-v0422-packaged-preview-invariants.cjs')
  const gateSuite = readRel(root, 'tests/suites/go-kernel-v0425-resolver-default-cutover-gate.cjs')
  const resolverSuite = readRel(root, 'tests/suites/go-kernel-v0427-resolver-discovery-contract.cjs')
  const installedLayoutSuite = readRel(root, 'tests/suites/go-kernel-v0633-installed-layout-consumption.cjs')
  const installContractSuite = readRel(root, 'tests/suites/go-kernel-v0634-install-layout-contract.cjs')

  for (const expected of ['go-packaged-preview', 'fallbacks', 'packaged helper']) assertIncludes(previewSuite, expected, 'packaged preview invariant suite')
  for (const expected of ['assertKernelSourceInvariants', 'current `go-cutover` remains helper-path based', 'default/unset']) assertIncludes(gateSuite, expected, 'resolver/default gate suite')
  for (const expected of ['discoverHelper', 'explicit helper path should stay highest precedence', 'current default/unset mode must not read packaged layout']) assertIncludes(resolverSuite, expected, 'v0427 resolver discovery suite')
  for (const expected of ['runInstalledLayoutConsumptionProof', 'Only explicit `go-packaged-preview` consumes the installed layout.', 'defaultResolverChanged']) assertIncludes(installedLayoutSuite, expected, 'v0633 installed layout suite')
  for (const expected of ['assertKernelSourceInvariants', 'assertPackagedResolverContractConstants', 'Explicit helper path remains first precedence.']) assertIncludes(installContractSuite, expected, 'v0634 install layout contract suite')
}

async function assertKernelResolverSourceBoundaryGuard(root, env) {
  assertEveryFileExists(root, [
    KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER,
    KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE,
    ...KERNEL_RESOLVER_SOURCE_FILES,
    ...KERNEL_RESOLVER_SUPPORTING_FIXTURES,
    ...KERNEL_RESOLVER_SUPPORTING_SUITES,
  ], 'kernel resolver source-boundary guard')

  const checked = new Set()
  const mark = async (category, assertion) => {
    await assertion()
    checked.add(category)
  }

  await mark('kernel-source-mode-boundaries', () => assertKernelSourceModeBoundaries(root))
  await mark('explicit-helper-path-precedence', () => assertExplicitHelperPathPrecedence(root, env))
  await mark('packaged-preview-explicit-non-default', () => assertPackagedPreviewExplicitNonDefault(root, env))
  await mark('packaged-resolver-contract-and-fail-closed', () => assertPackagedResolverContractAndFailClosed(root, env))
  await mark('cutover-no-hidden-typescript-fallback', () => assertCutoverNoHiddenTypeScriptFallback(env))
  await mark('default-embedded-resolver-gated', () => assertDefaultEmbeddedResolverGated(root, env))
  await mark('production-non-parser-boundaries', () => assertProductionNonParserBoundaries(root))
  await mark('kernel-resolver-behavior-suite-evidence', () => assertKernelResolverBehaviorSuiteEvidence(root))

  const checkedCategories = sorted(checked)
  assert.deepEqual(checkedCategories, sorted(KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES), 'kernel resolver source-boundary guard should execute every category')
  return { checkedCategories }
}

module.exports = {
  KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORIES,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_CATEGORY_DESCRIPTIONS,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_HELPER,
  KERNEL_RESOLVER_SOURCE_BOUNDARY_GUARD_SUITE,
  KERNEL_RESOLVER_SOURCE_FILES,
  KERNEL_RESOLVER_SUPPORTING_FIXTURES,
  KERNEL_RESOLVER_SUPPORTING_SUITES,
  assertKernelResolverSourceBoundaryGuard,
}
