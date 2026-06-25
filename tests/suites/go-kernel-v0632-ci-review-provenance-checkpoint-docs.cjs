const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  APPROVED_REVIEW_WORKFLOW,
  APPROVED_REVIEW_WORKFLOW_PATH,
  REQUIRED_MATRIX_TARGET,
  STRICT_VERIFIER_EXPECTED_CONTEXT_LINES,
  VERIFIER_COMMAND_BASE,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.6.32-ci-review-provenance-build-context.md'
const CHECKPOINT = 'docs/perf/v0.6.32-ci-review-provenance-build-context-checkpoint.md'
const PACKAGE_VERSION = '0.6.8'
const PUSHED_V0631_COMMIT = '9aa2d93f02d30dd856f5e67f528c2441bbbd76a5'

const REQUIRED_ROUTE = [
  'Route C — provenance/build-context consistency is the v0.6.32 main route.',
  'Route A — hosted observation record support is the supporting route',
  'Route B — second platform row is deferred',
  'Route D — package-manager proof is deferred',
  'Route E — next Go hot path/package/default work is deferred',
]

const REQUIRED_TAG_POLICY = [
  `The v0.6.31 implementation commit \`${PUSHED_V0631_COMMIT}\` has been pushed on \`main\`.`,
  'The `v0.6.31` tag remains gated unless exact hosted run evidence is supplied or the leader changes the release rule.',
  'v0.6.32 can proceed on `main`, but v0.6.32 tag policy remains explicit: prefer v0.6.31 tag first; if unavailable, tag requires explicit leader decision/waiver.',
  'Hosted run evidence for v0.6.32 is pending after commit',
]

const REQUIRED_SLICE_EVIDENCE = [
  'Slice 1 — hosted observation record validator/CLI',
  'minimal record facts',
  '`observed: false` and `status: "not_observed_locally"`',
  'does not use network, `gh`, tokens, hosted artifacts, downloaded bundles, raw API payloads, verifier JSON bodies, workflow summaries, or checked-in records',
  'Slice 2 — provenance consistency verifier',
  'compact `provenance-mismatch` diagnostics',
  'source revision and source path consistency across `artifact-index.json`, `manifest.json`, and `provenance.json`',
  'generatedAt, exact build command, bounded build env, cwd, toolchain, runIdentity, outputRootKind, smoke metadata, and provenance schema allowlists',
  'Slice 3 — workflow context binding and builder consistency',
  'single build row and single verify row for `ubuntu-latest / linux-x64-glibc`',
  '`github.run_attempt`',
  '`github.ref`',
  '`--expected-github-run-attempt`',
  '`--expected-github-ref`',
  'builder-generated `artifact-index.json`, `manifest.json`, and `provenance.json` consistency',
  'Slice 4 — final checkpoint and guard consolidation',
  'docs/tests/guard consolidation only; it does not add workflow rows or runtime/package/default behavior',
]

const REQUIRED_FILES = [
  APPROVED_REVIEW_WORKFLOW_PATH,
  'scripts/lib/go-helper-artifact-verifier.cjs',
  'scripts/verify-go-helper-artifact.cjs',
  'scripts/lib/go-helper-artifact-builder.cjs',
  'scripts/lib/go-helper-hosted-observation-record.cjs',
  'scripts/verify-go-helper-hosted-observation-record.cjs',
  'tests/helpers/reviewArtifactWorkflowGuard.cjs',
  DOC,
  CHECKPOINT,
  'tests/suites/go-kernel-v0632-hosted-observation-record.cjs',
  'tests/suites/go-kernel-v0632-provenance-build-context.cjs',
  'tests/suites/go-kernel-v0632-workflow-context-binding.cjs',
  'tests/suites/go-kernel-v0632-builder-provenance-consistency.cjs',
  'tests/suites/go-kernel-v0632-ci-review-provenance-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0631-ci-review-artifact-hardening-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0631-ci-review-artifact-workflow-strict-context.cjs',
  'tests/suites/go-kernel-v0631-ci-artifact-context.cjs',
  'tests/suites/go-kernel-v0631-ci-artifact-bundle-surface.cjs',
  'tests/suites/go-kernel-v0631-hosted-observation-docs.cjs',
  'tests/suites/go-kernel-v0630-ci-artifact-reverify.cjs',
  'tests/suites/go-kernel-v0630-ci-review-artifact-workflow.cjs',
  'tests/suites/go-kernel-v0630-ci-matrix-policy.cjs',
  'tests/suites/go-kernel-v0630-ci-review-artifact-checkpoint-docs.cjs',
]

