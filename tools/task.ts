import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { StringEnum } from '@earendil-works/pi-ai'
import { Type } from 'typebox'
import { TASK_STATUSES } from '../core/publicModel.js'
import { TEAM_TASK_ACTIONS } from '../core/taskActions.js'
import type { ToolHandlerDeps } from './shared.js'
import { executeTaskAction } from './taskService.js'

const TeamTaskParams = Type.Object({
  action: StringEnum(TEAM_TASK_ACTIONS),
  taskId: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  owner: Type.Optional(Type.String()),
  note: Type.Optional(Type.String()),
  blockedBy: Type.Optional(Type.Array(Type.String())),
  status: Type.Optional(
    StringEnum(TASK_STATUSES, { description: 'For action=list, filter by task status.' }),
  ),
  limit: Type.Optional(Type.Number({ description: 'For action=list, maximum number of matching tasks to show.' })),
  all: Type.Optional(Type.Boolean({ description: 'For action=list, show all matching tasks instead of the concise default.' })),
})

export function registerTaskTools(pi: ExtensionAPI, deps: ToolHandlerDeps): void {
  pi.registerTool({
    name: 'agentteam_task',
    label: 'AgentTeam Task',
    description: 'Leader-gated shared task workflow: create, assign, block, unblock, close, append task-local notes, and send owner-only done/blocked reports.',
    promptSnippet: 'Manage the shared agentteam task board: create, assign, block, unblock, close, note, report_done, report_blocked, and list tasks with leader-gated mutations. note is task-local memory only; use agentteam_send for communication.',
    promptGuidelines: [
      'Use agentteam_task before delegation so teammate work is tracked by taskId.',
      'For research→planning or other multi-role chains, use sequential leader-gated tasks: create/assign the research task first; after the report-only result is reviewed, create/assign or unblock the planner task. Do not rely on researcher inform messages or task reports to start planner work.',
      'Only team-lead should create, assign, factually block/unblock, close tasks, or change owners; planner is advisory by default, not a second leader.',
      'action=note appends task-local memory only: it does not notify team-lead, create mailbox/projection/attention side effects, or add linked communication notes.',
      'Non-leader action=report_done is only for the current task owner: it sends an owner-to-leader action request and does not set task.status=done until leader close; non-owners should use inform/question for context.',
      'Non-leader action=report_blocked is only for the current task owner: it sends an owner-to-leader action request and does not mutate task.status or blockedBy until leader review; non-owners should use inform/question for context.',
      'Blocked tasks are non-actionable for worker assignment/delivery until team-lead unblocks them; leader close can still accept/close the task after review.',
    ],
    parameters: TeamTaskParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeTaskAction(params, ctx, deps)
    },
  })
}
