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

      withProfileEnv(undefined, () => {
        profiling.resetProfiling()
        assert.equal(profiling.isProfilingEnabled(), false, 'profiling should be disabled unless PI_AGENTTEAM_PROFILE=1')
        env.modules.state.writeJsonFile(jsonPath, { mode: 'default-off', value: 1 })
        assert.deepEqual(env.modules.state.readJsonFile(jsonPath), { mode: 'default-off', value: 1 }, 'fsStore behavior should be unchanged when profiling is disabled')
        const summary = profiling.readProfilingSummary()
        assert.equal(summary.enabled, false, 'summary should expose disabled state')
        assert.equal(metricOrEventCount(summary.fsStore, ['readCount', 'reads'], 'read'), 0, 'disabled profiling should not record fsStore reads')
        assert.equal(metricOrEventCount(summary.fsStore, ['writeCount', 'writes'], 'write'), 0, 'disabled profiling should not record fsStore writes')
        assert.equal(metricOrEventCount(summary.tmux, ['commandCount', 'commands'], 'command'), 0, 'disabled profiling should not record tmux commands')
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
        assertTmuxSummaryRecorded(summary)
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
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  },
}
