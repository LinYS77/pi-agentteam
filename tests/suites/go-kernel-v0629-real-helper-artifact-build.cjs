const assert = require('node:assert/strict')
const cp = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const builder = require('../../scripts/lib/go-helper-artifact-builder.cjs')

const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITIES = ['health', 'profile', MODULE, 'tmuxSnapshotCapture', 'compactReadModelFingerprint']
const FIXED_GENERATED_AT = '2026-06-12T00:00:00.000Z'
const FIXED_REVISION = 'fedcba9876543210fedcba9876543210fedcba98'
const RUN_IDENTITY = 'v0629-real-helper-artifact-suite'
const SECRET_STDOUT = 'V0629_REAL_STDOUT_SHOULD_NOT_LEAK'
const SECRET_STDERR = 'V0629_REAL_STDERR_SHOULD_NOT_LEAK'
const SECRET_MANIFEST = 'V0629_REAL_MANIFEST_BODY_SHOULD_NOT_LEAK'
const SECRET_LICENSE = 'V0629_REAL_LICENSE_BODY_SHOULD_NOT_LEAK'
const SECRET_MAILBOX = 'V0629_REAL_MAILBOX_REPORT_SHOULD_NOT_LEAK'

const FAILURE_KINDS = new Set([
  'go-unavailable',
  'manifest-invalid',
  'integrity-mismatch',
  'artifact-not-executable',
  'provenance-missing',
  'license-missing',
  'attestation-invalid',
  'jsonrpc-smoke-failed',
])

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0629-real-helper-artifact-'))
  assert.equal(path.dirname(root), os.tmpdir(), 'real artifact suite root must be directly under OS tmpdir')
  return root
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function isInside(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function artifactPath(fixture, relPath) {
  if (typeof relPath !== 'string' || relPath.length === 0 || path.isAbsolute(relPath) || relPath.includes('..') || relPath.includes('\\')) {
    return null
  }
  const resolved = path.resolve(fixture.outputRoot, relPath)
  return isInside(path.resolve(fixture.outputRoot), resolved) ? resolved : null
}

function compactFailure(failureKind, remediation, hint) {
  assert.ok(FAILURE_KINDS.has(failureKind), `unexpected failure kind ${failureKind}`)
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

function compactAvailable() {
  return {
    ok: true,
    status: 'available',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'real-helper-artifact-validated',
  }
}

function safeParseJsonFile(filePath, failureKind, remediation, hint) {
  try {
    return { ok: true, value: readJson(filePath) }
  } catch (_) {
    return { ok: false, failure: compactFailure(failureKind, remediation, hint) }
  }
}

function assertSafeRelPath(relPath, label) {
  assert.equal(typeof relPath, 'string', `${label} should be a string`)
  assert.equal(path.isAbsolute(relPath), false, `${label} must be package-relative`)
  assert.equal(relPath.includes('..'), false, `${label} must not traverse`)
  assert.equal(relPath.includes('\\'), false, `${label} must use POSIX separators`)
}

function assertNoLeaks(value, roots = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'failure must not leak absolute paths')
  }
  assert.equal(text.includes(process.cwd()), false, 'failure must not leak repo cwd')
  assert.equal(text.includes(SECRET_STDOUT), false, 'failure must not leak stdout body')
  assert.equal(text.includes(SECRET_STDERR), false, 'failure must not leak stderr body')
  assert.equal(text.includes(SECRET_MANIFEST), false, 'failure must not leak raw manifest body')
  assert.equal(text.includes(SECRET_LICENSE), false, 'failure must not leak raw license body')
  assert.equal(text.includes(SECRET_MAILBOX), false, 'failure must not leak mailbox/report text')
  assert.equal(/stdout|stderr|Error:|AssertionError|\bat\s+|stack|native\/tmuxSnapshotParse|kernel\/go|manifest\.json|provenance\.json|license\.json|attestation\.intoto|SHA256SUMS/i.test(text), false, 'failure must stay compact and avoid package internals')
}

function assertNoMetadataLeaks(value, roots = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'metadata must not leak absolute paths')
  }
  assert.equal(text.includes(process.cwd()), false, 'metadata must not leak repo cwd')
}

