const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACCEPTED_LOCAL_EVIDENCE,
  READINESS_EVIDENCE_ENTRY_IDS,
  READINESS_EVIDENCE_REGISTRY_SCHEMA_VERSION,
  READINESS_EVIDENCE_REGISTRY_THEME,
  readinessEvidenceEntries,
  readinessEvidenceRegistry,
} = require('../fixtures/kernel/v0636/readinessEvidenceRegistry.cjs')

const DOC = 'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md'
const FIXTURE = 'tests/fixtures/kernel/v0636/readinessEvidenceRegistry.cjs'
const SUITE = 'tests/suites/go-kernel-v0636-install-load-evidence-registry.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_FALSE_FIELDS = [
  'availabilityClaim',
  'defaultGoEvidence',
  'defaultResolverEvidence',
  'normalUserNativeAvailability',
  'nativePackageDelivery',
  'packageManagerNativeDelivery',
  'packageReleaseEvidence',
  'installSourceEvidence',
  'releaseAssetEvidence',
  'signingEvidence',
  'fallbackDeletionEvidence',
  'secondPlatformSupport',
]
const REQUIRED_DOES_NOT_PROVE = [
  'package-manager native delivery',
  'normal-user native availability',
  'default Go approval or enablement',
  'default resolver approval or enablement',
  'TypeScript fallback deletion approval',
  'package release approval',
  'install source approval',
  'release asset approval',
  'signing/cosign/SLSA/security attestation approval',
  'second-platform support or platform matrix',
]
const REQUIRED_DOC = [
  '## Slice 6 — Install/Load Evidence Registry Consolidation',
  'Slice 6 creates a readiness evidence registry that references accepted local evidence only.',
  '`tests/fixtures/kernel/v0636/readinessEvidenceRegistry.cjs`',
  '`tests/suites/go-kernel-v0636-install-load-evidence-registry.cjs`',
  'The registry does not rerun native artifact builds, npm pack, npm install, Go builds, hosted workflows, or install/load proofs.',
  'The registry does not generate checked-in evidence outputs, raw records, temp roots, tarballs, native artifacts, manifests, checksums, provenance, attestations, release bundles, or signing material.',
  '`schemaVersion:1`',
  '`theme:"v0.6.36 install/load evidence registry"`',
  '`availabilityClaim:false`',
  '`defaultGoEvidence:false`',
  '`normalUserNativeAvailability:false`',
  '`packageManagerNativeDelivery:false`',
  '`fallbackDeletionEvidence:false`',
  '`secondPlatformSupport:false`',
  '`v0633-clean-install-native-helper-preview`',
  '`v0635-ts-pi-facade-install-load`',
  'v0.6.33 evidence kind: explicit installed-layout `go-packaged-preview` consumption / clean-install native helper prototype.',
  'v0.6.33 limits: review-only/prototype, explicit-only, not default, not normal-user native availability, not package-manager native delivery, not package release, not install source approval, not signing approval, not default resolver, not default Go, not fallback deletion, and not second-platform proof.',
  'v0.6.35 evidence kind: temp package install/load for TypeScript/pi extension facade with stubbed pi API.',
  'v0.6.35 limits: proves TypeScript/pi facade package load only; not native helper delivery, not normal-user native availability, not default Go, not default resolver, not fallback deletion, not signing approval, and not second-platform support.',
  'No registry entry claims default/native/package/release/signing/platform availability.',
  'The registry is not imported by production source.',
  'STOP gates for Slice 6: no proof reruns, no native artifact builds, no npm pack, no npm install, no Go build, no hosted workflow action, no checked-in evidence output, no default Go, no default resolver, no `go-cutover` behavior change, no `go-packaged-preview` behavior change, no package/native delivery claim, no fallback deletion, no signing approval, no second-platform support, no release/tag/publish action, and no Slice 7+ work.',
]
const FORBIDDEN_CLAIM_PATTERNS = [
  /default Go (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )default Go is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /default resolver (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )default resolver is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /normal-user native (?:helper )?availability (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )normal-user native (?:helper )?availability is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /package-manager native delivery (?:approved|enabled|ready|available|proven|complete)/i,
  /native helper delivery (?:approved|enabled|ready|available|proven|complete)/i,
  /fallback deletion (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )fallback deletion is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /package release (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )package release is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /install source (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )install source is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /signing (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )signing is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /second[- ]platform support (?:approved|enabled|ready|available|proven)/i,
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'native helper delivery is complete',
  'native package delivery is complete',
  'package-manager native delivery is complete',
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
  'security attestation is approved',
  'second-platform support is approved',
  'second platform support is approved',
]
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]
const FORBIDDEN_ARTIFACT = /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig)$/i
const FORBIDDEN_GENERATED_RECORD = /(?:^|\/)(?:artifact-index|generated-manifest|checksum|checksums|sha256sums|provenance|attestation|hosted-observation|raw-record|release-bundle|release-asset|signature-material)(?:[-_.\/]|$)/i
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'
const ALLOWED_REVIEW_RECORDS = new Set([
  '.github/workflows/go-helper-review-artifact.yml',
  'scripts/build-go-helper-artifact.cjs',
  'scripts/lib/go-helper-artifact-builder.cjs',
  'scripts/lib/go-helper-artifact-verifier.cjs',
  'scripts/lib/go-helper-clean-install-proof.cjs',
  'scripts/lib/go-helper-hosted-observation-record.cjs',
  'scripts/lib/pi-extension-install-load-proof.cjs',
  'scripts/verify-go-helper-artifact.cjs',
  'scripts/verify-go-helper-clean-install-proof.cjs',
  'scripts/verify-go-helper-hosted-observation-record.cjs',
  'scripts/verify-pi-extension-install-load.cjs',
])

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
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

