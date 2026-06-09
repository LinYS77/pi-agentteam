const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function hasGoToolchain() {
  return spawnSync('go', ['version'], { encoding: 'utf8' }).status === 0
}

function buildGoHelper(extRoot) {
  const helperDir = path.join(extRoot, 'kernel', 'go', 'agentteam-kernel')
  const out = path.join(os.tmpdir(), `agentteam-kernel-${process.pid}-${Date.now()}`)
  const result = spawnSync('go', ['build', '-o', out, '.'], {
    cwd: helperDir,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, GO111MODULE: 'off' },
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'go build failed')
  return out
}

function fixtureRows() {
  return [
    '%pane-a\tsession:@1\tagentteam leader\tpi',
    '%pane-empty-label\tsession:@1\t\tbash',
    '%pane-empty-command\tsession:@1\tagentteam worker\t',
    'malformed-line-without-tabs',
    '\tsession:@1\tagentteam missing pane\tpi',
    '%pane-tab-extra\tsession:@3\tagentteam extra\tpython\textra-field-ignored',
    '%pane-a\tsession:@2\tagentteam duplicate last wins\tzsh',
    '',
  ].join('\n')
}

function compactSnapshot(snapshot) {
  return {
    capturedAt: snapshot.capturedAt,
    ok: snapshot.ok,
    panes: snapshot.panes.map(item => ({
      paneId: item.paneId,
      target: item.target,
      label: item.label,
      currentCommand: item.currentCommand,
    })),
    byPaneId: Object.fromEntries(Object.entries(snapshot.byPaneId).map(([paneId, item]) => [paneId, {
      paneId: item.paneId,
      target: item.target,
      label: item.label,
      currentCommand: item.currentCommand,
    }])),
  }
}

module.exports = {
  name: 'Go kernel tmux snapshot parser parity',
  async run(env) {
    const kernel = env.helpers.requireDist('core/kernel.js')
    const snapshotModule = env.helpers.requireDist('tmux/snapshot.js')
    const stdout = fixtureRows()
    const capturedAt = 123456789
    const tsSnapshot = snapshotModule.parseTmuxPaneSnapshot(stdout, capturedAt)

    assert.equal(tsSnapshot.capturedAt, capturedAt)
    assert.equal(tsSnapshot.ok, true)
    assert.deepEqual(tsSnapshot.panes.map(item => item.paneId), ['%pane-a', '%pane-empty-label', '%pane-empty-command', '%pane-tab-extra'])
    assert.equal(tsSnapshot.byPaneId['%pane-empty-label'].label, '')
    assert.equal(tsSnapshot.byPaneId['%pane-empty-command'].currentCommand, '')
    assert.equal(tsSnapshot.byPaneId['%pane-a'].target, 'session:@2')
    assert.equal(tsSnapshot.byPaneId['%pane-a'].label, 'agentteam duplicate last wins')
    assert.equal(tsSnapshot.byPaneId['%pane-tab-extra'].currentCommand, 'python')

    const disabledAdapter = kernel.createAgentTeamKernelAdapter({ env: {} })
    const fallbackSnapshot = disabledAdapter.parseTmuxPaneSnapshot(stdout, capturedAt, snapshotModule.parseTmuxPaneSnapshot)
    assert.deepEqual(compactSnapshot(fallbackSnapshot), compactSnapshot(tsSnapshot), 'disabled/default adapter should use TS parser fallback')
    assert.equal(disabledAdapter.metadata().kernel.calls, 0)
    assert.equal(disabledAdapter.metadata().kernel.fallbacks, 0)

    const missingGo = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(os.tmpdir(), 'missing-agentteam-kernel') })
    const missingSnapshot = missingGo.parseTmuxPaneSnapshot(stdout, capturedAt, snapshotModule.parseTmuxPaneSnapshot)
    assert.deepEqual(compactSnapshot(missingSnapshot), compactSnapshot(tsSnapshot), 'missing Go helper should fall back to TS parser')
    assert.equal(missingGo.metadata().kernel.mode, 'typescript')
    assert.equal(missingGo.metadata().kernel.enabled, false)
    assert.equal(missingGo.metadata().kernel.calls, 0)
    assert.equal(missingGo.metadata().kernel.fallbacks, 1)
    assert.match(missingGo.metadata().kernel.fallbackReason, /using TypeScript fallback/)

    const snapshotSource = env.helpers.readSource('tmux/snapshot.ts')
    assert.match(snapshotSource, /runTmuxNoThrow\(\[/, 'TypeScript must still capture tmux output')
    assert.match(snapshotSource, /list-panes/, 'TypeScript capture path must still call list-panes')
    assert.match(snapshotSource, /TMUX_PANE_SNAPSHOT_FORMAT/, 'TypeScript capture path must own tmux format')
    assert.match(snapshotSource, /createAgentTeamKernelAdapter/, 'only parser should optionally call kernel adapter')

    for (const rel of ['adapters/tmux/teamPanes.ts', 'tools/workerSpawnService.ts', 'app/taskApplication.ts', 'app/taskReportWorkflow.ts', 'app/planRunApplication.ts']) {
      const source = env.helpers.readSource(rel)
      assert.equal(source.includes('core/kernel.js'), false, `${rel} must not import kernel`)
      assert.equal(source.includes('tmuxSnapshotParse'), false, `${rel} must not call Go parser`)
      assert.equal(source.includes('PI_AGENTTEAM_KERNEL'), false, `${rel} must not read kernel env`)
    }

    if (!hasGoToolchain()) return
    const helperPath = buildGoHelper(env.helpers.extRoot)
    try {
      const goAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      const goSnapshot = goAdapter.parseTmuxPaneSnapshot(stdout, capturedAt, snapshotModule.parseTmuxPaneSnapshot)
      assert.deepEqual(compactSnapshot(goSnapshot), compactSnapshot(tsSnapshot), 'Go parser output should match TS parser output')
      const metadata = goAdapter.metadata()
      assert.equal(metadata.kernel.mode, 'go')
      assert.equal(metadata.kernel.enabled, true)
      assert.equal(metadata.kernel.calls, 2)
      assert.equal(metadata.kernel.fallbacks, 0)
      assert.equal(metadata.kernel.businessPathsConnected, false)
      assert.deepEqual(metadata.kernel.capabilities, ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint'])
    } finally {
      fs.rmSync(helperPath, { force: true })
    }
  },
}
