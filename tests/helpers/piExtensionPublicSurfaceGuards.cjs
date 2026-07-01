const assert = require('node:assert/strict')
const path = require('node:path')
const {
  EXPECTED_COMMANDS,
  EXPECTED_HOOK_EVENTS,
  EXPECTED_RENDERERS,
  EXPECTED_TOOLS,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  compactFailure,
} = require('../../scripts/lib/pi-extension-install-load-proof.cjs')
const {
  assertIncludes,
  existsRel,
  readJsonRel,
  readRel,
  walkFiles,
  toRel,
} = require('./fsAssertions.cjs')
const {
  APPROVED_EMBEDDED_NATIVE_FILES,
  assertPackageFilesDoNotBroaden,
  assertPackageManifestGovernance,
} = require('./packageReleaseGovernanceGuards.cjs')
const { APPROVED_NATIVE_ROOT } = require('./nativeGuards.cjs')

const PI_EXTENSION_PUBLIC_SURFACE_GUARD_HELPER = 'tests/helpers/piExtensionPublicSurfaceGuards.cjs'
const PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE = 'tests/suites/pi-extension-public-surface-install-load-guard.cjs'

const PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES = Object.freeze([
  'pi-extension-entrypoint-metadata-stable',
  'public-facade-export-surface-contained',
  'command-tool-registration-schema-stable',
  'mailbox-report-read-boundaries-explicit',
  'team-panel-compact-read-boundary',
  'worker-delivery-bridge-only',
  'no-model-callable-readiness-native-release-tools',
  'package-surface-install-load-proof-bounded',
  'install-load-evidence-registry-proof-only',
  'go-native-provider-assumption-absent',
  'approved-embedded-helper-path-preserved',
  'pi-extension-supporting-suite-evidence',
])

const PI_EXTENSION_PUBLIC_SURFACE_CATEGORY_DESCRIPTIONS = Object.freeze({
  'pi-extension-entrypoint-metadata-stable': 'package.json remains pi-agentteam 0.6.8 module with exactly ./index.ts as the pi extension entrypoint, peer-only pi dependencies, no main/exports/types broadening, and no lifecycle/native/release package metadata.',
  'public-facade-export-surface-contained': 'index.ts remains the single default TypeScript/pi extension factory that composes commands, tools, renderers, and hooks without broad named/barrel exports or native/provider/default/release behavior.',
  'command-tool-registration-schema-stable': 'The pi-visible command/tool surface remains /team plus the six agentteam coordination/workflow tools, with stable schema/action vocabulary and no native/default/release/package/signing/provider controls.',
  'mailbox-report-read-boundaries-explicit': 'Full mailbox text stays behind agentteam_receive and full TaskReport text stays behind agentteam_task action=report; list/show/history/report summaries remain compact by default.',
  'team-panel-compact-read-boundary': '/team and the TUI panel render compact mailbox/task/report previews and explicit read-boundary hints, not full mailbox bodies or report bodies.',
  'worker-delivery-bridge-only': 'Worker delivery remains bridge-only through outbox/bridge request paths, and worker prompts continue to require explicit agentteam_receive / report_done or report_blocked boundaries.',
  'no-model-callable-readiness-native-release-tools': 'No model-callable tools are added for readiness, native helpers, default Go/default resolver, package/release, signing, install-source, downloads, artifacts, or provider ABI authority.',
  'package-surface-install-load-proof-bounded': 'The pi extension install/load proof script remains temp/review-only, scripts-ignored, local tarball/stub-pi facade loading with redacted diagnostics, cleanup by default, and no native/default/release claim.',
  'install-load-evidence-registry-proof-only': 'The v0.6.36 install/load evidence registry references accepted local evidence only, reruns no proofs, generates no artifacts, and keeps package/default/native/release/signing/platform claims false.',
  'go-native-provider-assumption-absent': 'Go/kernel/native helper sources do not register pi commands/tools/renderers/providers or assume a native pi extension/provider ABI; Go remains a bounded helper behind TypeScript seams.',
  'approved-embedded-helper-path-preserved': 'The only packaged native helper surface remains the approved embedded tmuxSnapshotParse linux-x64-glibc files/path; package/native/default metadata is not broadened.',
  'pi-extension-supporting-suite-evidence': 'Current non-deleted supporting public-surface, command/tool, package-surface, runtime-boundary, install/load, and evidence-registry suites/scripts remain present outside historical checkpoint docs suites.',
})

