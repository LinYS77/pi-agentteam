const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const fixtures = require('../fixtures/kernel/read-model/panelCases.cjs')

const MALFORMED_SENTINEL = 'READ_MODEL_MALFORMED_HELPER_SHOULD_NOT_LEAK'

function hasGoToolchain() {
  return spawnSync('go', ['version'], { encoding: 'utf8' }).status === 0
}

function buildGoHelper(extRoot) {
  const helperDir = path.join(extRoot, 'kernel', 'go', 'agentteam-kernel')
  const out = path.join(os.tmpdir(), `agentteam-read-model-kernel-${process.pid}-${Date.now()}`)
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-read-model-helper-${name}-`))
  const file = path.join(dir, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return { dir, file }
}

function assertNoTextKeys(label, value) {
  function walk(item, pathParts = []) {
    if (!item || typeof item !== 'object') return
    if (Array.isArray(item)) {
      item.forEach((child, index) => walk(child, [...pathParts, String(index)]))
      return
    }
    for (const [key, child] of Object.entries(item)) {
      assert.notEqual(key, 'text', `${label} must not include text key at ${[...pathParts, key].join('.')}`)
      walk(child, [...pathParts, key])
    }
  }
  walk(value)
}

function assertNoSentinel(label, value) {
  const serialized = JSON.stringify(value)
  for (const sentinel of Object.values(fixtures.SENTINELS)) {
    assert.equal(serialized.includes(sentinel), false, `${label} must not include sentinel ${sentinel}`)
  }
  assert.equal(serialized.includes(MALFORMED_SENTINEL), false, `${label} must not include malformed helper sentinel`)
  assertNoTextKeys(label, value)
}

function assertReadOnlyResult(label, result) {
  assert.equal(result.ok, true, `${label} ok`)
  assert.equal(result.inputKind, 'compact-panel-data', `${label} inputKind`)
  assert.equal(result.readOnly, true, `${label} readOnly`)
  assert.equal(result.fullTextIncluded, false, `${label} fullTextIncluded`)
  assert.equal(result.stateFilesRead, false, `${label} stateFilesRead`)
  assert.equal(result.stateFilesWritten, false, `${label} stateFilesWritten`)
  assertNoSentinel(label, result)
}

function assertProjectionShape(label, projection, testCase) {
  assert.equal(projection.mode, testCase.expect.mode, `${label} mode`)
  if (projection.mode === 'attached') {
    assert.equal(projection.tasks.length, testCase.expect.taskCount ?? projection.tasks.length, `${label} task count`)
    assert.equal(projection.mailbox.length, testCase.expect.mailboxCount ?? projection.mailbox.length, `${label} mailbox count`)
    if (testCase.expect.hasConfig) {
      assert.ok(projection.team.config, `${label} should include compact config projection`)
      assert.equal(projection.team.config.exists, true)
      assert.ok(Array.isArray(projection.team.config.roleModels), `${label} config roleModels`)
    }
    if (testCase.expect.hasPlanRun) {
      assert.ok(Array.isArray(projection.team.planRuns), `${label} should include compact PlanRun projection`)
      assert.ok(projection.team.planRuns.some(run => run.planRunId === 'PR-RM-001' && run.taskId === 'T001'), `${label} should include PlanRun task hint`)
    }
    if (testCase.expect.legacyIdentity) {
      assert.equal(projection.team.name, 'legacy-team')
      assert.equal(projection.team.displayName, 'Legacy Team')
      assert.equal(projection.team.slug, 'legacy-team')
      assert.equal(projection.team.projectKey, 'legacy-project')
      assert.equal(projection.team.teamId, 'legacy-team-id')
    }
    const blocked = projection.tasks.find(task => task.status === 'blocked')
    if (blocked) {
      assert.ok(blocked.blockedBy.length > 0, `${label} blocked task should keep compact blockedBy`)
    }
    const watchdogTask = projection.tasks.find(task => task.watchdog)
    if (watchdogTask) {
      assert.equal(watchdogTask.watchdog?.state, 'waiting_for_report', `${label} watchdog state`)
      assert.equal(watchdogTask.watchdog?.needsNudge, true, `${label} watchdog needsNudge`)
    }
    const historyTask = projection.tasks.find(task => task.id === 'T001')
    if (historyTask) {
      assert.equal(typeof historyTask.history.reports, 'number', `${label} history reports`)
      assert.equal(typeof historyTask.history.events, 'number', `${label} history events`)
      assert.equal(typeof historyTask.history.messageRefs, 'number', `${label} history messageRefs`)
    }
  } else {
    assert.equal(projection.teams.length, testCase.expect.teamCount ?? projection.teams.length, `${label} team count`)
    assert.equal(projection.orphanPanes.length, testCase.expect.orphanPaneCount ?? projection.orphanPanes.length, `${label} orphan count`)
    assert.ok(projection.teamSummaries['global-a'], `${label} should include team summary`)
    assert.ok(projection.teamMailboxes['global-a'], `${label} should include team mailbox projection`)
    assert.ok(Array.isArray(projection.quarantinedTeams), `${label} quarantinedTeams`)
  }
  if (testCase.expect.large) {
    assert.ok(projection.tasks.length >= 36, `${label} should keep efficient large fixture shape`)
    assert.ok(String(JSON.stringify(projection)).length > 1000, `${label} should be non-trivial`)
  }
}

function assertSourceBoundaries(env) {
  const goSource = fs.readFileSync(path.join(env.helpers.extRoot, 'kernel/go/agentteam-kernel/main.go'), 'utf8')
  for (const forbidden of ['os.Open', 'os.ReadFile', 'os.WriteFile', 'os.Create', 'PI_AGENTTEAM_HOME', 'team.json', 'inboxes', 'sidecar', 'repository', 'cache.json', 'index.json', 'indexes']) {
    assert.equal(goSource.includes(forbidden), false, `Go helper must not contain ${forbidden}`)
  }
  for (const rel of ['teamPanel/dataSource.ts', 'state/repository.ts', 'app/taskApplication.ts', 'app/taskReportWorkflow.ts', 'app/planRunApplication.ts', 'runtime/leaderAttention.ts']) {
    const source = env.helpers.readSource(rel)
    assert.equal(source.includes('compactReadModelFingerprint'), false, `${rel} must not call Go read-model shadow method`)
    assert.equal(source.includes('PI_AGENTTEAM_KERNEL'), false, `${rel} must not read kernel env`)
    assert.equal(source.includes('fallbackKind'), false, `${rel} must not expose kernel fallback diagnostics`)
  }
}

module.exports = {
  name: 'Go kernel compact read-model shadow parity',
  async run(env) {
    const kernel = env.helpers.requireDist('core/kernel.js')
    const fingerprint = env.helpers.requireDist('core/readModelFingerprint.js')
    const cases = fixtures.cases()

    for (const testCase of cases) {
      const projection = fingerprint.compactReadModelProjection(testCase.input)
      const fingerprintValue = fingerprint.compactPanelReadModelFingerprint(projection)
      assert.equal(fingerprint.compactPanelReadModelFingerprint(testCase.input), fingerprintValue, `${testCase.name} projection/fingerprint parity`)
      assertProjectionShape(`TS projection ${testCase.name}`, projection, testCase)
      assertNoSentinel(`TS projection ${testCase.name}`, projection)
      if (testCase.equivalentTo) {
        assert.equal(fingerprint.compactPanelReadModelFingerprint(testCase.equivalentTo), fingerprintValue, `${testCase.name} unordered object keys should be stable`)
      }

      const tsResult = kernel.createAgentTeamKernelAdapter({ mode: 'typescript', env: {} }).compactReadModelFingerprint(testCase.input)
      assertReadOnlyResult(`TS adapter ${testCase.name}`, tsResult)
      assert.deepEqual(tsResult.projection, projection, `${testCase.name} TS adapter projection`)
      assert.equal(tsResult.fingerprint, fingerprintValue, `${testCase.name} TS adapter fingerprint`)
    }

    const sentinelCase = cases.find(testCase => testCase.name === 'attached sentinels sanitized')
    const tsSentinel = kernel.createAgentTeamKernelAdapter({ mode: 'typescript', env: {} }).compactReadModelFingerprint(sentinelCase.input)
    const missingGo = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath: path.join(os.tmpdir(), 'missing-agentteam-kernel') })
    const missingResult = missingGo.compactReadModelFingerprint(sentinelCase.input)
    assert.deepEqual(missingResult, tsSentinel, 'missing Go helper should fall back to TS compact projection/fingerprint')
    assert.equal(missingGo.metadata().kernel.mode, 'typescript')
    assert.equal(missingGo.metadata().kernel.fallbacks, 0)
    assert.equal(Object.prototype.hasOwnProperty.call(missingGo.metadata().kernel, 'fallbackKind'), false)

    const malformedHelper = writeHelper('malformed', `#!/usr/bin/env node
process.stdout.write('{not json ${MALFORMED_SENTINEL}\\n')
`)
    try {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath: malformedHelper.file })
      const malformedResult = adapter.compactReadModelFingerprint(sentinelCase.input)
      assert.deepEqual(malformedResult, tsSentinel, 'malformed helper should fall back to TS compact projection/fingerprint')
      assert.equal(adapter.metadata().kernel.fallbackKind, 'helper-malformed-json')
      assert.equal(JSON.stringify(adapter.metadata()).includes(MALFORMED_SENTINEL), false, 'metadata should not leak malformed helper stdout')
    } finally {
      fs.rmSync(malformedHelper.dir, { recursive: true, force: true })
    }

    assertSourceBoundaries(env)

    if (!hasGoToolchain()) return
    const helperPath = buildGoHelper(env.helpers.extRoot)
    try {
      for (const testCase of cases) {
        const compactInput = fingerprint.compactReadModelProjection(testCase.input)
        const expectedFingerprint = fingerprint.compactPanelReadModelFingerprint(compactInput)
        const directRun = runGoHelper(helperPath, {
          jsonrpc: '2.0',
          id: `read-model-${testCase.name}`,
          method: 'compactReadModelFingerprint',
          params: { input: compactInput },
        })
        assert.equal(directRun.status, 0, directRun.stderr)
        const response = JSON.parse(directRun.stdout.trim())
        assert.equal(response.jsonrpc, '2.0')
        assert.equal(response.id, `read-model-${testCase.name}`)
        assertReadOnlyResult(`direct Go ${testCase.name}`, response.result)
        assert.deepEqual(response.result.projection, compactInput, `${testCase.name} direct Go projection`)
        assert.equal(response.result.fingerprint, expectedFingerprint, `${testCase.name} direct Go fingerprint`)
      }

      const goAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'auto', helperPath })
      for (const testCase of cases) {
        const expectedProjection = fingerprint.compactReadModelProjection(testCase.input)
        const expectedFingerprint = fingerprint.compactPanelReadModelFingerprint(expectedProjection)
        const goResult = goAdapter.compactReadModelFingerprint(testCase.input)
        assertReadOnlyResult(`Auto adapter ${testCase.name}`, goResult)
        assert.deepEqual(goResult.projection, expectedProjection, `${testCase.name} auto adapter projection`)
        assert.equal(goResult.fingerprint, expectedFingerprint, `${testCase.name} auto adapter fingerprint`)
      }
      const metadata = goAdapter.metadata()
      assert.equal(metadata.kernel.mode, 'go')
      assert.equal(metadata.kernel.enabled, true)
      assert.equal(metadata.kernel.calls, cases.length + 1, 'first auto adapter call should include health preflight, then one call per fixture')
      assert.equal(metadata.kernel.fallbacks, 0)
      assert.deepEqual(metadata.kernel.capabilities, ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle'])
    } finally {
      fs.rmSync(helperPath, { force: true })
    }
  },
}
