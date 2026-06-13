const assert = require('node:assert/strict')
const cp = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')

const builder = require('../../scripts/lib/go-helper-artifact-builder.cjs')

const RESOLVER = 'core/kernelPackagedResolver.ts'
const KERNEL = 'core/kernel.ts'
const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const MODULE_NAME = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITIES = ['health', 'profile', MODULE_NAME, 'compactReadModelFingerprint']
const FIXED_GENERATED_AT = '2026-06-12T00:00:00.000Z'
const FIXED_REVISION = 'abcdef0123456789abcdef0123456789abcdef01'
const RUN_IDENTITY = 'v0629-packaged-resolver-suite'
const SECRET_MANIFEST = 'V0629_RESOLVER_MANIFEST_BODY_SHOULD_NOT_LEAK'
const SECRET_PROVENANCE = 'V0629_RESOLVER_PROVENANCE_BODY_SHOULD_NOT_LEAK'
const SECRET_LICENSE = 'V0629_RESOLVER_LICENSE_BODY_SHOULD_NOT_LEAK'
const SECRET_ATTESTATION = 'V0629_RESOLVER_ATTESTATION_BODY_SHOULD_NOT_LEAK'
const SECRET_MAILBOX = 'V0629_RESOLVER_MAILBOX_REPORT_SHOULD_NOT_LEAK'

function requireTypeScript() {
  try {
    return require('typescript')
  } catch (_) {
    return require('/home/linyusheng/.nvm/versions/node/v24.9.0/lib/node_modules/typescript')
  }
}

function loadResolver(env) {
  if (env.helpers.requireDist) return env.helpers.requireDist('core/kernelPackagedResolver.js')
  const root = env.helpers.extRoot
  const ts = requireTypeScript()
  const sourceFile = path.join(root, RESOLVER)
  const sourceText = fs.readFileSync(sourceFile, 'utf8')
  const out = ts.transpileModule(sourceText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: sourceFile,
    reportDiagnostics: false,
  }).outputText
  const mod = new Module(sourceFile, module)
  mod.filename = sourceFile
  mod.paths = Module._nodeModulePaths(path.dirname(sourceFile))
  mod._compile(out, sourceFile)
  return mod.exports
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  assert.equal(path.dirname(root), os.tmpdir(), 'fixture root must be directly under OS tmpdir')
  return root
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function assertSafeRelPath(relPath, label) {
  assert.equal(typeof relPath, 'string', `${label} should be a string`)
  assert.equal(path.isAbsolute(relPath), false, `${label} must be package-relative`)
  assert.equal(relPath.includes('..'), false, `${label} must not traverse`)
  assert.equal(relPath.includes('\\'), false, `${label} must use POSIX separators`)
}

function assertNoLeaks(result, roots = []) {
  const text = JSON.stringify(result)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'failure must not leak absolute paths')
  }
  assert.equal(text.includes(process.cwd()), false, 'failure must not leak repo cwd')
  assert.equal(/stdout|stderr|Error:|AssertionError|\bat\s+|stack/i.test(text), false, 'failure must not leak process/stack details')
  assert.equal(/native\/tmuxSnapshotParse|kernel\/go|manifest\.json|provenance\.json|license\.json|attestation\.intoto|SHA256SUMS/i.test(text), false, 'failure must not leak package internals')
  for (const secret of [SECRET_MANIFEST, SECRET_PROVENANCE, SECRET_LICENSE, SECRET_ATTESTATION, SECRET_MAILBOX]) {
    assert.equal(text.includes(secret), false, `failure must not leak ${secret}`)
  }
}

function assertAvailableNoPublicLeaks(result, installedRoot, repoRoot) {
  assert.equal(result.status, 'available')
  assert.equal(result.module, MODULE_NAME)
  assert.equal(result.capability, MODULE_NAME)
  assert.equal(result.resultMarker, 'packaged-manifest-resolved')
  assert.equal(typeof result.helperPath, 'string', 'available result may expose internal helperPath')
  assert.ok(path.isAbsolute(result.helperPath), 'internal helperPath should be absolute for caller use')
  assert.ok(result.helperPath.startsWith(installedRoot + path.sep), 'helperPath should stay under installed root')
  assert.equal(JSON.stringify(result.manifest).includes(installedRoot), false, 'public manifest metadata must not leak root')
  assert.equal(JSON.stringify(result.helper).includes(installedRoot), false, 'public helper metadata must not leak root')
  assert.equal(JSON.stringify(result.manifest).includes(repoRoot), false, 'public manifest metadata must not leak repo')
  assert.equal(result.helper.path, toPosix(path.relative(installedRoot, result.helperPath)))
  assert.equal(result.helper.basename, path.basename(result.helperPath))
}

