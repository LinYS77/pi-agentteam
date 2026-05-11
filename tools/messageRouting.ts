import { TEAM_LEAD } from '../types.js'
import type { TeamState } from '../types.js'
import type { ToolHandlerDeps } from './shared.js'
import type { TeamSendInput } from './messageTypes.js'

export type MessageRoutingMode = 'explicit' | 'broadcast' | 'task_owner' | 'owner_to_leader'

export type MessageRoutingDetails = {
  mode: MessageRoutingMode
  reason: string
  explicitTo?: string
  resolvedRecipient?: string
  taskId?: string
  taskOwner?: string
}

export type MessageRoutingErrorReason =
  | 'missing_recipient'
  | 'task_not_found'
  | 'task_owner_missing'
  | 'task_owner_member_not_found'
  | 'task_owner_is_leader'
  | 'task_sender_not_owner'
  | 'leader_member_not_found'

export type MessageRoutingErrorDetails = {
  denied: true
  reason: MessageRoutingErrorReason
  sender: string
  taskId?: string
  taskOwner?: string
}

export type MessageRoutingResult =
  | {
      ok: true
      recipients: string[]
      routing: MessageRoutingDetails
    }
  | {
      ok: false
      text: string
      details: MessageRoutingErrorDetails
    }

function routingError(input: {
  reason: MessageRoutingErrorReason
  text: string
  sender: string
  taskId?: string
  taskOwner?: string
}): MessageRoutingResult {
  return {
    ok: false,
    text: input.text,
    details: {
      denied: true,
      reason: input.reason,
      sender: input.sender,
      taskId: input.taskId,
      taskOwner: input.taskOwner,
    },
  }
}

export function resolveMessageRecipients(input: {
  team: TeamState
  sender: string
  params: TeamSendInput
  deps: Pick<ToolHandlerDeps, 'sanitizeWorkerName'>
}): MessageRoutingResult {
  const { team, sender, params, deps } = input

  if (params.to !== undefined) {
    if (params.to === '*') {
      return {
        ok: true,
        recipients: Object.values(team.members)
          .map(member => member.name)
          .filter(name => name !== sender),
        routing: {
          mode: 'broadcast',
          reason: 'explicit broadcast recipient',
          explicitTo: params.to,
        },
      }
    }

    const resolvedRecipient = deps.sanitizeWorkerName(params.to)
    return {
      ok: true,
      recipients: [resolvedRecipient],
      routing: {
        mode: 'explicit',
        reason: 'explicit recipient',
        explicitTo: params.to,
        resolvedRecipient,
      },
    }
  }

  if (!params.taskId) {
    return routingError({
      reason: 'missing_recipient',
      sender,
      text: 'agentteam_send requires `to` unless taskId can safely route to a task owner or back to team-lead.',
    })
  }

  const task = team.tasks[params.taskId]
  if (!task) {
    return routingError({
      reason: 'task_not_found',
      sender,
      taskId: params.taskId,
      text: `Task ${params.taskId} not found. Specify a recipient with to or use an existing taskId.`,
    })
  }

  const owner = task.owner
  if (!owner) {
    return routingError({
      reason: 'task_owner_missing',
      sender,
      taskId: params.taskId,
      text: `Task ${params.taskId} has no owner. Assign an owner first or specify to explicitly.`,
    })
  }

  if (!team.members[owner]) {
    return routingError({
      reason: 'task_owner_member_not_found',
      sender,
      taskId: params.taskId,
      taskOwner: owner,
      text: `Task ${params.taskId} owner ${owner} is not in the current team. Reassign the task or specify to explicitly.`,
    })
  }

  if (sender === TEAM_LEAD) {
    if (owner === TEAM_LEAD) {
      return routingError({
        reason: 'task_owner_is_leader',
        sender,
        taskId: params.taskId,
        taskOwner: owner,
        text: `Task ${params.taskId} is owned by team-lead. Assign a teammate owner or specify to explicitly.`,
      })
    }

    return {
      ok: true,
      recipients: [owner],
      routing: {
        mode: 'task_owner',
        reason: `task ${params.taskId} owner ${owner}`,
        taskId: params.taskId,
        taskOwner: owner,
        resolvedRecipient: owner,
      },
    }
  }

  if (sender === owner) {
    if (!team.members[TEAM_LEAD]) {
      return routingError({
        reason: 'leader_member_not_found',
        sender,
        taskId: params.taskId,
        taskOwner: owner,
        text: `Cannot route ${params.taskId} back to team-lead because team-lead is missing from the current team.`,
      })
    }

    return {
      ok: true,
      recipients: [TEAM_LEAD],
      routing: {
        mode: 'owner_to_leader',
        reason: `sender ${sender} owns task ${params.taskId}; routed to team-lead`,
        taskId: params.taskId,
        taskOwner: owner,
        resolvedRecipient: TEAM_LEAD,
      },
    }
  }

  return routingError({
    reason: 'task_sender_not_owner',
    sender,
    taskId: params.taskId,
    taskOwner: owner,
    text: `Task ${params.taskId} is owned by ${owner}. Specify to explicitly if ${sender} should message someone about it.`,
  })
}
