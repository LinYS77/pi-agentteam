const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  assertIncludes,
  existsRel,
  readJsonRel,
  readRel,
  toRel,
  walkFiles,
} = require('./fsAssertions.cjs')
const {
  APPROVED_EMBEDDED_NATIVE_FILES,
} = require('./packageReleaseGovernanceGuards.cjs')
const {
  PACKAGE_VERSION,
  assertPackageNoReleaseGuards,
} = require('./packageGuards.cjs')
const {
  APPROVED_NATIVE_ROOT,
} = require('./nativeGuards.cjs')

const INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER = 'tests/helpers/installLayoutPathSafetyGuards.cjs'
const INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE = 'tests/suites/go-kernel-install-layout-path-safety-guard.cjs'

const INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES = Object.freeze([
  'installed-layout-platform-tuple-contract',
  'package-relative-path-safety-contract',
  'resolver-fail-closed-layout-inputs',
  'clean-install-proof-boundaries',
  'package-manager-baseline-non-claims',
  'non-applied-layout-proposals-inert',
  'package-native-allowlist-preserved',
  'default-resolver-and-control-surface-contained',
  'install-layout-supporting-suite-evidence',
])

const INSTALL_LAYOUT_PATH_SAFETY_CATEGORY_DESCRIPTIONS = Object.freeze({
  'installed-layout-platform-tuple-contract': 'The current packaged resolver only accepts the approved embedded linux-x64-glibc manifest tuple and fails closed for platform tuple mismatches without claiming second-platform availability.',
  'package-relative-path-safety-contract': 'Installed helper manifest inputs and manifest file paths stay package-relative, normalized with forward slashes, non-empty, non-absolute, no traversal/backslash, and contained inside the selected package root.',
  'resolver-fail-closed-layout-inputs': 'Missing, unsafe, skewed, stale, non-executable, or integrity/provenance/license/attestation-invalid layout inputs return compact fail-closed resolver diagnostics without raw path/body leaks.',
  'clean-install-proof-boundaries': 'Clean-install and installed-layout proof scripts remain temp/review-only prototypes, copy only verified native layouts, load from temp installed-package roots, and keep explicit go-packaged-preview as the only installed-layout consumer.',
  'package-manager-baseline-non-claims': 'Package-manager clean-install evidence remains a TypeScript/pi facade baseline with local temp pack/install only, scripts ignored, no install-source/native delivery/default/release availability claim, and redacted summaries.',
  'non-applied-layout-proposals-inert': 'v0.6.34 package layout proposals remain fixture-only, non-applied, future-approval-gated, not imported by production sources, and not usable by production resolver logic.',
  'package-native-allowlist-preserved': 'package.json remains 0.6.8 with no native dependency/lifecycle/download/install-time build surface and only the approved embedded native helper files in package files metadata.',
  'default-resolver-and-control-surface-contained': 'Default/unset/go modes use only the approved embedded helper, poisoned installed-layout env hints are ignored outside approved gates, and readiness/tools/control-plane surfaces do not become native/package/release controls.',
  'install-layout-supporting-suite-evidence': 'Current non-deleted supporting install-layout, fail-closed, clean-install, package/runtime, and non-applied fixture suites/scripts remain present as evidence outside Step5C candidate docs suites.',
})

const INSTALL_LAYOUT_PATH_SAFETY_SOURCE_FILES = Object.freeze([
  'core/kernel.ts',
  'core/kernelPackagedResolver.ts',
  'core/kernelContract.ts',
  'commands/readiness.ts',
  'commands/team.ts',
  'scripts/lib/go-helper-clean-install-proof.cjs',
  'scripts/verify-go-helper-clean-install-proof.cjs',
  'tests/fixtures/kernel/v0634/nonAppliedPackageLayoutProposals.cjs',
  'package.json',
  '.gitignore',
])

const INSTALL_LAYOUT_PATH_SAFETY_SUPPORTING_SUITES = Object.freeze([
  'tests/suites/go-kernel-v0427-resolver-discovery-contract.cjs',
  'tests/suites/go-kernel-v0633-installed-layout-consumption.cjs',
  'tests/suites/go-kernel-v0633-installed-layout-fail-closed.cjs',
  'tests/suites/go-kernel-v0633-package-manager-clean-install-baseline.cjs',
  'tests/suites/go-kernel-v0633-package-runtime-guardrails.cjs',
  'tests/suites/go-kernel-v0634-install-layout-contract.cjs',
  'tests/suites/go-kernel-v0634-non-applied-package-layout-fixtures.cjs',
])

