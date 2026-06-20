const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  CURRENTLY_BLOCKED,
  FUTURE_REQUIRED,
  NON_APPLIED,
  NOT_IMPLEMENTED,
  ROLLBACK_DISABLE_POLICY_CASE_IDS,
  ROLLBACK_DISABLE_POLICY_MODULE,
  ROLLBACK_DISABLE_POLICY_SCHEMA_VERSION,
  ROLLBACK_DISABLE_POLICY_THEME,
  rollbackDisablePolicy,
  rollbackDisablePolicyCases,
} = require('../fixtures/kernel/v0636/rollbackDisablePolicyCases.cjs')

const DOC = 'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md'
const FIXTURE = 'tests/fixtures/kernel/v0636/rollbackDisablePolicyCases.cjs'
const SUITE = 'tests/suites/go-kernel-v0636-rollback-disable-policy.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_CATEGORIES = [
  'future kill-switch precedence',
  'fail-closed cutover behavior',
  'TypeScript fallback retention/deletion gate',
  'diagnostics wording',
  'package/native failure modes',
  'approval path',
]
const REQUIRED_FAILURE_MODES = [
  'bad-package',
  'bad-helper',
  'missing-helper',
  'bad-manifest',
  'unsupported-platform',
  'package-deprecated',
  'package-unpublished',
  'checksum-mismatch',
  'signing-mismatch',
]
const REQUIRED_DOC = [
  '## Slice 4 — Rollback/Default-Disable Non-Applied Policy Contract',
  'Slice 4 defines rollback/default-disable policy as a non-applied future contract only.',
  '`tests/fixtures/kernel/v0636/rollbackDisablePolicyCases.cjs`',
  '`tests/suites/go-kernel-v0636-rollback-disable-policy.cjs`',
  'The policy fixture is docs/tests/fixtures-only and is not imported by production source.',
  'Every policy case is `nonApplied`, `futureRequired`, `currentlyBlocked`, and `notImplemented`.',
  'Every policy case keeps `rollbackDisableImplemented:false`, `defaultGoApproved:false`, `defaultResolverApproved:false`, package/native delivery unapproved, and `fallbackDeletionApproved:false`.',
  'Future kill-switch precedence cases require a default-disable override to win over default Go, default resolver, and package/native discovery.',
  'Missing or invalid helpers under any future default path must fail closed and must not silently hide default failure.',
  'Explicit `go-cutover` and explicit `go-packaged-preview` `tmuxSnapshotParse` failures remain compact diagnostics / fail-closed and current behavior must remain unchanged.',
  'TypeScript parser fallback is retained now; fallback deletion requires a later explicit checkpoint and a reviewed rollback/default-disable alternative.',
  '`compactReadModelFingerprint` remains TypeScript fallback/non-cutover.',
  'Future diagnostics must not claim normal-user native availability, package release approval, install source approval, signing approval, default-Go approval, or default resolver approval.',
  'Future diagnostics must redact paths and omit raw stdout, raw stderr, stack traces, tokens, hosted records, mailbox text, report text, and state full text.',
  'Future package/native failure modes include bad package, bad helper, missing helper, bad manifest, unsupported platform, package deprecation, package unpublish, checksum mismatch, and signing mismatch.',
  'Leader/user explicit approval is required after evidence gates; repo state alone cannot approve rollback/default-disable.',
  'Current kernel semantics remain unchanged: default/unset remains TypeScript/non-native, `go-cutover` is explicit, `go-packaged-preview` is explicit-only, `tmuxSnapshotParse` remains the sole cutover module, and `compactReadModelFingerprint` remains TypeScript fallback/non-cutover.',
  'STOP gates for Slice 4: no runtime default-disable behavior, no new runtime env vars or options, no default Go, no default resolver, no `go-cutover` behavior change, no `go-packaged-preview` behavior change, no TypeScript fallback deletion, no `compactReadModelFingerprint` cutover, no package/native delivery, no hosted workflow action, no release/tag/publish action, and no Slice 5+ work.',
]
const FORBIDDEN_CLAIM_PATTERNS = [
  /rollback\/default-disable (?:implemented|enabled|approved|ready|available|proven)/i,
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
  /signing (?:approved|enabled|ready|available|proven)/i,
  /(?<!no )signing is (?!not\b|missing\b|blocked\b|unapproved\b)(?:approved|enabled|ready|available|proven)/i,
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'rollback/default-disable is implemented',
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

function assertFixtureDeterminism(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(rollbackDisablePolicy)), rollbackDisablePolicy, 'policy fixture should be plain deterministic data')
  assert.deepEqual(Object.keys(rollbackDisablePolicy).sort(), [
    'application',
    'approved',
    'cases',
    'currentKernelSemanticsUnchanged',
    'currentState',
    'defaultGoApproved',
    'defaultResolverApproved',
    'fallbackDeletionApproved',
    'gate',
    'implemented',
    'module',
    'repoStateAloneCanApprove',
    'rollbackDisableImplemented',
    'schemaVersion',
    'status',
    'theme',
  ].sort(), 'policy fixture should expose only expected aggregate fields')
  assert.deepEqual(rollbackDisablePolicyCases.map(item => item.id), ROLLBACK_DISABLE_POLICY_CASE_IDS, 'case IDs should be deterministic and in expected order')
  assert.deepEqual(new Set(ROLLBACK_DISABLE_POLICY_CASE_IDS).size, ROLLBACK_DISABLE_POLICY_CASE_IDS.length, 'case IDs should be unique')
}

