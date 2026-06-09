const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const MAILBOX_SENTINEL = 'GO_KERNEL_SHADOW_MAILBOX_TEXT_SHOULD_NOT_LEAK'
const REPORT_SENTINEL = 'GO_KERNEL_SHADOW_REPORT_TEXT_SHOULD_NOT_LEAK'

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

function compactFixture(size = 4) {
  const members = Array.from({ length: Math.max(1, Math.min(size, 8)) }, (_, index) => ({
    name: `worker-${index + 1}`,
    role: ['researcher', 'planner', 'implementer'][index % 3],
    status: index % 4 === 0 ? 'busy' : 'idle',
    paneId: `%shadow-${index + 1}`,
    windowTarget: 'shadow:@1',
    bridgeAvailable: true,
    bridgeVersion: 'test',
    bridgeLastSeenAt: 1700000000000 + index,
    bridgeLastDeliveryAt: 1700000000100 + index,
    bridgeWorkRequestCount: index,
    lastWakeReason: index % 2 === 0 ? 'assignment' : undefined,
  }))
  const tasks = Array.from({ length: size }, (_, index) => ({
    id: `T${String(index + 1).padStart(3, '0')}`,
    title: `Shadow task ${index + 1}`,
    description: `Compact description ${index + 1}`,
    status: index % 5 === 0 ? 'blocked' : 'open',
    owner: members[index % members.length].name,
    blockedBy: index % 5 === 0 ? ['compact blocker'] : [],
    createdAt: 1700000010000 + index,
    updatedAt: 1700000020000 + index,
    history: {
      taskId: `T${String(index + 1).padStart(3, '0')}`,
      reports: index % 3,
      events: index % 4,
      messageRefs: index % 5,
    },
    watchdog: index % 7 === 0 ? {
      state: 'waiting_for_report',
      needsNudge: true,
      latestAssignmentAt: 1700000030000 + index,
      workerStatus: 'idle',
    } : undefined,
  }))
  const taskMap = Object.fromEntries(tasks.map(task => [task.id, task]))
  const team = {
    version: 1,
    name: 'shadow-team',
    identity: {
      teamId: 'team-shadow',
      projectKey: 'project-shadow',
      displayName: 'Shadow Team',
      slug: 'shadow-team',
    },
    createdAt: 1700000000000,
    leaderCwd: '/tmp/shadow-team',
    members: Object.fromEntries(members.map(member => [member.name, member])),
    tasks: taskMap,
    planRuns: [],
    nextTaskSeq: size + 1,
    revision: 42,
  }
  const mailbox = Array.from({ length: Math.max(1, Math.min(size, 12)) }, (_, index) => ({
    id: `M${String(index + 1).padStart(3, '0')}`,
    from: members[index % members.length].name,
    to: 'team-lead',
    type: index % 3 === 0 ? 'report_blocked' : 'inform',
    summary: `Compact mailbox ${index + 1}`,
    priority: index % 3 === 0 ? 'high' : 'normal',
    taskId: tasks[index % tasks.length].id,
    createdAt: 1700000040000 + index,
    readAt: index % 2 === 0 ? undefined : 1700000050000 + index,
    deliveredAt: index % 4 === 0 ? 1700000060000 + index : undefined,
  }))
  return {
    mode: 'attached',
    team,
    members,
    tasks,
    mailbox,
    outboxDiagnostics: { pending: 0, failed: 0, latest: [] },
  }
}

function withFullTextSentinels(data) {
  const clone = JSON.parse(JSON.stringify(data))
  clone.mailbox[0].text = `${MAILBOX_SENTINEL} full mailbox body`
  clone.team.taskReports = {
    TR001: {
      id: 'TR001',
      taskId: clone.tasks[0].id,
      text: `${REPORT_SENTINEL} full report body`,
      summary: 'Compact report summary',
    },
  }
  clone.tasks[0].history.latestReport = {
    id: 'TR001',
    summary: 'Compact report summary',
  }
  return clone
}

