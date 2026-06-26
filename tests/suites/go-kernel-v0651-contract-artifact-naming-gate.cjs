const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ADAPTER_VERSION,
  APPROVED_EMBEDDED_NATIVE_FILES,
  ARTIFACT_NAMING_DECISION_STATUS,
  ARTIFACT_NAMING_OPTIONS,
  CURRENT_NATIVE_BINARY,
  CURRENT_NATIVE_MODULE,
  CURRENT_NATIVE_ROOT,
  CURRENT_NATIVE_TARGET,
  EMBEDDED_HELPER_MANIFEST_PATH,
  HELPER_VERSION,
  KERNEL_CONTRACT_ARTIFACT_NAMING_SCHEMA_VERSION,
  KERNEL_CONTRACT_ARTIFACT_NAMING_THEME,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  REQUIRED_CAPABILITIES,
  TMUX_SNAPSHOT_CAPTURE_MODULE,
  kernelContractArtifactNamingGate,
} = require('../fixtures/kernel/v0651/kernelContractArtifactNamingGate.cjs')

const DOC = 'docs/perf/v0.6.51-contract-constants-artifact-naming-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const CONTRACT = 'core/kernelContract.ts'
const KERNEL = 'core/kernel.ts'
const RESOLVER = 'core/kernelPackagedResolver.ts'
const BUILDER = 'scripts/lib/go-helper-artifact-builder.cjs'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const MANIFEST = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json'
const FIXTURE = 'tests/fixtures/kernel/v0651/kernelContractArtifactNamingGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0651-contract-artifact-naming-gate.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.51 Contract Constants And Artifact Naming Gate',
  'Result: v0.6.51 adds a non-runtime structural gate for shared kernel/helper/native artifact contract constants.',
  '`core/kernelContract.ts` is the TypeScript source of truth for package/helper/protocol/capability/native artifact constants.',
  'Runtime behavior stays unchanged from v0.6.50.',
  'The current embedded runtime path remains `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/agentteam-tmuxSnapshotParse`.',
  'The artifact naming decision status is `deferred-current-path-guarded`.',
  '`agentteamKernel`',
  '`agentteamControlPlaneCore`',
  'No native module path or binary rename is approved in this slice.',
  '`package.json` remains `0.6.8`.',
  '`npm version`',
  '`npm publish`',
  '`tests/fixtures/kernel/v0651/kernelContractArtifactNamingGate.cjs`',
  '`tests/suites/go-kernel-v0651-contract-artifact-naming-gate.cjs`',
  'node tests/run.cjs go-kernel-v0651-contract-artifact-naming-gate',
]
const REQUIRED_ROADMAP = [
  'v0.6.51 contract constants and artifact naming gate',
  'docs/perf/v0.6.51-contract-constants-artifact-naming-gate.md',
  'core/kernelContract.ts',
  'deferred-current-path-guarded',
  'current embedded native path remains `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc`',
  'future broader names such as `agentteamKernel` or `agentteamControlPlaneCore` remain decision options',
  'no native path/binary rename、no runtime migration、no package/release action',
  '**v0.6.51 contract constants and artifact naming gate**',
]
const CURRENT_REQUIRED_CAPABILITIES = [...REQUIRED_CAPABILITIES, 'workerLifecycle']
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'package release approved: true',
  'packageReleaseApproved: true',
  'runtimePathRenameApproved: true',
  'binaryRenameApproved: true',
  'workerLifecycleMigrated: true',
  'stateRepositoryMigrated: true',
  'taskReportPlanRunMigrated: true',
  'teamPanelViewModelMigrated: true',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertNoReleaseOverclaims(source, label) {
  for (const forbidden of RELEASE_OVERCLAIMS) assert.equal(source.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
}

function parseGoCapabilities(source) {
  const body = source.match(/var\s+capabilities\s*=\s*\[\]string\{([^}]+)\}/s)?.[1] || ''
  return [...body.matchAll(/"([^"]+)"/g)].map(match => match[1])
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(kernelContractArtifactNamingGate)), kernelContractArtifactNamingGate, 'fixture should be deterministic plain data')
  assert.equal(kernelContractArtifactNamingGate.schemaVersion, KERNEL_CONTRACT_ARTIFACT_NAMING_SCHEMA_VERSION)
  assert.equal(kernelContractArtifactNamingGate.theme, KERNEL_CONTRACT_ARTIFACT_NAMING_THEME)
  assert.equal(kernelContractArtifactNamingGate.packageName, PACKAGE_NAME)
  assert.equal(kernelContractArtifactNamingGate.packageVersion, PACKAGE_VERSION)
  assert.equal(kernelContractArtifactNamingGate.helperVersion, HELPER_VERSION)
  assert.equal(kernelContractArtifactNamingGate.protocolVersion, PROTOCOL_VERSION)
  assert.equal(kernelContractArtifactNamingGate.adapterVersion, ADAPTER_VERSION)
  assert.deepEqual(kernelContractArtifactNamingGate.requiredCapabilities, [...REQUIRED_CAPABILITIES])
  assert.equal(kernelContractArtifactNamingGate.businessPathsConnected, false)
  assert.equal(kernelContractArtifactNamingGate.currentNativeModule, CURRENT_NATIVE_MODULE)
  assert.equal(kernelContractArtifactNamingGate.tmuxSnapshotCaptureModule, TMUX_SNAPSHOT_CAPTURE_MODULE)
  assert.equal(kernelContractArtifactNamingGate.currentNativeBinary, CURRENT_NATIVE_BINARY)
  assert.equal(kernelContractArtifactNamingGate.currentNativeTarget, CURRENT_NATIVE_TARGET)
  assert.equal(kernelContractArtifactNamingGate.currentNativeRoot, CURRENT_NATIVE_ROOT)
  assert.equal(kernelContractArtifactNamingGate.embeddedHelperManifestPath, EMBEDDED_HELPER_MANIFEST_PATH)
  assert.deepEqual(kernelContractArtifactNamingGate.approvedEmbeddedNativeFiles, [...APPROVED_EMBEDDED_NATIVE_FILES])
  assert.equal(kernelContractArtifactNamingGate.artifactNamingDecisionStatus, ARTIFACT_NAMING_DECISION_STATUS)
  assert.deepEqual(kernelContractArtifactNamingGate.artifactNamingOptions, JSON.parse(JSON.stringify(ARTIFACT_NAMING_OPTIONS)))
  assert.equal(kernelContractArtifactNamingGate.runtimePathRenameApproved, false)
  assert.equal(kernelContractArtifactNamingGate.binaryRenameApproved, false)
  assert.equal(kernelContractArtifactNamingGate.runtimeBehaviorChangedFromV0650, false)
  assert.equal(kernelContractArtifactNamingGate.packageVersionChanged, false)
  assert.equal(kernelContractArtifactNamingGate.packageReleaseApproved, false)
  assert.deepEqual(kernelContractArtifactNamingGate.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(kernelContractArtifactNamingGate.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
}

function assertRuntimeContractModule(env) {
  if (typeof env.helpers.requireDist !== 'function') return
  const contract = env.helpers.requireDist('core/kernelContract.js')
  assert.equal(contract.AGENTTEAM_KERNEL_CONTRACT.schemaVersion, KERNEL_CONTRACT_ARTIFACT_NAMING_SCHEMA_VERSION)
  assert.equal(contract.AGENTTEAM_KERNEL_PACKAGE_NAME, PACKAGE_NAME)
  assert.equal(contract.AGENTTEAM_KERNEL_PACKAGE_VERSION, PACKAGE_VERSION)
  assert.equal(contract.AGENTTEAM_KERNEL_PROTOCOL_VERSION, PROTOCOL_VERSION)
  assert.equal(contract.AGENTTEAM_KERNEL_ADAPTER_VERSION, ADAPTER_VERSION)
  assert.equal(contract.AGENTTEAM_KERNEL_HELPER_VERSION, HELPER_VERSION)
  assert.deepEqual(contract.AGENTTEAM_KERNEL_CAPABILITIES, CURRENT_REQUIRED_CAPABILITIES)
  assert.equal(contract.AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED, false)
  assert.equal(contract.AGENTTEAM_KERNEL_CURRENT_NATIVE_MODULE, CURRENT_NATIVE_MODULE)
  assert.equal(contract.AGENTTEAM_KERNEL_TMUX_SNAPSHOT_CAPTURE_MODULE, TMUX_SNAPSHOT_CAPTURE_MODULE)
  assert.equal(contract.AGENTTEAM_KERNEL_CURRENT_NATIVE_BINARY, CURRENT_NATIVE_BINARY)
  assert.equal(contract.AGENTTEAM_KERNEL_CURRENT_NATIVE_TARGET, CURRENT_NATIVE_TARGET)
  assert.equal(contract.AGENTTEAM_KERNEL_CURRENT_NATIVE_ROOT, CURRENT_NATIVE_ROOT)
  assert.equal(contract.AGENTTEAM_KERNEL_EMBEDDED_HELPER_MANIFEST_PATH, EMBEDDED_HELPER_MANIFEST_PATH)
  assert.deepEqual(contract.AGENTTEAM_KERNEL_APPROVED_EMBEDDED_NATIVE_FILES, [...APPROVED_EMBEDDED_NATIVE_FILES])
  assert.equal(contract.AGENTTEAM_KERNEL_ARTIFACT_NAMING_DECISION.status, ARTIFACT_NAMING_DECISION_STATUS)
  assert.equal(contract.AGENTTEAM_KERNEL_ARTIFACT_NAMING_DECISION.runtimePathRenameApproved, false)
  assert.equal(contract.AGENTTEAM_KERNEL_ARTIFACT_NAMING_DECISION.binaryRenameApproved, false)
  assert.deepEqual(contract.AGENTTEAM_KERNEL_ARTIFACT_NAMING_DECISION.futureOptions, JSON.parse(JSON.stringify(ARTIFACT_NAMING_OPTIONS)))

  const kernel = env.helpers.requireDist('core/kernel.js')
  const resolver = env.helpers.requireDist('core/kernelPackagedResolver.js')
  assert.strictEqual(kernel.AGENTTEAM_KERNEL_PROTOCOL_VERSION, contract.AGENTTEAM_KERNEL_PROTOCOL_VERSION)
  assert.strictEqual(kernel.AGENTTEAM_KERNEL_HELPER_VERSION, contract.AGENTTEAM_KERNEL_HELPER_VERSION)
  assert.strictEqual(kernel.AGENTTEAM_KERNEL_ADAPTER_VERSION, contract.AGENTTEAM_KERNEL_ADAPTER_VERSION)
  assert.strictEqual(kernel.AGENTTEAM_KERNEL_CAPABILITIES, contract.AGENTTEAM_KERNEL_CAPABILITIES)
  assert.strictEqual(kernel.AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED, contract.AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED)
  assert.strictEqual(resolver.AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_NAME, contract.AGENTTEAM_KERNEL_PACKAGE_NAME)
  assert.strictEqual(resolver.AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_VERSION, contract.AGENTTEAM_KERNEL_PACKAGE_VERSION)
  assert.strictEqual(resolver.AGENTTEAM_PACKAGED_RESOLVER_MODULE, contract.AGENTTEAM_KERNEL_CURRENT_NATIVE_MODULE)
  assert.strictEqual(resolver.AGENTTEAM_PACKAGED_RESOLVER_PROTOCOL_VERSION, contract.AGENTTEAM_KERNEL_PROTOCOL_VERSION)
  assert.strictEqual(resolver.AGENTTEAM_PACKAGED_RESOLVER_HELPER_VERSION, contract.AGENTTEAM_KERNEL_HELPER_VERSION)
  assert.strictEqual(resolver.AGENTTEAM_PACKAGED_RESOLVER_CAPABILITIES, contract.AGENTTEAM_KERNEL_CAPABILITIES)
  assert.strictEqual(resolver.AGENTTEAM_PACKAGED_RESOLVER_BUSINESS_PATHS_CONNECTED, contract.AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED)
  assert.equal(kernel.defaultAgentTeamKernelEmbeddedHelperManifestPath(), EMBEDDED_HELPER_MANIFEST_PATH)
}

function assertSourcesUseContract(root) {
  const contract = read(root, CONTRACT)
  const kernel = read(root, KERNEL)
  const resolver = read(root, RESOLVER)
  assertIncludes(contract, `AGENTTEAM_KERNEL_PACKAGE_VERSION = '${PACKAGE_VERSION}'`, CONTRACT)
  assertIncludes(contract, `AGENTTEAM_KERNEL_CURRENT_NATIVE_MODULE = '${CURRENT_NATIVE_MODULE}'`, CONTRACT)
  assertIncludes(contract, `AGENTTEAM_KERNEL_ARTIFACT_NAMING_DECISION_STATUS = '${ARTIFACT_NAMING_DECISION_STATUS}'`, CONTRACT)
  assertIncludes(kernel, "from './kernelContract.js'", KERNEL)
  assertIncludes(resolver, "from './kernelContract.js'", RESOLVER)
  assert.equal(/export const AGENTTEAM_KERNEL_PROTOCOL_VERSION\s*=\s*1\b/.test(kernel), false, `${KERNEL} should not duplicate protocol constant literal`)
  assert.equal(/export const AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_VERSION\s*=\s*'0\.6\.8'/.test(resolver), false, `${RESOLVER} should not duplicate package version literal`)
  assert.equal(/export const AGENTTEAM_PACKAGED_RESOLVER_CAPABILITIES\s*=\s*\[/.test(resolver), false, `${RESOLVER} should not duplicate capabilities array`)
}

function assertPackageManifestGoBuilderDriftGuards(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, PACKAGE_NAME)
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.optionalDependencies, undefined)
  assert.equal(packageJson.bundleDependencies, undefined)
  assert.equal(packageJson.bundledDependencies, undefined)
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  assert.deepEqual(packageJson.files.filter(file => String(file).startsWith('native/')), [...APPROVED_EMBEDDED_NATIVE_FILES])
  for (const rel of APPROVED_EMBEDDED_NATIVE_FILES) assert.equal(exists(root, rel), true, `${rel} should exist`)
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)

  const manifest = JSON.parse(read(root, MANIFEST))
  assert.equal(manifest.packageName, PACKAGE_NAME)
  assert.equal(manifest.packageVersion, PACKAGE_VERSION)
  assert.equal(manifest.module, CURRENT_NATIVE_MODULE)
  assert.equal(manifest.helperVersion, HELPER_VERSION)
  assert.equal(manifest.protocolVersion, PROTOCOL_VERSION)
  assert.deepEqual(manifest.capabilities, CURRENT_REQUIRED_CAPABILITIES)
  assert.equal(manifest.businessPathsConnected, false)
  assert.equal(manifest.target, CURRENT_NATIVE_TARGET)
  assert.equal(manifest.artifact.path, `${CURRENT_NATIVE_ROOT}/${CURRENT_NATIVE_BINARY}`)
  assert.equal(manifest.artifact.filename, CURRENT_NATIVE_BINARY)
  assert.equal(manifest.files.manifest, EMBEDDED_HELPER_MANIFEST_PATH)
  assert.deepEqual(Object.values(manifest.files).sort(), [...APPROVED_EMBEDDED_NATIVE_FILES].sort())

  const goSource = read(root, GO_SOURCE)
  assert.equal(Number(goSource.match(/const\s+protocolVersion\s*=\s*(\d+)/)?.[1]), PROTOCOL_VERSION)
  assert.equal(goSource.match(/const\s+helperVersion\s*=\s*"([^"]+)"/)?.[1], HELPER_VERSION)
  assert.deepEqual(parseGoCapabilities(goSource), CURRENT_REQUIRED_CAPABILITIES)
  assert.match(goSource, /case "tmuxSnapshotParse"/, 'Go helper should still expose current parser module')
  assert.match(goSource, /case "tmuxSnapshotCapture"/, 'Go helper should still expose capture module')

  const builder = read(root, BUILDER)
  assert.match(builder, /const MODULE = 'tmuxSnapshotParse'/, 'builder should still emit current module path')
  assert.match(builder, /const PACKAGE_NAME = 'pi-agentteam'/, 'builder package name should remain guarded')
  assert.match(builder, /const HELPER_BASE = 'agentteam-tmuxSnapshotParse'/, 'builder should still emit current helper binary name')
  assert.equal(builder.includes('agentteamKernel'), false, 'builder must not silently rename runtime artifact path')
  assert.equal(builder.includes('agentteamControlPlaneCore'), false, 'builder must not silently rename runtime artifact path')
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  assert.equal(exists(root, ROADMAP), true, `${ROADMAP} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoReleaseOverclaims(doc, DOC)
  assertNoReleaseOverclaims(roadmap, ROADMAP)
}

function assertNoRuntimeMigration(root) {
  const kernel = read(root, KERNEL)
  const goSource = read(root, GO_SOURCE)
  assertIncludes(kernel, "callHelper<unknown>('tmuxSnapshotParse', { stdout, capturedAt })", KERNEL)
  assertIncludes(kernel, "callHelper<unknown>('tmuxSnapshotCapture', { capturedAt })", KERNEL)
  for (const forbidden of ['stateRepository', 'teamPanelViewModel', 'packageReleaseVerify']) {
    assert.equal(goSource.includes(forbidden), false, `${GO_SOURCE} must not migrate ${forbidden}`)
  }
  assert.equal(/case\s+"inspectPane"/.test(goSource), true, `${GO_SOURCE} workerLifecycle must keep inspectPane read-only`)
  assert.equal(/case\s+"listAgentTeamPanes"/.test(goSource), true, `${GO_SOURCE} workerLifecycle may include v0.6.54 read-only listAgentTeamPanes`)
  assert.equal(/case\s+"taskReportPlanRun"/.test(goSource), false, `${GO_SOURCE} must not add taskReportPlanRun RPC handling`)
  for (const forbidden of ['agentteamKernel/<helperVersion>', 'agentteamControlPlaneCore/<helperVersion>']) {
    assert.equal(read(root, 'package.json').includes(forbidden), false, 'package files must not include future artifact paths yet')
  }
}

module.exports = {
  name: 'Go kernel v0.6.51 contract constants and artifact naming gate',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertRuntimeContractModule(env)
    assertSourcesUseContract(root)
    assertPackageManifestGoBuilderDriftGuards(root)
    assertDocs(root)
    assertNoRuntimeMigration(root)
  },
}
