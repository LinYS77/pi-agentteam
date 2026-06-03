const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-task-history-${name}-`))
  try {
    process.env.PI_AGENTTEAM_HOME = home
    modules.state.invalidateSessionContextCache()
    return await fn(home)
  } finally {
    modules.state.invalidateSessionContextCache()
    process.env.PI_AGENTTEAM_HOME = previousHome
    fs.rmSync(home, { recursive: true, force: true })
  }
}

function freshTeam(modules, teamName = 'task-history-suite') {
  return modules.state.createInitialTeamState({
    teamName,
    leaderSessionFile: `/tmp/${teamName}-leader.jsonl`,
    leaderCwd: `/tmp/${teamName}`,
  })
}

function taskFixture(id = 'T001') {
  return {
    id,
    title: 'Keep task history active',
    description: 'Task history without active task notes',
    status: 'open',
    owner: 'worker-a',
    blockedBy: [],
    createdAt: 1,
    updatedAt: 1,
  }
}

function legacyTaskFixture(id = 'T001') {
  return {
    ...taskFixture(id),
    notes: [],
  }
}

module.exports = {
  name: 'task history scaffolding',
  async run(env) {
    const { modules } = env

    await withTempHome(modules, 'fresh', () => {
      const team = freshTeam(modules, 'task-history-fresh')
      assert.deepEqual(team.taskReports, {}, 'fresh team should initialize empty taskReports')
      assert.deepEqual(team.taskEvents, {}, 'fresh team should initialize empty taskEvents')
      assert.deepEqual(team.taskMessageRefs, {}, 'fresh team should initialize empty taskMessageRefs')
      assert.equal(team.nextTaskReportSeq, 1, 'fresh team should initialize nextTaskReportSeq')
      assert.equal(team.nextTaskEventSeq, 1, 'fresh team should initialize nextTaskEventSeq')
      assert.equal(team.nextTaskMessageRefSeq, 1, 'fresh team should initialize nextTaskMessageRefSeq')
    })

    await withTempHome(modules, 'normalize-old-state', home => {
      const oldTeam = freshTeam(modules, 'task-history-old')
      oldTeam.tasks.T001 = legacyTaskFixture('T001')
      oldTeam.tasks.T001.notes.push({ at: 2, author: 'team-lead', text: 'existing note' })
      delete oldTeam.taskReports
      delete oldTeam.taskEvents
      delete oldTeam.taskMessageRefs
      delete oldTeam.nextTaskReportSeq
      delete oldTeam.nextTaskEventSeq
      delete oldTeam.nextTaskMessageRefSeq
      const teamDir = path.join(home, 'teams', oldTeam.name)
      fs.mkdirSync(teamDir, { recursive: true })
      fs.writeFileSync(path.join(teamDir, 'team.json'), `${JSON.stringify(oldTeam, null, 2)}\n`, 'utf8')

      const normalized = modules.state.readTeamState(oldTeam.name)
      assert.ok(normalized, 'old v0.6.1-compatible team should normalize')
      assert.deepEqual(normalized.taskReports, {}, 'normalization should add missing taskReports')
      assert.equal(Object.keys(normalized.taskEvents).length, 1, 'normalization should migrate legacy task notes to taskEvents')
      assert.deepEqual(normalized.taskMessageRefs, {}, 'normalization should add missing taskMessageRefs')
      assert.equal(normalized.nextTaskReportSeq, 1, 'normalization should add missing nextTaskReportSeq')
      assert.equal(normalized.nextTaskEventSeq, 2, 'normalization should advance nextTaskEventSeq after legacy note migration')
      assert.equal(normalized.nextTaskMessageRefSeq, 1, 'normalization should add missing nextTaskMessageRefSeq')
      assert.equal(normalized.tasks.T001.notes, undefined, 'normalization must strip legacy task notes')
      const migratedEvent = Object.values(normalized.taskEvents)[0]
      assert.equal(migratedEvent.type, 'progress', 'ordinary legacy task note should migrate to progress event')
      assert.equal(migratedEvent.summary, 'existing note')
    })

    await withTempHome(modules, 'helpers', () => {
      const team = freshTeam(modules, 'task-history-helpers')
      team.tasks.T001 = taskFixture('T001')
      assert.equal(modules.state.formatTaskReportId(1), 'TR0001')
      assert.equal(modules.state.formatTaskEventId(1), 'TE0001')
      assert.equal(modules.state.formatTaskMessageRefId(1), 'TMR0001')
      assert.equal(modules.state.allocateTaskReportId(team), 'TR0001')
      assert.equal(modules.state.allocateTaskEventId(team), 'TE0001')
      assert.equal(modules.state.allocateTaskMessageRefId(team), 'TMR0001')
      assert.equal(team.nextTaskReportSeq, 2)
      assert.equal(team.nextTaskEventSeq, 2)
      assert.equal(team.nextTaskMessageRefSeq, 2)

      const report = modules.state.appendTaskReport(team, {
        taskId: 'T001',
        type: 'report_done',
        author: 'worker-a',
        text: 'done report full artifact',
        summary: 'done report',
        createdAt: 10,
        threadId: 'task:T001',
        reporterIsOwner: true,
        statusAtReport: 'open',
        ownerAtReport: 'worker-a',
        mailboxMessageId: 'mailbox-report-1',
      })
      assert.equal(report.id, 'TR0002')
      assert.equal(report.createdAt, 10)
      assert.equal(report.reportOnly, true)
      assert.equal(report.reporterIsOwner, true)
      assert.equal(report.statusAtReport, 'open')
      assert.equal(report.ownerAtReport, 'worker-a')
      assert.equal(report.mailboxMessageId, 'mailbox-report-1')
      assert.equal(team.nextTaskReportSeq, 3)
      assert.equal(team.taskReports.TR0002, report)

      const event = modules.state.appendTaskEvent(team, {
        taskId: 'T001',
        type: 'assigned',
        by: 'team-lead',
        summary: 'assigned to worker-a',
        at: 12,
        data: { owner: 'worker-a' },
      })
      assert.equal(event.id, 'TE0002')
      assert.equal(event.by, 'team-lead')
      assert.equal(event.summary, 'assigned to worker-a')
      assert.deepEqual(event.data, { owner: 'worker-a' })
      assert.equal(team.nextTaskEventSeq, 3)
      assert.equal(team.taskEvents.TE0002, event)

      const ref = modules.state.appendTaskMessageRef(team, {
        taskId: 'T001',
        mailboxMessageId: 'mailbox-1',
        from: 'worker-a',
        to: 'team-lead',
        type: 'report_done',
        threadId: 'task:T001',
        summary: 'done',
        priority: 'high',
        wakeHint: 'hard',
        reportId: report.id,
        diagnostic: true,
        createdAt: 14,
      })
      assert.equal(ref.id, 'TMR0002')
      assert.equal(ref.type, 'report_done')
      assert.equal(ref.createdAt, 14)
      assert.equal(ref.priority, 'high')
      assert.equal(ref.wakeHint, 'hard')
      assert.equal(ref.reportId, report.id)
      assert.equal(ref.diagnostic, true)
      assert.equal(team.nextTaskMessageRefSeq, 3)
      assert.equal(team.taskMessageRefs.TMR0002, ref)

      const deduped = modules.state.appendTaskMessageRef(team, {
        taskId: 'T001',
        mailboxMessageId: 'mailbox-1',
        from: 'team-lead',
        to: 'worker-a',
        type: 'inform',
        createdAt: 99,
      })
      assert.equal(deduped, ref, 'message refs should dedupe by mailboxMessageId')
      assert.equal(team.nextTaskMessageRefSeq, 3, 'deduped message ref should not consume a sequence id')
      assert.equal(Object.keys(team.taskMessageRefs).length, 1)

      const laterReport = modules.state.appendTaskReport(team, {
        taskId: 'T001',
        type: 'report_blocked',
        author: 'worker-a',
        text: 'blocked report',
        createdAt: 20,
        reporterIsOwner: true,
        reportedBlockedBy: ['leader decision'],
        statusAtReport: 'blocked',
        ownerAtReport: 'worker-a',
      })
      assert.equal(laterReport.summary, 'blocked report')
      assert.deepEqual(laterReport.reportedBlockedBy, ['leader decision'])
      assert.equal(modules.state.latestTaskReport(team, 'T001'), laterReport)
      assert.equal(modules.state.latestTaskActivity(team, 'T001'), laterReport)
      assert.deepEqual(modules.state.taskHistoryCounts(team, 'T001'), {
        reports: 2,
        events: 1,
        messageRefs: 1,
      })
      assert.deepEqual(modules.state.taskHistorySummary(team, 'T001'), {
        taskId: 'T001',
        reports: 2,
        events: 1,
        messageRefs: 1,
        latestReport: laterReport,
        latestActivity: laterReport,
      })
    })

    await withTempHome(modules, 'read-model', () => {
      const team = freshTeam(modules, 'task-history-read-model')
      team.tasks.T001 = taskFixture('T001')
      team.tasks.T002 = taskFixture('T002')

      assert.equal(
        modules.state.compactTaskHistorySummary('  compact\nsummary\twith   whitespace  '),
        'compact summary with whitespace',
        'compact summary should preserve v0.6.2 whitespace folding',
      )
      const exactly140 = 'x'.repeat(140)
      const over140 = `${'x'.repeat(140)}y`
      assert.equal(modules.state.compactTaskHistorySummary(exactly140), exactly140, '140-character summaries should not truncate')
      assert.equal(
        modules.state.compactTaskHistorySummary(over140),
        `${'x'.repeat(137)}...`,
        'over-140 summaries should truncate to 137 characters plus ellipsis',
      )

      const reportFullText = 'full report body must only appear through explicit action=report'
      const mailboxFullBody = 'mailbox body must not leak through task message refs'
      const firstReport = modules.state.appendTaskReport(team, {
        taskId: 'T001',
        type: 'report_done',
        author: 'worker-a',
        text: reportFullText,
        summary: 'first compact report',
        createdAt: 10,
        reporterIsOwner: true,
        statusAtReport: 'open',
        ownerAtReport: 'worker-a',
      })
      const secondReport = modules.state.appendTaskReport(team, {
        taskId: 'T001',
        type: 'report_blocked',
        author: 'worker-a',
        text: 'second full report body',
        summary: 'second compact report',
        createdAt: 10,
        reporterIsOwner: true,
        reportedBlockedBy: ['leader decision'],
        statusAtReport: 'blocked',
        ownerAtReport: 'worker-a',
      })
      const earlyEvent = modules.state.appendTaskEvent(team, {
        taskId: 'T001',
        type: 'created',
        by: 'team-lead',
        at: 5,
        summary: 'created event',
      })
      const tieEvent = modules.state.appendTaskEvent(team, {
        taskId: 'T001',
        type: 'progress',
        by: 'worker-a',
        at: 10,
        summary: 'same timestamp event',
      })
      const tieRef = modules.state.appendTaskMessageRef(team, {
        taskId: 'T001',
        mailboxMessageId: 'mailbox-read-model-1',
        from: 'team-lead',
        to: 'worker-a',
        type: 'assignment',
        createdAt: 10,
        summary: 'compact mailbox ref',
        metadata: { copiedBodyThatMustStayOut: mailboxFullBody },
      })
      modules.state.appendTaskReport(team, {
        taskId: 'T002',
        type: 'report_done',
        author: 'worker-b',
        text: 'other task report body',
        summary: 'other task report',
        createdAt: 99,
        reporterIsOwner: true,
        statusAtReport: 'open',
        ownerAtReport: 'worker-b',
      })

      assert.deepEqual(modules.state.taskHistoryCounts(team, 'T001'), {
        reports: 2,
        events: 2,
        messageRefs: 1,
      }, 'shared read model should count all task-history artifact types for one task only')
      assert.equal(modules.state.latestTaskReport(team, 'T001'), secondReport, 'latest report tie-break should use timestamp then id descending')
      assert.equal(modules.state.latestTaskActivity(team, 'T001'), secondReport, 'latest activity tie-break should use timestamp then id descending across artifact kinds')

      const timeline = modules.state.taskHistoryTimelineItems(team, 'T001')
      assert.deepEqual(
        timeline.map(item => item.id),
        [earlyEvent.id, tieEvent.id, tieRef.id, firstReport.id, secondReport.id],
        'timeline should order by timestamp then id ascending across events/messageRefs/reports',
      )
      assert.deepEqual(
        modules.state.taskHistoryTimelineItems(team, 'T001', { includeMessages: false }).map(item => item.id),
        [earlyEvent.id, tieEvent.id, firstReport.id, secondReport.id],
        'timeline should honor includeMessages=false',
      )

      const compactSummary = modules.state.taskHistoryCompactSummary(team, 'T001')
      assert.equal(compactSummary.latestReport.id, secondReport.id)
      assert.equal(compactSummary.latestActivity.kind, 'report')
      assert.equal(compactSummary.latestActivity.id, secondReport.id)
      assert.equal(JSON.stringify(compactSummary).includes(reportFullText), false, 'compact summary must not expose full TaskReport.text')
      assert.equal(JSON.stringify(compactSummary).includes(mailboxFullBody), false, 'compact summary must not expose mailbox message bodies or ref metadata')

      const compactReports = modules.state.compactTaskReportsForTask(team, 'T001')
      assert.equal(compactReports.length, 2)
      assert.equal(compactReports[0].text, undefined, 'compact report metadata must exclude full report text')
      assert.equal(compactReports[0].summary, 'first compact report')
      assert.deepEqual(compactReports[1].reportedBlockedBy, ['leader decision'])

      const compactRows = modules.state.compactTaskHistoryTimeline(team, 'T001')
      assert.deepEqual(compactRows.map(row => row.id), timeline.map(item => item.id), 'compact timeline should preserve shared timeline ordering')
      assert.equal(JSON.stringify(compactRows).includes(reportFullText), false, 'compact timeline rows must not expose full report text')
      assert.equal(JSON.stringify(compactRows).includes(mailboxFullBody), false, 'compact timeline rows must not expose mailbox message bodies')
      const compactRef = compactRows.find(row => row.kind === 'messageRef')
      assert.equal(compactRef.summary, 'compact mailbox ref')
      assert.equal(compactRef.reportId, undefined, 'app compact messageRef shape should stay minimal')

      const displaySummary = modules.state.taskHistoryDisplaySummary(team, 'T001')
      assert.equal(displaySummary.latestReport.id, secondReport.id)
      assert.equal(displaySummary.latestActivity.kind, 'report')
      assert.equal(JSON.stringify(displaySummary).includes(reportFullText), false, 'panel/display summary must not expose full TaskReport.text')
    })

    await withTempHome(modules, 'migration', () => {
      const team = freshTeam(modules, 'task-history-migration')
      team.tasks.T001 = legacyTaskFixture('T001')
      team.tasks.T002 = {
        ...legacyTaskFixture('T002'),
        owner: 'plan-one',
        status: 'done',
      }
      const t001 = team.tasks.T001
      const t002 = team.tasks.T002
      t001.notes.push(
        {
          at: 1,
          author: 'team-lead',
          text: 'Task created',
          threadId: 'task:T001',
          messageType: 'inform',
          metadata: { metadataVersion: 1, sourceKind: 'task_note', displayMode: 'visible', action: 'create' },
        },
        {
          at: 2,
          author: 'team-lead',
          text: 'Assigned to worker-a on create',
          threadId: 'task:T001',
          messageType: 'assignment',
          metadata: { metadataVersion: 1, sourceKind: 'task_note', displayMode: 'visible', action: 'assign', owner: 'worker-a' },
        },
        {
          at: 3,
          author: 'team-lead',
          text: 'Task blocked',
          threadId: 'task:T001',
          messageType: 'inform',
          metadata: { metadataVersion: 1, sourceKind: 'task_note', displayMode: 'visible', action: 'block', blockedBy: ['external decision'] },
        },
        {
          at: 4,
          author: 'team-lead',
          text: 'Task unblocked',
          threadId: 'task:T001',
          messageType: 'inform',
          metadata: { metadataVersion: 1, sourceKind: 'task_note', displayMode: 'visible', action: 'unblock' },
        },
        {
          at: 5,
          author: 'worker-a',
          text: 'ordinary visible progress note',
          threadId: 'task:T001',
          messageType: 'inform',
          metadata: { metadataVersion: 1, sourceKind: 'task_note', displayMode: 'visible', action: 'note' },
        },
        {
          at: 6,
          author: 'worker-a',
          text: 'done report body\nwith details',
          threadId: 'task:T001',
          messageType: 'report_done',
          metadata: { metadataVersion: 1, sourceKind: 'task_report', displayMode: 'visible', reportOnly: true, reporterIsOwner: true, summary: 'done summary' },
        },
        {
          at: 7,
          author: 'team-lead',
          text: '[communication ref]',
          threadId: 'task:T001',
          messageType: 'assignment',
          linkedMessageId: 'mailbox-formal-1',
          metadata: {
            metadataVersion: 1,
            sourceKind: 'communication_ref',
            displayMode: 'hidden',
            kind: 'communication_ref',
            hidden: true,
            linkedMailboxMessageId: 'mailbox-formal-1',
            linkedIds: { mailboxMessageId: 'mailbox-formal-1', taskId: 'T001', threadId: 'task:T001' },
            from: 'team-lead',
            to: 'worker-a',
            taskId: 'T001',
            threadId: 'task:T001',
            messageType: 'assignment',
            priority: 'high',
            wakeHint: 'hard',
          },
          hidden: true,
        },
        {
          at: 8,
          author: 'worker-a',
          text: 'Linked message: legacy copied body should not be copied to ref',
          threadId: 'task:T001',
          messageType: 'inform',
          linkedMessageId: 'mailbox-legacy-1',
        },
        {
          at: 9,
          author: 'team-lead',
          text: 'Owner worker-a removed from team; task returned to open',
        },
        {
          at: 10,
          author: 'system',
          text: 'hidden diagnostic note',
          metadata: { hidden: true, reason: 'diagnostic' },
          hidden: true,
        },
      )
      t002.notes.push({
        at: 11,
        author: 'plan-one',
        text: 'Blocked report\nBlocked by: leader decision',
        threadId: 'task:T002',
        messageType: 'report_blocked',
        metadata: {
          metadataVersion: 1,
          sourceKind: 'task_report',
          displayMode: 'visible',
          reportOnly: true,
          reporterIsOwner: true,
          reportedBlockedBy: ['leader decision'],
        },
      })
      const originalT001NoteCount = t001.notes.length
      const originalT002NoteCount = t002.notes.length

      const first = modules.state.migrateTaskNotesToHistory(team)
      const migrated = first.team
      assert.equal(first.reportsAdded, 2)
      assert.equal(first.eventsAdded, 9)
      assert.equal(first.messageRefsAdded, 2)
      assert.equal(first.notesRemoved, originalT001NoteCount + originalT002NoteCount, 'migration should count stripped legacy notes')
      assert.equal(migrated.tasks.T001.notes, undefined, 'migration should strip legacy task notes')
      assert.equal(migrated.tasks.T002.notes, undefined, 'migration should strip report task notes')

      const reports = Object.values(migrated.taskReports).sort((a, b) => a.createdAt - b.createdAt)
      assert.equal(reports.length, 2)
      assert.equal(reports[0].id, 'TR0001')
      assert.equal(reports[0].taskId, 'T001')
      assert.equal(reports[0].type, 'report_done')
      assert.equal(reports[0].summary, 'done summary')
      assert.equal(reports[0].createdAt, 6)
      assert.equal(reports[0].reportOnly, true)
      assert.equal(reports[0].reporterIsOwner, true)
      assert.equal(reports[0].statusAtReport, 'open')
      assert.equal(reports[0].ownerAtReport, 'worker-a')
      assert.equal(reports[1].taskId, 'T002')
      assert.equal(reports[1].type, 'report_blocked')
      assert.equal(reports[1].statusAtReport, 'blocked', 'done task report_blocked migration should fall back to blocked statusAtReport')
      assert.deepEqual(reports[1].reportedBlockedBy, ['leader decision'])

      const events = Object.values(migrated.taskEvents).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
      assert.deepEqual(events.map(event => event.type), [
        'created',
        'assigned',
        'blocked',
        'unblocked',
        'progress',
        'report_submitted',
        'owner_removed',
        'migrated',
        'report_submitted',
      ])
      assert.equal(events.find(event => event.type === 'progress').data.source, 'legacy_note')
      assert.equal(events.find(event => event.type === 'owner_removed').data.memberName, 'worker-a')
      assert.equal(events.find(event => event.type === 'migrated').data.hidden, true)
      assert.equal(events.filter(event => event.type === 'report_submitted')[0].reportId, reports[0].id)
      assert.equal(events.filter(event => event.type === 'report_submitted')[1].reportId, reports[1].id)

      const refs = Object.values(migrated.taskMessageRefs).sort((a, b) => a.createdAt - b.createdAt)
      assert.equal(refs.length, 2)
      assert.equal(refs[0].id, 'TMR0001')
      assert.equal(refs[0].mailboxMessageId, 'mailbox-formal-1')
      assert.equal(refs[0].from, 'team-lead')
      assert.equal(refs[0].to, 'worker-a')
      assert.equal(refs[0].type, 'assignment')
      assert.equal(refs[0].priority, 'high')
      assert.equal(refs[0].wakeHint, 'hard')
      assert.equal(refs[0].summary, undefined, 'communication ref migration should not copy note body into ref summary')
      assert.equal(refs[1].mailboxMessageId, 'mailbox-legacy-1')
      assert.equal(refs[1].type, 'inform')
      assert.equal(refs[1].summary, undefined, 'legacy linked message migration should not copy linked note body into ref summary')

      const second = modules.state.migrateTaskNotesToHistory(migrated)
      assert.equal(second.reportsAdded, 0, 'repeated migration should not duplicate reports')
      assert.equal(second.eventsAdded, 0, 'repeated migration should not duplicate events')
      assert.equal(second.messageRefsAdded, 0, 'repeated migration should not duplicate refs')
      assert.equal(Object.keys(second.team.taskReports).length, 2)
      assert.equal(Object.keys(second.team.taskEvents).length, 9)
      assert.equal(Object.keys(second.team.taskMessageRefs).length, 2)
    })

    await withTempHome(modules, 'validation-and-merge', () => {
      const team = freshTeam(modules, 'task-history-validation')
      team.tasks.T001 = taskFixture('T001')
      const report = modules.state.appendTaskReport(team, {
        taskId: 'T001',
        type: 'report_done',
        author: 'worker-a',
        text: 'done report',
        createdAt: 20,
        reporterIsOwner: true,
        statusAtReport: 'open',
        ownerAtReport: 'worker-a',
      })
      const event = modules.state.appendTaskEvent(team, {
        taskId: 'T001',
        type: 'report_submitted',
        by: 'worker-a',
        summary: 'done report',
        reportId: report.id,
        at: 20,
      })
      const ref = modules.state.appendTaskMessageRef(team, {
        taskId: 'T001',
        mailboxMessageId: 'mailbox-merge-1',
        from: 'worker-a',
        to: 'team-lead',
        type: 'report_done',
        createdAt: 20,
        reportId: report.id,
      })
      assert.deepEqual(modules.state.validatePersistedTeamState(team), [], 'valid task-history collections should pass persisted-state validation')

      const invalid = JSON.parse(JSON.stringify(team))
      invalid.taskReports.TRBAD = { ...report, id: 'TRBAD', type: 'not_a_report', statusAtReport: 'done' }
      invalid.taskEvents.TEBAD = { ...event, id: 'TEBAD', type: 'not_an_event' }
      invalid.taskMessageRefs.TMRBAD = { ...ref, id: 'TMRBAD', mailboxMessageId: 'mailbox-bad', type: 'not_a_message' }
      const reasonCodes = modules.state.validatePersistedTeamState(invalid).map(reason => reason.code)
      assert.ok(reasonCodes.includes('unsupported_message_type'), 'invalid report/ref types should be rejected')
      assert.ok(reasonCodes.includes('unsupported_task_report_status_at_report'), 'invalid report statusAtReport should be rejected')
      assert.ok(reasonCodes.includes('unsupported_task_event_type'), 'invalid task event type should be rejected')

      const current = JSON.parse(JSON.stringify(team))
      const incoming = JSON.parse(JSON.stringify(team))
      current.taskReports = { TR9000: { ...report, id: 'TR9000', createdAt: 100, summary: 'current report' } }
      incoming.taskReports = { TR9000: { ...report, id: 'TR9000', createdAt: 101, summary: 'incoming report' } }
      current.taskEvents = { TE9000: { ...event, id: 'TE9000', at: 100, summary: 'current event' } }
      incoming.taskEvents = { TE9000: { ...event, id: 'TE9000', at: 101, summary: 'incoming event' } }
      current.taskMessageRefs = { TMR9000: { ...ref, id: 'TMR9000', mailboxMessageId: 'mailbox-same', createdAt: 100, summary: 'current ref' } }
      incoming.taskMessageRefs = { TMR9001: { ...ref, id: 'TMR9001', mailboxMessageId: 'mailbox-same', createdAt: 101, summary: 'incoming ref' } }
      const merged = modules.state.mergeTeamStates(current, incoming)
      assert.equal(merged.taskReports.TR9000.summary, 'incoming report', 'task reports should merge by id and latest timestamp')
      assert.equal(merged.taskEvents.TE9000.summary, 'incoming event', 'task events should merge by id and latest timestamp')
      const mergedRefs = Object.values(merged.taskMessageRefs)
      assert.equal(mergedRefs.length, 1, 'task message refs should dedupe by mailboxMessageId during merge')
      assert.equal(mergedRefs[0].id, 'TMR9001')
      assert.equal(mergedRefs[0].summary, 'incoming ref')
    })

    await withTempHome(modules, 'notes-retired', () => {
      const team = freshTeam(modules, 'task-history-notes')
      team.tasks.T001 = taskFixture('T001')
      assert.equal(Object.prototype.hasOwnProperty.call(team.tasks.T001, 'notes'), false, 'active task fixtures should not expose notes')
      assert.equal(modules.state.appendTaskNote, undefined, 'appendTaskNote helper should be retired')
      assert.equal(modules.state.appendCommunicationRefNote, undefined, 'appendCommunicationRefNote helper should be retired')
      assert.equal(modules.state.isCommunicationReferenceNote, undefined, 'task-note inference helper should be retired')
      assert.equal(modules.state.inferTaskNoteSourceKind, undefined, 'task-note source inference helper should be retired')

      const legacy = JSON.parse(JSON.stringify(team))
      legacy.tasks.T001.notes = [{ at: 30, author: 'team-lead', text: 'legacy progress' }]
      const migrated = modules.state.migrateTaskNotesToHistory(legacy)
      assert.equal(migrated.notesRemoved, 1, 'migration should remove legacy notes')
      assert.equal(migrated.team.tasks.T001.notes, undefined, 'migration output should strip legacy notes')
      assert.equal(Object.keys(migrated.team.taskEvents).length, 1, 'legacy ordinary note should migrate to TaskEvent')
      assert.deepEqual(migrated.team.taskReports, {}, 'ordinary legacy note should not populate taskReports')
      assert.deepEqual(migrated.team.taskMessageRefs, {}, 'ordinary legacy note should not populate taskMessageRefs')
    })
  },
}
