const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const V0411_REPORT_BODY_SENTINEL = 'V0411_PLANRUN_FULL_REPORT_BODY_SHOULD_NOT_LEAK'
const V0411_MAILBOX_BODY_SENTINEL = 'V0411_PLANRUN_FULL_MAILBOX_BODY_SHOULD_NOT_LEAK'
const EXPECTED_V0411_ACTIONS = ['signal_failure', 'check_limits']
const EXPECTED_FAILURE_KINDS = ['validation_failed', 'test_failed']
const EXPECTED_LIMIT_FIELDS = ['maxSteps', 'maxConsecutiveSteps', 'deadlineAt', 'maxDurationMs']

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-planrun-v0411-${name}-`))
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
    paneId: `%planrun-v0411-${name}`,
    windowTarget: 'planrun-v0411:@1',
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
    data: { source: 'planrun-v0411-fixture', newOwner: owner },
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
    leaderCwd: `/tmp/planrun-v0411/${name}`,
    description: 'v0.4.11 PlanRun limits/failure RED characterization fixture',
  })
  addMember(modules, team, 'planner-one', 'planner')
  addMember(modules, team, 'implementer-a', 'implementer', options.implementerStatus ?? 'idle')
  addMember(modules, team, 'implementer-b', 'implementer', options.implementerStatus ?? 'idle')

  const plannerTask = createTask(modules, team, {
    title: 'Draft v0.4.11 limits/failure plan',
    description: 'Planner source task for PlanRun limits/failure characterization.',
    owner: 'planner-one',
    createdAt: 1700004110000,
    updatedAt: 1700004110000,
  })
  addAssignment(modules, team, plannerTask, 'planner-one', 1700004110010)

  const sourceReport = modules.state.appendTaskReport(team, {
    taskId: plannerTask.id,
    type: 'report_done',
    author: 'planner-one',
    text: [
      `${V0411_REPORT_BODY_SENTINEL} source planner report body`,
      'Approved PlanRun limits/failure candidate:',
      'Step 1: implement guarded behavior; owner=implementer-a',
      'Step 2: validate guarded behavior; owner=implementer-b',
    ].join('\n'),
    summary: 'Compact two-step PlanRun limits/failure proposal',
    createdAt: 1700004110020,
    threadId: `task:${plannerTask.id}`,
    reporterIsOwner: true,
    statusAtReport: 'open',
    ownerAtReport: 'planner-one',
    metadata: { source: 'planrun-v0411-fixture', proposedPlanSteps: options.stepCount ?? 2 },
  })
  modules.state.appendTaskEvent(team, {
    taskId: plannerTask.id,
    type: 'report_submitted',
    by: 'planner-one',
    at: 1700004110021,
    summary: sourceReport.summary,
    reportId: sourceReport.id,
    data: { source: 'planrun-v0411-fixture', reportType: 'report_done' },
  })

  modules.state.writeTeamState(team)
  modules.state.writeSessionContext(team.leaderSessionFile, { teamName: team.name, memberName: 'team-lead' })
  for (const memberName of ['planner-one', 'implementer-a', 'implementer-b']) {
    modules.state.writeSessionContext(team.members[memberName].sessionFile, { teamName: team.name, memberName })
  }

  modules.state.pushMailboxMessage(name, 'team-lead', {
    id: `${name}-leader-planrun-v0411-sentinel`,
    from: 'planner-one',
    to: 'team-lead',
    type: 'report_done',
    taskId: plannerTask.id,
    threadId: `task:${plannerTask.id}`,
    summary: 'Compact PlanRun v0.4.11 source report mailbox summary',
    text: `${V0411_MAILBOX_BODY_SENTINEL} full mailbox body should require agentteam_receive`,
    metadata: { source: 'planrun-v0411-fixture', reportId: sourceReport.id },
    createdAt: 1700004110030,
  })

  return {
    team: modules.state.readTeamState(name),
    plannerTaskId: plannerTask.id,
    sourceReportId: sourceReport.id,
  }
}

function createContexts(helpers, fixture) {
  const root = `/tmp/planrun-v0411/${fixture.team.name}`
  return {
    leaderCtx: helpers.createCtx(root, fixture.team.leaderSessionFile, []),
    plannerCtx: helpers.createCtx(root, fixture.team.members['planner-one'].sessionFile, []),
    implementerACtx: helpers.createCtx(root, fixture.team.members['implementer-a'].sessionFile, []),
    implementerBCtx: helpers.createCtx(root, fixture.team.members['implementer-b'].sessionFile, []),
  }
}

function resultText(result) {
  return String(result?.content?.[0]?.text ?? result?.text ?? result?.error?.message ?? '')
}

function pushIfMissing(failures, condition, message) {
  if (!condition) failures.push(message)
}

function assertNoBodySentinel(label, value, failures) {
  const json = JSON.stringify(value)
  if (json.includes(V0411_REPORT_BODY_SENTINEL)) failures.push(`${label} should not expose source planner TaskReport.text sentinel`)
  if (json.includes(V0411_MAILBOX_BODY_SENTINEL)) failures.push(`${label} should not expose MailboxMessage.text sentinel`)
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

function optionalObjectShape(field) {
  if (!field) return {}
  if (field.kind === 'object' && field.o) return field.o
  if (field.v) return optionalObjectShape(field.v)
  if (field.o) return field.o
  return {}
}

function booleanField(field) {
  if (!field) return false
  if (field.kind === 'boolean') return true
  if (field.v) return booleanField(field.v)
  return false
}

function taskIds(team) {
  return Object.keys(team.tasks ?? {}).sort()
}

function eventIds(team) {
  return Object.keys(team.taskEvents ?? {}).sort()
}

function planRunEventIds(team) {
  return Object.keys(team.planRunEvents ?? {}).sort()
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

function compactStateFingerprint(modules, teamName) {
  const team = modules.state.readTeamState(teamName)
  return {
    tasks: taskIds(team),
    taskEvents: eventIds(team),
    taskReports: reportIds(team),
    planRuns: Object.values(team.planRuns ?? {}).map(run => ({
      id: run.id,
      status: run.status,
      pauseReason: run.pauseReason,
      currentStepIndex: run.currentStepIndex,
      activeTaskId: run.activeTaskId,
      steps: run.steps.map(step => ({ index: step.index, status: step.status, taskId: step.taskId })),
      limits: run.limits,
      limitState: run.limitState,
    })),
    planRunEvents: planRunEventIds(team),
    nextTaskSeq: team.nextTaskSeq,
    nextPlanRunSeq: team.nextPlanRunSeq,
    nextPlanRunEventSeq: team.nextPlanRunEventSeq,
    leaderMailbox: messageIds(modules, teamName, 'team-lead'),
    implementerMailbox: messageIds(modules, teamName, 'implementer-a'),
  }
}

async function safeExecute(tool, toolCallId, params, ctx) {
  try {
    return await tool.execute(toolCallId, params, null, () => {}, ctx)
  } catch (error) {
    return { error, content: [{ type: 'text', text: error?.message ?? String(error) }], details: { threw: true } }
  }
}

function isDenied(result) {
  return result?.details?.denied === true || /denied|cannot|required|unsupported|not implemented/i.test(resultText(result))
}

async function approvePlanRun(input) {
  const { planrunTool, fixture, leaderCtx, stepCount = 2, limits } = input
  const owners = ['implementer-a', 'implementer-b']
  const steps = Array.from({ length: stepCount }, (_, index) => ({
    title: `v0.4.11 step ${index + 1}`,
    description: `Compact v0.4.11 step ${index + 1}`,
    owner: owners[index] ?? 'implementer-a',
  }))
  const params = {
    action: 'approve',
    sourceReportId: fixture.sourceReportId,
    confirmApproved: true,
    steps,
  }
  if (limits) params.limits = limits
  return safeExecute(planrunTool, `planrun-v0411-approve-${fixture.team.name}`, params, leaderCtx)
}

async function createActivePlanRunFixture(input) {
  const { failures, modules, helpers, planrunTool, name, limits } = input
  const fixture = createFixtureTeam(modules, name)
  const { leaderCtx, implementerACtx, implementerBCtx } = createContexts(helpers, fixture)
  const beforeApprove = modules.state.readTeamState(fixture.team.name)
  const beforeTaskIds = taskIds(beforeApprove)
  const approved = await approvePlanRun({ planrunTool, fixture, leaderCtx, stepCount: 2, limits })
  assertNoBodySentinel(`${name} approve`, approved, failures)
  const planRunId = approved.details?.planRunId || findPlanRun(modules.state.readTeamState(fixture.team.name))?.id
  if (!planRunId) {
    failures.push(`${name}: approve should return/store a compact planRunId`)
    return { fixture, leaderCtx, implementerACtx, implementerBCtx }
  }
  const advanced = await safeExecute(planrunTool, `${name}-advance-step-1`, { action: 'advance', planRunId }, leaderCtx)
  assertNoBodySentinel(`${name} advance`, advanced, failures)
  const afterAdvance = modules.state.readTeamState(fixture.team.name)
  const activeTaskId = taskIds(afterAdvance).find(id => !beforeTaskIds.includes(id))
  if (!activeTaskId) failures.push(`${name}: explicit advance should create one active step task before v0.4.11 assertions`)
  return { fixture, leaderCtx, implementerACtx, implementerBCtx, planRunId, activeTaskId }
}

function assertTaskUnchangedOpen(label, beforeTask, afterTask, failures) {
  pushIfMissing(failures, Boolean(afterTask), `${label}: task should still exist`)
  if (!beforeTask || !afterTask) return
  pushIfMissing(failures, afterTask.status === 'open', `${label}: task should remain open, got ${afterTask.status}`)
  pushIfMissing(failures, afterTask.owner === beforeTask.owner, `${label}: task owner should not be reassigned`)
  pushIfMissing(failures, JSON.stringify(afterTask.blockedBy) === JSON.stringify(beforeTask.blockedBy), `${label}: task blockedBy should not change`)
}

function exerciseSchemaExpectations(input) {
  const { failures, planrunTool } = input
  const shape = objectShape(planrunTool.parameters)
  const actionValues = enumValues(shape.action)
  for (const action of EXPECTED_V0411_ACTIONS) {
    pushIfMissing(failures, actionValues.includes(action), `agentteam_planrun schema should include action=${action}`)
  }
  const failureKindValues = enumValues(shape.failureKind)
  for (const failureKind of EXPECTED_FAILURE_KINDS) {
    pushIfMissing(failures, failureKindValues.includes(failureKind), `agentteam_planrun schema should include failureKind=${failureKind}`)
  }
  for (const field of ['taskId', 'source', 'summary', 'externalRef']) {
    pushIfMissing(failures, Boolean(shape[field]), `agentteam_planrun schema should include optional ${field} for signal_failure`)
  }
  pushIfMissing(failures, booleanField(shape.dryRun), 'agentteam_planrun schema should expose dryRun for v0.4.11 previews')
  const limitsShape = optionalObjectShape(shape.limits)
  for (const field of EXPECTED_LIMIT_FIELDS) {
    pushIfMissing(failures, Boolean(limitsShape[field]), `agentteam_planrun approve schema should include limits.${field}`)
  }
}

async function exerciseFailureSignal(input) {
  const { failures, modules, helpers, planrunTool } = input
  const active = await createActivePlanRunFixture({ failures, modules, helpers, planrunTool, name: 'planrun-v0411-failure-signal' })
  if (!active.planRunId || !active.activeTaskId) return
  const { fixture, leaderCtx, implementerACtx, planRunId, activeTaskId } = active
  const before = modules.state.readTeamState(fixture.team.name)
  const beforeTask = before.tasks[activeTaskId]
  const beforeFingerprint = compactStateFingerprint(modules, fixture.team.name)
  const leaderSignal = await safeExecute(planrunTool, 'planrun-v0411-leader-signal-validation-failure', {
    action: 'signal_failure',
    planRunId,
    taskId: activeTaskId,
    failureKind: 'validation_failed',
    source: 'npm test',
    summary: 'Validation failed after active PlanRun step',
    externalRef: 'ci://v0411-validation',
  }, leaderCtx)
  assertNoBodySentinel('v0.4.11 leader signal_failure', leaderSignal, failures)
  const afterLeaderSignal = modules.state.readTeamState(fixture.team.name)
  const runAfterSignal = findPlanRun(afterLeaderSignal, planRunId)
  pushIfMissing(failures, leaderSignal.details?.threw !== true, 'leader signal_failure should be implemented and not throw Unsupported PlanRun action')
  pushIfMissing(failures, runAfterSignal?.status === 'paused', `leader signal_failure should pause PlanRun, got ${runAfterSignal?.status}`)
  pushIfMissing(failures, runAfterSignal?.pauseReason === 'validation_failed', `leader signal_failure validation_failed should set pauseReason=validation_failed, got ${runAfterSignal?.pauseReason}`)
  pushIfMissing(failures, planRunEvents(afterLeaderSignal, planRunId).some(event => event.type === 'failure_signaled' && event.pauseReason === 'validation_failed' && event.taskId === activeTaskId), 'leader signal_failure should append compact failure_signaled PlanRunEvent with taskId and pauseReason')
  assertTaskUnchangedOpen('leader signal_failure', beforeTask, afterLeaderSignal.tasks[activeTaskId], failures)
  pushIfMissing(failures, taskIds(afterLeaderSignal).length === beforeFingerprint.tasks.length, 'leader signal_failure must not create tasks')
  pushIfMissing(failures, messageIds(modules, fixture.team.name, 'implementer-a').length === beforeFingerprint.implementerMailbox.length, 'leader signal_failure must not nudge/send owner mailbox')

  const beforeNonLeader = compactStateFingerprint(modules, fixture.team.name)
  const nonLeaderSignal = await safeExecute(planrunTool, 'planrun-v0411-nonleader-signal-test-failure', {
    action: 'signal_failure',
    planRunId,
    taskId: activeTaskId,
    failureKind: 'test_failed',
    source: 'worker test',
    summary: 'Worker should not be able to signal first-class PlanRun failure',
    externalRef: 'worker://attempt',
  }, implementerACtx)
  assertNoBodySentinel('v0.4.11 non-leader signal_failure', nonLeaderSignal, failures)
  const afterNonLeader = compactStateFingerprint(modules, fixture.team.name)
  pushIfMissing(failures, isDenied(nonLeaderSignal), 'non-leader signal_failure should be denied')
  pushIfMissing(failures, JSON.stringify(afterNonLeader) === JSON.stringify(beforeNonLeader), 'non-leader signal_failure must not mutate PlanRun/tasks/events/seqs/mailbox')
}

function legacyPlanRun(team, id = 'PRLEGACY') {
  return {
    id,
    status: 'approved',
    sourceTaskId: 'T1',
    sourceReportId: 'R1',
    sourceReportSummary: 'Legacy compact summary',
    sourceReportHash: 'legacyhash',
    approvedBy: 'team-lead',
    approvedAt: 1700004110100,
    createdAt: 1700004110100,
    updatedAt: 1700004110100,
    currentStepIndex: 0,
    steps: [
      {
        id: 'PRS0001',
        index: 0,
        title: 'Legacy step',
        description: 'Legacy compact step',
        owner: 'implementer-a',
        status: 'pending',
        createdAt: 1700004110100,
        updatedAt: 1700004110100,
        sourceSummary: 'Legacy step',
      },
    ],
    metadata: { source: 'legacy-planrun-v0411-fixture' },
  }
}

async function exerciseLimitsModelAndCompatibility(input) {
  const { failures, modules, helpers, planrunTool } = input
  const fixture = createFixtureTeam(modules, 'planrun-v0411-limits-model')
  const { leaderCtx } = createContexts(helpers, fixture)
  const compactLimits = {
    maxSteps: 1,
    maxConsecutiveSteps: 1,
    deadlineAt: 1700004115000,
    maxDurationMs: 1000,
  }
  const approvedWithLimits = await approvePlanRun({ planrunTool, fixture, leaderCtx, stepCount: 2, limits: compactLimits })
  assertNoBodySentinel('v0.4.11 approve with limits', approvedWithLimits, failures)
  const teamAfterApprove = modules.state.readTeamState(fixture.team.name)
  const run = findPlanRun(teamAfterApprove, approvedWithLimits.details?.planRunId)
  pushIfMissing(failures, Boolean(run?.limits), 'approve should persist compact PlanRun limits')
  for (const field of EXPECTED_LIMIT_FIELDS) {
    pushIfMissing(failures, run?.limits?.[field] === compactLimits[field], `approve should persist limits.${field}`)
  }
  pushIfMissing(failures, Boolean(run?.limitState), 'approve should initialize compact PlanRun limitState')
  pushIfMissing(failures, typeof run?.limitState?.stepsStarted === 'number', 'limitState should track stepsStarted counter')
  pushIfMissing(failures, typeof run?.limitState?.consecutiveStepsStarted === 'number', 'limitState should track consecutiveStepsStarted counter')
  pushIfMissing(failures, run?.limitState?.reached === false || run?.limitState?.reached === undefined, 'newly approved limits should not be reached')

  const legacyFixture = createFixtureTeam(modules, 'planrun-v0411-legacy-limits')
  const legacyTeam = modules.state.readTeamState(legacyFixture.team.name)
  legacyTeam.planRuns = { PRLEGACY: legacyPlanRun(legacyTeam) }
  legacyTeam.activePlanRunId = 'PRLEGACY'
  legacyTeam.nextPlanRunSeq = 2
  legacyTeam.nextPlanRunEventSeq = 1
  modules.state.writeTeamState(legacyTeam)
  const legacyRead = modules.state.readTeamState(legacyFixture.team.name)
  const legacySummary = helpers.requireDist('state/repository.js').readPlanRunSummary(legacyFixture.team.name, 'PRLEGACY')
  pushIfMissing(failures, Boolean(legacyRead?.planRuns?.PRLEGACY), 'legacy PlanRun without limits should round-trip/read normally')
  pushIfMissing(failures, Boolean(legacySummary?.id === 'PRLEGACY'), 'repository should summarize legacy PlanRun without limits')
  const limitedSummary = helpers.requireDist('state/repository.js').readPlanRunSummary(fixture.team.name, run?.id)
  pushIfMissing(failures, Boolean(limitedSummary && Object.prototype.hasOwnProperty.call(limitedSummary, 'limits')), 'repository PlanRun summary should expose compact limits field when present while tolerating legacy absence')

  const invalidTeam = modules.state.readTeamState(legacyFixture.team.name)
  invalidTeam.planRuns.PRINVALID = {
    ...legacyPlanRun(invalidTeam, 'PRINVALID'),
    limits: { maxSteps: -1, maxConsecutiveSteps: 'bad', deadlineAt: 'tomorrow', maxDurationMs: -50 },
    limitState: { stepsStarted: -1, consecutiveStepsStarted: -1, reached: false },
  }
  const invalidReasons = modules.state.validatePersistedTeamState(invalidTeam, 'team.json')
  pushIfMissing(failures, invalidReasons.some(reason => /limit/i.test(`${reason.code} ${reason.path} ${reason.message}`)), 'invalid PlanRun limits should be rejected/sanitized by validation')
  pushIfMissing(failures, invalidReasons.every(reason => !/PRLEGACY/.test(reason.path)), 'invalid limits should not quarantine/reject valid legacy PlanRun records without limits')
}

async function exerciseExplicitLimitEvaluation(input) {
  const { failures, modules, helpers, planrunTool } = input
  const active = await createActivePlanRunFixture({
    failures,
    modules,
    helpers,
    planrunTool,
    name: 'planrun-v0411-check-limits',
    limits: { maxSteps: 1, maxConsecutiveSteps: 1, maxDurationMs: 1 },
  })
  if (!active.planRunId) return
  const { fixture, leaderCtx, planRunId } = active
  const beforeCheck = compactStateFingerprint(modules, fixture.team.name)
  const checkLimits = await safeExecute(planrunTool, 'planrun-v0411-check-limits-explicit', {
    action: 'check_limits',
    planRunId,
    source: 'leader explicit check',
  }, leaderCtx)
  assertNoBodySentinel('v0.4.11 check_limits', checkLimits, failures)
  const afterCheckTeam = modules.state.readTeamState(fixture.team.name)
  const runAfterCheck = findPlanRun(afterCheckTeam, planRunId)
  pushIfMissing(failures, checkLimits.details?.threw !== true, 'check_limits should be implemented and not throw Unsupported PlanRun action')
  pushIfMissing(failures, runAfterCheck?.status === 'paused', `check_limits reached limit should pause PlanRun, got ${runAfterCheck?.status}`)
  pushIfMissing(failures, runAfterCheck?.pauseReason === 'limit_reached', `check_limits reached limit should set pauseReason=limit_reached, got ${runAfterCheck?.pauseReason}`)
  pushIfMissing(failures, planRunEvents(afterCheckTeam, planRunId).some(event => /limit/.test(event.type) || /limit/i.test(event.summary)), 'check_limits reached limit should append compact limit reached event')
  pushIfMissing(failures, taskIds(afterCheckTeam).length === beforeCheck.tasks.length, 'check_limits must not create tasks')
  pushIfMissing(failures, eventIds(afterCheckTeam).length === beforeCheck.taskEvents.length, 'check_limits must not mutate task events')
  pushIfMissing(failures, messageIds(modules, fixture.team.name, 'implementer-a').length === beforeCheck.implementerMailbox.length, 'check_limits must not send owner mailbox/nudge')

  for (const action of ['check_limits', 'advance', 'resume']) {
    const beforeDryRun = compactStateFingerprint(modules, fixture.team.name)
    const dryRun = await safeExecute(planrunTool, `planrun-v0411-dry-run-${action}`, {
      action,
      planRunId,
      dryRun: true,
    }, leaderCtx)
    assertNoBodySentinel(`v0.4.11 dryRun ${action}`, dryRun, failures)
    const afterDryRun = compactStateFingerprint(modules, fixture.team.name)
    pushIfMissing(failures, /dryRun|preview|would/i.test(JSON.stringify(dryRun)) && dryRun.details?.threw !== true && !isDenied(dryRun), `dryRun ${action} should return compact preview instead of denial/execution`)
    pushIfMissing(failures, JSON.stringify(afterDryRun) === JSON.stringify(beforeDryRun), `dryRun ${action} must not mutate ids/seq/state/events/mailbox`)
  }

  const passiveFixture = createFixtureTeam(modules, 'planrun-v0411-no-background-limits')
  const { leaderCtx: passiveLeaderCtx } = createContexts(helpers, passiveFixture)
  const approved = await approvePlanRun({
    planrunTool,
    fixture: passiveFixture,
    leaderCtx: passiveLeaderCtx,
    stepCount: 2,
    limits: { maxSteps: 0, maxConsecutiveSteps: 0, maxDurationMs: 0, deadlineAt: 1 },
  })
  const passivePlanRunId = approved.details?.planRunId || findPlanRun(modules.state.readTeamState(passiveFixture.team.name))?.id
  const beforeDigest = compactStateFingerprint(modules, passiveFixture.team.name)
  const digest = modules.orchestration.maybeInjectLeaderOrchestrationContext({ messages: [] }, {
    team: modules.state.readTeamState(passiveFixture.team.name),
    memberName: 'team-lead',
    state: { lastDigestKey: '', lastDigestAt: 0, lastBlockedCount: 0, lastBlockedFingerprints: [] },
  })
  const afterDigest = compactStateFingerprint(modules, passiveFixture.team.name)
  assertNoBodySentinel('v0.4.11 passive leader digest', digest, failures)
  pushIfMissing(failures, Boolean(passivePlanRunId), 'passive limit fixture should create PlanRun id')
  pushIfMissing(failures, JSON.stringify(afterDigest) === JSON.stringify(beforeDigest), 'leader digest/background visibility must not evaluate limits or mutate PlanRun state')
}

async function exerciseCompactUx(input) {
  const { failures, modules, helpers, planrunTool, taskTool } = input
  const active = await createActivePlanRunFixture({ failures, modules, helpers, planrunTool, name: 'planrun-v0411-compact-ux' })
  if (!active.planRunId || !active.activeTaskId) return
  const { fixture, leaderCtx, planRunId, activeTaskId } = active
  await safeExecute(planrunTool, 'planrun-v0411-compact-ux-signal', {
    action: 'signal_failure',
    planRunId,
    taskId: activeTaskId,
    failureKind: 'test_failed',
    source: 'npm test',
    summary: 'Compact UX should show test_failed without body leaks',
    externalRef: 'ci://v0411-compact-ux',
  }, leaderCtx)
  const show = await safeExecute(planrunTool, 'planrun-v0411-show-failure-limit', { action: 'show', planRunId }, leaderCtx)
  const list = await safeExecute(planrunTool, 'planrun-v0411-list-failure-limit', { action: 'list' }, leaderCtx)
  const taskShow = await safeExecute(taskTool, 'planrun-v0411-task-show-failure-limit', { action: 'show', taskId: activeTaskId }, leaderCtx)
  const digest = modules.orchestration.maybeInjectLeaderOrchestrationContext({ messages: [] }, {
    team: modules.state.readTeamState(fixture.team.name),
    memberName: 'team-lead',
    state: { lastDigestKey: '', lastDigestAt: 0, lastBlockedCount: 0, lastBlockedFingerprints: [] },
  })
  const repository = helpers.requireDist('state/repository.js').createStateRepository()
  const panelModel = repository.readTeamPanelModel(fixture.team.name)
  for (const [label, value] of [
    ['v0.4.11 show', show],
    ['v0.4.11 list', list],
    ['v0.4.11 task show', taskShow],
    ['v0.4.11 leader digest', digest],
    ['v0.4.11 panel model', panelModel],
  ]) {
    assertNoBodySentinel(label, value, failures)
    const json = JSON.stringify(value)
    pushIfMissing(failures, json.includes(planRunId), `${label} should include compact planRunId`)
    pushIfMissing(failures, /test_failed|validation_failed|limit_reached/.test(json), `${label} should include compact failure/limit reason`)
    pushIfMissing(failures, /nextAction|next:/i.test(json), `${label} should include compact nextAction hint`)
    pushIfMissing(failures, !Object.prototype.hasOwnProperty.call(value || {}, 'taskReports'), `${label} must not expose raw taskReports`)
    pushIfMissing(failures, !Object.prototype.hasOwnProperty.call(value || {}, 'taskEvents'), `${label} must not expose raw taskEvents`)
    pushIfMissing(failures, !Object.prototype.hasOwnProperty.call(value || {}, 'taskMessageRefs'), `${label} must not expose raw taskMessageRefs`)
  }
}

function exerciseSourceGuardrails(input) {
  const { failures, helpers } = input
  const sourceChecks = [
    { rel: 'core/planRunActions.ts', needles: ['signal_failure', 'check_limits'] },
    { rel: 'app/planRunTypes.ts', needles: ['failureKind', 'limits', 'limitState', 'dryRun'] },
    { rel: 'internalTypes.ts', needles: ['test_failed', 'limit_reached', 'limits', 'limitState'] },
    { rel: 'state/validation.ts', needles: ['test_failed', 'limit_reached', 'maxSteps', 'maxConsecutiveSteps', 'deadlineAt', 'maxDurationMs'] },
    { rel: 'tools/planRun.ts', needles: ['failureKind', 'signal_failure', 'check_limits', 'limits'] },
  ]
  for (const check of sourceChecks) {
    const source = helpers.readSource(check.rel)
    for (const needle of check.needles) {
      pushIfMissing(failures, source.includes(needle), `${check.rel} should include v0.4.11 compact PlanRun ${needle} support`)
    }
  }

  const productionFiles = []
  function walk(root) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'tests' || entry.name === 'data') continue
      const full = path.join(root, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.ts')) productionFiles.push(full)
    }
  }
  walk(helpers.extRoot)
  for (const file of productionFiles) {
    const rel = path.relative(helpers.extRoot, file)
    const source = fs.readFileSync(file, 'utf8')
    const planRunRelevant = /planrun|planRun|PlanRun|agentteam_planrun/.test(`${rel}\n${source}`)
    if (planRunRelevant && /setInterval|\bcron\b|autoAdvance|autopilot|workerSpawnsWorker|agentteam_spawn|executeSpawnMember/.test(source)) {
      failures.push(`${rel} should not introduce hidden scheduler/timer/default autopilot/worker-spawns-worker behavior for PlanRun limits`)
    }
  }
}

module.exports = {
  name: 'PlanRun v0.4.11 limits/failure RED characterization',
  async run(env) {
    const { pi, modules, helpers } = env
    const failures = []
    const planrunTool = pi.__tools.get('agentteam_planrun')
    const taskTool = pi.__tools.get('agentteam_task')
    pushIfMissing(failures, Boolean(planrunTool), 'agentteam_planrun tool should exist before v0.4.11 characterization tests run')
    pushIfMissing(failures, Boolean(taskTool), 'agentteam_task tool should exist before v0.4.11 characterization tests run')
    if (!planrunTool || !taskTool) {
      assert.equal(failures.length, 0, failures.join('\n'))
      return
    }

    await withTempHome(modules, 'red-suite', async () => {
      exerciseSchemaExpectations({ failures, planrunTool })
      await exerciseFailureSignal({ failures, modules, helpers, planrunTool })
      await exerciseLimitsModelAndCompatibility({ failures, modules, helpers, planrunTool })
      await exerciseExplicitLimitEvaluation({ failures, modules, helpers, planrunTool })
      await exerciseCompactUx({ failures, modules, helpers, planrunTool, taskTool })
      exerciseSourceGuardrails({ failures, helpers })
    })

    assert.equal(failures.length, 0, failures.join('\n'))
  },
}
