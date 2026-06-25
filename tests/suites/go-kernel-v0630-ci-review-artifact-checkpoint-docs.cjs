const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  APPROVED_REVIEW_WORKFLOW,
  APPROVED_REVIEW_WORKFLOW_PATH,
  BUILDER_COMMAND,
  VERIFIER_COMMAND,
  REQUIRED_MATRIX_TARGET,
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.6.30-ci-review-artifact-prototype.md'
const CHECKPOINT = 'docs/perf/v0.6.30-ci-review-artifact-prototype-checkpoint.md'
const PACKAGE_VERSION = '0.6.8'

const REQUIRED_REFERENCES = [
  APPROVED_REVIEW_WORKFLOW_PATH,
  'scripts/build-go-helper-artifact.cjs',
  'scripts/lib/go-helper-artifact-builder.cjs',
  'scripts/verify-go-helper-artifact.cjs',
  'scripts/lib/go-helper-artifact-verifier.cjs',
  'core/kernel.ts',
  'core/kernelPackagedResolver.ts',
  DOC,
  CHECKPOINT,
  'tests/helpers/reviewArtifactWorkflowGuard.cjs',
  'tests/suites/go-kernel-v0630-ci-review-artifact-workflow.cjs',
  'tests/suites/go-kernel-v0630-ci-artifact-index.cjs',
  'tests/suites/go-kernel-v0630-ci-matrix-policy.cjs',
  'tests/suites/go-kernel-v0630-ci-artifact-reverify.cjs',
  'tests/suites/go-kernel-v0630-packaged-preview-reviewer-usability.cjs',
  'tests/suites/go-kernel-v0630-ci-review-artifact-checkpoint-docs.cjs',
]

const REQUIRED_GO_EVIDENCE = [
  'GO for checkpoint evidence only',
  '.github/workflows/go-helper-review-artifact.yml` exists as the only approved review-only GitHub Actions workflow',
  'permissions remain minimal: `permissions: contents: read`',
  BUILDER_COMMAND,
  'actions/upload-artifact@v4',
  'retention-days: 7',
  '`artifact-index.json` records `reviewOnly: true`, `releaseAsset: false`, `installSource: false`, and `normalUserAvailability: false`',
  'first matrix evidence is exactly the required `ubuntu-latest / linux-x64-glibc` row',
  'macOS, Windows, arm64, musl, and other rows remain unsupported/future',
  'actions/download-artifact@v4',
  VERIFIER_COMMAND,
  'validates `artifact-index.json`, `manifest.json`, `SHA256SUMS`, `provenance.json`, `LICENSE`, `license.json`, placeholder-only `attestation.intoto.jsonl`',
  'direct JSON-RPC `health` and `tmuxSnapshotParse` smoke',
  'explicit `go-packaged-preview` adapter smoke',
  '`compactReadModelFingerprint` remains TypeScript fallback and does not call the helper',
  'incomplete root/path pairs',
  'unsupported platform/libc',
  'missing executable',
  'version/protocol skew',
  'checksum/integrity mismatch',
  'metadata basename-only exposure',
  'no-leak behavior',
]

const REQUIRED_STOP_ITEMS = [
  'GitHub Actions artifacts as release assets, install sources, package artifacts, package-manager install proof, or normal-user native availability proof',
  '`npm version`, `npm publish`, package metadata changes, `package.json#files` changes for native artifacts, `optionalDependencies`, package scripts, lifecycle hooks, postinstall, download, or install-time build',
  '`go.mod`, `go.sum`, npm lockfiles, or shrinkwrap',
  'checked-in native binaries, generated artifacts, generated manifests, checksums, provenance, attestations, tarballs, zips, or artifact bundles',
  'GitHub release assets, npm companion packages, or main package native helper inclusion',
  'default Go, default resolver, current `go-cutover` behavior changes, TypeScript fallback deletion, or `compactReadModelFingerprint` cutover',
  'broad Go authority, runtime artifact download, package-manager install proof, `/team readiness` expansion, normal-user UI diagnostics, model-callable tools, ambient runtime diagnostics',
]

const REQUIRED_BLOCKERS = [
  'hosted GitHub Actions workflow run evidence has not been executed/observed',
  'cross-platform matrix evidence beyond `linux-x64-glibc`',
  'real package-manager install proof',
  'package metadata ownership, release ownership, npm strategy, companion package strategy, and rollback responsibility',
  'default resolver and default Go approval',
  'fallback deletion approval plus rollback/default-disable plan',
]

const FORBIDDEN_DOC_PHRASES = [
  'release assets are implemented',
  'release asset is approved',
  'install source is approved',
  'package artifact is approved',
  'normal-user native availability is proven',
  'default Go is enabled',
  'default resolver is enabled',
  'TypeScript fallback deletion is approved',
  'npm publish is approved',
  'npm version is approved',
  'package-manager install proof is complete',
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
  const doc = read(root, CHECKPOINT)
  for (const expected of REQUIRED_REFERENCES) assertIncludes(doc, expected, CHECKPOINT)
  for (const expected of REQUIRED_GO_EVIDENCE) assertIncludes(doc, expected, CHECKPOINT)
  for (const expected of REQUIRED_STOP_ITEMS) assertIncludes(doc, expected, CHECKPOINT)
  for (const expected of REQUIRED_BLOCKERS) assertIncludes(doc, expected, CHECKPOINT)
  for (const forbidden of FORBIDDEN_DOC_PHRASES) assert.equal(doc.includes(forbidden), false, `${CHECKPOINT} must not overclaim: ${forbidden}`)
  assertIncludes(doc, 'GO for preserving the v0.6.30 CI review artifact prototype as review-only evidence after leader review', CHECKPOINT)
  assertIncludes(doc, 'STOP for release/package/default/runtime/native availability work', CHECKPOINT)
}

