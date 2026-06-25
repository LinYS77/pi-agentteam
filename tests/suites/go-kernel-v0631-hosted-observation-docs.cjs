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
const PACKAGE_VERSION = '0.6.8'

const REQUIRED_ROUTE_DECISION = [
  'Route C — strict review artifact verifier/security hardening is the v0.6.31 main route.',
  'Route A — hosted GitHub Actions run evidence is supporting hosted observation/checkpoint evidence only; it is not the main route and is not normal-user native availability proof.',
  'Route B — second platform row is deferred',
  'Route D — package-manager clean-install proof is deferred',
]

const REQUIRED_RUNBOOK_ITEMS = [
  APPROVED_REVIEW_WORKFLOW_PATH,
  '`workflow_dispatch` run',
  'exact pushed commit',
  'build-review-artifact',
  'verify-review-artifact',
  'exactly one required matrix row',
  '`ubuntu-latest / linux-x64-glibc`',
  VERIFIER_COMMAND_BASE,
  'expected_source_revision=$(git rev-parse --verify HEAD)',
  '--expected-target "${{ matrix.target }}"',
  '--expected-source-revision "$expected_source_revision"',
  '--expected-github-sha "${{ github.sha }}"',
  '--expected-github-run-id "${{ github.run_id }}"',
  'sourceRevision` is compared to the checked-out `HEAD` and is not conflated with `github.sha`',
  'retention-days: 7',
  'review-only/non-availability evidence',
  'do not commit downloaded bundles, verifier JSON, workflow summaries, generated manifests, checksums, provenance, attestations, or artifacts',
  'not observed locally',
]

const REQUIRED_BOUNDARIES = [
  'Package version stays `0.6.8`.',
  'No `npm version` and no `npm publish`.',
  'No package metadata, native dependencies, package scripts, lifecycle hooks, postinstall, download, or install-time build.',
  'No package-manager install proof.',
  'No release assets, GitHub release, npm companion package, or main package native inclusion.',
  'No default resolver and no default Go.',
  'No current `go-cutover` behavior change.',
  'No `compactReadModelFingerprint` cutover.',
  'No `/team readiness` expansion.',
  'No runtime download, product UI, model-callable tool, runtime diagnostic, or user-facing availability diagnostic expansion.',
  'No second platform support claim',
  'No signing, cosign, SLSA, or security attestation claim',
  '`attestation.intoto.jsonl` remains placeholder-only',
  'No checked-in hosted artifacts',
]

const REQUIRED_BLOCKERS = [
  'Hosted run not yet observed locally',
  'Cross-platform matrix evidence beyond `linux-x64-glibc` remains missing.',
  'Package-manager clean install proof remains missing.',
  'Package, release, npm, default resolver, and default Go decisions remain unapproved.',
  'Fallback deletion, rollback plan, and default-disable plan remain unapproved.',
  'Signing/security ownership remains unresolved if future release assets are considered.',
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

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_ROUTE_DECISION) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_RUNBOOK_ITEMS) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_BOUNDARIES) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_BLOCKERS) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_CLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assertIncludes(doc, 'Slice 4 adds this hosted observation runbook and guards only; it does not execute hosted workflow, submit hosted artifacts, add a platform row, or expand package/default/runtime behavior.', DOC)
}

function assertGitignore(root) {
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
}

function assertWorkflowStillReviewOnly(root) {
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only one review workflow file may exist')
  assertWorkflowContract(root)
  const workflow = readWorkflow(root)
  assertIncludes(workflow, `permissions:\n  contents: read`, 'workflow permissions')
  assert.equal((workflow.match(/actions\/upload-artifact@v4/g) || []).length, 1, 'workflow uploads exactly once')
  assert.equal((workflow.match(/actions\/download-artifact@v4/g) || []).length, 1, 'workflow downloads exactly once')
  assert.equal((workflow.match(/^\s+- runner:/gm) || []).length, 2, 'workflow keeps one build row and one verify row')
  assert.equal((workflow.match(new RegExp(`target: ${REQUIRED_MATRIX_TARGET}`, 'g')) || []).length, 2, 'workflow keeps required target in build and verify rows only')
  assert.equal((workflow.match(/runner: ubuntu-latest/g) || []).length, 2, 'workflow keeps ubuntu-latest build and verify rows')
  assert.equal((workflow.match(/retention-days: 7/g) || []).length, 1, 'workflow retention stays 7 days')
  for (const expected of STRICT_VERIFIER_EXPECTED_CONTEXT_LINES) assertIncludes(workflow, expected, 'workflow strict expected-context flags')
  assert.equal(/macos-latest|windows-latest|linux-arm64|arm64|musl|cross-?compile|continue-on-error|experimental:\s*true/i.test(workflow), false, 'workflow must not add second platform or experimental rows')
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|signing|gh\s+attestation/i.test(workflow), false, 'workflow must not add release/npm/git/signing behavior')
  assert.equal(/curl\b|wget\b|node-gyp\b|prebuild|postinstall|preinstall|install-time build|package-manager install proof/i.test(workflow), false, 'workflow must not add download/install/package behavior')
}

function assertPackageRuntimeGuardrails(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:github|workflow|helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include workflow/native/helper/generated artifacts')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+(?:publish|version)\b/.test(command), false, `${name} must not publish/version package`)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild|postinstall/i.test(command), false, `${name} must not build/download native helper`)
  }

  const runtimeSources = [read(root, 'core/kernel.ts'), read(root, 'core/kernelPackagedResolver.ts')].join('\n')
  assert.equal(/download-artifact|artifact-index|artifactIndex|artifact URL|artifactUrl|go-helper-review-artifact|github\.run_id|github\.sha/i.test(runtimeSources), false, 'runtime/resolver must not depend on hosted workflow artifacts or metadata')
  assert.equal(/default Go is enabled|normal-user native availability|package-manager install proof/i.test(runtimeSources), false, 'runtime/resolver must not claim hosted observation availability')
}

function assertNoForbiddenFiles(root) {
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }
  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|manifest|license|workflow-summary|verifier-output)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|md)$/i
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in hosted/generated artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.31 hosted observation docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertGitignore(root)
    assertWorkflowStillReviewOnly(root)
    assertPackageRuntimeGuardrails(root)
    assertNoForbiddenFiles(root)
  },
}
