const cp = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const builder = require('./go-helper-artifact-builder.cjs')
const verifier = require('./go-helper-artifact-verifier.cjs')

const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const RESULT_MARKER = 'clean-ts-package-install-baseline'
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'
const REQUIRED_INSTALLED_FILES = [
  'package.json',
  'index.ts',
  'types.ts',
  'core/kernel.ts',
  'core/kernelPackagedResolver.ts',
  'api/tools.ts',
  'api/commands.ts',
  'config.example.json',
  'README.md',
  'LICENSE',
]
const FORBIDDEN_PACKAGE_KEYS = [
  'optionalDependencies',
  'bundledDependencies',
  'bundleDependencies',
  'agentteamGoHelper',
  'binary',
  'os',
  'cpu',
]
const LIFECYCLE_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepublish',
  'prepublishOnly',
  'publish',
  'postpublish',
]
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]
const FAILURE_KINDS = new Set([
  'repo-package-invalid',
  'npm-unavailable',
  'npm-pack-failed',
  'npm-pack-invalid',
  'npm-install-failed',
  'installed-package-missing',
  'installed-package-invalid',
  'installed-surface-invalid',
  'package-metadata-invalid',
  'artifact-build-failed',
  'artifact-verification-failed',
  'installed-layout-copy-failed',
  'installed-code-load-failed',
  'installed-preview-smoke-failed',
  'cleanup-failed',
])

class CleanInstallProofError extends Error {
  constructor(failureKind, remediation, hint, details = {}) {
    super(failureKind)
    this.name = 'CleanInstallProofError'
    this.failureKind = failureKind
    this.remediation = remediation
    this.hint = hint
    this.details = details
  }

  toDiagnostic() {
    return compactFailure(this.failureKind, this.remediation, this.hint, this.details)
  }
}

function compactFailure(failureKind, remediation, hint, details = {}) {
  if (!FAILURE_KINDS.has(failureKind)) throw new Error(`unexpected failureKind ${failureKind}`)
  return {
    ok: false,
    status: 'unavailable',
    resultMarker: 'fail-closed',
    failureKind,
    remediation,
    hint,
    reviewOnly: true,
    prototype: true,
    nonAvailability: true,
    normalUserAvailability: false,
    nativePackageDelivery: false,
    defaultResolverChanged: false,
    ...(Number.isFinite(details.exitCode) ? { exitCode: details.exitCode } : {}),
  }
}

function fail(failureKind, remediation, hint, details) {
  throw new CleanInstallProofError(failureKind, remediation, hint, details)
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
}

function readJson(filePath, failureKind, hint) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!isRecord(parsed)) fail(failureKind, 'inspect package metadata and rerun clean-install proof', hint)
    return parsed
  } catch (error) {
    if (error instanceof CleanInstallProofError) throw error
    fail(failureKind, 'inspect package metadata and rerun clean-install proof', hint)
  }
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function spawnNpm(args, cwd) {
  return cp.spawnSync('npm', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
    },
  })
}

function assertNpmAvailable(repoRoot) {
  const result = spawnNpm(['--version'], repoRoot)
  if (result.error || result.status !== 0) {
    fail('npm-unavailable', 'install npm and rerun temp clean-install proof', 'npm')
  }
  return String(result.stdout || '').trim().split('\n')[0].trim()
}

function assertRepoPackage(repoRoot) {
  const packageJson = readJson(path.join(repoRoot, 'package.json'), 'repo-package-invalid', 'repo-package-json')
  if (packageJson.name !== PACKAGE_NAME) fail('repo-package-invalid', 'run proof from the pi-agentteam repository root', 'package-name')
  if (packageJson.version !== PACKAGE_VERSION) fail('repo-package-invalid', 'preserve package.json version 0.6.8 for v0.6.33 baseline', 'package-version')
  assertPackageMetadata(packageJson, 'repo')
  for (const rel of ROOT_FORBIDDEN_FILES) {
    if (exists(repoRoot, rel)) fail('repo-package-invalid', 'remove lockfiles or Go module files before clean-install baseline proof', rel)
  }
  return packageJson
}

