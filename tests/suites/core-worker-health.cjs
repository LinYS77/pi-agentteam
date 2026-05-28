const assert = require('node:assert/strict')

module.exports = {
  name: 'core worker health projection',
  async run(env) {
    const core = env.helpers.requireDist('core/workerHealth.js')
    const source = env.helpers.readSource('core/workerHealth.ts')

    assert.deepEqual(Object.keys(core).sort(), [
      'WORKER_HEALTH_PROJECTION_CHECKS',
      'projectWorkerHealth',
    ])
    assert.equal(Object.isFrozen(core.WORKER_HEALTH_PROJECTION_CHECKS), true, 'health checks should be frozen')

    assert.equal(core.projectWorkerHealth({ isOperational: false }), 'offline')
    assert.equal(core.projectWorkerHealth({ isOperational: true }), 'idle')
    assert.equal(core.projectWorkerHealth({ isOperational: true, hasPendingWork: true }), 'busy')
    assert.equal(core.projectWorkerHealth({ isOperational: true, hasActiveTurn: true }), 'busy')
    assert.equal(core.projectWorkerHealth({ isOperational: true, hasPendingWork: true, hasActiveTurn: true }), 'busy')
    assert.equal(core.projectWorkerHealth({ isOperational: true, hasError: true }), 'error')
    assert.equal(core.projectWorkerHealth({ isOperational: false, hasPendingWork: true, hasError: true }), 'error')

    for (const token of ['queued', 'running', 'pending_delivery', 'draining', 'projection', 'delivery']) {
      assert.equal(source.includes(token), false, `worker health projection should not expose ${token}`)
    }
  },
}
