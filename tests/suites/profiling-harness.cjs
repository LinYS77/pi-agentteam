const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

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

async function withProfileEnvAsync(value, fn) {
  const previous = process.env.PI_AGENTTEAM_PROFILE
  try {
    if (value === undefined) delete process.env.PI_AGENTTEAM_PROFILE
    else process.env.PI_AGENTTEAM_PROFILE = value
    return await fn()
  } finally {
    if (previous === undefined) delete process.env.PI_AGENTTEAM_PROFILE
    else process.env.PI_AGENTTEAM_PROFILE = previous
  }
}

function requireProfiling(helpers) {
  try {
    return helpers.requireDist('runtime/profiling.js')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    assert.fail(`Expected runtime/profiling.js profiling harness module exporting isProfilingEnabled/resetProfiling/readProfilingSummary/recordTmuxCommand; ${message}`)
  }
}

function assertNumber(value, label) {
  assert.equal(typeof value, 'number', `${label} should be a number`)
  assert.equal(Number.isFinite(value), true, `${label} should be finite`)
}

function metricOrEventCount(section, metricNames, eventKind) {
  for (const name of metricNames) {
    const value = section?.[name]
    if (typeof value === 'number') return value
  }
  if (Array.isArray(section?.events)) {
    return section.events.filter(event => event?.kind === eventKind || event?.type === eventKind).length
  }
  return 0
}

function durationOrEventTotal(section, metricNames) {
  for (const name of metricNames) {
    const value = section?.[name]
    if (typeof value === 'number') return value
  }
  if (Array.isArray(section?.events)) {
    return section.events.reduce((sum, event) => sum + (typeof event?.durationMs === 'number' ? event.durationMs : 0), 0)
  }
  return 0
}

function assertFsEventShape(event, expectedKind, timingField) {
  assert.ok(event, `fsStore should record ${expectedKind} event`)
  assert.equal(event.kind, expectedKind, `${expectedKind} event should keep kind`)
  assert.equal(event.operation, expectedKind, `${expectedKind} event should expose operation`)
  assertNumber(event.durationMs, `${expectedKind} durationMs`)
  assertNumber(event[timingField], `${expectedKind} ${timingField}`)
  assert.equal(typeof event.callSite, 'string', `${expectedKind} event should include callSite`)
  assert.ok(event.callSite.length > 0, `${expectedKind} callSite should be non-empty`)
  assert.equal(typeof event.category, 'string', `${expectedKind} event should include category`)
  assert.equal(typeof event.caller, 'string', `${expectedKind} event should include caller`)
  assert.equal(JSON.stringify(event).includes('enabled'), false, `${expectedKind} event should not include JSON body content`)
}

function assertFsSummaryRecorded(summary) {
  assert.ok(summary.fsStore, 'profiling summary should include fsStore section')
  assert.ok(metricOrEventCount(summary.fsStore, ['readCount', 'reads'], 'read') >= 1, `fsStore should record reads: ${JSON.stringify(summary.fsStore)}`)
  assert.ok(metricOrEventCount(summary.fsStore, ['writeCount', 'writes'], 'write') >= 1, `fsStore should record writes: ${JSON.stringify(summary.fsStore)}`)
  assert.ok(metricOrEventCount(summary.fsStore, ['parseCount', 'parses'], 'parse') >= 1, `fsStore should record JSON parses: ${JSON.stringify(summary.fsStore)}`)
  assert.ok(metricOrEventCount(summary.fsStore, ['lockCount', 'locks'], 'lock') >= 1, `fsStore should record file locks: ${JSON.stringify(summary.fsStore)}`)
  assert.ok(durationOrEventTotal(summary.fsStore, ['totalReadMs', 'readMs']) >= 0, 'fsStore read duration should be queryable')
  assert.ok(durationOrEventTotal(summary.fsStore, ['totalWriteMs', 'writeMs']) >= 0, 'fsStore write duration should be queryable')
  assert.ok((summary.fsStore.bytesRead ?? summary.fsStore.readBytes ?? 0) > 0, `fsStore should record read bytes: ${JSON.stringify(summary.fsStore)}`)
  assert.ok((summary.fsStore.bytesWritten ?? summary.fsStore.writeBytes ?? 0) > 0, `fsStore should record written bytes: ${JSON.stringify(summary.fsStore)}`)
  assertFsEventShape(summary.fsStore.events.find(event => event.kind === 'lock'), 'lock', 'lockWaitMs')
  assertFsEventShape(summary.fsStore.events.find(event => event.kind === 'read'), 'read', 'readMs')
  assertFsEventShape(summary.fsStore.events.find(event => event.kind === 'parse'), 'parse', 'parseMs')
  assertFsEventShape(summary.fsStore.events.find(event => event.kind === 'write'), 'write', 'writeMs')
  for (const event of summary.fsStore.events.filter(item => item.kind === 'read' || item.kind === 'parse' || item.kind === 'write')) {
    assertNumber(event.bytes, `${event.kind} bytes`)
    assert.ok(event.bytes > 0, `${event.kind} bytes should be positive`)
  }
}

