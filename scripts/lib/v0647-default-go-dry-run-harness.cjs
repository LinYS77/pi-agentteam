const cp = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const builder = require('./go-helper-artifact-builder.cjs')
const tmuxFixtures = require('../../tests/fixtures/kernel/tmux/snapshotCases.cjs')

const RESULT_MARKER = 'v0.6.47-default-go-dry-run'
const MODULE = 'tmuxSnapshotParse'
const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const REQUIRED_CAPABILITIES = ['health', 'profile', MODULE, 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle']
const GO_AUTHORITY = 'tmuxSnapshotParse-parser-only'
const FIXED_GENERATED_AT = '2026-06-25T00:00:00.000Z'
const FIXED_REVISION = 'v0647-default-go-dry-run-local-review'
const RUN_IDENTITY = 'v0647-non-mutating-default-go-dry-run'
const DEFAULT_RESOLVER_MODE = 'current-default-go-embedded-cutover'
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]
const PACKAGE_FORBIDDEN_KEYS = [
  'optionalDependencies',
  'bundledDependencies',
  'bundleDependencies',
  'agentteamGoHelper',
  'binary',
  'os',
  'cpu',
  'native',
  'nativeHelper',
]
const PACKAGE_FORBIDDEN_LIFECYCLE_SCRIPTS = [
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
]
const FAILURE_KINDS = new Set([
  'repo-invariant-changed',
  'go-unavailable',
  'helper-build-failed',
  'temp-fixture-failed',
  'future-default-resolver-unavailable',
  'direct-helper-smoke-failed',
  'adapter-smoke-failed',
  'parity-failed',
  'fail-closed-check-failed',
  'no-leak-failed',
  'cleanup-failed',
  'unexpected-error',
])
const FAILURE_CLASS_EXPECTATIONS = Object.freeze({
  missing: 'manifest-missing',
  corrupt: 'manifest-invalid',
  wrongVersion: 'version-skew',
  unsupported: 'unsupported-platform',
  malformed: 'helper-unsafe-response-shape',
})
const NO_LEAK_TERMS = [
  'V0647_DEFAULT_GO_DRY_RUN_FULL_TEXT_SENTINEL_DO_NOT_LEAK',
  'DEFAULT_GO_DRY_RUN_STDOUT_SHOULD_NOT_LEAK',
  'DEFAULT_GO_DRY_RUN_STDERR_SHOULD_NOT_LEAK',
  'DEFAULT_GO_DRY_RUN_MAILBOX_BODY_SHOULD_NOT_LEAK',
  'DEFAULT_GO_DRY_RUN_REPORT_BODY_SHOULD_NOT_LEAK',
  'MailboxMessage.text',
  'TaskReport.text',
  'full mailbox body',
  'full report body',
  'worker transcript',
  'terminal raw log',
  'raw tmux stdout',
  'raw tmux stderr',
  'raw state archive',
  'absolute helper path',
  'repository path',
  'cwd path',
  'BEGIN PRIVATE KEY',
  'raw hosted record',
]

class V0647DefaultGoDryRunError extends Error {
  constructor(failureKind, hint, details = {}) {
    super(failureKind)
    this.name = 'V0647DefaultGoDryRunError'
    this.failureKind = compactToken(failureKind, 'unexpected-error')
    this.hint = compactToken(hint, 'dry-run')
    this.details = details
  }
}

function defaultRepoRoot() {
  return path.resolve(__dirname, '..', '..')
}

function compactToken(value, fallback) {
  const text = String(value ?? '').replace(/[^a-zA-Z0-9_.:/ -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140)
  return text || fallback
}

function fail(failureKind, hint, details) {
  throw new V0647DefaultGoDryRunError(failureKind, hint, details)
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 16)
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function repoPath(repoRoot, rel) {
  return path.join(repoRoot, ...rel.split('/'))
}

function readText(repoRoot, rel) {
  try {
    return fs.readFileSync(repoPath(repoRoot, rel), 'utf8')
  } catch (_) {
    fail('repo-invariant-changed', rel)
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function assertIncludes(source, expected, hint) {
  if (!source.includes(expected)) fail('repo-invariant-changed', hint)
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'data') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else if (entry.isFile()) fs.copyFileSync(from, to)
  }
}

function assertNoForbiddenRepoArtifacts(repoRoot) {
  for (const rel of ROOT_FORBIDDEN_FILES) {
    if (fs.existsSync(repoPath(repoRoot, rel))) fail('repo-invariant-changed', rel)
  }
  const forbidden = []
  for (const file of walkFiles(repoRoot)) {
    const rel = toPosix(path.relative(repoRoot, file))
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && /(?:^|\/)(?:pi-agentteam-.*\.tgz|.*\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig))$/i.test(rel)) forbidden.push(rel)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && !rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/') && /(?:^|\/)(?:.*raw.*|.*stdout.*|.*stderr.*|.*state-archive.*|.*mailbox.*body.*|.*report.*body.*|.*worker.*transcript.*|.*terminal.*log.*|.*release-asset.*)$/i.test(rel)) forbidden.push(rel)
  }
  if (forbidden.length > 0) fail('repo-invariant-changed', forbidden.sort()[0])
}

