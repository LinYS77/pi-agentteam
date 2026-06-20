const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  APPROVED_REVIEW_WORKFLOW,
  REQUIRED_MATRIX_TARGET,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.6.34-package-release-install-layout-decision.md'
const PACKAGE_VERSION = '0.6.8'
const ROLES = [
  'Security owner',
  'Release owner',
  'Artifact/verifier owner',
  'Package/install source owner',
  'Platform owner',
  'Incident response owner',
  'Key/credential owner',
]
const EVIDENCE = [
  'checksum evidence',
  'provenance evidence',
  'source revision evidence',
  'build context evidence',
  'license metadata evidence',
  'attestation placeholder vs real attestation distinction',
  'retention policy evidence',
  'artifact/package naming evidence',
  'verifier behavior evidence',
  'supported-platform commitments',
  'key/signature/cosign/SLSA decision if later approved',
  'revocation/rotation/incident response evidence',
]
const REQUIRED_DOC = [
  '## Slice 6 — Security / Signing Ownership Placeholder Policy and Evidence Boundaries',
  'Slice 6 defines future security/signing ownership and evidence boundaries.',
  'It is docs/tests only and does not create real signing, cosign, SLSA, security attestation, release asset, install source, generated signature, generated attestation, release bundle, native artifact, hosted record, or verifier output.',
  'Security/signing ownership roles remain future owner / unassigned until explicit leader/user decision:',
  'Existing attestation/signing fields are placeholder/non-real unless a later approved slice provides proof.',
  'Current artifacts and checkpoint docs are review-only and not signed availability.',
  'v0.6.34 does not approve signing, cosign, SLSA, or security attestation.',
  'No security claim can be used to justify default Go, default resolver, package delivery, release asset, fallback deletion, or normal-user availability.',
  'Placeholder attestation metadata is allowed only as review/test contract language; it is not a signature, not a trust root, not a release attestation, and not user availability evidence.',
  'No raw hosted records, raw API payloads, raw verifier JSON, downloaded bundles, generated signatures, generated attestations, release bundles, native artifacts, or verifier output may be checked in.',
  'Future security diagnostics must be compact/no-leak.',
  'Future diagnostics must not leak private key material, tokens, credentials, signing payload bodies, raw provenance, raw attestation bodies, helper stdout/stderr, absolute package roots, repo cwd, mailbox/report text, hosted payloads, or stack traces.',
  'Hosted workflow state must not be queried, triggered, fetched, or recorded by workers in this slice.',
  'No real signing approval.',
  'No cosign approval.',
  'No SLSA approval.',
  'No security attestation approval.',
  'No signed availability claim.',
  'No release asset approval.',
  'No install source approval.',
  'No package metadata change.',
  'No runtime/default resolver/default Go behavior change.',
  'No `go-cutover` or `go-packaged-preview` behavior change.',
  'No readiness/UI/tool/runtime diagnostics expansion.',
  'No workflow permission expansion such as `id-token: write`, `packages: write`, or `contents: write`.',
  'No `gh attestation`, `gh release`, npm publish/version, curl/wget, postinstall/preinstall, generated signature, generated attestation, release bundle, native artifact, hosted fetch, token, network, commit, tag, or push.',
  'tests/suites/go-kernel-v0634-security-signing-ownership-docs.cjs',
  'Do not create or modify GitHub workflow signing behavior in Slice 6.',
  'Do not generate any signature or attestation file.',
  'Do not start Slice 7 final checkpoint.',
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'signing is approved',
  'signing proof is complete',
  'signing approved/proven',
  'cosign is approved',
  'cosign proof is complete',
  'cosign approved/proven',
  'SLSA is approved',
  'SLSA proof is complete',
  'SLSA approved/proven',
  'security attestation is approved',
  'security attestation approved',
  'signed availability is approved',
  'signed availability is proven',
  'release asset is approved',
  'install source is approved',
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'fallback deletion is approved',
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
]
const EXPECTED_TOOLS = [
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
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

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const role of ROLES) assertIncludes(doc, role, DOC)
  for (const item of EVIDENCE) assertIncludes(doc, item, DOC)
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
}

