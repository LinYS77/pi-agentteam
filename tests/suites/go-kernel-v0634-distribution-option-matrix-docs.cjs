const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  APPROVED_REVIEW_WORKFLOW,
  REQUIRED_MATRIX_TARGET,
  VERIFIER_COMMAND_BASE,
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.6.34-package-release-install-layout-decision.md'
const PACKAGE_VERSION = '0.6.8'
const OPTIONS = [
  'Main package inclusion',
  'npm companion native package(s)',
  'GitHub release asset(s)',
  'Generated artifact package/bundle',
  'Source-only / no native delivery continuation',
]
const RESPONSIBILITY_FIELDS = [
  'Current v0.6.34 status',
  'Package metadata owner',
  'Artifact build owner',
  'Checksum/provenance/license/attestation owner',
  'Package naming/versioning owner',
  'Platform matrix/support owner',
  'Install behavior owner',
  'Unsupported-platform policy owner',
  'Rollback/deprecation owner',
  'Security/signing signoff owner',
  'Allowed user-facing claim / forbidden claim',
]
const REQUIRED_MATRIX_TEXT = [
  '## Slice 2 — Distribution Option Matrix and Owner Responsibilities',
  'Slice 2 documents future native helper distribution options and ownership responsibilities.',
  'Every option below is decision-only and requires future explicit leader/user approval before implementation.',
  'future explicit leader/user approval before implementation',
  'Preferred future candidate for further design is npm companion native package(s) plus generated artifact package/bundle inputs',
  'This preference requires future explicit leader/user approval before implementation.',
  'v0.6.34 does not approve package metadata, companion package publication, release assets, install source behavior, or normal-user availability.',
  'Route C platform expansion remains deferred until an owned distribution path exists.',
  'Route B real implementation remains forbidden/deferred; Slice 2 records decision criteria only, not applied fixtures or production package changes.',
  'Main `package.json` remains unchanged with version `0.6.8`.',
  'No `optionalDependencies`, native dependencies, package files, scripts, lifecycle hooks, `postinstall`, download, or install-time build are added.',
  'No `npm version`, `npm publish`, or `npm pack` for release is approved.',
  'No native binaries, generated artifacts, tarballs, release assets, raw hosted records, raw API payloads, or downloaded bundles are checked in.',
  'No default resolver, default Go, fallback deletion, signing, cosign, or SLSA approval is granted.',
  'tests/suites/go-kernel-v0634-distribution-option-matrix-docs.cjs',
]
const FORBIDDEN_CLAIMS = [
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'normal-user availability is proven',
  'native availability proof is complete',
  'package-manager native delivery is complete',
  'real package-manager native delivery is complete',
  'distribution option is approved',
  'distribution option is implemented',
  'distribution option is released',
  'distribution option is available',
  'main package inclusion is approved',
  'main package inclusion is implemented',
  'companion native package approved',
  'companion native package published',
  'GitHub release asset approved',
  'GitHub release asset uploaded',
  'install source is approved',
  'release asset is approved',
  'release evidence is complete',
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'signing is approved',
  'signing proof is complete',
  'cosign is approved',
  'cosign proof is complete',
  'SLSA is approved',
  'SLSA proof is complete',
  'second platform is supported',
  'second platform support is approved',
  'macOS is supported availability',
  'Windows is supported availability',
  'arm64 is supported availability',
  'musl is supported availability',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel))
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

