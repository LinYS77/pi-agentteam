const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md'
const SUITE = 'tests/suites/go-kernel-v0636-ts-pi-default-go-authority-boundary.cjs'
const PACKAGE_VERSION = '0.6.8'
const EXPECTED_TOOLS = [
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
]
const CONTROL_PLANE_FILES = [
  'api/commands.ts',
  'api/tools.ts',
  'commands/team.ts',
  'commands/readiness.ts',
  'tools/team.ts',
  'tools/message.ts',
  'tools/task.ts',
  'tools/planRun.ts',
]
const KERNEL_TS_FILES = [
  'core/kernel.ts',
  'core/kernelPackagedResolver.ts',
]
const REQUIRED_DOC = [
  '## Slice 5 — TS/Pi Facade Authority Boundary For Future Default Path',
  'Slice 5 guards the TypeScript/pi facade authority boundary for any future default-Go path.',
  '`tests/suites/go-kernel-v0636-ts-pi-default-go-authority-boundary.cjs`',
  'Product and control-plane authority remains owned by the TypeScript pi extension facade even if a future default-Go path is considered.',
  '`package.json#pi.extensions` remains exactly `["./index.ts"]`.',
  '`index.ts` remains the default extension factory and registers commands, tools, renderers, and hooks through TypeScript imports.',
  '`index.ts` remains narrow and does not become a broad public barrel or native/default/release API surface.',
  'Go authority remains bounded to the helper/kernel seam behind the TypeScript adapter for `tmuxSnapshotParse`.',
  'Go must not own pi extension lifecycle, commands, tools, UI, renderers, hooks, tmux capture or execution, worker lifecycle, task/report/PlanRun governance, package/release authority, state/mailbox/report full-text access, or `compactReadModelFingerprint` cutover.',
  '`kernel/go/agentteam-kernel/main.go` remains a stdio JSON-RPC helper and must not include pi registration, tmux execution or shell ownership, state/mailbox/task/report/package/release ownership, hosted workflow control, token use, package publishing, or native/default control-plane APIs.',
  '`core/kernel.ts` and `core/kernelPackagedResolver.ts` must not import pi APIs or expose product UI/control-plane registration.',
  '`api/commands.ts`, `api/tools.ts`, command files, tool files, and readiness files must not expose native/default/release controls.',
  'Runtime/default boundaries remain unchanged: default/unset stays TypeScript/non-native, `go-cutover` is explicit, `go-packaged-preview` is explicit-only, and no default resolver discovery is added.',
  '`compactReadModelFingerprint` remains TypeScript fallback/non-cutover.',
  'STOP gates for Slice 5: no command additions, no tool additions, no readiness expansion, no Go import path into pi API registration, no state/mailbox/report full-text authority expansion, no model-callable native/release/default tool, no default Go, no default resolver, no `go-cutover` behavior change, no `go-packaged-preview` behavior change, no package/native delivery, no hosted workflow action, no release/tag/publish action, and no Slice 6+ work.',
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'Go owns pi extension lifecycle',
  'Go owns commands',
  'Go owns tools',
  'Go owns renderers',
  'Go owns hooks',
  'Go owns tmux execution',
  'Go owns worker lifecycle',
  'Go owns task governance',
  'Go owns report governance',
  'Go owns PlanRun governance',
  'Go owns package release',
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'fallback deletion is approved',
  'package release is approved',
  'install source is approved',
  'release asset is approved',
  'signing is approved',
  'cosign is approved',
  'SLSA is approved',
  'security attestation is approved',
  'second-platform support is approved',
  'second platform support is approved',
]
const FORBIDDEN_CONTROL_TERMS = /\b(?:default Go|default resolver|go-packaged-preview|go-cutover|PI_AGENTTEAM_KERNEL|native helper|native package|package-manager native|normal-user native availability UI|release asset|install source|signing|cosign|SLSA|platform matrix|second platform|download artifact|artifact download|package publish|npm publish|npm version|package native controls|default-disable|defaultDisable|DEFAULT_DISABLE)\b/i
const GO_FORBIDDEN_TERMS = /\b(?:RegisterCommand|registerCommand|RegisterTool|registerTool|registerMessageRenderer|ExtensionAPI|pi-coding-agent|pi-tui|tmux\s+(?:capture|send|kill|new|split|display)|exec\.Command\s*\(|shell|bash|sh -c|package-lock|npm publish|npm version|gh release|GITHUB_TOKEN|STATE|MAILBOX|REPORT|PLANRUN|PlanRun|TaskReport|mailbox|task report|release asset|install source|cosign|SLSA|default resolver|default Go|PI_AGENTTEAM_KERNEL)\b/i
const KERNEL_TS_FORBIDDEN_PI_TERMS = /@earendil-works\/pi-|registerCommand|registerTool|registerMessageRenderer|pi\.on|new Box\(|new Text\(|openTeamPanel|registerAgentTeamCommands|registerAgentTeamTools|registerAgentTeamRenderers|registerSessionHooks|registerContextHooks|registerAgentHooks|agentteam_create|agentteam_task|agentteam_planrun|agentteam_receive|agentteam_send/i
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]
const FORBIDDEN_ARTIFACT = /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig)$/i
const FORBIDDEN_GENERATED_RECORD = /(?:^|\/)(?:artifact-index|generated-manifest|checksum|checksums|sha256sums|provenance|attestation|hosted-observation|raw-record|release-bundle|release-asset|signature-material)(?:[-_.\/]|$)/i
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'
const ALLOWED_REVIEW_RECORDS = new Set([
  '.github/workflows/go-helper-review-artifact.yml',
  'scripts/build-go-helper-artifact.cjs',
  'scripts/lib/go-helper-artifact-builder.cjs',
  'scripts/lib/go-helper-artifact-verifier.cjs',
  'scripts/lib/go-helper-clean-install-proof.cjs',
  'scripts/lib/go-helper-hosted-observation-record.cjs',
  'scripts/verify-go-helper-artifact.cjs',
  'scripts/verify-go-helper-clean-install-proof.cjs',
  'scripts/verify-go-helper-hosted-observation-record.cjs',
])

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
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

function assertPackagePiFacade(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.type, 'module')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
  for (const field of ['main', 'exports', 'types']) assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  assert.deepEqual(Object.keys(packageJson.dependencies || {}).sort(), [], 'dependencies must remain empty or absent')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish', 'prepack', 'postpack']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define lifecycle script ${lifecycle}`)
  }
}

