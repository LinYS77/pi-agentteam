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
  reportId: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  owner: Type.Optional(Type.String()),
  note: Type.Optional(Type.String()),
  blockedBy: Type.Optional(Type.Array(Type.String())),
  status: Type.Optional(
    StringEnum(TASK_STATUSES, { description: 'For action=list, filter by task status.' }),
  ),
  limit: Type.Optional(Type.Number({ description: 'For action=list/history, maximum number of matching rows to show.' })),
  all: Type.Optional(Type.Boolean({ description: 'For action=list/history, show all matching tasks/history rows instead of the concise default.' })),
  includeMessages: Type.Optional(Type.Boolean({ description: 'For action=history, include compact task message refs. Defaults to true.' })),
})

export function registerTaskTools(pi: ExtensionAPI, deps: ToolHandlerDeps): void {
  pi.registerTool({
    name: 'agentteam_task',
    label: 'AgentTeam Task',
    description: 'Leader-gated shared task workflow plus read-only task/report history queries.',
    promptSnippet: 'Manage concise shared task facts plus v0.6.2 history with leader-gated mutations: create, assign, block, unblock, close, progress, report_done/report_blocked, list, show, history, reports, and report. Use progress for compact local TaskEvent activity; use report_done/report_blocked for durable TaskReport artifacts/action requests.',
    promptGuidelines: [
      'Use agentteam_task before delegation so teammate work is tracked by taskId.',
      'Use read-only actions show/history/reports/report to inspect compact task facts, TaskEvent progress/activity, TaskMessageRef indexes, report summaries, or one full TaskReport body without changing task state.',
      'For research→planning or other multi-role chains, use sequential leader-gated tasks: create/assign the research task first; after the TaskReport result is received/reviewed, create/assign or unblock the planner task. Do not rely on researcher inform messages or task reports to start planner work.',
      'Only team-lead should create, assign, factually block/unblock, close tasks, or change owners; planner is advisory by default, not a second leader.',
      'action=progress records compact TaskEvent progress/history only; it does not append legacy task-note rows, notify team-lead, create mailbox/projection/attention side effects, or add linked communication refs.',
      'Non-leader action=report_done is only for the current task owner: it creates a durable TaskReport and sends an owner-to-leader action request; it does not set task.status=done until leader close. Non-owners should use inform/question for context.',
      'Non-leader action=report_blocked is only for the current task owner: it creates a durable TaskReport and sends an owner-to-leader action request; it does not mutate task.status or blockedBy until leader review. Non-owners should use inform/question for context.',
      'Blocked tasks are non-actionable for worker assignment/delivery until team-lead unblocks them; leader close can still accept/close the task after review.',
    ],
    parameters: TeamTaskParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeTaskAction(params, ctx, deps)
    },
  })
}