function hasGoToolchain() {
  return cp.spawnSync('go', ['version'], { encoding: 'utf8', timeout: 10_000 }).status === 0
}

function buildSourceArtifact(root, tempRoot) {
  if (!hasGoToolchain()) {
    throw new Error(JSON.stringify(builder.compactFailure('go-unavailable', 'install Go before running packaged resolver fixture build', 'go-version')))
  }
  const outputRoot = path.join(tempRoot, 'builder-output')
  return builder.buildGoHelperArtifact({
    extRoot: root,
    outputRoot,
    generatedAt: FIXED_GENERATED_AT,
    runIdentity: RUN_IDENTITY,
    sourceRevision: FIXED_REVISION,
  })
}

function copyArtifactToInstalledRoot(tempRoot, source) {
  const installedRoot = path.join(tempRoot, 'installed-root')
  const installPrefix = path.join(installedRoot, 'node_modules', PACKAGE_NAME)
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
  function remapRel(value) {
    return relMap.get(value) || value
  }
  manifest.artifact.path = remapRel(manifest.artifact.path)
  for (const key of Object.keys(manifest.files)) manifest.files[key] = remapRel(manifest.files[key])
  manifest.license.path = remapRel(manifest.license.path)
  manifest.license.metadataPath = remapRel(manifest.license.metadataPath)
  manifest.attestation.path = remapRel(manifest.attestation.path)
  manifest.build.command = ['go', 'build', '-trimpath', '-o', manifest.artifact.path, '.']
  writeJson(manifestPath, manifest)

  const provenanceRel = manifest.files.provenance
  const provenancePath = path.join(installedRoot, ...provenanceRel.split('/'))
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

  manifest.license.sha256 = sha256(path.join(installedRoot, ...manifest.files.license.split('/')))
  manifest.license.metadataSha256 = sha256(licenseMetadataPath)
  manifest.attestation.sha256 = sha256(attestationPath)
  writeJson(manifestPath, manifest)

  const checksumPath = path.join(installedRoot, ...manifest.files.checksums.split('/'))
  const checksumRows = [
    [sha256(path.join(installedRoot, ...manifest.files.helper.split('/'))), manifest.files.helper],
    [sha256(manifestPath), manifest.files.manifest],
    [sha256(provenancePath), manifest.files.provenance],
    [manifest.license.sha256, manifest.files.license],
    [manifest.license.metadataSha256, manifest.files.licenseMetadata],
    [manifest.attestation.sha256, manifest.files.attestation],
  ]
  fs.writeFileSync(checksumPath, checksumRows.map(([hash, rel]) => `${hash}  ${rel}`).join('\n') + '\n', 'utf8')

  return {
    installedRoot,
    installPrefix,
    manifestRel,
    manifestPath,
    manifest: readJson(manifestPath),
    helperPath: path.join(installedRoot, ...manifest.files.helper.split('/')),
    checksumPath,
    provenancePath,
    licensePath: path.join(installedRoot, ...manifest.files.license.split('/')),
    licenseMetadataPath,
    attestationPath,
  }
}

function cloneInstalledFixture(tempRoot, fixture, name) {
  const cloneRoot = path.join(tempRoot, `case-${name.replace(/[^a-z0-9-]+/gi, '-')}`)
  fs.cpSync(fixture.installedRoot, cloneRoot, { recursive: true })
  const rel = file => path.join(cloneRoot, path.relative(fixture.installedRoot, file))
  return {
    installedRoot: cloneRoot,
    manifestRel: fixture.manifestRel,
    manifestPath: rel(fixture.manifestPath),
    helperPath: rel(fixture.helperPath),
    checksumPath: rel(fixture.checksumPath),
    provenancePath: rel(fixture.provenancePath),
    licensePath: rel(fixture.licensePath),
    licenseMetadataPath: rel(fixture.licenseMetadataPath),
    attestationPath: rel(fixture.attestationPath),
  }
}

function rewriteManifest(fixture, mutator) {
  const manifest = readJson(fixture.manifestPath)
  mutator(manifest)
  writeJson(fixture.manifestPath, manifest)
}

function platformFromFixture(fixture) {
  const platform = readJson(fixture.manifestPath).platform
  return { os: platform.os, arch: platform.arch, libc: platform.libc }
}

function assertUnavailable(result, failureKind, roots) {
  assert.equal(result.status, 'unavailable')
  assert.equal(result.resultMarker, 'fail-closed')
  assert.equal(result.module, MODULE_NAME)
  assert.equal(result.capability, MODULE_NAME)
  assert.equal(result.failureKind, failureKind)
  assert.equal(typeof result.cutoverFailureKind, 'string')
  assert.equal(typeof result.reason, 'string')
  assert.equal(typeof result.remediation, 'string')
  assertNoLeaks(result, roots)
}