function assertTmuxSummaryRecorded(summary) {
  assert.ok(summary.tmux, 'profiling summary should include tmux section')
  assert.ok(metricOrEventCount(summary.tmux, ['commandCount', 'commands'], 'command') >= 2, `tmux should record command count: ${JSON.stringify(summary.tmux)}`)
  assert.ok((summary.tmux.successCount ?? summary.tmux.successes ?? 0) >= 1, `tmux should record successes: ${JSON.stringify(summary.tmux)}`)
  assert.ok((summary.tmux.failureCount ?? summary.tmux.failures ?? 0) >= 1, `tmux should record failures: ${JSON.stringify(summary.tmux)}`)
  assert.ok(durationOrEventTotal(summary.tmux, ['totalDurationMs', 'durationMs']) >= 10, `tmux should record duration totals: ${JSON.stringify(summary.tmux)}`)
  const commandNames = JSON.stringify(summary.tmux)
  assert.ok(commandNames.includes('display-message'), `tmux summary should retain command names: ${commandNames}`)
  assert.ok(commandNames.includes('list-panes'), `tmux summary should retain command names: ${commandNames}`)
}

function createFakeTmuxClient() {
  const calls = []
  return {
    calls,
    exec(args, input) {
      calls.push({ method: 'exec', args: [...args], input })
      return `sync:${args[0]}`
    },
    execNoThrow(args, input) {
      calls.push({ method: 'execNoThrow', args: [...args], input })
      return { ok: false, stdout: '', stderr: `sync failure:${args[0]}` }
    },
    async execAsync(args, input, signal) {
      calls.push({ method: 'execAsync', args: [...args], input, signal })
      return `async:${args[0]}`
    },
    async execNoThrowAsync(args, input, signal) {
      calls.push({ method: 'execNoThrowAsync', args: [...args], input, signal })
      return { ok: false, stdout: '', stderr: `async failure:${args[0]}` }
    },
  }
}

function assertTmuxWrapperSummaryRecorded(summary) {
  assert.ok(summary.tmux, 'profiling summary should include tmux section')
  assert.equal(metricOrEventCount(summary.tmux, ['commandCount', 'commands'], 'command'), 4, `tmux wrappers should record all four wrapper calls: ${JSON.stringify(summary.tmux)}`)
  assert.equal(summary.tmux.successCount ?? summary.tmux.successes, 2, `tmux wrappers should record sync+async successes: ${JSON.stringify(summary.tmux)}`)
  assert.equal(summary.tmux.failureCount ?? summary.tmux.failures, 2, `tmux wrappers should record sync+async failures: ${JSON.stringify(summary.tmux)}`)
  assertNumber(summary.tmux.totalDurationMs ?? summary.tmux.durationMs, 'tmux wrapper duration total')
  const commandNames = JSON.stringify(summary.tmux)
  for (const command of ['display-message', 'list-panes', 'display-message-async', 'list-panes-async']) {
    assert.ok(commandNames.includes(command), `tmux wrapper summary should retain command ${command}: ${commandNames}`)
  }
}

function assertPanelSummaryEmpty(summary) {
  assert.ok(summary.panel, 'profiling summary should include panel section')
  assert.equal(summary.panel.dataLoadCount, 0, 'disabled/no-op panel profiling should not record data loads')
  assert.equal(summary.panel.readModelBuildCount, 0, 'disabled/no-op panel profiling should not record read-model builds')
  assert.equal(Array.isArray(summary.panel.events), true, 'panel profiling should expose cloned events array')
  assert.equal(summary.panel.events.length, 0, 'disabled/no-op panel profiling should not record panel events')
}

