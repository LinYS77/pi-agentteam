const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function sortedKeys(mod) {
  return Object.keys(mod).sort()
}

function assertExportKeys(mod, expected, label) {
  assert.deepEqual(sortedKeys(mod), expected.slice().sort(), `${label} public runtime export keys should remain characterized`)
}

function rootPackageTarballs(root) {
  return fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/.test(name)).sort()
}

function packedFileList(root) {
  assert.deepEqual(rootPackageTarballs(root), [], 'repo root should not contain pi-agentteam tarballs before package dry-run')
  const packed = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(packed.status, 0, `npm pack dry-run should succeed for public surface characterization\n${packed.stdout}\n${packed.stderr}`)
  const parsed = JSON.parse(packed.stdout)
  assert.equal(parsed[0].name, 'pi-agentteam', 'pack dry-run should inspect pi-agentteam package')
  assert.equal(parsed[0].version, '0.6.8', 'S6 readiness should track current approved package version')
  assert.equal(parsed[0].entryCount, parsed[0].files.length, 'npm pack dry-run entryCount should match files list length')
  assert.deepEqual(rootPackageTarballs(root), [], 'npm pack dry-run should not leave pi-agentteam tarballs in repo root')
  return parsed[0].files.map(file => file.path).sort()
}

function assertNoTokens(source, tokens, label) {
  for (const token of tokens) {
    assert.equal(source.includes(token), false, `${label} should not contain ${token}`)
  }
}

const allowedTopLevelTsFiles = [
  'agents.ts',
  'config.ts',
  'deliveryPolicy.ts',
  'index.ts',
  'internalTypes.ts',
  'messageLifecycle.ts',
  'orchestration.ts',
  'policy.ts',
  'protocol.ts',
  'renderers.ts',
  'session.ts',
  'teamPanel.ts',
  'types.ts',
  'utils.ts',
  'workerTurnPrompt.ts',
]

const publicSurfaceFiles = [
  'index.ts',
  'types.ts',
  'deliveryPolicy.ts',
  'api/tools.ts',
  'api/commands.ts',
  'adapters/bridge/index.ts',
]

const removedRootFacades = [
  'commands.ts',
  'tools.ts',
  'state.ts',
  'tmux.ts',
  'runtime.ts',
  'runtimeService.ts',
  'runtimeBridge.ts',
  'runtimeDelivery.ts',
  'runtimePanes.ts',
  'runtimeRules.ts',
  'runtimeStorage.ts',
  'runtimeWake.ts',
]

