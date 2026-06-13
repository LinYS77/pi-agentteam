const cp = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const { stripTypeScriptTypes } = require('node:module')
const os = require('node:os')
const path = require('node:path')

const MODULE = 'tmuxSnapshotParse'
const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const REQUIRED_CAPABILITIES = ['health', 'profile', MODULE, 'compactReadModelFingerprint']
const ARTIFACT_INDEX_FILENAME = 'artifact-index.json'
const REVIEW_RETENTION_DAYS = 7
const FAILURE_KINDS = new Set([
  'artifact-root-invalid',
  'artifact-index-missing',
  'artifact-index-invalid',
  'manifest-missing',
  'manifest-invalid',
  'path-unsafe',
  'package-mismatch',
  'module-mismatch',
  'version-skew',
  'capability-skew',
  'unsupported-platform',
  'helper-missing',
  'integrity-mismatch',
  'artifact-not-executable',
  'provenance-missing',
  'license-missing',
  'attestation-invalid',
  'jsonrpc-smoke-failed',
])

class GoHelperArtifactVerifierError extends Error {
  constructor(failureKind, remediation, hint) {
    super(failureKind)
    this.name = 'GoHelperArtifactVerifierError'
    this.failureKind = failureKind
    this.remediation = remediation
    this.hint = hint
  }

  toDiagnostic() {
    return compactFailure(this.failureKind, this.remediation, this.hint)
  }
}

function compactFailure(failureKind, remediation, hint) {
  if (!FAILURE_KINDS.has(failureKind)) throw new Error(`unexpected failureKind ${failureKind}`)
  return {
    ok: false,
    status: 'unavailable',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'fail-closed',
    failureKind,
    remediation,
    hint,
  }
}

function fail(failureKind, remediation, hint) {
  throw new GoHelperArtifactVerifierError(failureKind, remediation, hint)
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function isInside(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
}

function transpileTypeScriptSource(sourceText, sourcePath) {
  if (typeof stripTypeScriptTypes === 'function') {
    return stripTypeScriptTypes(sourceText, { mode: 'transform', sourceUrl: sourcePath })
  }
  try {
    const ts = require('typescript')
    return ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: sourcePath,
      reportDiagnostics: false,
    }).outputText
  } catch (_) {
    fail('jsonrpc-smoke-failed', 'run verifier with Node TypeScript transform support or install TypeScript for review preview smoke', 'preview-transpile')
  }
}

function loadKernelModule(extRoot) {
  const distCandidate = path.join(extRoot, 'dist', 'core', 'kernel.js')
  if (fs.existsSync(distCandidate)) return { kernel: require(distCandidate), cleanup() {} }

  const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0630-review-preview-core-'))
  fs.mkdirSync(path.join(distRoot, 'core'), { recursive: true })
  for (const rel of ['core/readModelFingerprint.ts', 'core/kernelPackagedResolver.ts', 'core/kernel.ts']) {
    const sourcePath = path.join(extRoot, rel)
    const out = transpileTypeScriptSource(fs.readFileSync(sourcePath, 'utf8'), sourcePath)
    fs.writeFileSync(path.join(distRoot, rel.replace(/\.ts$/, '.js')), out, 'utf8')
  }
  return {
    kernel: require(path.join(distRoot, 'core', 'kernel.js')),
    cleanup() {
      fs.rmSync(distRoot, { recursive: true, force: true })
    },
  }
}

function assertNoMetadataLeaks(values, forbiddenRoots) {
  const text = values.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join('\n')
  for (const forbiddenRoot of forbiddenRoots) {
    if (!forbiddenRoot) continue
    const normalized = path.resolve(forbiddenRoot)
    if (text.includes(normalized)) fail('artifact-index-invalid', 'regenerate verifier metadata without absolute paths', 'path-leak')
  }
}

function safeRelPath(root, relPath, label) {
  if (typeof relPath !== 'string' || relPath.length === 0 || path.isAbsolute(relPath) || relPath.includes('\\')) {
    fail('path-unsafe', 'extract review artifact bundle with package-relative paths only', label)
  }
  const parts = relPath.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) {
    fail('path-unsafe', 'extract review artifact bundle with package-relative paths only', label)
  }
  const resolved = path.resolve(root, ...parts)
  if (!isInside(path.resolve(root), resolved)) fail('path-unsafe', 'extract review artifact bundle under artifact root', label)
  return { relPath, fullPath: resolved }
}

