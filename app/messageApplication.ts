import {
  decideMessagePolicy,
  type MessagePolicyAudienceKind,
} from '../core/messagePolicy.js'
import { MESSAGE_TYPES, isMessageType, isTaskReportType, type MessageType, type TaskReportType } from '../core/publicModel.js'
import { defaultThreadIdForTask, normalizePriority } from '../protocol.js'
import { TEAM_LEAD, type MailboxMessage, type TeamMessageWakeHint, type TeamState } from '../internalTypes.js'
import { oneLine } from '../utils.js'
import { outboxHash } from './outbox.js'
import { resolveMessageRecipients } from './messageRouting.js'
import {
  mailboxMessageIdForEffect,
  runSelectedOutboxEffects,
} from './outboxSideEffects.js'
import type { MessageApplicationDeps } from './types.js'
import { taskAssignmentNonActionableReason } from './taskActionability.js'
import type {
  MessageAttentionPolicy,
  MessageSideEffectWarning,
  PlannedTaskReportEffects,
  SendMessageApplicationInput,
  SendMessageApplicationResult,
  SendMessageInput,
  SendMessagePlanningState,
  SendMessageWakeDetail,
  SendMessageType,
  TaskReportAttentionPlan,
} from './messageTypes.js'

export type {
  MessageAttentionPolicy,
  MessageSideEffectWarning,
  PlannedTaskLeaderAttention,
  PlannedTaskReportEffects,
  SendMessageApplicationInput,
  SendMessageApplicationResult,
  SendMessageInput,
  SendMessageWakeDetail,
  SendMessageType,
  TaskReportAttentionPlan,
} from './messageTypes.js'

type SendDeniedResult = SendMessageApplicationResult & {
  details: SendMessageApplicationResult['details'] & { denied: true }
}

function recipientKind(recipient?: string): MessagePolicyAudienceKind {
  if (!recipient) return 'unknown'
  return recipient === TEAM_LEAD ? 'leader' : 'worker'
}

export function decideSendMessageAttentionPolicy(input: {
  messageType: MessageType
  recipient?: string
}): MessageAttentionPolicy {
  return decideMessagePolicy({
    kind: 'message',
    messageType: input.messageType,
    recipientKind: recipientKind(input.recipient),
  })
}

export function decideTaskReportAttentionPolicy(input: {
  reportType: TaskReportType
}): MessageAttentionPolicy {
  return decideMessagePolicy({
    kind: 'task_report',
    reportType: input.reportType,
    recipientKind: 'leader',
  })
}

export function canSendMessageType(actor: string, type: string): boolean {
  if (!isMessageType(type)) return false
  if (actor === TEAM_LEAD) return true
  return decideSendMessageAttentionPolicy({ messageType: type }).intent !== 'worker_delivery'
}

export function isLeaderAttentionPolicySource(type: string): boolean {
  if (isTaskReportType(type)) {
    return decideTaskReportAttentionPolicy({ reportType: type }).intent === 'leader_attention'
  }
  if (isMessageType(type)) {
    return decideSendMessageAttentionPolicy({ messageType: type, recipient: TEAM_LEAD }).intent === 'leader_attention'
  }
  return false
}

export function planTaskReportAttention(type: TaskReportType): TaskReportAttentionPlan {
  const policy = decideTaskReportAttentionPolicy({ reportType: type })
  return {
    type,
    policy,
    wakeHint: policy.wakeHint,
    metadata: { policyIntent: policy.intent },
  }
}

