const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  packageLayoutProposals,
  FUTURE_APPROVAL,
} = require('../fixtures/kernel/v0634/nonAppliedPackageLayoutProposals.cjs')

const DOC = 'docs/perf/v0.6.34-package-release-install-layout-decision.md'
const FIXTURE = 'tests/fixtures/kernel/v0634/nonAppliedPackageLayoutProposals.cjs'
const PACKAGE_VERSION = '0.6.8'
const EXPECTED_IDS = [
  'main-package-inclusion-proposal',
  'companion-native-package-proposal',
  'github-release-asset-proposal',
  'generated-artifact-bundle-proposal',
  'source-only-no-native-continuation-proposal',
]
const REQUIRED_DOC = [
  '## Slice 3 — Non-Applied Package Metadata / Layout Proposal Fixtures',
  '`tests/fixtures/kernel/v0634/nonAppliedPackageLayoutProposals.cjs`',
  '`tests/suites/go-kernel-v0634-non-applied-package-layout-fixtures.cjs`',
  'main-package inclusion proposal.',
  'companion native package proposal.',
  'GitHub release asset proposal.',
  'generated artifact package/bundle proposal.',
  'source-only/no-native continuation proposal.',
  'Every fixture must carry explicit `proposalOnly: true`, `nonApplied: true`, and `testOnly: true` markers.',
  'requires future explicit leader/user approval before implementation',
  'Fixtures may describe hypothetical package metadata or install layouts only as inert object/string values inside the fixture module.',
  'They must not write to the main `package.json`, package files, native metadata, optional dependencies, lifecycle hooks, generated artifact paths, release asset paths, or production resolver inputs.',
  'Slice 3 is not package/release approval.',
  'It does not approve package metadata, companion packages, release assets, install source behavior, normal-user availability, default resolver, default Go, TypeScript fallback deletion, signing, cosign, SLSA, or second platform support.',
  'all five fixture proposals exist and are proposal-only, non-applied, test-only, non-approved, and future-approval-gated.',
  'production sources must not import or read the fixture module or proposal paths.',
  'main `package.json` remains `0.6.8`',
  '`go-packaged-preview` explicit-only, no package discovery/default resolver, and `compactReadModelFingerprint` remains TypeScript fallback / non-cutover.',
  'Do not start Slice 4 install layout resolver contract in Slice 3.',
]
const REQUIRED_FORBIDDEN_CLAIMS = [
  'normal-user availability',
  'native helper availability',
  'package-manager native delivery',
  'release asset approval',
  'install source approval',
  'default Go',
  'default resolver',
  'fallback deletion',
  'signing approval',
  'cosign proof',
  'SLSA proof',
  'second platform support',
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'native availability proof is complete',
  'package-manager native delivery is complete',
  'real package-manager native delivery is complete',
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
const PRODUCTION_DIRS = [
  'api',
  'app',
  'commands',
  'core',
  'hooks',
  'runtime',
  'state',
  'teamPanel',
  'tmux',
  'tools',
  'adapters',
]
const PRODUCTION_ROOT_FILES = [
  'index.ts',
  'types.ts',
  'internalTypes.ts',
  'config.ts',
  'agents.ts',
  'deliveryPolicy.ts',
  'messageLifecycle.ts',
  'orchestration.ts',
  'policy.ts',
  'protocol.ts',
  'renderers.ts',
  'session.ts',
  'teamPanel.ts',
  'utils.ts',
  'workerTurnPrompt.ts',
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

function assertFixtures() {
  assert.equal(Array.isArray(packageLayoutProposals), true, 'packageLayoutProposals should be an array')
  assert.deepEqual(packageLayoutProposals.map(proposal => proposal.id).sort(), EXPECTED_IDS.slice().sort())
  for (const proposal of packageLayoutProposals) {
    assert.equal(proposal.proposalOnly, true, `${proposal.id} proposalOnly`)
    assert.equal(proposal.nonApplied, true, `${proposal.id} nonApplied`)
    assert.equal(proposal.testOnly, true, `${proposal.id} testOnly`)
    assert.ok(['proposed', 'decision-only', 'deferred', 'rejected'].includes(proposal.status), `${proposal.id} status must be non-approved`)
    assert.equal(/approved|implemented|released|available|published|uploaded/i.test(proposal.status), false, `${proposal.id} status must not be approved/implemented/released/available`)
    assert.equal(proposal.approvalRequirement, FUTURE_APPROVAL, `${proposal.id} approvalRequirement`)
    assert.equal(proposal.productionResolverUsable, false, `${proposal.id} must not be production resolver usable`)
    assert.equal(proposal.productionImportPath, null, `${proposal.id} must not expose production import path`)
    assert.ok(String(proposal.proposalPath).startsWith(`${FIXTURE}#`), `${proposal.id} proposalPath should stay in test fixture`)
    assert.ok(Array.isArray(proposal.allowedClaims) && proposal.allowedClaims.length > 0, `${proposal.id} allowedClaims`)
    assert.ok(Array.isArray(proposal.forbiddenClaims), `${proposal.id} forbiddenClaims`)
    for (const claim of REQUIRED_FORBIDDEN_CLAIMS) assert.ok(proposal.forbiddenClaims.includes(claim), `${proposal.id} forbiddenClaims should include ${claim}`)
    if (proposal.hypotheticalPackageJsonPatch) {
      assert.equal(typeof proposal.hypotheticalPackageJsonPatch, 'object', `${proposal.id} hypothetical package changes stay inert object`)
      assert.equal(Array.isArray(proposal.hypotheticalPackageJsonPatch), false, `${proposal.id} hypothetical package changes stay keyed fixture data`)
    }
  }
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
}

function assertPackageInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'], 'package remains TS/pi facade')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  for (const dependencyBag of [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies]) {
    for (const name of Object.keys(dependencyBag || {})) {
      assert.equal(/node-gyp|prebuild|prebuildify|node-pre-gyp|pkg|napi|native|binary/i.test(name), false, `package dependency must not introduce native helper package: ${name}`)
    }
  }
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|hosted-observation|record|\.exe|\.dll|\.so|\.dylib|\.tgz|kernel\/go)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated artifacts')
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

