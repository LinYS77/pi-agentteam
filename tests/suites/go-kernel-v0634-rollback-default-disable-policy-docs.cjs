const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.6.34-package-release-install-layout-decision.md'
const PACKAGE_VERSION = '0.6.8'
const OWNERSHIP_ROLES = [
  'Package/release owner',
  'Install source owner',
  'Artifact/verifier owner',
  'Runtime/default resolver owner',
  'Rollback/default-disable owner',
  'Security owner',
  'Platform owner',
  'User-facing communication owner',
]
const FAILURE_SCENARIOS = [
  'bad package metadata',
  'bad helper artifact',
  'checksum/provenance mismatch',
  'unsupported platform',
  'broken diagnostics/no-leak violation',
  'package unpublish/deprecation/yank',
  'security incident',
  'default resolver disablement',
  'release rollback',
  'package/helper skew',
  'helper protocol/capability mismatch',
]
const PRECONDITIONS = [
  'normal-user native availability proven.',
  'package/release/install ownership approved.',
  'package-manager native delivery approved/proven.',
  'default resolver/default Go approved and observed.',
  'unsupported-platform policy approved.',
  'diagnostics/no-leak proven.',
  'rollback/default-disable policy implemented/tested.',
  'security/signing ownership approved.',
  'platform matrix/support policy approved.',
  'leader/user explicit approval.',
  'at least one checkpoint after default Go approval.',
  '`compactReadModelFingerprint` is not included; it remains TypeScript fallback / non-cutover unless separately approved.',
]
const REQUIRED_DOC = [
  '## Slice 5 — Rollback / Default-Disable Ownership and Fallback-Deletion Preconditions',
  'Slice 5 defines rollback/default-disable ownership, failure scenarios, and fallback-deletion preconditions.',
  'It is docs/tests only and does not implement a runtime default-disable flag, default resolver, default Go, fallback deletion, hidden fallback rollback, or `compactReadModelFingerprint` cutover.',
  'Ownership roles remain future owner / unassigned until leader decision, but the responsibility categories are explicit:',
  'Rollback after cutover must be a release/tag/package/deprecation/default-disable policy, not hidden long-term TypeScript fallback.',
  'Hidden runtime TypeScript fallback rollback remains unapproved.',
  'Current explicit `go-packaged-preview` and `go-cutover` failure behavior remains fail-closed.',
  'Default-disable implementation is future work, not v0.6.34.',
  'Any future default-disable behavior must be explicitly designed, tested, documented, and approved before default Go or fallback deletion.',
  'Runtime rollback must not silently reinterpret failed native helper execution as successful pane disappearance or successful TypeScript parser output.',
  'Fallback-deletion preconditions remain blocked until all are complete:',
  'No default Go approval.',
  'No default resolver approval.',
  'No TypeScript fallback deletion approval.',
  'No hidden fallback rollback approval.',
  'No runtime behavior change.',
  'No `compactReadModelFingerprint` cutover approval.',
  'No tag, release, npm version, npm publish, package metadata, package files, native deps, lifecycle hooks, release asset, signing, cosign, SLSA, readiness/UI/tool expansion, or hosted workflow action.',
  'tests/suites/go-kernel-v0634-rollback-default-disable-policy-docs.cjs',
  'Do not start Slice 6 security/signing ownership in Slice 5.',
  'Do not implement runtime default-disable or default resolver code.',
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'hidden fallback rollback is allowed',
  'hidden runtime TS fallback rollback is allowed',
  'compactReadModelFingerprint cutover is approved',
  'compactReadModelFingerprint is cut over',
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'package-manager native delivery is complete',
  'real package-manager native delivery is complete',
  'release asset is approved',
  'install source is approved',
  'signing is approved',
  'signing proof is complete',
  'cosign is approved',
  'SLSA is approved',
  'second platform is supported',
]
const EXPECTED_TOOLS = [
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
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
  for (const role of OWNERSHIP_ROLES) assertIncludes(doc, role, DOC)
  for (const scenario of FAILURE_SCENARIOS) assertIncludes(doc, scenario, DOC)
  for (const precondition of PRECONDITIONS) assertIncludes(doc, precondition, DOC)
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
}

