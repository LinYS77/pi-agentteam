const cp = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const MODULE = 'tmuxSnapshotParse'
const PACKAGE_NAME = 'pi-agentteam'
const BUILDER_VERSION = '0.6.29-slice1-local-builder'
const REPO_ARTIFACT_DIR = '.agentteam-artifacts'
const HELPER_BASE = 'agentteam-tmuxSnapshotParse'
const FAILURE_KINDS = new Set([
  'go-unavailable',
  'go-build-failed',
  'go-health-failed',
  'metadata-invalid',
  'output-root-forbidden',
  'unsupported-platform',
])

class GoHelperArtifactBuilderError extends Error {
  constructor(failureKind, remediation, hint) {
    super(failureKind)
    this.name = 'GoHelperArtifactBuilderError'
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
  throw new GoHelperArtifactBuilderError(failureKind, remediation, hint)
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
}

function isInside(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function safeSegment(value, label) {
  const text = String(value || '')
  if (!/^[A-Za-z0-9._-]+$/.test(text)) fail('metadata-invalid', `regenerate safe ${label} metadata`, label)
  return text
}

function packageRelative(outputRoot, filePath) {
  const root = path.resolve(outputRoot)
  const resolved = path.resolve(filePath)
  if (!isInside(root, resolved)) fail('metadata-invalid', 'regenerate package-relative artifact paths', 'path')
  return toPosix(path.relative(root, resolved))
}

function classifyOutputRoot(outputRoot, extRoot) {
  const resolved = path.resolve(outputRoot)
  const repoArtifactRoot = path.resolve(extRoot, REPO_ARTIFACT_DIR)
  if (isInside(repoArtifactRoot, resolved)) return 'repo-ignored-artifacts'
  return 'os-temp'
}

function assertAllowedOutputRoot(outputRoot, extRoot) {
  const resolved = path.resolve(outputRoot)
  const root = path.resolve(extRoot)
  const repoArtifactRoot = path.resolve(root, REPO_ARTIFACT_DIR)
  const tmpRoot = path.resolve(os.tmpdir())

  if (isInside(root, resolved) && !isInside(repoArtifactRoot, resolved)) {
    fail('output-root-forbidden', `write only under OS temp or ignored ${REPO_ARTIFACT_DIR}`, 'repo-output')
  }
  if (!isInside(tmpRoot, resolved) && !isInside(repoArtifactRoot, resolved)) {
    fail('output-root-forbidden', `write only under OS temp or ignored ${REPO_ARTIFACT_DIR}`, 'output-root')
  }
}

function resolveOutputRoot(options) {
  const extRoot = path.resolve(options.extRoot || path.resolve(__dirname, '..', '..'))
  const outputRoot = options.outputRoot
    ? path.resolve(options.outputRoot)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0629-helper-artifact-'))
  assertAllowedOutputRoot(outputRoot, extRoot)
  fs.mkdirSync(outputRoot, { recursive: true })
  return { extRoot, outputRoot, outputRootKind: classifyOutputRoot(outputRoot, extRoot) }
}

function detectLinuxLibc(env = process.env) {
  try {
    const report = typeof process.report?.getReport === 'function' ? process.report.getReport() : null
    if (report?.header?.glibcVersionRuntime) return 'glibc'
  } catch (_) {}

  const result = cp.spawnSync('ldd', ['--version'], {
    encoding: 'utf8',
    timeout: 5_000,
    env: { ...process.env, ...env },
  })
  const text = `${result.stdout || ''}\n${result.stderr || ''}`.toLowerCase()
  if (text.includes('musl')) return 'musl'
  if (text.includes('glibc') || text.includes('gnu libc')) return 'glibc'
  return 'unknown'
}

function resolveHostTarget(options = {}) {
  const platform = options.platform || process.platform
  const arch = options.arch || process.arch
  const supportedArch = new Set(['x64', 'arm64'])
  if (!supportedArch.has(arch)) fail('unsupported-platform', 'add an explicit supported host target before building', 'arch')

  if (platform === 'linux') {
    const libc = options.libc || detectLinuxLibc(options.env)
    const target = `linux-${safeSegment(arch, 'arch')}-${safeSegment(libc, 'libc')}`
    return { os: 'linux', arch, libc, target, helperFile: HELPER_BASE }
  }
  if (platform === 'darwin') return { os: 'darwin', arch, target: `darwin-${safeSegment(arch, 'arch')}`, helperFile: HELPER_BASE }
  if (platform === 'win32') return { os: 'win32', arch, target: `win32-${safeSegment(arch, 'arch')}`, helperFile: `${HELPER_BASE}.exe` }
  fail('unsupported-platform', 'add an explicit supported host target before building', 'os')
}

function readPackageVersion(extRoot) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(extRoot, 'package.json'), 'utf8'))
    return String(packageJson.version || '')
  } catch (_) {
    fail('metadata-invalid', 'read package version before generating artifact metadata', 'package')
  }
}

