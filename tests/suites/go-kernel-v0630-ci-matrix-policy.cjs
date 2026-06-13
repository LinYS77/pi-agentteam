const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  BUILDER_COMMAND,
  VERIFIER_COMMAND,
  REQUIRED_MATRIX_TARGET,
  REVIEW_ARTIFACT_NAME_PREFIX,
  REVIEW_OUTPUT_ROOT,
  assertWorkflowContract,
  readWorkflow,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.6.30-ci-review-artifact-prototype.md'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_DOC_ITEMS = [
  'Slice 3 — First CI Matrix Row and Unsupported-Row Policy',
  'required CI review row is limited to `ubuntu-latest / linux-x64-glibc`',
  '`runner: ubuntu-latest`',
  '`target: linux-x64-glibc`',
  '`node-version: 24`',
  '`go-version: stable`',
  'macOS, Windows, linux-arm64, musl, and other rows remain future/experimental/unsupported',
  'No cross-compilation without native smoke',
  'not release asset, not install source, and not normal-user availability proof',
  'Slice 4 — CI Artifact Download/Reverify Smoke',
  'The workflow adds a dependent `verify-review-artifact` job',
  'actions/download-artifact@v4',
]
const FORBIDDEN_DOC_PHRASES = [
  'macOS is supported availability',
  'Windows is supported availability',
  'linux-arm64 is supported availability',
  'musl is supported availability',
  'normal-user native availability is proven',
  'matrix artifacts are release assets',
  'artifact download/reverify verifier is implemented as runtime behavior',
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

function assertWorkflowMatrix(root) {
  assertWorkflowContract(root)
  const workflow = readWorkflow(root)
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
    'runs-on: ${{ matrix.runner }}',
    'node-version: ${{ matrix.node-version }}',
    'go-version: ${{ matrix.go-version }}',
    REVIEW_OUTPUT_ROOT,
    'artifact_dir="$output_root/native/tmuxSnapshotParse/0.3.0-read-model-shadow/${{ matrix.target }}"',
    'test -d "$artifact_dir"',
    'test -f "$artifact_dir/artifact-index.json"',
    BUILDER_COMMAND,
    VERIFIER_COMMAND,
    `name: ${REVIEW_ARTIFACT_NAME_PREFIX}`,
    '${{ github.sha }}-${{ github.run_id }}',
    'retention-days: 7',
    'if-no-files-found: error',
  ]) {
    assertIncludes(workflow, expected, 'review workflow matrix policy')
  }

  const includeRows = [...workflow.matchAll(/^\s+- runner:/gm)]
  assert.equal(includeRows.length, 2, 'Slice 4 keeps one build row and one mirrored verify row')
  assert.equal((workflow.match(new RegExp(`target: ${REQUIRED_MATRIX_TARGET}`, 'g')) || []).length, 2, 'build and verify jobs must use only the required target')
  assert.equal(/macos-latest|windows-latest|ubuntu-.*arm|musl|cross-?compile/i.test(workflow), false, 'workflow must not enable future/experimental rows or cross-compilation in Slice 3')
  assert.equal(/continue-on-error|experimental:\s*true/i.test(workflow), false, 'no experimental rows should be enabled in Slice 3')
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|gh\s+attestation/i.test(workflow), false, 'workflow must not add release/npm/git/signing behavior')
  assert.equal((workflow.match(/actions\/download-artifact@v4/g) || []).length, 1, 'workflow must use download-artifact only once for the verifier job')
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC_ITEMS) assertIncludes(doc, expected, 'v0.6.30 matrix doc')
  for (const forbidden of FORBIDDEN_DOC_PHRASES) assert.equal(doc.includes(forbidden), false, `doc must not overclaim: ${forbidden}`)
}

function assertPackageGuardrails(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
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
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
}

function assertRuntimeUnchanged(root) {
  const runtimeSources = [
    read(root, 'core/kernel.ts'),
    read(root, 'core/kernelPackagedResolver.ts'),
  ].join('\n')
  assert.equal(/linux-x64-glibc|matrix|artifact-index|artifactIndex|go-helper-review-artifact/.test(runtimeSources), false, 'runtime/resolver must not depend on CI matrix or artifact index')
}

function assertNoGeneratedCommitted(root) {
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /artifact-index\.json$/i.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated matrix artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.30 CI matrix policy',
  async run(env) {
    const root = env.helpers.extRoot
    assertWorkflowMatrix(root)
    assertDoc(root)
    assertPackageGuardrails(root)
    assertRuntimeUnchanged(root)
    assertNoGeneratedCommitted(root)
  },
}
