const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const bench = require('../bench/team-panel-tmux-refresh-v0415.cjs')

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-panel-tmux-bench-contract-${name}-`))
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

function samplePanelSummary() {
  return {
    panel: {
      dataLoadCount: 2,
      readModelBuildCount: 2,
      renderCount: 2,
      requestRenderCount: 1,
      cacheHitCount: 1,
      diffChangedCount: 1,
      events: [
        { kind: 'dataLoad', mode: 'attached', durationMs: 10 },
        { kind: 'dataLoad', mode: 'attached', durationMs: 12 },
        { kind: 'render', mode: 'attached', durationMs: 4 },
        { kind: 'render', mode: 'attached', durationMs: 6 },
        { kind: 'requestRender', mode: 'attached', durationMs: 1 },
        { kind: 'cacheHit', mode: 'attached', durationMs: 0 },
        { kind: 'diffChanged', mode: 'attached', durationMs: 0 },
      ],
    },
    tmux: {
      commandCount: 3,
      totalDurationMs: 7,
      successCount: 2,
      failureCount: 1,
      commandNames: ['list-panes', 'display-message'],
    },
  }
}

function assertScenarioShape(label, scenario) {
  assert.ok(scenario, `${label} section should exist`)
  assert.equal(typeof scenario.panel.dataLoadMs.p50, 'number', `${label} should expose panel dataLoad p50`)
  assert.equal(typeof scenario.panel.dataLoadMs.p95, 'number', `${label} should expose panel dataLoad p95`)
  assert.equal(typeof scenario.panel.renderMs.p50, 'number', `${label} should expose panel render p50`)
  assert.equal(typeof scenario.panel.renderMs.p95, 'number', `${label} should expose panel render p95`)
  assert.equal(typeof scenario.tmux.commandCount, 'number', `${label} should expose tmux command count`)
  assert.equal(typeof scenario.tmux.totalDurationMs, 'number', `${label} should expose tmux total duration`)
  assert.equal(typeof scenario.tmux.successCount, 'number', `${label} should expose tmux success count`)
  assert.equal(typeof scenario.tmux.failureCount, 'number', `${label} should expose tmux failure count`)
  assert.equal(typeof scenario.requestRenderCount, 'number', `${label} should expose requestRender count`)
  assert.equal(typeof scenario.cacheHitCount, 'number', `${label} should expose cacheHit count`)
  assert.equal(typeof scenario.diffChangedCount, 'number', `${label} should expose diffChanged count`)
}

module.exports = {
  name: 'team panel/tmux refresh bench v0.4.15 contract',
  async run(env) {
    assert.equal(typeof bench.runPanelTmuxBenchWithModules, 'function', 'panel/tmux bench should export runPanelTmuxBenchWithModules')
    assert.equal(typeof bench.buildBenchResult, 'function', 'panel/tmux bench should export buildBenchResult')
    assert.equal(typeof bench.buildKernelMetadata, 'function', 'panel/tmux bench should export buildKernelMetadata')
    assert.equal(typeof bench.summarizePanel, 'function', 'panel/tmux bench should export summarizePanel')
    assert.equal(typeof bench.summarizeTmux, 'function', 'panel/tmux bench should export summarizeTmux')
    assert.equal(typeof bench.fixtureForProfile, 'function', 'panel/tmux bench should export fixtureForProfile')
    assert.equal(typeof bench.resolveFixtureProfileName, 'function', 'panel/tmux bench should export resolveFixtureProfileName')

    const sampleProfile = samplePanelSummary()
    const panel = bench.summarizePanel(sampleProfile)
    assert.equal(panel.dataLoadMs.p50, 10)
    assert.equal(panel.dataLoadMs.p95, 12)
    assert.equal(panel.renderMs.p50, 4)
    assert.equal(panel.renderMs.p95, 6)
    assert.equal(panel.requestRenderCount, 1)
    assert.equal(panel.cacheHitCount, 1)
    assert.equal(panel.diffChangedCount, 1)
    const tmux = bench.summarizeTmux(sampleProfile, { calls: [['list-panes'], ['display-message']] })
    assert.equal(tmux.commandCount, 3)
    assert.equal(tmux.stubCallCount, 2)

    const sample = bench.buildBenchResult({
      fixture: {
        fixture: bench.mergeFixtureOptions({ iterations: 2, warmupIterations: 1 }),
      },
      attached: {
        panel,
        tmux,
        requestRenderCount: 1,
        customPanelCount: 1,
        doneCallCount: 0,
      },
      global: {
        panel,
        tmux,
        requestRenderCount: 1,
        customPanelCount: 1,
        doneCallCount: 0,
      },
    })
    assert.equal(sample.note, 'baseline only; not a release target pass/fail gate')
    assert.equal(sample.implementation, 'typescript')
    const expectedKernel = bench.buildKernelMetadata().kernel
    assert.equal(expectedKernel.mode, 'typescript')
    assert.equal(expectedKernel.enabled, false)
    assert.equal(expectedKernel.calls, 0)
    assert.equal(expectedKernel.fallbacks, 0)
    assert.equal(expectedKernel.requestedKnownKernel, true)
    assert.deepEqual(sample.kernel, expectedKernel)
    assert.deepEqual(sample.fixtureProfile, { name: 'baseline', stress: false })
    assertScenarioShape('sample attached', sample.attached)
    assertScenarioShape('sample global', sample.global)
    assert.equal(JSON.stringify(sample).includes(bench.BENCH_SENTINEL), false, 'sample bench output should not leak full body sentinel')
    assert.equal(bench.resolveFixtureProfileName('stress'), 'stress')
    assert.equal(bench.resolveFixtureProfileName('unknown-fixture'), 'baseline')
    const stressFixture = bench.fixtureForProfile('stress')
    assert.ok(stressFixture.attached.taskCount > bench.DEFAULT_FIXTURE.attached.taskCount, 'stress fixture should increase attached task count')
    assert.ok(stressFixture.global.teamCount > bench.DEFAULT_FIXTURE.global.teamCount, 'stress fixture should increase global team count')

    await withTempHome(env.modules, 'tiny', async () => {
      const result = await bench.runPanelTmuxBenchWithModules({
        modules: env.modules,
        profiling: env.helpers.requireDist('runtime/profiling.js'),
        panelModule: env.helpers.requireDist('teamPanel.js'),
        tmuxClient: env.helpers.requireDist('tmux/client.js'),
        options: {
          warmupIterations: 1,
          iterations: 1,
          attached: { workerCount: 1, taskCount: 2, mailboxCount: 3 },
          global: { teamCount: 2, workerCount: 1, taskCount: 2, mailboxCount: 3 },
        },
      })
      assert.equal(result.iterations.measured, 1)
      assert.equal(result.fixture.attached.workers, 1)
      assert.equal(result.fixture.global.teams, 2)
      assert.equal(result.implementation, 'typescript')
      assert.equal(result.kernel.enabled, false)
      assert.equal(result.kernel.calls, 0)
      assert.equal(result.kernel.fallbacks, 0)
      assert.deepEqual(result.fixtureProfile, { name: 'baseline', stress: false })
      assertScenarioShape('tiny attached', result.attached)
      assertScenarioShape('tiny global', result.global)
      assert.ok(result.attached.panel.events.render >= 1, 'tiny bench should record attached render events')
      assert.ok(result.global.panel.events.render >= 1, 'tiny bench should record global render events')
      assert.ok(result.attached.panel.events.cacheHit >= 1, 'tiny attached bench should record cacheHit metrics')
      assert.ok(result.global.panel.events.cacheHit >= 1, 'tiny global bench should record cacheHit metrics')
      assert.equal(result.attached.doneCallCount, 0, 'tiny attached sync action should remain in-place')
      assert.equal(result.global.doneCallCount, 0, 'tiny global refresh action should remain in-place')
      assert.equal(JSON.stringify(result).includes(bench.BENCH_SENTINEL), false, 'tiny bench output should not leak full body sentinel')
    })
  },
}