const PI_EXTENSION_PUBLIC_SURFACE_SOURCE_FILES = Object.freeze([
  'package.json',
  'index.ts',
  'api/commands.ts',
  'api/tools.ts',
  'commands/team.ts',
  'commands/readiness.ts',
  'renderers.ts',
  'hooks/session.ts',
  'hooks/context.ts',
  'hooks/agent.ts',
  'hooks/toolGuard.ts',
  'tools/team.ts',
  'tools/message.ts',
  'tools/task.ts',
  'tools/planRun.ts',
  'tools/messageService.ts',
  'tools/messageReceive.ts',
  'tools/taskService.ts',
  'tools/teamService.ts',
  'tools/workerSpawnService.ts',
  'tools/workerPrompt.ts',
  'workerTurnPrompt.ts',
  'app/messageReceiveApplication.ts',
  'app/taskReadCommands.ts',
  'teamPanel/layout.ts',
  'deliveryPolicy.ts',
  'runtime/bridgeDeliveryPump.ts',
  'adapters/bridge/delivery.ts',
  'core/kernel.ts',
  'core/kernelPackagedResolver.ts',
  'kernel/go/agentteam-kernel/main.go',
  'scripts/lib/pi-extension-install-load-proof.cjs',
  'scripts/verify-pi-extension-install-load.cjs',
  'tests/fixtures/kernel/v0636/readinessEvidenceRegistry.cjs',
])

const PI_EXTENSION_PUBLIC_SURFACE_SUPPORTING_SUITES = Object.freeze([
  'tests/suites/public-surface-facade.cjs',
  'tests/suites/package-install-smoke.cjs',
  'tests/suites/commands.cjs',
  'tests/suites/tools-state.cjs',
  'tests/suites/service-mailbox-receive-projection.cjs',
  'tests/suites/service-task-report-workflow.cjs',
  'tests/suites/go-kernel-v0635-command-tool-surface-contract.cjs',
  'tests/suites/go-kernel-v0635-package-surface-minimization.cjs',
  'tests/suites/go-kernel-v0635-pi-extension-install-load-smoke.cjs',
  'tests/suites/go-kernel-v0635-runtime-mode-boundaries.cjs',
  'tests/suites/go-kernel-v0636-install-load-evidence-registry.cjs',
])

const PI_EXTENSION_PUBLIC_SURFACE_SUPPORTING_DOCS = Object.freeze([
  'docs/perf/v0.6.35-pi-extension-compliance-package-surface.md',
  'docs/perf/v0.6.35-pi-extension-compliance-package-surface-checkpoint.md',
  'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md',
])

const EXPECTED_TOOL_NAMES = Object.freeze([
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
])

const EXPECTED_PEERS = Object.freeze({
  '@earendil-works/pi-ai': '*',
  '@earendil-works/pi-coding-agent': '*',
  '@earendil-works/pi-tui': '*',
  typebox: '*',
})

const FORBIDDEN_PUBLIC_CONTROL_PATTERN = /\b(?:npm\s+(?:publish|version)|git\s+(?:tag|push)|gh\s+(?:release|workflow|attestation)|release asset|install source|signing approval|signing is approved|cosign|SLSA|security attestation|default Go (?:enabled|approved)|default resolver (?:enabled|approved)|native pi extension ABI|native provider ABI|package-manager native delivery|normal-user native availability is proven|download artifact|hosted workflow trigger|package release approval)\b/i
const FORBIDDEN_TOOL_NAME_PATTERN = /(?:readiness|native|default|release|package|publish|signing|cosign|slsa|platform|install|download|artifact|provider|workflow)/i
const FORBIDDEN_REGISTER_SURFACE_PATTERN = /registerProvider|native provider|provider ABI|native pi extension ABI|default Go is enabled|default resolver is enabled|npm\s+(?:publish|version)|gh\s+release|cosign|slsa|postinstall|preinstall|curl\b|wget\b/i

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function assertSameSet(actual, expected, label) {
  assert.deepEqual(sorted(actual), sorted(expected), `${label} should match exactly`)
}

function assertEveryFileExists(root, files, label) {
  for (const rel of files) assert.equal(existsRel(root, rel), true, `${rel} should exist for ${label}`)
}

function matchAllStrings(source, pattern) {
  return [...String(source).matchAll(pattern)].map(match => match[1]).sort((a, b) => a.localeCompare(b))
}

