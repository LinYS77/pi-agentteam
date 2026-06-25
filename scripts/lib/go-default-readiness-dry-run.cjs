const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_GO_READINESS_DRY_RUN_RESULT_MARKER = 'default-go-readiness-dry-run'
const LEDGER_RELATIVE_PATH = 'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs'
const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const EXPECTED_PI_EXTENSIONS = Object.freeze(['./index.ts'])
const EXPECTED_KERNEL_MODES = Object.freeze(['default', 'disabled', 'typescript', 'go', 'auto', 'go-cutover', 'go-packaged-preview'])
const EXPECTED_WORKFLOW_FILES = Object.freeze(['go-helper-review-artifact.yml'])
const STATIC_FACT_FILES = Object.freeze([
  'package.json',
  'index.ts',
  'core/kernel.ts',
  'commands/readiness.ts',
  '.github/workflows/go-helper-review-artifact.yml',
  LEDGER_RELATIVE_PATH,
])
const FALSE_AVAILABILITY_FLAGS = Object.freeze({
  ready: false,
  modeChange: false,
  defaultGo: false,
  defaultResolver: false,
  nativePackageDelivery: false,
  normalUserNativeAvailability: false,
  fallbackDeletion: false,
  packageReleaseApproved: false,
  installSourceApproved: false,
  signingApproved: false,
  secondPlatformSupport: false,
})
const LEDGER_FALSE_FIELDS = Object.freeze([
  'ready',
  'modeChange',
  'defaultGo',
  'defaultResolver',
  'normalUserNativeAvailability',
  'fallbackDeletion',
  'packageReleaseApproved',
  'signingApproved',
  'secondPlatformSupport',
])
const PACKAGE_FORBIDDEN_FIELDS = Object.freeze([
  'main',
  'exports',
  'types',
  'optionalDependencies',
  'bundledDependencies',
  'bundleDependencies',
  'agentteamGoHelper',
  'binary',
  'os',
  'cpu',
  'native',
  'nativeHelper',
])
const PACKAGE_FORBIDDEN_LIFECYCLE_SCRIPTS = Object.freeze([
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepublish',
  'prepublishOnly',
  'publish',
  'postpublish',
  'prepack',
  'postpack',
])
const ROOT_FORBIDDEN_FILES = Object.freeze([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
])
const ROOT_FORBIDDEN_ARTIFACT = /^(?:pi-agentteam-.*\.tgz|.*\.(?:exe|dll|so|dylib|tgz|tar|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig))$/i

class DefaultGoReadinessDryRunError extends Error {
  constructor(failureKind, hint) {
    super(failureKind)
    this.name = 'DefaultGoReadinessDryRunError'
    this.failureKind = compactToken(failureKind, 'repo-fact-invalid')
    this.hint = compactToken(hint, 'dry-run')
  }
}

function defaultRepoRoot() {
  return path.resolve(__dirname, '..', '..')
}

function compactToken(value, fallback) {
  const compacted = String(value ?? '').replace(/[^a-zA-Z0-9_.:/ -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100)
  return compacted || fallback
}

function fail(failureKind, hint) {
  throw new DefaultGoReadinessDryRunError(failureKind, hint)
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function repoPath(repoRoot, relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'))
}

function readText(repoRoot, relativePath) {
  try {
    return fs.readFileSync(repoPath(repoRoot, relativePath), 'utf8')
  } catch (_) {
    fail('repo-fact-missing', relativePath)
  }
}

function exists(repoRoot, relativePath) {
  return fs.existsSync(repoPath(repoRoot, relativePath))
}

function readPackageJson(repoRoot) {
  try {
    const parsed = JSON.parse(readText(repoRoot, 'package.json'))
    if (!isRecord(parsed)) fail('package-json-invalid', 'package-json')
    return parsed
  } catch (error) {
    if (error instanceof DefaultGoReadinessDryRunError) throw error
    fail('package-json-invalid', 'package-json')
  }
}

function assertIncludes(source, snippet, failureKind, hint) {
  if (!source.includes(snippet)) fail(failureKind, hint)
}

function assertAbsentOwnKeys(record, keys, failureKind) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) fail(failureKind, key)
  }
}

