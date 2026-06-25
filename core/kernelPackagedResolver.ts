import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export const AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_NAME = 'pi-agentteam'
export const AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_VERSION = '0.6.8'
export const AGENTTEAM_PACKAGED_RESOLVER_MODULE = 'tmuxSnapshotParse'
export const AGENTTEAM_PACKAGED_RESOLVER_PROTOCOL_VERSION = 1
export const AGENTTEAM_PACKAGED_RESOLVER_HELPER_VERSION = '0.3.0-read-model-shadow'
export const AGENTTEAM_PACKAGED_RESOLVER_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint'] as const
export const AGENTTEAM_PACKAGED_RESOLVER_BUSINESS_PATHS_CONNECTED = false

export type AgentTeamPackagedResolverPlatform = {
  os?: string
  arch?: string
  libc?: string
}

export type AgentTeamPackagedResolverInput = {
  installedRoot: string
  manifestPath: string
  platform?: AgentTeamPackagedResolverPlatform
}

export type AgentTeamPackagedResolverFailureKind =
  | 'manifest-missing'
  | 'manifest-invalid'
  | 'path-unsafe'
  | 'package-mismatch'
  | 'module-mismatch'
  | 'version-skew'
  | 'capability-skew'
  | 'unsupported-platform'
  | 'helper-missing'
  | 'integrity-mismatch'
  | 'artifact-not-executable'
  | 'provenance-missing'
  | 'license-missing'
  | 'attestation-invalid'

export type AgentTeamPackagedResolverCutoverFailureKind =
  | 'missing-helper'
  | 'disabled-helper'
  | 'helper-unsupported-protocol'
  | 'helper-unsupported-version'
  | 'helper-unsupported-capability'
  | 'helper-unsafe-response-shape'

export type AgentTeamPackagedResolverUnavailable = {
  status: 'unavailable'
  module: typeof AGENTTEAM_PACKAGED_RESOLVER_MODULE
  capability: typeof AGENTTEAM_PACKAGED_RESOLVER_MODULE
  resultMarker: 'fail-closed'
  failureKind: AgentTeamPackagedResolverFailureKind
  cutoverFailureKind: AgentTeamPackagedResolverCutoverFailureKind
  reason: string
  remediation: string
  hint: string
}

export type AgentTeamPackagedResolverAvailable = {
  status: 'available'
  module: typeof AGENTTEAM_PACKAGED_RESOLVER_MODULE
  capability: typeof AGENTTEAM_PACKAGED_RESOLVER_MODULE
  resultMarker: 'packaged-manifest-resolved'
  helperPath: string
  helper: {
    path: string
    basename: string
    size: number
    sha256: string
    executable: true
    mode: string
  }
  manifest: {
    path: string
    packageName: typeof AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_NAME
    packageVersion: typeof AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_VERSION
    helperVersion: typeof AGENTTEAM_PACKAGED_RESOLVER_HELPER_VERSION
    protocolVersion: typeof AGENTTEAM_PACKAGED_RESOLVER_PROTOCOL_VERSION
    target: string
    platform: Required<AgentTeamPackagedResolverPlatform>
  }
  attestation: {
    kind: 'placeholder-only'
    signed: false
  }
}

export type AgentTeamPackagedResolverResult = AgentTeamPackagedResolverAvailable | AgentTeamPackagedResolverUnavailable

type Manifest = Record<string, unknown>
type Checksums = Map<string, string>

type SafeResolvedPath = {
  relPath: string
  fullPath: string
}

const SUPPORTED_OS = new Set(['linux', 'darwin', 'win32'])
const SUPPORTED_ARCH = new Set(['x64', 'arm64'])
const SUPPORTED_LINUX_LIBC = new Set(['glibc', 'musl'])

function unavailable(failureKind: AgentTeamPackagedResolverFailureKind, hint: string, cutoverFailureKind = toCutoverFailureKind(failureKind)): AgentTeamPackagedResolverUnavailable {
  return {
    status: 'unavailable',
    module: AGENTTEAM_PACKAGED_RESOLVER_MODULE,
    capability: AGENTTEAM_PACKAGED_RESOLVER_MODULE,
    resultMarker: 'fail-closed',
    failureKind,
    cutoverFailureKind,
    reason: failureKind,
    remediation: remediationFor(failureKind),
    hint,
  }
}