function parseChecksums(checksumPath) {
  const rows = new Map()
  for (const line of fs.readFileSync(checksumPath, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const match = line.match(/^([a-f0-9]{64})  (.+)$/i)
    if (!match) return null
    rows.set(match[2], match[1])
  }
  return rows
}

function validateManifestShape(fixture, manifest) {
  if (!manifest || manifest.schemaVersion !== 1) return compactFailure('manifest-invalid', 'regenerate manifest schema', 'schema')
  if (manifest.packageName !== PACKAGE_NAME || manifest.packageVersion !== PACKAGE_VERSION) return compactFailure('manifest-invalid', 'regenerate package metadata', 'package')
  if (manifest.module !== MODULE || manifest.helperVersion !== HELPER_VERSION || manifest.protocolVersion !== PROTOCOL_VERSION) return compactFailure('manifest-invalid', 'regenerate helper metadata', 'helper')
  if (!Array.isArray(manifest.capabilities) || CAPABILITIES.some(capability => !manifest.capabilities.includes(capability)) || !manifest.capabilities.includes(MODULE)) return compactFailure('manifest-invalid', 'regenerate capability metadata', 'capability')
  if (manifest.businessPathsConnected !== false) return compactFailure('manifest-invalid', 'regenerate helper authority metadata', 'authority')
  if (typeof manifest.target !== 'string' || manifest.target.length === 0) return compactFailure('manifest-invalid', 'regenerate target metadata', 'target')
  if (!manifest.platform || manifest.platform.os !== fixture.target.os || manifest.platform.arch !== fixture.target.arch || manifest.platform.libc !== (fixture.target.libc || 'not-applicable')) return compactFailure('manifest-invalid', 'regenerate platform metadata', 'platform')
  if (!manifest.artifact || manifest.artifact.filename !== fixture.target.helperFile || manifest.artifact.path !== manifest.files?.helper) return compactFailure('manifest-invalid', 'regenerate artifact metadata', 'artifact')

  const expectedPrefix = `native/${MODULE}/${HELPER_VERSION}/${manifest.target}/`
  if (!manifest.artifact.path.startsWith(expectedPrefix)) return compactFailure('manifest-invalid', 'regenerate artifact layout metadata', 'layout')
  for (const relPath of [manifest.files.helper, manifest.files.manifest, manifest.files.checksums, manifest.files.provenance, manifest.files.license, manifest.files.licenseMetadata, manifest.files.attestation, manifest.artifact.path, manifest.license?.path, manifest.license?.metadataPath, manifest.attestation?.path]) {
    if (typeof relPath !== 'string' || path.isAbsolute(relPath) || relPath.includes('..') || relPath.includes('\\')) return compactFailure('manifest-invalid', 'regenerate package-relative paths', 'path')
  }
  if (manifest.files.manifest !== toPosix(path.relative(fixture.outputRoot, fixture.manifestPath))) return compactFailure('manifest-invalid', 'regenerate manifest path metadata', 'manifest-path')
  if (manifest.files.checksums !== toPosix(path.relative(fixture.outputRoot, fixture.checksumPath))) return compactFailure('manifest-invalid', 'regenerate checksum path metadata', 'checksum-path')
  if (manifest.files.provenance !== toPosix(path.relative(fixture.outputRoot, fixture.provenancePath))) return compactFailure('manifest-invalid', 'regenerate provenance path metadata', 'provenance-path')
  if (manifest.files.license !== toPosix(path.relative(fixture.outputRoot, fixture.licensePath))) return compactFailure('manifest-invalid', 'regenerate license path metadata', 'license-path')
  if (manifest.files.licenseMetadata !== toPosix(path.relative(fixture.outputRoot, fixture.licenseMetadataPath))) return compactFailure('manifest-invalid', 'regenerate license metadata path', 'license-metadata-path')
  if (manifest.files.attestation !== toPosix(path.relative(fixture.outputRoot, fixture.attestationPath))) return compactFailure('manifest-invalid', 'regenerate attestation path metadata', 'attestation-path')
  return null
}

function validateActualBytes(fixture, manifest) {
  const helperPath = artifactPath(fixture, manifest.artifact.path)
  const checksumPath = artifactPath(fixture, manifest.files.checksums)
  if (!helperPath || !checksumPath || !fs.existsSync(helperPath) || !fs.existsSync(checksumPath)) return compactFailure('manifest-invalid', 'regenerate artifact file set', 'file-set')
  const stat = fs.statSync(helperPath)
  if (stat.size !== manifest.artifact.size) return compactFailure('integrity-mismatch', 'regenerate helper size metadata', 'size')
  if (sha256(helperPath) !== manifest.artifact.sha256) return compactFailure('integrity-mismatch', 'regenerate helper checksum metadata', 'sha256')
  if (manifest.platform.os === 'win32') {
    if (!manifest.artifact.filename.endsWith('.exe') || manifest.artifact.mode !== 'extension-policy' || manifest.artifact.executable !== true) return compactFailure('artifact-not-executable', 'regenerate Windows executable metadata', 'executable')
  } else if (manifest.artifact.executable !== true || (stat.mode & 0o111) === 0 || !/^0[0-7]{3}$/.test(manifest.artifact.mode)) {
    return compactFailure('artifact-not-executable', 'regenerate POSIX executable metadata', 'executable')
  }

  const checksumRows = parseChecksums(checksumPath)
  if (!checksumRows) return compactFailure('integrity-mismatch', 'regenerate checksum manifest', 'checksum-format')
  for (const relPath of [manifest.files.helper, manifest.files.manifest, manifest.files.provenance, manifest.files.license, manifest.files.licenseMetadata, manifest.files.attestation]) {
    const filePath = artifactPath(fixture, relPath)
    if (!filePath || !fs.existsSync(filePath)) return compactFailure('manifest-invalid', 'regenerate artifact file set', 'checksum-file')
    if (checksumRows.get(relPath) !== sha256(filePath)) return compactFailure('integrity-mismatch', 'regenerate checksum manifest', 'checksum')
  }
  return null
}

function validateProvenanceLicenseAttestation(fixture, manifest) {
  const provenancePath = artifactPath(fixture, manifest.files.provenance)
  const licensePath = artifactPath(fixture, manifest.files.license)
  const licenseMetadataPath = artifactPath(fixture, manifest.files.licenseMetadata)
  const attestationPath = artifactPath(fixture, manifest.files.attestation)
  if (!provenancePath || !fs.existsSync(provenancePath)) return compactFailure('provenance-missing', 'regenerate provenance metadata', 'provenance')
  if (!licensePath || !licenseMetadataPath || !fs.existsSync(licensePath) || !fs.existsSync(licenseMetadataPath)) return compactFailure('license-missing', 'regenerate license metadata', 'license')
  if (!attestationPath || !fs.existsSync(attestationPath)) return compactFailure('attestation-invalid', 'regenerate placeholder attestation', 'attestation')

  const provenanceResult = safeParseJsonFile(provenancePath, 'provenance-missing', 'regenerate provenance metadata', 'provenance-json')
  if (!provenanceResult.ok) return provenanceResult.failure
  const provenance = provenanceResult.value
  if (provenance.schemaVersion !== 1 || provenance.packageName !== PACKAGE_NAME || provenance.packageVersion !== PACKAGE_VERSION || provenance.module !== MODULE) return compactFailure('provenance-missing', 'regenerate provenance identity metadata', 'provenance-identity')
  if (!provenance.source || provenance.source.path !== 'kernel/go/agentteam-kernel' || provenance.source.revision !== FIXED_REVISION) return compactFailure('provenance-missing', 'regenerate source provenance metadata', 'source')
  if (!provenance.build || provenance.build.generatedAt !== FIXED_GENERATED_AT || provenance.build.runIdentity !== RUN_IDENTITY || provenance.build.env?.GO111MODULE !== 'off' || !String(provenance.build.toolchain || '').startsWith('go version ')) return compactFailure('provenance-missing', 'regenerate build provenance metadata', 'build')
  if (!Array.isArray(provenance.build.command) || provenance.build.command.join(' ') !== `go build -trimpath -o ${manifest.artifact.path} .`) return compactFailure('provenance-missing', 'regenerate build command provenance', 'command')
  if (!provenance.smoke || provenance.smoke.health !== true || provenance.smoke.tmuxSnapshotParse?.ok !== true) return compactFailure('provenance-missing', 'regenerate smoke provenance', 'smoke')

  const licenseMetadataResult = safeParseJsonFile(licenseMetadataPath, 'license-missing', 'regenerate license metadata', 'license-json')
  if (!licenseMetadataResult.ok) return licenseMetadataResult.failure
  const licenseMetadata = licenseMetadataResult.value
  if (manifest.license?.name !== 'MIT' || manifest.license.path !== manifest.files.license || manifest.license.metadataPath !== manifest.files.licenseMetadata) return compactFailure('license-missing', 'regenerate manifest license metadata', 'manifest-license')
  if (sha256(licensePath) !== manifest.license.sha256 || sha256(licenseMetadataPath) !== manifest.license.metadataSha256) return compactFailure('license-missing', 'regenerate license checksums', 'license-checksum')
  if (licenseMetadata.name !== 'MIT' || licenseMetadata.path !== manifest.files.license || licenseMetadata.sha256 !== sha256(licensePath)) return compactFailure('license-missing', 'regenerate license metadata body', 'license-body')

  let attestation
  try {
    attestation = JSON.parse(fs.readFileSync(attestationPath, 'utf8').trim())
  } catch (_) {
    return compactFailure('attestation-invalid', 'regenerate placeholder attestation', 'attestation-json')
  }
  if (manifest.attestation?.kind !== 'placeholder-only' || manifest.attestation.signed !== false || manifest.attestation.path !== manifest.files.attestation || manifest.attestation.sha256 !== sha256(attestationPath)) return compactFailure('attestation-invalid', 'regenerate manifest attestation metadata', 'manifest-attestation')
  if (!attestation.predicate || attestation.predicate.placeholderOnly !== true || attestation.predicate.signed !== false || attestation.predicate.signing !== 'not-real-signing') return compactFailure('attestation-invalid', 'reject real signing claim without proof', 'attestation-placeholder')
  return null
}

function validateArtifact(fixture) {
  try {
    if (!fixture || !fixture.manifestPath || !fs.existsSync(fixture.manifestPath)) return compactFailure('manifest-invalid', 'regenerate manifest metadata', 'manifest')
    const manifestResult = safeParseJsonFile(fixture.manifestPath, 'manifest-invalid', 'regenerate manifest metadata', 'manifest-json')
    if (!manifestResult.ok) return manifestResult.failure
    const manifest = manifestResult.value
    return validateManifestShape(fixture, manifest)
      || validateProvenanceLicenseAttestation(fixture, manifest)
      || validateActualBytes(fixture, manifest)
      || compactAvailable()
  } catch (_) {
    return compactFailure('manifest-invalid', 'regenerate artifact metadata and rerun validation', 'exception')
  }
}

function runJsonRpc(helperPath, request) {
  const result = cp.spawnSync(helperPath, [], {
    input: `${JSON.stringify(request)}\n`,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, PATH: process.env.PATH || '' },
  })
  if (result.status !== 0 || result.error) return { ok: false, diagnostic: compactFailure('jsonrpc-smoke-failed', 'reject helper that cannot answer JSON-RPC', 'process') }
  try {
    const line = String(result.stdout || '').split('\n').find(value => value.trim())
    const response = JSON.parse(line || '')
    if (!response || response.jsonrpc !== '2.0' || response.error || !response.result || response.result.ok !== true) return { ok: false, diagnostic: compactFailure('jsonrpc-smoke-failed', 'reject invalid JSON-RPC response', 'envelope') }
    return { ok: true, response }
  } catch (_) {
    return { ok: false, diagnostic: compactFailure('jsonrpc-smoke-failed', 'reject non-JSON helper response', 'json') }
  }
}

