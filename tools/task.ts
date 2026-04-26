import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { StringEnum } from '@mariozechner/pi-ai'
import { Type } from 'typebox'
import type { ToolHandlerDeps } from './shared.js'
import { executeTaskAction } from './taskService.js'

const TeamTaskParams = Type.Object({
  action: StringEnum(['create', 'list', 'claim', 'update', 'complete', 'note'] as const),
  taskId: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  owner: Type.Optional(Type.String()),
  status: Type.Optional(
    StringEnum(['pending', 'in_progress', 'blocked', 'completed'] as const),
  ),
  note: Type.Optional(Type.String()),
  blockedBy: Type.Optional(Type.Array(Type.String())),
})

export function registerTaskTools(pi: ExtensionAPI, deps: ToolHandlerDeps): void {
  pi.registerTool({
    name: 'agentteam_task',
    label: 'AgentTeam Task',
    description: 'Create, list, claim, update, annotate, and complete shared team tasks.',
    promptSnippet: 'Manage the shared agentteam task board: create, list, claim, update, note, and complete tasks.',
    promptGuidelines: [
      'Use agentteam_task before delegation so teammate work is tracked by taskId.',
      'Use agentteam_task action=create for concrete work items, action=claim to assign an owner, action=note for durable findings, and action=complete for explicit completion reports.',
      'When reporting implementation completion through agentteam_task, include files changed and checks run in the note when possible.',
    ],
    parameters: TeamTaskParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeTaskAction(params, ctx, deps)
    },
  })
}
