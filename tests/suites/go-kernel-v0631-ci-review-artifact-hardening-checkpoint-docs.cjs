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

const DOC = 'docs/perf/v0.6.31-ci-review-artifact-verifier-hardening.md'
const CHECKPOINT = 'docs/perf/v0.6.31-ci-review-artifact-verifier-hardening-checkpoint.md'
const PACKAGE_VERSION = '0.6.8'

const REQUIRED_ROUTE = [
  'Route C — strict verifier/security hardening is the v0.6.31 main route.',
  'Route A — hosted observation is supporting checkpoint evidence only',
  'hosted run status is `not observed locally`',
  'Route B — second platform row is deferred',
  'Route D — package-manager clean-install proof is deferred',
]

const REQUIRED_SLICE_EVIDENCE = [
  'Slice 1 — expected-context verifier flags',
  'target, sourceRevision, github.sha, and github.run_id',
  '`--expected-target`',
  '`--expected-source-revision`',
  '`--expected-github-sha`',
  '`--expected-github-run-id`',
  '`context-mismatch` compact/no-leak diagnostics',
  'Omitting expected-context flags still supports local reviewer usage',
  'Slice 2 — strict bundle surface verifier',
  'walks extracted artifact roots with `lstat`',
  'rejects symlinks, non-regular files, unsafe entries',
  'generated package subtree surface is exact',
  '`artifact-index.json` uses allowlisted top-level keys',
  'allowlisted file-row keys only',
  '`SHA256SUMS` duplicate rows, extra rows, missing rows, and malformed rows are rejected',
  'helper bytes, metadata bytes, and total extracted bytes',
  'Slice 3 — strict workflow verification',
  'expected_source_revision=$(git rev-parse --verify HEAD)',
  'sourceRevision` from checked-out `HEAD` is not conflated with `github.sha`',
  'single `linux-x64-glibc` build row',
  'mirrored single `linux-x64-glibc` verify row',
  'permissions remain `contents: read`',
  'one `actions/upload-artifact@v4`',
  'one `actions/download-artifact@v4`',
  '`retention-days: 7`',
  'Slice 4 — hosted observation runbook',
  '`workflow_dispatch` observation steps for an exact pushed commit',
  'No downloaded bundles, verifier JSON, workflow summaries, generated manifests, checksums, provenance, attestations, hosted artifacts, or native binaries are checked in.',
  'not normal-user native availability proof',
]

const REQUIRED_FILES = [
  APPROVED_REVIEW_WORKFLOW_PATH,
  'scripts/lib/go-helper-artifact-verifier.cjs',
  'scripts/verify-go-helper-artifact.cjs',
  'tests/helpers/reviewArtifactWorkflowGuard.cjs',
  DOC,
  CHECKPOINT,
  'tests/suites/go-kernel-v0631-ci-artifact-context.cjs',
  'tests/suites/go-kernel-v0631-ci-artifact-bundle-surface.cjs',
  'tests/suites/go-kernel-v0631-ci-review-artifact-workflow-strict-context.cjs',
  'tests/suites/go-kernel-v0631-hosted-observation-docs.cjs',
  'tests/suites/go-kernel-v0631-ci-review-artifact-hardening-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0630-ci-artifact-reverify.cjs',
  'tests/suites/go-kernel-v0630-ci-review-artifact-workflow.cjs',
  'tests/suites/go-kernel-v0630-ci-matrix-policy.cjs',
  'tests/suites/go-kernel-v0630-ci-review-artifact-checkpoint-docs.cjs',
]

const REQUIRED_GO_STOP = [
  'GO only for preserving v0.6.31 as GitHub-only review artifact verifier hardening and observation runbook/checkpoint evidence after leader review.',
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
  'current `go-cutover` behavior changes',
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
  'Hosted run evidence is pending unless the leader later supplies an exact commit/run id.',
  'Cross-platform rows beyond `linux-x64-glibc` remain unproven and unapproved.',
  'Package-manager clean install proof remains missing.',
  'Package, release, npm, default resolver, and default Go decisions remain unapproved.',
  'Fallback deletion, rollback plan, and default-disable plan remain unapproved.',
  'Signing/security ownership for future release assets remains unresolved.',
]

const FORBIDDEN_DOC_CLAIMS = [
  'release assets are implemented',
  'release asset is approved',
  'install source is approved',
  'package artifact is approved',
  'package-manager clean-install proof is complete',
  'normal-user native availability is proven',
  'second platform is supported',
  'macOS is supported availability',
  'Windows is supported availability',
  'arm64 is supported availability',
  'musl is supported availability',
  'default Go is enabled',
  'default resolver is enabled',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
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
  for (const expected of REQUIRED_SLICE_EVIDENCE) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_FILES) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_GO_STOP) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_BLOCKERS) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const forbidden of FORBIDDEN_DOC_CLAIMS) assert.equal(checkpoint.includes(forbidden), false, `${CHECKPOINT} must not overclaim: ${forbidden}`)
  assertIncludes(checkpoint, 'Preserve v0.6.31 as review-only verifier hardening plus hosted observation runbook/checkpoint evidence.', CHECKPOINT)
}

function assertMainRunbookLinksCheckpoint(root) {
  const doc = read(root, DOC)
  assertIncludes(doc, CHECKPOINT, DOC)
  assertIncludes(doc, 'GO only for preserving v0.6.31 as GitHub-only review artifact verifier hardening and observation runbook/checkpoint evidence after leader review.', DOC)
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
  assert.equal((workflow.match(/actions\/upload-artifact@v4/g) || []).length, 1, 'workflow uploads exactly once')
  assert.equal((workflow.match(/actions\/download-artifact@v4/g) || []).length, 1, 'workflow downloads exactly once')
  assert.equal((workflow.match(/^\s+- runner:/gm) || []).length, 2, 'workflow keeps one build row and one verify row')
  assert.equal((workflow.match(new RegExp(`target: ${REQUIRED_MATRIX_TARGET}`, 'g')) || []).length, 2, 'workflow keeps linux-x64-glibc build and verify rows only')
  assert.equal((workflow.match(/runner: ubuntu-latest/g) || []).length, 2, 'workflow keeps ubuntu-latest build and verify rows')
  assert.equal((workflow.match(/retention-days: 7/g) || []).length, 1, 'workflow retention stays 7 days')
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
  assert.equal((packageJson.files || []).some(item => /(?:github|workflow|helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package files must not include workflow/native/helper/generated artifacts')
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
  assert.equal(/artifact-index|artifactIndex|go-helper-review-artifact|download-artifact|github\.sha|github\.run_id|workflow_dispatch/i.test(runtimeSources), false, 'runtime/resolver must not read artifact-index or workflow metadata')
  assert.equal(/default Go is enabled|normal-user native availability|package-manager install proof|release asset/i.test(runtimeSources), false, 'runtime/resolver must not claim package/release/default availability')
}

function assertNoGeneratedOrHostedArtifacts(root) {
  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|manifest|license|workflow-summary|verifier-output)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|md)$/i
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated/hosted/native artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.31 CI review artifact hardening checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertCheckpointDoc(root)
    assertMainRunbookLinksCheckpoint(root)
    assertGitignore(root)
    assertWorkflowStrictReviewOnly(root)
    assertPackageRuntimeGuardrails(root)
    assertNoGeneratedOrHostedArtifacts(root)
  },
}
