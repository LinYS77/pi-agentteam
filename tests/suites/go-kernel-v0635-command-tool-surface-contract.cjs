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
const EXPECTED_COMMANDS = ['team']
const EXPECTED_TOOLS = [
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
]
const TOOL_FILES = [
  'tools/team.ts',
  'tools/message.ts',
  'tools/task.ts',
  'tools/planRun.ts',
]
const COMMAND_FILES = [
  'commands/team.ts',
  'commands/readiness.ts',
  'commands/config.ts',
  'commands/teamActions.ts',
  'api/commands.ts',
]
const FORBIDDEN_CONTROL_TERMS = /\b(?:npm\s+(?:publish|version)|git\s+(?:tag|push)|gh\s+(?:workflow|release|attestation)|release asset approval|release asset is approved|install source approval|install source is approved|signing approval|signing is approved|cosign|SLSA|security attestation approved|default Go (?:enable|enabled|approval|approved)|default resolver (?:enable|enabled|approval|approved)|native platform matrix|second platform|native pi provider|native provider ABI|native pi extension ABI|package manager control|package-control|install-source|download artifact|hosted workflow query|hosted workflow trigger|package release approval)\b/i
const FORBIDDEN_TOOL_TERMS = /\b(?:native helper delivery|native package delivery|normal-user native availability|default Go|default resolver|go-packaged-preview default|go-cutover change|package publish|npm publish|npm version|release asset|install source|signing|cosign|SLSA|security attestation|platform matrix|second platform|download artifact|hosted workflow|provider ABI|native pi extension|package-manager native delivery)\b/i
const REQUIRED_DOC = [
  '## Slice 3 — Command / Tool Surface Contract and No Native UI / Control Expansion',
  'Slice 3 guards the pi-visible command/tool surface exposed by the TypeScript extension facade.',
  'It is docs/tests only and does not change real command/tool registration, production behavior, package metadata, runtime mode behavior, readiness behavior, workflow behavior, release behavior, signing behavior, or native helper behavior.',
  'The expected stable pi command set is `/team` only.',
  '`/team` is registered through `index.ts` → `api/commands.ts` → `commands/team.ts` TypeScript modules.',
  '`/team` remains an AgentTeam console/config/readiness command for team coordination and reviewer diagnostics.',
  '`/team` is not a native helper command, package manager command, release command, signing command, default Go command, default resolver command, install-source command, or platform-matrix command.',
  '`/team readiness` remains explicit compact reviewer diagnostics: `Explicit reviewer readiness summary; not normal-user native availability proof.`',
  '`/team readiness` must not become product availability UI, normal-user native availability UI, default Go UI, default resolver UI, package/release UI, signing UI, or native platform UI.',
  'The expected stable tool set is `agentteam_create`, `agentteam_spawn`, `agentteam_send`, `agentteam_receive`, `agentteam_task`, and `agentteam_planrun`.',
  'Tools remain team coordination, teammate spawning, typed communication, mailbox receive, task/report history workflow, and explicit PlanRun record workflow.',
  'Tool names, descriptions, schemas, prompt snippets, and prompt guidelines must not expose native/default/release/package/signing/platform/install-source/download/artifact control planes.',
  'No tool name may add native, default Go, default resolver, release, package publish/version, signing, cosign, SLSA, platform matrix, install-source, download, artifact, hosted workflow, or provider ABI authority.',
  '`package.json#pi.extensions` remains exactly `["./index.ts"]`.',
  '`index.ts` remains the single pi extension entry and registers commands/tools/renderers/hooks through TypeScript imports.',
  '`api/commands.ts` imports command registration from TypeScript command modules only.',
  '`api/tools.ts` imports tool registration from TypeScript tool modules only.',
  'Go/kernel code must not register pi commands, tools, renderers, providers, package controls, release controls, or default/native UI controls.',
  'Command/tool registration imports must not route through Go helper code, native helper artifact code, package resolver code, hosted workflow code, or release/signing code.',
  'No real command/tool registration change.',
  'No package native delivery proof.',
  'No default Go approval or enablement.',
  'No default resolver approval or enablement.',
  'No `go-cutover` or `go-packaged-preview` behavior change.',
  'No TypeScript fallback deletion or `compactReadModelFingerprint` cutover.',
  'No native UI, default UI, release UI, package-control UI, signing UI, install-source UI, platform-matrix UI, or broad Go authority expansion.',
  'Slice 3 does not prove package native delivery, default Go, fallback deletion, or second-platform support.',
  'Do not start Slice 4 package surface minimization or Slice 5 runtime mode boundary work in Slice 3.',
  'tests/suites/go-kernel-v0635-command-tool-surface-contract.cjs',
  '`node --check tests/suites/go-kernel-v0635-command-tool-surface-contract.cjs`.',
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

function stringLiteralNames(source, pattern) {
  return [...source.matchAll(pattern)].map(match => match[1]).sort()
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const forbidden of [
    'native helper delivery is complete',
    'native package delivery is complete',
    'normal-user native helper availability is proven',
    'default Go is enabled',
    'default resolver is enabled',
    'fallback deletion is approved',
    'package release is approved',
    'install source is approved',
    'release asset is approved',
    'signing is approved',
    'cosign is approved',
    'SLSA is approved',
    'second platform support is approved',
  ]) {
    assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  }
}