function assertPackageMetadata(packageJson, scope) {
  for (const key of FORBIDDEN_PACKAGE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(packageJson, key)) {
      fail('package-metadata-invalid', 'remove native package metadata before clean-install baseline proof', `${scope}:${key}`)
    }
  }
  for (const lifecycle of LIFECYCLE_SCRIPTS) {
    if (Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle)) {
      fail('package-metadata-invalid', 'remove lifecycle hooks before clean-install baseline proof', `${scope}:${lifecycle}`)
    }
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    if (/npm\s+(?:publish|version)\b/.test(command)) fail('package-metadata-invalid', 'remove publish/version script behavior', `${scope}:${name}`)
    if (/npm\s+pack\b/.test(command) && !packAllowed) fail('package-metadata-invalid', 'remove package-producing script behavior', `${scope}:${name}`)
    if (/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild|postinstall|preinstall|install-time build/i.test(command)) {
      fail('package-metadata-invalid', 'remove native helper build/download/install behavior from scripts', `${scope}:${name}`)
    }
  }
  if ((packageJson.files || []).some(item => /(?:github|workflow|helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|hosted-observation|record|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX))) {
    fail('package-metadata-invalid', 'keep unapproved native/generated/helper artifacts out of package files metadata', `${scope}:files`)
  }
}

function findPackedTarball(packRoot) {
  const tarballs = fs.readdirSync(packRoot).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort()
  if (tarballs.length !== 1) fail('npm-pack-invalid', 'ensure npm pack emits exactly one local temp tarball', 'tarball-count')
  return path.join(packRoot, tarballs[0])
}

function parsePackJson(stdout) {
  try {
    const parsed = JSON.parse(stdout)
    if (!Array.isArray(parsed) || !isRecord(parsed[0])) return undefined
    return parsed[0]
  } catch (_) {
    return undefined
  }
}

function assertInstalledSurface(installedRoot, options = {}) {
  const allFiles = walkFiles(installedRoot).map(file => toPosix(path.relative(installedRoot, file))).sort()
  const requiredMissing = REQUIRED_INSTALLED_FILES.filter(rel => !allFiles.includes(rel))
  if (requiredMissing.length > 0) fail('installed-surface-invalid', 'ensure TS/pi facade files are included in package files allowlist', 'required-files')

  const forbiddenNames = /(?:^|\/)(?:artifact-index|review-artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|native-manifest|agentteam-native-manifest|generated-manifest|artifact-manifest|workflow-summary|verifier-output|hosted-observation-record|workflow-run|raw-payload|api-payload)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|md)$/i
  const allowNativeLayout = Boolean(options.allowNativeLayout)
  const forbidden = allFiles.filter(rel => {
    if (rel === 'package.json' || rel === 'LICENSE') return false
    if (rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX)) return false
    return rel === '.agentteam-artifacts'
      || rel.startsWith('.agentteam-artifacts/')
      || (!allowNativeLayout && (rel === 'native' || rel.startsWith('native/')))
      || /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|go\.mod|go\.sum)$/i.test(rel)
      || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel)
      || forbiddenNames.test(rel)
  })
  if (forbidden.length > 0) fail('installed-surface-invalid', 'remove native/generated/package artifacts from installed package surface', 'forbidden-installed-files')

  return {
    fileCount: allFiles.length,
    requiredFiles: [...REQUIRED_INSTALLED_FILES],
    requiredFilesPresent: true,
    nativeHelperLayoutPresent: allFiles.some(rel => rel === 'native' || rel.startsWith('native/')),
    generatedArtifactsPresent: false,
    lockfilesPresent: false,
    nativeArchivesOrBinariesPresent: false,
  }
}