function assertPolicyAggregate() {
  assert.equal(rollbackDisablePolicy.schemaVersion, ROLLBACK_DISABLE_POLICY_SCHEMA_VERSION)
  assert.equal(rollbackDisablePolicy.theme, ROLLBACK_DISABLE_POLICY_THEME)
  assert.equal(rollbackDisablePolicy.module, ROLLBACK_DISABLE_POLICY_MODULE)
  assert.equal(rollbackDisablePolicy.application, NON_APPLIED)
  assert.equal(rollbackDisablePolicy.gate, FUTURE_REQUIRED)
  assert.equal(rollbackDisablePolicy.currentState, CURRENTLY_BLOCKED)
  assert.equal(rollbackDisablePolicy.status, NOT_IMPLEMENTED)
  assert.equal(rollbackDisablePolicy.implemented, false)
  assert.equal(rollbackDisablePolicy.approved, false)
  assert.equal(rollbackDisablePolicy.rollbackDisableImplemented, false)
  assert.equal(rollbackDisablePolicy.defaultGoApproved, false)
  assert.equal(rollbackDisablePolicy.defaultResolverApproved, false)
  assert.equal(rollbackDisablePolicy.fallbackDeletionApproved, false)
  assert.equal(rollbackDisablePolicy.repoStateAloneCanApprove, false)
  assert.equal(rollbackDisablePolicy.currentKernelSemanticsUnchanged, true)
  assert.equal(rollbackDisablePolicy.cases, rollbackDisablePolicyCases)
}

