const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  APPROVED_REVIEW_WORKFLOW,
  REQUIRED_MATRIX_TARGET,
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.6.35-pi-extension-compliance-package-surface.md'
const PACKAGE_VERSION = '0.6.8'
const EXPECTED_PEERS = {
  '@earendil-works/pi-ai': '*',
  '@earendil-works/pi-coding-agent': '*',
  '@earendil-works/pi-tui': '*',
  typebox: '*',
}
const EXPECTED_TOOLS = [
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
]

const REQUIRED_PIVOT = [
  '# v0.6.35 Pi Extension Compliance & Package Surface Checkpoint',
  'v0.6.35 Slice 1 docs/tests-only contract.',
  'v0.6.35 pivots away from second-platform native matrix planning and checks whether AgentTeam is shaped correctly as a pi TypeScript extension package surface.',
  '## Pivot Rationale',
  'v0.6.35 abandons the second-platform matrix path for this stage because AgentTeam is first a pi TypeScript extension, not a native binary distribution.',
  'Current priority is proving that the pi package, install, load, and control-plane surface match pi extension expectations:',
  'the package manifest clearly declares the pi extension entrypoint.',
  'the extension entrypoint is a TypeScript default factory for pi.',
  'pi core imports are represented as peer dependencies instead of bundled runtime packages.',
  'AgentTeam remains a TypeScript/pi facade and control plane.',
  'the Go helper remains a bounded helper behind the TypeScript adapter, not a native pi extension ABI or provider ABI.',
  'Future platform/native policy is not denied. It is deferred until pi extension compliance, package surface clarity, default/runtime ownership, and package delivery decisions are complete.',
]

const REQUIRED_DISTANCE = [
  '## Distance / Framing',
  'Current pi extension compliance and product fit are approximately 65–75%.',
  'If v0.6.35 completes, pi extension compliance and product fit can move to approximately 80–88%.',
  'Native/default prerequisite evidence remains approximately 55–60%.',
  'The normal-user native helper availability claim remains 0%.',
  'Default Go remains blocked.',
  'TypeScript fallback deletion remains blocked.',
  'v0.6.35 advances pi extension/package-surface confidence, not native helper delivery, default resolver approval, default Go approval, or fallback deletion approval.',
]

const REQUIRED_FACTS = [
  '## Current Package / Extension Facts',
  'package name is `pi-agentteam`.',
  'package version is `0.6.8`.',
  'package module type is `module`.',
  '`package.json#pi.extensions` is exactly `["./index.ts"]`.',
  '`package.json` currently has no `main`, `exports`, or `types` field.',
  '`index.ts` exports the default extension factory `agentTeamExtension(pi: ExtensionAPI): void`.',
  '`index.ts` is the pi TypeScript extension entrypoint and not a broad public barrel API.',
  'package remains a TypeScript/pi facade and control plane.',
  'pi core packages imported by AgentTeam remain peer dependencies when imported, following pi package docs.',
  'expected peer dependencies are `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox`, each with `"*"` range.',
  'there is no native Go pi extension/provider ABI claim.',
  'Go remains a bounded helper behind the TypeScript adapter only.',
]

const REQUIRED_ROUTES = [
  '## Route Evaluation A–F',
  'Route A — pi extension compliance/package surface audit plus guards: main route.',
  'Route B — temp package install/load proof for the TypeScript/pi facade: supporting later slice.',
  'It must not run in Slice 1.',
  'Route C — command/tool surface contract and no native UI expansion: supporting later slice.',
  'It must not be implemented in Slice 1.',
  'Route D — native helper default/package resolver: deferred.',
  'It must not implement default Go, default resolver, package discovery, or `go-packaged-preview` default behavior.',
  'Route E — second-platform matrix: explicitly deferred per user feedback.',
  'No second-platform matrix row, workflow expansion, or availability claim is part of v0.6.35 Slice 1.',
  'Route F — hosted tag backlog: policy only/deferred.',
  'Workers must not query, trigger, fetch, or record hosted workflow state.',
]