function createCleanInstallWorkspace(repoRoot, options = {}) {
  assertRepoPackage(repoRoot)

  const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0633-pack-'))
  const installProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0633-install-'))
  const tempRoots = { packRoot, installProjectRoot }
  if (typeof options.onTempRoots === 'function') options.onTempRoots({ ...tempRoots })

  const pack = spawnNpm(['pack', repoRoot, '--ignore-scripts', '--pack-destination', packRoot, '--json'], repoRoot)
  if (pack.error || pack.status !== 0) fail('npm-pack-failed', 'rerun npm pack clean-install baseline locally with scripts ignored', 'npm-pack', { exitCode: pack.status })
  const packed = parsePackJson(pack.stdout)
  const tarballPath = findPackedTarball(packRoot)
  if (!fs.existsSync(tarballPath)) fail('npm-pack-invalid', 'ensure local temp npm tarball exists before install', 'tarball')

  fs.writeFileSync(path.join(installProjectRoot, 'package.json'), `${JSON.stringify({ private: true, name: 'agentteam-v0633-clean-install-temp' }, null, 2)}\n`, 'utf8')
  const installArgs = [
    'install',
    tarballPath,
    '--ignore-scripts',
    '--package-lock=false',
    '--legacy-peer-deps',
    '--no-audit',
    '--no-fund',
  ]
  const install = spawnNpm(installArgs, installProjectRoot)
  if (install.error || install.status !== 0) fail('npm-install-failed', 'rerun npm install from local temp tarball with scripts ignored', 'npm-install', { exitCode: install.status })

  const installedRoot = path.join(installProjectRoot, 'node_modules', PACKAGE_NAME)
  if (!fs.existsSync(installedRoot) || !fs.statSync(installedRoot).isDirectory()) {
    fail('installed-package-missing', 'ensure npm installed the local temp tarball package under node_modules', 'installed-root')
  }
  if (fs.existsSync(path.join(installProjectRoot, 'package-lock.json')) || fs.existsSync(path.join(installProjectRoot, 'npm-shrinkwrap.json'))) {
    fail('installed-surface-invalid', 'keep temp install package-lock disabled', 'temp-lockfile')
  }

  const installedPackageJson = readJson(path.join(installedRoot, 'package.json'), 'installed-package-invalid', 'installed-package-json')
  if (installedPackageJson.name !== PACKAGE_NAME || installedPackageJson.version !== PACKAGE_VERSION) {
    fail('installed-package-invalid', 'install matching pi-agentteam package version from local temp tarball', 'installed-identity')
  }
  assertPackageMetadata(installedPackageJson, 'installed')

  return {
    packRoot,
    installProjectRoot,
    installedRoot,
    packed,
    packFileCount: Number.isFinite(packed?.files?.length) ? packed.files.length : undefined,
    packEntryCount: Number.isFinite(packed?.entryCount) ? packed.entryCount : undefined,
  }
}

function cleanupWorkspace(workspace) {
  try {
    fs.rmSync(workspace.packRoot, { recursive: true, force: true })
    fs.rmSync(workspace.installProjectRoot, { recursive: true, force: true })
    if (workspace.artifactRoot) fs.rmSync(workspace.artifactRoot, { recursive: true, force: true })
    if (workspace.installedCodeDistRoot) fs.rmSync(workspace.installedCodeDistRoot, { recursive: true, force: true })
  } catch (_) {
    fail('cleanup-failed', 'remove temp npm pack/install roots manually and rerun', 'cleanup')
  }
}

function buildDryRunSummary(repoRoot, npmVersion = undefined) {
  assertRepoPackage(repoRoot)
  return {
    ok: true,
    status: 'dry-run-contract-only',
    resultMarker: RESULT_MARKER,
    proofKind: 'dry-run-contract-only',
    reviewOnly: true,
    prototype: true,
    nonAvailability: true,
    normalUserAvailability: false,
    nativePackageDelivery: false,
    releaseAsset: false,
    installSource: false,
    packageArtifact: false,
    defaultResolverChanged: false,
    defaultGoChanged: false,
    fallbackDeletionApproved: false,
    npm: {
      available: Boolean(npmVersion),
      versionObserved: npmVersion ? 'observed-redacted' : 'not-checked',
      pack: { ran: false, command: 'npm pack <repo-root> --ignore-scripts --pack-destination <temp>' },
      install: { ran: false, command: 'npm install <local-temp-tarball> --ignore-scripts --package-lock=false --legacy-peer-deps --no-audit --no-fund' },
    },
    package: {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      tsPiFacade: true,
      nativeMetadata: false,
      lifecycleHooks: false,
      unsafeScripts: false,
    },
    cleanup: {
      defaultCleanup: true,
      cleaned: true,
      kept: false,
      pathsRedacted: true,
    },
  }
}

