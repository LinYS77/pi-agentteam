const assert = require('node:assert/strict')

module.exports = {
  name: 'task list concise defaults',
  async run(env) {
    const { modules, helpers, leaderCtx } = env
    const tool = name => env.pi.__tools.get(name)

    let res = await tool('agentteam_create').execute('task-list-create', {
      team_name: 'task-list-suite',
      description: 'Task list concise output suite',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text, 'Created team task-list-suite')

    const team = modules.state.readTeamState('task-list-suite')
    team.members['worker-one'] = {
      name: 'worker-one',
      role: 'researcher',
      cwd: '/tmp/project-under-test',
      sessionFile: '/tmp/task-list-worker-one.jsonl',
      status: 'idle',
      createdAt: 1,
      updatedAt: 1,
    }

    function task(id, status, updatedAt, options = {}) {
      return {
        id,
        title: options.title || `${status} ${id}`,
        description: options.description || `${status} ${id} description`,
        status,
        owner: options.owner,
        blockedBy: options.blockedBy || [],
        notes: [],
        createdAt: updatedAt - 1,
        updatedAt,
      }
    }

    team.tasks = {
      T001: task('T001', 'done', 101, { owner: 'worker-one' }),
      T002: task('T002', 'done', 102, { owner: 'worker-one' }),
      T003: task('T003', 'done', 103, { owner: 'worker-one' }),
      T004: task('T004', 'done', 104, { owner: 'worker-one' }),
      T005: task('T005', 'done', 105, { owner: 'worker-one' }),
      T006: task('T006', 'done', 106, { owner: 'worker-one' }),
      T007: task('T007', 'done', 107, { owner: 'worker-one' }),
      T008: task('T008', 'open', 300),
      T009: task('T009', 'open', 250, { owner: 'worker-one' }),
      T010: task('T010', 'open', 410, { owner: 'worker-one' }),
      T011: task('T011', 'blocked', 200, { owner: 'worker-one', blockedBy: ['T001'] }),
      T012: task('T012', 'open', 420, { owner: 'worker-one' }),
      T013: task('T013', 'open', 350),
      T014: task('T014', 'done', 500, { owner: 'worker-one' }),
      T015: task('T015', 'blocked', 100, { blockedBy: ['external'] }),
    }
    team.nextTaskSeq = 16
    modules.state.writeTeamState(team)
    modules.state.writeSessionContext(leaderCtx.sessionManager.getSessionFile(), { teamName: 'task-list-suite', memberName: 'team-lead' })

    res = await tool('agentteam_task').execute('task-list-default', {
      action: 'list',
    }, null, () => {}, leaderCtx)
    const defaultLines = res.content[0].text.split('\n')
    const defaultTaskLines = defaultLines.filter(line => /^-? ?T\d+ /.test(line) || /^T\d+ /.test(line))
    assert.equal(defaultTaskLines.length, 10, 'default list should show at most 10 task lines')
    helpers.assertContains(defaultLines[0], 'Showing 10 of 15 tasks')
    helpers.assertContains(defaultLines[0], 'hidden 5')
    helpers.assertContains(defaultLines[0], 'open 5, blocked 2, done 8')
    helpers.assertContains(defaultLines[0], 'Use action=list all=true or limit=N/status=...')
    assert.deepEqual(res.details.shownTaskIds, ['T011', 'T015', 'T013', 'T008', 'T012', 'T010', 'T009', 'T014', 'T007', 'T006'])
    assert.deepEqual(defaultLines, [
      'Showing 10 of 15 tasks (15 total; hidden 5; open 5, blocked 2, done 8; limit 10). Use action=list all=true or limit=N/status=... for more.',
      'T011 [blocked] blocked T011 @worker-one blockedBy=T001',
      'T015 [blocked] blocked T015 blockedBy=external',
      'T013 [open] open T013',
      'T008 [open] open T008',
      'T012 [open] open T012 @worker-one',
      'T010 [open] open T010 @worker-one',
      'T009 [open] open T009 @worker-one',
      'T014 [done] done T014 @worker-one',
      'T007 [done] done T007 @worker-one',
      'T006 [done] done T006 @worker-one',
    ], 'default list output should remain unchanged by task-history query actions')
    assert.equal(res.details.totalCount, 15)
    assert.equal(res.details.matchingCount, 15)
    assert.equal(res.details.shownCount, 10)
    assert.equal(res.details.hiddenCount, 5)
    assert.equal(res.details.hasMore, true)
    assert.deepEqual(res.details.filter, { all: false, limit: 10 })
    assert.equal(Object.prototype.hasOwnProperty.call(res.details, 'tasks'), false, 'list details should not include hidden task objects')
    assert.equal(Object.prototype.hasOwnProperty.call(res.details, 'task'), false, 'list details should stay compact')

    res = await tool('agentteam_task').execute('task-list-limit', {
      action: 'list',
      limit: 5,
    }, null, () => {}, leaderCtx)
    assert.equal(res.content[0].text.split('\n').filter(line => /^T\d+ /.test(line)).length, 5)
    assert.equal(res.details.shownCount, 5)
    assert.equal(res.details.hiddenCount, 10)
    assert.deepEqual(res.details.shownTaskIds, ['T011', 'T015', 'T013', 'T008', 'T012'])
    assert.deepEqual(res.details.filter, { all: false, limit: 5 })

    res = await tool('agentteam_task').execute('task-list-done-default', {
      action: 'list',
      status: 'done',
    }, null, () => {}, leaderCtx)
    helpers.assertContains(res.content[0].text.split('\n')[0], 'matching status=done')
    assert.equal(res.details.totalCount, 15)
    assert.equal(res.details.matchingCount, 8)
    assert.equal(res.details.hiddenCount, 0)
    assert.deepEqual(res.details.shownTaskIds, ['T014', 'T007', 'T006', 'T005', 'T004', 'T003', 'T002', 'T001'])
    assert.deepEqual(res.details.filter, { status: 'done', all: false, limit: 10 })
    assert.ok(res.content[0].text.split('\n').slice(1).every(line => line.includes('[done]')), 'status filter should only show done tasks')

    res = await tool('agentteam_task').execute('task-list-all', {
      action: 'list',
      all: true,
    }, null, () => {}, leaderCtx)
    assert.equal(res.content[0].text.split('\n').filter(line => /^T\d+ /.test(line)).length, 15)
    assert.equal(res.details.shownCount, 15)
    assert.equal(res.details.hiddenCount, 0)
    assert.equal(res.details.hasMore, false)
    assert.deepEqual(res.details.filter, { all: true })

    res = await tool('agentteam_task').execute('task-list-clamped-limit', {
      action: 'list',
      limit: 5000,
    }, null, () => {}, leaderCtx)
    assert.equal(res.details.filter.limit, 100, 'limit should clamp to a sensible maximum and report effective limit')
    assert.equal(res.details.shownCount, 15)
    assert.equal(res.details.hiddenCount, 0)

    modules.state.deleteTeamState('task-list-suite')
  },
}