function readGoSourceMetadata(extRoot) {
  const sourcePath = path.join(extRoot, 'kernel', 'go', 'agentteam-kernel', 'main.go')
  let source
  try {
    source = fs.readFileSync(sourcePath, 'utf8')
  } catch (_) {
    fail('metadata-invalid', 'read Go helper source before generating artifact metadata', 'source')
  }
  const helperVersion = source.match(/const\s+helperVersion\s*=\s*"([^"]+)"/)?.[1]
  const protocolVersion = Number(source.match(/const\s+protocolVersion\s*=\s*(\d+)/)?.[1])
  const capabilitiesBody = source.match(/var\s+capabilities\s*=\s*\[\]string\{([^}]+)\}/s)?.[1] || ''
  const capabilities = [...capabilitiesBody.matchAll(/"([^"]+)"/g)].map(match => match[1])
  if (!helperVersion || !Number.isInteger(protocolVersion) || capabilities.length === 0) {
    fail('metadata-invalid', 'read helper version/protocol/capabilities from Go source', 'source-metadata')
  }
  return { helperVersion, protocolVersion, capabilities, sourceRel: 'kernel/go/agentteam-kernel' }
}

function readSourceRevision(extRoot, env) {
  const result = cp.spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: extRoot,
    encoding: 'utf8',
    timeout: 5_000,
    env: { ...process.env, ...env },
  })
  const revision = String(result.stdout || '').trim()
  return result.status === 0 && /^[0-9a-f]{7,40}$/i.test(revision) ? revision : 'unknown-local-revision'
}

function goVersion(env, cwd) {
  const result = cp.spawnSync('go', ['version'], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, ...env },
  })
  if (result.error || result.status !== 0) fail('go-unavailable', 'install Go or run on a reviewer/CI host with Go available', 'go-version')
  const version = String(result.stdout || '').trim()
  return version || 'go-version-unknown'
}

function buildHelper(helperDir, helperPath, env, timeoutMs) {
  const result = cp.spawnSync('go', ['build', '-trimpath', '-o', helperPath, '.'], {
    cwd: helperDir,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...env, GO111MODULE: 'off' },
  })
  if (result.error || result.status !== 0) fail('go-build-failed', 'fix local Go build inputs and rerun the explicit artifact builder', 'go-build')
}

function normalizeHelperExecutable(helperPath, target) {
  if (target.os === 'win32') return
  try {
    fs.chmodSync(helperPath, 0o755)
  } catch (_) {
    fail('metadata-invalid', 'normalize helper executable bit before smoke validation', 'executable')
  }
}