function assertNoSentinel(label, value) {
  const json = JSON.stringify(value)
  assert.equal(json.includes(MAILBOX_SENTINEL), false, `${label} must not include full mailbox sentinel`)
  assert.equal(json.includes(REPORT_SENTINEL), false, `${label} must not include full report sentinel`)
  assert.equal(json.includes('"text"'), false, `${label} must not expose text fields`)
}

module.exports = {
  name: 'Go kernel compact read-model shadow parity',
  async run(env) {
    const kernel = env.helpers.requireDist('core/kernel.js')
    const fingerprint = env.helpers.requireDist('core/readModelFingerprint.js')
    const compactInput = compactFixture(8)
    const unsafeInput = withFullTextSentinels(compactInput)
    const tsResult = kernel.createAgentTeamKernelAdapter({ env: {} }).compactReadModelFingerprint(unsafeInput)
    const directProjection = fingerprint.compactReadModelProjection(unsafeInput)
    const directFingerprint = fingerprint.compactPanelReadModelFingerprint(directProjection)

    assert.equal(tsResult.ok, true)
    assert.equal(tsResult.inputKind, 'compact-panel-data')
    assert.equal(tsResult.readOnly, true)
    assert.equal(tsResult.fullTextIncluded, false)
    assert.equal(tsResult.stateFilesRead, false)
    assert.equal(tsResult.stateFilesWritten, false)
    assert.deepEqual(tsResult.projection, directProjection)
    assert.equal(tsResult.fingerprint, directFingerprint)
    assertNoSentinel('TS shadow projection', tsResult.projection)
    assertNoSentinel('TS shadow result', tsResult)

    const largeResult = kernel.createAgentTeamKernelAdapter({ env: {} }).compactReadModelFingerprint(compactFixture(40))
    assert.equal(largeResult.ok, true)
    assert.equal(largeResult.readOnly, true)
    assert.ok(String(largeResult.fingerprint).length > 100, 'large fixture should produce a non-trivial fingerprint')

    const missingGo = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath: path.join(os.tmpdir(), 'missing-agentteam-kernel') })
    const missingResult = missingGo.compactReadModelFingerprint(unsafeInput)
    assert.deepEqual(missingResult, tsResult, 'missing Go helper should fall back to TS compact projection/fingerprint')
    assert.equal(missingGo.metadata().kernel.mode, 'typescript')
    assert.equal(missingGo.metadata().kernel.fallbacks, 1)
    assert.match(missingGo.metadata().kernel.fallbackReason, /using TypeScript fallback/)

    for (const rel of ['teamPanel/dataSource.ts', 'state/repository.ts', 'app/taskApplication.ts', 'app/taskReportWorkflow.ts', 'app/planRunApplication.ts']) {
      const source = env.helpers.readSource(rel)
      assert.equal(source.includes('compactReadModelFingerprint'), false, `${rel} must not call Go read-model shadow method`)
      assert.equal(source.includes('PI_AGENTTEAM_KERNEL'), false, `${rel} must not read kernel env`)
    }

    const goSource = fs.readFileSync(path.join(env.helpers.extRoot, 'kernel/go/agentteam-kernel/main.go'), 'utf8')
    for (const forbidden of ['os.Open', 'os.ReadFile', 'os.WriteFile', 'os.Create', 'PI_AGENTTEAM_HOME', 'team.json', 'inboxes', 'sidecar']) {
      assert.equal(goSource.includes(forbidden), false, `Go helper must not contain ${forbidden}`)
    }

    if (!hasGoToolchain()) return
    const helperPath = buildGoHelper(env.helpers.extRoot)
    try {
      const goAdapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', helperPath })
      const goResult = goAdapter.compactReadModelFingerprint(unsafeInput)
      assert.deepEqual(goResult, tsResult, 'Go compact read-model shadow output should match TS output')
      assertNoSentinel('Go shadow result', goResult)
      const metadata = goAdapter.metadata()
      assert.equal(metadata.kernel.mode, 'go')
      assert.equal(metadata.kernel.enabled, true)
      assert.equal(metadata.kernel.calls, 2)
      assert.equal(metadata.kernel.fallbacks, 0)
      assert.deepEqual(metadata.kernel.capabilities, ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint'])
    } finally {
      fs.rmSync(helperPath, { force: true })
    }
  },
}
