const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  BLOCKED,
  DEFAULT_GO_BLOCKER_IDS,
  DEFAULT_GO_READINESS_LEDGER_SCHEMA_VERSION,
  DEFAULT_GO_READINESS_MODULE,
  DEFAULT_GO_READINESS_THEME,
  defaultGoReadinessLedger,
} = require('../fixtures/kernel/v0636/defaultGoReadinessLedger.cjs')

const DOC = 'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md'
const FIXTURE = 'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs'
const SUITE = 'tests/suites/go-kernel-v0636-default-go-readiness-ledger.cjs'
const PACKAGE_VERSION = '0.6.8'
const EXPECTED_GLOBAL_FALSE_FIELDS = [
  'ready',
  'defaultGo',
  'defaultResolver',
  'normalUserNativeAvailability',
  'fallbackDeletion',
  'modeChange',
  'packageReleaseApproved',
  'secondPlatformSupport',
  'signingApproved',
]
const REQUIRED_DOC = [
  '## Slice 2 — Default-Go Readiness Blocker Ledger',
  '`tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs`',
  '`tests/suites/go-kernel-v0636-default-go-readiness-ledger.cjs`',
  'Slice 2 defines a machine-checkable default-Go readiness blocker ledger.',
  'The ledger is fixture/test/docs-only and does not implement the Slice 3 dry-run verifier CLI/library.',
  'Current aggregate status is `ready:false`.',
  'The ledger global flags stay false: `defaultGo:false`, `defaultResolver:false`, `normalUserNativeAvailability:false`, `fallbackDeletion:false`, `modeChange:false`, `packageReleaseApproved:false`, `secondPlatformSupport:false`, and `signingApproved:false`.',
  'The ledger has `noSilentWaiver:true`; repo state alone cannot waive any blocker.',
  '`package-manager-native-delivery` — blocked, required before default Go, and not waivable by repo state alone.',
  '`install-source-approval` — blocked, required before default Go, and not waivable by repo state alone.',
  '`default-resolver-policy` — blocked, required before default Go, and not waivable by repo state alone.',
  '`rollback-default-disable-mechanism` — blocked, required before default Go, and not waivable by repo state alone.',
  '`security-signing-policy` — blocked, required before default Go, and not waivable by repo state alone.',
  '`platform-policy` — blocked, required before default Go, and not waivable by repo state alone; this is policy only and not second-platform work.',
  '`hosted-tag-gates` — blocked, required before default Go, and not waivable by repo state alone.',
  '`explicit-leader-user-approval` — blocked, required before default Go, and not waivable by repo state alone.',
  '`typescript-fallback-retention-deletion-gate` — blocked, required before default Go, and not waivable by repo state alone.',
  '`go-authority-boundaries` — blocked, required before default Go, and not waivable by repo state alone.',
  'Slice 2 does not prove normal-user native availability, default Go approval, default resolver approval, TypeScript fallback deletion, `compactReadModelFingerprint` cutover, package release approval, install-source approval, signing/cosign/SLSA/security attestation approval, release asset approval, hosted workflow approval, tag approval, second-platform support, package-manager native delivery, or Go control-plane authority expansion.',
  'Slice 2 does not change `package.json`, production source, runtime behavior, workflow behavior, readiness behavior, commands, tools, package metadata, package files, default resolver behavior, `go-cutover`, `go-packaged-preview`, native helper delivery, release behavior, signing behavior, hosted workflow behavior, tags, npm version, npm publish, or fallback behavior.',
  'Do not infer `ready:true` from current repo facts.',
  'Do not add waiver logic in Slice 2.',
  'Do not start Slice 3 dry-run verifier implementation in Slice 2.',
]
const FORBIDDEN_LEDGER_CLAIM_PATTERNS = [
  /default Go (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )default Go is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /default resolver (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )default resolver is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /normal-user native (?:helper )?availability (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )normal-user native (?:helper )?availability is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /fallback deletion (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )fallback deletion is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /package release (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )package release is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /install source (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )install source is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /release asset (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )release asset is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /signing (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )signing is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
  /second[- ]platform support (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )second[- ]platform support is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
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
  'package-manager native delivery is complete',
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
const ALLOWED_REVIEW_RECORDS = new Set([
  '.github/workflows/go-helper-review-artifact.yml',
  'scripts/build-go-helper-artifact.cjs',
  'scripts/lib/go-helper-artifact-builder.cjs',
  'scripts/lib/go-helper-artifact-verifier.cjs',
  'scripts/lib/go-helper-clean-install-proof.cjs',
  'scripts/lib/go-helper-hosted-observation-record.cjs',
  'scripts/verify-go-helper-artifact.cjs',
  'scripts/verify-go-helper-clean-install-proof.cjs',
  'scripts/verify-go-helper-hosted-observation-record.cjs',
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
  assert.deepEqual(JSON.parse(JSON.stringify(defaultGoReadinessLedger)), defaultGoReadinessLedger, 'ledger should be plain deterministic data')
  assert.deepEqual(Object.keys(defaultGoReadinessLedger).sort(), [
    'blockers',
    'defaultGo',
    'defaultResolver',
    'fallbackDeletion',
    'modeChange',
    'module',
    'noSilentWaiver',
    'normalUserNativeAvailability',
    'packageReleaseApproved',
    'ready',
    'schemaVersion',
    'secondPlatformSupport',
    'signingApproved',
    'theme',
  ].sort(), 'ledger should expose only expected aggregate fields')
}

function assertLedgerAggregate() {
  assert.equal(defaultGoReadinessLedger.schemaVersion, DEFAULT_GO_READINESS_LEDGER_SCHEMA_VERSION)
  assert.equal(defaultGoReadinessLedger.theme, DEFAULT_GO_READINESS_THEME)
  assert.equal(defaultGoReadinessLedger.module, DEFAULT_GO_READINESS_MODULE)
  for (const field of EXPECTED_GLOBAL_FALSE_FIELDS) assert.equal(defaultGoReadinessLedger[field], false, `ledger ${field} must remain false`)
  assert.equal(defaultGoReadinessLedger.noSilentWaiver, true, 'ledger noSilentWaiver must be true')
  assert.equal(defaultGoReadinessLedger.ready, false, 'ledger aggregate ready must remain false')
  const allRequiredBlockersSatisfied = defaultGoReadinessLedger.blockers.every(blocker => blocker.status !== BLOCKED)
  assert.equal(allRequiredBlockersSatisfied, false, 'current blockers must prevent inferred ready:true')
  assert.equal(defaultGoReadinessLedger.ready && allRequiredBlockersSatisfied, false, 'ready:true cannot be inferred from current repo facts')
}

function assertBlockers() {
  assert.equal(Array.isArray(defaultGoReadinessLedger.blockers), true, 'ledger blockers must be an array')
  assert.deepEqual(defaultGoReadinessLedger.blockers.map(blocker => blocker.id), DEFAULT_GO_BLOCKER_IDS, 'blocker IDs should be deterministic and in expected order')
  assert.deepEqual(new Set(defaultGoReadinessLedger.blockers.map(blocker => blocker.id)).size, DEFAULT_GO_BLOCKER_IDS.length, 'blocker IDs should exist exactly once')
  for (const blocker of defaultGoReadinessLedger.blockers) {
    assert.equal(typeof blocker.id, 'string', 'blocker id should be string')
    assert.equal(typeof blocker.category, 'string', `${blocker.id} category should be string`)
    assert.equal(blocker.status, BLOCKED, `${blocker.id} must remain blocked`)
    assert.equal(blocker.requiredBeforeDefaultGo, true, `${blocker.id} requiredBeforeDefaultGo must be true`)
    assert.equal(blocker.waivableByRepoStateAlone, false, `${blocker.id} must not be waivable by repo state alone`)
    assert.equal(typeof blocker.currentEvidence, 'string', `${blocker.id} currentEvidence should be compact string`)
    assert.equal(typeof blocker.missingForApproval, 'string', `${blocker.id} missingForApproval should be compact string`)
    assert.equal(typeof blocker.stopIfMissing, 'string', `${blocker.id} stopIfMissing should be compact string`)
    assert.ok(blocker.currentEvidence.length > 20, `${blocker.id} currentEvidence should not be empty`)
    assert.ok(blocker.missingForApproval.length > 20, `${blocker.id} missingForApproval should not be empty`)
    assert.ok(blocker.stopIfMissing.includes('Default Go must remain disabled') || blocker.stopIfMissing.includes('Default Go and fallback deletion must remain disabled'), `${blocker.id} stopIfMissing should keep default Go disabled`)
    assert.equal(Array.isArray(blocker.doesNotProve), true, `${blocker.id} doesNotProve should be array`)
    assert.ok(blocker.doesNotProve.includes('normal-user native availability'), `${blocker.id} doesNotProve normal-user native availability`)
    assert.ok(blocker.doesNotProve.includes('default Go approval or enablement'), `${blocker.id} doesNotProve default Go`)
    assert.ok(blocker.doesNotProve.includes('default resolver approval or enablement'), `${blocker.id} doesNotProve default resolver`)
    assert.ok(blocker.doesNotProve.includes('TypeScript fallback deletion approval'), `${blocker.id} doesNotProve fallback deletion`)
    assert.ok(blocker.doesNotProve.includes('package release approval'), `${blocker.id} doesNotProve package release`)
    assert.ok(blocker.doesNotProve.includes('install source approval'), `${blocker.id} doesNotProve install source`)
    assert.ok(blocker.doesNotProve.includes('signing/cosign/SLSA/security attestation approval'), `${blocker.id} doesNotProve signing`)
    assert.ok(blocker.doesNotProve.includes('second-platform support or platform matrix'), `${blocker.id} doesNotProve second platform`)
    const positiveClaimText = [blocker.currentEvidence, blocker.missingForApproval, blocker.stopIfMissing, ...blocker.doesNotProve].join('\n')
    for (const pattern of FORBIDDEN_LEDGER_CLAIM_PATTERNS) assert.equal(pattern.test(positiveClaimText), false, `${blocker.id} must not claim approval/proof/enabled state: ${pattern}`)
  }
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const id of DEFAULT_GO_BLOCKER_IDS) assertIncludes(doc, `\`${id}\``, DOC)
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not embed raw hosted/artifact/verifier JSON bodies`)
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
  for (const [scriptName, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+version\b/i.test(command), false, `${scriptName} must not run npm version`)
    assert.equal(/npm\s+publish\b/i.test(command), false, `${scriptName} must not run npm publish`)
    if (/npm\s+pack\b/i.test(command)) {
      assert.match(command, /--dry-run\b/, `${scriptName} may only run npm pack as dry-run`)
      assert.match(command, /--ignore-scripts\b/, `${scriptName} npm pack dry-run must ignore scripts`)
    }
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild\b/i.test(command), false, `${scriptName} must not build/download native helper`)
  }

  const kernel = read(root, 'core/kernel.ts')
  assertIncludes(kernel, "const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)", 'core/kernel.ts')
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'core/kernel.ts')
  assertIncludes(kernel, "const cutoverRequested = requestedMode === 'go-cutover' || packagedPreviewRequested", 'core/kernel.ts')
  assertIncludes(kernel, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const", 'core/kernel.ts')
  assertIncludes(kernel, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'core/kernel.ts')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'core/kernel.ts')
  assert.equal(/default Go is enabled|default resolver is enabled|fallback deletion is approved|package release is approved|install source is approved|release asset is approved|signing is approved|cosign is approved|SLSA is approved|second[- ]platform support is approved/i.test(kernel), false, 'runtime must not overclaim default/release/signing/platform status')

  const readiness = read(root, 'commands/readiness.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'commands/readiness.ts')
  assert.equal(/default Go is enabled|default resolver is enabled|normal-user native helper availability is proven/i.test(readiness), false, 'readiness must not expand to default/native availability')
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
    assert.equal(source.includes('defaultGoReadinessLedger'), false, `${toRel(root, file)} must not import/read Slice 2 ledger`)
    assert.equal(source.includes('defaultGoReadinessBlockers'), false, `${toRel(root, file)} must not import/read Slice 2 ledger blockers`)
    assert.equal(source.includes('tests/fixtures/kernel/v0636'), false, `${toRel(root, file)} must not import/read Slice 2 fixture path`)
  }
}

function assertArtifactInvariants(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain pi-agentteam temp tarballs')
  const forbiddenArtifacts = []
  const forbiddenRecords = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !ALLOWED_REVIEW_RECORDS.has(rel) && FORBIDDEN_GENERATED_RECORD.test(rel)) forbiddenRecords.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain checked-in native/archive/signing artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain generated manifests/checksums/provenance/attestation/raw release records outside docs/tests/review helper areas')
}

module.exports = {
  name: 'Go kernel v0.6.36 default-Go readiness blocker ledger',
  async run(env) {
    const root = env.helpers.extRoot
    assertLedgerDeterminism(root)
    assertLedgerAggregate()
    assertBlockers()
    assertDoc(root)
    assertPackageRuntimeInvariants(root)
    assertFixtureNotUsedByProduction(root)
    assertArtifactInvariants(root)
    assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  },
}