function buildSummary(input) {
  return {
    ok: true,
    status: 'verified',
    resultMarker: RESULT_MARKER,
    proofKind: 'temp-npm-pack-install-baseline',
    reviewOnly: true,
    prototype: true,
    nonAvailability: true,
    normalUserAvailability: false,
    nativePackageDelivery: false,
    releaseAsset: false,
    installSource: false,
    packageArtifact: false,
    defaultResolverChanged: false,
    defaultGoChanged: false,
    fallbackDeletionApproved: false,
    package: {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      tsPiFacade: true,
      nativeMetadata: false,
      lifecycleHooks: false,
      unsafeScripts: false,
    },
    npm: {
      available: true,
      versionObserved: 'observed-redacted',
      pack: {
        ran: true,
        command: 'npm pack <repo-root> --ignore-scripts --pack-destination <temp> --json',
        exitCode: 0,
        localTempTarball: true,
        scriptsIgnored: true,
        fileCount: input.packFileCount,
        entryCount: input.packEntryCount,
      },
      install: {
        ran: true,
        command: 'npm install <local-temp-tarball> --ignore-scripts --package-lock=false --legacy-peer-deps --no-audit --no-fund',
        exitCode: 0,
        localTempTarball: true,
        scriptsIgnored: true,
        packageLockDisabled: true,
        legacyPeerDeps: true,
        auditDisabled: true,
        fundDisabled: true,
      },
    },
    installedPackage: {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      rootKind: 'os-temp-project-node_modules-package',
      ...input.surface,
      packageJsonNativeMetadata: false,
      packageJsonLifecycleHooks: false,
      packageJsonUnsafeScripts: false,
    },
    cleanup: {
      defaultCleanup: true,
      cleaned: input.cleaned,
      kept: input.kept,
      pathsRedacted: true,
    },
  }
}

function requireTypeScript() {
  try {
    return require('typescript')
  } catch (_) {
    return require('/home/linyusheng/.nvm/versions/node/v24.9.0/lib/node_modules/typescript')
  }
}

function transpileInstalledKernel(installedRoot) {
  const ts = requireTypeScript()
  const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0633-installed-code-'))
  fs.writeFileSync(path.join(distRoot, 'package.json'), `${JSON.stringify({ private: true, type: 'commonjs' }, null, 2)}\n`, 'utf8')
  fs.mkdirSync(path.join(distRoot, 'core'), { recursive: true })
  for (const rel of ['core/readModelFingerprint.ts', 'core/kernelPackagedResolver.ts', 'core/kernel.ts']) {
    const sourcePath = path.join(installedRoot, ...rel.split('/'))
    if (!fs.existsSync(sourcePath)) fail('installed-code-load-failed', 'install package with required TypeScript kernel sources', 'installed-code-source')
    const out = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: sourcePath,
      reportDiagnostics: false,
    }).outputText.replace(/import\.meta\.url/g, "require('node:url').pathToFileURL(__filename).href")
    const target = path.join(distRoot, rel.replace(/\.ts$/, '.js'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, out, 'utf8')
  }
  const installedNativeRoot = path.join(installedRoot, 'native')
  if (fs.existsSync(installedNativeRoot)) fs.cpSync(installedNativeRoot, path.join(distRoot, 'native'), { recursive: true })
  return {
    distRoot,
    sourceKind: 'installed-package-root',
    rootKind: 'os-temp-project-node_modules-package',
    kernel: require(path.join(distRoot, 'core', 'kernel.js')),
  }
}