function directJsonRpcSmoke(fixture) {
  const manifest = readJson(fixture.manifestPath)
  const helperPath = artifactPath(fixture, manifest.files.helper)
  if (!helperPath) return compactFailure('jsonrpc-smoke-failed', 'reject unsafe helper path for smoke', 'path')
  const health = runJsonRpc(helperPath, { jsonrpc: '2.0', id: 'health-real', method: 'health', params: {} })
  if (!health.ok) return health.diagnostic
  assert.equal(health.response.id, 'health-real')
  assert.deepEqual(health.response.result, {
    ok: true,
    implementation: 'go',
    protocolVersion: PROTOCOL_VERSION,
    helperVersion: HELPER_VERSION,
    capabilities: CAPABILITIES,
    businessPathsConnected: false,
  })

  const tmuxInput = '%1\ttest:@1\tleader\tpi\n%2\ttest:@1\tresearcher\tbash\n%1\ttest:@1\tleader\tpi'
  const tmux = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'tmux-real',
    method: MODULE,
    params: { stdout: tmuxInput, capturedAt: 1700000000999 },
  })
  if (!tmux.ok) return tmux.diagnostic
  assert.equal(tmux.response.id, 'tmux-real')
  assert.equal(tmux.response.result.capturedAt, 1700000000999)
  assert.equal(tmux.response.result.panes.length, 2)
  assert.deepEqual(tmux.response.result.panes.map(pane => pane.paneId), ['%1', '%2'])
  assert.equal(tmux.response.result.byPaneId['%1'].label, 'leader')
  assert.equal(tmux.response.result.byPaneId['%2'].currentCommand, 'bash')
  return compactAvailable()
}

