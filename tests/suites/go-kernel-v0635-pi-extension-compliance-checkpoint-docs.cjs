const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.6.35-pi-extension-compliance-package-surface-checkpoint.md'
const MAIN_DOC = 'docs/perf/v0.6.35-pi-extension-compliance-package-surface.md'
const PACKAGE_VERSION = '0.6.8'
const EXPECTED_PEERS = {
  '@earendil-works/pi-ai': '*',
  '@earendil-works/pi-coding-agent': '*',
  '@earendil-works/pi-tui': '*',
  typebox: '*',
}
const REQUIRED_FILES = [
  MAIN_DOC,
  'tests/suites/go-kernel-v0635-pi-extension-compliance-contract-docs.cjs',
  'scripts/lib/pi-extension-install-load-proof.cjs',
  'scripts/verify-pi-extension-install-load.cjs',
  'tests/suites/go-kernel-v0635-pi-extension-install-load-smoke.cjs',
  'tests/suites/go-kernel-v0635-command-tool-surface-contract.cjs',
  'tests/suites/go-kernel-v0635-package-surface-minimization.cjs',
  'tests/suites/go-kernel-v0635-runtime-mode-boundaries.cjs',
  DOC,
]
const REQUIRED_DOC = [
  '# v0.6.35 Pi Extension Compliance & Package Surface Checkpoint',
  'final v0.6.35 docs/tests-only checkpoint for pi extension compliance and package surface shaping.',
  'This is not a native/default/release checkpoint',
  '## Result',
  'Result: docs/tests-only checkpoint completed locally; not committed/tagged/pushed unless leader later decides.',
  'v0.6.35 remains a pi TypeScript extension compliance and package surface checkpoint.',
  'v0.6.35 explicitly pivots away from a second-platform native matrix for this stage per user feedback because AgentTeam is first a pi TypeScript extension package, not a native binary distribution.',
  'This checkpoint is GO for local review of the v0.6.35 docs/tests evidence only.',
  'This checkpoint is STOP for native/default/release/package availability claims.',
  '## Slice Evidence Summary',
  'Slice 1 contract: `docs/perf/v0.6.35-pi-extension-compliance-package-surface.md` plus `tests/suites/go-kernel-v0635-pi-extension-compliance-contract-docs.cjs` establish pi extension compliance/package surface framing',
  'Slice 2 temp install/load: `scripts/verify-pi-extension-install-load.cjs`, `scripts/lib/pi-extension-install-load-proof.cjs`, and `tests/suites/go-kernel-v0635-pi-extension-install-load-smoke.cjs` prove a temp package root can load the TypeScript/pi facade with stubbed pi API and no native helper delivery',
  'Slice 3 command/tool surface: `tests/suites/go-kernel-v0635-command-tool-surface-contract.cjs` guards `/team` plus `agentteam_create`, `agentteam_spawn`, `agentteam_send`, `agentteam_receive`, `agentteam_task`, and `agentteam_planrun`',
  'Slice 4 package surface: `tests/suites/go-kernel-v0635-package-surface-minimization.cjs` guards explicit TypeScript/pi facade `package.json#files`, unchanged manifest/dependency/script/hooks posture, no native artifacts, no native metadata, no package locks, no Go modules, and no release/signing/archive residue.',
  'Slice 5 runtime modes: `tests/suites/go-kernel-v0635-runtime-mode-boundaries.cjs` guards default TypeScript/non-native mode, explicit preview/cutover only, `tmuxSnapshotParse` as the sole cutover module, `compactReadModelFingerprint` as TypeScript fallback/non-cutover',
  '## Distance / Result Framing',
  'If accepted, v0.6.35 moves pi extension compliance and product fit toward approximately 80–88%.',
  'Native/default prerequisite evidence remains approximately 55–60%.',
  'Normal-user native helper availability remains 0%.',
  'Default Go remains blocked.',
  'Default resolver remains blocked.',
  'TypeScript fallback deletion remains blocked.',
  'v0.6.35 advances pi extension/package-surface confidence, not native helper delivery, package release, install source approval, default resolver approval, default Go approval, fallback deletion approval, signing approval, or second-platform support.',
  '## GO Criteria Met',
  'Pi extension manifest/entry/facade surface is clear: package name `pi-agentteam`, version `0.6.8`, type `module`, `package.json#pi.extensions` exactly `["./index.ts"]`, no `main`, no `exports`, and no `types` field.',
  'TypeScript/pi facade entry is clear: `index.ts` exports the default pi extension factory and registers commands, tools, renderers, and hooks through TypeScript imports.',
  'Install/load proof for the TypeScript facade exists: Slice 2 temp package proof loads installed `index.ts` with stubbed pi API and cleaned temp roots by default.',
  'Command/tool surface is bounded: `/team` remains the only command and the expected six tools remain team coordination/workflow tools, not native/default/release/package controls.',
  'Package files/artifacts are bounded: `package.json#files` remains explicit for the TypeScript/pi facade surface and excludes native/helper/generated/release/signing/platform artifacts.',
  'Runtime modes are bounded from the pi extension perspective: default/unset remains TypeScript/non-native; `go-packaged-preview` and `go-cutover` remain explicit; `tmuxSnapshotParse` remains the only cutover module; `compactReadModelFingerprint` remains fallback/non-cutover.',
  'Repo artifact surface is bounded: no repo root temp tarballs, lockfiles, Go modules, checked-in native binaries, checked-in archives, generated signing material, raw hosted records, generated manifests, checksums, or release bundles are expected.',
  '## STOP / Not Proven',
  'No normal-user native helper availability.',
  'No package-manager native delivery.',
  'No package release approval.',
  'No install source approval.',
  'No release asset approval.',
  'No default Go approval or enablement.',
  'No default resolver approval or enablement.',
  'No TypeScript fallback deletion.',
  'No `compactReadModelFingerprint` cutover.',
  'No second-platform support or platform matrix.',
  'No signing, cosign, SLSA, or security attestation approval.',
  'No npm publish, npm version, tag, push, commit, `gh`, hosted workflow query/fetch/trigger, token, or network action.',
  'No `package.json` version, metadata, files, dependencies, scripts, lifecycle hooks, optional dependencies, bundled dependencies, native metadata, or package surface change.',
  'No production source, runtime, workflow, readiness, command, tool, default resolver, `go-cutover`, or `go-packaged-preview` behavior change.',
  'No generated artifacts, native artifacts, signing material, release assets, tarballs, lockfiles, or Go module files.',
  '## Validation Summary',
  'Slice 1: `tests/suites/go-kernel-v0635-pi-extension-compliance-contract-docs.cjs`.',
  'Slice 2: `tests/suites/go-kernel-v0635-pi-extension-install-load-smoke.cjs`.',
  'Slice 3: `tests/suites/go-kernel-v0635-command-tool-surface-contract.cjs`.',
  'Slice 4: `tests/suites/go-kernel-v0635-package-surface-minimization.cjs`.',
  'Slice 5: `tests/suites/go-kernel-v0635-runtime-mode-boundaries.cjs`.',
  'Slice 6: `tests/suites/go-kernel-v0635-pi-extension-compliance-checkpoint-docs.cjs`.',
  'Slice 2 temp install/load proof command from accepted evidence: `node scripts/verify-pi-extension-install-load.cjs --json`.',
  'For this final checkpoint, rerun Slice 2 only when the reviewer wants fresh temp pack/install evidence; the Slice 6 checkpoint guard can cite prior accepted Slice 2 evidence without creating temp install roots.',
  'The `tests/run.cjs <suite>` suite-filter caveat remains: focused validation should use direct suite invocation because the runner can ignore the suite-name argument and run the full suite set.',
  '`node --check tests/suites/go-kernel-v0635-pi-extension-compliance-checkpoint-docs.cjs`.',
  'direct checkpoint guard suite.',
  'direct v0.6.35 guard batch, with Slice 2 temp install/load optional and explicitly reported if skipped.',
  '`npm run typecheck`.',
  '`npm run -s check:boundaries`.',
  '`git diff --check`.',
  'repo scan for `pi-agentteam-*.tgz`, `package-lock.json`, `npm-shrinkwrap.json`, `go.mod`, and `go.sum`.',
  'OS temp scan for `agentteam-v0635-*` and `debug-v0635-*` roots.',
  '## Tag Policy',
  'Do not tag v0.6.35 until the leader explicitly chooses.',
  'Previous v0.6.31/v0.6.32 gates remain unresolved unless the leader explicitly waives them.',
  'A future v0.6.35 tag would identify a docs/tests pi extension compliance and package surface checkpoint only.',
  'A future v0.6.35 tag would not mean package/native availability, normal-user native helper availability, default Go, default resolver, fallback deletion, package release, install source, release asset, signing, cosign, SLSA, security attestation, second-platform support, npm publish, or production runtime cutover.',
  'Workers must not run `npm version`, `npm publish`, `git tag`, `git push`, hosted workflow query/fetch/trigger, `gh`, token, network, commit, or push for this checkpoint.',
  '## Remaining Blockers',
  'Normal-user native helper availability remains 0%.',
  'Native/default prerequisite evidence remains approximately 55–60%.',
  'Package/release/install-source ownership and security/signing decisions remain future-gated.',
  'Default Go and default resolver remain blocked pending package-manager native delivery, default resolver policy, rollback/default-disable implementation, security/signing decisions, platform policy, and explicit leader/user approval.',
  'TypeScript fallback deletion remains blocked until after native/default/package/release/security/rollback/platform gates and a later explicit approval checkpoint.',
]
const FORBIDDEN_DOC_CLAIMS = [
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'native helper delivery is complete',
  'package-manager native delivery is complete',
  'package release is approved',
  'install source is approved',
  'release asset is approved',
  'default Go is enabled',
  'default resolver is enabled',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'signing is approved',
  'cosign is approved',
  'SLSA is approved',
  'security attestation is approved',
  'second platform support is approved',
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
const FORBIDDEN_GENERATED_RECORD = /(?:^|\/)(?:artifact-index|generated-manifest|checksum|provenance|attestation|hosted-observation|raw-record|release-bundle|release-asset|signature-material)(?:[-_.\/]|$)/i

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
  assertIncludes(gitignore, `!${MAIN_DOC}`, '.gitignore')
  assertIncludes(gitignore, `!${DOC}`, '.gitignore')
}