function assertRegistryDeterminism(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(readinessEvidenceRegistry)), readinessEvidenceRegistry, 'registry should be plain deterministic data')
  assert.deepEqual(Object.keys(readinessEvidenceRegistry).sort(), [
    'availabilityClaim',
    'defaultGoEvidence',
    'defaultResolverEvidence',
    'entries',
    'fallbackDeletionEvidence',
    'generatesArtifacts',
    'installSourceEvidence',
    'nativePackageDelivery',
    'normalUserNativeAvailability',
    'packageManagerNativeDelivery',
    'packageReleaseEvidence',
    'releaseAssetEvidence',
    'rerunsProofs',
    'schemaVersion',
    'secondPlatformSupport',
    'signingEvidence',
    'theme',
  ].sort(), 'registry should expose only expected aggregate fields')
  assert.deepEqual(readinessEvidenceEntries.map(entry => entry.id), READINESS_EVIDENCE_ENTRY_IDS, 'registry entry IDs should be deterministic and ordered')
  assert.deepEqual(new Set(READINESS_EVIDENCE_ENTRY_IDS).size, READINESS_EVIDENCE_ENTRY_IDS.length, 'registry entry IDs should be unique')
}

function assertRegistryAggregate() {
  assert.equal(readinessEvidenceRegistry.schemaVersion, READINESS_EVIDENCE_REGISTRY_SCHEMA_VERSION)
  assert.equal(readinessEvidenceRegistry.theme, READINESS_EVIDENCE_REGISTRY_THEME)
  for (const field of REQUIRED_FALSE_FIELDS) assert.equal(readinessEvidenceRegistry[field], false, `registry ${field} must remain false`)
  assert.equal(readinessEvidenceRegistry.rerunsProofs, false)
  assert.equal(readinessEvidenceRegistry.generatesArtifacts, false)
  assert.equal(readinessEvidenceRegistry.entries, readinessEvidenceEntries)
}

function assertEntryCommon(entry) {
  assert.equal(entry.status, ACCEPTED_LOCAL_EVIDENCE, `${entry.id} status`)
  assert.equal(entry.reviewOnly, true, `${entry.id} reviewOnly`)
  assert.equal(entry.prototype, true, `${entry.id} prototype`)
  assert.equal(entry.localOnly, true, `${entry.id} localOnly`)
  assert.equal(entry.rerunByRegistry, false, `${entry.id} rerunByRegistry`)
  for (const field of REQUIRED_FALSE_FIELDS) assert.equal(entry[field], false, `${entry.id} ${field}`)
  assert.equal(Array.isArray(entry.doesProve), true, `${entry.id} doesProve`)
  assert.equal(Array.isArray(entry.doesNotProve), true, `${entry.id} doesNotProve`)
  assert.equal(Array.isArray(entry.references), true, `${entry.id} references`)
  assert.ok(entry.doesProve.length >= 4, `${entry.id} should have meaningful doesProve entries`)
  assert.ok(entry.references.length >= 5, `${entry.id} should have references`)
  for (const limit of REQUIRED_DOES_NOT_PROVE) assert.ok(entry.doesNotProve.includes(limit), `${entry.id} should limit ${limit}`)
  const claimText = [entry.evidenceKind, ...entry.doesProve, ...entry.doesNotProve, ...entry.references].join('\n')
  for (const pattern of FORBIDDEN_CLAIM_PATTERNS) assert.equal(pattern.test(claimText), false, `${entry.id} must not overclaim: ${pattern}`)
}

