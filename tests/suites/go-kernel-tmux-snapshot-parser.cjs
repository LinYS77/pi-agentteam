const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const fixtures = require('../fixtures/kernel/tmux/snapshotCases.cjs')

const BAD_STDOUT_SENTINEL = 'TMUX_HELPER_BAD_STDOUT_SHOULD_NOT_LEAK'

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

function runGoHelper(helperPath, request) {
  return spawnSync(helperPath, [], {
    input: `${JSON.stringify(request)}\n`,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH || '' },
  })
}

function writeHelper(name, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-tmux-helper-${name}-`))
  const file = path.join(dir, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return { dir, file }
}

function compactSnapshot(snapshot) {
  return {
    capturedAt: snapshot.capturedAt,
    ok: snapshot.ok,
    panes: (snapshot.panes || []).map(item => ({
      paneId: item.paneId,
      target: item.target,
      label: item.label,
      currentCommand: item.currentCommand,
    })),
    byPaneId: Object.fromEntries(Object.entries(snapshot.byPaneId || {}).map(([paneId, item]) => [paneId, {
      paneId: item.paneId,
      target: item.target,
      label: item.label,
      currentCommand: item.currentCommand,
    }])),
    ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
  }
}

function assertCanonicalSnapshot(actual, expected, label) {
  const compact = compactSnapshot(actual)
  assert.deepEqual(compact, expected, label)
  assert.equal(compact.ok, true, `${label} should set ok:true`)
  assert.equal(Object.prototype.hasOwnProperty.call(compact, 'error'), false, `${label} should not include error on parse success`)
  assert.deepEqual(Object.keys(compact.byPaneId).sort(), compact.panes.map(item => item.paneId).sort(), `${label} byPaneId should contain every pane id`)
  for (const item of compact.panes) {
    assert.deepEqual(compact.byPaneId[item.paneId], item, `${label} byPaneId entry should mirror pane item`)
  }
}

function assertAllFixturesWithParser(parser, label) {
  for (const testCase of fixtures.cases()) {
    const actual = parser(testCase.stdout, testCase.capturedAt)
    assertCanonicalSnapshot(actual, testCase.expected, `${label}: ${testCase.name}`)
  }
}

function assertBoundaryScans(env) {
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

  const tmuxAdapterSources = [
    'adapters/tmux/teamPanes.ts',
    'adapters/tmux/index.ts',
    'runtime/repository.ts',
    'teamPanel/dataSource.ts',
    'tmux/client.ts',
    'tmux/snapshot.ts',
    'tmux/panes.ts',
    'tmux/windows.ts',
  ].map(rel => env.helpers.readSource(rel)).join('\n')
  for (const token of ['createTeammatePane', 'killPane', 'ensureSwarmWindow', 'runTmuxNoThrow', 'list-panes', 'prepareTeamForPanel', 'reconcileTeamPanes']) {
    assert.ok(tmuxAdapterSources.includes(token), `TypeScript tmux/runtime sources should still own ${token}`)
  }

  const goSource = fs.readFileSync(path.join(env.helpers.extRoot, 'kernel/go/agentteam-kernel/main.go'), 'utf8')
  for (const forbidden of ['exec.Command', 'os/exec', 'tmux ', 'list-panes', 'createTeammatePane', 'kill-pane', 'display-message', 'send-keys', 'PI_AGENTTEAM_HOME', 'team.json', 'os.Open', 'os.ReadFile', 'os.WriteFile', 'os.Create']) {
    assert.equal(goSource.includes(forbidden), false, `Go helper must not own tmux/runtime/state authority: ${forbidden}`)
  }
}

module.exports = {
  name: 'Go kernel tmux snapshot parser parity',
  async run(env) {
    const kernel = env.helpers.requireDist('core/kernel.js')
    const snapshotModule = env.helpers.requireDist('tmux/snapshot.js')
    const cases = fixtures.cases()

    assertAllFixturesWithParser(snapshotModule.parseTmuxPaneSnapshot, 'TypeScript parser')

    const disabledAdapter = kernel.createAgentTeamKernelAdapter({ env: {} })
    for (const testCase of cases) {
      const fallbackSnapshot = disabledAdapter.parseTmuxPaneSnapshot(testCase.stdout, testCase.capturedAt, snapshotModule.parseTmuxPaneSnapshot)
      assertCanonicalSnapshot(fallbackSnapshot, testCase.expected, `disabled/default adapter fallback: ${testCase.name}`)
    }
    assert.equal(disabledAdapter.metadata().kernel.calls, 0)
    assert.equal(disabledAdapter.metadata().kernel.fallbacks, 0)

    const missingGo = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(os.tmpdir(), 'missing-agentteam-kernel') })
    for (const testCase of cases) {
      const missingSnapshot = missingGo.parseTmuxPaneSnapshot(testCase.stdout, testCase.capturedAt, snapshotModule.parseTmuxPaneSnapshot)
      assertCanonicalSnapshot(missingSnapshot, testCase.expected, `missing Go helper fallback: ${testCase.name}`)
    }
    assert.equal(missingGo.metadata().kernel.mode, 'typescript')
    assert.equal(missingGo.metadata().kernel.enabled, false)
    assert.equal(missingGo.metadata().kernel.calls, 0)
    assert.equal(missingGo.metadata().kernel.fallbacks, 1)
    assert.equal(missingGo.metadata().kernel.fallbackKind, 'missing-helper')
    assert.match(missingGo.metadata().kernel.fallbackReason, /using TypeScript fallback/)

    const malformedHelper = writeHelper('malformed', `#!/usr/bin/env node
process.stdout.write('{not json ${BAD_STDOUT_SENTINEL}\\n')
`)
    try {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: malformedHelper.file })
      const testCase = cases.find(item => item.name === 'mixed corpus canonical snapshot') || cases[0]
      const snapshot = adapter.parseTmuxPaneSnapshot(testCase.stdout, testCase.capturedAt, snapshotModule.parseTmuxPaneSnapshot)
      assertCanonicalSnapshot(snapshot, testCase.expected, 'malformed helper fallback should return TS parser output')
      assert.equal(adapter.metadata().kernel.fallbackKind, 'helper-malformed-json')
      assert.equal(JSON.stringify(adapter.metadata()).includes(BAD_STDOUT_SENTINEL), false, 'fallback diagnostics should not leak malformed stdout')
    } finally {
      fs.rmSync(malformedHelper.dir, { recursive: true, force: true })
    }

    assertBoundaryScans(env)

    if (!hasGoToolchain()) return
    const helperPath = buildGoHelper(env.helpers.extRoot)
    try {
      for (const testCase of cases) {
        const directRun = runGoHelper(helperPath, {
          jsonrpc: '2.0',
          id: `tmux-${testCase.name}`,
          method: 'tmuxSnapshotParse',
          params: { stdout: testCase.stdout, capturedAt: testCase.capturedAt },
        })
        assert.equal(directRun.status, 0, directRun.stderr)
        const directResponse = JSON.parse(directRun.stdout.trim())
        assert.equal(directResponse.jsonrpc, '2.0')
        assert.equal(directResponse.id, `tmux-${testCase.name}`)
        assertCanonicalSnapshot(directResponse.result, testCase.expected, `direct Go helper: ${testCase.name}`)
      }

      const goAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      for (const testCase of cases) {
        const goSnapshot = goAdapter.parseTmuxPaneSnapshot(testCase.stdout, testCase.capturedAt, snapshotModule.parseTmuxPaneSnapshot)
        assertCanonicalSnapshot(goSnapshot, testCase.expected, `Go adapter parser: ${testCase.name}`)
      }
      const metadata = goAdapter.metadata()
      assert.equal(metadata.kernel.mode, 'go')
      assert.equal(metadata.kernel.enabled, true)
      assert.equal(metadata.kernel.calls, cases.length + 1, 'first adapter call should include health preflight, then one call per fixture')
      assert.equal(metadata.kernel.fallbacks, 0)
      assert.equal(metadata.kernel.businessPathsConnected, false)
      assert.deepEqual(metadata.kernel.capabilities, ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint'])
    } finally {
      fs.rmSync(helperPath, { force: true })
    }
  },
}