export function planTaskReportEffects(input: {
  wakeTeam?: TeamState
  leaderWake?: {
    type: string
    wakeHint: TeamMessageWakeHint
    from: string
    summary: string
    text: string
    messageId?: string
    taskId?: string
    threadId?: string
  }
  mailboxDelivered?: boolean
  mailboxMessageId?: string
  leaderMailboxRequired?: boolean
}): PlannedTaskReportEffects {
  if (!input.wakeTeam || !input.leaderWake || !isTaskReportType(input.leaderWake.type)) return {}
  if (input.leaderMailboxRequired && !input.mailboxDelivered) return {}
  const plan = planTaskReportAttention(input.leaderWake.type)
  if (!plan.policy.shouldWake || plan.policy.intent !== 'leader_attention') return {}
  return {
    leaderAttention: {
      kind: 'requestLeaderAttention',
      team: input.wakeTeam,
      message: {
        ...input.leaderWake,
        type: input.leaderWake.type,
        wakeHint: plan.wakeHint,
        messageId: input.mailboxMessageId,
      },
    },
  }
}

function unsupportedSendType(sender: string, type: string): SendDeniedResult {
  return {
    text: `Message type ${type} is not available in the send schema. Allowed types: ${MESSAGE_TYPES.join(', ')}.`,
    details: { denied: true, reason: 'unsupported_message_type', sender, type },
  }
}

function formatRoutingSuffix(state: Pick<SendMessagePlanningState, 'routing'>): string {
  const { routing } = state
  if (routing.mode === 'task_owner') return ` via task ${routing.taskId} owner ${routing.taskOwner}`
  if (routing.mode === 'owner_to_leader') return ` via task ${routing.taskId} owner-to-leader routing`
  if (routing.mode === 'broadcast') return ' via explicit broadcast'
  return ''
}