function loadLedger(repoRoot) {
  let fixture
  try {
    fixture = require(repoPath(repoRoot, LEDGER_RELATIVE_PATH))
  } catch (_) {
    fail('ledger-unreadable', 'slice-2-ledger')
  }

  const ledger = fixture.defaultGoReadinessLedger
  const blockedStatus = fixture.BLOCKED
  const expectedIds = fixture.DEFAULT_GO_BLOCKER_IDS
  if (!isRecord(ledger) || !Array.isArray(ledger.blockers) || !Array.isArray(expectedIds)) fail('ledger-invalid', 'ledger-shape')
  if (blockedStatus !== 'blocked') fail('ledger-invalid', 'blocked-status')
  for (const field of LEDGER_FALSE_FIELDS) {
    if (ledger[field] !== false) fail('ledger-overclaims', field)
  }
  if (ledger.noSilentWaiver !== true) fail('ledger-overclaims', 'noSilentWaiver')
  const blockerIds = ledger.blockers.map(blocker => blocker && blocker.id)
  if (JSON.stringify(blockerIds) !== JSON.stringify(expectedIds)) fail('ledger-invalid', 'blocker-ids')
  for (const blocker of ledger.blockers) {
    if (!isRecord(blocker)) fail('ledger-invalid', 'blocker-shape')
    if (blocker.status !== blockedStatus) fail('ledger-overclaims', blocker.id)
    if (blocker.requiredBeforeDefaultGo !== true) fail('ledger-overclaims', `${blocker.id}:required`)
    if (blocker.waivableByRepoStateAlone !== false) fail('ledger-overclaims', `${blocker.id}:waiver`)
  }
  return { ledger, blockedStatus, expectedIds }
}

function collectPackageFacts(repoRoot) {
  const packageJson = readPackageJson(repoRoot)
  if (packageJson.name !== PACKAGE_NAME) fail('package-invariant-changed', 'name')
  if (packageJson.version !== PACKAGE_VERSION) fail('package-invariant-changed', 'version')
  if (packageJson.type !== 'module') fail('package-invariant-changed', 'type')
  if (JSON.stringify(packageJson.pi?.extensions) !== JSON.stringify(EXPECTED_PI_EXTENSIONS)) fail('package-invariant-changed', 'pi.extensions')
  if (!exists(repoRoot, 'index.ts')) fail('package-invariant-changed', 'index.ts')
  assertAbsentOwnKeys(packageJson, PACKAGE_FORBIDDEN_FIELDS, 'package-native-metadata-present')
  if (Object.keys(packageJson.dependencies || {}).length !== 0) fail('package-invariant-changed', 'dependencies')
  for (const scriptName of PACKAGE_FORBIDDEN_LIFECYCLE_SCRIPTS) {
    if (Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, scriptName)) fail('package-lifecycle-present', scriptName)
  }
  return {
    name: packageJson.name,
    version: packageJson.version,
    type: packageJson.type,
    piExtensions: [...packageJson.pi.extensions],
    piExtensionEntrypoint: './index.ts',
    piExtensionEntrypointExists: true,
    dependenciesAbsent: true,
    nativeMetadataAbsent: true,
    nativeLifecycleScriptsAbsent: true,
    packageManagerNativeDeliveryMetadata: false,
  }
}

