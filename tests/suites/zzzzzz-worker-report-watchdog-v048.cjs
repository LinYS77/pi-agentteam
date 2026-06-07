const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const V048_MAILBOX_BODY_SENTINEL = 'V048_WATCHDOG_FULL_MAILBOX_BODY_SHOULD_NOT_LEAK'
const V048_REPORT_BODY_SENTINEL = 'V048_WATCHDOG_FULL_REPORT_BODY_SHOULD_NOT_LEAK'

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-watchdog-v048-${name}-`))
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

function createCountingTmuxClient(livePaneIds, orphanPaneIds = []) {
  function respondDisplayMessage(args) {
    const targetIndex = args.indexOf('-t')
    const paneId = targetIndex >= 0 ? args[targetIndex + 1] : '%current'
    if (!livePaneIds.has(paneId)) return { ok: false, stdout: '', stderr: `missing ${paneId}` }
    const format = args[args.length - 1] || ''
    if (format.includes('#{session_name}:#{window_id}')) return { ok: true, stdout: 'watchdog-v048:@1' }
    if (format.includes('#{pane_id}')) return { ok: true, stdout: paneId }
    return { ok: true, stdout: paneId }
  }
  function respondListPanes() {
    const rows = [
      ...Array.from(livePaneIds).map(paneId => `${paneId}\twatchdog-v048:@1\tagentteam ${paneId}\tpi`),
      ...orphanPaneIds.map(paneId => `${paneId}\twatchdog-v048:@9\tagentteam orphan ${paneId}\tpi`),
    ]
    return { ok: true, stdout: rows.join('\n') }
  }
  return {
    exec(args) {
      if (args[0] === 'display-message') return respondDisplayMessage(args).stdout
      if (args[0] === 'list-panes') return respondListPanes().stdout
      return ''
    },
    execNoThrow(args) {
      if (args[0] === 'display-message') return respondDisplayMessage(args)
      if (args[0] === 'list-panes') return respondListPanes()
      return { ok: true, stdout: '' }
    },
    async execAsync(args) {
      if (args[0] === 'display-message') return respondDisplayMessage(args).stdout
      if (args[0] === 'list-panes') return respondListPanes().stdout
      return ''
    },
    async execNoThrowAsync(args) {
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

function sourceIncludesAny(source, needles) {
  return needles.some(needle => source.includes(needle))
}

function assertNoBodySentinel(label, value, failures) {
  const json = JSON.stringify(value)
  if (json.includes(V048_MAILBOX_BODY_SENTINEL)) failures.push(`${label} should not expose full MailboxMessage.text sentinel`)
  if (json.includes(V048_REPORT_BODY_SENTINEL)) failures.push(`${label} should not expose full TaskReport.text sentinel`)
}

function addWorker(modules, team, name, status, index) {
  const paneId = `%watchdog-v048-${index}`
  modules.state.upsertMember(team, {
    name,
    role: index % 2 === 0 ? 'planner' : 'implementer',
    cwd: team.leaderCwd,
    sessionFile: `/tmp/${team.name}-${name}.jsonl`,
    paneId,
    windowTarget: 'watchdog-v048:@1',
    status,
    lastError: status === 'error' ? 'fixture worker error' : undefined,
  })
  return paneId
}

function createTask(modules, team, id, input) {
  const task = modules.state.createTask(team, {
    title: input.title,
    description: input.description || `Watchdog fixture task ${id}`,
    owner: input.owner,
  })
  task.id = id
  task.status = input.status || 'open'
  task.owner = input.owner
  task.blockedBy = input.blockedBy ? [...input.blockedBy] : []
  task.createdAt = input.createdAt || 1700000800000
  task.updatedAt = input.updatedAt || 1700000800000
  delete team.tasks[Object.keys(team.tasks).find(taskId => team.tasks[taskId] === task)]
  team.tasks[id] = task
  return task
}

function addAssignment(modules, team, task, owner, at) {
  modules.state.appendTaskEvent(team, {
    taskId: task.id,
    type: 'assigned',
    by: 'team-lead',
    at,
    summary: `Assigned to ${owner}`,
    data: { newOwner: owner, source: 'watchdog-v048-fixture' },
  })
  modules.state.appendTaskMessageRef(team, {
    taskId: task.id,
    mailboxMessageId: `${team.name}-${task.id}-assignment-${at}`,
    from: 'team-lead',
    to: owner,
    type: 'assignment',
    threadId: `task:${task.id}`,
    summary: `Compact assignment for ${task.id}`,
    createdAt: at,
  })
}

function addReport(modules, team, task, author, at, summary = `Compact report for ${task.id}`) {
  const report = modules.state.appendTaskReport(team, {
    taskId: task.id,
    type: 'report_done',
    author,
    text: `${V048_REPORT_BODY_SENTINEL} full report body for ${task.id} by ${author}`,
    summary,
    createdAt: at,
    threadId: `task:${task.id}`,
    reporterIsOwner: author === task.owner,
    statusAtReport: task.status === 'blocked' ? 'blocked' : 'open',
    ownerAtReport: task.owner,
  })
  modules.state.appendTaskEvent(team, {
    taskId: task.id,
    type: 'report_submitted',
    by: author,
    at,
    summary,
    reportId: report.id,
    data: { source: 'watchdog-v048-fixture', reportType: 'report_done' },
  })
  return report
}

function createWatchdogFixtureTeam(modules, name) {
  modules.state.deleteTeamState(name)
  const team = modules.state.createInitialTeamState({
    teamName: name,
    storageName: name,
    leaderSessionFile: `/tmp/${name}-leader.jsonl`,
    leaderCwd: `/tmp/watchdog-v048/${name}`,
    description: 'v0.4.8 report watchdog RED characterization fixture',
  })
  const livePaneIds = [
    addWorker(modules, team, 'idle-worker', 'idle', 1),
    addWorker(modules, team, 'offline-worker', 'offline', 2),
    addWorker(modules, team, 'error-worker', 'error', 3),
    addWorker(modules, team, 'running-worker', 'running', 4),
    addWorker(modules, team, 'pending-worker', 'pending_delivery', 5),
    addWorker(modules, team, 'new-owner', 'idle', 6),
    addWorker(modules, team, 'other-worker', 'idle', 7),
  ]

  const cases = []
  function taskCase(id, input, expected) {
    const task = createTask(modules, team, id, input)
    cases.push({ task, expected })
    return task
  }

  const waitingIdle = taskCase('T101', { title: 'Idle owner missing report', owner: 'idle-worker' }, { state: 'waiting_for_report', needsNudge: true })
  addAssignment(modules, team, waitingIdle, 'idle-worker', 1700000800100)

  const waitingOffline = taskCase('T102', { title: 'Offline owner missing report', owner: 'offline-worker' }, { state: 'waiting_for_report', needsNudge: true })
  addAssignment(modules, team, waitingOffline, 'offline-worker', 1700000800200)

  const waitingError = taskCase('T103', { title: 'Error owner missing report', owner: 'error-worker' }, { state: 'waiting_for_report', needsNudge: true })
  addAssignment(modules, team, waitingError, 'error-worker', 1700000800300)

  const activeRunning = taskCase('T104', { title: 'Running owner should stay active', owner: 'running-worker' }, { state: 'active', needsNudge: false })
  addAssignment(modules, team, activeRunning, 'running-worker', 1700000800400)

  const activePending = taskCase('T105', { title: 'Pending delivery owner should stay active', owner: 'pending-worker' }, { state: 'active', needsNudge: false })
  addAssignment(modules, team, activePending, 'pending-worker', 1700000800500)

  const okAfterAssignment = taskCase('T106', { title: 'Owner reported after assignment', owner: 'idle-worker' }, { state: 'ok', needsNudge: false })
  addAssignment(modules, team, okAfterAssignment, 'idle-worker', 1700000800600)
  addReport(modules, team, okAfterAssignment, 'idle-worker', 1700000800610, 'Owner report after assignment')

  const reportBeforeAssignment = taskCase('T107', { title: 'Old report before latest assignment', owner: 'idle-worker' }, { state: 'waiting_for_report', needsNudge: true })
  addReport(modules, team, reportBeforeAssignment, 'idle-worker', 1700000800690, 'Report before latest assignment')
  addAssignment(modules, team, reportBeforeAssignment, 'idle-worker', 1700000800700)

  const reassigned = taskCase('T108', { title: 'Reassigned owner still needs report', owner: 'idle-worker' }, { state: 'waiting_for_report', needsNudge: true })
  addAssignment(modules, team, reassigned, 'idle-worker', 1700000800800)
  addReport(modules, team, reassigned, 'idle-worker', 1700000800810, 'Old owner report before reassignment')
  reassigned.owner = 'new-owner'
  reassigned.updatedAt = 1700000800820
  addAssignment(modules, team, reassigned, 'new-owner', 1700000800820)

  const nonOwnerReport = taskCase('T109', { title: 'Non-owner report should not satisfy owner', owner: 'idle-worker' }, { state: 'waiting_for_report', needsNudge: true })
  addAssignment(modules, team, nonOwnerReport, 'idle-worker', 1700000800900)
  addReport(modules, team, nonOwnerReport, 'other-worker', 1700000800910, 'Non-owner context report')

  const doneTask = taskCase('T110', { title: 'Done task no watchdog attention', owner: 'idle-worker', status: 'done' }, { noAttention: true })
  addAssignment(modules, team, doneTask, 'idle-worker', 1700000801000)

  const blockedTask = taskCase('T111', { title: 'Blocked task no watchdog attention', owner: 'idle-worker', status: 'blocked', blockedBy: ['external dependency'] }, { noAttention: true })
  addAssignment(modules, team, blockedTask, 'idle-worker', 1700000801100)

  const unownedTask = taskCase('T112', { title: 'Unowned task no watchdog attention' }, { noAttention: true })
  modules.state.appendTaskEvent(team, {
    taskId: unownedTask.id,
    type: 'created',
    by: 'team-lead',
    at: 1700000801200,
    summary: 'Created unowned task',
  })

  modules.state.writeTeamState(team)
  const mailboxMessage = modules.state.pushMailboxMessage(name, 'team-lead', {
    id: `${name}-leader-watchdog-sentinel`,
    from: 'idle-worker',
    to: 'team-lead',
    type: 'report_done',
    taskId: waitingIdle.id,
    threadId: `task:${waitingIdle.id}`,
    summary: 'Compact watchdog mailbox summary',
    text: `${V048_MAILBOX_BODY_SENTINEL} full mailbox body should require agentteam_receive`,
    metadata: { source: 'watchdog-v048-fixture' },
    createdAt: 1700000801300,
  })

  modules.runtimePanes.invalidatePaneReconcileCache(name)
  return { team: modules.state.readTeamState(name), cases, mailboxMessage, livePaneIds }
}

function watchdogItems(summary) {
  if (!summary) return []
  if (Array.isArray(summary)) return summary
  for (const key of ['tasks', 'items', 'taskWatchdogs', 'watchdogs', 'attention']) {
    const value = summary[key]
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') return Object.values(value)
  }
  return []
}

function watchdogTaskId(item) {
  return item?.taskId || item?.id || item?.task?.id
}

function watchdogState(item) {
  return item?.reportState || item?.state || item?.status || item?.watchdogState
}

function watchdogNeedsNudge(item) {
  if (!item) return false
  if (typeof item.needsNudge === 'boolean') return item.needsNudge
  if (typeof item.needs_nudge === 'boolean') return item.needs_nudge
  if (typeof item.needsLeaderNudge === 'boolean') return item.needsLeaderNudge
  return item.attention === 'needs_nudge' || item.action === 'needs_nudge'
}

function assertWatchdogMatrix(summary, cases, failures) {
  const items = watchdogItems(summary)
  for (const { task, expected } of cases) {
    const item = items.find(candidate => watchdogTaskId(candidate) === task.id)
    if (expected.noAttention) {
      if (!item) continue
      const state = watchdogState(item)
      const needsNudge = watchdogNeedsNudge(item)
      if (state === 'waiting_for_report' || needsNudge) {
        failures.push(`${task.id} ${task.title}: done/blocked/unowned tasks should have no watchdog attention, got state=${state} needsNudge=${needsNudge}`)
      }
      continue
    }
    if (!item) {
      failures.push(`${task.id} ${task.title}: watchdog summary should include ${expected.state} entry`)
      continue
    }
    const state = watchdogState(item)
    const needsNudge = watchdogNeedsNudge(item)
    if (state !== expected.state) {
      failures.push(`${task.id} ${task.title}: expected watchdog state ${expected.state}, got ${state}`)
    }
    if (needsNudge !== expected.needsNudge) {
      failures.push(`${task.id} ${task.title}: expected needsNudge=${expected.needsNudge}, got ${needsNudge}`)
    }
    assertNoBodySentinel(`${task.id} watchdog item`, item, failures)
  }
  assertNoBodySentinel('watchdog summary', summary, failures)
}

function findWatchdogReader(repositoryModule) {
  const repo = typeof repositoryModule.createStateRepository === 'function'
    ? repositoryModule.createStateRepository()
    : repositoryModule.fileBackedStateRepository
  const candidates = [
    repo?.readReportWatchdogSummary,
    repo?.readTaskReportWatchdogSummary,
    repositoryModule.readReportWatchdogSummary,
    repositoryModule.buildReportWatchdogSummary,
    repositoryModule.buildTaskReportWatchdogSummary,
  ]
  return candidates.find(candidate => typeof candidate === 'function')
}

function readWatchdogSummary(reader, teamName, team) {
  try {
    return reader(teamName)
  } catch (error) {
    if (/team/i.test(String(error?.message || ''))) throw error
    return reader(team)
  }
}

module.exports = {
  name: 'worker report watchdog v0.4.8 RED characterization',
  async run(env) {
    const { pi, modules, helpers } = env
    const failures = []
    const repositorySource = helpers.readSource('state/repository.ts')
    const appPortsSource = helpers.readSource('app/ports.ts')
    const coreTaskActionsSource = helpers.readSource('core/taskActions.ts')
    const taskReadCommandsSource = helpers.readSource('app/taskReadCommands.ts')
    const panelReadModelSource = helpers.readSource('teamPanel/readModel.ts')
    const panelDataSourceSource = helpers.readSource('teamPanel/dataSource.ts')
    const orchestrationSource = helpers.readSource('orchestration.ts')
    const repositoryModule = helpers.requireDist('state/repository.js')
    const taskReadCommands = helpers.requireDist('app/taskReadCommands.js')
    const taskTool = pi.__tools.get('agentteam_task')

    if (!repositorySource.includes('readReportWatchdogSummary')) {
      failures.push('StateRepository should expose compact readReportWatchdogSummary(teamName) for missing TaskReport watchdog state')
    }
    if (!appPortsSource.includes('readReportWatchdogSummary')) {
      failures.push('app/ports.ts should define repository-level readReportWatchdogSummary port shape')
    }
    if (!coreTaskActionsSource.includes('nudge_report')) {
      failures.push('Team task action vocabulary should include leader-only nudge_report')
    }
    if (!taskTool?.parameters?.o?.action?.enum?.includes('nudge_report')) {
      failures.push('agentteam_task tool schema should expose action=nudge_report without changing report_done/report_blocked semantics')
    }
    if (!/watchdog|waiting_for_report|needsNudge|needs_nudge/.test(taskReadCommandsSource)) {
      failures.push('agentteam_task show should include compact report watchdog hint for tasks waiting on owner reports')
    }
    if (!/watchdog|waiting_for_report|needsNudge|needs_nudge/.test(panelReadModelSource)) {
      failures.push('PanelData task read model should include compact watchdog state without raw TaskReport/MailboxMessage bodies')
    }
    if (!/watchdog|waiting_for_report|needsNudge|needs_nudge/.test(panelDataSourceSource)) {
      failures.push('teamPanel/dataSource.ts should source task watchdog fields through repository/read-model deps')
    }
    if (!/watchdog|waiting_for_report|needsNudge|needs_nudge/.test(orchestrationSource)) {
      failures.push('leader orchestration digest should surface compact missing-report watchdog attention')
    }
    if (sourceIncludesAny(orchestrationSource, ['./state/mailboxStore.js', "from './state/mailboxStore.js'", 'readMailbox(team.name'])) {
      failures.push('leader digest/report watchdog hot path should use StateRepository compact projections instead of direct state/mailboxStore reads')
    }

    await withTempHome(modules, 'matrix', async () => {
      const fixture = createWatchdogFixtureTeam(modules, 'watchdog-v048-matrix')
      for (const paneId of fixture.livePaneIds) env.patches.livePanes.add(paneId)
      const leaderSessionFile = fixture.team.leaderSessionFile
      const idleWorkerSessionFile = fixture.team.members['idle-worker'].sessionFile
      modules.state.writeSessionContext(leaderSessionFile, { teamName: fixture.team.name, memberName: 'team-lead' })
      modules.state.writeSessionContext(idleWorkerSessionFile, { teamName: fixture.team.name, memberName: 'idle-worker' })
      const leaderCtx = helpers.createCtx('/tmp/watchdog-v048', leaderSessionFile, [])
      const idleWorkerCtx = helpers.createCtx('/tmp/watchdog-v048', idleWorkerSessionFile, [])
      const taskToolForNudge = pi.__tools.get('agentteam_task')
      const tmuxClient = helpers.requireDist('tmux/client.js')
      const reader = findWatchdogReader(repositoryModule)
      if (!reader) {
        failures.push('Missing report watchdog helper/read model should exist and classify idle/offline/error as waiting_for_report needs_nudge, running/pending as active, owner report-after-assignment as ok, stale/non-owner reports as waiting, and done/blocked/unowned as no attention')
      } else {
        const summary = readWatchdogSummary(reader, fixture.team.name, fixture.team)
        assertWatchdogMatrix(summary, fixture.cases, failures)
      }

      await withTmuxClient(tmuxClient, createCountingTmuxClient(new Set(fixture.livePaneIds)), async () => {
        const panelData = modules.panelDataSource.loadPanelData(fixture.team.name)
        assert.equal(panelData.mode, 'attached', 'GREEN panel fixture should load attached PanelData')
        assertNoBodySentinel('GREEN attached PanelData', panelData, failures)
        assert.equal(panelData.mailbox.some(item => Object.prototype.hasOwnProperty.call(item, 'text')), false, 'GREEN attached mailbox projection should omit full text')
        assert.equal(Object.prototype.hasOwnProperty.call(panelData.team, 'taskReports'), false, 'GREEN PanelData.team should not expose raw taskReports')
        const waitingTask = panelData.tasks.find(task => task.id === 'T101')
        if (!waitingTask || !Object.prototype.hasOwnProperty.call(waitingTask, 'watchdog')) {
          failures.push('PanelData.tasks[] should include compact watchdog field for missing-report state')
        } else {
          assertNoBodySentinel('PanelData task watchdog', waitingTask.watchdog, failures)
        }
      })

      const latestTeam = modules.state.readTeamState(fixture.team.name)
      const readDeps = { taskHistory: modules.appStatePorts.fileBackedTaskHistoryQueryPort }
      const showResult = taskReadCommands.showTaskCommand({ team: latestTeam, deps: readDeps }, 'T101')
      assertNoBodySentinel('GREEN task show output/details', showResult, failures)
      if (!/watchdog|waiting_for_report|needs nudge|needs_nudge/i.test(showResult.text) && !/watchdog|waiting_for_report|needsNudge|needs_nudge/.test(JSON.stringify(showResult.details))) {
        failures.push('agentteam_task show should display compact waiting_for_report / needs_nudge hint for T101')
      }

      const reportsResult = taskReadCommands.reportsTaskCommand({ team: latestTeam, deps: readDeps }, 'T106')
      assertNoBodySentinel('GREEN reports compact output/details', reportsResult, failures)
      const explicitReport = taskReadCommands.reportTaskCommand(
        { team: latestTeam, deps: readDeps },
        { action: 'report', reportId: reportsResult.details.reports[0].id, taskId: 'T106' },
      )
      assert.ok(explicitReport.details.text.includes(V048_REPORT_BODY_SENTINEL), 'GREEN explicit action=report should remain the full TaskReport.text boundary')
      assert.equal(JSON.stringify(explicitReport.details.report).includes(V048_REPORT_BODY_SENTINEL), false, 'GREEN explicit report metadata should stay compact while full text is returned separately')

      const beforeDeniedTeam = modules.state.readTeamState(fixture.team.name)
      const beforeDeniedIdleMailbox = modules.state.readMailbox(fixture.team.name, 'idle-worker')
      const beforeDeniedOutbox = modules.state.listOutboxEffects(fixture.team.name)
      const deniedNudge = await taskToolForNudge.execute('watchdog-v048-denied-nudge', {
        action: 'nudge_report',
        taskId: 'T101',
      }, null, () => {}, idleWorkerCtx)
      assert.equal(deniedNudge.details.denied, true, 'non-leader nudge_report should be denied')
      assert.equal(modules.state.readMailbox(fixture.team.name, 'idle-worker').length, beforeDeniedIdleMailbox.length, 'non-leader nudge_report should not write owner mailbox')
      assert.equal(modules.state.listOutboxEffects(fixture.team.name).length, beforeDeniedOutbox.length, 'non-leader nudge_report should not enqueue outbox effects')
      const afterDeniedTeam = modules.state.readTeamState(fixture.team.name)
      assert.deepEqual(afterDeniedTeam.tasks['T101'], beforeDeniedTeam.tasks['T101'], 'non-leader nudge_report should not mutate task facts')
      assert.equal(Object.keys(afterDeniedTeam.taskReports).length, Object.keys(beforeDeniedTeam.taskReports).length, 'non-leader nudge_report should not create TaskReport')

      const beforeLeaderTeam = modules.state.readTeamState(fixture.team.name)
      const beforeLeaderIdleMailbox = modules.state.readMailbox(fixture.team.name, 'idle-worker')
      const leaderNudge = await taskToolForNudge.execute('watchdog-v048-leader-nudge', {
        action: 'nudge_report',
        taskId: 'T101',
      }, null, () => {}, leaderCtx)
      assert.equal(leaderNudge.details.denied, undefined, 'leader nudge_report should be allowed for waiting owner report')
      assert.equal(leaderNudge.details.recipient, 'idle-worker', 'leader nudge_report should target only the task owner')
      assert.equal(leaderNudge.details.summary, 'T101 report requested')
      const afterLeaderTeam = modules.state.readTeamState(fixture.team.name)
      assert.equal(afterLeaderTeam.tasks['T101'].status, beforeLeaderTeam.tasks['T101'].status, 'leader nudge_report should not change task status')
      assert.equal(afterLeaderTeam.tasks['T101'].owner, beforeLeaderTeam.tasks['T101'].owner, 'leader nudge_report should not change owner')
      assert.deepEqual(afterLeaderTeam.tasks['T101'].blockedBy, beforeLeaderTeam.tasks['T101'].blockedBy, 'leader nudge_report should not change blockers')
      assert.equal(Object.keys(afterLeaderTeam.taskReports).length, Object.keys(beforeLeaderTeam.taskReports).length, 'leader nudge_report should not create fake TaskReport')
      const ownerMailbox = modules.state.readMailbox(fixture.team.name, 'idle-worker')
      assert.equal(ownerMailbox.length, beforeLeaderIdleMailbox.length + 1, 'leader nudge_report should append exactly one owner mailbox item')
      const nudgeMessage = ownerMailbox.find(message => message.summary === 'T101 report requested')
      assert.ok(nudgeMessage, 'leader nudge_report should persist compact owner reminder mailbox item')
      assert.equal(nudgeMessage.to, 'idle-worker')
      assert.equal(nudgeMessage.from, 'team-lead')
      assert.equal(nudgeMessage.type, 'question')
      assert.equal(nudgeMessage.taskId, 'T101')
      assert.equal(nudgeMessage.readAt, undefined, 'leader nudge_report should not mark owner mailbox item read')
      assert.equal(nudgeMessage.deliveredAt, undefined, 'leader nudge_report should not mark owner mailbox item delivered')
      assert.ok(nudgeMessage.text.includes('agentteam_task action=report_done taskId=T101'), 'leader nudge body should include report_done command')
      assert.ok(nudgeMessage.text.includes('agentteam_task action=report_blocked taskId=T101'), 'leader nudge body should include report_blocked command')
      assert.ok(nudgeMessage.text.includes('Progress updates are compact local activity only and do not notify team-lead.'), 'leader nudge body should remind progress does not notify leader')
      assert.equal(modules.state.readMailbox(fixture.team.name, 'team-lead').some(message => message.summary === 'T101 report requested'), false, 'leader nudge_report should not broadcast or mirror to leader mailbox')
      const nudgeRefs = Object.values(afterLeaderTeam.taskMessageRefs).filter(ref => ref.taskId === 'T101' && ref.mailboxMessageId === nudgeMessage.id)
      assert.equal(nudgeRefs.length, 1, 'leader nudge_report should append compact TaskMessageRef audit')
      assert.equal(nudgeRefs[0].type, 'question')
      assertNoBodySentinel('leader nudge message/ref', { nudgeMessage, ref: nudgeRefs[0] }, failures)

      for (const [taskId, reason] of [['T104', 'active'], ['T106', 'ok'], ['T110', 'done'], ['T111', 'blocked'], ['T112', 'unowned']]) {
        const beforeRejectedTeam = modules.state.readTeamState(fixture.team.name)
        const rejected = await taskToolForNudge.execute(`watchdog-v048-rejected-${taskId}`, {
          action: 'nudge_report',
          taskId,
        }, null, () => {}, leaderCtx)
        assert.equal(rejected.details.denied, true, `leader nudge_report should reject ${reason} task ${taskId}`)
        assert.equal(Object.keys(modules.state.readTeamState(fixture.team.name).taskReports).length, Object.keys(beforeRejectedTeam.taskReports).length, `rejected nudge ${taskId} should not create TaskReport`)
      }

      const storedMailbox = modules.state.readMailbox(fixture.team.name, 'team-lead').find(message => message.id === fixture.mailboxMessage.id)
      assert.ok(storedMailbox.text.includes(V048_MAILBOX_BODY_SENTINEL), 'GREEN backing mailbox store should retain full text behind agentteam_receive boundary')
      assert.equal(storedMailbox.readAt, undefined, 'GREEN panel/watchdog/nudge reads should not mark mailbox items read')
      assert.equal(storedMailbox.deliveredAt, undefined, 'GREEN panel/watchdog/nudge reads should not mark mailbox items delivered')
    })

    assert.equal(failures.length, 0, failures.join('\n'))
  },
}
