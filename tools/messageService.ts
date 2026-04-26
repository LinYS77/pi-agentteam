import type { ExtensionContext } from '@mariozechner/pi-coding-agent'
import {
  defaultThreadIdForTask,
  normalizeMessageType,
  normalizePriority,
} from '../protocol.js'
import type { TeamMessageType } from '../types.js'
import type { ToolHandlerDeps } from './shared.js'
import {
  canSendMessageType,
  enforcePlannerSendPolicy,
  shouldMirrorMessageToLeader,
} from './messagePolicy.js'
import { TEAM_LEAD } from '../types.js'
import { appendPeerMessageEvent, deliverMessageToRecipient } from './messageDelivery.js'
import { executeReceiveMessages } from './messageReceive.js'
import type { MessageDeliveryState, TeamReceiveInput, TeamSendInput } from './messageTypes.js'

export type { TeamReceiveInput, TeamSendInput }
export { executeReceiveMessages }

async function mirrorPeerEscalationToLeaderIfNeeded(
  state: MessageDeliveryState,
): Promise<void> {
  if (!shouldMirrorMessageToLeader({
    sender: state.sender,
    sentRecipients: state.sent,
    messageType: state.messageType,
    leaderExists: Boolean(state.team.members[TEAM_LEAD]),
  })) {
    return
  }

  await deliverMessageToRecipient(state, TEAM_LEAD, {
    mirrorOf: state.sent.join(',') || state.params.to,
  })
}

export async function executeSendMessage(
  params: TeamSendInput,
  ctx: ExtensionContext,
  deps: ToolHandlerDeps,
) {
  const team = deps.ensureTeamForSession(ctx)
  if (!team) {
    return { content: [{ type: 'text', text: 'No current team context.' }], details: {} }
  }
  const sender = deps.currentActor(ctx)
  const recipients =
    params.to === '*'
      ? Object.values(team.members)
          .map(m => m.name)
          .filter(name => name !== sender)
      : [deps.sanitizeWorkerName(params.to)]
  const messageType: TeamMessageType = normalizeMessageType(params.type ?? 'question')
  const senderRole = (team.members[sender]?.role ?? '').trim().toLowerCase()
  const plannerPolicyDenied = enforcePlannerSendPolicy({
    senderRole,
    messageType,
    taskId: params.taskId,
  })
  if (plannerPolicyDenied) {
    return {
      content: [{ type: 'text', text: plannerPolicyDenied }],
      details: {
        denied: true,
        reason: 'planner_send_policy',
        sender,
        senderRole,
        type: messageType,
        taskId: params.taskId,
      },
    }
  }

  if (!canSendMessageType(sender, messageType)) {
    return {
      content: [{ type: 'text', text: `Message type ${messageType} is leader-only for non-leader actors` }],
      details: { denied: true, sender, type: messageType },
    }
  }

  const deliveryState: MessageDeliveryState = {
    team,
    deps,
    sender,
    params,
    messageType,
    resolvedThreadId: defaultThreadIdForTask(params.taskId),
    priority: normalizePriority(params.priority),
    metadata: params.metadata,
    sent: [],
    leaderMirrors: [],
    wakeByRecipient: [],
    skippedRecipients: [],
  }

  for (const recipient of recipients) {
    await deliverMessageToRecipient(deliveryState, recipient)
  }

  await mirrorPeerEscalationToLeaderIfNeeded(deliveryState)
  appendPeerMessageEvent(deliveryState)

  deps.invalidateStatus(ctx)
  const summary = deliveryState.sent.length > 0
    ? `Sent message to ${deliveryState.sent.join(', ')}`
    : 'Sent message to nobody'
  const skippedSummary = deliveryState.skippedRecipients.length > 0
    ? `; skipped ${deliveryState.skippedRecipients.map(item => `${item.recipient} (${item.reason})`).join(', ')}`
    : ''
  return {
    content: [{ type: 'text', text: `${summary}${skippedSummary}` }],
    details: {
      recipients: deliveryState.sent,
      skippedRecipients: deliveryState.skippedRecipients,
      type: messageType,
      wakeByRecipient: deliveryState.wakeByRecipient,
      priority: deliveryState.priority,
      taskId: params.taskId,
      threadId: deliveryState.resolvedThreadId,
      mirroredToLeader: deliveryState.leaderMirrors,
    },
  }
}
