const assert = require('node:assert/strict')

function assertNoNativeFullText(label, message, fullText) {
  assert.equal(String(message?.content ?? '').includes(fullText), false, `${label} content should not include full mailbox/report body`)
  assert.equal(message?.details?.text, undefined, `${label} details should not carry full text`)
  assert.equal(JSON.stringify(message?.details ?? {}).includes(fullText), false, `${label} details should not include full mailbox/report body`)
}

function createLeaderTeam(env, cleanup, name) {
  const sessionFile = `/tmp/${name}-leader.jsonl`
  const cwd = `/tmp/${name}-project`
  const ctx = env.helpers.createCtx(cwd, sessionFile, [])
  const team = env.modules.state.createInitialTeamState({
    teamName: name,
    leaderSessionFile: sessionFile,
    leaderCwd: cwd,
    description: 'leader mailbox signal characterization',
  })
  team.members['team-lead'].paneId = '%leader'
  team.members['team-lead'].windowTarget = 'test:@1'
  env.modules.state.writeTeamState(team)
  env.modules.state.writeSessionContext(sessionFile, {
    teamName: team.name,
    memberName: 'team-lead',
  })
  cleanup.push({ teamName: team.name, sessionFile })
  return { team, ctx }
}

module.exports = {
  name: 'leader mailbox signal read-boundary',
  async run(env) {
    const { modules, pi, helpers } = env
    const cleanup = []

    try {
      modules.leaderAttention.resetLeaderAttentionThrottle()

      const shape = createLeaderTeam(env, cleanup, 'leader-signal-shape-suite')
      const shapeRuntime = modules.runtimeService.createRuntimeService(pi)
      const shapeStart = pi.__messages.length
      const shapeFullText = 'UNIQUE-SIGNAL-SHAPE-FULL-BODY should only be visible through agentteam_receive full text boundary'
      const shapeMessage = modules.state.pushMailboxMessage(shape.team.name, 'team-lead', {
        from: 'planner-signal',
        to: 'team-lead',
        text: shapeFullText,
        summary: 'shape compact summary',
        type: 'question',
        taskId: 'T777',
        threadId: 'task:T777',
        requestId: 'shape-generation-request',
        priority: 'high',
        wakeHint: 'soft',
        createdAt: 1700000000001,
      })

      shapeRuntime.runMailboxSync(shape.ctx)
      const shapeEmitted = pi.__messages.slice(shapeStart)
      const shapeProjection = shapeEmitted.find(message => message.customType === 'agentteam-mailbox' && message.details.id === shapeMessage.id)
      const shapeAttention = shapeEmitted.find(message => message.customType === 'agentteam-leader-attention' && message.details.id === shapeMessage.id)
      assert.ok(shapeProjection, 'first mailbox sync should emit compact leader mailbox projection')
      assert.ok(shapeAttention, 'question-to-leader mailbox sync should emit bounded leader attention')
      assert.ok(shapeEmitted.indexOf(shapeProjection) < shapeEmitted.indexOf(shapeAttention), 'mailbox projection should be sent before bounded leader attention')

      assert.equal(shapeProjection.customType, 'agentteam-mailbox')
      assert.equal(shapeProjection.display, true)
      assert.equal(shapeProjection.options.triggerTurn, false)
      assert.equal(shapeProjection.options.deliverAs, undefined)
      assert.equal(shapeProjection.details.id, shapeMessage.id)
      assert.equal(shapeProjection.details.teamName, shape.team.name)
      assert.equal(shapeProjection.details.from, 'planner-signal')
      assert.equal(shapeProjection.details.summary, 'shape compact summary')
      assert.equal(shapeProjection.details.type, 'question')
      assert.equal(shapeProjection.details.taskId, 'T777')
      assert.equal(shapeProjection.details.threadId, 'task:T777')
      assert.equal(shapeProjection.details.requestId, 'shape-generation-request')
      assert.equal(shapeProjection.details.priority, 'high')
      assert.equal(shapeProjection.details.wakeHint, 'soft')
      assert.equal(shapeProjection.details.createdAt, shapeMessage.createdAt)
      assert.equal(shapeProjection.details.generation, 'shape-generation-request')
      assert.equal(shapeProjection.details.projectionKey, `${shape.team.name}:${shapeMessage.id}:shape-generation-request`)
      assert.equal(shapeProjection.details.bridgeOnly, true)
      assert.equal(shapeProjection.details.compact, true)
      assert.ok(String(shapeProjection.content).includes('shape compact summary'), 'mailbox projection content should include compact summary')
      assert.ok(String(shapeProjection.content).includes('Call agentteam_receive({ markRead: true })'), 'mailbox projection content should preserve receive read boundary instruction')
      assert.ok(String(shapeProjection.content).includes('agentteam_task show/history/reports/report'), 'mailbox projection content should point to task artifact read commands')
      assertNoNativeFullText('mailbox projection', shapeProjection, shapeFullText)

      assert.equal(shapeAttention.customType, 'agentteam-leader-attention')
      assert.equal(shapeAttention.display, true)
      assert.equal(shapeAttention.options.triggerTurn, true)
      assert.equal(shapeAttention.options.deliverAs, 'followUp')
      assert.equal(shapeAttention.details.id, shapeMessage.id)
      assert.equal(shapeAttention.details.teamName, shape.team.name)
      assert.equal(shapeAttention.details.from, 'planner-signal')
      assert.equal(shapeAttention.details.summary, 'shape compact summary')
      assert.equal(shapeAttention.details.type, 'question')
      assert.equal(shapeAttention.details.taskId, 'T777')
      assert.equal(shapeAttention.details.threadId, 'task:T777')
      assert.equal(shapeAttention.details.requestId, 'shape-generation-request')
      assert.equal(shapeAttention.details.priority, 'high')
      assert.equal(shapeAttention.details.wakeHint, 'soft')
      assert.equal(shapeAttention.details.createdAt, shapeMessage.createdAt)
      assert.equal(shapeAttention.details.bounded, true)
      assert.equal(shapeAttention.details.compact, true)
      assert.equal(shapeAttention.details.attentionReason, 'leader attention requested question')
      assert.equal(shapeAttention.details.triggerTurn, true)
      assert.ok(String(shapeAttention.content).includes('shape compact summary'), 'bounded attention content should include compact summary')
      assert.ok(String(shapeAttention.content).includes('Call agentteam_receive({ markRead: true })'), 'bounded attention content should preserve receive read boundary instruction')
      assert.ok(String(shapeAttention.content).includes('Do exactly one bounded attention turn'), 'bounded attention content should constrain the leader wake')
      assertNoNativeFullText('bounded attention', shapeAttention, shapeFullText)

      let storedShapeMailbox = modules.state.readMailbox(shape.team.name, 'team-lead').find(message => message.id === shapeMessage.id)
      assert.equal(storedShapeMailbox?.deliveredAt, undefined, 'projection/attention should not mark mailbox delivered')
      assert.equal(storedShapeMailbox?.readAt, undefined, 'projection/attention should not mark mailbox read')
      const shapeProjectionState = modules.state.getLeaderProjection(shape.team.name, shapeMessage.id, 'shape-generation-request')
      const shapeAttentionState = modules.state.getLeaderAttention(shape.team.name, shapeMessage.id, 'shape-generation-request')
      assert.equal(shapeProjectionState.projectionKey, `${shape.team.name}:${shapeMessage.id}:shape-generation-request`, 'projection durable key should stay team:message:generation')
      assert.equal(shapeProjectionState.status, 'projected')
      assert.equal(shapeAttentionState.attentionKey, `${shape.team.name}:${shapeMessage.id}:shape-generation-request`, 'attention durable key should stay team:message:generation')
      assert.equal(shapeAttentionState.status, 'sent')

      const receiveTool = pi.__tools.get('agentteam_receive')
      let receiveResult = await receiveTool.execute('leader-signal-receive-no-read', { markRead: false, limit: 1 }, null, () => {}, shape.ctx)
      assert.equal(receiveResult.details.messages[0].id, shapeMessage.id)
      assert.ok(receiveResult.content[0].text.includes(shapeFullText), 'agentteam_receive markRead=false should expose full text through explicit read boundary')
      assert.equal(receiveResult.details.messages[0].text, shapeFullText, 'agentteam_receive details should preserve full mailbox text')
      storedShapeMailbox = modules.state.readMailbox(shape.team.name, 'team-lead').find(message => message.id === shapeMessage.id)
      assert.ok(storedShapeMailbox?.deliveredAt, 'agentteam_receive markRead=false should mark returned message delivered')
      assert.equal(storedShapeMailbox?.readAt, undefined, 'agentteam_receive markRead=false should not mark returned message read')
      receiveResult = await receiveTool.execute('leader-signal-receive-read', { markRead: true, limit: 1 }, null, () => {}, shape.ctx)
      assert.equal(receiveResult.details.messages[0].id, shapeMessage.id, 'delivered-but-unread message should remain visible until markRead=true')
      assert.ok(receiveResult.content[0].text.includes(shapeFullText), 'agentteam_receive markRead=true should expose full text through explicit read boundary')
      storedShapeMailbox = modules.state.readMailbox(shape.team.name, 'team-lead').find(message => message.id === shapeMessage.id)
      assert.ok(storedShapeMailbox?.readAt, 'agentteam_receive markRead=true should mark returned message read')

      modules.leaderAttention.resetLeaderAttentionThrottle()
      const panel = createLeaderTeam(env, cleanup, 'leader-signal-panel-suite')
      const panelFullText = 'UNIQUE-TEAM-PANEL-FULL-TEXT-LEAK-CURRENT-BEHAVIOR-0123456789'
      const panelMessage = modules.state.pushMailboxMessage(panel.team.name, 'team-lead', {
        from: 'researcher-panel',
        to: 'team-lead',
        text: panelFullText,
        summary: 'panel compact summary',
        type: 'question',
        taskId: 'T900',
        threadId: 'task:T900',
        wakeHint: 'soft',
        createdAt: 1700000000100,
      })
      const panelData = modules.panelDataSource.loadPanelData(panel.team.name)
      const panelState = modules.viewModel.createInitialPanelState()
      panelState.focus = 'mailbox'
      panelState.selectedIndex = 0
      panelState.mailboxSelectedIndex = 0
      panelState.isDetailExpanded = true
      const panelSelection = modules.viewModel.buildPanelSelectionView(panelData, panelState)
      assert.equal(panelSelection.selectedMailbox?.id, panelMessage.id)
      const panelLayoutSource = helpers.readSource('teamPanel/layout.ts')
      const panelListSource = helpers.readSource('teamPanel/layoutLists.ts')
      assert.equal(panelLayoutSource.includes('selectedMailbox.text'), false, 'panel selected-mailbox detail should not render the mailbox full text field')
      assert.equal(panelLayoutSource.includes('message.text'), false, 'panel mailbox/cockpit details should not use mailbox full text as compact fallback')
      assert.equal(panelListSource.includes('item.message.text'), false, 'panel cockpit list should not use mailbox full text as compact fallback')
      assert.equal(panelListSource.includes('item.text'), false, 'panel mailbox list should not use mailbox full text as compact fallback')
      const panelLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 220, height: 60, data: panelData, state: panelState, selection: panelSelection })
      const panelOutput = panelLines.join('\n')
      assert.equal(panelOutput.includes(panelFullText), false, 'expanded /team selected-mailbox detail should not render exact mailbox full text')
      assert.ok(panelOutput.includes('panel compact summary'), 'expanded /team selected-mailbox detail should render compact summary')
      assert.ok(panelOutput.includes('Full text') && panelOutput.includes('agentteam_receive({ markRead: true })'), 'expanded /team selected-mailbox detail should point to explicit receive full-text boundary')
      assert.ok(panelOutput.includes(panelMessage.id) && panelOutput.includes('T900') && panelOutput.includes('task:T900'), 'expanded /team selected-mailbox detail should render compact routing fields')
      let storedPanelMessage = modules.state.readMailbox(panel.team.name, 'team-lead').find(message => message.id === panelMessage.id)
      assert.equal(storedPanelMessage?.deliveredAt, undefined, '/team panel data/render should not mark selected mailbox delivered')
      assert.equal(storedPanelMessage?.readAt, undefined, '/team panel data/render should not mark selected mailbox read')
      const panelReceiveResult = await receiveTool.execute('leader-signal-panel-receive-read-boundary', { markRead: true, limit: 1 }, null, () => {}, panel.ctx)
      assert.equal(panelReceiveResult.details.messages[0].id, panelMessage.id, 'agentteam_receive should return the same panel mailbox item')
      assert.ok(panelReceiveResult.content[0].text.includes(panelFullText), 'agentteam_receive should still expose full text for the same mailbox item')
      assert.equal(panelReceiveResult.details.messages[0].text, panelFullText, 'agentteam_receive details should still preserve full mailbox text')
      storedPanelMessage = modules.state.readMailbox(panel.team.name, 'team-lead').find(message => message.id === panelMessage.id)
      assert.ok(storedPanelMessage?.deliveredAt, 'agentteam_receive markRead=true should mark returned panel mailbox delivered')
      assert.ok(storedPanelMessage?.readAt, 'agentteam_receive markRead=true should mark returned panel mailbox read')
    } finally {
      modules.leaderAttention.resetLeaderAttentionThrottle()
      for (const item of cleanup.reverse()) {
        modules.state.clearSessionContext(item.sessionFile)
        if (item.teamName) modules.state.deleteTeamState(item.teamName)
      }
    }
  },
}
