import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { StringEnum } from '@earendil-works/pi-ai'
import { Type } from 'typebox'
import type { ToolHandlerDeps } from './shared.js'
import { executeReceiveMessages, executeSendMessage } from './messageService.js'

const TeamSendParams = Type.Object({
  to: Type.Optional(Type.String({ description: 'Recipient member name or * for explicit broadcast; omit when taskId can safely route through task owner' })),
  message: Type.String({ description: 'Message content' }),
  summary: Type.Optional(Type.String({ description: 'Short summary preview' })),
  type: Type.Optional(
    StringEnum(['assignment', 'question', 'inform'] as const),
  ),
  taskId: Type.Optional(Type.String()),
  priority: Type.Optional(
    StringEnum(['low', 'normal', 'high'] as const),
  ),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
})

const TeamReceiveParams = Type.Object({
  markRead: Type.Optional(Type.Boolean({ default: true })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 8 })),
})

export function registerMessageTools(pi: ExtensionAPI, deps: ToolHandlerDeps): void {
  pi.registerTool({
    name: 'agentteam_send',
    label: 'AgentTeam Send',
    description: 'Send typed communication to one teammate, a task owner, or explicit broadcast within the current team.',
    promptSnippet: 'Send typed coordination messages such as assignment, question, or inform within the current team. Inform is context-only and does not wake by default. When taskId has an owner, to can be omitted for safe task-based routing. Task-bound sends keep the mailbox as source of truth and add only hidden audit refs/diagnostics.',
    promptGuidelines: [
      'Use agentteam_send after creating or assigning a shared task so the message can reference taskId when possible.',
      'For research→planning chains, leader should send the research assignment first, review the researcher report, then send a separate planner assignment/question with its own taskId; do not let worker inform messages drive planner work directly.',
      'When sending from leader about an owned task, you may omit to and let taskId route to the task owner; when the owner reports back on their task, omitting to routes to team-lead.',
      'Specify to when overriding task-owner routing; use to="*" only for intentional broadcast to everyone else.',
      'Use agentteam_send with type assignment for direct delegation, question for clarification, and inform for context-only handoffs.',
      'Task-bound agentteam_send is communication, not a task note: recipient mailbox remains source of truth; linked task refs and worker-to-worker diagnostics are hidden audit/index metadata and do not copy the full body.',
      'Prefer concise summaries in agentteam_send and keep long artifacts in shared task notes or files.',
    ],
    parameters: TeamSendParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeSendMessage(params, ctx, deps)
    },
  })

  pi.registerTool({
    name: 'agentteam_receive',
    label: 'AgentTeam Receive',
    description: 'Receive unread mailbox messages for the current team member. This is the full-text mailbox read boundary and can optionally mark returned messages as read. Multi-message human output is compactly grouped by task/thread while details.messages keeps full returned messages unchanged.',
    promptSnippet: 'Read unread agentteam mailbox messages for the current actor when you need the full text of teammate updates or leader instructions.',
    promptGuidelines: [
      'Use agentteam_receive when a teammate likely sent actionable updates, instead of guessing mailbox state from compact projections, attention wakes, or prompt reminders.',
      'When using agentteam_receive as the leader, synthesize the received updates into the next delegation or final user answer.',
    ],
    parameters: TeamReceiveParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeReceiveMessages(params, ctx, deps)
    },
  })
}