function assertRegistryEntries(root) {
  assert.equal(readinessEvidenceEntries.length, 2)
  const v0633 = readinessEvidenceEntries.find(entry => entry.id === 'v0633-clean-install-native-helper-preview')
  const v0635 = readinessEvidenceEntries.find(entry => entry.id === 'v0635-ts-pi-facade-install-load')
  assert.ok(v0633, 'v0.6.33 evidence entry should exist')
  assert.ok(v0635, 'v0.6.35 evidence entry should exist')
  for (const entry of readinessEvidenceEntries) assertEntryCommon(entry)

  assert.equal(v0633.sourceVersion, 'v0.6.33')
  assert.equal(v0633.evidenceKind, 'explicit installed-layout go-packaged-preview consumption / clean-install native helper prototype')
  assert.equal(v0633.explicitOnly, true)
  assert.ok(v0633.doesProve.includes('verified review artifact can be copied into a temp installed package layout'))
  assert.ok(v0633.doesProve.includes('explicit go-packaged-preview can consume the injected installed layout'))
  assert.ok(v0633.doesProve.includes('default/unset, disabled, typescript, go, and auto modes ignore the injected installed layout'))
  for (const ref of [
    'docs/perf/v0.6.33-clean-install-native-helper-consumption.md',
    'docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md',
    'scripts/lib/go-helper-clean-install-proof.cjs',
    'scripts/verify-go-helper-clean-install-proof.cjs',
    'tests/suites/go-kernel-v0633-installed-layout-consumption.cjs',
  ]) {
    assert.ok(v0633.references.includes(ref), `v0.6.33 refs should include ${ref}`)
    assert.equal(exists(root, ref), true, `${ref} should exist`)
  }

  assert.equal(v0635.sourceVersion, 'v0.6.35')
  assert.equal(v0635.evidenceKind, 'temp package install/load for TypeScript/pi extension facade with stubbed pi API')
  assert.equal(v0635.explicitOnly, false)
  assert.ok(v0635.doesProve.includes('TypeScript/pi facade package root can load from a temp installed package shape'))
  assert.ok(v0635.doesProve.includes('default extension factory is callable with stubbed pi API'))
  assert.ok(v0635.doesProve.includes('/team command and expected agentteam tools register during stubbed load'))
  for (const ref of [
    'docs/perf/v0.6.35-pi-extension-compliance-package-surface.md',
    'docs/perf/v0.6.35-pi-extension-compliance-package-surface-checkpoint.md',
    'scripts/lib/pi-extension-install-load-proof.cjs',
    'scripts/verify-pi-extension-install-load.cjs',
    'tests/suites/go-kernel-v0635-pi-extension-install-load-smoke.cjs',
  ]) {
    assert.ok(v0635.references.includes(ref), `v0.6.35 refs should include ${ref}`)
    assert.equal(exists(root, ref), true, `${ref} should exist`)
  }
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not embed raw hosted/artifact/verifier JSON bodies`)
}

function assertFixtureNotUsedByProduction(root) {
  const productionRoots = ['api', 'app', 'commands', 'core', 'hooks', 'runtime', 'state', 'teamPanel', 'tmux', 'tools', 'adapters']
  const productionRootFiles = ['index.ts', 'agents.ts', 'policy.ts', 'renderers.ts', 'session.ts', 'teamPanel.ts']
  const productionFiles = []
  for (const rel of productionRootFiles) if (exists(root, rel)) productionFiles.push(path.join(root, rel))
  for (const rel of productionRoots) {
    const full = path.join(root, rel)
    if (fs.existsSync(full)) walkFiles(full, productionFiles)
  }
  for (const file of productionFiles.filter(file => /\.(?:ts|js|cjs|mjs)$/.test(file))) {
    const source = fs.readFileSync(file, 'utf8')
    assert.equal(source.includes('readinessEvidenceRegistry'), false, `${toRel(root, file)} must not import/read Slice 6 evidence registry`)
    assert.equal(source.includes('readinessEvidenceEntries'), false, `${toRel(root, file)} must not import/read Slice 6 evidence entries`)
    assert.equal(source.includes('tests/fixtures/kernel/v0636/readinessEvidenceRegistry.cjs'), false, `${toRel(root, file)} must not import/read Slice 6 fixture path`)
  }
}

function assertPackageRuntimeInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.type, 'module')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
  for (const field of ['main', 'exports', 'types']) assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  assert.deepEqual(Object.keys(packageJson.dependencies || {}).sort(), [], 'dependencies must remain empty or absent')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish', 'prepack', 'postpack']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define lifecycle script ${lifecycle}`)
  }

  const kernel = read(root, 'core/kernel.ts')
  assertIncludes(kernel, "const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)", 'core/kernel.ts')
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'core/kernel.ts')
  assertIncludes(kernel, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'core/kernel.ts')
  assertIncludes(kernel, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const", 'core/kernel.ts')
  assertIncludes(kernel, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'core/kernel.ts')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'core/kernel.ts')

  const readiness = read(root, 'commands/readiness.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'commands/readiness.ts')
}

function assertArtifactInvariants(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain pi-agentteam temp tarballs')
  const forbiddenArtifacts = []
  const forbiddenRecords = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && !rel.startsWith('docs/') && !rel.startsWith('tests/') && !ALLOWED_REVIEW_RECORDS.has(rel) && FORBIDDEN_GENERATED_RECORD.test(rel)) forbiddenRecords.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved checked-in native/archive/signing artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain unapproved generated manifests/checksums/provenance/attestation/raw release records outside docs/tests/review helper areas')
}

module.exports = {
  name: 'Go kernel v0.6.36 install/load evidence registry',
  async run(env) {
    const root = env.helpers.extRoot
    assertRegistryDeterminism(root)
    assertRegistryAggregate()
    assertRegistryEntries(root)
    assertDoc(root)
    assertFixtureNotUsedByProduction(root)
    assertPackageRuntimeInvariants(root)
    assertArtifactInvariants(root)
    assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  },
}