function packageFileSet(packageJson) {
  return new Set((packageJson.files || []).map(entry => String(entry).replace(/\\/g, '/').replace(/^\.\//, '')))
}

function sourceWithoutAllowedBoundaryPhrases(source) {
  return String(source)
    .replace(/not normal-user native availability proof/g, '')
    .replace(/source label such as npm test or CI/g, '')
    .replace(/package root can load from a temp installed package shape/g, '')
}

function assertPackageEntrypointMetadataStable(root) {
  const packageJson = assertPackageManifestGovernance(root)
  assert.equal(packageJson.name, PACKAGE_NAME, 'package name should stay pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version should stay 0.6.8')
  assert.equal(packageJson.type, 'module', 'package type should stay module')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'], 'pi extension entrypoint should stay exact')
  assert.deepEqual(packageJson.peerDependencies, EXPECTED_PEERS, 'peer dependencies should stay pi/typebox peer-only surface')
  assert.deepEqual(Object.keys(packageJson.dependencies || {}).sort(), [], 'runtime dependencies should remain absent')
  for (const field of ['main', 'exports', 'types']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package must not add ${field}`)
  }
  assertPackageFilesDoNotBroaden(packageJson)
  return packageJson
}

function assertPublicFacadeExportSurfaceContained(root, env) {
  const index = readRel(root, 'index.ts')
  assertIncludes(index, "import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'", 'index.ts')
  for (const expected of [
    "import { registerAgentTeamCommands } from './api/commands.js'",
    "import { registerAgentTeamTools } from './api/tools.js'",
    "import { registerAgentTeamRenderers } from './renderers.js'",
    "import { registerSessionHooks } from './hooks/session.js'",
    "import { registerContextHooks } from './hooks/context.js'",
    "import { registerAgentHooks } from './hooks/agent.js'",
    "import { registerToolGuardHooks } from './hooks/toolGuard.js'",
    'export default function agentTeamExtension(pi: ExtensionAPI): void {',
    'registerAgentTeamCommands(pi, {',
    'registerAgentTeamTools(pi, {',
  ]) assertIncludes(index, expected, 'index.ts')
  assert.equal(/^export\s+(?!default\s+function\s+agentTeamExtension\b)/m.test(index), false, 'index.ts must not add named/barrel exports')
  assert.deepEqual(matchAllStrings(index, /^export\s+(?:default\s+)?function\s+([A-Za-z0-9_]+)/gm), ['agentTeamExtension'], 'index.ts should export only the default extension factory')
  assert.equal(FORBIDDEN_REGISTER_SURFACE_PATTERN.test(index), false, 'index.ts must not expose provider/native/default/release behavior')

  const indexModule = env.helpers.requireDist('index.js')
  assert.deepEqual(Object.keys(indexModule).sort(), ['default'], 'compiled index facade should export default only')

  const apiTools = readRel(root, 'api/tools.ts')
  const apiCommands = readRel(root, 'api/commands.ts')
  assertIncludes(apiCommands, "import { registerTeamCommands } from '../commands/team.js'", 'api/commands.ts')
  assertIncludes(apiCommands, 'export function registerAgentTeamCommands', 'api/commands.ts')
  for (const expected of [
    "import { registerTeamTools } from '../tools/team.js'",
    "import { registerMessageTools } from '../tools/message.js'",
    "import { registerTaskTools } from '../tools/task.js'",
    "import { registerPlanRunTools } from '../tools/planRun.js'",
    'export function registerAgentTeamTools',
  ]) assertIncludes(apiTools, expected, 'api/tools.ts')
  assert.deepEqual(apiTools.match(/^export\s+/gm), ['export '], 'api/tools.ts should expose one composition export')
  assert.deepEqual(apiCommands.match(/^export\s+/gm), ['export '], 'api/commands.ts should expose one composition export')
  for (const [rel, source] of [['api/tools.ts', apiTools], ['api/commands.ts', apiCommands]]) {
    assert.equal(/kernel|go-helper|kernelPackagedResolver|artifact|release|signing|cosign|slsa|native provider|provider ABI|registerProvider/i.test(source), false, `${rel} must stay TypeScript facade composition only`)
  }
}

function assertCommandToolRegistrationSchemaStable(root, env) {
  const registeredCommands = [...env.pi.__commands.keys()].sort()
  assert.deepEqual(registeredCommands.filter(name => name.startsWith('team')), EXPECTED_COMMANDS, 'pi command surface should remain /team only')

  const registeredTools = [...env.pi.__tools.keys()].filter(name => name.startsWith('agentteam_')).sort()
  assert.deepEqual(registeredTools, EXPECTED_TOOL_NAMES.slice().sort(), 'pi model-callable tool surface should remain exactly the six agentteam tools')
  assert.deepEqual(EXPECTED_TOOLS.slice().sort(), EXPECTED_TOOL_NAMES.slice().sort(), 'install-load proof expected tool list should match public tool surface')

  const teamSource = readRel(root, 'commands/team.ts')
  assert.deepEqual(matchAllStrings(teamSource, /registerCommand\('([^']+)'/g), ['team'], '/team command registration should stay stable')
  assertIncludes(teamSource, "const options = ['config init', 'config show', 'config validate', 'config migrate --dry-run', 'readiness']", 'commands/team.ts')
  assertIncludes(teamSource, 'handleTeamConfigCommand(args, ctx)', 'commands/team.ts')
  assertIncludes(teamSource, 'handleTeamReadinessCommand(args, ctx)', 'commands/team.ts')
  assertIncludes(teamSource, 'openTeamPanel(ctx, teamName)', 'commands/team.ts')
  assert.equal(FORBIDDEN_PUBLIC_CONTROL_PATTERN.test(teamSource), false, '/team command must not expose native/default/release/package controls')

  const toolSources = [
    'tools/team.ts',
    'tools/message.ts',
    'tools/task.ts',
    'tools/planRun.ts',
  ].map(rel => readRel(root, rel)).join('\n')
  assert.deepEqual(matchAllStrings(toolSources, /name:\s*'([^']+)'/g).filter(name => name.startsWith('agentteam_')).sort(), EXPECTED_TOOL_NAMES.slice().sort(), 'tool source names should remain stable')
  for (const expected of [
    'Create a shared agent team attached to the current leader session.',
    'Create a teammate in a tmux pane for the current session-attached team.',
    'Send typed communication to one teammate, a task owner, or explicit broadcast within the current team.',
    'Receive unread mailbox messages for the current team member. This is the full-text mailbox read boundary',
    'Leader-gated shared task workflow plus read-only task/report history queries.',
    'Explicitly approve and inspect compact PlanRun records.',
    'StringEnum(MESSAGE_TYPES)',
    'StringEnum(TASK_STATUSES',
    'StringEnum(TEAM_TASK_ACTIONS)',
    'StringEnum(PLAN_RUN_ACTIONS)',
  ]) assertIncludes(toolSources, expected, 'tool registration sources')
  assertIncludes(readRel(root, 'core/publicModel.ts'), "const TASK_STATUSES = Object.freeze(['open', 'blocked', 'done'] as const)", 'core/publicModel.ts')
  assertIncludes(readRel(root, 'core/publicModel.ts'), "const MESSAGE_TYPES = Object.freeze(['assignment', 'question', 'inform'] as const)", 'core/publicModel.ts')
  assertIncludes(readRel(root, 'core/publicModel.ts'), "const TASK_REPORT_TYPES = Object.freeze(['report_done', 'report_blocked'] as const)", 'core/publicModel.ts')
  assertIncludes(readRel(root, 'core/taskActions.ts'), "'report_done', 'report_blocked'", 'core/taskActions.ts')
  assertIncludes(readRel(root, 'core/planRunActions.ts'), "['approve', 'show', 'list', 'advance', 'pause', 'resume', 'cancel', 'signal_failure', 'check_limits']", 'core/planRunActions.ts')

  const metadataBlocks = [...toolSources.matchAll(/pi\.registerTool\(\{([\s\S]*?)\n\s*\}\)/g)].map(match => match[1])
  assert.equal(metadataBlocks.length, EXPECTED_TOOL_NAMES.length, 'expected exactly six tool registration blocks')
  for (const block of metadataBlocks) {
    assertIncludes(block, 'description:', 'tool metadata')
    assertIncludes(block, 'promptSnippet:', 'tool metadata')
    assertIncludes(block, 'promptGuidelines:', 'tool metadata')
    assert.equal(FORBIDDEN_PUBLIC_CONTROL_PATTERN.test(sourceWithoutAllowedBoundaryPhrases(block)), false, 'tool metadata must not expose native/default/release/package controls')
  }
}

function assertMailboxReportReadBoundariesExplicit(root) {
  const messageTool = readRel(root, 'tools/message.ts')
  assertIncludes(messageTool, 'agentteam_receive', 'tools/message.ts')
  assertIncludes(messageTool, 'This is the full-text mailbox read boundary', 'tools/message.ts')
  assertIncludes(messageTool, 'details.messages keeps full returned messages unchanged', 'tools/message.ts')
  assertIncludes(messageTool, 'Use agentteam_receive when a teammate likely sent actionable updates', 'tools/message.ts')

  const receiveApp = readRel(root, 'app/messageReceiveApplication.ts')
  for (const expected of [
    'details.messages contains the full returned mailbox messages',
    'details.hydratedReports contains hydrated task-report bodies when referenced',
    'messages: returned',
    'hydratedReports',
    'Report text:',
    'function formatGroupedMessages',
    'function formatFullMessageItem',
  ]) assertIncludes(receiveApp, expected, 'app/messageReceiveApplication.ts')
  assert.match(receiveApp, /const limit = Math\.max\(1, Math\.min\(50, Math\.floor\(params\.limit \?\? 8\)\)\)/, 'receive limit should stay bounded')
  assertIncludes(receiveApp, 'deps.mailboxRepository.markDelivered(team.name, recipient, returnedIds)', 'app/messageReceiveApplication.ts')
  assertIncludes(receiveApp, 'deps.mailboxRepository.markRead(team.name, recipient, returnedIds)', 'app/messageReceiveApplication.ts')
  assertIncludes(receiveApp, 'deps.taskHistory.findTaskReport(team, reportId)', 'app/messageReceiveApplication.ts')

  const taskTool = readRel(root, 'tools/task.ts')
  assertIncludes(taskTool, 'show/history/reports/report', 'tools/task.ts')
  assertIncludes(taskTool, 'one full TaskReport body without changing task state', 'tools/task.ts')
  assertIncludes(taskTool, 'Non-leader action=report_done is only for the current task owner', 'tools/task.ts')
  const taskRead = readRel(root, 'app/taskReadCommands.ts')
  for (const expected of [
    'Use action=report reportId=<id> for full report text.',
    'Report text:',
    'report.text',
    'details: {',
    'text: report.text',
    'compactTaskReport(report)',
  ]) assertIncludes(taskRead, expected, 'app/taskReadCommands.ts')
  assertIncludes(readRel(root, 'app/taskApplication.ts'), "if (params.action === 'report')", 'app/taskApplication.ts')
}

function assertTeamPanelCompactReadBoundary(root) {
  const teamPanel = readRel(root, 'teamPanel/layout.ts')
  for (const expected of [
    "renderDetailField(theme, 'Full text', 'agentteam_receive({ markRead: true })'",
    "renderDetailField(theme, 'Panel', 'compact only; does not mark delivered/read'",
    "renderDetailField(theme, 'Full report', `agentteam_task action=report reportId=${history.latestReport.id}`",
    'function compactMailboxSummary',
    'function renderPanelReportSummary',
    'short(renderPanelReportSummary(history.latestReport)',
  ]) assertIncludes(teamPanel, expected, 'teamPanel/layout.ts')
  assert.equal(/Report text:|message\.text|report\.text|readMailbox\(|markRead\(|agentteam_task action=report_done/.test(teamPanel), false, 'team panel layout must not render full bodies or mutate read state')

  const teamCommand = readRel(root, 'commands/team.ts')
  assertIncludes(teamCommand, 'openTeamPanel(ctx, teamName)', 'commands/team.ts')
  assert.equal(/readMailbox\(|findTaskReport\(|report\.text|message\.text|agentteam_receive\(/.test(teamCommand), false, '/team command shell must not become a full-text reader')
}

function assertWorkerDeliveryBridgeOnly(root) {
  const deliveryPolicy = readRel(root, 'deliveryPolicy.ts')
  assertIncludes(deliveryPolicy, "export type AgentTeamDeliveryPolicyName = 'bridge-only'", 'deliveryPolicy.ts')
  assertIncludes(deliveryPolicy, "export const BRIDGE_ONLY_DELIVERY_POLICY: AgentTeamDeliveryPolicyName = 'bridge-only'", 'deliveryPolicy.ts')
  assertIncludes(deliveryPolicy, 'export const DEFAULT_DELIVERY_POLICY: AgentTeamDeliveryPolicyName = BRIDGE_ONLY_DELIVERY_POLICY', 'deliveryPolicy.ts')
  for (const legacy of ['terminal', 'tmux', 'send-keys', 'paste-buffer', 'runtimeWake']) {
    assert.equal(new RegExp(`['"]${legacy}['"]`).test(deliveryPolicy), false, `delivery policy must not expose ${legacy}`)
  }

  const bridgeDelivery = readRel(root, 'adapters/bridge/delivery.ts')
  const bridgePump = readRel(root, 'runtime/bridgeDeliveryPump.ts')
  for (const [rel, source] of [['adapters/bridge/delivery.ts', bridgeDelivery], ['runtime/bridgeDeliveryPump.ts', bridgePump]]) {
    assert.equal(/send-keys|paste-buffer|display-message|writeToPane|terminal transport/i.test(source), false, `${rel} must not use terminal transport for worker delivery`)
    assertIncludes(source, 'bridge', rel)
  }

  const spawn = readRel(root, 'tools/workerSpawnService.ts')
  assertIncludes(spawn, 'requestInitialSpawnDeliveryThroughOutbox', 'tools/workerSpawnService.ts')
  assertIncludes(spawn, "kind: 'worker_delivery_requested'", 'tools/workerSpawnService.ts')
  assertIncludes(spawn, "reason: 'initial spawn task'", 'tools/workerSpawnService.ts')
  assert.equal(/send-keys|paste-buffer|writeToPane|agentteam_send\(|pushMailboxMessage/.test(spawn), false, 'worker spawn must not bypass bridge/outbox delivery for initial work')

  const workerPrompt = readRel(root, 'tools/workerPrompt.ts')
  assertIncludes(workerPrompt, 'Coordinate through agentteam_send and agentteam_task', 'tools/workerPrompt.ts')
  assertIncludes(workerPrompt, 'call agentteam_receive when you need full inbox/mailbox details', 'tools/workerPrompt.ts')
  assertIncludes(workerPrompt, 'final result must use report_done/report_blocked', 'tools/workerPrompt.ts')
  const turnPrompt = readRel(root, 'workerTurnPrompt.ts')
  assertIncludes(turnPrompt, 'function renderAssignedTaskWithMessages', 'workerTurnPrompt.ts')
  assertIncludes(turnPrompt, 'formatTaskMessageSignal', 'workerTurnPrompt.ts')
  assertIncludes(turnPrompt, 'task messages:', 'workerTurnPrompt.ts')
  assertIncludes(turnPrompt, 'Report contract: finish with', 'workerTurnPrompt.ts')
  assertIncludes(turnPrompt, 'agentteam_task action=report_done', 'workerTurnPrompt.ts')
}

function assertNoModelCallableReadinessNativeReleaseTools(root, env) {
  const toolNames = [...env.pi.__tools.keys()].sort()
  assert.deepEqual(toolNames.filter(name => FORBIDDEN_TOOL_NAME_PATTERN.test(name)), [], 'no model-callable readiness/native/default/release/package/signing/provider tools')
  const toolSources = [
    'api/tools.ts',
    'tools/team.ts',
    'tools/message.ts',
    'tools/task.ts',
    'tools/planRun.ts',
  ].map(rel => sourceWithoutAllowedBoundaryPhrases(readRel(root, rel))).join('\n')
  assert.equal(/readiness tool|native helper delivery|package publish|npm publish|npm version|release asset|install source|signing approval|cosign proof|SLSA proof|default Go enabled|default resolver enabled|provider ABI|native pi extension ABI|hosted workflow trigger|download artifact/i.test(toolSources), false, 'tool sources must not expose forbidden public control surfaces')
  assert.equal(/registerReadinessTool|registerNative|registerRelease|registerProvider|registerPackage/i.test(toolSources), false, 'api tools must not register forbidden tool families')
}

function assertPackageSurfaceInstallLoadProofBounded(root) {
  const packageJson = assertPackageEntrypointMetadataStable(root)
  const files = packageFileSet(packageJson)
  for (const required of ['index.ts', 'types.ts', 'api/', 'commands/', 'tools/', 'hooks/', 'teamPanel/', 'renderers.ts', 'README.md', 'LICENSE']) {
    assert.equal(files.has(required), true, `package files should include TypeScript/pi facade surface ${required}`)
  }
  for (const forbidden of ['docs/', 'tests/', 'scripts/', '.github/', 'kernel/', 'package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum']) {
    assert.equal(files.has(forbidden), false, `package files should not include local/dev/release surface ${forbidden}`)
  }

  const script = readRel(root, 'scripts/lib/pi-extension-install-load-proof.cjs')
  for (const expected of [
    "const RESULT_MARKER = 'pi-extension-install-load-smoke'",
    "const PACKAGE_VERSION = '0.6.8'",
    "'temp-npm-install-load-ts-pi-facade'",
    "spawnNpm(['pack', repoRoot, '--ignore-scripts', '--pack-destination', packRoot, '--json'], repoRoot)",
    "'--package-lock=false'",
    "'--legacy-peer-deps'",
    'writePeerDependencyStubs(distRoot)',
    'loaded.default(stub.api)',
    'cleanupWorkspace(workspace)',
    'pathsRedacted: true',
    'rawNpmStdoutIncluded: false',
    'rawNpmStderrIncluded: false',
    'nativePackageDelivery: false',
    'normalUserNativeAvailability: false',
    'defaultGo: false',
    'defaultResolver: false',
    'fallbackDeletion: false',
    'releaseAsset: false',
    'installSource: false',
    'packageManagerNativeDelivery: false',
    'networkRequired: false',
    'providersRegisteredDuringLoad: stub.providerRegistrations.length',
  ]) assertIncludes(script, expected, 'scripts/lib/pi-extension-install-load-proof.cjs')
  assert.equal(/execFile\(|execSync\(|spawnSync\(['"]go['"]|spawnSync\(['"]tmux['"]|spawnSync\(['"]gh['"]|spawnSync\(['"]curl['"]|spawnSync\(['"]wget['"]|spawnSync\(['"]cosign['"]/.test(script), false, 'pi extension install/load proof must not execute native/release/signing/network tools')
  assert.equal(/npm\s+publish|npm\s+version|gh\s+release|git\s+tag|git\s+push/.test(script), false, 'pi extension install/load proof must not contain release commands')

  const diagnostic = compactFailure('npm-pack-failed', 'rerun npm pack pi extension proof locally with scripts ignored', 'npm-pack', { exitCode: 1 })
  assert.equal(diagnostic.ok, false)
  assert.equal(diagnostic.resultMarker, 'fail-closed')
  assert.equal(diagnostic.reviewOnly, true)
  assert.equal(diagnostic.prototype, true)
  assert.equal(diagnostic.piExtensionFacadeLoad, false)
  assert.equal(diagnostic.nativePackageDelivery, false)
  assert.equal(diagnostic.normalUserNativeAvailability, false)
  assert.equal(diagnostic.defaultGo, false)
  assert.equal(diagnostic.fallbackDeletion, false)
  assert.equal(diagnostic.pathsRedacted, true)
  assert.equal(diagnostic.rawNpmOutputIncluded, false)
  assert.equal(diagnostic.stackIncluded, false)

  const cli = readRel(root, 'scripts/verify-pi-extension-install-load.cjs')
  assertIncludes(cli, 'runPiExtensionInstallLoadProof(options)', 'scripts/verify-pi-extension-install-load.cjs')
  assertIncludes(cli, "if (arg === '--json')", 'scripts/verify-pi-extension-install-load.cjs')
  assertIncludes(cli, "if (arg === '--keep-temp')", 'scripts/verify-pi-extension-install-load.cjs')
  assertIncludes(cli, "if (arg === '--repo-root')", 'scripts/verify-pi-extension-install-load.cjs')
  assert.equal(/npm\s+(?:publish|version)|gh\s+release|git\s+(?:tag|push)|cosign|slsa|curl\b|wget\b/.test(cli), false, 'pi extension verify CLI must not expose release/signing/network mechanics')
}

function assertInstallLoadEvidenceRegistryProofOnly(root) {
  const registry = require('../fixtures/kernel/v0636/readinessEvidenceRegistry.cjs')
  const { readinessEvidenceRegistry, readinessEvidenceEntries } = registry
  assert.equal(readinessEvidenceRegistry.schemaVersion, 1)
  assert.equal(readinessEvidenceRegistry.theme, 'v0.6.36 install/load evidence registry')
  for (const field of [
    'availabilityClaim',
    'defaultGoEvidence',
    'defaultResolverEvidence',
    'normalUserNativeAvailability',
    'nativePackageDelivery',
    'packageManagerNativeDelivery',
    'packageReleaseEvidence',
    'installSourceEvidence',
    'releaseAssetEvidence',
    'signingEvidence',
    'fallbackDeletionEvidence',
    'secondPlatformSupport',
    'rerunsProofs',
    'generatesArtifacts',
  ]) assert.equal(readinessEvidenceRegistry[field], false, `readiness evidence registry ${field} must remain false`)
  assert.equal(readinessEvidenceEntries.length, 2, 'registry should keep only accepted local v0.6.33/v0.6.35 evidence entries')
  const v0635 = readinessEvidenceEntries.find(entry => entry.id === 'v0635-ts-pi-facade-install-load')
  assert.ok(v0635, 'registry should include v0.6.35 TypeScript/pi facade install-load evidence')
  assert.equal(v0635.evidenceKind, 'temp package install/load for TypeScript/pi extension facade with stubbed pi API')
  assert.equal(v0635.reviewOnly, true)
  assert.equal(v0635.prototype, true)
  assert.equal(v0635.localOnly, true)
  assert.equal(v0635.nativePackageDelivery, false)
  assert.equal(v0635.normalUserNativeAvailability, false)
  assert.equal(v0635.defaultGoEvidence, false)
  assert.equal(v0635.defaultResolverEvidence, false)
  assert.equal(v0635.fallbackDeletionEvidence, false)
  for (const ref of [
    'docs/perf/v0.6.35-pi-extension-compliance-package-surface.md',
    'docs/perf/v0.6.35-pi-extension-compliance-package-surface-checkpoint.md',
    'scripts/lib/pi-extension-install-load-proof.cjs',
    'scripts/verify-pi-extension-install-load.cjs',
    'tests/suites/go-kernel-v0635-pi-extension-install-load-smoke.cjs',
  ]) {
    assert.ok(v0635.references.includes(ref), `v0.6.35 evidence should reference ${ref}`)
    assert.equal(existsRel(root, ref), true, `${ref} should exist for install-load evidence registry`)
  }

  const registrySource = readRel(root, 'tests/fixtures/kernel/v0636/readinessEvidenceRegistry.cjs')
  const productionSource = [
    'index.ts',
    'api/tools.ts',
    'api/commands.ts',
    'commands/team.ts',
    'commands/readiness.ts',
    'tools/team.ts',
    'tools/message.ts',
    'tools/task.ts',
    'tools/planRun.ts',
    'app/taskApplication.ts',
    'teamPanel/layout.ts',
    'renderers.ts',
  ].map(rel => readRel(root, rel)).join('\n')
  assertIncludes(registrySource, "id: 'v0635-ts-pi-facade-install-load'", 'readinessEvidenceRegistry.cjs')
  assert.equal(/readinessEvidenceRegistry|readinessEvidenceEntries|v0635-ts-pi-facade-install-load/.test(productionSource), false, 'production source must not import/read v0.6.36 install-load evidence registry')
}

function assertGoNativeProviderAssumptionAbsent(root) {
  const goSource = readRel(root, 'kernel/go/agentteam-kernel/main.go')
  assert.equal(/registerCommand|registerTool|registerMessageRenderer|registerProvider|ExtensionAPI|pi\.register|native provider|provider ABI|native pi extension ABI/i.test(goSource), false, 'Go helper must not register or assume pi extension/provider ABI')
  assert.equal(/package\.json|npm\s+(?:publish|version|pack)|gh\s+release|git\s+(?:tag|push)|cosign|slsa|agentteam_receive|report_done|report_blocked|mailbox full text|read full report/i.test(goSource), false, 'Go helper must not own package/release/read-boundary/control-plane authority')

  for (const rel of ['core/kernel.ts', 'core/kernelPackagedResolver.ts']) {
    const source = readRel(root, rel)
    assert.equal(/registerCommand|registerTool|registerMessageRenderer|registerProvider|ExtensionAPI|pi\.register|native provider|provider ABI|native pi extension ABI/i.test(source), false, `${rel} must not register pi surfaces`)
    assert.equal(/npm\s+(?:publish|version)|gh\s+release|cosign|slsa|postinstall|preinstall|install source is approved|release asset is approved/i.test(source), false, `${rel} must not contain release/signing/package public authority`)
  }

  const productionRefs = []
  for (const file of [
    ...walkFiles(path.join(root, 'core')),
    ...walkFiles(path.join(root, 'kernel')),
  ]) {
    const rel = toRel(root, file)
    if (!/\.(?:ts|go|js)$/.test(rel)) continue
    const source = readRel(root, rel)
    for (const token of ['registerCommand', 'registerTool', 'registerMessageRenderer', 'registerProvider', 'ExtensionAPI', 'pi.register']) {
      if (source.includes(token)) productionRefs.push(`${rel}:${token}`)
    }
  }
  assert.deepEqual(productionRefs, [], 'core/kernel/Go sources must not register pi public surfaces')
}

function assertApprovedEmbeddedHelperPathPreserved(root) {
  const packageJson = readJsonRel(root, 'package.json')
  const files = packageFileSet(packageJson)
  assert.equal(APPROVED_NATIVE_ROOT, 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc', 'approved native root should remain the embedded tmuxSnapshotParse linux-x64-glibc path')
  assertSameSet(APPROVED_EMBEDDED_NATIVE_FILES, [
    `${APPROVED_NATIVE_ROOT}/agentteam-tmuxSnapshotParse`,
    `${APPROVED_NATIVE_ROOT}/manifest.json`,
    `${APPROVED_NATIVE_ROOT}/SHA256SUMS`,
    `${APPROVED_NATIVE_ROOT}/provenance.json`,
    `${APPROVED_NATIVE_ROOT}/LICENSE`,
    `${APPROVED_NATIVE_ROOT}/license.json`,
    `${APPROVED_NATIVE_ROOT}/attestation.intoto.jsonl`,
  ], 'approved embedded native file list')
  for (const rel of APPROVED_EMBEDDED_NATIVE_FILES) {
    assert.equal(existsRel(root, rel), true, `${rel} should exist`)
    assert.equal(files.has(rel), true, `${rel} should remain in package files allowlist`)
  }
  for (const entry of files) {
    const rel = entry.startsWith('!') ? entry.slice(1).replace(/^\//, '') : entry
    if (rel.startsWith('native/') && !APPROVED_EMBEDDED_NATIVE_FILES.includes(rel)) {
      assert.fail(`package files must not include unapproved native path ${entry}`)
    }
  }
}

function assertPiExtensionSupportingSuiteEvidence(root) {
  assertEveryFileExists(root, PI_EXTENSION_PUBLIC_SURFACE_SOURCE_FILES, 'pi extension public surface guard source files')
  assertEveryFileExists(root, PI_EXTENSION_PUBLIC_SURFACE_SUPPORTING_SUITES, 'pi extension public surface guard supporting suites')
  assertEveryFileExists(root, PI_EXTENSION_PUBLIC_SURFACE_SUPPORTING_DOCS, 'pi extension public surface guard supporting docs')
  assertEveryFileExists(root, [PI_EXTENSION_PUBLIC_SURFACE_GUARD_HELPER, PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE], 'pi extension public surface guard files')
  assertSameSet(EXPECTED_COMMANDS, ['team'], 'install-load proof command constants')
  assertSameSet(EXPECTED_HOOK_EVENTS, [
    'agent_end',
    'agent_start',
    'before_agent_start',
    'context',
    'input',
    'message_end',
    'session_shutdown',
    'session_start',
    'tool_call',
    'tool_result',
  ], 'install-load proof hook constants')
  assertSameSet(EXPECTED_RENDERERS, ['agentteam-leader-attention', 'agentteam-mailbox'], 'install-load proof renderer constants')
}

function assertPiExtensionPublicSurfaceGuard(root, env) {
  const checked = new Set()
  const mark = (category, assertion) => {
    assertion()
    checked.add(category)
  }

  mark('pi-extension-entrypoint-metadata-stable', () => assertPackageEntrypointMetadataStable(root))
  mark('public-facade-export-surface-contained', () => assertPublicFacadeExportSurfaceContained(root, env))
  mark('command-tool-registration-schema-stable', () => assertCommandToolRegistrationSchemaStable(root, env))
  mark('mailbox-report-read-boundaries-explicit', () => assertMailboxReportReadBoundariesExplicit(root))
  mark('team-panel-compact-read-boundary', () => assertTeamPanelCompactReadBoundary(root))
  mark('worker-delivery-bridge-only', () => assertWorkerDeliveryBridgeOnly(root))
  mark('no-model-callable-readiness-native-release-tools', () => assertNoModelCallableReadinessNativeReleaseTools(root, env))
  mark('package-surface-install-load-proof-bounded', () => assertPackageSurfaceInstallLoadProofBounded(root))
  mark('install-load-evidence-registry-proof-only', () => assertInstallLoadEvidenceRegistryProofOnly(root))
  mark('go-native-provider-assumption-absent', () => assertGoNativeProviderAssumptionAbsent(root))
  mark('approved-embedded-helper-path-preserved', () => assertApprovedEmbeddedHelperPathPreserved(root))
  mark('pi-extension-supporting-suite-evidence', () => assertPiExtensionSupportingSuiteEvidence(root))

  const checkedCategories = sorted(checked)
  assert.deepEqual(checkedCategories, sorted(PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES), 'pi extension public surface guard should execute every category')
  return { checkedCategories }
}

module.exports = {
  PI_EXTENSION_PUBLIC_SURFACE_CATEGORIES,
  PI_EXTENSION_PUBLIC_SURFACE_CATEGORY_DESCRIPTIONS,
  PI_EXTENSION_PUBLIC_SURFACE_GUARD_HELPER,
  PI_EXTENSION_PUBLIC_SURFACE_GUARD_SUITE,
  PI_EXTENSION_PUBLIC_SURFACE_SOURCE_FILES,
  PI_EXTENSION_PUBLIC_SURFACE_SUPPORTING_DOCS,
  PI_EXTENSION_PUBLIC_SURFACE_SUPPORTING_SUITES,
  assertPiExtensionPublicSurfaceGuard,
}