function assertPrototypeDoc(root) {
  const doc = read(root, DOC)
  assertIncludes(doc, CHECKPOINT, DOC)
  assertIncludes(doc, 'Slice 6 — Final Checkpoint and Guard Consolidation', DOC)
  assertIncludes(doc, 'The focused Slice 6 guard is `tests/suites/go-kernel-v0630-ci-review-artifact-checkpoint-docs.cjs`', DOC)
  assertIncludes(doc, 'node tests/run.cjs go-kernel-v0630-ci-review-artifact-checkpoint-docs', DOC)
  assertIncludes(doc, 'GO for preserving v0.6.30 CI review artifact prototype evidence as review-only CI/reviewer evidence', DOC)
  assertIncludes(doc, 'STOP for release/package/default/runtime/native availability work until separately approved', DOC)
  for (const forbidden of FORBIDDEN_DOC_PHRASES) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
}

function assertGitignore(root) {
  const gitignore = read(root, '.gitignore')
  assertIncludes(gitignore, `!${DOC}`, '.gitignore')
  assertIncludes(gitignore, `!${CHECKPOINT}`, '.gitignore')
}

function assertWorkflowReviewOnly(root) {
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only approved review workflow may exist')
  assertWorkflowContract(root)
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
  const workflow = readWorkflow(root)
  assert.equal((workflow.match(/actions\/upload-artifact@v4/g) || []).length, 1, 'review workflow should upload exactly once')
  assert.equal((workflow.match(/actions\/download-artifact@v4/g) || []).length, 1, 'review workflow should download exactly once')
  assert.equal((workflow.match(/^\s+- runner:/gm) || []).length, 2, 'build and verify jobs should each keep one linux-x64-glibc row')
  assert.equal((workflow.match(new RegExp(`target: ${REQUIRED_MATRIX_TARGET}`, 'g')) || []).length, 2, 'only linux-x64-glibc should appear as matrix target')
  assert.equal(/macos-latest|windows-latest|arm64|musl|cross-?compile/i.test(workflow), false, 'workflow must not enable unsupported rows')
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|gh\s+attestation/i.test(workflow), false, 'workflow must not publish/release/sign/tag/push')
  assert.equal(/curl\b|wget\b|node-gyp\b|prebuild|postinstall/i.test(workflow), false, 'workflow must not add install/download/native packaging behavior')
}

function assertPackageGuardrails(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain unchanged')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:github|workflow|helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated artifacts')
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
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }
}

function assertRuntimeGuardrails(root) {
  const runtimeSources = [
    read(root, 'core/kernel.ts'),
    read(root, 'core/kernelPackagedResolver.ts'),
  ].join('\n')
  assert.equal(/download-artifact|artifact-index|artifactIndex|artifact URL|artifactUrl|go-helper-review-artifact/i.test(runtimeSources), false, 'runtime/resolver must not depend on CI artifacts or artifact index')
  assert.equal(/npm\s+(?:publish|version)|gh\s+release|actions\/upload-artifact|actions\/download-artifact/i.test(runtimeSources), false, 'runtime/resolver must not contain release/workflow behavior')
  assert.ok(runtimeSources.includes("const packagedPreviewRequested = requestedMode === 'go-packaged-preview'"), 'packaged preview remains explicit-only')
  assert.ok(runtimeSources.includes("const helperPath = explicitHelperPath || packagedHelperPath || packagedManifestHelperPath"), 'helper precedence remains explicit > direct packaged > manifest')
  assert.ok(runtimeSources.includes('if (cutoverRequested) return fallback(compactInput)'), 'compactReadModelFingerprint remains TS fallback for cutover modes')
}

function assertGoBuildAllowedOnlyInReviewContexts(root) {
  const allowed = new Set([
    APPROVED_REVIEW_WORKFLOW_PATH,
    'scripts/lib/go-helper-artifact-builder.cjs',
    'scripts/build-go-helper-artifact.cjs',
    'scripts/lib/go-helper-artifact-verifier.cjs',
    'core/kernelPackagedResolver.ts',
  ])
  const offenders = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!/\.(?:cjs|js|ts|tsx|json|md|ya?ml)$/.test(rel)) continue
    if (rel.startsWith('tests/')) continue
    if (rel.startsWith('docs/')) continue
    if (allowed.has(rel)) continue
    const source = fs.readFileSync(file, 'utf8')
    if (/\bgo\s+build\b/.test(source)) offenders.push(rel)
  }
  assert.deepEqual(offenders, [], 'go build must remain confined to builder/workflow/tests/docs review contexts')
}

function assertNoGeneratedCommitted(root) {
  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|manifest|license)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig)$/i
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated native/helper artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.30 CI review artifact checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertCheckpointDoc(root)
    assertPrototypeDoc(root)
    assertGitignore(root)
    assertWorkflowReviewOnly(root)
    assertPackageGuardrails(root)
    assertRuntimeGuardrails(root)
    assertGoBuildAllowedOnlyInReviewContexts(root)
    assertNoGeneratedCommitted(root)
  },
}
