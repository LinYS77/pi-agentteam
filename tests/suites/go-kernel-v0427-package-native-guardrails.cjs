const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md'
const PLAN = 'docs/agentteam方案书.md'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const REQUIRED_DOC_ITEMS = [
  'Slice 7 — Package Native Guardrails and Readiness Containment',
  'Slice 7 is docs/tests-only package/native/readiness/runtime guardrail consolidation',
  'Focused suite: `tests/suites/go-kernel-v0427-package-native-guardrails.cjs`',
  'Package and npm guardrails',
  'Module and lockfile guardrails',
  'Repository artifact guardrails',
  'Build, CI, and release guardrails',
  'Runtime and mode guardrails',
  'UI, tool, and readiness guardrails',
  'Go authority guardrails',
  'Slice 7 Validation Plan',
  'Slice 8 — Final Checkpoint',
  'Final checkpoint doc: `docs/perf/v0.4.27-generated-artifact-clean-install-consumption-checkpoint.md`',
  'Focused suite: `tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs`',
  'Proceed only with v0.4.27 Slice 7 docs/tests-only package/native/readiness/runtime guardrail consolidation review after leader/user approval',
]
const PACKAGE_GUARDRAILS = [
  '`package.json` version remains `0.6.8`',
  'no `npm version`',
  'no `npm publish`',
  'no npm pack publish output or package metadata approval',
  'no `optionalDependencies`',
  'no native package metadata such as `agentteamGoHelper`',
  'no package `files` inclusion for helper/native/generated artifacts',
  'no package scripts for helper build/install/download/package/version/publish behavior',
  'no lifecycle hooks',
  'no postinstall/download/install-time build',
  'no package version change',
  'no package/native approval',
]
const MODULE_LOCKFILE_GUARDRAILS = [
  'no lockfiles: `package-lock.json` or `npm-shrinkwrap.json`',
  'no `go.mod`',
  'no `go.sum`',
  'no Go module files under `kernel/go/agentteam-kernel/`',
]
const REPO_ARTIFACT_GUARDRAILS = [
  'no checked-in native binaries',
  'no checked-in tarballs',
  'no checked-in generated artifacts',
  'no checked-in generated manifests',
  'no checked-in checksum artifacts',
  'no checked-in provenance artifacts',
  'no checked-in attestation artifacts',
  'no checked-in generated package artifacts',
  '`.agentteam-artifacts/` and similar local prototype output, if mentioned, must remain ignored/excluded and must not be committed',
  'tests may use OS temp fixtures only',
]
const BUILD_RELEASE_GUARDRAILS = [
  'no helper build commands',
  'no running `go build`',
  'no CI workflow implementation',
  'no GitHub Actions artifact upload',
  'no GitHub release assets',
  'no active artifact storage',
  'no npm companion package',
  'no main package native inclusion',
]
const RUNTIME_GUARDRAILS = [
  'default/unset remains safe disabled/TypeScript',
  'no default Go',
  'no production resolver implementation',
  'no production default discovery',
  'no runtime discovery activation',
  'no packaged discovery activation',
  'no `go-cutover` semantic changes',
  'no `go-packaged-preview` semantic changes',
  '`go-packaged-preview` remains explicit-only and non-default',
  'TypeScript fallback is not deleted',
  '`compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
  '`tmuxSnapshotParse` remains the only cutover-owned candidate under discussion',
  'production `core/kernel.ts` behavior remains unchanged',
]
const READINESS_GUARDRAILS = [
  '`/team readiness` remains transitional reviewer tooling only',
  'no new `/team readiness` options or subcommands',
  'no new `/team` native/package/resolver diagnostics command',
  'no model-callable native/readiness tools',
  'no ambient `/team` panel diagnostics',
  'no normal-user UI expansion',
  'no runtime control plane expansion',
  'readiness output remains non-proof and not normal-user native availability evidence',
]
const GO_AUTHORITY_GUARDRAILS = [
  'Go helper remains parser-only `tmuxSnapshotParse` candidate',
  'Go remains behind TS adapter/ports via subprocess/RPC/stdin-stdout',
  'Go does not own tmux execution/capture',
  'Go does not own state writes',
  'Go does not own worker lifecycle',
  'Go does not own task/report governance',
  'Go does not own PlanRun',
  'Go does not own full-text boundaries',
  'Go does not own package/release authority',
  'Go does not own UI rendering',
  'Go does not own command control plane',
  'no native Go pi extension/provider ABI assumption',
]
const STOP_ITEMS = [
  'STOP for final checkpoint doc',
  'STOP for final checkpoint guard',
  'STOP for v0.4.27 final GO/STOP summary',
  'STOP for Slice 8 work without separate approval',
  'STOP for production code changes',
  'STOP for package metadata changes',
  'STOP for package files changes',
  'STOP for package version change',
  'STOP for `optionalDependencies`',
  'STOP for package scripts',
  'STOP for lifecycle hooks',
  'STOP for postinstall/download/install-time build',
  'STOP for npm version',
  'STOP for npm publish',
  'STOP for npm pack package output/approval',
  'STOP for helper build commands',
  'STOP for running `go build`',
  'STOP for CI workflow',
  'STOP for GitHub Actions artifact upload',
  'STOP for GitHub release assets',
  'STOP for native binaries',
  'STOP for tarballs',
  'STOP for generated artifacts/manifests/checksum/provenance/attestation/package artifacts',
  'STOP for lockfiles',
  'STOP for go.mod/go.sum',
  'STOP for default Go',
  'STOP for production resolver/default discovery',
  'STOP for `go-cutover` or `go-packaged-preview` semantic changes',
  'STOP for TypeScript fallback deletion',
  'STOP for `/team readiness` expansion',
  'STOP for model-callable native/readiness tools',
  'STOP for ambient `/team` diagnostics',
  'STOP for normal-user UI expansion',
  'STOP for runtime control plane expansion',
  'STOP for broadening Go authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
  'STOP for commit/tag/push',
]
const FORBIDDEN_DOC = [
  'v0.4.28 implementation is added',
  'package metadata is approved',
  'native package metadata is approved',
  'native/default cutover is approved',
  'fallback deletion is approved',
  'Go is default',
  'production resolver behavior is changed',
  'production default discovery is implemented',
  'go-cutover semantics changed',
  'go-packaged-preview semantics changed',
  'TypeScript fallback is deleted',
  '/team readiness is expanded',
  'model-callable tool is added',
  'ambient /team diagnostics are added',
  'normal-user UI is added',
  'broader Go authority is approved',
]
const CHECKPOINT_LINKS = [
  'docs/perf/v0.4.27-generated-artifact-clean-install-consumption-checkpoint.md',
  'tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function assertPackageJsonGuardrails(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package files must not include native/helper/generated outputs')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not run npm pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b/.test(command), false, `${name} must not build/install/module-manage helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild|postinstall/i.test(command), false, `${name} must not download/build native helper`)
  }
}

function assertNoLockfilesOrGoModules(root) {
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
}

function assertRepoArtifactGuardrails(root) {
  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|clean-install-consumption-manifest|artifact-bundle-manifest|install-layout-manifest|consumption-failure-manifest|rollback-manifest|no-leak-manifest|generated-package-manifest|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts\//.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated/checksum/provenance/attestation/package artifacts')
}

function assertArtifactIgnoreGuardrails(root) {
  const gitignore = read(root, '.gitignore')
  if (/\.agentteam-artifacts\//.test([read(root, DOC), read(root, PLAN)].join('\n'))) {
    assert.ok(gitignore.includes('.agentteam-artifacts/'), '.agentteam-artifacts/ must remain ignored if mentioned')
  }
  assert.equal(fs.existsSync(path.join(root, '.agentteam-artifacts')), false, '.agentteam-artifacts/ must not be committed or created')
}

function assertNoWorkflowReleaseOrBuild(root) {
  const workflows = path.join(root, '.github', 'workflows')
  if (!fs.existsSync(workflows)) return
  for (const name of fs.readdirSync(workflows).filter(value => /\.(?:ya?ml)$/i.test(value))) {
    const source = fs.readFileSync(path.join(workflows, name), 'utf8')
    assert.equal(/actions\/upload-artifact|gh\s+release|npm\s+(?:publish|version|pack)|go\s+build/i.test(source), false, `${name} must not add artifact/release/package/build workflow behavior`)
  }
}

function assertKernelRuntimeGuardrails(root) {
  const source = read(root, 'core/kernel.ts')
  assertIncludes(source, "if (!raw || raw === 'none' || raw === 'off' || raw === 'disabled') return 'disabled'", 'kernel source')
  assertIncludes(source, 'const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)', 'kernel source')
  assertIncludes(source, "const activeMode: AgentTeamKernelActiveMode = usesGo() ? 'go' : 'typescript'", 'kernel source')
  assertIncludes(source, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel source')
  assertIncludes(source, 'const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure', 'kernel source')
  assertIncludes(source, 'const helperPath = explicitHelperPath || packagedHelperPath', 'kernel source')
  assertIncludes(source, "const cutoverRequested = requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel source')
  assertIncludes(source, 'const startupFallback = cutoverRequested ? undefined', 'kernel source')
  assertIncludes(source, 'if (cutoverRequested) return cutoverUnavailableSnapshot(capturedAt)', 'kernel source')
  assertIncludes(source, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'kernel source')
  assertIncludes(source, 'if (cutoverRequested) return fallback(compactInput)', 'kernel source')
  assertIncludes(source, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse'", 'kernel source')
}

function assertReadinessAndUiGuardrails(root) {
  const readinessPath = path.join(root, 'commands/readiness.ts')
  const readiness = fs.existsSync(readinessPath) ? read(root, 'commands/readiness.ts') : ''
  const team = read(root, 'commands/team.ts')
  assertIncludes(readiness, "return args.trim().toLowerCase() === 'readiness'", 'readiness command')
  assert.equal(/readiness\s+--|readiness\s+(?:native|availability|resolver|default|cutover|package|artifact|checkpoint|storage|release|rollback|consume|consumption|install|diagnostics|no-leak|failure|guardrail|package-native)/i.test(readiness), false, '/team readiness should not gain options/subcommands')
  assert.equal(/registerTool|model-callable|native availability tool|runtime control plane/i.test(readiness), false, 'readiness must not become model-callable/runtime control tool')
  assert.equal(/openTeamPanel\([^)]*readiness|render.*readiness|ambient.*diagnostics/i.test(team), false, 'readiness must not be ambient panel diagnostics')
}

function assertFinalCheckpointAllowed(root) {
  const doc = read(root, DOC)
  const plan = read(root, PLAN)
  for (const link of CHECKPOINT_LINKS) assertIncludes(doc, link, 'Slice 8 checkpoint link')
  assert.equal(fs.existsSync(path.join(root, CHECKPOINT_LINKS[0])), true, 'checkpoint doc should exist')
  assert.equal(fs.existsSync(path.join(root, CHECKPOINT_LINKS[1])), true, 'checkpoint guard should exist')
  assert.match(doc, /^## Slice 8 — Final Checkpoint$/m, 'approved Slice 8 final checkpoint section should be present')
  assert.equal(/^## v0\.4\.28\b/im.test(doc), false, 'Slice 7 guard must not allow v0.4.28 implementation')
  assert.equal(/^### v0\.4\.28\b/im.test(plan), false, 'roadmap must not start v0.4.28 implementation')
}

module.exports = {
  name: 'Go kernel v0.4.27 package native guardrails',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const combined = [doc, plan].join('\n\n')

    for (const expected of REQUIRED_DOC_ITEMS) assertIncludes(doc, expected, 'Slice 7 doc')
    for (const expected of PACKAGE_GUARDRAILS) assertIncludes(doc, expected, 'package guardrail')
    for (const expected of MODULE_LOCKFILE_GUARDRAILS) assertIncludes(doc, expected, 'module/lockfile guardrail')
    for (const expected of REPO_ARTIFACT_GUARDRAILS) assertIncludes(doc, expected, 'repo artifact guardrail')
    for (const expected of BUILD_RELEASE_GUARDRAILS) assertIncludes(doc, expected, 'build/release guardrail')
    for (const expected of RUNTIME_GUARDRAILS) assertIncludes(doc, expected, 'runtime guardrail')
    for (const expected of READINESS_GUARDRAILS) assertIncludes(doc, expected, 'readiness guardrail')
    for (const expected of GO_AUTHORITY_GUARDRAILS) assertIncludes(doc, expected, 'Go authority guardrail')
    for (const expected of STOP_ITEMS) assertIncludes(doc, expected, 'Slice 7 STOP gate')
    for (const forbidden of FORBIDDEN_DOC) assert.equal(combined.includes(forbidden), false, `docs must not imply forbidden policy: ${forbidden}`)
    assert.match(doc, /^## Slice 7 — Package Native Guardrails and Readiness Containment$/m, 'approved Slice 7 section should be present')

    assertPackageJsonGuardrails(root)
    assertNoLockfilesOrGoModules(root)
    assertRepoArtifactGuardrails(root)
    assertArtifactIgnoreGuardrails(root)
    assertNoWorkflowReleaseOrBuild(root)
    assertKernelRuntimeGuardrails(root)
    assertReadinessAndUiGuardrails(root)
    assertFinalCheckpointAllowed(root)
  },
}