const INSTALL_LAYOUT_PATH_SAFETY_SUPPORTING_DOCS = Object.freeze([
  'docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md',
  'docs/perf/v0.6.33-clean-install-native-helper-consumption.md',
  'docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md',
  'docs/perf/v0.6.34-package-release-install-layout-decision.md',
  'docs/perf/v0.6.34-package-release-install-layout-decision-checkpoint.md',
])

const APPROVED_PLATFORM = Object.freeze({ os: 'linux', arch: 'x64', libc: 'glibc', target: 'linux-x64-glibc' })
const REQUIRED_PROPOSAL_IDS = Object.freeze([
  'main-package-inclusion-proposal',
  'companion-native-package-proposal',
  'github-release-asset-proposal',
  'generated-artifact-bundle-proposal',
  'source-only-no-native-continuation-proposal',
])
const EXPECTED_TOOLS = Object.freeze([
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
])

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function assertSameSet(actual, expected, label) {
  assert.deepEqual(sorted(actual), sorted(expected), `${label} should match exactly`)
}

function assertEveryFileExists(root, files, label) {
  for (const rel of files) assert.equal(existsRel(root, rel), true, `${rel} should exist for ${label}`)
}

function assertCompactNoLeaks(value, roots, label) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  assert.ok(text.length < 1600, `${label} diagnostic should stay compact`)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, `${label} diagnostic must not leak absolute root ${root}`)
  }
  assert.equal(text.includes(process.cwd()), false, `${label} diagnostic must not leak process cwd`)
  for (const forbidden of [
    'stdout',
    'stderr',
    'stack',
    'AssertionError',
    'Error:',
    'node_modules/pi-agentteam',
    'package/index.ts',
    'raw manifest',
    'raw provenance',
    'raw license',
    'raw attestation',
    'raw hosted',
    'api.github.com',
    'https://',
    'cosign proof',
    'SLSA proof',
  ]) {
    assert.equal(text.includes(forbidden), false, `${label} diagnostic must not leak ${forbidden}`)
  }
}

function manifestRelPath() {
  return `${APPROVED_NATIVE_ROOT}/manifest.json`
}

function copyApprovedNativeLayoutToTemp(root) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-install-layout-guard-'))
  const sourceNative = path.join(root, 'native')
  const targetNative = path.join(tempRoot, 'native')
  fs.cpSync(sourceNative, targetNative, { recursive: true })
  return tempRoot
}