function collectRepoInvariants(repoRoot) {
  const packageJson = readJson(repoPath(repoRoot, 'package.json'))
  if (packageJson.name !== PACKAGE_NAME || packageJson.version !== PACKAGE_VERSION || packageJson.type !== 'module') fail('repo-invariant-changed', 'package-json-identity')
  if (JSON.stringify(packageJson.pi?.extensions) !== JSON.stringify(['./index.ts'])) fail('repo-invariant-changed', 'pi-extensions')
  for (const key of PACKAGE_FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(packageJson, key)) fail('repo-invariant-changed', `package:${key}`)
  }
  for (const lifecycle of PACKAGE_FORBIDDEN_LIFECYCLE_SCRIPTS) {
    if (Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle)) fail('repo-invariant-changed', `script:${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    if (/npm\s+(?:version|publish)\b/.test(command)) fail('repo-invariant-changed', `script:${name}:npm-release`)
    if (/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild|postinstall|install-time build/i.test(command)) fail('repo-invariant-changed', `script:${name}:native-install`)
  }

  const kernel = readText(repoRoot, 'core/kernel.ts')
  assertIncludes(kernel, "if (!raw || raw === 'default') return 'default'", 'default-normalization')
  assertIncludes(kernel, "const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)", 'requested-mode-env')
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'packaged-preview-explicit')
  assertIncludes(kernel, "const defaultCutoverRequested = defaultRequested || requestedMode === 'go'", 'default-cutover')
  assertIncludes(kernel, "const packagedResolverRequested = packagedPreviewRequested || defaultCutoverRequested", 'packaged-resolver-default')
  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperManifestPath()', 'embedded-helper-manifest')
  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperRoot()', 'embedded-helper-root')
  assertIncludes(kernel, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'cutover-default')
  assertIncludes(kernel, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const", 'cutover-module')
  assertIncludes(kernel, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'read-model-fallback')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'read-model-non-cutover')

  const snapshot = readText(repoRoot, 'tmux/snapshot.ts')
  if (snapshot.includes('parseTmuxPaneSnapshotWithTypeScript')) fail('repo-invariant-changed', 'ts-parser-fallback-still-present')
  assertIncludes(snapshot, 'createAgentTeamKernelAdapter().parseTmuxPaneSnapshot', 'parser-seam-only')
  assertIncludes(snapshot, 'createAgentTeamKernelAdapter().captureTmuxSnapshot', 'go-tmux-capture-seam')

  const goSource = readText(repoRoot, 'kernel/go/agentteam-kernel/main.go')
  assertIncludes(goSource, 'case "tmuxSnapshotCapture"', 'go-tmux-capture-capability')
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat)', 'go-tmux-capture-command')
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat)', 'go-current-pane-binding-command')
  if (/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource)) fail('repo-invariant-changed', 'go-authority:target-display-message')
  for (const forbidden of ['createTeammatePane', 'kill-pane', 'send-keys', 'PI_AGENTTEAM_HOME', 'team.json', 'os.Open', 'os.ReadFile', 'os.WriteFile', 'os.Create']) {
    if (goSource.includes(forbidden)) fail('repo-invariant-changed', `go-authority:${forbidden}`)
  }

  assertNoForbiddenRepoArtifacts(repoRoot)

  return {
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    packageType: packageJson.type,
    piExtensions: [...packageJson.pi.extensions],
    defaultUnsetMode: 'disabled',
    defaultRuntime: 'typescript/non-native',
    goCutoverExplicitOnly: true,
    goPackagedPreviewExplicitOnly: true,
    typeScriptFallbackPresent: true,
    defaultResolverEnabled: false,
    rootForbiddenArtifactsAbsent: true,
  }
}

function requireTypeScript() {
  try {
    return require('typescript')
  } catch (_) {
    return require('/home/linyusheng/.nvm/versions/node/v24.9.0/lib/node_modules/typescript')
  }
}

function transpileCore(repoRoot, tempRoot) {
  const ts = requireTypeScript()
  const distRoot = path.join(tempRoot, 'dist')
  fs.mkdirSync(path.join(distRoot, 'core'), { recursive: true })
  fs.writeFileSync(path.join(distRoot, 'package.json'), '{"type":"commonjs"}\n', 'utf8')
  for (const rel of ['core/kernelContract.ts', 'core/readModelFingerprint.ts', 'core/kernelPackagedResolver.ts', 'core/kernel.ts']) {
    const sourcePath = repoPath(repoRoot, rel)
    let out = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: sourcePath,
      reportDiagnostics: false,
    }).outputText
    if (rel === 'core/kernel.ts') {
      out = out
        .replaceAll('(0, node_url_1.fileURLToPath)(import.meta.url)', '__filename')
        .replaceAll('node_url_1.fileURLToPath(import.meta.url)', '__filename')
    }
    const target = path.join(distRoot, rel.replace(/\.ts$/, '.js'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, out, 'utf8')
  }
  copyDir(repoPath(repoRoot, 'native'), path.join(distRoot, 'native'))
  const kernel = require(path.join(distRoot, 'core', 'kernel.js'))
  const resolver = require(path.join(distRoot, 'core', 'kernelPackagedResolver.js'))
  return {
    ...kernel,
    resolveAgentTeamPackagedHelperManifest: resolver.resolveAgentTeamPackagedHelperManifest,
  }
}

function hasGoToolchain(repoRoot) {
  const result = cp.spawnSync('go', ['version'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 10_000,
    env: { PATH: process.env.PATH || '' },
  })
  return result.status === 0
}

function runHelper(helperPath, request) {
  return cp.spawnSync(helperPath, [], {
    input: `${JSON.stringify(request)}\n`,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH || '' },
  })
}

function parseHelperResult(result, hint) {
  if (result.error || result.status !== 0) fail('direct-helper-smoke-failed', hint)
  let response
  try {
    response = JSON.parse(String(result.stdout || '').trim().split('\n').find(Boolean) || '')
  } catch (_) {
    fail('direct-helper-smoke-failed', hint)
  }
  if (!isRecord(response) || response.jsonrpc !== '2.0' || response.error || !Object.prototype.hasOwnProperty.call(response, 'result')) fail('direct-helper-smoke-failed', hint)
  return response.result
}

function compactSnapshot(snapshot) {
  const byPaneId = snapshot.byPaneId || {}
  return {
    capturedAt: snapshot.capturedAt,
    ok: snapshot.ok,
    panes: (snapshot.panes || []).map(item => ({
      paneId: item.paneId,
      target: item.target,
      label: item.label,
      currentCommand: item.currentCommand,
    })),
    byPaneId: Object.fromEntries(Object.keys(byPaneId).sort().map(paneId => {
      const item = byPaneId[paneId]
      return [paneId, {
        paneId: item.paneId,
        target: item.target,
        label: item.label,
        currentCommand: item.currentCommand,
      }]
    })),
  }
}

function assertSnapshotMatches(actual, expected, hint) {
  if (JSON.stringify(compactSnapshot(actual)) !== JSON.stringify(compactSnapshot(expected))) fail('parity-failed', hint)
}

function assertHealth(health) {
  if (!isRecord(health) || health.ok !== true || health.implementation !== 'go') fail('direct-helper-smoke-failed', 'health-shape')
  if (health.protocolVersion !== PROTOCOL_VERSION || health.helperVersion !== HELPER_VERSION) fail('direct-helper-smoke-failed', 'health-version')
  if (JSON.stringify(health.capabilities) !== JSON.stringify(REQUIRED_CAPABILITIES)) fail('direct-helper-smoke-failed', 'health-capabilities')
  if (health.businessPathsConnected !== false) fail('direct-helper-smoke-failed', 'business-paths')
}

function copyArtifactToInstalledFixture(tempRoot, source) {
  const installedRoot = path.join(tempRoot, 'package-preview-install-root')
  const files = [source.helperPath, source.manifestPath, source.checksumPath, source.provenancePath, source.licensePath, source.licenseMetadataPath, source.attestationPath]
  const relMap = new Map()
  for (const file of files) {
    const oldRel = toPosix(path.relative(source.outputRoot, file))
    const newRel = `node_modules/${PACKAGE_NAME}/${oldRel}`
    const target = path.join(installedRoot, ...newRel.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(file, target)
    if (process.platform !== 'win32' && file === source.helperPath) fs.chmodSync(target, fs.statSync(file).mode & 0o777)
    relMap.set(oldRel, newRel)
  }

  const manifestRel = relMap.get(toPosix(path.relative(source.outputRoot, source.manifestPath)))
  const manifestPath = path.join(installedRoot, ...manifestRel.split('/'))
  const manifest = readJson(manifestPath)
  const remapRel = value => relMap.get(value) || value
  manifest.artifact.path = remapRel(manifest.artifact.path)
  for (const key of Object.keys(manifest.files)) manifest.files[key] = remapRel(manifest.files[key])
  manifest.license.path = remapRel(manifest.license.path)
  manifest.license.metadataPath = remapRel(manifest.license.metadataPath)
  manifest.attestation.path = remapRel(manifest.attestation.path)
  manifest.build.command = ['go', 'build', '-trimpath', '-o', manifest.artifact.path, '.']
  writeJson(manifestPath, manifest)

  const provenancePath = path.join(installedRoot, ...manifest.files.provenance.split('/'))
  const provenance = readJson(provenancePath)
  provenance.build.command = ['go', 'build', '-trimpath', '-o', manifest.artifact.path, '.']
  writeJson(provenancePath, provenance)

  const licenseMetadataPath = path.join(installedRoot, ...manifest.files.licenseMetadata.split('/'))
  const licenseMetadata = readJson(licenseMetadataPath)
  licenseMetadata.path = manifest.files.license
  writeJson(licenseMetadataPath, licenseMetadata)

  const attestationPath = path.join(installedRoot, ...manifest.files.attestation.split('/'))
  const attestation = JSON.parse(fs.readFileSync(attestationPath, 'utf8').trim())
  attestation.subject[0].name = manifest.artifact.path
  fs.writeFileSync(attestationPath, `${JSON.stringify(attestation)}\n`, 'utf8')

  manifest.license.sha256 = sha256File(path.join(installedRoot, ...manifest.files.license.split('/')))
  manifest.license.metadataSha256 = sha256File(licenseMetadataPath)
  manifest.attestation.sha256 = sha256File(attestationPath)
  writeJson(manifestPath, manifest)

  const checksumPath = path.join(installedRoot, ...manifest.files.checksums.split('/'))
  const checksumRows = [
    [sha256File(path.join(installedRoot, ...manifest.files.helper.split('/'))), manifest.files.helper],
    [sha256File(manifestPath), manifest.files.manifest],
    [sha256File(provenancePath), manifest.files.provenance],
    [manifest.license.sha256, manifest.files.license],
    [manifest.license.metadataSha256, manifest.files.licenseMetadata],
    [manifest.attestation.sha256, manifest.files.attestation],
  ]
  fs.writeFileSync(checksumPath, checksumRows.map(([hash, rel]) => `${hash}  ${rel}`).join('\n') + '\n', 'utf8')

  return {
    installedRoot,
    manifestRel,
    manifestPath,
    helperPath: path.join(installedRoot, ...manifest.files.helper.split('/')),
    target: manifest.target,
    platform: { ...manifest.platform },
  }
}

function cloneFixture(tempRoot, fixture, name) {
  const root = path.join(tempRoot, `failure-${name}`)
  fs.cpSync(fixture.installedRoot, root, { recursive: true })
  return {
    installedRoot: root,
    manifestRel: fixture.manifestRel,
    manifestPath: path.join(root, path.relative(fixture.installedRoot, fixture.manifestPath)),
    helperPath: path.join(root, path.relative(fixture.installedRoot, fixture.helperPath)),
  }
}

function rewriteManifest(fixture, mutator) {
  const manifest = readJson(fixture.manifestPath)
  mutator(manifest)
  writeJson(fixture.manifestPath, manifest)
}

function fakeFutureDefaultResolver(kernel, input) {
  const resolver = kernel.resolveAgentTeamPackagedHelperManifest({
    installedRoot: input.installedRoot,
    manifestPath: input.manifestRel,
    platform: input.platform,
  })
  if (resolver.status !== 'available') return { wouldUseGo: false, resolver }
  return {
    wouldUseGo: true,
    resolver,
    adapter: kernel.createAgentTeamKernelAdapter({
      mode: 'go-packaged-preview',
      packagedHelperInstallRoot: input.installedRoot,
      packagedHelperManifestPath: input.manifestRel,
      env: { PATH: process.env.PATH || '' },
    }),
  }
}

function assertNoLeaks(value, roots) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    if (text.includes(path.resolve(root))) fail('no-leak-failed', 'absolute-root')
  }
  if (text.includes(process.cwd())) fail('no-leak-failed', 'cwd')
  if (/stack|AssertionError|\bat\s+|kernel\/go\/agentteam-kernel|native\/tmuxSnapshotParse|manifest\.json|provenance\.json|attestation\.intoto|SHA256SUMS|stdout\s*:|stderr\s*:/i.test(text)) fail('no-leak-failed', 'raw-internals')
  for (const term of NO_LEAK_TERMS) {
    if (text.includes(term)) fail('no-leak-failed', term)
  }
}

function assertCurrentDefaults(kernel, fixture) {
  for (const mode of [undefined, '', 'default', 'go']) {
    const adapter = kernel.createAgentTeamKernelAdapter({
      mode,
      env: {
        PATH: process.env.PATH || '',
        PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT: fixture.installedRoot,
        PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST: fixture.manifestRel,
      },
    })
    const snapshot = adapter.parseTmuxPaneSnapshot('%go\tdefault:@1\tembedded\tpi', 1700006470000, () => fail('repo-invariant-changed', `default-fallback-called:${mode || 'unset'}`))
    const metadata = adapter.metadata().kernel
    if (snapshot.byPaneId['%go'] === undefined || metadata.mode !== 'go' || metadata.enabled !== true || metadata.cutoverStatus !== 'active' || metadata.fallbacks !== 0) {
      fail('repo-invariant-changed', `default-mode:${mode || 'unset'}`)
    }
  }

  for (const mode of ['disabled', 'typescript']) {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode, env: { PATH: process.env.PATH || '' } })
    let fallbackCalled = false
    const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tdisabled:@1\ttypescript\tpi', 1700006470001, (stdout, capturedAt) => {
      fallbackCalled = true
      return {
        ok: true,
        capturedAt,
        panes: [{ paneId: '%ts', target: 'disabled:@1', label: 'typescript', currentCommand: 'pi' }],
        byPaneId: { '%ts': { paneId: '%ts', target: 'disabled:@1', label: 'typescript', currentCommand: 'pi' } },
      }
    })
    const metadata = adapter.metadata().kernel
    if (!fallbackCalled || snapshot.byPaneId['%ts'] === undefined || metadata.mode !== 'typescript' || metadata.enabled !== false || metadata.calls !== 0) {
      fail('repo-invariant-changed', `disabled-mode:${mode}`)
    }
  }

  const cutover = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', env: { PATH: process.env.PATH || '', PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT: fixture.installedRoot, PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST: fixture.manifestRel } })
  const cutoverSnapshot = cutover.parseTmuxPaneSnapshot('%ts\tcutover:@1\tshould-not-discover\tpi', 1700006470002, () => fail('repo-invariant-changed', 'go-cutover-fallback-called'))
  if (cutoverSnapshot.ok !== false || cutoverSnapshot.cutoverFailureKind !== 'missing-helper' || cutover.metadata().kernel.calls !== 0) fail('repo-invariant-changed', 'go-cutover-discovered-package')
}

function runDirectAndAdapterSmoke(kernel, helperPath, fixture) {
  const sample = tmuxFixtures.cases().find(testCase => testCase.name === 'mixed corpus canonical snapshot') || tmuxFixtures.cases()[0]
  const health = parseHelperResult(runHelper(helperPath, { jsonrpc: '2.0', id: 'health', method: 'health' }), 'health')
  assertHealth(health)

  const directParse = parseHelperResult(runHelper(helperPath, {
    jsonrpc: '2.0',
    id: 'parse',
    method: MODULE,
    params: { stdout: sample.stdout, capturedAt: sample.capturedAt },
  }), 'tmuxSnapshotParse')
  assertSnapshotMatches(directParse, sample.expected, 'direct-helper-parity')

  const explicitCutover = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath, env: { PATH: process.env.PATH || '' } })
  const cutoverSnapshot = explicitCutover.parseTmuxPaneSnapshot(sample.stdout, sample.capturedAt, () => fail('adapter-smoke-failed', 'go-cutover-fallback'))
  assertSnapshotMatches(cutoverSnapshot, sample.expected, 'explicit-go-cutover')
  const cutoverMeta = explicitCutover.metadata().kernel
  if (cutoverMeta.requestedMode !== 'go-cutover' || cutoverMeta.mode !== 'go' || cutoverMeta.enabled !== true || cutoverMeta.cutoverStatus !== 'active' || cutoverMeta.fallbacks !== 0) fail('adapter-smoke-failed', 'go-cutover-metadata')

  const future = fakeFutureDefaultResolver(kernel, fixture)
  if (!future.wouldUseGo || !future.adapter) fail('future-default-resolver-unavailable', future.resolver?.failureKind || 'resolver')
  const futureSnapshot = future.adapter.parseTmuxPaneSnapshot(sample.stdout, sample.capturedAt, () => fail('adapter-smoke-failed', 'future-default-fallback'))
  assertSnapshotMatches(futureSnapshot, sample.expected, 'future-default-dry-run')
  const futureMeta = future.adapter.metadata().kernel
  if (futureMeta.requestedMode !== 'go-packaged-preview' || futureMeta.mode !== 'go' || futureMeta.enabled !== true || futureMeta.cutoverStatus !== 'active' || futureMeta.fallbacks !== 0) fail('adapter-smoke-failed', 'future-default-metadata')

  return {
    directHelperHealth: true,
    directHelperTmuxSnapshotParse: true,
    explicitGoCutover: { active: true, fallbacks: cutoverMeta.fallbacks, helperCalls: cutoverMeta.calls },
    futureDefaultResolver: { wouldUseGo: true, helperCalls: futureMeta.calls, fallbackCalls: futureMeta.fallbacks },
    sample: { name: sample.name, stdoutHash: sha256Text(sample.stdout), paneCount: sample.expected.panes.length, byPaneIdConsistent: true },
  }
}

function runParity(kernel, helperPath, fixture) {
  const caseSummaries = []
  const future = fakeFutureDefaultResolver(kernel, fixture)
  if (!future.adapter) fail('future-default-resolver-unavailable', 'parity-resolver')
  for (const testCase of tmuxFixtures.cases()) {
    const directParse = parseHelperResult(runHelper(helperPath, {
      jsonrpc: '2.0',
      id: `parity-${caseSummaries.length}`,
      method: MODULE,
      params: { stdout: testCase.stdout, capturedAt: testCase.capturedAt },
    }), 'parity-direct')
    assertSnapshotMatches(directParse, testCase.expected, `direct:${testCase.name}`)
    const adapterSnapshot = future.adapter.parseTmuxPaneSnapshot(testCase.stdout, testCase.capturedAt, () => fail('parity-failed', `future-fallback:${testCase.name}`))
    assertSnapshotMatches(adapterSnapshot, testCase.expected, `future:${testCase.name}`)
    caseSummaries.push({ name: testCase.name, paneCount: testCase.expected.panes.length, stdoutHash: sha256Text(testCase.stdout) })
  }
  return {
    caseCount: caseSummaries.length,
    passed: true,
    rawStdoutIncluded: false,
    cases: caseSummaries,
  }
}

function runFailureClasses(kernel, tempRoot, fixture) {
  const failures = []
  const cases = [
    ['missing', clone => fs.rmSync(clone.manifestPath, { force: true })],
    ['corrupt', clone => fs.writeFileSync(clone.manifestPath, '{not json V0647_DEFAULT_GO_DRY_RUN_FULL_TEXT_SENTINEL_DO_NOT_LEAK', 'utf8')],
    ['wrongVersion', clone => rewriteManifest(clone, manifest => { manifest.helperVersion = 'wrong-helper-version' })],
    ['unsupported', clone => rewriteManifest(clone, manifest => { manifest.platform.libc = manifest.platform.libc === 'glibc' ? 'musl' : 'glibc' })],
    ['malformed', clone => {
      const script = `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 'malformed', result: { text: 'V0647_DEFAULT_GO_DRY_RUN_FULL_TEXT_SENTINEL_DO_NOT_LEAK' } }) + '\\n')\n`
      fs.writeFileSync(clone.helperPath, script, 'utf8')
      fs.chmodSync(clone.helperPath, 0o755)
      const manifest = readJson(clone.manifestPath)
      manifest.artifact.size = fs.statSync(clone.helperPath).size
      manifest.artifact.sha256 = sha256File(clone.helperPath)
      writeJson(clone.manifestPath, manifest)
      const checksumPath = path.join(clone.installedRoot, ...manifest.files.checksums.split('/'))
      const rows = fs.readFileSync(checksumPath, 'utf8').split('\n').filter(Boolean).map(row => {
        const rel = row.slice(66)
        return rel === manifest.files.helper ? `${manifest.artifact.sha256}  ${rel}` : row
      })
      fs.writeFileSync(checksumPath, `${rows.join('\n')}\n`, 'utf8')
    }],
  ]

  for (const [name, mutate] of cases) {
    const clone = cloneFixture(tempRoot, fixture, name)
    mutate(clone)
    if (name === 'malformed') {
      const adapter = kernel.createAgentTeamKernelAdapter({
        mode: 'go-packaged-preview',
        packagedHelperInstallRoot: clone.installedRoot,
        packagedHelperManifestPath: clone.manifestRel,
        env: { PATH: process.env.PATH || '' },
      })
      const snapshot = adapter.parseTmuxPaneSnapshot('%bad\tfail:@1\tbad\tpi', 1700006470100, () => fail('fail-closed-check-failed', 'malformed-fallback'))
      const metadata = adapter.metadata().kernel
      if (snapshot.ok !== false || snapshot.status !== 'unknown' || snapshot.resultMarker !== 'stale' || snapshot.cutoverFailureKind !== FAILURE_CLASS_EXPECTATIONS.malformed || metadata.fallbacks !== 0) fail('fail-closed-check-failed', name)
      failures.push({ name, observed: FAILURE_CLASS_EXPECTATIONS.malformed, cutoverFailureKind: snapshot.cutoverFailureKind, failClosed: true })
      continue
    }

    const result = kernel.resolveAgentTeamPackagedHelperManifest({
      installedRoot: clone.installedRoot,
      manifestPath: clone.manifestRel,
      platform: fixture.platform,
    })
    if (result.status !== 'unavailable' || result.failureKind !== FAILURE_CLASS_EXPECTATIONS[name]) fail('fail-closed-check-failed', name)
    const adapter = kernel.createAgentTeamKernelAdapter({
      mode: 'go-packaged-preview',
      packagedHelperInstallRoot: clone.installedRoot,
      packagedHelperManifestPath: clone.manifestRel,
      env: { PATH: process.env.PATH || '' },
    })
    const snapshot = adapter.parseTmuxPaneSnapshot('%bad\tfail:@1\tbad\tpi', 1700006470101, () => fail('fail-closed-check-failed', `${name}-fallback`))
    if (snapshot.ok !== false || snapshot.status !== 'unknown' || snapshot.resultMarker !== 'stale' || snapshot.module !== MODULE || snapshot.capability !== MODULE || adapter.metadata().kernel.fallbacks !== 0) fail('fail-closed-check-failed', `${name}-snapshot`)
    failures.push({ name, observed: result.failureKind, cutoverFailureKind: snapshot.cutoverFailureKind, failClosed: true })
  }
  return { passed: true, failures }
}

function buildSuccessSummary(input) {
  return {
    ok: true,
    resultMarker: RESULT_MARKER,
    ready: false,
    reviewOnly: true,
    dryRun: true,
    nonMutating: true,
    selectedModule: MODULE,
    wouldUseGoForTmuxSnapshotParse: true,
    defaultBehaviorChanged: true,
    defaultGoEnabled: true,
    defaultResolverEnabled: true,
    defaultResolverChanged: true,
    defaultRuntime: 'go/embedded-helper',
    fallbackDeleted: true,
    typeScriptFallbackDeleted: true,
    fallbackDeletionApproved: false,
    goAuthority: GO_AUTHORITY,
    goCutoverExplicitOnly: true,
    goPackagedPreviewExplicitOnly: true,
    packageReleaseApproved: false,
    nativePackageApproved: false,
    releaseReadyClaim: false,
    tagCreated: false,
    releaseCreated: false,
    npmPublished: false,
    npmVersionChanged: false,
    packageVersionChanged: false,
    runtimeBehaviorChanged: false,
    helper: {
      built: true,
      rootKind: 'os-temp-only',
      pathRedacted: true,
      version: HELPER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: REQUIRED_CAPABILITIES,
      businessPathsConnected: false,
    },
    futureDefaultResolver: {
      mode: DEFAULT_RESOLVER_MODE,
      nonProduction: false,
      packagePreviewFixture: false,
      manifestResolved: true,
      wouldSelectModule: MODULE,
      explicitModeUsedForSimulation: 'default',
      currentProductDefaultUntouched: false,
    },
    smoke: input.smoke,
    parity: input.parity,
    failClosed: input.failClosed,
    noLeak: {
      passed: true,
      rawStdoutIncluded: false,
      rawStderrIncluded: false,
      rawTimingJsonIncluded: false,
      rawStateIncluded: false,
      fullTextIncluded: false,
      absolutePathsIncluded: false,
      nativeArtifactsCheckedIn: false,
      tempPathsRedacted: true,
      repoPathsRedacted: true,
    },
    packageInvariants: {
      packageName: PACKAGE_NAME,
      packageVersion: PACKAGE_VERSION,
      nativeMetadataChanged: false,
      lifecycleScriptsChanged: false,
      lockfilesAbsent: true,
      goModuleFilesAbsent: true,
      repoArtifactsAbsent: true,
    },
    repoFacts: input.repoFacts,
    blockers: [
      'actual-default-go-enable',
      'default-resolver-normal-user-availability',
      'package-manager-native-delivery',
      'fallback-deletion',
      'rollback-default-disable-rehearsal',
      'manual-rc-and-broad-validation',
      'explicit-release-governance',
    ],
    cleanup: {
      tempRootKind: 'os-temp-only',
      cleaned: input.cleaned,
      pathsRedacted: true,
    },
  }
}

function compactErrorHint(error) {
  const message = String(error?.message || error?.name || 'unexpected')
    .replace(/(?:^|\s)\/(?:home|tmp|var|Users|private|mnt|workspace)\/[^\s)"']+/g, ' <path>')
    .replace(/[A-Za-z]:\\[^\s)"']+/g, '<path>')
  return compactToken(message, 'unexpected')
}

function buildFailSummary(error) {
  const failureKind = error instanceof V0647DefaultGoDryRunError ? error.failureKind : 'unexpected-error'
  const hint = error instanceof V0647DefaultGoDryRunError ? error.hint : compactErrorHint(error)
  const summary = {
    ok: false,
    resultMarker: RESULT_MARKER,
    ready: false,
    reviewOnly: true,
    dryRun: true,
    nonMutating: true,
    selectedModule: MODULE,
    wouldUseGoForTmuxSnapshotParse: false,
    defaultBehaviorChanged: true,
    defaultGoEnabled: true,
    defaultResolverEnabled: true,
    defaultResolverChanged: true,
    defaultRuntime: 'go/embedded-helper',
    fallbackDeleted: true,
    typeScriptFallbackDeleted: true,
    fallbackDeletionApproved: false,
    goAuthority: GO_AUTHORITY,
    goCutoverExplicitOnly: true,
    goPackagedPreviewExplicitOnly: true,
    packageReleaseApproved: false,
    nativePackageApproved: false,
    releaseReadyClaim: false,
    tagCreated: false,
    releaseCreated: false,
    npmPublished: false,
    npmVersionChanged: false,
    packageVersionChanged: false,
    runtimeBehaviorChanged: false,
    failures: [{ failureKind, hint }],
    blockers: [failureKind],
    noLeak: {
      passed: true,
      rawStdoutIncluded: false,
      rawStderrIncluded: false,
      fullTextIncluded: false,
      absolutePathsIncluded: false,
    },
    cleanup: { tempRootKind: 'os-temp-only', cleaned: true, pathsRedacted: true },
  }
  assertNoLeaks(summary, [])
  return summary
}

function verifyV0647DefaultGoDryRun(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || defaultRepoRoot())
  let tempRoot
  try {
    const repoFacts = collectRepoInvariants(repoRoot)
    if (!hasGoToolchain(repoRoot)) fail('go-unavailable', 'go-version')
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0647-default-go-dry-run-'))
    if (path.dirname(tempRoot) !== os.tmpdir()) fail('temp-fixture-failed', 'tmp-root')
    const kernel = transpileCore(repoRoot, tempRoot)
    const artifact = builder.buildGoHelperArtifact({
      extRoot: repoRoot,
      outputRoot: path.join(tempRoot, 'artifact-root'),
      generatedAt: FIXED_GENERATED_AT,
      sourceRevision: FIXED_REVISION,
      runIdentity: RUN_IDENTITY,
      timeoutMs: 30_000,
    })
    const fixture = copyArtifactToInstalledFixture(tempRoot, artifact)
    assertCurrentDefaults(kernel, fixture)
    const smoke = runDirectAndAdapterSmoke(kernel, fixture.helperPath, fixture)
    const parity = runParity(kernel, fixture.helperPath, fixture)
    const failClosed = runFailureClasses(kernel, tempRoot, fixture)
    const summary = buildSuccessSummary({ repoFacts, smoke, parity, failClosed, cleaned: true })
    assertNoLeaks(summary, [repoRoot, tempRoot, artifact.outputRoot, fixture.installedRoot])
    return summary
  } catch (error) {
    return buildFailSummary(error)
  } finally {
    if (tempRoot) {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true })
      } catch (_) {
        return buildFailSummary(new V0647DefaultGoDryRunError('cleanup-failed', 'temp-root'))
      }
    }
  }
}

function createFailClosedV0647DefaultGoDryRunSummary(failureKind, hint) {
  if (!FAILURE_KINDS.has(failureKind)) return buildFailSummary(new V0647DefaultGoDryRunError('unexpected-error', hint || failureKind))
  return buildFailSummary(new V0647DefaultGoDryRunError(failureKind, hint))
}

function formatV0647DefaultGoDryRunText(summary) {
  const lines = [
    `${summary.resultMarker} ok=${summary.ok} ready=${summary.ready}`,
    `wouldUseGoForTmuxSnapshotParse=${summary.wouldUseGoForTmuxSnapshotParse} defaultBehaviorChanged=${summary.defaultBehaviorChanged}`,
    `defaultGoEnabled=${summary.defaultGoEnabled} defaultResolverEnabled=${summary.defaultResolverEnabled} fallbackDeleted=${summary.fallbackDeleted}`,
    `goAuthority=${summary.goAuthority} goCutoverExplicitOnly=${summary.goCutoverExplicitOnly} goPackagedPreviewExplicitOnly=${summary.goPackagedPreviewExplicitOnly}`,
    `packageReleaseApproved=${summary.packageReleaseApproved} nativePackageApproved=${summary.nativePackageApproved} releaseReadyClaim=${summary.releaseReadyClaim}`,
    `noLeak=${summary.noLeak?.passed === true} cleanupCleaned=${summary.cleanup?.cleaned === true}`,
  ]
  if (!summary.ok) lines.push(`diagnostic=${summary.failures?.[0]?.failureKind}:${summary.failures?.[0]?.hint}`)
  return `${lines.join('\n')}\n`
}

module.exports = {
  DEFAULT_RESOLVER_MODE,
  FAILURE_CLASS_EXPECTATIONS,
  GO_AUTHORITY,
  MODULE,
  RESULT_MARKER,
  REQUIRED_CAPABILITIES,
  V0647DefaultGoDryRunError,
  createFailClosedV0647DefaultGoDryRunSummary,
  formatV0647DefaultGoDryRunText,
  verifyV0647DefaultGoDryRun,
}
