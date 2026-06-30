const assert = require('node:assert/strict')

module.exports = {
  name: 'service message routing policy',
  async run(env) {
    const messageApplication = env.helpers.requireDist('app/messageApplication.js')
    const messageRouting = env.helpers.requireDist('app/messageRouting.js')
    assert.equal(messageApplication.isLeaderAttentionPolicySource('question'), true)
    assert.equal(messageApplication.isLeaderAttentionPolicySource('report_done'), true)
    assert.equal(messageApplication.isLeaderAttentionPolicySource('inform'), false)
    assert.equal(messageApplication.enforcePlannerSendPolicy, undefined, 'planner send no-op compatibility helper should be removed')
    assert.equal(messageApplication.shouldMirrorMessageToLeader, undefined, 'peer-to-leader mirror no-op compatibility helper should be removed')

    const routingTeam = {
      members: {
        'team-lead': { name: 'team-lead' },
        alpha: { name: 'alpha' },
        beta: { name: 'beta' },
      },
    }
    const sanitizeDeps = {
      sanitizeWorkerName: name => name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-'),
    }
    let routing = messageRouting.resolveMessageRecipients({
      team: routingTeam,
      sender: 'team-lead',
      params: { to: 'Alpha Worker', message: 'hello' },
      sanitizeWorkerName: sanitizeDeps.sanitizeWorkerName,
    })
    assert.equal(routing.ok, false)
    assert.equal(routing.details.reason, 'explicit_recipient_not_found')

    routing = messageRouting.resolveMessageRecipients({
      team: routingTeam,
      sender: 'team-lead',
      params: { to: ' Alpha ', message: 'hello' },
      sanitizeWorkerName: sanitizeDeps.sanitizeWorkerName,
    })
    assert.equal(routing.ok, true)
    assert.deepEqual(routing.recipients, ['alpha'])
    assert.equal(routing.routing.mode, 'explicit')
    assert.equal(routing.routing.explicitTo, ' Alpha ')
    assert.equal(routing.routing.resolvedRecipient, 'alpha')

    routing = messageRouting.resolveMessageRecipients({
      team: routingTeam,
      sender: 'team-lead',
      params: { to: '   ', message: 'empty' },
      sanitizeWorkerName: sanitizeDeps.sanitizeWorkerName,
    })
    assert.equal(routing.ok, false)
    assert.equal(routing.details.reason, 'explicit_recipient_empty')

    routing = messageRouting.resolveMessageRecipients({
      team: routingTeam,
      sender: 'alpha',
      params: { to: '*', message: 'hello everyone' },
      sanitizeWorkerName: sanitizeDeps.sanitizeWorkerName,
    })
    assert.equal(routing.ok, true)
    assert.deepEqual(routing.recipients.sort(), ['beta', 'team-lead'])
    assert.equal(routing.routing.mode, 'broadcast')
    assert.equal(routing.routing.explicitTo, '*')

    const ownedRoutingTeam = {
      members: {
        'team-lead': { name: 'team-lead' },
        owner: { name: 'owner' },
        other: { name: 'other' },
      },
      tasks: {
        T001: { id: 'T001', owner: 'owner' },
        T002: { id: 'T002' },
        T003: { id: 'T003', owner: 'missing' },
        T004: { id: 'T004', owner: 'team-lead' },
      },
    }
    routing = messageRouting.resolveMessageRecipients({
      team: ownedRoutingTeam,
      sender: 'team-lead',
      params: { taskId: 'T001', message: 'assignment' },
      sanitizeWorkerName: sanitizeDeps.sanitizeWorkerName,
    })
    assert.equal(routing.ok, true)
    assert.deepEqual(routing.recipients, ['owner'])
    assert.equal(routing.routing.mode, 'task_owner')
    assert.equal(routing.routing.taskOwner, 'owner')

    routing = messageRouting.resolveMessageRecipients({
      team: ownedRoutingTeam,
      sender: 'owner',
      params: { taskId: 'T001', message: 'done' },
      sanitizeWorkerName: sanitizeDeps.sanitizeWorkerName,
    })
    assert.equal(routing.ok, true)
    assert.deepEqual(routing.recipients, ['team-lead'])
    assert.equal(routing.routing.mode, 'owner_to_leader')

    routing = messageRouting.resolveMessageRecipients({
      team: ownedRoutingTeam,
      sender: 'team-lead',
      params: { message: 'missing recipient' },
      sanitizeWorkerName: sanitizeDeps.sanitizeWorkerName,
    })
    assert.equal(routing.ok, false)
    assert.equal(routing.details.reason, 'missing_recipient')

    routing = messageRouting.resolveMessageRecipients({
      team: ownedRoutingTeam,
      sender: 'team-lead',
      params: { taskId: 'T999', message: 'missing task' },
      sanitizeWorkerName: sanitizeDeps.sanitizeWorkerName,
    })
    assert.equal(routing.ok, false)
    assert.equal(routing.details.reason, 'task_not_found')

    routing = messageRouting.resolveMessageRecipients({
      team: ownedRoutingTeam,
      sender: 'team-lead',
      params: { taskId: 'T002', message: 'unowned task' },
      sanitizeWorkerName: sanitizeDeps.sanitizeWorkerName,
    })
    assert.equal(routing.ok, false)
    assert.equal(routing.details.reason, 'task_owner_missing')

    routing = messageRouting.resolveMessageRecipients({
      team: ownedRoutingTeam,
      sender: 'team-lead',
      params: { taskId: 'T003', message: 'removed owner' },
      sanitizeWorkerName: sanitizeDeps.sanitizeWorkerName,
    })
    assert.equal(routing.ok, false)
    assert.equal(routing.details.reason, 'task_owner_member_not_found')

    routing = messageRouting.resolveMessageRecipients({
      team: ownedRoutingTeam,
      sender: 'team-lead',
      params: { taskId: 'T004', message: 'leader owned' },
      sanitizeWorkerName: sanitizeDeps.sanitizeWorkerName,
    })
    assert.equal(routing.ok, false)
    assert.equal(routing.details.reason, 'task_owner_is_leader')

    routing = messageRouting.resolveMessageRecipients({
      team: ownedRoutingTeam,
      sender: 'other',
      params: { taskId: 'T001', message: 'non-owner' },
      sanitizeWorkerName: sanitizeDeps.sanitizeWorkerName,
    })
    assert.equal(routing.ok, false)
    assert.equal(routing.details.reason, 'task_sender_not_owner')
  },
}
