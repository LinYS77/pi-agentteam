const assert = require('node:assert/strict')
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function countOccurrences(haystack, needle) {
  return String(haystack).split(needle).length - 1
}

module.exports = {
  name: 'service unit helpers',
  async run(env) {
    const { modules } = env
    const fs = require('node:fs')
    const path = require('node:path')
    const workerRole = env.helpers.requireDist('tools/workerRole.js')
    const workerPrompt = env.helpers.requireDist('tools/workerPrompt.js')
    const messageApplication = env.helpers.requireDist('app/messageApplication.js')
    const messageReceiveApplication = env.helpers.requireDist('app/messageReceiveApplication.js')
    const taskApplication = env.helpers.requireDist('app/taskApplication.js')
    const taskPermissions = env.helpers.requireDist('app/taskPermissions.js')
    const taskReadCommands = env.helpers.requireDist('app/taskReadCommands.js')
    const taskMutationCommands = env.helpers.requireDist('app/taskMutationCommands.js')
    const taskReportWorkflow = env.helpers.requireDist('app/taskReportWorkflow.js')
    const taskSideEffects = env.helpers.requireDist('app/taskSideEffects.js')
    const outboxSideEffects = env.helpers.requireDist('app/outboxSideEffects.js')
    const taskFormatting = env.helpers.requireDist('app/taskFormatting.js')
    const corePublicModel = env.helpers.requireDist('core/publicModel.js')
    const coreMessagePolicy = env.helpers.requireDist('core/messagePolicy.js')
    const internalTypes = env.helpers.requireDist('internalTypes.js')
    const contextService = env.helpers.requireDist('hooks/contextService.js')
    const messageLifecycle = env.helpers.requireDist('messageLifecycle.js')

    assert.equal(env.modules.deliveryPolicy.resolveDeliveryPolicy({ policy: undefined }).policy, 'bridge-only')
    assert.equal(env.modules.deliveryPolicy.resolveDeliveryPolicy({ policy: 'legacy' }).workerBridgeAutoStart, true)
    assert.equal(env.modules.deliveryPolicy.resolveDeliveryPolicy({ policy: 'bridge-only' }).workerBridgeAutoPump, true)
    assert.equal(env.modules.deliveryPolicy.parseDeliveryPolicyName('bridge-only'), 'bridge-only')
    assert.equal(env.modules.deliveryPolicy.parseDeliveryPolicyName('bridge'), null, 'legacy bridge policy alias should not parse')
    assert.equal(env.modules.deliveryPolicy.parseDeliveryMode, undefined, 'deliveryMode compatibility parser should not be exported')
    assert.equal(env.modules.deliveryPolicy.normalizeDeliveryMode, undefined, 'deliveryMode compatibility normalizer should not be exported')
    assert.equal(env.modules.deliveryPolicy.DELIVERY_MODE_ENV_VAR, undefined, 'deliveryMode env alias should not be exported')
    assert.equal(env.modules.deliveryPolicy.DEFAULT_DELIVERY_MODE, undefined, 'deliveryMode default alias should not be exported')
    assert.equal(env.modules.deliveryPolicy.BRIDGE_ONLY_DELIVERY_MODE, undefined, 'deliveryMode bridge alias should not be exported')
    assert.equal(env.modules.deliveryPolicy.isBridgeOnlyDeliveryMode, undefined, 'deliveryMode predicate alias should not be exported')
    assert.equal(env.modules.deliveryPolicy.normalizeDeliveryPolicyName('surprise-mode'), 'bridge-only')
    assert.equal(env.modules.deliveryPolicy.isBridgeOnlyDeliveryPolicy({ policy: 'legacy' }), true)
    assert.deepEqual(env.modules.deliveryStore.DELIVERY_REQUEST_STATUSES, ['pending', 'claimed', 'submitted', 'started', 'completed', 'failed', 'expired', 'cancelled'])
    assert.deepEqual(internalTypes.WORKER_FSM_STATUSES, ['offline', 'idle', 'pending_delivery', 'queued', 'running', 'draining', 'error'])
    assert.equal(modules.state.TASK_NOTE_SOURCE_KINDS, undefined, 'task-note source-kind model should be retired')
    assert.equal(modules.state.TASK_NOTE_DISPLAY_MODES, undefined, 'task-note display-mode model should be retired')
    assert.equal(modules.state.TASK_NOTE_METADATA_VERSION, undefined, 'task-note metadata model should be retired')
    assert.equal(modules.state.taskLocalNoteMetadata, undefined, 'task-local note metadata helper should be retired')
    assert.equal(modules.state.taskReportNoteMetadata, undefined, 'task-report note metadata helper should be retired')
    assert.equal(modules.state.communicationRefMetadata, undefined, 'communication-ref note metadata helper should be retired')
    const legacyTaskNoteReasons = modules.state.validatePersistedTeamState({
      version: 1,
      tasks: {
        T001: {
          status: 'open',
          notes: [{ at: 1, author: 'worker-a', text: '[legacy note]', metadata: { sourceKind: 'communication_ref' } }],
        },
      },
    })
    assert.ok(legacyTaskNoteReasons.some(reason => reason.code === 'legacy_task_notes'), 'validation should reject active legacy task.notes after no-notes cleanup')
    assert.equal(env.modules.types.TEAM_LEAD, 'team-lead')
    assert.deepEqual(env.modules.types.TASK_STATUSES, corePublicModel.TASK_STATUSES, 'types.ts should expose public task statuses')
    assert.deepEqual(env.modules.types.WORKER_HEALTHS, corePublicModel.WORKER_HEALTHS, 'types.ts should expose public worker health')
    assert.deepEqual(env.modules.types.MESSAGE_TYPES, corePublicModel.MESSAGE_TYPES, 'types.ts should expose public message types')
    assert.deepEqual(env.modules.types.TASK_REPORT_TYPES, corePublicModel.TASK_REPORT_TYPES, 'types.ts should expose public task report types')
    assert.deepEqual(env.modules.types.MESSAGE_READ_STATES, corePublicModel.MESSAGE_READ_STATES, 'types.ts should expose public read lifecycle')
    assert.equal(env.modules.types.WORKER_FSM_STATUSES, undefined, 'types.ts public surface must not expose internal worker FSM statuses')
    assert.equal(env.modules.types.DELIVERY_REQUEST_STATUSES, undefined, 'types.ts public surface must not expose internal delivery statuses')
    assert.equal(env.modules.types.OUTBOX_EFFECT_STATUSES, undefined, 'types.ts public surface must not expose internal outbox statuses')
    assert.equal(env.modules.types.isWorkerHealth('running'), false, 'public worker health should reject internal runtime status')


    assert.equal(workerRole.normalizeSpawnRole('plan'), 'planner')
    assert.equal(workerRole.normalizeSpawnRole('研究员'), 'researcher')
    assert.equal(workerRole.normalizeSpawnRole('dev'), 'implementer')
    assert.equal(workerRole.normalizeSpawnRole('worker', 'planning-helper'), 'planner')
    assert.equal(workerRole.normalizeSpawnRole('agent', 'research-buddy'), 'researcher')
    assert.equal(workerRole.normalizeSpawnRole('teammate', 'code-buddy'), 'implementer')
    assert.equal(workerRole.normalizeSpawnRole('custom-role'), 'custom-role')

    const roleAgent = {
      name: 'implementer',
      description: 'Implementer',
      model: 'model with space',
      tools: ['read', ' ', 'bash', 'agentteam_task'],
      systemPrompt: 'implementer role prompt',
    }
    const systemPrompt = workerPrompt.buildWorkerSystemPrompt({
      teamName: 'demo',
      workerName: 'impl-1',
      role: 'implementer',
      roleAgent,
    })
    assert.ok(systemPrompt.includes('Team: demo'))
    assert.ok(systemPrompt.includes('Worker name: impl-1'))
    assert.ok(systemPrompt.includes('Role: implementer'))
    assert.ok(systemPrompt.includes('agentteam_send and agentteam_task'))
    assert.ok(systemPrompt.includes('Public vocabulary: task statuses are open/blocked/done'), 'worker prompt should expose vNext public vocabulary')
    assert.ok(systemPrompt.includes('call agentteam_receive when you need full inbox/mailbox details'), 'worker prompt should keep mailbox read state clean')
    assert.ok(systemPrompt.includes('Task facts are concise shared state'), 'worker prompt should define task facts as concise state')
    assert.ok(systemPrompt.includes('durable TaskReport artifacts and owner-to-leader action requests'), 'worker prompt should define report artifacts as completion/blocker path')
    assert.ok(systemPrompt.includes('Task progress/history is compact local activity only and does not notify team-lead'), 'worker prompt should define progress/history as non-notifying local activity')
    assert.ok(systemPrompt.includes('same-task assigned task facts with task-bound mailbox messages'), 'worker prompt should mention same-task prompt merge')
    assert.ok(systemPrompt.includes('task-id based'), 'worker prompt should prefer task-linked handoffs')
    assert.ok(systemPrompt.includes('omit agentteam_send.to'), 'worker prompt should describe task-based return routing')
    assert.ok(systemPrompt.includes('agentteam_task action=report_blocked with the taskId'), 'worker prompt should prefer task-based blocked reports')
    assert.ok(systemPrompt.includes('implementer role prompt'))

    const plannerSystemPrompt = workerPrompt.buildWorkerSystemPrompt({
      teamName: 'demo',
      workerName: 'planner-1',
      role: 'planner',
      roleAgent: {
        name: 'planner',
        description: 'Planner',
        tools: [],
        systemPrompt: 'planner role prompt',
      },
    })
    assert.ok(plannerSystemPrompt.includes('Planner advisory gate'), 'planner system prompt should include advisory gate')
    assert.ok(plannerSystemPrompt.includes('leader-created actionable planning task'), 'planner prompt should require leader-created planning task')
    assert.ok(plannerSystemPrompt.includes('leader direct question'), 'planner prompt should allow direct leader question')
    assert.ok(plannerSystemPrompt.includes('leader assignment with taskId'), 'planner prompt should allow leader assignment with taskId')
    assert.ok(plannerSystemPrompt.includes('Peer inform/handoff messages are context for team-lead attention only'), 'planner prompt should prevent peer-driven planning work')

    const launch = workerPrompt.buildWorkerLaunchCommand({
      sessionFile: "/tmp/session with ' quote.jsonl",
      basePrompt: systemPrompt,
      roleAgent,
    })
    assert.ok(launch.startsWith('PI_AGENTTEAM_HOME='), launch)
    assert.ok(launch.includes("'pi' '--session'"), launch)
    assert.ok(launch.includes("'--append-system-prompt'"), launch)
    assert.ok(launch.includes("'--model' 'model with space'"), launch)
    assert.ok(launch.includes("'--tools' 'read,bash,agentteam_task'"), launch)
    assert.ok(launch.includes("\"'\"'"), 'single quotes in args should be shell escaped')

    const inheritedLaunch = workerPrompt.buildWorkerLaunchCommand({
      sessionFile: '/tmp/worker-session.jsonl',
      basePrompt: systemPrompt,
      roleAgent,
      leaderArgv: ['/usr/local/bin/node', '/usr/local/bin/pi', '--no-extensions', '--extension', './index.ts', '--session-dir', '/tmp/pi-agentteam-explicit-sessions'],
      leaderCwd: '/tmp/pi-agentteam-explicit-extension-root',
    })
    assert.ok(inheritedLaunch.includes("'--no-extensions'"), 'worker launch should inherit explicit leader no-extension discovery mode')
    assert.ok(inheritedLaunch.includes("'--extension' '/tmp/pi-agentteam-explicit-extension-root/index.ts'"), 'worker launch should inherit explicit local extension as an absolute path')
    assert.ok(inheritedLaunch.includes("'--session-dir' '/tmp/pi-agentteam-explicit-sessions'"), 'worker launch should inherit explicit leader session-dir')
    assert.ok(inheritedLaunch.includes("'--session' '/tmp/worker-session.jsonl'"), 'worker launch should still bind the worker session file')

    const messageServiceSource = env.helpers.readSource('tools/messageService.ts')
    assert.ok(messageServiceSource.includes('../app/messageApplication.js'), 'message service should delegate send orchestration to app boundary')
    assert.ok(messageServiceSource.includes('deps.ensureTeamForSession(ctx)'), 'message service should resolve send team context outside app boundary')
    assert.ok(messageServiceSource.includes('deps.currentActor(ctx)'), 'message service should resolve send actor context outside app boundary')
    assert.ok(messageServiceSource.includes('deps.invalidateStatus(ctx)'), 'message service should own send status invalidation outside app boundary')
    assert.ok(!messageServiceSource.includes('runTeamSideEffects'), 'message service should not execute runtime effects directly')
    assert.ok(!messageServiceSource.includes('resolveMessageRecipients'), 'message service should not own routing orchestration')
    const messageReceiveSource = env.helpers.readSource('tools/messageReceive.ts')
    assert.ok(messageReceiveSource.includes('../app/messageReceiveApplication.js'), 'message receive tool should delegate read boundary to app boundary')
    assert.ok(!messageReceiveSource.includes('../state/mailboxStore.js'), 'message receive tool should not access mailbox state directly')
    assert.ok(!messageReceiveSource.includes('markMailboxMessages'), 'message receive tool should not own read lifecycle mutations')
    const appMessageReceiveSource = env.helpers.readSource('app/messageReceiveApplication.ts')
    const appTypesSource = env.helpers.readSource('app/types.ts')
    const appPortsSource = env.helpers.readSource('app/ports.ts')
    assert.equal(appPortsSource.includes('ExtensionContext'), false, 'app ports should not mention Pi ExtensionContext')
    assert.equal(appPortsSource.includes('@earendil-works/pi-coding-agent'), false, 'app ports should not import Pi APIs')
    assert.equal(appPortsSource.includes('TeamContextPort'), false, 'retired app TeamContextPort should be removed after context-free seams')
    assert.ok(appMessageReceiveSource.includes('mailboxRepository.readMailbox'), 'app receive boundary should read mailbox through port')
    assert.ok(appMessageReceiveSource.includes('mailboxRepository.markDelivered'), 'app receive boundary should mark delivered through port')
    assert.ok(appMessageReceiveSource.includes('mailboxRepository.markRead'), 'app receive boundary should mark read through port')
    assert.equal(appMessageReceiveSource.includes('ExtensionContext'), false, 'app receive boundary should not mention Pi ExtensionContext')
    assert.equal(appMessageReceiveSource.includes('@earendil-works/pi-coding-agent'), false, 'app receive boundary should not import Pi APIs')
    const receiveDepsBlock = appTypesSource.slice(appTypesSource.indexOf('export type MessageReceiveApplicationDeps'), appTypesSource.indexOf('export type TaskApplicationDeps'))
    assert.equal(receiveDepsBlock.includes('ExtensionContext'), false, 'receive app dependency types should be Pi-context-free')
    assert.equal(receiveDepsBlock.includes('ensureTeamForSession'), false, 'receive app dependency types should not resolve team/session context')
    assert.equal(receiveDepsBlock.includes('currentActor'), false, 'receive app dependency types should not resolve actor context')
    const receiveNoContextTool = env.pi.__tools.get('agentteam_receive')
    const receiveNoContextCtx = env.helpers.createCtx('/tmp/receive-no-context-project', '/tmp/receive-no-context-session.jsonl', env.notifications)
    const receiveNoContext = await receiveNoContextTool.execute('receive-no-context', {}, null, () => {}, receiveNoContextCtx)
    assert.equal(receiveNoContext.content[0].text, 'No current team context.', 'receive tool no-context output should remain exact')
    assert.deepEqual(receiveNoContext.details, {}, 'receive tool no-context details should remain empty')
    const sendNoContextTool = env.pi.__tools.get('agentteam_send')
    const sendNoContextCtx = env.helpers.createCtx('/tmp/send-no-context-project', '/tmp/send-no-context-session.jsonl', env.notifications)
    const sendNoContext = await sendNoContextTool.execute('send-no-context', { to: 'team-lead', message: 'no context', type: 'inform' }, null, () => {}, sendNoContextCtx)
    assert.equal(sendNoContext.content[0].text, 'No current team context.', 'send tool no-context output should remain exact')
    assert.deepEqual(sendNoContext.details, {}, 'send tool no-context details should remain empty')
    const taskNoContextTool = env.pi.__tools.get('agentteam_task')
    const taskNoContextCtx = env.helpers.createCtx('/tmp/task-no-context-project', '/tmp/task-no-context-session.jsonl', env.notifications)
    const taskNoContext = await taskNoContextTool.execute('task-no-context', { action: 'list' }, null, () => {}, taskNoContextCtx)
    assert.equal(taskNoContext.content[0].text, 'No current team context.', 'task tool no-context output should remain exact')
    assert.deepEqual(taskNoContext.details, {}, 'task tool no-context details should remain empty')
    const leaderProjectionServiceSource = env.helpers.readSource('runtime/leaderProjectionService.ts')
    assert.ok(!leaderProjectionServiceSource.includes('../adapters/runtime/session.js'), 'leader projection runtime service should not import adapter session back-edge')
    assert.ok(leaderProjectionServiceSource.includes('LeaderProjectionServiceDeps'), 'leader projection runtime service should receive session/delivery ports')
    const runtimeServiceSource = env.helpers.readSource('adapters/runtime/service.ts')
    assert.ok(runtimeServiceSource.includes('deliverLeaderMailbox') && runtimeServiceSource.includes('createLeaderProjectionService(pi, {'), 'runtime adapter service should compose leader projection deps')
    const workerSpawnSource = env.helpers.readSource('tools/workerSpawnService.ts')
    assert.ok(!workerSpawnSource.includes('../state/outboxStore.js'), 'worker spawn service should use injected outbox store port')
    assert.ok(!workerSpawnSource.includes('../app/effectRunner.js'), 'worker spawn service should use injected outbox runner port')
    assert.ok(workerSpawnSource.includes('../app/outboxSideEffects.js'), 'worker spawn initial delivery should use shared outbox side-effects module')
    assert.ok(workerSpawnSource.includes('deps.outboxStore.enqueue'), 'worker spawn initial delivery should still enqueue through injected outbox store')
    assert.ok(workerSpawnSource.includes('runSelectedOutboxEffects'), 'worker spawn initial delivery should run through shared selected outbox runner')
    assert.equal(workerSpawnSource.includes('deps.outboxRunner.runOnce'), false, 'worker spawn initial delivery should no longer call outboxRunner.runOnce directly')
    assert.equal(workerSpawnSource.includes('runOutboxOnce'), false, 'worker spawn service should not call low-level outbox runner directly')
    assert.ok(workerSpawnSource.includes("workerId: 'worker-spawn-service'"), 'worker spawn initial delivery should preserve worker-spawn-service outbox worker id')
    assert.ok(workerSpawnSource.includes("'spawn-initial-worker-delivery'"), 'worker spawn initial delivery should preserve current idempotency key prefix')
    const sharedToolDepsSource = env.helpers.readSource('tools/shared.ts')
    assert.ok(sharedToolDepsSource.includes('outboxRunner: OutboxRunnerPort'), 'tool deps should expose a narrow outbox runner port')
    const bridgeStoreSource = env.helpers.readSource('state/bridgeStore.ts')
    const deliveryStoreSource = env.helpers.readSource('state/deliveryStore.ts')
    const leaderProjectionStoreSource = env.helpers.readSource('state/leaderProjectionStore.ts')
    const leaderAttentionStoreSource = env.helpers.readSource('state/leaderAttentionStore.ts')
    for (const [label, source] of [
      ['bridgeStore', bridgeStoreSource],
      ['deliveryStore', deliveryStoreSource],
      ['leaderProjectionStore', leaderProjectionStoreSource],
      ['leaderAttentionStore', leaderAttentionStoreSource],
    ]) {
      assert.ok(source.includes('./runtimeStore.js'), `${label} should persist through runtime.json section helpers`)
      assert.equal(/from ['"]\.\/fsStore\.js['"]/.test(source), false, `${label} should not access standalone runtime files directly`)
    }
    assert.ok(!messageServiceSource.includes('decideMessagePolicy'), 'message service should not own core policy decisions')
    const taskServiceSource = env.helpers.readSource('tools/taskService.ts')
    assert.ok(taskServiceSource.includes('../app/taskApplication.js'), 'task service should delegate task orchestration to app boundary')
    assert.ok(taskServiceSource.includes('deps.ensureTeamForSession(ctx)'), 'task service should resolve task team context outside app boundary')
    assert.ok(taskServiceSource.includes('deps.currentActor(ctx)'), 'task service should resolve task actor context outside app boundary')
    assert.ok(taskServiceSource.includes('deps.invalidateStatus(ctx)'), 'task service should own task status invalidation outside app boundary')
    assert.ok(!taskServiceSource.includes('transitionTask'), 'task service should not own core task reducer orchestration')
    assert.ok(!taskServiceSource.includes('ensureTaskPrivilege'), 'task service should not own task privilege validation')
    assert.ok(!taskServiceSource.includes('enqueueOutboxEffect'), 'task service should not plan durable task side effects')
    const appTaskSource = env.helpers.readSource('app/taskApplication.ts')
    const appTaskTypesSource = env.helpers.readSource('app/taskTypes.ts')
    const appTaskPermissionsSource = env.helpers.readSource('app/taskPermissions.ts')
    const appTaskReadCommandsSource = env.helpers.readSource('app/taskReadCommands.ts')
    const appTaskMutationCommandsSource = env.helpers.readSource('app/taskMutationCommands.ts')
    const appTaskReportWorkflowSource = env.helpers.readSource('app/taskReportWorkflow.ts')
    const appTaskSideEffectsSource = env.helpers.readSource('app/taskSideEffects.ts')
    const appOutboxSideEffectsSource = env.helpers.readSource('app/outboxSideEffects.ts')
    const appTaskCommandSharedSource = env.helpers.readSource('app/taskCommandShared.ts')
    const taskDepsBlock = appTypesSource.slice(appTypesSource.indexOf('export type TaskApplicationDeps'))
    assert.equal(appTaskSource.includes('ExtensionContext'), false, 'app task boundary should not mention Pi ExtensionContext')
    assert.equal(appTaskSource.includes('@earendil-works/pi-coding-agent'), false, 'app task boundary should not import Pi APIs')
    assert.equal(appTaskSource.includes('ensureTeamForSession('), false, 'app task boundary should not resolve team/session context')
    assert.equal(appTaskSource.includes('currentActor('), false, 'app task boundary should not resolve actor context')
    assert.equal(appTaskSource.includes('invalidateStatus('), false, 'app task boundary should not invalidate Pi status directly')
    const appTaskImportSpecifiers = [...new Set([...appTaskSource.matchAll(/from ['"]([^'"]+)['"]/g)].map(match => match[1]))].sort()
    assert.deepEqual(appTaskImportSpecifiers, [
      './taskMutationCommands.js',
      './taskPermissions.js',
      './taskReadCommands.js',
      './taskReportNudge.js',
      './taskReportWorkflow.js',
      './taskSideEffects.js',
      './taskTypes.js',
      './types.js',
    ].sort(), 'task application facade should import only extracted task modules and app types')
    const appTaskFunctionNames = [...appTaskSource.matchAll(/\bfunction\s+([A-Za-z0-9_]+)/g)].map(match => match[1])
    assert.deepEqual(appTaskFunctionNames, ['executeTaskApplication'], 'task application facade should define only executeTaskApplication')
    assert.equal(/function\s+\w*TaskCommand/.test(appTaskSource), false, 'task application facade should contain no inline task command implementation')
    for (const forbiddenFacadeToken of [
      'transitionTask',
      'compactTaskHistorySummary',
      'taskHistoryTimelineItems',
      'taskReportsForTask',
      'appendTaskReportHistory',
      'appendTaskEventHistory',
      'deps.outboxStore.enqueue',
      'runOutboxOnce',
      'planTaskReportEffects',
      'function denyNonOwnerReport',
      'function handleTaskApplicationSideEffects',
      'function runTaskOutboxEffects',
    ]) {
      assert.equal(appTaskSource.includes(forbiddenFacadeToken), false, `task application facade should not contain ${forbiddenFacadeToken}`)
    }
    assert.equal(countOccurrences(appTaskSource, 'handleTaskApplicationSideEffects'), 4, 'task application facade should import side-effect handler and invoke it only on denied/create/actionable result paths')
    assert.ok(appTaskSource.includes("if (params.action === 'show' || params.action === 'history' || params.action === 'reports')"), 'task application facade should return task read-only detail actions before side-effect handling')
    assert.equal(appTaskTypesSource.includes('ExtensionContext'), false, 'task app input types should be Pi-context-free')
    assert.equal(appTaskTypesSource.includes('@earendil-works/pi-coding-agent'), false, 'task app input types should not import Pi APIs')
    assert.equal(taskDepsBlock.includes('ExtensionContext'), false, 'task app dependency types should be Pi-context-free')
    assert.equal(taskDepsBlock.includes('ensureTeamForSession'), false, 'task app dependency types should not resolve team/session context')
    assert.equal(taskDepsBlock.includes('currentActor'), false, 'task app dependency types should not resolve actor context')
    assert.equal(taskDepsBlock.includes('invalidateStatus'), false, 'task app dependency types should not invalidate Pi status')
    assert.equal(appTaskPermissionsSource.includes('ExtensionContext'), false, 'task permissions module should not mention Pi ExtensionContext')
    assert.equal(appTaskPermissionsSource.includes('@earendil-works/pi-coding-agent'), false, 'task permissions module should not import Pi APIs')
    for (const forbiddenTaskPermissionImport of ['../state/', '../runtime/', '../adapters/', '../tmux/']) {
      assert.equal(appTaskPermissionsSource.includes(forbiddenTaskPermissionImport), false, `task permissions module should not import ${forbiddenTaskPermissionImport}`)
    }
    assert.equal(appTaskReadCommandsSource.includes('ExtensionContext'), false, 'task read commands module should not mention Pi ExtensionContext')
    assert.equal(appTaskReadCommandsSource.includes('@earendil-works/pi-coding-agent'), false, 'task read commands module should not import Pi APIs')
    assert.ok(appTaskReadCommandsSource.includes('../state/taskHistoryReadModel.js'), 'task read commands should reuse shared TaskHistory read model selectors')
    for (const forbiddenTaskReadCommandImport of ['../state/taskStore.js', '../state/teamStore.js', '../state/outboxStore.js', '../runtime/', '../adapters/', '../tmux/']) {
      assert.equal(appTaskReadCommandsSource.includes(forbiddenTaskReadCommandImport), false, `task read commands module should not import ${forbiddenTaskReadCommandImport}`)
    }
    for (const readCommandExport of ['listTasksCommand', 'showTaskCommand', 'historyTaskCommand', 'reportsTaskCommand', 'reportTaskCommand']) {
      assert.equal(typeof taskReadCommands[readCommandExport], 'function', `task read commands module should export ${readCommandExport}`)
      assert.ok(appTaskReadCommandsSource.includes(`function ${readCommandExport}`), `${readCommandExport} implementation should live in taskReadCommands`)
      assert.equal(appTaskSource.includes(`function ${readCommandExport}`), false, `${readCommandExport} implementation should not live in taskApplication`)
    }
    for (const readModelSelector of ['taskHistoryCompactSummary', 'taskHistoryTimelineItems', 'taskReportsForTask', 'compactTaskReport', 'compactTaskActivity']) {
      assert.ok(appTaskReadCommandsSource.includes(readModelSelector), `task read commands should use shared read model helper ${readModelSelector}`)
    }
    assert.equal(appTaskMutationCommandsSource.includes('ExtensionContext'), false, 'task mutation commands module should not mention Pi ExtensionContext')
    assert.equal(appTaskMutationCommandsSource.includes('@earendil-works/pi-coding-agent'), false, 'task mutation commands module should not import Pi APIs')
    assert.equal(appTaskCommandSharedSource.includes('ExtensionContext'), false, 'task command shared module should not mention Pi ExtensionContext')
    assert.equal(appTaskCommandSharedSource.includes('@earendil-works/pi-coding-agent'), false, 'task command shared module should not import Pi APIs')
    for (const forbiddenTaskMutationImport of ['../state/taskStore.js', '../state/teamStore.js', '../state/outboxStore.js', '../runtime/', '../adapters/', '../tmux/']) {
      assert.equal(appTaskMutationCommandsSource.includes(forbiddenTaskMutationImport), false, `task mutation commands module should not import ${forbiddenTaskMutationImport}`)
      assert.equal(appTaskCommandSharedSource.includes(forbiddenTaskMutationImport), false, `task command shared module should not import ${forbiddenTaskMutationImport}`)
    }
    for (const mutationCommandExport of ['createTaskCommand', 'assignTaskCommand', 'blockTaskCommand', 'unblockTaskCommand', 'closeTaskCommand', 'progressTaskCommand']) {
      assert.equal(typeof taskMutationCommands[mutationCommandExport], 'function', `task mutation commands module should export ${mutationCommandExport}`)
      assert.ok(appTaskMutationCommandsSource.includes(`function ${mutationCommandExport}`), `${mutationCommandExport} implementation should live in taskMutationCommands`)
      assert.equal(appTaskSource.includes(`function ${mutationCommandExport}`), false, `${mutationCommandExport} implementation should not live in taskApplication`)
    }
    for (const mutationHelper of ['reducerTaskSnapshot', 'applyReducerTransition', 'taskTransitionFailure', 'unsupportedStatusParam', 'unsupportedBlockedByParam']) {
      assert.ok(appTaskCommandSharedSource.includes(`function ${mutationHelper}`), `${mutationHelper} should live in taskCommandShared`)
    }
    assert.ok(appTaskMutationCommandsSource.includes('../core/taskReducer.js'), 'task mutation commands should apply reducer transitions')
    assert.ok(appTaskMutationCommandsSource.includes('buildImplementationCompletionNote'), 'task mutation commands should preserve implementer close completion-note formatting')
    assert.ok(appTaskMutationCommandsSource.includes('deps.teamState.updateTeam'), 'task mutation commands should mutate through injected teamState port')
    assert.ok(appTaskMutationCommandsSource.includes('deps.taskMutations.createTask'), 'task mutation commands should create through injected task mutation port')
    assert.equal(appTaskMutationCommandsSource.includes('deps.outboxStore.enqueue'), false, 'task mutation commands should not plan side effects')
    assert.equal(appTaskSideEffectsSource.includes('ExtensionContext'), false, 'task side effects module should not mention Pi ExtensionContext')
    assert.equal(appTaskSideEffectsSource.includes('@earendil-works/pi-coding-agent'), false, 'task side effects module should not import Pi APIs')
    for (const forbiddenTaskSideEffectsImport of ['../state/', '../runtime/', '../adapters/', '../tmux/']) {
      assert.equal(appTaskSideEffectsSource.includes(forbiddenTaskSideEffectsImport), false, `task side effects module should not import ${forbiddenTaskSideEffectsImport}`)
    }
    assert.equal(typeof taskSideEffects.handleTaskApplicationSideEffects, 'function', 'task side effects module should export handleTaskApplicationSideEffects')
    assert.ok(appTaskSideEffectsSource.includes('function handleTaskApplicationSideEffects'), 'task side effects implementation should live in taskSideEffects')
    assert.equal(appTaskSideEffectsSource.includes('function runTaskOutboxEffects'), false, 'task side effects should use shared selected outbox runner instead of local runner helper')
    assert.ok(appTaskSideEffectsSource.includes('function appendTaskWarnings'), 'task side effects should own task-specific warning text/result mutation')
    assert.equal(appTaskSideEffectsSource.includes('function appendOutboxTaskWarnings'), false, 'task side effects should use shared outbox warning mapping instead of local duplicate')
    assert.equal(appTaskSideEffectsSource.includes('function mailboxMessageId'), false, 'task side effects should use shared deterministic mailbox id helper instead of local duplicate')
    assert.equal(appTaskSource.includes('function handleTaskApplicationSideEffects'), false, 'taskApplication should not implement side-effect runner')
    assert.equal(appTaskSource.includes('function runTaskOutboxEffects'), false, 'taskApplication should not implement outbox runner helper')
    assert.equal(appTaskSource.includes('function appendTaskWarnings'), false, 'taskApplication should not implement side-effect warning formatting')
    assert.equal(appTaskSource.includes('function appendOutboxTaskWarnings'), false, 'taskApplication should not implement outbox warning mapping')
    assert.equal(appTaskSource.includes('function mailboxMessageId'), false, 'taskApplication should not implement deterministic mailbox id helper')
    assert.ok(appTaskSideEffectsSource.includes("workerId: 'task-application'"), 'task side effects should preserve task-application outbox worker id')
    assert.ok(appTaskSideEffectsSource.includes('mailboxMessageIdForEffect'), 'task side effects should use shared deterministic mailbox id helper')
    assert.ok(appOutboxSideEffectsSource.includes('`mailbox-${effectId}`'), 'shared outbox side effects should preserve deterministic mailbox id format')
    assert.ok(appTaskSideEffectsSource.includes('deps.outboxStore.enqueue'), 'task side effects should enqueue through injected outboxStore port')
    assert.ok(appTaskSideEffectsSource.includes('runSelectedOutboxEffects'), 'task side effects should execute through shared selected outbox runner helper')
    assert.equal(appTaskSideEffectsSource.includes('runOutboxOnce'), false, 'task side effects should no longer call low-level outbox runner directly')
    assert.ok(appTaskSideEffectsSource.includes('planTaskReportEffects'), 'task side effects should plan leader attention through report effect planner')
    assert.ok(appTaskSideEffectsSource.includes("kind: 'inbox_item_append_requested'"), 'task side effects should enqueue leader mailbox append effect')
    assert.ok(appTaskSideEffectsSource.includes("kind: 'leader_attention_requested'"), 'task side effects should enqueue leader attention effect')
    assert.ok(appTaskSideEffectsSource.includes('deps.teamState.updateTeam'), 'task side effects should update report mailboxMessageId through injected teamState port')
    assert.ok(appTaskSideEffectsSource.includes('deps.taskMutations.updateTaskReport'), 'task side effects should update TaskReport mailboxMessageId through injected task mutation port')
    for (const sideEffectDetailToken of ['leaderMailboxDelivered', 'mailboxDeliveryFailed', 'outboxRun', 'outboxEffects', 'outboxEffectIds', 'side_effect_failed']) {
      assert.ok(appTaskSideEffectsSource.includes(sideEffectDetailToken), `task side effects should preserve detail/warning token ${sideEffectDetailToken}`)
    }
    assert.ok(appTaskSideEffectsSource.includes("kind: 'task_message_ref_append_requested'"), 'task nudge side effects should append compact TaskMessageRef audit through outbox')
    assert.ok(appTaskSideEffectsSource.includes('agentteam_task_nudge_report'), 'task nudge TaskMessageRef audit should identify the nudge source')
    assert.equal(appOutboxSideEffectsSource.includes('ExtensionContext'), false, 'shared outbox side-effects module should not mention Pi ExtensionContext')
    assert.equal(appOutboxSideEffectsSource.includes('@earendil-works/pi-coding-agent'), false, 'shared outbox side-effects module should not import Pi APIs')
    for (const forbiddenOutboxSideEffectsImport of ['../state/', '../runtime/', '../adapters/', '../tmux/']) {
      assert.equal(appOutboxSideEffectsSource.includes(forbiddenOutboxSideEffectsImport), false, `shared outbox side-effects module should not import ${forbiddenOutboxSideEffectsImport}`)
    }
    assert.equal(typeof outboxSideEffects.mailboxMessageIdForEffect, 'function', 'shared outbox side-effects module should export mailboxMessageIdForEffect')
    assert.equal(typeof outboxSideEffects.outboxWarnings, 'function', 'shared outbox side-effects module should export outboxWarnings')
    assert.equal(typeof outboxSideEffects.outboxEffectRecord, 'function', 'shared outbox side-effects module should export outboxEffectRecord')
    assert.equal(typeof outboxSideEffects.outboxResultForEffect, 'function', 'shared outbox side-effects module should export outboxResultForEffect')
    assert.equal(typeof outboxSideEffects.runSelectedOutboxEffects, 'function', 'shared outbox side-effects module should export runSelectedOutboxEffects')
    assert.ok(appOutboxSideEffectsSource.includes('OutboxRunnerPort'), 'shared outbox side-effects module should use OutboxRunnerPort type')
    assert.ok(appOutboxSideEffectsSource.includes('OutboxStorePort'), 'shared outbox side-effects module should use OutboxStorePort type')
    assert.ok(appOutboxSideEffectsSource.includes('OutboxRunResult'), 'shared outbox side-effects module should use OutboxRunResult type')
    assert.ok(appOutboxSideEffectsSource.includes('outboxEffectWarningName'), 'shared outbox side-effects module should use existing warning-name helper')
    assert.ok(appOutboxSideEffectsSource.includes('outboxRunner.runOnce'), 'shared outbox side-effects module should run effects through injected runner port')
    assert.ok(appOutboxSideEffectsSource.includes('outboxStore.get'), 'shared outbox side-effects module should read effects through injected store port')
    assert.ok(appTaskSideEffectsSource.includes('./outboxSideEffects.js'), 'task side effects should use shared outbox side-effects module')

    assert.equal(outboxSideEffects.mailboxMessageIdForEffect('outbox-demo'), 'mailbox-outbox-demo', 'mailboxMessageIdForEffect should preserve deterministic mailbox-${effectId} format')
    assert.deepEqual(outboxSideEffects.outboxWarnings({
      results: [
        { effectId: 'mailbox-effect', kind: 'inbox_item_append_requested', ok: false, error: 'mailbox failed', terminal: false },
        { effectId: 'worker-effect', kind: 'worker_delivery_requested', ok: false, error: 'worker terminal', terminal: true },
        { effectId: 'leader-effect', kind: 'leader_attention_requested', ok: false, error: 'leader pending' },
        { effectId: 'ok-effect', kind: 'append_event_requested', ok: true },
      ],
    }), [
      { kind: 'pushMailbox', error: 'mailbox failed', effectId: 'mailbox-effect', outboxKind: 'inbox_item_append_requested', outboxStatus: 'pending' },
      { kind: 'requestWorkerDelivery', error: 'worker terminal', effectId: 'worker-effect', outboxKind: 'worker_delivery_requested', outboxStatus: 'failed' },
      { kind: 'requestLeaderAttention', error: 'leader pending', effectId: 'leader-effect', outboxKind: 'leader_attention_requested', outboxStatus: 'pending' },
    ], 'outboxWarnings should map failed run results to existing warning names/statuses')
    assert.deepEqual(outboxSideEffects.outboxEffectRecord('stored-effect', {
      effectId: 'stored-effect',
      kind: 'leader_attention_requested',
      status: 'failed',
      idempotencyKey: 'key:stored-effect',
      lastError: 'stored failure',
    }), {
      effectId: 'stored-effect',
      kind: 'leader_attention_requested',
      status: 'failed',
      idempotencyKey: 'key:stored-effect',
      lastError: 'stored failure',
    }, 'outboxEffectRecord should return message/task-compatible details for stored effects')
    assert.deepEqual(outboxSideEffects.outboxEffectRecord('missing-effect', null), { effectId: 'missing-effect', status: 'pending' }, 'outboxEffectRecord should preserve pending fallback when stored effect is missing')
    const fallbackResult = outboxSideEffects.outboxResultForEffect({
      effectId: 'fallback-effect',
      run: { results: [{ effectId: 'fallback-effect', kind: 'worker_delivery_requested', ok: false, error: 'run failure' }] },
      storedEffect: {
        effectId: 'fallback-effect',
        kind: 'worker_delivery_requested',
        status: 'done',
        idempotencyKey: 'key:fallback-effect',
        result: { requestId: 'stored-request' },
        lastError: 'stored old error',
      },
    })
    assert.equal(fallbackResult.ok, true, 'outboxResultForEffect should treat stored done effect as success when latest run result is unavailable/failed')
    assert.deepEqual(fallbackResult.value, { requestId: 'stored-request' }, 'outboxResultForEffect should fall back to stored effect result')
    assert.equal(fallbackResult.error, 'run failure', 'outboxResultForEffect should preserve latest run error when present')
    assert.equal(fallbackResult.status, 'done')
    const selectedRun = {
      claimed: 2,
      done: 1,
      failed: 1,
      retried: 1,
      terminalFailed: 0,
      results: [
        { effectId: 'selected-mailbox', kind: 'inbox_item_append_requested', ok: true, value: { id: 'run-mailbox' } },
        { effectId: 'selected-leader', kind: 'leader_attention_requested', ok: false, error: 'leader transient', terminal: false },
      ],
    }
    const selectedInput = { teamName: 'outbox-helper-suite', workerId: 'helper-test', effectIds: ['selected-mailbox', 'selected-leader'], limit: 5, now: 1234 }
    const originalSelectedEffectIds = [...selectedInput.effectIds]
    let capturedSelectedRunInput
    const selectedStoreReads = []
    const selectedStoredEffects = {
      'selected-mailbox': { effectId: 'selected-mailbox', kind: 'inbox_item_append_requested', status: 'done', idempotencyKey: 'key:selected-mailbox', result: { id: 'stored-mailbox' } },
      'selected-leader': { effectId: 'selected-leader', kind: 'leader_attention_requested', status: 'pending', idempotencyKey: 'key:selected-leader', lastError: 'stored leader error' },
    }
    const selected = await outboxSideEffects.runSelectedOutboxEffects(selectedInput, {
      outboxRunner: {
        runOnce: async input => {
          capturedSelectedRunInput = input
          return selectedRun
        },
      },
      outboxStore: {
        get: (teamName, effectId) => {
          selectedStoreReads.push(`${teamName}:${effectId}`)
          return selectedStoredEffects[effectId] ?? null
        },
      },
    })
    assert.deepEqual(selectedInput.effectIds, originalSelectedEffectIds, 'runSelectedOutboxEffects should not mutate caller effectIds')
    assert.deepEqual(capturedSelectedRunInput, selectedInput, 'runSelectedOutboxEffects should pass selected run input through injected runner')
    assert.equal(selected.run, selectedRun, 'runSelectedOutboxEffects should return raw runner result')
    assert.deepEqual(selectedStoreReads, ['outbox-helper-suite:selected-mailbox', 'outbox-helper-suite:selected-leader'], 'runSelectedOutboxEffects should read back selected effect records through store')
    assert.equal(selected.records.length, 2, 'runSelectedOutboxEffects should return one record per selected effect')
    assert.equal(selected.records[0].effectId, 'selected-mailbox')
    assert.equal(selected.records[0].status, 'done')
    assert.equal(selected.records[0].idempotencyKey, 'key:selected-mailbox')
    assert.deepEqual(selected.warnings, [{ kind: 'requestLeaderAttention', error: 'leader transient', effectId: 'selected-leader', outboxKind: 'leader_attention_requested', outboxStatus: 'pending' }], 'runSelectedOutboxEffects should include mapped warnings from raw run')
    assert.equal(selected.byId['selected-mailbox'].record.status, 'done')
    assert.equal(selected.byId['selected-mailbox'].result.ok, true)
    assert.deepEqual(selected.byId['selected-mailbox'].result.value, { id: 'run-mailbox' }, 'run result value should take precedence over stored result')
    assert.equal(selected.byId['selected-leader'].record.status, 'pending')
    assert.equal(selected.byId['selected-leader'].result.error, 'leader transient')
    assert.equal(selected.byId['missing-effect'], undefined, 'runSelectedOutboxEffects byId should only contain selected/readback effect ids')
    assert.equal(appTaskReportWorkflowSource.includes('ExtensionContext'), false, 'task report workflow module should not mention Pi ExtensionContext')
    assert.equal(appTaskReportWorkflowSource.includes('@earendil-works/pi-coding-agent'), false, 'task report workflow module should not import Pi APIs')
    for (const forbiddenTaskReportWorkflowImport of ['../state/taskStore.js', '../state/teamStore.js', '../state/outboxStore.js', '../runtime/', '../adapters/', '../tmux/']) {
      assert.equal(appTaskReportWorkflowSource.includes(forbiddenTaskReportWorkflowImport), false, `task report workflow module should not import ${forbiddenTaskReportWorkflowImport}`)
    }
    for (const reportWorkflowExport of ['reportDoneTaskCommand', 'reportBlockedTaskCommand']) {
      assert.equal(typeof taskReportWorkflow[reportWorkflowExport], 'function', `task report workflow module should export ${reportWorkflowExport}`)
      assert.ok(appTaskReportWorkflowSource.includes(`function ${reportWorkflowExport}`), `${reportWorkflowExport} implementation should live in taskReportWorkflow`)
      assert.equal(appTaskSource.includes(`function ${reportWorkflowExport}`), false, `${reportWorkflowExport} implementation should not live in taskApplication`)
    }
    assert.ok(appTaskReportWorkflowSource.includes('function denyNonOwnerReport'), 'non-owner report denial should live in taskReportWorkflow')
    assert.equal(appTaskSource.includes('function denyNonOwnerReport'), false, 'non-owner report denial should not live in taskApplication')
    assert.ok(appTaskReportWorkflowSource.includes('../core/taskReducer.js'), 'task report workflow should apply reducer report transitions')
    assert.ok(appTaskReportWorkflowSource.includes('appendTaskReportHistory'), 'task report workflow should append TaskReport artifacts through shared helper')
    assert.ok(appTaskReportWorkflowSource.includes('appendTaskEventHistory'), 'task report workflow should append report_submitted TaskEvent artifacts through shared helper')
    assert.ok(appTaskReportWorkflowSource.includes("type: 'report_submitted'"), 'task report workflow should preserve report_submitted TaskEvent type')
    assert.ok(appTaskReportWorkflowSource.includes('planTaskReportAttention'), 'task report workflow should plan compact leader report wake metadata')
    assert.ok(appTaskReportWorkflowSource.includes("priority: 'normal'"), 'report_done leader mailbox priority should remain normal')
    assert.ok(appTaskReportWorkflowSource.includes("priority: 'high'"), 'report_blocked leader mailbox priority should remain high')
    for (const sideEffectToken of ['deps.outboxStore.enqueue', 'runOutboxOnce', 'planTaskReportEffects', 'pushMailbox', 'requestLeaderAttention']) {
      assert.equal(appTaskReportWorkflowSource.includes(sideEffectToken), false, `task report workflow should not own side-effect execution token ${sideEffectToken}`)
    }
    assert.ok(appTaskSource.includes("from './taskPermissions.js'"), 'task application should import extracted task permission helpers')
    assert.ok(appTaskSource.includes("from './taskReadCommands.js'"), 'task application should delegate read-only commands to extracted module')
    assert.ok(appTaskSource.includes("from './taskMutationCommands.js'"), 'task application should delegate mutation commands to extracted module')
    assert.ok(appTaskSource.includes("from './taskReportWorkflow.js'"), 'task application should delegate report workflow commands to extracted module')
    assert.ok(appTaskSource.includes("from './taskSideEffects.js'"), 'task application should delegate task-local side effects to extracted module')
    assert.ok(appTaskSource.includes("export { actorRole, ensureTaskPrivilege } from './taskPermissions.js'"), 'task application should preserve task permission helper re-exports')
    assert.ok(appTaskMutationCommandsSource.includes('../core/taskReducer.js'), 'task mutation command boundary should depend on core task reducer')
    assert.equal(appTaskSource.includes('../core/taskNoteModel.js'), false, 'active app task boundary should no longer depend on core task note metadata model')
    assert.equal(appTaskSource.includes('appendStructuredTaskNote'), false, 'active app task boundary should not append legacy task notes')
    assert.ok(appTaskMutationCommandsSource.includes('transitionTask'), 'task mutation command boundary should apply reducer transitions')
    assert.ok(!appTaskSource.includes('../state/outboxStore.js'), 'app task boundary should use injected outbox store port')
    assert.ok(!appTaskSource.includes('../state/taskNotes.js'), 'app task boundary should not import state task note metadata helpers')
    assert.ok(!appTaskSource.includes('../state/taskStore.js'), 'app task boundary should use injected task mutation port')
    assert.ok(!appTaskSource.includes('../state/teamStore.js'), 'app task boundary should use injected team state port')
    assert.equal(appTaskSource.includes('deps.outboxStore.enqueue'), false, 'app task facade should not enqueue durable outbox effects directly after side-effect extraction')
    assert.equal(appTaskSource.includes('runOutboxOnce'), false, 'app task facade should not run outbox effects directly after side-effect extraction')
    assert.equal(appTaskSource.includes('planTaskReportEffects'), false, 'app task facade should not plan report side effects directly after side-effect extraction')
    assert.equal(appTaskSource.includes('deps.teamState.updateTeam'), false, 'app task facade should not record report mailbox delivery directly after side-effect extraction')
    assert.ok(appTaskMutationCommandsSource.includes('deps.teamState.updateTeam'), 'task mutation command boundary should mutate team state through port')
    assert.ok(appTaskMutationCommandsSource.includes('deps.taskMutations.createTask'), 'task mutation command boundary should create tasks through port')
    assert.ok(appTaskReportWorkflowSource.includes('deps.teamState.updateTeam'), 'task report workflow should mutate report artifacts through injected teamState port')
    assert.ok(appTaskSideEffectsSource.includes('deps.outboxStore.enqueue'), 'task side-effect boundary should plan durable outbox effects through injected outboxStore port')
    assert.ok(appTaskSource.includes('executeTaskApplication'), 'app task boundary should expose the task use-case')
    for (const removedCompatWrapper of [
      'tools/messageDelivery.ts',
      'tools/messagePolicy.ts',
      'tools/messageRouting.ts',
      'tools/taskCommands.ts',
      'tools/taskPolicy.ts',
      'tools/taskActionability.ts',
    ]) {
      assert.equal(fs.existsSync(path.join(env.helpers.extRoot, removedCompatWrapper)), false, `${removedCompatWrapper} compatibility wrapper should be removed`)
    }
    const appMessageSource = env.helpers.readSource('app/messageApplication.ts')
    const appMessageTypesSource = env.helpers.readSource('app/messageTypes.ts')
    const sendDepsBlock = appTypesSource.slice(appTypesSource.indexOf('export type MessageApplicationDeps'), appTypesSource.indexOf('export type MessageReceiveApplicationDeps'))
    assert.equal(appMessageSource.includes('ExtensionContext'), false, 'app send boundary should not mention Pi ExtensionContext')
    assert.equal(appMessageSource.includes('@earendil-works/pi-coding-agent'), false, 'app send boundary should not import Pi APIs')
    assert.equal(appMessageSource.includes('ensureTeamForSession('), false, 'app send boundary should not resolve team/session context')
    assert.equal(appMessageSource.includes('currentActor('), false, 'app send boundary should not resolve actor context')
    assert.equal(appMessageSource.includes('invalidateStatus('), false, 'app send boundary should not invalidate Pi status directly')
    assert.equal(appMessageTypesSource.includes('ExtensionContext'), false, 'send app input types should be Pi-context-free')
    assert.equal(appMessageTypesSource.includes('@earendil-works/pi-coding-agent'), false, 'send app input types should not import Pi APIs')
    assert.equal(sendDepsBlock.includes('ExtensionContext'), false, 'send app dependency types should be Pi-context-free')
    assert.equal(sendDepsBlock.includes('ensureTeamForSession'), false, 'send app dependency types should not resolve team/session context')
    assert.equal(sendDepsBlock.includes('currentActor'), false, 'send app dependency types should not resolve actor context')
    assert.equal(sendDepsBlock.includes('invalidateStatus'), false, 'send app dependency types should not invalidate Pi status')
    assert.ok(appMessageSource.includes('../core/messagePolicy.js'), 'app message boundary should depend on core message policy')
    assert.ok(!appMessageSource.includes('../core/taskNoteModel.js'), 'app message boundary should not build new task-bound send refs through task-note metadata model')
    assert.ok(!appMessageSource.includes('../state/outboxStore.js'), 'app message boundary should use injected outbox store port')
    assert.ok(!appMessageSource.includes('../state/taskNotes.js'), 'app message boundary should not import state task note metadata helpers')
    assert.ok(appMessageSource.includes('deps.outboxStore.enqueue'), 'app message boundary should plan durable outbox effect intents through port')
    assert.ok(appMessageSource.includes('executeSendMessageApplication'), 'app message boundary should expose the send use-case')
    assert.ok(appMessageSource.includes('planTaskReportEffects'), 'app message boundary should expose report attention/effect planning for task reports')
    assert.ok(appMessageSource.includes("kind: 'task_message_ref_append_requested'"), 'task-bound send should build refs through TaskMessageRef outbox effect')
    assert.ok(appMessageSource.includes("workerId: 'message-application'"), 'message send outbox workflow should preserve message-application worker id')
    assert.ok(appMessageSource.includes('./outboxSideEffects.js'), 'message send workflow should use shared outbox side-effects module')
    assert.ok(appMessageSource.includes('mailboxMessageIdForEffect'), 'message send workflow should use shared deterministic mailbox helper')
    assert.ok(appMessageSource.includes('runSelectedOutboxEffects'), 'message send workflow should use shared selected outbox runner')
    assert.equal(appMessageSource.includes('function mailboxMessageId'), false, 'message send workflow should not keep local deterministic mailbox helper')
    assert.equal(appMessageSource.includes('function appendOutboxWarnings'), false, 'message send workflow should not keep local outbox warning mapper')
    assert.equal(appMessageSource.includes('function runOutboxForState'), false, 'message send workflow should not keep local low-level selected runner')
    assert.equal(appMessageSource.includes('runOutboxOnce'), false, 'message send workflow should not call low-level outbox runner directly')
    for (const messageOutboxDetailToken of ['outboxRun', 'outboxEffects', 'side_effect_failed', 'requestWorkerDelivery', 'requestLeaderAttention']) {
      assert.ok(appMessageSource.includes(messageOutboxDetailToken), `message send outbox workflow should preserve detail/warning token ${messageOutboxDetailToken}`)
    }
    assert.equal(messageApplication.outboxEffectWarningName, undefined, 'message application should not expose outbox warning mapping directly')
    assert.equal(env.helpers.requireDist('app/outbox.js').outboxEffectWarningName('inbox_item_append_requested'), 'pushMailbox', 'shared outbox warning helper should still map mailbox effects to pushMailbox')
    assert.ok(!appMessageSource.includes('communicationRefMetadata'), 'task-bound send should not build new refs through communicationRefMetadata')
    assert.equal(fs.existsSync(path.join(env.helpers.extRoot, 'app/outboxSideEffects.ts')), true, 'shared outboxSideEffects primitives should exist')
    assert.ok(workerSpawnSource.includes('../app/outboxSideEffects.js'), 'worker spawn workflow should use shared outbox side-effects module')
    const effectRunnerSource = env.helpers.readSource('app/effectRunner.ts')
    assert.ok(effectRunnerSource.includes('outboxHandlers'), 'outbox runner should dispatch injected handlers')
    assert.equal(fs.existsSync(path.join(env.helpers.extRoot, 'core/taskNoteModel.ts')), false, 'task note metadata model should be removed')
    assert.equal(fs.existsSync(path.join(env.helpers.extRoot, 'state/taskNotes.ts')), false, 'task note state helper should be removed')

    assert.equal(messageApplication.canSendMessageType('team-lead', 'assignment'), true)
    assert.equal(messageApplication.canSendMessageType('worker-a', 'assignment'), false)
    assert.equal(messageApplication.canSendMessageType('worker-a', 'question'), true)
    assert.equal(messageApplication.canSendMessageType('worker-a', 'inform'), true)
    assert.equal(messageApplication.canSendMessageType('team-lead', 'fyi'), false)
    assert.equal(messageApplication.canSendMessageType('team-lead', 'blocked'), false)
    assert.equal(messageApplication.canSendMessageType('team-lead', 'report_done'), false)
    assert.deepEqual(
      messageApplication.decideSendMessageAttentionPolicy({ messageType: 'assignment', recipient: 'worker-a' }),
      coreMessagePolicy.decideMessagePolicy({ kind: 'message', messageType: 'assignment', recipientKind: 'worker' }),
      'send assignment attention policy should be core-derived',
    )
    assert.deepEqual(
      messageApplication.decideSendMessageAttentionPolicy({ messageType: 'question', recipient: 'team-lead' }),
      coreMessagePolicy.decideMessagePolicy({ kind: 'message', messageType: 'question', recipientKind: 'leader' }),
      'question-to-leader policy should be core-derived',
    )
    assert.deepEqual(
      messageApplication.decideSendMessageAttentionPolicy({ messageType: 'inform', recipient: 'team-lead' }),
      coreMessagePolicy.decideMessagePolicy({ kind: 'message', messageType: 'inform', recipientKind: 'leader' }),
      'inform-to-leader policy should be core-derived and non-waking',
    )
    assert.deepEqual(
      messageApplication.decideTaskReportAttentionPolicy({ reportType: 'report_blocked' }),
      coreMessagePolicy.decideMessagePolicy({ kind: 'task_report', reportType: 'report_blocked' }),
      'task report attention policy should be core-derived',
    )
    assert.deepEqual(
      messageApplication.planTaskReportAttention('report_done'),
      {
        type: 'report_done',
        policy: coreMessagePolicy.decideMessagePolicy({ kind: 'task_report', reportType: 'report_done' }),
        wakeHint: 'hard',
        metadata: { policyIntent: 'leader_attention' },
      },
      'task report attention plan should provide stable app-level metadata for task/report callers',
    )
    const plannedReportEffects = messageApplication.planTaskReportEffects({
      wakeTeam: { name: 'policy-team' },
      leaderWake: {
        type: 'report_blocked',
        wakeHint: 'soft',
        from: 'worker-a',
        summary: 'blocked report',
        text: 'blocked report text',
        taskId: 'T001',
        threadId: 'task:T001',
      },
      mailboxDelivered: true,
      mailboxMessageId: 'M001',
      leaderMailboxRequired: true,
    })
    assert.equal(plannedReportEffects.leaderAttention.kind, 'requestLeaderAttention')
    assert.equal(plannedReportEffects.leaderAttention.message.type, 'report_blocked')
    assert.equal(plannedReportEffects.leaderAttention.message.wakeHint, 'hard')
    assert.equal(plannedReportEffects.leaderAttention.message.messageId, 'M001')
    assert.deepEqual(
      messageApplication.planTaskReportEffects({
        wakeTeam: { name: 'policy-team' },
        leaderWake: {
          type: 'inform',
          wakeHint: 'hard',
          from: 'worker-a',
          summary: 'not a report',
          text: 'not a report',
        },
        mailboxDelivered: true,
        leaderMailboxRequired: true,
      }),
      {},
      'non-report task wake requests should not be promoted to report projection effects',
    )

    const appBoundaryTeam = modules.state.createInitialTeamState({
      teamName: 'app-boundary-suite',
      leaderSessionFile: '/tmp/app-boundary-suite-leader.jsonl',
      leaderCwd: '/tmp/app-boundary-suite',
    })
    modules.state.upsertMember(appBoundaryTeam, {
      name: 'worker-a',
      role: 'researcher',
      cwd: '/tmp/app-boundary-suite',
      sessionFile: '/tmp/app-boundary-suite-worker-a.jsonl',
      paneId: '%worker-a',
    })
    modules.state.writeTeamState(appBoundaryTeam)
    modules.state.writeSessionContext('/tmp/app-boundary-suite-leader.jsonl', { teamName: 'app-boundary-suite', memberName: 'team-lead' })
    const appBoundaryCtx = env.helpers.createCtx('/tmp/app-boundary-suite', '/tmp/app-boundary-suite-leader.jsonl', env.notifications)
    const appEffectOrder = []
    const appResult = await messageApplication.executeSendMessageApplication({
      params: { to: 'worker-a', type: 'question', message: 'app boundary direct send' },
      context: { team: appBoundaryTeam, actor: 'team-lead' },
    }, env.patches.withOutboxHandlers({
      ...env.patches.deps,
      pushMailboxMessage: (teamName, memberName, message) => {
        appEffectOrder.push(`pushMailbox:${memberName}:${message.type}:${message.wakeHint}`)
        return modules.state.pushMailboxMessage(teamName, memberName, message)
      },
      requestWorkerDelivery: async (_team, memberName, _explicitTask, options) => {
        appEffectOrder.push(`requestWorkerDelivery:${memberName}:${options?.wakeHint}:${options?.reason}`)
        return { ok: true, recipient: memberName, wakeHint: options?.wakeHint, reason: 'app boundary requested', method: 'bridge_requested', requestId: 'req-app-boundary' }
      },
    }))
    if (appResult.statusInvalidationRequested) appEffectOrder.push('invalidateStatus')
    assert.equal(appResult.text, 'Sent message to worker-a')
    assert.deepEqual(appResult.details.recipients, ['worker-a'])
    assert.equal(appResult.details.wakeByRecipient[0].policyIntent, 'recipient_attention')
    assert.equal(appResult.details.wakeByRecipient[0].policyReason, 'question routes to recipient attention')
    assert.equal(appResult.details.wakeByRecipient[0].wakeHint, 'soft')
    assert.equal(appResult.details.wakeByRecipient[0].method, 'bridge_requested')
    assert.deepEqual(appEffectOrder, [
      'pushMailbox:worker-a:question:soft',
      'requestWorkerDelivery:worker-a:soft:question routes to recipient attention',
      'invalidateStatus',
    ])

    const appReceiveMailboxRows = [{
      id: 'app-receive-oldest',
      from: 'worker-a',
      to: 'team-lead',
      text: 'oldest direct receive body',
      type: 'inform',
      createdAt: 10,
    }, {
      id: 'app-receive-report',
      from: 'worker-a',
      to: 'team-lead',
      text: 'compact report notification',
      summary: 'compact report notification summary',
      type: 'report_done',
      createdAt: 20,
      metadata: { reportId: 'TRAPP' },
    }, {
      id: 'app-receive-newest',
      from: 'worker-a',
      to: 'team-lead',
      text: 'newest direct receive body',
      type: 'question',
      createdAt: 30,
    }]
    const appReceiveTeam = {
      ...appBoundaryTeam,
      taskReports: {
        TRAPP: {
          id: 'TRAPP',
          taskId: 'TAPP',
          type: 'report_done',
          author: 'worker-a',
          text: 'hydrated direct receive report body',
          summary: 'hydrated direct receive report summary',
          createdAt: 15,
          reportOnly: true,
          reporterIsOwner: true,
          statusAtReport: 'open',
          ownerAtReport: 'worker-a',
        },
      },
    }
    const receiveMarks = []
    const directReceive = messageReceiveApplication.executeReceiveMessagesApplication({
      params: { markRead: false, limit: 2 },
      context: { team: appReceiveTeam, actor: 'team-lead' },
    }, {
      mailboxRepository: {
        readMailbox: () => appReceiveMailboxRows,
        markDelivered: (_teamName, memberName, ids) => receiveMarks.push({ kind: 'delivered', memberName, ids }),
        markRead: (_teamName, memberName, ids) => receiveMarks.push({ kind: 'read', memberName, ids }),
      },
      taskHistory: { findTaskReport: (team, reportId) => team.taskReports[reportId] },
    })
    assert.deepEqual(directReceive.details.messages.map(message => message.id), ['app-receive-oldest', 'app-receive-report'], 'direct receive app should preserve chronological unread return order and limit')
    assert.equal(directReceive.details.markRead, false, 'direct receive app should preserve markRead=false')
    assert.equal(directReceive.details.hydratedReports.TRAPP.text, 'hydrated direct receive report body', 'direct receive app should hydrate TaskReport bodies')
    assert.deepEqual(receiveMarks, [{ kind: 'delivered', memberName: 'team-lead', ids: ['app-receive-oldest', 'app-receive-report'] }], 'markRead=false should mark delivered only')
    const directReceiveDenied = messageReceiveApplication.executeReceiveMessagesApplication({
      params: { markRead: true, limit: 1 },
      context: { team: appReceiveTeam, actor: 'missing-worker' },
    }, {
      mailboxRepository: {
        readMailbox: () => { throw new Error('should not read mailbox for non-member actor') },
        markDelivered: () => {},
        markRead: () => {},
      },
      taskHistory: { findTaskReport: () => undefined },
    })
    assert.equal(directReceiveDenied.text, 'Current actor missing-worker is not a member of team app-boundary-suite.', 'non-member receive denial should remain unchanged')

    const taskAppResult = await taskApplication.executeTaskApplication({
      params: { action: 'create', title: 'Task app boundary task', description: 'created directly through app task boundary', owner: 'worker-a' },
      context: { team: appBoundaryTeam, actor: 'team-lead' },
    }, env.patches.withOutboxHandlers({
      ...env.patches.deps,
    }))
    if (taskAppResult.statusInvalidationRequested) appEffectOrder.push('taskInvalidateStatus')
    assert.ok(taskAppResult.text.includes('Created T001'), 'task app boundary should execute task create use-case directly')
    assert.equal(taskAppResult.details.task.status, 'open', 'task app boundary create should use vNext open status')
    assert.equal(taskAppResult.details.task.owner, 'worker-a')
    assert.ok(appEffectOrder.includes('taskInvalidateStatus'), 'task app boundary should request status invalidation for the adapter')

    modules.state.deleteTeamState('app-boundary-suite')
    modules.state.clearSessionContext('/tmp/app-boundary-suite-leader.jsonl')
    const team = {
      members: {
        'team-lead': { role: 'not-a-real-leader-role' },
        plan: { role: ' Planner ' },
        impl: { role: 'implementer' },
        blank: { role: '   ' },
      },
    }
    assert.equal(taskPermissions.actorRole(team, 'team-lead'), 'leader', 'team-lead name should always resolve as leader')
    assert.equal(taskPermissions.actorRole(team, 'plan'), 'planner', 'roles should be trimmed and lowercased')
    assert.equal(taskPermissions.actorRole(team, 'impl'), 'implementer')
    assert.equal(taskPermissions.actorRole(team, 'blank'), '', 'blank member role should stay empty before denial fallback')
    assert.equal(taskPermissions.actorRole(team, 'missing-worker'), '', 'unknown actor role should stay empty before denial fallback')
    assert.equal(taskApplication.actorRole(team, 'team-lead'), taskPermissions.actorRole(team, 'team-lead'), 'taskApplication should preserve actorRole compatibility re-export')
    assert.equal(taskApplication.actorRole(team, 'plan'), taskPermissions.actorRole(team, 'plan'), 'taskApplication should preserve normalized actorRole behavior')
    assert.equal(taskApplication.actorRole(team, 'impl'), taskPermissions.actorRole(team, 'impl'), 'taskApplication should preserve actorRole compatibility re-export')
    for (const leaderAction of ['create', 'assign', 'block', 'unblock', 'close', 'nudge_report', 'note']) {
      assert.equal(taskPermissions.ensureTaskPrivilege(team, 'team-lead', leaderAction), null, `team-lead should bypass privilege denial for ${leaderAction}`)
      assert.equal(taskApplication.ensureTaskPrivilege(team, 'team-lead', leaderAction), null, `taskApplication re-export should preserve leader privilege for ${leaderAction}`)
    }
    for (const workerAllowedAction of ['list', 'show', 'history', 'reports', 'report', 'progress', 'report_done', 'report_blocked']) {
      assert.equal(taskPermissions.ensureTaskPrivilege(team, 'plan', workerAllowedAction), null, `non-leader should be allowed to ${workerAllowedAction}`)
      assert.equal(taskApplication.ensureTaskPrivilege(team, 'plan', workerAllowedAction), null, `taskApplication re-export should allow ${workerAllowedAction}`)
    }
    for (const leaderOnlyAction of ['create', 'assign', 'block', 'unblock', 'close', 'nudge_report']) {
      const denial = taskPermissions.ensureTaskPrivilege(team, 'plan', leaderOnlyAction)
      assert.ok(denial.includes(`Task action '${leaderOnlyAction}' is leader-only for plan (planner). Allowed for non-leaders: list/show/history/reports/report/progress/report_done/report_blocked`), `${leaderOnlyAction} denial text should remain exact`)
      assert.equal(taskApplication.ensureTaskPrivilege(team, 'plan', leaderOnlyAction), denial, `taskApplication re-export should preserve ${leaderOnlyAction} denial text`)
    }
    assert.ok(taskPermissions.ensureTaskPrivilege(team, 'plan', 'note').includes("Task action 'note' is leader-only"), 'removed note action should not be worker-allowed')
    assert.ok(taskApplication.ensureTaskPrivilege(team, 'plan', 'note').includes("Task action 'note' is leader-only"), 'removed note action should not be worker-allowed through compatibility re-export')
    assert.ok(taskPermissions.ensureTaskPrivilege(team, 'impl', 'note').includes("Task action 'note' is leader-only"), 'removed note action should not be implementer-allowed')
    assert.ok(taskPermissions.ensureTaskPrivilege(team, 'impl', 'assign').includes("Task action 'assign' is leader-only"))
    assert.equal(taskPermissions.ensureTaskPrivilege(team, 'impl', 'assign') === null, false)
    assert.ok(taskPermissions.ensureTaskPrivilege(team, 'blank', 'create').includes("Task action 'create' is leader-only for blank (worker)."), 'blank role denial should use worker fallback')
    assert.ok(taskPermissions.ensureTaskPrivilege(team, 'missing-worker', 'create').includes("Task action 'create' is leader-only for missing-worker (worker)."), 'unknown actor denial should use worker fallback')

    const emptyCompletion = taskFormatting.buildImplementationCompletionNote()
    assert.ok(emptyCompletion.includes('Files changed:'))
    const briefCompletion = taskFormatting.buildImplementationCompletionNote('Implemented feature')
    assert.ok(briefCompletion.startsWith('Implemented feature'))
    assert.ok(briefCompletion.includes('Checks run:'))
    const structuredCompletion = taskFormatting.buildImplementationCompletionNote('Files changed: a.ts\nChecks run: npm test')
    assert.equal(structuredCompletion, 'Files changed: a.ts\nChecks run: npm test')

    assert.equal(contextService.shouldSyncMailboxOnInput({ source: 'interactive', text: 'ask agentteam for blocks' }), true)
    assert.equal(contextService.shouldSyncMailboxOnInput({ source: 'interactive', text: '/team' }), true)
    assert.equal(contextService.shouldSyncMailboxOnInput({ source: 'interactive', text: '/help' }), false)
    assert.equal(contextService.shouldSyncMailboxOnInput({ source: 'api', text: 'agentteam' }), false)

    const bridgeTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-pump-suite',
      leaderSessionFile: '/tmp/bridge-pump-leader.jsonl',
      leaderCwd: '/tmp/bridge-pump-project',
      description: 'bridge pump test',
    })
    env.modules.state.upsertMember(bridgeTeam, {
      name: 'bridge-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-pump-project',
      sessionFile: '/tmp/bridge-pump-worker.jsonl',
      paneId: '%bridge-worker',
      windowTarget: 'test:@1',
      status: 'idle',
    })
    env.modules.state.upsertMember(bridgeTeam, {
      name: 'unrelated-worker',
      role: 'researcher',
      cwd: '/tmp/bridge-pump-project',
      sessionFile: '/tmp/unrelated-worker.jsonl',
      status: 'pending_delivery',
      bridgeWorkRequestedAt: 12345,
      bridgeWorkRequestMessageIds: ['unrelated-message'],
      bridgeWorkRequestBootPrompt: 'unrelated boot',
    })
    env.modules.state.upsertMember(bridgeTeam, {
      name: 'maintenance-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-pump-project',
      sessionFile: '/tmp/maintenance-worker.jsonl',
      paneId: '%maintenance-worker',
      windowTarget: 'test:@2',
      status: 'idle',
    })
    env.modules.state.writeTeamState(bridgeTeam)
    const bridgeHookOutbox = env.modules.state.enqueueOutboxEffect({
      teamName: bridgeTeam.name,
      kind: 'inbox_item_append_requested',
      idempotencyKey: 'bridge-session-hook-outbox',
      payload: {
        teamName: bridgeTeam.name,
        recipient: 'bridge-hook-worker',
        message: {
          from: 'team-lead',
          to: 'bridge-hook-worker',
          text: 'session hook should run outbox maintenance',
          type: 'inform',
          wakeHint: 'none',
        },
      },
    })
    const initialBridgeMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge worker please handle this',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [initialBridgeMessage.id] })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      sessionFile: '/tmp/bridge-pump-worker.jsonl',
    })

    const bridgeSends = []
    let bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { bridgeSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, true)
    assert.equal(bridgeSends.length, 1, 'bridge pump should submit one pi-native user message')
    assert.ok(bridgeSends[0].content.includes('bridge worker please handle this'))
    let bridgeMailbox = env.modules.state.readMailbox(bridgeTeam.name, 'bridge-worker')
    assert.equal(bridgeMailbox[0].deliveredAt, undefined, 'bridge submit should not mark message delivered before ack/start')
    assert.equal(bridgeMailbox[0].readAt, undefined, 'bridge submit should not mark message read')
    let bridgeDeliveryRequests = Object.values(env.modules.state.readDeliveryRequestStore(bridgeTeam.name).requests)
      .filter(request => request.memberName === 'bridge-worker')
    assert.equal(bridgeDeliveryRequests[0].status, 'submitted', 'bridge success should mark request submitted only')
    const bridgeWorkerAfterSuccess = env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker']
    assert.equal(bridgeWorkerAfterSuccess.bridgeAvailable, true, 'bridge success should publish bridge availability')
    assert.equal(bridgeWorkerAfterSuccess.bridgeVersion, env.modules.runtimeBridge.BRIDGE_VERSION, 'bridge success should publish bridge version')
    assert.ok(bridgeWorkerAfterSuccess.bridgeLastDeliveryAt, 'bridge success should record last native delivery time')

    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { bridgeSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(bridgePump.reason, 'no pending bridge delivery request')
    assert.equal(bridgeSends.length, 1, 'second bridge pump should not duplicate delivered message')
    assert.equal(
      env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker'].lastWakeReason,
      'bridge submitted prompt',
      'idempotent no-op pump should not churn member status',
    )

    const busyFollowupMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge busy followup',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [busyFollowupMessage.id] })
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      ctx: {
        isIdle: () => false,
        sendUserMessage: (content, options) => { bridgeSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(bridgePump.reason, 'native session busy for bridge delivery')
    assert.equal(bridgeSends.length, 1, 'busy bridge delivery should not submit followUp')
    env.modules.state.transitionDeliveryRequest(bridgeTeam.name, Object.values(env.modules.state.readDeliveryRequestStore(bridgeTeam.name).requests).find(request => request.memberName === 'bridge-worker' && request.status === 'pending').requestId, 'cancelled')

    const openFollowupMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge pending followup',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [openFollowupMessage.id] })
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      ctx: {
        isIdle: () => true,
        hasPendingMessages: () => true,
        sendUserMessage: (content, options) => { bridgeSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(bridgePump.reason, 'native session busy for bridge delivery')
    assert.equal(bridgeSends.length, 1, 'pending native messages should not submit followUp')
    env.modules.state.transitionDeliveryRequest(bridgeTeam.name, Object.values(env.modules.state.readDeliveryRequestStore(bridgeTeam.name).requests).find(request => request.memberName === 'bridge-worker' && request.status === 'pending').requestId, 'cancelled')

    const recoverClaimMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge recover expired claim',
      type: 'question',
    })
    const recoverClaimRequest = env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [recoverClaimMessage.id], now: 100_000 })
    const recoverClaimed = env.modules.state.claimDeliveryRequest(bridgeTeam.name, recoverClaimRequest.requestId, {
      bridgeId: 'stale-bridge',
      generation: 1,
      claimTtlMs: 100,
      now: 100_010,
      messageIds: [recoverClaimMessage.id],
      promptHash: 'stale-claim-hash',
    })
    assert.equal(recoverClaimed.status, 'claimed')
    const bridgeRecoverSends = []
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      now: 100_200,
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { bridgeRecoverSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, true, 'pump should recover expired claim and submit once')
    assert.equal(bridgeRecoverSends.length, 1)
    assert.ok(bridgeRecoverSends[0].content.includes('bridge recover expired claim'))
    assert.equal(env.modules.state.getDeliveryRequest(bridgeTeam.name, recoverClaimRequest.requestId).status, 'submitted')

    env.modules.state.upsertMember(bridgeTeam, {
      name: 'maintenance-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-pump-project',
      sessionFile: '/tmp/maintenance-worker.jsonl',
      paneId: '%maintenance-worker',
      windowTarget: 'test:@2',
      status: 'idle',
    })
    const unrelatedMirrorBeforeExpiredPending = env.modules.state.readTeamState(bridgeTeam.name).members['unrelated-worker']
    const expiredPendingMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'maintenance-worker', {
      from: 'team-lead',
      to: 'maintenance-worker',
      text: 'bridge expired pending should not send',
      type: 'question',
    })
    const expiredPendingRequest = env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'maintenance-worker', { messageIds: [expiredPendingMessage.id], now: 200_000 })
    const expiredOpenSends = []
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'maintenance-worker',
      sessionFile: '/tmp/maintenance-worker.jsonl',
      now: 200_000 + 5 * 60_000,
    })
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'maintenance-worker',
      now: 200_000 + 5 * 60_000 + 1,
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { expiredOpenSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(bridgePump.reason, 'no pending bridge delivery request')
    assert.equal(expiredOpenSends.length, 0, 'expired pending request should not submit prompt')
    assert.equal(env.modules.state.getDeliveryRequest(bridgeTeam.name, expiredPendingRequest.requestId).status, 'expired')
    assert.deepEqual(env.modules.state.readTeamState(bridgeTeam.name).members['unrelated-worker'], unrelatedMirrorBeforeExpiredPending, 'member-scoped maintenance should not clear unrelated member mirror/status')
    const bridgeWorkerAfterExpiredOpen = env.modules.state.readTeamState(bridgeTeam.name).members['maintenance-worker']
    assert.equal(bridgeWorkerAfterExpiredOpen.bridgeWorkRequestedAt, undefined, 'expired pending maintenance should clear bridge mirror')
    assert.equal(bridgeWorkerAfterExpiredOpen.bridgeWorkRequestMessageIds, undefined)

    const expiredClaimMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'maintenance-worker', {
      from: 'team-lead',
      to: 'maintenance-worker',
      text: 'bridge expired claimed should not send',
      type: 'question',
    })
    const expiredClaimRequest = env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'maintenance-worker', { messageIds: [expiredClaimMessage.id], now: 300_000 })
    env.modules.state.claimDeliveryRequest(bridgeTeam.name, expiredClaimRequest.requestId, {
      bridgeId: 'stale-bridge',
      generation: 1,
      claimTtlMs: 100,
      now: 300_010,
      messageIds: [expiredClaimMessage.id],
      promptHash: 'expired-claim-hash',
    })
    const expiredClaimSends = []
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'maintenance-worker',
      sessionFile: '/tmp/maintenance-worker.jsonl',
      now: 300_000 + 5 * 60_000,
    })
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'maintenance-worker',
      now: 300_000 + 5 * 60_000 + 1,
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { expiredClaimSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(expiredClaimSends.length, 0, 'expired claimed request should not submit prompt')
    assert.equal(env.modules.state.getDeliveryRequest(bridgeTeam.name, expiredClaimRequest.requestId).status, 'expired')
    assert.equal(env.modules.state.readTeamState(bridgeTeam.name).members['maintenance-worker'].bridgeWorkRequestedAt, undefined, 'expired claimed maintenance should clear bridge mirror')

    const submittedNoResendMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge submitted should not resend after ttl',
      type: 'question',
    })
    const submittedNoResendRequest = env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [submittedNoResendMessage.id], now: 400_000 })
    env.modules.state.claimDeliveryRequest(bridgeTeam.name, submittedNoResendRequest.requestId, {
      bridgeId: 'submitted-bridge',
      generation: 1,
      claimTtlMs: 1_000,
      now: 400_010,
      messageIds: [submittedNoResendMessage.id],
      promptHash: 'submitted-hash',
    })
    env.modules.state.transitionDeliveryRequest(bridgeTeam.name, submittedNoResendRequest.requestId, 'submitted', { now: 400_020 })
    const submittedNoResendSends = []
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      sessionFile: '/tmp/bridge-pump-worker.jsonl',
      now: 400_000 + 5 * 60_000,
    })
    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.updateMemberStatus(latest, 'bridge-worker', { status: 'queued', lastWakeReason: 'submitted request still queued' })
    })
    const submittedQueuedStatusAt = env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker'].updatedAt
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      now: Math.max(400_000 + 5 * 60_000 + 1, submittedQueuedStatusAt + 1),
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { submittedNoResendSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(submittedNoResendSends.length, 0, 'submitted request past TTL should not be resent')
    const submittedNoResendStored = env.modules.state.getDeliveryRequest(bridgeTeam.name, submittedNoResendRequest.requestId)
    assert.equal(submittedNoResendStored.status, 'submitted')
    assert.equal(env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker'].status, 'queued', 'submitted request maintenance must not recover queued worker to idle')
    env.modules.state.transitionDeliveryRequest(bridgeTeam.name, submittedNoResendRequest.requestId, 'cancelled', { now: Math.max(400_000 + 5 * 60_000 + 2, submittedQueuedStatusAt + 2) })
    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.updateMemberStatus(latest, 'bridge-worker', { status: 'idle', lastWakeReason: 'reset after submitted no-resend check' })
    })

    const startedNoResendMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge started should not resend after ttl',
      type: 'question',
    })
    const startedNoResendRequest = env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [startedNoResendMessage.id], now: 500_000 })
    env.modules.state.claimDeliveryRequest(bridgeTeam.name, startedNoResendRequest.requestId, {
      bridgeId: 'started-bridge',
      generation: 1,
      claimTtlMs: 1_000,
      now: 500_010,
      messageIds: [startedNoResendMessage.id],
      promptHash: 'started-hash',
    })
    env.modules.state.transitionDeliveryRequest(bridgeTeam.name, startedNoResendRequest.requestId, 'submitted', { now: 500_020 })
    env.modules.state.transitionDeliveryRequest(bridgeTeam.name, startedNoResendRequest.requestId, 'started', { now: 500_030 })
    const startedNoResendSends = []
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      sessionFile: '/tmp/bridge-pump-worker.jsonl',
      now: 500_000 + 5 * 60_000,
    })
    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.updateMemberStatus(latest, 'bridge-worker', { status: 'running', lastWakeReason: 'started request still running' })
    })
    const startedRunningStatusAt = env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker'].updatedAt
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      now: Math.max(500_000 + 5 * 60_000 + 1, startedRunningStatusAt + 1),
      ctx: {
        isIdle: () => true,
        sendUserMessage: (content, options) => { startedNoResendSends.push({ content, options }) },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(startedNoResendSends.length, 0, 'started request past TTL should not be resent')
    assert.equal(env.modules.state.getDeliveryRequest(bridgeTeam.name, startedNoResendRequest.requestId).status, 'started')
    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.updateMemberStatus(latest, 'bridge-worker', { status: 'idle', lastWakeReason: 'reset after submitted/started no-resend checks' })
    })

    const alternateApiMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge sendMessage alternate API',
      type: 'question',
    })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      sessionFile: '/tmp/bridge-pump-worker.jsonl',
    })
    const bridgeCustomMessages = []
    const bridgeCustomNow = Date.now()
    env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [alternateApiMessage.id], now: bridgeCustomNow })
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      now: bridgeCustomNow,
      ctx: {
        isIdle: () => true,
        sendMessage: (message, options) => { bridgeCustomMessages.push({ message, options }) },
      },
    })
    assert.equal(bridgePump.ok, true)
    assert.equal(bridgeCustomMessages[0].message.customType, 'agentteam-bridge-delivery')
    assert.equal(bridgeCustomMessages[0].options.triggerTurn, true, 'sendMessage alternate API should trigger a turn')
    const sendMessageAlternateStored = env.modules.state.readMailbox(bridgeTeam.name, 'bridge-worker')
      .find(message => message.text.includes('bridge sendMessage alternate API'))
    assert.equal(sendMessageAlternateStored?.deliveredAt, undefined, 'sendMessage alternate API submit should not mark delivered')
    assert.equal(sendMessageAlternateStored?.readAt, undefined, 'sendMessage alternate API success should not mark read')

    const throwingBridgeMessage = env.modules.state.pushMailboxMessage(bridgeTeam.name, 'bridge-worker', {
      from: 'team-lead',
      to: 'bridge-worker',
      text: 'bridge send throws remains undelivered',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-worker', { messageIds: [throwingBridgeMessage.id] })
    bridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-worker',
      ctx: {
        isIdle: () => true,
        sendUserMessage: () => { throw new Error('native send failed') },
      },
    })
    assert.equal(bridgePump.ok, false)
    assert.equal(bridgePump.reason, 'bridge delivery failed')
    assert.equal(typeof env.helpers.requireDist('runtime/bridgeDeliveryPump.js').pumpBridgeOnce, 'function', 'focused bridgeDeliveryPump module should expose pumpBridgeOnce')
    bridgeMailbox = env.modules.state.readMailbox(bridgeTeam.name, 'bridge-worker')
    const failedBridgeMessage = bridgeMailbox.find(message => message.text.includes('bridge send throws'))
    assert.equal(failedBridgeMessage?.deliveredAt, undefined, 'failed bridge send should leave message undelivered')
    const bridgeWorkerAfterFailure = env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker']
    assert.equal(bridgeWorkerAfterFailure.bridgeAvailable, false, 'failed bridge should mark bridge unavailable for later policy-selected retry')
    assert.ok(String(bridgeWorkerAfterFailure.bridgeLastError || '').includes('native send failed'))
    assert.ok(String(bridgeWorkerAfterFailure.lastError || '').includes('native send failed'))
    env.modules.runtimeBridge.markBridgeStopped(bridgeTeam.name, 'bridge-worker')
    const bridgeWorkerAfterFailureStop = env.modules.state.readTeamState(bridgeTeam.name).members['bridge-worker']
    assert.ok(String(bridgeWorkerAfterFailureStop.bridgeLastError || '').includes('native send failed'), 'normal stop after failure should preserve bridgeLastError')
    assert.ok(String(bridgeWorkerAfterFailureStop.lastError || '').includes('native send failed'), 'normal stop after failure should preserve lastError')

    const promptTeam = env.modules.state.createInitialTeamState({
      teamName: 'prompt-consolidation-suite',
      leaderSessionFile: '/tmp/prompt-consolidation-leader.jsonl',
      leaderCwd: '/tmp/prompt-consolidation-project',
    })
    env.modules.state.upsertMember(promptTeam, {
      name: 'prompt-worker',
      role: 'implementer',
      cwd: '/tmp/prompt-consolidation-project',
      sessionFile: '/tmp/prompt-consolidation-worker.jsonl',
      status: 'idle',
      bootPrompt: 'prompt boot work',
    })
    const promptTask = env.modules.state.createTask(promptTeam, {
      title: 'Prompt task',
      description: 'prompt assigned task',
    })
    promptTask.owner = 'prompt-worker'
    promptTask.status = 'open'
    env.modules.state.writeTeamState(promptTeam)
    const promptMessage = env.modules.state.pushMailboxMessage(promptTeam.name, 'prompt-worker', {
      from: 'team-lead',
      to: 'prompt-worker',
      text: 'prompt unread message',
      type: 'question',
    })
    const promptMessages = env.modules.state.peekUnreadMailbox(promptTeam.name, 'prompt-worker')
    const bridgePrompt = env.modules.runtimeBridge.buildBridgeTurnPrompt(promptTeam, 'prompt-worker', 'explicit prompt instruction', promptMessages, { allowAssignedTaskTrigger: true })
    const sharedPrompt = env.modules.workerTurnPrompt.buildWorkerTurnPrompt(promptTeam, 'prompt-worker', {
      explicitInstruction: 'explicit prompt instruction',
      unreadMessages: promptMessages,
      allowAssignedTaskTrigger: true,
    })
    assert.equal(bridgePrompt, sharedPrompt, 'bridge prompt should use consolidated worker turn prompt builder')
    assert.ok(bridgePrompt.includes('Boot: prompt boot work'), 'prompt should include boot first')
    assert.ok(bridgePrompt.indexOf('Boot: prompt boot work') < bridgePrompt.indexOf('Assigned tasks:'), 'boot should precede assigned tasks')
    assert.ok(bridgePrompt.indexOf('Assigned tasks:') < bridgePrompt.indexOf('Messages:'), 'assigned tasks should precede messages')
    assert.ok(bridgePrompt.indexOf('Messages:') < bridgePrompt.indexOf('Instruction:'), 'messages should precede explicit instruction')
    assert.ok(bridgePrompt.includes(promptMessage.text), 'prompt should include unread message text')

    const dedupePromptTeam = env.modules.state.createInitialTeamState({
      teamName: 'worker-prompt-same-task-dedupe-suite',
      leaderSessionFile: '/tmp/worker-prompt-same-task-dedupe-leader.jsonl',
      leaderCwd: '/tmp/worker-prompt-same-task-dedupe-project',
    })
    env.modules.state.upsertMember(dedupePromptTeam, {
      name: 'dedupe-worker',
      role: 'implementer',
      cwd: '/tmp/worker-prompt-same-task-dedupe-project',
      sessionFile: '/tmp/worker-prompt-same-task-dedupe-worker.jsonl',
      status: 'idle',
    })
    const dedupeTask = env.modules.state.createTask(dedupePromptTeam, {
      title: 'Dedupe prompt task',
      description: 'same task should appear once with message signals',
    })
    dedupeTask.owner = 'dedupe-worker'
    dedupeTask.status = 'open'
    const otherTask = env.modules.state.createTask(dedupePromptTeam, {
      title: 'Other task prompt',
      description: 'different task message should stay in Messages',
    })
    otherTask.owner = 'someone-else'
    otherTask.status = 'open'
    env.modules.state.writeTeamState(dedupePromptTeam)
    const sameTaskAssignmentText = 'UNIQUE same task assignment instruction: implement the compact path'
    const sameTaskQuestionText = 'UNIQUE same task question: which validation should run?'
    const unscopedMessageText = 'UNIQUE unscoped message should remain standalone'
    const differentTaskMessageText = 'UNIQUE different task message should remain standalone'
    const sameTaskAssignment = env.modules.state.pushMailboxMessage(dedupePromptTeam.name, 'dedupe-worker', {
      from: 'team-lead',
      to: 'dedupe-worker',
      text: sameTaskAssignmentText,
      summary: 'assignment summary signal',
      type: 'assignment',
      taskId: dedupeTask.id,
    })
    const sameTaskQuestion = env.modules.state.pushMailboxMessage(dedupePromptTeam.name, 'dedupe-worker', {
      from: 'team-lead',
      to: 'dedupe-worker',
      text: sameTaskQuestionText,
      type: 'question',
      taskId: dedupeTask.id,
    })
    const unscopedPromptMessage = env.modules.state.pushMailboxMessage(dedupePromptTeam.name, 'dedupe-worker', {
      from: 'researcher',
      to: 'dedupe-worker',
      text: unscopedMessageText,
      type: 'inform',
    })
    const differentTaskPromptMessage = env.modules.state.pushMailboxMessage(dedupePromptTeam.name, 'dedupe-worker', {
      from: 'planner',
      to: 'dedupe-worker',
      text: differentTaskMessageText,
      type: 'question',
      taskId: otherTask.id,
    })
    const dedupePromptMessages = env.modules.state.peekUnreadMailbox(dedupePromptTeam.name, 'dedupe-worker')
    const dedupePrompt = env.modules.workerTurnPrompt.buildWorkerTurnPrompt(dedupePromptTeam, 'dedupe-worker', {
      unreadMessages: dedupePromptMessages,
      allowAssignedTaskTrigger: true,
    })
    assert.ok(dedupePrompt.includes('Assigned tasks: T001 Dedupe prompt task'), 'assigned task should render task-centric block')
    assert.ok(dedupePrompt.includes('task messages: [type=assignment from=team-lead summary=assignment summary signal]'), 'same-task assignment should be compactly merged under assigned task')
    assert.ok(dedupePrompt.includes('[type=question from=team-lead]'), 'same-task question should be compactly merged under assigned task')
    assert.equal(countOccurrences(dedupePrompt, sameTaskAssignmentText), 1, 'same task assignment instruction should be preserved exactly once')
    assert.equal(countOccurrences(dedupePrompt, sameTaskQuestionText), 1, 'same task question should be preserved exactly once')
    assert.equal(countOccurrences(dedupePrompt, 'Dedupe prompt task'), 1, 'same task title should not be repeated in Messages')
    const dedupeMessagesSection = dedupePrompt.slice(dedupePrompt.indexOf('Messages:'))
    assert.ok(!dedupeMessagesSection.includes(sameTaskAssignmentText), 'same-task assignment body should not repeat in Messages')
    assert.ok(!dedupeMessagesSection.includes(sameTaskQuestionText), 'same-task question body should not repeat in Messages')
    assert.ok(dedupeMessagesSection.includes(unscopedMessageText), 'unscoped message should remain in Messages')
    assert.ok(dedupeMessagesSection.includes(differentTaskMessageText), 'different-task message should remain in Messages')
    assert.ok(dedupePrompt.includes('Do the work now'), 'assignment on same task should keep work instruction')
    assert.ok(dedupePrompt.includes('durable completion report'), 'worker turn prompt should direct completion into report_done TaskReport path')
    assert.ok(dedupePrompt.includes('Progress/history is compact local activity only and does not notify team-lead'), 'worker turn prompt should not present notes as primary progress')
    assert.equal(dedupePrompt.includes('task-local notes'), false, 'worker turn prompt should not recommend task-local notes as active workflow')
    const dedupeMailboxAfterPrompt = env.modules.state.readMailbox(dedupePromptTeam.name, 'dedupe-worker')
    for (const message of [sameTaskAssignment, sameTaskQuestion, unscopedPromptMessage, differentTaskPromptMessage]) {
      const stored = dedupeMailboxAfterPrompt.find(item => item.id === message.id)
      assert.equal(stored?.readAt, undefined, 'prompt construction must not mark messages read')
      assert.equal(stored?.deliveredAt, undefined, 'prompt construction must not mark messages delivered')
    }

    const bridgeDedupeTeam = env.modules.state.createInitialTeamState({
      teamName: 'worker-prompt-bridge-dedupe-suite',
      leaderSessionFile: '/tmp/worker-prompt-bridge-dedupe-leader.jsonl',
      leaderCwd: '/tmp/worker-prompt-bridge-dedupe-project',
    })
    env.modules.state.upsertMember(bridgeDedupeTeam, {
      name: 'bridge-dedupe-worker',
      role: 'implementer',
      cwd: '/tmp/worker-prompt-bridge-dedupe-project',
      sessionFile: '/tmp/worker-prompt-bridge-dedupe-worker.jsonl',
      status: 'idle',
    })
    const bridgeDedupeTask = env.modules.state.createTask(bridgeDedupeTeam, {
      title: 'Bridge dedupe task',
      description: 'bridge prompt should merge same task message',
    })
    bridgeDedupeTask.owner = 'bridge-dedupe-worker'
    bridgeDedupeTask.status = 'open'
    env.modules.state.writeTeamState(bridgeDedupeTeam)
    const bridgeDedupeMessageText = 'UNIQUE bridge same task instruction should appear once'
    env.modules.state.pushMailboxMessage(bridgeDedupeTeam.name, 'bridge-dedupe-worker', {
      from: 'team-lead',
      to: 'bridge-dedupe-worker',
      text: bridgeDedupeMessageText,
      type: 'assignment',
      taskId: bridgeDedupeTask.id,
    })
    const bridgeDedupePromptMessages = env.modules.state.peekUnreadMailbox(bridgeDedupeTeam.name, 'bridge-dedupe-worker')
    const bridgeDedupePrompt = env.modules.runtimeBridge.buildBridgeTurnPrompt(bridgeDedupeTeam, 'bridge-dedupe-worker', undefined, bridgeDedupePromptMessages, { allowAssignedTaskTrigger: true })
    assert.ok(bridgeDedupePrompt.includes('Bridge dedupe task'), 'bridge delivery prompt should still include assigned task')
    assert.equal(countOccurrences(bridgeDedupePrompt, bridgeDedupeMessageText), 1, 'bridge delivery prompt should preserve same-task instruction once')
    assert.equal(bridgeDedupePrompt.includes('Messages:'), false, 'bridge delivery prompt should not repeat same-task assignment as a separate message')
    const bridgeDedupeMailboxAfterPrompt = env.modules.state.readMailbox(bridgeDedupeTeam.name, 'bridge-dedupe-worker')
    assert.equal(bridgeDedupeMailboxAfterPrompt[0]?.readAt, undefined, 'bridge prompt construction must not mark read')
    assert.equal(bridgeDedupeMailboxAfterPrompt[0]?.deliveredAt, undefined, 'bridge prompt construction must not mark delivered')

    const informationalPromptTeam = env.modules.state.createInitialTeamState({
      teamName: 'informational-prompt-suite',
      leaderSessionFile: '/tmp/informational-prompt-leader.jsonl',
      leaderCwd: '/tmp/informational-prompt-project',
    })
    env.modules.state.upsertMember(informationalPromptTeam, {
      name: 'informational-worker',
      role: 'planner',
      cwd: '/tmp/informational-prompt-project',
      sessionFile: '/tmp/informational-prompt-worker.jsonl',
      status: 'idle',
    })
    env.modules.state.writeTeamState(informationalPromptTeam)
    env.modules.state.pushMailboxMessage(informationalPromptTeam.name, 'informational-worker', {
      from: 'researcher',
      to: 'informational-worker',
      text: 'Inform only: research context for later leader attention',
      type: 'inform',
    })
    env.modules.state.pushMailboxMessage(informationalPromptTeam.name, 'informational-worker', {
      from: 'researcher',
      to: 'informational-worker',
      text: 'Done report context only',
      type: 'report_done',
    })
    const informationalOnlyPrompt = env.modules.workerTurnPrompt.buildWorkerTurnPrompt(informationalPromptTeam, 'informational-worker', {
      unreadMessages: env.modules.state.peekUnreadMailbox(informationalPromptTeam.name, 'informational-worker'),
    })
    assert.equal(informationalOnlyPrompt, null, 'informational-only messages should not trigger a worker turn prompt')

    env.modules.state.pushMailboxMessage(informationalPromptTeam.name, 'informational-worker', {
      from: 'team-lead',
      to: 'informational-worker',
      text: 'Can you answer this planning clarification?',
      type: 'question',
    })
    const questionOnlyPrompt = env.modules.workerTurnPrompt.buildWorkerTurnPrompt(informationalPromptTeam, 'informational-worker', {
      unreadMessages: env.modules.state.peekUnreadMailbox(informationalPromptTeam.name, 'informational-worker'),
    })
    assert.ok(questionOnlyPrompt.includes('Can you answer this planning clarification?'), 'question prompt should include question text')
    assert.ok(questionOnlyPrompt.includes('Answer/respond to the question now'), 'question prompt should tell worker to answer/respond')
    assert.ok(!questionOnlyPrompt.includes('Do the work now'), 'question-only prompt should not use broad work instruction')

    env.modules.state.pushMailboxMessage(informationalPromptTeam.name, 'informational-worker', {
      from: 'team-lead',
      to: 'informational-worker',
      text: 'Please start the assigned planning task',
      type: 'assignment',
    })
    const assignmentPrompt = env.modules.workerTurnPrompt.buildWorkerTurnPrompt(informationalPromptTeam, 'informational-worker', {
      unreadMessages: env.modules.state.peekUnreadMailbox(informationalPromptTeam.name, 'informational-worker'),
    })
    assert.ok(assignmentPrompt.includes('Please start the assigned planning task'), 'assignment prompt should include assignment text')
    assert.ok(assignmentPrompt.includes('Do the work now'), 'assignment prompt should keep work instruction')

    const blockedPromptTeam = env.modules.state.createInitialTeamState({
      teamName: 'blocked-prompt-suite',
      leaderSessionFile: '/tmp/blocked-prompt-leader.jsonl',
      leaderCwd: '/tmp/blocked-prompt-project',
    })
    env.modules.state.upsertMember(blockedPromptTeam, {
      name: 'blocked-prompt-worker',
      role: 'implementer',
      cwd: '/tmp/blocked-prompt-project',
      sessionFile: '/tmp/blocked-prompt-worker.jsonl',
      status: 'idle',
    })
    const actionablePromptTask = env.modules.state.createTask(blockedPromptTeam, {
      title: 'Actionable prompt task',
      description: 'safe to work',
    })
    actionablePromptTask.owner = 'blocked-prompt-worker'
    actionablePromptTask.status = 'open'
    const blockedPromptTask = env.modules.state.createTask(blockedPromptTeam, {
      title: 'Blocked prompt task',
      description: 'must wait',
      blockedBy: ['leader decision'],
    })
    blockedPromptTask.owner = 'blocked-prompt-worker'
    blockedPromptTask.status = 'blocked'
    env.modules.state.writeTeamState(blockedPromptTeam)
    env.modules.state.pushMailboxMessage(blockedPromptTeam.name, 'blocked-prompt-worker', {
      from: 'team-lead',
      to: 'blocked-prompt-worker',
      text: 'question about blocked prompt task',
      type: 'question',
      taskId: blockedPromptTask.id,
    })
    const blockedPromptMessages = env.modules.state.peekUnreadMailbox(blockedPromptTeam.name, 'blocked-prompt-worker')
    const blockedPrompt = env.modules.workerTurnPrompt.buildWorkerTurnPrompt(blockedPromptTeam, 'blocked-prompt-worker', {
      unreadMessages: blockedPromptMessages,
      allowAssignedTaskTrigger: true,
    })
    assert.ok(blockedPrompt.includes('Assigned tasks: T001 Actionable prompt task'), 'actionable owned task should remain in assigned tasks')
    assert.ok(!blockedPrompt.includes('Assigned tasks: T002 Blocked prompt task'), 'blocked owned task should not appear as actionable assigned task')
    assert.ok(blockedPrompt.includes('Blocked tasks / non-actionable: T002 Blocked prompt task'), 'blocked owned task should be shown separately as non-actionable')
    assert.ok(blockedPrompt.includes('do not work until team-lead clears blockers'), 'blocked prompt should tell worker not to work until leader clears blockers')
    assert.ok(blockedPrompt.includes('question about blocked prompt task'), 'communication about blocked task should still appear in messages')
    assert.deepEqual(
      env.modules.workerTurnPrompt.assignedTasksForWorker(blockedPromptTeam, 'blocked-prompt-worker').map(task => task.id),
      ['T001'],
      'assignedTasksForWorker should only return actionable owned tasks',
    )
    assert.deepEqual(
      env.modules.workerTurnPrompt.blockedTasksForWorker(blockedPromptTeam, 'blocked-prompt-worker').map(task => task.id),
      ['T002'],
      'blockedTasksForWorker should expose blocked owned tasks separately',
    )

    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.upsertMember(latest, {
        name: 'bridge-task-worker',
        role: 'researcher',
        cwd: '/tmp/bridge-pump-project',
        sessionFile: '/tmp/bridge-task-worker.jsonl',
        paneId: '%bridge-task-worker',
        windowTarget: 'test:@1',
        status: 'idle',
        bootPrompt: 'start from bridge boot prompt',
      })
      const bridgeTask = env.modules.state.createTask(latest, {
        title: 'Bridge task prompt',
        description: 'task prompt should flow through bridge',
      })
      bridgeTask.owner = 'bridge-task-worker'
      bridgeTask.status = 'open'
    })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'bridge-task-worker',
      sessionFile: '/tmp/bridge-task-worker.jsonl',
    })
    env.helpers.createBridgeDeliveryRequest(bridgeTeam.name, 'bridge-task-worker', {
      bootPrompt: 'start from bridge boot prompt',
    })
    const taskBridgeSends = []
    const taskBridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-task-worker',
      ctx: {
        isIdle: () => true,
        sendUserMessage: content => { taskBridgeSends.push(content) },
      },
    })
    assert.equal(taskBridgePump.ok, true)
    assert.ok(taskBridgeSends[0].includes('start from bridge boot prompt'), 'bridge should include bootPrompt work')
    assert.ok(taskBridgeSends[0].includes('Bridge task prompt'), 'bridge should include assigned task work')
    assert.equal(env.modules.state.readTeamState(bridgeTeam.name).members['bridge-task-worker'].bootPrompt, undefined, 'bridge success should clear bootPrompt')

    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.upsertMember(latest, {
        name: 'bridge-explicit-worker',
        role: 'implementer',
        cwd: '/tmp/bridge-pump-project',
        sessionFile: '/tmp/bridge-explicit-worker.jsonl',
        paneId: '%bridge-explicit-worker',
        windowTarget: 'test:@1',
        status: 'idle',
      })
    })
    env.patches.livePanes.add('%bridge-explicit-worker')
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: bridgeTeam.name,
      memberName: 'bridge-explicit-worker',
      sessionFile: '/tmp/bridge-explicit-worker.jsonl',
    })
    const explicitBridgeWake = await env.modules.runtime.requestWorkerDelivery(
      env.modules.state.readTeamState(bridgeTeam.name),
      'bridge-explicit-worker',
      'explicit bridge task now',
    )
    assert.equal(explicitBridgeWake.ok, true)
    assert.equal(explicitBridgeWake.method, 'bridge_requested')
    assert.equal(explicitBridgeWake.reason, env.modules.runtimeBridge.BRIDGE_TASK_REQUEST_REASON)
    assert.ok(explicitBridgeWake.requestId, 'explicit bridge wake should create a durable request id')
    const explicitBridgeSends = []
    const explicitBridgePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: bridgeTeam.name,
      memberName: 'bridge-explicit-worker',
      ctx: {
        isIdle: () => true,
        sendUserMessage: content => { explicitBridgeSends.push(content) },
      },
    })
    assert.equal(explicitBridgePump.ok, true)
    assert.ok(explicitBridgeSends[0].includes('explicit bridge task now'), 'explicit wake task should flow through bridge pump')
    assert.equal(env.modules.state.readTeamState(bridgeTeam.name).members['bridge-explicit-worker'].bootPrompt, undefined, 'bridge explicit task success should clear bootPrompt')

    env.modules.state.updateTeamState(bridgeTeam.name, latest => {
      env.modules.state.upsertMember(latest, {
        name: 'bridge-hook-worker',
        role: 'researcher',
        cwd: '/tmp/bridge-pump-project',
        sessionFile: '/tmp/bridge-hook-worker.jsonl',
        paneId: '%bridge-hook-worker',
        windowTarget: 'test:@1',
        status: 'idle',
      })
    })
    env.modules.state.writeSessionContext('/tmp/bridge-hook-worker.jsonl', {
      teamName: bridgeTeam.name,
      memberName: 'bridge-hook-worker',
    })
    const bridgeSessionHooks = env.pi.__hooks.get('session_start') || []
    assert.ok(bridgeSessionHooks.length > 0, 'session_start hook should be registered for bridge startup')
    await bridgeSessionHooks[0]({}, env.helpers.createCtx('/tmp/bridge-pump-project', '/tmp/bridge-hook-worker.jsonl', []))
    const bridgeHookMember = env.modules.state.readTeamState(bridgeTeam.name).members['bridge-hook-worker']
    assert.equal(env.modules.state.getOutboxEffect(bridgeTeam.name, bridgeHookOutbox.effectId).status, 'done', 'session_start should run outbox maintenance for attached worker team')
    assert.equal(env.modules.state.readMailbox(bridgeTeam.name, 'bridge-hook-worker').filter(message => message.text === 'session hook should run outbox maintenance').length, 1, 'session_start outbox maintenance should persist mailbox effect exactly once')
    assert.equal(bridgeHookMember.bridgeAvailable, true, 'session_start should publish worker bridge availability')
    assert.equal(bridgeHookMember.bridgeVersion, env.modules.runtimeBridge.BRIDGE_VERSION, 'bridge availability should include bridge version')

    const lifecycleTeam = env.modules.state.createInitialTeamState({
      teamName: 'lifecycle-shutdown-suite',
      leaderSessionFile: '/tmp/lifecycle-shutdown-leader.jsonl',
      leaderCwd: '/tmp/lifecycle-shutdown-project',
    })
    env.modules.state.upsertMember(lifecycleTeam, {
      name: 'error-worker',
      role: 'implementer',
      cwd: '/tmp/lifecycle-shutdown-project',
      sessionFile: '/tmp/lifecycle-error-worker.jsonl',
      status: 'error',
      lastWakeReason: 'wake preflight failed: pane missing',
      lastError: 'pane lost',
    })
    env.modules.state.upsertMember(lifecycleTeam, {
      name: 'normal-worker',
      role: 'researcher',
      cwd: '/tmp/lifecycle-shutdown-project',
      sessionFile: '/tmp/lifecycle-normal-worker.jsonl',
      status: 'running',
      lastWakeReason: 'processing prompt',
    })
    env.modules.state.writeTeamState(lifecycleTeam)
    env.modules.state.writeSessionContext('/tmp/lifecycle-error-worker.jsonl', {
      teamName: lifecycleTeam.name,
      memberName: 'error-worker',
    })
    env.modules.lifecycleService.markWorkerSessionShutdown(env.helpers.createCtx('/tmp/lifecycle-shutdown-project', '/tmp/lifecycle-error-worker.jsonl', []))
    let lifecycleAfterShutdown = env.modules.state.readTeamState(lifecycleTeam.name)
    assert.equal(lifecycleAfterShutdown.members['error-worker'].status, 'error', 'session shutdown should not clear existing error status')
    assert.equal(lifecycleAfterShutdown.members['error-worker'].lastError, 'pane lost', 'session shutdown should preserve existing lastError')
    env.modules.state.writeSessionContext('/tmp/lifecycle-normal-worker.jsonl', {
      teamName: lifecycleTeam.name,
      memberName: 'normal-worker',
    })
    env.modules.lifecycleService.markWorkerSessionShutdown(env.helpers.createCtx('/tmp/lifecycle-shutdown-project', '/tmp/lifecycle-normal-worker.jsonl', []))
    lifecycleAfterShutdown = env.modules.state.readTeamState(lifecycleTeam.name)
    assert.equal(lifecycleAfterShutdown.members['normal-worker'].status, 'offline', 'normal shutdown should mark running worker offline')
    assert.equal(lifecycleAfterShutdown.members['normal-worker'].lastWakeReason, 'session shutdown')
    assert.equal(lifecycleAfterShutdown.members['normal-worker'].bridgeAvailable, false)
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: lifecycleTeam.name,
      memberName: 'normal-worker',
      sessionFile: '/tmp/lifecycle-normal-worker.jsonl',
    })
    env.modules.runtimeBridge.markBridgeStopped(lifecycleTeam.name, 'normal-worker')
    const normalAfterBridgeStop = env.modules.state.readTeamState(lifecycleTeam.name).members['normal-worker']
    assert.equal(normalAfterBridgeStop.bridgeAvailable, false, 'normal bridge stop should mark bridge unavailable')

    const bridgeOnlyDeliveryTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-only-delivery-suite',
      leaderSessionFile: '/tmp/bridge-only-delivery-leader.jsonl',
      leaderCwd: '/tmp/bridge-only-delivery-project',
    })
    env.modules.state.upsertMember(bridgeOnlyDeliveryTeam, {
      name: 'bridge-only-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-only-delivery-project',
      sessionFile: '/tmp/bridge-only-delivery-worker.jsonl',
      paneId: '%bridge-only-worker',
      windowTarget: 'test:@1',
      status: 'idle',
    })
    env.modules.state.writeTeamState(bridgeOnlyDeliveryTeam)
    env.patches.livePanes.add('%bridge-only-worker')
    env.modules.state.writeSessionContext('/tmp/bridge-only-delivery-leader.jsonl', {
      teamName: bridgeOnlyDeliveryTeam.name,
      memberName: 'team-lead',
    })
    env.modules.state.writeSessionContext('/tmp/bridge-only-delivery-worker.jsonl', {
      teamName: bridgeOnlyDeliveryTeam.name,
      memberName: 'bridge-only-worker',
    })
    const bridgeOnlyLeaderCtx = env.helpers.createCtx('/tmp/bridge-only-delivery-project', '/tmp/bridge-only-delivery-leader.jsonl', [])
    const bridgeOnlySendMessagesBefore = env.pi.__messages.length
    env.sentPrompts.length = 0
    const bridgeOnlySend = await env.pi.__tools.get('agentteam_send').execute('bridge-only-send-request', {
      to: 'bridge-only-worker',
      message: 'bridge-only send should create request without tmux paste',
      type: 'question',
    }, null, () => {}, bridgeOnlyLeaderCtx)
    assert.equal(bridgeOnlySend.details.wakeByRecipient[0].method, 'bridge_requested')
    assert.equal(bridgeOnlySend.details.wakeByRecipient[0].ok, false)
    assert.equal(bridgeOnlySend.details.wakeByRecipient[0].reason, 'bridge unavailable in bridge-only delivery mode')
    assert.ok(bridgeOnlySend.details.wakeByRecipient[0].requestId, 'bridge-only send should expose delivery request id even when bridge unavailable')
    assert.equal(env.sentPrompts.length, 0, 'bridge-only send should not paste into tmux pane')
    assert.equal(env.pi.__messages.length, bridgeOnlySendMessagesBefore, 'bridge-only send should not native-submit from leader process')
    const bridgeOnlyRequests = Object.values(env.modules.state.readDeliveryRequestStore(bridgeOnlyDeliveryTeam.name).requests)
    assert.equal(bridgeOnlyRequests.length, 1, 'bridge-only send should create one durable request')
    assert.equal(bridgeOnlyRequests[0].requestId, bridgeOnlySend.details.wakeByRecipient[0].requestId)
    assert.equal(bridgeOnlyRequests[0].status, 'pending')
    const bridgeOnlyMailbox = env.modules.state.readMailbox(bridgeOnlyDeliveryTeam.name, 'bridge-only-worker')
    assert.equal(bridgeOnlyMailbox[0].readAt, undefined, 'bridge-only send should leave mailbox unread')
    assert.equal(bridgeOnlyMailbox[0].deliveredAt, undefined, 'bridge-only send should not mark delivered')

    const leaderAttentionRequest = await env.modules.runtime.requestLeaderAttentionIfNeeded(bridgeOnlyDeliveryTeam, {
      type: 'report_done',
      wakeHint: 'hard',
      from: 'bridge-only-worker',
      summary: 'leader attention status truth',
      text: 'leader attention should not make leader look like a worker pending delivery',
    })
    assert.equal(leaderAttentionRequest.method, 'leader_attention_requested')
    assert.equal(env.modules.state.readTeamState(bridgeOnlyDeliveryTeam.name).members['team-lead'].status, 'idle', 'leader attention request should not mark team-lead open_delivery')

    env.modules.state.updateTeamState(bridgeOnlyDeliveryTeam.name, latest => {
      env.modules.state.updateMemberStatus(latest, 'bridge-only-worker', {
        status: 'running',
        lastWakeReason: 'processing prompt',
      })
    })
    const runningWorkerMessage = env.modules.state.pushMailboxMessage(bridgeOnlyDeliveryTeam.name, 'bridge-only-worker', {
      from: 'team-lead',
      to: 'bridge-only-worker',
      text: 'running worker follow-up should stay pending',
      type: 'question',
      wakeHint: 'soft',
    })
    const runningWorkerDelivery = await env.modules.runtime.requestWorkerDelivery(
      env.modules.state.readTeamState(bridgeOnlyDeliveryTeam.name),
      'bridge-only-worker',
      undefined,
      {
        messageIds: [runningWorkerMessage.id],
        requestedBy: 'team-lead',
        reason: 'running worker delivery test',
        wakeHint: 'soft',
      },
    )
    assert.equal(runningWorkerDelivery.method, 'bridge_requested')
    assert.ok(runningWorkerDelivery.requestId, 'running worker follow-up should still create a durable request')
    const runningWorkerAfterRequest = env.modules.state.readTeamState(bridgeOnlyDeliveryTeam.name).members['bridge-only-worker']
    assert.equal(runningWorkerAfterRequest.status, 'running', 'requesting delivery to running worker should not overwrite running status')
    assert.equal(runningWorkerAfterRequest.lastWakeReason, 'bridge delivery pending while running')

    const raceTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-claim-race-suite',
      leaderSessionFile: '/tmp/bridge-race-leader.jsonl',
      leaderCwd: '/tmp/bridge-race-project',
    })
    env.modules.state.upsertMember(raceTeam, {
      name: 'race-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-race-project',
      sessionFile: '/tmp/bridge-race-worker.jsonl',
      status: 'idle',
      paneId: '%bridge-race-worker',
    })
    env.modules.state.writeTeamState(raceTeam)
    env.modules.state.pushMailboxMessage(raceTeam.name, 'race-worker', {
      from: 'team-lead',
      to: 'race-worker',
      text: 'race request one',
      type: 'question',
    })
    env.modules.state.pushMailboxMessage(raceTeam.name, 'race-worker', {
      from: 'team-lead',
      to: 'race-worker',
      text: 'race request two',
      type: 'question',
    })
    const raceMessages = env.modules.state.readMailbox(raceTeam.name, 'race-worker')
    env.helpers.createBridgeDeliveryRequest(raceTeam.name, 'race-worker', {
      messageIds: raceMessages.map(message => message.id),
      requestedBy: 'team-lead',
      reason: 'race test',
    })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: raceTeam.name,
      memberName: 'race-worker',
      sessionFile: '/tmp/bridge-race-worker.jsonl',
    })
    const raceSends = []
    const raceCtx = {
      isIdle: () => true,
      hasPendingMessages: () => false,
      sendUserMessage: content => { raceSends.push(content) },
    }
    const raceResults = await Promise.all([
      env.modules.runtimeBridge.pumpBridgeOnce({ teamName: raceTeam.name, memberName: 'race-worker', ctx: raceCtx }),
      env.modules.runtimeBridge.pumpBridgeOnce({ teamName: raceTeam.name, memberName: 'race-worker', ctx: raceCtx }),
    ])
    assert.equal(raceSends.length, 1, 'two racing bridge controllers should produce exactly one native send')
    assert.equal(raceResults.filter(result => result.ok).length, 1, 'only one racing bridge claim should succeed')
    const submittedRaceRequests = Object.values(env.modules.state.readDeliveryRequestStore(raceTeam.name).requests)
      .filter(request => request.memberName === 'race-worker' && request.status === 'submitted')
    assert.equal(submittedRaceRequests.length, 1, 'race should leave one submitted request')
    assert.ok(submittedRaceRequests[0].claim.claimId, 'claim should include claimId')
    assert.equal(submittedRaceRequests[0].claim.bridgeId.includes('bridge-claim-race-suite'), true)
    assert.deepEqual(submittedRaceRequests[0].claim.messageIds.sort(), raceMessages.map(message => message.id).sort())
    assert.ok(submittedRaceRequests[0].claim.promptHash, 'claim should include prompt hash')
    const raceMailbox = env.modules.state.readMailbox(raceTeam.name, 'race-worker')
    assert.equal(raceMailbox.every(message => message.readAt === undefined), true, 'bridge submit should not read mailbox')
    assert.equal(raceMailbox.every(message => message.deliveredAt === undefined), true, 'bridge submit should not mark delivered')

    const rerunTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-rerun-suite',
      leaderSessionFile: '/tmp/bridge-rerun-leader.jsonl',
      leaderCwd: '/tmp/bridge-rerun-project',
    })
    env.modules.state.upsertMember(rerunTeam, {
      name: 'rerun-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-rerun-project',
      sessionFile: '/tmp/bridge-rerun-worker.jsonl',
      status: 'idle',
      paneId: '%bridge-rerun-worker',
    })
    env.modules.state.writeTeamState(rerunTeam)
    const rerunFirstMessage = env.modules.state.pushMailboxMessage(rerunTeam.name, 'rerun-worker', {
      from: 'team-lead',
      to: 'rerun-worker',
      text: 'rerun first request',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(rerunTeam.name, 'rerun-worker', {
      messageIds: [rerunFirstMessage.id],
      requestedBy: 'team-lead',
      reason: 'rerun first',
    })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: rerunTeam.name,
      memberName: 'rerun-worker',
      sessionFile: '/tmp/bridge-rerun-worker.jsonl',
    })
    const rerunSends = []
    let releaseFirstSend
    const firstSendEntered = new Promise(resolve => { releaseFirstSend = resolve })
    const firstSendCanFinish = new Promise(resolve => { globalThis.__releaseRerunFirstSend = resolve })
    let sendCount = 0
    const rerunCtx = {
      isIdle: () => true,
      hasPendingMessages: () => false,
      sendUserMessage: async content => {
        sendCount += 1
        rerunSends.push(content)
        if (sendCount === 1) {
          releaseFirstSend()
          await firstSendCanFinish
        }
      },
    }
    const firstPumpPromise = env.modules.runtimeBridge.pumpBridgeOnce({ teamName: rerunTeam.name, memberName: 'rerun-worker', ctx: rerunCtx })
    await firstSendEntered
    const rerunSecondMessage = env.modules.state.pushMailboxMessage(rerunTeam.name, 'rerun-worker', {
      from: 'team-lead',
      to: 'rerun-worker',
      text: 'rerun second request',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(rerunTeam.name, 'rerun-worker', {
      messageIds: [rerunSecondMessage.id],
      requestedBy: 'team-lead',
      reason: 'rerun second',
    })
    const secondPumpPromise = env.modules.runtimeBridge.pumpBridgeOnce({ teamName: rerunTeam.name, memberName: 'rerun-worker', ctx: rerunCtx })
    globalThis.__releaseRerunFirstSend()
    const rerunResults = await Promise.all([firstPumpPromise, secondPumpPromise])
    delete globalThis.__releaseRerunFirstSend
    assert.equal(rerunSends.length, 2, 'rerunRequested should be consumed by a follow-up pump after active pump finishes')
    assert.ok(rerunSends[0].includes('rerun first request'), 'first pump should deliver first request')
    assert.ok(rerunSends[1].includes('rerun second request'), 'follow-up rerun should deliver request created during active pump')
    assert.equal(rerunResults[0].ok, true, 'active pump should return success after consumed rerun')
    assert.equal(rerunResults[1].ok, false, 'concurrent caller remains queued/claimed response')
    const submittedRerunRequests = Object.values(env.modules.state.readDeliveryRequestStore(rerunTeam.name).requests)
      .filter(request => request.memberName === 'rerun-worker' && request.status === 'submitted')
    assert.equal(submittedRerunRequests.length, 2, 'both original and rerun-created requests should be submitted')

    const busyTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-busy-suite',
      leaderSessionFile: '/tmp/bridge-busy-leader.jsonl',
      leaderCwd: '/tmp/bridge-busy-project',
    })
    env.modules.state.upsertMember(busyTeam, {
      name: 'busy-worker',
      role: 'researcher',
      cwd: '/tmp/bridge-busy-project',
      sessionFile: '/tmp/bridge-busy-worker.jsonl',
      status: 'running',
    })
    env.modules.state.writeTeamState(busyTeam)
    const busyMessage = env.modules.state.pushMailboxMessage(busyTeam.name, 'busy-worker', {
      from: 'team-lead',
      to: 'busy-worker',
      text: 'busy worker should not receive native send yet',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(busyTeam.name, 'busy-worker', {
      messageIds: [busyMessage.id],
      requestedBy: 'team-lead',
      reason: 'busy test',
    })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: busyTeam.name,
      memberName: 'busy-worker',
      sessionFile: '/tmp/bridge-busy-worker.jsonl',
    })
    const busySends = []
    const busyResult = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: busyTeam.name,
      memberName: 'busy-worker',
      ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: content => { busySends.push(content) } },
    })
    assert.equal(busyResult.ok, false)
    assert.equal(busySends.length, 0, 'running worker should receive no native send')
    assert.equal(Object.values(env.modules.state.readDeliveryRequestStore(busyTeam.name).requests)[0].status, 'pending', 'running worker request should remain pending')
    env.modules.state.updateTeamState(busyTeam.name, latest => {
      env.modules.state.updateMemberStatus(latest, 'busy-worker', { status: 'idle', lastWakeReason: 'idle for pending submit' })
    })
    const busyAfterIdle = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: busyTeam.name,
      memberName: 'busy-worker',
      ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: content => { busySends.push(content) } },
    })
    assert.equal(busyAfterIdle.ok, true)
    assert.equal(busySends.length, 1, 'pending request should submit after worker is idle')
    assert.ok(busySends[0].includes('busy worker should not receive native send yet'))

    const staleTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-stale-claim-suite',
      leaderSessionFile: '/tmp/bridge-stale-leader.jsonl',
      leaderCwd: '/tmp/bridge-stale-project',
    })
    env.modules.state.upsertMember(staleTeam, {
      name: 'stale-worker',
      role: 'researcher',
      cwd: '/tmp/bridge-stale-project',
      sessionFile: '/tmp/bridge-stale-worker.jsonl',
      status: 'idle',
    })
    env.modules.state.writeTeamState(staleTeam)
    const staleMessage = env.modules.state.pushMailboxMessage(staleTeam.name, 'stale-worker', {
      from: 'team-lead',
      to: 'stale-worker',
      text: 'stale lease should not send',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(staleTeam.name, 'stale-worker', { messageIds: [staleMessage.id] })
    const staleLease = env.modules.runtimeBridge.publishBridgeLease({
      teamName: staleTeam.name,
      memberName: 'stale-worker',
      sessionFile: '/tmp/bridge-stale-worker.jsonl',
    })
    env.modules.state.upsertBridgeLease(staleTeam.name, { ...staleLease, expiresAt: Date.now() - 1 })
    const staleSends = []
    const staleResult = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: staleTeam.name,
      memberName: 'stale-worker',
      ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: content => { staleSends.push(content) } },
    })
    assert.equal(staleResult.ok, false)
    assert.equal(staleSends.length, 0, 'stale lease should not send')
    assert.equal(Object.values(env.modules.state.readDeliveryRequestStore(staleTeam.name).requests)[0].status, 'pending')

    const lifecycleBridgeTeam = env.modules.state.createInitialTeamState({
      teamName: 'bridge-lifecycle-suite',
      leaderSessionFile: '/tmp/bridge-lifecycle-leader.jsonl',
      leaderCwd: '/tmp/bridge-lifecycle-project',
    })
    env.modules.state.upsertMember(lifecycleBridgeTeam, {
      name: 'lifecycle-bridge-worker',
      role: 'implementer',
      cwd: '/tmp/bridge-lifecycle-project',
      sessionFile: '/tmp/bridge-lifecycle-worker.jsonl',
      status: 'idle',
      paneId: '%bridge-lifecycle-worker',
    })
    env.modules.state.writeTeamState(lifecycleBridgeTeam)
    env.modules.state.writeSessionContext('/tmp/bridge-lifecycle-worker.jsonl', {
      teamName: lifecycleBridgeTeam.name,
      memberName: 'lifecycle-bridge-worker',
    })
    const lifecycleMessage = env.modules.state.pushMailboxMessage(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      from: 'team-lead',
      to: 'lifecycle-bridge-worker',
      text: 'lifecycle request should start and close',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', { messageIds: [lifecycleMessage.id] })
    env.modules.runtimeBridge.publishBridgeLease({
      teamName: lifecycleBridgeTeam.name,
      memberName: 'lifecycle-bridge-worker',
      sessionFile: '/tmp/bridge-lifecycle-worker.jsonl',
    })
    const lifecycleSends = []
    const lifecyclePump = await env.modules.runtimeBridge.pumpBridgeOnce({
      teamName: lifecycleBridgeTeam.name,
      memberName: 'lifecycle-bridge-worker',
      ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: content => { lifecycleSends.push(content) } },
    })
    assert.equal(lifecyclePump.ok, true)
    let lifecycleRequest = Object.values(env.modules.state.readDeliveryRequestStore(lifecycleBridgeTeam.name).requests)[0]
    assert.equal(lifecycleRequest.status, 'submitted')
    const lifecycleStart = env.modules.runtimeBridge.markBridgeAgentStart(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker')
    assert.equal(typeof env.helpers.requireDist('runtime/bridgeLifecycle.js').markBridgeAgentStart, 'function', 'focused bridgeLifecycle module should expose lifecycle start')
    assert.equal(lifecycleStart.request.status, 'started', 'agent_start should transition submitted request to started')
    lifecycleRequest = Object.values(env.modules.state.readDeliveryRequestStore(lifecycleBridgeTeam.name).requests)[0]
    assert.equal(lifecycleRequest.status, 'started')
    const lifecycleMailboxAfterStart = env.modules.state.readMailbox(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker')
    assert.ok(lifecycleMailboxAfterStart[0].deliveredAt, 'agent_start may conservatively mark mailbox delivered')
    assert.equal(lifecycleMailboxAfterStart[0].readAt, undefined, 'agent_start must not mark mailbox read')
    assert.equal(env.modules.state.readTeamState(lifecycleBridgeTeam.name).members['lifecycle-bridge-worker'].status, 'running')
    const lifecycleEnd = env.modules.runtimeBridge.markBridgeAgentEnd(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      isIdle: () => true,
      hasPendingMessages: () => false,
    })
    assert.equal(lifecycleEnd.request.status, 'completed', 'agent_end should close current started request')
    assert.equal(lifecycleEnd.status, 'idle', 'safe bridge lifecycle end should mark worker idle')
    lifecycleRequest = Object.values(env.modules.state.readDeliveryRequestStore(lifecycleBridgeTeam.name).requests)[0]
    assert.equal(lifecycleRequest.status, 'completed')
    assert.equal(env.modules.state.readTeamState(lifecycleBridgeTeam.name).members['lifecycle-bridge-worker'].status, 'idle')

    const openAfterEndMessage = env.modules.state.pushMailboxMessage(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      from: 'team-lead',
      to: 'lifecycle-bridge-worker',
      text: 'pending after end should prevent idle',
      type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', { messageIds: [openAfterEndMessage.id] })
    env.modules.runtimeBridge.markBridgeAgentStart(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker')
    const openEnd = env.modules.runtimeBridge.markBridgeAgentEnd(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      isIdle: () => true,
      hasPendingMessages: () => false,
    })
    assert.equal(openEnd.status, 'pending_delivery', 'pending request after agent_end should not show idle')
    assert.equal(env.modules.state.readTeamState(lifecycleBridgeTeam.name).members['lifecycle-bridge-worker'].status, 'pending_delivery')

    const assignAfterEndMessage = env.modules.state.pushMailboxMessage(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      from: 'team-lead',
      to: 'lifecycle-bridge-worker',
      text: 'active claim should drain',
      type: 'question',
    })
    const assignRequest = env.helpers.createBridgeDeliveryRequest(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', { messageIds: [assignAfterEndMessage.id] })
    const lifecycleLease = env.modules.state.getBridgeLease(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker')
    env.modules.state.claimDeliveryRequest(lifecycleBridgeTeam.name, assignRequest.requestId, {
      bridgeId: lifecycleLease.bridgeId,
      generation: lifecycleLease.generation,
      messageIds: [assignAfterEndMessage.id],
      promptHash: 'active-claim-hash',
    })
    env.modules.runtimeBridge.markBridgeAgentStart(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker')
    const activeClaimEnd = env.modules.runtimeBridge.markBridgeAgentEnd(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      isIdle: () => true,
      hasPendingMessages: () => false,
    })
    assert.equal(activeClaimEnd.status, 'draining', 'active claim after agent_end should not show idle')
    assert.equal(env.modules.state.readTeamState(lifecycleBridgeTeam.name).members['lifecycle-bridge-worker'].status, 'draining')

    env.modules.state.transitionDeliveryRequest(lifecycleBridgeTeam.name, assignRequest.requestId, 'cancelled')
    env.modules.runtimeBridge.markBridgeAgentStart(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker')
    const queuedEnd = env.modules.runtimeBridge.markBridgeAgentEnd(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
      isIdle: () => true,
      hasPendingMessages: () => true,
    })
    assert.equal(queuedEnd.status, 'draining', 'pi pending queue after agent_end should not show idle')

    env.modules.state.updateTeamState(lifecycleBridgeTeam.name, latest => {
        env.modules.state.updateMemberStatus(latest, 'lifecycle-bridge-worker', { status: 'idle', lastWakeReason: 'hook lifecycle reset' })
    })
    const hookMessage = env.modules.state.pushMailboxMessage(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', {
        from: 'team-lead',
        to: 'lifecycle-bridge-worker',
        text: 'hook lifecycle request',
        type: 'question',
    })
    env.helpers.createBridgeDeliveryRequest(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker', { messageIds: [hookMessage.id] })
    await env.modules.runtimeBridge.pumpBridgeOnce({
        teamName: lifecycleBridgeTeam.name,
        memberName: 'lifecycle-bridge-worker',
        ctx: { isIdle: () => true, hasPendingMessages: () => false, sendUserMessage: () => {} },
    })
    const hookCtx = env.helpers.createCtx('/tmp/bridge-lifecycle-project', '/tmp/bridge-lifecycle-worker.jsonl', [])
    const agentHookOutbox = env.modules.state.enqueueOutboxEffect({
        teamName: lifecycleBridgeTeam.name,
        kind: 'inbox_item_append_requested',
        idempotencyKey: 'agent-start-hook-outbox',
        payload: {
          teamName: lifecycleBridgeTeam.name,
          recipient: 'lifecycle-bridge-worker',
          message: {
            from: 'team-lead',
            to: 'lifecycle-bridge-worker',
            text: 'agent_start should run outbox maintenance',
            type: 'inform',
            wakeHint: 'none',
          },
        },
    })
    const agentStartHooks = env.pi.__hooks.get('agent_start') || []
    const agentEndHooks = env.pi.__hooks.get('agent_end') || []
    await agentStartHooks[0]({}, hookCtx)
    await wait(25)
    assert.equal(env.modules.state.getOutboxEffect(lifecycleBridgeTeam.name, agentHookOutbox.effectId).status, 'done', 'agent_start should trigger outbox maintenance on existing safe runtime tick')
    assert.equal(env.modules.state.readMailbox(lifecycleBridgeTeam.name, 'lifecycle-bridge-worker').filter(message => message.text === 'agent_start should run outbox maintenance').length, 1, 'agent_start maintenance should not duplicate mailbox')
    assert.equal(Object.values(env.modules.state.readDeliveryRequestStore(lifecycleBridgeTeam.name).requests).find(request => request.messageIds.includes(hookMessage.id)).status, 'started')
    await agentEndHooks[0]({}, hookCtx)
    assert.equal(Object.values(env.modules.state.readDeliveryRequestStore(lifecycleBridgeTeam.name).requests).find(request => request.messageIds.includes(hookMessage.id)).status, 'completed')

    const statusSessionFile = '/tmp/status-refresh-suite-leader.jsonl'
    const statusTeam = env.modules.state.createInitialTeamState({
      teamName: 'status-refresh-suite',
      leaderSessionFile: statusSessionFile,
      leaderCwd: '/tmp/status-refresh-suite-project',
    })
    statusTeam.members['team-lead'].paneId = '%leader'
    statusTeam.members['team-lead'].windowTarget = 'test:@1'
    env.modules.state.writeTeamState(statusTeam)
    env.modules.state.writeSessionContext(statusSessionFile, {
      teamName: statusTeam.name,
      memberName: 'team-lead',
    })
    const statusCtx = env.helpers.createCtx('/tmp/status-refresh-suite-project', statusSessionFile, [])

    const statusRuntime = env.modules.runtimeService.createRuntimeService(env.pi)
    let statusCalls = 0
    let widgetCalls = 0
    statusCtx.ui.setStatus = () => { statusCalls += 1 }
    statusCtx.ui.setWidget = () => { widgetCalls += 1 }

    statusRuntime.refreshStatus(statusCtx)
    assert.equal(statusCalls, 1, 'first non-forcing refresh should block status UI')
    assert.equal(widgetCalls, 1, 'first non-forcing refresh should block widget UI')

    statusRuntime.refreshStatus(statusCtx)
    assert.equal(statusCalls, 1, 'repeated non-forcing refresh should be skipped when status key is unchanged')
    assert.equal(widgetCalls, 1, 'repeated non-forcing refresh should not block widget UI when status key is unchanged')

    statusRuntime.invalidateStatus(statusCtx)
    assert.equal(statusCalls, 2, 'invalidateStatus should still force one status refresh')
    assert.equal(widgetCalls, 2, 'invalidateStatus should still force one widget refresh')

  },
}
