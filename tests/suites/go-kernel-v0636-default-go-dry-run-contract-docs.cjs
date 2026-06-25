const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md'
const PACKAGE_VERSION = '0.6.8'
const EXPECTED_PEERS = {
  '@earendil-works/pi-ai': '*',
  '@earendil-works/pi-coding-agent': '*',
  '@earendil-works/pi-tui': '*',
  typebox: '*',
}
const REQUIRED_DOC = [
  '# v0.6.36 Default Go Dry-Run Readiness & Rollback/Disable Policy',
  'v0.6.36 Slice 1 umbrella scope/gate contract for default-Go dry-run readiness and rollback/default-disable policy.',
  'This is docs/tests-only governance work.',
  'It does not enable default Go, does not enable the default resolver, and does not change production source',
  '## Theme / Result Framing',
  'v0.6.36 is a Default Go Dry-Run Readiness & Rollback/Disable Policy Checkpoint.',
  'The result framing is future readiness governance, not availability.',
  'The checkpoint turns the future default-Go ambition for `tmuxSnapshotParse` into local, auditable, fail-closed dry-run readiness governance.',
  'The checkpoint does not approve or enable default Go.',
  'The checkpoint does not approve or enable the default resolver.',
  'The checkpoint does not approve TypeScript parser fallback deletion.',
  'The checkpoint does not change runtime, package, release, workflow, readiness, command, tool, native helper, hosted workflow, tag, or publishing behavior.',
  '## Why After v0.6.35',
  'v0.6.35 proved AgentTeam is shaped as a TypeScript/pi extension package, not a native binary distribution.',
  'TypeScript/pi facade contract for package name `pi-agentteam`, version `0.6.8`, type `module`, and `package.json#pi.extensions` exactly `["./index.ts"]`.',
  'Temp package install/load smoke for the TypeScript facade with stubbed pi API and no native helper delivery.',
  'Command/tool surface guard for `/team` plus `agentteam_create`, `agentteam_spawn`, `agentteam_send`, `agentteam_receive`, `agentteam_task`, and `agentteam_planrun`.',
  'Package surface minimization with explicit TypeScript/pi facade files and no native artifacts, native metadata, lockfiles, Go modules, release artifacts, or signing residue.',
  'Runtime mode boundaries: default/unset remains TypeScript/non-native, `go-packaged-preview` and `go-cutover` remain explicit only, `tmuxSnapshotParse` remains the sole cutover module, and `compactReadModelFingerprint` remains TypeScript fallback/non-cutover.',
  'Final v0.6.35 checkpoint language that records pi extension compliance progress without native/default/release availability claims.',
  'The next step is not to expand platform/native support.',
  'The user explicitly rejected returning to a second-platform matrix for this stage.',
  'The next step is to make the remaining default-Go gates explicit and to define a dry-run readiness path that can be reviewed locally before any future runtime/default/package/release decision.',
  '## Route Options',
  '| A — default-Go dry-run readiness + rollback/default-disable policy | Selected main route |',
  '| B — install/load regression/evidence registry consolidation | Support/input route |',
  '| C — release/tag debt governance | Support/deferred/local governance route |',
  'Explicitly not selected: second-platform matrix.',
  'Second-platform matrix work, second-platform support, platform expansion, and native distribution matrix claims are out of scope for v0.6.36 Slice 1.',
  '## Selected Route And Non-Goals',
  'Selected route: A — default-Go dry-run readiness + rollback/default-disable policy.',
  'Support routes: B and C may provide later-slice evidence, but they do not change the selected route.',
  'Slice 1 establishes the umbrella contract only.',
  'Slice 1 does not implement a readiness blocker ledger.',
  'Slice 1 does not implement a dry-run verifier.',
  'Slice 1 does not implement rollback/default-disable runtime behavior.',
  'Slice 1 does not implement install/load evidence registry consolidation.',
  'Slice 1 does not implement release/tag debt governance beyond planning language.',
  'No default Go implementation, approval, or enablement.',
  'No default resolver implementation, approval, or enablement.',
  'No rollback/default-disable runtime behavior.',
  'No TypeScript fallback deletion.',
  'No `compactReadModelFingerprint` cutover.',
  'No package/native delivery.',
  'No package release or install source approval.',
  'No signing, cosign, SLSA, security attestation, or security proof approval.',
  'No hosted workflow query, fetch, trigger, or proof.',
  'No commit, tag, push, npm version, or npm publish.',
  'No platform matrix, second-platform support, or platform expansion.',
  'No `/team readiness` expansion.',
  'No Go control-plane authority expansion.',
  '## Blocker Categories',
  'Default Go remains blocked by all of these categories:',
  'Package-manager native delivery.',
  'Install-source approval.',
  'Default resolver policy.',
  'Rollback/default-disable mechanism.',
  'Security/signing policy.',
  'Platform policy, with no second-platform work in this stage.',
  'Hosted/tag gates.',
  'Explicit leader/user approval.',
  'TypeScript fallback retention / deletion gate.',
  'Go authority boundaries.',
  'These blockers are governance gates, not approvals.',
  'A later dry-run readiness result may classify blockers, but no blocker category passing in v0.6.36 is allowed to imply default-Go availability, package availability, install-source approval, release approval, signing approval, fallback deletion approval, or platform expansion.',
  '## Planned v0.6.36 Slices',
  'Slice 1 — scope/gate contract.',
  'Slice 2 — readiness blocker ledger.',
  'Slice 3 — non-mutating dry-run verifier.',
  'Slice 4 — rollback/default-disable non-applied policy contract.',
  'Slice 5 — TS/pi authority boundary.',
  'Slice 6 — install/load evidence registry.',
  'Slice 7 — release/tag debt governance.',
  'Slice 8 — final checkpoint.',
  'Slice 2+ work remains blocked until the previous slice is reviewed and accepted by the leader.',
  'Slice 1 does not create Slice 2+ fixtures, verifier code, ledger files, registry files, release/tag artifacts, or final checkpoint files.',
  '## Distance Estimate',
  'If v0.6.36 is completed and accepted, pi extension fit is expected to be roughly 82–90%.',
  'If v0.6.36 is completed and accepted, default-Go decision governance is expected to be roughly 60–70%.',
  'If v0.6.36 is completed and accepted, native/default prerequisite evidence is expected to be roughly 62–68%.',
  'Normal-user native availability remains 0% and blocked.',
  'Default Go remains 0% approved and blocked.',
  'Default resolver remains 0% approved and blocked.',
  'TypeScript fallback deletion approval remains 0% and blocked.',
  'These estimates describe governance confidence only; they are not availability claims.',
  '## STOP / No-Claim Language',
  'No `package.json` version, metadata, files, dependencies, scripts, lifecycle hooks, optional dependencies, bundled dependencies, native metadata, or package surface change.',
  'No npm version or npm publish.',
  'No commit, tag, or push.',
  'No `gh`, token, network, hosted workflow query, hosted workflow fetch, or hosted workflow trigger.',
  'No release assets, native packages, signing material, cosign proof, SLSA proof, security attestation, raw records, generated manifests, checksums, release bundles, or tarballs.',
  'No default Go behavior change.',
  'No default resolver behavior change.',
  'No `go-cutover` behavior change.',
  'No `go-packaged-preview` behavior change.',
  'No fallback deletion.',
  'No `compactReadModelFingerprint` cutover.',
  'No `/team readiness` expansion.',
  'No Go control-plane authority expansion.',
  'No second-platform matrix.',
  'No second-platform support claim.',
  'No normal-user native helper availability claim.',
  'No package-manager native delivery claim.',
  'No package release approval claim.',
  'No install source approval claim.',
  'No release asset approval claim.',
  'No signing, cosign, SLSA, or security attestation approval claim.',
  '## Slice 1 Guard Expectations',
  '`tests/suites/go-kernel-v0636-default-go-dry-run-contract-docs.cjs` guards this contract.',
  '`.gitignore` allowlists `docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md`.',
  '`package.json` remains `pi-agentteam` version `0.6.8`, type `module`, and `package.json#pi.extensions` exactly `["./index.ts"]`.',
  '`.github/workflows` still contains only `go-helper-review-artifact.yml` and the review-artifact workflow remains a single `linux-x64-glibc` review target, not a second-platform matrix.',
  'The docs do not claim default Go enabled, default resolver enabled, fallback deletion, normal-user native availability, package release approval, install source approval, release asset approval, signing approval, or second-platform support.',
  '## Validation Plan',
  '`node --check tests/suites/go-kernel-v0636-default-go-dry-run-contract-docs.cjs`.',
  'Direct focused guard suite invocation.',
  '`git diff --check`.',
  'Repo scan for temp tarballs, lockfiles, Go modules, native archives, signing material, raw records, generated manifests, checksums, release bundles, and release assets.',
  'Do not use `tests/run.cjs <suite>` as the focused proof because the runner can ignore the suite-name argument and run unrelated suites.',
  'Do not run npm pack, npm install, go build, native artifact generation, hosted workflow commands, `gh`, network commands, npm version, npm publish, commit, tag, or push for Slice 1.',
]
const FORBIDDEN_DOC_CLAIMS = [
  'default Go is enabled',
  'default resolver is enabled',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'fallback deletion approved',
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'native helper availability is proven',
  'package release is approved',
  'install source is approved',
  'release asset is approved',
  'signing is approved',
  'cosign is approved',
  'SLSA is approved',
  'security attestation is approved',
  'second-platform support is approved',
  'second platform support is approved',
  'second-platform support claim approved',
  'platform matrix is approved',
  'npm publish completed',
  'npm version completed',
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
  'scripts/verify-go-helper-artifact.cjs',
  'scripts/verify-go-helper-clean-install-proof.cjs',
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

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_CLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not embed raw hosted/artifact/verifier JSON bodies`)
}

function assertGitignore(root) {
  const gitignore = read(root, '.gitignore')
  assertIncludes(gitignore, `!${DOC}`, '.gitignore')
}

function assertPackageInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.type, 'module')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
  for (const field of ['main', 'exports', 'types']) assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  assert.deepEqual(Object.keys(packageJson.dependencies || {}).sort(), [], 'dependencies must remain empty or absent')
  for (const [name, range] of Object.entries(EXPECTED_PEERS)) assert.equal(packageJson.peerDependencies?.[name], range, `${name} must remain peer dependency ${range}`)
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
}

function assertRuntimeAuthorityInvariants(root) {
  const kernel = read(root, 'core/kernel.ts')
  assertIncludes(kernel, "const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)", 'core/kernel.ts')
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'core/kernel.ts')
  assertIncludes(kernel, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'core/kernel.ts')
  assertIncludes(kernel, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const", 'core/kernel.ts')
  assertIncludes(kernel, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'core/kernel.ts')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'core/kernel.ts')
  assert.equal(/default Go is enabled|default resolver is enabled|fallback deletion is approved|package release is approved|install source is approved|release asset is approved|signing is approved|cosign is approved|SLSA is approved|second[- ]platform support is approved/i.test(kernel), false, 'runtime must not overclaim default/release/signing/platform status')

  const teamCommand = read(root, 'commands/team.ts')
  assertIncludes(teamCommand, "pi.registerCommand('team'", 'commands/team.ts')
  assert.equal(/default go|default resolver|release asset|install source|second[- ]platform|cosign|slsa/i.test(teamCommand), false, 'team command must not expose default/release/platform controls')

  const readiness = read(root, 'commands/readiness.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'commands/readiness.ts')
  assert.equal(/normal-user native helper availability is proven|default Go is enabled|default resolver is enabled/i.test(readiness), false, 'readiness must not expand to availability/default approval')
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
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && !rel.startsWith('docs/') && !rel.startsWith('tests/') && !ALLOWED_REVIEW_RECORDS.has(rel) && FORBIDDEN_GENERATED_RECORD.test(rel)) forbiddenRecords.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved checked-in native/archive/signing artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain unapproved generated manifests/checksums/provenance/attestation/raw release records outside docs/tests/review helper areas')
}

module.exports = {
  name: 'Go kernel v0.6.36 default-Go dry-run readiness contract docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertGitignore(root)
    assertPackageInvariants(root)
    assertRuntimeAuthorityInvariants(root)
    assertWorkflowInvariants(root)
    assertArtifactInvariants(root)
  },
}