function runPositiveCase(resolver, fixture, root) {
  const platform = platformFromFixture(fixture)
  const result = resolver.resolveAgentTeamPackagedHelperManifest({
    installedRoot: fixture.installedRoot,
    manifestPath: fixture.manifestRel,
    platform,
  })
  assertAvailableNoPublicLeaks(result, fixture.installedRoot, root)
  assert.equal(result.helper.path, readJson(fixture.manifestPath).files.helper)
  assert.equal(result.helper.size, fs.statSync(fixture.helperPath).size)
  assert.equal(result.helper.sha256, sha256(fixture.helperPath))
  assert.equal(result.manifest.path, fixture.manifestRel)
  assert.equal(result.manifest.packageName, PACKAGE_NAME)
  assert.equal(result.manifest.packageVersion, PACKAGE_VERSION)
  assert.equal(result.manifest.helperVersion, HELPER_VERSION)
  assert.equal(result.manifest.protocolVersion, PROTOCOL_VERSION)
  assert.deepEqual(result.manifest.platform, platform)
  assert.equal(result.attestation.kind, 'placeholder-only')
  assert.equal(result.attestation.signed, false)
  for (const relPath of [result.helper.path, result.manifest.path]) assertSafeRelPath(relPath, 'available rel path')
}

function runNegativeCases(resolver, tempRoot, fixture, root) {
  const platform = platformFromFixture(fixture)
  const cases = [
    ['missing manifest', 'manifest-missing', clone => fs.rmSync(clone.manifestPath, { force: true })],
    ['malformed manifest', 'manifest-invalid', clone => fs.writeFileSync(clone.manifestPath, `{${SECRET_MANIFEST}`, 'utf8')],
    ['unsafe manifest absolute', 'path-unsafe', (_clone, input) => { input.manifestPath = path.join(fixture.installedRoot, fixture.manifestRel) }],
    ['unsafe manifest traversal', 'path-unsafe', (_clone, input) => { input.manifestPath = `../${fixture.manifestRel}` }],
    ['unsafe helper path', 'path-unsafe', clone => rewriteManifest(clone, manifest => { manifest.files.helper = '../escape/helper'; manifest.artifact.path = '../escape/helper'; manifest.__secret = SECRET_MANIFEST })],
    ['missing helper', 'helper-missing', clone => fs.rmSync(clone.helperPath, { force: true })],
    ['unsupported platform', 'unsupported-platform', (_clone, input) => { input.platform = { os: 'linux', arch: 'x64', libc: 'unsupported-libc' } }],
    ['platform mismatch', 'unsupported-platform', clone => rewriteManifest(clone, manifest => { manifest.platform.libc = manifest.platform.libc === 'glibc' ? 'musl' : 'glibc' })],
    ['checksum mismatch', 'integrity-mismatch', clone => rewriteManifest(clone, manifest => { manifest.artifact.sha256 = '0'.repeat(64); manifest.__secret = SECRET_MANIFEST })],
    ['size mismatch', 'integrity-mismatch', clone => rewriteManifest(clone, manifest => { manifest.artifact.size += 1 })],
    ['missing provenance', 'provenance-missing', clone => fs.rmSync(clone.provenancePath, { force: true })],
    ['mismatched provenance', 'provenance-missing', clone => fs.writeFileSync(clone.provenancePath, JSON.stringify({ secret: SECRET_PROVENANCE }), 'utf8')],
    ['missing license', 'license-missing', clone => fs.rmSync(clone.licensePath, { force: true })],
    ['mismatched license', 'license-missing', clone => fs.writeFileSync(clone.licensePath, `${SECRET_LICENSE}\n`, 'utf8')],
    ['missing attestation', 'attestation-invalid', clone => fs.rmSync(clone.attestationPath, { force: true })],
    ['signing claim', 'attestation-invalid', clone => {
      const attestation = JSON.parse(fs.readFileSync(clone.attestationPath, 'utf8').trim())
      attestation.predicate.placeholderOnly = false
      attestation.predicate.signed = true
      attestation.predicate.signing = 'real-signing-claim'
      fs.writeFileSync(clone.attestationPath, `${JSON.stringify(attestation)}\n`, 'utf8')
    }],
    ['wrong package', 'package-mismatch', clone => rewriteManifest(clone, manifest => { manifest.packageName = 'wrong-package'; manifest.__mailbox = SECRET_MAILBOX })],
    ['wrong module', 'module-mismatch', clone => rewriteManifest(clone, manifest => { manifest.module = 'compactReadModelFingerprint' })],
    ['wrong helper version', 'version-skew', clone => rewriteManifest(clone, manifest => { manifest.helperVersion = 'skewed-helper-version' })],
    ['wrong protocol', 'version-skew', clone => rewriteManifest(clone, manifest => { manifest.protocolVersion += 1 })],
    ['missing capability', 'capability-skew', clone => rewriteManifest(clone, manifest => { manifest.capabilities = manifest.capabilities.filter(capability => capability !== MODULE_NAME) })],
    ['non executable', 'artifact-not-executable', clone => {
      if (process.platform === 'win32') rewriteManifest(clone, manifest => { manifest.artifact.filename = manifest.artifact.filename.replace(/\.exe$/i, ''); manifest.artifact.mode = 'missing-extension' })
      else fs.chmodSync(clone.helperPath, 0o644)
    }],
  ]

  for (const [name, expectedKind, mutate] of cases) {
    const clone = cloneInstalledFixture(tempRoot, fixture, name)
    const input = { installedRoot: clone.installedRoot, manifestPath: clone.manifestRel, platform }
    mutate(clone, input)
    const result = resolver.resolveAgentTeamPackagedHelperManifest(input)
    assertUnavailable(result, expectedKind, [root, tempRoot, clone.installedRoot, process.cwd()])
  }
}