function matrixRow(doc, option) {
  const line = doc.split('\n').find(row => row.startsWith(`| ${option} |`))
  assert.ok(line, `${DOC} should include matrix row for ${option}`)
  return line
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_MATRIX_TEXT) assertIncludes(doc, expected, DOC)
  for (const field of RESPONSIBILITY_FIELDS) assertIncludes(doc, field, DOC)
  for (const option of OPTIONS) {
    const row = matrixRow(doc, option)
    const cells = row.split('|').map(cell => cell.trim()).filter(Boolean)
    const status = cells[1]
    assert.ok(/\b(?:proposed|decision-only|deferred|rejected)\b/i.test(status), `${option} should have non-approved status`)
    assert.equal(/\b(?:approved|implemented|released|available|published|uploaded)\b/i.test(status), false, `${option} status must not claim approved/implemented/released/available`)
    assertIncludes(status, 'requires future explicit leader/user approval before implementation', `${option} status`)
    assert.equal(cells.length, RESPONSIBILITY_FIELDS.length + 1, `${option} row should include option plus every responsibility field`)
    for (let index = 2; index < cells.length; index += 1) {
      assert.notEqual(cells[index], '', `${option} ${RESPONSIBILITY_FIELDS[index - 1]} should be recorded`)
    }
    assertIncludes(cells[11], 'Allowed claim:', `${option} row allowed claim`)
    assertIncludes(cells[11], 'Forbidden claim:', `${option} row forbidden claim`)
  }
  for (const forbidden of FORBIDDEN_CLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not embed raw hosted/artifact/verifier JSON bodies`)
}

function assertPackageInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'], 'package remains TS/pi facade')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|hosted-observation|record|\.exe|\.dll|\.so|\.dylib|\.tgz|kernel\/go)/i.test(item)), false, 'package files must not include native/helper/generated artifacts')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define lifecycle script ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not publish/version package`)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild|postinstall|preinstall|install-time build/i.test(command), false, `${name} must not build/download/install native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }
}

function assertRuntimeInvariants(root) {
  const kernel = read(root, 'core/kernel.ts')
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  const runtimeSources = `${kernel}\n${resolver}`
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel explicit preview gate')
  assertIncludes(kernel, "const packagedResolverFailure = packagedPreviewRequested && !explicitHelperPath", 'kernel preview resolver gate')
  assertIncludes(kernel, 'const packagedManifestRequested = packagedPreviewRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure', 'kernel manifest resolver gate')
  assert.equal(/package\.json|node_modules|import\.meta\.url|__dirname|process\.cwd\(\)/i.test(kernel), false, 'kernel must not discover installed package layout by default')
  assert.equal(/download-artifact|hosted-observation|workflow-run|github\.run_id|github\.run_attempt|github\.sha|workflow_dispatch|actions\/download-artifact/i.test(runtimeSources), false, 'runtime/resolver must not consume hosted workflow/artifact metadata')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|cosign|slsa|postinstall|preinstall|install-time build|curl\b|wget\b|node-gyp|prebuild/i.test(runtimeSources), false, 'runtime/resolver must not contain release/npm/download/install behavior')
  assert.equal(/default Go is enabled|default resolver is enabled|normal-user native availability|package-manager native delivery|release asset is approved|fallback deletion is approved/i.test(runtimeSources), false, 'runtime/resolver must not claim package/default/release availability')
}

function assertWorkflowInvariants(root) {
  assertWorkflowContract(root)
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only review artifact workflow should exist')
  const source = readWorkflow(root)
  assertIncludes(source, `target: ${REQUIRED_MATRIX_TARGET}`, APPROVED_REVIEW_WORKFLOW)
  assertIncludes(source, VERIFIER_COMMAND_BASE, APPROVED_REVIEW_WORKFLOW)
  assert.equal(/target:\s*(?!linux-x64-glibc\b)[a-z0-9-]+/i.test(source), false, 'workflow must not add second platform target')
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|id-token|packages:\s*write|contents:\s*write|curl\b|wget\b|postinstall|preinstall|node-gyp|prebuild/i.test(source), false, 'workflow must not add release/signing/npm/install behavior')
}

function assertNoCheckedInArtifacts(root) {
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain temp npm tarballs')
  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|workflow-summary|verifier-output|hosted-observation-record|workflow-run|raw-payload|api-payload)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|md)$/i
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => !rel.startsWith('scripts/lib/go-helper-hosted-observation-record.cjs'))
    .filter(rel => !rel.startsWith('scripts/verify-go-helper-hosted-observation-record.cjs'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated/hosted/native artifacts or raw records')
}

module.exports = {
  name: 'Go kernel v0.6.34 distribution option matrix docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertPackageInvariants(root)
    assertRuntimeInvariants(root)
    assertWorkflowInvariants(root)
    assertNoCheckedInArtifacts(root)
  },
}
