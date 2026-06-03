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
    const renderReportFullBody = 'Full report body should stay out of /team default history summaries'
    const renderReport = modules.state.appendTaskReport(team, {
      taskId: task.id,
      type: 'report_done',
      author: 'researcher-very-long-member-name-alpha',
      text: renderReportFullBody,
      summary: 'Compact report summary for panel',
      createdAt: Date.now() + 10,
      threadId: `task:${task.id}`,
      reporterIsOwner: true,
      statusAtReport: 'open',
      ownerAtReport: 'researcher-very-long-member-name-alpha',
    })
    renderReport.mailboxMessageId = 'mailbox-report-panel-ref'
    modules.state.appendTaskEvent(team, {
      taskId: task.id,
      type: 'created',
      by: 'team-lead',
      at: Date.now() + 1,
      summary: 'Task created for panel history',
    })
    modules.state.appendTaskEvent(team, {
      taskId: task.id,
      type: 'report_submitted',
      by: 'researcher-very-long-member-name-alpha',
      at: Date.now() + 20,
      summary: 'Report submitted compact activity',
      reportId: renderReport.id,
    })
    modules.state.appendTaskMessageRef(team, {
      taskId: task.id,
      mailboxMessageId: 'mailbox-panel-task-ref',
      from: 'team-lead',
      to: 'researcher-very-long-member-name-alpha',
      type: 'assignment',
      createdAt: Date.now() + 30,
      threadId: `task:${task.id}`,
      summary: 'Compact panel handoff summary',
    })
    const panelHistory = modules.viewModel.taskHistorySummary(team, task.id)
    assert.equal(panelHistory.reports, 1, 'panel view model should count TaskReport artifacts')
    assert.equal(panelHistory.events, 2, 'panel view model should count TaskEvent artifacts')
    assert.equal(panelHistory.messageRefs, 1, 'panel view model should count TaskMessageRef artifacts')
    assert.equal(panelHistory.latestReport.id, renderReport.id, 'panel view model should expose compact latest report')
    assert.equal(panelHistory.latestActivity.kind, 'messageRef', 'panel view model should expose compact latest activity without mailbox body')
    assert.equal(JSON.stringify(panelHistory).includes(renderReportFullBody), false, 'panel history summary must not expose full report body')
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
    const overflowTasks = []
    for (let i = 0; i < 14; i += 1) {
      const extraTask = modules.state.createTask(team, {
        title: `Overflow full-height task ${i + 1}`,
        description: `Overflow task fixture ${i + 1}`,
      })
      extraTask.status = 'open'
      extraTask.owner = 'researcher-very-long-member-name-alpha'
      overflowTasks.push(extraTask)
    }
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
      text: 'Blocked on missing decision with compact mailbox body only',
      metadata: { reportId: renderReport.id },
    })
    modules.state.pushMailboxMessage(team.name, 'team-lead', {
      from: 'researcher-very-long-member-name-alpha',
      to: 'team-lead',
      type: 'report_done',
      taskId: task.id,
      summary: 'Unread research result',
      text: 'Unread research result',
      metadata: { reportId: renderReport.id },
    })

    const data = modules.panelDataSource.loadPanelData('render-suite')
    assert.ok(data, 'panel data should load')
    const state = modules.viewModel.createInitialPanelState()
    modules.viewModel.clampPanelStateToData(state, data)
    let selection = modules.viewModel.buildPanelSelectionView(data, state)
    assert.equal(state.focus, 'cockpit', 'attached panel should start on interactive cockpit tab focus')
    assert.equal(state.scrollFocus, 'list', 'panel scroll focus should default to list')
    assert.ok(selection.selectedMember, 'member details should be available when members section is not focused')
    assert.ok(selection.selectedTask, 'task details should be available even when tasks section is not focused')
    assert.equal(selection.selectedMailbox?.id, blockedMailbox.id, 'mailbox defaults should show urgent blocked messages first')
    assert.ok(selection.cockpitQueue.some(item => item.kind === 'task' && item.task.id === blockedTask.id), 'cockpit queue should include blocked tasks')
    assert.ok(selection.cockpitQueue.some(item => item.kind === 'mailbox' && item.message.id === blockedMailbox.id), 'cockpit queue should include unread mailbox attention')
    assert.ok(selection.selectedCockpitItem, 'cockpit focus should expose the selected queue item')
    assert.equal(selection.selectedCockpitItem.kind, 'task', 'cockpit defaults should select the highest-priority queue item')
    assert.equal(selection.selectedCockpitItem.task.id, blockedTask.id, 'cockpit default selection should prioritize blocked tasks')

    state.focus = 'tasks'
    state.selectedIndex = data.tasks.findIndex(item => item.id === blockedTask.id)
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    assert.equal(selection.selectedTask?.id, blockedTask.id, 'legacy selectedIndex should bridge into task selection')
    state.focus = 'mailbox'
    state.selectedIndex = 1
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    const sortedMailbox = data.mailbox.slice().sort((a, b) => modules.protocol.mailboxUrgencyRank(modules.viewModel.mailboxType(a), a.priority) - modules.protocol.mailboxUrgencyRank(modules.viewModel.mailboxType(b), b.priority) || b.createdAt - a.createdAt)
    assert.equal(state.mailboxSelectedIndex, 1, 'legacy selectedIndex should sync to mailbox per-tab index')
    assert.equal(selection.selectedMailbox?.id, sortedMailbox[1]?.id, 'mailbox selection should follow mailbox per-tab index')
    state.focus = 'tasks'
    modules.viewModel.syncPanelActiveIndex(state)
    assert.equal(state.selectedIndex, state.tasksSelectedIndex, 'active focus should restore its per-tab selectedIndex')
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    assert.equal(selection.selectedMailbox?.id, sortedMailbox[1]?.id, 'mailbox per-tab selection should survive leaving mailbox focus')

    const hotkeyInput = helpers.requireDist('teamPanel/input.js')
    const hotkeyKeys = helpers.tuiKeys
    const hotkeyState = modules.viewModel.createInitialPanelState()
    modules.viewModel.clampPanelStateToData(hotkeyState, data)
    let hotkeySelection = modules.viewModel.buildPanelSelectionView(data, hotkeyState)
    let hotkeyRenderCount = 0
    let hotkeyClosed = false
    const hotkeyDeps = {
      done: result => { hotkeyClosed = result.type === 'close' },
      refresh: () => {},
      requestRender: () => { hotkeyRenderCount += 1 },
    }
    const sendPanelKey = key => {
      hotkeySelection = modules.viewModel.buildPanelSelectionView(data, hotkeyState)
      hotkeyInput.handleTeamPanelInput(key, data, hotkeyState, hotkeySelection, hotkeyDeps)
    }

    sendPanelKey(hotkeyKeys.tab)
    assert.equal(hotkeyState.focus, 'tasks', 'Tab should move cockpit -> tasks')
    sendPanelKey(hotkeyKeys.tab)
    assert.equal(hotkeyState.focus, 'mailbox', 'Tab should move tasks -> mailbox')
    sendPanelKey(hotkeyKeys.shift(hotkeyKeys.tab))
    assert.equal(hotkeyState.focus, 'tasks', 'Shift+Tab should reverse tab order')
    sendPanelKey('4')
    assert.equal(hotkeyState.focus, 'members', 'numeric hotkey 4 should focus members')
    sendPanelKey('1')
    assert.equal(hotkeyState.focus, 'cockpit', 'numeric hotkey 1 should focus cockpit')
    assert.equal(hotkeyState.scrollFocus, 'list', 'tab/hotkey focus changes should keep list scroll focus')

    sendPanelKey('2')
    assert.equal(hotkeyState.focus, 'tasks', 'numeric hotkey 2 should focus tasks')
    sendPanelKey(hotkeyKeys.down)
    assert.equal(hotkeyState.tasksSelectedIndex, 1, 'Down in list scroll focus should move active list selection')
    assert.equal(hotkeyState.detailScrollOffset, 0, 'list navigation should reset detail scroll')
    sendPanelKey(hotkeyKeys.right)
    assert.equal(hotkeyState.scrollFocus, 'detail', 'Right should move scroll focus to detail')
    sendPanelKey(hotkeyKeys.down)
    assert.equal(hotkeyState.tasksSelectedIndex, 1, 'Down in detail scroll focus should preserve list selection')
    assert.equal(hotkeyState.detailScrollOffset, 1, 'Down in detail scroll focus should scroll details')
    sendPanelKey(hotkeyKeys.left)
    assert.equal(hotkeyState.scrollFocus, 'list', 'Left should return scroll focus to list')
    sendPanelKey('e')
    assert.equal(hotkeyState.scrollFocus, 'detail', 'e should move scroll focus to detail')
    sendPanelKey(hotkeyKeys.escape)
    assert.equal(hotkeyState.scrollFocus, 'list', 'Esc from detail focus should return to list without closing')
    assert.equal(hotkeyClosed, false, 'Esc from detail focus should not close panel')
    sendPanelKey('a')
    assert.equal(hotkeyState.interactionMode, 'action-menu', 'a should open team/global actions')
    assert.ok(hotkeyState.actionMenu, 'a should populate action menu')
    assert.equal(hotkeyState.actionMenu.title, 'Team actions for render-suite', 'a should use team action scope')
    assert.ok(!hotkeyState.actionMenu.actions.some(action => (action.section ?? 'selected') === 'selected'), 'team actions should not include selected-item actions')
    hotkeyState.interactionMode = 'browse'
    hotkeyState.actionMenu = undefined
    sendPanelKey(hotkeyKeys.enter)
    assert.equal(hotkeyState.interactionMode, 'action-menu', 'Enter should open contextual actions from list focus')
    assert.ok(hotkeyState.actionMenu.title.includes('task'), 'Enter should use selected item context action scope')
    assert.ok(hotkeyState.actionMenu.actions.some(action => (action.section ?? 'selected') === 'selected'), 'context actions should include selected-item actions')
    assert.equal(hotkeyState.actionMenu.actions.some(action => action.id === 'sync'), false, 'context task actions should not include team maintenance')
    assert.equal(hotkeyState.actionMenu.actions.some(action => action.id === 'delete-team'), false, 'context task actions should not include team danger maintenance')
    assert.ok(hotkeyRenderCount > 0, 'hotkey input should request rerender')

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

    state.focus = 'cockpit'
    state.selectedIndex = 0
    state.cockpitSelectedIndex = 0
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    const cockpitLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state, selection })
    assert.ok(cockpitLines.some(line => line.includes('☰ Cockpit')), 'active cockpit/tab title should identify the interactive cockpit tab')
    const staleCockpitPhrase = ['Work', 'queue'].join(' ')
    assert.equal(cockpitLines.some(line => line.includes(staleCockpitPhrase)), false, 'cockpit tab should not use stale passive queue wording')

    state.focus = 'tasks'
    state.selectedIndex = 0
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    assert.equal(selection.selectedTask?.id, task.id, 'task details should follow task selection')

    const attachedLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state, selection })
    assert.ok(attachedLines.some(line => line.includes('Cockpit')), 'attached master-detail layout should expose cockpit tab')
    assert.ok(attachedLines.some(line => line.includes('● Tasks')), 'attached master-detail layout should expose active tasks tab with simple bullet')
    assert.ok(attachedLines.some(line => line.includes('Mail')), 'attached master-detail layout should expose mailbox tab')
    assert.ok(attachedLines.some(line => line.includes('Members')), 'attached master-detail layout should expose members tab')
    assert.equal(attachedLines.some(line => line.includes('[1]') || line.includes('[2]') || line.includes('[3]') || line.includes('[4]')), false, 'attached tabs should not render numeric-box labels')
    const attachedTabLine = attachedLines.find(line => line.includes('● Tasks')) ?? ''
    assert.equal(attachedTabLine.includes('[') || attachedTabLine.includes(']'), false, 'attached tabs should not render square bracket chrome')
    assert.equal(attachedLines.some(line => line.includes('◆') || line.includes('◇')), false, 'attached tabs should not render extra glyph markers')
    assert.equal(attachedLines.some(line => line.includes('Cockpit 0')), false, 'attached tabs should hide zero counts')
    assert.ok(attachedLines.some(line => line.includes('Tasks (') && line.includes('Mail (') && line.includes('Members (')), 'attached tabs should render non-zero counts as parenthesized badges')
    const attachedHeaderIndex = attachedLines.findIndex(line => line.includes('✦') && line.includes('● Tasks'))
    assert.ok(attachedHeaderIndex >= 0, 'wide attached header should combine team identity/attention and tabs on one line')
    const attachedHeaderLine = attachedLines[attachedHeaderIndex]
    const attachedFirstBoxIndex = attachedLines.findIndex(line => line.includes('╭'))
    const attachedGridLine = attachedLines[attachedFirstBoxIndex]
    assert.ok(helpers.visibleWidth(attachedHeaderLine) <= helpers.visibleWidth(attachedGridLine) - 1, 'wide attached header tabs should end within the visual box grid edge')
    assert.ok(helpers.visibleWidth(attachedHeaderLine) >= helpers.visibleWidth(attachedGridLine) - 3, 'wide attached header tabs should keep a small, stable right-edge inset')
    assert.equal(attachedLines.some(line => line === '─'.repeat(180)), false, 'attached header should not render a full-width separator')
    assert.equal(attachedLines[attachedHeaderIndex + 1], '', 'wide attached boxes should follow header after one blank spacer')
    assert.equal(attachedLines.slice(0, attachedFirstBoxIndex).some(line => line.includes('↑↓ move') || line.includes('Enter item') || line.includes('Tab/1-4')), false, 'attached header should not render persistent keyboard help')
    assert.ok(attachedLines.some(line => line.includes('↑↓ move') && line.includes('Enter item') && line.includes('a team')), 'attached master footer should distinguish item and team action scopes')
    assert.equal(attachedLines.some(line => line.includes('⌨') || line.includes('→/e') || line.includes('Esc close')), false, 'attached keyboard hints should stay short and subtle')
    assert.equal(attachedLines.some(line => line.includes('👥 Members ◇') || line.includes('📋 Tasks ○') || line.includes('📬 Mail')), false, 'attached overview should not render the verbose status rollup')
    assert.ok(attachedLines.some(line => line.includes('Enter') && line.includes('item') && line.includes('a') && line.includes('team')), 'attached footer hint should distinguish item and team action scopes')
    assert.ok(attachedLines.some(line => line.includes('Task') && line.includes('Title') && line.includes('Owner')), 'active task master list should include task columns')
    assert.equal(attachedLines.some(line => line.includes('Name') && line.includes('Health') && line.includes('Context')), false, 'wide attached layout should not render inactive members list simultaneously')
    assert.equal(attachedLines.some(line => line.includes('From') && line.includes('Summary') && line.includes('Time')), false, 'wide attached layout should not render inactive mailbox list simultaneously')
    const attachedTopBorderCount = attachedLines.join('\n').split('╭').length - 1
    assert.equal(attachedTopBorderCount, 2, 'wide attached layout should render exactly master and detail boxes')
    assert.ok(attachedLines.some(line => line.includes('Status')), 'overview/detail hierarchy should show a section label')
    assert.ok(attachedLines.some(line => line.includes('Content')), 'task detail hierarchy should show a content section label')
    assert.ok(attachedLines.some(line => line.includes('History') && line.includes('reports 1') && line.includes('events 2') && line.includes('messageRefs 1')), 'task details should show compact task-history counts')
    assert.ok(attachedLines.some(line => line.includes('Latest report') && line.includes(renderReport.id)), 'task details should show latest compact report id')
    assert.ok(attachedLines.some(line => line.includes('Compact report summary')), 'task details should show latest compact report summary')
    assert.ok(attachedLines.some(line => line.includes('Latest activity') && line.includes('messageRef')), 'task details should show latest compact activity kind')
    assert.ok(attachedLines.some(line => line.includes('Compact panel handoff summary')), 'task details should show compact TaskMessageRef summary')
    assert.ok(attachedLines.some(line => line.includes('Full report') && line.includes(`reportId=${renderReport.id}`)), 'task details should point to explicit report action for full report text')
    assert.equal(attachedLines.some(line => line.includes('Legacy note refs')), false, 'task details should not render legacy task-note diagnostics')
    assert.equal(attachedLines.some(line => line.includes('Latest note')), false, 'task details should not use latest task note as primary history')
    assert.equal(attachedLines.some(line => line.includes('Refs') && !line.includes('messageRefs')), false, 'task details should not use old folded ref count as primary signal')
    assert.equal(attachedLines.some(line => line.includes(renderReportFullBody)), false, 'task details should not leak full TaskReport text by default')

    const narrowAttachedLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 96, height: 40, data, state, selection })
    const narrowTitleIndex = narrowAttachedLines.findIndex(line => line.includes('✦'))
    const narrowTabIndex = narrowAttachedLines.findIndex(line => line.includes('● Tasks'))
    const narrowFirstBoxIndex = narrowAttachedLines.findIndex(line => line.includes('╭'))
    assert.ok(narrowTitleIndex >= 0 && narrowTabIndex > narrowTitleIndex, 'narrow attached header should stack identity above tabs')
    assert.equal(narrowAttachedLines.some(line => line === '─'.repeat(96)), false, 'narrow attached header should not render a full-width separator')
    assert.equal(narrowAttachedLines[narrowTabIndex + 1], '', 'narrow attached boxes should follow stacked header after one blank spacer')
    assert.equal(narrowAttachedLines.slice(0, narrowFirstBoxIndex).some(line => line.includes('↑↓ move') || line.includes('Enter item') || line.includes('Tab/1-4')), false, 'narrow attached header should not render persistent keyboard help')
    const narrowTopBorderCount = narrowAttachedLines.join('\n').split('╭').length - 1
    assert.equal(narrowTopBorderCount, 2, 'narrow attached layout should stack exactly master and detail boxes')
    const narrowMasterIndex = narrowAttachedLines.findIndex(line => line.includes('📋 Tasks'))
    const narrowDetailIndex = narrowAttachedLines.findIndex(line => line.includes('🔎 Details'))
    assert.ok(narrowMasterIndex >= 0 && narrowDetailIndex > narrowMasterIndex, 'narrow attached layout should stack master above detail')
    assert.equal(narrowAttachedLines.some(line => line.includes('👥 Members (')), false, 'narrow attached layout should not render inactive members box')
    assert.equal(narrowAttachedLines.some(line => line.includes('📬 Mailbox (')), false, 'narrow attached layout should not render inactive mailbox box')

    state.focus = 'tasks'
    state.selectedIndex = data.tasks.findIndex(item => item.id === blockedTask.id)
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    const blockedTaskLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state, selection })
    assert.ok(blockedTaskLines.some(line => line.includes(blockedTask.id) && line.includes('blocked')), 'blocked task row should include attention marker')

    state.selectedIndex = data.tasks.findIndex(item => item.id === unownedTask.id)
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    const unownedTaskLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state, selection })
    assert.ok(unownedTaskLines.some(line => line.includes(unownedTask.id) && line.includes('unowned')), 'unowned task row should include attention marker')

    state.selectedIndex = data.tasks.findIndex(item => item.id === overflowTasks[12].id)
    state.tasksSelectedIndex = state.selectedIndex
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    const fullHeightTaskLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state, selection })
    const visibleOverflowRows = fullHeightTaskLines.filter(line => line.includes('Overflow full-height task')).length
    assert.ok(visibleOverflowRows > 6, `full-height task master should render more than old fixed 6-row window, got ${visibleOverflowRows}`)
    assert.ok(fullHeightTaskLines.some(line => line.includes(overflowTasks[12].id)), 'full-height task master should keep far selected task visible')

    state.focus = 'mailbox'
    state.selectedIndex = 0
    state.mailboxSelectedIndex = 0
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    const mailboxLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state, selection })
    assert.ok(mailboxLines.some(line => line.includes('Blocked on missing decision')), 'blocked unread mailbox row should render compact summary in active mailbox master list')
    assert.ok(mailboxLines.some(line => line.includes('unread blocked')), 'mailbox rendering should keep unread blocked report attention markers')
    assert.equal(mailboxLines.some(line => line.includes(renderReportFullBody)), false, 'mailbox cockpit should not hydrate/leak full TaskReport text')
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
    assert.ok(readBlockedLines.some(line => line.includes('blocked task')), 'compact overview should keep factual blocked task attention after report is read')

    const plannerMemberIndex = data.members.findIndex(item => item.name === 'planner-very-long-member-name-beta')
    assert.ok(plannerMemberIndex >= 0, 'planner member should be present')
    state.focus = 'members'
    state.selectedMemberIndex = plannerMemberIndex
    state.membersSelectedIndex = plannerMemberIndex
    state.selectedIndex = plannerMemberIndex
    selection = modules.viewModel.buildPanelSelectionView(data, state)
    const memberLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state, selection })
    assert.ok(memberLines.some(line => line.includes('planner-very') && line.includes('tasks 1')), 'member row should show active owned task count')
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
    bridgeUnavailableState.membersSelectedIndex = bridgeUnavailableIndex
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
    noPaneState.membersSelectedIndex = noPanePlannerIndex
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
    defaultModelState.membersSelectedIndex = defaultModelPlannerIndex
    defaultModelState.selectedIndex = defaultModelPlannerIndex
    const defaultModelSelection = modules.viewModel.buildPanelSelectionView(defaultModelData, defaultModelState)
    const defaultModelLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data: defaultModelData, state: defaultModelState, selection: defaultModelSelection })
    assert.ok(defaultModelLines.some(line => line.includes('Model') && line.includes('(default)')), 'member details should show default launch model')

    const actions = helpers.requireDist('teamPanel/actions.js')
    const input = helpers.requireDist('teamPanel/input.js')
    const keys = helpers.tuiKeys
    const actionMenu = actions.buildPanelActions(data, state, selection)
    const teamActionMenu = actions.buildPanelActions(data, state, selection, 'maintenance')
    assert.equal(actionMenu.actions.some(action => action.id === 'sync'), false, 'attached context panel should not expose sync maintenance')
    assert.equal(actionMenu.actions.some(action => action.id === 'delete-team'), false, 'attached context panel should not expose delete team maintenance')
    assert.ok(actionMenu.actions.some(action => action.id === 'remove-member' && action.label.includes('planner-very-long-member-name-beta')), 'remove action should name the selected teammate')
    assert.equal(teamActionMenu.title, 'Team actions for render-suite', 'team action menu should use team scope title')
    assert.ok(teamActionMenu.actions.some(action => action.id === 'sync'), 'team action menu should expose sync maintenance')
    assert.ok(teamActionMenu.actions.some(action => action.id === 'delete-team' && action.label.includes('render-suite')), 'team action delete should name current team')
    assert.ok(!teamActionMenu.actions.some(action => (action.section ?? 'selected') === 'selected'), 'team action menu should not show selected item actions')
    assert.ok(actionMenu.actions.some(action => action.danger && String(action.description).includes('pane is never killed')), 'danger actions should spell out current pane safety')
    assert.ok(!actionMenu.actions.some(action => action.id === 'back'), 'action menu should rely on Esc, not a Back item')
    assert.ok(!actionMenu.actions.some(action => String(action.id).includes('focus')), 'panel action menu should not expose pane focus')

    // Verify T012 Actions Redesign
    const layoutLists = helpers.requireDist('teamPanel/layoutLists.js')
    const fakeTheme = helpers.createFakeTheme()

    // Verify categorized rendering
    const actionMenuFmt = layoutLists.renderActionMenuLines(fakeTheme, actionMenu, 80)
    const teamActionMenuFmt = layoutLists.renderActionMenuLines(fakeTheme, teamActionMenu, 80)
    assert.ok(actionMenuFmt.some(line => line.includes('▼ SELECTED ITEM')), 'Context action menu should render SELECTED ITEM section')
    assert.equal(actionMenuFmt.some(line => line.includes('▼ MAINTENANCE')), false, 'Context action menu should omit team maintenance section')
    assert.ok(actionMenuFmt.some(line => line.includes('▼ DANGER ZONE')), 'Context action menu should render selected-item DANGER ZONE section')
    assert.equal(teamActionMenuFmt.some(line => line.includes('▼ SELECTED ITEM')), false, 'Team action menu should omit empty SELECTED ITEM section')
    assert.ok(teamActionMenuFmt.some(line => line.includes('▼ MAINTENANCE')), 'Team action menu should render MAINTENANCE section')
    assert.ok(teamActionMenuFmt.some(line => line.includes('▼ DANGER ZONE')), 'Team action menu should render DANGER ZONE section')

    // Danger actions should be grouped under DANGER ZONE
    const selectedDangerZoneIndex = actionMenuFmt.findIndex(line => line.includes('▼ DANGER ZONE'))
    const removeMemberIndex = actionMenuFmt.findIndex(line => line.includes('Remove teammate'))
    assert.ok(removeMemberIndex > selectedDangerZoneIndex, 'Selected-item danger action should appear under DANGER ZONE section')
    const teamDangerZoneIndex = teamActionMenuFmt.findIndex(line => line.includes('▼ DANGER ZONE'))
    const deleteTeamIndex = teamActionMenuFmt.findIndex(line => line.includes('Delete current team'))
    assert.ok(deleteTeamIndex > teamDangerZoneIndex, 'Delete current team action should appear under team DANGER ZONE section')

    // Descriptions should not appear inside normal rows (no per-action multi-line description text below each label)
    assert.ok(!actionMenuFmt.some(line => line.includes('   Reload state and reconcile')), 'Individual description lines should not be rendered immediately below the item in the list')

    // Verify confirmation state machine trigger
    const menuState = {
      title: teamActionMenu.title,
      actions: teamActionMenu.actions,
      selectedIndex: teamActionMenu.actions.findIndex(a => a.id === 'delete-team'), // Target delete-team
    }
    const testState = {
      ...state,
      interactionMode: 'action-menu',
      actionMenu: menuState,
    }

    let rendered = false
    input.handleTeamPanelInput(keys.enter, data, testState, selection, {
      done: () => {},
      refresh: () => {},
      requestRender: () => { rendered = true },
    })

    assert.ok(testState.actionMenu.confirmingAction, 'Selecting a danger action should set confirmingAction')
    assert.equal(testState.actionMenu.confirmSelectedIndex, 0, 'Confirmation default selection should be Cancel (0)')

    // Verify in-place confirmation rendering
    const confirmFmt = layoutLists.renderActionMenuLines(fakeTheme, testState.actionMenu, 80)
    assert.ok(confirmFmt.some(line => line.includes('CONFIRM DESTRUCTIVE ACTION')), 'Confirmation layout should show confirmation header')
    assert.ok(confirmFmt.some(line => line.includes('No, Cancel operation')), 'Confirmation layout should show Cancel choice')
    const confirmPanelLines = modules.layout.renderTeamPanelLines(fakeTheme, { width: 180, height: 40, data, state: testState, selection })
    assert.ok(confirmPanelLines.some(line => line.includes('Enter choose') && line.includes('default Cancel') && line.includes('Esc cancel')), 'Confirmation footer should keep destructive-action default safety visible')

    // Verify double-enter/Cancel flow (Enter on cancel returns without executing)
    let executedAction = null
    input.handleTeamPanelInput(keys.enter, data, testState, selection, {
      done: (res) => { executedAction = res },
      refresh: () => {},
      requestRender: () => {},
    })
    assert.equal(executedAction, null, 'Enter on Cancel choice must not execute the action')
    assert.equal(testState.actionMenu.confirmingAction, undefined, 'Enter on Cancel choice should clear confirmingAction')

    // Verify confirm flow execution on "Yes" option
    testState.actionMenu.confirmingAction = teamActionMenu.actions.find(a => a.id === 'delete-team')
    testState.actionMenu.confirmSelectedIndex = 1 // Cursor on "Yes, execute"
    input.handleTeamPanelInput(keys.enter, data, testState, selection, {
      done: (res) => { executedAction = res },
      refresh: () => {},
      requestRender: () => {},
    })
    assert.ok(executedAction && executedAction.type === 'delete-team', 'Enter on Confirm choice must execute action')

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
    const globalTeamActions = actions.buildPanelActions(globalData, globalState, globalSelection, 'maintenance')
    assert.ok(globalActions.actions.some(action => action.id === 'recover-team'), 'global console should expose recover action for selected team')
    assert.ok(globalActions.actions.some(action => action.id === 'recover-team' && action.label.includes('render-suite')), 'recover action should name the selected team')
    assert.ok(globalActions.actions.some(action => action.id === 'delete-team' && action.label.includes('render-suite')), 'global delete action should name the selected team')
    assert.equal(globalActions.actions.some(action => action.id === 'cleanup-all'), false, 'global context actions should not expose global cleanup maintenance')
    assert.ok(globalTeamActions.actions.some(action => action.id === 'cleanup-all' && action.label.includes('ALL')), 'cleanup action should make global scope obvious')
    assert.ok(globalActions.actions.some(action => action.danger && String(action.description).includes('pane is never killed')), 'global danger actions should spell out current pane safety')
    assert.ok(!globalActions.actions.some(action => action.id === 'back'), 'global action menu should not include Back')
    assert.equal(globalTeamActions.title, 'Global console actions', 'global maintenance scope should use global maintenance title')
    assert.ok(globalTeamActions.actions.some(action => action.id === 'refresh'), 'global maintenance scope should expose refresh')
    assert.ok(globalTeamActions.actions.some(action => action.id === 'cleanup-all'), 'global maintenance scope should expose cleanup')
    assert.equal(globalTeamActions.actions.some(action => (action.section ?? 'selected') === 'selected'), false, 'global maintenance scope should omit selected item actions')
    assert.ok(globalData.teamSummaries['render-suite'], 'global data should include per-team attention summaries')
    assert.equal(globalData.teamSummaries['render-suite'].blockedMessages, 0, 'global attention summary should ignore read blocked reports')
    assert.equal(globalData.teamSummaries['render-suite'].blockedTasks, 1, 'global attention summary should keep factual blocked task attention')
    assert.equal(globalData.teamMailboxes['render-suite'].unread, 1, 'global data should include unread mailbox projection after read blocked report')
    assert.equal(globalData.teamMailboxes['render-suite'].blocked, 0, 'global data should count only unread blocked mailbox attention')
    assert.equal(globalData.teamMailboxes['render-clean-suite'].blocked, 0, 'read blocked reports should not create global mailbox attention')
    const globalHotkeyState = modules.viewModel.createInitialPanelState()
    modules.viewModel.clampPanelStateToData(globalHotkeyState, globalData)
    let globalHotkeySelection = modules.viewModel.buildPanelSelectionView(globalData, globalHotkeyState)
    const globalHotkeyDeps = {
      done: () => {},
      refresh: () => {},
      requestRender: () => {},
    }
    const sendGlobalPanelKey = key => {
      globalHotkeySelection = modules.viewModel.buildPanelSelectionView(globalData, globalHotkeyState)
      hotkeyInput.handleTeamPanelInput(key, globalData, globalHotkeyState, globalHotkeySelection, globalHotkeyDeps)
    }
    assert.equal(globalHotkeyState.focus, 'teams', 'global panel should clamp initial cockpit focus to teams')
    sendGlobalPanelKey('2')
    assert.equal(globalHotkeyState.focus, 'panes', 'global hotkey 2 should focus panes')
    sendGlobalPanelKey(hotkeyKeys.tab)
    assert.equal(globalHotkeyState.focus, 'teams', 'global Tab should toggle back to teams')
    sendGlobalPanelKey(hotkeyKeys.shift(hotkeyKeys.tab))
    assert.equal(globalHotkeyState.focus, 'panes', 'global Shift+Tab should toggle back to panes')
    sendGlobalPanelKey('a')
    assert.equal(globalHotkeyState.interactionMode, 'action-menu', 'global a should open global maintenance actions')
    assert.equal(globalHotkeyState.actionMenu.title, 'Global console actions', 'global a should use global action scope')
    assert.equal(globalHotkeyState.actionMenu.actions.some(action => (action.section ?? 'selected') === 'selected'), false, 'global a action scope should omit selected item actions')

    const globalLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data: globalData, state: globalState, selection: globalSelection })
    const globalFirstBoxIndex = globalLines.findIndex(line => line.includes('╭'))
    assert.equal(globalLines.slice(0, globalFirstBoxIndex).some(line => line.includes('↑↓ move') || line.includes('Enter item') || line.includes('Tab/1-4')), false, 'global header should not render persistent keyboard help')
    assert.ok(globalLines.some(line => line.includes('Enter') && line.includes('item') && line.includes('a') && line.includes('global')), 'global footer should distinguish item and global action scopes')
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
    paneLostState.focus = 'members'
    paneLostState.selectedMemberIndex = paneLostMemberIndex
    paneLostState.membersSelectedIndex = paneLostMemberIndex
    paneLostState.selectedIndex = paneLostMemberIndex
    modules.viewModel.clampPanelStateToData(paneLostState, paneLostData)
    const paneLostSelection = modules.viewModel.buildPanelSelectionView(paneLostData, paneLostState)
    assert.equal(modules.viewModel.buildTeamAttentionSummary(paneLostData.team, paneLostData.mailbox).paneLostMembers, 1, 'attention summary should count pane-lost members')
    const paneLostLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data: paneLostData, state: paneLostState, selection: paneLostSelection })
    assert.ok(paneLostLines.some(line => line.includes('worker error')), 'overview should project pane-lost attention as public worker error')
    assert.ok(paneLostLines.some(line => line.includes('researcher') && line.includes('error')), 'member row should include public error health')

    const theme = helpers.createFakeTheme()
    const expandedState = modules.viewModel.createInitialPanelState()
    expandedState.focus = 'tasks'
    expandedState.selectedIndex = 0
    expandedState.isDetailExpanded = true
    const expandedSelection = modules.viewModel.buildPanelSelectionView(data, expandedState)
    const expandedLines = modules.layout.renderTeamPanelLines(theme, { width: 96, data, state: expandedState, selection: expandedSelection })
    assert.ok(expandedLines.some(line => line.includes('Long description for rendering')), 'expanded details should show full task description')
    assert.ok(expandedLines.some(line => line.includes('History') && line.includes('reports 1') && line.includes('messageRefs 1')), 'expanded task details should show compact history counts')
    assert.equal(expandedLines.some(line => line.includes('Legacy note refs')), false, 'expanded task details should not show legacy note refs')
    assert.equal(expandedLines.some(line => line.includes(renderReportFullBody)), false, 'expanded task details should not show full report body')
    assert.equal(expandedLines.slice(0, expandedLines.findIndex(line => line.includes('╭'))).some(line => line.includes('q close')), false, 'expanded details should not show close help in header')

    const longTask = modules.state.createTask(team, {
      title: 'Long detail overflow regression',
      description: Array.from({ length: 40 }, (_, i) => `description line ${i + 1} with 中文连续内容测试abcdef`).join('\n'),
    })
    modules.state.writeTeamState(team)
    const longData = modules.panelDataSource.loadPanelData('render-suite')
    const longState = modules.viewModel.createInitialPanelState()
    longState.focus = 'tasks'
    longState.selectedIndex = longData.tasks.findIndex(item => item.id === longTask.id)
    longState.isDetailExpanded = true
    longState.scrollFocus = 'detail'
    const longSelection = modules.viewModel.buildPanelSelectionView(longData, longState)
    const longLines = modules.layout.renderTeamPanelLines(theme, { width: 96, height: 32, data: longData, state: longState, selection: longSelection })
    assert.ok(longLines.length <= 32, `expanded reader should stay within terminal height, got ${longLines.length}`)
    assert.ok(longLines.some(line => line.includes('Details') && line.includes('/')), 'expanded details should show a scrollable detail title')
    assert.ok(longLines.some(line => line.includes('/')), 'expanded reader should show scroll range')
    assert.ok(longLines.some(line => line.includes('↑↓ scroll') && line.includes('e list') && line.includes('q close')), 'detail-focused footer should show detail scrolling context')
    assert.ok(longLines.some(line => line.includes('description line 1')), 'expanded reader should show the first page of full details')
    assert.equal(longLines.some(line => line.includes('note line 40')), false, 'first page should not render legacy note body')

    longState.detailScrollOffset = 1000
    const longScrolledLines = modules.layout.renderTeamPanelLines(theme, { width: 96, height: 32, data: longData, state: longState, selection: longSelection })
    assert.ok(longScrolledLines.length <= 32, `scrolled expanded reader should stay within terminal height, got ${longScrolledLines.length}`)
    assert.ok(longScrolledLines.some(line => line.includes('History') && line.includes('reports 0')), 'expanded reader should allow scrolling through history summary without legacy note body')
    assert.equal(longScrolledLines.some(line => line.includes('note line 40')), false, 'expanded reader should no longer expose legacy note body as primary task detail')

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
