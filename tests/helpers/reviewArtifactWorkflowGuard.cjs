const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const APPROVED_REVIEW_WORKFLOW = 'go-helper-review-artifact.yml'
const APPROVED_REVIEW_WORKFLOW_PATH = `.github/workflows/${APPROVED_REVIEW_WORKFLOW}`
const REQUIRED_MATRIX_TARGET = 'linux-x64-glibc'
const REVIEW_ARTIFACT_NAME_PREFIX = '${{ matrix.artifact-name }}'
const REVIEW_OUTPUT_ROOT = '$RUNNER_TEMP/agentteam-go-helper-review-artifact-${{ matrix.target }}'
const BUILDER_COMMAND = 'node scripts/build-go-helper-artifact.cjs --output-root "$output_root" --ci-review --json'
const VERIFIER_COMMAND_BASE = 'node scripts/verify-go-helper-artifact.cjs --artifact-root "$artifact_root"'
const VERIFIER_COMMAND = VERIFIER_COMMAND_BASE
const STRICT_VERIFIER_EXPECTED_CONTEXT_LINES = [
  'expected_source_revision=$(git rev-parse --verify HEAD)',
  '--expected-target "${{ matrix.target }}"',
  '--expected-source-revision "$expected_source_revision"',
  '--expected-github-sha "${{ github.sha }}"',
  '--expected-github-run-id "${{ github.run_id }}"',
  '--json',
]

function workflowDir(root) {
  return path.join(root, '.github', 'workflows')
}

function workflowFiles(root) {
  const dir = workflowDir(root)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(name => /\.(?:ya?ml)$/i.test(name)).sort()
}

function readWorkflow(root, name = APPROVED_REVIEW_WORKFLOW) {
  return fs.readFileSync(path.join(workflowDir(root), name), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertWorkflowContract(root) {
  const files = workflowFiles(root)
  assert.deepEqual(files, [APPROVED_REVIEW_WORKFLOW], 'Slice 1 approves exactly one review artifact workflow')

  const source = readWorkflow(root)
  assertIncludes(source, 'name: Go Helper Review Artifact', APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, 'workflow_dispatch:', APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, 'pull_request:', APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, "permissions:\n  contents: read", APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, 'actions/checkout@v4', APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, 'actions/setup-node@v4', APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, 'node-version: ${{ matrix.node-version }}', APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, 'actions/setup-go@v5', APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, 'actions/upload-artifact@v4', APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, 'actions/download-artifact@v4', APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, REVIEW_OUTPUT_ROOT, APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, BUILDER_COMMAND, APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, VERIFIER_COMMAND, APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, '--json', APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, `name: ${REVIEW_ARTIFACT_NAME_PREFIX}`, APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, 'retention-days: 7', APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, 'if-no-files-found: error', APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, 'overwrite: true', APPROVED_REVIEW_WORKFLOW_PATH)
  assertIncludes(source, 'timeout-minutes: 10', APPROVED_REVIEW_WORKFLOW_PATH)

  for (const expected of [
    'strategy:',
    'fail-fast: false',
    'matrix:',
    'include:',
    'runner: ubuntu-latest',
    `target: ${REQUIRED_MATRIX_TARGET}`,
    'os: linux',
    'arch: x64',
    'libc: glibc',
    "node-version: '24'",
    "go-version: 'stable'",
    'required: true',
    'artifact-name: agentteam-go-helper-review-artifact-linux-x64-glibc',
    'verify-review-artifact:',
    'needs: build-review-artifact',
    'Download review-only artifact',
    'Reverify review-only artifact',
    'kernel/go/agentteam-kernel/**',
    'scripts/build-go-helper-artifact.cjs',
    'scripts/lib/go-helper-artifact-builder.cjs',
    'scripts/verify-go-helper-artifact.cjs',
    'scripts/lib/go-helper-artifact-verifier.cjs',
    APPROVED_REVIEW_WORKFLOW_PATH,
    'artifact-index.json',
    'manifest.json',
    'SHA256SUMS',
    'provenance.json',
    'LICENSE',
    'license.json',
    'attestation.intoto.jsonl',
  ]) {
    assertIncludes(source, expected, APPROVED_REVIEW_WORKFLOW_PATH)
  }

  assert.equal(/\bgo\s+(?:build|install|mod)\b/i.test(source), false, 'review workflow must build only through the existing builder CLI')
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|curl\b|wget\b|node-gyp\b|prebuild/i.test(source), false, 'review workflow must not publish, release, tag, push, package, or use network download tools')
  assert.equal(/permissions:[\s\S]*\b(?:actions|attestations|checks|deployments|id-token|issues|packages|pull-requests|repository-projects|security-events|statuses):\s*(?:write|read|none)/i.test(source), false, 'review workflow must not request extra permissions')
  assert.equal(/release|publish|npm|package-manager install proof|normal-user native availability proof/i.test(source.replace(/review-only artifact/g, 'review artifact')), false, 'review workflow text must not claim release/package/default availability')
}

function assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root) {
  for (const name of workflowFiles(root)) {
    const source = readWorkflow(root, name)
    if (name === APPROVED_REVIEW_WORKFLOW) {
      assertWorkflowContract(root)
      continue
    }
    assert.equal(/actions\/upload-artifact|gh\s+release|npm\s+(?:publish|version|pack)|go\s+build/i.test(source), false, `${name} must not add unapproved artifact/release/package/build workflow behavior`)
  }
}

module.exports = {
  APPROVED_REVIEW_WORKFLOW,
  APPROVED_REVIEW_WORKFLOW_PATH,
  REQUIRED_MATRIX_TARGET,
  REVIEW_ARTIFACT_NAME_PREFIX,
  REVIEW_OUTPUT_ROOT,
  BUILDER_COMMAND,
  STRICT_VERIFIER_EXPECTED_CONTEXT_LINES,
  VERIFIER_COMMAND,
  VERIFIER_COMMAND_BASE,
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
}
