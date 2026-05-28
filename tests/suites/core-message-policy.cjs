const assert = require('node:assert/strict')

function assertDecision(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(actual[key], value, `expected decision.${key} to equal ${JSON.stringify(value)}`)
  }
}

module.exports = {
  name: 'core message policy',
  async run(env) {
    const core = env.helpers.requireDist('core/messagePolicy.js')
    const source = env.helpers.readSource('core/messagePolicy.ts')

    assert.deepEqual(Object.keys(core).sort(), [
      'MESSAGE_POLICY_AUDIENCE_KINDS',
      'MESSAGE_POLICY_INTENTS',
      'decideMessagePolicy',
      'isMessagePolicyAudienceKind',
      'isMessagePolicyIntent',
      'normalizeMessagePolicyAudienceKind',
      'normalizeMessagePolicyIntent',
    ])

    assert.equal(source.includes('fyi'), false, 'message policy should not mention fyi')
    assert.equal(source.includes('completion_report'), false, 'message policy should not mention completion_report')

    assert.equal(Object.isFrozen(core.MESSAGE_POLICY_INTENTS), true, 'policy intents should be frozen')
    assert.equal(Object.isFrozen(core.MESSAGE_POLICY_AUDIENCE_KINDS), true, 'policy audience kinds should be frozen')
    assertDecision(
      core.decideMessagePolicy({ kind: 'message', messageType: 'assignment', recipientKind: 'worker' }),
      {
        kind: 'message',
        sourceType: 'assignment',
        audienceKind: 'worker',
        intent: 'worker_delivery',
        shouldWake: true,
        wakeHint: 'hard',
        reason: 'assignment routes to worker delivery',
      },
    )

    assertDecision(
      core.decideMessagePolicy({ kind: 'message', messageType: 'question', recipientKind: 'worker' }),
      {
        kind: 'message',
        sourceType: 'question',
        audienceKind: 'worker',
        intent: 'recipient_attention',
        shouldWake: true,
        wakeHint: 'soft',
        reason: 'question routes to recipient attention',
      },
    )

    assertDecision(
      core.decideMessagePolicy({ kind: 'message', messageType: 'question', recipientKind: 'leader' }),
      {
        kind: 'message',
        sourceType: 'question',
        audienceKind: 'leader',
        intent: 'leader_attention',
        shouldWake: true,
        wakeHint: 'soft',
        reason: 'question to leader routes to leader attention',
      },
    )

    assertDecision(
      core.decideMessagePolicy({ kind: 'message', messageType: 'inform', recipientKind: 'leader' }),
      {
        kind: 'message',
        sourceType: 'inform',
        audienceKind: 'leader',
        intent: 'none',
        shouldWake: false,
        wakeHint: 'none',
        reason: 'inform is context-only and does not wake',
      },
    )

    assertDecision(
      core.decideMessagePolicy({ kind: 'task_report', reportType: 'report_done' }),
      {
        kind: 'task_report',
        sourceType: 'report_done',
        audienceKind: 'leader',
        intent: 'leader_attention',
        shouldWake: true,
        wakeHint: 'hard',
        reason: 'report_done routes to leader attention',
      },
    )

    assertDecision(
      core.decideMessagePolicy({ kind: 'task_report', reportType: 'report_blocked' }),
      {
        kind: 'task_report',
        sourceType: 'report_blocked',
        audienceKind: 'leader',
        intent: 'leader_attention',
        shouldWake: true,
        wakeHint: 'hard',
        reason: 'report_blocked routes to leader attention',
      },
    )

    for (const value of ['none', 'worker_delivery', 'recipient_attention', 'leader_attention']) {
      assert.equal(core.isMessagePolicyIntent(value), true, `intent guard should accept ${value}`)
      assert.equal(core.normalizeMessagePolicyIntent(value), value, `intent normalizer should preserve ${value}`)
    }
    for (const value of [undefined, null, 'wake', 'delivery', 'attention']) {
      assert.equal(core.isMessagePolicyIntent(value), false, `intent guard should reject ${String(value)}`)
      assert.equal(core.normalizeMessagePolicyIntent(value), undefined, `intent normalizer should reject ${String(value)}`)
    }

    for (const value of ['leader', 'worker', 'unknown']) {
      assert.equal(core.isMessagePolicyAudienceKind(value), true, `audience guard should accept ${value}`)
      assert.equal(core.normalizeMessagePolicyAudienceKind(value), value, `audience normalizer should preserve ${value}`)
    }
    for (const value of [undefined, null, 'recipient', 'leader_attention']) {
      assert.equal(core.isMessagePolicyAudienceKind(value), false, `audience guard should reject ${String(value)}`)
      assert.equal(core.normalizeMessagePolicyAudienceKind(value), undefined, `audience normalizer should reject ${String(value)}`)
    }
  },
}