function assertSliceEvidenceFiles(root) {
  for (const rel of REQUIRED_FILES) assert.equal(exists(root, rel), true, `${rel} should exist`)
  const main = read(root, MAIN_DOC)
  assertIncludes(main, '## Slice 6 Final Status', MAIN_DOC)
  assertIncludes(main, '`docs/perf/v0.6.35-pi-extension-compliance-package-surface-checkpoint.md` records the final Slice 6 checkpoint.', MAIN_DOC)
  assertIncludes(main, 'v0.6.35 remains a docs/tests pi extension compliance checkpoint, not native/default/release availability.', MAIN_DOC)
}

function assertPackageRuntimeInvariants(root) {
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

  const kernel = read(root, 'core/kernel.ts')
  assertIncludes(kernel, "const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)", 'core/kernel.ts')
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'core/kernel.ts')
  assertIncludes(kernel, "const cutoverRequested = requestedMode === 'go-cutover' || packagedPreviewRequested", 'core/kernel.ts')
  assertIncludes(kernel, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const", 'core/kernel.ts')
  assertIncludes(kernel, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'core/kernel.ts')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'core/kernel.ts')
  assert.equal(/default Go is enabled|default resolver is enabled|fallback deletion is approved|package release is approved|install source is approved|release asset is approved|signing is approved|cosign is approved|SLSA is approved|second platform support is approved/i.test(kernel), false, 'runtime must not overclaim default/release/signing/platform status')
}

function assertArtifactInvariants(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain pi-agentteam temp tarballs')
  const forbiddenArtifacts = []
  const forbiddenRecords = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    const reviewHelper = rel.startsWith('docs/') || rel.startsWith('tests/') || rel.startsWith('scripts/') || rel.startsWith('.github/workflows/')
    if (!reviewHelper && FORBIDDEN_GENERATED_RECORD.test(rel)) forbiddenRecords.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain checked-in native/archive/signing artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain generated manifests/checksums/provenance/attestation/raw release records outside review helper areas')
}

module.exports = {
  name: 'Go kernel v0.6.35 pi extension compliance checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertGitignore(root)
    assertSliceEvidenceFiles(root)
    assertPackageRuntimeInvariants(root)
    assertArtifactInvariants(root)
  },
}
