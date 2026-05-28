#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const removedRootFacadeFiles = [
  'state.ts',
  'tmux.ts',
  'runtime.ts',
  'runtimeBridge.ts',
  'runtimeDelivery.ts',
  'runtimePanes.ts',
  'runtimeRules.ts',
  'runtimeService.ts',
  'runtimeStorage.ts',
]
const removedCompatWrapperFiles = [
  'tools/messageDelivery.ts',
  'tools/messagePolicy.ts',
  'tools/messageRouting.ts',
  'tools/taskCommands.ts',
  'tools/taskPolicy.ts',
  'tools/taskActionability.ts',
]
const removedRuntimeAliasTokens = [
  'parseDeliveryMode',
  'normalizeDeliveryMode',
  'AgentTeamDeliveryMode',
  'DELIVERY_MODE_ENV_VAR',
  'BRIDGE_ONLY_DELIVERY_MODE',
  'DEFAULT_DELIVERY_MODE',
  'isBridgeOnlyDeliveryMode',
  'getBridgeStatePath',
  'getDeliveryStatePath',
  'getLeaderProjectionStatePath',
  'getLeaderAttentionStatePath',
  'getLegacySessionContextPath',
  'sanitizeSessionFile',
  'leader_triage_requested',
  'leader_triage',
  'leader-triage',
]
const explicitPackageTopLevelFiles = [
  'index.ts',
  'types.ts',
  'internalTypes.ts',
  'config.ts',
  'agents.ts',
  'deliveryPolicy.ts',
  'messageLifecycle.ts',
  'orchestration.ts',
  'policy.ts',
  'protocol.ts',
  'renderers.ts',
  'session.ts',
  'teamPanel.ts',
  'utils.ts',
  'workerTurnPrompt.ts',
]
const packageDirectories = [
  'agents/',
  'api/',
  'app/',
  'adapters/',
  'commands/',
  'hooks/',
  'core/',
  'runtime/',
  'state/',
  'teamPanel/',
  'tmux/',
  'tools/',
]
const publicRuntimeEntries = new Set([
  'types.ts',
  'api/tools.ts',
  'api/commands.ts',
  'tools/message.ts',
  'tools/messageTypes.ts',
  'tools/task.ts',
  'tools/taskTypes.ts',
  'tools/team.ts',
  'tools/teamTypes.ts',
])
const publicSurfaceForbiddenTokens = [
  'TeamState',
  'TeamMember',
  'MailboxMessage',
  'BridgeLease',
  'DeliveryRequest',
  'LeaderProjection',
  'OutboxEffect',
  'WorkerFsmStatus',
  'MemberStatus',
  'WORKER_FSM_STATUSES',
]
const removedRootFacadeImportPattern = /from ['"](?:\.\/|\.\.\/)(?:state|tmux|runtime|runtimeBridge|runtimeDelivery|runtimePanes|runtimeRules|runtimeService|runtimeStorage)\.js['"]/
const directBridgeRequestToken = 'create' + 'BridgeDeliveryRequest'

function wordTokenPattern(token) {
  return new RegExp(`(^|[^A-Za-z0-9_])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`)
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'tests') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
}

function packageFilesViolations(pkg) {
  const files = pkg.files ?? []
  const violations = []
  if (files.includes('*.ts')) violations.push('package.json: files must not include broad *.ts package surface')
  for (const rel of explicitPackageTopLevelFiles) {
    if (!files.includes(rel)) violations.push(`package.json: files missing explicit top-level file ${rel}`)
  }
  for (const dir of packageDirectories) {
    if (!files.includes(dir)) violations.push(`package.json: files missing required directory ${dir}`)
  }
  for (const rel of ['!/commands.ts', '!/tools.ts', ...removedRootFacadeFiles.map(file => `!${file}`), ...removedCompatWrapperFiles.map(file => `!${file}`), '!runtime/teamSideEffects.ts']) {
    if (!files.includes(rel)) violations.push(`package.json: files missing explicit exclusion ${rel}`)
  }
  for (const rel of explicitPackageTopLevelFiles) {
    if (!fs.existsSync(path.join(root, rel))) violations.push(`package.json: included file does not exist: ${rel}`)
  }
  return violations
}

function normalizedImportTarget(file, specifier) {
  if (!specifier.startsWith('.')) return null
  const resolved = path.resolve(path.dirname(file), specifier)
  return specifier.endsWith('.js') ? resolved.slice(0, -3) + '.ts' : resolved
}

function isUnder(rel, dir) {
  return rel === dir.slice(0, -1) || rel.startsWith(dir)
}

