const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md'
const CHECKPOINT = 'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy-checkpoint.md'
const SUITE = 'tests/suites/go-kernel-v0636-final-readiness-checkpoint-docs.cjs'
const PACKAGE_VERSION = '0.6.8'
const EXPECTED_TOOLS = [
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
]
const REQUIRED_SLICE_FILES = [
  'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md',
  'tests/suites/go-kernel-v0636-default-go-dry-run-contract-docs.cjs',
  'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs',
  'tests/suites/go-kernel-v0636-default-go-readiness-ledger.cjs',
  'scripts/lib/go-default-readiness-dry-run.cjs',
  'scripts/verify-go-default-readiness-dry-run.cjs',
  'tests/suites/go-kernel-v0636-default-go-readiness-dry-run.cjs',
  'tests/fixtures/kernel/v0636/rollbackDisablePolicyCases.cjs',
  'tests/suites/go-kernel-v0636-rollback-disable-policy.cjs',
  'tests/suites/go-kernel-v0636-ts-pi-default-go-authority-boundary.cjs',
  'tests/fixtures/kernel/v0636/readinessEvidenceRegistry.cjs',
  'tests/suites/go-kernel-v0636-install-load-evidence-registry.cjs',
  'tests/fixtures/kernel/v0636/tagGateLedger.cjs',
  'tests/suites/go-kernel-v0636-release-tag-debt-governance.cjs',
  CHECKPOINT,
  SUITE,
]
const REQUIRED_DOC = [
  '# v0.6.36 Default Go Dry-Run Readiness & Rollback/Disable Policy Checkpoint',
  'final v0.6.36 docs/tests-only checkpoint for default-Go dry-run readiness governance and rollback/default-disable policy.',
  '## Result',
  'Result: v0.6.36 is a docs/tests governance checkpoint ready for leader review.',
  'The final default-Go dry-run readiness result remains `ready:false`.',
  'This checkpoint is GO only for reviewing the local docs/tests governance evidence.',
  'This checkpoint is STOP for default Go, default resolver, native availability, fallback deletion, package release, install source approval, release asset approval, signing approval, second-platform support, and tag release.',
  'v0.6.36 does not approve or enable default Go.',
  'v0.6.36 does not approve or enable the default resolver.',
  'v0.6.36 does not prove normal-user native helper availability.',
  'v0.6.36 does not approve TypeScript fallback deletion or `compactReadModelFingerprint` cutover.',
  'v0.6.36 does not approve package release, install source, release assets, signing, cosign, SLSA, security attestation, hosted workflow evidence, or tag release.',
  '`package.json` remains version `0.6.8`.',
  '## Slice Evidence Summary',
  'Slice 1 — scope/gate contract:',
  'Slice 2 — readiness blocker ledger:',
  'Slice 3 — non-mutating dry-run verifier:',
  'Slice 4 — rollback/default-disable non-applied policy:',
  'Slice 5 — TS/pi authority boundary:',
  'Slice 6 — install/load evidence registry:',
  'Slice 7 — release/tag debt governance:',
  'Slice 8 — final checkpoint:',
  '## GO / STOP Matrix',
  'GO for:',
  'Local leader review of v0.6.36 docs/tests governance evidence.',
  'Running the optional local non-mutating dry-run verifier for reviewer diagnostics.',
  'STOP for:',
  'Default Go approval or enablement.',
  'Default resolver approval or enablement.',
  'Normal-user native helper availability.',
  'Package-manager native delivery.',
  'Package release, install source approval, release assets, npm version, or npm publish.',
  'TypeScript fallback deletion or `compactReadModelFingerprint` cutover.',
  'Runtime rollback/default-disable behavior implementation.',
  '`go-cutover` or `go-packaged-preview` behavior changes.',
  '`/team readiness`, command, tool, model-callable, UI, or runtime diagnostic expansion.',
  'Go control-plane authority expansion beyond the bounded helper/kernel seam.',
  'Signing, cosign, SLSA, security attestation, signed availability, or signing material.',
  'Second-platform support, platform matrix expansion, macOS, Windows, arm64, or musl availability claims.',
  'Hosted workflow query/fetch/trigger, `gh`, token, network, raw hosted records, hosted evidence, or downloaded artifacts.',
  'Tag creation, tag push, git push, release creation, invented waiver, or tag gate removal.',
  '## Distance / Result Framing',
  'If accepted, pi extension fit is expected to be roughly 82–90%.',
  'If accepted, default-Go decision governance is expected to be roughly 60–70%.',
  'If accepted, native/default prerequisite evidence is expected to be roughly 62–68%.',
  'Normal-user native availability remains 0%.',
  'Default Go approval remains 0%.',
  'Default resolver approval remains 0%.',
  'TypeScript fallback deletion approval remains 0%.',
  'These estimates describe governance confidence only; they are not availability claims.',
  '## Remaining Blockers',
  'v0.6.31 hosted observation/tag gate.',
  'v0.6.32 and later tag debt.',
  'Package-manager native delivery.',
  'Package/release ownership.',
  'Install source ownership.',
  'Rollback/default-disable runtime implementation and tests.',
  'Default resolver policy, implementation, and approval.',
  'Default Go approval after all evidence gates.',
  'TypeScript fallback retention/deletion checkpoint and approval.',
  'Signing/security ownership, key/credential ownership, cosign/SLSA/security attestation decisions, and incident response policy.',
  'Platform policy; second-platform work remains deferred and no second-platform support is claimed.',
  'Explicit leader/user approval after all required package, install, default, rollback, signing, platform, hosted/tag, fallback, and authority gates are complete.',
  '## Package / Runtime / Workflow / Readiness Boundaries',
  '`package.json` name remains `pi-agentteam`.',
  '`package.json` version remains `0.6.8`.',
  '`package.json#pi.extensions` remains exactly `["./index.ts"]`.',
  'Default/unset remains TypeScript/non-native.',
  '`go-cutover` remains explicit.',
  '`go-packaged-preview` remains explicit-only.',
  '`tmuxSnapshotParse` remains the sole cutover module.',
  '`compactReadModelFingerprint` remains TypeScript fallback/non-cutover.',
  'No default package/native resolver discovery is added.',
  'The only workflow remains the review-only Go Helper Review Artifact workflow.',
  'Workflow permissions remain read-only for contents.',
  'The review target remains `linux-x64-glibc` only.',
  '`/team readiness` remains explicit compact reviewer diagnostics and not normal-user native availability proof.',
  'The stable command surface remains `/team`.',
  'The stable tool surface remains `agentteam_create`, `agentteam_spawn`, `agentteam_send`, `agentteam_receive`, `agentteam_task`, and `agentteam_planrun`.',
  '## Tag Policy',
  'This is a GitHub-only/local docs/tests checkpoint for leader review.',
  'No worker should create, push, move, or imply a tag for v0.6.36.',
  'v0.6.31 remains gated by hosted workflow observation or explicit leader/user waiver.',
  'v0.6.36 is gated by prior unresolved tag gates plus final leader review.',
  'A future v0.6.36 tag, if explicitly authorized later, would identify docs/tests dry-run readiness governance only.',
  'A future v0.6.36 tag would not mean default Go, default resolver, native availability, package release, install source, release asset, signing, second-platform support, fallback deletion, or production runtime cutover.',
  '## Validation Summary',
  '`node --check tests/suites/go-kernel-v0636-final-readiness-checkpoint-docs.cjs`.',
  'Direct focused checkpoint guard suite invocation.',
  '`git diff --check`.',
  'Repo scan for temp tarballs, lockfiles, Go modules, native archives/binaries, signing material, attestations, raw hosted records, generated manifests, checksums, release bundles, and release assets.',
  'OS temp scan for v0.6.36 checkpoint/temp artifact residue.',
  'Do not use `tests/run.cjs <suite>` as the focused proof because the runner can ignore the suite-name argument and run unrelated suites.',
  'No npm pack/install, Go build, native artifact build, hosted workflow command, `gh`, network command, npm version, npm publish, git tag, git push, release command, or production runtime command is part of Slice 8 validation.',
  '## Final Recommendation',
  'Proceed with leader review of v0.6.36 as a docs/tests-only Default Go Dry-Run Readiness & Rollback/Disable Policy checkpoint.',
]
const REQUIRED_MAIN_DOC = [
  '## Slice 7 — Release/Tag Debt Governance Guard',
  '## Distance Estimate',
  'If v0.6.36 is completed and accepted, pi extension fit is expected to be roughly 82–90%.',
  'If v0.6.36 is completed and accepted, default-Go decision governance is expected to be roughly 60–70%.',
  'If v0.6.36 is completed and accepted, native/default prerequisite evidence is expected to be roughly 62–68%.',
  'Normal-user native availability remains 0% and blocked.',
  'Default Go remains 0% approved and blocked.',
  'Default resolver remains 0% approved and blocked.',
  'TypeScript fallback deletion approval remains 0% and blocked.',
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'native helper delivery is complete',
  'native package delivery is complete',
  'package-manager native delivery is complete',
  'package release is approved',
  'install source is approved',
  'release asset is approved',
  'signing is approved',
  'cosign is approved',
  'SLSA is approved',
  'security attestation is approved',
  'second-platform support is approved',
  'second platform support is approved',
  'tag was created',
  'tag was pushed',
  'waiver was invented',
  'npm version completed',
  'npm publish completed',
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

function assertNoOverclaims(source, label) {
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(source.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(source), false, `${label} must not embed raw hosted/artifact/verifier JSON bodies`)
}

function assertCheckpointDoc(root) {
  assert.equal(exists(root, CHECKPOINT), true, `${CHECKPOINT} should exist`)
  const checkpoint = read(root, CHECKPOINT)
  for (const expected of REQUIRED_DOC) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const rel of REQUIRED_SLICE_FILES) assertIncludes(checkpoint, `\`${rel}\``, CHECKPOINT)
  assertNoOverclaims(checkpoint, CHECKPOINT)
}

