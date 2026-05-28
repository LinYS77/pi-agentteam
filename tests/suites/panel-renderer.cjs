const assert = require('node:assert/strict')
const fs = require('node:fs')

module.exports = {
  name: 'panel + renderer',
  async run(env) {
    const { modules, helpers, patches } = env
    patches.livePanes.add('%1')
    patches.livePanes.add('%2')

    assert.ok(!Object.prototype.hasOwnProperty.call(modules.viewModel, 'loadPanelData'), 'viewModel should not expose runtime-loading side effects')
    const pureImportSource = helpers.readSource('teamPanel/viewModel.ts')
    assert.ok(!pureImportSource.includes('../state.js'), 'viewModel should not import removed state facade')
    assert.ok(!pureImportSource.includes('../tmux.js'), 'viewModel should not import removed tmux facade')
    assert.ok(!pureImportSource.includes('../runtime.js'), 'viewModel should not import removed runtime facade side effects')

    const team = modules.state.createInitialTeamState({
      teamName: 'render-suite',
      leaderSessionFile: '/tmp/leader-render.jsonl',
      leaderCwd: '/tmp',
      description: 'render test',
    })
    modules.state.upsertMember(team, {
      name: 'researcher-very-long-member-name-alpha',
      role: 'researcher',
      cwd: '/tmp',
      sessionFile: '/tmp/r1.jsonl',
      status: 'running',
      paneId: '%1',
      windowTarget: 'test:@1',
      lastWakeReason: 'mailbox/task block',
    })
    modules.state.upsertMember(team, {
      name: 'planner-very-long-member-name-beta',
      role: 'planner',
      cwd: '/tmp',
      sessionFile: '/tmp/p1.jsonl',
      status: 'idle',
      model: 'planner-model-render',
      paneId: '%2',
      windowTarget: 'test:@1',
      bridgeAvailable: true,
      bridgeVersion: 1,
      bridgeLastSeenAt: Date.now(),
      bridgeLastDeliveryAt: Date.now(),
      bridgeWorkRequestedAt: Date.now(),
      bridgeWorkRequestCount: 2,
    })
    const task = modules.state.createTask(team, {
      title: 'A very long task title that should be truncated safely in narrow layout',
      description: 'Long description for rendering',
    })
    task.owner = 'researcher-very-long-member-name-alpha'
    task.status = 'open'
    task.updatedAt = Date.now()
    modules.state.appendTaskNote(task, 'researcher-very-long-member-name-alpha', 'substantive render note')
    const substantiveTaskUpdatedAt = task.updatedAt
    const hiddenRenderRef = modules.state.appendCommunicationRefNote(task, {
      author: 'team-lead',
      linkedMessageId: 'mailbox-hidden-render-ref',
      messageType: 'assignment',
      threadId: `task:${task.id}`,
      metadata: { from: 'team-lead', to: 'researcher-very-long-member-name-alpha', taskId: task.id },
    })
    assert.equal(task.updatedAt, substantiveTaskUpdatedAt, 'hidden communication ref should not bump task recency')
    assert.equal(modules.state.inferTaskNoteSourceKind(hiddenRenderRef), 'communication_ref', 'hidden render ref should use formal communication_ref source kind')
    assert.equal(modules.state.inferTaskNoteDisplayMode(hiddenRenderRef), 'hidden', 'hidden render ref should use formal hidden display mode')
    const legacyRenderRef = modules.state.appendTaskNote(task, 'team-lead', 'Linked message: legacy render handoff should be hidden', {
      linkedMessageId: 'mailbox-legacy-render-ref',
      messageType: 'inform',
      threadId: `task:${task.id}`,
    })
    assert.equal(task.updatedAt, substantiveTaskUpdatedAt, 'legacy linked communication ref should not bump task recency')
    assert.equal(modules.state.inferTaskNoteSourceKind(legacyRenderRef), 'legacy_communication_ref', 'legacy linked note should infer folded legacy communication ref source kind without migration')
    assert.equal(modules.state.inferTaskNoteDisplayMode(legacyRenderRef), 'folded', 'legacy linked note should infer folded display mode without migration')
    assert.equal(modules.state.latestVisibleTaskNote(task)?.text, 'substantive render note', 'latest visible task note should ignore hidden and legacy communication refs')
    assert.deepEqual(modules.viewModel.taskReferenceSummary(task), { total: 2, hidden: 1, folded: 1 }, 'panel view model should compactly summarize folded communication refs')
    const blockedTask = modules.state.createTask(team, {
      title: 'Blocked task should be visible in attention summary',
      description: 'Blocked task for attention rendering',
    })
    blockedTask.owner = 'planner-very-long-member-name-beta'
    blockedTask.status = 'blocked'
    blockedTask.blockedBy.push('missing decision')
    const unownedTask = modules.state.createTask(team, {
      title: 'Unowned active task should be visible in attention summary',
      description: 'Unowned active task for attention rendering',
    })
    unownedTask.status = 'open'
    modules.state.writeTeamState(team)
    modules.state.upsertBridgeLease(team.name, {
      memberName: 'planner-very-long-member-name-beta',
      bridgeId: 'render-bridge',
      protocolVersion: modules.runtimeBridge.BRIDGE_PROTOCOL_VERSION,
      packageVersion: modules.runtimeBridge.BRIDGE_PACKAGE_VERSION,
      sessionFile: '/tmp/p1.jsonl',
      pid: 123,
      processIdentity: 'render-process',
      startedAt: Date.now() - 1000,
      lastSeenAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      generation: 2,
      capabilities: ['lease.publish'],
    })
    const blockedMailbox = modules.state.pushMailboxMessage(team.name, 'team-lead', {
      from: 'planner-very-long-member-name-beta',
      to: 'team-lead',
      type: 'report_blocked',
      priority: 'high',
      taskId: blockedTask.id,
      summary: 'Blocked on missing decision',
      text: 'Blocked on missing decision',
    })
    modules.state.pushMailboxMessage(team.name, 'team-lead', {
      from: 'researcher-very-long-member-name-alpha',
      to: 'team-lead',
      type: 'report_done',
      taskId: task.id,
      summary: 'Unread research result',
      text: 'Unread research result',
    })

    const data = modules.panelDataSource.loadPanelData('render-suite')
    assert.ok(data, 'panel data should load')
    const state = modules.viewModel.createInitialPanelState()
    modules.viewModel.clampPanelStateToData(state, data)
    let selection = modules.viewModel.buildPanelSelectionView(data, state)
    assert.ok(selection.selectedMember, 'member details should be available when members section is focused')
    assert.ok(selection.selectedTask, 'task details should be available even when tasks section is not focused')
    assert.equal(selection.selectedMailbox?.id, blockedMailbox.id, 'mailbox defaults should show urgent blocked messages first')

    const memberLabel = modules.tmuxLabels.formatMemberPaneLabel(data.team.members['researcher-very-long-member-name-alpha'])
    assert.ok(memberLabel.includes('busy'), 'tmux worker pane label should use public worker health')
    assert.equal(memberLabel.includes('running'), false, 'tmux worker pane label should hide internal runtime status')
    const leaderLabel = modules.tmuxLabels.formatLeaderPaneLabel(data.team)
    assert.ok(leaderLabel.includes('busy'), 'tmux leader pane label should summarize public worker health')
    assert.equal(leaderLabel.includes('queued'), false, 'tmux leader pane label should hide internal queued status')

    const summary = modules.viewModel.buildTeamAttentionSummary(data.team, data.mailbox)
    assert.equal(summary.blockedTasks, 1, 'attention summary should count blocked tasks')
    assert.equal(summary.blockedMessages, 1, 'attention summary should count blocked messages')
    assert.equal(summary.unreadMessages, 2, 'attention summary should count unread leader mailbox messages')
    assert.equal(summary.unownedActiveTasks, 1, 'attention summary should count unowned active tasks')

    state.focus = 'tasks'
    state.selectedIndex = 0
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    assert.equal(selection.selectedTask?.id, task.id, 'task details should follow task selection')

    const attachedLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state, selection })
    assert.ok(attachedLines.some(line => line.includes('Attention') && line.includes('blocked task')), 'overview should include blocked task attention')
    assert.ok(attachedLines.some(line => line.includes('unread')), 'overview/list should include unread attention')
    assert.ok(attachedLines.some(line => line.includes('unowned')), 'overview/list should include unowned task attention')
    assert.ok(attachedLines.some(line => line.includes('Name') && line.includes('Health') && line.includes('Context')), 'member list should include a lightweight column header')
    assert.ok(attachedLines.some(line => line.includes('Task') && line.includes('Title') && line.includes('Owner')), 'task list should include a lightweight column header')
    assert.ok(attachedLines.some(line => line.includes('From') && line.includes('Summary') && line.includes('Time')), 'mailbox list should include a lightweight column header')
    assert.ok(attachedLines.some(line => line.includes('Status')), 'overview/detail hierarchy should show a section label')
    assert.ok(attachedLines.some(line => line.includes('Content')), 'task detail hierarchy should show a content section label')
    assert.ok(attachedLines.some(line => line.includes('Latest note') && line.includes('substantive render note')), 'task details should show latest substantive note')
    assert.ok(attachedLines.some(line => line.includes('Refs') && line.includes('2 folded')), 'collapsed task details should show compact folded ref count')
    assert.equal(attachedLines.some(line => line.includes('legacy render handoff')), false, 'task details should hide legacy communication refs from latest note')
    assert.equal(attachedLines.some(line => line.includes('mailbox-hidden-render-ref')), false, 'task details should not leak hidden communication ref ids by default')

    state.focus = 'tasks'
    state.selectedIndex = data.tasks.findIndex(item => item.id === blockedTask.id)
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    const blockedTaskLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state, selection })
    assert.ok(blockedTaskLines.some(line => line.includes(blockedTask.id) && line.includes('blocked')), 'blocked task row should include attention marker')

    state.selectedIndex = data.tasks.findIndex(item => item.id === unownedTask.id)
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    const unownedTaskLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state, selection })
    assert.ok(unownedTaskLines.some(line => line.includes(unownedTask.id) && line.includes('unowned')), 'unowned task row should include attention marker')

    state.focus = 'mailbox'
    state.selectedIndex = 0
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    const mailboxLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state, selection })
    assert.ok(mailboxLines.some(line => line.includes('Blocked on missing decision') && line.includes('unread') && line.includes('blocked')), 'blocked unread mailbox row should include attention markers')
    const readBlockedMailbox = modules.state.readMailbox('render-suite', 'team-lead')
    const readBlockedMailboxItem = readBlockedMailbox.find(item => item.id === blockedMailbox.id)
    readBlockedMailboxItem.readAt = Date.now()
    fs.writeFileSync(modules.state.getMailboxPath('render-suite', 'team-lead'), `${JSON.stringify(readBlockedMailbox, null, 2)}\n`, 'utf8')
    const readBlockedData = modules.panelDataSource.loadPanelData('render-suite')
    const storedAfterPanelLoad = modules.state.readMailbox('render-suite', 'team-lead').find(item => item.id === blockedMailbox.id)
    assert.equal(storedAfterPanelLoad?.readAt, readBlockedMailboxItem.readAt, 'panel data load should not mutate mailbox readAt')
    assert.equal(storedAfterPanelLoad?.deliveredAt, undefined, 'panel data load should not mutate mailbox deliveredAt')
    assert.equal(modules.viewModel.buildTeamAttentionSummary(readBlockedData.team, readBlockedData.mailbox).blockedMessages, 0, 'read blocked report should not remain long-lived attention')
    assert.equal(modules.viewModel.buildTeamAttentionSummary(readBlockedData.team, readBlockedData.mailbox).blockedTasks, 1, 'factual blocked task attention should remain after report is read')
    const readBlockedState = modules.viewModel.createInitialPanelState()
    readBlockedState.focus = 'mailbox'
    readBlockedState.selectedIndex = 0
    const readBlockedSelection = modules.viewModel.buildPanelSelectionView(readBlockedData, readBlockedState)
    const readBlockedLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data: readBlockedData, state: readBlockedState, selection: readBlockedSelection })
    assert.equal(readBlockedLines.some(line => line.includes('Blocked on missing decision') && line.includes('blocked report')), false, 'read blocked report mailbox row should not keep blocked-report attention marker')
    assert.ok(readBlockedLines.some(line => line.includes('Attention') && line.includes('blocked task')), 'overview should keep factual blocked task attention after report is read')

    const plannerMemberIndex = data.members.findIndex(item => item.name === 'planner-very-long-member-name-beta')
    assert.ok(plannerMemberIndex >= 0, 'planner member should be present')
    state.focus = 'members'
    state.selectedMemberIndex = plannerMemberIndex
    state.selectedIndex = plannerMemberIndex
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    const memberLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state, selection })
    assert.ok(memberLines.some(line => line.includes('planner-very') && line.includes('blocked')), 'member row should show blocked-owned attention')
    assert.ok(memberLines.some(line => line.includes('pane %2') && line.includes('tasks 1') && line.includes('age')), 'member row should show stable health fields')
    assert.ok(memberLines.some(line => line.includes('Health') && line.includes('busy')), 'member details should show public worker health label')
    assert.ok(memberLines.some(line => line.includes('Model') && line.includes('planner-model-render')), 'member details should show configured launch model')
    assert.ok(memberLines.some(line => line.includes('Pane') && line.includes('%2')), 'member details should show pane id')
    assert.ok(memberLines.some(line => line.includes('Session')), 'member detail hierarchy should show a session section label')
    assert.ok(memberLines.some(line => line.includes('Updated') && line.includes('ago')), 'member details should show updated age')
    assert.equal(memberLines.some(line => line.includes('Bridge') && line.includes('ready')), false, 'collapsed member details should hide runtime bridge diagnostics')

    const bridgeUnavailableTeam = modules.state.readTeamState('render-suite')
    bridgeUnavailableTeam.members['planner-very-long-member-name-beta'].status = 'pending_delivery'
    bridgeUnavailableTeam.members['planner-very-long-member-name-beta'].bridgeAvailable = false
    bridgeUnavailableTeam.members['planner-very-long-member-name-beta'].bridgeLastError = 'bridge handshake timed out; delivery open'
    bridgeUnavailableTeam.members['planner-very-long-member-name-beta'].bridgeWorkRequestedAt = Date.now()
    modules.state.writeTeamState(bridgeUnavailableTeam)
    modules.state.removeBridgeLease('render-suite', 'planner-very-long-member-name-beta')
    const bridgeUnavailableData = modules.panelDataSource.loadPanelData('render-suite')
    const bridgeUnavailableState = modules.viewModel.createInitialPanelState()
    const bridgeUnavailableIndex = bridgeUnavailableData.members.findIndex(item => item.name === 'planner-very-long-member-name-beta')
    bridgeUnavailableState.focus = 'members'
    bridgeUnavailableState.selectedMemberIndex = bridgeUnavailableIndex
    bridgeUnavailableState.selectedIndex = bridgeUnavailableIndex
    const bridgeUnavailableSelection = modules.viewModel.buildPanelSelectionView(bridgeUnavailableData, bridgeUnavailableState)
    const bridgeUnavailableLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data: bridgeUnavailableData, state: bridgeUnavailableState, selection: bridgeUnavailableSelection })
    assert.ok(bridgeUnavailableLines.some(line => line.includes('Health') && line.includes('error')), 'member panel should project bridge failure to public error health')
    assert.equal(bridgeUnavailableLines.some(line => line.includes('pending_delivery')), false, 'collapsed member panel should hide internal worker status')
    bridgeUnavailableState.isDetailExpanded = true
    const bridgeDiagnosticsLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data: bridgeUnavailableData, state: bridgeUnavailableState, selection: bridgeUnavailableSelection })
    assert.ok(bridgeDiagnosticsLines.some(line => line.includes('Diagnostics')), 'expanded member details should expose diagnostics section')
    assert.ok(bridgeDiagnosticsLines.some(line => line.includes('Bridge') && line.includes('unavailable')), 'expanded diagnostics should surface bridge unavailable')
    assert.ok(bridgeDiagnosticsLines.some(line => line.includes('Runtime status') && line.includes('pending_delivery')), 'expanded diagnostics should show internal worker status')
    assert.ok(bridgeDiagnosticsLines.some(line => line.includes('Bridge error') && line.includes('bridge handshake timed out')), 'expanded diagnostics should show bridge error')

    const noPaneTeam = modules.state.readTeamState('render-suite')
    noPaneTeam.members['planner-very-long-member-name-beta'].status = 'idle'
    noPaneTeam.members['planner-very-long-member-name-beta'].bridgeLastError = undefined
    noPaneTeam.members['planner-very-long-member-name-beta'].paneId = undefined
    modules.state.writeTeamState(noPaneTeam)
    const noPaneData = modules.panelDataSource.loadPanelData('render-suite')
    const noPaneState = modules.viewModel.createInitialPanelState()
    const noPanePlannerIndex = noPaneData.members.findIndex(item => item.name === 'planner-very-long-member-name-beta')
    assert.ok(noPanePlannerIndex >= 0, 'planner member should be present after no-pane block')
    noPaneState.focus = 'members'
    noPaneState.selectedMemberIndex = noPanePlannerIndex
    noPaneState.selectedIndex = noPanePlannerIndex
    const noPaneSelection = modules.viewModel.buildPanelSelectionView(noPaneData, noPaneState)
    const noPaneLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data: noPaneData, state: noPaneState, selection: noPaneSelection })
    assert.ok(noPaneLines.some(line => line.includes('planner-very') && line.includes('pane missing')), 'member row should show pane missing marker')
    assert.ok(noPaneLines.some(line => line.includes('Health') && line.includes('offline')), 'member details should project missing pane to public offline health')

    const defaultModelTeam = modules.state.readTeamState('render-suite')
    defaultModelTeam.members['planner-very-long-member-name-beta'].model = undefined
    modules.state.writeTeamState(defaultModelTeam)
    const defaultModelData = modules.panelDataSource.loadPanelData('render-suite')
    const defaultModelState = modules.viewModel.createInitialPanelState()
    const defaultModelPlannerIndex = defaultModelData.members.findIndex(item => item.name === 'planner-very-long-member-name-beta')
    defaultModelState.focus = 'members'
    defaultModelState.selectedMemberIndex = defaultModelPlannerIndex
    defaultModelState.selectedIndex = defaultModelPlannerIndex
    const defaultModelSelection = modules.viewModel.buildPanelSelectionView(defaultModelData, defaultModelState)
    const defaultModelLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data: defaultModelData, state: defaultModelState, selection: defaultModelSelection })
    assert.ok(defaultModelLines.some(line => line.includes('Model') && line.includes('(default)')), 'member details should show default launch model')

    const actions = helpers.requireDist('teamPanel/actions.js')
    const input = helpers.requireDist('teamPanel/input.js')
    const keys = helpers.tuiKeys
    const actionMenu = actions.buildPanelActions(data, state, selection)
    assert.ok(actionMenu.actions.some(action => action.id === 'sync'), 'attached panel should expose sync as an Enter action')
    assert.ok(actionMenu.actions.some(action => action.id === 'delete-team'), 'attached panel should expose delete as an Enter action')
    assert.ok(actionMenu.actions.some(action => action.id === 'delete-team' && action.label.includes('render-suite')), 'attached delete action should name the current team')
    assert.ok(actionMenu.actions.some(action => action.id === 'remove-member' && action.label.includes('planner-very-long-member-name-beta')), 'remove action should name the selected teammate')
    assert.ok(actionMenu.actions.some(action => action.danger && String(action.description).includes('pane is never killed')), 'danger actions should spell out current pane safety')
    assert.ok(!actionMenu.actions.some(action => action.id === 'back'), 'action menu should rely on Esc, not a Back item')
    assert.ok(!actionMenu.actions.some(action => String(action.id).includes('focus')), 'panel action menu should not expose pane focus')

    state.isDetailExpanded = true
    let closed = false
    input.handleTeamPanelInput(keys.escape, data, state, selection, {
      done: () => { closed = true },
      refresh: () => {},
      requestRender: () => {},
    })
    assert.equal(closed, false, 'Esc should collapse expanded details before closing panel')
    assert.equal(state.isDetailExpanded, false, 'Esc should collapse details')
    input.handleTeamPanelInput(keys.escape, data, state, selection, {
      done: result => { closed = result.type === 'close' },
      refresh: () => {},
      requestRender: () => {},
    })
    assert.equal(closed, true, 'Esc should close panel after details are collapsed')

    const cleanTeam = modules.state.createInitialTeamState({
      teamName: 'render-clean-suite',
      leaderSessionFile: '/tmp/leader-clean-render.jsonl',
      leaderCwd: '/tmp',
      description: 'clean render test',
    })
    modules.state.upsertMember(cleanTeam, {
      name: 'clean-implementer',
      role: 'implementer',
      cwd: '/tmp',
      sessionFile: '/tmp/clean-impl.jsonl',
      status: 'idle',
    })
    const cleanTask = modules.state.createTask(cleanTeam, {
      title: 'Closed clean render task',
      description: 'No attention expected',
    })
    cleanTask.owner = 'clean-implementer'
    cleanTask.status = 'done'
    modules.state.writeTeamState(cleanTeam)
    const cleanMessage = modules.state.pushMailboxMessage(cleanTeam.name, 'team-lead', {
      from: 'clean-implementer',
      to: 'team-lead',
      type: 'report_blocked',
      taskId: cleanTask.id,
      summary: 'Already read clean blocked report',
      text: 'Already read clean blocked report',
      deliveredAt: Date.now(),
      readAt: Date.now(),
    })
    assert.ok(cleanMessage.readAt, 'clean team mailbox fixture should be read')

    const globalData = modules.panelDataSource.loadPanelData(null)
    const globalState = modules.viewModel.createInitialPanelState()
    modules.viewModel.clampPanelStateToData(globalState, globalData)
    assert.equal(globalData.mode, 'global', 'missing current team should open global console data')
    assert.equal(globalState.focus, 'teams', 'global console should start on teams')
    const renderSuiteTeamIndex = globalData.teams.findIndex(item => item.name === 'render-suite')
    assert.ok(renderSuiteTeamIndex >= 0, 'render-suite should be present in global data')
    globalState.selectedTeamIndex = renderSuiteTeamIndex
    globalState.selectedIndex = renderSuiteTeamIndex
    const globalSelection = modules.viewModel.buildPanelSelectionView(globalData, globalState)
    const globalActions = actions.buildPanelActions(globalData, globalState, globalSelection)
    assert.ok(globalActions.actions.some(action => action.id === 'recover-team'), 'global console should expose recover action for selected team')
    assert.ok(globalActions.actions.some(action => action.id === 'recover-team' && action.label.includes('render-suite')), 'recover action should name the selected team')
    assert.ok(globalActions.actions.some(action => action.id === 'delete-team' && action.label.includes('render-suite')), 'global delete action should name the selected team')
    assert.ok(globalActions.actions.some(action => action.id === 'cleanup-all'), 'global console should expose cleanup action')
    assert.ok(globalActions.actions.some(action => action.id === 'cleanup-all' && action.label.includes('ALL')), 'cleanup action should make global scope obvious')
    assert.ok(globalActions.actions.some(action => action.danger && String(action.description).includes('pane is never killed')), 'global danger actions should spell out current pane safety')
    assert.ok(!globalActions.actions.some(action => action.id === 'back'), 'global action menu should not include Back')
    assert.ok(globalData.teamSummaries['render-suite'], 'global data should include per-team attention summaries')
    assert.equal(globalData.teamSummaries['render-suite'].blockedMessages, 0, 'global attention summary should ignore read blocked reports')
    assert.equal(globalData.teamSummaries['render-suite'].blockedTasks, 1, 'global attention summary should keep factual blocked task attention')
    assert.equal(globalData.teamMailboxes['render-suite'].unread, 1, 'global data should include unread mailbox projection after read blocked report')
    assert.equal(globalData.teamMailboxes['render-suite'].blocked, 0, 'global data should count only unread blocked mailbox attention')
    assert.equal(globalData.teamMailboxes['render-clean-suite'].blocked, 0, 'read blocked reports should not create global mailbox attention')
    const globalLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data: globalData, state: globalState, selection: globalSelection })
    assert.ok(globalLines.some(line => line.includes('Attention') && line.includes('blocked task')), 'global overview should summarize team attention')
    assert.ok(globalLines.some(line => line.includes('render-suite') && line.includes('│') && line.includes('✉')), 'global team row should visually separate name from summary')
    assert.equal(globalLines.some(line => line.includes('render-suite') && line.includes('leader missing')), false, 'global team row should keep leader pane diagnostics in details')
    assert.ok(globalLines.some(line => line.includes('render-clean-suite') && line.includes('OK')), 'clean global team row should show OK')
    assert.ok(globalLines.some(line => line.includes('Attention') && line.includes('+')), 'global overview should fold lower-priority attention categories')
    assert.ok(globalLines.some(line => line.includes('Worker health') && line.includes('offline')), 'global team details should include public worker health breakdown')
    assert.ok(globalLines.some(line => line.includes('Tasks') && line.includes('open') && line.includes('unowned')), 'global team details should include task breakdown')
    assert.ok(globalLines.some(line => line.includes('Mailbox') && line.includes('unread 1') && line.includes('unread blocked reports 0')), 'global team details should include unread-only mailbox attention breakdown')
    assert.ok(globalLines.some(line => line.includes('Latest mail attention')), 'global team details should show latest mail attention source')
    assert.ok(globalLines.some(line => line.includes('Roster')), 'global team details should include roster preview')
    assert.ok(globalLines.some(line => line.includes('planner-very') && line.includes('planner') && line.includes('pane missing')), 'global roster preview should align health/name/role/pane fields')

    modules.tmux.listAgentTeamPanes = () => [{ paneId: '%orphan', target: 'test:@1', label: 'agentteam orphan label', currentCommand: 'pi' }]
    const stalePaneData = modules.panelDataSource.loadPanelData(null)
    const stalePaneState = modules.viewModel.createInitialPanelState()
    stalePaneState.focus = 'panes'
    stalePaneState.selectedPaneIndex = 0
    modules.viewModel.clampPanelStateToData(stalePaneState, stalePaneData)
    const stalePaneSelection = modules.viewModel.buildPanelSelectionView(stalePaneData, stalePaneState)
    const stalePaneLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data: stalePaneData, state: stalePaneState, selection: stalePaneSelection })
    assert.ok(stalePaneLines.some(line => line.includes('%orphan') && line.includes('agentteam orphan label')), 'global stale pane list should show orphan label')
    assert.ok(stalePaneLines.some(line => line.includes('State') && line.includes('stale agentteam-labeled pane')), 'global stale pane details should show stale pane state')
    modules.tmux.listAgentTeamPanes = () => []

    const paneLostTeam = modules.state.readTeamState('render-suite')
    modules.state.updateMemberStatus(paneLostTeam, 'researcher-very-long-member-name-alpha', {
      status: 'error',
      paneId: undefined,
      lastWakeReason: 'pane lost',
      lastError: 'tmux pane disappeared',
    })
    modules.state.writeTeamState(paneLostTeam)
    const paneLostData = modules.panelDataSource.loadPanelData('render-suite')
    const paneLostState = modules.viewModel.createInitialPanelState()
    const paneLostMemberIndex = paneLostData.members.findIndex(item => item.name === 'researcher-very-long-member-name-alpha')
    assert.ok(paneLostMemberIndex >= 0, 'researcher member should be present after pane-lost block')
    paneLostState.selectedMemberIndex = paneLostMemberIndex
    modules.viewModel.clampPanelStateToData(paneLostState, paneLostData)
    const paneLostSelection = modules.viewModel.buildPanelSelectionView(paneLostData, paneLostState)
    assert.equal(modules.viewModel.buildTeamAttentionSummary(paneLostData.team, paneLostData.mailbox).paneLostMembers, 1, 'attention summary should count pane-lost members')
    const paneLostLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data: paneLostData, state: paneLostState, selection: paneLostSelection })
    assert.ok(paneLostLines.some(line => line.includes('Attention') && line.includes('worker error')), 'overview should project pane-lost attention as public worker error')
    assert.ok(paneLostLines.some(line => line.includes('researcher') && line.includes('error')), 'member row should include public error health')

    const theme = helpers.createFakeTheme()
    const expandedState = modules.viewModel.createInitialPanelState()
    expandedState.focus = 'tasks'
    expandedState.selectedIndex = 0
    expandedState.isDetailExpanded = true
    const expandedSelection = modules.viewModel.buildPanelSelectionView(data, expandedState)
    const expandedLines = modules.layout.renderTeamPanelLines(theme, { width: 96, data, state: expandedState, selection: expandedSelection })
    assert.ok(expandedLines.some(line => line.includes('Long description for rendering')), 'expanded details should show full task description')
    assert.ok(expandedLines.some(line => line.includes('References') && line.includes('2 folded')), 'expanded task details should show compact folded reference diagnostics')
    assert.equal(expandedLines.some(line => line.includes('legacy render handoff')), false, 'expanded task details should hide folded legacy ref body')
    assert.ok(expandedLines.some(line => line.includes('Esc') && line.includes('collapse details')), 'expanded details should hint Esc collapse')

    const longTask = modules.state.createTask(team, {
      title: 'Long detail overflow regression',
      description: Array.from({ length: 40 }, (_, i) => `description line ${i + 1} with 中文连续内容测试abcdef`).join('\n'),
    })
    modules.state.appendTaskNote(
      longTask,
      'researcher-very-long-member-name-alpha',
      Array.from({ length: 40 }, (_, i) => `note line ${i + 1} with long-token-${'x'.repeat(80)}`).join('\n'),
    )
    modules.state.writeTeamState(team)
    const longData = modules.panelDataSource.loadPanelData('render-suite')
    const longState = modules.viewModel.createInitialPanelState()
    longState.focus = 'tasks'
    longState.selectedIndex = longData.tasks.findIndex(item => item.id === longTask.id)
    longState.isDetailExpanded = true
    const longSelection = modules.viewModel.buildPanelSelectionView(longData, longState)
    const longLines = modules.layout.renderTeamPanelLines(theme, { width: 96, height: 32, data: longData, state: longState, selection: longSelection })
    assert.ok(longLines.length <= 32, `expanded reader should stay within terminal height, got ${longLines.length}`)
    assert.ok(longLines.some(line => line.includes('Details · task')), 'expanded reader should use a focused detail reader title')
    assert.ok(longLines.some(line => line.includes('/')), 'expanded reader should show scroll range')
    assert.ok(longLines.some(line => line.includes('description line 1')), 'expanded reader should show the first page of full details')
    assert.equal(longLines.some(line => line.includes('note line 40')), false, 'first page should not render the end of long notes')

    longState.detailScrollOffset = 1000
    const longScrolledLines = modules.layout.renderTeamPanelLines(theme, { width: 96, height: 32, data: longData, state: longState, selection: longSelection })
    assert.ok(longScrolledLines.length <= 32, `scrolled expanded reader should stay within terminal height, got ${longScrolledLines.length}`)
    assert.ok(longScrolledLines.some(line => line.includes('note line 40')), 'expanded reader should allow scrolling to the end of long notes')

    for (const width of [56, 72, 96, 128, 160, 220]) {
      for (const renderCase of [
        { data, state, selection },
        { data: globalData, state: globalState, selection: globalSelection },
      ]) {
        const lines = modules.layout.renderTeamPanelLines(theme, { width, ...renderCase })
        assert.ok(Array.isArray(lines), `lines should be array for width=${width}`)
        for (const line of lines) {
          const visible = helpers.visibleWidth(line)
          assert.ok(
            visible <= width,
            `Rendered line exceeds width ${visible} > ${width}: ${line}`,
          )
        }
      }
    }
  },
}
