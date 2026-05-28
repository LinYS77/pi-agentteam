const assert = require('node:assert/strict')

module.exports = {
  name: 'worker FSM transition helper',
  async run(env) {
    const { transitionWorkerFsm } = env.helpers.requireDist('runtime/workerFsm.js')

    const cases = [
      { name: 'spawn reservation waits for delivery', from: 'offline', event: 'spawnReserved', to: 'pending_delivery', reason: 'worker spawn reserved' },
      { name: 'bridge published moves idle-ready', from: 'offline', event: 'bridgeLeasePublished', to: 'idle', reason: 'bridge lease published', bridgeAvailable: true },
      { name: 'bridge published does not hide pending delivery', from: 'pending_delivery', event: 'bridgeLeasePublished', to: 'pending_delivery', reason: 'bridge ready; delivery pending', bridgeAvailable: true },
      { name: 'delivery request queues pending', from: 'idle', event: 'deliveryRequested', to: 'pending_delivery', reason: 'bridge delivery request pending' },
      { name: 'delivery request preserves running', from: 'running', event: 'deliveryRequested', to: 'running', reason: 'bridge delivery pending while running' },
      { name: 'delivery submit queues worker', from: 'pending_delivery', event: 'deliverySubmitted', to: 'queued', reason: 'bridge submitted prompt' },
      { name: 'delivery submit preserves running', from: 'running', event: 'deliverySubmitted', to: 'running', reason: 'bridge delivery pending while running' },
      { name: 'agent start runs', from: 'queued', event: 'agentStarted', to: 'running', reason: 'bridge delivery started' },
      { name: 'agent end idles when clear', from: 'running', event: 'agentEnded', to: 'idle', reason: 'finished turn' },
      { name: 'agent end keeps pending delivery', from: 'running', event: 'agentEnded', to: 'pending_delivery', reason: 'bridge delivery pending after turn', hasPendingDelivery: true },
      { name: 'agent end drains when native busy', from: 'running', event: 'agentEnded', to: 'draining', reason: 'bridge draining after turn', hasPendingNative: true },
      { name: 'native busy keeps pending', from: 'idle', event: 'nativeBusy', to: 'pending_delivery', reason: 'bridge delivery pending; native session busy' },
      { name: 'delivery failure queues non-running', from: 'pending_delivery', event: 'deliveryFailed', to: 'queued', reason: 'bridge delivery failed', error: 'boom' },
      { name: 'delivery failure preserves running status', from: 'running', event: 'deliveryFailed', to: 'running', reason: 'bridge delivery failed', error: 'boom' },
      { name: 'pane lost is error', from: 'running', event: 'paneLost', to: 'error', reason: 'pane lost', error: 'tmux pane disappeared' },
      { name: 'shutdown running goes offline', from: 'running', event: 'sessionShutdown', to: 'offline', reason: 'normal_shutdown' },
      { name: 'shutdown idle goes offline', from: 'idle', event: 'sessionShutdown', to: 'offline', reason: 'normal_shutdown' },
      { name: 'shutdown pending goes offline', from: 'pending_delivery', event: 'sessionShutdown', to: 'offline', reason: 'normal_shutdown' },
      { name: 'shutdown queued goes offline', from: 'queued', event: 'sessionShutdown', to: 'offline', reason: 'normal_shutdown' },
      { name: 'shutdown draining goes offline', from: 'draining', event: 'sessionShutdown', to: 'offline', reason: 'normal_shutdown' },
      { name: 'shutdown preserves error status', from: 'error', event: 'sessionShutdown', to: 'error', reason: 'normal_shutdown' },
      { name: 'manual recover clears error', from: 'error', event: 'manualRecovered', to: 'idle', reason: 'manual recovery' },
    ]

    for (const item of cases) {
      const member = {
        status: item.from,
        lastWakeReason: 'previous reason',
        lastError: item.from === 'error' ? 'previous error' : undefined,
        bridgeAvailable: false,
        bridgeLastError: item.from === 'error' ? 'previous bridge error' : undefined,
      }
      const actual = transitionWorkerFsm({
        member,
        event: item.event,
        error: item.error,
        hasPendingDelivery: item.hasPendingDelivery,
        hasPendingNative: item.hasPendingNative,
        nativeIdle: item.nativeIdle,
      })
      assert.equal(actual.ok, true, item.name)
      assert.equal(actual.from, item.from, item.name)
      assert.equal(actual.to, item.to, item.name)
      assert.equal(actual.patch.status, item.to, item.name)
      assert.equal(actual.reason, item.reason, item.name)
      assert.equal(actual.patch.lastWakeReason, item.reason === 'normal_shutdown' ? 'previous reason' : item.reason, item.name)
      if (item.bridgeAvailable !== undefined) assert.equal(actual.patch.bridgeAvailable, item.bridgeAvailable, item.name)
      if (item.error) {
        assert.equal(actual.patch.lastError, item.error, `${item.name}: lastError preserved`)
        assert.equal(actual.patch.bridgeLastError, item.error, `${item.name}: bridgeLastError preserved`)
      }
    }

    const runningPending = transitionWorkerFsm({ member: { status: 'running' }, event: 'deliveryRequested' })
    assert.equal(runningPending.patch.status, 'running', 'running pending must not overwrite running')
    assert.equal(runningPending.patch.lastError, undefined)

    const shutdownError = transitionWorkerFsm({
      member: { status: 'running', lastWakeReason: 'processing prompt', lastError: 'kept error', bridgeLastError: 'kept bridge error' },
      event: 'sessionShutdown',
    })
    assert.equal(shutdownError.patch.status, 'offline', 'shutdown running/offline conversion')
    assert.equal(shutdownError.patch.lastError, 'kept error', 'shutdown preserves lastError')
    assert.equal(shutdownError.patch.bridgeLastError, 'kept bridge error', 'shutdown preserves bridgeLastError')
    assert.equal(shutdownError.patch.lastWakeReason, 'processing prompt', 'shutdown preserves wake reason')

    const recovered = transitionWorkerFsm({ member: { status: 'error', lastError: 'old', bridgeLastError: 'old bridge' }, event: 'manualRecovered' })
    assert.equal(recovered.patch.status, 'idle')
    assert.equal(recovered.patch.lastError, undefined)
    assert.equal(recovered.patch.bridgeLastError, undefined)
  },
}
