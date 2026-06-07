const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const FULL_BODY_SENTINEL_V045 = 'FULL_BODY_SENTINEL_V045_SHOULD_ONLY_APPEAR_BEHIND_EXPLICIT_READ_BOUNDARY'
const FULL_REPORT_SENTINEL_V045 = 'FULL_REPORT_SENTINEL_V045_SHOULD_ONLY_APPEAR_BEHIND_EXPLICIT_REPORT_BOUNDARY'

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-panel-read-model-v045-${name}-`))
  try {
    process.env.PI_AGENTTEAM_HOME = home
    modules.state.invalidateSessionContextCache()
    modules.runtimePanes.invalidatePaneReconcileCache()
    return await fn(home)
  } finally {
    modules.runtimePanes.invalidatePaneReconcileCache()
    modules.state.invalidateSessionContextCache()
    process.env.PI_AGENTTEAM_HOME = previousHome
    fs.rmSync(home, { recursive: true, force: true })
  }
}

function withProfileEnv(value, fn) {
  const previous = process.env.PI_AGENTTEAM_PROFILE
  try {
    if (value === undefined) delete process.env.PI_AGENTTEAM_PROFILE
    else process.env.PI_AGENTTEAM_PROFILE = value
    return fn()
  } finally {
    if (previous === undefined) delete process.env.PI_AGENTTEAM_PROFILE
    else process.env.PI_AGENTTEAM_PROFILE = previous
  }
}

function createCountingTmuxClient(livePaneIds, orphanPaneIds = []) {
  const calls = []
  function record(args) {
    calls.push([...args])
  }
  function respondDisplayMessage(args) {
    const targetIndex = args.indexOf('-t')
    const paneId = targetIndex >= 0 ? args[targetIndex + 1] : '%current'
    if (!livePaneIds.has(paneId)) return { ok: false, stdout: '', stderr: `missing ${paneId}` }
    const format = args[args.length - 1] || ''
    if (format.includes('#{session_name}:#{window_id}')) return { ok: true, stdout: 'read-model:@1' }
    if (format.includes('#{pane_id}')) return { ok: true, stdout: paneId }
    return { ok: true, stdout: paneId }
  }
  function respondListPanes() {
    const rows = [
      ...Array.from(livePaneIds).map(paneId => `${paneId}\tread-model:@1\tagentteam ${paneId}\tpi`),
      ...orphanPaneIds.map(paneId => `${paneId}\tread-model:@9\tagentteam orphan ${paneId}\tpi`),
    ]
    return { ok: true, stdout: rows.join('\n') }
  }
  return {
    calls,
    exec(args) {
      record(args)
      if (args[0] === 'display-message') return respondDisplayMessage(args).stdout
      if (args[0] === 'list-panes') return respondListPanes().stdout
      return ''
    },
    execNoThrow(args) {
      record(args)
      if (args[0] === 'display-message') return respondDisplayMessage(args)
      if (args[0] === 'list-panes') return respondListPanes()
      return { ok: true, stdout: '' }
    },
    async execAsync(args) {
      record(args)
      if (args[0] === 'display-message') return respondDisplayMessage(args).stdout
      if (args[0] === 'list-panes') return respondListPanes().stdout
      return ''
    },
    async execNoThrowAsync(args) {
      record(args)
      if (args[0] === 'display-message') return respondDisplayMessage(args)
      if (args[0] === 'list-panes') return respondListPanes()
      return { ok: true, stdout: '' }
    },
  }
}

async function withTmuxClient(tmuxClientModule, fakeClient, fn) {
  assert.equal(typeof tmuxClientModule.withTmuxClientForTests, 'function', 'tmux/client.js should expose withTmuxClientForTests(fakeClient, fn)')
  return await tmuxClientModule.withTmuxClientForTests(fakeClient, fn)
}

function countCommand(calls, command) {
  return calls.filter(args => args[0] === command).length
}

function addWorker(modules, team, name, index) {
  const paneId = `%${team.name}-${index}`
  modules.state.upsertMember(team, {
    name,
    role: index % 2 === 0 ? 'planner' : 'implementer',
    cwd: team.leaderCwd,
    sessionFile: `/tmp/${team.name}-${name}.jsonl`,
    paneId,
    windowTarget: 'read-model:@1',
    status: 'idle',
  })
  return paneId
}

function makeReadModelTeam(modules, name, options = {}) {
  modules.state.deleteTeamState(name)
  const team = modules.state.createInitialTeamState({
    teamName: options.rawName || name,
    storageName: name,
    leaderSessionFile: `/tmp/${name}-leader.jsonl`,
    leaderCwd: options.leaderCwd || `/tmp/panel-read-model-v045/${name}`,
    description: 'v0.4.5 panel read-model boundary/cost characterization fixture',
  })
  const livePaneIds = []
  for (let index = 0; index < (options.workerCount ?? 2); index += 1) {
    livePaneIds.push(addWorker(modules, team, `worker-${index + 1}`, index + 1))
  }
  const tasks = []
  for (let index = 0; index < (options.taskCount ?? 3); index += 1) {
    const task = modules.state.createTask(team, {
      title: `Read-model task ${index + 1}`,
      description: `Read-model fixture task ${index + 1}`,
      owner: index % 2 === 0 ? 'worker-1' : undefined,
    })
    task.updatedAt = 1700000100000 + index
    if (index === 1) {
      task.status = 'blocked'
      task.blockedBy.push('leader decision')
    }
    tasks.push(task)
  }
  const reportTask = tasks[0]
  const report = modules.state.appendTaskReport(team, {
    taskId: reportTask.id,
    type: 'report_done',
    author: 'worker-1',
    text: `${FULL_REPORT_SENTINEL_V045} full durable TaskReport body that must require agentteam_task action=report`,
    summary: 'Compact report summary v0.4.5',
    createdAt: 1700000200000,
    threadId: `task:${reportTask.id}`,
    reporterIsOwner: true,
    statusAtReport: 'open',
    ownerAtReport: 'worker-1',
  })
  modules.state.appendTaskEvent(team, {
    taskId: reportTask.id,
    type: 'report_submitted',
    by: 'worker-1',
    at: 1700000200001,
    summary: 'Compact report submitted activity v0.4.5',
    reportId: report.id,
  })
  modules.state.appendTaskMessageRef(team, {
    taskId: reportTask.id,
    mailboxMessageId: 'mailbox-ref-v045',
    from: 'team-lead',
    to: 'worker-1',
    type: 'assignment',
    createdAt: 1700000200002,
    summary: 'Compact task-bound message ref v0.4.5',
  })
  modules.state.writeTeamState(team)
  const mailboxMessage = modules.state.pushMailboxMessage(team.name, 'team-lead', {
    id: `${team.name}-mailbox-v045`,
    from: 'worker-1',
    to: 'team-lead',
    type: 'report_done',
    priority: 'high',
    taskId: reportTask.id,
    threadId: `task:${reportTask.id}`,
    summary: 'Compact mailbox summary v0.4.5',
    text: `${FULL_BODY_SENTINEL_V045} full mailbox body that must require agentteam_receive`,
    metadata: { reportId: report.id },
    createdAt: 1700000200003,
  })
  modules.runtimePanes.invalidatePaneReconcileCache(team.name)
  return { team, tasks, report, mailboxMessage, livePaneIds }
}

function makeLargeFixtureTeam(modules, name) {
  const fixture = makeReadModelTeam(modules, name, { workerCount: 6, taskCount: 24 })
  const team = modules.state.readTeamState(name)
  const taskIds = Object.keys(team.tasks)
  for (let index = 0; index < 40; index += 1) {
    modules.state.pushMailboxMessage(name, 'team-lead', {
      id: `${name}-large-mail-${index}`,
      from: `worker-${(index % 6) + 1}`,
      to: 'team-lead',
      type: index % 5 === 0 ? 'report_blocked' : 'inform',
      priority: index % 5 === 0 ? 'high' : 'normal',
      taskId: taskIds[index % taskIds.length],
      summary: `Large compact mailbox summary ${index}`,
      text: `${FULL_BODY_SENTINEL_V045} large mailbox body ${index} ${'x'.repeat(200)}`,
      createdAt: 1700000300000 + index,
    })
  }
  modules.state.updateTeamState(name, latest => {
    for (let index = 0; index < 18; index += 1) {
      const taskId = taskIds[index % taskIds.length]
      const report = modules.state.appendTaskReport(latest, {
        taskId,
        type: index % 4 === 0 ? 'report_blocked' : 'report_done',
        author: `worker-${(index % 6) + 1}`,
        text: `${FULL_REPORT_SENTINEL_V045} large report body ${index} ${'y'.repeat(220)}`,
        summary: `Large compact report summary ${index}`,
        createdAt: 1700000400000 + index,
        reporterIsOwner: true,
        reportedBlockedBy: index % 4 === 0 ? ['leader decision'] : undefined,
        statusAtReport: index % 4 === 0 ? 'blocked' : 'open',
        ownerAtReport: `worker-${(index % 6) + 1}`,
      })
      modules.state.appendTaskEvent(latest, {
        taskId,
        type: 'report_submitted',
        by: report.author,
        at: report.createdAt + 1,
        summary: `Large compact report activity ${index}`,
        reportId: report.id,
      })
    }
  })
  modules.runtimePanes.invalidatePaneReconcileCache(name)
  return fixture
}

function assertNoSentinels(label, value, failures) {
  const json = JSON.stringify(value)
  if (json.includes(FULL_BODY_SENTINEL_V045)) failures.push(`${label} should not expose full MailboxMessage.text sentinel`)
  if (json.includes(FULL_REPORT_SENTINEL_V045)) failures.push(`${label} should not expose full TaskReport.text sentinel`)
}

function assertAttachedPanelDataIsCompact(data, failures) {
  if (data.mode !== 'attached') {
    failures.push(`attached fixture should load attached panel data, got ${data.mode}`)
    return
  }
  if (!Array.isArray(data.mailbox)) failures.push('attached PanelData should expose a bounded mailbox projection array')
  const mailboxTextFields = (data.mailbox || []).filter(item => Object.prototype.hasOwnProperty.call(item, 'text')).length
  if (mailboxTextFields > 0) failures.push(`attached mailbox projection should omit text; found ${mailboxTextFields} item(s) with text`)
  const rawHistoryStores = ['taskReports', 'taskEvents', 'taskMessageRefs'].filter(key => data.team && Object.prototype.hasOwnProperty.call(data.team, key))
  if (rawHistoryStores.length > 0) failures.push(`attached PanelData.team should expose compact task-history counts/latest summaries instead of raw stores: ${rawHistoryStores.join(', ')}`)
}

function assertGlobalPanelDataIsCompact(data, failures) {
  if (data.mode !== 'global') {
    failures.push(`global fixture should load global panel data, got ${data.mode}`)
    return
  }
  const teamsWithRawHistory = (data.teams || [])
    .filter(team => ['taskReports', 'taskEvents', 'taskMessageRefs'].some(key => Object.prototype.hasOwnProperty.call(team, key)))
    .map(team => team.name)
  if (teamsWithRawHistory.length > 0) failures.push(`global teams should omit raw task history stores; found ${teamsWithRawHistory.length} team(s): ${teamsWithRawHistory.join(', ')}`)
  const latestAttentionWithText = Object.values(data.teamMailboxes || {})
    .filter(mailbox => mailbox.latestAttention && Object.prototype.hasOwnProperty.call(mailbox.latestAttention, 'text')).length
  if (latestAttentionWithText > 0) failures.push(`global teamMailboxes.latestAttention should omit text; found ${latestAttentionWithText} projection(s) with text`)
}

function assertMailboxUnreadBoundary(modules, teamName, messageId, label) {
  const stored = modules.state.readMailbox(teamName, 'team-lead').find(item => item.id === messageId)
  assert.ok(stored, `${label}: mailbox fixture should remain present after panel access`)
  assert.equal(stored.readAt, undefined, `${label}: panel access should not mark mailbox items read`)
  assert.equal(stored.deliveredAt, undefined, `${label}: panel access should not mark mailbox items delivered`)
  assert.ok(stored.text.includes(FULL_BODY_SENTINEL_V045), `${label}: backing mailbox store should retain full text behind receive boundary`)
}

function renderAttachedPanel(modules, helpers, data, focus = 'mailbox') {
  const state = modules.viewModel.createInitialPanelState()
  state.focus = focus
  state.selectedIndex = 0
  state.mailboxSelectedIndex = 0
  state.tasksSelectedIndex = 0
  modules.viewModel.clampPanelStateToData(state, data)
  const selection = modules.viewModel.buildPanelSelectionView(data, state)
  return modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), {
    width: 160,
    height: 44,
    data,
    state,
    selection,
  })
}

module.exports = {
  name: 'team panel read-model v0.4.5 RED characterization',
  async run(env) {
    const { modules, helpers } = env
    const fingerprint = helpers.requireDist('teamPanel/fingerprint.js')
    const tmuxClient = helpers.requireDist('tmux/client.js')
    const profiling = helpers.requireDist('runtime/profiling.js')
    const failures = []

    await withTempHome(modules, 'boundary', async () => {
      const attachedFixture = makeReadModelTeam(modules, 'panel-read-model-attached-v045')
      const globalFixture = makeReadModelTeam(modules, 'panel-read-model-global-v045')
      const sameDisplayA = makeReadModelTeam(modules, 'panel-read-model-same-display-a-v045', {
        rawName: 'Same Display v0.4.5',
        leaderCwd: '/tmp/panel-read-model-v045/project-a',
        workerCount: 1,
        taskCount: 1,
      })
      const sameDisplayB = makeReadModelTeam(modules, 'panel-read-model-same-display-b-v045', {
        rawName: 'Same Display v0.4.5',
        leaderCwd: '/tmp/panel-read-model-v045/project-b',
        workerCount: 1,
        taskCount: 1,
      })
      const largeFixture = makeLargeFixtureTeam(modules, 'panel-read-model-large-v045')
      const livePaneIds = new Set([
        ...attachedFixture.livePaneIds,
        ...globalFixture.livePaneIds,
        ...sameDisplayA.livePaneIds,
        ...sameDisplayB.livePaneIds,
        ...largeFixture.livePaneIds,
      ])

      await withTmuxClient(tmuxClient, createCountingTmuxClient(livePaneIds, ['%panel-read-model-orphan-v045']), async () => {
        const attachedData = modules.panelDataSource.loadPanelData(attachedFixture.team.name)
        assertAttachedPanelDataIsCompact(attachedData, failures)
        assertNoSentinels('attached loadPanelData JSON', attachedData, failures)

        const attachedRender = renderAttachedPanel(modules, helpers, attachedData, 'mailbox').join('\n')
        assertNoSentinels('attached render output', attachedRender, failures)
        const attachedFingerprint = fingerprint.panelDataFingerprint(attachedData)
        assertNoSentinels('attached panelDataFingerprint', attachedFingerprint, failures)
        assertMailboxUnreadBoundary(modules, attachedFixture.team.name, attachedFixture.mailboxMessage.id, 'GREEN attached load/render/fingerprint boundary')

        const largeData = modules.panelDataSource.loadPanelData(largeFixture.team.name)
        assertAttachedPanelDataIsCompact(largeData, failures)
        assertNoSentinels('large attached loadPanelData JSON', largeData, failures)
        assertMailboxUnreadBoundary(modules, largeFixture.team.name, largeFixture.mailboxMessage.id, 'GREEN large fixture load boundary')

        const globalData = modules.panelDataSource.loadPanelData(null)
        assertGlobalPanelDataIsCompact(globalData, failures)
        assertNoSentinels('global loadPanelData JSON', globalData, failures)
        assert.equal(globalData.teams.filter(team => team.identity?.displayName === 'Same Display v0.4.5').length, 2, 'GREEN v0.4.2 TeamIdentity same-display teams should remain distinct in global data')
        assert.ok(globalData.orphanPanes.some(pane => pane.paneId === '%panel-read-model-orphan-v045'), 'GREEN v0.4.3 global panel should retain orphan pane discovery')
        assertMailboxUnreadBoundary(modules, globalFixture.team.name, globalFixture.mailboxMessage.id, 'GREEN global load boundary')
      })
    })

    await withTempHome(modules, 'tmux-bounds', async () => {
      const fixture = makeReadModelTeam(modules, 'panel-read-model-tmux-v045', { workerCount: 5, taskCount: 2 })
      const fakeClient = createCountingTmuxClient(new Set(fixture.livePaneIds))
      await withTmuxClient(tmuxClient, fakeClient, async () => {
        const data = modules.panelDataSource.loadPanelData(fixture.team.name)
        assert.equal(data.mode, 'attached', 'GREEN tmux bounds fixture should load attached data')
      })
      assert.equal(countCommand(fakeClient.calls, 'display-message'), 0, 'GREEN v0.4.3 attached panel load should not use per-member display-message')
      assert.ok(countCommand(fakeClient.calls, 'list-panes') <= 1, 'GREEN v0.4.3 attached panel load should use at most one list-panes snapshot')
    })

    await withTempHome(modules, 'profiling', async () => {
      const fixture = makeLargeFixtureTeam(modules, 'panel-read-model-profile-v045')
      const fakeClient = createCountingTmuxClient(new Set(fixture.livePaneIds))
      await withTmuxClient(tmuxClient, fakeClient, async () => {
        withProfileEnv('1', () => {
          profiling.resetProfiling()
          const data = modules.panelDataSource.loadPanelData(fixture.team.name)
          assert.equal(data.mode, 'attached', 'profiling fixture should load attached data')
          const summary = profiling.readProfilingSummary()
          assert.equal(summary.enabled, true, 'GREEN profiling harness should be enabled by PI_AGENTTEAM_PROFILE=1')
          assert.ok(summary.fsStore.readCount >= 1, `GREEN profiling should record backing fs reads: ${JSON.stringify(summary.fsStore)}`)
          const metricKeys = Object.keys(summary).map(key => key.toLowerCase())
          if (!metricKeys.some(key => key.includes('panel') || key.includes('readmodel') || key.includes('read-model'))) {
            failures.push(`panel profiling should expose a panel/read-model metric section under PI_AGENTTEAM_PROFILE=1; top-level sections: ${Object.keys(summary).join(', ')}`)
          }
        })
      })
    })

    assert.equal(failures.length, 0, failures.join('\n'))
  },
}