function assertPackageAndFacade(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.type, 'module')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
  for (const field of ['main', 'exports', 'types']) assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)

  const index = read(root, 'index.ts')
  assertIncludes(index, 'export default function agentTeamExtension(pi: ExtensionAPI): void {', 'index.ts')
  assertIncludes(index, "import { registerAgentTeamCommands } from './api/commands.js'", 'index.ts')
  assertIncludes(index, "import { registerAgentTeamTools } from './api/tools.js'", 'index.ts')
  assertIncludes(index, "import { registerAgentTeamRenderers } from './renderers.js'", 'index.ts')
  assertIncludes(index, "import { registerSessionHooks } from './hooks/session.js'", 'index.ts')
  assertIncludes(index, "import { registerContextHooks } from './hooks/context.js'", 'index.ts')
  assertIncludes(index, "import { registerAgentHooks } from './hooks/agent.js'", 'index.ts')
  assertIncludes(index, "import { registerToolGuardHooks } from './hooks/toolGuard.js'", 'index.ts')
  assertIncludes(index, 'registerAgentTeamCommands(pi, {', 'index.ts')
  assertIncludes(index, 'registerAgentTeamTools(pi, {', 'index.ts')
  assert.equal(/registerProvider|native provider|native ABI|go extension ABI|default Go is enabled|default resolver is enabled|npm\s+(?:publish|version)|gh\s+release|cosign|slsa/i.test(index), false, 'index.ts must not expose native/default/release/provider behavior')

  const apiCommands = read(root, 'api/commands.ts')
  assertIncludes(apiCommands, "import { registerTeamCommands } from '../commands/team.js'", 'api/commands.ts')
  assert.equal(/kernel|go-helper|kernelPackagedResolver|artifact|release|signing|cosign|slsa|native|provider/i.test(apiCommands), false, 'api/commands.ts must stay TS command facade only')

  const apiTools = read(root, 'api/tools.ts')
  for (const expected of [
    "import { registerTeamTools } from '../tools/team.js'",
    "import { registerMessageTools } from '../tools/message.js'",
    "import { registerTaskTools } from '../tools/task.js'",
    "import { registerPlanRunTools } from '../tools/planRun.js'",
  ]) assertIncludes(apiTools, expected, 'api/tools.ts')
  assert.equal(/kernel|go-helper|kernelPackagedResolver|artifact|release|signing|cosign|slsa|native provider|provider ABI/i.test(apiTools), false, 'api/tools.ts must stay TS tool facade only')
}

