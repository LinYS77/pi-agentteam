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
const FIXED_GENERATED_AT = '2026-06-12T00:00:00.000Z'
const FIXED_REVISION = '89abcdef0123456789abcdef0123456789abcdef'
const RUN_IDENTITY = 'v0629-real-clean-install-preview'
const SENTINELS = {
  stdout: 'V0629_CLEAN_INSTALL_STDOUT_SHOULD_NOT_LEAK',
  stderr: 'V0629_CLEAN_INSTALL_STDERR_SHOULD_NOT_LEAK',
  manifest: 'V0629_CLEAN_INSTALL_MANIFEST_BODY_SHOULD_NOT_LEAK',
  provenance: 'V0629_CLEAN_INSTALL_PROVENANCE_BODY_SHOULD_NOT_LEAK',
  license: 'V0629_CLEAN_INSTALL_LICENSE_BODY_SHOULD_NOT_LEAK',
  attestation: 'V0629_CLEAN_INSTALL_ATTESTATION_BODY_SHOULD_NOT_LEAK',
  mailbox: 'V0629_CLEAN_INSTALL_MAILBOX_REPORT_SHOULD_NOT_LEAK',
}

function requireTypeScript() {
  try {
    return require('typescript')
  } catch (_) {
    return require('/home/linyusheng/.nvm/versions/node/v24.9.0/lib/node_modules/typescript')
  }
}

function transpileCoreForDirect(root) {
  const ts = requireTypeScript()
  const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0629-clean-preview-direct-dist-'))
  fs.mkdirSync(path.join(distRoot, 'core'), { recursive: true })
  for (const rel of ['core/readModelFingerprint.ts', 'core/kernelPackagedResolver.ts', 'core/kernel.ts']) {
    const sourcePath = path.join(root, rel)
    const out = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: sourcePath,
      reportDiagnostics: false,
    }).outputText
    fs.writeFileSync(path.join(distRoot, rel.replace(/\.ts$/, '.js')), out, 'utf8')
  }
  return {
    kernel: require(path.join(distRoot, 'core/kernel.js')),
    cleanup() {
      fs.rmSync(distRoot, { recursive: true, force: true })
    },
  }
}

function loadKernel(env) {
  if (env.helpers.requireDist) return { kernel: env.helpers.requireDist('core/kernel.js'), cleanup() {} }
  return transpileCoreForDirect(env.helpers.extRoot)
}

function readSource(env, rel) {
  return env.helpers.readSource ? env.helpers.readSource(rel) : fs.readFileSync(path.join(env.helpers.extRoot, rel), 'utf8')
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0629-clean-install-preview-'))
  assert.equal(path.dirname(root), os.tmpdir(), 'clean install preview root must be under OS tmpdir')
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

function hasGoToolchain() {
  return cp.spawnSync('go', ['version'], { encoding: 'utf8', timeout: 10_000 }).status === 0
}

function buildSourceArtifact(root, tempRoot) {
  if (!hasGoToolchain()) {
    throw new Error(JSON.stringify(builder.compactFailure('go-unavailable', 'install Go before running v0.6.29 clean-install preview smoke', 'go-version')))
  }
  return builder.buildGoHelperArtifact({
    extRoot: root,
    outputRoot: path.join(tempRoot, 'artifact-output'),
    generatedAt: FIXED_GENERATED_AT,
    runIdentity: RUN_IDENTITY,
    sourceRevision: FIXED_REVISION,
  })
}

function copyArtifactToInstalledRoot(tempRoot, source, label = 'installed-root') {
  const installedRoot = path.join(tempRoot, label)
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
    manifestRel,
    manifestPath,
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

function manifestEnv(fixture) {
  return {
    PATH: process.env.PATH,
    PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT: fixture.installedRoot,
    PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST: fixture.manifestRel,
  }
}

function tmuxFallback(stdout, capturedAt) {
  const panes = stdout ? [{ paneId: '%ts', target: 'ts:@1', label: 'TypeScript fallback', currentCommand: 'pi' }] : []
  return { ok: true, capturedAt, panes, byPaneId: Object.fromEntries(panes.map(item => [item.paneId, item])) }
}

function throwingTmuxFallback() {
  throw new Error('TypeScript parser fallback must not be called in clean-install packaged preview')
}

function compactInput() {
  return {
    mode: 'attached',
    team: { name: 'clean-preview-team', leaderCwd: '/tmp/clean-preview' },
    members: [{ name: 'team-lead', role: 'leader', status: 'idle', text: 'SHOULD_BE_STRIPPED' }],
    tasks: [],
    mailbox: [],
  }
}

function assertNoLeaks(value, roots = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'output must not leak absolute root')
  }
  assert.equal(text.includes(process.cwd()), false, 'output must not leak repo cwd')
  assert.equal(/stdout|stderr|Error:|AssertionError|\bat\s+|stack/i.test(text), false, 'output must not leak process/stack details')
  assert.equal(/native\/tmuxSnapshotParse|node_modules\/pi-agentteam|manifest\.json|provenance\.json|license\.json|attestation\.intoto|SHA256SUMS/i.test(text), false, 'output must not leak package internals')
  for (const sentinel of Object.values(SENTINELS)) assert.equal(text.includes(sentinel), false, `output must not leak ${sentinel}`)
}