module.exports = {
  name: 'public surface facade characterization',
  async run(env) {
    const root = env.helpers.extRoot
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

    assert.equal(pkg.name, 'pi-agentteam')
    assert.equal(pkg.version, '0.6.8', 'v0.6.8 S6 should update current approved release target')
    assert.deepEqual(pkg.pi?.extensions, ['./index.ts'], 'pi extension entry should remain the package facade')
    assert.equal(Object.prototype.hasOwnProperty.call(pkg, 'exports'), false, 'package should not define a restrictive exports map yet')
    assert.equal(Object.prototype.hasOwnProperty.call(pkg, 'main'), false, 'package should characterize current no-main extension package state')
    assert.equal(Object.prototype.hasOwnProperty.call(pkg, 'types'), false, 'package should characterize current no-types extension package state')

    const files = pkg.files || []
    assert.ok(Array.isArray(files) && files.length > 0, 'package files should be an explicit runtime packaging allow-list')
    assert.equal(files.includes('*.ts'), false, 'package files should not use broad top-level *.ts')
    assert.equal(files.includes('**/*.ts'), false, 'package files should not use broad recursive *.ts')
    assert.equal(files.some(item => item === 'docs' || item === 'docs/' || item.startsWith('docs/')), false, 'package files should keep docs local-only')
    assert.equal(files.some(item => item === 'scripts' || item === 'scripts/' || item.startsWith('scripts/')), false, 'package files should keep scripts local-only')
    assert.equal(files.some(item => item === 'tests' || item === 'tests/' || item.startsWith('tests/')), false, 'package files should keep tests local-only')
    for (const lifecycleScript of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(Object.prototype.hasOwnProperty.call(pkg.scripts || {}, lifecycleScript), false, `package should not define lifecycle script ${lifecycleScript}`)
    }
    for (const requiredPackageEntry of [
      'index.ts',
      'types.ts',
      'deliveryPolicy.ts',
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
      'config.example.json',
      'tsconfig.json',
      'README.md',
      'LICENSE',
    ]) {
      assert.ok(files.includes(requiredPackageEntry), `package files should include runtime packaging allow-list entry ${requiredPackageEntry}`)
    }
    for (const forbiddenPackageEntry of ['docs/', 'scripts/', 'tests/', 'tmp/', 'temp/', 'data/', 'dist/', 'node_modules/', '*.tgz', 'pi-agentteam-*.tgz']) {
      assert.equal(files.includes(forbiddenPackageEntry), false, `package files should not include local/dev/temp entry ${forbiddenPackageEntry}`)
    }

    const packedFiles = packedFileList(root)
    const topLevelTsFiles = fs.readdirSync(root).filter(name => name.endsWith('.ts')).sort()
    assert.deepEqual(topLevelTsFiles, allowedTopLevelTsFiles.slice().sort(), 'unexpected top-level TypeScript facade requires explicit compatibility/deprecation plan and test allow-list update')
    for (const publicSurfaceFile of publicSurfaceFiles) {
      assert.equal(fs.existsSync(path.join(root, publicSurfaceFile)), true, `${publicSurfaceFile} public-looking surface should remain present`)
      assert.ok(packedFiles.includes(publicSurfaceFile), `${publicSurfaceFile} public-looking surface should remain packed`)
    }
    for (const requiredPackedFile of [
      'index.ts',
      'types.ts',
      'api/tools.ts',
      'api/commands.ts',
      'deliveryPolicy.ts',
      'adapters/bridge/index.ts',
      'adapters/bridge/delivery.ts',
      'app/outboxSideEffects.ts',
      'runtime/leaderMailboxSignalRuntime.ts',
      'hooks/session.ts',
      'core/publicModel.ts',
      'teamPanel/layout.ts',
      'tmux/core.ts',
      'tools/shared.ts',
      'config.example.json',
      'tsconfig.json',
      'README.md',
      'LICENSE',
    ]) {
      assert.ok(packedFiles.includes(requiredPackedFile), `npm pack dry-run should include public/runtime-required package file ${requiredPackedFile}`)
    }
    for (const removedRootFacade of removedRootFacades) {
      assert.equal(fs.existsSync(path.join(root, removedRootFacade)), false, `${removedRootFacade} root facade should remain absent from source`)
      assert.equal(packedFiles.includes(removedRootFacade), false, `${removedRootFacade} root facade should remain absent from npm pack dry-run`)
    }
    assert.equal(packedFiles.some(file => file === 'tests' || file.startsWith('tests/')), false, 'npm pack dry-run should exclude tests')
    assert.equal(packedFiles.some(file => file === 'docs' || file.startsWith('docs/')), false, 'npm pack dry-run should exclude docs')
    assert.equal(packedFiles.some(file => file === 'scripts' || file.startsWith('scripts/')), false, 'npm pack dry-run should exclude scripts')
    assert.equal(packedFiles.some(file => file.endsWith('.tgz') || file.startsWith('tmp/') || file.startsWith('temp/')), false, 'npm pack dry-run should exclude tarballs and temp files')

    const indexModule = env.helpers.requireDist('index.js')
    assertExportKeys(indexModule, ['default'], 'index.ts facade')
    const indexSource = env.helpers.readSource('index.ts')
    assert.ok(indexSource.includes('export default function agentTeamExtension'), 'index.ts should remain default extension export')
    assert.equal(/^export\s+function\s+/m.test(indexSource), false, 'index.ts should not add named function exports')
    assert.equal(/^export\s+(const|let|var|class|interface|type)\b/m.test(indexSource), false, 'index.ts should not add broad named exports')
    assert.equal(/^export\s+(?!default\b)/m.test(indexSource), false, 'index.ts should remain default-only, not a public barrel')
    assert.equal(/^export\s+\{/m.test(indexSource), false, 'index.ts should not add a named barrel')
    assert.equal(/^export\s+\*/m.test(indexSource), false, 'index.ts should not add a wildcard barrel')

    const apiTools = env.helpers.requireDist('api/tools.js')
    assertExportKeys(apiTools, ['registerAgentTeamTools'], 'api/tools.ts')
    assert.equal(typeof apiTools.registerAgentTeamTools, 'function', 'api/tools.ts should export registerAgentTeamTools')
    const apiToolsSource = env.helpers.readSource('api/tools.ts')
    assert.deepEqual(apiToolsSource.match(/^export\s+/gm) || [], ['export '], 'api/tools.ts should have one public export declaration')

    const apiCommands = env.helpers.requireDist('api/commands.js')
    assertExportKeys(apiCommands, ['registerAgentTeamCommands'], 'api/commands.ts')
    assert.equal(typeof apiCommands.registerAgentTeamCommands, 'function', 'api/commands.ts should export registerAgentTeamCommands')
    const apiCommandsSource = env.helpers.readSource('api/commands.ts')
    assert.deepEqual(apiCommandsSource.match(/^export\s+/gm) || [], ['export '], 'api/commands.ts should have one public export declaration')

    const publicTypes = env.helpers.requireDist('types.js')
    assertExportKeys(publicTypes, [
      'MESSAGE_READ_STATES',
      'MESSAGE_TYPES',
      'TASK_REPORT_TYPES',
      'TASK_STATUSES',
      'TEAM_LEAD',
      'WORKER_HEALTHS',
      'isMessageReadState',
      'isMessageType',
      'isTaskReportType',
      'isTaskStatus',
      'isWorkerHealth',
      'normalizeMessageReadState',
      'normalizeMessageType',
      'normalizeTaskReportType',
      'normalizeTaskStatus',
      'normalizeWorkerHealth',
    ], 'types.ts')
    assert.deepEqual(publicTypes.TASK_STATUSES, ['open', 'blocked', 'done'])
    assert.deepEqual(publicTypes.WORKER_HEALTHS, ['offline', 'idle', 'busy', 'error'])
    assert.deepEqual(publicTypes.MESSAGE_TYPES, ['assignment', 'question', 'inform'])
    assert.deepEqual(publicTypes.TASK_REPORT_TYPES, ['report_done', 'report_blocked'])
    assert.deepEqual(publicTypes.MESSAGE_READ_STATES, ['unread', 'read'])
    assert.equal(publicTypes.TEAM_LEAD, 'team-lead')
    assert.equal(publicTypes.WORKER_FSM_STATUSES, undefined, 'types.ts should not expose worker FSM statuses')
    assert.equal(publicTypes.DELIVERY_REQUEST_STATUSES, undefined, 'types.ts should not expose delivery request statuses')
    assert.equal(publicTypes.OUTBOX_EFFECT_STATUSES, undefined, 'types.ts should not expose Outbox effect statuses')
    const publicTypesSource = env.helpers.readSource('types.ts')
    assert.ok(publicTypesSource.includes('Public/stable vocabulary surface'), 'types.ts should document public vocabulary surface tier')
    assert.ok(publicTypesSource.includes('Packed runtime files are'), 'types.ts should distinguish public vocabulary from packed runtime files')
    assertNoTokens(publicTypesSource, [
      'WORKER_FSM_STATUSES',
      'DELIVERY_REQUEST_STATUSES',
      'OUTBOX_EFFECT_STATUSES',
      'WorkerFsmStatus',
      'DeliveryRequestStatus',
      'OutboxEffectStatus',
      'pending_delivery',
      'queued',
      'running',
      'draining',
      'claimed',
      'submitted',
      'projected',
    ], 'types.ts source')

    const deliveryPolicy = env.helpers.requireDist('deliveryPolicy.js')
    assertExportKeys(deliveryPolicy, [
      'BRIDGE_ONLY_DELIVERY_POLICY',
      'DEFAULT_DELIVERY_POLICY',
      'isBridgeOnlyDeliveryPolicy',
      'normalizeDeliveryPolicyName',
      'parseDeliveryPolicyName',
      'resolveDeliveryPolicy',
    ], 'deliveryPolicy.ts')
    assert.equal(deliveryPolicy.BRIDGE_ONLY_DELIVERY_POLICY, 'bridge-only')
    assert.equal(deliveryPolicy.DEFAULT_DELIVERY_POLICY, 'bridge-only')
    assert.equal(deliveryPolicy.parseDeliveryPolicyName(undefined), 'bridge-only')
    assert.equal(deliveryPolicy.parseDeliveryPolicyName('bridge-only'), 'bridge-only')
    for (const legacyAlias of ['bridge', 'legacy', 'tmux', 'terminal', 'bridge_only']) {
      assert.equal(deliveryPolicy.parseDeliveryPolicyName(legacyAlias), null, `deliveryPolicy should not parse legacy delivery alias ${legacyAlias}`)
      assert.equal(deliveryPolicy.normalizeDeliveryPolicyName(legacyAlias), 'bridge-only', `deliveryPolicy normalization should remain bridge-only for ${legacyAlias}`)
      assert.deepEqual(deliveryPolicy.resolveDeliveryPolicy({ policy: legacyAlias }), {
        policy: 'bridge-only',
        label: 'bridge-only',
        stable: true,
        workerBridgeAutoStart: true,
        workerBridgeAutoPump: true,
        bridgeRetryUsesSameChannel: true,
      }, `deliveryPolicy resolve should remain exact bridge-only shape for ${legacyAlias}`)
    }
    for (const removedAlias of [
      'parseDeliveryMode',
      'normalizeDeliveryMode',
      'AgentTeamDeliveryMode',
      'DELIVERY_MODE_ENV_VAR',
      'BRIDGE_ONLY_DELIVERY_MODE',
      'DEFAULT_DELIVERY_MODE',
      'isBridgeOnlyDeliveryMode',
    ]) {
      assert.equal(deliveryPolicy[removedAlias], undefined, `deliveryPolicy should not export legacy ${removedAlias}`)
    }
    const deliveryPolicySource = env.helpers.readSource('deliveryPolicy.ts')
    assert.ok(deliveryPolicySource.includes('Public/stable bridge-only delivery policy helper surface'), 'deliveryPolicy.ts should document bridge-only helper tier')
    assert.ok(deliveryPolicySource.includes('compatibility surface'), 'deliveryPolicy.ts should describe compatibility helper intent')
    assertNoTokens(deliveryPolicySource, [
      'parseDeliveryMode',
      'normalizeDeliveryMode',
      'AgentTeamDeliveryMode',
      'DELIVERY_MODE_ENV_VAR',
      'BRIDGE_ONLY_DELIVERY_MODE',
      'DEFAULT_DELIVERY_MODE',
      'isBridgeOnlyDeliveryMode',
    ], 'deliveryPolicy.ts source')

    const apiToolsCommentSource = env.helpers.readSource('api/tools.ts')
    assert.ok(apiToolsCommentSource.includes('Extension composition helper surface'), 'api/tools.ts should document extension composition tier')
    assert.ok(apiToolsCommentSource.includes('not intended as a broad end-user API'), 'api/tools.ts should avoid promising broad public API')
    const apiCommandsCommentSource = env.helpers.readSource('api/commands.ts')
    assert.ok(apiCommandsCommentSource.includes('Extension composition helper surface'), 'api/commands.ts should document extension composition tier')
    assert.ok(apiCommandsCommentSource.includes('not intended as a broad end-user API'), 'api/commands.ts should avoid promising broad public API')

    const bridgeIndex = env.helpers.requireDist('adapters/bridge/index.js')
    assertExportKeys(bridgeIndex, [
      'BRIDGE_CAPABILITIES',
      'BRIDGE_HEARTBEAT_MS',
      'BRIDGE_PACKAGE_VERSION',
      'BRIDGE_PROTOCOL_VERSION',
      'BRIDGE_SEEN_MIN_UPDATE_MS',
      'BRIDGE_TASK_REQUEST_REASON',
      'BRIDGE_VERSION',
      'BRIDGE_WATCH_DEBOUNCE_MS',
      'BRIDGE_WATCH_RETRY_MS',
      'activeWorkerBridgeControllerCount',
      'bridgeLeaseReadyForMember',
      'buildBridgeTurnPrompt',
      'expireStaleBridgeLeases',
      'heartbeatBridgeLease',
      'isBridgeFresh',
      'markBridgeAgentEnd',
      'markBridgeAgentStart',
      'markBridgeSeen',
      'markBridgeStopped',
      'notifyBridgeWork',
      'publishBridgeLease',
      'pumpBridgeOnce',
      'pumpWorkerBridgeForContext',
      'startWorkerBridge',
      'startWorkerBridgeForContext',
      'stopWorkerBridge',
    ], 'adapters/bridge/index.ts')
    assert.equal(bridgeIndex.createBridgeDeliveryRequest, undefined, 'adapters/bridge/index.ts should not export createBridgeDeliveryRequest')
    const bridgeIndexSource = env.helpers.readSource('adapters/bridge/index.ts')
    assert.equal(bridgeIndexSource.includes('createBridgeDeliveryRequest'), false, 'bridge index source should not re-export createBridgeDeliveryRequest')
    assert.equal(bridgeIndexSource.includes('bridgeRequest.js'), false, 'bridge index source should not expose bridge request helper module')
    assert.ok(bridgeIndexSource.includes('Bridge runtime adapter compatibility barrel'), 'bridge index should document compatibility barrel tier')
    assert.ok(bridgeIndexSource.includes('not a broad user API'), 'bridge index should avoid promising broad public API')

    const boundarySource = env.helpers.readSource('scripts/check-import-boundaries.cjs')
    for (const expectedTierToken of [
      'stablePublicEntries',
      'extensionCompositionEntries',
      'runtimeAdapterCompatibilityEntries',
      'internalImplementationPrefixes',
      "'types.ts'",
      "'deliveryPolicy.ts'",
      "'index.ts'",
      "'api/tools.ts'",
      "'api/commands.ts'",
      "'adapters/bridge/index.ts'",
      "'app/'",
      "'runtime/'",
      "'state/'",
      "'teamPanel/'",
      "'commands/'",
      "'hooks/'",
      "'tmux/'",
      "'tools/'",
      "'adapters/runtime/'",
      "'adapters/tmux/'",
    ]) {
      assert.ok(boundarySource.includes(expectedTierToken), `boundary checker should encode tier token ${expectedTierToken}`)
    }
    for (const expectedPolicyGuard of [
      'stable public entry must not import',
      'stable public entry mentions internal token',
      'types.ts: stable public vocabulary should depend on core/publicModel',
      'deliveryPolicy.ts: stable public policy helper must remain bridge-only',
      'extension composition entry should stay thin',
      'runtime adapter compatibility entry should re-export bridge runtime modules',
      'unexpected top-level TypeScript facade',
      'must not add ${field}',
      'exports',
      'main',
      'types',
      'app/taskApplication.ts',
      'facade should delegate only to approved extracted modules',
      'app/outboxSideEffects.ts',
      'runtime/leaderMailboxSignalRuntime.ts',
      'teamPanel/layout.ts',
    ]) {
      assert.ok(boundarySource.includes(expectedPolicyGuard), `boundary checker should preserve policy guard: ${expectedPolicyGuard}`)
    }
    assert.ok(boundarySource.includes('stablePublicForbiddenTokens'), 'boundary checker should keep stable-public forbidden token list separate from broader public runtime entries')
    assert.ok(boundarySource.includes('publicRuntimeEntries'), 'boundary checker should preserve existing public-runtime entry guard')
    assert.ok(boundarySource.includes('completedPortBoundaryRules'), 'boundary checker should preserve existing app/outbox/task/signal boundary rules')

    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
    for (const publicPromise of [
      'full-text read boundary',
      'agentteam_receive({ markRead: true })',
      'only normal full-text mailbox entry point',
      'does **not** focus tmux panes, perform task/message CRUD, or mark mailbox items delivered/read',
      'compact leader mailbox projection sync without marking messages read or delivered',
      '`/team` now shows compact TaskReport/TaskEvent/TaskMessageRef summaries and counts',
      'single bridge-only delivery policy',
      'does not silently fall back to terminal key injection',
      'no automatic fallback to terminal key injection',
      'There is no automatic in-process switch from bridge-only delivery to terminal transport',
      'It must not auto-spawn, auto-create downstream tasks, broadcast, or start worker-to-worker chains',
      'do not create ordinary panel/prompt context',
      'do not create worker delivery requests or authorize downstream work',
      '`docs/` remains local design notes and `scripts/` remains local development helpers; neither directory is included in the npm package `files` list by default.',
      'GitHub-only vNext notes in this README can appear before an npm publish is explicitly performed',
      'do not assume unreleased GitHub changes are available from npm',
      'If v0.6.8 is promoted to npm, it may sync npm users from `pi-agentteam@0.6.3` across several GitHub-only releases',
      'release-notes-only compatibility posture',
      '### Package Surface Tiers',
      'Packed runtime files are not all stable public API.',
      'package intentionally has no restrictive `exports` map at this surface tier',
      'existing deep imports are not newly blocked yet',
      'Public/stable promises',
      'Pi extension default entrypoint is `package.json#pi.extensions` pointing at `./index.ts`',
      'Public collaboration vocabulary and simple public shapes live in `types.ts`',
      'User-facing Pi tool/command schemas and behavior are the primary product API',
      '`deliveryPolicy.ts` bridge-only helpers document the supported delivery policy surface',
      'Compatibility/composition surfaces',
      '`api/tools.ts` and `api/commands.ts` are extension composition helpers',
      '`adapters/bridge/index.ts` is a bridge runtime adapter compatibility surface',
      'Internal/packed-for-runtime paths',
      '`app/`, `runtime/`, `state/`, `teamPanel/`, `commands/`, `hooks/`, `tmux/`, most `tools/`, `adapters/runtime/`, and `adapters/tmux/` are packed so the extension can run',
      '`package.json#files` is a runtime packaging allow-list, not a promise that every packed subpath is stable API',
      '#### v0.6.8 npm sync compatibility note',
      'npm `latest` may jump from `pi-agentteam@0.6.3` to v0.6.8 after several GitHub-only releases',
      '8 internal runtime/source files added and 0 packed files removed',
      'No root compatibility facades/wrappers were added',
      '`commands.ts`, `tools.ts`, `state.ts`, `tmux.ts`, `runtime*.ts`, and `runtimeWake.ts` were not packed in npm `0.6.3` and remain absent',
      'Stable/public entries remain present: `index.ts`, `types.ts`, `deliveryPolicy.ts`, `api/tools.ts`, `api/commands.ts`, and `adapters/bridge/index.ts`',
      'Unsupported deep imports into internals may need adjustment',
      'Release notes are the compatibility path for v0.6.8',
      'Targeted shims/wrappers are considered only with concrete external-user evidence',
      'AgentTeam will not add broad compatibility wrappers',
      '`/team` stays compact/read-mostly and does not mark mailbox read/delivered',
      'delivery stays bridge-only with no terminal-key fallback',
      'does not add autopilot, hidden workers, worker-spawns-worker, automatic downstream task creation, or other downstream automation',
    ]) {
      assert.ok(readme.includes(publicPromise), `README should keep existing public promise: ${publicPromise}`)
    }
  },
}