function assertIndexFacade(root) {
  const index = read(root, 'index.ts')
  assertIncludes(index, "import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'", 'index.ts')
  assertIncludes(index, "import { registerSessionHooks } from './hooks/session.js'", 'index.ts')
  assertIncludes(index, "import { registerContextHooks } from './hooks/context.js'", 'index.ts')
  assertIncludes(index, "import { registerAgentHooks } from './hooks/agent.js'", 'index.ts')
  assertIncludes(index, "import { registerToolGuardHooks } from './hooks/toolGuard.js'", 'index.ts')
  assertIncludes(index, "import { registerAgentTeamCommands } from './api/commands.js'", 'index.ts')
  assertIncludes(index, "import { registerAgentTeamTools } from './api/tools.js'", 'index.ts')
  assertIncludes(index, "import { registerAgentTeamRenderers } from './renderers.js'", 'index.ts')
  assertIncludes(index, 'export default function agentTeamExtension(pi: ExtensionAPI): void', 'index.ts')
  assertIncludes(index, 'registerBeforeAgentStartPolicy(pi)', 'index.ts')
  assertIncludes(index, 'registerAgentTeamRenderers(pi)', 'index.ts')
  assertIncludes(index, 'registerToolGuardHooks(pi)', 'index.ts')
  assertIncludes(index, 'registerSessionHooks(pi, {', 'index.ts')
  assertIncludes(index, 'registerContextHooks(pi, {', 'index.ts')
  assertIncludes(index, 'registerAgentHooks(pi, {', 'index.ts')
  assertIncludes(index, 'registerAgentTeamCommands(pi, {', 'index.ts')
  assertIncludes(index, 'registerAgentTeamTools(pi, {', 'index.ts')
  assert.equal(/^export\s+(?:function|const|class|type|interface)\s+/m.test(index), false, 'index.ts must not expose named public barrel exports')
  assert.equal(/from ['"].*kernel\/go|from ['"].*core\/kernel|createAgentTeamKernelAdapter|spawnSync|go-packaged-preview|go-cutover|PI_AGENTTEAM_KERNEL|native helper|release asset|npm publish|gh release/i.test(index), false, 'index.ts must not expose native/default/release authority')
}

function assertTypeScriptControlPlane(root) {
  const commandsApi = read(root, 'api/commands.ts')
  assertIncludes(commandsApi, 'export function registerAgentTeamCommands(pi: ExtensionAPI, deps: CommandHandlerDeps): void', 'api/commands.ts')
  assertIncludes(commandsApi, 'registerTeamCommands(pi, deps)', 'api/commands.ts')
  const toolsApi = read(root, 'api/tools.ts')
  assertIncludes(toolsApi, 'export function registerAgentTeamTools(pi: ExtensionAPI, deps: ToolHandlerDeps): void', 'api/tools.ts')
  assertIncludes(toolsApi, 'registerTeamTools(pi, deps)', 'api/tools.ts')
  assertIncludes(toolsApi, 'registerMessageTools(pi, deps)', 'api/tools.ts')
  assertIncludes(toolsApi, 'registerTaskTools(pi, deps)', 'api/tools.ts')
  assertIncludes(toolsApi, 'registerPlanRunTools(pi, deps)', 'api/tools.ts')

  const teamCommand = read(root, 'commands/team.ts')
  assertIncludes(teamCommand, "pi.registerCommand('team'", 'commands/team.ts')
  assertIncludes(teamCommand, "const options = ['config init', 'config show', 'config validate', 'config migrate --dry-run', 'readiness']", 'commands/team.ts')
  assert.equal((teamCommand.match(/pi\.registerCommand\(/g) || []).length, 1, 'only /team command should be registered')

  const toolNames = []
  for (const rel of ['tools/team.ts', 'tools/message.ts', 'tools/task.ts', 'tools/planRun.ts']) {
    const source = read(root, rel)
    for (const match of source.matchAll(/name:\s*'([^']+)'/g)) toolNames.push(match[1])
  }
  assert.deepEqual(toolNames.sort(), EXPECTED_TOOLS.slice().sort(), 'model-callable tool surface should remain unchanged')

  const readiness = read(root, 'commands/readiness.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'commands/readiness.ts')
  assertIncludes(readiness, "return args.trim().toLowerCase() === 'readiness'", 'commands/readiness.ts')
  assert.equal(/default Go is enabled|default resolver is enabled|normal-user native helper availability is proven|package release is approved|install source is approved/i.test(readiness), false, 'readiness must not overclaim native/default/release availability')

  for (const rel of CONTROL_PLANE_FILES) {
    const source = read(root, rel)
    assert.equal(FORBIDDEN_CONTROL_TERMS.test(source), false, `${rel} must not expose native/default/release controls`)
  }
}

function assertGoAuthorityBounded(root) {
  const goSource = read(root, 'kernel/go/agentteam-kernel/main.go')
  assertIncludes(goSource, 'package main', 'kernel/go/agentteam-kernel/main.go')
  assertIncludes(goSource, 'var capabilities = []string{"health", "profile", "tmuxSnapshotParse", "tmuxSnapshotCapture", "compactReadModelFingerprint"}', 'kernel/go/agentteam-kernel/main.go')
  assertIncludes(goSource, 'case "tmuxSnapshotParse":', 'kernel/go/agentteam-kernel/main.go')
  assertIncludes(goSource, 'BusinessPathsConnected: false', 'kernel/go/agentteam-kernel/main.go')
  assertIncludes(goSource, '"scope":                                "skeleton-only",', 'kernel/go/agentteam-kernel/main.go')
  assertIncludes(goSource, '"stateConnected":                       false,', 'kernel/go/agentteam-kernel/main.go')
  assertIncludes(goSource, '"tmuxConnected":                        false,', 'kernel/go/agentteam-kernel/main.go')
  assertIncludes(goSource, '"panelConnected":                       false,', 'kernel/go/agentteam-kernel/main.go')
  assertIncludes(goSource, '"taskReportPlanRunConnected":           false,', 'kernel/go/agentteam-kernel/main.go')
  assertIncludes(goSource, 'FullTextIncluded:  false,', 'kernel/go/agentteam-kernel/main.go')
  assertIncludes(goSource, 'StateFilesRead:    false,', 'kernel/go/agentteam-kernel/main.go')
  assertIncludes(goSource, 'StateFilesWritten: false,', 'kernel/go/agentteam-kernel/main.go')
  assert.equal(GO_FORBIDDEN_TERMS.test(goSource), false, 'Go helper must not own pi/control-plane/package/release/full-text authority')
  assert.equal(/os\.Stdin|os\.Stdout/.test(goSource), true, 'Go helper should remain stdio JSON-RPC')
}

function assertKernelAdapterBoundaries(root) {
  const kernel = read(root, 'core/kernel.ts')
  assertIncludes(kernel, "export type AgentTeamKernelKnownMode = 'default' | 'disabled' | 'typescript' | 'go' | 'auto' | 'go-cutover' | 'go-packaged-preview'", 'core/kernel.ts')
  assertIncludes(kernel, "if (!raw || raw === 'default') return 'default'", 'core/kernel.ts')
  assertIncludes(kernel, "if (raw === 'none' || raw === 'off' || raw === 'disabled') return 'disabled'", 'core/kernel.ts')
  assertIncludes(kernel, "const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)", 'core/kernel.ts')
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'core/kernel.ts')
  assertIncludes(kernel, "const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure", 'core/kernel.ts')
  assertIncludes(kernel, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'core/kernel.ts')
  assertIncludes(kernel, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const", 'core/kernel.ts')
  assertIncludes(kernel, "const startupFallback = cutoverRequested ? undefined : initialFallback", 'core/kernel.ts')
  assertIncludes(kernel, "callHelper<unknown>('tmuxSnapshotParse', { stdout, capturedAt })", 'core/kernel.ts')
  assertIncludes(kernel, 'if (cutoverRequested || !fallback) return cutoverUnavailableSnapshot(capturedAt)', 'core/kernel.ts')
  assertIncludes(kernel, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'core/kernel.ts')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'core/kernel.ts')
  assert.equal(/AGENTTEAM_KERNEL_CUTOVER_MODULE\s*=\s*'compactReadModelFingerprint'/.test(kernel), false, 'compactReadModelFingerprint must not become cutover module')
  assert.equal(/node_modules|package\.json|process\.cwd\(\)|require\.resolve|import\.meta\.resolve/i.test(kernel), false, 'kernel must not discover installed package layout by default')
  assert.equal(KERNEL_TS_FORBIDDEN_PI_TERMS.test(kernel), false, 'kernel adapter must not import/expose pi product control-plane')

  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  assertIncludes(resolver, "export const AGENTTEAM_PACKAGED_RESOLVER_MODULE = 'tmuxSnapshotParse'", 'core/kernelPackagedResolver.ts')
  assertIncludes(resolver, 'export const AGENTTEAM_PACKAGED_RESOLVER_BUSINESS_PATHS_CONNECTED = false', 'core/kernelPackagedResolver.ts')
  assert.equal(/PI_AGENTTEAM_KERNEL|PI_AGENTTEAM_KERNEL_HELPER|AGENTTEAM_GO_KERNEL_HELPER|process\.env/i.test(resolver), false, 'packaged resolver must not read mode env or enable default discovery')
  assert.equal(KERNEL_TS_FORBIDDEN_PI_TERMS.test(resolver), false, 'packaged resolver must not import/expose pi product control-plane')
}

function assertHookRendererOwnership(root) {
  const index = read(root, 'index.ts')
  for (const rel of ['hooks/session.ts', 'hooks/context.ts', 'hooks/agent.ts', 'hooks/toolGuard.ts']) {
    const source = read(root, rel)
    assertIncludes(source, 'ExtensionAPI', rel)
    assert.equal(/createAgentTeamKernelAdapter|kernel\/go|PI_AGENTTEAM_KERNEL|go-packaged-preview|go-cutover|native helper|release asset/i.test(source), false, `${rel} must not expose native/default/release authority`)
  }
  const renderers = read(root, 'renderers.ts')
  assertIncludes(renderers, "import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'", 'renderers.ts')
  assertIncludes(renderers, "import { Box, Text } from '@earendil-works/pi-tui'", 'renderers.ts')
  assertIncludes(renderers, "pi.registerMessageRenderer('agentteam-leader-attention'", 'renderers.ts')
  assertIncludes(renderers, "pi.registerMessageRenderer('agentteam-mailbox'", 'renderers.ts')
  assert.equal(/createAgentTeamKernelAdapter|kernel\/go|PI_AGENTTEAM_KERNEL|go-packaged-preview|go-cutover|native helper|release asset/i.test(renderers), false, 'renderers must not expose native/default/release authority')
  assertIncludes(index, 'registerAgentTeamRenderers(pi)', 'index.ts')
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not embed raw hosted/artifact/verifier JSON bodies`)
}

function assertWorkflowInvariants(root) {
  const workflowsRoot = path.join(root, '.github', 'workflows')
  const workflows = fs.readdirSync(workflowsRoot).filter(name => name.endsWith('.yml') || name.endsWith('.yaml')).sort()
  assert.deepEqual(workflows, ['go-helper-review-artifact.yml'], 'only review-artifact workflow should exist')
  const workflow = read(root, '.github/workflows/go-helper-review-artifact.yml')
  assert.equal((workflow.match(/target:\s+linux-x64-glibc/g) || []).length, 2, 'review workflow should keep one linux-x64-glibc target in each build/verify matrix')
  assert.equal(/target:\s+(?!linux-x64-glibc\b)[a-z0-9-]+/i.test(workflow), false, 'review workflow must not add second-platform target rows')
  assert.equal(/macos-|windows-|arm64|musl|darwin|win32/i.test(workflow), false, 'review workflow must not add second-platform runner/platform terms')
}

function assertArtifactInvariants(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain pi-agentteam temp tarballs')
  const forbiddenArtifacts = []
  const forbiddenRecords = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && !rel.startsWith('docs/') && !rel.startsWith('tests/') && !ALLOWED_REVIEW_RECORDS.has(rel) && FORBIDDEN_GENERATED_RECORD.test(rel)) forbiddenRecords.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved checked-in native/archive/signing artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain unapproved generated manifests/checksums/provenance/attestation/raw release records outside docs/tests/review helper areas')
}

module.exports = {
  name: 'Go kernel v0.6.36 TS/pi default-Go authority boundary',
  async run(env) {
    const root = env.helpers.extRoot
    assertPackagePiFacade(root)
    assertIndexFacade(root)
    assertTypeScriptControlPlane(root)
    assertGoAuthorityBounded(root)
    assertKernelAdapterBoundaries(root)
    assertHookRendererOwnership(root)
    assertDoc(root)
    assertWorkflowInvariants(root)
    assertArtifactInvariants(root)
    assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  },
}