function assertPanelSummaryRecorded(summary) {
  assert.ok(summary.panel, 'profiling summary should include panel section')
  assert.ok(summary.panel.dataLoadCount >= 1, `panel should record data load count: ${JSON.stringify(summary.panel)}`)
  assert.ok(summary.panel.readModelBuildCount >= 1, `panel should record read-model build count: ${JSON.stringify(summary.panel)}`)
  assert.ok(summary.panel.totalDataLoadMs >= 0, 'panel data load duration should be queryable')
  assert.ok(summary.panel.totalReadModelBuildMs >= 0, 'panel read-model build duration should be queryable')
  assert.equal(summary.panel.lastMode, 'attached', `panel lastMode should reflect attached panel load: ${JSON.stringify(summary.panel)}`)
  assert.ok(summary.panel.byMode.attached.dataLoadCount >= 1, `panel attached mode should count data loads: ${JSON.stringify(summary.panel.byMode)}`)
  assert.ok(summary.panel.byMode.attached.readModelBuildCount >= 1, `panel attached mode should count read-model builds: ${JSON.stringify(summary.panel.byMode)}`)
  assert.ok(summary.panel.lastCounts.teamCount >= 1, `panel should record team counts: ${JSON.stringify(summary.panel.lastCounts)}`)
  assert.ok(summary.panel.lastCounts.taskCount >= 1, `panel should record task counts: ${JSON.stringify(summary.panel.lastCounts)}`)
  assert.ok(summary.panel.lastCounts.memberCount >= 1, `panel should record member counts: ${JSON.stringify(summary.panel.lastCounts)}`)
  assert.ok(summary.panel.lastCounts.mailboxProjectionCount >= 1, `panel should record mailbox projection counts: ${JSON.stringify(summary.panel.lastCounts)}`)
  assert.equal(JSON.stringify(summary).includes('PROFILE_FULL_BODY_SENTINEL'), false, 'profiling summary must not include full mailbox/report body sentinels')
}

function assertFsSummaryCloneIsImmutable(profiling, summary) {
  const beforeEvents = summary.fsStore.events.length
  summary.fsStore.events.push({ kind: 'read', operation: 'read', durationMs: 999, readMs: 999, callSite: 'mutated' })
  summary.fsStore.readCount = 999
  const next = profiling.readProfilingSummary()
  assert.equal(next.fsStore.events.length, beforeEvents, 'fsStore profiling events should be cloned from internal state')
  assert.notEqual(next.fsStore.readCount, 999, 'fsStore summary counters should be cloned from internal state')
}

function assertPanelSummaryCloneIsImmutable(profiling, summary) {
  const beforeEvents = summary.panel.events.length
  summary.panel.events.push({ kind: 'dataLoad', mode: 'attached', durationMs: 999, teamCount: 999 })
  summary.panel.byMode.attached.dataLoadCount = 999
  summary.panel.lastCounts.teamCount = 999
  const next = profiling.readProfilingSummary()
  assert.equal(next.panel.events.length, beforeEvents, 'panel profiling events should be cloned from internal state')
  assert.notEqual(next.panel.byMode.attached.dataLoadCount, 999, 'panel byMode summary should be cloned from internal state')
  assert.notEqual(next.panel.lastCounts.teamCount, 999, 'panel lastCounts should be cloned from internal state')
}

function createPanelProfileTeam(modules) {
  const teamName = 'profiling-panel-suite'
  modules.state.deleteTeamState(teamName)
  const team = modules.state.createInitialTeamState({
    teamName,
    leaderSessionFile: '/tmp/profiling-panel-suite-leader.jsonl',
    leaderCwd: '/tmp/profiling-panel-suite',
  })
  modules.state.upsertMember(team, {
    name: 'profile-worker',
    role: 'implementer',
    cwd: '/tmp/profiling-panel-suite',
    sessionFile: '/tmp/profiling-panel-suite-worker.jsonl',
    paneId: '%profiling-panel-suite-worker',
    windowTarget: 'profiling:@1',
    status: 'idle',
  })
  const task = modules.state.createTask(team, {
    title: 'Panel profiling task',
    description: 'Characterize panel/read-model profiling metrics',
    owner: 'profile-worker',
  })
  modules.state.appendTaskReport(team, {
    taskId: task.id,
    type: 'report_done',
    author: 'profile-worker',
    text: 'PROFILE_FULL_BODY_SENTINEL report body should stay out of profiling metrics',
    summary: 'Panel profiling compact report summary',
    reporterIsOwner: true,
    statusAtReport: 'open',
    ownerAtReport: 'profile-worker',
  })
  modules.state.writeTeamState(team)
  modules.state.pushMailboxMessage(teamName, 'team-lead', {
    from: 'profile-worker',
    to: 'team-lead',
    type: 'report_done',
    taskId: task.id,
    summary: 'Panel profiling compact mailbox summary',
    text: 'PROFILE_FULL_BODY_SENTINEL mailbox body should stay out of profiling metrics',
  })
  modules.runtimePanes.invalidatePaneReconcileCache(teamName)
  return teamName
}

async function exerciseTmuxClientWrappers(tmuxClient) {
  assert.equal(tmuxClient.runTmux(['display-message', '-p', '#D']), 'sync:display-message')
  assert.deepEqual(tmuxClient.runTmuxNoThrow(['list-panes', '-a']), { ok: false, stdout: '', stderr: 'sync failure:list-panes' })
  assert.equal(await tmuxClient.runTmuxAsync(['display-message-async', '-p', '#D']), 'async:display-message-async')
  assert.deepEqual(await tmuxClient.runTmuxNoThrowAsync(['list-panes-async', '-a']), { ok: false, stdout: '', stderr: 'async failure:list-panes-async' })
}