function runJsonRpc(helperPath, request, env, timeoutMs, failureHint) {
  const input = `${JSON.stringify(request)}\n`
  const result = cp.spawnSync(helperPath, [], {
    input,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...env, PATH: env.PATH || process.env.PATH || '' },
  })
  if (result.error || result.status !== 0) fail('go-health-failed', 'reject helper artifact that cannot answer smoke RPC', failureHint)
  try {
    const line = String(result.stdout || '').split('\n').find(value => value.trim())
    const response = JSON.parse(line || '')
    if (!response || response.jsonrpc !== '2.0' || response.error || !response.result || response.result.ok !== true) {
      fail('go-health-failed', 'reject helper artifact with invalid smoke RPC envelope', failureHint)
    }
    return response.result
  } catch (error) {
    if (error instanceof GoHelperArtifactBuilderError) throw error
    fail('go-health-failed', 'reject helper artifact with non-JSON smoke RPC response', failureHint)
  }
}

function runHealth(helperPath, env, timeoutMs) {
  return runJsonRpc(helperPath, { jsonrpc: '2.0', id: 'health', method: 'health', params: {} }, env, timeoutMs, 'health')
}

function runTmuxSnapshotParseSmoke(helperPath, env, timeoutMs) {
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'tmuxSnapshotParse',
    method: 'tmuxSnapshotParse',
    params: {
      stdout: '%1\ttest:@1\tteam-lead\tpi',
      capturedAt: 1700000000000,
    },
  }, env, timeoutMs, 'tmuxSnapshotParse')
  if (result.capturedAt !== 1700000000000 || !Array.isArray(result.panes) || !result.byPaneId || !result.byPaneId['%1']) {
    fail('go-health-failed', 'reject helper artifact with invalid tmuxSnapshotParse smoke result', 'tmuxSnapshotParse')
  }
  return { ok: true, paneCount: result.panes.length, capturedAt: result.capturedAt }
}

function assertHealthMatchesSource(health, sourceMetadata) {
  if (health.implementation !== 'go') fail('go-health-failed', 'reject non-Go helper health response', 'implementation')
  if (health.helperVersion !== sourceMetadata.helperVersion) fail('metadata-invalid', 'reject helper version skew before writing metadata', 'helper-version')
  if (health.protocolVersion !== sourceMetadata.protocolVersion) fail('metadata-invalid', 'reject protocol skew before writing metadata', 'protocol')
  const capabilities = Array.isArray(health.capabilities) ? health.capabilities : []
  if (!capabilities.includes(MODULE)) fail('metadata-invalid', 'reject helper without tmuxSnapshotParse capability', 'capability')
}

function assertNoMetadataLeaks(values, forbiddenRoots) {
  const text = values.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join('\n')
  for (const forbiddenRoot of forbiddenRoots) {
    if (!forbiddenRoot) continue
    const normalized = path.resolve(forbiddenRoot)
    if (text.includes(normalized)) fail('metadata-invalid', 'regenerate metadata without absolute paths', 'path-leak')
  }
}

