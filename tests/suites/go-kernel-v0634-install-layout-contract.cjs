const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.6.34-package-release-install-layout-decision.md'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_DOC = [
  '## Slice 4 — Future Install Layout Resolver Contract',
  'Slice 4 defines a future package-relative native helper install layout and resolver contract. It is docs/tests only and does not implement production resolver/default discovery.',
  'Main package proposal root: the package root for `pi-agentteam`, with native helper files under package-relative paths only.',
  'Companion package proposal root: the package root for a future native companion package, with the same package-relative native helper layout inside that companion package.',
  'Module path: `native/tmuxSnapshotParse/<helper-version>/<target>/...`.',
  'Manifest path: `native/tmuxSnapshotParse/<helper-version>/<target>/manifest.json`.',
  'Helper binary path/name expectation: helper executable lives under `native/tmuxSnapshotParse/<helper-version>/<target>/`',
  'platform-specific executable naming is allowed only as a future owner decision',
  'Required file/categories: manifest, helper executable, checksums, provenance, license copy or license metadata, and placeholder attestation metadata.',
  'All paths must be package-relative, normalized with `/`, non-empty, non-absolute, no `..`, no backslash, and resolved inside the selected package root.',
  'Target components are `os`, `arch`, and Linux `libc` when `os=linux`.',
  'Current review-only row is `linux-x64-glibc`.',
  'Unsupported rows remain unsupported and carry no availability claim.',
  'No second platform support claim is made in v0.6.34.',
  'Route C platform expansion remains deferred until a separately approved package/release/install-source owner accepts the platform matrix.',
  'Module is `tmuxSnapshotParse` only.',
  'Current helper version expectation is `0.3.0-read-model-shadow` unless a future owner-approved version contract changes it.',
  'Current protocol version expectation is `1`.',
  'Required capabilities are `health`, `profile`, `tmuxSnapshotParse`, `tmuxSnapshotCapture`, and `compactReadModelFingerprint`, with `businessPathsConnected: false`.',
  'Package/helper skew policy remains a future package/release owner decision',
  'Explicit helper path remains first precedence.',
  'Explicit `go-packaged-preview` package-root/manifest injection remains the current preview path and is second precedence after explicit helper path when no explicit helper is supplied.',
  'A future package resolver may run only after separate approval; it must not be inferred from default runtime state in v0.6.34.',
  'Default/unset, `disabled`, `typescript`, `go`, `auto`, and current `go-cutover` behavior remain unchanged in v0.6.34.',
  '`go-packaged-preview` remains explicit-only and non-default.',
  'Missing helper, unsupported platform, path-unsafe layout, integrity mismatch, missing provenance, missing license/license metadata, invalid attestation placeholder, package/helper version skew, protocol skew, capability skew, non-executable helper, and helper smoke failure must fail closed with compact diagnostics.',
  'Diagnostics must not leak absolute package roots, repo cwd, helper paths, raw stdout/stderr, raw manifest/provenance/license/attestation bodies, stacks, hosted records, raw API payloads, signing material, cosign claims, or SLSA claims.',
  'Explicit cutover/preview failures must not hide behind a successful TypeScript `tmuxSnapshotParse` parser fallback.',
  '`compactReadModelFingerprint` remains TypeScript fallback / non-cutover.',
  'This contract is a future proposal only.',
  'It is not production resolver implementation.',
  'It is not default resolver approval.',
  'It is not default Go approval.',
  'It is not package-manager native delivery proof.',
  'It is not normal-user native helper availability.',
  'It is not release asset, install source, signing, cosign, SLSA, fallback deletion, or second-platform approval.',
  'tests/suites/go-kernel-v0634-install-layout-contract.cjs',
  'Do not start Slice 5 rollback/default-disable policy in Slice 4.',
  'Do not implement default resolver dry-run or runtime code. Do not modify `package.json`.',
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'native availability proof is complete',
  'package-manager native delivery is complete',
  'real package-manager native delivery is complete',
  'production resolver is implemented',
  'default package discovery is implemented',
  'package/release approval is granted',
  'package release is approved',
  'release asset is approved',
  'release evidence is complete',
  'install source is approved',
  'install source approval is granted',
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'signing is approved',
  'signing proof is complete',
  'cosign is approved',
  'cosign proof is complete',
  'SLSA is approved',
  'SLSA proof is complete',
  'second platform is supported',
  'second platform support is approved',
  'macOS is supported availability',
  'Windows is supported availability',
  'arm64 is supported availability',
  'musl is supported availability',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel))
}

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
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

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not embed raw hosted/artifact/verifier JSON bodies`)
}

function assertKernelSourceInvariants(root) {
  const kernel = read(root, 'core/kernel.ts')
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  const runtimeSources = `${kernel}\n${resolver}`

  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel explicit preview gate')
  assertIncludes(kernel, "const packagedResolverFailure = packagedResolverRequested && !explicitHelperPath", 'kernel preview/default resolver gate')
  assertIncludes(kernel, 'const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure', 'kernel direct packaged helper gate')
  assertIncludes(kernel, 'const packagedManifestPath = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure', 'kernel manifest path gate')
  assertIncludes(kernel, 'const packagedManifestInstallRoot = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure', 'kernel manifest root gate')
  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperManifestPath()', 'kernel embedded manifest fallback')
  assertIncludes(kernel, 'const packagedManifestRequested = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath', 'kernel manifest resolver gate')
  assertIncludes(kernel, 'const helperPath = explicitHelperPath || packagedHelperPath || packagedManifestHelperPath', 'kernel helper precedence')
  assertIncludes(kernel, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel cutover modes')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'kernel fingerprint TS fallback')

  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperRoot()', 'kernel embedded helper root')
  assert.equal(/package\.json|node_modules|__dirname|process\.cwd\(\)/i.test(kernel), false, 'kernel must not discover unapproved package layout by default')
  assert.equal(/download-artifact|hosted-observation|workflow-run|github\.run_id|github\.run_attempt|github\.sha|workflow_dispatch|actions\/download-artifact|artifact URL|artifactUrl/i.test(runtimeSources), false, 'runtime/resolver must not consume hosted workflow/artifact metadata')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|actions\/upload-artifact|cosign|slsa|postinstall|preinstall|install-time build|curl\b|wget\b|node-gyp|prebuild/i.test(runtimeSources), false, 'runtime/resolver must not contain release/npm/download/install/signing behavior')
  assert.equal(/normal-user native availability|package-manager native delivery|release asset is approved/i.test(runtimeSources), false, 'runtime/resolver must not claim package/release availability beyond approved embedded default cutover')
}

function assertPackagedResolverContractConstants(root) {
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  for (const expected of [
    "export const AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_NAME = 'pi-agentteam'",
    "export const AGENTTEAM_PACKAGED_RESOLVER_PACKAGE_VERSION = '0.6.8'",
    "export const AGENTTEAM_PACKAGED_RESOLVER_MODULE = 'tmuxSnapshotParse'",
    'export const AGENTTEAM_PACKAGED_RESOLVER_PROTOCOL_VERSION = 1',
    "export const AGENTTEAM_PACKAGED_RESOLVER_HELPER_VERSION = '0.3.0-read-model-shadow'",
    "export const AGENTTEAM_PACKAGED_RESOLVER_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint'] as const",
    'export const AGENTTEAM_PACKAGED_RESOLVER_BUSINESS_PATHS_CONNECTED = false',
    "| 'manifest-missing'",
    "| 'manifest-invalid'",
    "| 'path-unsafe'",
    "| 'package-mismatch'",
    "| 'module-mismatch'",
    "| 'version-skew'",
    "| 'capability-skew'",
    "| 'unsupported-platform'",
    "| 'helper-missing'",
    "| 'integrity-mismatch'",
    "| 'artifact-not-executable'",
    "| 'provenance-missing'",
    "| 'license-missing'",
    "| 'attestation-invalid'",
    "kind: 'placeholder-only'",
    'signed: false',
  ]) assertIncludes(resolver, expected, 'packaged resolver contract constants')
}

function assertPackageInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'], 'package remains TS/pi facade')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|hosted-observation|record|\.exe|\.dll|\.so|\.dylib|\.tgz|kernel\/go)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include unapproved native/helper/generated artifacts')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define lifecycle script ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not publish/version package`)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild|postinstall|preinstall|install-time build/i.test(command), false, `${name} must not build/download/install native helper`)
  }
}

function assertNoRepoArtifacts(root) {
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain temp npm tarballs')
  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|workflow-summary|verifier-output|hosted-observation-record|workflow-run|raw-payload|api-payload)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|md)$/i
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('tests/fixtures/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => !rel.startsWith('scripts/lib/go-helper-hosted-observation-record.cjs'))
    .filter(rel => !rel.startsWith('scripts/verify-go-helper-hosted-observation-record.cjs'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated/hosted/native artifacts or raw records')
}

module.exports = {
  name: 'Go kernel v0.6.34 install layout resolver contract',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertKernelSourceInvariants(root)
    assertPackagedResolverContractConstants(root)
    assertPackageInvariants(root)
    assertNoRepoArtifacts(root)
  },
}