const REQUIRED_SELECTED = [
  '## Selected Route',
  'Selected route for v0.6.35 is Route A: pi extension compliance/package surface audit plus guards.',
  'Supporting later work is limited to Route B and Route C after separate assignments:',
  'Route B may later prove temp package install/load for the TypeScript/pi facade.',
  'Route C may later guard command/tool surface and native UI non-expansion.',
  'Route D, Route E, and Route F implementation remains deferred.',
  'v0.6.35 Slice 1 does not start temp install/load smoke, command/tool surface changes, package surface minimization work, runtime mode boundary work, final checkpoint work, hosted tag work, or native platform work.',
]

const REQUIRED_SLICES = [
  '## Planned v0.6.35 Slices',
  'Slice 1 — contract doc/guard.',
  'Slice 2 — temp install/load smoke for TypeScript/pi facade.',
  'Slice 3 — command/tool surface contract guard.',
  'Slice 4 — package files/surface minimization/no native artifacts guard.',
  'Slice 5 — runtime mode boundary guard from pi extension perspective.',
  'Slice 6 — final checkpoint/tag policy.',
  'Blocked future slices must not be implemented early.',
]

const REQUIRED_STOP = [
  '## STOP / No-Availability Wording',
  'Allowed wording for v0.6.35 Slice 1 is limited to pi extension compliance, package surface contract, TypeScript/pi facade, manifest clarity, peer dependency posture, control-plane surface review, docs/tests-only guard, and prerequisite framing.',
  'No second-platform matrix row.',
  'No second-platform workflow expansion.',
  '`package.json` remains `0.6.8`.',
  'No `package.json` changes.',
  'No `main`, `exports`, or `types` field addition.',
  'No package metadata, package files native entries, `optionalDependencies`, native dependencies, bundled native packages, lifecycle hooks, `postinstall`, `preinstall`, download, or install-time build.',
  'No `package-lock.json`, `npm-shrinkwrap.json`, `go.mod`, or `go.sum`.',
  'No checked-in artifacts, native binaries, tarballs, release assets, generated signatures, generated attestations, raw hosted records, raw API payloads, downloaded bundles, generated manifests, checksums, provenance, or verifier output.',
  'No default Go approval.',
  'No default resolver approval.',
  'No production package discovery.',
  'No `go-cutover` semantic changes.',
  'No `go-packaged-preview` default behavior.',
  'No TypeScript fallback deletion approval.',
  'No hidden fallback rollback approval.',
  'No `compactReadModelFingerprint` cutover approval.',
  'No readiness/UI/tool/native-default/release controls expansion.',
  'No broad Go authority over pi extension lifecycle, commands, tools, UI, tmux execution/capture, worker lifecycle, task/report/PlanRun governance, full-text boundaries, state, mailbox, package/release, or report access.',
  'No native Go pi extension/provider ABI claim.',
  'No package release approval.',
  'No install source approval.',
  'No release asset approval.',
  'No signing, cosign, SLSA, or security attestation approval.',
  'No normal-user native helper availability claim beyond 0%.',
  'No `npm version`, `npm publish`, `git tag`, `git push`, `gh`, token, hosted workflow query/fetch/trigger, network, commit, or push by the worker.',
  'Do not describe v0.6.35 Slice 1 as native helper delivery, normal-user native availability, package-manager native delivery, package release approval, install source approval, release asset approval, default resolver approval, default Go approval, fallback deletion approval, native Go pi extension ABI, native provider ABI, signing approval, cosign proof, SLSA proof, or second-platform support.',
]

