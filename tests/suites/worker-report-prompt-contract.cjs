const assert = require('node:assert/strict')

function promptContractViolations(prompt, taskId, label) {
  const text = String(prompt || '')
  const violations = []
  if (!text.includes(`agentteam_task action=report_done taskId=${taskId}`)) {
    violations.push(`${label}: missing explicit done report command with taskId=${taskId}`)
  }
  if (!text.includes(`agentteam_task action=report_blocked taskId=${taskId}`)) {
    violations.push(`${label}: missing explicit blocked report command with taskId=${taskId}`)
  }
  if (!/(do not|don't|never)[^.\n]*(only|just)?[^.\n]*(natural language|say|message)[^.\n]*(done|complete|blocked|finished)/i.test(text)) {
    violations.push(`${label}: missing instruction not to finish/block only with natural-language text`)
  }
  if (!/progress/i.test(text) || !/does not notify (team-lead|leader)/i.test(text)) {
    violations.push(`${label}: missing reminder that progress does not notify leader`)
  }
  if (!/(final|finish|result|complete)[^.\n]*(report_done|report_blocked|report)|report[^.\n]*(final|result|finish|complete)/i.test(text)) {
    violations.push(`${label}: missing final-result-must-use-report framing`)
  }
  return violations
}

function assertPromptContract(prompt, taskId, label) {
  const violations = promptContractViolations(prompt, taskId, label)
  assert.deepEqual(violations, [], `${label} should enforce worker report completion contract\n${prompt}`)
}

module.exports = {
  name: 'worker report prompt contract',
  async run(env) {
    const { modules, helpers } = env
    const workerPrompt = helpers.requireDist('tools/workerPrompt.js')

    const team = modules.state.createInitialTeamState({
      teamName: 'worker-report-prompt-contract-suite',
      leaderSessionFile: '/tmp/worker-report-prompt-contract-leader.jsonl',
      leaderCwd: '/tmp/worker-report-prompt-contract-project',
    })
    modules.state.upsertMember(team, {
      name: 'report-worker',
      role: 'implementer',
      cwd: '/tmp/worker-report-prompt-contract-project',
      sessionFile: '/tmp/worker-report-prompt-contract-worker.jsonl',
      status: 'idle',
    })
    const task = modules.state.createTask(team, {
      title: 'Report prompt contract task',
      description: 'worker should finish through durable report commands',
      owner: 'report-worker',
    })
    task.owner = 'report-worker'
    task.status = 'open'
    modules.state.writeTeamState(team)

    const taskAssignment = modules.state.pushMailboxMessage(team.name, 'report-worker', {
      from: 'team-lead',
      to: 'report-worker',
      text: 'Implement the report prompt contract fixture.',
      summary: 'report prompt contract assignment',
      type: 'assignment',
      taskId: task.id,
      threadId: `task:${task.id}`,
    })
    const latestTeam = modules.state.readTeamState(team.name)
    const unread = modules.state.peekUnreadMailbox(team.name, 'report-worker')

    const workerTurnPrompt = modules.workerTurnPrompt.buildWorkerTurnPrompt(latestTeam, 'report-worker', {
      unreadMessages: unread,
      allowAssignedTaskTrigger: true,
    })
    assert.ok(workerTurnPrompt.includes(`Assigned tasks: ${task.id} Report prompt contract task`), 'worker turn prompt should include assigned task facts')
    assert.ok(workerTurnPrompt.includes(taskAssignment.text), 'worker turn prompt should include task-bound assignment text')
    assertPromptContract(workerTurnPrompt, task.id, 'worker turn assigned-task prompt')

    const bridgePrompt = modules.runtimeBridge.buildBridgeTurnPrompt(latestTeam, 'report-worker', undefined, unread, {
      allowAssignedTaskTrigger: true,
    })
    assert.equal(bridgePrompt, workerTurnPrompt, 'bridge delivery should use the same worker turn prompt contract')
    assertPromptContract(bridgePrompt, task.id, 'bridge task-bound delivery prompt')

    const systemPrompt = workerPrompt.buildWorkerSystemPrompt({
      teamName: team.name,
      workerName: 'report-worker',
      role: 'implementer',
      roleAgent: {
        name: 'implementer',
        description: 'implementation teammate',
        systemPrompt: 'implementer role prompt',
      },
    })
    assertPromptContract(systemPrompt, '<taskId>', 'worker system prompt generic contract')
  },
}