function readJsonFile(filePath, failureKind, hint) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!isRecord(value)) fail(failureKind, 'regenerate review artifact metadata JSON', hint)
    return value
  } catch (error) {
    if (error instanceof GoHelperArtifactVerifierError) throw error
    fail(failureKind, 'regenerate review artifact metadata JSON', hint)
  }
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

function findUniqueRel(root, filename, failureKind) {
  const files = walkFiles(root).filter(file => path.basename(file) === filename)
  if (files.length !== 1) fail(failureKind, `provide exactly one ${filename} in review artifact root`, filename)
  return toPosix(path.relative(root, files[0]))
}

function resolveArtifactIndex(root, explicitRelPath) {
  const relPath = explicitRelPath || findUniqueRel(root, ARTIFACT_INDEX_FILENAME, 'artifact-index-missing')
  const resolved = safeRelPath(root, relPath, 'artifact-index')
  if (!fs.existsSync(resolved.fullPath)) fail('artifact-index-missing', 'download or generate review artifact index', 'artifact-index')
  return resolved
}

function validateIndexIdentity(index) {
  if (index.schemaVersion !== 1) fail('artifact-index-invalid', 'regenerate artifact-index schema', 'schema')
  if (index.packageName !== PACKAGE_NAME || index.packageVersion !== PACKAGE_VERSION) fail('package-mismatch', 'verify matching pi-agentteam review artifact', 'package')
  if (index.module !== MODULE || index.capability !== MODULE) fail('module-mismatch', 'verify tmuxSnapshotParse review artifact', 'module')
  if (index.helperVersion !== HELPER_VERSION || index.protocolVersion !== PROTOCOL_VERSION) fail('version-skew', 'verify matching helper/protocol version', 'version')
  if (!isRecord(index.platform) || typeof index.target !== 'string' || !index.target) fail('unsupported-platform', 'regenerate target/platform metadata', 'platform')
  if (index.reviewOnly !== true || index.releaseAsset !== false || index.installSource !== false || index.normalUserAvailability !== false) {
    fail('artifact-index-invalid', 'regenerate review-only artifact index flags', 'review-flags')
  }
  if (!isRecord(index.retentionHint) || index.retentionHint.kind !== 'github-actions-artifact' || index.retentionHint.days !== REVIEW_RETENTION_DAYS || index.expiresHint !== `retention-days:${REVIEW_RETENTION_DAYS}`) {
    fail('artifact-index-invalid', 'regenerate review artifact retention metadata', 'retention')
  }
  if (typeof index.sourceRevision !== 'string' || !index.sourceRevision) fail('artifact-index-invalid', 'regenerate source revision metadata', 'source')
}

function validateIndexFiles(root, index) {
  if (!Array.isArray(index.files)) fail('artifact-index-invalid', 'regenerate artifact-index file list', 'files')
  const required = new Set(['helper', 'manifest', 'checksums', 'provenance', 'license', 'license-metadata', 'attestation'])
  const byKind = new Map()
  for (const row of index.files) {
    if (!isRecord(row) || typeof row.kind !== 'string' || typeof row.path !== 'string' || typeof row.sha256 !== 'string' || typeof row.size !== 'number') {
      fail('artifact-index-invalid', 'regenerate artifact-index file rows', 'file-row')
    }
    if (!required.has(row.kind) || byKind.has(row.kind)) fail('artifact-index-invalid', 'regenerate artifact-index required file kinds', 'file-kind')
    if (!/^[a-f0-9]{64}$/i.test(row.sha256) || !Number.isFinite(row.size) || row.size < 0) fail('artifact-index-invalid', 'regenerate artifact-index hash/size metadata', row.kind)
    let resolved
    try {
      resolved = safeRelPath(root, row.path, row.kind)
    } catch (error) {
      if (error instanceof GoHelperArtifactVerifierError && error.failureKind === 'path-unsafe') throw error
      throw error
    }
    if (!fs.existsSync(resolved.fullPath)) fail(row.kind === 'helper' ? 'helper-missing' : 'integrity-mismatch', 'download complete review artifact bundle', row.kind)
    const stat = fs.statSync(resolved.fullPath)
    if (stat.size !== row.size || sha256File(resolved.fullPath) !== row.sha256.toLowerCase()) fail('integrity-mismatch', 'redownload review artifact bundle and rerun verifier', row.kind)
    byKind.set(row.kind, { row, resolved })
  }
  for (const kind of required) if (!byKind.has(kind)) fail('artifact-index-invalid', 'regenerate artifact-index required file kinds', kind)
  return byKind
}

