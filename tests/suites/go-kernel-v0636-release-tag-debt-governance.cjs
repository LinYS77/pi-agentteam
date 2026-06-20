const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  GATED,
  TAG_GATE_LEDGER_SCHEMA_VERSION,
  TAG_GATE_LEDGER_THEME,
  TAG_GATE_VERSIONS,
  UNRESOLVED,
  tagGateEntries,
  tagGateLedger,
} = require('../fixtures/kernel/v0636/tagGateLedger.cjs')

const DOC = 'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md'
const FIXTURE = 'tests/fixtures/kernel/v0636/tagGateLedger.cjs'
const SUITE = 'tests/suites/go-kernel-v0636-release-tag-debt-governance.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_FALSE_FIELDS = [
  'releaseWorkPerformed',
  'tagCreated',
  'pushPerformed',
  'hostedWorkflowQueried',
  'ghUsed',
  'npmPublish',
  'npmVersion',
  'rawHostedRecordsCheckedIn',
  'releaseAssetsCreated',
  'waiverInvented',
]
const REQUIRED_ENTRY_FALSE_FIELDS = [
  ...REQUIRED_FALSE_FIELDS,
  'tagPushed',
  'tagWouldMeanAvailability',
]
const REQUIRED_DOES_NOT_PROVE = [
  'tag created',
  'tag pushed',
  'release created',
  'npm version completed',
  'npm publish completed',
  'release asset availability',
  'hosted workflow approval',
  'raw hosted evidence checked in',
  'native helper delivery',
  'package-manager native delivery',
  'normal-user native availability',
  'default Go approval or enablement',
  'default resolver approval or enablement',
  'TypeScript fallback deletion approval',
  'install source approval',
  'signing/cosign/SLSA/security attestation approval',
  'second-platform support or platform matrix',
]
const REQUIRED_DOC = [
  '## Slice 7 — Release/Tag Debt Governance Guard',
  'Slice 7 records release/tag debt governance only and performs no release work.',
  '`tests/fixtures/kernel/v0636/tagGateLedger.cjs`',
  '`tests/suites/go-kernel-v0636-release-tag-debt-governance.cjs`',
  'The ledger keeps v0.6.31 through v0.6.35 tag gates visible and records v0.6.36 as gated.',
  '`schemaVersion:1`',
  '`theme:"v0.6.36 release/tag debt governance"`',
  '`releaseWorkPerformed:false`',
  '`tagCreated:false`',
  '`pushPerformed:false`',
  '`hostedWorkflowQueried:false`',
  '`ghUsed:false`',
  '`npmPublish:false`',
  '`npmVersion:false`',
  '`rawHostedRecordsCheckedIn:false`',
  '`releaseAssetsCreated:false`',
  '`waiverInvented:false`',
  '`v0.6.31` remains gated by hosted workflow observation or explicit leader waiver.',
  '`v0.6.32` remains gated by the v0.6.31 policy and/or explicit leader waiver.',
  '`v0.6.33`, `v0.6.34`, and `v0.6.35` remain gated by prior unresolved tag gates unless the leader/user explicitly waives them.',
  '`v0.6.36` is also gated; if ever tagged, it would identify docs/tests dry-run governance only, not default/native/release availability.',
  'Every ledger entry has `status:"gated"`, `resolution:"unresolved"`, and `requiresLeaderDecision:true`.',
  'Every ledger entry keeps `tagCreated:false`, `tagPushed:false`, `releaseWorkPerformed:false`, `npmVersion:false`, `npmPublish:false`, `hostedWorkflowQueried:false`, `waiverInvented:false`, and `tagWouldMeanAvailability:false`.',
  'The guard does not run `git tag`, `git push`, `gh`, hosted workflow query/fetch/trigger, network, token, npm version, or npm publish commands.',
  'STOP gates for Slice 7: no release work, no tag creation, no push, no `gh`, no hosted workflow query/fetch/trigger, no network/token, no raw hosted records, no release assets, no npm package, no native artifact, no npm version, no npm publish, no invented waiver, no default Go, no default resolver, no `go-cutover` behavior change, no `go-packaged-preview` behavior change, and no Slice 8 work.',
]
const FORBIDDEN_CLAIM_PATTERNS = [
  /tag (?:created|pushed|ready|available|proven)/i,
  /release (?:created|published|ready|available|proven)/i,
  /npm (?:version|publish) (?:completed|ran|ready|available|proven)/i,
  /hosted workflow (?:approved|queried|triggered|fetched|ready|available|proven)/i,
  /waiver (?:invented|granted|approved|created)/i,
  /default Go (?:approved|enabled|ready|available|proven)/i,
  /default resolver (?:approved|enabled|ready|available|proven)/i,
  /normal-user native (?:helper )?availability (?:approved|enabled|ready|available|proven)/i,
  /package-manager native delivery (?:approved|enabled|ready|available|proven|complete)/i,
  /release asset (?:approved|enabled|ready|available|proven|created)/i,
  /signing (?:approved|enabled|ready|available|proven)/i,
  /second[- ]platform support (?:approved|enabled|ready|available|proven)/i,
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'tagCreated:true',
  'tagPushed:true',
  'releaseWorkPerformed:true',
  'npmVersion:true',
  'npmPublish:true',
  'hostedWorkflowQueried:true',
  'waiverInvented:true',
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'native helper delivery is complete',
  'native package delivery is complete',
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'release asset is approved',
  'signing is approved',
  'cosign is approved',
  'SLSA is approved',
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
const FORBIDDEN_GENERATED_RECORD = /(?:^|\/)(?:artifact-index|generated-manifest|checksum|checksums|sha256sums|provenance|attestation|hosted-observation|raw-record|raw-hosted|release-bundle|release-asset|signature-material)(?:[-_.\/]|$)/i
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

function assertLedgerDeterminism(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(tagGateLedger)), tagGateLedger, 'tag ledger should be plain deterministic data')
  assert.deepEqual(Object.keys(tagGateLedger).sort(), [
    'entries',
    'ghUsed',
    'hostedWorkflowQueried',
    'npmPublish',
    'npmVersion',
    'pushPerformed',
    'rawHostedRecordsCheckedIn',
    'releaseAssetsCreated',
    'releaseWorkPerformed',
    'schemaVersion',
    'tagCreated',
    'theme',
    'waiverInvented',
  ].sort(), 'tag ledger should expose only expected aggregate fields')
  assert.deepEqual(tagGateEntries.map(entry => entry.version), TAG_GATE_VERSIONS, 'tag gate versions should be deterministic and ordered')
  assert.deepEqual(new Set(TAG_GATE_VERSIONS).size, TAG_GATE_VERSIONS.length, 'tag gate versions should be unique')
}