const REQUIRED_GUARD = [
  '## Guard Contract',
  'tests/suites/go-kernel-v0635-pi-extension-compliance-contract-docs.cjs',
  'this doc exists and includes pivot rationale, distance/framing, current package/extension facts, Route A–F evaluation, selected route, planned slices, STOP/no-availability wording, and guard contract.',
  '`.gitignore` allowlists this v0.6.35 doc.',
  '`package.json#pi.extensions` is exactly `["./index.ts"]`.',
  'package name, version, and module type remain `pi-agentteam`, `0.6.8`, and `module`.',
  '`package.json` does not add `main`, `exports`, or `types` without future approval.',
  '`index.ts` exports the default extension factory and does not become a broad public barrel/named API surface.',
  'peer dependencies include expected pi core packages and `typebox` with `"*"` ranges.',
  'package metadata, dependencies, native deps, optional native deps, package files, lifecycle hooks, lockfiles, Go modules, and checked-in artifacts remain absent/unchanged.',
  'docs do not overclaim native Go pi extension/provider ABI, normal-user native availability, default Go/default resolver, fallback deletion, second-platform support, package/release/install-source approval, release asset approval, or signing/security approval.',
  'runtime, workflow, readiness, tool/control-plane, and package artifact guardrails remain unchanged at a basic level.',
]

const REQUIRED_VALIDATION = [
  '## Slice 1 Validation',
  '`node --check tests/suites/go-kernel-v0635-pi-extension-compliance-contract-docs.cjs`.',
  'direct focused guard suite.',
  '`npm run -s check:boundaries`.',
  '`git diff --check`.',
  'Do not run npm pack/install, temp install/load smoke, build review artifact commands, hosted workflow queries, `gh`, token/network commands, npm version/publish, commits, tags, or pushes in Slice 1.',
]

const FORBIDDEN_DOC_CLAIMS = [
  'native Go pi extension ABI is approved',
  'native Go pi extension ABI is implemented',
  'native provider ABI is approved',
  'native provider ABI is implemented',
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'native helper delivery is complete',
  'package-manager native delivery is complete',
  'package release is approved',
  'package/release approval is granted',
  'install source is approved',
  'release asset is approved',
  'signing is approved',
  'signing proof is complete',
  'cosign is approved',
  'cosign proof is complete',
  'SLSA is approved',
  'SLSA proof is complete',
  'security attestation is approved',
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'second platform support is approved',
  'second platform is supported',
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

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_PIVOT) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_DISTANCE) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_FACTS) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROUTES) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_SELECTED) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_SLICES) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_STOP) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_GUARD) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_VALIDATION) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_CLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not embed raw hosted/artifact/verifier JSON bodies`)
}

function assertGitignore(root) {
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
}

function assertPackageManifest(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.type, 'module')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'], 'pi.extensions must remain exact TypeScript extension entrypoint')
  for (const field of ['main', 'exports', 'types']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  }
  for (const [name, range] of Object.entries(EXPECTED_PEERS)) {
    assert.equal(packageJson.peerDependencies?.[name], range, `${name} must remain peer dependency ${range}`)
  }
  assert.deepEqual(Object.keys(packageJson.dependencies || {}).sort(), [], 'runtime dependencies must not be added in Slice 1')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native/package metadata ${key}`)
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
}

