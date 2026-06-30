const assert = require('node:assert/strict')

module.exports = {
  name: 'leader mailbox signal runtime seam',
  async run(env) {
    const { helpers } = env
    const signalHelpers = helpers.requireDist('runtime/leaderMailboxSignalRuntime.js')

    const helperFullText = 'UNIQUE-HELPER-FULL-TEXT must stay out of compact projection helper output'
    const helperItem = {
      id: 'helper-message',
      teamName: 'leader-signal-helper-suite',
      from: 'helper-worker',
      text: helperFullText,
      summary: 'helper compact summary',
      type: 'question',
      taskId: 'T123',
      threadId: 'task:T123',
      requestId: 'helper-request-generation',
      replyTo: 'prior-message',
      priority: 'high',
      wakeHint: 'soft',
      createdAt: 1700000000000,
    }
    const helperKey = signalHelpers.leaderMailboxSignalKey(helperItem.teamName, helperItem.id, helperItem.requestId)

    const seamEvents = []
    const projectionStates = new Map()
    const attentionStates = new Map()
    const keyFor = (teamName, messageId, generation) => signalHelpers.leaderMailboxSignalKey(teamName, messageId, generation)
    const projectionStore = {
      claimLeaderProjection(teamName, messageId, generation) {
        const projectionKey = keyFor(teamName, messageId, generation)
        const existing = projectionStates.get(projectionKey)
        if (existing?.status === 'projected') return null
        seamEvents.push(`projection:claim:${projectionKey}`)
        const next = existing ?? { projectionKey, teamName, messageId, generation: String(generation), attempts: 0 }
        next.status = 'projecting'
        projectionStates.set(projectionKey, next)
        return next
      },
      getLeaderProjection(teamName, messageId, generation) {
        return projectionStates.get(keyFor(teamName, messageId, generation)) ?? null
      },
      markLeaderProjectionProjected(teamName, projectionKey) {
        seamEvents.push(`projection:projected:${projectionKey}`)
        const next = projectionStates.get(projectionKey)
        next.status = 'projected'
        return next
      },
      markLeaderProjectionFailed(teamName, projectionKey, error) {
        seamEvents.push(`projection:failed:${projectionKey}:${error}`)
        const next = projectionStates.get(projectionKey)
        next.status = 'failed'
        next.lastError = error
        return next
      },
    }
    const attentionStore = {
      claimLeaderAttention(teamName, messageId, generation) {
        const attentionKey = keyFor(teamName, messageId, generation)
        const existing = attentionStates.get(attentionKey)
        if (existing?.status === 'sent' || existing?.status === 'skipped') return null
        seamEvents.push(`attention:claim:${attentionKey}`)
        const next = existing ?? { attentionKey, teamName, messageId, generation: String(generation), attempts: 0 }
        next.status = 'sending'
        attentionStates.set(attentionKey, next)
        return next
      },
      getLeaderAttention(teamName, messageId, generation) {
        return attentionStates.get(keyFor(teamName, messageId, generation)) ?? null
      },
      markLeaderAttentionSent(teamName, attentionKey) {
        seamEvents.push(`attention:sent:${attentionKey}`)
        const next = attentionStates.get(attentionKey)
        next.status = 'sent'
        return next
      },
      markLeaderAttentionFailed(teamName, attentionKey, error) {
        seamEvents.push(`attention:failed:${attentionKey}:${error}`)
        const next = attentionStates.get(attentionKey)
        next.status = 'failed'
        next.lastError = error
        return next
      },
      markLeaderAttentionSkipped(teamName, attentionKey, reason) {
        seamEvents.push(`attention:skipped:${attentionKey}:${reason}`)
        const next = attentionStates.get(attentionKey)
        next.status = 'skipped'
        next.lastError = reason
        return next
      },
    }
    const nativeProjectionMessages = []
    const failProjectionIds = new Set()
    const nativeSender = {
      sendMessage(message, options) {
        seamEvents.push(`native:${message.customType}:${message.details.id}`)
        if (message.customType === 'agentteam-mailbox' && failProjectionIds.delete(message.details.id)) {
          throw new Error('direct seam projection failed once')
        }
        nativeProjectionMessages.push({ message, options })
      },
    }
    const attentionFailures = new Set()
    const attention = {
      isLeaderAttentionMessageType(type) {
        seamEvents.push(`attention:type:${type}`)
        return type === 'question' || type === 'report_done' || type === 'report_blocked'
      },
      sendLeaderAttentionMessage(item) {
        seamEvents.push(`attention:send:${item.id}`)
        if (attentionFailures.delete(item.id)) {
          return { ok: false, reason: 'leader attention sendMessage failed', error: 'direct seam attention failed once' }
        }
        if (item.wakeHint === 'none') return { ok: false, reason: 'wake hint does not require wake' }
        return { ok: true, reason: `leader attention requested ${item.type}` }
      },
      resetLeaderAttentionThrottle() {
        seamEvents.push('attention:reset')
      },
    }
    const seamRuntime = signalHelpers.createLeaderMailboxSignalRuntime({
      nativeSender,
      projectionStore,
      attentionStore,
      attention,
    })
    seamEvents.length = 0
    assert.deepEqual(seamRuntime.sync([helperItem]), { projectedCount: 1, attentionCount: 1 }, 'LeaderMailboxSignalRuntime.sync should report projection and attention counts')
    assert.deepEqual(seamEvents, [
      `projection:claim:${helperKey}`,
      'native:agentteam-mailbox:helper-message',
      `projection:projected:${helperKey}`,
      'attention:type:question',
      `attention:claim:${helperKey}`,
      'attention:send:helper-message',
      `attention:sent:${helperKey}`,
    ], 'direct signal runtime sync should project before attention and mark durable state in order')
    assert.equal(nativeProjectionMessages[0].options.triggerTurn, false, 'direct signal runtime projection should preserve triggerTurn=false')
    assert.equal(nativeProjectionMessages[0].message.content.includes(helperFullText), false, 'direct signal runtime projection should not include full text')
    seamEvents.length = 0
    assert.deepEqual(seamRuntime.sync([helperItem]), { projectedCount: 0, attentionCount: 0 }, 'LeaderMailboxSignalRuntime.sync should not repeat sent/projected generation')
    assert.equal(nativeProjectionMessages.filter(item => item.message.customType === 'agentteam-mailbox' && item.message.details.id === helperItem.id).length, 1, 'direct signal runtime should not duplicate native projection for same runtime generation')
    seamEvents.length = 0
    seamRuntime.resetVolatileState()
    assert.deepEqual(seamEvents, ['attention:reset'], 'LeaderMailboxSignalRuntime.resetVolatileState should clear volatile cache and delegate throttle reset')
    seamEvents.length = 0
    assert.deepEqual(seamRuntime.sync([helperItem]), { projectedCount: 0, attentionCount: 0 }, 'durable projected/sent state should prevent repeats after volatile reset')
    assert.equal(nativeProjectionMessages.filter(item => item.message.customType === 'agentteam-mailbox' && item.message.details.id === helperItem.id).length, 1, 'direct signal runtime should not duplicate native projection after reset')

    const projectionRetryItem = { ...helperItem, id: 'helper-projection-retry', requestId: 'helper-projection-retry-generation', text: 'projection retry direct seam full text' }
    const projectionRetryKey = keyFor(projectionRetryItem.teamName, projectionRetryItem.id, projectionRetryItem.requestId)
    failProjectionIds.add(projectionRetryItem.id)
    seamEvents.length = 0
    assert.deepEqual(seamRuntime.sync([projectionRetryItem]), { projectedCount: 0, attentionCount: 0 }, 'failed projection should not count or request attention')
    assert.equal(attentionStates.get(projectionRetryKey), undefined, 'failed projection should not create attention state')
    assert.equal(projectionStates.get(projectionRetryKey).status, 'failed', 'failed projection should remain retryable in durable state')
    assert.deepEqual(seamRuntime.sync([projectionRetryItem]), { projectedCount: 1, attentionCount: 1 }, 'subsequent sync should retry failed projection and then attention')
    assert.equal(projectionStates.get(projectionRetryKey).status, 'projected')
    assert.equal(attentionStates.get(projectionRetryKey).status, 'sent')

    const attentionRetryItem = { ...helperItem, id: 'helper-attention-retry', requestId: 'helper-attention-retry-generation', text: 'attention retry direct seam full text' }
    const attentionRetryKey = keyFor(attentionRetryItem.teamName, attentionRetryItem.id, attentionRetryItem.requestId)
    attentionFailures.add(attentionRetryItem.id)
    const mailboxProjectionCountBeforeAttentionFailure = nativeProjectionMessages.filter(item => item.message.customType === 'agentteam-mailbox').length
    assert.deepEqual(seamRuntime.sync([attentionRetryItem]), { projectedCount: 1, attentionCount: 0 }, 'attention send failure should not count attention')
    assert.equal(projectionStates.get(attentionRetryKey).status, 'projected', 'attention failure should not make projection retryable')
    assert.equal(attentionStates.get(attentionRetryKey).status, 'failed', 'attention send failure should remain retryable')
    assert.deepEqual(seamRuntime.sync([attentionRetryItem]), { projectedCount: 0, attentionCount: 1 }, 'attention retry should not duplicate projection')
    assert.equal(nativeProjectionMessages.filter(item => item.message.customType === 'agentteam-mailbox').length, mailboxProjectionCountBeforeAttentionFailure + 1, 'attention retry should not emit another mailbox projection')
    assert.equal(attentionStates.get(attentionRetryKey).status, 'sent')

  },
}