function assertLedgerAggregate() {
  assert.equal(tagGateLedger.schemaVersion, TAG_GATE_LEDGER_SCHEMA_VERSION)
  assert.equal(tagGateLedger.theme, TAG_GATE_LEDGER_THEME)
  for (const field of REQUIRED_FALSE_FIELDS) assert.equal(tagGateLedger[field], false, `tag ledger ${field} must remain false`)
  assert.equal(tagGateLedger.entries, tagGateEntries)
}

function assertEntryCommon(entry) {
  assert.equal(entry.status, GATED, `${entry.version} status`)
  assert.equal(entry.resolution, UNRESOLVED, `${entry.version} resolution`)
  assert.equal(entry.requiresLeaderDecision, true, `${entry.version} requiresLeaderDecision`)
  assert.equal(entry.requiresHostedEvidenceOrWaiver, true, `${entry.version} requiresHostedEvidenceOrWaiver`)
  for (const field of REQUIRED_ENTRY_FALSE_FIELDS) assert.equal(entry[field], false, `${entry.version} ${field}`)
  assert.equal(typeof entry.policy, 'string', `${entry.version} policy`)
  assert.equal(typeof entry.allowedFutureResolution, 'string', `${entry.version} allowedFutureResolution`)
  assert.ok(entry.policy.length > 40, `${entry.version} should have meaningful policy text`)
  assert.ok(entry.allowedFutureResolution.length > 40, `${entry.version} should have meaningful resolution text`)
  assert.equal(Array.isArray(entry.blockedBy), true, `${entry.version} blockedBy`)
  assert.equal(Array.isArray(entry.doesNotProve), true, `${entry.version} doesNotProve`)
  assert.equal(Array.isArray(entry.references), true, `${entry.version} references`)
  assert.ok(entry.references.length >= 1, `${entry.version} should have references`)
  for (const limit of REQUIRED_DOES_NOT_PROVE) assert.ok(entry.doesNotProve.includes(limit), `${entry.version} should not prove ${limit}`)
  const claimText = [entry.policy, entry.allowedFutureResolution, ...entry.blockedBy, ...entry.references].join('\n')
  for (const pattern of FORBIDDEN_CLAIM_PATTERNS) assert.equal(pattern.test(claimText), false, `${entry.version} must not overclaim: ${pattern}`)
}