function writeMetadata(input) {
  const {
    extRoot,
    outputRoot,
    outputRootKind,
    target,
    helperPath,
    health,
    sourceMetadata,
    packageVersion,
    sourceRevision,
    toolchain,
    generatedAt,
    runIdentity,
    parserSmoke,
  } = input
  const artifactDir = path.dirname(helperPath)
  const helperStat = fs.statSync(helperPath)
  if (target.os !== 'win32') fs.chmodSync(helperPath, 0o755)
  const normalizedStat = fs.statSync(helperPath)
  const executable = target.os === 'win32' ? target.helperFile.endsWith('.exe') : (normalizedStat.mode & 0o111) !== 0
  if (!executable) fail('metadata-invalid', 'normalize helper executable bit before writing metadata', 'executable')

  const helperRel = packageRelative(outputRoot, helperPath)
  const licenseSource = path.join(extRoot, 'LICENSE')
  const licensePath = path.join(artifactDir, 'LICENSE')
  fs.copyFileSync(licenseSource, licensePath)
  const licenseRel = packageRelative(outputRoot, licensePath)
  const helperSha = sha256File(helperPath)
  const licenseSha = sha256File(licensePath)

  const provenancePath = path.join(artifactDir, 'provenance.json')
  const provenanceRel = packageRelative(outputRoot, provenancePath)
  const provenance = {
    schemaVersion: 1,
    builderVersion: BUILDER_VERSION,
    packageName: PACKAGE_NAME,
    packageVersion,
    module: MODULE,
    source: {
      path: sourceMetadata.sourceRel,
      revision: sourceRevision,
    },
    build: {
      command: ['go', 'build', '-trimpath', '-o', helperRel, '.'],
      env: { GO111MODULE: 'off' },
      cwd: sourceMetadata.sourceRel,
      toolchain,
      runIdentity,
      generatedAt,
    },
    smoke: {
      health: true,
      tmuxSnapshotParse: parserSmoke,
    },
    outputRootKind,
  }
  writeJson(provenancePath, provenance)

  const licenseMetadataPath = path.join(artifactDir, 'license.json')
  const licenseMetadataRel = packageRelative(outputRoot, licenseMetadataPath)
  const licenseMetadata = {
    schemaVersion: 1,
    name: 'MIT',
    packageName: PACKAGE_NAME,
    module: MODULE,
    path: licenseRel,
    sha256: licenseSha,
  }
  writeJson(licenseMetadataPath, licenseMetadata)

  const attestationPath = path.join(artifactDir, 'attestation.intoto.jsonl')
  const attestationRel = packageRelative(outputRoot, attestationPath)
  const attestation = {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: helperRel, digest: { sha256: helperSha } }],
    predicateType: 'https://pi-agentteam.local/placeholder-attestation/v0.6.29',
    predicate: {
      placeholderOnly: true,
      signed: false,
      signing: 'not-real-signing',
      reason: 'reviewer-local-build-only',
    },
  }
  fs.writeFileSync(attestationPath, `${JSON.stringify(attestation)}\n`, 'utf8')

  const manifestPath = path.join(artifactDir, 'manifest.json')
  const manifestRel = packageRelative(outputRoot, manifestPath)
  const manifest = {
    schemaVersion: 1,
    packageName: PACKAGE_NAME,
    packageVersion,
    module: MODULE,
    helperVersion: health.helperVersion,
    protocolVersion: health.protocolVersion,
    capabilities: health.capabilities,
    businessPathsConnected: health.businessPathsConnected === true,
    target: target.target,
    platform: {
      os: target.os,
      arch: target.arch,
      libc: target.libc || 'not-applicable',
    },
    artifact: {
      path: helperRel,
      filename: target.helperFile,
      size: helperStat.size,
      sha256: helperSha,
      executable: true,
      mode: target.os === 'win32' ? 'extension-policy' : `0${(normalizedStat.mode & 0o777).toString(8)}`,
    },
    files: {
      helper: helperRel,
      manifest: manifestRel,
      checksums: packageRelative(outputRoot, path.join(artifactDir, 'SHA256SUMS')),
      provenance: provenanceRel,
      license: licenseRel,
      licenseMetadata: licenseMetadataRel,
      attestation: attestationRel,
    },
    source: {
      path: sourceMetadata.sourceRel,
      revision: sourceRevision,
    },
    build: {
      command: ['go', 'build', '-trimpath', '-o', helperRel, '.'],
      env: { GO111MODULE: 'off' },
      cwd: sourceMetadata.sourceRel,
      toolchain,
      runIdentity,
      generatedAt,
    },
    smoke: {
      health: true,
      tmuxSnapshotParse: parserSmoke,
    },
    attestation: {
      path: attestationRel,
      kind: 'placeholder-only',
      signed: false,
      sha256: sha256File(attestationPath),
    },
    license: {
      name: 'MIT',
      path: licenseRel,
      sha256: licenseSha,
      metadataPath: licenseMetadataRel,
      metadataSha256: sha256File(licenseMetadataPath),
    },
  }
  writeJson(manifestPath, manifest)

  const checksumPath = path.join(artifactDir, 'SHA256SUMS')
  const checksumRows = [
    [helperSha, helperRel],
    [sha256File(manifestPath), manifestRel],
    [sha256File(provenancePath), provenanceRel],
    [licenseSha, licenseRel],
    [sha256File(licenseMetadataPath), licenseMetadataRel],
    [sha256File(attestationPath), attestationRel],
  ]
  fs.writeFileSync(checksumPath, checksumRows.map(([hash, rel]) => `${hash}  ${rel}`).join('\n') + '\n', 'utf8')

  assertNoMetadataLeaks([manifest, provenance, licenseMetadata, attestation, fs.readFileSync(checksumPath, 'utf8')], [extRoot, outputRoot, process.cwd()])

  return {
    helperPath,
    manifestPath,
    checksumPath,
    provenancePath,
    licensePath,
    licenseMetadataPath,
    attestationPath,
    manifest,
    summary: {
      ok: true,
      status: 'available',
      module: MODULE,
      capability: MODULE,
      resultMarker: 'local-helper-artifact-built',
      builderVersion: BUILDER_VERSION,
      outputRootKind,
      target: target.target,
      helperVersion: health.helperVersion,
      protocolVersion: health.protocolVersion,
      smoke: {
        health: true,
        tmuxSnapshotParse: true,
      },
      artifact: helperRel,
      files: {
        manifest: manifestRel,
        checksums: packageRelative(outputRoot, checksumPath),
        provenance: provenanceRel,
        license: licenseRel,
        licenseMetadata: licenseMetadataRel,
        attestation: attestationRel,
      },
    },
  }
}