function assertNoForbiddenResolverSource(root) {
  const resolverSource = fs.readFileSync(path.join(root, RESOLVER), 'utf8')
  const kernelSource = fs.readFileSync(path.join(root, KERNEL), 'utf8')
  assert.equal(/child_process|\b(?:spawn|exec|fork)(?:Sync)?\s*\(|JSON-RPC|jsonrpc/i.test(resolverSource), false, 'resolver must not spawn helper or run JSON-RPC')
  assert.equal(/from ['"].*(?:tmux|state|mailbox|report|teamPanel|commands|tools|runtime|workerTurnPrompt|orchestration|session)/.test(resolverSource), false, 'resolver must not import runtime/state/UI/command modules')
  assert.equal(/readFileSync\([^)]*(?:data|mailbox|report|task|outbox|inbox)/i.test(resolverSource), false, 'resolver must not read state/mailbox/report files')
  assert.equal(/writeFileSync|appendFileSync|mkdirSync|rmSync|cpSync|renameSync/i.test(resolverSource), false, 'resolver must not write files')
  if (kernelSource.includes('kernelPackagedResolver')) {
    assert.ok(kernelSource.includes("const packagedPreviewRequested = requestedMode === 'go-packaged-preview'"), 'resolver integration must remain packaged-preview only')
    assert.ok(kernelSource.includes('const packagedManifestRequested = packagedPreviewRequested && !explicitHelperPath && !packagedHelperPath'), 'resolver integration must require explicit preview and no higher-priority helper')
    assert.ok(kernelSource.includes('defaultAgentTeamKernelPackagedHelperManifestPath'), 'resolver integration must use explicit manifest env helper')
    assert.equal(/defaultAgentTeamKernelPackagedHelperManifestPath\([^)]*\)[\s\S]{0,120}(?:go-cutover|auto|typescript|disabled)/.test(kernelSource), false, 'resolver must not be used for non-preview modes')
  }
}

function assertPackageRuntimeUnchanged(root) {
  const packageJson = readJson(path.join(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain unchanged')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package files must not include native/helper/generated outputs')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [scriptName, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${scriptName} must not run npm version/publish`)
    const packAllowed = scriptName === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${scriptName} must not run npm pack except dry-run release check`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
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
      } else if (!rel.startsWith('tests/suites/') && !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam') && (/\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))) {
        forbidden.push(rel)
      }
    }
  }
  walk(root)
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated helper/manifest/checksum/provenance/attestation/tarball/binary output')
}

module.exports = {
  name: 'Go kernel v0.6.29 packaged manifest resolver',
  async run(env) {
    const root = env.helpers.extRoot
    const resolver = loadResolver(env)
    assertNoForbiddenResolverSource(root)
    assertPackageRuntimeUnchanged(root)
    assertNoRepoGeneratedOutputs(root)

    let tempRoot
    try {
      tempRoot = mkTempRoot('agentteam-v0629-packaged-resolver-')
      const source = buildSourceArtifact(root, tempRoot)
      const fixture = copyArtifactToInstalledRoot(tempRoot, source)
      runPositiveCase(resolver, fixture, root)
      runNegativeCases(resolver, tempRoot, fixture, root)
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    assertNoRepoGeneratedOutputs(root)
  },
}
