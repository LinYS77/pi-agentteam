const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  APPROVED_REVIEW_WORKFLOW_PATH,
  REVIEW_ARTIFACT_NAME_PREFIX,
  REVIEW_OUTPUT_ROOT,
  BUILDER_COMMAND,
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior,
  assertWorkflowContract,
  readWorkflow,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.6.30-ci-review-artifact-prototype.md'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_DOC_ITEMS = [
  'v0.6.30 CI Review Artifact Prototype',
  'Slice 1 — CI Workflow Contract and Guard',
  APPROVED_REVIEW_WORKFLOW_PATH,
  'workflow_dispatch',
  'pull_request',
  'permissions stay `contents: read` only',
  BUILDER_COMMAND,
  REVIEW_OUTPUT_ROOT,
  'actions/upload-artifact@v4',
  REVIEW_ARTIFACT_NAME_PREFIX,
  'retention-days: 7',
  'review-only CI evidence',
  'no `npm version`, `npm publish`, or release asset upload',
  'no `gh release`, GitHub release assets, tags, commits, or pushes',
  'no `package.json` version, metadata, package files, `optionalDependencies`, package scripts, or lifecycle hooks',
  'no postinstall, download, install-time build, package-manager install proof, or normal-user native availability proof',
  'no checked-in generated helper binaries, generated manifests, checksums, provenance, attestations, tarballs, or artifact bundles',
  'no default Go, default resolver, current `go-cutover` behavior change, TypeScript fallback deletion, `compactReadModelFingerprint` cutover, broad Go authority, or `/team readiness` expansion',
  'The only approved workflow exception is `.github/workflows/go-helper-review-artifact.yml`',
  'Slice 2 — Builder CI Mode and Artifact Index',
  'review/transport metadata, not runtime resolver input',
  'No artifact download/reverify verifier in Slice 2',
  'Slice 3 — First CI Matrix Row and Unsupported-Row Policy',
  'Slice 4 — CI Artifact Download/Reverify Smoke',
  'The workflow adds a dependent `verify-review-artifact` job',
  'No artifact URL/config is product/runtime input in Slice 4',
  'Slice 4 deliberately does not implement package installation path, release asset, npm companion package, default resolver behavior, runtime artifact URL/config, or supported normal-user availability beyond review-only linux-x64-glibc CI evidence and reviewer/CI reverify smoke',
]
const FORBIDDEN_DOC_PHRASES = [
  'release assets are implemented',
  'npm publish is approved',
  'npm version is approved',
  'package metadata is approved',
  'default Go is enabled',
  'default resolver is enabled',
  'normal-user native availability is proven',
  'package-manager install proof is implemented',
  'artifact verifier is implemented as runtime behavior',
  'unsupported rows are supported availability',
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

function assertPackageJsonGuardrails(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:github|workflow|helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include workflows or native/helper/generated outputs')
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
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }
}

function assertNoCheckedInGeneratedOutputs(root) {
  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|manifest|license)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'Slice 1 must not check in generated artifact outputs, indexes, verifiers, or bundles')
}

function assertWorkflowDoesNotExpandBeyondSlice4(root) {
  const source = readWorkflow(root)
  assert.equal(/review-artifact-index|verify-artifact-url|artifact-verifier-url|cosign|slsa|gh\s+attestation/i.test(source), false, 'Slice 4 workflow must not add signing or URL-based verifier behavior')
  assert.equal(/PI_AGENTTEAM_KERNEL=|PI_AGENTTEAM_KERNEL_PACKAGED|go-packaged-preview|go-cutover|core\/kernel|kernelPackagedResolver/i.test(source), false, 'Slice 4 workflow must not change runtime/default resolver behavior')
}

module.exports = {
  name: 'Go kernel v0.6.30 CI review artifact workflow',
  async run(env) {
    const root = env.helpers.extRoot
    assert.equal(exists(root, DOC), true, `${DOC} should exist`)
    const doc = read(root, DOC)
    const gitignore = read(root, '.gitignore')

    for (const expected of REQUIRED_DOC_ITEMS) assertIncludes(doc, expected, 'v0.6.30 CI review artifact doc')
    for (const forbidden of FORBIDDEN_DOC_PHRASES) assert.equal(doc.includes(forbidden), false, `doc must not overclaim: ${forbidden}`)
    assertIncludes(gitignore, `!${DOC}`, '.gitignore')

    assertWorkflowContract(root)
    assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
    assertWorkflowDoesNotExpandBeyondSlice4(root)
    assertPackageJsonGuardrails(root)
    assertNoLockfilesOrGoModules(root)
    assertNoCheckedInGeneratedOutputs(root)
  },
}
