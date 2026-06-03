const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const FORBIDDEN_PUBLIC_TOKENS = [
  'pending_delivery',
  'queued',
  'claimed',
  'submitted',
  'projected',
  'fyi',
  'completion_report',
  'in_progress',
  'completed',
  'leader_attention_requested',
]

function tokenPattern(token) {
  return new RegExp(`(^|[^A-Za-z0-9_])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`)
}

function assertNoForbiddenTokens(label, text, forbiddenTokens = FORBIDDEN_PUBLIC_TOKENS) {
  for (const token of forbiddenTokens) {
    assert.equal(
      tokenPattern(token).test(String(text)),
      false,
      `${label} should not expose internal/legacy token ${token}`,
    )
  }
}

module.exports = {
  name: 'public output leak guards',
  async run(env) {
    const { helpers, modules, pi, leaderCtx } = env
    const root = helpers.extRoot

    for (const file of [
      'agents/implementer.md',
      'agents/planner.md',
      'agents/researcher.md',
      'tools/workerPrompt.ts',
      'workerTurnPrompt.ts',
    ]) {
      assertNoForbiddenTokens(file, fs.readFileSync(path.join(root, file), 'utf8'))
    }

    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
    const diagnosticParagraph = 'Internal request/projection/attention lifecycles such as pending, claimed, submitted, started, completed, projected, or failed may appear only in diagnostics/details;'
    const diagnosticEffectParagraph = 'In diagnostics, the durable bounded-leader-attention Outbox effect kind is `leader_attention_requested`. Task-bound send indexing uses `task_message_ref_append_requested`. Legacy pending `task_note_append_requested` effects are migrated/cleaned before validation when possible; otherwise unsupported legacy state is quarantined. Legacy active persisted outbox effects using `leader_triage_requested` have no compatibility path; they quarantine as unsupported legacy state instead of being normalized or executed.'
    assert.ok(readme.includes(diagnosticParagraph), 'README should explicitly scope lifecycle vocabulary to diagnostics/details')
    assert.ok(readme.includes(diagnosticEffectParagraph), 'README should explicitly scope internal leader attention effect names to diagnostics')
    assertNoForbiddenTokens('README public docs outside diagnostics paragraph', readme.replace(diagnosticParagraph, '').replace(diagnosticEffectParagraph, ''))

    const spawnTeam = modules.state.createInitialTeamState({
      teamName: 'leak-guard-spawn-team',
      leaderSessionFile: leaderCtx.sessionManager.getSessionFile(),
      leaderCwd: leaderCtx.cwd,
    })
    spawnTeam.members['team-lead'].paneId = '%leader'
    spawnTeam.members['team-lead'].windowTarget = 'test:@1'
    modules.state.writeTeamState(spawnTeam)
    modules.state.writeSessionContext(leaderCtx.sessionManager.getSessionFile(), {
      teamName: spawnTeam.name,
      memberName: 'team-lead',
    })

    const spawnTool = pi.__tools.get('agentteam_spawn')
    let res = await spawnTool.execute('leak-guard-spawn', {
      name: 'Leak Guard Worker',
      role: 'researcher',
      task: 'initial public output leak guard task',
    }, null, () => {}, leaderCtx)
    assertNoForbiddenTokens('spawn success text', res.content[0].text)
    helpers.assertContains(res.content[0].text, 'initial task delivery requested; worker busy')

    const workerPrompt = helpers.requireDist('tools/workerPrompt.js')
    const prompt = workerPrompt.buildWorkerSystemPrompt({
      teamName: 'leak-guard-team',
      workerName: 'leak-guard-worker',
      role: 'researcher',
      roleAgent: {
        name: 'researcher',
        description: 'researcher',
        tools: [],
        model: undefined,
        systemPrompt: 'researcher prompt body',
      },
    })
    assertNoForbiddenTokens('worker system prompt output', prompt)

    const team = modules.state.createInitialTeamState({
      teamName: 'leak-guard-panel',
      leaderSessionFile: '/tmp/leak-guard-panel-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.upsertMember(team, {
      name: 'leaky-worker',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/leaky-worker.jsonl',
      status: 'pending_delivery',
      bridgeAvailable: false,
      bridgeLastError: 'bridge unavailable for public leak guard',
      bridgeWorkRequestedAt: Date.now(),
      bridgeWorkRequestCount: 1,
    })
    modules.state.writeTeamState(team)
    modules.state.enqueueOutboxEffect({
      teamName: team.name,
      kind: 'leader_attention_requested',
      idempotencyKey: 'leak-guard-outbox-pending',
      payload: {
        teamName: team.name,
        message: { type: 'question', wakeHint: 'soft', from: 'leaky-worker', text: 'pending outbox diagnostics should stay expanded' },
      },
      now: Date.now() + 1_000_000,
    })
    const data = modules.panelDataSource.loadPanelData('leak-guard-panel')
    const state = modules.viewModel.createInitialPanelState()
    state.focus = 'members'
    state.selectedMemberIndex = 0
    state.selectedIndex = 0
    const selection = modules.viewModel.buildPanelSelectionView(data, state)
    const collapsedLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), {
      width: 180,
      height: 40,
      data,
      state,
      selection,
    })
    assertNoForbiddenTokens('collapsed /team panel output', collapsedLines.join('\n'))
    assert.ok(collapsedLines.some(line => line.includes('Health') && line.includes('error')), 'collapsed panel should show public worker health')

    state.isDetailExpanded = true
    const expandedLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), {
      width: 180,
      height: 40,
      data,
      state,
      selection,
    })
    assert.ok(expandedLines.some(line => line.includes('Diagnostics')), 'expanded panel should expose diagnostics')
    assert.ok(expandedLines.some(line => line.includes('Runtime status') && line.includes('pending_delivery')), 'diagnostics may expose internal runtime status')
    assert.ok(expandedLines.some(line => line.includes('Outbox') && line.includes('pending 1')), 'expanded diagnostics may expose outbox pending count')

    modules.state.deleteTeamState('leak-guard-panel')
    modules.state.deleteTeamState('leak-guard-spawn-team')
    modules.state.clearSessionContext(leaderCtx.sessionManager.getSessionFile())
    if (res.details?.paneId) env.patches.livePanes.delete(res.details.paneId)
  },
}