module.exports = {
  name: 'profiling harness',
  async run(env) {
    const profiling = requireProfiling(env.helpers)
    for (const name of ['isProfilingEnabled', 'resetProfiling', 'readProfilingSummary', 'recordTmuxCommand']) {
      assert.equal(typeof profiling[name], 'function', `profiling.${name} should be exported`)
    }

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-profiling-harness-'))
    try {
      const jsonPath = path.join(tmp, 'profiled-store.json')
      const panelTeamName = createPanelProfileTeam(env.modules)

      withProfileEnv(undefined, () => {
        profiling.resetProfiling()
        assert.equal(profiling.isProfilingEnabled(), false, 'profiling should be disabled unless PI_AGENTTEAM_PROFILE=1')
        env.modules.state.writeJsonFile(jsonPath, { mode: 'default-off', value: 1 })
        assert.deepEqual(env.modules.state.readJsonFile(jsonPath), { mode: 'default-off', value: 1 }, 'fsStore behavior should be unchanged when profiling is disabled')
        const summary = profiling.readProfilingSummary()
        assert.equal(summary.enabled, false, 'summary should expose disabled state')
        assert.equal(metricOrEventCount(summary.fsStore, ['readCount', 'reads'], 'read'), 0, 'disabled profiling should not record fsStore reads')
        assert.equal(metricOrEventCount(summary.fsStore, ['writeCount', 'writes'], 'write'), 0, 'disabled profiling should not record fsStore writes')
        assert.equal(summary.fsStore.events.length, 0, 'disabled profiling should keep fsStore event count at 0')
        assert.equal(metricOrEventCount(summary.tmux, ['commandCount', 'commands'], 'command'), 0, 'disabled profiling should not record tmux commands')
        assertPanelSummaryEmpty(summary)
        env.modules.panelDataSource.loadPanelData(panelTeamName)
        assertPanelSummaryEmpty(profiling.readProfilingSummary())
      })

      withProfileEnv('1', () => {
        profiling.resetProfiling()
        assert.equal(profiling.isProfilingEnabled(), true, 'profiling should be enabled by PI_AGENTTEAM_PROFILE=1')
        env.modules.state.withFileLock(jsonPath, () => {
          env.modules.state.writeJsonFile(jsonPath, { mode: 'enabled', value: 2 })
          assert.deepEqual(env.modules.state.readJsonFile(jsonPath), { mode: 'enabled', value: 2 })
        })
        profiling.recordTmuxCommand({ command: 'display-message', args: ['-p', '#D'], durationMs: 7, ok: true })
        profiling.recordTmuxCommand({ command: 'list-panes', args: ['-a', '-F', '#{pane_id}'], durationMs: 3, ok: false, error: 'simulated tmux failure' })

        const summary = profiling.readProfilingSummary()
        assert.equal(summary.enabled, true, 'summary should expose enabled state')
        assertFsSummaryRecorded(summary)
        assertFsSummaryCloneIsImmutable(profiling, summary)
        assertTmuxSummaryRecorded(summary)
        assertPanelSummaryEmpty(summary)
      })

      const tmuxClient = env.helpers.requireDist('tmux/client.js')
      assert.equal(typeof tmuxClient.withTmuxClientForTests, 'function', 'tmux/client should expose withTmuxClientForTests(fakeClient, fn) so tests can exercise runTmux wrappers without real tmux')

      await withProfileEnvAsync(undefined, async () => {
        profiling.resetProfiling()
        await tmuxClient.withTmuxClientForTests(createFakeTmuxClient(), async () => {
          await exerciseTmuxClientWrappers(tmuxClient)
        })
        const summary = profiling.readProfilingSummary()
        assert.equal(summary.enabled, false)
        assert.equal(metricOrEventCount(summary.tmux, ['commandCount', 'commands'], 'command'), 0, 'disabled profiling should not record tmux wrapper calls')
      })

      await withProfileEnvAsync('1', async () => {
        profiling.resetProfiling()
        await tmuxClient.withTmuxClientForTests(createFakeTmuxClient(), async () => {
          await exerciseTmuxClientWrappers(tmuxClient)
        })
        const summary = profiling.readProfilingSummary()
        assert.equal(summary.enabled, true)
        assertTmuxWrapperSummaryRecorded(summary)
      })

      withProfileEnv('1', () => {
        profiling.resetProfiling()
        const data = env.modules.panelDataSource.loadPanelData(panelTeamName)
        assert.equal(data.mode, 'attached', 'panel profiling fixture should load attached panel data')
        const summary = profiling.readProfilingSummary()
        assert.equal(summary.enabled, true)
        assertPanelSummaryRecorded(summary)
        assertPanelSummaryCloneIsImmutable(profiling, summary)
      })
    } finally {
      env.modules.state.deleteTeamState('profiling-panel-suite')
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  },
}