function copyVerifiedLayoutToInstalledPackage(verified, installedRoot) {
  const manifestDir = path.posix.dirname(verified.summary.files.manifest)
  if (!manifestDir || manifestDir === '.' || !manifestDir.startsWith('native/')) {
    fail('installed-layout-copy-failed', 'copy only verified native helper layout into installed package root', 'manifest-dir')
  }
  const sourceDir = path.join(verified.artifactRoot, ...manifestDir.split('/'))
  const targetDir = path.join(installedRoot, ...manifestDir.split('/'))
  try {
    fs.mkdirSync(path.dirname(targetDir), { recursive: true })
    fs.rmSync(targetDir, { recursive: true, force: true })
    fs.cpSync(sourceDir, targetDir, { recursive: true })
  } catch (_) {
    fail('installed-layout-copy-failed', 'copy verified native helper layout into installed package root', 'copy')
  }
  return {
    manifestRelPath: verified.summary.files.manifest,
    layoutRelDir: manifestDir,
    filesCopied: [
      verified.summary.files.helper,
      verified.summary.files.manifest,
      verified.summary.files.checksums,
      verified.summary.files.provenance,
      verified.summary.files.license,
      verified.summary.files.licenseMetadata,
      verified.summary.files.attestation,
    ],
  }
}

function fallbackTmuxSnapshot(stdout, capturedAt) {
  return {
    ok: true,
    capturedAt,
    panes: [{ paneId: '%ts', target: 'fallback:@1', label: 'typescript-fallback', currentCommand: 'pi' }],
    byPaneId: { '%ts': { paneId: '%ts', target: 'fallback:@1', label: 'typescript-fallback', currentCommand: 'pi' } },
  }
}

function assertNonPreviewModesIgnoreInstalledLayout(kernel, installedRoot, manifestRelPath) {
  for (const mode of [undefined, 'go']) {
    const adapter = kernel.createAgentTeamKernelAdapter({
      mode,
      env: {
        PATH: process.env.PATH || '',
        PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT: installedRoot,
        PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST: manifestRelPath,
      },
    })
    const before = adapter.metadata().kernel.calls
    const snapshot = adapter.parseTmuxPaneSnapshot('%go\tembedded:@1\tEmbedded helper\tpi', 1700013300000, () => {
      fail('installed-preview-smoke-failed', 'default/go must not use TypeScript fallback', `non-preview:${mode || 'default'}`)
    })
    const after = adapter.metadata().kernel.calls
    if (!snapshot || snapshot.ok !== true || !snapshot.byPaneId || !snapshot.byPaneId['%go'] || after !== before + 2) {
      fail('installed-preview-smoke-failed', 'default/go must use embedded helper and ignore installed preview layout', `non-preview:${mode || 'default'}`)
    }
  }
  for (const mode of ['disabled', 'typescript', 'auto']) {
    const adapter = kernel.createAgentTeamKernelAdapter({
      mode,
      env: {
        PATH: process.env.PATH || '',
        PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT: installedRoot,
        PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST: manifestRelPath,
      },
    })
    const before = adapter.metadata().kernel.calls
    const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tfallback:@1\tTypeScript fallback\tpi', 1700013300001, fallbackTmuxSnapshot)
    const after = adapter.metadata().kernel.calls
    if (!snapshot || snapshot.ok !== true || !snapshot.byPaneId || !snapshot.byPaneId['%ts'] || after !== before) {
      fail('installed-preview-smoke-failed', 'keep installed layout ignored outside explicit go-packaged-preview/default-go', `non-preview:${mode}`)
    }
  }
}

