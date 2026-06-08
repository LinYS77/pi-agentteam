const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const V0410_REPORT_BODY_SENTINEL = 'V0410_PLANRUN_FULL_REPORT_BODY_SHOULD_NOT_LEAK'
const V0410_MAILBOX_BODY_SENTINEL = 'V0410_PLANRUN_FULL_MAILBOX_BODY_SHOULD_NOT_LEAK'

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-planrun-v0410-${name}-`))
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
    paneId: `%planrun-v0410-${name}`,
    windowTarget: 'planrun-v0410:@1',
    status,
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

function addAssignment(modules, team, task, owner, at) {
  modules.state.appendTaskEvent(team, {
    taskId: task.id,
    type: 'assigned',
    by: 'team-lead',
    at,
    summary: `Assigned to ${owner}`,
    data: { source: 'planrun-v0410-fixture', newOwner: owner },
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

function createFixtureTeam(modules, name, options = {}) {
  modules.state.deleteTeamState(name)
  const team = modules.state.createInitialTeamState({
    teamName: name,
    storageName: name,
    leaderSessionFile: `/tmp/${name}-leader.jsonl`,
    leaderCwd: `/tmp/planrun-v0410/${name}`,
    description: 'v0.4.10 PlanRun completion/recovery RED characterization fixture',
  })
  addMember(modules, team, 'planner-one', 'planner')
  addMember(modules, team, 'implementer-a', 'implementer', options.implementerStatus ?? 'idle')
  addMember(modules, team, 'implementer-b', 'implementer', options.implementerStatus ?? 'idle')
  addMember(modules, team, 'implementer-c', 'implementer', options.implementerStatus ?? 'idle')

  const plannerTask = createTask(modules, team, {
    title: 'Draft v0.4.10 completion/recovery plan',
    description: 'Planner source task for approved PlanRun hardening.',
    owner: 'planner-one',
    createdAt: 1700004100000,
    updatedAt: 1700004100000,
  })
  addAssignment(modules, team, plannerTask, 'planner-one', 1700004100010)

  const sourceReport = modules.state.appendTaskReport(team, {
    taskId: plannerTask.id,
    type: 'report_done',
    author: 'planner-one',
    text: [
      `${V0410_REPORT_BODY_SENTINEL} source planner report body`,
      'Approved PlanRun completion/recovery candidate:',
      'Step 1: implement behavior; owner=implementer-a',
      'Step 2: validate behavior; owner=implementer-b',
      'Step 3: document recovery; owner=implementer-c',
    ].join('\n'),
    summary: 'Compact three-step PlanRun completion/recovery proposal',
    createdAt: 1700004100020,
    threadId: `task:${plannerTask.id}`,
    reporterIsOwner: true,
    statusAtReport: 'open',
    ownerAtReport: 'planner-one',
    metadata: { source: 'planrun-v0410-fixture', proposedPlanSteps: options.stepCount ?? 3 },
  })
  modules.state.appendTaskEvent(team, {
    taskId: plannerTask.id,
    type: 'report_submitted',
    by: 'planner-one',
    at: 1700004100021,
    summary: sourceReport.summary,
    reportId: sourceReport.id,
    data: { source: 'planrun-v0410-fixture', reportType: 'report_done' },
  })

  modules.state.writeTeamState(team)
  modules.state.writeSessionContext(team.leaderSessionFile, { teamName: team.name, memberName: 'team-lead' })
  for (const memberName of ['planner-one', 'implementer-a', 'implementer-b', 'implementer-c']) {
    modules.state.writeSessionContext(team.members[memberName].sessionFile, { teamName: team.name, memberName })
  }

  modules.state.pushMailboxMessage(name, 'team-lead', {
    id: `${name}-leader-planrun-v0410-sentinel`,
    from: 'planner-one',
    to: 'team-lead',
    type: 'report_done',
    taskId: plannerTask.id,
    threadId: `task:${plannerTask.id}`,
    summary: 'Compact PlanRun v0.4.10 source report mailbox summary',
    text: `${V0410_MAILBOX_BODY_SENTINEL} full mailbox body should require agentteam_receive`,
    metadata: { source: 'planrun-v0410-fixture', reportId: sourceReport.id },
    createdAt: 1700004100030,
  })

  return {
    team: modules.state.readTeamState(name),
    plannerTaskId: plannerTask.id,
    sourceReportId: sourceReport.id,
  }
}

function taskIds(team) {
  return Object.keys(team.tasks).sort()
}

function eventIds(team) {
  return Object.keys(team.taskEvents ?? {}).sort()
}

function reportIds(team) {
  return Object.keys(team.taskReports ?? {}).sort()
}

function messageIds(modules, teamName, memberName) {
  return modules.state.readMailbox(teamName, memberName).map(message => message.id).sort()
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

function planRunEvents(team, planRunId) {
  return Object.values(team.planRunEvents ?? {})
    .filter(event => event.planRunId === planRunId)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}

function resultText(result) {
  return String(result?.content?.[0]?.text ?? result?.text ?? '')
}

function isDenied(result) {
  return result?.details?.denied === true || /denied|cannot|required|not implemented/i.test(resultText(result))
}

function assertNoBodySentinel(label, value, failures) {
  const json = JSON.stringify(value)
  if (json.includes(V0410_REPORT_BODY_SENTINEL)) failures.push(`${label} should not expose source planner TaskReport.text sentinel`)
  if (json.includes(V0410_MAILBOX_BODY_SENTINEL)) failures.push(`${label} should not expose MailboxMessage.text sentinel`)
}

function pushIfMissing(failures, condition, message) {
  if (!condition) failures.push(message)
}

function objectShape(schema) {
  if (!schema) return {}
  if (schema.kind === 'object' && schema.o) return schema.o
  if (schema.o) return schema.o
  if (schema.v) return objectShape(schema.v)
  return {}
}

function booleanField(field) {
  if (!field) return false
  if (field.kind === 'boolean') return true
  if (field.v) return booleanField(field.v)
  return false
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
  return walkProductionTsFiles(helpers.extRoot)
    .map(file => ({ rel: path.relative(helpers.extRoot, file), source: fs.readFileSync(file, 'utf8') }))
    .filter(item => /planrun|planRun|PlanRun|agentteam_planrun|runVisibility/.test(`${item.rel}\n${item.source}`))
}

function compactStateFingerprint(modules, teamName) {
  const team = modules.state.readTeamState(teamName)
  return {
    tasks: taskIds(team),
    taskEvents: eventIds(team),
    taskReports: reportIds(team),
    planRunEvents: Object.keys(team.planRunEvents ?? {}).sort(),
    nextTaskSeq: team.nextTaskSeq,
    nextPlanRunSeq: team.nextPlanRunSeq,
    nextPlanRunEventSeq: team.nextPlanRunEventSeq,
    leaderMailbox: messageIds(modules, teamName, 'team-lead'),
    implementerMailbox: messageIds(modules, teamName, 'implementer-a'),
  }
}

async function approvePlanRun(input) {
  const { planrunTool, fixture, leaderCtx, stepCount = 3 } = input
  const steps = Array.from({ length: stepCount }, (_, index) => ({
    title: `v0.4.10 step ${index + 1}`,
    description: `Compact v0.4.10 step ${index + 1}`,
    owner: ['implementer-a', 'implementer-b', 'implementer-c'][index] ?? 'implementer-a',
  }))
  return planrunTool.execute(`planrun-v0410-approve-${fixture.team.name}`, {
    action: 'approve',
    sourceReportId: fixture.sourceReportId,
    confirmApproved: true,
    steps,
  }, null, () => {}, leaderCtx)
}

function createContexts(helpers, fixture) {
  const root = `/tmp/planrun-v0410/${fixture.team.name}`
  return {
    leaderCtx: helpers.createCtx(root, fixture.team.leaderSessionFile, []),
    plannerCtx: helpers.createCtx(root, fixture.team.members['planner-one'].sessionFile, []),
    implementerACtx: helpers.createCtx(root, fixture.team.members['implementer-a'].sessionFile, []),
    implementerBCtx: helpers.createCtx(root, fixture.team.members['implementer-b'].sessionFile, []),
    implementerCCtx: helpers.createCtx(root, fixture.team.members['implementer-c'].sessionFile, []),
  }
}

async function exerciseCompletionLoop(input) {
  const { failures, modules, helpers, planrunTool, taskTool } = input
  const fixture = createFixtureTeam(modules, 'planrun-v0410-completion-loop')
  const { leaderCtx, implementerACtx, implementerBCtx } = createContexts(helpers, fixture)
  const beforeApprove = modules.state.readTeamState(fixture.team.name)
  const beforeTaskIds = taskIds(beforeApprove)
  const approved = await approvePlanRun({ planrunTool, fixture, leaderCtx, stepCount: 3 })
  assertNoBodySentinel('v0.4.10 approve', approved, failures)
  const planRunId = approved.details?.planRunId || findPlanRun(modules.state.readTeamState(fixture.team.name))?.id
  pushIfMissing(failures, Boolean(planRunId), 'approve should return/store a compact planRunId')
  if (!planRunId) return

  const firstAdvance = await planrunTool.execute('planrun-v0410-advance-step-1', {
    action: 'advance',
    planRunId,
  }, null, () => {}, leaderCtx)
  assertNoBodySentinel('v0.4.10 first advance', firstAdvance, failures)
  const afterFirstAdvance = modules.state.readTeamState(fixture.team.name)
  const firstCreatedTaskIds = taskIds(afterFirstAdvance).filter(id => !beforeTaskIds.includes(id))
  pushIfMissing(failures, firstCreatedTaskIds.length === 1, `advance step1 should create exactly one task, got ${firstCreatedTaskIds.length}`)
  const firstTaskId = firstCreatedTaskIds[0]
  if (!firstTaskId) return

  const reportStep1 = await taskTool.execute('planrun-v0410-report-step-1', {
    action: 'report_done',
    taskId: firstTaskId,
    note: 'step 1 ready for leader review',
  }, null, () => {}, implementerACtx)
  assertNoBodySentinel('v0.4.10 step1 report_done', reportStep1, failures)
  const afterReportStep1 = modules.state.readTeamState(fixture.team.name)
  const waitingRun = findPlanRun(afterReportStep1, planRunId)
  pushIfMissing(failures, waitingRun?.status === 'waiting_review', `owner report_done should move PlanRun to waiting_review, got ${waitingRun?.status}`)

  const closeStep1 = await taskTool.execute('planrun-v0410-close-step-1', {
    action: 'close',
    taskId: firstTaskId,
    note: 'leader accepted step 1',
  }, null, () => {}, leaderCtx)
  assertNoBodySentinel('v0.4.10 close step1', closeStep1, failures)
  const afterCloseStep1 = modules.state.readTeamState(fixture.team.name)
  const runAfterClose = findPlanRun(afterCloseStep1, planRunId)
  pushIfMissing(failures, afterCloseStep1.tasks[firstTaskId]?.status === 'done', 'leader close should still close the task itself')
  pushIfMissing(failures, runAfterClose?.steps?.[0]?.status === 'done', `leader close should mark PlanRun step1 done/accepted, got ${runAfterClose?.steps?.[0]?.status}`)
  pushIfMissing(failures, runAfterClose?.activeTaskId === undefined, `leader close should clear PlanRun activeTaskId, got ${runAfterClose?.activeTaskId}`)
  pushIfMissing(failures, runAfterClose?.currentStepIndex === 1, `leader close should advance currentStepIndex to step2, got ${runAfterClose?.currentStepIndex}`)
  pushIfMissing(failures, planRunEvents(afterCloseStep1, planRunId).some(event => /step_done|step_completed|accepted|reviewed/.test(event.type) || /accepted|completed|review/i.test(event.summary)), 'leader close should append compact PlanRun step accepted/completed event')

  const beforeSecondAdvanceTaskIds = taskIds(afterCloseStep1)
  const secondAdvance = await planrunTool.execute('planrun-v0410-advance-step-2', {
    action: 'advance',
    planRunId,
  }, null, () => {}, leaderCtx)
  assertNoBodySentinel('v0.4.10 second advance', secondAdvance, failures)
  const afterSecondAdvance = modules.state.readTeamState(fixture.team.name)
  const secondCreatedTaskIds = taskIds(afterSecondAdvance).filter(id => !beforeSecondAdvanceTaskIds.includes(id))
  const secondTaskId = secondCreatedTaskIds[0]
  const runAfterSecondAdvance = findPlanRun(afterSecondAdvance, planRunId)
  pushIfMissing(failures, secondCreatedTaskIds.length === 1, `explicit next advance should create exactly one step2 task, got ${secondCreatedTaskIds.length}`)
  pushIfMissing(failures, runAfterSecondAdvance?.steps?.[1]?.taskId === secondTaskId, `next advance should create step2 task, got step2 task ${runAfterSecondAdvance?.steps?.[1]?.taskId ?? '-'}`)
  pushIfMissing(failures, runAfterSecondAdvance?.steps?.[0]?.taskId === firstTaskId, 'next advance should not recreate or overwrite step1 task')

  if (secondTaskId) {
    await taskTool.execute('planrun-v0410-report-step-2', {
      action: 'report_done',
      taskId: secondTaskId,
      note: 'step 2 ready for leader review',
    }, null, () => {}, implementerBCtx)
    await taskTool.execute('planrun-v0410-close-step-2', {
      action: 'close',
      taskId: secondTaskId,
      note: 'leader accepted step 2',
    }, null, () => {}, leaderCtx)
    const runAfterCloseStep2 = findPlanRun(modules.state.readTeamState(fixture.team.name), planRunId)
    pushIfMissing(failures, runAfterCloseStep2?.currentStepIndex === 2, `closing step2 should prepare step3, got currentStepIndex=${runAfterCloseStep2?.currentStepIndex}`)
  }
}

async function exerciseTerminalDone(input) {
  const { failures, modules, helpers, planrunTool, taskTool } = input
  const fixture = createFixtureTeam(modules, 'planrun-v0410-terminal-done', { stepCount: 1 })
  const { leaderCtx, implementerACtx } = createContexts(helpers, fixture)
  const beforeApprove = modules.state.readTeamState(fixture.team.name)
  const beforeTaskIds = taskIds(beforeApprove)
  const approved = await approvePlanRun({ planrunTool, fixture, leaderCtx, stepCount: 1 })
  const planRunId = approved.details?.planRunId || findPlanRun(modules.state.readTeamState(fixture.team.name))?.id
  if (!planRunId) {
    failures.push('terminal fixture should create a PlanRun id')
    return
  }
  await planrunTool.execute('planrun-v0410-terminal-advance', { action: 'advance', planRunId }, null, () => {}, leaderCtx)
  const afterAdvance = modules.state.readTeamState(fixture.team.name)
  const createdTaskId = taskIds(afterAdvance).find(id => !beforeTaskIds.includes(id))
  if (!createdTaskId) {
    failures.push('terminal fixture advance should create one task before terminal assertions')
    return
  }
  await taskTool.execute('planrun-v0410-terminal-report', {
    action: 'report_done',
    taskId: createdTaskId,
    note: 'final step ready for leader review',
  }, null, () => {}, implementerACtx)
  await taskTool.execute('planrun-v0410-terminal-close', {
    action: 'close',
    taskId: createdTaskId,
    note: 'leader accepted final step',
  }, null, () => {}, leaderCtx)
  const afterFinalClose = modules.state.readTeamState(fixture.team.name)
  const runAfterFinalClose = findPlanRun(afterFinalClose, planRunId)
  pushIfMissing(failures, runAfterFinalClose?.status === 'done', `closing final PlanRun step should mark PlanRun done, got ${runAfterFinalClose?.status}`)
  pushIfMissing(failures, runAfterFinalClose?.activeTaskId === undefined, `done PlanRun should not keep activeTaskId, got ${runAfterFinalClose?.activeTaskId}`)
  pushIfMissing(failures, planRunEvents(afterFinalClose, planRunId).some(event => event.type === 'completed'), 'closing final step should append compact completed PlanRunEvent')

  const beforeAdvanceAfterDone = taskIds(afterFinalClose)
  const advanceAfterDone = await planrunTool.execute('planrun-v0410-advance-after-done', {
    action: 'advance',
    planRunId,
  }, null, () => {}, leaderCtx)
  assertNoBodySentinel('v0.4.10 advance after done', advanceAfterDone, failures)
  const afterAdvanceAfterDone = modules.state.readTeamState(fixture.team.name)
  pushIfMissing(failures, isDenied(advanceAfterDone), 'advance after done should be denied')
  pushIfMissing(failures, taskIds(afterAdvanceAfterDone).length === beforeAdvanceAfterDone.length, 'advance after done must not create another task')
}

async function exercisePauseResumeCancel(input) {
  const { failures, modules, helpers, planrunTool } = input
  const fixture = createFixtureTeam(modules, 'planrun-v0410-pause-resume-cancel')
  const { leaderCtx, implementerACtx } = createContexts(helpers, fixture)
  const approved = await approvePlanRun({ planrunTool, fixture, leaderCtx, stepCount: 2 })
  const planRunId = approved.details?.planRunId || findPlanRun(modules.state.readTeamState(fixture.team.name))?.id
  if (!planRunId) {
    failures.push('pause/resume/cancel fixture should create a PlanRun id')
    return
  }

  for (const action of ['pause', 'resume', 'cancel']) {
    const before = JSON.stringify(findPlanRun(modules.state.readTeamState(fixture.team.name), planRunId))
    const denied = await planrunTool.execute(`planrun-v0410-nonleader-${action}`, {
      action,
      planRunId,
    }, null, () => {}, implementerACtx)
    const after = JSON.stringify(findPlanRun(modules.state.readTeamState(fixture.team.name), planRunId))
    pushIfMissing(failures, isDenied(denied), `non-leader ${action} should be denied`)
    pushIfMissing(failures, /leader_only|only team-lead/i.test(JSON.stringify(denied)), `non-leader ${action} denial should be leader_only and explicit`)
    pushIfMissing(failures, after === before, `non-leader ${action} should not mutate PlanRun state`)
  }

  const leaderPause = await planrunTool.execute('planrun-v0410-leader-pause', {
    action: 'pause',
    planRunId,
  }, null, () => {}, leaderCtx)
  assertNoBodySentinel('v0.4.10 leader pause', leaderPause, failures)
  const afterLeaderPause = modules.state.readTeamState(fixture.team.name)
  const pausedRun = findPlanRun(afterLeaderPause, planRunId)
  pushIfMissing(failures, pausedRun?.status === 'paused', `leader pause should set status paused, got ${pausedRun?.status}`)
  pushIfMissing(failures, pausedRun?.pauseReason === 'leader_paused', `leader pause should default pauseReason=leader_paused, got ${pausedRun?.pauseReason}`)
  pushIfMissing(failures, planRunEvents(afterLeaderPause, planRunId).some(event => event.type === 'paused' && event.pauseReason === 'leader_paused'), 'leader pause should append compact paused PlanRunEvent')

  const beforeResumeTaskIds = taskIds(afterLeaderPause)
  const leaderResume = await planrunTool.execute('planrun-v0410-leader-resume', {
    action: 'resume',
    planRunId,
  }, null, () => {}, leaderCtx)
  assertNoBodySentinel('v0.4.10 leader resume', leaderResume, failures)
  const afterLeaderResume = modules.state.readTeamState(fixture.team.name)
  const resumedRun = findPlanRun(afterLeaderResume, planRunId)
  pushIfMissing(failures, resumedRun?.status === 'approved' || resumedRun?.status === 'active', `resume should return PlanRun to approved/active, got ${resumedRun?.status}`)
  pushIfMissing(failures, resumedRun?.pauseReason === undefined, `resume should clear pauseReason, got ${resumedRun?.pauseReason}`)
  pushIfMissing(failures, taskIds(afterLeaderResume).length === beforeResumeTaskIds.length, 'resume should not create a task')
  pushIfMissing(failures, planRunEvents(afterLeaderResume, planRunId).some(event => event.type === 'resumed'), 'resume should append compact resumed PlanRunEvent')

  const leaderCancel = await planrunTool.execute('planrun-v0410-leader-cancel', {
    action: 'cancel',
    planRunId,
  }, null, () => {}, leaderCtx)
  assertNoBodySentinel('v0.4.10 leader cancel', leaderCancel, failures)
  const afterLeaderCancel = modules.state.readTeamState(fixture.team.name)
  const cancelledRun = findPlanRun(afterLeaderCancel, planRunId)
  pushIfMissing(failures, cancelledRun?.status === 'cancelled', `cancel should set PlanRun cancelled, got ${cancelledRun?.status}`)
  pushIfMissing(failures, planRunEvents(afterLeaderCancel, planRunId).some(event => event.type === 'cancelled'), 'cancel should append compact cancelled PlanRunEvent')
  const beforeAdvanceCancelled = taskIds(afterLeaderCancel)
  const advanceCancelled = await planrunTool.execute('planrun-v0410-advance-cancelled', {
    action: 'advance',
    planRunId,
  }, null, () => {}, leaderCtx)
  pushIfMissing(failures, isDenied(advanceCancelled), 'advance after cancel should be denied')
  pushIfMissing(failures, taskIds(modules.state.readTeamState(fixture.team.name)).length === beforeAdvanceCancelled.length, 'advance after cancel must not create a task')
}

async function exerciseAdditionalPauseConditions(input) {
  const { failures, modules, helpers, planrunTool, taskTool, sendTool } = input
  const fixture = createFixtureTeam(modules, 'planrun-v0410-additional-pause')
  const { leaderCtx, implementerACtx, implementerBCtx } = createContexts(helpers, fixture)
  const approved = await approvePlanRun({ planrunTool, fixture, leaderCtx, stepCount: 2 })
  const planRunId = approved.details?.planRunId || findPlanRun(modules.state.readTeamState(fixture.team.name))?.id
  if (!planRunId) {
    failures.push('additional pause fixture should create a PlanRun id')
    return
  }
  const beforeAdvance = modules.state.readTeamState(fixture.team.name)
  await planrunTool.execute('planrun-v0410-question-advance', { action: 'advance', planRunId }, null, () => {}, leaderCtx)
  const afterAdvance = modules.state.readTeamState(fixture.team.name)
  const activeTaskId = taskIds(afterAdvance).find(id => !taskIds(beforeAdvance).includes(id))
  if (!activeTaskId) {
    failures.push('additional pause fixture advance should create one active task')
    return
  }

  const unrelatedBefore = JSON.stringify(findPlanRun(afterAdvance, planRunId))
  await sendTool.execute('planrun-v0410-unrelated-question', {
    to: 'team-lead',
    type: 'question',
    taskId: fixture.plannerTaskId,
    message: 'Unrelated planner question should not pause the active PlanRun step.',
  }, null, () => {}, implementerBCtx)
  const unrelatedAfter = JSON.stringify(findPlanRun(modules.state.readTeamState(fixture.team.name), planRunId))
  pushIfMissing(failures, unrelatedAfter === unrelatedBefore, 'unrelated/non-owner question should not pause or mutate the active PlanRun')

  const ownerQuestion = await sendTool.execute('planrun-v0410-owner-question', {
    to: 'team-lead',
    type: 'question',
    taskId: activeTaskId,
    message: 'Need leader decision before continuing this PlanRun step.',
  }, null, () => {}, implementerACtx)
  assertNoBodySentinel('v0.4.10 owner question', ownerQuestion, failures)
  const afterOwnerQuestion = modules.state.readTeamState(fixture.team.name)
  const questionRun = findPlanRun(afterOwnerQuestion, planRunId)
  pushIfMissing(failures, questionRun?.status === 'paused', `owner task-bound question should pause PlanRun, got ${questionRun?.status}`)
  pushIfMissing(failures, questionRun?.pauseReason === 'question', `owner task-bound question should set pauseReason=question, got ${questionRun?.pauseReason}`)
  pushIfMissing(failures, planRunEvents(afterOwnerQuestion, planRunId).some(event => event.type === 'paused' && event.pauseReason === 'question' && event.taskId === activeTaskId), 'owner question should append compact PlanRun paused/question event')

  const showActiveTask = await taskTool.execute('planrun-v0410-watchdog-show', {
    action: 'show',
    taskId: activeTaskId,
  }, null, () => {}, leaderCtx)
  assertNoBodySentinel('v0.4.10 watchdog task show', showActiveTask, failures)
  pushIfMissing(failures, /watchdog|waiting_for_report|needsNudge/.test(JSON.stringify(showActiveTask)), 'active PlanRun task show should compactly surface watchdog waiting-for-report attention')
  const digestBefore = compactStateFingerprint(modules, fixture.team.name)
  const digest = modules.orchestration.maybeInjectLeaderOrchestrationContext({ messages: [] }, {
    team: modules.state.readTeamState(fixture.team.name),
    memberName: 'team-lead',
    state: {
      lastDigestKey: '',
      lastDigestAt: 0,
      lastBlockedCount: 0,
      lastBlockedFingerprints: [],
    },
  })
  assertNoBodySentinel('v0.4.10 watchdog leader digest', digest, failures)
  const digestAfter = compactStateFingerprint(modules, fixture.team.name)
  pushIfMissing(failures, /watchdog|waiting_for_report|PlanRun attention/i.test(JSON.stringify(digest)), 'leader digest should compactly surface active PlanRun watchdog/waiting attention')
  pushIfMissing(failures, JSON.stringify(digestAfter.tasks) === JSON.stringify(digestBefore.tasks), 'watchdog digest must not auto-advance/create tasks')
  pushIfMissing(failures, JSON.stringify(digestAfter.implementerMailbox) === JSON.stringify(digestBefore.implementerMailbox), 'watchdog digest must not auto-nudge owner mailbox')

  const validationPause = await planrunTool.execute('planrun-v0410-validation-failure-pause', {
    action: 'pause',
    planRunId,
    pauseReason: 'validation_failed',
  }, null, () => {}, leaderCtx)
  const validationRun = findPlanRun(modules.state.readTeamState(fixture.team.name), planRunId)
  pushIfMissing(failures, validationRun?.pauseReason === 'validation_failed', `manual validation failure pause should set pauseReason=validation_failed, got ${validationRun?.pauseReason}`)
  pushIfMissing(failures, /validation_failed/.test(JSON.stringify(validationPause)) || planRunEvents(modules.state.readTeamState(fixture.team.name), planRunId).some(event => event.pauseReason === 'validation_failed'), 'manual validation failure pause should return/record compact validation_failed reason')
}

async function exerciseDryRunAndUx(input) {
  const { failures, modules, helpers, planrunTool } = input
  const fixture = createFixtureTeam(modules, 'planrun-v0410-dry-run-ux')
  const { leaderCtx } = createContexts(helpers, fixture)
  const approved = await approvePlanRun({ planrunTool, fixture, leaderCtx, stepCount: 2 })
  const planRunId = approved.details?.planRunId || findPlanRun(modules.state.readTeamState(fixture.team.name))?.id
  if (!planRunId) {
    failures.push('dry-run fixture should create a PlanRun id')
    return
  }
  const approvedShow = await planrunTool.execute('planrun-v0410-show-approved', { action: 'show', planRunId }, null, () => {}, leaderCtx)
  const approvedList = await planrunTool.execute('planrun-v0410-list-approved', { action: 'list' }, null, () => {}, leaderCtx)
  assertNoBodySentinel('v0.4.10 approved show', approvedShow, failures)
  assertNoBodySentinel('v0.4.10 approved list', approvedList, failures)
  pushIfMissing(failures, /nextAction|next:|advance/i.test(JSON.stringify(approvedShow)), 'PlanRun show should include compact nextAction hint for approved runs')
  pushIfMissing(failures, /nextAction|next:|advance/i.test(JSON.stringify(approvedList)), 'PlanRun list should include compact nextAction hint for approved runs')

  const shape = objectShape(planrunTool.parameters)
  pushIfMissing(failures, booleanField(shape.dryRun), 'agentteam_planrun schema should expose dryRun=true for advance/pause/resume/cancel previews')
  for (const action of ['advance', 'pause', 'resume', 'cancel']) {
    const before = compactStateFingerprint(modules, fixture.team.name)
    const result = await planrunTool.execute(`planrun-v0410-dry-run-${action}`, {
      action,
      planRunId,
      dryRun: true,
    }, null, () => {}, leaderCtx)
    assertNoBodySentinel(`v0.4.10 dryRun ${action}`, result, failures)
    const after = compactStateFingerprint(modules, fixture.team.name)
    pushIfMissing(failures, /dryRun|preview|would/i.test(JSON.stringify(result)) && !isDenied(result), `dryRun ${action} should return a compact preview instead of denial/execution`)
    pushIfMissing(failures, JSON.stringify(after) === JSON.stringify(before), `dryRun ${action} must not mutate tasks/events/seq/mailbox`)
  }
}

async function exercisePanelVisibility(input) {
  const { failures, modules, helpers, planrunTool, taskTool } = input
  const fixture = createFixtureTeam(modules, 'planrun-v0410-panel-visibility')
  const { leaderCtx, implementerACtx } = createContexts(helpers, fixture)
  const approved = await approvePlanRun({ planrunTool, fixture, leaderCtx, stepCount: 2 })
  const planRunId = approved.details?.planRunId || findPlanRun(modules.state.readTeamState(fixture.team.name))?.id
  if (!planRunId) {
    failures.push('panel visibility fixture should create a PlanRun id')
    return
  }
  const beforeAdvance = modules.state.readTeamState(fixture.team.name)
  await planrunTool.execute('planrun-v0410-panel-advance', { action: 'advance', planRunId }, null, () => {}, leaderCtx)
  const afterAdvance = modules.state.readTeamState(fixture.team.name)
  const activeTaskId = taskIds(afterAdvance).find(id => !taskIds(beforeAdvance).includes(id))
  if (activeTaskId) {
    await taskTool.execute('planrun-v0410-panel-report', {
      action: 'report_done',
      taskId: activeTaskId,
      note: 'panel should show waiting review compactly',
    }, null, () => {}, implementerACtx)
  }
  const repository = helpers.requireDist('state/repository.js').createStateRepository()
  const panelModel = repository.readTeamPanelModel(fixture.team.name)
  assertNoBodySentinel('v0.4.10 panel model', panelModel, failures)
  pushIfMissing(failures, Object.prototype.hasOwnProperty.call(panelModel, 'taskReports') === false, 'panel read model must not expose raw taskReports')
  pushIfMissing(failures, Object.prototype.hasOwnProperty.call(panelModel, 'taskEvents') === false, 'panel read model must not expose raw taskEvents')
  pushIfMissing(failures, Object.prototype.hasOwnProperty.call(panelModel, 'taskMessageRefs') === false, 'panel read model must not expose raw taskMessageRefs')
  pushIfMissing(failures, JSON.stringify(panelModel).includes(planRunId), 'panel/read-model should include active/waiting/paused PlanRun compact id')
  pushIfMissing(failures, /waiting_review|paused|activePlanRun|planRun/i.test(JSON.stringify(panelModel)), 'panel/read-model should include compact PlanRun status/attention fields')
}

function exerciseSourceGuardrails(input) {
  const { failures, helpers } = input
  const sources = planRunProductionSources(helpers)
  const combined = sources.map(item => item.source).join('\n')
  pushIfMissing(failures, /leader_paused/.test(combined), 'PlanRun production model should include leader_paused pause reason for manual pause')
  pushIfMissing(failures, /validation_failed/.test(combined), 'PlanRun production model should include validation_failed pause reason/seam')
  pushIfMissing(failures, /dryRun/.test(combined), 'PlanRun production modules should include dryRun preview support')
  pushIfMissing(failures, /nextAction/.test(combined), 'PlanRun compact show/list/panel surfaces should expose nextAction hints')
  for (const { rel, source } of sources) {
    if (/setInterval|setTimeout|cron|\bscheduler\b|autoAdvance|autopilot|createTeammatePane|agentteam_spawn|executeSpawnMember/.test(source)) {
      failures.push(`${rel} should not implement hidden scheduler/timer/default autopilot/worker-spawns-worker behavior`)
    }
    if (/\.text\b/.test(source) && !/action\s*[=:]\s*['"]report['"]|explicit/i.test(source)) {
      failures.push(`${rel} compact PlanRun surfaces should not read MailboxMessage.text or TaskReport.text outside explicit full-text boundaries`)
    }
  }
}

module.exports = {
  name: 'PlanRun v0.4.10 completion/recovery RED characterization',
  async run(env) {
    const { pi, modules, helpers } = env
    const failures = []
    const planrunTool = pi.__tools.get('agentteam_planrun')
    const taskTool = pi.__tools.get('agentteam_task')
    const sendTool = pi.__tools.get('agentteam_send')
    pushIfMissing(failures, Boolean(planrunTool), 'agentteam_planrun tool should exist before v0.4.10 hardening tests run')
    pushIfMissing(failures, Boolean(taskTool), 'agentteam_task tool should exist before v0.4.10 hardening tests run')
    pushIfMissing(failures, Boolean(sendTool), 'agentteam_send tool should exist before v0.4.10 hardening tests run')
    if (!planrunTool || !taskTool || !sendTool) {
      assert.equal(failures.length, 0, failures.join('\n'))
      return
    }

    await withTempHome(modules, 'red-suite', async () => {
      await exerciseCompletionLoop({ failures, modules, helpers, planrunTool, taskTool })
      await exerciseTerminalDone({ failures, modules, helpers, planrunTool, taskTool })
      await exercisePauseResumeCancel({ failures, modules, helpers, planrunTool })
      await exerciseAdditionalPauseConditions({ failures, modules, helpers, planrunTool, taskTool, sendTool })
      await exerciseDryRunAndUx({ failures, modules, helpers, planrunTool })
      await exercisePanelVisibility({ failures, modules, helpers, planrunTool, taskTool })
      exerciseSourceGuardrails({ failures, helpers })
    })

    assert.equal(failures.length, 0, failures.join('\n'))
  },
}
