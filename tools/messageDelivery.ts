import {
  appendTeamEvent,
  pushMailboxMessage,
  updateTeamState,
} from '../state.js'
import {
  normalizeWakeHint,
  shouldWakeRecipient,
} from '../protocol.js'
import { TEAM_LEAD } from '../types.js'
import { oneLine } from '../utils.js'
import type { MessageDeliveryOptions, MessageDeliveryState } from './messageTypes.js'

export async function deliverMessageToRecipient(
  state: MessageDeliveryState,
  recipient: string,
  options?: MessageDeliveryOptions,
): Promise<void> {
  const {
    team,
    deps,
    sender,
    params,
    messageType,
    resolvedThreadId,
    priority,
    metadata,
    sent,
    leaderMirrors,
    wakeByRecipient,
    skippedRecipients,
  } = state

  if (!recipient) {
    skippedRecipients.push({ recipient: params.to, reason: 'recipient name is empty after normalization' })
    return
  }
  if (!team.members[recipient]) {
    skippedRecipients.push({ recipient, reason: 'member not found in current team' })
    return
  }

  const target = team.members[recipient]
  const defaultWakeHint = normalizeWakeHint(messageType, undefined, recipient)
  const wakeHint =
    defaultWakeHint === 'none' &&
    messageType === 'fyi' &&
    sender !== TEAM_LEAD &&
    recipient !== TEAM_LEAD &&
    target?.status !== 'running'
      ? 'soft'
      : defaultWakeHint
  wakeByRecipient.push({ recipient, wakeHint })

  const sentMessage = pushMailboxMessage(team.name, recipient, {
    from: sender,
    to: recipient,
    text: params.message,
    summary: params.summary,
    type: messageType,
    taskId: params.taskId,
    threadId: resolvedThreadId,
    priority,
    wakeHint,
    metadata: options?.mirrorOf
      ? { ...(metadata ?? {}), mirrorOf: options.mirrorOf }
      : metadata,
  })

  if (params.taskId) {
    updateTeamState(team.name, latest => {
      const task = latest.tasks[params.taskId!]
      if (!task) return
      deps.maybeLinkTaskNoteToMessage(task, sender, {
        text: params.message,
        type: messageType,
        taskId: params.taskId,
        threadId: resolvedThreadId,
        metadata: {
          ...(metadata ?? {}),
          to: recipient,
          linkedMailboxMessageId: sentMessage.id,
          ...(options?.mirrorOf ? { mirrorOf: options.mirrorOf } : {}),
        },
      })
    })
  }

  if (shouldWakeRecipient(wakeHint)) {
    if (recipient === TEAM_LEAD) {
      await deps.wakeLeaderIfNeeded(team, {
        type: messageType,
        wakeHint,
        from: sender,
        summary: params.summary,
        text: params.message,
      })
    } else if (target?.status !== 'running') {
      await deps.wakeWorker(team, recipient)
    }
  }

  if (options?.mirrorOf) {
    leaderMirrors.push(options.mirrorOf)
  } else {
    sent.push(recipient)
  }
}

export function appendPeerMessageEvent(state: MessageDeliveryState): void {
  const { team, sender, sent, messageType, params, resolvedThreadId, priority } = state
  const peerRecipients = sent.filter(name => name !== TEAM_LEAD)
  if (sender === TEAM_LEAD || peerRecipients.length === 0) return

  const eventText = oneLine(`${messageType} -> ${peerRecipients.join(', ')}: ${params.summary ?? params.message}`)
  const eventMetadata = {
    recipients: peerRecipients,
    taskId: params.taskId,
    threadId: resolvedThreadId,
    type: messageType,
    priority,
  }
  updateTeamState(team.name, latest => {
    appendTeamEvent(latest, {
      type: 'peer_message',
      by: sender,
      text: eventText,
      metadata: eventMetadata,
    })
  })
}