function runInstalledPreviewSmoke(kernel, installedRoot, manifestRelPath) {
  assertNonPreviewModesIgnoreInstalledLayout(kernel, installedRoot, manifestRelPath)

  const adapter = kernel.createAgentTeamKernelAdapter({
    mode: 'go-packaged-preview',
    packagedHelperInstallRoot: installedRoot,
    packagedHelperManifestPath: manifestRelPath,
    env: { PATH: process.env.PATH || '' },
  })

  const beforeFingerprintCalls = adapter.metadata().kernel.calls
  const fingerprint = adapter.compactReadModelFingerprint({
    mode: 'attached',
    team: { name: 'installed-layout-proof' },
    members: [{ name: 'team-lead', text: 'must-strip' }],
    tasks: [],
    mailbox: [],
  })
  const afterFingerprintCalls = adapter.metadata().kernel.calls
  if (!fingerprint || fingerprint.ok !== true || fingerprint.readOnly !== true || fingerprint.fullTextIncluded !== false || afterFingerprintCalls !== beforeFingerprintCalls) {
    fail('installed-preview-smoke-failed', 'keep compactReadModelFingerprint on TypeScript fallback in installed preview proof', 'fingerprint')
  }

  const snapshot = adapter.parseTmuxPaneSnapshot('%1\tinstalled:@1\tinstalled-helper\tpi', 1700013300001, () => {
    fail('installed-preview-smoke-failed', 'do not hide installed preview helper consumption behind TypeScript tmux fallback', 'tmux-fallback')
  })
  if (!snapshot || snapshot.ok !== true || snapshot.capturedAt !== 1700013300001 || !snapshot.byPaneId || !snapshot.byPaneId['%1']) {
    fail('installed-preview-smoke-failed', 'consume verified installed native helper layout through explicit preview', 'tmuxSnapshotParse')
  }
  const metadata = adapter.metadata().kernel
  if (metadata.requestedMode !== 'go-packaged-preview' || metadata.mode !== 'go' || metadata.enabled !== true || metadata.cutoverStatus !== 'active' || metadata.calls !== beforeFingerprintCalls + 2 || metadata.fallbacks !== 0) {
    fail('installed-preview-smoke-failed', 'explicit installed preview metadata must show helper use without fallback', 'metadata')
  }
  return {
    explicitMode: 'go-packaged-preview',
    tmuxSnapshotParse: true,
    compactReadModelFingerprint: 'typescript-fallback',
    helperCalls: metadata.calls,
    fallbackCalls: metadata.fallbacks,
    helperPathRedacted: true,
    nonPreviewModesIgnoredInstalledLayout: true,
  }
}

function buildInstalledLayoutSummary(input) {
  return {
    ok: true,
    status: 'verified',
    resultMarker: 'installed-layout-consumption-prototype',
    proofKind: 'verified-artifact-installed-layout-explicit-preview',
    reviewOnly: true,
    prototype: true,
    nonAvailability: true,
    normalUserAvailability: false,
    nativePackageDelivery: false,
    releaseAsset: false,
    installSource: false,
    packageArtifact: false,
    defaultResolverChanged: false,
    defaultGoChanged: false,
    fallbackDeletionApproved: false,
    package: {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      tsPiFacade: true,
      nativeMetadata: false,
      lifecycleHooks: false,
      unsafeScripts: false,
    },
    artifact: {
      verification: 'existing-strict-review-artifact-verifier',
      builtLocally: input.builtLocally,
      source: input.artifactSource,
      resultMarker: input.verified.summary.resultMarker,
      target: input.verified.summary.target,
      reviewOnly: true,
      releaseAsset: false,
      installSource: false,
      normalUserAvailability: false,
      rawVerifierJsonIncluded: false,
    },
    installedPackage: {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      rootKind: 'os-temp-project-node_modules-package',
      sourceKind: input.installedCode.sourceKind,
      loadedFromInstalledPackageRoot: true,
      repoSourceLoaded: false,
      requiredFilesPresent: true,
      nativeLayoutInjectedAfterInstall: true,
      layoutRelDir: input.layout.layoutRelDir,
      manifestRelPath: input.layout.manifestRelPath,
      copiedVerifiedFiles: input.layout.filesCopied.length,
    },
    preview: input.preview,
    cleanup: {
      defaultCleanup: true,
      cleaned: input.cleaned,
      kept: input.kept,
      pathsRedacted: true,
    },
  }
}