function assertMainDocAndGitignore(root) {
  const mainDoc = read(root, DOC)
  for (const expected of REQUIRED_MAIN_DOC) assertIncludes(mainDoc, expected, DOC)
  assertNoOverclaims(mainDoc, DOC)

  const gitignore = read(root, '.gitignore')
  assertIncludes(gitignore, `!${DOC}`, '.gitignore')
  assertIncludes(gitignore, `!${CHECKPOINT}`, '.gitignore')
}

function assertSliceFilesExist(root) {
  for (const rel of REQUIRED_SLICE_FILES) assert.equal(exists(root, rel), true, `${rel} should exist`)
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
  assertIncludes(kernel, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'core/kernel.ts')
  assertIncludes(kernel, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const", 'core/kernel.ts')
  assertIncludes(kernel, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'core/kernel.ts')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'core/kernel.ts')
  assert.equal(/AGENTTEAM_KERNEL_CUTOVER_MODULE\s*=\s*'compactReadModelFingerprint'/.test(kernel), false, 'compactReadModelFingerprint must not become cutover module')

  const readiness = read(root, 'commands/readiness.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'commands/readiness.ts')

  const teamCommand = read(root, 'commands/team.ts')
  assertIncludes(teamCommand, "pi.registerCommand('team'", 'commands/team.ts')
  assertIncludes(teamCommand, "const options = ['config init', 'config show', 'config validate', 'config migrate --dry-run', 'readiness']", 'commands/team.ts')

  const toolSources = walkFiles(path.join(root, 'tools')).filter(file => file.endsWith('.ts')).map(file => fs.readFileSync(file, 'utf8')).join('\n')
  for (const name of EXPECTED_TOOLS) assertIncludes(toolSources, `name: '${name}'`, 'tools')
}

function assertWorkflowInvariants(root) {
  const workflowsRoot = path.join(root, '.github', 'workflows')
  const workflows = fs.readdirSync(workflowsRoot).filter(name => name.endsWith('.yml') || name.endsWith('.yaml')).sort()
  assert.deepEqual(workflows, ['go-helper-review-artifact.yml'], 'only review-artifact workflow should exist')
  const workflow = read(root, '.github/workflows/go-helper-review-artifact.yml')
  assert.equal((workflow.match(/target:\s+linux-x64-glibc/g) || []).length, 2, 'review workflow should keep one linux-x64-glibc target in each build/verify matrix')
  assert.equal(/target:\s+(?!linux-x64-glibc\b)[a-z0-9-]+/i.test(workflow), false, 'review workflow must not add second-platform target rows')
  assert.equal(/macos-|windows-|arm64|musl|darwin|win32/i.test(workflow), false, 'review workflow must not add second-platform runner/platform terms')
  assert.equal(/gh\s+(?:attestation|release)|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|curl\b|wget\b|postinstall|preinstall|node-gyp|prebuild/i.test(workflow), false, 'workflow must not add release/signing/npm/install behavior')
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
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved checked-in native/archive/signing/release artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain unapproved generated manifests/checksums/provenance/attestation/raw hosted/release records outside docs/tests/review helper areas')
}

module.exports = {
  name: 'Go kernel v0.6.36 final readiness checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertCheckpointDoc(root)
    assertMainDocAndGitignore(root)
    assertSliceFilesExist(root)
    assertPackageRuntimeInvariants(root)
    assertWorkflowInvariants(root)
    assertArtifactInvariants(root)
    assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  },
}
