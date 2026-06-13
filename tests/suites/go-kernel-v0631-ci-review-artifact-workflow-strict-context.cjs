const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  APPROVED_REVIEW_WORKFLOW,
  APPROVED_REVIEW_WORKFLOW_PATH,
  REQUIRED_MATRIX_TARGET,
  REVIEW_ARTIFACT_NAME_PREFIX,
  REVIEW_OUTPUT_ROOT,
  BUILDER_COMMAND,
  STRICT_VERIFIER_EXPECTED_CONTEXT_LINES,
  VERIFIER_COMMAND_BASE,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const PACKAGE_VERSION = '0.6.8'
const REQUIRED_TARGET = 'linux-x64-glibc'

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertNotIncludes(source, forbidden, label) {
  assert.equal(source.includes(forbidden), false, `${label} must not include ${forbidden}`)
}

function assertWorkflowFileSet(root) {
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'v0.6.31 keeps exactly one review workflow file')
}

function assertStrictVerifierInvocation(workflow) {
  assertIncludes(workflow, VERIFIER_COMMAND_BASE, 'strict verifier workflow')
  for (const expected of STRICT_VERIFIER_EXPECTED_CONTEXT_LINES) {
    assertIncludes(workflow, expected, 'strict verifier workflow')
  }
  assertIncludes(workflow, 'node scripts/verify-go-helper-artifact.cjs --artifact-root "$artifact_root" \\', 'strict verifier workflow keeps base command prefix')
  assertIncludes(workflow, 'expected_source_revision=$(git rev-parse --verify HEAD)', 'strict verifier workflow separates checked-out source revision')
  assertIncludes(workflow, '--expected-source-revision "$expected_source_revision"', 'strict verifier workflow uses checked-out source revision')
  assertIncludes(workflow, '--expected-github-sha "${{ github.sha }}"', 'strict verifier workflow uses github.sha separately')
  assertIncludes(workflow, '--expected-github-run-id "${{ github.run_id }}"', 'strict verifier workflow pins github run id')
  assert.equal(/--expected-source-revision\s+"\$\{\{\s*github\.sha\s*\}\}"/.test(workflow), false, 'sourceRevision must not be conflated with github.sha')
}

function assertMatrixStillSingleLinuxRow(workflow) {
  const includeRows = [...workflow.matchAll(/^\s+- runner:/gm)]
  assert.equal(includeRows.length, 2, 'workflow keeps one build row and one mirrored verify row')
  assert.equal((workflow.match(new RegExp(`target: ${REQUIRED_TARGET}`, 'g')) || []).length, 2, 'build and verify rows must both use linux-x64-glibc')
  assert.equal((workflow.match(/runner: ubuntu-latest/g) || []).length, 2, 'build and verify rows must both use ubuntu-latest')
  assert.equal((workflow.match(/arch: x64/g) || []).length, 2, 'build and verify rows must both use x64')
  assert.equal((workflow.match(/libc: glibc/g) || []).length, 2, 'build and verify rows must both use glibc')
  assertIncludes(workflow, `target: ${REQUIRED_MATRIX_TARGET}`, 'strict verifier workflow matrix')
  assertIncludes(workflow, REVIEW_OUTPUT_ROOT, 'strict verifier workflow matrix')
  assertIncludes(workflow, BUILDER_COMMAND, 'strict verifier workflow builder')
  assertIncludes(workflow, `name: ${REVIEW_ARTIFACT_NAME_PREFIX}`, 'strict verifier workflow artifact name')

  for (const forbidden of [
    'macos-latest',
    'windows-latest',
    'linux-arm64',
    'arm64',
    'musl',
    'cross-compile',
    'cross compile',
    'continue-on-error',
    'experimental: true',
  ]) {
    assertNotIncludes(workflow, forbidden, 'strict verifier workflow unsupported rows')
  }
}

function assertReviewOnlyTransferShape(workflow) {
  assertIncludes(workflow, `permissions:\n  contents: read`, 'strict verifier workflow permissions')
  assert.equal((workflow.match(/actions\/upload-artifact@v4/g) || []).length, 1, 'workflow uploads exactly once')
  assert.equal((workflow.match(/actions\/download-artifact@v4/g) || []).length, 1, 'workflow downloads exactly once')
  assert.equal((workflow.match(/retention-days: 7/g) || []).length, 1, 'workflow keeps retention-days 7 exactly once')
  assertIncludes(workflow, 'if-no-files-found: error', 'strict verifier workflow upload')
  assertIncludes(workflow, 'overwrite: true', 'strict verifier workflow upload')
  assertIncludes(workflow, 'needs: build-review-artifact', 'strict verifier workflow dependency')
}

function assertNoReleasePackageDefaultBehavior(workflow) {
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|signing|gh\s+attestation/i.test(workflow), false, 'workflow must not add release/npm/git/signing behavior')
  assert.equal(/curl\b|wget\b|node-gyp\b|prebuild|postinstall|preinstall|install-time build|package-manager install proof/i.test(workflow), false, 'workflow must not add download/install/package behavior')
  assert.equal(/PI_AGENTTEAM_KERNEL=|PI_AGENTTEAM_KERNEL_PACKAGED|go-packaged-preview|go-cutover|core\/kernel|kernelPackagedResolver|compactReadModelFingerprint cutover/i.test(workflow), false, 'workflow must not change runtime/default resolver behavior')
  assert.equal(/\$GITHUB_STEP_SUMMARY/.test(workflow), false, 'Slice 3 does not add product UI or step summary expansion')
}

function assertPackageRuntimeGuard(root) {
  const kernel = read(root, 'core/kernel.ts')
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  assert.equal(/artifact-index|artifactIndex|go-helper-review-artifact|download-artifact|github\.sha|github\.run_id/i.test(kernel), false, 'runtime kernel must not depend on workflow metadata')
  assert.equal(/artifact-index|artifactIndex|go-helper-review-artifact|download-artifact|github\.sha|github\.run_id/i.test(resolver), false, 'packaged resolver must not depend on workflow metadata')

  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define ${key}`)
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+(?:publish|version)\b/.test(command), false, `${name} must not publish or version package`)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not build/download native helper`)
  }
}

module.exports = {
  name: 'Go kernel v0.6.31 CI review artifact workflow strict context',
  async run(env) {
    const root = env.helpers.extRoot
    assertWorkflowFileSet(root)
    assertWorkflowContract(root)
    const workflow = readWorkflow(root)
    assertIncludes(workflow, APPROVED_REVIEW_WORKFLOW_PATH, 'strict verifier workflow path trigger')
    assertStrictVerifierInvocation(workflow)
    assertMatrixStillSingleLinuxRow(workflow)
    assertReviewOnlyTransferShape(workflow)
    assertNoReleasePackageDefaultBehavior(workflow)
    assertPackageRuntimeGuard(root)
  },
}