function cloneFixtureForMutation(tempRoot, fixture, name) {
  const cloneRoot = path.join(tempRoot, `mutation-${name.replace(/[^a-z0-9-]+/gi, '-')}`)
  fs.mkdirSync(cloneRoot, { recursive: true })
  const files = [fixture.helperPath, fixture.manifestPath, fixture.checksumPath, fixture.provenancePath, fixture.licensePath, fixture.licenseMetadataPath, fixture.attestationPath]
  for (const file of files) {
    const rel = path.relative(fixture.outputRoot, file)
    const target = path.join(cloneRoot, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(file, target)
    if (process.platform !== 'win32' && file === fixture.helperPath) fs.chmodSync(target, fs.statSync(file).mode & 0o777)
  }
  return {
    outputRoot: cloneRoot,
    target: fixture.target,
    helperPath: path.join(cloneRoot, path.relative(fixture.outputRoot, fixture.helperPath)),
    manifestPath: path.join(cloneRoot, path.relative(fixture.outputRoot, fixture.manifestPath)),
    checksumPath: path.join(cloneRoot, path.relative(fixture.outputRoot, fixture.checksumPath)),
    provenancePath: path.join(cloneRoot, path.relative(fixture.outputRoot, fixture.provenancePath)),
    licensePath: path.join(cloneRoot, path.relative(fixture.outputRoot, fixture.licensePath)),
    licenseMetadataPath: path.join(cloneRoot, path.relative(fixture.outputRoot, fixture.licenseMetadataPath)),
    attestationPath: path.join(cloneRoot, path.relative(fixture.outputRoot, fixture.attestationPath)),
  }
}

function writeManifest(fixture, mutator) {
  const manifest = readJson(fixture.manifestPath)
  mutator(manifest)
  fs.writeFileSync(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function runNegativeCases(tempRoot, fixture, roots) {
  const cases = [
    ['checksum', 'integrity-mismatch', clone => writeManifest(clone, manifest => { manifest.artifact.sha256 = '0'.repeat(64); manifest.__secret = SECRET_MANIFEST })],
    ['size', 'integrity-mismatch', clone => writeManifest(clone, manifest => { manifest.artifact.size += 1; manifest.__secret = SECRET_MANIFEST })],
    ['helperVersion', 'manifest-invalid', clone => writeManifest(clone, manifest => { manifest.helperVersion = 'skewed-helper-version'; manifest.__secret = SECRET_MANIFEST })],
    ['protocolVersion', 'manifest-invalid', clone => writeManifest(clone, manifest => { manifest.protocolVersion += 1; manifest.__secret = SECRET_MANIFEST })],
    ['capability', 'manifest-invalid', clone => writeManifest(clone, manifest => { manifest.capabilities = manifest.capabilities.filter(capability => capability !== MODULE); manifest.__secret = SECRET_MANIFEST })],
    ['executable', 'artifact-not-executable', clone => {
      if (process.platform === 'win32') writeManifest(clone, manifest => { manifest.artifact.filename = manifest.artifact.filename.replace(/\.exe$/i, ''); manifest.artifact.mode = 'missing-extension'; manifest.__secret = SECRET_MANIFEST })
      else fs.chmodSync(clone.helperPath, 0o644)
    }],
    ['provenance', 'provenance-missing', clone => fs.rmSync(clone.provenancePath, { force: true })],
    ['license', 'license-missing', clone => {
      fs.writeFileSync(clone.licensePath, `${SECRET_LICENSE}\n`, 'utf8')
      writeManifest(clone, manifest => { manifest.license.sha256 = '0'.repeat(64); manifest.__mailbox = SECRET_MAILBOX })
    }],
    ['attestation-missing', 'attestation-invalid', clone => fs.rmSync(clone.attestationPath, { force: true })],
    ['attestation-claim', 'attestation-invalid', clone => {
      const attestation = JSON.parse(fs.readFileSync(clone.attestationPath, 'utf8').trim())
      attestation.predicate.placeholderOnly = false
      attestation.predicate.signed = true
      attestation.predicate.signing = 'real-signing-claim'
      writeJsonFile(clone.attestationPath, attestation)
    }],
  ]

  for (const [name, failureKind, mutate] of cases) {
    const clone = cloneFixtureForMutation(tempRoot, fixture, name)
    mutate(clone)
    const result = validateArtifact(clone)
    assert.equal(result.status, 'unavailable', `${name} should fail closed`)
    assert.equal(result.resultMarker, 'fail-closed', `${name} should fail closed marker`)
    assert.equal(result.failureKind, failureKind, `${name} failure kind`)
    assertNoLeaks(result, [...roots, clone.outputRoot])
  }
}

function hasGoToolchain() {
  return cp.spawnSync('go', ['version'], { encoding: 'utf8', timeout: 10_000 }).status === 0
}

function assertGoAvailable(root) {
  if (hasGoToolchain()) return
  const diagnostic = builder.compactFailure('go-unavailable', 'install Go before running v0.6.29 real artifact validation smoke', 'go-version')
  assertNoLeaks(diagnostic, [root, os.tmpdir(), process.cwd()])
  throw new Error(JSON.stringify(diagnostic))
}

function assertPackageRuntimeUnchanged(root) {
  const packageJson = readJson(path.join(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain unchanged')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated outputs')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not run npm pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b/.test(command), false, `${name} must not build/install/module-manage helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
  const kernelSource = fs.readFileSync(path.join(root, 'core/kernel.ts'), 'utf8')
  const kernelContractSource = fs.readFileSync(path.join(root, 'core/kernelContract.ts'), 'utf8')
  assert.equal(kernelSource.includes('go-helper-artifact-builder'), false, 'runtime kernel must not import builder')
  assert.equal(kernelSource.includes("from './kernelContract.js'"), true, 'runtime kernel should source embedded manifest path from the shared contract')
  assert.equal(kernelContractSource.includes('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json'), true, 'contract may define only the approved embedded tmuxSnapshotParse manifest')
  const manifestPaths = [...kernelContractSource.matchAll(/native\/[^'"`\s]+manifest\.json/g)].map(match => match[0])
  assert.deepEqual([...new Set(manifestPaths)], ['native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json'], 'contract must not define unapproved native manifests')
}

function assertNoRepoGeneratedOutputs(root) {
  const generatedNames = /(?:^|\/)(?:SHA256SUMS|manifest|provenance|license|attestation\.intoto|package-artifact)\.(?:json|jsonl|txt|sha256|sig)$/i
  const forbidden = []
  function walk(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      const rel = toPosix(path.relative(root, full))
      if (entry.isDirectory()) {
        if (rel === '.agentteam-artifacts' || rel.startsWith('.agentteam-artifacts/')) forbidden.push(rel)
        walk(full)
      } else if (!rel.startsWith('tests/suites/') && !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam') && !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/') && (/\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))) {
        forbidden.push(rel)
      }
    }
  }
  walk(root)
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated helper/manifest/checksum/provenance/attestation/tarball/binary output')
}