function assertKernelFailClosedInvariants(root) {
  const kernel = read(root, 'core/kernel.ts')
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel explicit preview gate')
  assertIncludes(kernel, "const cutoverRequested = requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel cutover modes')
  assertIncludes(kernel, 'const startupFallback = cutoverRequested ? undefined', 'cutover startup fail-closed path')
  assertIncludes(kernel, 'if (cutoverRequested) {\n      recordCutoverUnavailable(toCutoverFailureKind(kind), detail)\n      return\n    }', 'cutover runtime failures record unavailable')
  assertIncludes(kernel, 'if (cutoverRequested) return cutoverUnavailableSnapshot(capturedAt)', 'tmux cutover unavailable snapshot')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'compactReadModelFingerprint remains TS fallback')
  assertIncludes(kernel, "cutoverStatus: cutoverFailureKind ? 'unavailable' as const : 'active' as const", 'cutover metadata unavailable status')
  assertIncludes(kernel, "resultMarker: 'stale'", 'cutover unavailable stale marker')
  assert.equal(/default-disable|defaultDisable|hidden fallback rollback|fallback deletion approved|compactReadModelFingerprint cutover/i.test(kernel), false, 'kernel must not add default-disable/fallback deletion/cutover behavior')
}

function assertRuntimeNoReleaseBehavior(root) {
  const runtimeSources = [read(root, 'core/kernel.ts'), read(root, 'core/kernelPackagedResolver.ts')].join('\n')
  assert.equal(/package\.json|node_modules|import\.meta\.url|__dirname|process\.cwd\(\)/i.test(read(root, 'core/kernel.ts')), false, 'kernel must not discover installed package layout by default')
  assert.equal(/download-artifact|hosted-observation|workflow-run|github\.run_id|github\.run_attempt|github\.sha|workflow_dispatch|actions\/download-artifact|artifact URL|artifactUrl/i.test(runtimeSources), false, 'runtime/resolver must not consume hosted workflow/artifact metadata')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|actions\/upload-artifact|cosign|slsa|postinstall|preinstall|install-time build|curl\b|wget\b|node-gyp|prebuild/i.test(runtimeSources), false, 'runtime/resolver must not contain release/npm/download/install/signing behavior')
  assert.equal(/default Go is enabled|default resolver is enabled|normal-user native availability|package-manager native delivery|release asset is approved|fallback deletion is approved/i.test(runtimeSources), false, 'runtime/resolver must not claim package/default/release availability')
}

function assertPackageInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'], 'package remains TS/pi facade')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|hosted-observation|record|\.exe|\.dll|\.so|\.dylib|\.tgz|kernel\/go)/i.test(item)), false, 'package files must not include native/helper/generated artifacts')
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
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('tests/fixtures/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => !rel.startsWith('scripts/lib/go-helper-hosted-observation-record.cjs'))
    .filter(rel => !rel.startsWith('scripts/verify-go-helper-hosted-observation-record.cjs'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated/hosted/native artifacts or raw records')
}

function assertNoReadinessToolExpansion(root) {
  const readiness = read(root, 'commands/readiness.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'readiness text')
  assert.equal(/default-disable|fallback deletion|default Go|default resolver|rollback|release|signing|cosign|SLSA|normal-user native availability/i.test(readiness.replace('not normal-user native availability proof', '')), false, 'readiness must not expand into rollback/default/native availability UI')

  const toolSources = walkFiles(path.join(root, 'tools'))
    .filter(file => file.endsWith('.ts'))
    .map(file => read(root, toRel(root, file)))
    .join('\n')
  for (const name of EXPECTED_TOOLS) assertIncludes(toolSources, `name: '${name}'`, 'tool registrations')
  assert.equal(/default-disable|fallback deletion|default Go|default resolver|native rollback|release rollback|package rollback|release asset|npm publish|\bsigning\b|\bcosign\b|\bSLSA\b/i.test(toolSources), false, 'tools must not add rollback/default/release/signing control plane')
}

module.exports = {
  name: 'Go kernel v0.6.34 rollback/default-disable policy docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertKernelFailClosedInvariants(root)
    assertRuntimeNoReleaseBehavior(root)
    assertPackageInvariants(root)
    assertNoRepoArtifacts(root)
    assertNoReadinessToolExpansion(root)
  },
}
