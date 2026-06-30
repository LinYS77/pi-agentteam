const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

module.exports = {
  name: 'service boundary declaration guards',
  async run(env) {
    const boundaryCheck = spawnSync(process.execPath, ['scripts/check-import-boundaries.cjs'], {
      cwd: env.helpers.extRoot,
      encoding: 'utf8',
    })
    assert.equal(boundaryCheck.status, 0, `import boundary advisory should pass\n${boundaryCheck.stdout}\n${boundaryCheck.stderr}`)
    const boundaryScriptSource = env.helpers.readSource('scripts/check-import-boundaries.cjs')
    assert.ok(boundaryScriptSource.includes('appBoundaryForbiddenTokens'), 'boundary checker should enforce app-layer Pi API tokens')
    assert.ok(boundaryScriptSource.includes('contextFreeAppUseCaseFiles'), 'boundary checker should explicitly guard context-free app use cases')
    assert.ok(boundaryScriptSource.includes('app/messageReceiveApplication.ts'), 'boundary checker should guard receive app use case')
    assert.ok(boundaryScriptSource.includes('app/messageApplication.ts'), 'boundary checker should guard send app use case')
    assert.ok(boundaryScriptSource.includes('app/taskApplication.ts'), 'boundary checker should guard task app use case')
    assert.ok(boundaryScriptSource.includes('app/taskMutationCommands.ts'), 'boundary checker should guard task mutation command store/side-effect boundaries')
    assert.ok(boundaryScriptSource.includes('app/taskReportWorkflow.ts'), 'boundary checker should guard task report workflow store/side-effect boundaries')
    assert.ok(boundaryScriptSource.includes('app/taskSideEffects.ts'), 'boundary checker should guard task-local side-effect execution boundaries')
    assert.ok(boundaryScriptSource.includes('app/messageTypes.ts'), 'boundary checker should guard send app input types')
    assert.ok(boundaryScriptSource.includes('app/taskTypes.ts'), 'boundary checker should guard task app input types')
    assert.ok(boundaryScriptSource.includes('app/types.ts'), 'boundary checker should guard app dependency types')
    for (const token of ['@earendil-works/pi-coding-agent', 'ExtensionContext', 'ensureTeamForSession', 'currentActor', 'invalidateStatus']) {
      assert.ok(boundaryScriptSource.includes(token), `boundary checker should guard ${token}`)
    }

    const declarationDir = path.join(env.helpers.distRoot, '..', 'public-surface-dts')
    fs.rmSync(declarationDir, { recursive: true, force: true })
    const declarationCheck = spawnSync('tsc', [
      '--noEmit', 'false',
      '--declaration',
      '--emitDeclarationOnly',
      '--outDir', declarationDir,
      '-p', 'tsconfig.json',
    ], {
      cwd: env.helpers.extRoot,
      encoding: 'utf8',
    })
    assert.equal(declarationCheck.status, 0, `declaration surface check should compile\n${declarationCheck.stdout}\n${declarationCheck.stderr}`)
    const readDeclaration = file => fs.readFileSync(path.join(declarationDir, file), 'utf8')
    const stableAndSemiPublicDeclarationFiles = [
      'types.d.ts',
      'deliveryPolicy.d.ts',
      'tools/messageTypes.d.ts',
      'tools/taskTypes.d.ts',
      'tools/teamTypes.d.ts',
    ]
    const forbiddenStableAndSemiPublicTokens = [
      'TeamState',
      'TeamMember',
      'MailboxMessage',
      'BridgeLease',
      'DeliveryRequest',
      'DeliveryRequestStatus',
      'LeaderAttention',
      'OutboxEffect',
      'OutboxEffectStatus',
      'WorkerFsmStatus',
      'MemberStatus',
      'WORKER_FSM_STATUSES',
      'DELIVERY_REQUEST_STATUSES',
      'OUTBOX_EFFECT_STATUSES',
      'pending_delivery',
      'queued',
      'running',
      'draining',
      'claimed',
      'submitted',
      'projected',
      'sent',
      'skipped',
    ]
    const forbiddenStableAndSemiPublicImportPathTokens = [
      'internalTypes',
      '../app/',
      './app/',
      '../runtime/',
      './runtime/',
      '../state/',
      './state/',
      '../adapters/',
      './adapters/',
    ]
    for (const file of stableAndSemiPublicDeclarationFiles) {
      const declaration = readDeclaration(file)
      for (const token of forbiddenStableAndSemiPublicTokens) {
        assert.equal(declaration.includes(token), false, `${file} public/semi-public declaration should not expose internal token ${token}`)
      }
      for (const token of forbiddenStableAndSemiPublicImportPathTokens) {
        assert.equal(declaration.includes(token), false, `${file} public/semi-public declaration should not reference internal path ${token}`)
      }
    }
    const publicTypesDeclaration = readDeclaration('types.d.ts')
    assert.ok(publicTypesDeclaration.includes('PublicTask'), 'types.ts declaration should expose public task shape')
    assert.ok(publicTypesDeclaration.includes('PublicMessage'), 'types.ts declaration should expose public message shape')
    assert.ok(publicTypesDeclaration.includes('PublicWorker'), 'types.ts declaration should expose public worker shape')
    assert.ok(publicTypesDeclaration.includes("TEAM_LEAD = \"team-lead\""), 'types.ts declaration should expose public TEAM_LEAD literal')
    assert.ok(publicTypesDeclaration.includes('./core/publicModel.js'), 'types.ts declaration should depend only on public core vocabulary')
    const deliveryPolicyDeclaration = readDeclaration('deliveryPolicy.d.ts')
    assert.ok(deliveryPolicyDeclaration.includes("AgentTeamDeliveryPolicyName = 'bridge-only'"), 'deliveryPolicy declaration should expose bridge-only policy name')
    assert.ok(deliveryPolicyDeclaration.includes('resolveDeliveryPolicy'), 'deliveryPolicy declaration should expose bridge-only resolver')
    assert.equal(deliveryPolicyDeclaration.includes('DeliveryMode'), false, 'deliveryPolicy declaration should not expose legacy delivery-mode aliases')
    const messageTypesDeclaration = readDeclaration('tools/messageTypes.d.ts')
    assert.ok(messageTypesDeclaration.includes('../core/publicModel.js'), 'message type convenience declaration should depend on public core vocabulary')
    assert.ok(messageTypesDeclaration.includes('TeamSendInput'), 'message type convenience declaration should expose send input')
    assert.ok(messageTypesDeclaration.includes('TeamReceiveInput'), 'message type convenience declaration should expose receive input')
    const taskTypesDeclaration = readDeclaration('tools/taskTypes.d.ts')
    assert.ok(taskTypesDeclaration.includes('../core/publicModel.js'), 'task type convenience declaration should depend on public core vocabulary')
    assert.ok(taskTypesDeclaration.includes('../core/taskActions.js'), 'task type convenience declaration should depend on public task actions')
    assert.ok(taskTypesDeclaration.includes('TeamTaskInput'), 'task type convenience declaration should expose task input')
    const teamTypesDeclaration = readDeclaration('tools/teamTypes.d.ts')
    assert.ok(teamTypesDeclaration.includes('../config.js'), 'team type convenience declaration should reuse top-level config diagnostic type')
    assert.ok(teamTypesDeclaration.includes('TeamCreateInput'), 'team type convenience declaration should expose create input')
    assert.ok(teamTypesDeclaration.includes('TeamSpawnInput'), 'team type convenience declaration should expose spawn input')
    assert.ok(teamTypesDeclaration.includes('SpawnResult'), 'team type convenience declaration should expose spawn result')
    assert.ok(teamTypesDeclaration.includes("outboxStatus?: 'pending' | 'done' | 'failed'"), 'team spawn result should characterize current non-breaking outbox status field')
    const apiToolsDeclaration = readDeclaration('api/tools.d.ts')
    assert.ok(apiToolsDeclaration.includes("import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'"), 'api/tools declaration should expose Pi extension composition context')
    assert.ok(apiToolsDeclaration.includes("import type { ToolHandlerDeps } from '../tools/shared.js'"), 'api/tools declaration should classify dependency shape through composition helper deps')
    assert.ok(apiToolsDeclaration.includes('registerAgentTeamTools'), 'api/tools declaration should expose tool registration helper')
    assert.equal(apiToolsDeclaration.includes('../app/'), false, 'api/tools declaration should not directly expose app internals; deps remain behind ToolHandlerDeps')
    const apiCommandsDeclaration = readDeclaration('api/commands.d.ts')
    assert.ok(apiCommandsDeclaration.includes("import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'"), 'api/commands declaration should expose Pi extension composition context')
    assert.ok(apiCommandsDeclaration.includes("import type { CommandHandlerDeps } from '../commands/shared.js'"), 'api/commands declaration should classify dependency shape through composition helper deps')
    assert.ok(apiCommandsDeclaration.includes('registerAgentTeamCommands'), 'api/commands declaration should expose command registration helper')
    assert.equal(apiCommandsDeclaration.includes('../app/'), false, 'api/commands declaration should not directly expose app internals')
    const toolDepsDeclaration = readDeclaration('tools/shared.d.ts')
    assert.ok(toolDepsDeclaration.includes('../app/types.js'), 'ToolHandlerDeps is an extension-composition dependency surface and currently references app deps')
    assert.ok(toolDepsDeclaration.includes('../app/ports.js'), 'ToolHandlerDeps is an extension-composition dependency surface and currently references app ports')
    assert.ok(toolDepsDeclaration.includes('../internalTypes.js'), 'ToolHandlerDeps is an extension-composition dependency surface and currently references internal team state types')
    const commandDepsDeclaration = readDeclaration('commands/shared.d.ts')
    assert.ok(commandDepsDeclaration.includes('../adapters/runtime/session.js'), 'CommandHandlerDeps is an extension-composition dependency surface and currently references runtime cleanup options')
    assert.ok(commandDepsDeclaration.includes('../internalTypes.js'), 'CommandHandlerDeps is an extension-composition dependency surface and currently references internal team state types')
    const bridgeIndexDeclaration = readDeclaration('adapters/bridge/index.d.ts')
    for (const runtimeBridgeDeclarationExport of [
      '../../runtime/bridgeConstants.js',
      '../../runtime/bridgeTypes.js',
      '../../runtime/bridgeDeliveryPump.js',
      '../../runtime/bridgeLease.js',
      '../../runtime/bridgeController.js',
      '../../runtime/bridgeLifecycle.js',
    ]) {
      assert.ok(bridgeIndexDeclaration.includes(runtimeBridgeDeclarationExport), `bridge compatibility declaration should re-export ${runtimeBridgeDeclarationExport}`)
    }
    assert.ok(bridgeIndexDeclaration.includes('type WorkerBridgeController'), 'bridge compatibility declaration should expose current controller type')
    assert.equal(bridgeIndexDeclaration.includes('createBridgeDeliveryRequest'), false, 'bridge compatibility declaration should not export createBridgeDeliveryRequest')
    assert.equal(bridgeIndexDeclaration.includes('bridgeRequest.js'), false, 'bridge compatibility declaration should not expose bridge request helper module')
    assert.equal(fs.readFileSync(path.join(declarationDir, 'internalTypes.d.ts'), 'utf8').includes('TeamState'), true, 'internalTypes declaration should retain persisted/runtime types internally')
    assert.equal(fs.existsSync(path.join(declarationDir, 'state.d.ts')), false, 'state.ts facade should not emit public/internal declaration surface')
    for (const removedFacadeDeclaration of [
      'tmux.d.ts',
      'runtime.d.ts',
      'runtimeBridge.d.ts',
      'runtimeDelivery.d.ts',
      'runtimePanes.d.ts',
      'runtimeRules.d.ts',
      'runtimeService.d.ts',
      'runtimeStorage.d.ts',
    ]) {
      assert.equal(fs.existsSync(path.join(declarationDir, removedFacadeDeclaration)), false, `${removedFacadeDeclaration} root facade declaration should not be emitted`)
    }
    fs.rmSync(declarationDir, { recursive: true, force: true })
  },
}
