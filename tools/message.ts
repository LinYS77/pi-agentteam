import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { StringEnum } from '@mariozechner/pi-ai'
import { Type } from 'typebox'
import type { ToolHandlerDeps } from './shared.js'
import { executeReceiveMessages, executeSendMessage } from './messageService.js'

const TeamSendParams = Type.Object({
  to: Type.String({ description: 'Recipient member name or * for broadcast' }),
  message: Type.String({ description: 'Message content' }),
  summary: Type.Optional(Type.String({ description: 'Short summary preview' })),
  type: Type.Optional(
    StringEnum(['assignment', 'question', 'blocked', 'completion_report', 'fyi'] as const),
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
    description: 'Send a typed message to one teammate or broadcast within the current team.',
    promptSnippet: 'Send typed coordination messages such as assignment, question, blocked, completion_report, or fyi within the current team.',
    promptGuidelines: [
      'Use agentteam_send after creating or claiming a shared task so the message can reference taskId when possible.',
      'Use agentteam_send with type assignment for direct delegation, question for clarification, blocked for escalation, completion_report for finished work, and fyi for lightweight handoffs.',
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
    description: 'Receive unread mailbox messages for the current team member. Optionally marks returned messages as read.',
    promptSnippet: 'Read unread agentteam mailbox messages for the current actor when you need teammate updates or leader instructions.',
    promptGuidelines: [
      'Use agentteam_receive when a teammate likely sent actionable updates, instead of guessing mailbox state.',
      'When using agentteam_receive as the leader, synthesize the received updates into the next delegation or final user answer.',
    ],
    parameters: TeamReceiveParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeReceiveMessages(params, ctx, deps)
    },
  })
}
