const assert = require('node:assert/strict')

function assertVocabulary(core, name, values, guard, normalize, invalids) {
  assert.deepEqual(values, values.slice(), `${name} values should preserve declaration order`)
  assert.equal(Object.isFrozen(values), true, `${name} values should be frozen`)
  for (const value of values) {
    assert.equal(guard(value), true, `${name} should accept ${value}`)
    assert.equal(normalize(value), value, `${name} should normalize ${value} to itself`)
  }
  for (const invalid of invalids) {
    assert.equal(guard(invalid), false, `${name} should reject ${String(invalid)}`)
    assert.equal(normalize(invalid), undefined, `${name} should not normalize ${String(invalid)}`)
  }
}

module.exports = {
  name: 'core vocabulary',
  async run(env) {
    const core = env.helpers.requireDist('core/publicModel.js')
    const exportedKeys = Object.keys(core).sort()
    assert.deepEqual(exportedKeys, [
      'MESSAGE_READ_STATES',
      'MESSAGE_TYPES',
      'TASK_REPORT_TYPES',
      'TASK_STATUSES',
      'WORKER_HEALTHS',
      'isMessageReadState',
      'isMessageType',
      'isTaskReportType',
      'isTaskStatus',
      'isWorkerHealth',
      'normalizeMessageReadState',
      'normalizeMessageType',
      'normalizeTaskReportType',
      'normalizeTaskStatus',
      'normalizeWorkerHealth',
    ])

    assertVocabulary(core, 'TaskStatus', core.TASK_STATUSES, core.isTaskStatus, core.normalizeTaskStatus, [
      undefined,
      null,
      'pending',
      'in_progress',
      'completed',
      'closed',
    ])

    assertVocabulary(core, 'WorkerHealth', core.WORKER_HEALTHS, core.isWorkerHealth, core.normalizeWorkerHealth, [
      undefined,
      null,
      'pending_delivery',
      'queued',
      'running',
      'draining',
    ])

    assertVocabulary(core, 'MessageType', core.MESSAGE_TYPES, core.isMessageType, core.normalizeMessageType, [
      undefined,
      null,
      'fyi',
      'blocked',
      'completion_report',
      'report_done',
    ])

    assertVocabulary(core, 'TaskReportType', core.TASK_REPORT_TYPES, core.isTaskReportType, core.normalizeTaskReportType, [
      undefined,
      null,
      'completion_report',
      'report',
      'blocked',
      'done',
    ])

    assertVocabulary(core, 'MessageReadState', core.MESSAGE_READ_STATES, core.isMessageReadState, core.normalizeMessageReadState, [
      undefined,
      null,
      'seen',
      'delivered',
      'readed',
    ])

    const publicTypes = env.helpers.requireDist('types.js')
    const publicTypeKeys = Object.keys(publicTypes).sort()
    assert.deepEqual(publicTypeKeys, [
      'MESSAGE_READ_STATES',
      'MESSAGE_TYPES',
      'TASK_REPORT_TYPES',
      'TASK_STATUSES',
      'TEAM_LEAD',
      'WORKER_HEALTHS',
      'isMessageReadState',
      'isMessageType',
      'isTaskReportType',
      'isTaskStatus',
      'isWorkerHealth',
      'normalizeMessageReadState',
      'normalizeMessageType',
      'normalizeTaskReportType',
      'normalizeTaskStatus',
      'normalizeWorkerHealth',
    ], 'types.ts should export only public runtime vocabulary plus TEAM_LEAD')
    assert.deepEqual(publicTypes.TASK_STATUSES, core.TASK_STATUSES)
    assert.deepEqual(publicTypes.WORKER_HEALTHS, core.WORKER_HEALTHS)
    assert.deepEqual(publicTypes.MESSAGE_TYPES, core.MESSAGE_TYPES)
    assert.deepEqual(publicTypes.TASK_REPORT_TYPES, core.TASK_REPORT_TYPES)
    assert.deepEqual(publicTypes.MESSAGE_READ_STATES, core.MESSAGE_READ_STATES)
    assert.equal(publicTypes.TEAM_LEAD, 'team-lead')
    assert.equal(publicTypes.WORKER_FSM_STATUSES, undefined, 'public types surface must not expose internal worker FSM statuses')
    assert.equal(publicTypes.DELIVERY_REQUEST_STATUSES, undefined, 'public types surface must not expose internal delivery statuses')
    assert.equal(publicTypes.OUTBOX_EFFECT_STATUSES, undefined, 'public types surface must not expose internal outbox statuses')
  },
}