function remediationFor(failureKind: AgentTeamPackagedResolverFailureKind): string {
  switch (failureKind) {
    case 'manifest-missing':
    case 'manifest-invalid':
    case 'path-unsafe':
      return 'regenerate packaged helper manifest metadata'
    case 'package-mismatch':
      return 'install matching pi-agentteam package artifacts'
    case 'module-mismatch':
    case 'capability-skew':
      return 'install helper artifact for tmuxSnapshotParse capability'
    case 'version-skew':
      return 'install helper artifact matching current kernel protocol and helper version'
    case 'unsupported-platform':
      return 'install a helper artifact for the current host platform'
    case 'helper-missing':
      return 'install packaged helper artifact before enabling packaged preview'
    case 'integrity-mismatch':
      return 'regenerate helper artifact checksums and metadata'
    case 'artifact-not-executable':
      return 'regenerate helper artifact with executable policy metadata'
    case 'provenance-missing':
      return 'regenerate provenance metadata for packaged helper artifact'
    case 'license-missing':
      return 'regenerate license metadata for packaged helper artifact'
    case 'attestation-invalid':
      return 'regenerate placeholder-only attestation metadata'
  }
}

function toCutoverFailureKind(failureKind: AgentTeamPackagedResolverFailureKind): AgentTeamPackagedResolverCutoverFailureKind {
  switch (failureKind) {
    case 'helper-missing':
      return 'missing-helper'
    case 'unsupported-platform':
      return 'disabled-helper'
    case 'version-skew':
      return 'helper-unsupported-version'
    case 'capability-skew':
    case 'module-mismatch':
      return 'helper-unsupported-capability'
    case 'manifest-invalid':
    case 'path-unsafe':
    case 'package-mismatch':
    case 'integrity-mismatch':
    case 'artifact-not-executable':
    case 'provenance-missing':
    case 'license-missing':
    case 'attestation-invalid':
      return 'helper-unsafe-response-shape'
    case 'manifest-missing':
      return 'missing-helper'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function numberValue(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanValue(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

function recordValue(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key]
  return isRecord(value) ? value : undefined
}

function stringArrayValue(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key]
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : undefined
}

function safeJson(filePath: string): unknown | undefined {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (_) {
    return undefined
  }
}

function sha256File(filePath: string): string | undefined {
  try {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex')
  } catch (_) {
    return undefined
  }
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function safePackageRelativePath(installedRoot: string, relPath: unknown): SafeResolvedPath | undefined {
  if (typeof relPath !== 'string') return undefined
  if (!relPath || path.isAbsolute(relPath) || relPath.includes('\\')) return undefined
  const parts = relPath.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) return undefined
  const root = path.resolve(installedRoot)
  const fullPath = path.resolve(root, ...parts)
  if (!isInside(root, fullPath)) return undefined
  return { relPath, fullPath }
}

function detectLinuxLibc(): string {
  try {
    const getReport = process.report?.getReport
    if (typeof getReport === 'function') {
      const report = getReport()
      const reportRecord = isRecord(report) ? report : undefined
      const header = reportRecord && isRecord(reportRecord.header) ? reportRecord.header : undefined
      if (header && typeof header.glibcVersionRuntime === 'string') return 'glibc'
    }
  } catch (_) {}
  return 'unknown'
}

function hostPlatform(override: AgentTeamPackagedResolverPlatform = {}): Required<AgentTeamPackagedResolverPlatform> {
  const os = override.os || process.platform
  const arch = override.arch || process.arch
  const libc = override.libc || (os === 'linux' ? detectLinuxLibc() : 'not-applicable')
  return { os, arch, libc }
}

function platformSupported(platform: Required<AgentTeamPackagedResolverPlatform>): boolean {
  if (!SUPPORTED_OS.has(platform.os) || !SUPPORTED_ARCH.has(platform.arch)) return false
  if (platform.os === 'linux') return SUPPORTED_LINUX_LIBC.has(platform.libc)
  return platform.libc === 'not-applicable'
}

function platformMatches(manifestPlatform: Record<string, unknown> | undefined, host: Required<AgentTeamPackagedResolverPlatform>): boolean {
  if (!manifestPlatform) return false
  return stringValue(manifestPlatform, 'os') === host.os
    && stringValue(manifestPlatform, 'arch') === host.arch
    && stringValue(manifestPlatform, 'libc') === host.libc
}

function parseChecksums(checksumPath: string): Checksums | undefined {
  let source: string
  try {
    source = readFileSync(checksumPath, 'utf8')
  } catch (_) {
    return undefined
  }
  const checksums: Checksums = new Map()
  for (const line of source.split('\n')) {
    if (!line.trim()) continue
    const match = line.match(/^([a-f0-9]{64})  (.+)$/i)
    if (!match) return undefined
    const relPath = match[2]
    if (!safePackageRelativePath(path.dirname(checksumPath), relPath)) {
      // Validate syntax only here; installed-root containment is checked by caller.
      if (path.isAbsolute(relPath) || relPath.includes('..') || relPath.includes('\\')) return undefined
    }
    checksums.set(relPath, match[1].toLowerCase())
  }
  return checksums
}

function checksumMatches(checksums: Checksums, relPath: string, fullPath: string): boolean {
  const expected = checksums.get(relPath)
  const actual = sha256File(fullPath)
  return Boolean(expected && actual && expected === actual)
}

function readManifest(installedRoot: string, manifestPath: string): { manifest?: Manifest, resolved?: SafeResolvedPath, failure?: AgentTeamPackagedResolverUnavailable } {
  const resolved = safePackageRelativePath(installedRoot, manifestPath)
  if (!resolved) return { failure: unavailable('path-unsafe', 'manifest-path') }
  if (!existsSync(resolved.fullPath)) return { failure: unavailable('manifest-missing', 'manifest') }
  const parsed = safeJson(resolved.fullPath)
  if (!isRecord(parsed)) return { failure: unavailable('manifest-invalid', 'manifest-json') }
  return { manifest: parsed, resolved }
}

function resolveManifestPaths(installedRoot: string, manifest: Manifest): { paths?: Record<string, SafeResolvedPath>, failure?: AgentTeamPackagedResolverUnavailable } {
  const files = recordValue(manifest, 'files')
  const artifact = recordValue(manifest, 'artifact')
  const license = recordValue(manifest, 'license')
  const attestation = recordValue(manifest, 'attestation')
  if (!files || !artifact || !license || !attestation) return { failure: unavailable('manifest-invalid', 'manifest-shape') }

  const relPaths: Record<string, unknown> = {
    helper: files.helper,
    manifest: files.manifest,
    checksums: files.checksums,
    provenance: files.provenance,
    license: files.license,
    licenseMetadata: files.licenseMetadata,
    attestation: files.attestation,
    artifact: artifact.path,
    manifestLicense: license.path,
    manifestLicenseMetadata: license.metadataPath,
    manifestAttestation: attestation.path,
  }
  const paths: Record<string, SafeResolvedPath> = {}
  for (const [name, relPath] of Object.entries(relPaths)) {
    const resolved = safePackageRelativePath(installedRoot, relPath)
    if (!resolved) return { failure: unavailable('path-unsafe', name) }
    paths[name] = resolved
  }
  if (paths.helper.relPath !== paths.artifact.relPath) return { failure: unavailable('manifest-invalid', 'artifact-path') }
  if (paths.license.relPath !== paths.manifestLicense.relPath || paths.licenseMetadata.relPath !== paths.manifestLicenseMetadata.relPath || paths.attestation.relPath !== paths.manifestAttestation.relPath) {
    return { failure: unavailable('manifest-invalid', 'metadata-paths') }
  }
  return { paths }
}

function validateIdentity(manifest: Manifest): AgentTeamPackagedResolverUnavailable | undefined {
  if (manifest.schemaVersion !== 1) return unavailable('manifest-invalid', 'schema')
  if (manifest.packageName !== AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_NAME || manifest.packageVersion !== AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_VERSION) return unavailable('package-mismatch', 'package')
  if (manifest.module !== AGENTTEAM_PACKAGED_RESOLVER_MODULE) return unavailable('module-mismatch', 'module')
  if (manifest.helperVersion !== AGENTTEAM_PACKAGED_RESOLVER_HELPER_VERSION || manifest.protocolVersion !== AGENTTEAM_PACKAGED_RESOLVER_PROTOCOL_VERSION) return unavailable('version-skew', 'version')
  const capabilities = stringArrayValue(manifest, 'capabilities')
  if (!capabilities || !AGENTTEAM_PACKAGED_RESOLVER_CAPABILITIES.every(capability => capabilities.includes(capability))) return unavailable('capability-skew', 'capability')
  if (booleanValue(manifest, 'businessPathsConnected') !== AGENTTEAM_PACKAGED_RESOLVER_BUSINESS_PATHS_CONNECTED) return unavailable('manifest-invalid', 'business-paths')
  const artifact = recordValue(manifest, 'artifact')
  if (!artifact || stringValue(artifact, 'filename') === undefined || numberValue(artifact, 'size') === undefined || stringValue(artifact, 'sha256') === undefined || booleanValue(artifact, 'executable') !== true) return unavailable('manifest-invalid', 'artifact')
  if (!recordValue(manifest, 'platform') || !stringValue(manifest, 'target')) return unavailable('manifest-invalid', 'platform')
  return undefined
}

function validatePlatform(manifest: Manifest, platform: Required<AgentTeamPackagedResolverPlatform>): AgentTeamPackagedResolverUnavailable | undefined {
  if (!platformSupported(platform)) return unavailable('unsupported-platform', 'host-platform')
  if (!platformMatches(recordValue(manifest, 'platform'), platform)) return unavailable('unsupported-platform', 'manifest-platform')
  return undefined
}

function validateHelper(manifest: Manifest, paths: Record<string, SafeResolvedPath>): AgentTeamPackagedResolverUnavailable | undefined {
  const artifact = recordValue(manifest, 'artifact')
  const platform = recordValue(manifest, 'platform')
  if (!artifact || !platform) return unavailable('manifest-invalid', 'artifact')
  if (!existsSync(paths.helper.fullPath)) return unavailable('helper-missing', 'helper')
  let stat
  try {
    stat = statSync(paths.helper.fullPath)
  } catch (_) {
    return unavailable('helper-missing', 'helper-stat')
  }
  const size = numberValue(artifact, 'size')
  const expectedSha = stringValue(artifact, 'sha256')
  if (size === undefined || stat.size !== size || !expectedSha || sha256File(paths.helper.fullPath) !== expectedSha.toLowerCase()) return unavailable('integrity-mismatch', 'helper-integrity')
  const os = stringValue(platform, 'os')
  const filename = stringValue(artifact, 'filename')
  const mode = stringValue(artifact, 'mode')
  if (os === 'win32') {
    if (!filename?.endsWith('.exe') || mode !== 'extension-policy') return unavailable('artifact-not-executable', 'windows-executable')
  } else if ((stat.mode & 0o111) === 0 || !mode || !/^0[0-7]{3}$/.test(mode)) {
    return unavailable('artifact-not-executable', 'posix-executable')
  }
  return undefined
}

function validateChecksums(paths: Record<string, SafeResolvedPath>): AgentTeamPackagedResolverUnavailable | undefined {
  if (!existsSync(paths.checksums.fullPath)) return unavailable('integrity-mismatch', 'checksums')
  const checksums = parseChecksums(paths.checksums.fullPath)
  if (!checksums) return unavailable('integrity-mismatch', 'checksum-format')
  for (const name of ['helper', 'manifest', 'provenance', 'license', 'licenseMetadata', 'attestation']) {
    const resolved = paths[name]
    if (!resolved || !existsSync(resolved.fullPath) || !checksumMatches(checksums, resolved.relPath, resolved.fullPath)) return unavailable('integrity-mismatch', `checksum-${name}`)
  }
  return undefined
}

function validateProvenance(manifest: Manifest, paths: Record<string, SafeResolvedPath>): AgentTeamPackagedResolverUnavailable | undefined {
  if (!existsSync(paths.provenance.fullPath)) return unavailable('provenance-missing', 'provenance')
  const provenance = safeJson(paths.provenance.fullPath)
  if (!isRecord(provenance)) return unavailable('provenance-missing', 'provenance-json')
  if (provenance.schemaVersion !== 1 || provenance.packageName !== AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_NAME || provenance.packageVersion !== AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_VERSION || provenance.module !== AGENTTEAM_PACKAGED_RESOLVER_MODULE) return unavailable('provenance-missing', 'provenance-identity')
  const source = recordValue(provenance, 'source')
  const build = recordValue(provenance, 'build')
  const smoke = recordValue(provenance, 'smoke')
  if (!source || stringValue(source, 'path') !== 'kernel/go/agentteam-kernel' || !stringValue(source, 'revision')) return unavailable('provenance-missing', 'source')
  const env = build ? recordValue(build, 'env') : undefined
  const command = build && Array.isArray(build.command) && build.command.every(item => typeof item === 'string') ? build.command : undefined
  if (!build || !command || command.join(' ') !== `go build -trimpath -o ${paths.helper.relPath} .` || env?.GO111MODULE !== 'off' || !stringValue(build, 'toolchain') || !stringValue(build, 'generatedAt') || !stringValue(build, 'runIdentity')) return unavailable('provenance-missing', 'build')
  if (!smoke || booleanValue(smoke, 'health') !== true || !recordValue(smoke, AGENTTEAM_PACKAGED_RESOLVER_MODULE)) return unavailable('provenance-missing', 'smoke')
  const manifestSource = recordValue(manifest, 'source')
  if (!manifestSource || stringValue(manifestSource, 'path') !== stringValue(source, 'path') || stringValue(manifestSource, 'revision') !== stringValue(source, 'revision')) return unavailable('provenance-missing', 'manifest-source')
  return undefined
}

function validateLicense(manifest: Manifest, paths: Record<string, SafeResolvedPath>): AgentTeamPackagedResolverUnavailable | undefined {
  if (!existsSync(paths.license.fullPath) || !existsSync(paths.licenseMetadata.fullPath)) return unavailable('license-missing', 'license')
  const license = recordValue(manifest, 'license')
  if (!license || stringValue(license, 'name') !== 'MIT' || stringValue(license, 'sha256') !== sha256File(paths.license.fullPath) || stringValue(license, 'metadataSha256') !== sha256File(paths.licenseMetadata.fullPath)) return unavailable('license-missing', 'manifest-license')
  const licenseMetadata = safeJson(paths.licenseMetadata.fullPath)
  if (!isRecord(licenseMetadata) || licenseMetadata.schemaVersion !== 1 || licenseMetadata.name !== 'MIT' || licenseMetadata.packageName !== AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_NAME || licenseMetadata.module !== AGENTTEAM_PACKAGED_RESOLVER_MODULE || licenseMetadata.path !== paths.license.relPath || licenseMetadata.sha256 !== sha256File(paths.license.fullPath)) return unavailable('license-missing', 'license-metadata')
  return undefined
}

function validateAttestation(manifest: Manifest, paths: Record<string, SafeResolvedPath>): AgentTeamPackagedResolverUnavailable | undefined {
  if (!existsSync(paths.attestation.fullPath)) return unavailable('attestation-invalid', 'attestation')
  const attestationManifest = recordValue(manifest, 'attestation')
  if (!attestationManifest || attestationManifest.kind !== 'placeholder-only' || attestationManifest.signed !== false || attestationManifest.sha256 !== sha256File(paths.attestation.fullPath)) return unavailable('attestation-invalid', 'manifest-attestation')
  let attestationLine = ''
  try {
    attestationLine = readFileSync(paths.attestation.fullPath, 'utf8').split('\n').find(line => line.trim()) || ''
  } catch (_) {
    return unavailable('attestation-invalid', 'attestation-read')
  }
  let attestation: unknown
  try {
    attestation = JSON.parse(attestationLine)
  } catch (_) {
    return unavailable('attestation-invalid', 'attestation-json')
  }
  if (!isRecord(attestation)) return unavailable('attestation-invalid', 'attestation-shape')
  const predicate = recordValue(attestation, 'predicate')
  const subject = Array.isArray(attestation.subject) ? attestation.subject : []
  const firstSubject = isRecord(subject[0]) ? subject[0] : undefined
  const digest = firstSubject ? recordValue(firstSubject, 'digest') : undefined
  if (!predicate || predicate.placeholderOnly !== true || predicate.signed !== false || predicate.signing !== 'not-real-signing') return unavailable('attestation-invalid', 'attestation-placeholder')
  if (!firstSubject || firstSubject.name !== paths.helper.relPath || digest?.sha256 !== sha256File(paths.helper.fullPath)) return unavailable('attestation-invalid', 'attestation-subject')
  return undefined
}

export function resolveAgentTeamPackagedHelperManifest(input: AgentTeamPackagedResolverInput): AgentTeamPackagedResolverResult {
  try {
    const installedRoot = path.resolve(String(input.installedRoot || ''))
    if (!installedRoot || !existsSync(installedRoot)) return unavailable('manifest-missing', 'installed-root')
    const host = hostPlatform(input.platform)
    const manifestRead = readManifest(installedRoot, input.manifestPath)
    if (manifestRead.failure) return manifestRead.failure
    const manifest = manifestRead.manifest
    const manifestPath = manifestRead.resolved
    if (!manifest || !manifestPath) return unavailable('manifest-invalid', 'manifest')
    const pathResolution = resolveManifestPaths(installedRoot, manifest)
    if (pathResolution.failure) return pathResolution.failure
    const paths = pathResolution.paths
    if (!paths) return unavailable('manifest-invalid', 'paths')
    if (paths.manifest.fullPath !== manifestPath.fullPath) return unavailable('path-unsafe', 'manifest-path-match')

    const failure = validateIdentity(manifest)
      || validatePlatform(manifest, host)
      || validateProvenance(manifest, paths)
      || validateLicense(manifest, paths)
      || validateHelper(manifest, paths)
      || validateAttestation(manifest, paths)
      || validateChecksums(paths)
    if (failure) return failure

    const artifact = recordValue(manifest, 'artifact')
    const platform = recordValue(manifest, 'platform')
    const target = stringValue(manifest, 'target')
    const size = artifact ? numberValue(artifact, 'size') : undefined
    const sha256 = artifact ? stringValue(artifact, 'sha256') : undefined
    const mode = artifact ? stringValue(artifact, 'mode') : undefined
    if (!artifact || !platform || !target || size === undefined || !sha256 || !mode) return unavailable('manifest-invalid', 'success-shape')

    return {
      status: 'available',
      module: AGENTTEAM_PACKAGED_RESOLVER_MODULE,
      capability: AGENTTEAM_PACKAGED_RESOLVER_MODULE,
      resultMarker: 'packaged-manifest-resolved',
      helperPath: paths.helper.fullPath,
      helper: {
        path: paths.helper.relPath,
        basename: path.basename(paths.helper.relPath),
        size,
        sha256,
        executable: true,
        mode,
      },
      manifest: {
        path: manifestPath.relPath,
        packageName: AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_NAME,
        packageVersion: AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_VERSION,
        helperVersion: AGENTTEAM_PACKAGED_RESOLVER_HELPER_VERSION,
        protocolVersion: AGENTTEAM_PACKAGED_RESOLVER_PROTOCOL_VERSION,
        target,
        platform: {
          os: stringValue(platform, 'os') || host.os,
          arch: stringValue(platform, 'arch') || host.arch,
          libc: stringValue(platform, 'libc') || host.libc,
        },
      },
      attestation: {
        kind: 'placeholder-only',
        signed: false,
      },
    }
  } catch (_) {
    return unavailable('manifest-invalid', 'exception')
  }
}
