const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const bench = require('../bench/team-read-model-baseline.cjs')

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-bench-contract-${name}-`))
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

function sampleProfilingSummary() {
  return {
    fsStore: {
      lockCount: 1,
      readCount: 2,
      parseCount: 1,
      writeCount: 1,
      bytesRead: 320,
      bytesWritten: 160,
      events: [
        { kind: 'lock', operation: 'lock', durationMs: 1, lockWaitMs: 1, category: 'state:team', callSite: 'sample lock' },
        { kind: 'read', operation: 'read', durationMs: 2, readMs: 2, bytes: 120, category: 'state:team', callSite: 'sample read team' },
        { kind: 'read', operation: 'read', durationMs: 4, readMs: 4, bytes: 200, category: 'state:mailboxProjection', callSite: 'sample read mailbox' },
        { kind: 'parse', operation: 'parse', durationMs: 3, parseMs: 3, bytes: 120, category: 'state:team', callSite: 'sample parse' },
        { kind: 'write', operation: 'write', durationMs: 5, writeMs: 5, bytes: 160, category: 'state:team', callSite: 'sample write' },
      ],
    },
    panel: {
      events: [
        { kind: 'dataLoad', mode: 'attached', durationMs: 9 },
        { kind: 'dataLoad', mode: 'attached', durationMs: 12 },
        { kind: 'readModelBuild', mode: 'attached', durationMs: 3 },
      ],
      lastCounts: { teamCount: 1, taskCount: 100, memberCount: 4, mailboxProjectionCount: 500 },
    },
    tmux: { commandCount: 0, commandNames: [] },
  }
}

module.exports = {
  name: 'read-model microbench v0.4.14 contract',
  async run(env) {
    assert.equal(typeof bench.runBaselineWithModules, 'function', 'bench should export runBaselineWithModules')
    assert.equal(typeof bench.buildBaselineResult, 'function', 'bench should export buildBaselineResult')
    assert.equal(typeof bench.summarizeFsStore, 'function', 'bench should export summarizeFsStore')

    const sample = bench.buildBaselineResult({
      fixture: { workerCount: 3, taskCount: 100, mailboxCount: 500, warmupIterations: 1, iterations: 5 },
      durations: [10, 12, 14, 16, 18],
      profilingSummary: sampleProfilingSummary(),
      runtimeCalls: [['prepareTeamForPanel'], ['withRuntimeSnapshot']],
    })
    assert.equal(sample.note, 'baseline only; not a release target pass/fail gate')
    assert.deepEqual(sample.fixture, { leaders: 1, workers: 3, tasks: 100, mailboxItems: 500 })
    assert.equal(sample.iterations.warmup, 1)
    assert.equal(sample.iterations.measured, 5)
    assert.equal(sample.panel.iterations.p50, 14)
    assert.equal(sample.panel.iterations.p95, 18)
    assert.equal(sample.panel.dataLoadMs.p50, 9)
    assert.equal(sample.panel.readModelMs.p95, 3)
    assert.equal(sample.fsStore.byKind.lock.p95, 1)
    assert.equal(sample.fsStore.byKind.read.p95, 4)
    assert.equal(sample.fsStore.byKind.write.p95, 5)
    assert.equal(sample.fsStore.bytes.read, 320)
    assert.equal(sample.fsStore.bytes.written, 160)
    assert.ok(sample.fsStore.byCategory.some(item => item.category === 'state:team'), 'bench summary should include category breakdown')
    assert.ok(sample.fsStore.byCallSite.some(item => item.callSite === 'sample read team'), 'bench summary should include callSite breakdown')
    assert.equal(sample.tmux.stubCallCount, 2)
    assert.equal(JSON.stringify(sample).includes(bench.BENCH_SENTINEL), false, 'sample bench output must not leak sentinel')

    await withTempHome(env.modules, 'tiny-fixture', async () => {
      const result = bench.runBaselineWithModules({
        modules: env.modules,
        profiling: env.helpers.requireDist('runtime/profiling.js'),
        panelDataSource: env.modules.panelDataSource,
        stateRepository: env.helpers.requireDist('state/repository.js').createStateRepository(),
        options: { workerCount: 1, taskCount: 2, mailboxCount: 3, warmupIterations: 1, iterations: 1 },
      })
      assert.equal(result.fixture.leaders, 1)
      assert.equal(result.fixture.workers, 1)
      assert.equal(result.fixture.tasks, 2)
      assert.equal(result.fixture.mailboxItems, 3)
      assert.equal(result.iterations.measured, 1)
      assert.ok(result.panel.dataLoadMs.count >= 1, 'tiny bench should record panel dataLoad metrics')
      assert.ok(result.fsStore.eventCount > 0, 'tiny bench should record fsStore events')
      assert.ok(result.fsStore.byCategory.length > 0, 'tiny bench should include category breakdown')
      assert.equal(JSON.stringify(result).includes(bench.BENCH_SENTINEL), false, 'tiny bench output must not leak full body sentinel')
    })
  },
}
