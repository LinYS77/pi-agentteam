const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  BLOCKED,
  DEFAULT_GO_BLOCKER_IDS,
  defaultGoReadinessLedger,
} = require('../fixtures/kernel/v0636/defaultGoReadinessLedger.cjs')
const {
  DEFAULT_GO_READINESS_DRY_RUN_RESULT_MARKER,
  createFailClosedDefaultGoReadinessDryRunSummary,
  formatDefaultGoReadinessDryRunText,
  verifyDefaultGoReadinessDryRun,
} = require('../../scripts/lib/go-default-readiness-dry-run.cjs')

const DOC = 'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md'
const LIB = 'scripts/lib/go-default-readiness-dry-run.cjs'
const CLI = 'scripts/verify-go-default-readiness-dry-run.cjs'
const SUITE = 'tests/suites/go-kernel-v0636-default-go-readiness-dry-run.cjs'
const LEDGER = 'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs'
const PACKAGE_VERSION = '0.6.8'
const EXPECTED_FALSE_FLAGS = [
  'ready',
  'modeChange',
  'defaultGo',
  'defaultResolver',
  'nativePackageDelivery',
  'normalUserNativeAvailability',
  'fallbackDeletion',
  'packageReleaseApproved',
  'installSourceApproved',
  'signingApproved',
  'secondPlatformSupport',
]
const REQUIRED_DOC = [
  '## Slice 3 — Non-Mutating Default-Go Readiness Dry-Run Verifier',
  'Slice 3 adds an optional local dry-run verifier for reviewer governance only.',
  '`scripts/lib/go-default-readiness-dry-run.cjs`',
  '`scripts/verify-go-default-readiness-dry-run.cjs`',
  '`tests/suites/go-kernel-v0636-default-go-readiness-dry-run.cjs`',
  '`tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs`',
  'The verifier reads the Slice 2 ledger and static repo facts only.',
  'It does not execute the Go helper, tmux, `npm pack`, `npm install`, `go build`, hosted workflow commands, `gh`, tokens, or network commands.',
  'It does not read raw mailbox, report, or state full text and does not write repo files, temp roots, artifacts, environment variables, package metadata, runtime files, commands, tools, readiness code, workflows, or production source.',
  '`resultMarker:"default-go-readiness-dry-run"`',
  '`ok:true`',
  '`ready:false`',
  '`modeChange:false`',
  '`defaultGo:false`',
  '`defaultResolver:false`',
  '`nativePackageDelivery:false`',
  '`normalUserNativeAvailability:false`',
  '`fallbackDeletion:false`',
  '`packageReleaseApproved:false`',
  '`installSourceApproved:false`',
  '`signingApproved:false`',
  '`secondPlatformSupport:false`',
  '`noSilentWaiver:true`',
  '`reviewOnly:true`',
  '`prototype:true`',
  '`blockerCount:10`',
  '`diagnostics.pathsRedacted:true`',
  'All Slice 2 blocker IDs remain present, blocked, required before default Go, and not waivable by repo state alone.',
  'Failure paths fail closed with the same false availability flags and compact diagnostics without stack traces, raw stdout/stderr, or absolute paths.',
  'The verifier cannot produce `ready:true` for the current repo and contains no waiver simulation.',
  'STOP gates for Slice 3: no default Go, no default resolver, no native package delivery, no normal-user native availability, no fallback deletion, no package release approval, no install-source approval, no signing approval, no second-platform support, no hosted/tag approval, and no production behavior change.',
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
const FORBIDDEN_SOURCE_PATTERNS = [
  /require\(['"]node:child_process['"]\)/,
  /require\(['"]child_process['"]\)/,
  /\b(?:spawnSync|spawn|execSync|execFileSync|execFile|exec)\s*\(/,
  /\b(?:writeFileSync|appendFileSync|mkdirSync|mkdtempSync|rmSync|rmdirSync|unlinkSync|renameSync|copyFileSync)\s*\(/,
  /\bprocess\.env\b/,
  /\bfetch\s*\(/,
  /\bhttps?\.(?:request|get)\s*\(/,
  /['"`]\s*(?:npm\s+(?:pack|install|version|publish)|go\s+(?:build|install|mod)|tmux\b|curl\b|wget\b|gh\b)/,
  /\b(?:state|mailbox|report)s?\b.*\b(?:readFileSync|readdirSync)\s*\(/i,
  /ready\s*:\s*true/,
]

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

function assertNoAbsolutePaths(value) {
  const text = JSON.stringify(value)
  assert.equal(/(?:^|["'\s])\/(?:home|tmp|var|Users|private|mnt|workspace)\//.test(text), false, 'summary must not contain absolute host paths')
  assert.equal(/[A-Za-z]:\\/.test(text), false, 'summary must not contain Windows absolute paths')
}

function assertSummaryContract(root) {
  const summary = verifyDefaultGoReadinessDryRun({ repoRoot: root })
  assert.equal(summary.ok, true)
  assert.equal(summary.resultMarker, DEFAULT_GO_READINESS_DRY_RUN_RESULT_MARKER)
  for (const field of EXPECTED_FALSE_FLAGS) assert.equal(summary[field], false, `${field} must remain false`)
  assert.equal(summary.noSilentWaiver, true)
  assert.equal(summary.reviewOnly, true)
  assert.equal(summary.prototype, true)
  assert.equal(summary.blockerCount, DEFAULT_GO_BLOCKER_IDS.length)
  assert.deepEqual(summary.blockedIds, DEFAULT_GO_BLOCKER_IDS)
  assert.equal(summary.ledger.schemaVersion, defaultGoReadinessLedger.schemaVersion)
  assert.equal(summary.ledger.theme, defaultGoReadinessLedger.theme)
  assert.equal(summary.ledger.module, defaultGoReadinessLedger.module)
  assert.equal(summary.ledger.ready, false)
  assert.equal(summary.ledger.allBlockersBlocked, true)
  assert.equal(summary.blockers.length, DEFAULT_GO_BLOCKER_IDS.length)
  for (const blocker of summary.blockers) {
    assert.equal(blocker.status, BLOCKED, `${blocker.id} must remain blocked`)
    assert.equal(blocker.requiredBeforeDefaultGo, true, `${blocker.id} must remain required`)
    assert.equal(blocker.waivableByRepoStateAlone, false, `${blocker.id} must not be silently waived`)
  }
  assert.deepEqual(Object.keys(summary.repoFacts).sort(), ['artifacts', 'checkedFiles', 'kernel', 'packageJson', 'readiness', 'workflows'].sort())
  assert.ok(summary.repoFacts.checkedFiles.includes('package.json'))
  assert.ok(summary.repoFacts.checkedFiles.includes(LEDGER))
  assert.deepEqual(summary.repoFacts.packageJson.piExtensions, ['./index.ts'])
  assert.equal(summary.repoFacts.packageJson.version, PACKAGE_VERSION)
  assert.equal(summary.repoFacts.packageJson.nativeMetadataAbsent, true)
  assert.equal(summary.repoFacts.packageJson.packageManagerNativeDeliveryMetadata, false)
  assert.deepEqual(summary.repoFacts.kernel.knownModes, ['disabled', 'typescript', 'go', 'auto', 'go-cutover', 'go-packaged-preview'])
  assert.equal(summary.repoFacts.kernel.defaultRuntime, 'typescript/non-native')
  assert.equal(summary.repoFacts.kernel.defaultResolverEnabled, false)
  assert.equal(summary.repoFacts.kernel.compactReadModelFingerprintFallbackRetained, true)
  assert.equal(summary.repoFacts.readiness.reviewerDiagnosticsOnly, true)
  assert.equal(summary.repoFacts.readiness.normalUserNativeAvailabilityProof, false)
  assert.deepEqual(summary.repoFacts.workflows.workflowFiles, ['go-helper-review-artifact.yml'])
  assert.equal(summary.repoFacts.workflows.reviewArtifactTarget, 'linux-x64-glibc')
  assert.equal(summary.repoFacts.workflows.secondPlatformMatrix, false)
  assert.equal(summary.repoFacts.artifacts.rootForbiddenArtifactsAbsent, true)
  assert.equal(summary.diagnostics.pathsRedacted, true)
  assert.equal(summary.diagnostics.rawOutputIncluded, false)
  assert.equal(summary.diagnostics.stackIncluded, false)
  assert.equal(summary.diagnostics.dryRun, true)
  assert.equal(summary.diagnostics.repoMutation, false)
  assert.equal(summary.diagnostics.envMutation, false)
  assert.equal(summary.diagnostics.networkAccess, false)
  assert.equal(summary.diagnostics.helperExecution, false)
  assertNoAbsolutePaths(summary)
  const human = formatDefaultGoReadinessDryRunText(summary)
  assertIncludes(human, 'ready=false', 'human output')
  assertIncludes(human, 'defaultGo=false', 'human output')
  assertIncludes(human, 'blockerCount=10', 'human output')
}

function assertFailClosedContract(root) {
  const missingRootSummary = verifyDefaultGoReadinessDryRun({ repoRoot: path.join(root, '__missing_v0636_default_go_dry_run_root__') })
  assert.equal(missingRootSummary.ok, false)
  assert.equal(missingRootSummary.resultMarker, DEFAULT_GO_READINESS_DRY_RUN_RESULT_MARKER)
  for (const field of EXPECTED_FALSE_FLAGS) assert.equal(missingRootSummary[field], false, `fail-closed ${field} must remain false`)
  assert.equal(missingRootSummary.noSilentWaiver, true)
  assert.equal(missingRootSummary.reviewOnly, true)
  assert.equal(missingRootSummary.prototype, true)
  assert.equal(missingRootSummary.diagnostics.pathsRedacted, true)
  assert.equal(missingRootSummary.diagnostics.stackIncluded, false)
  assert.equal(missingRootSummary.diagnostics.rawOutputIncluded, false)
  assert.equal(typeof missingRootSummary.diagnostics.failureKind, 'string')
  assertNoAbsolutePaths(missingRootSummary)

  const explicitFailure = createFailClosedDefaultGoReadinessDryRunSummary('argument-error', 'bad repo root')
  assert.equal(explicitFailure.ok, false)
  assert.equal(explicitFailure.ready, false)
  assert.equal(explicitFailure.defaultGo, false)
  assert.equal(explicitFailure.defaultResolver, false)
  assert.equal(explicitFailure.diagnostics.failureKind, 'argument-error')
  assertNoAbsolutePaths(explicitFailure)
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const id of DEFAULT_GO_BLOCKER_IDS) assertIncludes(doc, `\`${id}\``, DOC)
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not embed raw hosted/artifact/verifier JSON bodies`)
}

function assertVerifierSourceBoundaries(root) {
  for (const rel of [LIB, CLI]) {
    const source = read(root, rel)
    for (const pattern of FORBIDDEN_SOURCE_PATTERNS) assert.equal(pattern.test(source), false, `${rel} must not contain forbidden verifier behavior: ${pattern}`)
  }
  const lib = read(root, LIB)
  assertIncludes(lib, "require('node:fs')", LIB)
  assertIncludes(lib, "require('node:path')", LIB)
  assertIncludes(lib, LEDGER, LIB)
  assertIncludes(lib, 'DEFAULT_GO_READINESS_DRY_RUN_RESULT_MARKER', LIB)
  assertIncludes(lib, 'FALSE_AVAILABILITY_FLAGS', LIB)
  assertIncludes(lib, 'repoMutation: false', LIB)
  assertIncludes(lib, 'envMutation: false', LIB)
  assertIncludes(lib, 'networkAccess: false', LIB)
  assertIncludes(lib, 'helperExecution: false', LIB)
  assertIncludes(read(root, CLI), 'verifyDefaultGoReadinessDryRun', CLI)
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
    if (FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !ALLOWED_REVIEW_RECORDS.has(rel) && FORBIDDEN_GENERATED_RECORD.test(rel)) forbiddenRecords.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain checked-in native/archive/signing artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain generated manifests/checksums/provenance/attestation/raw release records outside docs/tests/review helper areas')
}

module.exports = {
  name: 'Go kernel v0.6.36 default-Go readiness dry-run verifier',
  async run(env) {
    const root = env.helpers.extRoot
    assertSummaryContract(root)
    assertFailClosedContract(root)
    assertDoc(root)
    assertVerifierSourceBoundaries(root)
    assertPackageRuntimeInvariants(root)
    assertArtifactInvariants(root)
    assert.equal(exists(root, LIB), true, `${LIB} should exist`)
    assert.equal(exists(root, CLI), true, `${CLI} should exist`)
    assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  },
}