function assertPreviewAvailable(adapter, snapshot, fixture, roots) {
  assert.equal(snapshot.ok, true, 'preview snapshot should be produced by helper')
  assert.equal(snapshot.capturedAt, 1700007000001)
  assert.deepEqual(snapshot.panes.map(pane => pane.paneId), ['%1', '%2'])
  assert.equal(snapshot.byPaneId['%1'].label, 'leader')
  assert.equal(snapshot.byPaneId['%2'].currentCommand, 'bash')

  const metadata = adapter.metadata()
  assert.equal(metadata.kernel.requestedMode, 'go-packaged-preview')
  assert.equal(metadata.kernel.mode, 'go')
  assert.equal(metadata.kernel.enabled, true)
  assert.equal(metadata.kernel.calls, 2, 'health preflight plus tmuxSnapshotParse')
  assert.equal(metadata.kernel.fallbacks, 0)
  assert.equal(metadata.kernel.cutoverModule, MODULE)
  assert.equal(metadata.kernel.cutoverStatus, 'active')
  assert.equal(metadata.kernel.helperPath, path.basename(fixture.helperPath))
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackReason'), false)
  assertNoLeaks(metadata, roots)
}

function assertPreviewFailure(adapter, snapshot, expectedKind, roots, expectedCalls = 0) {
  assert.equal(snapshot.ok, false, 'negative preview should fail closed')
  assert.equal(snapshot.status, 'unknown')
  assert.equal(snapshot.resultMarker, 'stale')
  assert.equal(snapshot.module, MODULE)
  assert.equal(snapshot.capability, MODULE)
  assert.equal(snapshot.cutoverFailureKind, expectedKind)
  assert.deepEqual(snapshot.panes, [])
  assert.deepEqual(snapshot.byPaneId, {})
  assertNoLeaks(snapshot, roots)

  const metadata = adapter.metadata()
  assert.equal(metadata.kernel.requestedMode, 'go-packaged-preview')
  assert.equal(metadata.kernel.mode, 'typescript')
  assert.equal(metadata.kernel.enabled, false)
  assert.equal(metadata.kernel.calls, expectedCalls)
  assert.equal(metadata.kernel.fallbacks, 0)
  assert.equal(metadata.kernel.cutoverStatus, 'unavailable')
  assert.equal(metadata.kernel.cutoverFailureKind, expectedKind)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackReason'), false)
  assertNoLeaks(metadata, roots)
}

function runEndToEndPreview(kernel, fixture, roots) {
  const adapter = kernel.createAgentTeamKernelAdapter({
    mode: 'go-packaged-preview',
    packagedHelperInstallRoot: fixture.installedRoot,
    packagedHelperManifestPath: fixture.manifestRel,
    env: { PATH: process.env.PATH },
  })

  const readModel = adapter.compactReadModelFingerprint(compactInput())
  assert.equal(readModel.ok, true)
  assert.equal(readModel.readOnly, true)
  assert.equal(readModel.fullTextIncluded, false)
  assert.equal(JSON.stringify(readModel).includes('SHOULD_BE_STRIPPED'), false)
  assert.equal(adapter.metadata().kernel.calls, 0, 'compactReadModelFingerprint must not call helper in preview')

  const snapshot = adapter.parseTmuxPaneSnapshot('%1\ttest:@1\tleader\tpi\n%2\ttest:@1\tresearcher\tbash', 1700007000001, throwingTmuxFallback)
  assertPreviewAvailable(adapter, snapshot, fixture, roots)

  const envAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: manifestEnv(fixture) })
  const envSnapshot = envAdapter.parseTmuxPaneSnapshot('%3\ttest:@1\tplanner\tpi', 1700007000002, throwingTmuxFallback)
  assert.equal(envSnapshot.ok, true)
  assert.equal(envSnapshot.panes[0].paneId, '%3')
}