const REQUIRED_GO_STOP = [
  'GO only for preserving v0.6.32 as GitHub-only review artifact provenance/build-context consistency plus hosted observation record contract/checkpoint evidence after leader review.',
  'STOP for release assets',
  'package metadata/native deps',
  '`npm publish`',
  '`npm version`',
  'package scripts',
  'lifecycle hooks',
  'runtime download',
  'package-manager install proof',
  'default Go',
  'default resolver',
  '`go-cutover` changes',
  '`compactReadModelFingerprint` cutover',
  'TypeScript fallback deletion',
  'second platform support',
  'signing',
  'cosign',
  'SLSA',
  'security attestation claim',
  'normal-user native availability',
  '`/team readiness` expansion',
  'broad Go authority',
]

const REQUIRED_BLOCKERS = [
  'v0.6.31 hosted run evidence/tag still pending unless externally resolved.',
  'Hosted run evidence for v0.6.32 also pending after commit.',
  'Cross-platform rows beyond `linux-x64-glibc` remain unproven and unapproved.',
  'Package-manager clean install proof remains missing.',
  'Package, release, npm, default resolver, and default Go decisions remain unapproved.',
  'Fallback deletion, rollback plan, and default-disable plan remain unapproved.',
  'Signing/security ownership for future release assets remains unresolved.',
]

const REQUIRED_FINAL_RECOMMENDATION = [
  'Preserve v0.6.32 as review-only provenance/build-context consistency and hosted observation record/checkpoint evidence.',
  'Prefer completing the v0.6.31 tag gate first',
  'any v0.6.32 tag requires an explicit leader decision/waiver',
  'Do not expand to package, release, runtime, default resolver, second platform, signing, fallback deletion, or normal-user availability work without a separate approved route.',
]

const FORBIDDEN_DOC_CLAIMS = [
  'release assets are implemented',
  'release asset is approved',
  'install source is approved',
  'package artifact is approved',
  'package-manager clean-install proof is complete',
  'normal-user native availability is proven',
  'native availability proof is complete',
  'second platform is supported',
  'macOS is supported availability',
  'Windows is supported availability',
  'arm64 is supported availability',
  'musl is supported availability',
  'default Go is enabled',
  'default resolver is enabled',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'v0.6.31 tag is complete',
  'v0.6.31 tag is ready',
  'v0.6.31 tag has been created',
  'signing is approved',
  'cosign is approved',
  'SLSA is approved',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel))
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

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function assertCheckpointDoc(root) {
  assert.equal(exists(root, CHECKPOINT), true, `${CHECKPOINT} should exist`)
  const checkpoint = read(root, CHECKPOINT)
  for (const expected of REQUIRED_ROUTE) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_TAG_POLICY) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_SLICE_EVIDENCE) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_FILES) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_GO_STOP) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_BLOCKERS) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_FINAL_RECOMMENDATION) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const forbidden of FORBIDDEN_DOC_CLAIMS) assert.equal(checkpoint.includes(forbidden), false, `${CHECKPOINT} must not overclaim: ${forbidden}`)
}