function compactDiagnosticText(text: string | undefined, max = 120): string | undefined {
  if (!text) return undefined
  const compact = oneLine(text)
  if (compact.length <= max) return compact
  return `${compact.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function compactPeerEventText(input: {
  messageType: MessageType
  recipients: string[]
  taskId?: string
  threadId?: string
  summary?: string
}): string {
  const parts = [
    'diagnostic peer message ref',
    `type=${input.messageType}`,
    `to=${input.recipients.join(',')}`,
  ]
  if (input.taskId) parts.push(`task=${input.taskId}`)
  if (input.threadId) parts.push(`thread=${input.threadId}`)
  const summary = compactDiagnosticText(input.summary)
  if (summary) parts.push(`summary=${summary}`)
  return parts.join(' ')
}

async function applyMessageOutboxRun(state: SendMessagePlanningState, deps: MessageApplicationDeps, effectIds: string[]) {
  const selected = await runSelectedOutboxEffects({
    teamName: state.team.name,
    workerId: 'message-application',
    limit: effectIds.length || 1,
    effectIds,
  }, deps)
  state.outboxRun = selected.run
  state.sideEffectWarnings.push(...selected.warnings)
  state.outboxEffects.push(...selected.records.filter(record => 'kind' in record))
  return selected
}

async function deliverMessageToRecipient(
  state: SendMessagePlanningState,
  recipient: string,
  deps: MessageApplicationDeps,
  options?: { mirrorOf?: string },
): Promise<void> {
  const {
    team,
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
    skippedRecipients.push({ recipient: params.to ?? '', reason: 'recipient name is empty after normalization' })
    return
  }
  if (!team.members[recipient]) {
    skippedRecipients.push({ recipient, reason: 'member not found in current team' })
    return
  }

  const policy = decideSendMessageAttentionPolicy({ messageType, recipient })
  const wakeHint = policy.wakeHint
  const wakeDetails: SendMessageWakeDetail = {
    recipient,
    wakeHint,
    policyIntent: policy.intent,
    policyReason: policy.reason,
  }
  wakeByRecipient.push(wakeDetails)

  const mailboxIdempotencyKey = [
    'send-mailbox',
    team.name,
    sender,
    recipient,
    messageType,
    params.taskId ?? '',
    resolvedThreadId ?? '',
    options?.mirrorOf ?? '',
    params.summary ?? '',
    outboxHash(params.message),
  ].join(':')
  const mailboxEffect = deps.outboxStore.enqueue({
    teamName: team.name,
    kind: 'inbox_item_append_requested',
    idempotencyKey: mailboxIdempotencyKey,
    payload: {
      teamName: team.name,
      recipient,
      message: {
        id: mailboxMessageIdForEffect(`outbox-pending-${mailboxIdempotencyKey}`),
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
      },
    },
  })
  const deterministicMailboxId = mailboxMessageIdForEffect(mailboxEffect.effectId)
  mailboxEffect.payload.message.id = deterministicMailboxId
  const mailboxSelected = await applyMessageOutboxRun(state, deps, [mailboxEffect.effectId])
  const mailboxResult = mailboxSelected.byId[mailboxEffect.effectId]?.result
  const mailboxSucceeded = Boolean(mailboxResult?.ok)
  if (!mailboxSucceeded) {
    const reason = mailboxResult?.error ?? 'failed to push mailbox message'
    wakeDetails.ok = false
    wakeDetails.reason = reason
    wakeDetails.error = reason
    wakeDetails.method = 'failed'
    skippedRecipients.push({ recipient, reason })
    return
  }
  const sentMessage = (mailboxResult?.value ?? { id: deterministicMailboxId }) as NonNullable<SendMessagePlanningState['sentMessages'][string]>
  state.sentMessages[recipient] = sentMessage

  if (params.taskId) {
    const taskMessageRefEffect = deps.outboxStore.enqueue({
      teamName: team.name,
      kind: 'task_message_ref_append_requested',
      idempotencyKey: ['send-task-message-ref', team.name, params.taskId, sentMessage.id].join(':'),
      payload: {
        teamName: team.name,
        taskId: params.taskId,
        mailboxMessageId: sentMessage.id,
        from: sender,
        to: recipient,
        type: messageType,
        createdAt: sentMessage.createdAt,
        threadId: resolvedThreadId ?? defaultThreadIdForTask(params.taskId),
        summary: params.summary,
        priority,
        wakeHint,
        metadata: {
          source: 'agentteam_send',
          compact: true,
          ...(options?.mirrorOf ? { mirrorOf: options.mirrorOf } : {}),
        },
      },
      dependsOn: [mailboxEffect.effectId],
    })
    await applyMessageOutboxRun(state, deps, [taskMessageRefEffect.effectId])
  }

  if (policy.shouldWake) {
    if (policy.intent === 'leader_attention' && recipient === TEAM_LEAD) {
      const attentionEffect = deps.outboxStore.enqueue({
        teamName: team.name,
        kind: 'leader_attention_requested',
        idempotencyKey: ['send-leader-attention', team.name, sentMessage.id, messageType, params.taskId ?? ''].join(':'),
        payload: {
          teamName: team.name,
          message: {
            type: messageType,
            wakeHint,
            from: sender,
            summary: params.summary,
            text: params.message,
            messageId: sentMessage.id,
            taskId: params.taskId,
            threadId: resolvedThreadId,
          },
        },
      })
      const selected = await applyMessageOutboxRun(state, deps, [attentionEffect.effectId])
      const attentionResult = selected.byId[attentionEffect.effectId]?.result
      const attentionResultValue = attentionResult?.value
      const deliveryResult = attentionResult?.ok && attentionResultValue
        ? attentionResultValue as Awaited<ReturnType<typeof deps.requestLeaderAttentionIfNeeded>>
        : {
            ok: false as const,
            recipient,
            wakeHint,
            reason: attentionResult?.error ?? 'leader attention side effect failed',
            error: attentionResult?.error,
            method: 'leader_attention_requested' as const,
          }
      wakeDetails.attempted = false
      wakeDetails.ok = deliveryResult.ok
      wakeDetails.reason = deliveryResult.reason
      if (deliveryResult.method) wakeDetails.method = deliveryResult.method
      if ('error' in deliveryResult && deliveryResult.error) wakeDetails.error = deliveryResult.error
      if (deliveryResult.requestId) wakeDetails.requestId = deliveryResult.requestId
    } else if (policy.intent === 'worker_delivery' || policy.intent === 'recipient_attention') {
      const deliveryEffect = deps.outboxStore.enqueue({
        teamName: team.name,
        kind: 'worker_delivery_requested',
        idempotencyKey: ['send-worker-delivery', team.name, recipient, sentMessage.id, policy.intent].join(':'),
        payload: {
          teamName: team.name,
          memberName: recipient,
          options: {
            messageIds: [sentMessage.id],
            requestedBy: sender,
            reason: policy.reason,
            wakeHint,
          },
        },
      })
      const selected = await applyMessageOutboxRun(state, deps, [deliveryEffect.effectId])
      const selectedDelivery = selected.byId[deliveryEffect.effectId]
      const deliveryResultValue = selectedDelivery?.result.value
      const deliveryResult = selectedDelivery?.result.ok && deliveryResultValue
        ? deliveryResultValue as Awaited<ReturnType<typeof deps.requestWorkerDelivery>>
        : {
            ok: false as const,
            recipient,
            wakeHint,
            reason: selectedDelivery?.result.error ?? 'worker delivery side effect failed',
            error: selectedDelivery?.result.error,
            method: 'bridge_requested' as const,
          }
      wakeDetails.attempted = false
      wakeDetails.ok = deliveryResult.ok
      wakeDetails.reason = deliveryResult.reason
      if (deliveryResult.method) wakeDetails.method = deliveryResult.method
      if ('error' in deliveryResult && deliveryResult.error) wakeDetails.error = deliveryResult.error
      if (deliveryResult.requestId) wakeDetails.requestId = deliveryResult.requestId
      if (!wakeDetails.requestId && deliveryResultValue && typeof deliveryResultValue === 'object' && 'requestId' in deliveryResultValue) {
        const requestId = (deliveryResultValue as { requestId?: unknown }).requestId
        if (typeof requestId === 'string') wakeDetails.requestId = requestId
      }
      if (!wakeDetails.requestId && policy.intent === 'worker_delivery') {
        const storedResult = selectedDelivery?.result.storedEffect?.result
        if (storedResult && typeof storedResult === 'object' && 'requestId' in storedResult) {
          const requestId = (storedResult as { requestId?: unknown }).requestId
          if (typeof requestId === 'string') wakeDetails.requestId = requestId
        }
        if (!wakeDetails.requestId && selectedDelivery && 'kind' in selectedDelivery.record) wakeDetails.requestId = deliveryEffect.effectId
      }
    }
  }

  if (options?.mirrorOf) leaderMirrors.push(options.mirrorOf)
  else sent.push(recipient)
}

async function appendPeerMessageEvent(state: SendMessagePlanningState, deps: MessageApplicationDeps): Promise<void> {
  const { team, sender, sent, messageType, params, resolvedThreadId, priority } = state
  const peerRecipients = sent.filter(name => name !== TEAM_LEAD)
  if (sender === TEAM_LEAD || peerRecipients.length === 0) return

  const linkedMessageIds = Object.fromEntries(
    peerRecipients
      .map(recipient => [recipient, state.sentMessages[recipient]?.id] as const)
      .filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string' && entry[1].length > 0),
  )
  const eventText = compactPeerEventText({
    messageType,
    recipients: peerRecipients,
    taskId: params.taskId,
    threadId: resolvedThreadId,
    summary: params.summary,
  })
  const eventMetadata = {
    kind: 'diagnostic_ref',
    sourceKind: 'worker_peer_message_ref',
    displayMode: 'hidden',
    diagnostic: true,
    hidden: true,
    compact: true,
    recipients: peerRecipients,
    taskId: params.taskId,
    threadId: resolvedThreadId,
    type: messageType,
    priority,
    from: sender,
    to: peerRecipients,
    linkedIds: {
      mailboxMessageIds: linkedMessageIds,
      ...(params.taskId ? { taskId: params.taskId } : {}),
      ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
    },
    summary: params.summary,
  }
  const eventEffect = deps.outboxStore.enqueue({
    teamName: team.name,
    kind: 'append_event_requested',
    idempotencyKey: ['send-peer-event', team.name, sender, peerRecipients.join(','), Object.values(linkedMessageIds).join(','), messageType, params.taskId ?? '', resolvedThreadId ?? '', params.summary ?? '', outboxHash(params.message)].join(':'),
    payload: {
      teamName: team.name,
      event: {
        type: 'diagnostic_peer_message_ref',
        by: sender,
        text: eventText,
        metadata: eventMetadata,
      },
    },
  })
  await applyMessageOutboxRun(state, deps, [eventEffect.effectId])
}

export async function executeSendMessageApplication(
  input: SendMessageApplicationInput,
  deps: MessageApplicationDeps,
): Promise<SendMessageApplicationResult> {
  const { params, context } = input
  const { team, actor: sender } = context
  const rawType = (params.type ?? 'question') as string
  if (!isMessageType(rawType)) return unsupportedSendType(sender, rawType)
  const messageType: MessageType = rawType

  if (!canSendMessageType(sender, messageType)) {
    return {
      text: `Message type ${messageType} is leader-only for non-leader actors`,
      details: { denied: true, sender, type: messageType },
    }
  }

  if (messageType === 'assignment' && params.taskId) {
    const task = team.tasks[params.taskId]
    if (task) {
      const reason = taskAssignmentNonActionableReason(task)
      if (reason) {
        return {
          text: `Cannot send assignment for ${task.id}: task is not actionable (${reason}).`,
          details: {
            denied: true,
            reason,
            sender,
            type: messageType,
            taskId: task.id,
            status: task.status,
            blockedBy: task.blockedBy,
          },
        }
      }
    }
  }

  const resolvedRecipients = resolveMessageRecipients({
    team,
    sender,
    params,
    sanitizeWorkerName: deps.sanitizeWorkerName,
  })
  if (resolvedRecipients.ok === false) {
    return {
      text: resolvedRecipients.text,
      details: { ...resolvedRecipients.details, type: messageType },
    }
  }

  const state: SendMessagePlanningState = {
    team,
    sender,
    params,
    messageType,
    resolvedThreadId: defaultThreadIdForTask(params.taskId),
    priority: normalizePriority(params.priority),
    metadata: params.metadata,
    routing: resolvedRecipients.routing,
    recipients: resolvedRecipients.recipients,
    sent: [],
    leaderMirrors: [],
    wakeByRecipient: [],
    skippedRecipients: [],
    sentMessages: {},
    sideEffectWarnings: [],
    outboxEffects: [],
  }

  for (const recipient of state.recipients) {
    await deliverMessageToRecipient(state, recipient, deps)
  }

  await appendPeerMessageEvent(state, deps)

  const routingSuffix = state.sent.length > 0 ? formatRoutingSuffix(state) : ''
  const summary = state.sent.length > 0
    ? `Sent message to ${state.sent.join(', ')}${routingSuffix}`
    : 'Sent message to nobody'
  const skippedSummary = state.skippedRecipients.length > 0
    ? `; skipped ${state.skippedRecipients.map(item => `${item.recipient} (${item.reason})`).join(', ')}`
    : ''
  const warningSummary = state.sideEffectWarnings.length > 0
    ? `; warning side effects failed: ${state.sideEffectWarnings.map(item => `${item.kind}${item.error ? ` ${item.error}` : ''}`).join(', ')}`
    : ''
  return {
    text: `${summary}${skippedSummary}${warningSummary}`,
    details: {
      recipients: state.sent,
      skippedRecipients: state.skippedRecipients,
      type: messageType,
      wakeByRecipient: state.wakeByRecipient,
      priority: state.priority,
      taskId: params.taskId,
      threadId: state.resolvedThreadId,
      routing: state.routing,
      mirroredToLeader: state.leaderMirrors,
      outboxEffects: state.outboxEffects,
      ...(state.outboxRun ? { outboxRun: state.outboxRun } : {}),
      ...(state.sideEffectWarnings.length > 0 ? { warning: 'side_effect_failed', sideEffectWarnings: state.sideEffectWarnings } : {}),
    },
    statusInvalidationRequested: true,
  }
}