function parseChecksums(checksumPath) {
  const rows = new Map()
  let source
  try {
    source = fs.readFileSync(checksumPath, 'utf8')
  } catch (_) {
    fail('integrity-mismatch', 'redownload checksum metadata', 'checksums')
  }
  for (const line of source.split('\n')) {
    if (!line.trim()) continue
    const match = line.match(/^([a-f0-9]{64})  (.+)$/i)
    if (!match) fail('integrity-mismatch', 'regenerate checksum manifest', 'checksum-format')
    rows.set(match[2], match[1].toLowerCase())
  }
  return rows
}

function validateManifest(root, manifestRelPath, index) {
  const manifestResolved = safeRelPath(root, manifestRelPath, 'manifest')
  if (!fs.existsSync(manifestResolved.fullPath)) fail('manifest-missing', 'download review artifact manifest', 'manifest')
  const manifest = readJsonFile(manifestResolved.fullPath, 'manifest-invalid', 'manifest-json')
  if (manifest.schemaVersion !== 1) fail('manifest-invalid', 'regenerate helper manifest schema', 'schema')
  if (manifest.packageName !== PACKAGE_NAME || manifest.packageVersion !== PACKAGE_VERSION) fail('package-mismatch', 'verify matching pi-agentteam artifact manifest', 'package')
  if (manifest.module !== MODULE) fail('module-mismatch', 'verify tmuxSnapshotParse helper manifest', 'module')
  if (manifest.helperVersion !== HELPER_VERSION || manifest.protocolVersion !== PROTOCOL_VERSION || manifest.helperVersion !== index.helperVersion || manifest.protocolVersion !== index.protocolVersion) fail('version-skew', 'verify matching helper/protocol version', 'version')
  if (!Array.isArray(manifest.capabilities) || !REQUIRED_CAPABILITIES.every(capability => manifest.capabilities.includes(capability)) || !manifest.capabilities.includes(MODULE)) fail('capability-skew', 'verify helper capabilities', 'capability')
  if (manifest.businessPathsConnected !== false) fail('manifest-invalid', 'reject helper artifact with business path authority', 'authority')
  if (manifest.target !== index.target || JSON.stringify(manifest.platform) !== JSON.stringify(index.platform)) fail('unsupported-platform', 'verify artifact target/platform metadata', 'platform')

  const files = manifest.files
  const artifact = manifest.artifact
  const license = manifest.license
  const attestation = manifest.attestation
  if (!isRecord(files) || !isRecord(artifact) || !isRecord(license) || !isRecord(attestation)) fail('manifest-invalid', 'regenerate manifest file metadata', 'shape')
  const rels = {
    helper: files.helper,
    manifest: files.manifest,
    checksums: files.checksums,
    provenance: files.provenance,
    license: files.license,
    licenseMetadata: files.licenseMetadata,
    attestation: files.attestation,
    artifact: artifact.path,
    licensePath: license.path,
    licenseMetadataPath: license.metadataPath,
    attestationPath: attestation.path,
  }
  const paths = {}
  for (const [name, relPath] of Object.entries(rels)) paths[name] = safeRelPath(root, relPath, name)
  if (paths.manifest.relPath !== manifestRelPath || paths.helper.relPath !== paths.artifact.relPath) fail('manifest-invalid', 'regenerate aligned manifest paths', 'manifest-paths')
  if (paths.license.relPath !== paths.licensePath.relPath || paths.licenseMetadata.relPath !== paths.licenseMetadataPath.relPath || paths.attestation.relPath !== paths.attestationPath.relPath) fail('manifest-invalid', 'regenerate aligned metadata paths', 'metadata-paths')

  for (const [name, resolved] of Object.entries(paths)) {
    if (!fs.existsSync(resolved.fullPath)) {
      if (name === 'helper' || name === 'artifact') fail('helper-missing', 'download review artifact helper', 'helper')
      if (name === 'provenance') fail('provenance-missing', 'download review artifact provenance', 'provenance')
      if (name === 'license' || name === 'licenseMetadata' || name === 'licensePath' || name === 'licenseMetadataPath') fail('license-missing', 'download review artifact license metadata', 'license')
      if (name === 'attestation' || name === 'attestationPath') fail('attestation-invalid', 'download placeholder attestation', 'attestation')
      fail('integrity-mismatch', 'download complete review artifact bundle', name)
    }
  }

  const helperStat = fs.statSync(paths.helper.fullPath)
  if (helperStat.size !== artifact.size || sha256File(paths.helper.fullPath) !== String(artifact.sha256 || '').toLowerCase()) fail('integrity-mismatch', 'redownload helper artifact and rerun verifier', 'helper-integrity')
  if (manifest.platform.os === 'win32') {
    if (!String(artifact.filename || '').endsWith('.exe') || artifact.mode !== 'extension-policy') fail('artifact-not-executable', 'regenerate Windows executable metadata', 'executable')
  } else if ((helperStat.mode & 0o111) === 0 || !/^0[0-7]{3}$/.test(String(artifact.mode || ''))) {
    fail('artifact-not-executable', 'regenerate executable helper artifact', 'executable')
  }

  const checksums = parseChecksums(paths.checksums.fullPath)
  for (const name of ['helper', 'manifest', 'provenance', 'license', 'licenseMetadata', 'attestation']) {
    const expected = checksums.get(paths[name].relPath)
    if (!expected || expected !== sha256File(paths[name].fullPath)) fail('integrity-mismatch', 'redownload checksum-matching review artifact bundle', `checksum-${name}`)
  }

  validateProvenance(manifest, paths)
  validateLicense(manifest, paths)
  validateAttestation(manifest, paths)
  return { manifest, paths }
}