function mutateManifest(installedRoot, mutator) {
  const filePath = path.join(installedRoot, ...manifestRelPath().split('/'))
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  mutator(manifest)
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

function resolveWith(resolver, installedRoot, options = {}) {
  return resolver.resolveAgentTeamPackagedHelperManifest({
    installedRoot,
    manifestPath: Object.prototype.hasOwnProperty.call(options, 'manifestPath') ? options.manifestPath : manifestRelPath(),
    platform: options.platform || APPROVED_PLATFORM,
  })
}

function assertUnavailable(result, expectedKind, label, roots = []) {
  assert.equal(result.status, 'unavailable', `${label} should fail closed`)
  assert.equal(result.resultMarker, 'fail-closed', `${label} result marker`)
  assert.equal(result.failureKind, expectedKind, `${label} failureKind`)
  assert.equal(typeof result.remediation, 'string', `${label} remediation`)
  assert.equal(typeof result.hint, 'string', `${label} hint`)
  assert.equal(result.module, 'tmuxSnapshotParse', `${label} module`)
  assert.equal(result.capability, 'tmuxSnapshotParse', `${label} capability`)
  assertCompactNoLeaks(result, roots, label)
}

function assertInstalledLayoutPlatformTupleContract(root, env) {
  const resolver = env.helpers.requireDist('core/kernelPackagedResolver.js')
  const success = resolveWith(resolver, root)
  assert.equal(success.status, 'available', 'approved embedded layout should resolve for linux-x64-glibc')
  assert.equal(success.resultMarker, 'packaged-manifest-resolved')
  assert.equal(success.manifest.path, manifestRelPath())
  assert.equal(success.manifest.target, APPROVED_PLATFORM.target)
  assert.deepEqual(success.manifest.platform, {
    os: APPROVED_PLATFORM.os,
    arch: APPROVED_PLATFORM.arch,
    libc: APPROVED_PLATFORM.libc,
  })
  assert.equal(success.helper.path, `${APPROVED_NATIVE_ROOT}/agentteam-tmuxSnapshotParse`)
  assert.equal(success.attestation.kind, 'placeholder-only')
  assert.equal(success.attestation.signed, false)
  assertCompactNoLeaks({ ...success, helperPath: '<redacted>', helper: { ...success.helper, path: '<redacted>' } }, [root], 'approved platform success summary')

  const unsupportedRows = [
    ['linux x64 musl mismatch', { os: 'linux', arch: 'x64', libc: 'musl' }],
    ['linux arm64 glibc mismatch', { os: 'linux', arch: 'arm64', libc: 'glibc' }],
    ['darwin arm64 mismatch', { os: 'darwin', arch: 'arm64', libc: 'not-applicable' }],
    ['win32 x64 mismatch', { os: 'win32', arch: 'x64', libc: 'not-applicable' }],
    ['unsupported OS', { os: 'freebsd', arch: 'x64', libc: 'not-applicable' }],
    ['missing linux libc', { os: 'linux', arch: 'x64', libc: 'unknown' }],
  ]
  for (const [label, platform] of unsupportedRows) {
    assertUnavailable(resolveWith(resolver, root, { platform }), 'unsupported-platform', label, [root])
  }

  const resolverSource = readRel(root, 'core/kernelPackagedResolver.ts')
  for (const expected of [
    "const SUPPORTED_OS = new Set(['linux', 'darwin', 'win32'])",
    "const SUPPORTED_ARCH = new Set(['x64', 'arm64'])",
    "const SUPPORTED_LINUX_LIBC = new Set(['glibc', 'musl'])",
    'function platformSupported(platform: Required<AgentTeamPackagedResolverPlatform>): boolean',
    'function platformMatches(manifestPlatform: Record<string, unknown> | undefined, host: Required<AgentTeamPackagedResolverPlatform>): boolean',
    "return unavailable('unsupported-platform', 'host-platform')",
    "return unavailable('unsupported-platform', 'manifest-platform')",
  ]) assertIncludes(resolverSource, expected, 'packaged resolver platform tuple source')
}

function assertPackageRelativePathSafetyContract(root, env) {
  const resolver = env.helpers.requireDist('core/kernelPackagedResolver.js')
  for (const [label, manifestPathValue] of [
    ['absolute manifest path', path.join(root, manifestRelPath())],
    ['traversal manifest path', `../${manifestRelPath()}`],
    ['backslash manifest path', manifestRelPath().replace(/\//g, '\\')],
    ['empty manifest path', ''],
  ]) {
    assertUnavailable(resolveWith(resolver, root, { manifestPath: manifestPathValue }), 'path-unsafe', label, [root])
  }

  let tempRoot
  try {
    tempRoot = copyApprovedNativeLayoutToTemp(root)
    mutateManifest(tempRoot, manifest => {
      manifest.files.helper = '../escape/helper'
      manifest.artifact.path = '../escape/helper'
    })
    assertUnavailable(resolveWith(resolver, tempRoot), 'path-unsafe', 'unsafe helper path in manifest', [root, tempRoot])
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  }

  const resolverSource = readRel(root, 'core/kernelPackagedResolver.ts')
  for (const expected of [
    'function safePackageRelativePath(installedRoot: string, relPath: unknown): SafeResolvedPath | undefined',
    "if (typeof relPath !== 'string') return undefined",
    "if (!relPath || path.isAbsolute(relPath) || relPath.includes('\\\\')) return undefined",
    "if (parts.some(part => !part || part === '.' || part === '..')) return undefined",
    'if (!isInside(root, fullPath)) return undefined',
    "if (!resolved) return { failure: unavailable('path-unsafe', 'manifest-path') }",
    "if (!resolved) return { failure: unavailable('path-unsafe', name) }",
    "if (paths.manifest.fullPath !== manifestPath.fullPath) return unavailable('path-unsafe', 'manifest-path-match')",
  ]) assertIncludes(resolverSource, expected, 'packaged resolver path safety source')
}

function assertResolverFailClosedLayoutInputs(root, env) {
  const resolver = env.helpers.requireDist('core/kernelPackagedResolver.js')
  assertUnavailable(resolveWith(resolver, root, { manifestPath: `${APPROVED_NATIVE_ROOT}/missing-manifest.json` }), 'manifest-missing', 'missing manifest', [root])

  const cases = [
    ['package mismatch', 'package-mismatch', (tempRoot) => mutateManifest(tempRoot, manifest => { manifest.packageName = 'other-package' })],
    ['module mismatch', 'module-mismatch', (tempRoot) => mutateManifest(tempRoot, manifest => { manifest.module = 'compactReadModelFingerprint' })],
    ['version skew', 'version-skew', (tempRoot) => mutateManifest(tempRoot, manifest => { manifest.helperVersion = '0.0.0-skew' })],
    ['capability skew', 'capability-skew', (tempRoot) => mutateManifest(tempRoot, manifest => { manifest.capabilities = ['health'] })],
    ['helper missing', 'helper-missing', (tempRoot) => {
      const manifest = readJsonRel(tempRoot, manifestRelPath())
      fs.rmSync(path.join(tempRoot, ...manifest.files.helper.split('/')), { force: true })
    }],
    ['integrity mismatch', 'integrity-mismatch', (tempRoot) => {
      const manifest = readJsonRel(tempRoot, manifestRelPath())
      fs.appendFileSync(path.join(tempRoot, ...manifest.files.helper.split('/')), 'INSTALL_LAYOUT_GUARD_CORRUPTION')
    }],
    ['provenance missing', 'provenance-missing', (tempRoot) => {
      const manifest = readJsonRel(tempRoot, manifestRelPath())
      fs.rmSync(path.join(tempRoot, ...manifest.files.provenance.split('/')), { force: true })
    }],
    ['license missing', 'license-missing', (tempRoot) => {
      const manifest = readJsonRel(tempRoot, manifestRelPath())
      fs.rmSync(path.join(tempRoot, ...manifest.files.licenseMetadata.split('/')), { force: true })
    }],
    ['attestation invalid', 'attestation-invalid', (tempRoot) => {
      const manifest = readJsonRel(tempRoot, manifestRelPath())
      const attestationPath = path.join(tempRoot, ...manifest.files.attestation.split('/'))
      const attestation = JSON.parse(fs.readFileSync(attestationPath, 'utf8').trim())
      attestation.predicate.placeholderOnly = false
      attestation.predicate.signed = true
      attestation.predicate.signing = 'INSTALL_LAYOUT_GUARD_SIGNING_SHOULD_NOT_LEAK'
      fs.writeFileSync(attestationPath, `${JSON.stringify(attestation)}\n`, 'utf8')
    }],
    ['artifact not executable', 'artifact-not-executable', (tempRoot) => {
      const manifest = readJsonRel(tempRoot, manifestRelPath())
      const helperPath = path.join(tempRoot, ...manifest.files.helper.split('/'))
      if (process.platform !== 'win32') fs.chmodSync(helperPath, 0o644)
      else mutateManifest(tempRoot, value => { value.artifact.filename = 'agentteam-tmuxSnapshotParse' })
    }],
  ]
  for (const [label, expectedKind, mutate] of cases) {
    let tempRoot
    try {
      tempRoot = copyApprovedNativeLayoutToTemp(root)
      mutate(tempRoot)
      assertUnavailable(resolveWith(resolver, tempRoot), expectedKind, label, [root, tempRoot])
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  }

  const resolverSource = readRel(root, 'core/kernelPackagedResolver.ts')
  for (const expected of [
    "| 'path-unsafe'",
    "| 'unsupported-platform'",
    "| 'helper-missing'",
    "| 'integrity-mismatch'",
    "| 'artifact-not-executable'",
    "| 'provenance-missing'",
    "| 'license-missing'",
    "| 'attestation-invalid'",
    "resultMarker: 'fail-closed'",
    'reason: failureKind',
  ]) assertIncludes(resolverSource, expected, 'packaged resolver fail-closed taxonomy')
}

function assertCleanInstallProofBoundaries(root) {
  const proof = require(path.join(root, 'scripts/lib/go-helper-clean-install-proof.cjs'))
  const cli = readRel(root, 'scripts/verify-go-helper-clean-install-proof.cjs')
  const source = readRel(root, 'scripts/lib/go-helper-clean-install-proof.cjs')
  const failure = proof.compactFailure('installed-preview-smoke-failed', 'keep installed layout ignored outside explicit go-packaged-preview', 'non-preview:default')
  assert.equal(failure.resultMarker, 'fail-closed')
  assert.equal(failure.reviewOnly, true)
  assert.equal(failure.prototype, true)
  assert.equal(failure.nonAvailability, true)
  assert.equal(failure.normalUserAvailability, false)
  assert.equal(failure.nativePackageDelivery, false)
  assert.equal(failure.defaultResolverChanged, false)
  assertCompactNoLeaks(failure, [root], 'clean install compact failure')

  for (const expected of [
    'function copyVerifiedLayoutToInstalledPackage(verified, installedRoot)',
    "if (!manifestDir || manifestDir === '.' || !manifestDir.startsWith('native/'))",
    'fs.cpSync(sourceDir, targetDir, { recursive: true })',
    'runInstalledLayoutConsumptionProof',
    "resultMarker: 'installed-layout-consumption-prototype'",
    "proofKind: 'verified-artifact-installed-layout-explicit-preview'",
    'nativeLayoutInjectedAfterInstall: true',
    "explicitMode: 'go-packaged-preview'",
    "compactReadModelFingerprint: 'typescript-fallback'",
    'nonPreviewModesIgnoredInstalledLayout: true',
    "artifactSource: options.buildReviewArtifact ? 'local-os-temp-review-artifact-build' : 'external-artifact-root-verified'",
  ]) assertIncludes(source, expected, 'clean-install installed-layout proof source')
  for (const expected of [
    '--build-review-artifact',
    '--artifact-root <path>',
    'All modes report review-only/non-availability evidence.',
    'runInstalledLayoutConsumptionProof({',
  ]) assertIncludes(cli, expected, 'clean-install proof CLI')
}

function assertPackageManagerBaselineNonClaims(root) {
  const proof = require(path.join(root, 'scripts/lib/go-helper-clean-install-proof.cjs'))
  const summary = proof.runCleanInstallProof({ repoRoot: root, dryRun: true, skipNpmCheck: true })
  assert.equal(summary.ok, true)
  assert.equal(summary.status, 'dry-run-contract-only')
  assert.equal(summary.resultMarker, 'clean-ts-package-install-baseline')
  assert.equal(summary.reviewOnly, true)
  assert.equal(summary.prototype, true)
  assert.equal(summary.nonAvailability, true)
  assert.equal(summary.normalUserAvailability, false)
  assert.equal(summary.nativePackageDelivery, false)
  assert.equal(summary.releaseAsset, false)
  assert.equal(summary.installSource, false)
  assert.equal(summary.packageArtifact, false)
  assert.equal(summary.defaultResolverChanged, false)
  assert.equal(summary.defaultGoChanged, false)
  assert.equal(summary.fallbackDeletionApproved, false)
  assert.equal(summary.package.name, 'pi-agentteam')
  assert.equal(summary.package.version, PACKAGE_VERSION)
  assert.equal(summary.package.tsPiFacade, true)
  assert.equal(summary.npm.pack.ran, false)
  assert.equal(summary.npm.install.ran, false)
  assertCompactNoLeaks(summary, [root], 'clean-install dry-run summary')

  const source = readRel(root, 'scripts/lib/go-helper-clean-install-proof.cjs')
  for (const expected of [
    "'--ignore-scripts'",
    "'--package-lock=false'",
    "'--legacy-peer-deps'",
    "'--no-audit'",
    "'--no-fund'",
    "rootKind: 'os-temp-project-node_modules-package'",
    'pathsRedacted: true',
    'normalUserAvailability: false',
    'nativePackageDelivery: false',
    'defaultResolverChanged: false',
    'fallbackDeletionApproved: false',
  ]) assertIncludes(source, expected, 'package-manager clean-install baseline source')
}

function productionFiles(root) {
  const dirs = ['api', 'app', 'commands', 'core', 'hooks', 'runtime', 'state', 'teamPanel', 'tmux', 'tools', 'adapters']
  const rootFiles = ['index.ts', 'types.ts', 'internalTypes.ts', 'config.ts', 'agents.ts', 'deliveryPolicy.ts', 'messageLifecycle.ts', 'orchestration.ts', 'policy.ts', 'protocol.ts', 'renderers.ts', 'session.ts', 'teamPanel.ts', 'utils.ts', 'workerTurnPrompt.ts']
  const files = []
  for (const rel of rootFiles) if (existsRel(root, rel)) files.push(path.join(root, rel))
  for (const dir of dirs) {
    const full = path.join(root, dir)
    if (fs.existsSync(full)) walkFiles(full, { out: files })
  }
  return files.filter(file => /\.(?:ts|js|cjs|mjs)$/.test(file))
}

function assertNonAppliedLayoutProposalsInert(root) {
  const fixture = require(path.join(root, 'tests/fixtures/kernel/v0634/nonAppliedPackageLayoutProposals.cjs'))
  assert.equal(fixture.FUTURE_APPROVAL, 'requires future explicit leader/user approval before implementation')
  assertSameSet(fixture.packageLayoutProposals.map(proposal => proposal.id), REQUIRED_PROPOSAL_IDS, 'non-applied package layout proposal ids')
  for (const proposal of fixture.packageLayoutProposals) {
    assert.equal(proposal.proposalOnly, true, `${proposal.id} proposalOnly`)
    assert.equal(proposal.nonApplied, true, `${proposal.id} nonApplied`)
    assert.equal(proposal.testOnly, true, `${proposal.id} testOnly`)
    assert.ok(['proposed', 'decision-only', 'deferred', 'rejected'].includes(proposal.status), `${proposal.id} status should stay non-approved`)
    assert.equal(/approved|implemented|released|available|published|uploaded/i.test(proposal.status), false, `${proposal.id} status must not overclaim`)
    assert.equal(proposal.approvalRequirement, fixture.FUTURE_APPROVAL, `${proposal.id} approvalRequirement`)
    assert.equal(proposal.productionResolverUsable, false, `${proposal.id} production resolver usable`)
    assert.equal(proposal.productionImportPath, null, `${proposal.id} production import path`)
    assert.ok(String(proposal.proposalPath).startsWith('tests/fixtures/kernel/v0634/nonAppliedPackageLayoutProposals.cjs#'), `${proposal.id} proposal path should stay fixture-scoped`)
    for (const claim of ['normal-user availability', 'native helper availability', 'package-manager native delivery', 'release asset approval', 'install source approval', 'default Go', 'default resolver', 'fallback deletion', 'signing approval', 'cosign proof', 'SLSA proof', 'second platform support']) {
      assert.ok(proposal.forbiddenClaims.includes(claim), `${proposal.id} forbidden claims should include ${claim}`)
    }
  }

  const forbiddenPatterns = [
    'nonAppliedPackageLayoutProposals',
    'packageLayoutProposals',
    'tests/fixtures/kernel/v0634',
    ...REQUIRED_PROPOSAL_IDS,
  ]
  for (const file of productionFiles(root)) {
    const source = fs.readFileSync(file, 'utf8')
    for (const pattern of forbiddenPatterns) assert.equal(source.includes(pattern), false, `${toRel(root, file)} must not import/read non-applied layout fixture ${pattern}`)
  }
}

function assertPackageNativeAllowlistPreserved(root) {
  const packageJson = assertPackageNoReleaseGuards(root, {
    expectedVersion: PACKAGE_VERSION,
    expectedPiExtensions: ['./index.ts'],
  })
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version should remain frozen')
  const nativeFileEntries = (packageJson.files || [])
    .map(entry => String(entry || '').replace(/^!/, '').replace(/^\//, '').replace(/^\.\//, ''))
    .filter(entry => entry.startsWith('native/'))
  assertSameSet(nativeFileEntries, APPROVED_EMBEDDED_NATIVE_FILES, 'package native file allowlist')
  for (const rel of APPROVED_EMBEDDED_NATIVE_FILES) assert.equal(existsRel(root, rel), true, `${rel} approved embedded native file should exist`)
  assert.equal(existsRel(root, '.agentteam-artifacts'), false, '.agentteam-artifacts must remain absent')
  for (const dependencyBag of [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies]) {
    for (const name of Object.keys(dependencyBag || {})) assert.equal(/node-gyp|prebuild|prebuildify|node-pre-gyp|pkg|napi|native|binary/i.test(name), false, `dependency must not introduce native helper package: ${name}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild\b|postinstall|preinstall|install-time build|package-manager native/i.test(command), false, `${name} must not add native install/download/build mechanics`)
  }
}

function assertDefaultResolverAndControlSurfaceContained(root, env) {
  const kernel = env.helpers.requireDist('core/kernel.js')
  const poisonedEnv = {
    PATH: process.env.PATH || '',
    PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT: '/tmp/install-layout-guard-should-not-read-root',
    PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST: manifestRelPath(),
    PI_AGENTTEAM_KERNEL_PACKAGED_HELPER: '/tmp/install-layout-guard-should-not-run-helper',
  }
  for (const mode of [undefined, 'go']) {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode, env: poisonedEnv })
    const metadata = adapter.metadata().kernel
    const label = mode || 'default'
    assert.equal(metadata.enabled, true, `${label} should use approved embedded helper, not poisoned installed-layout env`)
    assert.equal(metadata.mode, 'go', `${label} mode should stay go via approved embedded helper`)
    assert.equal(metadata.cutoverStatus, 'active', `${label} should be active through approved embedded helper`)
    assert.equal(metadata.calls, 0, `${label} should not call helper before parser invocation`)
  }
  for (const mode of ['disabled', 'typescript', 'auto']) {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode, env: poisonedEnv })
    const metadata = adapter.metadata().kernel
    assert.equal(metadata.enabled, false, `${mode} should not enable installed-layout helper from env`)
    assert.equal(metadata.mode, 'typescript', `${mode} should remain TypeScript without explicit helper`)
    assert.equal(metadata.calls, 0, `${mode} should not call packaged helper`)
  }
  const preview = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: {} }).metadata().kernel
  assert.equal(preview.requestedMode, 'go-packaged-preview')
  assert.equal(preview.enabled, false)
  assert.equal(preview.cutoverStatus, 'unavailable')
  assert.equal(preview.cutoverFailureKind, 'missing-helper')

  const kernelSource = readRel(root, 'core/kernel.ts')
  const resolverSource = readRel(root, 'core/kernelPackagedResolver.ts')
  for (const expected of [
    "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'",
    'const packagedManifestRequested = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath',
    'const helperPath = explicitHelperPath || packagedHelperPath || packagedManifestHelperPath',
    'defaultAgentTeamKernelEmbeddedHelperRoot()',
    'defaultAgentTeamKernelEmbeddedHelperManifestPath()',
    'if (cutoverRequested) return fallback(compactInput)',
  ]) assertIncludes(kernelSource, expected, 'kernel installed-layout/default gating source')
  assert.equal(/package\.json|node_modules|__dirname|process\.cwd\(\)/i.test(kernelSource), false, 'kernel must not discover arbitrary installed package layouts by default')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|postinstall|preinstall|install-time build|curl\b|wget\b|node-gyp|prebuild|download-artifact|hosted-observation|workflow-run|github\.run_id|github\.run_attempt|github\.sha|workflow_dispatch|actions\/download-artifact/i.test(`${kernelSource}\n${resolverSource}`), false, 'runtime/resolver must not contain release/download/install/hosted workflow behavior')

  const readiness = readRel(root, 'commands/readiness.ts')
  const teamCommand = readRel(root, 'commands/team.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'readiness boundary')
  assert.equal(/go-packaged-preview|package-manager|native availability|release asset|signing|cosign|SLSA|install source/i.test(readiness.replace('not normal-user native availability proof', '')), false, 'readiness must not become native/package availability UI')
  assert.equal(/native availability|go-packaged-preview|release|publish|signing|cosign|SLSA/i.test(teamCommand), false, '/team command must not expose native availability/release controls')

  const toolSources = walkFiles(path.join(root, 'tools')).filter(file => file.endsWith('.ts')).map(file => fs.readFileSync(file, 'utf8')).join('\n')
  for (const name of EXPECTED_TOOLS) assertIncludes(toolSources, `name: '${name}'`, 'tool registration surface')
  assert.equal(/\bgo-packaged-preview\b|native availability|release asset|npm publish|package artifact|\bsigning\b|\bcosign\b|\bSLSA\b|artifact download|install source/i.test(toolSources), false, 'tools must not add native/release/signing/package control plane')
}

function assertSupportingSuiteEvidence(root) {
  assertEveryFileExists(root, [
    INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER,
    INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE,
    ...INSTALL_LAYOUT_PATH_SAFETY_SOURCE_FILES,
    ...INSTALL_LAYOUT_PATH_SAFETY_SUPPORTING_DOCS,
    ...INSTALL_LAYOUT_PATH_SAFETY_SUPPORTING_SUITES,
    ...APPROVED_EMBEDDED_NATIVE_FILES,
  ], 'install-layout/path-safety guard')

  const checks = [
    ['tests/suites/go-kernel-v0427-resolver-discovery-contract.cjs', ['isSafePackageRelativePath', 'resolveInstalled', 'unsupported_platform']],
    ['tests/suites/go-kernel-v0633-installed-layout-consumption.cjs', ['runInstalledLayoutConsumptionProof', 'nativeLayoutInjectedAfterInstall', 'nonPreviewModesIgnoredInstalledLayout']],
    ['tests/suites/go-kernel-v0633-installed-layout-fail-closed.cjs', ['unsafe traversal manifest path', 'wrong platform target mismatch', 'installed-preview-smoke-failed']],
    ['tests/suites/go-kernel-v0633-package-manager-clean-install-baseline.cjs', ['runCleanInstallProof', 'nativePackageDelivery', 'packageLockDisabled']],
    ['tests/suites/go-kernel-v0633-package-runtime-guardrails.cjs', ['Runtime/kernel invariants', 'go-packaged-preview', 'package files include only the approved embedded']],
    ['tests/suites/go-kernel-v0634-install-layout-contract.cjs', ['Future Install Layout Resolver Contract', 'package-relative native helper install layout', 'path-unsafe']],
    ['tests/suites/go-kernel-v0634-non-applied-package-layout-fixtures.cjs', ['packageLayoutProposals', 'production sources must not import', 'proposalOnly']],
  ]
  for (const [rel, expectedValues] of checks) {
    const source = readRel(root, rel)
    for (const expected of expectedValues) assertIncludes(source, expected, `${rel} supporting evidence`)
  }
}

async function assertInstallLayoutPathSafetyGuard(root, env) {
  assertEveryFileExists(root, [
    INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER,
    INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE,
    ...INSTALL_LAYOUT_PATH_SAFETY_SOURCE_FILES,
  ], 'install-layout/path-safety guard')

  const checked = new Set()
  const mark = async (category, assertion) => {
    await assertion()
    checked.add(category)
  }

  await mark('installed-layout-platform-tuple-contract', () => assertInstalledLayoutPlatformTupleContract(root, env))
  await mark('package-relative-path-safety-contract', () => assertPackageRelativePathSafetyContract(root, env))
  await mark('resolver-fail-closed-layout-inputs', () => assertResolverFailClosedLayoutInputs(root, env))
  await mark('clean-install-proof-boundaries', () => assertCleanInstallProofBoundaries(root))
  await mark('package-manager-baseline-non-claims', () => assertPackageManagerBaselineNonClaims(root))
  await mark('non-applied-layout-proposals-inert', () => assertNonAppliedLayoutProposalsInert(root))
  await mark('package-native-allowlist-preserved', () => assertPackageNativeAllowlistPreserved(root))
  await mark('default-resolver-and-control-surface-contained', () => assertDefaultResolverAndControlSurfaceContained(root, env))
  await mark('install-layout-supporting-suite-evidence', () => assertSupportingSuiteEvidence(root))

  const checkedCategories = sorted(checked)
  assert.deepEqual(checkedCategories, sorted(INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES), 'install-layout/path-safety guard should execute every category')
  return { checkedCategories }
}

module.exports = {
  INSTALL_LAYOUT_PATH_SAFETY_CATEGORIES,
  INSTALL_LAYOUT_PATH_SAFETY_CATEGORY_DESCRIPTIONS,
  INSTALL_LAYOUT_PATH_SAFETY_GUARD_HELPER,
  INSTALL_LAYOUT_PATH_SAFETY_GUARD_SUITE,
  INSTALL_LAYOUT_PATH_SAFETY_SOURCE_FILES,
  INSTALL_LAYOUT_PATH_SAFETY_SUPPORTING_DOCS,
  INSTALL_LAYOUT_PATH_SAFETY_SUPPORTING_SUITES,
  assertInstallLayoutPathSafetyGuard,
}