function assertPolicyCases() {
  assert.equal(Array.isArray(rollbackDisablePolicyCases), true, 'policy cases should be array')
  assert.equal(rollbackDisablePolicyCases.length, ROLLBACK_DISABLE_POLICY_CASE_IDS.length)
  for (const category of REQUIRED_CATEGORIES) {
    assert.ok(rollbackDisablePolicyCases.some(item => item.category === category), `policy should cover ${category}`)
  }
  const allFailureModes = new Set(rollbackDisablePolicyCases.flatMap(item => item.failureModes))
  for (const mode of REQUIRED_FAILURE_MODES) assert.ok(allFailureModes.has(mode), `policy should cover ${mode}`)

  for (const item of rollbackDisablePolicyCases) {
    assert.equal(item.application, NON_APPLIED, `${item.id} application`)
    assert.equal(item.gate, FUTURE_REQUIRED, `${item.id} gate`)
    assert.equal(item.currentState, CURRENTLY_BLOCKED, `${item.id} currentState`)
    assert.equal(item.status, NOT_IMPLEMENTED, `${item.id} status`)
    assert.equal(item.implemented, false, `${item.id} implemented`)
    assert.equal(item.approved, false, `${item.id} approved`)
    assert.equal(item.rollbackDisableImplemented, false, `${item.id} rollbackDisableImplemented`)
    assert.equal(item.defaultGoApproved, false, `${item.id} defaultGoApproved`)
    assert.equal(item.defaultResolverApproved, false, `${item.id} defaultResolverApproved`)
    assert.equal(item.repoStateAloneCanApprove, false, `${item.id} repoStateAloneCanApprove`)
    assert.equal(item.currentSemanticsUnchanged, true, `${item.id} currentSemanticsUnchanged`)
    assert.equal(item.requiresExplicitApproval, true, `${item.id} requiresExplicitApproval`)
    assert.equal(typeof item.futureRequirement, 'string', `${item.id} futureRequirement`)
    assert.equal(typeof item.currentEvidence, 'string', `${item.id} currentEvidence`)
    assert.equal(typeof item.stopIfMissing, 'string', `${item.id} stopIfMissing`)
    assert.ok(item.futureRequirement.length > 30, `${item.id} futureRequirement should be meaningful`)
    assert.ok(item.currentEvidence.length > 30, `${item.id} currentEvidence should be meaningful`)
    assert.ok(item.stopIfMissing.length > 30, `${item.id} stopIfMissing should be meaningful`)
    assert.equal(Array.isArray(item.failureModes), true, `${item.id} failureModes`)
    assert.equal(Array.isArray(item.diagnostics), true, `${item.id} diagnostics`)
    assert.equal(Array.isArray(item.doesNotProve), true, `${item.id} doesNotProve`)
    assert.ok(item.doesNotProve.includes('rollback/default-disable implementation'), `${item.id} doesNotProve rollback/default-disable`)
    assert.ok(item.doesNotProve.includes('default Go approval or enablement'), `${item.id} doesNotProve default Go`)
    assert.ok(item.doesNotProve.includes('default resolver approval or enablement'), `${item.id} doesNotProve default resolver`)
    assert.ok(item.doesNotProve.includes('normal-user native availability'), `${item.id} doesNotProve native availability`)
    assert.ok(item.doesNotProve.includes('TypeScript fallback deletion approval'), `${item.id} doesNotProve fallback deletion`)
    assert.equal(item.status === 'passed', false, `${item.id} must not be passed`)
    const claimText = [item.futureRequirement, item.currentEvidence, item.stopIfMissing, ...item.failureModes, ...item.diagnostics, ...item.doesNotProve].join('\n')
    for (const pattern of FORBIDDEN_CLAIM_PATTERNS) assert.equal(pattern.test(claimText), false, `${item.id} must not overclaim: ${pattern}`)
  }
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const id of ROLLBACK_DISABLE_POLICY_CASE_IDS) assertIncludes(doc, `\`${id}\``, DOC)
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not embed raw hosted/artifact/verifier JSON bodies`)
}

function assertCurrentKernelSemantics(root) {
  const kernel = read(root, 'core/kernel.ts')
  assertIncludes(kernel, "export type AgentTeamKernelKnownMode = 'disabled' | 'typescript' | 'go' | 'auto' | 'go-cutover' | 'go-packaged-preview'", 'core/kernel.ts')
  assertIncludes(kernel, "if (!raw || raw === 'none' || raw === 'off' || raw === 'disabled') return 'disabled'", 'core/kernel.ts')
  assertIncludes(kernel, "const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)", 'core/kernel.ts')
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'core/kernel.ts')
  assertIncludes(kernel, "const cutoverRequested = requestedMode === 'go-cutover' || packagedPreviewRequested", 'core/kernel.ts')
  assertIncludes(kernel, "const startupFallback = cutoverRequested ? undefined : initialFallback", 'core/kernel.ts')
  assertIncludes(kernel, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const", 'core/kernel.ts')
  assertIncludes(kernel, 'cutoverUnavailableSnapshot(capturedAt)', 'core/kernel.ts')
  assertIncludes(kernel, "resultMarker: 'stale'", 'core/kernel.ts')
  assertIncludes(kernel, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'core/kernel.ts')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'core/kernel.ts')
  assert.equal(/AGENTTEAM_KERNEL_CUTOVER_MODULE\s*=\s*'compactReadModelFingerprint'/.test(kernel), false, 'compactReadModelFingerprint must not become cutover module')
  assert.equal(/default-disable|defaultDisable|DEFAULT_DISABLE|PI_AGENTTEAM_DEFAULT_DISABLE|ROLLBACK_DISABLE/i.test(kernel), false, 'kernel must not implement default-disable runtime policy in Slice 4')
  assert.equal(/default Go is enabled|default resolver is enabled|fallback deletion is approved|package release is approved|install source is approved|signing is approved|cosign is approved|SLSA is approved/i.test(kernel), false, 'kernel must not overclaim default/release/signing status')

  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  assertIncludes(resolver, "export const AGENTTEAM_PACKAGED_RESOLVER_MODULE = 'tmuxSnapshotParse'", 'core/kernelPackagedResolver.ts')
  assert.equal(/default-disable|defaultDisable|DEFAULT_DISABLE|PI_AGENTTEAM_DEFAULT_DISABLE|ROLLBACK_DISABLE/i.test(resolver), false, 'packaged resolver must not implement default-disable runtime policy in Slice 4')

  const readiness = read(root, 'commands/readiness.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'commands/readiness.ts')
  assert.equal(/default-disable|defaultDisable|DEFAULT_DISABLE|normal-user native helper availability is proven|default Go is enabled|default resolver is enabled/i.test(readiness), false, 'readiness must not expose default-disable/default availability controls')
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
    assert.equal(source.includes('rollbackDisablePolicyCases'), false, `${toRel(root, file)} must not import/read Slice 4 policy fixture`)
    assert.equal(source.includes('rollbackDisablePolicy'), false, `${toRel(root, file)} must not import/read Slice 4 policy fixture`)
    assert.equal(source.includes('tests/fixtures/kernel/v0636/rollbackDisablePolicyCases.cjs'), false, `${toRel(root, file)} must not import/read Slice 4 fixture path`)
  }
}

function assertPackageInvariants(root) {
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
}

function assertWorkflowInvariants(root) {
  const workflowsRoot = path.join(root, '.github', 'workflows')
  const workflows = fs.readdirSync(workflowsRoot).filter(name => name.endsWith('.yml') || name.endsWith('.yaml')).sort()
  assert.deepEqual(workflows, ['go-helper-review-artifact.yml'], 'only review-artifact workflow should exist')
  const workflow = read(root, '.github/workflows/go-helper-review-artifact.yml')
  assert.equal((workflow.match(/target:\s+linux-x64-glibc/g) || []).length, 2, 'review workflow should keep one linux-x64-glibc target in each build/verify matrix')
  assert.equal(/target:\s+(?!linux-x64-glibc\b)[a-z0-9-]+/i.test(workflow), false, 'review workflow must not add second-platform target rows')
  assert.equal(/macos-|windows-|arm64|musl|darwin|win32/i.test(workflow), false, 'review workflow must not add second-platform runner/platform terms')
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
  name: 'Go kernel v0.6.36 rollback/default-disable non-applied policy',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureDeterminism(root)
    assertPolicyAggregate()
    assertPolicyCases()
    assertDoc(root)
    assertCurrentKernelSemantics(root)
    assertFixtureNotUsedByProduction(root)
    assertPackageInvariants(root)
    assertWorkflowInvariants(root)
    assertArtifactInvariants(root)
    assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  },
}