function runNonPreviewModes(kernel, fixture, tempRoot) {
  const env = { ...manifestEnv(fixture), SHOULD_NOT_RUN_FILE: path.join(tempRoot, 'non-preview-helper-called') }
  for (const mode of [undefined, 'disabled', 'typescript', 'go', 'auto', 'go-cutover']) {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode, env })
    const before = adapter.metadata().kernel.calls
    const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700007000003, mode === 'go-cutover' ? throwingTmuxFallback : tmuxFallback)
    if (mode === 'go-cutover') {
      assert.equal(snapshot.ok, false, 'current go-cutover must not discover installed preview layout')
      assert.equal(snapshot.cutoverFailureKind, 'missing-helper')
    } else {
      assert.equal(snapshot.ok, true, `${mode || 'default'} should preserve TypeScript/default behavior`)
      assert.equal(snapshot.panes[0].paneId, '%ts')
    }
    assert.equal(adapter.metadata().kernel.calls, before, `${mode || 'default'} must not call helper`)
    assert.equal(fs.existsSync(env.SHOULD_NOT_RUN_FILE), false, `${mode || 'default'} must not spawn helper`)
  }
}

function runNegativeCases(kernel, tempRoot, fixture, roots) {
  const cases = [
    ['invalid manifest', 'helper-unsafe-response-shape', clone => fs.writeFileSync(clone.manifestPath, `{${SENTINELS.manifest}`, 'utf8'), 0],
    ['removed helper', 'missing-helper', clone => fs.rmSync(clone.helperPath, { force: true }), 0],
    ['wrong platform', 'disabled-helper', clone => rewriteManifest(clone, manifest => { manifest.platform.libc = manifest.platform.libc === 'glibc' ? 'musl' : 'glibc'; manifest.__secret = SENTINELS.manifest }), 0],
    ['bad checksum', 'helper-unsafe-response-shape', clone => rewriteManifest(clone, manifest => { manifest.artifact.sha256 = '0'.repeat(64); manifest.__secret = SENTINELS.manifest }), 0],
    ['stale helper version', 'helper-unsupported-version', clone => rewriteManifest(clone, manifest => { manifest.helperVersion = '0.0.0-stale'; manifest.__secret = SENTINELS.manifest }), 0],
  ]

  for (const [name, expectedKind, mutate, expectedCalls] of cases) {
    const clone = cloneInstalledFixture(tempRoot, fixture, name)
    mutate(clone)
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: manifestEnv(clone) })
    let fallbackCalled = false
    const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700007000004, () => {
      fallbackCalled = true
      return tmuxFallback('', 1700007000004)
    })
    assert.equal(fallbackCalled, false, `${name} must not call TS fallback`)
    assertPreviewFailure(adapter, snapshot, expectedKind, [...roots, clone.installedRoot], expectedCalls)
  }
}

function assertPackageRuntimeGuardrails(root, kernelSource) {
  const packageJson = readJson(path.join(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false)
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false)
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [scriptName, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${scriptName} must not run npm version/publish`)
    const packAllowed = scriptName === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${scriptName} must not run npm pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b/.test(command), false, `${scriptName} must not build/install/module-manage helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
  assert.ok(kernelSource.includes("const packagedPreviewRequested = requestedMode === 'go-packaged-preview'"), 'preview mode remains explicit')
  assert.ok(kernelSource.includes('const packagedManifestRequested = packagedPreviewRequested && !explicitHelperPath && !packagedHelperPath'), 'manifest resolver remains preview-only behind higher-priority helpers')
  assert.ok(kernelSource.includes('if (cutoverRequested) return fallback(compactInput)'), 'compactReadModelFingerprint remains TS fallback for cutover modes')
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
  assert.deepEqual(forbidden, [], 'repo must not contain generated helper/manifest/checksum/provenance/attestation/tarball/binary output')
}

module.exports = {
  name: 'Go kernel v0.6.29 real artifact clean-install preview smoke',
  async run(env) {
    const root = env.helpers.extRoot
    const loaded = loadKernel(env)
    const kernel = loaded.kernel
    const kernelSource = readSource(env, 'core/kernel.ts')
    assertPackageRuntimeGuardrails(root, kernelSource)
    assertNoRepoGeneratedOutputs(root)

    let tempRoot
    try {
      tempRoot = mkTempRoot()
      const source = buildSourceArtifact(root, tempRoot)
      const fixture = copyArtifactToInstalledRoot(tempRoot, source)
      const roots = [root, tempRoot, fixture.installedRoot, process.cwd()]

      assert.equal(source.summary.status, 'available')
      assert.equal(source.summary.smoke.health, true)
      assert.equal(source.summary.smoke.tmuxSnapshotParse, true)
      assert.equal(fs.existsSync(fixture.helperPath), true)
      assert.equal(path.isAbsolute(fixture.manifestRel), false)
      assert.equal(fixture.manifestRel.includes('..'), false)

      runEndToEndPreview(kernel, fixture, roots)
      runNonPreviewModes(kernel, fixture, tempRoot)
      runNegativeCases(kernel, tempRoot, fixture, roots)
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
      loaded.cleanup()
    }

    assertNoRepoGeneratedOutputs(root)
  },
}