function validateProvenance(manifest, paths) {
  const provenance = readJsonFile(paths.provenance.fullPath, 'provenance-missing', 'provenance-json')
  if (provenance.schemaVersion !== 1 || provenance.packageName !== PACKAGE_NAME || provenance.packageVersion !== PACKAGE_VERSION || provenance.module !== MODULE) fail('provenance-missing', 'regenerate provenance identity metadata', 'provenance-identity')
  if (!isRecord(provenance.source) || provenance.source.path !== 'kernel/go/agentteam-kernel' || !provenance.source.revision) fail('provenance-missing', 'regenerate source provenance metadata', 'source')
  if (!isRecord(provenance.build) || !Array.isArray(provenance.build.command) || provenance.build.command.join(' ') !== `go build -trimpath -o ${paths.helper.relPath} .` || !isRecord(provenance.build.env) || provenance.build.env.GO111MODULE !== 'off' || !provenance.build.toolchain || !provenance.build.generatedAt || !provenance.build.runIdentity) fail('provenance-missing', 'regenerate build provenance metadata', 'build')
  if (!isRecord(provenance.smoke) || provenance.smoke.health !== true || !isRecord(provenance.smoke[MODULE])) fail('provenance-missing', 'regenerate smoke provenance metadata', 'smoke')
  if (!isRecord(manifest.source) || manifest.source.path !== provenance.source.path || manifest.source.revision !== provenance.source.revision) fail('provenance-missing', 'regenerate matching manifest/provenance source metadata', 'source-match')
}

function validateLicense(manifest, paths) {
  const license = manifest.license
  if (!isRecord(license) || license.name !== 'MIT' || license.path !== paths.license.relPath || license.metadataPath !== paths.licenseMetadata.relPath || license.sha256 !== sha256File(paths.license.fullPath) || license.metadataSha256 !== sha256File(paths.licenseMetadata.fullPath)) fail('license-missing', 'regenerate manifest license metadata', 'manifest-license')
  const licenseMetadata = readJsonFile(paths.licenseMetadata.fullPath, 'license-missing', 'license-json')
  if (licenseMetadata.schemaVersion !== 1 || licenseMetadata.name !== 'MIT' || licenseMetadata.packageName !== PACKAGE_NAME || licenseMetadata.module !== MODULE || licenseMetadata.path !== paths.license.relPath || licenseMetadata.sha256 !== sha256File(paths.license.fullPath)) fail('license-missing', 'regenerate license metadata body', 'license-body')
}

