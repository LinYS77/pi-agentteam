const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PANEL_SIDECAR_MAILBOX_SENTINEL = 'PANEL_SIDECAR_MAILBOX_BODY_SHOULD_NOT_LEAK'
const PANEL_SIDECAR_REPORT_SENTINEL = 'PANEL_SIDECAR_REPORT_BODY_SHOULD_NOT_LEAK'

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-${name}-`))
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

function createLegacyFixture(modules, teamName, overrides = {}) {
  const now = Date.now()
  const teamDir = path.join(modules.state.getTeamsDir(), modules.state.sanitizeName(teamName))
  const state = {
    version: 1,
    name: modules.state.sanitizeName(teamName),
    description: 'legacy fixture should quarantine only',
    createdAt: now,
    leaderSessionFile: `/tmp/${teamName}-leader.jsonl`,
    leaderCwd: '/tmp/legacy-project',
    members: {
      'team-lead': {
        name: 'team-lead',
        role: 'leader',
        cwd: '/tmp/legacy-project',
        sessionFile: `/tmp/${teamName}-leader.jsonl`,
        status: 'idle',
        createdAt: now,
        updatedAt: now,
      },
      'legacy-worker': {
        name: 'legacy-worker',
        role: 'researcher',
        cwd: '/tmp/legacy-project',
        sessionFile: `/tmp/${teamName}-worker.jsonl`,
        status: 'idle',
        createdAt: now,
        updatedAt: now,
      },
    },
    tasks: {
      T001: {
        id: 'T001',
        title: 'Legacy completed task',
        description: 'old completed must not render active',
        status: 'completed',
        owner: 'legacy-worker',
        blockedBy: [],
        notes: [
          { at: now, author: 'legacy-worker', text: 'old done note', messageType: 'completion_report' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      T002: {
        id: 'T002',
        title: 'Legacy in progress task',
        description: 'old in progress must not render active',
        status: 'in_progress',
        owner: 'legacy-worker',
        blockedBy: [],
        notes: [
          { at: now, author: 'legacy-worker', text: 'old fyi note', messageType: 'fyi' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      T003: {
        id: 'T003',
        title: 'Legacy pending task',
        description: 'old pending must not render active',
        status: 'pending',
        blockedBy: [],
        notes: [
          { at: now, author: 'legacy-worker', text: 'old blocked note', messageType: 'blocked' },
        ],
        createdAt: now,
        updatedAt: now,
      },
    },
    events: [],
    nextTaskSeq: 4,
    revision: 1,
    ...overrides,
  }
  writeJson(path.join(teamDir, 'state.json'), state)
  writeJson(path.join(teamDir, 'mailboxes', 'team-lead.json'), [
    {
      id: 'legacy-fyi-mail',
      from: 'legacy-worker',
      to: 'team-lead',
      text: 'old fyi mail should quarantine',
      type: 'fyi',
      createdAt: now,
    },
    {
      id: 'legacy-blocked-mail',
      from: 'legacy-worker',
      to: 'team-lead',
      text: 'old blocked mail should quarantine',
      type: 'blocked',
      createdAt: now + 1,
    },
  ])
  return teamDir
}

function createFreshTeam(modules, teamName) {
  const team = modules.state.createInitialTeamState({
    teamName,
    leaderSessionFile: `/tmp/${teamName}-leader.jsonl`,
    leaderCwd: '/tmp/fresh-project',
  })
  modules.state.upsertMember(team, {
    name: 'fresh-worker',
    role: 'researcher',
    cwd: '/tmp/fresh-project',
    sessionFile: `/tmp/${teamName}-worker.jsonl`,
    status: 'idle',
  })
  const task = modules.state.createTask(team, { title: 'Fresh vNext task', description: 'loads normally', owner: 'fresh-worker' })
  task.status = 'open'
  modules.state.appendTaskEvent(team, {
    taskId: task.id,
    type: 'progress',
    by: 'team-lead',
    summary: 'fresh progress',
    at: Date.now(),
  })
  modules.state.writeTeamState(team)
  modules.state.pushMailboxMessage(team.name, 'team-lead', {
    from: 'fresh-worker',
    to: 'team-lead',
    text: 'fresh question',
    type: 'question',
  })
  return team
}

function createPanelSidecarTeam(modules, teamName) {
  const now = Date.now()
  const team = modules.state.createInitialTeamState({
    teamName,
    leaderSessionFile: `/tmp/${teamName}-leader.jsonl`,
    leaderCwd: '/tmp/panel-sidecar-project',
  })
  modules.state.upsertMember(team, {
    name: 'researcher-one',
    role: 'researcher',
    cwd: '/tmp/panel-sidecar-project',
    sessionFile: `/tmp/${teamName}-researcher-one.jsonl`,
    status: 'idle',
  })
  const task = modules.state.createTask(team, { title: 'Panel sidecar task', description: 'compact panel sidecar fixture', owner: 'researcher-one' })
  const report = modules.state.appendTaskReport(team, {
    taskId: task.id,
    type: 'report_done',
    author: 'researcher-one',
    text: PANEL_SIDECAR_REPORT_SENTINEL,
    summary: 'compact panel sidecar report summary',
    createdAt: now,
    threadId: `task:${task.id}`,
    reporterIsOwner: true,
    statusAtReport: 'open',
    ownerAtReport: 'researcher-one',
  })
  modules.state.writeTeamState(team)
  const mailboxMessage = modules.state.pushMailboxMessage(team.name, 'team-lead', {
    id: 'panel-sidecar-mailbox-message',
    from: 'researcher-one',
    to: 'team-lead',
    text: PANEL_SIDECAR_MAILBOX_SENTINEL,
    summary: 'compact panel sidecar mailbox summary',
    type: 'report_done',
    taskId: task.id,
    metadata: { reportId: report.id },
  })
  const teamDir = modules.state.getTeamDir(team.name)
  writeJson(path.join(teamDir, 'inboxes', 'researcher-one.panel.json'), {
    version: 1,
    teamName: team.name,
    memberName: 'researcher-one',
    updatedAt: now,
    sourceMtimeMs: now,
    items: [],
  })
  writeJson(path.join(teamDir, 'inboxes', 'team-lead.panel.json'), {
    version: 1,
    teamName: team.name,
    memberName: 'team-lead',
    updatedAt: now,
    sourceMtimeMs: now,
    items: [
      {
        id: mailboxMessage.id,
        from: mailboxMessage.from,
        to: mailboxMessage.to,
        summary: mailboxMessage.summary,
        type: mailboxMessage.type,
        taskId: mailboxMessage.taskId,
        metadata: mailboxMessage.metadata,
        createdAt: mailboxMessage.createdAt,
      },
    ],
  })
  return { team, task, report, mailboxMessage }
}

module.exports = {
  name: 'legacy persisted state quarantine',
  async run(env) {
    const { modules, helpers, pi } = env
    const command = name => pi.__commands.get(name)

    await withTempHome(modules, 'legacy-quarantine', home => {
      const legacyDir = createLegacyFixture(modules, 'legacy-suite')
      assert.equal(fs.existsSync(legacyDir), true, 'legacy fixture should exist before read')

      assert.throws(
        () => modules.state.writeTeamState({
          version: 1,
          name: 'bad-write-suite',
          createdAt: Date.now(),
          leaderCwd: '/tmp/bad-write',
          members: {},
          tasks: {
            T001: { id: 'T001', title: 'bad write', description: 'reject', status: 'completed', blockedBy: [], notes: [], createdAt: Date.now(), updatedAt: Date.now() },
          },
          events: [],
          nextTaskSeq: 2,
        }),
        /Unsupported vNext team state write/,
        'new writes must reject unsupported legacy task statuses instead of persisting them',
      )
      const badWriteDir = path.join(modules.state.getTeamsDir(), 'bad-write-suite')
      assert.equal(fs.existsSync(path.join(badWriteDir, 'team.json')), false, 'rejected bad writes must not create active team files')

      const loaded = modules.state.readTeamState('legacy-suite')
      assert.equal(loaded, null, 'legacy team should reject/quarantine on read')
      assert.equal(fs.existsSync(legacyDir), false, 'legacy team dir should be moved out of active teams')
      assert.deepEqual(modules.state.listTeams().map(team => team.name), [], 'quarantined team must not be active-listed')

      const quarantined = modules.state.listQuarantinedTeams()
      assert.equal(quarantined.length, 1, 'one team should be quarantined')
      assert.equal(quarantined[0].teamName, 'legacy-suite')
      assert.ok(quarantined[0].quarantineDir.includes(path.join('_quarantine', 'vnext-unsupported')), 'quarantine path should use vnext unsupported bucket')
      const reasonsPath = path.join(quarantined[0].quarantineDir, 'reasons.json')
      assert.equal(fs.existsSync(reasonsPath), true, 'reasons.json should be persisted next to quarantined data')
      const reasonsRecord = JSON.parse(fs.readFileSync(reasonsPath, 'utf8'))
      const reasonTuples = reasonsRecord.reasons.map(item => [item.code, item.file, item.path, item.field, item.value])
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_layout_entry' && item[1] === 'state.json'), 'old state.json active layout must be rejected before any fallback read')
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_layout_entry' && item[1] === 'mailboxes'), 'old mailboxes/ active layout must be rejected before any fallback read')
      assert.ok(modules.state.validatePersistedTeamDir('legacy-suite').length === 0, 'quarantined legacy team should no longer validate as an active team')
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_task_status' && item[2] === '$.tasks.T001.status' && item[4] === 'completed'))
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_task_status' && item[2] === '$.tasks.T002.status' && item[4] === 'in_progress'))
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_task_status' && item[2] === '$.tasks.T003.status' && item[4] === 'pending'))
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_task_notes' && item[2] === '$.tasks.T001.notes'))
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_task_notes' && item[2] === '$.tasks.T002.notes'))
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_task_notes' && item[2] === '$.tasks.T003.notes'))
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_message_type' && item[1] === path.join('mailboxes', 'team-lead.json') && item[4] === 'fyi'))
      assert.ok(reasonTuples.some(item => item[0] === 'legacy_message_type' && item[1] === path.join('mailboxes', 'team-lead.json') && item[4] === 'blocked'))

      const fresh = createFreshTeam(modules, 'fresh-vnext-suite')
      assert.equal(modules.state.readTeamState(fresh.name).tasks.T001.status, 'open', 'fresh vNext state should load normally')
      assert.deepEqual(modules.state.listTeams().map(team => team.name), ['fresh-vnext-suite'], 'active list should contain only fresh vNext state')

      const data = modules.panelDataSource.loadPanelData(null)
      assert.equal(data.mode, 'global')
      assert.deepEqual(data.teams.map(team => team.name), ['fresh-vnext-suite'])
      assert.equal(data.quarantinedTeams.length, 1)
      const panelState = modules.viewModel.createInitialPanelState()
      modules.viewModel.clampPanelStateToData(panelState, data)
      const selection = modules.viewModel.buildPanelSelectionView(data, panelState)
      const collapsedLines = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state: panelState, selection })
      const collapsedText = collapsedLines.join('\n')
      assert.ok(collapsedText.includes('Quarantine') || collapsedText.includes('quarantined'), 'collapsed global panel should show concise quarantine diagnostic')
      assert.equal(collapsedText.includes('completed'), false, 'collapsed output must not expose legacy completed task status')
      assert.equal(collapsedText.includes('in_progress'), false, 'collapsed output must not expose legacy in_progress task status')
      assert.equal(collapsedText.includes('pending'), false, 'collapsed output must not expose legacy pending task status')
      assert.equal(collapsedText.includes('fyi'), false, 'collapsed output must not expose legacy fyi message type')
      assert.equal(collapsedText.includes('completion_report'), false, 'collapsed output must not expose legacy completion_report message type')

      panelState.isDetailExpanded = true
      const expandedText = modules.layout.renderTeamPanelLines(helpers.createFakeTheme(), { width: 180, height: 40, data, state: panelState, selection }).join('\n')
      assert.ok(expandedText.includes('Legacy quarantine'), 'expanded panel should include quarantine diagnostics')
      assert.ok(expandedText.includes('legacy-suite'), 'expanded quarantine diagnostics may name quarantined team')
    })

    await withTempHome(modules, 'legacy-create-reject', () => {
      createLegacyFixture(modules, 'legacy-create-suite')
      const ctx = helpers.createCtx('/tmp/legacy-create-project', '/tmp/legacy-create-leader.jsonl', [])
      const res = pi.__tools.get('agentteam_create').execute('legacy-create-reject', {
        team_name: 'legacy-create-suite',
        description: 'should reject quarantined existing state',
      }, null, () => {}, ctx)
      return Promise.resolve(res).then(result => {
        assert.equal(result.details.denied, true)
        assert.equal(result.details.reason, 'team_quarantined_unsupported_state')
        assert.ok(result.content[0].text.includes('quarantined as legacy unsupported persisted state'))
        assert.equal(result.content[0].text.includes('completed'), false, 'tool diagnostic must not echo old statuses')
        assert.equal(result.content[0].text.includes('in_progress'), false, 'tool diagnostic must not echo old statuses')
        assert.deepEqual(modules.state.listTeams(), [], 'create path should not reactivate quarantined legacy state')
      })
    })

    await withTempHome(modules, 'panel-sidecar-mailbox-validation', () => {
      const { team, report, mailboxMessage } = createPanelSidecarTeam(modules, 'panel-sidecar-suite')
      const teamDir = modules.state.getTeamDir(team.name)
      const panelSidecarFiles = ['inboxes/team-lead.panel.json', 'inboxes/researcher-one.panel.json']
      for (const rel of panelSidecarFiles) assert.equal(fs.existsSync(path.join(teamDir, rel)), true, `${rel} should exist before validation`)

      const reasons = modules.state.validatePersistedTeamDir(team.name)
      assert.deepEqual(reasons.filter(reason => reason.code === 'invalid_mailbox_shape'), [], 'object-shaped inbox *.panel.json sidecars must not be validated as mailbox array files')
      assert.equal(modules.state.validateOrQuarantineTeam(team.name), null, 'object-shaped panel sidecars must not quarantine active vNext teams')
      assert.equal(fs.existsSync(teamDir), true, 'team should stay active after sidecar validation')
      assert.equal(modules.state.readLatestQuarantineForTeam(team.name), null, 'panel sidecars should not create quarantine records')

      const teamPanelProjection = JSON.parse(fs.readFileSync(path.join(teamDir, 'team-panel.json'), 'utf8'))
      const leaderPanelProjection = JSON.parse(fs.readFileSync(path.join(teamDir, 'inboxes', 'team-lead.panel.json'), 'utf8'))
      assert.equal(JSON.stringify(teamPanelProjection).includes(PANEL_SIDECAR_MAILBOX_SENTINEL), false, 'team panel sidecar must not expose full MailboxMessage.text sentinel')
      assert.equal(JSON.stringify(teamPanelProjection).includes(PANEL_SIDECAR_REPORT_SENTINEL), false, 'team panel sidecar must not expose full TaskReport.text sentinel')
      assert.equal(JSON.stringify(leaderPanelProjection).includes(PANEL_SIDECAR_MAILBOX_SENTINEL), false, 'mailbox panel sidecar must remain compact')
      assert.equal(JSON.stringify(leaderPanelProjection).includes(PANEL_SIDECAR_REPORT_SENTINEL), false, 'mailbox panel sidecar must not hydrate report text')

      const leaderCtx = helpers.createCtx('/tmp/panel-sidecar-project', `/tmp/${team.name}-leader.jsonl`, [])
      const receive = pi.__tools.get('agentteam_receive').execute('panel-sidecar-receive', { markRead: false, limit: 5 }, null, () => {}, leaderCtx)
      return Promise.resolve(receive).then(result => {
        assert.equal(JSON.stringify(result).includes(PANEL_SIDECAR_MAILBOX_SENTINEL), true, 'agentteam_receive must remain the explicit full-text MailboxMessage.text boundary')
        assert.equal(result.details?.messages?.some(message => message.id === mailboxMessage.id && message.text === PANEL_SIDECAR_MAILBOX_SENTINEL), true, 'agentteam_receive details should return full mailbox text')
        assert.equal(result.details?.hydratedReports?.[report.id]?.text, PANEL_SIDECAR_REPORT_SENTINEL, 'agentteam_receive should hydrate referenced TaskReport.text at the explicit read boundary')
      })
    })

    await withTempHome(modules, 'real-mailbox-shape-validation', () => {
      const { team } = createPanelSidecarTeam(modules, 'bad-mailbox-suite')
      writeJson(path.join(modules.state.getTeamDir(team.name), 'inboxes', 'team-lead.json'), {
        version: 1,
        items: [],
      })
      const reasons = modules.state.validatePersistedTeamDir(team.name)
      assert.ok(reasons.some(reason => reason.code === 'invalid_mailbox_shape' && reason.file === path.join('inboxes', 'team-lead.json')), 'real inbox mailbox .json object must still fail mailbox array validation')
      assert.ok(modules.state.validateOrQuarantineTeam(team.name), 'real malformed mailbox .json should still quarantine the team')
      const latest = modules.state.readLatestQuarantineForTeam(team.name)
      assert.ok(latest.reasons.some(reason => reason.code === 'invalid_mailbox_shape' && reason.file === path.join('inboxes', 'team-lead.json')), 'quarantine should record malformed real mailbox file')
    })

    await withTempHome(modules, 'legacy-runtime-file-layout-marker', home => {
      const teamName = 'legacy-runtime-file-suite'
      const teamDir = path.join(home, 'teams', teamName)
      writeJson(path.join(teamDir, 'team.json'), {
        version: 1,
        name: teamName,
        createdAt: Date.now(),
        leaderSessionFile: '/tmp/legacy-runtime-file-leader.jsonl',
        leaderCwd: '/tmp/legacy-runtime-file',
        members: {},
        tasks: {},
        events: [],
        nextTaskSeq: 1,
        revision: 1,
      })
      writeJson(path.join(teamDir, 'bridge-state.json'), { version: 1, leases: { old: { memberName: 'old', bridgeId: 'old', sessionFile: '/tmp/old.jsonl' } } })
      assert.equal(modules.state.readTeamState(teamName), null, 'old standalone runtime files should quarantine rather than fallback-read')
      const quarantined = modules.state.readLatestQuarantineForTeam(teamName)
      assert.ok(quarantined.reasons.some(reason => reason.code === 'legacy_layout_entry' && reason.file === 'bridge-state.json'))
    })

    await withTempHome(modules, 'legacy-layout-marker', () => {
      createLegacyFixture(modules, 'legacy-layout-suite', {
        tasks: {},
        layout: { selectedTaskStatus: 'completed' },
        nextTaskSeq: 1,
      })
      assert.equal(modules.state.readTeamState('legacy-layout-suite'), null, 'old layout markers should quarantine when read as active state')
      const quarantined = modules.state.readLatestQuarantineForTeam('legacy-layout-suite')
      assert.ok(quarantined.reasons.some(reason => reason.code === 'legacy_layout_marker' && reason.path === '$.layout'))
    })

    assert.equal(modules.protocol.parsePersistedMessageType('fyi'), null, 'strict persisted parse should reject fyi')
    assert.equal(modules.protocol.parsePersistedMessageType('completion_report'), null, 'strict persisted parse should reject completion_report')
    assert.equal(modules.protocol.parsePersistedMessageType('blocked'), null, 'strict persisted parse should reject blocked')
    assert.equal(modules.protocol.parsePersistedMessageType('question'), 'question')
    assert.equal(modules.protocol.displayMessageType('fyi'), 'inform', 'display fallback is separate from strict persisted parse')
  },
}