function assertMainDocLinksCheckpoint(root) {
  const doc = read(root, DOC)
  assertIncludes(doc, CHECKPOINT, DOC)
  assertIncludes(doc, 'Slice 4 adds the final checkpoint `docs/perf/v0.6.32-ci-review-provenance-build-context-checkpoint.md` and guard consolidation only.', DOC)
  assertIncludes(doc, 'Final recommendation: preserve v0.6.32 as review-only provenance/build-context consistency and hosted observation record/checkpoint evidence.', DOC)
  assertIncludes(doc, 'Prefer completing the v0.6.31 tag gate first', DOC)
  assertIncludes(doc, 'any v0.6.32 tag requires an explicit leader decision/waiver', DOC)
  for (const forbidden of FORBIDDEN_DOC_CLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
}

function assertGitignore(root) {
  const gitignore = read(root, '.gitignore')
  assertIncludes(gitignore, `!${DOC}`, '.gitignore')
  assertIncludes(gitignore, `!${CHECKPOINT}`, '.gitignore')
}

function assertWorkflowStrictReviewOnly(root) {
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only one review workflow file may exist')
  assertWorkflowContract(root)
  const workflow = readWorkflow(root)
  assertIncludes(workflow, `permissions:\n  contents: read`, 'workflow permissions')
  assertIncludes(workflow, VERIFIER_COMMAND_BASE, 'workflow verifier base command')
  for (const expected of STRICT_VERIFIER_EXPECTED_CONTEXT_LINES) assertIncludes(workflow, expected, 'workflow strict expected-context flags')
  assertIncludes(workflow, '--expected-github-run-attempt "${{ github.run_attempt }}"', 'workflow strict run attempt')
  assertIncludes(workflow, '--expected-github-ref "${{ github.ref }}"', 'workflow strict ref')
  assert.equal((workflow.match(/actions\/upload-artifact@v4/g) || []).length, 1, 'workflow uploads exactly once')
  assert.equal((workflow.match(/actions\/download-artifact@v4/g) || []).length, 1, 'workflow downloads exactly once')
  assert.equal((workflow.match(/^\s+- runner:/gm) || []).length, 2, 'workflow keeps one build row and one verify row')
  assert.equal((workflow.match(new RegExp(`target: ${REQUIRED_MATRIX_TARGET}`, 'g')) || []).length, 2, 'workflow keeps linux-x64-glibc build and verify rows only')
  assert.equal((workflow.match(/runner: ubuntu-latest/g) || []).length, 2, 'workflow keeps ubuntu-latest build and verify rows')
  assert.equal((workflow.match(/retention-days: 7/g) || []).length, 1, 'workflow retention stays 7 days')
  assert.equal(/verify-go-helper-hosted-observation-record|hosted-observation-record|workflow summary|step summary/i.test(workflow), false, 'workflow must not consume hosted observation records or summaries')
  assert.equal(/macos-latest|windows-latest|linux-arm64|arm64|musl|cross-?compile|continue-on-error|experimental:\s*true/i.test(workflow), false, 'workflow must not add unsupported rows')
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|signing|gh\s+attestation/i.test(workflow), false, 'workflow must not add release/npm/git/signing behavior')
  assert.equal(/curl\b|wget\b|node-gyp\b|prebuild|postinstall|preinstall|install-time build|package-manager install proof/i.test(workflow), false, 'workflow must not add download/install/package behavior')
}

function assertPackageRuntimeGuardrails(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define ${key}`)
  }
  assert.equal((packageJson.files || []).some(item => /(?:github|workflow|helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|hosted-observation|record|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include workflow/native/helper/generated/record artifacts')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+(?:publish|version)\b/.test(command), false, `${name} must not publish/version package`)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild|postinstall/i.test(command), false, `${name} must not build/download native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }

  const runtimeSources = [read(root, 'core/kernel.ts'), read(root, 'core/kernelPackagedResolver.ts')].join('\n')
  assert.equal(/hosted-observation|observation record|verify-go-helper-hosted-observation-record|artifact-index|artifactIndex|go-helper-review-artifact|download-artifact|github\.sha|github\.run_id|github\.run_attempt|workflow_dispatch|provenance\.json/i.test(runtimeSources), false, 'runtime/resolver must not read hosted observation, artifact, provenance, or workflow metadata')
  assert.equal(/default Go is enabled|normal-user native availability|package-manager install proof|release asset/i.test(runtimeSources), false, 'runtime/resolver must not claim package/release/default availability')
}

function assertNoGeneratedOrHostedArtifacts(root) {
  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|manifest|license|workflow-summary|verifier-output|hosted-observation-record|workflow-run|raw-payload|api-payload)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|md)$/i
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => !rel.startsWith('scripts/lib/go-helper-hosted-observation-record.cjs'))
    .filter(rel => !rel.startsWith('scripts/verify-go-helper-hosted-observation-record.cjs'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated/hosted/native artifacts or raw records')
}

module.exports = {
  name: 'Go kernel v0.6.32 CI review provenance checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertCheckpointDoc(root)
    assertMainDocLinksCheckpoint(root)
    assertGitignore(root)
    assertWorkflowStrictReviewOnly(root)
    assertPackageRuntimeGuardrails(root)
    assertNoGeneratedOrHostedArtifacts(root)
  },
}
