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
const removedLegacyTaskNoteFiles = [
  'core/taskNoteModel.ts',
  'state/taskNotes.ts',
]
const legacyTaskNoteCleanupFiles = new Set([
  'state/taskHistoryMigration.ts',
  'state/validation.ts',
])
const retiredLegacyTaskNoteTokens = [
  'TeamTask.notes',
  'TeamTaskNote',
  'TaskNoteMetadata',
  'TaskNoteSourceKind',
  'TaskNoteDisplayMode',
  'appendTaskNote',
  'appendCommunicationRefNote',
  'appendStructuredTaskNote',
  'latestVisibleTaskNote',
  'taskLocalNoteMetadata',
  'taskReportNoteMetadata',
  'communicationRefMetadata',
  'isCommunicationReferenceNote',
  'inferTaskNoteSourceKind',
  'task_note_append_requested',
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
const appBoundaryForbiddenTokens = [
  {
    token: '@earendil-works/pi-coding-agent',
    message: 'app boundary must not import or mention Pi runtime APIs',
  },
  {
    token: 'ExtensionContext',
    message: 'app boundary must remain Pi-context-free',
  },
]
const contextFreeAppUseCaseFiles = new Set([
  'app/messageReceiveApplication.ts',
  'app/messageApplication.ts',
  'app/taskApplication.ts',
  'app/messageTypes.ts',
  'app/taskTypes.ts',
  'app/types.ts',
])
const contextFreeAppUseCaseForbiddenTokens = [
  {
    token: 'ensureTeamForSession',
    message: 'context-free app use cases must not resolve Pi session/team context',
  },
  {
    token: 'currentActor',
    message: 'context-free app use cases must receive actor context explicitly',
  },
  {
    token: 'invalidateStatus',
    message: 'context-free app use cases must leave Pi status invalidation to tools/adapters',
  },
]
const removedRootFacadeImportPattern = /from ['"](?:\.\/|\.\.\/)(?:state|tmux|runtime|runtimeBridge|runtimeDelivery|runtimePanes|runtimeRules|runtimeService|runtimeStorage)\.js['"]/
const directBridgeRequestToken = 'create' + 'BridgeDeliveryRequest'
const completedPortBoundaryRules = [
  {
    rel: 'app/effectRunner.ts',
    forbiddenImportPrefixes: ['state/', 'runtime/', 'adapters/', 'tmux/'],
    requiredText: [
      { token: 'deps.outboxStore', message: 'must use injected outboxStore dependency' },
      { token: 'deps.outboxHandlers', message: 'must use injected outboxHandlers dependency' },
    ],
  },
  {
    rel: 'app/messageApplication.ts',
    forbiddenImportTargets: ['state/outboxStore.ts', 'state/taskNotes.ts'],
    requiredText: [
      { token: "kind: 'task_message_ref_append_requested'", message: 'must index task-bound sends through TaskMessageRef outbox effect' },
      { token: 'deps.outboxStore.enqueue', message: 'must enqueue durable effects through injected outboxStore port' },
    ],
  },
  {
    rel: 'app/taskApplication.ts',
    allowedImportTargets: [
      'app/taskPermissions.ts',
      'app/taskMutationCommands.ts',
      'app/taskReadCommands.ts',
      'app/taskReportWorkflow.ts',
      'app/taskSideEffects.ts',
      'app/types.ts',
      'app/taskTypes.ts',
    ],
    forbiddenImportTargets: [
      'core/taskReducer.ts',
      'state/taskHistoryReadModel.ts',
      'state/outboxStore.ts',
      'state/taskNotes.ts',
      'state/taskStore.ts',
      'state/teamStore.ts',
      'app/messageApplication.ts',
      'app/effectRunner.ts',
      'app/outbox.ts',
      'app/taskCommandShared.ts',
    ],
    forbiddenText: [
      { token: 'appendStructuredTaskNote', message: 'must not append active TeamTask.notes from taskApplication' },
      { token: '../core/taskNoteModel.js', message: 'must not build task-note metadata in active taskApplication workflow' },
      { token: 'deps.outboxStore.enqueue', message: 'must delegate task-local side-effect execution to app/taskSideEffects' },
      { token: 'runOutboxOnce', message: 'must delegate task-local side-effect execution to app/taskSideEffects' },
      { token: 'planTaskReportEffects', message: 'must delegate task-local side-effect execution to app/taskSideEffects' },
      { token: 'deps.teamState.updateTeam', message: 'must delegate report mailbox delivery state updates to app/taskSideEffects' },
      { token: 'transitionTask', message: 'must delegate reducer transitions to task mutation/report workflow modules' },
      { token: 'compactTaskHistorySummary', message: 'must delegate compact task history rendering to read/report modules' },
      { token: 'taskHistoryTimelineItems', message: 'must delegate task history reads to taskReadCommands' },
      { token: 'taskReportsForTask', message: 'must delegate task report reads to taskReadCommands' },
      { token: 'appendTaskReportHistory', message: 'must delegate report artifact creation to taskReportWorkflow' },
      { token: 'appendTaskEventHistory', message: 'must delegate task event creation to command modules' },
      { token: 'function denyNonOwnerReport', message: 'must delegate report owner governance to taskReportWorkflow' },
      { token: 'function handleTaskApplicationSideEffects', message: 'must delegate side-effect execution to taskSideEffects' },
      { token: 'function runTaskOutboxEffects', message: 'must delegate side-effect execution to taskSideEffects' },
    ],
    requiredText: [
      { token: './taskPermissions.js', message: 'must delegate permissions to app/taskPermissions' },
      { token: './taskReadCommands.js', message: 'must delegate read commands to app/taskReadCommands' },
      { token: './taskMutationCommands.js', message: 'must delegate mutation commands to app/taskMutationCommands' },
      { token: './taskReportWorkflow.js', message: 'must delegate report workflow to app/taskReportWorkflow' },
      { token: './taskSideEffects.js', message: 'must delegate task-local side effects to app/taskSideEffects' },
      { token: 'handleTaskApplicationSideEffects', message: 'must run task-local side effects through extracted module' },
      { token: 'executeTaskApplication', message: 'must expose the public task application use-case' },
    ],
  },
  {
    rel: 'app/taskMutationCommands.ts',
    forbiddenImportTargets: ['state/outboxStore.ts', 'state/taskNotes.ts', 'state/taskStore.ts', 'state/teamStore.ts'],
    forbiddenImportPrefixes: ['runtime/', 'adapters/', 'tmux/'],
    forbiddenText: [
      { token: 'appendStructuredTaskNote', message: 'must not append active TeamTask.notes from task mutation commands' },
      { token: '../core/taskNoteModel.js', message: 'must not build task-note metadata in active task mutation commands' },
    ],
    requiredText: [
      { token: 'deps.teamState.updateTeam', message: 'must mutate team state through injected teamState port' },
      { token: 'deps.taskMutations.createTask', message: 'must create tasks through injected task mutation port' },
    ],
  },
  {
    rel: 'app/taskReportWorkflow.ts',
    forbiddenImportTargets: ['state/outboxStore.ts', 'state/taskNotes.ts', 'state/taskStore.ts', 'state/teamStore.ts'],
    forbiddenImportPrefixes: ['runtime/', 'adapters/', 'tmux/'],
    forbiddenText: [
      { token: 'appendStructuredTaskNote', message: 'must not append active TeamTask.notes from task report workflow' },
      { token: '../core/taskNoteModel.js', message: 'must not build task-note metadata in active task report workflow' },
      { token: 'deps.outboxStore.enqueue', message: 'must leave task report side-effect execution in taskSideEffects' },
      { token: 'runOutboxOnce', message: 'must leave task report side-effect execution in taskSideEffects' },
      { token: 'planTaskReportEffects', message: 'must leave task report side-effect execution in taskSideEffects' },
    ],
    requiredText: [
      { token: 'deps.teamState.updateTeam', message: 'must mutate report workflow artifacts through injected teamState port' },
      { token: 'appendTaskReportHistory', message: 'must append TaskReport artifacts through shared helper' },
      { token: "type: 'report_submitted'", message: 'must append report_submitted TaskEvent artifacts' },
    ],
  },
  {
    rel: 'app/taskSideEffects.ts',
    forbiddenImportTargets: ['state/outboxStore.ts', 'state/taskNotes.ts', 'state/taskStore.ts', 'state/teamStore.ts'],
    forbiddenImportPrefixes: ['runtime/', 'adapters/', 'tmux/'],
    forbiddenText: [
      { token: 'appendStructuredTaskNote', message: 'must not append active TeamTask.notes from task side effects' },
      { token: '../core/taskNoteModel.js', message: 'must not build task-note metadata in task side effects' },
      { token: "kind: 'task_message_ref_append_requested'", message: 'must not introduce TaskMessageRef effects in task side effects' },
    ],
    requiredText: [
      { token: 'deps.outboxStore.enqueue', message: 'must enqueue durable effects through injected outboxStore port' },
      { token: 'runOutboxOnce', message: 'must run task-local outbox effects through injected runner helper' },
      { token: "workerId: 'task-application'", message: 'must preserve task application outbox worker id' },
      { token: '`mailbox-${effectId}`', message: 'must preserve deterministic task mailbox id' },
      { token: 'planTaskReportEffects', message: 'must preserve task report leader attention planning' },
      { token: 'deps.teamState.updateTeam', message: 'must update report mailboxMessageId through injected teamState port' },
      { token: 'deps.taskMutations.updateTaskReport', message: 'must update TaskReport mailboxMessageId through injected task mutation port' },
    ],
  },
  {
    rel: 'tools/messageReceive.ts',
    forbiddenImportTargets: ['state/mailboxStore.ts'],
    forbiddenText: [
      { token: 'markMailboxMessages', message: 'must not own mailbox mark lifecycle calls' },
      { token: '.markDelivered', message: 'must not directly mark mailbox delivery lifecycle' },
      { token: '.markRead', message: 'must not directly mark mailbox read lifecycle' },
    ],
    requiredText: [
      { token: '../app/messageReceiveApplication.js', message: 'must delegate receive read boundary to app/messageReceiveApplication' },
      { token: 'executeReceiveMessagesApplication', message: 'must call app receive use-case' },
    ],
  },
  {
    rel: 'runtime/outboxMaintenance.ts',
    forbiddenImportTargets: [
      'app/effectRunner.ts',
      'adapters/runtime/outboxStorePort.ts',
      'adapters/runtime/outboxEffectHandlers.ts',
    ],
  },
  {
    rel: 'runtime/leaderProjectionService.ts',
    forbiddenImportTargets: ['adapters/runtime/session.ts'],
  },
  {
    rel: 'tools/workerSpawnService.ts',
    forbiddenImportTargets: ['state/outboxStore.ts', 'app/effectRunner.ts'],
    requiredText: [
      { token: 'deps.outboxStore.enqueue', message: 'must enqueue initial delivery through injected outboxStore port' },
      { token: 'deps.outboxStore.get', message: 'must read initial delivery effect through injected outboxStore port' },
      { token: 'deps.outboxRunner.runOnce', message: 'must run initial delivery through injected outboxRunner port' },
    ],
  },
]

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
  for (const rel of ['!/commands.ts', '!/tools.ts', ...removedRootFacadeFiles.map(file => `!${file}`), ...removedCompatWrapperFiles.map(file => `!${file}`), ...removedLegacyTaskNoteFiles.map(file => `!${file}`), '!runtime/teamSideEffects.ts']) {
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

function importSpecifiers(text) {
  const specs = []
  const importPattern = /(?:from\s+|import\s*)['"]([^'"]+)['"]/g
  for (const match of text.matchAll(importPattern)) specs.push(match[1])
  return specs
}

function completedPortBoundaryViolations(rel, file, text) {
  const rule = completedPortBoundaryRules.find(item => item.rel === rel)
  if (!rule) return []
  const out = []
  for (const required of rule.requiredText ?? []) {
    if (!text.includes(required.token)) out.push(`${rel}: ${required.message} (${required.token})`)
  }
  for (const forbidden of rule.forbiddenText ?? []) {
    if (text.includes(forbidden.token)) out.push(`${rel}: ${forbidden.message} (${forbidden.token})`)
  }
  for (const specifier of importSpecifiers(text)) {
    if (!specifier.startsWith('.')) continue
    const target = normalizedImportTarget(file, specifier)
    if (!target) continue
    const targetRel = path.relative(root, target).replace(/\\/g, '/')
    if (rule.allowedImportTargets && !rule.allowedImportTargets.includes(targetRel)) {
      out.push(`${rel}: must not import ${targetRel}; facade should delegate only to approved extracted modules`)
    }
    if ((rule.forbiddenImportTargets ?? []).includes(targetRel)) {
      out.push(`${rel}: must not import ${targetRel}; use injected port/dependency boundary`)
    }
    for (const prefix of rule.forbiddenImportPrefixes ?? []) {
      if (isUnder(targetRel, prefix)) out.push(`${rel}: must not import ${targetRel}; use injected port/dependency boundary`)
    }
  }
  return out
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

for (const rel of [...removedRootFacadeFiles, ...removedCompatWrapperFiles, ...removedLegacyTaskNoteFiles]) {
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
  if (isUnder(rel, 'app/')) {
    for (const item of appBoundaryForbiddenTokens) {
      if (text.includes(item.token)) violations.push(`${rel}: ${item.message} (${item.token})`)
    }
  }
  if (contextFreeAppUseCaseFiles.has(rel)) {
    for (const item of contextFreeAppUseCaseForbiddenTokens) {
      if (wordTokenPattern(item.token).test(text)) violations.push(`${rel}: ${item.message} (${item.token})`)
    }
  }
  for (const token of removedRuntimeAliasTokens) {
    if ((token === 'leader_triage_requested' || token === 'leader_triage') && rel === 'state/validation.ts') continue
    if (text.includes(token)) violations.push(`${rel}: contains removed compatibility token ${token}`)
  }
  for (const token of retiredLegacyTaskNoteTokens) {
    if (legacyTaskNoteCleanupFiles.has(rel) && (token === 'task_note_append_requested' || token === 'TeamTask.notes')) continue
    if (text.includes(token)) violations.push(`${rel}: contains retired legacy task-note token ${token}`)
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
  violations.push(...completedPortBoundaryViolations(rel, file, text))

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
