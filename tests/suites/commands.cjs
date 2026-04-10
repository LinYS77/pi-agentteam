const assert = require('node:assert/strict')

module.exports = {
  name: 'commands flow',
  async run(env) {
    const { pi, modules, leaderCtx } = env
    const command = name => pi.__commands.get(name)

    const commandNames = [...pi.__commands.keys()]
    const teamIndex = commandNames.indexOf('team')
    const syncIndex = commandNames.indexOf('team-sync')
    assert.ok(teamIndex >= 0 && syncIndex >= 0, 'team and team-sync should both be registered')
    assert.ok(teamIndex < syncIndex, '/team should be registered before /team-sync for higher completion priority')
    assert.ok(!pi.__commands.has('team-synv'), 'team-synv alias should not exist')

    await command('team-sync').handler('', leaderCtx)

    const team = modules.state.readTeamState('full-suite-team')
    modules.state.pushMailboxMessage(team.name, 'team-lead', {
      from: 'research-one',
      to: 'team-lead',
      text: 'Need approval',
      type: 'question',
      taskId: 'T001',
      threadId: 'task:T001',
      requestId: 'approve-1',
      priority: 'high',
      wakeHint: 'soft',
    })

    const originalCustom = leaderCtx.ui.custom
    leaderCtx.ui.custom = async () => ({
      type: 'close',
    })
    await command('team').handler('', leaderCtx)
    leaderCtx.ui.custom = originalCustom

    await command('team-remove-member').handler('plan-one', leaderCtx)
    const teamAfterRemove = modules.state.readTeamState('full-suite-team')
    assert.ok(!teamAfterRemove.members['plan-one'], 'plan-one should be removed')

    await command('team-delete').handler('ignored-name', leaderCtx)
    const deleted = modules.state.readTeamState('full-suite-team')
    assert.equal(deleted, null)

    const cleanupA = modules.state.createInitialTeamState({
      teamName: 'cleanup-a',
      leaderSessionFile: '/tmp/cleanup-a-leader.jsonl',
      leaderCwd: '/tmp',
    })
    const cleanupB = modules.state.createInitialTeamState({
      teamName: 'cleanup-b',
      leaderSessionFile: '/tmp/cleanup-b-leader.jsonl',
      leaderCwd: '/tmp',
    })
    modules.state.writeTeamState(cleanupA)
    modules.state.writeTeamState(cleanupB)

    await command('team-cleanup').handler('', leaderCtx)
    assert.equal(modules.state.readTeamState('cleanup-a'), null)
    assert.equal(modules.state.readTeamState('cleanup-b'), null)

  },
}