function validateAttestation(manifest, paths) {
  const attestation = manifest.attestation
  if (!isRecord(attestation) || attestation.path !== paths.attestation.relPath || attestation.kind !== 'placeholder-only' || attestation.signed !== false || attestation.sha256 !== sha256File(paths.attestation.fullPath)) fail('attestation-invalid', 'regenerate manifest attestation metadata', 'manifest-attestation')
  let body
  try {
    body = JSON.parse(fs.readFileSync(paths.attestation.fullPath, 'utf8').trim())
  } catch (_) {
    fail('attestation-invalid', 'regenerate placeholder attestation JSON', 'attestation-json')
  }
  if (!isRecord(body) || !isRecord(body.predicate) || body.predicate.placeholderOnly !== true || body.predicate.signed !== false || body.predicate.signing !== 'not-real-signing') fail('attestation-invalid', 'reject non-placeholder attestation claim', 'attestation-placeholder')
}

function runJsonRpc(helperPath, request, failureHint) {
  const result = cp.spawnSync(helperPath, [], {
    input: `${JSON.stringify(request)}\n`,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, PATH: process.env.PATH || '' },
  })
  if (result.error || result.status !== 0) fail('jsonrpc-smoke-failed', 'reject helper artifact that cannot answer JSON-RPC smoke', failureHint)
  try {
    const line = String(result.stdout || '').split('\n').find(value => value.trim())
    const response = JSON.parse(line || '')
    if (!response || response.jsonrpc !== '2.0' || response.error || !isRecord(response.result) || response.result.ok !== true) fail('jsonrpc-smoke-failed', 'reject invalid JSON-RPC smoke response', failureHint)
    return response.result
  } catch (error) {
    if (error instanceof GoHelperArtifactVerifierError) throw error
    fail('jsonrpc-smoke-failed', 'reject non-JSON helper smoke response', failureHint)
  }
}

function previewInput() {
  return {
    mode: 'attached',
    team: { name: 'ci-review-preview', leaderCwd: '/tmp/ci-review-preview' },
    members: [{ name: 'team-lead', role: 'leader', status: 'idle', text: 'MUST_NOT_BE_INCLUDED' }],
    tasks: [],
    mailbox: [],
  }
}

function throwingTmuxFallback() {
  throw new Error('TypeScript tmux fallback must not run during review artifact packaged preview smoke')
}

function runExplicitPreviewSmoke(options) {
  const artifactRoot = options.artifactRoot
  const manifestRelPath = options.manifestRelPath
  const extRoot = path.resolve(options.extRoot || process.cwd())
  const loader = options.kernelModule ? { kernel: options.kernelModule, cleanup() {} } : loadKernelModule(extRoot)
  try {
    const adapter = loader.kernel.createAgentTeamKernelAdapter({
      mode: 'go-packaged-preview',
      packagedHelperInstallRoot: artifactRoot,
      packagedHelperManifestPath: manifestRelPath,
      env: { PATH: process.env.PATH || '' },
    })

    const beforeFingerprintCalls = adapter.metadata().kernel.calls
    const fingerprint = adapter.compactReadModelFingerprint(previewInput())
    const afterFingerprintCalls = adapter.metadata().kernel.calls
    if (!fingerprint || fingerprint.ok !== true || fingerprint.readOnly !== true || fingerprint.fullTextIncluded !== false || afterFingerprintCalls !== beforeFingerprintCalls) {
      fail('jsonrpc-smoke-failed', 'reject review artifact whose packaged preview fingerprint does not stay TypeScript fallback', 'preview-fingerprint')
    }

    const snapshot = adapter.parseTmuxPaneSnapshot('%1\treview:@1\tpreview-lead\tpi', 1700009000000, throwingTmuxFallback)
    if (!snapshot || snapshot.ok !== true || snapshot.capturedAt !== 1700009000000 || !snapshot.byPaneId || !snapshot.byPaneId['%1']) {
      fail('jsonrpc-smoke-failed', 'reject review artifact whose explicit packaged preview cannot parse tmux snapshot', 'preview-tmuxSnapshotParse')
    }
    const metadata = adapter.metadata().kernel
    if (metadata.requestedMode !== 'go-packaged-preview' || metadata.mode !== 'go' || metadata.enabled !== true || metadata.cutoverStatus !== 'active' || metadata.calls !== beforeFingerprintCalls + 2 || metadata.fallbacks !== 0) {
      fail('jsonrpc-smoke-failed', 'reject review artifact whose explicit packaged preview does not use helper cleanly', 'preview-metadata')
    }
    return {
      packagedManifestResolved: true,
      tmuxSnapshotParse: true,
      compactReadModelFingerprint: 'typescript-fallback',
    }
  } catch (error) {
    if (error instanceof GoHelperArtifactVerifierError) throw error
    fail('jsonrpc-smoke-failed', 'reject review artifact whose explicit packaged preview smoke fails', 'preview')
  } finally {
    loader.cleanup()
  }
}