function collectKernelFacts(repoRoot) {
  const kernel = readText(repoRoot, 'core/kernel.ts')
  assertIncludes(kernel, "export type AgentTeamKernelKnownMode = 'default' | 'disabled' | 'typescript' | 'go' | 'auto' | 'go-cutover' | 'go-packaged-preview'", 'kernel-invariant-changed', 'known-modes')
  assertIncludes(kernel, "const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)", 'kernel-invariant-changed', 'requested-mode')
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel-invariant-changed', 'packaged-preview')
  assertIncludes(kernel, "const defaultCutoverRequested = defaultRequested || requestedMode === 'go'", 'kernel-invariant-changed', 'default-cutover')
  assertIncludes(kernel, "const packagedResolverRequested = packagedPreviewRequested || defaultCutoverRequested", 'kernel-invariant-changed', 'packaged-resolver')
  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperManifestPath()', 'kernel-invariant-changed', 'embedded-manifest')
  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperRoot()', 'kernel-invariant-changed', 'embedded-root')
  assertIncludes(kernel, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel-invariant-changed', 'cutover-request')
  assertIncludes(kernel, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const", 'kernel-invariant-changed', 'cutover-module')
  assertIncludes(kernel, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'kernel-invariant-changed', 'fingerprint-fallback')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'kernel-invariant-changed', 'fingerprint-non-cutover')
  return {
    knownModes: [...EXPECTED_KERNEL_MODES],
    defaultUnsetMode: 'default',
    defaultRuntime: 'go/embedded-helper',
    defaultResolverEnabled: true,
    defaultResolverSource: 'approved-embedded-helper-manifest',
    goPackagedPreviewExplicitOnly: true,
    goCutoverExplicitOnly: true,
    cutoverModule: 'tmuxSnapshotParse',
    compactReadModelFingerprintFallbackRetained: true,
  }
}

function collectReadinessFacts(repoRoot) {
  const readiness = readText(repoRoot, 'commands/readiness.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'readiness-invariant-changed', 'reviewer-only')
  return {
    reviewerDiagnosticsOnly: true,
    normalUserNativeAvailabilityProof: false,
    defaultGoControl: false,
    defaultResolverControl: false,
  }
}

function collectWorkflowFacts(repoRoot) {
  let workflowFiles
  try {
    workflowFiles = fs.readdirSync(repoPath(repoRoot, '.github/workflows')).filter(name => name.endsWith('.yml') || name.endsWith('.yaml')).sort()
  } catch (_) {
    fail('workflow-invariant-changed', 'workflows')
  }
  if (JSON.stringify(workflowFiles) !== JSON.stringify(EXPECTED_WORKFLOW_FILES)) fail('workflow-invariant-changed', 'workflow-files')
  const workflow = readText(repoRoot, '.github/workflows/go-helper-review-artifact.yml')
  if ((workflow.match(/target:\s+linux-x64-glibc/g) || []).length !== 2) fail('workflow-invariant-changed', 'linux-x64-glibc')
  if (/target:\s+(?!linux-x64-glibc\b)[a-z0-9-]+/i.test(workflow)) fail('workflow-invariant-changed', 'second-platform-target')
  if (/macos-|windows-|arm64|musl|darwin|win32/i.test(workflow)) fail('workflow-invariant-changed', 'second-platform-term')
  return {
    workflowFiles,
    reviewArtifactWorkflowPresent: true,
    reviewArtifactTarget: 'linux-x64-glibc',
    secondPlatformMatrix: false,
    hostedWorkflowQueried: false,
  }
}

function collectRootArtifactFacts(repoRoot) {
  let rootNames
  try {
    rootNames = fs.readdirSync(repoRoot)
  } catch (_) {
    fail('repo-root-unreadable', 'repo-root')
  }
  const forbidden = []
  for (const relativePath of ROOT_FORBIDDEN_FILES) {
    if (exists(repoRoot, relativePath)) forbidden.push(relativePath)
  }
  for (const name of rootNames) {
    if (ROOT_FORBIDDEN_ARTIFACT.test(name)) forbidden.push(name)
  }
  const uniqueForbidden = [...new Set(forbidden)].sort()
  if (uniqueForbidden.length > 0) fail('root-artifact-present', uniqueForbidden[0])
  return {
    rootForbiddenArtifactsAbsent: true,
    rootForbiddenArtifactCount: 0,
    checkedRootOnly: true,
  }
}

function collectRepoFacts(repoRoot) {
  return {
    checkedFiles: [...STATIC_FACT_FILES],
    packageJson: collectPackageFacts(repoRoot),
    kernel: collectKernelFacts(repoRoot),
    readiness: collectReadinessFacts(repoRoot),
    workflows: collectWorkflowFacts(repoRoot),
    artifacts: collectRootArtifactFacts(repoRoot),
  }
}

function compactBlockers(ledgerData) {
  if (!ledgerData) return { blockerCount: 0, blockedIds: [], blockers: [] }
  const { ledger, blockedStatus } = ledgerData
  const blockers = ledger.blockers.map(blocker => ({
    id: blocker.id,
    status: blocker.status,
    requiredBeforeDefaultGo: blocker.requiredBeforeDefaultGo,
    waivableByRepoStateAlone: blocker.waivableByRepoStateAlone,
  }))
  const blockedIds = blockers.filter(blocker => blocker.status === blockedStatus).map(blocker => blocker.id)
  return { blockerCount: blockedIds.length, blockedIds, blockers }
}

function buildDiagnostics(extra = {}) {
  return {
    pathsRedacted: true,
    rawOutputIncluded: false,
    stackIncluded: false,
    dryRun: true,
    repoMutation: false,
    envMutation: false,
    networkAccess: false,
    helperExecution: false,
    ...extra,
  }
}

function buildSummary({ ok, ledgerData, repoFacts, diagnostic }) {
  const blockerSummary = compactBlockers(ledgerData)
  const ledger = ledgerData?.ledger
  return {
    ok,
    resultMarker: DEFAULT_GO_READINESS_DRY_RUN_RESULT_MARKER,
    ...FALSE_AVAILABILITY_FLAGS,
    noSilentWaiver: true,
    reviewOnly: true,
    prototype: true,
    ledger: ledger ? {
      schemaVersion: ledger.schemaVersion,
      theme: ledger.theme,
      module: ledger.module,
      ready: false,
      allBlockersBlocked: blockerSummary.blockerCount === ledger.blockers.length,
    } : {
      ready: false,
      allBlockersBlocked: false,
    },
    ...blockerSummary,
    repoFacts: repoFacts || {},
    diagnostics: buildDiagnostics(diagnostic),
  }
}

function failClosedSummary(error, ledgerData) {
  const diagnostic = error instanceof DefaultGoReadinessDryRunError
    ? { failureKind: error.failureKind, hint: error.hint }
    : { failureKind: 'unexpected-verifier-error', hint: 'unexpected' }
  return buildSummary({ ok: false, ledgerData, repoFacts: {}, diagnostic })
}

function verifyDefaultGoReadinessDryRun(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || defaultRepoRoot())
  let ledgerData
  try {
    ledgerData = loadLedger(repoRoot)
    const repoFacts = collectRepoFacts(repoRoot)
    return buildSummary({ ok: true, ledgerData, repoFacts })
  } catch (error) {
    return failClosedSummary(error, ledgerData)
  }
}

function createFailClosedDefaultGoReadinessDryRunSummary(failureKind, hint) {
  return failClosedSummary(new DefaultGoReadinessDryRunError(failureKind, hint), undefined)
}

function formatDefaultGoReadinessDryRunText(summary) {
  const lines = [
    `${summary.resultMarker} ok=${summary.ok} ready=${summary.ready}`,
    `defaultGo=${summary.defaultGo} defaultResolver=${summary.defaultResolver} nativePackageDelivery=${summary.nativePackageDelivery}`,
    `normalUserNativeAvailability=${summary.normalUserNativeAvailability} fallbackDeletion=${summary.fallbackDeletion}`,
    `packageReleaseApproved=${summary.packageReleaseApproved} installSourceApproved=${summary.installSourceApproved} signingApproved=${summary.signingApproved} secondPlatformSupport=${summary.secondPlatformSupport}`,
    `reviewOnly=${summary.reviewOnly} prototype=${summary.prototype} noSilentWaiver=${summary.noSilentWaiver}`,
    `blockerCount=${summary.blockerCount} blockedIds=${summary.blockedIds.join(',')}`,
  ]
  if (!summary.ok) lines.push(`diagnostic=${summary.diagnostics.failureKind}:${summary.diagnostics.hint}`)
  return `${lines.join('\n')}\n`
}

module.exports = {
  DEFAULT_GO_READINESS_DRY_RUN_RESULT_MARKER,
  DefaultGoReadinessDryRunError,
  createFailClosedDefaultGoReadinessDryRunSummary,
  formatDefaultGoReadinessDryRunText,
  verifyDefaultGoReadinessDryRun,
}