function runCleanInstallProof(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..', '..'))
  const npmVersion = options.skipNpmCheck ? undefined : assertNpmAvailable(repoRoot)
  if (options.dryRun) return buildDryRunSummary(repoRoot, npmVersion)

  const keepTemp = Boolean(options.keepTemp)
  const workspace = createCleanInstallWorkspace(repoRoot, options)
  try {
    const surface = assertInstalledSurface(workspace.installedRoot)
    return buildSummary({
      packFileCount: workspace.packFileCount,
      packEntryCount: workspace.packEntryCount,
      surface,
      cleaned: !keepTemp,
      kept: keepTemp,
    })
  } finally {
    if (!keepTemp) cleanupWorkspace(workspace)
  }
}

function buildReviewArtifactForConsumption(repoRoot, workspace, options = {}) {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0633-review-artifact-'))
  workspace.artifactRoot = artifactRoot
  try {
    builder.buildGoHelperArtifact({
      extRoot: repoRoot,
      outputRoot: artifactRoot,
      ciReview: true,
      ...(options.builderOptions || {}),
    })
  } catch (error) {
    if (error instanceof builder.GoHelperArtifactBuilderError) {
      fail('artifact-build-failed', error.remediation || 'build review artifact before installed layout proof', error.hint || 'build-review-artifact')
    }
    fail('artifact-build-failed', 'build review artifact before installed layout proof', 'build-review-artifact')
  }
  return artifactRoot
}

function verifyReviewArtifactForConsumption(repoRoot, artifactRoot, kernelModule) {
  try {
    return verifier.verifyGoHelperArtifact({
      extRoot: repoRoot,
      artifactRoot,
      kernelModule,
    })
  } catch (error) {
    if (error instanceof verifier.GoHelperArtifactVerifierError) {
      fail('artifact-verification-failed', error.remediation || 'verify review artifact before installed layout consumption', error.hint || error.failureKind)
    }
    fail('artifact-verification-failed', 'verify review artifact before installed layout consumption', 'review-artifact')
  }
}

function runInstalledLayoutConsumptionProof(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..', '..'))
  assertNpmAvailable(repoRoot)
  if (!options.buildReviewArtifact && !options.artifactRoot) {
    fail('artifact-verification-failed', 'provide --artifact-root or --build-review-artifact for installed layout consumption proof', 'artifact-source')
  }

  const keepTemp = Boolean(options.keepTemp)
  const workspace = createCleanInstallWorkspace(repoRoot, options)
  let externalArtifactRoot
  try {
    const artifactRoot = options.artifactRoot
      ? path.resolve(options.artifactRoot)
      : buildReviewArtifactForConsumption(repoRoot, workspace, options)
    externalArtifactRoot = options.artifactRoot ? artifactRoot : undefined
    if (typeof options.mutateArtifactBeforeVerify === 'function') {
      options.mutateArtifactBeforeVerify({ artifactRoot })
    }
    const installedCode = transpileInstalledKernel(workspace.installedRoot)
    workspace.installedCodeDistRoot = installedCode.distRoot
    const verified = verifyReviewArtifactForConsumption(repoRoot, artifactRoot, installedCode.kernel)
    const layout = copyVerifiedLayoutToInstalledPackage(verified, workspace.installedRoot)
    if (typeof options.mutateInstalledLayoutBeforeSmoke === 'function') {
      options.mutateInstalledLayoutBeforeSmoke({ installedRoot: workspace.installedRoot, layout, verified })
    }
    const preview = runInstalledPreviewSmoke(installedCode.kernel, workspace.installedRoot, layout.manifestRelPath)
    const summary = buildInstalledLayoutSummary({
      verified,
      layout,
      installedCode,
      preview,
      builtLocally: Boolean(options.buildReviewArtifact),
      artifactSource: options.buildReviewArtifact ? 'local-os-temp-review-artifact-build' : 'external-artifact-root-verified',
      cleaned: !keepTemp,
      kept: keepTemp,
    })
    return summary
  } finally {
    if (!keepTemp) {
      if (externalArtifactRoot) delete workspace.artifactRoot
      cleanupWorkspace(workspace)
    }
  }
}

module.exports = {
  CleanInstallProofError,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  REQUIRED_INSTALLED_FILES,
  compactFailure,
  runCleanInstallProof,
  runInstalledLayoutConsumptionProof,
}