function assertWorkflowNoSigning(root) {
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only review artifact workflow should exist')
  assertWorkflowContract(root)
  const workflow = readWorkflow(root)
  assertIncludes(workflow, 'permissions:\n  contents: read', 'workflow permissions')
  assertIncludes(workflow, `target: ${REQUIRED_MATRIX_TARGET}`, 'workflow target')
  assert.equal(/id-token:\s*write|packages:\s*write|contents:\s*write|attestations:\s*write/i.test(workflow), false, 'workflow must not add signing/package/write permissions')
  assert.equal(/cosign|slsa|gh\s+attestation|gh\s+release|npm\s+(?:publish|version)|git\s+(?:tag|push|commit)|curl\b|wget\b|postinstall|preinstall|node-gyp|prebuild/i.test(workflow), false, 'workflow must not add signing/release/npm/download/install behavior')
  assert.equal(/target:\s*(?!linux-x64-glibc\b)[a-z0-9-]+/i.test(workflow), false, 'workflow must not add second target')
}

function assertNoGeneratedSecurityArtifacts(root) {
  const forbiddenNames = /(?:^|\/)(?:.*\.(?:sig|sigstore|pem|key|crt|cert|p7s|minisig)|.*(?:signature|signed|cosign|slsa|release-bundle|release-asset|attestation|attestations|hosted-observation-record|workflow-run|raw-payload|api-payload|verifier-output|artifact-index|SHA256SUMS|provenance|manifest)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|sigstore|bundle|intoto))$/i
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('tests/fixtures/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => !rel.startsWith('scripts/lib/go-helper-hosted-observation-record.cjs'))
    .filter(rel => !rel.startsWith('scripts/verify-go-helper-hosted-observation-record.cjs'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || forbiddenNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated signatures/attestations/release/native/raw records')
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
}

function assertRuntimeInvariants(root) {
  const kernel = read(root, 'core/kernel.ts')
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  const runtimeSources = `${kernel}\n${resolver}`
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel explicit preview gate')
  assertIncludes(kernel, "const cutoverRequested = requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel cutover modes')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'kernel fingerprint TS fallback')
  assert.equal(/package\.json|node_modules|import\.meta\.url|__dirname|process\.cwd\(\)/i.test(kernel), false, 'kernel must not discover installed package layout by default')
  assert.equal(/download-artifact|hosted-observation|workflow-run|github\.run_id|github\.run_attempt|github\.sha|workflow_dispatch|actions\/download-artifact|cosign|slsa|signature|signed availability/i.test(runtimeSources), false, 'runtime/resolver must not consume hosted/signing metadata')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|postinstall|preinstall|install-time build|curl\b|wget\b|node-gyp|prebuild/i.test(runtimeSources), false, 'runtime/resolver must not contain release/npm/download/install behavior')
}

function assertReadinessToolInvariants(root) {
  const readiness = read(root, 'commands/readiness.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'readiness text')
  assert.equal(/signing|cosign|SLSA|security attestation|release asset|install source|signed availability|default Go|default resolver/i.test(readiness.replace('not normal-user native availability proof', '')), false, 'readiness must not expand security/signing/native availability UI')

  const toolSources = walkFiles(path.join(root, 'tools'))
    .filter(file => file.endsWith('.ts'))
    .map(file => read(root, toRel(root, file)))
    .join('\n')
  for (const name of EXPECTED_TOOLS) assertIncludes(toolSources, `name: '${name}'`, 'tool registrations')
  assert.equal(/\bsigning\b|\bcosign\b|\bSLSA\b|security attestation|release asset|install source|signed availability|default Go|default resolver/i.test(toolSources), false, 'tools must not add security/signing/release control plane')
}

module.exports = {
  name: 'Go kernel v0.6.34 security/signing ownership docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertWorkflowNoSigning(root)
    assertNoGeneratedSecurityArtifacts(root)
    assertPackageInvariants(root)
    assertRuntimeInvariants(root)
    assertReadinessToolInvariants(root)
  },
}