function assertTagGateEntries(root) {
  assert.equal(tagGateEntries.length, TAG_GATE_VERSIONS.length)
  for (const entry of tagGateEntries) {
    assertEntryCommon(entry)
    for (const ref of entry.references) assert.equal(exists(root, ref), true, `${entry.version} reference should exist: ${ref}`)
  }
  const byVersion = new Map(tagGateEntries.map(entry => [entry.version, entry]))
  assert.ok(byVersion.get('v0.6.31').policy.includes('hosted workflow observation'))
  assert.deepEqual(byVersion.get('v0.6.31').blockedBy, [])
  assert.deepEqual(byVersion.get('v0.6.32').blockedBy, ['v0.6.31'])
  assert.deepEqual(byVersion.get('v0.6.33').blockedBy, ['v0.6.31', 'v0.6.32'])
  assert.deepEqual(byVersion.get('v0.6.34').blockedBy, ['v0.6.31', 'v0.6.32', 'v0.6.33'])
  assert.deepEqual(byVersion.get('v0.6.35').blockedBy, ['v0.6.31', 'v0.6.32', 'v0.6.33', 'v0.6.34'])
  assert.deepEqual(byVersion.get('v0.6.36').blockedBy, ['v0.6.31', 'v0.6.32', 'v0.6.33', 'v0.6.34', 'v0.6.35'])
  assert.ok(byVersion.get('v0.6.36').policy.includes('docs/tests dry-run governance only'))
  assert.ok(byVersion.get('v0.6.36').doesNotProve.includes('native/default/release availability'))
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const version of TAG_GATE_VERSIONS) assertIncludes(doc, `\`${version}\``, DOC)
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
    assert.equal(source.includes('tagGateLedger'), false, `${toRel(root, file)} must not import/read Slice 7 tag gate ledger`)
    assert.equal(source.includes('tagGateEntries'), false, `${toRel(root, file)} must not import/read Slice 7 tag gate entries`)
    assert.equal(source.includes('tests/fixtures/kernel/v0636/tagGateLedger.cjs'), false, `${toRel(root, file)} must not import/read Slice 7 fixture path`)
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
  assertIncludes(kernel, "const cutoverRequested = requestedMode === 'go-cutover' || packagedPreviewRequested", 'core/kernel.ts')
  assertIncludes(kernel, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const", 'core/kernel.ts')
  assertIncludes(kernel, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'core/kernel.ts')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'core/kernel.ts')
}

function assertReleaseArtifactInvariants(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain pi-agentteam temp tarballs')
  const forbiddenArtifacts = []
  const forbiddenRecords = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !ALLOWED_REVIEW_RECORDS.has(rel) && FORBIDDEN_GENERATED_RECORD.test(rel)) forbiddenRecords.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain checked-in native/archive/signing/release artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain generated manifests/checksums/provenance/attestation/raw hosted/release records outside docs/tests/review helper areas')
}

module.exports = {
  name: 'Go kernel v0.6.36 release/tag debt governance',
  async run(env) {
    const root = env.helpers.extRoot
    assertLedgerDeterminism(root)
    assertLedgerAggregate()
    assertTagGateEntries(root)
    assertDoc(root)
    assertFixtureNotUsedByProduction(root)
    assertPackageRuntimeInvariants(root)
    assertReleaseArtifactInvariants(root)
    assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  },
}