function runDirectSmoke(helperPath, manifest) {
  const health = runJsonRpc(helperPath, { jsonrpc: '2.0', id: 'health', method: 'health', params: {} }, 'health')
  if (health.implementation !== 'go' || health.protocolVersion !== PROTOCOL_VERSION || health.helperVersion !== HELPER_VERSION || !Array.isArray(health.capabilities) || !REQUIRED_CAPABILITIES.every(capability => health.capabilities.includes(capability)) || health.businessPathsConnected !== false) fail('jsonrpc-smoke-failed', 'reject helper with incompatible health response', 'health-shape')
  const snapshot = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'tmuxSnapshotParse',
    method: MODULE,
    params: {
      stdout: '%1\ttest:@1\tteam-lead\tpi',
      capturedAt: 1700008000000,
    },
  }, MODULE)
  if (snapshot.capturedAt !== 1700008000000 || !Array.isArray(snapshot.panes) || !snapshot.byPaneId || !snapshot.byPaneId['%1']) fail('jsonrpc-smoke-failed', 'reject helper with invalid tmuxSnapshotParse response', 'tmuxSnapshotParse-shape')
  if (manifest.module !== MODULE) fail('module-mismatch', 'verify helper smoke module', 'smoke-module')
  return { health: true, tmuxSnapshotParse: true }
}

function verifyGoHelperArtifact(options = {}) {
  const artifactRoot = path.resolve(options.artifactRoot || options.root || '')
  if (!artifactRoot || !fs.existsSync(artifactRoot) || !fs.statSync(artifactRoot).isDirectory()) fail('artifact-root-invalid', 'provide downloaded review artifact root directory', 'artifact-root')
  const indexResolved = resolveArtifactIndex(artifactRoot, options.artifactIndexPath)
  const index = readJsonFile(indexResolved.fullPath, 'artifact-index-invalid', 'artifact-index-json')
  validateIndexIdentity(index)
  const indexFiles = validateIndexFiles(artifactRoot, index)
  const manifestRel = options.manifestPath || indexFiles.get('manifest').row.path
  const { manifest, paths } = validateManifest(artifactRoot, manifestRel, index)
  const directSmoke = runDirectSmoke(paths.helper.fullPath, manifest)
  const explicitPreview = runExplicitPreviewSmoke({
    artifactRoot,
    manifestRelPath: paths.manifest.relPath,
    extRoot: options.extRoot,
    kernelModule: options.kernelModule,
  })
  const summary = {
    ok: true,
    status: 'available',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'review-artifact-reverified',
    packageName: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    helperVersion: HELPER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    target: index.target,
    platform: index.platform,
    reviewOnly: true,
    releaseAsset: false,
    installSource: false,
    normalUserAvailability: false,
    files: {
      artifactIndex: indexResolved.relPath,
      manifest: paths.manifest.relPath,
      helper: paths.helper.relPath,
      checksums: paths.checksums.relPath,
      provenance: paths.provenance.relPath,
      license: paths.license.relPath,
      licenseMetadata: paths.licenseMetadata.relPath,
      attestation: paths.attestation.relPath,
    },
    directSmoke,
    explicitPreview,
  }
  assertNoMetadataLeaks([summary], [artifactRoot, process.cwd()])
  return { summary, index, manifest, helperPath: paths.helper.fullPath, manifestPath: paths.manifest.fullPath, artifactRoot }
}

module.exports = {
  ARTIFACT_INDEX_FILENAME,
  FAILURE_KINDS,
  MODULE,
  GoHelperArtifactVerifierError,
  compactFailure,
  verifyGoHelperArtifact,
}