function productionFiles(root) {
  const files = []
  for (const rel of PRODUCTION_ROOT_FILES) {
    if (exists(root, rel)) files.push(path.join(root, rel))
  }
  for (const dir of PRODUCTION_DIRS) {
    const full = path.join(root, dir)
    if (fs.existsSync(full)) walkFiles(full, files)
  }
  return files.filter(file => /\.(?:ts|js|cjs|mjs)$/.test(file))
}

function assertProductionDoesNotUseFixtures(root) {
  const forbiddenPatterns = [
    'nonAppliedPackageLayoutProposals',
    'packageLayoutProposals',
    'tests/fixtures/kernel/v0634',
    'main-package-inclusion-proposal',
    'companion-native-package-proposal',
    'github-release-asset-proposal',
    'generated-artifact-bundle-proposal',
    'source-only-no-native-continuation-proposal',
  ]
  for (const file of productionFiles(root)) {
    const source = fs.readFileSync(file, 'utf8')
    for (const pattern of forbiddenPatterns) {
      assert.equal(source.includes(pattern), false, `${toRel(root, file)} must not import/read proposal fixture ${pattern}`)
    }
  }
}

function assertRuntimeInvariants(root) {
  const kernel = read(root, 'core/kernel.ts')
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  const runtimeSources = `${kernel}\n${resolver}`
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel explicit preview gate')
  assertIncludes(kernel, "const packagedResolverFailure = packagedResolverRequested && !explicitHelperPath", 'kernel preview/default resolver gate')
  assertIncludes(kernel, 'const packagedManifestRequested = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath', 'kernel manifest resolver gate')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'kernel fingerprint TS fallback')
  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperRoot()', 'kernel embedded helper root')
  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperManifestPath()', 'kernel embedded helper manifest')
  assert.equal(/package\.json|node_modules|__dirname|process\.cwd\(\)/i.test(kernel), false, 'kernel must not discover unapproved installed package layout by default')
  assert.equal(/download-artifact|hosted-observation|workflow-run|github\.run_id|github\.run_attempt|github\.sha|workflow_dispatch|actions\/download-artifact/i.test(runtimeSources), false, 'runtime/resolver must not consume hosted workflow/artifact metadata')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|cosign|slsa|postinstall|preinstall|install-time build|curl\b|wget\b|node-gyp|prebuild/i.test(runtimeSources), false, 'runtime/resolver must not contain release/npm/download/install behavior')
  assert.equal(/normal-user native availability|package-manager native delivery|release asset is approved/i.test(runtimeSources), false, 'runtime/resolver must not claim package/release availability beyond approved embedded default cutover')
}

module.exports = {
  name: 'Go kernel v0.6.34 non-applied package layout fixtures',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtures()
    assertDoc(root)
    assertPackageInvariants(root)
    assertNoRepoArtifacts(root)
    assertProductionDoesNotUseFixtures(root)
    assertRuntimeInvariants(root)
  },
}