function dependencyBoundaryViolation(rel, targetRel) {
  if (isUnder(rel, 'core/')) {
    if (isUnder(targetRel, 'app/') || isUnder(targetRel, 'api/') || isUnder(targetRel, 'adapters/') || isUnder(targetRel, 'runtime/') || isUnder(targetRel, 'state/') || isUnder(targetRel, 'tmux/') || isUnder(targetRel, 'tools/') || isUnder(targetRel, 'commands/') || isUnder(targetRel, 'hooks/') || isUnder(targetRel, 'teamPanel/')) {
      return 'core must remain pure and not import app/api/adapters/runtime/state/tmux/tools/commands/hooks/teamPanel'
    }
  }
  if (isUnder(rel, 'app/')) {
    if (isUnder(targetRel, 'api/') || isUnder(targetRel, 'adapters/') || isUnder(targetRel, 'tmux/')) {
      return 'app must not depend on api/adapters/tmux visibility modules'
    }
  }
  if (isUnder(rel, 'api/')) {
    if (isUnder(targetRel, 'state/') || isUnder(targetRel, 'runtime/') || isUnder(targetRel, 'tmux/') || isUnder(targetRel, 'adapters/')) {
      return 'api registration boundary should not reach state/runtime/tmux/adapters directly'
    }
  }
  if (isUnder(rel, 'adapters/')) {
    if (isUnder(targetRel, 'api/') || isUnder(targetRel, 'tools/') || isUnder(targetRel, 'commands/') || isUnder(targetRel, 'hooks/') || isUnder(targetRel, 'teamPanel/')) {
      return 'adapters must not depend on api/tools/commands/hooks/teamPanel entry layers'
    }
  }
  if (isUnder(rel, 'state/')) {
    if (isUnder(targetRel, 'api/') || isUnder(targetRel, 'tools/') || isUnder(targetRel, 'commands/') || isUnder(targetRel, 'hooks/') || isUnder(targetRel, 'teamPanel/') || isUnder(targetRel, 'adapters/') || isUnder(targetRel, 'tmux/')) {
      return 'state stores must not depend on entry layers, adapters, or tmux visibility'
    }
  }
  return null
}

const violations = []
const pkg = readJson('package.json')
violations.push(...packageFilesViolations(pkg))

for (const rel of [...removedRootFacadeFiles, ...removedCompatWrapperFiles]) {
  if (fs.existsSync(path.join(root, rel))) {
    violations.push(`${rel}: compatibility facade/wrapper should be removed`)
  }
}

for (const file of walk(root)) {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  const text = fs.readFileSync(file, 'utf8')
  if (rel === 'tools.ts' || rel === 'commands.ts') {
    violations.push(`${rel}: legacy top-level registration entrypoint should live under api/`)
  }
  for (const token of removedRuntimeAliasTokens) {
    if ((token === 'leader_triage_requested' || token === 'leader_triage') && rel === 'state/validation.ts') continue
    if (text.includes(token)) violations.push(`${rel}: contains removed compatibility token ${token}`)
  }
  if (removedRootFacadeImportPattern.test(text)) {
    violations.push(`${rel}: imports removed root facade`)
  }
  if (rel === 'tools/workerSpawnService.ts' && text.includes(directBridgeRequestToken)) {
    violations.push(`${rel}: spawn path must route initial delivery through Outbox, not direct bridge request creation`)
  }
  if (rel === 'adapters/bridge/index.ts' && text.includes(directBridgeRequestToken)) {
    violations.push(`${rel}: bridge adapter surface must not export direct delivery request creation`)
  }

  const importPattern = /from ['"]([^'"]+)['"]/g
  for (const match of text.matchAll(importPattern)) {
    const specifier = match[1]
    if (!specifier.startsWith('.')) continue
    const target = normalizedImportTarget(file, specifier)
    const targetRel = path.relative(root, target).replace(/\\/g, '/')
    if ((specifier.endsWith('/types.js') || specifier === './types.js' || specifier === '../types.js') && rel !== 'internalTypes.ts' && target === path.join(root, 'types.ts')) {
      violations.push(`${rel}: imports top-level public types for internal implementation; use core/publicModel or internalTypes`)
    }
    const boundary = dependencyBoundaryViolation(rel, targetRel)
    if (boundary) violations.push(`${rel}: imports ${targetRel}: ${boundary}`)
  }

  if (publicRuntimeEntries.has(rel)) {
    if (/from ['"].*internalTypes\.js['"]/.test(text)) {
      violations.push(`${rel}: public surface imports internalTypes`)
    }
    for (const token of publicSurfaceForbiddenTokens) {
      if (wordTokenPattern(token).test(text)) violations.push(`${rel}: public surface mentions internal token ${token}`)
    }
  }
}

const publicTypes = fs.readFileSync(path.join(root, 'types.ts'), 'utf8')
for (const token of publicSurfaceForbiddenTokens) {
  if (wordTokenPattern(token).test(publicTypes)) violations.push(`types.ts: public types surface mentions internal token ${token}`)
}

if (violations.length > 0) {
  console.error('agentteam import boundary advisory failed:')
  for (const item of violations) console.error(`- ${item}`)
  process.exit(1)
}
console.log('agentteam import boundary advisory passed')
