const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const V049_REPORT_BODY_SENTINEL = 'V049_PLANRUN_FULL_REPORT_BODY_SHOULD_NOT_LEAK'
const V049_MAILBOX_BODY_SENTINEL = 'V049_PLANRUN_FULL_MAILBOX_BODY_SHOULD_NOT_LEAK'
const EXPECTED_PLANRUN_ACTIONS = ['approve', 'show', 'list', 'advance', 'pause', 'resume', 'cancel']

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-planrun-v049-${name}-`))
  try {
    process.env.PI_AGENTTEAM_HOME = home
    modules.state.invalidateSessionContextCache()
    modules.runtimePanes.invalidatePaneReconcileCache()
    return await fn(home)
  } finally {
    modules.runtimePanes.invalidatePaneReconcileCache()
    modules.state.invalidateSessionContextCache()
    process.env.PI_AGENTTEAM_HOME = previousHome
    fs.rmSync(home, { recursive: true, force: true })
  }
}

function addMember(modules, team, name, role, status = 'idle') {
  modules.state.upsertMember(team, {
    name,
    role,
    cwd: team.leaderCwd,
    sessionFile: `/tmp/${team.name}-${name}.jsonl`,
    paneId: `%planrun-v049-${name}`,
    windowTarget: 'planrun-v049:@1',
    status,
  })
}

function addAssignment(modules, team, task, owner, at) {
  modules.state.appendTaskEvent(team, {
    taskId: task.id,
    type: 'assigned',
    by: 'team-lead',
    at,
    summary: `Assigned to ${owner}`,
    data: { source: 'planrun-v049-fixture', newOwner: owner },
  })
  modules.state.appendTaskMessageRef(team, {
    taskId: task.id,
    mailboxMessageId: `${team.name}-${task.id}-assignment-${at}`,
    from: 'team-lead',
    to: owner,
    type: 'assignment',
    threadId: `task:${task.id}`,
    summary: `Compact assignment for ${task.id}`,
    createdAt: at,
  })
}

function createTask(modules, team, input) {
  const task = modules.state.createTask(team, {
    title: input.title,
    description: input.description,
    owner: input.owner,
  })
  task.createdAt = input.createdAt ?? task.createdAt
  task.updatedAt = input.updatedAt ?? task.updatedAt
  return task
}

function createFixtureTeam(modules, name) {
  modules.state.deleteTeamState(name)
  const team = modules.state.createInitialTeamState({
    teamName: name,
    storageName: name,
    leaderSessionFile: `/tmp/${name}-leader.jsonl`,
    leaderCwd: `/tmp/planrun-v049/${name}`,
    description: 'v0.4.9 PlanRun RED characterization fixture',
  })
  addMember(modules, team, 'planner-one', 'planner')
  addMember(modules, team, 'implementer-a', 'implementer')
  addMember(modules, team, 'implementer-b', 'implementer')

  const plannerTask = createTask(modules, team, {
    title: 'Draft approved two-step plan',
    description: 'Planner should propose a plan but must not auto-run it.',
    owner: 'planner-one',
    createdAt: 1700000900000,
    updatedAt: 1700000900000,
  })
  addAssignment(modules, team, plannerTask, 'planner-one', 1700000900010)

  const sourceReport = modules.state.appendTaskReport(team, {
    taskId: plannerTask.id,
    type: 'report_done',
    author: 'planner-one',
    text: [
      `${V049_REPORT_BODY_SENTINEL} source planner report body`,
      'Approved PlanRun candidate:',
      'Step 1: implement the smallest behavior; owner=implementer-a',
      'Step 2: validate the behavior; owner=implementer-b',
    ].join('\n'),
    summary: 'Compact two-step PlanRun proposal',
    createdAt: 1700000900020,
    threadId: `task:${plannerTask.id}`,
    reporterIsOwner: true,
    statusAtReport: 'open',
    ownerAtReport: 'planner-one',
    metadata: { source: 'planrun-v049-fixture', proposedPlanSteps: 2 },
  })
  modules.state.appendTaskEvent(team, {
    taskId: plannerTask.id,
    type: 'report_submitted',
    by: 'planner-one',
    at: 1700000900021,
    summary: sourceReport.summary,
    reportId: sourceReport.id,
    data: { source: 'planrun-v049-fixture', reportType: 'report_done' },
  })

  const stepLikeTask = createTask(modules, team, {
    title: 'Existing step-like task should not auto-advance',
    description: 'Current report workflow should stay report-review only.',
    owner: 'implementer-a',
    createdAt: 1700000900100,
    updatedAt: 1700000900100,
  })
  addAssignment(modules, team, stepLikeTask, 'implementer-a', 1700000900110)

  modules.state.writeTeamState(team)
  modules.state.writeSessionContext(team.leaderSessionFile, { teamName: team.name, memberName: 'team-lead' })
  modules.state.writeSessionContext(team.members['planner-one'].sessionFile, { teamName: team.name, memberName: 'planner-one' })
  modules.state.writeSessionContext(team.members['implementer-a'].sessionFile, { teamName: team.name, memberName: 'implementer-a' })

  modules.state.pushMailboxMessage(name, 'team-lead', {
    id: `${name}-leader-planrun-sentinel`,
    from: 'planner-one',
    to: 'team-lead',
    type: 'report_done',
    taskId: plannerTask.id,
    threadId: `task:${plannerTask.id}`,
    summary: 'Compact PlanRun source report mailbox summary',
    text: `${V049_MAILBOX_BODY_SENTINEL} full mailbox body should require agentteam_receive`,
    metadata: { source: 'planrun-v049-fixture', reportId: sourceReport.id },
    createdAt: 1700000900030,
  })

  return {
    team: modules.state.readTeamState(name),
    plannerTaskId: plannerTask.id,
    stepLikeTaskId: stepLikeTask.id,
    sourceReportId: sourceReport.id,
  }
}

function assertNoBodySentinel(label, value) {
  const json = JSON.stringify(value)
  assert.equal(json.includes(V049_REPORT_BODY_SENTINEL), false, `${label} should not expose source planner TaskReport.text sentinel`)
  assert.equal(json.includes(V049_MAILBOX_BODY_SENTINEL), false, `${label} should not expose MailboxMessage.text sentinel`)
}

function objectShape(schema) {
  if (!schema) return {}
  if (schema.kind === 'object' && schema.o) return schema.o
  if (schema.o) return schema.o
  if (schema.v) return objectShape(schema.v)
  return {}
}

function enumValues(field) {
  if (!field) return []
  if (Array.isArray(field.enum)) return field.enum
  if (field.v) return enumValues(field.v)
  if (field.o?.enum) return field.o.enum
  return []
}

function booleanField(field) {
  if (!field) return false
  if (field.kind === 'boolean') return true
  if (field.v) return booleanField(field.v)
  return false
}

function sourceIncludesAll(source, needles) {
  return needles.every(needle => source.includes(needle))
}

function sourceMissing(source, needles) {
  return needles.filter(needle => !source.includes(needle))
}

function walkProductionTsFiles(root, out = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'tests' || entry.name === 'data') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      walkProductionTsFiles(full, out)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

function planRunProductionSources(helpers) {
  const files = walkProductionTsFiles(helpers.extRoot)
  const matches = []
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    const rel = path.relative(helpers.extRoot, file)
    if (/planrun|planRun|PlanRun|agentteam_planrun/.test(`${rel}\n${source}`)) {
      matches.push({ rel, source })
    }
  }
  return matches
}

function taskIds(team) {
  return Object.keys(team.tasks).sort()
}

function planRunRecords(team) {
  const runs = team.planRuns
  if (!runs || typeof runs !== 'object' || Array.isArray(runs)) return []
  return Object.values(runs)
}

function findPlanRun(team, planRunId) {
  if (planRunId && team.planRuns?.[planRunId]) return team.planRuns[planRunId]
  return planRunRecords(team)[0]
}

function isDenied(result) {
  return result?.details?.denied === true || /denied|cannot|confirm|approval|required/i.test(result?.content?.[0]?.text || '')
}

async function exerciseFuturePlanRunBehavior(input) {
  const {
    failures,
    planrunTool,
    taskTool,
    modules,
    helpers,
    fixture,
    leaderCtx,
    implementerCtx,
  } = input
  if (!planrunTool) {
    failures.push('PlanRun one-step-at-a-time behavior should be exercisable through agentteam_planrun once the tool exists')
    failures.push('PlanRun report-review/watchdog pause behavior should be observable once the tool exists')
    failures.push('PlanRun compact show/list boundary should be observable once the tool exists')
    return
  }

  const beforeApprove = modules.state.readTeamState(fixture.team.name)
  const beforeTaskIds = taskIds(beforeApprove)
  const missingConfirm = await planrunTool.execute('planrun-v049-approve-missing-confirm', {
    action: 'approve',
    sourceReportId: fixture.sourceReportId,
  }, null, () => {}, leaderCtx)
  assert.ok(isDenied(missingConfirm), 'approve without confirmApproved=true should be denied')
  assert.deepEqual(taskIds(modules.state.readTeamState(fixture.team.name)), beforeTaskIds, 'denied approve must not create step tasks')

  const falseConfirm = await planrunTool.execute('planrun-v049-approve-false-confirm', {
    action: 'approve',
    sourceReportId: fixture.sourceReportId,
    confirmApproved: false,
  }, null, () => {}, leaderCtx)
  assert.ok(isDenied(falseConfirm), 'approve with confirmApproved=false should be denied')
  assert.deepEqual(taskIds(modules.state.readTeamState(fixture.team.name)), beforeTaskIds, 'confirmApproved=false must not create step tasks')

  const approved = await planrunTool.execute('planrun-v049-approve', {
    action: 'approve',
    sourceReportId: fixture.sourceReportId,
    confirmApproved: true,
  }, null, () => {}, leaderCtx)
  assertNoBodySentinel('PlanRun approve output/details', approved)
  const afterApprove = modules.state.readTeamState(fixture.team.name)
  assert.deepEqual(taskIds(afterApprove), beforeTaskIds, 'approved two-step PlanRun should not create tasks until explicit advance')
  const planRunId = approved.details?.planRunId || approved.details?.runId || findPlanRun(afterApprove)?.id
  if (!planRunId) {
    failures.push('agentteam_planrun approve should return/store a compact planRunId for explicit advance/show operations')
    return
  }

  const approvedShow = await planrunTool.execute('planrun-v049-show-approved', { action: 'show', planRunId }, null, () => {}, leaderCtx)
  const approvedList = await planrunTool.execute('planrun-v049-list-approved', { action: 'list' }, null, () => {}, leaderCtx)
  assertNoBodySentinel('PlanRun compact show output/details immediately after approve', approvedShow)
  assertNoBodySentinel('PlanRun compact list output/details immediately after approve', approvedList)
  assert.ok(JSON.stringify(approvedShow.details).includes(planRunId), 'PlanRun show should return the approved compact planRunId')
  assert.ok(JSON.stringify(approvedList.details).includes(planRunId), 'PlanRun list should include the approved compact planRunId')

  const firstAdvance = await planrunTool.execute('planrun-v049-first-advance', {
    action: 'advance',
    planRunId,
  }, null, () => {}, leaderCtx)
  assertNoBodySentinel('PlanRun first advance output/details', firstAdvance)
  assert.equal(firstAdvance.details?.denied, undefined, `first explicit advance should be allowed, got ${JSON.stringify(firstAdvance.details)}`)
  const afterFirstAdvance = modules.state.readTeamState(fixture.team.name)
  const firstCreatedTaskIds = taskIds(afterFirstAdvance).filter(id => !beforeTaskIds.includes(id))
  assert.equal(firstCreatedTaskIds.length, 1, 'first explicit advance should create exactly one step task')
  const firstTask = afterFirstAdvance.tasks[firstCreatedTaskIds[0]]
  assert.equal(firstTask.status, 'open', 'first advanced step task should be open')
  assert.ok(firstTask.owner, 'first advanced step task should be assigned to exactly one owner')
  assert.ok(Object.values(afterFirstAdvance.taskEvents).some(event => event.taskId === firstTask.id && event.type === 'assigned'), 'first advance should create a compact assignment event')

  const secondWhileOpen = await planrunTool.execute('planrun-v049-second-advance-open-step', {
    action: 'advance',
    planRunId,
  }, null, () => {}, leaderCtx)
  assert.ok(isDenied(secondWhileOpen), 'advance should be denied while the current step task is still open')
  assert.equal(taskIds(modules.state.readTeamState(fixture.team.name)).filter(id => !beforeTaskIds.includes(id)).length, 1, 'denied second advance must not create a second task')

  const reportResult = await taskTool.execute('planrun-v049-worker-report-step', {
    action: 'report_done',
    taskId: firstTask.id,
    note: 'step 1 ready for leader review',
  }, null, () => {}, implementerCtx)
  assertNoBodySentinel('PlanRun step report_done compact tool response', reportResult)
  const afterWorkerReport = modules.state.readTeamState(fixture.team.name)
  assert.equal(afterWorkerReport.tasks[firstTask.id].status, 'open', 'worker report_done should leave the step task open for leader review')
  assert.equal(taskIds(afterWorkerReport).filter(id => !beforeTaskIds.includes(id)).length, 1, 'worker report_done must not auto-create the next PlanRun step')
  const waitingRun = findPlanRun(afterWorkerReport, planRunId)
  assert.ok(/waiting_review|review/i.test(JSON.stringify(waitingRun)), 'PlanRun should enter compact waiting_review state after owner report until leader closes the task')
  const waitingTaskShow = await taskTool.execute('planrun-v049-show-active-step-waiting-review', {
    action: 'show',
    taskId: firstTask.id,
  }, null, () => {}, leaderCtx)
  assertNoBodySentinel('PlanRun task show waiting_review compact hint', waitingTaskShow)
  assert.ok(JSON.stringify(waitingTaskShow).includes(planRunId), 'task show should include compact PlanRun id for active step task')
  assert.ok(/waiting_review|leader close task then agentteam_planrun action=advance/.test(JSON.stringify(waitingTaskShow)), 'task show should include compact waiting_review next-action hint')
  const waitingDigest = modules.orchestration.maybeInjectLeaderOrchestrationContext({ messages: [] }, {
    team: afterWorkerReport,
    memberName: 'team-lead',
    state: {
      lastDigestKey: '',
      lastDigestAt: 0,
      lastBlockedCount: 0,
      lastBlockedFingerprints: [],
    },
  })
  assertNoBodySentinel('PlanRun leader digest waiting_review compact hint', waitingDigest)
  assert.ok(JSON.stringify(waitingDigest).includes(planRunId), 'leader digest should include compact PlanRun id when waiting for review')
  assert.ok(/PlanRun attention|waiting_review|leader close task then agentteam_planrun action=advance/.test(JSON.stringify(waitingDigest)), 'leader digest should include compact PlanRun review attention')

  const blockedReport = await taskTool.execute('planrun-v049-worker-report-blocked-step', {
    action: 'report_blocked',
    taskId: firstTask.id,
    note: 'step needs leader decision',
    blockedBy: ['leader decision'],
  }, null, () => {}, implementerCtx)
  assertNoBodySentinel('PlanRun step report_blocked compact tool response', blockedReport)
  const afterBlockedReport = modules.state.readTeamState(fixture.team.name)
  assert.equal(afterBlockedReport.tasks[firstTask.id].status, 'open', 'worker report_blocked should not mutate task status')
  assert.equal(taskIds(afterBlockedReport).filter(id => !beforeTaskIds.includes(id)).length, 1, 'worker report_blocked must not auto-create the next PlanRun step')
  const pausedRun = findPlanRun(afterBlockedReport, planRunId)
  assert.ok(/paused|blocked|waiting_review|watchdog|waiting_for_report/i.test(JSON.stringify(pausedRun)), 'PlanRun should compactly pause for report_blocked/question/watchdog waiting conditions')
  const pausedTaskShow = await taskTool.execute('planrun-v049-show-active-step-paused', {
    action: 'show',
    taskId: firstTask.id,
  }, null, () => {}, leaderCtx)
  assertNoBodySentinel('PlanRun task show paused compact hint', pausedTaskShow)
  assert.ok(/paused|report_blocked|no automatic advance/.test(JSON.stringify(pausedTaskShow)), 'task show should include compact paused/report_blocked next-action hint')
  const pausedDigest = modules.orchestration.maybeInjectLeaderOrchestrationContext({ messages: [] }, {
    team: afterBlockedReport,
    memberName: 'team-lead',
    state: {
      lastDigestKey: '',
      lastDigestAt: 0,
      lastBlockedCount: 0,
      lastBlockedFingerprints: [],
    },
  })
  assertNoBodySentinel('PlanRun leader digest paused compact hint', pausedDigest)
  assert.ok(/PlanRun attention|paused|report_blocked|no automatic advance/.test(JSON.stringify(pausedDigest)), 'leader digest should include compact paused/report_blocked attention')

  const compactShow = await planrunTool.execute('planrun-v049-show', { action: 'show', planRunId }, null, () => {}, leaderCtx)
  const compactList = await planrunTool.execute('planrun-v049-list', { action: 'list' }, null, () => {}, leaderCtx)
  assertNoBodySentinel('PlanRun compact show output/details', compactShow)
  assertNoBodySentinel('PlanRun compact list output/details', compactList)
}

module.exports = {
  name: 'PlanRun v0.4.9 RED characterization',
  async run(env) {
    const { pi, modules, helpers } = env
    const failures = []
    const planrunTool = pi.__tools.get('agentteam_planrun')
    const taskTool = pi.__tools.get('agentteam_task')
    const internalTypesSource = helpers.readSource('internalTypes.ts')
    const repositorySource = helpers.readSource('state/repository.ts')
    const appPortsSource = helpers.readSource('app/ports.ts')
    const taskApplicationSource = helpers.readSource('app/taskApplication.ts')
    const taskMutationCommandsSource = helpers.readSource('app/taskMutationCommands.ts')
    const taskReportWorkflowSource = helpers.readSource('app/taskReportWorkflow.ts')
    const taskReportNudgeSource = helpers.readSource('app/taskReportNudge.ts')
    const orchestrationSource = helpers.readSource('orchestration.ts')
    const teamPanelReadModelSource = helpers.readSource('teamPanel/readModel.ts')
    const planRunSources = planRunProductionSources(helpers)
    const combinedPlanRunSource = planRunSources.map(item => item.source).join('\n')

    if (!planrunTool) {
      failures.push('future agentteam_planrun tool should exist for explicit approved PlanRun control')
    } else {
      const shape = objectShape(planrunTool.parameters)
      const actions = enumValues(shape.action)
      const missingActions = EXPECTED_PLANRUN_ACTIONS.filter(action => !actions.includes(action))
      if (missingActions.length > 0) {
        failures.push(`agentteam_planrun action enum should include ${EXPECTED_PLANRUN_ACTIONS.join(', ')}; missing ${missingActions.join(', ')}`)
      }
      if (!shape.sourceReportId) {
        failures.push('agentteam_planrun approve should require sourceReportId pointing at the planner TaskReport')
      }
      if (!booleanField(shape.confirmApproved)) {
        failures.push('agentteam_planrun approve should require explicit boolean confirmApproved before any PlanRun is created')
      }
      if (!shape.planRunId) {
        failures.push('agentteam_planrun show/advance/pause/resume/cancel should address one compact planRunId explicitly')
      }
    }

    const missingTeamStateFields = sourceMissing(internalTypesSource, [
      'PlanRun',
      'planRuns',
      'planRunEvents',
      'activePlanRunId',
      'nextPlanRunSeq',
      'nextPlanRunEventSeq',
    ])
    if (missingTeamStateFields.length > 0) {
      failures.push(`TeamState should expose compact PlanRun storage fields/types; missing ${missingTeamStateFields.join(', ')}`)
    }

    const expectedRepositoryPlanRunMethods = [
      'readPlanRunSummary',
      'listPlanRuns',
      'writePlanRunMutation',
      'appendPlanRunEvent',
    ]
    const missingRepositoryMethods = sourceMissing(repositorySource, expectedRepositoryPlanRunMethods)
    if (missingRepositoryMethods.length > 0) {
      failures.push(`StateRepository should expose compact PlanRun read/mutation seam methods; missing ${missingRepositoryMethods.join(', ')}`)
    }

    const expectedAppPortPlanRunMethods = [
      'PlanRunRepositoryPort',
      'PlanRunMutationPort',
      'readPlanRunSummary',
      'writePlanRunMutation',
    ]
    const missingAppPortMethods = sourceMissing(appPortsSource, expectedAppPortPlanRunMethods)
    if (missingAppPortMethods.length > 0) {
      failures.push(`app/ports.ts should define PlanRun repository/mutation port shapes; missing ${missingAppPortMethods.join(', ')}`)
    }

    if (!combinedPlanRunSource || !/agentteam_planrun|PlanRun/.test(combinedPlanRunSource)) {
      failures.push('PlanRun application/tool modules should exist behind app/repository ports instead of being hidden in orchestration or task report side effects')
    }
    if (combinedPlanRunSource && !/waiting_review/.test(combinedPlanRunSource)) {
      failures.push('PlanRun model/read model should encode waiting_review so worker reports pause until leader review and explicit advance')
    }
    if (combinedPlanRunSource && !/watchdog|waiting_for_report|report_blocked|question/.test(combinedPlanRunSource)) {
      failures.push('PlanRun read model should compactly surface pause reasons for report_blocked/question/watchdog waiting conditions')
    }

    for (const { rel, source } of planRunSources) {
      if (/setInterval|setTimeout|cron|\bscheduler\b|autoAdvance|autopilot|agentteam_spawn|executeSpawnMember/.test(source)) {
        failures.push(`${rel} should not implement hidden scheduler/default autopilot/worker-spawns-worker behavior`)
      }
      if (/from ['"]\.\.\/state\/(teamStore|mailboxStore|taskStore|taskHistory)\.js/.test(source)) {
        failures.push(`${rel} should use repository/app ports instead of direct concrete state store imports`)
      }
      if (/\.text\b/.test(source) && !/action\s*[=:]\s*['"]report['"]|explicit/i.test(source)) {
        failures.push(`${rel} compact PlanRun surfaces should not read MailboxMessage.text or TaskReport.text outside explicit full-text boundaries`)
      }
    }

    if (/agentteam_planrun|advancePlanRun|PlanRun/.test(taskReportWorkflowSource)) {
      failures.push('worker report_done/report_blocked workflow must not auto-advance or mutate PlanRun without leader review')
    }
    if (/agentteam_planrun|advancePlanRun|PlanRun/.test(taskMutationCommandsSource)) {
      failures.push('plain task mutation commands should not hide PlanRun auto-scheduling behavior')
    }
    if (/agentteam_planrun|advancePlanRun|PlanRun/.test(taskApplicationSource) && !/confirmApproved/.test(taskApplicationSource)) {
      failures.push('PlanRun dispatch should require explicit confirmApproved gate, not default task application autopilot')
    }
    assert.ok(taskReportNudgeSource.includes('nudge_report'), 'GREEN v0.4.8 nudge_report module should remain present')
    assert.ok(orchestrationSource.includes('readLeaderCoordinationProjection'), 'GREEN v0.4.8 leader digest should remain repository-backed')
    assert.ok(teamPanelReadModelSource.includes('watchdog'), 'GREEN v0.4.8 panel read model should retain compact watchdog field')

    await withTempHome(modules, 'legacy-plan-fields', () => {
      const legacy = modules.state.createInitialTeamState({
        teamName: 'planrun-v049-legacy-fields',
        storageName: 'planrun-v049-legacy-fields',
        leaderSessionFile: '/tmp/planrun-v049-legacy-fields-leader.jsonl',
        leaderCwd: '/tmp/planrun-v049/legacy-fields',
      })
      modules.state.writeTeamState(legacy)
      const normalizedLegacy = modules.state.readTeamState(legacy.name)
      assert.ok(normalizedLegacy, 'GREEN legacy teams without PlanRun fields should still normalize/read')

      normalizedLegacy.planRuns = {
        PR0001: {
          id: 'PR0001',
          sourceReportId: 'TR0001',
          status: 'approved',
          currentStepIndex: 0,
          steps: [],
        },
      }
      normalizedLegacy.planRunEvents = {}
      normalizedLegacy.activePlanRunId = 'PR0001'
      normalizedLegacy.nextPlanRunSeq = 2
      normalizedLegacy.nextPlanRunEventSeq = 1
      modules.state.writeTeamState(normalizedLegacy)
      const roundTrip = modules.state.readTeamState(legacy.name)
      assert.ok(roundTrip, 'GREEN placeholder future PlanRun fields should not quarantine current state')
      assert.equal(roundTrip.planRuns?.PR0001?.id, 'PR0001', 'GREEN placeholder PlanRun fields should round-trip until first-class schema lands')
    })

    await withTempHome(modules, 'behavior', async () => {
      const fixture = createFixtureTeam(modules, 'planrun-v049-behavior')
      const leaderCtx = helpers.createCtx('/tmp/planrun-v049/behavior', fixture.team.leaderSessionFile, [])
      const plannerCtx = helpers.createCtx('/tmp/planrun-v049/behavior', fixture.team.members['planner-one'].sessionFile, [])
      const implementerCtx = helpers.createCtx('/tmp/planrun-v049/behavior', fixture.team.members['implementer-a'].sessionFile, [])
      const beforePlannerReport = modules.state.readTeamState(fixture.team.name)
      const beforePlannerTasks = taskIds(beforePlannerReport)
      const plannerReport = await taskTool.execute('planrun-v049-planner-report-no-autopilot', {
        action: 'report_done',
        taskId: fixture.plannerTaskId,
        note: 'Planner submitted a plan proposal; approval must be explicit.',
      }, null, () => {}, plannerCtx)
      assertNoBodySentinel('GREEN planner report_done compact response', plannerReport)
      const afterPlannerReport = modules.state.readTeamState(fixture.team.name)
      assert.deepEqual(taskIds(afterPlannerReport), beforePlannerTasks, 'GREEN planner report_done alone must not create PlanRun/downstream tasks')
      assert.equal(planRunRecords(afterPlannerReport).length, 0, 'GREEN planner report_done alone must not create PlanRun storage')
      assert.equal(afterPlannerReport.tasks[fixture.plannerTaskId].status, 'open', 'GREEN planner report_done leaves task open until leader review')

      const beforeWorkerReport = modules.state.readTeamState(fixture.team.name)
      const beforeWorkerTasks = taskIds(beforeWorkerReport)
      const workerReport = await taskTool.execute('planrun-v049-worker-report-no-autopilot', {
        action: 'report_done',
        taskId: fixture.stepLikeTaskId,
        note: 'Implementation step done; leader must review before any next step.',
      }, null, () => {}, implementerCtx)
      assertNoBodySentinel('GREEN worker report_done compact response', workerReport)
      const afterWorkerReport = modules.state.readTeamState(fixture.team.name)
      assert.deepEqual(taskIds(afterWorkerReport), beforeWorkerTasks, 'GREEN worker report_done on a step-like task must not auto-create the next task')
      assert.equal(afterWorkerReport.tasks[fixture.stepLikeTaskId].status, 'open', 'GREEN worker report_done leaves step task open for leader close/review')

      const deniedNudge = await taskTool.execute('planrun-v049-nonleader-nudge-regression', {
        action: 'nudge_report',
        taskId: fixture.stepLikeTaskId,
      }, null, () => {}, implementerCtx)
      assert.equal(deniedNudge.details.denied, true, 'GREEN nudge_report remains leader-only/manual')
      assert.equal(modules.state.readMailbox(fixture.team.name, 'implementer-a').length, 0, 'GREEN denied non-leader nudge_report should not write owner mailbox')

      const repository = helpers.requireDist('state/repository.js').createStateRepository()
      const panelModel = repository.readTeamPanelModel(fixture.team.name)
      assertNoBodySentinel('GREEN repository-backed panel model', panelModel)
      assert.equal(Object.prototype.hasOwnProperty.call(panelModel, 'taskReports'), false, 'GREEN compact panel model should not expose raw taskReports')

      const digestResult = modules.orchestration.maybeInjectLeaderOrchestrationContext({ messages: [] }, {
        team: modules.state.readTeamState(fixture.team.name),
        memberName: 'team-lead',
        state: {
          lastDigestKey: '',
          lastDigestAt: 0,
          lastBlockedCount: 0,
          lastBlockedFingerprints: [],
        },
      })
      assertNoBodySentinel('GREEN leader digest compact projection', digestResult)

      const explicitReport = await taskTool.execute('planrun-v049-explicit-report-boundary', {
        action: 'report',
        taskId: fixture.plannerTaskId,
        reportId: fixture.sourceReportId,
      }, null, () => {}, leaderCtx)
      assert.ok(explicitReport.content[0].text.includes(V049_REPORT_BODY_SENTINEL), 'GREEN explicit agentteam_task action=report remains the full TaskReport.text boundary')
      assert.equal(JSON.stringify(explicitReport.details.report).includes(V049_REPORT_BODY_SENTINEL), false, 'GREEN explicit report metadata should stay compact while full text is returned separately')

      await exerciseFuturePlanRunBehavior({
        failures,
        planrunTool,
        taskTool,
        modules,
        helpers,
        fixture,
        leaderCtx,
        implementerCtx,
      })
    })

    if (sourceIncludesAll(repositorySource, ['readLeaderCoordinationProjection', 'readReportWatchdogSummary', 'planRunAttention'])) {
      assert.ok(true, 'GREEN v0.4.8 repository watchdog/digest seams remain present')
    }

    assert.equal(failures.length, 0, failures.join('\n'))
  },
}
