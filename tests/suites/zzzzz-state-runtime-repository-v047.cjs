const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const V047_MAILBOX_BODY_SENTINEL = 'V047_REPOSITORY_SEAM_FULL_MAILBOX_BODY_SHOULD_NOT_LEAK'
const V047_REPORT_BODY_SENTINEL = 'V047_REPOSITORY_SEAM_FULL_REPORT_BODY_SHOULD_NOT_LEAK'

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-repository-v047-${name}-`))
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
    if (format.includes('#{session_name}:#{window_id}')) return { ok: true, stdout: 'repository:@1' }
    if (format.includes('#{pane_id}')) return { ok: true, stdout: paneId }
    return { ok: true, stdout: paneId }
  }
  function respondListPanes() {
    const rows = [
      ...Array.from(livePaneIds).map(paneId => `${paneId}\trepository:@1\tagentteam ${paneId}\tpi`),
      ...orphanPaneIds.map(paneId => `${paneId}\trepository:@9\tagentteam orphan ${paneId}\tpi`),
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
    windowTarget: 'repository:@1',
    status: 'idle',
  })
  return paneId
}

function createRepositoryFixtureTeam(modules, name, options = {}) {
  modules.state.deleteTeamState(name)
  const team = modules.state.createInitialTeamState({
    teamName: options.rawName || name,
    storageName: name,
    leaderSessionFile: `/tmp/${name}-leader.jsonl`,
    leaderCwd: options.leaderCwd || `/tmp/repository-v047/${name}`,
    description: 'v0.4.7 repository seam characterization fixture',
  })
  const livePaneIds = []
  for (let index = 0; index < (options.workerCount ?? 2); index += 1) {
    livePaneIds.push(addWorker(modules, team, `worker-${index + 1}`, index + 1))
  }
  const tasks = []
  for (let index = 0; index < (options.taskCount ?? 3); index += 1) {
    const task = modules.state.createTask(team, {
      title: `Repository seam task ${index + 1}`,
      description: `Repository seam fixture task ${index + 1}`,
      owner: index % 2 === 0 ? 'worker-1' : undefined,
    })
    task.updatedAt = 1700000500000 + index
    if (index === 1) {
      task.status = 'blocked'
      task.blockedBy.push('repository seam decision')
    }
    tasks.push(task)
  }
  const report = modules.state.appendTaskReport(team, {
    taskId: tasks[0].id,
    type: 'report_done',
    author: 'worker-1',
    text: `${V047_REPORT_BODY_SENTINEL} full TaskReport body should stay behind report boundary`,
    summary: 'Repository seam compact report summary',
    createdAt: 1700000600000,
    threadId: `task:${tasks[0].id}`,
    reporterIsOwner: true,
    statusAtReport: 'open',
    ownerAtReport: 'worker-1',
  })
  modules.state.appendTaskEvent(team, {
    taskId: tasks[0].id,
    type: 'report_submitted',
    by: 'worker-1',
    at: 1700000600001,
    summary: 'Repository seam compact report activity',
    reportId: report.id,
  })
  modules.state.appendTaskMessageRef(team, {
    taskId: tasks[0].id,
    mailboxMessageId: `${name}-message-ref`,
    from: 'team-lead',
    to: 'worker-1',
    type: 'assignment',
    createdAt: 1700000600002,
    summary: 'Repository seam compact task message ref',
  })
  modules.state.writeTeamState(team)
  const mailboxMessage = modules.state.pushMailboxMessage(name, 'team-lead', {
    id: `${name}-mailbox-v047`,
    from: 'worker-1',
    to: 'team-lead',
    type: 'report_done',
    priority: 'high',
    taskId: tasks[0].id,
    threadId: `task:${tasks[0].id}`,
    summary: 'Repository seam compact mailbox summary',
    text: `${V047_MAILBOX_BODY_SENTINEL} full mailbox body should stay behind receive boundary`,
    metadata: { reportId: report.id },
    createdAt: 1700000600003,
  })
  modules.runtimePanes.invalidatePaneReconcileCache(name)
  return { team, tasks, report, mailboxMessage, livePaneIds }
}

function sourceIncludesAny(source, needles) {
  return needles.some(needle => source.includes(needle))
}

function requireAnyExport(module, names) {
  return names.find(name => typeof module[name] === 'function' || typeof module[name] === 'object')
}

function assertNoBodySentinel(label, value) {
  const json = JSON.stringify(value)
  assert.equal(json.includes(V047_MAILBOX_BODY_SENTINEL), false, `${label} should not expose full mailbox body sentinel`)
  assert.equal(json.includes(V047_REPORT_BODY_SENTINEL), false, `${label} should not expose full report body sentinel`)
}

function assertCompactPanelData(data) {
  assert.equal(JSON.stringify(data).includes(V047_MAILBOX_BODY_SENTINEL), false, 'GREEN v0.4.5 compact PanelData should not include mailbox body sentinel')
  assert.equal(JSON.stringify(data).includes(V047_REPORT_BODY_SENTINEL), false, 'GREEN v0.4.5 compact PanelData should not include report body sentinel')
  if (data.mode === 'attached') {
    assert.equal(data.mailbox.some(item => Object.prototype.hasOwnProperty.call(item, 'text')), false, 'GREEN attached mailbox projection should omit text')
    assert.equal(Object.prototype.hasOwnProperty.call(data.team, 'taskReports'), false, 'GREEN attached panel team should omit raw taskReports')
    assert.equal(Object.prototype.hasOwnProperty.call(data.team, 'taskEvents'), false, 'GREEN attached panel team should omit raw taskEvents')
    assert.equal(Object.prototype.hasOwnProperty.call(data.team, 'taskMessageRefs'), false, 'GREEN attached panel team should omit raw taskMessageRefs')
  } else {
    assert.equal(data.teams.some(team => Object.prototype.hasOwnProperty.call(team, 'taskReports')), false, 'GREEN global teams should omit raw taskReports')
    assert.equal(Object.values(data.teamMailboxes).some(mailbox => mailbox.latestAttention && Object.prototype.hasOwnProperty.call(mailbox.latestAttention, 'text')), false, 'GREEN global latestAttention should omit text')
  }
}

function expectedRepositoryExports() {
  return [
    'createStateRepository',
    'createRuntimeRepository',
    'fileBackedStateRepository',
    'fileBackedRuntimeRepository',
  ]
}

function expectedStateRepositoryMethods() {
  return [
    'readTeamPanelModel',
    'readLeaderMailboxProjection',
    'readTaskReportSummary',
    'writeTeamMutation',
  ]
}

function expectedRuntimeRepositoryMethods() {
  return [
    'withRuntimeSnapshot',
    'listAgentTeamPanes',
    'reconcileTeamPanes',
  ]
}

module.exports = {
  name: 'StateRepository / RuntimeRepository v0.4.7 RED characterization',
  async run(env) {
    const { modules, helpers } = env
    const failures = []
    const panelDataSourceSource = helpers.readSource('teamPanel/dataSource.ts')
    const readModelSource = helpers.readSource('teamPanel/readModel.ts')
    const teamServiceSource = helpers.readSource('tools/teamService.ts')
    const appPortsSource = helpers.readSource('app/ports.ts')
    const appStatePortsSource = helpers.readSource('adapters/runtime/appStatePorts.ts')
    const mailboxPortsSource = helpers.readSource('adapters/runtime/mailboxPorts.ts')
    const fsStoreSource = helpers.readSource('state/fsStore.ts')
    const coreProfilingSource = helpers.readSource('core/profiling.ts')
    const tmuxClient = helpers.requireDist('tmux/client.js')
    const profiling = helpers.requireDist('runtime/profiling.js')

    const repositoryModules = [
      'state/repository.js',
      'state/stateRepository.js',
      'state/panelRepository.js',
      'runtime/repository.js',
      'runtime/runtimeRepository.js',
      'adapters/runtime/repositories.js',
    ].map(rel => {
      try {
        return { rel, module: helpers.requireDist(rel) }
      } catch {
        return { rel, module: null }
      }
    })
    const exportedRepositoryFactory = repositoryModules
      .filter(item => item.module)
      .map(item => `${item.rel}:${requireAnyExport(item.module, expectedRepositoryExports()) || '-'}`)
      .find(item => !item.endsWith(':-'))
    if (!exportedRepositoryFactory) {
      failures.push(`StateRepository/RuntimeRepository factory should exist with one of exports ${expectedRepositoryExports().join(', ')}`)
    }

    const stateRepositoryShape = repositoryModules
      .map(item => item.module)
      .filter(Boolean)
      .map(module => requireAnyExport(module, expectedStateRepositoryMethods()))
      .find(Boolean)
    if (!stateRepositoryShape) {
      failures.push(`StateRepository should expose injectable read/write seam methods: ${expectedStateRepositoryMethods().join(', ')}`)
    }

    const runtimeRepositoryShape = repositoryModules
      .map(item => item.module)
      .filter(Boolean)
      .map(module => requireAnyExport(module, expectedRuntimeRepositoryMethods()))
      .find(Boolean)
    if (!runtimeRepositoryShape) {
      failures.push(`RuntimeRepository should expose injectable runtime snapshot seam methods: ${expectedRuntimeRepositoryMethods().join(', ')}`)
    }

    if (sourceIncludesAny(panelDataSourceSource, [
      "../state/mailboxStore.js",
      "../state/teamStore.js",
      "../state/outboxStore.js",
      "../state/outboxDiagnosticsStore.js",
      "../adapters/tmux/index.js",
      "../adapters/runtime/session.js",
    ])) {
      failures.push('teamPanel/dataSource.ts should depend on repository ports instead of concrete state stores/tmux/runtime adapters')
    }
    if (sourceIncludesAny(readModelSource, ["../state/taskHistoryReadModel.js", '../runtime/profiling.js'])) {
      failures.push('teamPanel/readModel.ts should receive compact history/profiling through repository/read-model services instead of importing state/profiling directly')
    }
    if (sourceIncludesAny(teamServiceSource, ["../state/teamStore.js", "../state/sessionBinding.js", "../adapters/tmux/index.js"])) {
      failures.push('tools/teamService.ts should use StateRepository/RuntimeRepository seams instead of direct team/session/tmux stores')
    }
    if (sourceIncludesAny(appStatePortsSource, ["../../state/teamStore.js", "../../state/taskHistory.js", "../../state/taskHistoryReadModel.js", "../../state/taskStore.js"])) {
      failures.push('adapters/runtime/appStatePorts.ts should be a repository adapter boundary, not expose scattered concrete store imports to hot paths')
    }
    if (sourceIncludesAny(mailboxPortsSource, ["../../state/mailboxStore.js"])) {
      failures.push('adapters/runtime/mailboxPorts.ts should be folded into a unified StateRepository seam for mailbox projections/read boundaries')
    }

    const missingPortNames = expectedStateRepositoryMethods().filter(name => !appPortsSource.includes(name))
    if (missingPortNames.length > 0) {
      failures.push(`app/ports.ts should define repository-level methods missing today: ${missingPortNames.join(', ')}`)
    }
    const missingRuntimePortNames = expectedRuntimeRepositoryMethods().filter(name => !appPortsSource.includes(name))
    if (missingRuntimePortNames.length > 0) {
      failures.push(`app/ports.ts should define RuntimeRepository port methods missing today: ${missingRuntimePortNames.join(', ')}`)
    }

    if (!coreProfilingSource.includes('caller') || !coreProfilingSource.includes('category')) {
      failures.push('profiling core should support caller/category dimensions for state/runtime hot-path comparison')
    }
    if (!fsStoreSource.includes('caller') || !fsStoreSource.includes('category')) {
      failures.push('fsStore profiling should record caller/category, not only path/op/duration')
    }

    await withTempHome(modules, 'fixture', async () => {
      const attached = createRepositoryFixtureTeam(modules, 'repository-v047-attached', { workerCount: 4, taskCount: 5 })
      const global = createRepositoryFixtureTeam(modules, 'repository-v047-global', { workerCount: 2, taskCount: 2 })
      const livePaneIds = new Set([...attached.livePaneIds, ...global.livePaneIds])
      await withTmuxClient(tmuxClient, createCountingTmuxClient(livePaneIds, ['%repository-v047-orphan']), async () => {
        const attachedData = modules.panelDataSource.loadPanelData(attached.team.name)
        assert.equal(attachedData.mode, 'attached', 'GREEN attached panel fixture should load attached data')
        assertCompactPanelData(attachedData)
        const panelState = modules.viewModel.createInitialPanelState()
        modules.viewModel.clampPanelStateToData(panelState, attachedData)
        const rendered = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), {
          width: 160,
          height: 44,
          data: attachedData,
          state: panelState,
          selection: modules.viewModel.buildPanelSelectionView(attachedData, panelState),
        })
        assertNoBodySentinel('GREEN render output', rendered)

        const globalFakeClient = createCountingTmuxClient(livePaneIds, ['%repository-v047-orphan-global'])
        await withTmuxClient(tmuxClient, globalFakeClient, async () => {
          const globalData = modules.panelDataSource.loadPanelData(null)
          assert.equal(globalData.mode, 'global', 'GREEN global panel fixture should load global data')
          assertCompactPanelData(globalData)
          assert.ok(globalData.orphanPanes.some(pane => pane.paneId === '%repository-v047-orphan-global'), 'GREEN v0.4.3 global panel should retain orphan pane discovery')
        })
        assert.equal(countCommand(globalFakeClient.calls, 'display-message'), 0, 'GREEN v0.4.3 global panel load should not use per-pane display-message')
        assert.ok(countCommand(globalFakeClient.calls, 'list-panes') <= 1, 'GREEN v0.4.3 global panel load should use at most one list-panes snapshot')
      })

      withProfileEnv('1', () => {
        profiling.resetProfiling()
        const data = modules.panelDataSource.loadPanelData(attached.team.name)
        assert.equal(data.mode, 'attached', 'GREEN profiling fixture should load attached panel data')
        const summary = profiling.readProfilingSummary()
        assert.ok(summary.panel.dataLoadCount >= 1, 'GREEN v0.4.5 panel profiling should record dataLoad')
        assert.ok(summary.panel.readModelBuildCount >= 1, 'GREEN v0.4.5 panel profiling should record readModelBuild')
        assertNoBodySentinel('GREEN profiling summary', summary)
        const fsEvent = summary.fsStore.events.find(event => event.kind === 'read' || event.kind === 'write')
        if (!fsEvent || !('caller' in fsEvent) || !('category' in fsEvent)) {
          failures.push(`profiling fsStore events should include caller/category for repository hot-path attribution; got ${JSON.stringify(fsEvent ?? null)}`)
        }
        const panelEvent = summary.panel.events.find(event => event.kind === 'dataLoad')
        if (!panelEvent || !('caller' in panelEvent) || !('category' in panelEvent)) {
          failures.push(`panel profiling events should include caller/category for panel/task/message/report hot-path attribution; got ${JSON.stringify(panelEvent ?? null)}`)
        }
        for (const key of ['stateReadCount', 'stateWriteCount', 'mailboxProjectionReadCount', 'teamStateReadCount']) {
          if (typeof summary.panel[key] !== 'number' && typeof summary.fsStore[key] !== 'number') {
            failures.push(`profiling summary should expose repository counter ${key}`)
          }
        }
      })
    })

    assert.equal(failures.length, 0, failures.join('\n'))
  },
}