module.exports = {
  name: 'Go kernel v0.6.29 real helper artifact build validation',
  async run(env) {
    const root = env.helpers.extRoot
    assertGoAvailable(root)
    assertPackageRuntimeUnchanged(root)
    assertNoRepoGeneratedOutputs(root)

    let tempRoot
    try {
      tempRoot = mkTempRoot()
      const outputRoot = path.join(tempRoot, 'real-artifact-output')
      const fixture = builder.buildGoHelperArtifact({
        extRoot: root,
        outputRoot,
        generatedAt: FIXED_GENERATED_AT,
        runIdentity: RUN_IDENTITY,
        sourceRevision: FIXED_REVISION,
      })
      assert.equal(fixture.outputRootKind, 'os-temp', 'real artifact validation should use OS temp output')
      assert.equal(fixture.summary.status, 'available', 'builder should produce available summary')
      assert.equal(fixture.summary.resultMarker, 'local-helper-artifact-built')
      assert.equal(fixture.summary.smoke.health, true)
      assert.equal(fixture.summary.smoke.tmuxSnapshotParse, true)
      for (const relPath of [fixture.summary.artifact, ...Object.values(fixture.summary.files)]) assertSafeRelPath(relPath, 'summary path')
      assertNoMetadataLeaks([fixture.summary, fixture.manifest], [root, outputRoot, process.cwd()])

      const validation = validateArtifact(fixture)
      assert.equal(validation.status, 'available', 'real artifact metadata and bytes should validate')
      assert.equal(validation.resultMarker, 'real-helper-artifact-validated')

      const smoke = directJsonRpcSmoke(fixture)
      assert.equal(smoke.status, 'available', 'direct JSON-RPC smoke should pass')
      assert.equal(smoke.resultMarker, 'real-helper-artifact-validated')

      runNegativeCases(tempRoot, fixture, [root, outputRoot, tempRoot, process.cwd()])
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    assertNoRepoGeneratedOutputs(root)
  },
}