function assertCommandSurface(root) {
  const teamSource = read(root, 'commands/team.ts')
  const commandNames = stringLiteralNames(teamSource, /registerCommand\('([^']+)'/g)
  assert.deepEqual(commandNames, EXPECTED_COMMANDS, 'registered command names must remain stable')
  assertIncludes(teamSource, "description: 'Open the agentteam console. Use /team config init|show|validate|migrate --dry-run for subagent model config, or /team readiness for explicit compact diagnostics readiness.'", 'commands/team.ts')
  assertIncludes(teamSource, "const options = ['config init', 'config show', 'config validate', 'config migrate --dry-run', 'readiness']", 'commands/team.ts')
  assert.equal(FORBIDDEN_CONTROL_TERMS.test(teamSource), false, '/team command source must not expose native/default/release/package/signing controls')

  const readiness = read(root, 'commands/readiness.ts')
  assertIncludes(readiness, '[agentteam readiness] tmuxSnapshotParse compact diagnostics', 'commands/readiness.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'commands/readiness.ts')
  const readinessWithoutBoundary = readiness.replace('not normal-user native availability proof', '')
  assert.equal(/product availability|normal-user native availability UI|default Go|default resolver|package release|release asset|install source|signing|cosign|SLSA|second platform|native platform|package-manager native delivery/i.test(readinessWithoutBoundary), false, 'readiness must stay reviewer/transitional diagnostics only')

  for (const rel of COMMAND_FILES) {
    const source = read(root, rel)
    assert.equal(/npm\s+(?:publish|version)|git\s+(?:tag|push)|gh\s+(?:workflow|release|attestation)|release asset approval|install source approval|signing approval|cosign|SLSA|security attestation approved|default Go enabled|default resolver enabled|native platform matrix|native provider ABI|native pi extension ABI/i.test(source), false, `${rel} must not expose native/default/release/signing controls`)
  }
}

function toolMetadataBlocks(source) {
  return [...source.matchAll(/pi\.registerTool\(\{([\s\S]*?)\n\s*\}\)/g)].map(match => match[1])
}

function assertToolSurface(root) {
  const combined = TOOL_FILES.map(rel => read(root, rel)).join('\n')
  const toolNames = stringLiteralNames(combined, /name:\s*'([^']+)'/g).filter(name => name.startsWith('agentteam_')).sort()
  assert.deepEqual(toolNames, EXPECTED_TOOLS.slice().sort(), 'registered tool names must remain stable')

  const blocks = TOOL_FILES.flatMap(rel => toolMetadataBlocks(read(root, rel)).map(block => ({ rel, block })))
  assert.equal(blocks.length, EXPECTED_TOOLS.length, 'expected exactly six agentteam tool registrations')
  for (const expected of EXPECTED_TOOLS) assert.ok(combined.includes(`name: '${expected}'`), `tool must be registered: ${expected}`)

  for (const { rel, block } of blocks) {
    assertIncludes(block, 'description:', rel)
    assertIncludes(block, 'promptSnippet:', rel)
    assertIncludes(block, 'promptGuidelines:', rel)
    const metadataOnly = block
      .replace(/[\s\S]*?async execute[\s\S]*/m, '')
      .replace(/report_done|report_blocked|TaskReport|TaskMessageRef|package root|package roots|source label such as npm test/g, '')
    assert.equal(FORBIDDEN_TOOL_TERMS.test(metadataOnly), false, `${rel} tool metadata must not expose native/default/release/package/signing/platform controls`)
  }

  for (const name of toolNames) {
    assert.equal(/native|default|release|package|signing|cosign|slsa|platform|install|download|artifact|provider/i.test(name), false, `tool name must not expose native/default/release/package/signing/platform control: ${name}`)
  }

  assertIncludes(combined, 'Create a shared agent team attached to the current leader session.', 'tools/team.ts')
  assertIncludes(combined, 'Send typed communication to one teammate, a task owner, or explicit broadcast within the current team.', 'tools/message.ts')
  assertIncludes(combined, 'Leader-gated shared task workflow plus read-only task/report history queries.', 'tools/task.ts')
  assertIncludes(combined, 'Explicitly approve and inspect compact PlanRun records.', 'tools/planRun.ts')
}

function assertGoKernelNoPiRegistration(root) {
  const files = [
    ...walkFiles(path.join(root, 'kernel')).filter(file => /\.(?:go|ts|js)$/i.test(file)),
    ...walkFiles(path.join(root, 'core')).filter(file => /\.(?:ts|js)$/i.test(file)),
  ]
  const refs = []
  for (const file of files) {
    const rel = toRel(root, file)
    const source = fs.readFileSync(file, 'utf8')
    for (const token of ['registerCommand', 'registerTool', 'registerMessageRenderer', 'registerProvider', 'ExtensionAPI', 'pi.register']) {
      if (source.includes(token)) refs.push([rel, token])
    }
  }
  assert.deepEqual(refs, [], 'Go/kernel/core code must not register pi commands/tools/renderers/providers')
}

function assertRuntimeWorkflowPackageBoundaries(root) {
  const runtimeSources = ['core/kernel.ts', 'core/kernelPackagedResolver.ts']
    .filter(rel => exists(root, rel))
    .map(rel => read(root, rel))
    .join('\n')
  assertIncludes(runtimeSources, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'core/kernel.ts')
  assertIncludes(runtimeSources, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'core/kernel.ts')
  assertIncludes(runtimeSources, 'if (cutoverRequested) return fallback(compactInput)', 'core/kernel.ts')
  assert.equal(/registerCommand|registerTool|registerMessageRenderer|registerProvider|npm\s+(?:publish|version)|gh\s+release|cosign|slsa|default Go is enabled|default resolver is enabled/i.test(runtimeSources), false, 'runtime/kernel must not expose pi/default/release/signing control plane')

  assertWorkflowContract(root)
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only review artifact workflow should exist')
  const workflow = readWorkflow(root)
  assertIncludes(workflow, 'permissions:\n  contents: read', 'review workflow permissions')
  assertIncludes(workflow, `target: ${REQUIRED_MATRIX_TARGET}`, 'review workflow target')
  assert.equal(/id-token:\s*write|packages:\s*write|contents:\s*write|attestations:\s*write|gh\s+(?:release|attestation)|npm\s+(?:publish|version|pack)|cosign|slsa|curl\b|wget\b|postinstall|preinstall/i.test(workflow), false, 'workflow must not add release/signing/package/native UI behavior')

  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
}

module.exports = {
  name: 'Go kernel v0.6.35 command/tool surface contract',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertPackageAndFacade(root)
    assertCommandSurface(root)
    assertToolSurface(root)
    assertGoKernelNoPiRegistration(root)
    assertRuntimeWorkflowPackageBoundaries(root)
  },
}
