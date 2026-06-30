const assert = require('node:assert/strict')
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