function assertIndexSurface(root) {
  const source = read(root, 'index.ts')
  assertIncludes(source, "import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'", 'index.ts')
  assertIncludes(source, 'export default function agentTeamExtension(pi: ExtensionAPI): void {', 'index.ts')
  assertIncludes(source, 'registerAgentTeamCommands(pi, {', 'index.ts')
  assertIncludes(source, 'registerAgentTeamTools(pi, {', 'index.ts')
  assert.equal(/export\s+(?:\*|\{)/.test(source), false, 'index.ts must not become barrel export surface')
  assert.equal(/export\s+(?:const|let|var|class|interface|type|enum)\s+/m.test(source), false, 'index.ts must not add named public API declarations')
  const exportedFunctions = [...source.matchAll(/export\s+(?:default\s+)?function\s+([A-Za-z0-9_]+)/g)].map(match => match[1])
  assert.deepEqual(exportedFunctions, ['agentTeamExtension'], 'index.ts must export only the default extension factory')
  assert.equal(/registerProvider|native provider|native ABI|go extension ABI|default Go is enabled|default resolver is enabled|npm\s+(?:publish|version)|gh\s+release|cosign|slsa|postinstall|preinstall|curl\b|wget\b/i.test(source), false, 'index.ts must not add provider/native/release/default behavior')
}

function assertRuntimeWorkflowReadinessInvariants(root) {
  const kernel = read(root, 'core/kernel.ts')
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  const runtimeSources = `${kernel}\n${resolver}`
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel explicit preview gate')
  assertIncludes(kernel, "const cutoverRequested = requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel cutover modes')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'kernel fingerprint TS fallback')
  assert.equal(/package\.json|node_modules|import\.meta\.url|__dirname|process\.cwd\(\)/i.test(kernel), false, 'kernel must not discover installed package layout by default')
  assert.equal(/native pi extension|provider ABI|registerProvider|download-artifact|hosted-observation|workflow-run|cosign|slsa|signature|signed availability/i.test(runtimeSources), false, 'runtime/resolver must not add native provider/signing/hosted behavior')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|postinstall|preinstall|install-time build|curl\b|wget\b|node-gyp|prebuild/i.test(runtimeSources), false, 'runtime/resolver must not contain release/npm/download/install behavior')

  assertWorkflowContract(root)
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only review artifact workflow should exist')
  const workflow = readWorkflow(root)
  assertIncludes(workflow, 'permissions:\n  contents: read', 'review workflow permissions')
  assertIncludes(workflow, `target: ${REQUIRED_MATRIX_TARGET}`, 'review workflow target')
  assert.equal(/id-token:\s*write|packages:\s*write|contents:\s*write|attestations:\s*write|cosign|slsa|gh\s+(?:release|attestation)|npm\s+(?:publish|version|pack)|curl\b|wget\b|postinstall|preinstall/i.test(workflow), false, 'workflow must not add release/signing/download/package behavior')
  assert.equal(/target:\s*(?!linux-x64-glibc\b)[a-z0-9-]+/i.test(workflow), false, 'workflow must not add second platform target')

  const readiness = read(root, 'commands/readiness.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'readiness text')
  assert.equal(/native pi extension|provider ABI|second platform|default Go|default resolver|package release|release asset|install source|signed availability/i.test(readiness.replace('not normal-user native availability proof', '')), false, 'readiness must not expand native/default/release UI')

  const toolSources = walkFiles(path.join(root, 'tools'))
    .filter(file => file.endsWith('.ts'))
    .map(file => read(root, toRel(root, file)))
    .join('\n')
  for (const name of EXPECTED_TOOLS) assertIncludes(toolSources, `name: '${name}'`, 'tool registrations')
  assert.equal(/native pi extension|provider ABI|second platform|native availability|release asset|npm publish|package artifact|\bsigning\b|\bcosign\b|\bSLSA\b|artifact download|install source|default Go|default resolver/i.test(toolSources), false, 'tools must not add native/release/signing/package/default control plane')
}

function assertNoRepoArtifacts(root) {
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain temp npm tarballs')

  const generatedNames = /(?:^|\/)(?:.*\.(?:sig|sigstore|pem|key|crt|cert|p7s|minisig)|.*(?:signature|signed|cosign|slsa|release-bundle|release-asset|attestation|attestations|agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|package-artifact|workflow-summary|verifier-output|hosted-observation-record|workflow-run|raw-payload|api-payload)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|sigstore|bundle|intoto|md))$/i
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('tests/fixtures/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => !rel.startsWith('scripts/lib/go-helper-hosted-observation-record.cjs'))
    .filter(rel => !rel.startsWith('scripts/verify-go-helper-hosted-observation-record.cjs'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in artifacts/native binaries/tarballs/signatures/attestations/raw records')
}

module.exports = {
  name: 'Go kernel v0.6.35 pi extension compliance contract docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertGitignore(root)
    assertPackageManifest(root)
    assertIndexSurface(root)
    assertRuntimeWorkflowReadinessInvariants(root)
    assertNoRepoArtifacts(root)
  },
}
