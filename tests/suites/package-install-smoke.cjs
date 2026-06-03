const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function walkSourceFiles(root, out = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'tests' || entry.name === 'data' || entry.name === '.git') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkSourceFiles(full, out)
    else if (entry.isFile() && /\.(ts|md)$/.test(entry.name)) out.push(full)
  }
  return out
}

function packedFileList(root) {
  const packed = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(packed.status, 0, `npm pack dry-run should succeed\n${packed.stdout}\n${packed.stderr}`)
  const parsed = JSON.parse(packed.stdout)
  return parsed[0].files.map(file => file.path).sort()
}

module.exports = {
  name: 'package install smoke',
  async run(env) {
    const root = path.resolve(__dirname, '..', '..')
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

    assert.equal(pkg.name, 'pi-agentteam')
    assert.ok(pkg.pi && Array.isArray(pkg.pi.extensions), 'package.json should declare pi.extensions')
    assert.ok(pkg.pi.extensions.includes('./index.ts'), 'package.json should expose ./index.ts as pi extension entry')

    const files = pkg.files || []
    const packedFiles = packedFileList(root)
    assert.equal(pkg.version, '0.6.3', 'release package version should match approved v0.6.3 target')
    assert.equal(pkg.scripts?.test, 'node tests/run.cjs')
    assert.equal(pkg.scripts?.typecheck, 'tsc --noEmit -p tsconfig.json')
    assert.equal(pkg.scripts?.['check:boundaries'], 'node scripts/check-import-boundaries.cjs')
    assert.ok(pkg.scripts?.check?.includes('npm test'), 'check should run unit/package tests')
    assert.ok(pkg.scripts?.check?.includes('npm run typecheck'), 'check should run typecheck')
    assert.ok(pkg.scripts?.check?.includes('git diff --check'), 'check should run whitespace diff check')
    assert.ok(pkg.scripts?.check?.includes('npm run -s check:boundaries'), 'check should run boundary guard without recursion')
    assert.equal(pkg.scripts?.check?.includes('npm run check'), false, 'check must not recursively call itself')
    assert.ok(pkg.scripts?.['release:check']?.includes('npm run check'), 'release:check should include check gate')
    assert.ok(pkg.scripts?.['release:check']?.includes('npm pack --dry-run'), 'release:check should include package dry-run')
    assert.ok(pkg.scripts?.['release:check']?.includes('--ignore-scripts'), 'release:check should avoid package lifecycle side effects')
    assert.equal(pkg.scripts?.['release:check']?.includes('npm publish'), false, 'release:check must not publish')
    assert.equal(pkg.scripts?.['release:check']?.includes('npm version'), false, 'release:check must not bump version')
    assert.equal(pkg.scripts?.['release:check']?.includes('test:e2e'), false, 'release:check should not run real tmux/pi e2e smoke')
    assert.equal(env.modules.state.getTeamStatePath('layout-smoke').endsWith('/teams/layout-smoke/team.json'), true, 'package smoke should expose near-target team.json state path')
    assert.equal(env.modules.state.getMailboxPath('layout-smoke', 'team-lead').endsWith('/teams/layout-smoke/inboxes/team-lead.json'), true, 'package smoke should expose near-target inbox path')
    assert.equal(env.modules.state.getOutboxStatePath('layout-smoke').endsWith('/teams/layout-smoke/outbox.json'), true, 'package smoke should expose near-target outbox path')
    assert.equal(env.modules.state.getRuntimeStatePath('layout-smoke').endsWith('/teams/layout-smoke/runtime.json'), true, 'package smoke should expose near-target runtime path')
    assert.equal(env.modules.state.getBridgeStatePath, undefined, 'focused state stores should not expose bridge runtime path alias')
    assert.equal(env.modules.state.getDeliveryStatePath, undefined, 'focused state stores should not expose delivery runtime path alias')
    assert.equal(env.modules.state.getLeaderProjectionStatePath, undefined, 'focused state stores should not expose leader projection runtime path alias')
    assert.equal(env.modules.state.getLeaderAttentionStatePath, undefined, 'focused state stores should not expose leader attention runtime path alias')
    assert.equal(env.modules.state.getSessionsDir().endsWith('/sessions'), true, 'package smoke should expose near-target sessions path')
    assert.ok(files.includes('config.example.json'), 'package files should include config.example.json')
    assert.ok(!pkg.scripts?.postinstall, 'package must not create runtime config during npm/pi install')
    assert.ok(!pkg.scripts?.preinstall, 'package must not mutate user settings during npm/pi install')
    assert.ok(!pkg.scripts?.install, 'package must not mutate user settings during npm/pi install')
    assert.ok(!pkg.scripts?.prepare, 'package must not run publish-time side effects during local validation')
    assert.ok(fs.existsSync(path.join(root, 'config.example.json')), 'config.example.json should exist at package root')
    const exampleConfig = JSON.parse(fs.readFileSync(path.join(root, 'config.example.json'), 'utf8'))
    assert.deepEqual(exampleConfig, { agentModels: { planner: null, researcher: null, implementer: null } })
    assert.equal(files.includes('*.ts'), false, 'package files should not expose broad top-level *.ts surface')
    const requiredTopLevelFiles = [
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
    for (const requiredTopLevelFile of requiredTopLevelFiles) {
      assert.ok(files.includes(requiredTopLevelFile), `package files should explicitly include required top-level file ${requiredTopLevelFile}`)
      assert.ok(packedFiles.includes(requiredTopLevelFile), `npm pack dry-run should include required top-level file ${requiredTopLevelFile}`)
    }
    assert.ok(files.includes('api/'), 'package files should include pi-facing api registration entrypoints')
    assert.ok(files.includes('adapters/'), 'package files should include explicit runtime/tmux adapter entrypoints')
    assert.ok(files.includes('!/commands.ts'), 'package files should explicitly exclude legacy top-level commands registration entrypoint without excluding api/commands.ts')
    assert.ok(files.includes('!/tools.ts'), 'package files should explicitly exclude legacy top-level tools registration entrypoint without excluding api/tools.ts')
    assert.ok(files.includes('!state.ts'), 'package files should explicitly exclude legacy top-level state facade')
    assert.equal(fs.existsSync(path.join(root, 'state.ts')), false, 'legacy top-level state facade should be removed from source')
    for (const removedRootFacade of [
      '!tmux.ts',
      '!runtime.ts',
      '!runtimeBridge.ts',
      '!runtimeDelivery.ts',
      '!runtimePanes.ts',
      '!runtimeRules.ts',
      '!runtimeService.ts',
      '!runtimeStorage.ts',
    ]) {
      assert.ok(files.includes(removedRootFacade), `package files should explicitly exclude removed root facade ${removedRootFacade}`)
    }
    assert.equal(fs.existsSync(path.join(root, 'api', 'commands.ts')), true, 'api commands registration entrypoint should exist')
    assert.equal(fs.existsSync(path.join(root, 'api', 'tools.ts')), true, 'api tools registration entrypoint should exist')
    assert.equal(fs.existsSync(path.join(root, 'commands.ts')), false, 'legacy top-level commands registration entrypoint should be removed from source')
    assert.equal(fs.existsSync(path.join(root, 'tools.ts')), false, 'legacy top-level tools registration entrypoint should be removed from source')
    assert.ok(files.includes('commands/'), 'package files should include command console submodules')
    assert.ok(files.includes('app/'), 'package files should include app/use-case boundary submodules')
    assert.ok(files.includes('core/'), 'package files should include core policy/reducer submodules')
    assert.ok(files.includes('runtime/'), 'package files should include runtime submodules')
    assert.ok(files.includes('!runtime/teamSideEffects.ts'), 'package files should explicitly exclude legacy direct side-effect runner')
    assert.ok(files.includes('state/'), 'package files should include state submodules')
    assert.ok(files.includes('teamPanel/'), 'package files should include team panel submodules')
    assert.ok(files.includes('tmux/'), 'package files should include tmux submodules')
    for (const removedCompatWrapper of [
      '!tools/messageDelivery.ts',
      '!tools/messagePolicy.ts',
      '!tools/messageRouting.ts',
      '!tools/taskCommands.ts',
      '!tools/taskPolicy.ts',
      '!tools/taskActionability.ts',
    ]) {
      assert.ok(files.includes(removedCompatWrapper), `package files should explicitly exclude removed compatibility wrapper ${removedCompatWrapper}`)
    }
    assert.ok(!files.includes('tests/'), 'published package should not include test suites')
    assert.ok(!files.includes('docs/'), 'published package should not include local design/release notes by default')
    assert.ok(!files.includes('scripts/'), 'published package should not include local development seed scripts')
    assert.ok(!files.some(item => item === 'docs' || item.startsWith('docs/')), 'package files should keep docs excluded')
    assert.ok(!files.some(item => item === 'scripts' || item.startsWith('scripts/')), 'package files should keep scripts excluded')
    assert.equal(fs.existsSync(path.join(root, 'runtime', 'teamSideEffects.ts')), false, 'legacy direct side-effect runner should be removed from source')

    const toolRegistrationFiles = [
      'tools/team.ts',
      'tools/message.ts',
      'tools/task.ts',
    ]
    for (const file of toolRegistrationFiles) {
      const text = fs.readFileSync(path.join(root, file), 'utf8')
      assert.ok(!text.includes("../state.js"), `${file} should delegate state access to service modules`)
      assert.ok(!text.includes("../tmux.js"), `${file} should delegate tmux access to service modules`)
      assert.ok(!text.includes("../agents.js"), `${file} should delegate agent discovery to service modules`)
    }

    const removedFiles = [
      'state.ts',
      'tmux.ts',
      'runtime.ts',
      'runtimeBridge.ts',
      'runtimeDelivery.ts',
      'runtimePanes.ts',
      'runtimeRules.ts',
      'runtimeService.ts',
      'runtimeStorage.ts',
      'commands/cleanup.ts',
      'tools/messageMirror.ts',
      'tools/taskUtils.ts',
      'tools/messageDelivery.ts',
      'tools/messagePolicy.ts',
      'tools/messageRouting.ts',
      'tools/taskCommands.ts',
      'tools/taskPolicy.ts',
      'tools/taskActionability.ts',
      'runtime/teamSideEffects.ts',
      'core/taskNoteModel.ts',
      'state/taskNotes.ts',
      'docs/release-checklist.md',
      'docs/testing-real-experience.md',
    ]
    for (const file of removedFiles) {
      assert.equal(fs.existsSync(path.join(root, file)), false, `${file} should not exist before release`)
      assert.equal(packedFiles.includes(file), false, `${file} should not be included by npm pack dry-run`)
    }
    for (const requiredPackedFile of [
      'index.ts',
      'api/tools.ts',
      'api/commands.ts',
      'app/effectRunner.ts',
      'app/deliveryTypes.ts',
      'adapters/bridge/delivery.ts',
      'adapters/runtime/session.ts',
      'adapters/tmux/index.ts',
      'runtime/bridgeRequest.ts',
      'state/teamStore.ts',
      'state/taskHistory.ts',
      'state/taskHistoryMigration.ts',
      'state/taskHistoryReadModel.ts',
      'tools/team.ts',
      'commands/team.ts',
      'agents/implementer.md',
      'config.example.json',
    ]) {
      assert.ok(packedFiles.includes(requiredPackedFile), `npm pack dry-run should include required package file ${requiredPackedFile}`)
    }
    assert.equal(packedFiles.includes('tests/run.cjs'), false, 'npm pack dry-run should not include tests')
    assert.equal(packedFiles.includes('docs/agentteam-refactor-vnext.md'), false, 'npm pack dry-run should not include docs')
    assert.equal(packedFiles.includes('scripts/check-import-boundaries.cjs'), false, 'npm pack dry-run should not include scripts')

    const sourceText = [
      ...toolRegistrationFiles,
      'adapters/tmux/index.ts',
      'adapters/tmux/teamPanes.ts',
      'adapters/bridge/delivery.ts',
      'adapters/bridge/index.ts',
      'adapters/runtime/session.ts',
      'adapters/runtime/service.ts',
      'tmux/core.ts',
      'tmux/panes.ts',
      'tmux/windows.ts',
    ].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n')
    assert.ok(!sourceText.includes('@sinclair/typebox'), 'source should use typebox, not @sinclair/typebox')

    const spawnSource = fs.readFileSync(path.join(root, 'tools', 'workerSpawnService.ts'), 'utf8')
    const directBridgeRequestToken = 'create' + 'BridgeDeliveryRequest'
    assert.equal(spawnSource.includes(directBridgeRequestToken), false, 'spawn path should enqueue Outbox worker_delivery_requested instead of direct bridge delivery requests')
    assert.equal(spawnSource.includes('../state/outboxStore.js'), false, 'spawn path should use injected Outbox store port')
    assert.equal(spawnSource.includes('../app/effectRunner.js'), false, 'spawn path should use injected Outbox runner port')
    assert.ok(spawnSource.includes("kind: 'worker_delivery_requested'"), 'spawn path should route initial instruction through durable Outbox delivery effect')

    assert.equal(fs.existsSync(path.join(root, 'runtimeWake.ts')), false, 'legacy runtimeWake tmux transport module should be removed')
    assert.equal(fs.existsSync(path.join(root, 'tmux', 'wake.ts')), false, 'legacy tmux wake/paste transport module should be removed')
    const productionSourceFiles = walkSourceFiles(root).filter(file => file.endsWith('.ts'))
    const forbiddenProductionTokens = [
      'sendPromptToPane',
      'sendEnterToPane',
      'runTmuxWorkerWake',
      'wakeUsesTmux',
      'tmux_fallback',
      'pane_paste',
      'markMailboxMessagesWakeAttempted',
      'wakeAttemptedAt',
      'wakeAttemptCount',
      'set-buffer',
      'paste-buffer',
      'send-keys',
      'runtimeWake',
      "from './state.js'",
      "from '../state.js'",
      "from './tmux.js'",
      "from '../tmux.js'",
      "from './runtime.js'",
      "from '../runtime.js'",
      "from './runtimeBridge.js'",
      "from '../runtimeBridge.js'",
      "from './runtimeDelivery.js'",
      "from '../runtimeDelivery.js'",
      "from './runtimePanes.js'",
      "from '../runtimePanes.js'",
      "from './runtimeRules.js'",
      "from '../runtimeRules.js'",
      "from './runtimeService.js'",
      "from '../runtimeService.js'",
      "from './runtimeStorage.js'",
      "from '../runtimeStorage.js'",
      'parseDeliveryMode',
      'normalizeDeliveryMode',
      'AgentTeamDeliveryMode',
      'DELIVERY_MODE_ENV_VAR',
      'BRIDGE_ONLY_DELIVERY_MODE',
      'DEFAULT_DELIVERY_MODE',
      'isBridgeOnlyDeliveryMode',
      'getBridgeStatePath',
      'getDeliveryStatePath',
      'getLegacySessionContextPath',
      'sanitizeSessionFile',
      'leader_triage_requested',
      'leader_triage',
      'leader-triage',
    ]
    const forbiddenProductionRefs = []
    for (const file of productionSourceFiles) {
      const relative = path.relative(root, file)
      if (relative === path.join('scripts', 'check-import-boundaries.cjs')) continue
      const text = fs.readFileSync(file, 'utf8')
      for (const token of forbiddenProductionTokens) {
        if ((token === 'leader_triage_requested' || token === 'leader_triage') && relative === path.join('state', 'validation.ts')) continue
        if (text.includes(token)) forbiddenProductionRefs.push([relative, token])
      }
    }
    assert.deepEqual(forbiddenProductionRefs, [], 'production source should not contain legacy root facade imports, tmux message transport, wake-attempt lifecycle, or removed alias tokens')
    for (const name of [
      'ensureTmuxAvailableAsync',
      'firstPaneInWindowAsync',
      'windowExistsAsync',
      'markWindowAsAgentTeamAsync',
      'refreshWindowPaneLabelsAsync',
    ]) {
      assert.ok(!sourceText.includes(name), `source should not reference removed helper ${name}`)
    }

    const researcherPrompt = fs.readFileSync(path.join(root, 'agents/researcher.md'), 'utf8')
    assert.ok(researcherPrompt.includes('Core question: What is true?'), 'researcher prompt should be fact-focused')
    assert.ok(researcherPrompt.includes('Avoid full implementation planning unless team-lead explicitly asks'), 'researcher should avoid full planning by default')

    const plannerPrompt = fs.readFileSync(path.join(root, 'agents/planner.md'), 'utf8')
    assert.ok(plannerPrompt.includes('not a second leader'), 'planner prompt should preserve advisory role')
    assert.ok(plannerPrompt.includes('Do not create downstream execution tasks by default'), 'planner should not own downstream task creation by default')
    assert.ok(plannerPrompt.includes('Only create task-board decomposition when team-lead explicitly asks'), 'planner task-board decomposition should be explicit')
    assert.ok(plannerPrompt.includes('leader-created actionable planning task'), 'planner should require leader-created planning work')
    assert.ok(plannerPrompt.includes('Peer inform/handoff can inform later planning'), 'planner should treat peer handoff as context only')
    assert.ok(plannerPrompt.includes('report-only and does not close the task until team-lead reviews it'), 'planner close should be report-only by default')

    const workerPrompt = fs.readFileSync(path.join(root, 'tools/workerPrompt.ts'), 'utf8')
    assert.ok(workerPrompt.includes('report-only and does not close the task until leader review'), 'worker prompt should describe non-leader close as report-only')
    assert.ok(workerPrompt.includes('Task facts are concise shared state'), 'worker prompt should describe concise task facts')
    assert.ok(workerPrompt.includes('durable TaskReport artifacts and owner-to-leader action requests'), 'worker prompt should make reports the durable completion/blocker artifact')
    assert.ok(workerPrompt.includes('Task progress/history is compact local activity only and does not notify team-lead'), 'worker prompt should describe progress/history as non-notifying local activity')
    assert.equal(workerPrompt.includes('task-local notes'), false, 'worker prompt should not recommend task-local notes as primary workflow')
    assert.ok(workerPrompt.includes('compact wake/projection prompts are reminders, not the full message body'), 'worker prompt should keep receive as full-text boundary')
    assert.ok(workerPrompt.includes('same-task assigned task facts with task-bound mailbox messages'), 'worker prompt should document same-task prompt merge')
    assert.ok(workerPrompt.includes('Planner advisory gate'), 'worker prompt should include planner advisory gate')
    assert.ok(workerPrompt.includes('Peer inform/handoff messages are context for team-lead attention only'), 'worker prompt should prevent peer-driven planner work')
    assert.ok(workerPrompt.includes('report_blocked'), 'worker prompt should mention report_blocked')
    assert.ok(!workerPrompt.includes('task board and leader mailbox are updated together'), 'worker prompt should not imply non-leader close closes the task')

    const taskToolSource = fs.readFileSync(path.join(root, 'tools/task.ts'), 'utf8')
    assert.ok(taskToolSource.includes('leader-gated mutations'), 'task tool snippet should mention leader-gated mutations')
    assert.ok(taskToolSource.includes('planner is advisory by default'), 'task tool guidelines should identify planner as advisory')
    assert.ok(taskToolSource.includes('Blocked tasks are non-actionable'), 'task tool guidelines should mention blocked hard gate')
    assert.ok(taskToolSource.includes('sequential leader-gated tasks'), 'task tool guidelines should describe sequential chain delegation')
    assert.ok(taskToolSource.includes('action=progress records compact TaskEvent progress/history only'), 'task tool guidelines should document progress as compact local activity')
    assert.equal(taskToolSource.includes('action=note'), false, 'task tool should not promote public action=note')
    assert.ok(taskToolSource.includes('TaskEvent progress/activity'), 'task tool guidelines should document compact task progress/history')
    assert.ok(taskToolSource.includes('TaskMessageRef indexes'), 'task tool guidelines should document no-body task message refs')
    assert.ok(taskToolSource.includes('durable TaskReport'), 'task tool guidelines should document report actions as durable TaskReports')

    const messageToolSource = fs.readFileSync(path.join(root, 'tools/message.ts'), 'utf8')
    assert.ok(messageToolSource.includes('research→planning chains'), 'message tool guidelines should describe research-to-planning chains')
    assert.ok(messageToolSource.includes('do not let worker inform messages drive planner work directly'), 'message tool guidelines should prevent peer-driven planner work')
    assert.ok(messageToolSource.includes('mailbox remains source of truth'), 'message tool guidelines should document mailbox source of truth')
    assert.ok(messageToolSource.includes('worker-to-worker diagnostics are compact no-body audit/index metadata'), 'message tool guidelines should document no-body peer diagnostic refs')
    assert.equal(messageToolSource.includes('shared task notes'), false, 'message tool should not recommend shared task notes for long artifacts')
    assert.ok(messageToolSource.includes('full-text mailbox read boundary'), 'receive tool description should document full-text boundary')
    assert.ok(messageToolSource.includes('Multi-message human output is compactly grouped by task/thread'), 'receive tool description should document folded multi-message human output')

    const rendererSource = fs.readFileSync(path.join(root, 'renderers.ts'), 'utf8')
    assert.ok(rendererSource.includes('agentteam-leader-attention'), 'renderers should register bounded leader attention custom message')

    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
    assert.ok(readme.includes('Leader-Gated Task Governance'), 'README should document leader-gated task governance')
    assert.ok(readme.includes('report_done') && readme.includes('leaves the task open until leader review'), 'README should describe done report report review flow')
    assert.ok(readme.includes('Leader assigns `researcher` fact-finding first'), 'README should document sequential research-to-planning workflow')
    assert.ok(readme.includes('Peer context handoff'), 'README feature table should describe peer handoffs as context')
    assert.ok(readme.includes('leader reviews attention signals and explicitly starts downstream work'), 'README feature table should preserve leader-reviewed downstream work')
    assert.ok(!readme.includes('Workers coordinate directly (researcher → planner) without going through the leader'), 'README must not reintroduce direct peer-driven researcher-to-planner feature row')
    assert.ok(!readme.includes('without going through the leader'), 'README must not imply peer handoff bypasses leader attention')
    assert.ok(readme.includes('Peer `inform` handoffs are mailbox communication plus compact `TaskMessageRef` task audit refs/diagnostic event refs only'), 'README should document peer inform no-wake handoff semantics')
    assert.ok(readme.includes('diagnostic refs are compact, do not copy the full body'), 'README should document compact peer diagnostic refs')
    assert.ok(readme.includes('Bounded leader attention means one compact native leader wake'), 'README should document compact bounded leader attention')
    assert.ok(readme.includes('Outbox effect kind is `leader_attention_requested`'), 'README should document the renamed durable leader attention effect in diagnostics')
    assert.ok(readme.includes('Task-bound send indexing uses `task_message_ref_append_requested`'), 'README should document TaskMessageRef outbox effect')
    assert.ok(readme.includes('Legacy pending `task_note_append_requested` effects are migrated/cleaned before validation when possible; otherwise unsupported legacy state is quarantined'), 'README should document legacy task-note outbox cleanup/quarantine')
    assert.ok(readme.includes('using `leader_triage_requested` have no compatibility path'), 'README should document that old leader triage effects are not compatible')
    assert.ok(readme.includes('quarantine as unsupported legacy state instead of being normalized or executed'), 'README should document old leader triage effect quarantine semantics')
    assert.ok(readme.includes('`inform` never requests leader attention'), 'README should document inform no leader attention')
    assert.ok(readme.includes('`report_done` and `report_blocked` are task-report outcomes, not `agentteam_send` types'), 'README should document task reports instead of send report types')
    assert.ok(readme.includes('only for tasks they own; non-owners should use `inform` or `question` for context'), 'README should document owner-only non-leader task reports')
    assert.ok(readme.includes('`agentteam_task action=progress` records compact local TaskEvent progress/history only'), 'README should document progress as compact local activity')
    assert.equal(readme.includes('action=note'), false, 'README should not document active or deprecated note actions after no-notes cleanup')
    assert.ok(readme.includes('TaskReport/TaskEvent/TaskMessageRef history queries'), 'README should document task history query model')
    assert.ok(readme.includes('Projection and attention are reminders/wake signals'), 'README should document compact projection/attention reminders')
    assert.ok(readme.includes('compact `TaskMessageRef` audit/index rows'), 'README should document TaskMessageRef audit refs')
    assert.ok(readme.includes('new task-bound sends produce zero hidden communication-ref notes'), 'README should document no new hidden communication-ref notes')
    assert.ok(readme.includes('Legacy `task.notes` are migrated into TaskReport/TaskEvent/TaskMessageRef history and removed from active state'), 'README should document legacy note migration/removal')
    assert.ok(readme.includes('`/team` now shows compact TaskReport/TaskEvent/TaskMessageRef summaries and counts'), 'README should document panel task-history summaries')
    assert.equal(readme.includes('legacy note refs may appear only as de-emphasized compatibility diagnostics'), false, 'README should not describe legacy note refs as active panel diagnostics')
    assert.ok(readme.includes('does **not** focus tmux panes, perform task/message CRUD, or mark mailbox items delivered/read'), 'README should document panel read-only mailbox boundary')
    assert.ok(readme.includes('Unread blocked reports appear as panel attention; after the report mailbox item is read'), 'README should document read blocked-report attention cleanup')
    assert.ok(readme.includes('same-task assigned task facts and task-bound mailbox messages are merged'), 'README should document same-task worker prompt dedupe')
    assert.ok(readme.includes('full-text read boundary'), 'README should document receive full-text boundary')
    assert.ok(readme.includes('human-facing receive text folds them by task/thread'), 'README should document receive output folding')
    assert.ok(readme.includes('`details.messages` remains the full returned mailbox payload'), 'README should document full details payload')
    assert.ok(readme.includes('blockedBy') && readme.includes('hard actionability gate'), 'README should document blockedBy hard gate')
    assert.ok(readme.includes('api/app/adapters/core/runtime/state'), 'README should document current boundary layout')
    assert.ok(readme.includes('does not use broad `*.ts`'), 'README should document explicit package surface')
    assert.ok(readme.includes('automated/source-level status: FULL PASS only after'), 'README should qualify FULL PASS as gated local validation')
    assert.ok(readme.includes('pi-agentteam@0.5.0'), 'README should preserve v0.5.0 rollback baseline')

    const implementerPrompt = fs.readFileSync(path.join(root, 'agents/implementer.md'), 'utf8')
    assert.ok(implementerPrompt.includes('Core question: Make it real.'), 'implementer prompt should be execution-focused')
    assert.ok(implementerPrompt.includes('assigned task boundary'), 'implementer should stay within task boundary')
    assert.ok(implementerPrompt.includes('report-only and does not close the task until team-lead reviews it'), 'implementer close should be report-only by default')

    const peers = pkg.peerDependencies || {}
    assert.equal(peers['@earendil-works/pi-ai'], '*', 'peerDependencies should include @earendil-works/pi-ai')
    assert.equal(peers['typebox'], '*', 'peerDependencies should include typebox')
    assert.equal(peers['@earendil-works/pi-coding-agent'], '*')
    assert.equal(peers['@earendil-works/pi-tui'], '*')
    assert.equal(peers['@mariozechner/pi-ai'], undefined, 'package should not depend on stale @mariozechner scope')
    assert.equal(peers['@mariozechner/pi-coding-agent'], undefined, 'package should not depend on stale @mariozechner scope')
    assert.equal(peers['@mariozechner/pi-tui'], undefined, 'package should not depend on stale @mariozechner scope')
    assert.ok(pkg.scripts?.typecheck?.includes('tsc --noEmit'), 'package should expose real tsc typecheck script')
    assert.ok(files.includes('tsconfig.json'), 'package files should include tsconfig.json for typecheck/package smoke')

    const requiredTools = [
      'agentteam_create',
      'agentteam_spawn',
      'agentteam_send',
      'agentteam_receive',
      'agentteam_task',
    ]

    for (const name of requiredTools) {
      const tool = env.pi.__tools.get(name)
      assert.ok(tool, `tool should be registered: ${name}`)
      assert.ok(typeof tool.promptSnippet === 'string' && tool.promptSnippet.length > 0, `${name} should define promptSnippet`)
      assert.ok(Array.isArray(tool.promptGuidelines) && tool.promptGuidelines.length > 0, `${name} should define promptGuidelines`)
    }

    const messageTool = env.pi.__tools.get('agentteam_send')
    assert.deepEqual(messageTool.parameters.o.type.v.enum, ['assignment', 'question', 'inform'])
    assert.deepEqual(messageTool.parameters.o.priority.v.enum, ['low', 'normal', 'high'])
    assert.ok(messageTool.promptSnippet.includes('TaskMessageRef'), 'send tool should document task-bound refs as TaskMessageRef-backed')

    const taskTool = env.pi.__tools.get('agentteam_task')
    assert.deepEqual(taskTool.parameters.o.action.enum, ['create', 'assign', 'block', 'unblock', 'close', 'progress', 'report_done', 'report_blocked', 'list', 'show', 'history', 'reports', 'report'])
    assert.deepEqual(taskTool.parameters.o.status.v.enum, ['open', 'blocked', 'done'])
    assert.equal(taskTool.parameters.o.reportId.kind, 'optional')
    assert.equal(taskTool.parameters.o.limit.kind, 'optional')
    assert.equal(taskTool.parameters.o.all.kind, 'optional')
    assert.equal(taskTool.parameters.o.includeMessages.kind, 'optional')

    assert.deepEqual([...env.pi.__commands.keys()].filter(name => name.startsWith('team')), ['team'])
  },
}
