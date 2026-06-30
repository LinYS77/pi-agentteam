const assert = require('node:assert/strict')

module.exports = {
  name: 'service task report workflow',
  async run(env) {
    const { modules } = env
    const taskApplication = env.helpers.requireDist('app/taskApplication.js')
    const taskCharacterizationTeamName = 'task-application-characterization-suite'
    modules.state.deleteTeamState(taskCharacterizationTeamName)
    const taskCharacterizationTeam = modules.state.createInitialTeamState({
      teamName: taskCharacterizationTeamName,
      leaderSessionFile: '/tmp/task-application-characterization-leader.jsonl',
      leaderCwd: '/tmp/task-application-characterization',
    })
    modules.state.upsertMember(taskCharacterizationTeam, {
      name: 'worker-a',
      role: 'researcher',
      cwd: '/tmp/task-application-characterization',
      sessionFile: '/tmp/task-application-characterization-worker-a.jsonl',
      paneId: '%task-char-worker-a',
    })
    modules.state.upsertMember(taskCharacterizationTeam, {
      name: 'worker-b',
      role: 'planner',
      cwd: '/tmp/task-application-characterization',
      sessionFile: '/tmp/task-application-characterization-worker-b.jsonl',
      paneId: '%task-char-worker-b',
    })
    modules.state.writeTeamState(taskCharacterizationTeam)
    const taskAppDeps = overrides => env.patches.withOutboxHandlers({
      ...env.patches.deps,
      ...overrides,
    })
    const callTaskApp = (params, actor = 'team-lead', overrides = {}) => taskApplication.executeTaskApplication({
      params,
      context: { team: modules.state.readTeamState(taskCharacterizationTeamName), actor },
    }, taskAppDeps(overrides))
    const taskArtifactCounts = () => {
      const team = modules.state.readTeamState(taskCharacterizationTeamName)
      return {
        tasks: Object.keys(team.tasks).length,
        reports: Object.keys(team.taskReports).length,
        reportEvents: Object.values(team.taskEvents).filter(event => event.type === 'report_submitted').length,
        events: Object.keys(team.taskEvents).length,
        mailbox: modules.state.readMailbox(taskCharacterizationTeamName, 'team-lead').length,
        projections: Object.keys(modules.state.readLeaderProjectionStore(taskCharacterizationTeamName).projections).length,
        attentions: Object.keys(modules.state.readLeaderAttentionStore(taskCharacterizationTeamName).attentions).length,
        outbox: modules.state.listOutboxEffects(taskCharacterizationTeamName).length,
      }
    }

    let directTaskResult = await callTaskApp({
      action: 'create',
      title: 'Characterize direct task app',
      description: 'Locks executeTaskApplication direct context behavior',
      owner: 'worker-a',
    })
    assert.equal(directTaskResult.statusInvalidationRequested, true, 'direct create should request adapter status invalidation')
    assert.equal(directTaskResult.sideEffectWarnings, undefined, 'successful direct create should not add sideEffectWarnings')
    assert.ok(directTaskResult.text.includes('Created T001'), 'direct create text should remain stable')
    assert.equal(directTaskResult.details.task.id, 'T001')
    assert.equal(directTaskResult.details.task.owner, 'worker-a')
    assert.equal(directTaskResult.details.task.status, 'open')
    const reportSecretTail = 'SECRET_FULL_REPORT_TAIL_DIRECT_ONLY'
    const reportNote = `direct report full body should stay in TaskReport only and not leak into compact list/show/history/reports mailbox notification ${'detail '.repeat(30)}${reportSecretTail}`
    directTaskResult = await callTaskApp({ action: 'report_done', taskId: 'T001', note: reportNote }, 'worker-a')
    assert.equal(directTaskResult.statusInvalidationRequested, true, 'owner report_done should request adapter status invalidation')
    assert.equal(directTaskResult.details.reportOnly, true, 'owner report_done should remain report-only')
    assert.equal(directTaskResult.details.reporterIsOwner, true, 'owner report_done should mark owner reporter')
    let characterizedTeam = modules.state.readTeamState(taskCharacterizationTeamName)
    assert.equal(characterizedTeam.tasks.T001.status, 'open', 'owner report_done must not mutate task status')
    assert.equal(characterizedTeam.tasks.T001.owner, 'worker-a', 'owner report_done must not mutate owner')
    assert.deepEqual(characterizedTeam.tasks.T001.blockedBy, [], 'owner report_done must not mutate blockers')
    const doneReport = Object.values(characterizedTeam.taskReports).find(report => report.taskId === 'T001' && report.type === 'report_done')
    assert.ok(doneReport, 'owner report_done should create a TaskReport')
    assert.equal(doneReport.text, reportNote, 'TaskReport should retain full report body')
    assert.equal(Object.values(characterizedTeam.taskEvents).some(event => event.type === 'report_submitted' && event.reportId === doneReport.id), true, 'owner report_done should create report_submitted TaskEvent')
    let leaderReportMailbox = modules.state.readMailbox(taskCharacterizationTeamName, 'team-lead').find(message => message.metadata?.reportId === doneReport.id)
    assert.ok(leaderReportMailbox, 'owner report_done should create compact leader mailbox notification')
    assert.equal(leaderReportMailbox.metadata.reportId, doneReport.id, 'leader mailbox notification should reference reportId')
    assert.equal(leaderReportMailbox.text.includes(reportNote), false, 'leader mailbox notification text must not contain full report body')
    assert.equal(leaderReportMailbox.summary.includes(reportSecretTail), false, 'leader mailbox summary must not contain non-compact report tail')
    assert.ok(leaderReportMailbox.summary.includes('direct report full body'), 'leader mailbox summary may contain compact report summary')

    for (const readOnlyParams of [
      { action: 'list' },
      { action: 'show', taskId: 'T001' },
      { action: 'history', taskId: 'T001', all: true },
      { action: 'reports', taskId: 'T001' },
    ]) {
      directTaskResult = await callTaskApp(readOnlyParams)
      assert.equal(directTaskResult.statusInvalidationRequested, undefined, `${readOnlyParams.action} should not request status invalidation`)
      assert.equal(directTaskResult.text.includes(reportNote), false, `${readOnlyParams.action} should keep full report body out of compact output`)
      assert.equal(JSON.stringify(directTaskResult.details).includes(reportNote), false, `${readOnlyParams.action} details should keep full report body out of compact output`)
      assert.equal(directTaskResult.text.includes(reportSecretTail), false, `${readOnlyParams.action} should keep non-compact report tail out of output`)
      assert.equal(JSON.stringify(directTaskResult.details).includes(reportSecretTail), false, `${readOnlyParams.action} details should keep non-compact report tail out of output`)
    }
    directTaskResult = await callTaskApp({ action: 'report', taskId: 'T001', reportId: doneReport.id })
    assert.equal(directTaskResult.statusInvalidationRequested, undefined, 'report read should not request status invalidation')
    assert.ok(directTaskResult.text.includes(reportNote), 'action=report should expose full report text')
    assert.equal(directTaskResult.details.text, reportNote, 'action=report details should expose full report text')

    for (const mutationParams of [
      { action: 'assign', taskId: 'T001', owner: 'worker-b', note: 'assign for characterization' },
      { action: 'block', taskId: 'T001', blockedBy: ['waiting'], note: 'block for characterization' },
      { action: 'unblock', taskId: 'T001', note: 'unblock for characterization' },
      { action: 'progress', taskId: 'T001', note: 'progress for characterization' },
      { action: 'close', taskId: 'T001', note: 'close for characterization' },
    ]) {
      const before = taskArtifactCounts()
      directTaskResult = await callTaskApp(mutationParams)
      assert.equal(directTaskResult.statusInvalidationRequested, true, `${mutationParams.action} should request status invalidation`)
      if (mutationParams.action === 'progress') {
        const after = taskArtifactCounts()
        assert.equal(after.events, before.events + 1, 'progress should write exactly one TaskEvent')
        assert.equal(after.reports, before.reports, 'progress should not create TaskReport')
        assert.equal(after.mailbox, before.mailbox, 'progress should not notify leader mailbox')
        assert.equal(after.projections, before.projections, 'progress should not create leader projection')
        assert.equal(after.attentions, before.attentions, 'progress should not create leader attention artifact')
        assert.equal(after.outbox, before.outbox, 'progress should not enqueue outbox effects')
      }
    }

    const beforeDeniedCreate = taskArtifactCounts()
    directTaskResult = await callTaskApp({ action: 'create', title: 'Denied worker create', description: 'denied factual mutation' }, 'worker-a')
    assert.equal(directTaskResult.statusInvalidationRequested, true, 'non-leader denied factual mutation should preserve current invalidation request')
    assert.equal(directTaskResult.details.denied, true)
    assert.equal(directTaskResult.details.reason, undefined, 'leader-only privilege denial currently has no reason field')
    assert.equal(directTaskResult.details.action, 'create')
    assert.equal(directTaskResult.details.actor, 'worker-a')
    assert.ok(directTaskResult.text.includes("Task action 'create' is leader-only for worker-a (researcher). Allowed for non-leaders"), 'denied factual mutation text should remain stable')
    assert.deepEqual(taskArtifactCounts(), beforeDeniedCreate, 'non-leader denied factual mutation should create no task/report/event/mailbox/projection/attention/outbox artifacts')
    assert.equal(modules.state.readTeamState(taskCharacterizationTeamName).tasks.T002, undefined, 'denied worker create should create no task')

    directTaskResult = await callTaskApp({ action: 'create', title: 'Report blocked characterization', description: 'report_blocked task', owner: 'worker-a' })
    const blockedReportTaskId = directTaskResult.details.task.id
    const beforeLeaderLocalReport = taskArtifactCounts()
    directTaskResult = await callTaskApp({ action: 'report_done', taskId: blockedReportTaskId, note: 'leader local done report body' })
    assert.equal(directTaskResult.statusInvalidationRequested, true, 'leader local report_done should request status invalidation')
    assert.equal(directTaskResult.text, `Recorded done report for ${blockedReportTaskId}`, 'leader local report_done text should remain stable')
    assert.equal(directTaskResult.details.reportOnly, true, 'leader local report_done should remain report-only')
    characterizedTeam = modules.state.readTeamState(taskCharacterizationTeamName)
    assert.equal(characterizedTeam.tasks[blockedReportTaskId].status, 'open', 'leader local report_done must not mutate task status')
    assert.equal(characterizedTeam.tasks[blockedReportTaskId].owner, 'worker-a', 'leader local report_done must not mutate owner')
    assert.deepEqual(characterizedTeam.tasks[blockedReportTaskId].blockedBy, [], 'leader local report_done must not mutate blockedBy')
    const leaderLocalReport = Object.values(characterizedTeam.taskReports).find(report => report.taskId === blockedReportTaskId && report.type === 'report_done' && report.author === 'team-lead')
    assert.ok(leaderLocalReport, 'leader local report_done should create a TaskReport')
    assert.equal(leaderLocalReport.text, 'leader local done report body', 'leader local TaskReport should retain full body')
    assert.equal(leaderLocalReport.reporterIsOwner, false, 'leader local TaskReport should record reporterIsOwner=false when leader is not owner')
    assert.equal(Object.values(characterizedTeam.taskEvents).some(event => event.type === 'report_submitted' && event.reportId === leaderLocalReport.id), true, 'leader local report_done should create report_submitted TaskEvent')
    const afterLeaderLocalReport = taskArtifactCounts()
    assert.equal(afterLeaderLocalReport.reports, beforeLeaderLocalReport.reports + 1, 'leader local report_done should create exactly one TaskReport')
    assert.equal(afterLeaderLocalReport.reportEvents, beforeLeaderLocalReport.reportEvents + 1, 'leader local report_done should create exactly one report_submitted event')
    assert.equal(afterLeaderLocalReport.mailbox, beforeLeaderLocalReport.mailbox, 'leader local report_done should not notify leader mailbox')
    assert.equal(afterLeaderLocalReport.projections, beforeLeaderLocalReport.projections, 'leader local report_done should not create leader projection')
    assert.equal(afterLeaderLocalReport.attentions, beforeLeaderLocalReport.attentions, 'leader local report_done should not create leader attention artifact')
    assert.equal(afterLeaderLocalReport.outbox, beforeLeaderLocalReport.outbox, 'leader local report_done should not enqueue outbox effects')
    const beforeNonOwnerBlocked = taskArtifactCounts()
    directTaskResult = await callTaskApp({ action: 'report_blocked', taskId: blockedReportTaskId, note: 'non-owner blocked report denied', blockedBy: ['external'] }, 'worker-b')
    assert.equal(directTaskResult.statusInvalidationRequested, true, 'non-owner report_blocked denial should preserve current invalidation request')
    assert.equal(directTaskResult.details.denied, true)
    assert.equal(directTaskResult.details.reason, 'task_reporter_not_owner')
    assert.equal(directTaskResult.details.taskOwner, 'worker-a')
    assert.ok(directTaskResult.text.includes(`Cannot report_blocked ${blockedReportTaskId}: worker-b is not the task owner (worker-a)`), 'non-owner report_blocked denial text should remain stable')
    assert.deepEqual(taskArtifactCounts(), beforeNonOwnerBlocked, 'non-owner report_blocked denial should create no report/event/mailbox/projection/attention/outbox artifacts')

    const beforeNonOwnerDone = taskArtifactCounts()
    directTaskResult = await callTaskApp({ action: 'report_done', taskId: blockedReportTaskId, note: 'non-owner done report denied' }, 'worker-b')
    assert.equal(directTaskResult.statusInvalidationRequested, true, 'non-owner report_done denial should preserve current invalidation request')
    assert.equal(directTaskResult.details.denied, true)
    assert.equal(directTaskResult.details.reason, 'task_reporter_not_owner')
    assert.equal(directTaskResult.details.taskOwner, 'worker-a')
    assert.ok(directTaskResult.text.includes(`Cannot report_done ${blockedReportTaskId}: worker-b is not the task owner (worker-a)`), 'non-owner report_done denial text should remain stable')
    assert.deepEqual(taskArtifactCounts(), beforeNonOwnerDone, 'non-owner report_done denial should create no report/event/mailbox/projection/attention/outbox artifacts')

    directTaskResult = await callTaskApp({ action: 'report_blocked', taskId: blockedReportTaskId, note: 'owner blocked report full body', blockedBy: ['api access'] }, 'worker-a')
    assert.equal(directTaskResult.statusInvalidationRequested, true, 'owner report_blocked should request status invalidation')
    assert.equal(directTaskResult.details.reportOnly, true, 'owner report_blocked should remain report-only')
    assert.deepEqual(directTaskResult.details.reportedBlockedBy, ['api access'])
    characterizedTeam = modules.state.readTeamState(taskCharacterizationTeamName)
    assert.equal(characterizedTeam.tasks[blockedReportTaskId].status, 'open', 'owner report_blocked must not mutate task status')
    assert.equal(characterizedTeam.tasks[blockedReportTaskId].owner, 'worker-a', 'owner report_blocked must not mutate owner')
    assert.deepEqual(characterizedTeam.tasks[blockedReportTaskId].blockedBy, [], 'owner report_blocked must not mutate task blockedBy')
    const blockedReport = Object.values(characterizedTeam.taskReports).find(report => report.taskId === blockedReportTaskId && report.type === 'report_blocked')
    assert.ok(blockedReport, 'owner report_blocked should create a TaskReport')
    assert.ok(blockedReport.text.includes('owner blocked report full body'), 'blocked TaskReport should retain full report body')
    assert.equal(Object.values(characterizedTeam.taskEvents).some(event => event.type === 'report_submitted' && event.reportId === blockedReport.id), true, 'owner report_blocked should create report_submitted TaskEvent')
    leaderReportMailbox = modules.state.readMailbox(taskCharacterizationTeamName, 'team-lead').find(message => message.metadata?.reportId === blockedReport.id)
    assert.ok(leaderReportMailbox, 'owner report_blocked should create compact leader mailbox notification')
    assert.equal(leaderReportMailbox.metadata.reportId, blockedReport.id, 'blocked report mailbox should reference reportId')
    assert.equal(leaderReportMailbox.text.includes('owner blocked report full body'), false, 'blocked report mailbox notification text must not contain full report body')

    directTaskResult = await callTaskApp({ action: 'create', title: 'Mailbox failure characterization', description: 'mailbox failure prevents attention', owner: 'worker-a' })
    const mailboxFailureTaskId = directTaskResult.details.task.id
    const mailboxFailureEffects = []
    directTaskResult = await callTaskApp({ action: 'report_done', taskId: mailboxFailureTaskId, note: 'mailbox failure full body' }, 'worker-a', {
      pushMailboxMessage: async () => {
        mailboxFailureEffects.push('pushMailbox')
        throw new Error('characterized mailbox failure')
      },
      requestLeaderAttentionIfNeeded: async () => {
        mailboxFailureEffects.push('leaderAttention')
        throw new Error('leader attention must not run after mailbox failure')
      },
    })
    assert.equal(directTaskResult.statusInvalidationRequested, true, 'mailbox-failed report should still request status invalidation')
    assert.equal(directTaskResult.details.leaderMailboxDelivered, false)
    assert.deepEqual(directTaskResult.details.mailboxDeliveryFailed, { recipient: 'team-lead', error: 'characterized mailbox failure' })
    assert.equal(mailboxFailureEffects.includes('pushMailbox'), true, 'mailbox failure path should attempt mailbox delivery')
    assert.equal(mailboxFailureEffects.includes('leaderAttention'), false, 'mailbox failure should prevent leader attention request')
    assert.ok(directTaskResult.details.sideEffectWarnings.some(item => item.kind === 'pushMailbox' && item.error.includes('characterized mailbox failure')), 'mailbox failure should surface side effect warning')

    modules.state.deleteTeamState(taskCharacterizationTeamName)
  },
}
