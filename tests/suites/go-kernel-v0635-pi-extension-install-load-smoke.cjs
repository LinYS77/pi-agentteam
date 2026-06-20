const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  EXPECTED_COMMANDS,
  EXPECTED_HOOK_EVENTS,
  EXPECTED_RENDERERS,
  EXPECTED_TOOLS,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  runPiExtensionInstallLoadProof,
} = require('../../scripts/lib/pi-extension-install-load-proof.cjs')

const DOC = 'docs/perf/v0.6.35-pi-extension-compliance-package-surface.md'
const SCRIPT = 'scripts/lib/pi-extension-install-load-proof.cjs'
const CLI = 'scripts/verify-pi-extension-install-load.cjs'
const SUITE = 'tests/suites/go-kernel-v0635-pi-extension-install-load-smoke.cjs'

const REQUIRED_DOC = [
  '## Slice 2 — Temp Package Install / Load Smoke for TypeScript Pi Facade',
  'Slice 2 proves package-manager temp install/load for the TypeScript/pi facade only.',
  '`npm pack <repo-root> --ignore-scripts --pack-destination <temp> --json`.',
  '`npm install <local-temp-tarball> --ignore-scripts --package-lock=false --legacy-peer-deps --no-audit --no-fund`.',
  'The installed root is `node_modules/pi-agentteam` inside an OS temp project.',
  'The proof loads `index.ts` from the installed package root, not repo source.',
  'The installed TypeScript package is transpiled into an OS temp dist for proof loading only.',
  'Peer dependencies are stubbed for proof loading only: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, and `typebox`.',
  'The default export is invoked with a stubbed pi API.',
  'Observed required command registration: `/team`.',
  'Observed required tool registrations: `agentteam_create`, `agentteam_spawn`, `agentteam_send`, `agentteam_receive`, `agentteam_task`, and `agentteam_planrun`.',
  'Observed stable hook/renderer subset: session/context/agent/tool/message hooks plus `agentteam-leader-attention` and `agentteam-mailbox` renderers.',
  'The proof summary must set `piExtensionFacadeLoad: true`, `nativePackageDelivery: false`, `normalUserNativeAvailability: false`, `defaultGo: false`, and `fallbackDeletion: false`.',
  'Proof diagnostics are redacted: no temp roots, tarball paths, repo cwd, raw npm stdout/stderr, or stack traces.',
  'Temp pack/install/dist/state roots are cleaned by default.',
  'No native helper, Go toolchain, tmux execution, package resolver, hosted artifact, network, lifecycle hook, release asset, signing material, default resolver, or default Go is required.',
  'Slice 2 guard: `tests/suites/go-kernel-v0635-pi-extension-install-load-smoke.cjs` verifies the temp install/load proof, redaction, cleanup, installed package surface, registered stubbed pi surfaces, and unchanged native/default/release boundaries.',
  '`node --check tests/suites/go-kernel-v0635-pi-extension-install-load-smoke.cjs`.',
  '`node --check scripts/lib/pi-extension-install-load-proof.cjs`.',
  '`node --check scripts/verify-pi-extension-install-load.cjs`.',
  '`node scripts/verify-pi-extension-install-load.cjs --json`.',
  'Do not start Slice 3 command/tool surface contract in Slice 2.',
]

const FORBIDDEN_DOC_CLAIMS = [
  'native helper delivery is complete',
  'native package delivery is complete',
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'package release is approved',
  'install source is approved',
  'release asset is approved',
  'signing is approved',
  'cosign is approved',
  'SLSA is approved',
  'second platform support is approved',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel))
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

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_CLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
}

function assertPackageAndRepoInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, PACKAGE_NAME)
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.type, 'module')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
  for (const field of ['main', 'exports', 'types']) assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define lifecycle script ${lifecycle}`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain temp npm tarballs')
}

function assertNoRepoArtifacts(root) {
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('tests/fixtures/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => !rel.startsWith('scripts/lib/go-helper-hosted-observation-record.cjs'))
    .filter(rel => !rel.startsWith('scripts/verify-go-helper-hosted-observation-record.cjs'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig)$/i.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/package/release/signing artifacts')
}

function assertProofSummary(summary) {
  assert.equal(summary.ok, true)
  assert.equal(summary.resultMarker, 'pi-extension-install-load-smoke')
  assert.equal(summary.proofKind, 'temp-npm-install-load-ts-pi-facade')
  assert.equal(summary.reviewOnly, true)
  assert.equal(summary.prototype, true)
  assert.equal(summary.piExtensionFacadeLoad, true)
  assert.equal(summary.nativePackageDelivery, false)
  assert.equal(summary.normalUserNativeAvailability, false)
  assert.equal(summary.defaultGo, false)
  assert.equal(summary.defaultResolver, false)
  assert.equal(summary.fallbackDeletion, false)
  assert.equal(summary.package.name, PACKAGE_NAME)
  assert.equal(summary.package.version, PACKAGE_VERSION)
  assert.deepEqual(summary.package.piExtensions, ['./index.ts'])
  assert.equal(summary.package.mainExportsTypesAdded, false)
  assert.equal(summary.npm.pack.ran, true)
  assert.equal(summary.npm.pack.scriptsIgnored, true)
  assert.equal(summary.npm.install.ran, true)
  assert.equal(summary.npm.install.scriptsIgnored, true)
  assert.equal(summary.npm.install.packageLockDisabled, true)
  assert.equal(summary.npm.install.realPiInstall, false)
  assert.equal(summary.npm.install.networkRequired, false)
  assert.equal(summary.installedPackage.rootKind, 'os-temp-project-node_modules-package')
  assert.equal(summary.installedPackage.loadedFromInstalledPackageRoot, true)
  assert.equal(summary.installedPackage.repoSourceLoaded, false)
  assert.equal(summary.installedPackage.requiredFilesPresent, true)
  assert.equal(summary.installedPackage.packageJsonPresent, true)
  assert.equal(summary.installedPackage.indexTsPresent, true)
  assert.equal(summary.installedPackage.readmePresent, true)
  assert.equal(summary.installedPackage.licensePresent, true)
  assert.equal(summary.installedPackage.configExamplePresent, true)
  assert.equal(summary.installedPackage.nativeHelperLayoutPresent, false)
  assert.equal(summary.installedPackage.generatedArtifactsPresent, false)
  assert.equal(summary.installedPackage.lockfilesPresent, false)
  assert.equal(summary.installedPackage.goModulesPresent, false)
  assert.equal(summary.installedPackage.nativeArchivesOrBinariesPresent, false)
  assert.equal(summary.installedPackage.releaseAssetsPresent, false)
  assert.equal(summary.installedPackage.signaturesOrAttestationsPresent, false)
  assert.equal(summary.installedPackage.rawHostedRecordsPresent, false)
  assert.equal(summary.load.loadedFromInstalledPackageRoot, true)
  assert.equal(summary.load.repoSourceLoaded, false)
  assert.equal(summary.load.defaultExportCallable, true)
  assert.equal(summary.load.invokedWithStubPiApi, true)
  assert.equal(summary.load.stateRootControlled, true)
  assert.equal(summary.load.stateFilesWrittenDuringLoad, 0)
  assert.equal(summary.load.stateWritesOutsideStub, false)
  assert.deepEqual(summary.registeredSurface.commands, EXPECTED_COMMANDS)
  assert.deepEqual(summary.registeredSurface.tools, EXPECTED_TOOLS.slice().sort())
  for (const event of EXPECTED_HOOK_EVENTS) assert.ok(summary.registeredSurface.hookEvents.includes(event), `hook should be observed: ${event}`)
  for (const renderer of EXPECTED_RENDERERS) assert.ok(summary.registeredSurface.renderers.includes(renderer), `renderer should be observed: ${renderer}`)
  assert.equal(summary.registeredSurface.teamCommandRegistered, true)
  assert.equal(summary.registeredSurface.expectedToolsRegistered, true)
  assert.equal(summary.registeredSurface.expectedHooksObserved, true)
  assert.equal(summary.registeredSurface.expectedRenderersObserved, true)
  assert.equal(summary.registeredSurface.messagesSentDuringLoad, 0)
  assert.equal(summary.registeredSurface.userMessagesSentDuringLoad, 0)
  assert.equal(summary.registeredSurface.activeToolChangesDuringLoad, 0)
  assert.equal(summary.registeredSurface.providersRegisteredDuringLoad, 0)
  assert.equal(summary.noNativeDefaultReleaseControls.nativeHelperRequired, false)
  assert.equal(summary.noNativeDefaultReleaseControls.goToolchainRequired, false)
  assert.equal(summary.noNativeDefaultReleaseControls.tmuxExecutionRequired, false)
  assert.equal(summary.noNativeDefaultReleaseControls.packageResolverRequired, false)
  assert.equal(summary.noNativeDefaultReleaseControls.hostedArtifactsRequired, false)
  assert.equal(summary.noNativeDefaultReleaseControls.lifecycleHooksRequired, false)
  assert.equal(summary.noNativeDefaultReleaseControls.networkRequired, false)
  assert.equal(summary.noNativeDefaultReleaseControls.defaultGoEnabled, false)
  assert.equal(summary.noNativeDefaultReleaseControls.defaultResolverEnabled, false)
  assert.equal(summary.noNativeDefaultReleaseControls.releaseControlsExposedByProof, false)
  assert.equal(summary.diagnostics.pathsRedacted, true)
  assert.equal(summary.diagnostics.tarballPathIncluded, false)
  assert.equal(summary.diagnostics.repoCwdIncluded, false)
  assert.equal(summary.diagnostics.rawNpmStdoutIncluded, false)
  assert.equal(summary.diagnostics.rawNpmStderrIncluded, false)
  assert.equal(summary.diagnostics.stackIncluded, false)
  assert.equal(summary.cleanup.defaultCleanup, true)
  assert.equal(summary.cleanup.cleaned, true)
  assert.equal(summary.cleanup.kept, false)
  assert.equal(summary.cleanup.pathsRedacted, true)

  const serialized = JSON.stringify(summary)
  assert.equal(serialized.includes(process.cwd()), false, 'summary must not leak repo cwd')
  assert.equal(/agentteam-v0635-(?:pack|install|installed-dist|state)-/.test(serialized), false, 'summary must not leak temp roots')
  assert.equal(/pi-agentteam-0\.6\.8\.tgz/.test(serialized), false, 'summary must not leak temp tarball path/name')
}

module.exports = {
  name: 'Go kernel v0.6.35 pi extension install/load smoke',
  async run(env) {
    const root = env.helpers.extRoot
    assert.equal(exists(root, SCRIPT), true, `${SCRIPT} should exist`)
    assert.equal(exists(root, CLI), true, `${CLI} should exist`)
    assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
    assertDoc(root)
    assertPackageAndRepoInvariants(root)
    assertNoRepoArtifacts(root)
    const summary = await runPiExtensionInstallLoadProof({ repoRoot: root })
    assertProofSummary(summary)
    assertPackageAndRepoInvariants(root)
    assertNoRepoArtifacts(root)
  },
}