function buildGoHelperArtifact(options = {}) {
  const { extRoot, outputRoot, outputRootKind } = resolveOutputRoot(options)
  const env = { ...process.env, ...(options.env || {}) }
  const timeoutMs = options.timeoutMs || 30_000
  const sourceMetadata = readGoSourceMetadata(extRoot)
  const packageVersion = readPackageVersion(extRoot)
  const target = resolveHostTarget({
    platform: options.platform,
    arch: options.arch,
    libc: options.libc,
    env,
  })

  const helperVersion = safeSegment(sourceMetadata.helperVersion, 'helper-version')
  const artifactDir = path.join(outputRoot, 'native', MODULE, helperVersion, safeSegment(target.target, 'target'))
  fs.mkdirSync(artifactDir, { recursive: true })
  const helperPath = path.join(artifactDir, target.helperFile)
  const helperDir = path.join(extRoot, 'kernel', 'go', 'agentteam-kernel')
  const toolchain = options.toolchain || goVersion(env, helperDir)
  const sourceRevision = options.sourceRevision || readSourceRevision(extRoot, env)
  const generatedAt = options.generatedAt || new Date().toISOString()
  const runIdentity = options.runIdentity || (env.GITHUB_RUN_ID ? `github-run-${env.GITHUB_RUN_ID}` : 'local-reviewer-run')

  buildHelper(helperDir, helperPath, env, timeoutMs)
  normalizeHelperExecutable(helperPath, target)
  const health = runHealth(helperPath, env, timeoutMs)
  assertHealthMatchesSource(health, sourceMetadata)
  const parserSmoke = runTmuxSnapshotParseSmoke(helperPath, env, timeoutMs)

  return {
    extRoot,
    outputRoot,
    outputRootKind,
    target,
    ...writeMetadata({
      extRoot,
      outputRoot,
      outputRootKind,
      target,
      helperPath,
      health,
      sourceMetadata,
      packageVersion,
      sourceRevision,
      toolchain,
      generatedAt,
      runIdentity,
      parserSmoke,
    }),
  }
}

module.exports = {
  BUILDER_VERSION,
  FAILURE_KINDS,
  MODULE,
  REPO_ARTIFACT_DIR,
  GoHelperArtifactBuilderError,
  assertAllowedOutputRoot,
  buildGoHelperArtifact,
  compactFailure,
  detectLinuxLibc,
  resolveHostTarget,
  resolveOutputRoot,
}
