const assert = require('node:assert/strict')

function assertTaskShape(task, expected) {
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(task[key], value, `expected task.${key} to equal ${JSON.stringify(value)}`)
  }
}

module.exports = {
  name: 'core task reducer',
  async run(env) {
    const core = env.helpers.requireDist('core/taskReducer.js')
    const source = env.helpers.readSource('core/taskReducer.ts')

    assert.deepEqual(Object.keys(core).sort(), ['createTask', 'transitionTask'])
    for (const legacyStatus of ['pending', 'in_progress', 'completed']) {
      assert.equal(source.includes(legacyStatus), false, `task reducer should not mention ${legacyStatus}`)
    }

    const created = core.createTask({
      id: 'T001',
      title: 'Build task reducer',
      description: 'pure task state transitions',
      owner: 'alice',
      createdAt: 10,
    })
    assertTaskShape(created, {
      id: 'T001',
      title: 'Build task reducer',
      description: 'pure task state transitions',
      owner: 'alice',
      status: 'open',
      createdAt: 10,
      updatedAt: 10,
      closedAt: undefined,
    })

    const assigned = core.transitionTask(created, { type: 'assign', owner: 'bob', at: 20 })
    assert.equal(assigned.ok, true)
    assert.equal(assigned.action, 'assign')
    assert.equal(assigned.from, 'open')
    assert.equal(assigned.to, 'open')
    assert.equal(assigned.task.status, 'open')
    assert.equal(assigned.task.owner, 'bob')
    assert.equal(assigned.task.updatedAt, 20)
    assert.equal(assigned.task.createdAt, 10)
    assert.notEqual(assigned.task, created)
    assert.equal(created.owner, 'alice')
    assert.equal(created.updatedAt, 10)

    const blocked = core.transitionTask(assigned.task, { type: 'block', at: 30 })
    assert.equal(blocked.ok, true)
    assert.equal(blocked.action, 'block')
    assert.equal(blocked.from, 'open')
    assert.equal(blocked.to, 'blocked')
    assert.equal(blocked.task.status, 'blocked')
    assert.equal(blocked.task.owner, 'bob')
    assert.equal(blocked.task.updatedAt, 30)

    const reportOnBlocked = core.transitionTask(blocked.task, {
      type: 'report_blocked',
      at: 31,
      actor: 'worker-a',
      note: 'blocked by dependency',
      metadata: { dependency: 'T099' },
    })
    assert.equal(reportOnBlocked.ok, true)
    assert.equal(reportOnBlocked.action, 'report_blocked')
    assert.equal(reportOnBlocked.from, 'blocked')
    assert.equal(reportOnBlocked.to, 'blocked')
    assert.equal(reportOnBlocked.task.status, 'blocked')
    assert.equal(reportOnBlocked.task.updatedAt, 31)
    assert.deepEqual(reportOnBlocked.reportIntent, {
      taskId: 'T001',
      type: 'report_blocked',
      at: 31,
      actor: 'worker-a',
      note: 'blocked by dependency',
      metadata: { dependency: 'T099' },
    })

    const unblocked = core.transitionTask(reportOnBlocked.task, { type: 'unblock', at: 40 })
    assert.equal(unblocked.ok, true)
    assert.equal(unblocked.action, 'unblock')
    assert.equal(unblocked.from, 'blocked')
    assert.equal(unblocked.to, 'open')
    assert.equal(unblocked.task.status, 'open')
    assert.equal(unblocked.task.owner, 'bob')
    assert.equal(unblocked.task.updatedAt, 40)

    const reportOnOpen = core.transitionTask(unblocked.task, {
      type: 'report_done',
      at: 41,
      actor: 'worker-a',
      note: 'done with current slice',
    })
    assert.equal(reportOnOpen.ok, true)
    assert.equal(reportOnOpen.action, 'report_done')
    assert.equal(reportOnOpen.from, 'open')
    assert.equal(reportOnOpen.to, 'open')
    assert.equal(reportOnOpen.task.status, 'open')
    assert.equal(reportOnOpen.task.updatedAt, 41)
    assert.deepEqual(reportOnOpen.reportIntent, {
      taskId: 'T001',
      type: 'report_done',
      at: 41,
      actor: 'worker-a',
      note: 'done with current slice',
      metadata: undefined,
    })

    const closed = core.transitionTask(reportOnOpen.task, { type: 'close', at: 50 })
    assert.equal(closed.ok, true)
    assert.equal(closed.action, 'close')
    assert.equal(closed.from, 'open')
    assert.equal(closed.to, 'done')
    assert.equal(closed.task.status, 'done')
    assert.equal(closed.task.closedAt, 50)
    assert.equal(closed.task.updatedAt, 50)

    const blockedClosed = core.transitionTask(blocked.task, { type: 'close', at: 51 })
    assert.equal(blockedClosed.ok, true)
    assert.equal(blockedClosed.from, 'blocked')
    assert.equal(blockedClosed.to, 'done')
    assert.equal(blockedClosed.task.status, 'done')
    assert.equal(blockedClosed.task.closedAt, 51)

    const invalidBlockedAssign = core.transitionTask(blocked.task, { type: 'assign', owner: 'carol', at: 60 })
    assert.equal(invalidBlockedAssign.ok, false)
    assert.equal(invalidBlockedAssign.reason, 'assign requires open task, got blocked')
    assert.equal(invalidBlockedAssign.task.status, 'blocked')

    const invalidOpenUnblock = core.transitionTask(created, { type: 'unblock', at: 61 })
    assert.equal(invalidOpenUnblock.ok, false)
    assert.equal(invalidOpenUnblock.reason, 'unblock requires blocked task, got open')
    assert.equal(invalidOpenUnblock.task.status, 'open')

    const invalidDoneReport = core.transitionTask(closed.task, { type: 'report_done', at: 62, actor: 'worker-a' })
    assert.equal(invalidDoneReport.ok, false)
    assert.equal(invalidDoneReport.reason, 'report requires open or blocked task, got done')
    assert.equal(invalidDoneReport.task.status, 'done')

    const invalidDoneClose = core.transitionTask(closed.task, { type: 'close', at: 63 })
    assert.equal(invalidDoneClose.ok, false)
    assert.equal(invalidDoneClose.reason, 'close requires open or blocked task, got done')
    assert.equal(invalidDoneClose.task.status, 'done')

    for (const legacyStatus of ['pending', 'in_progress', 'completed']) {
      const legacyTask = { ...created, status: legacyStatus }
      const legacyResult = core.transitionTask(legacyTask, { type: 'assign', owner: 'delta', at: 70 })
      assert.equal(legacyResult.ok, false)
      assert.equal(legacyResult.from, legacyStatus)
      assert.equal(legacyResult.to, legacyStatus)
      assert.equal(legacyResult.reason, `unsupported task status ${legacyStatus}`)
      assert.equal(legacyResult.task.status, legacyStatus)
    }
  },
}
