const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const EXPECTED_VERSION = '0.6.8'
const V0414_MAILBOX_BODY_SENTINEL = 'V0414_STATE_READ_MODEL_FULL_MAILBOX_BODY_SHOULD_NOT_LEAK'
const V0414_REPORT_BODY_SENTINEL = 'V0414_STATE_READ_MODEL_FULL_REPORT_BODY_SHOULD_NOT_LEAK'
const V0414_DECOY_BODY_SENTINEL = 'V0414_DECOY_TEAM_FULL_BODY_SHOULD_NOT_BE_SCANNED'
const V0414_CONFIG_SENTINEL = 'V0414_CONFIG_FULL_DUMP_SHOULD_NOT_LEAK'

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-state-read-model-v0414-${name}-`))
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

function pushIfMissing(failures, condition, message) {
  if (!condition) failures.push(message)
}

function json(value) {
  return JSON.stringify(value)
}

function tool(env, name) {
  return env.pi.__tools.get(name)
}

function resultText(result) {
  return String(result?.content?.[0]?.text ?? result?.text ?? '')
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeConfig(home, config) {
  writeJson(path.join(home, 'config.json'), config)
}

function teamStatePath(home, teamName) {
  return path.join(home, 'teams', teamName, 'team.json')
}

function mailboxPath(home, teamName, memberName) {
  return path.join(home, 'teams', teamName, 'inboxes', `${modulesSafeName(memberName)}.json`)
}

function modulesSafeName(name) {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
}

function addWorker(modules, team, name, role = 'implementer') {
  modules.state.upsertMember(team, {
    name,
    role,
    cwd: team.leaderCwd,
    sessionFile: `/tmp/${team.name}-${name}.jsonl`,
    paneId: `%v0414-${team.name}-${name}`,
    windowTarget: 'state-read-model-v0414:@1',
    status: 'idle',
  })
}

function addTask(modules, team, input = {}) {
  const task = modules.state.createTask(team, {
    title: input.title ?? 'State/read-model v0.4.14 task',
    description: input.description ?? 'Compact read-model fixture task',
    owner: input.owner,
  })
  task.createdAt = input.createdAt ?? 1700001400000
  task.updatedAt = input.updatedAt ?? 1700001400001
  return task
}

function addPlanRun(team, taskId) {
  team.planRuns = {
    PR0414: {
      id: 'PR0414',
      status: 'active',
      sourceReportId: 'TR0414-SOURCE',
      sourceReportSummary: 'Compact source report summary only',
      sourceReportHash: 'compact-source-hash-v0414',
      createdAt: 1700001400500,
      updatedAt: 1700001400600,
      currentStepIndex: 0,
      activeTaskId: taskId,
      steps: [
        {
          id: 'PRS0414-1',
          index: 0,
          title: 'Compact PlanRun panel step',
          description: 'PlanRun compact projection must survive new guards',
          owner: 'worker-one',
          taskId,
          status: 'assigned',
          createdAt: 1700001400500,
          updatedAt: 1700001400600,
          sourceSummary: 'Compact step source summary',
        },
      ],
    },
  }
  team.planRunEvents = {
    PRE0414: {
      id: 'PRE0414',
      planRunId: 'PR0414',
      type: 'advanced',
      by: 'team-lead',
      at: 1700001400600,
      summary: 'Compact PlanRun event summary',
      stepIndex: 0,
      taskId,
      reportId: 'TR0414-SOURCE',
    },
  }
  team.activePlanRunId = 'PR0414'
  team.nextPlanRunSeq = 2
  team.nextPlanRunEventSeq = 2
}

function createFixtureTeam(modules, name, options = {}) {
  modules.state.deleteTeamState(name)
  const leaderSessionFile = options.leaderSessionFile ?? `/tmp/${name}-leader.jsonl`
  const team = modules.state.createInitialTeamState({
    teamName: options.rawName ?? name,
    storageName: name,
    leaderSessionFile,
    leaderCwd: options.leaderCwd ?? `/tmp/state-read-model-v0414/${name}`,
    description: options.description ?? 'v0.4.14 state/read-model boundary characterization fixture',
  })
  addWorker(modules, team, 'worker-one')
  const task = addTask(modules, team, { owner: 'worker-one' })
  const report = modules.state.appendTaskReport(team, {
    taskId: task.id,
    type: 'report_done',
    author: 'worker-one',
    text: `${options.reportSentinel ?? V0414_REPORT_BODY_SENTINEL} full TaskReport body must stay behind agentteam_task action=report`,
    summary: options.reportSummary ?? 'Compact v0.4.14 report summary',
    createdAt: 1700001400100,
    threadId: `task:${task.id}`,
    reporterIsOwner: true,
    statusAtReport: 'open',
    ownerAtReport: 'worker-one',
    metadata: { fixture: 'v0414' },
  })
  modules.state.appendTaskEvent(team, {
    taskId: task.id,
    type: 'report_submitted',
    by: 'worker-one',
    at: 1700001400101,
    summary: 'Compact report submitted activity v0.4.14',
    reportId: report.id,
  })
  modules.state.appendTaskMessageRef(team, {
    taskId: task.id,
    mailboxMessageId: `${name}-message-ref-v0414`,
    from: 'team-lead',
    to: 'worker-one',
    type: 'assignment',
    createdAt: 1700001400102,
    threadId: `task:${task.id}`,
    summary: 'Compact task-bound message ref v0.4.14',
    reportId: report.id,
  })
  addPlanRun(team, task.id)
  modules.state.writeTeamState(team)
  modules.state.writeSessionContext(leaderSessionFile, modules.state.buildSessionContextForTeam(team, modules.types.TEAM_LEAD))
  modules.state.writeSessionContext(team.members['worker-one'].sessionFile, modules.state.buildSessionContextForTeam(team, 'worker-one'))

  const mailboxMessage = modules.state.pushMailboxMessage(name, modules.types.TEAM_LEAD, {
    id: `${name}-mailbox-v0414`,
    from: 'worker-one',
    to: modules.types.TEAM_LEAD,
    type: 'report_done',
    priority: 'high',
    taskId: task.id,
    threadId: `task:${task.id}`,
    summary: options.mailboxSummary ?? 'Compact v0.4.14 mailbox summary',
    text: `${options.mailboxSentinel ?? V0414_MAILBOX_BODY_SENTINEL} full MailboxMessage body must stay behind agentteam_receive`,
    metadata: { reportId: report.id, fixture: 'v0414' },
    createdAt: 1700001400103,
  })

  modules.runtimePanes.invalidatePaneReconcileCache(name)
  return {
    team: modules.state.readTeamState(name),
    task,
    report,
    mailboxMessage,
    leaderSessionFile,
    workerSessionFile: team.members['worker-one'].sessionFile,
  }
}

function assertNoFullBodySentinels(label, value, failures) {
  const serialized = json(value)
  if (serialized.includes(V0414_MAILBOX_BODY_SENTINEL)) failures.push(`${label} must not expose MailboxMessage.text full-body sentinel`)
  if (serialized.includes(V0414_REPORT_BODY_SENTINEL)) failures.push(`${label} must not expose TaskReport.text full-body sentinel`)
}

function ownEnumerableKeys(value) {
  if (!value || typeof value !== 'object') return []
  return Object.keys(value)
}

function assertNoRawTaskHistoryCollections(label, model, failures) {
  const rawKeys = ['taskReports', 'taskEvents', 'taskMessageRefs']
    .filter(key => Object.prototype.hasOwnProperty.call(model ?? {}, key))
  if (rawKeys.length > 0) failures.push(`${label} must not include raw task history collections: ${rawKeys.join(', ')}`)
}

function assertNoRawRepositoryStateMaps(label, model, failures) {
  const rawKeys = [
    'taskReports',
    'taskEvents',
    'taskMessageRefs',
    'events',
    'teamMailboxes',
    'mailboxes',
    'mailbox',
    'taskHistory',
    'taskHistoryByTaskId',
    'taskReportMap',
    'taskEventMap',
    'taskMessageRefMap',
  ].filter(key => Object.prototype.hasOwnProperty.call(model ?? {}, key))
  if (rawKeys.length > 0) failures.push(`${label} must not include raw mailbox/report/task-history maps: ${rawKeys.join(', ')}`)
}

function assertPanelPreservesExistingProjections(label, teamModel, failures) {
  pushIfMissing(failures, Boolean(teamModel?.config), `${label} should preserve v0.4.12 config projection`)
  pushIfMissing(failures, teamModel?.config?.exists === true, `${label} config projection should include exists=true`)
  pushIfMissing(failures, typeof teamModel?.config?.diagnosticCount === 'number', `${label} config projection should include diagnosticCount`)
  pushIfMissing(failures, Array.isArray(teamModel?.config?.roleModels), `${label} config projection should include roleModels`)
  pushIfMissing(failures, Boolean(teamModel?.identity?.teamId), `${label} should preserve v0.4.13 identity.teamId projection`)
  pushIfMissing(failures, Boolean(teamModel?.identity?.projectKey), `${label} should preserve v0.4.13 identity.projectKey projection`)
  pushIfMissing(failures, Array.isArray(teamModel?.planRuns), `${label} should preserve compact PlanRun panel projection`)
  pushIfMissing(failures, teamModel?.planRuns?.some(run => run.planRunId === 'PR0414' && run.taskId === 'T001'), `${label} should include compact PlanRun PR0414 task hint`)
}

function createNoopRuntimeRepository() {
  const snapshot = { capturedAt: 1700001400999, panes: [], byPaneId: {}, ok: true }
  return {
    captureCurrentPaneBinding: () => null,
    paneExists: () => true,
    syncPaneLabelsForTeam: async () => undefined,
    withRuntimeSnapshot: handler => handler(snapshot),
    listAgentTeamPanes: () => [],
    reconcileTeamPanes: () => false,
    prepareTeamForPanel: () => false,
  }
}

function cloneRepository(repository) {
  return { ...repository }
}

function createPanelBodyReadSpyRepository(repository, failures) {
  const spy = {
    readMailboxFullTextCalls: [],
    readTaskReportFullTextCalls: [],
    rawTeamStateReads: [],
  }
  const wrapped = cloneRepository(repository)
  wrapped.readMailbox = (teamName, memberName) => {
    const messages = repository.readMailbox(teamName, memberName)
    if (messages.some(message => typeof message.text === 'string' && message.text.includes(V0414_MAILBOX_BODY_SENTINEL))) {
      spy.readMailboxFullTextCalls.push({ teamName, memberName, count: messages.length })
    }
    return messages
  }
  wrapped.readLeaderMailboxProjection = teamName => {
    const projection = repository.readLeaderMailboxProjection(teamName)
    if (json(projection).includes(V0414_MAILBOX_BODY_SENTINEL)) {
      failures.push(`readLeaderMailboxProjection(${teamName}) leaked full mailbox body into projection`)
    }
    return projection
  }
  wrapped.readTeamForPanel = teamName => {
    const team = repository.readTeamForPanel(teamName)
    if (json(team).includes(V0414_REPORT_BODY_SENTINEL)) {
      spy.rawTeamStateReads.push({ method: 'readTeamForPanel', teamName })
    }
    return team
  }
  wrapped.readTeamPanelModel = teamName => {
    const model = repository.readTeamPanelModel(teamName)
    if (json(model).includes(V0414_REPORT_BODY_SENTINEL) || json(model).includes(V0414_MAILBOX_BODY_SENTINEL)) {
      spy.readTaskReportFullTextCalls.push({ method: 'readTeamPanelModel', teamName })
    }
    return model
  }
  wrapped.readTaskReportSummary = (teamName, reportId) => {
    const summary = repository.readTaskReportSummary(teamName, reportId)
    if (json(summary).includes(V0414_REPORT_BODY_SENTINEL)) {
      spy.readTaskReportFullTextCalls.push({ method: 'readTaskReportSummary', teamName, reportId })
    }
    return summary
  }
  wrapped.readReportWatchdogSummary = teamName => {
    const summary = repository.readReportWatchdogSummary(teamName)
    if (json(summary).includes(V0414_REPORT_BODY_SENTINEL)) {
      spy.readTaskReportFullTextCalls.push({ method: 'readReportWatchdogSummary', teamName })
    }
    return summary
  }
  return { repository: wrapped, spy }
}

function createFsReadSpy(home, sentinels = []) {
  const originalReadFileSync = fs.readFileSync
  const reads = []
  const sentinelReads = []
  fs.readFileSync = function patchedReadFileSync(filePath, ...args) {
    const normalized = path.resolve(String(filePath))
    const value = originalReadFileSync.call(this, filePath, ...args)
    if (normalized.startsWith(path.resolve(home))) {
      reads.push(normalized)
      const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value)
      const matchedSentinels = sentinels.filter(sentinel => text.includes(sentinel))
      if (matchedSentinels.length > 0) sentinelReads.push({ filePath: normalized, matchedSentinels })
    }
    return value
  }
  return {
    reads,
    sentinelReads,
    restore() {
      fs.readFileSync = originalReadFileSync
    },
  }
}

function teamNameFromStatePath(home, filePath) {
  const relative = path.relative(path.join(home, 'teams'), filePath)
  if (relative.startsWith('..')) return null
  const parts = relative.split(path.sep)
  return parts[0] || null
}

function summarizeStateReads(home, reads) {
  const summary = {}
  for (const filePath of reads) {
    const teamName = teamNameFromStatePath(home, filePath)
    if (!teamName) continue
    const relative = path.relative(path.join(home, 'teams', teamName), filePath)
    summary[teamName] = summary[teamName] || { teamJson: 0, mailbox: 0, historyLike: 0, files: [] }
    summary[teamName].files.push(relative)
    if (relative === 'team.json') summary[teamName].teamJson += 1
    if (relative.startsWith(`inboxes${path.sep}`)) summary[teamName].mailbox += 1
    if (/history|report|event|message-ref|messageRef/i.test(relative)) summary[teamName].historyLike += 1
  }
  return summary
}

async function exercisePanelAndRepositoryReadModelGuards(env, failures) {
  const { modules, helpers } = env
  await withTempHome(modules, 'panel-boundary', async home => {
    writeConfig(home, {
      version: 1,
      agents: { implementer: { model: 'v0414-implementer-model' } },
      unknownFullDump: V0414_CONFIG_SENTINEL,
    })
    const fixture = createFixtureTeam(modules, 'state-read-model-v0414-panel')
    const repository = helpers.requireDist('state/repository.js').createStateRepository()
    const { repository: spyRepository, spy } = createPanelBodyReadSpyRepository(repository, failures)
    const runtimeRepository = createNoopRuntimeRepository()

    const panelFsSpy = createFsReadSpy(home, [V0414_MAILBOX_BODY_SENTINEL, V0414_REPORT_BODY_SENTINEL])
    let attachedData
    let globalData
    try {
      attachedData = modules.panelDataSource.loadPanelData(fixture.team.name, {
        stateRepository: spyRepository,
        runtimeRepository,
      })
      globalData = modules.panelDataSource.loadPanelData(null, {
        stateRepository: spyRepository,
        runtimeRepository,
      })
    } finally {
      panelFsSpy.restore()
    }
    pushIfMissing(failures, attachedData.mode === 'attached', `attached panel fixture should load attached data, got ${attachedData.mode}`)
    assertNoFullBodySentinels('attached panel data JSON', attachedData, failures)
    assertNoRawTaskHistoryCollections('attached /team read model', attachedData.team, failures)
    assertNoRawRepositoryStateMaps('attached repository/teamPanel model', attachedData.team, failures)
    pushIfMissing(failures, attachedData.mailbox.every(item => !Object.prototype.hasOwnProperty.call(item, 'text')), 'attached panel mailbox projection must not include MailboxMessage.text fields')
    assertPanelPreservesExistingProjections('attached panel team model', attachedData.team, failures)
    pushIfMissing(failures, !json(attachedData).includes(V0414_CONFIG_SENTINEL), 'attached panel data should not expose arbitrary config full-dump sentinel')

    pushIfMissing(failures, globalData.mode === 'global', `global panel fixture should load global data, got ${globalData.mode}`)
    assertNoFullBodySentinels('global panel data JSON', globalData, failures)
    for (const team of globalData.teams) {
      assertNoRawTaskHistoryCollections(`global /team read model ${team.name}`, team, failures)
      assertNoRawRepositoryStateMaps(`global repository/teamPanel model ${team.name}`, team, failures)
      if (team.name === fixture.team.name) assertPanelPreservesExistingProjections('global panel team model', team, failures)
    }
    for (const [teamName, mailbox] of Object.entries(globalData.teamMailboxes ?? {})) {
      if (mailbox.latestAttention && Object.prototype.hasOwnProperty.call(mailbox.latestAttention, 'text')) {
        failures.push(`global teamMailboxes.${teamName}.latestAttention must not include MailboxMessage.text`)
      }
    }

    const mailboxSourceReads = panelFsSpy.sentinelReads.filter(read => read.matchedSentinels.includes(V0414_MAILBOX_BODY_SENTINEL))
    const reportSourceReads = panelFsSpy.sentinelReads.filter(read => read.matchedSentinels.includes(V0414_REPORT_BODY_SENTINEL))
    if (spy.readMailboxFullTextCalls.length > 0 || mailboxSourceReads.length > 0) {
      failures.push(`panel/read-model path should not read full mailbox source; full mailbox source reads: ${json({ repositoryCalls: spy.readMailboxFullTextCalls, fsReads: mailboxSourceReads })}`)
    }
    if (spy.rawTeamStateReads.length > 0 || spy.readTaskReportFullTextCalls.length > 0 || reportSourceReads.length > 0) {
      failures.push(`panel/read-model path should not read full TaskReport.text source; raw/report full body reads: ${json({ rawTeamStateReads: spy.rawTeamStateReads, readTaskReportFullTextCalls: spy.readTaskReportFullTextCalls, fsReads: reportSourceReads })}`)
    }

    const directPanelModel = repository.readTeamPanelModel(fixture.team.name)
    assertNoFullBodySentinels('direct repository readTeamPanelModel JSON', directPanelModel, failures)
    assertNoRawRepositoryStateMaps('direct repository readTeamPanelModel', directPanelModel, failures)
    assertPanelPreservesExistingProjections('direct repository readTeamPanelModel', directPanelModel, failures)
  })
}

async function exercisePositiveFullTextReadBoundaries(env, failures) {
  const { modules, helpers } = env
  await withTempHome(modules, 'positive-boundaries', async () => {
    const fixture = createFixtureTeam(modules, 'state-read-model-v0414-positive')
    const leaderCtx = helpers.createCtx(fixture.team.leaderCwd, fixture.leaderSessionFile, env.notifications)
    const receiveResult = await tool(env, 'agentteam_receive').execute('state-read-model-v0414-receive', {
      markRead: false,
      limit: 8,
    }, null, () => {}, leaderCtx)
    const receiveSerialized = json(receiveResult)
    pushIfMissing(failures, receiveSerialized.includes(V0414_MAILBOX_BODY_SENTINEL), 'agentteam_receive should remain the explicit full-text MailboxMessage.text read boundary')
    pushIfMissing(failures, receiveSerialized.includes(V0414_REPORT_BODY_SENTINEL), 'agentteam_receive should hydrate referenced TaskReport.text full body when reportId metadata is present')
    pushIfMissing(failures, receiveResult.details?.messages?.some(message => message.text?.includes(V0414_MAILBOX_BODY_SENTINEL)), 'agentteam_receive details.messages should keep full mailbox text')
    pushIfMissing(failures, receiveResult.details?.hydratedReports?.[fixture.report.id]?.text?.includes(V0414_REPORT_BODY_SENTINEL), 'agentteam_receive details.hydratedReports should keep full TaskReport text when referenced')

    const reportResult = await tool(env, 'agentteam_task').execute('state-read-model-v0414-report', {
      action: 'report',
      reportId: fixture.report.id,
    }, null, () => {}, leaderCtx)
    const reportSerialized = json(reportResult)
    pushIfMissing(failures, reportSerialized.includes(V0414_REPORT_BODY_SENTINEL), 'agentteam_task action=report should remain the explicit full-text TaskReport.text read boundary')
    pushIfMissing(failures, reportResult.details?.text?.includes(V0414_REPORT_BODY_SENTINEL), 'agentteam_task report details.text should contain full TaskReport.text')
  })
}

async function exerciseUnrelatedTeamScanGuard(env, failures) {
  const { modules, helpers } = env
  await withTempHome(modules, 'decoy-scan', async home => {
    const active = createFixtureTeam(modules, 'state-read-model-v0414-active')
    const decoyCount = 8
    for (let index = 0; index < decoyCount; index += 1) {
      createFixtureTeam(modules, `state-read-model-v0414-decoy-${index}`, {
        reportSentinel: `${V0414_DECOY_BODY_SENTINEL}_REPORT_${index}`,
        mailboxSentinel: `${V0414_DECOY_BODY_SENTINEL}_MAILBOX_${index}`,
        reportSummary: `Compact decoy report ${index}`,
        mailboxSummary: `Compact decoy mailbox ${index}`,
      })
    }
    modules.state.invalidateSessionContextCache(active.leaderSessionFile)
    const leaderCtx = helpers.createCtx(active.team.leaderCwd, active.leaderSessionFile, env.notifications)

    const spy = createFsReadSpy(home)
    let showResult
    try {
      showResult = await tool(env, 'agentteam_task').execute('state-read-model-v0414-hot-show', {
        action: 'show',
        taskId: active.task.id,
      }, null, () => {}, leaderCtx)
    } finally {
      spy.restore()
    }

    pushIfMissing(failures, resultText(showResult).includes(active.task.id), 'hot single-team agentteam_task show should return the active task')
    const summary = summarizeStateReads(home, spy.reads)
    const decoyReads = Object.entries(summary)
      .filter(([teamName]) => teamName.startsWith('state-read-model-v0414-decoy-'))
      .map(([teamName, item]) => ({ teamName, ...item }))
    if (decoyReads.length > 0) {
      failures.push(`hot single-team agentteam_task show should not scan decoy team.json/mailbox/history files; read ${decoyReads.length} decoy team(s): ${json(decoyReads)}`)
    }
  })
}

function exercisePackageVersionGuard(env, failures) {
  const pkg = readJson(path.join(env.helpers.extRoot, 'package.json'))
  pushIfMissing(failures, pkg.version === EXPECTED_VERSION, `package version should remain ${EXPECTED_VERSION}`)
}

module.exports = {
  name: 'State/read-model v0.4.14 RED boundary characterization',
  async run(env) {
    const failures = []
    await exercisePanelAndRepositoryReadModelGuards(env, failures)
    await exercisePositiveFullTextReadBoundaries(env, failures)
    await exerciseUnrelatedTeamScanGuard(env, failures)
    exercisePackageVersionGuard(env, failures)

    assert.equal(failures.length, 0, `State/read-model v0.4.14 RED expectations not met:\n${failures.join('\n\n')}`)
  },
}
